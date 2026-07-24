import type { BidStatus, SettingFormat } from './types'

export const STATUSES: { value: BidStatus; label: string; badge: string }[] = [
  { value: 'received', label: 'Received', badge: 'bg-slate-100 text-slate-700 border-slate-300' },
  { value: 'working', label: 'Working', badge: 'bg-amber-50 text-amber-800 border-amber-300' },
  { value: 'sent', label: 'Sent', badge: 'bg-violet-50 text-violet-800 border-violet-300' },
  { value: 'won', label: 'Won', badge: 'bg-emerald-50 text-emerald-800 border-emerald-300' },
  { value: 'lost', label: 'Lost', badge: 'bg-red-50 text-red-700 border-red-300' },
]

export const statusMeta = (s: BidStatus) => STATUSES.find((x) => x.value === s) ?? STATUSES[0]

/** Statuses that count as "in the pipeline" (not finished). */
export const ACTIVE_STATUSES: BidStatus[] = ['received', 'working', 'sent']

export function fmtDueDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return `${date} · ${time}`
}

export function isOverdue(bid: { due_at: string | null; status: BidStatus }): boolean {
  if (!bid.due_at) return false
  // Sent bids are out of our hands — they get a follow-up reminder, not a red date
  if (!['received', 'working'].includes(bid.status)) return false
  return new Date(bid.due_at).getTime() < Date.now()
}

/** When a sent bid should be followed up: sent_at + per-bid days (or the Settings default). */
export function followUpAt(
  bid: { status: BidStatus; sent_at: string | null; followup_days: number | null },
  defaultDays: number,
): Date | null {
  if (bid.status !== 'sent' || !bid.sent_at) return null
  const days = bid.followup_days ?? defaultDays
  return new Date(new Date(bid.sent_at).getTime() + days * 86_400_000)
}

export function fmtFollowUp(d: Date): string {
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function fmtMoney(n: number | null | undefined): string {
  if (n == null) return '—'
  return n.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/** Formats a phone number as (000) 000-0000 while typing; extra characters are dropped. */
export function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 10)
  if (d.length === 0) return ''
  if (d.length <= 3) return `(${d}`
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
}

/** Days since an ISO timestamp, rounded down. */
export function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

/** Cost with cents, for library prices ($2.69, $0.0425 kept to 4 places when tiny). */
export function fmtCost(n: number | null | undefined): string {
  if (n == null) return '—'
  const digits = n !== 0 && Math.abs(n) < 0.1 ? 4 : 2
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: digits })
}

/** Display transform for a setting: percent stored 0.03 ⇄ shown 3. */
export function settingToDisplay(value: number, format: SettingFormat): number {
  return format === 'percent' ? Math.round(value * 10000) / 100 : value
}
export function settingFromDisplay(display: number, format: SettingFormat): number {
  return format === 'percent' ? display / 100 : display
}
export function settingSuffix(format: SettingFormat): string {
  switch (format) {
    case 'percent': return '%'
    case 'money': return '$'
    case 'days': return 'days'
    case 'miles': return 'mi'
    case 'lf': return 'LF'
    case 'factor': return '×'
    default: return ''
  }
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
