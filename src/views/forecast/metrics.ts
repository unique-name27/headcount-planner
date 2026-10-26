/**
 * The Forecast view's metric ids (docs/PLAN.md 12): every id whose home view is `forecast`,
 * in the plan's order. Frozen in M1: names and ids never change. The metrics builder fills `metrics`
 * with one MetricDef per id (wording, formula, population, window, unit, uses and settings), and the
 * view's engine reads ids and settings from here, never as string literals.
 *
 * The catalog imports this file, so it stays plain data: never React, '@/data/context',
 * '@/data/store', the '@/metrics' barrel, '@/metrics/catalog', '@/metrics/api' or '@/metrics/testing'.
 */
import { defineMetrics } from '@/metrics/define'
import { F, LOADED_COST, PLAN_LINE, uses } from '@/metrics/fields'
import { RULE_ID } from '@/metrics/rules'
import type { MetricDef } from '@/metrics/types'
import { OWNER, POPULATION, SHOWN_IN_FINANCE, WINDOW } from '@/metrics/wording'

/** Every metric id the view registers, by role. */
export const ID = {
  headsMonthEnd: 'forecast.heads.monthEnd',
  headsYearEnd: 'forecast.heads.yearEnd',
  fteAverage: 'forecast.fte.average',
  startsExpected: 'forecast.starts.expected',
  startsUnfilled: 'forecast.starts.unfilled',
  exitsRate: 'forecast.exits.rate',
  exitsKnown: 'forecast.exits.known',
  exitsModeled: 'forecast.exits.modeled',
  backfillsModeled: 'forecast.backfills.modeled',
  costFullYear: 'forecast.cost.fullYear',
  costExitRunRate: 'forecast.cost.exitRunRate',
  accuracyCost: 'forecast.accuracy.cost',
  accuracyHeads: 'forecast.accuracy.heads',
  varianceHeads: 'forecast.variance.heads',
  varianceFte: 'forecast.variance.fte',
  varianceCost: 'forecast.variance.cost',
  bridgeStep: 'forecast.bridge.step',
  fxEffect: 'forecast.fx.effect',
} as const

export type ForecastMetricId = (typeof ID)[keyof typeof ID]

/** A cost amount under the full guard. */
const GUARDED = [RULE_ID.minCosted, RULE_ID.floorUsd]
/** A displayed cost difference: the full guard and 5 or more contributors. */
const DIFFERENCE = [...GUARDED, RULE_ID.minContributors]
/**
 * What the forecast reads: plan lines, accepted offers, freezes and the forecast drivers (fill
 * rate, time to fill, attrition, backfill rate and lag), which are assumptions data locked with
 * each version, never metric settings (docs/PLAN.md 12).
 */
const FORECAST = uses(PLAN_LINE, F.opened, F.offer, F.freeze, F.tree, F.seatOrg, F.request, F.assumptions)
const FORECAST_COST = uses(FORECAST, LOADED_COST)
/** A comparison with a locked version: its stored lines, read beside the forecast. */
const VS = 'A version comparison only: with a target comparison, it shows "A target has no monthly plan."'

/** The view's dictionary entries, one per id in `ID`, in the same order. */
export const metrics: MetricDef[] = defineMetrics('forecast', [
  /* ───────── heads ───────── */
  {
    id: ID.headsMonthEnd,
    name: 'Heads at month-end',
    definition:
      'Forecast heads at each month-end: closed months from their month close, open months projected from expected starts, known and modeled exits and modeled backfills.',
    formula: 'heads at the month’s start + expected starts − known exits − modeled exits + modeled backfills',
    population: POPULATION.positions,
    window: WINDOW.grid,
    unit: 'num1',
    goodDirection: null,
    uses: FORECAST,
    owner: OWNER.finance,
  },
  {
    id: ID.headsYearEnd,
    name: 'Year-end heads forecast',
    views: ['home', 'targets'],
    definition:
      'Forecast heads on the fiscal year’s last day: actual heads at the last close, plus expected starts, minus known and modeled exits, plus modeled backfills to the year end. Starts and exits are probability-weighted, so it can hold a fraction.',
    formula: 'heads at the fiscal year’s last month-end in the forecast',
    population: POPULATION.positions,
    window: WINDOW.yearEnd,
    unit: 'num1',
    goodDirection: null,
    uses: FORECAST,
    owner: OWNER.finance,
  },
  {
    id: ID.fteAverage,
    name: 'Forecast average FTE',
    definition:
      'Average FTE over the window: closed months as measured day by day, open months from the forecast’s starts and exits at each seat’s FTE.',
    formula: 'Σ over days of forecast FTE ÷ days in the window',
    population: POPULATION.positions,
    window: WINDOW.period,
    unit: 'num1',
    goodDirection: null,
    uses: uses(FORECAST, F.workerFte, F.seatType),
    owner: OWNER.finance,
  },
  /* ───────── starts ───────── */
  {
    id: ID.startsExpected,
    name: 'Expected starts',
    definition:
      'Starts the forecast expects in the window. An Open seat starts after its time to fill counted from when it opened, a Planned seat at its planned start or after its time to fill, whichever is later, each with a probability equal to the fill rate. Accepted offers start for certain on their agreed date. On hold seats never start, and a freeze holds openings while it lasts.',
    formula:
      'Σ fill rate over Open and Planned seats starting in the window + accepted offers starting in it',
    population: 'Open and Planned employee seats in scope, and accepted offers.',
    window: WINDOW.period,
    unit: 'num1',
    goodDirection: null,
    uses: FORECAST,
    owner: OWNER.finance,
  },
  {
    id: ID.startsUnfilled,
    name: 'Unfilled at horizon',
    definition:
      'The part of each opening the forecast does not expect to fill by the end of the grid: what is left after the fill rate.',
    formula: 'Σ (1 − fill rate) over Open and Planned seats',
    population: 'Open and Planned employee seats in scope with no accepted offer.',
    window: 'To the end of the shown version’s grid.',
    unit: 'num1',
    goodDirection: 'down',
    uses: FORECAST,
    owner: OWNER.finance,
  },
  /* ───────── exits and backfills ───────── */
  {
    id: ID.exitsRate,
    name: 'Monthly attrition rate',
    definition:
      'The monthly exit rate the forecast applies, from the annual attrition rate in the version’s assumptions (the org’s, else its unit’s, else the company’s).',
    formula: '1 − (1 − annual attrition)^(1/12)',
    population: 'The org’s attrition assumption.',
    window: 'Each open month of the forecast.',
    unit: 'pct2',
    goodDirection: 'down',
    uses: uses(F.assumptions),
    owner: OWNER.finance,
  },
  {
    id: ID.exitsKnown,
    name: 'Known exits',
    definition:
      'Employees whose last day, already in the HRIS, falls in the window. The forecast never predicts a named exit.',
    formula: 'employees with a last day in the window',
    population: POPULATION.employees,
    window: WINDOW.period,
    unit: 'int',
    goodDirection: null,
    uses: uses(F.assignment),
    owner: OWNER.finance,
  },
  {
    id: ID.exitsModeled,
    name: 'Modeled exits',
    definition:
      'Exits the forecast expects beyond the known ones. People in Filled seats and accepted offers exit at the monthly rate, less the known exits that month. Probability-weighted starts and backfills exit at the monthly rate from the month after they start.',
    formula:
      'max(0, HRIS cohort heads × monthly rate − known exits) + band cohort heads × monthly rate, month by month',
    population:
      'The HRIS cohort (people in Filled seats at the as-of date and accepted offers from their start) and the band cohort (expected starts and modeled backfills).',
    window: WINDOW.period,
    unit: 'num2',
    goodDirection: null,
    uses: FORECAST,
    owner: OWNER.finance,
  },
  {
    id: ID.backfillsModeled,
    name: 'Modeled backfills',
    definition:
      'Modeled exits refilled at the backfill rate after the backfill lag, reopening the same seat, never an eliminated one. None while a freeze holds the org.',
    formula: 'modeled exits × backfill rate, moved later by the lag in months',
    population: 'Seats left by modeled exits.',
    window: WINDOW.period,
    unit: 'num2',
    goodDirection: null,
    uses: FORECAST,
    owner: OWNER.finance,
  },
  /* ───────── cost ───────── */
  {
    id: ID.costFullYear,
    name: 'Full-year cost forecast',
    views: ['home', 'targets'],
    definition:
      'Loaded cost for the fiscal year: closed months from their month close (HRIS estimate), open months projected. Filled seats cost at HRIS pay and accepted offers at the offer; expected starts, the band cohort’s exits and backfills cost at band estimate, kept as a separate band part.',
    formula: 'Σ closed-month actual loaded cost + Σ open-month forecast loaded cost',
    population: POPULATION.costed,
    window: WINDOW.fiscalYear,
    unit: 'money',
    goodDirection: null,
    uses: FORECAST_COST,
    dependsOn: GUARDED,
    owner: OWNER.finance,
  },
  {
    id: ID.costExitRunRate,
    name: 'Exit run rate',
    views: ['targets', 'home'],
    definition: `The fiscal year’s last month of recurring loaded cost, a year’s worth: one-time items are left out. ${SHOWN_IN_FINANCE}`,
    formula: '(loaded cost − one-time items) of the fiscal year’s last month × 12',
    population: POPULATION.costed,
    window: 'The last month of the shown fiscal year.',
    unit: 'money',
    goodDirection: null,
    uses: FORECAST_COST,
    dependsOn: GUARDED,
    owner: OWNER.finance,
  },
  /* ───────── accuracy ───────── */
  {
    id: ID.accuracyCost,
    name: 'Forecast accuracy (cost)',
    views: ['finance'],
    definition:
      'How close the forecast stored with a reforecast came to actual loaded cost, over the months closed since that reforecast locked.',
    formula: '1 − |forecast − actual| ÷ actual',
    population: POPULATION.costed,
    window: 'The months closed since the reforecast locked.',
    unit: 'pct',
    goodDirection: 'up',
    uses: FORECAST_COST,
    dependsOn: GUARDED,
    owner: OWNER.finance,
  },
  {
    id: ID.accuracyHeads,
    name: 'Forecast accuracy (heads)',
    definition:
      'How close the forecast stored with a reforecast came to actual heads at each month-end closed since that reforecast locked.',
    formula: '1 − |forecast heads − actual heads| ÷ actual heads',
    population: POPULATION.positions,
    window: 'The month-ends closed since the reforecast locked.',
    unit: 'pct',
    goodDirection: 'up',
    uses: FORECAST,
    owner: OWNER.finance,
  },
  /* ───────── variance ───────── */
  {
    id: ID.varianceHeads,
    name: 'Heads variance',
    views: ['home'],
    definition: `Actual heads for closed months, or forecast heads for open ones, minus the comparison version’s plan heads at the month-end. ${VS}`,
    formula: 'actual or forecast heads − comparison plan heads',
    population: POPULATION.positions,
    window: WINDOW.comparison,
    unit: 'num1',
    goodDirection: null,
    uses: FORECAST,
    owner: OWNER.finance,
  },
  {
    id: ID.varianceFte,
    name: 'FTE variance',
    definition: `Actual or forecast average FTE minus the comparison version’s average FTE over the window. ${VS}`,
    formula: 'actual or forecast average FTE − comparison average FTE',
    population: POPULATION.positions,
    window: WINDOW.comparison,
    unit: 'num1',
    goodDirection: null,
    uses: uses(FORECAST, F.workerFte, F.seatType),
    owner: OWNER.finance,
  },
  {
    id: ID.varianceCost,
    name: 'Cost variance',
    views: ['home'],
    definition: `Actual loaded cost for closed months, or forecast loaded cost for open ones, minus the comparison version’s over the window. Positive is over the comparison. ${VS}`,
    formula: 'actual or forecast loaded cost − comparison loaded cost',
    population: `${POPULATION.costed} The difference also needs 5 or more contributors.`,
    window: WINDOW.costComparison,
    unit: 'money',
    goodDirection: 'down',
    uses: FORECAST_COST,
    dependsOn: DIFFERENCE,
    owner: OWNER.finance,
  },
  {
    id: ID.bridgeStep,
    name: 'Bridge step',
    views: ['home'],
    definition: `One step from the comparison total to the forecast total, changing one driver at a time in a fixed order: timing, position changes, attrition, mix, pay rate, assumption rates, transfers and FX. Steps one to seven are priced at the comparison’s plan rates; the FX step swaps in actual and forecast rates. ${VS}`,
    formula: 'total after the step − total before it; the steps add up to forecast − comparison',
    // HR admin with pay amounts shown folds nothing (7.5, M4 review SA-4).
    population: `${POPULATION.costed} A step's costed part folds into "Other changes" in every scope when fewer than 5 positions moved in it in any unit (any team in HRBP and Leader mode); Open and Planned seats at band estimate stay on its row. In HR admin mode with pay amounts shown nothing folds: every step keeps its own row. Transfers reads 0, because moved seats carry their plan with them.`,
    window: WINDOW.costComparison,
    unit: 'money',
    goodDirection: null,
    uses: FORECAST_COST,
    dependsOn: DIFFERENCE,
    owner: OWNER.finance,
  },
  {
    id: ID.fxEffect,
    name: 'FX effect',
    views: ['home', 'finance'],
    definition: `What exchange rates add to cost against the comparison’s stored plan rates: actual rates in closed months and forecast rates in open months. Two currencies are never added in local terms, and editing Working’s plan rates never moves it. ${VS}`,
    formula: 'Σ actual local × (actual rate − plan rate) + Σ forecast local × (forecast rate − plan rate)',
    population:
      'Costed people paid in a currency other than the US dollar; 5 or more of them must contribute to the difference.',
    window: WINDOW.costComparison,
    unit: 'money',
    goodDirection: null,
    uses: uses(FORECAST_COST),
    dependsOn: DIFFERENCE,
    owner: OWNER.finance,
  },
])
