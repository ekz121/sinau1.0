import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'
import { Loader2, CheckCircle, ArrowLeft } from 'lucide-react'
import BrandLogo from '../../components/BrandLogo'
import toast from 'react-hot-toast'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const { forgotPassword } = useAuthStore()

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!email) return
    setLoading(true)
    try {
      await forgotPassword(email)
      setSent(true)
    } catch (err) {
      toast.error(err.message || 'Gagal mengirim email reset')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-[#FDEDEE] to-[#F1D4D6] flex items-center justify-center px-4">
      <div className="w-full max-w-sm fade-in">
        <div className="text-center mb-8">
          <BrandLogo size="lg" className="mx-auto mb-3" />
          <h1 className="text-2xl font-extrabold text-[#1F2937]">Lupa Password?</h1>
          <p className="text-[#6B7280] text-sm mt-1">Kami kirimkan link reset ke emailmu</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-[#F1D4D6] p-6">
          {sent ? (
            <div className="text-center py-4">
              <div className="w-14 h-14 bg-[#D1FAE5] rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-7 h-7 text-[#059669]" />
              </div>
              <p className="font-semibold text-[#1F2937] mb-1">Email Terkirim!</p>
              <p className="text-[#6B7280] text-sm mb-4">
                Cek inbox <span className="font-medium">{email}</span> dan klik link reset password.
              </p>
              <Link to="/login" className="text-[#D62839] text-sm font-semibold hover:underline flex items-center justify-center gap-1">
                <ArrowLeft size={14} /> Kembali ke Login
              </Link>
            </div>
          ) : (
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div>
                <label className="block text-sm font-medium text-[#1F2937] mb-1.5">Email Kampus</label>
                <input
                  id="forgot-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nama@kampus.ac.id"
                  className="w-full px-4 py-3 bg-[#FAFAFA] border border-[#F1D4D6] rounded-xl text-sm focus:outline-none focus:border-[#D62839] focus:bg-white transition-all"
                />
              </div>

              <button
                id="btn-reset-password"
                type="submit"
                disabled={loading || !email}
                className="w-full flex items-center justify-center gap-2 bg-[#D62839] hover:bg-[#B71C2B] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition-colors"
              >
                {loading ? <><Loader2 size={16} className="animate-spin" /> Mengirim...</> : 'Kirim Link Reset'}
              </button>

              <Link to="/login" className="flex items-center justify-center gap-1 text-[#6B7280] text-sm hover:text-[#D62839] transition-colors">
                <ArrowLeft size={14} /> Kembali ke Login
              </Link>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
