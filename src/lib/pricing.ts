// The pricing engine — plan §5, implemented as pure functions.
// Everything reads from the libraries and Settings; nothing is hardcoded here.
import type {
  Area,
  Assembly,
  AssemblyMaterial,
  Bid,
  BidFinish,
  Finish,
  LineItem,
  Material,
  Setting,
} from './types'
import { daysSince } from './format'

export interface PricingContext {
  settings: Record<string, number>
  assemblies: Map<string, Assembly>
  bomByAssembly: Map<string, AssemblyMaterial[]>
  materials: Map<string, Material>
  finishBySlot: Map<string, Finish>
  /** job-level spec swaps: from_material_id → to_material_id */
  materialOverrides: Map<string, string>
  /** per-area swaps, keyed by area id — beat the job-level swap */
  areaOverrides: Map<string, Map<string, string>>
  staleDays: number
}

/** A room's pick beats the job-wide pick, which beats the standard material. */
export function resolveMaterialId(ctx: PricingContext, areaId: string | null, materialId: string): string {
  const areaHit = areaId ? ctx.areaOverrides.get(areaId)?.get(materialId) : undefined
  return areaHit ?? ctx.materialOverrides.get(materialId) ?? materialId
}

export function buildContext(
  settings: Setting[],
  assemblies: Assembly[],
  bom: AssemblyMaterial[],
  materials: Material[],
  bidFinishes: BidFinish[],
  materialOverrides: Map<string, string> = new Map(),
  areaOverrides: Map<string, Map<string, string>> = new Map(),
): PricingContext {
  const s: Record<string, number> = {}
  for (const row of settings) s[row.key] = Number(row.value)
  const bomMap = new Map<string, AssemblyMaterial[]>()
  for (const row of bom) {
    if (!bomMap.has(row.assembly_id)) bomMap.set(row.assembly_id, [])
    bomMap.get(row.assembly_id)!.push(row)
  }
  const finishBySlot = new Map<string, Finish>()
  for (const bf of bidFinishes) if (bf.finish) finishBySlot.set(bf.slot, bf.finish)
  return {
    settings: s,
    assemblies: new Map(assemblies.map((a) => [a.id, a])),
    bomByAssembly: bomMap,
    materials: new Map(materials.map((m) => [m.id, m])),
    finishBySlot,
    materialOverrides,
    areaOverrides,
    staleDays: s.price_staleness_days ?? 90,
  }
}

export interface Warning {
  kind: 'no-cost' | 'stale' | 'unassigned-slot' | 'no-assembly'
  message: string
}

export interface BomDetailRow {
  label: string
  source: string          // resolved material/finish name
  qty: number             // per pricing unit
  wastePct: number
  unitCost: number | null
  rowCost: number         // qty × (1+waste) × unitCost, per pricing unit
}

export interface LinePricing {
  materialCost: number
  materialPrice: number
  laborPrice: number
  laborCost: number
  installHours: number
  linePrice: number
  lineCost: number
  lfEquivalent: number
  unitMaterialCost: number
  bomDetail: BomDetailRow[]
  warnings: Warning[]
}

/** Price one line item (already includes the area multiplier). */
export function priceLine(line: LineItem, area: Area, ctx: PricingContext): LinePricing {
  const mult = Number(area.multiplier) * Number(line.quantity)
  const warnings: Warning[] = []

  if (line.kind === 'manual') {
    const unit = Number(line.unit_price ?? 0)
    const unitCost = line.unit_cost == null ? unit : Number(line.unit_cost)
    if (line.unit_price == null) warnings.push({ kind: 'no-cost', message: `${line.name}: no price entered` })
    return {
      materialCost: 0, materialPrice: 0, laborPrice: 0, laborCost: 0, installHours: 0,
      linePrice: unit * mult, lineCost: unitCost * mult, lfEquivalent: 0,
      unitMaterialCost: 0, bomDetail: [], warnings,
    }
  }

  if (line.kind === 'sub') {
    const quote = Number(line.unit_price ?? 0)
    if (line.unit_price == null) warnings.push({ kind: 'no-cost', message: `${line.name}: no sub quote entered` })
    const markup = ctx.settings.sub_markup ?? 1
    // entered forward: quote × markup — no back-division (plan §5)
    return {
      materialCost: 0, materialPrice: 0, laborPrice: 0, laborCost: 0, installHours: 0,
      linePrice: quote * markup * mult, lineCost: quote * mult, lfEquivalent: 0,
      unitMaterialCost: 0, bomDetail: [], warnings,
    }
  }

  const assembly = line.assembly_id ? ctx.assemblies.get(line.assembly_id) : undefined
  if (!assembly) {
    return {
      materialCost: 0, materialPrice: 0, laborPrice: 0, laborCost: 0, installHours: 0,
      linePrice: 0, lineCost: 0, lfEquivalent: 0,
      unitMaterialCost: 0, bomDetail: [],
      warnings: [{ kind: 'no-assembly', message: 'Line has no assembly' }],
    }
  }

  // per-unit material cost from the BOM, slots resolved through the job's finish assignments
  let unitMaterialCost = 0
  const bomDetail: BomDetailRow[] = []
  for (const row of ctx.bomByAssembly.get(assembly.id) ?? []) {
    let cost: number | null = null
    let sourceName = row.label ?? ''
    let costUpdatedAt: string | null = null
    if (row.slot) {
      const finish = ctx.finishBySlot.get(row.slot)
      if (!finish) {
        warnings.push({ kind: 'unassigned-slot', message: `${assembly.name}: slot ${row.slot} has no finish assigned` })
        continue
      }
      cost = finish.cost == null ? null : Number(finish.cost)
      sourceName = finish.name
      costUpdatedAt = finish.cost_updated_at
    } else if (row.material_id) {
      // spec swaps: this room's pick → job-wide pick → standard
      const effectiveId = resolveMaterialId(ctx, area.id, row.material_id)
      const material = ctx.materials.get(effectiveId)
      cost = material?.cost == null ? null : Number(material.cost)
      sourceName = material?.name ?? sourceName
      costUpdatedAt = material?.cost_updated_at ?? null
    }
    if (cost == null) {
      warnings.push({ kind: 'no-cost', message: `${sourceName}: no cost in the library` })
      bomDetail.push({ label: row.label ?? sourceName, source: sourceName, qty: Number(row.qty), wastePct: Number(row.waste_pct), unitCost: null, rowCost: 0 })
      continue
    }
    if (costUpdatedAt && daysSince(costUpdatedAt) >= ctx.staleDays) {
      warnings.push({ kind: 'stale', message: `${sourceName}: price is ${daysSince(costUpdatedAt)} days old` })
    }
    const rowCost = Number(row.qty) * (1 + Number(row.waste_pct)) * cost
    bomDetail.push({ label: row.label ?? sourceName, source: sourceName, qty: Number(row.qty), wastePct: Number(row.waste_pct), unitCost: cost, rowCost })
    unitMaterialCost += rowCost
  }

  const s = ctx.settings
  const materialCost = unitMaterialCost * mult
  const materialPrice = materialCost * (s.material_markup ?? 1)
  const laborPrice = (Number(assembly.build_minutes) / 60) * (s.price_shop_rate ?? 0) * mult
  const laborCost = (Number(assembly.build_minutes) / 60) * (s.cost_shop_rate ?? 0) * mult
  const installHours = (Number(assembly.install_minutes) / 60) * mult

  const computedPrice = materialPrice + laborPrice
  const linePrice = line.rate_override != null ? Number(line.rate_override) * mult : computedPrice

  // delivery/design math wants feet of run: LF is already feet, EA converts by
  // typical width, SF divides square feet by the top's depth
  const lfEquivalent =
    assembly.pricing_unit === 'LF'
      ? mult
      : assembly.pricing_unit === 'SF'
        ? mult / (Number(assembly.typical_width_in ?? 25) / 12)
        : mult * (Number(assembly.typical_width_in ?? 24) / 12)

  return {
    materialCost,
    materialPrice,
    laborPrice,
    laborCost,
    installHours,
    linePrice,
    lineCost: materialCost + laborCost,
    lfEquivalent,
    unitMaterialCost,
    bomDetail,
    warnings,
  }
}

export interface AdderBreakdown {
  key: keyof import('./types').BidAdders
  label: string
  price: number
  cost: number
  enabled: boolean
}

/** Cost side split into buckets that can be compared against real job actuals. */
export interface CostBreakdown {
  materials: number
  shopLabor: number
  shopHours: number
  install: number       // install labor + trip fuel, at cost basis
  delivery: number
  travel: number        // per diem + lodging
  subs: number          // sub quotes at cost
  other: number         // one-off items at cost + punch/GC/insurance cost side
}

export interface BidPricing {
  areaTotals: Map<string, { price: number; warnings: Warning[] }>
  cabinetTotal: number
  alternatesTotal: number
  installHours: number
  installDays: number
  lfTotal: number
  adders: AdderBreakdown[]
  addersTotal: number
  contractAmount: number
  tax: number
  trueCost: number
  overhead: number
  profit: number
  marginPct: number | null
  costBreakdown: CostBreakdown
  warnings: Warning[]
}

/** The whole job: areas → cabinet total → adders → contract, plus the internal cost side. */
export function priceBid(
  bid: Bid,
  areas: Area[],
  linesByArea: Map<string, LineItem[]>,
  ctx: PricingContext,
): BidPricing {
  const s = ctx.settings
  const areaTotals = new Map<string, { price: number; warnings: Warning[] }>()
  let cabinetTotal = 0
  let alternatesTotal = 0
  let installHours = 0
  let lfTotal = 0
  let baseCost = 0
  const warnings: Warning[] = []

  // Assembly-built work only (V9's percentage adders apply to this, not to
  // one-off items or sub quotes)
  let assemblyTotal = 0
  let costMaterials = 0
  let costShopLabor = 0
  let costShopHours = 0
  let costSubs = 0
  let costOneOffs = 0

  for (const area of areas) {
    let areaPrice = 0
    const areaWarnings: Warning[] = []
    for (const line of linesByArea.get(area.id) ?? []) {
      const p = priceLine(line, area, ctx)
      areaPrice += p.linePrice
      areaWarnings.push(...p.warnings)
      if (!area.is_alternate) {
        installHours += p.installHours
        lfTotal += p.lfEquivalent
        baseCost += p.lineCost
        if (line.kind === 'assembly') {
          assemblyTotal += p.linePrice
          costMaterials += p.materialCost
          costShopLabor += p.laborCost
          const rate = ctx.settings.cost_shop_rate ?? 0
          costShopHours += rate > 0 ? p.laborCost / rate : 0
        } else if (line.kind === 'sub') {
          costSubs += p.lineCost
        } else {
          costOneOffs += p.lineCost
        }
      }
    }
    areaTotals.set(area.id, { price: areaPrice, warnings: areaWarnings })
    if (area.is_alternate) alternatesTotal += areaPrice
    else cabinetTotal += areaPrice
    warnings.push(...areaWarnings)
  }

  const distance = Number(bid.distance_miles ?? 0)
  const heads = Math.max(1, Number(bid.install_heads ?? 1))
  // V9 basis: a per-diem "day" is install hours per head ÷ workday hours (fractional)
  const workday = s.per_diem_workday_hours ?? 10
  const installDaysFrac = installHours > 0 ? installHours / heads / workday : 0
  const installDays = Math.ceil(installDaysFrac)
  const farJob = distance >= (s.per_diem_distance_threshold ?? Infinity)

  const enabled = bid.adders

  const fuelTrip = distance * (s.fuel_price_per_mile ?? 0)
  const fuelTripCost = distance * (s.fuel_cost_per_mile ?? 0)

  // V9 charges install fuel for two trips (delivery run + install run)
  const installPrice = installHours * (s.install_rate ?? 0) + 2 * fuelTrip
  const installCost = installHours * (s.install_rate ?? 0) + 2 * fuelTripCost

  const deliveryRate = distance >= (s.delivery_distance_threshold ?? Infinity)
    ? (s.delivery_rate_out_of_town ?? 0)
    : (s.delivery_rate_in_town ?? 0)
  const kicker = lfTotal >= (s.equipment_kicker_threshold_lf ?? Infinity) ? (s.equipment_kicker ?? 0) : 0
  const delivery = lfTotal * deliveryRate + kicker

  // V9: design = LF × hours-per-LF × install rate, plus the site-visit trip's fuel
  const design = lfTotal * (s.design_hours_per_lf ?? 0) * (s.install_rate ?? 0) + fuelTrip
  const punch = fuelTrip + assemblyTotal * (s.punch_pct ?? 0)
  const punchCost = fuelTripCost + assemblyTotal * (s.punch_pct ?? 0)

  const perDiem = farJob ? installDaysFrac * heads * (s.per_diem_rate ?? 0) : 0
  const lodging = farJob ? Math.ceil(heads / 2) * (s.hotel_rate ?? 0) * installDays : 0

  const gc = assemblyTotal * (s.gc_pct_price ?? 0)
  const gcCost = assemblyTotal * (s.gc_pct_cost ?? 0)

  // V9 insurance base: assembly work + adders, excluding one-off items, per diem, lodging
  const preInsurance =
    assemblyTotal +
    (enabled.install ? installPrice : 0) +
    (enabled.delivery ? delivery : 0) +
    (enabled.design ? design : 0) +
    (enabled.punch ? punch : 0) +
    (enabled.general_conditions ? gc : 0)
  const insurance = preInsurance * (s.insurance_pct ?? 0)

  const adders: AdderBreakdown[] = [
    { key: 'install', label: 'Install labor + fuel', price: installPrice, cost: installCost, enabled: enabled.install },
    { key: 'delivery', label: `Delivery${kicker > 0 ? ' (incl. equipment kicker)' : ''}`, price: delivery, cost: delivery, enabled: enabled.delivery },
    { key: 'design', label: 'Site visit / design', price: design, cost: 0, enabled: enabled.design },
    { key: 'punch', label: 'Punch list', price: punch, cost: punchCost, enabled: enabled.punch },
    { key: 'per_diem', label: `Per diem${farJob ? ` (${installDaysFrac.toFixed(1)}d × ${heads})` : ' (under mileage threshold)'}`, price: perDiem, cost: perDiem, enabled: enabled.per_diem },
    { key: 'lodging', label: `Lodging${farJob ? ` (${Math.ceil(heads / 2)} rooms × ${installDays} nights)` : ' (under mileage threshold)'}`, price: lodging, cost: lodging, enabled: enabled.lodging },
    { key: 'general_conditions', label: 'General conditions', price: gc, cost: gcCost, enabled: enabled.general_conditions },
    { key: 'insurance', label: 'Insurance', price: insurance, cost: insurance, enabled: enabled.insurance },
  ]

  const addersTotal = adders.reduce((sum, a) => sum + (a.enabled ? a.price : 0), 0)
  const contractAmount = cabinetTotal + addersTotal
  const tax = bid.tax_exempt ? 0 : contractAmount * (s.tax_rate ?? 0)

  // Cost/margin side: materials at cost + labor at cost rate + subs at quote
  // + install at cost basis + direct expenses.
  // Profit does NOT additionally subtract the overhead allocation: the shop's
  // employees are salaried, so the labor-at-cost lines already carry the
  // overhead (matches V9's BUDGET, where B20 overhead cancels out of B21 cost).
  // Overhead is still computed for display as an allocation reference.
  const trueCost =
    baseCost +
    adders.reduce((sum, a) => sum + (a.enabled ? a.cost : 0), 0)
  const overhead = contractAmount * (s.overhead_pct ?? 0)
  const profit = contractAmount - trueCost
  const marginPct = contractAmount > 0 ? profit / contractAmount : null

  const costBreakdown: CostBreakdown = {
    materials: costMaterials,
    shopLabor: costShopLabor,
    shopHours: costShopHours,
    install: enabled.install ? installCost : 0,
    delivery: enabled.delivery ? delivery : 0,
    travel: (enabled.per_diem ? perDiem : 0) + (enabled.lodging ? lodging : 0),
    subs: costSubs,
    other:
      costOneOffs +
      (enabled.punch ? punchCost : 0) +
      (enabled.general_conditions ? gcCost : 0) +
      (enabled.insurance ? insurance : 0),
  }

  return {
    areaTotals,
    cabinetTotal,
    alternatesTotal,
    installHours,
    installDays,
    lfTotal,
    adders,
    addersTotal,
    contractAmount,
    tax,
    trueCost,
    overhead,
    profit,
    marginPct,
    costBreakdown,
    warnings,
  }
}
