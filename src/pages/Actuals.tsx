import UiIcon from '../components/UiIcon'
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type {
  Area, AreaFinishOverride, AreaMaterialOverride, Assembly, AssemblyMaterial, Bid, BidFinish, BidMaterialOverride, LineItem, Material, Setting,
} from '../lib/types'
import { buildContext, priceBid } from '../lib/pricing'
import { fmtMoney } from '../lib/format'
import { actualsLaborCosts } from '../lib/actuals'
import { costRateBreakdown, jobLaborCostRows } from '../lib/costAllocation'
import ConfirmDialog from '../components/ConfirmDialog'
import LoadError from '../components/LoadError'
import SaveFeedback from '../components/SaveFeedback'
import { requireLoaded, errorMessage } from '../lib/loadResults'
import { useSaveQueue } from '../lib/useSaveQueue'
import { writeActualsFields, type ActualsEdit } from '../lib/actualsWrite'
import ActualsPrintSheet from '../components/ActualsPrintSheet'

interface Receipt {
  id: string
  bid_id: string
  file_path: string
  amount: number | null
  category: 'materials' | 'delivery' | 'travel' | 'subs' | 'other'
  note: string | null
  receipt_date: string | null
  uploaded_by: string | null
  created_at: string
}

const RECEIPT_CATEGORIES: Receipt['category'][] = ['materials', 'delivery', 'travel', 'subs', 'other']

interface JobActuals {
  bid_id: string
  material_cost: number | null
  shop_hours: number | null
  install_hours: number | null
  delivery_cost: number | null
  travel_cost: number | null
  sub_cost: number | null
  other_cost: number | null
  notes: string | null
}

const EMPTY: Omit<JobActuals, 'bid_id'> = {
  material_cost: null, shop_hours: null, install_hours: null, delivery_cost: null,
  travel_cost: null, sub_cost: null, other_cost: null, notes: null,
}

export default function Actuals() {
  const { id } = useParams<{ id: string }>()
  const { isAdmin: isAdminRole, isOffice, session } = useAuth()
  // office handles the receipts and hour actuals, so they get this page too
  const isAdmin = isAdminRole || isOffice
  const [bid, setBid] = useState<Bid | null>(null)
  const [areas, setAreas] = useState<Area[]>([])
  const [lines, setLines] = useState<LineItem[]>([])
  const [areaOverrides, setAreaOverrides] = useState<AreaMaterialOverride[]>([])
  const [areaFinishOverrides, setAreaFinishOverrides] = useState<AreaFinishOverride[]>([])
  const [assemblies, setAssemblies] = useState<Assembly[]>([])
  const [bom, setBom] = useState<AssemblyMaterial[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [bidFinishes, setBidFinishes] = useState<BidFinish[]>([])
  const [overrides, setOverrides] = useState<BidMaterialOverride[]>([])
  const [settings, setSettings] = useState<Setting[]>([])
  const [actuals, setActuals] = useState<JobActuals | null>(null)
  const [contract, setContract] = useState<number | null>(null)
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [receiptRefreshError, setReceiptRefreshError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [reload, setReload] = useState(0)
  const [showPrintPreview, setShowPrintPreview] = useState(false)
  const saves = useSaveQueue()

  async function loadReceipts() {
    const { data, error } = await supabase!
      .from('receipts')
      .select('*')
      .eq('bid_id', id!)
      .order('created_at', { ascending: false })
    if (error) { setReceiptRefreshError(error.message); return }
    setReceiptRefreshError(null)
    setReceipts((data ?? []) as Receipt[])
  }

  useEffect(() => {
    if (!isAdmin) return
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    ;(async () => {
      try {
        const [bidRes, areaRes, asmRes, bomRes, matRes, bfRes, ovrRes, setRes, actRes, revRes, recRes] =
          await Promise.all([
            supabase!.from('bids').select('*').eq('id', id!).single(),
            supabase!.from('areas').select('*').eq('bid_id', id!),
            supabase!.from('assemblies').select('*'),
            supabase!.from('assembly_materials').select('*'),
            supabase!.from('materials').select('*'),
            supabase!.from('bid_finishes').select('*, finish:finishes(*)').eq('bid_id', id!),
            supabase!.from('bid_material_overrides').select('*').eq('bid_id', id!),
            supabase!.from('settings').select('*'),
            supabase!.from('job_actuals').select('*').eq('bid_id', id!).maybeSingle(),
            supabase!.from('revisions').select('contract_amount').eq('bid_id', id!).order('rev_number', { ascending: false }).limit(1),
            supabase!.from('receipts').select('*').eq('bid_id', id!).order('created_at', { ascending: false }),
          ])
        requireLoaded({ Project: bidRes, Areas: areaRes, Assemblies: asmRes, Recipes: bomRes, Materials: matRes, Finishes: bfRes, Overrides: ovrRes, Settings: setRes, 'Actual hours': actRes, Revision: revRes, Receipts: recRes })
        if (cancelled) return
        setBid(bidRes.data as Bid)
        const areaRows = (areaRes.data ?? []) as Area[]
        setAreas(areaRows)
        if (areaRows.length > 0) {
          const [lineRes, aoRes, afoRes] = await Promise.all([
            supabase!.from('line_items').select('*').in('area_id', areaRows.map((a) => a.id)),
            supabase!.from('area_material_overrides').select('*').in('area_id', areaRows.map((a) => a.id)),
            supabase!.from('area_finish_overrides').select('*, finish:finishes(*)').in('area_id', areaRows.map((a) => a.id)),
          ])
          requireLoaded({ 'Line items': lineRes, 'Area materials': aoRes, 'Area finishes': afoRes })
          if (cancelled) return
          setLines((lineRes.data ?? []) as LineItem[])
          setAreaOverrides((aoRes.data ?? []) as AreaMaterialOverride[])
          setAreaFinishOverrides((afoRes.data ?? []) as AreaFinishOverride[])
        } else { setLines([]); setAreaOverrides([]); setAreaFinishOverrides([]) }
        setAssemblies((asmRes.data ?? []) as Assembly[])
        setBom((bomRes.data ?? []) as AssemblyMaterial[])
        setMaterials((matRes.data ?? []) as Material[])
        setBidFinishes((bfRes.data ?? []) as BidFinish[])
        setOverrides((ovrRes.data ?? []) as BidMaterialOverride[])
        setSettings((setRes.data ?? []) as Setting[])
        setActuals((actRes.data as JobActuals) ?? { bid_id: id!, ...EMPTY })
        const rev = (revRes.data ?? [])[0] as { contract_amount: number } | undefined
        setContract(rev ? Number(rev.contract_amount) : null)
        setReceipts((recRes.data ?? []) as Receipt[])
      } catch (error) { if (!cancelled) setLoadError(errorMessage(error)) }
      finally { if (!cancelled) setLoading(false) }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isAdmin, reload])

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

  if (!isAdmin) {
    return (
      <p className="rounded-lg border-2 border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
        Admins only — this page shows real profit.
      </p>
    )
  }
  if (receiptRefreshError) return <><SaveFeedback state={saves} retry={saves.queue.retry} explanation="" /><LoadError subject="updated receipts" error={receiptRefreshError} retry={() => void loadReceipts()} /></>
  if (loadError) return <LoadError subject="actual costs" error={loadError} retry={() => setReload(n => n + 1)} />
  if (loading || !bid || !pricing || !actuals) return <p role="status" className="text-sm text-slate-500">Loading actual costs…</p>

  const s = ctx.settings
  const cb = pricing.costBreakdown
  const labor = actualsLaborCosts(s, actuals.shop_hours, actuals.install_hours,
    pricing.installHours, cb.install, bid.adders.install)
  const shopRate = labor.rate
  const estInstallLabor = labor.estimatedInstallLabor
  const estFuel = labor.estimatedFuel
  const estTravel = cb.travel + estFuel
  const contractAmount = contract ?? pricing.contractAmount

  async function save(fields: ActualsEdit) {
    if (!bid) return
    const bidId = bid.id
    setActuals(previous => previous ? { ...previous, ...fields } : previous)
    // A partial upsert preserves every untouched field, including on retry.
    saves.queue.enqueue('Actual costs', () => writeActualsFields(supabase!, bidId, session?.user.email ?? null, fields))
  }

  const a = actuals
  // Money comes ONLY from receipts — summed per category, no retyping
  const receiptTotal = (cat: string) => {
    const rows = receipts.filter((r) => r.category === cat)
    if (rows.length === 0) return null
    return rows.reduce((s, r) => s + Number(r.amount ?? 0), 0)
  }
  const rMaterials = receiptTotal('materials')
  const rDelivery = receiptTotal('delivery')
  const rTravel = receiptTotal('travel')
  const rSubs = receiptTotal('subs')
  const rOther = receiptTotal('other')
  const missingAmounts = receipts.filter((r) => r.amount == null).length

  const actShopLabor = labor.shopLabor
  const actInstallLabor = labor.installLabor
  const rates = costRateBreakdown(s)
  const laborRows = jobLaborCostRows(s, cb.shopLabor, estInstallLabor,
    a.shop_hours == null ? null : actShopLabor, a.install_hours == null ? null : actInstallLabor)
  const actTotal =
    (rMaterials ?? 0) + actShopLabor + actInstallLabor +
    (rDelivery ?? 0) + (rTravel ?? 0) + (rSubs ?? 0) + (rOther ?? 0)
  const anyEntered = receipts.length > 0 || a.shop_hours != null || a.install_hours != null

  const estTotal = cb.materials + cb.shopLabor + labor.estimatedInstallCost + cb.delivery + cb.travel + cb.subs + cb.other
  const estProfit = contractAmount - estTotal
  const actProfit = contractAmount - actTotal

  return (
    <div className="zaid-page zaid-actuals max-w-3xl space-y-5 print:max-w-none print:space-y-0">
      <div className="space-y-5 print:hidden">
      <SaveFeedback state={saves} retry={saves.queue.retry} explanation="" />
      {error && <div className="save-feedback save-failed" role="alert"><div><strong>The receipt action did not complete.</strong><p>Check the receipt and try again. Your edits are still here.</p><details><summary>Error details</summary>{error}</details></div><button className="index-secondary" onClick={() => setError(null)}>Dismiss</button></div>}
      <div className="flex flex-wrap items-center gap-3">
        <Link to={`/bids/${bid.id}`} className="text-sm text-slate-500 hover:text-slate-900">
          <UiIcon name="left" /> {bid.job_number}
        </Link>
        <h1 className="min-w-0 flex-1 basis-[calc(100%-90px)] truncate text-lg font-semibold tracking-tight sm:basis-0">
          {bid.name} — estimated vs actual
        </h1>
        <button type="button" className="index-secondary" aria-expanded={showPrintPreview} aria-controls="actuals-print-preview" onClick={() => setShowPrintPreview(value => !value)}>{showPrintPreview ? 'Back to actuals' : 'Show print preview'}</button>
        <button type="button" className="index-primary" disabled={saves.pending > 0 || !!saves.error || !!receiptRefreshError} onClick={() => { if (saves.queue.getSnapshot().pending === 0 && !saves.queue.getSnapshot().error) window.print() }}>Print / Save PDF</button>
      </div>
      {(saves.pending > 0 || saves.error) && <p className="text-sm text-slate-500">Printing is available once your changes are saved.</p>}
      </div>

      <div className={showPrintPreview ? 'hidden' : 'space-y-5 print:hidden'}>

      <p className="text-sm text-slate-500">
        Materials and other expenses come from receipts below. Enter shop and install hours;
        labor and overhead costs calculate automatically.
        {contract == null && ' (No snapshot found — contract uses live pricing.)'}
      </p>

      {missingAmounts > 0 && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          ⚠︎ {missingAmounts} receipt{missingAmounts > 1 ? 's have' : ' has'} no amount yet — they
          count as $0 until you fill them in below.
        </p>
      )}

      <section className="rounded-lg border border-slate-300 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold">Hours worked</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <HoursField label="Shop hours" estimated={cb.shopHours} actual={a.shop_hours} onSave={v => void save({ shop_hours: v })} />
          <HoursField label="Install hours" estimated={pricing.installHours} actual={a.install_hours} onSave={v => void save({ install_hours: v })} />
        </div>
        <p className="mt-3 text-xs text-slate-500">{rates ? `Each recorded hour includes ${fmtMoney(rates.labor)} labor and ${fmtMoney(rates.overhead)} overhead.` : `Each recorded hour uses ${fmtMoney(shopRate)} for labor and overhead. Set their split in Settings → Overhead.`}</p>
      </section>

      <div className="overflow-x-auto rounded-lg border-2 border-slate-800 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-slate-800 text-left font-mono text-[10px] uppercase tracking-wider text-slate-400">
              <th className="px-4 py-2 font-medium">Cost</th>
              <th className="px-2 py-2 font-medium text-right">Estimated</th>
              <th className="px-2 py-2 font-medium text-right">Actual</th>
              <th className="px-4 py-2 font-medium text-right">Difference</th>
            </tr>
          </thead>
          <tbody>
            <Row label="Materials ($)" est={cb.materials} actual={rMaterials} money fromReceipts />
            {laborRows.map(row => <Row key={row.label} label={row.label} est={row.estimated} actual={row.actual} money calculated />)}
            <Row label="Delivery ($)" est={cb.delivery} actual={rDelivery} money fromReceipts />
            <Row label="Travel — fuel, per diem, hotel ($)" est={estTravel} actual={rTravel} money fromReceipts />
            <Row label="Sub-contractors ($)" est={cb.subs} actual={rSubs} money fromReceipts />
            <Row label="Other — one-offs, punch, GC, insurance ($)" est={cb.other} actual={rOther} money fromReceipts />
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-800 font-semibold">
              <td className="px-4 py-2">Total cost</td>
              <td className="px-2 py-2 text-right tabular-nums">{fmtMoney(estTotal)}</td>
              <td className="px-2 py-2 text-right tabular-nums">{anyEntered ? fmtMoney(actTotal) : '—'}</td>
              <td className={`px-4 py-2 text-right tabular-nums ${!anyEntered ? '' : actTotal > estTotal ? 'text-red-600' : 'text-emerald-700'}`}>
                {anyEntered ? fmtMoney(actTotal - estTotal) : ''}
              </td>
            </tr>
            {/* the money story stays with real admins — office only works the cost side */}
            {isAdminRole && (
              <>
                <tr className="border-t border-slate-200">
                  <td className="px-4 py-2">Contract</td>
                  <td className="px-2 py-2 text-right tabular-nums" colSpan={2}>{fmtMoney(contractAmount)}</td>
                  <td></td>
                </tr>
                <tr className="border-t border-slate-200 font-semibold">
                  <td className="px-4 py-2">Profit</td>
                  <td className="px-2 py-2 text-right tabular-nums">{fmtMoney(estProfit)}</td>
                  <td className={`px-2 py-2 text-right tabular-nums ${!anyEntered ? '' : actProfit < 0 ? 'text-red-600' : ''}`}>
                    {anyEntered ? fmtMoney(actProfit) : '—'}
                  </td>
                  <td className={`px-4 py-2 text-right tabular-nums ${!anyEntered ? '' : actProfit < estProfit ? 'text-red-600' : 'text-emerald-700'}`}>
                    {anyEntered ? fmtMoney(actProfit - estProfit) : ''}
                  </td>
                </tr>
                <tr className="border-t border-slate-200 text-xs text-slate-500">
                  <td className="px-4 py-1.5">Margin</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {contractAmount > 0 ? `${((estProfit / contractAmount) * 100).toFixed(1)}%` : '—'}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {anyEntered && contractAmount > 0 ? `${((actProfit / contractAmount) * 100).toFixed(1)}%` : '—'}
                  </td>
                  <td></td>
                </tr>
              </>
            )}
          </tfoot>
        </table>
      </div>

      <ReceiptsSection
        bidId={bid.id}
        receipts={receipts}
        userEmail={session?.user.email ?? null}
        onChange={() => void loadReceipts()}
        onError={setError}
      />

      <label className="block">
        <span className="font-mono text-[11px] uppercase tracking-widest text-slate-500">
          Notes — what happened on this job?
        </span>
        <textarea
          rows={3}
          defaultValue={a.notes ?? ''}
          onBlur={(e) => (e.target.value || null) !== a.notes && void save({ notes: e.target.value || null })}
          placeholder="Install ran long because…"
          className="input"
        />
      </label>
      </div>
      <div id="actuals-print-preview" className={showPrintPreview ? 'block' : 'hidden print:block'}>
        <ActualsPrintSheet jobNumber={bid.job_number ?? ''} jobName={bid.name}
          rows={[
            { label: 'Materials', estimated: cb.materials, actual: rMaterials },
            ...laborRows,
            { label: 'Delivery', estimated: cb.delivery, actual: rDelivery },
            { label: 'Travel — fuel, per diem, hotel', estimated: estTravel, actual: rTravel },
            { label: 'Subcontractors', estimated: cb.subs, actual: rSubs },
            { label: 'Other — one-offs, punch, GC, insurance', estimated: cb.other, actual: rOther },
          ]}
          estimatedTotal={estTotal} actualTotal={anyEntered ? actTotal : null}
          shopHours={a.shop_hours} installHours={a.install_hours} laborRate={shopRate}
          estimatedShopHours={cb.shopHours} estimatedInstallHours={pricing.installHours}
          costSettings={s}
          contract={contractAmount} showProfit={isAdminRole} liveContract={contract == null}
          receiptCount={receipts.length} missingAmounts={missingAmounts} notes={a.notes} />
      </div>
    </div>
  )
}

function ReceiptsSection({
  bidId, receipts, userEmail, onChange, onError,
}: {
  bidId: string
  receipts: Receipt[]
  userEmail: string | null
  onChange: () => void
  onError: (message: string) => void
}) {
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [category, setCategory] = useState<Receipt['category']>('materials')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [removing, setRemoving] = useState<Receipt | null>(null)

  const totals = new Map<string, number>()
  for (const r of receipts) totals.set(r.category, (totals.get(r.category) ?? 0) + Number(r.amount ?? 0))

  async function uploadFiles(files: File[]) {
    const ok = files.filter((f) => /^image\//.test(f.type) || f.type === 'application/pdf')
    if (ok.length === 0) return
    setUploading(true)
    let first = true
    for (const file of ok) {
      const path = `${bidId}/${Date.now()}_${file.name.replace(/[^\w.\-]/g, '_')}`
      const { error: upErr } = await supabase!.storage.from('receipts').upload(path, file)
      if (upErr) {
        onError(upErr.message)
        continue
      }
      const { error } = await supabase!.from('receipts').insert({
        bid_id: bidId,
        file_path: path,
        // typed-in amount/note go with the first file; the rest get filled in on the list
        amount: first && amount !== '' ? Number(amount) : null,
        category,
        note: first && note.trim() ? note.trim() : null,
        receipt_date: new Date().toISOString().slice(0, 10),
        uploaded_by: userEmail,
      })
      if (error) onError(error.message)
      first = false
    }
    setAmount('')
    setNote('')
    setUploading(false)
    onChange()
  }

  async function patchReceipt(r: Receipt, fields: Partial<Receipt>) {
    const { error } = await supabase!.from('receipts').update(fields).eq('id', r.id)
    if (error) onError(error.message)
    onChange()
  }

  async function view(r: Receipt) {
    const { data, error } = await supabase!.storage.from('receipts').createSignedUrl(r.file_path, 300)
    if (error) onError(error.message)
    else if (data) window.open(data.signedUrl, '_blank')
  }

  async function remove(r: Receipt) {
    setRemoving(null)
    await supabase!.storage.from('receipts').remove([r.file_path])
    await supabase!.from('receipts').delete().eq('id', r.id)
    onChange()
  }

  return (
    <section>
      <h2 className="mb-2 font-mono text-[11px] uppercase tracking-widest text-slate-500">
        Receipts — the paper behind the numbers
      </h2>

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          void uploadFiles([...e.dataTransfer.files])
        }}
        className={`rounded-lg border-2 bg-white p-4 transition-colors ${
          dragging ? 'border-dashed border-emerald-600 bg-emerald-50' : 'border-slate-800'
        }`}
      >
        <p className={`mb-3 rounded-md border border-dashed px-3 py-2 text-center text-xs ${dragging ? 'border-emerald-500 text-emerald-700 font-semibold' : 'border-slate-300 text-slate-400'}`}>
          {dragging ? 'Drop to upload' : 'Drag photos or PDFs anywhere in this box — or use the button'}
        </p>
        <div className="bid-receipt-form flex flex-wrap items-end gap-2">
          <label className="block">
            <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">For</span>
            <select value={category} onChange={(e) => setCategory(e.target.value as Receipt['category'])} className="input mt-0.5 w-auto py-1.5">
              {RECEIPT_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">Amount ($)</span>
            <input type="number" step="any" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} className="input mt-0.5 w-28 py-1.5" />
          </label>
          <label className="block min-w-0 flex-1 basis-40">
            <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">What is it</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="McKillican sheet order" className="input mt-0.5 py-1.5" />
          </label>
          <label className={`cursor-pointer rounded-md px-3 py-2 text-sm font-semibold text-white ${uploading ? 'bg-slate-400' : 'bg-slate-900 hover:bg-slate-700'}`}>
            {uploading ? 'Uploading…' : '+ Upload receipt'}
            <input
              type="file"
              accept="image/*,application/pdf"
              multiple
              className="file-upload-input"
              disabled={uploading}
              onChange={(e) => {
                if (e.target.files?.length) void uploadFiles([...e.target.files])
                e.target.value = ''
              }}
            />
          </label>
        </div>

        {receipts.length > 0 && (
          <>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {[...totals.entries()].filter(([, v]) => v > 0).map(([c, v]) => (
                <span key={c} className="rounded border border-slate-300 bg-slate-50 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-slate-600">
                  {c}: {fmtMoney(v)}
                </span>
              ))}
            </div>
            <div className="mt-2 divide-y divide-slate-100 border-t border-slate-200">
              {receipts.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-2 text-sm">
                  <select
                    value={r.category}
                    onChange={(e) => void patchReceipt(r, { category: e.target.value as Receipt['category'] })}
                    className="rounded border border-slate-200 bg-slate-50 px-1 py-0.5 font-mono text-[10px] uppercase tracking-wider text-slate-500 focus:border-slate-800 focus:outline-none"
                  >
                    {RECEIPT_CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <input
                    defaultValue={r.note ?? ''}
                    placeholder={r.file_path.split('/').pop()}
                    onBlur={(e) => (e.target.value || null) !== r.note && void patchReceipt(r, { note: e.target.value || null })}
                    className="min-w-0 flex-1 rounded border border-transparent px-1.5 py-0.5 text-sm hover:border-slate-200 focus:border-slate-800 focus:outline-none"
                  />
                  <input
                    type="date"
                    defaultValue={r.receipt_date ?? ''}
                    onBlur={(e) => (e.target.value || null) !== r.receipt_date && void patchReceipt(r, { receipt_date: e.target.value || null })}
                    title="Date on the receipt"
                    className="w-36 rounded border border-transparent px-1 py-0.5 font-mono text-xs text-slate-500 hover:border-slate-200 focus:border-slate-800 focus:outline-none"
                  />
                  <span className="flex items-center gap-0.5">
                    <span className="text-xs text-slate-400">$</span>
                    <input
                      type="number" step="any" min="0"
                      defaultValue={r.amount == null ? '' : Number(r.amount)}
                      placeholder="0"
                      onBlur={(e) => {
                        const v = e.target.value === '' ? null : Number(e.target.value)
                        if (v !== (r.amount == null ? null : Number(r.amount))) void patchReceipt(r, { amount: v })
                      }}
                      className="w-24 rounded border border-slate-200 px-1.5 py-0.5 text-right text-sm tabular-nums focus:border-slate-800 focus:outline-none"
                    />
                  </span>
                  <button onClick={() => void view(r)} className="text-xs text-slate-500 underline decoration-dotted hover:text-slate-900">
                    view
                  </button>
                  <button onClick={() => setRemoving(r)} className="text-slate-300 hover:text-red-600">×</button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {removing && (
        <ConfirmDialog
          title="Delete receipt"
          message={`Delete this receipt${removing.amount != null ? ` (${fmtMoney(Number(removing.amount))})` : ''}? The file goes too.`}
          onConfirm={() => void remove(removing)}
          onCancel={() => setRemoving(null)}
        />
      )}
    </section>
  )
}

function HoursField({ label, estimated, actual, onSave }: {
  label: string; estimated: number; actual: number | null; onSave: (value: number | null) => void
}) {
  const [draft, setDraft] = useState(actual == null ? '' : String(actual))
  useEffect(() => setDraft(actual == null ? '' : String(actual)), [actual])
  return <label className="block text-sm">
    <span className="font-medium">{label}</span>
    <input type="number" step="any" min="0" value={draft} placeholder="Not recorded"
      onChange={event => setDraft(event.target.value)}
      onBlur={event => {
        if (!event.currentTarget.reportValidity()) return
        const value = draft === '' ? null : Number(draft)
        if (value !== actual) onSave(value)
      }}
      onKeyDown={event => event.key === 'Enter' && event.currentTarget.blur()}
      className="input mt-1" />
    <span className="mt-1 block text-xs text-slate-500">Estimated: {estimated.toFixed(1)} hrs</span>
  </label>
}

function Row({
  label, est, actual, money, estMoney, actualMoney, fromReceipts, calculated, onSave,
}: {
  label: string
  est: number
  actual: number | null
  money?: boolean
  estMoney?: number
  actualMoney?: number | null
  fromReceipts?: boolean
  calculated?: boolean
  onSave?: (v: number | null) => void
}) {
  const [draft, setDraft] = useState(actual == null ? '' : String(actual))
  useEffect(() => setDraft(actual == null ? '' : String(actual)), [actual])
  const fmt = (v: number) => (money ? fmtMoney(v) : `${Math.round(v * 10) / 10} hrs`)
  const diff = actual == null ? null : (actualMoney ?? actual) - (estMoney ?? est)

  return (
    <tr className="border-t border-slate-100">
      <td className="px-4 py-2">{label}</td>
      <td className="px-2 py-2 text-right tabular-nums">
        {fmt(est)}
        {estMoney != null && <div className="text-xs text-slate-400">{fmtMoney(estMoney)}</div>}
      </td>
      <td className="px-2 py-2 text-right">
        {calculated ? <span className="tabular-nums">{actual == null ? '—' : fmt(actual)}</span> : fromReceipts ? (
          <span className="tabular-nums" title="Summed from receipts below">
            {actual == null ? <span className="text-slate-300">no receipts</span> : fmt(actual)}
            {actual != null && <span className="ml-1 text-[10px] text-slate-400">▤</span>}
          </span>
        ) : (
          <input
            aria-label={label}
            type="number" step="any" min="0"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={(e) => {
              if (!e.currentTarget.reportValidity()) return
              const v = draft === '' ? null : Number(draft)
              if (v !== actual) onSave?.(v)
            }}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            placeholder="—"
            className="w-28 rounded-md border border-slate-300 px-2 py-1 text-right text-sm tabular-nums focus:border-slate-800 focus:outline-none"
          />
        )}
        {actualMoney != null && <div className="text-xs text-slate-400">{fmtMoney(actualMoney)}</div>}
      </td>
      <td className={`px-4 py-2 text-right tabular-nums ${diff == null ? '' : diff > 0 ? 'text-red-600' : 'text-emerald-700'}`}>
        {diff == null ? '' : fmtMoney(diff)}
      </td>
    </tr>
  )
}
