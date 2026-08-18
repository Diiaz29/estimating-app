import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { Bid } from '../lib/types'
import { fmtMoney } from '../lib/format'
import ConfirmDialog from '../components/ConfirmDialog'

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
const monthLabel = (iso: string) =>
  new Date(`${iso.slice(0, 7)}-15T12:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
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

  // upload form
  const [jobId, setJobId] = useState('')
  const [isOverhead, setIsOverhead] = useState(false)
  const [overheadCat, setOverheadCat] = useState('')
  const [methodId, setMethodId] = useState('')
  const [category, setCategory] = useState<Receipt['category']>('materials')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)

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

  async function uploadFiles(files: File[]) {
    if (!isOverhead && !jobId) return
    const ok = files.filter((f) => /^image\//.test(f.type) || f.type === 'application/pdf')
    if (ok.length === 0) return
    setUploading(true)
    let first = true
    for (const file of ok) {
      const folder = isOverhead ? 'overhead' : jobId
      const path = `${folder}/${Date.now()}_${file.name.replace(/[^\w.\-]/g, '_')}`
      const { error: upErr } = await supabase!.storage.from('receipts').upload(path, file)
      if (upErr) {
        setError(upErr.message)
        continue
      }
      const { error } = await supabase!.from('receipts').insert({
        bid_id: isOverhead ? null : jobId,
        is_overhead: isOverhead,
        overhead_category: isOverhead ? overheadCat : null,
        payment_method_id: methodId || null,
        // no card on file for this person → office needs to sort out which card
        needs_card_review: !methodId && noCard,
        file_path: path,
        amount: first && amount !== '' ? Number(amount) : null,
        category: isOverhead ? 'other' : category,
        note: first && note.trim() ? note.trim() : null,
        receipt_date: date || null,
        uploaded_by: session?.user.email ?? null,
      })
      if (error) setError(error.message)
      first = false
    }
    setAmount('')
    setNote('')
    setUploading(false)
    void load()
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

  if (error)
    return <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>

  const missingAmount = receipts.filter((r) => r.amount == null && (r.is_overhead || (r.bid_id && jobById.get(r.bid_id)))).length

  return (
    <div className="max-w-4xl space-y-5">
      <div>
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
          void uploadFiles([...e.dataTransfer.files])
        }}
        className={`rounded-lg border-2 bg-white p-4 transition-colors ${
          dragging ? 'border-dashed border-emerald-600 bg-emerald-50' : 'border-slate-800'
        }`}
      >
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
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input mt-0.5" />
            </label>
            <label className="block">
              <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">Amount ($)</span>
              <input type="number" step="any" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} className="input mt-0.5" />
            </label>
            <label className="block">
              <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">What is it</span>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="McKillican sheet order" className="input mt-0.5" />
            </label>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <p className={`flex-1 rounded-md border border-dashed px-3 py-2 text-center text-xs ${dragging ? 'border-emerald-500 font-semibold text-emerald-700' : 'border-slate-300 text-slate-400'}`}>
              {dragging ? 'Drop to upload' : 'Drag the photo or PDF here'}
            </p>
            <label className={`cursor-pointer rounded-md px-4 py-2 text-sm font-semibold text-white ${uploading ? 'bg-slate-400' : 'bg-slate-900 hover:bg-slate-700'}`}>
              {uploading ? 'Uploading…' : '+ Upload receipt'}
              <input
                type="file"
                accept="image/*,application/pdf"
                multiple
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  if (e.target.files?.length) void uploadFiles([...e.target.files])
                  e.target.value = ''
                }}
              />
            </label>
          </div>
        </div>

      {/* ---------- Needs-card-review flag (office/admin) ---------- */}
      {reconciles && receipts.some((r) => r.needs_card_review) && (
        <div className="rounded-lg border-2 border-amber-500 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          <span className="font-semibold">
            {receipts.filter((r) => r.needs_card_review).length} receipt
            {receipts.filter((r) => r.needs_card_review).length === 1 ? '' : 's'} came from someone with no card on file
          </span>{' '}
          — set the card on each (marked ⚑ below) or assign that person a card on the Team page.
        </div>
      )}

      {/* ---------- Paid-with filter (statement reconciliation) ---------- */}
      {reconciles && methods.length > 0 && receipts.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border-2 border-slate-800 bg-white px-4 py-2.5">
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
        <section>
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
                        className="w-36 rounded border border-transparent px-1 py-0.5 font-mono text-xs text-slate-500 hover:border-slate-200 focus:border-slate-800 focus:outline-none"
                      />
                      <input
                        defaultValue={r.note ?? ''}
                        placeholder={r.file_path.split('/').pop()?.replace(/^\d+_/, '')}
                        onBlur={(e) => (e.target.value || null) !== r.note && void patch(r, { note: e.target.value || null })}
                        className="min-w-0 flex-1 basis-40 rounded border border-transparent px-1.5 py-0.5 text-sm hover:border-slate-200 focus:border-slate-800 focus:outline-none"
                      />
                      <span className="hidden text-xs text-slate-400 sm:inline">{r.receipt_date ? monthLabel(r.receipt_date) : ''}</span>
                      <select
                        value={r.overhead_category ?? 'other'}
                        onChange={(e) => void patch(r, { overhead_category: e.target.value })}
                        className="rounded border border-slate-200 bg-slate-50 px-1 py-0.5 font-mono text-[10px] uppercase tracking-wider text-slate-500 focus:border-slate-800 focus:outline-none"
                      >
                        {[...new Set([...catNames, r.overhead_category ?? 'other'])].map((x) => (
                          <option key={x} value={x}>{x}</option>
                        ))}
                      </select>
                      <span className="flex items-center gap-0.5">
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
                          className={`max-w-[9rem] rounded border px-1 py-0.5 text-[10px] focus:border-slate-800 focus:outline-none ${
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
                          <span className="text-[10px] text-slate-400">{methodName(r.payment_method_id)}</span>
                        )
                      )}
                      <button onClick={() => void view(r)} className="text-xs text-slate-500 underline decoration-dotted hover:text-slate-900">
                        view
                      </button>
                      <button onClick={() => setRemoving(r)} className="px-1 text-lg leading-none text-slate-300 hover:text-red-600">×</button>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* ---------- Job receipts ---------- */}
      <section>
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
                              className="w-36 rounded border border-transparent px-1 py-0.5 font-mono text-xs text-slate-500 hover:border-slate-200 focus:border-slate-800 focus:outline-none"
                            />
                            <input
                              defaultValue={r.note ?? ''}
                              placeholder={r.file_path.split('/').pop()?.replace(/^\d+_/, '')}
                              onBlur={(e) => (e.target.value || null) !== r.note && void patch(r, { note: e.target.value || null })}
                              className="min-w-0 flex-1 basis-40 rounded border border-transparent px-1.5 py-0.5 text-sm hover:border-slate-200 focus:border-slate-800 focus:outline-none"
                            />
                            <select
                              value={r.category}
                              onChange={(e) => void patch(r, { category: e.target.value as Receipt['category'] })}
                              className="rounded border border-slate-200 bg-slate-50 px-1 py-0.5 font-mono text-[10px] uppercase tracking-wider text-slate-500 focus:border-slate-800 focus:outline-none"
                            >
                              {CATEGORIES.map((x) => (
                                <option key={x} value={x}>{x}</option>
                              ))}
                            </select>
                            <span className="flex items-center gap-0.5">
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
                                className={`max-w-[9rem] rounded border px-1 py-0.5 text-[10px] focus:border-slate-800 focus:outline-none ${
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
                                <span className="text-[10px] text-slate-400">{methodName(r.payment_method_id)}</span>
                              )
                            )}
                            <button onClick={() => void view(r)} className="text-xs text-slate-500 underline decoration-dotted hover:text-slate-900">
                              view
                            </button>
                            <button onClick={() => setRemoving(r)} className="px-1 text-lg leading-none text-slate-300 hover:text-red-600">×</button>
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
