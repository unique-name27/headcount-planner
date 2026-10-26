/**
 * Reconciliation (docs/PLAN.md 6.10, 15.1 R27): the imported `status` against assignments on the
 * as-of date. Worker type mismatches are data-quality issues, not exceptions. Built by engines C in
 * M1. Pure.
 *
 * Readings kept here:
 *  - Assignments are heads.ts `toAssignments` of the workers rows (start = assignmentStart or the hire
 *    date; last day = the earlier of assignmentEnd and terminationDate, inclusive), active on the as-of
 *    date by `isActiveOn` (the last day counts).
 *  - `not-in-plan`, `cost-center-mismatch`, `assignment-on-open` and `overlap` read Employee
 *    assignments only: a contractor or intern covering an Open seat is a worker type question for data
 *    quality. `filled-no-assignment` counts an active assignment of any worker type, so a contractor
 *    seat held by a contractor is not an exception.
 *  - A worker whose positionId has no row on the as-of date (unknown, or not created yet) is not in the
 *    plan.
 *  - `overlap`: two Employee assignments active on one seat on the as-of date whose shared days (from
 *    the later start to the earlier last day; no last day is open-ended) are more than HANDOVER_DAYS.
 *  - `cost-center-mismatch` needs the worker row's cost center filled in; a blank one is not compared.
 *  - One exception per id: the first holder found names it (workers in file order).
 */
import type { ISODate, PositionRow, WorkerRow } from '@/data/schema'
import { formatDate, ms } from '@/lib/dates'
import type { Assignment } from '../types'
import { isActiveOn, toAssignments } from './heads'

/** The exception kinds, in the order Finance > Reconcile lists them. */
export const RECON_KINDS = [
  'not-in-plan',
  'cost-center-mismatch',
  'filled-no-assignment',
  'assignment-on-open',
  'overlap',
] as const
export type ReconKind = (typeof RECON_KINDS)[number]

/** Two assignments on one seat may overlap by up to this many days (a handover). */
export const HANDOVER_DAYS = 30

/** One exception. Text names positions and kinds, never an amount. */
export interface ReconException {
  /** '<kind>:<positionId or employeeId>', stable across loads (Mark reviewed keeps it). */
  id: string
  kind: ReconKind
  positionId: string | null
  employeeId: string | null
  /** One plain sentence. */
  detail: string
}

/** Each seat's row in effect on `d` (the latest with effectiveDate on or before it). */
function rowsOn(positions: readonly PositionRow[], d: ISODate): Map<string, PositionRow> {
  const out = new Map<string, PositionRow>()
  for (const row of positions) {
    if (row.effectiveDate > d) continue
    const had = out.get(row.positionId)
    if (!had || row.effectiveDate >= had.effectiveDate) out.set(row.positionId, row)
  }
  return out
}

const blank = (v: string | null | undefined): boolean => v == null || v.trim() === ''

/** Days two assignments share; Infinity when both run on with no last day. */
function sharedDays(a: Assignment, b: Assignment): number {
  const start = a.start > b.start ? a.start : b.start
  const ends = [a.end, b.end].filter((e): e is ISODate => e != null)
  if (ends.length === 0) return Number.POSITIVE_INFINITY
  const end = ends.reduce((x, y) => (x < y ? x : y))
  return end < start ? 0 : Math.round((ms(end) - ms(start)) / 86_400_000) + 1
}

/**
 * The exceptions on `asOf`: `not-in-plan` (an active employee with no position), `cost-center-mismatch`
 * (a worker's cost center differs from the position's), `filled-no-assignment` (imported Filled with
 * no active assignment), `assignment-on-open` (an active assignment on an imported Open, On hold or
 * Eliminated row; Planned is the early-start shape and is not an exception), `overlap` (two
 * assignments on one seat overlapping by more than HANDOVER_DAYS). Sorted by kind, then id.
 *
 * Fixtures (versions.test.ts): H3 (none at 30 Sep 2026), H4 (Planned with an assignment: none; Open,
 * On hold or Eliminated with it: `assignment-on-open`).
 */
export function reconcile(
  input: { positions: readonly PositionRow[]; workers: readonly WorkerRow[] },
  asOf: ISODate,
): ReconException[] {
  const rows = rowsOn(input.positions, asOf)
  const assignments = toAssignments(input.workers)
  const on = formatDate(asOf)
  const found = new Map<string, ReconException>()
  const add = (e: Omit<ReconException, 'id'>) => {
    const id = `${e.kind}:${e.kind === 'not-in-plan' ? e.employeeId : e.positionId}`
    if (!found.has(id)) found.set(id, { id, ...e })
  }

  /** Active assignments by seat; every active one (any worker type) and the Employee ones. */
  const activeOn = new Map<string, { any: number; employees: { a: Assignment; w: WorkerRow }[] }>()
  assignments.forEach((a, i) => {
    if (!isActiveOn(a, asOf)) return
    const w = input.workers[i]
    const row = a.positionId == null ? undefined : rows.get(a.positionId)
    if (a.workerType === 'Employee' && !row) {
      add({
        kind: 'not-in-plan',
        positionId: null,
        employeeId: a.employeeId,
        detail:
          a.positionId == null
            ? `${a.employeeId} is active on ${on} with no position.`
            : `${a.employeeId} is active on ${on} in ${a.positionId}, which is not in the plan.`,
      })
      return
    }
    if (!row || a.positionId == null) return
    const seat = activeOn.get(a.positionId) ?? { any: 0, employees: [] }
    seat.any++
    if (a.workerType === 'Employee') seat.employees.push({ a, w })
    activeOn.set(a.positionId, seat)
  })

  for (const [positionId, row] of rows) {
    const seat = activeOn.get(positionId)
    if (row.status === 'Filled' && !seat?.any)
      add({
        kind: 'filled-no-assignment',
        positionId,
        employeeId: null,
        detail: `${positionId} is imported as Filled but no one is in it on ${on}.`,
      })
    if (!seat) continue
    for (const { a, w } of seat.employees) {
      if (!blank(w.costCenter) && w.costCenter !== row.costCenter)
        add({
          kind: 'cost-center-mismatch',
          positionId,
          employeeId: a.employeeId,
          detail: `${a.employeeId} is in cost center ${w.costCenter}, but ${positionId} is in ${row.costCenter}.`,
        })
      if (row.status === 'Open' || row.status === 'On hold' || row.status === 'Eliminated')
        add({
          kind: 'assignment-on-open',
          positionId,
          employeeId: a.employeeId,
          detail: `${positionId} is imported as ${row.status}, but ${a.employeeId} is in it on ${on}.`,
        })
    }
    const holders = seat.employees
    for (let i = 0; i < holders.length; i++)
      for (let j = i + 1; j < holders.length; j++)
        if (sharedDays(holders[i].a, holders[j].a) > HANDOVER_DAYS)
          add({
            kind: 'overlap',
            positionId,
            employeeId: holders[j].a.employeeId,
            detail: `${positionId} has ${holders[i].a.employeeId} and ${holders[j].a.employeeId} in it together for more than ${HANDOVER_DAYS} days.`,
          })
  }

  const rank = (k: ReconKind) => RECON_KINDS.indexOf(k)
  return [...found.values()].sort(
    (x, y) => rank(x.kind) - rank(y.kind) || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0),
  )
}
