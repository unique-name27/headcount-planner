/**
 * What if fixtures (docs/PLAN.md 10.6, 6.9; the 11.7 rates in fixtures/band.ts).
 *
 * FY27, full-month proration, first open month 2026-10, band estimates from `fixtureBandUsd` (P5 San
 * Jose $287,400.00, P4 San Jose $236,000.00, P3 San Jose $198,200.00, P4 Munich $151,228.08, P4 Haifa
 * $160,380.00). Go-to-Market's manager P-GTM-MGR has a sub-org P-W-SUB with two openings: P-W-1, a
 * Planned P5 San Jose seat from 1 Nov 2026, and P-W-2, an Open P4 Munich seat from 1 Dec 2026. Beside
 * them: a Planned P3 San Jose seat with no planned start (P-W-NS), an Open seat with an accepted offer
 * (P-W-OFFER), a Filled seat (P-W-F), a contractor seat (P-W-C) and a Silicon Engineering seat (P-W-SE).
 *
 * In-year band estimate, from the later of the start and the first open month to FY end:
 *  - defer P-W-1 to 1 Jan 2027: −$287,400 × 2/12 = −$47,900.00, −1 head at 31 Dec 2026, none at FY end;
 *  - cancel P-W-1: −$287,400 × 5/12 = −$119,750.00, −1 head;
 *  - shift P-W-1 and P-W-2 by one month: −$23,950.00 − $12,602.34 = −$36,552.34;
 *  - change P-W-1 to P4: ($236,000 − $287,400) × 5/12 = −$21,416.67;
 *  - move P-W-2 to Haifa: ($160,380.00 − $151,228.08) × 4/12 = +$3,050.64;
 *  - freeze P-W-SUB from 1 Jan 2027: −$287,400 × 3/12 − $151,228.08 × 3/12 = −$109,657.02, no heads;
 *  - defer P-W-NS (no start, so no cost) to 1 Jan 2027: +$198,200 × 3/12 = +$49,550.00, no heads;
 *  - defer P-W-1 to 1 Jan 2027, then shift it one month: −$287,400 × 3/12 = −$71,850.00;
 *  - cancel P-W-1 while a pending Elimination names it: no change in heads or cost.
 * The trade lever is T1 on G3's context: +7 heads and −$52,031.60 (fixture G3).
 */
import type { PositionRow, ReqRow } from '@/data/schema'
import type { OrgMatch } from '../../types'
import type { AsksContextInput } from '../targets'
import { fixtureBandUsd } from './band'
import { assignment, hcRequest, positionRow } from './common'

const GTM = 'Go-to-Market'

export const W_IN_GTM: OrgMatch = (seat) => seat.businessUnit === GTM

const gtm = (positionId: string, over: Partial<PositionRow>): PositionRow =>
  positionRow(positionId, { effectiveDate: '2026-04-01', managerPositionId: 'P-GTM-MGR', ...over })

export const W_POSITIONS: readonly PositionRow[] = [
  positionRow('P-GTM-MGR', { effectiveDate: '2025-04-01', level: 'M1' }),
  gtm('P-W-SUB', { level: 'M1' }),
  gtm('P-W-1', { status: 'Planned', level: 'P5', managerPositionId: 'P-W-SUB', startDate: '2026-11-01' }),
  gtm('P-W-2', {
    status: 'Open',
    level: 'P4',
    location: 'Munich',
    costCenter: '4110-MUC',
    managerPositionId: 'P-W-SUB',
    startDate: '2026-12-01',
    openedDate: '2026-04-01',
  }),
  gtm('P-W-NS', { status: 'Planned', level: 'P3' }),
  gtm('P-W-OFFER', { status: 'Open', level: 'P4', startDate: '2026-11-01', openedDate: '2026-06-01' }),
  gtm('P-W-F', { level: 'P3' }),
  gtm('P-W-C', { status: 'Planned', level: 'P3', workerType: 'Contractor', startDate: '2026-11-01' }),
  positionRow('P-W-SE', {
    effectiveDate: '2026-04-01',
    status: 'Planned',
    level: 'P5',
    businessUnit: 'Silicon Engineering',
    department: 'Design Verification',
    costCenter: '1130-SJC',
    startDate: '2026-11-01',
  }),
]

const OFFER: ReqRow = {
  reqId: 'R-W-OFFER',
  positionId: 'P-W-OFFER',
  status: 'Open',
  stage: 'Offer accepted',
  reqType: 'New',
  openedDate: '2026-06-01',
  targetStartDate: '2026-11-01',
  offerAcceptedDate: '2026-09-10',
  startDate: '2026-11-16',
  closedDate: null,
  hiringManagerId: 'E1110',
  recruiter: null,
  offerBase: 190_000,
  offerCurrency: 'USD',
  signOnBonus: null,
  relocation: null,
  agencyFee: null,
}

export const W_CONTEXT: AsksContextInput = {
  positions: W_POSITIONS,
  assignments: [
    assignment('E1110', 'P-GTM-MGR', '2024-01-01'),
    assignment('E-W-SUB', 'P-W-SUB', '2024-01-01'),
    assignment('E-W-F', 'P-W-F', '2024-01-01'),
  ],
  reqs: [OFFER],
  requests: [],
  proration: 'full-month',
  firstOpenMonth: '2026-10',
  bandUsd: (seat) => fixtureBandUsd(seat),
}

/** A pending Elimination of P-W-1 (no last day yet: it ends on approval). */
export const W_PENDING_ELIMINATION = hcRequest('R-W-ELIM', {
  type: 'Elimination',
  state: 'In review',
  reasonCode: 'Cost reduction',
  positionId: 'P-W-1',
  managerPositionId: 'P-W-SUB',
})

export const W = {
  fiscalYear: 'FY27',
  fyEnd: '2027-03-31',
  december: '2026-12-31',
  target: { heads: 40, cost: 8_000_000 },
  defer: { cost: -47_900, headsAtDecember: -1, headsAtFyEnd: 0 },
  cancel: { cost: -119_750, heads: -1 },
  shift: { cost: -36_552.34 },
  level: { cost: -21_416.67 },
  location: { cost: 3_050.64 },
  freeze: { cost: -109_657.02, heads: 0 },
  noStart: { cost: 49_550, heads: 0 },
  composed: { cost: -71_850 },
  /** Every seat a lever may act on, in input order. */
  leverSeats: ['P-W-1', 'P-W-2', 'P-W-NS'],
} as const
