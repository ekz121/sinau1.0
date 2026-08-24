import { useState, useEffect } from 'react'
import { Outlet, NavLink } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { supabase } from '../lib/supabase'
import { Film, Video, Users, CreditCard, Flag, BookOpen, LogOut, LayoutDashboard, Settings } from 'lucide-react'
import NotificationBell from '../components/NotificationBell'

const adminNav = [
  { to: '/admin', icon: LayoutDashboard, label: 'Dashboard', exact: true },
  { to: '/admin/review', icon: Film, label: 'Antrian Review' },
  { to: '/admin/videos', icon: Video, label: 'Semua Video' },
  { to: '/admin/users', icon: Users, label: 'Manajemen User' },
  { to: '/admin/transaksi', icon: CreditCard, label: 'Transaksi' },
  { to: '/admin/laporan', icon: Flag, label: 'Laporan' },
  { to: '/admin/pengaturan', icon: Settings, label: 'Pengaturan' },
]

export default function AdminLayout() {
  const { profile, logout } = useAuthStore()
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    // Initial fetch
    const fetchPending = async () => {
      const { count } = await supabase
        .from('videos')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending')
        .eq('is_deleted', false)
      setPendingCount(count ?? 0)
    }
    fetchPending()

    // Realtime subscription for pending videos
    const channel = supabase
      .channel('admin-sidebar-pending-videos')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'videos' }, () => {
        fetchPending()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  return (
    <div className="min-h-screen bg-[#FAFAFA] flex">
      {/* Admin Sidebar */}
      <aside className="w-60 bg-[#1F2937] min-h-screen fixed left-0 top-0 bottom-0 z-40 flex flex-col">
        {/* Logo */}
        <div className="px-5 h-14 flex items-center gap-2 border-b border-white/10">
          <div className="w-7 h-7 bg-[#D62839] rounded-lg flex items-center justify-center">
            <BookOpen size={14} className="text-white" />
          </div>
          <span className="font-extrabold text-white text-base tracking-tight">Sinau</span>
          <span className="ml-auto bg-[#D62839] text-white text-[10px] font-bold px-2 py-0.5 rounded-full">ADMIN</span>
        </div>

        {/* Admin info */}
        <div className="px-4 py-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 bg-[#D62839] rounded-full flex items-center justify-center">
              <span className="text-white font-bold text-sm">
                {(profile?.nama || 'A')[0].toUpperCase()}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-white text-sm font-semibold truncate">{profile?.nama || 'Admin'}</p>
              <p className="text-white/50 text-xs">Administrator</p>
            </div>
            <NotificationBell align="left" />
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-3 space-y-0.5">
          {adminNav.map(({ to, icon: Icon, label, exact }) => (
            <NavLink
              key={to}
              to={to}
              end={exact}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-[#D62839] text-white'
                    : 'text-white/60 hover:bg-white/10 hover:text-white'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={17} strokeWidth={isActive ? 2.5 : 1.8} />
                  <span className="flex-1">{label}</span>
                  {to === '/admin/review' && pendingCount > 0 && (
                    <span className="bg-[#D62839] text-white text-xs font-bold px-2 py-0.5 rounded-full">
                      {pendingCount > 99 ? '99+' : pendingCount}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="px-3 pb-5">
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-white/60 hover:bg-[#D62839] hover:text-white transition-all"
          >
            <LogOut size={17} />
            Keluar
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 ml-60 p-6 min-h-screen">
        <div className="max-w-5xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
