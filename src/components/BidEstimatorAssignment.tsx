import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { profileName } from '../lib/profileName'
import { notifyReviewChanged } from '../lib/bidReview'
import type { Profile } from '../lib/types'

type Estimator = Pick<Profile, 'id' | 'first_name' | 'last_name' | 'email' | 'role'>

export default function BidEstimatorAssignment({ bidId }: { bidId: string }) {
  const { isAdmin, canEdit } = useAuth()
  const [people, setPeople] = useState<Estimator[]>([])
  const [assigned, setAssigned] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const load = useCallback(async () => {
    const [assignment, profiles] = await Promise.all([
      supabase!.from('bid_estimator_assignments').select('estimator_id').eq('bid_id', bidId).maybeSingle(),
      supabase!.from('profiles').select('id,first_name,last_name,email,role').order('first_name'),
    ])
    if (assignment.error || profiles.error) throw new Error(assignment.error?.message ?? profiles.error!.message)
    return { assigned: assignment.data?.estimator_id ?? '', people: (profiles.data ?? []) as Estimator[] }
  }, [bidId])
  useEffect(() => {
    if (!canEdit) return
    let active = true
    setLoading(true); setError(null); setSaved(false)
    void load().then(data => { if (active) { setAssigned(data.assigned); setPeople(data.people) } })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : 'Could not load the assigned estimator.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [load, canEdit])
  async function assign(value: string) {
    if (!isAdmin || busy) return
    setBusy(true); setError(null); setSaved(false)
    try {
      const { error: saveError } = await supabase!.rpc('assign_bid_estimator', { p_bid_id: bidId, p_estimator_id: value || null })
      if (saveError) throw new Error(saveError.message)
      setAssigned(value); setSaved(true); notifyReviewChanged()
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save the assigned estimator.') }
    finally { setBusy(false) }
  }
  if (!canEdit) return null
  return <EstimatorAssignmentField people={people} assigned={assigned} admin={isAdmin} loading={loading} busy={busy} error={error} saved={saved} onAssign={value => void assign(value)} onRetry={() => { setLoading(true); void load().then(data => { setAssigned(data.assigned); setPeople(data.people); setError(null) }).catch(e => setError(String(e))).finally(() => setLoading(false)) }} />
}

export function EstimatorAssignmentField({ people, assigned, admin, loading, busy, error, saved, onAssign, onRetry }: {
  people: Estimator[]; assigned: string; admin: boolean; loading: boolean; busy: boolean; error: string | null; saved: boolean
  onAssign: (value: string) => void; onRetry: () => void
}) {
  return <div>
    <label className="block"><span className="text-xs font-medium text-slate-500">Assigned estimator</span>
      <select className="input" value={assigned} disabled={!admin || loading || busy || !!error} onChange={e => onAssign(e.target.value)}>
        <option value="">{loading ? 'Loading…' : 'Unassigned'}</option>
        {people.filter(p => p.role === 'estimator' || p.role === 'admin' || p.id === assigned).map(p => <option key={p.id} value={p.id} disabled={p.role !== 'estimator' && p.role !== 'admin'}>{profileName(p)}</option>)}
      </select>
    </label>
    <p className="mt-1 text-xs text-slate-500" role="status">{busy ? 'Saving assignment…' : saved ? 'Assignment saved.' : admin ? 'Receives returned-review notes. Assignment saves immediately.' : 'Receives returned-review notes. Ask an admin to change the assignment.'}</p>
    {error && <p className="mt-1 text-sm text-red-600" role="alert">{error} <button type="button" className="index-secondary" disabled={busy || loading} onClick={onRetry}>Retry</button></p>}
  </div>
}
