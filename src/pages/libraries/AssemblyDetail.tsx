import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import type { Assembly, AssemblyMaterial, Material } from '../../lib/types'
import { fmtCost } from '../../lib/format'
import ConfirmDialog from '../../components/ConfirmDialog'

export const SLOTS = ['CABINET_LAM', 'PLAM 1', 'PLAM 2', 'PLAM 3', 'PLAM 4', 'SS 1', 'SS 2', 'SS 3', 'SS 4', 'BOX']

export default function AssemblyDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { isAdmin } = useAuth()
  const [assembly, setAssembly] = useState<Assembly | null>(null)
  const [bom, setBom] = useState<AssemblyMaterial[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function load() {
    const [asmRes, bomRes, matRes] = await Promise.all([
      supabase!.from('assemblies').select('*').eq('id', id!).single(),
      supabase!.from('assembly_materials').select('*, material:materials(*)').eq('assembly_id', id!).order('created_at'),
      supabase!.from('materials').select('*').eq('active', true).order('category').order('name'),
    ])
    if (asmRes.error) setError(asmRes.error.message)
    else setAssembly(asmRes.data as Assembly)
    if (bomRes.data) setBom(bomRes.data as AssemblyMaterial[])
    if (matRes.data) setMaterials(matRes.data as Material[])
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  if (error)
    return <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>
  if (!assembly) return <p className="text-sm text-slate-500">Loading…</p>

  const isEA = assembly.pricing_unit === 'EA'
  const unitWord = isEA ? 'box' : 'foot'

  function patch(fields: Partial<Assembly>) {
    setAssembly((a) => (a ? { ...a, ...fields } : a))
    setSaved(false)
  }

  async function save() {
    if (!assembly) return
    setBusy(true)
    const { id: _id, created_at, updated_at, ...fields } = assembly as Assembly & { created_at?: string; updated_at?: string }
    const { error } = await supabase!.from('assemblies').update(fields).eq('id', assembly.id)
    setBusy(false)
    if (error) setError(error.message)
    else {
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    }
  }

  async function saveBomRow(row: AssemblyMaterial, fields: Partial<AssemblyMaterial>) {
    const { error } = await supabase!.from('assembly_materials').update(fields).eq('id', row.id)
    if (error) setError(error.message)
    void load()
  }

  async function addBomRow() {
    const first = materials[0]
    if (!first) return
    await supabase!.from('assembly_materials').insert({
      assembly_id: assembly!.id,
      material_id: first.id,
      label: first.name,
      qty: 1,
      waste_pct: 0,
    })
    void load()
  }

  async function removeBomRow(row: AssemblyMaterial) {
    await supabase!.from('assembly_materials').delete().eq('id', row.id)
    void load()
  }

  async function removeAssembly() {
    await supabase!.from('assemblies').update({ active: false }).eq('id', assembly!.id)
    navigate('/libraries/assemblies')
  }

  // rough material cost preview per unit (slots shown as "per job")
  const knownCost = bom.reduce((sum, r) => sum + (r.material?.cost != null ? Number(r.qty) * (1 + Number(r.waste_pct)) * Number(r.material.cost) : 0), 0)
  const hasSlots = bom.some((r) => r.slot)

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link to="/libraries/assemblies" className="text-sm text-slate-500 hover:text-slate-900">
          ← Assemblies
        </Link>
        <span className="rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">
          {assembly.category} · {assembly.pricing_unit}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {saved && <span className="text-xs font-medium text-emerald-600">Saved ✓</span>}
          {isAdmin && (
            <button
              onClick={() => void save()}
              disabled={busy}
              className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Save'}
            </button>
          )}
        </div>
      </div>

      <input
        value={assembly.name}
        onChange={(e) => patch({ name: e.target.value })}
        disabled={!isAdmin}
        className="w-full border-0 border-b-2 border-slate-300 bg-transparent px-0 py-1 text-2xl font-semibold tracking-tight focus:border-slate-900 focus:outline-none disabled:border-transparent"
      />
      <textarea
        rows={2}
        value={assembly.description ?? ''}
        onChange={(e) => patch({ description: e.target.value || null })}
        disabled={!isAdmin}
        placeholder="Description…"
        className="input mt-0"
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Field label={`Build minutes / ${unitWord}`}>
          <input
            type="number" step="any" min="0"
            value={Number(assembly.build_minutes)}
            onChange={(e) => patch({ build_minutes: Number(e.target.value) })}
            disabled={!isAdmin}
            className="input"
          />
        </Field>
        <Field label={`Install minutes / ${unitWord}`}>
          <input
            type="number" step="any" min="0"
            value={Number(assembly.install_minutes)}
            onChange={(e) => patch({ install_minutes: Number(e.target.value) })}
            disabled={!isAdmin}
            className="input"
          />
        </Field>
        {isEA && (
          <>
            <Field label={'Typical width along wall (in)'}>
              <input
                type="number" step="any" min="0"
                value={assembly.typical_width_in == null ? '' : Number(assembly.typical_width_in)}
                onChange={(e) => patch({ typical_width_in: e.target.value === '' ? null : Number(e.target.value), width_confirmed: false })}
                disabled={!isAdmin}
                className="input"
              />
            </Field>
            <Field label="Width status">
              <div className="mt-1">
                {assembly.width_confirmed ? (
                  <span className="inline-block rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
                    Confirmed ✓
                  </span>
                ) : isAdmin ? (
                  <button
                    onClick={() => patch({ width_confirmed: true })}
                    className="w-full rounded-md border border-amber-400 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100"
                    title="Mark this width (and the per-box quantities below) as reviewed"
                  >
                    Confirm width
                  </button>
                ) : (
                  <span className="inline-block rounded-md border border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    Unconfirmed
                  </span>
                )}
              </div>
            </Field>
          </>
        )}
      </div>

      {isEA && (
        <p className="text-xs text-slate-500">
          This is how much wall run one unit takes up — not a physical dimension. It only matters
          when a takeoff is entered in feet: a 12-ft run of{' '}
          {Number(assembly.typical_width_in ?? 24)}″ cabinets = {Math.round((12 / ((Number(assembly.typical_width_in) || 24) / 12)) * 10) / 10} boxes.
          Items counted per piece (end panels, benches) ignore it. Labor and the quantities below
          are per box.
        </p>
      )}

      <section>
        <div className="mb-2 flex items-center">
          <h2 className="font-mono text-[11px] uppercase tracking-widest text-slate-500">
            Bill of materials — per {unitWord}
          </h2>
          {isAdmin && (
            <button
              onClick={() => void addBomRow()}
              className="ml-auto rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
            >
              + Add row
            </button>
          )}
        </div>

        <div className="overflow-x-auto rounded-lg border-2 border-slate-800 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left font-mono text-[10px] uppercase tracking-wider text-slate-400">
                <th className="px-4 py-2 font-medium">Material / finish slot</th>
                <th className="px-2 py-2 font-medium text-right">Qty per {unitWord}</th>
                <th className="px-2 py-2 font-medium text-right">Waste %</th>
                <th className="px-2 py-2 font-medium text-right">Unit cost</th>
                <th className="px-2 py-2 font-medium text-right">Line cost</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {bom.map((row) => (
                <BomRow
                  key={row.id}
                  row={row}
                  materials={materials}
                  isAdmin={isAdmin}
                  onSave={(fields) => void saveBomRow(row, fields)}
                  onRemove={() => void removeBomRow(row)}
                />
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-800">
                <td colSpan={4} className="px-4 py-2 text-right font-mono text-[10px] uppercase tracking-wider text-slate-400">
                  Material cost per {unitWord} {hasSlots && '(+ finish slots priced per job)'}
                </td>
                <td className="px-2 py-2 text-right font-semibold tabular-nums">{fmtCost(knownCost)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="mt-1.5 text-xs text-slate-500">
          Slot rows (PLAM, SS, CABINET_LAM) don't have a fixed cost — each job assigns its actual
          finish to the slot and the price follows.
        </p>
      </section>

      {isAdmin && (
        <div className="border-t border-slate-200 pt-4">
          <button onClick={() => setConfirmDelete(true)} className="text-xs text-red-500 hover:text-red-700 hover:underline">
            Remove this assembly
          </button>
        </div>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Remove assembly"
          message={`Remove ${assembly.name} from the library? Past estimates keep their numbers; it just disappears from pick lists.`}
          confirmLabel="Remove"
          onConfirm={() => void removeAssembly()}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  )
}

function BomRow({
  row,
  materials,
  isAdmin,
  onSave,
  onRemove,
}: {
  row: AssemblyMaterial
  materials: Material[]
  isAdmin: boolean
  onSave: (fields: Partial<AssemblyMaterial>) => void
  onRemove: () => void
}) {
  const [qty, setQty] = useState(String(Number(row.qty)))
  const [waste, setWaste] = useState(String(Math.round(Number(row.waste_pct) * 10000) / 100))

  useEffect(() => {
    setQty(String(Number(row.qty)))
    setWaste(String(Math.round(Number(row.waste_pct) * 10000) / 100))
  }, [row.qty, row.waste_pct])

  const sourceValue = row.slot ? `slot:${row.slot}` : `mat:${row.material_id}`
  const unitCost = row.material?.cost ?? null
  const lineCost = unitCost != null ? Number(row.qty) * (1 + Number(row.waste_pct)) * unitCost : null

  function changeSource(v: string) {
    if (v.startsWith('slot:')) {
      const slot = v.slice(5)
      onSave({ material_id: null, slot, label: slot })
    } else {
      const id = v.slice(4)
      const m = materials.find((x) => x.id === id)
      onSave({ material_id: id, slot: null, label: m?.name ?? null })
    }
  }

  return (
    <tr className="border-t border-slate-100">
      <td className="px-4 py-1.5">
        {isAdmin ? (
          <select value={sourceValue} onChange={(e) => changeSource(e.target.value)} className="input mt-0 py-1.5">
            <optgroup label="Finish slots (assigned per job)">
              {SLOTS.map((s) => (
                <option key={s} value={`slot:${s}`}>
                  ◇ {s}
                </option>
              ))}
            </optgroup>
            <optgroup label="Materials">
              {materials.map((m) => (
                <option key={m.id} value={`mat:${m.id}`}>
                  {m.name}
                </option>
              ))}
            </optgroup>
          </select>
        ) : row.slot ? (
          <span className="font-mono text-xs">◇ {row.slot}</span>
        ) : (
          row.material?.name ?? row.label
        )}
      </td>
      <td className="px-2 py-1.5 text-right">
        <input
          type="number" step="any" min="0"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          onBlur={() => Number(qty) !== Number(row.qty) && onSave({ qty: Number(qty) })}
          disabled={!isAdmin}
          className="w-20 rounded-md border border-slate-200 px-1.5 py-1 text-right text-sm focus:border-slate-800 focus:outline-none disabled:border-transparent disabled:bg-transparent"
        />
      </td>
      <td className="px-2 py-1.5 text-right">
        <input
          type="number" step="any" min="0"
          value={waste}
          onChange={(e) => setWaste(e.target.value)}
          onBlur={() => Number(waste) / 100 !== Number(row.waste_pct) && onSave({ waste_pct: Number(waste) / 100 })}
          disabled={!isAdmin}
          className="w-16 rounded-md border border-slate-200 px-1.5 py-1 text-right text-sm focus:border-slate-800 focus:outline-none disabled:border-transparent disabled:bg-transparent"
        />
      </td>
      <td className="px-2 py-1.5 text-right text-xs text-slate-500 tabular-nums whitespace-nowrap">
        {row.slot ? 'per job' : fmtCost(unitCost)}
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{row.slot ? '—' : fmtCost(lineCost)}</td>
      <td className="px-3 py-1.5 text-right">
        {isAdmin && (
          <button onClick={onRemove} className="text-xs text-slate-300 hover:text-red-600">
            ×
          </button>
        )}
      </td>
    </tr>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="font-mono text-[11px] uppercase tracking-widest text-slate-500">{label}</span>
      {children}
    </label>
  )
}
