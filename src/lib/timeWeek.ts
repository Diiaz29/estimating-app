import { parseDay, toDay } from './schedule'

/** Monday through Sunday in local calendar days, including daylight-saving weeks. */
export function timeWeek(day: string, offset = 0) {
  const start = parseDay(day)
  start.setDate(start.getDate() - (start.getDay() + 6) % 7 + offset * 7)
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  return { start: toDay(start), end: toDay(end) }
}
