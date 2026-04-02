function updateSidebarMode(label, color) {
  document.getElementById('sidebar-mode-text').textContent = label;
}

function hideSidebarSections() {
  document.getElementById('sidebar-case-section').classList.add('hidden');
  document.getElementById('sidebar-files-section').classList.add('hidden');
  document.getElementById('sidebar-doc-section').classList.add('hidden');
}

function showCaseSidebar(project) {
  hideSidebarSections();
  document.getElementById('sidebar-case-section').classList.remove('hidden');
  document.getElementById('sidebar-files-section').classList.remove('hidden');
  document.getElementById('sidebar-case-name').textContent = project.name;
  document.getElementById('sidebar-case-desc').textContent = project.description || '';
  updateSidebarFiles(project.files || []);
}

function updateSidebarFiles(files) {
  const list = document.getElementById('sidebar-file-list');
  const count = document.getElementById('sidebar-file-count');
  count.textContent = files.length;

  if (files.length === 0) {
    list.innerHTML = '<p class="text-[11px] text-gray-600 italic py-1">No files uploaded</p>';
    return;
  }

  list.innerHTML = '';
  files.forEach(f => {
    const el = document.createElement('div');
    el.className = 'flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-white/[0.03] transition-all';
    el.innerHTML = `
      <div class="w-5 h-5 rounded bg-red-500/10 flex items-center justify-center flex-shrink-0">
        <span class="text-[6px] font-black text-red-400">PDF</span>
      </div>
      <span class="text-[11px] text-gray-400 truncate font-medium">${escapeHtml(f.name)}</span>`;
    list.appendChild(el);
  });
}

function showDocSidebar(filename) {
  hideSidebarSections();
  document.getElementById('sidebar-doc-section').classList.remove('hidden');
  document.getElementById('sidebar-doc-name').textContent = filename;
}

function incrementQueryCount() {
  AppState.queryCount++;
  document.getElementById('sidebar-queries').textContent = AppState.queryCount;
}
