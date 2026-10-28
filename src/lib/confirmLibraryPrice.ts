import type { SupabaseClient } from '@supabase/supabase-js'

/** The server authorizes the role and changes only the price-check timestamp. */
export async function confirmLibraryPrice(client: SupabaseClient, table: 'materials' | 'finishes', id: string): Promise<string | null> {
  try {
    const { data, error } = await client.rpc('confirm_library_price', { p_table: table, p_id: id })
    if (error) return error.message
    return typeof data === 'string' && Number.isFinite(Date.parse(data))
      ? null
      : 'The price check was not confirmed saved. Try again.'
  } catch (error) {
    return error instanceof Error ? error.message : 'Could not confirm the price. Try again.'
  }
}
