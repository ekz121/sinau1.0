import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'
import { ShieldCheck, Eye, EyeOff, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'

export default function AdminLoginPage() {
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
      // Wait for profile to be fetched by authStore
      // Poll until initialized or timeout
      let attempts = 0
      while (attempts < 20) {
        await new Promise(r => setTimeout(r, 150))
        const { profile, initialized } = useAuthStore.getState()
        if (initialized && profile) {
          if (profile.role !== 'admin') {
            await useAuthStore.getState().logout()
            toast.error('Akun ini bukan admin')
            return
          }
          navigate('/admin', { replace: true })
          return
        }
        attempts++
      }
      // Fallback: navigate and let AdminRoute handle rejection
      navigate('/admin', { replace: true })
    } catch (err) {
      toast.error(err.message?.includes('Invalid') ? 'Email atau password salah' : (err.message || 'Login gagal'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#1F2937] flex items-center justify-center px-4">
      <div className="w-full max-w-sm fade-in">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-[#D62839] rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg shadow-[#D62839]/40">
            <ShieldCheck size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-extrabold text-white">Admin Sinau</h1>
          <p className="text-white/50 text-sm mt-1">Portal Administrator</p>
        </div>

        <form
          className="bg-white/10 backdrop-blur rounded-2xl border border-white/10 p-6 space-y-4"
          onSubmit={handleSubmit}
        >
          <div>
            <label className="block text-sm font-medium text-white/80 mb-1.5">Email Admin</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@sinau.id"
              autoComplete="email"
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#D62839] transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-white/80 mb-1.5">Password</label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password admin"
                autoComplete="current-password"
                className="w-full px-4 py-3 pr-11 bg-white/10 border border-white/20 rounded-xl text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#D62839] transition-all"
              />
              <button type="button" onClick={() => setShowPw(!showPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white">
                {showPw ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !email || !password}
            className="w-full flex items-center justify-center gap-2 bg-[#D62839] hover:bg-[#B71C2B] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition-colors"
          >
            {loading ? <><Loader2 size={16} className="animate-spin" /> Masuk...</> : 'Masuk ke Portal Admin'}
          </button>
        </form>

        <p className="text-center text-white/30 text-xs mt-6">
          Lupa password? Hubungi pengelola project untuk reset manual.
        </p>
      </div>
    </div>
  )
}
