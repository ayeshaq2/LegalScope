/*
 * ═══════════════════════════════════════════════════════
 *  STATE.JS — Global application state
 * ═══════════════════════════════════════════════════════
 *
 *  Central state object shared across all JS modules.
 *  Any module can read/write to `AppState`.
 *
 *  TODO (backend):
 *   - Sync state with server session via /api/session
 *   - Persist state across page reloads
 */

const AppState = {
  currentView: 'upload',
  documents: [],
  selectedDocType: null,
  analysisFocus: [],
  queryCount: 0,
  sessionId: null,
};
