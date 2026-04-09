/* ═══════════════════════════════════════════════════════
 *  CASE_WORKSPACE.JS — Case workspace (Files / Analyze / Mock Trial)
 * ═══════════════════════════════════════════════════════ */

/* ── Google Drive Import for Case Projects ── */

async function openCaseDrivePicker() {
  if (!AppState.activeProject) {
    alert('Please open a case project first.');
    return;
  }
  if (!_driveAccessToken) {
    window.location.href = '/auth/google';
    return;
  }
  if (!_pickerApiLoaded) {
    gapi.load('picker', { callback: () => { _pickerApiLoaded = true; _buildCasePicker(); } });
  } else {
    _buildCasePicker();
  }
}

function _buildCasePicker() {
  const view = new google.picker.DocsView()
    .setIncludeFolders(false)
    .setMimeTypes('application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,application/vnd.google-apps.document');

  const picker = new google.picker.PickerBuilder()
    .setTitle('Select files for your case')
    .setOAuthToken(_driveAccessToken)
    .setDeveloperKey(_driveApiKey)
    .addView(view)
    .setCallback(_onCasePickerSelected)
    .build();

  picker.setVisible(true);
}

async function _onCasePickerSelected(data) {
  if (data[google.picker.Response.ACTION] !== google.picker.Action.PICKED) return;
  if (!AppState.activeProject) return;

  const file     = data[google.picker.Response.DOCUMENTS][0];
  const fileId   = file[google.picker.Document.ID];
  const fileName = file[google.picker.Document.NAME];
  const mimeType = file[google.picker.Document.MIME_TYPE];

  const progress = document.getElementById('case-drive-import-progress');
  if (progress) progress.classList.remove('hidden');

  try {
    const res = await fetch(`/api/projects/${AppState.activeProject.id}/import-drive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_id: fileId, file_name: fileName, mime_type: mimeType }),
    });
    const result = await res.json();

    if (progress) progress.classList.add('hidden');

    if (res.ok) {
      AppState.activeProject = result.project;
      renderCaseFiles(result.project.files);
      updateSidebarFiles(result.project.files);
    } else {
      alert(result.error || 'Import failed.');
    }
  } catch {
    if (progress) progress.classList.add('hidden');
    alert('Connection error — is the server running?');
  }
}


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
    appendAiMessage(box, reply, 'gold', false, data.suggestions);

    const pdfBtn = document.getElementById('btn-export-case-pdf');
    if (pdfBtn) pdfBtn.classList.remove('hidden');
  } catch {
    const ld = document.getElementById('case-chat-loader');
    if (ld) ld.remove();
    appendAiMessage(box, 'Connection error — is the server running?', 'gold', true);
  }
}

// Shared AI message bubble renderer
function appendAiMessage(container, text, color, isError, suggestions) {
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
        <p class="text-[13px] ${textColor} leading-relaxed whitespace-pre-wrap">${isError ? escapeHtml(text) : formatMarkdown(text)}</p>
      </div>
    </div>`;
  container.appendChild(msg);

  if (suggestions && suggestions.length) {
    const chipsRow = document.createElement('div');
    chipsRow.className = 'flex flex-wrap gap-2 ml-11 mt-2';
    suggestions.forEach(q => {
      const chip = document.createElement('button');
      chip.className = 'text-[11px] px-3 py-1.5 rounded-full border border-gold-400/20 bg-gold-400/[0.06] text-gold-400 hover:bg-gold-400/[0.12] hover:border-gold-400/40 transition-all duration-200 cursor-pointer';
      chip.textContent = q;
      chip.addEventListener('click', () => {
        insertCaseQuery(q);
        sendCaseMessage();
      });
      chipsRow.appendChild(chip);
    });
    container.appendChild(chipsRow);
  }

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

let trialPhase = 'opening';
let trialHistory = [];
let lastTrialData = null;

const PHASE_CONFIG = {
  opening:  { label: 'Phase 1 — Opening Argument (Plaintiff)', btn: 'Submit Opening',  next: 'rebuttal', loading: 'Opposing counsel is preparing a response …' },
  rebuttal: { label: 'Phase 2 — Rebuttal (Plaintiff)',         btn: 'Submit Rebuttal',  next: 'closing',  loading: 'Defense is countering your rebuttal …' },
  closing:  { label: 'Phase 3 — Closing Statement (Plaintiff)', btn: 'Submit Closing',  next: null,        loading: 'The judge is deliberating …' },
};

function _updateStepIndicator(activePhase) {
  const phases = ['opening', 'rebuttal', 'closing'];
  const activeIdx = phases.indexOf(activePhase);
  phases.forEach((p, i) => {
    const step = document.getElementById('trial-step-' + p);
    if (!step) return;
    const dot = step.querySelector('div');
    const txt = step.querySelector('span');
    if (i <= activeIdx) {
      dot.className = 'w-7 h-7 rounded-full bg-gold-400 text-navy-950 flex items-center justify-center text-[11px] font-bold flex-shrink-0';
      txt.className = 'text-[11px] font-semibold text-gold-400';
    } else {
      dot.className = 'w-7 h-7 rounded-full bg-white/[0.06] text-gray-600 flex items-center justify-center text-[11px] font-bold flex-shrink-0';
      txt.className = 'text-[11px] font-semibold text-gray-600';
    }
  });
}

function _renderCoachingCard(coaching) {
  if (!coaching || !coaching.score) return '';
  const score = coaching.score;
  let scoreColor = 'text-red-400 bg-red-500/10 border-red-400/20';
  if (score >= 8) scoreColor = 'text-green-400 bg-green-500/10 border-green-400/20';
  else if (score >= 5) scoreColor = 'text-yellow-400 bg-yellow-500/10 border-yellow-400/20';

  const listItems = (arr, icon) => (arr || []).map(t =>
    `<li class="flex items-start gap-2 text-[11px] text-gray-400 leading-relaxed"><span class="flex-shrink-0 mt-0.5">${icon}</span>${escapeHtml(t)}</li>`
  ).join('');

  return `
    <div class="report-card p-5 rounded-xl border border-gold-400/10 bg-gold-400/[0.02]">
      <div class="flex items-center gap-3 mb-4">
        <svg class="w-4 h-4 text-gold-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 0v-3.675A55.378 55.378 0 0 1 12 8.443m-7.007 11.55A5.981 5.981 0 0 0 6.75 15.75v-1.5"/></svg>
        <span class="text-[12px] font-bold text-gold-400">Coach Feedback</span>
        <span class="ml-auto text-[13px] font-bold px-2.5 py-0.5 rounded-md border ${scoreColor}">${score}/10</span>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <p class="text-[10px] font-bold text-green-400/80 uppercase tracking-wide mb-2">Strengths</p>
          <ul class="space-y-1.5">${listItems(coaching.strengths, '<span class="text-green-400">+</span>')}</ul>
        </div>
        <div>
          <p class="text-[10px] font-bold text-red-400/80 uppercase tracking-wide mb-2">Weaknesses</p>
          <ul class="space-y-1.5">${listItems(coaching.weaknesses, '<span class="text-red-400">-</span>')}</ul>
        </div>
        <div>
          <p class="text-[10px] font-bold text-blue-400/80 uppercase tracking-wide mb-2">Tips</p>
          <ul class="space-y-1.5">${listItems(coaching.tips, '<span class="text-blue-400">&rarr;</span>')}</ul>
        </div>
        <div>
          <p class="text-[10px] font-bold text-orange-400/80 uppercase tracking-wide mb-2">Missing Elements</p>
          <ul class="space-y-1.5">${listItems(coaching.missing, '<span class="text-orange-400">!</span>')}</ul>
        </div>
      </div>
    </div>`;
}

function _appendRound(phase, argument, response, coaching, responseLabel) {
  const timeline = document.getElementById('trial-timeline');
  const phaseTitle = phase === 'opening' ? 'Opening Argument' : phase === 'rebuttal' ? 'Rebuttal' : 'Closing Statement';

  const round = document.createElement('div');
  round.className = 'space-y-4';
  round.innerHTML = `
    <div class="report-card p-5 rounded-xl">
      <h3 class="text-[12px] font-bold text-white mb-3 flex items-center gap-2">
        <span class="text-[9px] font-semibold text-blue-400 bg-blue-500/10 px-2 py-[2px] rounded-md uppercase tracking-wide">Plaintiff</span>
        ${escapeHtml(phaseTitle)}
      </h3>
      <div class="text-[13px] text-gray-300 leading-relaxed whitespace-pre-wrap">${formatMarkdown(argument)}</div>
    </div>
    <div class="report-card p-5 rounded-xl">
      <h3 class="text-[12px] font-bold text-white mb-3 flex items-center gap-2">
        <span class="text-[9px] font-semibold ${responseLabel === 'Judge' ? 'text-gold-400 bg-gold-400/10' : 'text-red-400 bg-red-500/10'} px-2 py-[2px] rounded-md uppercase tracking-wide">${responseLabel}</span>
        ${responseLabel === 'Judge' ? 'Judicial Ruling' : 'Opposing Counsel'}
      </h3>
      <div class="text-[13px] text-gray-300 leading-relaxed whitespace-pre-wrap">${formatMarkdown(response)}</div>
    </div>
    ${_renderCoachingCard(coaching)}`;
  timeline.appendChild(round);
}

async function runCaseTrial() {
  const textarea = document.getElementById('case-trial-argument');
  const argument = textarea.value.trim();
  if (!argument || !AppState.activeProject) return;

  const config = PHASE_CONFIG[trialPhase];
  const loading = document.getElementById('case-trial-loading');
  const loadingText = document.getElementById('trial-loading-text');
  const inputArea = document.getElementById('trial-input-area');

  loadingText.textContent = config.loading;
  loading.classList.remove('hidden');
  inputArea.classList.add('hidden');

  try {
    const res = await fetch(`/api/projects/${AppState.activeProject.id}/mock_trial`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ argument, phase: trialPhase, history: trialHistory }),
    });
    const data = await res.json();
    loading.classList.add('hidden');

    if (!res.ok) {
      inputArea.classList.remove('hidden');
      alert(data.error || 'Mock trial failed.');
      return;
    }

    trialHistory.push({ role: 'plaintiff', phase: trialPhase, text: argument });

    if (trialPhase === 'closing') {
      trialHistory.push({ role: 'judge', phase: 'closing', text: data.ruling });
      _appendRound('closing', argument, data.ruling, data.coaching, 'Judge');

      lastTrialData = { history: trialHistory, coaching: data.coaching };
      document.getElementById('trial-final-actions').classList.remove('hidden');
      _updateStepIndicator('closing');
    } else {
      trialHistory.push({ role: 'defense', phase: trialPhase, text: data.defense });
      const label = trialPhase === 'opening' ? 'Opening Argument' : 'Rebuttal';
      _appendRound(trialPhase, argument, data.defense, data.coaching, 'Defense');

      trialPhase = config.next;
      const nextConfig = PHASE_CONFIG[trialPhase];
      _updateStepIndicator(trialPhase);

      document.getElementById('trial-input-label').textContent = nextConfig.label;
      document.getElementById('btn-case-trial').textContent = nextConfig.btn;
      document.getElementById('btn-skip-to-ruling').classList.remove('hidden');
      document.getElementById('trial-suggestion-chips').classList.add('hidden');
      textarea.value = '';
      textarea.placeholder = trialPhase === 'rebuttal'
        ? 'Address the defense\'s counterarguments …'
        : 'Present your closing statement …';
      inputArea.classList.remove('hidden');
      textarea.focus();
    }

    const container = document.getElementById('case-tab-trial');
    container.scrollTop = container.scrollHeight;
  } catch {
    loading.classList.add('hidden');
    inputArea.classList.remove('hidden');
    alert('Connection error — is the server running?');
  }
}

async function skipToRuling() {
  trialPhase = 'closing';
  _updateStepIndicator('closing');
  const nextConfig = PHASE_CONFIG['closing'];
  document.getElementById('trial-input-label').textContent = nextConfig.label;
  document.getElementById('btn-case-trial').textContent = nextConfig.btn;
  document.getElementById('btn-skip-to-ruling').classList.add('hidden');
  document.getElementById('case-trial-argument').placeholder = 'Present your closing statement …';
  document.getElementById('case-trial-argument').focus();
}

function resetCaseTrial() {
  trialPhase = 'opening';
  trialHistory = [];
  lastTrialData = null;

  document.getElementById('trial-timeline').innerHTML = '';
  document.getElementById('trial-final-actions').classList.add('hidden');
  document.getElementById('case-trial-loading').classList.add('hidden');
  document.getElementById('btn-skip-to-ruling').classList.add('hidden');
  document.getElementById('trial-suggestion-chips').classList.remove('hidden');

  const inputArea = document.getElementById('trial-input-area');
  inputArea.classList.remove('hidden');

  const config = PHASE_CONFIG['opening'];
  document.getElementById('trial-input-label').textContent = config.label;
  document.getElementById('btn-case-trial').textContent = config.btn;
  document.getElementById('case-trial-argument').value = '';
  document.getElementById('case-trial-argument').placeholder = 'Present your opening argument here …';
  _updateStepIndicator('opening');
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
