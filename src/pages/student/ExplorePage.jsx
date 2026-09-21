import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import VideoCard from '../../components/VideoCard'
import SkeletonCard from '../../components/SkeletonCard'
import SearchBar from '../../components/SearchBar'
import CategoryFilter from '../../components/CategoryFilter'
import { SlidersHorizontal, PlayCircle, Sparkles } from 'lucide-react'
import { attachPublicProfiles } from '../../lib/publicProfiles'

const SORT_OPTIONS = [
  { value: 'created_at', label: 'Terbaru' },
  { value: 'view_count', label: 'Terpopuler' },
  { value: 'harga_koin', label: 'Termurah' },
]

export default function ExplorePage() {
  const { user } = useAuthStore()
  const [videos, setVideos] = useState([])
  const [continueWatching, setContinueWatching] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [sort, setSort] = useState('created_at')

  const fetchVideos = useCallback(async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('videos')
        .select('*')
        .eq('status', 'approved')
        .eq('is_deleted', false)
        .order(sort, { ascending: sort === 'harga_koin' })

      if (search.trim()) {
        query = query.ilike('judul', `%${search.trim()}%`)
      }
      if (category) {
        query = query.eq('kategori', category)
      }

      const { data, error } = await query.limit(40)
      if (!error) setVideos(await attachPublicProfiles(data))
    } finally {
      setLoading(false)
    }
  }, [search, category, sort])

  useEffect(() => {
    const timer = setTimeout(fetchVideos, 300)
    return () => clearTimeout(timer)
  }, [fetchVideos])

  // Fetch watch history for "Lanjutkan Menonton"
  useEffect(() => {
    if (!user) return
    supabase
      .from('views')
      .select('created_at, videos!inner(*)')
      .eq('viewer_id', user.id)
      .eq('videos.status', 'approved')
      .eq('videos.is_deleted', false)
      .order('created_at', { ascending: false })
      .limit(4)
      .then(async ({ data }) => {
        if (data) {
          const list = data.map(d => d.videos).filter(Boolean)
          setContinueWatching(await attachPublicProfiles(list))
        }
      })
  }, [user])

  return (
    <div className="space-y-5">
      {/* Hero */}
      <div className="relative overflow-hidden bg-gradient-to-br from-[#D62839] via-[#B71C2B] to-[#4F46E5] rounded-[1.75rem] p-6 md:p-8 text-white shadow-xl shadow-[#D62839]/15">
        <div className="absolute -right-16 -top-20 h-52 w-52 rounded-full border-[28px] border-white/10" />
        <div className="absolute right-24 -bottom-16 h-32 w-32 rounded-full bg-[#06B6D4]/30 blur-2xl" />
        <div className="relative max-w-2xl">
          <span className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] backdrop-blur">
            <Sparkles size={12} /> Ruang belajar mahasiswa
          </span>
          <h1 className="text-2xl md:text-3xl font-extrabold mb-1.5 tracking-tight">Temukan ide baru, satu video sekali tonton.</h1>
          <p className="text-white/75 text-sm md:text-base">Materi praktis dari mahasiswa, untuk mahasiswa.</p>
        </div>
      </div>

      {/* Lanjutkan Menonton Section */}
      {!search && !category && continueWatching.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-bold text-[#1F2937] text-base flex items-center gap-2">
            <PlayCircle size={18} className="text-[#D62839]" /> Lanjutkan Menonton
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {continueWatching.map(v => (
              <VideoCard key={`cw-${v.id}`} video={v} />
            ))}
          </div>
        </div>
      )}

      {/* Search */}
      <SearchBar
        value={search}
        onChange={setSearch}
        onClear={() => setSearch('')}
        placeholder="Cari topik, mata kuliah..."
      />

      {/* Category */}
      <CategoryFilter selected={category} onChange={setCategory} />

      {/* Sort */}
      <div className="flex items-center gap-2">
        <SlidersHorizontal size={14} className="text-[#6B7280]" />
        <span className="text-[#6B7280] text-xs font-medium">Urutkan:</span>
        <div className="flex gap-1.5">
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setSort(opt.value)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                sort === opt.value
                  ? 'bg-[#D62839] text-white'
                  : 'bg-[#FAFAFA] border border-[#F1D4D6] text-[#6B7280] hover:border-[#D62839]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {Array(8).fill(0).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : videos.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-4xl mb-3">🎬</p>
          <p className="font-semibold text-[#1F2937] mb-1">Belum ada video</p>
          <p className="text-[#6B7280] text-sm">
            {search || category ? 'Coba kata kunci atau kategori lain' : 'Jadilah yang pertama upload!'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {videos.map((v) => (
            <VideoCard key={v.id} video={v} />
          ))}
        </div>
      )}
    </div>
  )
}
