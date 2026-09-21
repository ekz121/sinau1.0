import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useWalletStore } from '../../stores/walletStore'
import { useCategoryNames } from '../../hooks/useCategories'
import { CheckCircle, XCircle, Play, Loader2, Search, X, ChevronLeft, ChevronRight, CheckSquare, Square } from 'lucide-react'
import toast from 'react-hot-toast'

const PAGE_SIZE = 10

export default function VideoReviewPage() {
  const [videos, setVideos] = useState([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(null)
  const [bulkProcessing, setBulkProcessing] = useState(false)
  const [selectedIds, setSelectedIds] = useState([])
  
  const [selected, setSelected] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [sort, setSort] = useState('desc')
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  
  const { getSignedVideoUrl } = useWalletStore()
  const categoryNames = useCategoryNames()

  const fetchVideos = async () => {
    setLoading(true)
    let query = supabase
      .from('videos')
      .select('*, profiles(nama)', { count: 'exact' })
      .eq('status', 'pending')
      .eq('is_deleted', false)
      .order('created_at', { ascending: sort === 'asc' })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    if (search.trim()) query = query.ilike('judul', `%${search.trim()}%`)
    if (category) query = query.eq('kategori', category)

    const { data, count } = await query
    setVideos(data ?? [])
    setTotal(count ?? 0)
    setSelectedIds([])
    setLoading(false)
  }

  useEffect(() => { fetchVideos() }, [search, category, sort, page])

  const openModal = async (video) => {
    setSelected(video)
    setPreviewUrl(null)
    setPreviewLoading(true)
    try {
      const url = await getSignedVideoUrl(video.id)
      setPreviewUrl(url)
    } catch {
      toast.error('Gagal memuat preview video')
    } finally {
      setPreviewLoading(false)
    }
  }

  const closeModal = () => { setSelected(null); setPreviewUrl(null) }

  const moderate = async (videoId, action, note = '') => {
    setProcessing(videoId)
    try {
      const { data, error } = await supabase.functions.invoke('admin-moderate-video', {
        body: { video_id: videoId, action, rejection_note: note },
      })
      if (error || data?.error) throw new Error(data?.error || error?.message || 'Gagal moderasi video')

      toast.success(action === 'approve' ? 'Video disetujui ✅' : 'Video ditolak')
      closeModal()
      fetchVideos()
    } catch (err) {
      toast.error(err.message || 'Gagal moderasi video')
    } finally {
      setProcessing(null)
    }
  }

  const handleReject = async (videoId) => {
    const note = window.prompt('Alasan penolakan (wajib diisi):')
    if (!note?.trim()) return
    await moderate(videoId, 'reject', note)
  }

  // Bulk actions
  const toggleSelectAll = () => {
    if (selectedIds.length === videos.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(videos.map(v => v.id))
    }
  }

  const toggleSelect = (id) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(i => i !== id))
    } else {
      setSelectedIds([...selectedIds, id])
    }
  }

  const handleBulkModerate = async (action) => {
    if (selectedIds.length === 0) return
    let note = ''
    if (action === 'reject') {
      note = window.prompt(`Alasan penolakan untuk ${selectedIds.length} video (wajib):`)
      if (!note?.trim()) return
    } else {
      if (!window.confirm(`Setujui ${selectedIds.length} video secara masal?`)) return
    }

    setBulkProcessing(true)
    let successCount = 0
    let failCount = 0

    for (const vid of selectedIds) {
      try {
        const { data, error } = await supabase.functions.invoke('admin-moderate-video', {
          body: { video_id: vid, action, rejection_note: note?.trim() || null },
        })
        if (error || data?.error) { failCount++; continue }
        successCount++
      } catch {
        failCount++
      }
    }

    toast.success(`Selesai! ${successCount} video berhasil di-${action === 'approve' ? 'setujui' : 'tolak'}${failCount > 0 ? `, ${failCount} gagal` : ''}.`)
    setBulkProcessing(false)
    setSelectedIds([])
    fetchVideos()
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-[#1F2937]">Antrian Review Video</h1>
          <p className="text-[#6B7280] text-sm mt-1">{total} video menunggu persetujuan</p>
        </div>

        {/* Bulk Action Controls */}
        {selectedIds.length > 0 && (
          <div className="flex items-center gap-2 bg-[#FAFAFA] border border-[#F1D4D6] p-1.5 rounded-xl">
            <span className="text-xs font-semibold text-[#1F2937] px-2">{selectedIds.length} terpilih</span>
            <button
              onClick={() => handleBulkModerate('approve')}
              disabled={bulkProcessing}
              className="flex items-center gap-1 bg-[#059669] hover:bg-[#047857] disabled:opacity-50 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
            >
              {bulkProcessing ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />} Approve All
            </button>
            <button
              onClick={() => handleBulkModerate('reject')}
              disabled={bulkProcessing}
              className="flex items-center gap-1 bg-[#DC2626] hover:bg-[#B91C1C] disabled:opacity-50 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
            >
              {bulkProcessing ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />} Reject All
            </button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B7280]" />
          <input
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0) }}
            placeholder="Cari judul..."
            className="w-full pl-8 pr-3 py-2 bg-white border border-[#F1D4D6] rounded-xl text-sm focus:outline-none focus:border-[#D62839]"
          />
        </div>
        <select
          value={category}
          onChange={e => { setCategory(e.target.value); setPage(0) }}
          className="px-3 py-2 bg-white border border-[#F1D4D6] rounded-xl text-sm focus:outline-none focus:border-[#D62839]"
        >
          <option value="">Semua Kategori</option>
          {categoryNames.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          value={sort}
          onChange={e => setSort(e.target.value)}
          className="px-3 py-2 bg-white border border-[#F1D4D6] rounded-xl text-sm focus:outline-none focus:border-[#D62839]"
        >
          <option value="desc">Terbaru</option>
          <option value="asc">Terlama</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white border border-[#F1D4D6] rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {Array(5).fill(0).map((_, i) => <div key={i} className="skeleton h-14 rounded-xl" />)}
          </div>
        ) : videos.length === 0 ? (
          <div className="text-center py-16">
            <CheckCircle className="w-12 h-12 text-[#059669] mx-auto mb-3" />
            <p className="font-semibold text-[#1F2937]">Tidak ada video pending</p>
          </div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead className="bg-[#FAFAFA] border-b border-[#F1D4D6]">
                <tr>
                  <th className="px-4 py-3 text-left w-10">
                    <button onClick={toggleSelectAll} className="text-[#6B7280] hover:text-[#D62839]">
                      {selectedIds.length === videos.length ? <CheckSquare size={16} className="text-[#D62839]" /> : <Square size={16} />}
                    </button>
                  </th>
                  <th className="text-left px-5 py-3 text-[#6B7280] font-medium">Judul</th>
                  <th className="text-left px-4 py-3 text-[#6B7280] font-medium">Kreator</th>
                  <th className="text-left px-4 py-3 text-[#6B7280] font-medium">Kategori</th>
                  <th className="text-left px-4 py-3 text-[#6B7280] font-medium">Tanggal</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1D4D6]">
                {videos.map(v => (
                  <tr key={v.id} className={`hover:bg-[#FAFAFA] transition-colors ${selectedIds.includes(v.id) ? 'bg-[#FDEDEE]/40' : ''}`}>
                    <td className="px-4 py-3.5 text-left">
                      <button onClick={() => toggleSelect(v.id)} className="text-[#6B7280] hover:text-[#D62839]">
                        {selectedIds.includes(v.id) ? <CheckSquare size={16} className="text-[#D62839]" /> : <Square size={16} />}
                      </button>
                    </td>
                    <td className="px-5 py-3.5 font-medium text-[#1F2937] max-w-xs truncate">{v.judul}</td>
                    <td className="px-4 py-3.5 text-[#6B7280]">{v.profiles?.nama || '-'}</td>
                    <td className="px-4 py-3.5 text-[#6B7280]">{v.kategori || '-'}</td>
                    <td className="px-4 py-3.5 text-[#6B7280] whitespace-nowrap">
                      {new Date(v.created_at).toLocaleDateString('id-ID')}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <button
                        onClick={() => openModal(v)}
                        className="inline-flex items-center gap-1.5 bg-[#FDEDEE] text-[#D62839] hover:bg-[#D62839] hover:text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                      >
                        <Play size={11} className="fill-current" /> Review
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-5 py-3 border-t border-[#F1D4D6] flex items-center justify-between">
                <span className="text-[#6B7280] text-xs">
                  {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} dari {total}
                </span>
                <div className="flex gap-1">
                  <button onClick={() => setPage(p => p - 1)} disabled={page === 0}
                    className="p-1.5 rounded-lg border border-[#F1D4D6] disabled:opacity-40 hover:border-[#D62839] transition-colors">
                    <ChevronLeft size={14} />
                  </button>
                  <button onClick={() => setPage(p => p + 1)} disabled={page >= totalPages - 1}
                    className="p-1.5 rounded-lg border border-[#F1D4D6] disabled:opacity-40 hover:border-[#D62839] transition-colors">
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal Detail */}
      {selected && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={closeModal}>
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#F1D4D6]">
              <h2 className="font-bold text-[#1F2937] truncate pr-4">{selected.judul}</h2>
              <button onClick={closeModal} className="text-[#6B7280] hover:text-[#D62839] flex-shrink-0">
                <X size={18} />
              </button>
            </div>

            {/* Player */}
            <div className="bg-black aspect-video flex items-center justify-center">
              {previewLoading ? (
                <Loader2 className="w-8 h-8 text-white animate-spin" />
              ) : previewUrl ? (
                <video src={previewUrl} controls controlsList="nodownload noremoteplayback" disablePictureInPicture onContextMenu={e => e.preventDefault()} className="w-full h-full" />
              ) : (
                <p className="text-white/60 text-sm">Preview tidak tersedia</p>
              )}
            </div>

            <div className="p-5 space-y-3">
              <div className="text-sm text-[#6B7280] space-y-1">
                <p>Kreator: <span className="font-medium text-[#1F2937]">{selected.profiles?.nama || '-'}</span></p>
                <p>Kategori: <span className="font-medium text-[#1F2937]">{selected.kategori || '-'}</span></p>
                <p>Harga: <span className="font-medium text-[#1F2937]">{selected.harga_koin > 0 ? `${selected.harga_koin} koin` : 'Gratis'}</span></p>
              </div>
              {selected.deskripsi && (
                <p className="text-sm text-[#6B7280] bg-[#FAFAFA] rounded-xl px-3 py-2.5">{selected.deskripsi}</p>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => moderate(selected.id, 'approve')}
                  disabled={processing === selected.id}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-[#059669] hover:bg-[#047857] disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors"
                >
                  {processing === selected.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                  Setujui
                </button>
                <button
                  onClick={() => handleReject(selected.id)}
                  disabled={processing === selected.id}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-[#DC2626] hover:bg-[#B91C1C] disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors"
                >
                  {processing === selected.id ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
                  Tolak
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
