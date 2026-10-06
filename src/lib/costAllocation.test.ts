import { describe, expect, it } from 'vitest'
import { annualCostAllocation, costRateBreakdown, splitCost } from './costAllocation'

describe('labor and overhead allocation', () => {
  it('annualizes monthly costs and supports mixed salaries without changing total', () => {
    const result = annualCostAllocation([
      { id: '1', name: 'Salary', amount: 80000, period: 'yearly', sort_order: 0, labor_pct: 25 },
      { id: '2', name: 'Rent', amount: 8000, period: 'monthly', sort_order: 1, labor_pct: 0 },
      { id: '3', name: 'Crew', amount: 122000, period: 'yearly', sort_order: 2, labor_pct: 100 },
    ])
    expect(result.total).toBe(298000)
    expect(result.labor).toBe(142000)
    expect(result.labor + result.overhead).toBe(result.total)
  })
  it('preserves the applied rate and reconciles the cents', () => {
    const rates = costRateBreakdown({ cost_shop_rate: 40.10, cost_labor_share: 122000 / 398800 })!
    expect(rates.labor).toBe(12.27)
    expect(rates.overhead).toBeCloseTo(27.83)
    const cost = splitCost(1142.85, rates.share)
    expect(cost.labor + cost.overhead).toBeCloseTo(1142.85)
  })
  it('keeps legacy rates usable without inventing a split', () => {
    expect(costRateBreakdown({ cost_shop_rate: 40.1 })).toBeNull()
    expect(splitCost(0, 0)).toEqual({ labor: 0, overhead: 0 })
  })
})
