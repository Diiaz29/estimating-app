import type { SupabaseClient } from '@supabase/supabase-js'
import { checkedWrite } from './saveQueue'

export interface ActualsEdit {
  shop_hours?: number | null
  install_hours?: number | null
  notes?: string | null
}

/** Never send a loaded whole record: unrelated values may have changed elsewhere. */
export function writeActualsFields(client: SupabaseClient, bidId: string, user: string | null, fields: ActualsEdit) {
  return checkedWrite(client.from('job_actuals').upsert({
    ...fields,
    bid_id: bidId,
    updated_by: user,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'bid_id', defaultToNull: false }).select('bid_id').single())
}
