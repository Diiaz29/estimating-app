import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Bid } from '../lib/types'
import { ACTIVE_STATUSES, STATUSES, fmtDueDate, fmtMoney, isOverdue } from '../lib/format'
import StatusBadge from '../components/StatusBadge'

export default function Dashboard() {
  const [bids, setBids] = useState<Bid[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase!
      .from('bids')
      .select('*')
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setBids(data as Bid[])
      })
  }, [])

  if (error) return <ErrorNote message={error} />
  if (!bids) return <p className="text-sm text-slate-500">Loading…</p>

  const active = bids.filter((b) => ACTIVE_STATUSES.includes(b.status))
  const dueList = active
    .filter((b) => b.due_at)
    .sort((a, b) => new Date(a.due_at!).getTime() - new Date(b.due_at!).getTime())
    .slice(0, 8)

  const won = bids.filter((b) => b.status === 'won').length
  const lost = bids.filter((b) => b.status === 'lost').length
  const winRate = won + lost > 0 ? Math.round((won / (won + lost)) * 100) : null

  return (
    <div className="space-y-6">
      {/* Pipeline counts */}
      <section>
        <SectionTitle>Pipeline</SectionTitle>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {STATUSES.filter((s) => ACTIVE_STATUSES.includes(s.value)).map((s) => {
            const inStage = active.filter((b) => b.status === s.value)
            const value = inStage.reduce((sum, b) => sum + (b.bid_value ?? 0), 0)
            return (
              <Link
                key={s.value}
                to={`/bids?status=${s.value}`}
                className="rounded-lg border-2 border-slate-800 bg-white p-3 shadow-[3px_3px_0_0_rgba(15,23,42,0.12)] hover:-translate-y-0.5 transition-transform"
              >
                <div className="font-mono text-[11px] uppercase tracking-widest text-slate-500">
                  {s.label}
                </div>
                <div className="mt-1 text-2xl font-semibold tabular-nums">{inStage.length}</div>
                <div className="text-xs text-slate-500 tabular-nums">
                  {value > 0 ? fmtMoney(value) : ' '}
                </div>
              </Link>
            )
          })}
        </div>
      </section>

      {/* Due soon */}
      <section>
        <SectionTitle>Due soon</SectionTitle>
        {dueList.length === 0 ? (
          <EmptyNote>
            Nothing with a due date in the pipeline.{' '}
            <Link to="/bids" className="underline">
              Add a bid
            </Link>
            .
          </EmptyNote>
        ) : (
          <div className="overflow-hidden rounded-lg border-2 border-slate-800 bg-white">
            {dueList.map((b, i) => {
              const overdue = isOverdue(b)
              return (
                <Link
                  key={b.id}
                  to={`/bids/${b.id}`}
                  className={`flex items-center gap-3 px-4 py-3 hover:bg-slate-50 ${
                    i > 0 ? 'border-t border-slate-200' : ''
                  }`}
                >
                  <span className="font-mono text-xs text-slate-500">{b.job_number}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{b.name}</span>
                  <StatusBadge status={b.status} />
                  <span
                    className={`whitespace-nowrap text-xs tabular-nums ${
                      overdue ? 'font-semibold text-red-600' : 'text-slate-500'
                    }`}
                  >
                    {overdue ? '⚠ ' : ''}
                    {fmtDueDate(b.due_at)}
                  </span>
                </Link>
              )
            })}
          </div>
        )}
      </section>

      {/* Win rate */}
      <section>
        <SectionTitle>Track record</SectionTitle>
        <div className="flex gap-2">
          <Stat label="Won" value={String(won)} to="/bids?status=won" />
          <Stat label="Lost" value={String(lost)} to="/bids?status=lost" />
          <Stat label="Win rate" value={winRate === null ? '—' : `${winRate}%`} />
        </div>
      </section>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2 font-mono text-[11px] uppercase tracking-widest text-slate-500">
      {children}
    </h2>
  )
}

function Stat({ label, value, to }: { label: string; value: string; to?: string }) {
  const inner = (
    <>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="font-mono text-[11px] uppercase tracking-widest text-slate-500">{label}</div>
    </>
  )
  const cls =
    'flex-1 rounded-lg border-2 border-slate-800 bg-white p-3 text-center shadow-[3px_3px_0_0_rgba(15,23,42,0.12)]'
  if (to) {
    return (
      <Link to={to} className={`${cls} hover:-translate-y-0.5 transition-transform`}>
        {inner}
      </Link>
    )
  }
  return <div className={cls}>{inner}</div>
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border-2 border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">
      {children}
    </p>
  )
}

function ErrorNote({ message }: { message: string }) {
  return (
    <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
      Couldn't load data: {message}
      <br />
      <span className="text-xs">
        If this says a table doesn't exist, the database setup step hasn't run yet.
      </span>
    </p>
  )
}
