import os
import uuid

import requests
from dotenv import load_dotenv
load_dotenv()

from flask import Flask, render_template, request, jsonify
from werkzeug.utils import secure_filename
from rag import LegalScope, compute_readability, extract_text, translation_prompt, generate

app = Flask(__name__)
app.secret_key = os.urandom(24)

UPLOAD_DIR = "./uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

engine = None
projects = {}


def get_engine():
    global engine
    if engine is None:
        engine = LegalScope()
    return engine


# ─── Pages ────────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html")


# ─── Project Endpoints (Lawyer Mode) ─────────────────────────

@app.route("/api/projects", methods=["GET"])
def list_projects():
    return jsonify(list(projects.values()))


@app.route("/api/projects", methods=["POST"])
def create_project():
    data = request.get_json(force=True)
    name = data.get("name", "").strip()
    description = data.get("description", "").strip()
    if not name:
        return jsonify({"error": "Project name is required"}), 400

    project_id = str(uuid.uuid4())[:8]
    project_dir = os.path.join(UPLOAD_DIR, project_id)
    os.makedirs(project_dir, exist_ok=True)

    project = {
        "id": project_id,
        "name": name,
        "description": description,
        "files": [],
    }
    projects[project_id] = project
    return jsonify(project), 201


@app.route("/api/projects/<project_id>/upload", methods=["POST"])
def upload_project_files(project_id):
    if project_id not in projects:
        return jsonify({"error": "Project not found"}), 404

    if "files" not in request.files:
        return jsonify({"error": "No files provided"}), 400

    uploaded = []
    eng = get_engine()

    for f in request.files.getlist("files"):
        if f.filename:
            filename = secure_filename(f.filename)
            filepath = os.path.join(UPLOAD_DIR, project_id, filename)
            f.save(filepath)

            chunks = eng.ingest_file(project_id, filepath)
            file_info = {"name": filename, "chunks": chunks}
            projects[project_id]["files"].append(file_info)
            uploaded.append(file_info)

    return jsonify({"uploaded": uploaded, "project": projects[project_id]})


@app.route("/api/projects/<project_id>/query", methods=["POST"])
def query_project(project_id):
    if project_id not in projects:
        return jsonify({"error": "Project not found"}), 404

    data = request.get_json(force=True)
    query = data.get("query", "").strip()
    if not query:
        return jsonify({"error": "Query is required"}), 400

    eng = get_engine()
    try:
        response = eng.ask(project_id, query, mode="case")
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 429
    return jsonify({"response": response})


@app.route("/api/projects/<project_id>/mock_trial", methods=["POST"])
def project_mock_trial(project_id):
    if project_id not in projects:
        return jsonify({"error": "Project not found"}), 404

    data = request.get_json(force=True)
    argument = data.get("argument", "").strip()
    if not argument:
        return jsonify({"error": "Argument is required"}), 400

    eng = get_engine()
    try:
        result = eng.mock_trial(project_id, argument)
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 429
    if "error" in result:
        return jsonify(result), 400
    return jsonify(result)


# ─── Document Analysis Endpoints (User Mode) ─────────────────

@app.route("/api/doc/upload", methods=["POST"])
def upload_document():
    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400

    f = request.files["file"]
    if not f.filename:
        return jsonify({"error": "Empty filename"}), 400

    session_id = str(uuid.uuid4())[:8]
    session_dir = os.path.join(UPLOAD_DIR, "user_" + session_id)
    os.makedirs(session_dir, exist_ok=True)

    filename = secure_filename(f.filename)
    filepath = os.path.join(session_dir, filename)
    f.save(filepath)

    eng = get_engine()
    store_id = "user_" + session_id
    chunks = eng.ingest_file(store_id, filepath)

    text = extract_text(filepath)
    readability = compute_readability(text) if text.strip() else None

    return jsonify({
        "session_id": session_id,
        "filename": filename,
        "chunks": chunks,
        "readability": readability,
    })


@app.route("/api/doc/query", methods=["POST"])
def query_document():
    data = request.get_json(force=True)
    session_id = data.get("session_id", "").strip()
    query = data.get("query", "").strip()

    if not session_id or not query:
        return jsonify({"error": "session_id and query are required"}), 400

    eng = get_engine()
    store_id = "user_" + session_id
    try:
        response = eng.ask(store_id, query, mode="document")
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 429
    return jsonify({"response": response})


@app.route("/api/doc/analyze", methods=["POST"])
def analyze_document():
    data = request.get_json(force=True)
    session_id = data.get("session_id", "").strip()

    if not session_id:
        return jsonify({"error": "session_id is required"}), 400

    eng = get_engine()
    store_id = "user_" + session_id
    try:
        result = eng.auto_analyze(store_id)
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 429
    return jsonify(result)


# ─── External Tool Endpoints ──────────────────────────────────

@app.route("/api/tools/precedents", methods=["POST"])
def tool_precedents():
    data = request.get_json(force=True)
    query = data.get("query", "").strip()
    if not query:
        return jsonify({"error": "query is required"}), 400
    try:
        resp = requests.get(
            "https://www.courtlistener.com/api/rest/v4/search/",
            params={"q": query, "type": "o", "order_by": "score desc"},
            timeout=10,
            headers={"User-Agent": "LegalScope/1.0"},
        )
        results = resp.json().get("results", [])[:3]
        cases = [
            {
                "name": r.get("caseName", "Unknown"),
                "court": r.get("court", ""),
                "date": r.get("dateFiled", ""),
                "snippet": (r.get("snippet", "") or "")[:300],
                "url": "https://www.courtlistener.com" + (r.get("absolute_url") or ""),
            }
            for r in results
        ]
        return jsonify({"cases": cases})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/tools/search", methods=["POST"])
def tool_search():
    api_key = os.environ.get("TAVILY_API_KEY", "")
    if not api_key or api_key == "YOUR_TAVILY_API_KEY_HERE":
        return jsonify({"error": "Tavily API key not configured — add TAVILY_API_KEY to your .env file"}), 400

    data = request.get_json(force=True)
    query = data.get("query", "").strip()
    if not query:
        return jsonify({"error": "query is required"}), 400

    try:
        from tavily import TavilyClient
        client = TavilyClient(api_key=api_key)
        resp = client.search(query, max_results=3)
        return jsonify({"results": resp.get("results", [])})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/tools/statutes", methods=["GET"])
def tool_statutes():
    api_key = os.environ.get("CONGRESS_API_KEY", "")
    if not api_key or api_key == "YOUR_CONGRESS_API_KEY_HERE":
        return jsonify({"error": "Congress API key not configured — add CONGRESS_API_KEY to your .env file"}), 400

    query = request.args.get("q", "").strip()
    if not query:
        return jsonify({"error": "q param is required"}), 400

    try:
        resp = requests.get(
            "https://api.congress.gov/v3/bill",
            params={"query": query, "limit": 3, "api_key": api_key},
            timeout=10,
        )
        bills = resp.json().get("bills", [])[:3]
        return jsonify({"bills": bills})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/tools/translate", methods=["POST"])
def tool_translate():
    data = request.get_json(force=True)
    text = data.get("text", "").strip()
    target_language = data.get("language", "").strip()
    session_id = data.get("session_id", "").strip()

    if not target_language:
        return jsonify({"error": "Target language is required"}), 400

    if not text and session_id:
        eng = get_engine()
        store_id = "user_" + session_id
        store = eng.get_or_create_store(store_id)
        docs = store.query("full document content summary overview")
        if docs:
            text = "\n\n".join(d.page_content for d in docs[:4])

    if not text:
        return jsonify({"error": "No text provided and no document found to translate"}), 400

    if len(text) > 8000:
        text = text[:8000]

    try:
        prompt = translation_prompt(text, target_language)
        translated = generate(prompt, max_tokens=1024)
        return jsonify({"translated": translated, "language": target_language})
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 429


if __name__ == "__main__":
    app.run(debug=True, port=5000)
