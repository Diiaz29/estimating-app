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

import { eventOnDay, moveEventRange } from './calendar'
describe('multi-day events', () => {
  const range = { ...event, event_date: '2026-10-30', end_date: '2026-11-03' }
  it('includes both endpoints and spans months without creating separate records', () => {
    expect(['2026-10-29','2026-10-30','2026-11-01','2026-11-03','2026-11-04'].map(day => eventOnDay(range, day))).toEqual([false,true,true,true,false])
    expect(eventOnDay(event, event.event_date)).toBe(true)
    expect(eventValidation({...range,end_date:'2026-10-29'})).not.toBeNull()
  })
  it('moves the entire range relative to the occurrence dragged, preserving its identity', () => {
    const moved = moveEventRange(range, '2026-11-01', '2026-11-05')
    expect(moved).toMatchObject({id:range.id,event_date:'2026-11-03',end_date:'2026-11-07'})
    expect(range.event_date).toBe('2026-10-30')
  })
  it('preserves calendar duration across daylight saving boundaries', () => {
    expect(moveEventRange({...event,event_date:'2026-03-07',end_date:'2026-03-10'}, '2026-03-08','2026-03-09')).toMatchObject({event_date:'2026-03-08',end_date:'2026-03-11'})
  })
})
