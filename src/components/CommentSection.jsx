import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { MessageCircle, Send, Loader2, Trash2, CornerDownRight } from 'lucide-react'
import toast from 'react-hot-toast'

function formatDate(s) {
  return new Date(s).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

function CommentItem({ comment, isDeleted = false, onDelete, onReply, currentUserId, isAdmin }) {
  if (isDeleted) {
    return (
      <div className="flex gap-3">
        <div className="w-8 h-8 bg-[#F3F4F6] rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
          <span className="text-[#9CA3AF] text-xs">—</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="bg-[#F9FAFB] rounded-xl px-3 py-2.5 border border-dashed border-[#E5E7EB]">
            <p className="text-[#9CA3AF] text-sm italic">[Komentar telah dihapus]</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-3">
      <div className="w-8 h-8 bg-gradient-to-br from-[#D62839] to-[#B71C2B] rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
        <span className="text-white text-xs font-bold">{(comment.profiles?.nama || '?')[0].toUpperCase()}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="bg-[#FAFAFA] rounded-xl px-3 py-2.5">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="font-semibold text-[#1F2937] text-xs">{comment.profiles?.nama || 'User'}</span>
            <span className="text-[#6B7280] text-xs">{formatDate(comment.created_at)}</span>
          </div>
          <p className="text-[#1F2937] text-sm leading-relaxed">{comment.content}</p>
        </div>
        <div className="flex items-center gap-3 mt-1 px-1">
          {!comment.parent_comment_id && (
            <button onClick={() => onReply(comment)} className="text-[#6B7280] hover:text-[#D62839] text-xs font-medium transition-colors flex items-center gap-1">
              <CornerDownRight size={11} /> Balas
            </button>
          )}
          {(currentUserId === comment.user_id || isAdmin) && (
            <button onClick={() => onDelete(comment.id)} className="text-[#6B7280] hover:text-[#DC2626] text-xs transition-colors flex items-center gap-1">
              <Trash2 size={11} /> Hapus
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function CommentSection({ videoId }) {
  const { profile } = useAuthStore()
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [replyTo, setReplyTo] = useState(null) // { id, nama }

  const isAdmin = profile?.role === 'admin'

  const fetchComments = async () => {
    // Fetch semua komentar termasuk yang is_deleted untuk menjaga konteks reply
    const { data } = await supabase
      .from('comments')
      .select('*, profiles(nama)')
      .eq('video_id', videoId)
      .order('created_at', { ascending: true })
    setComments(data ?? [])
    setLoading(false)
  }

  useEffect(() => { if (videoId) fetchComments() }, [videoId])

  const submit = async () => {
    if (!text.trim()) return
    setSubmitting(true)
    const { error } = await supabase.from('comments').insert({
      video_id: videoId,
      user_id: profile.id,
      content: text.trim(),
      parent_comment_id: replyTo?.id || null,
    })
    if (error) {
      toast.error('Gagal mengirim komentar')
    } else {
      setText('')
      setReplyTo(null)
      fetchComments()
    }
    setSubmitting(false)
  }

  const deleteComment = async (commentId) => {
    // Soft delete: set is_deleted = true, konten diganti placeholder di UI
    const { error } = await supabase
      .from('comments')
      .update({ is_deleted: true })
      .eq('id', commentId)

    if (error) {
      toast.error('Gagal menghapus komentar')
      return
    }
    // Update local state — tidak filter, cukup tandai is_deleted
    setComments(cs => cs.map(c => c.id === commentId ? { ...c, is_deleted: true } : c))
  }

  // Group: parent comments + their replies
  // Tampilkan semua parent (termasuk deleted) agar reply tidak orphan
  const parents = comments.filter(c => !c.parent_comment_id)
  const replies = comments.filter(c => c.parent_comment_id)

  // Hitung jumlah komentar aktif (tidak dihapus)
  const activeCount = comments.filter(c => !c.is_deleted).length

  return (
    <div className="space-y-4">
      <h3 className="font-bold text-[#1F2937] flex items-center gap-2">
        <MessageCircle size={18} className="text-[#D62839]" />
        Komentar ({activeCount})
      </h3>

      {/* Input */}
      {profile && (
        <div className="space-y-2">
          {replyTo && (
            <div className="flex items-center gap-2 text-xs text-[#6B7280] bg-[#FDEDEE] px-3 py-1.5 rounded-lg">
              <CornerDownRight size={12} className="text-[#D62839]" />
              Membalas <span className="font-semibold text-[#D62839]">{replyTo.nama}</span>
              <button onClick={() => setReplyTo(null)} className="ml-auto text-[#6B7280] hover:text-[#D62839]">✕</button>
            </div>
          )}
          <div className="flex gap-2">
            <input
              type="text"
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && submit()}
              placeholder={replyTo ? `Balas ${replyTo.nama}...` : 'Tulis komentar...'}
              maxLength={500}
              className="flex-1 px-4 py-2.5 bg-[#FAFAFA] border border-[#F1D4D6] rounded-xl text-sm focus:outline-none focus:border-[#D62839] transition-all"
            />
            <button onClick={submit} disabled={submitting || !text.trim()}
              className="flex items-center gap-1.5 bg-[#D62839] hover:bg-[#B71C2B] disabled:opacity-40 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors">
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-3">{Array(3).fill(0).map((_, i) => <div key={i} className="skeleton h-16 rounded-xl" />)}</div>
      ) : parents.length === 0 ? (
        <p className="text-[#6B7280] text-sm text-center py-6">Belum ada komentar. Jadilah yang pertama!</p>
      ) : (
        <div className="space-y-4">
          {parents.map(c => {
            const commentReplies = replies.filter(r => r.parent_comment_id === c.id)
            // Sembunyikan parent deleted tanpa reply
            if (c.is_deleted && commentReplies.length === 0) return null

            return (
              <div key={c.id} className="space-y-3">
                <CommentItem
                  comment={c}
                  isDeleted={c.is_deleted}
                  onDelete={deleteComment}
                  onReply={c => setReplyTo({ id: c.id, nama: c.profiles?.nama })}
                  currentUserId={profile?.id}
                  isAdmin={isAdmin}
                />
                {/* Replies — tampilkan semua reply (termasuk deleted) */}
                {commentReplies.map(r => (
                  <div key={r.id} className="ml-10">
                    <CommentItem
                      comment={r}
                      isDeleted={r.is_deleted}
                      onDelete={deleteComment}
                      // Reply ke parent comment (bukan ke reply)
                      onReply={() => setReplyTo({ id: c.id, nama: c.profiles?.nama })}
                      currentUserId={profile?.id}
                      isAdmin={isAdmin}
                    />
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
