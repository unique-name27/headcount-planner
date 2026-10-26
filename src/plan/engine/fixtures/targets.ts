/**
 * Targets, asks and gap fixtures (docs/PLAN.md 6.9, 10.3; changes C2 and C18).
 *
 * G1 (story 6): target = B + 40, asks = B + 58 (FY28 Working approved heads at 31 Mar 2028 equal FY27
 * Working approved heads at 31 Mar 2027 = B, plus 58 pending asks): gap −18; the cut line falls after
 * the 40th ranked head. Here B = 12.
 * G2 (target date): a target dated 30 Sep 2027 (FY28). A Planned seat starting 1 Jan 2028 and a
 * pending New role starting 1 Jan 2028 are both left out of asks. With the target date blank (31 Mar
 * 2028) both count.
 * G3 (in-year asks cost, 11.7 rates): the T1 trade pending, its give seat Planned from 1 Nov 2026, its
 * 8 get seats from 1 Jan 2027, first open month 2026-10. Asks cost changes by 8 × $33,859.20 × 3/12 −
 * $287,400 × 5/12 = $67,718.40 − $119,750.00 = −$52,031.60 (the quote's inYearBp −3,469.33 is
 * −$52,040.00, the $8.40 apart being bp rounding). Negative control: adding the annual band estimate
 * gives $270,873.60 − $119,750.00 = +$151,123.60 and must fail.
 * A2 (head effect): a pending Backfill on an Open seat leaves asks unchanged; a pending Backfill on a
 * seat held On hold by an internal move adds 1.
 */
import type { PositionRow, TargetRow } from '@/data/schema'
import type { Assignment, HcRequest, OrgMatch } from '../../types'
import type { AsksContextInput } from '../targets'
import { fixtureBandUsd } from './band'
import { assignment, hcRequest, positionRow } from './common'
import { T1_POSITIONS, T1_REQUEST, T1_WORKING } from './trade'

const SE = 'Silicon Engineering'
const GTM = 'Go-to-Market'

export const IN_SE: OrgMatch = (seat) => seat.businessUnit === SE
export const IN_GTM: OrgMatch = (seat) => seat.businessUnit === GTM

const seRow = (positionId: string, over: Partial<PositionRow> = {}): PositionRow =>
  positionRow(positionId, {
    effectiveDate: '2025-04-01',
    businessUnit: SE,
    department: 'Design Verification',
    costCenter: '1130-SJC',
    jobFamily: 'Engineering',
    ...over,
  })

/** n Filled Silicon Engineering seats under one manager seat (the manager's included), with holders. */
function filledTeam(prefix: string, n: number): { positions: PositionRow[]; assignments: Assignment[] } {
  const mgr = `P-${prefix}-MGR`
  const positions = [seRow(mgr, { level: 'M1' })]
  const assignments = [assignment(`E-${prefix}-MGR`, mgr, '2024-01-01')]
  for (let i = 1; i < n; i++) {
    const id = `P-${prefix}-${String(i).padStart(2, '0')}`
    positions.push(seRow(id, { managerPositionId: mgr }))
    assignments.push(assignment(`E-${prefix}-${String(i).padStart(2, '0')}`, id, '2024-01-01'))
  }
  return { positions, assignments }
}

const context = (
  positions: readonly PositionRow[],
  assignments: readonly Assignment[],
): AsksContextInput => ({
  positions,
  assignments,
  reqs: [],
  requests: [],
  proration: 'daily',
  firstOpenMonth: '2026-10',
  bandUsd: (seat) => fixtureBandUsd(seat),
})

/* ───────────── G1 ───────────── */

const G1_TEAM = filledTeam('G1', 12)

const G1_ASKS: HcRequest[] = Array.from({ length: 58 }, (_, i) =>
  hcRequest(`R-G1-${String(i + 1).padStart(2, '0')}`, {
    type: 'New role',
    requesterId: 'E-G1-MGR',
    managerPositionId: 'P-G1-MGR',
    businessUnit: SE,
    department: 'Design Verification',
    level: 'P3',
    location: 'San Jose',
    fte: 1,
    startDate: '2027-06-01',
    cycleId: 'cyc-fy28',
    priority: i + 1,
    submittedAt: `2026-10-${String(1 + (i % 15)).padStart(2, '0')}T09:00`,
  }),
)

export const G1 = {
  context: context(G1_TEAM.positions, G1_TEAM.assignments),
  org: IN_SE,
  requests: G1_ASKS,
  target: {
    fiscalYear: 'FY28',
    targetDate: null,
    businessUnit: SE,
    targetHeads: 52,
    targetCost: null,
  } as TargetRow,
  targetDate: '2028-03-31',
  /** B: FY27 Working approved heads at 31 Mar 2027 and FY28's at 31 Mar 2028. */
  b: 12,
  bDates: ['2027-03-31', '2028-03-31'],
  asks: { heads: 70, seatHeads: 12, pendingHeads: 58 },
  gapHeads: -18,
  /** target − asks without the cycle's asks. */
  room: 40,
  cutAfter: 40,
  above: 40,
  below: 18,
} as const

/* ───────────── G2 ───────────── */

const G2_TEAM = filledTeam('G2', 5)

export const G2 = {
  context: context(
    [
      ...G2_TEAM.positions,
      seRow('P-G2-PL', {
        effectiveDate: '2027-04-01',
        status: 'Planned',
        managerPositionId: 'P-G2-MGR',
        startDate: '2028-01-01',
      }),
    ],
    G2_TEAM.assignments,
  ),
  org: IN_SE,
  requests: [
    hcRequest('R-G2', {
      type: 'New role',
      requesterId: 'E-G2-MGR',
      managerPositionId: 'P-G2-MGR',
      businessUnit: SE,
      level: 'P3',
      location: 'San Jose',
      fte: 1,
      startDate: '2028-01-01',
    }),
  ],
  dated: {
    target: {
      fiscalYear: 'FY28',
      targetDate: '2027-09-30',
      businessUnit: SE,
      targetHeads: 6,
      targetCost: null,
    } as TargetRow,
    date: '2027-09-30',
    asks: 5,
  },
  blank: {
    target: {
      fiscalYear: 'FY28',
      targetDate: null,
      businessUnit: SE,
      targetHeads: 6,
      targetCost: null,
    } as TargetRow,
    date: '2028-03-31',
    asks: 7,
  },
} as const

/* ───────────── G3 ───────────── */

export const G3 = {
  context: { ...context(T1_POSITIONS, T1_WORKING.assignments), proration: 'full-month' } as AsksContextInput,
  org: IN_GTM,
  request: T1_REQUEST,
  fiscalYear: 'FY27',
  bandEffect: -52_031.6,
  /** The annual band estimate added instead of the in-year one. */
  negativeControl: 151_123.6,
  /** The 11.7 chain context: target 40 heads and $8,000,000, asks 30 and $5,000,000 without T1. */
  target: { heads: 40, cost: 8_000_000 },
  asksWithout: { heads: 30, cost: 5_000_000 },
  headEffect: 7,
  gapWithout: { heads: 10, cost: 3_000_000 },
  gapAfter: { heads: 3, cost: 3_052_031.6 },
} as const

/* ───────────── A2 ───────────── */

const A2_POSITIONS: PositionRow[] = [
  positionRow('P-A2-MGR', { effectiveDate: '2025-04-01', level: 'M1' }),
  positionRow('P-A2-O', {
    status: 'Open',
    managerPositionId: 'P-A2-MGR',
    startDate: '2026-12-01',
    openedDate: '2026-04-01',
  }),
  positionRow('P-A2-H', { effectiveDate: '2025-04-01', managerPositionId: 'P-A2-MGR' }),
  positionRow('P-A2-H', {
    effectiveDate: '2026-08-01',
    status: 'On hold',
    managerPositionId: 'P-A2-MGR',
    sourceRequestId: 'R-A2-MOVE',
  }),
]

const backfill = (requestId: string, positionId: string): HcRequest =>
  hcRequest(requestId, {
    type: 'Backfill',
    reasonCode: 'Attrition backfill',
    requesterId: 'E-A2-MGR',
    positionId,
    managerPositionId: 'P-A2-MGR',
    level: 'P3',
    location: 'San Jose',
    fte: 1,
    startDate: '2026-12-01',
  })

export const A2 = {
  context: context(A2_POSITIONS, [
    assignment('E-A2-MGR', 'P-A2-MGR', '2024-01-01'),
    // Held On hold by an internal move: the holder left the seat on 31 Jul 2026.
    assignment('E-A2-X', 'P-A2-H', '2024-01-01', '2026-07-31'),
  ]),
  org: IN_GTM,
  date: '2027-03-31',
  onOpen: { request: backfill('R-A2-1', 'P-A2-O'), headEffect: 0 },
  onHold: { request: backfill('R-A2-2', 'P-A2-H'), headEffect: 1 },
  /** P-A2-MGR and P-A2-O count; the On hold seat does not until its Backfill is approved. */
  asksWithout: 2,
  asksWithBoth: 3,
} as const
