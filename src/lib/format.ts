import type { BidStatus } from './types'

export const STATUSES: { value: BidStatus; label: string; badge: string }[] = [
  { value: 'received', label: 'Received', badge: 'bg-slate-100 text-slate-700 border-slate-300' },
  { value: 'takeoff', label: 'Takeoff', badge: 'bg-amber-50 text-amber-800 border-amber-300' },
  { value: 'pricing', label: 'Pricing', badge: 'bg-blue-50 text-blue-800 border-blue-300' },
  { value: 'sent', label: 'Sent', badge: 'bg-violet-50 text-violet-800 border-violet-300' },
  { value: 'won', label: 'Won', badge: 'bg-emerald-50 text-emerald-800 border-emerald-300' },
  { value: 'lost', label: 'Lost', badge: 'bg-red-50 text-red-700 border-red-300' },
]

export const statusMeta = (s: BidStatus) => STATUSES.find((x) => x.value === s) ?? STATUSES[0]

/** Statuses that count as "in the pipeline" (not finished). */
export const ACTIVE_STATUSES: BidStatus[] = ['received', 'takeoff', 'pricing', 'sent']

export function fmtDueDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return `${date} · ${time}`
}

export function isOverdue(bid: { due_at: string | null; status: BidStatus }): boolean {
  if (!bid.due_at) return false
  if (!ACTIVE_STATUSES.includes(bid.status)) return false
  return new Date(bid.due_at).getTime() < Date.now()
}

export function fmtMoney(n: number | null | undefined): string {
  if (n == null) return '—'
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

/** Formats a phone number as (000) 000-0000 while typing; extra characters are dropped. */
export function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 10)
  if (d.length === 0) return ''
  if (d.length <= 3) return `(${d}`
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
}

/** Next job number in YY-### format, continuing from whatever exists this year. */
export function nextJobNumber(existing: string[]): string {
  const yy = String(new Date().getFullYear()).slice(2)
  const prefix = `${yy}-`
  let max = 0
  for (const jn of existing) {
    if (jn.startsWith(prefix)) {
      const n = parseInt(jn.slice(prefix.length), 10)
      if (!Number.isNaN(n) && n > max) max = n
    }
  }
  return `${prefix}${String(max + 1).padStart(3, '0')}`
}
