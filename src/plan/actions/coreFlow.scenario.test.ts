/**
 * The M3 review's core-flow fixes walked through the write path as the app runs them (lead decisions
 * R47, D-EXPIRY, D-CYCLE and D-MERGE; review SC-1 to SC-6, SP-1 to SP-11): each step acted by its own
 * person over the sample, the audit chain checked after the walk. Each case failed before its fix.
 */
import { describe, expect, it } from 'vitest'
import { actionContextOf, actionEnvOf } from '@/app/write/context'
import {
  approveAll,
  chainOk,
  deciderOf,
  type Scenario,
  scenario,
  type Who,
} from '@/app/write/scenario.testkit'
import type { AnalyticsContext } from '@/data/context'
import { assumptionKey, SITES } from '@/data/schema'
import { requestsOf } from '@/drill/seats'
import { cutLine } from '@/plan/engine/cycle'
import { BELOW_THE_CUT_LINE, tradeCreditChange } from '@/plan/engine/requests'
import { asks } from '@/plan/engine/targets'
import type { TradeAsk } from '@/plan/engine/trade'
import type { Cycle, HcRequest, OrgMatch } from '@/plan/types'
import { personaOf } from '@/testkit/sample'
import { forecastRunOf } from '@/views/forecast/engine/run'
import {
  draftUpdatedNotice,
  hrbpReviewDoneNotice,
  stageMovedNotice,
  submittedNotice,
  withdrawnNotice,
} from './copy'
import { requestIdInText } from './requestIds'
import { cycleChangesNotice, importedApprovals, noLongerFitsText } from './requests'

const idOf = (text: string): string => requestIdInText(text) ?? ''
const SE = 'Silicon Engineering'
const said = (o: { ok: true; notice: string } | { ok: false; refused: string }): string =>
  o.ok ? o.notice : o.refused

const admin = (sc: Scenario): Who => ({
  mode: 'hr-admin',
  personId: personaOf(sc.sample, 'hr-admin').employeeId,
})

/** A New role drafted and submitted by Manager A (GTM), the request's ID. */
async function managerANewRole(sc: Scenario, start = '2027-06-01'): Promise<{ id: string; mgr: Who }> {
  const a = personaOf(sc.sample, 'manager-a')
  const mgr: Who = { mode: 'manager', personId: a.employeeId }
  const d = await sc.run(mgr, 'createRequest', {
    type: 'New role',
    managerPositionId: a.positionId,
    level: 'P3',
    location: 'San Jose',
    fte: 1,
    startDate: start,
    reasonCode: 'Growth',
  })
  const id = idOf(said(d.outcome))
  expect((await sc.run(mgr, 'submitRequest', { requestId: id })).outcome).toEqual({
    ok: true,
    notice: submittedNotice(id),
  })
  return { id, mgr }
}

/** Every cycle ask still waiting on its manager step, approved by that manager acting as themselves. */
async function approveManagerSteps(sc: Scenario, cycleId: string): Promise<void> {
  const ctx = await sc.ctx(admin(sc))
  for (const r of requestsOf(ctx)) {
    if (r.cycleId !== cycleId || r.state !== 'Submitted') continue
    const step = r.steps.find((s) => s.decision == null)
    if (!step) continue
    const out = await sc.run({ mode: 'manager', personId: step.approverId }, 'approveRequest', {
      requestId: r.requestId,
    })
    expect(out.outcome.ok, `${r.requestId}: ${said(out.outcome)}`).toBe(true)
  }
}

/** A Manager A trade of one of their Open or Planned seats for seats under their own position. */
async function managerATrade(sc: Scenario, start: string): Promise<{ id: string; mgr: Who; ask: TradeAsk }> {
  const a = personaOf(sc.sample, 'manager-a')
  const mgr: Who = { mode: 'manager', personId: a.employeeId }
  const ctx = await sc.ctx(mgr)
  const env = actionEnvOf(ctx)
  const own = [
    ...new Set(
      ctx.all.positions.filter((r) => r.managerPositionId === a.positionId).map((r) => r.positionId),
    ),
  ]
  const give = own.find((id) => {
    const x = env.seat(id)
    return !!x && (x.status === 'Planned' || x.status === 'Open') && !x.acceptedOffer && !x.pendingRequestId
  }) as string
  let ask: TradeAsk | null = null
  for (const location of ['Bengaluru', 'Austin', 'Toronto', 'Munich', 'San Jose'])
    for (const level of ['P1', 'P2', 'P3'] as const) {
      if (ask) break
      const candidate: TradeAsk = {
        give: [give],
        creditUsedBp: 0,
        giveOrgPositionId: null,
        get: {
          level,
          location,
          fte: 1,
          orgPositionId: a.positionId,
          businessUnit: a.businessUnit,
          jobFamily: null,
          start,
          count: 'max',
          partTimeRest: false,
        },
      }
      const q = env.quote(candidate)
      if (q.ok && q.get.length >= 2) ask = candidate
    }
  if (!ask) throw new Error('no trade for Manager A')
  const made = await sc.run(mgr, 'createTrade', { ask, reasonCode: 'Location strategy' })
  return { id: idOf(said(made.outcome)), mgr, ask }
}

/** Approves a request's steps, each by its approver, until the step `role` waits (or none does). */
async function approveUntil(sc: Scenario, id: string, role: string): Promise<HcRequest> {
  for (let i = 0; i < 8; i++) {
    const r = (await sc.request(id)) as HcRequest
    const w = r.steps.find((x) => x.enteredAt != null && x.decision == null)
    if (!w || w.role === role) return r
    const out = await sc.run(deciderOf(sc.sample, r), 'approveRequest', { requestId: id })
    expect(out.outcome.ok, said(out.outcome)).toBe(true)
  }
  return (await sc.request(id)) as HcRequest
}

describe('R47: the business date of every write is the as-of date', () => {
  it('a request submitted weeks after the as-of date waits on its approver from the as-of date; the audit keeps the wall clock', async () => {
    const sc = scenario({ start: '2026-10-24T09:00:00.000Z' })
    const { id, mgr } = await managerANewRole(sc)
    let r = (await sc.request(id)) as HcRequest
    expect(r.submittedAt?.slice(0, 10)).toBe('2026-09-30')
    expect(r.updatedAt.slice(0, 10)).toBe('2026-09-30')
    expect(r.steps[0].enteredAt?.slice(0, 10)).toBe('2026-09-30')
    // The first approver decides; the next step is entered on the as-of date too.
    const first = await sc.run(deciderOf(sc.sample, r), 'approveRequest', { requestId: id })
    expect(first.outcome.ok).toBe(true)
    for (const e of first.entries) {
      expect(e.at.slice(0, 10)).toBe('2026-10-24')
      expect(e.effectiveDate).toBe('2026-09-30')
    }
    r = (await sc.request(id)) as HcRequest
    expect(r.steps[0].at?.slice(0, 10)).toBe('2026-09-30')
    expect(r.steps[1].enteredAt?.slice(0, 10)).toBe('2026-09-30')
    // Sent back and submitted again: still on the as-of date.
    const back = await sc.run(deciderOf(sc.sample, r), 'sendBack', { requestId: id, reason: 'Say why now.' })
    expect(back.outcome.ok).toBe(true)
    expect((await sc.run(mgr, 'submitRequest', { requestId: id })).outcome.ok).toBe(true)
    r = (await sc.request(id)) as HcRequest
    expect(r.steps.find((x) => x.decision == null)?.enteredAt?.slice(0, 10)).toBe('2026-09-30')
    // Approved at every step: the Planned seat is dated the as-of date.
    const steps = await approveAll(sc, id)
    expect(steps.every((x) => x.outcome.ok)).toBe(true)
    r = (await sc.request(id)) as HcRequest
    expect(r.state).toBe('Approved')
    const seat = r.outcome?.createdPositionIds[0]
    const row = (await sc.plan()).overlay.positions.find((p) => p.positionId === seat)
    expect(row?.effectiveDate).toBe('2026-09-30')
    expect(chainOk(await sc.log())).toBe(true)
  }, 180_000)
})

describe('D-EXPIRY: an expired request is not pending, and its requester may withdraw it', () => {
  it('withdraws a Draft idle for 60 days', async () => {
    const sc = scenario()
    const a = personaOf(sc.sample, 'manager-a')
    const mgr: Who = { mode: 'manager', personId: a.employeeId }
    const d = await sc.run(mgr, 'createRequest', {
      type: 'New role',
      managerPositionId: a.positionId,
      level: 'P3',
      location: 'San Jose',
      fte: 1,
      startDate: '2027-06-01',
      reasonCode: 'Growth',
    })
    const id = idOf(said(d.outcome))
    const at60: Who = { ...mgr, asOf: '2026-11-29' }
    const out = await sc.run(at60, 'withdrawRequest', { requestId: id })
    expect(out.outcome).toEqual({ ok: true, notice: withdrawnNotice(id) })
    expect((await sc.request(id))?.state).toBe('Withdrawn')
  }, 120_000)
})

describe('D-CYCLE: the lock applies the line the tab shows, and only to manager-approved asks', () => {
  /** Finance moves the FY28 cycle to HRBP review; the SE HRBP and the SE SVP finish their reviews. */
  async function toFinanceReview(sc: Scenario, cycleId: string) {
    const s = sc.sample
    const fin: Who = { mode: 'finance', personId: personaOf(s, 'finance-fpa').employeeId }
    const hrbp: Who = { mode: 'hrbp', personId: personaOf(s, 'hrbp-se').employeeId, unit: SE }
    const leader: Who = { mode: 'leader', personId: personaOf(s, 'leader-svp-se').employeeId }
    expect((await sc.run(fin, 'finishStage', { cycleId })).outcome).toEqual({
      ok: true,
      notice: stageMovedNotice('HRBP review'),
    })
    return {
      fin,
      hrbp,
      leader,
      finish: async () => {
        expect((await sc.run(hrbp, 'finishStage', { cycleId, businessUnit: SE })).outcome).toMatchObject({
          ok: true,
          notice: `${hrbpReviewDoneNotice(SE)} ${stageMovedNotice('Leader review')}`,
        })
        const lead = await sc.run(leader, 'finishStage', {
          cycleId,
          leaderPositionId: personaOf(s, 'leader-svp-se').positionId,
        })
        expect(lead.outcome.ok, said(lead.outcome)).toBe(true)
      },
    }
  }

  it('story 6 with no line set: the lock waits for the managers, then cuts after the 40th ranked head', async () => {
    const sc = scenario()
    const cycleId = sc.sample.story.cycleId
    const { fin, finish } = await toFinanceReview(sc, cycleId)
    await finish()
    const cycleNow = async () => (await sc.plan()).cycles.find((c) => c.cycleId === cycleId) as Cycle
    expect((await cycleNow()).stage).toBe('Finance review')
    expect((await cycleNow()).cutLines).toEqual([])
    // Asks still wait on their managers: the lock is refused and names how many.
    const refused = await sc.run(fin, 'lockCycle', { cycleId })
    expect(said(refused.outcome)).toMatch(
      /^Lock the FY28 cycle once these asks have their manager's decision: \d+ asks with \d+ managers\.$/,
    )
    expect(refused.entries).toEqual([])
    await approveManagerSteps(sc, cycleId)
    // Every ask still ranks: 58 heads, the default line after the 40th.
    const ranked =
      actionEnvOf(await sc.ctx(fin))
        .rankedAsks(cycleId)
        .get(SE) ?? []
    expect(ranked.reduce((n, a) => n + a.heads, 0)).toBe(58)
    const line = cutLine(ranked, 40)
    expect([line.headsAbove, line.headsBelow]).toEqual([40, 18])
    const lock = await sc.run(fin, 'lockCycle', { cycleId })
    expect(said(lock.outcome)).toBe(
      `The FY28 cycle is locked: ${line.above.length} asks approved, ${line.below.length} below the cut line.`,
    )
    for (const id of line.below)
      expect(await sc.request(id), id).toMatchObject({ state: 'Rejected', reasonCode: BELOW_THE_CUT_LINE })
    for (const id of line.above) expect((await sc.request(id))?.state, id).toBe('Approved')
    expect(chainOk(await sc.log())).toBe(true)
  }, 300_000)

  it('the HRBP’s changes make "Approved with changes" at lock; a leader stays within the envelope', async () => {
    const sc = scenario()
    const cycleId = sc.sample.story.cycleId
    const { fin, hrbp, leader, finish } = await toFinanceReview(sc, cycleId)
    await approveManagerSteps(sc, cycleId)
    const ranked0 =
      actionEnvOf(await sc.ctx(fin))
        .rankedAsks(cycleId)
        .get(SE) ?? []
    // The unit's HRBP changes the first ranked New role's start during HRBP review (SC-9, SP-6).
    const ctx0 = await sc.ctx(fin)
    const roles = new Set(
      requestsOf(ctx0)
        .filter((r) => r.type === 'New role')
        .map((r) => r.requestId),
    )
    const changedId = ranked0.find((a) => roles.has(a.requestId))?.requestId as string
    const change = await sc.run(hrbp, 'approveWithChanges', {
      requestId: changedId,
      changes: [{ field: 'startDate', old: null, new: '2027-07-01' }],
      reason: 'Start after the tape-out.',
    })
    expect(change.outcome).toEqual({ ok: true, notice: cycleChangesNotice(changedId) })
    expect((await sc.request(changedId))?.startDate).toBe('2027-07-01')
    await finish()
    // Leader review is done; at Finance review the SVP cannot set a line past the envelope.
    expect((await sc.plan()).cycles.find((c) => c.cycleId === cycleId)?.stage).toBe('Finance review')
    const past = await sc.run(leader, 'moveCutLine', { cycleId, businessUnit: SE, afterHeads: 58 })
    expect(said(past.outcome)).toBe(
      'Within the envelope. This line puts 58 heads above it, and the target leaves room for 40.',
    )
    expect(
      (await sc.run(leader, 'moveCutLine', { cycleId, businessUnit: SE, afterHeads: 30 })).outcome.ok,
    ).toBe(true)
    const lock = await sc.run(fin, 'lockCycle', { cycleId })
    expect(lock.outcome.ok, said(lock.outcome)).toBe(true)
    expect((await sc.request(changedId))?.state).toBe('Approved with changes')
    const outcome = (await sc.request(changedId))?.outcome?.createdPositionIds[0]
    const row = (await sc.plan()).overlay.positions.find((p) => p.positionId === outcome)
    expect(row?.startDate).toBe('2027-07-01')
    expect(chainOk(await sc.log())).toBe(true)
  }, 300_000)

  it('the lock never decides a Sent back ask', async () => {
    const sc = scenario()
    const cycleId = sc.sample.story.cycleId
    const { fin, finish } = await toFinanceReview(sc, cycleId)
    // One ask waiting on its manager is sent back by that manager; the rest are approved.
    const ctx = await sc.ctx(admin(sc))
    const target = requestsOf(ctx).find(
      (r) => r.cycleId === cycleId && r.state === 'Submitted' && r.steps.some((x) => x.decision == null),
    ) as HcRequest
    const step = target.steps.find((x) => x.decision == null)
    const back = await sc.run({ mode: 'manager', personId: step?.approverId ?? '' }, 'sendBack', {
      requestId: target.requestId,
      reason: 'Rank it against the others first.',
    })
    expect(back.outcome.ok, said(back.outcome)).toBe(true)
    await approveManagerSteps(sc, cycleId)
    const ranked =
      actionEnvOf(await sc.ctx(fin))
        .rankedAsks(cycleId)
        .get(SE) ?? []
    expect(ranked.some((a) => a.requestId === target.requestId)).toBe(false)
    await finish()
    expect((await sc.run(fin, 'lockCycle', { cycleId })).outcome.ok).toBe(true)
    const after = (await sc.request(target.requestId)) as HcRequest
    expect(after.state).toBe('Sent back')
    expect(after.outcome).toBeNull()
  }, 300_000)
})

describe('an approved internal move holds its seats (SC-6)', () => {
  it('the gap does not move at approval, and the receiving seat is offered to nothing else', async () => {
    const sc = scenario()
    const s = sc.sample
    const a = personaOf(s, 'manager-a')
    const adminCtx = await sc.ctx(admin(sc))
    const env = actionEnvOf(adminCtx)
    const from = [...adminCtx.positionIndex.byId.values()].find(
      (r) => r.managerPositionId === a.positionId && env.seat(r.positionId)?.status === 'Filled',
    )
    const to = [...adminCtx.positionIndex.byId.values()].find(
      (r) =>
        r.businessUnit === SE &&
        env.seat(r.positionId)?.status === 'Open' &&
        !env.seat(r.positionId)?.acceptedOffer &&
        !env.seat(r.positionId)?.pendingRequestId,
    )
    if (!from || !to) throw new Error('no seats')
    const person = adminCtx.all.workers.find((w) => w.positionId === from.positionId)?.employeeId as string
    const gtmHrbp: Who = { mode: 'hrbp', personId: 'E11076', unit: 'Go-to-Market' }
    const gtm: OrgMatch = (place) => place.businessUnit === 'Go-to-Market'
    const asksOf = async (): Promise<number> => {
      const c = await sc.ctx(admin(sc))
      return asks(gtm, '2027-03-31', requestsOf(c), actionEnvOf(c).asks).heads
    }
    const draft = await sc.run(gtmHrbp, 'processTransfer', {
      kind: 'internal',
      personId: person,
      fromPositionId: from.positionId,
      toPositionId: to.positionId,
      effectiveDate: '2026-11-02',
      moveBudget: false,
      reasonCode: 'Restructure',
    })
    const id = idOf(said(draft.outcome))
    expect((await sc.run(gtmHrbp, 'submitRequest', { requestId: id })).outcome.ok).toBe(true)
    const pending = await asksOf()
    const steps = await approveAll(sc, id)
    expect(steps.every((x) => x.outcome.ok)).toBe(true)
    expect((await sc.request(id))?.state).toBe('Approved')
    expect(await asksOf()).toBe(pending)
    // The receiving seat (Open until HRIS shows the move) is not offered for another move or a trade.
    const held = `This seat is held for ${id}, an approved transfer, until HRIS shows the move.`
    const other = adminCtx.all.workers.find(
      (w) =>
        w.positionId &&
        w.positionId !== from.positionId &&
        env.seat(w.positionId)?.managerPositionId === a.positionId,
    )
    const again = await sc.run(admin(sc), 'processTransfer', {
      kind: 'internal',
      personId: other?.employeeId as string,
      fromPositionId: other?.positionId as string,
      toPositionId: to.positionId,
      effectiveDate: '2026-12-01',
      moveBudget: false,
      reasonCode: 'Restructure',
    })
    expect(said(again.outcome)).toBe(held)
    const elim = await sc.run(admin(sc), 'requestElimination', {
      positionId: to.positionId,
      lastDay: null,
      reasonCode: 'Restructure',
    })
    expect(said(elim.outcome)).toBe(held)
  }, 300_000)
})

describe('trades (SP-5, SP-10, SP-11, CONTRACTS-M3 7.4.3)', () => {
  /** HR admin's cross-unit trade: a Planned seat of one unit for 1 P3 San Jose under another unit's manager. */
  async function crossUnitTrade(sc: Scenario): Promise<{ id: string; from: string; to: string }> {
    const adm = admin(sc)
    const ctx = await sc.ctx(adm)
    const env = actionEnvOf(ctx)
    const latest = new Map(ctx.all.positions.map((r) => [r.positionId, r]))
    const reports = new Map<string, number>()
    for (const r of latest.values())
      if (r.managerPositionId) reports.set(r.managerPositionId, (reports.get(r.managerPositionId) ?? 0) + 1)
    for (const r of latest.values()) {
      const seat = env.seat(r.positionId)
      if (seat?.status !== 'Planned' || seat.pendingRequestId || seat.acceptedOffer) continue
      if (!seat.startDate || seat.startDate < '2026-11-01' || seat.startDate > '2027-03-01') continue
      for (const [mgr, n] of reports) {
        const m = env.seat(mgr)
        if (
          !m ||
          n < 2 ||
          m.businessUnit === seat.businessUnit ||
          m.status !== 'Filled' ||
          m.location !== 'San Jose'
        )
          continue
        const ask: TradeAsk = {
          give: [r.positionId],
          creditUsedBp: 0,
          giveOrgPositionId: null,
          get: {
            level: 'P3',
            location: 'San Jose',
            fte: 1,
            orgPositionId: mgr,
            businessUnit: m.businessUnit,
            jobFamily: null,
            start: '2027-01-01',
            count: 'max',
            partTimeRest: false,
          },
        }
        if (!env.quote(ask).ok) continue
        const made = await sc.run(adm, 'createTrade', { ask, reasonCode: 'Location strategy' })
        const id = idOf(said(made.outcome))
        expect((await sc.run(adm, 'submitRequest', { requestId: id })).outcome.ok).toBe(true)
        return { id, from: seat.businessUnit, to: m.businessUnit }
      }
    }
    throw new Error('no cross-unit trade')
  }

  const unitTargets = async (sc: Scenario, units: readonly string[]) => {
    const c = await sc.ctx(admin(sc))
    return units.map((u) => {
      const t = actionEnvOf(c)
        .targets('FY27')
        .find((x) => x.businessUnit === u && !x.department && !x.costCenter && !x.leaderPositionId)
      return [t?.targetHeads, t?.targetCost]
    })
  }

  it('a cross-unit trade moves both units’ targets at its last step, unless Finance says no', async () => {
    const sc = scenario()
    const t = await crossUnitTrade(sc)
    const before = await unitTargets(sc, [t.from, t.to])
    const steps = await approveAll(sc, t.id)
    expect(steps.every((x) => x.outcome.ok)).toBe(true)
    const after = await unitTargets(sc, [t.from, t.to])
    const r = (await sc.request(t.id)) as HcRequest
    const received = (r.trade?.count ?? 0) + (r.trade?.restFte ? 1 : 0)
    expect(after[0][0]).toBe((before[0][0] as number) - 1)
    expect(after[1][0]).toBe((before[1][0] as number) + received)
    expect(after[0][1]).toBeLessThan(before[0][1] as number)
    expect(after[1][1]).toBeGreaterThan(before[1][1] as number)
    const log = await sc.log()
    expect(log.filter((e) => e.object === 'target').length).toBeGreaterThanOrEqual(2)
    expect(chainOk(log)).toBe(true)

    // The same trade with "Move target too?" off at its last step leaves both targets as they were.
    const sc2 = scenario()
    const t2 = await crossUnitTrade(sc2)
    const before2 = await unitTargets(sc2, [t2.from, t2.to])
    const last = await approveUntil(sc2, t2.id, 'finance')
    const fin = await sc2.run(deciderOf(sc2.sample, last), 'approveRequest', {
      requestId: t2.id,
      moveTarget: false,
    })
    expect(fin.outcome.ok, said(fin.outcome)).toBe(true)
    expect((await sc2.request(t2.id))?.state).toBe('Approved')
    expect(await unitTargets(sc2, [t2.from, t2.to])).toEqual(before2)
  }, 300_000)

  it('approve with changes re-quotes the trade: a start in a closed month is refused, a lower count keeps its credit change', async () => {
    const sc = scenario()
    const { id } = await managerATrade(sc, '2027-02-01')
    expect(
      (
        await sc.run(
          { mode: 'manager', personId: personaOf(sc.sample, 'manager-a').employeeId },
          'submitRequest',
          { requestId: id },
        )
      ).outcome.ok,
    ).toBe(true)
    let r = await approveUntil(sc, id, 'hrbp')
    const hr = deciderOf(sc.sample, r)
    const closed = await sc.run(hr, 'approveWithChanges', {
      requestId: id,
      changes: [{ field: 'startDate', old: null, new: '2026-06-01' }],
      reason: 'Start sooner.',
    })
    expect(said(closed.outcome)).toBe('Start dates must be in Oct 2026 or later.')
    const before = r.trade?.creditBp ?? 0
    const lower = (r.trade?.count ?? 2) - 1
    const out = await sc.run(hr, 'approveWithChanges', {
      requestId: id,
      changes: [{ field: 'count', old: null, new: lower }],
      reason: 'Hire in two waves.',
    })
    expect(out.outcome.ok, said(out.outcome)).toBe(true)
    r = (await sc.request(id)) as HcRequest
    expect(r.trade?.count).toBe(lower)
    expect((r.trade?.creditBp ?? 0) > before).toBe(true)
    expect(tradeCreditChange(r)).toEqual({ old: before, new: r.trade?.creditBp })
    const fields = out.entries.filter((e) => e.object === 'request').map((e) => e.field)
    expect(fields).toEqual(expect.arrayContaining(['count', 'getBp', 'creditBp']))
  }, 300_000)

  it('an FY28 trade re-quoted after FY28 rates change: "Rates changed" on the step, or the approver’s sentence when it no longer fits', async () => {
    for (const k of [0.8, 1.2]) {
      const sc = scenario()
      const { id, ask, mgr } = await managerATrade(sc, '2027-05-03')
      expect((await sc.run(mgr, 'submitRequest', { requestId: id })).outcome.ok).toBe(true)
      const zone = SITES.find((x) => x.location === ask.get.location)?.zone as string
      const key = assumptionKey([ask.get.level, zone, 'FY28'])
      const row = (await sc.ctx(admin(sc))).all.assumptions.find(
        (x) => x.version === 'fy28-working' && x.table === 'band' && x.key === key,
      )
      if (!row) throw new Error('no FY28 band row')
      const edit = await sc.run(admin(sc), 'editAssumptions', {
        versionId: 'fy28-working',
        rows: [{ ...row, value: Math.round(row.value * k) }],
      })
      expect(edit.outcome.ok, said(edit.outcome)).toBe(true)
      const r = (await sc.request(id)) as HcRequest
      const step = await sc.run(deciderOf(sc.sample, r), 'approveRequest', { requestId: id })
      if (k < 1) {
        expect(step.outcome.ok, said(step.outcome)).toBe(true)
        const after = (await sc.request(id)) as HcRequest
        const note = after.steps.find((x) => x.decision != null)?.note ?? ''
        expect(note).toMatch(/^Rates changed: .* standard heads\.$/)
        expect(step.entries.some((e) => e.field === 'getBp' && e.comment === note)).toBe(true)
      } else expect(said(step.outcome)).toBe(noLongerFitsText('FY28'))
    }
  }, 300_000)

  it('a trade draft is edited from Mine: re-quoted, its fields and org moved and audited', async () => {
    const sc = scenario()
    const { id, mgr, ask } = await managerATrade(sc, '2027-01-04')
    const before = (await sc.request(id)) as HcRequest
    const fewer: TradeAsk = { ...ask, get: { ...ask.get, count: 1 } }
    const out = await sc.run(mgr, 'editRequest', { requestId: id, patch: { ask: fewer } })
    expect(out.outcome).toEqual({ ok: true, notice: draftUpdatedNotice(id) })
    const after = (await sc.request(id)) as HcRequest
    expect(after.trade?.count).toBe(1)
    expect((after.trade?.creditBp ?? 0) > (before.trade?.creditBp ?? 0)).toBe(true)
    expect(out.entries.map((e) => e.field)).toEqual(expect.arrayContaining(['count', 'creditBp']))
    const later: TradeAsk = { ...fewer, get: { ...fewer.get, start: '2027-02-01' } }
    const moved = await sc.run(mgr, 'editRequest', { requestId: id, patch: { ask: later } })
    expect(moved.entries.map((e) => [e.field, e.old, e.new])).toContainEqual([
      'startDate',
      '2027-01-04',
      '2027-02-01',
    ])
    expect(chainOk(await sc.log())).toBe(true)
  }, 300_000)
})

describe('D-MERGE: an approval a file brings applies here', () => {
  it('adds the approved New role’s seat with the file’s ID, once; a request naming a seat this workspace lacks is a conflict', async () => {
    // Workspace A: Manager A's New role approved at every step.
    const a = scenario()
    const { id } = await managerANewRole(a)
    expect((await approveAll(a, id)).every((x) => x.outcome.ok)).toBe(true)
    const approved = (await a.request(id)) as HcRequest
    const seat = approved.outcome?.createdPositionIds[0] as string
    expect(seat).toBeTruthy()

    // Workspace B never saw it: the GTM HRBP imports it.
    const b = scenario()
    const who: Who = { mode: 'hrbp', personId: 'E11076', unit: 'Go-to-Market' }
    const ctx: AnalyticsContext = await b.ctx(who)
    const actx = actionContextOf(ctx, { readOnly: false, at: '2026-10-24T10:00:00.000Z' })
    const plan = await b.plan()
    const out = importedApprovals(plan, actx, [approved], () => 'Approved in the imported file.')
    expect(out.conflicts).toEqual([])
    expect(out.applied).toEqual([id])
    const row = out.next.overlay.positions.find((p) => p.positionId === seat)
    expect(row).toMatchObject({ status: 'Planned', sourceRequestId: id })
    expect(row?.effectiveDate).toBe(approved.steps.at(-1)?.at?.slice(0, 10))
    for (const e of out.audit)
      expect(e).toMatchObject({ by: 'E11076', comment: 'Approved in the imported file.' })
    // Twice in one import, it applies once.
    expect(importedApprovals(plan, actx, [approved, approved]).applied).toEqual([id])
    // A request naming a manager seat B does not hold is a conflict, and nothing changes.
    const stray = { ...approved, requestId: 'R-STRAY', managerPositionId: 'P-NOT-HERE', outcome: null }
    const c = importedApprovals(plan, actx, [stray])
    expect(c.conflicts).toEqual([
      {
        requestId: 'R-STRAY',
        text: 'R-STRAY cannot be applied here: seat P-NOT-HERE is not in this workspace.',
      },
    ])
    expect(c.next).toBe(plan)
  }, 300_000)
})

describe('an approved freeze exception starts in the forecast (SC-4)', () => {
  it('Finance approves R-1029; its new seat has a forecast start', async () => {
    const sc = scenario()
    const fin: Who = { mode: 'finance', personId: personaOf(sc.sample, 'finance-fpa').employeeId }
    const out = await sc.run(fin, 'approveRequest', { requestId: 'R-1029' })
    expect(out.outcome.ok, said(out.outcome)).toBe(true)
    const seat = (await sc.request('R-1029'))?.outcome?.createdPositionIds[0] as string
    expect(seat).toBeTruthy()
    const run = forecastRunOf(await sc.ctx(admin(sc)))
    expect(run?.starts.get(seat) ?? null).not.toBeNull()
  }, 300_000)
})
