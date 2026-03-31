/*
 * ═══════════════════════════════════════════════════════
 *  UPLOAD.JS — File upload & document type selection
 * ═══════════════════════════════════════════════════════
 *
 *  Handles:
 *   - Drag-and-drop file uploads
 *   - File input (browse) uploads
 *   - Rendering uploaded file list
 *   - Document type selection (Contract / NDA / Agreement)
 *   - Analysis focus checkboxes
 *   - "Begin Analysis" button state
 *
 *  Depends on: state.js, workflow.js, sidebar.js, main.js
 *
 *  TODO (backend):
 *   - POST files to /api/upload on beginAnalysis()
 *   - Send doc type + focus to /api/session/context
 *   - Show real processing progress instead of setTimeout
 */

const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const uploadedFiles = document.getElementById('uploaded-files');
const beginBtn = document.getElementById('btn-begin-analysis');

/* ── Drag & Drop ── */

dropZone.addEventListener('dragover', e => {
  e.preventDefault();
  dropZone.classList.add('drop-zone-active');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('drop-zone-active');
});

dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drop-zone-active');
  handleFiles(e.dataTransfer.files);
});

fileInput.addEventListener('change', e => handleFiles(e.target.files));

/* ── File Handling ── */

function handleFiles(files) {
  for (const f of files) {
    if (AppState.documents.find(d => d.name === f.name)) continue;
    AppState.documents.push({ name: f.name, size: f.size, type: f.type });
  }
  renderUploadedFiles();
  updateSidebarDocs();
  updateBeginButton();
}

function renderUploadedFiles() {
  uploadedFiles.classList.remove('hidden');
  uploadedFiles.querySelectorAll('.file-item').forEach(el => el.remove());

  AppState.documents.forEach((doc, i) => {
    const el = document.createElement('div');
    el.className = 'file-item';
    el.innerHTML = `
      <div class="w-6 h-6 rounded-md bg-red-500/10 flex items-center justify-center flex-shrink-0">
        <span class="text-[7px] font-black text-red-400">PDF</span>
      </div>
      <span class="text-[12px] text-gray-300 flex-1 truncate font-medium">${doc.name}</span>
      <span class="text-[10px] text-gray-600 font-medium">${formatFileSize(doc.size)}</span>
      <button onclick="removeDocument(${i})" class="p-1 rounded-md hover:bg-white/[0.04] text-gray-600 hover:text-red-400 transition-all">
        <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
      </button>`;
    uploadedFiles.appendChild(el);
  });
}

function removeDocument(index) {
  AppState.documents.splice(index, 1);
  renderUploadedFiles();
  updateSidebarDocs();
  updateBeginButton();
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

/* ── Document Type Selection ── */

function selectDocType(btn, type) {
  document.querySelectorAll('.doc-type-btn').forEach(b => b.classList.remove('doc-type-selected'));
  btn.classList.add('doc-type-selected');
  AppState.selectedDocType = type;
  document.getElementById('ctx-doc-type').textContent = type;
  updateBeginButton();
}

/* ── Begin Button State ── */

function updateBeginButton() {
  beginBtn.disabled = !(AppState.documents.length > 0 && AppState.selectedDocType);
}

/* ── Begin Analysis ── */

function beginAnalysis() {
  // Collect analysis focus
  const foci = [];
  document.querySelectorAll('.focus-option input:checked').forEach(c => foci.push(c.value));
  AppState.analysisFocus = foci;
  if (foci.length) document.getElementById('ctx-focus').textContent = foci.join(', ');

  // Update workflow
  setStepDone('step-upload');
  setStepActive('step-process');

  // TODO: Replace this timeout with a real API call to /api/upload
  // that sends files + context, then transitions on success
  setTimeout(() => {
    setStepDone('step-process');
    setStepActive('step-retrieve');
    switchView('analyze');
  }, 600);
}
