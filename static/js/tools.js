/* ═══════════════════════════════════════════════════════
 *  TOOLS.JS — Tools side panel logic
 * ═══════════════════════════════════════════════════════ */

/* ── Panel Toggle ── */

function openToolsPanel() {
  const panel = document.getElementById('tools-panel');
  panel.classList.remove('translate-x-full');

  // Show the correct tool set based on mode
  const docTools = document.getElementById('tools-doc-mode');
  const lawyerTools = document.getElementById('tools-lawyer-mode');
  docTools.classList.add('hidden');
  lawyerTools.classList.add('hidden');

  if (AppState.mode === 'lawyer') {
    lawyerTools.classList.remove('hidden');
  } else {
    docTools.classList.remove('hidden');
  }
}

function closeToolsPanel() {
  document.getElementById('tools-panel').classList.add('translate-x-full');
}

function toggleToolsPanel() {
  const panel = document.getElementById('tools-panel');
  if (panel.classList.contains('translate-x-full')) {
    openToolsPanel();
  } else {
    closeToolsPanel();
  }
}

function toggleToolSection(id) {
  const content = document.getElementById('tool-' + id);
  const chevron = document.getElementById(id + '-chevron');
  if (!content) return;
  content.classList.toggle('hidden');
  if (chevron) chevron.classList.toggle('rotate-180');
}


/* ── Readability ── */

function renderReadability(data) {
  const container = document.getElementById('readability-content');
  if (!container) return;
  if (!data) {
    container.innerHTML = '<p class="text-[11px] text-gray-500 italic">Could not compute readability.</p>';
    return;
  }

  const colorMap = {
    green: 'text-green-400 bg-green-400/10 border-green-400/20',
    yellow: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
    orange: 'text-orange-400 bg-orange-400/10 border-orange-400/20',
    red: 'text-red-400 bg-red-400/10 border-red-400/20',
  };
  const cls = colorMap[data.color] || colorMap.yellow;

  container.innerHTML = `
    <div class="space-y-2">
      <div class="flex items-center gap-2">
        <span class="text-[11px] font-semibold px-2 py-0.5 rounded-md border ${cls}">${escapeHtml(data.label)}</span>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <div class="bg-white/[0.02] border border-white/[0.04] rounded-lg p-2.5 text-center">
          <div class="text-[18px] font-bold text-white">${data.grade}</div>
          <div class="text-[9px] text-gray-600 mt-0.5 uppercase tracking-wide">Grade Level</div>
        </div>
        <div class="bg-white/[0.02] border border-white/[0.04] rounded-lg p-2.5 text-center">
          <div class="text-[18px] font-bold text-white">${data.score}</div>
          <div class="text-[9px] text-gray-600 mt-0.5 uppercase tracking-wide">Reading Ease</div>
        </div>
      </div>
      <p class="text-[10px] text-gray-600">Reading ease: 0 = hardest, 100 = easiest. Grade level = US school grade required.</p>
    </div>`;

  // Auto-open the section
  const content = document.getElementById('tool-readability');
  const chevron = document.getElementById('readability-chevron');
  if (content && content.classList.contains('hidden')) {
    content.classList.remove('hidden');
    if (chevron) chevron.classList.add('rotate-180');
  }
}


/* ── Glossary ── */

function renderGlossary(glossary) {
  const container = document.getElementById('glossary-content');
  if (!container) return;

  if (!glossary || glossary.length === 0) {
    container.innerHTML = '<p class="text-[11px] text-gray-500 italic">No terms extracted from this document.</p>';
    return;
  }

  container.innerHTML = glossary.map(item => `
    <div class="mb-3">
      <p class="text-[11px] font-semibold text-gray-200 mb-0.5">${escapeHtml(item.term)}</p>
      <p class="text-[11px] text-gray-500 leading-relaxed">${escapeHtml(item.definition)}</p>
    </div>`).join('');

  // Auto-open the section
  const content = document.getElementById('tool-glossary');
  const chevron = document.getElementById('glossary-chevron');
  if (content && content.classList.contains('hidden')) {
    content.classList.remove('hidden');
    if (chevron) chevron.classList.add('rotate-180');
  }
}


/* ── Court Precedents (CourtListener) ── */

async function searchPrecedents(inputId, resultsId) {
  const query = document.getElementById(inputId)?.value.trim();
  const resultsEl = document.getElementById(resultsId);
  if (!query || !resultsEl) return;

  resultsEl.innerHTML = toolLoader('Searching court opinions …');

  try {
    const res = await fetch('/api/tools/precedents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    const data = await res.json();

    if (!res.ok || data.error) {
      resultsEl.innerHTML = toolError(data.error || 'Search failed.');
      return;
    }

    if (!data.cases || data.cases.length === 0) {
      resultsEl.innerHTML = '<p class="text-[11px] text-gray-600 italic">No cases found. Try a different query.</p>';
      return;
    }

    resultsEl.innerHTML = data.cases.map(c => `
      <div class="bg-white/[0.02] border border-white/[0.04] rounded-lg p-3 space-y-1">
        <a href="${escapeHtml(c.url)}" target="_blank" class="text-[11px] font-semibold text-blue-400 hover:text-blue-300 leading-snug block">${escapeHtml(c.name)}</a>
        <p class="text-[10px] text-gray-600">${escapeHtml(c.court)} · ${escapeHtml(c.date || 'Date unknown')}</p>
        ${c.snippet ? `<p class="text-[11px] text-gray-400 leading-relaxed">${escapeHtml(c.snippet)}</p>` : ''}
      </div>`).join('');
  } catch {
    resultsEl.innerHTML = toolError('Connection error.');
  }
}


/* ── Web Search (Tavily) ── */

async function toolWebSearch(inputId, resultsId) {
  const query = document.getElementById(inputId)?.value.trim();
  const resultsEl = document.getElementById(resultsId);
  if (!query || !resultsEl) return;

  resultsEl.innerHTML = toolLoader('Searching the web …');

  try {
    const res = await fetch('/api/tools/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    const data = await res.json();

    if (!res.ok || data.error) {
      resultsEl.innerHTML = toolError(data.error || 'Search failed.');
      return;
    }

    if (!data.results || data.results.length === 0) {
      resultsEl.innerHTML = '<p class="text-[11px] text-gray-600 italic">No results found.</p>';
      return;
    }

    resultsEl.innerHTML = data.results.map(r => `
      <div class="bg-white/[0.02] border border-white/[0.04] rounded-lg p-3 space-y-1">
        <a href="${escapeHtml(r.url)}" target="_blank" class="text-[11px] font-semibold text-blue-400 hover:text-blue-300 leading-snug block">${escapeHtml(r.title || r.url)}</a>
        ${r.content ? `<p class="text-[11px] text-gray-400 leading-relaxed">${escapeHtml(r.content.slice(0, 200))}…</p>` : ''}
      </div>`).join('');
  } catch {
    resultsEl.innerHTML = toolError('Connection error.');
  }
}


/* ── Statute Lookup (Congress.gov) ── */

async function searchStatutes() {
  const query = document.getElementById('statutes-input')?.value.trim();
  const resultsEl = document.getElementById('statutes-results');
  if (!query || !resultsEl) return;

  resultsEl.innerHTML = toolLoader('Searching federal statutes …');

  try {
    const res = await fetch(`/api/tools/statutes?q=${encodeURIComponent(query)}`);
    const data = await res.json();

    if (!res.ok || data.error) {
      resultsEl.innerHTML = toolError(data.error || 'Search failed.');
      return;
    }

    if (!data.bills || data.bills.length === 0) {
      resultsEl.innerHTML = '<p class="text-[11px] text-gray-600 italic">No bills found. Try a different query.</p>';
      return;
    }

    resultsEl.innerHTML = data.bills.map(b => `
      <div class="bg-white/[0.02] border border-white/[0.04] rounded-lg p-3 space-y-1">
        <p class="text-[11px] font-semibold text-gray-200 leading-snug">${escapeHtml(b.title || 'Untitled Bill')}</p>
        <p class="text-[10px] text-gray-600">${escapeHtml(b.type || '')} ${escapeHtml(String(b.number || ''))} · ${escapeHtml(b.congress ? b.congress + 'th Congress' : '')}</p>
        ${b.latestAction?.text ? `<p class="text-[10px] text-gray-500">${escapeHtml(b.latestAction.text)}</p>` : ''}
      </div>`).join('');
  } catch {
    resultsEl.innerHTML = toolError('Connection error.');
  }
}


/* ── Translation (LLM) ── */

async function translateDocument(prefix) {
  const langSelect = document.getElementById(prefix + '-translate-lang');
  const textInput = document.getElementById(prefix + '-translate-input');
  const resultsEl = document.getElementById(prefix + '-translate-results');

  const language = langSelect?.value;
  const text = textInput?.value.trim();

  if (!language) {
    resultsEl.innerHTML = toolError('Please select a target language.');
    return;
  }

  resultsEl.innerHTML = toolLoader('Translating to ' + language + ' …');

  const body = { language };
  if (text) {
    body.text = text;
  } else if (AppState.userSessionId && prefix === 'doc') {
    body.session_id = AppState.userSessionId;
  } else if (!text) {
    resultsEl.innerHTML = toolError('Enter text to translate, or upload a document first.');
    return;
  }

  try {
    const res = await fetch('/api/tools/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();

    if (!res.ok || data.error) {
      resultsEl.innerHTML = toolError(data.error || 'Translation failed.');
      return;
    }

    resultsEl.innerHTML = `
      <div class="bg-white/[0.02] border border-white/[0.04] rounded-lg p-3 space-y-2">
        <div class="flex items-center justify-between">
          <span class="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">${escapeHtml(data.language)}</span>
          <button onclick="copyTranslation('${prefix}')" class="text-[10px] text-gray-600 hover:text-gray-300 transition-colors">Copy</button>
        </div>
        <p id="${prefix}-translated-text" class="text-[11px] text-gray-300 leading-relaxed whitespace-pre-wrap">${escapeHtml(data.translated)}</p>
      </div>`;
  } catch {
    resultsEl.innerHTML = toolError('Connection error.');
  }
}

function copyTranslation(prefix) {
  const el = document.getElementById(prefix + '-translated-text');
  if (el) {
    navigator.clipboard.writeText(el.textContent).then(() => {
      const btn = el.closest('.space-y-2')?.querySelector('button');
      if (btn) {
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
      }
    });
  }
}


/* ── Helpers ── */

function toolLoader(msg) {
  return `<div class="flex items-center gap-2 py-2">
    <div class="flex gap-1">
      <div class="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce" style="animation-delay:0ms"></div>
      <div class="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce" style="animation-delay:150ms"></div>
      <div class="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce" style="animation-delay:300ms"></div>
    </div>
    <span class="text-[11px] text-gray-600">${escapeHtml(msg)}</span>
  </div>`;
}

function toolError(msg) {
  return `<p class="text-[11px] text-red-400/80">${escapeHtml(msg)}</p>`;
}
