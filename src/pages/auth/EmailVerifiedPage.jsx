import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { CheckCircle } from 'lucide-react'
import BrandLogo from '../../components/BrandLogo'

export default function EmailVerifiedPage() {
  const navigate = useNavigate()

  // Sign out any auto-session created by the verification link
  useEffect(() => {
    supabase.auth.signOut()
  }, [])

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-[#FDEDEE] to-[#F1D4D6] flex items-center justify-center px-4">
      <div className="w-full max-w-sm fade-in text-center">
        <BrandLogo size="lg" className="mx-auto mb-6" />
        <div className="w-16 h-16 bg-[#D1FAE5] rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-8 h-8 text-[#059669]" />
        </div>
        <h1 className="text-2xl font-extrabold text-[#1F2937] mb-2">Email Terverifikasi!</h1>
        <p className="text-[#6B7280] text-sm leading-relaxed mb-6">
          Akunmu sudah aktif. Silakan login untuk mulai belajar.
        </p>
        <button
          onClick={() => navigate('/login', { replace: true })}
          className="bg-[#D62839] hover:bg-[#B71C2B] text-white font-bold px-8 py-3 rounded-xl transition-colors"
        >
          Login Sekarang
        </button>
      </div>
    </div>
  )
}
