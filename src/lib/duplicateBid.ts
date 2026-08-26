import { supabase } from './supabase'
import { nextJobNumber } from './format'
import type { Bid } from './types'

/**
 * Deep-copies a bid into a fresh Received bid: header fields, GC links, finish
 * slots, job hardware/material swaps, every area (incl. per-room swaps and
 * notes) and its line items. Revisions, plans, receipts, time, and change
 * orders are NOT copied — those belong to the original job's history.
 * Returns the new bid's id.
 */
export async function duplicateBid(source: Bid): Promise<string> {
  const sb = supabase!

  const { data: numRows } = await sb.from('bids').select('job_number')
  const job_number = nextJobNumber((numRows ?? []).map((r) => r.job_number))

  const { data: newBid, error } = await sb
    .from('bids')
    .insert({
      job_number,
      name: `${source.name} (copy)`,
      status: 'received',
      due_at: null,
      address: source.address,
      distance_miles: source.distance_miles,
      labor_heads: source.labor_heads,
      install_heads: source.install_heads,
      tax_exempt: source.tax_exempt,
      bid_value: source.bid_value,
      drawings_date: source.drawings_date,
      adders: source.adders,
      inclusions: source.inclusions,
      exclusions: source.exclusions,
      notes: source.notes,
      price_adjustment: source.price_adjustment ?? 0,
      hidden_adjustment: source.hidden_adjustment ?? 0,
      adjustment_note: source.adjustment_note,
      adjustment_visible: source.adjustment_visible ?? true,
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  const newId = newBid.id as string

  // GC links (won_through resets — nothing is won on a fresh bid)
  const { data: gcs } = await sb.from('bid_customers').select('customer_id').eq('bid_id', source.id)
  if (gcs && gcs.length > 0) {
    await sb.from('bid_customers').insert(gcs.map((g) => ({ bid_id: newId, customer_id: g.customer_id })))
  }

  // finish slots
  const { data: finishes } = await sb.from('bid_finishes').select('slot, finish_id').eq('bid_id', source.id)
  if (finishes && finishes.length > 0) {
    await sb.from('bid_finishes').insert(finishes.map((f) => ({ ...f, bid_id: newId })))
  }

  // job-wide material / hardware swaps
  const { data: swaps } = await sb
    .from('bid_material_overrides')
    .select('from_material_id, to_material_id')
    .eq('bid_id', source.id)
  if (swaps && swaps.length > 0) {
    await sb.from('bid_material_overrides').insert(swaps.map((s) => ({ ...s, bid_id: newId })))
  }

  // areas → lines + per-room swaps (change-order areas are skipped: those are history)
  const { data: areas } = await sb
    .from('areas')
    .select('*')
    .eq('bid_id', source.id)
    .is('change_order_id', null)
    .order('sort_order')
  for (const a of areas ?? []) {
    const { data: newArea, error: aErr } = await sb
      .from('areas')
      .insert({
        bid_id: newId,
        name: a.name,
        sheet_ref: a.sheet_ref,
        multiplier: a.multiplier,
        is_alternate: a.is_alternate,
        inclusions: a.inclusions,
        exclusions: a.exclusions,
        sort_order: a.sort_order,
      })
      .select('id')
      .single()
    if (aErr) throw new Error(aErr.message)

    const { data: lines } = await sb.from('line_items').select('*').eq('area_id', a.id).order('sort_order')
    if (lines && lines.length > 0) {
      await sb.from('line_items').insert(
        lines.map(({ id: _id, area_id: _aid, created_at: _c, ...rest }) => ({
          ...rest,
          area_id: newArea.id,
        })),
      )
    }

    const { data: roomSwaps } = await sb
      .from('area_material_overrides')
      .select('from_material_id, to_material_id')
      .eq('area_id', a.id)
    if (roomSwaps && roomSwaps.length > 0) {
      await sb.from('area_material_overrides').insert(roomSwaps.map((s) => ({ ...s, area_id: newArea.id })))
    }
    const { data: roomFinishes } = await sb
      .from('area_finish_overrides')
      .select('slot, finish_id')
      .eq('area_id', a.id)
    if (roomFinishes && roomFinishes.length > 0) {
      await sb.from('area_finish_overrides').insert(roomFinishes.map((s) => ({ ...s, area_id: newArea.id })))
    }
  }

  return newId
}
