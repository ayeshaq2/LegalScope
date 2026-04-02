/* ── New Case Form ── */

function toggleNewCaseForm() {
  document.getElementById('new-case-form').classList.toggle('hidden');
}

/* ── Create Project ── */

async function createProject() {
  const name = document.getElementById('new-case-name').value.trim();
  const desc = document.getElementById('new-case-desc').value.trim();

  if (!name) {
    document.getElementById('new-case-name').focus();
    return;
  }

  try {
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description: desc }),
    });
    const project = await res.json();

    if (res.ok) {
      document.getElementById('new-case-name').value = '';
      document.getElementById('new-case-desc').value = '';
      toggleNewCaseForm();
      loadProjects();

      openProject(project);
    }
  } catch (err) {
    alert('Failed to create project. Is the server running?');
  }
}

/* ── Load Projects List ── */

async function loadProjects() {
  try {
    const res = await fetch('/api/projects');
    const data = await res.json();
    renderProjects(data);
  } catch {
    renderProjects([]);
  }
}

function renderProjects(projects) {
  const grid = document.getElementById('projects-list');
  const empty = document.getElementById('projects-empty');

  if (projects.length === 0) {
    grid.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');
  grid.innerHTML = '';

  projects.forEach(p => {
    const card = document.createElement('button');
    card.className = 'glass-card rounded-xl p-5 text-left';
    card.onclick = () => openProject(p);
    card.innerHTML = `
      <div class="flex items-center gap-2.5 mb-3">
        <div class="w-8 h-8 rounded-lg bg-gold-400/10 flex items-center justify-center flex-shrink-0">
          <svg class="w-4 h-4 text-gold-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z"/></svg>
        </div>
        <h3 class="text-[14px] font-semibold text-white truncate">${escapeHtml(p.name)}</h3>
      </div>
      <p class="text-[11px] text-gray-500 leading-relaxed line-clamp-2 mb-3">${escapeHtml(p.description || 'No description')}</p>
      <div class="flex items-center gap-3">
        <span class="text-[10px] text-gray-600 font-medium flex items-center gap-1">
          <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/></svg>
          ${p.files ? p.files.length : 0} files
        </span>
      </div>`;
    grid.appendChild(card);
  });
}

/* ── Open Project ── */

function openProject(project) {
  AppState.activeProject = project;

  document.getElementById('case-title').textContent = project.name;
  document.getElementById('case-desc').textContent = project.description || '';

  const wsBtn = document.getElementById('btn-case-workspace');
  wsBtn.disabled = false;

  showCaseSidebar(project);
  renderCaseFiles(project.files || []);

  switchView('case-workspace');
  switchCaseTab('files');
}
