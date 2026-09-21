import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import { QrCode, Upload, Loader2, Check } from 'lucide-react'
import toast from 'react-hot-toast'

export default function QrisSettingsPage() {
  const [qrisUrl, setQrisUrl] = useState('')
  const [preview, setPreview] = useState('')
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.from('app_settings').select('value').eq('key', 'qris_image_url').single()
      .then(({ data }) => {
        if (data?.value) { setQrisUrl(data.value); setPreview(data.value) }
      })
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
      setQrisUrl(urlData.publicUrl)
      setPreview(urlData.publicUrl)
      toast.success('Gambar diupload')
    } catch (err) {
      toast.error('Gagal upload: ' + err.message)
    } finally {
      setUploading(false)
    }
  }

  const saveSettings = async () => {
    setSaving(true)
    const { data, error } = await supabase.functions.invoke('admin-update-settings', {
      body: { settings: { qris_image_url: qrisUrl } },
    })
    if (error || data?.error) {
      toast.error('Gagal menyimpan: ' + (data?.error || error?.message))
    } else {
      toast.success('Pengaturan QRIS disimpan ✅')
    }
    setSaving(false)
  }

  return (
    <div className="space-y-5 max-w-lg">
      <div>
        <h1 className="text-2xl font-extrabold text-[#1F2937]">Pengaturan QRIS</h1>
        <p className="text-[#6B7280] text-sm mt-1">Upload gambar QRIS yang akan ditampilkan ke user saat top up</p>
      </div>

      <div className="bg-white border border-[#F1D4D6] rounded-2xl p-5 space-y-4">
        {/* Preview */}
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

        {/* Upload */}
        <label className="flex items-center justify-center gap-2 w-full border-2 border-dashed border-[#F1D4D6] hover:border-[#D62839] rounded-xl py-3 cursor-pointer transition-colors">
          {uploading ? <Loader2 size={16} className="animate-spin text-[#D62839]" /> : <Upload size={16} className="text-[#D62839]" />}
          <span className="text-sm font-medium text-[#D62839]">{uploading ? 'Mengupload...' : 'Upload Gambar QRIS'}</span>
          <input type="file" accept="image/*" className="hidden" onChange={handleFile} disabled={uploading} />
        </label>

        {/* Manual URL */}
        <div>
          <label className="block text-sm font-medium text-[#1F2937] mb-1.5">Atau masukkan URL gambar</label>
          <input type="text" value={qrisUrl}
            onChange={e => { setQrisUrl(e.target.value); setPreview(e.target.value) }}
            placeholder="https://..."
            className="w-full px-4 py-2.5 border border-[#F1D4D6] rounded-xl text-sm focus:outline-none focus:border-[#D62839]" />
        </div>

        <button onClick={saveSettings} disabled={saving || !qrisUrl}
          className="w-full flex items-center justify-center gap-2 bg-[#D62839] hover:bg-[#B71C2B] disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-colors">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
          Simpan Pengaturan
        </button>
      </div>
    </div>
  )
}
