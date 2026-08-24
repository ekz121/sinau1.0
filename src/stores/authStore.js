import { create } from 'zustand'
import { supabase } from '../lib/supabase'

export const useAuthStore = create((set, get) => ({
  user: null,
  profile: null,
  session: null,
  loading: true,
  initialized: false,

  // Initialize auth listener — call once at app startup
  init: () => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        set({ session, user: session.user })
        get().fetchProfile(session.user.id)
      } else {
        set({ loading: false, initialized: true })
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session) {
          set({ session, user: session.user })
          await get().fetchProfile(session.user.id)
        } else {
          set({ user: null, profile: null, session: null, loading: false, initialized: true })
        }
      }
    )

    return () => subscription.unsubscribe()
  },

  fetchProfile: async (userId) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (error) {
      console.error('[Auth] Failed to fetch profile:', error.message)
      set({ loading: false, initialized: true })
      return
    }

    set({ profile: data, loading: false, initialized: true })
  },

  login: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error

    // Cek status akun setelah login berhasil — suspended/deleted harus ditolak jelas
    const { data: prof } = await supabase
      .from('profiles')
      .select('is_suspended, is_deleted, role')
      .eq('id', data.user.id)
      .single()

    if (prof?.is_deleted) {
      await supabase.auth.signOut()
      throw new Error('Akun ini telah dihapus. Hubungi administrator untuk bantuan.')
    }
    if (prof?.is_suspended) {
      await supabase.auth.signOut()
      throw new Error('Akun kamu telah disuspend oleh administrator.')
    }

    return data
  },

  register: async ({ email, password, nama, jurusan }) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { nama, jurusan },
        emailRedirectTo: `${window.location.origin}/auth/verified`,
      },
    })
    if (error) throw error

    // Profile is auto-created by DB trigger handle_new_user
    return data
  },

  logout: async () => {
    await supabase.auth.signOut()
    set({ user: null, profile: null, session: null })
  },

  forgotPassword: async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    })
    if (error) throw error
  },

  updateProfile: async (updates) => {
    const { user } = get()
    if (!user) throw new Error('Not authenticated')

    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.id)
      .select()
      .single()

    if (error) throw error
    set({ profile: data })
    return data
  },

  // Refresh profile from DB (e.g. after a coin transaction)
  refreshProfile: async () => {
    const { user } = get()
    if (user) await get().fetchProfile(user.id)
  },

  get isSuspended() {
    return get().profile?.is_suspended === true
  },

  get isAdmin() {
    return get().profile?.role === 'admin'
  },
}))
