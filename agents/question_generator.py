"""
agents/question_generator.py  —  AGENT 2: Question Generator
=============================================================
Generates unique, adaptive, JD-aligned interview questions.

Key features:
  - Weighted random topic selection from JD data
  - Fuzzy dedup against all previously asked questions
  - Warm-up logic (easy/medium for first 2 rounds)
  - Adapts question style to reasoning fingerprint
  - Retries up to 3 times on duplicate detection
  - Falls back to template questions if LLM fails
"""

import json
import random
import uuid
from difflib import SequenceMatcher
from utils.groq_llm import call_groq_llm
from config import MODEL_FAST

# ── Question style and perspective pools ─────────────────────────────────────
_FORMATS = [
    "theoretical", "practical", "scenario-based", "edge-case",
    "system-design", "compare-contrast", "debug-this", "what-if",
]

_PERSPECTIVES = [
    "conceptual understanding", "real-world application",
    "edge case handling", "trade-off analysis",
    "first-principles reasoning", "debugging perspective",
    "scalability concern", "security angle",
]

_SYSTEM_PROMPT = """You are an AI technical interviewer generating UNIQUE interview questions.

Generate ONE concise interview question (1-2 sentences max) based on the context provided.

ABSOLUTE RULES:
- NEVER repeat or rephrase any question from the "questions_already_asked" list
- The question MUST be about the SELECTED TOPIC and SELECTED SUB-TOPIC
- Test THINKING and REASONING, not memorisation
- Use the given difficulty level
- Use the given question_format style
- Approach from the given perspective angle
- If "rag_context" is non-empty, you MAY draw on it to make the question more specific
  and grounded in the actual JD/PDF content — but do NOT quote it verbatim

Adapt based on reasoning_fingerprint:
  depth=surface   → ask about 1 small concept
  depth=moderate  → connect 2 concepts
  depth=deep      → require multi-step reasoning or trade-offs

  thinking_type=rote      → add "how would you verify?" angle
  thinking_type=logical   → ask "walk through your reasoning"
  thinking_type=intuitive → ask for analogy + justification

  confidence_bias=overconfident   → add "what could go wrong?" angle
  confidence_bias=underconfident  → add "start from first principles"

Output ONLY valid JSON:
{
  "question": "your unique question here"
}

No explanations. JSON only."""


def _weighted_topic_choice(topics: list, weights: dict) -> str:
    """Pick a topic by weight (higher weight = more likely)."""
    pool = []
    for t in topics:
        w = int(weights.get(t, 1))
        pool.extend([t] * max(1, w))
    return random.choice(pool) if pool else (topics[0] if topics else "General Engineering")


def _fallback_question(topic: str, subtopic: str, difficulty: str) -> str:
    templates = {
        "easy":   f"Can you explain {subtopic} and why it matters in practice?",
        "medium": f"How does {subtopic} work internally — walk me through the mechanism step by step.",
        "hard":   f"What are the trade-offs and edge cases in {subtopic} at scale?",
        "expert": f"Design a system component that relies on {subtopic} and identify its failure modes.",
    }
    return templates.get(difficulty, f"Explain {subtopic} and its real-world significance in the context of {topic}.")


async def generate_question(
    jd_data: dict,
    fingerprint: dict,
    current_difficulty: str,
    history: list,
    scenario_mode: str = "both",
    round_index: int = 1,
    questions_asked: list | None = None,
    rag_context: str = "",
) -> dict:
    """
    Generate one adaptive, non-duplicate interview question.

    Args:
        rag_context: Optional RAG-retrieved passage to ground the question in
                     PDF/JD content. Passed through to the LLM context.

    Returns: {"question": str, "topic": str, "subtopic": str, "difficulty": str}
    """
    # ── 1. Warm-up: force easy/medium for first 2 rounds ─────────────────────
    difficulty = current_difficulty
    if round_index <= 2:
        difficulty = "easy"
    elif round_index == 3:
        difficulty = "medium"

    # ── 2. Extract JD structure ───────────────────────────────────────────────
    topics       = jd_data.get("topics", ["General Engineering"])
    weights      = jd_data.get("weights", {t: 1 for t in topics})
    subtopic_map = jd_data.get("subtopics", {t: [t] for t in topics})

    # ── 3. Build full dedup list ──────────────────────────────────────────────
    all_asked: list[str] = list(questions_asked or [])
    for h in history:
        q = h.get("question", "")
        if q and q not in all_asked:
            all_asked.append(q)

    # ── 4. Retry loop (up to 3 attempts to get a unique question) ─────────────
    for attempt in range(3):
        chosen_topic    = _weighted_topic_choice(topics, weights)
        subtopic_pool   = subtopic_map.get(chosen_topic, [chosen_topic])
        chosen_subtopic = random.choice(subtopic_pool)
        chosen_format   = random.choice(_FORMATS)
        chosen_persp    = random.choice(_PERSPECTIVES)
        salt            = uuid.uuid4().hex[:8]
        temp            = round(random.uniform(0.88, 1.1), 2)

        context = json.dumps({
            "jd_data": {
                "role": jd_data.get("role", ""),
                "topics": topics,
            },
            "SELECTED_TOPIC":    chosen_topic,
            "SELECTED_SUBTOPIC": chosen_subtopic,
            "difficulty":        difficulty,
            "question_format":   chosen_format,
            "perspective":       chosen_persp,
            "random_salt":       salt,
            "reasoning_fingerprint":   fingerprint,
            "questions_already_asked": all_asked[-12:],
            "round_index":   round_index,
            "scenario_mode": scenario_mode,
            # RAG-grounded context (empty string when no PDF was provided)
            "rag_context": rag_context or "",
        })

        result = await call_groq_llm(
            system=_SYSTEM_PROMPT,
            user=context,
            model=MODEL_FAST,
            max_tokens=140,
            temperature=temp,
        )

        question_text = result.get("question", "").strip()

        # ── 5. Fallback if LLM returned nothing ───────────────────────────────
        if not question_text:
            question_text = _fallback_question(chosen_topic, chosen_subtopic, difficulty)

        # ── 6. Fuzzy dedup check ──────────────────────────────────────────────
        is_duplicate = any(
            SequenceMatcher(None, question_text.lower(), prev.lower()).ratio() >= 0.72
            for prev in all_asked
        )

        if not is_duplicate:
            return {
                "question":   question_text,
                "topic":      chosen_topic,
                "subtopic":   chosen_subtopic,
                "difficulty": difficulty,
            }

        # Different angle on retry
        if attempt < 2:
            all_asked.append(question_text)  # so next attempt avoids it too

    # ── 7. Final safety fallback ──────────────────────────────────────────────
    return {
        "question":   _fallback_question(chosen_topic, chosen_subtopic, difficulty),
        "topic":      chosen_topic,
        "subtopic":   chosen_subtopic,
        "difficulty": difficulty,
    }