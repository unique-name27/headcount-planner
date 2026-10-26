/**
 * The bridge (docs/PLAN.md 6.8): from the comparison total to the forecast total by sequential
 * substitution, one driver at a time, in a fixed order. Each step = total after − total before. Steps
 * 1 to 7 are priced at the comparison's plan rates; step 8 swaps them for actual rates in closed months
 * and forecast rates in open months, so the FX step = `fxEffect(forecast lines, comparison rates)`. A
 * "Rounding" bar closing rounded waterfalls is the guard's (src/cost), not this engine's. Built by
 * engines B in M1. Pure.
 *
 * Tests on exact output: the end state equals the forecast engine's total; the FX step equals the FX
 * formula on the same lines; steps sum to end − start, in integer cents with no float drift.
 *
 * Which driver moves which field is `BRIDGE_STEP_FIELDS` (data). One-time items (sign-on, relocation,
 * agency fee, severance) move with the pay rate, since they come with offers and Filled seats.
 *
 * `bridgeSeats` reads both sides from lines, so the start and the end are exact whatever the engines
 * did inside a month (merit, promotion pool, a holder handing over to a replacement):
 *  - each side of a seat is priced from a reference line (its latest costed segment): the
 *    FTE-equivalent pay rate, the bonus as a share of base, the burden as one effective rate on base +
 *    bonus, and the benefits a year; `active` then carries each month's recurring amount as a share of
 *    that reference (so it is the true active fraction when the rate holds all year, and is
 *    probability-weighted for forecast starts);
 *  - every seat keeps retention 1 on both sides; the comparison's vacancy allowance (15.2 C31, lead
 *    decision D-VAC: its allowance lines, −vacancyFactor × its filled part's recurring cost) is a part
 *    of each seat of its own, retention 1 on the comparison side and 0 on the forecast side (the
 *    forecast carries none), and the forecast's modeled exits and backfills are cohort seats
 *    ('cohort:<unit>|<currency>') with retention 0 on the comparison side. So the start is the
 *    comparison version's total including its allowance to the cent (the total variance, targets and
 *    the stories read), and the attrition step ("attrition against the vacancy factor") is exactly
 *    the forecast's exit and backfill effect minus the comparison's allowance;
 *  - a seat that exists on one side only (added after the comparison locked, eliminated, traded, or
 *    months after an elimination) is a separate part of the seat with `exists` false on the other side
 *    (that side's drivers copied, the comparison's plan rates kept), so it moves in the positions step
 *    and its FX still lands in the FX step;
 *  - a seat is in scope on the comparison side by its row on the lock date and on the forecast side by
 *    its row on the as-of date, so a moved position shows in the transfers step;
 *  - a seat whose currency differs between sides (a relocation across currencies) is priced as two
 *    parts, one per currency, and moves in the positions step, unless it is at band estimate on both
 *    sides with a mix (below): a band seat moved to a site in another currency stays one seat
 *    (M4 recheck SA-3-a), its forecast side carrying `planRates`, the comparison's plan rates for its
 *    own currency, so every amount is priced in its own currency: the comparison's at its rates, the
 *    forecast's at those plan rates until the FX step swaps them for actual and forecast rates;
 *  - a month's rate on a side is the local-weighted rate of its lines, so lines of one seat and
 *    currency at different rates (a back-dated adjustment posted at its closed month's actual rate,
 *    forecast.ts `withAdjustments`) still price to their own USD, and the end stays the forecast's;
 *  - a back-dated adjustment (a line with no heads and no FTE but a recurring amount,
 *    `isPostedLine`: forecast.ts `withAdjustments`, src/plan/lineSource.ts `adjustmentLines`, or a
 *    locked version's stored copy of one) is `posted`, never part of `active`, and the timing step
 *    takes it whole at the comparison's plan rates (PLAN 6.6 "counted in the bridge's timing step";
 *    M4 review SA-2), its rate difference landing in FX; a seat on one side only moves whole in the
 *    positions step, adjustments included;
 *  - mix (step 4) moves for a level or location change as well as FTE (PLAN 6.8; M4 review SA-3): a
 *    seat priced at band estimate on both sides whose level or location differs carries, on its
 *    forecast side, `mix`: the comparison's own pay rate, bonus, burden and benefits re-keyed to the
 *    forecast side's level and location by the comparison's band table and loads (its locked
 *    assumptions, the seat's org on the lock date), so the whole change lands in mix, and pay rate
 *    and assumption rates keep HRIS pay, offers, a change of basis (R30) and changed tables. A Filled
 *    seat's level change stays in pay rate: HRIS pay is its driver.
 */

import { fiscalYearOf, monthEnd } from '@/data/fiscal'
import type { FiscalYear, ISODate, Level, Month, PositionRow } from '@/data/schema'
import { LEVELS } from '@/data/schema'
import type { CostBasis, LockedVersion, OrgMatch, PlanLine, SeatPlace } from '../types'
import { type AssumptionLookup, assumptionLookup, seatLoads } from './assumptions'
import { annualLocal, type BurdenComponent, isAllowanceLine } from './cost'
import type { ForecastResult } from './forecast'
import { type CohortLine, isCohortLine } from './forecast'
import { rateOf } from './fx'
import { planLineRows } from './lineTable'
import { emptyComparisonReason } from './variance'
import { rowOn } from './versions'

/** The eight drivers, in substitution order. */
export const BRIDGE_STEPS = [
  'timing',
  'positions',
  'attrition',
  'mix',
  'payRate',
  'assumptionRates',
  'transfers',
  'fx',
] as const
export type BridgeStepKey = (typeof BRIDGE_STEPS)[number]

/** Each step's label on the waterfall and in exports. */
export const BRIDGE_STEP_LABEL: Readonly<Record<BridgeStepKey, string>> = {
  timing: 'Timing',
  positions: 'Position changes',
  attrition: 'Attrition against the vacancy factor',
  mix: 'Mix',
  payRate: 'Pay rate',
  assumptionRates: 'Assumption rates',
  transfers: 'Transfers',
  fx: 'FX',
}

/** One step of the bridge. */
export interface BridgeStep {
  key: BridgeStepKey
  label: string
  /** The scope's total before and after this driver is substituted, USD. */
  before: number
  after: number
  /** after − before, computed in integer cents and returned in dollars. */
  amount: number
  /** Seats whose priced amount changed in this step (the guard counts contributors from them). */
  contributors: readonly string[]
}

export type BridgeResult =
  | { kind: 'ok'; comparisonLabel: string; start: number; end: number; steps: readonly BridgeStep[] }
  | { kind: 'empty'; reason: string }

/** Whole cents of a USD amount. */
const cents = (usd: number): number => Math.round(usd * 100)

/**
 * Steps from a start total and the total after each substitution (in BRIDGE_STEPS order), with no
 * float drift: each amount is Math.round(after × 100) − Math.round(before × 100) cents, so Σ amounts
 * in cents equals the end's cents − the start's. `totals` has exactly 8 entries; contributors are
 * empty.
 *
 * Fixture: B1 (plan $10.0M, forecast $10.6M; −$0.3M, +$0.5M, −$0.2M, +$0.1M, +$0.2M, $0, $0, +$0.3M).
 */
export function bridgeFromTotals(start: number, totals: readonly number[]): BridgeStep[] {
  if (totals.length !== BRIDGE_STEPS.length) {
    throw new Error(`A bridge needs ${BRIDGE_STEPS.length} totals, one per step; got ${totals.length}.`)
  }
  let before = start
  return BRIDGE_STEPS.map((key, i) => {
    const after = totals[i]
    const step: BridgeStep = {
      key,
      label: BRIDGE_STEP_LABEL[key],
      before,
      after,
      amount: (cents(after) - cents(before)) / 100 + 0,
      contributors: [],
    }
    before = after
    return step
  })
}

/**
 * One side's drivers for one seat (or one cohort line), in the seat's local currency. Every by-month
 * record covers the bridge's months; a month missing from one reads 0.
 */
export interface SeatDrivers {
  /** Active fraction by month: dates and fill timing; probability-weighted for forecast starts (timing). */
  active: Readonly<Record<Month, number>>
  /** The seat exists on this side; added, eliminated and traded seats exist on one side only (positions). */
  exists: boolean
  /** Share of the recurring amount kept by month (attrition): 1 for every seat; 0 on the comparison side of a cohort seat and on the forecast side of a seat's vacancy allowance, so modeled exits, backfills and the allowance move in this step. */
  retention: Readonly<Record<Month, number>>
  /** Level, location and FTE (mix). */
  level: Level
  location: string
  fte: number
  currency: string
  /** The FTE-equivalent annual base, local: HRIS pay, an offer, or the midpoint at this side's level and location (pay rate). */
  payRate: number
  basis: CostBasis
  /** Bonus target and funding, burden components and benefits (assumption rates). */
  bonusTarget: number
  bonusFunding: number
  burden: readonly BurdenComponent[]
  benefits: number
  /** One-time local amounts by month. */
  oneTime: Readonly<Record<Month, number>>
  /**
   * Back-dated adjustments posted in each month, local recurring amounts (`isPostedLine`; PLAN 6.6,
   * M4 review SA-2): the timing step takes them whole. Absent when the side has none.
   */
  posted?: Readonly<Record<Month, number>>
  /** In the scope on this side: a transfer moves a seat in or out (transfers). */
  inScope: boolean
  /** USD per 1 local by month: plan rates on the comparison side; actual (closed) and forecast (open) on the forecast side (fx). */
  rates: Readonly<Record<Month, number>>
  /**
   * The forecast side of a seat whose currency differs from its comparison side's (a band seat moved
   * to a site in another currency, M4 recheck SA-3-a): the comparison's plan rates for this side's
   * currency, USD per 1 local by month. Every amount taken from this side is priced at them until the
   * FX step takes `rates`; every amount still taken from the comparison side at that side's own
   * rates. Absent everywhere else (a side's amounts are then priced at the FX step's side's rates).
   */
  planRates?: Readonly<Record<Month, number>>
  /**
   * The forecast side of a seat at band estimate on both sides whose level or location changed
   * (SA-3): the comparison's pay rate and loads at this side's level and location (the comparison's
   * band table and loads, in this side's currency), which the mix step takes until pay rate and
   * assumption rates take this side's own. Absent everywhere else.
   */
  mix?: {
    payRate: number
    /** Bonus as a share of base, funding included (as `bonusTarget` reads with funding 1). */
    bonusTarget: number
    burden: readonly BurdenComponent[]
    benefits: number
  }
}

/** Which SeatDrivers fields each step takes from the forecast side (data; the calculation card reads it). */
export const BRIDGE_STEP_FIELDS: Readonly<Record<BridgeStepKey, readonly (keyof SeatDrivers)[]>> = {
  timing: ['active', 'posted'],
  positions: ['exists'],
  attrition: ['retention'],
  mix: ['level', 'location', 'fte'],
  payRate: ['payRate', 'basis', 'oneTime'],
  assumptionRates: ['bonusTarget', 'bonusFunding', 'burden', 'benefits'],
  transfers: ['inScope'],
  fx: ['rates', 'currency'],
}

/** A seat with both sides' drivers; null for a side the seat is not on. */
export interface BridgeSeat {
  /** The position, or a cohort key ('cohort:<unit>|<currency>') for modeled exits and backfills. */
  positionId: string
  comparison: SeatDrivers | null
  forecast: SeatDrivers | null
}

export interface BridgeInput {
  /** The shown version's fiscal year (the empty state names it). */
  fiscalYear: FiscalYear
  /** The comparison version; null for a target comparison (an empty state, 9.2). */
  comparison: { versionId: string; label: string; fiscalYear: FiscalYear } | null
  yearHasLockedVersion: boolean
  /** The window's months (the fiscal year for the full-year bridge). */
  months: readonly Month[]
  seats: readonly BridgeSeat[]
}

/** True for a bridge seat that stands for a unit's modeled exits and backfills in one currency. */
export const isCohortSeat = (positionId: string): boolean => positionId.startsWith('cohort:')

/**
 * A seat's total in USD over the months with the named drivers taken from the forecast side and the
 * rest from the comparison side: Σ months [inScope × exists × ((payRate × fte + bonus + burden +
 * benefits) ÷ 12 × active × retention + oneTime)] × rate, with bonus, burden and benefits from
 * `annualLocal`. A side that is null reads as not existing (its other drivers are the other side's).
 */
export function priceSeat(
  seat: BridgeSeat,
  fromForecast: ReadonlySet<BridgeStepKey>,
  months: readonly Month[],
): number {
  const comparison = seat.comparison ?? (seat.forecast && { ...seat.forecast, exists: false })
  const forecast = seat.forecast ?? (seat.comparison && { ...seat.comparison, exists: false })
  if (!comparison || !forecast) return 0
  const side = (step: BridgeStepKey): SeatDrivers => (fromForecast.has(step) ? forecast : comparison)
  if (!side('positions').exists || !side('transfers').inScope) return 0
  const pay = side('payRate')
  const loads = side('assumptionRates')
  // A band seat's level or location change is mix (SA-3): the comparison's rates at the new mix
  // until pay rate and assumption rates take the forecast's own.
  const mix = fromForecast.has('mix') ? forecast.mix : undefined
  const mixLoads = mix && !fromForecast.has('assumptionRates') ? mix : undefined
  const a = annualLocal({
    rate: mix && !fromForecast.has('payRate') ? mix.payRate : pay.payRate,
    fte: side('mix').fte,
    bonusTarget: mixLoads ? mixLoads.bonusTarget : loads.bonusTarget,
    bonusFunding: mixLoads ? 1 : loads.bonusFunding,
    burden: mixLoads ? mixLoads.burden : loads.burden,
    benefits: mixLoads ? mixLoads.benefits : loads.benefits,
  })
  const monthly = (a.base + a.bonus + a.burden + a.benefits) / 12
  const timing = side('timing')
  const active = timing.active
  const posted = timing.posted
  const retention = side('attrition').retention
  let total = 0
  const planRates = forecast.planRates
  if (!planRates) {
    const rates = side('fx').rates
    for (const m of months) {
      const recurring = monthly * (active[m] ?? 0) * (retention[m] ?? 0)
      total += (recurring + (pay.oneTime[m] ?? 0) + (posted?.[m] ?? 0)) * (rates[m] ?? 0)
    }
    return total
  }
  // A seat whose two sides are in two currencies (SA-3-a): each amount at its own side's rates. The
  // recurring amount is in the forecast side's currency from the mix step on (the mix is priced in
  // it), one-time items from the pay rate step, posted adjustments from the timing step.
  const ratesOf = (fromFc: boolean): Readonly<Record<Month, number>> =>
    !fromFc ? comparison.rates : fromForecast.has('fx') ? forecast.rates : planRates
  const recurringRates = ratesOf(!!mix || fromForecast.has('payRate'))
  const oneTimeRates = ratesOf(fromForecast.has('payRate'))
  const postedRates = ratesOf(fromForecast.has('timing'))
  for (const m of months) {
    const recurring = monthly * (active[m] ?? 0) * (retention[m] ?? 0)
    total +=
      recurring * (recurringRates[m] ?? 0) +
      (pay.oneTime[m] ?? 0) * (oneTimeRates[m] ?? 0) +
      (posted?.[m] ?? 0) * (postedRates[m] ?? 0)
  }
  return total
}

/**
 * A seat's price at each stage of the bridge (`priceSeat`): index 0 with nothing from the forecast,
 * then index k with the first k drivers of BRIDGE_STEPS from it (index 8: everything). An addition to
 * the contract: a caller that prices the same seats for many scopes keeps these per seat.
 */
export function seatStagePrices(seat: BridgeSeat, months: readonly Month[]): number[] {
  const fromForecast = new Set<BridgeStepKey>()
  const out = [priceSeat(seat, fromForecast, months)]
  for (const step of BRIDGE_STEPS) {
    fromForecast.add(step)
    out.push(priceSeat(seat, fromForecast, months))
  }
  return out
}

/**
 * The bridge: start = Σ priceSeat with nothing from the forecast; then each driver in BRIDGE_STEPS
 * order is added to the forecast set and the scope re-priced; the end has every driver from the
 * forecast. An empty state (not an error) when the comparison is a target, with
 * `emptyComparisonReason` (variance.ts). Seats are summed in the order given; a step's contributors
 * are the seats whose price moved by more than half a cent in it (cohort keys included, which
 * `isCohortSeat` tells apart).
 *
 * `pricesOf`, when given, is each seat's `seatStagePrices` over the input's months (kept by a caller
 * that prices the same seats again); the bridge is the same either way. An addition to the contract.
 *
 * Fixtures (bridge.test.ts): BX2 (X2's seat: every step $0 but FX, and FX = $8,400 = fxEffect on the
 * same lines against the Budget's rates), EV1 (target comparison: empty state).
 */
export function bridge(
  input: BridgeInput,
  pricesOf: (seat: BridgeSeat) => readonly number[] = (seat) => seatStagePrices(seat, input.months),
): BridgeResult {
  if (!input.comparison) {
    return { kind: 'empty', reason: emptyComparisonReason(input.fiscalYear, input.yearHasLockedVersion) }
  }
  const { seats } = input
  const table = seats.map(pricesOf)
  const stage = (k: number): number[] => table.map((row) => row[k])
  let prices = stage(0)
  const start = sum(prices)
  const totals: number[] = []
  const contributors: string[][] = []
  for (let k = 1; k <= BRIDGE_STEPS.length; k++) {
    const next = stage(k)
    totals.push(sum(next))
    const moved = new Set<string>()
    next.forEach((p, i) => {
      if (Math.abs(p - prices[i]) > 0.005) moved.add(seats[i].positionId)
    })
    contributors.push([...moved])
    prices = next
  }
  const steps = bridgeFromTotals(start, totals).map((s, i) => ({ ...s, contributors: contributors[i] }))
  return { kind: 'ok', comparisonLabel: input.comparison.label, start, end: totals[totals.length - 1], steps }
}

function sum(xs: readonly number[]): number {
  let n = 0
  for (const x of xs) n += x
  return n
}

export interface BridgeSeatsInput {
  comparison: LockedVersion
  forecast: ForecastResult
  /** Every position row, to read each seat's level, location and FTE on both sides. */
  positions: readonly PositionRow[]
  /** The scope: a seat counts on a side when it is in the scope on that side. */
  scope: OrgMatch
  months: readonly Month[]
}

/* ───────────── bridgeSeats: drivers from lines ───────────── */

/**
 * A seat's vacancy allowance as drivers: a reference of 12 local a year at FTE 1 makes `active` the
 * month's allowance in local currency, at the local-weighted rate of its lines, so pricing it gives
 * back the allowance lines' USD.
 */
function allowanceDrivers(
  lines: ByMonth,
  months: readonly Month[],
  row: SideRow,
  currency: string,
  rateFallback: (m: Month) => number,
): SeatDrivers {
  return {
    active: record(months, (m) => {
      let v = 0
      for (const l of lines.get(m) ?? []) v += l.local.vacancy
      return v
    }),
    exists: true,
    retention: record(months, () => 1),
    level: row.level,
    location: row.location,
    fte: 1,
    currency,
    payRate: 12,
    basis: 'hris',
    bonusTarget: 0,
    bonusFunding: 1,
    burden: [],
    benefits: 0,
    oneTime: record(months, () => 0),
    inScope: row.inScope,
    rates: record(months, (m) => {
      let local = 0
      let usd = 0
      for (const l of lines.get(m) ?? []) {
        local += l.local.vacancy
        usd += l.usd.vacancy
      }
      return Math.abs(local) > 1e-12 ? usd / local : rateFallback(m)
    }),
  }
}

/** A seat's lines on one side in one currency, by month. */
type ByMonth = Map<Month, PlanLine[]>

const recurringOf = (l: PlanLine): number => l.local.base + l.local.bonus + l.local.burden + l.local.benefits

/**
 * A back-dated adjustment's line (PLAN 6.6; M4 review SA-2): no heads and no FTE but a recurring
 * amount, as forecast.ts `withAdjustments` and src/plan/lineSource.ts `adjustmentLines` write it, and
 * as a locked version stores it. No seat line has that shape (a seat's recurring amount is its pay
 * rate × FTE), and a close's one-time line has no recurring amount.
 */
export const isPostedLine = (l: PlanLine): boolean => l.heads === 0 && l.fte === 0 && recurringOf(l) !== 0

const placeOf = (row: PositionRow): SeatPlace => ({
  positionId: row.positionId,
  managerPositionId: row.managerPositionId ?? null,
  businessUnit: row.businessUnit,
  department: row.department ?? null,
  costCenter: row.costCenter,
})

/** Where a seat's level, location, FTE and org come from on one side. */
interface SideRow {
  level: Level
  location: string
  fte: number
  inScope: boolean
}

/** A seat's pricing reference on one side: the latest month's largest costed line. */
interface Reference {
  payRate: number
  fte: number
  bonusTarget: number
  burden: readonly BurdenComponent[]
  benefits: number
  basis: CostBasis
}

function referenceOf(lines: ByMonth, months: readonly Month[]): Reference | null {
  for (let i = months.length - 1; i >= 0; i--) {
    let best: PlanLine | null = null
    for (const l of lines.get(months[i]) ?? []) {
      if (l.active > 0 && l.fte > 0 && recurringOf(l) > 0 && (!best || recurringOf(l) > recurringOf(best))) {
        best = l
      }
    }
    if (best) {
      const { base, bonus, burden, benefits } = best.local
      return {
        payRate: (base * 12) / (best.fte * best.active),
        fte: best.fte,
        bonusTarget: base > 0 ? bonus / base : 0,
        burden: [{ component: 'effective', rate: base + bonus > 0 ? burden / (base + bonus) : 0, cap: null }],
        benefits: (benefits * 12) / best.active,
        basis: best.basis,
      }
    }
  }
  return null
}

/** Records over the window's months. */
function record(months: readonly Month[], value: (m: Month) => number): Record<Month, number> {
  const out = {} as Record<Month, number>
  for (const m of months) out[m] = value(m)
  return out
}

interface SideInput {
  lines: ByMonth
  /** The months this part covers; other months read 0 in active and oneTime. */
  partMonths: ReadonlySet<Month>
  row: SideRow
  currency: string
  /** The rate of a month with no line on this side. */
  rateFallback: (m: Month) => number
}

/** One side's drivers from its lines, so that pricing it alone gives back its lines' loaded USD. */
function driversFromLines(s: SideInput, months: readonly Month[]): SeatDrivers {
  const partMonths = months.filter((m) => s.partMonths.has(m))
  const ref = referenceOf(s.lines, partMonths)
  const payRate = ref?.payRate ?? 0
  const fte = ref?.fte ?? s.row.fte
  const bonusTarget = ref?.bonusTarget ?? 0
  const burden = ref?.burden ?? []
  const benefits = ref?.benefits ?? 0
  const a = annualLocal({ rate: payRate, fte, bonusTarget, bonusFunding: 1, burden, benefits })
  const annual = a.base + a.bonus + a.burden + a.benefits
  // Back-dated adjustments are posted amounts of their own, the timing step's (SA-2).
  let anyPosted = false
  const posted = record(months, (m) => {
    if (!s.partMonths.has(m)) return 0
    let x = 0
    for (const l of s.lines.get(m) ?? []) if (isPostedLine(l)) x += recurringOf(l)
    if (x !== 0) anyPosted = true
    return x
  })
  const active = record(months, (m) => {
    if (!s.partMonths.has(m) || annual <= 0) return 0
    let r = 0
    for (const l of s.lines.get(m) ?? []) if (!isPostedLine(l)) r += recurringOf(l)
    return (r * 12) / annual
  })
  const retention = record(months, () => 1)
  const oneTime = record(months, (m) => {
    if (!s.partMonths.has(m)) return 0
    let o = 0
    for (const l of s.lines.get(m) ?? []) o += l.local.oneTime
    return o
  })
  // One rate a month: the local-weighted rate of the month's lines, so a line at another rate (a
  // back-dated adjustment posted at its closed month's rate) still prices to its own USD.
  const rates = record(months, (m) => {
    const lines = s.lines.get(m) ?? []
    let local = 0
    let usd = 0
    for (const l of lines) {
      const x = recurringOf(l) + l.local.oneTime
      local += x
      usd += x * l.rate
    }
    if (Math.abs(local) > 1e-9) return usd / local
    return lines[0]?.rate ?? s.rateFallback(m)
  })
  return {
    active,
    exists: true,
    retention,
    level: s.row.level,
    location: s.row.location,
    fte,
    currency: s.currency,
    payRate,
    basis: ref?.basis ?? 'band',
    bonusTarget,
    bonusFunding: 1,
    burden,
    benefits,
    oneTime,
    ...(anyPosted ? { posted } : {}),
    inScope: s.row.inScope,
    rates,
  }
}

/** Groups lines by key, then by month (input order kept within a month). */
function groupLines(lines: Iterable<PlanLine>, key: (l: PlanLine) => string): Map<string, ByMonth> {
  const out = new Map<string, ByMonth>()
  for (const l of lines) {
    const k = key(l)
    let byMonth = out.get(k)
    if (!byMonth) {
      byMonth = new Map()
      out.set(k, byMonth)
    }
    const list = byMonth.get(l.month)
    if (list) list.push(l)
    else byMonth.set(l.month, [l])
  }
  return out
}

const SEP = '\u0001'

const rowsBySeatMemo = new WeakMap<readonly PositionRow[], Map<string, PositionRow[]>>()

/** Every seat's position rows, oldest first (read only; memoized per positions array). */
function rowsBySeatOf(positions: readonly PositionRow[]): Map<string, PositionRow[]> {
  const hit = rowsBySeatMemo.get(positions)
  if (hit) return hit
  const rowsBySeat = new Map<string, PositionRow[]>()
  for (const r of positions) {
    const list = rowsBySeat.get(r.positionId)
    if (list) list.push(r)
    else rowsBySeat.set(r.positionId, [r])
  }
  for (const list of rowsBySeat.values()) list.sort((a, b) => (a.effectiveDate < b.effectiveDate ? -1 : 1))
  rowsBySeatMemo.set(positions, rowsBySeat)
  return rowsBySeat
}

/** A locked comparison's lines in a window, grouped by seat and currency (read only). */
interface ComparisonGroups {
  lines: Map<string, ByMonth>
  allowances: Map<string, ByMonth>
  /** The currencies each seat has allowance lines in, sorted. */
  allowanceCurrencies: Map<string, string[]>
}

const comparisonMemo = new WeakMap<object, Map<string, ComparisonGroups>>()

/**
 * The comparison's lines in the window, grouped once per locked line table and window: the bridge is
 * priced for many scopes and contexts over the same locked lines, and converting and grouping the
 * whole table on every call was most of its cost (M2 integration).
 */
function comparisonGroups(
  comparison: BridgeSeatsInput['comparison'],
  months: readonly Month[],
): ComparisonGroups {
  const table = comparison.lines as object
  let byWindow = comparisonMemo.get(table)
  if (!byWindow) {
    byWindow = new Map()
    comparisonMemo.set(table, byWindow)
  }
  const key = months.join(',')
  const hit = byWindow.get(key)
  if (hit) return hit
  const inWindow = new Set(months)
  const seatKey = (l: PlanLine) => `${l.positionId}${SEP}${l.currency}`
  const allowanceLines: PlanLine[] = []
  const lines = groupLines(
    (function* () {
      for (const l of planLineRows(comparison.lines)) {
        if (!inWindow.has(l.month)) continue
        if (isAllowanceLine(l)) allowanceLines.push(l)
        else yield l
      }
    })(),
    seatKey,
  )
  const allowances = groupLines(allowanceLines, seatKey)
  const allowanceCurrencies = new Map<string, string[]>()
  for (const k of allowances.keys()) {
    const [positionId, currency] = k.split(SEP)
    const list = allowanceCurrencies.get(positionId)
    if (list) list.push(currency)
    else allowanceCurrencies.set(positionId, [currency])
  }
  for (const list of allowanceCurrencies.values()) list.sort()
  const out = { lines, allowances, allowanceCurrencies }
  byWindow.set(key, out)
  return out
}

/** The comparison's vacancy allowance in the scope and window (the attrition step's calculation card). */
export interface VacancyAllowance {
  /** The comparison's filled (HRIS and offer) recurring cost (base + bonus + burden + benefits), USD at its line rates. */
  filledUsd: number
  /** Σ the comparison's allowance lines, USD (negative: −vacancyFactor × the filled cost, seat by seat). */
  allowanceUsd: number
}

/**
 * The comparison's vacancy allowance (15.2 C31) for the seats in the scope on the comparison side
 * (their row on the lock date): its filled recurring cost and its allowance lines. The allowance is in
 * the comparison's total, so the bridge starts with it, and the attrition step takes it out (the
 * forecast carries none): that step = the forecast's modeled exits and backfills − `allowanceUsd`. An
 * addition to the contract.
 */
export function vacancyAllowance(input: Omit<BridgeSeatsInput, 'forecast'>): VacancyAllowance {
  const { comparison, scope, months } = input
  const inWindow = new Set(months)
  const lockDate: ISODate = comparison.lockedAt.slice(0, 10)
  const rowsBySeat = rowsBySeatOf(input.positions)
  const inScope = new Map<string, boolean>()
  let filledUsd = 0
  let allowanceUsd = 0
  for (const l of planLineRows(comparison.lines)) {
    if (!inWindow.has(l.month) || l.basis === 'band') continue
    let counted = inScope.get(l.positionId)
    if (counted === undefined) {
      const rows = rowsBySeat.get(l.positionId) ?? []
      const row = rowOn(rows, lockDate) ?? rows[0] ?? null
      counted = row != null && scope(placeOf(row), lockDate)
      inScope.set(l.positionId, counted)
    }
    if (!counted) continue
    if (isAllowanceLine(l)) allowanceUsd += l.usd.vacancy
    else filledUsd += l.usd.base + l.usd.bonus + l.usd.burden + l.usd.benefits
  }
  return { filledUsd, allowanceUsd }
}

/** Months each side has a line in any currency, by seat (a relocation splits by currency). */
function monthsWithLines(groups: Map<string, ByMonth>): Map<string, Map<Month, Set<string>>> {
  const out = new Map<string, Map<Month, Set<string>>>()
  for (const [key, byMonth] of groups) {
    const [positionId, currency] = key.split(SEP)
    let seat = out.get(positionId)
    if (!seat) {
      seat = new Map()
      out.set(positionId, seat)
    }
    for (const m of byMonth.keys()) {
      const set = seat.get(m)
      if (set) set.add(currency)
      else seat.set(m, new Set([currency]))
    }
  }
  return out
}

const seatKeyOf = (l: PlanLine): string => `${l.positionId}${SEP}${l.currency}`

/** What every seat of one comparison, window and forecast date is priced from. */
interface SeatSource {
  comparison: LockedVersion
  months: readonly Month[]
  lockDate: ISODate
  asOf: ISODate
  rowsBySeat: Map<string, PositionRow[]>
  groups: ComparisonGroups
  compMonths: Map<string, Map<Month, Set<string>>>
  planRate: (currency: string, m: Month) => number | null
  /** The comparison's locked assumptions (its band table, bonus targets), for the mix step (SA-3). */
  lookup: AssumptionLookup
}

const compMonthsMemo = new WeakMap<ComparisonGroups, Map<string, Map<Month, Set<string>>>>()
const lookupMemo = new WeakMap<LockedVersion, AssumptionLookup>()

/** The comparison's own assumption lookup, once per locked version. */
function comparisonLookup(comparison: LockedVersion): AssumptionLookup {
  let hit = lookupMemo.get(comparison)
  if (!hit) {
    hit = assumptionLookup(comparison.assumptions, comparison)
    lookupMemo.set(comparison, hit)
  }
  return hit
}

/**
 * The forecast side's `mix` for a seat at band estimate on both sides whose level or location
 * differs (SA-3): the comparison's pay rate scaled by the comparison's midpoint at the new level and
 * location over the old, its bonus share moved by the comparison's bonus targets of the two levels
 * (at its funding), its burden components at the new location and its benefits moved by the two
 * locations' (scaled by them when the new site's currency is another, SA-3-a, so no two currencies
 * are added). Null when nothing in the mix moved but FTE, a side is not band basis, the comparison
 * has no band for either, or a band's currency is not its side's (then the change stays where the
 * lines put it).
 */
function mixOf(
  src: SeatSource,
  row: PositionRow | null,
  comp: SeatDrivers,
  fc: SeatDrivers,
): SeatDrivers['mix'] | null {
  if (comp.basis !== 'band' || fc.basis !== 'band') return null
  if (comp.level === fc.level && comp.location === fc.location) return null
  if (!row || !(comp.payRate > 0) || !src.months.length) return null
  const fy = fiscalYearOf(src.months[0])
  const org = { businessUnit: row.businessUnit, department: row.department ?? null }
  const was = seatLoads({ level: comp.level, location: comp.location }, fy, org, src.lookup)
  const now = seatLoads({ level: fc.level, location: fc.location }, fy, org, src.lookup)
  if (!was || !now || !(was.midpoint > 0) || was.currency !== comp.currency || now.currency !== fc.currency)
    return null
  const benefits =
    was.currency === now.currency
      ? comp.benefits + now.benefits - was.benefits
      : was.benefits > 0
        ? (comp.benefits * now.benefits) / was.benefits
        : now.benefits
  return {
    payRate: (comp.payRate * now.midpoint) / was.midpoint,
    bonusTarget: comp.bonusTarget + now.bonusTarget * now.bonusFunding - was.bonusTarget * was.bonusFunding,
    burden: now.burden,
    benefits,
  }
}

function seatSource(
  comparison: LockedVersion,
  positions: readonly PositionRow[],
  months: readonly Month[],
  asOf: ISODate,
): SeatSource {
  const groups = comparisonGroups(comparison, months)
  let compMonths = compMonthsMemo.get(groups)
  if (!compMonths) {
    compMonths = monthsWithLines(groups.lines)
    compMonthsMemo.set(groups, compMonths)
  }
  return {
    comparison,
    months,
    lockDate: comparison.lockedAt.slice(0, 10),
    asOf,
    rowsBySeat: rowsBySeatOf(positions),
    groups,
    compMonths,
    planRate: (currency, m) => (currency === 'USD' ? 1 : rateOf(comparison.rates, currency, 'plan', m)),
    lookup: comparisonLookup(comparison),
  }
}

/** A seat's rows as both sides read them. */
interface SeatRows {
  rows: PositionRow[]
  compRowsAtLock: PositionRow[]
  compRow: PositionRow | null
  fcRow: PositionRow | null
}

function seatRows(src: SeatSource, positionId: string): SeatRows {
  const rows = src.rowsBySeat.get(positionId) ?? []
  const compRow = rowOn(rows, src.lockDate) ?? rows[0] ?? null
  return {
    rows,
    compRowsAtLock: rows.filter((r) => r.effectiveDate <= src.lockDate),
    compRow,
    fcRow: rowOn(rows, src.asOf) ?? rows[rows.length - 1] ?? compRow,
  }
}

const sideRowOf = (row: PositionRow | null, on: ISODate, scope: OrgMatch): SideRow => ({
  level: row?.level ?? LEVELS[0],
  location: row?.location ?? '',
  fte: row?.fte ?? 1,
  inScope: row ? scope(placeOf(row), on) : false,
})

const NO_MONTHS: ReadonlyMap<Month, ReadonlySet<string>> = new Map()
const NO_LINES: ByMonth = new Map()

/**
 * One position's seats (its parts by currency and side, then its vacancy allowance), given its two
 * side rows and its forecast lines: `fm` the months its forecast lines have each currency in, `fcOf`
 * its forecast lines in a currency by month.
 */
function positionSeats(
  src: SeatSource,
  positionId: string,
  r: SeatRows,
  comp: SideRow,
  fc: SideRow,
  fm: ReadonlyMap<Month, ReadonlySet<string>>,
  fcOf: (currency: string) => ByMonth | undefined,
): BridgeSeat[] {
  const { months, groups, planRate } = src
  const seats: BridgeSeat[] = []
  const cm = src.compMonths.get(positionId) ?? NO_MONTHS
  /** The seat exists on a side in a month with no line there (Open before its start, On hold). */
  const fcExists = (m: Month): boolean => {
    const row = rowOn(r.rows, monthEnd(m))
    return row != null && row.status !== 'Eliminated'
  }
  const compExists = (m: Month): boolean => {
    const row = rowOn(r.compRowsAtLock, monthEnd(m))
    return row != null && row.status !== 'Eliminated'
  }
  const compCurrencies = new Set<string>()
  const fcCurrencies = new Set<string>()
  for (const set of cm.values()) for (const c of set) compCurrencies.add(c)
  for (const set of fm.values()) for (const c of set) fcCurrencies.add(c)
  const currencies = new Set([...compCurrencies, ...fcCurrencies])
  const compLinesIn = (currency: string): ByMonth =>
    groups.lines.get(`${positionId}${SEP}${currency}`) ?? new Map<Month, PlanLine[]>()
  /** The comparison's plan rate for a currency in a month (its line's rate, else 1, where it has none). */
  const planRateIn =
    (currency: string) =>
    (m: Month): number =>
      planRate(currency, m) ?? compLinesIn(currency).get(m)?.[0]?.rate ?? 1

  /**
   * The seat's parts with its comparison lines in `cCur` and its forecast lines in `fCur` (the same
   * currency but for a band seat moved to a site in another, SA-3-a): the months both sides take,
   * and the months only one side does (eliminated, added, or lines in a third currency).
   */
  const partsOf = (cCur: string, fCur: string) => {
    const cl = compLinesIn(cCur)
    const fl = fcOf(fCur) ?? new Map<Month, PlanLine[]>()
    const both = new Set<Month>()
    const compOnly = new Set<Month>()
    const fcOnly = new Set<Month>()
    for (const m of months) {
      const c = cl.has(m)
      const f = fl.has(m)
      if (c && f) both.add(m)
      else if (c) {
        const elsewhere = [...(fm.get(m) ?? [])].some((x) => x !== fCur)
        if (!elsewhere && fcExists(m) && fl.size > 0) both.add(m)
        else compOnly.add(m)
      } else if (f) {
        const elsewhere = [...(cm.get(m) ?? [])].some((x) => x !== cCur)
        if (!elsewhere && compExists(m) && cl.size > 0) both.add(m)
        else fcOnly.add(m)
      }
    }
    const compSide = (part: ReadonlySet<Month>): SeatDrivers =>
      driversFromLines(
        { lines: cl, partMonths: part, row: comp, currency: cCur, rateFallback: planRateIn(cCur) },
        months,
      )
    const fcSide = (part: ReadonlySet<Month>): SeatDrivers =>
      driversFromLines(
        { lines: fl, partMonths: part, row: fc, currency: fCur, rateFallback: planRateIn(fCur) },
        months,
      )
    /** The parts on one side only: each moves whole in the positions step. */
    const oneSided = (): BridgeSeat[] => {
      const out: BridgeSeat[] = []
      if (compOnly.size > 0) {
        const c = compSide(compOnly)
        out.push({ positionId, comparison: c, forecast: { ...c, exists: false } })
      }
      if (fcOnly.size > 0) {
        const f = fcSide(fcOnly)
        out.push({
          positionId,
          comparison: { ...f, exists: false, rates: record(months, planRateIn(fCur)) },
          forecast: f,
        })
      }
      return out
    }
    return { both, compSide, fcSide, oneSided }
  }

  // A band seat moved to a site in another currency (SA-3-a): one seat while it has a mix, so the
  // move lands in the mix step and its rate change in FX, never in timing or position changes.
  let moved: BridgeSeat[] | null = null
  if (compCurrencies.size === 1 && fcCurrencies.size === 1) {
    const [cCur] = compCurrencies
    const [fCur] = fcCurrencies
    if (cCur !== fCur) {
      const p = partsOf(cCur, fCur)
      if (p.both.size > 0) {
        const c = p.compSide(p.both)
        const f = p.fcSide(p.both)
        const mix = mixOf(src, r.compRow, c, f)
        if (mix)
          moved = [
            {
              positionId,
              comparison: c,
              forecast: { ...f, mix, planRates: record(months, planRateIn(fCur)) },
            },
            ...p.oneSided(),
          ]
      }
    }
  }
  if (moved) for (const seat of moved) seats.push(seat)
  else
    for (const currency of [...currencies].sort()) {
      const p = partsOf(currency, currency)
      if (p.both.size > 0) {
        const c = p.compSide(p.both)
        const f = p.fcSide(p.both)
        const mix = mixOf(src, r.compRow, c, f)
        seats.push({ positionId, comparison: c, forecast: mix ? { ...f, mix } : f })
      }
      for (const seat of p.oneSided()) seats.push(seat)
    }

  // The seat's vacancy allowance, by currency: in the comparison's total, out in the attrition step.
  if (comp.inScope) {
    const currenciesWithAllowance = groups.allowanceCurrencies.get(positionId) ?? []
    for (const currency of currenciesWithAllowance) {
      const byMonth = groups.allowances.get(`${positionId}${SEP}${currency}`) as ByMonth
      const a = allowanceDrivers(byMonth, months, comp, currency, (m) => planRate(currency, m) ?? 1)
      seats.push({ positionId, comparison: a, forecast: { ...a, retention: record(months, () => 0) } })
    }
  }
  return seats
}

/** Cohort seats: a unit's modeled exits and backfills in one currency, in the attrition step. */
function cohortSeats(src: SeatSource, cohortLines: readonly CohortLine[], scope: OrgMatch): BridgeSeat[] {
  const { months, planRate, asOf } = src
  const seats: BridgeSeat[] = []
  const cohorts = new Map<string, { unit: string; currency: string; lines: CohortLine[] }>()
  for (const l of cohortLines) {
    let c = cohorts.get(l.cohort.key)
    if (!c) {
      c = { unit: l.cohort.businessUnit, currency: l.cohort.currency, lines: [] }
      cohorts.set(l.cohort.key, c)
    }
    c.lines.push(l)
  }
  for (const key of [...cohorts.keys()].sort()) {
    const c = cohorts.get(key)!
    const place: SeatPlace = {
      positionId: null,
      managerPositionId: null,
      businessUnit: c.unit,
      department: null,
      costCenter: null,
    }
    if (!scope(place, asOf)) continue
    const byMonth = new Map<Month, CohortLine[]>()
    for (const l of c.lines) {
      const list = byMonth.get(l.month)
      if (list) list.push(l)
      else byMonth.set(l.month, [l])
    }
    // A reference of 12 local a year makes `active` the month's recurring local amount itself.
    const base: SeatDrivers = {
      active: record(months, (m) => {
        let r = 0
        for (const l of byMonth.get(m) ?? []) r += recurringOf(l)
        return r
      }),
      exists: true,
      retention: record(months, () => 1),
      level: LEVELS[0],
      location: '',
      fte: 1,
      currency: c.currency,
      payRate: 12,
      basis: 'band',
      bonusTarget: 0,
      bonusFunding: 1,
      burden: [],
      benefits: 0,
      oneTime: record(months, (m) => {
        let o = 0
        for (const l of byMonth.get(m) ?? []) o += l.local.oneTime
        return o
      }),
      inScope: true,
      rates: record(months, (m) => byMonth.get(m)?.[0]?.rate ?? 1),
    }
    const plan = record(months, (m) => planRate(c.currency, m) ?? byMonth.get(m)?.[0]?.rate ?? 1)
    seats.push({
      positionId: key,
      comparison: { ...base, retention: record(months, () => 0), rates: plan },
      forecast: base,
    })
  }
  return seats
}

/**
 * Both sides' drivers for every seat in the scope on either side, from the comparison's lines and the
 * forecast (see the module comment), sorted by seat key. Pricing every seat with no driver from the
 * forecast gives the comparison version's loaded cost in scope, its vacancy allowance included; with
 * every driver, the forecast lines' loaded cost in scope.
 */
export function bridgeSeats(input: BridgeSeatsInput): BridgeSeat[] {
  const { comparison, forecast, scope, months } = input
  const inWindow = new Set(months)
  const src = seatSource(comparison, input.positions, months, forecast.asOf)
  const seatLines: PlanLine[] = []
  const cohortLines: CohortLine[] = []
  for (const l of forecast.lines) {
    if (!inWindow.has(l.month)) continue
    if (isCohortLine(l)) cohortLines.push(l)
    else if (l.positionId) seatLines.push(l)
  }
  const fcLines = groupLines(seatLines, seatKeyOf)
  const fcMonths = monthsWithLines(fcLines)

  const seats: BridgeSeat[] = []
  const positionIds = new Set([
    ...src.compMonths.keys(),
    ...fcMonths.keys(),
    ...src.groups.allowanceCurrencies.keys(),
  ])
  for (const positionId of [...positionIds].sort()) {
    const r = seatRows(src, positionId)
    const comp = sideRowOf(r.compRow, src.lockDate, scope)
    const fc = sideRowOf(r.fcRow, src.asOf, scope)
    if (!comp.inScope && !fc.inScope) continue
    const fm = fcMonths.get(positionId) ?? NO_MONTHS
    for (const seat of positionSeats(src, positionId, r, comp, fc, fm, (currency) =>
      fcLines.get(`${positionId}${SEP}${currency}`),
    ))
      seats.push(seat)
  }
  for (const seat of cohortSeats(src, cohortLines, scope)) seats.push(seat)
  return seats
}

/** What `scopedBridgeSeats` reads. */
export interface ScopedSeatsInput {
  comparison: LockedVersion
  /**
   * The forecast's seat lines of every position (no cohort lines), any months: the same array for
   * every scope, so each position's seats are built once and shared.
   */
  seatLines: readonly PlanLine[]
  /** The cohort lines of the scope's forecast side. */
  cohortLines: readonly CohortLine[]
  /** The forecast's as-of date. */
  asOf: ISODate
  positions: readonly PositionRow[]
  months: readonly Month[]
  /** The positions whose forecast lines are on the forecast side. */
  forecastHas: (positionId: string) => boolean
  scope: OrgMatch
}

/** A forecast's seat lines grouped once per comparison window. */
interface ForecastIndex {
  lines: Map<string, ByMonth>
  months: Map<string, Map<Month, Set<string>>>
  /** Every position either side has a line or an allowance of, sorted. */
  positionIds: string[]
  /** Each position's rows and its seats by which sides take it: `<comparison><forecast><lines>`. */
  seats: Map<string, { rows: SeatRows; byFlags: Map<string, BridgeSeat[]> }>
}

/** By the comparison itself (its lines, rates and lock day), the seat lines and the positions. */
const forecastIndexMemo = new WeakMap<
  LockedVersion,
  WeakMap<readonly PlanLine[], WeakMap<readonly PositionRow[], Map<string, ForecastIndex>>>
>()

/**
 * `bridgeSeats` for a forecast whose seat lines are kept by the caller and a scope given by which
 * positions' forecast lines count (`forecastHas`): the same seats, in the same order, as
 * `bridgeSeats` gives for the forecast lines of those positions plus `cohortLines`. A position's seats
 * read only its own lines and rows and whether each side takes it, so they are built once per
 * comparison, seat lines, positions and window and shared by every scope (callers only read them).
 * An addition to the contract.
 */
export function scopedBridgeSeats(input: ScopedSeatsInput): BridgeSeat[] {
  const { comparison, scope, months } = input
  const src = seatSource(comparison, input.positions, months, input.asOf)
  let byLines = forecastIndexMemo.get(comparison)
  if (!byLines) {
    byLines = new WeakMap()
    forecastIndexMemo.set(comparison, byLines)
  }
  let byPositions = byLines.get(input.seatLines)
  if (!byPositions) {
    byPositions = new WeakMap()
    byLines.set(input.seatLines, byPositions)
  }
  let byKey = byPositions.get(input.positions)
  if (!byKey) {
    byKey = new Map()
    byPositions.set(input.positions, byKey)
  }
  const key = `${months.join(',')}|${input.asOf}`
  let index = byKey.get(key)
  if (!index) {
    const inWindow = new Set(months)
    const lines = groupLines(
      input.seatLines.filter((l) => inWindow.has(l.month) && l.positionId !== '' && !isCohortLine(l)),
      seatKeyOf,
    )
    const fcMonths = monthsWithLines(lines)
    index = {
      lines,
      months: fcMonths,
      positionIds: [
        ...new Set([...src.compMonths.keys(), ...fcMonths.keys(), ...src.groups.allowanceCurrencies.keys()]),
      ].sort(),
      seats: new Map(),
    }
    if (byKey.size > 16) byKey.clear()
    byKey.set(key, index)
  }
  const idx = index
  const seats: BridgeSeat[] = []
  for (const positionId of idx.positionIds) {
    const inComparison = src.compMonths.has(positionId) || src.groups.allowanceCurrencies.has(positionId)
    const hasForecast = idx.months.has(positionId) && input.forecastHas(positionId)
    if (!inComparison && !hasForecast) continue
    let entry = idx.seats.get(positionId)
    if (!entry) {
      entry = { rows: seatRows(src, positionId), byFlags: new Map() }
      idx.seats.set(positionId, entry)
    }
    const comp = sideRowOf(entry.rows.compRow, src.lockDate, scope)
    const fc = sideRowOf(entry.rows.fcRow, src.asOf, scope)
    if (!comp.inScope && !fc.inScope) continue
    const flags = `${comp.inScope ? 1 : 0}${fc.inScope ? 1 : 0}${hasForecast ? 1 : 0}`
    let built = entry.byFlags.get(flags)
    if (!built) {
      built = positionSeats(
        src,
        positionId,
        entry.rows,
        comp,
        fc,
        hasForecast ? (idx.months.get(positionId) ?? NO_MONTHS) : NO_MONTHS,
        (currency) => (hasForecast ? idx.lines.get(`${positionId}${SEP}${currency}`) : NO_LINES),
      )
      entry.byFlags.set(flags, built)
    }
    for (const seat of built) seats.push(seat)
  }
  const inWindow = new Set(months)
  for (const seat of cohortSeats(
    src,
    input.cohortLines.filter((l) => inWindow.has(l.month)),
    scope,
  ))
    seats.push(seat)
  return seats
}
