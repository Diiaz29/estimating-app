import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type {
  Area, AreaMaterialOverride, Assembly, AssemblyMaterial, Bid, BidFinish, BidMaterialOverride,
  LineItem, Material, Setting,
} from '../lib/types'
import { buildContext, priceBid } from '../lib/pricing'
import { fmtMoney } from '../lib/format'

/** Printable internal budget sheet — the V9 BUDGET page, computed live.
 *  Price side, cost side, and the bottom line. Admin eyes only. */
export default function Budget() {
  const { id } = useParams<{ id: string }>()
  const { isAdmin } = useAuth()
  const [bid, setBid] = useState<Bid | null>(null)
  const [areas, setAreas] = useState<Area[]>([])
  const [lines, setLines] = useState<LineItem[]>([])
  const [assemblies, setAssemblies] = useState<Assembly[]>([])
  const [bom, setBom] = useState<AssemblyMaterial[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [bidFinishes, setBidFinishes] = useState<BidFinish[]>([])
  const [overrides, setOverrides] = useState<BidMaterialOverride[]>([])
  const [areaOverrides, setAreaOverrides] = useState<AreaMaterialOverride[]>([])
  const [settings, setSettings] = useState<Setting[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      const [bidRes, areaRes, asmRes, bomRes, matRes, bfRes, ovrRes, setRes] = await Promise.all([
        supabase!.from('bids').select('*').eq('id', id!).single(),
        supabase!.from('areas').select('*').eq('bid_id', id!).order('sort_order'),
        supabase!.from('assemblies').select('*'),
        supabase!.from('assembly_materials').select('*'),
        supabase!.from('materials').select('*'),
        supabase!.from('bid_finishes').select('*, finish:finishes(*)').eq('bid_id', id!),
        supabase!.from('bid_material_overrides').select('*').eq('bid_id', id!),
        supabase!.from('settings').select('*'),
      ])
      if (bidRes.error) return setError(bidRes.error.message)
      setBid(bidRes.data as Bid)
      const areaRows = (areaRes.data ?? []) as Area[]
      setAreas(areaRows)
      if (areaRows.length > 0) {
        const [lineRes, aoRes] = await Promise.all([
          supabase!.from('line_items').select('*').in('area_id', areaRows.map((a) => a.id)).order('sort_order'),
          supabase!.from('area_material_overrides').select('*').in('area_id', areaRows.map((a) => a.id)),
        ])
        setLines((lineRes.data ?? []) as LineItem[])
        setAreaOverrides((aoRes.data ?? []) as AreaMaterialOverride[])
      }
      setAssemblies((asmRes.data ?? []) as Assembly[])
      setBom((bomRes.data ?? []) as AssemblyMaterial[])
      setMaterials((matRes.data ?? []) as Material[])
      setBidFinishes((bfRes.data ?? []) as BidFinish[])
      setOverrides((ovrRes.data ?? []) as BidMaterialOverride[])
      setSettings((setRes.data ?? []) as Setting[])
    })()
  }, [id])

  const ctx = useMemo(() => {
    const areaMap = new Map<string, Map<string, string>>()
    for (const o of areaOverrides) {
      if (!areaMap.has(o.area_id)) areaMap.set(o.area_id, new Map())
      areaMap.get(o.area_id)!.set(o.from_material_id, o.to_material_id)
    }
    return buildContext(
      settings, assemblies, bom, materials, bidFinishes,
      new Map(overrides.map((o) => [o.from_material_id, o.to_material_id])),
      areaMap,
    )
  }, [settings, assemblies, bom, materials, bidFinishes, overrides, areaOverrides])
  const linesByArea = useMemo(() => {
    const map = new Map<string, LineItem[]>()
    for (const l of lines) {
      if (!map.has(l.area_id)) map.set(l.area_id, [])
      map.get(l.area_id)!.push(l)
    }
    return map
  }, [lines])
  const pricing = useMemo(
    () => (bid ? priceBid(bid, areas, linesByArea, ctx) : null),
    [bid, areas, linesByArea, ctx],
  )

  if (!isAdmin) {
    return (
      <p className="rounded-lg border-2 border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
        Admins only.
      </p>
    )
  }
  if (error)
    return <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>
  if (!bid || !pricing) return <p className="text-sm text-slate-500">Loading…</p>

  const cb = pricing.costBreakdown
  const enabledAdders = pricing.adders.filter((a) => a.enabled)
  const today = new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
  const totalWithTax = pricing.contractAmount + pricing.tax

  return (
    <div className="max-w-3xl space-y-4 pb-10 print:max-w-none print:pb-0">
      <div className="flex items-center gap-3 print:hidden">
        <h1 className="text-lg font-semibold tracking-tight">Budget sheet</h1>
        <span className="text-sm text-slate-500">internal — never leaves the shop</span>
        <button
          onClick={() => window.print()}
          className="ml-auto rounded-md bg-slate-900 px-4 py-1.5 text-sm font-semibold text-white hover:bg-slate-700"
        >
          🖨 Print
        </button>
      </div>

      <div className="light-doc rounded-lg border-2 border-slate-900 bg-white p-6 print:rounded-none print:border-0 print:p-0">
        {/* Title block */}
        <header className="border-b-4 border-slate-900 pb-2">
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-sm text-slate-500">{bid.job_number}</span>
            <h2 className="text-xl font-bold tracking-tight">{bid.name}</h2>
            <span className="ml-auto font-mono text-[10px] uppercase tracking-widest text-slate-500">
              Budget · {today}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-5 text-[11px] text-slate-500">
            <span>{Math.round(pricing.lfTotal)} LF</span>
            <span>{pricing.installHours.toFixed(1)} install hrs</span>
            <span>{cb.shopHours.toFixed(1)} shop hrs</span>
            <span>{Number(bid.distance_miles ?? 0)} mi</span>
            {bid.tax_exempt && <span>tax exempt</span>}
          </div>
        </header>

        <div className="mt-4 grid gap-6 sm:grid-cols-2 print:grid-cols-2">
          {/* Price side */}
          <section>
            <h3 className="mb-1.5 font-mono text-[11px] uppercase tracking-widest text-slate-500">
              Price — what the customer pays
            </h3>
            <table className="w-full text-sm">
              <tbody>
                {areas.filter((a) => !a.is_alternate).map((a) => (
                  <Row
                    key={a.id}
                    label={`${a.name}${Number(a.multiplier) > 1 ? ` (×${Number(a.multiplier)})` : ''}`}
                    value={pricing.areaTotals.get(a.id)?.price ?? 0}
                  />
                ))}
                <Row label="Cabinet work" value={pricing.cabinetTotal} bold rule />
                {enabledAdders.map((a) => (
                  <Row key={a.key} label={a.label} value={a.price} />
                ))}
                {pricing.adjustment !== 0 && (
                  <Row
                    label={bid.adjustment_note ?? (pricing.adjustment < 0 ? 'Discount' : 'Price add')}
                    value={pricing.adjustment}
                  />
                )}
                <Row label="Contract amount" value={pricing.contractAmount} bold rule />
                <Row label={bid.tax_exempt ? 'Tax (exempt)' : 'Tax'} value={pricing.tax} />
                <Row label="Total with tax" value={totalWithTax} bold />
                {(() => {
                  const optionsAllIn = areas
                    .filter((a) => a.is_alternate && !a.change_order_id)
                    .reduce((s, a) => s + (pricing.alternateAllIn.get(a.id) ?? 0), 0)
                  const pendingCos = areas
                    .filter((a) => a.is_alternate && a.change_order_id)
                    .reduce((s, a) => s + (pricing.alternateAllIn.get(a.id) ?? 0), 0)
                  return (
                    <>
                      {optionsAllIn > 0 && <Row label="Options, all-in (not in contract)" value={optionsAllIn} muted />}
                      {pendingCos !== 0 && <Row label="Pending change orders (not in contract)" value={pendingCos} muted />}
                    </>
                  )
                })()}
              </tbody>
            </table>
          </section>

          {/* Cost side */}
          <section>
            <h3 className="mb-1.5 font-mono text-[11px] uppercase tracking-widest text-slate-500">
              Cost — what it takes to build
            </h3>
            <table className="w-full text-sm">
              <tbody>
                <Row label="Materials at cost" value={cb.materials} />
                <Row label={`Shop labor (${cb.shopHours.toFixed(1)} hrs at cost rate)`} value={cb.shopLabor} />
                <Row label="Install + fuel" value={cb.install} />
                <Row label="Delivery" value={cb.delivery} />
                <Row label="Travel (per diem + lodging)" value={cb.travel} />
                <Row label="Subcontractors" value={cb.subs} />
                <Row label="Other (one-offs, punch, GC, insurance)" value={cb.other} />
                <Row label="True cost" value={pricing.trueCost} bold rule />
              </tbody>
            </table>

            {/* Bottom line */}
            <div className="mt-4 overflow-hidden rounded-md border-2 border-slate-900 print:mt-6">
              <div className="flex items-baseline justify-between px-3 py-1.5 text-sm">
                <span>Contract</span>
                <span className="tabular-nums">{fmtMoney(pricing.contractAmount)}</span>
              </div>
              <div className="flex items-baseline justify-between px-3 py-1.5 text-sm">
                <span>− True cost</span>
                <span className="tabular-nums">{fmtMoney(pricing.trueCost)}</span>
              </div>
              <div className="flex items-center border-t-2 border-slate-900 bg-slate-100 px-3 py-2">
                <span className="font-semibold">Projected profit</span>
                <span className="ml-auto text-right">
                  <span className="block text-lg font-bold leading-tight tabular-nums">{fmtMoney(pricing.profit)}</span>
                  <span className="block text-xs font-semibold text-slate-500">
                    {pricing.marginPct != null ? `${(pricing.marginPct * 100).toFixed(1)}% margin` : '—'}
                  </span>
                </span>
              </div>
            </div>
            <p className="mt-2 text-[10px] leading-snug text-slate-500">
              Labor is priced at the burdened cost rate, so overhead is already inside the cost
              lines — no separate overhead subtraction.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}

function Row({
  label, value, bold, rule, muted,
}: {
  label: string
  value: number
  bold?: boolean
  rule?: boolean
  muted?: boolean
}) {
  return (
    <tr className={`${rule ? 'border-t-2 border-slate-900' : 'border-t border-slate-100'} ${muted ? 'text-slate-400' : ''}`}>
      <td className={`py-1 pr-2 ${bold ? 'font-semibold' : ''}`}>{label}</td>
      <td className={`py-1 text-right tabular-nums ${bold ? 'font-semibold' : ''}`}>{fmtMoney(value)}</td>
    </tr>
  )
}
