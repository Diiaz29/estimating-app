import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import type { Profile } from '../lib/types'

export interface ShopWorker { id: string; login_id: string; first_name: string; last_name: string; active: boolean }

export default function ShopWorkers({ profiles }: { profiles: Profile[] }) {
  const logins = profiles.filter(p => p.role === 'shop')
  const loginCount = logins.length
  const [workers, setWorkers] = useState<ShopWorker[]>([])
  const [login, setLogin] = useState('')
  const [first, setFirst] = useState('')
  const [last, setLast] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function load() {
    const { data, error } = await supabase!.from('shop_workers').select('*').order('first_name')
    if (error) setError(error.message)
    else { setWorkers(data ?? []); setError(null) }
  }
  useEffect(() => { if (loginCount) void load() }, [profiles, loginCount])
  async function add(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    const { error } = await supabase!.from('shop_workers').insert({ login_id: login || logins[0]?.id, first_name: first.trim(), last_name: last.trim() })
    setBusy(false)
    if (error) setError(error.message)
    else { setFirst(''); setLast(''); await load() }
  }
  return <section className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
    <h2 className="font-semibold">Shared shop logins</h2>
    <p className="text-sm text-slate-500">Set a login’s role to Shop below, then add the workers who will use it. Each worker selects their own name on the Time page.</p>
    <>
      <form onSubmit={add} className="flex flex-wrap items-end gap-3">
        <label>Shared login<select className="input" disabled={busy || !loginCount} value={login || logins[0]?.id || ''} onChange={e => setLogin(e.target.value)}>{!loginCount && <option value="">Set a login to Shop below</option>}{logins.map(p => <option key={p.id} value={p.id}>{p.email}</option>)}</select></label>
        <label>First name<input className="input" disabled={busy || !loginCount} required maxLength={80} value={first} onChange={e => setFirst(e.target.value)} /></label>
        <label>Last name<input className="input" disabled={busy || !loginCount} required maxLength={80} value={last} onChange={e => setLast(e.target.value)} /></label>
        <button className="index-primary" disabled={busy || !loginCount || !first.trim() || !last.trim()}>{busy ? 'Adding…' : 'Add worker'}</button>
      </form>
      {workers.filter(w => w.login_id === (login || logins[0]?.id)).map(w => <div key={w.id} className="flex items-center gap-3 border-t border-slate-200 pt-3"><span className="flex-1">{w.first_name} {w.last_name}</span><span>{w.active ? 'Active' : 'Inactive'}</span><button className="index-secondary" disabled={busy} onClick={async () => {
        setBusy(true)
        const { error } = await supabase!.from('shop_workers').update({ active: !w.active }).eq('id', w.id)
        setBusy(false)
        if (error) setError(error.message); else await load()
      }}>{w.active ? 'Deactivate' : 'Reactivate'}</button></div>)}
    </>
    {error && <p role="alert" className="save-feedback save-failed">{error}</p>}
  </section>
}
