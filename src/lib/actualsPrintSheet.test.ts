import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import ActualsPrintSheet from '../components/ActualsPrintSheet'
import { jobLaborCostRows } from './costAllocation'

const props = {
  jobNumber: 'TEST', jobName: 'Print fixture',
  rows: [{ label: 'Materials', estimated: 100, actual: 0 }],
  estimatedTotal: 100, actualTotal: 0,
  shopHours: 0, installHours: 0, laborRate: 30,
  estimatedShopHours: 2, estimatedInstallHours: 1,
  contract: 500, showProfit: true, liveContract: false,
  receiptCount: 1, missingAmounts: 0, notes: null,
}
describe('actual job cost print sheet', () => {
  it('shows allocation without changing totals or inventing disabled install cost', () => {
    const report = renderToStaticMarkup(createElement(ActualsPrintSheet, {
      ...props, costSettings: { cost_shop_rate: 30, cost_labor_share: 0.4 },
      rows: jobLaborCostRows({ cost_shop_rate: 30, cost_labor_share: 0.4 }, 60, 0, 0, null),
    }))
    expect(report).toContain('Shop labor')
    expect(report).toContain('Overhead (shop + install)')
    expect(report).toContain('$24.00')
    expect(report).toContain('$36.00')
    expect(report).toContain('Both are included in total cost')
  })
  it('keeps zero actuals distinct from unrecorded values', () => {
    const recorded = renderToStaticMarkup(createElement(ActualsPrintSheet, props))
    expect(recorded).toContain('$0.00')
    expect(recorded).not.toContain('Actuals are incomplete')
    const unrecorded = renderToStaticMarkup(createElement(ActualsPrintSheet, { ...props, rows: [{ label: 'Materials', estimated: 100, actual: null }], actualTotal: null }))
    expect(unrecorded).toContain('Actuals are incomplete')
    expect(unrecorded).toContain('—')
  })
  it('omits contract, profit and margin for Office copies', () => {
    const office = renderToStaticMarkup(createElement(ActualsPrintSheet, { ...props, showProfit: false }))
    expect(office).not.toContain('Contract amount')
    expect(office).not.toContain('Margin')
    expect(office).not.toContain('$500.00')
    expect(office).toContain('Total cost')
  })
  it('flags receipts without amounts and escapes notes', () => {
    const report = renderToStaticMarkup(createElement(ActualsPrintSheet, { ...props, missingAmounts: 1, notes: '<script>example</script>' }))
    expect(report).toContain('no amount and count as $0')
    expect(report).not.toContain('<script>')
    expect(report).toContain('&lt;script&gt;example&lt;/script&gt;')
  })
})
