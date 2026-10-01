import { describe, expect, it } from 'vitest'
import { validateSettingDraft } from './settingValidation'

describe('settings input validation', () => {
  it('does not silently turn cleared fields into zero', () => {
    expect(validateSettingDraft('', 'tax_rate')).toBeTruthy()
    expect(validateSettingDraft(' ', 'tax_rate')).toBeTruthy()
  })
  it('accepts explicit zero and decimals, but rejects invalid numbers', () => {
    expect(validateSettingDraft('0', 'tax_rate')).toBeNull()
    expect(validateSettingDraft('31.51', 'cost_shop_rate')).toBeNull()
    expect(validateSettingDraft('-1', 'cost_shop_rate')).toBeTruthy()
    expect(validateSettingDraft('Infinity', 'cost_shop_rate')).toBeTruthy()
  })
})
