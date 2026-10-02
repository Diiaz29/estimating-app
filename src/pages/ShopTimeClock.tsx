import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { ShopWorker } from '../components/ShopWorkers'
import { errorMessage, requireLoaded } from '../lib/loadResults'
import LoadError from '../components/LoadError'

interface Shift { id: string; worker_id: string; bid_id: string; started_at: string }
interface Job { id: string; job_number: string; name: string }

export default function ShopTimeClock() {
  const { session } = useAuth()
  const loginId = session?.user.id
  const [workers,setWorkers] = useState<ShopWorker[]>([])
  const [shifts,setShifts] = useState<Shift[]>([])
  const [jobs,setJobs] = useState<Job[]>([])
  const [workerId,setWorkerId] = useState('')
  const [jobId,setJobId] = useState('')
  const [note,setNote] = useState('')
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
      const [w,s,j] = await Promise.all([
        supabase!.from('shop_workers').select('*').eq('login_id',loginId).order('first_name'),
        supabase!.from('shop_shifts').select('*').is('ended_at',null),
        supabase!.from('bids').select('id,job_number,name').eq('status','won').is('completed_at',null).order('job_number'),
      ])
      requireLoaded({workers:w,shifts:s,jobs:j})
      setWorkers(w.data ?? []); setShifts(s.data ?? []); setJobs(j.data ?? [])
      setJobId(current => current || j.data?.[0]?.id || '')
    } catch(e) { setLoadError(errorMessage(e)) } finally { setLoading(false) }
  }, [loginId])
  useEffect(() => {
    void load()
    const timer = window.setInterval(() => { setNow(Date.now()); void load() },30000)
    return () => window.clearInterval(timer)
  },[load])
  const selected = workers.find(w => w.id===workerId)
  const activeShift = shifts.find(s => s.worker_id===workerId)
  async function clock() {
    if (!selected || busy) return
    setBusy(true); setError(null); setMessage('')
    try {
      const {error} = activeShift
        ? await supabase!.rpc('stop_shop_shift',{p_shift_id:activeShift.id})
        : await supabase!.rpc('start_shop_shift',{p_worker_id:workerId,p_bid_id:jobId,p_note:note.trim() || null})
      if(error) throw error
      setMessage(`${selected.first_name} ${selected.last_name} clocked ${activeShift ? 'out. Hours saved.' : 'in.'}`)
      setWorkerId(''); setNote(''); await load()
    } catch(e) { setError(errorMessage(e)); await load() } finally { setBusy(false) }
  }
  if (loading) return <p role="status">Loading shop clock…</p>
  if (loadError) return <LoadError error={loadError} subject="the shop clock" retry={() => void load()} />
  return <div className="zaid-page space-y-5 max-w-3xl">
    <h1>Time</h1><p>Select your name, choose your job, and clock in. Select your name again when you’re ready to clock out.</p>
    {message && <p role="status" className="save-feedback save-saved">{message}</p>}
    {error && <p role="alert" className="save-feedback save-failed">{error}</p>}
    <section className="rounded-lg border border-slate-200 bg-white p-5 space-y-4">
      <h2 className="font-semibold">Who is logging time?</h2>
      {workers.filter(w => w.active || shifts.some(s => s.worker_id===w.id)).length===0 && <p>Ask an admin to add your names to this shared login on the Team page.</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{workers.filter(w => w.active || shifts.some(s => s.worker_id===w.id)).map(w => {
        const shift=shifts.find(s=>s.worker_id===w.id)
        return <button type="button" key={w.id} className={workerId===w.id ? 'index-primary' : 'index-secondary'} aria-pressed={workerId===w.id} disabled={busy} onClick={()=>{setWorkerId(w.id);setError(null);setMessage('');setNote('')}}>
          {w.first_name} {w.last_name}{shift ? ` · Clocked in · ${Math.max(0,(now-new Date(shift.started_at).getTime())/3600000).toFixed(1)} hrs` : ' · Clocked out'}
        </button>
      })}</div>
      {selected && <div className="space-y-4 border-t border-slate-200 pt-4">
        <h2 className="font-semibold">{selected.first_name} {selected.last_name}</h2>
        {activeShift ? <p>Clocked in at {new Date(activeShift.started_at).toLocaleString()} · {jobs.find(j=>j.id===activeShift.bid_id)?.name ?? 'Assigned job'}</p> : <>
          <label className="block">Job<select className="input" disabled={busy} value={jobId} onChange={e=>setJobId(e.target.value)}>{jobs.map(j=><option key={j.id} value={j.id}>{j.job_number} — {j.name}</option>)}</select></label>
          <label className="block">What you’re working on (optional)<input className="input" disabled={busy} value={note} onChange={e=>setNote(e.target.value)} /></label>
          {!jobs.length && <p>No active jobs are available. Ask an admin to add one.</p>}
        </>}
        <button className="index-primary" disabled={busy || (!activeShift && (!jobId || !selected.active))} onClick={()=>void clock()}>{busy ? 'Saving…' : activeShift ? 'Clock out' : 'Clock in'}</button>
      </div>}
    </section>
    <p className="text-sm text-slate-500">Each worker has a separate timer. Completed time can only be corrected by an admin.</p>
  </div>
}
