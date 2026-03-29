"""
utils/llm.py
============
Alias module — agents that import `from utils.llm import call_llm`
use the same Groq backend as agents that use groq_llm.

call_llm() is identical to call_groq_llm() but defaults to MODEL_ANALYST
(the heavier model) which is correct for JD Analyzer, Reasoning Profiler,
and Final Feedback Agent.
"""

from utils.groq_llm import call_groq_llm
from config import MODEL_ANALYST


async def call_llm(
    system: str,
    user: str,
    model: str = MODEL_ANALYST,
    max_tokens: int = 512,
    temperature: float = 0.4,
) -> dict:
    """Drop-in replacement for the original call_llm used by existing agents."""
    return await call_groq_llm(
        system=system,
        user=user,
        model=model,
        max_tokens=max_tokens,
        temperature=temperature,
    )