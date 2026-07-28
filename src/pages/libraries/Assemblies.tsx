import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import type { Assembly } from '../../lib/types'
import { GroupTitle } from '../../components/LibraryBits'

export default function Assemblies() {
  const { isAdmin } = useAuth()
  const [assemblies, setAssemblies] = useState<Assembly[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  async function load() {
    const { data, error } = await supabase!
      .from('assemblies')
      .select('*')
      .eq('active', true)
      .order('sort_order')
      .order('name')
    if (error) setError(error.message)
    else setAssemblies(data as Assembly[])
  }

  useEffect(() => {
    void load()
  }, [])

  // copy the assembly AND its bill of materials
  async function duplicate(a: Assembly) {
    // removed items are only hidden, so their names are still taken — number past them
    const { data: nameRows } = await supabase!
      .from('assemblies')
      .select('name')
      .ilike('name', `${a.name} COPY%`)
    const taken = new Set((nameRows ?? []).map((r) => r.name))
    let copyName = `${a.name} COPY`
    for (let n = 2; taken.has(copyName); n++) copyName = `${a.name} COPY ${n}`

    const { data, error } = await supabase!
      .from('assemblies')
      .insert({
        category: a.category,
        name: copyName,
        description: a.description,
        pricing_unit: a.pricing_unit,
        build_minutes: a.build_minutes,
        install_minutes: a.install_minutes,
        typical_width_in: a.typical_width_in,
        width_confirmed: a.width_confirmed,
        sort_order: a.sort_order,
      })
      .select('id')
      .single()
    if (error) {
      setError(error.message)
      return
    }
    const { data: bomRows } = await supabase!
      .from('assembly_materials')
      .select('material_id, slot, label, qty, waste_pct')
      .eq('assembly_id', a.id)
    if (bomRows && bomRows.length > 0) {
      await supabase!.from('assembly_materials').insert(bomRows.map((r) => ({ ...r, assembly_id: data.id })))
    }
    void load()
  }

  const grouped = useMemo(() => {
    const map = new Map<string, Assembly[]>()
    for (const a of assemblies ?? []) {
      if (!map.has(a.category)) map.set(a.category, [])
      map.get(a.category)!.push(a)
    }
    return [...map.entries()]
  }, [assemblies])

  if (error)
    return <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>
  if (!assemblies) return <p className="text-sm text-slate-500">Loading…</p>

  const unconfirmed = assemblies.filter((a) => a.pricing_unit === 'EA' && !a.width_confirmed).length

  return (
    <div>
      <div className="flex items-center gap-3">
        <p className="text-sm text-slate-500">
          Cabinet types with their labor minutes and bill of materials. Priced per box (EA) or per
          foot (LF).
        </p>
        {isAdmin && (
          <button
            onClick={() => setAdding(true)}
            className="ml-auto shrink-0 rounded-md bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-700"
          >
            + Add assembly
          </button>
        )}
      </div>

      {unconfirmed > 0 && (
        <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          <span className="font-semibold">{unconfirmed} cabinet types</span> have proposed typical
          widths that came from the spreadsheet conversion — open each one, check the width and the
          per-box quantities, and hit <span className="font-semibold">Confirm width</span>.
        </p>
      )}

      {grouped.map(([category, items]) => (
        <section key={category}>
          <GroupTitle>{category}</GroupTitle>
          <div className="overflow-hidden rounded-lg border-2 border-slate-800 bg-white">
            {items.map((a, i) => (
              <Link
                key={a.id}
                to={`/libraries/assemblies/${a.id}`}
                className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-slate-50 ${i > 0 ? 'border-t border-slate-200' : ''}`}
              >
                <span className="rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">
                  {a.pricing_unit}
                </span>
                <span className="min-w-0 flex-1 basis-40 truncate text-sm font-medium">{a.name}</span>
                <span className="text-xs text-slate-500 tabular-nums whitespace-nowrap">
                  {Number(a.build_minutes)} min build · {Number(a.install_minutes)} min install
                </span>
                {a.pricing_unit === 'EA' && (
                  <span
                    className={`whitespace-nowrap rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${
                      a.width_confirmed
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                        : 'border-amber-400 bg-amber-50 text-amber-800'
                    }`}
                  >
                    {a.typical_width_in ? `${Number(a.typical_width_in)}"` : '?'} {a.width_confirmed ? '✓' : 'unconfirmed'}
                  </span>
                )}
                {isAdmin && (
                  <button
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      void duplicate(a)
                    }}
                    title="Duplicate this assembly with its bill of materials"
                    className="text-slate-300 hover:text-slate-900"
                  >
                    ⧉
                  </button>
                )}
              </Link>
            ))}
          </div>
        </section>
      ))}

      {adding && (
        <AddAssemblyForm
          categories={[...new Set(assemblies.map((a) => a.category))]}
          onClose={() => setAdding(false)}
          onCreated={() => {
            setAdding(false)
            void load()
          }}
        />
      )}
    </div>
  )
}

function AddAssemblyForm({
  categories,
  onClose,
  onCreated,
}: {
  categories: string[]
  onClose: () => void
  onCreated: () => void
}) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState(categories[0] ?? 'Base Cabinets')
  const [pricingUnit, setPricingUnit] = useState<'EA' | 'LF' | 'SF'>('EA')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    const { error } = await supabase!.from('assemblies').insert({
      name: name.trim(),
      category,
      pricing_unit: pricingUnit,
      sort_order: 999,
    })
    if (error) {
      setError(error.message.includes('duplicate') ? 'That assembly already exists in this category.' : error.message)
      setBusy(false)
    } else onCreated()
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end sm:items-center justify-center bg-slate-900/40 p-0 sm:p-6">
      <div className="w-full max-w-md rounded-t-xl sm:rounded-xl border-2 border-slate-800 bg-white">
        <div className="flex items-center justify-between border-b-2 border-slate-800 px-5 py-3">
          <h2 className="font-semibold">Add assembly</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          <label className="block">
            <span className="font-mono text-[11px] uppercase tracking-widest text-slate-500">Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus className="input" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="font-mono text-[11px] uppercase tracking-widest text-slate-500">Category</span>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="input">
                {categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <div>
              <span className="font-mono text-[11px] uppercase tracking-widest text-slate-500">Priced per</span>
              <div className="mt-1 flex gap-1.5">
                {(['EA', 'LF', 'SF'] as const).map((u) => (
                  <button
                    type="button"
                    key={u}
                    onClick={() => setPricingUnit(u)}
                    className={`flex-1 rounded-md border px-2 py-2 text-xs font-medium ${
                      pricingUnit === u
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-300 bg-white text-slate-600 hover:border-slate-500'
                    }`}
                  >
                    {u === 'EA' ? 'Box (EA)' : u === 'LF' ? 'Foot (LF)' : 'Sq ft (SF)'}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <p className="text-xs text-slate-500">Labor minutes, width, and the bill of materials are set on the next screen.</p>
          {error && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">
              Cancel
            </button>
            <button type="submit" disabled={busy} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50">
              {busy ? 'Adding…' : 'Add'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
