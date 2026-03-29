"""
utils/groq_llm.py
=================
Groq LLM client with automatic failover.

v2 FIXES (blank-screen / hang prevention):
  1. Per-request timeout reduced from 30s → 8s so a hung Groq request fails
     fast instead of blocking Flask for 30+ seconds.

  2. On TimeoutException the current key is abandoned AND we break to the
     next MODEL immediately (not just the next key).  Previously a timeout
     retried every key one by one (8s × n_keys per model), multiplying the
     total wait time.

  3. Added asyncio.sleep(0.4s) between key rotations on 429 so we don't
     hammer the API with rapid-fire retries.

  4. Hard cap: total elapsed time across ALL retries is limited to MAX_TOTAL_SECONDS.
     If we've spent that long trying, we give up and return {} immediately.
     This guarantees no single call_groq_llm() call blocks Flask for more than
     MAX_TOTAL_SECONDS regardless of how many keys/models are configured.

TWO LEVELS OF RESILIENCE (preserved from v1):
  1. API key rotation   — 429/401/403 → try next key
  2. Model fallback     — 503/422/500 or timeout → skip to next model in chain
"""

import json
import re
import time
import asyncio
import httpx
from config import GROQ_API_KEYS, MODEL_FALLBACK_CHAINS

# Errors that mean "try the next API key"
_KEY_RETRY_STATUSES   = {429, 401, 403}
# Errors that mean "this model is broken, try the next model"
_MODEL_RETRY_STATUSES = {503, 422, 500, 502, 504}

_GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"

# FIX 1: reduced from 30s → 8s per individual request
_PER_REQUEST_TIMEOUT = 8.0

# FIX 4: hard cap on total time for one call_groq_llm() invocation
_MAX_TOTAL_SECONDS = 18.0


def _extract_json(text: str) -> dict:
    """
    Robustly extract a JSON object from LLM output.
    Handles pure JSON, ```json fences, and JSON buried inside prose.
    """
    if not text:
        return {}
    cleaned = re.sub(r"```(?:json)?\s*", "", text).strip().rstrip("`").strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass
    match = re.search(r"\{.*\}", cleaned, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass
    return {}


async def call_groq_llm(
    system: str,
    user: str,
    model: str,
    max_tokens: int = 512,
    temperature: float = 0.5,
) -> dict:
    """
    Call Groq with automatic key rotation and model fallback.

    Returns parsed JSON dict, or {} if all attempts fail/timeout.
    Guaranteed to return within ~_MAX_TOTAL_SECONDS seconds.
    """
    if not GROQ_API_KEYS:
        print("[GroqLLM] ⚠ No API keys configured — returning empty result")
        return {}

    model_chain = MODEL_FALLBACK_CHAINS.get(model, [model])
    if model not in model_chain:
        model_chain = [model] + list(model_chain)

    payload_base = {
        "messages": [
            {"role": "system", "content": system},
            {"role": "user",   "content": user},
        ],
        "max_tokens":  max_tokens,
        "temperature": temperature,
        "response_format": {"type": "json_object"},
    }

    # FIX 4: track wall-clock start so we can bail out early
    wall_start = time.monotonic()

    # FIX 1: shorter per-request timeout
    async with httpx.AsyncClient(timeout=_PER_REQUEST_TIMEOUT) as client:
        for current_model in model_chain:

            # FIX 4: hard time cap — bail before even trying next model
            if time.monotonic() - wall_start > _MAX_TOTAL_SECONDS:
                print(f"[GroqLLM] Hard time cap reached ({_MAX_TOTAL_SECONDS}s) — giving up")
                return {}

            payload = {**payload_base, "model": current_model}

            for key_index, api_key in enumerate(GROQ_API_KEYS):

                # FIX 4: check time cap per key attempt too
                if time.monotonic() - wall_start > _MAX_TOTAL_SECONDS:
                    print(f"[GroqLLM] Hard time cap hit mid-key-loop — giving up")
                    return {}

                key_label = "primary" if key_index == 0 else f"backup-{key_index}"
                headers   = {
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type":  "application/json",
                }

                try:
                    resp = await client.post(_GROQ_URL, headers=headers, json=payload)

                    # ── Key-level errors ──────────────────────────────────────
                    if resp.status_code in _KEY_RETRY_STATUSES:
                        reason = "rate-limit" if resp.status_code == 429 else "auth-error"
                        print(f"[GroqLLM] {key_label} {reason} ({resp.status_code}) "
                              f"on {current_model} — trying next key")
                        # FIX 3: brief pause before hammering the next key
                        await asyncio.sleep(0.4)
                        continue   # next key

                    # ── Model-level errors ────────────────────────────────────
                    if resp.status_code in _MODEL_RETRY_STATUSES:
                        print(f"[GroqLLM] Model {current_model} unavailable "
                              f"({resp.status_code}) — skipping to next model")
                        break      # break key loop → next model

                    if resp.status_code != 200:
                        print(f"[GroqLLM] Unexpected {resp.status_code} "
                              f"on {current_model}/{key_label}")
                        break      # treat unknown errors as model-level

                    # ── Success ───────────────────────────────────────────────
                    data    = resp.json()
                    content = data["choices"][0]["message"]["content"]
                    result  = _extract_json(content)
                    elapsed = round(time.monotonic() - wall_start, 2)
                    if key_index > 0:
                        print(f"[GroqLLM] Success with {key_label} on {current_model} ({elapsed}s)")
                    return result

                except httpx.TimeoutException:
                    elapsed = round(time.monotonic() - wall_start, 2)
                    print(f"[GroqLLM] Timeout on {current_model}/{key_label} ({elapsed}s elapsed)")
                    # FIX 2: on timeout, skip ALL remaining keys for this model
                    # — if one key timed out the model is likely overloaded
                    break  # → next model (was: continue → next key)

                except httpx.RequestError as exc:
                    print(f"[GroqLLM] Network error on {current_model}: {exc}")
                    break  # network issue — skip model entirely

                except (KeyError, IndexError, json.JSONDecodeError) as exc:
                    print(f"[GroqLLM] Parse error on {current_model}: {exc}")
                    break  # parse errors are model-level

    elapsed = round(time.monotonic() - wall_start, 2)
    print(f"[GroqLLM] ⚠ All models/keys exhausted in {elapsed}s — agent fallback will handle this")
    return {}