import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { OverheadItem, Setting } from '../lib/types'
import { fmtMoney } from '../lib/format'
import ConfirmDialog from '../components/ConfirmDialog'

export default function Overhead() {
  const { isAdmin } = useAuth()
  const [items, setItems] = useState<OverheadItem[] | null>(null)
  const [settings, setSettings] = useState<Record<string, number>>({})
  const [error, setError] = useState<string | null>(null)
  const [removing, setRemoving] = useState<OverheadItem | null>(null)
  const [applied, setApplied] = useState(false)

  async function load() {
    const [itemRes, setRes] = await Promise.all([
      supabase!.from('overhead_items').select('*').order('sort_order').order('created_at'),
      supabase!.from('settings').select('*'),
    ])
    if (itemRes.error) setError(itemRes.error.message)
    else setItems(itemRes.data as OverheadItem[])
    if (setRes.data) {
      setSettings(Object.fromEntries((setRes.data as Setting[]).map((s) => [s.key, Number(s.value)])))
    }
  }

  useEffect(() => {
    void load()
  }, [])

  if (!isAdmin) {
    return (
      <p className="rounded-lg border-2 border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
        Admins only — this page holds salaries.
      </p>
    )
  }
  if (error)
    return <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>
  if (!items) return <p className="text-sm text-slate-500">Loading…</p>

  const annualTotal = items.reduce(
    (sum, i) => sum + Number(i.amount) * (i.period === 'monthly' ? 12 : 1),
    0,
  )
  const heads = settings.overhead_heads ?? 4
  const paidHours = settings.overhead_paid_hours ?? 2080
  const utilization = settings.overhead_utilization ?? 0.7
  const billableHours = heads * paidHours * utilization
  const rate = billableHours > 0 ? annualTotal / billableHours : 0
  const currentRate = settings.cost_shop_rate ?? 0

  async function addItem() {
    const { data, error } = await supabase!
      .from('overhead_items')
      .insert({ name: '', amount: 0, period: 'monthly', sort_order: items!.length })
      .select('*')
      .single()
    if (error) setError(error.message)
    else setItems((prev) => [...(prev ?? []), data as OverheadItem])
  }

  async function patchItem(item: OverheadItem, fields: Partial<OverheadItem>) {
    setItems((prev) => prev!.map((i) => (i.id === item.id ? { ...i, ...fields } : i)))
    const { error } = await supabase!.from('overhead_items').update(fields).eq('id', item.id)
    if (error) setError(error.message)
  }

  async function removeItem(item: OverheadItem) {
    setRemoving(null)
    setItems((prev) => prev!.filter((i) => i.id !== item.id))
    await supabase!.from('overhead_items').delete().eq('id', item.id)
  }

  async function patchSetting(key: string, value: number) {
    setSettings((prev) => ({ ...prev, [key]: value }))
    const { error } = await supabase!.from('settings').update({ value }).eq('key', key)
    if (error) setError(error.message)
  }

  async function applyRate() {
    const rounded = Math.round(rate * 100) / 100
    await patchSetting('cost_shop_rate', rounded)
    setApplied(true)
    setTimeout(() => setApplied(false), 3000)
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <Link to="/settings" className="text-sm text-slate-500 hover:text-slate-900">
            ← Settings
          </Link>
        </div>
        <h1 className="mt-2 text-lg font-semibold tracking-tight">Overhead → true cost rate</h1>
        <p className="mt-1 text-sm text-slate-500">
          List what the company really pays for a year. The app turns it into an honest cost rate
          per shop hour.
        </p>
      </div>

      {/* Step 1: cost list */}
      <section>
        <div className="mb-2 flex items-center">
          <h2 className="font-mono text-[11px] uppercase tracking-widest text-slate-500">
            1 · What the company pays
          </h2>
          <button
            onClick={() => void addItem()}
            className="ml-auto rounded-md bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-700"
          >
            + Add cost
          </button>
        </div>
        {items.length === 0 ? (
          <p className="rounded-lg border-2 border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">
            Add each real cost: salaries (yours too), rent, insurance, trucks, fuel, utilities,
            software, phones…
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border-2 border-slate-800 bg-white">
            {items.map((item, idx) => (
              <ItemRow
                key={item.id}
                item={item}
                first={idx === 0}
                onPatch={(f) => void patchItem(item, f)}
                onRemove={() => setRemoving(item)}
              />
            ))}
            <div className="flex items-center justify-between border-t-2 border-slate-800 bg-slate-50 px-4 py-2.5">
              <span className="font-mono text-[11px] uppercase tracking-widest text-slate-500">
                Total per year
              </span>
              <span className="text-lg font-semibold tabular-nums">{fmtMoney(annualTotal)}</span>
            </div>
          </div>
        )}
      </section>

      {/* Step 2: billable hours */}
      <section>
        <h2 className="mb-2 font-mono text-[11px] uppercase tracking-widest text-slate-500">
          2 · Hours that actually land on jobs
        </h2>
        <div className="rounded-lg border-2 border-slate-800 bg-white p-4">
          <div className="grid grid-cols-3 gap-3">
            <NumberField
              label="Crew on jobs"
              value={heads}
              onChange={(v) => void patchSetting('overhead_heads', v)}
            />
            <NumberField
              label="Paid hrs / person / yr"
              value={paidHours}
              onChange={(v) => void patchSetting('overhead_paid_hours', v)}
            />
            <NumberField
              label="% of hours on jobs"
              value={Math.round(utilization * 100)}
              onChange={(v) => void patchSetting('overhead_utilization', v / 100)}
            />
          </div>
          <p className="mt-3 text-sm text-slate-500">
            Nobody is on jobs 100% of the time — cleanup, deliveries, slow weeks. 70% is a good
            starting guess.
          </p>
          <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2.5">
            <span className="font-mono text-[11px] uppercase tracking-widest text-slate-500">
              Billable hours per year
            </span>
            <span className="text-lg font-semibold tabular-nums">
              {Math.round(billableHours).toLocaleString()}
            </span>
          </div>
        </div>
      </section>

      {/* Step 3: the rate */}
      <section>
        <h2 className="mb-2 font-mono text-[11px] uppercase tracking-widest text-slate-500">
          3 · Your true cost per shop hour
        </h2>
        <div className="rounded-lg border-2 border-slate-800 bg-white p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <div className="text-3xl font-semibold tabular-nums">
                {annualTotal > 0 ? fmtMoney(rate) : '—'}
                <span className="text-sm font-normal text-slate-400"> /hr</span>
              </div>
              <div className="mt-0.5 text-xs text-slate-500">
                {fmtMoney(annualTotal)} ÷ {Math.round(billableHours).toLocaleString()} hrs
              </div>
            </div>
            <div className="ml-auto text-right">
              <div className="text-xs text-slate-500">
                Settings currently uses <span className="font-semibold">{fmtMoney(currentRate)}/hr</span>
              </div>
              {applied ? (
                <span className="mt-1 inline-block text-sm font-medium text-emerald-600">
                  Updated ✓ — every new estimate now uses it
                </span>
              ) : (
                <button
                  onClick={() => void applyRate()}
                  disabled={annualTotal <= 0}
                  className="mt-1 rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-40"
                >
                  Use {annualTotal > 0 ? fmtMoney(rate) : 'this'} as the shop cost rate
                </button>
              )}
            </div>
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          This changes the cost side (true cost, profit, margin) only. Customer prices don't move.
        </p>
      </section>

      {removing && (
        <ConfirmDialog
          title="Remove cost"
          message={`Remove ${removing.name || 'this cost'} from the list?`}
          confirmLabel="Remove"
          onConfirm={() => void removeItem(removing)}
          onCancel={() => setRemoving(null)}
        />
      )}
    </div>
  )
}

function ItemRow({
  item,
  first,
  onPatch,
  onRemove,
}: {
  item: OverheadItem
  first: boolean
  onPatch: (fields: Partial<OverheadItem>) => void
  onRemove: () => void
}) {
  const [name, setName] = useState(item.name)
  const [amount, setAmount] = useState(item.amount === 0 ? '' : String(Number(item.amount)))

  return (
    <div className={`flex flex-wrap items-center gap-2 px-4 py-2 ${first ? '' : 'border-t border-slate-100'}`}>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => name !== item.name && onPatch({ name })}
        placeholder="Rent / Brandon salary / Trucks…"
        autoFocus={item.name === ''}
        className="min-w-0 flex-1 basis-48 rounded border border-slate-200 px-2 py-1.5 text-sm focus:border-slate-800 focus:outline-none"
      />
      <div className="flex items-center gap-1">
        <span className="text-xs text-slate-400">$</span>
        <input
          type="number"
          step="any"
          min="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onBlur={() => Number(amount || 0) !== Number(item.amount) && onPatch({ amount: Number(amount || 0) })}
          className="w-28 rounded border border-slate-200 px-2 py-1.5 text-right text-sm tabular-nums focus:border-slate-800 focus:outline-none"
        />
      </div>
      <div className="flex gap-1">
        {(['monthly', 'yearly'] as const).map((p) => (
          <button
            key={p}
            onClick={() => onPatch({ period: p })}
            className={`rounded-md border px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider ${
              item.period === p
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-300 bg-white text-slate-500 hover:border-slate-500'
            }`}
          >
            {p === 'monthly' ? '/mo' : '/yr'}
          </button>
        ))}
      </div>
      <span className="w-24 text-right text-xs text-slate-500 tabular-nums">
        {fmtMoney(Number(item.amount) * (item.period === 'monthly' ? 12 : 1))}/yr
      </span>
      <button onClick={onRemove} className="text-slate-300 hover:text-red-600">×</button>
    </div>
  )
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => setDraft(String(value)), [value])
  return (
    <label className="block">
      <span className="font-mono text-[11px] uppercase tracking-widest text-slate-500">{label}</span>
      <input
        type="number"
        step="any"
        min="0"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const v = Number(draft)
          if (!Number.isNaN(v) && v !== value) onChange(v)
        }}
        className="input"
      />
    </label>
  )
}
