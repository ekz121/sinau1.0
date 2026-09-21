import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'
import { supabase } from '../../lib/supabase'
import { useAppSetting } from '../../hooks/useAppSettings'
import StatCard from '../../components/StatCard'
import useMediaUrl from '../../hooks/useMediaUrl'
import { Eye, Coins, TrendingUp, Film, Clock, CheckCircle, XCircle, ArrowUpDown, Banknote } from 'lucide-react'

function ThumbImage({ url }) {
  const { src, handleError } = useMediaUrl(url)
  if (!src) {
    return (
      <div className="w-full h-full bg-gradient-to-br from-[#FDEDEE] to-[#F1D4D6] flex items-center justify-center">
        <Film size={12} className="text-[#D62839]" />
      </div>
    )
  }
  return <img src={src} alt="" onError={handleError} className="w-full h-full object-cover" />
}

function StatusBadge({ status, note }) {
  const map = {
    pending:  { label: 'Menunggu Review', color: 'bg-[#FEF3C7] text-[#D97706]', icon: Clock },
    approved: { label: 'Disetujui', color: 'bg-[#D1FAE5] text-[#059669]', icon: CheckCircle },
    rejected: { label: 'Ditolak', color: 'bg-[#FEE2E2] text-[#DC2626]', icon: XCircle },
  }
  const m = map[status] || map.pending
  const Icon = m.icon
  return (
    <div>
      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${m.color}`}>
        <Icon size={11} />{m.label}
      </span>
      {status === 'rejected' && note && (
        <p className="text-[#DC2626] text-xs mt-1 ml-1">Alasan: {note}</p>
      )}
    </div>
  )
}

export default function DashboardPage() {
  const { user, profile } = useAuthStore()
  const navigate = useNavigate()
  const [videos, setVideos] = useState([])
  const [stats, setStats] = useState({ totalViews: 0, totalPaid: 0, totalEarned: 0 })
  const [earningsByVideo, setEarningsByVideo] = useState({})
  const [viewsByVideo, setViewsByVideo] = useState({})
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState('created_at')

  // Baca min_payout dari app_settings — tombol cairkan aktif jika saldo >= min
  const { value: minPayoutStr } = useAppSetting('min_payout_koin', '50')
  const minPayout = parseInt(minPayoutStr ?? '50') || 50
  const creatorBalance = Number(profile?.saldo_koin_kreator ?? 0)
  const canPayout = creatorBalance >= minPayout

  useEffect(() => {
    if (!user) return
    setLoading(true)

    Promise.all([
      supabase.from('videos').select('*').eq('creator_id', user.id).eq('is_deleted', false).order('created_at', { ascending: false }),
      supabase.from('transactions').select('amount_koin, related_video_id').eq('user_id', user.id).eq('type', 'earning'),
      supabase.from('views').select('video_id, has_paid_to_continue, videos!inner(creator_id)').eq('videos.creator_id', user.id),
    ]).then(([vRes, eRes, viewRes]) => {
      const videoData = vRes.data ?? []
      const earningData = eRes.data ?? []
      const viewData = viewRes.data ?? []

      // Aggregate earnings per video
      const earnMap = {}
      earningData.forEach(t => {
        earnMap[t.related_video_id] = (earnMap[t.related_video_id] || 0) + t.amount_koin
      })

      // Aggregate views per video
      const viewMap = {}
      viewData.forEach(v => {
        if (!viewMap[v.video_id]) viewMap[v.video_id] = { total: 0, paid: 0 }
        viewMap[v.video_id].total++
        if (v.has_paid_to_continue) viewMap[v.video_id].paid++
      })

      const totalEarned = earningData.reduce((a, t) => a + t.amount_koin, 0)
      const totalPaid = viewData.filter(v => v.has_paid_to_continue).length
      const totalViews = viewData.length

      setVideos(videoData)
      setEarningsByVideo(earnMap)
      setViewsByVideo(viewMap)
      setStats({ totalViews, totalPaid, totalEarned })
      setLoading(false)
    })
  }, [user])

  const conversionRate = stats.totalViews > 0
    ? ((stats.totalPaid / stats.totalViews) * 100).toFixed(1) : '0'

  const sortedVideos = [...videos].sort((a, b) => {
    if (sortBy === 'earning') return (earningsByVideo[b.id] || 0) - (earningsByVideo[a.id] || 0)
    if (sortBy === 'views') return (viewsByVideo[b.id]?.total || 0) - (viewsByVideo[a.id]?.total || 0)
    return new Date(b.created_at) - new Date(a.created_at)
  })

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold text-[#1F2937]">Studio Kreator</h1>
          <p className="text-[#6B7280] text-sm mt-1">Pantau performa video dan pendapatanmu</p>
        </div>
        {/* Tombol cairkan koin — aktif hanya jika saldo >= min_payout dari app_settings */}
        <button
          onClick={() => navigate('/wallet', { state: { tab: 'payout' } })}
          disabled={!canPayout}
          title={!canPayout ? `Minimum ${minPayout} koin untuk cairkan` : ''}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
            canPayout
              ? 'bg-[#D62839] text-white hover:bg-[#B71C2B]'
              : 'bg-[#F3F4F6] text-[#9CA3AF] cursor-not-allowed'
          }`}
        >
          <Banknote size={15} />
          Cairkan Koin Biru ({creatorBalance.toLocaleString('id-ID', { maximumFractionDigits: 2 })})
        </button>
      </div>

      {/* Stats */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array(4).fill(0).map((_, i) => <div key={i} className="skeleton h-24 rounded-2xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard icon={Film} label="Total Video" value={videos.length} color="primary" />
          <StatCard icon={Eye} label="Total Penonton" value={stats.totalViews} color="muted" />
          <StatCard icon={Coins} label="Total Koin" value={`${stats.totalEarned} koin`} color="coin" />
          <StatCard icon={TrendingUp} label="Konversi" value={`${conversionRate}%`} subtitle={`${stats.totalPaid} bayar dari ${stats.totalViews}`} color="success" />
        </div>
      )}

      {/* Video list with per-video stats */}
      <div className="bg-white border border-[#F1D4D6] rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#F1D4D6] flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-bold text-[#1F2937]">Video Saya</h2>
          <div className="flex items-center gap-2">
            {/* Sort */}
            <div className="flex items-center gap-1 text-xs text-[#6B7280]">
              <ArrowUpDown size={12} />
              {[['created_at','Terbaru'],['earning','Penghasilan'],['views','Penonton']].map(([val, label]) => (
                <button key={val} onClick={() => setSortBy(val)}
                  className={`px-2.5 py-1 rounded-lg font-medium transition-all ${sortBy === val ? 'bg-[#D62839] text-white' : 'bg-[#FAFAFA] border border-[#F1D4D6] hover:border-[#D62839]'}`}>
                  {label}
                </button>
              ))}
            </div>
            <button onClick={() => navigate('/upload')}
              className="bg-[#D62839] text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-[#B71C2B] transition-colors">
              + Upload Baru
            </button>
          </div>
        </div>

        {loading ? (
          <div className="p-5 space-y-3">
            {Array(3).fill(0).map((_, i) => <div key={i} className="skeleton h-16 rounded-xl" />)}
          </div>
        ) : videos.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-3xl mb-2">🎬</p>
            <p className="font-semibold text-[#1F2937] mb-1">Belum ada video</p>
            <p className="text-[#6B7280] text-sm">Upload video pertamamu dan mulai berbagi ilmu!</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#FAFAFA] border-b border-[#F1D4D6]">
                <tr>
                  <th className="text-left px-5 py-3 text-[#6B7280] font-medium">Video</th>
                  <th className="text-center px-4 py-3 text-[#6B7280] font-medium">Penonton</th>
                  <th className="text-center px-4 py-3 text-[#6B7280] font-medium">Pembeli</th>
                  <th className="text-center px-4 py-3 text-[#6B7280] font-medium">Koin</th>
                  <th className="text-left px-4 py-3 text-[#6B7280] font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1D4D6]">
                {sortedVideos.map(v => {
                  const vStats = viewsByVideo[v.id] || { total: 0, paid: 0 }
                  const earned = earningsByVideo[v.id] || 0
                  return (
                    <tr key={v.id} className="hover:bg-[#FAFAFA] transition-colors cursor-pointer" onClick={() => navigate(`/video/${v.id}`)}>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-14 h-9 bg-[#FAFAFA] rounded-lg overflow-hidden flex-shrink-0">
                            <ThumbImage url={v.thumbnail_url} />
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-[#1F2937] text-sm truncate max-w-[180px] hover:text-[#D62839] transition-colors">{v.judul}</p>
                            <p className="text-[#6B7280] text-xs">{v.kategori} · {v.harga_koin > 0 ? `${v.harga_koin} koin` : 'Gratis'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span className="font-semibold text-[#1F2937]">{vStats.total}</span>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span className={`font-semibold ${vStats.paid > 0 ? 'text-[#059669]' : 'text-[#6B7280]'}`}>{vStats.paid}</span>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span className={`font-semibold ${earned > 0 ? 'text-[#D97706]' : 'text-[#6B7280]'}`}>
                          {earned > 0 ? `+${earned}` : '0'}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <StatusBadge status={v.status} note={v.rejection_note} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
