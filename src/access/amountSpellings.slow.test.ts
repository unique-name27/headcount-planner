/**
 * Amounts in free text reach no Manager surface in any common spelling (docs/PLAN.md 7.6 and 8.4
 * rule 5; the M2 review's RM-1). A request of Manager A's, sent back by its HRBP, carries an Everyone
 * comment with a dot-grouped amount and one in lakh, a send-back note with the sign after the
 * number, a freeze-exception reason in Indian grouping, and an audit comment grouped by a space. The
 * Manager A crawl (views, cards, exports, the Shareable and Requests files, comments and audit rows)
 * holds none of the five texts and no part of their numbers; the HR admin control holds every one.
 * The clock is pinned.
 *
 * M3 recheck: ranges and amounts per period, through the write path. The HRBP's Everyone comments
 * "The agency range is 95-110k" and "Budget is 95000/yr for this seat" on Manager A's request are
 * forced to Approvers only, and a seat-edit reason "Later start saves 95000-110000" is refused at
 * entry; Manager A's crawl holds none of the three.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { said, scenario, type Who } from '@/app/write/scenario.testkit'
import { SAMPLE_AS_OF } from '@/data/sample'
import { AMOUNT_COMMENT_NOTE, REMOVE_AMOUNT_TEXT } from '@/plan/actions/copy'
import type { HcRequest } from '@/plan/types'
import { type Crawl, crawl, workspaceText } from '@/testkit/crawl'
import { holding } from '@/testkit/leaks'
import { MemoryStorage } from '@/testkit/memoryStorage'
import {
  auditDraft,
  auditLog,
  comment,
  leakSample,
  personaCtx,
  personaOf,
  pinClock,
  requestsOfPerson,
  unpinClock,
  withPlanRequests,
} from '@/testkit/sample'
import { AN_AMOUNT, hasAmount } from './visibility'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
vi.stubGlobal('localStorage', new MemoryStorage())

const T = {
  everyoneDot: 'Budget holds 140.000 for this role',
  everyoneLakh: 'Offer of 14 lakh agreed',
  sendBack: 'Send back: the offer would be 140.000 €',
  exception: 'Business need: offer 12,40,000 a year',
  audit: 'Approved after the 140 000 review',
}

/** Pieces of the numbers that must not survive a partial replacement. */
const FRAGMENTS = ['140.000', '14 lakh', '140 000', '12,40', '40,000', '€']

let manager: Crawl
let admin: Crawl

beforeAll(() => {
  pinClock()
  const s = leakSample()
  const a = personaOf(s, 'manager-a')
  const pending = requestsOfPerson(s, a.employeeId).find(
    (r) => r.state === 'Submitted' || r.state === 'In review',
  ) as HcRequest
  const hrbp = pending.steps.find((x) => x.role === 'hrbp')?.approverId ?? 'E00000'
  const at = `${SAMPLE_AS_OF}T09:30:00.000Z`
  const sent: HcRequest = {
    ...pending,
    state: 'Sent back',
    updatedAt: at,
    exception: { freezeId: s.datasets.freezes[0]?.freezeId ?? 'FRZ-001', reason: T.exception },
    steps: pending.steps.map((x, i) => (i === 0 ? { ...x, decision: 'Sent back', at, note: T.sendBack } : x)),
    comments: [
      comment({ id: 'rm1-a', by: hrbp, text: T.everyoneDot }),
      comment({ id: 'rm1-b', by: hrbp, text: T.everyoneLakh }),
    ],
  }
  const audit = auditLog([
    auditDraft({
      object: 'request',
      id: sent.requestId,
      field: 'state',
      old: pending.state,
      new: 'Sent back',
      by: hrbp,
      byName: 'The HRBP',
      mode: 'hrbp',
      comment: T.audit,
      commentAudience: 'everyone',
    }),
  ])
  const sample = withPlanRequests(s, [sent])
  manager = crawl(personaCtx('manager-a', { sample, audit }), { recordExports: 'text' })
  admin = crawl(personaCtx('hr-admin', { sample, audit }), { recordExports: 'text' })
}, 300_000)

afterAll(() => unpinClock())

describe('amounts in free text, in any spelling, never reach Manager mode (8.4 rule 5)', () => {
  it('reads every fixture text as holding an amount', () => {
    for (const t of Object.values(T)) expect(hasAmount(t), t).toBe(true)
  })

  it('shows none of the texts, and no piece of their numbers, to Manager A', () => {
    expect(manager.errors).toEqual([])
    for (const [k, t] of Object.entries(T))
      expect(
        holding(manager.seen, t)
          .slice(0, 4)
          .map((h) => h.where),
        k,
      ).toEqual([])
    const ours = manager.seen.filter((x) => typeof x.value === 'string' && x.value.includes(AN_AMOUNT))
    // Non-vacuity: the reasons and the audit comment reach the crawl, each amount replaced.
    expect(ours.length).toBeGreaterThan(0)
    for (const f of FRAGMENTS)
      expect(
        holding(manager.seen, f)
          .slice(0, 4)
          .map((h) => `${h.where}: ${String(h.value).slice(0, 120)}`),
        f,
      ).toEqual([])
    for (const kind of ['shareable', 'requests'] as const) {
      const file = workspaceText(manager, kind)
      for (const f of FRAGMENTS) expect(file.includes(f), `${kind} file: ${f}`).toBe(false)
    }
  })

  it('shows every text to HR admin (control)', () => {
    expect(admin.errors).toEqual([])
    for (const [k, t] of Object.entries(T)) expect(holding(admin.seen, t).length, k).toBeGreaterThan(0)
  })
})

describe('ranges and amounts per period through the write path (M3 recheck)', () => {
  it('forces the comments to Approvers only, refuses the reason, and Manager A reads none of them', async () => {
    const sc = scenario()
    const s = sc.sample
    const a = personaOf(s, 'manager-a')
    const pending = requestsOfPerson(s, a.employeeId).find(
      (r) => r.state === 'Submitted' || r.state === 'In review',
    ) as HcRequest
    const hrbp: Who = {
      mode: 'hrbp',
      personId: pending.steps.find((x) => x.role === 'hrbp')?.approverId as string,
      unit: pending.businessUnit,
    }
    for (const text of ['The agency range is 95-110k', 'Budget is 95000/yr for this seat']) {
      const out = await sc.run(hrbp, 'commentOnRequest', {
        requestId: pending.requestId,
        text,
        audience: 'everyone',
      })
      expect(said(out.outcome), text).toContain(AMOUNT_COMMENT_NOTE)
    }
    const seat = s.datasets.positions.find(
      (p) => p.managerPositionId === a.positionId && p.status === 'Planned',
    )?.positionId as string
    const edit = await sc.run(hrbp, 'editSeat', {
      positionId: seat,
      changes: { startDate: '2027-03-01' },
      reason: 'Later start saves 95000-110000',
    })
    expect(edit.outcome).toEqual({ ok: false, refused: REMOVE_AMOUNT_TEXT })
    const seen = crawl(await sc.ctx({ mode: 'manager', personId: a.employeeId }), { recordExports: 'text' })
    expect(seen.errors).toEqual([])
    for (const needle of ['95-110k', '95000/yr', '95000-110000', '110k'])
      expect(
        holding(seen.seen, needle)
          .slice(0, 4)
          .map((h) => h.where),
        needle,
      ).toEqual([])
  }, 600_000)
})
