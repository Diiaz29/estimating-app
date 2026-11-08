import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { errorMessage } from '../lib/loadResults'
import { loadMaterialRequests, saveMaterialRequest, ORDER_STATUSES, type MaterialRequest, type OrderStatus, type RequestInput } from '../lib/materialRequests'
import Modal from '../components/Modal'
import '../material-orders.css'

type Job = { id: string; name: string; job_number: string; status: string; completed_at: string | null }
type Person = { id: string; first_name: string | null; last_name: string | null; email: string }
const jobLabel = (job: Job) => `${job.job_number} · ${job.name}`
const shortDate = (value: string) => new Date(value.length === 10 ? `${value}T12:00:00` : value).toLocaleDateString()

export default function MaterialOrders() {
  const { session, canSchedule } = useAuth()
  const userId = session!.user.id
  const [rows, setRows] = useState<MaterialRequest[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [preview, setPreview] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const [jobFilter, setJobFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('requested')
  const [editing, setEditing] = useState<MaterialRequest | 'new' | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [orders, jobResult, peopleResult] = await Promise.all([
        loadMaterialRequests(userId),
        supabase!.from('bids').select('id,name,job_number,status,completed_at').order('job_number', { ascending: false }),
        supabase!.from('profiles').select('id,first_name,last_name,email'),
      ])
      if (jobResult.error) throw new Error(jobResult.error.message)
      if (peopleResult.error) throw new Error(peopleResult.error.message)
      setRows(orders.rows); setPreview(orders.preview); setJobs(jobResult.data); setPeople(peopleResult.data)
    } catch (e) { setError(errorMessage(e)) }
    finally { setLoading(false) }
  }, [userId])
  useEffect(() => { void load() }, [load])
  const jobMap = useMemo(() => new Map(jobs.map(job => [job.id, job])), [jobs])
  const destination = (row: MaterialRequest) => row.bid_id ? jobMap.has(row.bid_id) ? jobLabel(jobMap.get(row.bid_id)!) : 'Job unavailable' : 'Shop'
  const personName = (id: string | null) => {
    const p = people.find(person => person.id === id)
    return p ? [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email : 'Former team member'
  }
  const visibleRows = canSchedule ? rows : rows.filter(row => row.requested_by === userId)
  const filtered = visibleRows.filter(row => (statusFilter === 'all' || row.status === statusFilter)
    && (jobFilter === 'all' || (row.bid_id ?? 'shop') === jobFilter)
    && `${row.title} ${row.notes} ${destination(row)} ${personName(row.requested_by)}`.toLowerCase().includes(search.trim().toLowerCase()))
  const filterJobs = jobs.filter(job => visibleRows.some(row => row.bid_id === job.id))
  return <div className="material-orders project-index">
    <div className="material-orders-heading">
      <p>{canSchedule ? 'Requests for the shop and your jobs, from order to delivery.' : 'Request materials for a job or the shop and track your requests here.'}</p>
      <div><button className="index-secondary" disabled={loading} onClick={() => void load()}>Refresh</button><button className="index-primary" disabled={loading || !!error} onClick={() => setEditing('new')}>+ Request materials</button></div>
    </div>
    {preview && <p className="material-orders-preview" role="status">Local preview — requests are saved only in this browser. Shared ordering will be enabled when this feature is published.</p>}
    {error && <p role="alert" className="material-orders-error">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    <section className="material-orders-register construction-register" aria-label="Material requests">
      <div className="project-index-tools">
      <div className="index-tabs material-orders-tabs" aria-label="Order status">
        {(Object.entries(ORDER_STATUSES) as [OrderStatus, string][]).map(([status, label]) => <button key={status} aria-pressed={statusFilter === status} onClick={() => setStatusFilter(status)}>{label} <span>{visibleRows.filter(row => row.status === status).length}</span></button>)}
        <button aria-pressed={statusFilter === 'all'} onClick={() => setStatusFilter('all')}>All</button>
      </div>
      <div className="construction-register-filters">
        <label className="construction-register-filter"><span>Search</span><span className="index-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></svg><input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Item, job, or requester" /></span></label>
        <label className="construction-register-filter"><span>Job or shop</span><select value={jobFilter} onChange={e => setJobFilter(e.target.value)}><option value="all">All locations</option><option value="shop">Shop</option>{filterJobs.map(job => <option key={job.id} value={job.id}>{jobLabel(job)}</option>)}</select></label>
        {(search || jobFilter !== 'all') && <button className="index-secondary construction-clear-filters" onClick={() => { setSearch(''); setJobFilter('all') }}>Clear filters</button>}
      </div>
      </div>
      <div className="construction-register-caption"><span>{filtered.length} {filtered.length === 1 ? 'request' : 'requests'}</span></div>
      {loading ? <p className="material-orders-empty" role="status">Loading material requests…</p> : error ? <p className="material-orders-empty">Refresh to try loading the list again.</p> : !filtered.length ? <p className="material-orders-empty">{visibleRows.length ? 'No requests match these filters.' : 'No material requests yet. Add the first item your team needs.'}</p> :
        <div className="construction-table-scroll"><table className="responsive-record-table construction-register-table material-orders-table">
          <thead><tr><th scope="col">Material / item</th><th scope="col">Quantity</th><th scope="col">Job / shop</th><th scope="col">Requested by</th><th scope="col">Status</th><th scope="col">Expected arrival</th>{canSchedule && <th scope="col"><span className="sr-only">Update order</span></th>}</tr></thead>
          <tbody>{filtered.map(row => <tr key={row.id}>
            <td data-label="Material"><strong>{row.title}</strong>{row.notes && <details className="material-order-details"><summary>Details</summary><p>{row.notes}</p></details>}</td>
            <td data-label="Quantity">{row.quantity} {row.unit}</td>
            <td data-label="Job">{row.bid_id ? <Link to={`/bids/${row.bid_id}`}>{destination(row)}</Link> : 'Shop'}</td>
            <td data-label="Requested by">{personName(row.requested_by)}<small>{shortDate(row.created_at)}</small></td>
            <td data-label="Status">{ORDER_STATUSES[row.status]}{row.status === 'delivered' && row.delivered_at ? <small>{shortDate(row.delivered_at)}</small> : row.ordered_at && <small>Ordered {shortDate(row.ordered_at)}</small>}</td>
            <td data-label="Expected arrival">{row.expected_on ? shortDate(row.expected_on) : '—'}</td>
            {canSchedule && <td data-label="Actions"><button className="index-secondary" onClick={() => setEditing(row)} aria-label={`Update ${row.title}`}>Update</button></td>}
          </tr>)}</tbody>
        </table></div>}
      <div className="index-list-foot">{filtered.length} {filtered.length === 1 ? 'request' : 'requests'}</div>
    </section>
    {editing && <RequestForm key={editing === 'new' ? 'new' : editing.id} existing={editing === 'new' ? undefined : editing} jobs={jobs} onClose={() => setEditing(null)} onSave={async input => {
      const existing = editing === 'new' ? undefined : editing
      const result = await saveMaterialRequest(userId, input, preview, existing)
      setRows(previous => existing ? previous.map(row => row.id === result.id ? result : row) : [result, ...previous])
      setStatusFilter(result.status); setSearch(''); setJobFilter('all'); setNotice(existing ? 'Order updated.' : 'Material request added.'); setEditing(null)
    }} />}
  </div>
}

function RequestForm({ existing, jobs, onClose, onSave }: { existing?: MaterialRequest; jobs: Job[]; onClose: () => void; onSave: (input: RequestInput | (RequestInput & { status: OrderStatus; expected_on: string | null })) => Promise<void> }) {
  const [title, setTitle] = useState(existing?.title ?? '')
  const [quantity, setQuantity] = useState(String(existing?.quantity ?? 1))
  const [unit, setUnit] = useState(existing?.unit ?? 'each')
  const [bidId, setBidId] = useState(existing ? existing.bid_id ?? 'shop' : '')
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [status, setStatus] = useState<OrderStatus>(existing?.status ?? 'requested')
  const [expected, setExpected] = useState(existing?.expected_on ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!title.trim() || !unit.trim() || !bidId || !Number.isFinite(Number(quantity)) || Number(quantity) <= 0 || Number(quantity) > 1000000) { setError('Enter an item, a valid quantity, a unit, and a job or Shop.'); return }
    setSaving(true); setError('')
    try {
      const input: RequestInput = { title: title.trim(), quantity: Number(quantity), unit: unit.trim(), bid_id: bidId === 'shop' ? null : bidId, notes: notes.trim() }
      const expectedOn = String(new FormData(e.currentTarget).get('expected_on') ?? '') || null
      await onSave(existing ? { ...input, status, expected_on: status === 'requested' ? null : expectedOn } : input)
    } catch (e) { setError(errorMessage(e)); setSaving(false) }
  }
  return <Modal title={existing ? 'Update material order' : 'Request materials'} onClose={() => { if (!saving) onClose() }} className="material-order-modal">
    <form onSubmit={e => void submit(e)} className="material-order-form">
      <fieldset disabled={saving}>
        <label>Item or material<input data-modal-autofocus className="input" required maxLength={200} value={title} onChange={e => setTitle(e.target.value)} /></label>
        <div className="material-order-form-pair"><label>Quantity<input className="input" type="number" required min="0.001" max="1000000" step="any" value={quantity} onChange={e => setQuantity(e.target.value)} /></label><label>Unit<input className="input" required maxLength={40} placeholder="each, sheets, boxes…" value={unit} onChange={e => setUnit(e.target.value)} /></label></div>
        <label>For job or shop<select className="input" required value={bidId} onChange={e => setBidId(e.target.value)}><option value="" disabled>Choose a job or Shop</option><option value="shop">Shop</option>{jobs.filter(job => (job.status === 'won' && !job.completed_at) || job.id === existing?.bid_id).map(job => <option key={job.id} value={job.id}>{jobLabel(job)}</option>)}</select></label>
        <label>Details (optional)<textarea className="input" rows={3} maxLength={4000} placeholder="Size, supplier, product link, or other details" value={notes} onChange={e => setNotes(e.target.value)} /></label>
        {existing && <div className="material-order-form-pair"><label>Status<select className="input" value={status} onChange={e => setStatus(e.target.value as OrderStatus)}>{Object.entries(ORDER_STATUSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Expected arrival<input className="input" type="date" name="expected_on" disabled={status === 'requested'} value={status === 'requested' ? '' : expected} onInput={e => setExpected(e.currentTarget.value)} onChange={e => setExpected(e.target.value)} /></label></div>}
      </fieldset>
      {error && <p role="alert" className="material-orders-error">{error}</p>}
      <div className="app-modal-actions"><button type="button" className="index-secondary" disabled={saving} onClick={onClose}>Cancel</button><button type="submit" className="index-primary" disabled={saving}>{saving ? 'Saving…' : existing ? 'Save order' : 'Add request'}</button></div>
    </form>
  </Modal>
}
