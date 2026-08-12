import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import ConfirmDialog from '../components/ConfirmDialog'
import type { Profile, Role } from '../lib/types'

export default function Team() {
  const { isAdmin, profile: me } = useAuth()
  const [profiles, setProfiles] = useState<Profile[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [removing, setRemoving] = useState<Profile | null>(null)

  async function load() {
    const { data, error } = await supabase!.from('profiles').select('*').order('created_at')
    if (error) setError(error.message)
    else setProfiles(data as Profile[])
  }

  useEffect(() => {
    void load()
  }, [])

  if (!isAdmin) {
    return (
      <p className="rounded-lg border-2 border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
        Admins only.
      </p>
    )
  }
  if (error)
    return <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>
  if (!profiles) return <p className="text-sm text-slate-500">Loading…</p>

  async function setRole(p: Profile, role: Role) {
    const { error } = await supabase!.from('profiles').update({ role }).eq('id', p.id)
    if (error) setError(error.message)
    else void load()
  }

  async function removeUser(p: Profile) {
    setRemoving(null)
    const { error } = await supabase!.functions.invoke('delete-user', {
      body: { user_id: p.id },
    })
    if (error) {
      let message = error.message
      try {
        const ctx = (error as { context?: Response }).context
        if (ctx) {
          const body = await ctx.json()
          if (body?.error) message = body.error
        }
      } catch {
        /* keep the generic message */
      }
      setError(message)
    } else void load()
  }

  const admins = profiles.filter((p) => p.role === 'admin')

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Team</h1>
        <p className="mt-1 text-sm text-slate-500">
          <span className="font-medium">Admin</span> — everything.{' '}
          <span className="font-medium">Estimator</span> — create and edit bids, estimates,
          contractors; no deleting. <span className="font-medium">PM</span> — manage schedules,
          order checkboxes, and receipts; everything else view-only.{' '}
          <span className="font-medium">Viewer</span> — look, don't touch. New people start as
          estimators.
        </p>
      </div>

      <AddUserForm onCreated={() => void load()} />

      <div className="overflow-hidden rounded-lg border-2 border-slate-800 bg-white">
        {profiles.map((p, i) => {
          const lastAdmin = p.role === 'admin' && admins.length === 1
          return (
            <div
              key={p.id}
              className={`flex flex-wrap items-center gap-3 px-4 py-3 ${i > 0 ? 'border-t border-slate-200' : ''}`}
            >
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {p.email}
                {p.id === me?.id && <span className="ml-2 text-xs text-slate-400">(you)</span>}
              </span>
              <div className="flex gap-1.5">
                {(['viewer', 'office', 'pm', 'estimator', 'admin'] as Role[]).map((r) => (
                  <button
                    key={r}
                    disabled={lastAdmin && r !== 'admin'}
                    title={
                      lastAdmin && r !== 'admin'
                        ? 'The last admin can’t be demoted — promote someone else first.'
                        : undefined
                    }
                    onClick={() => p.role !== r && void setRole(p, r)}
                    className={`rounded-md border px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed ${
                      p.role === r
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-300 bg-white text-slate-600 hover:border-slate-500'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
              {p.id !== me?.id && (
                <button
                  onClick={() => setRemoving(p)}
                  className="text-xs text-slate-400 hover:text-red-600"
                >
                  remove
                </button>
              )}
            </div>
          )
        })}
      </div>

      {removing && (
        <ConfirmDialog
          title="Remove team member"
          message={`Remove ${removing.email}'s login? They'll no longer be able to sign in. Bids and contractors they worked on are untouched.`}
          confirmLabel="Remove"
          onConfirm={() => void removeUser(removing)}
          onCancel={() => setRemoving(null)}
        />
      )}
    </div>
  )
}

function AddUserForm({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { data, error } = await supabase!.functions.invoke('create-user', {
      body: { email: email.trim().toLowerCase(), password },
    })
    setBusy(false)
    if (error) {
      // Pull the real message out of the function's response when there is one
      let message = error.message
      try {
        const ctx = (error as { context?: Response }).context
        if (ctx) {
          const body = await ctx.json()
          if (body?.error) message = body.error
        }
      } catch {
        /* keep the generic message */
      }
      setError(message)
      return
    }
    setOkMsg(`${data.email} can now sign in.`)
    setEmail('')
    setPassword('')
    onCreated()
    setTimeout(() => setOkMsg(null), 5000)
  }

  if (!open) {
    return (
      <div className="flex items-center gap-3">
        <button
          onClick={() => setOpen(true)}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-700"
        >
          + Add user
        </button>
        {okMsg && <span className="text-sm font-medium text-emerald-600">{okMsg} ✓</span>}
      </div>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-lg border-2 border-slate-800 bg-white p-4"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="font-mono text-[11px] uppercase tracking-widest text-slate-500">Email</span>
          <input
            type="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value.toLowerCase())}
            className="input"
          />
        </label>
        <label className="block">
          <span className="font-mono text-[11px] uppercase tracking-widest text-slate-500">
            Temporary password (8+ characters)
          </span>
          <input
            type="text"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input font-mono"
          />
        </label>
      </div>
      <p className="text-xs text-slate-500">
        Share the email and temporary password with them however you like — they sign in at this
        same web address.
      </p>
      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {busy ? 'Creating…' : 'Create login'}
        </button>
      </div>
    </form>
  )
}
