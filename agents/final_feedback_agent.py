"""
agents/final_feedback_agent.py  —  AGENT 7: Final Feedback / Report Generator
==============================================================================
Analyzes the FULL session (all Q&A + evaluations + fingerprint + socratic history)
and generates a comprehensive cognitive report.

This is the most "expensive" agent — runs ONCE at the end of the session.
Uses MODEL_ANALYST with generous token budget for thorough analysis.
"""

import json
from utils.llm import call_llm
from config import MODEL_ANALYST

SYSTEM_PROMPT = """You are an expert cognitive analyst evaluating a complete technical interview session.

Analyze ALL questions, answers, evaluations, and the reasoning fingerprint to generate:
  1. A cognitive summary of HOW this person thinks
  2. A reasoning fingerprint (depth, thinking_type, confidence_bias)
  3. Strong and weak areas
  4. Per-question concise feedback
  5. A 5-step improvement plan
  6. A socratic learning assessment

Look for patterns across the ENTIRE session:
- How does reasoning evolve question to question?
- Are there consistent concept gaps or misconceptions?
- Does confidence match actual accuracy?
- What thinking style dominates?

Output ONLY valid JSON:
{
  "cognitive_summary": "3-4 honest, specific sentences about this person's thinking patterns and knowledge state.",
  "reasoning_fingerprint": {
    "depth": "surface | moderate | deep",
    "thinking_type": "rote | logical | intuitive | hybrid",
    "confidence_bias": "overconfident | balanced | underconfident"
  },
  "strong_areas": ["specific strength 1", "specific strength 2"],
  "weak_areas": ["specific weak area 1", "specific weak area 2"],
  "concept_gaps": ["gap1", "gap2", "gap3"],
  "primary_strength": "their single best quality (short phrase)",
  "top_gap": "their single biggest gap (short phrase)",
  "areas_of_improvement": ["improvement area 1", "improvement area 2", "improvement area 3"],
  "communication_feedback": "Short assessment of how they communicate ideas.",
  "improvement_plan": [
    "Specific action step 1",
    "Specific action step 2",
    "Specific action step 3",
    "Specific action step 4",
    "Specific action step 5"
  ],
  "socratic_summary": "2-3 sentences about what the Socratic session revealed and how effectively they responded to guided questioning.",
  "overall_score": <0-100 integer representing overall interview performance>
}

Be honest and specific — avoid generic phrases like "practice more" or "good effort".
No explanations outside JSON. JSON only."""


async def generate_final_feedback(
    questions: list,
    answers: list,
    evaluations: list,
    fingerprint_history: list | None = None,
    difficulty_history: list | None = None,
    performance_trend: list | None = None,
    socratic_history: list | None = None,
    topic: str = "Technical Concepts",
    jd_data: dict | None = None,
) -> dict:
    """
    Generate comprehensive cognitive feedback for the complete session.

    Args:
        questions:           List of questions asked
        answers:             List of candidate answers
        evaluations:         List of evaluation dicts from evaluation_agent
        fingerprint_history: List of fingerprint snapshots (optional)
        difficulty_history:  List of difficulty levels used (optional)
        performance_trend:   List of scores (0-10) per question (optional)
        socratic_history:    List of socratic messages (optional)
        topic:               Session topic/role
        jd_data:             JD data dict (optional)

    Returns:
        Comprehensive report dict
    """
    # ── Build per-question summary for context ─────────────────────────────────
    per_question = []
    for i in range(min(len(questions), len(answers))):
        entry = {
            "q_num": i + 1,
            "q":     questions[i],
            "a":     answers[i][:300],  # cap for token budget
        }
        if i < len(evaluations):
            ev = evaluations[i]
            entry["eval"] = {
                "score":       ev.get("score", 5),
                "correctness": ev.get("correctness", ""),
                "feedback":    ev.get("feedback", ""),
                "weak_area":   ev.get("weak_area", ""),
            }
        if difficulty_history and i < len(difficulty_history):
            entry["difficulty"] = difficulty_history[i]
        per_question.append(entry)

    avg_score = 0
    if performance_trend:
        avg_score = round(sum(performance_trend) / len(performance_trend), 1)

    final_fingerprint = (fingerprint_history or [{}])[-1]

    context = json.dumps({
        "topic":            topic,
        "role":             (jd_data or {}).get("role", topic),
        "session_data":     per_question,
        "final_fingerprint": final_fingerprint,
        "avg_score_0_10":  avg_score,
        "total_questions": len(questions),
        "socratic_exchanges": len(socratic_history or []),
        "difficulty_progression": difficulty_history or [],
    })

    result = await call_llm(
        system=SYSTEM_PROMPT,
        user=context,
        model=MODEL_ANALYST,
        max_tokens=900,
        temperature=0.3,
    )

    # ── Build fallback from available data ─────────────────────────────────────
    all_weak_areas = list({
        ev.get("weak_area", "")
        for ev in evaluations
        if ev.get("weak_area") and ev.get("correctness") != "correct"
    })

    defaults = {
        "cognitive_summary": (
            f"The candidate demonstrated {final_fingerprint.get('thinking_type','logical')} thinking "
            f"across {len(questions)} questions on {topic}. "
            f"Average score: {avg_score}/10. "
            f"Consistency: {final_fingerprint.get('consistency_score', 50)}/100."
        ),
        "reasoning_fingerprint": {
            "depth":            final_fingerprint.get("depth", "moderate"),
            "thinking_type":    final_fingerprint.get("thinking_type", "logical"),
            "confidence_bias":  final_fingerprint.get("confidence_bias", "balanced"),
        },
        "strong_areas":       [],
        "weak_areas":         all_weak_areas[:3],
        "concept_gaps":       all_weak_areas[:3],
        "primary_strength":   "Shows effort to reason through problems",
        "top_gap":            all_weak_areas[0] if all_weak_areas else "Needs more conceptual depth",
        "areas_of_improvement": all_weak_areas[:3] or [topic],
        "communication_feedback": "Communication was generally clear and structured.",
        "improvement_plan": [
            f"Deep-dive into {all_weak_areas[0] if all_weak_areas else topic} using first-principles study",
            "Practice explaining concepts out loud before coding them",
            "Solve 2 LeetCode/system design problems daily with written reasoning",
            "Review each weak area by building a small project around it",
            "Do mock interviews weekly and compare scores over time",
        ],
        "socratic_summary": (
            "The Socratic session targeted identified weak areas through guided questioning. "
            "The candidate's engagement with counter-questions revealed the depth of conceptual understanding."
        ),
        "overall_score": int(avg_score * 10),
    }

    if not isinstance(result, dict) or not result.get("cognitive_summary"):
        return defaults

    for key, val in defaults.items():
        if key not in result or not result[key]:
            result[key] = val

    # Clamp overall_score
    try:
        result["overall_score"] = max(0, min(100, int(result["overall_score"])))
    except (ValueError, TypeError):
        result["overall_score"] = int(avg_score * 10)

    return result


def build_per_question_feedback(session: dict) -> list:
    """
    Build the per_question_feedback list for the API response.
    Called by app.py /api/report endpoint.

    Safe against:
      - Missing "evaluation" key (skipped questions / early-exit turns)
      - Missing "question" key (malformed entries)
      - None values in evaluation dict
    """
    result = []
    for h in session.get("history", []):
        # Skip malformed entries with no question text
        if not h.get("question"):
            continue

        # h["evaluation"] may be absent if the user skipped before answering
        ev = h.get("evaluation") or {}

        result.append({
            "question":     h.get("question", ""),
            "answer":       h.get("answer", ""),           # user's actual response
            "ideal_answer": ev.get("ideal_answer", ""),    # model answer from Agent 3
            "feedback":     ev.get("feedback", "No detailed feedback available for this question."),
            "weak_area":    ev.get("weak_area", ""),
            "correctness":  ev.get("correctness", "partially_correct"),
            "score":        ev.get("score", 5),
            "strengths":    ev.get("strengths", []),
            "weaknesses":   ev.get("weaknesses", []),
            "topic":        h.get("topic", ""),
            "difficulty":   h.get("difficulty", ""),
        })

    return result