/**
 * The Forecast view's model (docs/PLAN.md 6.7, 6.8, 9.4): year-end heads and full-year cost, starts
 * and exits by month, variance by org, measure and window, and the bridge from the comparison to the
 * forecast, every amount and difference through the cost guard (src/cost/guard.ts and
 * differences.ts, `ctx.guard`). With a target comparison, variance and the bridge are empty states
 * (9.2). One model per analytics context (`forecastModel`, cached in a WeakMap).
 *
 * Other views read it: the HRBP home re-links Overview's year-end heads (vs target) and full-year
 * cost and draws `overview.headsByMonth` (`home-unit-forecast`); the Leader home re-links the year-end
 * heads tile and `overview.costVsTarget`; the Finance home re-links `bridge.fxEffectYtd`, draws
 * `bridge.steps` (`home-fin-bridge`) and
 * the unit × cost × FY rows of `variance.rows` (`home-fin-cost-unit`, and its My list of units by
 * cost variance).
 *
 * Frozen in the M2 freeze (docs/CONTRACTS-M2.md). The interfaces list what other builders read; the
 * views-1 builder may add fields, never rename or retype these.
 */
import type { WaterfallStep } from '@/charts/types'
import type { Kpi } from '@/components/types'
import type { AnalyticsContext } from '@/data/context'
import type { Month } from '@/data/schema'
import type { CalcSource } from '@/drill/calc'
import type { DrillSource } from '@/drill/types'
import { fmt } from '@/lib/format'
import type { FigureData, Headline, OverviewModel, TabModel } from '../../types'
import { ID } from '../metrics'
import { prepare } from './base'
import { forecastFindings } from './findings'
import { bridgeKpis, costVsTargetTile, fxYtdTile, overviewKpis, varianceKpis, yearEndHeads } from './kpis'
import { FIGURE } from './lineage'
import { bridgeFigure, headsByMonthFigure, startsExitsFigure, varianceFigure } from './overview'

/* ───────────── rows ───────────── */

/** Heads by month: closed actuals, then the projection to the horizon, against the comparison. */
export interface ForecastMonthRow {
  month: Month
  label: string
  /** Actual heads at a closed month-end; null for open months. */
  actual: number | null
  /** Forecast heads at the month-end (probability-weighted, so fractional); null for closed months. */
  forecast: number | null
  /** The comparison version's plan heads; null for a target comparison. */
  comparison: number | null
}

/** Starts and exits by month (heads, never cost). */
export interface StartsExitsRow {
  month: Month
  label: string
  /** Probability-weighted expected starts. */
  starts: number
  knownExits: number
  modeledExits: number
  modeledBackfills: number
}

/** The variance table's org levels and windows (9.4). */
export type VarianceOrgLevel = 'company' | 'unit' | 'department' | 'subOrg'
export type VarianceMeasure = 'heads' | 'fte' | 'cost'
export type VarianceWindow = 'month' | 'qtd' | 'ytd' | 'fy'

/**
 * One cell of Forecast > Variance: an org × measure × window. Positive cost is over. A cost cell's
 * values are guarded (rounded modes show QTD, YTD and FY only, as unions of atoms; the variance is a
 * difference under 7.2 rule 5); null where hidden, with the reason.
 */
export interface VarianceRow {
  orgKey: string
  org: string
  level: VarianceOrgLevel
  measure: VarianceMeasure
  window: VarianceWindow
  actual: number | null
  comparison: number | null
  variance: number | null
  reason: string | null
}

/**
 * One bar of the bridge (9.4: the comparison's total, the eight steps, Other changes, Rounding in
 * rounded modes when anything is left (nothing since C34: every costed part that does not show is in
 * Other changes), the forecast total). Each step opens its calculation card and its contributors.
 */
export interface BridgeStepRow extends WaterfallStep {
  /** Contributors to the step (7.2 rule 5); null for the start, end and Rounding bars. */
  contributors: number | null
  calc?: CalcSource
  drill?: DrillSource
}

/* ───────────── tabs ───────────── */

export interface ForecastOverview extends OverviewModel {
  headsByMonth: FigureData<ForecastMonthRow>
  startsExits: FigureData<StartsExitsRow>
  /**
   * The full-year cost forecast against the target cost (`forecast.cost.fullYear` vs
   * `targets.target.cost`, guarded; 7.2 rule 8 for the over-or-under tone), which the Leader home
   * re-links as "Cost vs target" (9.3); the strip's own tile compares with the comparison. Null where
   * the mode hides cost.
   */
  costVsTarget: Kpi | null
}

export interface ForecastVariance extends TabModel {
  rows: FigureData<VarianceRow>
}

export interface ForecastBridge extends TabModel {
  steps: FigureData<BridgeStepRow>
  /** The FX effect tile at period `ytd`, which the Finance home re-links (9.3, 9.4); null when hidden. */
  fxEffectYtd: Kpi | null
}

export interface ForecastModel {
  overview: ForecastOverview
  variance: ForecastVariance
  bridge: ForecastBridge
}

/** The Forecast view's model for a context (cached per context). */
export function forecastModel(ctx: AnalyticsContext): ForecastModel {
  let m = cache.get(ctx)
  if (!m) {
    m = computeForecast(ctx)
    cache.set(ctx, m)
  }
  return m
}

const cache = new WeakMap<AnalyticsContext, ForecastModel>()

/** Builds the model; `forecastModel` caches it per context. */
export function computeForecast(ctx: AnalyticsContext): ForecastModel {
  const p = prepare(ctx)
  return {
    overview: {
      kpis: overviewKpis(p),
      findings: forecastFindings(p),
      headsByMonth: headsByMonthFigure(p),
      startsExits: startsExitsFigure(p),
      costVsTarget: costVsTargetTile(p),
    },
    variance: {
      kpis: varianceKpis(p),
      rows: varianceFigure(p),
    },
    bridge: {
      kpis: bridgeKpis(p),
      steps: bridgeFigure(p),
      fxEffectYtd: fxYtdTile(p),
    },
  }
}

/** The folder tab's number: the year-end heads forecast (9.1). */
export function forecastHeadline(ctx: AnalyticsContext): Headline {
  const p = prepare(ctx)
  const y = yearEndHeads(p)
  return {
    value: fmt(y.value, 'num1'),
    label: 'year-end heads forecast',
    metricId: ID.headsYearEnd,
    uses: p.uses(FIGURE.yearEnd),
  }
}
