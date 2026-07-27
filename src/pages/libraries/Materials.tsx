import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import type { Material } from '../../lib/types'
import { fmtCost } from '../../lib/format'
import { GroupTitle, StaleBadge } from '../../components/LibraryBits'
import ConfirmDialog from '../../components/ConfirmDialog'

export const MATERIAL_UNITS = ['EACH', 'SHEET', 'SQ/FT', 'LF', 'GALLON']
const GENERAL_CATEGORIES = ['WOOD PANEL', 'QUARTZ', 'CONSUMABLES']
const HARDWARE_CATEGORIES = ['HARDWARE', 'EQUIPMENT']

export default function Materials({ mode = 'general' }: { mode?: 'general' | 'hardware' }) {
  const { isAdmin } = useAuth()
  const [materials, setMaterials] = useState<Material[] | null>(null)
  const [staleDays, setStaleDays] = useState(90)
  const [error, setError] = useState<string | null>(null)
  const [formTarget, setFormTarget] = useState<Material | 'new' | null>(null)
  const [dupTarget, setDupTarget] = useState<Material | null>(null)
  const [removing, setRemoving] = useState<Material | null>(null)

  async function load() {
    const [matRes, setRes] = await Promise.all([
      supabase!.from('materials').select('*').eq('active', true).order('category').order('name'),
      supabase!.from('settings').select('value').eq('key', 'price_staleness_days').single(),
    ])
    if (matRes.error) setError(matRes.error.message)
    else setMaterials(matRes.data as Material[])
    if (setRes.data) setStaleDays(Number(setRes.data.value))
  }

  useEffect(() => {
    void load()
  }, [])

  const grouped = useMemo(() => {
    const map = new Map<string, Material[]>()
    for (const m of materials ?? []) {
      const isHardware = HARDWARE_CATEGORIES.includes(m.category)
      if (mode === 'hardware' ? !isHardware : isHardware) continue
      if (!map.has(m.category)) map.set(m.category, [])
      map.get(m.category)!.push(m)
    }
    return [...map.entries()]
  }, [materials, mode])

  async function saveCost(m: Material, cost: number | null) {
    const { error } = await supabase!.from('materials').update({ cost }).eq('id', m.id)
    if (error) setError(error.message)
    void load()
  }

  async function remove(m: Material) {
    setRemoving(null)
    const { error } = await supabase!.from('materials').update({ active: false }).eq('id', m.id)
    if (error) setError(error.message)
    void load()
  }

  if (error)
    return <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>
  if (!materials) return <p className="text-sm text-slate-500">Loading…</p>

  return (
    <div>
      <div className="flex items-center">
        <p className="text-sm text-slate-500">
          {mode === 'hardware'
            ? 'Pulls, hinges, slides, and the rest. Each job picks its hardware from this list.'
            : 'Raw material prices. Every cabinet price is built from these — keep them current.'}
          {isAdmin && ' Click a price to change just the number, or "edit" for everything else.'}
        </p>
        {isAdmin && (
          <button
            onClick={() => setFormTarget('new')}
            className="ml-auto shrink-0 rounded-md bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-700"
          >
            {mode === 'hardware' ? '+ Add hardware' : '+ Add material'}
          </button>
        )}
      </div>

      {grouped.map(([category, items]) => (
        <section key={category}>
          <GroupTitle>{category}</GroupTitle>
          <div className="overflow-x-auto rounded-lg border-2 border-slate-800 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left font-mono text-[10px] uppercase tracking-wider text-slate-400">
                  <th className="px-4 py-2 font-medium">Material</th>
                  <th className="px-2 py-2 font-medium">Unit</th>
                  <th className="px-2 py-2 font-medium text-right">Cost</th>
                  <th className="px-2 py-2 font-medium">Supplier</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((m) => (
                  <tr key={m.id} className="border-t border-slate-100 first:border-t-0">
                    <td className="px-4 py-2">
                      {m.name}
                      {m.notes && <div className="text-xs text-slate-400">{m.notes}</div>}
                    </td>
                    <td className="px-2 py-2 text-xs text-slate-500 whitespace-nowrap">{m.unit}</td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {isAdmin ? <CostCell value={m.cost} onSave={(v) => void saveCost(m, v)} /> : fmtCost(m.cost)}
                    </td>
                    <td className="px-2 py-2 text-xs text-slate-500">{m.supplier ?? '—'}</td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      <StaleBadge costUpdatedAt={m.cost_updated_at} thresholdDays={staleDays} />
                      {isAdmin && (
                        <>
                          <button onClick={() => setFormTarget(m)} className="ml-3 text-xs text-slate-400 hover:text-slate-900">
                            edit
                          </button>
                          <button
                            onClick={() => setDupTarget(m)}
                            title="Start a new entry prefilled from this one"
                            className="ml-2 text-xs text-slate-400 hover:text-slate-900"
                          >
                            copy
                          </button>
                          <button onClick={() => setRemoving(m)} className="ml-2 text-xs text-slate-300 hover:text-red-600">
                            remove
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      {dupTarget && (
        <MaterialForm
          material={dupTarget}
          duplicate
          categories={
            mode === 'hardware'
              ? HARDWARE_CATEGORIES
              : [...new Set([...GENERAL_CATEGORIES, ...materials.map((m) => m.category)])].filter(
                  (c) => !HARDWARE_CATEGORIES.includes(c),
                )
          }
          onClose={() => setDupTarget(null)}
          onSaved={() => {
            setDupTarget(null)
            void load()
          }}
        />
      )}
      {formTarget && (
        <MaterialForm
          material={formTarget === 'new' ? null : formTarget}
          categories={
            mode === 'hardware'
              ? HARDWARE_CATEGORIES
              : [...new Set([...GENERAL_CATEGORIES, ...materials.map((m) => m.category)])].filter(
                  (c) => !HARDWARE_CATEGORIES.includes(c),
                )
          }
          onClose={() => setFormTarget(null)}
          onSaved={() => {
            setFormTarget(null)
            void load()
          }}
        />
      )}
      {removing && (
        <ConfirmDialog
          title="Remove material"
          message={`Remove ${removing.name} from the library? Assemblies that reference it keep their history, but it disappears from lists.`}
          confirmLabel="Remove"
          onConfirm={() => void remove(removing)}
          onCancel={() => setRemoving(null)}
        />
      )}
    </div>
  )
}

/** Click-to-edit cost cell; Enter or click away saves. */
export function CostCell({ value, onSave }: { value: number | null; onSave: (v: number | null) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  if (!editing) {
    return (
      <button
        onClick={() => {
          setDraft(value == null ? '' : String(value))
          setEditing(true)
        }}
        className={`group rounded px-1.5 py-0.5 tabular-nums underline decoration-dotted decoration-slate-300 underline-offset-4 hover:bg-amber-50 hover:decoration-amber-500 ${
          value == null ? 'text-red-500 font-medium' : ''
        }`}
        title="Click to edit price"
      >
        {value == null ? 'no cost!' : fmtCost(value)}
        <span className="ml-1 text-slate-300 group-hover:text-amber-600">✎</span>
      </button>
    )
  }
  return (
    <input
      autoFocus
      type="number"
      step="any"
      min="0"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setEditing(false)
        const v = draft === '' ? null : Number(draft)
        if (v !== value) onSave(v)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') setEditing(false)
      }}
      className="w-24 rounded-md border border-slate-400 px-1.5 py-0.5 text-right text-sm focus:border-slate-800 focus:outline-none"
    />
  )
}

function MaterialForm({
  material,
  categories,
  duplicate = false,
  onClose,
  onSaved,
}: {
  material: Material | null
  categories: string[]
  duplicate?: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(duplicate && material ? `${material.name} COPY` : material?.name ?? '')
  const [category, setCategory] = useState(material?.category ?? categories[0] ?? 'WOOD PANEL')
  const [unit, setUnit] = useState(material?.unit ?? 'EACH')
  const [cost, setCost] = useState(material?.cost == null ? '' : String(material.cost))
  const [supplier, setSupplier] = useState(material?.supplier ?? '')
  const [notes, setNotes] = useState(material?.notes ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const unitOptions = MATERIAL_UNITS.includes(unit) ? MATERIAL_UNITS : [unit, ...MATERIAL_UNITS]

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    const fields = {
      name: name.trim().toUpperCase(),
      category,
      unit,
      cost: cost === '' ? null : Number(cost),
      supplier: supplier.trim().toUpperCase() || null,
      notes: notes.trim() || null,
    }
    const { error } = material && !duplicate
      ? await supabase!.from('materials').update(fields).eq('id', material.id)
      : await supabase!.from('materials').insert(fields)
    if (error) {
      setError(error.message.includes('duplicate') ? 'A material with that name already exists.' : error.message)
      setBusy(false)
    } else onSaved()
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end sm:items-center justify-center bg-slate-900/40 p-0 sm:p-6">
      <div className="w-full max-w-lg rounded-t-xl sm:rounded-xl border-2 border-slate-800 bg-white max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b-2 border-slate-800 px-5 py-3">
          <h2 className="font-semibold">{duplicate ? 'Duplicate material' : material ? 'Edit material' : 'Add material'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          <label className="block">
            <span className="font-mono text-[11px] uppercase tracking-widest text-slate-500">Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus className="input" placeholder={`3/4" WHITE MELAMINE (4'X8')`} />
          </label>
          <div className="grid grid-cols-3 gap-3">
            <label className="block">
              <span className="font-mono text-[11px] uppercase tracking-widest text-slate-500">Category</span>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="input">
                {categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="font-mono text-[11px] uppercase tracking-widest text-slate-500">Unit</span>
              <select value={unit} onChange={(e) => setUnit(e.target.value)} className="input">
                {unitOptions.map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="font-mono text-[11px] uppercase tracking-widest text-slate-500">Cost ($)</span>
              <input type="number" step="any" min="0" value={cost} onChange={(e) => setCost(e.target.value)} className="input" />
            </label>
          </div>
          <label className="block">
            <span className="font-mono text-[11px] uppercase tracking-widest text-slate-500">Supplier</span>
            <input value={supplier} onChange={(e) => setSupplier(e.target.value)} className="input" />
          </label>
          <label className="block">
            <span className="font-mono text-[11px] uppercase tracking-widest text-slate-500">Notes</span>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} className="input" placeholder="Sold 100/pack · price varies by grade…" />
          </label>
          {error && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">
              Cancel
            </button>
            <button type="submit" disabled={busy} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50">
              {busy ? 'Saving…' : material && !duplicate ? 'Save changes' : 'Add'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
