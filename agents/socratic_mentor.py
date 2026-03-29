"""
agents/socratic_mentor.py  —  AGENT 6: Socratic Mentor  (v3 — robust direct-Q handling)
=========================================================================================
Provides THREE functions, used in different phases:

  1. socratic_probe()   — inline probe during interview (counter-questions)
  2. guide()            — interview-phase hint without revealing answer
  3. mentor_question()  — post-interview deep-dive (UNLIMITED, topic-cycling chatbot)

POST-INTERVIEW MENTOR BEHAVIOUR (v3 — fixes blank-screen on out-of-context questions):
  ─────────────────────────────────────────────────────────────────────────────
  • NO fixed question budget. Session runs until the user explicitly exits
    OR the 12-second idle timer (handled in orchestrator/frontend) fires after
    all weak areas are covered and the user stops sending messages.

  • TOPIC CYCLING:
      - Weak areas are worked through one at a time.
      - For each weak area the mentor asks counter-questions (Socratic style).
      - If the user cannot answer after MENTOR_REVEAL_THRESHOLD attempts,
        the answer is revealed with a clear, thorough explanation.
      - Once a topic is revealed (or mastered), the mentor moves to the next
        weak area automatically.

  • USER QUESTIONS (v3 fix):
      - If the user's message is detected as a direct question (contains "?",
        starts with "what", "why", "how", "can you", "explain", etc.) the
        mentor answers it DIRECTLY and concisely — no Socratic probing.
      - Out-of-context / off-topic questions are now gracefully handled:
        the LLM is explicitly told to answer even if it doesn't know, with a
        fallback that is always a non-empty string.
      - The out-of-context guard: if the parsed JSON question is empty or
        whitespace, a safe hardcoded fallback is returned — blank screen
        is now impossible.
      - After answering the direct question, the mentor returns to the current
        weak-area thread.
      - advance_topic is forced False for direct_answer mode — we never skip
        a weak area just because the user asked a side question.

  • ALL-TOPICS-DONE STATE:
      - When all weak areas have been covered/revealed, the mentor sends a
        closing summary message and sets  done=True + all_topics_done=True.
      - The orchestrator then waits 12 seconds for further user messages.
        If none arrive, the session is marked complete and the report is shown.

  ─────────────────────────────────────────────────────────────────────────────

CHANGES vs v2
─────────────
1. _MENTOR_SYSTEM: direct_answer mode now explicitly instructs the LLM to
   handle off-topic/out-of-context questions gracefully (give a brief honest
   answer rather than returning empty output).

2. mentor_question(): after merging the LLM result, a new _sanitise_result()
   pass ensures "question" is NEVER empty — multiple fallback layers guarantee
   a non-blank response is always returned to the frontend.

3. advance_topic is hard-wired to False when mode == "direct_answer" so that
   a side question never accidentally advances the weak-area index.

4. _is_direct_question() is expanded to catch more patterns (e.g. bare "?"
   messages, single-word confusion cues like "huh?", "what?").

5. _fallback_message() now returns a richer non-empty string for direct_answer
   so even if call_groq_llm returns None the screen never goes blank.
"""

import json
import re
from utils.groq_llm import call_groq_llm
from config import MODEL_QUALITY, MENTOR_REVEAL_THRESHOLD


# ── Direct-question detection ─────────────────────────────────────────────────
_QUESTION_STARTERS = re.compile(
    r"^\s*(what|why|how|when|where|which|who|can you|could you|explain|tell me|"
    r"describe|define|give me|show me|is it|are there|does|do you|i don'?t|"
    r"i don'?t understand|huh|wait|so|clarify|what'?s|whats|pls|please)",
    re.IGNORECASE,
)

def _is_direct_question(text: str) -> bool:
    """
    Return True if the user message looks like a direct factual question
    or a confused/off-topic message that deserves a direct answer.
    """
    stripped = text.strip()
    # Any message with a question mark
    if "?" in stripped:
        return True
    # Short confused messages (≤4 words) that aren't answers
    if len(stripped.split()) <= 4 and not stripped[0].isdigit():
        if re.search(r"\b(huh|what|why|how|explain|sorry|lost|confused|unclear)\b",
                     stripped, re.IGNORECASE):
            return True
    # Starts with a question starter keyword
    return bool(_QUESTION_STARTERS.match(stripped))


# ══════════════════════════════════════════════════════════════════════════════
# 1. SOCRATIC PROBE — inline counter-question during interview
# ══════════════════════════════════════════════════════════════════════════════

_PROBE_SYSTEM = """You are a Socratic mentor conducting a deep reasoning probe.

Based on the candidate's answer and evaluation, generate a COUNTER-QUESTION that:
- Challenges their assumptions or reveals a gap
- Deepens their reasoning toward first principles
- Matches depth to their current answer quality

DEPTH RULES:
  SHALLOW answer (score 0-4) → Ask WHY (underlying principles)
  PARTIAL  answer (score 5-6) → Ask HOW (implementation/mechanism)
  STRONG   answer (score 7-10) → Ask WHAT IF / EDGE CASE (boundary conditions)

GENERAL RULES:
- Ask exactly ONE counter-question (1-2 sentences)
- Do NOT repeat any question from socratic_history
- Do NOT give the answer or explain concepts
- Probe the specific weak_area from the evaluation

Output ONLY valid JSON:
{
  "counter_question": "your Socratic counter-question here",
  "depth_assessment": "shallow | moderate | deep",
  "should_continue": true
}

Set should_continue=false if: score>=8 AND depth_assessment=deep, OR iteration>=3.

No explanations. JSON only."""


async def socratic_probe(
    question: str,
    answer: str,
    evaluation: dict,
    socratic_history: list,
    iteration: int = 1,
    reasoning_fingerprint: dict | None = None,
) -> dict:
    """Generate an inline Socratic counter-question during the interview phase."""
    context = json.dumps({
        "original_question":     question,
        "candidate_answer":      answer,
        "evaluation":            evaluation,
        "socratic_history":      socratic_history[-5:],
        "iteration":             iteration,
        "reasoning_fingerprint": reasoning_fingerprint or {},
        "score":                 evaluation.get("score", 5),
        "weak_area":             evaluation.get("weak_area", ""),
    })

    try:
        result = await call_groq_llm(
            system=_PROBE_SYSTEM,
            user=context,
            model=MODEL_QUALITY,
            max_tokens=180,
            temperature=0.65,
        )
    except Exception as exc:
        print(f"[SocraticProbe] call_groq_llm raised: {exc!r} -- using fallback")
        result = {}

    defaults = {
        "counter_question": "Can you explain the reasoning behind your choice in more detail?",
        "depth_assessment": "shallow",
        "should_continue":  True,
    }
    if not isinstance(result, dict):
        return defaults
    for k, v in defaults.items():
        if k not in result:
            result[k] = v

    score = evaluation.get("score", 5)
    if (result.get("depth_assessment") == "deep" and score >= 8) or iteration >= 3:
        result["should_continue"] = False

    return result


# ══════════════════════════════════════════════════════════════════════════════
# 2. GUIDE — interview-phase hint (no answer reveal)
# ══════════════════════════════════════════════════════════════════════════════

_GUIDE_SYSTEM = """You are a Socratic mentor for technical interviews.

STRICT RULES:
- NEVER give the answer directly
- Provide ONLY: a guiding question OR a subtle nudge

Output ONLY valid JSON:
{
  "guidance": "your hint or guiding question here"
}

No explanations. JSON only."""


async def guide(
    question: str,
    answer: str,
    evaluation: dict,
    reasoning_fingerprint: dict | None = None,
) -> dict:
    """Provide a hint without revealing the answer (used during interview phase)."""
    context = json.dumps({
        "question":              question,
        "answer":                answer,
        "evaluation":            evaluation,
        "reasoning_fingerprint": reasoning_fingerprint or {},
    })
    try:
        result = await call_groq_llm(
            system=_GUIDE_SYSTEM,
            user=context,
            model=MODEL_QUALITY,
            max_tokens=160,
            temperature=0.3,
        )
    except Exception as exc:
        print(f"[SocraticGuide] call_groq_llm raised: {exc!r} -- using fallback")
        result = {}
    if not isinstance(result, dict) or not result.get("guidance", "").strip():
        return {"guidance": "What are the first principles you are applying here?"}
    return result


# ══════════════════════════════════════════════════════════════════════════════
# 3. MENTOR QUESTION — post-interview unlimited chatbot with topic cycling
# ══════════════════════════════════════════════════════════════════════════════

_MENTOR_SYSTEM = """You are a Socratic Mentor running a post-interview deep-dive session.

Your job is to help the learner truly understand their weak areas through guided questioning
and, when needed, clear explanations.

─── MODE RULES ────────────────────────────────────────────────────────────────

MODE = "direct_answer":
  The user has asked a direct factual question — it may be related to the interview
  topic OR it may be completely unrelated / out of context.

  RULES for direct_answer mode:
  • If the question is related to the current weak area or the broad topic:
    Answer it CLEARLY and COMPLETELY in 2-4 sentences.
    Then add ONE sentence smoothly redirecting back to the current weak area
    (e.g. "Now, coming back to [weak_area]...").

  • If the question is unrelated / off-topic (e.g. about weather, unrelated tech,
    personal questions, random trivia):
    Give a short, friendly acknowledgement (1-2 sentences) and gently redirect.
    Example: "That's outside our session scope, but happy to chat briefly —
    [one sentence answer or 'I'm not sure about that']. Let's refocus on
    [current_weak_area] though — [redirect question]."

  • CRITICAL: You MUST ALWAYS produce a non-empty "question" field.
    NEVER return an empty string. If unsure what to say, use:
    "Interesting question! Let's keep our focus on [current_weak_area] for now —
    can you walk me through what you know about it?"

MODE = "socratic":
  Ask ONE counter-question that probes the user's understanding of the current
  weak area. Do NOT reveal the answer. Each question must come from a different
  angle than previous ones in conversation_history.
  - attempt 0: open-ended, no hints
  - attempt 1: subtle hint from a different angle
  - attempt 2: stronger hint with partial structure

MODE = "reveal":
  The user has failed to answer after enough attempts OR it is forced reveal.
  Reveal the answer to the current weak area with:
    1. A clear, direct explanation (3-5 sentences)
    2. The core mechanism / WHY it works
    3. A concrete real-world example
  Keep it educational, not condescending. Then transition to the next weak area.

MODE = "transition":
  The current weak area is mastered or revealed. Briefly acknowledge progress,
  then introduce the NEXT weak area with one opening question.

MODE = "closing":
  All weak areas are done. Give a warm, specific 3-4 sentence summary of what
  was covered and what the learner should focus on next. Do NOT ask any more
  questions.

─── OUTPUT FORMAT ─────────────────────────────────────────────────────────────

Output ONLY valid JSON:
{
  "question": "your message to the learner (MUST be non-empty always)",
  "reveal_answer": true | false,
  "answer_text": "full explanation if reveal_answer=true, else null",
  "mode_used": "direct_answer | socratic | reveal | transition | closing"
}

CRITICAL RULE: The "question" field MUST always contain a non-empty string.
If you are uncertain what to say, always fall back to asking about the current_weak_area.

No explanations outside JSON. JSON only."""


async def mentor_question(
    topic: str,
    weak_area: str,
    attempt_count: int,
    history: list,
    reasoning_fingerprint: dict | None = None,
    difficulty: str = "medium",
    question_number: int = 1,
    total_questions: int = 999,          # unused — kept for backward compat
    # ── NEW v2 params ──────────────────────────────────────────────────────────
    all_weak_areas: list | None = None,  # full list of weak areas for this session
    current_area_index: int = 0,         # which weak area we are on (0-indexed)
    area_attempt_count: int = 0,         # attempts on the CURRENT weak area only
    user_message: str = "",              # the raw user message (for direct-Q detect)
    is_last_area: bool = False,          # True when this is the final weak area
) -> dict:
    """
    Generate a post-interview mentor message with unlimited chatbot mode.

    v3 behaviour:
      - Detects direct/off-topic questions → answers directly with graceful fallback.
      - advance_topic is NEVER set for direct_answer turns (prevents skipping topics).
      - _sanitise_result() guarantees "question" is never empty (blank screen fix).
      - No fixed question budget.
      - Cycles through all_weak_areas one by one.
      - Reveals answer when area_attempt_count >= MENTOR_REVEAL_THRESHOLD.
      - After reveal, transitions to next weak area.
      - When all areas done, sends closing message + done=True + all_topics_done=True.

    Backward-compatible with old callers that only pass topic/weak_area/attempt_count/history.
    """
    weak_areas   = all_weak_areas or [weak_area]
    current_area = weak_areas[current_area_index] if weak_areas else weak_area
    next_area    = weak_areas[current_area_index + 1] if (current_area_index + 1) < len(weak_areas) else None

    # ── Determine mode ────────────────────────────────────────────────────────
    force_reveal = area_attempt_count >= MENTOR_REVEAL_THRESHOLD

    # FIX: all_topics_done should fire when:
    #   (a) force_reveal is True on the last area (user couldn't answer → reveal + close), OR
    #   (b) the last area was ALREADY revealed in conversation history (user gets closing msg)
    # Previously this was only (a), meaning a user who answered the last question correctly
    # never got the closing message and the session never auto-closed.
    last_area_revealed = is_last_area and _area_was_just_revealed(history, current_area)
    all_topics_done    = is_last_area and (force_reveal or last_area_revealed)

    if all_topics_done and not force_reveal:
        # Last area was mastered — go straight to closing without another reveal
        mode = "closing"
    elif all_topics_done and force_reveal:
        mode = "closing"
    elif user_message and _is_direct_question(user_message):
        mode = "direct_answer"
    elif force_reveal:
        mode = "reveal"
    elif area_attempt_count > 0 and not force_reveal and next_area and \
            _area_was_just_revealed(history, current_area):
        mode = "transition"
    else:
        mode = "socratic"

    context = json.dumps({
        "broad_topic":           topic,
        "current_weak_area":     current_area,
        "next_weak_area":        next_area,
        "all_weak_areas":        weak_areas,
        "current_area_index":    current_area_index,
        "total_weak_areas":      len(weak_areas),
        "area_attempt_count":    area_attempt_count,
        "reveal_threshold":      MENTOR_REVEAL_THRESHOLD,
        "difficulty":            difficulty,
        "mode":                  mode,
        "user_message":          user_message or "",
        "is_last_area":          is_last_area,
        "conversation_history":  history[-8:],
        "reasoning_fingerprint": reasoning_fingerprint or {},
        "instruction": _build_instruction(mode, current_area, next_area, area_attempt_count),
    })


    # -- Call LLM -- fully wrapped so ANY failure gives a guaranteed safe response
    reveal_now = mode in ("reveal", "closing")
    fallback_q = _fallback_message(mode, current_area, next_area, user_message)

    defaults = {
        "question":      fallback_q,
        "reveal_answer": reveal_now,
        "answer_text":   None,
        "mode_used":     mode,
    }

    try:
        result = await call_groq_llm(
            system=_MENTOR_SYSTEM,
            user=context,
            model=MODEL_QUALITY,
            max_tokens=400,
            temperature=0.35,
        )
    except Exception as llm_exc:
        # LLM call threw (rate-limit, timeout, network error, JSON parse error).
        # Log and fall through to pure-fallback so the screen never goes blank.
        print(f"[SocraticMentor] call_groq_llm raised: {llm_exc!r} -- using fallback")
        result = {}

    # -- Safe merge: never let an empty/None LLM value override a good default --
    # {**defaults, **result} is WRONG: result["question"]="" overrides the fallback.
    # Instead: start from defaults, overlay only genuinely non-empty LLM values.
    if not isinstance(result, dict):
        result = {}

    merged = dict(defaults)
    for key, llm_val in result.items():
        if llm_val is None:
            continue
        if isinstance(llm_val, str) and not llm_val.strip():
            continue  # blank string from LLM -- keep the default
        merged[key] = llm_val

    # -- Final safety net: triple-check "question" is never blank -----------
    merged = _sanitise_result(merged, mode, current_area, next_area, user_message)

    # Force reveal fields when mode demands it
    if reveal_now:
        merged["reveal_answer"] = True
        if not merged.get("answer_text"):
            merged["answer_text"] = (
                f"The core insight about '{current_area}': "
                f"understanding the fundamental mechanism — WHY it works, not just WHAT it is — "
                f"is what separates a strong answer from a surface-level one. "
                f"Study this from first principles and try to build a small example around it."
            )

    # ── Build response metadata ───────────────────────────────────────────────
    # all_topics_done → orchestrator will start 12-second idle timer
    merged["done"]             = all_topics_done
    merged["all_topics_done"]  = all_topics_done
    merged["current_area"]     = current_area
    merged["next_area"]        = next_area
    merged["area_index"]       = current_area_index
    merged["question_number"]  = question_number
    merged["total_questions"]  = len(weak_areas)

    # ── v3 FIX: Never advance the topic on a direct_answer turn ──────────────
    # A side/off-topic question must NOT skip the current weak area.
    # FIX: for closing mode on the last area, set advance_topic=True so the
    # orchestrator knows the final area was completed and can mark all_done.
    if mode == "direct_answer":
        merged["advance_topic"] = False
    elif mode == "closing":
        merged["advance_topic"] = True   # signals orchestrator: last area done
    else:
        merged["advance_topic"] = (mode in ("reveal", "transition")) and bool(next_area)

    return merged


# ── Helpers ───────────────────────────────────────────────────────────────────

def _sanitise_result(
    merged: dict,
    mode: str,
    current_area: str,
    next_area: str | None,
    user_message: str,
) -> dict:
    """
    v3 FIX: Guarantee the 'question' field is always a non-empty string.

    Three-layer defence:
      1. If merged["question"] is non-empty → keep it as-is.
      2. If it's empty/None → use _fallback_message() (always non-empty).
      3. If fallback is somehow also empty → use the hardcoded nuclear fallback.
    """
    raw_question = merged.get("question", "")

    # Layer 1: Already fine
    if raw_question and str(raw_question).strip():
        merged["question"] = str(raw_question).strip()
        return merged

    # Layer 2: Use the mode-appropriate fallback
    fallback = _fallback_message(mode, current_area, next_area, user_message)
    if fallback and fallback.strip():
        merged["question"] = fallback
        return merged

    # Layer 3: Nuclear fallback — should never be reached
    merged["question"] = (
        f"Let's continue exploring {current_area}. "
        f"Can you walk me through what you know about it so far?"
    )
    return merged


def _area_was_just_revealed(history: list, area: str) -> bool:
    """Check if the most recent assistant message was a reveal for this area."""
    for msg in reversed(history[-4:]):
        if msg.get("role") == "assistant":
            content = msg.get("content", "").lower()
            return area.lower() in content
    return False


def _build_instruction(mode: str, current_area: str, next_area: str | None, attempts: int) -> str:
    if mode == "direct_answer":
        return (
            f"The user sent a message that may be a direct question or out-of-context query. "
            f"If it is related to '{current_area}' or the session topic: answer clearly in 2-4 sentences, "
            f"then redirect back to '{current_area}'. "
            f"If it is unrelated or off-topic: give a brief 1-2 sentence acknowledgement "
            f"(or say you're not sure if you don't know), then redirect back to '{current_area}'. "
            f"You MUST produce a non-empty 'question' field — never leave it blank."
        )
    if mode == "socratic":
        angle = ["underlying principle", "concrete mechanism", "edge case or failure mode"][min(attempts, 2)]
        return (
            f"Ask one Socratic counter-question about '{current_area}' from the angle of: {angle}. "
            f"Do NOT reveal the answer. Keep it concise (1-2 sentences)."
        )
    if mode == "reveal":
        return (
            f"Reveal the answer to '{current_area}' clearly. Include: "
            f"(1) a plain-English explanation, "
            f"(2) the core mechanism / WHY it works, "
            f"(3) a concrete real-world example. "
            + (f"Then introduce the next topic: '{next_area}'." if next_area else "")
        )
    if mode == "transition":
        return (
            f"'{current_area}' is now covered. Briefly acknowledge, "
            f"then introduce the next weak area: '{next_area}' with one opening question."
        )
    if mode == "closing":
        return (
            "All weak areas have been covered. Write a warm 3-4 sentence closing summary: "
            "what was covered, key takeaways, what to study next. Do NOT ask any more questions."
        )
    return f"Guide the learner on '{current_area}'."


def _fallback_message(
    mode: str,
    current_area: str,
    next_area: str | None,
    user_message: str = "",
) -> str:
    """
    v3: Enriched fallback messages — always non-empty, context-aware.
    The user_message is used to make direct_answer fallbacks more specific.
    """
    if mode == "direct_answer":
        # Give a gentle, non-blank answer for any kind of off-topic message
        if user_message and "?" in user_message:
            return (
                f"That's a good question! I may not have full context on that right now, "
                f"but let's make sure we cover it if it's relevant. "
                f"For now, let's refocus — can you tell me more about how you understand '{current_area}'?"
            )
        return (
            f"Happy to address that! Let me answer briefly and then we'll get back on track. "
            f"Coming back to our session — what do you know about '{current_area}'?"
        )
    if mode == "socratic":
        return f"Can you explain the underlying mechanism behind {current_area} in your own words?"
    if mode == "reveal":
        base = (
            f"Let me explain {current_area} clearly. "
            f"The core idea is understanding WHY it works, not just WHAT it is. "
            f"At its heart, {current_area} solves a specific problem through its fundamental mechanism. "
            f"A real-world scenario: think about where you'd encounter this in production and what "
            f"would happen if it failed."
        )
        return base + (f" Now let's look at: {next_area}." if next_area else "")
    if mode == "transition":
        return (
            f"Good — we've covered {current_area}. "
            f"Let's now explore {next_area}. What do you know about it?"
        )
    if mode == "closing":
        return (
            f"Great session! We worked through your key areas including {current_area}. "
            f"Focus on studying the mechanisms behind each concept — not just definitions. "
            f"You've made real progress today. Review these areas and try building small "
            f"examples around each one to solidify your understanding."
        )
    return f"What do you understand about {current_area}? Walk me through it."


# ── Legacy helper kept for backward compatibility ─────────────────────────────
def get_question_budget(difficulty: str) -> int:
    """
    Kept for backward compatibility with orchestrator.py.
    Returns a large number — budget is now effectively unlimited.
    The session ends via idle timer or user exit, not question count.
    """
    return 999