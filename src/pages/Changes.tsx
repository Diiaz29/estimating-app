import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { canUseChangeList } from '../lib/changeListAccess'
import { useUnsavedWarning } from '../lib/useSaveQueue'
import '../changes.css'

interface ChangeItem { id: string; title: string; notes: string; completed: boolean; created_at: string }
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
  const [editing, setEditing] = useState<string | null>(null)
  const [completed, setCompleted] = useState(false)
  useUnsavedWarning(busy || !!title || !!notes)

  async function load() {
    if (!allowed) return
    setLoading(true)
    setError('')
    try {
      const result = await supabase!.from('app_change_requests').select('id,title,notes,completed,created_at').order('created_at', { ascending: false })
      if (import.meta.env.DEV && result.error?.code === 'PGRST205') {
        const saved: unknown = JSON.parse(localStorage.getItem(previewKey) || '[]')
        setItems(Array.isArray(saved) ? saved.filter((x): x is ChangeItem => x && typeof x.id === 'string' && typeof x.title === 'string' && typeof x.notes === 'string' && typeof x.completed === 'boolean' && typeof x.created_at === 'string') : [])
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
        const fields = { title: item.title, notes: item.notes, completed: item.completed }
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

  function reset() { setEditing(null); setTitle(''); setNotes('') }
  if (!allowed) return <Navigate to="/" replace />
  const rows = items.filter(x => x.completed === completed)
  return <div className="change-list">
    <p className="change-list-intro">Ideas, fixes, and improvements for SpotOnBid. Only Brandon Diaz and Test ChatGPT can access this list.</p>
    {preview && <p className="change-list-notice">Local preview: notes save in this browser. They will not transfer automatically when this page is published.</p>}
    {error && <p role="alert">{error} <button className="index-secondary" disabled={busy} onClick={() => void load()}>Reload list</button></p>}
    <form className="change-list-compose" onSubmit={async event => {
      event.preventDefault()
      if (!title.trim() || busy || loading) return
      const old = items.find(x => x.id === editing)
      if (await save({ id: old?.id || crypto.randomUUID(), title: title.trim(), notes: notes.trim(), completed: old?.completed ?? false, created_at: old?.created_at || new Date().toISOString() }, !editing)) reset()
    }}>
      <h2>{editing ? 'Edit item' : 'Add to the list'}</h2>
      <label htmlFor="change-title">What needs to change?</label>
      <input id="change-title" value={title} onChange={e => setTitle(e.target.value)} maxLength={200} required disabled={busy} placeholder="For example: make job search easier" />
      <label htmlFor="change-notes">Details <span>(optional)</span></label>
      <textarea id="change-notes" value={notes} onChange={e => setNotes(e.target.value)} maxLength={10000} rows={3} disabled={busy} placeholder="Which page, what happens now, and what you would like instead." />
      <div className="change-list-actions">
        {editing && <button type="button" className="index-secondary" onClick={reset} disabled={busy}>Cancel</button>}
        <button className="index-primary" disabled={!title.trim() || busy || loading}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Add item'}</button>
      </div>
    </form>
    <div className="change-list-filters" aria-label="Item status">
      <button className={completed ? 'index-secondary' : 'index-primary'} aria-pressed={!completed} onClick={() => setCompleted(false)}>Open · {items.filter(x => !x.completed).length}</button>
      <button className={completed ? 'index-primary' : 'index-secondary'} aria-pressed={completed} onClick={() => setCompleted(true)}>Completed · {items.filter(x => x.completed).length}</button>
    </div>
    {loading ? <p role="status">Loading your list…</p> : rows.length === 0 ? <p className="change-list-empty">{error ? 'Your list is unavailable.' : completed ? 'No completed items yet.' : 'Nothing on the list yet. Add your first idea or fix above.'}</p> :
      <ul className="change-list-items">{rows.map(item => <li key={item.id}>
        <label className="change-list-check"><input type="checkbox" checked={item.completed} disabled={busy || !!editing} onChange={e => void save({ ...item, completed: e.target.checked }, false)} aria-label={`Mark ${item.title} ${item.completed ? 'open' : 'complete'}`} /></label>
        <div className="change-list-copy"><h3>{item.title}</h3>{item.notes && <p>{item.notes}</p>}<small>Added {new Date(item.created_at).toLocaleDateString()}</small></div>
        <button className="index-secondary" disabled={busy || (!!title && editing !== item.id) || (!!notes && editing !== item.id)} onClick={() => { setEditing(item.id); setTitle(item.title); setNotes(item.notes); document.getElementById('change-title')?.focus() }}>Edit</button>
      </li>)}</ul>}
  </div>
}
