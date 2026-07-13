import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { Bid, Customer, Revision } from '../lib/types'
import { fmtMoney } from '../lib/format'

interface BidCustomerRow {
  bid_id: string
  customer_id: string
  won_through: boolean
}

export default function Reports() {
  const { isAdmin } = useAuth()
  const [bids, setBids] = useState<Bid[] | null>(null)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [links, setLinks] = useState<BidCustomerRow[]>([])
  const [revisions, setRevisions] = useState<Revision[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      const [bidRes, custRes, linkRes, revRes] = await Promise.all([
        supabase!.from('bids').select('*'),
        supabase!.from('customers').select('*'),
        supabase!.from('bid_customers').select('bid_id, customer_id, won_through'),
        supabase!
          .from('revisions')
          .select('id, bid_id, rev_number, note, contract_amount, tax, true_cost, profit, margin_pct, created_by, created_at')
          .order('rev_number'),
      ])
      if (bidRes.error) return setError(bidRes.error.message)
      setBids(bidRes.data as Bid[])
      setCustomers((custRes.data ?? []) as Customer[])
      setLinks((linkRes.data ?? []) as BidCustomerRow[])
      setRevisions((revRes.data ?? []) as Revision[])
    })()
  }, [])

  /** Latest revision per bid (list is ordered by rev_number ascending). */
  const latestRev = useMemo(() => {
    const map = new Map<string, Revision>()
    for (const r of revisions) map.set(r.bid_id, r)
    return map
  }, [revisions])

  const bidValue = (b: Bid) => {
    const rev = latestRev.get(b.id)
    return rev ? Number(rev.contract_amount) : b.bid_value == null ? null : Number(b.bid_value)
  }

  const byGC = useMemo(() => {
    if (!bids) return []
    const bidById = new Map(bids.map((b) => [b.id, b]))
    const rows = customers.map((c) => {
      const myLinks = links.filter((l) => l.customer_id === c.id)
      const myBids = myLinks.map((l) => bidById.get(l.bid_id)).filter(Boolean) as Bid[]
      const won = myBids.filter(
        (b) => b.status === 'won' && (myLinks.find((l) => l.bid_id === b.id)?.won_through || myLinks.length === 1),
      )
      const wonAny = myBids.filter((b) => b.status === 'won')
      const lost = myBids.filter((b) => b.status === 'lost')
      const decided = wonAny.length + lost.length
      const wonValue = won.reduce((s, b) => s + (bidValue(b) ?? 0), 0)
      return {
        customer: c,
        total: myBids.length,
        won: wonAny.length,
        lost: lost.length,
        winRate: decided > 0 ? wonAny.length / decided : null,
        wonValue,
      }
    })
    return rows.filter((r) => r.total > 0).sort((a, b) => b.wonValue - a.wonValue)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bids, customers, links, latestRev])

  if (!isAdmin) {
    return (
      <p className="rounded-lg border-2 border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
        Admins only.
      </p>
    )
  }
  if (error)
    return <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>
  if (!bids) return <p className="text-sm text-slate-500">Loading…</p>

  const wonBids = bids
    .filter((b) => b.status === 'won')
    .sort((a, b) => (b.updated_at > a.updated_at ? 1 : -1))
  const lostBids = bids.filter((b) => b.status === 'lost')

  const totalWonValue = wonBids.reduce((s, b) => s + (bidValue(b) ?? 0), 0)
  const margins = wonBids
    .map((b) => latestRev.get(b.id)?.margin_pct)
    .filter((m): m is number => m != null)
    .map(Number)
  const avgMargin = margins.length > 0 ? margins.reduce((s, m) => s + m, 0) / margins.length : null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Reports</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Values use the latest snapshot when one exists, otherwise the bid's estimated value.
        </p>
      </div>

      {/* Headline stats */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Jobs won" value={String(wonBids.length)} />
        <Stat label="Jobs lost" value={String(lostBids.length)} />
        <Stat label="Won value" value={fmtMoney(totalWonValue)} />
        <Stat label="Avg margin (won)" value={avgMargin == null ? '—' : `${(avgMargin * 100).toFixed(1)}%`} />
      </div>

      {/* Win/loss by GC */}
      <section>
        <h2 className="mb-2 font-mono text-[11px] uppercase tracking-widest text-slate-500">
          Win / loss by contractor
        </h2>
        {byGC.length === 0 ? (
          <p className="rounded-lg border-2 border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">
            No bids linked to contractors yet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border-2 border-slate-800 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left font-mono text-[10px] uppercase tracking-wider text-slate-400">
                  <th className="px-4 py-2 font-medium">Contractor</th>
                  <th className="px-2 py-2 font-medium text-right">Bids</th>
                  <th className="px-2 py-2 font-medium text-right">Won</th>
                  <th className="px-2 py-2 font-medium text-right">Lost</th>
                  <th className="px-2 py-2 font-medium text-right">Win rate</th>
                  <th className="px-4 py-2 font-medium text-right">Won value</th>
                </tr>
              </thead>
              <tbody>
                {byGC.map((r) => (
                  <tr key={r.customer.id} className="border-t border-slate-100">
                    <td className="px-4 py-2">
                      <Link to={`/contractors/${r.customer.id}`} className="hover:underline">
                        {r.customer.company}
                      </Link>
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{r.total}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-emerald-700">{r.won}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-red-600">{r.lost}</td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {r.winRate == null ? '—' : `${Math.round(r.winRate * 100)}%`}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{fmtMoney(r.wonValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Won-job margins */}
      <section>
        <h2 className="mb-2 font-mono text-[11px] uppercase tracking-widest text-slate-500">
          Won jobs — contract & margin
        </h2>
        {wonBids.length === 0 ? (
          <p className="rounded-lg border-2 border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">
            Nothing won yet — get after it.
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border-2 border-slate-800 bg-white">
            {wonBids.map((b, i) => {
              const rev = latestRev.get(b.id)
              const value = bidValue(b)
              return (
                <Link
                  key={b.id}
                  to={`/bids/${b.id}`}
                  className={`flex flex-wrap items-center gap-x-3 px-4 py-2.5 hover:bg-slate-50 ${i > 0 ? 'border-t border-slate-100' : ''}`}
                >
                  <span className="font-mono text-xs text-slate-500">{b.job_number}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{b.name}</span>
                  {!rev && <span className="text-[10px] font-mono uppercase text-slate-400">no snapshot</span>}
                  <span className="text-sm font-semibold tabular-nums">{value == null ? '—' : fmtMoney(value)}</span>
                  <span className="w-14 text-right text-xs tabular-nums text-slate-500">
                    {rev?.margin_pct == null ? '' : `${(Number(rev.margin_pct) * 100).toFixed(1)}%`}
                  </span>
                </Link>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border-2 border-slate-800 bg-white p-3 text-center shadow-[3px_3px_0_0_rgba(15,23,42,0.12)]">
      <div className="text-xl font-semibold tabular-nums">{value}</div>
      <div className="font-mono text-[10px] uppercase tracking-widest text-slate-500">{label}</div>
    </div>
  )
}
