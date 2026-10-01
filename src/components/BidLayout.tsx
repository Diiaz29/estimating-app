import { NavLink, Outlet, useParams } from 'react-router-dom'
import { useAuth } from '../lib/auth'

/** Visible project tabs shared by every screen of one bid/job. */
export default function BidLayout() {
  const { id } = useParams<{ id: string }>()
  const { isAdmin, isOffice } = useAuth()
  const base = `/bids/${id}`

  // office sets up bids and handles paperwork — no estimating, ordering, or scheduling tabs
  const tabs = [
    { to: base, label: 'Details', end: true },
    ...(isOffice ? [] : [{ to: `${base}/estimate`, label: 'Estimate' }]),
    { to: `${base}/proposal`, label: 'Proposal' },
    ...(isOffice ? [] : [{ to: `${base}/order`, label: 'Order sheet' }, { to: `${base}/schedule`, label: 'Schedule' }]),
    { to: `${base}/plans`, label: 'Plans' },
    { to: `${base}/field`, label: 'Field' },
    ...(isAdmin ? [{ to: `${base}/budget`, label: 'Budget' }] : []),
    ...(isAdmin || isOffice ? [{ to: `${base}/actuals`, label: 'Actuals' }] : []),
  ]

  return (
    <div className="zaid-bid-layout workspace-project-layout print:block">
      <nav aria-label="Project pages" className="workspace-project-nav print:hidden">
        <div className="workspace-project-primary">
          {tabs.map(t => <NavLink key={t.to} to={t.to} end={t.end}>{t.label}</NavLink>)}
        </div>
      </nav>
      <div className="min-w-0 flex-1"><Outlet key={id} /></div>
    </div>
  )
}
