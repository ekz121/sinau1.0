import { NavLink } from 'react-router-dom'
import { Home, Upload, Wallet, User, BarChart2, BookOpen, Coins, LogOut, History } from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import NotificationBell from './NotificationBell'

const navItems = [
  { to: '/', icon: Home, label: 'Jelajahi', exact: true },
  { to: '/upload', icon: Upload, label: 'Upload Video' },
  { to: '/studio', icon: BarChart2, label: 'Studio Kreator' },
  { to: '/riwayat', icon: History, label: 'Riwayat Tontonan' },
  { to: '/wallet', icon: Wallet, label: 'Wallet' },
  { to: '/profil', icon: User, label: 'Profil' },
]

export default function Sidebar() {
  const { profile, logout } = useAuthStore()

  return (
    <aside className="hidden md:flex flex-col w-60 min-h-screen bg-white/90 backdrop-blur-xl border-r border-white fixed left-0 top-0 bottom-0 z-40 shadow-[8px_0_40px_rgba(31,41,55,0.05)]">
      {/* Logo */}
      <div className="px-5 h-14 flex items-center border-b border-[#F1D4D6]">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-br from-[#D62839] to-[#4F46E5] rounded-xl flex items-center justify-center shadow-md shadow-[#D62839]/20">
            <BookOpen size={16} className="text-white" />
          </div>
          <span className="font-extrabold text-[#D62839] text-lg tracking-tight">Sinau</span>
        </div>
      </div>

      {/* User info */}
      {profile && (
        <div className="px-4 py-4 border-b border-[#F1D4D6]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#D62839] to-[#B71C2B] flex items-center justify-center flex-shrink-0">
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
              ) : (
                <span className="text-white font-bold text-sm">
                  {(profile.nama || 'U')[0].toUpperCase()}
                </span>
              )}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-[#1F2937] text-sm truncate">{profile.nama || 'Mahasiswa'}</p>
              <p className="text-[#6B7280] text-xs truncate">{profile.jurusan || ''}</p>
            </div>
          </div>
          {/* Balance + Notif */}
          <div className="mt-3 flex items-center gap-2">
            <div className="flex-1 bg-[#FFF8E1] border border-[#FDE68A] rounded-xl px-3 py-2 flex items-center gap-2">
              <Coins size={14} className="text-[#F59E0B] flex-shrink-0" />
              <span className="text-[#B45309] text-sm font-semibold">{profile.saldo_koin ?? 0} koin</span>
            </div>
            <NotificationBell align="left" />
          </div>
        </div>
      )}

      {/* Nav links */}
      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
        {navItems.map(({ to, icon: Icon, label, exact }) => (
          <NavLink
            key={to}
            to={to}
            end={exact}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                isActive
                  ? 'bg-gradient-to-r from-[#FDEDEE] to-[#EEF2FF] text-[#D62839] shadow-sm'
                  : 'text-[#6B7280] hover:bg-[#F8FAFC] hover:text-[#1F2937]'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon size={18} strokeWidth={isActive ? 2.5 : 1.8} />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Logout */}
      <div className="px-3 pb-5">
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-[#6B7280] hover:bg-[#FDEDEE] hover:text-[#D62839] transition-all"
        >
          <LogOut size={18} />
          Keluar
        </button>
      </div>
    </aside>
  )
}
