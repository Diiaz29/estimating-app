import { errorMessage } from '../lib/loadResults'
import { useUnsavedWarning } from '../lib/useSaveQueue'
import LoadError from '../components/LoadError'
import { validateSettingDraft } from '../lib/settingValidation'
import Overhead from './Overhead'
import HourlyCostRates from '../components/HourlyCostRates'
import { writeHourlyCostRates } from '../lib/hourlyCostRates'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { Setting } from '../lib/types'
import { settingFromDisplay, settingSuffix, settingToDisplay } from '../lib/format'
import { LOGO_URL } from '../lib/branding'

const GROUP_ORDER = ['Markups', 'Labor', 'Delivery', 'Travel', 'Added costs', 'Company', 'Tax', 'App']

/** Upload card for a fixed-path image in the public branding bucket (logo, signature). */
function ImageCard({
  path, url, title, help, noun, accept = 'image/png,image/jpeg,image/svg+xml,image/webp',
}: { path: string; url: string; title: string; help: string; noun: string; accept?: string }) {
  const [version, setVersion] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [hasLogo, setHasLogo] = useState(true) // assume yes; img onError flips it
  const [error, setError] = useState<string | null>(null)

  async function upload(file: File) {
    setUploading(true)
    setError(null)
    const { error } = await supabase!.storage.from('branding').upload(path, file, {
      upsert: true,
      contentType: file.type,
      cacheControl: '60',
    })
    if (error) setError(error.message)
    else {
      setHasLogo(true)
      setVersion((v) => v + 1)
    }
    setUploading(false)
  }

  return (
    <div className="rounded-lg border-2 border-slate-800 bg-white p-4">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex h-16 w-40 items-center justify-center overflow-hidden rounded border border-slate-200 bg-slate-50">
          {hasLogo ? (
            <img
              src={`${url}?v=${version}`}
              alt={title}
              className="max-h-full max-w-full object-contain"
              onError={() => setHasLogo(false)}
            />
          ) : (
            <span className="text-xs text-slate-400">no {noun} yet</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{title}</div>
          <div className="mt-0.5 text-sm text-slate-500">{help}</div>
          {error && <div className="mt-1 text-sm text-red-600">{error}</div>}
        </div>
        <label className={`cursor-pointer rounded-md px-3 py-2 text-sm font-semibold text-white ${uploading ? 'bg-slate-400' : 'bg-slate-900 hover:bg-slate-700'}`}>
          {uploading ? 'Uploading…' : hasLogo ? `Replace ${noun}` : `+ Upload ${noun}`}
          <input
            type="file"
            accept={accept}
            className="file-upload-input"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void upload(f)
              e.target.value = ''
            }}
          />
        </label>
      </div>
    </div>
  )
}

interface TextSetting {
  key: string
  label: string
  value: string
  sort_order: number
  group_name: string
}

function TextRowsCard({ group, intro, multiline }: { group: string; intro: string; multiline: boolean }) {
  const [rows, setRows] = useState<TextSetting[] | null>(null)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)

  const [reload, setReload] = useState(0)
  useUnsavedWarning(busy || !!rows?.some(t => drafts[t.key] !== undefined && drafts[t.key] !== t.value))

  useEffect(() => {
    setError(null)
    supabase!
      .from('text_settings')
      .select('*')
      .eq('group_name', group)
      .order('sort_order')
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else {
          const r = data as TextSetting[]
          setRows(r)
          setDrafts(Object.fromEntries(r.map((t) => [t.key, t.value])))
        }
      })
  }, [group, reload])

  if (error && !rows) return <LoadError error={error} retry={() => setReload(n => n + 1)} subject="text settings" />
  if (!rows) return <p className="text-sm text-slate-500">Loading…</p>

  const changed = rows.filter((t) => drafts[t.key] !== undefined && drafts[t.key] !== t.value)

  async function save() {
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      for (const t of changed) {
        const { error } = await supabase!.from('text_settings').update({ value: drafts[t.key] }).eq('key', t.key).select('key').single()
        if (error) {
          setError(error.message)
          setBusy(false)
          return
        }
        setRows(prev => prev!.map(row => row.key === t.key ? { ...row, value: drafts[t.key] } : row))
      }
      setBusy(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e) { setError(errorMessage(e)) } finally { setBusy(false) }
  }

  return (
    <div className="construction-settings-text-panel space-y-4">
      <p className="text-sm text-slate-500">{intro}</p>
      {error && <p role="alert" className="text-sm text-red-600">Could not save all changes. Your remaining edits are still here. Try Save again. {error}</p>}
      {rows.map((t) => (
        <label key={t.key} className="block">
          <span className="font-mono text-[11px] uppercase tracking-widest text-slate-500">{t.label}</span>
          {multiline ? (
            <textarea
              rows={Math.max(6, drafts[t.key]?.split('\n').length ?? 6)}
              disabled={busy}
              value={drafts[t.key] ?? ''}
              onChange={(e) => setDrafts((d) => ({ ...d, [t.key]: e.target.value }))}
              className={`input ${drafts[t.key] !== t.value ? 'border-amber-400 bg-amber-50' : ''}`}
            />
          ) : (
            <input
              disabled={busy}
              value={drafts[t.key] ?? ''}
              onChange={(e) => setDrafts((d) => ({ ...d, [t.key]: e.target.value }))}
              className={`input ${drafts[t.key] !== t.value ? 'border-amber-400 bg-amber-50' : ''}`}
            />
          )}
        </label>
      ))}
      <div className="flex items-center gap-2">
        <button
          onClick={() => void save()}
          disabled={busy || changed.length === 0}
          className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-40"
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
        {saved && <span className="text-xs font-medium text-emerald-600">Saved ✓</span>}
      </div>
    </div>
  )
}

export default function Settings() {
  const { isAdmin } = useAuth()
  const [settings, setSettings] = useState<Setting[] | null>(null)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [active, setActive] = useState('Markups')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [ratesDirty, setRatesDirty] = useState(false)

  useUnsavedWarning(busy || !!settings?.some(s => drafts[s.key] !== undefined && (drafts[s.key].trim() === '' || Number(drafts[s.key]) !== settingToDisplay(Number(s.value), s.format))))

  async function load() {
    setError(null)
    try {
      const { data, error } = await supabase!.from('settings').select('*').order('sort_order')
      if (error) setError(error.message)
      else {
        const rows = data as Setting[]
        setSettings(rows)
        setDrafts(Object.fromEntries(rows.map((s) => [s.key, String(settingToDisplay(Number(s.value), s.format))])))
      }
    } catch (e) { setError(errorMessage(e)) }
  }

  useEffect(() => {
    void load()
  }, [])

  const grouped = useMemo(() => {
    const map = new Map<string, Setting[]>()
    map.set('Company', []) // Branding remains available without the legacy percentage.
    for (const s of settings ?? []) {
      if (s.group_name === 'Overhead' || s.key === 'overhead_pct' || s.key === 'cost_shop_rate') continue
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
  if (error && !settings) return <LoadError error={error} retry={() => void load()} subject="settings" />
  if (!settings) return <p className="text-sm text-slate-500">Loading…</p>

  const changed = settings.filter(
    (s) => drafts[s.key] !== undefined && (drafts[s.key].trim() === '' || Number(drafts[s.key]) !== settingToDisplay(Number(s.value), s.format)),
  )

  async function saveAll() {
    const invalid = changed.find(s => validateSettingDraft(drafts[s.key], s.key))
    if (invalid) { setError(`${invalid.label}: ${validateSettingDraft(drafts[invalid.key], invalid.key)}`); setActive(invalid.group_name); return }
    setSaved(false)
    setBusy(true)
    setError(null)
    try {
      for (const s of changed) {
        const value = settingFromDisplay(Number(drafts[s.key]), s.format)
        const { error } = await supabase!.from('settings').update({ value }).eq('key', s.key).select('key').single()
        if (error) {
          setError(error.message)
          setBusy(false)
          return
        }
        setSettings(previous => previous!.map(row => row.key === s.key ? { ...row, value } : row))
      }
      setBusy(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e) { setError(errorMessage(e)) } finally { setBusy(false) }
  }

  const activeItems = grouped.find(([g]) => g === active)?.[1] ?? grouped[0]?.[1] ?? []
  const dirtyGroups = new Set(changed.map((s) => s.group_name))
  if (ratesDirty) dirtyGroups.add('Labor')

  return (
    <div className="zaid-page zaid-settings space-y-5">
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

      {error && <p role="alert" className="save-feedback save-failed">{error} Your edits are still here. Correct the value or try Save again.</p>}
      <div className="flex flex-col gap-5 sm:flex-row">
        {/* Category sidebar (horizontal chips on phones) */}
        <nav className="shrink-0 sm:w-44">
          <div className="flex gap-1 overflow-x-auto sm:flex-col">
            {[...grouped.map(([g]) => g), 'Terms', 'Overhead'].map((group) => (
              <button
                key={group}
                aria-pressed={active === group}
                onClick={() => setActive(group)}
                className={`flex shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-left text-sm font-medium ${
                  active === group
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-200'
                }`}
              >
                {group}
                {dirtyGroups.has(group) && (
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400" title="Unsaved changes" />
                )}
              </button>
            ))}
          </div>
        </nav>

        {/* Selected category */}
        <div className="min-w-0 max-w-2xl flex-1 space-y-5">
          <div className={active === 'Labor' ? '' : 'hidden'}><HourlyCostRates
            settings={Object.fromEntries(settings.map(row => [row.key, Number(row.value)]))} disabled={busy}
            onDirtyChange={setRatesDirty}
            onSave={async (labor, overhead) => {
              setBusy(true)
              try {
                const { combined, share } = await writeHourlyCostRates(supabase!, labor, overhead)
                setSettings(previous => previous!.map(row => row.key === 'cost_shop_rate' ? { ...row, value: combined } : row.key === 'cost_labor_share' ? { ...row, value: share } : row))
                setDrafts(previous => ({ ...previous, cost_shop_rate: String(combined), cost_labor_share: String(share) }))
              } finally { setBusy(false) }
            }} /></div>
          {active === 'Overhead' && <Overhead embedded onRateApplied={(rate, share) => {
            setSettings((previous) => previous!.map((setting) => setting.key === 'cost_shop_rate' ? { ...setting, value: rate } : setting.key === 'cost_labor_share' ? { ...setting, value: share } : setting))
            setDrafts((previous) => ({ ...previous, cost_shop_rate: String(rate), cost_labor_share: String(share) }))
          }} />}
          {active === 'Company' && (
            <>
              <ImageCard
                path="logo"
                url={LOGO_URL}
                title="Company logo"
                help="Shows top-left on the proposal and work authorization. PNG with a clear background works best."
                noun="logo"
              />
              <TextRowsCard
                group="Company"
                intro="Shows on the proposal, work authorization, and app header. Everything customer-facing pulls from here."
                multiline={false}
              />
            </>
          )}
          {active === 'Terms' && (
            <TextRowsCard
              group="Terms"
              intro="This wording prints on the proposal cover and the Work Authorization Agreement. One bullet per line. Have a lawyer look these over — the app just prints what you write."
              multiline={true}
            />
          )}
          <div className={`overflow-hidden rounded-lg border-2 border-slate-800 bg-white ${active === 'Terms' || active === 'Overhead' || activeItems.length === 0 ? 'hidden' : ''}`}>
            {activeItems.map((s, i) => {
              const suffix = settingSuffix(s.format)
              const isDirty = drafts[s.key]?.trim() === '' || Number(drafts[s.key]) !== settingToDisplay(Number(s.value), s.format)
              return (
                <div
                  key={s.key}
                  className={`flex items-center gap-3 px-4 py-2.5 ${i > 0 ? 'border-t border-slate-100' : ''}`}
                >
                  <label htmlFor={`setting-${s.key}`} className="min-w-0 flex-1 text-sm">{s.label}</label>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className="w-2 shrink-0 text-xs text-slate-400">{suffix === '$' ? '$' : ''}</span>
                    <input
                      id={`setting-${s.key}`}
                      aria-label={s.label}
                      disabled={busy}
                      required
                      min="0"
                      type="number"
                      step="any"
                      value={drafts[s.key] ?? ''}
                      onChange={(e) => { setError(null); setDrafts((d) => ({ ...d, [s.key]: e.target.value })) }}
                      className={`w-28 rounded-md border px-2 py-1.5 text-right text-sm tabular-nums focus:border-slate-800 focus:outline-none ${
                        isDirty ? 'border-amber-400 bg-amber-50' : 'border-slate-300'
                      }`}
                    />
                    <span className="w-9 shrink-0 text-xs text-slate-400">{suffix === '$' ? '' : suffix}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
