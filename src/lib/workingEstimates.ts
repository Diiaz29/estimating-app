import { supabase } from './supabase'
import { buildContext, priceBid } from './pricing'
import type { Area, AreaFinishOverride, AreaMaterialOverride, Assembly, AssemblyMaterial, Bid, BidFinish, BidMaterialOverride, LineItem, Material, Setting } from './types'

// Read every page so large takeoffs cannot silently produce partial totals.
async function rows<T>(query: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<T[]> {
  const result: T[] = []
  for (let from = 0; ; from += 500) {
    const response = await query(from, from + 499)
    if (response.error) throw new Error(response.error.message)
    const page = (response.data ?? []) as T[]
    result.push(...page)
    if (page.length < 500) return result
  }
}

/** Current working totals only; never updates a bid or a saved proposal. */
export async function loadWorkingEstimateTotals(bids: Bid[]): Promise<Map<string, number>> {
  if (!bids.length) return new Map()
  const [assemblies, bom, materials, settings] = await Promise.all([
    rows<Assembly>((a, b) => supabase!.from('assemblies').select('*').eq('active', true).order('id').range(a, b)),
    rows<AssemblyMaterial>((a, b) => supabase!.from('assembly_materials').select('*').order('id').range(a, b)),
    rows<Material>((a, b) => supabase!.from('materials').select('*').order('id').range(a, b)),
    rows<Setting>((a, b) => supabase!.from('settings').select('*').order('key').range(a, b)),
  ])
  const totals = new Map<string, number>()
  // Bound IN filters and share the library fetch across all bids.
  for (let start = 0; start < bids.length; start += 40) {
    const batch = bids.slice(start, start + 40)
    const ids = batch.map(bid => bid.id)
    const [areas, finishes, overrides] = await Promise.all([
      rows<Area>((a, b) => supabase!.from('areas').select('*').in('bid_id', ids).order('sort_order').order('created_at').order('id').range(a, b)),
      rows<BidFinish>((a, b) => supabase!.from('bid_finishes').select('*, finish:finishes(*)').in('bid_id', ids).order('bid_id').order('slot').range(a, b)),
      rows<BidMaterialOverride>((a, b) => supabase!.from('bid_material_overrides').select('*').in('bid_id', ids).order('bid_id').order('from_material_id').range(a, b)),
    ])
    const lines: LineItem[] = [], areaOverrides: AreaMaterialOverride[] = [], areaFinishes: AreaFinishOverride[] = []
    for (let offset = 0; offset < areas.length; offset += 40) {
      const areaIds = areas.slice(offset, offset + 40).map(area => area.id)
      const [l, o, f] = await Promise.all([
        rows<LineItem>((a, b) => supabase!.from('line_items').select('*').in('area_id', areaIds).order('sort_order').order('created_at').order('id').range(a, b)),
        rows<AreaMaterialOverride>((a, b) => supabase!.from('area_material_overrides').select('*').in('area_id', areaIds).order('area_id').order('from_material_id').range(a, b)),
        rows<AreaFinishOverride>((a, b) => supabase!.from('area_finish_overrides').select('*, finish:finishes(*)').in('area_id', areaIds).order('area_id').order('slot').range(a, b)),
      ])
      lines.push(...l); areaOverrides.push(...o); areaFinishes.push(...f)
    }
    const areaMap = new Map<string, Map<string, string>>()
    for (const override of areaOverrides) {
      if (!areaMap.has(override.area_id)) areaMap.set(override.area_id, new Map())
      areaMap.get(override.area_id)!.set(override.from_material_id, override.to_material_id)
    }
    const linesByArea = new Map<string, LineItem[]>()
    for (const line of lines) {
      if (!linesByArea.has(line.area_id)) linesByArea.set(line.area_id, [])
      linesByArea.get(line.area_id)!.push(line)
    }
    for (const bid of batch) {
      const context = buildContext(settings, assemblies, bom, materials, finishes.filter(f => f.bid_id === bid.id), new Map(overrides.filter(o => o.bid_id === bid.id).map(o => [o.from_material_id, o.to_material_id])), areaMap, areaFinishes)
      totals.set(bid.id, priceBid(bid, areas.filter(area => area.bid_id === bid.id), linesByArea, context, false).contractAmount)
    }
  }
  return totals
}
