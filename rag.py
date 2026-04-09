import os
import re
import sys
import time
import platform

if platform.system() != "Windows":
    try:
        __import__('pysqlite3')
        sys.modules['sqlite3'] = sys.modules.pop('pysqlite3')
    except ImportError:
        pass

import requests
from pathlib import Path
from openai import OpenAI, RateLimitError, NotFoundError, APIStatusError
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_chroma import Chroma

UPLOAD_DIR = "./uploads"
DB_BASE_DIR = "./project_dbs"
EMBED_MODEL = "sentence-transformers/all-MiniLM-L6-v2"

OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")

FALLBACK_MODELS = [
    "google/gemini-2.0-flash-001",
    "meta-llama/llama-4-scout",
    "openai/gpt-4o-mini",
]

client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=OPENROUTER_API_KEY,
)


# ─── Readability ─────────────────────────────────────────────

def compute_readability(text):
    try:
        import textstat
        grade = round(textstat.flesch_kincaid_grade(text), 1)
        score = round(textstat.flesch_reading_ease(text), 1)
        if score >= 70:
            label, color = "Easy to read", "green"
        elif score >= 50:
            label, color = "Moderately complex", "yellow"
        elif score >= 30:
            label, color = "Difficult", "orange"
        else:
            label, color = "Very difficult", "red"
        return {"grade": grade, "score": score, "label": label, "color": color}
    except Exception:
        return None


# ─── Text Extraction ─────────────────────────────────────────

def extract_text(filepath):
    ext = Path(filepath).suffix.lower()

    if ext == ".txt":
        with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
            return f.read()

    if ext == ".pdf":
        from PyPDF2 import PdfReader
        reader = PdfReader(filepath)
        return "\n\n".join(page.extract_text() or "" for page in reader.pages)

    if ext in (".docx", ".doc"):
        from docx import Document
        doc = Document(filepath)
        return "\n\n".join(p.text for p in doc.paragraphs if p.text.strip())

    return ""


# ─── Generator ────────────────────────────────────────────────

def generate(prompt, retries=3, backoff=5, max_tokens=512):
    for model in FALLBACK_MODELS:
        for attempt in range(retries):
            try:
                response = client.chat.completions.create(
                    model=model,
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.3,
                    max_tokens=max_tokens,
                )
                text = response.choices[0].message.content
                if text:
                    return text.strip()
                print(f"  {model} returned empty content (attempt {attempt + 1}/{retries})")
                continue
            except NotFoundError:
                print(f"  {model} not found / deprecated, skipping …")
                break
            except APIStatusError as e:
                print(f"  {model} returned {e.status_code}: {e.message}, skipping …")
                break
            except RateLimitError:
                wait = backoff * (2 ** attempt)
                print(f"  Rate limited on {model} (attempt {attempt + 1}/{retries}), waiting {wait}s …")
                if attempt < retries - 1:
                    time.sleep(wait)
        print(f"  {model} exhausted, trying next fallback …")
    raise RuntimeError("All models rate-limited. Try again in a moment.")


# ─── Prompt Templates ────────────────────────────────────────

def case_analysis_prompt(query, docs, history=""):
    context = "\n\n---\n\n".join(d.page_content for d in docs)
    return f"""You are LegalScope, an AI legal analysis assistant helping a lawyer prepare a case.

Based on the following case documents, answer the question thoroughly.

DOCUMENTS:
{context}

CONVERSATION HISTORY:
{history}

QUESTION:
{query}

Provide a structured answer covering:
- Direct answer to the question
- Relevant evidence from the documents
- Legal implications or risks
- Strategic recommendations

ANSWER:"""


def document_qa_prompt(query, docs):
    context = "\n\n---\n\n".join(d.page_content for d in docs)
    return f"""You are LegalScope, an AI document analysis assistant.

Based on the following document content, answer the user's question accurately.

DOCUMENT CONTENT:
{context}

QUESTION:
{query}

Provide a clear, helpful answer based strictly on the document content.
If the answer cannot be found in the document, say so.

ANSWER:"""


def opposing_counsel_prompt(argument, docs):
    context = "\n\n---\n\n".join(d.page_content for d in docs)
    return f"""You are an experienced opposing counsel in a courtroom.

Based on the case materials, aggressively challenge the plaintiff's argument.

CASE MATERIALS:
{context}

PLAINTIFF'S ARGUMENT:
{argument}

Provide:
1. Strong counterarguments
2. Weaknesses in the plaintiff's position
3. Cross-examination questions you would ask
4. Alternative interpretations of the evidence

DEFENSE RESPONSE:"""


def rebuttal_defense_prompt(original_argument, first_defense, rebuttal, docs):
    context = "\n\n---\n\n".join(d.page_content for d in docs)
    return f"""You are an experienced opposing counsel in a courtroom. The plaintiff has responded to your initial defense with a rebuttal.

CASE MATERIALS:
{context}

ORIGINAL PLAINTIFF ARGUMENT:
{original_argument}

YOUR INITIAL DEFENSE:
{first_defense}

PLAINTIFF'S REBUTTAL:
{rebuttal}

Counter the plaintiff's rebuttal. Address their new points directly, exploit any remaining weaknesses, and reinforce your strongest arguments. Be aggressive but precise.

DEFENSE COUNTER-REBUTTAL:"""


def judge_prompt(history_text):
    return f"""You are a neutral, experienced judge presiding over this case. You have observed the full trial proceedings.

{history_text}

Evaluate ALL arguments presented by both sides across every round and provide:
1. Assessment of each side's strengths across the trial
2. How the arguments evolved — did the plaintiff improve or weaken?
3. Which side made the more compelling overall case and why
4. Key issues that remain unresolved
5. Your final ruling and reasoning

JUDICIAL RULING:"""


def coach_prompt(argument, docs, phase, history_text=""):
    context = "\n\n---\n\n".join(d.page_content for d in docs)
    phase_labels = {"opening": "opening argument", "rebuttal": "rebuttal", "closing": "closing statement"}
    phase_label = phase_labels.get(phase, phase)
    return f"""You are a law school professor coaching a student through a mock trial exercise.
The student just submitted their {phase_label}. Evaluate it against the case materials.

CASE MATERIALS:
{context}

TRIAL HISTORY SO FAR:
{history_text}

STUDENT'S {phase_label.upper()}:
{argument}

You MUST respond with ONLY valid JSON — no markdown, no explanation, no text before or after.
Return this exact structure:
{{"score": <integer 1-10>, "strengths": ["<strength 1>", "<strength 2>"], "weaknesses": ["<weakness 1>", "<weakness 2>"], "tips": ["<actionable tip 1>", "<actionable tip 2>"], "missing": ["<missing element 1>", "<missing element 2>"]}}

Rules:
- score: 1 = very poor, 10 = exceptional
- Each array should have 2-4 items
- Be specific to THIS argument and THESE case materials
- For tips, tell them exactly what to say or cite
- For missing, reference specific evidence or legal principles from the case materials they should have used"""


def auto_analysis_prompt(docs):
    context = "\n\n---\n\n".join(d.page_content for d in docs)
    return f"""You are LegalScope, a plain-language legal document assistant for everyday people (not lawyers).

Analyze the following document and produce a structured report using exactly these section headings.
Write in plain English — no jargon. Be direct and specific to this document.

DOCUMENT:
{context}

Produce the report in this exact format:

WHAT THIS IS
[1-2 sentences: what type of document this is and its purpose]

THE PARTIES
[Who is involved and what role each plays]

YOUR KEY OBLIGATIONS
[Bullet list of what the non-drafting / signing party must do]

RESTRICTIONS ON YOU
[Bullet list of what you cannot do under this agreement]

IMPORTANT DATES & NUMBERS
[Bullet list of deadlines, durations, notice periods, fees, penalties, or financial figures]

RED FLAGS
[Bullet list of unusual, one-sided, or risky clauses — be specific]

MISSING PROTECTIONS
[Bullet list of standard clauses that are absent and why that matters]

HOW TO EXIT
[How either party can terminate this agreement]

VERDICT
[2-3 sentences: is this document favorable, neutral, or unfavorable for the signing party, and why]"""

def case_suggestions_prompt(query, response, docs):
    context = "\n\n---\n\n".join(d.page_content for d in docs[:3])
    return f"""You are a legal analysis assistant helping a lawyer prepare a case.

The lawyer just asked a question and received an analysis. Based on the case documents and the exchange below, generate exactly 4 short follow-up questions a lawyer would logically ask next.
Make them specific to THIS case — not generic legal questions.
Each question should be under 12 words.

CASE DOCUMENTS (excerpt):
{context}

LAWYER'S QUESTION:
{query}

AI ANALYSIS (excerpt):
{response[:800]}

Return ONLY the 4 questions, numbered 1 to 4, one per line. No explanations, no preamble."""


def suggestions_prompt(docs):
    context = "\n\n---\n\n".join(d.page_content for d in docs)
    return f"""You are a legal document assistant helping a non-lawyer understand a contract.

Based on the document below, generate exactly 4 short follow-up questions that a non-lawyer would genuinely want to ask next.
Make them specific to THIS document — not generic questions that apply to any contract.
Each question should be under 10 words.

DOCUMENT:
{context}

Return ONLY the 4 questions, numbered 1 to 4, one per line. No explanations, no preamble."""


def legal_terms_prompt(docs):
    context = "\n\n---\n\n".join(d.page_content for d in docs[:3])
    return f"""List exactly 6 legal or technical terms from this document that a non-lawyer would not understand.
Return ONLY the terms, one per line, no numbering, no explanations, no punctuation.

DOCUMENT:
{context}"""


def translation_prompt(text, target_language):
    return f"""You are a professional legal translator. Translate the following legal text into {target_language}.

RULES:
- Preserve the meaning and legal intent of every clause
- Keep standard legal terms in their accepted {target_language} equivalents
- Where a legal concept has no direct equivalent, keep the original term in parentheses next to the translation
- Maintain the original formatting (bullet points, section headings, numbering)
- Do not add commentary, explanations, or disclaimers — return ONLY the translation

TEXT TO TRANSLATE:
{text}

TRANSLATION:"""


# ─── Per-Project Document Store ──────────────────────────────

class DocumentStore:
    def __init__(self, store_id, embeddings):
        self.store_id = store_id
        self.db_dir = os.path.join(DB_BASE_DIR, store_id)
        os.makedirs(self.db_dir, exist_ok=True)

        self.db = Chroma(
            persist_directory=self.db_dir,
            embedding_function=embeddings,
        )
        self.retriever = self.db.as_retriever(search_kwargs={"k": 5})

    def add_text(self, text, source_name="unknown"):
        splitter = RecursiveCharacterTextSplitter(chunk_size=800, chunk_overlap=100)
        chunks = splitter.create_documents(
            [text],
            metadatas=[{"source": source_name}] * 1,
        )
        if chunks:
            self.db.add_documents(chunks)
        return len(chunks)

    def query(self, question):
        return self.retriever.invoke(question)

    def count(self):
        try:
            return self.db._collection.count()
        except Exception:
            return 0


# ─── LegalScope Engine ───────────────────────────────────────

class LegalScope:
    def __init__(self):
        print("Initializing LegalScope engine …")
        self.embeddings = HuggingFaceEmbeddings(
            model_name=EMBED_MODEL,
            model_kwargs={"device": "cpu"},
        )
        print("  Embedding model loaded.")
        print(f"  Generator: OpenRouter ({FALLBACK_MODELS[0]})")

        self.stores = {}
        self.history = {}

    def get_or_create_store(self, store_id):
        if store_id not in self.stores:
            self.stores[store_id] = DocumentStore(store_id, self.embeddings)
            self.history[store_id] = []
        return self.stores[store_id]

    def ingest_file(self, store_id, filepath):
        text = extract_text(filepath)
        if not text.strip():
            return 0
        store = self.get_or_create_store(store_id)
        return store.add_text(text, source_name=os.path.basename(filepath))

    def auto_analyze(self, store_id):
        store = self.get_or_create_store(store_id)
        docs = store.query("parties obligations restrictions termination fees penalties")
        if not docs:
            return {"analysis": "No document content found. Please upload a document first.", "suggestions": [], "glossary": []}

        analysis = generate(auto_analysis_prompt(docs), max_tokens=1024)
        suggestions = self._suggest_questions(docs)
        glossary = self._fetch_glossary(docs)
        return {"analysis": analysis, "suggestions": suggestions, "glossary": glossary}

    def _suggest_questions(self, docs):
        try:
            raw = generate(suggestions_prompt(docs), max_tokens=200)
            lines = [l.strip() for l in raw.splitlines() if l.strip()]
            questions = [re.sub(r'^[\d]+[\.\)]\s*', '', l) for l in lines if l]
            return [q for q in questions if len(q) > 5][:4]
        except Exception:
            return []

    def _fetch_glossary(self, docs):
        try:
            raw = generate(legal_terms_prompt(docs), max_tokens=120)
            terms = [t.strip().strip('.,;') for t in raw.splitlines() if t.strip()][:6]
        except Exception:
            return []

        glossary = []
        for term in terms:
            try:
                url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{requests.utils.quote(term)}"
                resp = requests.get(url, timeout=5, headers={"User-Agent": "LegalScope/1.0"})
                if resp.status_code == 200:
                    data = resp.json()
                    extract = data.get("extract", "")
                    if extract:
                        sentences = extract.split('. ')
                        definition = '. '.join(sentences[:2]).strip()
                        if not definition.endswith('.'):
                            definition += '.'
                        glossary.append({"term": term, "definition": definition})
            except Exception:
                pass
        return glossary

    def ask(self, store_id, query, mode="case"):
        store = self.get_or_create_store(store_id)
        docs = store.query(query)

        if not docs:
            return {"response": "No relevant information found. Please upload documents first.", "suggestions": []}

        hist = self.history.get(store_id, [])
        history_text = "\n".join(hist[-3:])

        if mode == "case":
            prompt = case_analysis_prompt(query, docs, history_text)
        else:
            prompt = document_qa_prompt(query, docs)

        response = generate(prompt, max_tokens=4096)

        if store_id not in self.history:
            self.history[store_id] = []
        self.history[store_id].append(f"Q: {query}\nA: {response}")

        suggestions = []
        if mode == "case":
            suggestions = self._suggest_case_questions(query, response, docs)

        return {"response": response, "suggestions": suggestions}

    def _suggest_case_questions(self, query, response, docs):
        try:
            raw = generate(case_suggestions_prompt(query, response, docs), max_tokens=200)
            lines = [l.strip() for l in raw.splitlines() if l.strip()]
            questions = [re.sub(r'^[\d]+[\.\)]\s*', '', l) for l in lines if l]
            return [q for q in questions if len(q) > 5][:4]
        except Exception:
            return []

    def mock_trial(self, store_id, argument, phase="opening", history=None):
        import json as _json
        store = self.get_or_create_store(store_id)
        docs = store.query(argument)

        if not docs:
            return {"error": "No case documents found. Upload documents first."}

        history = history or []
        history_text = "\n\n".join(
            f"[{h['role'].upper()}] ({h.get('phase', '')})\n{h['text']}"
            for h in history
        )

        if phase == "opening":
            defense = generate(opposing_counsel_prompt(argument, docs), max_tokens=4096)
            coaching = self._get_coaching(argument, docs, "opening", history_text)
            return {"phase": "opening", "defense": defense, "coaching": coaching}

        elif phase == "rebuttal":
            first_argument = ""
            first_defense = ""
            for h in history:
                if h.get("phase") == "opening" and h["role"] == "plaintiff":
                    first_argument = h["text"]
                if h.get("phase") == "opening" and h["role"] == "defense":
                    first_defense = h["text"]
            defense = generate(
                rebuttal_defense_prompt(first_argument, first_defense, argument, docs),
                max_tokens=4096,
            )
            coaching = self._get_coaching(argument, docs, "rebuttal", history_text)
            return {"phase": "rebuttal", "defense": defense, "coaching": coaching}

        elif phase == "closing":
            coaching = self._get_coaching(argument, docs, "closing", history_text)
            full_history = history_text + f"\n\n[PLAINTIFF] (closing)\n{argument}"
            ruling = generate(judge_prompt(full_history), max_tokens=4096)
            return {"phase": "closing", "ruling": ruling, "coaching": coaching}

        return {"error": f"Unknown phase: {phase}"}

    def _get_coaching(self, argument, docs, phase, history_text):
        import json as _json
        try:
            raw = generate(coach_prompt(argument, docs, phase, history_text), max_tokens=600)
            raw = raw.strip()
            if raw.startswith("```"):
                raw = re.sub(r"^```(?:json)?\s*", "", raw)
                raw = re.sub(r"\s*```$", "", raw)
            return _json.loads(raw)
        except Exception:
            return {"score": 0, "strengths": [], "weaknesses": [], "tips": [], "missing": []}
