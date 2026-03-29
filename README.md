# AI-Interview-SocraticMind-

> AI-powered interview simulator focused on **cognitive reasoning**, not just answers.

---

## 🚀 Overview

**SocraticMind** is a next-generation AI interview platform that evaluates *how you think*, not just *what you know*.

It combines:
- ⚡ FastAPI backend  
- 🤖 Multi-agent AI system  
- 🎤 Voice-first interaction  
- 📊 Cognitive profiling  

This project simulates real-world technical interviews with adaptive difficulty and Socratic mentoring.

---

## 🏗️ Architecture

### 🔹 Backend (Intelligence Layer)
- **Framework:** FastAPI  
- **Core Components:**
  - `api/routes.py` → API endpoints
  - `services/orchestrator.py` → Full pipeline manager
  - `memory/session_store.py` → In-memory session tracking
  - `services/stt.py` → Speech-to-Text (faster-whisper)
  - `services/tts.py` → Text-to-Speech (gTTS)

---

### 🔹 Frontend (Interaction Layer)
- **Framework:** React  
- **Features:**
  - 🎤 Voice input (SpeechRecognition + fallback)
  - 👁️ Proctoring (Face detection via TensorFlow.js)
  - 📈 Real-time cognitive feedback
  - 🎧 Waveform visualizations

---

## 🤖 Multi-Agent AI System

SocraticMind uses specialized agents:

| Agent | Role |
|------|------|
| **JD Analyzer** | Extracts job requirements & difficulty |
| **Question Generator** | Generates adaptive questions |
| **Evaluation Agent** | Scores answers (correctness, confidence, struggle) |
| **Reasoning Profiler** | Builds cognitive fingerprint |
| **Adaptive Controller** | Adjusts difficulty dynamically |
| **Socratic Mentor** | Guides learning via hints |

---

## 🔁 Core Workflow
User Answer → STT → Evaluator → Profiler → Controller → Next Question → TTS



### 🎯 Mentor Mode
- Activates when score < 60  
- Uses **hint-based learning (no direct answers)**  
- Adapts based on reasoning style  

---

## 🧠 Cognitive Logic

The system builds a **Reasoning Fingerprint** based on:
- Depth of understanding  
- Thinking type (logical vs intuitive)  
- Confidence bias  

This fingerprint drives:
- Question difficulty  
- Feedback style  
- Mentoring strategy  

---

## 🐞 Bug Audit (Critical Findings)

### 🚨 Critical Bugs

| ID | Issue | Impact |
|----|------|--------|
| C1 | Missing `json` import in `orchestrator.py` | ❌ Crashes session report |
| C2 | Hardcoded `D:/` log path | ❌ Breaks portability |
| C3 | Invalid JSON handling from LLM | ⚠️ Causes runtime errors |

---

### ⚠️ Logical Issues

- MIME type mismatch in TTS response  
- Question history mismanagement  
- Static model retry logic  
- Mentor attempt counter inconsistency  

---

### 🎨 UI Issues

- STT fallback inconsistency  
- Dark mode only (no toggle)  
- CDN dependency without fallback  

---

## ⚡ Optimization Roadmap

### 🟢 Phase 1: Stability
- Fix missing imports  
- Remove hardcoded paths  
- Add schema validation for LLM outputs  

### 🟡 Phase 2: Refinement
- Fix MIME types  
- Sync frontend-backend state  
- Improve UX consistency  

### 🔵 Phase 3: Scaling
- Move to Redis/PostgreSQL  
- Add WebSocket-based real-time STT  
- Improve latency  

---

## 🔐 Security Concerns

- ❗ No rate limiting on `/api/tts` and `/api/stt`  
- Risk of high API cost if abused  

---

## 💡 Performance Tips

- Enable GPU for `faster-whisper`:
```python
device="cuda"
