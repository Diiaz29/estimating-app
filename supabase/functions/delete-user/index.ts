// Removes a team member's login. Admin-only; you can never remove yourself,
// which also guarantees the last admin can't be deleted.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const {
    data: { user },
  } = await caller.auth.getUser()
  if (!user) return json(401, { error: 'Not signed in' })

  const { data: profile } = await caller
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'admin') return json(403, { error: 'Admins only' })

  const { user_id } = await req.json().catch(() => ({}))
  if (typeof user_id !== 'string' || user_id.length === 0) {
    return json(400, { error: 'user_id is required' })
  }
  if (user_id === user.id) {
    return json(400, { error: "You can't remove your own login." })
  }

  const admin = createClient(supabaseUrl, serviceKey)
  const { error } = await admin.auth.admin.deleteUser(user_id)
  if (error) return json(400, { error: error.message })

  return json(200, { ok: true })
})
