/**
 * The cost-atom index a context reads when no month close is in plan state (docs/PLAN.md 7.3a, C20):
 * the index at the last month-end on or before the as-of date, memoized per positions array and
 * date, so the scopes' sub-orgs and the analytics context's guard share one object. With a close,
 * the context passes the close's stored index instead. Pure.
 */
import { type AtomIndex, atomIndex } from '@/cost/atoms'
import { monthEndOnOrBefore } from '@/data/fiscal'
import type { ISODate, PositionRow } from '@/data/schema'

const memo = new WeakMap<readonly PositionRow[], Map<ISODate, AtomIndex>>()

/** The atom index at the month-end on or before `asOf` (memoized). */
export function atomsOn(positions: readonly PositionRow[], asOf: ISODate): AtomIndex {
  const on = monthEndOnOrBefore(asOf)
  let byDate = memo.get(positions)
  if (!byDate) {
    byDate = new Map()
    memo.set(positions, byDate)
  }
  let hit = byDate.get(on)
  if (!hit) {
    hit = atomIndex(positions, on)
    byDate.set(on, hit)
  }
  return hit
}
