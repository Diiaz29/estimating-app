import { useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import type { Customer } from '../lib/types'
import { nextJobNumber } from '../lib/format'

/** The "new bid" dialog — shared by the Bids page and the Dashboard. */
export default function NewBidForm({
  customers,
  existingNumbers,
  onClose,
  onCreated,
}: {
  customers: Customer[]
  existingNumbers: string[]
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const [jobNumber, setJobNumber] = useState(() => nextJobNumber(existingNumbers))
  const [name, setName] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [dueTime, setDueTime] = useState('14:00')
  const [bidValue, setBidValue] = useState('')
  const [selectedGCs, setSelectedGCs] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const due_at = dueDate ? new Date(`${dueDate}T${dueTime || '12:00'}`).toISOString() : null
    const { data, error } = await supabase!
      .from('bids')
      .insert({
        job_number: jobNumber.trim(),
        name: name.trim(),
        due_at,
        bid_value: bidValue ? Number(bidValue) : null,
      })
      .select('id')
      .single()
    if (error) {
      setError(
        error.message.includes('duplicate')
          ? `Job number ${jobNumber} is already taken.`
          : error.message,
      )
      setBusy(false)
      return
    }
    if (selectedGCs.length > 0) {
      await supabase!
        .from('bid_customers')
        .insert(selectedGCs.map((customer_id) => ({ bid_id: data.id, customer_id })))
    }
    onCreated(data.id)
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end sm:items-center justify-center bg-slate-900/40 p-0 sm:p-6">
      <div className="w-full max-w-lg rounded-t-xl sm:rounded-xl border-2 border-slate-800 bg-white max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b-2 border-slate-800 px-5 py-3">
          <h2 className="font-semibold">New bid</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl leading-none">
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          <div className="grid grid-cols-3 gap-3">
            <Field label="Job #">
              <input
                value={jobNumber}
                onChange={(e) => setJobNumber(e.target.value)}
                required
                className="input font-mono"
              />
            </Field>
            <div className="col-span-2">
              <Field label="Job name">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder="Senderra Expansion Suite 1400"
                  className="input"
                />
              </Field>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Due date">
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="input" />
            </Field>
            <Field label="Due time">
              <input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} className="input" />
            </Field>
            <Field label="Est. value ($)">
              <input
                type="number"
                min="0"
                value={bidValue}
                onChange={(e) => setBidValue(e.target.value)}
                placeholder="optional"
                className="input"
              />
            </Field>
          </div>
          <Field label="Bidding to (GCs)">
            {customers.length === 0 ? (
              <p className="text-xs text-slate-500 mt-1">
                No contractors yet — you can add them on the Contractors page and attach them later.
              </p>
            ) : (
              <div className="mt-1 flex flex-wrap gap-1.5">
                {customers.map((c) => {
                  const on = selectedGCs.includes(c.id)
                  return (
                    <button
                      type="button"
                      key={c.id}
                      onClick={() =>
                        setSelectedGCs((prev) =>
                          on ? prev.filter((id) => id !== c.id) : [...prev, c.id],
                        )
                      }
                      className={`rounded-full border px-3 py-1 text-xs font-medium ${
                        on
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-300 bg-white text-slate-600 hover:border-slate-500'
                      }`}
                    >
                      {c.company}
                    </button>
                  )
                })}
              </div>
            )}
          </Field>
          {error && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">
              Cancel
            </button>
            <button type="submit" disabled={busy} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50">
              {busy ? 'Creating…' : 'Create bid'}
            </button>
          </div>
        </form>
      </div>
    </div>
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
