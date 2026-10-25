import { describe, expect, it } from 'vitest'
import { canUseChangeList } from './changeListAccess'

describe('private change list access', () => {
  it('allows only the two explicitly authorized accounts', () => {
    expect(canUseChangeList('1029706b-1888-4ffa-8fe8-f77a2bfe0295')).toBe(true)
    expect(canUseChangeList('d3180a9a-68cb-4286-a789-d399b486ed15')).toBe(true)
    expect(canUseChangeList('04315e5c-f9cc-497a-898b-023ed99f24a1')).toBe(false)
    expect(canUseChangeList()).toBe(false)
    expect(canUseChangeList('')).toBe(false)
  })
})
