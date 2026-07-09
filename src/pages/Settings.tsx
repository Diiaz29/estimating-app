import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { Setting } from '../lib/types'
import { settingFromDisplay, settingSuffix, settingToDisplay } from '../lib/format'

const GROUP_ORDER = ['Markups', 'Labor', 'Delivery', 'Travel', 'Job adders', 'Company', 'Tax', 'App']

export default function Settings() {
  const { isAdmin } = useAuth()
  const [settings, setSettings] = useState<Setting[] | null>(null)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)

  async function load() {
    const { data, error } = await supabase!.from('settings').select('*').order('sort_order')
    if (error) setError(error.message)
    else {
      const rows = data as Setting[]
      setSettings(rows)
      setDrafts(Object.fromEntries(rows.map((s) => [s.key, String(settingToDisplay(Number(s.value), s.format))])))
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const grouped = useMemo(() => {
    const map = new Map<string, Setting[]>()
    for (const s of settings ?? []) {
      if (s.group_name === 'Overhead') continue // lives on the Overhead page
      if (!map.has(s.group_name)) map.set(s.group_name, [])
      map.get(s.group_name)!.push(s)
    }
    return [...map.entries()].sort(
      (a, b) => (GROUP_ORDER.indexOf(a[0]) + 100) % 108 - (GROUP_ORDER.indexOf(b[0]) + 100) % 108,
    )
  }, [settings])

  if (!isAdmin) {
    return (
      <p className="rounded-lg border-2 border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
        Admins only. These numbers steer every price in the shop — ask Brandon.
      </p>
    )
  }
  if (error)
    return <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>
  if (!settings) return <p className="text-sm text-slate-500">Loading…</p>

  const changed = settings.filter(
    (s) => drafts[s.key] !== undefined && Number(drafts[s.key]) !== settingToDisplay(Number(s.value), s.format),
  )

  async function saveAll() {
    setBusy(true)
    setError(null)
    for (const s of changed) {
      const value = settingFromDisplay(Number(drafts[s.key]), s.format)
      const { error } = await supabase!.from('settings').update({ value }).eq('key', s.key)
      if (error) {
        setError(error.message)
        setBusy(false)
        return
      }
    }
    setBusy(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
    void load()
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Settings</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Every rate, markup, and threshold the pricing engine uses. Nothing is hardcoded — change
            it here, and every future estimate follows.
          </p>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {saved && <span className="text-xs font-medium text-emerald-600">Saved ✓</span>}
          <button
            onClick={() => void saveAll()}
            disabled={busy || changed.length === 0}
            className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-40"
          >
            {busy ? 'Saving…' : changed.length > 0 ? `Save ${changed.length} change${changed.length > 1 ? 's' : ''}` : 'Save'}
          </button>
        </div>
      </div>

      <Link
        to="/settings/overhead"
        className="block rounded-lg border-2 border-slate-800 bg-white p-4 shadow-[3px_3px_0_0_rgba(15,23,42,0.12)] hover:-translate-y-0.5 transition-transform"
      >
        <div className="flex items-center">
          <div>
            <div className="font-semibold">Overhead → true cost rate</div>
            <div className="mt-0.5 text-sm text-slate-500">
              List real costs (salaries, rent, trucks) and get an honest cost rate per shop hour.
            </div>
          </div>
          <span className="ml-auto text-xl text-slate-400">→</span>
        </div>
      </Link>

      {grouped.map(([group, items]) => (
        <section key={group}>
          <h2 className="mb-2 font-mono text-[11px] uppercase tracking-widest text-slate-500">{group}</h2>
          <div className="overflow-hidden rounded-lg border-2 border-slate-800 bg-white">
            {items.map((s, i) => {
              const suffix = settingSuffix(s.format)
              const isDirty = Number(drafts[s.key]) !== settingToDisplay(Number(s.value), s.format)
              return (
                <div
                  key={s.key}
                  className={`flex items-center gap-3 px-4 py-2.5 ${i > 0 ? 'border-t border-slate-100' : ''}`}
                >
                  <span className="min-w-0 flex-1 text-sm">{s.label}</span>
                  <div className="flex items-center gap-1.5">
                    {suffix === '$' && <span className="text-xs text-slate-400">$</span>}
                    <input
                      type="number"
                      step="any"
                      value={drafts[s.key] ?? ''}
                      onChange={(e) => setDrafts((d) => ({ ...d, [s.key]: e.target.value }))}
                      className={`w-28 rounded-md border px-2 py-1.5 text-right text-sm tabular-nums focus:border-slate-800 focus:outline-none ${
                        isDirty ? 'border-amber-400 bg-amber-50' : 'border-slate-300'
                      }`}
                    />
                    {suffix !== '$' && suffix !== '' && (
                      <span className="w-9 text-xs text-slate-400">{suffix}</span>
                    )}
                    {suffix === '$' && <span className="w-9"></span>}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
