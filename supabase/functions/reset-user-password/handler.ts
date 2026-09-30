const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface Dependencies {
  getCaller: (authorization: string) => Promise<{ id: string; role: string | null } | null>
  updatePassword: (userId: string, password: string) => Promise<string | null>
}

export function createResetPasswordHandler(deps: Dependencies) {
  const json = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
    if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })
    try {
      const authorization = req.headers.get('Authorization') ?? ''
      if (!authorization.startsWith('Bearer ')) return json(401, { error: 'Not signed in' })
      const caller = await deps.getCaller(authorization)
      if (!caller) return json(401, { error: 'Not signed in' })
      if (caller.role !== 'admin') return json(403, { error: 'Admins only' })
      const body = await req.json().catch(() => null)
      if (!body || typeof body.user_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.user_id)) {
        return json(400, { error: 'A valid user ID is required' })
      }
      if (typeof body.password !== 'string' || body.password.length < 8 || body.password.length > 128 || !body.password.trim()) {
        return json(400, { error: 'Password must be between 8 and 128 characters' })
      }
      const error = await deps.updatePassword(body.user_id, body.password)
      if (error) return json(400, { error })
      return json(200, { success: true })
    } catch {
      return json(500, { error: 'Could not reset the password. Please try again.' })
    }
  }
}
