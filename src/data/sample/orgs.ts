/**
 * Small read helpers over position rows that the wave 2 modules share: rows by position, the row in
 * effect on a date, the manager chain and the tree test the forecast and freezes read. Pure.
 */
import { rowOn } from '@/plan/engine/versions'
import type { ISODate, PositionRow } from '../schema'

/** Every position's rows, in input order. */
export function rowsByPosition(positions: readonly PositionRow[]): Map<string, PositionRow[]> {
  const out = new Map<string, PositionRow[]>()
  for (const r of positions) {
    const list = out.get(r.positionId)
    if (list) list.push(r)
    else out.set(r.positionId, [r])
  }
  return out
}

/** The row in effect on a date for every position that has one then. */
export function rowsOn(positions: readonly PositionRow[], d: ISODate): Map<string, PositionRow> {
  const out = new Map<string, PositionRow>()
  for (const [id, list] of rowsByPosition(positions)) {
    const r = rowOn(list, d)
    if (r) out.set(id, r)
  }
  return out
}

/** A position's latest row (the org a line joins to at read time, docs/PLAN.md 15.1 R26). */
export function latestRows(positions: readonly PositionRow[]): Map<string, PositionRow> {
  return rowsOn(positions, '9999-12-31')
}

/**
 * Whether a position sits in the tree under a root position on a date (strictly below it), walking
 * up the manager positions of the rows in effect then. The forecast and the freezes read it.
 */
export function inTreeOf(
  positions: readonly PositionRow[],
): (positionId: string, rootPositionId: string, on: ISODate) => boolean {
  const byId = rowsByPosition(positions)
  const cache = new Map<ISODate, Map<string, PositionRow>>()
  const at = (on: ISODate) => {
    let m = cache.get(on)
    if (!m) {
      m = new Map()
      for (const [id, list] of byId) {
        const r = rowOn(list, on)
        if (r) m.set(id, r)
      }
      if (cache.size > 64) cache.clear()
      cache.set(on, m)
    }
    return m
  }
  return (positionId, rootPositionId, on) => {
    const rows = at(on)
    const seen = new Set<string>()
    let cur = rows.get(positionId)?.managerPositionId ?? null
    while (cur != null && !seen.has(cur)) {
      if (cur === rootPositionId) return true
      seen.add(cur)
      cur = rows.get(cur)?.managerPositionId ?? null
    }
    return false
  }
}
