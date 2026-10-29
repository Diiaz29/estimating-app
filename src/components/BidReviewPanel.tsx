import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { BidReview, ReviewAction } from '../lib/bidReview'
import { canReviewAction, reviewStageLabel } from '../lib/bidReview'

export default function BidReviewPanel({ bidId, review, admin, editor, busy, blocked, error, available, onAction, onRetry }: {
  bidId: string; review: BidReview | null; admin: boolean; editor: boolean; busy: boolean; blocked: boolean
  error: string | null; available: boolean; onAction: (action: ReviewAction, note?: string) => Promise<void>; onRetry: () => void
}) {
  const [returning, setReturning] = useState(false)
  const [note, setNote] = useState('')
  async function run(action: ReviewAction) {
    try { await onAction(action, action === 'return' ? note.trim() : undefined); setReturning(false); setNote('') } catch { /* parent shows the server error */ }
  }
  return <section className="bid-review-panel print:hidden" aria-label="Bid review">
    <div className="review-panel-summary"><strong>{review ? reviewStageLabel[review.stage] : 'Working — not submitted for review'}</strong><p>{review?.stage === 'ready' ? 'A locked revision is waiting for an admin to review.' : review?.stage === 'approved' ? 'Review is complete. An admin must sign the approved proposal.' : review?.stage === 'signed' ? 'The approved revision has been signed.' : admin && review?.stage === 'changes_requested' ? 'Review the submitted revision and send feedback below.' : 'Save your work, then submit a locked revision for review.'}</p>{review?.revision_id && <Link to={`/bids/${bidId}/revisions/${review.revision_id}`} className="review-revision-link">View submitted revision</Link>}{review?.note && <p className="review-return-note">{review.note}</p>}</div>
    <div className="review-panel-actions">
      {canReviewAction('submit', review?.stage ?? null, admin, editor) && <button className="index-primary" disabled={!available || busy || blocked} onClick={() => void run('submit')}>{busy ? 'Submitting…' : review ? 'Resubmit for review' : 'Submit for review'}</button>}
      {canReviewAction('approve', review?.stage ?? null, admin, editor) && <button className="index-primary" disabled={busy || blocked} onClick={() => void run('approve')}>Approve for signature</button>}
      {admin && review?.stage === 'approved' && <Link className="index-primary" to={`/bids/${bidId}/proposal`}>Open proposal to sign</Link>}
      {canReviewAction('return', review?.stage ?? null, admin, editor) && <button className="index-secondary" disabled={busy || blocked} onClick={() => setReturning(!returning)}>Return for changes</button>}
    </div>
    {admin && review?.stage === 'changes_requested' && <p role="status">You can send review notes without resubmitting. A new submission is required before approval or signing.</p>}
    {returning && <form className="review-return-form" onSubmit={e => { e.preventDefault(); void run('return') }}><label>What needs to change?<textarea required maxLength={4000} value={note} onChange={e => setNote(e.target.value)} className="input" disabled={busy} /></label><div><button className="index-primary" disabled={busy || blocked || !note.trim()}>Send back to estimator</button><button type="button" className="index-secondary" onClick={() => setReturning(false)} disabled={busy}>Cancel</button></div></form>}
    {blocked && <p role="status">Finish saving or retry failed edits before submitting or reviewing.</p>}
    {error && <p role="alert">{error} <button className="index-secondary" onClick={onRetry} disabled={busy}>Reload review status</button></p>}
  </section>
}
