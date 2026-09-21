import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'
import { Eye, EyeOff, Loader2, CheckCircle } from 'lucide-react'
import BrandLogo from '../../components/BrandLogo'
import toast from 'react-hot-toast'

const JURUSAN_OPTIONS = [
  'Teknik Informatika', 'Sistem Informasi', 'Teknik Elektro', 'Matematika',
  'Fisika', 'Kimia', 'Biologi', 'Ekonomi', 'Manajemen', 'Akuntansi',
  'Ilmu Komunikasi', 'Hukum', 'Pendidikan', 'Sastra', 'Lainnya',
]

export default function RegisterPage() {
  const [form, setForm] = useState({ nama: '', email: '', password: '', jurusan: '' })
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const { register } = useAuthStore()
  const navigate = useNavigate()

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.nama || !form.email || !form.password || !form.jurusan) {
      toast.error('Lengkapi semua field')
      return
    }
    if (form.password.length < 6) {
      toast.error('Password minimal 6 karakter')
      return
    }
    setLoading(true)
    try {
      await register(form)
      setDone(true)
    } catch (err) {
      toast.error(err.message?.includes('already') ? 'Email sudah terdaftar' : (err.message || 'Pendaftaran gagal'))
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-white via-[#FDEDEE] to-[#F1D4D6] flex items-center justify-center px-4">
        <div className="text-center max-w-sm fade-in">
          <div className="w-16 h-16 bg-[#D1FAE5] rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-[#059669]" />
          </div>
          <h2 className="text-xl font-bold text-[#1F2937] mb-2">Cek Email Kamu!</h2>
          <p className="text-[#6B7280] text-sm leading-relaxed mb-6">
            Kami mengirimkan link konfirmasi ke <span className="font-semibold text-[#1F2937]">{form.email}</span>.
            Klik link tersebut untuk mengaktifkan akun.
          </p>
          <button onClick={() => navigate('/login')} className="bg-[#D62839] text-white font-semibold px-6 py-3 rounded-xl hover:bg-[#B71C2B] transition-colors">
            Ke Halaman Login
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-[#FDEDEE] to-[#F1D4D6] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm fade-in">
        <div className="text-center mb-8">
          <BrandLogo size="lg" className="mx-auto mb-3" />
          <h1 className="text-2xl font-extrabold text-[#1F2937]">Daftar Sinau</h1>
          <p className="text-[#6B7280] text-sm mt-1">Buat akun dan mulai belajar bersama</p>
        </div>

        <form
          className="bg-white rounded-2xl shadow-sm border border-[#F1D4D6] p-6 space-y-4"
          onSubmit={handleSubmit}
        >
          {/* Nama */}
          <div>
            <label className="block text-sm font-medium text-[#1F2937] mb-1.5">Nama Lengkap</label>
            <input
              id="reg-nama"
              type="text"
              value={form.nama}
              onChange={set('nama')}
              placeholder="Nama kamu"
              className="w-full px-4 py-3 bg-[#FAFAFA] border border-[#F1D4D6] rounded-xl text-sm text-[#1F2937] placeholder:text-[#6B7280] focus:outline-none focus:border-[#D62839] focus:bg-white transition-all"
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-[#1F2937] mb-1.5">Email Kampus</label>
            <input
              id="reg-email"
              type="email"
              value={form.email}
              onChange={set('email')}
              placeholder="nama@kampus.ac.id"
              autoComplete="email"
              className="w-full px-4 py-3 bg-[#FAFAFA] border border-[#F1D4D6] rounded-xl text-sm text-[#1F2937] placeholder:text-[#6B7280] focus:outline-none focus:border-[#D62839] focus:bg-white transition-all"
            />
          </div>

          {/* Jurusan */}
          <div>
            <label className="block text-sm font-medium text-[#1F2937] mb-1.5">Jurusan</label>
            <select
              id="reg-jurusan"
              value={form.jurusan}
              onChange={set('jurusan')}
              className="w-full px-4 py-3 bg-[#FAFAFA] border border-[#F1D4D6] rounded-xl text-sm text-[#1F2937] focus:outline-none focus:border-[#D62839] focus:bg-white transition-all"
            >
              <option value="">Pilih jurusan</option>
              {JURUSAN_OPTIONS.map(j => (
                <option key={j} value={j}>{j}</option>
              ))}
            </select>
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-medium text-[#1F2937] mb-1.5">Password</label>
            <div className="relative">
              <input
                id="reg-password"
                type={showPw ? 'text' : 'password'}
                value={form.password}
                onChange={set('password')}
                placeholder="Minimal 6 karakter"
                autoComplete="new-password"
                className="w-full px-4 py-3 pr-11 bg-[#FAFAFA] border border-[#F1D4D6] rounded-xl text-sm text-[#1F2937] placeholder:text-[#6B7280] focus:outline-none focus:border-[#D62839] focus:bg-white transition-all"
              />
              <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B7280] hover:text-[#D62839]">
                {showPw ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </div>

          <button
            id="btn-register"
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-[#D62839] hover:bg-[#B71C2B] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition-colors"
          >
            {loading ? <><Loader2 size={16} className="animate-spin" /> Mendaftar...</> : 'Buat Akun'}
          </button>

          <p className="text-center text-[#6B7280] text-sm">
            Sudah punya akun?{' '}
            <Link to="/login" className="text-[#D62839] font-semibold hover:underline">Masuk</Link>
          </p>
        </form>
      </div>
    </div>
  )
}
