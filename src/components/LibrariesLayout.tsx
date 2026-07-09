import { NavLink, Outlet } from 'react-router-dom'

const subTabs = [
  { to: '/libraries', label: 'Materials' },
  { to: '/libraries/finishes', label: 'Finishes' },
  { to: '/libraries/assemblies', label: 'Assemblies' },
]

export default function LibrariesLayout() {
  return (
    <div className="space-y-4">
      <nav className="flex gap-1.5">
        {subTabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.to === '/libraries'}
            className={({ isActive }) =>
              `rounded-full border px-3.5 py-1.5 text-sm font-medium ${
                isActive
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-300 bg-white text-slate-600 hover:border-slate-500'
              }`
            }
          >
            {t.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  )
}
