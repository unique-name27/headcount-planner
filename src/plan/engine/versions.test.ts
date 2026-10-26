/**
 * Derived status, plan heads and approved heads (docs/PLAN.md 6.5, 6.10): fixtures H3 and H4.
 */
import { describe, expect, it } from 'vitest'
import { lineContext, positionLines } from './cost'
import { fy27Working } from './fixtures/common'
import { H3, H4 } from './fixtures/versions'
import { openedOn } from './forecast'
import { headsOn } from './heads'
import { reconcile } from './reconcile'
import { approvedHeadsOn, planHeadsAt, seatOn } from './versions'

describe('H3: a Filled seat whose holder leaves on 15 Oct 2026, with no req and no Backfill', () => {
  for (const s of H3.states) {
    it(`is ${s.status} on ${s.on}, plan head ${s.planHead}, approved head ${s.approvedHead}`, () => {
      const state = seatOn(H3.seat, s.on)
      expect(state?.status).toBe(s.status)
      expect(state?.planHead).toBe(s.planHead)
      expect(state?.approvedHead).toBe(s.approvedHead)
      expect(state?.holderIds).toEqual(s.holderIds)
    })
  }

  it('takes no planned start from the leaver', () => {
    expect(seatOn(H3.seat, H3.plannedStartOn.on)?.plannedStart).toBe(H3.plannedStartOn.expected)
  })

  it('opened on 16 Oct 2026, the day after the last day', () => {
    expect(openedOn(H3.seat, H3.openedOn.asOf)).toBe(H3.openedOn.expected)
  })

  it('counts actual heads, plan heads and approved heads', () => {
    for (const { on, expected } of H3.actualHeads) expect(headsOn(H3.seat.assignments, on), on).toBe(expected)
    for (const { monthEnd, expected } of H3.planHeads)
      expect(planHeadsAt([H3.seat], monthEnd), monthEnd).toBe(expected)
    for (const { on, expected } of H3.approvedHeads) expect(approvedHeadsOn([H3.seat], on), on).toBe(expected)
  })

  it('costs October at HRIS pay for 15 of 31 days and nothing from November', () => {
    const lines = positionLines(H3.position, fy27Working('daily'), lineContext(H3.context()))
    const october = lines.filter((l) => l.month === H3.october.month)
    const hris = october.filter((l) => l.basis === 'hris')
    expect(hris).toHaveLength(1)
    expect(hris[0].holderId).toBe(H3.october.holderId)
    expect(hris[0].active).toBeCloseTo(H3.october.active, 10)
    expect(hris[0].status).toBe(H3.october.status)
    expect(october.reduce((n, l) => n + l.heads, 0)).toBe(H3.october.heads)
    expect(hris[0].usd.loaded).toBeGreaterThan(0)
    const later = lines.filter((l) => l.month >= H3.noCostFrom)
    for (const l of later) {
      expect(l.usd.loaded, l.month).toBe(0)
      expect(l.holderId, l.month).toBeNull()
    }
  })

  it('reports no reconciliation exception at 30 Sep 2026', () => {
    expect(reconcile({ positions: H3.rows, workers: H3.workers }, H3.reconcileAsOf)).toEqual([])
  })
})

describe('H4: a seat imported as Planned with an assignment from 1 Sep 2026', () => {
  it('is Filled with 1 plan head at 30 Sep 2026', () => {
    const state = seatOn(H4.planned.seat, H4.planned.at)
    expect(state?.status).toBe(H4.planned.status)
    expect(planHeadsAt([H4.planned.seat], H4.planned.at)).toBe(H4.planned.planHeads)
  })

  it('reports no exception (story 1 shape)', () => {
    expect(reconcile({ positions: H4.planned.rows, workers: H4.planned.workers }, H4.asOf)).toHaveLength(
      H4.planned.exceptions,
    )
  })

  for (const c of H4.onOpen) {
    it(`imported as ${c.status}, reports assignment-on-open`, () => {
      const found = reconcile({ positions: c.rows, workers: c.workers }, H4.asOf)
      expect(found).toHaveLength(1)
      expect(found[0]).toMatchObject(c.expected)
    })
  }
})
