import { createClient } from 'npm:@supabase/supabase-js@2.110.1'
import { createResetPasswordHandler } from './handler.ts'

Deno.serve(createResetPasswordHandler({
  async getCaller(authorization) {
    const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: { user }, error } = await client.auth.getUser()
    if (error || !user) return null
    const { data: profile } = await client.from('profiles').select('role').eq('id', user.id).single()
    return { id: user.id, role: profile?.role ?? null }
  },
  async updatePassword(userId, password) {
    // The privileged key stays on the server; authorization above uses the caller's real profile.
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { error } = await admin.auth.admin.updateUserById(userId, { password })
    return error?.message ?? null
  },
}))
