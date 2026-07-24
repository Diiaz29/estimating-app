import { describe, expect, it } from 'vitest'
import { completionDate, isWorkday, nextWorkday, parseDay, toDay } from './schedule'

const NO_HOLIDAYS = new Set<string>()

describe('parseDay / toDay round-trip', () => {
  it('parses and reformats an ISO day in local time', () => {
    expect(toDay(parseDay('2026-07-23'))).toBe('2026-07-23')
  })
})

describe('isWorkday', () => {
  it('is false on weekends', () => {
    // 2026-07-25 is a Saturday, 07-26 a Sunday
    expect(isWorkday(parseDay('2026-07-25'), NO_HOLIDAYS)).toBe(false)
    expect(isWorkday(parseDay('2026-07-26'), NO_HOLIDAYS)).toBe(false)
  })
  it('is true on a plain weekday', () => {
    // 2026-07-23 is a Thursday
    expect(isWorkday(parseDay('2026-07-23'), NO_HOLIDAYS)).toBe(true)
  })
  it('is false on a company holiday', () => {
    expect(isWorkday(parseDay('2026-07-23'), new Set(['2026-07-23']))).toBe(false)
  })
})

describe('completionDate', () => {
  it('advances N working days without counting the start day', () => {
    // Thu 07-23 + 1 business day = Fri 07-24
    expect(toDay(completionDate(parseDay('2026-07-23'), 1, NO_HOLIDAYS))).toBe('2026-07-24')
  })
  it('skips the weekend', () => {
    // Fri 07-24 + 1 business day = Mon 07-27 (skips Sat/Sun)
    expect(toDay(completionDate(parseDay('2026-07-24'), 1, NO_HOLIDAYS))).toBe('2026-07-27')
  })
  it('skips holidays as well as weekends', () => {
    // Thu 07-23 + 1 business day, but Fri 07-24 is a holiday → Mon 07-27
    expect(toDay(completionDate(parseDay('2026-07-23'), 1, new Set(['2026-07-24'])))).toBe('2026-07-27')
  })
  it('returns the start day for zero (or negative) days', () => {
    expect(toDay(completionDate(parseDay('2026-07-23'), 0, NO_HOLIDAYS))).toBe('2026-07-23')
    expect(toDay(completionDate(parseDay('2026-07-23'), -5, NO_HOLIDAYS))).toBe('2026-07-23')
  })
  it('counts a full work week as 5 business days', () => {
    // Mon 07-20 + 5 business days = Mon 07-27
    expect(toDay(completionDate(parseDay('2026-07-20'), 5, NO_HOLIDAYS))).toBe('2026-07-27')
  })
})

describe('nextWorkday', () => {
  it('returns the same day when it is already a workday', () => {
    expect(toDay(nextWorkday(parseDay('2026-07-23'), NO_HOLIDAYS))).toBe('2026-07-23')
  })
  it('rolls a Saturday forward to Monday', () => {
    expect(toDay(nextWorkday(parseDay('2026-07-25'), NO_HOLIDAYS))).toBe('2026-07-27')
  })
  it('rolls past a holiday', () => {
    // Fri 07-24 is a holiday → next workday Mon 07-27
    expect(toDay(nextWorkday(parseDay('2026-07-24'), new Set(['2026-07-24'])))).toBe('2026-07-27')
  })
})
