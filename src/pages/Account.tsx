import ProfileNameForm from '../components/ProfileNameForm'
import { useAuth } from '../lib/auth'

export default function Account() {
  const { profile, refreshProfile } = useAuth()
  if (!profile) return <p className="text-sm text-slate-500">Loading…</p>
  return (
    <div className="zaid-page zaid-account max-w-2xl">
      <h1>My profile</h1>
      <ProfileNameForm key={profile.id} profile={profile} onSaved={refreshProfile} />
    </div>
  )
}
