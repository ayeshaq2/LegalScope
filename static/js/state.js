const AppState = {
  mode: null,           // 'lawyer' | 'user' | null
  currentView: 'home',
  activeProject: null,  // { id, name, description, files }
  userSessionId: null,
  uploadedDocName: null,
  queryCount: 0,
};

function escapeHtml(text) {
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}
