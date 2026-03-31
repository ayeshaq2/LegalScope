# LegalScope — Legal Document Analysis & Case Preparation Assistant

AI-powered legal document analysis system that uses Retrieval-Augmented Generation (RAG) to help legal professionals review contracts, identify risks, and generate structured reports.

## Prerequisites

- **Python 3.9+** — [Download](https://www.python.org/downloads/)
- **pip** — comes with Python

## Setup

1. **Clone the repo**

   ```bash
   git clone https://github.com/ayeshaq2/LegalScope.git
   cd LegalScope
   ```

2. **Install dependencies**

   ```bash
   pip3 install -r requirements.txt
   ```

3. **Run the app**

   ```bash
   python3 app.py
   ```

4. **Open in browser**

   Go to **http://127.0.0.1:5000**

## Project Structure

```
LegalScope/
├── app.py                          # Flask server (entry point)
├── requirements.txt                # Python dependencies
├── README.md
│
├── templates/
│   ├── base.html                   # Master layout (head, scripts, assembles components)
│   ├── index.html                  # Page route (extends base.html)
│   └── components/
│       ├── navbar.html             # Top navigation bar + view toggle
│       ├── sidebar.html            # Left panel: documents, context, workflow
│       ├── upload.html             # Upload view: drop zone, doc type, focus options
│       ├── analyze.html            # Chat view: messages, suggestions, input bar
│       └── report.html             # Report view: risk scores, clauses, obligations
│
├── static/
│   ├── css/
│   │   └── custom.css              # Custom styles (glassmorphism, animations)
│   ├── js/
│   │   ├── state.js                # Global app state (shared across modules)
│   │   ├── upload.js               # File upload, doc type selection, begin analysis
│   │   ├── chat.js                 # Chat messages, send, suggestion chips
│   │   ├── workflow.js             # Multi-step workflow indicator
│   │   ├── sidebar.js              # Sidebar document list + context updates
│   │   └── main.js                 # View switching + app initialization
│   └── assets/                     # Images, icons, etc.
```

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML, Tailwind CSS (CDN), vanilla JavaScript |
| Backend | Flask (Python) |
| RAG Framework | LangChain (TODO) |
| LLM | OpenAI / Claude API (TODO) |
| Vector DB | FAISS (TODO) |
| Embeddings | OpenAI text-embedding-ada-002 (TODO) |

## Team Responsibilities

| Area | Files | Description |
|---|---|---|
| Backend / RAG | `app.py`, `rag/` (to be created) | API endpoints, LangChain pipeline, FAISS, embeddings |
| Upload & Processing | `upload.html`, `upload.js` | Wire file upload to API, real document processing |
| Chat & Analysis | `analyze.html`, `chat.js` | Wire chat to API, display LLM responses with citations |
| Report & Output | `report.html`, `sidebar.js`, `workflow.js` | Populate report from API, export PDF, update context |

## Notes

- Tailwind CSS is loaded via CDN — no build step required
- The Flask server runs in debug mode with auto-reload
- All current data in the UI is placeholder/mock — backend integration is next
