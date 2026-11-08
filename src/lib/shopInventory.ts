import { supabase } from './supabase'
import type { STOCK_UNITS } from './inventoryMath'

export interface StockItem {
  id: string
  title: string
  unit: typeof STOCK_UNITS[number]
  on_hand: number
  minimum: number
  notes: string
  checked_at: string
  checked_by: string | null
  updated_at: string
}
export type StockInput = Pick<StockItem, 'title' | 'unit' | 'on_hand' | 'minimum' | 'notes'>
const key = (userId: string) => `spotonbid-inventory-preview:${userId}`
const readPreview = (userId: string): StockItem[] => JSON.parse(localStorage.getItem(key(userId)) ?? '[]')

export async function loadInventory(userId: string) {
  const rows: StockItem[] = []
  for (let from = 0; ; from += 500) {
    const result = await supabase!.from('shop_inventory').select('*').order('title').order('id').range(from, from + 499)
    if (result.error) {
      if (import.meta.env.DEV && ['PGRST205', '42P01'].includes(result.error.code)) return { rows: readPreview(userId), preview: true }
      throw new Error(`Could not load inventory: ${result.error.message}`)
    }
    rows.push(...result.data as StockItem[])
    if (result.data.length < 500) return { rows, preview: false }
  }
}

export async function saveStock(userId: string, input: StockInput, preview: boolean, existing?: StockItem) {
  const stale = 'This item was changed by someone else. Close this form and refresh before saving your count.'
  if (preview) {
    if (!import.meta.env.DEV) throw new Error('Preview storage is unavailable.')
    const rows = readPreview(userId)
    if (existing && rows.find(row => row.id === existing.id)?.updated_at !== existing.updated_at) throw new Error(stale)
    const now = new Date().toISOString()
    const row: StockItem = { ...input, id: existing?.id ?? crypto.randomUUID(), checked_at: now, checked_by: userId, updated_at: now }
    localStorage.setItem(key(userId), JSON.stringify(existing ? rows.map(item => item.id === row.id ? row : item) : [...rows, row]))
    return row
  }
  const result = existing
    ? await supabase!.from('shop_inventory').update(input).eq('id', existing.id).eq('updated_at', existing.updated_at).select('*').single()
    : await supabase!.from('shop_inventory').insert(input).select('*').single()
  if (result.error) throw new Error(result.error.code === 'PGRST116' ? stale : result.error.message)
  return result.data as StockItem
}
