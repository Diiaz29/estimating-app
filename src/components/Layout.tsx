import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { signOut, useAuth } from '../lib/auth'
import type { Role } from '../lib/types'

const baseTabs = [
  { to: '/', label: 'Dashboard', icon: '▦' },
  { to: '/bids', label: 'Bids', icon: '▤' },
  { to: '/jobs', label: 'Jobs', icon: '▬' },
  { to: '/schedule', label: 'Schedule', icon: '▦' },
  { to: '/contractors', label: 'Contractors', icon: '▧' },
  { to: '/libraries', label: 'Libraries', icon: '▥' },
]
const adminTabs = [
  ...baseTabs,
  { to: '/reports', label: 'Reports', icon: '▣' },
  { to: '/settings', label: 'Settings', icon: '▨' },
  { to: '/team', label: 'Team', icon: '▩' },
]

export default function Layout() {
  const { session, isAdmin, realRole, viewAs, setViewAs } = useAuth()
  const tabs = isAdmin ? adminTabs : baseTabs
  // the plan room wants every pixel of a big monitor
  const fullWidth = useLocation().pathname.endsWith('/plans')

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-1.5 rounded-md text-sm font-medium ${
      isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-200'
    }`

  return (
    <div className="min-h-screen bg-slate-100 pb-16 sm:pb-0 print:bg-white print:pb-0">
      <header className="sticky top-0 z-20 border-b-2 border-slate-800 bg-white print:hidden">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-2.5">
          <div className="leading-tight">
            <div className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
              ZAID Millwork
            </div>
            <div className="text-sm font-semibold tracking-tight">Estimating</div>
          </div>
          <nav className="hidden sm:flex items-center gap-1 ml-6">
            {tabs.map((t) => (
              <NavLink key={t.to} to={t.to} end={t.to === '/'} className={linkClass}>
                {t.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            {realRole === 'admin' && (
              <label className="flex items-center gap-1.5" title="Preview the app as another role (screen only — you keep your admin powers)">
                <span className="font-mono text-[10px] uppercase tracking-wider text-slate-400">view as</span>
                <select
                  value={viewAs ?? 'admin'}
                  onChange={(e) => setViewAs(e.target.value === 'admin' ? null : (e.target.value as Role))}
                  className={`rounded-md border px-1.5 py-1 text-xs focus:outline-none ${
                    viewAs ? 'border-violet-500 bg-violet-50 text-violet-800 font-semibold' : 'border-slate-300 text-slate-600'
                  }`}
                >
                  <option value="admin">admin</option>
                  <option value="estimator">estimator</option>
                  <option value="pm">pm</option>
                  <option value="viewer">viewer</option>
                </select>
              </label>
            )}
            <span className="hidden sm:block text-xs text-slate-500">{session?.user.email}</span>
            <button
              onClick={() => void signOut()}
              className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className={`mx-auto px-4 py-6 ${fullWidth ? 'max-w-none' : 'max-w-6xl'}`}>
        <Outlet />
      </main>

      {/* Bottom tabs on phones */}
      <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t-2 border-slate-800 bg-white sm:hidden print:hidden">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.to === '/'}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${
                isActive ? 'text-slate-900' : 'text-slate-400'
              }`
            }
          >
            <span className="text-base leading-none">{t.icon}</span>
            {t.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
