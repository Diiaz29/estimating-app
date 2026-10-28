const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
interface Dependencies {
  getCaller: (authorization: string) => Promise<{ id: string; required: boolean } | null>
  complete: (id: string, password: string) => Promise<string | null>
}
export function createFirstLoginHandler(deps: Dependencies) {
  const json = (status: number, body: object) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
  return async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
    if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })
    try {
      const authorization = req.headers.get('Authorization')
      const user = authorization ? await deps.getCaller(authorization) : null
      if (!user) return json(401, { error: 'Please sign in again.' })
      if (!user.required) return json(403, { error: 'This account does not need first-login setup.' })
      const body = await req.json().catch(() => null)
      if (typeof body?.password !== 'string' || body.password.length < 8 || body.password.length > 128 || !body.password.trim()) return json(400, { error: 'Use a password between 8 and 128 characters.' })
      const error = await deps.complete(user.id, body.password)
      return error ? json(400, { error }) : json(200, { success: true })
    } catch { return json(500, { error: 'Your password was not confirmed. Please try again.' }) }
  }
}
