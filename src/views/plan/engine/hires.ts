/**
 * Hires year to date against planned hires (docs/PLAN.md 12 `plan.hires.ytd`, `plan.hires.planned`,
 * 15.1 R29), both over the fiscal year's start to the last closed month-end, in scope. Pure.
 *
 * Readings taken here (views-1 builder, M2):
 *  - A hire is an employee (worker type Employee) hired in the window into a seat in scope: the
 *    worker row whose assignment starts on the hire date (a later assignment is a move, not a hire).
 *  - A planned hire is a comparison seat in scope whose plan line first counts a head in the window
 *    (its first month with a head, through the window's last month, falls in the window), leaving out
 *    seats a transfer fills and seats Filled at the fiscal year's start: seats the comparison costs at
 *    HRIS pay in the year's first month (so its holder was known when it locked) and that were Filled
 *    on the year's first day.
 */
import { fyRange, monthEnd } from '@/data/fiscal'
import type { Month, WorkerRow } from '@/data/schema'
import { requestsOf } from '@/drill/seats'
import type { Prep } from './base'
import { seatOn, versionLinesOf } from './core'

export interface Hires {
  /** The window's months (the fiscal year's start to the last closed month). */
  months: readonly Month[]
  /** One worker row per hire, in employee ID order. */
  hired: readonly WorkerRow[]
  /** Planned hires (position IDs) in the comparison; null for a target comparison. */
  planned: readonly string[] | null
}

const memo = new WeakMap<Prep, Hires>()

export function hiresOf(p: Prep): Hires {
  const hit = memo.get(p)
  if (hit) return hit
  const months = p.ytdMonths
  const from = fyRange(p.fiscalYear).start
  const to = months.length ? monthEnd(months[months.length - 1]) : from
  const hired = new Map<string, WorkerRow>()
  if (months.length)
    for (const w of p.scope.workers) {
      if (!w.positionId || !p.scope.ids.has(w.positionId)) continue
      if (w.hireDate < from || w.hireDate > to) continue
      if ((w.assignmentStart || w.hireDate) !== w.hireDate) continue
      if (!hired.has(w.employeeId)) hired.set(w.employeeId, w)
    }
  let planned: string[] | null = null
  const v = p.comparison
  if (v) {
    planned = []
    if (months.length) {
      const first = months[0]
      const last = months[months.length - 1]
      const transferred = new Set<string>()
      for (const q of requestsOf(p.ctx))
        if (q.type === 'Transfer' && q.transfer?.toPositionId) transferred.add(q.transfer.toPositionId)
      const firstHead = new Map<string, Month>()
      const heldAtStart = new Set<string>()
      for (const l of versionLinesOf(p.ctx, v)) {
        if (!p.scope.ids.has(l.positionId)) continue
        if (l.month === first && l.basis === 'hris' && l.holderId) heldAtStart.add(l.positionId)
        if (l.heads <= 0 || l.month > last) continue
        const seen = firstHead.get(l.positionId)
        if (!seen || l.month < seen) firstHead.set(l.positionId, l.month)
      }
      for (const [id, month] of firstHead) {
        if (month < first || transferred.has(id)) continue
        if (heldAtStart.has(id) && seatOn(p.ctx, id, from)?.status === 'Filled') continue
        planned.push(id)
      }
      planned.sort()
    }
  }
  const out: Hires = {
    months,
    hired: [...hired.values()].sort((a, b) => (a.employeeId < b.employeeId ? -1 : 1)),
    planned,
  }
  memo.set(p, out)
  return out
}
