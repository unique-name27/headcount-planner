/**
 * Plan > Hiring is heads only (docs/PLAN.md 9.7 Privacy, change C36; docs/CONTRACTS-HIRING.md 3, the
 * checks owner's rows; 16.1). The leak crawl reads the tab from its own model under `plan.hiring`
 * (src/testkit/crawl.ts `TAB_MODELS`, reading H10), so every crawl the other leak tests run (Manager
 * A, B and C, the amount, leave and request perturbations) covers it; this file holds the tab itself
 * to what 9.7 promises, through `hiringCrawl` (the tab's six tiles, the quarter table, the open to
 * hire bars, the velocity chart, the hires of the last 3 months by location and department (C37),
 * the readout, every records list and calculation card behind them,
 * each figure's CSV and clipboard text and the tab's workbook as written, plus the Open to hire tile
 * the HRBP and Leader homes and My team re-link):
 *
 *  - It is read in full in every mode (Manager A, B and C, the HRBP, the SVP and the CFO as leaders,
 *    Finance, HR admin with and without Show pay amounts), and its Shareable file carries its figures.
 *  - No amount, band estimate, offer amount or leave fact in any mode, HR admin with the switch on
 *    included (reading H13): no value in an amount column or format, no amount-like key, no currency
 *    sign or ISO code, no pay value of the data, only positions, workers and reqs records, none of the
 *    columns `HIRING_DRILL_HIDE` leaves out, and no leave key, metric or word (a position's own title
 *    aside, the data's words). Written files are read cell by cell without the export header every
 *    file of the mode carries (its rates and rounding step, checked to be that header and nothing
 *    more). Manager mode also passes the Manager amount scan, and lists no people records (H12).
 *  - Nothing about a Manager's own seat or above (8.4 rule 3, R23): no row, cell or finding for the
 *    own seat, and no seat above it, nor anyone holding one, anywhere in the tab.
 *  - A request 8.4 rule 3 hides moves no count: Manager C's tab (and the manager below C's) is byte
 *    for byte the same with the confidential Elimination of C's seat pending, removed after generation
 *    and approved (its Eliminated row ends a seat outside C's tree), while HR admin's approved heads
 *    by Q4 end lose that seat; and no pending request moves the tab in any mode.
 *  - Heads only, so nothing moves: the HRBP's, the leader's, Finance's and HR admin's tab (the switch
 *    on and off) is byte for byte the same across every amount perturbation of the positions leak
 *    test and every leave change of the leave leak test (src/testkit/perturbations.ts), and across
 *    every leave flag flipped at once; Manager B's across one salary, one offer and one leave change.
 *  - An accepted offer's records hold IDs, stage and dates only (review HP-2, HP-5): a recruiter note
 *    carrying the offer's terms shows in no mode, and a hiring manager above Manager B's seat is
 *    never named in B's tab.
 *  - A Manager's modeled exits come from the tree alone (review HP-1): Managers A, B and C and the
 *    manager below C read the same tab across a last day on their own row, on each holder of a seat
 *    above, and on a peer of the same unit and department outside the tree; a last day inside the tree
 *    moves it, and HR admin's tab moves with them.
 *
 * Every part has a non-vacuity count and a control that must differ. The clock is pinned.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { AnalyticsContext } from '@/data/context'
import type { Sample } from '@/data/sample'
import { PENDING_REQUEST_STATES, type PositionRow } from '@/data/schema'
import { fromRow } from '@/plan/engine/requests'
import { appFile, type Crawl, crawl } from '@/testkit/crawl'
import {
  exportHeaderOf,
  HIRING_TAB,
  HIRING_WORKBOOK,
  hiringCrawl,
  hiringDifference,
  hiringJson,
  hiringScan,
  hiringSeen,
  hitLines,
  seatAndAbove,
} from '@/testkit/hiring'
import { amountHits, holding, keysOf, type Secrets, secretsOf } from '@/testkit/leaks'
import { MemoryStorage } from '@/testkit/memoryStorage'
import { leaveChanges, positionPerturbations } from '@/testkit/perturbations'
import {
  ctxAs,
  leakSample,
  personaCtx,
  personaOf,
  pinClock,
  sampleCtx,
  seatViewerContexts,
  unpinClock,
  withDatasets,
  withoutRequest,
  withPlan,
  withReq,
  withSalaryDelta,
  withWorker,
} from '@/testkit/sample'
import { planHiringModel } from '@/views/plan/engine/hiringTab'
import { HIRING_FIGURE_IDS, HIRING_KPI_IDS } from './ids'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
vi.stubGlobal('localStorage', new MemoryStorage())

let s: Sample
let secrets: Secrets
/** The positions' own titles: data, not the module's words. */
let titles: Set<string>
beforeAll(() => {
  pinClock()
  s = leakSample()
  secrets = secretsOf(s.datasets)
  titles = new Set(s.datasets.positions.map((p) => p.title ?? '').filter(Boolean))
}, 120_000)
afterAll(() => unpinClock())

/** Every mode's reader of the tab: the personas, the CFO (a company-wide leader) and HR admin with and without the switch. */
const READERS = [
  ['manager-a', (x: Sample) => personaCtx('manager-a', { sample: x })],
  ['manager-b', (x: Sample) => personaCtx('manager-b', { sample: x })],
  ['manager-c', (x: Sample) => personaCtx('manager-c', { sample: x })],
  ['hrbp-se', (x: Sample) => personaCtx('hrbp-se', { sample: x })],
  ['leader-svp-se', (x: Sample) => personaCtx('leader-svp-se', { sample: x })],
  ['leader-cfo', (x: Sample) => personaCtx('leader-cfo', { sample: x })],
  ['finance-fpa', (x: Sample) => personaCtx('finance-fpa', { sample: x })],
  ['hr-admin', (x: Sample) => sampleCtx('hr-admin', { sample: x })],
  ['hr-admin with pay amounts', (x: Sample) => sampleCtx('hr-admin', { sample: x, showPay: true })],
] as const

const isManager = (key: string) => key.startsWith('manager-')

/** The charts and tables of the tab (its tiles and readout are the strip and findings ids); C37 added the last. */
const TAB_FIGURES = [
  'plan-hiring-quarters',
  'plan-hiring-open',
  'plan-hiring-velocity',
  'plan-hiring-recent',
] as const

/** The values a crawl read under a path. */
const under = (c: Crawl, prefix: string) => c.seen.filter((x) => x.where.startsWith(prefix))

/** The records kinds a crawl read under the tab (or reported hidden). */
const kindsRead = (c: Crawl): Set<string> => {
  const out = new Set<string>()
  for (const x of c.seen) {
    const k = /\/records ([A-Za-z]+)[./]/.exec(x.where)?.[1]
    if (k) out.add(k)
  }
  return out
}

/* ───────────── read in full, in every mode ───────────── */

describe('Plan > Hiring in every mode (9.7)', () => {
  it('reads its tiles, figures, records, cards and exports, and the homes’ and My team’s tile', async () => {
    for (const [key, ctxOf] of READERS) {
      const ctx = ctxOf(s)
      expect(ctx.access.can('tab:plan.hiring'), key).toBe(true)
      const c = hiringCrawl(ctx, { cards: isManager(key) })
      await c.workbooks()
      expect(c.errors, key).toEqual([])
      // The six tiles in strip order, each with its value read.
      const tiles = [
        ...new Set(under(c, `${HIRING_TAB}.kpis/tile `).map((x) => /\/tile ([^./]+)/.exec(x.where)?.[1])),
      ]
      expect(tiles, key).toEqual([...HIRING_KPI_IDS])
      for (const id of HIRING_KPI_IDS)
        expect(
          c.seen.some((x) => x.where === `${HIRING_TAB}.kpis/tile ${id}.value`),
          `${key} ${id}`,
        ).toBe(true)
      // The quarter table, the bars, the velocity chart and the recent hires, each a figure the mode shows.
      for (const id of TAB_FIGURES) {
        expect((HIRING_FIGURE_IDS as readonly string[]).includes(id), id).toBe(true)
        expect(c.figures.has(id), `${key} ${id}`).toBe(true)
      }
      expect(c.figures.get('plan-hiring-quarters')?.rows.length, key).toBe(10)
      expect(c.figures.get('plan-hiring-open')?.rows.length, key).toBe(4)
      expect(c.figures.get('plan-hiring-velocity')?.rows.length, key).toBeGreaterThanOrEqual(12)
      // C37: Managers A, B and C hired nobody from July to September, so their table holds its total
      // row alone; every other reader's holds a row per department and location, the sub-totals and
      // the total, and each count's records are read.
      const recent = c.figures.get('plan-hiring-recent')
      expect(
        recent?.columns.map((col) => col.label),
        key,
      ).toEqual(['Department', 'Location', 'Jul 2026', 'Aug 2026', 'Sep 2026', 'Total', 'Hires per month'])
      if (isManager(key)) expect(recent?.rows.length, key).toBe(1)
      else {
        expect(recent?.rows.length, key).toBeGreaterThan(3)
        const recentRecords = c.seen.filter(
          (x) => x.where.includes('/figure plan-hiring-recent/') && /\/records [a-z]+\./i.test(x.where),
        )
        expect(recentRecords.length, key).toBeGreaterThan(0)
        expect(
          recentRecords.every((x) => /\/records workers\./.test(x.where)),
          key,
        ).toBe(true)
      }
      for (const ext of ['csv', 'tsv'])
        expect(
          c.seen.some((x) => x.where.endsWith(`/figure plan-hiring-recent.${ext}`)),
          `${key} recent ${ext}`,
        ).toBe(true)
      // Records behind the counts: seats everywhere; people as workers outside Manager mode only
      // (reading H12: there a count of people opens the seats they hold); calculation cards.
      const kinds = kindsRead(c)
      expect(kinds.has('positions'), key).toBe(true)
      expect(kinds.has('workers'), key).toBe(!isManager(key))
      expect(
        c.seen.some((x) => /\/records [a-z]+\.rows$/i.test(x.where)),
        key,
      ).toBe(true)
      expect(
        c.seen.some((x) => x.where.startsWith(HIRING_TAB) && x.where.includes('/card.value')),
        key,
      ).toBe(true)
      // Exports as written: the quarter table's CSV and clipboard text, and the tab's workbook.
      for (const ext of ['csv', 'tsv'])
        expect(
          c.seen.some((x) => x.where.endsWith(`/figure plan-hiring-quarters.${ext}`)),
          `${key} ${ext}`,
        ).toBe(true)
      expect(under(c, `${HIRING_WORKBOOK}/`).length, key).toBeGreaterThan(0)
      // The re-linked tile: on the HRBP's and the leaders' homes, and beside My team's hero.
      const home = c.seen.filter(
        (x) => x.tag.in === 'tile plan.hiring.open' && !x.where.startsWith(HIRING_TAB),
      )
      const on = (view: string) =>
        home.some((x) => x.where.startsWith(`view ${view}/`) && x.where.endsWith('.value'))
      if (isManager(key)) expect(on('team'), key).toBe(true)
      else if (key === 'hrbp-se' || key.startsWith('leader-')) expect(on('home'), key).toBe(true)
      else expect(home, key).toEqual([])
      // Manager A, B and C: every position card the tab opens is read too.
      if (isManager(key))
        expect(
          c.seen.some((x) => x.where.startsWith('card ')),
          key,
        ).toBe(true)
      expect(hiringSeen(c).length, key).toBeGreaterThan(200)
    }
  }, 900_000)

  it('carries its figures in every mode’s Shareable file, with no amount column', () => {
    for (const [key, ctxOf] of READERS) {
      const r = appFile(ctxOf(s), 'shareable')
      expect(r.ok, key).toBe(true)
      if (!r.ok) continue
      const models = (JSON.parse(r.out.text) as { body: { plan: { models?: Record<string, unknown> } } }).body
        .plan.models as Record<string, { columns: { key: string; money: boolean; band: boolean }[] }>
      for (const id of TAB_FIGURES) {
        expect(Object.keys(models ?? {}), `${key} ${id}`).toContain(id)
        expect(
          models[id]?.columns.filter((col) => col.money || col.band).map((col) => col.key),
          `${key} ${id}`,
        ).toEqual([])
      }
    }
  }, 600_000)
})

/* ───────────── heads only ───────────── */

describe('no amount, band estimate, offer amount or leave fact, in any mode (9.7 Privacy, H13)', () => {
  it('holds none, HR admin with Show pay amounts on included', async () => {
    let read = 0
    for (const [key, ctxOf] of READERS) {
      const ctx = ctxOf(s)
      const c = hiringCrawl(ctx, { recordExports: 'text' })
      await c.workbooks()
      expect(c.errors, key).toEqual([])
      const seen = hiringSeen(c)
      expect(hitLines(hiringScan(seen, secrets, exportHeaderOf(ctx), titles)), key).toBe('')
      // Manager mode: the Manager amount scan too (7.6), over the tab, its exports as written and
      // the position cards it opens.
      if (isManager(key)) {
        const withCards = hiringCrawl(ctx, { recordExports: 'text', cards: true })
        await withCards.workbooks()
        expect(
          amountHits(hiringSeen(withCards))
            .slice(0, 8)
            .map((h) => `${h.what} at ${h.where.slice(0, 160)}: ${h.text.slice(0, 100)}`),
          key,
        ).toEqual([])
      }
      // The accepted offers' records show their dates (reading H12: in Manager mode too), never an amount.
      if (key !== 'manager-a' && key !== 'manager-c')
        expect(kindsRead(c).has('reqs'), `${key}: accepted starts open their reqs`).toBe(true)
      read += seen.length
    }
    expect(read).toBeGreaterThan(READERS.length * 200)
  }, 900_000)

  it('control: the same scan finds amounts and leave on HR admin’s Plan > Overview with pay amounts shown', () => {
    const c = crawl(sampleCtx('hr-admin', { sample: s, showPay: true }), {
      views: ['plan'],
      tabs: ['plan.overview'],
      pages: false,
      help: false,
      texts: false,
      files: false,
      exports: false,
      cards: false,
      writes: false,
      recordExports: 'text',
    })
    const hits = hiringScan(c.seen, secrets).map((h) => h.what)
    expect(hits.some((w) => w.startsWith('value tagged money'))).toBe(true)
    expect(hits.some((w) => w.startsWith('leave key'))).toBe(true)
  }, 300_000)

  it('leaves out only the export header every file of the mode carries, which names rates and rounding', () => {
    // The HRBP's header names the plan rates and the rounding step: the scan would read them as
    // amounts, so it leaves out exactly these lines, which Plan > Openings' table carries too.
    const ctx = personaCtx('hrbp-se', { sample: s })
    const header = exportHeaderOf(ctx)
    expect([...header].some((l) => l.startsWith('Rates: '))).toBe(true)
    expect(header.size).toBeLessThan(16)
    const other = crawl(ctx, {
      views: ['plan'],
      tabs: ['plan.openings'],
      pages: false,
      help: false,
      texts: false,
      files: false,
      exports: false,
      cards: false,
      writes: false,
      drills: false,
    })
    const csv = other.seen.find((x) => x.where.endsWith('/figure plan-openings-table.csv'))?.value as string
    expect(typeof csv).toBe('string')
    const lines = new Set(csv.split(/\r?\n/).map((l) => l.replace(/^\uFEFF/, '').replace(/^"(.*)"$/, '$1')))
    for (const l of header) expect(lines.has(l.replace(/""/g, '"')), l).toBe(true)
    // Without it the scan finds the rates and the rounding step in the tab's own files.
    const c = hiringCrawl(ctx, { cellRows: 1 })
    expect(hiringScan(hiringSeen(c), secrets, new Set(), titles).length).toBeGreaterThan(0)
    expect(hiringScan(hiringSeen(c), secrets, header, titles)).toEqual([])
  }, 300_000)

  it('control: an accepted offer’s reqs list on its position card shows the offer columns the tab leaves out', () => {
    const offer = s.planted.corporateOffer
    const c = crawl(sampleCtx('hr-admin', { sample: s, showPay: true }), {
      views: [],
      pages: false,
      help: false,
      texts: false,
      files: false,
      exports: false,
      cards: 0,
      cardsOf: [offer.positionId],
    })
    const hits = hiringScan(c.seen, secrets).map((h) => h.what)
    expect(hits).toContain('hidden column Offer base (full-time rate)')
  }, 300_000)
})

/* ───────────── nothing about a Manager's own seat or above ───────────── */

describe("nothing about a Manager's own seat or above (8.4 rule 3, R23)", () => {
  it('holds no row, cell or finding for the own seat, and nothing of a seat above or its holder', () => {
    for (const key of ['manager-a', 'manager-b', 'manager-c'] as const) {
      const p = personaOf(s, key)
      const sa = seatAndAbove(s, p.positionId)
      expect(sa.above.length, key).toBeGreaterThan(1)
      const ctx = personaCtx(key, { sample: s })
      const c = hiringCrawl(ctx, { recordExports: 'text' })
      expect(c.errors, key).toEqual([])
      const seen = hiringSeen(c)
      const own = seen.filter(
        (x) =>
          x.where.includes(`positionId=${sa.own}`) ||
          x.where.includes(`.positions.${sa.own}`) ||
          (keysOf(x.where).at(-1) === 'positionId' && x.value === sa.own),
      )
      expect(
        own.slice(0, 5).map((x) => x.where),
        key,
      ).toEqual([])
      expect(c.positions.has(sa.own), key).toBe(false)
      for (const id of sa.above) {
        expect(c.positions.has(id), `${key} ${id}`).toBe(false)
        expect(
          holding(seen, id)
            .slice(0, 3)
            .map((x) => x.where),
          `${key} ${id}`,
        ).toEqual([])
      }
      for (const person of sa.people) {
        expect(
          holding(seen, person.employeeId)
            .slice(0, 3)
            .map((x) => x.where),
          `${key} ${person.employeeId}`,
        ).toEqual([])
        // The manager's own name may read on the team's own seats ("Reports to"), never anyone's above.
        if (person.employeeId !== p.employeeId)
          expect(
            holding(seen, person.name)
              .slice(0, 3)
              .map((x) => x.where),
            `${key} ${person.name}`,
          ).toEqual([])
      }
      // Non-vacuity: the tab lists the tree's own seats.
      const tree = new Set(ctx.data.positions.map((x) => x.positionId))
      expect([...c.positions].filter((id) => tree.has(id)).length, key).toBeGreaterThan(0)
      expect(
        [...c.positions].every((id) => tree.has(id)),
        key,
      ).toBe(true)
    }
  }, 600_000)

  it('control: HR admin’s tab lists the managers’ own seats', () => {
    const c = hiringCrawl(sampleCtx('hr-admin', { sample: s }), { cellRows: 2 })
    for (const key of ['manager-a', 'manager-b', 'manager-c'] as const)
      expect(c.positions.has(personaOf(s, key).positionId), key).toBe(true)
  }, 300_000)
})

/* ───────────── a request rule 3 hides moves no count ───────────── */

/** The holder of a seat in C's team that others report to: the manager below C. */
function managerBelow(x: Sample, cSeat: string): string {
  const seat = x.datasets.positions.find(
    (q) =>
      q.managerPositionId === cSeat && x.datasets.positions.some((r) => r.managerPositionId === q.positionId),
  )?.positionId as string
  return x.datasets.workers.find((w) => w.positionId === seat && !w.assignmentEnd)?.employeeId as string
}

/**
 * The sample with the confidential Elimination of Manager C's seat approved, as the write path leaves
 * it (src/plan/actions/managerC.scenario.test.ts): the request Approved in plan state and the seat's
 * Eliminated row in the overlay, effective the day after its last day (31 Dec 2026).
 */
function withEliminationApproved(x: Sample): Sample {
  const id = x.planted.managerCElimination
  const row = x.datasets.requests.find((r) => r.requestId === id)
  if (!row?.positionId || !row.startDate) throw new Error('The sample has no Elimination of C’s seat.')
  const seat = row.positionId
  const base = x.datasets.positions
    .filter((r) => r.positionId === seat && r.effectiveDate <= row.startDate!)
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
  expect(row.startDate).toBe('2026-12-31')
  const approved = { ...fromRow(row), state: 'Approved' as const }
  return withPlan(x, {
    requests: [...x.plan.requests.filter((r) => r.requestId !== id), approved],
    overlay: { ...x.plan.overlay, positions: [...x.plan.overlay.positions, ended] },
  })
}

/** Approved heads by a quarter end in a context's tab model (the quarter table's row). */
const approvedBy = (ctx: AnalyticsContext, q: 'q3' | 'q4'): unknown =>
  planHiringModel(ctx).quarters.rows.find((r) => r.key === 'approved')?.[q]

describe('a request 8.4 rule 3 hides moves no count (9.7 Privacy)', () => {
  /** Manager C's and the manager below C's tab on the sample (the Elimination pending) and on a copy. */
  function sameForC(copy: (x: Sample) => Sample, what: string): void {
    const c = personaOf(s, 'manager-c')
    const elim = s.planted.managerCElimination
    const below = managerBelow(s, c.positionId)
    expect(below).toBeTruthy()
    const changed = copy(s)
    for (const who of [c.employeeId, below]) {
      const base = hiringCrawl(ctxAs('manager', who, { sample: s }), { recordExports: 'text' })
      expect(base.errors, who).toEqual([])
      expect(hiringSeen(base).length, who).toBeGreaterThan(200)
      expect(holding(base.seen, elim), who).toEqual([])
      const after = hiringCrawl(ctxAs('manager', who, { sample: changed }), { recordExports: 'text' })
      expect(after.errors, `${who} ${what}`).toEqual([])
      expect(hiringJson(after), `${who} ${what}: ${hiringDifference(base, after)}`).toBe(hiringJson(base))
    }
  }

  it('gives Manager C and the manager below C the same tab with the Elimination pending or removed', () => {
    const c = personaOf(s, 'manager-c')
    const elim = s.planted.managerCElimination
    const pending = s.datasets.requests.find((r) => r.requestId === elim)
    expect(pending?.positionId).toBe(c.positionId)
    expect(PENDING_REQUEST_STATES).toContain(pending?.state)
    sameForC((x) => withoutRequest(x, elim).sample, 'removed')
    // Finance acting as C reads the request only as rule 2 allows: pending or removed, the same tab.
    const fin = (x: Sample) => hiringCrawl(ctxAs('finance', c.employeeId, { sample: x }), { cellRows: 4 })
    const a = fin(s)
    const b = fin(withoutRequest(s, elim).sample)
    expect(hiringJson(a), hiringDifference(a, b)).toBe(hiringJson(b))
  }, 600_000)

  it('gives them the same tab with the Elimination approved: it ends a seat outside C’s tree (9.7 Privacy)', () => {
    // The approved Eliminated row of C's own seat (effective 1 Jan 2027) moves no count C or the
    // manager below reads: not an approved head, not a current head, not an expected exit.
    sameForC(withEliminationApproved, 'approved')
  }, 600_000)

  it('control: the approved Elimination ends C’s seat after Q3 in HR admin’s approved heads', () => {
    const admin = (x: Sample) => sampleCtx('hr-admin', { sample: x })
    const before = admin(s)
    const after = admin(withEliminationApproved(s))
    expect(approvedBy(after, 'q3')).toBe(approvedBy(before, 'q3'))
    expect(approvedBy(after, 'q4')).toBe((approvedBy(before, 'q4') as number) - 1)
  }, 300_000)

  it('moves no count in any mode when every pending request is taken out', () => {
    const pending = new Set(
      [...s.datasets.requests, ...s.plan.requests]
        .filter((r) => PENDING_REQUEST_STATES.includes(r.state))
        .map((r) => r.requestId),
    )
    expect(pending.size).toBeGreaterThan(50)
    const none: Sample = {
      ...s,
      datasets: { ...s.datasets, requests: s.datasets.requests.filter((r) => !pending.has(r.requestId)) },
      plan: {
        ...s.plan,
        requests: s.plan.requests.filter((r) => !pending.has(r.requestId)),
        mergeBase: s.plan.mergeBase.filter((m) => !pending.has(m.requestId)),
      },
    }
    for (const [key, ctxOf] of READERS) {
      const a = hiringCrawl(ctxOf(s), { cellRows: 4 })
      const b = hiringCrawl(ctxOf(none), { cellRows: 4 })
      expect(a.errors, key).toEqual([])
      expect(hiringJson(b), `${key}: ${hiringDifference(a, b)}`).toBe(hiringJson(a))
    }
  }, 900_000)
})

/* ───────────── heads only, so nothing moves ───────────── */

/** The viewers of a perturbed seat (Finance, its unit's HRBP, the nearest leader above) and HR admin with the switch off and on. */
function viewersOf(positionId: string): { key: string; ctx: (x: Sample) => AnalyticsContext }[] {
  return [
    ...seatViewerContexts(s, positionId),
    { key: 'hr-admin', ctx: (x) => sampleCtx('hr-admin', { sample: x }) },
    { key: 'hr-admin with pay amounts', ctx: (x) => sampleCtx('hr-admin', { sample: x, showPay: true }) },
  ]
}

/** A hiring crawl for the byte-equal comparisons: every value, records as digests. */
const compareRead = (ctx: AnalyticsContext): Crawl => hiringCrawl(ctx)

/** Holds each changed sample's tab equal to its viewers' baselines; the problems as lines. */
function unmoved(changes: readonly { what: string; positionId: string; sample: () => Sample }[]): {
  problems: string[]
  compared: number
  baselines: Map<string, Crawl>
} {
  const baselines = new Map<string, Crawl>()
  const problems: string[] = []
  let compared = 0
  for (const ch of changes) {
    const changed = ch.sample()
    for (const v of viewersOf(ch.positionId)) {
      let base = baselines.get(v.key)
      if (!base) {
        base = compareRead(v.ctx(s))
        expect(base.errors, v.key).toEqual([])
        baselines.set(v.key, base)
      }
      const after = compareRead(v.ctx(changed))
      compared++
      if (hiringJson(after) !== hiringJson(base))
        problems.push(`${ch.what} | ${v.key} | ${hiringDifference(base, after)}`)
    }
  }
  return { problems, compared, baselines }
}

describe('heads only: nothing in the tab moves with pay, an offer or leave (9.7 Privacy)', () => {
  it('is byte-equal across every amount perturbation of the positions leak test', () => {
    const list = positionPerturbations(s)
    expect(list.length).toBe(3 + 3 + 8 * 4 + 1 + 1)
    const { problems, compared, baselines } = unmoved(list)
    expect(problems.slice(0, 20).join('\n')).toBe('')
    expect(compared).toBe(list.length * 5)
    for (const [key, c] of baselines) expect(hiringSeen(c).length, key).toBeGreaterThan(200)
  }, 1_800_000)

  it('is byte-equal across every leave change of the leave leak test', () => {
    const list = leaveChanges(s).map((x) => ({ ...x, sample: () => x.sample }))
    expect(list.length).toBe(4)
    const { problems, compared } = unmoved(list)
    expect(problems.slice(0, 20).join('\n')).toBe('')
    expect(compared).toBe(list.length * 5)
  }, 900_000)

  it('is byte-equal with every leave flag flipped at once, in every mode', () => {
    const w = s.datasets.workers
    const onLeave = w.filter((x) => x.onLeave === true)
    expect(onLeave.length).toBeGreaterThan(5)
    const flips: [string, Sample][] = [
      [
        'every leave unpaid',
        withDatasets(s, { workers: w.map((x) => (x.onLeave ? { ...x, leavePaid: false } : x)) }),
      ],
      [
        'nobody on leave',
        withDatasets(s, { workers: w.map((x) => ({ ...x, onLeave: null, leavePaid: null })) }),
      ],
      [
        'everyone on unpaid leave',
        withDatasets(s, { workers: w.map((x) => ({ ...x, onLeave: true, leavePaid: false })) }),
      ],
    ]
    for (const [key, ctxOf] of READERS) {
      const base = hiringCrawl(ctxOf(s), { cellRows: 6 })
      for (const [what, x] of flips) {
        const after = hiringCrawl(ctxOf(x), { cellRows: 6 })
        expect(hiringJson(after), `${key} ${what}: ${hiringDifference(base, after)}`).toBe(hiringJson(base))
      }
    }
  }, 1_800_000)

  it('gives Manager B the same tab across one salary, one offer and one leave change', () => {
    const b = personaOf(s, 'manager-b')
    const seats = new Set(
      s.datasets.positions.filter((p) => p.managerPositionId === b.positionId).map((p) => p.positionId),
    )
    const holders = s.datasets.workers.filter(
      (x) =>
        x.workerType === 'Employee' &&
        seats.has(x.positionId ?? '') &&
        !x.terminationDate &&
        !x.assignmentEnd,
    )
    const offer = s.datasets.reqs.find((r) => r.stage === 'Offer accepted' && seats.has(r.positionId ?? ''))
    const onLeave = holders.find((x) => x.onLeave === true)
    const paid = holders.find((x) => x !== onLeave)
    expect([!!offer, !!onLeave, !!paid]).toEqual([true, true, true])
    const read = (x: Sample) => hiringCrawl(personaCtx('manager-b', { sample: x }), { cards: true })
    const base = read(s)
    expect(base.errors).toEqual([])
    expect(hiringSeen(base).length).toBeGreaterThan(200)
    for (const [what, x] of [
      ['baseSalary', withSalaryDelta(s, paid?.employeeId as string, 7_500)],
      ['offerBase', withReq(s, offer?.reqId as string, { offerBase: (offer?.offerBase ?? 0) + 7_500 })],
      ['leavePaid', withWorker(s, onLeave?.employeeId as string, { leavePaid: false })],
    ] as const) {
      const after = read(x)
      expect(hiringJson(after), `${what}: ${hiringDifference(base, after)}`).toBe(hiringJson(base))
    }
  }, 600_000)

  it('control: HR admin with pay amounts shown sees a salary, an offer and a leave change on Plan > Positions', () => {
    const positions = (x: Sample) =>
      crawl(sampleCtx('hr-admin', { sample: x, showPay: true }), {
        views: ['plan'],
        tabs: ['plan.positions'],
        pages: false,
        help: false,
        texts: false,
        files: false,
        exports: false,
        cards: false,
        writes: false,
        focus: 'money',
      })
    const base = JSON.stringify(positions(s).snapshot())
    const list = positionPerturbations(s)
    const salary = list.find((p) => p.what.endsWith('baseSalary') && !p.oneTime) as (typeof list)[number]
    const offer = list.find((p) => p.what.endsWith('offerBase')) as (typeof list)[number]
    const leave = leaveChanges(s)[0]
    for (const [what, x] of [
      [salary.what, salary.sample()],
      [offer.what, offer.sample()],
      [leave.what, leave.sample],
    ] as const)
      expect(JSON.stringify(positions(x).snapshot()), what).not.toBe(base)
  }, 300_000)
})

/* ───────────── an accepted offer's records hold IDs, stage and dates only (HP-2, HP-5) ───────────── */

describe('an accepted offer’s records hold IDs, stage and dates only (review HP-2, HP-5)', () => {
  const NOTE = 'Kim Ortiz, offer agreed at USD 148,500 plus 20k sign-on'
  /** Every accepted offer carrying a recruiter note with its terms (ATS free text). */
  const noted = (x: Sample): Sample =>
    withDatasets(x, {
      reqs: x.datasets.reqs.map((r) => (r.stage === 'Offer accepted' ? { ...r, recruiter: NOTE } : r)),
    })

  it('shows no recruiter note in any mode: nothing in the records, their CSV and clipboard text, or the workbook', async () => {
    const x = noted(s)
    let withReqs = 0
    for (const [key, ctxOf] of READERS) {
      const ctx = ctxOf(x)
      const c = hiringCrawl(ctx, { recordExports: 'text' })
      await c.workbooks()
      expect(c.errors, key).toEqual([])
      const seen = hiringSeen(c)
      expect(hitLines(hiringScan(seen, secrets, exportHeaderOf(ctx), titles)), key).toBe('')
      for (const needle of ['148,500', 'Kim Ortiz', 'sign-on'])
        expect(
          holding(seen, needle)
            .slice(0, 3)
            .map((v) => v.where),
          `${key} ${needle}`,
        ).toEqual([])
      if (kindsRead(c).has('reqs')) withReqs++
    }
    expect(withReqs).toBeGreaterThan(4)
  }, 900_000)

  it('control: HR admin’s position card for an accepted offer still shows its recruiter note', () => {
    const x = noted(s)
    const offer = x.datasets.reqs.find((r) => r.stage === 'Offer accepted' && r.positionId) as {
      positionId: string
    }
    const c = crawl(sampleCtx('hr-admin', { sample: x, showPay: true }), {
      views: [],
      pages: false,
      help: false,
      texts: false,
      files: false,
      exports: false,
      cards: 0,
      cardsOf: [offer.positionId],
    })
    expect(holding(c.seen, 'Kim Ortiz').length).toBeGreaterThan(0)
  }, 300_000)

  it('never names a hiring manager above Manager B’s seat in B’s tab', () => {
    const b = personaOf(s, 'manager-b')
    const sa = seatAndAbove(s, b.positionId)
    const tree = new Set(personaCtx('manager-b', { sample: s }).data.positions.map((p) => p.positionId))
    const offer = s.datasets.reqs.find((r) => r.stage === 'Offer accepted' && tree.has(r.positionId ?? ''))
    expect(offer).toBeTruthy()
    const above = sa.people.filter((p) => p.employeeId !== b.employeeId)
    expect(above.length).toBeGreaterThan(1)
    for (const p of above) {
      const x = withReq(s, offer?.reqId as string, { hiringManagerId: p.employeeId })
      const c = hiringCrawl(personaCtx('manager-b', { sample: x }), { recordExports: 'text' })
      expect(c.errors, p.employeeId).toEqual([])
      expect(kindsRead(c).has('reqs'), p.employeeId).toBe(true)
      expect(
        holding(hiringSeen(c), p.name)
          .slice(0, 3)
          .map((v) => v.where),
        `${p.employeeId} ${p.name}`,
      ).toEqual([])
    }
  }, 600_000)
})

/* ───────────── a Manager's modeled exits come from the tree alone (HP-1) ───────────── */

describe('a last day at or above a Manager’s seat, or of a peer outside the tree, moves nothing (review HP-1)', () => {
  /** A worker's current row given a last day, with or without the assignment ending on it. */
  const leaving = (x: Sample, employeeId: string, withEnd: boolean): Sample =>
    withDatasets(x, {
      workers: x.datasets.workers.map((w) =>
        w.employeeId === employeeId && !w.terminationDate && !w.assignmentEnd
          ? { ...w, terminationDate: '2026-11-20', ...(withEnd ? { assignmentEnd: '2026-11-20' } : {}) }
          : w,
      ),
    })
  /** Each seat's row on the as-of date. */
  const placed = (x: Sample) => {
    const out = new Map<string, PositionRow>()
    for (const r of [...x.datasets.positions].sort((a, b) => (a.effectiveDate < b.effectiveDate ? -1 : 1)))
      if (r.effectiveDate <= x.asOf || !out.has(r.positionId)) out.set(r.positionId, r)
    return out
  }
  /** A holder of a seat in the same unit and department as a seat, outside a tree and not above it. */
  function peerOf(x: Sample, seat: string, tree: ReadonlySet<string>, above: ReadonlySet<string>): string {
    const at = placed(x)
    const own = at.get(seat) as PositionRow
    const w = x.datasets.workers.find((y) => {
      if (!y.positionId || y.positionId === seat || tree.has(y.positionId) || above.has(y.positionId))
        return false
      const r = at.get(y.positionId)
      return (
        !!r &&
        r.businessUnit === own.businessUnit &&
        (r.department ?? null) === (own.department ?? null) &&
        y.workerType === 'Employee' &&
        !y.terminationDate &&
        !y.assignmentEnd
      )
    })
    return w?.employeeId as string
  }

  it('gives Managers A, B and C and the manager below C the same tab, a last day inside the tree moving it', () => {
    const c = personaOf(s, 'manager-c')
    const managers = [
      ...(['manager-a', 'manager-b', 'manager-c'] as const).map((k) => personaOf(s, k)),
      { employeeId: managerBelow(s, c.positionId), positionId: '' },
    ]
    let compared = 0
    for (const m of managers) {
      const ctxOf = (x: Sample) => ctxAs('manager', m.employeeId, { sample: x })
      const base = ctxOf(s)
      const tree = new Set(base.data.positions.map((p) => p.positionId))
      const seat =
        m.positionId ||
        (s.datasets.workers.find((w) => w.employeeId === m.employeeId && !w.assignmentEnd)
          ?.positionId as string)
      const sa = seatAndAbove(s, seat)
      const peer = peerOf(s, seat, tree, new Set(sa.above))
      expect(peer, m.employeeId).toBeTruthy()
      const before = hiringCrawl(base, { cellRows: 4 })
      expect(before.errors, m.employeeId).toEqual([])
      const who = [...new Set([...sa.people.map((p) => p.employeeId), peer])]
      for (const id of who)
        for (const withEnd of id === m.employeeId ? [false, true] : [false]) {
          const after = hiringCrawl(ctxOf(leaving(s, id, withEnd)), { cellRows: 4 })
          compared++
          expect(
            hiringJson(after),
            `${m.employeeId}: ${id} ${withEnd}: ${hiringDifference(before, after)}`,
          ).toBe(hiringJson(before))
        }
      // Non-vacuity: a last day inside the tree moves the tab.
      const inside = s.datasets.workers.find(
        (w) =>
          w.workerType === 'Employee' &&
          !!w.positionId &&
          tree.has(w.positionId) &&
          !w.terminationDate &&
          !w.assignmentEnd,
      )?.employeeId as string
      const moved = hiringCrawl(ctxOf(leaving(s, inside, false)), { cellRows: 4 })
      expect(hiringJson(moved), `${m.employeeId}: inside`).not.toBe(hiringJson(before))
    }
    expect(compared).toBeGreaterThan(12)
    // Control: HR admin's tab moves with Manager C's own last day.
    const a = hiringCrawl(sampleCtx('hr-admin', { sample: s }), { cellRows: 4 })
    const b = hiringCrawl(sampleCtx('hr-admin', { sample: leaving(s, c.employeeId, false) }), { cellRows: 4 })
    expect(hiringJson(b)).not.toBe(hiringJson(a))
  }, 1_800_000)
})
