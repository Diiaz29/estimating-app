import { expect, it } from 'vitest'
import { timeEntryName } from './timeEntryName'

const profiles = [{ email: 'bdiaz@example.com', first_name: 'Brandon', last_name: 'Diaz' }]
it('resolves older username entries through their creating account', () => {
  expect(timeEntryName({ worker: 'bdiaz', created_by: 'BDIAZ@example.com' }, profiles)).toBe('Brandon Diaz')
})
it('keeps shared workers separate from their login owner', () => {
  expect(timeEntryName({ worker: 'Jorge Huerta', created_by: 'bdiaz@example.com', shop_worker_id: 'worker-id' }, profiles)).toBe('Jorge Huerta')
})
it('preserves the recorded person when their account is unavailable', () => {
  expect(timeEntryName({ worker: 'Former Worker', created_by: null }, profiles)).toBe('Former Worker')
})
