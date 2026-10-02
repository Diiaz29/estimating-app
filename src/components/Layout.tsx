import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { signOut, useAuth } from '../lib/auth'
import { LOGO_URL } from '../lib/branding'
import { supabase } from '../lib/supabase'
import type { Role } from '../lib/types'
import UiIcon from './UiIcon'
import { profileName } from '../lib/profileName'

const baseTabs = [
  { to: '/', label: 'Dashboard', icon: '▦' },
  { to: '/bids', label: 'Bids', icon: '▤' },
  { to: '/jobs', label: 'Jobs', icon: '▬' },
  { to: '/schedule', label: 'Schedule', icon: '▦' },
  { to: '/time', label: 'Time', icon: '◔' },
  { to: '/receipts', label: 'Receipts', icon: '▤' },
  { to: '/contractors', label: 'Contractors', icon: '▧' },
  { to: '/libraries', label: 'Libraries', icon: '▥' },
]
const adminTabs = [
  ...baseTabs,
  { to: '/reports', label: 'Reports', icon: '▣' },
  { to: '/settings', label: 'Settings', icon: '▨' },
  { to: '/team', label: 'Team', icon: '▩' },
]

const pageTitles: Record<string, string> = {
  '/': 'Dashboard',
  '/bids': 'Your bids',
  '/jobs': 'Jobs',
  '/schedule': 'Production schedule',
  '/time': 'Time',
  '/receipts': 'Receipts',
  '/contractors': 'Contractors & clients',
  '/libraries': 'Libraries',
  '/libraries/hardware': 'Libraries',
  '/libraries/finishes': 'Libraries',
  '/libraries/assemblies': 'Libraries',
  '/reports': 'Reports',
  '/settings': 'Settings',
  '/team': 'Team',
  '/account': 'My profile',
}

export default function Layout() {
  const { session, profile, isAdmin, isOffice, realRole, viewAs, setViewAs } = useAuth()
  // office never touches the pricing libraries
  const tabs = (isAdmin ? adminTabs : baseTabs).filter((t) => !(isOffice && t.to === '/libraries'))
  const { pathname } = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const accountArea = useRef<HTMLDivElement>(null)
  const accountButton = useRef<HTMLButtonElement>(null)
  useEffect(() => { setAccountOpen(false) }, [pathname])
  useEffect(() => {
    if (!accountOpen) return
    function dismiss(event: PointerEvent) {
      if (!accountArea.current?.contains(event.target as Node)) setAccountOpen(false)
    }
    document.addEventListener('pointerdown', dismiss)
    return () => document.removeEventListener('pointerdown', dismiss)
  }, [accountOpen])
  const drawer = useRef<HTMLElement>(null)
  const menuButton = useRef<HTMLButtonElement>(null)
  const wasDrawerOpen = useRef(false)
  useEffect(() => {
    if (menuOpen) {
      drawer.current?.querySelector<HTMLElement>('a[aria-current="page"], button')?.focus()
    } else if (wasDrawerOpen.current) {
      menuButton.current?.focus()
    }
    wasDrawerOpen.current = menuOpen
  }, [menuOpen])
  function handleDrawerKey(event: KeyboardEvent<HTMLElement>) {
    if (!menuOpen) return
    if (event.key === 'Escape') {
      event.preventDefault()
      setMenuOpen(false)
    } else if (event.key === 'Tab') {
      const controls = Array.from(drawer.current?.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), select:not(:disabled)') ?? []).filter(control => control.getClientRects().length > 0)
      if (!controls?.length) return
      const first = controls[0], last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
  }
  // the plan room wants every pixel of a big monitor
  const fullWidth = pathname.endsWith('/plans/room')

  // phone tab strip: keep the active tab in view
  const tabStrip = useRef<HTMLElement>(null)
  useEffect(() => {
    tabStrip.current?.querySelector('a[aria-current="page"]')?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [pathname])

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

  const groups = [
    { label: 'Estimating', routes: ['/', '/bids'] },
    { label: 'Project delivery', routes: ['/jobs', '/schedule', '/time', '/receipts'] },
    { label: 'Company', routes: ['/contractors', '/libraries', '/reports', '/team', '/settings'] },
  ]
  const currentPage = tabs.find(t => t.to === '/' ? pathname === '/' : pathname.startsWith(t.to))?.label ?? 'Project workspace'
  const pageTitle = pageTitles[pathname.replace(/\/$/, '') || '/']
  const accountName = profile ? profileName(profile) : session?.user.email ?? 'My profile'
  const initials = [profile?.first_name?.[0], profile?.last_name?.[0]].filter(Boolean).join('').toUpperCase() || accountName[0]?.toUpperCase()

  return (
    <div className={`zaid-app workspace-shell min-h-screen bg-slate-100 print:bg-white ${pageTitle ? 'workspace-title-in-header' : ''} ${dark ? 'dark' : ''} ${menuOpen ? 'workspace-menu-open' : ''} ${fullWidth ? 'workspace-plan-room' : ''}`}>
      {menuOpen && <button className="workspace-backdrop print:hidden" tabIndex={-1} aria-label="Close workspace navigation" onClick={() => setMenuOpen(false)} />}
      <aside id="workspace-navigation" ref={drawer} role={menuOpen ? 'dialog' : undefined} aria-modal={menuOpen || undefined} onKeyDown={handleDrawerKey} className="workspace-sidebar print:hidden" aria-label="Workspace navigation">
        <button className="workspace-drawer-close" aria-label="Close workspace navigation" onClick={() => setMenuOpen(false)}>Close</button>
        <NavLink to="/" title="Dashboard" className="workspace-brand" onClick={() => setMenuOpen(false)}>
          {logoOk && LOGO_URL ? <img src={LOGO_URL} alt={companyName || 'Company logo'} onError={() => setLogoOk(false)} /> : <span>{companyName}</span>}
        </NavLink>
        <nav ref={tabStrip} aria-label="Workspace pages">
          {groups.map(group => {
            const visible = tabs.filter(t => group.routes.includes(t.to))
            return visible.length > 0 && <section key={group.label} aria-label={group.label}>
              <h2>{group.label}</h2>
              {visible.map(t => <NavLink key={t.to} to={t.to} end={t.to === '/'} className={linkClass} onClick={() => setMenuOpen(false)}><UiIcon name={t.to === '/schedule' ? 'calendar' : t.to === '/time' ? 'clock' : t.to === '/team' || t.to === '/contractors' ? 'people' : t.to === '/settings' ? 'settings' : t.to === '/' ? 'dashboard' : t.to === '/libraries' ? 'folder' : 'register'} /><span>{t.label}</span></NavLink>)}
            </section>
          })}
        </nav>
        <div ref={accountArea} className="workspace-account" onKeyDown={event => {
          if (event.key === 'Escape' && accountOpen) {
            event.preventDefault()
            event.stopPropagation()
            setAccountOpen(false)
            accountButton.current?.focus()
          }
        }}>
          {accountOpen && <div id="workspace-account-options" className="workspace-account-options" aria-label="Account options">
            <NavLink to="/account" onClick={() => setMenuOpen(false)}>My profile</NavLink>
            <button onClick={toggleTheme}><UiIcon name="contrast" />{dark ? 'Switch to light mode' : 'Switch to dark mode'}</button>
            <button onClick={() => void signOut()}>Sign out</button>
          </div>}
          <NavLink to="/account" className="workspace-account-identity" title="My profile" onClick={() => setMenuOpen(false)}>
            <span className="workspace-account-avatar" aria-hidden="true">{initials}</span>
            <span className="workspace-account-name"><strong>{accountName}</strong><small>{realRole}</small></span>
          </NavLink>
          <button ref={accountButton} className="workspace-account-toggle" aria-label="Account options" aria-expanded={accountOpen} aria-controls="workspace-account-options" onClick={() => setAccountOpen(!accountOpen)}><UiIcon name="gear" /></button>
        </div>
      </aside>
      <header inert={menuOpen} className="zaid-header workspace-context sticky top-0 z-20 bg-white print:hidden">
        <div className="workspace-context-inner">
          <button ref={menuButton} className={`workspace-menu-button ${fullWidth ? 'workspace-menu-always' : ''}`} aria-label={menuOpen ? 'Close workspace navigation' : 'Open workspace navigation'} aria-expanded={menuOpen} aria-controls="workspace-navigation" onClick={() => setMenuOpen(!menuOpen)}><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg></button>
          <div className="workspace-context-label">{pageTitle ? <h1 className="workspace-page-title">{pageTitle}</h1> : <span>{currentPage}</span>}</div>
          <div className="zaid-header-tools ml-auto flex items-center gap-3">
            {realRole === 'admin' && (
              <label className="flex items-center gap-1.5" title="Preview the app as another role (screen only — you keep your admin powers)">
                <span className="hidden font-mono text-[10px] uppercase tracking-wider text-slate-400 sm:inline">view as</span>
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
                  <option value="office">office</option>
                  <option value="viewer">viewer</option>
                  <option value="shop">shop</option>
                </select>
              </label>
            )}
          </div>
        </div>
      </header>
      <main inert={menuOpen} className={`zaid-main workspace-main mx-auto px-4 py-6 ${fullWidth ? 'max-w-none' : 'max-w-6xl'}`}>
        <Outlet />
      </main>
    </div>
  )
}
