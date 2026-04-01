#creating the knowledge base from datasets on hugging face 

__import__('pysqlite3')
import sys
sys.modules['sqlite3'] = sys.modules.pop('pysqlite3')

import os
import torch
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

build_or_load_db()
