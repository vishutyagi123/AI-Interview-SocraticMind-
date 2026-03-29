"""
config.py
=========
Central configuration for SocraticMind.
All agents and app.py import from here — never hardcode values elsewhere.

HOW TO SET YOUR API KEY:
  Option A (recommended): set env variables
      GROQ_API_KEY=gsk_...
      GROQ_API_KEY_BACKUP=gsk_...
  Option B (quick dev): paste keys directly below.

FAILOVER BEHAVIOUR:
  - Every Groq call tries GROQ_API_KEY first.
  - On rate-limit (429) or auth error (401), it automatically retries
    with GROQ_API_KEY_BACKUP — zero downtime, zero code changes needed.
  - If both keys fail, the per-agent hardcoded fallback takes over
    so the interview session never crashes.
  - Model fallback chain (per tier):
      FAST:    llama-3.1-8b-instant  → llama3-8b-8192
      QUALITY: llama-3.3-70b-versatile → llama-3.1-70b-versatile → llama3-70b-8192
      ANALYST: llama-3.3-70b-versatile → llama-3.1-70b-versatile → llama3-70b-8192
"""

import os
from dotenv import load_dotenv

# 🔥 Load .env file (THIS WAS MISSING)
load_dotenv()

# ── API Keys ───────────────────────────────────────────────

GROQ_API_KEY: str = os.getenv("GROQ_API_KEY")
GROQ_API_KEY_BACKUP: str = os.getenv("GROQ_API_KEY_BACKUP")

# Debug print (REMOVE later)
print("PRIMARY KEY:", GROQ_API_KEY)
print("BACKUP KEY:", GROQ_API_KEY_BACKUP)
# ── API Keys ─────────────────────────────────────────────────────────────────
# Primary key — used first on every request.
# Set via environment variable: export GROQ_API_KEY=gsk_...
# Never hardcode keys here — use a .env file or shell environment.
# GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")

# # Backup key — auto-activated when primary hits rate limit or auth error.
# # Set via environment variable: export GROQ_API_KEY_BACKUP=gsk_...
# GROQ_API_KEY_BACKUP: str = os.getenv("GROQ_API_KEY_BACKUP", "")

# Ordered list used by groq_llm.py — first healthy key wins.
GROQ_API_KEYS: list[str] = [k for k in [GROQ_API_KEY, GROQ_API_KEY_BACKUP] if k and "PASTE" not in k]

# ── Model tier assignments ────────────────────────────────────────────────────
# Primary models (best quality for each tier).
MODEL_FAST    = "llama-3.1-8b-instant"      # Question Generator  (lowest latency)
MODEL_QUALITY = "llama-3.3-70b-versatile"   # Evaluator · Mentor · Profiler
MODEL_ANALYST = "llama-3.3-70b-versatile"   # JD Analyzer · Report · Feedback

# Fallback model chains — tried in order if the primary model is unavailable.
# groq_llm.py walks this list automatically; no agent code needs to change.
MODEL_FAST_FALLBACKS: list[str] = [
    "llama-3.1-8b-instant",
    "llama3-8b-8192",           # older but always available on Groq
]

MODEL_QUALITY_FALLBACKS: list[str] = [
    "llama-3.3-70b-versatile",
    "llama-3.1-70b-versatile",  # slightly older, same context window
    "llama3-70b-8192",          # legacy, very stable
]

MODEL_ANALYST_FALLBACKS: list[str] = [
    "llama-3.3-70b-versatile",
    "llama-3.1-70b-versatile",
    "llama3-70b-8192",
]

# Map tier name → fallback chain (used by groq_llm.py).
MODEL_FALLBACK_CHAINS: dict[str, list[str]] = {
    MODEL_FAST:    MODEL_FAST_FALLBACKS,
    MODEL_QUALITY: MODEL_QUALITY_FALLBACKS,
    MODEL_ANALYST: MODEL_ANALYST_FALLBACKS,
}

# ── Interview defaults ────────────────────────────────────────────────────────
DEFAULT_NUM_QUESTIONS  = 10
MAX_NUM_QUESTIONS      = 15
DEFAULT_DIFFICULTY     = "medium"
DIFFICULTY_LEVELS      = ["easy", "medium", "hard", "expert"]

# ── Socratic mentor settings ──────────────────────────────────────────────────
SOCRATIC_MAX_ITERATIONS = 3        # probes per question before moving on
MENTOR_REVEAL_THRESHOLD = 3        # attempts before answer is revealed

# ── Flask server ──────────────────────────────────────────────────────────────
FLASK_HOST  = "0.0.0.0"
FLASK_PORT  = 5000
FLASK_DEBUG = True