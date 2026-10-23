import { describe, expect, it } from 'vitest'
import { calendarDays, eventValidation, sortEvents } from './calendar'
import type { CalendarEvent } from './calendar'

const event: CalendarEvent = { id:'test', bid_id:null, kind:'custom', title:'Site visit', event_date:'2026-10-22', event_time:null, notes:'' }
describe('team calendar', () => {
  it('covers a six-week month including adjacent days', () => {
    const days = calendarDays(new Date(2026, 7, 1))
    expect(days).toHaveLength(42)
    expect(days[0]).toBe('2026-07-26')
    expect(days.at(-1)).toBe('2026-09-05')
  })
  it('includes leap days without UTC date shifts', () => {
    expect(calendarDays(new Date(2028, 1, 1))).toContain('2028-02-29')
    expect(eventValidation({...event,event_date:'2028-02-29'})).toBeNull()
    expect(eventValidation({...event,event_date:'2026-02-29'})).not.toBeNull()
  })
  it('requires a job for build and installation dates but not custom events', () => {
    expect(eventValidation(event)).toBeNull()
    expect(eventValidation({...event,kind:'build'})).not.toBeNull()
    expect(eventValidation({...event,kind:'install',bid_id:'job'})).toBeNull()
    expect(eventValidation({...event,title:'  '})).not.toBeNull()
  })
  it('validates times and orders all-day events before timed events without mutating input', () => {
    expect(eventValidation({...event,event_time:'25:00'})).not.toBeNull()
    const rows = [{...event,id:'late',event_time:'15:00'}, {...event,id:'early',event_time:'09:00'},event]
    expect(sortEvents(rows).map(e=>e.id)).toEqual(['test','early','late'])
    expect(rows[0].id).toBe('late')
  })
})
