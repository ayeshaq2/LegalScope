/*
 * ═══════════════════════════════════════════════════════
 *  MAIN.JS — App initialization & view switching
 * ═══════════════════════════════════════════════════════
 *
 *  Handles:
 *   - View switching (Upload / Analyze / Report)
 *   - App initialization on page load
 *
 *  Depends on: state.js
 *
 *  This file is loaded LAST so all other modules are ready.
 */

/* ── View Switching ── */

function switchView(view) {
  document.querySelectorAll('.view-panel').forEach(el => {
    el.classList.add('hidden');
    el.classList.remove('flex');
  });

  const target = document.getElementById(`view-${view}`);
  if (target) {
    target.classList.remove('hidden');
    target.classList.add('flex');
  }

  document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active-view'));
  const btn = document.getElementById(`btn-${view}`);
  if (btn) btn.classList.add('active-view');

  AppState.currentView = view;
}

/* ── Init ── */

document.addEventListener('DOMContentLoaded', () => {
  switchView('upload');
});
