import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { Bid, BidCustomer, BidStatus, Customer } from '../lib/types'
import { STATUSES, fmtFollowUp, followUpAt } from '../lib/format'
import ConfirmDialog from '../components/ConfirmDialog'
import ViewOnlyBanner from '../components/ViewOnlyBanner'
import PlansSection from '../components/PlansSection'

export default function BidDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { isAdmin, canEdit } = useAuth()
  const [bid, setBid] = useState<Bid | null>(null)
  const [gcs, setGcs] = useState<BidCustomer[]>([])
  const [allCustomers, setAllCustomers] = useState<Customer[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [followupDefault, setFollowupDefault] = useState(7)

  async function load() {
    const [bidRes, gcRes, custRes, setRes] = await Promise.all([
      supabase!.from('bids').select('*').eq('id', id!).single(),
      supabase!.from('bid_customers').select('*, customer:customers(*)').eq('bid_id', id!),
      supabase!.from('customers').select('*').order('company'),
      supabase!.from('settings').select('value').eq('key', 'followup_days').single(),
    ])
    if (bidRes.error) setError(bidRes.error.message)
    else setBid(bidRes.data as Bid)
    if (gcRes.data) setGcs(gcRes.data as BidCustomer[])
    if (custRes.data) setAllCustomers(custRes.data as Customer[])
    if (setRes.data) setFollowupDefault(Number(setRes.data.value))
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  if (error)
    return <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>
  if (!bid) return <p className="text-sm text-slate-500">Loading…</p>

  function patch(fields: Partial<Bid>) {
    setBid((b) => (b ? { ...b, ...fields } : b))
    setSaved(false)
  }

  async function save() {
    if (!bid) return
    setBusy(true)
    const { id: _id, created_at, updated_at, ...fields } = bid
    const { error } = await supabase!.from('bids').update(fields).eq('id', bid.id)
    setBusy(false)
    if (error) setError(error.message)
    else {
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    }
  }

  // Refresh only the GC links — never the bid itself, so unsaved edits
  // (like a status change waiting on Save) don't get wiped.
  async function loadGcs() {
    const { data } = await supabase!
      .from('bid_customers')
      .select('*, customer:customers(*)')
      .eq('bid_id', id!)
    if (data) setGcs(data as BidCustomer[])
  }

  async function toggleGC(customerId: string) {
    const existing = gcs.find((g) => g.customer_id === customerId)
    if (existing) {
      await supabase!.from('bid_customers').delete().eq('bid_id', bid!.id).eq('customer_id', customerId)
    } else {
      await supabase!.from('bid_customers').insert({ bid_id: bid!.id, customer_id: customerId })
    }
    void loadGcs()
  }

  async function setWonThrough(customerId: string) {
    await supabase!.from('bid_customers').update({ won_through: false }).eq('bid_id', bid!.id)
    await supabase!
      .from('bid_customers')
      .update({ won_through: true })
      .eq('bid_id', bid!.id)
      .eq('customer_id', customerId)
    void loadGcs()
  }

  async function remove() {
    await supabase!.from('bids').delete().eq('id', bid!.id)
    navigate('/bids')
  }

  const dueDate = bid.due_at ? toLocalDate(bid.due_at) : ''
  const dueTime = bid.due_at ? toLocalTime(bid.due_at) : ''

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link to="/bids" className="text-sm text-slate-500 hover:text-slate-900">
          ← Bids
        </Link>
        <span className="font-mono text-sm text-slate-500">{bid.job_number}</span>
        <div className="ml-auto flex items-center gap-2">
          {saved && <span className="text-xs font-medium text-emerald-600">Saved ✓</span>}
          {isAdmin && bid.status === 'won' && (
            <Link
              to={`/bids/${bid.id}/actuals`}
              className="rounded-md border border-slate-300 px-3 py-1 text-sm font-medium text-slate-600 hover:bg-slate-100"
              title="Estimated vs actual job cost"
            >
              Actuals
            </Link>
          )}
          <Link
            to={`/bids/${bid.id}/proposal`}
            className="rounded-md border border-slate-300 px-3 py-1 text-sm font-medium text-slate-600 hover:bg-slate-100"
            title="Customer-facing proposal + work authorization, ready to print"
          >
            Proposal
          </Link>
          <Link
            to={`/bids/${bid.id}/order`}
            className="rounded-md border border-slate-300 px-3 py-1 text-sm font-medium text-slate-600 hover:bg-slate-100"
            title="Purchase list built from the estimate"
          >
            Order sheet
          </Link>
          <Link
            to={`/bids/${bid.id}/estimate`}
            className="rounded-md border-2 border-slate-900 px-4 py-1 text-sm font-semibold text-slate-900 hover:bg-slate-900 hover:text-white"
          >
            Estimate →
          </Link>
          {canEdit && (
            <button
              onClick={() => void save()}
              disabled={busy}
              className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Save'}
            </button>
          )}
        </div>
      </div>

      {!canEdit && <ViewOnlyBanner />}

      <input
        value={bid.name}
        onChange={(e) => patch({ name: e.target.value })}
        className="w-full border-0 border-b-2 border-slate-300 bg-transparent px-0 py-1 text-2xl font-semibold tracking-tight focus:border-slate-900 focus:outline-none focus:ring-0"
      />

      {/* Status pipeline */}
      <div className="flex flex-wrap gap-1.5">
        {STATUSES.map((s) => (
          <button
            key={s.value}
            onClick={() => {
              patch({
                status: s.value as BidStatus,
                // moving to Sent (re)starts the follow-up clock
                ...(s.value === 'sent' ? { sent_at: new Date().toISOString() } : {}),
              })
              // Won with a single GC: no ambiguity about who it was won through
              if (s.value === 'won' && gcs.length === 1 && !gcs[0].won_through) {
                void setWonThrough(gcs[0].customer_id)
              }
            }}
            className={`rounded-md border px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider ${
              bid.status === s.value
                ? 'border-slate-900 bg-slate-900 text-white'
                : `${s.badge} hover:border-slate-500`
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {bid.status === 'sent' && (
        <div className="flex flex-wrap items-end gap-4">
          <Field label="Follow up after (days)">
            <input
              type="number"
              min="1"
              value={bid.followup_days ?? ''}
              placeholder={String(followupDefault)}
              onChange={(e) => patch({ followup_days: e.target.value ? Number(e.target.value) : null })}
              className="input w-32"
            />
          </Field>
          {(() => {
            const f = followUpAt(bid, followupDefault)
            if (!f) return null
            const due = f.getTime() <= Date.now()
            return (
              <span className={`pb-2 text-sm ${due ? 'font-semibold text-amber-600' : 'text-slate-500'}`}>
                {due ? '☎ Follow up now' : `Follow up ${fmtFollowUp(f)}`}
              </span>
            )
          })()}
        </div>
      )}

      {bid.status === 'lost' && (
        <Field label="Why did we lose it?">
          <input
            value={bid.lost_reason ?? ''}
            onChange={(e) => patch({ lost_reason: e.target.value })}
            placeholder="price / schedule / went with incumbent…"
            className="input"
          />
        </Field>
      )}

      {/* GC chips */}
      <div>
        <div className="mb-1 font-mono text-[11px] uppercase tracking-widest text-slate-500">
          Bidding to{' '}
          {bid.status === 'won' && gcs.length > 1
            ? '(tap ★ to mark who we won through)'
            : bid.status === 'won' && gcs.length === 1
              ? '(★ = won through)'
              : ''}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {allCustomers.length === 0 && (
            <span className="text-xs text-slate-500">
              Add contractors on the <Link to="/contractors" className="underline">Contractors</Link> page first.
            </span>
          )}
          {allCustomers.map((c) => {
            const link = gcs.find((g) => g.customer_id === c.id)
            return (
              <span key={c.id} className="inline-flex items-center">
                <button
                  onClick={() => void toggleGC(c.id)}
                  className={`rounded-l-full border px-3 py-1 text-xs font-medium ${
                    link
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-300 bg-white text-slate-600 hover:border-slate-500'
                  } ${link && bid.status === 'won' ? '' : 'rounded-r-full'}`}
                >
                  {c.company}
                </button>
                {link && bid.status === 'won' && (
                  <button
                    onClick={() => void setWonThrough(c.id)}
                    title="Won through this GC"
                    className={`rounded-r-full border border-l-0 px-2 py-1 text-xs ${
                      link.won_through
                        ? 'border-amber-500 bg-amber-400 text-slate-900'
                        : 'border-slate-900 bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    ★
                  </button>
                )}
              </span>
            )
          })}
        </div>
      </div>

      {/* Details grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Field label="Due date">
          <input
            type="date"
            value={dueDate}
            onChange={(e) => patch({ due_at: combineDue(e.target.value, dueTime || '14:00') })}
            className="input"
          />
        </Field>
        <Field label="Due time">
          <input
            type="time"
            value={dueTime}
            onChange={(e) => patch({ due_at: dueDate ? combineDue(dueDate, e.target.value) : bid.due_at })}
            className="input"
          />
        </Field>
        <Field label="Est. value ($)">
          <input
            type="number"
            min="0"
            value={bid.bid_value ?? ''}
            onChange={(e) => patch({ bid_value: e.target.value ? Number(e.target.value) : null })}
            className="input"
          />
        </Field>
        <div className="col-span-2">
          <Field label="Job address">
            <input
              value={bid.address ?? ''}
              onChange={(e) => patch({ address: e.target.value || null })}
              className="input"
            />
          </Field>
        </div>
        <Field label="Architect drawings dated">
          <input
            type="date"
            value={bid.drawings_date ?? ''}
            onChange={(e) => patch({ drawings_date: e.target.value || null })}
            className="input"
          />
        </Field>
        <Field label="Distance (mi)">
          <input
            type="number"
            min="0"
            value={bid.distance_miles ?? ''}
            onChange={(e) => patch({ distance_miles: e.target.value ? Number(e.target.value) : null })}
            className="input"
          />
        </Field>
        <Field label="Shop heads">
          <input
            type="number"
            min="0"
            value={bid.labor_heads ?? ''}
            onChange={(e) => patch({ labor_heads: e.target.value ? Number(e.target.value) : null })}
            className="input"
          />
        </Field>
        <Field label="Install heads">
          <input
            type="number"
            min="0"
            value={bid.install_heads ?? ''}
            onChange={(e) => patch({ install_heads: e.target.value ? Number(e.target.value) : null })}
            className="input"
          />
        </Field>
        <Field label="Tax exempt">
          <div className="mt-1">
            <button
              onClick={() => patch({ tax_exempt: !bid.tax_exempt })}
              className={`rounded-md border px-3 py-2 text-sm font-medium w-full ${
                bid.tax_exempt
                  ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                  : 'border-slate-300 bg-white text-slate-500'
              }`}
            >
              {bid.tax_exempt ? 'Yes — exempt' : 'No'}
            </button>
          </div>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Inclusions">
          <textarea
            rows={4}
            value={bid.inclusions ?? ''}
            onChange={(e) => patch({ inclusions: e.target.value || null })}
            className="input"
          />
        </Field>
        <Field label="Exclusions">
          <textarea
            rows={4}
            value={bid.exclusions ?? ''}
            onChange={(e) => patch({ exclusions: e.target.value || null })}
            className="input"
          />
        </Field>
      </div>
      <Field label="Notes">
        <textarea
          rows={3}
          value={bid.notes ?? ''}
          onChange={(e) => patch({ notes: e.target.value || null })}
          className="input"
        />
      </Field>

      <PlansSection bidId={bid.id} />

      {isAdmin && (
        <div className="border-t border-slate-200 pt-4">
          <button onClick={() => setConfirmDelete(true)} className="text-xs text-red-500 hover:text-red-700 hover:underline">
            Delete this bid
          </button>
        </div>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Delete bid"
          message={`Delete bid ${bid.job_number} — ${bid.name}? This can't be undone.`}
          onConfirm={() => void remove()}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
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

function toLocalDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function toLocalTime(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
function combineDue(date: string, time: string): string {
  return new Date(`${date}T${time}`).toISOString()
}
