/**
 * The forecast the Forecast view reads (docs/PLAN.md 6.7): the shown fiscal year's Working version
 * forecast at the as-of date, over every position (src/plan/engine/forecast.ts `forecastDetail`),
 * computed once per data, plan state and dictionary, then read per scope.
 *
 * The engine keeps a unit's modeled exits and backfills on cohort lines (one a unit, currency, part
 * and month). A scope that cuts a unit (a leader's org, a department, a level) and the cost guard's
 * atoms need them by seat, so each cohort line is spread over the seats it came from
 * (`cohortParts`): each seat takes its own part of the line, every field, so the seats' parts add up
 * to the line and a whole unit reads the engine's own figures.
 *
 * Readings taken here (views-1 builder, M2):
 *  - The forecast is the Working version's of the shown version's fiscal year, whatever version is
 *    shown (a locked version stores its lines, not a forecast at today's as-of date). The figures say
 *    so in their subtitles.
 *  - A seat's part of a line is what the seat added to it (`cohortParts`: the HRIS cohort's modeled
 *    exits of its holder at the unit's average cost, the band cohort's backfills less exits at the
 *    seat's own band), never a share of the line's mix of seats. So each part, and every cost center
 *    or org total of parts, moves in a straight line with each FX, burden, benefits and equity value
 *    (7.4(b)), as the line does. (Integration fix, M2: a weight of the line's loaded cost mixed one
 *    seat's band loads into another's components and bent cost-center totals.)
 *  - A spread line keeps the cohort's part (basis 'hris' for HRIS-cohort exits, the filled part;
 *    'band' for backfills less band-cohort exits, the band part), brings no costed person (no holder)
 *    and is marked with its cohort, so the bridge can regroup a scope's parts into cohort seats.
 *  - Openings a freeze holds through the horizon count 1 each in "Unfilled at horizon": the scope's
 *    openings on the as-of date that the forecast does not start (no expected start) and that a
 *    freeze covers then.
 */
import type { AnalyticsContext } from '@/data/context'
import { monthRange } from '@/data/fiscal'
import type { Month } from '@/data/schema'
import { requestsOf } from '@/drill/seats'
import {
  actualThroughOf,
  type CohortPart,
  type CohortTag,
  cohortLineId,
  type ExpectedStart,
  type ForecastDetail,
  type ForecastInput,
  forecastDetail,
  isCohortLine,
  type SeatCohortMonth,
  withAdjustments,
} from '@/plan/engine/forecast'
import { isLocked } from '@/plan/engine/versions'
import type { AnyVersion, PlanLine } from '@/plan/types'
import { assumptionRowsOf, inTreeOf, Memo, ratesOf, workingFor } from '@/views/plan/engine/core'

/** A cohort line's part on one seat. */
export interface SpreadLine extends PlanLine {
  /** The cohort line it is a part of. */
  spreadOf: CohortTag
  /** The seat's share of the line's loaded cost (for reading only; the part's own fields are its amounts). */
  weight: number
}

export const isSpreadLine = (l: PlanLine): l is SpreadLine => (l as Partial<SpreadLine>).spreadOf != null

/** The forecast of a fiscal year, read per seat. */
export interface ForecastRun {
  /** The Working version whose forecast it is. */
  version: AnyVersion
  detail: ForecastDetail
  /** The grid's months, in order. */
  months: readonly Month[]
  /** The last month read from closes (or HRIS actuals); the projection starts the month after. */
  actualThrough: Month
  /** Every line by seat: actual months' lines, seat and opening lines, and the cohort lines spread over seats. */
  lines: readonly PlanLine[]
  /** Cohort lines no seat could take (left out of every scope, counted). */
  unplaced: readonly PlanLine[]
  /** Expected starts by position. */
  starts: ReadonlyMap<string, readonly ExpectedStart[]>
  /** Modeled exits and backfills by position and month. */
  cohorts: ReadonlyMap<string, readonly SeatCohortMonth[]>
}

const runMemo = new Memo<ForecastRun | null>()

/**
 * Runs with seats in a cohort of their own (`ForecastRunOptions.ownCohort`), kept apart from the
 * shared runs and few at a time: each is a full run (tens of MB), one per Manager scope, so a page or
 * a crawl over many copies of the data keeps only the last `OWN_RUNS` (least recently used out).
 */
const OWN_RUNS = 4
const ownRuns = new Map<string, ForecastRun | null>()
const objectIds = new WeakMap<object, number>()
let nextObjectId = 1
/** A number for an object's identity (0 for none), never reused. */
function idOf(o: object | null | undefined): number {
  if (!o) return 0
  let id = objectIds.get(o)
  if (id === undefined) {
    id = nextObjectId++
    objectIds.set(o, id)
  }
  return id
}

/** How a run is made beyond the context and the version. */
export interface ForecastRunOptions {
  /**
   * Seats netted in a cohort of their own (src/plan/engine/forecast.ts `ForecastInput.ownCohort`):
   * Plan > Hiring's Manager scope (review HP-1). One run per data, plan state and seat set.
   */
  ownCohort?: ReadonlySet<string> | null
}

/** A stable key of a seat set: its sorted IDs. */
const setKey = (ids: ReadonlySet<string>): string => [...ids].sort().join(',')

/** The forecast for the shown version's fiscal year (see the module comment); null with no Working version. */
export function forecastRunOf(
  ctx: AnalyticsContext,
  shown: AnyVersion | null = ctx.version,
  opts: ForecastRunOptions = {},
): ForecastRun | null {
  const v = workingFor(ctx, shown)
  if (!v || isLocked(v) || v.state !== 'working') return null
  const key = `${v.versionId}|${ctx.asOf}|${ctx.guard.rules.minCosted}`
  const own = opts.ownCohort?.size ? opts.ownCohort : null
  if (own) {
    const ownKey = `${idOf(ctx.all)}|${idOf(ctx.plan)}|${key}|own:${setKey(own)}`
    if (ownRuns.has(ownKey)) {
      const hit = ownRuns.get(ownKey) ?? null
      ownRuns.delete(ownKey)
      ownRuns.set(ownKey, hit)
      return hit
    }
    const run = buildRun(ctx, v, own)
    ownRuns.set(ownKey, run)
    while (ownRuns.size > OWN_RUNS) {
      const oldest = ownRuns.keys().next().value
      if (oldest === undefined) break
      ownRuns.delete(oldest)
    }
    return run
  }
  return runMemo.get(ctx.all, ctx.plan, key, () => buildRun(ctx, v, null))
}

const inputMemo = new WeakMap<ForecastRun, ForecastInput>()

/** What a run's forecast was computed from (./paidTwins.ts prices the same inputs with leave paid). */
export function runInputOf(run: ForecastRun): ForecastInput {
  const hit = inputMemo.get(run)
  if (!hit) throw new Error('A forecast run made outside forecastRunOf has no inputs.')
  return hit
}

function buildRun(ctx: AnalyticsContext, v: AnyVersion, ownCohort: ReadonlySet<string> | null): ForecastRun {
  const all = ctx.all
  const closes = ctx.plan?.closes ?? []
  const rows = assumptionRowsOf(all, v)
  const input: ForecastInput = {
    version: v,
    asOf: ctx.asOf,
    closes,
    positions: all.positions,
    workers: all.workers,
    comp: all.comp,
    reqs: all.reqs,
    requests: requestsOf(ctx),
    freezes: all.freezes,
    assumptions: rows,
    rates: ratesOf(all, v),
    inTree: inTreeOf(ctx),
    minCosted: ctx.guard.rules.minCosted,
    ...(ownCohort ? { ownCohort } : {}),
  }
  // Back-dated adjustments post in their month, so the forecast, Variance and the bridge's timing step
  // read them (docs/PLAN.md 6.6, the spec's "post as adjustments in the first open month"; SA-2).
  const detail = withAdjustments(forecastDetail(input), ctx.plan?.adjustments ?? [])
  const months = monthRange(v.grid.from, v.grid.to)
  // Only closed months are actual (R46): the engine's own rule, so the run and the engine agree.
  const actualThrough = actualThroughOf(closes, ctx.asOf)

  const starts = new Map<string, ExpectedStart[]>()
  for (const s of detail.expectedStarts) {
    const list = starts.get(s.positionId)
    if (list) list.push(s)
    else starts.set(s.positionId, [s])
  }
  const cohorts = new Map<string, SeatCohortMonth[]>()
  for (const c of detail.seatCohorts) {
    const list = cohorts.get(c.positionId)
    if (list) list.push(c)
    else cohorts.set(c.positionId, [c])
  }

  // Each cohort line's seats, with their own parts of it (sorted by position).
  const partsOf = new Map<string, CohortPart[]>()
  for (const c of detail.cohortParts) {
    const list = partsOf.get(c.lineId)
    if (list) list.push(c)
    else partsOf.set(c.lineId, [c])
  }

  const lines: PlanLine[] = []
  const unplaced: PlanLine[] = []
  for (const l of detail.lines) {
    if (!isCohortLine(l)) {
      if (l.positionId) lines.push(l)
      continue
    }
    const tag = l.cohort
    const parts = partsOf.get(cohortLineId(l)) ?? []
    if (!parts.length) {
      unplaced.push(l)
      continue
    }
    const total = l.usd.loaded
    for (const c of parts) {
      const spread: SpreadLine = {
        positionId: c.positionId,
        versionId: l.versionId,
        month: l.month,
        holderId: null,
        status: l.status,
        heads: c.heads,
        fte: c.fte,
        active: l.active,
        currency: l.currency,
        rate: l.rate,
        local: { ...c.local },
        usd: { ...c.usd },
        basis: l.basis,
        spreadOf: tag,
        weight: total ? c.usd.loaded / total : 1 / parts.length,
      }
      lines.push(spread)
    }
  }
  const run: ForecastRun = { version: v, detail, months, actualThrough, lines, unplaced, starts, cohorts }
  inputMemo.set(run, input)
  return run
}

/** The months of a run that are projected (after the actuals). */
export const projectedMonths = (run: ForecastRun): Month[] => run.months.filter((m) => m > run.actualThrough)
