/**
 * The Requests view's model on the sample (docs/PLAN.md 8.4, 9.4, 10.3, 13.4): the queue, Mine,
 * Approvals and the Cycle per mode.
 *
 *  - Story 6: Silicon Engineering's FY28 target is 644 heads, its asks 662 (gap −18); the default cut
 *    line falls after the 40th ranked head (40 above, 18 below), and 4 managers have not submitted,
 *    with the Copy note "Could you send your ranked asks for FY28 by 16 Oct?".
 *  - 8.4: every row is the viewer's record (`requestView`), a hidden request is no row, a limited row
 *    carries no person, reason, date or amount; every count is over the rows shown (rule 6).
 *  - Manager mode: no band estimate anywhere, no cut line, no gap after approval.
 *  - Every KPI drills to exactly the rows it counts; the folder headline is the queue's waiting count.
 *  - The settings are read through the dictionary and change the numbers.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { MODES } from '@/access/modes'
import { requestView, viewerOf } from '@/access/visibility'
import { requestsOf } from '@/drill/seats'
import { type RequestRecord, resolveDrill } from '@/drill/types'
import { defaultMetrics } from '@/metrics/api'
import { metricsWith, paramRef, recordParamReads } from '@/metrics/testing'
import { modeCtx, picksOf, sampleCtx, sampleOnce } from '@/views/actions/engine/roleKit'
import { ID, PARAM } from '../metrics'
import { requestsActions } from './actions'
import { requestsHeadline, requestsModel } from './index'

const SE = 'Silicon Engineering'

beforeAll(() => {
  sampleOnce()
}, 120_000)

describe('story 6: the FY28 cycle in Silicon Engineering', () => {
  it('puts the default cut line after the 40th ranked head, against the target of 644 and asks of 662', () => {
    for (const mode of ['hrbp', 'hr-admin', 'finance', 'leader'] as const) {
      const m = requestsModel(modeCtx(mode))
      const se = m.cycle.units.find((u) => u.businessUnit === SE)
      expect(se, mode).toMatchObject({
        targetHeads: 644,
        asksHeads: 662,
        rankedHeads: 58,
        room: 40,
        cutAfter: 40,
        source: 'default',
        headsAbove: 40,
        headsBelow: 18,
      })
      expect((se?.targetHeads ?? 0) - (se?.asksHeads ?? 0), mode).toBe(-18)
      expect(se?.sentence, mode).toContain('after the 40th ranked head')
      const rows = m.cycle.asks.rows.filter((r) => r.businessUnit === SE)
      expect(
        rows.reduce((n, r) => n + r.heads, 0),
        mode,
      ).toBe(58)
      expect(
        rows.filter((r) => r.aboveCut).reduce((n, r) => n + r.heads, 0),
        mode,
      ).toBe(40)
      // The line follows the ranking: every ask with heads above it is ranked before every one below.
      const lastAbove = Math.max(...rows.filter((r) => r.aboveCut && r.heads > 0).map((r) => r.rank))
      const firstBelow = Math.min(...rows.filter((r) => !r.aboveCut).map((r) => r.rank))
      expect(lastAbove, mode).toBeLessThan(firstBelow)
      expect(rows.find((r) => r.rank === firstBelow)?.cumulativeHeads, mode).toBe(41)
    }
  })

  it("lists the HRBP unit's four managers who have not submitted, with the Copy note", () => {
    const m = requestsModel(modeCtx('hrbp'))
    expect(m.cycle.cycle).toMatchObject({ cycleId: 'cycle-fy28', fiscalYear: 'FY28', stage: 'Open for asks' })
    expect(m.cycle.notSubmitted.rows.map((r) => r.employeeId).sort()).toEqual(
      [...sampleOnce().story.notSubmitted].sort(),
    )
    expect(m.cycle.copyNote).toBe('Could you send your ranked asks for FY28 by 16 Oct?')
    const kpi = m.queue.kpis.find((k) => k.metricId === ID.cycleNotSubmitted)
    expect(kpi?.value).toBe(4)
    expect(resolveDrill(kpi?.drill)?.rows).toHaveLength(4)
  })

  it('shows the cycle under way while FY27 is shown, and the FY28 cycle when FY28 Working is picked', () => {
    const fy27 = modeCtx('hr-admin')
    expect(fy27.version?.fiscalYear).toBe('FY27')
    expect(requestsModel(fy27).cycle.cycle?.fiscalYear).toBe('FY28')
    const s = sampleOnce()
    const none = sampleCtx('hr-admin', { sample: { ...s, plan: { ...s.plan, cycles: [] } } })
    const m = requestsModel(none)
    expect(m.cycle.cycle).toBeNull()
    expect(m.cycle.asks.empty).toMatch(/has no planning cycle yet/)
  })

  it('gives Manager mode its own asks and dates only: no cut line, no band estimate, no Copy note', () => {
    const m = requestsModel(modeCtx('manager'))
    expect(m.cycle.cutShown).toBe(false)
    expect(m.cycle.units).toEqual([])
    expect(m.cycle.copyNote).toBeNull()
    expect(m.cycle.notSubmitted.rows).toEqual([])
    expect(m.cycle.mineSent).toBe(false)
    const me = modeCtx('manager').access.actingAs?.personId
    const mine = new Set(
      requestsOf(modeCtx('manager'))
        .filter((r) => r.requesterId === me)
        .map((r) => r.requestId),
    )
    for (const r of m.cycle.asks.rows) {
      expect(mine.has(r.requestId), r.requestId).toBe(true)
      expect(r.aboveCut).toBe(false)
      expect(r.cut).toBeNull()
      expect(r.bandEstimateUsd).toBeNull()
    }
    expect(m.cycle.asks.columns.map((c) => c.key)).not.toContain('cut')
  })
})

describe('8.4 on every list, in every mode', () => {
  it('lists only the viewer’s records: none is never a row, limited rows carry no person, reason, date or amount', () => {
    for (const mode of MODES) {
      const ctx = modeCtx(mode)
      const viewer = viewerOf(ctx)
      const byId = new Map(requestsOf(ctx).map((r) => [r.requestId, r]))
      const m = requestsModel(ctx)
      for (const r of [...m.queue.rows.rows, ...m.mine.rows.rows, ...m.approvals.rows.rows]) {
        const req = byId.get(r.requestId)
        expect(req, `${mode} ${r.requestId}`).toBeDefined()
        expect(r.view, `${mode} ${r.requestId}`).toBe(requestView(req!, viewer))
        if (r.view === 'limited') {
          expect(r.requesterName, `${mode} ${r.requestId}`).toBeNull()
          expect(r.reasonCode, `${mode} ${r.requestId}`).toBeNull()
          expect(r.startDate, `${mode} ${r.requestId}`).toBeNull()
          expect(r.bandEstimateUsd, `${mode} ${r.requestId}`).toBeNull()
          expect((r as { chain?: unknown }).chain ?? null, `${mode} ${r.requestId}`).toBeNull()
        }
      }
    }
  })

  it('counts by state and step over the rows shown, and every KPI drills to exactly its rows', () => {
    for (const mode of MODES) {
      const m = requestsModel(modeCtx(mode))
      const states = m.queue.byState.rows
      expect(
        states.every((s) => s.waiting <= s.count),
        mode,
      ).toBe(true)
      const pending = states
        .filter((s) => ['Submitted', 'In review', 'Sent back'].includes(s.state))
        .reduce((n, s) => n + s.count, 0)
      expect(pending, mode).toBe(m.queue.rows.rows.length)
      for (const k of [...m.queue.kpis, ...m.mine.kpis, ...m.approvals.kpis, ...m.cycle.kpis]) {
        expect(k.metricId, `${mode} ${k.id}`).toBeTruthy()
        expect(k.uses?.length, `${mode} ${k.id}`).toBeGreaterThan(0)
        if (k.value == null) continue
        const spec = resolveDrill(k.drill)
        expect(spec?.rows.length, `${mode} ${k.id}`).toBe(k.value)
      }
      // The folder headline is the queue's waiting count.
      expect(requestsHeadline(modeCtx(mode)).value, mode).toBe(
        String(m.queue.kpis.find((k) => k.metricId === ID.queueWaiting)?.value),
      )
    }
  })

  it('shows band estimates outside Manager mode only, and the gap after approval in heads', () => {
    for (const mode of MODES) {
      const m = requestsModel(modeCtx(mode))
      const rows = [...m.queue.rows.rows, ...m.mine.rows.rows, ...m.approvals.rows.rows]
      if (mode === 'manager') {
        expect(
          rows.every((r) => r.bandEstimateUsd == null),
          mode,
        ).toBe(true)
        expect(m.approvals.rows.columns.map((c) => c.key)).not.toContain('gapAfterHeads')
      } else if (mode !== 'hr-admin') {
        expect(
          rows.some((r) => r.bandEstimateUsd != null),
          mode,
        ).toBe(true)
      }
      for (const c of [...m.queue.rows.columns, ...m.mine.rows.columns, ...m.approvals.rows.columns]) {
        expect(c.pay, `${mode} ${c.key}`).toBeFalsy()
        expect(c.cost, `${mode} ${c.key}`).toBeFalsy()
        if (c.key === 'bandEstimateUsd') expect(c.band, mode).toBe(true)
      }
    }
    // The SE leader decides two asks at the manager step; SE's gap after approval is the gap, −18.
    const leader = requestsModel(modeCtx('leader')).approvals.rows.rows as readonly {
      gapAfterHeads?: number | null
    }[]
    expect(leader.length).toBeGreaterThan(0)
    for (const r of leader) expect(r.gapAfterHeads).toBe(-18)
  })

  it('lists in Mine only the Acting as person’s requests, and in Approvals only the steps waiting on them', () => {
    for (const mode of MODES) {
      const ctx = modeCtx(mode)
      const me = ctx.access.actingAs?.personId
      const m = requestsModel(ctx)
      for (const r of m.mine.rows.rows) expect(r.requesterId, `${mode} ${r.requestId}`).toBe(me)
      for (const r of m.approvals.rows.rows) expect(r.approverId, `${mode} ${r.requestId}`).toBe(me)
    }
  })

  it('says who each step is with: the approver while pending, then the req’s recruiter until Started', () => {
    const recruiter = new Map(sampleOnce().datasets.reqs.map((q) => [q.reqId, q.recruiter ?? null]))
    for (const mode of MODES) {
      const m = requestsModel(modeCtx(mode))
      for (const r of [...m.queue.rows.rows, ...m.mine.rows.rows, ...m.approvals.rows.rows]) {
        const row = r as typeof r & { owner: string | null; stage: string | null }
        if (r.view === 'limited') expect(row.owner, `${mode} ${r.requestId}`).toBeNull()
        else if (r.approverName) expect(row.owner, `${mode} ${r.requestId}`).toBe(r.approverName)
        else if (row.stage === 'Started' || !row.stage) expect(row.owner, `${mode} ${r.requestId}`).toBeNull()
        else {
          expect([...recruiter.values()], `${mode} ${r.requestId}`).toContain(row.owner)
        }
      }
    }
    // An approved request still recruiting, seen by its requester: Mine names the req's recruiter.
    const s = sampleOnce()
    const recruiting = new Map(
      s.datasets.reqs
        .filter((q) => q.positionId && q.status !== 'Cancelled' && q.status !== 'Filled' && q.recruiter)
        .map((q) => [q.positionId as string, q]),
    )
    const approved = requestsOf(modeCtx('hr-admin')).find(
      (r) => r.state === 'Approved' && !!r.positionId && recruiting.has(r.positionId),
    )
    expect(approved).toBeDefined()
    const who = s.datasets.workers.find((w) => w.employeeId === approved?.requesterId)
    const picks = {
      ...picksOf(),
      manager: { personId: approved?.requesterId as string, name: who?.name ?? '' },
    }
    const mine = requestsModel(sampleCtx('manager', { picks })).mine.rows.rows.find(
      (r) => r.requestId === approved?.requestId,
    ) as (RequestRecord & { owner: string | null; stage: string | null }) | undefined
    expect(mine?.stage).toBeTruthy()
    expect(mine?.stage).not.toBe('Started')
    expect(mine?.owner).toBe(recruiting.get(approved?.positionId as string)?.recruiter)
    const all = requestsModel(modeCtx('hr-admin'))
    expect(all.mine.rows.columns.map((c) => c.key)).toEqual(
      expect.arrayContaining([
        'stepLabel',
        'stage',
        'owner',
        'daysShown',
        'reqOpened',
        'offerAccepted',
        'started',
      ]),
    )
  })

  it('is cached per context', () => {
    const ctx = modeCtx('hrbp')
    expect(requestsModel(ctx)).toBe(requestsModel(ctx))
  })
})

describe('settings', () => {
  it('reads the waiting days, idle days and backfill window through the dictionary', () => {
    const rec = recordParamReads(defaultMetrics())
    const ctx = sampleCtx('hr-admin', { metrics: rec.metrics })
    requestsModel(ctx)
    requestsHeadline(ctx)
    requestsActions(ctx)
    const reads = [...rec.reads].filter((r) => r.startsWith('requests.'))
    for (const p of [PARAM.waitingDays, PARAM.idleDays, PARAM.backfillWindowDays])
      expect(reads, p.key).toContain(paramRef(p.metricId, p.key))
  })

  it('moves the waiting count with the waiting days', () => {
    const at5 =
      requestsModel(modeCtx('hr-admin')).queue.kpis.find((k) => k.metricId === ID.queueWaiting)?.value ?? 0
    const ctx = sampleCtx('hr-admin', { metrics: metricsWith({ [ID.queueWaiting]: { days: 10 } }) })
    const m = requestsModel(ctx)
    const at10 = m.queue.kpis.find((k) => k.metricId === ID.queueWaiting)
    expect(at10?.label).toBe('Waiting 10 or more days')
    expect(at10?.value ?? 0).toBeLessThan(at5)
    expect(requestsHeadline(ctx).label).toBe('waiting 10+ days')
  })
})
