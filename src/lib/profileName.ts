import type { Profile } from './types'

export function profileName(profile: Pick<Profile, 'email' | 'first_name' | 'last_name'>) {
  return [profile.first_name?.trim(), profile.last_name?.trim()].filter(Boolean).join(' ') || profile.email
}
