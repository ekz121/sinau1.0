import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import VideoPlayer from '../../components/VideoPlayer'
import VideoCard from '../../components/VideoCard'
import SkeletonCard from '../../components/SkeletonCard'
import CoinBadge from '../../components/CoinBadge'
import CommentSection from '../../components/CommentSection'
import { Flag, User, Clock, Eye, ChevronLeft, AlertCircle, ThumbsUp, ThumbsDown, UserPlus, UserCheck, X, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { attachPublicProfiles } from '../../lib/publicProfiles'

function formatDuration(s) {
  if (!s) return '-'
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${String(sec).padStart(2, '0')}`
}

export default function VideoDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuthStore()

  const [video, setVideo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [hasPaid, setHasPaid] = useState(false)
  const [related, setRelated] = useState([])
  const [relatedLoading, setRelatedLoading] = useState(true)

  // Social state
  const [myLike, setMyLike] = useState(null) // 'like' | 'dislike' | null
  const [showReportModal, setShowReportModal] = useState(false)
  const [reportAlasan, setReportAlasan] = useState('')
  const [reportSubmitting, setReportSubmitting] = useState(false)
  const [likeCounts, setLikeCounts] = useState({ like: 0, dislike: 0 })
  const [isFollowing, setIsFollowing] = useState(false)
  const [followCount, setFollowCount] = useState(0)
  const [likeLoading, setLikeLoading] = useState(false)
  const [followLoading, setFollowLoading] = useState(false)

  // Fetch video
  useEffect(() => {
    if (!id) return
    setLoading(true)
    supabase
      .from('videos')
      .select('*')
      .eq('id', id)
      .single()
      .then(async ({ data, error: err }) => {
        if (err || !data) {
          setError('Video tidak ditemukan')
        } else {
          const isCreator = data.creator_id === profile?.id
          const isAdmin = profile?.role === 'admin'
          if (data.status !== 'approved' && !isCreator && !isAdmin) {
            setError('Video ini sedang dalam proses review admin')
          } else {
            const [hydrated] = await attachPublicProfiles([data])
            setVideo(hydrated)
            setError('')
          }
        }
        setLoading(false)
      })
  }, [id, profile?.id, profile?.role])

  // Check paid — pakai views.has_paid_to_continue (konsisten dengan process_purchase RPC)
  useEffect(() => {
    if (!id || !profile?.id) return
    supabase
      .from('views')
      .select('has_paid_to_continue')
      .eq('video_id', id)
      .eq('viewer_id', profile.id)
      .maybeSingle()
      .then(({ data }) => setHasPaid(data?.has_paid_to_continue === true))
  }, [id, profile?.id])

  // Fetch related
  useEffect(() => {
    if (!video?.kategori) return
    setRelatedLoading(true)
    supabase.from('videos').select('*')
      .eq('status', 'approved').eq('kategori', video.kategori).neq('id', id).limit(4)
      .then(async ({ data }) => { setRelated(await attachPublicProfiles(data)); setRelatedLoading(false) })
  }, [video?.kategori, id])

  // Fetch likes + follow
  useEffect(() => {
    if (!id || !video) return
    // Like counts
    supabase.from('video_likes').select('type').eq('video_id', id)
      .then(({ data }) => {
        const likes = (data ?? []).filter(l => l.type === 'like').length
        const dislikes = (data ?? []).filter(l => l.type === 'dislike').length
        setLikeCounts({ like: likes, dislike: dislikes })
      })
    if (!profile?.id) return
    // My like
    supabase.from('video_likes').select('type').eq('video_id', id).eq('user_id', profile.id).maybeSingle()
      .then(({ data }) => setMyLike(data?.type || null))
    // Follow count + status
    supabase.from('follows').select('id', { count: 'exact' }).eq('creator_id', video.creator_id)
      .then(({ count }) => setFollowCount(count ?? 0))
    supabase.from('follows').select('id').eq('follower_id', profile.id).eq('creator_id', video.creator_id).maybeSingle()
      .then(({ data }) => setIsFollowing(!!data))
  }, [id, video?.creator_id, profile?.id])

  const handleLike = async (type) => {
    if (!profile) { toast.error('Login dulu untuk memberi reaksi'); return }
    setLikeLoading(true)
    if (myLike === type) {
      // Toggle off
      await supabase.from('video_likes').delete().eq('video_id', id).eq('user_id', profile.id)
      setLikeCounts(c => ({ ...c, [type]: c[type] - 1 }))
      setMyLike(null)
    } else {
      if (myLike) {
        await supabase.from('video_likes').update({ type }).eq('video_id', id).eq('user_id', profile.id)
        setLikeCounts(c => ({ ...c, [myLike]: c[myLike] - 1, [type]: c[type] + 1 }))
      } else {
        await supabase.from('video_likes').insert({ video_id: id, user_id: profile.id, type })
        setLikeCounts(c => ({ ...c, [type]: c[type] + 1 }))
      }
      setMyLike(type)
    }
    setLikeLoading(false)
  }

  const handleFollow = async () => {
    if (!profile) { toast.error('Login dulu untuk mengikuti kreator'); return }
    setFollowLoading(true)
    if (isFollowing) {
      await supabase.from('follows').delete().eq('follower_id', profile.id).eq('creator_id', video.creator_id)
      setIsFollowing(false)
      setFollowCount(c => c - 1)
    } else {
      await supabase.from('follows').insert({ follower_id: profile.id, creator_id: video.creator_id })
      setIsFollowing(true)
      setFollowCount(c => c + 1)
    }
    setFollowLoading(false)
  }

  const handleReport = () => {
    if (!profile) { toast.error('Login dulu untuk melaporkan video'); return }
    setShowReportModal(true)
  }

  const submitReport = async () => {
    if (!reportAlasan.trim()) { toast.error('Alasan wajib diisi'); return }
    setReportSubmitting(true)
    const { error: err } = await supabase.from('reports').insert({ video_id: id, reporter_id: profile?.id, alasan: reportAlasan.trim() })
    if (err) toast.error('Gagal mengirim laporan')
    else { toast.success('Laporan terkirim. Terima kasih!'); setShowReportModal(false); setReportAlasan('') }
    setReportSubmitting(false)
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="skeleton w-full aspect-video rounded-2xl" />
        <div className="skeleton h-6 w-3/4 rounded" />
        <div className="skeleton h-4 w-1/2 rounded" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <AlertCircle className="w-12 h-12 text-[#D62839]" />
        <p className="font-semibold text-[#1F2937]">{error}</p>
        <button onClick={() => navigate('/')} className="text-[#D62839] text-sm font-medium hover:underline">← Kembali ke Beranda</button>
      </div>
    )
  }

  const isOwnVideo = profile?.id === video?.creator_id
  const isAdmin = profile?.role === 'admin'
  const creatorId = video?.profiles?.id || video?.creator_id

  return (
    <div className="space-y-5">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-[#6B7280] hover:text-[#D62839] text-sm font-medium transition-colors">
        <ChevronLeft size={16} /> Kembali
      </button>

      <VideoPlayer video={video} hasPaidAlready={hasPaid || isOwnVideo || isAdmin} onPaymentSuccess={() => setHasPaid(true)} />

      <div className="space-y-3">
        <h1 className="text-xl font-bold text-[#1F2937] leading-snug">{video?.judul}</h1>

        {/* Stats + Like/Dislike */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[#6B7280] text-sm">
            <span className="flex items-center gap-1.5"><Eye size={14} />{video?.view_count ?? 0} penonton</span>
            <span className="flex items-center gap-1.5"><Clock size={14} />{formatDuration(video?.durasi_detik)}</span>
            {video?.kategori && (
              <span className="bg-[#FDEDEE] text-[#D62839] text-xs px-2.5 py-0.5 rounded-full font-medium">{video.kategori}</span>
            )}
            {video?.harga_koin > 0 && !hasPaid && !isOwnVideo && <CoinBadge amount={video.harga_koin} />}
            {(hasPaid || isOwnVideo) && video?.harga_koin > 0 && (
              <span className="bg-[#D1FAE5] text-[#059669] text-xs px-2.5 py-0.5 rounded-full font-medium">✓ Akses Penuh</span>
            )}
          </div>

          {/* Like/Dislike */}
          <div className="flex items-center gap-2">
            <button onClick={() => handleLike('like')} disabled={likeLoading}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold transition-all ${myLike === 'like' ? 'bg-[#D1FAE5] text-[#059669]' : 'bg-[#FAFAFA] border border-[#F1D4D6] text-[#6B7280] hover:border-[#059669]'}`}>
              <ThumbsUp size={14} /> {likeCounts.like}
            </button>
            <button onClick={() => handleLike('dislike')} disabled={likeLoading}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold transition-all ${myLike === 'dislike' ? 'bg-[#FEE2E2] text-[#DC2626]' : 'bg-[#FAFAFA] border border-[#F1D4D6] text-[#6B7280] hover:border-[#DC2626]'}`}>
              <ThumbsDown size={14} /> {likeCounts.dislike}
            </button>
          </div>
        </div>

        {/* Creator + Follow */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-[#D62839] to-[#B71C2B] rounded-full flex items-center justify-center">
              {video?.profiles?.avatar_url
                ? <img src={video.profiles.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                : <User size={18} className="text-white" />}
            </div>
            <div>
              <button
              onClick={() => creatorId && navigate(`/creator/${creatorId}`)}
              className="font-semibold text-[#1F2937] text-sm hover:text-[#D62839] transition-colors text-left"
            >
              {video?.profiles?.nama || 'Kreator'}
            </button>
              <p className="text-[#6B7280] text-xs">{video?.profiles?.jurusan || ''} · {followCount} pengikut</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!isOwnVideo && (
              <button onClick={handleFollow} disabled={followLoading}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold transition-all ${isFollowing ? 'bg-[#FAFAFA] border border-[#F1D4D6] text-[#6B7280]' : 'bg-[#D62839] text-white hover:bg-[#B71C2B]'}`}>
                {isFollowing ? <><UserCheck size={14} /> Mengikuti</> : <><UserPlus size={14} /> Ikuti</>}
              </button>
            )}
            {!isOwnVideo && !isAdmin && (
              <button onClick={handleReport} className="flex items-center gap-1.5 text-[#6B7280] hover:text-[#D62839] text-xs transition-colors">
                <Flag size={13} /> Laporkan
              </button>
            )}
          </div>
        </div>

        {/* Description */}
        {video?.deskripsi && (
          <div className="bg-[#FAFAFA] border border-[#F1D4D6] rounded-xl p-4">
            <h3 className="font-semibold text-[#1F2937] text-sm mb-2">Deskripsi</h3>
            <p className="text-[#6B7280] text-sm leading-relaxed whitespace-pre-line">{video.deskripsi}</p>
          </div>
        )}
      </div>

      {/* Comments */}
      <div className="bg-white border border-[#F1D4D6] rounded-2xl p-5">
        <CommentSection videoId={id} />
      </div>

      {/* Related */}
      {(related.length > 0 || relatedLoading) && (
        <div>
          <h2 className="font-bold text-[#1F2937] mb-3">Video Terkait</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {relatedLoading
              ? Array(4).fill(0).map((_, i) => <SkeletonCard key={i} />)
              : related.map(v => <VideoCard key={v.id} video={v} />)}
          </div>
        </div>
      )}
      {/* Report Modal (E6) */}
      {showReportModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowReportModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#F1D4D6]">
              <h2 className="font-bold text-[#1F2937] flex items-center gap-2"><Flag size={16} className="text-[#D62839]" /> Laporkan Video</h2>
              <button onClick={() => setShowReportModal(false)} className="text-[#6B7280] hover:text-[#D62839]"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#1F2937] mb-1.5">Alasan Pelaporan</label>
                <textarea
                  value={reportAlasan}
                  onChange={e => setReportAlasan(e.target.value)}
                  rows={4}
                  placeholder="Jelaskan mengapa video ini perlu ditinjau..."
                  maxLength={500}
                  className="w-full px-4 py-3 bg-[#FAFAFA] border border-[#F1D4D6] rounded-xl text-sm focus:outline-none focus:border-[#D62839] resize-none"
                />
                <p className="text-[#6B7280] text-xs mt-1 text-right">{reportAlasan.length}/500</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowReportModal(false)}
                  className="flex-1 py-2.5 border border-[#F1D4D6] rounded-xl text-sm font-semibold text-[#6B7280] hover:border-[#D62839] transition-colors">
                  Batal
                </button>
                <button onClick={submitReport} disabled={reportSubmitting || !reportAlasan.trim()}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-[#D62839] hover:bg-[#B71C2B] disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors">
                  {reportSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Flag size={14} />} Kirim Laporan
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
