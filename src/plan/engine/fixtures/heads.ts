/**
 * Heads and FTE fixtures (docs/PLAN.md 6.1, 15.1 R19).
 *
 * H1: a 1.0 FTE hire on 16 Sep 2026 is 1 head at 30 Sep and 0.5 average FTE for September (15 of 30
 * days), under every proration (average FTE is always daily).
 * H2: a last day of 30 Sep is 1 head at 30 Sep and 0 at 1 Oct (the template app's isActiveAt would
 * give 0 at 30 Sep: the difference this fixture pins).
 */
import type { CompRow, ISODate, PositionRow, WorkerRow } from '@/data/schema'
import type { Assignment } from '../../types'
import { compRow, positionRow, workerRow } from './common'

export const H1 = {
  workers: [workerRow('E-H1', 'P-H1', { hireDate: '2026-09-16' })] as readonly WorkerRow[],
  /** What `toAssignments` must return for the row. */
  assignments: [
    {
      employeeId: 'E-H1',
      positionId: 'P-H1',
      start: '2026-09-16',
      end: null,
      fte: 1,
      workerType: 'Employee',
    },
  ] as readonly Assignment[],
  headsAt: { date: '2026-09-30' as ISODate, expected: 1 },
  averageFte: { window: { start: '2026-09-01', end: '2026-09-30' }, expected: 0.5 },
  /** The hire's seat (Open until the hire, planned start the hire date) and pay, for the plan lines. */
  seatRows: [
    positionRow('P-H1', { effectiveDate: '2026-04-01', status: 'Open', startDate: '2026-09-16' }),
  ] as readonly PositionRow[],
  comp: [compRow('E-H1', '2026-09-16', 120_000)] as readonly CompRow[],
  /** September's plan line: 1 head at 30 Sep under every proration; the active fraction is the proration's. */
  september: {
    month: '2026-09',
    heads: 1,
    active: { daily: 0.5, 'half-month': 0.5, 'full-month': 1 },
  },
} as const

export const H2 = {
  workers: [
    workerRow('E-H2', 'P-H2', { hireDate: '2025-01-01', terminationDate: '2026-09-30' }),
  ] as readonly WorkerRow[],
  assignments: [
    {
      employeeId: 'E-H2',
      positionId: 'P-H2',
      start: '2025-01-01',
      end: '2026-09-30',
      fte: 1,
      workerType: 'Employee',
    },
  ] as readonly Assignment[],
  heads: [
    { date: '2026-09-30' as ISODate, expected: 1 },
    { date: '2026-10-01' as ISODate, expected: 0 },
  ],
} as const

/** Contractors and interns count 0 heads (6.1); an assignment that ends early is the earlier of assignmentEnd and terminationDate. */
export const H_EXTRA = {
  workers: [
    workerRow('E-HC', 'P-HC', { workerType: 'Contractor' }),
    workerRow('E-HI', 'P-HI', { workerType: 'Intern' }),
    workerRow('E-HM', 'P-HM', {
      hireDate: '2025-05-01',
      assignmentStart: '2025-06-01',
      assignmentEnd: '2026-08-31',
      terminationDate: '2026-12-31',
      fte: 0.6,
    }),
  ] as readonly WorkerRow[],
  /** E-HM's assignment as `toAssignments` reads it. */
  moved: {
    employeeId: 'E-HM',
    positionId: 'P-HM',
    start: '2025-06-01',
    end: '2026-08-31',
    fte: 0.6,
    workerType: 'Employee',
  } as Assignment,
  headsAt: { date: '2026-09-30' as ISODate, expected: 0 },
} as const
