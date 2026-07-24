import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Bid } from '../lib/types'
import { ACTIVE_STATUSES, STATUSES, fmtDueDate, fmtFollowUp, fmtMoney, followUpAt, isOverdue } from '../lib/format'
import StatusBadge from '../components/StatusBadge'

export default function Dashboard() {
  const [bids, setBids] = useState<Bid[] | null>(null)
  const [followupDays, setFollowupDays] = useState(7)
  const [revValues, setRevValues] = useState<Map<string, number>>(new Map())
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase!
      .from('bids')
      .select('*')
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setBids(data as Bid[])
      })
    supabase!
      .from('settings')
      .select('value')
      .eq('key', 'followup_days')
      .single()
      .then(({ data }) => {
        if (data) setFollowupDays(Number(data.value))
      })
    // latest revision's contract amount = the real job value (bid_value can lag)
    supabase!
      .from('revisions')
      .select('bid_id, rev_number, contract_amount')
      .order('rev_number')
      .then(({ data }) => {
        if (data) {
          const m = new Map<string, number>()
          for (const r of data) m.set(r.bid_id, Number(r.contract_amount))
          setRevValues(m)
        }
      })
  }, [])

  if (error) return <ErrorNote message={error} />
  if (!bids) return <p className="text-sm text-slate-500">Loading…</p>

  const active = bids.filter((b) => ACTIVE_STATUSES.includes(b.status))
  const dueList = active
    .filter((b) => b.due_at && b.status !== 'sent')
    .sort((a, b) => new Date(a.due_at!).getTime() - new Date(b.due_at!).getTime())
    .slice(0, 8)
  const sentList = active
    .filter((b) => b.status === 'sent')
    .sort((a, b) => {
      const fa = followUpAt(a, followupDays)?.getTime() ?? 0
      const fb = followUpAt(b, followupDays)?.getTime() ?? 0
      return fa - fb
    })
    .slice(0, 8)

  const jobs = bids
    .filter((b) => b.status === 'won')
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
  const jobValue = (b: Bid) => revValues.get(b.id) ?? (b.bid_value == null ? null : Number(b.bid_value))

  const won = jobs.length
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

      {/* Sent — waiting on an answer */}
      {sentList.length > 0 && (
        <section>
          <SectionTitle>Sent — follow up</SectionTitle>
          <div className="overflow-hidden rounded-lg border-2 border-slate-800 bg-white">
            {sentList.map((b, i) => {
              const followUp = followUpAt(b, followupDays)
              const followUpDue = followUp !== null && followUp.getTime() <= Date.now()
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
                  <span className="hidden sm:block text-xs tabular-nums text-slate-500">
                    {fmtMoney(b.bid_value)}
                  </span>
                  <span
                    className={`whitespace-nowrap text-xs ${
                      followUpDue ? 'font-semibold text-amber-600' : 'text-slate-500'
                    }`}
                  >
                    {followUp
                      ? followUpDue
                        ? '☎ follow up'
                        : `follow up ${fmtFollowUp(followUp)}`
                      : '—'}
                  </span>
                </Link>
              )
            })}
          </div>
        </section>
      )}

      {/* Active jobs (won work) */}
      {jobs.length > 0 && (
        <section>
          <div className="mb-2 flex items-baseline">
            <SectionTitle>Jobs</SectionTitle>
            <Link to="/jobs" className="ml-auto text-xs text-slate-500 underline hover:text-slate-900">
              All jobs →
            </Link>
          </div>
          <div className="overflow-hidden rounded-lg border-2 border-slate-800 bg-white">
            {jobs.map((b, i) => (
              <Link
                key={b.id}
                to={`/bids/${b.id}`}
                className={`flex items-center gap-3 px-4 py-3 hover:bg-slate-50 ${
                  i > 0 ? 'border-t border-slate-200' : ''
                }`}
              >
                <span className="font-mono text-xs text-slate-500">{b.job_number}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{b.name}</span>
                <span className="text-sm font-semibold tabular-nums">
                  {jobValue(b) == null ? '—' : fmtMoney(jobValue(b))}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Win rate */}
      <section>
        <SectionTitle>Track record</SectionTitle>
        <div className="flex gap-2">
          <Stat label="Won" value={String(won)} to="/jobs" />
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
