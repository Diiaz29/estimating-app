import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { canUseChangeList } from '../lib/changeListAccess'
import { useUnsavedWarning } from '../lib/useSaveQueue'
import ConfirmDialog from '../components/ConfirmDialog'
import '../changes.css'

const sections = {
  app: { label: 'App changes', description: 'Ideas, fixes, and improvements for SpotOnBid.', placeholder: 'For example: make job search easier' },
  on_business: { label: 'On the business', description: 'Planning, systems, and improvements to grow the business.', placeholder: 'For example: improve our quoting process' },
  in_business: { label: 'In the business', description: 'Day-to-day work, follow-ups, and things to get done.', placeholder: 'For example: follow up with a supplier' },
  shopping: { label: 'Shopping list', description: 'Tools, supplies, and equipment to get for the shop.', placeholder: 'For example: sanding discs or a new shop vacuum' },
}
type Section = keyof typeof sections
interface ChangeItem { id: string; title: string; notes: string; completed: boolean; created_at: string; section: Section; quantity?: number | null }
const previewKey = 'spoton-changes-preview-v1'

export default function Changes() {
  const { session } = useAuth()
  const allowed = canUseChangeList(session?.user.id)
  const [items, setItems] = useState<ChangeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [preview, setPreview] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [quantity, setQuantity] = useState('1')
  const draft = !!title || !!notes || quantity !== '1'
  const [editing, setEditing] = useState<string | null>(null)
  const [completed, setCompleted] = useState(false)
  const [section, setSection] = useState<Section>('app')
  const [deleting, setDeleting] = useState<ChangeItem | null>(null)
  useUnsavedWarning(busy || draft)

  async function load() {
    if (!allowed) return
    setLoading(true)
    setError('')
    try {
      const result = await supabase!.from('app_change_requests').select('*').order('created_at', { ascending: false })
      if (import.meta.env.DEV && result.error?.code === 'PGRST205') {
        const saved: unknown = JSON.parse(localStorage.getItem(previewKey) || '[]')
        setItems(Array.isArray(saved) ? saved.filter((x): x is ChangeItem => x && typeof x.id === 'string' && typeof x.title === 'string' && typeof x.notes === 'string' && typeof x.completed === 'boolean' && typeof x.created_at === 'string').map(x => ({ ...x, section: Object.hasOwn(sections, x.section) ? x.section : 'app' })) : [])
        setPreview(true)
      } else {
        if (result.error) throw result.error
        setItems(result.data as ChangeItem[])
        setPreview(false)
      }
    } catch { setError('Could not load your list. Please try again.') }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [allowed]) // eslint-disable-line react-hooks/exhaustive-deps

  async function save(item: ChangeItem, isNew: boolean) {
    if (busy || !allowed) return false
    setBusy(true)
    setError('')
    try {
      let saved = item
      if (!preview) {
        const fields = { title: item.title, notes: item.notes, completed: item.completed, section: item.section, ...(item.section === 'shopping' ? { quantity: item.quantity ?? null } : {}) }
        const result = isNew
          ? await supabase!.from('app_change_requests').insert(fields).select().single()
          : await supabase!.from('app_change_requests').update(fields).eq('id', item.id).select().single()
        if (result.error) throw result.error
        saved = result.data as ChangeItem
      }
      const next = isNew ? [saved, ...items] : items.map(x => x.id === saved.id ? saved : x)
      if (preview) localStorage.setItem(previewKey, JSON.stringify(next))
      setItems(next)
      return true
    } catch { setError('This change was not saved. Your text is still here; please try again.'); return false }
    finally { setBusy(false) }
  }

  async function remove(item: ChangeItem) {
    if (busy || !allowed) return
    setDeleting(null)
    setBusy(true)
    setError('')
    try {
      if (!preview) {
        const result = await supabase!.from('app_change_requests').delete().eq('id', item.id).select('id').single()
        if (result.error) throw result.error
      }
      const next = items.filter(x => x.id !== item.id)
      if (preview) localStorage.setItem(previewKey, JSON.stringify(next))
      setItems(next)
    } catch { setError('The note was not deleted. Please try again.') }
    finally { setBusy(false) }
  }

  function reset() { setEditing(null); setTitle(''); setNotes(''); setQuantity('1') }
  if (!allowed) return <Navigate to="/" replace />
  const sectionItems = items.filter(x => x.section === section)
  const rows = sectionItems.filter(x => x.completed === completed)
  return <div className="change-list">
    <p className="change-list-intro">Private notes shared only between Brandon Diaz and Test ChatGPT.</p>
    <div className="change-list-sections" aria-label="Choose a list">
      {(Object.keys(sections) as Section[]).map(key => <button key={key} type="button" aria-pressed={key === section} disabled={busy || !!editing || draft} onClick={() => { setSection(key); setCompleted(false) }}>{sections[key].label}</button>)}
    </div>
    <p className="change-list-intro">{sections[section].description}</p>
    {preview && <p className="change-list-notice">Local preview: notes save in this browser. They will not transfer automatically when this page is published.</p>}
    {error && <p role="alert">{error} <button className="index-secondary" disabled={busy} onClick={() => void load()}>Reload list</button></p>}
    <div className="change-list-workspace">
    <form className="change-list-compose" onSubmit={async event => {
      event.preventDefault()
      if (!title.trim() || busy || loading) return
      const amount = quantity.trim() ? Number(quantity) : null
      if (section === 'shopping' && amount !== null && (!Number.isFinite(amount) || amount <= 0 || amount > 1000000000)) return
      const old = items.find(x => x.id === editing)
      if (await save({ id: old?.id || crypto.randomUUID(), title: title.trim(), notes: notes.trim(), completed: old?.completed ?? false, created_at: old?.created_at || new Date().toISOString(), section: old?.section ?? section, quantity: section === 'shopping' ? amount : null }, !editing)) reset()
    }}>
      <h2>{editing ? 'Edit item' : 'Add to the list'}</h2>
      <label htmlFor="change-title">{section === 'shopping' ? 'What do you need for the shop?' : section === 'app' ? 'What needs to change?' : 'What would you like to work on?'}</label>
      <input id="change-title" value={title} onChange={e => setTitle(e.target.value)} maxLength={200} required disabled={busy} placeholder={sections[section].placeholder} />
      {section === 'shopping' && <div className="change-list-quantity">
        <label htmlFor="change-quantity">Quantity <span>(optional)</span></label>
        <input id="change-quantity" type="number" inputMode="decimal" min="0.000001" max="1000000000" step="any" value={quantity} onChange={e => setQuantity(e.target.value)} disabled={busy} />
      </div>}
      <label htmlFor="change-notes">Details <span>(optional)</span></label>
      <textarea id="change-notes" value={notes} onChange={e => setNotes(e.target.value)} maxLength={10000} rows={3} disabled={busy} placeholder={section === 'shopping' ? 'Size, preferred brand, store, or a product link.' : section === 'app' ? 'Which page, what happens now, and what you would like instead.' : 'Add your thoughts, next steps, or anything you want to remember.'} />
      <div className="change-list-actions">
        {(editing || draft) && <button type="button" className="index-secondary" onClick={reset} disabled={busy}>{editing ? 'Cancel' : 'Clear draft'}</button>}
        <button className="index-primary" disabled={!title.trim() || busy || loading}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Add item'}</button>
      </div>
    </form>
    <section className="change-list-results" aria-label="Saved items">
    <div className="change-list-filters" aria-label="Item status">
      <button className={completed ? 'index-secondary' : 'index-primary'} aria-pressed={!completed} onClick={() => setCompleted(false)}>{section === 'shopping' ? 'To buy' : 'Open'} · {sectionItems.filter(x => !x.completed).length}</button>
      <button className={completed ? 'index-primary' : 'index-secondary'} aria-pressed={completed} onClick={() => setCompleted(true)}>{section === 'shopping' ? 'Purchased' : 'Completed'} · {sectionItems.filter(x => x.completed).length}</button>
    </div>
    {loading ? <p role="status">Loading your list…</p> : rows.length === 0 ? <p className="change-list-empty">{error ? 'Your list is unavailable.' : section === 'shopping' ? completed ? 'No purchased items yet.' : 'Your shopping list is empty. Add something you need above.' : completed ? 'No completed items yet.' : 'Nothing on the list yet. Add your first idea or fix above.'}</p> :
      <ul className="change-list-items">{rows.map(item => <li key={item.id}>
        <label className="change-list-check"><input type="checkbox" checked={item.completed} disabled={busy || !!editing} onChange={e => void save({ ...item, completed: e.target.checked }, false)} aria-label={`Mark ${item.title} ${section === 'shopping' ? item.completed ? 'to buy' : 'purchased' : item.completed ? 'open' : 'complete'}`} /></label>
        <div className="change-list-copy"><h3>{item.title}</h3>{item.section === 'shopping' && item.quantity != null && <p><strong>Quantity: {item.quantity}</strong></p>}{item.notes && <p>{item.notes}</p>}<small>Added {new Date(item.created_at).toLocaleDateString()}</small></div>
        <div className="change-list-row-actions">
          <button className="index-secondary" disabled={busy || (draft && editing !== item.id)} onClick={() => { setEditing(item.id); setTitle(item.title); setNotes(item.notes); setQuantity(item.section === 'shopping' ? item.quantity == null ? '' : String(item.quantity) : '1'); document.getElementById('change-title')?.focus() }}>Edit</button>
          <button className="index-secondary" disabled={busy || !!editing || draft} aria-label={`Delete note: ${item.title}`} onClick={() => setDeleting(item)}>Delete</button>
        </div>
      </li>)}</ul>}
    </section>
    </div>
    {deleting && <ConfirmDialog title="Delete note" message={`Permanently delete “${deleting.title}”? It will be removed for both Brandon Diaz and Test ChatGPT. This cannot be undone.`} onConfirm={() => void remove(deleting)} onCancel={() => setDeleting(null)} />}
  </div>
}
