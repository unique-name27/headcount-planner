/**
 * The states the write path makes, crawled (docs/PLAN.md 7.3 observations "every state reachable by
 * submitting and withdrawing requests", 8.4 rules 3, 5 and 7, 16.1; M3 privacy re-crawl). A New role
 * walks the write path as the app runs it (src/app/write/scenario.testkit.ts over a MemoryStore, each
 * step acted by its own person): drafted and submitted by Manager A, an HRBP comment with an amount
 * (forced to Approvers only) and a plain one, approved with changes by the HRBP, sent back by the
 * leader and submitted again; a second draft submitted and withdrawn. After every step:
 *
 *  - Manager A's whole crawl (every view, the write path's own models, the comments and audit rows,
 *    the Shareable and Requests files the app writes) holds no amount, no amount-like key and not the
 *    comment with the amount, while it reads the plain comment and the change reason;
 *  - Export for a manager, written from the HRBP's context for Manager A, is byte-equal to the
 *    Shareable Manager A writes and passes the same scan;
 *  - the HRBP's Shareable opened in Manager mode as Manager A shows nothing of the comment with the
 *    amount and no amount;
 *  - another manager's crawl holds nothing of the request.
 *
 * HR admin is the control: it reads the comment with the amount. The audit chain verifies throughout.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { chainOk, deciderOf, type Scenario, scenario, type Who } from '@/app/write/scenario.testkit'
import type { AnalyticsContext } from '@/data/context'
import { requestIdInText } from '@/plan/actions/requestIds'
import type { HcRequest } from '@/plan/types'
import { type Crawl, crawl, fileCrawl, forManagerText, openShared, workspaceText } from '@/testkit/crawl'
import { amountHits, holding } from '@/testkit/leaks'
import { MemoryStorage } from '@/testkit/memoryStorage'
import { defaultPicks, personaOf, pinClock, unpinClock } from '@/testkit/sample'
import { forManagerFile } from '@/views/data/engine/workspace'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
vi.stubGlobal('localStorage', new MemoryStorage())

beforeAll(() => pinClock())
afterAll(() => unpinClock())

const AMOUNT_COMMENT = 'Offer would land near $152,000 a year'
const PLAIN_TEXT = 'Interview loop is set for next week'
const CHANGE_REASON = 'Start after the Q4 hiring plan'
const SEND_BACK = 'Add the business case for the second half'

const idOf = (text: string): string => requestIdInText(text) ?? ''

const hitsOf = (c: Crawl): string[] =>
  amountHits(c.seen)
    .slice(0, 8)
    .map((h) => `${h.what} at ${h.where.slice(0, 160)}: ${h.text.slice(0, 80)}`)

describe('the write path’s states, crawled (M3 privacy re-crawl)', () => {
  let sc: Scenario
  let mgr: Who
  let other: Who
  beforeAll(() => {
    sc = scenario()
    const a = personaOf(sc.sample, 'manager-a')
    const b = personaOf(sc.sample, 'manager-b')
    mgr = { mode: 'manager', personId: a.employeeId }
    other = { mode: 'manager', personId: b.employeeId }
  }, 120_000)

  /** Every check of one state (see the module comment); the step's name in each message. */
  async function checkState(step: string, id: string, hrbp: Who | null) {
    const asA = await sc.ctx(mgr)
    const c = crawl(asA, { recordExports: 'text' })
    expect(c.errors, step).toEqual([])
    expect(hitsOf(c), step).toEqual([])
    expect(
      holding(c.seen, '152,000').map((x) => x.where),
      step,
    ).toEqual([])
    // Non-vacuity: the request, its files and the write path's own models were read.
    expect(holding(c.seen, id).length, step).toBeGreaterThan(0)
    expect(
      c.seen.some((x) => x.where.startsWith('file requests')),
      step,
    ).toBe(true)
    expect(
      c.seen.some((x) => x.where.includes('/preview ')),
      step,
    ).toBe(true)

    if (hrbp) {
      const asHrbp: AnalyticsContext = await sc.ctx(hrbp)
      // Export for a manager, written from the HRBP's context, is Manager A's own Shareable.
      const exported = forManagerText(asHrbp, mgr.personId)
      expect(exported, step).toBe(workspaceText({ ctx: asA }, 'shareable'))
      const fc = fileCrawl(asHrbp, 'file for-manager', forManagerFile(asHrbp, mgr.personId, sc.now()))
      expect(hitsOf(fc), step).toEqual([])
      expect(exported.includes('152,000'), step).toBe(false)
      // The HRBP's own Shareable carries the comment; opened as Manager A it shows none of it.
      const theirs = workspaceText({ ctx: asHrbp }, 'shareable')
      const opened = openShared(theirs, asA)
      expect(hitsOf(opened), step).toEqual([])
      expect(
        holding(opened.seen, '152,000').map((x) => x.where),
        step,
      ).toEqual([])
    }

    // Another manager's crawl holds nothing of the request.
    const b = crawl(await sc.ctx(other), { recordExports: 'digest' })
    expect(hitsOf(b), step).toEqual([])
    expect(
      holding(b.seen, id).map((x) => x.where),
      step,
    ).toEqual([])
    expect(chainOk(await sc.log()), step).toBe(true)
    return c
  }

  it('a New role from draft to sent back and submitted again, and a draft withdrawn', async () => {
    const a = personaOf(sc.sample, 'manager-a')
    const d = await sc.run(mgr, 'createRequest', {
      type: 'New role',
      managerPositionId: a.positionId,
      level: 'P4',
      location: 'San Jose',
      fte: 1,
      startDate: '2027-01-04',
      reasonCode: 'Growth',
      jobTitle: 'Account Executive',
    })
    expect(d.outcome.ok).toBe(true)
    const id = idOf(d.outcome.ok ? d.outcome.notice : '')
    await checkState('draft', id, null)

    expect((await sc.run(mgr, 'submitRequest', { requestId: id })).outcome.ok).toBe(true)
    const hrbp = deciderOf(sc.sample, (await sc.request(id)) as HcRequest)
    expect(hrbp.mode).toBe('hrbp')
    await checkState('submitted', id, hrbp)

    // The HRBP's comment with an amount goes to Approvers only; the plain one to everyone.
    const said = await sc.run(hrbp, 'commentOnRequest', {
      requestId: id,
      text: AMOUNT_COMMENT,
      audience: 'everyone',
    })
    expect(said.outcome.ok).toBe(true)
    expect((await sc.request(id))?.comments.at(-1)?.audience).toBe('approvers')
    await sc.run(hrbp, 'commentOnRequest', { requestId: id, text: PLAIN_TEXT, audience: 'everyone' })
    let c = await checkState('commented', id, hrbp)
    expect(holding(c.seen, PLAIN_TEXT).length).toBeGreaterThan(0)

    // Approved with changes: Manager A reads each change with its reason.
    const changed = await sc.run(hrbp, 'approveWithChanges', {
      requestId: id,
      changes: [
        { field: 'level', old: null, new: 'P3' },
        { field: 'startDate', old: null, new: '2027-03-01' },
      ],
      reason: CHANGE_REASON,
    })
    expect(changed.outcome.ok).toBe(true)
    c = await checkState('approved with changes', id, hrbp)
    expect(holding(c.seen, CHANGE_REASON).length).toBeGreaterThan(0)

    // The leader sends it back; Manager A submits it again.
    const leader = deciderOf(sc.sample, (await sc.request(id)) as HcRequest)
    expect(leader.mode).toBe('leader')
    expect((await sc.run(leader, 'sendBack', { requestId: id, reason: SEND_BACK })).outcome.ok).toBe(true)
    c = await checkState('sent back', id, hrbp)
    expect(holding(c.seen, SEND_BACK).length).toBeGreaterThan(0)
    expect((await sc.run(mgr, 'submitRequest', { requestId: id })).outcome.ok).toBe(true)
    await checkState('submitted again', id, hrbp)

    // A second draft, submitted and withdrawn.
    const d2 = await sc.run(mgr, 'createRequest', {
      type: 'New role',
      managerPositionId: a.positionId,
      level: 'P2',
      location: 'San Jose',
      fte: 1,
      startDate: '2027-02-01',
      reasonCode: 'Growth',
    })
    const id2 = idOf(d2.outcome.ok ? d2.outcome.notice : '')
    expect((await sc.run(mgr, 'submitRequest', { requestId: id2 })).outcome.ok).toBe(true)
    expect((await sc.run(mgr, 'withdrawRequest', { requestId: id2 })).outcome.ok).toBe(true)
    await checkState('withdrawn', id2, hrbp)

    // Control: HR admin reads the comment with the amount, in the request texts and its files.
    const adminId = defaultPicks(sc.sample)['hr-admin']?.personId ?? ''
    const admin = crawl(await sc.ctx({ mode: 'hr-admin', personId: adminId }), {
      views: ['requests'],
      cards: false,
    })
    expect(holding(admin.seen, AMOUNT_COMMENT).length).toBeGreaterThan(0)
    expect(amountHits(admin.seen).length).toBeGreaterThan(0)
  }, 900_000)
})
