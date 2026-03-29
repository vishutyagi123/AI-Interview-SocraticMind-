"""
rag/question_dedup.py
=====================
Question deduplication engine — prevents repeated questions
both within a session AND across sessions for the same topic.

HOW IT WORKS:
  1. Every generated question is stored in a topic-keyed bank
  2. Before returning a question, fuzzy similarity is checked
     against ALL previously seen questions for that topic
  3. If similarity >= threshold → reject and regenerate
  4. Bank is persisted to disk so it survives server restarts

SIMILARITY METHODS (in order of speed):
  1. Exact match (O(1) hash lookup)
  2. Normalised Levenshtein / SequenceMatcher ratio
  3. Keyword Jaccard similarity (catches paraphrases)

THRESHOLD: 0.70 — questions must be < 70% similar to pass.
Tune lower (0.60) for stricter dedup, higher (0.80) for looser.
"""

import json
import re
from pathlib import Path
from difflib import SequenceMatcher
from collections import defaultdict

# ── Persistence ───────────────────────────────────────────────────────────────
BANK_FILE  = Path("sessions/question_bank.json")
THRESHOLD  = 0.70   # similarity threshold for rejection

# ── In-memory bank: {topic_key: [question_str, ...]} ─────────────────────────
_BANK: dict[str, list[str]] = defaultdict(list)
_EXACT: set[str] = set()   # normalised exact hashes for O(1) check

_loaded = False


# ─────────────────────────────────────────────────────────────────────────────
# PUBLIC API
# ─────────────────────────────────────────────────────────────────────────────

def is_duplicate(question: str, topic: str, session_questions: list[str] = None) -> bool:
    """
    Return True if question is too similar to something already asked.

    Checks:
      1. Exact match (normalised)
      2. Fuzzy match against session questions (passed in)
      3. Fuzzy match against global bank for this topic
    """
    _ensure_loaded()
    norm = _normalise(question)

    # 1. Exact global check
    if norm in _EXACT:
        return True

    # 2. Fuzzy check against this session's questions
    for prev in (session_questions or []):
        if _similar(question, prev) >= THRESHOLD:
            return True

    # 3. Fuzzy check against global topic bank
    for prev in _BANK.get(_topic_key(topic), []):
        if _similar(question, prev) >= THRESHOLD:
            return True

    return False


def register(question: str, topic: str, session_id: str = "") -> None:
    """
    Register a question as used — call this after a question is accepted.
    Persists immediately.
    """
    _ensure_loaded()
    key  = _topic_key(topic)
    norm = _normalise(question)

    if norm not in _EXACT:
        _EXACT.add(norm)
        _BANK[key].append(question)
        # Keep bank size manageable — keep last 200 per topic
        if len(_BANK[key]) > 200:
            _BANK[key] = _BANK[key][-200:]
        _save()


def get_bank_size(topic: str = None) -> dict:
    """Return current bank stats (for health endpoint)."""
    _ensure_loaded()
    if topic:
        return {"topic": topic, "count": len(_BANK.get(_topic_key(topic), []))}
    return {"total": len(_EXACT), "topics": {k: len(v) for k, v in _BANK.items()}}


def clear_topic(topic: str) -> None:
    """Clear the bank for a specific topic (for testing / reset)."""
    key = _topic_key(topic)
    _BANK.pop(key, None)
    _save()


# ─────────────────────────────────────────────────────────────────────────────
# INTERNAL HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def _topic_key(topic: str) -> str:
    """Normalise topic to a stable dict key."""
    return re.sub(r"[^a-z0-9]", "_", topic.lower().strip())[:40]


def _normalise(text: str) -> str:
    """Lowercase, strip punctuation for exact matching."""
    return re.sub(r"[^a-z0-9 ]", "", text.lower()).strip()


def _similar(a: str, b: str) -> float:
    """
    Combined similarity score.
    Takes the MAX of:
      - SequenceMatcher ratio (catches rewordings)
      - Jaccard similarity on word sets (catches paraphrases)
    """
    seq_ratio = SequenceMatcher(None, a.lower(), b.lower()).ratio()
    jac_ratio = _jaccard(a, b)
    return max(seq_ratio, jac_ratio)


def _jaccard(a: str, b: str) -> float:
    """Word-level Jaccard similarity."""
    stop = {"a","an","the","is","are","what","how","why","when","where",
            "can","you","explain","describe","tell","me","your","in","of","to"}
    sa = {w for w in a.lower().split() if w not in stop and len(w) > 2}
    sb = {w for w in b.lower().split() if w not in stop and len(w) > 2}
    if not sa and not sb:
        return 0.0
    intersection = sa & sb
    union = sa | sb
    return len(intersection) / len(union) if union else 0.0


def _ensure_loaded() -> None:
    global _loaded
    if not _loaded:
        _load()
        _loaded = True


def _load() -> None:
    """Load bank from disk."""
    global _BANK, _EXACT
    if BANK_FILE.exists():
        try:
            data = json.loads(BANK_FILE.read_text())
            for key, questions in data.items():
                _BANK[key] = questions
                for q in questions:
                    _EXACT.add(_normalise(q))
            print(f"[Dedup] Loaded {len(_EXACT)} questions from bank")
        except Exception as e:
            print(f"[Dedup] Load failed: {e}")


def _save() -> None:
    """Persist bank to disk."""
    try:
        BANK_FILE.parent.mkdir(exist_ok=True)
        BANK_FILE.write_text(json.dumps(dict(_BANK), indent=2))
    except Exception as e:
        print(f"[Dedup] Save failed: {e}")