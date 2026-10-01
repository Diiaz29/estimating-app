import { describe, expect, it } from 'vitest'
import { profileName } from './profileName'
import { validatedNames } from '../../supabase/functions/_shared/profile-names'

describe('account names', () => {
  it('uses entered names instead of deriving a name from the email', () => {
    expect(profileName({ first_name: ' Anne-Marie ', last_name: ' O’Neill ', email: 'am@example.com' })).toBe('Anne-Marie O’Neill')
  })
  it('keeps existing unnamed accounts identifiable', () => {
    expect(profileName({ email: 'bdiaz@example.com' })).toBe('bdiaz@example.com')
  })
  it('validates and trims names before user creation', () => {
    expect(validatedNames(' José ', ' de la Cruz ')).toEqual({ first_name: 'José', last_name: 'de la Cruz' })
    expect(validatedNames(' ', 'Diaz')).toBeNull()
    expect(validatedNames('Brandon', undefined)).toBeNull()
    expect(validatedNames(7, 'Diaz')).toBeNull()
    expect(validatedNames('a'.repeat(81), 'Diaz')).toBeNull()
  })
})
