import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { Bid, BidStatus, Customer } from '../lib/types'
import NewBidForm from '../components/NewBidForm'
import ProjectIndex from '../components/ProjectIndex'

interface GcLink {
  bid_id: string
  won_through: boolean
  customer: { company: string } | null
}

export default function Bids() {
  const { canManageBids: canEdit } = useAuth()
  const [bids, setBids] = useState<Bid[] | null>(null)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [gcLinks, setGcLinks] = useState<GcLink[]>([])
  const [error, setError] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [params, setParams] = useSearchParams()
  const filter = (params.get('status') as BidStatus | null) ?? null
  const [followupDays, setFollowupDays] = useState(7)

  async function load() {
    setError(null)
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

  if (error)
    return <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>

  if (!bids) return <section className="zaid-page zaid-bids" aria-busy="true"><h1>Your bids</h1><p role="status">Loading your bids…</p></section>

  return (
    <div className="zaid-page zaid-bids space-y-4">
      <ProjectIndex followupDays={followupDays} bids={bids} contractor={gcLabel} valueFor={(b) => b.bid_value == null ? null : Number(b.bid_value)} onNew={canEdit ? () => setShowNew(true) : undefined} title="Your bids" statusFilter={filter} onStatusFilter={(status) => setParams(status ? { status } : {})} />
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
