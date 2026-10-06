import { describe, expect, it } from 'vitest'
import { annualCostAllocation, costRateBreakdown, jobLaborCostRows, splitCost } from './costAllocation'

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
  it('counts overhead once and preserves partial actuals and disabled installation', () => {
    const settings = { cost_shop_rate: 100.25, cost_labor_share: 122000 / 398800 }
    const rows = jobLaborCostRows(settings, 5914.75, 0, 0, null)
    expect(rows.reduce((total, row) => total + row.estimated, 0)).toBeCloseTo(5914.75)
    expect(rows[1]).toEqual({ label: 'Install labor', estimated: 0, actual: null })
    expect(rows[0].actual).toBe(0)
    expect(rows[2].actual).toBe(0)
    expect(jobLaborCostRows(settings, 5914.75, 1503.75).every(row => row.actual === null)).toBe(true)
    const both = jobLaborCostRows(settings, 5914.75, 1503.75, 501.25, 200.5)
    expect(both.reduce((total, row) => total + row.estimated, 0)).toBeCloseTo(7418.5)
    expect(both.reduce((total, row) => total + row.actual!, 0)).toBeCloseTo(701.75)
  })
  it('retains combined rows when an allocation has not been configured', () => {
    const rows = jobLaborCostRows({ cost_shop_rate: 30 }, 60, 30, null, 0)
    expect(rows).toEqual([
      { label: 'Shop labor + overhead', estimated: 60, actual: null },
      { label: 'Install labor + overhead', estimated: 30, actual: 0 },
    ])
  })
})
