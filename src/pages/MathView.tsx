import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type {
  Area, Assembly, AssemblyMaterial, Bid, BidFinish, BidMaterialOverride, LineItem, Material, Setting,
} from '../lib/types'
import { buildContext, priceBid, priceLine } from '../lib/pricing'
import { fmtCost, fmtMoney } from '../lib/format'

/** Temporary "show your work" page — every number comes straight from the
 *  pricing engine, so this IS what the estimate computes. */
export default function MathView() {
  const { id } = useParams<{ id: string }>()
  const [bid, setBid] = useState<Bid | null>(null)
  const [areas, setAreas] = useState<Area[]>([])
  const [lines, setLines] = useState<LineItem[]>([])
  const [assemblies, setAssemblies] = useState<Assembly[]>([])
  const [bom, setBom] = useState<AssemblyMaterial[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [bidFinishes, setBidFinishes] = useState<BidFinish[]>([])
  const [overrides, setOverrides] = useState<BidMaterialOverride[]>([])
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
        const { data } = await supabase!
          .from('line_items').select('*').in('area_id', areaRows.map((a) => a.id)).order('sort_order')
        setLines((data ?? []) as LineItem[])
      }
      setAssemblies((asmRes.data ?? []) as Assembly[])
      setBom((bomRes.data ?? []) as AssemblyMaterial[])
      setMaterials((matRes.data ?? []) as Material[])
      setBidFinishes((bfRes.data ?? []) as BidFinish[])
      setOverrides((ovrRes.data ?? []) as BidMaterialOverride[])
      setSettings((setRes.data ?? []) as Setting[])
    })()
  }, [id])

  const ctx = useMemo(
    () =>
      buildContext(
        settings, assemblies, bom, materials, bidFinishes,
        new Map(overrides.map((o) => [o.from_material_id, o.to_material_id])),
      ),
    [settings, assemblies, bom, materials, bidFinishes, overrides],
  )
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

  if (error)
    return <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>
  if (!bid || !pricing) return <p className="text-sm text-slate-500">Loading…</p>

  const s = ctx.settings
  const n = (x: number, d = 2) => Number(x.toFixed(d)).toLocaleString()

  return (
    <div className="max-w-4xl space-y-6 pb-16">
      <div className="flex flex-wrap items-center gap-3">
        <Link to={`/bids/${bid.id}/estimate`} className="text-sm text-slate-500 hover:text-slate-900">
          ← Back to estimate
        </Link>
        <span className="rounded-full border border-blue-400 bg-blue-50 px-3 py-1 font-mono text-[11px] uppercase tracking-wider text-blue-800">
          The math — check page
        </span>
      </div>
      <h1 className="text-lg font-semibold tracking-tight">
        <span className="mr-2 font-mono text-sm text-slate-500">{bid.job_number}</span>
        {bid.name}
      </h1>
      <p className="text-sm text-slate-500">
        Every number below comes from the same engine that prices the estimate. If a step here
        looks wrong, the estimate is wrong the same way.
      </p>

      {/* Per line */}
      {areas.map((area) => (
        <section key={area.id} className="space-y-4">
          <h2 className="font-mono text-[11px] uppercase tracking-widest text-slate-500">
            {area.name} {area.is_alternate && '(ALTERNATE — not in base bid)'}{' '}
            {Number(area.multiplier) > 1 && `— everything ×${Number(area.multiplier)} (typ)`}
          </h2>
          {(linesByArea.get(area.id) ?? []).map((line) => {
            const p = priceLine(line, area, ctx)
            const assembly = line.assembly_id ? ctx.assemblies.get(line.assembly_id) : undefined
            const mult = Number(line.quantity) * Number(area.multiplier)
            const unitWord =
              assembly?.pricing_unit === 'LF' ? (mult === 1 ? 'foot' : 'feet')
              : assembly?.pricing_unit === 'SF' ? 'sq ft'
              : mult === 1 ? 'box' : 'boxes'
            return (
              <div key={line.id} className="rounded-lg border-2 border-slate-800 bg-white">
                <div className="flex flex-wrap items-center gap-2 border-b-2 border-slate-800 px-4 py-2">
                  <span className="text-sm font-semibold">
                    {line.kind === 'assembly' ? assembly?.name : line.name}
                  </span>
                  <span className="font-mono text-[10px] uppercase text-slate-400">
                    {line.kind === 'assembly' ? assembly?.category : line.kind}
                  </span>
                  <span className="ml-auto text-sm font-semibold tabular-nums">{fmtMoney(p.linePrice)}</span>
                </div>
                <div className="space-y-3 p-4 text-sm">
                  {/* quantity */}
                  <MathStep label="How many">
                    {line.entry_mode === 'feet' && assembly?.typical_width_in ? (
                      assembly.pricing_unit === 'SF' ? (
                        <>
                          {n(Number(line.entry_value ?? 0))} ft × {n(Number(assembly.typical_width_in) / 12)} ft deep ={' '}
                          <b>{n(Number(line.quantity), 3)} sq ft</b>
                          {Number(area.multiplier) > 1 && <> × {Number(area.multiplier)} (typ) = <b>{n(mult, 3)}</b></>}
                        </>
                      ) : (
                        <>
                          {n(Number(line.entry_value ?? 0))} ft ÷ {n(Number(assembly.typical_width_in) / 12)} ft per box ={' '}
                          <b>{n(Number(line.quantity), 3)} boxes</b>
                          {Number(area.multiplier) > 1 && <> × {Number(area.multiplier)} (typ) = <b>{n(mult, 3)}</b></>}
                        </>
                      )
                    ) : (
                      <>
                        {n(Number(line.quantity), 3)} {line.kind === 'assembly' ? unitWord : 'each'}
                        {Number(area.multiplier) > 1 && <> × {Number(area.multiplier)} (typ) = <b>{n(mult, 3)}</b></>}
                      </>
                    )}
                  </MathStep>

                  {line.kind === 'assembly' && (
                    <>
                      {/* materials */}
                      <MathStep label={`Materials in one ${unitWord}`}>
                        <table className="mt-1 w-full text-xs">
                          <tbody>
                            {p.bomDetail.map((r, i) => (
                              <tr key={i} className="border-t border-slate-100 first:border-t-0">
                                <td className="py-1 pr-2">{r.source}</td>
                                <td className="py-1 pr-2 text-right tabular-nums whitespace-nowrap">
                                  {n(r.qty, 3)}
                                  {r.wastePct > 0 && ` × ${n(1 + r.wastePct)} waste`}
                                  {' × '}
                                  {r.unitCost == null ? <span className="font-semibold text-red-600">NO COST</span> : fmtCost(r.unitCost)}
                                </td>
                                <td className="w-20 py-1 text-right tabular-nums">{fmtCost(r.rowCost)}</td>
                              </tr>
                            ))}
                            <tr className="border-t-2 border-slate-300 font-semibold">
                              <td className="py-1">materials per {unitWord}</td>
                              <td></td>
                              <td className="py-1 text-right tabular-nums">{fmtCost(p.unitMaterialCost)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </MathStep>

                      <MathStep label="Material price">
                        {fmtCost(p.unitMaterialCost)} × {n(mult, 3)} × {n(s.material_markup ?? 1)} markup ={' '}
                        <b>{fmtMoney(p.materialPrice)}</b>
                      </MathStep>

                      <MathStep label="Shop labor price">
                        {n(Number(assembly!.build_minutes))} min ÷ 60 × {fmtMoney(s.price_shop_rate ?? 0)}/hr × {n(mult, 3)} ={' '}
                        <b>{fmtMoney(p.laborPrice)}</b>
                      </MathStep>

                      <MathStep label="Line total">
                        {line.rate_override != null ? (
                          <>
                            override: {fmtCost(Number(line.rate_override))} × {n(mult, 3)} = <b>{fmtMoney(p.linePrice)}</b>
                          </>
                        ) : (
                          <>
                            {fmtMoney(p.materialPrice)} + {fmtMoney(p.laborPrice)} = <b>{fmtMoney(p.linePrice)}</b>
                          </>
                        )}
                      </MathStep>

                      <MathStep label="Also counted for added costs" muted>
                        install {n(Number(assembly!.install_minutes))} min ÷ 60 × {n(mult, 3)} = {n(p.installHours)} hrs ·{' '}
                        {n(p.lfEquivalent)} LF
                      </MathStep>
                    </>
                  )}

                  {line.kind === 'sub' && (
                    <MathStep label="Sub quote × markup">
                      {fmtMoney(Number(line.unit_price ?? 0))} × {n(mult, 3)} × {n(s.sub_markup ?? 1)} ={' '}
                      <b>{fmtMoney(p.linePrice)}</b>
                    </MathStep>
                  )}
                  {line.kind === 'manual' && (
                    <MathStep label="One-off price">
                      {fmtMoney(Number(line.unit_price ?? 0))} × {n(mult, 3)} = <b>{fmtMoney(p.linePrice)}</b>
                    </MathStep>
                  )}
                </div>
              </div>
            )
          })}
        </section>
      ))}

      {/* Adders */}
      <section className="space-y-3">
        <h2 className="font-mono text-[11px] uppercase tracking-widest text-slate-500">Added costs</h2>
        <div className="rounded-lg border-2 border-slate-800 bg-white p-4 text-sm space-y-3">
          <MathStep label="Job facts the added costs use" muted>
            {n(pricing.installHours)} install hrs · {n(pricing.lfTotal)} LF · {n(Number(bid.distance_miles ?? 0))} miles ·{' '}
            {Number(bid.install_heads ?? 1)} install heads. "Cabinet work" below means assembly
            lines only — one-offs and subs don't get the percentage added costs.
          </MathStep>
          {pricing.adders.map((a) => (
            <MathStep key={a.key} label={a.label + (a.enabled ? '' : ' (OFF)')}>
              <AdderFormula adderKey={a.key} pricing={pricing} s={s} bid={bid} /> = <b>{fmtMoney(a.price)}</b>
            </MathStep>
          ))}
        </div>
      </section>

      {/* Totals */}
      <section className="space-y-3">
        <h2 className="font-mono text-[11px] uppercase tracking-widest text-slate-500">Totals</h2>
        <div className="rounded-lg border-2 border-slate-800 bg-white p-4 text-sm space-y-2">
          <MathStep label="Base bid">all line totals added up = <b>{fmtMoney(pricing.cabinetTotal)}</b></MathStep>
          <MathStep label="Contract">
            {fmtMoney(pricing.cabinetTotal)} + {fmtMoney(pricing.addersTotal)} added costs = <b>{fmtMoney(pricing.contractAmount)}</b>
          </MathStep>
          <MathStep label="Tax">
            {bid.tax_exempt ? 'tax exempt = $0' : <>{fmtMoney(pricing.contractAmount)} × {n((s.tax_rate ?? 0) * 100)}% = <b>{fmtMoney(pricing.tax)}</b></>}
          </MathStep>
          <MathStep label="True cost">
            materials at cost + labor at {fmtMoney(s.cost_shop_rate ?? 0)}/hr + adder costs = <b>{fmtMoney(pricing.trueCost)}</b>
          </MathStep>
          <MathStep label="Projected profit">
            {fmtMoney(pricing.contractAmount)} − {fmtMoney(pricing.trueCost)} = <b>{fmtMoney(pricing.profit)}</b>{' '}
            ({pricing.marginPct == null ? '—' : `${(pricing.marginPct * 100).toFixed(1)}%`})
          </MathStep>
        </div>
      </section>
    </div>
  )
}

function MathStep({ label, children, muted }: { label: string; children: React.ReactNode; muted?: boolean }) {
  return (
    <div className={muted ? 'text-slate-400' : ''}>
      <div className="font-mono text-[10px] uppercase tracking-widest text-slate-400">{label}</div>
      <div className="tabular-nums">{children}</div>
    </div>
  )
}

function AdderFormula({
  adderKey, pricing, s, bid,
}: {
  adderKey: string
  pricing: NonNullable<ReturnType<typeof priceBid>>
  s: Record<string, number>
  bid: Bid
}) {
  const n = (x: number, d = 2) => Number(x.toFixed(d)).toLocaleString()
  const dist = Number(bid.distance_miles ?? 0)
  const heads = Math.max(1, Number(bid.install_heads ?? 1))
  switch (adderKey) {
    case 'install':
      return <>{n(pricing.installHours)} hrs × {fmtMoney(s.install_rate ?? 0)}/hr + 2 trips × {n(dist)} mi × {fmtMoney(s.fuel_price_per_mile ?? 0)}/mi</>
    case 'delivery':
      return <>{n(pricing.lfTotal)} LF × rate {dist >= (s.delivery_distance_threshold ?? Infinity) ? fmtMoney(s.delivery_rate_out_of_town ?? 0) : fmtMoney(s.delivery_rate_in_town ?? 0)}/LF{pricing.lfTotal >= (s.equipment_kicker_threshold_lf ?? Infinity) ? <> + {fmtMoney(s.equipment_kicker ?? 0)} kicker (over {n(s.equipment_kicker_threshold_lf ?? 0)} LF)</> : null}</>
    case 'design':
      return <>{n(pricing.lfTotal)} LF × {n(s.design_hours_per_lf ?? 0)} hrs/LF × {fmtMoney(s.install_rate ?? 0)}/hr + {n(dist)} mi × {fmtMoney(s.fuel_price_per_mile ?? 0)}/mi</>
    case 'punch':
      return <>{n(dist)} mi × {fmtMoney(s.fuel_price_per_mile ?? 0)}/mi + cabinet work × {n((s.punch_pct ?? 0) * 100)}%</>
    case 'per_diem':
      return dist >= (s.per_diem_distance_threshold ?? Infinity)
        ? <>{n(pricing.installHours)} hrs ÷ {heads} heads ÷ {n(s.per_diem_workday_hours ?? 10)} = days × {heads} × {fmtMoney(s.per_diem_rate ?? 0)}</>
        : <>{n(dist)} mi is under the {n(s.per_diem_distance_threshold ?? 0)}-mile line</>
    case 'lodging':
      return dist >= (s.per_diem_distance_threshold ?? Infinity)
        ? <>{Math.ceil(heads / 2)} rooms × {fmtMoney(s.hotel_rate ?? 0)} × {pricing.installDays} nights</>
        : <>{n(dist)} mi is under the {n(s.per_diem_distance_threshold ?? 0)}-mile line</>
    case 'general_conditions':
      return <>cabinet work × {n((s.gc_pct_price ?? 0) * 100)}%</>
    case 'insurance':
      return <>(cabinet work + added costs above, minus one-offs/per diem/lodging) × {n((s.insurance_pct ?? 0) * 100)}%</>
    default:
      return null
  }
}
