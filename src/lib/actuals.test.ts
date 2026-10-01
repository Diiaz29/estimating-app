import { describe, expect, it } from 'vitest'
import { actualsLaborCosts } from './actuals'

describe('actuals labor costs', () => {
  it('uses the cost rate for shop and install while keeping estimated fuel separate', () => {
    const costs = actualsLaborCosts({ cost_shop_rate: 30, install_rate: 70 }, 8, 10, 12, 900, true)
    expect(costs).toEqual({ rate: 30, shopLabor: 240, installLabor: 300,
      estimatedInstallLabor: 360, estimatedFuel: 60, estimatedInstallCost: 420 })
  })
  it('follows the configured cost rate and never falls back to the charge rate', () => {
    expect(actualsLaborCosts({ cost_shop_rate: 42, install_rate: 70 }, 2, 2, 0, 0, true).installLabor).toBe(84)
    expect(actualsLaborCosts({ install_rate: 70 }, null, 2, 0, 0, true).installLabor).toBe(0)
  })
  it('does not invent estimated labor or negative fuel for a disabled install adder', () => {
    const costs = actualsLaborCosts({ cost_shop_rate: 30, install_rate: 70 }, null, 2, 12, 0, false)
    expect(costs.estimatedInstallCost).toBe(0)
    expect(costs.estimatedFuel).toBe(0)
    expect(costs.installLabor).toBe(60)
  })
})
