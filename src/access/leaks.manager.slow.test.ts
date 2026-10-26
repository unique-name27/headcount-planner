/**
 * Manager mode shows no amount and nothing of the confidential Elimination (docs/PLAN.md 7.6, 8.4
 * rules 3, 5 and 8, 13.3 and 16.1). Every Manager crawl (the testkit's crawl: views, tiles, findings,
 * drill tables, position and calculation cards, the Action center, help, the glossary, Settings >
 * Formulas, every export as written bytes (figure CSVs, clipboard texts, each tab's workbook, each
 * view's whole-view workbook and deck, the long CSV and its control totals: M4), the Shareable and
 * Requests files, comments and audit rows)
 * holds no currency sign, ISO code, grouped number or amount-like key; the fixture's texts with an
 * amount (a position title and job family from the positions dataset among them, review EX-3) never
 * reach it or an Export for a manager file while the HR admin control holds them all; Manager B's
 * surfaces are byte-identical after a salary, an offer and a leave flag change; Manager C's, and the manager's
 * below them, are identical with and without the Elimination of C's seat (removed from plan state
 * after generation, never regenerated), and so are their routing, an HRBP Shareable opened as C and
 * Export for a manager (the app's own writer, from the HRBP's and HR admin's contexts). The files are
 * the ones the app writes (src/views/data/engine/workspace.ts) and a file is opened through the app's
 * own opener (`openSharedFile`). Every part has a non-vacuity count and an HR admin control that must
 * differ. The clock is pinned.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { AnalyticsContext } from '@/data/context'
import type { Sample } from '@/data/sample'
import { fromRow } from '@/plan/engine/requests'
import { MemoryStore } from '@/plan/store/memoryStore'
import type { AuditEntry, HcRequest } from '@/plan/types'
import {
  type Crawl,
  crawl,
  crawlAll,
  fileCrawl,
  forManagerText,
  openShared,
  workspaceText,
} from '@/testkit/crawl'
import { amountHits, chainHits, holding, payHits, secretsOf } from '@/testkit/leaks'
import { MemoryStorage } from '@/testkit/memoryStorage'
import { drafts, routingCase, submitSteps } from '@/testkit/routing'
import {
  auditDraft,
  auditLog,
  BAND_EDIT,
  ctxAs,
  leakSample,
  MANAGER_POSITION_TEXTS,
  MANAGER_REQ_TEXTS,
  MANAGER_TEXTS,
  type ManagerTextFixture,
  managerTextFixture,
  PINNED_AT,
  PLAIN_COMMENT,
  personaCtx,
  personaOf,
  pinClock,
  requestsOfPerson,
  sampleCtx,
  sampleSources,
  seatViewers,
  unpinClock,
  withoutRequest,
  withPlanRequests,
  withReq,
  withSalaryDelta,
  withWorker,
} from '@/testkit/sample'
import { forManagerFile } from '@/views/data/engine/workspace'
import { listsInForce } from './lists'
import { actingAsOptions } from './scopes'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
vi.stubGlobal('localStorage', new MemoryStorage())

let s: Sample
let fx: ManagerTextFixture

beforeAll(() => {
  pinClock()
  s = leakSample()
  fx = managerTextFixture(s)
}, 120_000)

afterAll(() => unpinClock())

const hitsText = (c: Crawl, n = 8): string =>
  amountHits(c.seen)
    .slice(0, n)
    .map((h) => `${h.what} at ${h.where.slice(0, 160)}: ${h.text.slice(0, 100)}`)
    .join('\n')

const json = (c: Crawl): string => JSON.stringify(c.snapshot())

/** The first value where two crawls part, for a failure message. */
function firstDifference(a: Crawl, b: Crawl): string {
  const x = a.snapshot()
  const y = b.snapshot()
  for (let i = 0; i < Math.max(x.length, y.length); i++)
    if (JSON.stringify(x[i]) !== JSON.stringify(y[i]))
      return `#${i}: ${JSON.stringify(x[i])?.slice(0, 200)} | ${JSON.stringify(y[i])?.slice(0, 200)}`
  return 'none'
}

/* ───────────── no amount anywhere ───────────── */

describe('no amount in any Manager crawl (7.6)', () => {
  it('holds none for the three Manager personas, exports, workbooks and files included', async () => {
    for (const key of ['manager-a', 'manager-b', 'manager-c'] as const) {
      const c = await crawlAll(personaCtx(key, { sample: fx.sample, audit: fx.audit }))
      expect(c.errors, key).toEqual([])
      expect(hitsText(c), key).toBe('')
      // Non-vacuity: the crawl read the team's figures, its position cards, its files and help.
      expect(c.seen.length, key).toBeGreaterThan(1500)
      expect(c.figures.size, key).toBeGreaterThan(5)
      expect(c.positions.size, key).toBeGreaterThan(3)
      expect(
        c.seen.some((x) => x.where.startsWith('workbook ')),
        key,
      ).toBe(true)
      expect(
        c.seen.some((x) => x.where.startsWith('glossary ')),
        key,
      ).toBe(true)
      expect(
        c.seen.some((x) => x.where.startsWith('file requests')),
        key,
      ).toBe(true)
      // M4: the long CSV row by row and as written, its control totals, each view's whole-view
      // workbook and deck as written bytes, and help as the mode shows it; no load file.
      for (const part of [
        'export long-csv version/r ',
        'export long-csv version/totals ',
        'export long-csv version.csv',
        'workbook view ',
        'deck ',
        'help/article ',
        'help/tour ',
        'help/glossary ',
      ])
        expect(
          c.seen.some((x) => x.where.startsWith(part)),
          `${key} ${part}`,
        ).toBe(true)
      expect(
        c.seen.some((x) => x.where.startsWith('file load-file')),
        key,
      ).toBe(false)
    }
  }, 300_000)

  it('control: HR admin’s long CSV, load file, whole-view workbooks and decks hold amounts the same scan finds', async () => {
    const c = await crawlAll(sampleCtx('hr-admin', { sample: fx.sample, audit: fx.audit }), { cards: false })
    expect(c.errors).toEqual([])
    const hits = amountHits(c.seen)
    for (const part of ['export long-csv version', 'file load-file', 'workbook view ', 'deck '])
      expect(
        hits.some((h) => h.where.startsWith(part)),
        part,
      ).toBe(true)
  }, 300_000)

  it('holds none for every manager a Manager pick can name', () => {
    const ctx = sampleCtx('manager', { sample: fx.sample })
    const options = actingAsOptions('manager', {
      positionIndex: ctx.positionIndex,
      asOf: ctx.asOf,
      all: ctx.all,
      lists: listsInForce(null, ctx.all, sampleSources(ctx.all)),
      personas: s.personas,
    })
    expect(options.length).toBeGreaterThan(100)
    const secrets = secretsOf(fx.sample.datasets)
    let read = 0
    let large = 0
    for (const o of options) {
      const mctx = ctxAs('manager', o.pick.personId, { sample: fx.sample, audit: fx.audit })
      const c = crawl(mctx, { recordExports: 'text' })
      expect(c.errors, o.pick.personId).toEqual([])
      // A tree of 1,000 or more people (the CEO picked as a manager) counts heads past 1,000: there
      // the count-sized rules give way to the pay-value scan, which every pick also passes.
      const countsPast1000 = (mctx.access.scope?.size ?? 0) >= 1000
      if (countsPast1000) large++
      const hits = amountHits(c.seen).filter(
        (h) => !countsPast1000 || !/^(grouped number|number of 1,000 or more)/.test(h.what),
      )
      expect(
        hits.slice(0, 8).map((h) => `${h.what} at ${h.where.slice(0, 160)}: ${h.text.slice(0, 100)}`),
        o.pick.personId,
      ).toEqual([])
      expect(
        payHits(c.seen, secrets)
          .slice(0, 5)
          .map((h) => `${h.what} at ${h.where}`),
        o.pick.personId,
      ).toEqual([])
      read += c.seen.length
    }
    expect(read).toBeGreaterThan(options.length * 500)
    expect(large).toBeLessThan(3)
  }, 600_000)

  it('control: the pay-value scan finds pay in HR admin with pay amounts shown', () => {
    const c = crawl(sampleCtx('hr-admin', { sample: fx.sample, showPay: true }), {
      views: ['plan'],
      pages: false,
      help: false,
      cards: false,
      recordExports: 'text',
    })
    expect(payHits(c.seen, secretsOf(fx.sample.datasets)).length).toBeGreaterThan(0)
  }, 300_000)

  it('control: HR admin with pay amounts shown reads amounts the scan finds', () => {
    const c = crawl(sampleCtx('hr-admin', { sample: fx.sample, audit: fx.audit, showPay: true }), {
      views: ['plan'],
      cards: 20,
    })
    expect(amountHits(c.seen).length).toBeGreaterThan(100)
  }, 300_000)
})

describe('the fixture texts with an amount (8.4 rule 5, 14.1 item 8)', () => {
  it('never reach Manager mode, while the reasons arrive with "an amount"', () => {
    const c = crawl(personaCtx('manager-a', { sample: fx.sample, audit: fx.audit }), {
      recordExports: 'text',
    })
    for (const t of Object.values(MANAGER_TEXTS))
      expect(
        holding(c.seen, t).map((x) => x.where),
        t,
      ).toEqual([])
    for (const needle of ['140,000', '140000', '95k', '€', '$'])
      expect(
        holding(c.seen, needle).map((x) => x.where),
        needle,
      ).toEqual([])
    // Non-vacuity: the request, its plain comment, its reasons and the seat-edit audit row were read.
    expect(holding(c.seen, PLAIN_COMMENT).length).toBeGreaterThan(0)
    expect(holding(c.seen, 'Send back: the offer would be an amount').length).toBeGreaterThan(0)
    expect(holding(c.seen, 'Business need above an amount a year').length).toBeGreaterThan(0)
    expect(holding(c.seen, 'Start moved to save an amount').length).toBeGreaterThan(0)
    expect(holding(c.seen, fx.sentBack).length).toBeGreaterThan(0)
    expect(holding(c.seen, fx.imported).length).toBeGreaterThan(0)
    // Review EX-3: the planted position title reads "an amount" on the grids, the records lists, the
    // position card and the Shareable file, and so does every position row the context holds.
    const title = holding(c.seen, MANAGER_POSITION_TEXTS.positionTitle).map((x) => x.where)
    expect(title.length).toBeGreaterThan(10)
    for (const part of ['view plan/', 'view requests/', 'view team/', `card ${fx.titled}`, 'file shareable'])
      expect(
        title.some((w) => w.startsWith(part)),
        part,
      ).toBe(true)
    const rows = c.ctx.all.positions.filter((p) => p.positionId === fx.titled)
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows) {
      expect(r.title).toBe(MANAGER_POSITION_TEXTS.positionTitle)
      expect(r.jobFamily).toBe(MANAGER_POSITION_TEXTS.jobFamily)
    }
    // M4 recheck EX-3-a: a req's recruiter reads "an amount" in the context, so on the position
    // card's Reqs list, its records file and its copied text.
    const reqs = c.ctx.all.reqs.filter((r) => fx.recruited.includes(r.reqId))
    expect(reqs.length).toBe(fx.recruited.length)
    for (const r of reqs) expect(r.recruiter).toBe(MANAGER_REQ_TEXTS.recruiter)
    const recruiter = holding(c.seen, MANAGER_REQ_TEXTS.recruiter).map((x) => x.where)
    expect(recruiter.some((w) => w.includes('/records reqs.csv'))).toBe(true)
    expect(recruiter.some((w) => w.includes('/records reqs.tsv'))).toBe(true)
  }, 120_000)

  it('never reach an Export for a manager file, from HR admin or the HRBP (review EX-3)', () => {
    const a = personaOf(s, 'manager-a')
    // The seat's unit and that unit's HRBP (the Units list), who may write an Export for Manager A.
    const { unit, hrbp } = seatViewers(fx.sample, fx.titled)
    for (const [mode, ctx] of [
      ['hr-admin', sampleCtx('hr-admin', { sample: fx.sample, audit: fx.audit })],
      ['hrbp', ctxAs('hrbp', hrbp, { sample: fx.sample, audit: fx.audit, unit })],
    ] as const) {
      const text = forManagerText(ctx, a.employeeId)
      expect(text, mode).toContain(MANAGER_POSITION_TEXTS.positionTitle)
      for (const t of Object.values(MANAGER_TEXTS)) expect(text.includes(t), `${mode}: ${t}`).toBe(false)
      for (const needle of ['140,000', '140000', '95k', '€'])
        expect(text.includes(needle), `${mode}: ${needle}`).toBe(false)
      const read = fileCrawl(ctx, 'file for-manager', forManagerFile(ctx, a.employeeId, PINNED_AT))
      expect(read.seen.length, mode).toBeGreaterThan(100)
      expect(
        amountHits(read.seen).map((h) => `${h.what} ${h.where}`),
        mode,
      ).toEqual([])
    }
  }, 300_000)

  it('control: HR admin reads every one of them', () => {
    const ctx = sampleCtx('hr-admin', { sample: fx.sample, audit: fx.audit })
    const c = crawl(ctx, {
      views: ['requests'],
      cards: false,
      recordExports: 'text',
    })
    // No surface lists a position's job family, and the requests view lists no req, so the control
    // reads those where the context holds them.
    const { jobFamily, recruiter, ...shown } = MANAGER_TEXTS
    for (const t of Object.values(shown)) expect(holding(c.seen, t).length, t).toBeGreaterThan(0)
    const rows = ctx.all.positions.filter((p) => p.positionId === fx.titled)
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows) {
      expect(r.title).toBe(MANAGER_TEXTS.positionTitle)
      expect(r.jobFamily).toBe(jobFamily)
    }
    const reqs = ctx.all.reqs.filter((r) => fx.recruited.includes(r.reqId))
    expect(reqs.length).toBe(fx.recruited.length)
    for (const r of reqs) expect(r.recruiter).toBe(recruiter)
  }, 300_000)
})

describe('company audit entries never reach Manager mode (8.4 rule 7, review RM-2)', () => {
  const bandValue = (x: Crawl) =>
    x.seen.filter(
      (v) =>
        v.value === BAND_EDIT.old ||
        v.value === BAND_EDIT.new ||
        (typeof v.value === 'string' && /9[58][,.\s]?000/.test(v.value)),
    )

  it('holds no band edit and no cut line in any Manager crawl or file', () => {
    for (const key of ['manager-a', 'manager-b', 'manager-c'] as const) {
      const c = crawl(personaCtx(key, { sample: fx.sample, audit: fx.audit }), { recordExports: 'text' })
      expect(
        holding(c.seen, fx.bandEntry).map((x) => x.where),
        key,
      ).toEqual([])
      expect(
        holding(c.seen, fx.cutField).map((x) => x.where),
        key,
      ).toEqual([])
      expect(
        bandValue(c).map((x) => x.where),
        key,
      ).toEqual([])
      for (const kind of ['shareable', 'requests'] as const) {
        const file = workspaceText(c, kind)
        expect(file.includes(fx.bandEntry), `${key} ${kind}`).toBe(false)
        expect(file.includes(fx.cutField), `${key} ${kind}`).toBe(false)
      }
    }
  }, 300_000)

  it('control: HR admin reads both entries', () => {
    const c = crawl(sampleCtx('hr-admin', { sample: fx.sample, audit: fx.audit }), {
      views: ['requests'],
      cards: false,
    })
    expect(fx.cutField).toMatch(/^cutLine /)
    expect(holding(c.seen, fx.bandEntry).length).toBeGreaterThan(0)
    expect(holding(c.seen, fx.cutField).length).toBeGreaterThan(0)
    expect(bandValue(c).length).toBeGreaterThan(0)
  }, 300_000)
})

describe('a namesake manager opens another team’s Shareable file (review RM-3)', () => {
  it('shows none of its figures, seats or requests, though the two teams share one label', () => {
    const a = personaOf(s, 'manager-a')
    const b = personaOf(s, 'manager-b')
    const name = s.datasets.workers.find((w) => w.employeeId === a.employeeId)?.name as string
    const twin = withWorker(s, b.employeeId, { name })
    const asA = ctxAs('manager', a.employeeId, { sample: twin })
    const asB = ctxAs('manager', b.employeeId, { sample: twin })
    // The namesake: one display name for two scopes.
    expect(asB.scopeLabel).toBe(asA.scopeLabel)
    const fileA = workspaceText(crawl(asA, { cards: false, recordExports: 'digest' }), 'shareable')
    const onlyA = [...(asA.access.scope?.positionIds ?? [])].filter(
      (id) => !asB.access.scope?.positionIds.has(id),
    )
    const requestsOfA = requestsOfPerson(twin, a.employeeId).map((r) => r.requestId)
    expect(onlyA.length).toBeGreaterThan(0)
    expect(requestsOfA.length).toBeGreaterThan(0)
    const opened = openShared(fileA, asB)
    expect(opened.seen.filter((x) => x.where.startsWith('opened/models')).map((x) => x.where)).toEqual([])
    for (const id of [...onlyA, ...requestsOfA])
      expect(
        holding(opened.seen, id).map((x) => x.where),
        id,
      ).toEqual([])
    // Control: the manager the file was made for reads its figures and seats.
    const own = openShared(fileA, asA)
    expect(own.seen.some((x) => x.where.startsWith('opened/models'))).toBe(true)
    expect(onlyA.some((id) => holding(own.seen, id).length > 0)).toBe(true)
  }, 300_000)
})

/* ───────────── the audit chain ───────────── */

describe('no seq, prevHash or hash outside HR admin (8.4 rule 7)', () => {
  it('reads no chain field, entry hash or chain status in any mode but HR admin', () => {
    let rows = 0
    for (const key of ['manager-a', 'hrbp-se', 'leader-svp-se', 'leader-cfo', 'finance-fpa'] as const) {
      const ctx = personaCtx(key, { sample: fx.sample, audit: fx.audit })
      const c = crawl(ctx, { views: ['requests', 'team'], recordExports: 'text' })
      const hits = chainHits(c.seen, fx.audit)
      expect(
        hits.slice(0, 5).map((h) => `${h.what} ${h.where}`),
        key,
      ).toEqual([])
      rows += holding(c.seen, MANAGER_TEXTS.seatEdit).length + holding(c.seen, 'save an amount').length
    }
    // Non-vacuity: the audit rows were read (the seat edit reaches Manager A's card and the company's Audit page).
    expect(rows).toBeGreaterThan(1)
  }, 300_000)

  it('control: HR admin reads the chain status', () => {
    const c = crawl(sampleCtx('hr-admin', { sample: fx.sample, audit: fx.audit }), {
      views: [],
      cards: false,
    })
    expect(chainHits(c.seen, fx.audit).length).toBeGreaterThan(0)
  }, 120_000)
})

/* ───────────── Manager B: one person's pay, offer and leave ───────────── */

describe('Manager B: one salary, offer or leave change leaves every surface byte-identical', () => {
  /** Manager B's team: 3 Filled seats and 2 Open seats, one of them with an accepted offer. */
  function team() {
    const b = personaOf(s, 'manager-b')
    const seats = s.datasets.positions.filter((p) => p.managerPositionId === b.positionId)
    const holders = s.datasets.workers.filter(
      (w) =>
        w.workerType === 'Employee' &&
        seats.some((p) => p.positionId === w.positionId) &&
        (w.assignmentStart || w.hireDate) <= s.asOf &&
        !w.assignmentEnd &&
        !w.terminationDate,
    )
    const offer = s.datasets.reqs.find(
      (r) => r.stage === 'Offer accepted' && seats.some((p) => p.positionId === r.positionId),
    )
    return { b, seats, holders, offer }
  }

  it('is the planted team of 3 Filled and 2 Open seats, one with an accepted offer, one person on paid leave', () => {
    const { seats, holders, offer } = team()
    const ids = [...new Set(seats.map((p) => p.positionId))]
    expect(ids.length).toBe(5)
    expect(holders.length).toBe(3)
    expect(offer?.offerBase).toBeGreaterThan(0)
    expect(holders.some((w) => w.onLeave === true && w.leavePaid !== false)).toBe(true)
  })

  it('crawls equal before and after, while HR admin with pay amounts shown sees each change', async () => {
    const { b, holders, offer } = team()
    const ctxB = (x: Sample) => personaCtx('manager-b', { sample: x })
    const base = await crawlAll(ctxB(s))
    expect(base.errors).toEqual([])
    expect(base.seen.length).toBeGreaterThan(1500)
    const onLeave = holders.find((w) => w.onLeave === true) as (typeof holders)[number]
    const changed: [string, Sample][] = [
      ['baseSalary', withSalaryDelta(s, holders.find((w) => w !== onLeave)?.employeeId as string, 7_500)],
      ['offerBase', withReq(s, offer?.reqId as string, { offerBase: (offer?.offerBase ?? 0) + 7_500 })],
      ['leavePaid', withWorker(s, onLeave.employeeId, { leavePaid: false })],
    ]
    const admin = (x: Sample) =>
      crawl(sampleCtx('hr-admin', { sample: x, showPay: true, filters: { leaderId: b.positionId } }), {
        views: ['plan'],
        pages: false,
        help: false,
        files: false,
        cards: false,
        text: false,
      })
    const adminBase = admin(s)
    for (const [what, x] of changed) {
      const after = await crawlAll(ctxB(x))
      expect(json(after), `${what}: ${firstDifference(base, after)}`).toBe(json(base))
      expect(json(admin(x)), `${what}: the HR admin control`).not.toBe(json(adminBase))
    }
  }, 600_000)
})

/* ───────────── Manager C: the confidential Elimination of their seat ───────────── */

describe('Manager C sees nothing of the Elimination of their own seat (8.4 rule 3)', () => {
  const elimId = () => s.planted.managerCElimination

  /** The sample with comments and audit entries on the Elimination, and without it (removed after generation). */
  function pair() {
    const elim = fromRow(s.datasets.requests.find((r) => r.requestId === elimId()) as never)
    const hrbp = elim.steps.find((x) => x.role === 'hrbp')?.approverId as string
    const withComments: HcRequest = {
      ...elim,
      comments: [
        {
          id: 'fx-e1',
          at: `${s.asOf}T08:00:00.000Z`,
          by: elim.requesterId,
          mode: 'manager',
          text: 'Seat goes with the reorg',
          audience: 'everyone',
        },
        {
          id: 'fx-e2',
          at: `${s.asOf}T08:10:00.000Z`,
          by: hrbp,
          mode: 'hrbp',
          text: 'Severance near €140,000',
          audience: 'approvers',
        },
      ],
    }
    const audit = auditLog([
      ...fx.audit.map(({ seq: _q, prevHash: _p, hash: _h, ...d }) => d),
      auditDraft({
        object: 'request',
        id: elimId(),
        field: 'state',
        old: 'Submitted',
        new: 'In review',
        by: hrbp,
        mode: 'hrbp',
        comment: 'Seat goes with the reorg',
        commentAudience: 'everyone',
        effectiveDate: elim.startDate,
      }),
    ])
    // An Elimination in review has written no position entry yet (its approval would): its own
    // request entries go with it.
    const withIt = withPlanRequests(s, [withComments])
    const without = withoutRequest(withIt, elimId(), audit)
    return { withIt, audit, without: without.sample, auditWithout: without.audit, elim }
  }

  it('removes only the Elimination, its comments and its audit entries', () => {
    const p = pair()
    expect(p.withIt.datasets.requests.length - p.without.datasets.requests.length).toBe(1)
    expect(p.audit.length - p.auditWithout.length).toBe(1)
    expect(p.without.datasets.positions).toBe(s.datasets.positions)
    expect(p.without.plan.versions).toBe(s.plan.versions)
  })

  it('gives Manager C, the manager below C and Finance acting as C equal crawls; HR admin differs', async () => {
    const p = pair()
    const c = personaOf(s, 'manager-c')
    const below = s.datasets.workers.find(
      (w) =>
        w.positionId &&
        s.datasets.positions.some((q) => q.managerPositionId === w.positionId) &&
        s.datasets.positions.some(
          (q) => q.positionId === w.positionId && q.managerPositionId === c.positionId,
        ),
    )?.employeeId as string
    expect(below).toBeTruthy()
    for (const [mode, who] of [
      ['manager', c.employeeId],
      ['manager', below],
      ['finance', c.employeeId],
    ] as const) {
      const a = await crawlAll(ctxAs(mode, who, { sample: p.withIt, audit: p.audit }))
      const b = await crawlAll(ctxAs(mode, who, { sample: p.without, audit: p.auditWithout }))
      expect(a.errors, `${mode} ${who}`).toEqual([])
      expect(json(a), `${mode} ${who}: ${firstDifference(a, b)}`).toBe(json(b))
      expect(holding(a.seen, elimId()), `${mode} ${who}`).toEqual([])
      expect(a.seen.length, `${mode} ${who}`).toBeGreaterThan(1000)
    }
    const admin = (x: Sample, audit: readonly AuditEntry[]) =>
      crawl(sampleCtx('hr-admin', { sample: x, audit }), { views: ['requests'], cards: false })
    const ha = admin(p.withIt, p.audit)
    expect(holding(ha.seen, elimId()).length).toBeGreaterThan(0)
    expect(json(ha)).not.toBe(json(admin(p.without, p.auditWithout)))
  }, 600_000)

  /* ───── (a) routing never reads the hidden request (8.4 rule 8) ───── */

  it('routes a New role and a Trade by C and by the manager below C the same with and without it', async () => {
    const p = pair()
    const k = routingCase(s, p.withIt, p.without)
    const submitted: Record<'with' | 'without', HcRequest[]> = { with: [], without: [] }
    for (const [key, x] of [
      ['with', k.withIt],
      ['without', k.without],
    ] as const) {
      const store = new MemoryStore({ initial: x.plan, deps: { now: () => PINNED_AT } })
      for (const d of drafts(s, k, x)) {
        const steps = submitSteps(s, k, x, d.req, d.seat)
        submitted[key].push({ ...d.req, state: 'Submitted', submittedAt: k.at, steps })
      }
      await store.save({ ...(await store.load()), requests: [...x.plan.requests, ...submitted[key]] })
      const back = (await store.load()).requests.filter((r) => r.requestId.startsWith('R-99'))
      expect(back.map((r) => r.requestId)).toEqual(submitted[key].map((r) => r.requestId))
    }
    // Stored steps match, and every one goes to the leader (out of plan: asks reach the target).
    const stepsOf = (list: readonly HcRequest[]) =>
      list.map((r) => [r.requestId, r.steps.map((x) => [x.role, x.approverId, x.reasons])])
    expect(JSON.stringify(stepsOf(submitted.with))).toBe(JSON.stringify(stepsOf(submitted.without)))
    expect(submitted.with.length).toBe(4)
    for (const r of submitted.with)
      expect(
        r.steps.map((x) => x.role),
        r.requestId,
      ).toContain('leader')

    // Control: a router that counted the hidden Elimination would drop C's leader step.
    const wrong = submitSteps(s, k, k.withIt, drafts(s, k, k.withIt)[0].req, k.c.positionId, true)
    expect(wrong.map((x) => x.role)).not.toContain('leader')

    // The chain preview and the tracker read the same for C and the manager below C.
    for (const who of [k.c.employeeId, k.below.personId]) {
      const a = crawl(
        ctxAs('manager', who, { sample: withPlanRequests(k.withIt, submitted.with), audit: p.audit }),
      )
      const b = crawl(
        ctxAs('manager', who, {
          sample: withPlanRequests(k.without, submitted.without),
          audit: p.auditWithout,
        }),
      )
      expect(json(a), `${who}: ${firstDifference(a, b)}`).toBe(json(b))
      expect(holding(a.seen, who === k.c.employeeId ? 'R-9910' : 'R-9920').length, who).toBeGreaterThan(0)
      expect(holding(a.seen, elimId())).toEqual([])
    }
  }, 600_000)

  /* ───── (b) an HRBP Shareable opened as C; (c) Export for a manager ───── */

  it('opens an HRBP Shareable made with the Elimination as C with nothing of it in view', () => {
    const p = pair()
    const hrbp = p.elim.steps.find((x) => x.role === 'hrbp')?.approverId as string
    const unit = p.elim.businessUnit
    const fileOf = (x: Sample, audit: readonly AuditEntry[]) => {
      const c = crawl(ctxAs('hrbp', hrbp, { sample: x, audit, unit }), {
        cards: false,
        recordExports: 'digest',
      })
      return workspaceText(c, 'shareable')
    }
    const withFile = fileOf(p.withIt, p.audit)
    const withoutFile = fileOf(p.without, p.auditWithout)
    // Control: the HRBP's file carries the Elimination, its comments and its audit row.
    expect(withFile).toContain(elimId())
    expect(withFile).toContain('Severance near')
    expect(withFile).not.toBe(withoutFile)
    const c = personaOf(s, 'manager-c')
    const asC: AnalyticsContext = ctxAs('manager', c.employeeId, { sample: p.without, audit: p.auditWithout })
    const a = openShared(withFile, asC)
    const b = openShared(withoutFile, asC)
    expect(json(a)).toBe(json(b))
    expect(holding(a.seen, elimId())).toEqual([])
    expect(holding(a.seen, 'Severance')).toEqual([])
    expect(holding(a.seen, 'reorg')).toEqual([])
    expect(amountHits(a.seen).map((h) => `${h.what} ${h.where}`)).toEqual([])
    // Control: the same file opened by the HRBP who made it shows the Elimination and its comment.
    const asHrbp = ctxAs('hrbp', hrbp, { sample: p.without, audit: p.auditWithout, unit })
    const own = openShared(withFile, asHrbp)
    expect(holding(own.seen, elimId()).length).toBeGreaterThan(0)
    expect(holding(own.seen, 'Severance near').length).toBeGreaterThan(0)
    expect(json(own)).not.toBe(json(openShared(withoutFile, asHrbp)))
  }, 300_000)

  it('gives byte-equal Export for a manager files for C that pass the amount scan', () => {
    const p = pair()
    const c = personaOf(s, 'manager-c')
    for (const kind of ['shareable', 'requests'] as const) {
      const a = crawl(ctxAs('manager', c.employeeId, { sample: p.withIt, audit: p.audit }))
      const b = crawl(ctxAs('manager', c.employeeId, { sample: p.without, audit: p.auditWithout }))
      const fa = workspaceText(a, kind)
      expect(fa, kind).toBe(workspaceText(b, kind))
      expect(fa.length, kind).toBeGreaterThan(200)
      expect(fa).not.toContain(elimId())
      const hits = amountHits(a.seen.filter((x) => x.where.startsWith(`file ${kind}`)))
      expect(
        hits.map((h) => `${h.what} ${h.where}`),
        kind,
      ).toEqual([])
    }
    // Export for a manager as the app writes it (src/views/data/engine/workspace.ts `forManagerFile`),
    // from the HRBP's context and from HR admin's: C's own Shareable, byte for byte, with and without.
    const hrbp = p.elim.steps.find((x) => x.role === 'hrbp')?.approverId as string
    const unit = p.elim.businessUnit
    const own = workspaceText(
      crawl(ctxAs('manager', c.employeeId, { sample: p.withIt, audit: p.audit }), { cards: false }),
      'shareable',
    )
    const from = [
      ['hrbp', (x: Sample, audit: readonly AuditEntry[]) => ctxAs('hrbp', hrbp, { sample: x, audit, unit })],
      ['hr-admin', (x: Sample, audit: readonly AuditEntry[]) => sampleCtx('hr-admin', { sample: x, audit })],
    ] as const
    for (const [mode, ctxOf] of from) {
      const withCtx = ctxOf(p.withIt, p.audit)
      const fa = forManagerText(withCtx, c.employeeId)
      expect(fa, mode).toBe(forManagerText(ctxOf(p.without, p.auditWithout), c.employeeId))
      expect(fa, mode).toBe(own)
      expect(fa, mode).not.toContain(elimId())
      const read = fileCrawl(withCtx, 'file for-manager', forManagerFile(withCtx, c.employeeId, PINNED_AT))
      expect(read.seen.length, mode).toBeGreaterThan(100)
      expect(
        amountHits(read.seen).map((h) => `${h.what} ${h.where}`),
        mode,
      ).toEqual([])
    }
  }, 300_000)
})
