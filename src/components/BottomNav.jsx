import { NavLink } from 'react-router-dom'
import { Home, Search, Plus, Wallet, User } from 'lucide-react'

const navItems = [
  { to: '/', icon: Home, label: 'Beranda', exact: true },
  { to: '/?search=1', icon: Search, label: 'Cari', exact: false },
  { to: '/upload', icon: Plus, label: 'Upload', isUpload: true },
  { to: '/wallet', icon: Wallet, label: 'Wallet' },
  { to: '/profil', icon: User, label: 'Profil' },
]

export default function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/85 backdrop-blur-xl border-t border-white shadow-[0_-10px_30px_rgba(31,41,55,0.08)] md:hidden safe-area-pb">
      <div className="flex items-center justify-around h-16 px-2">
        {navItems.map(({ to, icon: Icon, label, isUpload, exact }) => {
          if (isUpload) {
            return (
              <NavLink key={to} to={to} className="flex flex-col items-center gap-0.5 flex-1">
                <div className="w-11 h-11 bg-gradient-to-br from-[#D62839] to-[#4F46E5] rounded-2xl rotate-3 flex items-center justify-center shadow-lg shadow-[#D62839]/30 -mt-4">
                  <Icon size={22} className="text-white" strokeWidth={2.5} />
                </div>
                <span className="text-[9px] text-[#D62839] font-semibold mt-0.5">{label}</span>
              </NavLink>
            )
          }
          return (
            <NavLink
              key={to}
              to={to}
              end={exact}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 flex-1 py-1 rounded-xl transition-colors ${
                  isActive ? 'text-[#D62839]' : 'text-[#6B7280]'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={20} strokeWidth={isActive ? 2.5 : 1.8} />
                  <span className={`text-[9px] font-medium ${isActive ? 'text-[#D62839] font-semibold' : ''}`}>
                    {label}
                  </span>
                </>
              )}
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}
