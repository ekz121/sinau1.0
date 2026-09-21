import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { Bell } from 'lucide-react'
import toast from 'react-hot-toast'

const TYPE_LABEL = {
  video_moderated:          (p) => `Video "${p?.judul}" ${p?.status === 'approved' ? 'disetujui ✅' : 'ditolak ❌'}`,
  video_approved:           ()  => 'Video kamu disetujui ✅',
  video_rejected:           (p) => `Video kamu ditolak${p?.rejection_note ? ': ' + p.rejection_note : ''}`,
  new_comment:              (p) => `Komentar baru di video "${p?.judul}"`,
  comment_reply:            ()  => 'Ada yang membalas komentarmu',
  topup_approved:           (p) => `Top up ${p?.jumlah_koin ? p.jumlah_koin + ' koin' : ''} disetujui ✅`,
  topup_rejected:           (p) => `Top up ditolak${p?.admin_note ? ': ' + p.admin_note : ''}`,
  payout_approved:          (p) => `Pencairan ${p?.jumlah_koin ? p.jumlah_koin + ' koin' : ''} berhasil diproses ✅`,
  payout_done:              ()  => 'Pencairan koin berhasil diproses ✅',
  payout_rejected:          (p) => `Pencairan ditolak, koin dikembalikan${p?.admin_note ? ': ' + p.admin_note : ''}`,
  new_video_from_following: (p) => `Video baru dari kreator yang kamu ikuti: "${p?.judul}"`,
  admin_video_pending:      (p) => `Video baru menunggu review: "${p?.judul || 'Tanpa judul'}"`,
  admin_topup_pending:      (p) => `Top up ${p?.jumlah_koin || ''} koin menunggu verifikasi`,
  admin_payout_pending:     (p) => `Payout ${p?.jumlah_koin || ''} koin menunggu diproses`,
  admin_report_pending:     () => 'Laporan konten baru menunggu ditinjau',
}

function getLink(notif) {
  const p = notif.payload_json || {}
  if (notif.type === 'admin_video_pending') return '/admin/review'
  if (notif.type === 'admin_topup_pending' || notif.type === 'admin_payout_pending') return '/admin/transaksi'
  if (notif.type === 'admin_report_pending') return '/admin/laporan'
  if (['video_moderated', 'video_approved', 'video_rejected', 'new_comment', 'comment_reply', 'new_video_from_following'].includes(notif.type)) {
    return `/video/${p.video_id}`
  }
  if (notif.type?.includes('topup') || notif.type?.includes('payout')) return '/wallet'
  return '/'
}

export default function NotificationBell({ align = 'right' }) {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [notifs, setNotifs] = useState([])
  const [open, setOpen] = useState(false)
  const [markingAll, setMarkingAll] = useState(false)
  const ref = useRef(null)

  // Guard: track apakah subscription sudah aktif untuk user ini
  // Mencegah React Strict Mode double-invocation membuat dua channel
  const subscribedUidRef = useRef(null)
  const channelRef = useRef(null)

  const unread = notifs.filter(n => !n.is_read).length

  const fetchNotifs = useCallback(async (uid) => {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
      .limit(20)
    setNotifs(data ?? [])
  }, [])

  useEffect(() => {
    if (!user?.id) return

    // Jika sudah subscribe untuk user ini, skip — hindari double subscription
    if (subscribedUidRef.current === user.id) return

    // Fetch awal
    fetchNotifs(user.id)

    // Tandai user ini sudah di-subscribe sebelum setup channel
    subscribedUidRef.current = user.id

    // Buat channel dengan nama stabil (tidak pakai Date.now()) agar
    // removeChannel + re-create tidak bentrok dengan channel yang belum closed
    const channelName = `notif-user-${user.id}`

    // Pastikan tidak ada channel lama dengan nama sama sebelum buat baru
    const existing = supabase.getChannels().find(ch => ch.topic === `realtime:${channelName}`)
    if (existing) {
      supabase.removeChannel(existing)
    }

    // Bangun semua .on() handlers SEBELUM .subscribe() — dalam satu chain
    const channel = supabase
      .channel(channelName, { config: { broadcast: { self: false } } })
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          setNotifs(prev => [payload.new, ...prev].slice(0, 20))
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          setNotifs(prev => prev.map(n => n.id === payload.new.id ? payload.new : n))
        }
      )
      .subscribe()

    channelRef.current = channel

    return () => {
      // Reset guard agar user bisa re-subscribe jika logout → login ulang
      subscribedUidRef.current = null
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [user?.id, fetchNotifs])

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const markAllRead = async () => {
    if (!user || markingAll) return
    setMarkingAll(true)
    const { error } = await supabase.rpc('mark_notifications_read')
    if (error) toast.error('Gagal menandai notifikasi: ' + error.message)
    else setNotifs(ns => ns.map(n => ({ ...n, is_read: true })))
    setMarkingAll(false)
  }

  const handleClick = async (notif) => {
    if (!notif.is_read) {
      const { error } = await supabase.rpc('mark_notifications_read', { p_notification_id: notif.id })
      if (error) {
        toast.error('Gagal memperbarui notifikasi')
        return
      }
      setNotifs(ns => ns.map(n => n.id === notif.id ? { ...n, is_read: true } : n))
    }
    setOpen(false)
    const link = getLink(notif)
    if (link) navigate(link)
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="relative p-2 rounded-xl hover:bg-[#FDEDEE] text-[#6B7280] hover:text-[#D62839] transition-colors"
        aria-label={`Notifikasi${unread > 0 ? `, ${unread} belum dibaca` : ''}`}
      >
        <Bell size={20} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-[#D62839] text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className={`absolute ${align === 'left' ? 'left-0' : 'right-0'} top-full mt-2 w-80 max-w-[85vw] bg-white border border-[#F1D4D6] rounded-2xl shadow-2xl z-50 overflow-hidden`}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#F1D4D6]">
            <span className="font-bold text-[#1F2937] text-sm">Notifikasi</span>
            {unread > 0 && (
              <button disabled={markingAll} onClick={markAllRead} className="text-[#D62839] text-xs font-medium hover:underline disabled:opacity-50">
                {markingAll ? 'Memproses...' : 'Tandai semua dibaca'}
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifs.length === 0 ? (
              <p className="text-center text-[#6B7280] text-sm py-8">Tidak ada notifikasi</p>
            ) : (
              notifs.map(n => {
                const labelFn = TYPE_LABEL[n.type] || (() => n.type)
                return (
                  <button
                    key={n.id}
                    onClick={() => handleClick(n)}
                    className={`w-full text-left px-4 py-3 hover:bg-[#FAFAFA] transition-colors border-b border-[#F1D4D6] last:border-0 ${!n.is_read ? 'bg-[#FDEDEE]' : ''}`}
                  >
                    <p className="text-[#1F2937] text-xs font-medium leading-relaxed">
                      {labelFn(n.payload_json || {})}
                    </p>
                    <p className="text-[#6B7280] text-xs mt-0.5">
                      {new Date(n.created_at).toLocaleDateString('id-ID', {
                        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                      })}
                    </p>
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
