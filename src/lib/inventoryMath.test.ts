import { describe, expect, it } from 'vitest'
import { quantityNeeded, needsWeeklyCheck } from './inventoryMath'

describe('shop inventory', () => {
  it('shows the shortage, including fractional units, without negative ordering', () => {
    expect(quantityNeeded(3, 10)).toBe(7)
    expect(quantityNeeded(10, 10)).toBe(0)
    expect(quantityNeeded(12, 10)).toBe(0)
    expect(quantityNeeded(0, 0)).toBe(0)
    expect(quantityNeeded(0.1, 0.3)).toBe(0.2)
  })
  it('flags counts after seven elapsed days, not just a change of calendar week', () => {
    const checked = '2026-11-06T18:00:00Z'
    expect(needsWeeklyCheck(checked, Date.parse('2026-11-13T17:59:59Z'))).toBe(false)
    expect(needsWeeklyCheck(checked, Date.parse('2026-11-13T18:00:00Z'))).toBe(true)
  })
})
