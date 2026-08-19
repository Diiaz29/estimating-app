import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import JSZip from 'jszip'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { LOGO_URL } from '../lib/branding'
import type { Bid } from '../lib/types'
import { fmtMoney } from '../lib/format'
import ConfirmDialog from '../components/ConfirmDialog'

const fmtDay = (iso: string) =>
  new Date(`${iso}T12:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
const isoDaysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)

interface Receipt {
  id: string
  bid_id: string | null
  file_path: string
  amount: number | null
  category: 'materials' | 'delivery' | 'travel' | 'subs' | 'other'
  note: string | null
  receipt_date: string | null
  is_overhead: boolean
  overhead_category: string | null
  payment_method_id: string | null
  needs_card_review: boolean
  uploaded_by: string | null
  created_at: string
}

interface PaymentMethod {
  id: string
  name: string
  sort_order: number
  active: boolean
  owner_id: string | null
}

const CATEGORIES: Receipt['category'][] = ['materials', 'delivery', 'travel', 'subs', 'other']
const CATEGORY_LABEL: Record<Receipt['category'], string> = {
  materials: 'Materials',
  delivery: 'Delivery',
  travel: 'Travel',
  subs: 'Subcontractors',
  other: 'Other',
}
interface OverheadCategory {
  id: string
  name: string
  sort_order: number
}
/** A receipt file that's uploaded and read but not saved yet */
interface Pending {
  key: string
  path: string
  name: string
  previewUrl: string
  isPdf: boolean
  read: { state: 'reading' | 'read' | 'failed'; detail?: string }
  found?: { date: string | null; total: number | null; merchant: string | null; cardId: string | null }
  applied: boolean // pushed into the form yet?
}
const monthLabel = (iso: string) =>
  new Date(`${iso.slice(0, 7)}-15T12:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

/** Phone photos run 4–8 MB; shrink big images to ≤2000px JPEG before upload so
 *  they store small and the reader (5 MB image cap) can take them. Anything that
 *  can't be decoded (HEIC on non-Safari, etc.) goes up untouched. */
async function shrinkImage(file: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type) || file.size < 1_200_000) return file
  try {
    const bmp = await createImageBitmap(file)
    const max = 2000
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bmp.width * scale)
    canvas.height = Math.round(bmp.height * scale)
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
    bmp.close()
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.85))
    if (!blob || blob.size >= file.size) return file
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch {
    return file
  }
}
/** Company-wide receipt inbox: upload against any job; every receipt lands on
 *  that job's Actuals tab (same table). Sorted by job → category → date. */
export default function Receipts() {
  const { session, isOffice, isAdmin } = useAuth()
  // anyone signed in can file a receipt (installers buy things too);
  // office/admin see everyone's and reconcile by card
  const reconciles = isOffice || isAdmin
  const [jobs, setJobs] = useState<Bid[]>([])
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [error, setError] = useState<string | null>(null)
  const [removing, setRemoving] = useState<Receipt | null>(null)
  const [showCompleted, setShowCompleted] = useState(false)
  const [ohCats, setOhCats] = useState<OverheadCategory[]>([])
  const [managingCats, setManagingCats] = useState(false)
  const [methods, setMethods] = useState<PaymentMethod[]>([])
  const [filterMethod, setFilterMethod] = useState('') // '' = any

  // printable expense report (office/admin)
  const [reportOpen, setReportOpen] = useState(false)
  const [repFrom, setRepFrom] = useState(() => isoDaysAgo(29))
  const [repTo, setRepTo] = useState(() => new Date().toISOString().slice(0, 10))
  const [repPeople, setRepPeople] = useState<string[]>([]) // uploaded_by emails; empty = all
  const [repJobs, setRepJobs] = useState<string[]>([]) // bid ids or 'overhead'; empty = all
  const [repPicker, setRepPicker] = useState<'people' | 'jobs' | null>(null)
  const [company, setCompany] = useState<Record<string, string>>({})
  const [logoOk, setLogoOk] = useState(true)

  // upload form
  const [jobId, setJobId] = useState('')
  const [isOverhead, setIsOverhead] = useState(false)
  const [overheadCat, setOverheadCat] = useState('')
  const [methodId, setMethodId] = useState('')
  const [category, setCategory] = useState<Receipt['category']>('materials')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  // did the uploader change the date by hand? if not, the date read off the receipt wins
  const [dateTouched, setDateTouched] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  // files waiting to be reviewed: uploaded to storage, read by Claude, but no
  // receipt row until the uploader checks the numbers and hits Save
  const [pending, setPending] = useState<Pending[]>([])
  const current = pending[0]

  async function load() {
    const [jobRes, recRes, catRes, pmRes] = await Promise.all([
      supabase!.from('bids').select('*').eq('status', 'won').order('job_number'),
      supabase!.from('receipts').select('*').order('receipt_date', { ascending: false }).order('created_at', { ascending: false }),
      supabase!.from('overhead_categories').select('*').order('sort_order').order('name'),
      supabase!.from('payment_methods').select('*').order('sort_order').order('name'),
    ])
    if (jobRes.error) return setError(jobRes.error.message)
    const rows = jobRes.data as Bid[]
    setJobs(rows)
    setJobId((cur) => cur || rows.find((j) => !j.completed_at)?.id || rows[0]?.id || '')
    setReceipts((recRes.data ?? []) as Receipt[])
    const cats = (catRes.data ?? []) as OverheadCategory[]
    setOhCats(cats)
    setOverheadCat((cur) => (cur && cats.some((c) => c.name === cur) ? cur : cats[0]?.name ?? ''))
    setMethods((pmRes.data ?? []) as PaymentMethod[])
    const { data: co } = await supabase!.from('text_settings').select('key, value').eq('group_name', 'Company')
    if (co) setCompany(Object.fromEntries((co as { key: string; value: string }[]).map((t) => [t.key, t.value])))
  }

  const catNames = ohCats.map((c) => c.name)
  const activeMethods = methods.filter((m) => m.active)
  const methodName = (id: string | null) => methods.find((m) => m.id === id)?.name ?? null

  // the uploader's own cards drive the picker: none → flagged; one → silent
  // default; several → pick. Office/admin always get the full list.
  const myId = session?.user.id ?? ''
  const myCards = activeMethods.filter((m) => m.owner_id === myId)
  const pickerCards = reconciles ? activeMethods : myCards
  const showPicker = pickerCards.length > 1 || (reconciles && pickerCards.length > 0)
  const noCard = !reconciles && myCards.length === 0

  useEffect(() => {
    if (!methodId && myCards.length === 1) setMethodId(myCards[0].id)
    if (methodId && !pickerCards.some((m) => m.id === methodId) && !reconciles) setMethodId(myCards[0]?.id ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [methods, myId])

  useEffect(() => {
    void load()
  }, [])

  // Step 1: drop/choose files → upload to storage and read them. Nothing is
  // filed yet; each file waits in `pending` until the uploader hits Save.
  async function stageFiles(files: File[]) {
    // phone cameras sometimes hand over a file with no type at all — go by the name then
    const looksLikeReceipt = (f: File) =>
      /^image\//.test(f.type) || f.type === 'application/pdf' || (!f.type && /\.(jpe?g|png|heic|heif|webp|pdf)$/i.test(f.name))
    const ok = files.filter(looksLikeReceipt)
    if (ok.length === 0) {
      setError(`That file type isn't supported (${files.map((f) => f.type || f.name).join(', ')}) — use a photo or PDF.`)
      return
    }
    setUploading(true)
    try {
      for (const raw of ok) {
        const file = await shrinkImage(raw)
        const folder = isOverhead ? 'overhead' : jobId || 'unsorted'
        const ext = file.name.includes('.') ? '' : file.type === 'application/pdf' ? '.pdf' : '.jpg'
        const path = `${folder}/${Date.now()}_${file.name.replace(/[^\w.\-]/g, '_')}${ext}`
        const { error: upErr } = await supabase!.storage.from('receipts').upload(path, file, {
          contentType: file.type || (ext === '.pdf' ? 'application/pdf' : 'image/jpeg'),
        })
        if (upErr) {
          setError(`Upload failed: ${upErr.message}`)
          continue
        }
        const key = `${Date.now()}_${Math.random()}`
        setPending((p) => [
          ...p,
          { key, path, name: raw.name || 'photo', previewUrl: URL.createObjectURL(file), isPdf: file.type === 'application/pdf', read: { state: 'reading' }, applied: false },
        ])
        void readPending(key, path)
      }
    } catch (e) {
      setError(`Upload failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setUploading(false)
    }
  }

  // Ask the read-receipt function for date / total / store / card.
  async function readPending(key: string, path: string) {
    const { data, error } = await supabase!.functions.invoke('read-receipt', { body: { path } })
    const res = data as { ok: boolean; reason?: string; date: string | null; total: number | null; merchant: string | null; card_last4: string | null } | null
    const update = (patch: Partial<Pending>) => setPending((p) => p.map((x) => (x.key === key ? { ...x, ...patch } : x)))
    if (error || !res?.ok) {
      update({ read: { state: 'failed', detail: res?.reason ?? error?.message ?? 'no answer' } })
      return
    }
    if (res.date == null && res.total == null) {
      update({ read: { state: 'failed', detail: "couldn't make out a date or total" } })
      return
    }
    // a card named with those four digits ("Amex 1234") gets picked automatically
    const hits = res.card_last4 ? activeMethods.filter((m) => m.name.includes(res.card_last4!)) : []
    const cardId = hits.length === 1 ? hits[0].id : null
    const bits: string[] = []
    if (res.date) bits.push(res.date.slice(5).replace('-', '/'))
    if (res.total != null) bits.push(fmtMoney(res.total))
    if (res.merchant) bits.push(res.merchant)
    if (res.card_last4) bits.push(cardId ? hits[0].name : `card …${res.card_last4}`)
    update({
      read: { state: 'read', detail: bits.join(' · ') },
      found: { date: res.date, total: res.total, merchant: res.merchant, cardId },
    })
  }

  // When the file at the front of the queue has been read, drop what it found
  // into the form — but never over something the uploader already typed.
  useEffect(() => {
    if (!current || current.applied || current.read.state === 'reading') return
    const f = current.found
    if (f) {
      if (f.date && !dateTouched) setDate(f.date)
      if (f.total != null && amount === '') setAmount(String(f.total))
      if (f.merchant && note.trim() === '') setNote(f.merchant)
      if (f.cardId && !methodId) setMethodId(f.cardId)
    }
    setPending((p) => p.map((x) => (x.key === current.key ? { ...x, applied: true } : x)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.key, current?.read.state])

  function resetForm() {
    setAmount('')
    setNote('')
    setMethodId(myCards.length === 1 ? myCards[0].id : '')
  }

  function dropCurrent() {
    if (!current) return
    URL.revokeObjectURL(current.previewUrl)
    setPending((p) => p.slice(1))
    resetForm()
  }

  // Step 2: the uploader checked the numbers → file the receipt for real.
  async function saveCurrent() {
    if (!current || (!isOverhead && !jobId)) return
    const { error } = await supabase!.from('receipts').insert({
      bid_id: isOverhead ? null : jobId,
      is_overhead: isOverhead,
      overhead_category: isOverhead ? overheadCat : null,
      payment_method_id: methodId || null,
      // no card on file for this person → office needs to sort out which card
      needs_card_review: !methodId && noCard,
      file_path: current.path,
      amount: amount !== '' ? Number(amount) : null,
      category: isOverhead ? 'other' : category,
      note: note.trim() || null,
      receipt_date: date || null,
      uploaded_by: session?.user.email ?? null,
    })
    if (error) return setError(error.message)
    dropCurrent()
    void load()
  }

  async function discardCurrent() {
    if (!current) return
    await supabase!.storage.from('receipts').remove([current.path])
    dropCurrent()
  }

  async function patch(r: Receipt, fields: Partial<Receipt>) {
    setReceipts((prev) => prev.map((x) => (x.id === r.id ? { ...x, ...fields } : x)))
    const { error } = await supabase!.from('receipts').update(fields).eq('id', r.id)
    if (error) setError(error.message)
  }

  async function view(r: Receipt) {
    const { data, error } = await supabase!.storage.from('receipts').createSignedUrl(r.file_path, 300)
    if (error) setError(error.message)
    else if (data) window.open(data.signedUrl, '_blank')
  }

  // a clean filename for QBO: date_job_what.ext
  function niceName(r: Receipt) {
    const ext = r.file_path.split('.').pop() ?? 'jpg'
    const date = r.receipt_date ?? r.created_at.slice(0, 10)
    const where = r.is_overhead ? 'overhead' : jobById.get(r.bid_id ?? '')?.job_number ?? 'job'
    const what = (r.note ?? 'receipt').replace(/[^\w\-]+/g, '_').slice(0, 40)
    return `${date}_${where}_${what}.${ext}`
  }

  async function download(r: Receipt) {
    const { data, error } = await supabase!.storage.from('receipts').download(r.file_path)
    if (error || !data) return setError(error?.message ?? 'Download failed')
    triggerDownload(data, niceName(r))
  }

  const [zipping, setZipping] = useState(false)
  async function downloadZip(rows: Receipt[], label: string) {
    if (rows.length === 0) return
    setZipping(true)
    try {
      const zip = new JSZip()
      for (const r of rows) {
        const { data } = await supabase!.storage.from('receipts').download(r.file_path)
        if (data) zip.file(niceName(r), data)
      }
      const blob = await zip.generateAsync({ type: 'blob' })
      triggerDownload(blob, `receipts_${label}.zip`)
    } finally {
      setZipping(false)
    }
  }

  function triggerDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  async function remove(r: Receipt) {
    setRemoving(null)
    await supabase!.storage.from('receipts').remove([r.file_path])
    await supabase!.from('receipts').delete().eq('id', r.id)
    void load()
  }

  const jobById = useMemo(() => new Map(jobs.map((j) => [j.id, j])), [jobs])

  // office/admin see everything; everyone else only what they filed.
  // "paid with" filter narrows both lists (for card statement reconciliation).
  const visible = useMemo(() => {
    const mine = reconciles ? receipts : receipts.filter((r) => r.uploaded_by === session?.user.email)
    return filterMethod ? mine.filter((r) => r.payment_method_id === filterMethod) : mine
  }, [receipts, filterMethod, reconciles, session?.user.email])

  // overhead → category → receipts
  const overheadGrouped = useMemo(() => {
    const byCat = new Map<string, Receipt[]>()
    for (const r of visible) {
      if (!r.is_overhead) continue
      const c = r.overhead_category ?? 'other'
      if (!byCat.has(c)) byCat.set(c, [])
      byCat.get(c)!.push(r)
    }
    return [...byCat.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [visible])
  const overheadTotal = visible.filter((r) => r.is_overhead).reduce((s, r) => s + Number(r.amount ?? 0), 0)

  // job → category → receipts (already date-sorted from the query)
  const grouped = useMemo(() => {
    const byJob = new Map<string, Map<string, Receipt[]>>()
    for (const r of visible) {
      if (r.is_overhead || !r.bid_id) continue
      const job = jobById.get(r.bid_id)
      if (!job) continue
      if (!showCompleted && job.completed_at) continue
      if (!byJob.has(r.bid_id)) byJob.set(r.bid_id, new Map())
      const cats = byJob.get(r.bid_id)!
      if (!cats.has(r.category)) cats.set(r.category, [])
      cats.get(r.category)!.push(r)
    }
    return [...byJob.entries()].sort((a, b) =>
      (jobById.get(a[0])?.job_number ?? '').localeCompare(jobById.get(b[0])?.job_number ?? ''),
    )
  }, [visible, jobById, showCompleted])
  const filteredTotal = visible
    .filter((r) => r.is_overhead || (r.bid_id && jobById.get(r.bid_id)))
    .reduce((s, r) => s + Number(r.amount ?? 0), 0)

  // ---- report: date range + people + jobs (overhead is a pseudo-job) ----
  const repPeopleAll = [...new Set(receipts.map((r) => r.uploaded_by ?? 'unknown'))].sort()
  const repJobsAll = [
    ...(receipts.some((r) => r.is_overhead) ? ['overhead'] : []),
    ...[...new Set(receipts.filter((r) => r.bid_id).map((r) => r.bid_id!))].filter((id) => jobById.has(id)),
  ]
  const repJobLabel = (id: string) => {
    if (id === 'overhead') return 'Overhead / office / shop'
    const j = jobById.get(id)
    return j ? `${j.job_number} ${j.name}` : '—'
  }
  const report = useMemo(() => {
    return receipts
      .filter((r) => {
        const d = r.receipt_date ?? r.created_at.slice(0, 10)
        if (d < repFrom || d > repTo) return false
        if (repPeople.length > 0 && !repPeople.includes(r.uploaded_by ?? 'unknown')) return false
        const key = r.is_overhead ? 'overhead' : r.bid_id ?? ''
        if (repJobs.length > 0 && !repJobs.includes(key)) return false
        if (!r.is_overhead && !(r.bid_id && jobById.has(r.bid_id))) return false
        return true
      })
      .sort((a, b) => (a.receipt_date ?? '').localeCompare(b.receipt_date ?? ''))
  }, [receipts, repFrom, repTo, repPeople, repJobs, jobById])
  // grouped job → rows, overhead last
  const reportGroups = useMemo(() => {
    const m = new Map<string, Receipt[]>()
    for (const r of report) {
      const key = r.is_overhead ? 'overhead' : r.bid_id!
      if (!m.has(key)) m.set(key, [])
      m.get(key)!.push(r)
    }
    return [...m.entries()].sort((a, b) => {
      if (a[0] === 'overhead') return 1
      if (b[0] === 'overhead') return -1
      return (jobById.get(a[0])?.job_number ?? '').localeCompare(jobById.get(b[0])?.job_number ?? '')
    })
  }, [report, jobById])
  const reportTotal = report.reduce((s, r) => s + Number(r.amount ?? 0), 0)
  const repRangeLabel = `${fmtDay(repFrom)} — ${fmtDay(repTo)}`

  const missingAmount = receipts.filter((r) => r.amount == null && (r.is_overhead || (r.bid_id && jobById.get(r.bid_id)))).length

  return (
    <div className="max-w-4xl space-y-5 print:max-w-none">
      {error && (
        <p className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 print:hidden">
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-700" title="Dismiss">×</button>
        </p>
      )}
      <div className="print:hidden">
        <h1 className="text-lg font-semibold tracking-tight">Receipts</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Drop every receipt here and say which job it belongs to — it shows up on that job's Actuals
          automatically.
        </p>
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
          void stageFiles([...e.dataTransfer.files])
        }}
        className={`rounded-lg border-2 bg-white p-4 transition-colors print:hidden ${
          dragging ? 'border-dashed border-emerald-600 bg-emerald-50' : 'border-slate-800'
        }`}
      >
        {/* The receipt being reviewed: preview + what the reader found */}
        {current && (
          <div className="mb-3 flex flex-wrap items-start gap-3 rounded-md border border-slate-300 bg-slate-50 p-3">
            {current.isPdf ? (
              <a href={current.previewUrl} target="_blank" rel="noreferrer" className="flex h-24 w-20 flex-col items-center justify-center rounded border border-slate-300 bg-white text-2xl">
                <span className="text-xs font-semibold">PDF</span><span className="mt-1 text-[10px] text-slate-500">open</span>
              </a>
            ) : (
              <a href={current.previewUrl} target="_blank" rel="noreferrer" title="Open full size">
                <img src={current.previewUrl} alt="" className="h-24 w-20 rounded border border-slate-300 bg-white object-cover" />
              </a>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-800">{current.name}</p>
              {current.read.state === 'reading' && <p className="mt-1 animate-pulse text-xs text-slate-500">Reading the receipt…</p>}
              {current.read.state === 'read' && (
                <p className="mt-1 text-xs text-emerald-800">✓ Read: {current.read.detail} — check the fields below, then save.</p>
              )}
              {current.read.state === 'failed' && (
                <p className="mt-1 text-xs text-amber-800" title={current.read.detail}>
                  Couldn't read this one — fill in the fields below by hand, then save.
                </p>
              )}
              {pending.length > 1 && <p className="mt-1 text-[11px] text-slate-400">{pending.length - 1} more waiting after this one</p>}
            </div>
          </div>
        )}
        <label className="mb-3 flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={isOverhead}
            onChange={(e) => setIsOverhead(e.target.checked)}
            className="h-5 w-5 rounded border-slate-300 accent-slate-900"
          />
          <span className="text-sm font-medium text-slate-700">Overhead / office / shop expense — not for a job</span>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          {isOverhead ? (
            <div className="block sm:col-span-2">
              <span className="flex items-baseline">
                <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">Overhead category</span>
                <button
                  type="button"
                  onClick={() => setManagingCats(true)}
                  className="ml-auto text-xs text-slate-500 underline decoration-dotted hover:text-slate-900"
                >
                  edit categories
                </button>
              </span>
              <select value={overheadCat} onChange={(e) => setOverheadCat(e.target.value)} className="input mt-0.5">
                {catNames.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          ) : jobs.length === 0 ? (
            <p className="rounded-md border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-500 sm:col-span-2">
              No won jobs yet — check the box above to file this as overhead.
            </p>
          ) : (
            <>
              <label className="block sm:col-span-2">
                <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">Job</span>
                <select value={jobId} onChange={(e) => setJobId(e.target.value)} className="input mt-0.5">
                  {jobs.filter((j) => !j.completed_at).map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.job_number} — {j.name}
                    </option>
                  ))}
                  {jobs.some((j) => j.completed_at) && (
                    <optgroup label="Completed jobs">
                      {jobs.filter((j) => j.completed_at).map((j) => (
                        <option key={j.id} value={j.id}>
                          {j.job_number} — {j.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </label>
              <label className="block">
                <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">For</span>
                <select value={category} onChange={(e) => setCategory(e.target.value as Receipt['category'])} className="input mt-0.5">
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
                  ))}
                </select>
              </label>
            </>
          )}
            {showPicker && (
              <label className="block">
                <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">Paid with</span>
                <select value={methodId} onChange={(e) => setMethodId(e.target.value)} className="input mt-0.5">
                  <option value="">— not set —</option>
                  {pickerCards.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </label>
            )}
            {noCard && (
              <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 sm:col-span-2">
                No card is on file for you — go ahead and upload; the office will sort out which card
                it went on.
              </p>
            )}
            <label className="block">
              <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">Date on receipt</span>
              <input
                type="date"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value)
                  setDateTouched(true)
                }}
                className="input mt-0.5"
              />
            </label>
            <label className="block">
              <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">Amount ($)</span>
              <input type="number" step="any" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="read from receipt" className="input mt-0.5" />
            </label>
            <label className="block">
              <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">What is it</span>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="read from receipt" className="input mt-0.5" />
            </label>
            {!current && (
              <p className="text-xs text-slate-500 sm:col-span-2">
                Add the photo or PDF first — date, amount, store and card get read off it and filled in here for
                you to check. Nothing is saved until you hit Save.
              </p>
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {current ? (
              <>
                <button
                  onClick={() => void saveCurrent()}
                  disabled={current.read.state === 'reading' || (!isOverhead && !jobId)}
                  className="flex-1 rounded-md bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-600 disabled:bg-slate-400 sm:flex-none sm:py-2"
                >
                  {current.read.state === 'reading' ? 'Reading…' : '✓ Save receipt'}
                </button>
                <button
                  onClick={() => void discardCurrent()}
                  className="rounded-md border border-slate-300 px-3 py-2.5 text-sm text-slate-600 hover:border-red-400 hover:text-red-700 sm:py-2"
                >
                  Discard
                </button>
                <label className={`basis-full cursor-pointer rounded-md border border-dashed px-3 py-2 text-center text-xs sm:ml-auto sm:basis-auto ${dragging ? 'border-emerald-500 font-semibold text-emerald-700' : 'border-slate-300 text-slate-500 hover:border-slate-500'}`}>
                  {dragging ? 'Drop to add' : '+ add another'}
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    multiple
                    className="hidden"
                    disabled={uploading}
                    onChange={(e) => {
                      if (e.target.files?.length) void stageFiles([...e.target.files])
                      e.target.value = ''
                    }}
                  />
                </label>
              </>
            ) : (
              <>
                <p className={`hidden flex-1 rounded-md border border-dashed px-3 py-2 text-center text-xs sm:block ${dragging ? 'border-emerald-500 font-semibold text-emerald-700' : 'border-slate-300 text-slate-400'}`}>
                  {dragging ? 'Drop to read it' : 'Drag the photo or PDF here'}
                </p>
                <label className={`flex-1 cursor-pointer rounded-md px-4 py-2.5 text-center text-sm font-semibold text-white sm:flex-none sm:py-2 ${uploading ? 'bg-slate-400' : 'bg-slate-900 hover:bg-slate-700'}`}>
                  {uploading ? 'Uploading…' : '+ Add receipt'}
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    multiple
                    className="hidden"
                    disabled={uploading}
                    onChange={(e) => {
                      if (e.target.files?.length) void stageFiles([...e.target.files])
                      e.target.value = ''
                    }}
                  />
                </label>
              </>
            )}
          </div>
        </div>

      {/* ---------- Expense report (office/admin) ---------- */}
      {reconciles && (
        <section className={reportOpen ? '' : 'print:hidden'}>
          <div className="mb-2 flex flex-wrap items-center gap-2 print:hidden">
            <button
              onClick={() => setReportOpen((v) => !v)}
              className={`rounded-md border px-3 py-1.5 text-sm font-medium ${
                reportOpen ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-600 hover:border-slate-500'
              }`}
            >
              ▤ Expense report {reportOpen ? '▴' : '▾'}
            </button>
            {reportOpen && (
              <>
                <label className="block">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">From</span>
                  <input type="date" value={repFrom} onChange={(e) => setRepFrom(e.target.value)} className="input mt-0.5 py-1.5" />
                </label>
                <label className="block">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">To</span>
                  <input type="date" value={repTo} onChange={(e) => setRepTo(e.target.value)} className="input mt-0.5 py-1.5" />
                </label>
                <button
                  onClick={() => setRepPicker('people')}
                  className={`self-end rounded-md border px-3 py-2 text-sm font-medium ${
                    repPeople.length > 0 ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-600 hover:border-slate-500'
                  }`}
                >
                  People: {repPeople.length === 0 ? 'all' : repPeople.length} ▾
                </button>
                <button
                  onClick={() => setRepPicker('jobs')}
                  className={`self-end rounded-md border px-3 py-2 text-sm font-medium ${
                    repJobs.length > 0 ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-600 hover:border-slate-500'
                  }`}
                >
                  Jobs: {repJobs.length === 0 ? 'all' : repJobs.length} ▾
                </button>
                {(repPeople.length > 0 || repJobs.length > 0) && (
                  <button
                    onClick={() => {
                      setRepPeople([])
                      setRepJobs([])
                    }}
                    className="self-end px-2 py-2 text-sm text-slate-400 hover:text-slate-700"
                  >
                    clear filters
                  </button>
                )}
                <button
                  onClick={() => void downloadZip(report, `${repFrom}_to_${repTo}`)}
                  disabled={zipping || report.length === 0}
                  title="Every receipt file in this report, zipped and named date_job_what — ready for QuickBooks"
                  className="ml-auto self-end rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                >
                  {zipping ? 'Zipping…' : `↓ Download ${report.length} file${report.length === 1 ? '' : 's'}`}
                </button>
                <button
                  onClick={() => window.print()}
                  className="self-end rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
                >
                  Print
                </button>
              </>
            )}
          </div>

          {reportOpen && (
            <div className="light-doc rounded-lg border-2 border-slate-900 bg-white p-4 print:rounded-none print:border-0 print:p-0">
              <div className="flex items-center gap-4 border-b-4 border-slate-900 pb-2">
                {logoOk && LOGO_URL ? (
                  <img src={LOGO_URL} alt="" className="h-20 w-auto max-w-[20rem] object-contain" onError={() => setLogoOk(false)} />
                ) : (
                  <div className="text-lg font-bold tracking-tight">{company.company_name ?? ''}</div>
                )}
                <div className="ml-auto text-right">
                  <div className="text-base font-bold tracking-tight">EXPENSE REPORT</div>
                  <div className="text-[11px] text-slate-500">
                    {[company.company_address, company.company_phone].filter(Boolean).join(' · ')}
                  </div>
                  <div className="text-xs text-slate-500">
                    {repRangeLabel} · {report.length} receipt{report.length === 1 ? '' : 's'} · {fmtMoney(reportTotal)}
                  </div>
                  {(repPeople.length > 0 || repJobs.length > 0) && (
                    <div className="text-[10px] text-slate-400">
                      {repPeople.length > 0 && <>People: {repPeople.map((p) => p.split('@')[0]).join(', ')}</>}
                      {repPeople.length > 0 && repJobs.length > 0 && ' · '}
                      {repJobs.length > 0 && <>Jobs: {repJobs.map(repJobLabel).join(', ')}</>}
                    </div>
                  )}
                </div>
              </div>

              {reportGroups.length === 0 ? (
                <p className="py-3 text-sm text-slate-400">No receipts in this range.</p>
              ) : (
                reportGroups.map(([key, rows]) => {
                  const total = rows.reduce((s, r) => s + Number(r.amount ?? 0), 0)
                  return (
                    <div key={key} className="break-inside-avoid border-b border-slate-200 py-2 last:border-b-0">
                      <div className="flex items-baseline">
                        <span className="text-sm font-semibold">{repJobLabel(key)}</span>
                        <span className="ml-auto text-sm font-semibold tabular-nums">{fmtMoney(total)}</span>
                      </div>
                      <table className="mt-1 w-full text-xs">
                        <tbody>
                          {rows.map((r) => (
                            <tr key={r.id} className="align-top">
                              <td className="w-24 py-0.5 pr-2 font-mono text-slate-500 whitespace-nowrap">
                                {r.receipt_date ? fmtDay(r.receipt_date) : '—'}
                              </td>
                              <td className="py-0.5 pr-2">{r.note ?? r.file_path.split('/').pop()?.replace(/^\d+_/, '')}</td>
                              <td className="w-20 py-0.5 pr-2 font-mono text-[9px] uppercase text-slate-400">
                                {r.is_overhead ? r.overhead_category ?? 'other' : r.category}
                              </td>
                              <td className="hidden w-24 truncate py-0.5 pr-2 text-slate-500 sm:table-cell">{r.uploaded_by?.split('@')[0] ?? ''}</td>
                              <td className="hidden w-28 truncate py-0.5 pr-2 text-slate-500 sm:table-cell">{methodName(r.payment_method_id) ?? ''}</td>
                              <td className={`w-20 py-0.5 text-right tabular-nums ${r.amount == null ? 'text-amber-600' : ''}`}>
                                {r.amount == null ? 'no amt' : fmtMoney(Number(r.amount))}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                })
              )}
              {reportGroups.length > 0 && (
                <div className="flex items-baseline border-t-2 border-slate-900 pt-1.5">
                  <span className="text-sm font-semibold">Total</span>
                  <span className="ml-auto text-sm font-bold tabular-nums">{fmtMoney(reportTotal)}</span>
                </div>
              )}
            </div>
          )}

          {repPicker && (
            <div className="fixed inset-0 z-30 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-6 print:hidden">
              <div className="w-full max-w-sm rounded-t-xl border-2 border-slate-800 bg-white sm:rounded-xl">
                <div className="flex items-center justify-between border-b-2 border-slate-800 px-5 py-3">
                  <h2 className="font-semibold">{repPicker === 'people' ? 'Show these people' : 'Show these jobs'}</h2>
                  <button onClick={() => setRepPicker(null)} className="text-xl leading-none text-slate-400 hover:text-slate-700">×</button>
                </div>
                <div className="max-h-[60vh] overflow-y-auto p-3">
                  {(repPicker === 'people' ? repPeopleAll : repJobsAll).map((item) => {
                    const picked = repPicker === 'people' ? repPeople.includes(item) : repJobs.includes(item)
                    const toggle = () => {
                      if (repPicker === 'people') setRepPeople((p) => (p.includes(item) ? p.filter((x) => x !== item) : [...p, item]))
                      else setRepJobs((p) => (p.includes(item) ? p.filter((x) => x !== item) : [...p, item]))
                    }
                    return (
                      <label key={item} className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2.5 hover:bg-slate-50">
                        <input type="checkbox" checked={picked} onChange={toggle} className="h-5 w-5 rounded border-slate-300 accent-slate-900" />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">
                          {repPicker === 'people' ? item.split('@')[0] : repJobLabel(item)}
                        </span>
                      </label>
                    )
                  })}
                </div>
                <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3">
                  <button
                    onClick={() => (repPicker === 'people' ? setRepPeople([]) : setRepJobs([]))}
                    className="text-sm text-slate-500 hover:text-slate-900"
                  >
                    Show all
                  </button>
                  <button onClick={() => setRepPicker(null)} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">
                    Done
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ---------- Needs-card-review flag (office/admin) ---------- */}
      {reconciles && receipts.some((r) => r.needs_card_review) && (
        <div className="rounded-lg border-2 border-amber-500 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 print:hidden">
          <span className="font-semibold">
            {receipts.filter((r) => r.needs_card_review).length} receipt
            {receipts.filter((r) => r.needs_card_review).length === 1 ? '' : 's'} came from someone with no card on file
          </span>{' '}
          — set the card on each (marked ⚑ below) or assign that person a card on the Team page.
        </div>
      )}

      {/* ---------- Paid-with filter (statement reconciliation) ---------- */}
      {reconciles && methods.length > 0 && receipts.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border-2 border-slate-800 bg-white px-4 py-2.5 print:hidden">
          <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">Show receipts paid with</span>
          <select
            value={filterMethod}
            onChange={(e) => setFilterMethod(e.target.value)}
            className="input mt-0 w-auto py-1.5"
          >
            <option value="">any</option>
            {methods.map((m) => (
              <option key={m.id} value={m.id}>{m.name}{m.active ? '' : ' (retired)'}</option>
            ))}
          </select>
          {filterMethod && (
            <span className="ml-auto text-sm">
              <span className="text-slate-500">total on {methodName(filterMethod)}:</span>{' '}
              <span className="font-semibold tabular-nums">{fmtMoney(filteredTotal)}</span>
            </span>
          )}
        </div>
      )}

      {/* ---------- Overhead receipts ---------- */}
      {overheadGrouped.length > 0 && (
        <section className="print:hidden">
          <div className="mb-2 flex items-baseline">
            <h2 className="font-mono text-[11px] uppercase tracking-widest text-slate-500">
              Overhead / office / shop — by category
            </h2>
            <span className="ml-auto text-sm font-semibold tabular-nums">{fmtMoney(overheadTotal)}</span>
          </div>
          <div className="overflow-hidden rounded-lg border-2 border-slate-800 bg-white">
            {overheadGrouped.map(([cat, rows]) => {
              const catTotal = rows.reduce((s, r) => s + Number(r.amount ?? 0), 0)
              return (
                <div key={cat} className="border-t border-slate-100 first:border-t-0">
                  <div className="flex items-center px-4 pt-2 pb-1">
                    <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">{cat}</span>
                    <span className="ml-auto text-xs tabular-nums text-slate-500">{fmtMoney(catTotal)}</span>
                  </div>
                  {rows.map((r) => (
                    <div key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-4 py-1.5 text-sm">
                      <input
                        type="date"
                        defaultValue={r.receipt_date ?? ''}
                        onBlur={(e) => (e.target.value || null) !== r.receipt_date && void patch(r, { receipt_date: e.target.value || null })}
                        className="order-1 w-32 rounded border border-transparent px-1 py-0.5 font-mono text-sm text-slate-500 sm:w-36 sm:text-xs hover:border-slate-200 focus:border-slate-800 focus:outline-none"
                      />
                      <input
                        defaultValue={r.note ?? ''}
                        placeholder={r.file_path.split('/').pop()?.replace(/^\d+_/, '')}
                        onBlur={(e) => (e.target.value || null) !== r.note && void patch(r, { note: e.target.value || null })}
                        className="order-3 min-w-0 basis-full rounded border border-transparent px-1.5 py-0.5 text-sm hover:border-slate-200 focus:border-slate-800 focus:outline-none sm:order-2 sm:flex-1 sm:basis-40"
                      />
                      <span className="hidden text-xs text-slate-400 sm:inline">{r.receipt_date ? monthLabel(r.receipt_date) : ''}</span>
                      <select
                        value={r.overhead_category ?? 'other'}
                        onChange={(e) => void patch(r, { overhead_category: e.target.value })}
                        className="order-4 rounded border border-slate-200 bg-slate-50 px-1 py-0.5 font-mono text-[10px] uppercase tracking-wider text-slate-500 focus:border-slate-800 focus:outline-none sm:order-3"
                      >
                        {[...new Set([...catNames, r.overhead_category ?? 'other'])].map((x) => (
                          <option key={x} value={x}>{x}</option>
                        ))}
                      </select>
                      <span className="order-2 ml-auto flex items-center gap-0.5 sm:order-4 sm:ml-0">
                        <span className="text-xs text-slate-400">$</span>
                        <input
                          type="number" step="any" min="0"
                          defaultValue={r.amount == null ? '' : Number(r.amount)}
                          placeholder="0"
                          onBlur={(e) => {
                            const v = e.target.value === '' ? null : Number(e.target.value)
                            if (v !== (r.amount == null ? null : Number(r.amount))) void patch(r, { amount: v })
                          }}
                          className={`w-24 rounded border px-1.5 py-0.5 text-right text-sm tabular-nums focus:border-slate-800 focus:outline-none ${
                            r.amount == null ? 'border-amber-400 bg-amber-50' : 'border-slate-200'
                          }`}
                        />
                      </span>
                      {reconciles ? (
                        <select
                          value={r.payment_method_id ?? ''}
                          onChange={(e) => void patch(r, { payment_method_id: e.target.value || null, needs_card_review: false })}
                          title="Paid with"
                          className={`order-5 max-w-[9rem] rounded border px-1 py-0.5 text-[10px] focus:border-slate-800 focus:outline-none ${
                            r.needs_card_review ? 'border-amber-500 bg-amber-50 text-amber-800' : 'border-slate-200 bg-slate-50 text-slate-500'
                          }`}
                        >
                          <option value="">{r.needs_card_review ? '⚑ which card?' : 'paid with…'}</option>
                          {methods.filter((m) => m.active || m.id === r.payment_method_id).map((m) => (
                            <option key={m.id} value={m.id}>{m.name}</option>
                          ))}
                        </select>
                      ) : (
                        r.payment_method_id && (
                          <span className="order-5 text-[10px] text-slate-400">{methodName(r.payment_method_id)}</span>
                        )
                      )}
                      <button onClick={() => void view(r)} className="order-1 text-xs text-slate-500 underline decoration-dotted hover:text-slate-900 sm:order-6">
                        view
                      </button>
                      <button onClick={() => void download(r)} className="order-1 text-xs text-slate-500 underline decoration-dotted hover:text-slate-900 sm:order-6" title="Save the file to your computer">
                        save
                      </button>
                      <button onClick={() => setRemoving(r)} className="order-6 ml-auto px-1 text-lg leading-none text-slate-300 hover:text-red-600 sm:ml-0">×</button>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* ---------- Job receipts ---------- */}
      <section className="print:hidden">
        <div className="mb-2 flex flex-wrap items-center gap-3">
          <h2 className="font-mono text-[11px] uppercase tracking-widest text-slate-500">
            Job receipts — by job, then what they're for
          </h2>
          {missingAmount > 0 && (
            <span className="rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs text-amber-800">
              {missingAmount} missing an amount
            </span>
          )}
          {jobs.some((j) => j.completed_at) && (
            <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-xs text-slate-500">
              <input type="checkbox" checked={showCompleted} onChange={(e) => setShowCompleted(e.target.checked)} className="accent-slate-900" />
              show completed jobs
            </label>
          )}
        </div>

        {grouped.length === 0 ? (
          <p className="rounded-lg border-2 border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
            No job receipts filed yet.
          </p>
        ) : (
          <div className="space-y-4">
            {grouped.map(([bidId, cats]) => {
              const job = jobById.get(bidId)!
              const jobTotal = [...cats.values()].flat().reduce((s, r) => s + Number(r.amount ?? 0), 0)
              return (
                <div key={bidId} className="overflow-hidden rounded-lg border-2 border-slate-800 bg-white">
                  <div className="flex flex-wrap items-center gap-3 border-b-2 border-slate-800 bg-slate-50 px-4 py-2">
                    <span className="font-mono text-xs text-slate-500">{job.job_number}</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{job.name}</span>
                    <span className="text-sm font-semibold tabular-nums">{fmtMoney(jobTotal)}</span>
                    <Link
                      to={`/bids/${bidId}/actuals`}
                      className="rounded-md border border-slate-300 px-2 py-0.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
                    >
                      Actuals →
                    </Link>
                  </div>
                  {CATEGORIES.filter((c) => cats.has(c)).map((c) => {
                    const rows = cats.get(c)!
                    const catTotal = rows.reduce((s, r) => s + Number(r.amount ?? 0), 0)
                    return (
                      <div key={c} className="border-t border-slate-100 first:border-t-0">
                        <div className="flex items-center bg-white px-4 pt-2 pb-1">
                          <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">{CATEGORY_LABEL[c]}</span>
                          <span className="ml-auto text-xs tabular-nums text-slate-500">{fmtMoney(catTotal)}</span>
                        </div>
                        {rows.map((r) => (
                          <div key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-4 py-1.5 text-sm">
                            <input
                              type="date"
                              defaultValue={r.receipt_date ?? ''}
                              onBlur={(e) => (e.target.value || null) !== r.receipt_date && void patch(r, { receipt_date: e.target.value || null })}
                              className="order-1 w-32 rounded border border-transparent px-1 py-0.5 font-mono text-sm text-slate-500 sm:w-36 sm:text-xs hover:border-slate-200 focus:border-slate-800 focus:outline-none"
                            />
                            <input
                              defaultValue={r.note ?? ''}
                              placeholder={r.file_path.split('/').pop()?.replace(/^\d+_/, '')}
                              onBlur={(e) => (e.target.value || null) !== r.note && void patch(r, { note: e.target.value || null })}
                              className="order-3 min-w-0 basis-full rounded border border-transparent px-1.5 py-0.5 text-sm hover:border-slate-200 focus:border-slate-800 focus:outline-none sm:order-2 sm:flex-1 sm:basis-40"
                            />
                            <select
                              value={r.category}
                              onChange={(e) => void patch(r, { category: e.target.value as Receipt['category'] })}
                              className="order-4 rounded border border-slate-200 bg-slate-50 px-1 py-0.5 font-mono text-[10px] uppercase tracking-wider text-slate-500 focus:border-slate-800 focus:outline-none sm:order-3"
                            >
                              {CATEGORIES.map((x) => (
                                <option key={x} value={x}>{x}</option>
                              ))}
                            </select>
                            <span className="order-2 ml-auto flex items-center gap-0.5 sm:order-4 sm:ml-0">
                              <span className="text-xs text-slate-400">$</span>
                              <input
                                type="number" step="any" min="0"
                                defaultValue={r.amount == null ? '' : Number(r.amount)}
                                placeholder="0"
                                onBlur={(e) => {
                                  const v = e.target.value === '' ? null : Number(e.target.value)
                                  if (v !== (r.amount == null ? null : Number(r.amount))) void patch(r, { amount: v })
                                }}
                                className={`w-24 rounded border px-1.5 py-0.5 text-right text-sm tabular-nums focus:border-slate-800 focus:outline-none ${
                                  r.amount == null ? 'border-amber-400 bg-amber-50' : 'border-slate-200'
                                }`}
                              />
                            </span>
                            {reconciles ? (
                              <select
                                value={r.payment_method_id ?? ''}
                                onChange={(e) => void patch(r, { payment_method_id: e.target.value || null, needs_card_review: false })}
                                title="Paid with"
                                className={`order-5 max-w-[9rem] rounded border px-1 py-0.5 text-[10px] focus:border-slate-800 focus:outline-none ${
                                  r.needs_card_review ? 'border-amber-500 bg-amber-50 text-amber-800' : 'border-slate-200 bg-slate-50 text-slate-500'
                                }`}
                              >
                                <option value="">{r.needs_card_review ? '⚑ which card?' : 'paid with…'}</option>
                                {methods.filter((m) => m.active || m.id === r.payment_method_id).map((m) => (
                                  <option key={m.id} value={m.id}>{m.name}</option>
                                ))}
                              </select>
                            ) : (
                              r.payment_method_id && (
                                <span className="order-5 text-[10px] text-slate-400">{methodName(r.payment_method_id)}</span>
                              )
                            )}
                            <button onClick={() => void view(r)} className="order-1 text-xs text-slate-500 underline decoration-dotted hover:text-slate-900 sm:order-6">
                              view
                            </button>
                            <button onClick={() => void download(r)} className="order-1 text-xs text-slate-500 underline decoration-dotted hover:text-slate-900 sm:order-6" title="Save the file to your computer">
                              save
                            </button>
                            <button onClick={() => setRemoving(r)} className="order-6 ml-auto px-1 text-lg leading-none text-slate-300 hover:text-red-600 sm:ml-0">×</button>
                          </div>
                        ))}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        )}
      </section>

      {managingCats && (
        <ListManager
          title="Overhead categories"
          table="overhead_categories"
          items={ohCats.map((c) => ({ id: c.id, name: c.name, sort_order: c.sort_order, inUse: receipts.some((r) => r.is_overhead && r.overhead_category === c.name) }))}
          placeholder="new category…"
          help="Click a name to rename it — filed receipts follow the new name. Categories with receipts can't be deleted."
          onClose={() => setManagingCats(false)}
          onChanged={() => void load()}
          onRenamed={(from, to) => {
            // keep filed receipts pointing at the renamed bucket
            void supabase!.from('receipts').update({ overhead_category: to }).eq('overhead_category', from).then(() => void load())
          }}
        />
      )}
      {removing && (
        <ConfirmDialog
          title="Delete receipt"
          message={`Delete this receipt${removing.amount != null ? ` (${fmtMoney(Number(removing.amount))})` : ''}? The file goes too.`}
          onConfirm={() => void remove(removing)}
          onCancel={() => setRemoving(null)}
        />
      )}
    </div>
  )
}


/** Add / rename / delete (or retire) rows of a simple named list — overhead
 *  categories and payment methods share this. Rows still in use can't be deleted. */
function ListManager({
  title, table, items, placeholder, help, canRetire, onClose, onChanged, onRenamed,
}: {
  title: string
  table: 'overhead_categories' | 'payment_methods'
  items: { id: string; name: string; sort_order: number; inUse: boolean; retired?: boolean }[]
  placeholder: string
  help: string
  canRetire?: boolean
  onClose: () => void
  onChanged: () => void
  onRenamed?: (from: string, to: string) => void
}) {
  const [newName, setNewName] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const dupMsg = (m: string) => (m.includes('duplicate') ? 'That name already exists.' : m)

  async function add() {
    const name = newName.trim()
    if (!name) return
    const { error } = await supabase!
      .from(table)
      .insert({ name, sort_order: (items[items.length - 1]?.sort_order ?? 0) + 10 })
    if (error) setErr(dupMsg(error.message))
    else {
      setNewName('')
      setErr(null)
      onChanged()
    }
  }

  async function rename(item: { id: string; name: string }, raw: string) {
    const name = raw.trim()
    if (!name || name === item.name) return
    const { error } = await supabase!.from(table).update({ name }).eq('id', item.id)
    if (error) setErr(dupMsg(error.message))
    else {
      setErr(null)
      if (onRenamed) onRenamed(item.name, name)
      else onChanged()
    }
  }

  async function remove(item: { id: string }) {
    const { error } = await supabase!.from(table).delete().eq('id', item.id)
    if (error) setErr(error.message)
    else onChanged()
  }

  async function setRetired(item: { id: string }, retired: boolean) {
    const { error } = await supabase!.from(table).update({ active: !retired }).eq('id', item.id)
    if (error) setErr(error.message)
    else onChanged()
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-6">
      <div className="w-full max-w-md rounded-t-xl border-2 border-slate-800 bg-white sm:rounded-xl">
        <div className="flex items-center justify-between border-b-2 border-slate-800 px-5 py-3">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} className="text-xl leading-none text-slate-400 hover:text-slate-700">×</button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-3">
          {items.map((item) => (
            <div key={item.id} className={`flex items-center gap-2 px-2 py-1.5 ${item.retired ? 'opacity-50' : ''}`}>
              <input
                defaultValue={item.name}
                onBlur={(e) => void rename(item, e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                className="min-w-0 flex-1 rounded border border-transparent px-2 py-1.5 text-sm hover:border-slate-200 focus:border-slate-800 focus:outline-none"
              />
              {canRetire && (
                <button
                  onClick={() => void setRetired(item, !item.retired)}
                  className="text-xs text-slate-400 hover:text-slate-900"
                  title={item.retired ? 'Bring this back into the picker' : 'Hide from the picker; old receipts keep it'}
                >
                  {item.retired ? 'unretire' : 'retire'}
                </button>
              )}
              <button
                onClick={() => void remove(item)}
                disabled={item.inUse}
                title={item.inUse ? 'Receipts use this — can’t delete' : 'Delete'}
                className="px-2 text-lg leading-none text-slate-300 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:text-slate-300"
              >
                ×
              </button>
            </div>
          ))}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void add()
            }}
            className="mt-2 flex items-center gap-2 border-t border-slate-200 px-2 pt-3"
          >
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={placeholder}
              className="input mt-0 min-w-0 flex-1 py-1.5"
            />
            <button type="submit" disabled={!newName.trim()} className="rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-40">
              + Add
            </button>
          </form>
          {err && <p className="mt-2 px-2 text-sm text-red-600">{err}</p>}
          <p className="mt-2 px-2 text-xs text-slate-500">{help}</p>
        </div>
        <div className="flex justify-end border-t border-slate-200 px-5 py-3">
          <button onClick={onClose} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
