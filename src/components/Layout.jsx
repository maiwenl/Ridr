import { NavLink, Outlet } from 'react-router-dom'
import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useSaison } from '../contexts/SaisonContext'

// ── Icônes SVG ───────────────────────────────────────────────────────────────
function Icon({ d, d2, className = 'w-5 h-5' }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
         strokeWidth={1.6} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
      {d2 && <path strokeLinecap="round" strokeLinejoin="round" d={d2} />}
    </svg>
  )
}

const ICONS = {
  adhesions:    "M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z",
  cours:        "M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5",
  pointage:     "M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  utilisateurs: "M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z",
  parametres:   "M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 0 1 1.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.559.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.894.149c-.424.07-.764.383-.929.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 0 1-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.398.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 0 1-.12-1.45l.527-.737c.25-.35.272-.806.108-1.204-.165-.397-.506-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.108-1.204l-.526-.738a1.125 1.125 0 0 1 .12-1.45l.773-.773a1.125 1.125 0 0 1 1.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894Z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  logout:       "M8.25 9V5.25A2.25 2.25 0 0 1 10.5 3h6a2.25 2.25 0 0 1 2.25 2.25v13.5A2.25 2.25 0 0 1 16.5 21h-6a2.25 2.25 0 0 1-2.25-2.25V15m-3 0-3-3m0 0 3-3m-3 3H15",
  link:         "M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25",
}

const NAV_BY_ROLE = {
  gérant: [
    { to: '/adhesions',    label: 'Adhérents',   iconKey: 'adhesions' },
    { to: '/cours',        label: 'Cours',        iconKey: 'cours' },
    { to: '/pointage',     label: 'Pointage',     iconKey: 'pointage' },
    { to: '/utilisateurs', label: 'Utilisateurs', iconKey: 'utilisateurs' },
    { to: '/parametres',   label: 'Paramètres',   iconKey: 'parametres' },
  ],
  moniteur: [
    { to: '/pointage', label: 'Pointage', iconKey: 'pointage' },
  ],
  visiteur: [
    { to: '/adhesions', label: 'Adhérents', iconKey: 'adhesions' },
    { to: '/cours',     label: 'Cours',     iconKey: 'cours' },
  ],
}

function CollapsedTooltip({ children }) {
  return (
    <span className="pointer-events-none absolute left-full ml-3 z-50 opacity-0 group-hover:opacity-100 transition-opacity duration-150 whitespace-nowrap bg-slate-800 text-white text-xs font-medium px-2.5 py-1.5 rounded-lg shadow-lg border border-white/10">
      {children}
    </span>
  )
}

function SaisonSelect({ saisons, saisonCourante, choisirSaison, mobile = false }) {
  if (!saisons.length) {
    return <p className={`text-xs ${mobile ? 'text-white/60' : 'text-slate-500'}`}>Aucune saison</p>
  }
  return (
    <select
      value={saisonCourante?.id ?? ''}
      onChange={e => {
        const s = saisons.find(x => x.id === e.target.value)
        if (s) choisirSaison(s)
      }}
      className={`text-xs font-medium rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-400 cursor-pointer border appearance-none
        ${mobile
          ? 'bg-white/15 text-white border-white/25 max-w-[140px]'
          : 'bg-slate-800 text-slate-200 border-slate-700 w-full hover:bg-slate-700 transition-colors'
        }`}
    >
      {saisons.map(s => (
        <option key={s.id} value={s.id} className="bg-slate-800 text-white">
          {s.libelle}{s.active ? ' ✦' : ''}
        </option>
      ))}
    </select>
  )
}

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center shrink-0">
        <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" fill="white" stroke="none" opacity="0.15"/>
          <path d="M7 17c0-2.5 3-5 5-7 2 2 5 4.5 5 7" />
          <path d="M9 11c0-1.5 1.5-3 3-4 1.5 1 3 2.5 3 4" />
          <circle cx="12" cy="7" r="1.5" fill="white" stroke="none"/>
        </svg>
      </div>
      <span className="font-bold text-base tracking-tight text-white">Ridr</span>
    </div>
  )
}

function UserAvatar({ prenom, nom }) {
  const initials = `${prenom?.[0] ?? ''}${nom?.[0] ?? ''}`.toUpperCase()
  return (
    <div className="w-8 h-8 rounded-full bg-brand-500/30 border border-brand-400/30 flex items-center justify-center shrink-0">
      <span className="text-xs font-semibold text-brand-200">{initials}</span>
    </div>
  )
}

export default function Layout() {
  const { profile, signOut } = useAuth()
  const { saisons, saisonCourante, choisirSaison } = useSaison()
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('sidebar-collapsed') === 'true'
  )

  function toggleSidebar() {
    setCollapsed(v => {
      localStorage.setItem('sidebar-collapsed', String(!v))
      return !v
    })
  }

  const role     = profile?.role ?? 'visiteur'
  const navItems = NAV_BY_ROLE[role] ?? NAV_BY_ROLE.visiteur

  return (
    <div className="h-screen flex flex-col md:flex-row bg-gray-50 overflow-hidden">

      {/* ── Sidebar desktop ─────────────────────────────────────────────────── */}
      <aside className={`hidden md:flex flex-col shrink-0 bg-slate-900 shadow-sidebar transition-all duration-300 ease-in-out h-screen ${collapsed ? 'w-[68px]' : 'w-60'}`}>

        {/* Logo + toggle */}
        <div className={`flex items-center h-[64px] shrink-0 ${collapsed ? 'justify-center px-0' : 'justify-between px-4'}`}>
          {!collapsed && <Logo />}
          <button
            onClick={toggleSidebar}
            title={collapsed ? 'Déplier le menu' : 'Réduire le menu'}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-all duration-150 shrink-0"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
              {collapsed
                ? <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                : <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
              }
            </svg>
          </button>
        </div>

        {/* Saison select (expanded only) */}
        {!collapsed && (
          <div className="px-4 pb-3">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 px-1">
              Saison active
            </p>
            <SaisonSelect saisons={saisons} saisonCourante={saisonCourante} choisirSaison={choisirSaison} />
          </div>
        )}

        {/* Saison icon (collapsed) */}
        {collapsed && saisons.length > 0 && (
          <div className="px-2.5 pb-2.5">
            <div className="group relative flex items-center justify-center">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-slate-800 border border-slate-700/60">
                <span className="text-[10px] font-bold text-slate-300 leading-none text-center">
                  {saisonCourante?.libelle?.slice(-4) ?? '—'}
                </span>
              </div>
              <CollapsedTooltip>{saisonCourante?.libelle ?? 'Aucune saison'}</CollapsedTooltip>
            </div>
          </div>
        )}

        {/* Nav */}
        <nav className={`flex-1 py-2 overflow-y-auto overflow-x-hidden space-y-0.5 ${collapsed ? 'px-2' : 'px-3'}`}>
          {navItems.map(({ to, label, iconKey }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `group relative flex items-center rounded-lg transition-all duration-150 ${
                  collapsed ? 'justify-center w-10 h-10 mx-auto' : 'gap-3 px-3 py-2.5'
                } text-sm font-medium ${
                  isActive
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    d={ICONS[iconKey]}
                    className={`w-[18px] h-[18px] shrink-0 transition-colors ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'}`}
                  />
                  {!collapsed && label}
                  {collapsed && <CollapsedTooltip>{label}</CollapsedTooltip>}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Footer sidebar */}
        <div className={`py-3 border-t border-white/[0.06] space-y-0.5 ${collapsed ? 'px-2' : 'px-3'}`}>
          {profile && (
            <div className={`flex items-center mb-1 ${collapsed ? 'justify-center py-2' : 'gap-3 px-3 py-2.5'}`}>
              {collapsed ? (
                <div className="group relative">
                  <UserAvatar prenom={profile.prenom} nom={profile.nom} />
                  <CollapsedTooltip>{profile.prenom} {profile.nom} · <span className="capitalize">{profile.role}</span></CollapsedTooltip>
                </div>
              ) : (
                <>
                  <UserAvatar prenom={profile.prenom} nom={profile.nom} />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate leading-tight">
                      {profile.prenom} {profile.nom}
                    </p>
                    <p className="text-xs text-slate-300 capitalize mt-0.5">{profile.role}</p>
                  </div>
                </>
              )}
            </div>
          )}

          {role === 'gérant' && (
            <a
              href={`${import.meta.env.BASE_URL}inscription`}
              target="_blank"
              rel="noopener noreferrer"
              className={`group relative flex items-center rounded-lg text-sm text-slate-300 hover:text-white hover:bg-slate-700 transition-all duration-150 ${
                collapsed ? 'justify-center w-10 h-10 mx-auto' : 'gap-3 px-3 py-2.5'
              }`}
            >
              <Icon d={ICONS.link} className="w-[18px] h-[18px] shrink-0 text-slate-400 group-hover:text-slate-200" />
              {!collapsed && 'Lien pré-inscription'}
              {collapsed && <CollapsedTooltip>Lien pré-inscription</CollapsedTooltip>}
            </a>
          )}

          <button
            onClick={signOut}
            className={`group relative flex items-center rounded-lg text-sm text-slate-300 hover:text-red-300 hover:bg-red-500/10 transition-all duration-150 ${
              collapsed ? 'justify-center w-10 h-10 mx-auto' : 'w-full gap-3 px-3 py-2.5'
            }`}
          >
            <Icon d={ICONS.logout} className="w-[18px] h-[18px] shrink-0" />
            {!collapsed && 'Se déconnecter'}
            {collapsed && <CollapsedTooltip>Se déconnecter</CollapsedTooltip>}
          </button>
        </div>
      </aside>

      {/* ── Layout principal ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Top bar mobile */}
        <header className="md:hidden bg-slate-900 px-4 py-3 flex items-center justify-between gap-3 sticky top-0 z-30">
          <Logo />
          <SaisonSelect saisons={saisons} saisonCourante={saisonCourante} choisirSaison={choisirSaison} mobile />
        </header>

        {/* Contenu */}
        <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
          <Outlet />
        </main>
      </div>

      {/* ── Bottom nav mobile ────────────────────────────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-slate-900/95 backdrop-blur-md border-t border-white/10">
        <div className="flex h-16">
          {navItems.map(({ to, label, iconKey }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center justify-center gap-1 text-[10px] font-medium transition-all duration-150 ${
                  isActive ? 'text-brand-400' : 'text-slate-500 active:text-slate-300'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon d={ICONS[iconKey]} className={`w-5 h-5 transition-transform ${isActive ? 'scale-110' : ''}`} />
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          ))}
          <button
            onClick={signOut}
            className="flex-1 flex flex-col items-center justify-center gap-1 text-[10px] font-medium text-slate-500 active:text-red-400 transition-colors"
          >
            <Icon d={ICONS.logout} className="w-5 h-5" />
            <span>Quitter</span>
          </button>
        </div>
      </nav>
    </div>
  )
}
