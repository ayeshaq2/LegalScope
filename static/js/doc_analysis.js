/* ═══════════════════════════════════════════════════════
 *  DOC_ANALYSIS.JS — User mode: document upload + chat
 * ═══════════════════════════════════════════════════════ */

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
