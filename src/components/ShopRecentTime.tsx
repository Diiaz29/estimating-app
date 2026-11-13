import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { errorMessage } from '../lib/loadResults'
import { timeCategoryLabel } from '../lib/timeCategories'
import type { ShopWorker } from './ShopWorkers'
import LoadError from './LoadError'

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
  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const result = await supabase!.from('time_entries')
          .select('id,work_date,hours,kind,night,note,job:bids(job_number,name)')
          .eq('shop_worker_id', worker.id)
          .order('work_date', { ascending: false })
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .limit(20)
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
  }, [worker.id, refresh, retry])

  return <section className="min-w-0 rounded-lg border border-slate-200 bg-white overflow-hidden" aria-label="Recent time entries">
    <div className="p-5 border-b border-slate-200">
      <h2>Recent time — {worker.first_name} {worker.last_name}</h2>
      <p className="text-sm text-slate-500">Latest 20 entries, newest work date first. Need a correction? Ask an admin.</p>
    </div>
    {error ? <div className="p-5"><LoadError error={error} subject="recent time entries" retry={() => setRetry(current => current + 1)} /></div>
      : loading ? <p className="p-5 text-sm text-slate-500" role="status">Loading recent time…</p>
      : !entries.length ? <p className="p-5 text-sm text-slate-500">No time entries saved for {worker.first_name} yet.</p>
      : <ul className="divide-y divide-slate-200 lg:max-h-[32rem] lg:overflow-y-auto" tabIndex={0} aria-label="Saved time entries">
        {entries.map(entry => <li key={entry.id} className="p-5 space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <time dateTime={entry.work_date} className="font-medium">{new Date(`${entry.work_date}T12:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</time>
            <strong className="tabular-nums">{Number(entry.hours).toLocaleString(undefined, { maximumFractionDigits: 2 })} hrs</strong>
          </div>
          <p className="break-words">{entry.job ? [entry.job.job_number, entry.job.name].filter(Boolean).join(' — ') : 'Job unavailable'}</p>
          <p className="text-sm text-slate-500">{timeCategoryLabel(entry.kind)}{entry.night ? ' · Night work' : ''}</p>
          {entry.note && <p className="text-sm whitespace-pre-wrap break-words">{entry.note}</p>}
        </li>)}
      </ul>}
  </section>
}
