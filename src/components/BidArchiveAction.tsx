import { useState } from 'react'
import type { Bid } from '../lib/types'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { notifyReviewChanged } from '../lib/bidReview'
import ConfirmDialog from './ConfirmDialog'

export default function BidArchiveAction({ bid, disabled = false, onChanged }: {
  bid: Bid; disabled?: boolean; onChanged: () => void
}) {
  const { canManageBids } = useAuth()
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!canManageBids || bid.status === 'won') return null
  const archived = !!bid.archive
  async function run() {
    setConfirm(false)
    setBusy(true)
    setError(null)
    try {
      const result = archived
        ? await supabase!.from('bid_archives').delete().eq('bid_id', bid.id).select('bid_id').single()
        : await supabase!.from('bid_archives').insert({ bid_id: bid.id }).select('bid_id').single()
      if (result.error) throw result.error
      notifyReviewChanged()
      onChanged()
    } catch {
      setError(`Could not ${archived ? 'restore' : 'archive'} this bid. Please retry or reload the page.`)
    } finally { setBusy(false) }
  }
  return <>
    <button className="index-secondary" disabled={disabled || busy} title={disabled ? 'Save your pending changes first.' : undefined} onClick={() => archived ? void run() : setConfirm(true)}>{busy ? archived ? 'Restoring…' : 'Archiving…' : archived ? 'Restore bid' : 'Archive bid'}</button>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    {confirm && <ConfirmDialog title="Archive bid" message={`Archive ${bid.job_number} — ${bid.name}? It will leave the dashboard, active bid list, and review notifications. The estimate, plans, notes, revisions, and current status stay saved. Find it under Bids → Archived and restore it anytime.`} confirmLabel="Archive bid" onConfirm={() => void run()} onCancel={() => setConfirm(false)} />}
  </>
}
