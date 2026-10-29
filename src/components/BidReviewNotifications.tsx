import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { profileName } from '../lib/profileName'
import { estimatorAttentionCount, needsAdminReview, reviewAttentionCount, reviewBelongsTo, reviewStageLabel, type ReviewQueueItem } from '../lib/bidReview'
import { fmtMoney } from '../lib/format'
import { ReviewNotifications, useReviewNotifications } from '../lib/reviewNotificationsContext'

export function BidReviewNotificationsProvider({ children }: { children: ReactNode }) {
  const { canEdit } = useAuth()
  const { pathname } = useLocation()
  const [items, setItems] = useState<ReviewQueueItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const request = useRef(0)
  const cancel = useCallback(() => { request.current += 1 }, [])
  const reload = useCallback(async () => {
    const current = ++request.current
    if (!canEdit) { setItems([]); setLoading(false); setError(null); return }
    const { data, error: loadError } = await supabase!.from('bid_reviews').select('*, bid:bids(id,job_number,name,status,assignment:bid_estimator_assignments(estimator_id)), submitter:profiles!bid_reviews_submitted_by_fkey(first_name,last_name,email), revision:revisions(rev_number,contract_amount)').order('submitted_at')
    if (request.current !== current) return
    setLoading(false)
    setError(loadError ? 'Review notifications are unavailable. Please retry.' : null)
    if (!loadError) setItems((data ?? []) as unknown as ReviewQueueItem[])
  }, [canEdit])
  useEffect(() => {
    void reload()
    const refresh = () => { if (document.visibilityState === 'visible') void reload() }
    const timer = window.setInterval(refresh, 30000)
    window.addEventListener('focus', refresh)
    window.addEventListener('bid-review-updated', refresh)
    return () => { cancel(); clearInterval(timer); window.removeEventListener('focus', refresh); window.removeEventListener('bid-review-updated', refresh) }
  }, [reload, cancel])
  useEffect(() => { void reload() }, [pathname, reload])
  return <ReviewNotifications.Provider value={{ items, loading, error, reload: () => void reload() }}>{children}</ReviewNotifications.Provider>
}
export function ReviewNotificationBadge() {
  const { isAdmin, canEdit, session } = useAuth()
  const { items, error } = useReviewNotifications()
  const count = isAdmin ? reviewAttentionCount(items) : estimatorAttentionCount(items, session?.user.id)
  return canEdit && !error ? <ReviewCountBadge count={count} /> : null
}
export function ReviewCountBadge({ count }: { count: number }) {
  return count > 0 ? <span className="review-count" aria-label={`${count} bids need your attention`}>{count}</span> : null
}
export function BidReviewQueue({ items, admin, userId }: { items: ReviewQueueItem[]; admin: boolean; userId?: string }) {
  const active = items.filter(r => r.bid && !['won', 'lost'].includes(r.bid.status) && (admin ? needsAdminReview(r) : reviewBelongsTo(r, userId)))
  return <section id="bid-review-queue" className="bid-review-queue" aria-label={admin ? 'Bids needing your attention' : 'Your bids'}>
    <div className="review-queue-heading"><h2>{admin ? 'Needs your attention' : 'Your bids'}</h2><span className="review-count">{active.length}</span></div>
    {!active.length ? <p className="review-queue-empty">{admin ? 'No bids waiting for review or signature.' : 'Submit a finished estimate for review to see its progress here.'}</p> : <div className="review-queue-list">{active.map(r => <div className="review-queue-row" key={r.bid_id}>
      <div className="review-queue-project"><span>{r.bid!.job_number}</span><strong>{r.bid!.name}</strong><small>Submitted by {r.submitter ? profileName(r.submitter) : 'Team member'} · {new Date(r.submitted_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}{r.revision && ` · R${r.revision.rev_number}`}</small>{r.stage === 'changes_requested' && r.note && <p>{r.note}</p>}</div>
      <div className="review-queue-next"><span className={`review-stage review-stage-${r.stage}`}>{reviewStageLabel[r.stage]}</span>{r.revision && <span className="tabular-nums">{fmtMoney(Number(r.revision.contract_amount))}</span>}</div>
      <Link className="index-secondary" to={`/bids/${r.bid_id}/${r.stage === 'approved' ? 'proposal' : admin && r.revision_id ? `revisions/${r.revision_id}` : 'estimate'}`}>{r.stage === 'approved' ? 'Open proposal' : admin ? 'Review estimate' : 'Open estimate'}</Link>
    </div>)}</div>}
  </section>
}
export function DashboardReviewNotifications() {
  const { canEdit, isAdmin, session } = useAuth()
  const { items, loading, error, reload } = useReviewNotifications()
  if (!canEdit) return null
  if (error) return <p className="review-queue-empty" role="status">{error} <button className="index-secondary" onClick={reload}>Retry notifications</button></p>
  if (loading) return <p className="review-queue-empty" role="status">Checking bids awaiting review…</p>
  return <BidReviewQueue items={items} admin={isAdmin} userId={session?.user.id} />
}
