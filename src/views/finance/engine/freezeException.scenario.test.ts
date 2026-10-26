/**
 * A seat Finance approves past a freeze is let through it (docs/PLAN.md 10.4, R10; review SC-4,
 * SC-7): Finance > Freezes counts the sample's two freeze exceptions against FRZ-001 (imported
 * exceptions carry no freeze ID, so the freeze that covers the request is read), and once Finance
 * approves R-1029 its new seat is no opening under the freeze, on Finance > Freezes and on Plan >
 * Openings, and the savings of the openings it holds stay as they were.
 */
import { describe, expect, it, vi } from 'vitest'
import { scenario, type Who } from '@/app/write/scenario.testkit'
import { MemoryStorage } from '@/testkit/memoryStorage'
import { personaOf } from '@/testkit/sample'
import { planModel } from '@/views/plan/engine'
import { financeModel } from './index'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
vi.stubGlobal('localStorage', new MemoryStorage())

describe('a freeze exception Finance approves (SC-4, SC-7)', () => {
  it('counts the sample’s exceptions and lets the approved seat through the freeze', async () => {
    const sc = scenario()
    const s = sc.sample
    const fin: Who = { mode: 'finance', personId: personaOf(s, 'finance-fpa').employeeId }
    const admin: Who = { mode: 'hr-admin', personId: personaOf(s, 'hr-admin').employeeId }
    const freezesOf = async () => financeModel(await sc.ctx(fin)).freezes
    let f = await freezesOf()
    const frz = f.freezes.rows.find((r) => r.freezeId === 'FRZ-001')
    // Story 4: two freeze exception requests in Corporate (R-1029, R-1033), both against FRZ-001.
    expect(frz?.exceptions).toBe(2)
    const held = frz?.openingsHeld ?? 0
    expect(held).toBeGreaterThan(0)
    // The savings of the openings the freeze holds (its modeled backfills aside, which the forecast moves).
    const heldSavings = (rows: typeof f.openings.rows) => rows.reduce((a, r) => a + (r.savingsUsd ?? 0), 0)
    const savings = heldSavings(f.openings.rows)

    const out = await sc.run(fin, 'approveRequest', { requestId: 'R-1029' })
    expect(out.outcome.ok).toBe(true)
    const seat = (await sc.request('R-1029'))?.outcome?.createdPositionIds[0] as string
    expect(seat).toBeTruthy()

    f = await freezesOf()
    const after = f.freezes.rows.find((r) => r.freezeId === 'FRZ-001')
    expect(f.openings.rows.map((r) => r.positionId)).not.toContain(seat)
    expect(after?.openingsHeld).toBe(held)
    expect(heldSavings(f.openings.rows)).toBeCloseTo(savings, 2)
    // Plan > Openings reads the same: the seat is an opening, held by no freeze.
    const opening = planModel(await sc.ctx(admin)).openings.table.rows.find((r) => r.positionId === seat)
    expect(opening).toBeDefined()
    expect(opening?.frozen).toBe(false)
  }, 240_000)
})
