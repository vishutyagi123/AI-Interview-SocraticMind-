"""
agents/evaluation_agent.py  —  AGENT 3: Answer Evaluator
=========================================================
Deeply evaluates a candidate answer and returns a structured
scoring object with strengths, weaknesses, missing concepts,
confidence level, and a specific weak_area for targeting.

Uses MODEL_QUALITY with reduced token budget for faster turnaround.
"""

import json
from utils.groq_llm import call_groq_llm
from config import MODEL_QUALITY

SYSTEM_PROMPT = """You are a technical interview evaluation engine.

Evaluate the candidate's response DEEPLY and output ONLY valid JSON:
{
  "score": <0-10 integer>,
  "strengths": ["strength1", "strength2"],
  "weaknesses": ["weakness1"],
  "missing_concepts": ["concept1"],
  "confidence_level": "high | medium | low",
  "correctness": "correct | partially_correct | incorrect",
  "struggle_level": "none | mild | moderate | severe",
  "feedback": "1-2 sentences: what they got right AND the exact gap to fix.",
  "weak_area": "single most specific concept (5 words max)",
  "ideal_answer": "A concise model answer (3-5 sentences) covering all key points a strong candidate should mention."
}

SCORING RULES:
- 0-3  → incorrect: major misconceptions or missing answer
- 4-6  → partially_correct: understands basics but gaps exist
- 7-8  → correct: solid answer, minor improvements possible
- 9-10 → correct: excellent depth and accuracy

FIELD RULES:
- strengths: 1-3 specific things done well
- weaknesses: 1-3 specific gaps or errors
- missing_concepts: concepts they should have mentioned
- feedback must be direct, specific, and actionable — not generic praise
- weak_area: precise concept like "hash collision handling" not just "arrays"
- ideal_answer: write this as if YOU are the ideal candidate answering the question — cover mechanism, trade-offs, and a real example in 3-5 sentences

No explanations outside JSON. JSON only."""


async def evaluate(question: str, answer: str, jd_data: dict) -> dict:
    """
    Evaluate a candidate's answer.

    Args:
        question: The interview question asked
        answer:   The candidate's answer text
        jd_data:  JD context (role, topics) for relevance scoring

    Returns:
        dict with score, strengths, weaknesses, correctness, feedback, weak_area, etc.
    """
    context = json.dumps({
        "question": question,
        "answer":   answer,
        "jd_context": {
            "role":   jd_data.get("role", ""),
            "topics": jd_data.get("topics", []),
        },
    })

    # Bump token budget slightly to accommodate ideal_answer field
    result = await call_groq_llm(
        system=SYSTEM_PROMPT,
        user=context,
        model=MODEL_QUALITY,
        max_tokens=380,
        temperature=0.25,
    )

    # ── Ensure all required fields exist with sensible defaults ───────────────
    defaults = {
        "score":            5,
        "strengths":        ["Attempted the question"],
        "weaknesses":       ["Answer could be more detailed"],
        "missing_concepts": [],
        "confidence_level": "medium",
        "correctness":      "partially_correct",
        "struggle_level":   "mild",
        "feedback":         "Your answer touched the concept but lacked depth on the underlying mechanism.",
        "weak_area":        "conceptual depth",
        "ideal_answer":     "A strong answer would explain the underlying mechanism, discuss relevant trade-offs, and give a concrete real-world example.",
    }
    for key, val in defaults.items():
        if key not in result or result[key] is None:
            result[key] = val

    # Clamp score to 0-10
    try:
        result["score"] = max(0, min(10, int(result["score"])))
    except (ValueError, TypeError):
        result["score"] = 5

    return result