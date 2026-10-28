import { createClient } from 'npm:@supabase/supabase-js@2.110.1'
import { createFirstLoginHandler } from './handler.ts'
Deno.serve(createFirstLoginHandler({
  async getCaller(authorization) {
    const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } })
    const { data: { user }, error } = await client.auth.getUser()
    return error || !user ? null : { id: user.id, required: user.app_metadata?.must_change_password === true }
  },
  async complete(id, password) {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } })
    // Both changes are applied together; a rejected password cannot clear the requirement.
    const { error } = await admin.auth.admin.updateUserById(id, { password, app_metadata: { must_change_password: false } })
    return error?.message ?? null
  },
}))
