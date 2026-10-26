/**
 * Records that lead to more records (docs/PLAN.md 9.5): the position card's counts and the lists
 * they open come from one definition each, so they always agree: the positions reporting to a seat,
 * every position below it, its reqs, the requests that touch it. Eliminated seats have left the
 * tree.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { AnalyticsContext } from '@/data/context'
import { isFieldRef } from '@/data/quality/fieldRef'
import { subtreeIds } from '@/data/scope'
import { endsSeatOn } from '@/plan/engine/versions'
import type { HcRequest } from '@/plan/types'
import { positionCardModel } from './position'
import {
  openReqsOfPosition,
  positionsBelow,
  positionsBelowSpec,
  reqsOfPosition,
  reqsSpec,
  requestsTouching,
  subPositions,
  subPositionsSpec,
  touchedPositions,
} from './related'
import { requestsOf } from './seats'
import { drillContext } from './testkit'

vi.mock('@/access/visibility', async (orig) => ({
  ...(await orig<typeof import('@/access/visibility')>()),
  viewerOf: () => ({ mode: 'hr-admin', personId: null }),
  requestView: () => 'full',
  auditView: (e: unknown) => e,
}))

let ctx: AnalyticsContext
let boss: string

beforeAll(() => {
  ctx = drillContext('hr-admin')
  boss = [...ctx.positionIndex.byId.keys()].find(
    (id) => subPositions(ctx, id).length >= 2 && positionsBelow(ctx, id).length > 5,
  ) as string
}, 120_000)

describe('the tree below a position', () => {
  it('lists exactly the positions the position card counts', () => {
    const card = positionCardModel(ctx, boss)
    const subs = subPositionsSpec(ctx, boss)
    const below = positionsBelowSpec(ctx, boss)
    expect(subs?.rows).toHaveLength(card.subPositions)
    expect(below?.rows).toHaveLength(card.positionsBelow)
    expect(below?.rows.every((p) => p.positionId !== boss)).toBe(true)
    // Every reporting position is below it, and nothing listed is Eliminated on the as-of date.
    const inTree = new Set(below?.rows.map((p) => p.positionId))
    expect(subs?.rows.every((p) => inTree.has(p.positionId))).toBe(true)
    for (const p of below?.rows ?? [])
      expect(endsSeatOn(ctx.positionIndex.byId.get(p.positionId) ?? null, ctx.asOf)).toBe(false)
    // The tree is the index's, less the Eliminated seats.
    const tree = [...subtreeIds(ctx.positionIndex, boss)].filter(
      (id) => id !== boss && !endsSeatOn(ctx.positionIndex.byId.get(id) ?? null, ctx.asOf),
    )
    expect(below?.rows.map((p) => p.positionId).sort()).toEqual(tree.sort())
  })

  it('has nothing to open for a position with nobody under it', () => {
    const leaf = [...ctx.positionIndex.byId.keys()].find(
      (id) => !ctx.positionIndex.children.has(id),
    ) as string
    expect(subPositionsSpec(ctx, leaf)).toBeNull()
    expect(positionsBelowSpec(ctx, leaf)).toBeNull()
    expect(positionCardModel(ctx, leaf)).toMatchObject({ subPositions: 0, positionsBelow: 0, focus: false })
  })

  it('declares fields that exist in the schema', () => {
    for (const spec of [subPositionsSpec(ctx, boss), positionsBelowSpec(ctx, boss)])
      expect(spec?.uses?.every(isFieldRef)).toBe(true)
  })
})

describe('reqs and requests of a position', () => {
  it('lists every req the card counts, newest first, and the open ones', () => {
    const seat = ctx.all.reqs.find((r) => r.positionId && reqsOfPosition(ctx, r.positionId).length > 0)
      ?.positionId as string
    const card = positionCardModel(ctx, seat)
    const spec = reqsSpec(ctx, seat)
    expect(spec?.rows).toHaveLength(card.reqs)
    expect(spec?.rows.every((r) => r.positionId === seat)).toBe(true)
    const dates = spec?.rows.map((r) => r.openedDate) ?? []
    expect([...dates].sort().reverse()).toEqual(dates)
    expect(card.openReqs).toBe(openReqsOfPosition(ctx, seat).length)
    expect(spec?.uses?.every(isFieldRef)).toBe(true)
  })

  it('finds the requests that touch a position: its seat, a trade giving it, a transfer', () => {
    const requests = requestsOf(ctx)
    const withSeat = requests.find((r) => r.positionId) as HcRequest
    const touching = requestsTouching(requests, withSeat.positionId as string)
    expect(touching.map((r) => r.requestId)).toContain(withSeat.requestId)
    expect(touching.every((r) => touchedPositions(r).includes(withSeat.positionId as string))).toBe(true)
    const trade = requests.find((r) => r.trade && r.trade.givePositionIds.length > 0)
    if (trade) {
      const given = trade.trade?.givePositionIds[0] as string
      expect(requestsTouching(requests, given).map((r) => r.requestId)).toContain(trade.requestId)
    }
    // The card lists them, as records for the viewer.
    const card = positionCardModel(ctx, withSeat.positionId as string)
    expect(card.requests.map((r) => r.requestId)).toEqual(touching.map((r) => r.requestId))
  })
})
