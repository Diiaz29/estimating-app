import ProjectIndex from '../components/ProjectIndex'
import ConfirmDialog from '../components/ConfirmDialog'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { Bid, Revision } from '../lib/types'

interface GcLink {
  bid_id: string
  won_through: boolean
  customer: { company: string } | null
}

export default function Jobs() {
  const { canManageBids: canEdit } = useAuth()
  const [jobs, setJobs] = useState<Bid[] | null>(null)
  const [gcLinks, setGcLinks] = useState<GcLink[]>([])
  const [revisions, setRevisions] = useState<Revision[]>([])
  const [showCompleted, setShowCompleted] = useState(false)
  const [jobToComplete, setJobToComplete] = useState<Bid | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    const [bidRes, gcRes, revRes] = await Promise.all([
      supabase!.from('bids').select('*').eq('status', 'won').order('updated_at', { ascending: false }),
      supabase!.from('bid_customers').select('bid_id, won_through, customer:customers(company)'),
      supabase!
        .from('revisions')
        .select('id, bid_id, rev_number, note, contract_amount, tax, true_cost, profit, margin_pct, created_by, created_at')
        .order('rev_number'),
    ])
    if (bidRes.error) return setError(bidRes.error.message)
    setJobs(bidRes.data as Bid[])
    setGcLinks((gcRes.data ?? []) as unknown as GcLink[])
    setRevisions((revRes.data ?? []) as Revision[])
  }

  useEffect(() => {
    void load()
  }, [])

  async function setComplete(b: Bid, done: boolean) {
    const completed_at = done ? new Date().toISOString() : null
    setJobs((prev) => prev!.map((j) => (j.id === b.id ? { ...j, completed_at } : j)))
    await supabase!.from('bids').update({ completed_at }).eq('id', b.id)
  }

  if (error)
    return <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>
  if (!jobs) return <p className="text-sm text-slate-500">Loading…</p>

  const latestRev = new Map<string, Revision>()
  for (const r of revisions) latestRev.set(r.bid_id, r)

  const gcFor = (bidId: string) => {
    const links = gcLinks.filter((l) => l.bid_id === bidId && l.customer)
    if (links.length === 0) return null
    const primary = links.find((l) => l.won_through) ?? links[0]
    return `${primary.customer!.company}${links.length > 1 ? ` +${links.length - 1}` : ''}`
  }
  const valueFor = (b: Bid) => {
    const rev = latestRev.get(b.id)
    return rev ? Number(rev.contract_amount) : b.bid_value == null ? null : Number(b.bid_value)
  }
  const activeJobs = jobs.filter((b) => !b.completed_at)
  const totalValue = activeJobs.reduce((s, b) => s + (valueFor(b) ?? 0), 0)

  return (
    <div className="zaid-page zaid-jobs space-y-4">
      <ProjectIndex
        title="Jobs"
        bids={jobs}
        contractor={gcFor}
        valueFor={valueFor}
        jobControls={{
          showCompleted,
          onShowCompleted: setShowCompleted,
          totalValue,
          onToggleComplete: canEdit ? (bid) => bid.completed_at ? void setComplete(bid, false) : setJobToComplete(bid) : undefined,
        }}
      />
      {jobToComplete && (
        <ConfirmDialog
          title="Mark job complete?"
          message={`Mark “${jobToComplete.name}” complete? It will move from Active to Completed. You can reopen it later.`}
          confirmLabel="Mark complete"
          onCancel={() => setJobToComplete(null)}
          onConfirm={() => {
            void setComplete(jobToComplete, true)
            setJobToComplete(null)
          }}
        />
      )}
    </div>
  )
}
