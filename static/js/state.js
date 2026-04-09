const AppState = {
  mode: null,           // 'lawyer' | 'user' | null
  currentView: 'home',
  activeProject: null,  // { id, name, description, files }
  userSessionId: null,
  uploadedDocName: null,
  queryCount: 0,
  lastAnalysis: null,
  lastReadability: null,
};

function escapeHtml(text) {
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}

function formatMarkdown(text) {
  let s = escapeHtml(text);
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong class="text-gray-100 font-semibold">$1</strong>');
  s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');
  s = s.replace(/^(\d+)\.\s+/gm, '<span class="text-gray-500 mr-1">$1.</span> ');
  return s;
}
