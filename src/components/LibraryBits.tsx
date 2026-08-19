import { daysSince } from '../lib/format'
import { supabase } from '../lib/supabase'

/** Amber "price is old" badge, shown once a cost is older than the staleness
 *  setting. Pass `onConfirm` to show a "still good" button next to it. */
export function StaleBadge({
  costUpdatedAt, thresholdDays, onConfirm,
}: { costUpdatedAt: string; thresholdDays: number; onConfirm?: () => void }) {
  const days = daysSince(costUpdatedAt)
  if (days < thresholdDays) return null
  return (
    <span className="inline-flex items-center gap-1">
      <span
        title={`Price last updated ${days} days ago — worth re-checking with the supplier.`}
        className="inline-block rounded border border-amber-400 bg-amber-50 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-amber-800"
      >
        {days}d old
      </span>
      {onConfirm && <StillGoodButton onClick={onConfirm} />}
    </span>
  )
}

export function StillGoodButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="I checked — this price is still right. Resets the clock without changing the number."
      className="rounded border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-emerald-800 hover:bg-emerald-100"
    >
      ✓ still good
    </button>
  )
}

/** Mark a material/finish price as re-checked today (no cost change). */
export async function confirmPrice(table: 'materials' | 'finishes', id: string) {
  const { error } = await supabase!.from(table).update({ cost_updated_at: new Date().toISOString() }).eq('id', id)
  return error?.message ?? null
}

export function GroupTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2 mt-6 first:mt-0 font-mono text-[11px] uppercase tracking-widest text-slate-500">
      {children}
    </h2>
  )
}
