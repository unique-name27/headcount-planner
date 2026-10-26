/**
 * The sample's assumptions (docs/PLAN.md 13.2): band midpoints by level, zone and fiscal year, loads
 * (target bonus, funding, burden and caps, benefits, equity, severance), merit and the promotion
 * pool, forecast drivers, FX rate sets, GL accounts and trade settings, written in long form for each
 * of the sample's four versions. Pure: this module draws no random numbers.
 *
 * Bands: local midpoint = Math.round(San Jose USD × zone ÷ plan rate ÷ unit) × unit, half up (the
 * rule of the template app's sample comp), with unit 1,000 for USD, CAD, EUR, ILS and CNY, 10,000 for
 * INR and TWD and 1,000,000 for VND. FY28 = FY27 local × 1.03, rounded the same way. The quotient is
 * snapped to 1e-6 before rounding, so floating-point noise can never turn an exact .5 tie into a
 * round-down (P3 Bengaluru: 165,000 × 0.26 ÷ 0.012 = 3,575,000 rounds up to ₹3,580,000). Never a
 * half-even or `toFixed` helper.
 *
 * Versions (ids as src/plan/store and the fixtures use them): FY27 Budget (locked 20 Mar 2026),
 * FY27 Q1 Reforecast (locked 15 Jul 2026), FY27 Working and FY28 Working. Every version carries the
 * same tables except FX coverage: plan rates for every grid month; actual rates for the months closed
 * when the version was made (Q1 Reforecast April to June, FY27 Working April to September); forecast
 * rates after them. The promotion pool for FY28 is in FY28 Working only.
 */
import {
  type AssumptionRow,
  type AssumptionTable,
  assumptionKey,
  type FiscalYear,
  type ISODate,
  LEVELS,
  type Level,
  type Month,
  SITES,
  siteByLocation,
} from '../schema'

/* ───────────────────────── the versions ───────────────────────── */

export interface SampleVersionSpec {
  versionId: string
  name: string
  kind: 'budget' | 'reforecast' | 'working'
  fiscalYear: FiscalYear
  grid: { from: Month; to: Month }
  /** The day its assumption rows were set (asKnownOn reads them from then). */
  setOn: ISODate
  /** Locked versions: the lock day. */
  lockedOn: ISODate | null
  /** The last month with actual FX rates (null: none). */
  actualThrough: Month | null
  /** The first month with forecast FX rates (null: none). */
  forecastFrom: Month | null
}

export const FY27_BUDGET = 'fy27-budget'
export const FY27_Q1_REFORECAST = 'fy27-q1-reforecast'
export const FY27_WORKING = 'fy27-working'
export const FY28_WORKING = 'fy28-working'

export const SAMPLE_VERSIONS: readonly SampleVersionSpec[] = [
  {
    versionId: FY27_BUDGET,
    name: 'FY27 Budget',
    kind: 'budget',
    fiscalYear: 'FY27',
    grid: { from: '2026-04', to: '2027-09' },
    setOn: '2026-02-02',
    lockedOn: '2026-03-20',
    actualThrough: null,
    forecastFrom: null,
  },
  {
    versionId: FY27_Q1_REFORECAST,
    name: 'FY27 Q1 Reforecast',
    kind: 'reforecast',
    fiscalYear: 'FY27',
    grid: { from: '2026-04', to: '2027-09' },
    setOn: '2026-07-06',
    lockedOn: '2026-07-15',
    actualThrough: '2026-06',
    forecastFrom: '2026-07',
  },
  {
    versionId: FY27_WORKING,
    name: 'FY27 Working',
    kind: 'working',
    fiscalYear: 'FY27',
    grid: { from: '2026-04', to: '2027-09' },
    setOn: '2026-03-20',
    lockedOn: null,
    actualThrough: '2026-09',
    forecastFrom: '2026-10',
  },
  {
    versionId: FY28_WORKING,
    name: 'FY28 Working',
    kind: 'working',
    fiscalYear: 'FY28',
    grid: { from: '2027-04', to: '2028-09' },
    setOn: '2026-09-15',
    lockedOn: null,
    actualThrough: null,
    forecastFrom: '2027-04',
  },
]

export const versionSpec = (versionId: string): SampleVersionSpec =>
  SAMPLE_VERSIONS.find((v) => v.versionId === versionId)!

/* ───────────────────────── bands ───────────────────────── */

/** San Jose midpoints in USD (docs/PLAN.md 13.2). */
export const SAN_JOSE_MIDPOINT: Readonly<Record<Level, number>> = {
  P1: 105_000,
  P2: 130_000,
  P3: 165_000,
  P4: 195_000,
  P5: 235_000,
  P6: 280_000,
  M1: 225_000,
  M2: 285_000,
  E1: 350_000,
  E2: 420_000,
  E3: 520_000,
}

/** Plan rates, USD per 1 local. */
export const PLAN_FX: Readonly<Record<string, number>> = {
  USD: 1,
  CAD: 0.73,
  EUR: 1.08,
  ILS: 0.27,
  INR: 0.012,
  TWD: 0.031,
  CNY: 0.14,
  VND: 0.000039,
}

/** Rounding unit of band midpoints in each currency; base salaries round to a tenth of it. */
export const BAND_UNIT: Readonly<Record<string, number>> = {
  USD: 1_000,
  CAD: 1_000,
  EUR: 1_000,
  ILS: 1_000,
  CNY: 1_000,
  INR: 10_000,
  TWD: 10_000,
  VND: 1_000_000,
}

/** FY28 bands are FY27's raised by this much. */
export const BAND_INCREASE_FY28 = 0.03

/**
 * x rounded to a whole number of `unit`s, half up. The quotient is snapped to 1e-6 first, so a tie
 * that floating point puts a hair below .5 still rounds up.
 */
export function roundHalfUp(x: number, unit: number): number {
  const q = Math.round((x / unit) * 1e6) / 1e6
  return Math.round(q) * unit
}

const bandCache = new Map<string, number>()

/** A level's local midpoint at a location for FY27 or FY28 (FY26, for history only, is FY27 ÷ 1.03). */
export function bandMidpoint(level: Level, location: string, fy: FiscalYear): number {
  const key = `${level}|${location}|${fy}`
  let v = bandCache.get(key)
  if (v !== undefined) return v
  const site = siteByLocation.get(location)
  if (!site) throw new Error(`No site ${location}`)
  const unit = BAND_UNIT[site.currency]
  const fy27 = roundHalfUp((SAN_JOSE_MIDPOINT[level] * site.zoneFactor) / PLAN_FX[site.currency], unit)
  if (fy === 'FY27') v = fy27
  else if (fy === 'FY28') v = roundHalfUp(fy27 * (1 + BAND_INCREASE_FY28), unit)
  else if (fy === 'FY26') v = roundHalfUp(fy27 / (1 + BAND_INCREASE_FY28), unit)
  else throw new Error(`No band for ${fy}`)
  bandCache.set(key, v)
  return v
}

/** The unit base salaries and offers round to in a currency (a tenth of the band unit). */
export const payUnit = (currency: string): number => BAND_UNIT[currency] / 10

/* ───────────────────────── loads and drivers ───────────────────────── */

export const BONUS_TARGET: Readonly<Record<Level, number>> = {
  P1: 0.05,
  P2: 0.08,
  P3: 0.1,
  P4: 0.1,
  P5: 0.12,
  P6: 0.15,
  M1: 0.12,
  M2: 0.18,
  E1: 0.25,
  E2: 0.35,
  E3: 0.5,
}

/** USD a year at 1.0 FTE, used only "incl. SBC". */
export const EQUITY_USD: Readonly<Record<Level, number>> = {
  P1: 8_000,
  P2: 15_000,
  P3: 28_000,
  P4: 48_000,
  P5: 80_000,
  P6: 130_000,
  M1: 65_000,
  M2: 130_000,
  E1: 320_000,
  E2: 650_000,
  E3: 1_400_000,
}

/** Burden components by country: rate and cap (local, not scaled by FTE; null: uncapped). */
export const BURDEN: Readonly<
  Record<string, readonly { component: string; rate: number; cap: number | null }[]>
> = {
  'United States': [
    { component: 'socialSecurity', rate: 0.062, cap: 176_100 },
    { component: 'medicare', rate: 0.0145, cap: null },
    { component: 'unemployment', rate: 0.006, cap: 7_000 },
  ],
  Canada: [{ component: 'social', rate: 0.07, cap: 75_000 }],
  Germany: [{ component: 'social', rate: 0.21, cap: 90_600 }],
  Israel: [{ component: 'social', rate: 0.125, cap: 600_000 }],
  India: [{ component: 'social', rate: 0.12, cap: 180_000 }],
  Taiwan: [{ component: 'social', rate: 0.1, cap: 1_800_000 }],
  China: [{ component: 'social', rate: 0.3, cap: 400_000 }],
  Vietnam: [{ component: 'social', rate: 0.215, cap: 46_800_000 }],
}

/** Local amount a head a year, not scaled by FTE. */
export const BENEFITS: Readonly<Record<string, number>> = {
  'United States': 18_000,
  Canada: 6_000,
  Germany: 0,
  Israel: 0,
  India: 50_000,
  Taiwan: 60_000,
  China: 30_000,
  Vietnam: 24_000_000,
}

/** Months of local base. */
export const SEVERANCE_MONTHS: Readonly<Record<string, number>> = {
  'United States': 2,
  Canada: 3,
  Germany: 3,
  Israel: 2,
  India: 3,
  Taiwan: 2,
  China: 3,
  Vietnam: 2,
}

export const MERIT = {
  FY27: { date: 20_260_401, pct: 0.035, cutoff: 20_260_101 },
  FY28: { date: 20_270_401, pct: 0.035, cutoff: 20_270_101 },
} as const

export const PROMOTION_POOL = {
  FY27: { date: 20_261_001, pct: 0.01 },
  FY28: { date: 20_271_001, pct: 0.01 },
} as const

export const TIME_TO_FILL: Readonly<Record<Level, number>> = {
  P1: 60,
  P2: 60,
  P3: 60,
  P4: 75,
  P5: 75,
  P6: 90,
  M1: 75,
  M2: 105,
  E1: 150,
  E2: 150,
  E3: 150,
}

/** Org-alone tables: the company's value and unit overrides. */
export const FILL_RATE = { company: 0.9, units: { 'Silicon Engineering': 0.85 } } as const
export const ATTRITION = {
  company: 0.1,
  units: { 'Go-to-Market': 0.14, 'Silicon Engineering': 0.08 },
} as const
export const BACKFILL_RATE = 0.9
export const BACKFILL_LAG_MONTHS = 2
export const VACANCY_FACTOR = 0.03

export const GL_ACCOUNT: Readonly<Record<string, number>> = {
  base: 6100,
  bonus: 6110,
  burden: 6120,
  benefits: 6130,
  oneTime: 6140,
  equity: 6150,
}

/** Actual FX, April to September 2026; every other currency is flat at plan in every set. */
export const ACTUAL_FX: Readonly<Record<string, readonly number[]>> = {
  EUR: [1.09, 1.1, 1.11, 1.12, 1.13, 1.14],
  ILS: [0.272, 0.275, 0.278, 0.281, 0.284, 0.287],
}
const ACTUAL_FROM: Month = '2026-04'
/** Forecast FX from October 2026 (and for any month a version forecasts). */
export const FORECAST_FX: Readonly<Record<string, number>> = { EUR: 1.15, ILS: 0.29 }

/** Trade settings (docs/PLAN.md 11); the standard head is computed from the Budget (base.ts). */
export const TRADE_SETTINGS = {
  minFte: 0.5,
  fteStep: 0.1,
  /** Part time allowed everywhere but Bengaluru. */
  partTime: { '*': 1, Bengaluru: 0 } as Readonly<Record<string, number>>,
  dimensions: ['level', 'location', 'fte', 'org'] as const,
  creditLapse: 1,
}

/* ───────────────────────── rows ───────────────────────── */

const pad2 = (n: number): string => String(n).padStart(2, '0')
function months(from: Month, to: Month): Month[] {
  const out: Month[] = []
  let y = +from.slice(0, 4)
  let m = +from.slice(5, 7)
  for (;;) {
    const k = `${y}-${pad2(m)}` as Month
    if (k > to) break
    out.push(k)
    m++
    if (m > 12) {
      m = 1
      y++
    }
  }
  return out
}
const monthIndex = (m: Month): number => +m.slice(0, 4) * 12 + +m.slice(5, 7)

/** The currencies other than USD, in site order. */
const CURRENCIES: readonly string[] = [...new Set(SITES.map((s) => s.currency))].filter((c) => c !== 'USD')
const COUNTRIES: readonly string[] = [...new Set(SITES.map((s) => s.country))]

/** A version's FX rows: plan for every grid month, actual through `actualThrough`, forecast from `forecastFrom`. */
function fxRows(
  v: SampleVersionSpec,
  push: (table: AssumptionTable, key: string, value: number) => void,
): void {
  for (const m of months(v.grid.from, v.grid.to))
    for (const c of CURRENCIES) push('fx', assumptionKey([c, 'plan', m]), PLAN_FX[c])
  if (v.actualThrough)
    for (const m of months(ACTUAL_FROM, v.actualThrough))
      for (const c of CURRENCIES) {
        const series = ACTUAL_FX[c]
        push(
          'fx',
          assumptionKey([c, 'actual', m]),
          series ? series[monthIndex(m) - monthIndex(ACTUAL_FROM)] : PLAN_FX[c],
        )
      }
  if (v.forecastFrom)
    for (const m of months(v.forecastFrom, v.grid.to))
      for (const c of CURRENCIES) push('fx', assumptionKey([c, 'forecast', m]), FORECAST_FX[c] ?? PLAN_FX[c])
}

/** The day an `fx` actual row was set: its month's last day (the close), never before the version's rows. */
function actualSetOn(key: string, setOn: ISODate): ISODate | null {
  const [, set, m] = key.split('|')
  if (set !== 'actual') return null
  const y = +m.slice(0, 4)
  const mo = +m.slice(5, 7)
  const last = `${m}-${pad2(new Date(Date.UTC(y, mo, 0)).getUTCDate())}`
  return last > setOn ? last : setOn
}

export interface AssumptionOutput {
  rows: AssumptionRow[]
  /** The day each row was set (parallel to `rows`), for `asKnownOn`. */
  known: ISODate[]
}

/**
 * Every version's rows. `standardHead` gives each version's standard head in USD (11.2), computed by
 * the caller from the Budget (FY27 versions) or FY28 Working; it is left out when null.
 */
export function sampleAssumptions(
  standardHead: (versionId: string) => number | null = () => null,
): AssumptionOutput {
  const rows: AssumptionRow[] = []
  const known: ISODate[] = []
  for (const v of SAMPLE_VERSIONS) {
    const push = (table: AssumptionTable, key: string, value: number, org: string | null = null) => {
      rows.push({ version: v.versionId, table, org, key, value })
      known.push(table === 'fx' ? (actualSetOn(key, v.setOn) ?? v.setOn) : v.setOn)
    }
    for (const fy of ['FY27', 'FY28'] as const)
      for (const level of LEVELS)
        for (const site of SITES)
          push('band', assumptionKey([level, site.zone, fy]), bandMidpoint(level, site.location, fy))
    for (const level of LEVELS) push('bonusTarget', level, BONUS_TARGET[level])
    push('bonusFunding', 'FY27', 1)
    push('bonusFunding', 'FY28', 1)
    for (const level of LEVELS) push('equity', level, EQUITY_USD[level])
    for (const country of COUNTRIES)
      for (const b of BURDEN[country]) {
        push('burden', assumptionKey([country, b.component]), b.rate)
        if (b.cap != null) push('burdenCap', assumptionKey([country, b.component]), b.cap)
      }
    for (const country of COUNTRIES) push('benefits', country, BENEFITS[country])
    for (const country of COUNTRIES) push('severance', country, SEVERANCE_MONTHS[country])
    for (const fy of ['FY27', 'FY28'] as const) {
      push('merit', assumptionKey([fy, 'date']), MERIT[fy].date)
      push('merit', assumptionKey([fy, 'pct']), MERIT[fy].pct)
      push('merit', assumptionKey([fy, 'cutoff']), MERIT[fy].cutoff)
    }
    const pools: ('FY27' | 'FY28')[] = v.fiscalYear === 'FY28' ? ['FY27', 'FY28'] : ['FY27']
    for (const fy of pools) {
      push('promotionPool', assumptionKey([fy, 'date']), PROMOTION_POOL[fy].date)
      push('promotionPool', assumptionKey([fy, 'pct']), PROMOTION_POOL[fy].pct)
    }
    fxRows(v, push)
    for (const level of LEVELS) push('timeToFill', level, TIME_TO_FILL[level])
    push('fillRate', '*', FILL_RATE.company)
    for (const [unit, value] of Object.entries(FILL_RATE.units)) push('fillRate', '*', value, unit)
    push('attrition', '*', ATTRITION.company)
    for (const [unit, value] of Object.entries(ATTRITION.units)) push('attrition', '*', value, unit)
    push('backfillRate', '*', BACKFILL_RATE)
    push('backfillLag', '*', BACKFILL_LAG_MONTHS)
    push('vacancyFactor', '*', VACANCY_FACTOR)
    for (const [component, code] of Object.entries(GL_ACCOUNT)) push('glAccount', component, code)
    const s = standardHead(v.versionId)
    if (s != null) push('trade', 'standardHeadUsd', s)
    push('trade', 'minFte', TRADE_SETTINGS.minFte)
    push('trade', 'fteStep', TRADE_SETTINGS.fteStep)
    for (const [location, flag] of Object.entries(TRADE_SETTINGS.partTime))
      push('trade', assumptionKey(['partTime', location]), flag)
    for (const d of TRADE_SETTINGS.dimensions) push('trade', assumptionKey(['dimensions', d]), 1)
    push('trade', 'creditLapse', TRADE_SETTINGS.creditLapse)
  }
  return { rows, known }
}

/**
 * A seat's annual band estimate in USD at FY27 plan rates, no equity (docs/PLAN.md 6.3 and 11.2): the
 * midpoint × FTE plus bonus, burden (capped) and benefits, converted at the plan rate. Used by the
 * generator for the leader threshold on request steps; the engines compute the same from the rows.
 */
export function bandEstimateUsd(level: Level, location: string, fte = 1, fy: FiscalYear = 'FY27'): number {
  const site = siteByLocation.get(location)!
  const base = bandMidpoint(level, location, fy) * fte
  const bonus = base * BONUS_TARGET[level]
  let burden = 0
  for (const b of BURDEN[site.country])
    burden += b.rate * Math.min(base + bonus, b.cap ?? Number.POSITIVE_INFINITY)
  return (base + bonus + burden + BENEFITS[site.country]) * PLAN_FX[site.currency]
}
