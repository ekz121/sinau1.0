import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

function toBucketPath(rawUrl, bucket) {
  let path = String(rawUrl).trim()

  // Strip full Supabase storage URL patterns
  const objMatch = path.match(/\/storage\/v1\/object\/(?:public\/|authenticated\/|sign\/)?/)
  if (objMatch) path = path.slice(objMatch.index + objMatch[0].length)

  // Strip bucket prefix if present (e.g. "thumbnails/user/file.jpg" → "user/file.jpg")
  if (path.startsWith(`${bucket}/`)) path = path.slice(bucket.length + 1)

  // Strip any leading slashes
  path = path.replace(/^\/+/, '')

  return path
}

export default function useMediaUrl(rawUrl, bucket = 'thumbnails') {
  const [src, setSrc] = useState(null)
  const [triedSigned, setTriedSigned] = useState(false)

  useEffect(() => {
    setTriedSigned(false)
    if (!rawUrl) {
      setSrc(null)
      return
    }
    const url = String(rawUrl).trim()
    if (!url) {
      setSrc(null)
      return
    }

    // URL eksternal (bukan Supabase storage): pakai langsung
    if (/^https?:\/\//i.test(url) && !url.includes('/storage/v1/object/')) {
      setSrc(url)
      return
    }

    // URL Supabase atau path relatif: coba public URL dulu,
    // jika bucket private maka onError akan naikkan ke signed URL
    const path = toBucketPath(url, bucket)
    const { data } = supabase.storage.from(bucket).getPublicUrl(path)
    if (data?.publicUrl) {
      setSrc(data.publicUrl)
    } else {
      // Langsung coba signed URL jika public URL tidak bisa didapat
      trySignedUrl(url, bucket, path)
    }
  }, [rawUrl, bucket])

  const trySignedUrl = async (url, bkt, path) => {
    try {
      const cleanPath = path || toBucketPath(url, bkt)
      const { data } = await supabase.storage.from(bkt).createSignedUrl(cleanPath, 86400)
      if (data?.signedUrl) {
        setSrc(data.signedUrl)
        return true
      }
    } catch {
      // biarkan placeholder tampil
    }
    return false
  }

  const handleError = useCallback(async () => {
    if (triedSigned || !rawUrl) return
    setTriedSigned(true)
    const url = String(rawUrl).trim()
    if (/^https?:\/\//i.test(url) && !url.includes('/storage/v1/object/')) return

    const path = toBucketPath(url, bucket)
    try {
      const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 86400)
      if (data?.signedUrl) {
        setSrc(data.signedUrl)
      } else {
        setSrc(null) // gagal — biarkan fallback gradient tampil
      }
    } catch {
      setSrc(null) // biarkan placeholder tampil
    }
  }, [triedSigned, rawUrl, bucket])

  return { src, handleError }
}
