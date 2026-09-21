import { supabase } from './supabase'

export async function fetchPublicProfiles(ids) {
  const uniqueIds = [...new Set((ids ?? []).filter(Boolean))]
  if (uniqueIds.length === 0) return new Map()

  const { data, error } = await supabase
    .from('public_profiles')
    .select('id, nama, jurusan, avatar_url')
    .in('id', uniqueIds)

  if (error) throw error
  return new Map((data ?? []).map((profile) => [profile.id, profile]))
}

export async function attachPublicProfiles(rows, idKey = 'creator_id') {
  const list = rows ?? []
  const profiles = await fetchPublicProfiles(list.map((row) => row?.[idKey]))
  return list.map((row) => ({ ...row, profiles: profiles.get(row?.[idKey]) ?? null }))
}
