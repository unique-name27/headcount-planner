/**
 * The crawl reads help as each mode shows it (review HL-10): What's new's notes with only the items
 * the mode lists (src/help/whatsNew.ts `releaseNotesIn`, as the article draws them), so a leak scan
 * over the crawl reads what the screen shows, no more and no less. It tags forecast accuracy (cost)
 * as a ratio of the amounts its card lists (`ratio`, the move rule's), and no other percentage. It
 * reads Plan > Hiring and Plan > Recruiting summary from their own models under `plan.hiring` and
 * `plan.recruiting` (`TAB_MODELS`; docs/PLAN.md 9.7 and 9.8, reading H10), in every mode, alone
 * (`tabs`) or in a crawl of the whole Plan view; and it writes Plan > Recruiting summary's deck with
 * the summary slide its screen registers (`DECK_SUMMARIES`, 9.8 item 5): one slide for the tab.
 */
import { describe, expect, it, vi } from 'vitest'
import { RECRUITING_KPI_IDS } from '@/access/ids'
import { RELEASE_NOTES, releaseNotesIn } from '@/help/whatsNew'
import { ABOUT_SLIDE_TITLE } from '@/lib/export/exportHeader'
import { deckEntries, deckOutline, viewEntries } from '@/lib/export/view'
import { fmt } from '@/lib/format'
import { planModel } from '@/views/plan/engine'
import { planRecruitingModel } from '@/views/plan/engine/recruitingTab'
import { Crawl, crawl, DECK_SUMMARIES, figureMeta, TAB_MODELS } from './crawl'
import { MemoryStorage } from './memoryStorage'
import { sampleCtx } from './sample'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
vi.stubGlobal('localStorage', new MemoryStorage())

const NOTE = /^help\/article [^/]+\/note /

describe("the crawl's What's new", () => {
  it('reads each note with the items the mode lists, in every mode', () => {
    const every = RELEASE_NOTES.flatMap((n) => n.items).length
    const left: Record<string, number> = {}
    for (const mode of ['manager', 'hrbp', 'leader', 'finance', 'hr-admin'] as const) {
      const ctx = sampleCtx(mode)
      const c = new Crawl(ctx, {})
      c.help()
      const read = c.seen.filter((s) => NOTE.test(s.where)).map((s) => s.value)
      const notes = releaseNotesIn(ctx.access)
      expect(read, mode).toEqual(notes.flatMap((n) => [n.title, ...n.items]))
      left[mode] = every - notes.flatMap((n) => n.items).length
    }
    // Non-vacuous: Manager and Finance each leave items out (What if and cost; raising requests).
    expect(left.manager).toBeGreaterThan(0)
    expect(left.finance).toBeGreaterThan(0)
  })
})

describe('the crawl reads forecast accuracy (cost) as a ratio of amounts', () => {
  it('tags the tile and its card’s ratio in Finance, and no other value', () => {
    const c = crawl(sampleCtx('finance'), {
      views: ['finance', 'forecast'],
      pages: false,
      help: false,
      files: false,
      texts: false,
      cards: false,
      focus: 'money',
    })
    const ratios = c.seen
      .filter((s) => s.tag.ratio)
      .map((s) => s.where)
      .sort()
    expect(ratios).toEqual([
      'view finance/tab versions.kpis/tile finance-forecast-accuracy.calc/card.steps[2].expression',
      'view finance/tab versions.kpis/tile finance-forecast-accuracy.calc/card.steps[2].result',
      'view finance/tab versions.kpis/tile finance-forecast-accuracy.calc/card.value',
      'view finance/tab versions.kpis/tile finance-forecast-accuracy.value',
      'view forecast/tab variance.kpis/tile accuracy-cost.calc/card.steps[2].expression',
      'view forecast/tab variance.kpis/tile accuracy-cost.calc/card.steps[2].result',
      'view forecast/tab variance.kpis/tile accuracy-cost.calc/card.value',
      'view forecast/tab variance.kpis/tile accuracy-cost.value',
    ])
    // Every one is a percentage, and the heads accuracy beside it is not a ratio of amounts.
    for (const s of c.seen.filter((x) => x.tag.ratio)) expect(s.tag.format, s.where).toBe('pct')
    expect(c.seen.some((s) => s.where.includes('tile accuracy-heads.value') && !s.tag.ratio)).toBe(true)
  })
})

describe('the crawl reads Plan > Hiring from its own model (9.7, reading H10)', () => {
  const ONLY_TABS = {
    pages: false,
    help: false,
    texts: false,
    files: false,
    exports: false,
    cards: false,
    writes: false,
    drills: false,
  } as const

  it('reads the tab under plan.hiring in every mode, though the Plan model has no part for it', () => {
    expect(Object.keys(TAB_MODELS)).toEqual(['plan.hiring', 'plan.recruiting'])
    for (const mode of ['manager', 'hrbp', 'leader', 'finance', 'hr-admin'] as const) {
      const ctx = sampleCtx(mode)
      // Without its own model the crawl would read nothing here (the tab is no PlanModel field).
      expect((planModel(ctx) as unknown as Record<string, unknown>).hiring, mode).toBeUndefined()
      const c = crawl(ctx, { views: ['plan'], tabs: ['plan.hiring'], ...ONLY_TABS })
      expect(c.errors, mode).toEqual([])
      expect(
        c.seen.some((x) => x.where === 'view plan/tab hiring.kpis/tile hiring-open.value'),
        mode,
      ).toBe(true)
      for (const id of [
        'plan-hiring-quarters',
        'plan-hiring-open',
        'plan-hiring-velocity',
        'plan-hiring-recent',
      ])
        expect(c.figures.has(id), `${mode} ${id}`).toBe(true)
      // Narrowed to the tab: nothing of another tab is read.
      expect(
        c.seen.filter((x) => !/^view plan\/(tab hiring|headline)/.test(x.where)).map((x) => x.where),
        mode,
      ).toEqual([])
    }
  })

  it('reads it in a crawl of the whole Plan view too, after Openings and before Recruiting summary and Transfers', () => {
    // HR admin shows every Plan tab (Finance has no Transfers tab).
    const c = crawl(sampleCtx('hr-admin'), { views: ['plan'], ...ONLY_TABS })
    expect(c.errors).toEqual([])
    const tabs: string[] = []
    for (const x of c.seen) {
      const t = /^view plan\/tab ([a-z]+)/.exec(x.where)?.[1]
      if (t && !tabs.includes(t)) tabs.push(t)
    }
    expect(tabs).toEqual(['overview', 'positions', 'openings', 'hiring', 'recruiting', 'transfers'])
  })
})

describe('the crawl reads Plan > Recruiting summary from its own model (9.8, reading H10)', () => {
  const ONLY_TABS = {
    pages: false,
    help: false,
    texts: false,
    files: false,
    exports: false,
    cards: false,
    writes: false,
    drills: false,
  } as const
  const FIGURES = ['plan-recruiting-months', 'plan-recruiting-quarters', 'plan-recruiting-where']

  it('reads the tab under plan.recruiting in every mode, though the Plan model has no part for it', () => {
    for (const mode of ['manager', 'hrbp', 'leader', 'finance', 'hr-admin'] as const) {
      const ctx = sampleCtx(mode)
      expect((planModel(ctx) as unknown as Record<string, unknown>).recruiting, mode).toBeUndefined()
      const c = crawl(ctx, { views: ['plan'], tabs: ['plan.recruiting'], ...ONLY_TABS })
      expect(c.errors, mode).toEqual([])
      for (const id of RECRUITING_KPI_IDS)
        expect(
          c.seen.some((x) => x.where === `view plan/tab recruiting.kpis/tile ${id}.value`),
          `${mode} ${id}`,
        ).toBe(true)
      for (const id of FIGURES) expect(c.figures.has(id), `${mode} ${id}`).toBe(true)
      // The workbook's group holds each figure with rows under its own id, in page order (the
      // sample's Manager hired nobody in the last 3 months, so where hiring happened has none).
      expect(c.tables.get('plan.recruiting')?.ids, mode).toEqual(
        FIGURES.filter((id) => (c.figures.get(id)?.rows.length ?? 0) > 0),
      )
      expect(c.tables.get('plan.recruiting')?.ids.length, mode).toBe(mode === 'manager' ? 2 : 3)
      expect(
        c.seen.filter((x) => !/^view plan\/(tab recruiting|headline)/.test(x.where)).map((x) => x.where),
        mode,
      ).toEqual([])
    }
  })

  it('puts the summary slide on the months chart, standing in for the table and the lists in the deck only', async () => {
    const ctx = sampleCtx('hrbp')
    const c = crawl(ctx, { views: ['plan'], tabs: ['plan.recruiting'], ...ONLY_TABS })
    // Built on demand, as the screen builds it.
    expect(c.deckSummaries.size).toBe(0)
    await c.loadDeckSummaries()
    expect(c.errors).toEqual([])
    const made = c.deckSummaries.get('plan.recruiting')
    expect(made?.figure).toBe('plan-recruiting-months')
    expect(made?.summary.title).toBe('Recruiting summary')
    // The seven tiles as the strip shows them, every one shown under the sample's data standard.
    const tiles = planRecruitingModel(ctx).kpis
    expect(made?.summary.numbers.map((n) => n.label)).toEqual(tiles.map((k) => k.label))
    expect(made?.summary.numbers.map((n) => n.value)).toEqual(tiles.map((k) => fmt(k.value, k.format)))
    expect(made?.summary.numbers.map((n) => n.note)).toEqual(tiles.map((k) => k.note))
    expect(made?.summary.numbers.length).toBe(RECRUITING_KPI_IDS.length)
    const groups = c.figureGroups().get('plan')?.groups ?? []
    expect(groups.map((g) => g.key)).toEqual(['recruiting'])
    const figures = groups[0].figures
    // The workbook keeps every figure; the deck writes one slide, the summary's.
    expect(figures.map((f) => f.title)).toEqual([
      'Heads and hiring by month',
      'By quarter ahead',
      'Where hiring happened',
    ])
    expect(figures[0].deckSummary?.replaces).toEqual(['recruiting:1', 'recruiting:2'])
    expect(deckEntries(viewEntries(groups)).map((e) => e.figure.id)).toEqual(['recruiting:0'])
    const plan = groups[0]
    const meta = figureMeta(ctx, c.tables.get('plan.recruiting')?.view ?? null, 'recruiting')
    expect(deckOutline(figures, meta)).toEqual(['Plan', ABOUT_SLIDE_TITLE, 'Recruiting summary'])
    // A whole view's: the tab's one slide, with no divider of the same title (review RU-17).
    expect(deckOutline([plan], meta)).toEqual(['Plan', ABOUT_SLIDE_TITLE, 'Recruiting summary'])
    // Control: without the summary every figure gets its slide.
    expect(
      deckOutline(
        figures.map(({ deckSummary: _, ...f }) => f),
        meta,
      ),
    ).toEqual([
      'Plan',
      ABOUT_SLIDE_TITLE,
      'Heads and hiring by month',
      'By quarter ahead',
      'Where hiring happened',
    ])
    // Only Plan > Recruiting summary registers a summary slide.
    expect(Object.keys(DECK_SUMMARIES)).toEqual(['plan.recruiting'])
  })
})
