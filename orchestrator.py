"""
orchestrator.py
===============
The single coordination layer for all agent interactions.

WHY THIS EXISTS:
  Previously, app.py called agents directly inline inside each route.
  This meant: duplicated logic, hard to test, hard to modify the pipeline.

  The orchestrator owns the PIPELINE:
    "For a given event (start / answer / mentor_turn / report),
     call the correct agents in the correct order,
     pass the right data between them,
     and return a clean result dict to app.py"

  app.py becomes thin: receive HTTP request → call orchestrator → return JSON.
  Agents stay pure: they receive input, return output, know nothing about HTTP.

PIPELINE OVERVIEW:
  ┌─────────────────────────────────────────────────────┐
  │ start_interview()                                   │
  │   Agent 1 → JD Analyzer     (analyze_jd)           │
  │   RAG     → Build index      (if PDF)               │
  │   Agent 2 → Question Gen     (generate_question)   │
  └─────────────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────────────┐
  │ process_answer()                                    │
  │   Agent 3 → Evaluator        (evaluate)            │
  │   Agent 4 → Profiler         (profile)             │
  │   Agent 5 → Controller       (adjust)              │
  │   Dedup   → Register Q       (register)            │
  │   Store   → Append turn      (append_turn)         │
  │   Agent 2 → Next Question    (generate_question)   │
  └─────────────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────────────┐
  │ start_mentor()  /  mentor_turn()                    │
  │   Agent 6 → Socratic Mentor  (mentor_question)     │
  │   — Unlimited chatbot mode, topic cycling          │
  │   — 12-second idle timer when all areas covered    │
  └─────────────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────────────┐
  │ generate_report()                                   │
  │   Store   → get_full_history                        │
  │   Agent 7 → Final Feedback   (generate_final_...)  │
  └─────────────────────────────────────────────────────┘
"""

import asyncio
import time
from agents.jd_analyzer         import analyze_jd
from agents.question_generator  import generate_question
from agents.evaluation_agent    import evaluate
from agents.reasoning_profiler  import profile, fingerprint_to_ui_scores
from agents.adaptive_controller import adjust, get_performance_trend
from agents.socratic_mentor     import mentor_question, get_question_budget
from agents.final_feedback_agent import generate_final_feedback, build_per_question_feedback
from store.session_store         import (
    new_session, get, save, exists, append_turn, get_full_history
)
from rag.question_dedup          import is_duplicate, register as register_question
from rag.pdf_rag                 import (
    build_rag_index, get_context_for_question,
    summarise_for_jd_analyzer, get_keywords, JDRagIndex
)
try:
    from config import DEFAULT_DIFFICULTY, MENTOR_REVEAL_THRESHOLD
except ImportError:
    DEFAULT_DIFFICULTY = "medium"
    MENTOR_REVEAL_THRESHOLD = 3

# ── In-memory RAG index store: session_id → JDRagIndex ───────────────────────
_RAG_INDEXES: dict[str, JDRagIndex] = {}


# ─────────────────────────────────────────────────────────────────────────────
# 1. START INTERVIEW
# ─────────────────────────────────────────────────────────────────────────────

async def start_interview(
    session_id: str,
    domain: str,
    jd_text: str,
    pdf_text: str,
    num_questions: int,
    scenario_mode: str,
) -> dict:
    t0 = time.time()

    rag_index  = None
    rag_used   = False
    jd_for_llm = jd_text

    if pdf_text and len(pdf_text.strip()) > 100:
        print(f"[Orchestrator] Building RAG index from PDF ({len(pdf_text)} chars)…")
        rag_index  = await build_rag_index(pdf_text)
        rag_used   = True
        rag_summary = summarise_for_jd_analyzer(rag_index)
        if domain:
            jd_for_llm = f"FOCUS AREA: {domain}\n\n{rag_summary}"
        else:
            jd_for_llm = rag_summary
        _RAG_INDEXES[session_id] = rag_index
        print(f"[Orchestrator] RAG ready: {len(rag_index.keywords)} keywords extracted")

    jd_data = await analyze_jd(domain=domain, jd_text=jd_for_llm)

    if rag_index and rag_index.topics:
        existing_topics = set(jd_data.get("topics", []))
        for t in rag_index.topics:
            if t not in existing_topics and len(jd_data["topics"]) < 6:
                jd_data["topics"].append(t)

    if domain and domain not in jd_data.get("topics", []):
        jd_data.setdefault("topics", []).insert(0, domain)
    elif domain and domain in jd_data.get("topics", []):
        topics = jd_data["topics"]
        topics.insert(0, topics.pop(topics.index(domain)))

    session = new_session(session_id, jd_data, num_questions, scenario_mode)
    session["pdf_used"]    = rag_used
    session["pdf_text"]    = pdf_text if rag_used else ""
    session["rag_context"] = rag_index.to_dict() if rag_index else None

    rag_ctx = ""
    if rag_index:
        rag_ctx = get_context_for_question(
            rag_index,
            topic=jd_data["topics"][0] if jd_data.get("topics") else "",
            subtopic="",
        )

    q_result = await generate_question(
        jd_data=jd_data,
        fingerprint=session["fingerprint"],
        current_difficulty=session["difficulty"],
        history=[],
        scenario_mode=scenario_mode,
        round_index=1,
        questions_asked=[],
        rag_context=rag_ctx,
    )
    first_question = q_result["question"]

    register_question(first_question, q_result.get("topic", domain))

    session["current_question"] = first_question
    session["questions_asked"].append(first_question)
    session["difficulty_history"].append(session["difficulty"])
    save(session)

    elapsed = round(time.time() - t0, 2)
    print(f"[Orchestrator] Session {session_id} started in {elapsed}s | topic={jd_data.get('role')}")

    return {
        "session_id":    session_id,
        "question":      first_question,
        "jd_data":       jd_data,
        "difficulty":    session["difficulty"],
        "max_questions": num_questions,
        "rag_active":    rag_used,
        "keywords":      get_keywords(rag_index)[:10] if rag_index else [],
    }


# ─────────────────────────────────────────────────────────────────────────────
# 2. PROCESS ANSWER
# ─────────────────────────────────────────────────────────────────────────────

async def process_answer(session_id: str, answer: str) -> dict:
    session = get(session_id)
    if not session:
        return {"error": "Session not found"}

    question     = session["current_question"]
    jd_data      = session["jd_data"]
    current_diff = session["difficulty"]
    round_index  = session["current_index"] + 1

    t0 = time.time()

    evaluation = await evaluate(question=question, answer=answer, jd_data=jd_data)
    score_10   = evaluation.get("score", 5)
    print(f"[Orchestrator] Eval Q{round_index}: score={score_10} | {evaluation.get('correctness')} | weak={evaluation.get('weak_area')}")

    fingerprint = await profile(
        question=question,
        answer=answer,
        evaluation=evaluation,
        previous_fingerprint=session["fingerprint"],
        current_difficulty=current_diff,
    )
    session["fingerprint"] = fingerprint

    ctrl         = await adjust(fingerprint, evaluation, current_diff)
    new_diff     = ctrl["next_difficulty"]
    session["difficulty"] = new_diff

    # FIX: capture current_index BEFORE incrementing so topic selection is correct
    _current_idx = session["current_index"]
    _topics = jd_data.get("topics", [""])
    _topic_for_turn = _topics[_current_idx % max(len(_topics), 1)]

    append_turn(
        session=session,
        question=question,
        answer=answer,
        evaluation=evaluation,
        fingerprint=dict(fingerprint),
        difficulty=current_diff,
        topic=_topic_for_turn,
    )
    session["current_index"] += 1
    elapsed = round(time.time() - t0, 2)
    print(f"[Orchestrator] Pipeline done in {elapsed}s | {current_diff}→{new_diff}")

    ui_scores        = fingerprint_to_ui_scores(fingerprint)
    ui_scores["acc"] = min(100, score_10 * 10)

    if session["current_index"] >= session["max_questions"]:
        session["status"] = "mentor"
        save(session)
        return {
            "completed":   True,
            "ui_scores":   ui_scores,
            "difficulty":  new_diff,
            "performance": get_performance_trend(session["scores"]),
        }

    rag_index = _RAG_INDEXES.get(session_id)
    if rag_index is None and session.get("rag_context") and session.get("pdf_text"):
        try:
            rag_index = JDRagIndex.from_dict(session["pdf_text"], session["rag_context"])
            _RAG_INDEXES[session_id] = rag_index
            print(f"[Orchestrator] RAG rebuilt from session for {session_id}")
        except Exception as e:
            print(f"[Orchestrator] RAG rebuild failed (non-fatal): {e}")

    topics    = jd_data.get("topics", ["General Engineering"])
    next_topic_idx = session["current_index"] % len(topics)
    next_topic     = topics[next_topic_idx]

    rag_ctx = ""
    if rag_index:
        rag_ctx = get_context_for_question(rag_index, topic=next_topic, subtopic="")

    next_q_result  = None
    for attempt in range(4):
        candidate = await generate_question(
            jd_data=jd_data,
            fingerprint=fingerprint,
            current_difficulty=new_diff,
            history=session["history"][-5:],
            scenario_mode=session["scenario_mode"],
            round_index=round_index + 1,
            questions_asked=session["questions_asked"],
            rag_context=rag_ctx,
        )
        q_text = candidate["question"]
        if not is_duplicate(q_text, next_topic, session["questions_asked"]):
            next_q_result = candidate
            break
        print(f"[Dedup] Attempt {attempt+1} rejected (duplicate), regenerating…")

    if not next_q_result:
        next_q_result = candidate

    next_question = next_q_result["question"]
    register_question(next_question, next_q_result.get("topic", next_topic))
    session["current_question"] = next_question
    session["questions_asked"].append(next_question)
    session["difficulty_history"].append(new_diff)
    save(session)

    return {
        "completed":     False,
        "ui_scores":     ui_scores,
        "next_question": next_question,
        "difficulty":    new_diff,
        "performance":   get_performance_trend(session["scores"]),
        # FIX: expose weak_area so the frontend can accumulate real weak spots
        "weak_area":     evaluation.get("weak_area", ""),
        "correctness":   evaluation.get("correctness", ""),
        "score":         score_10,
    }


# ─────────────────────────────────────────────────────────────────────────────
# 3. SOCRATIC MENTOR — START  (v2: unlimited, topic-cycling)
# ─────────────────────────────────────────────────────────────────────────────

async def start_mentor(session_id: str) -> dict:
    """
    Open the post-interview Socratic mentor session (unlimited chatbot mode).

    v3 FIX — INSTANT RESPONSE (no LLM call on start):
    The original implementation called mentor_question() (which calls call_groq_llm)
    synchronously before returning ANY response to the frontend.  If Groq was slow,
    rate-limited, or timed out, the HTTP request would hang indefinitely, the Flask
    route would never return, and the frontend fetch() would stall — resulting in the
    blank screen the user sees.

    Fix: build the opening message from a hardcoded template instantly.
    No LLM call on start.  The very first user reply then triggers mentor_turn()
    which calls the LLM normally (with our 25-second AbortController on the frontend).
    """
    session = get(session_id)
    if not session:
        return {"error": "Session not found"}

    # ── Collect all weak areas from the interview history ─────────────────────
    weak_areas = _collect_weak_areas(session)
    topics     = session.get("topics") or [session.get("topic", "Software Engineering")]
    main_topic = session.get("topic") or topics[0]

    first_area = weak_areas[0] if weak_areas else main_topic

    # ── Initialise mentor state ───────────────────────────────────────────────
    session["mentor_conversation"]   = []
    session["mentor_weak_areas"]     = weak_areas
    session["mentor_area_index"]     = 0
    session["mentor_area_attempts"]  = 0
    session["mentor_attempts"]       = 0
    session["mentor_focus"]          = first_area
    session["mentor_all_done"]       = False
    session["mentor_last_activity"]  = time.time()
    session["status"]                = "mentor"

    # ── Build instant opening message — NO LLM call ───────────────────────────
    # This is the critical fix: avoids any Groq latency/hang on session start.
    n = len(weak_areas)
    if n == 1:
        areas_preview = f"1 area: {first_area}"
    elif n == 2:
        areas_preview = f"2 areas: {weak_areas[0]} and {weak_areas[1]}"
    else:
        areas_preview = f"{n} areas, starting with {first_area}"

    opening_question = (
        f"Great work completing the interview! Now let's deepen your understanding.\n\n"
        f"I've identified {areas_preview} to work through with you using Socratic questioning. "
        f"I won't just give you answers — I'll guide you to discover them yourself.\n\n"
        f"Let's begin with **{first_area}**.\n\n"
        f"To start: in your own words, what do you understand about {first_area}? "
        f"Don't worry about being perfect — just tell me what you know."
    )

    session["mentor_conversation"].append({
        "role": "assistant", "content": opening_question, "timestamp": time.time()
    })
    save(session)

    print(
        f"[Orchestrator] Mentor started (v3-instant) | session={session_id} | "
        f"weak_areas={weak_areas} | NO LLM call on start"
    )

    return {
        "question":        opening_question,
        "reveal_answer":   False,
        "answer_text":     None,
        "mode_used":       "socratic",
        "done":            False,
        "all_topics_done": False,
        "current_area":    first_area,
        "next_area":       weak_areas[1] if len(weak_areas) > 1 else None,
        "area_index":      0,
        "total_areas":     len(weak_areas),
        "total_questions": len(weak_areas),
        "question_number": 1,
        "advance_topic":   False,
    }


# ─────────────────────────────────────────────────────────────────────────────
# 4. SOCRATIC MENTOR — TURN  (v2: topic cycling + idle timer)
# ─────────────────────────────────────────────────────────────────────────────

async def mentor_turn(session_id: str, user_answer: str) -> dict:
    """Process one learner message in the unlimited Socratic mentor session."""
    session = get(session_id)
    if not session:
        return {"error": "Session not found"}

    conversation   = session.get("mentor_conversation") or []
    weak_areas     = session.get("mentor_weak_areas") or []
    area_index     = session.get("mentor_area_index") or 0
    area_attempts  = session.get("mentor_area_attempts") or 0
    total_attempts = session.get("mentor_attempts") or 0
    topics         = session.get("topics") or [session.get("topic", "Software Engineering")]
    main_topic     = session.get("topic") or topics[0]
    difficulty     = session.get("difficulty", "medium")

    # Safety: ensure socratic_history always exists (absent on sessions created
    # before session_store was updated — prevents KeyError on .append())
    if "socratic_history" not in session or session["socratic_history"] is None:
        session["socratic_history"] = []

    # Safety: rebuild weak_areas from history if key was never set
    if not weak_areas:
        weak_areas = _collect_weak_areas(session)
        session["mentor_weak_areas"] = weak_areas
        area_index = 0

    current_area = weak_areas[area_index] if weak_areas else topics[0]
    is_skip      = user_answer.startswith("[SKIP]")

    # SKIP = force reveal immediately
    effective_area_attempts = MENTOR_REVEAL_THRESHOLD if is_skip else area_attempts + 1

    # Update activity timestamp (used by idle timer on frontend)
    session["mentor_last_activity"] = time.time()

    # Append user message to conversation
    conversation.append({
        "role": "user", "content": user_answer, "timestamp": time.time()
    })

    is_last_area = (area_index >= len(weak_areas) - 1)

    # FIX: wrap with 20s timeout so Groq hangs never freeze the session
    _fallback_area = current_area
    _fallback_msg = (
        f"I'm having trouble connecting right now — let's keep going! "
        f"Tell me what you know about {_fallback_area}."
    )
    try:
        result = await asyncio.wait_for(
            mentor_question(
                topic=main_topic,
                weak_area=current_area,
                attempt_count=effective_area_attempts,
                history=conversation,
                reasoning_fingerprint=session.get("fingerprint") or {},
                difficulty=difficulty,
                question_number=total_attempts + 1,
                all_weak_areas=weak_areas,
                current_area_index=area_index,
                area_attempt_count=effective_area_attempts,
                user_message=user_answer,
                is_last_area=is_last_area,
            ),
            timeout=20.0
        )
    except asyncio.TimeoutError:
        print(f"[Orchestrator] mentor_question timed out for session={session_id}, using fallback")
        result = {
            "question":      _fallback_msg,
            "reveal_answer": False,
            "answer_text":   None,
            "mode_used":     "socratic",
            "done":          False,
            "all_topics_done": False,
            "current_area":  current_area,
            "next_area":     weak_areas[area_index + 1] if (area_index + 1) < len(weak_areas) else None,
            "area_index":    area_index,
            "question_number": total_attempts + 1,
            "total_questions": len(weak_areas),
            "advance_topic": False,
        }
    except Exception as exc:
        print(f"[Orchestrator] mentor_question raised: {exc!r}, using fallback")
        result = {
            "question":      _fallback_msg,
            "reveal_answer": False,
            "answer_text":   None,
            "mode_used":     "socratic",
            "done":          False,
            "all_topics_done": False,
            "current_area":  current_area,
            "next_area":     weak_areas[area_index + 1] if (area_index + 1) < len(weak_areas) else None,
            "area_index":    area_index,
            "question_number": total_attempts + 1,
            "total_questions": len(weak_areas),
            "advance_topic": False,
        }

    conversation.append({
        "role": "assistant", "content": result["question"], "timestamp": time.time()
    })
    session["mentor_conversation"] = conversation

    # ── Topic advancement: move to next weak area after reveal/transition ─────
    advance   = result.get("advance_topic", False)
    mode_used = result.get("mode_used", "")
    if advance and not is_last_area:
        area_index    += 1
        area_attempts  = 0
        session["mentor_area_index"]    = area_index
        session["mentor_area_attempts"] = 0
        session["mentor_focus"]         = weak_areas[area_index]
        print(f"[Orchestrator] Mentor advanced to area {area_index}: {weak_areas[area_index]}")
    elif advance and is_last_area:
        # FIX: advance=True on the last area means all topics are now covered
        session["mentor_area_attempts"] = 0
        session["mentor_area_index"]    = area_index
        print(f"[Orchestrator] Mentor completed final area {area_index}: {current_area}")
    else:
        # Only count non-direct-question, non-closing turns as attempts
        if not is_skip and mode_used not in ("direct_answer", "closing"):
            area_attempts += 1
        session["mentor_area_attempts"] = area_attempts
        session["mentor_area_index"]    = area_index

    # Total turn counter (always increments)
    if not is_skip:
        session["mentor_attempts"] = total_attempts + 1

    session["socratic_history"].append(user_answer)

    # ── All topics done → signal idle timer to frontend ───────────────────────
    # FIX: detect all_done from multiple signals:
    #   1. LLM explicitly returned all_topics_done=True
    #   2. mode is "closing" (LLM chose to close)
    #   3. advance=True on the final weak area
    all_done = (
        result.get("all_topics_done", False)
        or mode_used == "closing"
        or (advance and is_last_area)
    )
    if all_done:
        session["mentor_all_done"] = True
        session["status"]          = "complete"

    # ── Build clean response for frontend ─────────────────────────────────────
    result["done"]            = all_done
    result["all_topics_done"] = all_done
    result["is_skip"]         = is_skip
    result["attempt_count"]   = effective_area_attempts
    result["area_index"]      = area_index
    result["total_areas"]     = len(weak_areas)
    # idle_timeout_seconds: frontend starts 12s countdown when all_topics_done=True
    result["idle_timeout_seconds"] = 12 if all_done else None

    print(
        f"[Orchestrator] Mentor turn | session={session_id} | "
        f"area={area_index}/{len(weak_areas)-1} ({current_area}) | "
        f"area_attempts={effective_area_attempts} | "
        f"mode={result.get('mode_used')} | "
        f"reveal={result.get('reveal_answer')} | "
        f"advance={advance} | all_done={all_done}"
    )

    save(session)
    return result


# ─────────────────────────────────────────────────────────────────────────────
# 4b. SOCRATIC MENTOR — IDLE NUDGE  (v3: mid-session 12-second resume)
# ─────────────────────────────────────────────────────────────────────────────

async def mentor_idle_nudge(session_id: str) -> dict:
    """
    Called by the frontend after 12 seconds of user silence MID-SESSION
    (i.e. all_topics_done is still False).

    Behaviour:
      - Does NOT count as an attempt on the current weak area.
      - Does NOT advance the topic index.
      - Does NOT trigger a reveal.
      - Returns a warm "let's continue on <topic>" message + a fresh
        Socratic counter-question on the SAME weak area where we left off.
      - The session stays fully open; the user can still answer normally.

    This is completely separate from the END-OF-SESSION idle timer
    (which fires when all_topics_done=True and closes the session).
    """
    session = get(session_id)
    if not session:
        return {"error": "Session not found"}

    # Guard: if session is already fully complete, don't nudge
    if session.get("mentor_all_done"):
        return {
            "question":        "We've already covered all your weak areas — great work! Click 'Finish → Report' to see your full report.",
            "mode_used":       "closing",
            "is_nudge":        True,
            "all_topics_done": True,
            "done":            True,
            "advance_topic":   False,
            "reveal_answer":   False,
            "answer_text":     None,
        }

    conversation  = session.get("mentor_conversation", [])
    weak_areas    = session.get("mentor_weak_areas", [])
    area_index    = session.get("mentor_area_index", 0)
    area_attempts = session.get("mentor_area_attempts", 0)
    topics        = session.get("topics") or [session.get("topic", "Software Engineering")]
    main_topic    = session.get("topic") or topics[0]
    difficulty    = session.get("difficulty", "medium")

    if not weak_areas:
        weak_areas = _collect_weak_areas(session)
        session["mentor_weak_areas"] = weak_areas
        area_index = 0

    current_area = weak_areas[area_index] if weak_areas else topics[0]

    # ── FIX: Build instant nudge message — NO LLM call ───────────────────────
    # Calling mentor_question() here caused the same hang as start_mentor().
    # Nudges are simple resume messages — no LLM needed.
    nudge_question = (
        f"Just checking in — we were working on **{current_area}**. "
        f"Take your time! When you're ready, can you walk me through what you know about {current_area}?"
    )
    result = {
        "question":      nudge_question,
        "reveal_answer": False,
        "answer_text":   None,
        "mode_used":     "socratic",
    }

    # ── Append the nudge assistant message to conversation ────────────────────
    conversation.append({
        "role":      "assistant",
        "content":   result["question"],
        "timestamp": time.time(),
        "is_nudge":  True,
    })
    session["mentor_conversation"]  = conversation
    session["mentor_last_activity"] = time.time()

    # Force: nudge never advances the topic or triggers a reveal
    result["advance_topic"]   = False
    result["reveal_answer"]   = False
    result["answer_text"]     = None
    result["done"]            = False
    result["all_topics_done"] = False
    result["is_nudge"]        = True
    result["current_area"]    = current_area
    result["area_index"]      = area_index
    result["total_areas"]     = len(weak_areas)
    result["mode_used"]       = "nudge_resume"

    save(session)
    print(
        f"[Orchestrator] Idle nudge sent | session={session_id} | "
        f"area={area_index}/{len(weak_areas)-1} ({current_area})"
    )
    return result


# ─────────────────────────────────────────────────────────────────────────────
# 5. GENERATE FINAL REPORT
# ─────────────────────────────────────────────────────────────────────────────

async def generate_report(session_id: str) -> dict:
    """Run Agent 7 on the full session history and return the report."""
    session = get(session_id)
    if not session:
        return {"error": "Session not found"}

    session["status"] = "complete"
    save(session)

    full = get_full_history(session)

    # FIX: wrap with 55s timeout — report generation is expensive but must not hang
    try:
        report = await asyncio.wait_for(
            generate_final_feedback(
                questions=full["questions"],
                answers=full["answers"],
                evaluations=full["evaluations"],
                fingerprint_history=full["fingerprint_history"],
                difficulty_history=full["difficulty_history"],
                performance_trend=full["scores"],
                socratic_history=full["socratic_history"],
                topic=full["topic"],
                jd_data=full["jd_data"],
            ),
            timeout=55.0
        )
    except asyncio.TimeoutError:
        print(f"[Orchestrator] generate_final_feedback timed out for {session_id} — using fallback report")
        report = {
            "cognitive_summary": "Report generation timed out. Your session data is saved — please try refreshing.",
            "reasoning_fingerprint": {"depth": "moderate", "thinking_type": "logical", "confidence_bias": "balanced"},
            "strong_areas": [],
            "weak_areas": session.get("mentor_weak_areas", []),
            "concept_gaps": session.get("mentor_weak_areas", []),
            "primary_strength": "Completed the full interview session",
            "top_gap": session.get("mentor_weak_areas", ["Review session"])[0] if session.get("mentor_weak_areas") else "Review session",
            "areas_of_improvement": session.get("mentor_weak_areas", []),
            "communication_feedback": "See per-question feedback below.",
            "improvement_plan": ["Review each question and ideal answer below", "Focus on weak areas identified"],
            "socratic_summary": "Socratic session completed.",
            "overall_score": int(sum(session.get("scores", [5])) / max(len(session.get("scores", [1])), 1) * 10),
        }

    report["per_question_feedback"] = build_per_question_feedback(session)

    report["socratic_session"] = {
        "attempts":            session.get("mentor_attempts", 0),
        "focus":               session.get("mentor_focus", ""),
        "weak_areas_covered":  session.get("mentor_weak_areas", []),
        "conversation_length": len(session.get("mentor_conversation", [])),
        "exchanges":           len(session.get("socratic_history", [])),
    }

    report["performance"]  = get_performance_trend(session.get("scores", []))
    report["rag_was_used"] = session.get("pdf_used", False)

    print(f"[Orchestrator] Report generated | session={session_id} | score={report.get('overall_score')}")
    return report


# ─────────────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def _collect_weak_areas(session: dict) -> list[str]:
    """
    Pull all unique weak areas from the interview history.
    Falls back to session-level weak_areas, then topics.
    """
    seen  = set()
    areas = []

    for turn in session.get("history", []):
        ev = turn.get("evaluation") or {}
        wa = ev.get("weak_area", "").strip()
        if wa and wa not in seen:
            seen.add(wa)
            areas.append(wa)

    # Merge with any session-level weak_areas already stored
    for wa in session.get("weak_areas", []):
        if wa and wa not in seen:
            seen.add(wa)
            areas.append(wa)

    # Final fallback
    if not areas:
        topics = session.get("topics") or [session.get("topic", "Software Engineering")]
        areas  = topics[:3]

    return areas