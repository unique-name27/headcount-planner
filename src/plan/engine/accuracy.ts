/**
 * Forecast accuracy's arithmetic (docs/PLAN.md 6.9 and R14: the spec's `fin.forecastAccuracy` is
 * `forecast.accuracy.cost`, and `forecast.accuracy.heads` beside it; review SA-1, lead decision
 * D-SPEC): 1 − |forecast − actual| ÷ actual over the months closed since a reforecast locked. Pure:
 * a reforecast's stored forecast (`LockedVersion.forecast`, a `ForecastTable`) against the months a
 * forecast run reads now (`ForecastMonth.closed`: the closes, one-time items included, C32, and
 * whatever posts into them, 6.6).
 *
 * The one engine both views read (fix step, loose ends): Forecast > Variance's two tiles and
 * Finance > Versions' cost tile take their figure from src/views/forecast/engine/accuracy.ts
 * `forecastAccuracyOf`, which picks the reforecast and the run from the context and hands them to
 * `accuracyOf` here.
 *
 * Readings (fix step, guard-crawl): each side is summed over the months (cost: both guard parts,
 * loaded, 7.2 rule 3; heads: at each month-end), then compared once:
 * 1 − |Σ forecast − Σ actual| ÷ Σ actual.
 */
import type { Month } from '@/data/schema'
import type { ForecastMonth, ForecastTable } from '../types'

/** One month of the comparison. */
export interface AccuracyMonth {
  month: Month
  forecastUsd: number
  actualUsd: number
  forecastHeads: number
  actualHeads: number
}

/** The comparison over the months closed since a reforecast locked. */
export interface AccuracyResult {
  months: readonly AccuracyMonth[]
  forecastUsd: number
  actualUsd: number
  /** 1 − |forecast − actual| ÷ actual; null when the actual is 0. */
  cost: number | null
  forecastHeads: number
  actualHeads: number
  heads: number | null
}

/** A month's loaded cost, both guard parts (7.2 rule 3). */
const loadedOf = (m: ForecastMonth): number => m.cost.filled.loaded + m.cost.band.loaded

/** 1 − |forecast − actual| ÷ actual; null when the actual rounds to 0 cents. */
export const accuracyRatio = (forecast: number, actual: number): number | null =>
  Math.abs(actual) < 0.005 ? null : 1 - Math.abs(forecast - actual) / Math.abs(actual)

/**
 * The comparison of a stored forecast with the actual months given: every actual month that is
 * closed, after the stored forecast's `closedThrough` and in its months. Null when there is none.
 */
export function accuracyOf(stored: ForecastTable, actual: readonly ForecastMonth[]): AccuracyResult | null {
  const forecastBy = new Map(stored.months.map((m) => [m.month, m]))
  const after = stored.closedThrough ?? ''
  const months: AccuracyMonth[] = []
  for (const a of actual) {
    if (!a.closed || a.month <= after) continue
    const f = forecastBy.get(a.month)
    if (!f || f.closed) continue
    months.push({
      month: a.month,
      forecastUsd: loadedOf(f),
      actualUsd: loadedOf(a),
      forecastHeads: f.heads,
      actualHeads: a.heads,
    })
  }
  if (!months.length) return null
  months.sort((x, y) => x.month.localeCompare(y.month))
  const sum = (k: keyof Omit<AccuracyMonth, 'month'>) => months.reduce((s, m) => s + m[k], 0)
  const forecastUsd = sum('forecastUsd')
  const actualUsd = sum('actualUsd')
  const forecastHeads = sum('forecastHeads')
  const actualHeads = sum('actualHeads')
  return {
    months,
    forecastUsd,
    actualUsd,
    cost: accuracyRatio(forecastUsd, actualUsd),
    forecastHeads,
    actualHeads,
    heads: accuracyRatio(forecastHeads, actualHeads),
  }
}
