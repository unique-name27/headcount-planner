/**
 * Plan > Recruiting summary is heads only (docs/PLAN.md 9.8, change C38: "Privacy as 9.7": heads
 * only, 8.4, Manager mode's modeled exits and starts from the tree's own cohort; 9.7 Privacy; 16.1).
 * The leak crawl reads the tab from its own model under `plan.recruiting` (src/testkit/crawl.ts
 * `TAB_MODELS`, reading H10), so every crawl the other leak tests run covers it; this file holds the
 * tab itself to what 9.8 promises, through `recruitingCrawl` (its seven tiles, heads and hiring by
 * month, by quarter ahead, where hiring happened, every records list and calculation card behind
 * them, each figure's CSV and clipboard text) and `recruitingFiles` (the tab's workbook as written,
 * and its deck as the tab's Export menu writes it: one summary slide after "About these numbers"):
 *
 *  - It is read in full in every mode (Manager A, B and C, the HRBP, the SVP and the CFO as leaders,
 *    Finance, HR admin with and without Show pay amounts), its deck is title, About these numbers and
 *    one "Recruiting summary" slide with the seven numbers and the chart, its workbook keeps every
 *    figure, and its Shareable file carries its figures.
 *  - No amount, band estimate, offer amount or leave fact in any mode, HR admin with the switch on
 *    included: Plan > Hiring's heads-only scan (`hiringScan`: amount columns and formats, amount-like
 *    keys, currency signs and codes, the data's pay values, records kinds other than positions,
 *    workers and reqs, the columns `HIRING_DRILL_HIDE` leaves out, leave keys, metrics and words),
 *    over the tab, its records, cards, CSVs, clipboard texts, workbook and deck, with only the export
 *    header every file of the mode carries left out (its lines in the files, and the deck's title and
 *    About slides). Manager mode also passes the Manager amount scan. A recruiter note carrying an
 *    offer's terms shows in no mode.
 *  - Nothing about a Manager's own seat or above (8.4 rule 3, R23): no row, cell, card or slide line
 *    for the own seat, no seat above it, nor anyone holding one; and a last day at or above the
 *    manager's seat, or of a peer outside the tree, moves nothing (the tree's own cohort, review HP-1:
 *    projected starts' backfills and projected exits alike), while one inside the tree does.
 *  - A request 8.4 rule 3 hides moves no count: Manager C's tab (and the manager below C's) is byte
 *    for byte the same with the confidential Elimination of C's seat pending, removed and approved,
 *    while HR admin's approved heads at the year end lose that seat; and no pending request moves the
 *    tab in any mode.
 *  - Heads only, so nothing moves: the tab of each viewer of a perturbed seat (Finance, its unit's
 *    HRBP, its leader, HR admin with the switch on and off) is byte for byte the same across every
 *    amount perturbation of the positions leak test and every leave change of the leave leak test
 *    (src/testkit/perturbations.ts), every mode's across every leave flag flipped at once, and Manager
 *    B's across one salary, one offer and one leave change; a last day inside the unit moves it.
 *
 * Every part has a non-vacuity count and a control that must differ. The clock is pinned.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { AnalyticsContext } from '@/data/context'
import type { Sample } from '@/data/sample'
import { PENDING_REQUEST_STATES, type PositionRow } from '@/data/schema'
import { ABOUT_SLIDE_TITLE } from '@/lib/export/exportHeader'
import { fromRow } from '@/plan/engine/requests'
import { appFile, type Crawl, crawl } from '@/testkit/crawl'
import { exportHeaderOf, hiringScan, hitLines, seatAndAbove } from '@/testkit/hiring'
import { amountHits, holding, keysOf, type Secrets, secretsOf } from '@/testkit/leaks'
import { MemoryStorage } from '@/testkit/memoryStorage'
import { leaveChanges, positionPerturbations } from '@/testkit/perturbations'
import {
  deckOwnSlides,
  FILE_AMOUNT,
  menuFiles,
  overviewFilesCrawl,
  RECRUITING_DECK,
  RECRUITING_KEY,
  RECRUITING_TAB,
  RECRUITING_WORKBOOK,
  recruitingCrawl,
  recruitingDifference,
  recruitingFiles,
  recruitingJson,
  recruitingScanned,
  recruitingSeen,
} from '@/testkit/recruiting'
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
import { planRecruitingModel } from '@/views/plan/engine/recruitingTab'
import { RECRUITING_FIGURE_IDS, RECRUITING_KPI_IDS } from './ids'

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

/** The charts and tables of the tab (its tiles are the strip's id). */
const TAB_FIGURES = RECRUITING_FIGURE_IDS.filter((id) => id !== 'plan-recruiting-kpis')

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

/** A crawl of the tab with its files as written: what the full reads and scans read. */
async function fullRead(ctx: AnalyticsContext, opts: Parameters<typeof recruitingCrawl>[1] = {}) {
  const c = recruitingCrawl(ctx, opts)
  const deck = await recruitingFiles(c)
  return { c, deck }
}

/* ───────────── read in full, in every mode ───────────── */

describe('Plan > Recruiting summary in every mode (9.8)', () => {
  it('reads its tiles, figures, records, cards and files; its deck is one summary slide', async () => {
    for (const [key, ctxOf] of READERS) {
      const ctx = ctxOf(s)
      expect(ctx.access.can('tab:plan.recruiting'), key).toBe(true)
      const { c, deck } = await fullRead(ctx, { cards: isManager(key) })
      expect(c.errors, key).toEqual([])
      // The seven tiles in strip order, each with its value read.
      const tiles = [
        ...new Set(under(c, `${RECRUITING_TAB}.kpis/tile `).map((x) => /\/tile ([^./]+)/.exec(x.where)?.[1])),
      ]
      expect(tiles, key).toEqual([...RECRUITING_KPI_IDS])
      for (const id of RECRUITING_KPI_IDS)
        expect(
          c.seen.some((x) => x.where === `${RECRUITING_TAB}.kpis/tile ${id}.value`),
          `${key} ${id}`,
        ).toBe(true)
      // The chart, the quarter table and where hiring happened, each a figure the mode shows.
      for (const id of TAB_FIGURES) expect(c.figures.has(id), `${key} ${id}`).toBe(true)
      expect(c.figures.get('plan-recruiting-months')?.rows.length, key).toBe(12 + 6)
      expect(c.figures.get('plan-recruiting-quarters')?.rows.length, key).toBe(2)
      // Managers A, B and C hired nobody from July to September; every other reader has 5 and 5.
      expect(c.figures.get('plan-recruiting-where')?.rows.length, key).toBe(isManager(key) ? 0 : 10)
      // Records behind the counts: seats everywhere; people as workers outside Manager mode only
      // (reading H12: there a count of people opens the seats they hold); calculation cards.
      const kinds = kindsRead(c)
      expect(kinds.has('positions'), key).toBe(true)
      expect(kinds.has('workers'), key).toBe(!isManager(key))
      expect(
        c.seen.some((x) => x.where.startsWith(RECRUITING_TAB) && x.where.includes('/card.value')),
        key,
      ).toBe(true)
      // Projected starts open their seats, weighted (the model's starts and backfills; Manager C's
      // are backfills only).
      expect(
        c.seen.some(
          (x) =>
            x.where.startsWith(`${RECRUITING_TAB}.kpis/tile recruiting-projected.calc/card`) &&
            /\/records positions\.rows$/.test(x.where),
        ),
        key,
      ).toBe(true)
      // Exports as written: each figure's CSV and clipboard text, and the tab's workbook.
      for (const id of TAB_FIGURES)
        for (const ext of ['csv', 'tsv'])
          expect(
            c.seen.some((x) => x.where.endsWith(`/figure ${id}.${ext}`)),
            `${key} ${id} ${ext}`,
          ).toBe(!(isManager(key) && id === 'plan-recruiting-where'))
      const sheets = under(c, `${RECRUITING_WORKBOOK}/`)
      expect(sheets.length, key).toBe(isManager(key) ? 2 : 3)
      // The deck: title, About these numbers, one summary slide with the seven numbers and the chart.
      expect(deck.outline, key).toEqual(['Plan', ABOUT_SLIDE_TITLE, 'Recruiting summary'])
      expect(ctx.access.can('action:export.deck'), key).toBe(true)
      expect(deck.slides.length, key).toBe(3)
      const [slide] = deckOwnSlides(deck)
      expect(slide.texts[0], key).toBe('Recruiting summary')
      const m = planRecruitingModel(ctx)
      for (const k of m.kpis) expect(slide.texts, `${key} ${k.id}`).toContain(k.label)
      expect(slide.texts, key).toContain('Future starts')
      expect(slide.texts, key).toContain('Projected starts')
      // The chart's rows, as a table (no image in a test).
      expect(slide.tables.length, key).toBe(1)
      expect(slide.tables[0][0], key).toContain('Projected starts (model)')
      expect(slide.tables[0][0], key).toContain('Future starts (signed offers)')
      for (const t of ['By quarter ahead', 'Where hiring happened'])
        expect(
          deck.slides.some((x) => x.texts[0] === t),
          `${key} ${t}`,
        ).toBe(false)
      expect(under(c, `${RECRUITING_DECK}/`).length, key).toBeGreaterThan(10)
      expect(recruitingSeen(c).length, key).toBeGreaterThan(200)
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

  it('writes the summary slide the screen registers: its chart figure carries the seven numbers', () => {
    // The crawl builds the slide from the screen's own parts (src/testkit/crawl.ts `DECK_SUMMARIES`);
    // the screen's chart figure is the one that passes them, under this title.
    const src = readFileSync(
      fileURLToPath(new URL('../views/plan/ui/Recruiting.tsx', import.meta.url)),
      'utf8',
    ).replace(/\s+/g, ' ')
    const figures = [...src.matchAll(/<Figure\b(.*?)>/g)].map((x) => x[1])
    const withSummary = figures.filter((f) => f.includes('deckSummary={deckSummary}'))
    expect(withSummary.length).toBe(1)
    expect(withSummary[0]).toContain('id={PLAN_FIGURES.recruitingMonths}')
    expect(src).toContain("title: 'Recruiting summary'")
    expect(src).toContain('replaces: SUMMARY_REPLACES')
    expect(src).toMatch(/const subtitle = asOfLine\(ctx\.asOf, ctx\.scopeLabel, m\.fiscalYear\)/)
    expect(src).toMatch(/summaryNumbersOf\(tiles, gates\)/)
  })
})

/* ───────────── heads only ───────────── */

describe('no amount, band estimate, offer amount or leave fact, in any mode (9.8, 9.7 Privacy, H13)', () => {
  it('holds none, HR admin with Show pay amounts on included', async () => {
    let read = 0
    for (const [key, ctxOf] of READERS) {
      const ctx = ctxOf(s)
      const { c } = await fullRead(ctx, { recordExports: 'text', cards: false })
      expect(c.errors, key).toEqual([])
      const seen = recruitingScanned(c)
      expect(hitLines(hiringScan(seen, secrets, exportHeaderOf(ctx, 'recruiting'), titles)), key).toBe('')
      // Manager mode: the Manager amount scan too (7.6), over the tab, its files as written and the
      // position cards it opens.
      if (isManager(key)) {
        const withCards = await fullRead(ctx, { recordExports: 'text', cards: true })
        expect(
          amountHits(recruitingScanned(withCards.c))
            .slice(0, 8)
            .map((h) => `${h.what} at ${h.where.slice(0, 160)}: ${h.text.slice(0, 100)}`),
          key,
        ).toEqual([])
      }
      // The future starts' records show their dates (reading H12: in Manager mode too), never an amount.
      if (key !== 'manager-a' && key !== 'manager-c')
        expect(kindsRead(c).has('reqs'), `${key}: future starts open their reqs`).toBe(true)
      read += seen.length
    }
    expect(read).toBeGreaterThan(READERS.length * 200)
  }, 900_000)

  it('leaves out only the export header every file of the mode carries, and the deck’s title and About slides', async () => {
    const ctx = personaCtx('hrbp-se', { sample: s })
    const header = exportHeaderOf(ctx, 'recruiting')
    expect([...header].some((l) => l.startsWith('Rates: '))).toBe(true)
    // The same lines as every other tab's files of the mode (Plan > Hiring's here): the mode's, not the tab's.
    expect([...header]).toEqual([...exportHeaderOf(ctx)])
    expect(header.size).toBeLessThan(16)
    const { c, deck } = await fullRead(ctx, { cellRows: 1 })
    expect(deck.frame).toBe(2)
    // Without the header the scan finds the rates and the rounding step in the tab's own files.
    expect(hiringScan(recruitingScanned(c), secrets, new Set(), titles).length).toBeGreaterThan(0)
    expect(hiringScan(recruitingScanned(c), secrets, header, titles)).toEqual([])
    // What the frame slides hold is the header: the scan finds it there and nowhere else.
    const frame = hiringScan(recruitingSeen(c), secrets, header, titles)
    expect(frame.length).toBeGreaterThan(0)
    expect(frame.filter((h) => !/^deck plan\.recruiting\/slide [12]([/[]|$)/.test(h.where))).toEqual([])
    // The summary slide is read: the seven numbers' values and notes are in it.
    const numbers = c.deckSummaries.get('plan.recruiting')?.summary.numbers ?? []
    expect(numbers.length).toBe(RECRUITING_KPI_IDS.length)
    for (const n of numbers) {
      expect(deckOwnSlides(deck)[0].texts, n.label).toContain(n.value)
      if (n.note) expect(deckOwnSlides(deck)[0].texts, n.label).toContain(n.note)
    }
  }, 300_000)

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

  it('shows no recruiter note carrying an offer’s terms in any mode', async () => {
    const NOTE = 'Kim Ortiz, offer agreed at USD 148,500 plus 20k sign-on'
    const x = withDatasets(s, {
      reqs: s.datasets.reqs.map((r) => (r.stage === 'Offer accepted' ? { ...r, recruiter: NOTE } : r)),
    })
    let withReqs = 0
    for (const [key, ctxOf] of READERS) {
      const ctx = ctxOf(x)
      const { c } = await fullRead(ctx, { recordExports: 'text' })
      expect(c.errors, key).toEqual([])
      const seen = recruitingScanned(c)
      expect(hitLines(hiringScan(seen, secrets, exportHeaderOf(ctx, 'recruiting'), titles)), key).toBe('')
      for (const needle of ['148,500', 'Kim Ortiz', 'sign-on'])
        expect(
          holding(recruitingSeen(c), needle)
            .slice(0, 3)
            .map((v) => v.where),
          `${key} ${needle}`,
        ).toEqual([])
      if (kindsRead(c).has('reqs')) withReqs++
    }
    expect(withReqs).toBeGreaterThan(4)
    // Control: HR admin's position card for an accepted offer shows the note.
    const offer = x.datasets.reqs.find((r) => r.stage === 'Offer accepted' && r.positionId) as {
      positionId: string
    }
    const card = crawl(sampleCtx('hr-admin', { sample: x, showPay: true }), {
      views: [],
      pages: false,
      help: false,
      texts: false,
      files: false,
      exports: false,
      cards: 0,
      cardsOf: [offer.positionId],
    })
    expect(holding(card.seen, 'Kim Ortiz').length).toBeGreaterThan(0)
  }, 900_000)
})

/* ───────────── nothing about a Manager's own seat or above ───────────── */

/** The holder of a seat in C's team that others report to: the manager below C. */
function managerBelow(x: Sample, cSeat: string): string {
  const seat = x.datasets.positions.find(
    (q) =>
      q.managerPositionId === cSeat && x.datasets.positions.some((r) => r.managerPositionId === q.positionId),
  )?.positionId as string
  return x.datasets.workers.find((w) => w.positionId === seat && !w.assignmentEnd)?.employeeId as string
}

/* ───────────── the tab's own files, as the Export menu writes them (review RP-1) ───────────── */

describe('the tab’s own deck and workbook as the Export menu writes them (review RP-1)', () => {
  it('carry no amount on any slide or on the Summary sheet in any mode, HR admin with Show pay amounts on included', async () => {
    for (const [key, make] of READERS) {
      const ctx = make(s)
      const c = recruitingCrawl(ctx)
      const { lines, sheets } = await menuFiles(c, RECRUITING_KEY)
      expect(c.errors, key).toEqual([])
      expect(lines.length, key).toBeGreaterThan(5)
      if (ctx.access.can('action:export.view')) expect(sheets[0], key).toBe('Summary')
      // No frame exemption: the title slide, About these numbers and the Summary sheet are scanned too.
      expect(lines.filter((t) => FILE_AMOUNT.test(t)).slice(0, 3), key).toEqual([])
    }
  }, 900_000)

  it('control: Plan > Overview’s own files carry the long CSV’s loaded cost in USD for HRBP, Finance and HR admin', async () => {
    for (const [key, ctx] of [
      ['hrbp-se', personaCtx('hrbp-se', { sample: s })],
      ['finance-fpa', personaCtx('finance-fpa', { sample: s })],
      ['hr-admin', sampleCtx('hr-admin', { sample: s })],
    ] as const) {
      const c = overviewFilesCrawl(ctx)
      const { lines } = await menuFiles(c, 'plan.overview')
      expect(
        lines.some((t) => /control totals/i.test(t) && /\bloaded\b/.test(t) && /\bUSD\b/.test(t)),
        key,
      ).toBe(true)
    }
  }, 900_000)
})

describe("nothing about a Manager's own seat or above (8.4 rule 3, R23)", () => {
  it('holds no row, cell, card or slide line for the own seat, and nothing of a seat above or its holder', async () => {
    for (const key of ['manager-a', 'manager-b', 'manager-c'] as const) {
      const p = personaOf(s, key)
      const sa = seatAndAbove(s, p.positionId)
      expect(sa.above.length, key).toBeGreaterThan(1)
      const ctx = personaCtx(key, { sample: s })
      const { c } = await fullRead(ctx, { recordExports: 'text', cards: true })
      expect(c.errors, key).toEqual([])
      const seen = recruitingSeen(c)
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
      // Non-vacuity: the tab lists the tree's own seats, and only those.
      const tree = new Set(ctx.data.positions.map((x) => x.positionId))
      expect([...c.positions].filter((id) => tree.has(id)).length, key).toBeGreaterThan(0)
      expect(
        [...c.positions].every((id) => tree.has(id)),
        key,
      ).toBe(true)
    }
  }, 600_000)

  it('control: HR admin’s tab lists the managers’ own seats', () => {
    const c = recruitingCrawl(sampleCtx('hr-admin', { sample: s }), { cellRows: 2 })
    for (const key of ['manager-a', 'manager-b', 'manager-c'] as const)
      expect(c.positions.has(personaOf(s, key).positionId), key).toBe(true)
  }, 300_000)

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

  it('moves nothing with a last day at or above the manager’s seat or of a peer outside the tree (review HP-1)', () => {
    // Projected starts' backfills and projected exits come from the tree's own cohort in Manager
    // mode: a known exit outside the tree never nets against them.
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
      const before = recruitingCrawl(base, { cellRows: 4 })
      expect(before.errors, m.employeeId).toEqual([])
      const who = [...new Set([...sa.people.map((p) => p.employeeId), peer])]
      for (const id of who)
        for (const withEnd of id === m.employeeId ? [false, true] : [false]) {
          const after = recruitingCrawl(ctxOf(leaving(s, id, withEnd)), { cellRows: 4 })
          compared++
          expect(
            recruitingJson(after),
            `${m.employeeId}: ${id} ${withEnd}: ${recruitingDifference(before, after)}`,
          ).toBe(recruitingJson(before))
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
      const moved = recruitingCrawl(ctxOf(leaving(s, inside, false)), { cellRows: 4 })
      expect(recruitingJson(moved), `${m.employeeId}: inside`).not.toBe(recruitingJson(before))
    }
    expect(compared).toBeGreaterThan(12)
    // Control: HR admin's tab moves with Manager C's own last day.
    const a = recruitingCrawl(sampleCtx('hr-admin', { sample: s }), { cellRows: 4 })
    const b = recruitingCrawl(sampleCtx('hr-admin', { sample: leaving(s, c.employeeId, false) }), {
      cellRows: 4,
    })
    expect(recruitingJson(b)).not.toBe(recruitingJson(a))
  }, 1_800_000)
})

/* ───────────── a request rule 3 hides moves no count ───────────── */

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

describe('a request 8.4 rule 3 hides moves no count (9.8, 9.7 Privacy)', () => {
  it('gives Manager C and the manager below C the same tab with the Elimination pending, removed or approved', () => {
    const c = personaOf(s, 'manager-c')
    const elim = s.planted.managerCElimination
    const pending = s.datasets.requests.find((r) => r.requestId === elim)
    expect(pending?.positionId).toBe(c.positionId)
    expect(PENDING_REQUEST_STATES).toContain(pending?.state)
    const below = managerBelow(s, c.positionId)
    expect(below).toBeTruthy()
    for (const [what, changed] of [
      ['removed', withoutRequest(s, elim).sample],
      ['approved', withEliminationApproved(s)],
    ] as const)
      for (const who of [c.employeeId, below]) {
        const base = recruitingCrawl(ctxAs('manager', who, { sample: s }), { recordExports: 'text' })
        expect(base.errors, who).toEqual([])
        expect(recruitingSeen(base).length, who).toBeGreaterThan(200)
        expect(holding(base.seen, elim), who).toEqual([])
        const after = recruitingCrawl(ctxAs('manager', who, { sample: changed }), { recordExports: 'text' })
        expect(after.errors, `${who} ${what}`).toEqual([])
        expect(recruitingJson(after), `${who} ${what}: ${recruitingDifference(base, after)}`).toBe(
          recruitingJson(base),
        )
      }
    // Finance acting as C: rule 3 hides the request too (requestView "none"); pending or removed, the
    // same tab. Approved, C's seat is inside Finance's scope, so the tab reads the approved state as the
    // other tabs do (CONTRACTS-HIRING I1, src/views/plan/engine/recruitingRuleThree.test.ts).
    const fin = (x: Sample) => recruitingCrawl(ctxAs('finance', c.employeeId, { sample: x }), { cellRows: 4 })
    const a = fin(s)
    const b = fin(withoutRequest(s, elim).sample)
    expect(recruitingJson(a), recruitingDifference(a, b)).toBe(recruitingJson(b))
  }, 900_000)

  it('control: the approved Elimination ends C’s seat in HR admin’s approved heads at the year end', () => {
    const tile = (ctx: AnalyticsContext) =>
      planRecruitingModel(ctx).kpis.find((k) => k.id === 'recruiting-approved')?.value as number
    const quarter = (ctx: AnalyticsContext, k: string) =>
      planRecruitingModel(ctx).quarters.rows.find((r) => r.key === k)?.approved as number
    const before = sampleCtx('hr-admin', { sample: s })
    const after = sampleCtx('hr-admin', { sample: withEliminationApproved(s) })
    expect(tile(after)).toBe(tile(before) - 1)
    expect(quarter(after, 'q4')).toBe(quarter(before, 'q4') - 1)
    expect(quarter(after, 'q3')).toBe(quarter(before, 'q3'))
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
      const a = recruitingCrawl(ctxOf(s), { cellRows: 4 })
      const b = recruitingCrawl(ctxOf(none), { cellRows: 4 })
      expect(a.errors, key).toEqual([])
      expect(recruitingJson(b), `${key}: ${recruitingDifference(a, b)}`).toBe(recruitingJson(a))
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
        base = recruitingCrawl(v.ctx(s))
        expect(base.errors, v.key).toEqual([])
        baselines.set(v.key, base)
      }
      const after = recruitingCrawl(v.ctx(changed))
      compared++
      if (recruitingJson(after) !== recruitingJson(base))
        problems.push(`${ch.what} | ${v.key} | ${recruitingDifference(base, after)}`)
    }
  }
  return { problems, compared, baselines }
}

describe('heads only: nothing in the tab moves with pay, an offer or leave (9.8, 9.7 Privacy)', () => {
  it('is byte-equal across every amount perturbation of the positions leak test', () => {
    const list = positionPerturbations(s)
    expect(list.length).toBe(3 + 3 + 8 * 4 + 1 + 1)
    const { problems, compared, baselines } = unmoved(list)
    expect(problems.slice(0, 20).join('\n')).toBe('')
    expect(compared).toBe(list.length * 5)
    for (const [key, c] of baselines) expect(recruitingSeen(c).length, key).toBeGreaterThan(200)
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
      const base = recruitingCrawl(ctxOf(s), { cellRows: 6 })
      for (const [what, x] of flips) {
        const after = recruitingCrawl(ctxOf(x), { cellRows: 6 })
        expect(recruitingJson(after), `${key} ${what}: ${recruitingDifference(base, after)}`).toBe(
          recruitingJson(base),
        )
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
    const read = (x: Sample) => recruitingCrawl(personaCtx('manager-b', { sample: x }), { cards: true })
    const base = read(s)
    expect(base.errors).toEqual([])
    expect(recruitingSeen(base).length).toBeGreaterThan(200)
    for (const [what, x] of [
      ['baseSalary', withSalaryDelta(s, paid?.employeeId as string, 7_500)],
      ['offerBase', withReq(s, offer?.reqId as string, { offerBase: (offer?.offerBase ?? 0) + 7_500 })],
      ['leavePaid', withWorker(s, onLeave?.employeeId as string, { leavePaid: false })],
    ] as const) {
      const after = read(x)
      expect(recruitingJson(after), `${what}: ${recruitingDifference(base, after)}`).toBe(
        recruitingJson(base),
      )
    }
  }, 600_000)

  it('control: a last day in the unit moves the HRBP’s tab', () => {
    const ctxOf = (x: Sample) => personaCtx('hrbp-se', { sample: x })
    const base = ctxOf(s)
    const tree = new Set(base.data.positions.map((p) => p.positionId))
    const inside = s.datasets.workers.find(
      (w) =>
        w.workerType === 'Employee' &&
        !!w.positionId &&
        tree.has(w.positionId) &&
        !w.terminationDate &&
        !w.assignmentEnd,
    )?.employeeId as string
    const changed = withDatasets(s, {
      workers: s.datasets.workers.map((w) =>
        w.employeeId === inside && !w.terminationDate && !w.assignmentEnd
          ? { ...w, terminationDate: '2026-11-20' }
          : w,
      ),
    })
    const a = recruitingCrawl(base, { cellRows: 4 })
    const b = recruitingCrawl(ctxOf(changed), { cellRows: 4 })
    expect(recruitingJson(b)).not.toBe(recruitingJson(a))
  }, 300_000)
})
