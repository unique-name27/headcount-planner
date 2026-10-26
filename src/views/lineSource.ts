/**
 * What the cost guard reads of a line beside its amounts, shared by the Plan, Forecast, Targets and
 * Finance models (lead decision D-FIN, PLAN change C33):
 *
 *  - `capSidesOf`: each costed line's capped burden components and the side of each cap its annual
 *    base + bonus sits on (src/cost/guard.ts `componentGate`, review RF-1: 23 people above the US
 *    social security cap and 1 below gave the one person's base + bonus from the burden split).
 *  - `paidLineOf`: a line on unpaid leave priced as paid (the same seat, month and holder from the
 *    fiscal year's Working line context with every month read as paid), so the cap check never reads
 *    leave (7.2 rule 1, C26). The forecast's bridge prices its own twins from the run's inputs
 *    (src/views/forecast/engine/paidTwins.ts, C34).
 *
 * Readings taken here (finance-guard fix, C33):
 *  - A line is on unpaid leave (or unpaid) when it costs a holder (basis 'hris' or 'offer', a
 *    holder, an active fraction above 0) but carries no base and no bonus. Its paid twin is the line
 *    the Working version's own line engine gives that seat, month and holder with leave read as paid
 *    (`unpaidLeave` false), at the Working version's assumptions: closed months and locked versions
 *    included, so the twin reads today's comp and never the leave a close or a lock stored. A twin
 *    that cannot be found counts the person on both sides of every cap, which hides the unit's split.
 *  - When that context has no such line, the twin is read from the same context costing every HRIS
 *    assignment (`futureAssignments`, as the forecast reads them, D-PREHIRE). With the reporting
 *    date before the last close the forecast prices people hired since from HRIS, and the Working
 *    context at the as-of date does not hold them: before the M2 close-out such a hire's unpaid
 *    months had no twin, so one person's leave (E11679 or E11713 at 30 June) turned Operations'
 *    forecast split off from October. Every twin the first context finds is kept as it was. With
 *    everyone on unpaid leave, every unpaid line of every version and of the forecast then has a twin
 *    on the sample, at the default reporting date, 31 August and 30 June.
 *  - A paid line's side reads its own amounts: annual base + bonus = (monthly base + bonus) × 12 ÷
 *    the active fraction, in the line's currency, against the cap of the seat's country and org at
 *    the line's version's assumptions (a close line's, the fiscal year's Working version's).
 *
 * Pure (memoized per loaded data, plan state, as-of date and version).
 */
import type { CapSide } from '@/cost/guard'
import type { AnalyticsContext } from '@/data/context'
import { fiscalYearOf } from '@/data/fiscal'
import type { Month } from '@/data/schema'
import { requestsOf } from '@/drill/seats'
import { type AssumptionLookup, assumptionLookup, burdenComponents } from '@/plan/engine/assumptions'
import { type LineContext, lineContext, monthLine } from '@/plan/engine/cost'
import { fxRatesFromAssumptions } from '@/plan/engine/fx'
import { toPosition, workingOf } from '@/plan/engine/versions'
import type { AnyVersion, PlanLine } from '@/plan/types'
import { assumptionRowsOf, costSeatOf } from '@/views/plan/engine/core'

/** A line that costs a holder but carries no pay: unpaid leave (or no pay in the month). */
export const isUnpaidLine = (l: PlanLine): boolean =>
  l.basis !== 'band' &&
  l.holderId != null &&
  l.holderId !== '' &&
  l.active > 0 &&
  Math.abs(l.local.base) < 1e-9 &&
  Math.abs(l.local.bonus) < 1e-9

/* ───────────── the Working version's line context, with every month read as paid ───────────── */

const NO_PLAN: object = {}

/** A cache keyed by two objects and a string. */
class Memo<V> {
  private readonly store = new WeakMap<object, WeakMap<object, Map<string, V>>>()
  get(a: object, b: object | null | undefined, key: string, make: () => V): V {
    let inner = this.store.get(a)
    if (!inner) {
      inner = new WeakMap()
      this.store.set(a, inner)
    }
    const bk = b ?? NO_PLAN
    let byKey = inner.get(bk)
    if (!byKey) {
      byKey = new Map()
      inner.set(bk, byKey)
    }
    if (byKey.has(key)) return byKey.get(key) as V
    const v = make()
    if (byKey.size > 32) byKey.clear()
    byKey.set(key, v)
    return v
  }
}

interface PaidPricer {
  ctx: LineContext
  /** The paid twins of a seat's month, by `<positionId>|<month>`. */
  months: Map<string, readonly PlanLine[]>
}

const pricerMemo = new Memo<PaidPricer | null>()

/**
 * The fiscal year's Working version's line context with leave read as paid (`unpaidLeave` false).
 * With `every`, it costs every HRIS assignment, also those starting after the as-of date
 * (`futureAssignments`, as the forecast reads them, D-PREHIRE).
 */
function paidPricer(ctx: AnalyticsContext, v: AnyVersion, every: boolean): PaidPricer | null {
  if (v.state !== 'working') return null
  return pricerMemo.get(ctx.all, ctx.plan, `${v.versionId}|${ctx.asOf}|${every}`, () => {
    const rows = assumptionRowsOf(ctx.all, v)
    const base = lineContext({
      version: v,
      asOf: ctx.asOf,
      positions: ctx.all.positions,
      workers: ctx.all.workers,
      comp: ctx.all.comp,
      reqs: ctx.all.reqs,
      requests: requestsOf(ctx),
      assumptions: rows,
      rates: { table: fxRatesFromAssumptions(rows), use: 'plan', closedThrough: null },
      closes: ctx.plan?.closes ?? [],
      ...(every ? { futureAssignments: true } : {}),
    })
    // Every month paid: the twin never reads a leave flag or a close's stored leave.
    const paid: LineContext = { ...base, unpaidLeave: () => false }
    return { ctx: paid, months: new Map() }
  })
}

/** The holder's costed line of the seat's month in a pricer, or null. */
function twinIn(pricer: PaidPricer, l: PlanLine): PlanLine | null {
  const key = `${l.positionId}|${l.month}`
  let lines = pricer.months.get(key)
  if (!lines) {
    const rows = pricer.ctx.rowsOf(l.positionId)
    lines = rows.length ? monthLine(toPosition(rows[0]), l.month as Month, pricer.ctx) : []
    if (pricer.months.size > 4_096) pricer.months.clear()
    pricer.months.set(key, lines)
  }
  return lines.find((x) => x.holderId === l.holderId && x.basis !== 'band' && x.active > 0) ?? null
}

/** The Working version of a line's fiscal year (the line's own version when it is a Working one). */
function workingFor(ctx: AnalyticsContext, l: PlanLine): AnyVersion | null {
  const own = ctx.versions.find((x) => x.versionId === l.versionId)
  if (own?.state === 'working') return own
  return workingOf(ctx.versions, own?.fiscalYear ?? fiscalYearOf(l.month))
}

/**
 * A line on unpaid leave as the Working version prices it paid: the same seat, month and holder
 * (see the module comment), or null when the Working version has no such line, even with every HRIS
 * assignment costed.
 */
export function paidLineOf(ctx: AnalyticsContext, l: PlanLine): PlanLine | null {
  const v = workingFor(ctx, l)
  if (!v || !l.positionId) return null
  const own = paidPricer(ctx, v, false)
  if (!own) return null
  const twin = twinIn(own, l)
  if (twin) return twin
  // A person hired after the as-of date, priced from HRIS on the forecast's lines (M2 close-out).
  const every = paidPricer(ctx, v, true)
  return every ? twinIn(every, l) : null
}

/* ───────────── cap sides ───────────── */

const lookupMemo = new WeakMap<object, Map<string, AssumptionLookup>>()

/** A version's assumption lookup (memoized per loaded data and version). */
function lookupOf(ctx: AnalyticsContext, v: AnyVersion): AssumptionLookup {
  let byVersion = lookupMemo.get(ctx.all)
  if (!byVersion) {
    byVersion = new Map()
    lookupMemo.set(ctx.all, byVersion)
  }
  const key = `${v.versionId}|${v.hash ?? ''}`
  let hit = byVersion.get(key)
  if (!hit) {
    hit = assumptionLookup(assumptionRowsOf(ctx.all, v), v)
    byVersion.set(key, hit)
  }
  return hit
}

const sidesMemo = new Memo<(l: PlanLine) => readonly CapSide[] | null>()

/**
 * Each costed line's capped burden components and its side of each cap (see the module comment), for
 * `componentGate`. Memoized per line; a line with no capped component gives [].
 */
export function capSidesOf(ctx: AnalyticsContext): (l: PlanLine) => readonly CapSide[] | null {
  return sidesMemo.get(ctx.all, ctx.plan, ctx.asOf, () => {
    const cache = new WeakMap<PlanLine, readonly CapSide[] | null>()
    const seatOf = costSeatOf(ctx)
    const versionOf = (l: PlanLine): AnyVersion | null =>
      ctx.versions.find((x) => x.versionId === l.versionId) ?? workingFor(ctx, l)
    return (l) => {
      if (cache.has(l)) return cache.get(l) ?? null
      let out: readonly CapSide[] | null = []
      const seat = l.positionId ? seatOf(l.positionId) : null
      const v = versionOf(l)
      if (seat && v) {
        const org = { businessUnit: seat.businessUnit, department: seat.department }
        const capped = burdenComponents(seat.country, org, lookupOf(ctx, v)).filter((c) => c.cap != null)
        if (capped.length) {
          const priced = isUnpaidLine(l) ? paidLineOf(ctx, l) : l
          const sides: CapSide[] = []
          for (const c of capped) {
            const key = `${seat.country}|${c.component}`
            if (!priced) {
              // No paid twin: both sides, so the split never hides for a leave (see the module comment).
              sides.push({ key, below: true }, { key, below: false })
              continue
            }
            const annual = ((priced.local.base + priced.local.bonus) * 12) / priced.active
            sides.push({ key, below: annual < (c.cap as number) })
          }
          out = sides
        }
      }
      cache.set(l, out)
      return out
    }
  })
}
