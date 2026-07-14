import { useCallback, useEffect, useState } from 'react'
import type { FillJob, ProviderId, ShoppingList } from '@/shared/types'
import type { BroadcastMessage } from '@/shared/messages'
import { onActiveJobChange } from '@/shared/storage'

export function useJob() {
  const [job, setJob] = useState<FillJob | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    void chrome.runtime
      .sendMessage({ type: 'GET_JOB' })
      .then((j: FillJob | null) => {
        setJob(j ?? null)
        setLoaded(true)
      })
      .catch(() => setLoaded(true))

    const unsubscribe = onActiveJobChange(setJob)
    const onBroadcast = (message: BroadcastMessage) => {
      if (message?.type === 'JOB_UPDATE') setJob(message.job)
    }
    chrome.runtime.onMessage.addListener(onBroadcast)
    return () => {
      unsubscribe()
      chrome.runtime.onMessage.removeListener(onBroadcast)
    }
  }, [])

  const startFill = useCallback(
    async (
      list: ShoppingList,
      provider: ProviderId,
      skipPantryStaples: boolean,
    ): Promise<{ ok: boolean; reason?: string }> => {
      return chrome.runtime.sendMessage({
        type: 'START_FILL',
        list,
        provider,
        skipPantryStaples,
      })
    },
    [],
  )

  const cancel = useCallback(async () => {
    await chrome.runtime.sendMessage({ type: 'CANCEL_FILL' })
  }, [])

  return { job, loaded, startFill, cancel }
}
