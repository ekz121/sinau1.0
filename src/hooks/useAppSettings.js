import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// Cache module-level
const _settingsCache = {}
const _settingsPromises = {}

/**
 * useAppSetting(key, defaultValue)
 * Membaca satu setting dari app_settings table.
 * Return: { value, loading }
 */
export function useAppSetting(key, defaultValue = null) {
  const [value, setValue] = useState(
    _settingsCache[key] !== undefined ? _settingsCache[key] : defaultValue
  )
  const [loading, setLoading] = useState(_settingsCache[key] === undefined)

  useEffect(() => {
    if (_settingsCache[key] !== undefined) {
      setValue(_settingsCache[key])
      setLoading(false)
      return
    }

    if (!_settingsPromises[key]) {
      _settingsPromises[key] = supabase
        .from('app_settings')
        .select('value')
        .eq('key', key)
        .single()
        .then(({ data }) => {
          const v = data?.value ?? defaultValue
          _settingsCache[key] = v
          return v
        })
    }

    _settingsPromises[key].then(v => {
      setValue(v)
      setLoading(false)
    })
  }, [key])

  return { value, loading }
}

/**
 * useAppSettings(keys)
 * Membaca beberapa setting sekaligus.
 * Return: { settings: { key: value }, loading }
 */
export function useAppSettings(keys) {
  const [settings, setSettings] = useState(() => {
    const initial = {}
    keys.forEach(k => { if (_settingsCache[k] !== undefined) initial[k] = _settingsCache[k] })
    return initial
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const missing = keys.filter(k => _settingsCache[k] === undefined)

    if (missing.length === 0) {
      const all = {}
      keys.forEach(k => { all[k] = _settingsCache[k] })
      setSettings(all)
      setLoading(false)
      return
    }

    supabase
      .from('app_settings')
      .select('key, value')
      .in('key', missing)
      .then(({ data }) => {
        const map = Object.fromEntries((data ?? []).map(r => [r.key, r.value]))
        missing.forEach(k => { _settingsCache[k] = map[k] ?? null })
        const all = {}
        keys.forEach(k => { all[k] = _settingsCache[k] })
        setSettings(all)
        setLoading(false)
      })
  }, [])

  return { settings, loading }
}

// Invalidate cache (setelah admin save settings)
export function invalidateSettingsCache(keys) {
  if (keys) {
    keys.forEach(k => {
      delete _settingsCache[k]
      delete _settingsPromises[k]
    })
  } else {
    Object.keys(_settingsCache).forEach(k => {
      delete _settingsCache[k]
      delete _settingsPromises[k]
    })
  }
}
