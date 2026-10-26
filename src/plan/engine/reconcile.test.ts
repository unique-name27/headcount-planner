/**
 * Reconciliation (docs/PLAN.md 6.10, 15.1 R27, 16.2 "reconcile"): each exception kind, the 30-day
 * handover, worker types left to data quality, and the order. H3 and H4 are asserted in
 * versions.test.ts.
 */
import { describe, expect, it } from 'vitest'
import { positionRow, workerRow } from './fixtures/common'
import { HANDOVER_DAYS, RECON_KINDS, reconcile } from './reconcile'

const AS_OF = '2026-09-30'

describe('reconcile', () => {
  it('finds nothing when status and assignments agree', () => {
    const positions = [
      positionRow('P-1'),
      positionRow('P-2', { status: 'Open', startDate: '2026-11-01' }),
      positionRow('P-3', { status: 'Planned', startDate: '2026-10-01' }),
    ]
    const workers = [workerRow('E-1', 'P-1')]
    expect(reconcile({ positions, workers }, AS_OF)).toEqual([])
  })

  it('reports an active employee with no position, or with one not in the plan', () => {
    const found = reconcile(
      {
        positions: [positionRow('P-1'), positionRow('P-LATER', { effectiveDate: '2026-10-01' })],
        workers: [
          workerRow('E-1', 'P-1'),
          workerRow('E-2', null),
          workerRow('E-3', 'P-GONE'),
          workerRow('E-4', 'P-LATER'),
          workerRow('E-5', null, { terminationDate: '2026-09-29' }),
          workerRow('C-1', null, { workerType: 'Contractor' }),
        ],
      },
      AS_OF,
    )
    expect(found.map((e) => e.id)).toEqual(['not-in-plan:E-2', 'not-in-plan:E-3', 'not-in-plan:E-4'])
    expect(found[0]).toEqual({
      id: 'not-in-plan:E-2',
      kind: 'not-in-plan',
      positionId: null,
      employeeId: 'E-2',
      detail: 'E-2 is active on 30 Sep 2026 with no position.',
    })
    expect(found[1].detail).toBe('E-3 is active on 30 Sep 2026 in P-GONE, which is not in the plan.')
  })

  it("reports a worker whose cost center differs from the seat's, but not a blank one", () => {
    const found = reconcile(
      {
        positions: [positionRow('P-1'), positionRow('P-2')],
        workers: [
          workerRow('E-1', 'P-1', { costCenter: '4120-SJC' }),
          workerRow('E-2', 'P-2', { costCenter: null }),
        ],
      },
      AS_OF,
    )
    expect(found).toEqual([
      {
        id: 'cost-center-mismatch:P-1',
        kind: 'cost-center-mismatch',
        positionId: 'P-1',
        employeeId: 'E-1',
        detail: 'E-1 is in cost center 4120-SJC, but P-1 is in 4110-SJC.',
      },
    ])
  })

  it('reports a seat imported as Filled with no one in it, the last day counting', () => {
    const positions = [positionRow('P-1'), positionRow('P-2'), positionRow('P-3')]
    const workers = [
      workerRow('E-1', 'P-1', { terminationDate: '2026-09-29' }),
      workerRow('E-2', 'P-2', { terminationDate: AS_OF }),
      workerRow('C-3', 'P-3', { workerType: 'Contractor' }),
    ]
    expect(reconcile({ positions, workers }, AS_OF)).toEqual([
      {
        id: 'filled-no-assignment:P-1',
        kind: 'filled-no-assignment',
        positionId: 'P-1',
        employeeId: null,
        detail: 'P-1 is imported as Filled but no one is in it on 30 Sep 2026.',
      },
    ])
  })

  it('reports an employee in a seat imported as Open, On hold or Eliminated, but not a contractor covering it', () => {
    const found = reconcile(
      {
        positions: [
          positionRow('P-O', { status: 'Open' }),
          positionRow('P-H', { status: 'On hold' }),
          positionRow('P-E', { status: 'Eliminated', endDate: '2026-06-30' }),
          positionRow('P-C', { status: 'Open' }),
        ],
        workers: [
          workerRow('E-O', 'P-O'),
          workerRow('E-H', 'P-H'),
          workerRow('E-E', 'P-E'),
          workerRow('C-C', 'P-C', { workerType: 'Contractor' }),
        ],
      },
      AS_OF,
    )
    expect(found.map((e) => [e.id, e.employeeId])).toEqual([
      ['assignment-on-open:P-E', 'E-E'],
      ['assignment-on-open:P-H', 'E-H'],
      ['assignment-on-open:P-O', 'E-O'],
    ])
    expect(found[1].detail).toBe('P-H is imported as On hold, but E-H is in it on 30 Sep 2026.')
  })

  it('reads the row in effect on the as-of date', () => {
    const positions = [
      positionRow('P-1', { status: 'Open', effectiveDate: '2026-04-01' }),
      positionRow('P-1', { status: 'Filled', effectiveDate: '2026-09-01' }),
      positionRow('P-1', { status: 'Eliminated', effectiveDate: '2026-12-01' }),
    ]
    expect(reconcile({ positions, workers: [workerRow('E-1', 'P-1')] }, AS_OF)).toEqual([])
  })

  it(`allows a handover of up to ${HANDOVER_DAYS} days, and reports a longer overlap`, () => {
    const positions = [positionRow('P-1'), positionRow('P-2'), positionRow('P-3')]
    const workers = [
      // P-1: 30 shared days (1 to 30 Sep): a handover.
      workerRow('E-1a', 'P-1', { terminationDate: AS_OF }),
      workerRow('E-1b', 'P-1', { hireDate: '2026-09-01' }),
      // P-2: 31 shared days.
      workerRow('E-2a', 'P-2', { terminationDate: '2026-10-01' }),
      workerRow('E-2b', 'P-2', { hireDate: '2026-09-01' }),
      // P-3: two people with no last day.
      workerRow('E-3a', 'P-3'),
      workerRow('E-3b', 'P-3', { hireDate: '2026-09-29' }),
    ]
    const found = reconcile({ positions, workers }, AS_OF)
    expect(found.map((e) => e.id)).toEqual(['overlap:P-2', 'overlap:P-3'])
    expect(found[0]).toMatchObject({ kind: 'overlap', positionId: 'P-2', employeeId: 'E-2b' })
    expect(found[0].detail).toBe('P-2 has E-2a and E-2b in it together for more than 30 days.')
  })

  it('sorts by kind, then id, with one exception per id', () => {
    const found = reconcile(
      {
        positions: [positionRow('P-1'), positionRow('P-2', { status: 'Open' }), positionRow('P-3')],
        workers: [
          workerRow('E-9', null),
          workerRow('E-2', 'P-2', { costCenter: '9999-X' }),
          workerRow('E-2b', 'P-2', { costCenter: '9999-X', hireDate: '2026-09-29' }),
          workerRow('E-1', null),
        ],
      },
      AS_OF,
    )
    expect(found.map((e) => e.id)).toEqual([
      'not-in-plan:E-1',
      'not-in-plan:E-9',
      'cost-center-mismatch:P-2',
      'filled-no-assignment:P-1',
      'filled-no-assignment:P-3',
      'assignment-on-open:P-2',
      'overlap:P-2',
    ])
    expect(new Set(found.map((e) => e.kind))).toEqual(new Set(RECON_KINDS))
    for (const e of found) expect(e.detail).not.toMatch(/[$€£₹₪]|!/)
  })
})
