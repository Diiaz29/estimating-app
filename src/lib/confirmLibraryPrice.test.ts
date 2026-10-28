import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { confirmLibraryPrice } from './confirmLibraryPrice'

describe('confirming library prices', () => {
  it('uses the restricted server action for both library types without sending price or timestamp edits', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: '2026-10-28T17:00:00Z', error: null })
    const client = { rpc } as unknown as SupabaseClient
    for (const table of ['materials', 'finishes'] as const) {
      await expect(confirmLibraryPrice(client, table, 'record-id')).resolves.toBeNull()
      expect(rpc).toHaveBeenLastCalledWith('confirm_library_price', { p_table: table, p_id: 'record-id' })
    }
  })
  it('reports permission, missing confirmation, and network failures instead of silently claiming success', async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: null, error: { message: 'Not authorized' } })
      .mockResolvedValueOnce({ data: null, error: null }).mockRejectedValueOnce(new Error('Network unavailable'))
    const client = { rpc } as unknown as SupabaseClient
    await expect(confirmLibraryPrice(client, 'materials', 'record-id')).resolves.toBe('Not authorized')
    await expect(confirmLibraryPrice(client, 'materials', 'record-id')).resolves.toContain('not confirmed saved')
    await expect(confirmLibraryPrice(client, 'materials', 'record-id')).resolves.toBe('Network unavailable')
  })
})
