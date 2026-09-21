import { useState, useRef } from 'react'
import { useAuthStore } from '../../stores/authStore'
import { supabase } from '../../lib/supabase'
import { User, Camera, Loader2, CheckCircle, LogOut } from 'lucide-react'
import toast from 'react-hot-toast'

const JURUSAN_OPTIONS = [
  'Teknik Informatika', 'Sistem Informasi', 'Teknik Elektro', 'Matematika',
  'Fisika', 'Kimia', 'Biologi', 'Ekonomi', 'Manajemen', 'Akuntansi',
  'Ilmu Komunikasi', 'Hukum', 'Pendidikan', 'Sastra', 'Lainnya',
]

export default function ProfilePage() {
  const { user, profile, updateProfile, logout } = useAuthStore()
  const [form, setForm] = useState({
    nama: profile?.nama || '',
    jurusan: profile?.jurusan || '',
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const avatarRef = useRef(null)

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }))

  const handleSave = async () => {
    if (!form.nama.trim()) { toast.error('Nama tidak boleh kosong'); return }
    setSaving(true)
    setSaved(false)
    try {
      await updateProfile({ nama: form.nama.trim(), jurusan: form.jurusan })
      setSaved(true)
      toast.success('Profil berhasil diperbarui!')
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      toast.error(err.message || 'Gagal menyimpan profil')
    } finally {
      setSaving(false)
    }
  }

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowedTypes.includes(file.type)) { toast.error('File harus berupa gambar JPG, PNG, atau WebP'); return }
    if (file.size > 2 * 1024 * 1024) { toast.error('Ukuran foto maksimal 2MB'); return }

    setAvatarUploading(true)
    try {
      const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[file.type]
      const path = `${user.id}/avatars/${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('thumbnails')
        .upload(path, file, { contentType: file.type, upsert: true })

      if (upErr) throw upErr

      const { data: { publicUrl } } = supabase.storage.from('thumbnails').getPublicUrl(path)
      await updateProfile({ avatar_url: publicUrl })
      toast.success('Foto profil berhasil diperbarui! ✨')
    } catch (err) {
      toast.error(err.message || 'Gagal upload foto profil')
    } finally {
      setAvatarUploading(false)
    }
  }

  return (
    <div className="max-w-md mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-[#1F2937]">Profil Saya</h1>
        <p className="text-[#6B7280] text-sm mt-1">Kelola informasi akunmu</p>
      </div>

      {/* Avatar */}
      <div className="bg-white border border-[#F1D4D6] rounded-2xl p-6 flex flex-col items-center gap-4">
        <div className="relative">
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-[#D62839] to-[#B71C2B] flex items-center justify-center overflow-hidden border-4 border-white shadow-md">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <User size={40} className="text-white" />
            )}
          </div>
          <button
            type="button"
            onClick={() => avatarRef.current?.click()}
            disabled={avatarUploading}
            title="Ubah Foto Profil"
            className="absolute bottom-0 right-0 w-8 h-8 bg-[#D62839] rounded-full flex items-center justify-center hover:bg-[#B71C2B] transition-colors shadow-md border-2 border-white"
          >
            {avatarUploading ? (
              <Loader2 size={14} className="text-white animate-spin" />
            ) : (
              <Camera size={14} className="text-white" />
            )}
          </button>
          <input ref={avatarRef} type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
        </div>

        <button
          type="button"
          onClick={() => avatarRef.current?.click()}
          disabled={avatarUploading}
          className="text-xs font-semibold text-[#D62839] hover:underline flex items-center gap-1"
        >
          {avatarUploading ? 'Mengunggah foto...' : 'Ganti Foto Profil'}
        </button>

        <div className="text-center">
          <p className="font-bold text-[#1F2937] text-base">{profile?.nama || user?.email}</p>
          <p className="text-[#6B7280] text-sm">{user?.email}</p>
          {profile?.role === 'admin' && (
            <span className="mt-1.5 inline-block bg-[#FDEDEE] text-[#D62839] text-xs font-bold px-3 py-0.5 rounded-full">ADMIN</span>
          )}
        </div>
      </div>

      {/* Edit form */}
      <div className="bg-white border border-[#F1D4D6] rounded-2xl p-5 space-y-4">
        <h2 className="font-bold text-[#1F2937]">Edit Informasi</h2>

        <div>
          <label className="block text-sm font-medium text-[#1F2937] mb-1.5">Nama Lengkap</label>
          <input
            value={form.nama}
            onChange={set('nama')}
            className="w-full px-4 py-3 bg-[#FAFAFA] border border-[#F1D4D6] rounded-xl text-sm focus:outline-none focus:border-[#D62839] focus:bg-white transition-all"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[#1F2937] mb-1.5">Jurusan</label>
          <select
            value={form.jurusan}
            onChange={set('jurusan')}
            className="w-full px-4 py-3 bg-[#FAFAFA] border border-[#F1D4D6] rounded-xl text-sm focus:outline-none focus:border-[#D62839] focus:bg-white transition-all"
          >
            <option value="">Pilih jurusan</option>
            {JURUSAN_OPTIONS.map(j => <option key={j} value={j}>{j}</option>)}
          </select>
        </div>

        <button
          id="btn-save-profile"
          onClick={handleSave}
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 bg-[#D62839] hover:bg-[#B71C2B] disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-colors"
        >
          {saving ? (
            <><Loader2 size={16} className="animate-spin" /> Menyimpan...</>
          ) : saved ? (
            <><CheckCircle size={16} /> Tersimpan!</>
          ) : 'Simpan Perubahan'}
        </button>
      </div>

      {/* Logout */}
      <button
        onClick={logout}
        className="w-full flex items-center justify-center gap-2 border-2 border-[#F1D4D6] hover:border-[#D62839] text-[#6B7280] hover:text-[#D62839] font-semibold py-3 rounded-xl transition-all"
      >
        <LogOut size={16} />
        Keluar dari Akun
      </button>
    </div>
  )
}
