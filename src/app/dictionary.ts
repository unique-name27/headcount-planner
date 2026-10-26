/**
 * Two small stores the shell holds for the analytics context (the template app keeps them in its
 * data store and lists folder): the metric dictionary with your changes (`hcp:metrics`) and the
 * official lists you saved (`hcp:lists`). Each is read once, saved by its own module's pure helpers
 * after every change, kept in step with other open tabs through the storage event, and forgotten
 * when the device is cleared. The provider builds `ctx.metrics` from the first (`metricsApi`, one
 * object per state) and the lists in force from the second.
 */
import { create } from 'zustand'
import { EMPTY_LISTS } from '@/data/lists/edit'
import { LISTS_KEY, loadLists, saveLists } from '@/data/lists/persist'
import type { ListsState } from '@/data/lists/types'
import { onDeviceCleared } from '@/data/store'
import { CATALOG } from '@/metrics/catalog'
import { EMPTY_METRICS } from '@/metrics/overrides'
import { loadMetrics, METRICS_KEY, saveMetrics } from '@/metrics/persist'
import type { MetricsState } from '@/metrics/types'

export interface DictionaryStore {
  state: MetricsState
  /** Replace the dictionary state (an edit, an import, an undo) and save it. */
  commit: (next: MetricsState) => void
}

export interface ListsStore {
  state: ListsState
  commit: (next: ListsState) => void
}

let listening = false

function listen(): void {
  if (listening || typeof window === 'undefined') return
  listening = true
  // Another tab's change, or "clear everything" (a null key), reaches this one as it happens.
  window.addEventListener('storage', (e) => {
    if (e.key === METRICS_KEY || e.key === null) useDictionary.setState({ state: loadMetrics(CATALOG) })
    if (e.key === LISTS_KEY || e.key === null) useOfficialLists.setState({ state: loadLists() })
  })
}

export const useDictionary = create<DictionaryStore>((set, get) => ({
  state: loadMetrics(CATALOG),
  commit(next) {
    if (next === get().state) return
    saveMetrics(next)
    set({ state: next })
  },
}))

export const useOfficialLists = create<ListsStore>((set, get) => ({
  state: loadLists(),
  commit(next) {
    if (next === get().state) return
    saveLists(next)
    set({ state: next })
  },
}))

listen()
onDeviceCleared(() => {
  useDictionary.setState({ state: EMPTY_METRICS })
  useOfficialLists.setState({ state: EMPTY_LISTS })
})
