/**
 * Help in each mode (the template app's help/access.test.ts, rebuilt for HCP's five modes; PLAN 14.2
 * and 14.3), on the sample's own access contexts (each mode acting as its persona, with its scope)
 * and on the bare policy (no scope): every article and tour is decided in every mode as
 * src/access/ids.ts `HELP_GRID` says; no article, tour, step, block, glossary entry, search result,
 * "About this view" or "Learn more" shows in a mode that hides its surfaces; each shown tour keeps at
 * least 3 steps in every mode, each on a page, figure and condition the mode shows; links to hidden
 * targets read as text and HR admin keeps every link; no shown article or step names a page, tab,
 * control or amount kind the mode hides; the `modes` article ends with `NOT_SECURITY_LONG` and only
 * `about-server` uses a banned word; the home tour and the welcome line fit each mode; and Report a
 * problem names the mode and the unit, never a person, a position or a request ID.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { type AccessContext, accessFor } from '@/access/context'
import { BANNED_MODE_WORDS, BANNED_WORDS_EXEMPT, NOT_SECURITY_LONG } from '@/access/copy'
import { HELP_GRID, VIEW_TABS } from '@/access/ids'
import { HOME_OF, MODE_NAME, MODES, type Mode } from '@/access/modes'
import { decide, routeShown } from '@/access/policy'
import { APP_NAME } from '@/app/brand'
import type { AnalyticsContext } from '@/data/context'
import { PAGE_KEYS, type RouteView, VIEW_KEYS } from '@/data/schema'
import { DEFAULT_FILTERS, type Filters } from '@/data/scope'
import { defaultMetrics } from '@/metrics/api'
import { METRICS } from '@/metrics/catalog'
import { leakSample, personaCtx, personaOf, sampleCtx, withoutRequest } from '@/testkit/sample'
import {
  articleInMode,
  articleShown,
  articlesInMode,
  glossaryEntryInMode,
  glossaryInMode,
  type HelpAccess,
  holds,
  homeTourOf,
  linkShown,
  stepShown,
  tourInMode,
  tourShown,
  toursInMode,
} from './access'
import { ARTICLES, articleById } from './articles'
import { copyProblems } from './check'
import { type DiagnosticState, diagnosticInput, modeLine } from './diagnosticInput'
import { diagnosticText } from './diagnostics'
import { buildGlossary, GLOSSARY_WORDING, type GlossaryEntry } from './glossary'
import { articleLinks, blockTexts, plainText } from './markup'
import { namesHidden } from './names'
import { search } from './search'
import { aboutArticle, articlePage, learnMoreArticle, sheetArticle, sheetHome, sheetIndex } from './sheet'
import { TOURS, tourById } from './tours'
import type { HelpArticle, Tour, TourStep } from './types'
import { type WelcomeVariant, welcomeCopy, welcomeFor } from './welcome'
import { releaseNotesIn } from './whatsNew'

const METRICS_API = defaultMetrics()
const LETTER = { shown: 'S', limited: 'L', hidden: 'H' } as const

/** The bare policy of each mode (no scope held), with the metric dictionary bound. */
const BARE = Object.fromEntries(MODES.map((m) => [m, accessFor(m, null, METRICS_API)])) as Record<
  Mode,
  AccessContext
>

/** The sample in each mode, acting as the mode's persona (its scope held). */
let CTX: Record<Mode, AnalyticsContext>
/** Both readings of each mode: the app's (scope held) and the bare policy's. */
let EVERY: { name: string; mode: Mode; access: HelpAccess }[]

beforeAll(() => {
  CTX = Object.fromEntries(MODES.map((m) => [m, sampleCtx(m)])) as Record<Mode, AnalyticsContext>
  EVERY = MODES.flatMap((m) => [
    { name: `${m} (sample)`, mode: m, access: CTX[m].access },
    { name: `${m} (no scope)`, mode: m, access: BARE[m] },
  ])
}, 120_000)

/** Every route a mode shows: each shown view's shown tabs (and its default), and each shown page. */
function routesOf(mode: Mode): { view: RouteView; tab: string }[] {
  const out: { view: RouteView; tab: string }[] = []
  for (const v of VIEW_KEYS) {
    if (!routeShown(mode, v, '')) continue
    out.push({ view: v, tab: '' })
    for (const t of VIEW_TABS[v]) if (routeShown(mode, v, t.key)) out.push({ view: v, tab: t.key })
  }
  for (const p of PAGE_KEYS)
    if (routeShown(mode, p, '')) {
      out.push({ view: p, tab: '' })
      if (p === 'data')
        for (const t of [
          'quality',
          'metrics',
          'lists',
          'workspace',
          'positions-raw',
          'metrics/plan.heads.approved',
        ])
          out.push({ view: p, tab: t })
    }
  return out
}

/** Every way a step can read: as written, and in each wording. */
function wordings(s: TourStep): TourStep[] {
  return [s, ...(s.wording ?? []).map((w) => ({ ...s, title: w.title ?? s.title, body: w.body }))]
}

/** Every string of an article: title, summary, `without` summaries, blocks and keywords. */
const articleStrings = (a: HelpArticle): string[] => [
  a.title,
  a.summary,
  ...(a.without ?? []).map((w) => w.summary),
  ...a.body.flatMap((b) => blockTexts(b)),
  ...(a.keywords ?? []),
  ...(a.keywordsWhere ?? []).flatMap((k) => k.words),
]

/** Every string of a tour: title, summary, `without` summaries and every step in every wording. */
const tourStrings = (t: Tour): string[] => [
  t.title,
  t.summary,
  ...(t.without ?? []).map((w) => w.summary),
  ...t.steps.flatMap((s) => wordings(s).flatMap((w) => [w.title, w.body])),
]

describe('help decisions', () => {
  it('decide every article and tour in every mode as HELP_GRID says, the sample contexts included', () => {
    for (const [id, letters] of Object.entries(HELP_GRID))
      MODES.forEach((m, i) => {
        expect(LETTER[decide(m, id).access], `${id} ${m}`).toBe(letters[i])
        expect(LETTER[CTX[m].access.decide(id).access], `${id} ${m} (sample)`).toBe(letters[i])
      })
    // Every article and tour has its row.
    for (const a of ARTICLES) expect(HELP_GRID[`help:article:${a.id}`], a.id).toBeDefined()
    for (const t of TOURS) expect(HELP_GRID[`help:tour:${t.id}`], t.id).toBeDefined()
  })
})

describe('no article or tour shows in a mode that hides its surfaces', () => {
  it('keeps every shown article on a page the mode shows, or limited, with only the blocks the mode meets', () => {
    for (const { name, mode, access } of EVERY) {
      for (const a of articlesInMode(access, ARTICLES)) {
        expect(articleShown(access, a.id), `${name} ${a.id}`).toBe(true)
        // Its "Open" button goes only to a page the mode shows; its tour only where the mode runs it.
        const page = articlePage(access, a)
        if (page) expect(routeShown(mode, page.view, page.tab ?? ''), `${name} ${a.id}`).toBe(true)
        if (a.route && !routeShown(mode, a.route.view, a.route.tab ?? ''))
          expect(page, `${name} ${a.id}`).toBeUndefined()
        const tour = tourInMode(access, tourById(a.tour))
        if (tour) expect(tourShown(access, tour.id), `${name} ${a.id} ${tour.id}`).toBe(true)
        for (const b of a.body) expect(holds(access, b), `${name} ${a.id} ${blockTexts(b)[0]}`).toBe(true)
        // Search words about a hidden surface are left out (unless a shown one, or the article, has them too).
        const source = articleById(a.id)!
        const words = new Set(a.keywords ?? [])
        const allowed = new Set([
          ...(source.keywords ?? []),
          ...(source.keywordsWhere ?? []).filter((k) => access.can(k.surface)).flatMap((k) => k.words),
        ])
        for (const k of source.keywordsWhere ?? [])
          for (const w of k.words)
            if (!allowed.has(w)) expect(words.has(w), `${name} ${a.id} ${w}`).toBe(false)
      }
      // A view's article follows its view.
      for (const v of VIEW_KEYS)
        expect(articleShown(access, `view-${v}`), `${name} view-${v}`).toBe(routeShown(mode, v, ''))
    }
  })

  it('runs every shown tour on a page the mode shows, each kept step on a page, figure and control it shows', () => {
    for (const { name, mode, access } of EVERY)
      for (const t of toursInMode(access, TOURS)) {
        expect(tourShown(access, t.id), `${name} ${t.id}`).toBe(true)
        if (t.route) expect(routeShown(mode, t.route, ''), `${name} ${t.id}`).toBe(true)
        for (const s of t.steps) {
          expect(stepShown(access, s), `${name} ${t.id} ${s.title}`).toBe(true)
          expect(holds(access, s), `${name} ${t.id} ${s.title}`).toBe(true)
          expect(s.wording, `${name} ${t.id} ${s.title}`).toBeUndefined()
          if (s.view) expect(routeShown(mode, s.view, s.tab ?? ''), `${name} ${t.id} ${s.title}`).toBe(true)
          const figure = s.target?.match(/^\[data-tour="figure-([^"]+)"\]$/)?.[1]
          if (figure && s.view)
            expect(
              access.can(`figure:${figure}`, { view: s.view, tab: s.tab ?? '' }),
              `${name} ${t.id} ${figure}`,
            ).toBe(true)
        }
      }
    // A hidden tour does not run at all.
    for (const { name, access } of EVERY)
      for (const t of TOURS)
        if (!tourShown(access, t.id)) expect(tourInMode(access, t), `${name} ${t.id}`).toBeNull()
  })

  it('lists, opens and finds nothing the mode hides: the sheet, search, the glossary, About this view, Learn more', () => {
    for (const { name, mode, access } of EVERY) {
      const hidden = ARTICLES.filter((a) => !articleShown(access, a.id))
      for (const route of routesOf(mode)) {
        const home = sheetHome(access, route)
        const where = `${name} #${route.view}.${route.tab}`
        const listed = [home.here, ...home.groups.flatMap((g) => g.articles)].filter(
          (a): a is HelpArticle => !!a,
        )
        for (const a of listed) expect(articleShown(access, a.id), `${where} ${a.id}`).toBe(true)
        for (const t of [home.homeTour, home.pageTour, ...home.tours].filter((t): t is Tour => !!t))
          expect(tourShown(access, t.id), `${where} ${t.id}`).toBe(true)
        const about = aboutArticle(access, route.view, route.tab)
        if (about) expect(articleShown(access, about.id), `${where} about ${about.id}`).toBe(true)
      }
      for (const a of hidden) {
        expect(sheetArticle(access, a.id), `${name} ${a.id}`).toEqual({ article: null, notShown: true })
        for (const v of [...VIEW_KEYS, ...PAGE_KEYS])
          expect(aboutArticle(access, v)?.id, `${name} about ${v}`).not.toBe(a.id)
      }
      const index = sheetIndex(access, METRICS)
      for (const a of hidden)
        expect(
          search(index, a.title, { articles: Infinity }).articles.some((h) => h.article.id === a.id),
          `${name} search ${a.id}`,
        ).toBe(false)
      for (const e of glossaryInMode(access, buildGlossary(METRICS)))
        expect(access.can(`metric:${e.id}`), `${name} ${e.id}`).toBe(true)
      for (const m of METRICS) {
        const id = learnMoreArticle(access, m.id)
        if (id) expect(articleShown(access, id), `${name} learn more ${m.id}`).toBe(true)
      }
    }
  })

  it('is not vacuous: each check meets something a mode hides', () => {
    const manager = CTX.manager.access
    const admin = CTX['hr-admin'].access
    expect(articleShown(manager, 'view-forecast')).toBe(false)
    expect(sheetArticle(manager, 'view-forecast').notShown).toBe(true)
    expect(sheetArticle(admin, 'view-forecast').article?.id).toBe('view-forecast')
    expect(sheetArticle(admin, 'no-such-article')).toEqual({ article: null, notShown: false })
    expect(learnMoreArticle(manager, 'privacy.leaveCounts')).toBeNull()
    expect(learnMoreArticle(CTX.finance.access, 'privacy.leaveCounts')).toBeNull()
    expect(learnMoreArticle(admin, 'privacy.leaveCounts')).toBe('privacy-leave')
    expect(learnMoreArticle(manager, 'plan.heads.approved')).toBe('view-plan')
    expect(aboutArticle(manager, 'data')).toBeNull()
    expect(aboutArticle(admin, 'data')?.id).toBe('view-data')
    expect(aboutArticle(admin, 'data', 'quality')?.id).toBe('data-quality')
    const dataGroup = (a: HelpAccess, view: RouteView) =>
      sheetHome(a, { view, tab: '' })
        .groups.find((g) => g.key === 'data')
        ?.articles.map((x) => x.id) ?? []
    expect(dataGroup(manager, 'team')).not.toContain('data-loading')
    expect(dataGroup(manager, 'team')).toContain('data-workspace-file')
    expect(dataGroup(admin, 'data')).toContain('data-loading')
    // The workspace file article shows everywhere; its Data room button only in HR admin.
    const workspace = articleById('data-workspace-file')!
    expect(articlePage(manager, workspace)).toBeUndefined()
    expect(articlePage(admin, workspace)).toEqual({ view: 'data', tab: 'workspace' })
    expect(glossaryInMode(manager, buildGlossary(METRICS)).length).toBeLessThan(
      glossaryInMode(admin, buildGlossary(METRICS)).length,
    )
    // The pay and leave rule entries go with their articles.
    const ids = (a: HelpAccess) => glossaryInMode(a, buildGlossary(METRICS)).map((e) => e.id)
    expect(ids(manager)).not.toContain('privacy.payAmounts')
    expect(ids(CTX.finance.access)).not.toContain('privacy.leaveCounts')
    expect(ids(admin)).toEqual(expect.arrayContaining(['privacy.payAmounts', 'privacy.leaveCounts']))
  })
})

describe('the tours each mode runs', () => {
  it('keeps at least 3 steps of each shown tour in every mode', () => {
    for (const { name, access } of EVERY)
      for (const t of TOURS) {
        if (!tourShown(access, t.id)) continue
        const run = tourInMode(access, t)
        expect(run, `${name} ${t.id}`).not.toBeNull()
        expect(run?.steps.length ?? 0, `${name} ${t.id}`).toBeGreaterThanOrEqual(3)
      }
  })

  it("starts each mode's own first tour, shown in that mode with at least 3 steps", () => {
    for (const mode of MODES) {
      const id = homeTourOf(mode)
      expect(id, mode).toBe(HOME_OF[mode] === 'data' ? 'getting-started' : 'home-start')
      const run = tourInMode(CTX[mode].access, tourById(id))
      expect(run, mode).not.toBeNull()
      expect(run?.steps.length ?? 0, mode).toBeGreaterThanOrEqual(3)
      // Manager mode's home tour walks My team; the role modes' walk Home.
      const views = new Set(run?.steps.flatMap((s) => (s.view ? [s.view] : [])))
      if (mode === 'manager') expect(views.has('home'), mode).toBe(false)
      if (HOME_OF[mode] === 'home') expect(views.has('team'), mode).toBe(false)
    }
  })
})

describe('links', () => {
  it('read as text where their target is hidden, and HR admin keeps every link it shows', () => {
    let texted = 0
    for (const { name, mode, access } of EVERY)
      for (const a of articlesInMode(access, ARTICLES))
        for (const l of articleLinks(a)) {
          const shown = linkShown(access, l)
          if (l.kind === 'route') {
            const [view, ...tab] = l.target.split('.')
            expect(shown, `${name} ${a.id} ${l.target}`).toBe(routeShown(mode, view, tab.join('.')))
          }
          if (l.kind === 'metric')
            expect(shown, `${name} ${a.id} ${l.target}`).toBe(
              access.can('page:data') && access.can(`metric:${l.target}`),
            )
          if (l.kind === 'article')
            expect(shown, `${name} ${a.id} ${l.target}`).toBe(articleShown(access, l.target))
          if (l.kind === 'tour')
            expect(shown, `${name} ${a.id} ${l.target}`).toBe(tourShown(access, l.target))
          if (l.kind === 'settings')
            expect(shown, `${name} ${a.id} ${l.target}`).toBe(access.can(`settings:${l.target}`))
          if (!shown) texted++
        }
    // Some links do read as text somewhere (the Data room's, outside HR admin).
    expect(texted).toBeGreaterThan(0)
    const admin = CTX['hr-admin'].access
    for (const a of articlesInMode(admin, ARTICLES))
      for (const l of articleLinks(a)) expect(linkShown(admin, l), `${a.id} ${l.target}`).toBe(true)
  })

  it('read a link to a hidden page as text, on made-up links', () => {
    const forecast = { kind: 'route' as const, target: 'forecast.bridge', label: 'Forecast' }
    expect(linkShown(CTX.manager.access, forecast)).toBe(false)
    expect(linkShown(CTX.finance.access, forecast)).toBe(true)
    const metric = { kind: 'metric' as const, target: 'plan.heads.approved', label: 'Approved heads' }
    expect(linkShown(CTX.finance.access, metric)).toBe(false)
    expect(linkShown(CTX['hr-admin'].access, metric)).toBe(true)
  })
})

describe('names', () => {
  it('no article or tour step a mode shows names a page, tab, control or amount kind it hides', () => {
    const found: string[] = []
    for (const { access } of EVERY) {
      for (const a of articlesInMode(access, ARTICLES)) {
        found.push(...namesHidden(access, `${a.id} title`, a.title))
        found.push(...namesHidden(access, `${a.id} summary`, a.summary))
        for (const b of a.body) for (const t of blockTexts(b)) found.push(...namesHidden(access, a.id, t))
      }
      for (const t of toursInMode(access, TOURS)) {
        found.push(...namesHidden(access, `tour ${t.id} summary`, t.summary))
        for (const s of t.steps) found.push(...namesHidden(access, `tour ${t.id}`, `${s.title}. ${s.body}`))
      }
    }
    expect([...new Set(found)]).toEqual([])
  })

  it('is not vacuous: the check finds a hidden name in made-up text', () => {
    expect(namesHidden(CTX.manager.access, 'x', 'Open Forecast > Bridge.')).toHaveLength(2)
    expect(namesHidden(CTX.manager.access, 'x', 'The loaded cost of a seat.')).toEqual([
      'manager | x | loaded cost',
    ])
    expect(namesHidden(CTX.finance.access, 'x', 'Two people on leave.')).toEqual(['finance | x | on leave'])
    expect(
      namesHidden(CTX['hr-admin'].access, 'x', 'Open Forecast > Bridge, on leave, loaded cost.'),
    ).toEqual([])
  })
})

describe('copy', () => {
  it('ends the modes article with NOT_SECURITY_LONG, and its mode text uses no banned word', () => {
    const modes = articleById('modes')!
    const last = modes.body.at(-1)
    expect(last && 'p' in last ? last.p : null).toBe(NOT_SECURITY_LONG)
    for (const { name, access } of EVERY) {
      const a = articleInMode(access, modes)
      expect(a.body.at(-1), name).toEqual(last)
      const text = articleStrings(a).map(plainText).join(' ').toLowerCase()
      for (const w of BANNED_MODE_WORDS) expect(text.includes(w), `${name} ${w}`).toBe(false)
    }
  })

  it('lets only about-server use a banned word, and it does; no tour is exempt', () => {
    expect(BANNED_WORDS_EXEMPT.articles).toEqual(['about-server'])
    for (const mode of MODES) expect(articleShown(CTX[mode].access, 'about-server'), mode).toBe(true)
    const server = articleStrings(articleById('about-server')!).map(plainText).join(' ').toLowerCase()
    expect(BANNED_MODE_WORDS.some((w) => server.includes(w))).toBe(true)
    // The exemption is the banned mode words only: the rest of the copy rules hold there too.
    expect(
      articleStrings(articleById('about-server')!).flatMap((t) => copyProblems(t, { exempt: true })),
    ).toEqual([])
    for (const a of ARTICLES)
      if (a.id !== 'about-server')
        expect(
          articleStrings(a).flatMap((t) => copyProblems(t)),
          a.id,
        ).toEqual([])
    for (const t of TOURS)
      expect(
        tourStrings(t).flatMap((x) => copyProblems(x)),
        t.id,
      ).toEqual([])
  })
})

describe('the welcome line', () => {
  const VARIANTS: readonly WelcomeVariant[] = ['admin', 'team', 'home']

  it("sits on each mode's own home only, starts the mode's first tour, and reads as each mode's", () => {
    for (const mode of MODES) {
      const lines = VARIANTS.filter((v) => welcomeCopy(v, mode))
      const own: WelcomeVariant =
        HOME_OF[mode] === 'data' ? 'admin' : HOME_OF[mode] === 'team' ? 'team' : 'home'
      expect(lines, mode).toEqual([own])
      const copy = welcomeCopy(own, mode)!
      expect(copy.line, mode).toBe(mode)
      expect(copy.tour, mode).toBe(homeTourOf(mode))
      expect(tourShown(CTX[mode].access, copy.tour), mode).toBe(true)
      expect([...copyProblems(copy.title), ...copyProblems(copy.take)], mode).toEqual([])
    }
    expect(welcomeCopy('admin', 'hr-admin')).toMatchObject({
      title: `New to ${APP_NAME}?`,
      take: 'Take the 2-minute tour',
      tour: 'getting-started',
    })
    expect(welcomeCopy('team', 'manager')).toMatchObject({ title: 'New to My team?', tour: 'home-start' })
    for (const mode of ['hrbp', 'leader', 'finance'] as const)
      expect(welcomeCopy('home', mode), mode).toMatchObject({
        title: `New to ${MODE_NAME[mode]} mode?`,
        take: 'Take the 1-minute tour',
        tour: 'home-start',
      })
    expect(welcomeCopy('home', undefined)).toBeNull()
  })

  it('shows only where the page is drawn in the live mode', () => {
    // An off-screen render of the Finance home while HR admin is live: no line.
    expect(welcomeFor('home', 'finance', 'hr-admin')).toBeNull()
    expect(welcomeFor('home', 'finance', 'finance')?.title).toBe('New to Finance mode?')
    expect(welcomeFor('admin', 'hr-admin', 'manager')).toBeNull()
    // Outside the provider, the live mode decides.
    expect(welcomeFor('team', undefined, 'manager')?.line).toBe('manager')
    expect(welcomeFor('team', undefined, 'leader')).toBeNull()
  })
})

describe('Report a problem', () => {
  const state = (ctx: AnalyticsContext, filters: Filters = ctx.filters): DiagnosticState => ({
    route: { view: HOME_OF[ctx.access.mode], tab: '' },
    filters,
    dataStandard: 'bronze',
    asOfOverride: null,
    showPay: false,
    theme: 'system',
    textSize: 'md',
    motion: 'system',
    storageUnavailable: false,
    readOnly: false,
  })
  const env = {
    hash: '#home?leader=P1&dept=Design+Verification',
    browser: 'Test browser',
    windowSize: '1440 × 900 px',
    at: '2026-10-24T10:00:00.000Z',
    lensOn: false,
  }
  const report = (ctx: AnalyticsContext, filters?: Filters) =>
    diagnosticText(diagnosticInput(ctx, state(ctx, filters), env))

  it('names the mode and the unit, never a person, a position or a request ID, in every mode', () => {
    const s = leakSample()
    const names = [...new Set(s.datasets.workers.flatMap((w) => (w.name ? [w.name] : [])))]
    const positions = [...new Set(s.datasets.positions.map((p) => p.positionId))]
    const requests = [
      ...new Set([
        ...s.datasets.requests.map((r) => r.requestId),
        ...s.plan.requests.map((r) => r.requestId),
      ]),
    ]
    expect(names.length).toBeGreaterThan(100)
    for (const mode of MODES) {
      const ctx = CTX[mode]
      const text = report(ctx)
      expect(text.split('\n'), mode).toContain(modeLine(ctx.access))
      for (const n of names) expect(text.includes(n), `${mode} ${n}`).toBe(false)
      for (const p of positions) expect(new RegExp(`\\b${p}\\b`).test(text), `${mode} ${p}`).toBe(false)
      for (const r of requests) expect(text.includes(r), `${mode} ${r}`).toBe(false)
      expect(text).not.toContain('Design Verification')
    }
    expect(report(CTX.manager)).toContain('Mode: Manager (manager set, name left out)')
    expect(report(CTX.leader)).toContain('Mode: Leader (leader set, name left out)')
    const unit = CTX.hrbp.access.scope?.kind === 'unit' ? CTX.hrbp.access.scope.unit : null
    expect(unit).toBeTruthy()
    expect(report(CTX.hrbp)).toContain(`Mode: HRBP (${unit})`)
    expect(report(CTX.finance)).toContain('Mode: Finance')
    expect(report(CTX['hr-admin'])).toContain('Mode: HR admin')
    // A scoped mode with no pick names nobody.
    expect(modeLine(accessFor('manager'))).toBe('Mode: Manager (no manager set)')
    expect(modeLine(accessFor('hrbp', null, null, true))).toBe('Mode: HRBP (no unit set)')
  })

  it('reports a leader filter as set and other filters as counts, never their values', () => {
    const s = leakSample()
    const leader = personaOf(s, 'leader-svp-se')
    const filters: Filters = {
      ...DEFAULT_FILTERS,
      leaderId: leader.positionId,
      department: [leader.department],
    }
    const ctx = sampleCtx('hr-admin', { filters })
    const text = report(ctx, filters)
    expect(text).toContain('leader set (name left out)')
    expect(text).toContain('department: 1 value')
    expect(text).not.toContain(leader.name)
    expect(text).not.toContain(leader.positionId)
    expect(text).not.toContain(leader.department)
  })

  it("gives Manager C the same report with and without the confidential Elimination of C's seat", () => {
    const s = leakSample()
    const without = withoutRequest(s, s.planted.managerCElimination).sample
    const withIt = report(personaCtx('manager-c'))
    expect(report(personaCtx('manager-c', { sample: without }))).toBe(withIt)
    // HR admin's report counts the requests file's rows, so it does move (the control).
    expect(report(sampleCtx('hr-admin', { sample: without }))).not.toBe(report(CTX['hr-admin']))
    // Row counts are HR admin's only.
    expect(withIt).toContain('Datasets (source, tier):')
    expect(report(CTX['hr-admin'])).toContain('Datasets (source, rows, tier):')
  })
})

describe('M4 review: the glossary in each mode (HL-8)', () => {
  const entryText = (e: GlossaryEntry) => [e.term, e.definition, e.formula ?? '', e.where].join('\n')
  const ids = (a: HelpAccess) => glossaryInMode(a, buildGlossary(METRICS)).map((e) => e.id)
  const entry = (a: HelpAccess, id: string) =>
    glossaryInMode(a, buildGlossary(METRICS)).find((e) => e.id === id) ?? null

  it('names nothing a mode hides in any glossary entry: term, definition, formula or where it lives', () => {
    const found: string[] = []
    for (const { name, access } of EVERY)
      for (const e of glossaryInMode(access, buildGlossary(METRICS)))
        found.push(...namesHidden(access, `glossary ${e.id}`, entryText(e)).map((x) => `${name}: ${x}`))
    expect(found).toEqual([])
    // Not vacuous: the catalog's own words name what Manager and HR admin hide.
    const raw = (a: HelpAccess) =>
      buildGlossary(METRICS)
        .filter((e) => a.can(`metric:${e.id}`))
        .flatMap((e) => namesHidden(a, `glossary ${e.id}`, entryText(e)))
    expect(raw(CTX.manager.access).length).toBeGreaterThan(3)
    expect(raw(CTX['hr-admin'].access).length).toBeGreaterThan(3)
    expect(raw(CTX.finance.access).length).toBeGreaterThan(0)
  })

  it('reads a definition in the mode’s own words, the edited one as written, and leaves out what still names a hidden thing', () => {
    const manager = CTX.manager.access
    const weight = entry(manager, 'plan.trade.weight')
    expect(weight?.definition).toBe(GLOSSARY_WORDING['plan.trade.weight'][0].definition)
    expect(weight?.definition).not.toContain('band estimate')
    expect(weight?.formula).not.toContain('band estimate')
    expect(entry(CTX.hrbp.access, 'plan.trade.weight')?.definition).toContain('band estimate')
    expect(entry(manager, 'requests.cycle.asks')?.definition).not.toContain('band estimate')
    expect(entry(CTX.hrbp.access, 'privacy.payAmounts')?.definition).not.toContain('Show pay amounts')
    expect(entry(CTX['hr-admin'].access, 'privacy.payAmounts')?.definition).toContain('Show pay amounts')
    // An edited definition reads as written; one that names a hidden thing is left out.
    const base = METRICS.find((m) => m.id === 'plan.trade.weight')!
    const mine = buildGlossary([{ ...base, definition: 'A seat’s weight in standard heads.' }])[0]
    expect(mine.edited).toEqual(['definition'])
    expect(glossaryEntryInMode(manager, mine)?.definition).toBe('A seat’s weight in standard heads.')
    expect(glossaryEntryInMode(manager, mine)?.formula).toBe(GLOSSARY_WORDING['plan.trade.weight'][0].formula)
    const named = buildGlossary([{ ...base, definition: 'Its band estimate over the standard head.' }])[0]
    expect(glossaryEntryInMode(manager, named)).toBeNull()
    expect(glossaryEntryInMode(CTX.hrbp.access, named)?.definition).toBe(
      'Its band estimate over the standard head.',
    )
    // Asks above the cut line: Manager mode never shows the cut line, so the entry is out.
    expect(ids(manager)).not.toContain('requests.cycle.aboveCut')
    expect(ids(CTX.finance.access)).toContain('requests.cycle.aboveCut')
  })

  it('leaves the cost guard’s rules out where no amount shows, and lists each entry on a page the mode shows', () => {
    for (const { name, mode, access } of EVERY) {
      const cost = ids(access).filter((id) => id.startsWith('cost.guard.'))
      if (access.can('cost:band')) expect(cost.length, name).toBeGreaterThan(0)
      else expect(cost, name).toEqual([])
      for (const e of glossaryInMode(access, buildGlossary(METRICS)))
        if (e.where && e.where !== 'Privacy rule')
          expect(routeShown(mode, e.view as RouteView, ''), `${name} ${e.id} ${e.where}`).toBe(true)
    }
    expect(entry(CTX['hr-admin'].access, 'team.allocation.heads')?.where).toBe('')
    expect(entry(CTX.manager.access, 'team.allocation.heads')?.where).toBe('My team')
    expect(entry(CTX.manager.access, 'targets.gap.heads')?.where).toBe('Requests')
    expect(entry(CTX.finance.access, 'targets.gap.heads')?.where).toBe('Targets')
  })
})

describe('M4 review: Manager and Finance never read the word "leave" (HL-12, CONTRACTS-M4 8.3)', () => {
  const LEAVE = /\bleav(e|es|ing)\b/i
  /** Everything a mode reads in help: articles, tours and the release notes. */
  function read(access: HelpAccess): { where: string; text: string }[] {
    return [
      ...articlesInMode(access, ARTICLES).flatMap((a) => [
        { where: `${a.id} title`, text: a.title },
        { where: `${a.id} summary`, text: a.summary },
        ...a.body.flatMap((b) => blockTexts(b).map((t) => ({ where: a.id, text: plainText(t) }))),
      ]),
      ...toursInMode(access, TOURS).flatMap((t) => [
        { where: `tour ${t.id}`, text: `${t.title}. ${t.summary}` },
        ...t.steps.map((s) => ({
          where: `tour ${t.id} ${s.title}`,
          text: `${s.title}. ${plainText(s.body)}`,
        })),
      ]),
      ...releaseNotesIn(access).flatMap((n) =>
        [n.title, ...n.items].map((text) => ({ where: `whats-new ${n.date}`, text })),
      ),
      // The glossary too (its Definitions list and Metric definitions read it), in the mode's words.
      ...glossaryInMode(access, buildGlossary(METRICS)).flatMap((e) =>
        [e.term, e.definition, e.formula ?? '', e.where].map((text) => ({ where: `glossary ${e.id}`, text })),
      ),
    ]
  }

  it('finds no "leave", "leaves" or "leaving" in what Manager or Finance mode reads', () => {
    const found: string[] = []
    for (const { name, mode, access } of EVERY) {
      if (mode !== 'manager' && mode !== 'finance') continue
      for (const x of read(access)) if (LEAVE.test(x.text)) found.push(`${name} ${x.where}: ${x.text}`)
    }
    expect(found).toEqual([])
  })

  it('is not vacuous: the modes that show leave read the word', () => {
    for (const mode of ['hrbp', 'leader', 'hr-admin'] as const)
      expect(
        read(CTX[mode].access).some((x) => LEAVE.test(x.text)),
        mode,
      ).toBe(true)
  })
})

describe('M4 review: Report a problem says what its summary holds in each mode (HL-6)', () => {
  it('names dataset row counts in the article exactly where the summary carries them', () => {
    const env = {
      hash: '#home',
      browser: 'Test browser',
      windowSize: '1440 × 900 px',
      at: '2026-10-24T10:00:00.000Z',
      lensOn: false,
    }
    for (const mode of MODES) {
      const ctx = CTX[mode]
      const summary = diagnosticText(
        diagnosticInput(
          ctx,
          {
            route: { view: HOME_OF[mode], tab: '' },
            filters: ctx.filters,
            dataStandard: 'bronze',
            asOfOverride: null,
            showPay: false,
            theme: 'system',
            textSize: 'md',
            motion: 'system',
            storageUnavailable: false,
            readOnly: false,
          },
          env,
        ),
      )
      const article = articleInMode(ctx.access, articleById('report-problem')!)
      const text = article.body.flatMap((b) => blockTexts(b)).join('\n')
      const rows = summary.includes('Datasets (source, rows, tier):')
      expect(rows || summary.includes('Datasets (source, tier):'), mode).toBe(true)
      expect(text.includes('rows and tier'), mode).toBe(rows)
      expect(text.includes('(the sample or a file) and tier'), mode).toBe(!rows)
    }
  })
})
