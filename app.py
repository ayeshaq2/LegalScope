import os
import uuid

from flask import Flask, render_template, request, jsonify
from werkzeug.utils import secure_filename
from rag import LegalScope

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
    response = eng.ask(project_id, query, mode="case")
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
    result = eng.mock_trial(project_id, argument)
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

    return jsonify({
        "session_id": session_id,
        "filename": filename,
        "chunks": chunks,
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
    response = eng.ask(store_id, query, mode="document")
    return jsonify({"response": response})


if __name__ == "__main__":
    app.run(debug=True, port=5000)
