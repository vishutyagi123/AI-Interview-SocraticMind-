import { useState, useEffect, useRef, useCallback } from "react";

// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────
const TOPIC_KEYWORDS = {
  "Data Structures": ["data structures", "arrays", "trees", "graphs", "linked list", "stack", "queue", "heap", "hash", "sorting", "searching", "algorithm"],
  "Operating Systems": ["operating systems", "os", "processes", "threads", "memory management", "deadlock", "scheduling", "synchronization", "semaphore", "mutex"],
  "DBMS": ["database", "dbms", "sql", "nosql", "normalization", "indexing", "transactions", "acid", "joins", "query"],
  "Computer Networks": ["networking", "tcp", "udp", "http", "dns", "osi", "ip", "routing", "protocols", "socket", "rest", "api"],
  "System Design": ["system design", "scalability", "microservices", "distributed", "load balancing", "caching", "cdn", "architecture"],
  "Web Development": ["react", "node", "javascript", "frontend", "backend", "html", "css", "web development", "angular", "vue"],
  "Machine Learning": ["machine learning", "ml", "ai", "deep learning", "neural", "model", "training", "python", "tensorflow", "pytorch"],
};

const IVD = {
  "Data Structures": {
    jd: ["Arrays & Sorting", "Trees & BST", "Time Complexity", "Linked Lists", "Graphs"],
    qs: [
      { text: "You have an unsorted array of one million numbers. Walk me through how you'd find if a specific element exists — and what's the real cost of your approach at scale?", topic: "Arrays & Sorting", weak: "Time Complexity" },
      { text: "A junior dev asks: why use a BST over a sorted array if both are sorted? How do you answer them, and what's the key trade-off they're missing?", topic: "Trees & BST", weak: "Depth of understanding" },
      { text: "Given a linked list, how would you detect a cycle? Don't just name the algorithm — explain WHY it actually works mechanically.", topic: "Linked Lists", weak: "Causal reasoning" },
    ],
  },
  "Operating Systems": {
    jd: ["Processes & Threads", "Memory Management", "Deadlocks", "Scheduling", "Synchronization"],
    qs: [
      { text: "Explain the difference between a process and a thread. In a real application — say a web server — when would you choose one over the other and why?", topic: "Processes & Threads", weak: "Conceptual depth" },
      { text: "What is a deadlock? Describe a real-world scenario outside computers that mirrors exactly how a deadlock happens.", topic: "Deadlocks", weak: "Analogy reasoning" },
      { text: "Walk me through what happens in memory from the exact moment you write: int x = 5 in a C program.", topic: "Memory Management", weak: "Low-level understanding" },
    ],
  },
  "DBMS": {
    jd: ["Indexing", "Transactions & ACID", "Joins", "Normalization", "SQL"],
    qs: [
      { text: "Explain database indexing to a non-technical person. Then tell me — when would you deliberately NOT use an index?", topic: "Indexing", weak: "Trade-off thinking" },
      { text: "What does ACID stand for? Of the four properties, which is hardest to implement and why — be specific.", topic: "Transactions & ACID", weak: "Depth beyond definition" },
      { text: "What's the difference between INNER JOIN and LEFT JOIN? Give me a scenario where picking the wrong one silently breaks your application.", topic: "Joins", weak: "Applied understanding" },
    ],
  },
  "Computer Networks": {
    jd: ["DNS & HTTP", "TCP vs UDP", "OSI Model", "Routing", "Security"],
    qs: [
      { text: "Walk me through every layer from the moment you type google.com and press Enter — as detailed as you can get.", topic: "DNS & HTTP", weak: "Systems thinking" },
      { text: "When would you choose UDP over TCP? Give a concrete example where TCP would actually cause problems.", topic: "TCP vs UDP", weak: "Trade-off reasoning" },
      { text: "What is the OSI model and why does it exist? And honestly — do you think it's useful in practice or just theoretical?", topic: "OSI Model", weak: "Critical thinking" },
    ],
  },
};

const KW = {
  0: ["o(n)", "linear", "search", "iterate", "binary", "hash", "complexity", "worst", "best", "average"],
  1: ["insert", "search", "o(log", "balance", "traversal", "node", "pointer", "height", "rotation"],
  2: ["fast", "slow", "pointer", "floyd", "cycle", "two pointer", "meet", "next", "null"],
  3: ["memory", "stack", "heap", "context", "switch", "pid", "kernel", "user space", "resource"],
  4: ["resource", "wait", "hold", "circular", "mutual", "prevention", "banker", "dining", "philosopher"],
  5: ["stack", "heap", "register", "address", "byte", "compiler", "variable", "scope", "static"],
  6: ["b-tree", "lookup", "faster", "write", "overhead", "full scan", "clustered", "composite"],
  7: ["atomic", "consistent", "isolated", "durable", "transaction", "rollback", "commit", "log"],
  8: ["null", "match", "left table", "missing", "outer", "result", "unmatched", "all rows"],
  9: ["dns", "tcp", "ip", "syn", "ack", "request", "response", "packet", "layer", "resolver"],
  10: ["streaming", "gaming", "speed", "latency", "connectionless", "loss", "reliable", "overhead"],
  11: ["layer", "physical", "transport", "application", "abstraction", "protocol", "encapsulation"],
};

const FEEDBACK_MAP = [
  { deep: "Solid reasoning — you traced both the mechanism and the cost. That's rare.", medium: "You got the surface right, but the WHY is still thin. What's the actual mechanism?", shallow: "You named the concept but stopped there. A strong answer explains WHY it works, not just WHAT it is." },
  { deep: "Excellent — not just what, but when and why. That's systems thinking.", medium: "Right intuition. Now ask yourself: what's the performance cost you're trading?", shallow: "This works at surface level. What happens to your reasoning when scale changes?" },
  { deep: "Real causal understanding — you connected mechanism to consequence.", medium: "Good start. Missing piece: why does this approach solve that specific problem?", shallow: "This is definition-level. The interviewer wants to see you reason, not recite." },
];

const SOC_FLOW = [
  "Good — I can see exactly what to work on from your answers. Let me start simple.\n\nYou have this array: 3, 7, 1, 9, 4, 2. I ask you to find if 9 exists. How many steps does your approach take — worst case?",
  "Good. Now if the array had one million elements and the element doesn't exist — how many steps? Don't give me a number. Give me a formula in terms of N.",
  "Exactly — O(N). Linear time. Now if someone asked you to do this lookup ten thousand times a day, what starts to bother you? And what would you change — not the algorithm, but how the data is organised?",
  "You're getting close to something important. What if I told you there's a data structure where lookup takes the same time whether there are six elements or six million? You've heard of it. What is it — and WHY does it work that way?",
  "Perfect — a Hash Table. Now tell me WHY the lookup is O(1). Not just that it is — the actual mechanism. What does a hash function actually do to make it constant time regardless of size?",
  "You arrived at it yourself — the hash function maps a key directly to a memory address. No searching. A direct jump.\n\nYou went from 'check every element' to 'calculate and jump'. That's the conceptual breakthrough.\n\n✓ Mastery achieved. Well done.",
];

const STRATEGIES = ["counter_example", "scale_challenge", "analogy", "direct_probe", "synthesis", "guided_discovery"];
const STRAT_REASONS = [
  "Targeting weak causal link in your reasoning", "Using scale to expose the cost assumption", "Building analogy from concrete to abstract", "Probing the mechanism you glossed over", "Synthesising your scattered correct pieces", "Guiding you to the insight independently",
];

const TOPIC_CARDS = [
  { topic: "Data Structures", icon: "🌳", sub: "Arrays, Trees, Graphs" },
  { topic: "Operating Systems", icon: "⚙️", sub: "Processes, Memory, I/O" },
  { topic: "DBMS", icon: "🗄️", sub: "SQL, Indexing, ACID" },
  { topic: "Computer Networks", icon: "🌐", sub: "TCP/IP, DNS, HTTP" },
];

// ─────────────────────────────────────────────
// UTILS
// ─────────────────────────────────────────────
function extractTopics(text) {
  const lower = text.toLowerCase();
  const found = [];
  for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    const hits = keywords.filter(k => lower.includes(k)).length;
    if (hits >= 2) found.push({ topic, hits });
  }
  found.sort((a, b) => b.hits - a.hits);
  return found.slice(0, 5).map(f => f.topic);
}

function analyseAnswer(ans, qIdx) {
  const lower = ans.toLowerCase();
  const len = ans.trim().length;
  const kws = KW[qIdx % 12] || [];
  const hits = kws.filter(k => lower.includes(k)).length;
  const ratio = hits / Math.max(kws.length, 1);
  const depth = Math.min(92, Math.round(ratio * 78 + (len > 250 ? 14 : len > 120 ? 7 : 0)));
  const acc = Math.min(88, Math.round(ratio * 72 + Math.random() * 10));
  const conf = len > 60 ? Math.round(52 + Math.random() * 32) : Math.round(18 + Math.random() * 22);
  const cons = Math.round(40 + ratio * 40 + Math.random() * 12);
  const orig = len > 200 ? Math.round(55 + Math.random() * 28) : Math.round(20 + Math.random() * 30);
  return { depth, acc, conf, cons, orig };
}

function lerp(a, b, t) { return Math.round(a + (b - a) * t); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─────────────────────────────────────────────
// VOICE ENGINE  (robust, lag-free)
// ─────────────────────────────────────────────
function useVoice() {
  const isSpeakingRef = useRef(false);

  // All STT mutable state lives here so every closure always reads the
  // latest values without stale-closure bugs.
  const sttRef = useRef({
    active: false,         // true while mic session is open
    starting: false,       // debounce guard — prevents double-start race
    accumulated: "",       // confirmed final text so far
    onUpdate: null,
    onDone: null,
    onErr: null,
    recognition: null,     // the live SR instance
  });

  // ── helpers ────────────────────────────────────────────────────────────────
  const _killRecognition = () => {
    const r = sttRef.current.recognition;
    if (!r) return;
    r.onresult = null; r.onend = null; r.onerror = null;
    try { r.abort(); } catch (_) { }
    sttRef.current.recognition = null;
  };

  // ── TTS ────────────────────────────────────────────────────────────────────
  const speak = useCallback((text, onEnd) => {
    if (!text) { onEnd?.(); return; }
    const synth = window.speechSynthesis;
    if (!synth) { onEnd?.(); return; }

    // Chrome bug: synth locks up if you call speak() while already speaking
    // without cancelling first.
    synth.cancel();

    const utter = new SpeechSynthesisUtterance(text);

    const pickVoice = () => {
      const vs = synth.getVoices();
      return vs.find(v => v.lang.startsWith("en") && v.name.includes("Google"))
        || vs.find(v => v.lang.startsWith("en-IN"))
        || vs.find(v => v.lang.startsWith("en"))
        || vs[0];
    };

    // getVoices() is async on first call — retry once if empty
    const v = pickVoice();
    if (v) utter.voice = v;
    utter.rate = 0.93; utter.pitch = 1.0; utter.volume = 1.0;

    isSpeakingRef.current = true;

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(watchdog);
      isSpeakingRef.current = false;
      onEnd?.();
    };

    // Safety watchdog: ~85 ms per character + 3 s buffer.
    // This is more generous than the old version (which used 80 ms/char and
    // could cut off long answers).
    const watchdog = setTimeout(finish, Math.max(10000, text.length * 85 + 3000));

    utter.onend = finish;
    utter.onerror = finish;

    synth.speak(utter);

    // Chrome quirk: speechSynthesis sometimes stalls silently after ~15 s.
    // A periodic resume() keeps it alive.
    const resumeInterval = setInterval(() => {
      if (synth.speaking) synth.resume();
      else clearInterval(resumeInterval);
    }, 5000);
    utter.onend = () => { clearInterval(resumeInterval); finish(); };
    utter.onerror = () => { clearInterval(resumeInterval); finish(); };
  }, []);

  const stopSpeaking = useCallback(() => {
    window.speechSynthesis?.cancel();
    isSpeakingRef.current = false;
  }, []);

  // ── Internal: spawn a fresh SR instance and wire up all handlers ───────────
  // NOTE: We never call r.start() recursively from inside onend using the same
  // `r` reference — instead we always spawn a brand-new instance.  This
  // eliminates the "cannot call start() on an already-started instance" error
  // that caused the mic to silently die.
  const _spawnRecognition = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR || !sttRef.current.active) return;

    _killRecognition();  // clean slate

    const r = new SR();
    r.continuous = true;
    r.interimResults = true;
    r.lang = "en-IN";
    sttRef.current.recognition = r;
    sttRef.current.starting = true;

    r.onstart = () => { sttRef.current.starting = false; };

    r.onresult = (e) => {
      if (!sttRef.current.active) return;
      let interim = "";
      let newFinal = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) newFinal += e.results[i][0].transcript + " ";
        else interim += e.results[i][0].transcript;
      }
      if (newFinal) {
        sttRef.current.accumulated = (sttRef.current.accumulated + " " + newFinal).trim();
      }
      const display = (sttRef.current.accumulated + (interim ? " " + interim : "")).trim();
      sttRef.current.onUpdate?.(display, !!interim);
    };

    r.onend = () => {
      sttRef.current.starting = false;
      if (sttRef.current.active) {
        // Chrome kills recognition after ~60 s of silence or after a result.
        // Spawn a NEW instance — never try to restart the same object.
        setTimeout(() => { if (sttRef.current.active) _spawnRecognition(); }, 120);
      } else {
        // Intentional stop — fire onDone with everything accumulated.
        const cb = sttRef.current.onDone;
        sttRef.current.onDone = null;
        cb?.(sttRef.current.accumulated.trim());
      }
    };

    r.onerror = (ev) => {
      sttRef.current.starting = false;
      if (!sttRef.current.active) return;

      if (ev.error === "not-allowed" || ev.error === "service-not-allowed") {
        sttRef.current.active = false;
        sttRef.current.onErr?.("not-allowed");
        return;
      }
      // For no-speech, audio-capture, network, aborted — just respawn.
      setTimeout(() => { if (sttRef.current.active) _spawnRecognition(); }, 250);
    };

    try {
      r.start();
    } catch (_) {
      sttRef.current.starting = false;
      // start() threw synchronously (e.g. already started) — retry shortly
      setTimeout(() => { if (sttRef.current.active) _spawnRecognition(); }, 300);
    }
  }, []); // eslint-disable-line

  // ── Public: start listening ────────────────────────────────────────────────
  const startListening = useCallback((onUpdate, onDone, onError) => {
    if (isSpeakingRef.current) stopSpeaking();

    // Already active or in the middle of starting — reject gracefully
    if (sttRef.current.active || sttRef.current.starting) return false;

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { onError?.("not-supported"); return false; }

    sttRef.current.active = true;
    sttRef.current.accumulated = "";
    sttRef.current.onUpdate = onUpdate;
    sttRef.current.onDone = onDone;
    sttRef.current.onErr = onError;

    _spawnRecognition();
    return true;
  }, [stopSpeaking, _spawnRecognition]);

  // ── Public: stop listening ─────────────────────────────────────────────────
  const stopListening = useCallback(() => {
    if (!sttRef.current.active && !sttRef.current.starting) return;
    sttRef.current.active = false;
    sttRef.current.starting = false;

    const r = sttRef.current.recognition;
    if (r) {
      // Detach handlers before stop() so onend doesn't try to respawn
      r.onresult = null; r.onerror = null;
      r.onend = () => {
        // Fire onDone exactly once
        const cb = sttRef.current.onDone;
        sttRef.current.onDone = null;
        cb?.(sttRef.current.accumulated.trim());
        sttRef.current.recognition = null;
      };
      try { r.stop(); } catch (_) {
        // stop() failed — fire callback manually
        const cb = sttRef.current.onDone;
        sttRef.current.onDone = null;
        cb?.(sttRef.current.accumulated.trim());
        sttRef.current.recognition = null;
      }
    } else {
      // No live instance — fire onDone immediately
      const cb = sttRef.current.onDone;
      sttRef.current.onDone = null;
      cb?.(sttRef.current.accumulated.trim());
    }
  }, []);

  return { speak, stopSpeaking, startListening, stopListening, isSpeakingRef, sttRef };
}
// ─────────────────────────────────────────────
// FACE DETECTION HOOK
// ─────────────────────────────────────────────
function useFaceDetection({ videoRef, active, onMultipleFaces }) {
  const detectorRef = useRef(null);
  const intervalRef = useRef(null);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (!active) {
      clearInterval(intervalRef.current);
      return;
    }

    const loadAndStart = async () => {
      // Dynamically load TF.js + face-detection model from CDN
      if (!loadedRef.current) {
        await new Promise((resolve, reject) => {
          if (window.tf && window.faceDetection) { resolve(); return; }
          const tfScript = document.createElement('script');
          tfScript.src = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.17.0/dist/tf.min.js';
          tfScript.onload = () => {
            const fdScript = document.createElement('script');
            fdScript.src = 'https://cdn.jsdelivr.net/npm/@tensorflow-models/face-detection@1.0.2/dist/face-detection.min.js';
            fdScript.onload = resolve;
            fdScript.onerror = resolve; // Fail silently
            document.head.appendChild(fdScript);
          };
          tfScript.onerror = resolve; // Fail silently
          document.head.appendChild(tfScript);
        });
        loadedRef.current = true;
      }

      try {
        if (window.faceDetection && !detectorRef.current) {
          const model = window.faceDetection.SupportedModels.MediaPipeFaceDetector;
          detectorRef.current = await window.faceDetection.createDetector(model, {
            runtime: 'tfjs',
            maxFaces: 6,
          });
        }
      } catch (e) { /* detector unavailable, skip */ }

      clearInterval(intervalRef.current);
      intervalRef.current = setInterval(async () => {
        const video = videoRef.current;
        if (!video || !detectorRef.current || video.readyState < 2) return;
        try {
          const faces = await detectorRef.current.estimateFaces(video);
          if (faces && faces.length >= 2) onMultipleFaces(faces.length);
        } catch (_) { /* ignore detection errors */ }
      }, 2000);
    };

    loadAndStart();
    return () => clearInterval(intervalRef.current);
  }, [active]);
}

// ─────────────────────────────────────────────
// MULTI-PERSON WARNING TOAST
// ─────────────────────────────────────────────
function MultiPersonWarningToast({ count, maxWarnings, onDismiss }) {
  useEffect(() => { const t = setTimeout(onDismiss, 5000); return () => clearTimeout(t); }, [count]);
  return (
    <div style={{ position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 10000, animation: 'fadeUp .3s ease', padding: '14px 22px', borderRadius: 12, background: 'rgba(255,140,66,.15)', backdropFilter: 'blur(14px)', border: '1px solid rgba(255,140,66,.5)', display: 'flex', alignItems: 'center', gap: 12, minWidth: 340, boxShadow: '0 8px 32px rgba(0,0,0,.5)' }}>
      <span style={{ fontSize: 22 }}>👥</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--warning)' }}>Multiple People Detected</div>
        <div className="mono" style={{ fontSize: 10, color: 'var(--text2)', marginTop: 2 }}>
          Warning {count}/{maxWarnings} · Only one person allowed during interview
        </div>
        {count >= maxWarnings - 1 && (
          <div className="mono" style={{ fontSize: 10, color: 'var(--red)', marginTop: 3, fontWeight: 700 }}>
            ⚠ NEXT VIOLATION WILL TERMINATE THE INTERVIEW
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// GLOBAL STYLES
// ─────────────────────────────────────────────
const GLOBAL_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Mono:wght@300;400;500&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,300&display=swap');

:root {
  --bg: #020207;
  --bg1: #07070f;
  --bg2: #0e0e1a;
  --bg3: #16162a;
  --bg4: #1e1e32;
  --border: rgba(255,255,255,0.045);
  --border2: rgba(255,255,255,0.09);
  --border3: rgba(255,255,255,0.14);
  --text: #ededf5;
  --text2: #9999b8;
  --muted: #4a4a6a;
  --accent: #6d5aff;
  --accent2: #8b77ff;
  --accent3: rgba(109,90,255,0.12);
  --teal: #00d4b4;
  --teal2: rgba(0,212,180,0.1);
  --amber: #f0b429;
  --amber2: rgba(240,180,41,0.1);
  --red: #ff4d6d;
  --red2: rgba(255,77,109,0.1);
  --green: #00e5a0;
  --green2: rgba(0,229,160,0.1);
  --warning: #ff8c42;
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: 'DM Sans', sans-serif;
  background: var(--bg);
  color: var(--text);
  min-height: 100vh;
  overflow-x: hidden;
  -webkit-font-smoothing: antialiased;
}

::-webkit-scrollbar { width: 2px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border3); border-radius: 1px; }

@keyframes fadeUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
@keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
@keyframes scaleIn { from { opacity:0; transform:scale(0.94); } to { opacity:1; transform:scale(1); } }
@keyframes pulseRed { 0%,100% { box-shadow:0 0 0 0 rgba(255,77,109,.4); } 50% { box-shadow:0 0 0 10px rgba(255,77,109,0); } }
@keyframes pulseGreen { 0%,100% { box-shadow:0 0 0 0 rgba(0,229,160,.35); } 50% { box-shadow:0 0 0 8px rgba(0,229,160,0); } }
@keyframes pulseAccent { 0%,100% { box-shadow:0 0 0 0 rgba(109,90,255,.4); } 50% { box-shadow:0 0 0 10px rgba(109,90,255,0); } }
@keyframes shimmer { 0% { background-position:-200% 0; } 100% { background-position:200% 0; } }
@keyframes bounce3 { 0%,60%,100% { transform:translateY(0); } 30% { transform:translateY(-6px); } }
@keyframes scanLine { 0% { transform:translateY(-100%); } 100% { transform:translateY(100vh); } }
@keyframes glow { 0%,100% { opacity:0.4; } 50% { opacity:0.9; } }
@keyframes waveform { 0%,100% { height:4px; } 50% { height:20px; } }
@keyframes rotate { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }
@keyframes countUp { from { opacity:0; transform:scale(0.7); } to { opacity:1; transform:scale(1); } }

.syne { font-family:'Syne',sans-serif; }
.mono { font-family:'DM Mono',monospace; }

.btn-primary {
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: 10px;
  padding: 13px 28px;
  font-family:'DM Sans',sans-serif;
  font-size:14px;
  font-weight:600;
  cursor:pointer;
  transition: all .2s;
  letter-spacing:-.1px;
  position: relative;
  overflow: hidden;
}
.btn-primary::after {
  content:'';
  position:absolute;
  inset:0;
  background:linear-gradient(135deg,rgba(255,255,255,.12) 0%,transparent 60%);
  pointer-events:none;
}
.btn-primary:hover { background:#7c6bff; transform:translateY(-1px); box-shadow:0 8px 28px rgba(109,90,255,.35); }
.btn-primary:disabled { background:var(--bg4); color:var(--muted); cursor:not-allowed; transform:none; box-shadow:none; }

.btn-ghost {
  background:transparent;
  color:var(--text2);
  border:1px solid var(--border3);
  border-radius:10px;
  padding:13px 24px;
  font-family:'DM Sans',sans-serif;
  font-size:14px;
  font-weight:500;
  cursor:pointer;
  transition:all .2s;
}
.btn-ghost:hover { border-color:var(--border3); background:var(--bg3); color:var(--text); }

.card {
  background:var(--bg2);
  border:1px solid var(--border2);
  border-radius:14px;
  overflow:hidden;
}

.tag {
  display:inline-flex;
  align-items:center;
  gap:5px;
  padding:4px 10px;
  border-radius:100px;
  font-size:11px;
  font-family:'DM Mono',monospace;
  font-weight:400;
  letter-spacing:.3px;
}

input, textarea, select {
  background:var(--bg3);
  border:1px solid var(--border2);
  border-radius:9px;
  color:var(--text);
  font-family:'DM Sans',sans-serif;
  font-size:13px;
  outline:none;
  transition:border-color .2s;
}
input:focus, textarea:focus, select:focus {
  border-color:var(--accent);
  box-shadow:0 0 0 3px rgba(109,90,255,.12);
}
`;

// ─────────────────────────────────────────────
// CAMERA TILE
// ─────────────────────────────────────────────
function CameraTile({ stream, label, size = "sm", muted = true, videoRef = null }) {
  const localRef = useRef(null);
  const activeRef = videoRef || localRef;

  useEffect(() => {
    if (activeRef.current && stream) {
      activeRef.current.srcObject = stream;
    }
  }, [stream, activeRef]);

  const s = size === "lg" ? { width: 220, height: 160 } : { width: 120, height: 90 };
  return (
    <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', background: '#000', border: '1px solid var(--border3)', ...s, flexShrink: 0 }}>
      {stream
        ? <video ref={activeRef} autoPlay muted={muted} playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
        : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg3)' }}>
          <span style={{ fontSize: 24 }}>📷</span>
        </div>
      }
      {label && (
        <div style={{ position: 'absolute', bottom: 6, left: 7, fontSize: 9, fontFamily: "'DM Mono',monospace", color: 'rgba(255,255,255,.7)', background: 'rgba(0,0,0,.6)', padding: '2px 7px', borderRadius: 100, backdropFilter: 'blur(4px)' }}>
          {label}
        </div>
      )}
      <div style={{ position: 'absolute', top: 6, right: 6, width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', animation: 'glow 2s ease-in-out infinite' }} />
    </div>
  );
}

// ─────────────────────────────────────────────
// NOISE TEXTURE SVG
// ─────────────────────────────────────────────
const NoiseBg = () => (
  <svg style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', opacity: .025, zIndex: 0 }}>
    <filter id="noise">
      <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
      <feColorMatrix type="saturate" values="0" />
    </filter>
    <rect width="100%" height="100%" filter="url(#noise)" />
  </svg>
);

// ─────────────────────────────────────────────
// WAVEFORM VISUALIZER
// ─────────────────────────────────────────────
function Waveform({ active, color = 'var(--accent)' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, height: 24 }}>
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} style={{
          width: 2.5, borderRadius: 2, background: color, opacity: active ? 0.9 : 0.2,
          height: active ? 4 : 4,
          animation: active ? `waveform ${0.5 + (i % 5) * 0.12}s ease-in-out ${i * 0.06}s infinite` : 'none',
          transition: 'opacity .3s',
        }} />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────
// PREFLIGHT SCREEN (Camera + Mic check)
// ─────────────────────────────────────────────
function PreflightScreen({ onReady }) {
  const [camStatus, setCamStatus] = useState('idle'); // idle | checking | ok | error
  const [micStatus, setMicStatus] = useState('idle');
  const [micLevel, setMicLevel] = useState(0);
  const [stream, setStream] = useState(null);
  const [micStream, setMicStream] = useState(null);
  const [checking, setChecking] = useState(false);
  const analyserRef = useRef(null);
  const animRef = useRef(null);
  const [agreed, setAgreed] = useState(false);

  const startCheck = async () => {
    setChecking(true);
    setCamStatus('checking');
    setMicStatus('checking');
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setStream(s);
      setCamStatus('ok');
      setMicStatus('ok');

      // Mic level analyzer
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(s);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      analyserRef.current = analyser;
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        setMicLevel(Math.min(100, avg * 2.5));
        animRef.current = requestAnimationFrame(tick);
      };
      tick();
      setMicStream(s);
    } catch (err) {
      if (err.name === 'NotAllowedError') { setCamStatus('error'); setMicStatus('error'); }
      else { setCamStatus('error'); setMicStatus('error'); }
    }
    setChecking(false);
  };

  useEffect(() => () => { animRef.current && cancelAnimationFrame(animRef.current); }, []);

  const allOk = camStatus === 'ok' && micStatus === 'ok';

  const StatusDot = ({ status }) => {
    const colors = { idle: 'var(--muted)', checking: 'var(--amber)', ok: 'var(--green)', error: 'var(--red)' };
    const icons = { idle: '○', checking: '◌', ok: '✓', error: '✕' };
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontFamily: "'DM Mono',monospace", color: colors[status], animation: status === 'checking' ? 'glow 1s infinite' : 'none' }}>
        {icons[status]} {status}
      </span>
    );
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, position: 'relative' }}>
      <NoiseBg />
      {/* Grid bg */}
      <div style={{ position: 'fixed', inset: 0, backgroundImage: 'linear-gradient(var(--border) 1px,transparent 1px),linear-gradient(90deg,var(--border) 1px,transparent 1px)', backgroundSize: '48px 48px', opacity: .4, pointerEvents: 'none', zIndex: 0 }} />
      <div style={{ maxWidth: 520, width: '100%', position: 'relative', zIndex: 1, animation: 'scaleIn .5s cubic-bezier(.34,1.56,.64,1)' }}>
        {/* Header badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 28 }}>
          <div className="tag" style={{ background: 'var(--accent3)', border: '1px solid rgba(109,90,255,.25)', color: 'var(--accent2)' }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block' }} />
            PREFLIGHT CHECK
          </div>
        </div>

        <h1 className="syne" style={{ fontSize: 32, fontWeight: 800, letterSpacing: -1.5, lineHeight: 1.1, marginBottom: 10 }}>
          Before we begin,<br />let's verify your setup.
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.7, marginBottom: 32 }}>
          This interview requires camera and microphone access. Your session is private — nothing is recorded or stored.
        </p>

        {/* Check cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
          {/* Camera */}
          <div className="card" style={{ padding: 18, display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: camStatus === 'ok' ? 'var(--green2)' : camStatus === 'error' ? 'var(--red2)' : 'var(--bg3)', border: `1px solid ${camStatus === 'ok' ? 'rgba(0,229,160,.25)' : camStatus === 'error' ? 'rgba(255,77,109,.25)' : 'var(--border2)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, transition: 'all .3s', flexShrink: 0 }}>
              📷
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 3 }}>Camera</div>
              <StatusDot status={camStatus} />
            </div>
            {stream && <CameraTile stream={stream} size="sm" />}
          </div>

          {/* Mic */}
          <div className="card" style={{ padding: 18, display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: micStatus === 'ok' ? 'var(--green2)' : micStatus === 'error' ? 'var(--red2)' : 'var(--bg3)', border: `1px solid ${micStatus === 'ok' ? 'rgba(0,229,160,.25)' : micStatus === 'error' ? 'rgba(255,77,109,.25)' : 'var(--border2)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, transition: 'all .3s', flexShrink: 0 }}>
              🎤
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 3 }}>Microphone</div>
              <StatusDot status={micStatus} />
              {micStatus === 'ok' && (
                <div style={{ marginTop: 6 }}>
                  <div style={{ height: 4, background: 'var(--bg4)', borderRadius: 100, overflow: 'hidden', width: 180 }}>
                    <div style={{ height: '100%', background: 'linear-gradient(90deg,var(--accent),var(--teal))', width: micLevel + '%', transition: 'width .1s', borderRadius: 100 }} />
                  </div>
                  <div className="mono" style={{ fontSize: 9, color: 'var(--muted)', marginTop: 3 }}>Live level: {Math.round(micLevel)}%</div>
                </div>
              )}
            </div>
            {micStatus === 'ok' && <Waveform active={micLevel > 5} color="var(--teal)" />}
          </div>
        </div>

        {camStatus === 'error' && (
          <div style={{ padding: '11px 14px', borderRadius: 9, background: 'var(--red2)', border: '1px solid rgba(255,77,109,.2)', fontSize: 12, color: 'var(--red)', marginBottom: 16, lineHeight: 1.6 }}>
            ⚠ Camera/mic access blocked. Please allow permissions in your browser settings and refresh.
          </div>
        )}

        {!checking && camStatus === 'idle' && (
          <button className="btn-primary" style={{ width: '100%', marginBottom: 12 }} onClick={startCheck}>
            Check Camera & Microphone →
          </button>
        )}

        {checking && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 18px', background: 'var(--bg3)', borderRadius: 10, marginBottom: 12, fontSize: 13, color: 'var(--text2)' }}>
            <div style={{ width: 14, height: 14, border: '2px solid var(--accent)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'rotate .8s linear infinite' }} />
            Requesting permissions…
          </div>
        )}

        {allOk && (
          <>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '13px 14px', background: 'var(--bg3)', borderRadius: 9, border: '1px solid var(--border2)', marginBottom: 16, cursor: 'pointer' }} onClick={() => setAgreed(!agreed)}>
              <div style={{ width: 18, height: 18, borderRadius: 5, border: `1.5px solid ${agreed ? 'var(--accent)' : 'var(--border3)'}`, background: agreed ? 'var(--accent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1, transition: 'all .2s' }}>
                {agreed && <span style={{ fontSize: 10, color: '#fff', lineHeight: 1 }}>✓</span>}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>
                I understand this interview must be completed in one session. Switching tabs or exiting fullscreen will be flagged as a violation.
              </div>
            </div>
            <button className="btn-primary" style={{ width: '100%', opacity: agreed ? 1 : 0.4 }} disabled={!agreed} onClick={() => onReady(stream)}>
              Begin Interview in Fullscreen →
            </button>
          </>
        )}

        <div style={{ marginTop: 18, fontSize: 11, color: 'var(--muted)', textAlign: 'center', fontFamily: "'DM Mono',monospace", lineHeight: 1.7 }}>
          Proctored · Voice-First · Adaptive
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// TAB SWITCH GUARD
// ─────────────────────────────────────────────
function TabSwitchGuard({ active, onViolation }) {
  const countRef = useRef(0);
  useEffect(() => {
    if (!active) return;
    const handle = () => {
      if (document.hidden) {
        countRef.current += 1;
        onViolation(countRef.current);
      }
    };
    document.addEventListener('visibilitychange', handle);
    return () => document.removeEventListener('visibilitychange', handle);
  }, [active, onViolation]);
  return null;
}

// ─────────────────────────────────────────────
// VIOLATION TOAST
// ─────────────────────────────────────────────
function ViolationToast({ count, onDismiss }) {
  useEffect(() => { const t = setTimeout(onDismiss, 4000); return () => clearTimeout(t); }, [count]);
  return (
    <div style={{ position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 9999, animation: 'fadeUp .3s ease', padding: '12px 20px', borderRadius: 10, background: 'rgba(255,77,109,.15)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,77,109,.35)', display: 'flex', alignItems: 'center', gap: 10, minWidth: 300, boxShadow: '0 8px 32px rgba(0,0,0,.5)' }}>
      <span style={{ fontSize: 16 }}>⚠️</span>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--red)' }}>Tab Switch Detected</div>
        <div className="mono" style={{ fontSize: 10, color: 'var(--text2)', marginTop: 2 }}>Violation #{count} · This is being logged</div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// FULLSCREEN GUARD
// ─────────────────────────────────────────────
function FullscreenBanner({ onReenter }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(2,2,7,.96)', backdropFilter: 'blur(20px)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, animation: 'fadeIn .2s' }}>
      <NoiseBg />
      <div style={{ fontSize: 40 }}>⛶</div>
      <div className="syne" style={{ fontSize: 22, fontWeight: 700, letterSpacing: -1, textAlign: 'center' }}>Fullscreen required</div>
      <p style={{ fontSize: 13, color: 'var(--text2)', textAlign: 'center', maxWidth: 320, lineHeight: 1.7 }}>
        You exited fullscreen mode. This interview must be taken in fullscreen to prevent distractions.
      </p>
      <button className="btn-primary" style={{ minWidth: 220 }} onClick={onReenter}>
        Re-enter Fullscreen →
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────
// SETUP SCREEN
// ─────────────────────────────────────────────
function SetupScreen({ onStart, mediaStream }) {
  const [tab, setTab] = useState("paste");
  const [jdText, setJdText] = useState("");
  const [parsedTopics, setParsedTopics] = useState([]);
  const [selectedTopic, setSelectedTopic] = useState(null);
  const [numQuestions, setNumQuestions] = useState(10);
  const [scenarioMode, setScenarioMode] = useState("both");
  const [starting, setStarting] = useState(false);
  const [pdfText, setPdfText] = useState("");   // full text extracted from PDF for RAG
  const [pdfName, setPdfName] = useState("");
  const [pdfLoading, setPdfLoading] = useState(false);

  const parseJD = (text) => {
    setJdText(text);
    if (text.length < 30) { setParsedTopics([]); setSelectedTopic(null); return; }
    const topics = extractTopics(text);
    setParsedTopics(topics);
    if (topics.length > 0) setSelectedTopic(topics[0]);
  };

  // ── PDF extraction using PDF.js ─────────────────────────────────────────────
  const handlePDF = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setPdfLoading(true);
    setPdfName(file.name);
    setPdfText("");
    try {
      // Load PDF.js from CDN if not already loaded
      if (!window.pdfjsLib) {
        await new Promise((resolve, reject) => {
          const s = document.createElement('script');
          s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
          s.onload = resolve; s.onerror = reject;
          document.head.appendChild(s);
        });
        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      }
      const buf = await file.arrayBuffer();
      const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
      let text = "";
      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const content = await page.getTextContent();
        text += content.items.map(i => i.str).join(" ") + "\n";
      }
      const cleaned = text.replace(/\s+/g, " ").trim();
      setPdfText(cleaned);                       // full text → sent to backend for RAG
      parseJD(cleaned.slice(0, 3000));           // first 3k chars → local topic extractor
    } catch (err) {
      console.error("PDF extraction failed:", err);
      setPdfName(file.name + " (failed — try pasting text)");
    } finally {
      setPdfLoading(false);
    }
  };

  // canStart: any meaningful input unlocks the button
  const canStart = selectedTopic || parsedTopics.length > 0 || jdText.length >= 30 || pdfText.length > 50;

  const handleStart = () => {
    if (starting) return;
    setStarting(true);

    // Priority: explicit topic card > PDF-derived topics > JD paste topics > ""
    const topic = selectedTopic || parsedTopics[0] || "";

    // When a topic card is selected alongside a PDF, pass BOTH:
    //   - domain = topic  (tells Agent 1 what to focus on)
    //   - jd_text = topic label (so Agent 1 has a concrete domain hint)
    //   - pdf_text = full PDF for RAG (highest priority for question grounding)
    // When only JD paste is used, jd_text carries the full paste.
    const effectiveJdText = pdfText
      ? (selectedTopic ? selectedTopic : (parsedTopics[0] || jdText))  // compact hint for Agent 1 when RAG has full PDF
      : jdText;

    onStart({
      topic,
      jdText: effectiveJdText,
      pdfText,
      jdFromJD: parsedTopics.length > 0 ? parsedTopics : null,
      numQuestions,
      scenarioMode
    });
  };

  return (
    <div style={{ display: 'flex', height: '100%', position: 'relative' }}>
      {/* Left: Form */}
      <div style={{ flex: 1, padding: '48px 48px', overflowY: 'auto', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ maxWidth: 520 }}>
          <div className="tag" style={{ background: 'var(--accent3)', border: '1px solid rgba(109,90,255,.2)', color: 'var(--accent2)', marginBottom: 24 }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block' }} />
            ADAPTIVE INTERVIEW SYSTEM
          </div>
          <h1 className="syne" style={{ fontSize: 'clamp(28px,3.5vw,42px)', fontWeight: 800, letterSpacing: -2, lineHeight: 1.05, marginBottom: 12 }}>
            Know <em style={{ fontStyle: 'italic', color: 'var(--accent2)' }}>how</em> you think.<br />Not just what you know.
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.7, marginBottom: 36 }}>
            Paste a Job Description or pick a topic. The system maps your reasoning patterns and teaches your exact gaps using the Socratic method.
          </p>

          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border2)', marginBottom: 20, gap: 2 }}>
            {[['paste', 'Paste JD'], ['pdf', 'Upload PDF'], ['topic', 'Pick Topic']].map(([t, label]) => (
              <button key={t} onClick={() => setTab(t)} style={{ padding: '8px 16px', fontSize: 12, fontWeight: 500, background: 'transparent', border: 'none', borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent', color: tab === t ? 'var(--text)' : 'var(--muted)', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", transition: 'all .2s', marginBottom: -1 }}>
                {label}
              </button>
            ))}
          </div>

          {tab === 'paste' && (
            <textarea value={jdText} onChange={e => parseJD(e.target.value)}
              placeholder={"Paste job description here...\n\nWe're looking for a Software Engineer with strong knowledge of Data Structures, System Design, Operating Systems..."}
              rows={5} style={{ width: '100%', padding: 14, resize: 'none', lineHeight: 1.7, minHeight: 130 }} />
          )}

          {tab === 'pdf' && (
            <div>
              <div
                onClick={() => !pdfLoading && document.getElementById('pdf-input').click()}
                style={{ border: `1.5px dashed ${pdfText ? 'var(--green)' : 'var(--border3)'}`, borderRadius: 12, padding: 32, textAlign: 'center', cursor: pdfLoading ? 'default' : 'pointer', transition: 'all .2s', background: pdfText ? 'var(--green2)' : 'transparent' }}>
                {pdfLoading ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                    <div style={{ width: 14, height: 14, border: '2px solid var(--accent)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'rotate .7s linear infinite' }} />
                    <span style={{ fontSize: 13, color: 'var(--text2)' }}>Extracting PDF text…</span>
                  </div>
                ) : pdfText ? (
                  <>
                    <div style={{ fontSize: 28, marginBottom: 6 }}>✅</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--green)', marginBottom: 3 }}>{pdfName}</div>
                    <div className="mono" style={{ fontSize: 10, color: 'var(--muted)' }}>
                      {pdfText.length.toLocaleString()} chars · RAG index builds on Start
                    </div>
                    <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text2)' }}>Click to replace</div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 32, marginBottom: 10 }}>📄</div>
                    <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 5 }}>Drop or click to upload JD PDF</div>
                    <div className="mono" style={{ fontSize: 10, color: 'var(--muted)' }}>Text extracted in-browser · not uploaded to any server</div>
                  </>
                )}
                <input id="pdf-input" type="file" accept=".pdf" style={{ display: 'none' }} onChange={handlePDF} />
              </div>
              {pdfText && parsedTopics.length > 0 && (
                <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 8, background: 'var(--green2)', border: '1px solid rgba(0,229,160,.2)', fontSize: 11, color: 'var(--green)', fontFamily: "'DM Mono',monospace" }}>
                  ✓ {parsedTopics.length} topics detected · Primary: <strong>{parsedTopics[0]}</strong>
                </div>
              )}
            </div>
          )}

          {tab === 'topic' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {TOPIC_CARDS.map(({ topic, icon, sub }) => (
                <div key={topic} onClick={() => setSelectedTopic(topic)}
                  style={{ padding: '14px 16px', borderRadius: 11, border: selectedTopic === topic ? '1px solid var(--accent)' : '1px solid var(--border2)', background: selectedTopic === topic ? 'var(--accent3)' : 'var(--bg2)', cursor: 'pointer', transition: 'all .2s', position: 'relative' }}>
                  {selectedTopic === topic && <div style={{ position: 'absolute', top: 10, right: 10, width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)' }} />}
                  <div style={{ fontSize: 22, marginBottom: 6 }}>{icon}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{topic}</div>
                  <div style={{ fontSize: 11, color: 'var(--text2)' }}>{sub}</div>
                </div>
              ))}
            </div>
          )}

          {parsedTopics.length > 0 && (
            <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 9, background: 'var(--green2)', border: '1px solid rgba(0,229,160,.2)', fontSize: 11, color: 'var(--green)', fontFamily: "'DM Mono',monospace", lineHeight: 1.6 }}>
              ✓ {parsedTopics.length} topics extracted · Primary: <strong>{parsedTopics[0]}</strong>
            </div>
          )}

          {/* Settings */}
          <div style={{ marginTop: 20, display: 'flex', gap: 16 }}>
            <label style={{ fontSize: 12, color: 'var(--text2)', display: 'flex', flexDirection: 'column', gap: 6 }}>
              Questions
              <select value={numQuestions} onChange={e => setNumQuestions(+e.target.value)} style={{ padding: '7px 10px' }}>
                {[5, 8, 10, 12, 15].map(n => <option key={n} value={n}>{n} questions</option>)}
              </select>
            </label>
            <label style={{ fontSize: 12, color: 'var(--text2)', display: 'flex', flexDirection: 'column', gap: 6 }}>
              Style
              <select value={scenarioMode} onChange={e => setScenarioMode(e.target.value)} style={{ padding: '7px 10px' }}>
                <option value="no">Concepts Only</option>
                <option value="scenario">Scenario-Based</option>
                <option value="both">Mixed</option>
              </select>
            </label>
          </div>

          <button className="btn-primary" style={{ width: '100%', marginTop: 24 }} disabled={!canStart || starting} onClick={handleStart}>
            {starting ? (
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                <div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'rotate .7s linear infinite' }} />
                Generating interview questions…
              </span>
            ) : 'Start Interview →'}
          </button>
        </div>
      </div>

      {/* Right: Camera preview + info */}
      <div style={{ width: 320, background: 'var(--bg1)', borderLeft: '1px solid var(--border2)', padding: 28, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div>
          <div className="mono" style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>LIVE PREVIEW</div>
          <CameraTile stream={mediaStream} label="You" size="lg" />
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, color: 'var(--green)', fontFamily: "'DM Mono',monospace" }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', display: 'inline-block', animation: 'glow 2s infinite' }} />
            Camera & mic active
          </div>
        </div>

        <div style={{ height: 1, background: 'var(--border)' }} />

        <div>
          <div className="mono" style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>SESSION RULES</div>
          {[
            ['⛶', 'Fullscreen enforced', 'Exiting fullscreen pauses the session'],
            ['🔒', 'No tab switching', 'Violations are logged and flagged'],
            ['🎤', 'Voice-first', 'Speak your answers naturally'],
            ['🧠', 'Adaptive AI', 'Questions adapt to your reasoning gaps'],
          ].map(([icon, title, desc]) => (
            <div key={title} style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
              <div style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>{icon}</div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>{title}</div>
                <div style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.5 }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// HEADER BAR
// ─────────────────────────────────────────────
function Header({ phase, topic, questionIndex, totalQ, violations, mediaStream, timerSeconds }) {
  const phases = ['setup', 'interview', 'analysis', 'learning', 'report'];
  const mins = String(Math.floor(timerSeconds / 60)).padStart(2, '0');
  const secs = String(timerSeconds % 60).padStart(2, '0');

  return (
    <div style={{ height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', borderBottom: '1px solid var(--border)', background: 'rgba(2,2,7,.92)', backdropFilter: 'blur(16px)', position: 'relative', zIndex: 50, flexShrink: 0 }}>
      {/* Left */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)', boxShadow: '0 0 12px var(--accent)' }} />
          <span className="syne" style={{ fontSize: 13, fontWeight: 700, letterSpacing: -.5 }}>CognitiveInt</span>
          <span style={{ color: 'var(--muted)', fontSize: 11 }}>×</span>
          <span className="syne" style={{ fontSize: 13, fontWeight: 700, letterSpacing: -.5, color: 'var(--teal)' }}>SocraticMind</span>
        </div>
        {topic && (
          <div className="tag" style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', color: 'var(--text2)', fontSize: 10 }}>
            {topic}
          </div>
        )}
      </div>

      {/* Center: Progress */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {phases.map((p, i) => (
          <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: i < phase ? 22 : 22, height: 4, borderRadius: 100, background: i < phase ? 'var(--green)' : i === phase ? 'var(--accent)' : 'var(--bg4)', transition: 'all .5s', boxShadow: i === phase ? '0 0 8px var(--accent)' : 'none' }} />
          </div>
        ))}
        {phase === 1 && totalQ > 0 && (
          <span className="mono" style={{ fontSize: 10, color: 'var(--text2)', marginLeft: 6 }}>{questionIndex + 1}/{totalQ}</span>
        )}
      </div>

      {/* Right */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {phase > 0 && (
          <div className="mono" style={{ fontSize: 12, color: timerSeconds > 3600 ? 'var(--red)' : 'var(--text2)', letterSpacing: .5 }}>
            {mins}:{secs}
          </div>
        )}
        {violations > 0 && (
          <div className="tag" style={{ background: 'var(--red2)', border: '1px solid rgba(255,77,109,.25)', color: 'var(--red)' }}>
            ⚠ {violations} violation{violations > 1 ? 's' : ''}
          </div>
        )}
        {mediaStream && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--green)', animation: 'glow 2s infinite' }} />
            <span className="mono" style={{ fontSize: 9, color: 'var(--muted)' }}>LIVE</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// INTERVIEW SCREEN
// ─────────────────────────────────────────────
function InterviewScreen({ state, onAnswer, voice, mediaStream, videoRef }) {
  const [answer, setAnswer] = useState('');
  const [listening, setListening] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState('Preparing question…');
  const [speaking, setSpeaking] = useState(false);
  const [analysisBox, setAnalysisBox] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  // const [idleCountdown, setIdleCountdown] = useState(0);
  const feedbackTimerRef = useRef(null);
  const answerRef = useRef('');

  const questionText = state.currentQuestion || "Waiting for question…";
  const total = state.max_questions || 10;
  // FIX: guard against fp being undefined during initial render
  const fp = state.fp || { depth: 0, acc: 0, conf: 0, cons: 0, orig: 0 };
  const barColor = (v) => v < 35 ? 'var(--red)' : v < 60 ? 'var(--amber)' : 'var(--green)';

  // updateAnswer keeps ref + state in sync — safe to call from any closure
  const updateAnswer = useCallback((text) => {
    answerRef.current = text;
    setAnswer(text);
  }, []);

  // ── Voice callbacks (stable refs so they don't re-register on every render) ─
  const onUpdate = useCallback((text, isInterim) => {
    updateAnswer(text);
    setVoiceStatus(isInterim ? '🔴 Listening…' : '✔ Got that — keep talking or stop');
  }, [updateAnswer]);

  const onDone = useCallback((finalText) => {
    updateAnswer(finalText);
    setListening(false);
    setVoiceStatus('✓ Done — review & click Submit');
  }, [updateAnswer]);

  const onVoiceErr = useCallback((err) => {
    setListening(false);
    setVoiceStatus(err === 'not-allowed' ? '🚫 Mic permission denied — type below' : '🎤 Click mic to retry');
  }, []);

  // ── Auto-speak question, then auto-open mic ─────────────────────────────────
  useEffect(() => {
    if (!questionText || questionText === "Waiting for question…") return;
    clearTimeout(feedbackTimerRef.current);
    voice.stopListening();
    voice.stopSpeaking();
    setListening(false);
    updateAnswer('');
    setAnalysisBox(null);
    setSubmitting(false);
    setSpeaking(true);
    setVoiceStatus('🔊 AI is reading the question…');

    voice.speak(questionText, () => {
      setSpeaking(false);
      setVoiceStatus('🎤 Mic is ON — speak your answer');
      const ok = voice.startListening(onUpdate, onDone, onVoiceErr);
      setListening(!!ok);
    });

    return () => {
      voice.stopSpeaking();
      voice.stopListening();
    };
  }, [state.questionIndex, state.currentQuestion]); // eslint-disable-line

  // ── Manual mic toggle ───────────────────────────────────────────────────────
  const toggleMic = useCallback(() => {
    if (speaking) return;
    if (listening) {
      voice.stopListening();
      setListening(false);
      setVoiceStatus('✓ Recording stopped — review & Submit');
      return;
    }
    const ok = voice.startListening(onUpdate, onDone, onVoiceErr);
    if (ok) { setListening(true); setVoiceStatus('🔴 Listening…'); }
    else setVoiceStatus('Voice not supported — type below');
  }, [speaking, listening, voice, onUpdate, onDone, onVoiceErr]);

  // ── Submit answer & advance ─────────────────────────────────────────────────
  const handleSubmit = async () => {
    const currentAnswer = answerRef.current.trim();
    if (!currentAnswer) return;
    voice.stopListening();
    voice.stopSpeaking();
    setListening(false);
    setSubmitting(true);
    setVoiceStatus('⏳ Analysing…');

    try {
      const res = await fetch('/api/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: state.session_id, answer: currentAnswer })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      if (data.completed) {
        // Interview done — stop camera & exit fullscreen, go to transition screen
        if (mediaStream) mediaStream.getTracks().forEach(t => t.stop());
        document.exitFullscreen?.().catch(() => { });
        onAnswer({ completed: true });
        return;
      }

      // ui_scores from multi-agent backend — no evaluation data returned mid-interview
      const scores = data.ui_scores ? {
        depth: data.ui_scores.depth ?? 0,
        acc: data.ui_scores.acc ?? 0,
        conf: data.ui_scores.conf ?? 0,
        cons: data.ui_scores.cons ?? 0,
        orig: data.ui_scores.orig ?? 0,
      } : null;  // null = keep previous fp unchanged

      // Immediately advance — no feedback shown here, all feedback is in final report
      updateAnswer('');
      setSubmitting(false);
      onAnswer({
        scores,
        nextQuestion: data.next_question,
        difficulty: data.difficulty,
        // FIX: pass weak_area so state.weakSpots accumulates real backend values
        weak_area: data.weak_area || '',
      });
    } catch (err) {
      console.error('Submit error:', err);
      setVoiceStatus('❌ Network error — check backend');
      setSubmitting(false);
    }
  };

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      {/* Main column */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ flex: 1, padding: '32px 40px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Q label row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div className="tag" style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', color: 'var(--muted)', fontSize: 10 }}>
                Q{state.questionIndex + 1} of {total}
              </div>
              <div className="tag" style={{ background: state.questionIndex <= 2 ? 'var(--green2)' : 'var(--accent3)', border: `1px solid ${state.questionIndex <= 2 ? 'rgba(0,229,160,.2)' : 'rgba(109,90,255,.2)'}`, color: state.questionIndex <= 2 ? 'var(--green)' : 'var(--accent2)', fontSize: 10 }}>
                {state.questionIndex <= 2 ? 'Warm-up' : 'Adaptive'}
              </div>
              <div className="tag" style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', color: 'var(--accent2)', fontSize: 10 }}>
                {state.difficulty || 'medium'}
              </div>
            </div>
            <div className="mono" style={{ fontSize: 10, color: 'var(--muted)' }}>topic: {state.topic}</div>
          </div>

          {/* Question card */}
          <div key={state.questionIndex} style={{ background: 'var(--bg2)', border: `1px solid ${speaking ? 'rgba(109,90,255,.4)' : 'var(--border2)'}`, borderRadius: 16, padding: '24px 28px', position: 'relative', overflow: 'hidden', animation: 'fadeUp .4s ease', transition: 'border-color .4s' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg,var(--accent),var(--teal))' }} />
            {speaking && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, padding: '6px 10px', borderRadius: 7, background: 'var(--accent3)', width: 'fit-content' }}>
                <Waveform active={true} color="var(--accent)" />
                <span className="mono" style={{ fontSize: 10, color: 'var(--accent2)' }}>🔊 AI reading question…</span>
              </div>
            )}
            <div style={{ fontSize: 17, lineHeight: 1.75, fontWeight: 400, letterSpacing: '-.1px', color: 'var(--text)' }}>{questionText}</div>
          </div>

          {/* Voice input box */}
          <div style={{ background: 'var(--bg2)', border: `1.5px solid ${listening ? 'var(--red)' : speaking ? 'rgba(0,212,180,.3)' : 'var(--border2)'}`, borderRadius: 14, padding: 20, transition: 'border-color .3s' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <button
                onClick={toggleMic}
                disabled={speaking}
                style={{
                  width: 48, height: 48, borderRadius: '50%',
                  border: `1.5px solid ${listening ? 'var(--red)' : 'var(--border3)'}`,
                  background: listening ? 'var(--red2)' : 'var(--bg3)',
                  cursor: speaking ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 20, transition: 'all .2s', flexShrink: 0,
                  animation: listening ? 'pulseRed 1.2s infinite' : 'none',
                }}
              >
                {speaking ? '🔊' : listening ? '⏹' : '🎤'}
              </button>
              <div style={{ flex: 1 }}>
                <div className="mono" style={{ fontSize: 11, color: listening ? 'var(--red)' : speaking ? 'var(--teal)' : 'var(--text2)', marginBottom: 2 }}>{voiceStatus}</div>
                {listening && <Waveform active={true} color="var(--red)" />}
              </div>
              {answer && <div className="mono" style={{ fontSize: 10, color: 'var(--muted)' }}>{answer.split(' ').filter(Boolean).length} words</div>}
            </div>
            {/* Single textarea — shows live transcript directly, no separate interim div */}
            <textarea
              value={answer}
              onChange={e => updateAnswer(e.target.value)}
              placeholder="Your voice transcript appears here live — or type directly…"
              rows={4}
              style={{ width: '100%', background: 'transparent', border: 'none', color: listening ? 'var(--text)' : 'var(--text)', fontFamily: "'DM Sans',sans-serif", fontSize: 14, outline: 'none', resize: 'none', lineHeight: 1.7, minHeight: 80, padding: 0 }}
            />
          </div>

          {/* Action row */}
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn-primary" disabled={!answer.trim() || submitting || speaking} onClick={handleSubmit}>
              {submitting ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'rotate .7s linear infinite' }} />
                  Analysing…
                </span>
              ) : 'Submit Answer →'}
            </button>
            <button className="btn-ghost" onClick={() => { updateAnswer(''); }}>Clear</button>
          </div>

          {/* Answer saved indicator — NO feedback shown mid-interview.
              All feedback (scores, strengths, weaknesses, correctness)
              is stored silently and revealed only in the final report. */}
          {submitting && (
            <div style={{ padding: '10px 14px', borderRadius: 9, background: 'var(--bg3)', border: '1px solid var(--border2)', display: 'flex', alignItems: 'center', gap: 10, animation: 'fadeUp .2s ease' }}>
              <div style={{ width: 10, height: 10, border: '2px solid var(--accent)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'rotate .7s linear infinite', flexShrink: 0 }} />
              <span className="mono" style={{ fontSize: 11, color: 'var(--text2)' }}>Answer recorded — preparing next question…</span>
            </div>
          )}
        </div>
      </div>

      {/* Right sidebar */}
      <div style={{ width: 280, borderLeft: '1px solid var(--border)', background: 'var(--bg1)', padding: 20, display: 'flex', flexDirection: 'column', gap: 18, overflowY: 'auto' }}>
        <div>
          <div className="mono" style={{ fontSize: 9, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>YOU</div>
          <CameraTile stream={mediaStream} label="Live" size="sm" videoRef={videoRef} />
        </div>
        <div style={{ height: 1, background: 'var(--border)' }} />
        <div>
          <div className="mono" style={{ fontSize: 9, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>🧠 REASONING MAP</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[['Depth', fp.depth], ['Accuracy', fp.acc], ['Confidence', fp.conf], ['Consistency', fp.cons], ['Originality', fp.orig]].map(([label, val]) => (
              <div key={label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                  <span style={{ color: 'var(--text2)' }}>{label}</span>
                  <span className="mono" style={{ color: barColor(val), fontSize: 11 }}>{val}%</span>
                </div>
                <div style={{ height: 3, background: 'var(--bg4)', borderRadius: 100, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${val}%`, background: barColor(val), borderRadius: 100, transition: 'width .6s ease' }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ height: 1, background: 'var(--border)' }} />
        {state.jdTopics?.length > 0 && (
          <div>
            <div className="mono" style={{ fontSize: 9, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>JD TOPICS</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {state.jdTopics.map((t, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: t.status === 'covered' ? 'var(--green)' : t.status === 'gap' ? 'var(--red)' : 'var(--muted)', flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: t.status === 'gap' ? 'var(--red)' : 'var(--text2)' }}>{t.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// TRANSITION / GAP ANALYSIS
// ─────────────────────────────────────────────
function TransitionScreen({ state, onEnterSocratic, voice }) {
  // FIX: guard against weakSpots being undefined during state transitions
  const gaps = (state.weakSpots || []).slice(0, 3);
  const fp = state.fp || { depth: 0, acc: 0, conf: 0, cons: 0, orig: 0 };
  const barColor = (v) => v < 35 ? 'var(--red)' : v < 60 ? 'var(--amber)' : 'var(--green)';

  useEffect(() => {
    const gapText = gaps.length > 0 ? `I found gaps in ${gaps.join(', ')}.` : 'Let me review your performance.';
    const msg = `Interview complete. Analysing your cognitive map. ${gapText} Let's address these using the Socratic method.`;

    // Hard deadline: always advance after 6s regardless of TTS outcome.
    // This prevents browsers that block autoplay / have no voices from
    // leaving the user stuck forever on the transition screen.
    let advanced = false;
    const advance = () => { if (!advanced) { advanced = true; onEnterSocratic(); } };
    const hardDeadline = setTimeout(advance, 6000);

    voice.speak(msg, () => {
      // TTS finished normally — advance after a short pause
      setTimeout(advance, 1200);
    });

    return () => {
      clearTimeout(hardDeadline);
      voice.stopSpeaking();
    };
  }, []); // eslint-disable-line

  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40, position: 'relative' }}>
      <NoiseBg />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 60% 50% at 50% 40%,rgba(109,90,255,.07) 0%,transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ maxWidth: 800, width: '100%', position: 'relative', zIndex: 1, animation: 'scaleIn .5s cubic-bezier(.34,1.56,.64,1)', display: 'flex', gap: 24 }}>

        {/* Main Panel */}
        <div style={{ flex: 1, background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 20, overflow: 'hidden' }}>
          <div style={{ height: 2, background: 'linear-gradient(90deg,var(--accent),var(--teal))' }} />
          <div style={{ padding: '32px' }}>
            <h2 className="syne" style={{ fontSize: 24, fontWeight: 800, letterSpacing: -1, marginBottom: 10 }}>Analysis Complete</h2>
            <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.7, marginBottom: 24 }}>
              We've mapped your reasoning fingerprint. Start Socratic sessions to strengthen your fundamentals.
            </p>

            <div className="mono" style={{ fontSize: 9, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>FOCUS AREAS</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
              {gaps.map((g, i) => (
                <div key={g} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, background: 'var(--red2)', border: '1px solid rgba(255,77,109,.15)', animation: `fadeUp .4s ease ${i * 0.08}s both` }}>
                  <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--red)', flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: 'var(--text2)' }}>{g}</span>
                </div>
              ))}
            </div>

            <button className="btn-primary" style={{ width: '100%' }} onClick={onEnterSocratic}>
              Start Socratic Learning →
            </button>
          </div>
        </div>

        {/* Cognitive Map Panel */}
        <div style={{ width: 300, background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 20, padding: 24 }}>
          <div className="mono" style={{ fontSize: 9, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 16 }}>🧠 REASONING MAP</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[['Depth', fp.depth], ['Accuracy', fp.acc], ['Confidence', fp.conf], ['Consistency', fp.cons], ['Originality', fp.orig]].map(([label, val]) => (
              <div key={label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                  <span style={{ color: 'var(--text2)' }}>{label}</span>
                  <span className="mono" style={{ fontSize: 10, color: val ? barColor(val) : 'var(--muted)' }}>{val || '—'}%</span>
                </div>
                <div style={{ height: 4, borderRadius: 100, background: 'var(--bg4)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 100, width: (val || 0) + '%', background: val ? barColor(val) : 'var(--bg4)', transition: 'width 1.5s cubic-bezier(.4,0,.2,1)' }} />
                </div>
              </div>
            ))}
          </div>
          {state.pattern && (
            <div style={{ marginTop: 20, padding: '10px 14px', borderRadius: 8, background: 'rgba(240,180,41,.07)', border: '1px solid rgba(240,180,41,.2)', fontSize: 11, fontFamily: "'DM Mono',monospace", color: 'var(--amber)' }}>
              {state.pattern}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// INTERVIEW COMPLETED MODAL
// ─────────────────────────────────────────────
function InterviewCompletedModal({ onViewReport }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      animation: 'fadeIn .4s ease',
    }}>
      <div style={{
        background: 'var(--bg2)', border: '1.5px solid rgba(0,229,160,.35)',
        borderRadius: 20, padding: '44px 52px', maxWidth: 440, width: '90%',
        textAlign: 'center', boxShadow: '0 0 60px rgba(0,229,160,.18)',
        animation: 'scaleIn .45s cubic-bezier(.34,1.56,.64,1)',
      }}>
        <div style={{ fontSize: 52, marginBottom: 16 }}>🎓</div>
        <div className="tag" style={{
          background: 'var(--green2)', border: '1px solid rgba(0,229,160,.3)',
          color: 'var(--green)', marginBottom: 18, display: 'inline-flex',
        }}>✓ SESSION COMPLETE</div>
        <h2 className="syne" style={{
          fontSize: 28, fontWeight: 800, letterSpacing: -1,
          color: 'var(--text)', marginBottom: 12,
        }}>Interview Completed!</h2>
        <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.75, marginBottom: 28 }}>
          Your Socratic mentor session has finished. Your full cognitive report is ready — it includes your scores, feedback, strengths, weak areas, and a personalised improvement plan.
        </p>
        <button
          className="btn-primary"
          style={{ width: '100%', fontSize: 14, padding: '14px 0' }}
          onClick={onViewReport}
        >
          View My Full Report →
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// SOCRATIC SCREEN  (v3 — Always renders immediately, API is enhancement only)
// ─────────────────────────────────────────────
function SocraticScreen({ state, onViewReport, voice, mediaStream, videoRef }) {
  // Derive the first topic immediately from state — NEVER wait for API to show something.
  const firstTopic =
    (state.weakSpots && state.weakSpots.length > 0 && state.weakSpots[0]) ||
    state.topic ||
    'core technical concepts';

  // Build the opening message instantly from local data — no API needed.
  const buildLocalOpening = (topic) =>
    `Welcome to your Socratic session! 🦉\n\nI've reviewed your interview and I'd like to explore **${topic}** with you through guided questioning — I won't just give you answers, I'll help you reason to them yourself.\n\nTo begin: in your own words, what do you already understand about ${topic}? Don't worry about being perfect — just share what comes to mind.`;

  // ── State — screen is NEVER blank because we seed messages immediately ─────
  // FIX: use lazy initializer (() => [...]) so React doesn't re-call
  // buildLocalOpening during a flushSyncCallbacks re-render, which was the
  // root cause of the SocraticScreen crash reported in the error boundary.
  const [messages, setMessages] = useState(() => [{
    type: 'ai', text: buildLocalOpening(firstTopic), id: 1, _isInitPlaceholder: true
  }]);
  const [inputText, setInputText] = useState('');
  const [chatStep, setChatStep] = useState(0);
  const [rewardTotal, setRewardTotal] = useState(0);
  const [masteryPct, setMasteryPct] = useState(5);
  const [hintCount, setHintCount] = useState(0);
  const [stratIdx, setStratIdx] = useState(0);
  const [rewardLog, setRewardLog] = useState([]);
  const [listening, setListening] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isWaiting, setIsWaiting] = useState(false);
  const [showCompletedModal, setShowCompletedModal] = useState(false);

  // ── v2: topic-progress tracking ──────────────────────────────────────────
  const [currentAreaIdx, setCurrentAreaIdx] = useState(0);
  const [totalAreas, setTotalAreas] = useState(1);
  const [currentArea, setCurrentArea] = useState('');

  // ── Single end-of-session idle timer ─────────────────────────────────────
  // Fires after 12s of silence when ALL topics are done → shows completed modal.
  // The mid-session nudge timer has been REMOVED — it caused an infinite loop
  // where the nudge would fire every 12s without waiting for user input.
  const [endIdleCountdown, setEndIdleCountdown] = useState(null);
  const allTopicsDoneRef = useRef(false);  // tracks if all areas are finished

  const chatEndRef = useRef(null);
  const initDone = useRef(false);
  const endIdleTimerRef = useRef(null);   // interval for end-session 12s close
  // FIX: stable ref so the init useEffect always reads the correct firstTopic
  // even if the component re-renders before the effect fires (stale closure fix)
  const firstTopicRef = useRef(firstTopic);

  // Stable refs for exitToReport closure
  const rewardTotalRef = useRef(0);
  const masteryPctRef = useRef(5);
  const hintCountRef = useRef(0);
  const stratIdxRef = useRef(0);
  useEffect(() => { rewardTotalRef.current = rewardTotal; }, [rewardTotal]);
  useEffect(() => { masteryPctRef.current = masteryPct; }, [masteryPct]);
  useEffect(() => { hintCountRef.current = hintCount; }, [hintCount]);
  useEffect(() => { stratIdxRef.current = stratIdx; }, [stratIdx]);

  // ── Exit to report ────────────────────────────────────────────────────────
  const exitToReport = () => {
    if (exiting) return;
    clearInterval(endIdleTimerRef.current);
    setExiting(true);
    voice.stopListening();
    voice.stopSpeaking();
    setListening(false);
    setIsSpeaking(false);
    const doExit = () => setTimeout(() => onViewReport(
      rewardTotalRef.current,
      masteryPctRef.current,
      hintCountRef.current,
      STRATEGIES[stratIdxRef.current]
    ), 350);
    if (document.fullscreenElement) {
      document.exitFullscreen().then(doExit).catch(doExit);
    } else {
      doExit();
    }
  };

  // ── End-of-session idle — 12s after all topics done → close ──────────────
  // Only starts when all_topics_done = true (all weak areas covered/revealed).
  // On expiry: shows the completed modal, which leads to the report.
  // The mid-session nudge timer has been fully removed — it caused an infinite
  // 12-second loop interrupting the user before they could type a response.
  const startEndIdleCountdown = (seconds = 12) => {
    clearInterval(endIdleTimerRef.current);
    setEndIdleCountdown(seconds);
    let remaining = seconds;
    endIdleTimerRef.current = setInterval(() => {
      remaining -= 1;
      setEndIdleCountdown(remaining);
      if (remaining <= 0) {
        clearInterval(endIdleTimerRef.current);
        setShowCompletedModal(true);
      }
    }, 1000);
  };

  // ── Reset end-idle timer on any user activity (only when all topics done) ─
  const resetIdleTimers = () => {
    if (allTopicsDoneRef.current) {
      clearInterval(endIdleTimerRef.current);
      endIdleTimerRef.current = null;
      setEndIdleCountdown(null);
      startEndIdleCountdown(12);
    }
    // No mid-session nudge timer — removed to fix the 12s loop bug.
  };

  // ── Completed flow: speak answer → show modal ─────────────────────────────
  const triggerCompletedFlow = (answerText) => {
    if (answerText) {
      setIsSpeaking(true);
      voice.speak(answerText, () => {
        setIsSpeaking(false);
        setShowCompletedModal(true);
      });
    } else {
      setShowCompletedModal(true);
    }
  };

  const addAiMsg = useCallback((text, speakFn) => {
    // Always append a '...' typing indicator first, then replace it with the real text.
    // FIX: The old logic tried to detect and reuse an init placeholder but had a race
    // condition — if the placeholder was replaced before the timeout, the update
    // targeted the wrong index. Now we always append a fresh '...' and replace it
    // by its unique id, which is always correct regardless of message list state.
    const msgId = Date.now() + Math.random();
    setMessages(prev => {
      // If the only message is the init placeholder, replace it instead of appending
      if (prev.length === 1 && prev[0]._isInitPlaceholder) {
        return [{ type: 'ai', text: '...', id: msgId }];
      }
      return [...prev, { type: 'ai', text: '...', id: msgId }];
    });
    setTimeout(() => {
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, text } : m));
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      if (speakFn) {
        setIsSpeaking(true);
        speakFn(text, () => setIsSpeaking(false));
      }
    }, 900);
  }, []);

  // ── Init: speak the local opening immediately, then optionally upgrade with API ─
  // The screen is already showing content. This effect just:
  //  1. Speaks the local opening message via TTS
  //  2. Tries to fetch a richer opening from the backend (silently replaces if it works)
  // If the API fails for any reason, the local message stays — screen is never blank.
  useEffect(() => {
    if (initDone.current) return;
    initDone.current = true;

    // FIX: use the stable ref so we always get the correct topic even if
    // the component re-rendered between mount and effect execution
    const localOpening = buildLocalOpening(firstTopicRef.current);

    // Speak the local message immediately — don't wait for API
    setIsSpeaking(true);
    voice.speak(localOpening, () => setIsSpeaking(false));
    setCurrentArea(firstTopicRef.current);
    setTotalAreas(Math.max(1, (state.weakSpots || []).length || 1));

    // No mid-session nudge timer started here — removed to fix 12s loop bug.

    // Silently try to get a richer opening from backend — replace if successful
    (async () => {
      try {
        if (!state.session_id) return; // no session — local mode only
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        const res = await fetch('/api/mentor/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({ session_id: state.session_id })
        });
        clearTimeout(timeoutId);
        if (!res.ok) return; // silently keep local message
        const data = await res.json();
        if (data.error || !data.question || !data.question.trim()) return;

        // API responded — upgrade the displayed message
        if (data.total_areas) setTotalAreas(data.total_areas);
        if (data.current_area) setCurrentArea(data.current_area);
        const apiQ = data.question.trim();
        // FIX: replace the init placeholder by id=1 (set in useState initializer)
        setMessages(prev => prev.map(m => m.id === 1 ? { ...m, text: apiQ, _isInitPlaceholder: false } : m));
        // Stop local TTS and re-speak with API message
        voice.stopSpeaking();
        setIsSpeaking(true);
        voice.speak(apiQ, () => setIsSpeaking(false));
      } catch (_) {
        // Any failure — local message stays, no action needed
      }
    })();
  }, []); // eslint-disable-line

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Cleanup end idle timer on unmount
  useEffect(() => () => {
    clearInterval(endIdleTimerRef.current);
  }, []);

  // ── Shared submit to mentor API ───────────────────────────────────────────
  // FIX 2: Added AbortController timeout (25 s) so a stalled request never
  // leaves isWaiting=true permanently (the root cause of the "breaks after
  // ~3 prompts" bug).  On timeout or network error the UI shows a retry
  // message so the user can keep going instead of being stuck.
  const _submitToMentor = async (text, displayText) => {
    resetIdleTimers();
    setIsWaiting(true);
    voice.stopSpeaking();
    setIsSpeaking(false);
    if (displayText !== '__SKIP_SILENT__') {
      setMessages(prev => [...prev, { type: 'user', text: displayText || text, id: Date.now() }]);
    }

    // Abort if the backend takes more than 25 seconds
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    try {
      const res = await fetch('/api/mentor/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          session_id: state.session_id,
          topic: (state.weakSpots && state.weakSpots.length > 0 && state.weakSpots[0]) || state.topic || 'Technical Principles',
          answer: text,
        })
      });
      clearTimeout(timeoutId);

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const isReveal = data.reveal_answer === true;
      const isDone = data.done === true;
      const allTopicsDone = data.all_topics_done === true;
      const modeUsed = data.mode_used || '';
      const advanceTopic = data.advance_topic === true;

      // Sync area metadata
      if (data.total_areas) setTotalAreas(data.total_areas);
      if (data.current_area) setCurrentArea(data.current_area);
      if (data.area_index !== undefined) setCurrentAreaIdx(data.area_index);

      // Scoring
      const pts = modeUsed === 'direct_answer' ? 15 : (data.attempt_count === 0 ? 20 : 10);
      setRewardTotal(r => r + pts);
      setMasteryPct(m => Math.min(95, m + (isReveal ? 22 : advanceTopic ? 18 : 10)));
      setHintCount(h => h + 1);
      setStratIdx(chatStep % STRATEGIES.length);
      setRewardLog(l => [...l, `+${pts} · ${modeUsed || 'reasoning step'}`]);
      setChatStep(s => s + 1);
      setIsWaiting(false);

      // ── All topics done → show closing message + start END idle timer ───────
      if (allTopicsDone || isDone) {
        allTopicsDoneRef.current = true;
        addAiMsg(data.question, null);
        if (isReveal && data.answer_text) {
          setTimeout(() => {
            setMessages(prev => [...prev, { type: 'reveal', text: data.answer_text, id: Date.now() + 1 }]);
            chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
          }, 2500);
        }
        // Start the END-OF-SESSION idle timer (closes session after 12s)
        const timeoutSecs = data.idle_timeout_seconds || 12;
        setTimeout(() => startEndIdleCountdown(timeoutSecs), 2000);
        return;
      }

      // ── Show topic-transition banner when moving to next area ───────────────
      if (advanceTopic && data.next_area) {
        setTimeout(() => {
          setMessages(prev => [...prev, {
            type: 'topic_transition',
            text: data.next_area,
            id: Date.now() + 2,
          }]);
          chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 600);
      }

      // ── Normal: show mentor message ─────────────────────────────────────────
      addAiMsg(data.question, voice.speak);

      // ── Show reveal card if this area's answer was just revealed ───────────
      if (isReveal && data.answer_text) {
        setTimeout(() => {
          setMessages(prev => [...prev, { type: 'reveal', text: data.answer_text, id: Date.now() + 1 }]);
          chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 2500);
      }

      // No mid-session idle restart here — removed to fix the 12s loop bug.

    } catch (e) {
      clearTimeout(timeoutId);
      console.error('[SocraticMentor] API error:', e);
      setIsWaiting(false);
      // Instead of a dead-end error message, give a local Socratic follow-up
      // so the conversation can continue even when the backend is unreachable.
      const localFollowUps = [
        `That's a good start. Let me push you a bit further — can you explain *why* that's the case? What's the underlying mechanism?`,
        `Interesting. Now think about this: what would happen if that assumption were wrong? What would break first?`,
        `Good thinking. Can you give me a real-world example where that concept makes a concrete difference?`,
        `You're on the right track. What are the trade-offs of the approach you just described? When would you *not* use it?`,
        `Let's go deeper. How would you explain this to someone who has never heard of ${currentArea || firstTopic} before?`,
      ];
      const localReply = localFollowUps[chatStep % localFollowUps.length];
      addAiMsg(localReply, voice.speak);
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // ── Send chat (type or voice) ─────────────────────────────────────────────
  const sendChat = async () => {
    const text = inputText.trim();
    if (!text || isSpeaking || isWaiting || exiting || showCompletedModal) return;
    setInputText('');
    resetIdleTimers();
    await _submitToMentor(text, text);
  };

  // ── Skip: force reveal of current area, move to next ─────────────────────
  const skipQuestion = async () => {
    if (isWaiting || exiting || showCompletedModal) return;
    voice.stopSpeaking();
    setIsSpeaking(false);
    setInputText('');
    setMessages(prev => [...prev, { type: 'user', text: '⏭ Skipped — show me the answer', id: Date.now() }]);
    await _submitToMentor('[SKIP] Moving to next question.', '__SKIP_SILENT__');
  };

  // ── Voice toggle ──────────────────────────────────────────────────────────
  const toggleSocMic = () => {
    if (listening) {
      voice.stopListening();
      setListening(false);
      return;
    }
    if (isSpeaking) { voice.stopSpeaking(); setIsSpeaking(false); }
    // FIX 1: Always clear the input box before starting a new mic session
    // so previous transcription doesn't bleed into the next recording.
    setInputText('');
    const ok = voice.startListening(
      (text) => setInputText(text),
      (finalText) => { setInputText(finalText); setListening(false); },
      () => setListening(false)
    );
    if (ok) setListening(true);
  };

  // ── Area progress bar ─────────────────────────────────────────────────────
  // FIX: use (currentAreaIdx + 1) so that when area 0 is active the bar shows
  // 1/N not 0/N, and when the last area is done the bar reaches 100%.
  const areaPct = totalAreas > 0 ? Math.round(((currentAreaIdx + 1) / totalAreas) * 100) : 0;

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

      {/* ── Completed modal ── */}
      {showCompletedModal && (
        <InterviewCompletedModal onViewReport={() => {
          setShowCompletedModal(false);
          exitToReport();
        }} />
      )}

      {/* ── Chat column ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>

        {/* Chat header */}
        <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg1)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg,var(--accent),var(--teal))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>🦉</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>SocraticMind</span>
              {currentArea && (
                <span className="mono" style={{ fontSize: 9, color: 'var(--amber)', background: 'rgba(240,180,41,.1)', border: '1px solid rgba(240,180,41,.2)', borderRadius: 100, padding: '2px 8px' }}>
                  Focus: {currentArea}
                </span>
              )}
            </div>
            {/* Topic progress bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
              <div style={{ flex: 1, height: 3, background: 'var(--bg4)', borderRadius: 100, overflow: 'hidden', maxWidth: 180 }}>
                <div style={{ height: '100%', borderRadius: 100, background: 'linear-gradient(90deg,var(--accent),var(--teal))', width: areaPct + '%', transition: 'width .8s ease' }} />
              </div>
              <span className="mono" style={{ fontSize: 9, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                Area {Math.min(currentAreaIdx + 1, totalAreas)}/{totalAreas}
              </span>
            </div>
          </div>

          {/* End-of-session idle badge — shows when all topics are done */}
          {endIdleCountdown !== null && (
            <div style={{ padding: '4px 10px', borderRadius: 100, background: 'rgba(255,77,109,.12)', border: '1px solid rgba(255,77,109,.3)', fontSize: 10, fontFamily: "'DM Mono',monospace", color: 'var(--red)', animation: 'glow 1s infinite', flexShrink: 0 }}>
              Auto-close in {endIdleCountdown}s
            </div>
          )}

          <button
            onClick={exitToReport}
            disabled={exiting}
            style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border3)', background: exiting ? 'var(--bg3)' : 'var(--bg2)', color: exiting ? 'var(--muted)' : 'var(--text2)', fontSize: 11, cursor: exiting ? 'default' : 'pointer', fontFamily: "'DM Mono',monospace", display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, transition: 'all .2s' }}>
            {exiting ? (
              <><div style={{ width: 9, height: 9, border: '1.5px solid var(--accent)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'rotate .7s linear infinite' }} />Generating report…</>
            ) : 'Finish → Report'}
          </button>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {messages.map(m => {

            // ── Topic transition banner ───────────────────────────────────────
            if (m.type === 'topic_transition') {
              return (
                <div key={m.id} style={{ alignSelf: 'center', animation: 'fadeUp .4s ease', width: '100%', maxWidth: 420 }}>
                  <div style={{ padding: '10px 16px', borderRadius: 10, background: 'rgba(109,90,255,.1)', border: '1px solid rgba(109,90,255,.28)', textAlign: 'center' }}>
                    <span className="mono" style={{ fontSize: 9, color: 'var(--accent2)', letterSpacing: 1, textTransform: 'uppercase' }}>
                      ✓ Topic covered · Moving to: <strong>{m.text}</strong>
                    </span>
                  </div>
                </div>
              );
            }

            // ── Revealed answer card ──────────────────────────────────────────
            if (m.type === 'reveal') {
              return (
                <div key={m.id} style={{ alignSelf: 'flex-start', maxWidth: '90%', animation: 'fadeUp .4s ease' }}>
                  <div style={{ padding: '14px 18px', borderRadius: 12, background: 'rgba(0,229,160,.07)', border: '2px solid rgba(0,229,160,.3)', borderLeft: '4px solid var(--green)' }}>
                    <div className="mono" style={{ fontSize: 9, color: 'var(--green)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>
                      ✅ REVEALED ANSWER
                    </div>
                    <div style={{ fontSize: 13, lineHeight: 1.8, color: 'var(--text)' }}>
                      {m.text.split('\n').map((l, i) => <span key={i}>{l}{i < m.text.split('\n').length - 1 ? <br /> : null}</span>)}
                    </div>
                  </div>
                </div>
              );
            }

            // ── Regular ai / user bubbles ─────────────────────────────────────
            return (
              <div key={m.id} style={{ display: 'flex', gap: 9, maxWidth: '84%', alignSelf: m.type === 'user' ? 'flex-end' : 'flex-start', flexDirection: m.type === 'user' ? 'row-reverse' : 'row', animation: 'fadeUp .3s ease' }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, background: m.type === 'ai' ? 'linear-gradient(135deg,var(--accent),var(--teal))' : 'var(--bg4)', border: m.type === 'user' ? '1px solid var(--border3)' : 'none' }}>
                  {m.type === 'ai' ? '🦉' : 'U'}
                </div>
                <div style={{ padding: '12px 16px', borderRadius: 12, fontSize: 13, lineHeight: 1.7, background: m.type === 'ai' ? 'var(--bg2)' : 'rgba(109,90,255,.14)', border: m.type === 'ai' ? '1px solid var(--border2)' : '1px solid rgba(109,90,255,.22)', borderTopLeftRadius: m.type === 'ai' ? 3 : 12, borderTopRightRadius: m.type === 'user' ? 3 : 12, color: m.type === 'user' ? 'var(--accent2)' : 'var(--text)', maxWidth: 440 }}>
                  {m.text === '...'
                    ? <div style={{ display: 'flex', gap: 4 }}>{[0, .2, .4].map(d => <div key={d} style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--muted)', animation: `bounce3 1.2s ease-in-out ${d}s infinite` }} />)}</div>
                    : m.text.split('\n').map((l, i) => <span key={i}>{l}{i < m.text.split('\n').length - 1 ? <br /> : null}</span>)
                  }
                </div>
              </div>
            );
          })}
          <div ref={chatEndRef} />
        </div>

        {/* Input bar */}
        <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border)', background: 'var(--bg1)' }}>
          {isSpeaking && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, padding: '5px 11px', borderRadius: 8, background: 'rgba(0,212,180,.07)', border: '1px solid rgba(0,212,180,.2)' }}>
              <Waveform active={true} color="var(--teal)" />
              <span className="mono" style={{ fontSize: 10, color: 'var(--teal)' }}>Mentor speaking…</span>
              <button onClick={skipQuestion} style={{ marginLeft: 'auto', padding: '2px 9px', borderRadius: 5, border: '1px solid rgba(0,212,180,.3)', background: 'transparent', color: 'var(--teal)', fontSize: 10, cursor: 'pointer', fontFamily: "'DM Mono',monospace" }}>Skip ⏭</button>
            </div>
          )}
          {isWaiting && !isSpeaking && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, padding: '5px 11px', borderRadius: 8, background: 'rgba(109,90,255,.06)', border: '1px solid rgba(109,90,255,.15)' }}>
              <div style={{ width: 10, height: 10, border: '2px solid rgba(109,90,255,.3)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'rotate .7s linear infinite' }} />
              <span className="mono" style={{ fontSize: 10, color: 'var(--accent2)' }}>Mentor thinking…</span>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            {/* Mic button */}
            <button onClick={toggleSocMic} disabled={exiting || isWaiting || showCompletedModal}
              title="Toggle microphone"
              style={{ width: 40, height: 40, borderRadius: '50%', border: `1.5px solid ${listening ? 'var(--red)' : 'var(--border3)'}`, background: listening ? 'var(--red2)' : 'var(--bg3)', cursor: (exiting || isWaiting || showCompletedModal) ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0, animation: listening ? 'pulseRed 1.2s infinite' : 'none', transition: 'all .2s', opacity: (exiting || isWaiting || showCompletedModal) ? 0.4 : 1 }}>
              🎤
            </button>
            {/* Textarea */}
            <textarea
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (!isSpeaking && !isWaiting && !exiting && !showCompletedModal) sendChat();
                }
              }}
              placeholder={
                showCompletedModal ? 'Session complete — see the popup above' :
                  exiting ? 'Generating report…' :
                    isSpeaking ? 'Mentor is speaking… (press Skip ⏭ to skip)' :
                      isWaiting ? 'Waiting for mentor…' :
                        'Answer, ask a question, or type anything… (Enter to send)'
              }
              rows={1}
              disabled={isSpeaking || isWaiting || exiting || showCompletedModal}
              style={{ flex: 1, padding: '10px 13px', resize: 'none', minHeight: 42, lineHeight: 1.5, opacity: (isSpeaking || isWaiting || exiting || showCompletedModal) ? 0.45 : 1, cursor: (isSpeaking || isWaiting || showCompletedModal) ? 'not-allowed' : 'text' }}
            />
            {/* Skip button */}
            <button onClick={skipQuestion} disabled={isWaiting || exiting || showCompletedModal}
              title="Skip this topic — reveal answer and move on"
              style={{ width: 40, height: 40, borderRadius: 9, border: '1px solid var(--border3)', background: (isWaiting || exiting || showCompletedModal) ? 'var(--bg4)' : 'var(--bg3)', color: (isWaiting || exiting || showCompletedModal) ? 'var(--muted)' : 'var(--text2)', cursor: (isWaiting || exiting || showCompletedModal) ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0, transition: 'all .2s' }}>
              ⏭
            </button>
            {/* Send button */}
            <button onClick={sendChat} disabled={isSpeaking || isWaiting || exiting || showCompletedModal}
              style={{ width: 40, height: 40, borderRadius: 9, border: 'none', background: (isSpeaking || isWaiting || exiting || showCompletedModal) ? 'var(--bg4)' : 'var(--accent)', color: (isSpeaking || isWaiting || exiting || showCompletedModal) ? 'var(--muted)' : '#fff', cursor: (isSpeaking || isWaiting || exiting || showCompletedModal) ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
              ↑
            </button>
          </div>
        </div>
      </div>

      {/* ── Right sidebar ── */}
      <div style={{ width: 260, borderLeft: '1px solid var(--border)', background: 'var(--bg1)', padding: 20, display: 'flex', flexDirection: 'column', gap: 18, overflowY: 'auto' }}>
        {mediaStream && (
          <>
            <div>
              <div className="mono" style={{ fontSize: 9, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>YOU</div>
              <CameraTile stream={mediaStream} label="Live" size="sm" videoRef={videoRef} />
            </div>
            <div style={{ height: 1, background: 'var(--border)' }} />
          </>
        )}

        {/* Weak areas progress */}
        <div>
          <div className="mono" style={{ fontSize: 9, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>🎯 WEAK AREAS</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {(state.weakSpots?.length ? state.weakSpots : ['Pending analysis']).map((area, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 8, background: i === currentAreaIdx ? 'rgba(109,90,255,.12)' : 'var(--bg3)', border: `1px solid ${i === currentAreaIdx ? 'rgba(109,90,255,.28)' : 'var(--border)'}`, transition: 'all .3s' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: i < currentAreaIdx ? 'var(--green)' : i === currentAreaIdx ? 'var(--accent)' : 'var(--muted)', boxShadow: i === currentAreaIdx ? '0 0 6px var(--accent)' : 'none' }} />
                <span style={{ fontSize: 11, color: i === currentAreaIdx ? 'var(--text)' : 'var(--text2)', fontWeight: i === currentAreaIdx ? 600 : 400 }}>{area}</span>
                {i < currentAreaIdx && <span style={{ marginLeft: 'auto', fontSize: 10 }}>✓</span>}
                {i === currentAreaIdx && <span className="mono" style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--accent2)' }}>active</span>}
              </div>
            ))}
          </div>
        </div>

        <div style={{ height: 1, background: 'var(--border)' }} />

        {/* Teaching signal */}
        <div>
          <div className="mono" style={{ fontSize: 9, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>📡 TEACHING SIGNAL</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[['Rewards', '+' + rewardTotal, 'var(--green)'], ['Strategy', STRATEGIES[stratIdx], 'var(--teal)']].map(([l, v, c]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 11px', borderRadius: 8, background: 'var(--bg3)', fontSize: 11 }}>
                <span style={{ color: 'var(--text2)' }}>{l}</span>
                <span className="mono" style={{ fontSize: 10, color: c }}>{v}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 8, padding: '8px 11px', borderRadius: 8, background: 'var(--teal2)', border: '1px solid rgba(0,212,180,.15)', fontSize: 11, fontFamily: "'DM Mono',monospace", color: 'var(--teal)', lineHeight: 1.5 }}>
            {STRAT_REASONS[stratIdx]}
          </div>
        </div>

        <div style={{ height: 1, background: 'var(--border)' }} />

        {/* Mastery */}
        <div>
          <div className="mono" style={{ fontSize: 9, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>🏆 MASTERY</div>
          <div style={{ height: 6, borderRadius: 100, background: 'var(--bg4)', overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 100, background: 'linear-gradient(90deg,var(--accent),var(--teal))', width: masteryPct + '%', transition: 'width 1.2s cubic-bezier(.4,0,.2,1)' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            <span className="mono" style={{ fontSize: 9, color: 'var(--muted)' }}>0%</span>
            <span className="mono" style={{ fontSize: 9, color: 'var(--accent2)' }}>{masteryPct}%</span>
          </div>
        </div>

        <div style={{ height: 1, background: 'var(--border)' }} />

        {/* Reward log */}
        <div>
          <div className="mono" style={{ fontSize: 9, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>📊 REWARD LOG</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 110, overflowY: 'auto' }}>
            {rewardLog.length === 0
              ? <span className="mono" style={{ fontSize: 10, color: 'var(--muted)' }}>Waiting for responses…</span>
              : rewardLog.slice(-8).map((l, i) => <div key={i} className="mono" style={{ fontSize: 10, color: 'var(--green)', animation: 'fadeIn .3s ease' }}>{l}</div>)
            }
          </div>
        </div>

        {/* Finish button */}
        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button className="btn-primary" style={{ width: '100%', fontSize: 12 }} onClick={exitToReport} disabled={exiting}>
            {exiting ? (
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <div style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'rotate .7s linear infinite' }} />
                Generating Final Report…
              </span>
            ) : 'Finish & View Report →'}
          </button>
          <div className="mono" style={{ fontSize: 9, color: 'var(--muted)', textAlign: 'center', lineHeight: 1.5 }}>
            Session ends automatically after all areas are covered · or exit anytime
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// REPORT SCREEN  (Multi-Agent Edition)
// ─────────────────────────────────────────────
function ReportScreen({ state, socStats, onRestart }) {
  const { rewardTotal, masteryPct, hintCount, strategyUsed } = socStats;
  const [report, setReport] = useState(null);
  const [loadingReport, setLoadingReport] = useState(true);
  const [expandedQ, setExpandedQ] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');

  const barColor = v => v < 35 ? 'var(--red)' : v < 60 ? 'var(--amber)' : 'var(--green)';
  const correctnessColor = c => c === 'correct' ? 'var(--green)' : c === 'incorrect' ? 'var(--red)' : 'var(--amber)';
  const correctnessIcon = c => c === 'correct' ? '✓' : c === 'incorrect' ? '✗' : '▸';
  const fp = state.fp || {};

  const patDesc = {
    'overconfident': 'Confidence often exceeds accuracy. Verify intuitions before committing.',
    'balanced': 'Confidence aligns well with actual performance. Keep building on this.',
    'underconfident': 'You know more than you think — trust your reasoning more.',
    'Deep Thinker': 'Strong conceptual understanding. Sharpen technical precision and edge cases.',
    'logical': 'You reason methodically through cause and effect. Great foundation.',
    'intuitive': 'Strong pattern-matching. Verify intuitions with first principles.',
    'hybrid': 'You blend analytical and intuitive thinking — a powerful combination.',
    'rote': 'Answers rely on memorised facts. Push for mechanism and trade-off thinking.',
  };

  useEffect(() => {
    if (!state.session_id) {
      console.error('[ReportScreen] No session_id in state — cannot fetch report');
      setLoadingReport(false);
      return;
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout for report

    fetch(`/api/report/${state.session_id}`, { signal: controller.signal })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(d => {
        clearTimeout(timeoutId);
        if (d.error) throw new Error(d.error);
        setReport(d);
        setLoadingReport(false);
      })
      .catch(err => {
        clearTimeout(timeoutId);
        console.error('[ReportScreen] Report fetch failed:', err);
        setLoadingReport(false);
        // Set a minimal report so the page isn't blank
        setReport({
          cognitive_summary: 'Report generation encountered an issue. Your session data is still saved.',
          primary_strength: 'Session completed',
          top_gap: 'See per-question feedback below',
          overall_score: null,
          improvement_plan: ['Review your answers below', 'Focus on areas marked as incorrect or partial'],
          per_question_feedback: state.feedbackLog || [],
        });
      });
    return () => { clearTimeout(timeoutId); controller.abort(); };
  }, [state.session_id]);

  const feedbackItems = report?.per_question_feedback || state.feedbackLog || [];
  const overallScore = report?.overall_score ?? null;
  const rfp = report?.reasoning_fingerprint || {};

  const tabs = [
    { id: 'overview', label: '🧠 Overview' },
    { id: 'questions', label: `💬 Q&A (${feedbackItems.length})` },
    { id: 'plan', label: '🚀 Action Plan' },
    { id: 'socratic', label: '🦉 Socratic Report' },
  ];

  const Spinner = () => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text2)', fontSize: 13 }}>
      <div style={{ width: 14, height: 14, border: '2px solid var(--accent)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'rotate .8s linear infinite' }} />
      Generating AI analysis…
    </div>
  );

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '36px 44px' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
          <div>
            <div className="tag" style={{ background: 'var(--green2)', border: '1px solid rgba(0,229,160,.2)', color: 'var(--green)', marginBottom: 14 }}>✓ SESSION COMPLETE</div>
            <h1 className="syne" style={{ fontSize: 34, fontWeight: 800, letterSpacing: -1.5, marginBottom: 6 }}>Cognitive Report</h1>
            <p style={{ fontSize: 13, color: 'var(--text2)' }}>
              {state.topic} · {feedbackItems.length} questions answered · Violations: {state.violations || 0}
            </p>
          </div>
          {overallScore !== null && (
            <div style={{ textAlign: 'center', padding: '14px 22px', background: 'var(--bg2)', border: `2px solid ${barColor(overallScore)}`, borderRadius: 16, flexShrink: 0 }}>
              <div className="syne" style={{ fontSize: 40, fontWeight: 800, color: barColor(overallScore), letterSpacing: -2, lineHeight: 1 }}>{overallScore}</div>
              <div className="mono" style={{ fontSize: 9, color: 'var(--muted)', marginTop: 4 }}>OVERALL /100</div>
            </div>
          )}
        </div>

        {/* ── Tab Nav ── */}
        <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--border2)', marginBottom: 24 }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} style={{ padding: '10px 18px', fontSize: 12, fontWeight: 500, background: 'transparent', border: 'none', borderBottom: activeTab === t.id ? '2px solid var(--accent)' : '2px solid transparent', color: activeTab === t.id ? 'var(--text)' : 'var(--muted)', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", transition: 'all .2s', marginBottom: -1 }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ══════════ TAB: OVERVIEW ══════════ */}
        {activeTab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Cognitive Summary */}
            <div className="card" style={{ padding: 24, borderLeft: '3px solid var(--accent)' }}>
              <div className="mono" style={{ fontSize: 9, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>🧠 AI COGNITIVE SUMMARY (Agent 7)</div>
              {loadingReport ? <Spinner /> : (
                <>
                  <p style={{ fontSize: 14, lineHeight: 1.85, color: 'var(--text)', marginBottom: 16 }}>
                    {report?.cognitive_summary || 'Session analysis will appear here.'}
                  </p>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ padding: '8px 14px', borderRadius: 9, background: 'var(--green2)', border: '1px solid rgba(0,229,160,.2)', fontSize: 11 }}>
                      <div className="mono" style={{ fontSize: 9, color: 'var(--muted)', marginBottom: 3 }}>PRIMARY STRENGTH</div>
                      <div style={{ color: 'var(--green)', fontWeight: 600 }}>{report?.primary_strength || '—'}</div>
                    </div>
                    <div style={{ padding: '8px 14px', borderRadius: 9, background: 'var(--red2)', border: '1px solid rgba(255,77,109,.2)', fontSize: 11 }}>
                      <div className="mono" style={{ fontSize: 9, color: 'var(--muted)', marginBottom: 3 }}>TOP GAP</div>
                      <div style={{ color: 'var(--red)', fontWeight: 600 }}>{report?.top_gap || '—'}</div>
                    </div>
                    {report?.reasoning_fingerprint?.thinking_type && (
                      <div style={{ padding: '8px 14px', borderRadius: 9, background: 'var(--amber2)', border: '1px solid rgba(240,180,41,.2)', fontSize: 11 }}>
                        <div className="mono" style={{ fontSize: 9, color: 'var(--muted)', marginBottom: 3 }}>THINKING TYPE</div>
                        <div style={{ color: 'var(--amber)', fontWeight: 600 }}>{report.reasoning_fingerprint.thinking_type}</div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Cognitive Metrics + Pattern */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              {/* Live metrics from fingerprint */}
              <div className="card" style={{ padding: 22 }}>
                <div className="mono" style={{ fontSize: 9, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 16 }}>📊 COGNITIVE METRICS (Agents 3+4)</div>
                {[
                  ['Depth of Understanding', fp.depth],
                  ['Answer Accuracy', fp.acc],
                  ['Confidence Level', fp.conf],
                  ['Consistency', fp.cons],
                  ['Reasoning Originality', fp.orig],
                ].map(([label, val]) => (
                  <div key={label} style={{ marginBottom: 11 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                      <span style={{ color: 'var(--text2)' }}>{label}</span>
                      <span className="mono" style={{ color: barColor(val || 0) }}>{val || 0}%</span>
                    </div>
                    <div style={{ height: 4, borderRadius: 100, background: 'var(--bg4)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: (val || 0) + '%', background: barColor(val || 0), borderRadius: 100, transition: 'width 1.5s ease' }} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Pattern + strong/weak areas */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="card" style={{ padding: 20 }}>
                  <div className="mono" style={{ fontSize: 9, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>PATTERN DETECTED (Agent 4)</div>
                  <div className="syne" style={{ fontSize: 22, fontWeight: 800, color: 'var(--amber)', letterSpacing: -0.5, marginBottom: 6 }}>
                    {rfp.thinking_type || state.pattern || 'logical'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.65 }}>
                    {patDesc[rfp.thinking_type] || patDesc[state.pattern] || 'Keep developing your reasoning depth.'}
                  </div>
                </div>
                <div className="card" style={{ padding: 20 }}>
                  <div className="mono" style={{ fontSize: 9, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>🎯 WEAK AREAS</div>
                  {loadingReport ? <div className="mono" style={{ fontSize: 10, color: 'var(--muted)' }}>Loading…</div> : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {(report?.weak_areas || state.weakSpots || []).slice(0, 4).map((a, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 10px', borderRadius: 7, background: 'var(--red2)', border: '1px solid rgba(255,77,109,.12)' }}>
                          <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--red)', flexShrink: 0 }} />
                          <span style={{ fontSize: 11, color: 'var(--text2)' }}>{a}</span>
                        </div>
                      ))}
                      {(report?.strong_areas || []).slice(0, 2).map((a, i) => (
                        <div key={'s' + i} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 10px', borderRadius: 7, background: 'var(--green2)', border: '1px solid rgba(0,229,160,.12)' }}>
                          <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--green)', flexShrink: 0 }} />
                          <span style={{ fontSize: 11, color: 'var(--text2)' }}>{a}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* JD Coverage if available */}
            {state.jdTopics?.length > 0 && (
              <div className="card" style={{ padding: 22 }}>
                <div className="mono" style={{ fontSize: 9, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 14 }}>JD COVERAGE MAP (Agent 1)</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {state.jdTopics.map(t => (
                    <div key={t.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 8, background: 'var(--bg3)' }}>
                      <span style={{ fontSize: 12, color: 'var(--text)' }}>{t.name}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 54, height: 3, borderRadius: 100, background: 'var(--bg4)', overflow: 'hidden' }}>
                          <div style={{ height: '100%', borderRadius: 100, background: t.status === 'covered' ? 'var(--green)' : t.status === 'gap' ? 'var(--red)' : 'var(--muted)', width: t.status === 'covered' ? '80%' : t.status === 'gap' ? '25%' : '5%' }} />
                        </div>
                        <span className="mono" style={{ fontSize: 9, color: t.status === 'covered' ? 'var(--green)' : t.status === 'gap' ? 'var(--red)' : 'var(--muted)' }}>{t.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Performance trend */}
            {report?.performance && (
              <div className="card" style={{ padding: 22 }}>
                <div className="mono" style={{ fontSize: 9, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 14 }}>📈 PERFORMANCE TREND (Agent 5)</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
                  {[
                    ['Avg Score', (report.performance.avg * 10).toFixed(0) + '%', 'var(--accent2)'],
                    ['Peak Score', (report.performance.peak * 10) + '%', 'var(--green)'],
                    ['Low Score', (report.performance.low * 10) + '%', 'var(--red)'],
                    ['Trend', report.performance.trend, 'var(--teal)'],
                  ].map(([l, v, c]) => (
                    <div key={l} style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--bg3)', textAlign: 'center' }}>
                      <div className="mono" style={{ fontSize: 9, color: 'var(--muted)', marginBottom: 6 }}>{l.toUpperCase()}</div>
                      <div className="syne" style={{ fontSize: 18, fontWeight: 700, color: c }}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════ TAB: Q&A FEEDBACK ══════════ */}
        {activeTab === 'questions' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ padding: '11px 15px', borderRadius: 9, background: 'var(--accent3)', border: '1px solid rgba(109,90,255,.2)', fontSize: 12, color: 'var(--accent2)', marginBottom: 6 }}>
              💡 Feedback generated by Agent 3 (Evaluator). Click any question to expand strengths, weaknesses, and the specific gap.
            </div>
            {feedbackItems.length === 0
              ? <div style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', padding: 40 }}>No feedback data available.</div>
              : feedbackItems.map((item, i) => (
                <div key={i} style={{ borderRadius: 12, border: `1px solid ${correctnessColor(item.correctness)}28`, overflow: 'hidden', animation: `fadeUp .3s ease ${i * 0.04}s both` }}>
                  <div onClick={() => setExpandedQ(expandedQ === i ? null : i)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: 'var(--bg2)', cursor: 'pointer' }}>
                    <div style={{ width: 24, height: 24, borderRadius: '50%', background: `${correctnessColor(item.correctness)}22`, border: `1px solid ${correctnessColor(item.correctness)}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ fontSize: 11, color: correctnessColor(item.correctness) }}>{correctnessIcon(item.correctness)}</span>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div className="mono" style={{ fontSize: 9, color: 'var(--muted)', marginBottom: 2 }}>Q{i + 1} · score {item.score ?? '?'}/10</div>
                      <div style={{ fontSize: 12, color: 'var(--text2)' }}>{item.question?.slice(0, 88)}{(item.question?.length || 0) > 88 ? '…' : ''}</div>
                    </div>
                    {item.weak_area && (
                      <div className="tag" style={{ background: 'rgba(240,180,41,.08)', border: '1px solid rgba(240,180,41,.2)', color: 'var(--amber)', fontSize: 9, flexShrink: 0 }}>
                        {item.weak_area}
                      </div>
                    )}
                    <span style={{ fontSize: 11, color: 'var(--muted)', flexShrink: 0 }}>{expandedQ === i ? '▲' : '▼'}</span>
                  </div>
                  {expandedQ === i && (
                    <div style={{ padding: '16px', background: 'var(--bg3)', borderTop: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>{item.question}</div>

                      {/* ── Your Response ── */}
                      {item.answer && (
                        <div style={{ marginBottom: 12 }}>
                          <div className="mono" style={{ fontSize: 9, color: 'var(--accent2)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 5 }}>
                            👤 YOUR RESPONSE
                          </div>
                          <div style={{ fontSize: 12, lineHeight: 1.75, color: 'var(--text2)', padding: '10px 14px', borderRadius: 8, background: 'rgba(109,90,255,.07)', border: '1px solid rgba(109,90,255,.18)', borderLeft: `3px solid rgba(109,90,255,.5)` }}>
                            {item.answer}
                          </div>
                        </div>
                      )}

                      {/* ── AI Feedback ── */}
                      <div style={{ marginBottom: 12 }}>
                        <div className="mono" style={{ fontSize: 9, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 5 }}>
                          🧠 EVALUATOR FEEDBACK
                        </div>
                        <div style={{ fontSize: 13, lineHeight: 1.75, color: 'var(--text2)', padding: '10px 14px', borderRadius: 8, background: 'var(--bg2)', borderLeft: `3px solid ${correctnessColor(item.correctness)}` }}>
                          {item.feedback || 'No detailed feedback available.'}
                        </div>
                      </div>

                      {/* ── Answer you should frame ── */}
                      {item.ideal_answer && (
                        <div style={{ marginBottom: 12 }}>
                          <div className="mono" style={{ fontSize: 9, color: 'var(--green)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 5 }}>
                            ✅ ANSWER YOU SHOULD FRAME
                          </div>
                          <div style={{ fontSize: 12, lineHeight: 1.8, color: 'var(--text)', padding: '12px 14px', borderRadius: 8, background: 'rgba(0,229,160,.06)', border: '1px solid rgba(0,229,160,.22)', borderLeft: '3px solid var(--green)' }}>
                            {item.ideal_answer}
                          </div>
                        </div>
                      )}

                      {/* ── Strengths / Weaknesses tags ── */}
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {(item.strengths || []).map((s, j) => (
                          <div key={j} className="tag" style={{ background: 'var(--green2)', border: '1px solid rgba(0,229,160,.2)', color: 'var(--green)', fontSize: 9 }}>✓ {s}</div>
                        ))}
                        {(item.weaknesses || []).map((w, j) => (
                          <div key={j} className="tag" style={{ background: 'var(--red2)', border: '1px solid rgba(255,77,109,.2)', color: 'var(--red)', fontSize: 9 }}>✗ {w}</div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))
            }
          </div>
        )}

        {/* ══════════ TAB: ACTION PLAN ══════════ */}
        {activeTab === 'plan' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Communication feedback */}
            {report?.communication_feedback && (
              <div className="card" style={{ padding: 22, borderLeft: '3px solid var(--teal)' }}>
                <div className="mono" style={{ fontSize: 9, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>🗣 COMMUNICATION ASSESSMENT</div>
                <p style={{ fontSize: 13, lineHeight: 1.75, color: 'var(--text2)' }}>{report.communication_feedback}</p>
              </div>
            )}
            {/* Concept gaps */}
            {(report?.concept_gaps?.length > 0) && (
              <div className="card" style={{ padding: 22 }}>
                <div className="mono" style={{ fontSize: 9, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 14 }}>🔍 CONCEPT GAPS DETECTED</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                  {report.concept_gaps.map((g, i) => (
                    <div key={i} className="tag" style={{ background: 'var(--red2)', border: '1px solid rgba(255,77,109,.2)', color: 'var(--red)', fontSize: 11, padding: '5px 12px' }}>{g}</div>
                  ))}
                </div>
              </div>
            )}
            {/* 5-step plan */}
            <div className="card" style={{ padding: 22, borderTop: '3px solid var(--accent)' }}>
              <div className="mono" style={{ fontSize: 9, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 16 }}>🚀 5-STEP IMPROVEMENT PLAN (Agent 7)</div>
              {loadingReport ? <Spinner /> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {(report?.improvement_plan || []).map((step, i) => (
                    <div key={i} style={{ display: 'flex', gap: 14, alignItems: 'flex-start', padding: '14px 16px', borderRadius: 10, background: 'var(--bg3)', border: '1px solid var(--border2)' }}>
                      <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--accent3)', border: '1px solid rgba(109,90,255,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'var(--accent2)', flexShrink: 0, fontFamily: "'DM Mono',monospace", fontWeight: 600 }}>{i + 1}</div>
                      <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.65 }}>{step}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {/* Areas of improvement */}
            <div className="card" style={{ padding: 22 }}>
              <div className="mono" style={{ fontSize: 9, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 14 }}>🎯 AREAS OF IMPROVEMENT</div>
              {loadingReport ? <Spinner /> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {(report?.areas_of_improvement || state.weakSpots || []).map((area, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, background: 'var(--red2)', border: '1px solid rgba(255,77,109,.12)' }}>
                      <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--red)', flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: 'var(--text2)' }}>{area}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══════════ TAB: SOCRATIC REPORT ══════════ */}
        {activeTab === 'socratic' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card" style={{ padding: 24, borderLeft: '3px solid var(--teal)' }}>
              <div className="mono" style={{ fontSize: 9, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 14 }}>🦉 SOCRATIC MENTOR ANALYSIS (Agent 6)</div>
              <p style={{ fontSize: 14, lineHeight: 1.8, color: 'var(--text)', marginBottom: 16 }}>
                {report?.socratic_summary || 'The Socratic mentor guided your reasoning through targeted counter-questions, probing your weak areas using the identified cognitive fingerprint.'}
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
                {[
                  ['Mastery', masteryPct + '%', 'var(--accent2)', 'var(--accent3)'],
                  ['Steps', hintCount + ' steps', 'var(--teal)', 'var(--teal2)'],
                  ['Rewards', '+' + rewardTotal, 'var(--green)', 'var(--green2)'],
                  ['Strategy', strategyUsed, 'var(--amber)', 'var(--amber2)'],
                ].map(([l, v, c, bg]) => (
                  <div key={l} style={{ padding: '12px 14px', borderRadius: 10, background: bg, border: `1px solid ${c}28`, textAlign: 'center' }}>
                    <div className="mono" style={{ fontSize: 9, color: 'var(--muted)', marginBottom: 6 }}>{l.toUpperCase()}</div>
                    <div className="syne" style={{ fontSize: 17, fontWeight: 700, color: c }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="card" style={{ padding: 22 }}>
              <div className="mono" style={{ fontSize: 9, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 14 }}>MASTERY PROGRESSION</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ flex: 1, height: 10, borderRadius: 100, background: 'var(--bg4)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 100, background: 'linear-gradient(90deg,var(--accent),var(--teal))', width: masteryPct + '%', transition: 'width 1.8s ease' }} />
                </div>
                <span className="mono" style={{ fontSize: 13, color: 'var(--accent2)', fontWeight: 500, flexShrink: 0 }}>{masteryPct}%</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 10, color: 'var(--muted)', fontFamily: "'DM Mono',monospace" }}>
                <span>Session Start</span>
                <span>{masteryPct >= 80 ? '✓ Conceptual Mastery' : masteryPct >= 50 ? '▸ Developing' : '○ Building'}</span>
                <span>100%</span>
              </div>
            </div>
            {/* Socratic session metadata */}
            {report?.socratic_session && (
              <div className="card" style={{ padding: 22 }}>
                <div className="mono" style={{ fontSize: 9, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>SESSION METADATA</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    ['Focus Area', report.socratic_session.focus || '—'],
                    ['Mentor Attempts', report.socratic_session.attempts],
                    ['Conversation Turns', report.socratic_session.conversation_length],
                    ['Learner Exchanges', report.socratic_session.exchanges],
                  ].map(([l, v]) => (
                    <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 11px', borderRadius: 7, background: 'var(--bg3)', fontSize: 12 }}>
                      <span style={{ color: 'var(--text2)' }}>{l}</span>
                      <span className="mono" style={{ color: 'var(--text)' }}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* Socratic next steps */}
            <div className="card" style={{ padding: 22, borderTop: '3px solid var(--green)' }}>
              <div className="mono" style={{ fontSize: 9, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 14 }}>NEXT STEPS FROM SOCRATIC SESSION</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(report?.areas_of_improvement || state.weakSpots || ['the identified weak area']).slice(0, 3).map((area, i) => (
                  <div key={i} style={{ padding: '11px 14px', borderRadius: 9, background: 'var(--bg3)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--accent3)', border: '1px solid rgba(109,90,255,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'var(--accent2)', flexShrink: 0 }}>{i + 1}</div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>{area}</div>
                      <div style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.5 }}>Practice by asking yourself WHY before HOW — the Socratic method works.</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Actions ── */}
        <div style={{ display: 'flex', gap: 10, marginTop: 32, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn-primary" onClick={onRestart}>Start New Interview →</button>
          <button className="btn-ghost" onClick={onRestart}>Change Topic</button>
          <button
            onClick={async () => {
              // ── jsPDF-based comprehensive PDF export ──────────────────────
              // Dynamically load jsPDF from CDN
              if (!window.jspdf) {
                await new Promise((resolve, reject) => {
                  const script = document.createElement('script');
                  script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
                  script.onload = resolve;
                  script.onerror = reject;
                  document.head.appendChild(script);
                });
              }

              const { jsPDF } = window.jspdf;
              const doc = new jsPDF({ unit: 'pt', format: 'a4' });
              const pageW = doc.internal.pageSize.getWidth();
              const pageH = doc.internal.pageSize.getHeight();
              const margin = 44;
              const contentW = pageW - margin * 2;
              let y = margin;

              // ── Helpers ──────────────────────────────────────────────────
              const checkPage = (needed = 30) => {
                if (y + needed > pageH - margin) {
                  doc.addPage();
                  y = margin;
                }
              };

              const drawRect = (x, ry, w, h, r, fillColor) => {
                doc.setFillColor(...fillColor);
                doc.roundedRect(x, ry, w, h, r, r, 'F');
              };

              const label = (text, x, ly, color = [136, 136, 136], size = 8) => {
                doc.setFontSize(size);
                doc.setTextColor(...color);
                doc.setFont('helvetica', 'bold');
                doc.text(text.toUpperCase(), x, ly);
              };

              const body = (text, x, by, color = [68, 68, 68], size = 11, style = 'normal', maxW = contentW) => {
                doc.setFontSize(size);
                doc.setTextColor(...color);
                doc.setFont('helvetica', style);
                const lines = doc.splitTextToSize(text || '—', maxW);
                doc.text(lines, x, by);
                return lines.length * (size * 1.45);
              };

              const sectionHeader = (text) => {
                checkPage(40);
                drawRect(margin, y, contentW, 26, 4, [245, 245, 255]);
                doc.setFontSize(11);
                doc.setTextColor(109, 90, 255);
                doc.setFont('helvetica', 'bold');
                doc.text(text, margin + 10, y + 17);
                y += 36;
              };

              const chip = (text, x, cy, bgColor, textColor, w = 0) => {
                const chipW = w || (doc.getStringUnitWidth(text) * 9 / doc.internal.scaleFactor + 16);
                drawRect(x, cy - 10, chipW, 16, 3, bgColor);
                doc.setFontSize(8.5);
                doc.setTextColor(...textColor);
                doc.setFont('helvetica', 'normal');
                doc.text(text, x + 8, cy + 1);
                return chipW + 6;
              };

              // ════════════════════════════════════════════
              // PAGE 1 — COVER
              // ════════════════════════════════════════════
              // Header bar
              drawRect(0, 0, pageW, 110, 0, [17, 17, 28]);
              doc.setFontSize(22);
              doc.setTextColor(255, 255, 255);
              doc.setFont('helvetica', 'bold');
              doc.text('SocraticMind', margin, 44);
              doc.setFontSize(10);
              doc.setTextColor(170, 160, 255);
              doc.setFont('helvetica', 'normal');
              doc.text('Cognitive Interview Report', margin, 62);

              // Score badge
              if (overallScore !== null) {
                const scoreColor = overallScore >= 60 ? [0, 185, 120] : overallScore >= 35 ? [240, 160, 40] : [220, 50, 70];
                drawRect(pageW - margin - 70, 18, 70, 70, 8, [30, 30, 45]);
                doc.setFontSize(30);
                doc.setTextColor(...scoreColor);
                doc.setFont('helvetica', 'bold');
                doc.text(String(overallScore), pageW - margin - 35, 58, { align: 'center' });
                doc.setFontSize(7.5);
                doc.setTextColor(170, 170, 170);
                doc.text('OVERALL /100', pageW - margin - 35, 72, { align: 'center' });
              }

              y = 130;

              // Meta row
              const metaItems = [
                ['Topic', state.topic || '—'],
                ['Questions', String(feedbackItems.length)],
                ['Date', new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })],
                ['Violations', String(state.violations || 0)],
              ];
              metaItems.forEach(([l, v], i) => {
                const x = margin + i * (contentW / 4);
                drawRect(x, y, contentW / 4 - 8, 46, 6, [245, 245, 255]);
                doc.setFontSize(7.5);
                doc.setTextColor(136, 136, 136);
                doc.setFont('helvetica', 'normal');
                doc.text(l.toUpperCase(), x + 10, y + 14);
                doc.setFontSize(11);
                doc.setTextColor(17, 17, 17);
                doc.setFont('helvetica', 'bold');
                doc.text(v, x + 10, y + 32);
              });
              y += 64;

              // ── Cognitive Summary ─────────────────────────────────────────
              sectionHeader('🧠  AI COGNITIVE SUMMARY  (Agent 7)');
              if (report?.cognitive_summary) {
                drawRect(margin, y, contentW, 2, 0, [109, 90, 255]);
                y += 10;
                const h = body(report.cognitive_summary, margin, y, [34, 34, 34], 11.5, 'normal', contentW);
                y += h + 16;
              }

              // Primary strength / top gap chips
              if (report?.primary_strength || report?.top_gap) {
                checkPage(50);
                let cx = margin;
                if (report.primary_strength) {
                  cx += chip('✓ ' + report.primary_strength, cx, y + 4, [220, 250, 237], [0, 140, 80]);
                }
                if (report.top_gap) {
                  chip('✗ ' + report.top_gap, cx, y + 4, [253, 235, 238], [200, 40, 60]);
                }
                y += 30;
              }

              // ── Reasoning Fingerprint ─────────────────────────────────────
              if (rfp.thinking_type || rfp.depth || rfp.confidence_bias) {
                checkPage(70);
                sectionHeader('🔬  REASONING FINGERPRINT  (Agent 4)');
                const fpItems = [
                  ['Depth', rfp.depth || '—'],
                  ['Thinking Type', rfp.thinking_type || '—'],
                  ['Confidence Bias', rfp.confidence_bias || '—'],
                ];
                fpItems.forEach(([l, v], i) => {
                  const x = margin + i * (contentW / 3);
                  drawRect(x, y, contentW / 3 - 10, 46, 6, [248, 246, 255]);
                  label(l, x + 10, y + 14);
                  body(v, x + 10, y + 30, [109, 90, 255], 11, 'bold', contentW / 3 - 20);
                });
                y += 60;
              }

              // ── Cognitive Metrics ─────────────────────────────────────────
              checkPage(110);
              sectionHeader('📊  COGNITIVE METRICS  (Agents 3 + 4)');
              const metrics = [
                ['Depth of Understanding', fp.depth || 0],
                ['Answer Accuracy', fp.acc || 0],
                ['Confidence Level', fp.conf || 0],
                ['Consistency', fp.cons || 0],
                ['Reasoning Originality', fp.orig || 0],
              ];
              metrics.forEach(([lbl, val]) => {
                checkPage(22);
                doc.setFontSize(10);
                doc.setTextColor(68, 68, 68);
                doc.setFont('helvetica', 'normal');
                doc.text(lbl, margin, y);
                doc.setFontSize(9);
                doc.setTextColor(val >= 60 ? 0 : val >= 35 ? 180 : 200, val >= 60 ? 185 : val >= 35 ? 120 : 50, val >= 60 ? 120 : val >= 35 ? 40 : 60);
                doc.text(val + '%', pageW - margin, y, { align: 'right' });
                // Bar track
                drawRect(margin, y + 4, contentW, 5, 2, [230, 230, 240]);
                // Bar fill
                const barW = (val / 100) * contentW;
                const barColor2 = val >= 60 ? [0, 185, 120] : val >= 35 ? [240, 160, 40] : [220, 50, 70];
                if (barW > 0) drawRect(margin, y + 4, barW, 5, 2, barColor2);
                y += 22;
              });
              y += 8;

              // ── Strong & Weak Areas ───────────────────────────────────────
              if ((report?.strong_areas?.length || 0) + (report?.weak_areas?.length || 0) > 0) {
                checkPage(60);
                sectionHeader('🎯  STRONG & WEAK AREAS');
                (report?.strong_areas || []).forEach(a => {
                  checkPage(20);
                  drawRect(margin, y - 11, contentW, 17, 3, [220, 250, 237]);
                  doc.setFontSize(9.5);
                  doc.setTextColor(0, 130, 70);
                  doc.setFont('helvetica', 'normal');
                  doc.text('✓  ' + a, margin + 8, y);
                  y += 22;
                });
                (report?.weak_areas || []).forEach(a => {
                  checkPage(20);
                  drawRect(margin, y - 11, contentW, 17, 3, [253, 235, 238]);
                  doc.setFontSize(9.5);
                  doc.setTextColor(200, 40, 60);
                  doc.setFont('helvetica', 'normal');
                  doc.text('✗  ' + a, margin + 8, y);
                  y += 22;
                });
                y += 8;
              }

              // ── Performance Trend ─────────────────────────────────────────
              if (report?.performance) {
                checkPage(70);
                sectionHeader('📈  PERFORMANCE TREND  (Agent 5)');
                const perfItems = [
                  ['Avg Score', (report.performance.avg * 10).toFixed(0) + '%'],
                  ['Peak Score', (report.performance.peak * 10) + '%'],
                  ['Low Score', (report.performance.low * 10) + '%'],
                  ['Trend', report.performance.trend || '—'],
                ];
                perfItems.forEach(([l, v], i) => {
                  const x = margin + i * (contentW / 4);
                  drawRect(x, y, contentW / 4 - 8, 46, 6, [248, 248, 255]);
                  label(l, x + 10, y + 14);
                  body(v, x + 10, y + 32, [109, 90, 255], 12, 'bold', contentW / 4 - 14);
                });
                y += 60;
              }

              // ════════════════════════════════════════════
              // Q&A FEEDBACK SECTION
              // ════════════════════════════════════════════
              if (feedbackItems.length > 0) {
                doc.addPage();
                y = margin;
                sectionHeader(`💬  Q&A FEEDBACK  (${feedbackItems.length} questions)`);

                feedbackItems.forEach((item, i) => {
                  checkPage(90);
                  const correctColor = item.correctness === 'correct' ? [0, 160, 107] : item.correctness === 'incorrect' ? [200, 40, 60] : [200, 130, 20];
                  const correctBg = item.correctness === 'correct' ? [220, 250, 237] : item.correctness === 'incorrect' ? [253, 235, 238] : [254, 247, 224];

                  // Q header row
                  drawRect(margin, y, contentW, 28, 5, correctBg);
                  doc.setFontSize(8);
                  doc.setTextColor(...correctColor);
                  doc.setFont('helvetica', 'bold');
                  doc.text(`Q${i + 1}  ·  Score: ${item.score ?? '?'}/10  ·  ${(item.correctness || '').toUpperCase()}`, margin + 10, y + 11);
                  if (item.weak_area) {
                    const waW = doc.getStringUnitWidth(item.weak_area) * 8 / doc.internal.scaleFactor + 14;
                    drawRect(pageW - margin - waW - 4, y + 5, waW, 16, 3, [254, 247, 224]);
                    doc.setFontSize(7.5);
                    doc.setTextColor(180, 100, 10);
                    doc.text(item.weak_area, pageW - margin - waW, y + 15);
                  }
                  y += 36;

                  // Question text
                  checkPage(30);
                  label('QUESTION', margin, y);
                  y += 12;
                  const qh = body(item.question || '', margin, y, [34, 34, 34], 10.5, 'normal', contentW);
                  y += qh + 8;

                  // Answer
                  if (item.answer) {
                    checkPage(40);
                    drawRect(margin, y - 2, contentW, 14, 3, [240, 238, 255]);
                    label('YOUR RESPONSE', margin + 6, y + 8, [109, 90, 255]);
                    y += 20;
                    const ah = body(item.answer, margin + 6, y, [68, 68, 68], 10, 'normal', contentW - 12);
                    y += ah + 8;
                  }

                  // Feedback
                  if (item.feedback) {
                    checkPage(40);
                    label('EVALUATOR FEEDBACK', margin, y, [136, 136, 136]);
                    y += 12;
                    drawRect(margin, y - 2, 3, 0, 0, correctColor); // left border trick
                    const fh = body(item.feedback, margin + 8, y, [68, 68, 68], 10, 'normal', contentW - 8);
                    y += fh + 8;
                  }

                  // Ideal answer
                  if (item.ideal_answer) {
                    checkPage(50);
                    drawRect(margin, y - 2, contentW, 14, 3, [220, 250, 237]);
                    label('IDEAL ANSWER', margin + 6, y + 8, [0, 140, 80]);
                    y += 20;
                    const ih = body(item.ideal_answer, margin + 6, y, [34, 80, 50], 10, 'normal', contentW - 12);
                    y += ih + 14;
                  }

                  // Strengths / Weaknesses chips
                  if ((item.strengths?.length || item.weaknesses?.length)) {
                    checkPage(30);
                    let cx = margin;
                    (item.strengths || []).forEach(s => {
                      const w = chip('✓ ' + s, cx, y + 4, [220, 250, 237], [0, 130, 70]);
                      cx += w;
                    });
                    (item.weaknesses || []).forEach(w2 => {
                      const w = chip('✗ ' + w2, cx, y + 4, [253, 235, 238], [180, 40, 60]);
                      cx += w;
                    });
                    y += 26;
                  }

                  y += 10; // gap between questions
                });
              }

              // ════════════════════════════════════════════
              // ACTION PLAN
              // ════════════════════════════════════════════
              doc.addPage();
              y = margin;
              sectionHeader('🚀  5-STEP IMPROVEMENT PLAN  (Agent 7)');
              (report?.improvement_plan || []).forEach((step, i) => {
                checkPage(50);
                drawRect(margin, y, contentW, 38, 6, [248, 246, 255]);
                // Step number circle
                drawRect(margin + 10, y + 9, 20, 20, 10, [109, 90, 255]);
                doc.setFontSize(10);
                doc.setTextColor(255, 255, 255);
                doc.setFont('helvetica', 'bold');
                doc.text(String(i + 1), margin + 20, y + 22, { align: 'center' });
                // Step text
                const sh = body(step, margin + 38, y + 14, [34, 34, 34], 10.5, 'normal', contentW - 48);
                y += Math.max(48, sh + 24);
              });
              y += 8;

              // Communication feedback
              if (report?.communication_feedback) {
                checkPage(60);
                sectionHeader('🗣  COMMUNICATION ASSESSMENT');
                const ch2 = body(report.communication_feedback, margin, y, [68, 68, 68], 11, 'normal', contentW);
                y += ch2 + 16;
              }

              // Concept gaps
              if (report?.concept_gaps?.length > 0) {
                checkPage(50);
                sectionHeader('🔍  CONCEPT GAPS DETECTED');
                let cx = margin;
                report.concept_gaps.forEach(g => {
                  if (cx + 120 > pageW - margin) { cx = margin; y += 22; }
                  const w = chip(g, cx, y + 4, [253, 235, 238], [180, 40, 60]);
                  cx += w;
                });
                y += 28;
              }

              // Areas of improvement
              if (report?.areas_of_improvement?.length > 0) {
                checkPage(60);
                sectionHeader('🎯  AREAS OF IMPROVEMENT');
                (report.areas_of_improvement || []).forEach(area => {
                  checkPage(20);
                  drawRect(margin, y - 11, contentW, 17, 3, [253, 235, 238]);
                  doc.setFontSize(9.5);
                  doc.setTextColor(180, 40, 60);
                  doc.setFont('helvetica', 'normal');
                  doc.text('▸  ' + area, margin + 8, y);
                  y += 22;
                });
                y += 8;
              }

              // ════════════════════════════════════════════
              // SOCRATIC REPORT
              // ════════════════════════════════════════════
              doc.addPage();
              y = margin;
              sectionHeader('🦉  SOCRATIC MENTOR ANALYSIS  (Agent 6)');
              if (report?.socratic_summary) {
                const ssh = body(report.socratic_summary, margin, y, [34, 34, 34], 11.5, 'normal', contentW);
                y += ssh + 18;
              }

              // Socratic stats grid
              const socItems = [
                ['Mastery', masteryPct + '%'],
                ['Steps', hintCount + ' steps'],
                ['Rewards', '+' + rewardTotal],
                ['Strategy', strategyUsed || '—'],
              ];
              socItems.forEach(([l, v], i) => {
                const x = margin + i * (contentW / 4);
                drawRect(x, y, contentW / 4 - 8, 46, 6, [248, 248, 255]);
                label(l, x + 10, y + 14);
                body(v, x + 10, y + 32, [109, 90, 255], 12, 'bold', contentW / 4 - 14);
              });
              y += 60;

              // Mastery bar
              checkPage(40);
              label('MASTERY PROGRESSION', margin, y, [136, 136, 136]);
              y += 14;
              drawRect(margin, y, contentW, 12, 4, [230, 230, 240]);
              drawRect(margin, y, (masteryPct / 100) * contentW, 12, 4, [109, 90, 255]);
              doc.setFontSize(8);
              doc.setTextColor(255, 255, 255);
              doc.text(masteryPct + '%', margin + (masteryPct / 100) * contentW - 24, y + 8);
              y += 24;

              // Socratic session metadata
              if (report?.socratic_session) {
                checkPage(80);
                sectionHeader('SESSION METADATA');
                const smItems = [
                  ['Focus Area', report.socratic_session.focus || '—'],
                  ['Mentor Attempts', String(report.socratic_session.attempts)],
                  ['Conversation Turns', String(report.socratic_session.conversation_length)],
                  ['Learner Exchanges', String(report.socratic_session.exchanges)],
                ];
                smItems.forEach(([l, v]) => {
                  checkPage(22);
                  drawRect(margin, y - 11, contentW, 17, 3, [245, 245, 250]);
                  doc.setFontSize(9.5);
                  doc.setTextColor(68, 68, 68);
                  doc.setFont('helvetica', 'normal');
                  doc.text(l, margin + 8, y);
                  doc.setFont('helvetica', 'bold');
                  doc.setTextColor(17, 17, 17);
                  doc.text(v, pageW - margin - 8, y, { align: 'right' });
                  y += 22;
                });
              }

              // ── Footer on every page ──────────────────────────────────────
              const totalPages = doc.internal.getNumberOfPages();
              for (let p = 1; p <= totalPages; p++) {
                doc.setPage(p);
                doc.setFontSize(7.5);
                doc.setTextColor(180, 180, 180);
                doc.setFont('helvetica', 'normal');
                doc.text('SocraticMind · Cognitive Interview Report · Generated ' + new Date().toLocaleString(), margin, pageH - 18);
                doc.text(`Page ${p} of ${totalPages}`, pageW - margin, pageH - 18, { align: 'right' });
              }

              const filename = `SocraticMind_Report_${(state.topic || 'Interview').replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`;
              doc.save(filename);
            }}
            style={{
              marginLeft: 'auto',
              padding: '10px 20px', borderRadius: 10,
              border: '1.5px solid var(--border3)',
              background: 'var(--bg2)', color: 'var(--text2)',
              fontSize: 12, cursor: 'pointer',
              fontFamily: "'DM Sans',sans-serif",
              display: 'flex', alignItems: 'center', gap: 8,
              transition: 'all .2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg3)'; e.currentTarget.style.color = 'var(--text)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg2)'; e.currentTarget.style.color = 'var(--text2)'; }}
          >
            <span style={{ fontSize: 15 }}>📄</span> Export Report as PDF
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────
const INITIAL_STATE = {
  screen: 'preflight',
  phase: 0,
  topic: null,
  questionIndex: 0,
  fp: { depth: 0, acc: 0, conf: 0, cons: 0, orig: 0 },
  pattern: '',
  weakSpots: [],
  jdTopics: [],
  violations: 0,
  mpWarnings: 0,
  feedbackLog: [],
};

export default function App() {
  const [state, setState] = useState(INITIAL_STATE);
  const [socStats, setSocStats] = useState({ rewardTotal: 0, masteryPct: 5, hintCount: 0, strategyUsed: 'counter_example' });
  const [mediaStream, setMediaStream] = useState(null);
  const [violation, setViolation] = useState(null);
  const [mpWarningToast, setMpWarningToast] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const timerRef = useRef(null);
  const containerRef = useRef(null);
  const videoRef = useRef(null);
  const voice = useVoice();

  // Face Detection Hook (active during interview/socratic phases)
  useFaceDetection({
    videoRef,
    active: state.phase >= 1 && state.phase <= 3,
    onMultipleFaces: (count) => {
      setState(prev => {
        const newWarnings = prev.mpWarnings + 1;
        if (newWarnings >= 5) {
          // Auto-exit max limit reached
          voice.stopSpeaking();
          alert("Interview Terminated: Multiple people detected repeatedly.");
          return { ...prev, mpWarnings: newWarnings, screen: 'report', phase: 4 };
        }
        setMpWarningToast(newWarnings);
        return { ...prev, mpWarnings: newWarnings };
      });
    }
  });

  // Inject CSS
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = GLOBAL_CSS;
    document.head.appendChild(style);
    window.speechSynthesis?.getVoices();
    setTimeout(() => window.speechSynthesis?.getVoices(), 500);
    return () => document.head.removeChild(style);
  }, []);

  // Timer
  useEffect(() => {
    if (state.phase >= 1 && state.phase <= 3) {
      timerRef.current = setInterval(() => setTimerSeconds(t => t + 1), 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [state.phase]);

  // Fullscreen change listener
  useEffect(() => {
    const handle = () => {
      const fs = !!document.fullscreenElement;
      setIsFullscreen(fs);
    };
    document.addEventListener('fullscreenchange', handle);
    return () => document.removeEventListener('fullscreenchange', handle);
  }, []);

  const enterFullscreen = () => {
    const el = containerRef.current || document.documentElement;
    el.requestFullscreen?.().then(() => setIsFullscreen(true)).catch(() => { });
  };

  const handlePreflightReady = (stream) => {
    setMediaStream(stream);
    enterFullscreen();
    setState(prev => ({ ...prev, screen: 'setup', phase: 0 }));
  };

  const handleStart = async ({ topic, jdText, pdfText, jdFromJD, numQuestions, scenarioMode }) => {
    try {
      const res = await fetch('/api/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: topic || "",      // topic card selection or first parsed topic
          jd_text: jdText || "",     // compact domain hint (when PDF used) or full paste
          pdf_text: pdfText || "",    // full PDF text for RAG pipeline
          num_questions: numQuestions,
          scenario_mode: scenarioMode
        })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      // Use 'topics' (the correct backend field) instead of 'key_topics'
      const jdTopics = (data.jd_data?.topics || []).map(name => ({ name, status: 'pending' }));
      window.__SESSION_ID__ = data.session_id;
      setState(prev => ({
        ...prev,
        screen: 'interview',
        phase: 1,
        topic: data.jd_data?.role || topic,
        questionIndex: 0,
        session_id: data.session_id,
        currentQuestion: data.question,
        max_questions: data.max_questions || numQuestions,
        difficulty: data.difficulty || 'medium',
        fp: { depth: 0, acc: 0, conf: 0, cons: 0, orig: 0 },
        pattern: 'Analyzing...',
        weakSpots: [],
        jdTopics
      }));
    } catch (e) {
      alert("Failed to start session: " + e.message);
    }
  };

  const handleAnswer = (result) => {
    if (result.completed) {
      voice.stopSpeaking();
      voice.stopListening();
      if (mediaStream) mediaStream.getTracks().forEach(t => t.stop());
      setMediaStream(null);
      document.exitFullscreen?.().catch(() => { });
      setIsFullscreen(false);
      setState(prev => ({ ...prev, screen: 'transition', phase: 2 }));
      return;
    }
    // FIX: backend sends `ui_scores` and `next_question` (snake_case), not `scores`/`nextQuestion`
    const scores = result.ui_scores || result.scores;
    const nextQuestion = result.next_question || result.nextQuestion;
    const { difficulty } = result;
    setState(prev => {
      const newFp = scores ? {
        depth: scores.depth ?? prev.fp.depth,
        acc: scores.acc ?? prev.fp.acc,
        conf: scores.conf ?? prev.fp.conf,
        cons: scores.cons ?? prev.fp.cons,
        orig: scores.orig ?? prev.fp.orig,
      } : prev.fp;
      const ti = prev.jdTopics.length > 0 ? prev.questionIndex % prev.jdTopics.length : -1;
      const newJdTopics = ti >= 0
        ? prev.jdTopics.map((t, i) => i === ti ? { ...t, status: (scores?.acc ?? 0) > 55 ? 'covered' : 'gap' } : t)
        : prev.jdTopics;
      // Accumulate weak_area strings from each evaluation into weakSpots
      const evalWeakArea = result.weak_area || result.evaluation?.weak_area || '';
      const existingWeak = prev.weakSpots || [];
      const newWeakSpots = evalWeakArea && !existingWeak.includes(evalWeakArea)
        ? [...existingWeak, evalWeakArea]
        : existingWeak.length > 0
          ? existingWeak
          : newJdTopics.filter(t => t.status !== 'covered').map(t => t.name);
      return {
        ...prev,
        fp: newFp,
        difficulty: difficulty || prev.difficulty,
        jdTopics: newJdTopics,
        weakSpots: newWeakSpots,
        questionIndex: prev.questionIndex + 1,
        currentQuestion: nextQuestion || prev.currentQuestion,
      };
    });
  };

  const handleViolation = (count) => {
    setState(prev => ({ ...prev, violations: count }));
    setViolation(count);
  };

  const handleViewReport = (rewardTotal, masteryPct, hintCount, strategyUsed) => {
    setSocStats({ rewardTotal, masteryPct, hintCount, strategyUsed });
    // Always exit fullscreen before showing the report
    const showReport = () => setState(prev => ({ ...prev, screen: 'report', phase: 4 }));
    if (document.fullscreenElement) {
      document.exitFullscreen().then(showReport).catch(showReport);
    } else {
      showReport();
    }
  };

  const handleRestart = () => {
    voice.stopSpeaking();
    voice.stopListening();
    if (mediaStream) mediaStream.getTracks().forEach(t => t.stop());
    setMediaStream(null);
    setIsFullscreen(false);
    document.exitFullscreen?.().catch(() => { });
    setState(INITIAL_STATE);
    setSocStats({ rewardTotal: 0, masteryPct: 5, hintCount: 0, strategyUsed: 'counter_example' });
    setTimerSeconds(0);
    setViolation(null);
  };

  const inSession = state.phase >= 1 && state.phase <= 3;

  return (
    <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', position: 'relative', background: 'var(--bg)' }}>
      <NoiseBg />

      {/* Tab switch guard */}
      <TabSwitchGuard active={inSession} onViolation={handleViolation} />

      {/* Violation toast */}
      {violation && <ViolationToast count={violation} onDismiss={() => setViolation(null)} />}

      {/* Multi-Person Face Detection warning */}
      {mpWarningToast && <MultiPersonWarningToast count={mpWarningToast} maxWarnings={5} onDismiss={() => setMpWarningToast(null)} />}

      {/* Fullscreen banner (only when in session and not fullscreen) */}
      {inSession && !isFullscreen && <FullscreenBanner onReenter={enterFullscreen} />}

      {/* Header (not on preflight) */}
      {state.screen !== 'preflight' && (
        <Header
          phase={state.phase}
          topic={state.topic}
          questionIndex={state.questionIndex}
          totalQ={state.max_questions || 10}
          violations={state.violations || 0}
          mediaStream={mediaStream}
          timerSeconds={timerSeconds}
        />
      )}

      {/* Screens */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative', zIndex: 1 }}>
        {state.screen === 'preflight' && <PreflightScreen onReady={handlePreflightReady} />}
        {state.screen === 'setup' && <SetupScreen onStart={handleStart} mediaStream={mediaStream} />}
        {state.screen === 'interview' && <InterviewScreen state={state} onAnswer={handleAnswer} voice={voice} mediaStream={mediaStream} videoRef={videoRef} />}
        {state.screen === 'transition' && <TransitionScreen state={state} onEnterSocratic={() => setState(prev => ({ ...prev, screen: 'socratic', phase: 3 }))} voice={voice} />}
        {state.screen === 'socratic' && <SocraticScreen state={state} onViewReport={handleViewReport} voice={voice} mediaStream={mediaStream} videoRef={videoRef} />}
        {state.screen === 'report' && <ReportScreen state={state} socStats={socStats} onRestart={handleRestart} />}
      </div>
    </div>
  );
}