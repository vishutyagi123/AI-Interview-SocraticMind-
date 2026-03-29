"""
agents/adaptive_controller.py  —  AGENT 5: Adaptive Difficulty Controller
==========================================================================
Pure deterministic logic — NO LLM call needed.
Decides the next difficulty level based on evaluation results and fingerprint.

Rules (in priority order):
  1. Clear upgrade:   correct + score>=8 + high confidence + no struggle → +1 level
  2. Clear downgrade: severe struggle OR incorrect OR score<=3             → -1 level
  3. Partial weak:    partially_correct + score<5                          → -1 level
  4. Partial ok:      partially_correct + score>=5                         → hold
  5. Default:         maintain current level
"""

from config import DIFFICULTY_LEVELS


def _clamp(idx: int) -> str:
    """Keep index within valid range and return difficulty string."""
    return DIFFICULTY_LEVELS[max(0, min(len(DIFFICULTY_LEVELS) - 1, idx))]


async def adjust(
    fingerprint: dict,
    evaluation: dict,
    current_difficulty: str = "medium",
) -> dict:
    """
    Determine the next difficulty level.

    Args:
        fingerprint:        Current reasoning fingerprint
        evaluation:         Output from evaluation_agent.evaluate()
        current_difficulty: Current difficulty level string

    Returns:
        {"next_difficulty": str}
    """
    if current_difficulty not in DIFFICULTY_LEVELS:
        current_difficulty = "medium"

    idx         = DIFFICULTY_LEVELS.index(current_difficulty)
    correctness = evaluation.get("correctness")
    confidence  = evaluation.get("confidence_level")
    struggle    = evaluation.get("struggle_level")
    score       = evaluation.get("score", 5)

    # ── Rule 1: Clear upgrade ─────────────────────────────────────────────────
    if (
        correctness == "correct"
        and score >= 8
        and confidence == "high"
        and struggle in ("none", "mild", None)
    ):
        return {"next_difficulty": _clamp(idx + 1)}

    # ── Rule 2: Clear downgrade ───────────────────────────────────────────────
    if struggle == "severe" or correctness == "incorrect" or score <= 3:
        return {"next_difficulty": _clamp(idx - 1)}

    # ── Rule 3: Partial weak ──────────────────────────────────────────────────
    if correctness == "partially_correct" and score < 5:
        return {"next_difficulty": _clamp(idx - 1)}

    # ── Rule 4 & 5: Hold ─────────────────────────────────────────────────────
    return {"next_difficulty": _clamp(idx)}


def get_performance_trend(scores: list[int]) -> dict:
    """
    Compute trend metrics from a list of scores (0-10 scale).
    Used by the report and UI fingerprint display.
    """
    if not scores:
        return {"avg": 0, "trend": "flat", "peak": 0, "low": 0}

    avg = sum(scores) / len(scores)
    peak = max(scores)
    low  = min(scores)

    # Trend over last 3
    recent = scores[-3:]
    if len(recent) >= 2:
        delta = recent[-1] - recent[0]
        trend = "improving" if delta > 1 else "declining" if delta < -1 else "flat"
    else:
        trend = "flat"

    return {
        "avg":   round(avg, 1),
        "trend": trend,
        "peak":  peak,
        "low":   low,
        "count": len(scores),
    }