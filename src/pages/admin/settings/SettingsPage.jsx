import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import { useCategories } from '../../../hooks/useCategories'
import { invalidateSettingsCache } from '../../../hooks/useAppSettings'
import { Settings, QrCode, Tag, User, Plus, Trash2, GripVertical, Upload, Loader2, Check, Eye, EyeOff, Edit2 } from 'lucide-react'
import toast from 'react-hot-toast'

// ── Tab: Umum ────────────────────────────────────────────────
function TabUmum() {
  const [config, setConfig] = useState({ revenue_split_creator: '80', koin_to_rupiah_rate: '500', min_payout_koin: '50' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.from('app_settings')
      .select('key, value')
      .in('key', ['revenue_split_creator', 'koin_to_rupiah_rate', 'min_payout_koin'])
      .then(({ data }) => {
        if (data) {
          const map = Object.fromEntries(data.map(r => [r.key, r.value]))
          setConfig(c => ({ ...c, ...map }))
        }
        setLoading(false)
      })
  }, [])

  const save = async () => {
    setSaving(true)
    const { data, error } = await supabase.functions.invoke('admin-update-settings', {
      body: { settings: { revenue_split_creator: config.revenue_split_creator, min_payout_koin: config.min_payout_koin } },
    })
    if (error || data?.error) toast.error('Gagal menyimpan: ' + (data?.error || error?.message))
    else {
      invalidateSettingsCache(['revenue_split_creator', 'koin_to_rupiah_rate', 'min_payout_koin'])
      toast.success('Pengaturan disimpan ✅')
    }
    setSaving(false)
  }

  if (loading) return <div className="skeleton h-48 rounded-2xl" />

  return (
    <div className="space-y-4 max-w-md">
      <div className="bg-white border border-[#F1D4D6] rounded-2xl p-5 space-y-4">
        <div>
          <label className="block text-sm font-medium text-[#1F2937] mb-1">Revenue Kreator (%)</label>
          <p className="text-[#6B7280] text-xs mb-2">Persentase yang diterima kreator dari setiap pembelian video. Sisanya masuk platform.</p>
          <div className="flex items-center gap-2">
            <input type="number" min="1" max="99" value={config.revenue_split_creator}
              onChange={e => setConfig(c => ({ ...c, revenue_split_creator: e.target.value }))}
              className="w-24 px-4 py-2.5 border border-[#F1D4D6] rounded-xl text-sm focus:outline-none focus:border-[#D62839]" />
            <span className="text-[#6B7280] text-sm">% untuk kreator, {100 - parseInt(config.revenue_split_creator || 80)}% untuk platform</span>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-[#1F2937] mb-1">Nilai Tukar Koin (Rp per koin)</label>
          <p className="text-[#6B7280] text-xs mb-2">Harga 1 koin dalam Rupiah. Dipakai untuk kalkulasi top-up dan payout.</p>
          <div className="flex items-center gap-2">
            <span className="text-[#6B7280] text-sm">Rp</span>
            <input type="number" value="500" disabled
              className="w-28 px-4 py-2.5 border border-[#F1D4D6] rounded-xl text-sm bg-[#F3F4F6] text-[#6B7280]" />
            <span className="text-[#6B7280] text-sm">per koin</span>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-[#1F2937] mb-1">Minimum Pencairan (koin)</label>
          <p className="text-[#6B7280] text-xs mb-2">Jumlah koin minimum yang bisa dicairkan oleh kreator.</p>
          <input type="number" min="1" value={config.min_payout_koin}
            onChange={e => setConfig(c => ({ ...c, min_payout_koin: e.target.value }))}
            className="w-28 px-4 py-2.5 border border-[#F1D4D6] rounded-xl text-sm focus:outline-none focus:border-[#D62839]" />
        </div>
        <button onClick={save} disabled={saving}
          className="flex items-center gap-2 bg-[#D62839] hover:bg-[#B71C2B] disabled:opacity-50 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Simpan Pengaturan
        </button>
      </div>
    </div>
  )
}

// ── Tab: QRIS ────────────────────────────────────────────────
function TabQris() {
  const [qrisUrl, setQrisUrl] = useState('')
  const [preview, setPreview] = useState('')
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.from('app_settings').select('value').eq('key', 'qris_image_url').single()
      .then(({ data }) => { if (data?.value) { setQrisUrl(data.value); setPreview(data.value) } })
  }, [])

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { toast.error('File harus JPG, PNG, atau WebP'); return }
    if (file.size > 2 * 1024 * 1024) { toast.error('Ukuran file maksimal 2MB'); return }
    setUploading(true)
    try {
      const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[file.type]
      const path = `qris/qris_${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('thumbnails').upload(path, file, { contentType: file.type, upsert: false })
      if (upErr) throw upErr
      const { data: urlData } = supabase.storage.from('thumbnails').getPublicUrl(path)
      setQrisUrl(urlData.publicUrl); setPreview(urlData.publicUrl)
      toast.success('Gambar diupload')
    } catch (err) { toast.error('Gagal upload: ' + err.message) }
    finally { setUploading(false) }
  }

  const saveSettings = async () => {
    setSaving(true)
    const { data, error } = await supabase.functions.invoke('admin-update-settings', {
      body: { settings: { qris_image_url: qrisUrl } },
    })
    if (error || data?.error) toast.error('Gagal menyimpan: ' + (data?.error || error?.message))
    else {
      invalidateSettingsCache(['qris_image_url'])
      toast.success('Pengaturan QRIS disimpan ✅')
    }
    setSaving(false)
  }

  return (
    <div className="space-y-4 max-w-md">
      <div className="bg-white border border-[#F1D4D6] rounded-2xl p-5 space-y-4">
        <div className="flex flex-col items-center gap-3">
          {preview ? (
            <img src={preview} alt="QRIS" className="w-56 h-56 object-contain border border-[#F1D4D6] rounded-xl p-2" />
          ) : (
            <div className="w-56 h-56 border-2 border-dashed border-[#F1D4D6] rounded-xl flex flex-col items-center justify-center gap-2">
              <QrCode size={40} className="text-[#F1D4D6]" />
              <p className="text-[#6B7280] text-xs">Belum ada QRIS</p>
            </div>
          )}
        </div>
        <label className="flex items-center justify-center gap-2 w-full border-2 border-dashed border-[#F1D4D6] hover:border-[#D62839] rounded-xl py-3 cursor-pointer transition-colors">
          {uploading ? <Loader2 size={16} className="animate-spin text-[#D62839]" /> : <Upload size={16} className="text-[#D62839]" />}
          <span className="text-sm font-medium text-[#D62839]">{uploading ? 'Mengupload...' : 'Upload Gambar QRIS'}</span>
          <input type="file" accept="image/*" className="hidden" onChange={handleFile} disabled={uploading} />
        </label>
        <div>
          <label className="block text-sm font-medium text-[#1F2937] mb-1.5">Atau masukkan URL gambar</label>
          <input type="text" value={qrisUrl}
            onChange={e => { setQrisUrl(e.target.value); setPreview(e.target.value) }}
            placeholder="https://..."
            className="w-full px-4 py-2.5 border border-[#F1D4D6] rounded-xl text-sm focus:outline-none focus:border-[#D62839]" />
        </div>
        <button onClick={saveSettings} disabled={saving || !qrisUrl}
          className="w-full flex items-center justify-center gap-2 bg-[#D62839] hover:bg-[#B71C2B] disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-colors">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Simpan Pengaturan
        </button>
      </div>
    </div>
  )
}

// ── Tab: Kategori ────────────────────────────────────────────
function TabKategori() {
  const { categories, loading, invalidate } = useCategories()
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState(null)
  const [editing, setEditing] = useState(null)

  const addCategory = async () => {
    if (!newName.trim()) return
    setAdding(true)
    const maxUrutan = categories.length > 0 ? Math.max(...categories.map(c => c.urutan)) + 1 : 1
    const { error } = await supabase.from('categories').insert({ nama: newName.trim(), urutan: maxUrutan })
    if (error) toast.error(error.message.includes('unique') ? 'Kategori sudah ada' : error.message)
    else {
      toast.success('Kategori ditambahkan')
      setNewName('')
      invalidate() // invalidate cache agar CategoryFilter & selects langsung reload
    }
    setAdding(false)
  }

  const deleteCategory = async (id, nama) => {
    // Cek dulu apakah kategori masih dipakai oleh video
    const { count } = await supabase
      .from('videos')
      .select('id', { count: 'exact', head: true })
      .eq('kategori', nama)
      .eq('is_deleted', false)

    if (count && count > 0) {
      toast.error(`Kategori "${nama}" masih dipakai oleh ${count} video aktif. Ubah kategori video tersebut dulu.`)
      return
    }

    if (!window.confirm(`Hapus kategori "${nama}"?`)) return
    setDeleting(id)
    const { error } = await supabase.from('categories').delete().eq('id', id)
    if (error) toast.error('Gagal menghapus: ' + error.message)
    else {
      toast.success('Kategori dihapus')
      invalidate()
    }
    setDeleting(null)
  }

  const editCategory = async (category) => {
    const nextName = window.prompt('Nama kategori baru:', category.nama)?.trim()
    if (!nextName || nextName === category.nama) return
    if (nextName.length > 100) { toast.error('Nama kategori maksimal 100 karakter'); return }
    setEditing(category.id)
    const { error } = await supabase.from('categories').update({ nama: nextName }).eq('id', category.id)
    if (error) {
      toast.error(error.message.includes('unique') ? 'Kategori sudah ada' : error.message)
    } else {
      const { error: videoError } = await supabase.from('videos').update({ kategori: nextName }).eq('kategori', category.nama)
      if (videoError) toast.error('Kategori berubah, tetapi beberapa video perlu diperbarui manual')
      else toast.success('Kategori diperbarui')
      invalidate()
    }
    setEditing(null)
  }

  return (
    <div className="space-y-4 max-w-md">
      <div className="bg-white border border-[#F1D4D6] rounded-2xl p-5">
        <p className="font-semibold text-[#1F2937] text-sm mb-3">Tambah Kategori Baru</p>
        <div className="flex gap-2">
          <input type="text" value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addCategory()}
            placeholder="Nama kategori..."
            className="flex-1 px-4 py-2.5 border border-[#F1D4D6] rounded-xl text-sm focus:outline-none focus:border-[#D62839]" />
          <button onClick={addCategory} disabled={adding || !newName.trim()}
            className="flex items-center gap-1.5 bg-[#D62839] hover:bg-[#B71C2B] disabled:opacity-50 text-white font-semibold px-4 py-2.5 rounded-xl text-sm transition-colors">
            {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Tambah
          </button>
        </div>
      </div>
      <div className="bg-white border border-[#F1D4D6] rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[#F1D4D6]">
          <p className="font-semibold text-[#1F2937] text-sm">{categories.length} kategori</p>
        </div>
        {loading ? (
          <div className="p-5 space-y-2">{Array(5).fill(0).map((_, i) => <div key={i} className="skeleton h-12 rounded-xl" />)}</div>
        ) : categories.length === 0 ? (
          <p className="text-center text-[#6B7280] text-sm py-8">Belum ada kategori</p>
        ) : (
          <div className="divide-y divide-[#F1D4D6]">
            {categories.map(cat => (
              <div key={cat.id} className="px-5 py-3.5 flex items-center gap-3">
                <GripVertical size={16} className="text-[#F1D4D6] flex-shrink-0" />
                <span className="flex-1 font-medium text-[#1F2937] text-sm">{cat.nama}</span>
                <button onClick={() => editCategory(cat)} disabled={editing === cat.id}
                  className="p-1.5 rounded-lg hover:bg-[#DBEAFE] text-[#6B7280] hover:text-[#2563EB] transition-colors" title="Edit kategori">
                  {editing === cat.id ? <Loader2 size={14} className="animate-spin" /> : <Edit2 size={14} />}
                </button>
                <button onClick={() => deleteCategory(cat.id, cat.nama)} disabled={deleting === cat.id}
                  className="p-1.5 rounded-lg hover:bg-[#FEE2E2] text-[#6B7280] hover:text-[#DC2626] transition-colors">
                  {deleting === cat.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Tab: Akun ────────────────────────────────────────────────
function TabAkun() {
  const [form, setForm] = useState({ current: '', newPw: '', confirm: '' })
  const [showPw, setShowPw] = useState(false)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (form.newPw.length < 6) { toast.error('Password minimal 6 karakter'); return }
    if (form.newPw !== form.confirm) { toast.error('Konfirmasi password tidak cocok'); return }
    setSaving(true)
    const { error } = await supabase.auth.updateUser({ password: form.newPw })
    if (error) toast.error('Gagal: ' + error.message)
    else { toast.success('Password berhasil diubah ✅'); setForm({ current: '', newPw: '', confirm: '' }) }
    setSaving(false)
  }

  return (
    <div className="space-y-4 max-w-md">
      <div className="bg-white border border-[#F1D4D6] rounded-2xl p-5 space-y-4">
        <h3 className="font-bold text-[#1F2937]">Ganti Password Admin</h3>
        {[
          { label: 'Password Baru', key: 'newPw', placeholder: 'Minimal 6 karakter' },
          { label: 'Konfirmasi Password', key: 'confirm', placeholder: 'Ulangi password baru' },
        ].map(({ label, key, placeholder }) => (
          <div key={key}>
            <label className="block text-sm font-medium text-[#1F2937] mb-1.5">{label}</label>
            <div className="relative">
              <input type={showPw ? 'text' : 'password'} value={form[key]}
                onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                placeholder={placeholder}
                className="w-full px-4 py-2.5 pr-10 border border-[#F1D4D6] rounded-xl text-sm focus:outline-none focus:border-[#D62839]" />
              <button type="button" onClick={() => setShowPw(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B7280] hover:text-[#D62839]">
                {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>
        ))}
        <button onClick={handleSave} disabled={saving || !form.newPw || !form.confirm}
          className="w-full flex items-center justify-center gap-2 bg-[#D62839] hover:bg-[#B71C2B] disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-colors">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Simpan Password
        </button>
      </div>
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────
const TABS = [
  { key: 'umum', label: 'Umum', icon: Settings },
  { key: 'qris', label: 'QRIS', icon: QrCode },
  { key: 'kategori', label: 'Kategori', icon: Tag },
  { key: 'akun', label: 'Akun', icon: User },
]

export default function SettingsPage() {
  const [tab, setTab] = useState('umum')

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-[#1F2937]">Pengaturan</h1>
        <p className="text-[#6B7280] text-sm mt-1">Konfigurasi platform Sinau</p>
      </div>

      <div className="flex gap-1 bg-[#FAFAFA] border border-[#F1D4D6] rounded-xl p-1 w-fit">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${tab === key ? 'bg-white text-[#D62839] shadow-sm' : 'text-[#6B7280] hover:text-[#1F2937]'}`}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {tab === 'umum' && <TabUmum />}
      {tab === 'qris' && <TabQris />}
      {tab === 'kategori' && <TabKategori />}
      {tab === 'akun' && <TabAkun />}
    </div>
  )
}
