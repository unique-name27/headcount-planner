/**
 * Cost per position (docs/PLAN.md 6.3). Annual amounts in local currency, then monthly USD. Pure;
 * engines round nothing (only display rounds). Built by engines A in M1.
 *
 * - Base: Filled = the holder's FTE-equivalent HRIS rate × FTE (0.6 FTE at €100,000 = €60,000). Open
 *   and Planned = band midpoint × FTE, or `offerBase` × FTE once an offer is accepted (basis
 *   'offer'). An accepted offer is costed from `reqs.startDate`, never from the position's startDate.
 * - Bonus = base × target % × funding %. A comp row's `targetBonusPct` overrides the level's target.
 * - Burden = Σ over components of rate × min(base + bonus, cap); the cap is not scaled by FTE.
 * - Benefits = the country's amount a head (not scaled by FTE).
 * - Equity = level amount × FTE, USD, shown only "incl. SBC".
 * - Merit runs from the merit date for anyone started by the cutoff, with bonus and burden following,
 *   unless the latest comp row on or before the month is on or after the merit date. Open and Planned
 *   seats step to the next year's band on the merit date instead.
 * - Promotion pool: a % uplift on Filled base from its date, by org.
 * - One-time items book whole in their month: sign-on and relocation in the start month, the agency
 *   fee in the offer-accepted month, severance (the country's months × the seat's monthly local base
 *   on its last day) in the month containing endDate + 1 day. A pending elimination books nothing.
 * - Monthly USD = [(base + bonus + burden + benefits) ÷ 12 × active fraction + one-time] × the line's
 *   rate + equity ÷ 12 × active fraction. Loaded cost excludes the equity term.
 * - Unpaid leave sets base, bonus, burden, benefits and equity to 0 for the month and never changes
 *   who is costed (docs/PLAN.md 6.1, change C26).
 *
 * Readings kept here (engines A, M1):
 *  - "As known on the as-of date" (LineContextInput.asOf): an assignment is known when it starts on
 *    or before the as-of date (a later start is an accepted offer, costed through its req); a req is
 *    known when it was opened by then, and its offer only when it was accepted by then (a req closed
 *    after the as-of date reads open); an approved Backfill is known when its last approving step
 *    (else its `updatedAt`) is on or before it. Position rows and comp rows are plan data and are
 *    read whatever their dates (a known future exit, an approved elimination, a future raise). A lock
 *    computed "as of" its date passes the datasets as they stood then.
 *  - A segment is priced on its last active day in the month: the row in effect then (level,
 *    location, FTE, org) and the HRIS rate in effect then (so a merit or promotion dated the 1st
 *    prices that whole month).
 *  - The band year of a month is the fiscal year of the latest merit date on or before the month's
 *    first day (the fiscal year of the month itself with no merit rows); a version without that year's
 *    band reads its own fiscal year's. Bonus funding reads the month's fiscal year, else the version's.
 *  - A Filled seat whose holder has no comp row is costed at band (basis 'band'), and an accepted
 *    offer with no `offerBase` too; their lines keep the holder's employee ID or the req ID (M1
 *    fix-up, so the forecast keeps them: lead decision D-PREHIRE). Only a band run of an Open or
 *    Planned seat has holderId null.
 *  - One-time amounts from a req (sign-on, relocation, agency fee) go on the offer's line in their
 *    month, else on the line of the holder who took the offer over, else on a line of their own
 *    (basis 'offer', holderId the req, active 0). Severance goes on its holder's line in the month it
 *    books, else on a line of its own (basis 'hris', holderId the last holder, active 0). Severance is
 *    booked for seats eliminated with endReason Eliminated (or blank), never Traded or Transferred.
 *  - A zero-amount line whose currency has no rate in the month carries rate 0 (nothing to convert).
 *  - An Eliminated row ends the seat from its endDate + 1 (15.1 R34, lead decision D-ELIM): the
 *    holder's assignment is clipped at the last day (versions.ts `clipAtElimination`), so nothing is
 *    paid after it even while HRIS still shows the assignment, and severance books once.
 *  - The vacancy allowance (15.2 C31, lead decision D-VAC): plan versions (a context on plan rates)
 *    carry, for each seat, month and currency, an allowance line of −vacancyFactor (the seat's org on
 *    the month's last day) × the recurring cost (base + bonus + burden + benefits, not one-time) of
 *    its 'hris' and 'offer' lines; band seats carry none. The forecast (actual and forecast rates)
 *    carries none. A seat line's loaded cost is unchanged; a version's Σ loaded includes the
 *    allowance.
 */
import { fiscalYearOf, monthEnd, monthKey, monthRange, monthStart } from '@/data/fiscal'
import {
  APPROVED_REQUEST_STATES,
  type AssumptionRow,
  type CompRow,
  type FiscalYear,
  type ISODate,
  type Level,
  type Month,
  type PositionRow,
  type ReqRow,
  siteByLocation,
  type WorkerRow,
} from '@/data/schema'
import { addDays, dateOf } from '@/lib/dates'
import type {
  Assignment,
  CostBasis,
  FxTable,
  HcRequest,
  MonthClose,
  PlanLine,
  Position,
  PositionStatus,
  Version,
} from '../types'
import {
  type AssumptionLookup,
  assumptionLookup,
  meritRules,
  type OrgPath,
  promotionRules,
  type StandardLoads,
  seatLoads,
  standardLoads,
} from './assumptions'
import type { Loads } from './band'
import { rateOf as tableRate } from './fx'
import { isActiveOn, toAssignments } from './heads'
import { activeFraction } from './proration'
import {
  clipAtElimination,
  rowOn,
  type SeatDetail,
  type SeatHistory,
  type SeatOffer,
  seatDetailOn,
  seatOffers,
  toPosition,
} from './versions'

/* ───────────── annual amounts ───────────── */

/** One burden component: a rate on base + bonus up to a cap in local currency (null: uncapped). */
export interface BurdenComponent {
  component: string
  rate: number
  /** Not scaled by FTE (fixture C2). */
  cap: number | null
}

/** What an annual cost is built from, all in the seat's local currency. */
export interface CostInput {
  /** The FTE-equivalent annual rate: the HRIS base, the offer's base or the band midpoint. */
  rate: number
  fte: number
  /** Target bonus as a fraction of base (0.1 = 10%). */
  bonusTarget: number
  /** Bonus funding as a fraction (1 = 100%). */
  bonusFunding: number
  burden: readonly BurdenComponent[]
  /** A head's benefits for a year, not scaled by FTE. */
  benefits: number
}

/** Annual local amounts, before proration and FX. */
export interface AnnualLocal {
  base: number
  bonus: number
  burden: number
  benefits: number
}

/**
 * Annual local cost: base = rate × fte; bonus = base × bonusTarget × bonusFunding; burden = Σ rate ×
 * min(base + bonus, cap); benefits as given.
 *
 * Fixtures (cost.test.ts): C1 (€110,000, 10% × 100%, 21% capped €90,600: base 110,000, bonus 11,000,
 * burden 19,026), C2 (0.6 FTE at €100,000: base 60,000, burden 13,860 with the cap unscaled).
 */
export function annualLocal(input: CostInput): AnnualLocal {
  const base = input.rate * input.fte
  const bonus = base * input.bonusTarget * input.bonusFunding
  let burden = 0
  for (const c of input.burden)
    burden += c.rate * (c.cap == null ? base + bonus : Math.min(base + bonus, c.cap))
  return { base, bonus, burden, benefits: input.benefits }
}

/* ───────────── HRIS pay, merit and promotion ───────────── */

/** A fiscal year's merit (assumption table `merit`): from `date`, `pct`, for anyone started by `cutoff`. */
export interface MeritRule {
  fiscalYear: FiscalYear
  date: ISODate
  pct: number
  cutoff: ISODate
}

/** A fiscal year's promotion pool for an org (table `promotionPool`): an uplift on Filled base from `date`. */
export interface PromotionRule {
  fiscalYear: FiscalYear
  date: ISODate
  pct: number
}

export interface HrisRateInput {
  /** One employee's comp rows, any order. */
  comp: readonly CompRow[]
  hireDate: ISODate
  /** The day the rate is wanted for. */
  on: ISODate
  merit: readonly MeritRule[]
  promotion: readonly PromotionRule[]
  /** The currency of a comp row with a blank currency (the location's). */
  defaultCurrency: string
}

/** A holder's FTE-equivalent rate on a day, with what made it. */
export interface HrisRate {
  rate: number
  currency: string
  /** The comp row's own target bonus, which overrides the level's; null when blank. */
  targetBonusPct: number | null
  /** The comp row in effect: the latest with effectiveDate on or before `on`. */
  row: CompRow
  /** The merit factor applied (1.035 for 3.5%, 1 for none). */
  merit: number
  /** The promotion-pool factor applied (1.01 for 1%, 1 for none). */
  promotion: number
}

/**
 * The FTE-equivalent annual rate in effect on `on`: the latest comp row on or before it, × (1 + merit
 * pct) for each merit whose date is on or before `on`, when the employee was hired by its cutoff and
 * the row is dated before the merit date, × (1 + promotion pct) for each promotion pool in effect.
 * Null when no comp row is in effect.
 *
 * A promotion pool is in effect from its date, for a comp row dated before it (a later row already
 * carries it, as with merit). Ties between rows with one effective date go to the later row.
 *
 * Fixture: C3 (hired before the cutoff, latest row 1 Mar 2027: FY28 merit from 1 Apr 2027; a row
 * dated 1 Apr 2027: none; hired after the cutoff: none).
 */
export function hrisRate(input: HrisRateInput): HrisRate | null {
  let row: CompRow | null = null
  for (const c of input.comp) {
    if (c.effectiveDate <= input.on && (row === null || c.effectiveDate >= row.effectiveDate)) row = c
  }
  if (row === null) return null
  let merit = 1
  for (const m of input.merit) {
    if (m.date <= input.on && input.hireDate <= m.cutoff && row.effectiveDate < m.date) merit *= 1 + m.pct
  }
  let promotion = 1
  for (const p of input.promotion) {
    if (p.date <= input.on && row.effectiveDate < p.date) promotion *= 1 + p.pct
  }
  return {
    rate: row.baseSalary * merit * promotion,
    currency: row.currency || input.defaultCurrency,
    targetBonusPct: row.targetBonusPct ?? null,
    row,
    merit,
    promotion,
  }
}

/* ───────────── one-time items ───────────── */

export type OneTimeKind = 'signOn' | 'relocation' | 'agencyFee' | 'severance'

/** A one-time amount booked whole in one month. */
export interface OneTimeItem {
  kind: OneTimeKind
  positionId: string
  month: Month
  amountLocal: number
  currency: string
  /** The req (sign-on, relocation, agency fee) or the eliminated seat's last holder (severance). */
  sourceId: string
}

export interface SeveranceInput {
  positionId: string
  /** The seat's last day from its approved Eliminated row; null when no elimination is approved. */
  endDate: ISODate | null
  /** The seat was Filled on its last day (only eliminated Filled seats book severance). */
  filledOnLastDay: boolean
  /** The holder's annual local base on the last day (rate × FTE). */
  annualBaseLocal: number
  currency: string
  /** The country's severance months (table `severance`). */
  months: number
  /** The last holder's employee ID. */
  holderId: string
}

/**
 * Severance: months × annualBaseLocal ÷ 12, booked in the month containing endDate + 1 day. Null for
 * a pending elimination (no endDate), a seat not Filled on its last day, or 0 months.
 *
 * Fixture: C4 (1.0 FTE at €120,000, 3 months: last day 31 Dec 2026 books €30,000 in 2027-01; last day
 * 15 Dec 2026 books it in 2026-12).
 */
export function severanceOf(input: SeveranceInput): OneTimeItem | null {
  if (!input.endDate || !input.filledOnLastDay || !(input.months > 0)) return null
  return {
    kind: 'severance',
    positionId: input.positionId,
    month: monthKey(addDays(input.endDate, 1)),
    amountLocal: (input.months * input.annualBaseLocal) / 12,
    currency: input.currency,
    sourceId: input.holderId,
  }
}

/* ───────────── lines ───────────── */

/** Which rates a set of lines reads. */
export interface LineRates {
  table: FxTable
  /** 'plan': the plan set for every month (plan lines). 'actual-forecast': actual for closed months, forecast after (forecast lines). */
  use: 'plan' | 'actual-forecast'
  /** The last closed month, for 'actual-forecast'. */
  closedThrough: Month | null
}

/** Everything a version's lines are computed from (Working live, or a lock "as of" its date). */
export interface LineContextInput {
  version: Pick<Version, 'versionId' | 'name' | 'fiscalYear' | 'grid' | 'proration'>
  /** The as-of date: assignments, reqs and requests are read as known on it. */
  asOf: ISODate
  /** Every position row (imported plus overlay). */
  positions: readonly PositionRow[]
  workers: readonly WorkerRow[]
  comp: readonly CompRow[]
  reqs: readonly ReqRow[]
  /**
   * Requests. Only approved Backfills are read (a reopened seat takes its planned start from its
   * replacement, 6.5); a pending request never moves a line (a pending elimination books nothing).
   */
  requests: readonly HcRequest[]
  /** Assumption rows; the context keeps the version's own (by ID or name). */
  assumptions: readonly AssumptionRow[]
  rates: LineRates
  /** Closes: a closed month's leave status comes from its close, an open month's from the workers row. */
  closes?: readonly MonthClose[]
  /**
   * Cost Employee assignments that start after `asOf` too (a pre-hire in HRIS, costed at HRIS pay
   * from its start): the forecast's reading (lead decision D-PREHIRE). Default false: in a plan
   * version a later start is an accepted offer, costed through its req. An addition to the contract.
   */
  futureAssignments?: boolean
  /**
   * Carry the vacancy allowance (15.2 C31): plan versions only. Default: true when `rates.use` is
   * 'plan' (Budget, reforecasts and Working), false for forecast lines. An addition to the contract.
   */
  vacancyAllowance?: boolean
}

/** The lookups `monthLine` and `positionLines` read, built once per version by `lineContext`. */
export interface LineContext {
  readonly version: LineContextInput['version']
  readonly asOf: ISODate
  readonly lookup: AssumptionLookup
  /** Every positionId with a row, in the order of the input. */
  readonly positionIds: readonly string[]
  /** The seat's rows, oldest effectiveDate first. */
  rowsOf(positionId: string): readonly PositionRow[]
  /** Employee assignments on the seat, oldest first. */
  assignmentsOf(positionId: string): readonly Assignment[]
  /** The worker row behind an assignment (hire date, leave). */
  workerOf(employeeId: string): WorkerRow | null
  compOf(employeeId: string): readonly CompRow[]
  reqsOf(positionId: string): readonly ReqRow[]
  /** Approved Backfill requests naming the seat. */
  backfillsOf(positionId: string): readonly HcRequest[]
  /** On unpaid leave in the month (pay lines 0). */
  unpaidLeave(employeeId: string, month: Month): boolean
  /** USD per 1 local for the month under `rates.use`; 1 for USD. Throws when a needed rate is missing. */
  rateOf(currency: string, month: Month): number
  /** The lines carry the vacancy allowance (plan versions, 15.2 C31). An addition to the contract. */
  readonly vacancyAllowance?: boolean
}

/**
 * A req as known on `asOf` (see the module comment): null when opened after it; its offer cleared
 * when accepted after it; open when closed after it; Started read as Offer accepted when it starts
 * after it. An addition to the contract (close.ts and the forecast read reqs the same way).
 */
export function reqAsOf(req: ReqRow, asOf: ISODate): ReqRow | null {
  if (req.openedDate > asOf) return null
  let r = req
  if (r.offerAcceptedDate && r.offerAcceptedDate > asOf) {
    r = {
      ...r,
      stage: 'Interviewing',
      offerAcceptedDate: null,
      startDate: null,
      offerBase: null,
      offerCurrency: null,
      signOnBonus: null,
      relocation: null,
      agencyFee: null,
    }
  } else if (r.stage === 'Started' && r.startDate && r.startDate > asOf) {
    r = { ...r, stage: 'Offer accepted' }
  }
  if (r.closedDate && r.closedDate > asOf) {
    r = {
      ...r,
      closedDate: null,
      status: r.status === 'Filled' || r.status === 'Cancelled' ? 'Open' : r.status,
    }
  }
  return r
}

/** The day a request was approved: its last approving step, else its `updatedAt`. */
function approvedOn(q: HcRequest): ISODate {
  let at: string | null = null
  for (const s of q.steps) {
    if ((s.decision === 'Approved' || s.decision === 'Approved with changes') && s.at && (!at || s.at > at))
      at = s.at
  }
  return dateOf(at ?? q.updatedAt)
}

const EMPTY: readonly never[] = []

/** Builds the lookups once (maps by positionId and employeeId). Fixtures: C1 to C4, H3. */
export function lineContext(input: LineContextInput): LineContext {
  const { version, asOf } = input
  const lookup = assumptionLookup(input.assumptions, version)

  const rows = new Map<string, PositionRow[]>()
  for (const r of input.positions) {
    const list = rows.get(r.positionId)
    if (list) list.push(r)
    else rows.set(r.positionId, [r])
  }
  for (const list of rows.values())
    list.sort((a, b) => (a.effectiveDate < b.effectiveDate ? -1 : a.effectiveDate > b.effectiveDate ? 1 : 0))

  const assignments = new Map<string, Assignment[]>()
  const workers = new Map<string, { row: WorkerRow; start: ISODate }>()
  const all = toAssignments(input.workers)
  input.workers.forEach((w, i) => {
    const a = all[i]
    const seen = workers.get(w.employeeId)
    if (!seen || a.start >= seen.start) workers.set(w.employeeId, { row: w, start: a.start })
    if (a.workerType !== 'Employee' || !a.positionId) return
    if (a.start > asOf && !input.futureAssignments) return
    const list = assignments.get(a.positionId)
    if (list) list.push(a)
    else assignments.set(a.positionId, [a])
  })
  // An Eliminated row ends the seat from its last day + 1, whatever HRIS still shows (R34).
  for (const [id, list] of assignments) {
    const clipped = clipAtElimination(list, (p) => rows.get(p) ?? EMPTY)
    clipped.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0))
    assignments.set(id, clipped)
  }

  const comp = new Map<string, CompRow[]>()
  for (const c of input.comp) {
    const list = comp.get(c.employeeId)
    if (list) list.push(c)
    else comp.set(c.employeeId, [c])
  }

  const reqs = new Map<string, ReqRow[]>()
  for (const raw of input.reqs) {
    if (!raw.positionId) continue
    const r = reqAsOf(raw, asOf)
    if (!r) continue
    const list = reqs.get(raw.positionId)
    if (list) list.push(r)
    else reqs.set(raw.positionId, [r])
  }

  const backfills = new Map<string, HcRequest[]>()
  for (const q of input.requests) {
    if (q.type !== 'Backfill' || !q.positionId || !APPROVED_REQUEST_STATES.includes(q.state)) continue
    if (approvedOn(q) > asOf) continue
    const list = backfills.get(q.positionId)
    if (list) list.push(q)
    else backfills.set(q.positionId, [q])
  }

  const unpaidClosed = new Map<Month, Set<string>>()
  for (const close of input.closes ?? []) {
    // Read from the columns: the leave and the employee of each stored line.
    const set = new Set<string>()
    const t = close.lines
    const unpaid = t.leave.dict.indexOf('unpaid')
    if (unpaid >= 0)
      for (let i = 0; i < t.length; i++)
        if (t.leave.codes[i] === unpaid) set.add(t.employeeId.dict[t.employeeId.codes[i]])
    unpaidClosed.set(close.month, set)
  }

  const { table, use, closedThrough } = input.rates
  // Rates by currency and month, read once each (lines ask for the same few many times).
  const rateCache = new Map<string, Map<Month, number>>()
  return {
    version,
    asOf,
    lookup,
    vacancyAllowance: input.vacancyAllowance ?? use === 'plan',
    positionIds: [...rows.keys()],
    rowsOf: (id) => rows.get(id) ?? EMPTY,
    assignmentsOf: (id) => assignments.get(id) ?? EMPTY,
    workerOf: (id) => workers.get(id)?.row ?? null,
    compOf: (id) => comp.get(id) ?? EMPTY,
    reqsOf: (id) => reqs.get(id) ?? EMPTY,
    backfillsOf: (id) => backfills.get(id) ?? EMPTY,
    unpaidLeave(employeeId, month) {
      const closed = unpaidClosed.get(month)
      if (closed) return closed.has(employeeId)
      const w = workers.get(employeeId)?.row
      return w?.onLeave === true && w.leavePaid === false
    },
    rateOf(currency, month) {
      if (currency === 'USD') return 1
      let byMonth = rateCache.get(currency)
      const hit = byMonth?.get(month)
      if (hit !== undefined) return hit
      const set = use === 'plan' ? 'plan' : closedThrough && month <= closedThrough ? 'actual' : 'forecast'
      const rate = tableRate(table, currency, set, month)
      if (rate == null) throw new Error(`No ${set} rate for ${currency} in ${month}.`)
      if (!byMonth) {
        byMonth = new Map()
        rateCache.set(currency, byMonth)
      }
      byMonth.set(month, rate)
      return rate
    },
  }
}

/* ───────────── the lines engine ───────────── */

/**
 * What a position row gives every line priced on it, read once per row: its org, site, country and
 * `Position`, its org's merit and promotion rules and vacancy factor, and its standard loads and band
 * by month and by the fiscal year they are read for (the values `standard` and `band` give for the
 * row's level, country or location and org; rows are plain data and never change).
 */
interface RowInfo {
  org: OrgPath
  orgKey: string
  site: ReturnType<typeof siteByLocation.get>
  country: string
  position: Position
  merit: readonly MeritRule[]
  promotion: readonly PromotionRule[]
  vacancy: number | undefined
  std: Map<Month, StandardLoads>
  stdByYear: Map<FiscalYear, StandardLoads>
  band: Map<Month, Loads | null>
  bandByYear: Map<FiscalYear, Loads | null>
}

/** Caches per context: loads, rules and seat histories. Built on first use, so any LineContext works. */
interface Internals {
  rowInfo(row: PositionRow): RowInfo
  /** `standard` for a row's level, country and org in a month. */
  standardOf(row: PositionRow, info: RowInfo, month: Month): StandardLoads
  /** `band` for a row's level, location and org in a month. */
  bandOf(row: PositionRow, info: RowInfo, month: Month): Loads | null
  /** `vacancyFactor` of a row's org. */
  vacancyOf(info: RowInfo): number
  history(positionId: string): SeatHistory
  standard(level: PositionRow['level'], country: string, month: Month, org: OrgPath): StandardLoads
  band(level: PositionRow['level'], location: string, month: Month, org: OrgPath): Loads | null
  merit(org: OrgPath): readonly MeritRule[]
  promotion(org: OrgPath): readonly PromotionRule[]
  severanceMonths(country: string, org: OrgPath): number
  vacancyFactor(org: OrgPath): number
}

const internalsOf = new WeakMap<LineContext, Internals>()

const orgKey = (org: OrgPath): string => `${org.businessUnit}\u0000${org.department ?? ''}`

function internals(ctx: LineContext): Internals {
  let found = internalsOf.get(ctx)
  if (found) return found
  const { lookup, version } = ctx
  const histories = new Map<string, SeatHistory>()
  const standards = new Map<string, StandardLoads>()
  const bands = new Map<string, Loads | null>()
  const merits = new Map<string, readonly MeritRule[]>()
  const promotions = new Map<string, readonly PromotionRule[]>()
  const factors = new Map<string, number>()
  const companyMerit = meritRules(lookup, null)
  const bandYears = new Map<Month, FiscalYear>()
  const bandYear = (m: Month): FiscalYear => {
    let fy = bandYears.get(m)
    if (!fy) {
      const first = monthStart(m)
      let latest: FiscalYear | null = null
      for (const r of companyMerit) if (r.date <= first) latest = r.fiscalYear
      fy = latest ?? fiscalYearOf(m)
      bandYears.set(m, fy)
    }
    return fy
  }
  /** The fiscal year of each month, read once. */
  const monthYears = new Map<Month, FiscalYear>()
  const monthYear = (m: Month): FiscalYear => {
    let fy = monthYears.get(m)
    if (!fy) {
      fy = fiscalYearOf(m)
      monthYears.set(m, fy)
    }
    return fy
  }
  /** Whether an org (by `orgKey`) sets bonus funding for a fiscal year. */
  const funded = new Map<string, Map<FiscalYear, boolean>>()
  /** The fiscal year a month's standard loads are read for: its own when the org funds it, else the version's. */
  const standardYear = (org: OrgPath, key: string, month: Month): FiscalYear => {
    const fy = monthYear(month)
    let byYear = funded.get(key)
    if (!byYear) {
      byYear = new Map()
      funded.set(key, byYear)
    }
    let has = byYear.get(fy)
    if (has === undefined) {
      has = lookup.get('bonusFunding', [fy], org) != null
      byYear.set(fy, has)
    }
    return has ? fy : version.fiscalYear
  }
  const standardIn = (level: Level, country: string, fy: FiscalYear, org: OrgPath, key: string) => {
    const k = `${level}\u0000${country}\u0000${fy}\u0000${key}`
    let s = standards.get(k)
    if (!s) {
      s = standardLoads(level, country, fy, org, lookup)
      standards.set(k, s)
    }
    return s
  }
  const bandIn = (level: Level, location: string, fy: FiscalYear, org: OrgPath, key: string) => {
    const k = `${level}\u0000${location}\u0000${fy}\u0000${key}`
    let b = bands.get(k)
    if (b === undefined) {
      b =
        seatLoads({ level, location }, fy, org, lookup) ??
        (fy === version.fiscalYear ? null : seatLoads({ level, location }, version.fiscalYear, org, lookup))
      bands.set(k, b)
    }
    return b
  }
  const rowInfos = new Map<PositionRow, RowInfo>()
  found = {
    rowInfo(row) {
      let info = rowInfos.get(row)
      if (!info) {
        const org = orgOf(row)
        const site = siteByLocation.get(row.location)
        info = {
          org,
          orgKey: orgKey(org),
          site,
          country: site?.country ?? row.location,
          position: toPosition(row),
          merit: this.merit(org),
          promotion: this.promotion(org),
          vacancy: undefined,
          std: new Map(),
          stdByYear: new Map(),
          band: new Map(),
          bandByYear: new Map(),
        }
        rowInfos.set(row, info)
      }
      return info
    },
    standardOf(row, info, month) {
      let s = info.std.get(month)
      if (!s) {
        const fy = standardYear(info.org, info.orgKey, month)
        s = info.stdByYear.get(fy)
        if (!s) {
          s = standardIn(row.level, info.country, fy, info.org, info.orgKey)
          info.stdByYear.set(fy, s)
        }
        info.std.set(month, s)
      }
      return s
    },
    bandOf(row, info, month) {
      let b = info.band.get(month)
      if (b === undefined) {
        const fy = bandYear(month)
        b = info.bandByYear.get(fy)
        if (b === undefined) {
          b = bandIn(row.level, row.location, fy, info.org, info.orgKey)
          info.bandByYear.set(fy, b)
        }
        info.band.set(month, b)
      }
      return b
    },
    vacancyOf(info) {
      info.vacancy ??= this.vacancyFactor(info.org)
      return info.vacancy
    },
    history(positionId) {
      let h = histories.get(positionId)
      if (!h) {
        h = {
          positionId,
          rows: ctx.rowsOf(positionId),
          assignments: ctx.assignmentsOf(positionId),
          reqs: ctx.reqsOf(positionId),
          backfills: ctx.backfillsOf(positionId),
        }
        histories.set(positionId, h)
      }
      return h
    },
    standard(level, country, month, org) {
      const key = orgKey(org)
      return standardIn(level, country, standardYear(org, key, month), org, key)
    },
    band(level, location, month, org) {
      return bandIn(level, location, bandYear(month), org, orgKey(org))
    },
    merit(org) {
      const key = orgKey(org)
      let r = merits.get(key)
      if (!r) {
        r = meritRules(lookup, org)
        merits.set(key, r)
      }
      return r
    },
    promotion(org) {
      const key = orgKey(org)
      let r = promotions.get(key)
      if (!r) {
        r = promotionRules(lookup, org)
        promotions.set(key, r)
      }
      return r
    },
    severanceMonths: (country, org) => lookup.num('severance', [country], org) ?? 0,
    vacancyFactor(org) {
      const key = orgKey(org)
      let f = factors.get(key)
      if (f === undefined) {
        f = lookup.num('vacancyFactor', ['*'], org, 0) ?? 0
        factors.set(key, f)
      }
      return f
    },
  }
  internalsOf.set(ctx, found)
  return found
}

/** A costed span of a seat: a holder, an accepted offer, or a run of band days. */
interface Span {
  basis: CostBasis
  holderId: string | null
  start: ISODate
  /** The last day, inclusive; null while it runs on. */
  end: ISODate | null
  assignment: Assignment | null
  offer: SeatOffer | null
}

/** What a seat does over a window: its costed spans and the days it exists. */
interface Timeline {
  spans: Span[]
  /** Intervals (both ends inclusive) in which the seat has a row that is not Eliminated, or a holder. */
  exists: [ISODate, ISODate][]
}

const dayBefore = (d: ISODate): ISODate => addDays(d, -1)
const dayAfter = (d: ISODate): ISODate => addDays(d, 1)

/** The seat's timeline from `from` to `to` (both inclusive). */
function timeline(h: SeatHistory, from: ISODate, to: ISODate): Timeline {
  const spans: Span[] = []
  for (const a of h.assignments) {
    if (a.workerType !== 'Employee' || a.start > to || (a.end != null && a.end < from)) continue
    spans.push({
      basis: 'hris',
      holderId: a.employeeId,
      start: a.start,
      end: a.end,
      assignment: a,
      offer: null,
    })
  }
  const offers = seatOffers(h)
  for (const o of offers) {
    const end = o.takerStart ? dayBefore(o.takerStart) : null
    if ((end != null && end < o.start) || o.start > to || (end != null && end < from)) continue
    const priced = o.req.offerBase != null
    spans.push({
      basis: priced ? 'offer' : 'band',
      holderId: o.req.reqId,
      start: o.start,
      end,
      assignment: null,
      offer: o,
    })
  }

  // Breakpoints: every day the seat's state can change.
  const points = new Set<ISODate>([from])
  const add = (d: ISODate | null | undefined) => {
    if (d && d > from && d <= to) points.add(d)
  }
  for (const r of h.rows) {
    add(r.effectiveDate)
    add(r.startDate)
    if (r.status === 'Eliminated' && r.endDate) add(dayAfter(r.endDate))
  }
  for (const a of h.assignments) {
    add(a.start)
    if (a.end) add(dayAfter(a.end))
  }
  for (const o of offers) {
    add(o.start)
    add(o.takerStart)
  }
  for (const r of h.reqs) {
    add(r.openedDate)
    add(r.targetStartDate)
  }
  for (const b of h.backfills) {
    add(b.startDate)
    add(dateOf(b.submittedAt || b.updatedAt))
  }
  const sorted = [...points].sort()
  const exists: [ISODate, ISODate][] = []
  let run: ISODate | null = null
  let existFrom: ISODate | null = null
  for (let i = 0; i < sorted.length; i++) {
    const t = sorted[i]
    const last = i + 1 < sorted.length ? dayBefore(sorted[i + 1]) : to
    const s = seatDetailOn(h, t)
    const band =
      s !== null &&
      (s.status === 'Open' || s.status === 'Planned') &&
      s.position.workerType === 'Employee' &&
      s.startFrom !== 'offer' &&
      s.plannedStart !== null &&
      s.plannedStart <= t
    if (band && run === null) run = t
    if (!band && run !== null) {
      spans.push({
        basis: 'band',
        holderId: null,
        start: run,
        end: dayBefore(t),
        assignment: null,
        offer: null,
      })
      run = null
    }
    const alive = s !== null && (s.status !== 'Eliminated' || s.holderIds.length > 0)
    if (alive && existFrom === null) existFrom = t
    if (!alive && existFrom !== null) {
      exists.push([existFrom, dayBefore(t)])
      existFrom = null
    }
    if (i + 1 === sorted.length) {
      if (run !== null)
        spans.push({ basis: 'band', holderId: null, start: run, end: null, assignment: null, offer: null })
      if (existFrom !== null) exists.push([existFrom, last])
    }
  }
  return { spans, exists }
}

/** A line before its rate: what `toLine` turns into a PlanLine. */
interface Draft {
  span: Span | null
  basis: CostBasis
  holderId: string | null
  fte: number
  active: number
  currency: string
  annual: AnnualLocal | null
  equityAnnualUsd: number
  unpaid: boolean
  oneTime: number
  heads: number
}

const overlaps = (start: ISODate, end: ISODate | null, from: ISODate, to: ISODate): boolean =>
  start <= to && (end === null || end >= from)

const orgOf = (row: PositionRow): OrgPath => ({
  businessUnit: row.businessUnit,
  department: row.department ?? null,
})

/** The lines of one seat in one month, from its timeline. */
function linesInMonth(
  h: SeatHistory,
  tl: Timeline,
  month: Month,
  versionId: string,
  proration: Version['proration'],
  ctx: LineContext,
  inner: Internals,
): PlanLine[] {
  const first = monthStart(month)
  const last = monthEnd(month)
  const firstRow = h.rows[0]
  if (!firstRow) return []
  const rowAt = (d: ISODate): PositionRow => rowOn(h.rows, d) ?? firstRow
  const drafts: Draft[] = []

  for (const span of tl.spans) {
    if (!overlaps(span.start, span.end, first, last)) continue
    const priceDay = span.end !== null && span.end < last ? span.end : last
    const row = rowAt(priceDay)
    const info = inner.rowInfo(row)
    const site = info.site
    const active = activeFraction(proration, month, span.start, span.end)
    const position = info.position
    if (span.basis === 'hris' && span.assignment) {
      const a = span.assignment
      const worker = ctx.workerOf(a.employeeId)
      const pay = hrisRate({
        comp: ctx.compOf(a.employeeId),
        hireDate: worker?.hireDate ?? a.start,
        on: priceDay,
        merit: info.merit,
        promotion: info.promotion,
        defaultCurrency: site?.currency ?? 'USD',
      })
      if (pay) {
        const std = inner.standardOf(row, info, month)
        drafts.push({
          span,
          basis: 'hris',
          holderId: a.employeeId,
          fte: a.fte,
          active,
          currency: pay.currency,
          annual: annualLocal({
            rate: pay.rate,
            fte: a.fte,
            bonusTarget: pay.targetBonusPct ?? std.bonusTarget,
            bonusFunding: std.bonusFunding,
            burden: std.burden,
            benefits: std.benefits,
          }),
          equityAnnualUsd: std.equityUsd * a.fte,
          unpaid: ctx.unpaidLeave(a.employeeId, month),
          oneTime: 0,
          heads: 0,
        })
        continue
      }
      // No comp row: costed at band (see the module comment).
      drafts.push(bandDraft(span, row, info, position.fte, month, active, inner))
      continue
    }
    if (span.basis === 'offer' && span.offer) {
      const req = span.offer.req
      const std = inner.standardOf(row, info, month)
      drafts.push({
        span,
        basis: 'offer',
        holderId: req.reqId,
        fte: position.fte,
        active,
        currency: req.offerCurrency || site?.currency || 'USD',
        annual: annualLocal({
          rate: req.offerBase ?? 0,
          fte: position.fte,
          bonusTarget: std.bonusTarget,
          bonusFunding: std.bonusFunding,
          burden: std.burden,
          benefits: std.benefits,
        }),
        equityAnnualUsd: std.equityUsd * position.fte,
        unpaid: false,
        oneTime: 0,
        heads: 0,
      })
      continue
    }
    drafts.push(bandDraft(span, row, info, position.fte, month, active, inner))
  }

  bookOneTime(h, month, drafts, ctx, inner)

  const exists = tl.exists.some(([s, e]) => s <= last && e >= first)
  if (drafts.length === 0) {
    if (!exists) return []
    const row = rowAt(last)
    drafts.push({
      span: null,
      basis: 'band',
      holderId: null,
      fte: toPosition(row).fte,
      active: 0,
      currency: siteByLocation.get(row.location)?.currency ?? 'USD',
      annual: null,
      equityAnnualUsd: 0,
      unpaid: false,
      oneTime: 0,
      heads: 0,
    })
  }

  // Status and heads at the month's end.
  const end: SeatDetail | null = seatDetailOn(h, last)
  const status: PositionStatus = end ? (end.planHead ? 'Filled' : end.status) : 'Open'
  if (end?.planHead) {
    const covering =
      drafts.find((d) => d.span?.assignment && isActiveOn(d.span.assignment, last)) ??
      drafts.find((d) => d.span && d.span.start <= last && (d.span.end === null || d.span.end >= last)) ??
      drafts[0]
    covering.heads = 1
  }

  const lines = drafts.map((d) => toLine(d, h.positionId, versionId, month, status, ctx))
  if (ctx.vacancyAllowance) {
    const factor = inner.vacancyOf(inner.rowInfo(rowAt(last)))
    if (factor !== 0) for (const l of allowanceLines(lines, factor)) lines.push(l)
  }
  return lines
}

/** Recurring local cost of a line: base + bonus + burden + benefits (no one-time). */
const recurringLocal = (l: PlanLine): number =>
  l.local.base + l.local.bonus + l.local.burden + l.local.benefits
const recurringUsd = (l: PlanLine): number => l.usd.base + l.usd.bonus + l.usd.burden + l.usd.benefits

/**
 * A seat's allowance lines for one month (15.2 C31): one a currency with filled-part cost, −factor ×
 * the recurring amounts of its 'hris' and 'offer' lines (band lines and one-time items carry none).
 */
function allowanceLines(lines: readonly PlanLine[], factor: number): PlanLine[] {
  const groups = new Map<string, PlanLine[]>()
  for (const l of lines) {
    if (l.basis === 'band') continue
    const list = groups.get(l.currency)
    if (list) list.push(l)
    else groups.set(l.currency, [l])
  }
  const out: PlanLine[] = []
  for (const [currency, group] of groups) {
    let local = 0
    let usd = 0
    for (const l of group) {
      local += recurringLocal(l)
      usd += recurringUsd(l)
    }
    if (local === 0 && usd === 0) continue
    // The rate of a line with an amount (a zero line can carry rate 0 when its month has no rate).
    const first = group.find((l) => recurringLocal(l) !== 0) ?? group[0]
    const vacancyUsd = -factor * usd
    out.push({
      positionId: first.positionId,
      versionId: first.versionId,
      month: first.month,
      holderId: null,
      status: first.status,
      heads: 0,
      fte: 0,
      active: 0,
      currency,
      rate: first.rate,
      local: { base: 0, bonus: 0, burden: 0, benefits: 0, oneTime: 0, vacancy: -factor * local },
      usd: {
        base: 0,
        bonus: 0,
        burden: 0,
        benefits: 0,
        oneTime: 0,
        vacancy: vacancyUsd,
        equity: 0,
        loaded: vacancyUsd,
      },
      basis: group.some((l) => l.basis === 'hris') ? 'hris' : 'offer',
    })
  }
  return out
}

/**
 * A plan version's vacancy allowance line (15.2 C31): every amount 0 but `vacancy` (and `loaded`).
 * An addition to the contract; the bridge prices these lines in its attrition step.
 */
export const isAllowanceLine = (l: PlanLine): boolean =>
  l.local.vacancy !== 0 &&
  l.heads === 0 &&
  l.active === 0 &&
  l.local.base === 0 &&
  l.local.bonus === 0 &&
  l.local.burden === 0 &&
  l.local.benefits === 0 &&
  l.local.oneTime === 0

/** A band-basis draft for a span (a band run, an offer with no offerBase, or a holder with no comp row). */
function bandDraft(
  span: Span,
  row: PositionRow,
  info: RowInfo,
  fte: number,
  month: Month,
  active: number,
  inner: Internals,
): Draft {
  const loads = inner.bandOf(row, info, month)
  const siteCurrency = info.site?.currency
  return {
    span,
    basis: 'band',
    // A band run has no holder; a holder with no comp row and an offer with no offerBase keep theirs.
    holderId: span.holderId,
    fte,
    active,
    currency: loads?.currency ?? siteCurrency ?? 'USD',
    annual: loads
      ? annualLocal({
          rate: loads.midpoint,
          fte,
          bonusTarget: loads.bonusTarget,
          bonusFunding: loads.bonusFunding,
          burden: loads.burden,
          benefits: loads.benefits,
        })
      : null,
    equityAnnualUsd: loads ? loads.equityUsd * fte : 0,
    unpaid: false,
    oneTime: 0,
    heads: 0,
  }
}

/** Adds a seat's one-time items booked in `month` to its drafts (or to drafts of their own). */
function bookOneTime(
  h: SeatHistory,
  month: Month,
  drafts: Draft[],
  ctx: LineContext,
  inner: Internals,
): void {
  const firstRow = h.rows[0]
  if (!firstRow) return

  // Sign-on and relocation in the start month, the agency fee in the offer-accepted month.
  for (const o of seatOffers(h)) {
    const req = o.req
    const items: number[] = []
    if (monthKey(o.start) === month) items.push(req.signOnBonus ?? 0, req.relocation ?? 0)
    if (monthKey(o.acceptedOn) === month) items.push(req.agencyFee ?? 0)
    const amount = items.reduce((n, x) => n + x, 0)
    if (amount === 0) continue
    const target =
      drafts.find((d) => d.span?.offer === o && d.basis === 'offer') ??
      drafts.find(
        (d) => d.span?.assignment && o.takerStart !== null && d.span.assignment.start === o.takerStart,
      )
    if (target) {
      target.oneTime += amount
      continue
    }
    const row = rowOn(h.rows, monthEnd(month)) ?? firstRow
    drafts.push({
      span: null,
      basis: 'offer',
      holderId: req.reqId,
      fte: toPosition(row).fte,
      active: 0,
      currency: req.offerCurrency || siteByLocation.get(row.location)?.currency || 'USD',
      annual: null,
      equityAnnualUsd: 0,
      unpaid: false,
      oneTime: amount,
      heads: 0,
    })
  }

  // Severance: in the month containing the last day + 1, for an eliminated seat Filled on its last day.
  const booked = new Set<ISODate>()
  for (const r of h.rows) {
    if (r.status !== 'Eliminated' || r.endReason === 'Traded' || r.endReason === 'Transferred') continue
    const lastDay = r.endDate || dayBefore(r.effectiveDate)
    if (booked.has(lastDay) || monthKey(dayAfter(lastDay)) !== month) continue
    booked.add(lastDay)
    const holder = h.assignments.find((a) => a.workerType === 'Employee' && isActiveOn(a, lastDay))
    if (!holder) continue
    const row = rowOn(h.rows, lastDay) ?? firstRow
    const org = orgOf(row)
    const site = siteByLocation.get(row.location)
    const pay = hrisRate({
      comp: ctx.compOf(holder.employeeId),
      hireDate: ctx.workerOf(holder.employeeId)?.hireDate ?? holder.start,
      on: lastDay,
      merit: inner.merit(org),
      promotion: inner.promotion(org),
      defaultCurrency: site?.currency ?? 'USD',
    })
    const item = severanceOf({
      positionId: h.positionId,
      endDate: lastDay,
      filledOnLastDay: true,
      annualBaseLocal: pay ? pay.rate * holder.fte : 0,
      currency: pay?.currency ?? site?.currency ?? 'USD',
      months: inner.severanceMonths(site?.country ?? row.location, org),
      holderId: holder.employeeId,
    })
    if (!item || item.amountLocal === 0) continue
    const target = drafts.find((d) => d.basis === 'hris' && d.holderId === holder.employeeId)
    if (target) {
      target.oneTime += item.amountLocal
      continue
    }
    drafts.push({
      span: null,
      basis: 'hris',
      holderId: holder.employeeId,
      fte: holder.fte,
      active: 0,
      currency: item.currency,
      annual: null,
      equityAnnualUsd: 0,
      unpaid: false,
      oneTime: item.amountLocal,
      heads: 0,
    })
  }
}

/** A draft as a PlanLine: monthly local = annual ÷ 12 × active (0 on unpaid leave), + one-time; USD at the line's rate. */
function toLine(
  d: Draft,
  positionId: string,
  versionId: string,
  month: Month,
  status: PositionStatus,
  ctx: LineContext,
): PlanLine {
  const pay = d.unpaid || d.annual === null ? 0 : d.active
  const a = d.annual
  const local = {
    base: a ? (a.base / 12) * pay : 0,
    bonus: a ? (a.bonus / 12) * pay : 0,
    burden: a ? (a.burden / 12) * pay : 0,
    benefits: a ? (a.benefits / 12) * pay : 0,
    oneTime: d.oneTime,
    vacancy: 0,
  }
  const equity = d.unpaid ? 0 : (d.equityAnnualUsd / 12) * d.active
  const anything = local.base !== 0 || local.bonus !== 0 || local.burden !== 0 || local.benefits !== 0
  let rate: number
  if (anything || local.oneTime !== 0) rate = ctx.rateOf(d.currency, month)
  else {
    try {
      rate = ctx.rateOf(d.currency, month)
    } catch {
      rate = 0
    }
  }
  const usd = {
    base: local.base * rate,
    bonus: local.bonus * rate,
    burden: local.burden * rate,
    benefits: local.benefits * rate,
    oneTime: local.oneTime * rate,
    vacancy: 0,
    equity,
    loaded: 0,
  }
  usd.loaded = usd.base + usd.bonus + usd.burden + usd.benefits + usd.oneTime + usd.vacancy
  // Average FTE is daily whatever the proration (SA-5): a costed span's daily fraction rides along.
  const proration = ctx.version.proration
  return {
    positionId,
    versionId,
    month,
    holderId: d.holderId,
    status,
    heads: d.heads,
    fte: d.fte,
    active: d.active,
    ...(d.span && proration !== 'daily'
      ? { activeDaily: activeFraction('daily', month, d.span.start, d.span.end) }
      : {}),
    currency: d.currency,
    rate,
    local,
    usd,
    basis: d.basis,
  }
}

/**
 * A position's lines for one month (docs/PLAN.md 6.3, 6.5). Named as in PLAN.md 6.3 but returns a
 * list: usually one line; one per costed segment when the seat changes hands or basis inside the
 * month (`PlanLine.holderId` tells them apart); one zero-amount line (basis 'band', holderId null)
 * when the seat exists but nothing is costed (an Open seat with no replacement start, an On hold
 * seat); none when the seat does not exist in the month. `position` names the seat; its history comes
 * from `ctx.rowsOf`. Status derives from assignments (versions.ts `seatOn`).
 *
 * Fixtures: C1 (September: €5,834.42 = $6,301.17 daily and half-month, $12,602.34 full-month), H3
 * (October: basis 'hris', active 15/31 daily).
 */
export function monthLine(position: Position, month: Month, ctx: LineContext): PlanLine[] {
  const inner = internals(ctx)
  const h = inner.history(position.positionId)
  const tl = timeline(h, monthStart(month), monthEnd(month))
  return linesInMonth(h, tl, month, ctx.version.versionId, ctx.version.proration, ctx, inner)
}

/**
 * Whether a seat books a one-time item in `month` (an offer's start or acceptance month, or the month
 * after an eliminated holder's last day): when it does not, every line `monthLine` gives it that
 * month has `oneTime` 0, so a caller after one-time items can skip it.
 */
function booksOneTime(h: SeatHistory, month: Month): boolean {
  if (!h.rows[0]) return false
  for (const o of seatOffers(h))
    if (monthKey(o.start) === month || monthKey(o.acceptedOn) === month) return true
  for (const r of h.rows) {
    if (r.status !== 'Eliminated' || r.endReason === 'Traded' || r.endReason === 'Transferred') continue
    if (monthKey(dayAfter(r.endDate || dayBefore(r.effectiveDate))) === month) return true
  }
  return false
}

/**
 * `monthLine` for a position that books a one-time item in the month (see `booksOneTime`), else no
 * lines: the lines of a month a one-time reader keeps (close.ts `oneTimeActuals`). An addition to the
 * contract.
 */
export function oneTimeMonthLine(position: Position, month: Month, ctx: LineContext): PlanLine[] {
  const inner = internals(ctx)
  if (!booksOneTime(inner.history(position.positionId), month)) return []
  return monthLine(position, month, ctx)
}

/**
 * A position's lines over the version's grid: `monthLine` for each grid month. An Eliminated seat has
 * lines through the month of its last day, plus the month its severance books (status Eliminated,
 * heads 0, `oneTime` the severance, basis 'hris', holderId the last holder).
 *
 * Fixtures: C1 (FY27 daily: €75,847.42 = $81,915.21), C2b (an Open 0.6 FTE seat with an accepted offer
 * at €100,000: base €60,000 a year, basis 'offer'), C4 (severance in 2027-01, none for a pending
 * elimination), H3 (no cost from November).
 *
 * `only` keeps the grid months in it (the forecast prices its projected months only): each month's
 * lines are the ones the whole grid gives it, since the seat's timeline still spans the grid. An
 * addition to the contract.
 */
export function positionLines(
  position: Position,
  version: Version,
  ctx: LineContext,
  only?: ReadonlySet<Month>,
): PlanLine[] {
  const inner = internals(ctx)
  const h = inner.history(position.positionId)
  const months = monthRange(version.grid.from, version.grid.to)
  if (months.length === 0) return []
  const tl = timeline(h, monthStart(months[0]), monthEnd(months[months.length - 1]))
  const out: PlanLine[] = []
  for (const m of months) {
    if (only && !only.has(m)) continue
    for (const l of linesInMonth(h, tl, m, version.versionId, version.proration, ctx, inner)) out.push(l)
  }
  return out
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** Every position's lines over the version's grid (Working computed live, or a lock's lines), sorted by positionId, month, holderId. */
export function versionLines(version: Version, ctx: LineContext): PlanLine[] {
  const out: PlanLine[] = []
  for (const id of ctx.positionIds) {
    const rows = ctx.rowsOf(id)
    if (rows.length === 0) continue
    for (const l of positionLines(toPosition(rows[0]), version, ctx)) out.push(l)
  }
  return out.sort(
    (a, b) =>
      cmp(a.positionId, b.positionId) || cmp(a.month, b.month) || cmp(a.holderId ?? '', b.holderId ?? ''),
  )
}
