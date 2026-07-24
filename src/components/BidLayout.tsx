import { NavLink, Outlet, useParams } from 'react-router-dom'
import { useAuth } from '../lib/auth'

/** Left sidebar shared by every screen of one bid/job, so you can hop between them. */
export default function BidLayout() {
  const { id } = useParams<{ id: string }>()
  const { isAdmin } = useAuth()
  const base = `/bids/${id}`

  const tabs = [
    { to: base, label: 'Details', end: true },
    { to: `${base}/estimate`, label: 'Estimate' },
    { to: `${base}/proposal`, label: 'Proposal' },
    { to: `${base}/order`, label: 'Order sheet' },
    { to: `${base}/schedule`, label: 'Schedule' },
    { to: `${base}/plans`, label: 'Plans' },
    ...(isAdmin ? [{ to: `${base}/budget`, label: 'Budget' }, { to: `${base}/actuals`, label: 'Actuals' }] : []),
  ]

  return (
    <div className="flex flex-col gap-5 sm:flex-row print:block">
      <nav className="shrink-0 sm:w-36 print:hidden">
        <div className="flex gap-1 overflow-x-auto sm:sticky sm:top-16 sm:flex-col">
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                `shrink-0 rounded-md px-3 py-2 text-sm font-medium ${
                  isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-200'
                }`
              }
            >
              {t.label}
            </NavLink>
          ))}
        </div>
      </nav>
      <div className="min-w-0 flex-1">
        <Outlet />
      </div>
    </div>
  )
}
