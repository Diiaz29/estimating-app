import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { errorMessage } from '../lib/loadResults'
import { loadInventory, saveStock, type StockInput, type StockItem } from '../lib/shopInventory'
import { STOCK_UNITS, quantityNeeded, needsWeeklyCheck } from '../lib/inventoryMath'
import Modal from './Modal'
import type { RequestInput } from '../lib/materialRequests'

export default function ShopInventory({ onRequest }: { onRequest: (input: RequestInput) => void }) {
  const { session, canSchedule } = useAuth()
  const userId = session!.user.id
  const [rows, setRows] = useState<StockItem[]>([])
  const [people, setPeople] = useState<Record<string, string>>({})
  const [preview, setPreview] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [editing, setEditing] = useState<StockItem | 'new' | null>(null)
  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [inventory, profiles] = await Promise.all([loadInventory(userId), supabase!.from('profiles').select('id,first_name,last_name,email')])
      if (profiles.error) throw new Error(profiles.error.message)
      setRows(inventory.rows); setPreview(inventory.preview)
      setPeople(Object.fromEntries(profiles.data.map(p => [p.id, [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email])))
    } catch (e) { setError(errorMessage(e)) }
    finally { setLoading(false) }
  }, [userId])
  useEffect(() => { void load() }, [load])
  const low = (row: StockItem) => quantityNeeded(row.on_hand, row.minimum) > 0
  const filtered = rows.filter(row => (filter === 'all' || (filter === 'low' ? low(row) : needsWeeklyCheck(row.checked_at))) && `${row.title} ${row.notes}`.toLowerCase().includes(search.trim().toLowerCase())).sort((a,b) => a.title.localeCompare(b.title))
  return <>
    <div className="material-orders-heading"><p>Count shop supplies each week. Set a minimum to see what needs ordering.</p><div><button className="index-secondary" disabled={loading} onClick={() => void load()}>Refresh</button>{canSchedule && <button className="index-primary" disabled={loading || !!error} onClick={() => setEditing('new')}>+ Add stock item</button>}</div></div>
    {preview && <p className="material-orders-preview" role="status">Local preview — inventory is saved only in this browser until the shared inventory is published.</p>}
    {error && <p className="material-orders-error" role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    <section className="material-orders-register construction-register" aria-label="Shop inventory">
      <div className="project-index-tools">
        <div className="index-tabs material-orders-tabs" aria-label="Inventory filters">
          <button aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All stock <span>{rows.length}</span></button>
          <button aria-pressed={filter === 'low'} onClick={() => setFilter('low')}>Need to order <span>{rows.filter(low).length}</span></button>
          <button aria-pressed={filter === 'check'} onClick={() => setFilter('check')}>Due for count <span>{rows.filter(row => needsWeeklyCheck(row.checked_at)).length}</span></button>
        </div>
        <div className="construction-register-filters"><label className="construction-register-filter"><span>Search inventory</span><input type="search" className="input" value={search} onChange={e => setSearch(e.target.value)} placeholder="Find a stocked material" /></label>{search && <button className="index-secondary construction-clear-filters" onClick={() => setSearch('')}>Clear search</button>}</div>
      </div>
      <div className="construction-register-caption"><span>{filtered.length} stock items</span><span>Due for count after 7 days</span></div>
      {loading ? <p className="material-orders-empty" role="status">Loading inventory…</p> : error ? <p className="material-orders-empty">Refresh to try again.</p> : !filtered.length ? <p className="material-orders-empty">{rows.length ? 'No stock items match this view.' : canSchedule ? 'Add the materials you keep in the shop, their current counts, and the minimum you want on hand.' : 'No stocked materials have been added yet.'}</p> :
        <div className="construction-table-scroll"><table className="responsive-record-table construction-register-table material-orders-table shop-inventory-table">
          <thead><tr><th scope="col">Material / item</th><th scope="col">On hand</th><th scope="col">Minimum</th><th scope="col">Need to order</th><th scope="col">Last counted</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>{filtered.map(row => <tr key={row.id}>
            <td data-label="Material"><strong>{row.title}</strong>{row.notes && <details className="material-order-details"><summary>Details</summary><p>{row.notes}</p></details>}</td>
            <td data-label="On hand">{row.on_hand} {row.unit}</td><td data-label="Minimum">{row.minimum} {row.unit}</td>
            <td data-label="Need to order">{low(row) ? <strong>{quantityNeeded(row.on_hand, row.minimum)} {row.unit} needed</strong> : 'Stocked'}</td>
            <td data-label="Last counted">{new Date(row.checked_at).toLocaleDateString()}{needsWeeklyCheck(row.checked_at) && <small>Count due</small>}<small>{row.checked_by ? people[row.checked_by] ?? 'Team member' : 'Former team member'}</small></td>
            <td data-label="Actions"><div className="stock-row-actions">{low(row) && <button className="index-secondary" aria-label={`Request materials for ${row.title}`} onClick={() => onRequest({ title: row.title, quantity: quantityNeeded(row.on_hand, row.minimum), unit: row.unit, notes: row.notes, bid_id: null })}>Request materials</button>}{canSchedule && <button className="index-secondary" onClick={() => setEditing(row)} aria-label={`Update stock for ${row.title}`}>Update stock</button>}</div></td>
          </tr>)}</tbody>
        </table></div>}
      <div className="index-list-foot">Need to order is the shortage below your minimum. Pending orders do not change the physical count.</div>
    </section>
    {editing && <StockForm key={editing === 'new' ? 'new' : editing.id} existing={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} onSave={async input => {
      const existing = editing === 'new' ? undefined : editing
      const row = await saveStock(userId, input, preview, existing)
      setRows(previous => existing ? previous.map(item => item.id === row.id ? row : item) : [...previous, row])
      setNotice(existing ? 'Stock count saved.' : 'Stock item added.'); setEditing(null)
    }} />}
  </>
}

function StockForm({ existing, onClose, onSave }: { existing?: StockItem; onClose: () => void; onSave: (input: StockInput) => Promise<void> }) {
  const [title, setTitle] = useState(existing?.title ?? '')
  const [unit, setUnit] = useState<StockInput['unit']>(existing?.unit ?? 'each')
  const [onHand, setOnHand] = useState(String(existing?.on_hand ?? 0))
  const [minimum, setMinimum] = useState(String(existing?.minimum ?? 0))
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!title.trim() || ![onHand, minimum].every(value => value.trim() && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 1000000)) { setError('Enter an item name and quantities between 0 and 1,000,000.'); return }
    setSaving(true); setError('')
    try { await onSave({ title: title.trim(), unit, on_hand: Number(onHand), minimum: Number(minimum), notes: notes.trim() }) }
    catch (e) { setError(errorMessage(e)); setSaving(false) }
  }
  return <Modal title={existing ? 'Update shop stock' : 'Add stock item'} onClose={() => { if (!saving) onClose() }} className="material-order-modal">
    <form className="material-order-form" onSubmit={event => void submit(event)}><fieldset disabled={saving}>
      <label>Material or item<input className="input" data-modal-autofocus required maxLength={200} value={title} onChange={e => setTitle(e.target.value)} /></label>
      <label>Unit<select className="input" value={unit} onChange={e => setUnit(e.target.value as StockInput['unit'])}>{STOCK_UNITS.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
      <div className="material-order-form-pair"><label>On hand now<input className="input" type="number" min="0" max="1000000" step="0.001" required value={onHand} onChange={e => setOnHand(e.target.value)} /></label><label>Minimum on hand<input className="input" type="number" min="0" max="1000000" step="0.001" required value={minimum} onChange={e => setMinimum(e.target.value)} /></label></div>
      <label>Details (optional)<textarea className="input" rows={3} maxLength={4000} placeholder="Size, storage location, supplier, or product link" value={notes} onChange={e => setNotes(e.target.value)} /></label>
      <p className="stock-count-hint">Saving confirms the on-hand count as of today. Update it when supplies are used or received.</p>
    </fieldset>{error && <p role="alert" className="material-orders-error">{error}</p>}<div className="app-modal-actions"><button type="button" className="index-secondary" disabled={saving} onClick={onClose}>Cancel</button><button type="submit" className="index-primary" disabled={saving}>{saving ? 'Saving…' : existing ? 'Save count' : 'Add stock item'}</button></div></form>
  </Modal>
}
