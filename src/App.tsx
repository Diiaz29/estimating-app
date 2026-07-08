import { useEffect, useState } from 'react'
import { supabase, supabaseConfigured } from './lib/supabase'

type Status =
  | { state: 'checking' }
  | { state: 'not-configured' }
  | { state: 'connected' }
  | { state: 'error'; message: string }

function App() {
  const [status, setStatus] = useState<Status>({ state: 'checking' })

  useEffect(() => {
    if (!supabaseConfigured || !supabase) {
      setStatus({ state: 'not-configured' })
      return
    }
    // A lightweight round-trip that works before any tables exist:
    // if the URL + anon key are valid, this succeeds (session is just null).
    supabase.auth
      .getSession()
      .then(({ error }) => {
        if (error) setStatus({ state: 'error', message: error.message })
        else setStatus({ state: 'connected' })
      })
      .catch((err) => setStatus({ state: 'error', message: String(err) }))
  }, [])

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-sm p-8 text-center">
        <div className="text-4xl mb-3">🪵</div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Millwork Estimating App
        </h1>
        <p className="mt-1 text-sm text-slate-500">Milestone 0 — it's alive.</p>

        <div className="mt-6">
          <StatusBadge status={status} />
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: Status }) {
  const map: Record<Status['state'], { dot: string; label: string; text: string }> = {
    checking: { dot: 'bg-amber-400', label: 'Checking Supabase…', text: 'text-amber-700' },
    'not-configured': {
      dot: 'bg-slate-400',
      label: 'Supabase not connected yet',
      text: 'text-slate-600',
    },
    connected: { dot: 'bg-emerald-500', label: 'Connected to Supabase', text: 'text-emerald-700' },
    error: { dot: 'bg-red-500', label: 'Supabase error', text: 'text-red-700' },
  }
  const s = map[status.state]
  return (
    <div className="inline-flex flex-col items-center gap-1">
      <span className={`inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-sm font-medium ${s.text}`}>
        <span className={`h-2.5 w-2.5 rounded-full ${s.dot}`} />
        {s.label}
      </span>
      {status.state === 'error' && (
        <span className="mt-1 text-xs text-red-500">{status.message}</span>
      )}
    </div>
  )
}

export default App
