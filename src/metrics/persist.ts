/**
 * The dictionary in this browser: `hcp:metrics` in localStorage holds your overrides and the
 * change log, as `{ version: 1, overrides, log }`. Reading cleans every value against the catalog,
 * so a stored value that no longer passes (a lowered minimum, an unknown setting) is dropped.
 *
 * Ported from the template app without its one-time migration of older settings: Headcount
 * Planner has never stored its dictionary anywhere else.
 */
import { EMPTY_METRICS, sanitizeMetricsState } from './overrides'
import type { MetricCatalog } from './registry'
import type { MetricsState } from './types'

export const METRICS_KEY = 'hcp:metrics'
export const METRICS_STORE_VERSION = 1

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

const storageOrNull = (): StorageLike | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

function readJson(s: StorageLike, key: string): unknown {
  try {
    const v = s.getItem(key)
    return v == null ? undefined : JSON.parse(v)
  } catch {
    return undefined
  }
}

/** Your saved dictionary changes, cleaned against the catalog; the defaults when nothing is saved. */
export function loadMetrics(
  catalog: MetricCatalog,
  storage: StorageLike | null = storageOrNull(),
): MetricsState {
  if (!storage) return EMPTY_METRICS
  const saved = readJson(storage, METRICS_KEY)
  if (saved && typeof saved === 'object') return sanitizeMetricsState(saved, catalog)
  return EMPTY_METRICS
}

/** Save the overrides and the change log. Never throws: without storage, changes last for the session. */
export function saveMetrics(state: MetricsState, storage: StorageLike | null = storageOrNull()): void {
  try {
    storage?.setItem(
      METRICS_KEY,
      JSON.stringify({ version: METRICS_STORE_VERSION, overrides: state.overrides, log: state.log }),
    )
  } catch {
    /* storage full or blocked: kept for this session */
  }
}
