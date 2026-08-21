import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type {
  Area, AreaFinishOverride, AreaMaterialOverride, Assembly, AssemblyMaterial, Bid, BidFinish, BidMaterialOverride,
  Finish, LineItem, Material,
} from '../lib/types'
import { fmtCost, fmtMoney } from '../lib/format'

interface PurchaseRow {
  key: string
  name: string
  unit: string
  supplier: string
  rawQty: number
  buyQty: number
  unitCost: number | null
  total: number | null
}

/** Whole units you can't buy fractions of. */
const WHOLE_UNITS = new Set(['EACH', 'SHEET', 'GALLON', 'PER BOX'])

export default function OrderSheet() {
  const { id } = useParams<{ id: string }>()
  const { session, canSchedule } = useAuth()
  const [bid, setBid] = useState<Bid | null>(null)
  const [areas, setAreas] = useState<Area[]>([])
  const [lines, setLines] = useState<LineItem[]>([])
  const [assemblies, setAssemblies] = useState<Assembly[]>([])
  const [bom, setBom] = useState<AssemblyMaterial[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [bidFinishes, setBidFinishes] = useState<BidFinish[]>([])
  const [overrides, setOverrides] = useState<BidMaterialOverride[]>([])
  const [areaOverrides, setAreaOverrides] = useState<AreaMaterialOverride[]>([])
  const [areaFinishOverrides, setAreaFinishOverrides] = useState<AreaFinishOverride[]>([])
  const [checks, setChecks] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      const [bidRes, areaRes, asmRes, bomRes, matRes, bfRes, ovrRes, chkRes] = await Promise.all([
        supabase!.from('bids').select('*').eq('id', id!).single(),
        supabase!.from('areas').select('*').eq('bid_id', id!),
        supabase!.from('assemblies').select('*'),
        supabase!.from('assembly_materials').select('*'),
        supabase!.from('materials').select('*'),
        supabase!.from('bid_finishes').select('*, finish:finishes(*)').eq('bid_id', id!),
        supabase!.from('bid_material_overrides').select('*').eq('bid_id', id!),
        supabase!.from('order_checks').select('item_key').eq('bid_id', id!),
      ])
      if (bidRes.error) return setError(bidRes.error.message)
      setBid(bidRes.data as Bid)
      const areaRows = (areaRes.data ?? []) as Area[]
      setAreas(areaRows)
      if (areaRows.length > 0) {
        const [lineRes, aoRes, afoRes] = await Promise.all([
          supabase!.from('line_items').select('*').in('area_id', areaRows.map((a) => a.id)),
          supabase!.from('area_material_overrides').select('*').in('area_id', areaRows.map((a) => a.id)),
          supabase!.from('area_finish_overrides').select('*, finish:finishes(*)').in('area_id', areaRows.map((a) => a.id)),
        ])
        setLines((lineRes.data ?? []) as LineItem[])
        setAreaOverrides((aoRes.data ?? []) as AreaMaterialOverride[])
        setAreaFinishOverrides((afoRes.data ?? []) as AreaFinishOverride[])
      }
      setAssemblies((asmRes.data ?? []) as Assembly[])
      setBom((bomRes.data ?? []) as AssemblyMaterial[])
      setMaterials((matRes.data ?? []) as Material[])
      setBidFinishes((bfRes.data ?? []) as BidFinish[])
      setOverrides((ovrRes.data ?? []) as BidMaterialOverride[])
      setChecks(new Set(((chkRes.data ?? []) as { item_key: string }[]).map((c) => c.item_key)))
    })()
  }, [id])

  const groups = useMemo(() => {
    if (!bid) return []
    const areaById = new Map(areas.map((a) => [a.id, a]))
    const bomByAsm = new Map<string, AssemblyMaterial[]>()
    for (const r of bom) {
      if (!bomByAsm.has(r.assembly_id)) bomByAsm.set(r.assembly_id, [])
      bomByAsm.get(r.assembly_id)!.push(r)
    }
    const matById = new Map(materials.map((m) => [m.id, m]))
    const finBySlot = new Map(bidFinishes.map((bf) => [bf.slot, bf.finish!]))
    const areaFinOvr = new Map<string, Map<string, Finish>>()
    for (const o of areaFinishOverrides) {
      if (!o.finish) continue
      if (!areaFinOvr.has(o.area_id)) areaFinOvr.set(o.area_id, new Map())
      areaFinOvr.get(o.area_id)!.set(o.slot, o.finish)
    }
    const ovr = new Map(overrides.map((o) => [o.from_material_id, o.to_material_id]))
    const areaOvr = new Map<string, Map<string, string>>()
    for (const o of areaOverrides) {
      if (!areaOvr.has(o.area_id)) areaOvr.set(o.area_id, new Map())
      areaOvr.get(o.area_id)!.set(o.from_material_id, o.to_material_id)
    }

    // aggregate quantities
    const agg = new Map<string, PurchaseRow>()
    for (const line of lines) {
      if (line.kind !== 'assembly' || !line.assembly_id) continue
      const area = areaById.get(line.area_id)
      if (!area || area.is_alternate) continue
      const mult = Number(line.quantity) * Number(area.multiplier)
      for (const row of bomByAsm.get(line.assembly_id) ?? []) {
        const qty = Number(row.qty) * (1 + Number(row.waste_pct)) * mult
        let key: string, name: string, unit: string, supplier: string, cost: number | null
        if (row.slot) {
          // room finish pick beats the job-wide assignment
          const fin = (areaFinOvr.get(area.id)?.get(row.slot) ?? finBySlot.get(row.slot)) as Finish | undefined
          if (!fin) continue
          key = `fin:${fin.id}`
          name = `${fin.name}${fin.color_code ? ` (${fin.color_code})` : ''}`
          unit = fin.unit
          supplier = fin.brand ?? 'FINISHES'
          cost = fin.cost == null ? null : Number(fin.cost)
        } else if (row.material_id) {
          // room's pick beats the job-wide pick
          const effId = areaOvr.get(area.id)?.get(row.material_id) ?? ovr.get(row.material_id) ?? row.material_id
          const mat = matById.get(effId)
          if (!mat) continue
          key = `mat:${mat.id}`
          name = mat.name
          unit = mat.unit
          supplier = mat.supplier ?? 'OTHER'
          cost = mat.cost == null ? null : Number(mat.cost)
        } else continue
        const existing = agg.get(key)
        if (existing) existing.rawQty += qty
        else agg.set(key, { key, name, unit, supplier, rawQty: qty, buyQty: 0, unitCost: cost, total: null })
      }
    }
    for (const row of agg.values()) {
      row.buyQty = WHOLE_UNITS.has(row.unit) ? Math.ceil(row.rawQty - 1e-9) : Math.round(row.rawQty * 10) / 10
      row.total = row.unitCost == null ? null : row.buyQty * row.unitCost
    }
    // group by supplier
    const map = new Map<string, PurchaseRow[]>()
    for (const row of [...agg.values()].sort((a, b) => a.name.localeCompare(b.name))) {
      if (!map.has(row.supplier)) map.set(row.supplier, [])
      map.get(row.supplier)!.push(row)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [bid, areas, lines, assemblies, bom, materials, bidFinishes, overrides, areaOverrides, areaFinishOverrides])

  if (error)
    return <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>
  if (!bid) return <p className="text-sm text-slate-500">Loading…</p>

  async function toggleCheck(key: string) {
    const next = new Set(checks)
    if (next.has(key)) {
      next.delete(key)
      await supabase!.from('order_checks').delete().eq('bid_id', bid!.id).eq('item_key', key)
    } else {
      next.add(key)
      await supabase!
        .from('order_checks')
        .upsert({ bid_id: bid!.id, item_key: key, checked_by: session?.user.email ?? null })
    }
    setChecks(next)
  }

  const allRows = groups.flatMap(([, rows]) => rows)
  const grandTotal = allRows.reduce((s, r) => s + (r.total ?? 0), 0)
  const done = allRows.filter((r) => checks.has(r.key)).length

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link to={`/bids/${bid.id}`} className="text-sm text-slate-500 hover:text-slate-900">
          ← {bid.job_number}
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-lg font-semibold tracking-tight">
          {bid.name} — order sheet
        </h1>
        <span className="font-mono text-xs text-slate-500">
          {done}/{allRows.length} ordered
        </span>
      </div>

      <p className="text-sm text-slate-500">
        Everything the base bid needs, from the cabinet recipes × your quantities. Whole-unit
        items are rounded up to what you can actually buy. Option areas and one-off items aren't
        included.
      </p>

      {groups.length === 0 ? (
        <p className="rounded-lg border-2 border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
          No cabinet lines on this estimate yet.
        </p>
      ) : (
        groups.map(([supplier, rows]) => (
          <section key={supplier}>
            <h2 className="mb-2 font-mono text-[11px] uppercase tracking-widest text-slate-500">{supplier}</h2>
            <div className="overflow-x-auto rounded-lg border-2 border-slate-800 bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left font-mono text-[10px] uppercase tracking-wider text-slate-400">
                    <th className="w-10 px-3 py-2"></th>
                    <th className="px-2 py-2 font-medium">Item</th>
                    <th className="px-2 py-2 font-medium text-right">Need</th>
                    <th className="px-2 py-2 font-medium text-right">Buy</th>
                    <th className="px-2 py-2 font-medium">Unit</th>
                    <th className="px-2 py-2 font-medium text-right">Unit cost</th>
                    <th className="px-4 py-2 font-medium text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const ordered = checks.has(r.key)
                    return (
                      <tr key={r.key} className={`border-t border-slate-100 ${ordered ? 'bg-emerald-50/60' : ''}`}>
                        <td className="px-3 py-1.5">
                          <input
                            type="checkbox"
                            checked={ordered}
                            disabled={!canSchedule}
                            onChange={() => void toggleCheck(r.key)}
                            className="h-4 w-4 accent-emerald-600 disabled:opacity-40"
                            title={ordered ? 'Ordered — untick to undo' : 'Tick when ordered'}
                          />
                        </td>
                        <td className={`px-2 py-1.5 ${ordered ? 'text-slate-400 line-through' : ''}`}>{r.name}</td>
                        <td className="px-2 py-1.5 text-right text-xs text-slate-400 tabular-nums">
                          {Math.round(r.rawQty * 100) / 100}
                        </td>
                        <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{r.buyQty}</td>
                        <td className="px-2 py-1.5 text-xs text-slate-500">{r.unit}</td>
                        <td className="px-2 py-1.5 text-right text-xs text-slate-500 tabular-nums">{fmtCost(r.unitCost)}</td>
                        <td className="px-4 py-1.5 text-right tabular-nums">{r.total == null ? '—' : fmtMoney(r.total)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}

      {allRows.length > 0 && (
        <div className="flex items-center justify-end gap-3 rounded-lg border-2 border-slate-800 bg-white px-4 py-3">
          <span className="font-mono text-[11px] uppercase tracking-widest text-slate-500">
            Estimated purchase total
          </span>
          <span className="text-lg font-semibold tabular-nums">{fmtMoney(grandTotal)}</span>
        </div>
      )}
    </div>
  )
}
