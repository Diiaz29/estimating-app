import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { Bid } from '../lib/types'
import PlansSection from '../components/PlansSection'

/** Plans tab: uploads + the drawings date the proposal cites. Viewer lives in the plan room. */
export default function Plans() {
  const { id } = useParams<{ id: string }>()
  const { canEdit } = useAuth()
  const [bid, setBid] = useState<Bid | null>(null)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase!
      .from('bids')
      .select('*')
      .eq('id', id!)
      .single()
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setBid(data as Bid)
      })
  }, [id])

  async function saveDrawingsDate(value: string) {
    const drawings_date = value || null
    setBid((b) => (b ? { ...b, drawings_date } : b))
    const { error } = await supabase!.from('bids').update({ drawings_date }).eq('id', id!)
    if (error) setError(error.message)
    else {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
  }

  if (error)
    return <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>
  if (!bid) return <p className="text-sm text-slate-500">Loading…</p>

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">
          <span className="mr-2 font-mono text-sm text-slate-500">{bid.job_number}</span>
          {bid.name} — plans
        </h1>
      </div>

      <label className="block max-w-xs">
        <span className="font-mono text-[11px] uppercase tracking-widest text-slate-500">
          Architect drawings dated
        </span>
        <span className="flex items-center gap-2">
          <input
            type="date"
            value={bid.drawings_date ?? ''}
            onChange={(e) => void saveDrawingsDate(e.target.value)}
            disabled={!canEdit}
            className="input"
          />
          {saved && <span className="text-xs font-medium text-emerald-600">Saved ✓</span>}
        </span>
        <span className="mt-1 block text-xs text-slate-500">
          Cited on the proposal so everyone knows which drawing set was priced.
        </span>
      </label>

      <PlansSection bidId={bid.id} />
    </div>
  )
}
