import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useWalletStore } from '../../stores/walletStore'
import { useCategoryNames } from '../../hooks/useCategories'
import { Search, Play, Trash2, Edit2, X, Loader2, CheckCircle, XCircle, ChevronLeft, ChevronRight, Check } from 'lucide-react'
import toast from 'react-hot-toast'

const PAGE_SIZE = 15

const STATUS_BADGE = {
  pending: 'bg-[#FEF3C7] text-[#D97706]',
  approved: 'bg-[#D1FAE5] text-[#059669]',
  rejected: 'bg-[#FEE2E2] text-[#DC2626]',
}

export default function AllVideosPage() {
  const [videos, setVideos] = useState([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [sort, setSort] = useState('created_at')

  const [selected, setSelected] = useState(null) // modal detail/edit
  const [mode, setMode] = useState('view') // 'view' | 'edit'
  const [previewUrl, setPreviewUrl] = useState(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [editForm, setEditForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(null)
  const [showDeleted, setShowDeleted] = useState(false)

  const { getSignedVideoUrl } = useWalletStore()
  const categoryNames = useCategoryNames()

  const fetchVideos = async () => {
    setLoading(true)
    let query = supabase
      .from('videos')
      .select('*, profiles(nama)', { count: 'exact' })
      .order(sort, { ascending: sort === 'harga_koin' })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    if (!showDeleted) query = query.eq('is_deleted', false)

    if (search.trim()) query = query.ilike('judul', `%${search.trim()}%`)
    if (statusFilter) query = query.eq('status', statusFilter)
    if (categoryFilter) query = query.eq('kategori', categoryFilter)

    const { data, count } = await query
    setVideos(data ?? [])
    setTotal(count ?? 0)
    setLoading(false)
  }

  useEffect(() => { fetchVideos() }, [search, statusFilter, categoryFilter, sort, page, showDeleted])

  const openView = async (video) => {
    setSelected(video)
    setMode('view')
    setPreviewUrl(null)
    setPreviewLoading(true)
    try {
      const url = await getSignedVideoUrl(video.id)
      setPreviewUrl(url)
    } catch {
      // preview not available
    } finally {
      setPreviewLoading(false)
    }
  }

  const openEdit = (video) => {
    setSelected(video)
    setMode('edit')
    setEditForm({
      judul: video.judul,
      deskripsi: video.deskripsi || '',
      kategori: video.kategori || '',
    })
  }

  const closeModal = () => { setSelected(null); setPreviewUrl(null) }

  const saveEdit = async () => {
    if (!editForm.judul?.trim() || !editForm.kategori) {
      toast.error('Judul dan kategori wajib diisi')
      return
    }
    setSaving(true)
    try {
      const { data, error } = await supabase.functions.invoke('admin-moderate-video', {
        body: { video_id: selected.id, action: 'edit', metadata: editForm },
      })
      if (error || data?.error) throw new Error(data?.error || error?.message || 'Gagal menyimpan video')
      toast.success('Video diperbarui')
      closeModal()
      fetchVideos()
    } catch (error) {
      toast.error(error.message)
    } finally {
      setSaving(false)
    }
  }

  const softDelete = async (videoId) => {
    if (!window.confirm('Hapus video ini? Video tidak akan muncul di platform.')) return
    setDeleting(videoId)
    try {
      const { data, error } = await supabase.functions.invoke('admin-moderate-video', {
        body: { video_id: videoId, action: 'delete' },
      })
      if (error || data?.error) throw new Error(data?.error || error?.message || 'Gagal menghapus video')
      toast.success('Video dan file penyimpanannya dihapus')
      closeModal()
      fetchVideos()
    } catch (error) {
      toast.error(error.message)
    } finally {
      setDeleting(null)
    }
  }

  const moderate = async (videoId, action) => {
    const note = action === 'reject' ? window.prompt('Alasan penolakan:') : ''
    if (action === 'reject' && !note?.trim()) return
    setSaving(true)
    try {
      const { data, error } = await supabase.functions.invoke('admin-moderate-video', {
        body: { video_id: videoId, action, rejection_note: note },
      })
      if (error || data?.error) throw new Error(data?.error || error?.message || 'Gagal moderasi video')

      toast.success(action === 'approve' ? 'Video disetujui ✅' : 'Video ditolak')
      closeModal()
      fetchVideos()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-[#1F2937]">Semua Video</h1>
        <p className="text-[#6B7280] text-sm mt-1">{total} video di sistem</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B7280]" />
          <input
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0) }}
            placeholder="Cari judul atau kreator..."
            className="w-full pl-8 pr-3 py-2 bg-white border border-[#F1D4D6] rounded-xl text-sm focus:outline-none focus:border-[#D62839]"
          />
        </div>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(0) }}
          className="px-3 py-2 bg-white border border-[#F1D4D6] rounded-xl text-sm focus:outline-none focus:border-[#D62839]">
          <option value="">Semua Status</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
        <select value={categoryFilter} onChange={e => { setCategoryFilter(e.target.value); setPage(0) }}
          className="px-3 py-2 bg-white border border-[#F1D4D6] rounded-xl text-sm focus:outline-none focus:border-[#D62839]">
          <option value="">Semua Kategori</option>
          {categoryNames.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={sort} onChange={e => setSort(e.target.value)}
          className="px-3 py-2 bg-white border border-[#F1D4D6] rounded-xl text-sm focus:outline-none focus:border-[#D62839]">
          <option value="created_at">Terbaru</option>
          <option value="view_count">Terpopuler</option>
          <option value="harga_koin">Termurah</option>
        </select>
        <button
          onClick={() => { setShowDeleted(d => !d); setPage(0) }}
          className={`px-3 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${showDeleted ? 'bg-[#DC2626] text-white' : 'bg-white border border-[#F1D4D6] text-[#6B7280] hover:border-[#D62839]'}`}
        >
          {showDeleted ? '🗑️ Sembunyikan Dihapus' : '🗑️ Tampilkan Dihapus'}
        </button>
      </div>

      {/* Table */}
      <div className="bg-white border border-[#F1D4D6] rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {Array(6).fill(0).map((_, i) => <div key={i} className="skeleton h-12 rounded-xl" />)}
          </div>
        ) : videos.length === 0 ? (
          <div className="text-center py-16 text-[#6B7280] text-sm">Tidak ada video ditemukan</div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead className="bg-[#FAFAFA] border-b border-[#F1D4D6]">
                <tr>
                  <th className="text-left px-5 py-3 text-[#6B7280] font-medium">Judul</th>
                  <th className="text-left px-4 py-3 text-[#6B7280] font-medium">Kreator</th>
                  <th className="text-left px-4 py-3 text-[#6B7280] font-medium">Kategori</th>
                  <th className="text-left px-4 py-3 text-[#6B7280] font-medium">Status</th>
                  <th className="text-left px-4 py-3 text-[#6B7280] font-medium">Views</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1D4D6]">
                {videos.map(v => (
                  <tr key={v.id} className={`hover:bg-[#FAFAFA] transition-colors ${v.is_deleted ? 'opacity-40' : ''}`}>
                    <td className="px-5 py-3 font-medium text-[#1F2937] max-w-xs">
                      <p className="truncate">{v.judul}</p>
                      {v.is_deleted && <span className="text-xs text-[#DC2626]">Dihapus</span>}
                    </td>
                    <td className="px-4 py-3 text-[#6B7280]">{v.profiles?.nama || '-'}</td>
                    <td className="px-4 py-3 text-[#6B7280]">{v.kategori || '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_BADGE[v.status]}`}>
                        {v.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[#6B7280]">{v.view_count}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => openView(v)} title="Preview"
                          className="p-1.5 rounded-lg hover:bg-[#FDEDEE] text-[#6B7280] hover:text-[#D62839] transition-colors">
                          <Play size={13} className="fill-current" />
                        </button>
                        {!v.is_deleted && (
                          <>
                            <button onClick={() => openEdit(v)} title="Edit"
                              className="p-1.5 rounded-lg hover:bg-[#FDEDEE] text-[#6B7280] hover:text-[#D62839] transition-colors">
                              <Edit2 size={13} />
                            </button>
                            <button onClick={() => softDelete(v.id)} title="Hapus" disabled={deleting === v.id}
                              className="p-1.5 rounded-lg hover:bg-[#FEE2E2] text-[#6B7280] hover:text-[#DC2626] transition-colors">
                              {deleting === v.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

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

      {/* Modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={closeModal}>
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#F1D4D6]">
              <h2 className="font-bold text-[#1F2937] truncate pr-4">
                {mode === 'edit' ? 'Edit Video' : selected.judul}
              </h2>
              <div className="flex items-center gap-2">
                {mode === 'view' && !selected.is_deleted && (
                  <button onClick={() => openEdit(selected)}
                    className="flex items-center gap-1 text-xs text-[#6B7280] hover:text-[#D62839] font-medium transition-colors">
                    <Edit2 size={13} /> Edit
                  </button>
                )}
                <button onClick={closeModal} className="text-[#6B7280] hover:text-[#D62839]">
                  <X size={18} />
                </button>
              </div>
            </div>

            {mode === 'view' ? (
              <>
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
                    <p>Views: <span className="font-medium text-[#1F2937]">{selected.view_count}</span></p>
                  </div>
                  {selected.deskripsi && (
                    <p className="text-sm text-[#6B7280] bg-[#FAFAFA] rounded-xl px-3 py-2.5">{selected.deskripsi}</p>
                  )}
                  {selected.status === 'pending' && !selected.is_deleted && (
                    <div className="flex gap-2 pt-1">
                      <button onClick={() => moderate(selected.id, 'approve')} disabled={saving}
                        className="flex-1 flex items-center justify-center gap-1.5 bg-[#059669] hover:bg-[#047857] disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors">
                        {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />} Setujui
                      </button>
                      <button onClick={() => moderate(selected.id, 'reject')} disabled={saving}
                        className="flex-1 flex items-center justify-center gap-1.5 bg-[#DC2626] hover:bg-[#B91C1C] disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors">
                        {saving ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />} Tolak
                      </button>
                    </div>
                  )}
                  {!selected.is_deleted && (
                    <button onClick={() => softDelete(selected.id)} disabled={deleting === selected.id}
                      className="w-full flex items-center justify-center gap-1.5 border border-[#FEE2E2] text-[#DC2626] hover:bg-[#FEE2E2] font-semibold py-2 rounded-xl text-sm transition-colors">
                      <Trash2 size={14} /> Hapus Video
                    </button>
                  )}
                </div>
              </>
            ) : (
              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[#1F2937] mb-1.5">Judul</label>
                  <input type="text" value={editForm.judul}
                    onChange={e => setEditForm(f => ({ ...f, judul: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-[#F1D4D6] rounded-xl text-sm focus:outline-none focus:border-[#D62839]" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#1F2937] mb-1.5">Kategori</label>
                  <select value={editForm.kategori}
                    onChange={e => setEditForm(f => ({ ...f, kategori: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-[#F1D4D6] rounded-xl text-sm focus:outline-none focus:border-[#D62839]">
                    <option value="">Pilih kategori</option>
                    {categoryNames.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="bg-[#FAFAFA] border border-[#F1D4D6] rounded-xl px-4 py-3">
                  <p className="text-sm font-medium text-[#1F2937]">Harga tetap: 1 koin</p>
                  <p className="text-xs text-[#6B7280] mt-0.5">Harga dikunci oleh aturan platform dan tidak dapat diubah per video.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#1F2937] mb-1.5">Deskripsi</label>
                  <textarea value={editForm.deskripsi} rows={4}
                    onChange={e => setEditForm(f => ({ ...f, deskripsi: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-[#F1D4D6] rounded-xl text-sm focus:outline-none focus:border-[#D62839] resize-none" />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setMode('view')}
                    className="flex-1 py-2.5 border border-[#F1D4D6] rounded-xl text-sm font-semibold text-[#6B7280] hover:border-[#D62839] transition-colors">
                    Batal
                  </button>
                  <button onClick={saveEdit} disabled={saving}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-[#D62839] hover:bg-[#B71C2B] disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors">
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Simpan
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
