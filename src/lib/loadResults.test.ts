import { describe, expect, it } from 'vitest'
import { requireLoaded } from './loadResults'

describe('dependent financial reads', () => {
  it('rejects a failed dependent read even when the main record succeeded', () => {
    expect(() => requireLoaded({ Project: { error: null }, 'Actual hours': { error: { message: 'offline' } } })).toThrow('Actual hours: offline')
  })
  it('allows successfully loaded empty results', () => {
    expect(() => requireLoaded({ Receipts: { error: null }, Revision: { error: null } })).not.toThrow()
  })
})
