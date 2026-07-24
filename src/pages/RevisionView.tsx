import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { fmtDueDate, fmtMoney } from '../lib/format'

interface DisplayLine {
  label: string
  category: string
  qty: number
  entry: string | null
  unit: string
  linePrice: number
  note: string | null
}
interface DisplayArea {
  name: string
  sheet_ref: string | null
  multiplier: number
  is_alternate: boolean
  total: number
  lines: DisplayLine[]
}
interface RevisionRow {
  id: string
  bid_id: string
  rev_number: number
  contract_amount: number
  tax: number
  true_cost: number | null
  profit: number | null
  margin_pct: number | null
  created_by: string | null
  created_at: string
  snapshot: {
    display?: {
      job_number: string
      bid_name: string
      areas: DisplayArea[]
      adders: { label: string; price: number; enabled: boolean }[]
      finishes: { slot: string; name: string }[]
    }
    totals?: { cabinetTotal: number; addersTotal: number; alternatesTotal: number }
  }
}

export default function RevisionView() {
  const { id, revId } = useParams<{ id: string; revId: string }>()
  const { isAdmin } = useAuth()
  const [rev, setRev] = useState<RevisionRow | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase!
      .from('revisions')
      .select('*')
      .eq('id', revId!)
      .single()
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setRev(data as RevisionRow)
      })
  }, [revId])

  if (error)
    return <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>
  if (!rev) return <p className="text-sm text-slate-500">Loading…</p>

  const d = rev.snapshot.display
  const totals = rev.snapshot.totals

  return (
    <div className="space-y-5 pb-32">
      <div className="flex flex-wrap items-center gap-3">
        <Link to={`/bids/${id}/estimate`} className="text-sm text-slate-500 hover:text-slate-900">
          ← Back to live estimate
        </Link>
        <span className="rounded-full border border-amber-400 bg-amber-50 px-3 py-1 font-mono text-[11px] uppercase tracking-wider text-amber-800">
          Snapshot R{rev.rev_number} · view only
        </span>
        <span className="text-xs text-slate-500">
          {fmtDueDate(rev.created_at)} {rev.created_by && `· by ${rev.created_by}`}
        </span>
      </div>

      {!d ? (
        <p className="rounded-lg border-2 border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
          This snapshot was taken before the viewer existed, so it only recorded the totals:
          contract {fmtMoney(Number(rev.contract_amount))}, tax {fmtMoney(Number(rev.tax))}.
          New snapshots record every line.
        </p>
      ) : (
        <>
          <h1 className="text-lg font-semibold tracking-tight">
            <span className="mr-2 font-mono text-sm text-slate-500">{d.job_number}</span>
            {d.bid_name}
          </h1>

          {d.finishes.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {d.finishes.map((f) => (
                <span key={f.slot} className="rounded border border-slate-300 bg-slate-50 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-slate-500">
                  {f.slot}: {f.name}
                </span>
              ))}
            </div>
          )}

          {d.areas.map((area, i) => (
            <section key={i} className={`rounded-lg border-2 bg-white ${area.is_alternate ? 'border-violet-700' : 'border-slate-800'}`}>
              <div className={`flex flex-wrap items-center gap-2 border-b px-4 py-2 ${area.is_alternate ? 'border-violet-200 bg-violet-50' : 'border-slate-200'}`}>
                <span className="text-sm font-semibold">{area.name}</span>
                {area.sheet_ref && <span className="font-mono text-xs text-slate-400">{area.sheet_ref}</span>}
                {area.multiplier > 1 && <span className="font-mono text-xs text-slate-500">typ ×{area.multiplier}</span>}
                {area.is_alternate && (
                  <span className="rounded-full border border-violet-700 bg-violet-700 px-2 py-0.5 font-mono text-[10px] uppercase text-white">Alt</span>
                )}
                <span className="ml-auto text-sm font-semibold tabular-nums">{fmtMoney(area.total)}</span>
              </div>
              {area.lines.map((line, j) => (
                <div key={j} className={`flex flex-wrap items-center gap-x-3 px-4 py-1.5 text-sm ${j > 0 ? 'border-t border-slate-100' : ''}`}>
                  <span className="min-w-0 flex-1 basis-40">
                    {line.label}
                    <span className="ml-1.5 font-mono text-[10px] uppercase text-slate-400">{line.category}</span>
                  </span>
                  <span className="text-xs text-slate-500 tabular-nums">
                    {line.entry ?? `${Math.round(line.qty * 1000) / 1000} ${line.unit}`}
                  </span>
                  <span className="w-24 text-right font-medium tabular-nums">{fmtMoney(line.linePrice)}</span>
                </div>
              ))}
            </section>
          ))}

          <section className="rounded-lg border-2 border-slate-800 bg-white">
            <h2 className="border-b border-slate-200 px-4 py-2 font-mono text-[11px] uppercase tracking-widest text-slate-500">
              Added costs
            </h2>
            {d.adders.map((a, i) => (
              <div key={i} className={`flex items-center gap-3 px-4 py-1.5 text-sm ${i > 0 ? 'border-t border-slate-100' : ''}`}>
                <span className={`flex-1 ${a.enabled ? '' : 'text-slate-400 line-through'}`}>{a.label}</span>
                <span className={`tabular-nums ${a.enabled ? '' : 'text-slate-400'}`}>{fmtMoney(a.price)}</span>
              </div>
            ))}
          </section>
        </>
      )}

      {/* Frozen totals bar (sits above the phone tab bar) */}
      <div className="fixed inset-x-0 bottom-[3.4rem] z-20 border-t-2 border-amber-500 bg-amber-50 sm:bottom-0">
        <div className="mx-auto flex max-w-6xl items-stretch divide-x divide-amber-300 overflow-x-auto font-mono">
          {totals && <Cell label="Base bid" value={fmtMoney(totals.cabinetTotal)} />}
          {totals && <Cell label="Added costs" value={fmtMoney(totals.addersTotal)} />}
          <Cell label={`Contract (R${rev.rev_number})`} value={fmtMoney(Number(rev.contract_amount))} strong />
          <Cell label="Tax" value={fmtMoney(Number(rev.tax))} />
          {totals && totals.alternatesTotal > 0 && <Cell label="Alternates" value={fmtMoney(totals.alternatesTotal)} />}
          {isAdmin && rev.margin_pct != null && (
            <Cell label="Margin" value={`${(Number(rev.margin_pct) * 100).toFixed(1)}%`} strong />
          )}
        </div>
      </div>
    </div>
  )
}

function Cell({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex min-w-[7.5rem] flex-1 flex-col px-3 py-2">
      <span className="text-[9px] uppercase tracking-widest text-amber-700">{label}</span>
      <span className={`tabular-nums text-amber-900 ${strong ? 'text-lg font-semibold' : 'text-sm'}`}>{value}</span>
    </div>
  )
}
