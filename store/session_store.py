"""
store/session_store.py
======================
Persistent JSON session storage for SocraticMind v3.

Replaces the old in-memory SESSIONS = {} dict.
Each session is stored as  sessions/{id}.json  on disk.
Server restarts no longer lose data.

PUBLIC API  (all functions your orchestrator.py actually calls):

  new_session(session_id, jd_data, num_questions, scenario_mode) -> dict
  get(session_id)          -> dict | None
  save(session)            -> None
  exists(session_id)       -> bool
  append_turn(...)         -> None     ← adds Q/A/eval/fingerprint to history
  get_full_history(session) -> dict    ← returns everything Agent 7 needs
  list_sessions()          -> list     ← lightweight summaries for /api/sessions
  delete(session_id)       -> bool
"""

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

SESSIONS_DIR = Path("sessions")


# ─────────────────────────────────────────────────────────────────────────────
# CREATE
# ─────────────────────────────────────────────────────────────────────────────

def new_session(
    session_id: str,
    jd_data: dict,
    num_questions: int,
    scenario_mode: str,
) -> dict:
    """
    Create and persist a brand-new session.

    jd_data comes from Agent 1 and contains:
      role, topics, weights, subtopics, difficulty_level
    """
    SESSIONS_DIR.mkdir(exist_ok=True)

    session = {
        # ── Identity ────────────────────────────────────────────────
        "session_id":   session_id,
        "created_at":   datetime.now(timezone.utc).isoformat(),
        "status":       "active",       # active | mentor | complete

        # ── Setup ───────────────────────────────────────────────────
        "jd_data":      jd_data,
        "topic":        jd_data.get("role", "Software Engineer"),
        "topics":       jd_data.get("topics", []),
        "max_questions": num_questions,
        "scenario_mode": scenario_mode,
        "difficulty":   jd_data.get("difficulty_level", "medium"),

        # ── Per-turn history (parallel arrays — same index = same turn) ──
        "history":           [],   # list of {question, answer, topic, difficulty}
        "questions_asked":   [],   # just question strings (for dedup)
        "answers":           [],
        "evaluations":       [],   # dicts from Agent 3
        "fingerprint_history": [], # dicts from Agent 4
        "difficulty_history":  [], # string per turn
        "scores":            [],   # int 0-10 per turn

        # ── Live state ───────────────────────────────────────────────
        "current_question": "",
        "current_index":    0,      # number of answers submitted so far
        "fingerprint":      {},     # latest fingerprint snapshot
        "weak_areas":       [],     # accumulated weak areas

        # ── Socratic ─────────────────────────────────────────────────
        "mentor_conversation":  [],
        "mentor_attempts":      0,
        "mentor_focus":         "",
        "socratic_history":     [],   # user answers during mentor phase
        # v3 mentor keys — always initialised here to avoid KeyError on old sessions
        "mentor_weak_areas":    [],   # populated by start_mentor()
        "mentor_area_index":    0,
        "mentor_area_attempts": 0,
        "mentor_all_done":      False,
        "mentor_last_activity": None,

        # ── RAG (stored as serialised dict from JDRagIndex.to_dict()) ──
        "rag_context":  None,
        "pdf_used":     False,
    }

    _write(session_id, session)
    return session


# ─────────────────────────────────────────────────────────────────────────────
# READ / WRITE
# ─────────────────────────────────────────────────────────────────────────────

def get(session_id: str) -> Optional[dict]:
    """Return full session dict or None."""
    path = _path(session_id)
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        print(f"[SessionStore] Read error {session_id}: {e}")
        return None


def save(session: dict) -> None:
    """Persist the full session dict to disk (overwrites)."""
    sid = session.get("session_id")
    if not sid:
        print("[SessionStore] save() called with no session_id")
        return
    _write(sid, session)


def exists(session_id: str) -> bool:
    return _path(session_id).exists()


def delete(session_id: str) -> bool:
    p = _path(session_id)
    if p.exists():
        p.unlink()
        return True
    return False


# ─────────────────────────────────────────────────────────────────────────────
# APPEND TURN  (called by orchestrator after every answer)
# ─────────────────────────────────────────────────────────────────────────────

def append_turn(
    session: dict,
    question: str,
    answer: str,
    evaluation: dict,
    fingerprint: dict,
    difficulty: str,
    topic: str,
) -> None:
    """
    Append one completed Q/A turn to all history arrays.
    Mutates `session` in-place — caller must call save(session) after.

    Also updates:
      - session["weak_areas"]  (accumulated list of weak_area strings)
      - session["scores"]      (list of int scores)
    """
    # History record (used by Agent 7 and for display)
    # FIX: store evaluation as BOTH a nested "evaluation" dict AND flat fields.
    # build_per_question_feedback() (final_feedback_agent.py) reads h.get("evaluation")
    # as a nested dict. Without this, all per-question report feedback is empty/blank.
    session["history"].append({
        "question":   question,
        "answer":     answer,
        "topic":      topic,
        "difficulty": difficulty,
        # Flat fields (for backward compat / direct access)
        "score":      evaluation.get("score", 5),
        "feedback":   evaluation.get("feedback", ""),
        "correctness": evaluation.get("correctness", "unknown"),
        "weak_area":  evaluation.get("weak_area", ""),
        "strengths":  evaluation.get("strengths", []),
        "weaknesses": evaluation.get("weaknesses", []),
        # Nested evaluation dict — REQUIRED by build_per_question_feedback()
        "evaluation": evaluation,
    })

    # Parallel arrays
    session["answers"].append(answer)
    session["evaluations"].append(evaluation)
    session["fingerprint_history"].append(fingerprint)
    session["difficulty_history"].append(difficulty)

    score = int(evaluation.get("score", 5))
    score = max(0, min(10, score))
    session["scores"].append(score)

    # Accumulate weak areas (deduped)
    wa = evaluation.get("weak_area", "").strip()
    if wa and wa not in session["weak_areas"]:
        session["weak_areas"].append(wa)

    # Update live fingerprint
    session["fingerprint"] = fingerprint


# ─────────────────────────────────────────────────────────────────────────────
# GET FULL HISTORY  (used by orchestrator before calling Agent 7)
# ─────────────────────────────────────────────────────────────────────────────

def get_full_history(session: dict) -> dict:
    """
    Return everything Agent 7 (final_feedback_agent) needs.

    The returned dict keys match exactly what generate_final_feedback()
    expects as keyword arguments in orchestrator.generate_report().
    """
    return {
        "questions":           session.get("questions_asked", []),
        "answers":             session.get("answers", []),
        "evaluations":         session.get("evaluations", []),
        "fingerprint_history": session.get("fingerprint_history", []),
        "difficulty_history":  session.get("difficulty_history", []),
        "scores":              session.get("scores", []),
        "socratic_history":    session.get("socratic_history", []),
        "topic":               session.get("topic", ""),
        "jd_data":             session.get("jd_data", {}),
        "weak_areas":          session.get("weak_areas", []),
        "history":             session.get("history", []),
        "mentor_conversation": session.get("mentor_conversation", []),
        "mentor_focus":        session.get("mentor_focus", ""),
        "mentor_attempts":     session.get("mentor_attempts", 0),
    }


# ─────────────────────────────────────────────────────────────────────────────
# LIST SESSIONS  (used by GET /api/sessions)
# ─────────────────────────────────────────────────────────────────────────────

def list_sessions() -> list:
    """Return lightweight summary list of all sessions."""
    SESSIONS_DIR.mkdir(exist_ok=True)
    summaries = []
    for f in sorted(SESSIONS_DIR.glob("*.json")):
        if f.name == "question_bank.json":
            continue
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            scores = data.get("scores", [])
            summaries.append({
                "session_id":  data.get("session_id", f.stem),
                "topic":       data.get("topic", ""),
                "status":      data.get("status", "unknown"),
                "questions":   len(data.get("questions_asked", [])),
                "avg_score":   round(sum(scores) / len(scores), 1) if scores else 0.0,
                "created_at":  data.get("created_at", ""),
            })
        except Exception:
            pass
    return summaries


# ─────────────────────────────────────────────────────────────────────────────
# INTERNAL HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def _path(session_id: str) -> Path:
    return SESSIONS_DIR / f"{session_id}.json"


def _write(session_id: str, data: dict) -> None:
    SESSIONS_DIR.mkdir(exist_ok=True)
    try:
        _path(session_id).write_text(
            json.dumps(data, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
    except Exception as e:
        print(f"[SessionStore] Write error {session_id}: {e}")