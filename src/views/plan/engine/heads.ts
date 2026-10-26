/**
 * Heads in the Plan view (docs/PLAN.md 6.1, 6.5): the scope's seats on a day (approved heads, the
 * openings, positions by status), plan heads from a version's lines, actual heads from HRIS (people
 * not in the plan included) and from the closes, and average FTE. Every count keeps the rows it
 * counts, so its drill opens exactly them (9.5). Pure.
 */
import { fyRange, monthEnd } from '@/data/fiscal'
import type { ISODate, Month, PositionStatus } from '@/data/schema'
import { ms } from '@/lib/dates'
import type { SeatDetail } from '@/plan/engine/versions'
import type { Assignment, PlanLine } from '@/plan/types'
import type { Prep } from './base'
import { type ActiveEmployee, activeOn, type CloseLine, closeLinesOf, seatOn } from './core'

/** The scope's seats on one day. */
export interface SeatsOn {
  on: ISODate
  /** Every position in scope with a row on the day, with its state. */
  states: ReadonlyMap<string, SeatDetail>
  /** Approved heads: Filled, Open or Planned with a start by the day's fiscal year end (R1). */
  approved: readonly string[]
  /** Openings: Open and Planned Employee seats nobody has started in (an accepted offer still counts). */
  openings: readonly string[]
  /** Positions by derived status. */
  byStatus: ReadonlyMap<PositionStatus, readonly string[]>
}

const seatsMemo = new WeakMap<Prep, Map<ISODate, SeatsOn>>()

export function seatsOnDay(p: Prep, on: ISODate = p.on): SeatsOn {
  let byDay = seatsMemo.get(p)
  if (!byDay) {
    byDay = new Map()
    seatsMemo.set(p, byDay)
  }
  const hit = byDay.get(on)
  if (hit) return hit
  const states = new Map<string, SeatDetail>()
  const approved: string[] = []
  const openings: string[] = []
  const byStatus = new Map<PositionStatus, string[]>()
  for (const id of [...p.scope.ids].sort()) {
    const s = seatOn(p.ctx, id, on)
    if (!s) continue
    states.set(id, s)
    if (s.approvedHead) approved.push(id)
    if ((s.status === 'Open' || s.status === 'Planned') && s.position.workerType === 'Employee')
      openings.push(id)
    const list = byStatus.get(s.status)
    if (list) list.push(id)
    else byStatus.set(s.status, [id])
  }
  const out: SeatsOn = { on, states, approved, openings, byStatus }
  byDay.set(on, out)
  return out
}

/** Plan heads at a month-end from a version's lines: the positions in scope with a head, and how many (each 1). */
export function planHeadsAt(lines: readonly PlanLine[], month: Month, ids: ReadonlySet<string>): string[] {
  const out = new Set<string>()
  for (const l of lines) if (l.month === month && l.heads > 0 && ids.has(l.positionId)) out.add(l.positionId)
  return [...out].sort()
}

/** Plan heads by month at once (positions with a head, by month), for a version's lines. */
export function planHeadsByMonth(
  lines: readonly PlanLine[],
  months: readonly Month[],
  ids: ReadonlySet<string>,
): Map<Month, string[]> {
  const want = new Set(months)
  const sets = new Map<Month, Set<string>>()
  for (const l of lines) {
    if (!want.has(l.month) || l.heads <= 0 || !ids.has(l.positionId)) continue
    let s = sets.get(l.month)
    if (!s) {
      s = new Set()
      sets.set(l.month, s)
    }
    s.add(l.positionId)
  }
  const out = new Map<Month, string[]>()
  for (const m of months) out.set(m, [...(sets.get(m) ?? [])].sort())
  return out
}

/** The scope's employees active on a day (actual heads: people not in the plan included, docs/PLAN.md 2). */
export const actualOn = (p: Prep, d: ISODate = p.ctx.asOf): Map<string, ActiveEmployee> =>
  activeOn(p.scope, d)

/**
 * A closed month's actual heads in scope from its close: employees with a head in the close, by their
 * position in scope, or (not in the plan) by their own HRIS fields in scope.
 */
export function closeHeadsIn(p: Prep, month: Month): CloseLine[] {
  const out = new Map<string, CloseLine>()
  for (const l of closeLinesOf(p.ctx.plan)) {
    if (l.month !== month || l.heads <= 0) continue
    const inScope = l.closePositionId
      ? p.scope.ids.has(l.closePositionId)
      : p.scope.employees.has(l.employeeId)
    if (inScope && !out.has(l.employeeId)) out.set(l.employeeId, l)
  }
  return [...out.values()]
}

/** One assignment's part of an average FTE over a window: its FTE × its active days ÷ the window's days. */
export function fteShare(a: Assignment, window: { start: ISODate; end: ISODate }): number {
  const days = Math.round((ms(window.end) - ms(window.start)) / 86_400_000) + 1
  if (days <= 0) return 0
  const from = a.start > window.start ? a.start : window.start
  const to = a.end != null && a.end < window.end ? a.end : window.end
  if (to < from) return 0
  return (a.fte * (Math.round((ms(to) - ms(from)) / 86_400_000) + 1)) / days
}

/** The fiscal year to date as days: its first day to the as-of date (its last day for a past year). */
export function ytdDays(p: Prep): { start: ISODate; end: ISODate } {
  const fy = fyRange(p.fiscalYear)
  return { start: fy.start, end: p.on > fy.end ? fy.end : p.on < fy.start ? fy.start : p.on }
}

/** A month's last day. */
export const lastDayOf = (m: Month): ISODate => monthEnd(m)
