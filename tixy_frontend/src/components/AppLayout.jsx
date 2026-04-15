import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

const NAV = {
  admin:   [
    { to: '/admin',    label: 'Administración',  icon: '⚙' },
    { to: '/pedido',   label: 'Orden de Pedido', icon: '📋' },
    { to: '/gerencia', label: 'Gerencia',         icon: '📊' },
  ],
  manager: [
    { to: '/gerencia', label: 'Gerencia', icon: '📊' },
  ],
  vendor:  [
    { to: '/pedido', label: 'Orden de Pedido', icon: '📋' },
  ],
}

export default function AppLayout() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login')
  }

  const links = NAV[user?.role] || []

  return (
    <div className="flex flex-col min-h-screen">

      {/* Topbar */}
      <header className="sticky top-0 z-50 h-16 flex items-center px-8
                          border-b border-pink/25
                          bg-gradient-to-r from-[#1a0d14] via-[#2e0d1e] to-[#1a0d14]">
        <div className="flex items-center gap-3.5">
          <span className="font-script text-[38px] leading-none"
            style={{
              background: 'linear-gradient(135deg,#f5c0d8 0%,#e8a0c0 30%,#d4608c 60%,#c9907a 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.4))',
            }}>
            Tixy
          </span>
          <div className="flex flex-col border-l border-pink/30 pl-3.5 gap-px">
            <span className="text-[10px] tracking-[4px] text-white/35 font-light uppercase">Glamour</span>
            <span className="text-[11px] tracking-[1.5px] text-white/50 font-light uppercase">Sistema de Pedidos</span>
          </div>
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-3">
          <span className="text-xs text-white/40 hidden sm:block">
            {user?.full_name}
            <span className="ml-2 px-2 py-0.5 rounded-full bg-pink/20 text-pink-mid text-[10px] uppercase tracking-wider">
              {user?.role}
            </span>
          </span>
          <button
            onClick={handleLogout}
            className="text-xs text-white/30 hover:text-white/60 transition-colors px-3 py-1.5
                       border border-white/10 rounded-lg hover:border-white/20">
            Salir
          </button>
        </div>
      </header>

      {/* Tab nav */}
      {links.length > 1 && (
        <nav className="bg-white border-b border-line px-8 flex gap-1">
          {links.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-2 px-5 py-3.5 text-[13px] font-medium
                 border-b-2 transition-colors duration-150
                 ${isActive
                   ? 'text-pink-dark border-pink'
                   : 'text-ink-3 border-transparent hover:text-ink-2'}`
              }>
              <span>{icon}</span> {label}
            </NavLink>
          ))}
        </nav>
      )}

      {/* Content */}
      <main className="flex-1 px-8 py-7 max-w-5xl w-full mx-auto">
        <Outlet />
      </main>
    </div>
  )
}
