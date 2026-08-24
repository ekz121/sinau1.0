import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Flag, Clock, Loader2, CheckCircle, Trash2, ExternalLink } from 'lucide-react'
import toast from 'react-hot-toast'

const STATUS_MAP = {
  baru: { label: 'Baru', color: 'bg-[#FEF3C7] text-[#D97706]' },
  diproses: { label: 'Diproses', color: 'bg-[#DBEAFE] text-[#1D4ED8]' },
  selesai: { label: 'Selesai', color: 'bg-[#D1FAE5] text-[#059669]' },
}

export default function ReportsPage() {
  const navigate = useNavigate()
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [filter, setFilter] = useState('')

  const fetchReports = () => {
    setLoading(true)
    supabase
      .from('reports')
      .select('*, videos(id, judul), profiles!reporter_id(nama)')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setReports(data ?? [])
        setLoading(false)
      })
  }

  useEffect(() => { fetchReports() }, [])

  const updateStatus = async (reportId, newStatus) => {
    setUpdating(reportId)
    const { error } = await supabase
      .from('reports')
      .update({ status: newStatus })
      .eq('id', reportId)

    if (error) {
      toast.error('Gagal mengubah status')
    } else {
      setReports(rs => rs.map(r => r.id === reportId ? { ...r, status: newStatus } : r))
      toast.success('Status diperbarui')
    }
    setUpdating(null)
  }

  const deleteReport = async (reportId) => {
    if (!window.confirm('Hapus laporan ini? Tindakan ini tidak dapat dibatalkan.')) return
    setDeleting(reportId)
    const { error } = await supabase
      .from('reports')
      .delete()
      .eq('id', reportId)

    if (error) {
      toast.error('Gagal menghapus laporan: ' + error.message)
    } else {
      setReports(rs => rs.filter(r => r.id !== reportId))
      toast.success('Laporan dihapus')
    }
    setDeleting(null)
  }

  const deleteAllCompleted = async () => {
    const completed = reports.filter(r => r.status === 'selesai')
    if (completed.length === 0) { toast('Tidak ada laporan selesai untuk dihapus'); return }
    if (!window.confirm(`Hapus ${completed.length} laporan yang sudah selesai?`)) return

    const ids = completed.map(r => r.id)
    const { error } = await supabase
      .from('reports')
      .delete()
      .in('id', ids)

    if (error) {
      toast.error('Gagal menghapus: ' + error.message)
    } else {
      setReports(rs => rs.filter(r => r.status !== 'selesai'))
      toast.success(`${completed.length} laporan selesai dihapus`)
    }
  }

  const NEXT_STATUS = { baru: 'diproses', diproses: 'selesai', selesai: null }

  const filtered = filter ? reports.filter(r => r.status === filter) : reports

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-[#1F2937]">Laporan dari Pengguna</h1>
          <p className="text-[#6B7280] text-sm mt-1">
            {reports.filter(r => r.status === 'baru').length} laporan baru
          </p>
        </div>
        {reports.some(r => r.status === 'selesai') && (
          <button
            onClick={deleteAllCompleted}
            className="flex items-center gap-1.5 bg-white border border-[#FEE2E2] hover:bg-[#FEE2E2] text-[#DC2626] font-semibold px-4 py-2 rounded-xl text-xs transition-all"
          >
            <Trash2 size={13} /> Hapus Semua Selesai
          </button>
        )}
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        {['', 'baru', 'diproses', 'selesai'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              filter === f ? 'bg-[#D62839] text-white' : 'bg-white border border-[#F1D4D6] text-[#6B7280] hover:border-[#D62839]'
            }`}
          >
            {f === '' ? 'Semua' : STATUS_MAP[f]?.label || f}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {loading ? (
          Array(3).fill(0).map((_, i) => <div key={i} className="skeleton h-28 rounded-2xl" />)
        ) : filtered.length === 0 ? (
          <div className="bg-white border border-[#F1D4D6] rounded-2xl p-12 text-center">
            <Flag className="w-10 h-10 text-[#6B7280] mx-auto mb-2" />
            <p className="text-[#6B7280] text-sm">Tidak ada laporan</p>
          </div>
        ) : (
          filtered.map((r) => {
            const statusMeta = STATUS_MAP[r.status] || STATUS_MAP.baru
            const next = NEXT_STATUS[r.status]
            return (
              <div key={r.id} className="bg-white border border-[#F1D4D6] rounded-2xl p-5">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-start gap-2 flex-1 min-w-0">
                    <Flag size={15} className="text-[#D62839] flex-shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-[#1F2937] text-sm truncate">{r.videos?.judul || 'Video Dihapus'}</p>
                        {r.videos?.id && (
                          <button
                            onClick={() => navigate(`/video/${r.videos.id}`)}
                            className="flex items-center gap-1 text-[#D62839] hover:underline text-xs font-medium flex-shrink-0"
                          >
                            <ExternalLink size={11} /> Lihat
                          </button>
                        )}
                      </div>
                      <p className="text-[#6B7280] text-xs mt-0.5">
                        dilaporkan oleh <span className="font-medium">{r.profiles?.nama || 'User'}</span>
                        {' · '}{new Date(r.created_at).toLocaleDateString('id-ID')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${statusMeta.color}`}>
                      {statusMeta.label}
                    </span>
                    <button
                      onClick={() => deleteReport(r.id)}
                      disabled={deleting === r.id}
                      className="p-1.5 rounded-lg hover:bg-[#FEE2E2] text-[#6B7280] hover:text-[#DC2626] transition-colors"
                      title="Hapus laporan"
                    >
                      {deleting === r.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                    </button>
                  </div>
                </div>

                <p className="text-[#1F2937] text-sm bg-[#FAFAFA] rounded-xl px-3 py-2 mb-3">
                  "{r.alasan}"
                </p>

                {next && (
                  <button
                    onClick={() => updateStatus(r.id, next)}
                    disabled={updating === r.id}
                    className="flex items-center gap-1.5 text-xs font-semibold text-[#D62839] hover:underline transition-colors"
                  >
                    {updating === r.id ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <CheckCircle size={12} />
                    )}
                    Tandai "{STATUS_MAP[next]?.label}"
                  </button>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
