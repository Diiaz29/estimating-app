import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type {
  Area, AreaMaterialOverride, Assembly, AssemblyMaterial, Bid, BidCustomer, BidFinish,
  BidMaterialOverride, Contact, LineItem, Material, Setting,
} from '../lib/types'
import { buildContext, priceBid, resolveMaterialId } from '../lib/pricing'
import { fmtDueDate, fmtMoney } from '../lib/format'
import { LOGO_URL } from '../lib/branding'

interface SnapshotRevision {
  id: string
  rev_number: number
  contract_amount: number
  tax: number
  created_at: string
  snapshot: {
    display?: {
      areas: {
        name: string
        sheet_ref: string | null
        multiplier: number
        is_alternate: boolean
        total: number
        lines: { label: string; qty: number; entry: string | null; unit: string }[]
        hardware?: string[]
        inclusions?: string | null
        exclusions?: string | null
      }[]
      adders: { key?: string; label: string; price: number; enabled: boolean }[]
      finishes: { slot: string; name: string }[]
    }
    totals?: { cabinetTotal: number; addersTotal: number; contractAmount: number; tax: number; alternatesTotal: number }
    bid?: Bid
  }
}

/** Everything the printed document needs, from either live pricing or a locked snapshot. */
interface ProposalData {
  refLabel: string
  sourceLabel: string
  isLocked: boolean
  presentedOn: string
  areas: {
    name: string
    sheet_ref: string | null
    multiplier: number
    is_alternate: boolean
    total: number
    includes: string
    inclusions: string | null
    exclusions: string | null
    hardware: string[]
  }[]
  finishes: { slot: string; name: string }[]
  base: number
  install: number
  delivery: number
  alternates: number
  adjustment: number
  adjustmentNote: string | null
  contract: number
  tax: number
  taxExempt: boolean
  inclusions: string | null
  exclusions: string | null
  drawingsDate: string | null
  installIncluded: boolean
  deliveryIncluded: boolean
}

/** Wording follows the bid's install/delivery toggles. */
function scopeWording(install: boolean, delivery: boolean): string {
  if (install && delivery) return 'millwork furnished, delivered & installed'
  if (!install && delivery) return 'millwork furnished & delivered — installation by others'
  if (install && !delivery) return 'millwork furnished & installed — delivery by others'
  return 'millwork furnished only — customer pickup at our shop, installation by others'
}

const INSTALLISH = new Set(['install', 'per_diem', 'lodging'])
const isInstallish = (a: { key?: string; label: string }) =>
  a.key ? INSTALLISH.has(a.key) : /^(Install|Per diem|Lodging)/.test(a.label)
const isDelivery = (a: { key?: string; label: string }) =>
  a.key ? a.key === 'delivery' : a.label.startsWith('Delivery')

export default function Proposal() {
  const { id } = useParams<{ id: string }>()
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
  const [gcs, setGcs] = useState<BidCustomer[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [revisions, setRevisions] = useState<SnapshotRevision[]>([])
  const [source, setSource] = useState<string | null>(null) // revision id or 'live'
  const [logoOk, setLogoOk] = useState(true) // logo carries the name, so text name hides when it loads
  const [terms, setTerms] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      const [bidRes, areaRes, asmRes, bomRes, matRes, bfRes, ovrRes, setRes, gcRes, revRes, termRes] =
        await Promise.all([
          supabase!.from('bids').select('*').eq('id', id!).single(),
          supabase!.from('areas').select('*').eq('bid_id', id!).order('sort_order'),
          supabase!.from('assemblies').select('*'),
          supabase!.from('assembly_materials').select('*'),
          supabase!.from('materials').select('*'),
          supabase!.from('bid_finishes').select('*, finish:finishes(*)').eq('bid_id', id!),
          supabase!.from('bid_material_overrides').select('*').eq('bid_id', id!),
          supabase!.from('settings').select('*'),
          supabase!.from('bid_customers').select('*, customer:customers(*)').eq('bid_id', id!),
          supabase!.from('revisions').select('id, rev_number, contract_amount, tax, created_at, snapshot').eq('bid_id', id!).order('rev_number', { ascending: false }),
          supabase!.from('text_settings').select('key, value'),
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
      setTerms(Object.fromEntries(((termRes.data ?? []) as { key: string; value: string }[]).map((t) => [t.key, t.value])))
      const revRows = ((revRes.data ?? []) as SnapshotRevision[]).filter((r) => r.snapshot?.display)
      setRevisions(revRows)
      setSource(revRows[0]?.id ?? 'live')
      const gcRows = (gcRes.data ?? []) as BidCustomer[]
      setGcs(gcRows)
      const primary = gcRows.find((g) => g.won_through) ?? gcRows[0]
      if (primary) {
        const { data } = await supabase!
          .from('contacts').select('*').eq('customer_id', primary.customer_id).order('created_at').limit(1)
        setContacts((data ?? []) as Contact[])
      }
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

  const data: ProposalData | null = useMemo(() => {
    if (!bid || !pricing) return null
    const rev = revisions.find((r) => r.id === source)
    if (rev?.snapshot.display && rev.snapshot.totals) {
      const d = rev.snapshot.display
      const t = rev.snapshot.totals
      const snapBid = rev.snapshot.bid
      const install = d.adders.filter((a) => a.enabled && isInstallish(a)).reduce((s, a) => s + a.price, 0)
      const delivery = d.adders.filter((a) => a.enabled && isDelivery(a)).reduce((s, a) => s + a.price, 0)
      return {
        refLabel: `${bid.job_number} R${rev.rev_number}`,
        sourceLabel: `Locked snapshot R${rev.rev_number} — ${fmtDueDate(rev.created_at)}`,
        isLocked: true,
        // the proposal is dated when the price was locked, not when it's printed
        presentedOn: new Date(rev.created_at).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }),
        areas: d.areas.map((a) => ({
          name: a.name,
          sheet_ref: a.sheet_ref,
          multiplier: a.multiplier,
          is_alternate: a.is_alternate,
          total: a.total,
          includes: a.lines.map((l) => `${l.label} (${l.entry ?? `${Math.round(l.qty * 1000) / 1000} ${l.unit}`})`).join('; '),
          inclusions: a.inclusions ?? null,
          exclusions: a.exclusions ?? null,
          hardware: a.hardware ?? [],
        })),
        finishes: d.finishes,
        base: t.contractAmount - install - delivery,
        install,
        delivery,
        alternates: t.alternatesTotal,
        adjustment: snapBid?.adjustment_visible === false ? 0 : Number(snapBid?.price_adjustment ?? 0),
        adjustmentNote: snapBid?.adjustment_note ?? null,
        contract: t.contractAmount,
        tax: Number(rev.tax),
        taxExempt: snapBid?.tax_exempt ?? bid.tax_exempt,
        inclusions: snapBid?.inclusions ?? bid.inclusions,
        exclusions: snapBid?.exclusions ?? bid.exclusions,
        drawingsDate: snapBid?.drawings_date ?? bid.drawings_date,
        installIncluded: (snapBid?.adders ?? bid.adders).install,
        deliveryIncluded: (snapBid?.adders ?? bid.adders).delivery,
      }
    }
    // live
    const adder = (key: string) => {
      const a = pricing.adders.find((x) => x.key === key)
      return a?.enabled ? a.price : 0
    }
    const install = adder('install') + adder('per_diem') + adder('lodging')
    const delivery = adder('delivery')
    return {
      refLabel: bid.job_number,
      sourceLabel: 'Live numbers — snapshot before sending!',
      isLocked: false,
      presentedOn: new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }),
      areas: areas.map((area) => {
        const areaLines = linesByArea.get(area.id) ?? []
        const hardware = [
          ...new Set(
            areaLines
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
          total: pricing.areaTotals.get(area.id)?.price ?? 0,
          inclusions: area.inclusions,
          exclusions: area.exclusions,
          includes: areaLines
            .map((l) => {
              const asm = l.assembly_id ? ctx.assemblies.get(l.assembly_id) : undefined
              const qty = l.entry_mode === 'feet' ? `${l.entry_value} LF` : `${Number(l.quantity)} ${asm?.pricing_unit ?? 'EA'}`
              return `${asm?.name ?? l.name} (${qty})`
            })
            .join('; '),
          hardware,
        }
      }),
      finishes: bidFinishes.map((bf) => ({
        slot: bf.slot,
        name: `${bf.finish?.name ?? ''}${bf.finish?.color_code ? ` ${bf.finish.color_code}` : ''}`,
      })),
      base: pricing.contractAmount - install - delivery,
      install,
      delivery,
      alternates: pricing.alternatesTotal,
      adjustment: bid.adjustment_visible ? pricing.adjustment : 0,
      adjustmentNote: bid.adjustment_note,
      contract: pricing.contractAmount,
      tax: pricing.tax,
      taxExempt: bid.tax_exempt,
      inclusions: bid.inclusions,
      exclusions: bid.exclusions,
      drawingsDate: bid.drawings_date,
      installIncluded: bid.adders.install,
      deliveryIncluded: bid.adders.delivery,
    }
  }, [bid, pricing, revisions, source, areas, linesByArea, ctx, bidFinishes])

  // Company identity lives in Settings → Company (text_settings table)
  const COMPANY = {
    name: terms.company_name ?? '',
    address: terms.company_address ?? '',
    phone: terms.company_phone ?? '',
    email: terms.company_email ?? '',
    web: terms.company_web ?? '',
  }

  // Saved-PDF filename comes from the page title: "ESTIMATE 26-002 R1 - JOB NAME"
  useEffect(() => {
    if (bid && data) document.title = `ESTIMATE ${data.refLabel} - ${bid.name.toUpperCase()}`
    return () => {
      document.title = COMPANY.name || 'Estimating'
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bid, data])

  if (error)
    return <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>
  if (!bid || !data) return <p className="text-sm text-slate-500">Loading…</p>

  const primary = gcs.find((g) => g.won_through) ?? gcs[0]
  const gc = primary?.customer
  const contact = contacts[0]

  return (
    <div className="proposal-page">
      {/* Screen-only toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-3 print:hidden">
        <Link to={`/bids/${bid.id}`} className="text-sm text-slate-500 hover:text-slate-900">
          ← {bid.job_number}
        </Link>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          Pricing from:
          <select
            value={source ?? 'live'}
            onChange={(e) => setSource(e.target.value)}
            className="input mt-0 w-auto py-1.5"
          >
            {revisions.map((r) => (
              <option key={r.id} value={r.id}>
                R{r.rev_number} — {fmtMoney(Number(r.contract_amount))} (locked)
              </option>
            ))}
            <option value="live">Live numbers (right now)</option>
          </select>
        </label>
        <span className={`rounded-full border px-3 py-1 font-mono text-[11px] uppercase tracking-wider ${data.isLocked ? 'border-emerald-400 bg-emerald-50 text-emerald-800' : 'border-amber-400 bg-amber-50 text-amber-800'}`}>
          {data.sourceLabel}
        </span>
        <button
          onClick={() => window.print()}
          className="ml-auto rounded-md bg-slate-900 px-4 py-1.5 text-sm font-semibold text-white hover:bg-slate-700"
        >
          Print / Save PDF
        </button>
      </div>

      <div className="light-doc mx-auto max-w-[7.7in] bg-white p-8 text-[13px] leading-snug text-slate-900 shadow-lg print:max-w-none print:p-0 print:shadow-none">
        {/* ---------- Letterhead ---------- */}
        <header className="flex items-start justify-between border-b-4 border-slate-900 pb-3">
          <div className="flex items-center gap-4">
            {logoOk && LOGO_URL ? (
              <img
                src={LOGO_URL}
                alt={COMPANY.name}
                className="h-24 w-auto max-w-[20rem] object-contain"
                onError={() => setLogoOk(false)}
              />
            ) : (
              <div className="text-2xl font-bold tracking-tight">{COMPANY.name}</div>
            )}
            <div className="text-[11px] leading-relaxed text-slate-500">
              {COMPANY.address}
              <br />
              {COMPANY.phone} · {COMPANY.email}
              <br />
              {COMPANY.web}
            </div>
          </div>
          <div className="text-right">
            <div className="font-mono text-[11px] uppercase tracking-widest text-slate-500">Millwork Estimate</div>
            <div className="font-mono text-sm font-semibold">{data.refLabel}</div>
          </div>
        </header>

        {/* ---------- Parties table ---------- */}
        <table className="mt-4 w-full border-2 border-slate-900 text-[12px]">
          <tbody>
            <tr className="divide-x-2 divide-slate-900 border-b-2 border-slate-900 bg-slate-100 font-mono text-[10px] uppercase tracking-wider">
              <td className="px-2 py-1">Client</td>
              <td className="px-2 py-1">Prepared by</td>
              <td className="px-2 py-1">Project</td>
              <td className="px-2 py-1">Terms (full terms in Work Authorization)</td>
            </tr>
            <tr className="divide-x-2 divide-slate-900 align-top">
              <td className="w-1/4 px-2 py-1.5">
                <div className="font-semibold">{gc?.company ?? '—'}</div>
                {contact && <div>Contact: {contact.name}</div>}
                {contact?.email && <div className="break-all">{contact.email}</div>}
                {(contact?.phone || gc?.phone) && <div>{contact?.phone ?? gc?.phone}</div>}
              </td>
              <td className="w-1/4 px-2 py-1.5">
                <div className="font-semibold">{COMPANY.name}</div>
                <div>{COMPANY.phone}</div>
                <div className="break-all">{COMPANY.email}</div>
              </td>
              <td className="w-1/4 px-2 py-1.5">
                <div className="font-semibold">{bid.name}</div>
                {bid.address && <div>{bid.address}</div>}
              </td>
              <td className="w-1/4 px-2 py-1.5">
                <ol className="list-decimal pl-4">
                  {(terms.proposal_terms_summary ?? '').split('\n').map((t) => t.trim()).filter(Boolean).map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ol>
              </td>
            </tr>
          </tbody>
        </table>

        <div className="mt-2 flex flex-wrap justify-between gap-x-6 text-[12px]">
          <span>
            <b>Presented on:</b> {data.presentedOn}
            {data.drawingsDate && (
              <>
                {' · '}
                <b>Proposal based on:</b> architect's drawing set dated{' '}
                {new Date(data.drawingsDate + 'T12:00').toLocaleDateString(undefined, { month: '2-digit', day: '2-digit', year: 'numeric' })}
              </>
            )}
          </span>
          <span className="font-semibold">{data.isLocked ? data.refLabel.replace(bid.job_number, 'Revision').trim() : 'Draft (live)'}</span>
        </div>

        {/* ---------- Price summary ---------- */}
        <table className="mt-3 w-full border-2 border-slate-900 text-[12px]">
          <tbody>
            {data.alternates > 0 && (
              <SummaryRow label="Options (priced separately below)" value={fmtMoney(data.alternates)} />
            )}
            {data.adjustment !== 0 && (
              <SummaryRow
                label={data.adjustmentNote ?? (data.adjustment < 0 ? 'Discount' : 'Adjustment')}
                value={fmtMoney(data.adjustment)}
              />
            )}
            <tr className="bg-slate-100 font-semibold">
              <td className="px-2 py-1.5">
                ESTIMATED TOTAL — {scopeWording(data.installIncluded, data.deliveryIncluded)} — NOT INCLUDING TAXES
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">{fmtMoney(data.contract)}</td>
            </tr>
            <tr className="border-t border-slate-300 text-[11px] text-slate-600">
              <td className="px-2 py-1">
                {data.taxExempt
                  ? 'Tax exempt — certificate on file.'
                  : 'Sales tax to be collected if not provided with a Texas resale or tax-exempt certificate'}
              </td>
              <td className="px-2 py-1 text-right tabular-nums">{data.taxExempt ? '—' : fmtMoney(data.tax)}</td>
            </tr>
            <tr className="border-t-2 border-slate-900 bg-slate-100 font-semibold">
              <td className="px-2 py-1.5">TOTAL INCLUDING TAX</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{fmtMoney(data.contract + (data.taxExempt ? 0 : data.tax))}</td>
            </tr>
          </tbody>
        </table>

        {/* ---------- Item blocks ---------- */}
        <div className="mt-4 space-y-3">
          {data.areas.map((area, i) => (
            <div key={i} className="break-inside-avoid border-2 border-slate-900">
              <div className="flex items-center gap-2 border-b border-slate-400 bg-slate-100 px-2 py-1 text-[12px] font-semibold">
                Item {i + 1} | {area.name} | {area.multiplier} Unit{area.multiplier > 1 ? 's' : ''}
                {area.is_alternate && <span className="font-normal text-violet-700">(OPTION)</span>}
                <span className="ml-auto font-normal">
                  Drawing Ref: <b>{area.sheet_ref ?? '—'}</b>
                </span>
              </div>
              <div className="px-2 py-1.5 text-[12px]">
                <div>
                  <b>Includes:</b> {area.includes}
                </div>
                {area.inclusions && (
                  <div className="mt-0.5">
                    <b>Also includes:</b> <span className="whitespace-pre-wrap">{area.inclusions}</span>
                  </div>
                )}
                {data.finishes.length > 0 && (
                  <div className="mt-0.5">
                    <b>Finishes:</b> {data.finishes.map((f) => `${f.slot}: ${f.name}`).join('; ')}
                  </div>
                )}
                {area.hardware.length > 0 && (
                  <div className="mt-0.5">
                    <b>Hardware:</b> {area.hardware.join('; ')}
                  </div>
                )}
                {(area.exclusions || data.exclusions) && (
                  <div className="mt-0.5">
                    <b>Exclusions:</b>{' '}
                    <span className="whitespace-pre-wrap">
                      {[area.exclusions, data.exclusions].filter(Boolean).join('; ')}
                    </span>
                  </div>
                )}
                {area.is_alternate && (
                  <div className="mt-0.5">
                    <b>Option price:</b> {fmtMoney(area.total)}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* ---------- Inclusions ---------- */}
        {data.inclusions && (
          <div className="mt-4 break-inside-avoid text-[12px]">
            <div className="font-mono text-[10px] uppercase tracking-widest text-slate-500">Inclusions</div>
            <p className="whitespace-pre-wrap">{data.inclusions}</p>
          </div>
        )}

        {/* ---------- Work Authorization (one printed page) ---------- */}
        <div className="mt-8 break-before-page text-[11px] leading-snug">
          <header className="flex items-center gap-3 border-b-4 border-slate-900 pb-1.5">
            {logoOk && LOGO_URL && (
              <img src={LOGO_URL} alt="" className="h-24 w-auto max-w-[20rem] object-contain" onError={() => setLogoOk(false)} />
            )}
            <div>
              <div className="text-lg font-bold tracking-tight">WORK AUTHORIZATION AGREEMENT</div>
              <div className="mt-0.5 text-[10px] text-slate-500">
                {logoOk && LOGO_URL ? '' : `${COMPANY.name} · `}{COMPANY.address} · {COMPANY.phone} · {COMPANY.email}
              </div>
            </div>
          </header>

          <table className="mt-2 w-full">
            <tbody>
              <WaRow k="Date" v={data.presentedOn} />
              <WaRow k="Agreement No." v={data.refLabel} />
              <WaRow k="Issued To" v={gc?.company ?? '[GC NAME]'} />
              <WaRow k="GC Address" v={gc?.address ?? '—'} />
              <WaRow k="GC Contact" v={contact ? [contact.name, contact.email, contact.phone].filter(Boolean).join(' / ') : '—'} />
              <WaRow k="Project" v={bid.name} />
              <WaRow k="Project Address" v={bid.address ?? '—'} />
              <WaRow k="Estimate Ref" v={`${COMPANY.name} Est. # ${data.refLabel}, ${data.presentedOn}`} />
            </tbody>
          </table>

          <SectionTitle small>Scope of Work</SectionTitle>
          <p>
            Vendor shall furnish all labor, materials, equipment, fabrication, delivery, and
            installation as described in the referenced {COMPANY.name} estimate (incorporated by
            reference){data.inclusions ? ' and as further described here:' : '.'}
          </p>
          {data.inclusions && <p className="mt-0.5 whitespace-pre-wrap">{data.inclusions}</p>}
          {data.exclusions && (
            <p className="mt-0.5">
              <b>Exclusions:</b> <span className="whitespace-pre-wrap">{data.exclusions}</span>
            </p>
          )}

          <SectionTitle small>Contract Amount</SectionTitle>
          <table className="w-full border-2 border-slate-900">
            <tbody>
              <tr className="border-b border-slate-300">
                <td className="px-2 py-1 font-semibold">Contract Amount (Lump Sum)</td>
                <td className="px-2 py-1 text-right font-semibold tabular-nums">{fmtMoney(data.contract)}</td>
              </tr>
              <tr className="border-b border-slate-300">
                <td className="px-2 py-0.5">Tax</td>
                <td className="px-2 py-0.5 text-right tabular-nums">{data.taxExempt ? 'exempt' : fmtMoney(data.tax)}</td>
              </tr>
              <tr className="bg-slate-100 font-semibold">
                <td className="px-2 py-1">Total including tax</td>
                <td className="px-2 py-1 text-right tabular-nums">{fmtMoney(data.contract + (data.taxExempt ? 0 : data.tax))}</td>
              </tr>
            </tbody>
          </table>

          {(terms.wa_payment_terms ?? '').trim() !== '' && (
            <>
              <SectionTitle small>Payment Terms</SectionTitle>
              <ul className="list-disc pl-5 space-y-px">
                {terms.wa_payment_terms.split('\n').map((l) => l.trim()).filter(Boolean).map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            </>
          )}

          {(terms.wa_conditions ?? '').trim() !== '' && (
            <>
              <SectionTitle small>Conditions</SectionTitle>
              <ul className="list-disc pl-5 space-y-px">
                {terms.wa_conditions.split('\n').map((l) => l.trim()).filter(Boolean).map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            </>
          )}

          <SectionTitle small>Acceptance</SectionTitle>
          <p>By signing below, both parties accept the terms set forth in this Work Authorization Agreement.</p>
          <div className="mt-3 grid grid-cols-2 gap-8 break-inside-avoid">
            <div>
              <div className="font-semibold">VENDOR — {COMPANY.name}</div>
              <div className="mt-8 border-t-2 border-slate-900 pt-0.5 text-[9px] uppercase tracking-wider text-slate-500">
                Signature / Printed Name / Title / Date
              </div>
            </div>
            <div>
              <div className="font-semibold">CONTRACTOR — {gc?.company ?? '[GC NAME]'}</div>
              <div className="mt-8 border-t-2 border-slate-900 pt-0.5 text-[9px] uppercase tracking-wider text-slate-500">
                Signature / Printed Name / Title / Date
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <tr className="border-b border-slate-300 last:border-b-0">
      <td className="px-2 py-1">{label}</td>
      <td className="px-2 py-1 text-right tabular-nums">{value}</td>
    </tr>
  )
}

function WaRow({ k, v }: { k: string; v: string }) {
  return (
    <tr className="border-b border-slate-200">
      <td className="w-28 py-0.5 pr-2 font-mono text-[8.5px] uppercase tracking-wider text-slate-500">{k}</td>
      <td className="py-0.5">{v}</td>
    </tr>
  )
}

function SectionTitle({ children, small }: { children: React.ReactNode; small?: boolean }) {
  return (
    <h3
      className={`border-b border-slate-900 font-mono font-semibold uppercase tracking-widest ${
        small ? 'mb-0.5 mt-2 pb-px text-[9px]' : 'mb-1 mt-4 pb-0.5 text-[11px]'
      }`}
    >
      {children}
    </h3>
  )
}
