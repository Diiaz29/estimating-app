import { describe, expect, it } from 'vitest'
import { timeWeek } from './timeWeek'

describe('timeWeek', () => {
  it('includes Monday and Sunday in the same week', () => {
    const week = { start: '2026-11-09', end: '2026-11-15' }
    expect(timeWeek('2026-11-09')).toEqual(week)
    expect(timeWeek('2026-11-13')).toEqual(week)
    expect(timeWeek('2026-11-15')).toEqual(week)
  })
  it('moves through year boundaries without gaps', () => {
    expect(timeWeek('2027-01-01')).toEqual({ start: '2026-12-28', end: '2027-01-03' })
    expect(timeWeek('2026-12-28', 1)).toEqual({ start: '2027-01-04', end: '2027-01-10' })
    expect(timeWeek('2027-01-04', -1)).toEqual({ start: '2026-12-28', end: '2027-01-03' })
  })
  it('uses calendar days across daylight-saving changes and leap days', () => {
    expect(timeWeek('2026-03-08')).toEqual({ start: '2026-03-02', end: '2026-03-08' })
    expect(timeWeek('2026-11-01')).toEqual({ start: '2026-10-26', end: '2026-11-01' })
    expect(timeWeek('2028-02-29')).toEqual({ start: '2028-02-28', end: '2028-03-05' })
  })
})
