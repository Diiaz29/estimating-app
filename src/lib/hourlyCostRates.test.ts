import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { hourlyCostRateValues, writeHourlyCostRates } from './hourlyCostRates'
import { costRateBreakdown, jobLaborCostRows } from './costAllocation'

describe('manual hourly cost rates', () => {
  it('keeps either component independent and reconciles job costs', () => {
    const values = hourlyCostRateValues('35', '69.58')
    expect(values.combined).toBe(104.58)
    const settings = { cost_shop_rate: values.combined, cost_labor_share: values.share }
    expect(costRateBreakdown(settings)?.labor).toBe(35)
    expect(costRateBreakdown(settings)?.overhead).toBeCloseTo(69.58)
    const rows = jobLaborCostRows(settings, 1045.8, 209.16)
    expect(rows[0].estimated).toBe(350)
    expect(rows[1].estimated).toBe(70)
    expect(rows[2].estimated).toBeCloseTo(834.96)
    expect(rows.reduce((sum, row) => sum + row.estimated, 0)).toBeCloseTo(1254.96)
    expect(hourlyCostRateValues('35', '20').combined).toBe(55)
  })
  it('supports zero rates and rejects incomplete or invalid drafts', () => {
    expect(hourlyCostRateValues('0', '0')).toEqual({ combined: 0, share: 0 })
    expect(hourlyCostRateValues('0', '40')).toEqual({ combined: 40, share: 0 })
    expect(hourlyCostRateValues('40', '0')).toEqual({ combined: 40, share: 1 })
    for (const invalid of ['', ' ', '-1', 'Infinity', 'NaN']) expect(() => hourlyCostRateValues(invalid, '40')).toThrow()
  })
  it('saves sum and share together and only confirms both saved rows', async () => {
    const select = vi.fn().mockResolvedValue({ data: [{ key: 'cost_shop_rate' }, { key: 'cost_labor_share' }], error: null })
    const upsert = vi.fn().mockReturnValue({ select })
    const client = { from: vi.fn().mockReturnValue({ upsert }) } as unknown as SupabaseClient
    await expect(writeHourlyCostRates(client, '30', '20')).resolves.toEqual({ combined: 50, share: 0.6 })
    expect(upsert).toHaveBeenCalledTimes(1)
    expect(upsert.mock.calls[0][0].map((row: { key: string; value: number }) => [row.key, row.value])).toEqual([['cost_shop_rate', 50], ['cost_labor_share', 0.6]])
    select.mockResolvedValueOnce({ data: null, error: { message: 'Save failed' } })
    await expect(writeHourlyCostRates(client, '30', '20')).rejects.toThrow('Save failed')
    select.mockResolvedValueOnce({ data: [], error: null })
    await expect(writeHourlyCostRates(client, '30', '20')).rejects.toThrow('not confirmed saved')
  })
})
