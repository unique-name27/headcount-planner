/**
 * Forecast accuracy (docs/PLAN.md 6.9 and R14: the spec's `fin.forecastAccuracy` is
 * `forecast.accuracy.cost`, and `forecast.accuracy.heads` beside it; section 12 shows the cost one in
 * Finance; review SA-1, lead decision D-SPEC): 1 − |forecast − actual| ÷ actual over the months
 * closed since the fiscal year's latest reforecast locked. The forecast is the one the reforecast
 * stored at its lock (`LockedVersion.forecast`, a `ForecastTable`); the actual is what the year's
 * Working forecast reads for the same months, which are closed now (`ForecastMonth.closed`: the
 * closes, one-time items included, C32, and whatever posts into them, 6.6), so both sides come from
 * the one forecast engine and count the same people.
 *
 * Readings taken here (fix step, guard-crawl):
 *  - The reforecast is the latest locked reforecast of the fiscal year with a stored forecast and a
 *    month closed after its `closedThrough` (its last close when it ran). On the sample: FY27 Q1
 *    Reforecast (closed through Jun 2026) against Jul, Aug and Sep 2026.
 *  - Each side is summed over those months (cost: both guard parts, loaded; heads: at each
 *    month-end), then compared once: 1 − |Σ forecast − Σ actual| ÷ Σ actual.
 *  - The stored forecast is the company's, so the figure is the company's: it shows with no org
 *    filter and no scope (`isCompany`), else reads "—" with `ACCURACY_COMPANY_NOTE`. It is a ratio of
 *    two company totals, shown over 5 or more costed people in the window (guard class G, checked where
 *    the tile is built, ./versions.ts); rounded and Manager modes hide it by policy
 *    (src/access/policy/rounded.ts and manager.ts).
 *
 * The one engine Forecast > Variance (src/views/forecast/engine/kpis.ts `accuracyKpis`) and Finance >
 * Versions (./versions.ts) read. Its arithmetic is pure and lives with the other engines
 * (src/plan/engine/accuracy.ts `accuracyOf`, tested on a hand-computed fixture there); this module
 * picks the reforecast and the run from the context, which src/plan/engine never reads
 * (ARCHITECTURE.md dependency rules) (fix step, loose ends).
 */
import { peopleOf } from '@/cost/guard'
import type { AnalyticsContext } from '@/data/context'
import type { FiscalYear } from '@/data/schema'
import { type AccuracyResult, accuracyOf } from '@/plan/engine/accuracy'
import { isLocked } from '@/plan/engine/versions'
import type { ForecastTable, LockedVersion } from '@/plan/types'
import { membersIn } from '@/views/forecast/engine/members'
import { forecastRunOf } from '@/views/forecast/engine/run'
import { workingFor } from '@/views/plan/engine/core'
import { everyPosition } from './longCsv'

export type { AccuracyMonth, AccuracyResult } from '@/plan/engine/accuracy'

/** The result with the reforecast it reads. */
export interface ForecastAccuracy extends AccuracyResult {
  versionId: string
  versionName: string
  /** The company's costed people over the months (7.2 rule 1), for the guard's minimum. */
  costed: number
}

/** Why the figure reads "—" under a filter or a scope. */
export const ACCURACY_COMPANY_NOTE =
  "Forecast accuracy shows for the whole company: a reforecast stores the company's forecast."
/** Why there is no figure yet. */
export const NO_ACCURACY_TEXT = 'No month has closed since a reforecast locked.'

const memo = new WeakMap<AnalyticsContext, Map<FiscalYear, ForecastAccuracy | null>>()

/**
 * The fiscal year's forecast accuracy (see the module comment): the latest locked reforecast with a
 * stored forecast and a month closed since, against the year's Working forecast. Null with none.
 */
export function forecastAccuracyOf(ctx: AnalyticsContext, fiscalYear: FiscalYear): ForecastAccuracy | null {
  let byYear = memo.get(ctx)
  if (!byYear) {
    byYear = new Map()
    memo.set(ctx, byYear)
  }
  if (byYear.has(fiscalYear)) return byYear.get(fiscalYear) ?? null
  const out = build(ctx, fiscalYear)
  byYear.set(fiscalYear, out)
  return out
}

function build(ctx: AnalyticsContext, fiscalYear: FiscalYear): ForecastAccuracy | null {
  const reforecasts = ctx.versions
    .filter(
      (v): v is LockedVersion =>
        v.fiscalYear === fiscalYear && v.kind === 'reforecast' && isLocked(v) && !!v.forecast,
    )
    .sort((a, b) => (b.lockedAt ?? '').localeCompare(a.lockedAt ?? ''))
  if (!reforecasts.length) return null
  const working = workingFor(ctx, reforecasts[0])
  const run = working ? forecastRunOf(ctx, working) : null
  if (!run) return null
  for (const v of reforecasts) {
    const r = accuracyOf(v.forecast as ForecastTable, run.detail.months)
    if (!r) continue
    const members = membersIn(
      ctx,
      run.lines,
      r.months.map((m) => m.month),
      everyPosition(ctx),
    )
    return { ...r, versionId: v.versionId, versionName: v.name, costed: peopleOf(members).size }
  }
  return null
}
