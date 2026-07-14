import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Bid } from '../lib/types'
import type { JobTask } from '../lib/schedule'
import { completionDate, isWorkday, parseDay, toDay } from '../lib/schedule'

// one color per job, cycled
const JOB_COLORS = [
  'bg-blue-600', 'bg-emerald-600', 'bg-amber-500', 'bg-violet-600',
  'bg-rose-600', 'bg-cyan-600', 'bg-lime-600', 'bg-fuchsia-600',
]

interface Span {
  task: JobTask
  job: Bid
  color: string
  start: Date
  finish: Date
}

export default function Schedule() {
  const [jobs, setJobs] = useState<Bid[] | null>(null)
  const [tasks, setTasks] = useState<JobTask[]>([])
  const [holidays, setHolidays] = useState<Map<string, string | null>>(new Map())
  const [month, setMonth] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      const [jobRes, holRes] = await Promise.all([
        supabase!.from('bids').select('*').eq('status', 'won').order('created_at'),
        supabase!.from('holidays').select('day, name'),
      ])
      if (jobRes.error) return setError(jobRes.error.message)
      const jobRows = jobRes.data as Bid[]
      setJobs(jobRows)
      setHolidays(new Map(((holRes.data ?? []) as { day: string; name: string | null }[]).map((h) => [h.day, h.name])))
      if (jobRows.length > 0) {
        const { data } = await supabase!
          .from('job_tasks')
          .select('*')
          .in('bid_id', jobRows.map((j) => j.id))
          .order('sort_order')
        setTasks((data ?? []) as JobTask[])
      }
    })()
  }, [])

  const spans: Span[] = useMemo(() => {
    if (!jobs) return []
    const holidaySet = new Set(holidays.keys())
    const colorFor = new Map(jobs.map((j, i) => [j.id, JOB_COLORS[i % JOB_COLORS.length]]))
    const jobById = new Map(jobs.map((j) => [j.id, j]))
    return tasks
      .filter((t) => t.start_date)
      .map((t) => {
        const start = parseDay(t.start_date!)
        return {
          task: t,
          job: jobById.get(t.bid_id)!,
          color: colorFor.get(t.bid_id)!,
          start,
          finish: completionDate(start, Number(t.business_days), holidaySet),
        }
      })
  }, [jobs, tasks, holidays])

  if (error)
    return <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>
  if (!jobs) return <p className="text-sm text-slate-500">Loading…</p>

  // calendar grid: weeks covering this month, Sunday-first
  const gridStart = new Date(month)
  gridStart.setDate(1 - gridStart.getDay())
  const cells: Date[] = []
  const d = new Date(gridStart)
  do {
    for (let i = 0; i < 7; i++) {
      cells.push(new Date(d))
      d.setDate(d.getDate() + 1)
    }
  } while (d.getMonth() === month.getMonth())

  const todayKey = toDay(new Date())
  const activeJobs = jobs.filter((j) => spans.some((s) => s.job.id === j.id))
  const jobsWithout = jobs.filter((j) => !spans.some((s) => s.job.id === j.id))
  const colorFor = new Map(jobs.map((j, i) => [j.id, JOB_COLORS[i % JOB_COLORS.length]]))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Production schedule</h1>
          <p className="mt-0.5 text-sm text-slate-500">All jobs together. Click a task to open its job's schedule.</p>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
            className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            ←
          </button>
          <button
            onClick={() => {
              const n = new Date()
              setMonth(new Date(n.getFullYear(), n.getMonth(), 1))
            }}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Today
          </button>
          <button
            onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
            className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            →
          </button>
          <span className="ml-2 w-40 text-right text-base font-semibold tabular-nums">
            {month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
          </span>
        </div>
      </div>

      {/* legend */}
      {activeJobs.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {activeJobs.map((j) => (
            <Link
              key={j.id}
              to={`/bids/${j.id}/schedule`}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-slate-800"
            >
              <span className={`h-2.5 w-2.5 rounded-full ${colorFor.get(j.id)}`} />
              {j.job_number} · {j.name}
            </Link>
          ))}
        </div>
      )}

      {/* calendar */}
      <div className="overflow-x-auto">
        <div className="min-w-[56rem] overflow-hidden rounded-lg border-2 border-slate-800 bg-white">
          <div className="grid grid-cols-7 border-b-2 border-slate-800 bg-slate-100 font-mono text-[10px] uppercase tracking-wider text-slate-500">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((w) => (
              <div key={w} className="px-2 py-1.5">{w}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((day, i) => {
              const key = toDay(day)
              const inMonth = day.getMonth() === month.getMonth()
              const weekend = day.getDay() === 0 || day.getDay() === 6
              const holidayName = holidays.has(key) ? (holidays.get(key) ?? 'Holiday') : null
              // tasks only occupy working days — no bars on weekends or holidays
              const workday = isWorkday(day, new Set(holidays.keys()))
              const dayTasks = workday ? spans.filter((s) => day >= s.start && day <= s.finish) : []
              const shown = dayTasks.slice(0, 4)
              return (
                <div
                  key={i}
                  className={`min-h-24 border-b border-r border-slate-100 p-1 ${
                    !inMonth ? 'bg-slate-50 opacity-50' : weekend || holidayName ? 'bg-slate-50' : ''
                  } ${key === todayKey ? 'ring-2 ring-inset ring-red-400' : ''}`}
                >
                  <div className="flex items-baseline justify-between px-0.5">
                    <span className={`text-xs tabular-nums ${key === todayKey ? 'font-bold text-red-600' : 'text-slate-400'}`}>
                      {day.getDate()}
                    </span>
                    {holidayName && (
                      <span className="truncate font-mono text-[9px] uppercase text-amber-600">{holidayName}</span>
                    )}
                  </div>
                  <div className="mt-0.5 space-y-0.5">
                    {shown.map((s) => (
                      <Link
                        key={s.task.id}
                        to={`/bids/${s.job.id}/schedule`}
                        title={`${s.job.job_number} — ${s.task.name}`}
                        className={`block truncate rounded px-1 py-0.5 text-[10px] font-medium leading-tight text-white ${s.color} ${
                          s.task.done ? 'opacity-40 line-through' : ''
                        }`}
                      >
                        {s.task.name}
                      </Link>
                    ))}
                    {dayTasks.length > shown.length && (
                      <div className="px-1 text-[10px] text-slate-400">+{dayTasks.length - shown.length} more</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {jobsWithout.length > 0 && (
        <section>
          <h2 className="mb-2 font-mono text-[11px] uppercase tracking-widest text-slate-500">
            Jobs with no schedule yet
          </h2>
          <div className="flex flex-wrap gap-2">
            {jobsWithout.map((j) => (
              <Link
                key={j.id}
                to={`/bids/${j.id}/schedule`}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-600 hover:border-slate-800"
              >
                {j.job_number} · {j.name}
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
