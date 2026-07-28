import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { Bid, Revision } from '../lib/types'
import { fmtMoney } from '../lib/format'

interface GcLink {
  bid_id: string
  won_through: boolean
  customer: { company: string } | null
}

export default function Jobs() {
  const { isAdmin, canEdit } = useAuth()
  const [jobs, setJobs] = useState<Bid[] | null>(null)
  const [gcLinks, setGcLinks] = useState<GcLink[]>([])
  const [revisions, setRevisions] = useState<Revision[]>([])
  const [showCompleted, setShowCompleted] = useState(false)
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
  const completedJobs = jobs.filter((b) => b.completed_at)
  const visible = showCompleted ? completedJobs : activeJobs
  const totalValue = activeJobs.reduce((s, b) => s + (valueFor(b) ?? 0), 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Jobs</h1>
          <p className="mt-0.5 text-sm text-slate-500">Won work — this is what the shop builds.</p>
        </div>
        <div className="ml-auto rounded-lg border-2 border-slate-800 bg-white px-4 py-2 text-right shadow-[3px_3px_0_0_rgba(15,23,42,0.12)]">
          <div className="text-lg font-semibold tabular-nums">{fmtMoney(totalValue)}</div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
            {activeJobs.length} active job{activeJobs.length === 1 ? '' : 's'}
          </div>
        </div>
      </div>

      {completedJobs.length > 0 && (
        <div className="flex gap-2">
          <button
            onClick={() => setShowCompleted(false)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              !showCompleted ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-600 hover:border-slate-500'
            }`}
          >
            Active ({activeJobs.length})
          </button>
          <button
            onClick={() => setShowCompleted(true)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              showCompleted ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-600 hover:border-slate-500'
            }`}
          >
            Completed ({completedJobs.length})
          </button>
        </div>
      )}

      {visible.length === 0 ? (
        <p className="rounded-lg border-2 border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
          {showCompleted ? 'Nothing completed yet.' : 'Nothing won yet — when a bid is marked Won, it moves here.'}
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border-2 border-slate-800 bg-white">
          {visible.map((b, i) => {
            const value = valueFor(b)
            const gc = gcFor(b.id)
            return (
              <div
                key={b.id}
                className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 ${i > 0 ? 'border-t border-slate-200' : ''}`}
              >
                <Link to={`/bids/${b.id}`} className="flex min-w-0 flex-1 basis-48 items-center gap-3 hover:underline">
                  <span className="font-mono text-xs text-slate-500">{b.job_number}</span>
                  <span className="min-w-0 truncate text-sm font-medium">{b.name}</span>
                  {gc && (
                    <span className="hidden min-w-0 truncate text-xs text-slate-400 sm:block">{gc}</span>
                  )}
                </Link>
                <span className="flex flex-wrap items-center gap-2">
                  <Link to={`/bids/${b.id}/estimate`} className="rounded-md border border-slate-300 px-2 py-0.5 text-xs font-medium text-slate-600 hover:bg-slate-100">
                    Estimate
                  </Link>
                  <Link to={`/bids/${b.id}/proposal`} className="rounded-md border border-slate-300 px-2 py-0.5 text-xs font-medium text-slate-600 hover:bg-slate-100">
                    Proposal
                  </Link>
                  <Link to={`/bids/${b.id}/schedule`} className="rounded-md border border-slate-300 px-2 py-0.5 text-xs font-medium text-slate-600 hover:bg-slate-100">
                    Schedule
                  </Link>
                  <Link to={`/bids/${b.id}/order`} className="rounded-md border border-slate-300 px-2 py-0.5 text-xs font-medium text-slate-600 hover:bg-slate-100">
                    Order sheet
                  </Link>
                  {isAdmin && (
                    <Link to={`/bids/${b.id}/actuals`} className="rounded-md border border-slate-300 px-2 py-0.5 text-xs font-medium text-slate-600 hover:bg-slate-100">
                      Actuals
                    </Link>
                  )}
                </span>
                <span className="text-sm font-semibold tabular-nums">{value == null ? '—' : fmtMoney(value)}</span>
                {canEdit && (
                  <button
                    onClick={() => void setComplete(b, !b.completed_at)}
                    title={b.completed_at ? 'Put this job back on the active list' : 'Job is finished — move it off the active list'}
                    className={`rounded-md border px-2 py-0.5 text-xs font-medium ${
                      b.completed_at
                        ? 'border-slate-300 text-slate-600 hover:bg-slate-100'
                        : 'border-emerald-600 text-emerald-700 hover:bg-emerald-50'
                    }`}
                  >
                    {b.completed_at ? 'Reopen' : '✓ Complete'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
