import { useEffect, useState } from 'react'
import { costRateBreakdown } from '../lib/costAllocation'
import { hourlyCostRateValues } from '../lib/hourlyCostRates'
import { fmtMoney } from '../lib/format'
import { useUnsavedWarning } from '../lib/useSaveQueue'

export default function HourlyCostRates({ settings, disabled, onSave, onDirtyChange }: {
  settings: Record<string, number>; disabled: boolean
  onSave: (labor: string, overhead: string) => Promise<void>
  onDirtyChange: (dirty: boolean) => void
}) {
  const rates = costRateBreakdown(settings)
  const initialLabor = rates ? rates.labor.toFixed(2) : ''
  const initialOverhead = rates ? rates.overhead.toFixed(2) : ''
  const [labor, setLabor] = useState(initialLabor)
  const [overhead, setOverhead] = useState(initialOverhead)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { setLabor(initialLabor); setOverhead(initialOverhead) }, [initialLabor, initialOverhead])
  const dirty = labor !== initialLabor || overhead !== initialOverhead
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange])
  useUnsavedWarning(dirty || busy)
  let preview: number | null = null
  try { preview = hourlyCostRateValues(labor, overhead).combined } catch { /* Keep incomplete drafts editable. */ }
  return <section className="rounded-lg border-2 border-slate-800 bg-white p-4">
    <h2 className="text-sm font-semibold">Hourly job costs</h2>
    <p className="mt-1 text-sm text-slate-500">Set labor and overhead separately. Jobs use their sum for shop and installation hours.</p>
    <form className="mt-4 space-y-3" onSubmit={async event => {
      event.preventDefault()
      setSaved(false); setError(null); setBusy(true)
      try { hourlyCostRateValues(labor, overhead); await onSave(labor, overhead); setSaved(true) }
      catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save hourly rates. Try again.') }
      finally { setBusy(false) }
    }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">Labor cost ($/hr)
          <input className="input mt-1" type="number" min="0" step="0.01" required value={labor} disabled={busy || disabled}
            onChange={event => { setLabor(event.target.value); setSaved(false); setError(null) }} />
        </label>
        <label className="block text-sm">Overhead cost ($/hr)
          <input className="input mt-1" type="number" min="0" step="0.01" required value={overhead} disabled={busy || disabled}
            onChange={event => { setOverhead(event.target.value); setSaved(false); setError(null) }} />
        </label>
      </div>
      <div className="flex justify-between gap-3 border-t border-slate-200 pt-3 text-sm font-semibold"><span>Combined cost</span><span className="tabular-nums">{preview == null ? '—' : `${fmtMoney(preview)}/hr`}</span></div>
      <p className="text-xs text-slate-500">Saving changes calculated costs and profit on jobs using current settings. Customer prices and saved revisions stay the same. Annual expense estimates remain unchanged.</p>
      {error && <p role="alert" className="text-sm text-red-600">{error} Your edits are still here.</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button className="index-primary" disabled={busy || disabled || !dirty || preview == null}>{busy ? 'Saving…' : 'Save hourly rates'}</button>
        {saved && <span role="status" className="text-sm text-emerald-700">Hourly rates saved.</span>}
      </div>
    </form>
  </section>
}
