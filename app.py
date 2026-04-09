import io
import os
import uuid

import requests
from dotenv import load_dotenv
load_dotenv()

# Allow OAuth over HTTP for local development
os.environ.setdefault("OAUTHLIB_INSECURE_TRANSPORT", "1")

from flask import Flask, render_template, request, jsonify, redirect, session, send_file
from werkzeug.utils import secure_filename
from rag import LegalScope, compute_readability, extract_text, translation_prompt, generate

from googleapiclient.discovery import build
from googleapiclient import http as google_http
from google.oauth2.credentials import Credentials
from report_generator import generate_pdf, generate_case_report_pdf, generate_trial_report_pdf

app = Flask(__name__)
app.secret_key = os.environ.get("FLASK_SECRET", os.urandom(24))

GOOGLE_CLIENT_ID     = os.environ.get("CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.environ.get("CLIENT_SECRET", "")
GOOGLE_API_KEY       = os.environ.get("GOOGLE_API_KEY", "")
GOOGLE_REDIRECT_URI  = "http://localhost:5000/auth/google/callback"
GOOGLE_SCOPES        = ["https://www.googleapis.com/auth/drive.readonly"]


GOOGLE_TOKEN_URI = "https://oauth2.googleapis.com/token"

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
        result = eng.ask(project_id, query, mode="case")
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 429
    return jsonify({"response": result["response"], "suggestions": result.get("suggestions", [])})


@app.route("/api/projects/<project_id>/mock_trial", methods=["POST"])
def project_mock_trial(project_id):
    if project_id not in projects:
        return jsonify({"error": "Project not found"}), 404

    data = request.get_json(force=True)
    argument = data.get("argument", "").strip()
    phase = data.get("phase", "opening").strip()
    history = data.get("history", [])

    if not argument:
        return jsonify({"error": "Argument is required"}), 400

    eng = get_engine()
    try:
        result = eng.mock_trial(project_id, argument, phase=phase, history=history)
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 429
    if "error" in result:
        return jsonify(result), 400
    return jsonify(result)


@app.route("/api/projects/<project_id>/report/pdf", methods=["POST"])
def export_case_report(project_id):
    if project_id not in projects:
        return jsonify({"error": "Project not found"}), 404

    data = request.get_json(force=True)
    messages = data.get("messages", [])
    if not messages:
        return jsonify({"error": "No messages to export"}), 400

    project = projects[project_id]
    try:
        pdf_bytes = generate_case_report_pdf(
            case_name=project.get("name", "Case"),
            messages=messages,
            files=project.get("files"),
        )
        safe_name = secure_filename(project.get("name", "case")) or "case"
        return send_file(
            io.BytesIO(pdf_bytes),
            mimetype="application/pdf",
            as_attachment=True,
            download_name=f"{safe_name}_report.pdf",
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/projects/<project_id>/trial/pdf", methods=["POST"])
def export_trial_report(project_id):
    if project_id not in projects:
        return jsonify({"error": "Project not found"}), 404

    data = request.get_json(force=True)
    history = data.get("history", [])
    coaching = data.get("coaching", None)

    if not history:
        return jsonify({"error": "Missing trial data"}), 400

    project = projects[project_id]
    try:
        pdf_bytes = generate_trial_report_pdf(
            case_name=project.get("name", "Case"),
            history=history,
            coaching=coaching,
        )
        safe_name = secure_filename(project.get("name", "case")) or "case"
        return send_file(
            io.BytesIO(pdf_bytes),
            mimetype="application/pdf",
            as_attachment=True,
            download_name=f"{safe_name}_trial.pdf",
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500


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
        result = eng.ask(store_id, query, mode="document")
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 429
    return jsonify({"response": result["response"]})


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


# ─── Google Drive Auth ────────────────────────────────────────


@app.route("/auth/google")
def auth_google():
    from urllib.parse import urlencode
    state = str(uuid.uuid4())
    session["google_oauth_state"] = state
    params = {
        "client_id":     GOOGLE_CLIENT_ID,
        "redirect_uri":  GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope":         " ".join(GOOGLE_SCOPES),
        "access_type":   "offline",
        "prompt":        "consent",
        "state":         state,
    }
    auth_url = "https://accounts.google.com/o/oauth2/auth?" + urlencode(params)
    return redirect(auth_url)


@app.route("/auth/google/callback")
def auth_google_callback():
    code = request.args.get("code")
    if not code:
        return "Authorization failed — no code returned by Google", 400

    token_resp = requests.post(GOOGLE_TOKEN_URI, data={
        "code":          code,
        "client_id":     GOOGLE_CLIENT_ID,
        "client_secret": GOOGLE_CLIENT_SECRET,
        "redirect_uri":  GOOGLE_REDIRECT_URI,
        "grant_type":    "authorization_code",
    })
    if token_resp.status_code != 200:
        return f"Token exchange failed: {token_resp.text}", 400

    tokens = token_resp.json()
    session["google_token"] = {
        "token":          tokens["access_token"],
        "refresh_token":  tokens.get("refresh_token"),
        "token_uri":      GOOGLE_TOKEN_URI,
        "client_id":      GOOGLE_CLIENT_ID,
        "client_secret":  GOOGLE_CLIENT_SECRET,
        "scopes":         GOOGLE_SCOPES,
    }
    return redirect("/?drive=ready")


@app.route("/auth/google/status")
def auth_google_status():
    token = session.get("google_token")
    return jsonify({
        "authenticated": token is not None,
        "access_token":  token["token"] if token else None,
        "api_key":       GOOGLE_API_KEY,
    })


@app.route("/auth/google/logout", methods=["POST"])
def auth_google_logout():
    session.pop("google_token", None)
    return jsonify({"ok": True})


@app.route("/api/doc/import-drive", methods=["POST"])
def import_drive_file():
    token_data = session.get("google_token")
    if not token_data:
        return jsonify({"error": "Not authenticated with Google Drive"}), 401

    data      = request.get_json(force=True)
    file_id   = data.get("file_id", "").strip()
    file_name = data.get("file_name", "document").strip()
    mime_type = data.get("mime_type", "")

    if not file_id:
        return jsonify({"error": "file_id is required"}), 400

    try:
        creds = Credentials(
            token=token_data["token"],
            refresh_token=token_data.get("refresh_token"),
            token_uri=token_data["token_uri"],
            client_id=token_data["client_id"],
            client_secret=token_data["client_secret"],
            scopes=token_data.get("scopes"),
        )
        service = build("drive", "v3", credentials=creds)

        # Google Docs/Sheets/Slides must be exported as PDF
        if "google-apps" in mime_type:
            req = service.files().export_media(fileId=file_id, mimeType="application/pdf")
            file_name = file_name.rsplit(".", 1)[0] + ".pdf"
        else:
            req = service.files().get_media(fileId=file_id)

        buf = io.BytesIO()
        downloader = google_http.MediaIoBaseDownload(buf, req)
        done = False
        while not done:
            _, done = downloader.next_chunk()

        session_id  = str(uuid.uuid4())[:8]
        session_dir = os.path.join(UPLOAD_DIR, "user_" + session_id)
        os.makedirs(session_dir, exist_ok=True)

        safe_name = secure_filename(file_name) or "document.pdf"
        filepath  = os.path.join(session_dir, safe_name)
        with open(filepath, "wb") as f:
            f.write(buf.getvalue())

        eng      = get_engine()
        store_id = "user_" + session_id
        chunks   = eng.ingest_file(store_id, filepath)
        text     = extract_text(filepath)
        readability = compute_readability(text) if text.strip() else None

        return jsonify({
            "session_id":   session_id,
            "filename":     safe_name,
            "chunks":       chunks,
            "readability":  readability,
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/projects/<project_id>/import-drive", methods=["POST"])
def import_drive_to_project(project_id):
    if project_id not in projects:
        return jsonify({"error": "Project not found"}), 404

    token_data = session.get("google_token")
    if not token_data:
        return jsonify({"error": "Not authenticated with Google Drive"}), 401

    data      = request.get_json(force=True)
    file_id   = data.get("file_id", "").strip()
    file_name = data.get("file_name", "document").strip()
    mime_type = data.get("mime_type", "")

    if not file_id:
        return jsonify({"error": "file_id is required"}), 400

    try:
        creds = Credentials(
            token=token_data["token"],
            refresh_token=token_data.get("refresh_token"),
            token_uri=token_data["token_uri"],
            client_id=token_data["client_id"],
            client_secret=token_data["client_secret"],
            scopes=token_data.get("scopes"),
        )
        service = build("drive", "v3", credentials=creds)

        if "google-apps" in mime_type:
            req = service.files().export_media(fileId=file_id, mimeType="application/pdf")
            file_name = file_name.rsplit(".", 1)[0] + ".pdf"
        else:
            req = service.files().get_media(fileId=file_id)

        buf = io.BytesIO()
        downloader = google_http.MediaIoBaseDownload(buf, req)
        done = False
        while not done:
            _, done = downloader.next_chunk()

        project_dir = os.path.join(UPLOAD_DIR, project_id)
        os.makedirs(project_dir, exist_ok=True)

        safe_name = secure_filename(file_name) or "document.pdf"
        filepath  = os.path.join(project_dir, safe_name)
        with open(filepath, "wb") as f:
            f.write(buf.getvalue())

        eng    = get_engine()
        chunks = eng.ingest_file(project_id, filepath)
        file_info = {"name": safe_name, "chunks": chunks}
        projects[project_id]["files"].append(file_info)

        return jsonify({"file": file_info, "project": projects[project_id]})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ─── Report Export ────────────────────────────────────────────

@app.route("/api/doc/report/pdf", methods=["POST"])
def export_pdf_report():
    data = request.get_json(force=True)
    analysis = data.get("analysis", "").strip()
    filename = data.get("filename", "document").strip()
    readability = data.get("readability", None)

    if not analysis:
        return jsonify({"error": "No analysis text provided"}), 400

    try:
        pdf_bytes = generate_pdf(analysis, filename=filename, readability=readability)
        safe_name = secure_filename(filename.rsplit(".", 1)[0]) or "document"
        return send_file(
            io.BytesIO(pdf_bytes),
            mimetype="application/pdf",
            as_attachment=True,
            download_name=f"{safe_name}_analysis.pdf",
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500


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


@app.route("/api/tools/regulations", methods=["GET"])
def tool_regulations():
    query = request.args.get("q", "").strip()
    if not query:
        return jsonify({"error": "q param is required"}), 400

    try:
        resp = requests.get(
            "https://www.federalregister.gov/api/v1/documents.json",
            params={
                "conditions[term]": query,
                "per_page": 5,
                "order": "relevance",
                "fields[]": ["title", "abstract", "document_number",
                             "html_url", "publication_date", "type",
                             "agencies"],
            },
            timeout=10,
        )
        data = resp.json()
        results = []
        for doc in data.get("results", [])[:5]:
            agencies = ", ".join(
                a.get("name", "") for a in (doc.get("agencies") or [])
            ) or "Unknown Agency"
            results.append({
                "title": doc.get("title", "Untitled"),
                "url": doc.get("html_url", ""),
                "date": doc.get("publication_date", ""),
                "type": doc.get("type", ""),
                "agency": agencies,
                "abstract": (doc.get("abstract") or "")[:250],
            })
        return jsonify({"regulations": results})
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
