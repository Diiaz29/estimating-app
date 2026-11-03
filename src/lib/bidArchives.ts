import { supabase } from './supabase'

export async function loadBidArchives(): Promise<{ ids: Set<string>; available: boolean }> {
  const ids = new Set<string>()
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase!.from('bid_archives').select('bid_id').order('bid_id').range(offset, offset + 499)
    // Allows the frontend preview to run before the additive migration is published.
    if (error?.code === 'PGRST205' || error?.code === '42P01') return { ids, available: false }
    if (error) throw new Error(error.message)
    for (const row of data ?? []) ids.add(row.bid_id)
    if (!data || data.length < 500) return { ids, available: true }
  }
}

export async function setBidArchived(bidId: string, archived: boolean) {
  const result = archived
    ? await supabase!.from('bid_archives').insert({ bid_id: bidId }).select('bid_id').single()
    : await supabase!.from('bid_archives').delete().eq('bid_id', bidId).select('bid_id').single()
  if (result.error) throw new Error(result.error.message)
  window.dispatchEvent(new Event('bid-review-updated'))
}
