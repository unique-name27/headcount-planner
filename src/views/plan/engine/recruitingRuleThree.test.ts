/**
 * Plan > Recruiting summary and 8.4 rule 3 inside the viewer's scope (docs/CONTRACTS-HIRING.md I1,
 * docs/PLAN.md 9.7 Privacy, change C38; reviews RP-2 and RP-3, 27 Oct 2026). Rule 3 hides a request on
 * the viewer's own seat or a seat above it, and its effects outside the scope never move a count
 * (Manager mode's tree, src/access/leaks.recruiting.slow.test.ts). Inside the scope nothing is left
 * out, so a mode whose scope holds the touched seat reads the approved state as its other tabs do:
 *
 *  - RP-2: Finance acting as Manager C, with C's confidential Elimination approved: the request is
 *    hidden (requestView "none"), and the tab's approved heads and open to hire fall by 1, as Plan >
 *    Overview's plan heads for January 2027 do, so the tab agrees with the other tabs.
 *  - RP-3: Manager A, with an approved Trade that gives the vacant seat above A's and gets 2 Planned
 *    seats under A's seat: the request shows nowhere (no row, no ID), and its get seats are the team's
 *    seats, read as Plan > Overview reads them (11 approved heads on both).
 *
 * These pin readings the code already takes (I1); they hold before and after the fix review, which
 * changed the words of 9.7, I1 and the hiringData.ts comment, not the code.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { hiddenByRuleThree, requestView, viewerOf } from '@/access/visibility'
import type { AnalyticsContext } from '@/data/context'
import type { Sample } from '@/data/sample'
import type { PositionRow } from '@/data/schema'
import { requestsOf } from '@/drill/seats'
import { fromRow } from '@/plan/engine/requests'
import type { HcRequest } from '@/plan/types'
import { MemoryStorage } from '@/testkit/memoryStorage'
import {
  ctxAs,
  leakSample,
  personaCtx,
  personaOf,
  pinClock,
  unpinClock,
  withPlan,
  withWorker,
} from '@/testkit/sample'
import { prepare } from './base'
import { planHiringModel } from './hiringTab'
import { approvedTile } from './kpis'
import { headsByMonth } from './overview'
import { planRecruitingModel } from './recruitingTab'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
vi.stubGlobal('localStorage', new MemoryStorage())

let s: Sample
beforeAll(() => {
  pinClock()
  s = leakSample()
}, 120_000)
afterAll(() => unpinClock())

const tile = (ctx: AnalyticsContext, id: string) =>
  planRecruitingModel(ctx).kpis.find((k) => k.id === id)?.value
const janHeads = (ctx: AnalyticsContext) =>
  headsByMonth(prepare(ctx)).rows.find((r) => r.month === '2027-01')?.plan

/** C's confidential Elimination approved, as the recruiting leak test plants it (the seat ends 31 Dec 2026). */
function withEliminationApproved(x: Sample): Sample {
  const id = x.planted.managerCElimination
  const row = x.datasets.requests.find((r) => r.requestId === id)
  if (!row?.positionId || !row.startDate) throw new Error('The sample has no Elimination of C’s seat.')
  const seat = row.positionId
  const base = x.datasets.positions
    .filter((r) => r.positionId === seat && r.effectiveDate <= (row.startDate as string))
    .sort((a, b) => (a.effectiveDate < b.effectiveDate ? -1 : 1))
    .at(-1) as PositionRow
  const ended: PositionRow = {
    ...base,
    effectiveDate: '2027-01-01',
    status: 'Eliminated',
    endDate: row.startDate,
    endReason: 'Eliminated',
    sourceRequestId: id,
  }
  const approved = { ...fromRow(row), state: 'Approved' as const }
  return withPlan(x, {
    requests: [...x.plan.requests.filter((r) => r.requestId !== id), approved],
    overlay: { ...x.plan.overlay, positions: [...x.plan.overlay.positions, ended] },
  })
}

describe('a hidden request on a seat inside the scope reads as the other tabs read it (I1, RP-2)', () => {
  it('Finance acting as C: C’s approved Elimination is hidden, and the tab falls by 1 as Plan > Overview does', () => {
    const c = personaOf(s, 'manager-c')
    const id = s.planted.managerCElimination
    const before = ctxAs('finance', c.employeeId, { sample: s })
    const after = ctxAs('finance', c.employeeId, { sample: withEliminationApproved(s) })
    const req = requestsOf(after).find((r) => r.requestId === id) as HcRequest
    expect(req).toBeTruthy()
    const v = viewerOf(after)
    // Rule 3 hides it from Finance acting as C (the viewer's own seat): not rule 2's view.
    expect([hiddenByRuleThree(req, v), requestView(req, v)]).toEqual([true, 'none'])
    expect(tile(after, 'recruiting-approved')).toBe((tile(before, 'recruiting-approved') as number) - 1)
    expect(tile(after, 'recruiting-open')).toBe((tile(before, 'recruiting-open') as number) - 1)
    // Plan > Overview's plan heads for January 2027 fall by the same seat, and so does Plan > Hiring.
    expect(janHeads(after)).toBe((janHeads(before) as number) - 1)
    const open = (ctx: AnalyticsContext) =>
      planHiringModel(ctx).kpis.find((k) => k.id === 'hiring-open')?.value
    expect(open(after)).toBe(tile(after, 'recruiting-open'))
    // The request itself shows nowhere on the tab.
    expect(JSON.stringify(planRecruitingModel(after).deckNumbers)).not.toContain(id)
  })
})

const latest = (x: Sample, seat: string, on: string): PositionRow =>
  x.datasets.positions
    .filter((r) => r.positionId === seat && r.effectiveDate <= on)
    .sort((a, b) => (a.effectiveDate < b.effectiveDate ? -1 : 1))
    .at(-1) as PositionRow

/** An approved Trade, rows as src/plan/engine/trade.ts `applyTrade` writes them: the give seat Eliminated, 2 Planned get seats under `org`. */
function withTrade(x: Sample, give: string, org: string, at: string): Sample {
  const id = 'R-FIX-TRADE'
  const t = fromRow(x.datasets.requests.find((r) => r.requestId === x.planted.managerCElimination) as never)
  const g = latest(x, give, at)
  const o = latest(x, org, at)
  const req = {
    ...t,
    requestId: id,
    type: 'Trade',
    state: 'Approved',
    positionId: null,
    managerPositionId: org,
    businessUnit: o.businessUnit,
    department: o.department ?? null,
    level: 'P3',
    location: o.location,
    fte: 1,
    jobTitle: 'Engineer',
    startDate: '2026-12-01',
    trade: {
      givePositionIds: [give],
      giveOrgPositionId: g.managerPositionId ?? give,
      creditUsedBp: 0,
      count: 2,
      jobFamily: null,
      partTimeRest: false,
      restFte: null,
      rateVersion: null,
      rateHash: null,
      giveBp: 10000,
      getBp: 10000,
      creditBp: 0,
    },
  } as unknown as HcRequest
  const ended: PositionRow = {
    ...g,
    effectiveDate: at,
    status: 'Eliminated',
    endDate: '2026-09-14',
    endReason: 'Traded',
    sourceRequestId: id,
  }
  const got = [1, 2].map(
    (i) =>
      ({
        ...o,
        positionId: `P-FIX-${i}`,
        effectiveDate: at,
        status: 'Planned',
        title: 'Engineer',
        level: 'P3',
        managerPositionId: org,
        workerType: 'Employee',
        fte: 1,
        startDate: '2026-12-01',
        openedDate: null,
        reqType: 'New',
        leaderLevel: null,
        endDate: null,
        endReason: null,
        sourceRequestId: id,
      }) as PositionRow,
  )
  return withPlan(x, {
    requests: [...x.plan.requests, req],
    overlay: { ...x.plan.overlay, positions: [...x.plan.overlay.positions, ended, ...got] },
  })
}

describe('a hidden Trade’s get seats in the viewer’s own tree are the team’s seats (I1, RP-3)', () => {
  it('Manager A: the request shows nowhere, and the tab’s approved heads are Plan > Overview’s (both 11)', () => {
    const me = personaOf(s, 'manager-a')
    const boss = s.datasets.positions.find((r) => r.positionId === me.positionId)?.managerPositionId as string
    const holder = s.datasets.workers.find(
      (w) => w.positionId === boss && !w.terminationDate && !w.assignmentEnd,
    )
    if (!holder) throw new Error('No holder of the seat above Manager A’s.')
    const vacant = withWorker(s, holder.employeeId, { terminationDate: '2026-08-31' })
    const ctx = personaCtx('manager-a', { sample: withTrade(vacant, boss, me.positionId, '2026-09-15') })
    const req = requestsOf(ctx).find((r) => r.requestId === 'R-FIX-TRADE') as HcRequest
    expect([hiddenByRuleThree(req, viewerOf(ctx)), requestView(req, viewerOf(ctx))]).toEqual([true, 'none'])
    const m = planRecruitingModel(ctx)
    expect(tile(ctx, 'recruiting-approved')).toBe(approvedTile(prepare(ctx)).value)
    expect(tile(ctx, 'recruiting-approved')).toBe(11)
    // Control: without the Trade, 9 on both.
    const base = personaCtx('manager-a', { sample: vacant })
    expect([tile(base, 'recruiting-approved'), approvedTile(prepare(base)).value]).toEqual([9, 9])
    // The request's ID and the seat it gives appear nowhere on the tab.
    const text = JSON.stringify([
      m.kpis.map((k) => [k.label, k.value, k.note, k.formula]),
      m.months.rows,
      m.quarters.rows,
    ])
    expect(text).not.toContain('R-FIX-TRADE')
    expect(text).not.toContain(boss)
  })
})
