import { useCallback, useEffect, useState } from 'react'
import type { Settings } from '@/shared/types'
import { DEFAULT_SETTINGS } from '@/shared/types'
import { getSettings, saveSettings } from '@/shared/storage'

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    void getSettings().then((s) => {
      setSettings(s)
      setLoaded(true)
    })
  }, [])

  const update = useCallback((next: Settings) => {
    setSettings(next)
    void saveSettings(next)
  }, [])

  return { settings, update, loaded }
}
