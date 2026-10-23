import { supabase } from './supabase'
import { buildContext, priceLine } from './pricing'
import { completionDate, nextWorkday, parseDay, toDay } from './schedule'
import type { Area, Assembly, AssemblyMaterial, Bid, BidFinish, BidMaterialOverride, LineItem, Material, Setting } from './types'

export function milestoneDates(start: string, days: number, holidays: Set<string>) {
  if (!Number.isFinite(days) || days < 1) throw new Error('This job needs an estimated build time before adding dates.')
  const ready = completionDate(nextWorkday(parseDay(start), holidays), days, holidays)
  const install = new Date(ready)
  install.setDate(install.getDate() + 7)
  return { ready: toDay(ready), install: toDay(install) }
}

export async function estimateJobDates(job: Bid, start: string) {
  const results = await Promise.all([
    supabase!.from('holidays').select('day'),
    supabase!.from('areas').select('*').eq('bid_id', job.id).order('sort_order'),
    supabase!.from('assemblies').select('*'),
    supabase!.from('assembly_materials').select('*'),
    supabase!.from('materials').select('*'),
    supabase!.from('bid_finishes').select('*, finish:finishes(*)').eq('bid_id', job.id),
    supabase!.from('bid_material_overrides').select('*').eq('bid_id', job.id),
    supabase!.from('settings').select('*'),
  ])
  for (const result of results) if (result.error) throw result.error
  const [hol, area, asm, bom, mat, finish, override, settings] = results
  const areas = (area.data as Area[]).filter(row => !row.is_alternate)
  if (!areas.length) throw new Error('This job has no estimated areas yet.')
  const lines = await supabase!.from('line_items').select('*').in('area_id', areas.map(row => row.id))
  if (lines.error) throw lines.error
  const ctx = buildContext(settings.data as Setting[], asm.data as Assembly[], bom.data as AssemblyMaterial[], mat.data as Material[], finish.data as BidFinish[], new Map((override.data as BidMaterialOverride[]).map(row => [row.from_material_id, row.to_material_id])))
  const rate = ctx.settings.cost_shop_rate ?? 0
  if (rate <= 0) throw new Error('Set a shop labor cost rate before estimating build time.')
  const heads = Math.max(1, Number(job.labor_heads ?? 1))
  let totalHours = 0
  const days = areas.reduce((total, area) => {
    const hours = (lines.data as LineItem[]).filter(line => line.area_id === area.id).reduce((sum, line) => sum + priceLine(line, area, ctx).laborCost / rate, 0)
    totalHours += hours
    return total + Math.max(1, Math.ceil(hours / heads / 8))
  }, 0)
  if (totalHours <= 0) throw new Error('This job has no estimated shop hours yet.')
  return { ...milestoneDates(start, days, new Set((hol.data as {day: string}[]).map(row => row.day))), days }
}
