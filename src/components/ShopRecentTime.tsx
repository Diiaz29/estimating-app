import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { errorMessage } from '../lib/loadResults'
import { timeCategoryLabel } from '../lib/timeCategories'
import type { ShopWorker } from './ShopWorkers'
import LoadError from './LoadError'
import { toDay } from '../lib/schedule'
import { timeWeek } from '../lib/timeWeek'

interface RecentEntry {
  id: string
  work_date: string
  hours: number
  kind: string
  night: boolean
  note: string | null
  job: { job_number: string | null; name: string } | null
}

export default function ShopRecentTime({ worker, refresh }: { worker: ShopWorker; refresh: number }) {
  const [entries, setEntries] = useState<RecentEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const [week, setWeek] = useState(() => timeWeek(toDay(new Date())))
  const currentWeek = timeWeek(toDay(new Date()))
  const formatDay = (day: string) => new Date(`${day}T12:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  function changeWeek(next: { start: string; end: string }) {
    setLoading(true)
    setEntries([])
    setError(null)
    setWeek(next)
  }
  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const result = await supabase!.from('time_entries')
          .select('id,work_date,hours,kind,night,note,job:bids(job_number,name)')
          .eq('shop_worker_id', worker.id)
          .gte('work_date', week.start)
          .lte('work_date', week.end)
          .order('work_date', { ascending: false })
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
        if (result.error) throw result.error
        if (!cancelled) setEntries((result.data ?? []) as unknown as RecentEntry[])
      } catch (e) {
        if (!cancelled) setError(errorMessage(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    const timer = window.setInterval(() => void load(), 30000)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [worker.id, refresh, retry, week.start, week.end])

  return <section className="min-w-0 rounded-lg border border-slate-200 bg-white overflow-hidden" aria-label="Recent time entries">
    <div className="p-5 border-b border-slate-200">
      <h2>Weekly time — {worker.first_name} {worker.last_name}</h2>
      <p className="mt-2 font-medium" aria-live="polite">{formatDay(week.start)} – {formatDay(week.end)}</p>
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Choose time week">
        <button type="button" className="index-secondary" onClick={() => changeWeek(timeWeek(week.start, -1))}>Previous week</button>
        <button type="button" className="index-secondary" disabled={week.start === currentWeek.start} onClick={() => changeWeek(currentWeek)}>This week</button>
        <button type="button" className="index-secondary" onClick={() => changeWeek(timeWeek(week.start, 1))}>Next week</button>
      </div>
      <p className="mt-3 text-sm text-slate-500">Monday–Sunday. Need a correction? Ask an admin.</p>
    </div>
    {error ? <div className="p-5"><LoadError error={error} subject="recent time entries" retry={() => setRetry(current => current + 1)} /></div>
      : loading ? <p className="p-5 text-sm text-slate-500" role="status">Loading recent time…</p>
      : !entries.length ? <p className="p-5 text-sm text-slate-500">No time entries saved for {worker.first_name} this week.</p>
      : <><p className="px-5 py-3 border-b border-slate-200 text-sm">Week total: <strong className="tabular-nums">{entries.reduce((total, entry) => total + Number(entry.hours), 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} hrs</strong></p>
      <ul className="divide-y divide-slate-200 lg:max-h-[32rem] lg:overflow-y-auto" tabIndex={0} aria-label="Saved time entries">
        {entries.map(entry => <li key={entry.id} className="p-5 space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <time dateTime={entry.work_date} className="font-medium">{new Date(`${entry.work_date}T12:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</time>
            <strong className="tabular-nums">{Number(entry.hours).toLocaleString(undefined, { maximumFractionDigits: 2 })} hrs</strong>
          </div>
          <p className="break-words">{entry.job ? [entry.job.job_number, entry.job.name].filter(Boolean).join(' — ') : 'Job unavailable'}</p>
          <p className="text-sm text-slate-500">{timeCategoryLabel(entry.kind)}{entry.night ? ' · Night work' : ''}</p>
          {entry.note && <p className="text-sm whitespace-pre-wrap break-words">{entry.note}</p>}
        </li>)}
      </ul></>}
  </section>
}
