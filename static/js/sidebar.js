/*
 * ═══════════════════════════════════════════════════════
 *  SIDEBAR.JS — Sidebar document list & context display
 * ═══════════════════════════════════════════════════════
 *
 *  Handles:
 *   - Rendering the document list in sidebar
 *   - Updating the session context panel
 *   - Document count badge
 *
 *  Depends on: state.js
 *
 *  TODO (backend):
 *   - Refresh context from /api/session/context
 *   - Show real-time risk level after analysis
 *   - Show extracted clauses count
 */

function updateSidebarDocs() {
  const docList = document.getElementById('doc-list');
  const docCount = document.getElementById('doc-count');

  if (AppState.documents.length > 0) {
    docList.innerHTML = '';
    AppState.documents.forEach(d => {
      const el = document.createElement('div');
      el.className = 'flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-white/[0.03] cursor-pointer transition-all';
      el.innerHTML = `
        <div class="w-5 h-5 rounded bg-red-500/10 flex items-center justify-center flex-shrink-0">
          <span class="text-[6px] font-black text-red-400">PDF</span>
        </div>
        <span class="text-[11px] text-gray-400 truncate font-medium">${d.name}</span>`;
      docList.appendChild(el);
    });
  } else {
    docList.innerHTML = '<p class="text-[11px] text-gray-600 italic py-1">No documents uploaded</p>';
  }

  docCount.textContent = AppState.documents.length;
}

function updateSessionContext(key, value) {
  const el = document.getElementById(`ctx-${key}`);
  if (el) el.textContent = value;
}
