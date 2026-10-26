/**
 * FX fixtures (docs/PLAN.md 6.4).
 *
 * X1: €120,000 in open months, plan 1.08, forecast 1.15: plan $129,600, forecast $138,000, FX effect
 * $8,400. The bridge's FX step must equal `fxEffect` on the same lines (bridge.test.ts BX2).
 * X2: Working plan EUR 1.10, Budget plan 1.08, forecast 1.15, €120,000 in open months. Against Budget,
 * `fxEffect` and the bridge's FX step are both $8,400. A build that reads Working's plan rate (1.10)
 * instead of Budget's stored rate, giving $6,000, is the negative control.
 */
import type { AssumptionRow, Month, PositionRow } from '@/data/schema'
import type { PlanLine } from '../../types'
import { assumption, FY27_MONTHS, FY27_OPEN_MONTHS, fxRates, positionRow } from './common'

/** A forecast line of €20,000 base in an open month at the forecast rate 1.15. */
function forecastLine(month: Month): PlanLine {
  return {
    positionId: 'P-X1',
    versionId: 'fy27-working',
    month,
    holderId: null,
    status: 'Filled',
    heads: 1,
    fte: 1,
    active: 1,
    currency: 'EUR',
    rate: 1.15,
    local: { base: 20_000, bonus: 0, burden: 0, benefits: 0, oneTime: 0, vacancy: 0 },
    usd: {
      base: 23_000,
      bonus: 0,
      burden: 0,
      benefits: 0,
      oneTime: 0,
      vacancy: 0,
      equity: 0,
      loaded: 23_000,
    },
    basis: 'band',
  }
}

/** €120,000 in the six open months of FY27 (October to March), at forecast 1.15. */
export const X_LINES: readonly PlanLine[] = FY27_OPEN_MONTHS.map(forecastLine)

/** A USD line adds nothing to the FX effect. */
export const X_USD_LINE: PlanLine = {
  ...forecastLine('2026-10'),
  positionId: 'P-X-USD',
  currency: 'USD',
  rate: 1,
  local: { base: 50_000, bonus: 0, burden: 0, benefits: 0, oneTime: 0, vacancy: 0 },
  usd: { base: 50_000, bonus: 0, burden: 0, benefits: 0, oneTime: 0, vacancy: 0, equity: 0, loaded: 50_000 },
}

/** The Budget's stored rates: EUR plan 1.08 in every FY27 month. */
export const BUDGET_RATES = fxRates('EUR', 'plan', FY27_MONTHS, 1.08)

/** Working's rates after an edit: EUR plan 1.10 (and the same forecast set). */
export const WORKING_RATES = [
  ...fxRates('EUR', 'plan', FY27_MONTHS, 1.1),
  ...fxRates('EUR', 'forecast', FY27_OPEN_MONTHS, 1.15),
]

export const X1 = {
  lines: X_LINES,
  comparisonRates: BUDGET_RATES,
  localTotal: 120_000,
  planUsd: 129_600,
  forecastUsd: 138_000,
  fxEffect: 8_400,
} as const

export const X2 = {
  lines: X_LINES,
  budgetRates: BUDGET_RATES,
  workingRates: WORKING_RATES,
  /** Against the Budget's stored plan rate. */
  fxEffect: 8_400,
  /** What a build that reads Working's plan rate would give. */
  negativeControl: 6_000,
} as const

export const RATE_OF = [
  { currency: 'EUR', set: 'plan', month: '2026-10', table: BUDGET_RATES, expected: 1.08 },
  { currency: 'USD', set: 'plan', month: '2026-10', table: BUDGET_RATES, expected: 1 },
  { currency: 'ILS', set: 'plan', month: '2026-10', table: BUDGET_RATES, expected: null },
  { currency: 'EUR', set: 'forecast', month: '2026-12', table: WORKING_RATES, expected: 1.15 },
] as const

/* ───────────── X2 end to end (bridge.test.ts) ───────────── */

/**
 * X2's seat as plan data: a Planned P4 Munich seat from 1 Oct 2026 whose band is €240,000 with no
 * bonus, burden or benefits, so it costs €20,000 a month in the open months (€120,000 in all). The
 * Budget locks its lines at plan 1.08 ($129,600); the forecast fills it on 1 Oct (no time to fill,
 * fill rate 1, no attrition) at forecast 1.15 ($138,000).
 */
export const X2_POSITIONS: readonly PositionRow[] = [
  positionRow('P-X2', {
    effectiveDate: '2026-04-01',
    status: 'Planned',
    level: 'P4',
    location: 'Munich',
    costCenter: '4110-MUC',
    startDate: '2026-10-01',
  }),
]

export const X2_ASSUMPTIONS: readonly AssumptionRow[] = [
  assumption('band', 'P4|Munich|FY27', 240_000),
  assumption('bonusTarget', 'P4', 0),
  assumption('bonusFunding', 'FY27', 1),
  assumption('benefits', 'Germany', 0),
  assumption('equity', 'P4', 0),
  assumption('timeToFill', 'P4', 0),
  assumption('fillRate', '*', 1),
  assumption('attrition', '*', 0),
]

/** Working's rates with a different plan rate (1.20): the forecast and the FX effect against Budget must not move. */
export const WORKING_RATES_EDITED = [
  ...fxRates('EUR', 'plan', FY27_MONTHS, 1.2),
  ...fxRates('EUR', 'forecast', FY27_OPEN_MONTHS, 1.15),
]
