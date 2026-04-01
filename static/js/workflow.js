/*
 * ═══════════════════════════════════════════════════════
 *  WORKFLOW.JS — Multi-step workflow management
 * ═══════════════════════════════════════════════════════
 *
 *  Manages the 5-step workflow indicator in the sidebar:
 *   1. Upload        — user uploads documents
 *   2. Processing    — system chunks & embeds documents
 *   3. Retrieval     — RAG retrieves relevant sections
 *   4. Clarification — system asks follow-up questions
 *   5. Report        — structured artifact generated
 *
 *  Depends on: (none — standalone)
 *
 *  TODO (backend):
 *   - Trigger step transitions from real API responses
 *   - Add error states for failed steps
 */

function setStepActive(stepId) {
  const el = document.getElementById(stepId);
  if (!el) return;
  el.classList.remove('step-completed');
  el.classList.add('step-active');
}

function setStepDone(stepId) {
  const el = document.getElementById(stepId);
  if (!el) return;
  el.classList.remove('step-active');
  el.classList.add('step-completed');
}

function resetAllSteps() {
  const steps = ['step-upload', 'step-process', 'step-retrieve', 'step-clarify', 'step-report'];
  steps.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.classList.remove('step-active', 'step-completed');
    }
  });
  setStepActive('step-upload');
}
