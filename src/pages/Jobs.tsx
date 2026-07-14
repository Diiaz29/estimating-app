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
  const { isAdmin } = useAuth()
  const [jobs, setJobs] = useState<Bid[] | null>(null)
  const [gcLinks, setGcLinks] = useState<GcLink[]>([])
  const [revisions, setRevisions] = useState<Revision[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
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
    })()
  }, [])

  if (error)
    return <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>
  if (!jobs) return <p className="text-sm text-slate-500">Loading…</p>

  const latestRev = new Map<string, Revision>()
  for (const r of revisions) latestRev.set(r.bid_id, r)

  const gcFor = (bidId: string) => {
    const links = gcLinks.filter((l) => l.bid_id === bidId)
    return (links.find((l) => l.won_through) ?? links[0])?.customer?.company ?? null
  }
  const valueFor = (b: Bid) => {
    const rev = latestRev.get(b.id)
    return rev ? Number(rev.contract_amount) : b.bid_value == null ? null : Number(b.bid_value)
  }
  const totalValue = jobs.reduce((s, b) => s + (valueFor(b) ?? 0), 0)

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
            {jobs.length} job{jobs.length === 1 ? '' : 's'}
          </div>
        </div>
      </div>

      {jobs.length === 0 ? (
        <p className="rounded-lg border-2 border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
          Nothing won yet — when a bid is marked Won, it moves here.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border-2 border-slate-800 bg-white">
          {jobs.map((b, i) => {
            const value = valueFor(b)
            const gc = gcFor(b.id)
            return (
              <div
                key={b.id}
                className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 ${i > 0 ? 'border-t border-slate-200' : ''}`}
              >
                <Link to={`/bids/${b.id}`} className="flex min-w-0 flex-1 basis-48 items-center gap-3 hover:underline">
                  <span className="font-mono text-xs text-slate-500">{b.job_number}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{b.name}</span>
                </Link>
                {gc && <span className="text-xs text-slate-500">{gc}</span>}
                <span className="text-sm font-semibold tabular-nums">{value == null ? '—' : fmtMoney(value)}</span>
                <span className="flex items-center gap-2">
                  <Link to={`/bids/${b.id}/order`} className="rounded-md border border-slate-300 px-2 py-0.5 text-xs font-medium text-slate-600 hover:bg-slate-100">
                    Order sheet
                  </Link>
                  {isAdmin && (
                    <Link to={`/bids/${b.id}/actuals`} className="rounded-md border border-slate-300 px-2 py-0.5 text-xs font-medium text-slate-600 hover:bg-slate-100">
                      Actuals
                    </Link>
                  )}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
