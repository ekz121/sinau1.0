import { useAuthStore } from '../stores/authStore'
import { AlertTriangle, LogOut } from 'lucide-react'

export default function SuspendedScreen() {
  const logout = useAuthStore((s) => s.logout)

  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-4">
      <div className="text-center max-w-sm fade-in">
        <div className="w-20 h-20 bg-[#FEE2E2] rounded-full flex items-center justify-center mx-auto mb-6">
          <AlertTriangle className="w-10 h-10 text-[#DC2626]" />
        </div>
        <h1 className="text-2xl font-bold text-[#1F2937] mb-3">Akun Dinonaktifkan</h1>
        <p className="text-[#6B7280] text-sm leading-relaxed mb-8">
          Akun kamu telah dinonaktifkan oleh administrator. Jika kamu merasa ini adalah kesalahan,
          silakan hubungi tim Sinau.
        </p>
        <button
          onClick={logout}
          className="flex items-center gap-2 bg-[#1F2937] hover:bg-[#111827] text-white px-6 py-3 rounded-xl font-semibold text-sm transition-colors mx-auto"
        >
          <LogOut className="w-4 h-4" />
          Keluar dari Akun
        </button>
      </div>
    </div>
  )
}
