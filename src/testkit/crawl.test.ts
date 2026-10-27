/**
 * The crawl reads help as each mode shows it (review HL-10): What's new's notes with only the items
 * the mode lists (src/help/whatsNew.ts `releaseNotesIn`, as the article draws them), so a leak scan
 * over the crawl reads what the screen shows, no more and no less. It tags forecast accuracy (cost)
 * as a ratio of the amounts its card lists (`ratio`, the move rule's), and no other percentage. It
 * reads Plan > Hiring from its own model under `plan.hiring` (`TAB_MODELS`; docs/PLAN.md 9.7, reading
 * H10), in every mode, alone (`tabs`) or in a crawl of the whole Plan view.
 */
import { describe, expect, it, vi } from 'vitest'
import { RELEASE_NOTES, releaseNotesIn } from '@/help/whatsNew'
import { planModel } from '@/views/plan/engine'
import { Crawl, crawl, TAB_MODELS } from './crawl'
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
    expect(Object.keys(TAB_MODELS)).toEqual(['plan.hiring'])
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

  it('reads it in a crawl of the whole Plan view too, after Openings and before Transfers', () => {
    // HR admin shows every Plan tab (Finance has no Transfers tab).
    const c = crawl(sampleCtx('hr-admin'), { views: ['plan'], ...ONLY_TABS })
    expect(c.errors).toEqual([])
    const tabs: string[] = []
    for (const x of c.seen) {
      const t = /^view plan\/tab ([a-z]+)/.exec(x.where)?.[1]
      if (t && !tabs.includes(t)) tabs.push(t)
    }
    expect(tabs).toEqual(['overview', 'positions', 'openings', 'hiring', 'transfers'])
  })
})
