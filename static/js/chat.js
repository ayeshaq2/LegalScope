/*
 * ═══════════════════════════════════════════════════════
 *  CHAT.JS — Chat interface & message handling
 * ═══════════════════════════════════════════════════════
 *
 *  Handles:
 *   - Sending user messages
 *   - Displaying AI responses
 *   - Suggestion chip clicks
 *   - Loading/typing indicator
 *   - Textarea auto-resize + Enter to send
 *
 *  Depends on: state.js, sidebar.js
 *
 *  TODO (backend):
 *   - POST user query to /api/query
 *   - Parse response with citations and display
 *   - Stream tokens via SSE for real-time display
 *   - Display retrieved source chunks in response
 */

/* ── Suggestion Chips ── */

function insertQuery(text) {
  const input = document.getElementById('chat-input');
  input.value = text;
  input.focus();
}

/* ── Send Message ── */

function sendMessage() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text) return;

  AppState.queryCount++;
  document.getElementById('ctx-queries').textContent = AppState.queryCount;

  const box = document.getElementById('chat-messages');

  // ── Append user message bubble ──
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

  // ── Show loading indicator ──
  const loader = document.createElement('div');
  loader.id = 'chat-loader';
  loader.className = 'flex gap-3 max-w-3xl';
  loader.innerHTML = `
    <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-gold-400 to-gold-600 flex-shrink-0 flex items-center justify-center pulse-gold shadow-lg shadow-gold-400/10">
      <svg class="w-4 h-4 text-navy-950" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"/></svg>
    </div>
    <div class="flex-1">
      <div class="flex items-center gap-2 mb-1.5"><span class="text-[12px] font-bold text-white">LegalScope</span></div>
      <div class="chat-bubble-ai rounded-2xl rounded-tl-md p-5">
        <div class="flex items-center gap-3">
          <div class="flex gap-1">
            <div class="w-1.5 h-1.5 rounded-full bg-gold-400/70 animate-bounce" style="animation-delay:0ms"></div>
            <div class="w-1.5 h-1.5 rounded-full bg-gold-400/70 animate-bounce" style="animation-delay:150ms"></div>
            <div class="w-1.5 h-1.5 rounded-full bg-gold-400/70 animate-bounce" style="animation-delay:300ms"></div>
          </div>
          <span class="text-[11px] text-gray-600">Retrieving relevant sections…</span>
        </div>
      </div>
    </div>`;
  box.appendChild(loader);
  box.scrollTop = box.scrollHeight;

  // ── Simulate AI response ──
  // TODO: Replace with real fetch() to /api/query
  setTimeout(() => {
    const ld = document.getElementById('chat-loader');
    if (ld) ld.remove();

    const aiMsg = document.createElement('div');
    aiMsg.className = 'flex gap-3 max-w-3xl';
    aiMsg.innerHTML = `
      <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-gold-400 to-gold-600 flex-shrink-0 flex items-center justify-center shadow-lg shadow-gold-400/10">
        <svg class="w-4 h-4 text-navy-950" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"/></svg>
      </div>
      <div class="flex-1">
        <div class="flex items-center gap-2 mb-1.5">
          <span class="text-[12px] font-bold text-white">LegalScope</span>
          <span class="text-[9px] text-gray-600 font-medium">just now</span>
        </div>
        <div class="chat-bubble-ai rounded-2xl rounded-tl-md p-5">
          <p class="text-[13px] text-gray-300 leading-relaxed">This is a placeholder. Connect the backend to show real AI analysis with cited document sections.</p>
          <div class="mt-3 pt-3 border-t border-white/[0.04]">
            <p class="text-[9px] text-gray-600 uppercase tracking-[0.15em] font-bold mb-2">Sources</p>
            <div class="flex flex-wrap gap-1.5">
              <span class="text-[10px] text-gold-400/50 bg-gold-400/[0.04] px-2 py-0.5 rounded-md font-medium">§ 5.2 — Liability</span>
              <span class="text-[10px] text-gold-400/50 bg-gold-400/[0.04] px-2 py-0.5 rounded-md font-medium">§ 8.1 — Termination</span>
            </div>
          </div>
        </div>
      </div>`;
    box.appendChild(aiMsg);
    box.scrollTop = box.scrollHeight;
  }, 1500);
}

/* ── Textarea Auto-Resize & Enter-to-Send ── */

const chatInput = document.getElementById('chat-input');
if (chatInput) {
  chatInput.addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 160) + 'px';
  });
  chatInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
}

/* ── Utility ── */

function escapeHtml(text) {
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}
