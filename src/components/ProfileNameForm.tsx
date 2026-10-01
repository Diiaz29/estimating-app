import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import type { Profile } from '../lib/types'

export default function ProfileNameForm({ profile, onSaved, inline = false }: {
  profile: Profile
  onSaved: () => void | Promise<void>
  inline?: boolean
}) {
  const [first, setFirst] = useState(profile.first_name ?? '')
  const [last, setLast] = useState(profile.last_name ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const changed = first.trim() !== (profile.first_name ?? '') || last.trim() !== (profile.last_name ?? '')

  async function save(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setError(null)
    setSaved(false)
    if (!first.trim() || !last.trim()) return setError('Enter first and last name.')
    setBusy(true)
    try {
      const { error } = await supabase!.rpc('set_profile_name', {
        p_user_id: profile.id, p_first_name: first.trim(), p_last_name: last.trim(),
      })
      if (error) { setError(error.message); return }
      await onSaved()
      setSaved(true)
    } catch { setError('Could not save the name. Please try again.') }
    finally { setBusy(false) }
  }

  return (
    <form onSubmit={save} aria-label={`Name for ${profile.email}`} className={inline ? 'team-name-form' : 'construction-profile-name-panel space-y-4'}>
      {!inline && <div>
        <h2 className="text-base font-semibold">Your name</h2>
        <p className="text-sm text-slate-500">{profile.email}</p>
      </div>}
      {!inline && <p className="text-sm text-slate-500">Used in team lists and card assignments.</p>}
      <div className={inline ? 'team-name-fields' : 'grid gap-4 sm:grid-cols-2'}>
        <label className="block">First name
          <input className="input" autoComplete="given-name" required maxLength={80} disabled={busy} value={first} onChange={e => { setFirst(e.target.value); setSaved(false) }} />
        </label>
        <label className="block">Last name
          <input className="input" autoComplete="family-name" required maxLength={80} disabled={busy} value={last} onChange={e => { setLast(e.target.value); setSaved(false) }} />
        </label>
      </div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {saved && <p role="status" className="text-sm text-emerald-700">Name saved.</p>}
      <button disabled={busy || !changed} className="team-name-save rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save name'}</button>
    </form>
  )
}
