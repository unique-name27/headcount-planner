/**
 * One line source for a Working version's figures (docs/PLAN.md 6.6, 6.9, change C33, review RF-4):
 * the months through the last close are the closes' actual lines, read instead of recomputed (one-time
 * items included, C32), and the later months are the version's own lines. Plan, Forecast and Targets
 * read their Working figures through this rule, and so does the sample's routing (the guarded asks
 * cost `chainFor` compares, src/data/sample/routing.ts), so no two Finance figures price a closed
 * month from different lines. (Before C33, Targets priced the closed months from Working's own
 * recomputed lines while Plan read the closes, and the two together gave a cost center's back-dated
 * pay change at one as-of date, RF-4.) The forecast engine reads the closes for its actual months the
 * same way (src/plan/engine/forecast.ts).
 *
 * Readings taken here (finance-guard fix, C33):
 *  - A close line becomes a plan line of basis 'hris' with the employee as holder, status Filled and
 *    `versionId` 'actual'. People not in the plan (no position) are left out of a version's lines:
 *    they count in actual heads, never in a position's cost.
 *  - Closes carry no vacancy allowance (15.2 C31), so a Working version's closed months hold none;
 *    its open months keep theirs. Asks cost, the Finance gap and story 9's guarded asks cost read
 *    the same (re-derived in C33).
 *  - `keep` narrows the close lines to a set of positions (a caller that holds one org's own lines).
 *  - Back-dated adjustments (docs/PLAN.md 6.6, the spec's "back-dated changes post as adjustments in
 *    the first open month"; M4 review SA-2) post in their `postedIn` month, the month the close that
 *    found them closed: each adjustment of a position is a line of its own there (`adjustmentLines`,
 *    the forecast's `withAdjustments` reading: basis 'hris', the employee as holder, heads 0 and FTE
 *    0), beside that close's own lines, so Plan's actual months, Targets and the sample's routing read
 *    close + adjustments, as the forecast, Variance and the bridge do. Each keeps its `positionId`, so
 *    it folds with its seat's cost center and atom; C33 (d) still lists and counts them at company
 *    level only. An adjustment posted in a month that is not closed, or for an employee not in the
 *    plan, is left out (no close reads it).
 *
 * Pure; memoized per own-lines array, closes array and adjustments array.
 */
import type { Month } from '@/data/schema'
import { actualLineRows } from './engine/lineTable'
import type { Adjustment, MonthClose, PlanLine } from './types'

/** One close line read as a plan line (basis 'hris'); `employeeId` and the close's position kept. */
export interface CloseLine extends PlanLine {
  employeeId: string
  /** The close line's position, or null for an employee not in the plan. */
  closePositionId: string | null
}

const closeMemo = new WeakMap<readonly MonthClose[], readonly CloseLine[]>()

/** Every close's lines as plan lines, in close order (people not in the plan keep `positionId` ''). */
export function closeLines(closes: readonly MonthClose[]): readonly CloseLine[] {
  let hit = closeMemo.get(closes)
  if (!hit) {
    const out: CloseLine[] = []
    for (const c of [...closes].sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0)))
      for (const l of actualLineRows(c.lines))
        out.push({
          positionId: l.positionId ?? '',
          versionId: 'actual',
          month: l.month,
          holderId: l.employeeId,
          status: 'Filled',
          heads: l.heads,
          fte: l.fte,
          active: l.active,
          currency: l.currency,
          rate: l.rate,
          local: { ...l.local },
          usd: { ...l.usd },
          basis: 'hris',
          employeeId: l.employeeId,
          closePositionId: l.positionId,
        })
    hit = out
    closeMemo.set(closes, hit)
  }
  return hit
}

/** The closed months, in order. */
export function closedMonths(closes: readonly MonthClose[]): Month[] {
  return [...new Set(closes.map((c) => c.month))].sort()
}

const NO_ADJUSTMENTS: readonly Adjustment[] = []
const adjustmentMemo = new WeakMap<readonly Adjustment[], readonly PlanLine[]>()

/**
 * Each adjustment of a position as a plan line in its `postedIn` month (see the module comment):
 * basis 'hris', the employee as holder, status Filled, heads 0 and FTE 0 (it changes a closed
 * month's cost, not the posting month's heads), the delta's local and USD amounts at its rate,
 * `versionId` 'actual'. Adjustments of employees not in the plan are left out. In posting order.
 */
export function adjustmentLines(adjustments: readonly Adjustment[]): readonly PlanLine[] {
  let hit = adjustmentMemo.get(adjustments)
  if (!hit) {
    const out: PlanLine[] = []
    for (const a of adjustments) {
      const positionId = a.delta.positionId ?? a.positionId
      if (!positionId) continue
      out.push({
        positionId,
        versionId: 'actual',
        month: a.postedIn,
        holderId: a.delta.employeeId,
        status: 'Filled',
        heads: 0,
        fte: 0,
        active: a.delta.active,
        currency: a.delta.currency,
        rate: a.delta.rate,
        local: { ...a.delta.local },
        usd: { ...a.delta.usd },
        basis: 'hris',
      })
    }
    hit = out
    adjustmentMemo.set(adjustments, hit)
  }
  return hit
}

const shownMemo = new WeakMap<
  readonly PlanLine[],
  WeakMap<readonly MonthClose[], WeakMap<readonly Adjustment[], readonly PlanLine[]>>
>()

/**
 * A Working version's lines as its figures read them (see the module comment): the closes' lines of
 * positions (kept to `keep` when given) in the closed months, with the back-dated adjustments posted
 * in them (SA-2), then the own lines of every other month. With no close, the own lines themselves.
 */
export function withClosedMonths(
  own: readonly PlanLine[],
  closes: readonly MonthClose[],
  keep?: ((positionId: string) => boolean) | null,
  adjustments: readonly Adjustment[] = NO_ADJUSTMENTS,
): readonly PlanLine[] {
  const closed = new Set(closedMonths(closes))
  if (!closed.size) return own
  const build = (): PlanLine[] => {
    const out: PlanLine[] = []
    for (const l of closeLines(closes))
      if (l.positionId && closed.has(l.month) && (!keep || keep(l.positionId))) out.push(l)
    for (const l of adjustmentLines(adjustments))
      if (closed.has(l.month) && (!keep || keep(l.positionId))) out.push(l)
    for (const l of own) if (!closed.has(l.month)) out.push(l)
    return out
  }
  if (keep) return build()
  let byCloses = shownMemo.get(own)
  if (!byCloses) {
    byCloses = new WeakMap()
    shownMemo.set(own, byCloses)
  }
  let byAdjustments = byCloses.get(closes)
  if (!byAdjustments) {
    byAdjustments = new WeakMap()
    byCloses.set(closes, byAdjustments)
  }
  let hit = byAdjustments.get(adjustments)
  if (!hit) {
    hit = build()
    byAdjustments.set(adjustments, hit)
  }
  return hit
}
