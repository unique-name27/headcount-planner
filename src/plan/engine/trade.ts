/**
 * Headcount trades (docs/PLAN.md 11.2 to 11.4; question 6, Design A). Built by engines C in M1. Pure.
 * Pricing lives in band.ts (`SH_BP`, `SeatType`, `TradeRates`, `weightBp`, `standardHeadOf`).
 *
 * - Tradable seats: Employee seats that are Open (no accepted offer), Planned or On hold, in scope, not
 *   in another pending request. Filled seats never; accepted offers never.
 * - The giving org (`giveOrgPositionId`, stored at submit, never derived again) = the lowest manager
 *   position whose tree contains every give seat on the submit date; for a credit-only trade, the
 *   requester's own position (Manager mode) or the org picked (other modes).
 * - giveBp = Σ give weights + creditUsedBp; maxSeats = floor(giveBp ÷ weight of one wanted seat);
 *   count defaults to the maximum; nothing rounds up; the optional part-time last seat takes the
 *   largest FTE step (fteStep, at least minFte) whose weight fits what is left, where the location
 *   allows part time. getBp = Σ get weights; creditBp = giveBp − getBp >= 0, in integers.
 * - ratio = giveBp ÷ the weight of one wanted seat (at the asked FTE).
 * - headsDelta = seats received − given seats that are approved heads (Open or Planned); a given On
 *   hold seat counts 0. It is the trade's head effect in asks and budget status.
 * - inYearBp = Σ get weight × FY fraction − Σ give weight × FY fraction, FY fraction = `inYearFraction`
 *   (version proration) from the later of the seat's start and the first open month; negative is a
 *   saving; not rounded. A given On hold seat is not costed, so its FY fraction is 0 (the same reading
 *   as targets.ts `bandEffect` and "Move target too?"), and neither is a given Open or Planned seat
 *   with no planned start (15.1 R33, lead decision D-NOSTART).
 * - Blocks, in this order: filled, accepted-offer, eliminated, not-employee, no-band, not-in-scope,
 *   closed-month, frozen, pending-request, then the ask's own: part-time-not-allowed, fte-step,
 *   credit-over-balance, not-enough. A give seat shows only its first block (with its positionId).
 *   'closed-month' (the get start is before the first open month) and 'frozen' (the get org is frozen
 *   on the get start and the ask has no freezeException) carry no positionId. Part time is checked on
 *   get seats only: a get fte below 1.0, or the part-time rest seat, is `part-time-not-allowed` where
 *   the location does not allow it; a get fte below minFte or not a multiple of fteStep is `fte-step`.
 * - Trade credit is keyed to the giving org exactly and lapses when the fiscal year closes.
 */

import { fiscalYearOf, fyRange, monthStart, monthsOf } from '@/data/fiscal'
import {
  APPROVED_REQUEST_STATES,
  type FiscalYear,
  type ISODate,
  type Level,
  type Month,
  PENDING_REQUEST_STATES,
  type PositionRow,
  type Proration,
  siteByLocation,
  type TargetRow,
  type WorkerType,
} from '@/data/schema'
import { addDays, formatMonth } from '@/lib/dates'
import type {
  AuditDraft,
  HcRequest,
  PositionChange,
  PositionStatus,
  TradeFields,
  WorkingPlan,
} from '../types'
import { type SeatType, SH_BP, type TradeRates, weightBp } from './band'
import { inYearFraction } from './proration'
import { ACCEPTED_OFFER_TEXT, rowAudit } from './requests'

/** The refusal for a Filled give seat (11.2). */
export const FILLED_NOT_TRADED_TEXT =
  'Filled seats are never traded: request an Elimination, then a New role.'

/** What a trade asks for. */
export interface TradeAsk {
  /** The give seats' position IDs. */
  give: readonly string[]
  creditUsedBp: number
  /** null: derived from the give seats (11.2). */
  giveOrgPositionId: string | null
  get: SeatType & {
    /** The get seats' manager position. */
    orgPositionId: string
    businessUnit: string
    jobFamily: string | null
    start: ISODate
    count: number | 'max'
    partTimeRest: boolean
  }
  freezeException?: { reason: string }
}

export type TradeBlock =
  | 'filled'
  | 'accepted-offer'
  | 'eliminated'
  | 'pending-request'
  | 'not-in-scope'
  | 'not-employee'
  | 'no-band'
  | 'not-enough'
  | 'credit-over-balance'
  | 'fte-step'
  | 'part-time-not-allowed'
  | 'frozen'
  | 'closed-month'

/** The order blocks are checked and shown in (11.3). Data, part of the contract. */
export const TRADE_BLOCK_ORDER: readonly TradeBlock[] = [
  'filled',
  'accepted-offer',
  'eliminated',
  'not-employee',
  'no-band',
  'not-in-scope',
  'closed-month',
  'frozen',
  'pending-request',
  'part-time-not-allowed',
  'fte-step',
  'credit-over-balance',
  'not-enough',
]

/** A seat as a trade reads it, on the as-of date. */
export interface TradeSeat {
  positionId: string
  /** Derived status (versions.ts `seatOn`). */
  status: PositionStatus
  level: Level
  location: string
  fte: number
  workerType: WorkerType
  /** The seat's manager position. */
  orgPositionId: string
  businessUnit: string
  /** Planned or target start; null when none. */
  start: ISODate | null
  acceptedOffer: boolean
  /** The pending request that already names the seat, if any. */
  pendingRequestId: string | null
  /** In the viewer's scope. */
  inScope: boolean
  /**
   * The seat's open req (not Filled or Cancelled), if any: the quote warns when it is at stage
   * Interviewing (11.4, review SC-12). An addition to the contract; absent reads none.
   */
  openReq?: { reqId: string; stage: string | null } | null
}

/** One seat on a quote: a give seat, or one get seat (a get of 8 seats has 8 lines, plus the part-time rest). */
export interface TradeLine {
  /** The give seat; null for a get seat (created on approval). */
  positionId: string | null
  level: Level
  location: string
  fte: number
  /** A give seat's start; a get seat's requested start. */
  start: ISODate | null
  /** Band estimate, USD at plan rates; null with no band. */
  bandUsd: number | null
  weightBp: number | null
  /** Counts as an approved head (a get seat, or an Open or Planned give seat; not On hold). */
  approvedHead: boolean
}

export interface TradeQuote {
  ok: boolean
  blocks: readonly { code: TradeBlock; positionId?: string; text: string }[]
  give: readonly TradeLine[]
  get: readonly TradeLine[]
  giveOrgPositionId: string
  /** giveBp === getBp + creditBp, integers, creditBp >= 0. giveBp includes creditUsedBp. */
  giveBp: number
  getBp: number
  creditBp: number
  maxSeats: number
  ratio: number
  /** Seats received − given seats that are approved heads (Open or Planned); a given On hold seat counts 0. */
  headsDelta: number
  /**
   * Σ get weight × FY fraction − Σ give weight × FY fraction (see the module comment). Not rounded;
   * the card shows |inYearBp| ÷ 10,000 to 2 dp as "saves" when negative and "costs" when positive.
   */
  inYearBp: number
  /** Σ get bandUsd: a cost field; the leader threshold reads it. */
  getBandUsd: number
  rates: { version: string; lockHash: string | null; standardHeadUsd: number }
  /**
   * What the card says besides the blocks, with no amount: a give seat whose open req is at
   * Interviewing (11.4, review SC-12). An addition to the contract.
   */
  warnings?: readonly { code: 'req-interviewing'; positionId: string; reqId: string; text: string }[]
  /**
   * "Rates can change until FY28 locks." for a quote priced on a Working version (no lock hash,
   * 11.2, review SC-11); null on the plan of record's locked rates. An addition to the contract.
   */
  ratesNote?: string | null
}

/** What a quote reads besides the seats and the rates. */
export interface TradeContext {
  asOf: ISODate
  /** The first month not closed: get starts must be in it or later, and give seats leave from it. */
  firstOpenMonth: Month
  /** The pricing version's proration (for inYearBp). */
  proration: Proration
  /** The giving org's trade credit balance in bp for the rates' year (`creditBalance` over plan state's requests). */
  creditBalanceBp(giveOrgPositionId: string): number
  /** The lowest manager position whose tree contains every given seat on asOf; null when none. */
  giveOrgOf(givePositionIds: readonly string[]): string | null
  /** A freeze covering the get org on the get start, or null. */
  freezeOn(orgPositionId: string, on: ISODate): { freezeId: string } | null
  /**
   * Whether the viewer sees a request in full (8.4 rule 6): a give seat's pending-request block names
   * the request only then, else "another pending request" (review PV-9). Absent: never named. An
   * addition to the contract.
   */
  requestShown?(requestId: string): boolean
}

/* ───────────── block texts ───────────── */

/** Standard heads from bp, to 2 dp ("1.35"). */
export const standardHeads = (bp: number): string => (bp / SH_BP).toFixed(2)

/**
 * Two bp amounts as standard heads that read apart: to 2 dp, or to 4 dp when 2 dp would read the
 * same (420 and 421 bp: "0.0420" and "0.0421", review SC-19).
 */
export function standardHeadsApart(a: number, b: number): [string, string] {
  const x = standardHeads(a)
  const y = standardHeads(b)
  if (x !== y || a === b) return [x, y]
  return [(a / SH_BP).toFixed(4), (b / SH_BP).toFixed(4)]
}

/** The note on a quote priced on a Working version's rates (11.2): "Rates can change until FY28 locks." */
export const ratesChangeText = (year: FiscalYear): string => `Rates can change until ${year} locks.`

/**
 * The card's warning for a give seat whose open req is at Interviewing (11.4). M4 (M3 known gap 6):
 * the request card's own sentence since M3, so the card and What if's trade lever read one sentence.
 */
export const interviewingText = (reqId: string, positionId: string): string =>
  `${reqId} on ${positionId} is interviewing. Trading the seat leaves the req open as imported.`

/** "6 P3 Bengaluru seats", "1 P5 San Jose seat", with the FTE when it is not full time. */
function seatsLabel(n: number, seat: Pick<SeatType, 'level' | 'location' | 'fte'>, noun = true): string {
  const fte = seat.fte === 1 ? '' : ` at ${seat.fte} FTE`
  return `${n} ${seat.level} ${seat.location}${noun ? (n === 1 ? ' seat' : ' seats') : ''}${fte}`
}

const SEAT_TEXT: Partial<Record<TradeBlock, (seat: TradeSeat | null, id: string) => string>> = {
  filled: () => FILLED_NOT_TRADED_TEXT,
  'accepted-offer': () => ACCEPTED_OFFER_TEXT,
  eliminated: () => 'This seat is eliminated, so there is nothing to give.',
  'not-employee': () => 'Only employee seats are traded. Contractor and intern seats are not.',
  'no-band': (s) =>
    s
      ? `There is no band for ${s.level} in ${s.location}, so this seat has no weight.`
      : 'This seat has no band.',
  'not-in-scope': (s, id) =>
    s ? 'This seat is outside the team or org you trade for.' : `There is no seat ${id} in this plan.`,
  'pending-request': () => 'This seat is already in another pending request.',
}

/** The pending-request block's text: the request named only when the viewer sees it in full (8.4 rule 6, PV-9). */
const pendingText = (seat: TradeSeat, ctx: Pick<TradeContext, 'requestShown'>): string =>
  seat.pendingRequestId && ctx.requestShown?.(seat.pendingRequestId) === true
    ? `This seat is already in pending request ${seat.pendingRequestId}.`
    : 'This seat is already in another pending request.'

/* ───────────── the quote ───────────── */

interface Block {
  code: TradeBlock
  positionId?: string
  text: string
}

/** The first block a give seat meets, in TRADE_BLOCK_ORDER; null when it is tradable. */
function seatBlock(
  id: string,
  seat: TradeSeat | undefined,
  bandUsd: number | null,
  ctx: Pick<TradeContext, 'requestShown'>,
): Block | null {
  const code: TradeBlock | null = !seat
    ? 'not-in-scope'
    : seat.status === 'Filled'
      ? 'filled'
      : seat.acceptedOffer
        ? 'accepted-offer'
        : seat.status === 'Eliminated'
          ? 'eliminated'
          : seat.workerType !== 'Employee'
            ? 'not-employee'
            : bandUsd == null
              ? 'no-band'
              : !seat.inScope
                ? 'not-in-scope'
                : seat.pendingRequestId
                  ? 'pending-request'
                  : null
  if (!code) return null
  if (code === 'pending-request' && seat) return { code, positionId: id, text: pendingText(seat, ctx) }
  return { code, positionId: id, text: SEAT_TEXT[code]?.(seat ?? null, id) ?? code }
}

/** True when `fte` is a whole number of `step`s (to a millionth). */
const onStep = (fte: number, step: number): boolean => Math.abs(fte / step - Math.round(fte / step)) < 1e-6

/** FTE values tidied to the step's decimals (0.8, never 0.7999999). */
const tidy = (x: number): number => Math.round(x * 1e6) / 1e6

/**
 * A trade's quote (see the module comment). Text of the plan's blocks: not-enough "6 P3 Bengaluru
 * seats make 1.35 standard heads; 1 P5 San Jose needs 1.92. Add 3 more P3 Bengaluru seats.";
 * part-time-not-allowed "Bengaluru seats are full time only."; filled FILLED_NOT_TRADED_TEXT;
 * accepted-offer ACCEPTED_OFFER_TEXT (requests.ts).
 *
 * Fixtures (trade.test.ts): T1, T1′, T1h, T2, T3, T4, T5, T6, T7a, T7b, and the 11.7 properties.
 */
export function tradeQuote(
  ask: TradeAsk,
  seats: ReadonlyMap<string, TradeSeat>,
  rates: TradeRates,
  ctx: TradeContext,
): TradeQuote {
  const S = rates.standardHeadUsd
  const blocks: Block[] = []
  const fy = fyRange(rates.year)
  const months = monthsOf(rates.year)
  const firstOpen = monthStart(ctx.firstOpenMonth)
  const openStart = firstOpen > fy.start ? firstOpen : fy.start
  /** The FY fraction from the later of a start and the first open month. */
  const fyShare = (start: ISODate | null): number => {
    const from = start != null && start > openStart ? start : openStart
    return from > fy.end ? 0 : inYearFraction(ctx.proration, months, from, null)
  }

  /* give */
  const give: TradeLine[] = []
  const warnings: { code: 'req-interviewing'; positionId: string; reqId: string; text: string }[] = []
  let giveSeatBp = 0
  let inYearBp = 0
  let giveHeads = 0
  for (const id of ask.give) {
    const seat = seats.get(id)
    const bandUsd = seat
      ? rates.bandUsd({ level: seat.level, location: seat.location, fte: seat.fte }, seat.orgPositionId)
      : null
    const block = seatBlock(id, seat, bandUsd, ctx)
    if (block) blocks.push(block)
    if (!seat) continue
    // The app never edits reqs: an Interviewing req on a give seat stays open after approval (11.4).
    if (seat.openReq && seat.openReq.stage === 'Interviewing')
      warnings.push({
        code: 'req-interviewing',
        positionId: id,
        reqId: seat.openReq.reqId,
        text: interviewingText(seat.openReq.reqId, id),
      })
    const w = bandUsd == null ? null : weightBp(bandUsd, S)
    const approvedHead = seat.status === 'Open' || seat.status === 'Planned'
    give.push({
      positionId: id,
      level: seat.level,
      location: seat.location,
      fte: seat.fte,
      start: seat.start,
      bandUsd,
      weightBp: w,
      approvedHead,
    })
    if (w != null) {
      giveSeatBp += w
      // A seat with no planned start is not costed (R33), so giving it saves nothing in-year.
      if (approvedHead && seat.start != null) inYearBp -= w * fyShare(seat.start)
    }
    if (approvedHead) giveHeads++
  }
  const giveOrgPositionId = ask.giveOrgPositionId ?? ctx.giveOrgOf(ask.give) ?? ''
  const giveBp = giveSeatBp + ask.creditUsedBp

  /* the ask's own checks: closed month and freeze, then the get seat itself */
  const g = ask.get
  if (g.start < firstOpen)
    blocks.push({ code: 'closed-month', text: `Start dates must be in ${formatMonth(firstOpen)} or later.` })
  if (!ask.freezeException && ctx.freezeOn(g.orgPositionId, g.start))
    blocks.push({
      code: 'frozen',
      text: 'Hiring is frozen for this org on the start date. You can still submit an exception with a business reason.',
    })
  const partTimeOk = rates.partTimeAllowed(g.location, g.orgPositionId)
  if (!partTimeOk && (g.fte < 1 || g.partTimeRest))
    blocks.push({ code: 'part-time-not-allowed', text: `${g.location} seats are full time only.` })
  if (g.fte < rates.minFte - 1e-9 || g.fte > 1 + 1e-9 || !onStep(g.fte, rates.fteStep))
    blocks.push({
      code: 'fte-step',
      text: `FTE must be from ${rates.minFte} to 1, in steps of ${rates.fteStep}.`,
    })
  const balance = ctx.creditBalanceBp(giveOrgPositionId)
  if (ask.creditUsedBp < 0 || !Number.isInteger(ask.creditUsedBp) || ask.creditUsedBp > balance) {
    const [held, used] = standardHeadsApart(balance, ask.creditUsedBp)
    blocks.push({
      code: 'credit-over-balance',
      text: `The giving org holds ${held} standard heads of trade credit; this trade uses ${used}.`,
    })
  }

  /* get */
  const wanted: SeatType = { level: g.level, location: g.location, fte: g.fte }
  const wantUsd = rates.bandUsd(wanted, g.orgPositionId)
  const wantBp = wantUsd == null ? null : weightBp(wantUsd, S)
  if (wantUsd == null)
    blocks.push({ code: 'no-band', text: `There is no band for ${g.level} in ${g.location}.` })
  const maxSeats = wantBp != null && wantBp > 0 && giveBp > 0 ? Math.floor(giveBp / wantBp) : 0
  const ratio = wantBp != null && wantBp > 0 ? giveBp / wantBp : 0
  const asked = g.count === 'max' ? maxSeats : Math.max(0, Math.floor(g.count))
  const whole = Math.min(asked, maxSeats)

  const get: TradeLine[] = []
  let getBp = 0
  let getBandUsd = 0
  const getLine = (fte: number, usd: number, w: number): TradeLine => ({
    positionId: null,
    level: g.level,
    location: g.location,
    fte,
    start: g.start,
    bandUsd: usd,
    weightBp: w,
    approvedHead: true,
  })
  if (wantUsd != null && wantBp != null) {
    for (let i = 0; i < whole; i++) {
      get.push(getLine(g.fte, wantUsd, wantBp))
      getBp += wantBp
      getBandUsd += wantUsd
    }
    // The part-time rest seat: the largest step below the asked FTE, at least minFte, that fits.
    if (g.partTimeRest && partTimeOk && whole >= 0) {
      const left = giveBp - getBp
      const steps = Math.round(g.fte / rates.fteStep)
      for (let k = steps - 1; k >= 1; k--) {
        const fte = tidy(k * rates.fteStep)
        if (fte < rates.minFte - 1e-9) break
        const usd = rates.bandUsd({ ...wanted, fte }, g.orgPositionId)
        if (usd == null) continue
        const w = weightBp(usd, S)
        if (w <= left) {
          get.push(getLine(fte, usd, w))
          getBp += w
          getBandUsd += usd
          break
        }
      }
    }
    const share = fyShare(g.start)
    for (const l of get) inYearBp += (l.weightBp ?? 0) * share
  }

  if (wantBp != null && (asked > maxSeats || get.length === 0)) {
    const want = Math.max(asked, 1)
    const same =
      give.length > 0 &&
      give.every((l) => l.level === give[0].level && l.location === give[0].location && l.fte === give[0].fte)
    const parts = [
      give.length ? (same ? seatsLabel(give.length, give[0]) : `${give.length} seats`) : '',
      ask.creditUsedBp > 0 ? `${standardHeads(ask.creditUsedBp)} standard heads of credit` : '',
    ].filter(Boolean)
    const have = parts.length ? parts.join(' and ') : 'Nothing given'
    const verb = parts.length === 1 && give.length === 1 && ask.creditUsedBp <= 0 ? 'makes' : 'make'
    const short = want * wantBp - giveBp
    const per = same ? (give[0].weightBp ?? 0) : 0
    const more =
      per > 0
        ? `Add ${Math.ceil(short / per)} more ${seatsLabel(Math.ceil(short / per), give[0]).replace(/^\d+ /, '')}.`
        : `Add seats or credit worth ${standardHeads(short)} more standard heads.`
    blocks.push({
      code: 'not-enough',
      text: `${have} ${verb} ${standardHeads(giveBp)} standard heads; ${seatsLabel(want, wanted, false)} ${want === 1 ? 'needs' : 'need'} ${standardHeads(want * wantBp)}. ${more}`,
    })
  }

  const order = (b: Block) => TRADE_BLOCK_ORDER.indexOf(b.code)
  const sorted = blocks.map((b, i) => ({ b, i })).sort((x, y) => order(x.b) - order(y.b) || x.i - y.i)

  return {
    ok: blocks.length === 0,
    blocks: sorted.map((x) => x.b),
    give,
    get,
    giveOrgPositionId,
    giveBp,
    getBp,
    creditBp: giveBp - getBp,
    maxSeats,
    ratio,
    headsDelta: get.length - giveHeads,
    inYearBp,
    getBandUsd,
    rates: { version: rates.version, lockHash: rates.lockHash, standardHeadUsd: S },
    warnings,
    ratesNote: rates.lockHash == null ? ratesChangeText(rates.year) : null,
  }
}

/** A trade's fiscal year: that of its get start (`startDate`). */
export function tradeYearOf(req: HcRequest): FiscalYear | null {
  return req.startDate ? fiscalYearOf(req.startDate) : null
}

/**
 * A giving org's trade credit in bp for a fiscal year: Σ creditBp of approved trades whose
 * giveOrgPositionId is the org − Σ creditUsedBp of approved and pending trades with the same
 * giveOrgPositionId, in that year. Derived, never stored.
 *
 * Fixture: CR1 (T1 approved gives 1,104; T3 pending using 1,104 leaves 0; another org's and another
 * year's trades do not count).
 */
export function creditBalance(
  requests: readonly HcRequest[],
  orgPositionId: string,
  year: FiscalYear,
): number {
  let bp = 0
  for (const r of requests) {
    const t = r.trade
    if (r.type !== 'Trade' || !t || t.giveOrgPositionId !== orgPositionId || tradeYearOf(r) !== year) continue
    const approved = APPROVED_REQUEST_STATES.includes(r.state)
    if (approved) bp += t.creditBp ?? 0
    if (approved || PENDING_REQUEST_STATES.includes(r.state)) bp -= t.creditUsedBp
  }
  return bp
}

/**
 * A trade's fields with Finance's "Move target too?" choice, stored on the request when a cross-unit
 * trade is approved (11.4) so an imported copy replays the same choice (D-MERGE). An addition until
 * src/plan/types.ts `TradeFields` carries it.
 */
export type TradeFieldsWithTarget = TradeFields & { moveTarget?: boolean }

/** Whether a trade moves the units' targets when it crosses units (11.4: on by default). */
export const movesTarget = (t: TradeFields | null | undefined): boolean =>
  (t as TradeFieldsWithTarget | null | undefined)?.moveTarget !== false

/** What "Move target too?" reads for a cross-unit trade (11.4). */
export interface TradeTargetInput {
  /** The giving unit's target and the receiving unit's, for the trade's fiscal year. */
  fromTarget: TargetRow
  toTarget: TargetRow
  /** The trade's quote at approval: its give and get lines (weights, band estimates, starts). */
  quote: Pick<TradeQuote, 'give' | 'get'>
  fiscalYear: FiscalYear
  /** The pricing version's proration. */
  proration: Proration
  /** The first month not closed: give seats leave from it. */
  firstOpenMonth: Month
}

/**
 * "Move target too?" for a cross-unit trade (11.4, on by default, review SP-5): the giving unit's
 * target loses the given seats that are approved heads (an On hold seat counts 0) and their in-year
 * band estimate (from the later of each seat's start and the first open month; a seat with no planned
 * start is not costed, R33), the receiving unit's gains the seats received and their in-year band
 * estimate from their start, at plan rates (the same rule as targets.ts `bandEffect`), never HRIS
 * cost. A target with no cost keeps none. Credit stays with the giving org (11.2).
 */
export function tradeTargetMove(input: TradeTargetInput): { from: TargetRow; to: TargetRow } {
  const fy = fyRange(input.fiscalYear)
  const months = monthsOf(input.fiscalYear)
  const firstOpen = monthStart(input.firstOpenMonth)
  const openStart = firstOpen > fy.start ? firstOpen : fy.start
  const share = (start: ISODate | null): number => {
    if (start == null) return 0
    const from = start > openStart ? start : openStart
    return from > fy.end ? 0 : inYearFraction(input.proration, months, from, null)
  }
  let headsOut = 0
  let usdOut = 0
  for (const l of input.quote.give) {
    if (!l.approvedHead) continue
    headsOut++
    usdOut += (l.bandUsd ?? 0) * share(l.start)
  }
  let usdIn = 0
  for (const l of input.quote.get) usdIn += (l.bandUsd ?? 0) * share(l.start)
  const copy = (t: TargetRow): TargetRow => ({
    fiscalYear: t.fiscalYear,
    targetDate: t.targetDate ?? null,
    businessUnit: t.businessUnit,
    department: t.department ?? null,
    costCenter: t.costCenter ?? null,
    leaderPositionId: t.leaderPositionId ?? null,
    targetHeads: t.targetHeads,
    targetCost: t.targetCost ?? null,
  })
  const from = copy(input.fromTarget)
  const to = copy(input.toTarget)
  return {
    from: {
      ...from,
      targetHeads: from.targetHeads - headsOut,
      targetCost: from.targetCost == null ? null : from.targetCost - usdOut,
    },
    to: {
      ...to,
      targetHeads: to.targetHeads + input.quote.get.length,
      targetCost: to.targetCost == null ? null : to.targetCost + usdIn,
    },
  }
}

/** The seat's rows, oldest first. */
const rowsOf = (positions: readonly PositionRow[], positionId: string): PositionRow[] =>
  positions
    .filter((r) => r.positionId === positionId)
    .sort((a, b) => (a.effectiveDate < b.effectiveDate ? -1 : a.effectiveDate > b.effectiveDate ? 1 : 0))

/** The row in effect on `d` (the latest on or before it); null before the first. */
export function rowInEffect(rows: readonly PositionRow[], d: ISODate): PositionRow | null {
  let hit: PositionRow | null = null
  for (const r of rows) if (r.effectiveDate <= d && (!hit || r.effectiveDate >= hit.effectiveDate)) hit = r
  return hit
}

/**
 * Applies an approved trade: give seats become Eliminated with endReason 'Traded' from the approval
 * date (endDate = the day before `at`); get seats become new Planned positions (IDs from
 * `plan.newPositionId`) at the request's level, location and FTE (`trade.count` seats, plus the
 * part-time rest seat at `trade.restFte`), org fields from `plan.placeOf`, startDate the request's,
 * sourceRequestId the request. Reqs are never edited. One audit entry per field.
 *
 * A give seat's rows dated after `at` (a later planned change) are written Eliminated too, so the
 * seat cannot come back. The credit ledger moves with the request: its `creditBp` and `creditUsedBp`
 * are audited on the request.
 *
 * Fixture: T1-applied (approved heads at the target date rise by +7, equal to the pending head effect).
 */
export function applyTrade(
  plan: WorkingPlan,
  req: HcRequest,
  at: ISODate,
): { positions: PositionChange[]; audit: AuditDraft[] } {
  const t = req.trade
  if (req.type !== 'Trade' || !t) return { positions: [], audit: [] }
  const positions: PositionChange[] = []
  const audit: AuditDraft[] = []
  const endDate = addDays(at, -1)

  for (const id of t.givePositionIds) {
    const rows = rowsOf(plan.positions, id)
    const current = rowInEffect(rows, at) ?? rows[0]
    if (!current) continue
    const ended = (r: PositionRow, effectiveDate: ISODate): PositionRow => ({
      ...r,
      effectiveDate,
      status: 'Eliminated',
      endDate,
      endReason: 'Traded',
      sourceRequestId: req.requestId,
    })
    const row = ended(current, at)
    positions.push({ kind: 'eliminated', row })
    audit.push(...rowAudit(current, row, plan.actor, at, at))
    for (const r of rows)
      if (r.effectiveDate > at) positions.push({ kind: 'eliminated', row: ended(r, r.effectiveDate) })
  }

  if (req.level && req.location) {
    const level = req.level
    const location = req.location
    const ftes: number[] = Array.from({ length: Math.max(0, t.count) }, () => req.fte ?? 1)
    if (t.restFte != null && t.restFte > 0) ftes.push(t.restFte)
    const place = plan.placeOf(req.managerPositionId, location)
    ftes.forEach((fte, i) => {
      const row: PositionRow = {
        positionId: plan.newPositionId(req.requestId, i + 1),
        effectiveDate: at,
        status: 'Planned',
        title: req.jobTitle,
        jobFamily: t.jobFamily,
        level,
        businessUnit: place?.businessUnit ?? req.businessUnit,
        department: place ? place.department : req.department,
        costCenter: place?.costCenter ?? req.costCenter ?? '',
        location,
        legalEntity: place?.legalEntity ?? siteByLocation.get(location)?.legalEntity ?? null,
        managerPositionId: req.managerPositionId,
        workerType: 'Employee',
        fte,
        startDate: req.startDate,
        openedDate: null,
        reqType: 'New',
        leaderLevel: null,
        endDate: null,
        endReason: null,
        sourceRequestId: req.requestId,
      }
      positions.push({ kind: 'created', row })
      audit.push(...rowAudit(null, row, plan.actor, at, at))
    })
  }

  const ledger = (field: string, value: number): AuditDraft => ({
    at,
    by: plan.actor.personId,
    byName: plan.actor.name,
    mode: plan.actor.mode,
    object: 'request',
    id: req.requestId,
    field,
    old: null,
    new: value,
    effectiveDate: at,
    comment: null,
    commentAudience: null,
  })
  audit.push(ledger('creditBp', t.creditBp ?? 0))
  if (t.creditUsedBp > 0) audit.push(ledger('creditUsedBp', t.creditUsedBp))
  return { positions, audit }
}
