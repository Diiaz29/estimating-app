import { NavLink, Outlet, useParams, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'

/** Left sidebar shared by every screen of one bid/job, so you can hop between them. */
export default function BidLayout() {
  const { id } = useParams<{ id: string }>()
  const { isAdmin, isOffice } = useAuth()
  const base = `/bids/${id}`
  const { pathname } = useLocation()

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

  const primary = tabs.filter(t => ['Details', 'Estimate', 'Proposal', 'Plans', 'Field'].includes(t.label))
  const secondary = tabs.filter(t => !primary.includes(t))
  const activeSecondary = secondary.find(t => pathname.startsWith(t.to))
  const groups = [
    { label: 'Pricing & records', labels: ['Order sheet'] },
    { label: 'Delivery & costs', labels: ['Schedule', 'Budget', 'Actuals'] },
  ]
  return (
    <div className="zaid-bid-layout workspace-project-layout print:block">
      <nav aria-label="Project pages" className="workspace-project-nav print:hidden">
        <div className="workspace-project-primary">
          {primary.map(t => <NavLink key={t.to} to={t.to} end={t.end}>{t.label}</NavLink>)}
        </div>
        {secondary.length > 0 && <details className="workspace-project-more">
          <summary>{activeSecondary ? 'Current tool: ' + activeSecondary.label : 'More tools'}</summary>
          <div>{groups.map(group => {
            const visible = secondary.filter(t => group.labels.includes(t.label))
            return visible.length > 0 && <section key={group.label}><h2>{group.label}</h2>{visible.map(t => <NavLink key={t.to} to={t.to} onClick={event => event.currentTarget.closest('details')?.removeAttribute('open')}>{t.label}</NavLink>)}</section>
          })}</div>
        </details>}
      </nav>
      <div className="min-w-0 flex-1"><Outlet key={id} /></div>
    </div>
  )
}
