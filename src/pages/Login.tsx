import { useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { LOGO_URL } from '../lib/branding'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [logoOk, setLogoOk] = useState(true)
  const [dark] = useState(() => localStorage.getItem('theme') === 'dark')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    setBusy(false)
  }

  return (
    <div className={`zaid-login zaid-app min-h-screen flex items-center justify-center p-6 ${dark ? 'dark' : ''}`}>
      <div className="login-content w-full">
        <div className="login-brand">
          {logoOk && LOGO_URL ? (
            <img src={LOGO_URL} alt="ZAID Millwork" onError={() => setLogoOk(false)} />
          ) : <span>ZAID Millwork</span>}
        </div>
        <div className="login-card rounded-xl border bg-white">
          <div className="login-heading">
            <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
          </div>
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <label className="block">
              <span className="login-label">Email</span>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="login-label">Password</span>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none"
              />
            </label>
            {error && (
              <p className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-md bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
            <p className="text-xs text-slate-500 text-center">
              No account? Ask the admin to add you.
            </p>
          </form>
        </div>
      </div>
    </div>
  )
}
