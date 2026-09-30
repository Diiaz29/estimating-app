import { useEffect, useState } from 'react'
import type { Area, AreaFinishOverride, AreaMaterialOverride, Assembly, AssemblyMaterial, Bid, BidFinish, BidMaterialOverride, LineItem, Material, Setting } from '../lib/types'
import { supabase } from '../lib/supabase'
import { buildContext, priceBid } from '../lib/pricing'
import { fmtMoney } from '../lib/format'

/** Read-only preview, using the same complete pricing inputs as Estimate. */
export default function ProjectEstimatePreview({ bid }: { bid: Bid }) {
  const [result, setResult] = useState<{ id: string; areas: Area[]; pricing: ReturnType<typeof priceBid> } | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    setError(null)
    async function load() {
      const [a, bf, asm, bom, mat, settings, overrides] = await Promise.all([
        supabase!.from('areas').select('*').eq('bid_id', bid.id).order('sort_order').order('created_at'),
        supabase!.from('bid_finishes').select('*, finish:finishes(*)').eq('bid_id', bid.id),
        supabase!.from('assemblies').select('*').eq('active', true).order('sort_order'),
        supabase!.from('assembly_materials').select('*'),
        supabase!.from('materials').select('*'),
        supabase!.from('settings').select('*'),
        supabase!.from('bid_material_overrides').select('*').eq('bid_id', bid.id),
      ])
      for (const response of [a, bf, asm, bom, mat, settings, overrides]) if (response.error) throw response.error
      const areas = (a.data ?? []) as Area[]
      const ids = areas.map(area => area.id)
      let lines: LineItem[] = [], areaOverrides: AreaMaterialOverride[] = [], areaFinishes: AreaFinishOverride[] = []
      if (ids.length) {
        const [l, o, f] = await Promise.all([
          supabase!.from('line_items').select('*').in('area_id', ids).order('sort_order').order('created_at'),
          supabase!.from('area_material_overrides').select('*').in('area_id', ids),
          supabase!.from('area_finish_overrides').select('*, finish:finishes(*)').in('area_id', ids),
        ])
        for (const response of [l, o, f]) if (response.error) throw response.error
        lines = (l.data ?? []) as LineItem[]
        areaOverrides = (o.data ?? []) as AreaMaterialOverride[]
        areaFinishes = (f.data ?? []) as AreaFinishOverride[]
      }
      const areaMap = new Map<string, Map<string, string>>()
      for (const o of areaOverrides) {
        if (!areaMap.has(o.area_id)) areaMap.set(o.area_id, new Map())
        areaMap.get(o.area_id)!.set(o.from_material_id, o.to_material_id)
      }
      const context = buildContext(settings.data as Setting[], asm.data as Assembly[], bom.data as AssemblyMaterial[], mat.data as Material[], bf.data as BidFinish[], new Map((overrides.data as BidMaterialOverride[]).map(o => [o.from_material_id, o.to_material_id])), areaMap, areaFinishes)
      const linesByArea = new Map<string, LineItem[]>()
      for (const line of lines) {
        if (!linesByArea.has(line.area_id)) linesByArea.set(line.area_id, [])
        linesByArea.get(line.area_id)!.push(line)
      }
      const pricing = priceBid(bid, areas, linesByArea, context)
      if (!cancelled) setResult({ id: bid.id, areas, pricing })
    }
    void load().catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load the estimate preview.') })
    return () => { cancelled = true }
  }, [bid])
  if (error) return <p className="text-sm text-red-600">{error}</p>
  if (!result || result.id !== bid.id) return <p className="index-preview-note">Loading estimate by area…</p>
  const { areas, pricing } = result
  return <div className="index-area-preview">
    <details className="index-estimate-breakdown"><summary>Estimate by area · {areas.length} {areas.length === 1 ? 'area' : 'areas'}</summary>
    {areas.map(area => <div className="index-area-row" key={area.id}><span>{area.name}{area.is_alternate && <small>Priced separately</small>}</span><span>{fmtMoney(pricing.areaTotals.get(area.id)?.price ?? 0)}</span></div>)}
    <div className="index-area-row"><span>Added costs</span><span>{fmtMoney(pricing.addersTotal)}</span></div>
    {pricing.adjustment !== 0 && <div className="index-area-row"><span>Adjustment</span><span>{fmtMoney(pricing.adjustment)}</span></div>}
    </details>
    <div className="index-preview-total"><span>Current contract total</span><strong>{fmtMoney(pricing.contractAmount)}</strong></div>
    <p className="index-preview-note">Current working estimate. Options are priced separately.{pricing.warnings.length > 0 && ' Pricing warnings need review in the estimate.'}</p>
  </div>
}
