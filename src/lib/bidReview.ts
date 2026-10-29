export type ReviewStage = 'ready' | 'approved' | 'changes_requested' | 'signed'
export type ReviewAction = 'submit' | 'approve' | 'return' | 'sign'
export interface BidReview {
  bid_id: string
  revision_id: string | null
  stage: ReviewStage
  submitted_by: string
  submitted_at: string
  reviewed_by: string | null
  reviewed_at: string | null
  note: string | null
  version: number
  signed_at: string | null
  signed_by: string | null
  signature_data: string | null
  signer_name: string | null
  signer_title: string | null
  updated_at: string
}
export interface BidReviewNote {
  bid_id: string
  review_version: number
  revision_id: string | null
  revision_number: number | null
  reviewer_id: string | null
  reviewer_name: string
  reviewed_at: string
  note: string
}
export interface ReviewContext { review: BidReview | null; fingerprint: string; history?: BidReviewNote[] }
export interface ReviewQueueItem extends BidReview {
  bid: { id: string; job_number: string; name: string; status: string; assignment?: { estimator_id: string | null } | null } | null
  submitter: { first_name: string | null; last_name: string | null; email: string } | null
  revision: { rev_number: number; contract_amount: number } | null
}
export function reviewBelongsTo(review: ReviewQueueItem, userId?: string) {
  if (!userId) return false
  // An explicit assignment (including Unassigned) wins over submission history.
  return (review.bid?.assignment ? review.bid.assignment.estimator_id : review.submitted_by) === userId
}
export function estimatorAttentionCount(items: ReviewQueueItem[], userId?: string) {
  return items.filter(r => r.bid && !['won', 'lost'].includes(r.bid.status) && reviewBelongsTo(r, userId) && r.stage === 'changes_requested' && r.reviewed_by !== null).length
}
export const reviewStageLabel: Record<ReviewStage, string> = {
  ready: 'Ready for review', approved: 'Approved — needs signature', changes_requested: 'Changes requested', signed: 'Signed',
}
export function reviewAttentionCount(items: ReviewQueueItem[]) {
  return items.filter(needsAdminReview).length
}
export function needsAdminReview(review: ReviewQueueItem) {
  return !!review.bid && !['won', 'lost'].includes(review.bid.status) && (
    review.stage === 'ready' || review.stage === 'approved' ||
    (review.stage === 'changes_requested' && review.reviewed_by === null)
  )
}
export function canReviewAction(action: ReviewAction, stage: ReviewStage | null, admin: boolean, editor: boolean) {
  if (action === 'submit') return editor && (!stage || stage === 'changes_requested')
  if (!admin) return false
  if (action === 'approve') return stage === 'ready'
  if (action === 'sign') return stage === 'approved'
  return stage === 'ready' || stage === 'approved' || stage === 'signed' || stage === 'changes_requested'
}
export const notifyReviewChanged = () => window.dispatchEvent(new Event('bid-review-updated'))
