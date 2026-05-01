import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useSaison } from '../contexts/SaisonContext'

const NAV_BY_ROLE = {
  gérant:   [
    { to: '/adhesions',    label: 'Adhérents',    icon: '👤' },
    { to: '/cours',        label: 'Cours',         icon: '🐴' },
    { to: '/pointage',     label: 'Pointage',      icon: '✓' },
    { to: '/utilisateurs', label: 'Utilisateurs',  icon: '👥' },
    { to: '/parametres',   label: 'Paramètres',    icon: '⚙' },
  ],
  moniteur: [
    { to: '/pointage', label: 'Pointage', icon: '✓' },
  ],
  visiteur: [
    { to: '/adhesions', label: 'Adhérents', icon: '👤' },
    { to: '/cours',     label: 'Cours',     icon: '🐴' },
  ],
}

export default function Layout() {
  const { profile, signOut } = useAuth()
  const { saisons, saisonCourante, choisirSaison } = useSaison()

  const role     = profile?.role ?? 'visiteur'
  const navItems = NAV_BY_ROLE[role] ?? NAV_BY_ROLE.visiteur

  return (
    <div className="min-h-screen flex flex-col md:flex-row">

      {/* ── Sidebar desktop (md+) ── */}
      <aside className="hidden md:flex w-56 bg-brand-700 text-white flex-col shrink-0">
        <div className="px-4 py-5 border-b border-brand-600 space-y-2">
          <span className="font-bold text-lg tracking-tight block">StableConnect</span>

          {/* Sélecteur de saison */}
          {saisons.length > 0 ? (
            <select
              value={saisonCourante?.id ?? ''}
              onChange={e => {
                const s = saisons.find(x => x.id === e.target.value)
                if (s) choisirSaison(s)
              }}
              className="w-full text-xs bg-brand-800 text-brand-100 border border-brand-600 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-400 cursor-pointer"
            >
              {saisons.map(s => (
                <option key={s.id} value={s.id}>
                  {s.libelle}{s.active ? ' ✦' : ''}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-brand-300 text-xs">Aucune saison</p>
          )}
        </div>

        <nav className="flex-1 py-4 space-y-1 px-3">
          {navItems.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-brand-500 text-white'
                    : 'text-brand-100 hover:bg-brand-600 hover:text-white'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="px-3 py-4 border-t border-brand-600 space-y-1">
          {profile && (
            <div className="px-3 py-2">
              <p className="text-xs font-semibold text-white truncate">
                {profile.prenom} {profile.nom}
              </p>
              <p className="text-xs text-brand-300 capitalize">{profile.role}</p>
            </div>
          )}
          <button
            onClick={signOut}
            className="w-full text-left px-3 py-2 rounded-md text-sm text-brand-200 hover:bg-brand-600 hover:text-white transition-colors"
          >
            Se déconnecter
          </button>
        </div>
      </aside>

      {/* ── Contenu principal ── */}
      <main className="flex-1 overflow-auto pb-20 md:pb-0">
        {/* Bandeau saison mobile */}
        <div className="md:hidden bg-brand-700 text-white px-4 py-2 flex items-center justify-between gap-3">
          <span className="text-xs font-bold tracking-tight">StableConnect</span>
          {saisons.length > 0 && (
            <select
              value={saisonCourante?.id ?? ''}
              onChange={e => {
                const s = saisons.find(x => x.id === e.target.value)
                if (s) choisirSaison(s)
              }}
              className="text-xs bg-brand-800 text-brand-100 border border-brand-600 rounded-lg px-2 py-1 focus:outline-none cursor-pointer"
            >
              {saisons.map(s => (
                <option key={s.id} value={s.id}>
                  {s.libelle}{s.active ? ' ✦' : ''}
                </option>
              ))}
            </select>
          )}
        </div>
        <Outlet />
      </main>

      {/* ── Bottom nav mobile (< md) ── */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 z-50">
        <div className="flex">
          {navItems.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center justify-center py-2.5 text-xs font-medium transition-colors ${
                  isActive
                    ? 'text-brand-600'
                    : 'text-gray-400'
                }`
              }
            >
              <span className="text-lg leading-none mb-0.5">{icon}</span>
              <span>{label}</span>
            </NavLink>
          ))}
          <button
            onClick={signOut}
            className="flex-1 flex flex-col items-center justify-center py-2.5 text-xs font-medium text-gray-400"
          >
            <span className="text-lg leading-none mb-0.5">↩</span>
            <span>Quitter</span>
          </button>
        </div>
      </nav>
    </div>
  )
}
