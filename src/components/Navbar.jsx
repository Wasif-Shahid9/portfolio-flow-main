import { NavLink } from 'react-router-dom'

const links = [
  { to: '/dashboard',    label: 'Dashboard',     icon: '◈' },
  { to: '/trades',       label: 'Trades',         icon: '⚡' },
  { to: '/partners',     label: 'Partners',       icon: '👥' },
  { to: '/transactions', label: 'Transactions',   icon: '📋' },
]

export default function Navbar() {
  return (
    <nav className="bg-dark-800 border-b border-dark-600 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-accent-500 rounded-lg flex items-center justify-center text-white font-bold text-sm">
              ₿
            </div>
            <span className="font-bold text-gray-100 text-lg tracking-tight">ScalpBook</span>
          </div>

          {/* Nav Links */}
          <div className="flex items-center gap-1">
            {links.map(link => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-150 ${
                    isActive
                      ? 'bg-accent-500/20 text-accent-400'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-dark-600'
                  }`
                }
              >
                <span className="text-xs">{link.icon}</span>
                <span className="hidden sm:inline">{link.label}</span>
              </NavLink>
            ))}
          </div>
        </div>
      </div>
    </nav>
  )
}
