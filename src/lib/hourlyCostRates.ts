import type { SupabaseClient } from '@supabase/supabase-js'

export function hourlyCostRateValues(labor: string, overhead: string) {
  const values = [labor, overhead].map(value => Number(value))
  if ([labor, overhead].some(value => !value.trim()) || values.some(value => !Number.isFinite(value) || value < 0)) {
    throw new Error('Enter zero or a positive number for both hourly rates.')
  }
  const laborCents = Math.round(values[0] * 100)
  const overheadCents = Math.round(values[1] * 100)
  if (!Number.isSafeInteger(laborCents + overheadCents)) throw new Error('Enter smaller hourly rates.')
  const totalCents = laborCents + overheadCents
  return { combined: totalCents / 100, share: totalCents > 0 ? laborCents / totalCents : 0 }
}

/** Save both values in one request so the rate and allocation cannot diverge. */
export async function writeHourlyCostRates(client: SupabaseClient, labor: string, overhead: string) {
  const values = hourlyCostRateValues(labor, overhead)
  const rows = [
    { key: 'cost_shop_rate', label: 'Labor + overhead cost ($/hr)', group_name: 'Labor', value: values.combined, format: 'money', sort_order: 20 },
    { key: 'cost_labor_share', label: 'Labor share of combined cost', group_name: 'Overhead', value: values.share, format: 'factor', sort_order: 40 },
  ]
  const { data, error } = await client.from('settings').upsert(rows, { onConflict: 'key' }).select('key')
  if (error) throw new Error(error.message)
  if (data?.length !== 2) throw new Error('The hourly rates were not confirmed saved. Try again.')
  return values
}
