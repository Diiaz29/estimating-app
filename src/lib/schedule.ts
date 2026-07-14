// Business-day date math, matching the V9 Scope of Work sheet:
// completion = start date advanced by N working days (start day itself not counted),
// skipping weekends and company holidays.

export interface JobTask {
  id: string
  bid_id: string
  name: string
  start_date: string | null
  business_days: number
  done: boolean
  sort_order: number
}

export function parseDay(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function toDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function isWorkday(date: Date, holidays: Set<string>): boolean {
  const dow = date.getDay()
  return dow !== 0 && dow !== 6 && !holidays.has(toDay(date))
}

/** Advance `businessDays` working days from `start` (start day not counted). */
export function completionDate(start: Date, businessDays: number, holidays: Set<string>): Date {
  const d = new Date(start)
  let remaining = Math.max(0, Math.round(businessDays))
  while (remaining > 0) {
    d.setDate(d.getDate() + 1)
    if (isWorkday(d, holidays)) remaining--
  }
  return d
}

/** The next working day on or after `date`. */
export function nextWorkday(date: Date, holidays: Set<string>): Date {
  const d = new Date(date)
  while (!isWorkday(d, holidays)) d.setDate(d.getDate() + 1)
  return d
}

export function fmtDay(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}
