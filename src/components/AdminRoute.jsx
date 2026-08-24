import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { ShieldX } from 'lucide-react'

export default function AdminRoute({ children }) {
  const { profile } = useAuthStore()
  const navigate = useNavigate()

  if (profile?.role !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white px-4">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 bg-[#FDEDEE] rounded-full flex items-center justify-center mx-auto mb-4">
            <ShieldX className="w-8 h-8 text-[#D62839]" />
          </div>
          <h1 className="text-xl font-bold text-[#1F2937] mb-2">Akses Ditolak</h1>
          <p className="text-[#6B7280] text-sm mb-6">
            Halaman ini hanya bisa diakses oleh Administrator.
          </p>
          <button
            onClick={() => navigate('/', { replace: true })}
            className="bg-[#D62839] hover:bg-[#B71C2B] text-white px-6 py-2.5 rounded-xl font-semibold text-sm transition-colors"
          >
            Kembali ke Beranda
          </button>
        </div>
      </div>
    )
  }

  return children
}
