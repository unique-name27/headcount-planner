/**
 * The help content is checked like code (the template app's help/content.test.ts; PLAN 14.2 and
 * 14.3): every article and tour passes `articleProblems` and `tourProblems` (ids registered, links
 * that resolve to a real page, tab, metric, article, tour or Settings section, routes and tabs that
 * exist, every tour step's target drawn in the components, 4 to 6 steps per view tour, sentence
 * case, no em dash between words, no "!", no nagging verb, no banned word but in `about-server`);
 * the checks themselves catch each break on made-up content; "Learn more" covers every metric;
 * `data-loading` names all eight datasets by label; the glossary has one entry per metric, sorted;
 * `APP_VERSION` is package.json's and the release notes are newest first.
 */
import { describe, expect, it } from 'vitest'
import { HELP_ARTICLE_IDS, HELP_TOUR_IDS } from '@/access/ids'
import { DATASET_KEYS, datasetDef, VIEW_KEYS } from '@/data/schema'
import { METRICS } from '@/metrics/catalog'
import pkg from '../../package.json'
import { ARTICLES, articleById } from './articles'
import { articleProblems, copyProblems, sentenceCaseProblem, targetInSource, tourProblems } from './check'
import * as COPY from './copy'
import { buildGlossary, RULE_WHERE } from './glossary'
import { articleForMetric, LEARN_MORE_ARTICLES } from './learnMore'
import { checkLink } from './links'
import { blockTexts, plainText } from './markup'
import { TOURS, tourById } from './tours'
import type { HelpArticle, Tour } from './types'
import { APP_VERSION, RELEASE_NOTES } from './whatsNew'
import { HELP_SOURCE, HELP_WORLD, isDataAddress } from './world.testkit'

const route = (target: string) => checkLink({ kind: 'route', target, label: '' }, HELP_WORLD)

describe('the link checks', () => {
  it('resolve real pages, tabs, parts, Data room addresses, metrics, articles, tours and Settings sections', () => {
    for (const t of [
      'plan',
      'plan.openings',
      'finance.assumptions',
      'finance.assumptions:trade-rates',
      'data',
      'data.quality',
      'data.metrics',
      'data.metrics/plan.heads.approved',
      'data.positions',
      'data.positions-raw',
      'data.lists/department',
      'data.workspace',
      'actions',
      'audit',
    ])
      expect(route(t), t).toBeNull()
    expect(checkLink({ kind: 'metric', target: 'plan.heads.approved', label: '' }, HELP_WORLD)).toBeNull()
    expect(checkLink({ kind: 'article', target: 'about-server', label: '' }, HELP_WORLD)).toBeNull()
    expect(checkLink({ kind: 'tour', target: 'getting-started', label: '' }, HELP_WORLD)).toBeNull()
    expect(checkLink({ kind: 'settings', target: 'display', label: '' }, HELP_WORLD)).toBeNull()
  })

  it('catch every kind of broken link', () => {
    expect(route('payroll')).toMatch(/no page/)
    expect(route('plan.nope')).toMatch(/no tab "nope" in plan/)
    expect(route('finance.assumptions:nope')).toMatch(/no part "nope"/)
    expect(route('plan.positions:x')).toMatch(/no part/)
    expect(route('plan.positions/P1')).toMatch(/no address/)
    expect(route('data.nope')).toMatch(/Data room/)
    expect(route('data.metrics/plan.nope')).toMatch(/Data room/)
    expect(route('data.positions-nope')).toMatch(/Data room/)
    expect(route('data.lists/nope')).toMatch(/Data room/)
    expect(route('actions.open')).toMatch(/no tab/)
    expect(route('audit.x')).toMatch(/no tab/)
    expect(checkLink({ kind: 'metric', target: 'plan.nope', label: '' }, HELP_WORLD)).toMatch(/no metric/)
    expect(checkLink({ kind: 'article', target: 'nope', label: '' }, HELP_WORLD)).toMatch(/no article/)
    expect(checkLink({ kind: 'tour', target: 'nope', label: '' }, HELP_WORLD)).toMatch(/no tour/)
    expect(checkLink({ kind: 'settings', target: 'nope', label: '' }, HELP_WORLD)).toMatch(/Settings/)
    expect(isDataAddress('')).toBe(false)
  })
})

/** A made-up article that keeps every rule; each case below breaks one. */
const GOOD: HelpArticle = {
  id: 'view-plan',
  group: 'views',
  title: 'Plan and its Openings',
  summary: 'Every seat of the version you pick.',
  body: [
    { h: 'What it shows' },
    { p: 'See [Openings](route:plan.openings) and [Approved heads](metric:plan.heads.approved).' },
    { ul: ['A "—" means hidden.'] },
  ],
  route: { view: 'plan' },
  tour: 'view-plan',
  metrics: ['plan.heads.approved'],
  keywords: ['seats'],
}

const step = (n: number) => ({
  target: '[data-tour="kpi-strip"]',
  title: `Step ${n}`,
  body: 'Each tile is a number.',
  view: 'plan' as const,
  tab: 'overview',
})
const GOOD_TOUR: Tour = {
  id: 'view-plan',
  title: 'Plan',
  summary: 'The plan, tab by tab.',
  length: '1 minute',
  route: 'plan',
  steps: [
    step(1),
    step(2),
    step(3),
    { target: '[data-tour="masthead-help"]', title: 'Help', body: 'Help is here.' },
  ],
}

describe('articleProblems', () => {
  it('passes an article that keeps every rule', () => {
    expect(articleProblems(GOOD, HELP_WORLD)).toEqual([])
  })

  it('catches each break', () => {
    const one = (patch: Partial<HelpArticle>) => articleProblems({ ...GOOD, ...patch }, HELP_WORLD)
    expect(one({ id: 'view-nope' })).toEqual(['view-nope: not in HELP_ARTICLE_IDS'])
    expect(one({ route: { view: 'plan', tab: 'nope' } })[0]).toMatch(/route: no tab/)
    expect(one({ tour: 'nope' })[0]).toMatch(/tour: no tour/)
    expect(one({ metrics: ['plan.nope'] })[0]).toMatch(/no metric/)
    expect(one({ summary: '' })[0]).toMatch(/summary: empty/)
    expect(one({ body: [] })[0]).toMatch(/body: empty/)
    expect(one({ body: [], generated: 'glossary' })).toEqual([])
    expect(one({ title: 'Plan And Openings' })[0]).toMatch(/title: capitalized: And/)
    expect(one({ body: [{ h: 'What It Shows' }] })[0]).toMatch(/heading 1: capitalized/)
    // The pronoun "I" and the Data room's tab and panel names keep their capitals.
    expect(one({ body: [{ h: 'How do I read the Datasets tab and its Quality panel?' }] })).toEqual([])
    expect(one({ body: [{ h: 'What I Want' }] })[0]).toMatch(/capitalized: Want/)
    expect(one({ body: [{ p: 'Plan — a view.' }] })[0]).toMatch(/em dash/)
    expect(one({ body: [{ p: 'Done!' }] })[0]).toMatch(/exclamation/)
    expect(one({ body: [{ ul: ['Remind your manager.'] }] })[0]).toMatch(/nagging verb/)
    expect(one({ summary: 'Modes are not secure.' })[0]).toMatch(/banned word "secure"/)
    expect(one({ keywords: ['permission'] })[0]).toMatch(/keyword: banned word/)
    expect(one({ without: [{ surface: 'view:plan', summary: 'Restricted.' }] })[0]).toMatch(/without: banned/)
    expect(one({ body: [{ p: 'See [x](route:payroll).' }] })[0]).toMatch(/no page "payroll"/)
    expect(one({ body: [{ note: 'See [plan.heads](metric:plan.heads.approved).' }] })[0]).toMatch(
      /reads as an id/,
    )
    expect(one({ group: 'nope' as never })[0]).toMatch(/no group/)
  })

  it('exempts about-server from the banned mode words only, never from the hash words', () => {
    const server = { ...GOOD, id: 'about-server', route: undefined, tour: undefined, metrics: undefined }
    expect(articleProblems({ ...server, summary: 'Modes are not access control.' }, HELP_WORLD)).toEqual([])
    expect(articleProblems({ ...server, summary: 'Checksums are not tamper-proof.' }, HELP_WORLD)[0]).toMatch(
      /tamper-proof/,
    )
    expect(
      articleProblems({ ...server, id: 'faq', summary: 'Modes are not access control.' }, HELP_WORLD)[0],
    ).toMatch(/banned word "access"/)
  })
})

describe('tourProblems', () => {
  const one = (patch: Partial<Tour>) => tourProblems({ ...GOOD_TOUR, ...patch }, HELP_WORLD, HELP_SOURCE)

  it('passes a tour that keeps every rule', () => {
    expect(tourProblems(GOOD_TOUR, HELP_WORLD, HELP_SOURCE)).toEqual([])
    // Figure ids are found where Figure draws them.
    expect(HELP_SOURCE).toContain('data-tour={`figure-$' + '{id}`}')
  })

  it('catches each break, in every wording of a step', () => {
    expect(one({ id: 'view-nope' })).toContain('tour view-nope: not in HELP_TOUR_IDS')
    expect(one({ steps: GOOD_TOUR.steps.slice(0, 3) })[0]).toMatch(/3 steps, not 4 to 6/)
    expect(one({ steps: [...GOOD_TOUR.steps, step(5), step(6), step(7)] })[0]).toMatch(/7 steps/)
    expect(one({ id: 'own-data', route: 'data', steps: [] })[0]).toMatch(/no steps/)
    expect(one({ route: 'forecast' })[0]).toMatch(/is not plan/)
    expect(one({ summary: '' })[0]).toMatch(/summary: empty/)
    expect(one({ length: '' })[0]).toMatch(/length: empty/)
    expect(one({ title: 'Plan Tour' })[0]).toMatch(/capitalized/)
    const broken = (s: object) => one({ steps: [s as never, ...GOOD_TOUR.steps.slice(1)] })[0]
    expect(broken({ ...step(1), target: '.kpi' })).toMatch(/is not \[data-tour/)
    expect(broken({ ...step(1), target: '[data-tour="no-such-target"]' })).toMatch(
      /no element "no-such-target"/,
    )
    expect(broken({ ...step(1), target: '[data-tour="figure-no-such-figure"]' })).toMatch(/no element/)
    expect(broken({ ...step(1), view: undefined, tab: undefined })).toMatch(/"kpi-strip" needs a page/)
    expect(broken({ ...step(1), tab: 'nope' })).toMatch(/no tab "nope"/)
    expect(broken({ ...step(1), title: 'Step One' })).toMatch(/capitalized/)
    expect(broken({ ...step(1), body: 'Go now!' })).toMatch(/exclamation/)
    expect(broken({ ...step(1), body: 'Not access control.' })).toMatch(/banned word "access"/)
    expect(broken({ ...step(1), wording: [{ surface: 'view:team', body: 'Ping your HRBP.' }] })).toMatch(
      /nagging verb/,
    )
    expect(
      broken({ ...step(1), wording: [{ surface: 'view:team', body: 'B', view: 'team', tab: 'nope' }] }),
    ).toMatch(/no tab "nope" in team/)
    expect(
      broken({
        ...step(1),
        wording: [{ surface: 'view:team', body: 'B', target: '[data-tour="nope-target"]' }],
      }),
    ).toMatch(/no element "nope-target"/)
  })

  it('finds a target drawn in an expression, and none that is only a string', () => {
    expect(targetInSource('filter-leader', HELP_SOURCE)).toBe(true)
    expect(targetInSource('masthead-help', HELP_SOURCE)).toBe(true)
    expect(targetInSource('masthead-help', "const x = 'masthead-help'")).toBe(false)
    expect(targetInSource('a-b', "<div data-tour={on ? 'a-b' : undefined} />")).toBe(true)
  })
})

describe('the help content', () => {
  it('passes every check, article by article', () => {
    expect(ARTICLES.map((a) => a.id)).toEqual([...HELP_ARTICLE_IDS])
    expect(ARTICLES.flatMap((a) => articleProblems(a, HELP_WORLD))).toEqual([])
  })

  it('passes every check, tour by tour, with one 4 to 6 step tour per view', () => {
    expect(TOURS.map((t) => t.id)).toEqual([...HELP_TOUR_IDS])
    expect(TOURS.flatMap((t) => tourProblems(t, HELP_WORLD, HELP_SOURCE))).toEqual([])
    for (const v of VIEW_KEYS) {
      const n = tourById(`view-${v}`)?.steps.length ?? 0
      expect(n >= 4 && n <= 6, `view-${v}: ${n} steps`).toBe(true)
    }
  })

  it('names all eight datasets by label in data-loading', () => {
    const text = articleById('data-loading')!.body.flatMap(blockTexts).map(plainText).join(' ')
    expect(DATASET_KEYS).toHaveLength(8)
    for (const k of DATASET_KEYS) expect(text, k).toContain(datasetDef(k).label)
  })

  it('maps every metric to an article that exists, with "Learn more"', () => {
    for (const id of LEARN_MORE_ARTICLES) expect(articleById(id), id).not.toBeNull()
    expect(METRICS.filter((m) => !articleForMetric(m.id)).map((m) => m.id)).toEqual([])
  })
})

describe('glossary and release notes', () => {
  it('has one glossary entry per metric, sorted by term, each where it lives', () => {
    const g = buildGlossary(METRICS)
    expect(g.length).toBe(new Set(METRICS.map((m) => m.id)).size)
    expect(new Set(g.map((e) => e.id)).size).toBe(g.length)
    const terms = g.map((e) => e.term)
    expect(terms).toEqual([...terms].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })))
    expect(g.find((e) => e.id === 'plan.heads.approved')).toMatchObject({ where: 'Plan', view: 'plan' })
    expect(g.find((e) => e.id === 'privacy.anonymity')).toMatchObject({ where: RULE_WHERE, view: 'data' })
    expect(g.find((e) => e.id === 'cost.guard.floorUsd')?.where).toBe(RULE_WHERE)
    // The definitions in force: your wording is the glossary's, and an id repeated keeps its first.
    const mine = buildGlossary([{ ...METRICS[0], definition: 'Mine.' }, ...METRICS])
    expect(mine.find((e) => e.id === METRICS[0].id)?.definition).toBe('Mine.')
    expect(mine.length).toBe(g.length)
  })

  it('keeps APP_VERSION at package.json, and the release notes newest first, dated and plain', () => {
    expect(APP_VERSION).toBe(pkg.version)
    const dates = RELEASE_NOTES.map((r) => r.date)
    expect(dates).toEqual([...dates].sort().reverse())
    for (const r of RELEASE_NOTES) {
      expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(sentenceCaseProblem(r.title), r.title).toBeNull()
      expect(
        [r.title, ...r.items].flatMap((t) => copyProblems(t)),
        r.date,
      ).toEqual([])
    }
  })
})

describe("help's own words (copy.ts)", () => {
  it('keep the copy rules, and every label is sentence case', () => {
    const texts = Object.entries(COPY).map(([k, v]) => [k, typeof v === 'function' ? v('approved heads') : v])
    expect(texts.length).toBeGreaterThan(15)
    for (const [k, t] of texts) {
      expect(typeof t, k).toBe('string')
      expect(copyProblems(t as string), k).toEqual([])
      for (const sentence of (t as string).split(/(?<=[.?])\s+/))
        expect(sentenceCaseProblem(sentence), `${k}: ${sentence}`).toBeNull()
    }
  })
})
