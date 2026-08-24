import { useState, useRef, useCallback } from 'react'
import { Upload, FileVideo, X, CheckCircle } from 'lucide-react'

const MAX_SIZE_MB = 100
const MAX_DURATION_MIN = 15
const ACCEPTED_TYPES = ['video/mp4']

export default function FileDropzone({ onFileSelect, disabled = false }) {
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState(null)
  const inputRef = useRef(null)

  const validateFile = useCallback((file) => {
    if (!file) return 'Tidak ada file dipilih'
    if (!file.name.toLowerCase().endsWith('.mp4') || !ACCEPTED_TYPES.includes(file.type)) {
      return 'Hanya file .mp4 yang diperbolehkan'
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      return `Ukuran file melebihi batas ${MAX_SIZE_MB}MB (ukuran: ${(file.size / 1024 / 1024).toFixed(1)}MB)`
    }
    return null
  }, [])

  const processFile = useCallback((file) => {
    const err = validateFile(file)
    if (err) {
      setError(err)
      setPreview(null)
      return
    }

    setError('')

    // Read video duration from metadata
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.src = url

    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url)
      const durationSec = Math.floor(video.duration)
      const durationMin = durationSec / 60

      if (durationMin > MAX_DURATION_MIN) {
        setError(`Durasi video melebihi batas ${MAX_DURATION_MIN} menit (durasi: ${Math.floor(durationMin)}:${String(Math.floor(durationSec % 60)).padStart(2, '0')})`)
        setPreview(null)
        return
      }

      setPreview({ name: file.name, size: file.size, duration: durationSec })
      onFileSelect?.(file, durationSec)
    }

    video.onerror = () => {
      URL.revokeObjectURL(url)
      setError('Tidak bisa membaca metadata video. Pastikan file tidak rusak.')
    }
  }, [validateFile, onFileSelect])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragOver(false)
    if (disabled) return
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }, [disabled, processFile])

  const handleChange = (e) => {
    const file = e.target.files[0]
    if (file) processFile(file)
  }

  const clear = () => {
    setPreview(null)
    setError('')
    if (inputRef.current) inputRef.current.value = ''
    onFileSelect?.(null, null)
  }

  const formatSize = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`
  const formatDur = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  return (
    <div className="space-y-3">
      {!preview ? (
        <div
          onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => !disabled && inputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-200
            ${dragOver ? 'border-[#D62839] bg-[#FDEDEE]' : 'border-[#F1D4D6] hover:border-[#D62839] hover:bg-[#FDEDEE]/50'}
            ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          `}
        >
          <div className="flex flex-col items-center gap-3">
            <div className="w-14 h-14 bg-[#FDEDEE] rounded-2xl flex items-center justify-center">
              <Upload className="w-7 h-7 text-[#D62839]" />
            </div>
            <div>
              <p className="font-semibold text-[#1F2937] text-sm">
                Drag & drop video di sini
              </p>
              <p className="text-[#6B7280] text-xs mt-1">atau klik untuk pilih file</p>
            </div>
            <p className="text-[#6B7280] text-xs">
              Format: .mp4 · Maks. {MAX_SIZE_MB}MB · Maks. {MAX_DURATION_MIN} menit
            </p>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".mp4,video/mp4"
            onChange={handleChange}
            className="hidden"
            disabled={disabled}
          />
        </div>
      ) : (
        <div className="border border-[#059669] bg-[#D1FAE5] rounded-2xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-[#059669] rounded-xl flex items-center justify-center flex-shrink-0">
            <FileVideo className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-[#1F2937] text-sm truncate">{preview.name}</p>
            <p className="text-[#6B7280] text-xs">
              {formatSize(preview.size)} · {formatDur(preview.duration)}
            </p>
          </div>
          <button
            onClick={clear}
            className="text-[#6B7280] hover:text-[#D62839] transition-colors p-1"
          >
            <X size={18} />
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 bg-[#FEE2E2] border border-[#FECACA] rounded-xl px-4 py-3">
          <X size={15} className="text-[#DC2626] flex-shrink-0 mt-0.5" />
          <p className="text-[#DC2626] text-sm">{error}</p>
        </div>
      )}
    </div>
  )
}
