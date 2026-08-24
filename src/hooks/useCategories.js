import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// Cache sederhana di module-level agar tidak fetch ulang saat remount
let _cache = null
let _cachePromise = null

export function useCategories() {
  const [categories, setCategories] = useState(_cache ?? [])
  const [loading, setLoading] = useState(_cache === null)

  useEffect(() => {
    if (_cache !== null) {
      setCategories(_cache)
      setLoading(false)
      return
    }

    if (!_cachePromise) {
      _cachePromise = supabase
        .from('categories')
        .select('id, nama, urutan')
        .order('urutan', { ascending: true })
        .then(({ data }) => {
          _cache = data ?? []
          return _cache
        })
    }

    _cachePromise.then(data => {
      setCategories(data)
      setLoading(false)
    })
  }, [])

  // Fungsi untuk invalidate cache (dipanggil setelah admin edit kategori)
  const invalidate = () => {
    _cache = null
    _cachePromise = null
  }

  return { categories, loading, invalidate }
}

export function useCategoryNames() {
  const { categories } = useCategories()
  return categories.map(c => c.nama)
}
