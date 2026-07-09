import { daysSince } from '../lib/format'

/** Amber "price is old" badge, shown once a cost is older than the staleness setting. */
export function StaleBadge({ costUpdatedAt, thresholdDays }: { costUpdatedAt: string; thresholdDays: number }) {
  const days = daysSince(costUpdatedAt)
  if (days < thresholdDays) return null
  return (
    <span
      title={`Price last updated ${days} days ago — worth re-checking with the supplier.`}
      className="inline-block rounded border border-amber-400 bg-amber-50 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-amber-800"
    >
      {days}d old
    </span>
  )
}

export function GroupTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2 mt-6 first:mt-0 font-mono text-[11px] uppercase tracking-widest text-slate-500">
      {children}
    </h2>
  )
}
