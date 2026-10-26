/**
 * Allocation and budget status fixtures (docs/PLAN.md 6.9, 15.1 R2, R3 and R32).
 *
 * A1: every seat $80,000 midpoint, FTE 1; allocation 6 heads, $480,000.
 * (1) 5 Filled + 1 Open seat with an accepted offer starting 1 Feb 2027: staffed $400,000 (83%) at 30
 *     Sep 2026, and 6 heads and $480,000 (equal, not above) from Feb: On track.
 * (2) Add a pending New role starting 1 Mar 2027: "At risk: a pending request adds 1 head in Mar".
 * (3) A fully staffed team (6 Filled): $480,000 (100%): "At risk: your band cost is within 2% of your
 *     allocation".
 * (4) That team after an approved Level change raising one seat's midpoint by $28,800: staffed
 *     $508,800 > $480,000: "Over: level changes put your band cost over your allocation".
 * (5) Negative control: pricing the allocation at current Working levels makes (4) read At risk, and
 *     must fail: `allocationSeats` prices the seat at its plan-of-record row on the lock date (P3).
 */
import type { Month, PositionRow } from '@/data/schema'
import type { AllocationSeatInput, AllocationSeatsInput } from '../allocation'
import type { SeatType } from '../band'
import type { PendingEffect, StaffedPerson } from '../budgetStatus'
import { positionRow } from './common'

/** Midpoint × FTE in USD: P3 San Jose $80,000; P4 San Jose $108,800 (the Level change adds $28,800). */
export const a1BandCost = (seat: SeatType): number => (seat.level === 'P4' ? 108_800 : 80_000) * seat.fte

const P3: SeatType = { level: 'P3', location: 'San Jose', fte: 1 }
const P4: SeatType = { level: 'P4', location: 'San Jose', fte: 1 }

/** The as-of month to FY end. */
export const A1_MONTHS: readonly Month[] = [
  '2026-09',
  '2026-10',
  '2026-11',
  '2026-12',
  '2027-01',
  '2027-02',
  '2027-03',
]

const allocSeat = (n: number, status: AllocationSeatInput['status']): AllocationSeatInput => ({
  positionId: `P-A1-${n}`,
  status,
  seat: P3,
  source: 'plan-of-record',
  hasReq: status === 'Open',
  pendingStartRecruiting: false,
})

const person = (n: number, over: Partial<StaffedPerson> = {}): StaffedPerson => ({
  id: `E-A1-${n}`,
  positionId: `P-A1-${n}`,
  start: '2024-01-01',
  lastDay: null,
  seat: P3,
  allocated: P3,
  ...over,
})

const FIVE = [1, 2, 3, 4, 5].map((n) => person(n))

export const A1 = {
  /** Case (1)'s allocation: 5 Filled + 1 Open (accepted offer), all priced at P3 San Jose. */
  allocation: {
    input: {
      fiscalYear: 'FY27',
      seats: [1, 2, 3, 4, 5].map((n) => allocSeat(n, 'Filled')).concat([allocSeat(6, 'Open')]),
      eliminated: new Set<string>(),
      bandCost: a1BandCost,
    },
    heads: 6,
    bandCost: 480_000,
    filled: 5,
    open: 1,
    planned: 0,
    leftToFill: 1,
    leftToRequest: 0,
  },
  atRiskShare: 0.02,
  months: A1_MONTHS,
  cases: [
    {
      id: 'A1-1',
      people: [...FIVE, person(6, { id: 'R-A1-6', start: '2027-02-01' })],
      pending: [] as PendingEffect[],
      staffedAt: [
        { month: '2026-09', heads: 5, bandCost: 400_000 },
        { month: '2027-01', heads: 5, bandCost: 400_000 },
        { month: '2027-02', heads: 6, bandCost: 480_000 },
      ],
      status: 'On track',
      text: 'On track',
    },
    {
      id: 'A1-2',
      people: [...FIVE, person(6, { id: 'R-A1-6', start: '2027-02-01' })],
      pending: [
        { requestId: 'R-A1-NEW', type: 'New role', month: '2027-03', heads: 1, bandCost: 80_000 },
      ] as PendingEffect[],
      status: 'At risk',
      text: 'At risk: a pending request adds 1 head in Mar',
    },
    {
      id: 'A1-3',
      people: [...FIVE, person(6)],
      pending: [] as PendingEffect[],
      staffedAt: [{ month: '2026-09', heads: 6, bandCost: 480_000 }],
      status: 'At risk',
      text: 'At risk: your band cost is within 2% of your allocation',
    },
    {
      id: 'A1-4',
      people: [...FIVE, person(6, { seat: P4, allocated: P3 })],
      pending: [] as PendingEffect[],
      staffedAt: [{ month: '2026-09', heads: 6, bandCost: 508_800 }],
      status: 'Over',
      text: 'Over: level changes put your band cost over your allocation',
    },
  ],
} as const

/* ───────────── (5) the allocation is priced at the plan of record ───────────── */

const a1Rows: PositionRow[] = [
  ...[1, 2, 3, 4, 5, 6].map((n) => positionRow(`P-A1-${n}`, { managerPositionId: 'P-A1-MGR' })),
  positionRow('P-A1-6', {
    effectiveDate: '2026-08-01',
    level: 'P4',
    managerPositionId: 'P-A1-MGR',
    sourceRequestId: 'R-A1-LVL',
  }),
]

export const A1_5 = {
  input: {
    fiscalYear: 'FY27',
    lockDate: '2026-07-15',
    planOfRecordSeats: ['P-A1-1', 'P-A1-2', 'P-A1-3', 'P-A1-4', 'P-A1-5', 'P-A1-6'],
    lockedPositions: new Set(['P-A1-1', 'P-A1-2', 'P-A1-3', 'P-A1-4', 'P-A1-5', 'P-A1-6']),
    // The approved Level change R-A1-LVL is the row it wrote (sourceRequestId), dated 1 Aug 2026.
    positions: a1Rows,
    tree: (seat) => seat.managerPositionId === 'P-A1-MGR',
    seatNow: () => ({ status: 'Filled', hasReq: false, pendingStartRecruiting: false }),
  } as AllocationSeatsInput,
  /** P-A1-6 is priced at its row on the lock date (P3), not at Working's P4. */
  pricedLevel: 'P3',
  bandCost: 480_000,
  /** With case (4)'s staffed team, status reads Over (At risk would mean the allocation was priced at P4). */
  status: 'Over',
} as const
