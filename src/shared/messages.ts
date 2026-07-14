import type { FillJob, JobItem, MatchedProduct, ProviderId, ShoppingList } from './types'

// ---------- popup -> background ----------

export type PopupMessage =
  | { type: 'START_FILL'; list: ShoppingList; provider: ProviderId; skipPantryStaples: boolean }
  | { type: 'CANCEL_FILL' }
  | { type: 'GET_JOB' }

// ---------- content -> background ----------

export type ContentMessage =
  | { type: 'CONTENT_READY'; href: string }
  | {
      type: 'ITEM_RESULT'
      jobId: string
      index: number
      status: 'added' | 'skipped' | 'failed'
      matched?: MatchedProduct
      error?: string
    }

// ---------- background -> content (responses / pushes) ----------

export type ContentCommand =
  | {
      type: 'RUN_ITEM'
      jobId: string
      provider: ProviderId
      dish: string
      item: JobItem
      index: number
      total: number
      /** compact status of every item, for the on-page overlay */
      overlay: OverlayState
    }
  | { type: 'JOB_COMPLETE'; overlay: OverlayState }
  | { type: 'IDLE' }

export interface OverlayState {
  dish: string
  provider: ProviderId
  items: Array<{ name: string; status: JobItem['status'] }>
  currentIndex: number
  done: boolean
}

// ---------- background -> popup broadcast ----------

export type BroadcastMessage = { type: 'JOB_UPDATE'; job: FillJob | null }

export type AnyMessage = PopupMessage | ContentMessage | BroadcastMessage

export function sendMessage<T = unknown>(message: AnyMessage): Promise<T> {
  return chrome.runtime.sendMessage(message)
}
