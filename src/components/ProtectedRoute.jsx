import { useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import SuspendedScreen from './SuspendedScreen'

export default function ProtectedRoute({ children }) {
  const { user, profile, loading, initialized } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    if (!initialized || loading) return
    if (!user) {
      // Admin login page is separate, don't redirect from there
      const isAdminLogin = location.pathname === '/admin/login'
      if (!isAdminLogin) navigate('/login', { replace: true })
      return
    }
    if (profile?.role === 'admin' && !location.pathname.startsWith('/admin')) {
      navigate('/admin', { replace: true })
    }
  }, [initialized, loading, user, profile?.role, location.pathname, navigate])

  if (!initialized || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full border-4 border-[#F1D4D6] border-t-[#D62839] animate-spin" />
          <p className="text-[#6B7280] text-sm font-medium">Memuat...</p>
        </div>
      </div>
    )
  }

  if (!user) return null
  if (profile?.is_suspended || profile?.is_deleted) return <SuspendedScreen />
  if (profile?.role === 'admin' && !location.pathname.startsWith('/admin')) return null

  return children
}
