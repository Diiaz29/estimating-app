import type { SaveState } from '../lib/saveQueue'

export default function SaveFeedback({ state, retry, explanation = 'Snapshot records a locked revision of the saved estimate.', savedMessage = 'All changes saved.' }: { state: SaveState; retry: () => void; explanation?: string; savedMessage?: string }) {
  if (state.error) return <div className="save-feedback save-failed" role="alert">
    <div><strong>{state.label} did not save.</strong><p>Your changes are still shown here. Retry before leaving this page.</p><details><summary>Error details</summary>{state.error}</details></div>
    <button type="button" className="index-secondary" onClick={retry}>Retry unsaved changes</button>
  </div>
  return <p className="save-feedback" role="status" aria-live="polite">{state.pending ? `Saving ${state.pending} change${state.pending === 1 ? '' : 's'}…` : state.saved ? savedMessage : 'Edits save automatically when you leave a field.'} {explanation && <span>{explanation}</span>}</p>
}
