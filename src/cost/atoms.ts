/**
 * Cost atoms (docs/PLAN.md 7.3a, change C3 and C20): the one rounding partition every rounded mode
 * (HRBP and Leader) shares. Built in M1 by engines A, because close.ts stores `atomIndex` with each
 * month close; the rest of src/cost/ is M2's.
 *
 * - A leader seat is a position at Director (M2) or above, or one marked as a leader in Lists, or one
 *   whose own `leaderLevel` says so (`leaderLevel` false un-marks an M2+ seat).
 * - A position's atom is the subtree of its nearest leader seat at or above it, minus the subtrees of
 *   any leader seats below that one: a director's org, or a VP's own direct staff. The atom's id is
 *   that leader seat's positionId.
 * - With no leader seats in the data, the atom falls back to the department ('department:<unit>|<dept>'),
 *   then the business unit ('unit:<unit>'). A position above every leader seat and in no department
 *   takes its unit's atom.
 * - The index is fixed at each month close and stored with it; every rounded figure (Working,
 *   forecast, locked versions, QTD, YTD, gap) reads the last close's index. Working edits, requests,
 *   approvals and transfers never move a position between atoms before the next close. A position
 *   created since the close takes its manager position's atom; a seat raised to M2 since the close
 *   stays in its old atom.
 *
 * Pure. Plain data (no Map), so a close clones into IndexedDB and writes to a Full workspace file.
 */
import { type ISODate, isLeaderLevel, type PositionRow } from '@/data/schema'

/** Each position's row in effect on `on` (the latest on or before it; ties to the later row), Eliminated rows left out. */
function rowsOn(positions: readonly PositionRow[], on: ISODate): Map<string, PositionRow> {
  const latest = new Map<string, PositionRow>()
  for (const r of positions) {
    if (r.effectiveDate > on) continue
    const seen = latest.get(r.positionId)
    if (!seen || r.effectiveDate >= seen.effectiveDate) latest.set(r.positionId, r)
  }
  for (const [id, r] of latest) if (r.status === 'Eliminated') latest.delete(id)
  return latest
}

/** Whether a row in effect heads a leader seat (see `leaderSeats`). */
const isLeaderRow = (r: PositionRow, listed: ReadonlySet<string> | undefined): boolean =>
  listed?.has(r.positionId) === true ||
  r.leaderLevel === true ||
  (r.leaderLevel !== false && isLeaderLevel(r.level))

const departmentAtom = (unit: string, department: string): string => `department:${unit}|${department}`
const unitAtom = (unit: string): string => `unit:${unit}`

/** How an atom was formed. */
export type AtomKind = 'leader' | 'department' | 'unit'

/** One cost atom at a close. */
export interface Atom {
  /** The leader seat's positionId, or 'department:<unit>|<department>' or 'unit:<unit>' (fallbacks). */
  atomId: string
  kind: AtomKind
  /** The leader seat heading it; null for a fallback atom. */
  leaderPositionId: string | null
  businessUnit: string
  department: string | null
  /** Every position in the atom on the close date, sorted. */
  positionIds: readonly string[]
}

/** The atoms at one close, and each position's atom (positionId to atomId). */
export interface AtomIndex {
  /** The month-end the index was computed at (the close's month end). */
  closeDate: ISODate
  atoms: readonly Atom[]
  /** positionId to atomId; built with Object.create(null) so no ID can reach a prototype. */
  byPosition: Readonly<Record<string, string>>
}

/**
 * The leader seats among the positions in effect on `on`: level M2 or above unless the row's
 * `leaderLevel` is false, plus any row whose `leaderLevel` is true, plus the positions in `listed`
 * (marked as leaders in Lists). Eliminated seats are never leader seats.
 *
 * Fixture: atoms.test.ts AT1.
 */
export function leaderSeats(
  positions: readonly PositionRow[],
  on: ISODate,
  listed?: ReadonlySet<string>,
): Set<string> {
  const out = new Set<string>()
  for (const [id, r] of rowsOn(positions, on)) if (isLeaderRow(r, listed)) out.add(id)
  return out
}

/**
 * The atom index at a close: resolves every position to its row in effect on `closeDate` (Eliminated
 * seats left out), finds the leader seats and assigns each position to its atom (see the module
 * comment). Stored with the close (src/plan/engine/close.ts).
 *
 * Fixture: atoms.test.ts AT1, AT2 (no leader seats: department, then unit).
 */
export function atomIndex(
  positions: readonly PositionRow[],
  closeDate: ISODate,
  listed?: ReadonlySet<string>,
): AtomIndex {
  const rows = rowsOn(positions, closeDate)
  const leaders = new Set<string>()
  for (const [id, r] of rows) if (isLeaderRow(r, listed)) leaders.add(id)

  /** The nearest leader seat at or above a position, walking up manager positions (cycle-safe). */
  const leaderOf = (id: string): string | null => {
    const seen = new Set<string>()
    let cur: string | null = id
    while (cur !== null && !seen.has(cur)) {
      if (leaders.has(cur)) return cur
      seen.add(cur)
      const up: string | null = rows.get(cur)?.managerPositionId ?? null
      cur = up !== null && rows.has(up) ? up : null
    }
    return null
  }

  const byPosition: Record<string, string> = Object.create(null)
  const members = new Map<string, string[]>()
  const atoms = new Map<string, Omit<Atom, 'positionIds'>>()
  for (const [id, r] of rows) {
    const leader = leaderOf(id)
    let atom: Omit<Atom, 'positionIds'>
    if (leader !== null) {
      const head = rows.get(leader) as PositionRow
      atom = {
        atomId: leader,
        kind: 'leader',
        leaderPositionId: leader,
        businessUnit: head.businessUnit,
        department: head.department ?? null,
      }
    } else if (r.department) {
      atom = {
        atomId: departmentAtom(r.businessUnit, r.department),
        kind: 'department',
        leaderPositionId: null,
        businessUnit: r.businessUnit,
        department: r.department,
      }
    } else {
      atom = {
        atomId: unitAtom(r.businessUnit),
        kind: 'unit',
        leaderPositionId: null,
        businessUnit: r.businessUnit,
        department: null,
      }
    }
    byPosition[id] = atom.atomId
    if (!atoms.has(atom.atomId)) atoms.set(atom.atomId, atom)
    const list = members.get(atom.atomId)
    if (list) list.push(id)
    else members.set(atom.atomId, [id])
  }
  const ids = [...atoms.keys()].sort()
  return {
    closeDate,
    atoms: ids.map((atomId) => ({
      ...(atoms.get(atomId) as Omit<Atom, 'positionIds'>),
      positionIds: (members.get(atomId) ?? []).sort(),
    })),
    byPosition,
  }
}

/**
 * The atom a position belongs to under a stored index. A position not in the index (created since
 * the close) takes its manager position's atom, walking up through `managerOf` until a position in
 * the index is found; null when none is.
 *
 * Fixture: atoms.test.ts AT1 (a new Planned seat takes its manager's atom).
 */
export function atomOf(
  positionId: string,
  index: AtomIndex,
  managerOf?: (positionId: string) => string | null,
): string | null {
  const seen = new Set<string>()
  let cur: string | null = positionId
  while (cur !== null && !seen.has(cur)) {
    if (Object.hasOwn(index.byPosition, cur)) return index.byPosition[cur]
    seen.add(cur)
    cur = managerOf ? managerOf(cur) : null
  }
  return null
}

/**
 * Whether a set of positions is a whole union of atoms: every atom that holds a position of the set
 * lies entirely inside the set. Positions not in the index are placed with `atomOf` and
 * `managerOf`. An empty set is a union (of no atoms).
 *
 * Fixture: atoms.test.ts AT1.
 */
export function isUnionOfAtoms(
  set: ReadonlySet<string>,
  index: AtomIndex,
  managerOf?: (positionId: string) => string | null,
): boolean {
  const touched = new Set<string>()
  for (const id of set) {
    const atom = atomOf(id, index, managerOf)
    if (atom === null) return false
    touched.add(atom)
  }
  if (touched.size === 0) return true
  for (const atom of index.atoms) {
    if (!touched.has(atom.atomId)) continue
    for (const id of atom.positionIds) if (!set.has(id)) return false
  }
  return true
}
