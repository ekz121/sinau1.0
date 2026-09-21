import { Link } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { BookOpen, Coins } from 'lucide-react'
import NotificationBell from './NotificationBell'

export default function Navbar() {
  const { profile } = useAuthStore()

  return (
    <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-white shadow-[0_8px_30px_rgba(31,41,55,0.05)]">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-2 flex-shrink-0">
          <div className="w-8 h-8 bg-gradient-to-br from-[#D62839] to-[#4F46E5] rounded-xl flex items-center justify-center shadow-md shadow-[#D62839]/20">
            <BookOpen size={16} className="text-white" />
          </div>
          <span className="font-extrabold text-[#D62839] text-lg tracking-tight">Sinau</span>
        </Link>

        <div className="flex items-center gap-2">
          {profile && (
            <Link to="/wallet"
              className="hidden md:flex items-center gap-1.5 bg-[#FFF8E1] border border-[#FDE68A] text-[#B45309] px-3 py-1.5 rounded-full text-sm font-semibold hover:bg-[#FEF3C7] transition-colors">
              <Coins size={14} className="text-[#F59E0B]" />
              {profile.saldo_koin ?? 0} koin
            </Link>
          )}
          <NotificationBell />
        </div>
      </div>
    </header>
  )
}
