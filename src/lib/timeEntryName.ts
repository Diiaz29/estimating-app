import { profileName } from './profileName'
import type { Profile } from './types'

export function timeEntryName(entry: { worker: string; created_by: string | null; shop_worker_id?: string | null }, profiles: Pick<Profile, 'email' | 'first_name' | 'last_name'>[]) {
  // Shared workers are separate people, not the owner of the shared login.
  if (entry.shop_worker_id) return entry.worker
  const profile = profiles.find(p => p.email.toLowerCase() === entry.created_by?.toLowerCase())
  return profile ? profileName(profile) : entry.worker
}
