import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { useAuthStore } from './authStore'

export const useWalletStore = create((set, get) => ({
  balance: 0,
  topupBalance: 0,
  creatorBalance: 0,
  transactions: [],
  loading: false,
  topupLoading: false,

  syncBalance: () => {
    const profile = useAuthStore.getState().profile
    if (profile) set({
      balance: profile.saldo_koin ?? 0,
      topupBalance: profile.saldo_koin_topup ?? 0,
      creatorBalance: profile.saldo_koin_kreator ?? 0,
    })
  },

  fetchTransactions: async () => {
    const user = useAuthStore.getState().user
    if (!user) return

    set({ loading: true })
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50)

    if (!error) set({ transactions: data ?? [] })
    set({ loading: false })
  },

  // submitTopupRequest: kirim permintaan top-up QRIS (saldo belum bertambah, menunggu admin)
  submitTopupRequest: async ({ jumlah_koin, bukti_transfer_url, idempotency_key }) => {
    set({ topupLoading: true })
    try {
      // Try Edge Function first
      const { data, error } = await supabase.functions.invoke('submit-topup-request', {
        body: { jumlah_koin, bukti_transfer_url, idempotency_key },
      })
      if (!error && !data?.error) {
        return data
      }
      // If it's a network error (Failed to send), try direct DB insert as fallback
      if (error?.message?.includes('Failed to send') || data?.error?.includes?.('Failed to send')) {
        console.warn('[walletStore] submit-topup-request edge function failed, trying direct DB insert')
        
        // Get rate from app_settings
        const { data: rateData } = await supabase
          .from('app_settings')
          .select('value')
          .eq('key', 'koin_to_rupiah_rate')
          .single()
        const koinRate = parseInt(rateData?.value ?? '500') || 500

        // Idempotency check
        if (idempotency_key) {
          const { data: existing } = await supabase
            .from('topup_requests')
            .select('id, status')
            .eq('idempotency_key', idempotency_key)
            .eq('user_id', useAuthStore.getState().user?.id)
            .maybeSingle()

          if (existing) {
            return { success: true, already_submitted: true, request_id: existing.id }
          }
        }

        const { data: inserted, error: insertErr } = await supabase
          .from('topup_requests')
          .insert({
            user_id: useAuthStore.getState().user?.id,
            jumlah_koin,
            jumlah_rupiah: jumlah_koin * koinRate,
            bukti_transfer_url: bukti_transfer_url || null,
            status: 'pending',
            idempotency_key: idempotency_key || null,
          })
          .select('id')
          .single()

        if (insertErr) throw new Error(insertErr.message)
        return { success: true, already_submitted: false, request_id: inserted?.id }
      }
      if (data?.error) throw new Error(data.error)
      if (error) throw error
    } finally {
      set({ topupLoading: false })
    }
  },

  purchaseContinue: async (videoId) => {
    // Try Edge Function first
    let result = null
    try {
      const { data, error } = await supabase.functions.invoke('purchase-continue', {
        body: { video_id: videoId },
      })
      if (!error && !data?.error) {
        result = data
      } else if (data?.error) {
        throw new Error(data.error)
      }
    } catch (edgeErr) {
      // If it's a business logic error (not network), re-throw
      if (edgeErr.message && !edgeErr.message.includes('Failed to send')) {
        throw edgeErr
      }
      console.warn('[walletStore] purchase-continue edge function failed, trying RPC fallback:', edgeErr)

      // Fallback: try RPC
      const { data: rpcData, error: rpcErr } = await supabase.rpc('process_purchase', {
        p_video_id: videoId,
      })
      if (rpcErr) throw new Error(rpcErr.message)
      result = rpcData
    }

    // Refresh balance
    await useAuthStore.getState().refreshProfile()
    get().syncBalance()

    return result
  },

  getSignedVideoUrl: async (videoId) => {
    // 1. Try Edge Function (service role, aman untuk paywall)
    let edgeError = null
    try {
      const { data, error } = await supabase.functions.invoke('get-video-url', {
        body: { video_id: videoId },
      })
      if (!error && data?.signed_url) {
        return data.signed_url
      }
      edgeError = error?.message || data?.error || null
    } catch (e) {
      console.warn('[walletStore] Edge function exception:', e)
      edgeError = e.message
    }

    // 2. Direct DB query fallback
    const { data: video, error: vidErr } = await supabase
      .from('videos')
      .select('video_file_url')
      .eq('id', videoId)
      .single()

    if (vidErr || !video?.video_file_url) {
      throw new Error(
        edgeError
          ? `Gagal memuat video (${edgeError}). Pastikan Edge Function "get-video-url" sudah dideploy.`
          : 'File video tidak ditemukan di penyimpanan'
      )
    }

    const rawUrl = video.video_file_url.trim()

    // 3. If rawUrl is full HTTP/HTTPS URL
    if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
      if (!rawUrl.includes('/storage/v1/object/')) {
        return rawUrl // Direct external video link
      }

      const match = rawUrl.match(/\/storage\/v1\/object\/(?:public\/|authenticated\/|sign\/)?(?:videos\/)?(.+)$/)
      if (match && match[1]) {
        const relativePath = match[1]
        const { data: signedData } = await supabase.storage
          .from('videos')
          .createSignedUrl(relativePath, 3600)

        if (signedData?.signedUrl) return signedData.signedUrl
      }
      throw new Error('Gagal membuat URL akses video. Pastikan bucket "videos" dan policy-nya benar.')
    }

    // 4. Relative path fallback
    const cleanPath = rawUrl.replace(/^videos\//, '')
    const { data: signedData, error: sErr } = await supabase.storage
      .from('videos')
      .createSignedUrl(cleanPath, 3600)

    if (!sErr && signedData?.signedUrl) return signedData.signedUrl

    // 5. Jangan pernah memutar video lain — tampilkan error sebenarnya
    console.error(`[walletStore] Gagal memuat file video "${cleanPath}":`, sErr?.message)
    throw new Error(
      sErr?.message
        ? `Gagal mengakses file video: ${sErr.message}`
        : 'File video tidak dapat diakses di penyimpanan'
    )
  },

  generateSummary: async (videoId) => {
    // Try Edge Function first
    let result = null
    try {
      const { data, error } = await supabase.functions.invoke('generate-summary', {
        body: { video_id: videoId },
      })
      if (!error && !data?.error) {
        result = data
      } else if (data?.error) {
        throw new Error(data.error)
      }
    } catch (edgeErr) {
      // If it's a business logic error (not network), re-throw
      if (edgeErr.message && !edgeErr.message.includes('Failed to send')) {
        throw edgeErr
      }
      console.warn('[walletStore] generate-summary edge function failed, trying fallback:', edgeErr)

      // Fallback: create summary from video description
      const { data: videoData, error: vidErr } = await supabase
        .from('videos')
        .select('deskripsi, judul, kategori')
        .eq('id', videoId)
        .single()

      if (vidErr || !videoData?.deskripsi) {
        throw new Error('Video tidak ditemukan atau tidak memiliki deskripsi')
      }

      const fallbackSummary = {
        ai_summary: videoData.deskripsi,
        is_fallback: true,
      }
      result = fallbackSummary
    }

    return result
  },

  generateQuiz: async (videoId) => {
    const { data, error } = await supabase.functions.invoke('generate-quiz', {
      body: { video_id: videoId },
    })
    if (error) throw error
    if (data?.error) throw new Error(data.error)
    return data
  },
}))
