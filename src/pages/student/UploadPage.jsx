import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'
import { supabase } from '../../lib/supabase'
import FileDropzone from '../../components/FileDropzone'
import { useCategoryNames } from '../../hooks/useCategories'
import { useAppSettings } from '../../hooks/useAppSettings'
import { Upload, Loader2, CheckCircle, Coins, Image, Sliders } from 'lucide-react'
import toast from 'react-hot-toast'

export default function UploadPage() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const categories = useCategoryNames()
  const { settings } = useAppSettings(['koin_to_rupiah_rate', 'revenue_split_creator'])
  const koinRate = parseInt(settings.koin_to_rupiah_rate ?? '500') || 500
  const creatorSplit = parseInt(settings.revenue_split_creator ?? '80') || 80

  const [file, setFile] = useState(null)
  const [duration, setDuration] = useState(null)
  
  // Thumbnail states
  const [thumbMode, setThumbMode] = useState('auto') // 'auto' | 'custom'
  const [frameTime, setFrameTime] = useState(1)
  const [thumbnail, setThumbnail] = useState(null) // data URL preview
  const [thumbnailBlob, setThumbnailBlob] = useState(null)
  const [customFile, setCustomFile] = useState(null)

  const [form, setForm] = useState({ judul: '', deskripsi: '', kategori: '', harga_koin: '1' })
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [done, setDone] = useState(false)

  const videoObjUrlRef = useRef(null)

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }))

  const handleFileSelect = (selectedFile, dur) => {
    setFile(selectedFile)
    setDuration(dur)
    setFrameTime(1)
    if (selectedFile) {
      if (videoObjUrlRef.current) URL.revokeObjectURL(videoObjUrlRef.current)
      videoObjUrlRef.current = URL.createObjectURL(selectedFile)
      if (thumbMode === 'auto') extractFrame(videoObjUrlRef.current, 1)
    } else {
      if (videoObjUrlRef.current) {
        URL.revokeObjectURL(videoObjUrlRef.current)
        videoObjUrlRef.current = null
      }
      setThumbnail(null)
      setThumbnailBlob(null)
    }
  }

  const extractFrame = (videoUrl, timeInSec) => {
    const video = document.createElement('video')
    video.src = videoUrl
    video.currentTime = timeInSec
    video.muted = true
    video.playsInline = true

    video.onseeked = () => {
      const canvas = document.createElement('canvas')
      canvas.width = 640
      canvas.height = 360
      const ctx = canvas.getContext('2d')
      ctx.drawImage(video, 0, 0, 640, 360)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
      setThumbnail(dataUrl)
      canvas.toBlob((blob) => setThumbnailBlob(blob), 'image/jpeg', 0.85)
    }
    video.load()
  }

  const handleSliderChange = (e) => {
    const t = parseFloat(e.target.value)
    setFrameTime(t)
    if (videoObjUrlRef.current) extractFrame(videoObjUrlRef.current, t)
  }

  const handleCustomImage = (e) => {
    const imgFile = e.target.files?.[0]
    if (!imgFile) return
    if (!imgFile.type.startsWith('image/')) { toast.error('File thumbnail harus berupa gambar'); return }
    if (imgFile.size > 2 * 1024 * 1024) { toast.error('Ukuran gambar maksimal 2MB'); return }

    setCustomFile(imgFile)
    setThumbnailBlob(imgFile)
    const reader = new FileReader()
    reader.onload = (ev) => setThumbnail(ev.target.result)
    reader.readAsDataURL(imgFile)
  }

  const handleUpload = async () => {
    if (!file || !form.judul.trim() || !form.kategori) {
      toast.error('Lengkapi judul, kategori, dan pilih file video')
      return
    }
    if (!user) return

    setUploading(true)
    setProgress(0)

    try {
      const videoPath = `${user.id}/${Date.now()}_${file.name}`
      const thumbPath = `${user.id}/${Date.now()}_thumb.jpg`

      // Upload thumbnail first (if selected/generated)
      let thumbnailUrl = null
      if (thumbnailBlob) {
        const { error: thumbErr } = await supabase.storage
          .from('thumbnails')
          .upload(thumbPath, thumbnailBlob, { contentType: 'image/jpeg', upsert: true })
        if (!thumbErr) {
          const { data: { publicUrl } } = supabase.storage.from('thumbnails').getPublicUrl(thumbPath)
          thumbnailUrl = publicUrl
        } else {
          console.warn('[Upload] Thumbnail gagal diupload:', thumbErr.message)
          toast.error(`Thumbnail gagal diupload: ${thumbErr.message}. Video tetap diupload tanpa thumbnail.`)
        }
      }

      setProgress(20)

      // Upload video to private bucket
      const { error: vidErr } = await supabase.storage
        .from('videos')
        .upload(videoPath, file, {
          contentType: file.type || 'video/mp4',
          upsert: false,
        })

      if (vidErr) throw vidErr
      setProgress(85)

      // Insert video record
      const { error: dbErr } = await supabase.from('videos').insert({
        creator_id: user.id,
        judul: form.judul.trim(),
        deskripsi: form.deskripsi.trim(),
        kategori: form.kategori,
        harga_koin: (duration && duration <= 180) ? 0 : 1,
        video_file_url: videoPath,
        thumbnail_url: thumbnailUrl,
        durasi_detik: duration,
        status: 'pending',
      })

      if (dbErr) throw dbErr

      setProgress(100)
      setDone(true)
    } catch (err) {
      toast.error(err.message || 'Upload gagal. Coba lagi.')
    } finally {
      setUploading(false)
    }
  }

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-5 fade-in">
        <div className="w-20 h-20 bg-[#D1FAE5] rounded-full flex items-center justify-center">
          <CheckCircle className="w-10 h-10 text-[#059669]" />
        </div>
        <div className="text-center">
          <h2 className="text-xl font-bold text-[#1F2937] mb-2">Video Terkirim! 🎉</h2>
          <p className="text-[#6B7280] text-sm max-w-xs leading-relaxed">
            Video kamu sedang menunggu review admin. Setelah disetujui, akan muncul di halaman Jelajahi.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => { setDone(false); setFile(null); setThumbnail(null); setForm({ judul: '', deskripsi: '', kategori: '', harga_koin: '1' }) }}
            className="border border-[#F1D4D6] text-[#6B7280] hover:border-[#D62839] hover:text-[#D62839] px-5 py-2.5 rounded-xl text-sm font-medium transition-all"
          >
            Upload Lagi
          </button>
          <button
            onClick={() => navigate('/studio')}
            className="bg-[#D62839] text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-[#B71C2B] transition-colors"
          >
            Lihat Studio
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-[#1F2937]">Upload Video</h1>
        <p className="text-[#6B7280] text-sm mt-1">Bagikan ilmumu dan dapatkan koin dari penonton</p>
      </div>

      {/* Dropzone */}
      <FileDropzone onFileSelect={handleFileSelect} disabled={uploading} />

      {/* Thumbnail Selection & Preview */}
      {file && (
        <div className="bg-white border border-[#F1D4D6] rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-sm font-bold text-[#1F2937]">Pilih Thumbnail Video</label>
            <div className="flex gap-1 bg-[#FAFAFA] border border-[#F1D4D6] p-1 rounded-xl">
              <button
                type="button"
                onClick={() => { setThumbMode('auto'); if (videoObjUrlRef.current) extractFrame(videoObjUrlRef.current, frameTime) }}
                className={`px-3 py-1 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all ${thumbMode === 'auto' ? 'bg-white text-[#D62839] shadow-sm' : 'text-[#6B7280]'}`}
              >
                <Sliders size={12} /> Pilih Frame Video
              </button>
              <button
                type="button"
                onClick={() => setThumbMode('custom')}
                className={`px-3 py-1 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all ${thumbMode === 'custom' ? 'bg-white text-[#D62839] shadow-sm' : 'text-[#6B7280]'}`}
              >
                <Image size={12} /> Upload Gambar
              </button>
            </div>
          </div>

          {/* Mode: Frame Picker */}
          {thumbMode === 'auto' && duration > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-[#6B7280]">
                <span>Pilih waktu frame:</span>
                <span className="font-bold text-[#1F2937]">{Math.floor(frameTime / 60)}:{String(Math.floor(frameTime % 60)).padStart(2, '0')}</span>
              </div>
              <input
                type="range"
                min={0}
                max={duration}
                step={0.5}
                value={frameTime}
                onChange={handleSliderChange}
                className="w-full accent-[#D62839] cursor-pointer"
              />
            </div>
          )}

          {/* Mode: Custom File Upload */}
          {thumbMode === 'custom' && (
            <div>
              <label className="flex items-center justify-center gap-2 border-2 border-dashed border-[#F1D4D6] hover:border-[#D62839] rounded-xl py-3 cursor-pointer transition-colors">
                <Image size={16} className="text-[#D62839]" />
                <span className="text-sm font-medium text-[#D62839]">
                  {customFile ? customFile.name : 'Pilih Gambar Thumbnail (JPG/PNG, Max 2MB)'}
                </span>
                <input type="file" accept="image/*" className="hidden" onChange={handleCustomImage} />
              </label>
            </div>
          )}

          {/* Preview Box */}
          {thumbnail && (
            <div className="rounded-xl overflow-hidden border border-[#F1D4D6]">
              <img src={thumbnail} alt="Thumbnail Preview" className="w-full aspect-video object-cover" />
              <p className="text-[#6B7280] text-xs px-3 py-2 bg-[#FAFAFA]">
                {thumbMode === 'auto' ? '📸 Thumbnail diambil dari timeline video' : '🖼️ Thumbnail menggunakan gambar custom'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Form */}
      <div className="bg-white border border-[#F1D4D6] rounded-2xl p-5 space-y-4">
        <div>
          <label className="block text-sm font-medium text-[#1F2937] mb-1.5">Judul Video *</label>
          <input
            value={form.judul}
            onChange={set('judul')}
            maxLength={100}
            placeholder="Judul yang menarik dan deskriptif"
            className="w-full px-4 py-3 bg-[#FAFAFA] border border-[#F1D4D6] rounded-xl text-sm focus:outline-none focus:border-[#D62839] focus:bg-white transition-all"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[#1F2937] mb-1.5">Kategori *</label>
          <select
            value={form.kategori}
            onChange={set('kategori')}
            className="w-full px-4 py-3 bg-[#FAFAFA] border border-[#F1D4D6] rounded-xl text-sm focus:outline-none focus:border-[#D62839] focus:bg-white transition-all"
          >
            <option value="">Pilih kategori</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-[#1F2937] mb-1.5">
            Deskripsi
            <span className="text-[#6B7280] font-normal ml-1">(dipakai AI untuk buat kuis jika video gagal diproses)</span>
          </label>
          <textarea
            value={form.deskripsi}
            onChange={set('deskripsi')}
            rows={4}
            placeholder="Jelaskan isi video secara singkat..."
            className="w-full px-4 py-3 bg-[#FAFAFA] border border-[#F1D4D6] rounded-xl text-sm focus:outline-none focus:border-[#D62839] focus:bg-white transition-all resize-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[#1F2937] mb-1.5 flex items-center gap-1.5">
            <Coins size={14} className="text-[#F59E0B]" />
            Harga Lanjut Tonton
            {duration && duration <= 180 && (
              <span className="text-[#059669] text-xs font-normal">— Video ≤3 menit, GRATIS otomatis</span>
            )}
          </label>
          <div className="flex items-center gap-3 bg-[#FAFAFA] border border-[#F1D4D6] rounded-xl px-4 py-3">
            <div className="flex items-center gap-1.5">
              <Coins size={16} className="text-[#F59E0B]" />
              <span className="font-bold text-[#1F2937] text-lg">{duration && duration <= 180 ? '0' : '1'}</span>
              <span className="text-[#6B7280] text-sm">koin</span>
            </div>
            <span className="text-[#6B7280] text-sm">= Rp{((duration && duration <= 180 ? 0 : 1) * koinRate).toLocaleString('id-ID')}</span>
          </div>
          <p className="text-[#6B7280] text-xs mt-1.5">💡 Harga otomatis 1 koin per video. Kamu dapat {creatorSplit}% dari setiap pembayaran.</p>
        </div>
      </div>

      {/* Progress */}
      {uploading && (
        <div className="bg-[#FAFAFA] border border-[#F1D4D6] rounded-xl px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-[#1F2937]">Mengupload...</span>
            <span className="text-[#D62839] text-sm font-bold">{progress}%</span>
          </div>
          <div className="h-2 bg-[#F1D4D6] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#D62839] rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      <button
        id="btn-upload-video"
        onClick={handleUpload}
        disabled={uploading || !file}
        className="w-full flex items-center justify-center gap-2 bg-[#D62839] hover:bg-[#B71C2B] disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-3.5 rounded-xl transition-colors"
      >
        {uploading
          ? <><Loader2 size={18} className="animate-spin" /> Mengupload...</>
          : <><Upload size={18} /> Upload Video</>
        }
      </button>
    </div>
  )
}
