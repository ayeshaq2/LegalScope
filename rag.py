import sys
import platform

if platform.system() != "Windows":
    try:
        __import__('pysqlite3')
        sys.modules['sqlite3'] = sys.modules.pop('pysqlite3')
    except ImportError:
        pass

import os
import torch
from pathlib import Path
from transformers import AutoTokenizer, AutoModelForCausalLM
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_chroma import Chroma

UPLOAD_DIR = "./uploads"
DB_BASE_DIR = "./project_dbs"
EMBED_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
GEN_MODEL = "Qwen/Qwen2.5-1.5B-Instruct"
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"


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

def load_generator():
    tokenizer = AutoTokenizer.from_pretrained(GEN_MODEL)
    model = AutoModelForCausalLM.from_pretrained(
        GEN_MODEL,
        device_map="auto",
        torch_dtype=torch.float16 if DEVICE == "cuda" else torch.float32,
    )
    return tokenizer, model


def generate(tokenizer, model, prompt):
    inputs = tokenizer(
        prompt, return_tensors="pt", truncation=True, max_length=2048
    ).to(DEVICE)
    input_length = inputs["input_ids"].shape[1]

    outputs = model.generate(
        **inputs, max_new_tokens=512, temperature=0.3, do_sample=True
    )

    generated_ids = outputs[0][input_length:]
    return tokenizer.decode(generated_ids, skip_special_tokens=True).strip()


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
            model_kwargs={"device": DEVICE},
        )
        print("  Embedding model loaded.")

        self.tokenizer, self.model = load_generator()
        print("  Generator model loaded.")

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

        response = generate(self.tokenizer, self.model, prompt)

        if store_id not in self.history:
            self.history[store_id] = []
        self.history[store_id].append(f"Q: {query}\nA: {response}")

        return response

    def mock_trial(self, store_id, user_argument):
        store = self.get_or_create_store(store_id)
        docs = store.query(user_argument)

        if not docs:
            return {"error": "No case documents found. Upload documents first."}

        defense = generate(
            self.tokenizer, self.model,
            opposing_counsel_prompt(user_argument, docs),
        )
        ruling = generate(
            self.tokenizer, self.model,
            judge_prompt(user_argument, defense),
        )

        return {
            "plaintiff": user_argument,
            "defense": defense,
            "ruling": ruling,
        }
