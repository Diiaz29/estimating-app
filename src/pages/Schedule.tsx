import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { Bid } from '../lib/types'
import { parseDay, toDay } from '../lib/schedule'
import { calendarDays, eventOnDay, moveEventRange, EVENT_KINDS, eventValidation, JOB_COLORS, sortEvents } from '../lib/calendar'
import type { CalendarEvent, EventKind } from '../lib/calendar'
import { estimateJobDates } from '../lib/calendarJobDates'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import LoadError from '../components/LoadError'
import UiIcon from '../components/UiIcon'
import '../calendar.css'

const blank = (day: string): CalendarEvent => ({ id: crypto.randomUUID(), bid_id: null, kind: 'custom', title: '', event_date: day, end_date: day, event_time: null, notes: '' })
const dayLabel = (day: string) => parseDay(day).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

export default function Schedule() {
  const { canSchedule: canManageSchedules, isOffice, session } = useAuth()
  const canSchedule = canManageSchedules || isOffice
  const [jobs, setJobs] = useState<Bid[]>([])
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const [preview, setPreview] = useState(false)
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [view, setView] = useState<'calendar' | 'list'>(() => window.matchMedia('(max-width: 640px)').matches ? 'list' : 'calendar')
  const [selectedJobs, setSelectedJobs] = useState<string[]>([])
  const [includeGeneral, setIncludeGeneral] = useState(true)
  const [selectedKinds, setSelectedKinds] = useState<EventKind[]>(['custom', 'build', 'install'])
  const [jobSearch, setJobSearch] = useState('')
  const [selectedDay, setSelectedDay] = useState(() => toDay(new Date()))
  const [filtersOpen, setFiltersOpen] = useState(() => !window.matchMedia('(max-width: 700px)').matches)
  const [addingJobDates, setAddingJobDates] = useState(false)
  const [dateJob, setDateJob] = useState('')
  const [jobDateError, setJobDateError] = useState<string | null>(null)
  const [editor, setEditor] = useState<CalendarEvent | null>(null)
  const [removing, setRemoving] = useState<CalendarEvent | null>(null)
  const [busy, setBusy] = useState(false)
  const saving = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [dropDay, setDropDay] = useState<string | null>(null)
  const pointerDrag = useRef<{ event: CalendarEvent; day: string; x: number; y: number; moved: boolean } | null>(null)
  const suppressClick = useRef(false)
  const previewKey = `spoton-calendar-preview:${session?.user.id ?? 'signed-out'}`

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    void (async () => {
      try {
        const [jobRes, eventRes] = await Promise.all([
          supabase!.from('bids').select('*').eq('status', 'won').order('created_at'),
          supabase!.from('calendar_events').select('id,bid_id,kind,title,event_date,end_date,event_time,notes').is('deleted_at', null).order('event_date'),
        ])
        if (jobRes.error) throw jobRes.error
        const localPreview = import.meta.env.DEV && ['PGRST205', '42P01'].includes(eventRes.error?.code ?? '')
        if (eventRes.error && !localPreview) throw eventRes.error
        let rows = (eventRes.data ?? []) as CalendarEvent[]
        if (localPreview) {
          const stored = localStorage.getItem(previewKey)
          rows = stored ? JSON.parse(stored) as CalendarEvent[] : []
        }
        if (cancelled) return
        setJobs(jobRes.data as Bid[])
        setPreview(localPreview)
        setEvents(rows.map(event => ({ ...event, end_date: event.end_date ?? event.event_date })))
      } catch (e) { if (!cancelled) setLoadError((e as { message?: string }).message ?? 'Could not load the calendar.') }
      finally { if (!cancelled) setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [reload, previewKey])

  const colorFor = (id: string | null) => id && jobs.some(job => job.id === id) ? JOB_COLORS[jobs.findIndex(job => job.id === id) % JOB_COLORS.length] : '#534741'
  const visible = sortEvents(events.filter(event => selectedKinds.includes(event.kind) && (event.bid_id ? selectedJobs.length === 0 || selectedJobs.includes(event.bid_id) : includeGeneral && selectedJobs.length === 0)))
  const filtered = selectedJobs.length > 0 || !includeGeneral || selectedKinds.length !== 3
  const filterSummary = `${selectedJobs.length === 0 ? 'All jobs' : `${selectedJobs.length} ${selectedJobs.length === 1 ? 'job' : 'jobs'}`}${includeGeneral && selectedJobs.length === 0 ? ' + general events' : ''} · ${selectedKinds.length === 3 ? 'All event types' : selectedKinds.length === 0 ? 'No event types' : selectedKinds.map(kind => EVENT_KINDS[kind]).join(', ')}`
  const jobsWithoutDates = jobs.filter(job => !job.completed_at && !events.some(event => event.bid_id === job.id && (event.kind === 'build' || event.kind === 'install')))
  const matchingJobs = jobs.filter(job => !job.completed_at && `${job.job_number} ${job.name}`.toLowerCase().includes(jobSearch.trim().toLowerCase()))
  function resetFilters() { setSelectedJobs([]); setIncludeGeneral(true); setSelectedKinds(['custom', 'build', 'install']); setJobSearch('') }
  const agendaDays = calendarDays(month).filter(day => day.slice(0, 7) === toDay(month).slice(0, 7) && visible.some(event => eventOnDay(event, day)))

  const monthEvents = visible.filter(event => agendaDays.some(day => eventOnDay(event, day)))

  async function persist(event: CalendarEvent, remove = false) {
    if (!canSchedule || saving.current) return
    const validation = !remove && eventValidation(event)
    if (validation) { setError(validation); return }
    saving.current = true
    setBusy(true)
    setError(null)
    const clean = { ...event, end_date: event.end_date ?? event.event_date, title: event.title.trim(), notes: event.notes.trim() }
    try {
      if (!preview) {
        const result = remove
          ? await supabase!.from('calendar_events').update({ deleted_at: new Date().toISOString() }).eq('id', event.id).select('id').single()
          : await supabase!.from('calendar_events').upsert(clean).select('id').single()
        if (result.error) throw result.error
      }
      const next = remove ? events.filter(row => row.id !== event.id) : [...events.filter(row => row.id !== event.id), clean]
      if (preview) localStorage.setItem(previewKey, JSON.stringify(next))
      setEvents(next)
      setEditor(null)
      setRemoving(null)
      setNotice(remove ? 'Event removed.' : `${clean.title} saved for ${dayLabel(clean.event_date)}.`)
    } catch (e) { setError((e as { message?: string }).message ?? 'Could not save. Please try again.') }
    finally { saving.current = false; setBusy(false) }
  }

  async function addJobDates() {
    const job = jobs.find(row => row.id === dateJob)
    if (!job || !canSchedule || saving.current) return
    saving.current = true
    setBusy(true)
    setJobDateError(null)
    try {
      if (events.some(event => event.bid_id === job.id && (event.kind === 'build' || event.kind === 'install'))) throw new Error('This job already has calendar dates. Move its existing events, or remove them before adding a new pair.')
      const dates = await estimateJobDates(job, toDay(new Date()))
      const pair: CalendarEvent[] = [
        { ...blank(dates.ready), bid_id: job.id, kind: 'build', title: EVENT_KINDS.build },
        { ...blank(dates.install), bid_id: job.id, kind: 'install', title: EVENT_KINDS.install },
      ]
      if (!preview) {
        const result = await supabase!.from('calendar_events').insert(pair).select('id')
        if (result.error) throw result.error
      }
      const next = [...events, ...pair]
      if (preview) localStorage.setItem(previewKey, JSON.stringify(next))
      setEvents(next)
      setSelectedJobs(previous => previous.length && !previous.includes(job.id) ? [...previous, job.id] : previous)
      setSelectedKinds(previous => [...new Set([...previous, 'build' as const, 'install' as const])])
      const ready = parseDay(dates.ready)
      setMonth(new Date(ready.getFullYear(), ready.getMonth(), 1))
      setAddingJobDates(false)
      setNotice(job.name + ': Ready to ship ' + dayLabel(dates.ready) + '; install ' + dayLabel(dates.install) + '.')
    } catch (e) { setJobDateError((e as { message?: string }).message ?? 'Could not add job dates. Please try again.') }
    finally { saving.current = false; setBusy(false) }
  }

  function open(event: CalendarEvent) { if (!busy) { setError(null); setEditor({ ...event }) } }
  function move(event: CalendarEvent, day: string, fromDay = event.event_date) {
    setDropDay(null)
    if (day !== fromDay) void persist(moveEventRange(event, fromDay, day))
  }
  function eventCard(event: CalendarEvent, draggable = false, occurrenceDay = event.event_date) {
    const job = jobs.find(row => row.id === event.bid_id)
    return <div key={event.id} className="team-calendar-event" style={{ '--event-color': colorFor(event.bid_id) } as CSSProperties}
      >
      <button className="team-calendar-event-body" title={`${event.title}${job ? ` · ${job.name}` : ''}`} data-movable={draggable && canSchedule && !busy} draggable={draggable && canSchedule && !busy}
        onDragStart={e => { pointerDrag.current = null; e.dataTransfer.setData('text/calendar-event', event.id); e.dataTransfer.setData('text/calendar-day', occurrenceDay); e.dataTransfer.effectAllowed = 'move'; const card = e.currentTarget.closest<HTMLElement>('.team-calendar-event'); if (card) { const rect = card.getBoundingClientRect(); e.dataTransfer.setDragImage(card, e.clientX - rect.left, e.clientY - rect.top) } }}
        onDragEnd={() => { pointerDrag.current = null; setDropDay(null) }} onClick={e => { if (!draggable || !canSchedule || e.detail === 0) open(event) }}
        onPointerDown={e => { if (!draggable || !canSchedule || busy || e.button !== 0 || e.pointerType === 'mouse') return; e.currentTarget.setPointerCapture(e.pointerId); suppressClick.current = false; pointerDrag.current = { event, day: occurrenceDay, x: e.clientX, y: e.clientY, moved: false } }}
        onPointerMove={e => { const drag = pointerDrag.current; if (!drag) return; if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 6) drag.moved = true; if (drag.moved) setDropDay(document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-calendar-day]')?.dataset.calendarDay ?? null) }}
        onPointerUp={e => { const drag = pointerDrag.current; pointerDrag.current = null; setDropDay(null); suppressClick.current = !!drag?.moved; const day = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-calendar-day]')?.dataset.calendarDay; if (drag?.moved && day) move(drag.event, day, drag.day) }}
        onPointerCancel={() => { pointerDrag.current = null; setDropDay(null) }}
        aria-label={`${event.title}${job ? `, ${job.name}` : ''}, ${dayLabel(occurrenceDay)}`}>
        <strong>{event.event_time ? `${event.event_time.slice(0, 5)} · ` : ''}{event.kind === 'custom' ? event.title + (job ? ' - ' + job.name : '') : `${EVENT_KINDS[event.kind]} · ${job?.name ?? event.title}`}</strong>
      </button>
      {draggable && canSchedule && <button type="button" className="team-calendar-edit" title="Edit event" aria-label={"Edit " + event.title + (job ? " for " + job.name : "")} disabled={busy} onClick={() => open(event)}><UiIcon name="pen" /></button>}
    </div>
  }

  if (loadError) return <LoadError subject="team calendar" error={loadError} retry={() => setReload(n => n + 1)} />
  if (loading) return <p>Loading calendar…</p>
  return <div className="team-calendar">
    <div className="team-calendar-toolbar">
      <div className="team-calendar-month"><button className="index-secondary" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><UiIcon name="left" /></button><h2>{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2><button className="index-secondary" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><UiIcon name="right" /></button><button className="index-secondary" onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>Today</button></div>
      <div className="team-calendar-views" aria-label="Calendar view"><button className="index-secondary" aria-pressed={view === 'calendar'} onClick={() => setView('calendar')}>Month</button><button className="index-secondary" aria-pressed={view === 'list'} onClick={() => setView('list')}>List</button></div>
    </div>
    <div className="team-calendar-filter-bar">
      {canSchedule && <div className="team-calendar-create-actions"><button className="index-primary team-calendar-create" onClick={() => open(blank(selectedDay))}><span aria-hidden="true">+</span> Create event</button><button className="index-primary team-calendar-create" onClick={() => { setDateJob(''); setJobDateError(null); setAddingJobDates(true) }}>Add job dates</button></div>}
      <nav className="team-calendar-mini" aria-label="Choose a calendar date">
        <div className="team-calendar-mini-heading"><strong>{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</strong><button aria-label="Previous month in mini calendar" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><UiIcon name="left" /></button><button aria-label="Next month in mini calendar" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><UiIcon name="right" /></button></div>
        <div className="team-calendar-mini-grid">{['S','M','T','W','T','F','S'].map((label,index) => <span key={index}>{label}</span>)}{calendarDays(month).map(day => <button key={day} aria-label={`Choose ${dayLabel(day)}`} aria-pressed={selectedDay === day} className={`${day === toDay(new Date()) ? 'mini-today' : ''} ${day.slice(0,7) !== toDay(month).slice(0,7) ? 'mini-outside' : ''}`} onClick={() => { setSelectedDay(day); setMonth(new Date(parseDay(day).getFullYear(),parseDay(day).getMonth(),1)) }}>{parseDay(day).getDate()}</button>)}</div>
      </nav>
      <details open={filtersOpen} onToggle={e => setFiltersOpen(e.currentTarget.open)} className="team-calendar-filters" onKeyDown={e => { if (e.key === 'Escape') { setFiltersOpen(false); e.currentTarget.querySelector('summary')?.focus() } }}>
        <summary>My jobs{filtered && <span>Filtered</span>}<UiIcon name="down" /></summary>
        <div className="team-calendar-filter-panel">
          <fieldset className="team-calendar-job-filter"><legend>Jobs</legend>
            <input type="search" aria-label="Search jobs to show" placeholder="Search job name or number" value={jobSearch} onChange={e => setJobSearch(e.target.value)} />
            <div className="team-calendar-job-options">
              {matchingJobs.map(job => <div className="team-calendar-job-row" key={job.id}><label><input type="checkbox" checked={selectedJobs.includes(job.id)} onChange={e => { const checked = e.target.checked; setSelectedJobs(previous => { const ids = previous; return checked ? [...new Set([...ids, job.id])] : ids.filter(id => id !== job.id) }) }} /><i style={{ backgroundColor: colorFor(job.id) }} aria-hidden="true" /><span><strong>{job.name}</strong><small>{job.job_number}{job.completed_at ? ' · Completed' : ''}</small></span></label></div>)}
              {!matchingJobs.length && <p>No jobs match “{jobSearch}”.</p>}
            </div>
            <div className="team-calendar-filter-actions"><button className="index-primary team-calendar-create" type="button" onClick={() => setSelectedJobs([])} disabled={selectedJobs.length === 0}>Clear selection</button></div>
          </fieldset>
          <div className="team-calendar-event-filters"><fieldset><legend>Event types</legend>{(Object.keys(EVENT_KINDS) as EventKind[]).map(kind => <label key={kind}><input type="checkbox" checked={selectedKinds.includes(kind)} onChange={e => { const checked = e.target.checked; setSelectedKinds(previous => checked ? [...previous, kind] : previous.filter(value => value !== kind)) }} />{kind === 'custom' ? 'Custom events' : EVENT_KINDS[kind]}</label>)}</fieldset>
            <fieldset><legend>General events</legend><label><input type="checkbox" checked={includeGeneral} onChange={e => setIncludeGeneral(e.target.checked)} />Include events without a job</label></fieldset>
          </div>
        </div>
      </details>
      <div className="team-calendar-filter-summary"><span>{filterSummary}</span>{filtered && <button type="button" onClick={resetFilters}>Reset filters</button>}</div>
    </div>
    {filtered && <p className="team-calendar-filter-count" role="status">{monthEvents.length} {monthEvents.length === 1 ? 'event' : 'events'} shown this month{monthEvents.length === 0 ? '. Try selecting more jobs or event types.' : '.'}</p>}
    {error && !editor && <p className="team-calendar-error" role="alert">{error}</p>}
    <p className="team-calendar-hint">{canSchedule ? 'Click a date to add an event. Drag an event to move it, or open it to choose a date.' : 'Open an event to see its details. Your account has view-only access.'}</p>
    <p className="sr-only" role="status">{notice}</p>
    {view === 'calendar' ? <div className="team-calendar-scroll"><div className="team-calendar-grid">
      {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => <div className="team-calendar-weekday" key={day}>{day}</div>)}
      {calendarDays(month).map(day => <section key={day} aria-label={dayLabel(day)} data-calendar-day={day} className={`team-calendar-day${day.slice(0, 7) !== toDay(month).slice(0, 7) ? ' outside-month' : ''}${day === toDay(new Date()) ? ' is-today' : ''}${day === selectedDay ? ' is-selected-day' : ''}${dropDay === day ? ' is-drop-target' : ''}`}
        onDragOver={e => { if (canSchedule && !busy && e.dataTransfer.types.includes('text/calendar-event')) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDropDay(day) } }}
        onDrop={e => { e.preventDefault(); const event = events.find(row => row.id === e.dataTransfer.getData('text/calendar-event')); if (event && canSchedule && !busy) move(event, day, e.dataTransfer.getData('text/calendar-day') || event.event_date) }}>
        <button className="team-calendar-day-number" disabled={!canSchedule || busy} aria-label={`Add event on ${dayLabel(day)}`} onClick={() => open(blank(day))}><time dateTime={day}>{parseDay(day).getDate()}</time><span aria-hidden="true">+</span></button>
        {visible.filter(event => eventOnDay(event, day)).map(event => eventCard(event, true, day))}
      </section>)}
    </div></div> : <div className="team-calendar-agenda">{agendaDays.length ? agendaDays.map(day => <section key={day}><h3>{parseDay(day).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</h3><div>{visible.filter(event => eventOnDay(event, day)).map(event => eventCard(event, false, day))}</div></section>) : <div className="team-calendar-empty"><h3>No events this month</h3><p>Add a ready-to-ship date, an installation, or your own event.</p>{canSchedule && <button className="index-secondary" onClick={() => open(blank(toDay(month)))}>Add event</button>}</div>}</div>}
    <details className="team-calendar-details"><summary>Detailed job schedules</summary><p>Existing production tasks are kept here, separate from your calendar dates.</p>{jobs.map(job => <Link key={job.id} to={`/bids/${job.id}/schedule`}>{job.job_number} · {job.name}</Link>)}</details>
    {addingJobDates && <Modal title="Add job dates" onClose={() => { if (!busy) setAddingJobDates(false) }} className="team-calendar-modal team-calendar-job-dates-modal">
      <form onSubmit={e => { e.preventDefault(); void addJobDates() }}>
        <fieldset disabled={busy}>
          <label>Job<select required value={dateJob} onChange={e => { setDateJob(e.target.value); setJobDateError(null) }}><option value="">{jobsWithoutDates.length ? 'Choose a job' : 'All jobs already have calendar dates'}</option>{jobsWithoutDates.map(job => <option key={job.id} value={job.id}>{job.job_number} · {job.name}</option>)}</select></label>
          <p>Ready to ship is based on estimated build time starting today, using your shop crew size and working days. Install is one week later. Drag either event to adjust it.</p>
        </fieldset>
        {jobDateError && <p role="alert">{jobDateError}</p>}
        <div className="team-calendar-form-actions"><button type="button" className="index-secondary" disabled={busy} onClick={() => setAddingJobDates(false)}>Cancel</button><button className="index-primary" disabled={busy || !dateJob}>{busy ? 'Adding dates…' : 'Add both dates'}</button></div>
      </form>
    </Modal>}
    {editor && <Modal title={events.some(event => event.id === editor.id) ? 'Event details' : 'Add event'} onClose={() => { if (!busy) setEditor(null) }} className="team-calendar-modal">
      <form onSubmit={e => { e.preventDefault(); void persist(editor) }}>
        <fieldset disabled={busy || !canSchedule}>
          <label>Type<select value={editor.kind} onChange={e => { const kind = e.target.value as EventKind; setEditor({ ...editor, kind, title: kind === 'custom' ? '' : EVENT_KINDS[kind] }) }}><option value="custom">Custom event</option><option value="build">Ready to ship</option><option value="install">Install date</option></select></label>
          <label>Job {editor.kind === 'custom' && <span>(optional)</span>}<select required={editor.kind !== 'custom'} value={editor.bid_id ?? ''} onChange={e => setEditor({ ...editor, bid_id: e.target.value || null })}><option value="">{editor.kind === 'custom' ? 'No job — general event' : 'Choose a job'}</option>{jobs.map(job => <option key={job.id} value={job.id}>{job.job_number} · {job.name}{job.completed_at ? ' (completed)' : ''}</option>)}</select></label>
          <label>Event name<input required maxLength={200} value={editor.title} onChange={e => setEditor({ ...editor, title: e.target.value })} placeholder="Delivery, site visit, team meeting…" /></label>
          <div className="team-calendar-date-fields"><label>Start date<input type="date" required value={editor.event_date} onInput={e => setEditor({ ...editor, event_date: e.currentTarget.value, end_date: !editor.end_date || editor.end_date < e.currentTarget.value ? e.currentTarget.value : editor.end_date })} onChange={e => setEditor({ ...editor, event_date: e.target.value, end_date: !editor.end_date || editor.end_date < e.target.value ? e.target.value : editor.end_date })} /></label><label>End date<input type="date" required min={editor.event_date} value={editor.end_date ?? editor.event_date} onInput={e => setEditor({ ...editor, end_date: e.currentTarget.value })} onChange={e => setEditor({ ...editor, end_date: e.target.value })} /></label><label>Time <span>(optional)</span><input type="time" value={editor.event_time?.slice(0, 5) ?? ''} onInput={e => setEditor({ ...editor, event_time: e.currentTarget.value || null })} onChange={e => setEditor({ ...editor, event_time: e.target.value || null })} /></label></div>
          <label>Notes <span>(optional)</span><textarea rows={3} maxLength={4000} value={editor.notes} onChange={e => setEditor({ ...editor, notes: e.target.value })} /></label>
        </fieldset>
        {editor.bid_id && <p className="team-calendar-job-color"><i style={{ backgroundColor: colorFor(editor.bid_id) }} />Matches this job’s color on the calendar.</p>}
        {error && <p className="team-calendar-error" role="alert">{error}</p>}
        <div className="app-modal-actions">{canSchedule && events.some(event => event.id === editor.id) && <button type="button" className="modal-danger" disabled={busy} onClick={() => { setRemoving(editor); setEditor(null) }}>Remove event</button>}<button type="button" className="index-secondary" disabled={busy} onClick={() => setEditor(null)}>{canSchedule ? 'Cancel' : 'Close'}</button>{canSchedule && <button type="submit" className="index-primary" disabled={busy}>{busy ? 'Saving…' : 'Save event'}</button>}</div>
      </form>
    </Modal>}
    {removing && <ConfirmDialog title="Remove event?" message={`Remove “${removing.title}” and all its days from the calendar? This does not change the job or its detailed schedule.`} confirmLabel={busy ? 'Removing…' : 'Remove event'} onCancel={() => { if (!busy) setRemoving(null) }} onConfirm={() => void persist(removing, true)} />}
  </div>
}
