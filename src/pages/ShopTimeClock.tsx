import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { ShopWorker } from '../components/ShopWorkers'
import { errorMessage, requireLoaded } from '../lib/loadResults'
import LoadError from '../components/LoadError'
import { timeCategories, type TimeCategory } from '../lib/timeCategories'

interface Shift { id: string; worker_id: string; bid_id: string; started_at: string; kind?: TimeCategory; night?: boolean }
interface Job { id: string; job_number: string; name: string }

export default function ShopTimeClock() {
  const { session, realRole, viewAs } = useAuth()
  const preview = realRole === 'admin' && viewAs === 'shop'
  const loginId = session?.user.id
  const [previewLogins, setPreviewLogins] = useState<{ id: string; email: string }[]>([])
  const [previewLogin, setPreviewLogin] = useState('')
  const [workers,setWorkers] = useState<ShopWorker[]>([])
  const [shifts,setShifts] = useState<Shift[]>([])
  const [jobs,setJobs] = useState<Job[]>([])
  const [workerId,setWorkerId] = useState('')
  const [jobId,setJobId] = useState('')
  const [note,setNote] = useState('')
  const [kind,setKind] = useState<TimeCategory>('shop')
  const [night,setNight] = useState(false)
  const [loading,setLoading] = useState(true)
  const [loadError,setLoadError] = useState<string | null>(null)
  const [error,setError] = useState<string | null>(null)
  const [busy,setBusy] = useState(false)
  const [message,setMessage] = useState('')
  const [now,setNow] = useState(Date.now())
  const load = useCallback(async () => {
    if (!loginId) return
    setLoadError(null)
    try {
      const workerQuery = supabase!.from('shop_workers').select('*').order('first_name')
      const [w,s,j,p] = await Promise.all([
        preview ? workerQuery : workerQuery.eq('login_id',loginId),
        supabase!.from('shop_shifts').select('*').is('ended_at',null),
        supabase!.from('bids').select('id,job_number,name').eq('status','won').is('completed_at',null).order('job_number'),
        preview ? supabase!.from('profiles').select('id,email').eq('role','shop').order('email') : Promise.resolve({ data: [], error: null }),
      ])
      requireLoaded({workers:w,shifts:s,jobs:j,logins:p})
      setWorkers(w.data ?? []); setShifts(s.data ?? []); setJobs(j.data ?? [])
      setPreviewLogins(p.data ?? [])
      setJobId(current => current || j.data?.[0]?.id || '')
    } catch(e) { setLoadError(errorMessage(e)) } finally { setLoading(false) }
  }, [loginId, preview])
  useEffect(() => {
    void load()
    const timer = window.setInterval(() => { setNow(Date.now()); void load() },30000)
    return () => window.clearInterval(timer)
  },[load])
  const shownLogin = preview ? (previewLogins.find(p => p.id === previewLogin)?.id ?? previewLogins[0]?.id) : loginId
  const visibleWorkers = workers.filter(w => w.login_id === shownLogin && (w.active || shifts.some(s => s.worker_id === w.id)))
  const selected = visibleWorkers.find(w => w.id===workerId)
  const activeShift = shifts.find(s => s.worker_id===workerId)
  async function clock() {
    if (!selected || busy || preview) return
    setBusy(true); setError(null); setMessage('')
    try {
      let {error} = activeShift
        ? await supabase!.rpc('stop_shop_shift',{p_shift_id:activeShift.id})
        : await supabase!.rpc('start_shop_shift',{p_worker_id:workerId,p_bid_id:jobId,p_note:note.trim() || null,p_kind:kind,p_night:night})
      if (!activeShift && error?.code === 'PGRST202') {
        if (kind !== 'shop' || night) throw new Error('These category or night work settings need the pending database update. Ask an admin to publish it before clocking in.')
        // Keep ordinary Shop clocking usable while the database update rolls out.
        const legacy = await supabase!.rpc('start_shop_shift',{p_worker_id:workerId,p_bid_id:jobId,p_note:note.trim() || null})
        error = legacy.error
      }
      if(error) throw error
      setMessage(`${selected.first_name} ${selected.last_name} clocked ${activeShift ? 'out. Hours saved.' : 'in.'}`)
      setWorkerId(''); setNote(''); setKind('shop'); setNight(false); await load()
    } catch(e) { setError(errorMessage(e)); await load() } finally { setBusy(false) }
  }
  if (loading) return <p role="status">Loading shop clock…</p>
  if (loadError) return <LoadError error={loadError} subject="the shop clock" retry={() => void load()} />
  return <div className="zaid-page space-y-5 max-w-3xl">
    <h1>Time</h1><p>Select your name, choose your job, and clock in. Select your name again when you’re ready to clock out.</p>
    {preview && <section className="rounded-lg border border-slate-200 bg-white p-4 space-y-2">
      <label className="block">Preview shared login<select className="input" value={shownLogin ?? ''} onChange={e => { setPreviewLogin(e.target.value); setWorkerId(''); setNote(''); setError(null); setMessage('') }}>
        {!previewLogins.length && <option value="">No Shop logins configured</option>}
        {previewLogins.map(p => <option key={p.id} value={p.id}>{p.email}</option>)}
      </select></label>
      <p className="text-sm text-slate-500">Preview the workers and clock status for this login. Clocking is disabled in View as so testing won’t create real time entries.</p>
    </section>}
    {message && <p role="status" className="save-feedback save-saved">{message}</p>}
    {error && <p role="alert" className="save-feedback save-failed">{error}</p>}
    <section className="rounded-lg border border-slate-200 bg-white p-5 space-y-4">
      {visibleWorkers.length===0 && <p>Ask an admin to add your names to this shared login on the Team page.</p>}
      <label className="block">Worker<select className="input" value={selected?.id ?? ''} disabled={busy || !visibleWorkers.length} onChange={e => { setWorkerId(e.target.value); setError(null); setMessage(''); setNote(''); setKind('shop'); setNight(false) }}>
        <option value="">Select your name</option>
        {visibleWorkers.map(w => <option key={w.id} value={w.id}>{w.first_name} {w.last_name}{shifts.some(s => s.worker_id === w.id) ? ' — Clocked in' : ''}</option>)}
      </select></label>
      {selected && <div className="space-y-4 border-t border-slate-200 pt-4">
        {activeShift ? <p>Clocked in at {new Date(activeShift.started_at).toLocaleString()} · {jobs.find(j=>j.id===activeShift.bid_id)?.name ?? 'Assigned job'} · {Math.max(0,(now-new Date(activeShift.started_at).getTime())/3600000).toFixed(1)} hrs</p> : <>
          <label className="block">Job<select className="input" disabled={busy} value={jobId} onChange={e=>setJobId(e.target.value)}>{jobs.map(j=><option key={j.id} value={j.id}>{j.job_number} — {j.name}</option>)}</select></label>
          {!jobs.length && <p>No active jobs are available. Ask an admin to add one.</p>}
        </>}
        <div className="flex flex-wrap items-end gap-4">
          <label className="block">Category<select className="input" disabled={busy || !!activeShift} value={activeShift?.kind ?? kind} onChange={e=>setKind(e.target.value as TimeCategory)}>{timeCategories.map(category => <option key={category.value} value={category.value}>{category.label}</option>)}</select></label>
          <label className="flex items-center gap-2 py-2"><input type="checkbox" disabled={busy || !!activeShift} checked={activeShift ? !!activeShift.night : night} onChange={e=>setNight(e.target.checked)} />Night work</label>
        </div>
        {!activeShift && <label className="block">What you’re working on (optional)<input className="input" disabled={busy} value={note} onChange={e=>setNote(e.target.value)} /></label>}
        <button className="index-primary" disabled={preview || busy || (!activeShift && (!jobId || !selected.active))} onClick={()=>void clock()}>{busy ? 'Saving…' : activeShift ? 'Clock out' : 'Clock in'}</button>
      </div>}
    </section>
    <p className="text-sm text-slate-500">Each worker has a separate timer. Completed time can only be corrected by an admin.</p>
  </div>
}
