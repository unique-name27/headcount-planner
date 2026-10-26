/**
 * Who holds which seat (docs/PLAN.md 8.2): the reads every scope, picker and the viewer share,
 * memoized per workers array and date. A person holds a seat on a day when an Employee assignment
 * (start: `assignmentStart`, else the hire date; last day: `assignmentEnd`, else the termination
 * date, both inclusive) covers it. Pure.
 */
import type { ISODate, PositionRow, WorkerRow } from '@/data/schema'
import { type PositionIndex, placementRows } from '@/data/scope'

/** An assignment's first and last day (inclusive; no last day: open). */
export const assignmentSpan = (w: WorkerRow): { start: ISODate; end: ISODate | null } => ({
  start: w.assignmentStart || w.hireDate,
  end: w.assignmentEnd || w.terminationDate || null,
})

/** The worker row is an Employee assignment active on `d`. */
export function activeOn(w: WorkerRow, d: ISODate): boolean {
  if (!w?.positionId || (w.workerType ?? 'Employee') !== 'Employee') return false
  const { start, end } = assignmentSpan(w)
  return !!start && start <= d && (end == null || end >= d)
}

/** Who holds what on one day. */
export interface Holdings {
  /** Each person's seats on the day, in data order. */
  seatsOf: ReadonlyMap<string, readonly string[]>
  /** The holder of each seat on the day (the latest to start, if two overlap). */
  holderOf: ReadonlyMap<string, string>
  /** Every person's name, from any of their rows. */
  nameOf: ReadonlyMap<string, string>
  /** Everyone who ever held each seat (any date). */
  everHeld: ReadonlyMap<string, ReadonlySet<string>>
  /** The people with an active Employee assignment on the day. */
  active: ReadonlySet<string>
}

const memo = new WeakMap<readonly WorkerRow[], Map<ISODate, Holdings>>()

/** Who holds which seat on `d` (memoized per workers array and date). */
export function holdingsOn(workers: readonly WorkerRow[], d: ISODate): Holdings {
  let byDate = memo.get(workers)
  if (!byDate) {
    byDate = new Map()
    memo.set(workers, byDate)
  }
  const hit = byDate.get(d)
  if (hit) return hit
  const seatsOf = new Map<string, string[]>()
  const holder = new Map<string, { id: string; start: ISODate }>()
  const nameOf = new Map<string, string>()
  const everHeld = new Map<string, Set<string>>()
  const active = new Set<string>()
  for (const w of workers) {
    if (!w?.employeeId) continue
    if (w.name && !nameOf.has(w.employeeId)) nameOf.set(w.employeeId, w.name)
    if (!w.positionId) continue
    let ever = everHeld.get(w.positionId)
    if (!ever) {
      ever = new Set()
      everHeld.set(w.positionId, ever)
    }
    ever.add(w.employeeId)
    if (!activeOn(w, d)) continue
    active.add(w.employeeId)
    const list = seatsOf.get(w.employeeId)
    if (list) {
      if (!list.includes(w.positionId)) list.push(w.positionId)
    } else seatsOf.set(w.employeeId, [w.positionId])
    const start = assignmentSpan(w).start
    const cur = holder.get(w.positionId)
    if (!cur || start >= cur.start) holder.set(w.positionId, { id: w.employeeId, start })
  }
  const out: Holdings = {
    seatsOf,
    holderOf: new Map([...holder].map(([p, h]) => [p, h.id])),
    nameOf,
    everHeld,
    active,
  }
  byDate.set(d, out)
  return out
}

const placeMemo = new WeakMap<
  PositionIndex,
  WeakMap<readonly PositionRow[], ReadonlyMap<string, PositionRow>>
>()

/** Where each position sits (`placementRows`), memoized per index and positions array. */
export function placementsOf(
  positions: readonly PositionRow[],
  index: PositionIndex,
): ReadonlyMap<string, PositionRow> {
  let byPositions = placeMemo.get(index)
  if (!byPositions) {
    byPositions = new WeakMap()
    placeMemo.set(index, byPositions)
  }
  let hit = byPositions.get(positions)
  if (!hit) {
    hit = placementRows(positions, index)
    byPositions.set(positions, hit)
  }
  return hit
}

/**
 * The positions at or above a seat: the seat and every manager position above it in the index
 * (cycle-safe). A seat not yet in the index starts from its placement row's manager.
 */
export function upward(
  positionId: string,
  index: PositionIndex,
  place?: ReadonlyMap<string, PositionRow>,
): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  let cur: string | null | undefined = positionId
  while (cur && !seen.has(cur)) {
    seen.add(cur)
    out.push(cur)
    const row: PositionRow | undefined = index.byId.get(cur) ?? place?.get(cur)
    const up: string | null | undefined = row?.managerPositionId
    cur = up && up !== cur ? up : null
  }
  return out
}
