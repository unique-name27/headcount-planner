/**
 * Hiring progress fixtures (docs/PLAN.md 9.7, changes C36 and C37; docs/CONTRACTS-HIRING.md). Plain
 * data, heads, dates and IDs only; every expected value is written out by hand below, never computed
 * here.
 *
 * HG1 (the plan's fixture): a team of 10 approved seats at FY end (8 by Q3 end): 6 Filled, 1 signed
 * offer starting in Q3, 1 Open with no offer (target start Q3), 2 Planned starting Q4; 1 person not in
 * plan; as-of 31 Aug 2026 (in Q2, August the last close, so Q1 is history and Q2 to Q4 are ahead).
 * A(Q3) = 8, H = 7, S(Q3) = 1, O(Q3) = 0; A(Q4) = 10, S(Q4) = 1, O(Q4) = 2; seat view Q4 = 3 open seats
 * − 1 not in plan = 2; O(Q2) = 6 − 7 − 0 = −1 ("Over by 1", the person not in plan). Velocity: hires 3,
 * 1, 0 and exits 0, 1, 1 in the last 3 closed months (Jun to Aug 2026): pace 4/3 (1.33), exit pace 2/3
 * (0.67), net 2/3 (0.67); months to close 2 ÷ 2/3 = 3.0; headline open to hire (FY27) = 2. The months
 * ahead (C37): future starts 0, 1, 0, 0, 0, 0, 0 from September to March, the signed offer in October;
 * the Open seat with no offer and the two Planned seats are never future starts, and no move in, so
 * M(q) is 0 in every quarter.
 *
 * HG2: an approved Elimination of a Filled seat (in Q3), one of an Open seat (the last day is the Q3
 * end, so it counts in Q3 and not Q4), and an approved internal move whose held seat (SC-6) HRIS still
 * shows the mover on; On hold and Eliminated seats are left out before the engine (R1).
 * HG3: FY28 shown at 30 Sep 2026: every quarter ahead, months left 9, 12, 15 and 18.
 * HG4: no closed month yet: no pace, no attrition, not closing; Q1 is over, so it is history.
 * HG5: a new team whose seats all start in Q4: Q3 has no seat; attrition has 0 average heads.
 * HG6: accepted starts on the as-of day, on the fiscal year end and after it.
 * HG8 (C37): moves in, M(q): one into an Open seat in Q3, one into a Planned seat in Q4 and one into a
 * Filled seat whose holder leaves the day before; a signed offer in Q3. O(q) = A(q) − H − S(q) − M(q).
 */
import { shiftMonth } from '@/data/fiscal'
import type { FiscalYear, ISODate, Month } from '@/data/schema'
import type {
  HiringEvent,
  HiringForecastMonth,
  HiringHeadsAt,
  HiringInput,
  HiringMove,
  HiringOffer,
  HiringPerson,
  HiringSeat,
} from './hiring'

/* ───────────── builders ───────────── */

/** An approved seat, not Filled, with no date unless given. */
export const seat = (positionId: string, over: Partial<HiringSeat> = {}): HiringSeat => ({
  positionId,
  filled: false,
  acceptedStart: null,
  plannedStart: null,
  lastApprovedDay: null,
  ...over,
})
/** A Filled approved seat. */
export const filledSeat = (positionId: string, over: Partial<HiringSeat> = {}): HiringSeat =>
  seat(positionId, { filled: true, ...over })
export const person = (personId: string, positionId: string | null): HiringPerson => ({
  personId,
  positionId,
})
export const offer = (reqId: string, positionId: string, startDate: ISODate): HiringOffer => ({
  reqId,
  positionId,
  startDate,
})
/** A move in (C37): an approved internal move into the scope that has not started. */
export const moveIn = (moveId: string, positionId: string, startDate: ISODate): HiringMove => ({
  moveId,
  positionId,
  startDate,
})
export const event = (personId: string, positionId: string | null, on: ISODate): HiringEvent => ({
  personId,
  positionId,
  on,
})
export const headsAt = (month: Month, heads: number): HiringHeadsAt => ({ month, heads })
/** A forecast month: its modeled exits only (no forecast start reaches the engine, C37). */
export const forecastMonth = (month: Month, modeledExits: number): HiringForecastMonth => ({
  month,
  modeledExits,
})

/** An input with FY27, as-of 30 Sep 2026, September closed and nothing else unless given. */
export function hiringInput(over: Partial<HiringInput> = {}): HiringInput {
  return {
    asOf: '2026-09-30',
    fiscalYear: 'FY27' as FiscalYear,
    lastClose: '2026-09',
    seats: [],
    people: [],
    offers: [],
    moves: [],
    hires: [],
    exits: [],
    headsAt: [],
    forecast: [],
    ...over,
  }
}

/* ───────────── HG1 ───────────── */

export const HG1 = {
  input: hiringInput({
    asOf: '2026-08-31',
    lastClose: '2026-08',
    seats: [
      filledSeat('P-HG-01'),
      filledSeat('P-HG-02'),
      filledSeat('P-HG-03'),
      filledSeat('P-HG-04'),
      filledSeat('P-HG-05'),
      filledSeat('P-HG-06'),
      // Open, its offer signed: starts 5 Oct 2026 (Q3), a future start.
      seat('P-HG-07', { acceptedStart: '2026-10-05', plannedStart: '2026-10-01' }),
      // Open, no offer, target start 2 Nov 2026 (Q3): never a future start (C37).
      seat('P-HG-08', { plannedStart: '2026-11-02' }),
      // Planned, starting in Q4.
      seat('P-HG-09', { plannedStart: '2027-01-04' }),
      seat('P-HG-10', { plannedStart: '2027-02-01' }),
    ],
    people: [
      person('E-HG-01', 'P-HG-01'),
      person('E-HG-02', 'P-HG-02'),
      person('E-HG-03', 'P-HG-03'),
      person('E-HG-04', 'P-HG-04'),
      person('E-HG-05', 'P-HG-05'),
      person('E-HG-06', 'P-HG-06'),
      person('E-HG-11', null),
    ],
    offers: [offer('R-HG-07', 'P-HG-07', '2026-10-05')],
    hires: [
      // Before the trailing 12 closed months: not counted.
      event('E-HG-13', 'P-HG-07', '2024-05-06'),
      event('E-HG-01', 'P-HG-01', '2025-10-06'),
      event('E-HG-12', 'P-HG-08', '2025-11-03'),
      event('E-HG-02', 'P-HG-02', '2026-01-12'),
      event('E-HG-04', 'P-HG-04', '2026-06-01'),
      event('E-HG-05', 'P-HG-05', '2026-06-08'),
      event('E-HG-06', 'P-HG-06', '2026-06-15'),
      event('E-HG-03', 'P-HG-03', '2026-07-01'),
    ],
    exits: [
      event('E-HG-14', 'P-HG-03', '2026-01-30'),
      event('E-HG-13', 'P-HG-07', '2026-07-17'),
      event('E-HG-12', 'P-HG-08', '2026-08-14'),
      // A known exit ahead (Q3).
      event('E-HG-05', 'P-HG-05', '2026-11-20'),
    ],
    // Heads at each closed month-end: 3 at the start (E-HG-11, E-HG-13, E-HG-14), then the hires and
    // exits above, so 7 at 31 Aug 2026 (E-HG-01 to E-HG-06 and E-HG-11).
    headsAt: [
      headsAt('2025-09', 3),
      headsAt('2025-10', 4),
      headsAt('2025-11', 5),
      headsAt('2025-12', 5),
      headsAt('2026-01', 5),
      headsAt('2026-02', 5),
      headsAt('2026-03', 5),
      headsAt('2026-04', 5),
      headsAt('2026-05', 5),
      headsAt('2026-06', 8),
      headsAt('2026-07', 8),
      headsAt('2026-08', 7),
    ],
    // The forecast's open months to FY end, in heads: modeled exits only, chosen exact in binary (the
    // forecast's own starts, P-HG-08 and the two Planned seats at a 0.9 fill rate, never reach it, C37).
    forecast: [
      forecastMonth('2026-09', 0.0625),
      forecastMonth('2026-10', 0.0625),
      forecastMonth('2026-11', 0.0625),
      forecastMonth('2026-12', 0.0625),
      forecastMonth('2027-01', 0.125),
      forecastMonth('2027-02', 0.125),
      forecastMonth('2027-03', 0.125),
    ],
  }),
  heads: {
    total: 7,
    inApprovedSeats: 6,
    notInPlan: 1,
    elsewhere: 0,
    notInPlanIds: ['E-HG-11'],
  },
  /** Approved at the as-of date (the 6 Filled seats) − H (7). */
  openNow: -1,
  q1: { kind: 'history', actualHeads: 8, hires: 3, hireIds: ['E-HG-04', 'E-HG-05', 'E-HG-06'], exits: 0 },
  q2: {
    kind: 'ahead',
    approved: 6,
    accepted: 0,
    open: -1,
    openSeats: 0,
    newToHire: 0,
    expectedExits: { known: 0, modeled: 0.0625, total: 0.0625 },
    toReachPlan: -0.9375,
    monthsLeft: 1,
    paceStatus: 'nothing-to-hire',
  },
  q3: {
    kind: 'ahead',
    approved: 8,
    accepted: 1,
    acceptedIds: ['R-HG-07'],
    open: 0,
    openSeatIds: ['P-HG-08'],
    newToHire: 1,
    expectedExits: { known: 1, knownIds: ['E-HG-05'], modeled: 0.25, total: 1.25 },
    toReachPlan: 1.25,
    monthsLeft: 4,
    /** 1.25 ÷ 4. */
    neededPace: 0.3125,
    paceStatus: 'on-pace',
  },
  q4: {
    kind: 'ahead',
    approved: 10,
    accepted: 1,
    open: 2,
    openSeatIds: ['P-HG-08', 'P-HG-09', 'P-HG-10'],
    newToHire: 2,
    expectedExits: { known: 1, modeled: 0.625, total: 1.625 },
    toReachPlan: 3.625,
    monthsLeft: 7,
    /** 3.625 ÷ 7. */
    neededPace: 3.625 / 7,
    paceStatus: 'on-pace',
  },
  openFyEnd: 2,
  acceptedToCome: 1,
  /** M(q) in every quarter ahead: no move in. */
  movesIn: 0,
  /** Sep 2025 to Aug 2026. */
  hiresByMonth: [0, 1, 1, 0, 1, 0, 0, 0, 0, 3, 1, 0],
  exitsByMonth: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 1],
  paces: {
    hires3: 4 / 3,
    hires6: 4 / 6,
    exits3: 2 / 3,
    exits6: 2 / 6,
    net3: 2 / 3,
    net6: 2 / 6,
    exits12: 3,
    /** (3 + 4 + 5 × 7 + 8 + 8 + 7) ÷ 12 = 65 ÷ 12. */
    averageHeads12: 65 / 12,
    /** 3 ÷ 65/12 = 36/65 (55.4%). */
    attrition: 36 / 65,
  },
  monthsToClose: 3,
  /**
   * The months ahead, September 2026 to March 2027 (C37): future starts are the signed offer R-HG-07
   * in October and nothing else (P-HG-08 has no offer; the Planned seats have none), whole people;
   * exits are the known E-HG-05 in November plus the modeled exits.
   */
  ahead: {
    months: ['2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03'],
    hires: [0, 1, 0, 0, 0, 0, 0],
    startIds: [[], ['R-HG-07'], [], [], [], [], []],
    exits: [0.0625, 0.0625, 1.0625, 0.0625, 0.125, 0.125, 0.125],
  },
} as const

/* ───────────── HG2: eliminations, On hold and a held seat ───────────── */

export const HG2 = {
  input: hiringInput({
    seats: [
      // An approved Elimination effective 1 Dec 2026: an approved head through 30 Nov.
      filledSeat('P-EL-1', { lastApprovedDay: '2026-11-30' }),
      // An approved Elimination effective 1 Jan 2027: the last day is the Q3 end, which counts.
      seat('P-EL-2', { plannedStart: '2026-10-15', lastApprovedDay: '2026-12-31' }),
      filledSeat('P-EL-3'),
      // The receiving seat of an approved internal move effective 1 Oct 2026 (Open until HRIS shows it).
      seat('P-EL-4', { plannedStart: '2026-10-01' }),
    ],
    people: [
      person('E-EL-1', 'P-EL-1'),
      person('E-EL-3', 'P-EL-3'),
      // The mover, still on the seat the move holds (SC-6), which is no approved head.
      person('E-EL-5', 'P-EL-5'),
    ],
    hires: [event('E-EL-3', 'P-EL-3', '2026-08-03')],
    exits: [
      // The last holder of P-EL-7, eliminated from 1 Sep 2026.
      event('E-EL-7', 'P-EL-7', '2026-08-31'),
      // P-EL-1's holder, ended at the Elimination.
      event('E-EL-1', 'P-EL-1', '2026-11-30'),
    ],
    headsAt: [headsAt('2026-06', 3), headsAt('2026-07', 3), headsAt('2026-08', 4), headsAt('2026-09', 3)],
    forecast: [
      forecastMonth('2026-10', 0.03125),
      forecastMonth('2026-11', 0.03125),
      forecastMonth('2026-12', 0.03125),
      forecastMonth('2027-01', 0.03125),
      forecastMonth('2027-02', 0.03125),
      forecastMonth('2027-03', 0.03125),
    ],
  }),
  /** Left out by R1 before the engine: the held seat (SC-6), an On hold seat and an Eliminated one. */
  leftOut: ['P-EL-5', 'P-EL-6', 'P-EL-7'],
  heads: { total: 3, inApprovedSeats: 2, notInPlan: 0, elsewhere: 1 },
  openNow: -1,
  q2: { kind: 'history', actualHeads: 3, hires: 1, exits: 1, exitIds: ['E-EL-7'] },
  q3: {
    approvedIds: ['P-EL-2', 'P-EL-3', 'P-EL-4'],
    open: 0,
    openSeatIds: ['P-EL-2', 'P-EL-4'],
    seatView: { openSeats: 2, notInPlan: 0, elsewhere: 1, inEndedSeats: 1, otherStarts: 0, rest: 0 },
    inEndedSeatIds: ['E-EL-1'],
    newToHire: 1,
    expectedExits: { known: 1, knownIds: ['E-EL-1'], modeled: 0.09375, total: 1.09375 },
    toReachPlan: 1.09375,
    monthsLeft: 3,
    /** 1.09375 ÷ 3 against a 3-month pace of 1/3: behind by 0.03125. */
    neededPace: 1.09375 / 3,
    paceStatus: 'behind',
    behindBy: 0.03125,
  },
  q4: {
    approvedIds: ['P-EL-3', 'P-EL-4'],
    /** "Over by 1": the eliminated seat's holder counts in H until their last day. */
    open: -1,
    openSeatIds: ['P-EL-4'],
    seatView: { openSeats: 1, notInPlan: 0, elsewhere: 1, inEndedSeats: 1, otherStarts: 0, rest: 0 },
    newToHire: -1,
    expectedExits: { known: 1, modeled: 0.1875, total: 1.1875 },
    toReachPlan: 0.1875,
    monthsLeft: 6,
    paceStatus: 'on-pace',
  },
  openFyEnd: -1,
  pace3: 1 / 3,
} as const

/* ───────────── HG3: FY28 shown ───────────── */

const FY28_FORECAST: HiringForecastMonth[] = [
  // A closed month and a month after FY28's end, both left out of the velocity months.
  forecastMonth('2026-09', 5),
  forecastMonth('2028-04', 5),
]
for (let i = 0; i < 18; i++) {
  const m = shiftMonth('2026-10', i)
  FY28_FORECAST.push(forecastMonth(m, 0.125))
}

export const HG3 = {
  input: hiringInput({
    fiscalYear: 'FY28' as FiscalYear,
    seats: [
      filledSeat('P-F28-1'),
      filledSeat('P-F28-2'),
      filledSeat('P-F28-3'),
      // An accepted offer starting in FY27 Q3, before FY28 begins.
      seat('P-F28-4', { acceptedStart: '2026-11-02', plannedStart: '2026-11-01' }),
      // Planned: FY28 Q1 and Q3.
      seat('P-F28-5', { plannedStart: '2027-05-03' }),
      seat('P-F28-6', { plannedStart: '2027-10-04' }),
      // An FY28 seat whose accepted start falls after FY28's end.
      seat('P-F28-7', { acceptedStart: '2028-04-03', plannedStart: '2028-03-01' }),
    ],
    people: [person('E-F28-1', 'P-F28-1'), person('E-F28-2', 'P-F28-2'), person('E-F28-3', 'P-F28-3')],
    offers: [offer('R-F28-4', 'P-F28-4', '2026-11-02'), offer('R-F28-7', 'P-F28-7', '2028-04-03')],
    hires: [
      event('E-F28-1', 'P-F28-1', '2026-07-06'),
      event('E-F28-2', 'P-F28-2', '2026-08-03'),
      event('E-F28-3', 'P-F28-3', '2026-09-07'),
    ],
    forecast: FY28_FORECAST,
  }),
  frames: [
    { label: 'Q1', start: '2027-04-01', end: '2027-06-30' },
    { label: 'Q2', start: '2027-07-01', end: '2027-09-30' },
    { label: 'Q3', start: '2027-10-01', end: '2027-12-31' },
    { label: 'Q4', start: '2028-01-01', end: '2028-03-31' },
  ],
  approved: [5, 5, 6, 6],
  accepted: [1, 1, 1, 1],
  open: [1, 1, 2, 2],
  newToHire: [1, 0, 1, 0],
  monthsLeft: [9, 12, 15, 18],
  /** 0.125 a month from October 2026. */
  modeled: [9 * 0.125, 12 * 0.125, 15 * 0.125, 18 * 0.125],
  openNow: 0,
  openFyEnd: 2,
  acceptedToCome: 1,
  /** 12 closed months, then October 2026 to March 2028. */
  velocityMonths: { actual: 12, forecast: 18, first: '2025-10', last: '2028-03' },
  /** Hires 1, 1, 1 in July to September 2026, no exits: 2 ÷ 1. */
  monthsToClose: 2,
} as const

/* ───────────── HG4: no closed month ───────────── */

export const HG4 = {
  input: hiringInput({
    lastClose: null,
    seats: [
      filledSeat('P-NC-1'),
      filledSeat('P-NC-2'),
      // Its target start has passed: open to hire now.
      seat('P-NC-3', { plannedStart: '2026-07-01' }),
      seat('P-NC-4', { plannedStart: '2026-12-01' }),
    ],
    people: [person('E-NC-1', 'P-NC-1'), person('E-NC-2', 'P-NC-2')],
    hires: [event('E-NC-1', 'P-NC-1', '2026-05-04'), event('E-NC-2', 'P-NC-2', '2026-08-03')],
    exits: [event('E-NC-9', 'P-NC-3', '2026-06-12')],
    forecast: [
      forecastMonth('2026-10', 0.0625),
      forecastMonth('2026-11', 0.0625),
      forecastMonth('2026-12', 0.0625),
      forecastMonth('2027-01', 0.0625),
      forecastMonth('2027-02', 0.0625),
      forecastMonth('2027-03', 0.0625),
    ],
  }),
  /** Q1 ended before the as-of date: history, with no heads at its end (no close). */
  q1: { kind: 'history', actualHeads: null, hires: 1, exits: 1 },
  /** Q2 ends on the as-of date: ahead, with no month left. */
  q2: { kind: 'ahead', approved: 3, open: 1, monthsLeft: 0, neededPace: null, toReachPlan: 1, status: null },
  q3: { approved: 4, open: 2, monthsLeft: 3, toReachPlan: 2.1875 },
  q4: { approved: 4, open: 2, monthsLeft: 6, toReachPlan: 2.375 },
  openNow: 1,
  openFyEnd: 2,
  forecastMonths: 6,
} as const

/* ───────────── HG5: a quarter with no seat ───────────── */

export const HG5 = {
  input: hiringInput({
    seats: [
      seat('P-NT-1', { plannedStart: '2027-01-11' }),
      seat('P-NT-2', { plannedStart: '2027-02-01' }),
      seat('P-NT-3', { acceptedStart: '2027-01-04', plannedStart: '2027-01-04' }),
    ],
    offers: [offer('R-NT-3', 'P-NT-3', '2027-01-04')],
    headsAt: Array.from({ length: 12 }, (_, i) => headsAt(shiftMonth('2025-10', i), 0)),
  }),
  q3: { approved: 0, accepted: 0, open: 0, openSeats: 0, toReachPlan: 0, paceStatus: 'nothing-to-hire' },
  q4: { approved: 3, accepted: 1, open: 2, openSeatIds: ['P-NT-1', 'P-NT-2'], newToHire: 2 },
  openFyEnd: 2,
} as const

/* ───────────── HG6: accepted starts on the as-of day, on FY end and after it ───────────── */

export const HG6 = {
  input: hiringInput({
    seats: [
      filledSeat('P-AS-1'),
      // Started on the as-of day: HRIS has the hire, the req is still at Offer accepted.
      filledSeat('P-AS-4', { acceptedStart: '2026-09-30' }),
      // Starts on the fiscal year end: counts in Q4.
      seat('P-AS-3', { acceptedStart: '2027-03-31', plannedStart: '2027-03-01' }),
      // Starts after the fiscal year end: in no quarter.
      seat('P-AS-2', { acceptedStart: '2027-04-05', plannedStart: '2027-03-01' }),
    ],
    people: [person('E-AS-1', 'P-AS-1'), person('E-AS-4', 'P-AS-4')],
    offers: [
      offer('R-AS-4', 'P-AS-4', '2026-09-30'),
      offer('R-AS-3', 'P-AS-3', '2027-03-31'),
      offer('R-AS-2', 'P-AS-2', '2027-04-05'),
    ],
    hires: [event('E-AS-4', 'P-AS-4', '2026-09-30')],
  }),
  q3: { approved: ['P-AS-1', 'P-AS-4'], accepted: [], open: 0 },
  q4: { approved: ['P-AS-1', 'P-AS-4', 'P-AS-3'], accepted: ['R-AS-3'], open: 0, openSeatIds: [] },
  /** R1's approved heads at FY end, P-AS-2 included. */
  r1Heads: 4,
  openFyEnd: 0,
  acceptedToCome: 1,
} as const

/* ───────────── HG8: moves in, M(q) (C37) ───────────── */

export const HG8 = {
  input: hiringInput({
    seats: [
      filledSeat('P-MV-1'),
      // Filled now; its holder leaves 31 Jan 2027 and a move in takes it from 1 Feb 2027.
      filledSeat('P-MV-2'),
      // Open: a move in takes it from 2 Nov 2026 (Q3). The tab sets the move's date as the seat's start (H2).
      seat('P-MV-3', { acceptedStart: '2026-11-02', plannedStart: '2026-10-01' }),
      // Open, its offer signed: starts 7 Dec 2026 (Q3), a future start.
      seat('P-MV-4', { acceptedStart: '2026-12-07', plannedStart: '2026-12-01' }),
      // Planned for 11 Jan 2027; a move in takes it from 1 Feb 2027 (Q4).
      seat('P-MV-5', { acceptedStart: '2027-02-01', plannedStart: '2027-01-11' }),
      // Planned for 15 Feb 2027, no offer and no move: open to hire.
      seat('P-MV-6', { plannedStart: '2027-02-15' }),
    ],
    people: [person('E-MV-1', 'P-MV-1'), person('E-MV-2', 'P-MV-2')],
    offers: [offer('R-MV-4', 'P-MV-4', '2026-12-07')],
    moves: [
      moveIn('move:E-X1|2026-11-02', 'P-MV-3', '2026-11-02'),
      moveIn('move:E-X2|2027-02-01', 'P-MV-5', '2027-02-01'),
      moveIn('move:E-X3|2027-02-01', 'P-MV-2', '2027-02-01'),
    ],
    exits: [event('E-MV-2', 'P-MV-2', '2027-01-31')],
    forecast: [
      forecastMonth('2026-10', 0),
      forecastMonth('2026-11', 0),
      forecastMonth('2026-12', 0),
      forecastMonth('2027-01', 0),
      forecastMonth('2027-02', 0),
      forecastMonth('2027-03', 0),
    ],
  }),
  /** Approved now (the 2 Filled seats) − H (2). */
  openNow: 0,
  q3: {
    approved: 4,
    accepted: 1,
    acceptedIds: ['R-MV-4'],
    movesIn: 1,
    moveInIds: ['move:E-X1|2026-11-02'],
    /** 4 − 2 − 1 − 1. */
    open: 0,
    openSeatIds: [],
    seatView: { openSeats: 0, notInPlan: 0, elsewhere: 0, inEndedSeats: 0, otherStarts: 0, rest: 0 },
    newToHire: 0,
  },
  q4: {
    approved: 6,
    accepted: 1,
    movesIn: 3,
    moveInIds: ['move:E-X1|2026-11-02', 'move:E-X2|2027-02-01', 'move:E-X3|2027-02-01'],
    /** 6 − 2 − 1 − 3. */
    open: 0,
    openSeatIds: ['P-MV-6'],
    /** 1 open seat − 1 move in on a seat that is not open (P-MV-2, Filled) = 0. */
    seatView: { openSeats: 1, notInPlan: 0, elsewhere: 0, inEndedSeats: 0, otherStarts: 1, rest: 0 },
    otherStartIds: ['move:E-X3|2027-02-01'],
    newToHire: 0,
    /** E-MV-2's last day: the move in backfills it, so to reach plan is that 1 head. */
    toReachPlan: 1,
  },
  openFyEnd: 0,
  acceptedToCome: 1,
  movesToCome: 3,
  /** The months ahead: the signed offer in December is the only future start; a move in is never one. */
  aheadHires: [0, 0, 1, 0, 0, 0],
  /** Without the moves: O(Q4) = 6 − 2 − 1 = 3, the 3 seats the moves would take open. */
  withoutMoves: { q3Open: 1, q4Open: 3, q4OpenSeatIds: ['P-MV-3', 'P-MV-5', 'P-MV-6'] },
} as const
