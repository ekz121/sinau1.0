import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Flag, Loader2, CheckCircle, Trash2, ExternalLink, XCircle } from 'lucide-react'
import toast from 'react-hot-toast'

const STATUS_MAP = {
  baru: { label: 'Baru', color: 'bg-[#FEF3C7] text-[#D97706]' },
  diproses: { label: 'Diproses', color: 'bg-[#DBEAFE] text-[#1D4ED8]' },
  selesai: { label: 'Selesai', color: 'bg-[#D1FAE5] text-[#059669]' },
  ditolak: { label: 'Diabaikan', color: 'bg-[#F3F4F6] text-[#6B7280]' },
}

export default function ReportsPage() {
  const navigate = useNavigate()
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(null)
  const [filter, setFilter] = useState('')

  const fetchReports = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('reports')
      .select('*, videos(id, judul), comments(id, content, video_id), profiles!reporter_id(nama)')
      .order('created_at', { ascending: false })
    if (error) toast.error('Gagal memuat laporan')
    setReports(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchReports()
    const channel = supabase.channel('admin-reports')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reports' }, fetchReports)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchReports])

  const resolve = async (report, action) => {
    if (action === 'delete_comment' && !window.confirm('Hapus komentar yang dilaporkan?')) return
    setProcessing(report.id)
    try {
      const { data, error } = await supabase.functions.invoke('admin-resolve-report', {
        body: { report_id: report.id, action },
      })
      if (error || data?.error) throw new Error(data?.error || error?.message || 'Gagal memproses laporan')
      toast.success(action === 'delete_comment' ? 'Komentar dihapus' : action === 'dismiss' ? 'Laporan diabaikan' : 'Laporan diperbarui')
      await fetchReports()
    } catch (error) {
      toast.error(error.message)
    } finally {
      setProcessing(null)
    }
  }

  const filtered = filter ? reports.filter((report) => report.status === filter) : reports

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-[#1F2937]">Laporan dari Pengguna</h1>
        <p className="text-[#6B7280] text-sm mt-1">{reports.filter((report) => report.status === 'baru').length} laporan baru</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {['', 'baru', 'diproses', 'selesai', 'ditolak'].map((value) => (
          <button key={value} onClick={() => setFilter(value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${filter === value ? 'bg-[#D62839] text-white' : 'bg-white border border-[#F1D4D6] text-[#6B7280] hover:border-[#D62839]'}`}>
            {value === '' ? 'Semua' : STATUS_MAP[value].label}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {loading ? Array(3).fill(0).map((_, index) => <div key={index} className="skeleton h-32 rounded-2xl" />)
          : filtered.length === 0 ? (
            <div className="bg-white border border-[#F1D4D6] rounded-2xl p-12 text-center">
              <Flag className="w-10 h-10 text-[#6B7280] mx-auto mb-2" />
              <p className="text-[#6B7280] text-sm">Tidak ada laporan</p>
            </div>
          ) : filtered.map((report) => {
            const isComment = Boolean(report.comment_id)
            const videoId = report.video_id || report.comments?.video_id
            const status = STATUS_MAP[report.status] || STATUS_MAP.baru
            return (
              <article key={report.id} className="bg-white border border-[#F1D4D6] rounded-2xl p-5 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2 min-w-0">
                    <Flag size={15} className="text-[#D62839] mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-semibold text-[#1F2937] text-sm">
                        {isComment ? 'Komentar dilaporkan' : report.videos?.judul || 'Video dihapus'}
                      </p>
                      <p className="text-[#6B7280] text-xs mt-0.5">
                        oleh {report.profiles?.nama || 'User'} · {new Date(report.created_at).toLocaleDateString('id-ID')}
                      </p>
                    </div>
                  </div>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${status.color}`}>{status.label}</span>
                </div>

                {isComment && (
                  <p className="text-sm text-[#1F2937] bg-[#F9FAFB] border border-dashed border-[#E5E7EB] rounded-xl px-3 py-2">
                    “{report.comments?.content || '[Komentar sudah dihapus]'}”
                  </p>
                )}
                <p className="text-sm text-[#1F2937] bg-[#FAFAFA] rounded-xl px-3 py-2">Alasan: “{report.alasan}”</p>

                <div className="flex flex-wrap gap-2">
                  {videoId && (
                    <button onClick={() => navigate(`/video/${videoId}`)} className="flex items-center gap-1 text-xs font-semibold text-[#D62839] hover:underline">
                      <ExternalLink size={12} /> Lihat konteks
                    </button>
                  )}
                  {report.status === 'baru' && (
                    <button onClick={() => resolve(report, 'process')} disabled={processing === report.id} className="flex items-center gap-1 text-xs font-semibold text-[#2563EB] hover:underline">
                      <CheckCircle size={12} /> Tandai diproses
                    </button>
                  )}
                  {isComment && !['selesai', 'ditolak'].includes(report.status) && (
                    <button onClick={() => resolve(report, 'delete_comment')} disabled={processing === report.id} className="flex items-center gap-1 text-xs font-semibold text-[#DC2626] hover:underline">
                      {processing === report.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />} Hapus komentar
                    </button>
                  )}
                  {!isComment && !['selesai', 'ditolak'].includes(report.status) && (
                    <button onClick={() => resolve(report, 'resolve')} disabled={processing === report.id} className="flex items-center gap-1 text-xs font-semibold text-[#059669] hover:underline">
                      <CheckCircle size={12} /> Selesaikan
                    </button>
                  )}
                  {!['selesai', 'ditolak'].includes(report.status) && (
                    <button onClick={() => resolve(report, 'dismiss')} disabled={processing === report.id} className="flex items-center gap-1 text-xs font-semibold text-[#6B7280] hover:underline">
                      <XCircle size={12} /> Abaikan
                    </button>
                  )}
                </div>
              </article>
            )
          })}
      </div>
    </div>
  )
}
