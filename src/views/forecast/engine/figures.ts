/**
 * Every figure id on the Forecast view (docs/PLAN.md 9.4), by tab. Ids start with `forecast-` (the
 * policy decides them by that prefix). Frozen in the M2 freeze: the builder may add ids with the
 * prefix, never rename these.
 */
export const FORECAST_FIGURES = {
  // Overview
  overviewKpis: 'forecast-overview-kpis',
  readout: 'forecast-readout',
  headsByMonth: 'forecast-heads-by-month',
  startsExits: 'forecast-starts-exits',
  // Variance
  varianceKpis: 'forecast-variance-kpis',
  variance: 'forecast-variance',
  // Bridge
  bridgeKpis: 'forecast-bridge-kpis',
  bridge: 'forecast-bridge',
} as const
export type ForecastFigureId = (typeof FORECAST_FIGURES)[keyof typeof FORECAST_FIGURES]
