import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { Bid } from '../lib/types'

interface TimeEntry {
  id: string
  bid_id: string
  worker: string
  work_date: string
  hours: number
  note: string | null
  kind: string
  created_by: string | null
}

const fmtDay = (iso: string) =>
  new Date(`${iso}T12:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })

/** Shop time clock: pick the job you worked on, log the hours. */
export default function TimeClock() {
  const { session } = useAuth()
  const worker = session?.user.email?.split('@')[0] ?? 'unknown'
  const [jobs, setJobs] = useState<Bid[]>([])
  const [mine, setMine] = useState<TimeEntry[]>([])
  const [jobId, setJobId] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [hours, setHours] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    const [jobRes, mineRes] = await Promise.all([
      supabase!.from('bids').select('*').eq('status', 'won').is('completed_at', null).order('job_number'),
      supabase!
        .from('time_entries')
        .select('*')
        .eq('created_by', session?.user.email ?? '')
        .order('work_date', { ascending: false })
        .limit(30),
    ])
    if (jobRes.error) setError(jobRes.error.message)
    else {
      const rows = jobRes.data as Bid[]
      setJobs(rows)
      setJobId((cur) => cur || rows[0]?.id || '')
    }
    if (mineRes.data) setMine(mineRes.data as TimeEntry[])
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!jobId || !hours) return
    setBusy(true)
    const { error } = await supabase!.from('time_entries').insert({
      bid_id: jobId,
      worker,
      work_date: date,
      hours: Number(hours),
      note: note.trim() || null,
      kind: 'shop',
      created_by: session?.user.email ?? null,
    })
    setBusy(false)
    if (error) setError(error.message)
    else {
      setHours('')
      setNote('')
      void load()
    }
  }

  async function remove(t: TimeEntry) {
    await supabase!.from('time_entries').delete().eq('id', t.id)
    void load()
  }

  const jobName = (bidId: string) => {
    const j = jobs.find((b) => b.id === bidId)
    return j ? `${j.job_number} ${j.name}` : '—'
  }

  if (error)
    return <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Time</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Log your shop hours against the job you worked on. Logging as{' '}
          <span className="font-semibold">{worker}</span>.
        </p>
      </div>

      {jobs.length === 0 ? (
        <p className="rounded-lg border-2 border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
          No active jobs to log time against.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border-2 border-slate-800 bg-white p-4">
          <label className="block">
            <span className="font-mono text-[11px] uppercase tracking-widest text-slate-500">Job</span>
            <select value={jobId} onChange={(e) => setJobId(e.target.value)} className="input">
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.job_number} — {j.name}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="font-mono text-[11px] uppercase tracking-widest text-slate-500">Day</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required className="input" />
            </label>
            <label className="block">
              <span className="font-mono text-[11px] uppercase tracking-widest text-slate-500">Hours</span>
              <input
                type="number" step="0.5" min="0.5" max="24"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                required
                className="input"
              />
            </label>
          </div>
          <label className="block">
            <span className="font-mono text-[11px] uppercase tracking-widest text-slate-500">What you worked on (optional)</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Built break room uppers…" className="input" />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {busy ? 'Logging…' : 'Log time'}
          </button>
        </form>
      )}

      {mine.length > 0 && (
        <section>
          <h2 className="mb-2 font-mono text-[11px] uppercase tracking-widest text-slate-500">My recent time</h2>
          <div className="overflow-hidden rounded-lg border-2 border-slate-800 bg-white">
            {mine.map((t, i) => (
              <div key={t.id} className={`flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2 text-sm ${i > 0 ? 'border-t border-slate-100' : ''}`}>
                <span className="w-24 font-mono text-xs text-slate-500">{fmtDay(t.work_date)}</span>
                <span className="min-w-0 flex-1 basis-40 truncate font-medium">{jobName(t.bid_id)}</span>
                <span className="rounded border border-slate-200 px-1 font-mono text-[9px] uppercase text-slate-400">{t.kind}</span>
                {t.note && <span className="hidden min-w-0 truncate text-xs text-slate-500 sm:block">{t.note}</span>}
                <span className="ml-auto font-semibold tabular-nums">{Number(t.hours).toFixed(1)} hrs</span>
                <button onClick={() => void remove(t)} className="px-1 text-lg leading-none text-slate-300 hover:text-red-600">×</button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
