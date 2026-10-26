/**
 * A mode never reads about something it hides (PLAN 14.2), in a definition wherever it shows (M4
 * recheck HL-8-a): the HL-8 fix worded the help sheet's glossary per mode, and PLAN 12 treats
 * Settings > Formulas like the glossary. So every tile's definition and formula, and every Settings >
 * Formulas row, reads in the mode's own words (one wording source, `src/metrics/modeWording.ts`, through
 * `ctx.metrics`): Manager mode reads no band estimate, cut line, What if, loaded cost or Show pay
 * amounts in them, Finance no "on leave", and the cost guard's rules and the leave rule are left out
 * where the mode shows no amount or no leave, as in the glossary.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { AnalyticsContext } from '@/data/context'
import { METRICS } from '@/metrics/catalog'
import { type Crawl, crawl } from '@/testkit/crawl'
import { MemoryStorage } from '@/testkit/memoryStorage'
import { personaCtx, pinClock, sampleCtx, unpinClock } from '@/testkit/sample'
import { namesHidden } from './names'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
vi.stubGlobal('localStorage', new MemoryStorage())

const CASES: readonly [string, () => AnalyticsContext][] = [
  ['hr-admin', () => sampleCtx('hr-admin')],
  ['hr-admin with pay', () => sampleCtx('hr-admin', { showPay: true })],
  ['finance', () => personaCtx('finance-fpa')],
  ['hrbp', () => personaCtx('hrbp-se')],
  ['leader', () => personaCtx('leader-svp-se')],
  ['leader acting as the CFO', () => personaCtx('leader-cfo')],
  ['manager', () => personaCtx('manager-a')],
]

const read = new Map<string, { ctx: AnalyticsContext; c: Crawl }>()

beforeAll(() => {
  pinClock()
  for (const [name, make] of CASES) {
    const ctx = make()
    const c = crawl(ctx, {
      drills: false,
      cards: false,
      exports: false,
      files: false,
      writes: false,
      texts: false,
      pages: true,
    })
    read.set(name, { ctx, c })
  }
}, 600_000)

/** A tile's or figure's definition or formula, or a Settings > Formulas row. */
const isDefinition = (where: string) => /\.(definition|formula)$/.test(where) || where.startsWith('formulas ')

/** The texts of one kind a mode reads, with where. */
const textsOf = (name: string, keep: (where: string) => boolean) =>
  (read.get(name)?.c.seen ?? []).flatMap((s) =>
    typeof s.value === 'string' && keep(s.where) ? [{ where: s.where, text: s.value }] : [],
  )

/** The ids of the Settings > Formulas rows a mode reads. */
const formulaIds = (name: string) =>
  new Set(
    textsOf(name, (w) => w.startsWith('formulas ')).map((x) => x.where.split(' ')[2].replace(/\[\d+\]$/, '')),
  )

describe('definitions in each mode’s own words (M4 recheck HL-8-a)', () => {
  it('names nothing a mode hides in a tile’s definition or formula, or a Settings > Formulas row', () => {
    const found: string[] = []
    for (const [name] of CASES) {
      const { ctx } = read.get(name) as { ctx: AnalyticsContext }
      const texts = textsOf(name, isDefinition)
      // Non-vacuous: each mode reads tiles' definitions and formulas, and Settings > Formulas.
      expect(texts.filter((x) => x.where.startsWith('view ')).length, name).toBeGreaterThan(20)
      expect(formulaIds(name).size, name).toBeGreaterThan(10)
      for (const x of texts)
        found.push(...namesHidden(ctx.access, x.where, x.text).map((h) => `${name}: ${h}`))
    }
    expect(found.slice(0, 20)).toEqual([])
  })

  it('reads the standard heads tile and the ranked asks in Manager mode with no band estimate', () => {
    const tile = (part: string) => textsOf('manager', (w) => w.endsWith(part)).map((x) => x.text)
    const weight = [
      ...tile('tile standard-heads.definition'),
      ...tile('tile standard-heads.formula'),
      ...tile('tile cycle-asks.definition'),
    ]
    expect(weight.length).toBe(3)
    for (const t of weight) expect(t).not.toContain('band estimate')
    // The other modes read the catalog's own words.
    expect(textsOf('hrbp', (w) => w.endsWith('tile standard-heads.formula'))[0]?.text).toContain(
      'band estimate',
    )
  })

  it('leaves the cost guard’s rules out where no amount shows, and the leave rule where no leave shows', () => {
    const cost = (name: string) => [...formulaIds(name)].filter((id) => id.startsWith('cost.guard.'))
    expect(cost('manager')).toEqual([])
    for (const name of ['hr-admin', 'finance', 'hrbp', 'leader'])
      expect(cost(name).length, name).toBeGreaterThan(0)
    for (const name of ['manager', 'finance'])
      expect(formulaIds(name).has('privacy.leaveCounts'), name).toBe(false)
    expect(formulaIds('hr-admin').has('privacy.leaveCounts')).toBe(true)
    // Manager reads no rule about the pay switch; the rounded modes read it in their own words.
    expect(formulaIds('manager').has('privacy.payAmounts')).toBe(false)
    const pay = textsOf('hrbp', (w) => w.startsWith('formulas rules privacy.payAmounts')).map((x) => x.text)
    expect(pay.length).toBeGreaterThan(0)
    expect(pay.join('\n')).not.toContain('Show pay amounts')
  })

  it('is not vacuous: the catalog’s own words name what Manager and Finance hide', () => {
    const manager = read.get('manager')?.ctx as AnalyticsContext
    const finance = read.get('finance')?.ctx as AnalyticsContext
    const raw = (ctx: AnalyticsContext) =>
      METRICS.filter((m) => ctx.access.can(`metric:${m.id}`)).flatMap((m) =>
        namesHidden(
          ctx.access,
          `formulas ${m.id}`,
          [m.definition, m.formula ?? '', m.window ?? ''].join('\n'),
        ),
      )
    expect(raw(manager).length).toBeGreaterThan(3)
    expect(raw(finance).length).toBeGreaterThan(0)
    unpinClock()
  })
})
