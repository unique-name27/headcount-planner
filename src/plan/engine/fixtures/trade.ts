/**
 * Trade fixtures (docs/PLAN.md 11.7, exact). FY27 (1 Apr 2026 to 31 Mar 2027), full-month proration,
 * first open month 2026-10, plan FX USD 1, EUR 1.08, INR 0.012, ILS 0.27; minFte 0.5, fteStep 0.1;
 * part time allowed in San Jose, Munich and Haifa, not in Bengaluru. Rates and the seat table are in
 * fixtures/band.ts (S = $150,000). The chain context (fixtures/chain.ts): every org a trade touches
 * has an FY27 target of 40 heads and $8,000,000, with guarded asks of 30 heads and $5,000,000 before
 * the quote; FY27 has no cycle record. T1's get seats report to the same manager position as its give
 * seat.
 *
 * | id | Give | Want | Seats | getBp | Credit bp | Ratio | Heads | Chain |
 * |---|---|---|---|---|---|---|---|---|
 * | T1 | 1 Planned P5 San Jose from 2026-11-01 (19,160) | P3 Bengaluru from 2027-01-01 | 8 | 18,056 | 1,104 | 8.4891 | +7 | manager, HRBP, leader ($270,873.60 over threshold) |
 * | T1′ | as T1, asks of 35 heads before the quote | P3 Bengaluru | 8 | 18,056 | 1,104 | 8.4891 | +7 | manager, HRBP, leader (over threshold, out of plan), Finance (out of plan): 42 > 40 |
 * | T1h | 1 On hold P5 San Jose (19,160) | P3 Bengaluru | 8 | 18,056 | 1,104 | 8.4891 | +8 | manager, HRBP, leader |
 * | T2 | 1 Open P4 Munich (10,082) | P3 Bengaluru | 4 | 9,028 | 1,054 | 4.4670 | +3 | manager, HRBP |
 * | T3 | 8 P3 Bengaluru (18,056) + credit 1,104 | P5 San Jose | 1 | 19,160 | 0 | 1.0000 | −7 | manager, HRBP, leader |
 * | T4 | 1 P5 San Jose (19,160) | P4 Munich, part-time rest | 1 + one 0.8 FTE (8,339) | 18,421 | 739 | | +1 | manager, HRBP, leader |
 * | T5 | 6 P3 Bengaluru (13,542) | P5 San Jose | 0 | | | 0.7068 | | blocked not-enough |
 * | T6 | 1 Planned P4 San Jose in Go-to-Market (15,733) | P4 Haifa in Silicon Engineering | 1 | 10,692 | 5,041 (held by the giving GTM manager position) | 1.4715 | 0 | manager, both HRBPs, both unit leaders, Finance |
 * | T7a | a Filled seat; an Open seat with an accepted offer; a contractor seat | P3 Bengaluru | | | | | | blocked filled, accepted-offer, not-employee |
 * | T7b | 1 Planned P5 San Jose | P3 Bengaluru at 0.5 FTE; separately 1.0 FTE with partTimeRest | | | | | | blocked part-time-not-allowed |
 *
 * In-year (T1): out 5/12, in 3/12; inYearBp = 18,056 × 3/12 − 19,160 × 5/12 = −3,469.33 ("saves 0.35
 * standard heads"); Finance USD −$52,040.00 against −$52,031.60 from exact bands (fixture G3).
 * Properties: giveBp === getBp + creditBp for every quote; T1 then T3 restores the seats with credit 0;
 * band USD drift is at most half a basis point per rounded seat (T1: 9 seats, $33.60 of $67.50 allowed);
 * the rise in asks heads while a trade is pending equals the rise in approved heads after applyTrade.
 * CR1: creditBalance (11.2).
 */
import type { ISODate, Level, PositionRow } from '@/data/schema'
import type { HcRequest, TradeFields, WorkingPlan } from '../../types'
import type { ChainFacts } from '../chain'
import type { TradeAsk, TradeBlock, TradeContext, TradeSeat } from '../trade'
import { check, facts } from './chain'
import { hcRequest, positionRow } from './common'

const GTM = 'Go-to-Market'
const SE = 'Silicon Engineering'

const seat = (
  positionId: string,
  level: Level,
  location: string,
  over: Partial<TradeSeat> = {},
): [string, TradeSeat] => [
  positionId,
  {
    positionId,
    status: 'Planned',
    level,
    location,
    fte: 1,
    workerType: 'Employee',
    orgPositionId: 'P-GTM-MGR',
    businessUnit: GTM,
    start: '2026-11-01',
    acceptedOffer: false,
    pendingRequestId: null,
    inScope: true,
    ...over,
  },
]

const range = (prefix: string, n: number): string[] =>
  Array.from({ length: n }, (_, i) => `${prefix}-${i + 1}`)

/** Every seat the 11.7 asks give, as of 30 Sep 2026. */
export const TRADE_SEATS: ReadonlyMap<string, TradeSeat> = new Map<string, TradeSeat>([
  seat('P-T1', 'P5', 'San Jose'),
  seat('P-T1H', 'P5', 'San Jose', { status: 'On hold', start: null }),
  seat('P-T2', 'P4', 'Munich', { status: 'Open', start: '2026-12-01' }),
  ...range('P-T3', 8).map((id) => seat(id, 'P3', 'Bengaluru', { start: '2027-01-01' })),
  seat('P-T4', 'P5', 'San Jose'),
  ...range('P-T5', 6).map((id) => seat(id, 'P3', 'Bengaluru', { start: '2027-01-01' })),
  seat('P-T6', 'P4', 'San Jose', { start: '2026-12-01' }),
  seat('P-T7-F', 'P4', 'San Jose', { status: 'Filled', start: null }),
  seat('P-T7-O', 'P4', 'San Jose', { status: 'Open', acceptedOffer: true, start: '2026-11-01' }),
  seat('P-T7-C', 'P4', 'San Jose', { status: 'Open', workerType: 'Contractor', start: '2026-11-01' }),
  seat('P-T7B', 'P5', 'San Jose'),
])

/** The quote context: as-of 30 Sep 2026, first open month 2026-10, full-month proration. */
export const tradeContext = (creditBp = 0): TradeContext => ({
  asOf: '2026-09-30',
  firstOpenMonth: '2026-10',
  proration: 'full-month',
  creditBalanceBp: (org) => (org === 'P-GTM-MGR' ? creditBp : 0),
  giveOrgOf: (ids) => (ids.length ? 'P-GTM-MGR' : null),
  freezeOn: () => null,
})

const want = (
  level: Level,
  location: string,
  over: Partial<TradeAsk['get']> = {},
  start: ISODate = '2027-01-01',
): TradeAsk['get'] => ({
  level,
  location,
  fte: 1,
  orgPositionId: 'P-GTM-MGR',
  businessUnit: GTM,
  jobFamily: 'Sales',
  start,
  count: 'max',
  partTimeRest: false,
  ...over,
})

const ask = (give: readonly string[], get: TradeAsk['get'], creditUsedBp = 0): TradeAsk => ({
  give,
  creditUsedBp,
  giveOrgPositionId: null,
  get,
})

/** A quote's expected values (null where 11.7 leaves the cell blank). */
export interface QuoteCase {
  id: string
  ask: TradeAsk
  /** The giving org's credit balance in bp before the quote. */
  creditBalanceBp: number
  ok: boolean
  getSeats: number | null
  /** FTE of each get seat, in order (a part-time rest seat last). */
  getFtes?: readonly number[]
  giveBp: number | null
  getBp: number | null
  creditBp: number | null
  ratio: number | null
  headsDelta: number | null
  inYearBp?: number
  getBandUsd?: number
  giveOrgPositionId?: string
  blocks?: readonly { code: TradeBlock; positionId?: string; text?: string }[]
  /** The chain facts the quote gives (bandEstimateUsd = getBandUsd) and the expected steps. */
  chain?: { facts: ChainFacts; expected: readonly (readonly [string, string])[] }
}

const MGR = ['manager', 'E1120'] as const
const HRBP = ['hrbp', 'E9001'] as const
const LEADER = ['leader', 'E1100'] as const

export const T1: QuoteCase = {
  id: 'T1',
  ask: ask(['P-T1'], want('P3', 'Bengaluru')),
  creditBalanceBp: 0,
  ok: true,
  getSeats: 8,
  giveBp: 19_160,
  getBp: 18_056,
  creditBp: 1_104,
  ratio: 8.4891,
  headsDelta: 7,
  inYearBp: -3_469.3333,
  getBandUsd: 270_873.6,
  giveOrgPositionId: 'P-GTM-MGR',
  chain: {
    facts: facts({ bandEstimateUsd: 270_873.6, checks: [check(GTM, 7, -52_031.6)] }),
    expected: [MGR, HRBP, LEADER],
  },
}

export const T1_PRIME: QuoteCase = {
  ...T1,
  id: 'T1′',
  chain: {
    facts: facts({ bandEstimateUsd: 270_873.6, checks: [check(GTM, 7, -52_031.6, 35)] }),
    expected: [MGR, HRBP, LEADER, ['finance', 'E8001']],
  },
}

export const T1H: QuoteCase = {
  id: 'T1h',
  ask: ask(['P-T1H'], want('P3', 'Bengaluru')),
  creditBalanceBp: 0,
  ok: true,
  getSeats: 8,
  giveBp: 19_160,
  getBp: 18_056,
  creditBp: 1_104,
  ratio: 8.4891,
  headsDelta: 8,
  chain: {
    facts: facts({ bandEstimateUsd: 270_873.6, checks: [check(GTM, 8, 67_718.4)] }),
    expected: [MGR, HRBP, LEADER],
  },
}

export const T2: QuoteCase = {
  id: 'T2',
  ask: ask(['P-T2'], want('P3', 'Bengaluru')),
  creditBalanceBp: 0,
  ok: true,
  getSeats: 4,
  giveBp: 10_082,
  getBp: 9_028,
  creditBp: 1_054,
  ratio: 4.467,
  headsDelta: 3,
  getBandUsd: 135_436.8,
  chain: {
    facts: facts({ bandEstimateUsd: 135_436.8, checks: [check(GTM, 3, -16_550.16)] }),
    expected: [MGR, HRBP],
  },
}

export const T3: QuoteCase = {
  id: 'T3',
  ask: ask(range('P-T3', 8), want('P5', 'San Jose'), 1_104),
  creditBalanceBp: 1_104,
  ok: true,
  getSeats: 1,
  giveBp: 19_160,
  getBp: 19_160,
  creditBp: 0,
  ratio: 1,
  headsDelta: -7,
  inYearBp: 276,
  getBandUsd: 287_400,
  chain: {
    facts: facts({ bandEstimateUsd: 287_400, checks: [check(GTM, -7, 4_131.6)] }),
    expected: [MGR, HRBP, LEADER],
  },
}

export const T4: QuoteCase = {
  id: 'T4',
  ask: ask(['P-T4'], want('P4', 'Munich', { partTimeRest: true })),
  creditBalanceBp: 0,
  ok: true,
  getSeats: 2,
  getFtes: [1, 0.8],
  giveBp: 19_160,
  getBp: 18_421,
  creditBp: 739,
  ratio: null,
  headsDelta: 1,
  getBandUsd: 276_320.16,
  chain: {
    facts: facts({ bandEstimateUsd: 276_320.16, checks: [check(GTM, 1, -50_669.96)] }),
    expected: [MGR, HRBP, LEADER],
  },
}

export const T5: QuoteCase = {
  id: 'T5',
  ask: ask(range('P-T5', 6), want('P5', 'San Jose')),
  creditBalanceBp: 0,
  ok: false,
  getSeats: 0,
  giveBp: 13_542,
  getBp: null,
  creditBp: null,
  ratio: 0.7068,
  headsDelta: null,
  blocks: [
    {
      code: 'not-enough',
      text: '6 P3 Bengaluru seats make 1.35 standard heads; 1 P5 San Jose needs 1.92. Add 3 more P3 Bengaluru seats.',
    },
  ],
}

export const T6: QuoteCase = {
  id: 'T6',
  ask: ask(
    ['P-T6'],
    want('P4', 'Haifa', { orgPositionId: 'P-SE-MGR', businessUnit: SE, jobFamily: 'Engineering' }),
  ),
  creditBalanceBp: 0,
  ok: true,
  getSeats: 1,
  giveBp: 15_733,
  getBp: 10_692,
  creditBp: 5_041,
  ratio: 1.4715,
  headsDelta: 0,
  getBandUsd: 160_380,
  giveOrgPositionId: 'P-GTM-MGR',
  chain: {
    facts: facts({
      bandEstimateUsd: 160_380,
      checks: [check(GTM, -1, -78_666.67), check(SE, 1, 40_095)],
    }),
    expected: [MGR, HRBP, ['hrbp', 'E9002'], ['leader', 'E1000'], ['leader', 'E2000'], ['finance', 'E8001']],
  },
}

export const T7A: QuoteCase = {
  id: 'T7a',
  ask: ask(['P-T7-F', 'P-T7-O', 'P-T7-C'], want('P3', 'Bengaluru')),
  creditBalanceBp: 0,
  ok: false,
  getSeats: null,
  giveBp: null,
  getBp: null,
  creditBp: null,
  ratio: null,
  headsDelta: null,
  /** One block per give seat, with its positionId (ask blocks may follow; they are not asserted). */
  blocks: [
    { code: 'filled', positionId: 'P-T7-F' },
    {
      code: 'accepted-offer',
      positionId: 'P-T7-O',
      text: 'This seat has an accepted offer. Its start date and terms come from the recruiting system.',
    },
    { code: 'not-employee', positionId: 'P-T7-C' },
  ],
}

const PART_TIME_TEXT = 'Bengaluru seats are full time only.'

export const T7B: readonly QuoteCase[] = [
  {
    id: 'T7b-fte',
    ask: ask(['P-T7B'], want('P3', 'Bengaluru', { fte: 0.5 })),
    creditBalanceBp: 0,
    ok: false,
    getSeats: null,
    giveBp: null,
    getBp: null,
    creditBp: null,
    ratio: null,
    headsDelta: null,
    blocks: [{ code: 'part-time-not-allowed', text: PART_TIME_TEXT }],
  },
  {
    id: 'T7b-rest',
    ask: ask(['P-T7B'], want('P3', 'Bengaluru', { partTimeRest: true })),
    creditBalanceBp: 0,
    ok: false,
    getSeats: null,
    giveBp: null,
    getBp: null,
    creditBp: null,
    ratio: null,
    headsDelta: null,
    blocks: [{ code: 'part-time-not-allowed', text: PART_TIME_TEXT }],
  },
]

/** Every quote that succeeds (the giveBp === getBp + creditBp and drift properties run over them). */
export const OK_QUOTES: readonly QuoteCase[] = [T1, T1H, T2, T3, T4, T6]

/* ───────────── requests (G3, CR1, applyTrade, chains) ───────────── */

const tradeFields = (over: Partial<TradeFields>): TradeFields => ({
  givePositionIds: [],
  giveOrgPositionId: 'P-GTM-MGR',
  creditUsedBp: 0,
  count: 1,
  jobFamily: 'Sales',
  partTimeRest: false,
  restFte: null,
  rateVersion: 'fy27-q1-reforecast',
  rateHash: 'sha256-fixture-q1-reforecast',
  giveBp: null,
  getBp: null,
  creditBp: null,
  ...over,
})

/** T1 as a request (pending: In review at the HRBP step). */
export const T1_REQUEST: HcRequest = hcRequest('R-T1', {
  type: 'Trade',
  state: 'In review',
  reasonCode: 'Location strategy',
  managerPositionId: 'P-GTM-MGR',
  level: 'P3',
  location: 'Bengaluru',
  fte: 1,
  startDate: '2027-01-01',
  trade: tradeFields({ givePositionIds: ['P-T1'], count: 8, giveBp: 19_160, getBp: 18_056, creditBp: 1_104 }),
})

/** T6 as a request: the get seats' org is Silicon Engineering's manager position. */
export const T6_REQUEST: HcRequest = hcRequest('R-T6', {
  type: 'Trade',
  reasonCode: 'Location strategy',
  managerPositionId: 'P-SE-MGR',
  businessUnit: SE,
  department: null,
  level: 'P4',
  location: 'Haifa',
  fte: 1,
  startDate: '2027-01-01',
  trade: tradeFields({
    givePositionIds: ['P-T6'],
    count: 1,
    jobFamily: 'Engineering',
    giveBp: 15_733,
    getBp: 10_692,
    creditBp: 5_041,
  }),
})

/** The trade requests behind each quote's chain, in QuoteCase order. */
export const TRADE_REQUESTS: Readonly<Record<string, HcRequest>> = {
  T1: T1_REQUEST,
  'T1′': T1_REQUEST,
  T1h: { ...T1_REQUEST, requestId: 'R-T1H', trade: { ...T1_REQUEST.trade!, givePositionIds: ['P-T1H'] } },
  T2: hcRequest('R-T2', {
    ...T1_REQUEST,
    requestId: 'R-T2',
    trade: tradeFields({ givePositionIds: ['P-T2'], count: 4 }),
  }),
  T3: hcRequest('R-T3', {
    ...T1_REQUEST,
    requestId: 'R-T3',
    level: 'P5',
    location: 'San Jose',
    trade: tradeFields({ givePositionIds: range('P-T3', 8), count: 1, creditUsedBp: 1_104 }),
  }),
  T4: hcRequest('R-T4', {
    ...T1_REQUEST,
    requestId: 'R-T4',
    level: 'P4',
    location: 'Munich',
    trade: tradeFields({ givePositionIds: ['P-T4'], count: 1, partTimeRest: true, restFte: 0.8 }),
  }),
  T6: T6_REQUEST,
}

/** CR1: trade credit is keyed to the giving org exactly, by fiscal year (11.2). */
export const CR1 = {
  requests: [
    { ...T1_REQUEST, requestId: 'R-CR-T1', state: 'Approved' },
    hcRequest('R-CR-T3', {
      type: 'Trade',
      state: 'In review',
      startDate: '2027-01-01',
      trade: tradeFields({
        givePositionIds: range('P-T3', 8),
        creditUsedBp: 1_104,
        giveBp: 19_160,
        getBp: 19_160,
        creditBp: 0,
      }),
    }),
    hcRequest('R-CR-SE', {
      type: 'Trade',
      state: 'Approved',
      startDate: '2027-01-01',
      trade: tradeFields({ giveOrgPositionId: 'P-SE-MGR', creditBp: 500, giveBp: 10_500, getBp: 10_000 }),
    }),
    hcRequest('R-CR-FY28', {
      type: 'Trade',
      state: 'Approved',
      startDate: '2027-06-01',
      trade: tradeFields({ creditBp: 900, giveBp: 10_900, getBp: 10_000 }),
    }),
    hcRequest('R-CR-REJ', {
      type: 'Trade',
      state: 'Rejected',
      startDate: '2027-01-01',
      trade: tradeFields({ creditUsedBp: 300 }),
    }),
  ] as readonly HcRequest[],
  /** Only R-CR-T1 approved (1,104). */
  afterT1: { org: 'P-GTM-MGR', year: 'FY27', ids: ['R-CR-T1'], expected: 1_104 },
  /** R-CR-T1 approved and R-CR-T3 pending using it all. */
  afterT3: { org: 'P-GTM-MGR', year: 'FY27', ids: ['R-CR-T1', 'R-CR-T3'], expected: 0 },
  /** Every request: other orgs, other years and rejected trades change nothing. */
  all: { org: 'P-GTM-MGR', year: 'FY27', expected: 0 },
  se: { org: 'P-SE-MGR', year: 'FY27', expected: 500 },
  fy28: { org: 'P-GTM-MGR', year: 'FY28', expected: 900 },
} as const

/* ───────────── applyTrade (the asks property) ───────────── */

/** Working before T1 is approved: the give seat, Planned P5 San Jose from 1 Nov 2026, under P-GTM-MGR. */
export const T1_POSITIONS: readonly PositionRow[] = [
  positionRow('P-GTM-MGR', { effectiveDate: '2025-04-01', level: 'M1' }),
  positionRow('P-T1', {
    effectiveDate: '2026-06-01',
    status: 'Planned',
    level: 'P5',
    managerPositionId: 'P-GTM-MGR',
    startDate: '2026-11-01',
  }),
]

export const T1_WORKING: WorkingPlan = {
  versionId: 'fy27-working',
  positions: T1_POSITIONS,
  assignments: [
    {
      employeeId: 'E1110',
      positionId: 'P-GTM-MGR',
      start: '2025-04-01',
      end: null,
      fte: 1,
      workerType: 'Employee',
    },
  ],
  newPositionId: (requestId, n) => `${requestId}-${n}`,
  placeOf: (_manager, location) => ({
    businessUnit: GTM,
    department: 'Sales',
    costCenter: location === 'Bengaluru' ? '4110-BLR' : '4110-SJC',
    legalEntity:
      location === 'Bengaluru' ? 'Northgate Semiconductor India Pvt. Ltd.' : 'Northgate Semiconductor Inc.',
  }),
  actor: { personId: 'E9001', name: 'Go-to-Market HRBP', mode: 'hrbp' },
}

export const T1_APPLIED = {
  at: '2026-10-05',
  /** The target date approved heads are counted at (FY27's end). */
  targetDate: '2027-03-31',
  /** P-GTM-MGR (Filled by E1110) + P-T1 before; P-GTM-MGR + 8 new P3 Bengaluru seats after. */
  approvedBefore: 2,
  approvedAfter: 9,
  headEffect: 7,
  /** The give seat ends the day before the approval date. */
  giveEnd: {
    positionId: 'P-T1',
    status: 'Eliminated',
    endReason: 'Traded',
    effectiveDate: '2026-10-05',
    endDate: '2026-10-04',
  },
  created: 8,
} as const

/* ───────────── every trade's asks property (11.7) ───────────── */

/** The two manager positions the 11.7 trades give from and get into, Filled. */
const ORG_ROWS: readonly PositionRow[] = [
  positionRow('P-GTM-MGR', { effectiveDate: '2025-04-01', level: 'M1' }),
  positionRow('P-SE-MGR', {
    effectiveDate: '2025-04-01',
    level: 'M1',
    businessUnit: SE,
    department: 'Design Verification',
    costCenter: '1130-SJC',
    jobFamily: 'Engineering',
  }),
]

const COST_CENTER: Readonly<Record<string, string>> = {
  'San Jose': '4110-SJC',
  Munich: '4110-MUC',
  Bengaluru: '4110-BLR',
  Haifa: '4110-HFA',
}

/** Working rows for a trade's give seats, as TRADE_SEATS describes them on 30 Sep 2026 (rows from 1 Jun 2026). */
export function giveSeatRows(givePositionIds: readonly string[]): PositionRow[] {
  return givePositionIds.flatMap((id) => {
    const s = TRADE_SEATS.get(id)
    if (!s) return []
    return [
      positionRow(id, {
        effectiveDate: '2026-06-01',
        status: s.status === 'Filled' ? 'Open' : s.status,
        level: s.level,
        location: s.location,
        costCenter: COST_CENTER[s.location] ?? '4110-SJC',
        managerPositionId: s.orgPositionId,
        workerType: s.workerType,
        fte: s.fte,
        startDate: s.start,
      }),
    ]
  })
}

/** The Working plan a trade is approved into: the two org positions and its give seats. */
export function tradeWorking(req: HcRequest): WorkingPlan {
  return {
    versionId: 'fy27-working',
    positions: [...ORG_ROWS, ...giveSeatRows(req.trade?.givePositionIds ?? [])],
    assignments: [
      {
        employeeId: 'E1110',
        positionId: 'P-GTM-MGR',
        start: '2025-04-01',
        end: null,
        fte: 1,
        workerType: 'Employee',
      },
      {
        employeeId: 'E2110',
        positionId: 'P-SE-MGR',
        start: '2025-04-01',
        end: null,
        fte: 1,
        workerType: 'Employee',
      },
    ],
    newPositionId: (requestId, n) => `${requestId}-${n}`,
    placeOf: (manager, location) =>
      manager.startsWith('P-SE')
        ? {
            businessUnit: SE,
            department: 'Design Verification',
            costCenter: location === 'Haifa' ? '1130-HFA' : '1130-SJC',
            legalEntity: 'Northgate Semiconductor Israel Ltd.',
          }
        : {
            businessUnit: GTM,
            department: 'Sales',
            costCenter: COST_CENTER[location] ?? '4110-SJC',
            legalEntity: 'Northgate Semiconductor Inc.',
          },
    actor: { personId: 'E9001', name: 'Go-to-Market HRBP', mode: 'hrbp' },
  }
}

/** The rise in asks heads at FY end while pending, by org (= the rise in approved heads after approval). */
export const ASKS_RISE: Readonly<Record<string, { company: number; gtm: number; se: number }>> = {
  T1: { company: 7, gtm: 7, se: 0 },
  T1h: { company: 8, gtm: 8, se: 0 },
  T2: { company: 3, gtm: 3, se: 0 },
  T3: { company: -7, gtm: -7, se: 0 },
  T4: { company: 1, gtm: 1, se: 0 },
  T6: { company: 0, gtm: -1, se: 1 },
}
