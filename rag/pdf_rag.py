"""
rag/pdf_rag.py
==============
RAG (Retrieval-Augmented Generation) pipeline for PDF Job Descriptions.

WHAT IT DOES:
  1. Receives raw PDF text (extracted by frontend PDF.js)
  2. Chunks the text into overlapping segments
  3. Builds a simple TF-IDF style keyword index in memory
  4. Extracts key technical concepts and skills
  5. Stores a vector-lite index: keyword → chunk list
  6. At question-generation time, retrieves the most relevant chunks
     and passes them as context to Agent 2 — so questions are
     GROUNDED in the actual JD content, not hallucinated

WHY RAG INSTEAD OF JUST SENDING THE WHOLE PDF:
  - PDFs can be 5000+ tokens — too long for some model contexts
  - RAG retrieves only the 2-3 most relevant chunks per question
  - Questions become much more specific to the actual role
  - Keyword index prevents repeated question themes

NO EXTERNAL VECTOR DB NEEDED:
  This uses a pure Python in-memory inverted index.
  Fast enough for JD-sized documents (< 5000 words).
  For larger corpora, swap the index for ChromaDB or FAISS.
"""

import re
import math
import json
from collections import defaultdict
from utils.groq_llm import call_groq_llm
from config import MODEL_ANALYST

# ── Chunk settings ─────────────────────────────────────────────────────────────
CHUNK_SIZE    = 300   # words per chunk
CHUNK_OVERLAP = 80    # overlapping words between consecutive chunks
TOP_K_CHUNKS  = 3     # how many chunks to retrieve per query

# ── Technical stopwords (don't index these) ────────────────────────────────────
_STOPWORDS = {
    "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "from", "as", "is", "are", "was", "were", "be",
    "been", "being", "have", "has", "had", "do", "does", "did", "will",
    "would", "could", "should", "may", "might", "shall", "can", "need",
    "we", "you", "they", "he", "she", "it", "this", "that", "these",
    "those", "our", "your", "their", "its", "who", "which", "what",
    "when", "where", "how", "why", "if", "then", "than", "so", "yet",
    "both", "each", "few", "more", "most", "other", "some", "such",
    "not", "only", "same", "too", "very", "just", "because", "while",
    "although", "however", "therefore", "also", "about", "up", "out",
    "work", "team", "role", "position", "company", "candidate", "job",
    "apply", "application", "experience", "years", "year", "required",
    "responsibilities", "requirements", "preferred", "plus", "bonus",
}

# ── Technical domain keywords that matter for question generation ──────────────
_TECH_BOOSTERS = {
    # DS&A
    "algorithm", "data structure", "complexity", "sorting", "graph", "tree",
    "dynamic programming", "recursion", "hash", "heap", "queue", "stack",
    # Systems
    "distributed", "concurrency", "threading", "memory", "cache", "database",
    "sql", "nosql", "acid", "transaction", "index", "query", "schema",
    # Networking
    "tcp", "http", "rest", "api", "grpc", "websocket", "dns", "load balancer",
    # ML/AI
    "machine learning", "model", "training", "inference", "neural", "embedding",
    "feature", "gradient", "loss", "transformer", "llm",
    # Languages & frameworks
    "python", "java", "golang", "rust", "javascript", "typescript", "react",
    "django", "fastapi", "spring", "kubernetes", "docker", "aws", "gcp", "azure",
    # Design
    "microservice", "architecture", "design pattern", "solid", "scalability",
    "availability", "fault tolerance", "event driven", "kafka", "redis",
}


# ─────────────────────────────────────────────────────────────────────────────
# CORE RAG CLASS
# ─────────────────────────────────────────────────────────────────────────────

class JDRagIndex:
    """
    Lightweight in-memory RAG index for a single JD document.
    One instance per session — stored in session["rag_context"].
    """

    def __init__(self, raw_text: str):
        self.raw_text  = raw_text
        self.chunks:   list[str] = []          # text chunks
        self.keywords: list[str] = []          # top technical keywords
        self.topics:   list[str] = []          # high-level topic list
        self.index:    dict[str, list[int]] = defaultdict(list)  # word → chunk indices
        self.tfidf:    dict[str, float] = {}   # keyword → importance score
        self._built    = False

    def build(self) -> "JDRagIndex":
        """Build chunks and inverted index from raw text."""
        self.chunks  = _chunk_text(self.raw_text, CHUNK_SIZE, CHUNK_OVERLAP)
        self.index   = _build_inverted_index(self.chunks)
        self.tfidf   = _compute_tfidf(self.chunks, self.index)
        self.keywords = _extract_keywords(self.tfidf, top_n=30)
        self._built   = True
        return self

    def retrieve(self, query: str, k: int = TOP_K_CHUNKS) -> list[str]:
        """
        Retrieve the k most relevant chunks for a query.
        Uses keyword overlap scoring — fast, no embeddings needed.
        """
        if not self._built:
            self.build()
        if not self.chunks:
            return []

        query_words = _tokenize(query)
        scores: dict[int, float] = defaultdict(float)

        for word in query_words:
            if word in self.index:
                idf = self.tfidf.get(word, 1.0)
                for chunk_idx in self.index[word]:
                    scores[chunk_idx] += idf

        # Boost chunks that contain tech keywords
        for chunk_idx, chunk_text in enumerate(self.chunks):
            chunk_lower = chunk_text.lower()
            for tech in _TECH_BOOSTERS:
                if tech in chunk_lower:
                    scores[chunk_idx] += 0.5

        if not scores:
            return self.chunks[:k]

        ranked = sorted(scores.items(), key=lambda x: x[1], reverse=True)
        return [self.chunks[i] for i, _ in ranked[:k]]

    def to_dict(self) -> dict:
        """Serialise to store in session."""
        return {
            "chunks":   self.chunks,
            "keywords": self.keywords,
            "topics":   self.topics,
            "tfidf":    self.tfidf,
        }

    @classmethod
    def from_dict(cls, raw_text: str, data: dict) -> "JDRagIndex":
        """Reconstruct from session store."""
        obj = cls(raw_text)
        obj.chunks   = data.get("chunks", [])
        obj.keywords = data.get("keywords", [])
        obj.topics   = data.get("topics", [])
        obj.tfidf    = data.get("tfidf", {})
        obj.index    = _build_inverted_index(obj.chunks)
        obj._built   = True
        return obj


# ─────────────────────────────────────────────────────────────────────────────
# PUBLIC API
# ─────────────────────────────────────────────────────────────────────────────

async def build_rag_index(pdf_text: str) -> JDRagIndex:
    """
    Main entry point. Call this after PDF text is received.
    Returns a built JDRagIndex ready for retrieval.
    """
    index = JDRagIndex(pdf_text).build()

    # Use LLM to extract high-level topics from keywords
    if index.keywords:
        kw_str = ", ".join(index.keywords[:20])
        system = "You are a technical recruiter. Return ONLY valid JSON, no markdown."
        user   = f"""Given these keywords extracted from a job description: {kw_str}

Return ONLY this JSON:
{{
  "topics": ["Topic1", "Topic2", "Topic3", "Topic4"],
  "role":   "inferred job role title"
}}

Topics should be high-level technical areas (3-5 words max each). JSON only."""

        result = await call_groq_llm(system, user, model=MODEL_ANALYST, max_tokens=200)
        index.topics = result.get("topics", [])

    print(f"[RAG] Built index: {len(index.chunks)} chunks | {len(index.keywords)} keywords | topics={index.topics}")
    return index


def get_context_for_question(rag_index: JDRagIndex, topic: str, subtopic: str) -> str:
    """
    Retrieve relevant JD context for question generation.
    Returns a formatted string ready to inject into Agent 2's prompt.
    """
    query   = f"{topic} {subtopic}"
    chunks  = rag_index.retrieve(query, k=TOP_K_CHUNKS)
    if not chunks:
        return ""
    context = "\n---\n".join(chunks)
    return f"[JD CONTEXT — use this to make the question specific to this role]\n{context}"


def get_keywords(rag_index: JDRagIndex) -> list[str]:
    """Return top technical keywords from the JD for dedup and topic extraction."""
    return rag_index.keywords


def summarise_for_jd_analyzer(rag_index: JDRagIndex) -> str:
    """
    Return a condensed version of the JD for Agent 1 (JD Analyzer).
    Uses top-scored chunks + keywords — much smaller than full text.
    """
    top_chunks = rag_index.retrieve("technical skills requirements responsibilities", k=4)
    keyword_line = "Key technologies: " + ", ".join(rag_index.keywords[:15])
    return keyword_line + "\n\n" + "\n\n".join(top_chunks)


# ─────────────────────────────────────────────────────────────────────────────
# TEXT PROCESSING HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def _tokenize(text: str) -> list[str]:
    """Lowercase, strip punctuation, remove stopwords."""
    words = re.findall(r"[a-zA-Z0-9#+.\-]{2,}", text.lower())
    return [w for w in words if w not in _STOPWORDS]


def _chunk_text(text: str, size: int, overlap: int) -> list[str]:
    """Split text into overlapping word-based chunks."""
    words = text.split()
    chunks = []
    step = size - overlap
    for i in range(0, len(words), step):
        chunk = " ".join(words[i: i + size])
        if len(chunk.strip()) > 30:
            chunks.append(chunk)
    return chunks


def _build_inverted_index(chunks: list[str]) -> dict[str, list[int]]:
    """Build word → [chunk_indices] inverted index."""
    index: dict[str, list[int]] = defaultdict(list)
    for i, chunk in enumerate(chunks):
        for word in set(_tokenize(chunk)):
            index[word].append(i)
    return index


def _compute_tfidf(chunks: list[str], index: dict[str, list[int]]) -> dict[str, float]:
    """
    Compute TF-IDF scores.
    High score = word appears often in few chunks = discriminative keyword.
    """
    n_chunks = max(len(chunks), 1)
    scores: dict[str, float] = {}

    for word, chunk_ids in index.items():
        # IDF: rare across chunks = more informative
        idf = math.log(n_chunks / len(chunk_ids)) + 1.0

        # TF: average frequency within chunks that contain it
        total_tf = 0.0
        for idx in chunk_ids:
            words_in_chunk = _tokenize(chunks[idx])
            tf = words_in_chunk.count(word) / max(len(words_in_chunk), 1)
            total_tf += tf
        avg_tf = total_tf / len(chunk_ids)

        # Boost technical terms
        boost = 2.0 if word in _TECH_BOOSTERS else 1.0
        scores[word] = avg_tf * idf * boost

    return scores


def _extract_keywords(tfidf: dict[str, float], top_n: int = 30) -> list[str]:
    """Return top-N keywords by TF-IDF score."""
    sorted_kw = sorted(tfidf.items(), key=lambda x: x[1], reverse=True)
    return [w for w, _ in sorted_kw[:top_n] if len(w) >= 3]