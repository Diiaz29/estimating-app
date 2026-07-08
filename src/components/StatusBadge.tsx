import type { BidStatus } from '../lib/types'
import { statusMeta } from '../lib/format'

export default function StatusBadge({ status }: { status: BidStatus }) {
  const meta = statusMeta(status)
  return (
    <span
      className={`inline-block rounded border px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider ${meta.badge}`}
    >
      {meta.label}
    </span>
  )
}
