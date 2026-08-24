import { useNavigate } from 'react-router-dom'
import { Eye, Clock, PlayCircle } from 'lucide-react'
import CoinBadge from './CoinBadge'
import useMediaUrl from '../hooks/useMediaUrl'

function formatDuration(seconds) {
  if (!seconds) return ''
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatViews(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}rb`
  return String(n)
}

const GRADIENTS = [
  'from-[#D62839] via-[#B71C2B] to-[#991523]',
  'from-[#1D4ED8] via-[#1E40AF] to-[#1E3A8A]',
  'from-[#047857] via-[#065F46] to-[#064E3B]',
  'from-[#7C3AED] via-[#6D28D9] to-[#5B21B6]',
  'from-[#D97706] via-[#B45309] to-[#78350F]',
]

function getGradient(id) {
  if (!id) return GRADIENTS[0]
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash << 5) - hash + id.charCodeAt(i)
  return GRADIENTS[Math.abs(hash) % GRADIENTS.length]
}

export default function VideoCard({ video }) {
  const navigate = useNavigate()
  const { src: thumbSrc, handleError: handleThumbError } = useMediaUrl(video.thumbnail_url)
  const isFree = !video.harga_koin || Number(video.harga_koin) === 0
  const bgGradient = getGradient(video.id)

  return (
    <button
      onClick={() => navigate(`/video/${video.id}`)}
      className="w-full text-left bg-white rounded-2xl overflow-hidden border border-[#F1D4D6] hover:border-[#D62839] hover:shadow-md transition-all duration-200 group"
    >
      {/* Thumbnail */}
      <div className="relative aspect-video bg-[#FAFAFA] overflow-hidden">
        {thumbSrc ? (
          <img
            src={thumbSrc}
            alt={video.judul}
            onError={handleThumbError}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
        ) : (
          <div className={`w-full h-full bg-gradient-to-br ${bgGradient} p-3 flex flex-col justify-between relative overflow-hidden group-hover:scale-105 transition-transform duration-300`}>
            {/* Subtle background decoration */}
            <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-white/10 rounded-full blur-xl pointer-events-none" />
            
            <div className="flex items-center justify-between z-10">
              <span className="bg-white/20 backdrop-blur-md text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                {video.kategori || 'Sinau Video'}
              </span>
            </div>

            <div className="flex items-center gap-2 z-10 my-auto">
              <div className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center flex-shrink-0 group-hover:bg-white group-hover:text-[#D62839] text-white transition-all">
                <PlayCircle size={18} />
              </div>
              <p className="text-white text-xs font-extrabold line-clamp-2 leading-snug drop-shadow-sm">
                {video.judul}
              </p>
            </div>
          </div>
        )}

        {/* Duration badge */}
        {video.durasi_detik && (
          <div className="absolute bottom-2 right-2 bg-black/70 backdrop-blur-sm text-white text-xs px-1.5 py-0.5 rounded-md flex items-center gap-1 z-10">
            <Clock size={10} />
            {formatDuration(video.durasi_detik)}
          </div>
        )}

        {/* Free badge */}
        {isFree && (
          <div className="absolute top-2 left-2 bg-[#059669] text-white text-xs font-semibold px-2 py-0.5 rounded-full z-10 shadow-sm">
            GRATIS
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        <p className="text-[#1F2937] font-semibold text-sm leading-snug line-clamp-2 mb-1.5">
          {video.judul}
        </p>
        <p
          className="text-[#6B7280] text-xs mb-2 line-clamp-1 hover:text-[#D62839] transition-colors cursor-pointer"
          onClick={e => { e.stopPropagation(); if (video.creator_id) navigate(`/creator/${video.creator_id}`) }}
        >
          {video.profiles?.nama || 'Kreator'}
        </p>

        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1 text-[#6B7280] text-xs">
            <Eye size={11} />
            {formatViews(video.view_count ?? 0)} penonton
          </span>
          {isFree ? (
            <span className="text-[#059669] text-xs font-semibold">Gratis</span>
          ) : (
            <CoinBadge amount={video.harga_koin} size="sm" />
          )}
        </div>

        {/* Category tag */}
        {video.kategori && (
          <div className="mt-2">
            <span className="bg-[#FDEDEE] text-[#D62839] text-xs px-2 py-0.5 rounded-full font-medium">
              {video.kategori}
            </span>
          </div>
        )}
      </div>
    </button>
  )
}
