import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { signOut, useAuth } from '../lib/auth'
import { LOGO_URL } from '../lib/branding'
import { supabase } from '../lib/supabase'
import type { Role } from '../lib/types'

const baseTabs = [
  { to: '/', label: 'Dashboard', icon: '▦' },
  { to: '/bids', label: 'Bids', icon: '▤' },
  { to: '/jobs', label: 'Jobs', icon: '▬' },
  { to: '/schedule', label: 'Schedule', icon: '▦' },
  { to: '/time', label: 'Time', icon: '◔' },
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
  const { pathname } = useLocation()
  // the plan room wants every pixel of a big monitor
  const fullWidth = pathname.endsWith('/plans/room')

  // logo replaces the text name when one is uploaded; onError falls back to text
  const [logoOk, setLogoOk] = useState(true)
  const [companyName, setCompanyName] = useState('')
  useEffect(() => {
    supabase
      ?.from('text_settings')
      .select('value')
      .eq('key', 'company_name')
      .single()
      .then(({ data }) => {
        if (data) setCompanyName(data.value)
      })
  }, [])

  const [theme, setTheme] = useState<'light' | 'dark'>(
    () => (localStorage.getItem('theme') === 'dark' ? 'dark' : 'light'),
  )
  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    localStorage.setItem('theme', next)
  }
  const dark = theme === 'dark'

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-1.5 rounded-md text-sm font-medium ${
      isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-200'
    }`

  return (
    <div className={`min-h-screen bg-slate-100 pb-16 sm:pb-0 print:bg-white print:pb-0 ${dark ? 'dark' : ''}`}>
      <header className="sticky top-0 z-20 border-b-2 border-slate-800 bg-white print:hidden">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-2.5">
          <NavLink to="/" title="Dashboard">
            {logoOk && LOGO_URL ? (
              <img
                src={LOGO_URL}
                alt={companyName}
                className="h-20 w-auto max-w-[24rem] object-contain"
                onError={() => setLogoOk(false)}
              />
            ) : (
              <span className="text-lg font-semibold tracking-tight">{companyName}</span>
            )}
          </NavLink>
          <nav className="hidden sm:flex items-center gap-1 ml-6">
            {tabs.map((t) => (
              <NavLink key={t.to} to={t.to} end={t.to === '/'} className={linkClass}>
                {t.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <button
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-600 hover:bg-slate-100"
            >
              {theme === 'dark' ? '☀' : '🌙'}
            </button>
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

      {/* Bottom tabs on phones — scrolls sideways when there are many */}
      {/* h-[3.4rem] matches the estimate totals bar's bottom-[3.4rem] — keep them in sync */}
      <nav className="fixed inset-x-0 bottom-0 z-20 flex h-[3.4rem] overflow-x-auto border-t-2 border-slate-800 bg-white sm:hidden print:hidden">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.to === '/'}
            className={({ isActive }) =>
              `flex min-w-[4.2rem] flex-1 shrink-0 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${
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
