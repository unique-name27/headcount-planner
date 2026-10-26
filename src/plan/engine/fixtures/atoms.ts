/**
 * Cost atom fixtures (docs/PLAN.md 7.3a, change C20; src/cost/atoms.ts).
 *
 * AT1: an SVP (E2) with one direct staff seat; a VP (E1) with one direct staff seat; a director (M2)
 * with a manager's team, a direct report and an Open manager seat. Atoms at the 30 Sep 2026 close:
 * the SVP's own staff, the VP's own staff, and the director's whole org. A manager's team is not a
 * union of atoms (it cuts the director's atom). A new Planned seat under the manager takes the
 * director's atom. Raising the Open manager seat to M2 after the close leaves the stored index alone;
 * the next close's index makes it its own atom. A seat marked as a leader in Lists heads its own atom.
 * AT2: with no leader seats, atoms fall back to the department, then the business unit.
 */
import type { PositionRow } from '@/data/schema'
import { positionRow } from './common'

const SE = 'Silicon Engineering'

const se = (positionId: string, level: PositionRow['level'], manager: string | null, department: string) =>
  positionRow(positionId, {
    effectiveDate: '2025-04-01',
    level,
    managerPositionId: manager,
    businessUnit: SE,
    department,
    costCenter: '1130-SJC',
  })

export const AT1 = {
  closeDate: '2026-09-30',
  positions: [
    se('A-SVP', 'E2', null, 'Silicon Engineering Office'),
    se('A-SVP-EA', 'P3', 'A-SVP', 'Silicon Engineering Office'),
    se('A-VP', 'E1', 'A-SVP', 'Design Verification'),
    se('A-VP-STAFF', 'P5', 'A-VP', 'Design Verification'),
    se('A-DIR', 'M2', 'A-VP', 'Design Verification'),
    se('A-MGR', 'M1', 'A-DIR', 'Design Verification'),
    se('A-IC1', 'P3', 'A-MGR', 'Design Verification'),
    se('A-IC2', 'P4', 'A-MGR', 'Design Verification'),
    se('A-DIR-IC', 'P4', 'A-DIR', 'Design Verification'),
    { ...se('A-MGR-OPEN', 'M1', 'A-DIR', 'Design Verification'), status: 'Open' as const },
    // Eliminated before the close: in no atom.
    {
      ...se('A-GONE', 'P3', 'A-MGR', 'Design Verification'),
      effectiveDate: '2026-06-01',
      status: 'Eliminated' as const,
      endDate: '2026-05-31',
      endReason: 'Eliminated' as const,
    },
  ] as PositionRow[],
  leaderSeats: ['A-DIR', 'A-SVP', 'A-VP'],
  atoms: {
    'A-SVP': ['A-SVP', 'A-SVP-EA'],
    'A-VP': ['A-VP', 'A-VP-STAFF'],
    'A-DIR': ['A-DIR', 'A-DIR-IC', 'A-IC1', 'A-IC2', 'A-MGR', 'A-MGR-OPEN'],
  } as Readonly<Record<string, readonly string[]>>,
  atomOf: [
    { positionId: 'A-IC1', expected: 'A-DIR' },
    { positionId: 'A-VP-STAFF', expected: 'A-VP' },
    { positionId: 'A-SVP-EA', expected: 'A-SVP' },
    { positionId: 'A-GONE', expected: null },
  ],
  /** Created after the close under A-MGR: takes the director's atom through its manager. */
  newSeat: { positionId: 'A-NEW', managerPositionId: 'A-MGR', expected: 'A-DIR' },
  unions: [
    { set: ['A-DIR', 'A-DIR-IC', 'A-IC1', 'A-IC2', 'A-MGR', 'A-MGR-OPEN'], expected: true },
    { set: ['A-MGR', 'A-IC1', 'A-IC2'], expected: false },
    { set: ['A-SVP', 'A-SVP-EA', 'A-VP', 'A-VP-STAFF'], expected: true },
    { set: [], expected: true },
  ],
  /** A position.edit raising the Open manager seat to M2 after the close. */
  raised: {
    row: {
      ...se('A-MGR-OPEN', 'M2', 'A-DIR', 'Design Verification'),
      effectiveDate: '2026-10-05',
      status: 'Open' as const,
    },
    /** Under the stored 30 Sep index it stays in the director's atom. */
    storedAtom: 'A-DIR',
    /** At the next close (31 Oct) it heads its own atom. */
    nextClose: '2026-10-31',
    nextAtom: 'A-MGR-OPEN',
  },
  /** Marked as a leader in Lists: the manager heads its own atom. */
  listed: { leaders: ['A-MGR'], atomOfIc1: 'A-MGR', atomOfDirIc: 'A-DIR' },
} as const

export const AT2 = {
  closeDate: '2026-09-30',
  positions: [
    positionRow('B-IT-1', {
      businessUnit: 'Corporate',
      department: 'IT',
      costCenter: '1540-SJC',
      level: 'M1',
    }),
    positionRow('B-IT-2', {
      businessUnit: 'Corporate',
      department: 'IT',
      costCenter: '1540-SJC',
      managerPositionId: 'B-IT-1',
    }),
    positionRow('B-FAC-1', { businessUnit: 'Corporate', department: 'Facilities', costCenter: '1550-SJC' }),
    positionRow('B-NODEPT', { businessUnit: 'Corporate', department: null, costCenter: '1500-SJC' }),
  ],
  atomOf: [
    { positionId: 'B-IT-2', expected: 'department:Corporate|IT' },
    { positionId: 'B-FAC-1', expected: 'department:Corporate|Facilities' },
    { positionId: 'B-NODEPT', expected: 'unit:Corporate' },
  ],
} as const
