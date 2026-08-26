import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type {
  Area, AreaFinishOverride, AreaMaterialOverride, Assembly, AssemblyMaterial, Bid, BidCustomer, BidFinish,
  BidMaterialOverride, ChangeOrder, LineItem, Material, Profile, Setting,
} from '../lib/types'
import { buildContext, priceBid } from '../lib/pricing'
import { fmtMoney, partyLabels } from '../lib/format'
import { LOGO_URL } from '../lib/branding'
import VendorSignature from '../components/VendorSignature'

/** Printable change order: original contract, the change, new contract, signatures.
 *  Draft COs price live; approved COs print their locked numbers. */
export default function ChangeOrderDoc() {
  const { id, coId } = useParams<{ id: string; coId: string }>()
  const { canEdit, session } = useAuth()
  const [signers, setSigners] = useState<Profile[]>([])
  const [signed, setSigned] = useState(false)
  useEffect(() => {
    supabase!.from('profiles').select('id, email, role, created_at, signature_data, signer_name, signer_title').then(({ data }) => setSigners((data ?? []) as Profile[]))
  }, [])
  const [bid, setBid] = useState<Bid | null>(null)
  const [co, setCo] = useState<ChangeOrder | null>(null)
  const [areas, setAreas] = useState<Area[]>([])
  const [lines, setLines] = useState<LineItem[]>([])
  const [assemblies, setAssemblies] = useState<Assembly[]>([])
  const [bom, setBom] = useState<AssemblyMaterial[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [bidFinishes, setBidFinishes] = useState<BidFinish[]>([])
  const [overrides, setOverrides] = useState<BidMaterialOverride[]>([])
  const [areaOverrides, setAreaOverrides] = useState<AreaMaterialOverride[]>([])
  const [areaFinishOverrides, setAreaFinishOverrides] = useState<AreaFinishOverride[]>([])
  const [settings, setSettings] = useState<Setting[]>([])
  const [gcs, setGcs] = useState<BidCustomer[]>([])
  const [company, setCompany] = useState<Record<string, string>>({})
  const [descDraft, setDescDraft] = useState('')
  const [logoOk, setLogoOk] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      const [bidRes, coRes, areaRes, asmRes, bomRes, matRes, bfRes, ovrRes, setRes, gcRes, coTextRes] =
        await Promise.all([
          supabase!.from('bids').select('*').eq('id', id!).single(),
          supabase!.from('change_orders').select('*').eq('id', coId!).single(),
          supabase!.from('areas').select('*').eq('bid_id', id!).order('sort_order'),
          supabase!.from('assemblies').select('*'),
          supabase!.from('assembly_materials').select('*'),
          supabase!.from('materials').select('*'),
          supabase!.from('bid_finishes').select('*, finish:finishes(*)').eq('bid_id', id!),
          supabase!.from('bid_material_overrides').select('*').eq('bid_id', id!),
          supabase!.from('settings').select('*'),
          supabase!.from('bid_customers').select('*, customer:customers(*)').eq('bid_id', id!),
          supabase!.from('text_settings').select('key, value').eq('group_name', 'Company'),
        ])
      if (bidRes.error) return setError(bidRes.error.message)
      if (coRes.error) return setError(coRes.error.message)
      setBid(bidRes.data as Bid)
      const coRow = coRes.data as ChangeOrder
      setCo(coRow)
      setDescDraft(coRow.description ?? '')
      const areaRows = (areaRes.data ?? []) as Area[]
      setAreas(areaRows)
      if (areaRows.length > 0) {
        const [lineRes, aoRes, afoRes] = await Promise.all([
          supabase!.from('line_items').select('*').in('area_id', areaRows.map((a) => a.id)).order('sort_order'),
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
      setSettings((setRes.data ?? []) as Setting[])
      setGcs((gcRes.data ?? []) as BidCustomer[])
      setCompany(Object.fromEntries(((coTextRes.data ?? []) as { key: string; value: string }[]).map((t) => [t.key, t.value])))
    })()
  }, [id, coId])

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
      areaFinishOverrides,
    )
  }, [settings, assemblies, bom, materials, bidFinishes, overrides, areaOverrides, areaFinishOverrides])
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

  useEffect(() => {
    if (bid && co) document.title = `CHANGE ORDER ${co.co_number} ${bid.job_number} - ${bid.name.toUpperCase()}`
  }, [bid, co])

  if (error)
    return <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>
  if (!bid || !co || !pricing) return <p className="text-sm text-slate-500">Loading…</p>

  // the vendor signer is whoever created the CO (fall back to the signed-in user)
  const signer = co.created_by
    ? signers.find((p) => p.email === co.created_by)
    : signers.find((p) => p.id === session?.user.id)
  const coAreas = areas.filter((a) => a.change_order_id === co.id)
  const approved = co.status === 'approved'
  const coAdj = Number(co.price_adjustment ?? 0)
  // draft: live numbers; approved: the numbers locked at approval
  const amount = approved
    ? Number(co.amount ?? 0)
    : coAreas.reduce((s, a) => s + (pricing.alternateAllIn.get(a.id) ?? 0), 0) + coAdj
  const scopeAmount = amount - coAdj
  const prior = approved ? Number(co.prior_contract ?? 0) : pricing.contractAmount
  const newContract = prior + amount

  const gc = (gcs.find((g) => g.won_through) ?? gcs[0])?.customer
  const party = partyLabels(gc?.type)
  const namePlaceholder = `[${party.short.toUpperCase()} NAME]`
  const docDate = approved && co.approved_at ? new Date(co.approved_at) : new Date()
  const dateLabel = docDate.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })

  const scopeLines = coAreas.flatMap((area) =>
    (linesByArea.get(area.id) ?? []).map((l) => {
      const asm = l.assembly_id ? ctx.assemblies.get(l.assembly_id) : undefined
      const qty = l.entry_mode === 'feet' ? `${l.entry_value} LF` : `${Number(l.quantity)} ${asm?.pricing_unit ?? 'EA'}`
      return `${asm?.name ?? l.name} (${qty})`
    }),
  )

  async function saveDescription() {
    const description = descDraft.trim() || null
    setCo((c) => (c ? { ...c, description } : c))
    await supabase!.from('change_orders').update({ description }).eq('id', co!.id)
  }

  return (
    <div className="max-w-3xl space-y-4 pb-10 print:max-w-none print:pb-0">
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <Link to={`/bids/${bid.id}/estimate`} className="text-sm text-slate-500 hover:text-slate-900">
          ← Estimate
        </Link>
        {!approved && (
          <span className="rounded-full border border-amber-400 bg-amber-50 px-3 py-1 font-mono text-[11px] uppercase tracking-wider text-amber-800">
            Draft — numbers are live until approved
          </span>
        )}
        {signer?.signature_data && (
          signed ? (
            <span className="ml-auto flex items-center gap-2 text-sm">
              <span className="rounded-full border border-emerald-400 bg-emerald-50 px-3 py-1 font-mono text-[11px] uppercase tracking-wider text-emerald-800">Signed</span>
              <button onClick={() => setSigned(false)} className="text-xs text-slate-500 underline decoration-dotted hover:text-slate-900">remove</button>
            </span>
          ) : (
            <button
              onClick={() => setSigned(true)}
              title="Put your signature in the vendor box"
              className="ml-auto rounded-md bg-slate-900 px-4 py-1.5 text-sm font-semibold text-white hover:bg-slate-700"
            >
              Sign
            </button>
          )
        )}
        <button
          onClick={() => window.print()}
          className={`rounded-md bg-slate-900 px-4 py-1.5 text-sm font-semibold text-white hover:bg-slate-700 ${signer?.signature_data ? '' : 'ml-auto'}`}
        >
          Print / save PDF
        </button>
      </div>

      {canEdit && (
        <label className="block print:hidden">
          <span className="font-mono text-[11px] uppercase tracking-widest text-slate-500">
            Description — prints on the document
          </span>
          <textarea
            rows={2}
            value={descDraft}
            onChange={(e) => setDescDraft(e.target.value)}
            onBlur={() => void saveDescription()}
            placeholder="Why the change: field condition, owner request, drawing revision…"
            className="input"
          />
        </label>
      )}

      <div className="light-doc rounded-lg border-2 border-slate-900 bg-white p-6 text-[12px] print:rounded-none print:border-0 print:p-0">
        <header className="flex items-center gap-4 border-b-4 border-slate-900 pb-2">
          {logoOk && LOGO_URL ? (
            <img src={LOGO_URL} alt="" className="h-16 w-auto max-w-[16rem] object-contain" onError={() => setLogoOk(false)} />
          ) : (
            <div className="text-xl font-bold tracking-tight">{company.company_name ?? ''}</div>
          )}
          <div className="ml-auto text-right">
            <div className="text-lg font-bold tracking-tight">CHANGE ORDER #{co.co_number}</div>
            <div className="text-[11px] text-slate-500">
              {[company.company_address, company.company_phone, company.company_email].filter(Boolean).join(' · ')}
            </div>
          </div>
        </header>

        <table className="mt-3 w-full">
          <tbody>
            <CoRow k="Date" v={dateLabel} />
            <CoRow k="Project" v={`${bid.job_number} — ${bid.name}`} />
            {bid.address && <CoRow k="Project Address" v={bid.address} />}
            <CoRow k="Issued To" v={gc?.company ?? namePlaceholder} />
            <CoRow k="Reference" v={`${company.company_name ?? ''} Est. # ${bid.job_number}`} />
          </tbody>
        </table>

        <SectionHead>Description of Change</SectionHead>
        <p className="font-semibold">{co.title}</p>
        {co.description && <p className="mt-0.5 whitespace-pre-wrap">{co.description}</p>}
        {scopeLines.length > 0 && (
          <p className="mt-1">
            <b>Includes:</b> {scopeLines.join('; ')}
          </p>
        )}

        <SectionHead>Contract Adjustment</SectionHead>
        <table className="w-full border-2 border-slate-900">
          <tbody>
            <tr className="border-b border-slate-300">
              <td className="px-2 py-1">Original Contract Amount</td>
              <td className="px-2 py-1 text-right tabular-nums">{fmtMoney(prior)}</td>
            </tr>
            {coAdj !== 0 && (
              <>
                <tr className="border-b border-slate-300">
                  <td className="px-2 py-1">Scope change</td>
                  <td className="px-2 py-1 text-right tabular-nums">{fmtMoney(scopeAmount)}</td>
                </tr>
                <tr className="border-b border-slate-300">
                  <td className="px-2 py-1">{coAdj < 0 ? 'Discount' : 'Price adjustment'}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{fmtMoney(coAdj)}</td>
                </tr>
              </>
            )}
            <tr className="border-b border-slate-300">
              <td className="px-2 py-1 font-semibold">
                This Change Order ({amount < 0 ? 'deduct' : 'add'})
              </td>
              <td className="px-2 py-1 text-right font-semibold tabular-nums">{fmtMoney(amount)}</td>
            </tr>
            <tr className="bg-slate-100 font-semibold">
              <td className="px-2 py-1.5">New Contract Amount</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{fmtMoney(newContract)}</td>
            </tr>
          </tbody>
        </table>
        <p className="mt-0.5 text-[10px] text-slate-600">
          {bid.tax_exempt
            ? 'Tax exempt — certificate on file.'
            : 'Amounts exclude sales tax; tax applies to the new contract amount.'}{' '}
          All other terms of the referenced agreement remain unchanged.
        </p>

        <SectionHead>Acceptance</SectionHead>
        <p>
          By signing below, both parties agree to the change in scope and contract amount described
          in this Change Order.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-8 break-inside-avoid">
          <VendorSignature
            companyName={company.company_name ?? ''}
            signatureSrc={signed ? signer?.signature_data : null}
            signerName={signed ? signer?.signer_name : null}
            signerTitle={signed ? signer?.signer_title : null}
            date={new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
          />
          <div>
            <div className="font-semibold">{party.signer} — {gc?.company ?? namePlaceholder}</div>
            <div className="mt-8 border-t-2 border-slate-900 pt-0.5 text-[9px] uppercase tracking-wider text-slate-500">
              Signature / Printed Name / Title / Date
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function CoRow({ k, v }: { k: string; v: string }) {
  return (
    <tr className="border-b border-slate-200">
      <td className="w-32 py-0.5 pr-2 font-mono text-[9px] uppercase tracking-wider text-slate-500">{k}</td>
      <td className="py-0.5">{v}</td>
    </tr>
  )
}

function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-1 mt-4 border-b-2 border-slate-900 pb-0.5 font-mono text-[10px] uppercase tracking-widest text-slate-600">
      {children}
    </h2>
  )
}
