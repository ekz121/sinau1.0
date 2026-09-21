import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { History, Play, Clock, Coins } from 'lucide-react'
import useMediaUrl from '../../hooks/useMediaUrl'
import { attachPublicProfiles } from '../../lib/publicProfiles'

function formatDate(s) {
  return new Date(s).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

function ThumbImage({ url }) {
  const { src, handleError } = useMediaUrl(url)
  if (!src) {
    return (
      <div className="w-full h-full bg-gradient-to-br from-[#FDEDEE] to-[#F1D4D6] flex items-center justify-center">
        <Play size={16} className="text-[#D62839] fill-current" />
      </div>
    )
  }
  return <img src={src} alt="" onError={handleError} className="w-full h-full object-cover" />
}

export default function HistoryPage() {
  const { user } = useAuthStore()
  const [views, setViews] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    supabase
      .from('views')
      .select('*, videos(id, creator_id, judul, kategori, harga_koin, durasi_detik, thumbnail_url, is_deleted)')
      .eq('viewer_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50)
      .then(async ({ data }) => {
        const visible = (data ?? []).filter(v => v.videos && !v.videos.is_deleted)
        const hydratedVideos = await attachPublicProfiles(visible.map(v => v.videos))
        setViews(visible.map((view, index) => ({ ...view, videos: hydratedVideos[index] })))
        setLoading(false)
      })
  }, [user])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-[#1F2937] flex items-center gap-2">
          <History size={22} className="text-[#D62839]" /> Riwayat Tontonan
        </h1>
        <p className="text-[#6B7280] text-sm mt-1">Video yang pernah kamu tonton</p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array(5).fill(0).map((_, i) => <div key={i} className="skeleton h-20 rounded-2xl" />)}
        </div>
      ) : views.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-4xl mb-3">📺</p>
          <p className="font-semibold text-[#1F2937] mb-1">Belum ada riwayat</p>
          <p className="text-[#6B7280] text-sm">Mulai tonton video untuk melihat riwayat di sini</p>
          <Link to="/" className="inline-block mt-4 bg-[#D62839] text-white font-semibold px-5 py-2.5 rounded-xl text-sm hover:bg-[#B71C2B] transition-colors">
            Jelajahi Video
          </Link>
        </div>
      ) : (
        <div className="bg-white border border-[#F1D4D6] rounded-2xl overflow-hidden">
          <div className="divide-y divide-[#F1D4D6]">
            {views.map(v => {
              const video = v.videos
              if (!video) return null
              return (
                <Link key={v.id} to={`/video/${video.id}`}
                  className="flex items-center gap-3 px-5 py-4 hover:bg-[#FAFAFA] transition-colors">
                  {/* Thumbnail */}
                  <div className="w-20 h-12 bg-[#FAFAFA] rounded-lg overflow-hidden flex-shrink-0">
                    <ThumbImage url={video.thumbnail_url} />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-[#1F2937] text-sm truncate">{video.judul}</p>
                    <p className="text-[#6B7280] text-xs mt-0.5">
                      {video.profiles?.nama || 'Kreator'} · {video.kategori || '-'}
                    </p>
                    <div className="flex items-center gap-3 mt-1">
                      {video.durasi_detik && (
                        <span className="flex items-center gap-1 text-[#6B7280] text-xs">
                          <Clock size={10} />
                          {Math.floor(video.durasi_detik / 60)}:{String(video.durasi_detik % 60).padStart(2, '0')}
                        </span>
                      )}
                      {video.harga_koin > 0 && (
                        <span className="flex items-center gap-1 text-[#F59E0B] text-xs font-medium">
                          <Coins size={10} /> {video.harga_koin} koin
                        </span>
                      )}
                      {v.has_paid_to_continue && (
                        <span className="text-[#059669] text-xs font-medium">✓ Sudah dibeli</span>
                      )}
                    </div>
                  </div>

                  {/* Date */}
                  <span className="text-[#6B7280] text-xs flex-shrink-0">{formatDate(v.created_at)}</span>
                </Link>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
