import { describe, expect, it, vi } from 'vitest'
vi.mock('./supabase', () => ({ supabase: null }))
import { milestoneDates } from './calendarJobDates'
describe('automatic calendar job dates', () => {
  it('skips weekends and holidays for build time, then adds exactly seven calendar days', () => {
    expect(milestoneDates('2026-10-23', 2, new Set(['2026-10-26']))).toEqual({ ready: '2026-10-28', install: '2026-11-04' })
  })
  it('starts weekend requests on the next working day and handles year rollover', () => {
    expect(milestoneDates('2026-12-26', 4, new Set(['2027-01-01']))).toEqual({ ready: '2027-01-04', install: '2027-01-11' })
  })
  it('rejects missing or invalid build estimates', () => {
    for (const days of [0, -1, NaN, Infinity]) expect(() => milestoneDates('2026-10-22', days, new Set())).toThrow()
  })
})
