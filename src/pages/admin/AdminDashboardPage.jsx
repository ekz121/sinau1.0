import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAppSetting } from '../../hooks/useAppSettings'
import { Users, Film, CreditCard, Flag, Clock, TrendingUp, Coins, ArrowUpRight, Wifi, WifiOff } from 'lucide-react'

function StatCard({ icon: Icon, label, value, sub, color = 'red', onClick }) {
  const colors = {
    red:    'bg-[#FDEDEE] text-[#D62839]',
    green:  'bg-[#D1FAE5] text-[#059669]',
    yellow: 'bg-[#FEF3C7] text-[#D97706]',
    blue:   'bg-[#DBEAFE] text-[#1D4ED8]',
  }
  return (
    <div onClick={onClick} className={`bg-white border border-[#F1D4D6] rounded-2xl p-5 group transition-all duration-200 ${onClick ? 'cursor-pointer hover:border-[#D62839] hover:shadow-md' : ''}`}>
      <div className="flex items-center justify-between mb-3">
        <div className={`w-10 h-10 ${colors[color]} rounded-xl flex items-center justify-center`}>
          <Icon size={20} />
        </div>
        {onClick && (
          <ArrowUpRight size={16} className="text-[#6B7280] group-hover:text-[#D62839] transition-colors" />
        )}
      </div>
      <p className="text-2xl font-extrabold text-[#1F2937]">{value ?? '—'}</p>
      <p className="text-[#6B7280] text-sm mt-0.5 font-medium">{label}</p>
      {sub && <p className="text-xs text-[#6B7280] mt-1">{sub}</p>}
    </div>
  )
}

export default function AdminDashboardPage() {
  const navigate = useNavigate()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [realtimeStatus, setRealtimeStatus] = useState('connecting')
  const channelsRef = useRef([])
  const { value: revenueSplitStr } = useAppSetting('revenue_split_creator', '80')
  const platformPct = 100 - (parseInt(revenueSplitStr ?? '80') || 80)

  const fetchStats = async () => {
    const [usersRes, videosRes, txRes, reportsRes, topupRes, payoutRes] = await Promise.all([
      supabase.from('profiles').select('id', { count: 'exact' }).eq('role', 'mahasiswa'),
      supabase.from('videos').select('id, status', { count: 'exact' }).eq('is_deleted', false),
      supabase.from('transactions').select('type, amount_koin, created_at'),
      supabase.from('reports').select('id', { count: 'exact' }).eq('status', 'baru'),
      supabase.from('topup_requests').select('id', { count: 'exact' }).eq('status', 'pending'),
      supabase.from('payout_requests').select('id', { count: 'exact' }).eq('status', 'pending'),
    ])

    const videos = videosRes.data ?? []
    const txs = txRes.data ?? []
    const totalTopupKoin = txs.filter(t => t.type === 'topup').reduce((a, t) => a + t.amount_koin, 0)
    const totalPurchase = txs.filter(t => t.type === 'purchase').reduce((a, t) => a + t.amount_koin, 0)
    const totalEarning = txs.filter(t => t.type === 'earning').reduce((a, t) => a + t.amount_koin, 0)

    const approvedCount = videos.filter(v => v.status === 'approved').length
    const pendingCount = videos.filter(v => v.status === 'pending').length
    const rejectedCount = videos.filter(v => v.status === 'rejected').length

    setStats({
      totalUsers: usersRes.count ?? 0,
      totalVideos: videos.length,
      pendingVideos: pendingCount,
      approvedVideos: approvedCount,
      rejectedVideos: rejectedCount,
      totalTopupKoin,
      totalPurchase,
      totalEarning,
      platformRevenue: Math.floor(totalPurchase * platformPct / 100),
      platformPct,
      pendingReports: reportsRes.count ?? 0,
      pendingTopup: topupRes.count ?? 0,
      pendingPayout: payoutRes.count ?? 0,
    })
    setLoading(false)
  }

  useEffect(() => {
    fetchStats()

    // Setup realtime subscriptions
    const setupRealtime = () => {
      setRealtimeStatus('connecting')
      
      // Clean up existing channels
      channelsRef.current.forEach(ch => supabase.removeChannel(ch))
      channelsRef.current = []

      // Subscribe to key tables for realtime updates
      const channels = [
        supabase
          .channel('admin-dashboard-profiles')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: 'role=eq.mahasiswa' }, () => fetchStats())
          .subscribe((status) => {
            if (status === 'SUBSCRIBED') setRealtimeStatus('connected')
            else if (status === 'CHANNEL_ERROR' || status === 'CLOSED') setRealtimeStatus('disconnected')
          }),
        
        supabase
          .channel('admin-dashboard-videos')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'videos' }, () => fetchStats())
          .subscribe(),
        
        supabase
          .channel('admin-dashboard-transactions')
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'transactions' }, () => fetchStats())
          .subscribe(),
        
        supabase
          .channel('admin-dashboard-reports')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'reports', filter: 'status=eq.baru' }, () => fetchStats())
          .subscribe(),
        
        supabase
          .channel('admin-dashboard-topup')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'topup_requests', filter: 'status=eq.pending' }, () => fetchStats())
          .subscribe(),
        
        supabase
          .channel('admin-dashboard-payout')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'payout_requests', filter: 'status=eq.pending' }, () => fetchStats())
          .subscribe(),
      ]

      channelsRef.current = channels
    }

    setupRealtime()

    return () => {
      channelsRef.current.forEach(ch => supabase.removeChannel(ch))
      channelsRef.current = []
    }
  }, [platformPct])

  const pendingActions = !stats ? 0 :
    stats.pendingVideos + stats.pendingReports + stats.pendingTopup + stats.pendingPayout

  const realtimeColor = realtimeStatus === 'connected' ? 'text-[#059669]' : realtimeStatus === 'connecting' ? 'text-[#F59E0B]' : 'text-[#DC2626]'
  const _realtimeIconComponent = realtimeStatus === 'connected' ? Wifi : WifiOff
  const realtimeText = realtimeStatus === 'connected' ? 'Real-time aktif' : realtimeStatus === 'connecting' ? 'Menghubungkan...' : 'Offline'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-[#1F2937]">Dashboard Admin</h1>
          <p className="text-[#6B7280] text-sm mt-1">
            {pendingActions > 0
              ? <span className="text-[#D97706] font-semibold">{pendingActions} item membutuhkan perhatian</span>
              : 'Semua beres! Tidak ada antrian pending.'}
          </p>
        </div>
        <div className={`flex items-center gap-1.5 text-xs font-medium ${realtimeColor}`}>
          <realtimeIconComponent size={12} /> {realtimeText}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array(8).fill(0).map((_, i) => <div key={i} className="skeleton h-32 rounded-2xl" />)}
        </div>
      ) : (
        <>
          {/* Pending Actions Alert */}
          {pendingActions > 0 && (
            <div className="bg-[#FEF3C7] border border-[#FDE68A] rounded-2xl p-4">
              <p className="font-bold text-[#D97706] mb-3 flex items-center gap-2">
                <Clock size={16} /> Perlu Ditindaklanjuti
              </p>
              <div className="flex flex-wrap gap-2">
                {stats.pendingVideos > 0 && (
                  <button onClick={() => navigate('/admin/review')}
                    className="flex items-center gap-1.5 bg-white border border-[#FDE68A] text-[#D97706] px-3 py-1.5 rounded-lg text-sm font-semibold hover:bg-[#FEF3C7] transition-colors">
                    <Film size={13} /> {stats.pendingVideos} video pending
                  </button>
                )}
                {stats.pendingTopup > 0 && (
                  <button onClick={() => navigate('/admin/transaksi')}
                    className="flex items-center gap-1.5 bg-white border border-[#FDE68A] text-[#D97706] px-3 py-1.5 rounded-lg text-sm font-semibold hover:bg-[#FEF3C7] transition-colors">
                    <Coins size={13} /> {stats.pendingTopup} top-up pending
                  </button>
                )}
                {stats.pendingPayout > 0 && (
                  <button onClick={() => navigate('/admin/transaksi')}
                    className="flex items-center gap-1.5 bg-white border border-[#FDE68A] text-[#D97706] px-3 py-1.5 rounded-lg text-sm font-semibold hover:bg-[#FEF3C7] transition-colors">
                    <CreditCard size={13} /> {stats.pendingPayout} payout pending
                  </button>
                )}
                {stats.pendingReports > 0 && (
                  <button onClick={() => navigate('/admin/laporan')}
                    className="flex items-center gap-1.5 bg-white border border-[#FDE68A] text-[#D97706] px-3 py-1.5 rounded-lg text-sm font-semibold hover:bg-[#FEF3C7] transition-colors">
                    <Flag size={13} /> {stats.pendingReports} laporan baru
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Key Stat Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard icon={Users} label="Total Mahasiswa" value={stats.totalUsers} color="blue"
              onClick={() => navigate('/admin/users')} />
            <StatCard icon={Film} label="Total Video" value={stats.totalVideos}
              sub={`${stats.approvedVideos} approved · ${stats.pendingVideos} pending`} color="red"
              onClick={() => navigate('/admin/videos')} />
            <StatCard icon={Coins} label="Total Top Up" value={`${stats.totalTopupKoin} koin`}
              sub={`≈ Rp${(stats.totalTopupKoin * 500).toLocaleString('id-ID')}`} color="yellow"
              onClick={() => navigate('/admin/transaksi')} />
            <StatCard icon={TrendingUp} label="Revenue Platform" value={`${stats.platformRevenue} koin`}
              sub={`${stats.platformPct}% dari transaksi video`} color="green"
              onClick={() => navigate('/admin/transaksi')} />
          </div>

          {/* Interactive Breakdown Charts */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Status Breakdown Video */}
            <div className="bg-white border border-[#F1D4D6] rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-[#1F2937] flex items-center gap-2 text-sm">
                  <Film size={16} className="text-[#D62839]" /> Distribusi Status Video
                </h3>
                <span className="text-xs text-[#6B7280] font-medium">{stats.totalVideos} video</span>
              </div>
              {stats.totalVideos === 0 ? (
                <p className="text-xs text-[#6B7280]">Belum ada video terdaftar</p>
              ) : (
                <div className="space-y-3">
                  <div className="h-3 w-full bg-[#FAFAFA] rounded-full overflow-hidden flex border border-[#F1D4D6]">
                    <div style={{ width: `${(stats.approvedVideos / stats.totalVideos) * 100}%` }} className="bg-[#059669]" />
                    <div style={{ width: `${(stats.pendingVideos / stats.totalVideos) * 100}%` }} className="bg-[#F59E0B]" />
                    <div style={{ width: `${(stats.rejectedVideos / stats.totalVideos) * 100}%` }} className="bg-[#DC2626]" />
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#059669]" />
                      <span className="text-[#6B7280]">Disetujui: <strong className="text-[#1F2937]">{stats.approvedVideos}</strong></span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#F59E0B]" />
                      <span className="text-[#6B7280]">Pending: <strong className="text-[#1F2937]">{stats.pendingVideos}</strong></span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#DC2626]" />
                      <span className="text-[#6B7280]">Ditolak: <strong className="text-[#1F2937]">{stats.rejectedVideos}</strong></span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Ekonomi Platform Breakdown */}
            <div className="bg-white border border-[#F1D4D6] rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-[#1F2937] flex items-center gap-2 text-sm">
                  <Coins size={16} className="text-[#F59E0B]" /> Ringkasan Ekonomi Platform
                </h3>
                <span className="text-xs text-[#6B7280] font-medium">1 koin = Rp500</span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-[#FAFAFA] border border-[#F1D4D6] p-3 rounded-xl">
                  <p className="text-[#6B7280] font-medium mb-1">Total Volume Pembelian</p>
                  <p className="text-lg font-bold text-[#1F2937]">{stats.totalPurchase} koin</p>
                </div>
                <div className="bg-[#FAFAFA] border border-[#F1D4D6] p-3 rounded-xl">
                  <p className="text-[#6B7280] font-medium mb-1">Pendapatan Kreator</p>
                  <p className="text-lg font-bold text-[#059669]">{stats.totalEarning} koin</p>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
