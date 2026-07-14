import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type {
  Area, Assembly, AssemblyMaterial, Bid, BidFinish, BidMaterialOverride, LineItem, Material, Setting,
} from '../lib/types'
import { buildContext, priceLine } from '../lib/pricing'
import type { JobTask } from '../lib/schedule'
import { completionDate, fmtDay, nextWorkday, parseDay, toDay } from '../lib/schedule'
import ConfirmDialog from '../components/ConfirmDialog'
import ViewOnlyBanner from '../components/ViewOnlyBanner'
import { useAuth } from '../lib/auth'

export default function JobSchedule() {
  const { id } = useParams<{ id: string }>()
  const { canSchedule } = useAuth()
  const [bid, setBid] = useState<Bid | null>(null)
  const [tasks, setTasks] = useState<JobTask[] | null>(null)
  const [holidays, setHolidays] = useState<Set<string>>(new Set())
  const [areas, setAreas] = useState<Area[]>([])
  const [lines, setLines] = useState<LineItem[]>([])
  const [assemblies, setAssemblies] = useState<Assembly[]>([])
  const [bom, setBom] = useState<AssemblyMaterial[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [bidFinishes, setBidFinishes] = useState<BidFinish[]>([])
  const [overrides, setOverrides] = useState<BidMaterialOverride[]>([])
  const [settings, setSettings] = useState<Setting[]>([])
  const [seeding, setSeeding] = useState(false)
  const [removing, setRemoving] = useState<JobTask | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function loadTasks() {
    const { data } = await supabase!
      .from('job_tasks').select('*').eq('bid_id', id!).order('sort_order').order('created_at')
    setTasks((data ?? []) as JobTask[])
  }

  useEffect(() => {
    ;(async () => {
      const [bidRes, holRes, areaRes, asmRes, bomRes, matRes, bfRes, ovrRes, setRes] =
        await Promise.all([
          supabase!.from('bids').select('*').eq('id', id!).single(),
          supabase!.from('holidays').select('day'),
          supabase!.from('areas').select('*').eq('bid_id', id!).order('sort_order'),
          supabase!.from('assemblies').select('*'),
          supabase!.from('assembly_materials').select('*'),
          supabase!.from('materials').select('*'),
          supabase!.from('bid_finishes').select('*, finish:finishes(*)').eq('bid_id', id!),
          supabase!.from('bid_material_overrides').select('*').eq('bid_id', id!),
          supabase!.from('settings').select('*'),
        ])
      if (bidRes.error) return setError(bidRes.error.message)
      setBid(bidRes.data as Bid)
      setHolidays(new Set(((holRes.data ?? []) as { day: string }[]).map((h) => h.day)))
      const areaRows = (areaRes.data ?? []) as Area[]
      setAreas(areaRows)
      if (areaRows.length > 0) {
        const { data } = await supabase!
          .from('line_items').select('*').in('area_id', areaRows.map((a) => a.id))
        setLines((data ?? []) as LineItem[])
      }
      setAssemblies((asmRes.data ?? []) as Assembly[])
      setBom((bomRes.data ?? []) as AssemblyMaterial[])
      setMaterials((matRes.data ?? []) as Material[])
      setBidFinishes((bfRes.data ?? []) as BidFinish[])
      setOverrides((ovrRes.data ?? []) as BidMaterialOverride[])
      setSettings((setRes.data ?? []) as Setting[])
      await loadTasks()
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const ctx = useMemo(
    () =>
      buildContext(
        settings, assemblies, bom, materials, bidFinishes,
        new Map(overrides.map((o) => [o.from_material_id, o.to_material_id])),
      ),
    [settings, assemblies, bom, materials, bidFinishes, overrides],
  )

  if (error)
    return <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>
  if (!bid || !tasks) return <p className="text-sm text-slate-500">Loading…</p>

  async function seed() {
    setSeeding(true)
    const heads = Math.max(1, Number(bid!.labor_heads ?? 1))
    const installHeads = Math.max(1, Number(bid!.install_heads ?? 1))
    const shopRate = ctx.settings.cost_shop_rate ?? 0

    // shop hours + install hours per area, from the same engine the estimate uses
    let installHoursTotal = 0
    const areaHours = areas
      .filter((a) => !a.is_alternate)
      .map((area) => {
        let hours = 0
        for (const line of lines.filter((l) => l.area_id === area.id)) {
          const p = priceLine(line, area, ctx)
          hours += shopRate > 0 ? p.laborCost / shopRate : 0
          installHoursTotal += p.installHours
        }
        return { area, days: Math.max(1, Math.ceil(hours / heads / 8)) }
      })

    const today = nextWorkday(new Date(), holidays)
    const rows: Omit<JobTask, 'id'>[] = []
    let sort = 0
    const push = (name: string, start: Date, days: number) =>
      rows.push({ bid_id: bid!.id, name, start_date: toDay(start), business_days: days, done: false, sort_order: sort++ })

    // ordering block — parallel, starts day one (like the V9 Scope of Work)
    push('Submittals', today, 5)
    push('Order sheet goods and hardware', today, 4)
    push('Order laminate and solid surface', today, 4)

    // manufacture chain — after submittals clear
    let cursor = nextWorkday(completionDate(today, 5, holidays), holidays)
    for (const { area, days } of areaHours) {
      push(`Manufacture ${area.name}`, cursor, days)
      cursor = nextWorkday(completionDate(cursor, days, holidays), holidays)
    }

    push('Prepare casework and countertops for shipping', cursor, 1)
    cursor = nextWorkday(completionDate(cursor, 1, holidays), holidays)
    const installDays = Math.max(1, Math.ceil(installHoursTotal / installHeads / 8))
    push('Install millwork', cursor, installDays)

    const { error } = await supabase!.from('job_tasks').insert(rows)
    if (error) setError(error.message)
    setSeeding(false)
    void loadTasks()
  }

  async function patchTask(t: JobTask, fields: Partial<JobTask>) {
    setTasks((prev) => prev!.map((x) => (x.id === t.id ? { ...x, ...fields } : x)))
    const { error } = await supabase!.from('job_tasks').update(fields).eq('id', t.id)
    if (error) setError(error.message)
  }

  async function addTask() {
    const last = tasks![tasks!.length - 1]
    const start = last?.start_date
      ? nextWorkday(completionDate(parseDay(last.start_date), Number(last.business_days), holidays), holidays)
      : nextWorkday(new Date(), holidays)
    const { data, error } = await supabase!
      .from('job_tasks')
      .insert({ bid_id: bid!.id, name: 'New task', start_date: toDay(start), business_days: 1, sort_order: tasks!.length })
      .select('*')
      .single()
    if (error) setError(error.message)
    else setTasks((prev) => [...prev!, data as JobTask])
  }

  async function removeTask(t: JobTask) {
    setRemoving(null)
    setTasks((prev) => prev!.filter((x) => x.id !== t.id))
    await supabase!.from('job_tasks').delete().eq('id', t.id)
  }

  const doneCount = tasks.filter((t) => t.done).length

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link to={`/bids/${bid.id}`} className="text-sm text-slate-500 hover:text-slate-900">
          ← {bid.job_number}
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-lg font-semibold tracking-tight">
          {bid.name} — schedule
        </h1>
        {tasks.length > 0 && (
          <span className="font-mono text-xs text-slate-500">
            {doneCount}/{tasks.length} done
          </span>
        )}
      </div>

      {!canSchedule && <ViewOnlyBanner />}

      {tasks.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-slate-300 bg-white p-6 text-center">
          <p className="text-sm text-slate-500">
            No schedule yet. Seed the standard task list — manufacture time comes from this job's
            estimated shop hours and your crew size ({Number(bid.labor_heads ?? 1)} shop /{' '}
            {Number(bid.install_heads ?? 1)} install heads).
          </p>
          {canSchedule && (
            <button
              onClick={() => void seed()}
              disabled={seeding}
              className="mt-3 rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {seeding ? 'Building…' : 'Seed standard tasks'}
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border-2 border-slate-800 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-slate-800 text-left font-mono text-[10px] uppercase tracking-wider text-slate-400">
                <th className="w-10 px-3 py-2"></th>
                <th className="px-2 py-2 font-medium">Task</th>
                <th className="px-2 py-2 font-medium">Start</th>
                <th className="px-2 py-2 font-medium text-right">Work days</th>
                <th className="px-2 py-2 font-medium">Done by</th>
                <th className="w-8 px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => {
                const start = t.start_date ? parseDay(t.start_date) : null
                const finish = start ? completionDate(start, Number(t.business_days), holidays) : null
                const overdue = !t.done && finish && finish < new Date()
                return (
                  <tr key={t.id} className={`border-t border-slate-100 ${t.done ? 'bg-emerald-50/50' : ''}`}>
                    <td className="px-3 py-1.5">
                      <input
                        type="checkbox"
                        checked={t.done}
                        onChange={() => void patchTask(t, { done: !t.done })}
                        className="h-4 w-4 accent-emerald-600"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        defaultValue={t.name}
                        onBlur={(e) => e.target.value !== t.name && void patchTask(t, { name: e.target.value })}
                        className={`w-full min-w-40 rounded border border-transparent px-1.5 py-0.5 text-sm hover:border-slate-200 focus:border-slate-800 focus:outline-none ${t.done ? 'text-slate-400 line-through' : ''}`}
                      />
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      <input
                        type="date"
                        value={t.start_date ?? ''}
                        onChange={(e) => void patchTask(t, { start_date: e.target.value || null })}
                        className="rounded border border-slate-200 px-1.5 py-0.5 text-xs focus:border-slate-800 focus:outline-none"
                      />
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <input
                        type="number" min="0" step="1"
                        defaultValue={Number(t.business_days)}
                        onBlur={(e) => Number(e.target.value) !== Number(t.business_days) && void patchTask(t, { business_days: Number(e.target.value) || 1 })}
                        className="w-16 rounded border border-slate-200 px-1.5 py-0.5 text-right text-sm tabular-nums focus:border-slate-800 focus:outline-none"
                      />
                    </td>
                    <td className={`px-2 py-1.5 text-xs whitespace-nowrap ${overdue ? 'font-semibold text-red-600' : 'text-slate-500'}`}>
                      {finish ? `${overdue ? '⚠ ' : ''}${fmtDay(finish)}` : '—'}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <button onClick={() => setRemoving(t)} className="text-slate-300 hover:text-red-600">×</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {tasks.length > 0 && canSchedule && (
        <button
          onClick={() => void addTask()}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
        >
          + Add task
        </button>
      )}

      {/* Gantt view of this job */}
      {tasks.some((t) => t.start_date) && (
        <GanttChart tasks={tasks} holidays={holidays} />
      )}

      <p className="text-xs text-slate-500">
        "Done by" skips weekends and company holidays. Change a start date or day count and it
        recomputes.
      </p>

      {removing && (
        <ConfirmDialog
          title="Delete task"
          message={`Delete "${removing.name}"?`}
          onConfirm={() => void removeTask(removing)}
          onCancel={() => setRemoving(null)}
        />
      )}
    </div>
  )
}

const DAY = 86_400_000

function GanttChart({ tasks, holidays }: { tasks: JobTask[]; holidays: Set<string> }) {
  const dated = tasks
    .filter((t) => t.start_date)
    .map((t) => {
      const start = parseDay(t.start_date!)
      return { task: t, start, finish: completionDate(start, Number(t.business_days), holidays) }
    })
  if (dated.length === 0) return null
  const min = Math.min(...dated.map((s) => s.start.getTime())) - DAY
  const max = Math.max(...dated.map((s) => s.finish.getTime())) + 2 * DAY
  const total = max - min
  const pct = (t: number) => ((t - min) / total) * 100
  const now = Date.now()

  const weekMarks: Date[] = []
  const w = new Date(min)
  w.setDate(w.getDate() + ((8 - w.getDay()) % 7))
  while (w.getTime() < max) {
    weekMarks.push(new Date(w))
    w.setDate(w.getDate() + 7)
  }

  return (
    <div className="rounded-lg border-2 border-slate-800 bg-white">
      <div className="border-b-2 border-slate-800 px-4 py-2 font-mono text-[11px] uppercase tracking-widest text-slate-500">
        Timeline
      </div>
      <div className="relative px-4 py-3">
        {weekMarks.map((m) => (
          <div key={m.getTime()} className="absolute inset-y-0 border-l border-slate-100" style={{ left: `${pct(m.getTime())}%` }} />
        ))}
        {now > min && now < max && (
          <div className="absolute inset-y-0 z-10 border-l-2 border-red-400" style={{ left: `${pct(now)}%` }} title="Today" />
        )}
        <div className="relative space-y-1">
          {dated.map(({ task, start, finish }) => {
            const left = pct(start.getTime())
            const width = Math.max(1.5, pct(finish.getTime() + DAY) - left)
            return (
              <div key={task.id} className="relative h-6">
                <div
                  title={`${task.name}: ${fmtDay(start)} → ${fmtDay(finish)}`}
                  className={`absolute inset-y-0 flex items-center overflow-hidden rounded px-1.5 font-mono text-[10px] uppercase tracking-wider ${
                    task.done
                      ? 'bg-emerald-100 text-emerald-700'
                      : finish.getTime() < now
                        ? 'bg-red-100 text-red-700'
                        : 'bg-slate-800 text-white'
                  }`}
                  style={{ left: `${left}%`, width: `${width}%` }}
                >
                  <span className="truncate">{task.name}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <div className="relative h-5 px-4">
        {weekMarks.filter((_, i) => i % 2 === 0).map((m) => (
          <span key={m.getTime()} className="absolute font-mono text-[10px] text-slate-400" style={{ left: `${pct(m.getTime())}%` }}>
            {m.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </span>
        ))}
      </div>
    </div>
  )
}
