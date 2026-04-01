#creating the knowledge base from datasets on hugging face 

__import__('pysqlite3')
import sys
sys.modules['sqlite3'] = sys.modules.pop('pysqlite3')

import os
import torch
from transformers import AutoTokenizer, AutoModelForCausalLM
from datasets import load_dataset
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_chroma import Chroma

DB_DIR = "./legal_db"
EMBED_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
GEN_MODEL = "Qwen/Qwen2.5-1.5B-Instruct"  

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
import time
from tqdm import tqdm  # pip install tqdm

def build_or_load_db():
    embeddings = HuggingFaceEmbeddings(
        model_name=EMBED_MODEL,
        model_kwargs={'device': DEVICE}
    )

    if os.path.exists(DB_DIR):
        print("Loading existing DB...")

        db = Chroma(
            persist_directory=DB_DIR,
            embedding_function=embeddings
        )

        try:
            count = db._collection.count()
            print(f" DB loaded with {count} documents")
        except:
            print("Could not verify DB contents")

        return db

    print("Building knowledge base")

    # Load dataset
    print("Loading dataset")
    dataset = load_dataset("jhu-clsp/CLERC", split="train")

    print(f" Dataset loaded with {len(dataset)} rows")

    dataset = dataset.select(range(50000))
    # Prepare documents
    print(" Processing docs")

    documents = []

    for item in dataset:
        query = item["query"]

        # extract supporting passages
        passages = [
            p["text"] for p in item.get("positive_passages", [])
        ]
        full_text = query + " " + " ".join(passages)
        if full_text.strip():
            documents.append(full_text)
        print(f"Processed {len(documents)} documents")

    # Chunking
    print("Chunking docs")
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=800,
        chunk_overlap=60
    )

    chunks = splitter.create_documents(documents)
    print(f"Created {len(chunks)} chunks")


    # Embedding + DB insert (BATCHED)
    print(" Creating embeddings and adding to db")

    db = Chroma(
        persist_directory=DB_DIR,
        embedding_function=embeddings
    )

    batch_size = 500  
    total_batches = len(chunks) // batch_size + 1

    start_time = time.time()

    for i in tqdm(range(0, len(chunks), batch_size), desc=" Embedding batches"):
        batch = chunks[i:i + batch_size]

        db.add_documents(batch)

        if i % (batch_size * 5) == 0:
            print(f"\n Processed {i} chunks")

    print("saving to db")
    db.persist()

    print(f" DB created with {len(chunks)} chunks")
    return db

# =========================
# LOAD GENERATOR
# =========================

def load_generator():
    tokenizer = AutoTokenizer.from_pretrained(GEN_MODEL)
    model = AutoModelForCausalLM.from_pretrained(
        GEN_MODEL,
        device_map="auto",
        torch_dtype=torch.float16 if DEVICE == "cuda" else torch.float32
    )
    return tokenizer, model

# =========================
# PROMPTS
# =========================

def trial_prompt(query, docs, history=""):
    context = "\n\n".join([d.page_content for d in docs])

    return f"""
You are LegalScope, a trial preparation assistant.

CASE MATERIAL:
{context}

HISTORY:
{history}

QUESTION:
{query}

OUTPUT:

### Trial Preparation Report
Key Legal Issues:
Supporting Arguments:
Opposing Arguments:
Risk Assessment:
Recommended Strategy:
Referenced Evidence:
Final Answer:
"""


def opposing_counsel_prompt(query, docs):
    context = "\n\n".join([d.page_content for d in docs])

    return f"""
You are an aggressive opposing lawyer.

Your goal:
- Attack the case
- Find weaknesses
- Challenge assumptions

CASE:
{context}

LAWYER ARGUMENT:
{query}

Respond with:
- Counterarguments
- Weaknesses
- Cross-examination questions
"""


def judge_prompt(plaintiff, defense):
    return f"""
You are a neutral judge.

PLAINTIFF ARGUMENT:
{plaintiff}

DEFENSE ARGUMENT:
{defense}

Evaluate:
- Which is stronger?
- Why?
- What is missing?

Give a short ruling.
"""


# =========================
# GENERATION
# =========================

def generate(tokenizer, model, prompt):
    inputs = tokenizer(prompt, return_tensors="pt").to(DEVICE)

    outputs = model.generate(
        **inputs,
        max_new_tokens=500,
        temperature=0.3
    )

    return tokenizer.decode(outputs[0], skip_special_tokens=True)

# =========================
# MAIN CLASS
# =========================

class LegalScope:
    def __init__(self):
        self.db = build_or_load_db()
        self.retriever = self.db.as_retriever(search_kwargs={"k": 5})
        self.tokenizer, self.model = load_generator()

        self.history = []
        self.active_case_docs = None

    # ---------------------
    # Load a case
    # ---------------------
    def load_case(self, topic):
        self.active_case_docs = self.retriever.get_relevant_documents(topic)
        print("\n Case loaded.\n")

    # ---------------------
    # Ask about case
    # ---------------------
    def ask(self, query):
        docs = self.active_case_docs
        history = "\n".join(self.history[-3:])

        prompt = trial_prompt(query, docs, history)
        response = generate(self.tokenizer, self.model, prompt)

        self.history.append(f"Q: {query}\nA: {response}")
        return response

    # ---------------------
    # Mock Trial Simulator
    # ---------------------
    def mock_trial(self, user_argument):
        docs = self.active_case_docs

        print("\n Running Mock Trial...\n")

        plaintiff = user_argument

        defense_prompt = opposing_counsel_prompt(plaintiff, docs)
        defense = generate(self.tokenizer, self.model, defense_prompt)

        judge = generate(
            self.tokenizer,
            self.model,
            judge_prompt(plaintiff, defense)
        )

        return {
            "plaintiff": plaintiff,
            "defense": defense,
            "judge": judge
        }
