import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { useAuthStore } from './authStore'

function edgeError(data, error, fallback) {
  return new Error(data?.error || error?.message || fallback)
}

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
      balance: Number(profile.saldo_koin ?? 0),
      topupBalance: Number(profile.saldo_koin_topup ?? 0),
      creatorBalance: Number(profile.saldo_koin_kreator ?? 0),
    })
  },

  fetchTransactions: async () => {
    const user = useAuthStore.getState().user
    if (!user) return

    set({ loading: true })
    try {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      set({ transactions: data ?? [] })
    } finally {
      set({ loading: false })
    }
  },

  submitTopupRequest: async ({ jumlah_koin, bukti_transfer_url, idempotency_key }) => {
    set({ topupLoading: true })
    try {
      const { data, error } = await supabase.functions.invoke('submit-topup-request', {
        body: { jumlah_koin, bukti_transfer_url, idempotency_key },
      })
      if (error || data?.error) throw edgeError(data, error, 'Gagal mengirim permintaan top up')
      return data
    } finally {
      set({ topupLoading: false })
    }
  },

  purchaseContinue: async (videoId) => {
    const { data, error } = await supabase.functions.invoke('purchase-continue', {
      body: { video_id: videoId },
    })
    if (error || data?.error) throw edgeError(data, error, 'Pembayaran gagal diproses')

    await useAuthStore.getState().refreshProfile()
    get().syncBalance()
    return data
  },

  getSignedVideoUrl: async (videoId) => {
    const { data, error } = await supabase.functions.invoke('get-video-url', {
      body: { video_id: videoId },
    })
    if (error || data?.error || !data?.signed_url) {
      throw edgeError(data, error, 'Video tidak dapat diakses. Pastikan Edge Function sudah dideploy.')
    }
    return data.signed_url
  },

  generateSummary: async (videoId) => {
    const { data, error } = await supabase.functions.invoke('generate-summary', {
      body: { video_id: videoId },
    })
    if (error || data?.error) throw edgeError(data, error, 'Gagal membuat ringkasan')
    return data
  },

  generateQuiz: async (videoId) => {
    const { data, error } = await supabase.functions.invoke('generate-quiz', {
      body: { video_id: videoId },
    })
    if (error || data?.error) throw edgeError(data, error, 'Gagal membuat kuis')
    return data
  },
}))
