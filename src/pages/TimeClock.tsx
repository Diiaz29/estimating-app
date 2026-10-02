import LoadError from '../components/LoadError'
import { requireLoaded, errorMessage } from '../lib/loadResults'
import { profileName } from '../lib/profileName'
import UiIcon from '../components/UiIcon'
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { LOGO_URL } from '../lib/branding'
import type { Bid } from '../lib/types'
import ShopTimeClock from './ShopTimeClock'
import ConfirmDialog from '../components/ConfirmDialog'

interface TimeEntry {
  id: string
  bid_id: string
  worker: string
  work_date: string
  hours: number
  note: string | null
  kind: string
  night: boolean
  created_by: string | null
}

const kindLabel = (k: string) => (k === 'field' ? 'install' : k)

const fmtDay = (iso: string) =>
  new Date(`${iso}T12:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })

const isoDaysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)

/** Shop time clock: pick the job you worked on, log the hours.
 *  Office/PM/admin also get a printable team time report. */
export default function TimeClock() {
  const { realRole, viewAs } = useAuth()
  return (viewAs ?? realRole) === 'shop' ? <ShopTimeClock /> : <PersonalTimeClock />
}

function PersonalTimeClock() {
  const { session, profile, canSchedule, isOffice, isAdmin } = useAuth()
  const [editing, setEditing] = useState<(Omit<TimeEntry, 'hours'> & { hours: number | string }) | null>(null)
  const [editBusy, setEditBusy] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<TimeEntry | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const worker = session?.user.email?.split('@')[0] ?? 'unknown'
  const seesEveryone = canSchedule || isOffice
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reportLoading, setReportLoading] = useState(true)
  const [reportError, setReportError] = useState<string | null>(null)
  const [reportReload, setReportReload] = useState(0)
  const [jobs, setJobs] = useState<Bid[]>([])
  const [allBids, setAllBids] = useState<Pick<Bid, 'id' | 'job_number' | 'name'>[]>([])
  const [mine, setMine] = useState<TimeEntry[]>([])
  const [jobId, setJobId] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [hours, setHours] = useState('')
  const [note, setNote] = useState('')
  const [kind, setKind] = useState<'shop' | 'field'>('shop')
  const [night, setNight] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // report range — defaults to the last 7 days
  const [repFrom, setRepFrom] = useState(() => isoDaysAgo(6))
  const [repTo, setRepTo] = useState(() => new Date().toISOString().slice(0, 10))
  const [report, setReport] = useState<TimeEntry[]>([])
  // empty selection = show everyone / all jobs
  const [pickedWorkers, setPickedWorkers] = useState<string[]>([])
  const [pickedJobs, setPickedJobs] = useState<string[]>([])
  const [showPicker, setShowPicker] = useState<'people' | 'jobs' | null>(null)
  const [company, setCompany] = useState<Record<string, string>>({})
  const [logoOk, setLogoOk] = useState(true)
  const [showReportPreview, setShowReportPreview] = useState(false)

  async function load() {
    setLoading(true)
    setLoadError(null)
    try {
      const [jobRes, allRes, mineRes] = await Promise.all([
        supabase!.from('bids').select('*').eq('status', 'won').is('completed_at', null).order('job_number'),
        supabase!.from('bids').select('id, job_number, name'),
        supabase!
          .from('time_entries')
          .select('*')
          .eq('created_by', session?.user.email ?? '')
          .order('work_date', { ascending: false })
          .limit(30),
      ])
      requireLoaded({ jobs: jobRes, projects: allRes, time: mineRes })
      {
        const rows = jobRes.data as Bid[]
        setJobs(rows)
        setJobId((cur) => cur || rows[0]?.id || '')
      }
      if (allRes.data) setAllBids(allRes.data as Pick<Bid, 'id' | 'job_number' | 'name'>[])
      if (mineRes.data) setMine(mineRes.data as TimeEntry[])
      const { data: co } = await supabase!.from('text_settings').select('key, value').eq('group_name', 'Company')
      if (co) setCompany(Object.fromEntries((co as { key: string; value: string }[]).map((t) => [t.key, t.value])))
    } catch (e) { setLoadError(errorMessage(e)) } finally { setLoading(false) }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!seesEveryone) return
    let cancelled = false
    setReportLoading(true)
    setReportError(null)
    supabase!
      .from('time_entries')
      .select('*')
      .gte('work_date', repFrom)
      .lte('work_date', repTo)
      .order('work_date')
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) setReportError(error.message)
        else setReport((data ?? []) as TimeEntry[])
        setReportLoading(false)
      })
    return () => { cancelled = true }
  }, [seesEveryone, repFrom, repTo, mine.length, reportReload])

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
      kind,
      night,
      created_by: session?.user.email ?? null,
    })
    setBusy(false)
    if (error) setError(error.message)
    else {
      setHours('')
      setNote('')
      setNight(false)
      void load()
    }
  }

  async function remove(t: TimeEntry) {
    if (!isAdmin || deleteBusy) return
    setDeleting(null)
    setDeleteBusy(true)
    setError(null)
    try {
      const { error } = await supabase!.from('time_entries').delete().eq('id', t.id).select('id').single()
      if (error) throw error
      setMine(rows => rows.filter(row => row.id !== t.id))
      setReport(rows => rows.filter(row => row.id !== t.id))
      setEditing(current => current?.id === t.id ? null : current)
      setReportReload(n => n + 1)
    } catch (e) { setError(errorMessage(e)) } finally { setDeleteBusy(false) }
  }

  function edit(t: TimeEntry) {
    setEditing({ ...t })
    setEditError(null)
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault()
    if (!isAdmin || !editing || editBusy) return
    if (!editing.bid_id || !editing.work_date || !Number.isFinite(Number(editing.hours)) || Number(editing.hours) <= 0 || Number(editing.hours) > 24) {
      setEditError('Choose a job and date, and enter hours greater than 0 and no more than 24.')
      return
    }
    setEditBusy(true)
    setEditError(null)
    try {
      const { error } = await supabase!.from('time_entries').update({
        bid_id: editing.bid_id, work_date: editing.work_date, hours: Number(editing.hours),
        kind: editing.kind, night: editing.night, note: editing.note?.trim() || null,
      }).eq('id', editing.id).select('id').single()
      if (error) throw error
      setEditing(null)
      setReportReload(n => n + 1)
      void load()
    } catch (e) { setEditError(errorMessage(e)) } finally { setEditBusy(false) }
  }

  const jobName = (bidId: string) => {
    const j = allBids.find((b) => b.id === bidId)
    return j ? `${j.job_number} ${j.name}` : '—'
  }

  if (loadError) return <LoadError error={loadError} retry={() => void load()} subject="time entries" />
  if (loading) return <p role="status">Loading time entries…</p>

  // filters: empty picks mean "all"
  const allWorkers = [...new Set(report.map((t) => t.worker))].sort()
  const allJobIds = [...new Set(report.map((t) => t.bid_id))]
  const filtered = report.filter(
    (t) =>
      (pickedWorkers.length === 0 || pickedWorkers.includes(t.worker)) &&
      (pickedJobs.length === 0 || pickedJobs.includes(t.bid_id)),
  )

  // report grouped per worker
  const byWorker = new Map<string, TimeEntry[]>()
  for (const t of filtered) {
    if (!byWorker.has(t.worker)) byWorker.set(t.worker, [])
    byWorker.get(t.worker)!.push(t)
  }
  const workers = [...byWorker.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  const grandTotal = filtered.reduce((s, t) => s + Number(t.hours), 0)
  const rangeLabel = `${fmtDay(repFrom)} — ${fmtDay(repTo)}`

  return (
    <div className="zaid-page zaid-timeclock max-w-2xl space-y-5 print:max-w-none">
      {error && <p role="alert" className="save-feedback save-failed">{error} Your entry is still here. Try again.</p>}
      <div className="construction-page-heading print:hidden">
        <div>
        <h1 className="text-lg font-semibold tracking-tight">Time</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Log your shop hours against the job you worked on. Logging as{' '}
          <span className="font-semibold">{profile ? profileName(profile) : worker}</span>.
        </p>
        </div>
      </div>

      <div className={`construction-time-workspace ${seesEveryone ? '' : 'construction-time-personal'}`}>
      {isAdmin && editing && <form onSubmit={saveEdit} className="construction-time-editor print:hidden">
        <h2>Edit time for {editing.worker}</h2>
        <fieldset disabled={editBusy} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label>Job<select className="input" value={editing.bid_id} onChange={e => setEditing({ ...editing, bid_id: e.target.value })}>{allBids.map(j => <option key={j.id} value={j.id}>{j.job_number} — {j.name}</option>)}</select></label>
          <label>Day<input className="input" type="date" required value={editing.work_date} onChange={e => setEditing({ ...editing, work_date: e.target.value })} /></label>
          <label>Hours<input className="input" type="number" required min="0.01" max="24" step="any" value={editing.hours} onChange={e => setEditing({ ...editing, hours: e.target.value })} /></label>
          <label>Category<select className="input" value={editing.kind} onChange={e => setEditing({ ...editing, kind: e.target.value })}><option value="shop">Shop time</option><option value="field">Install time</option></select></label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={editing.night} onChange={e => setEditing({ ...editing, night: e.target.checked })} />Night work</label>
          <label>Notes<input className="input" value={editing.note ?? ''} onChange={e => setEditing({ ...editing, note: e.target.value })} /></label>
        </fieldset>
        {editError && <p role="alert" className="save-feedback save-failed">{editError} Your changes are still here.</p>}
        <div className="flex gap-2"><button className="index-primary" disabled={editBusy}>{editBusy ? 'Saving…' : 'Save changes'}</button><button type="button" className="index-secondary" disabled={editBusy} onClick={() => setEditing(null)}>Cancel</button></div>
      </form>}
      <div className="construction-time-entry print:hidden">
      <h2 className="construction-time-section-heading">Log time</h2>
      {jobs.length === 0 ? (
        <p className="rounded-lg border-2 border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500 print:hidden">
          No active jobs to log time against.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="construction-time-form space-y-3 print:hidden">
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
          <div className="flex flex-wrap items-end gap-3">
            <div className="block">
              <span className="font-mono text-[11px] uppercase tracking-widest text-slate-500">Category</span>
              <div className="mt-1 flex gap-1.5">
                {(['shop', 'field'] as const).map((k) => (
                  <button
                    type="button"
                    key={k}
                    onClick={() => setKind(k)}
                    aria-pressed={kind === k}
                    className={`rounded-md border px-4 py-2 text-sm font-medium ${
                      kind === k
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-300 bg-white text-slate-600 hover:border-slate-500'
                    }`}
                  >
                    {k === 'shop' ? 'Shop time' : 'Install time'}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex cursor-pointer items-center gap-2 pb-2">
              <input
                type="checkbox"
                checked={night}
                onChange={(e) => setNight(e.target.checked)}
                className="h-5 w-5 rounded border-slate-300 accent-slate-900"
              />
              <span className="text-sm font-medium text-slate-700">Night work</span>
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
      </div>

      <div className="construction-time-history print:hidden">
      {mine.length > 0 ? (
        <section className="construction-time-recent print:hidden">
          <h2 className="mb-2 font-mono text-[11px] uppercase tracking-widest text-slate-500">My recent time</h2>
          <div className="overflow-hidden rounded-lg border-2 border-slate-800 bg-white">
            {mine.map((t, i) => (
              <div key={t.id} className={`flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2 text-sm ${i > 0 ? 'border-t border-slate-100' : ''}`}>
                <span className="w-24 font-mono text-xs text-slate-500">{fmtDay(t.work_date)}</span>
                <span className="min-w-0 flex-1 basis-40 truncate font-medium">{jobName(t.bid_id)}</span>
                <span className="rounded border border-slate-200 px-1 font-mono text-[9px] uppercase text-slate-400">
                  {kindLabel(t.kind)}{t.night ? ' night' : ''}
                </span>
                {t.note && <span className="hidden min-w-0 truncate text-xs text-slate-500 sm:block">{t.note}</span>}
                <span className="ml-auto font-semibold tabular-nums">{Number(t.hours).toFixed(1)} hrs</span>
                {isAdmin && <><button className="index-secondary" disabled={deleteBusy} onClick={() => edit(t)}>Edit</button><button aria-label="Delete time entry" disabled={deleteBusy} onClick={() => setDeleting(t)} className="index-secondary">Delete</button></>}
              </div>
            ))}
          </div>
        </section>
      ) : (
        <section className="construction-time-recent print:hidden">
          <h2>My recent time</h2>
          <p className="construction-time-empty">No time entries yet.</p>
        </section>
      )}
      </div>

      {/* ---------- Team time report (office / PM / admin) ---------- */}
      {seesEveryone && (
        <section className="construction-time-report">
          <div className="construction-time-report-heading print:hidden">
            <h2 className="font-mono text-[11px] uppercase tracking-widest text-slate-500">Team time report</h2>
            <div className="construction-heading-actions">
            <button onClick={() => setShowReportPreview((shown) => !shown)} aria-expanded={showReportPreview} className="index-secondary">
              {showReportPreview ? 'Show time entries' : 'Show print preview'}
            </button>
            <button onClick={() => window.print()} className="index-secondary">Print</button>
            </div>
          </div>
          <div className="construction-time-toolbar print:hidden">
            <div className="construction-time-range">
              <label className="block">
                <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">From</span>
                <input type="date" value={repFrom} onChange={(e) => setRepFrom(e.target.value)} className="input mt-0.5 py-1.5" />
              </label>
              <label className="block">
                <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">To</span>
                <input type="date" value={repTo} onChange={(e) => setRepTo(e.target.value)} className="input mt-0.5 py-1.5" />
              </label>
            </div>

          {/* who / which jobs — a popup keeps this tidy when the lists grow */}
          <div className="construction-time-filters flex flex-wrap gap-2 print:hidden">
            <button
              onClick={() => setShowPicker('people')}
              className={`rounded-md border px-3 py-1.5 text-sm font-medium ${
                pickedWorkers.length > 0
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-300 bg-white text-slate-600 hover:border-slate-500'
              }`}
            >
              People: {pickedWorkers.length === 0 ? 'all' : pickedWorkers.length} <UiIcon name="down" />
            </button>
            <button
              onClick={() => setShowPicker('jobs')}
              className={`rounded-md border px-3 py-1.5 text-sm font-medium ${
                pickedJobs.length > 0
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-300 bg-white text-slate-600 hover:border-slate-500'
              }`}
            >
              Jobs: {pickedJobs.length === 0 ? 'all' : pickedJobs.length} <UiIcon name="down" />
            </button>
            {(pickedWorkers.length > 0 || pickedJobs.length > 0) && (
              <button
                onClick={() => {
                  setPickedWorkers([])
                  setPickedJobs([])
                }}
                className="px-2 py-1.5 text-sm text-slate-400 hover:text-slate-700"
              >
                clear filters
              </button>
            )}
          </div>
          </div>

          {showPicker && (
            <div className="fixed inset-0 z-30 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-6 print:hidden">
              <div className="w-full max-w-sm rounded-t-xl border-2 border-slate-800 bg-white sm:rounded-xl">
                <div className="flex items-center justify-between border-b-2 border-slate-800 px-5 py-3">
                  <h2 className="font-semibold">{showPicker === 'people' ? 'Show these people' : 'Show these jobs'}</h2>
                  <button onClick={() => setShowPicker(null)} className="text-xl leading-none text-slate-400 hover:text-slate-700">×</button>
                </div>
                <div className="max-h-[60vh] overflow-y-auto p-3">
                  {(showPicker === 'people' ? allWorkers : allJobIds).map((item) => {
                    const picked = showPicker === 'people' ? pickedWorkers.includes(item) : pickedJobs.includes(item)
                    const toggle = () => {
                      if (showPicker === 'people')
                        setPickedWorkers((prev) => (prev.includes(item) ? prev.filter((x) => x !== item) : [...prev, item]))
                      else setPickedJobs((prev) => (prev.includes(item) ? prev.filter((x) => x !== item) : [...prev, item]))
                    }
                    return (
                      <label key={item} className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2.5 hover:bg-slate-50">
                        <input
                          type="checkbox"
                          checked={picked}
                          onChange={toggle}
                          className="h-5 w-5 rounded border-slate-300 accent-slate-900"
                        />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">
                          {showPicker === 'people' ? item : jobName(item)}
                        </span>
                      </label>
                    )
                  })}
                </div>
                <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3">
                  <button
                    onClick={() => (showPicker === 'people' ? setPickedWorkers([]) : setPickedJobs([]))}
                    className="text-sm text-slate-500 hover:text-slate-900"
                  >
                    Show all
                  </button>
                  <button
                    onClick={() => setShowPicker(null)}
                    className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          )}

          {reportError && <LoadError error={reportError} retry={() => setReportReload(n => n + 1)} subject="the time report" />}
          {reportLoading && <p role="status" className="p-4">Loading time report…</p>}
          {!showReportPreview && !reportError && !reportLoading && (
            <div className="print:hidden">
              <div className="construction-time-report-caption">
                <span>{filtered.length} {filtered.length === 1 ? 'entry' : 'entries'}</span>
                <span>{grandTotal.toFixed(1)} hrs total</span>
              </div>
              <div className="construction-table-scroll">
                <table className="responsive-record-table construction-register-table construction-time-table">
                  <thead><tr><th>Day</th><th>Person</th><th>Job</th><th>Category</th><th>Notes</th><th>Hours</th>{isAdmin && <th>Actions</th>}</tr></thead>
                  <tbody>
                    {filtered.map((t) => (
                      <tr key={t.id}>
                        <td data-label="Day">{fmtDay(t.work_date)}</td>
                        <td data-label="Person">{t.worker}</td>
                        <td data-label="Job">{jobName(t.bid_id)}</td>
                        <td data-label="Category">{kindLabel(t.kind)}{t.night ? ' night' : ''}</td>
                        <td data-label="Notes">{t.note || '—'}</td>
                        <td data-label="Hours" className="construction-money">{Number(t.hours).toFixed(1)}</td>
                        {isAdmin && <td data-label="Actions"><div className="flex justify-end gap-2"><button className="index-secondary" disabled={deleteBusy} onClick={() => edit(t)}>Edit</button><button className="index-secondary" disabled={deleteBusy} aria-label={`Delete time entry for ${t.worker} on ${fmtDay(t.work_date)}`} onClick={() => setDeleting(t)}>Delete</button></div></td>}
                      </tr>
                    ))}
                    {filtered.length === 0 && <tr><td colSpan={isAdmin ? 7 : 6} className="construction-time-table-empty">No hours logged in this range.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          <div hidden={reportLoading || !!reportError} className={`construction-time-document ${showReportPreview ? '' : 'construction-time-document-collapsed'}`}>
          <div className="light-doc rounded-lg border-2 border-slate-900 bg-white p-4 print:rounded-none print:border-0 print:p-0">
            <div className="flex items-center gap-4 border-b-4 border-slate-900 pb-2">
              {logoOk && LOGO_URL ? (
                <img src={LOGO_URL} alt="" className="h-20 w-auto max-w-[20rem] object-contain" onError={() => setLogoOk(false)} />
              ) : (
                <div className="text-lg font-bold tracking-tight">{company.company_name ?? ''}</div>
              )}
              <div className="ml-auto text-right">
                <div className="text-base font-bold tracking-tight">TIME REPORT</div>
                <div className="text-[11px] text-slate-500">
                  {[company.company_address, company.company_phone].filter(Boolean).join(' · ')}
                </div>
                <div className="text-xs text-slate-500">{rangeLabel} · {grandTotal.toFixed(1)} hrs total</div>
              </div>
            </div>
            {workers.length === 0 ? (
              <p className="py-3 text-sm text-slate-400">No hours logged in this range.</p>
            ) : (
              workers.map(([w, entries]) => {
                const total = entries.reduce((s, t) => s + Number(t.hours), 0)
                const nightTotal = entries.filter((t) => t.night).reduce((s, t) => s + Number(t.hours), 0)
                return (
                  <div key={w} className="break-inside-avoid border-b border-slate-200 py-2 last:border-b-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-semibold">{w}</span>
                      {nightTotal > 0 && (
                        <span className="text-xs text-slate-500">{nightTotal.toFixed(1)} night</span>
                      )}
                      <span className="ml-auto text-sm font-semibold tabular-nums">{total.toFixed(1)} hrs</span>
                    </div>
                    <table className="mt-1 w-full text-xs">
                      <tbody>
                        {entries.map((t) => (
                          <tr key={t.id} className="align-top">
                            <td className="w-24 py-0.5 pr-2 font-mono text-slate-500 whitespace-nowrap">{fmtDay(t.work_date)}</td>
                            <td className="py-0.5 pr-2">{jobName(t.bid_id)}</td>
                            <td className="w-14 py-0.5 pr-2 font-mono text-[9px] uppercase text-slate-400 whitespace-nowrap">
                              {kindLabel(t.kind)}{t.night ? ' night' : ''}
                            </td>
                            <td className="hidden max-w-40 truncate py-0.5 pr-2 text-slate-500 sm:table-cell">{t.note ?? ''}</td>
                            <td className="w-14 py-0.5 text-right tabular-nums">{Number(t.hours).toFixed(1)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              })
            )}
            {workers.length > 0 && (
              <div className="flex items-baseline border-t-2 border-slate-900 pt-1.5">
                <span className="text-sm font-semibold">Total — everyone</span>
                <span className="ml-auto text-sm font-bold tabular-nums">{grandTotal.toFixed(1)} hrs</span>
              </div>
            )}
          </div>
          </div>
        </section>
      )}

      </div>
      {isAdmin && deleting && <ConfirmDialog
        title="Delete time entry?"
        message={`Delete ${Number(deleting.hours).toLocaleString(undefined, { maximumFractionDigits: 2 })} hours for ${deleting.worker} on ${fmtDay(deleting.work_date)} (${jobName(deleting.bid_id)})? This cannot be undone.`}
        onCancel={() => setDeleting(null)}
        onConfirm={() => void remove(deleting)}
      />}
    </div>
  )
}
