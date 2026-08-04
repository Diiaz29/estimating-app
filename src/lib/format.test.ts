import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  daysSince,
  fmtCost,
  fmtMoney,
  formatPhone,
  isOverdue,
  nextJobNumber,
  settingFromDisplay,
  settingToDisplay,
  settingSuffix,
} from './format'

describe('fmtMoney', () => {
  it('formats dollars with cents', () => {
    expect(fmtMoney(1234.5)).toBe('$1,234.50')
    expect(fmtMoney(0)).toBe('$0.00')
  })
  it('shows an em dash for null/undefined', () => {
    expect(fmtMoney(null)).toBe('—')
    expect(fmtMoney(undefined)).toBe('—')
  })
})

describe('fmtCost', () => {
  it('keeps 2 places for normal costs', () => {
    expect(fmtCost(2.69)).toBe('$2.69')
  })
  it('extends to 4 places for tiny per-unit costs', () => {
    expect(fmtCost(0.0425)).toBe('$0.0425')
  })
  it('shows an em dash for null', () => {
    expect(fmtCost(null)).toBe('—')
  })
})

describe('formatPhone', () => {
  it('formats progressively as digits arrive', () => {
    expect(formatPhone('5')).toBe('(5')
    expect(formatPhone('555')).toBe('(555')
    expect(formatPhone('555123')).toBe('(555) 123')
    expect(formatPhone('5551234')).toBe('(555) 123-4')
    expect(formatPhone('5551234567')).toBe('(555) 123-4567')
  })
  it('drops non-digits and extra characters', () => {
    expect(formatPhone('(555) 123-4567 x99')).toBe('(555) 123-4567')
    expect(formatPhone('')).toBe('')
  })
})

describe('settings display transforms', () => {
  it('round-trips a percent 0.03 ⇄ 3', () => {
    expect(settingToDisplay(0.03, 'percent')).toBe(3)
    expect(settingFromDisplay(3, 'percent')).toBeCloseTo(0.03, 10)
  })
  it('leaves non-percent formats untouched', () => {
    expect(settingToDisplay(45, 'money')).toBe(45)
    expect(settingFromDisplay(45, 'money')).toBe(45)
  })
  it('maps a suffix per format', () => {
    expect(settingSuffix('percent')).toBe('%')
    expect(settingSuffix('miles')).toBe('mi')
    expect(settingSuffix('number')).toBe('')
  })
})

describe('nextJobNumber', () => {
  const yy = String(new Date().getFullYear()).slice(2)
  it('starts at 001 for a fresh year', () => {
    expect(nextJobNumber([])).toBe(`${yy}-001`)
  })
  it('continues from the max of this year, ignoring other years and junk', () => {
    expect(nextJobNumber([`${yy}-001`, `${yy}-041`, '24-999', 'garbage'])).toBe(`${yy}-042`)
  })
})

describe('daysSince / isOverdue (time-dependent)', () => {
  afterEach(() => vi.useRealTimers())

  it('counts whole days since a timestamp', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-11T00:00:00Z'))
    expect(daysSince('2026-01-01T00:00:00Z')).toBe(10)
  })

  it('flags an active bid past its due date, not a finished one', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-23T12:00:00Z'))
    expect(isOverdue({ due_at: '2026-07-20T12:00:00Z', status: 'pricing' })).toBe(true)
    expect(isOverdue({ due_at: '2026-07-25T12:00:00Z', status: 'pricing' })).toBe(false)
    // won/lost never count as overdue even if the date passed
    expect(isOverdue({ due_at: '2026-07-20T12:00:00Z', status: 'won' })).toBe(false)
    expect(isOverdue({ due_at: null, status: 'pricing' })).toBe(false)
  })
})
