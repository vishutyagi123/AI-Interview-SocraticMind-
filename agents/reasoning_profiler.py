"""
agents/reasoning_profiler.py  —  AGENT 4: Reasoning Profiler
============================================================
Profiles HOW the candidate thinks, not just whether they're correct.
Produces an evolving reasoning fingerprint updated after each answer.

This runs AFTER evaluation_agent and BEFORE adaptive_controller.
The fingerprint influences: question generation style, socratic probing,
and final report generation.
"""

import json
from utils.llm import call_llm
from config import MODEL_QUALITY

SYSTEM_PROMPT = """You are a cognitive analysis engine that profiles reasoning patterns.

Analyze the candidate's response, the question, and the evaluation to update a running reasoning fingerprint.

Use the previous_fingerprint to UPDATE tendencies over time — don't start fresh each time.
Apply exponential smoothing: new_value = 0.6 * previous + 0.4 * new_observation

IMPORTANT: If this is round 1 (previous consistency_score is 0), set consistency_score based only
on this single answer quality — low scores (5-20) for vague answers, mid (30-50) for reasonable ones.
Scores should GROW across rounds as the candidate demonstrates consistent reasoning patterns.

Output ONLY valid JSON:
{
  "depth": "surface | moderate | deep",
  "thinking_type": "rote | logical | intuitive | hybrid",
  "confidence_bias": "overconfident | underconfident | balanced",
  "learning_velocity": "slow | medium | fast",
  "error_pattern": [],
  "consistency_score": <0-100 integer>
}

FIELD RULES:
- depth: how deeply do they reason? surface=keywords only, deep=mechanisms+tradeoffs
- thinking_type: rote=memorised facts, logical=structured deduction, intuitive=pattern-match, hybrid=mix
- confidence_bias: do they hedge too much or claim certainty without basis?
- learning_velocity: are they correcting misconceptions faster across questions?
- error_pattern: list from ["conceptual", "calculation", "misinterpretation", "incomplete"]
- consistency_score: starts at 0, rises as consistent reasoning is demonstrated across multiple answers

No explanations. JSON only."""


# ── Default starting fingerprint ──────────────────────────────────────────────
DEFAULT_FINGERPRINT = {
    "depth":             "surface",
    "thinking_type":     "logical",
    "confidence_bias":   "balanced",
    "learning_velocity": "medium",
    "error_pattern":     [],
    "consistency_score": 0,   # starts at 0, builds up as answers accumulate
}


async def profile(
    question: str,
    answer: str,
    evaluation: dict,
    previous_fingerprint: dict | None = None,
    current_difficulty: str = "medium",
) -> dict:
    """
    Update reasoning fingerprint based on latest Q&A and evaluation.

    Args:
        question:             The question asked
        answer:               The candidate's answer
        evaluation:           Output from evaluation_agent.evaluate()
        previous_fingerprint: Previous fingerprint dict (or None for first question)
        current_difficulty:   Current difficulty level

    Returns:
        Updated fingerprint dict
    """
    context = json.dumps({
        "question":            question,
        "answer":              answer,
        "evaluation":          evaluation,
        "previous_fingerprint": previous_fingerprint or DEFAULT_FINGERPRINT,
        "current_difficulty":  current_difficulty,
    })

    result = await call_llm(
        system=SYSTEM_PROMPT,
        user=context,
        model=MODEL_QUALITY,
        max_tokens=200,
        temperature=0.25,
    )

    # Fill missing keys from defaults
    if not isinstance(result, dict):
        return dict(DEFAULT_FINGERPRINT)

    for key, val in DEFAULT_FINGERPRINT.items():
        if key not in result or result[key] is None:
            result[key] = val

    # Clamp consistency_score
    try:
        result["consistency_score"] = max(0, min(100, int(result["consistency_score"])))
    except (ValueError, TypeError):
        result["consistency_score"] = 0

    return result


def get_default_fingerprint() -> dict:
    """Return a fresh default fingerprint."""
    return dict(DEFAULT_FINGERPRINT)


def fingerprint_to_ui_scores(fp: dict) -> dict:
    """
    Convert fingerprint to the 5-metric UI scores expected by app.jsx.
    Returns: {depth, acc, conf, cons, orig} — all 0-100.

    Scores start low and rise as the backend accumulates real signal.
    NOTE: orchestrator.process_answer() overwrites 'acc' with the real
    evaluation score (score_10 * 10).
    """
    # Map categorical values to numeric ranges that START LOW and grow
    # surface=10-30, moderate=40-65, deep=70-90
    depth_map  = {"surface": 20, "moderate": 55, "deep": 82}
    # underconfident=15, balanced=45, overconfident=70
    conf_map   = {"overconfident": 70, "balanced": 45, "underconfident": 15}
    # rote=20, logical=50, intuitive=62, hybrid=78
    think_map  = {"rote": 20, "logical": 50, "intuitive": 62, "hybrid": 78}

    return {
        "depth": depth_map.get(fp.get("depth", "surface"), 20),
        "acc":   0,    # placeholder — orchestrator sets this to score_10 * 10
        "conf":  conf_map.get(fp.get("confidence_bias", "balanced"), 45),
        "cons":  fp.get("consistency_score", 0),
        "orig":  think_map.get(fp.get("thinking_type", "logical"), 50),
    }