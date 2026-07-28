import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type {
  Area, AreaMaterialOverride, Assembly, AssemblyMaterial, Bid, BidAdders, BidFinish,
  BidMaterialOverride, Finish, LineItem, Material, Revision, Setting,
} from '../lib/types'
import { buildContext, priceBid, priceLine, resolveMaterialId } from '../lib/pricing'
import { fmtCost, fmtDueDate, fmtMoney } from '../lib/format'
import ConfirmDialog from '../components/ConfirmDialog'
import ViewOnlyBanner from '../components/ViewOnlyBanner'

const SLOTS = ['CABINET_LAM', 'PLAM 1', 'PLAM 2', 'PLAM 3', 'PLAM 4', 'SS 1', 'SS 2', 'SS 3', 'SS 4']

function slotLabel(slot: string): string {
  if (slot === 'CABINET_LAM') return 'Cabinet laminate'
  if (slot.startsWith('PLAM')) return `Countertop laminate ${slot.slice(5)}`
  if (slot.startsWith('SS')) return `Solid surface ${slot.slice(3)}`
  return slot
}

/** Plain word for a piece of hardware, from its library name. */
function hardwareLabel(name: string): string {
  const n = name.toUpperCase()
  if (n.includes('PLATE')) return 'Hinge plate'
  if (n.includes('HINGE')) return 'Hinge'
  if (n.includes('SLIDE')) return 'Slide'
  if (n.includes('PULL') || n.includes('KNOB')) return 'Pull'
  if (n.includes('LOCK')) return 'Lock'
  if (n.includes('POST')) return 'Partition post'
  if (n.includes('BRACE')) return 'Speed brace'
  if (n.includes('BRACKET')) return 'Bracket'
  if (n.includes('STANDARD')) return 'Standards'
  return name
}

export default function Estimate() {
  const { id } = useParams<{ id: string }>()
  const { isAdmin, canEdit, session } = useAuth()
  const [bid, setBid] = useState<Bid | null>(null)
  const [areas, setAreas] = useState<Area[]>([])
  const [lines, setLines] = useState<LineItem[]>([])
  const [bidFinishes, setBidFinishes] = useState<BidFinish[]>([])
  const [assemblies, setAssemblies] = useState<Assembly[]>([])
  const [bom, setBom] = useState<AssemblyMaterial[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [finishes, setFinishes] = useState<Finish[]>([])
  const [settings, setSettings] = useState<Setting[]>([])
  const [overrides, setOverrides] = useState<BidMaterialOverride[]>([])
  const [areaOverrides, setAreaOverridesState] = useState<AreaMaterialOverride[]>([])
  const [revisions, setRevisions] = useState<Revision[]>([])
  const [error, setError] = useState<string | null>(null)
  const [removingArea, setRemovingArea] = useState<Area | null>(null)
  const [removingRevision, setRemovingRevision] = useState<Revision | null>(null)
  const [snapshotting, setSnapshotting] = useState(false)

  async function loadAll() {
    const [bidRes, areaRes, bfRes, asmRes, bomRes, matRes, finRes, setRes, ovrRes, revRes] = await Promise.all([
      supabase!.from('bids').select('*').eq('id', id!).single(),
      supabase!.from('areas').select('*').eq('bid_id', id!).order('sort_order').order('created_at'),
      supabase!.from('bid_finishes').select('*, finish:finishes(*)').eq('bid_id', id!),
      supabase!.from('assemblies').select('*').eq('active', true).order('sort_order'),
      supabase!.from('assembly_materials').select('*'),
      supabase!.from('materials').select('*'),
      supabase!.from('finishes').select('*').eq('active', true).order('type').order('name'),
      supabase!.from('settings').select('*'),
      supabase!.from('bid_material_overrides').select('*').eq('bid_id', id!),
      supabase!.from('revisions').select('id, bid_id, rev_number, note, contract_amount, tax, true_cost, profit, margin_pct, created_by, created_at').eq('bid_id', id!).order('rev_number', { ascending: false }),
    ])
    if (bidRes.error) return setError(bidRes.error.message)
    setBid(bidRes.data as Bid)
    const areaRows = (areaRes.data ?? []) as Area[]
    setAreas(areaRows)
    if (areaRows.length > 0) {
      const [lineRes, aoRes] = await Promise.all([
        supabase!
          .from('line_items')
          .select('*')
          .in('area_id', areaRows.map((a) => a.id))
          .order('sort_order')
          .order('created_at'),
        supabase!
          .from('area_material_overrides')
          .select('*')
          .in('area_id', areaRows.map((a) => a.id)),
      ])
      setLines((lineRes.data ?? []) as LineItem[])
      setAreaOverridesState((aoRes.data ?? []) as AreaMaterialOverride[])
    } else {
      setLines([])
      setAreaOverridesState([])
    }
    setBidFinishes((bfRes.data ?? []) as BidFinish[])
    setAssemblies((asmRes.data ?? []) as Assembly[])
    setBom((bomRes.data ?? []) as AssemblyMaterial[])
    setMaterials((matRes.data ?? []) as Material[])
    setFinishes((finRes.data ?? []) as Finish[])
    setSettings((setRes.data ?? []) as Setting[])
    setOverrides((ovrRes.data ?? []) as BidMaterialOverride[])
    setRevisions((revRes.data ?? []) as Revision[])
  }

  useEffect(() => {
    void loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // which slots does this estimate actually use?
  const usedSlots = useMemo(() => {
    const used = new Set<string>()
    for (const l of lines) {
      if (!l.assembly_id) continue
      for (const row of ctx.bomByAssembly.get(l.assembly_id) ?? []) if (row.slot) used.add(row.slot)
    }
    return used
  }, [lines, ctx])

  // which hardware do this estimate's cabinets call for (by their standard/default material)?
  const usedHardware = useMemo(() => {
    const ids = new Set<string>()
    for (const l of lines) {
      if (!l.assembly_id) continue
      for (const row of ctx.bomByAssembly.get(l.assembly_id) ?? []) {
        if (!row.material_id) continue
        const m = materials.find((x) => x.id === row.material_id)
        if (m?.category === 'HARDWARE') ids.add(m.id)
      }
    }
    return [...ids]
      .map((mid) => materials.find((m) => m.id === mid)!)
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [lines, ctx, materials])

  if (error)
    return <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>
  if (!bid || !pricing) return <p className="text-sm text-slate-500">Loading…</p>

  // ---------- mutations (optimistic where cheap) ----------
  async function addArea() {
    const { data, error } = await supabase!
      .from('areas')
      .insert({ bid_id: bid!.id, name: `Area ${areas.length + 1}`, sort_order: areas.length })
      .select('*')
      .single()
    if (error) setError(error.message)
    else setAreas((prev) => [...prev, data as Area])
  }

  async function patchArea(area: Area, fields: Partial<Area>) {
    setAreas((prev) => prev.map((a) => (a.id === area.id ? { ...a, ...fields } : a)))
    const { error } = await supabase!.from('areas').update(fields).eq('id', area.id)
    if (error) setError(error.message)
  }

  async function removeArea(area: Area) {
    setRemovingArea(null)
    setAreas((prev) => prev.filter((a) => a.id !== area.id))
    setLines((prev) => prev.filter((l) => l.area_id !== area.id))
    const { error } = await supabase!.from('areas').delete().eq('id', area.id)
    if (error) setError(error.message)
  }

  async function addLine(area: Area, partial: Partial<LineItem>) {
    const { data, error } = await supabase!
      .from('line_items')
      .insert({ area_id: area.id, sort_order: (linesByArea.get(area.id)?.length ?? 0), ...partial })
      .select('*')
      .single()
    if (error) setError(error.message)
    else setLines((prev) => [...prev, data as LineItem])
  }

  async function patchLine(line: LineItem, fields: Partial<LineItem>) {
    setLines((prev) => prev.map((l) => (l.id === line.id ? { ...l, ...fields } : l)))
    const { error } = await supabase!.from('line_items').update(fields).eq('id', line.id)
    if (error) setError(error.message)
  }

  async function removeLine(line: LineItem) {
    setLines((prev) => prev.filter((l) => l.id !== line.id))
    const { error } = await supabase!.from('line_items').delete().eq('id', line.id)
    if (error) setError(error.message)
  }

  async function assignSlot(slot: string, finishId: string | null) {
    if (finishId) {
      await supabase!.from('bid_finishes').upsert({ bid_id: bid!.id, slot, finish_id: finishId })
    } else {
      await supabase!.from('bid_finishes').delete().eq('bid_id', bid!.id).eq('slot', slot)
    }
    const { data } = await supabase!.from('bid_finishes').select('*, finish:finishes(*)').eq('bid_id', bid!.id)
    setBidFinishes((data ?? []) as BidFinish[])
  }

  async function duplicateArea(area: Area) {
    const { data: newArea, error } = await supabase!
      .from('areas')
      .insert({
        bid_id: bid!.id,
        name: `${area.name} (copy)`,
        sheet_ref: area.sheet_ref,
        multiplier: area.multiplier,
        is_alternate: area.is_alternate,
        inclusions: area.inclusions,
        exclusions: area.exclusions,
        sort_order: areas.length,
      })
      .select('*')
      .single()
    if (error) return setError(error.message)
    const source = linesByArea.get(area.id) ?? []
    if (source.length > 0) {
      await supabase!.from('line_items').insert(
        source.map(({ id: _id, area_id: _a, ...rest }) => ({ ...rest, area_id: newArea.id })),
      )
    }
    // room-specific hardware picks come along too
    const roomOvr = areaOverrides.filter((o) => o.area_id === area.id)
    if (roomOvr.length > 0) {
      await supabase!.from('area_material_overrides').insert(
        roomOvr.map((o) => ({ area_id: newArea.id, from_material_id: o.from_material_id, to_material_id: o.to_material_id })),
      )
    }
    void loadAll()
  }

  async function setAreaOverride(areaId: string, fromId: string, toId: string | null) {
    if (toId) {
      await supabase!
        .from('area_material_overrides')
        .upsert({ area_id: areaId, from_material_id: fromId, to_material_id: toId })
    } else {
      await supabase!
        .from('area_material_overrides')
        .delete()
        .eq('area_id', areaId)
        .eq('from_material_id', fromId)
    }
    const { data } = await supabase!
      .from('area_material_overrides')
      .select('*')
      .in('area_id', areas.map((a) => a.id))
    setAreaOverridesState((data ?? []) as AreaMaterialOverride[])
  }

  async function setOverride(fromId: string, toId: string | null) {
    if (toId) {
      await supabase!
        .from('bid_material_overrides')
        .upsert({ bid_id: bid!.id, from_material_id: fromId, to_material_id: toId })
    } else {
      await supabase!
        .from('bid_material_overrides')
        .delete()
        .eq('bid_id', bid!.id)
        .eq('from_material_id', fromId)
    }
    const { data } = await supabase!.from('bid_material_overrides').select('*').eq('bid_id', bid!.id)
    setOverrides((data ?? []) as BidMaterialOverride[])
  }

  async function snapshotRevision() {
    if (!pricing) return
    setSnapshotting(true)
    const revNumber = (revisions[0]?.rev_number ?? 0) + 1
    // Display-ready copy of every line as priced right now — the viewer renders
    // this verbatim, so a snapshot never recalculates.
    const displayAreas = areas.map((area) => {
      const areaLines = (linesByArea.get(area.id) ?? []).map((line) => {
        const p = priceLine(line, area, ctx)
        const assembly = line.assembly_id ? ctx.assemblies.get(line.assembly_id) : undefined
        return {
          label: line.kind === 'assembly' ? assembly?.name ?? '?' : line.name ?? '',
          category: assembly?.category ?? (line.kind === 'sub' ? 'Sub-contract' : 'One-off'),
          qty: Number(line.quantity),
          entry: line.entry_mode === 'feet' ? `${line.entry_value} FT` : null,
          unit: line.kind === 'assembly' ? assembly?.pricing_unit ?? 'EA' : 'EA',
          linePrice: p.linePrice,
          note: line.note,
        }
      })
      const hardware = [
        ...new Set(
          (linesByArea.get(area.id) ?? [])
            .flatMap((l) => (l.assembly_id ? ctx.bomByAssembly.get(l.assembly_id) ?? [] : []))
            .filter((r) => r.material_id)
            .map((r) => ctx.materials.get(resolveMaterialId(ctx, area.id, r.material_id!)))
            .filter((m) => m && (m.category === 'HARDWARE' || m.category === 'EQUIPMENT'))
            .map((m) => m!.name),
        ),
      ]
      return {
        name: area.name,
        sheet_ref: area.sheet_ref,
        multiplier: Number(area.multiplier),
        is_alternate: area.is_alternate,
        inclusions: area.inclusions,
        exclusions: area.exclusions,
        total: pricing.areaTotals.get(area.id)?.price ?? 0,
        lines: areaLines,
        hardware,
      }
    })
    const { error } = await supabase!.from('revisions').insert({
      bid_id: bid!.id,
      rev_number: revNumber,
      contract_amount: pricing.contractAmount,
      tax: pricing.tax,
      true_cost: pricing.trueCost,
      profit: pricing.profit,
      margin_pct: pricing.marginPct,
      created_by: session?.user.email ?? null,
      snapshot: {
        display: {
          job_number: bid!.job_number,
          bid_name: bid!.name,
          areas: displayAreas,
          adders: pricing.adders.map((a) => ({ key: a.key, label: a.label, price: a.price, enabled: a.enabled })),
          finishes: bidFinishes.map((bf) => ({ slot: bf.slot, name: bf.finish?.name ?? '?' })),
        },
        bid: bid,
        areas,
        lines,
        bid_finishes: bidFinishes.map(({ finish, ...bf }) => ({ ...bf, finish_name: finish?.name, finish_cost: finish?.cost })),
        overrides,
        adders: pricing.adders,
        totals: {
          cabinetTotal: pricing.cabinetTotal,
          addersTotal: pricing.addersTotal,
          contractAmount: pricing.contractAmount,
          tax: pricing.tax,
          alternatesTotal: pricing.alternatesTotal,
        },
        settings: Object.fromEntries(settings.map((s) => [s.key, Number(s.value)])),
      },
    })
    setSnapshotting(false)
    if (error) setError(error.message)
    else {
      const { data } = await supabase!
        .from('revisions')
        .select('id, bid_id, rev_number, note, contract_amount, tax, true_cost, profit, margin_pct, created_by, created_at')
        .eq('bid_id', bid!.id)
        .order('rev_number', { ascending: false })
      setRevisions((data ?? []) as Revision[])
    }
  }

  async function removeRevision(rev: Revision) {
    setRemovingRevision(null)
    const { error } = await supabase!.from('revisions').delete().eq('id', rev.id)
    if (error) setError(error.message)
    else setRevisions((prev) => prev.filter((r) => r.id !== rev.id))
  }

  async function toggleAdder(key: keyof BidAdders) {
    const adders = { ...bid!.adders, [key]: !bid!.adders[key] }
    setBid((b) => (b ? { ...b, adders } : b))
    const { error } = await supabase!.from('bids').update({ adders }).eq('id', bid!.id)
    if (error) setError(error.message)
  }

  const uniqueWarnings = [...new Set(pricing.warnings.map((w) => w.message))]

  return (
    <div className="space-y-5 pb-40">
      <div className="flex items-center gap-3">
        <Link to={`/bids/${bid.id}`} className="text-sm text-slate-500 hover:text-slate-900">
          ← {bid.job_number}
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-lg font-semibold tracking-tight">
          {bid.name} — estimate
        </h1>
        {!canEdit && <ViewOnlyBanner />}
        <Link
          to={`/bids/${bid.id}/math`}
          className="rounded-md border border-blue-300 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-800 hover:bg-blue-100"
          title="See every calculation behind these numbers"
        >
          Show the math
        </Link>
      </div>

      {uniqueWarnings.length > 0 && (
        <details className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          <summary className="cursor-pointer font-semibold">
            ⚠ {uniqueWarnings.length} pricing warning{uniqueWarnings.length > 1 ? 's' : ''} — numbers may be incomplete
          </summary>
          <ul className="mt-2 list-disc pl-5 space-y-0.5">
            {uniqueWarnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </details>
      )}

      {/* Finish slots + job hardware */}
      {(usedSlots.size > 0 || usedHardware.length > 0) && (
        <section className="rounded-lg border-2 border-slate-800 bg-white p-4">
          <h2 className="mb-2 font-mono text-[11px] uppercase tracking-widest text-slate-500">
            Job finishes & hardware — what this whole job uses
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {SLOTS.filter((s) => usedSlots.has(s)).map((slot) => {
              const current = bidFinishes.find((bf) => bf.slot === slot)
              return (
                <label key={slot} className="block" title={slot}>
                  <span className={`font-mono text-[11px] uppercase tracking-widest ${current ? 'text-slate-500' : 'text-amber-700 font-semibold'}`}>
                    {slotLabel(slot)} {!current && '— unassigned'}
                  </span>
                  <select
                    value={current?.finish_id ?? ''}
                    onChange={(e) => void assignSlot(slot, e.target.value || null)}
                    className="input"
                  >
                    <option value="">— pick a finish —</option>
                    {finishes
                      .filter((f) => (slot.startsWith('SS') ? f.type === 'Solid surface' : f.type === 'Laminate'))
                      .map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                          {f.brand ? ` · ${f.brand}` : ''} ({fmtCost(f.cost)}/{f.unit})
                        </option>
                      ))}
                  </select>
                </label>
              )
            })}
            {usedHardware.map((std) => {
              const override = overrides.find((o) => o.from_material_id === std.id)
              const current = override?.to_material_id ?? std.id
              const options = materials
                .filter((m) => m.active && m.category === 'HARDWARE')
                .sort((a, b) => a.name.localeCompare(b.name))
              return (
                <label key={std.id} className="block" title={`Standard: ${std.name}`}>
                  <span className="font-mono text-[11px] uppercase tracking-widest text-slate-500">
                    {hardwareLabel(std.name)}
                    {override && <span className="ml-1 text-violet-700 font-semibold">— swapped</span>}
                  </span>
                  <select
                    value={current}
                    onChange={(e) => void setOverride(std.id, e.target.value === std.id ? null : e.target.value)}
                    className="input"
                  >
                    {options.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.id === std.id ? `${m.name} (standard)` : m.name} — {fmtCost(m.cost)}
                      </option>
                    ))}
                  </select>
                </label>
              )
            })}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Hardware picks apply to the whole job — pricing, order sheet, and proposal all follow.
            New hardware (a spec'd pull, a soft-close hinge) gets added in Libraries → Materials first.
          </p>
        </section>
      )}

      {/* Job material swaps */}
      <MaterialSwaps materials={materials} overrides={overrides} onSet={(f, t) => void setOverride(f, t)} />

      {/* Areas */}
      {areas.map((area) => (
        <AreaCard
          key={area.id}
          area={area}
          lines={linesByArea.get(area.id) ?? []}
          assemblies={assemblies}
          ctx={ctx}
          areaTotal={pricing.areaTotals.get(area.id)?.price ?? 0}
          onPatch={(f) => void patchArea(area, f)}
          onRemove={() => setRemovingArea(area)}
          onDuplicate={() => void duplicateArea(area)}
          onAddLine={(partial) => void addLine(area, partial)}
          onPatchLine={(l, f) => void patchLine(l, f)}
          onRemoveLine={(l) => void removeLine(l)}
          onSetAreaOverride={(from, to) => void setAreaOverride(area.id, from, to)}
          allMaterials={materials}
        />
      ))}

      {canEdit && (
        <button
          onClick={() => void addArea()}
          className="w-full rounded-lg border-2 border-dashed border-slate-400 bg-white px-4 py-3 text-sm font-medium text-slate-500 hover:border-slate-800 hover:text-slate-900"
        >
          + Add area (room)
        </button>
      )}

      {/* Adders */}
      <section className="rounded-lg border-2 border-slate-800 bg-white">
        <h2 className="border-b-2 border-slate-800 px-4 py-2.5 font-mono text-[11px] uppercase tracking-widest text-slate-500">
          Added costs — {pricing.installHours.toFixed(1)} install hrs · {Math.round(pricing.lfTotal)} LF ·{' '}
          {Number(bid.distance_miles ?? 0)} mi
        </h2>
        {pricing.adders.map((a) => (
          <div key={a.key} className="flex items-center gap-3 border-t border-slate-100 px-4 py-2 first:border-t-0">
            <button
              onClick={() => void toggleAdder(a.key)}
              className={`h-5 w-9 rounded-full transition-colors ${a.enabled ? 'bg-slate-900' : 'bg-slate-300'}`}
              title={a.enabled ? 'Included — tap to exclude' : 'Excluded — tap to include'}
            >
              <span className={`block h-4 w-4 rounded-full bg-white transition-transform ${a.enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </button>
            <span className={`flex-1 text-sm ${a.enabled ? '' : 'text-slate-400 line-through'}`}>{a.label}</span>
            <span className={`tabular-nums text-sm ${a.enabled ? '' : 'text-slate-400'}`}>{fmtMoney(a.price)}</span>
          </div>
        ))}
      </section>

      {/* Revisions */}
      <section className="rounded-lg border-2 border-slate-800 bg-white">
        <div className="flex items-center border-b-2 border-slate-800 px-4 py-2.5">
          <h2 className="font-mono text-[11px] uppercase tracking-widest text-slate-500">
            Revisions — the price you sent, locked in
          </h2>
          {canEdit && (
            <button
              onClick={() => void snapshotRevision()}
              disabled={snapshotting}
              className="ml-auto rounded-md bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {snapshotting ? 'Saving…' : `Snapshot R${(revisions[0]?.rev_number ?? 0) + 1}`}
            </button>
          )}
        </div>
        {revisions.length === 0 ? (
          <p className="px-4 py-3 text-sm text-slate-500">
            No snapshots yet. Take one every time you send this bid — the recorded price never
            changes, even when library prices do.
          </p>
        ) : (
          revisions.map((r, i) => (
            <Link
              key={r.id}
              to={`/bids/${bid.id}/revisions/${r.id}`}
              className={`flex flex-wrap items-center gap-x-3 gap-y-0.5 px-4 py-2.5 hover:bg-slate-50 ${i > 0 ? 'border-t border-slate-100' : ''}`}
            >
              <span className="font-mono text-xs font-semibold">R{r.rev_number}</span>
              <span className="text-xs text-slate-500">{fmtDueDate(r.created_at)}</span>
              <span className="text-xs text-slate-400">{r.created_by}</span>
              <span className="text-xs text-slate-400 underline decoration-dotted">open</span>
              <span className="ml-auto text-sm font-semibold tabular-nums">{fmtMoney(Number(r.contract_amount))}</span>
              {isAdmin && r.margin_pct != null && (
                <span className="w-14 text-right text-xs text-slate-500 tabular-nums">
                  {(Number(r.margin_pct) * 100).toFixed(1)}%
                </span>
              )}
              {isAdmin && (
                <button
                  onClick={(e) => {
                    e.preventDefault()
                    setRemovingRevision(r)
                  }}
                  className="text-slate-300 hover:text-red-600"
                  title="Delete this snapshot"
                >
                  ×
                </button>
              )}
            </Link>
          ))
        )}
      </section>

      {/* Pinned title-block totals bar (sits above the phone tab bar) */}
      <div className="fixed inset-x-0 bottom-[3.4rem] z-20 border-t-2 border-slate-800 bg-white sm:bottom-0">
        <div className="mx-auto flex max-w-6xl items-stretch divide-x-2 divide-slate-800 overflow-x-auto border-x-2 border-slate-800 font-mono">
          <TotalCell label="Base bid" value={fmtMoney(pricing.cabinetTotal)} />
          <TotalCell label="Added costs" value={fmtMoney(pricing.addersTotal)} />
          <TotalCell label="Contract" value={fmtMoney(pricing.contractAmount)} strong />
          <TotalCell label={bid.tax_exempt ? 'Tax (exempt)' : 'Tax'} value={fmtMoney(pricing.tax)} />
          {pricing.alternatesTotal > 0 && <TotalCell label="Options" value={fmtMoney(pricing.alternatesTotal)} />}
          {isAdmin && (
            <>
              <TotalCell label="True cost" value={fmtMoney(pricing.trueCost)} muted />
              <TotalCell
                label="Proj. profit"
                value={fmtMoney(pricing.profit)}
                strong
                tone={pricing.profit < 0 ? 'bad' : pricing.marginPct != null && pricing.marginPct < 0.1 ? 'warn' : 'good'}
              />
              <TotalCell
                label="Margin"
                value={pricing.marginPct == null ? '—' : `${(pricing.marginPct * 100).toFixed(1)}%`}
                strong
                tone={pricing.marginPct != null && pricing.marginPct < 0 ? 'bad' : pricing.marginPct != null && pricing.marginPct < 0.1 ? 'warn' : 'good'}
                title={`Projected profit ${fmtMoney(pricing.profit)} (overhead allocation ${fmtMoney(pricing.overhead)} is carried by salaried labor in the cost lines)`}
              />
            </>
          )}
        </div>
      </div>

      {removingArea && (
        <ConfirmDialog
          title="Delete area"
          message={`Delete ${removingArea.name} and its ${linesByArea.get(removingArea.id)?.length ?? 0} line items?`}
          onConfirm={() => void removeArea(removingArea)}
          onCancel={() => setRemovingArea(null)}
        />
      )}
      {removingRevision && (
        <ConfirmDialog
          title="Delete snapshot"
          message={`Delete R${removingRevision.rev_number} (${fmtMoney(Number(removingRevision.contract_amount))})? If this price was sent to a customer, you lose your record of it.`}
          onConfirm={() => void removeRevision(removingRevision)}
          onCancel={() => setRemovingRevision(null)}
        />
      )}
    </div>
  )
}

function TotalCell({
  label, value, strong, muted, tone, title,
}: {
  label: string; value: string; strong?: boolean; muted?: boolean; tone?: 'good' | 'warn' | 'bad'; title?: string
}) {
  const toneCls = tone === 'bad' ? 'text-red-600' : tone === 'warn' ? 'text-amber-600' : tone === 'good' ? 'text-emerald-700' : ''
  return (
    <div className={`flex min-w-[7.5rem] flex-1 flex-col px-3 py-2 ${muted ? 'bg-slate-50' : ''}`} title={title}>
      <span className="text-[9px] uppercase tracking-widest text-slate-400">{label}</span>
      <span className={`tabular-nums ${strong ? 'text-lg font-semibold' : 'text-sm'} ${toneCls}`}>{value}</span>
    </div>
  )
}

// ---------------- Job material swaps ----------------

function MaterialSwaps({
  materials, overrides, onSet,
}: {
  materials: Material[]
  overrides: BidMaterialOverride[]
  onSet: (fromId: string, toId: string | null) => void
}) {
  const [adding, setAdding] = useState(false)
  const [fromId, setFromId] = useState('')
  const byId = new Map(materials.map((m) => [m.id, m]))
  const active = materials.filter((m) => m.active)
  // hardware swaps live in the "Job finishes & hardware" panel; this section covers the rest
  const nonHardware = overrides.filter((o) => byId.get(o.from_material_id)?.category !== 'HARDWARE')

  if (nonHardware.length === 0 && !adding) {
    return (
      <button
        onClick={() => setAdding(true)}
        className="text-left text-xs text-slate-500 hover:text-slate-900 hover:underline"
      >
        + Sheet-material swap for this job (e.g. prefinished ply boxes instead of melamine)
      </button>
    )
  }

  return (
    <section className="rounded-lg border-2 border-slate-800 bg-white p-4">
      <h2 className="mb-2 font-mono text-[11px] uppercase tracking-widest text-slate-500">
        Sheet-material swaps — this job only
      </h2>
      <div className="space-y-2">
        {nonHardware.map((o) => (
          <div key={o.from_material_id} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded border border-slate-300 bg-slate-50 px-2 py-1 text-xs">
              {byId.get(o.from_material_id)?.name ?? '?'}
            </span>
            <span className="text-slate-400">→</span>
            <select
              value={o.to_material_id}
              onChange={(e) => onSet(o.from_material_id, e.target.value)}
              className="input mt-0 w-auto py-1.5"
            >
              {active.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({fmtCost(m.cost)})
                </option>
              ))}
            </select>
            <button onClick={() => onSet(o.from_material_id, null)} className="text-xs text-slate-400 hover:text-red-600">
              remove
            </button>
          </div>
        ))}
        {adding ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <select value={fromId} onChange={(e) => setFromId(e.target.value)} className="input mt-0 w-auto py-1.5">
              <option value="">Swap out…</option>
              {active
                .filter((m) => m.category !== 'HARDWARE' && !overrides.some((o) => o.from_material_id === m.id))
                .map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
            </select>
            {fromId && (
              <>
                <span className="text-slate-400">→</span>
                <select
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) {
                      onSet(fromId, e.target.value)
                      setFromId('')
                      setAdding(false)
                    }
                  }}
                  className="input mt-0 w-auto py-1.5"
                >
                  <option value="">Swap in…</option>
                  {active
                    .filter((m) => m.id !== fromId)
                    .map((m) => (
                      <option key={m.id} value={m.id}>{m.name} ({fmtCost(m.cost)})</option>
                    ))}
                </select>
              </>
            )}
            <button onClick={() => { setAdding(false); setFromId('') }} className="text-xs text-slate-400 hover:text-slate-700">
              cancel
            </button>
          </div>
        ) : (
          <button onClick={() => setAdding(true)} className="text-xs text-slate-500 hover:text-slate-900 hover:underline">
            + Add another swap
          </button>
        )}
      </div>
    </section>
  )
}

// ---------------- Area card ----------------

function AreaCard({
  area, lines, assemblies, ctx, areaTotal, onPatch, onRemove, onDuplicate, onAddLine, onPatchLine, onRemoveLine,
  onSetAreaOverride, allMaterials,
}: {
  area: Area
  lines: LineItem[]
  assemblies: Assembly[]
  ctx: ReturnType<typeof buildContext>
  areaTotal: number
  onPatch: (fields: Partial<Area>) => void
  onRemove: () => void
  onDuplicate: () => void
  onAddLine: (partial: Partial<LineItem>) => void
  onPatchLine: (line: LineItem, fields: Partial<LineItem>) => void
  onRemoveLine: (line: LineItem) => void
  onSetAreaOverride: (fromId: string, toId: string | null) => void
  allMaterials: Material[]
}) {
  const [name, setName] = useState(area.name)
  const [sheetRef, setSheetRef] = useState(area.sheet_ref ?? '')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [hardwareOpen, setHardwareOpen] = useState(false)
  const [notesOpen, setNotesOpen] = useState(false)
  const [inclusions, setInclusions] = useState(area.inclusions ?? '')
  const [exclusions, setExclusions] = useState(area.exclusions ?? '')

  // hardware this room's cabinets call for (by standard material)
  const roomHardware = useMemo(() => {
    const ids = new Set<string>()
    for (const l of lines) {
      if (!l.assembly_id) continue
      for (const row of ctx.bomByAssembly.get(l.assembly_id) ?? []) {
        if (!row.material_id) continue
        const m = ctx.materials.get(row.material_id)
        if (m && (m.category === 'HARDWARE' || m.category === 'EQUIPMENT')) ids.add(m.id)
      }
    }
    return [...ids].map((id) => ctx.materials.get(id)!).sort((a, b) => a.name.localeCompare(b.name))
  }, [lines, ctx])
  const areaOvr = ctx.areaOverrides.get(area.id)
  const roomSwapCount = roomHardware.filter((std) => areaOvr?.has(std.id)).length

  useEffect(() => setName(area.name), [area.name])
  useEffect(() => setSheetRef(area.sheet_ref ?? ''), [area.sheet_ref])
  useEffect(() => setInclusions(area.inclusions ?? ''), [area.inclusions])
  useEffect(() => setExclusions(area.exclusions ?? ''), [area.exclusions])

  const grouped = useMemo(() => {
    const map = new Map<string, Assembly[]>()
    for (const a of assemblies) {
      if (!map.has(a.category)) map.set(a.category, [])
      map.get(a.category)!.push(a)
    }
    return [...map.entries()]
  }, [assemblies])

  return (
    <section className={`rounded-lg border-2 bg-white ${area.is_alternate ? 'border-violet-700' : 'border-slate-800'}`}>
      <div className={`flex flex-wrap items-center gap-2 border-b-2 px-4 py-2 ${area.is_alternate ? 'border-violet-700 bg-violet-50' : 'border-slate-800'}`}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name !== area.name && onPatch({ name })}
          title="Room name — click to edit"
          className="min-w-0 flex-1 basis-40 rounded border border-transparent bg-transparent px-1.5 py-0.5 text-sm font-semibold underline decoration-dotted decoration-slate-300 underline-offset-4 hover:border-slate-300 hover:bg-white focus:border-slate-800 focus:bg-white focus:no-underline focus:outline-none"
        />
        <label className="flex items-center gap-1.5">
          <span className="font-mono text-[10px] uppercase tracking-wider text-slate-400">Dwg</span>
          <input
            value={sheetRef}
            onChange={(e) => setSheetRef(e.target.value)}
            onBlur={() => (sheetRef || null) !== area.sheet_ref && onPatch({ sheet_ref: sheetRef || null })}
            placeholder="02/I6.01"
            title="Which drawing / elevation this room comes from"
            className="w-24 rounded border border-slate-300 px-2 py-0.5 font-mono text-xs focus:border-slate-800 focus:outline-none"
          />
        </label>
        <label className="flex items-center gap-1 font-mono text-xs text-slate-500">
          typ ×
          <input
            type="number"
            min="1"
            value={Number(area.multiplier)}
            onChange={(e) => onPatch({ multiplier: Math.max(1, Number(e.target.value) || 1) })}
            className="w-14 rounded border border-slate-200 px-1.5 py-0.5 text-right text-xs focus:border-slate-800 focus:outline-none"
          />
        </label>
        <button
          onClick={() => onPatch({ is_alternate: !area.is_alternate })}
          className={`rounded-full border px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${
            area.is_alternate
              ? 'border-violet-700 bg-violet-700 text-white'
              : 'border-slate-300 text-slate-400 hover:border-violet-700 hover:text-violet-700'
          }`}
          title="Priced separately as an option — not counted in the base bid"
        >
          {area.is_alternate ? 'Option — not in base bid' : 'Option'}
        </button>
        <span className="ml-auto text-sm font-semibold tabular-nums">
          {fmtMoney(areaTotal)}
          {Number(area.multiplier) > 1 && <span className="ml-1 text-xs font-normal text-slate-400">(×{Number(area.multiplier)})</span>}
        </span>
        <button onClick={onDuplicate} className="text-slate-400 hover:text-slate-900" title="Duplicate this area with all its lines">
          ⧉
        </button>
        <button onClick={onRemove} className="text-slate-300 hover:text-red-600" title="Delete area">
          ×
        </button>
      </div>

      {lines.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <tbody>
              {lines.map((line) => (
                <LineRow
                  key={line.id}
                  line={line}
                  area={area}
                  ctx={ctx}
                  onPatch={(f) => onPatchLine(line, f)}
                  onRemove={() => onRemoveLine(line)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {hardwareOpen && roomHardware.length > 0 && (
        <div className="border-t border-slate-100 bg-slate-50 px-4 py-2.5">
          <div className="mb-1.5 font-mono text-[10px] uppercase tracking-widest text-slate-500">
            Hardware in this room — overrides the job pick
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {roomHardware.map((std) => {
              const jobDefault = ctx.materialOverrides.get(std.id) ?? std.id
              const current = areaOvr?.get(std.id) ?? jobDefault
              const options = allMaterials
                .filter((m) => m.active && (m.category === 'HARDWARE' || m.category === 'EQUIPMENT'))
                .sort((a, b) => a.name.localeCompare(b.name))
              return (
                <label key={std.id} className="block" title={`Standard: ${std.name}`}>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
                    {std.name}
                    {areaOvr?.has(std.id) && <span className="ml-1 font-semibold text-violet-700">— this room</span>}
                  </span>
                  <select
                    value={current}
                    onChange={(e) => onSetAreaOverride(std.id, e.target.value === jobDefault ? null : e.target.value)}
                    className="input mt-0.5 py-1.5 text-sm"
                  >
                    {options.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.id === jobDefault ? `${m.name} (job default)` : m.name} — {fmtCost(m.cost)}
                      </option>
                    ))}
                  </select>
                </label>
              )
            })}
          </div>
        </div>
      )}

      {notesOpen && (
        <div className="grid gap-3 border-t border-slate-100 bg-slate-50 px-4 py-2.5 sm:grid-cols-2">
          <label className="block">
            <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
              Inclusions — this room
            </span>
            <textarea
              rows={3}
              value={inclusions}
              onChange={(e) => setInclusions(e.target.value)}
              onBlur={() => (inclusions.trim() || null) !== area.inclusions && onPatch({ inclusions: inclusions.trim() || null })}
              placeholder="Shows on this room's block on the proposal…"
              className="input text-sm"
            />
          </label>
          <label className="block">
            <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
              Exclusions — this room
            </span>
            <textarea
              rows={3}
              value={exclusions}
              onChange={(e) => setExclusions(e.target.value)}
              onBlur={() => (exclusions.trim() || null) !== area.exclusions && onPatch({ exclusions: exclusions.trim() || null })}
              placeholder="NIC items for this room only…"
              className="input text-sm"
            />
          </label>
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-t border-slate-100 px-4 py-2">
        {!pickerOpen ? (
          <>
            <button onClick={() => setPickerOpen(true)} className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100">
              + Cabinet / countertop
            </button>
            {roomHardware.length > 0 && (
              <button
                onClick={() => setHardwareOpen((v) => !v)}
                className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
                  roomSwapCount > 0
                    ? 'border-violet-500 bg-violet-50 text-violet-800'
                    : 'border-slate-300 text-slate-600 hover:bg-slate-100'
                }`}
              >
                Hardware{roomSwapCount > 0 ? ` (${roomSwapCount} custom)` : ''} {hardwareOpen ? '▴' : '▾'}
              </button>
            )}
            <button
              onClick={() => setNotesOpen((v) => !v)}
              className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
                area.inclusions || area.exclusions
                  ? 'border-violet-500 bg-violet-50 text-violet-800'
                  : 'border-slate-300 text-slate-600 hover:bg-slate-100'
              }`}
              title="Inclusions and exclusions for just this room — printed on its proposal block"
            >
              In/Exclusions{area.inclusions || area.exclusions ? ' ✓' : ''} {notesOpen ? '▴' : '▾'}
            </button>
            <button
              onClick={() => onAddLine({ kind: 'manual', name: 'One-off item', quantity: 1 })}
              className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
            >
              + One-off item
            </button>
            <button
              onClick={() => onAddLine({ kind: 'sub', name: 'Sub-contract (quote)', quantity: 1 })}
              className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
            >
              + Sub quote
            </button>
          </>
        ) : (
          <select
            autoFocus
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) onAddLine({ kind: 'assembly', assembly_id: e.target.value, quantity: 1 })
              setPickerOpen(false)
            }}
            onBlur={() => setPickerOpen(false)}
            className="input mt-0 max-w-md"
          >
            <option value="">Pick from the library…</option>
            {grouped.map(([cat, items]) => (
              <optgroup key={cat} label={cat}>
                {items.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.pricing_unit})
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        )}
      </div>
    </section>
  )
}

// ---------------- Line row ----------------

function LineRow({
  line, area, ctx, onPatch, onRemove,
}: {
  line: LineItem
  area: Area
  ctx: ReturnType<typeof buildContext>
  onPatch: (fields: Partial<LineItem>) => void
  onRemove: () => void
}) {
  const assembly = line.assembly_id ? ctx.assemblies.get(line.assembly_id) : undefined
  const p = priceLine(line, area, ctx)
  const [qtyDraft, setQtyDraft] = useState('')
  const [nameDraft, setNameDraft] = useState(line.name ?? '')
  const [priceDraft, setPriceDraft] = useState(line.unit_price == null ? '' : String(line.unit_price))

  useEffect(() => setNameDraft(line.name ?? ''), [line.name])
  useEffect(() => setPriceDraft(line.unit_price == null ? '' : String(line.unit_price)), [line.unit_price])

  const isFeet = line.entry_mode === 'feet'
  const isSF = assembly?.pricing_unit === 'SF'
  const widthFt = assembly?.typical_width_in ? Number(assembly.typical_width_in) / 12 : isSF ? 25 / 12 : 2
  // EA: feet of run ÷ width = boxes · SF: feet of run × depth = square feet
  const feetToQty = (ft: number) => (isSF ? ft * widthFt : ft / widthFt)
  const qtyToFeet = (q: number) => (isSF ? q / widthFt : q * widthFt)
  const displayQty = isFeet ? (line.entry_value ?? qtyToFeet(Number(line.quantity))) : Number(line.quantity)

  useEffect(() => setQtyDraft(String(Math.round(displayQty * 1000) / 1000)), [displayQty])

  function commitQty() {
    const v = Number(qtyDraft)
    if (Number.isNaN(v) || v < 0) return
    if (isFeet) onPatch({ entry_value: v, quantity: feetToQty(v) })
    else onPatch({ quantity: v, entry_value: null })
  }

  const canUseFeet = line.kind === 'assembly' && (assembly?.pricing_unit === 'EA' || isSF)
  const unitLabel =
    line.kind === 'assembly' ? (isFeet ? 'FT' : assembly?.pricing_unit ?? 'EA') : line.kind === 'sub' ? 'quote' : 'EA'

  return (
    <tr className="border-t border-slate-100">
      <td className="px-4 py-1.5">
        {line.kind === 'assembly' ? (
          <span>
            {assembly?.name ?? '?'}
            <span className="ml-1.5 font-mono text-[10px] uppercase text-slate-400">{assembly?.category}</span>
          </span>
        ) : (
          <input
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={() => nameDraft !== line.name && onPatch({ name: nameDraft })}
            className="w-full min-w-32 rounded border border-slate-200 px-2 py-1 text-sm focus:border-slate-800 focus:outline-none"
          />
        )}
        {p.warnings.length > 0 && (
          <span className="ml-1.5 cursor-help text-amber-500" title={p.warnings.map((w) => w.message).join('\n')}>
            ⚠
          </span>
        )}
      </td>
      <td className="w-36 px-2 py-1.5 text-right whitespace-nowrap">
        <input
          type="number" step="any" min="0"
          value={qtyDraft}
          onChange={(e) => setQtyDraft(e.target.value)}
          onBlur={commitQty}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          className="w-20 rounded border border-slate-200 px-1.5 py-1 text-right text-sm tabular-nums focus:border-slate-800 focus:outline-none"
        />
        {canUseFeet ? (
          <button
            onClick={() => {
              if (isFeet) onPatch({ entry_mode: 'unit', entry_value: null, quantity: Math.round(Number(line.quantity) * 1000) / 1000 })
              else onPatch({ entry_mode: 'feet', entry_value: qtyToFeet(Number(line.quantity)) })
            }}
            className="ml-1 w-8 rounded border border-slate-300 px-1 py-1 font-mono text-[10px] uppercase text-slate-500 hover:border-slate-800"
            title={
              isFeet
                ? isSF
                  ? `Entered in feet of run — converts at ${assembly!.typical_width_in ?? 25}″ deep. Tap for square feet.`
                  : `Entered in feet — converts at ${assembly!.typical_width_in}″ per box. Tap for boxes.`
                : 'Tap to enter this run in feet instead'
            }
          >
            {unitLabel}
          </button>
        ) : (
          <span className="ml-1 inline-block w-8 text-center font-mono text-[10px] uppercase text-slate-400">{unitLabel}</span>
        )}
        {isFeet && (
          <div className="mt-0.5 font-mono text-[10px] text-slate-400">
            = {(Number(line.quantity)).toFixed(2)} {isSF ? 'SF' : 'boxes'}
          </div>
        )}
      </td>
      <td className="w-28 px-2 py-1.5 text-right tabular-nums whitespace-nowrap">
        {line.kind === 'assembly' ? (
          <span className="text-xs text-slate-500" title="Computed: materials × markup + shop labor">
            {Number(line.quantity) > 0 ? fmtCost(p.linePrice / (Number(line.quantity) * Number(area.multiplier))) : '—'}
            /{assembly?.pricing_unit ?? 'EA'}
          </span>
        ) : (
          <input
            type="number" step="any" min="0"
            value={priceDraft}
            onChange={(e) => setPriceDraft(e.target.value)}
            onBlur={() => onPatch({ unit_price: priceDraft === '' ? null : Number(priceDraft) })}
            placeholder={line.kind === 'sub' ? 'quote $' : 'price $'}
            className="w-24 rounded border border-slate-200 px-1.5 py-1 text-right text-sm tabular-nums focus:border-slate-800 focus:outline-none"
          />
        )}
      </td>
      <td className="w-28 px-2 py-1.5 text-right font-medium tabular-nums whitespace-nowrap">
        {fmtMoney(p.linePrice)}
        {line.kind === 'sub' && <div className="font-mono text-[10px] font-normal text-slate-400">quote × markup</div>}
      </td>
      <td className="w-8 px-3 py-1.5 text-right">
        <button onClick={onRemove} className="text-slate-300 hover:text-red-600">×</button>
      </td>
    </tr>
  )
}
