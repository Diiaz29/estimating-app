import { describe, expect, it, vi } from 'vitest'
import { buildContext, priceBid, priceLine, resolveMaterialId } from './pricing'
import type {
  Area,
  Assembly,
  AssemblyMaterial,
  Bid,
  BidAdders,
  BidFinish,
  Finish,
  LineItem,
  Material,
  Setting,
} from './types'

// A recent timestamp so nothing reads as stale unless a test says so.
const FRESH = '2026-07-20T00:00:00Z'
const STALE = '2026-01-01T00:00:00Z'

// --- fixture builders -------------------------------------------------------

function setting(key: string, value: number): Setting {
  return { key, label: key, group_name: 'test', value, format: 'number', sort_order: 0 }
}

// A round, predictable set of rates so hand-computed expectations stay readable.
const SETTINGS: Setting[] = [
  setting('material_markup', 1.2),
  setting('sub_markup', 1.15),
  setting('price_shop_rate', 60),
  setting('cost_shop_rate', 30),
  setting('install_rate', 45),
  setting('fuel_price_per_mile', 1),
  setting('fuel_cost_per_mile', 0.5),
  setting('delivery_rate_in_town', 2),
  setting('delivery_rate_out_of_town', 4),
  setting('delivery_distance_threshold', 50),
  setting('equipment_kicker', 1300),
  setting('equipment_kicker_threshold_lf', 100),
  setting('design_hours_per_lf', 0.1),
  setting('punch_pct', 0.02),
  setting('per_diem_rate', 50),
  setting('per_diem_distance_threshold', 50),
  setting('per_diem_workday_hours', 10),
  setting('hotel_rate', 175),
  setting('gc_pct_price', 0.05),
  setting('gc_pct_cost', 0.05),
  setting('insurance_pct', 0.03),
  setting('overhead_pct', 0.1),
  setting('tax_rate', 0.0675),
  setting('price_staleness_days', 90),
]

const MELAMINE: Material = {
  id: 'mat-mel', category: 'panel', name: '3/4 Melamine', unit: 'sheet', cost: 40,
  supplier: 'ACME', notes: null, active: true, cost_updated_at: FRESH,
  created_at: FRESH, updated_at: FRESH,
}
const PREFIN: Material = { ...MELAMINE, id: 'mat-prefin', name: 'Prefinished Ply', cost: 60 }
const NO_COST: Material = { ...MELAMINE, id: 'mat-nocost', name: 'Mystery Panel', cost: null }

const LAMINATE: Finish = {
  id: 'fin-lam', type: 'Laminate', name: 'Std Laminate', brand: null, color_code: null,
  grade: null, unit: 'sq ft', cost: 2, supplier: null, default_slot: 'CABINET_LAM',
  active: true, cost_updated_at: FRESH,
}

// Base cabinet: EA, 60 build min, 30 install min, 24" typical width.
// BOM: 0.5 sheet melamine (no waste) + 6 sq ft CABINET_LAM slot (no waste).
const BASE_CAB: Assembly = {
  id: 'asm-base', category: 'base', name: 'Base Cabinet', description: null,
  pricing_unit: 'EA', build_minutes: 60, install_minutes: 30, typical_width_in: 24,
  width_confirmed: true, active: true, sort_order: 0,
}
const BASE_BOM: AssemblyMaterial[] = [
  { id: 'bom-1', assembly_id: 'asm-base', material_id: 'mat-mel', slot: null, label: 'Box', qty: 0.5, waste_pct: 0 },
  { id: 'bom-2', assembly_id: 'asm-base', material_id: null, slot: 'CABINET_LAM', label: 'Face', qty: 6, waste_pct: 0 },
]

const ALL_ADDERS: BidAdders = {
  install: true, delivery: true, design: true, punch: true,
  per_diem: true, lodging: true, general_conditions: true, insurance: true,
}
const NO_ADDERS: BidAdders = {
  install: false, delivery: false, design: false, punch: false,
  per_diem: false, lodging: false, general_conditions: false, insurance: false,
}

function makeBid(over: Partial<Bid> = {}): Bid {
  return {
    id: 'bid-1', job_number: '26-001', name: 'Test Job', status: 'working',
    due_at: null, address: null, distance_miles: 0, labor_heads: 1, install_heads: 1,
    tax_exempt: false, bid_value: null, drawings_date: null, adders: NO_ADDERS,
    inclusions: null, exclusions: null, notes: null, lost_reason: null,
    sent_at: null, followup_days: null, completed_at: null,
    price_adjustment: 0, adjustment_note: null, adjustment_visible: false,
    created_at: FRESH, updated_at: FRESH, ...over,
  }
}

function makeArea(over: Partial<Area> = {}): Area {
  return { id: 'area-1', bid_id: 'bid-1', name: 'Kitchen', sheet_ref: null, multiplier: 1, is_alternate: false, inclusions: null, exclusions: null, change_order_id: null, sort_order: 0, ...over }
}

function assemblyLine(over: Partial<LineItem> = {}): LineItem {
  return {
    id: 'line-1', area_id: 'area-1', kind: 'assembly', assembly_id: 'asm-base',
    name: null, quantity: 1, entry_mode: 'unit', entry_value: null, unit_price: null,
    unit_cost: null, rate_override: null, note: null, sort_order: 0, ...over,
  }
}

function ctxWith(opts: {
  materials?: Material[]
  finishes?: BidFinish[]
  materialOverrides?: Map<string, string>
  areaOverrides?: Map<string, Map<string, string>>
} = {}) {
  return buildContext(
    SETTINGS,
    [BASE_CAB],
    BASE_BOM,
    opts.materials ?? [MELAMINE, PREFIN, NO_COST],
    opts.finishes ?? [{ bid_id: 'bid-1', slot: 'CABINET_LAM', finish_id: 'fin-lam', finish: LAMINATE }],
    opts.materialOverrides,
    opts.areaOverrides,
  )
}

// Hand-computed reference for ONE base cabinet with the fixture above:
//   material cost = 0.5×40 (melamine) + 6×2 (laminate) = 20 + 12 = 32
//   material price = 32 × 1.2 = 38.4
//   labor price = (60/60) × 60 = 60 ; labor cost = (60/60) × 30 = 30
//   line price = 38.4 + 60 = 98.4 ; line cost = 32 + 30 = 62
//   install hours = 30/60 = 0.5 ; lfEquivalent = 24/12 = 2
const ONE_CAB = { price: 98.4, cost: 62, materialCost: 32, installHours: 0.5, lf: 2 }

// --- priceLine --------------------------------------------------------------

describe('priceLine — assembly', () => {
  it('computes material/labor price and cost from the BOM and rates', () => {
    const p = priceLine(assemblyLine(), makeArea(), ctxWith())
    expect(p.materialCost).toBeCloseTo(ONE_CAB.materialCost, 6)
    expect(p.materialPrice).toBeCloseTo(38.4, 6)
    expect(p.laborPrice).toBeCloseTo(60, 6)
    expect(p.laborCost).toBeCloseTo(30, 6)
    expect(p.linePrice).toBeCloseTo(ONE_CAB.price, 6)
    expect(p.lineCost).toBeCloseTo(ONE_CAB.cost, 6)
    expect(p.installHours).toBeCloseTo(ONE_CAB.installHours, 6)
    expect(p.lfEquivalent).toBeCloseTo(ONE_CAB.lf, 6)
    expect(p.warnings).toHaveLength(0)
  })

  it('scales by line quantity and area multiplier together', () => {
    const p = priceLine(assemblyLine({ quantity: 3 }), makeArea({ multiplier: 2 }), ctxWith())
    // 3 × 2 = 6 units
    expect(p.linePrice).toBeCloseTo(ONE_CAB.price * 6, 6)
    expect(p.installHours).toBeCloseTo(ONE_CAB.installHours * 6, 6)
  })

  it('honors a rate override (per unit, still ×multiplier)', () => {
    const p = priceLine(assemblyLine({ rate_override: 100, quantity: 2 }), makeArea(), ctxWith())
    expect(p.linePrice).toBeCloseTo(200, 6)
  })

  it('emits a no-cost warning and zero cost for a blank-cost material', () => {
    // swap the melamine BOM row's material to the no-cost one via a job override
    const overrides = new Map([['mat-mel', 'mat-nocost']])
    const p = priceLine(assemblyLine(), makeArea(), ctxWith({ materialOverrides: overrides }))
    expect(p.warnings.some((w) => w.kind === 'no-cost')).toBe(true)
    // only the laminate (6×2=12) still contributes; melamine row is skipped at 0
    expect(p.materialCost).toBeCloseTo(12, 6)
  })

  it('emits a stale warning when a material cost is older than the threshold', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-23T00:00:00Z'))
    const stale: Material = { ...MELAMINE, cost_updated_at: STALE }
    const p = priceLine(assemblyLine(), makeArea(), ctxWith({ materials: [stale, PREFIN, NO_COST] }))
    expect(p.warnings.some((w) => w.kind === 'stale')).toBe(true)
    vi.useRealTimers()
  })

  it('warns when a finish slot has no assignment', () => {
    const p = priceLine(assemblyLine(), makeArea(), ctxWith({ finishes: [] }))
    expect(p.warnings.some((w) => w.kind === 'unassigned-slot')).toBe(true)
  })
})

describe('priceLine — manual and sub', () => {
  it('prices a manual line at its unit price/cost', () => {
    const line = assemblyLine({ kind: 'manual', assembly_id: null, name: 'Custom crate', unit_price: 500, unit_cost: 300, quantity: 2 })
    const p = priceLine(line, makeArea(), ctxWith())
    expect(p.linePrice).toBeCloseTo(1000, 6)
    expect(p.lineCost).toBeCloseTo(600, 6)
  })

  it('marks up a sub quote forward (quote × sub_markup), cost is the raw quote', () => {
    const line = assemblyLine({ kind: 'sub', assembly_id: null, name: 'Quartz tops', unit_price: 1000, quantity: 1 })
    const p = priceLine(line, makeArea(), ctxWith())
    expect(p.linePrice).toBeCloseTo(1150, 6) // 1000 × 1.15
    expect(p.lineCost).toBeCloseTo(1000, 6)
  })

  it('warns when a sub quote is missing', () => {
    const line = assemblyLine({ kind: 'sub', assembly_id: null, name: 'TBD sub', unit_price: null })
    const p = priceLine(line, makeArea(), ctxWith())
    expect(p.warnings.some((w) => w.kind === 'no-cost')).toBe(true)
  })
})

// --- resolveMaterialId (override precedence) --------------------------------

describe('resolveMaterialId — area beats job beats standard', () => {
  it('falls through to the standard material with no overrides', () => {
    expect(resolveMaterialId(ctxWith(), 'area-1', 'mat-mel')).toBe('mat-mel')
  })
  it('applies a job-wide override', () => {
    const ctx = ctxWith({ materialOverrides: new Map([['mat-mel', 'mat-prefin']]) })
    expect(resolveMaterialId(ctx, 'area-1', 'mat-mel')).toBe('mat-prefin')
  })
  it('lets an area override beat the job override', () => {
    const ctx = ctxWith({
      materialOverrides: new Map([['mat-mel', 'mat-prefin']]),
      areaOverrides: new Map([['area-1', new Map([['mat-mel', 'mat-nocost']])]]),
    })
    expect(resolveMaterialId(ctx, 'area-1', 'mat-mel')).toBe('mat-nocost')
    // a different area still gets the job override
    expect(resolveMaterialId(ctx, 'area-2', 'mat-mel')).toBe('mat-prefin')
  })
})

// --- priceBid ---------------------------------------------------------------

describe('priceBid — totals and adders', () => {
  const areas = [makeArea()]
  const lines = new Map([['area-1', [assemblyLine()]]])

  it('with no adders: contract = cabinet total, tax applied', () => {
    const bid = makeBid({ adders: NO_ADDERS })
    const r = priceBid(bid, areas, lines, ctxWith())
    expect(r.cabinetTotal).toBeCloseTo(ONE_CAB.price, 6)
    expect(r.addersTotal).toBeCloseTo(0, 6)
    expect(r.contractAmount).toBeCloseTo(ONE_CAB.price, 6)
    expect(r.tax).toBeCloseTo(ONE_CAB.price * 0.0675, 6)
    expect(r.trueCost).toBeCloseTo(ONE_CAB.cost, 6)
    expect(r.profit).toBeCloseTo(ONE_CAB.price - ONE_CAB.cost, 6)
    expect(r.marginPct).toBeCloseTo((ONE_CAB.price - ONE_CAB.cost) / ONE_CAB.price, 6)
  })

  it('tax_exempt zeroes the tax', () => {
    const r = priceBid(makeBid({ tax_exempt: true }), areas, lines, ctxWith())
    expect(r.tax).toBe(0)
  })

  it('overhead is computed for display but not subtracted from profit', () => {
    const r = priceBid(makeBid(), areas, lines, ctxWith())
    expect(r.overhead).toBeCloseTo(r.contractAmount * 0.1, 6)
    expect(r.profit).toBeCloseTo(r.contractAmount - r.trueCost, 6)
  })

  it('install adder = hours×rate + 2 trips of fuel', () => {
    // distance 10 → fuel trip price = 10×1 = 10 ; install price = 0.5×45 + 2×10 = 42.5
    const bid = makeBid({ distance_miles: 10, adders: { ...NO_ADDERS, install: true } })
    const r = priceBid(bid, areas, lines, ctxWith())
    const install = r.adders.find((a) => a.key === 'install')!
    expect(install.price).toBeCloseTo(0.5 * 45 + 2 * 10, 6)
    expect(install.cost).toBeCloseTo(0.5 * 45 + 2 * 5, 6) // fuel cost 0.5/mi
  })

  it('delivery uses in-town rate under threshold and skips the kicker below LF threshold', () => {
    // one cab → lfEquivalent 2, distance 10 (< 50) → in-town rate 2 → delivery = 2×2 = 4
    const bid = makeBid({ distance_miles: 10, adders: { ...NO_ADDERS, delivery: true } })
    const r = priceBid(bid, areas, lines, ctxWith())
    const delivery = r.adders.find((a) => a.key === 'delivery')!
    expect(delivery.price).toBeCloseTo(4, 6)
  })

  it('delivery uses out-of-town rate and adds the equipment kicker past both thresholds', () => {
    // 60 cabs → lf 120 (≥100 kicker threshold), distance 60 (≥50) → out-of-town rate 4
    const manyLines = new Map([['area-1', [assemblyLine({ quantity: 60 })]]])
    const bid = makeBid({ distance_miles: 60, adders: { ...NO_ADDERS, delivery: true } })
    const r = priceBid(bid, areas, manyLines, ctxWith())
    const delivery = r.adders.find((a) => a.key === 'delivery')!
    expect(r.lfTotal).toBeCloseTo(120, 6)
    expect(delivery.price).toBeCloseTo(120 * 4 + 1300, 6)
  })

  it('per diem and lodging are zero under the distance threshold', () => {
    const bid = makeBid({ distance_miles: 10, adders: { ...NO_ADDERS, per_diem: true, lodging: true } })
    const r = priceBid(bid, areas, lines, ctxWith())
    expect(r.adders.find((a) => a.key === 'per_diem')!.price).toBe(0)
    expect(r.adders.find((a) => a.key === 'lodging')!.price).toBe(0)
  })

  it('per diem and lodging kick in past the distance threshold', () => {
    // 60 cabs: installHours = 60×0.5 = 30 ; heads 2 ; workday 10 → daysFrac = 30/2/10 = 1.5, days=2
    const manyLines = new Map([['area-1', [assemblyLine({ quantity: 60 })]]])
    const bid = makeBid({ distance_miles: 60, install_heads: 2, adders: { ...NO_ADDERS, per_diem: true, lodging: true } })
    const r = priceBid(bid, areas, manyLines, ctxWith())
    expect(r.adders.find((a) => a.key === 'per_diem')!.price).toBeCloseTo(1.5 * 2 * 50, 6) // 150
    expect(r.adders.find((a) => a.key === 'lodging')!.price).toBeCloseTo(Math.ceil(2 / 2) * 175 * 2, 6) // 350
  })

  it('sums enabled adders into the contract and excludes disabled ones', () => {
    const allOn = priceBid(makeBid({ distance_miles: 10, adders: ALL_ADDERS }), areas, lines, ctxWith())
    const allOff = priceBid(makeBid({ distance_miles: 10, adders: NO_ADDERS }), areas, lines, ctxWith())
    expect(allOn.contractAmount).toBeGreaterThan(allOff.contractAmount)
    expect(allOff.addersTotal).toBe(0)
  })
})

describe('priceBid — alternates', () => {
  it('keeps alternate areas out of the base cabinet total and install hours', () => {
    const areas = [makeArea(), makeArea({ id: 'area-2', name: 'Alt', is_alternate: true })]
    const lines = new Map([
      ['area-1', [assemblyLine()]],
      ['area-2', [assemblyLine({ id: 'line-2', area_id: 'area-2' })]],
    ])
    const r = priceBid(makeBid(), areas, lines, ctxWith())
    expect(r.cabinetTotal).toBeCloseTo(ONE_CAB.price, 6)
    expect(r.alternatesTotal).toBeCloseTo(ONE_CAB.price, 6)
    // install hours come only from the base area
    expect(r.installHours).toBeCloseTo(ONE_CAB.installHours, 6)
  })
})
