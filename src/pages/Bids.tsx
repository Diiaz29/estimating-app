import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { Bid, BidStatus, Customer } from '../lib/types'
import NewBidForm from '../components/NewBidForm'
import ProjectIndex from '../components/ProjectIndex'
import { loadWorkingEstimateTotals } from '../lib/workingEstimates'
import { loadBidArchives, setBidArchived } from '../lib/bidArchives'
import ConfirmDialog from '../components/ConfirmDialog'

interface GcLink {
  bid_id: string
  won_through: boolean
  customer: { company: string } | null
}

export default function Bids() {
  const { canManageBids: canEdit, seesMoney } = useAuth()
  const [estimateResult, setEstimateResult] = useState<{ bids: Bid[]; totals: Map<string, number>; error: string | null } | null>(null)
  const [bids, setBids] = useState<Bid[] | null>(null)
  const totalsLoading = seesMoney && !!bids && estimateResult?.bids !== bids
  const totalsError = seesMoney && estimateResult?.bids === bids ? estimateResult?.error : null
  const estimateTotals = seesMoney && estimateResult?.bids === bids ? estimateResult?.totals : undefined
  const [customers, setCustomers] = useState<Customer[]>([])
  const [gcLinks, setGcLinks] = useState<GcLink[]>([])
  const [error, setError] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [params, setParams] = useSearchParams()
  const filter = (params.get('status') as BidStatus | null) ?? null
  const [followupDays, setFollowupDays] = useState(7)
  const [archives, setArchives] = useState({ ids: new Set<string>(), available: false })
  const [archiveTarget, setArchiveTarget] = useState<Bid | null>(null)
  const [archiveBusy, setArchiveBusy] = useState(false)
  const [archiveError, setArchiveError] = useState<string | null>(null)
  const showArchived = params.get('view') === 'archived'

  async function load() {
    setError(null)
    const [bidsRes, custRes, setRes, gcRes, archiveState] = await Promise.all([
      supabase!.from('bids').select('*').order('created_at', { ascending: false }),
      supabase!.from('customers').select('*').order('company'),
      supabase!.from('settings').select('value').eq('key', 'followup_days').single(),
      supabase!.from('bid_customers').select('bid_id, won_through, customer:customers(company)'),
      loadBidArchives(),
    ])
    setArchives(archiveState)
    if (bidsRes.error) setError(bidsRes.error.message)
    else setBids(bidsRes.data as Bid[])
    if (custRes.data) setCustomers(custRes.data as Customer[])
    if (setRes.data) setFollowupDays(Number(setRes.data.value))
    if (gcRes.data) setGcLinks(gcRes.data as unknown as GcLink[])
  }

  // "won through" GC first; otherwise the first one attached; +N when bidding to several
  const gcLabel = (bidId: string) => {
    const links = gcLinks.filter((l) => l.bid_id === bidId && l.customer)
    if (links.length === 0) return null
    const primary = links.find((l) => l.won_through) ?? links[0]
    return `${primary.customer!.company}${links.length > 1 ? ` +${links.length - 1}` : ''}`
  }

  useEffect(() => {
    void load().catch(() => setError('Could not load bids. Refresh to try again.'))
  }, [])

  useEffect(() => {
    let cancelled = false
    if (!bids || !seesMoney) return
    void loadWorkingEstimateTotals(bids).then(totals => {
      if (!cancelled) setEstimateResult({ bids, totals, error: null })
    }).catch(() => {
      if (!cancelled) setEstimateResult({ bids, totals: new Map(), error: 'Estimate totals could not be loaded. Refresh to try again.' })
    })
    return () => { cancelled = true }
  }, [bids, seesMoney])

  async function changeArchive() {
    if (!archiveTarget || archiveBusy) return
    setArchiveBusy(true)
    setArchiveError(null)
    try {
      await setBidArchived(archiveTarget.id, !showArchived)
      setArchives(current => {
        const ids = new Set(current.ids)
        if (showArchived) ids.delete(archiveTarget.id)
        else ids.add(archiveTarget.id)
        return { ...current, ids }
      })
      setArchiveTarget(null)
    } catch { setArchiveError('The archive change could not be saved. Please try again.') }
    finally { setArchiveBusy(false) }
  }

  if (error)
    return <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>

  if (!bids) return <section className="zaid-page zaid-bids" aria-busy="true"><h1>Your bids</h1><p role="status">Loading your bids…</p></section>

  return (
    <div className="zaid-page zaid-bids space-y-4">
      {totalsError && <p role="alert">{totalsError}</p>}
      {archiveError && <p role="alert">{archiveError}</p>}
      {showArchived && !archives.available && <p role="status">Archive saving will be available after this update is published.</p>}
      <ProjectIndex valuesLoading={totalsLoading} followupDays={followupDays} bids={bids.filter(b => archives.ids.has(b.id) === showArchived)} contractor={gcLabel} valueFor={(b) => estimateTotals?.get(b.id) ?? null} onNew={canEdit && !showArchived ? () => setShowNew(true) : undefined} title={showArchived ? 'Archived bids' : 'Your bids'} statusFilter={showArchived ? undefined : filter} onStatusFilter={(status) => setParams(status ? { status } : {})} archiveControls={{ showArchived, count: bids.filter(b => archives.ids.has(b.id)).length, onShowArchived: archived => setParams(archived ? { view: 'archived' } : {}), onToggle: canEdit ? setArchiveTarget : undefined, available: archives.available }} />
      {archiveTarget && <ConfirmDialog title={showArchived ? 'Restore bid' : 'Archive bid'} message={archiveBusy ? 'Saving…' : archiveError ? archiveError : showArchived ? `Restore ${archiveTarget.job_number} — ${archiveTarget.name} to the regular bid list? Its original status and estimate will be kept.` : `Archive ${archiveTarget.job_number} — ${archiveTarget.name}? It will leave your active list and reminders. The estimate, notes, files, and status are kept, and you can restore it anytime.`} confirmLabel={showArchived ? 'Restore bid' : 'Archive bid'} onConfirm={() => void changeArchive()} onCancel={() => { if (!archiveBusy) setArchiveTarget(null) }} />}
      {showNew && (
        <NewBidForm
          customers={customers}
          existingNumbers={(bids ?? []).map((b) => b.job_number)}
          onClose={() => setShowNew(false)}
          onCreated={() => {
            setShowNew(false)
            void load()
          }}
        />
      )}
    </div>
  )
}
