/* ═══════════════════════════════════════════════════════
 *  CASE_WORKSPACE.JS — Case workspace (Files / Analyze / Mock Trial)
 * ═══════════════════════════════════════════════════════ */

/* ── Tab Switching ── */

function switchCaseTab(tab) {
  document.querySelectorAll('.case-tab-content').forEach(el => {
    el.classList.add('hidden');
    el.classList.remove('flex');
  });

  const target = document.getElementById('case-tab-' + tab);
  if (target) {
    target.classList.remove('hidden');
    target.classList.add('flex');
  }

  ['files', 'analyze', 'trial'].forEach(t => {
    const btn = document.getElementById('case-tab-btn-' + t);
    if (btn) btn.classList.remove('active-view');
  });
  const activeBtn = document.getElementById('case-tab-btn-' + tab);
  if (activeBtn) activeBtn.classList.add('active-view');
}


/* ═══ FILES TAB ═══ */

const caseDropZone = document.getElementById('case-drop-zone');
const caseFileInput = document.getElementById('case-file-input');

if (caseDropZone) {
  caseDropZone.addEventListener('dragover', e => {
    e.preventDefault();
    caseDropZone.classList.add('drop-zone-active');
  });
  caseDropZone.addEventListener('dragleave', () => {
    caseDropZone.classList.remove('drop-zone-active');
  });
  caseDropZone.addEventListener('drop', e => {
    e.preventDefault();
    caseDropZone.classList.remove('drop-zone-active');
    uploadCaseFiles(e.dataTransfer.files);
  });
}

if (caseFileInput) {
  caseFileInput.addEventListener('change', e => uploadCaseFiles(e.target.files));
}

async function uploadCaseFiles(files) {
  if (!AppState.activeProject) return;
  if (!files.length) return;

  const progress = document.getElementById('case-upload-progress');
  progress.classList.remove('hidden');

  const formData = new FormData();
  for (const f of files) formData.append('files', f);

  try {
    const res = await fetch(`/api/projects/${AppState.activeProject.id}/upload`, {
      method: 'POST',
      body: formData,
    });
    const data = await res.json();

    if (res.ok) {
      AppState.activeProject = data.project;
      renderCaseFiles(data.project.files);
      updateSidebarFiles(data.project.files);
    } else {
      alert(data.error || 'Upload failed');
    }
  } catch {
    alert('Connection error — is the server running?');
  } finally {
    progress.classList.add('hidden');
    caseFileInput.value = '';
  }
}

function renderCaseFiles(files) {
  const list = document.getElementById('case-file-list');
  const empty = document.getElementById('case-files-empty');

  if (!files.length) {
    list.innerHTML = '';
    list.appendChild(empty);
    empty.style.display = '';
    return;
  }

  list.innerHTML = '';
  files.forEach(f => {
    const el = document.createElement('div');
    el.className = 'file-item';
    el.innerHTML = `
      <div class="w-6 h-6 rounded-md bg-red-500/10 flex items-center justify-center flex-shrink-0">
        <span class="text-[7px] font-black text-red-400">PDF</span>
      </div>
      <span class="text-[12px] text-gray-300 flex-1 truncate font-medium">${escapeHtml(f.name)}</span>
      <span class="text-[10px] text-gray-600 font-medium">${f.chunks || 0} chunks</span>`;
    list.appendChild(el);
  });
}


/* ═══ ANALYZE TAB ═══ */

const caseChatHistory = [];

function insertCaseQuery(text) {
  const input = document.getElementById('case-chat-input');
  input.value = text;
  input.focus();
}

async function sendCaseMessage() {
  const input = document.getElementById('case-chat-input');
  const text = input.value.trim();
  if (!text || !AppState.activeProject) return;

  incrementQueryCount();
  const box = document.getElementById('case-chat-messages');

  // User bubble
  const userMsg = document.createElement('div');
  userMsg.className = 'flex gap-3 max-w-3xl ml-auto flex-row-reverse';
  userMsg.innerHTML = `
    <div class="w-8 h-8 rounded-lg bg-navy-800 border border-white/[0.06] flex-shrink-0 flex items-center justify-center">
      <svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"/></svg>
    </div>
    <div class="flex-1 text-right">
      <div class="flex items-center gap-2 mb-1.5 justify-end">
        <span class="text-[9px] text-gray-600 font-medium">just now</span>
        <span class="text-[12px] font-bold text-white">You</span>
      </div>
      <div class="chat-bubble-user rounded-2xl rounded-tr-md p-4 text-left">
        <p class="text-[13px] text-gray-200">${escapeHtml(text)}</p>
      </div>
    </div>`;
  box.appendChild(userMsg);
  input.value = '';

  // Loader
  const loader = document.createElement('div');
  loader.id = 'case-chat-loader';
  loader.className = 'flex gap-3 max-w-3xl';
  loader.innerHTML = `
    <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-gold-400 to-gold-600 flex-shrink-0 flex items-center justify-center pulse-gold shadow-lg shadow-gold-400/10">
      <svg class="w-4 h-4 text-navy-950" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"/></svg>
    </div>
    <div class="flex-1">
      <div class="chat-bubble-ai rounded-2xl rounded-tl-md p-5">
        <div class="flex items-center gap-3">
          <div class="flex gap-1">
            <div class="w-1.5 h-1.5 rounded-full bg-gold-400/70 animate-bounce" style="animation-delay:0ms"></div>
            <div class="w-1.5 h-1.5 rounded-full bg-gold-400/70 animate-bounce" style="animation-delay:150ms"></div>
            <div class="w-1.5 h-1.5 rounded-full bg-gold-400/70 animate-bounce" style="animation-delay:300ms"></div>
          </div>
          <span class="text-[11px] text-gray-600">Analyzing case documents …</span>
        </div>
      </div>
    </div>`;
  box.appendChild(loader);
  box.scrollTop = box.scrollHeight;

  caseChatHistory.push({ role: 'user', text });

  try {
    const res = await fetch(`/api/projects/${AppState.activeProject.id}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: text }),
    });
    const data = await res.json();
    const ld = document.getElementById('case-chat-loader');
    if (ld) ld.remove();

    const reply = data.response || data.error || 'No response.';
    caseChatHistory.push({ role: 'ai', text: reply });
    appendAiMessage(box, reply, 'gold');

    const pdfBtn = document.getElementById('btn-export-case-pdf');
    if (pdfBtn) pdfBtn.classList.remove('hidden');
  } catch {
    const ld = document.getElementById('case-chat-loader');
    if (ld) ld.remove();
    appendAiMessage(box, 'Connection error — is the server running?', 'gold', true);
  }
}

// Shared AI message bubble renderer
function appendAiMessage(container, text, color, isError) {
  const gradFrom = color === 'gold' ? 'from-gold-400' : 'from-blue-400';
  const gradTo = color === 'gold' ? 'to-gold-600' : 'to-blue-600';
  const textColor = isError ? 'text-red-400/80' : 'text-gray-300';

  const msg = document.createElement('div');
  msg.className = 'flex gap-3 max-w-3xl';
  msg.innerHTML = `
    <div class="w-8 h-8 rounded-lg bg-gradient-to-br ${gradFrom} ${gradTo} flex-shrink-0 flex items-center justify-center shadow-lg">
      <svg class="w-4 h-4 text-navy-950" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"/></svg>
    </div>
    <div class="flex-1">
      <div class="flex items-center gap-2 mb-1.5">
        <span class="text-[12px] font-bold text-white">LegalScope</span>
        <span class="text-[9px] text-gray-600 font-medium">just now</span>
      </div>
      <div class="chat-bubble-ai rounded-2xl rounded-tl-md p-5">
        <p class="text-[13px] ${textColor} leading-relaxed whitespace-pre-wrap">${escapeHtml(text)}</p>
      </div>
    </div>`;
  container.appendChild(msg);
  container.scrollTop = container.scrollHeight;
}

// Enter to send
const caseChatInput = document.getElementById('case-chat-input');
if (caseChatInput) {
  caseChatInput.addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 160) + 'px';
  });
  caseChatInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendCaseMessage();
    }
  });
}


/* ── Export Case Report PDF ── */

async function exportCaseReportPDF() {
  if (!AppState.activeProject || !caseChatHistory.length) {
    alert('No analysis to export yet. Ask some questions first.');
    return;
  }

  const btn = document.getElementById('btn-export-case-pdf');
  const originalHTML = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>`;

  try {
    const res = await fetch(`/api/projects/${AppState.activeProject.id}/report/pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: caseChatHistory }),
    });

    if (!res.ok) {
      const err = await res.json();
      alert(err.error || 'Failed to generate PDF');
      return;
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (AppState.activeProject.name || 'case') + '_report.pdf';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch {
    alert('Connection error — could not generate PDF.');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHTML;
  }
}


/* ═══ MOCK TRIAL TAB ═══ */

let lastTrialData = null;

async function runCaseTrial() {
  const argument = document.getElementById('case-trial-argument').value.trim();
  if (!argument || !AppState.activeProject) return;

  document.getElementById('case-trial-results').classList.add('hidden');
  document.getElementById('case-trial-loading').classList.remove('hidden');

  try {
    const res = await fetch(`/api/projects/${AppState.activeProject.id}/mock_trial`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ argument }),
    });
    const data = await res.json();

    document.getElementById('case-trial-loading').classList.add('hidden');

    if (res.ok) {
      lastTrialData = { plaintiff: data.plaintiff, defense: data.defense, ruling: data.ruling };
      document.getElementById('case-trial-plaintiff').textContent = data.plaintiff;
      document.getElementById('case-trial-defense').textContent = data.defense;
      document.getElementById('case-trial-ruling').textContent = data.ruling;
      document.getElementById('case-trial-results').classList.remove('hidden');
    } else {
      alert(data.error || 'Mock trial failed.');
    }
  } catch {
    document.getElementById('case-trial-loading').classList.add('hidden');
    alert('Connection error — is the server running?');
  }
}

function resetCaseTrial() {
  document.getElementById('case-trial-results').classList.add('hidden');
  document.getElementById('case-trial-argument').value = '';
  document.getElementById('case-trial-argument').focus();
}

async function exportTrialReportPDF() {
  if (!AppState.activeProject || !lastTrialData) {
    alert('No trial results to export. Run a mock trial first.');
    return;
  }

  try {
    const res = await fetch(`/api/projects/${AppState.activeProject.id}/trial/pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(lastTrialData),
    });

    if (!res.ok) {
      const err = await res.json();
      alert(err.error || 'Failed to generate PDF');
      return;
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (AppState.activeProject.name || 'case') + '_trial.pdf';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch {
    alert('Connection error — could not generate PDF.');
  }
}
