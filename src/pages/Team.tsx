import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { Profile, Role } from '../lib/types'

export default function Team() {
  const { isAdmin, profile: me } = useAuth()
  const [profiles, setProfiles] = useState<Profile[] | null>(null)
  const [error, setError] = useState<string | null>(null)

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

  const admins = profiles.filter((p) => p.role === 'admin')

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Team</h1>
        <p className="mt-1 text-sm text-slate-500">
          <span className="font-medium">Admins</span> can do everything, including deleting bids
          and contractors and managing this page. <span className="font-medium">Estimators</span>{' '}
          can create and edit, but not delete. To add a new person, create their login in the
          Supabase dashboard (Authentication → Users → Add user) — they'll show up here as an
          estimator.
        </p>
      </div>

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
                {(['estimator', 'admin'] as Role[]).map((r) => (
                  <button
                    key={r}
                    disabled={lastAdmin && r === 'estimator'}
                    title={
                      lastAdmin && r === 'estimator'
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
            </div>
          )
        })}
      </div>
    </div>
  )
}
