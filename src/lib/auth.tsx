import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { Profile, Role } from './types'

interface AuthState {
  session: Session | null
  profile: Profile | null
  isAdmin: boolean
  /** admin or estimator — may create/edit bids, estimates, contractors */
  canEdit: boolean
  /** admin, estimator, or PM — may manage schedules, order checks, receipts */
  canSchedule: boolean
  /** admin, estimator, or office — may set up and edit bids/jobs (not estimates) */
  canManageBids: boolean
  /** office role: receipts + bid setup + team time, no estimates or profit */
  isOffice: boolean
  /** the account's true role (ignores view-as) */
  realRole: Role | null
  /** admin-only preview: see the app as another role (UI only) */
  viewAs: Role | null
  setViewAs: (role: Role | null) => void
  loading: boolean
}

const AuthContext = createContext<AuthState>({
  session: null,
  profile: null,
  isAdmin: false,
  canEdit: false,
  canSchedule: false,
  canManageBids: false,
  isOffice: false,
  realRole: null,
  viewAs: null,
  setViewAs: () => {},
  loading: true,
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (!data.session) setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      if (!s) {
        setProfile(null)
        setLoading(false)
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session || !supabase) return
    let cancelled = false
    supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => {
        if (!cancelled) {
          setProfile((data as Profile) ?? null)
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [session])

  const [viewAs, setViewAs] = useState<Role | null>(null)
  const realRole = profile?.role ?? null
  // view-as only applies to real admins, and only changes what the UI shows
  const role = realRole === 'admin' && viewAs ? viewAs : realRole
  return (
    <AuthContext.Provider
      value={{
        session,
        profile,
        isAdmin: role === 'admin',
        canEdit: role === 'admin' || role === 'estimator',
        canSchedule: role === 'admin' || role === 'estimator' || role === 'pm',
        canManageBids: role === 'admin' || role === 'estimator' || role === 'office',
        isOffice: role === 'office',
        realRole,
        viewAs: realRole === 'admin' ? viewAs : null,
        setViewAs,
        loading,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)

export async function signOut() {
  await supabase?.auth.signOut()
}
