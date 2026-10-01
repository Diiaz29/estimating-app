import SaveFeedback from '../../components/SaveFeedback'
import { useSaveQueue } from '../../lib/useSaveQueue'
import { checkedWrite } from '../../lib/saveQueue'
import LibraryCategories from '../../components/LibraryCategories'
import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import type { Finish } from '../../lib/types'
import { fmtCost } from '../../lib/format'
import { GroupTitle, StaleBadge, confirmPrice } from '../../components/LibraryBits'
import ConfirmDialog from '../../components/ConfirmDialog'
import Modal from '../../components/Modal'
import { CostCell } from './Materials'

const FINISH_UNITS = ['SQ/FT', 'SHEET']
const SLOT_OPTIONS = ['', 'CABINET_LAM', 'PLAM 1', 'PLAM 2', 'PLAM 3', 'PLAM 4', 'SS 1', 'SS 2', 'SS 3', 'SS 4']

export default function Finishes() {
  const { isAdmin } = useAuth()
  const saves = useSaveQueue()
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)
  const [finishes, setFinishes] = useState<Finish[] | null>(null)
  const [staleDays, setStaleDays] = useState(90)
  const [error, setError] = useState<string | null>(null)
  const [formTarget, setFormTarget] = useState<Finish | 'new' | null>(null)
  const [dupTarget, setDupTarget] = useState<Finish | null>(null)
  const [removing, setRemoving] = useState<Finish | null>(null)

  async function load() {
    const [finRes, setRes] = await Promise.all([
      supabase!.from('finishes').select('*').eq('active', true).order('type').order('name'),
      supabase!.from('settings').select('value').eq('key', 'price_staleness_days').single(),
    ])
    if (finRes.error) setError(finRes.error.message)
    else setFinishes(finRes.data as Finish[])
    if (setRes.data) setStaleDays(Number(setRes.data.value))
  }

  useEffect(() => {
    void load()
  }, [])

  const grouped = useMemo(() => {
    const map = new Map<string, Finish[]>()
    for (const f of finishes ?? []) {
      if (!map.has(f.type)) map.set(f.type, [])
      map.get(f.type)!.push(f)
    }
    return [...map.entries()]
  }, [finishes])

  const selectedCategory = grouped.some(([category]) => category === categoryFilter) ? categoryFilter : null
  const visibleGroups = grouped.filter(([category]) => selectedCategory === null || category === selectedCategory)

  async function patch(f: Finish, fields: Partial<Finish>) {
    const changes = fields.cost !== undefined ? { ...fields, cost_updated_at: new Date().toISOString() } : fields
    if (fields.active !== false) setFinishes(previous => previous!.map(row => row.id === f.id ? { ...row, ...changes } : row))
    saves.queue.enqueue(`Finish ${f.name}`, async () => {
      await checkedWrite(supabase!.from('finishes').update(changes).eq('id', f.id).select('id').single())
      if (fields.active === false) setFinishes(previous => previous!.filter(row => row.id !== f.id))
    })
  }

  if (error && !finishes)
    return <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>
  if (!finishes) return <p className="text-sm text-slate-500">Loading…</p>

  return (
    <div className="zaid-page zaid-finishes">
      <SaveFeedback state={saves} retry={saves.queue.retry} explanation="" />
      {error && <p role="alert" className="save-feedback save-failed">{error}<button onClick={() => setError(null)}>Dismiss</button></p>}
      <div className="flex items-center">
        <p className="text-sm text-slate-500">
          Laminates and solid surfaces. Each job assigns these to its finish slots (PLAM 1–4, SS 1–4) —
          add your real colors here as you use them.
          {isAdmin && ' Click a price to change just the number, or "edit" for everything else.'}
        </p>
        {isAdmin && (
          <button
            onClick={() => setFormTarget('new')}
            className="ml-auto shrink-0 rounded-md bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-700"
          >
            + Add finish
          </button>
        )}
      </div>

      <div className="library-workspace">
        <LibraryCategories
          categories={grouped.map(([name, items]) => ({ name, count: items.length }))}
          selected={selectedCategory}
          onSelect={setCategoryFilter}
        />
        <div className="library-records">
      {visibleGroups.map(([type, items]) => (
        <section key={type} id={`library-${type}`}>
          <GroupTitle>{type}</GroupTitle>
          <div className="overflow-x-auto rounded-lg border-2 border-slate-800 bg-white">
            <table className="responsive-record-table w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left font-mono text-[10px] uppercase tracking-wider text-slate-400">
                  <th className="px-4 py-2 font-medium">Finish</th>
                  <th className="px-2 py-2 font-medium">Brand</th>
                  <th className="px-2 py-2 font-medium">Color / code</th>
                  <th className="px-2 py-2 font-medium">Unit</th>
                  <th className="px-2 py-2 font-medium text-right">Cost</th>
                  <th className="px-2 py-2 font-medium">Default slot</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((f) => (
                  <tr key={f.id} className="border-t border-slate-100 first:border-t-0">
                    <td data-label="Finish" className="px-4 py-2">{f.name}</td>
                    <td data-label="Brand" className="px-2 py-2 text-xs text-slate-500">{f.brand ?? '—'}</td>
                    <td data-label="Color / code" className="px-2 py-2 text-xs text-slate-500">{f.color_code ?? '—'}</td>
                    <td data-label="Unit" className="px-2 py-2 text-xs text-slate-500 whitespace-nowrap">{f.unit}</td>
                    <td data-label="Cost" className="px-2 py-2 text-right tabular-nums">
                      {isAdmin ? <CostCell label={`Cost for ${f.name}`} value={f.cost} onSave={(v) => void patch(f, { cost: v })} /> : fmtCost(f.cost)}
                    </td>
                    <td data-label="Default slot" className="px-2 py-2">
                      {f.default_slot && (
                        <span className="rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-slate-500">
                          {f.default_slot}
                        </span>
                      )}
                    </td>
                    <td data-label="Actions" className="px-4 py-2 text-right whitespace-nowrap">
                      <div className="library-row-actions"><span className="library-price-status">
                      <StaleBadge
                        costUpdatedAt={f.cost_updated_at}
                        thresholdDays={staleDays}
                        onConfirm={isAdmin && !saves.pending ? () => void confirmPrice('finishes', f.id).then((e) => { if (e) setError(e); void load() }) : undefined}
                      />
                      </span><span className="library-record-actions">
                      {isAdmin && (
                        <>
                          <button onClick={() => setFormTarget(f)} className="ml-3 text-xs text-slate-400 hover:text-slate-900">
                            edit
                          </button>
                          <button
                            onClick={() => setDupTarget(f)}
                            title="Start a new entry prefilled from this one"
                            className="ml-2 text-xs text-slate-400 hover:text-slate-900"
                          >
                            copy
                          </button>
                          <button onClick={() => setRemoving(f)} className="ml-2 text-xs text-slate-300 hover:text-red-600">
                            remove
                          </button>
                        </>
                      )}
                      </span></div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      </div></div>

      {dupTarget && (
        <FinishForm
          finish={dupTarget}
          duplicate
          onClose={() => setDupTarget(null)}
          onSaved={() => {
            setDupTarget(null)
            void load()
          }}
        />
      )}
      {formTarget && (
        <FinishForm
          finish={formTarget === 'new' ? null : formTarget}
          onClose={() => setFormTarget(null)}
          onSaved={() => {
            setFormTarget(null)
            void load()
          }}
        />
      )}
      {removing && (
        <ConfirmDialog
          title="Remove finish"
          message={`Remove ${removing.name} from the library?`}
          confirmLabel="Remove"
          onConfirm={() => {
            void patch(removing, { active: false })
            setRemoving(null)
          }}
          onCancel={() => setRemoving(null)}
        />
      )}
    </div>
  )
}

function FinishForm({
  finish, duplicate = false, onClose, onSaved,
}: {
  finish: Finish | null
  duplicate?: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [type, setType] = useState(finish?.type ?? 'Laminate')
  const [name, setName] = useState(duplicate && finish ? `${finish.name} COPY` : finish?.name ?? '')
  const [brand, setBrand] = useState(finish?.brand ?? '')
  const [colorCode, setColorCode] = useState(finish?.color_code ?? '')
  const [unit, setUnit] = useState(finish?.unit ?? 'SQ/FT')
  const [cost, setCost] = useState(finish?.cost == null ? '' : String(finish.cost))
  const [slot, setSlot] = useState(finish?.default_slot ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    const fields = {
      type,
      name: name.trim(),
      brand: brand.trim().toUpperCase() || null,
      color_code: colorCode.trim() || null,
      unit,
      cost: cost === '' ? null : Number(cost),
      default_slot: slot || null,
    }
    const { error } = finish && !duplicate
      ? await supabase!.from('finishes').update(fields).eq('id', finish.id)
      : await supabase!.from('finishes').insert(fields)
    if (error) {
      setError(error.message.includes('duplicate') ? 'A finish with that name already exists.' : error.message)
      setBusy(false)
    } else onSaved()
  }

  return (
    <Modal title={duplicate ? 'Duplicate finish' : finish ? 'Edit finish' : 'Add finish'} onClose={onClose}>
        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="font-mono text-[11px] uppercase tracking-widest text-slate-500">Type</span>
              <select value={type} onChange={(e) => setType(e.target.value)} className="input">
                <option>Laminate</option>
                <option>Solid surface</option>
              </select>
            </label>
            <label className="block">
              <span className="font-mono text-[11px] uppercase tracking-widest text-slate-500">Name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus className="input" placeholder="Designer White D354" />
            </label>
            <label className="block">
              <span className="font-mono text-[11px] uppercase tracking-widest text-slate-500">Brand</span>
              <input value={brand} onChange={(e) => setBrand(e.target.value)} className="input" placeholder="WILSONART" />
            </label>
            <label className="block">
              <span className="font-mono text-[11px] uppercase tracking-widest text-slate-500">Mfr color code</span>
              <input value={colorCode} onChange={(e) => setColorCode(e.target.value)} className="input" placeholder="D354-60" />
            </label>
            <label className="block">
              <span className="font-mono text-[11px] uppercase tracking-widest text-slate-500">Unit</span>
              <select value={unit} onChange={(e) => setUnit(e.target.value)} className="input">
                {FINISH_UNITS.map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="font-mono text-[11px] uppercase tracking-widest text-slate-500">Cost ($)</span>
              <input type="number" step="any" min="0" value={cost} onChange={(e) => setCost(e.target.value)} className="input" />
            </label>
            <label className="block col-span-2">
              <span className="font-mono text-[11px] uppercase tracking-widest text-slate-500">Default slot (optional)</span>
              <select value={slot} onChange={(e) => setSlot(e.target.value)} className="input">
                {SLOT_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s === '' ? '— none —' : s}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {error && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">
              Cancel
            </button>
            <button type="submit" disabled={busy} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50">
              {busy ? 'Saving…' : finish && !duplicate ? 'Save changes' : 'Add'}
            </button>
          </div>
        </form>
    </Modal>
  )
}
