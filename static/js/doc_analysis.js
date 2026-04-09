/* ═══════════════════════════════════════════════════════
 *  DOC_ANALYSIS.JS — User mode: document upload + chat
 * ═══════════════════════════════════════════════════════ */

/* ── Google Drive Picker ── */

let _driveApiKey = null;
let _driveAccessToken = null;
let _pickerApiLoaded = false;

// On page load, check if we just returned from Google OAuth
window.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  if (params.get('drive') === 'ready') {
    // Clean URL then open picker now that we're authenticated
    history.replaceState({}, '', '/');
    await _loadDriveStatus();
    _openPicker();
  } else {
    await _loadDriveStatus();
  }
});

async function _loadDriveStatus() {
  try {
    const res = await fetch('/auth/google/status');
    const data = await res.json();
    _driveApiKey = data.api_key;
    if (data.authenticated) {
      _driveAccessToken = data.access_token;
      const badge = document.getElementById('drive-auth-badge');
      if (badge) badge.classList.remove('hidden');
    }
  } catch { /* ignore */ }
}

async function openGoogleDrivePicker() {
  // If not authenticated yet, redirect to Google OAuth
  if (!_driveAccessToken) {
    window.location.href = '/auth/google';
    return;
  }
  _openPicker();
}

function _openPicker() {
  if (!_pickerApiLoaded) {
    gapi.load('picker', { callback: () => { _pickerApiLoaded = true; _buildPicker(); } });
  } else {
    _buildPicker();
  }
}

function _buildPicker() {
  const view = new google.picker.DocsView()
    .setIncludeFolders(false)
    .setMimeTypes('application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,application/vnd.google-apps.document');

  const picker = new google.picker.PickerBuilder()
    .setTitle('Select a document to analyze')
    .setOAuthToken(_driveAccessToken)
    .setDeveloperKey(_driveApiKey)
    .addView(view)
    .setCallback(_onPickerSelected)
    .build();

  picker.setVisible(true);
}

async function _onPickerSelected(data) {
  if (data[google.picker.Response.ACTION] !== google.picker.Action.PICKED) return;

  const file     = data[google.picker.Response.DOCUMENTS][0];
  const fileId   = file[google.picker.Document.ID];
  const fileName = file[google.picker.Document.NAME];
  const mimeType = file[google.picker.Document.MIME_TYPE];

  const progress = document.getElementById('drive-import-progress');
  const info     = document.getElementById('doc-uploaded-info');
  if (progress) progress.classList.remove('hidden');
  if (info)     info.classList.add('hidden');

  try {
    const res = await fetch('/api/doc/import-drive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_id: fileId, file_name: fileName, mime_type: mimeType }),
    });
    const driveData = await res.json();

    if (progress) progress.classList.add('hidden');

    if (res.ok) {
      AppState.userSessionId   = driveData.session_id;
      AppState.uploadedDocName = driveData.filename;

      document.getElementById('doc-uploaded-name').textContent   = driveData.filename;
      document.getElementById('doc-uploaded-chunks').textContent = `Processed into ${driveData.chunks} searchable sections`;
      if (info) info.classList.remove('hidden');

      const chatBtn = document.getElementById('btn-doc-chat');
      if (chatBtn) chatBtn.disabled = false;

      showDocSidebar(driveData.filename);
      if (driveData.readability) renderReadability(driveData.readability);

      switchView('doc-chat');
      runAutoAnalysis(driveData.session_id);
    } else {
      alert(driveData.error || 'Import failed.');
    }
  } catch {
    if (progress) progress.classList.add('hidden');
    alert('Connection error — is the server running?');
  }
}

/* ── File Upload ── */

const docDropZone = document.getElementById('doc-drop-zone');
const docFileInput = document.getElementById('doc-file-input');

if (docDropZone) {
  docDropZone.addEventListener('dragover', e => {
    e.preventDefault();
    docDropZone.classList.add('drop-zone-active');
  });
  docDropZone.addEventListener('dragleave', () => {
    docDropZone.classList.remove('drop-zone-active');
  });
  docDropZone.addEventListener('drop', e => {
    e.preventDefault();
    docDropZone.classList.remove('drop-zone-active');
    if (e.dataTransfer.files.length) uploadUserDoc(e.dataTransfer.files[0]);
  });
}

if (docFileInput) {
  docFileInput.addEventListener('change', e => {
    if (e.target.files.length) uploadUserDoc(e.target.files[0]);
  });
}

async function uploadUserDoc(file) {
  const progress = document.getElementById('doc-upload-progress');
  const info = document.getElementById('doc-uploaded-info');

  progress.classList.remove('hidden');
  info.classList.add('hidden');

  const formData = new FormData();
  formData.append('file', file);

  try {
    const res = await fetch('/api/doc/upload', {
      method: 'POST',
      body: formData,
    });
    const data = await res.json();

    progress.classList.add('hidden');

    if (res.ok) {
      AppState.userSessionId = data.session_id;
      AppState.uploadedDocName = data.filename;

      document.getElementById('doc-uploaded-name').textContent = data.filename;
      document.getElementById('doc-uploaded-chunks').textContent =
        `Processed into ${data.chunks} searchable sections`;
      info.classList.remove('hidden');

      const chatBtn = document.getElementById('btn-doc-chat');
      if (chatBtn) chatBtn.disabled = false;

      showDocSidebar(data.filename);

      // Push readability into tools panel immediately
      if (data.readability) {
        renderReadability(data.readability);
        AppState.lastReadability = data.readability;
      }

      // Switch to chat and kick off auto-analysis immediately
      switchView('doc-chat');
      runAutoAnalysis(data.session_id);
    } else {
      alert(data.error || 'Upload failed');
    }
  } catch {
    progress.classList.add('hidden');
    alert('Connection error — is the server running?');
  }
}


/* ── Document Chat ── */

function insertDocQuery(text) {
  const input = document.getElementById('doc-chat-input');
  input.value = text;
  input.focus();
}

async function sendDocMessage() {
  const input = document.getElementById('doc-chat-input');
  const text = input.value.trim();
  if (!text || !AppState.userSessionId) return;

  incrementQueryCount();
  const box = document.getElementById('doc-chat-messages');

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
  loader.id = 'doc-chat-loader';
  loader.className = 'flex gap-3 max-w-3xl';
  loader.innerHTML = `
    <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-400 to-blue-600 flex-shrink-0 flex items-center justify-center pulse-gold shadow-lg shadow-blue-400/10">
      <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m5.231 13.481L15 17.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v16.5c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9zm3.75 11.625a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"/></svg>
    </div>
    <div class="flex-1">
      <div class="chat-bubble-ai rounded-2xl rounded-tl-md p-5">
        <div class="flex items-center gap-3">
          <div class="flex gap-1">
            <div class="w-1.5 h-1.5 rounded-full bg-blue-400/70 animate-bounce" style="animation-delay:0ms"></div>
            <div class="w-1.5 h-1.5 rounded-full bg-blue-400/70 animate-bounce" style="animation-delay:150ms"></div>
            <div class="w-1.5 h-1.5 rounded-full bg-blue-400/70 animate-bounce" style="animation-delay:300ms"></div>
          </div>
          <span class="text-[11px] text-gray-600">Analyzing your document …</span>
        </div>
      </div>
    </div>`;
  box.appendChild(loader);
  box.scrollTop = box.scrollHeight;

  try {
    const res = await fetch('/api/doc/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: AppState.userSessionId, query: text }),
    });
    const data = await res.json();
    const ld = document.getElementById('doc-chat-loader');
    if (ld) ld.remove();

    appendAiMessage(box, data.response || data.error || 'No response.', 'blue');
  } catch {
    const ld = document.getElementById('doc-chat-loader');
    if (ld) ld.remove();
    appendAiMessage(box, 'Connection error — is the server running?', 'blue', true);
  }
}

/* ── Auto Analysis ── */

async function runAutoAnalysis(sessionId) {
  const box = document.getElementById('doc-chat-messages');
  const loader = document.getElementById('doc-analysis-loader');

  // Clear any previous messages except the loader
  Array.from(box.children).forEach(el => {
    if (el.id !== 'doc-analysis-loader') el.remove();
  });

  loader.classList.remove('hidden');
  box.scrollTop = box.scrollHeight;

  try {
    const res = await fetch('/api/doc/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId }),
    });
    const data = await res.json();
    loader.classList.add('hidden');

    const analysisText = data.analysis || data.error || 'Could not generate analysis.';
    const suggestions = data.suggestions || [];
    appendAutoAnalysis(box, analysisText, suggestions);

    AppState.lastAnalysis = analysisText;

    const pdfBtn = document.getElementById('btn-export-pdf');
    if (pdfBtn) pdfBtn.classList.remove('hidden');

    // Push glossary into tools panel
    if (data.glossary) renderGlossary(data.glossary);
  } catch {
    loader.classList.add('hidden');
    appendAiMessage(box, 'Could not run auto-analysis — is the server running?', 'blue', true);
  }
}

function appendAutoAnalysis(container, text, suggestions = []) {
  const fallbackChips = [
    'Explain the termination clause in simple terms',
    'Which red flags should I be most concerned about?',
    'What should I negotiate or push back on?',
    'Explain this document like I am not a lawyer',
  ];
  const chips = suggestions.length >= 2 ? suggestions : fallbackChips;

  const msg = document.createElement('div');
  msg.className = 'flex gap-3 max-w-3xl';
  msg.innerHTML = `
    <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-400 to-blue-600 flex-shrink-0 flex items-center justify-center shadow-lg shadow-blue-400/10">
      <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m5.231 13.481L15 17.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v16.5c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9zm3.75 11.625a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"/></svg>
    </div>
    <div class="flex-1">
      <div class="flex items-center gap-2 mb-1.5">
        <span class="text-[12px] font-bold text-white">LegalScope</span>
        <span class="text-[10px] text-blue-400/70 font-medium px-2 py-0.5 rounded-full bg-blue-400/10 border border-blue-400/20">Auto Analysis</span>
      </div>
      <div class="chat-bubble-ai rounded-2xl rounded-tl-md p-5">
        <p class="text-[13px] text-gray-300 leading-relaxed whitespace-pre-wrap">${escapeHtml(text)}</p>
        <div class="mt-4 pt-4 border-t border-white/[0.04]">
          <p class="text-[10px] text-gray-600 mb-2 font-medium">Suggested questions</p>
          <div class="chip-row flex flex-wrap gap-2"></div>
        </div>
      </div>
    </div>`;

  // Attach chips via DOM — avoids any HTML-attribute escaping issues
  const chipRow = msg.querySelector('.chip-row');
  chips.forEach(q => {
    const btn = document.createElement('button');
    btn.className = 'suggestion-chip text-[11px] px-3.5 py-2 rounded-lg bg-white/[0.02] border border-white/[0.06] text-gray-500 font-medium';
    btn.textContent = q;
    btn.addEventListener('click', () => {
      document.getElementById('doc-chat-input').value = q;
      sendDocMessage();
    });
    chipRow.appendChild(btn);
  });

  container.appendChild(msg);
  container.scrollTop = container.scrollHeight;
}

/* ── Export PDF ── */

async function exportAnalysisPDF() {
  if (!AppState.lastAnalysis) {
    alert('No analysis available yet. Upload and analyze a document first.');
    return;
  }

  const btn = document.getElementById('btn-export-pdf');
  const originalHTML = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>`;

  try {
    const res = await fetch('/api/doc/report/pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        analysis: AppState.lastAnalysis,
        filename: AppState.uploadedDocName || 'document',
        readability: AppState.lastReadability || null,
      }),
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
    a.download = (AppState.uploadedDocName || 'document').replace(/\.[^.]+$/, '') + '_analysis.pdf';
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

// Enter to send
const docChatInput = document.getElementById('doc-chat-input');
if (docChatInput) {
  docChatInput.addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 160) + 'px';
  });
  docChatInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendDocMessage();
    }
  });
}
