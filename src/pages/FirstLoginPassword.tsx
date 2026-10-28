import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { signOut } from '../lib/auth'
import { LOGO_URL } from '../lib/branding'

export default function FirstLoginPassword() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [dark] = useState(() => localStorage.getItem('theme') === 'dark')
  async function refresh() {
    const result = await supabase!.auth.refreshSession()
    if (result.error || result.data.session?.user.app_metadata?.must_change_password !== false) throw new Error('Your password is saved. Sign out and sign in with your new password to continue.')
  }
  return <div className={`zaid-login zaid-app min-h-screen flex items-center justify-center p-6 ${dark ? 'dark' : ''}`}>
    <div className="login-content w-full">
      <div className="login-brand">{LOGO_URL ? <img src={LOGO_URL} alt="ZAID Millwork" /> : 'ZAID Millwork'}</div>
      <div className="login-card rounded-xl border bg-white">
        <div className="login-heading"><h1 className="text-xl font-semibold">Choose your password</h1></div>
        <form className="p-6 space-y-4" onSubmit={async e => {
          e.preventDefault()
          if (busy) return
          setError('')
          if (!saved && password !== confirm) { setError('The passwords do not match.'); return }
          setBusy(true)
          try {
            if (!saved) {
              const result = await supabase!.functions.invoke('complete-first-login', { body: { password } })
              if (result.error) {
                let message = 'Could not save your password. Please try again.'
                try { message = (await result.error.context.json()).error || message } catch { /* Network errors have no response body. */ }
                throw new Error(message)
              }
              if (!result.data?.success) throw new Error('Could not confirm the password change. Please try again.')
              setSaved(true); setPassword(''); setConfirm('')
            }
            await refresh()
          } catch (err) { setError(err instanceof Error ? err.message : 'Please try again.') }
          finally { setBusy(false) }
        }}>
          <p>Before you begin, replace your starter password with one only you know.</p>
          {!saved && <>
            <label className="block"><span className="login-label">New password</span><input className="mt-1 w-full rounded-md border px-3 py-2" type="password" autoComplete="new-password" minLength={8} maxLength={128} required disabled={busy} value={password} onChange={e => setPassword(e.target.value)} /></label>
            <p className="text-sm">Use at least 8 characters.</p>
            <label className="block"><span className="login-label">Confirm new password</span><input className="mt-1 w-full rounded-md border px-3 py-2" type="password" autoComplete="new-password" minLength={8} maxLength={128} required disabled={busy} value={confirm} onChange={e => setConfirm(e.target.value)} /></label>
          </>}
          {error && <p role="alert">{error}</p>}
          <button className="index-primary w-full" disabled={busy}>{busy ? 'Saving…' : saved ? 'Continue' : 'Save password and continue'}</button>
          <button type="button" className="index-secondary w-full" disabled={busy} onClick={() => void signOut()}>Sign out</button>
        </form>
      </div>
    </div>
  </div>
}
