// Creates a new team login. Runs on Supabase's servers with admin powers the
// browser app deliberately doesn't have. Only callers whose profile role is
// 'admin' get through.
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

  // Who is asking? (uses the caller's own login token)
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

  const { email, password } = await req.json().catch(() => ({}))
  if (typeof email !== 'string' || !email.includes('@')) {
    return json(400, { error: 'A valid email is required' })
  }
  if (typeof password !== 'string' || password.length < 8) {
    return json(400, { error: 'Password must be at least 8 characters' })
  }

  // The service-role client may create users; it never leaves this server.
  const admin = createClient(supabaseUrl, serviceKey)
  const { data, error } = await admin.auth.admin.createUser({
    email: email.trim().toLowerCase(),
    password,
    email_confirm: true,
  })
  if (error) return json(400, { error: error.message })

  return json(200, { id: data.user.id, email: data.user.email })
})
