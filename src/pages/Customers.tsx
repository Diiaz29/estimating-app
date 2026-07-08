import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Customer, CustomerType } from '../lib/types'

const TYPE_LABEL: Record<CustomerType, string> = {
  GC: 'General contractor',
  direct: 'Direct client',
  architect: 'Architect',
}

export default function Customers() {
  const [customers, setCustomers] = useState<Customer[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)

  async function load() {
    const { data, error } = await supabase!.from('customers').select('*').order('company')
    if (error) setError(error.message)
    else setCustomers(data as Customer[])
  }

  useEffect(() => {
    void load()
  }, [])

  if (error)
    return <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>

  return (
    <div className="space-y-4">
      <div className="flex items-center">
        <h1 className="text-lg font-semibold tracking-tight">Contractors & clients</h1>
        <button
          onClick={() => setShowNew(true)}
          className="ml-auto rounded-md bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-700"
        >
          + Add
        </button>
      </div>

      {!customers ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : customers.length === 0 ? (
        <p className="rounded-lg border-2 border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
          No contractors yet. Add the GCs you bid to most.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {customers.map((c) => (
            <Link
              key={c.id}
              to={`/contractors/${c.id}`}
              className="rounded-lg border-2 border-slate-800 bg-white p-4 shadow-[3px_3px_0_0_rgba(15,23,42,0.12)] hover:-translate-y-0.5 transition-transform"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="font-semibold">{c.company}</div>
                <span className="rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-slate-500">
                  {c.type}
                </span>
              </div>
              <div className="mt-1 text-xs text-slate-500">{c.phone || c.email || ' '}</div>
              {c.notes && <div className="mt-2 line-clamp-2 text-xs italic text-slate-500">"{c.notes}"</div>}
            </Link>
          ))}
        </div>
      )}

      {showNew && (
        <NewCustomerForm
          onClose={() => setShowNew(false)}
          onCreated={() => {
            setShowNew(false)
            void load()
          }}
        />
      )}
    </div>
  )
}

function NewCustomerForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [company, setCompany] = useState('')
  const [type, setType] = useState<CustomerType>('GC')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    const { error } = await supabase!.from('customers').insert({ company: company.trim(), type })
    if (error) {
      setError(error.message)
      setBusy(false)
    } else onCreated()
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end sm:items-center justify-center bg-slate-900/40 p-0 sm:p-6">
      <div className="w-full max-w-md rounded-t-xl sm:rounded-xl border-2 border-slate-800 bg-white">
        <div className="flex items-center justify-between border-b-2 border-slate-800 px-5 py-3">
          <h2 className="font-semibold">Add contractor / client</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          <label className="block">
            <span className="font-mono text-[11px] uppercase tracking-widest text-slate-500">Company</span>
            <input value={company} onChange={(e) => setCompany(e.target.value)} required autoFocus className="input" />
          </label>
          <div>
            <span className="font-mono text-[11px] uppercase tracking-widest text-slate-500">Type</span>
            <div className="mt-1 flex gap-1.5">
              {(Object.keys(TYPE_LABEL) as CustomerType[]).map((t) => (
                <button
                  type="button"
                  key={t}
                  onClick={() => setType(t)}
                  className={`flex-1 rounded-md border px-2 py-2 text-xs font-medium ${
                    type === t
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-300 bg-white text-slate-600 hover:border-slate-500'
                  }`}
                >
                  {TYPE_LABEL[t]}
                </button>
              ))}
            </div>
          </div>
          {error && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}
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
