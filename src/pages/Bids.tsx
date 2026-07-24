import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { Bid, BidStatus, Customer } from '../lib/types'
import { STATUSES, fmtDueDate, fmtFollowUp, fmtMoney, followUpAt, isOverdue, nextJobNumber } from '../lib/format'
import StatusBadge from '../components/StatusBadge'

interface GcLink {
  bid_id: string
  won_through: boolean
  customer: { company: string } | null
}

export default function Bids() {
  const { canEdit } = useAuth()
  const [bids, setBids] = useState<Bid[] | null>(null)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [gcLinks, setGcLinks] = useState<GcLink[]>([])
  const [error, setError] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [params, setParams] = useSearchParams()
  const filter = (params.get('status') as BidStatus | null) ?? null
  const [followupDays, setFollowupDays] = useState(7)

  async function load() {
    const [bidsRes, custRes, setRes, gcRes] = await Promise.all([
      supabase!.from('bids').select('*').order('created_at', { ascending: false }),
      supabase!.from('customers').select('*').order('company'),
      supabase!.from('settings').select('value').eq('key', 'followup_days').single(),
      supabase!.from('bid_customers').select('bid_id, won_through, customer:customers(company)'),
    ])
    if (bidsRes.error) setError(bidsRes.error.message)
    else setBids(bidsRes.data as Bid[])
    if (custRes.data) setCustomers(custRes.data as Customer[])
    if (setRes.data) setFollowupDays(Number(setRes.data.value))
    if (gcRes.data) setGcLinks(gcRes.data as unknown as GcLink[])
  }

  // "won through" GC first; otherwise the first one attached; +N when bidding to several
  const gcLabel = (bidId: string) => {
    const links = gcLinks.filter((l) => l.bid_id === bidId && l.customer)
    if (links.length === 0) return null
    const primary = links.find((l) => l.won_through) ?? links[0]
    return `${primary.customer!.company}${links.length > 1 ? ` +${links.length - 1}` : ''}`
  }

  useEffect(() => {
    void load()
  }, [])

  // Won work lives on the Jobs page, not here
  const visible = useMemo(
    () => (bids ?? []).filter((b) => (filter ? b.status === filter : b.status !== 'won')),
    [bids, filter],
  )

  if (error)
    return <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <FilterChip label="All" active={!filter} onClick={() => setParams({})} />
        {STATUSES.filter((s) => s.value !== 'won').map((s) => (
          <FilterChip
            key={s.value}
            label={s.label}
            active={filter === s.value}
            onClick={() => setParams({ status: s.value })}
          />
        ))}
        {canEdit && (
          <button
            onClick={() => setShowNew(true)}
            className="ml-auto rounded-md bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-700"
          >
            + New bid
          </button>
        )}
      </div>

      {!bids ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : visible.length === 0 ? (
        <p className="rounded-lg border-2 border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
          {filter ? 'No bids in this stage.' : 'No bids yet — add the first one.'}
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border-2 border-slate-800 bg-white">
          {visible.map((b, i) => {
            const followUp = followUpAt(b, followupDays)
            const followUpDue = followUp !== null && followUp.getTime() <= Date.now()
            return (
              <Link
                key={b.id}
                to={`/bids/${b.id}`}
                className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-slate-50 ${
                  i > 0 ? 'border-t border-slate-200' : ''
                }`}
              >
                <span className="font-mono text-xs text-slate-500">{b.job_number}</span>
                <span className="flex min-w-0 flex-1 basis-40 items-center gap-3">
                  <span className="min-w-0 truncate text-sm font-medium">{b.name}</span>
                  {gcLabel(b.id) && (
                    <span className="hidden min-w-0 truncate text-xs text-slate-400 sm:block">{gcLabel(b.id)}</span>
                  )}
                </span>
                <span className="hidden sm:block w-24 text-right text-xs tabular-nums text-slate-500">
                  {fmtMoney(b.bid_value)}
                </span>
                <StatusBadge status={b.status} />
                {followUp ? (
                  <span
                    className={`w-40 whitespace-nowrap text-right text-xs ${
                      followUpDue ? 'font-semibold text-amber-600' : 'text-slate-500'
                    }`}
                  >
                    {followUpDue ? '☎ follow up' : `follow up ${fmtFollowUp(followUp)}`}
                  </span>
                ) : (
                  <span
                    className={`w-40 whitespace-nowrap text-right text-xs tabular-nums ${
                      isOverdue(b) ? 'font-semibold text-red-600' : 'text-slate-500'
                    }`}
                  >
                    {fmtDueDate(b.due_at)}
                  </span>
                )}
              </Link>
            )
          })}
        </div>
      )}

      {showNew && (
        <NewBidForm
          customers={customers}
          existingNumbers={(bids ?? []).map((b) => b.job_number)}
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

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium ${
        active
          ? 'border-slate-900 bg-slate-900 text-white'
          : 'border-slate-300 bg-white text-slate-600 hover:border-slate-500'
      }`}
    >
      {label}
    </button>
  )
}

function NewBidForm({
  customers,
  existingNumbers,
  onClose,
  onCreated,
}: {
  customers: Customer[]
  existingNumbers: string[]
  onClose: () => void
  onCreated: () => void
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
    onCreated()
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
