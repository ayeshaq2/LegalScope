/* ── Mode Selection ── */

function selectMode(mode) {
  AppState.mode = mode;

  document.getElementById('nav-lawyer').classList.add('hidden');
  document.getElementById('nav-user').classList.add('hidden');

  if (mode === 'lawyer') {
    document.getElementById('nav-lawyer').classList.remove('hidden');
    updateSidebarMode('Case Preparation', 'gold');
    switchView('projects');
  } else {
    document.getElementById('nav-user').classList.remove('hidden');
    updateSidebarMode('Document Analysis', 'blue');
    switchView('doc-upload');
  }

  document.getElementById('tools-toggle-btn')?.classList.remove('hidden');
  closeToolsPanel();
}

function goHome() {
  AppState.mode = null;
  AppState.activeProject = null;

  document.getElementById('nav-lawyer').classList.add('hidden');
  document.getElementById('nav-user').classList.add('hidden');

  document.getElementById('tools-toggle-btn')?.classList.add('hidden');
  closeToolsPanel();

  updateSidebarMode('Welcome', 'gray');
  hideSidebarSections();
  switchView('home');
}

/* ── View Switching ── */

function switchView(view) {
  document.querySelectorAll('.view-panel').forEach(el => {
    el.classList.add('hidden');
    el.classList.remove('flex');
  });

  const target = document.getElementById('view-' + view);
  if (target) {
    target.classList.remove('hidden');
    target.classList.add('flex');
  }

  // Update nav button highlights
  document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active-view'));

  const btnMap = {
    'home': null,
    'projects': 'btn-projects',
    'case-workspace': 'btn-case-workspace',
    'doc-upload': 'btn-doc-upload',
    'doc-chat': 'btn-doc-chat',
  };
  const btnId = btnMap[view];
  if (btnId) {
    const btn = document.getElementById(btnId);
    if (btn) btn.classList.add('active-view');
  }

  AppState.currentView = view;
}

/* ── Init ── */

document.addEventListener('DOMContentLoaded', () => {
  switchView('home');
});
