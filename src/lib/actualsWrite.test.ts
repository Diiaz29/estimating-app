import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { writeActualsFields } from './actualsWrite'

describe('actuals partial writes', () => {
  function client(error: { message: string } | null = null) {
    const single = vi.fn().mockResolvedValue({ error })
    const select = vi.fn(() => ({ single }))
    const upsert = vi.fn(() => ({ select }))
    const from = vi.fn(() => ({ upsert }))
    return { api: { from } as unknown as SupabaseClient, upsert }
  }
  it('editing shop hours does not send blanks for existing install hours or notes', async () => {
    const mock = client()
    await writeActualsFields(mock.api, 'job-1', 'person@example.com', { shop_hours: 8 })
    const [payload, options] = mock.upsert.mock.calls[0] as unknown as [Record<string, unknown>, Record<string, unknown>]
    expect(payload).toMatchObject({ bid_id: 'job-1', shop_hours: 8 })
    expect(payload).not.toHaveProperty('install_hours')
    expect(payload).not.toHaveProperty('notes')
    expect(options).toEqual({ onConflict: 'bid_id', defaultToNull: false })
  })
  it('allows an intentional clear and rejects an unconfirmed write', async () => {
    const mock = client({ message: 'Write denied' })
    await expect(writeActualsFields(mock.api, 'job-1', null, { notes: null })).rejects.toThrow('Write denied')
    expect(mock.upsert).toHaveBeenCalledWith(expect.objectContaining({ notes: null }), expect.anything())
  })
})
