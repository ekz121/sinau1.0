import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'
import { BookOpen, Eye, EyeOff, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const { login } = useAuthStore()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!email || !password) return
    setLoading(true)
    try {
      await login(email, password)
      navigate('/', { replace: true })
    } catch (err) {
      toast.error(err.message?.includes('Invalid') ? 'Email atau password salah' : (err.message || 'Login gagal'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-[#FDEDEE] to-[#F1D4D6] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm fade-in">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-[#D62839] rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg shadow-[#D62839]/30">
            <BookOpen size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-extrabold text-[#1F2937]">Masuk ke Sinau</h1>
          <p className="text-[#6B7280] text-sm mt-1">Platform belajar video antar mahasiswa</p>
        </div>

        {/* Form */}
        <form
          className="bg-white rounded-2xl shadow-sm border border-[#F1D4D6] p-6 space-y-4"
          onSubmit={handleSubmit}
        >
          <div>
            <label className="block text-sm font-medium text-[#1F2937] mb-1.5">Email Kampus</label>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nama@kampus.ac.id"
              autoComplete="email"
              className="w-full px-4 py-3 bg-[#FAFAFA] border border-[#F1D4D6] rounded-xl text-sm text-[#1F2937] placeholder:text-[#6B7280] focus:outline-none focus:border-[#D62839] focus:bg-white transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[#1F2937] mb-1.5">Password</label>
            <div className="relative">
              <input
                id="login-password"
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Masukkan password"
                autoComplete="current-password"
                className="w-full px-4 py-3 pr-11 bg-[#FAFAFA] border border-[#F1D4D6] rounded-xl text-sm text-[#1F2937] placeholder:text-[#6B7280] focus:outline-none focus:border-[#D62839] focus:bg-white transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B7280] hover:text-[#D62839]"
              >
                {showPw ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </div>

          <div className="text-right">
            <Link to="/lupa-password" className="text-[#D62839] text-xs font-medium hover:underline">
              Lupa password?
            </Link>
          </div>

          <button
            id="btn-login"
            type="submit"
            disabled={loading || !email || !password}
            className="w-full flex items-center justify-center gap-2 bg-[#D62839] hover:bg-[#B71C2B] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition-colors"
          >
            {loading ? <><Loader2 size={16} className="animate-spin" /> Masuk...</> : 'Masuk'}
          </button>

          <p className="text-center text-[#6B7280] text-sm">
            Belum punya akun?{' '}
            <Link to="/register" className="text-[#D62839] font-semibold hover:underline">
              Daftar sekarang
            </Link>
          </p>
        </form>
      </div>
    </div>
  )
}
