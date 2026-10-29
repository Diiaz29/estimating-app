import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { notifyReviewChanged, type ReviewAction, type ReviewContext } from './bidReview'

export async function fetchReviewContext(bidId: string): Promise<ReviewContext> {
  const { data, error } = await supabase!.rpc('get_bid_review_context', { p_bid_id: bidId })
  if (error) throw new Error(error.code === 'PGRST202' ? 'The review workflow needs its database update before it can be used.' : error.message)
  if (!data || typeof data.fingerprint !== 'string') throw new Error('Could not load the review status. Please retry.')
  return data as ReviewContext
}
export function useBidReview(bidId: string | undefined, enabled: boolean) {
  const [context, setContext] = useState<ReviewContext | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const reload = useCallback(async () => {
    if (!bidId || !enabled) return
    try { setContext(await fetchReviewContext(bidId)); setError(null) }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load the review status.') }
  }, [bidId, enabled])
  useEffect(() => {
    setContext(null); setError(null); void reload()
    if (!enabled) return
    const refresh = () => { if (document.visibilityState === 'visible') void reload() }
    const timer = window.setInterval(refresh, 30000)
    window.addEventListener('focus', refresh)
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh) }
  }, [reload, enabled])
  async function transition(action: ReviewAction, revisionId?: string, note?: string, estimatorId?: string) {
    if (!bidId || !context || busy) throw new Error('Reload the review status and try again.')
    setBusy(true)
    setError(null)
    try {
      const { data, error: writeError } = action === 'return' && estimatorId !== undefined ? await supabase!.rpc('return_bid_review_to_estimator', {
        p_bid_id: bidId, p_revision_id: revisionId ?? context.review?.revision_id ?? null,
        p_note: note ?? null, p_expected_version: context.review?.version ?? 0, p_estimator_id: estimatorId,
      }) : await supabase!.rpc('transition_bid_review', {
        p_bid_id: bidId, p_action: action, p_revision_id: revisionId ?? context.review?.revision_id ?? null,
        p_note: note ?? null, p_expected_version: context.review?.version ?? 0, p_fingerprint: context.fingerprint,
      })
      if (writeError) throw new Error(writeError.message)
      if (!data?.fingerprint) throw new Error('The review action was not confirmed saved. Reload and check its status.')
      setContext(data as ReviewContext)
      notifyReviewChanged()
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not save the review action.'
      await reload()
      setError(message)
      throw new Error(message)
    } finally { setBusy(false) }
  }
  return { context, error, busy, reload, transition }
}
