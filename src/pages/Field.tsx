import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { Bid } from '../lib/types'
import ConfirmDialog from '../components/ConfirmDialog'

export interface FieldPhoto {
  id: string
  bid_id: string
  file_path: string
  note: string | null
  uploaded_by: string | null
  created_at: string
}

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

export interface FieldReport {
  id: string
  bid_id: string
  report_date: string
  crew: string | null
  work_performed: string
  issues: string | null
  next_steps: string | null
  photo_ids: string[]
  created_by: string | null
  created_at: string
}

const fmtDay = (iso: string) =>
  new Date(`${iso}T12:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

/** Field tab: installers drop photos and hours here; PMs turn them into client reports. */
export default function Field() {
  const { id } = useParams<{ id: string }>()
  const { session, canSchedule } = useAuth()
  const [bid, setBid] = useState<Bid | null>(null)
  const [photos, setPhotos] = useState<FieldPhoto[]>([])
  const [photoUrls, setPhotoUrls] = useState<Map<string, string>>(new Map())
  const [times, setTimes] = useState<TimeEntry[]>([])
  const [reports, setReports] = useState<FieldReport[]>([])
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [editing, setEditing] = useState<FieldReport | 'new' | null>(null)
  const [removingPhoto, setRemovingPhoto] = useState<FieldPhoto | null>(null)
  const [removingReport, setRemovingReport] = useState<FieldReport | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    const [bidRes, phRes, tRes, rRes] = await Promise.all([
      supabase!.from('bids').select('*').eq('id', id!).single(),
      supabase!.from('field_photos').select('*').eq('bid_id', id!).order('created_at', { ascending: false }),
      supabase!.from('time_entries').select('*').eq('bid_id', id!).order('work_date', { ascending: false }),
      supabase!.from('field_reports').select('*').eq('bid_id', id!).order('report_date', { ascending: false }),
    ])
    if (bidRes.error) return setError(bidRes.error.message)
    setBid(bidRes.data as Bid)
    const ph = (phRes.data ?? []) as FieldPhoto[]
    setPhotos(ph)
    setTimes((tRes.data ?? []) as TimeEntry[])
    setReports((rRes.data ?? []) as FieldReport[])
    if (ph.length > 0) {
      const { data } = await supabase!.storage.from('field').createSignedUrls(ph.map((p) => p.file_path), 3600)
      if (data) {
        setPhotoUrls(new Map(data.flatMap((d, i) => (d.signedUrl ? [[ph[i].id, d.signedUrl] as [string, string]] : []))))
      }
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function uploadPhotos(files: File[]) {
    if (files.length === 0) return
    setUploading(true)
    for (const file of files) {
      const path = `${id}/${Date.now()}_${file.name.replace(/[^\w.\-]/g, '_')}`
      const { error: upErr } = await supabase!.storage.from('field').upload(path, file)
      if (upErr) {
        setError(upErr.message)
        continue
      }
      await supabase!.from('field_photos').insert({
        bid_id: id,
        file_path: path,
        uploaded_by: session?.user.email ?? null,
      })
    }
    setUploading(false)
    void load()
  }

  async function patchPhoto(p: FieldPhoto, note: string) {
    await supabase!.from('field_photos').update({ note: note || null }).eq('id', p.id)
    setPhotos((prev) => prev.map((x) => (x.id === p.id ? { ...x, note: note || null } : x)))
  }

  async function removePhoto(p: FieldPhoto) {
    setRemovingPhoto(null)
    await supabase!.storage.from('field').remove([p.file_path])
    await supabase!.from('field_photos').delete().eq('id', p.id)
    void load()
  }

  async function removeReport(r: FieldReport) {
    setRemovingReport(null)
    await supabase!.from('field_reports').delete().eq('id', r.id)
    void load()
  }

  if (error)
    return <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>
  if (!bid) return <p className="text-sm text-slate-500">Loading…</p>

  const totalHours = times.reduce((s, t) => s + Number(t.hours), 0)

  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-lg font-semibold tracking-tight">
        <span className="mr-2 font-mono text-sm text-slate-500">{bid.job_number}</span>
        {bid.name} — field
      </h1>

      {/* ---------- Photos ---------- */}
      <section>
        <div className="mb-2 flex items-center">
          <h2 className="font-mono text-[11px] uppercase tracking-widest text-slate-500">Job photos</h2>
          <label className={`ml-auto cursor-pointer rounded-md px-3 py-1.5 text-sm font-semibold text-white ${uploading ? 'bg-slate-400' : 'bg-slate-900 hover:bg-slate-700'}`}>
            {uploading ? 'Uploading…' : '+ Add photos'}
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                if (e.target.files?.length) void uploadPhotos([...e.target.files])
                e.target.value = ''
              }}
            />
          </label>
        </div>
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            const images = [...e.dataTransfer.files].filter((f) => f.type.startsWith('image/'))
            void uploadPhotos(images)
          }}
          className={`rounded-lg transition-colors ${dragging ? 'bg-emerald-50 outline-dashed outline-2 outline-emerald-600' : ''}`}
        >
        {photos.length === 0 ? (
          <p className={`rounded-lg border-2 border-dashed bg-white p-5 text-center text-sm ${dragging ? 'border-emerald-600 font-semibold text-emerald-700' : 'border-slate-300 text-slate-500'}`}>
            {dragging ? 'Drop the photos to upload' : 'No photos yet — drag pictures here, or installers add them right from their phone.'}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {photos.map((p) => (
              <div key={p.id} className="overflow-hidden rounded-lg border-2 border-slate-800 bg-white">
                {photoUrls.get(p.id) && (
                  <a href={photoUrls.get(p.id)} target="_blank" rel="noreferrer">
                    <img src={photoUrls.get(p.id)} alt={p.note ?? ''} className="aspect-square w-full object-cover" />
                  </a>
                )}
                <div className="p-1.5">
                  <input
                    defaultValue={p.note ?? ''}
                    placeholder="caption…"
                    onBlur={(e) => e.target.value !== (p.note ?? '') && void patchPhoto(p, e.target.value)}
                    className="w-full rounded border border-transparent px-1 py-0.5 text-xs focus:border-slate-800 focus:outline-none"
                  />
                  <div className="flex items-center gap-1 px-1 text-[10px] text-slate-400">
                    <span className="truncate">{p.uploaded_by?.split('@')[0]}</span>
                    <span className="ml-auto">{fmtDay(p.created_at.slice(0, 10))}</span>
                    <button
                      onClick={() => setRemovingPhoto(p)}
                      title="Delete photo"
                      className="ml-1 px-1 text-lg leading-none text-slate-400 hover:text-red-600"
                    >
                      ×
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        </div>
      </section>

      {/* ---------- Time ---------- */}
      <section>
        <div className="mb-2 flex items-baseline">
          <h2 className="font-mono text-[11px] uppercase tracking-widest text-slate-500">Time on this job</h2>
          <span className="ml-auto text-sm font-semibold tabular-nums">{totalHours.toFixed(1)} hrs total</span>
        </div>
        <TimeEntryForm bidId={bid.id} onAdded={() => void load()} />
        {times.length > 0 && (
          <div className="mt-2 overflow-hidden rounded-lg border-2 border-slate-800 bg-white">
            {times.map((t, i) => (
              <div key={t.id} className={`flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2 text-sm ${i > 0 ? 'border-t border-slate-100' : ''}`}>
                <span className="w-24 font-mono text-xs text-slate-500">{fmtDay(t.work_date)}</span>
                <span className="font-medium">{t.worker}</span>
                <span className="rounded border border-slate-200 px-1 font-mono text-[9px] uppercase text-slate-400">{t.kind}</span>
                {t.note && <span className="min-w-0 flex-1 truncate text-xs text-slate-500">{t.note}</span>}
                <span className="ml-auto font-semibold tabular-nums">{Number(t.hours).toFixed(1)} hrs</span>
                <button
                  onClick={() => {
                    void supabase!.from('time_entries').delete().eq('id', t.id).then(() => void load())
                  }}
                  className="text-slate-300 hover:text-red-600"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ---------- Reports ---------- */}
      <section>
        <div className="mb-2 flex items-center">
          <h2 className="font-mono text-[11px] uppercase tracking-widest text-slate-500">Client reports</h2>
          {canSchedule && (
            <button
              onClick={() => setEditing('new')}
              className="ml-auto rounded-md bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-700"
            >
              + New report
            </button>
          )}
        </div>
        {reports.length === 0 ? (
          <p className="rounded-lg border-2 border-dashed border-slate-300 bg-white p-5 text-center text-sm text-slate-500">
            {canSchedule
              ? 'No reports yet — fill one out and the app builds a printable report from your write-up and the photos you pick.'
              : 'No reports yet.'}
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border-2 border-slate-800 bg-white">
            {reports.map((r, i) => (
              <div key={r.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm ${i > 0 ? 'border-t border-slate-100' : ''}`}>
                <span className="font-mono text-xs text-slate-500">{fmtDay(r.report_date)}</span>
                <span className="min-w-0 flex-1 truncate">{r.work_performed || '—'}</span>
                <span className="text-xs text-slate-400">{r.photo_ids.length} photo{r.photo_ids.length === 1 ? '' : 's'}</span>
                <Link
                  to={`/bids/${bid.id}/field/report/${r.id}`}
                  className="rounded-md border-2 border-slate-900 px-2.5 py-0.5 text-xs font-semibold text-slate-900 hover:bg-slate-900 hover:text-white"
                >
                  View / print →
                </Link>
                {canSchedule && (
                  <>
                    <button onClick={() => setEditing(r)} className="text-xs text-slate-400 hover:text-slate-900">edit</button>
                    <button onClick={() => setRemovingReport(r)} className="text-xs text-slate-300 hover:text-red-600">remove</button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {editing && (
        <ReportForm
          bidId={bid.id}
          report={editing === 'new' ? null : editing}
          photos={photos}
          photoUrls={photoUrls}
          author={session?.user.email ?? null}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            void load()
          }}
        />
      )}
      {removingPhoto && (
        <ConfirmDialog
          title="Delete photo"
          message="Delete this photo? Reports that used it will lose it too."
          onConfirm={() => void removePhoto(removingPhoto)}
          onCancel={() => setRemovingPhoto(null)}
        />
      )}
      {removingReport && (
        <ConfirmDialog
          title="Remove report"
          message={`Remove the ${fmtDay(removingReport.report_date)} report?`}
          confirmLabel="Remove"
          onConfirm={() => void removeReport(removingReport)}
          onCancel={() => setRemovingReport(null)}
        />
      )}
    </div>
  )
}

function TimeEntryForm({ bidId, onAdded }: { bidId: string; onAdded: () => void }) {
  const { session } = useAuth()
  // time always logs against the signed-in account — no typing someone else's name
  const worker = session?.user.email?.split('@')[0] ?? 'unknown'
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [hours, setHours] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!hours) return
    setBusy(true)
    await supabase!.from('time_entries').insert({
      bid_id: bidId,
      worker,
      work_date: date,
      hours: Number(hours),
      note: note.trim() || null,
      created_by: session?.user.email ?? null,
    })
    setHours('')
    setNote('')
    setBusy(false)
    onAdded()
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2 rounded-lg border-2 border-slate-800 bg-white p-3">
      <div className="block">
        <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">Logging as</span>
        <div className="mt-0.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm font-medium text-slate-600">
          {worker}
        </div>
      </div>
      <label className="block">
        <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">Day</span>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required className="input mt-0.5 w-40 py-1.5" />
      </label>
      <label className="block">
        <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">Hours</span>
        <input type="number" step="0.5" min="0.5" max="24" value={hours} onChange={(e) => setHours(e.target.value)} required className="input mt-0.5 w-24 py-1.5" />
      </label>
      <label className="block min-w-0 flex-1 basis-40">
        <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">What got done (optional)</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} className="input mt-0.5 py-1.5" />
      </label>
      <button type="submit" disabled={busy} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50">
        {busy ? 'Adding…' : 'Add'}
      </button>
    </form>
  )
}

function ReportForm({
  bidId, report, photos, photoUrls, author, onClose, onSaved,
}: {
  bidId: string
  report: FieldReport | null
  photos: FieldPhoto[]
  photoUrls: Map<string, string>
  author: string | null
  onClose: () => void
  onSaved: () => void
}) {
  const [date, setDate] = useState(report?.report_date ?? new Date().toISOString().slice(0, 10))
  const [crew, setCrew] = useState(report?.crew ?? '')
  const [work, setWork] = useState(report?.work_performed ?? '')
  const [issues, setIssues] = useState(report?.issues ?? '')
  const [nextSteps, setNextSteps] = useState(report?.next_steps ?? '')
  const [picked, setPicked] = useState<string[]>(report?.photo_ids ?? [])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    const fields = {
      report_date: date,
      crew: crew.trim() || null,
      work_performed: work.trim(),
      issues: issues.trim() || null,
      next_steps: nextSteps.trim() || null,
      photo_ids: picked,
    }
    const { error } = report
      ? await supabase!.from('field_reports').update(fields).eq('id', report.id)
      : await supabase!.from('field_reports').insert({ ...fields, bid_id: bidId, created_by: author })
    if (error) {
      setError(error.message)
      setBusy(false)
    } else onSaved()
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end sm:items-center justify-center bg-slate-900/40 p-0 sm:p-6">
      <div className="w-full max-w-2xl rounded-t-xl sm:rounded-xl border-2 border-slate-800 bg-white max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b-2 border-slate-800 px-5 py-3">
          <h2 className="font-semibold">{report ? 'Edit report' : 'New client report'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="font-mono text-[11px] uppercase tracking-widest text-slate-500">Report date</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required className="input" />
            </label>
            <label className="block">
              <span className="font-mono text-[11px] uppercase tracking-widest text-slate-500">Crew on site</span>
              <input value={crew} onChange={(e) => setCrew(e.target.value)} placeholder="Mike, Danny" className="input" />
            </label>
          </div>
          <label className="block">
            <span className="font-mono text-[11px] uppercase tracking-widest text-slate-500">Work performed</span>
            <textarea rows={4} value={work} onChange={(e) => setWork(e.target.value)} required
              placeholder="Set base cabinets in break room, hung uppers on north wall…" className="input" />
          </label>
          <label className="block">
            <span className="font-mono text-[11px] uppercase tracking-widest text-slate-500">Issues / delays (optional)</span>
            <textarea rows={2} value={issues} onChange={(e) => setIssues(e.target.value)} className="input" />
          </label>
          <label className="block">
            <span className="font-mono text-[11px] uppercase tracking-widest text-slate-500">Next steps (optional)</span>
            <textarea rows={2} value={nextSteps} onChange={(e) => setNextSteps(e.target.value)} className="input" />
          </label>
          <div>
            <span className="font-mono text-[11px] uppercase tracking-widest text-slate-500">
              Photos to include — tap to pick ({picked.length} picked)
            </span>
            {photos.length === 0 ? (
              <p className="mt-1 text-sm text-slate-400">No job photos yet.</p>
            ) : (
              <div className="mt-1 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {photos.map((p) => {
                  const on = picked.includes(p.id)
                  return (
                    <button
                      type="button"
                      key={p.id}
                      onClick={() => setPicked((prev) => (on ? prev.filter((x) => x !== p.id) : [...prev, p.id]))}
                      className={`relative overflow-hidden rounded-md border-2 ${on ? 'border-emerald-600' : 'border-slate-200 opacity-70 hover:opacity-100'}`}
                    >
                      {photoUrls.get(p.id) && (
                        <img src={photoUrls.get(p.id)} alt="" className="aspect-square w-full object-cover" />
                      )}
                      {on && (
                        <span className="absolute right-1 top-1 rounded-full bg-emerald-600 px-1.5 text-xs font-bold text-white">✓</span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
          {error && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">
              Cancel
            </button>
            <button type="submit" disabled={busy} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50">
              {busy ? 'Saving…' : 'Save report'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
