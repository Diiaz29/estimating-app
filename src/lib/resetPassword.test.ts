import { describe, expect, it, vi } from 'vitest'
import { createResetPasswordHandler } from '../../supabase/functions/reset-user-password/handler'

const userId = '11111111-1111-4111-8111-111111111111'
function setup(role: string | null = 'admin') {
  const updatePassword = vi.fn().mockResolvedValue(null)
  const getCaller = vi.fn().mockResolvedValue(role === null ? null : { id: userId, role })
  return { handler: createResetPasswordHandler({ getCaller, updatePassword }), updatePassword }
}
function request(body: unknown, authorization = 'Bearer test') {
  return new Request('https://example.com', { method: 'POST', headers: { Authorization: authorization }, body: JSON.stringify(body) })
}

describe('admin password reset authorization', () => {
  it('rejects missing or invalid sessions before updating', async () => {
    const { handler, updatePassword } = setup(null)
    expect((await handler(request({}, ''))).status).toBe(401)
    expect((await handler(request({ user_id: userId, password: 'example-password' }))).status).toBe(401)
    expect(updatePassword).not.toHaveBeenCalled()
  })
  it.each(['viewer', 'office', 'pm', 'estimator'])('blocks %s even when the body claims admin', async (role) => {
    const { handler, updatePassword } = setup(role)
    expect((await handler(request({ user_id: userId, password: 'example-password', role: 'admin' }))).status).toBe(403)
    expect(updatePassword).not.toHaveBeenCalled()
  })
  it('rejects invalid targets and passwords', async () => {
    const { handler, updatePassword } = setup()
    for (const body of [null, { user_id: 'bad', password: 'example-password' }, { user_id: userId, password: 'short' }, { user_id: userId, password: ' '.repeat(8) }, { user_id: userId, password: 'x'.repeat(129) }]) {
      expect((await handler(request(body))).status).toBe(400)
    }
    expect(updatePassword).not.toHaveBeenCalled()
  })
  it('updates the requested user only after authorization and never returns the password', async () => {
    const { handler, updatePassword } = setup()
    const response = await handler(request({ user_id: userId, password: 'example-password' }))
    expect(response.status).toBe(200)
    expect(updatePassword).toHaveBeenCalledExactlyOnceWith(userId, 'example-password')
    expect(await response.json()).toEqual({ success: true })
  })
  it('reports an upstream rejection without claiming success', async () => {
    const { handler, updatePassword } = setup()
    updatePassword.mockResolvedValue('Password rejected')
    const response = await handler(request({ user_id: userId, password: 'example-password' }))
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Password rejected' })
  })
})
