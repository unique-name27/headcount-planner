/**
 * Forecast heads and flows by month for the scope (docs/PLAN.md 6.7, 9.4): heads at each month-end
 * (closed months actual, open months projected and probability-weighted), average FTE, and the
 * starts, known exits, modeled exits and modeled backfills of each month. The forecast is
 * position-based: employees not in the plan are left out (forecast.ts). Every figure is a sum over
 * the scope's seats, so a drill's "Counts as" adds up to it exactly. Pure.
 *
 * Readings taken here (views-1 builder, M2):
 *  - A seat's expected heads at a month-end are its lines' heads that month: its holder or opening,
 *    plus its part of the unit's modeled exits and backfills (./run.ts).
 *  - Closed months' starts are the hires into the scope's seats that month and their known exits
 *    the leavers whose last day falls in it; open months' starts are the expected starts
 *    (probability-weighted, accepted offers 1) and their known exits the scope's employees whose
 *    known last day falls in the month.
 *  - A last day is read from the assignments clipped at an approved Elimination's last day (R34), as
 *    the run reads them (`exitDaysOf`, review HN-2).
 */
import { monthKey } from '@/data/fiscal'
import type { ISODate, Month, PositionRow } from '@/data/schema'
import { clipAtElimination } from '@/plan/engine/versions'
import type { Assignment, PlanLine } from '@/plan/types'
import type { FPrep } from './base'
import { type ForecastRun, runInputOf } from './run'

/** Heads and FTE by month and by seat, from the scope's forecast lines. */
export interface HeadsByMonth {
  heads: ReadonlyMap<Month, number>
  fte: ReadonlyMap<Month, number>
  /** Each seat's expected heads by month. */
  bySeat: ReadonlyMap<Month, ReadonlyMap<string, number>>
}

const headsMemo = new WeakMap<FPrep, HeadsByMonth>()

/**
 * FTE a line carries over its month: its FTE × its active fraction by day (a cohort part: its FTE
 * change). Average FTE is daily whatever the version's proration (spec "Heads and FTE", PLAN 2; M4
 * review SA-5): a line priced under another proration carries `activeDaily`.
 */
export const lineFte = (l: PlanLine): number => l.fte * (l.activeDaily ?? l.active)

export function forecastHeads(p: FPrep): HeadsByMonth {
  const hit = headsMemo.get(p)
  if (hit) return hit
  const heads = new Map<Month, number>()
  const fte = new Map<Month, number>()
  const bySeat = new Map<Month, Map<string, number>>()
  for (const l of p.lines) {
    heads.set(l.month, (heads.get(l.month) ?? 0) + l.heads)
    fte.set(l.month, (fte.get(l.month) ?? 0) + lineFte(l))
    if (l.heads === 0) continue
    let s = bySeat.get(l.month)
    if (!s) {
      s = new Map()
      bySeat.set(l.month, s)
    }
    s.set(l.positionId, (s.get(l.positionId) ?? 0) + l.heads)
  }
  const out = { heads, fte, bySeat }
  headsMemo.set(p, out)
  return out
}

/** One month's flows in the scope, with what each seat counts as. */
export interface MonthFlows {
  month: Month
  starts: number
  knownExits: number
  modeledExits: number
  modeledBackfills: number
  /** By seat: starts (probability), modeled exits and backfills; known exits by employee. */
  startSeats: ReadonlyMap<string, number>
  exitSeats: ReadonlyMap<string, number>
  backfillSeats: ReadonlyMap<string, number>
  leavers: readonly string[]
}

const flowsMemo = new WeakMap<FPrep, ReadonlyMap<Month, MonthFlows>>()

/** An employee's last day of employment in a set of assignments, and the seat held on it (null while one is open). */
export interface ExitDay {
  end: ISODate | null
  positionId: string | null
}

/**
 * Each employee's last day of employment in a set of assignments (null while one is open), with the
 * seat held on it. Every assignment is read clipped at an approved Elimination's last day (R34,
 * versions.ts `clipAtElimination`), as the forecast run reads them, so the holder of a seat an
 * approved Elimination or Trade ends is a known exit on its last day before HRIS records it (review
 * HN-2): the run nets that exit against the cohort's modeled exits, and the known exits agree with it.
 * Plan > Hiring reads the same days (src/views/plan/engine/hiringData.ts).
 */
export function exitDaysOf(
  assignments: readonly Assignment[],
  rowsOf: (positionId: string) => readonly PositionRow[],
): Map<string, ExitDay> {
  const out = new Map<string, ExitDay>()
  for (const a of clipAtElimination(assignments, rowsOf)) {
    if (!a.positionId) continue
    const cur = out.get(a.employeeId)
    if (cur && cur.end === null) continue
    if (a.end == null) out.set(a.employeeId, { end: null, positionId: a.positionId })
    else if (cur === undefined || (cur.end !== null && a.end > cur.end))
      out.set(a.employeeId, { end: a.end, positionId: a.positionId })
  }
  return out
}

const rowsMemo = new WeakMap<ForecastRun, ReadonlyMap<string, readonly PositionRow[]>>()

/** A run's position rows by seat (the rows its forecast read). */
function rowsOfRun(run: ForecastRun): ReadonlyMap<string, readonly PositionRow[]> {
  let hit = rowsMemo.get(run)
  if (!hit) {
    const m = new Map<string, PositionRow[]>()
    for (const r of runInputOf(run).positions) {
      const list = m.get(r.positionId)
      if (list) list.push(r)
      else m.set(r.positionId, [r])
    }
    hit = m
    rowsMemo.set(run, hit)
  }
  return hit
}

const NO_ROWS: readonly PositionRow[] = []

/** The last day of an employee's employment in the scope's assignments (null while one is open). */
function exitDays(p: FPrep, run: ForecastRun): Map<string, ISODate | null> {
  const rows = rowsOfRun(run)
  const out = new Map<string, ISODate | null>()
  for (const [id, x] of exitDaysOf(p.scope.assignments, (seat) => rows.get(seat) ?? NO_ROWS))
    out.set(id, x.end)
  return out
}

export function forecastFlows(p: FPrep): ReadonlyMap<Month, MonthFlows> {
  const hit = flowsMemo.get(p)
  if (hit) return hit
  const run = p.run
  const out = new Map<Month, MonthFlows>()
  if (!run) {
    flowsMemo.set(p, out)
    return out
  }
  const ids = p.scope.ids
  const actual = (m: Month) => m <= run.actualThrough
  const blank = (month: Month) => ({
    month,
    starts: 0,
    knownExits: 0,
    modeledExits: 0,
    modeledBackfills: 0,
    startSeats: new Map<string, number>(),
    exitSeats: new Map<string, number>(),
    backfillSeats: new Map<string, number>(),
    leavers: [] as string[],
  })
  for (const m of run.months) out.set(m, blank(m))
  const add = (map: Map<string, number>, id: string, v: number) => map.set(id, (map.get(id) ?? 0) + v)
  // Starts: hires in closed months, expected starts in open months.
  for (const w of p.scope.workers) {
    if (!w.positionId || !ids.has(w.positionId)) continue
    if ((w.assignmentStart || w.hireDate) !== w.hireDate) continue
    const m = monthKey(w.hireDate)
    const f = out.get(m)
    if (!f || !actual(m)) continue
    f.starts += 1
    add(f.startSeats as Map<string, number>, w.positionId, 1)
  }
  for (const [id, starts] of run.starts) {
    if (!ids.has(id)) continue
    for (const s of starts) {
      const m = monthKey(s.start)
      const f = out.get(m)
      if (!f || actual(m)) continue
      f.starts += s.probability
      add(f.startSeats as Map<string, number>, id, s.probability)
    }
  }
  // Known exits: the scope's leavers, by the month of their last day.
  for (const [employeeId, end] of exitDays(p, run)) {
    if (!end) continue
    const f = out.get(monthKey(end))
    if (!f) continue
    if (actual(f.month) || end >= p.ctx.asOf) {
      f.knownExits += 1
      ;(f.leavers as string[]).push(employeeId)
    }
  }
  // Modeled exits and backfills by seat.
  for (const [id, months] of run.cohorts) {
    if (!ids.has(id)) continue
    for (const c of months) {
      const f = out.get(c.month)
      if (!f) continue
      const exits = c.hrisExits + c.bandExits
      if (exits) {
        f.modeledExits += exits
        add(f.exitSeats as Map<string, number>, id, exits)
      }
      if (c.backfills) {
        f.modeledBackfills += c.backfills
        add(f.backfillSeats as Map<string, number>, id, c.backfills)
      }
    }
  }
  flowsMemo.set(p, out)
  return out
}

/** Σ a by-seat measure over months, by seat. */
export function sumBySeat(
  flows: ReadonlyMap<Month, MonthFlows>,
  months: readonly Month[],
  pick: (f: MonthFlows) => ReadonlyMap<string, number>,
): Map<string, number> {
  const out = new Map<string, number>()
  for (const m of months) {
    const f = flows.get(m)
    if (!f) continue
    for (const [id, v] of pick(f)) out.set(id, (out.get(id) ?? 0) + v)
  }
  return out
}
