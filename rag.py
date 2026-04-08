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
from openai import OpenAI, RateLimitError
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_chroma import Chroma

UPLOAD_DIR = "./uploads"
DB_BASE_DIR = "./project_dbs"
EMBED_MODEL = "sentence-transformers/all-MiniLM-L6-v2"

OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "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")

# Free models tried in order if one is rate-limited or deprecated.
# openrouter/free is a meta-router that auto-selects from all currently available free models.
FALLBACK_MODELS = [
    "openrouter/free",
    "nvidia/llama-3.1-nemotron-nano-8b-v1:free",
    "google/gemma-3-4b-it:free",
    "mistralai/mistral-7b-instruct:free",
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
                return response.choices[0].message.content.strip()
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


def judge_prompt(plaintiff, defense):
    return f"""You are a neutral, experienced judge presiding over this case.

PLAINTIFF'S ARGUMENT:
{plaintiff}

DEFENSE'S RESPONSE:
{defense}

Evaluate both arguments and provide:
1. Assessment of each side's strengths
2. Which argument is more compelling and why
3. Key issues that remain unresolved
4. Your preliminary ruling

JUDICIAL RULING:"""


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
            return "No relevant information found. Please upload documents first."

        hist = self.history.get(store_id, [])
        history_text = "\n".join(hist[-3:])

        if mode == "case":
            prompt = case_analysis_prompt(query, docs, history_text)
        else:
            prompt = document_qa_prompt(query, docs)

        response = generate(prompt)

        if store_id not in self.history:
            self.history[store_id] = []
        self.history[store_id].append(f"Q: {query}\nA: {response}")

        return response

    def mock_trial(self, store_id, user_argument):
        store = self.get_or_create_store(store_id)
        docs = store.query(user_argument)

        if not docs:
            return {"error": "No case documents found. Upload documents first."}

        defense = generate(opposing_counsel_prompt(user_argument, docs))
        ruling = generate(judge_prompt(user_argument, defense))

        return {
            "plaintiff": user_argument,
            "defense": defense,
            "ruling": ruling,
        }
