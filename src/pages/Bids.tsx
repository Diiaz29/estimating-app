import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { Bid, BidStatus, Customer } from '../lib/types'
import { STATUSES, fmtDueDate, fmtFollowUp, fmtMoney, followUpAt, isOverdue } from '../lib/format'
import StatusBadge from '../components/StatusBadge'
import NewBidForm from '../components/NewBidForm'

interface GcLink {
  bid_id: string
  won_through: boolean
  customer: { company: string } | null
}

export default function Bids() {
  const { canManageBids: canEdit, seesMoney } = useAuth()
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
                <span className="whitespace-nowrap font-mono text-xs text-slate-500">{b.job_number}</span>
                <span className="flex min-w-0 flex-1 basis-40 items-center gap-3">
                  <span className="min-w-0 truncate text-sm font-medium">{b.name}</span>
                  {gcLabel(b.id) && (
                    <span className="hidden min-w-0 truncate text-xs text-slate-400 sm:block">{gcLabel(b.id)}</span>
                  )}
                </span>
                {seesMoney && b.bid_value != null && (
                  <span className="ml-auto text-right text-xs tabular-nums text-slate-500 sm:ml-0 sm:w-24">
                    {fmtMoney(b.bid_value)}
                  </span>
                )}
                <StatusBadge status={b.status} />
                {followUp ? (
                  <span
                    className={`w-40 whitespace-nowrap text-right text-xs ${
                      followUpDue ? 'font-semibold text-amber-600' : 'text-slate-500'
                    }`}
                  >
                    {followUpDue ? '☎︎ follow up' : `follow up ${fmtFollowUp(followUp)}`}
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

