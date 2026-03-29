"""
app.py  —  SocraticMind v3  (Orchestrated Multi-Agent Edition)
==============================================================
This file is intentionally thin.
All agent coordination lives in orchestrator.py.
All session persistence lives in store/session_store.py.
All voice processing lives in voice/stt_engine.py.
All RAG logic lives in rag/pdf_rag.py + rag/question_dedup.py.

Routes:
  POST /api/start           → orchestrator.start_interview()
  POST /api/answer          → orchestrator.process_answer()
  POST /api/mentor/start    → orchestrator.start_mentor()
  POST /api/mentor/answer   → orchestrator.mentor_turn()
  POST /api/mentor/nudge    → orchestrator.mentor_idle_nudge()   ← NEW
  GET  /api/report/<id>     → orchestrator.generate_report()
  POST /api/stt             → voice/stt_engine.transcribe_base64()
  POST /api/vad             → voice/stt_engine.VADState
  GET  /api/sessions        → session_store.list_sessions()
  GET  /api/health          → system status

NGROK SETUP:
  pip install pyngrok
  Then set your ngrok authtoken below (free at https://dashboard.ngrok.com)
"""

import asyncio
import os
import uuid

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

from config import FLASK_HOST, FLASK_PORT, FLASK_DEBUG, DEFAULT_NUM_QUESTIONS, MAX_NUM_QUESTIONS
import orchestrator
from store.session_store import exists, list_sessions
from voice.stt_engine import transcribe_base64, VADState
from rag.question_dedup import get_bank_size

# ══════════════════════════════════════════════════════════════════════════════
# NGROK CONFIGURATION  ← Edit this section
# ══════════════════════════════════════════════════════════════════════════════
ENABLE_NGROK   = os.getenv("ENABLE_NGROK", "true").lower() == "true"
NGROK_AUTHTOKEN = os.getenv("NGROK_AUTHTOKEN", "")   # Set via env var — do NOT hardcode
#                 Get free token at: https://dashboard.ngrok.com/get-started/your-authtoken
# ══════════════════════════════════════════════════════════════════════════════

# ── Flask setup ───────────────────────────────────────────────────────────────
app = Flask(__name__, static_folder="ui", static_url_path="/ui")
CORS(app)

# Per-session VAD state objects
_VAD_STATES: dict[str, VADState] = {}


def _run(coro):
    """Run async coroutine from sync Flask route."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


# ─────────────────────────────────────────────────────────────────────────────
# POST /api/start
# ─────────────────────────────────────────────────────────────────────────────
@app.route("/api/start", methods=["POST"])
def start_session():
    data          = request.json or {}
    domain        = data.get("domain", "").strip()
    jd_text       = data.get("jd_text", "").strip()
    pdf_text      = data.get("pdf_text", "").strip()   # ← NEW: extracted PDF text from browser
    num_questions = min(int(data.get("num_questions", DEFAULT_NUM_QUESTIONS)), MAX_NUM_QUESTIONS)
    scenario_mode = data.get("scenario_mode", "both")

    session_id = str(uuid.uuid4())[:8]
    result = _run(orchestrator.start_interview(
        session_id=session_id,
        domain=domain,
        jd_text=jd_text,
        pdf_text=pdf_text,
        num_questions=num_questions,
        scenario_mode=scenario_mode,
    ))

    if "error" in result:
        return jsonify(result), 500
    return jsonify(result)


# ─────────────────────────────────────────────────────────────────────────────
# POST /api/answer
# ─────────────────────────────────────────────────────────────────────────────
@app.route("/api/answer", methods=["POST"])
def submit_answer():
    data       = request.json or {}
    session_id = data.get("session_id", "")
    answer     = data.get("answer", "").strip()

    if not session_id or not exists(session_id):
        return jsonify({"error": "Invalid session ID"}), 400
    if not answer:
        return jsonify({"error": "Empty answer"}), 400

    result = _run(orchestrator.process_answer(session_id, answer))
    if "error" in result:
        return jsonify(result), 400
    return jsonify(result)


# ─────────────────────────────────────────────────────────────────────────────
# POST /api/mentor/start
# ─────────────────────────────────────────────────────────────────────────────
@app.route("/api/mentor/start", methods=["POST"])
def mentor_start():
    data       = request.json or {}
    session_id = data.get("session_id", "")

    if not session_id or not exists(session_id):
        return jsonify({"error": "Invalid session"}), 400

    result = _run(orchestrator.start_mentor(session_id))
    return jsonify(result)


# ─────────────────────────────────────────────────────────────────────────────
# POST /api/mentor/answer
# ─────────────────────────────────────────────────────────────────────────────
@app.route("/api/mentor/answer", methods=["POST"])
def mentor_answer():
    data        = request.json or {}
    session_id  = data.get("session_id", "")
    user_answer = data.get("answer", "").strip()

    if not session_id or not exists(session_id):
        return jsonify({"error": "Invalid session"}), 400

    # Accept empty answer as a skip signal rather than hard-rejecting it,
    # so the frontend is never left with isWaiting=true permanently.
    if not user_answer:
        user_answer = "[SKIP] Moving to next question."

    result = _run(orchestrator.mentor_turn(session_id, user_answer))
    return jsonify(result)


# ─────────────────────────────────────────────────────────────────────────────
# POST /api/mentor/nudge   ← NEW
# Called by the frontend after 12 s of mid-session idle silence.
# Returns a "let's continue on <topic>" message WITHOUT advancing the area.
# The session stays open; the user can still reply normally.
# ─────────────────────────────────────────────────────────────────────────────
@app.route("/api/mentor/nudge", methods=["POST"])
def mentor_nudge():
    data       = request.json or {}
    session_id = data.get("session_id", "")

    if not session_id or not exists(session_id):
        return jsonify({"error": "Invalid session"}), 400

    result = _run(orchestrator.mentor_idle_nudge(session_id))
    return jsonify(result)


# ─────────────────────────────────────────────────────────────────────────────
# GET /api/report/<session_id>
# ─────────────────────────────────────────────────────────────────────────────
@app.route("/api/report/<session_id>", methods=["GET"])
def get_report(session_id):
    if not exists(session_id):
        return jsonify({"error": "Session not found"}), 404

    result = _run(orchestrator.generate_report(session_id))
    return jsonify(result)


# ─────────────────────────────────────────────────────────────────────────────
# POST /api/stt  — Server-side Whisper STT (fallback for non-Chrome browsers)
# ─────────────────────────────────────────────────────────────────────────────
@app.route("/api/stt", methods=["POST"])
def stt():
    data      = request.json or {}
    b64_audio = data.get("audio_b64", "")
    mime_type = data.get("mime_type", "audio/webm")
    language  = data.get("language", "en")

    if not b64_audio:
        # No audio blob → tell browser to use Web Speech API
        return jsonify({"method": "browser", "text": "", "error": None})

    result = _run(transcribe_base64(b64_audio, mime_type, language))
    return jsonify(result)


# ─────────────────────────────────────────────────────────────────────────────
# POST /api/vad  — Voice Activity Detection (energy frame processing)
# ─────────────────────────────────────────────────────────────────────────────
@app.route("/api/vad", methods=["POST"])
def vad():
    data       = request.json or {}
    session_id = data.get("session_id", "anonymous")
    rms_energy = float(data.get("rms", 0.0))
    reset      = data.get("reset", False)

    if session_id not in _VAD_STATES or reset:
        _VAD_STATES[session_id] = VADState()

    result = _VAD_STATES[session_id].process_frame(rms_energy)
    return jsonify(result)


# ─────────────────────────────────────────────────────────────────────────────
# GET /api/sessions  — List all past sessions (for analytics / history)
# ─────────────────────────────────────────────────────────────────────────────
@app.route("/api/sessions", methods=["GET"])
def sessions_list():
    return jsonify(list_sessions())


# ─────────────────────────────────────────────────────────────────────────────
# GET /api/health
# ─────────────────────────────────────────────────────────────────────────────
@app.route("/api/health", methods=["GET"])
def health():
    from config import MODEL_FAST, MODEL_QUALITY, MODEL_ANALYST, GROQ_API_KEY
    return jsonify({
        "status":  "ok",
        "version": "3.1 — Orchestrated Multi-Agent + Idle Resume",
        "agents": {
            "1_jd_analyzer":         "Groq/LLaMA analyst",
            "2_question_generator":  "Groq/LLaMA fast + RAG grounding",
            "3_evaluator":           "Groq/LLaMA quality",
            "4_reasoning_profiler":  "Groq/LLaMA quality",
            "5_adaptive_controller": "deterministic — no LLM",
            "6_socratic_mentor":     "Groq/LLaMA quality",
            "7_final_feedback":      "Groq/LLaMA analyst",
        },
        "new_systems": {
            "orchestrator":    "coordinates all agent calls",
            "session_store":   "persistent JSON session storage",
            "rag_pipeline":    "PDF → chunks → TF-IDF index → grounded questions",
            "question_dedup":  get_bank_size(),
            "stt_engine":      "Groq Whisper (server fallback) + browser Web Speech API",
            "vad_engine":      "energy-threshold VAD with onset/offset detection",
            "idle_nudge":      "12s mid-session idle → auto-resume current weak area",
        },
        "models": {
            "fast":    MODEL_FAST,
            "quality": MODEL_QUALITY,
            "analyst": MODEL_ANALYST,
        },
        "api_key_set": bool(GROQ_API_KEY and "PASTE" not in GROQ_API_KEY),
    })


# ─────────────────────────────────────────────────────────────────────────────
# STATIC FILE SERVING
# ─────────────────────────────────────────────────────────────────────────────
@app.route("/")
def index():
    return send_from_directory(".", "index.html")


@app.route("/ui/<path:filename>")
def serve_ui(filename):
    return send_from_directory("ui", filename)


# ─────────────────────────────────────────────────────────────────────────────
# ENTRY POINT
# ─────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    from config import GROQ_API_KEY

    print("\n" + "═" * 55)
    print("  SocraticMind v3.1 — Orchestrated Multi-Agent System")
    print("═" * 55)
    print("  Agents   : 7 specialised AI agents")
    print("  RAG      : PDF → TF-IDF index → grounded questions")
    print("  Dedup    : cross-session question bank (fuzzy match)")
    print("  Store    : persistent JSON session storage")
    print("  Voice    : Browser STT + Groq Whisper fallback + VAD")
    print("  Orchestr : single pipeline coordinator")
    print("  Idle     : 12s mid-session nudge + end-session close")
    print(f"  Server   : http://localhost:{FLASK_PORT}")

    if not GROQ_API_KEY or "PASTE" in GROQ_API_KEY:
        print("\n  ⚠  Set GROQ_API_KEY in config.py or .env file")

    # ── NGROK: Start tunnel and print public URL ──────────────────────────────
    if ENABLE_NGROK:
        try:
            from pyngrok import ngrok, conf

            if NGROK_AUTHTOKEN and "PASTE" not in NGROK_AUTHTOKEN:
                conf.get_default().auth_token = NGROK_AUTHTOKEN
            else:
                print("\n  ⚠  NGROK_AUTHTOKEN not set in app.py!")
                print("     Get your free token at: https://dashboard.ngrok.com/get-started/your-authtoken")
                print("     Then paste it into NGROK_AUTHTOKEN variable at the top of app.py\n")

            # Kill any existing ngrok tunnels to avoid conflicts
            ngrok.kill()

            # Open a new HTTP tunnel on the Flask port
            public_url = ngrok.connect(FLASK_PORT, bind_tls=True).public_url

            print("\n" + "═" * 55)
            print("  🌐  NGROK TUNNEL ACTIVE")
            print("═" * 55)
            print(f"  Share this URL with your friend:")
            print(f"\n      👉  {public_url}\n")
            print("  ✅  They can open it from anywhere — no same WiFi needed!")
            print("  ⚠   URL changes every time you restart. Re-share if needed.")
            print("═" * 55 + "\n")

        except ImportError:
            print("\n  ❌  pyngrok not installed!")
            print("     Run:  pip install pyngrok")
            print("     Then restart this file.\n")
        except Exception as e:
            print(f"\n  ❌  ngrok failed to start: {e}")
            print("     Check your NGROK_AUTHTOKEN or internet connection.\n")

    print("═" * 55 + "\n")

    # ── Start Flask ───────────────────────────────────────────────────────────
    # use_reloader=False is important — reloader would start ngrok twice
    app.run(debug=FLASK_DEBUG, host="0.0.0.0", port=FLASK_PORT, use_reloader=False)