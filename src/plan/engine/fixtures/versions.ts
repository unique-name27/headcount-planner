/**
 * Status, plan heads and approved heads fixtures (docs/PLAN.md 6.5, 6.10, 15.1 R1 and R31).
 *
 * H3: a seat imported as Filled whose holder's last day is 15 Oct 2026, with no req and no Backfill
 * request, is Filled with 1 head and 1 plan head at 30 Sep 2026 and Open from 16 Oct 2026 (openedOn
 * 16 Oct). At 31 Oct 2026 it has 0 actual heads and 0 plan heads, is still 1 approved head and is no
 * longer a costed person. Its October line is basis 'hris' for 15 of 31 days under daily proration;
 * from November it has no cost. `reconcile` at as-of 30 Sep 2026 reports no exception for it.
 * H4: a seat imported as Planned with an assignment starting 1 Sep 2026 is Filled with 1 plan head in
 * Working at 30 Sep 2026 (story 1's shape) and reports no exception; the same seat imported as Open,
 * On hold or Eliminated reports `assignment-on-open`.
 */
import type { PositionRow, PositionStatus } from '@/data/schema'
import type { LineContextInput } from '../cost'
import type { SeatHistory } from '../versions'
import {
  AS_OF,
  assignment,
  assumption,
  compRow,
  FY27_MONTHS,
  fy27Working,
  position,
  positionRow,
  workerRow,
} from './common'

/* ───────────── H3 ───────────── */

const H3_ROW = positionRow('P-H3', { effectiveDate: '2025-04-01', level: 'P4' })
const H3_WORKER = workerRow('E-H3', 'P-H3', { hireDate: '2024-01-15', terminationDate: '2026-10-15' })

export const H3 = {
  rows: [H3_ROW] as readonly PositionRow[],
  workers: [H3_WORKER],
  /** The seat's history as `seatHistories` builds it (literal, so the test needs no other engine). */
  seat: {
    positionId: 'P-H3',
    rows: [H3_ROW],
    assignments: [assignment('E-H3', 'P-H3', '2024-01-15', '2026-10-15')],
    reqs: [],
    backfills: [],
  } as SeatHistory,
  states: [
    { on: '2026-09-30', status: 'Filled', planHead: true, approvedHead: true, holderIds: ['E-H3'] },
    { on: '2026-10-15', status: 'Filled', planHead: true, approvedHead: true, holderIds: ['E-H3'] },
    { on: '2026-10-16', status: 'Open', planHead: false, approvedHead: true, holderIds: [] },
    { on: '2026-10-31', status: 'Open', planHead: false, approvedHead: true, holderIds: [] },
  ] as readonly {
    on: string
    status: PositionStatus
    planHead: boolean
    approvedHead: boolean
    holderIds: readonly string[]
  }[],
  /** No replacement yet: no planned start (the leaver's dates are never used). */
  plannedStartOn: { on: '2026-10-31', expected: null },
  openedOn: { asOf: '2026-10-31', expected: '2026-10-16' },
  actualHeads: [
    { on: '2026-09-30', expected: 1 },
    { on: '2026-10-31', expected: 0 },
  ],
  planHeads: [
    { monthEnd: '2026-09-30', expected: 1 },
    { monthEnd: '2026-10-31', expected: 0 },
  ],
  approvedHeads: [{ on: '2026-10-31', expected: 1 }],
  /** Lines under daily proration (US loads; the amounts are not the point, the basis and fraction are). */
  position: position('P-H3', { effectiveDate: '2025-04-01', level: 'P4' }),
  context: (): LineContextInput => ({
    version: fy27Working('daily'),
    asOf: AS_OF,
    positions: [H3_ROW],
    workers: [H3_WORKER],
    comp: [compRow('E-H3', '2026-04-01', 150_000)],
    reqs: [],
    requests: [],
    assumptions: [
      assumption('band', 'P4|San Jose|FY27', 195_000),
      assumption('bonusTarget', 'P4', 0.1),
      assumption('bonusFunding', 'FY27', 1),
      assumption('benefits', 'United States', 18_000),
      assumption('equity', 'P4', 0),
    ],
    rates: { table: [], use: 'plan', closedThrough: null },
  }),
  october: { month: '2026-10', basis: 'hris', holderId: 'E-H3', active: 15 / 31, heads: 0, status: 'Open' },
  /** Every month from November has no cost. */
  noCostFrom: '2026-11',
  months: FY27_MONTHS,
  reconcileAsOf: '2026-09-30',
} as const

/* ───────────── H4 ───────────── */

const h4Row = (status: PositionStatus): PositionRow =>
  positionRow('P-H4', {
    effectiveDate: '2026-04-01',
    status,
    level: 'P3',
    startDate: status === 'Planned' || status === 'Open' ? '2026-10-01' : null,
    endDate: status === 'Eliminated' ? '2026-03-31' : null,
    endReason: status === 'Eliminated' ? 'Eliminated' : null,
  })

const H4_WORKER = workerRow('E-H4', 'P-H4', { hireDate: '2026-09-01' })

export const H4 = {
  planned: {
    rows: [h4Row('Planned')],
    workers: [H4_WORKER],
    seat: {
      positionId: 'P-H4',
      rows: [h4Row('Planned')],
      assignments: [assignment('E-H4', 'P-H4', '2026-09-01')],
      reqs: [],
      backfills: [],
    } as SeatHistory,
    at: '2026-09-30',
    status: 'Filled' as PositionStatus,
    planHeads: 1,
    exceptions: 0,
  },
  /** The same seat imported as each of these reports exactly one `assignment-on-open`. */
  onOpen: (['Open', 'On hold', 'Eliminated'] as const).map((status) => ({
    status,
    rows: [h4Row(status)],
    workers: [H4_WORKER],
    expected: { kind: 'assignment-on-open', positionId: 'P-H4', employeeId: 'E-H4' },
  })),
  asOf: AS_OF,
} as const
