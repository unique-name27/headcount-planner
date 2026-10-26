/**
 * The Working overlay merge (docs/PLAN.md 4, 5.4; M3): the overlay's rows laid over the imported
 * datasets by row key, the same datasets object back when the overlay is empty (so memoized models
 * stay warm), and the same object for the same inputs.
 */
import { describe, expect, it } from 'vitest'
import type { Datasets, FreezeRow, TargetRow } from '@/data/schema'
import { positionRow } from '../engine/fixtures/common'
import type { PlanState } from '../types'
import { emptyPlanState } from './memoryStore'
import { overlayEmpty, overlayRows, withOverlay } from './overlay'

const data = (): Datasets => ({
  positions: [
    positionRow('P-1'),
    positionRow('P-2'),
    positionRow('P-2', { effectiveDate: '2026-10-01', level: 'P4' }),
  ],
  workers: [],
  comp: [],
  reqs: [],
  requests: [],
  targets: [
    {
      fiscalYear: 'FY27',
      businessUnit: 'Go-to-Market',
      department: null,
      costCenter: null,
      leaderPositionId: null,
      targetHeads: 10,
      targetCost: 1,
    },
  ],
  freezes: [
    {
      freezeId: 'FRZ-001',
      businessUnit: 'Corporate',
      startDate: '2026-08-01',
      endDate: null,
      allowBackfill: false,
      reason: 'x',
    },
  ],
  assumptions: [{ version: 'fy27-working', table: 'attrition', org: '', key: '*', value: 0.1 }],
})

const plan = (overlay: Partial<PlanState['overlay']>): PlanState => ({
  ...emptyPlanState(),
  overlay: { ...emptyPlanState().overlay, ...overlay },
})

describe('withOverlay', () => {
  it('returns the datasets themselves with no plan or an empty overlay', () => {
    const d = data()
    expect(withOverlay(d, null)).toBe(d)
    expect(withOverlay(d, emptyPlanState())).toBe(d)
    expect(overlayEmpty(null)).toBe(true)
    expect(overlayEmpty(emptyPlanState())).toBe(true)
  })

  it('adds dated position rows and replaces the row with the same seat and date', () => {
    const d = data()
    const p = plan({
      positions: [
        positionRow('P-2', { effectiveDate: '2026-10-01', level: 'P5' }),
        positionRow('P-3', { status: 'Planned' }),
        positionRow('P-1', { effectiveDate: '2026-11-01', status: 'On hold' }),
      ],
    })
    expect(overlayEmpty(p)).toBe(false)
    const out = withOverlay(d, p)
    expect(out).not.toBe(d)
    expect(out.positions.map((r) => [r.positionId, r.effectiveDate, r.level, r.status])).toEqual([
      ['P-1', '2026-04-01', 'P3', 'Filled'],
      ['P-2', '2026-04-01', 'P3', 'Filled'],
      ['P-2', '2026-10-01', 'P5', 'Filled'],
      ['P-3', '2026-04-01', 'P3', 'Planned'],
      ['P-1', '2026-11-01', 'P3', 'On hold'],
    ])
    // Untouched datasets are the imported arrays themselves; the same inputs give the same object.
    expect(out.workers).toBe(d.workers)
    expect(out.targets).toBe(d.targets)
    expect(withOverlay(d, p)).toBe(out)
  })

  it('replaces targets, freezes and assumptions by their row key; a blank org reads as none', () => {
    const d = data()
    const target: TargetRow = { ...d.targets[0], targetHeads: 9 }
    const freeze: FreezeRow = { ...d.freezes[0], endDate: '2026-12-31' }
    const p = plan({
      targets: [target, { ...target, businessUnit: 'Operations', targetHeads: 3 }],
      freezes: [freeze],
      assumptions: [{ version: 'fy27-working', table: 'attrition', org: null, key: '*', value: 0.12 }],
    })
    const out = withOverlay(d, p)
    expect(out.targets.map((t) => [t.businessUnit, t.targetHeads])).toEqual([
      ['Go-to-Market', 9],
      ['Operations', 3],
    ])
    expect(out.freezes).toEqual([freeze])
    expect(out.assumptions.map((a) => a.value)).toEqual([0.12])
  })

  it('replaces an assumption row that names its Working by name with an overlay row that names it by ID', () => {
    const d: Datasets = {
      ...data(),
      assumptions: [{ version: 'FY27 Working', table: 'attrition', org: '', key: '*', value: 0.1 }],
    }
    const working = {
      versionId: 'fy27-working',
      name: 'FY27 Working',
      kind: 'working',
      fiscalYear: 'FY27',
      grid: { from: '2026-04', to: '2027-09' },
      proration: 'daily',
      state: 'working',
      createdAt: '2026-04-01T00:00:00.000Z',
      lockedAt: null,
      lockedBy: null,
      engineVersion: '1',
      parentId: null,
      hash: null,
    } as unknown as PlanState['versions'][number]
    const p: PlanState = {
      ...plan({
        assumptions: [{ version: 'fy27-working', table: 'attrition', org: '', key: '*', value: 0.12 }],
      }),
      versions: [working],
    }
    const out = withOverlay(d, p)
    expect(out.assumptions).toEqual([
      { version: 'fy27-working', table: 'attrition', org: '', key: '*', value: 0.12 },
    ])
    // Control: with no version to pair the name with, the two rows stay apart.
    expect(withOverlay(d, { ...p, versions: [] }).assumptions.length).toBe(2)
  })

  it('lets a later overlay row with a key win over an earlier one', () => {
    const rows = overlayRows(
      [{ k: 'a', v: 1 }],
      [
        { k: 'a', v: 2 },
        { k: 'b', v: 3 },
        { k: 'a', v: 4 },
      ],
      ['k'],
    )
    expect(rows).toEqual([
      { k: 'a', v: 4 },
      { k: 'b', v: 3 },
    ])
  })
})
