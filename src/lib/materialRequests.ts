import { supabase } from './supabase'

export const ORDER_STATUSES = { requested: 'To order', ordered: 'Ordered', delivered: 'Delivered', cancelled: 'Cancelled' } as const
export type OrderStatus = keyof typeof ORDER_STATUSES
export interface MaterialRequest {
  id: string
  bid_id: string | null
  title: string
  quantity: number
  unit: string
  notes: string
  status: OrderStatus
  expected_on: string | null
  ordered_at: string | null
  delivered_at: string | null
  requested_by: string | null
  created_at: string
  updated_at: string
}
export type RequestInput = Pick<MaterialRequest, 'bid_id' | 'title' | 'quantity' | 'unit' | 'notes'>
export type RequestUpdate = RequestInput & Pick<MaterialRequest, 'status' | 'expected_on'>

const previewKey = (userId: string) => `spotonbid-material-orders-preview:${userId}`
function readPreview(userId: string): MaterialRequest[] {
  const saved = localStorage.getItem(previewKey(userId))
  return saved ? JSON.parse(saved) as MaterialRequest[] : []
}
export async function loadMaterialRequests(userId: string) {
  const rows: MaterialRequest[] = []
  for (let from = 0; ; from += 500) {
    const result = await supabase!.from('material_requests').select('*').order('created_at', { ascending: false }).order('id').range(from, from + 499)
    if (result.error) {
      if (import.meta.env.DEV && ['PGRST205', '42P01'].includes(result.error.code)) return { rows: readPreview(userId), preview: true }
      throw new Error(`Could not load material orders: ${result.error.message}`)
    }
    rows.push(...result.data as MaterialRequest[])
    if (result.data.length < 500) return { rows, preview: false }
  }
}
export async function saveMaterialRequest(userId: string, input: RequestInput | RequestUpdate, preview: boolean, existing?: MaterialRequest) {
  if (preview) {
    if (!import.meta.env.DEV) throw new Error('Preview storage is unavailable.')
    const rows = readPreview(userId)
    const now = new Date().toISOString()
    const status = 'status' in input ? input.status : 'requested'
    const row: MaterialRequest = {
      id: existing?.id ?? crypto.randomUUID(), requested_by: existing?.requested_by ?? userId,
      created_at: existing?.created_at ?? now, updated_at: now, ...input, status,
      expected_on: status === 'requested' ? null : 'expected_on' in input ? input.expected_on : null,
      ordered_at: status === 'requested' ? null : ['ordered', 'delivered'].includes(status) ? existing?.ordered_at ?? now : existing?.ordered_at ?? null,
      delivered_at: status === 'delivered' ? existing?.delivered_at ?? now : null,
    }
    localStorage.setItem(previewKey(userId), JSON.stringify(existing ? rows.map(r => r.id === existing.id ? row : r) : [row, ...rows]))
    return row
  }
  const result = existing
    ? await supabase!.from('material_requests').update(input).eq('id', existing.id).eq('updated_at', existing.updated_at).select('*').single()
    : await supabase!.from('material_requests').insert(input).select('*').single()
  if (result.error) throw new Error(result.error.code === 'PGRST116' ? 'This request changed or is no longer editable. Close this form and refresh the list before trying again.' : result.error.message)
  return result.data as MaterialRequest
}
