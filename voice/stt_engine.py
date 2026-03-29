"""
voice/stt_engine.py
===================
Server-side STT (Speech-to-Text) engine.

ARCHITECTURE:
  Browser-first: The frontend uses Web Speech API (Chrome) for real-time
  streaming STT — zero latency, no server round-trip.

  Server fallback: If the browser STT fails or the user sends an audio
  blob, this module handles it via Groq's Whisper endpoint.

VAD (Voice Activity Detection):
  True VAD requires audio processing libraries. Here we implement:
    1. Energy-based VAD: detect silence from RMS amplitude
    2. Duration-based VAD: minimum speech length filter
    3. Confidence-based: Whisper returns no_speech_prob — use it

USAGE in app.py:
  POST /api/stt   → receives audio blob → returns transcript
  POST /api/vad   → receives energy data → returns speech/silence decision

For production: replace Whisper with real-time WebSocket streaming.
"""

import io
import base64
import asyncio
import math
from groq import AsyncGroq
from config import GROQ_API_KEY

# ── Groq Whisper client ───────────────────────────────────────────────────────
_client: AsyncGroq | None = None

def _get_client() -> AsyncGroq:
    global _client
    if _client is None:
        _client = AsyncGroq(api_key=GROQ_API_KEY)
    return _client


# ─────────────────────────────────────────────────────────────────────────────
# STT — TRANSCRIBE AUDIO BLOB
# ─────────────────────────────────────────────────────────────────────────────

async def transcribe_audio(
    audio_bytes: bytes,
    mime_type: str = "audio/webm",
    language: str = "en",
) -> dict:
    """
    Transcribe an audio blob using Groq's Whisper endpoint.

    Args:
        audio_bytes: Raw audio bytes (webm, wav, mp3, etc.)
        mime_type:   MIME type of the audio
        language:    ISO 639-1 language code

    Returns:
        {
          "transcript":    str,
          "confidence":    float (0-1),
          "is_speech":     bool,
          "duration_ms":   int,
          "words":         list (if word timestamps available)
        }
    """
    if not audio_bytes or len(audio_bytes) < 100:
        return _empty_result("Audio too short")

    try:
        client = _get_client()
        # Wrap bytes in file-like object
        audio_file = io.BytesIO(audio_bytes)
        audio_file.name = f"audio.{_ext_from_mime(mime_type)}"

        response = await client.audio.transcriptions.create(
            model="whisper-large-v3",
            file=audio_file,
            language=language,
            response_format="verbose_json",  # includes word timestamps + no_speech_prob
        )

        transcript = (response.text or "").strip()
        # no_speech_prob: 0 = definitely speech, 1 = definitely silence
        no_speech = getattr(response, "no_speech_prob", 0.0) or 0.0
        confidence = 1.0 - no_speech
        is_speech  = confidence > 0.4 and len(transcript) > 0

        return {
            "transcript":  transcript,
            "confidence":  round(confidence, 3),
            "is_speech":   is_speech,
            "duration_ms": getattr(response, "duration", 0) or 0,
            "words":       getattr(response, "words", []) or [],
            "error":       None,
        }

    except Exception as e:
        print(f"[STT] Whisper error: {e}")
        return _empty_result(str(e))


async def transcribe_base64(
    b64_audio: str,
    mime_type: str = "audio/webm",
    language: str = "en",
) -> dict:
    """Convenience wrapper — accepts base64-encoded audio from the browser."""
    try:
        audio_bytes = base64.b64decode(b64_audio)
        return await transcribe_audio(audio_bytes, mime_type, language)
    except Exception as e:
        return _empty_result(f"Base64 decode failed: {e}")


# ─────────────────────────────────────────────────────────────────────────────
# VAD — VOICE ACTIVITY DETECTION
# ─────────────────────────────────────────────────────────────────────────────

class VADState:
    """
    Stateful VAD that tracks speech/silence transitions.
    One instance per active session.

    Uses energy threshold + duration rules:
      - speech_start:  energy > threshold for > onset_frames consecutive frames
      - speech_end:    energy < threshold for > offset_frames consecutive frames
    """

    ENERGY_THRESHOLD = 0.015   # RMS amplitude (0-1 normalised)
    ONSET_FRAMES     = 3       # frames above threshold to confirm speech start
    OFFSET_FRAMES    = 20      # frames below threshold to confirm speech end
    FRAME_MS         = 30      # typical browser MediaRecorder chunk interval

    def __init__(self):
        self.is_speaking     = False
        self._above_count    = 0
        self._below_count    = 0
        self._speech_frames  = 0

    def process_frame(self, rms_energy: float) -> dict:
        """
        Process one audio frame.

        Args:
            rms_energy: Root-mean-square energy of the frame (0.0 to 1.0)

        Returns:
            {
              "is_speaking":   bool,
              "event":         "speech_start" | "speech_end" | "silence" | "speech" | None,
              "speech_ms":     int   (ms of continuous speech so far)
            }
        """
        event = None
        if rms_energy > self.ENERGY_THRESHOLD:
            self._above_count += 1
            self._below_count  = 0

            if not self.is_speaking and self._above_count >= self.ONSET_FRAMES:
                self.is_speaking    = True
                self._speech_frames = self._above_count
                event = "speech_start"
            elif self.is_speaking:
                self._speech_frames += 1
                event = "speech"
        else:
            self._below_count += 1
            self._above_count  = 0

            if self.is_speaking and self._below_count >= self.OFFSET_FRAMES:
                self.is_speaking    = False
                self._speech_frames = 0
                event = "speech_end"
            else:
                event = "silence" if not self.is_speaking else "speech"

        return {
            "is_speaking": self.is_speaking,
            "event":       event,
            "speech_ms":   self._speech_frames * self.FRAME_MS,
        }

    def reset(self) -> None:
        self.__init__()


def compute_rms(pcm_samples: list[float]) -> float:
    """
    Compute Root Mean Square energy from PCM samples.
    pcm_samples should be normalised to [-1.0, 1.0].
    """
    if not pcm_samples:
        return 0.0
    return math.sqrt(sum(s * s for s in pcm_samples) / len(pcm_samples))


# ─────────────────────────────────────────────────────────────────────────────
# TTS — TEXT TO SPEECH (server-side)
# ─────────────────────────────────────────────────────────────────────────────

async def synthesise_speech(text: str, voice: str = "en-US-Neural2-F") -> dict:
    """
    Server-side TTS placeholder.

    CURRENT STATE:
      Browser speechSynthesis is used (zero latency, no server cost).
      This function is a stub that documents what a production TTS
      integration would look like.

    PRODUCTION OPTIONS:
      1. ElevenLabs API   → most natural, paid
      2. Google Cloud TTS → Neural2 voices, paid
      3. Coqui TTS        → open-source, self-hosted
      4. Kokoro-82M       → 82M param model, Apache 2.0

    Returns:
        {"method": "browser", "text": str} — tells frontend to use speechSynthesis
    """
    # For now: tell the frontend to use its own TTS
    # When you add a TTS provider, replace this with the actual API call
    return {
        "method":   "browser",
        "text":     text,
        "voice":    voice,
        "error":    None,
        "audio_b64": None,   # would be base64 audio when using server TTS
    }


# ─────────────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def _empty_result(reason: str = "") -> dict:
    return {
        "transcript":  "",
        "confidence":  0.0,
        "is_speaking": False,
        "duration_ms": 0,
        "words":       [],
        "error":       reason,
    }


def _ext_from_mime(mime: str) -> str:
    mapping = {
        "audio/webm": "webm",
        "audio/wav":  "wav",
        "audio/ogg":  "ogg",
        "audio/mp4":  "mp4",
        "audio/mpeg": "mp3",
    }
    return mapping.get(mime, "webm")