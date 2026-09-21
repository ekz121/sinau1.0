import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import VideoCard from '../../components/VideoCard'
import SkeletonCard from '../../components/SkeletonCard'
import { User, UserPlus, UserCheck, ChevronLeft, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { attachPublicProfiles } from '../../lib/publicProfiles'

export default function CreatorProfilePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile: myProfile } = useAuthStore()

  const [creator, setCreator] = useState(null)
  const [videos, setVideos] = useState([])
  const [loading, setLoading] = useState(true)
  const [isFollowing, setIsFollowing] = useState(false)
  const [followCount, setFollowCount] = useState(0)
  const [followLoading, setFollowLoading] = useState(false)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    Promise.all([
      supabase.from('public_profiles').select('id, nama, jurusan, avatar_url').eq('id', id).single(),
      supabase.from('videos').select('*')
        .eq('creator_id', id).eq('status', 'approved').eq('is_deleted', false)
        .order('created_at', { ascending: false }),
      supabase.from('follows').select('id', { count: 'exact' }).eq('creator_id', id),
    ]).then(async ([profileRes, videosRes, followRes]) => {
      if (profileRes.error || !profileRes.data) { navigate('/'); return }
      setCreator(profileRes.data)
      setVideos(await attachPublicProfiles(videosRes.data))
      setFollowCount(followRes.count ?? 0)
      setLoading(false)
    })
  }, [id])

  useEffect(() => {
    if (!myProfile?.id || !id) return
    supabase.from('follows').select('id')
      .eq('follower_id', myProfile.id).eq('creator_id', id).maybeSingle()
      .then(({ data }) => setIsFollowing(!!data))
  }, [myProfile?.id, id])

  const handleFollow = async () => {
    if (!myProfile) { toast.error('Login dulu untuk mengikuti kreator'); return }
    if (myProfile.id === id) return
    setFollowLoading(true)
    if (isFollowing) {
      await supabase.from('follows').delete().eq('follower_id', myProfile.id).eq('creator_id', id)
      setIsFollowing(false)
      setFollowCount(c => c - 1)
    } else {
      await supabase.from('follows').insert({ follower_id: myProfile.id, creator_id: id })
      setIsFollowing(true)
      setFollowCount(c => c + 1)
    }
    setFollowLoading(false)
  }

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="skeleton h-32 rounded-2xl" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {Array(8).fill(0).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    )
  }

  if (!creator) return null

  const isOwnProfile = myProfile?.id === id

  return (
    <div className="space-y-5">
      <button onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-[#6B7280] hover:text-[#D62839] text-sm font-medium transition-colors">
        <ChevronLeft size={16} /> Kembali
      </button>

      {/* Profile card */}
      <div className="bg-white border border-[#F1D4D6] rounded-2xl p-6">
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#D62839] to-[#B71C2B] flex items-center justify-center flex-shrink-0 overflow-hidden">
            {creator.avatar_url
              ? <img src={creator.avatar_url} alt="" className="w-full h-full object-cover" />
              : <User size={28} className="text-white" />}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-extrabold text-[#1F2937]">{creator.nama || 'Kreator'}</h1>
            {creator.jurusan && <p className="text-[#6B7280] text-sm mt-0.5">{creator.jurusan}</p>}
            <p className="text-[#6B7280] text-sm mt-1">
              <span className="font-semibold text-[#1F2937]">{followCount}</span> pengikut ·{' '}
              <span className="font-semibold text-[#1F2937]">{videos.length}</span> video
            </p>
          </div>
          {!isOwnProfile && myProfile && (
            <button onClick={handleFollow} disabled={followLoading}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all flex-shrink-0 ${
                isFollowing
                  ? 'bg-[#FAFAFA] border border-[#F1D4D6] text-[#6B7280] hover:border-[#D62839]'
                  : 'bg-[#D62839] text-white hover:bg-[#B71C2B]'
              }`}>
              {followLoading
                ? <Loader2 size={14} className="animate-spin" />
                : isFollowing ? <><UserCheck size={14} /> Mengikuti</> : <><UserPlus size={14} /> Ikuti</>}
            </button>
          )}
        </div>
      </div>

      {/* Videos */}
      <div>
        <h2 className="font-bold text-[#1F2937] mb-3">Video dari {creator.nama}</h2>
        {videos.length === 0 ? (
          <div className="text-center py-16 bg-white border border-[#F1D4D6] rounded-2xl">
            <p className="text-4xl mb-3">🎬</p>
            <p className="font-semibold text-[#1F2937]">Belum ada video</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {videos.map(v => <VideoCard key={v.id} video={v} />)}
          </div>
        )}
      </div>
    </div>
  )
}
