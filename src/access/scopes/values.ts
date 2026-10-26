/**
 * What each list filter can select inside a scope (src/access/scopes/types.ts `ScopeValues`): the
 * values of every list dimension over the scope's positions, read from the rows the filters place
 * them by (`placementRows`, the same `positionValues` the filters test). The clamp drops a list
 * filter that none of them passes (src/access/scopes/clamp.ts). Pure.
 */
import type { PositionRow } from '@/data/schema'
import { LIST_DIMENSIONS, type ListDimension, positionValues } from '@/data/scope'
import type { ScopeValues } from './types'

/** The values each list dimension takes over these positions; undefined when there are none. */
export function scopeValues(
  ids: ReadonlySet<string>,
  place: ReadonlyMap<string, PositionRow>,
): ScopeValues | undefined {
  if (!ids.size) return undefined
  const out = Object.fromEntries(LIST_DIMENSIONS.map((d) => [d, new Set<string | null>()])) as Record<
    ListDimension,
    Set<string | null>
  >
  let placed = 0
  for (const id of ids) {
    const row = place.get(id)
    if (!row) continue
    placed++
    const v = positionValues(row)
    for (const d of LIST_DIMENSIONS) out[d].add(v[d])
  }
  return placed ? out : undefined
}
