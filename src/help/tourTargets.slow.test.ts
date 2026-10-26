/**
 * Every tour step's anchor exists on its page, in every mode that runs the tour (docs/PLAN.md 14.2),
 * through the whole shell as src/app/routes.slow.test.ts renders it (React markup through
 * renderToStaticMarkup, the node environment, the sample loaded through the stores): for each mode,
 * each tour as the mode runs it (`toursInMode`: its wording, its kept steps) and each step with a
 * target, the step's page (the mode's home for a step on the band) is opened as the tour opens it and
 * the markup must hold `data-tour="<target>"`. A made-up tour shows the check finds a target that is
 * not drawn. Also: "About this view" shows on a page exactly where the mode shows its article, and
 * the welcome line shows on the mode's own home and nowhere else.
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { StateCreator, StoreApi } from 'zustand/vanilla'
import { MemoryStorage } from '@/testkit/memoryStorage'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
/** Server rendering reads a store's server snapshot; here it is the live state (as in routes.slow). */
vi.mock('zustand', async () => {
  const React = await import('react')
  const { createStore } = await import('zustand/vanilla')
  type Api = StoreApi<object>
  const useStore = (api: Api, selector: (s: object) => unknown = (s) => s) =>
    React.useSyncExternalStore(
      api.subscribe,
      () => selector(api.getState()),
      () => selector(api.getState()),
    )
  const create = (createState: StateCreator<object>) => {
    const api: Api = createStore(createState)
    const hook = (selector?: (s: object) => unknown) => useStore(api, selector)
    return Object.assign(hook, api)
  }
  return { create, useStore }
})
vi.stubGlobal('localStorage', new MemoryStorage())
vi.stubGlobal('BroadcastChannel', undefined)
// The chart kit reads the theme's tokens from the page's styles; markup on the server has none.
vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: () => '', colorScheme: 'light' }))
vi.stubGlobal('document', { documentElement: {} })

const { useStore, setSampleSource, homeView } = await import('@/data/store')
const { useMode } = await import('@/access/store')
const { connectAccess } = await import('@/access/connect')
const { MODES } = await import('@/access/modes')
const { routeShown } = await import('@/access/policy')
const { cachedSample, SAMPLE_AS_OF } = await import('@/data/sample')
const { MemoryStore } = await import('@/plan/store/memoryStore')
const { useAnalytics } = await import('@/data/context')
const { VIEW_KEYS } = await import('@/data/schema')
const { App } = await import('@/app/App')
const { startPlan } = await import('@/app/planState')
const { ShellProviders } = await import('@/app/providers')
const { stepShown, toursInMode } = await import('./access')
const { aboutArticle } = await import('./sheet')
const { useHelp } = await import('./store')
const { TOURS, targetName } = await import('./tours')
const { welcomeCopy, welcomeVariantOf } = await import('./welcome')

type Mode = (typeof MODES)[number]
type Access = ReturnType<typeof useAnalytics>['access']
type Step = (typeof TOURS)[number]['steps'][number]

/** The access context the shell builds for a mode. */
function accessOf(mode: Mode): Access {
  useMode.setState({ mode, picking: null })
  let out: Access | null = null
  function Probe() {
    out = useAnalytics().access
    return null
  }
  renderToStaticMarkup(createElement(ShellProviders, null, createElement(Probe)))
  if (!out) throw new Error('no access context')
  return out
}

/** Open a page as a tour step does (replacing the entry), then render the whole app. */
function renderAt(view: string, tab: string): { html: string; route: { view: string; tab: string } } {
  useStore.getState().navigate(view as never, tab, { history: 'replace' })
  const route = { ...useStore.getState().route }
  return { html: renderToStaticMarkup(createElement(App)), route }
}

/** The page a step needs in a mode: its own (in the mode's wording), or the mode's home for the band. */
const pageOf = (s: Step) =>
  s.view ? { view: s.view as string, tab: s.tab ?? '' } : { view: homeView(), tab: '' }

/** Every step target the markup of its page does not hold, as "tour: target on #page". */
function missingTargets(tours: readonly { id: string; steps: readonly Step[] }[]): string[] {
  const pages = new Map<string, { html: string; route: { view: string; tab: string } }>()
  const out: string[] = []
  for (const t of tours)
    for (const s of t.steps) {
      if (!s.target) continue
      const name = targetName(s)
      const page = pageOf(s)
      const key = `${page.view}.${page.tab}`
      let r = pages.get(key)
      if (!r) {
        r = renderAt(page.view, page.tab)
        pages.set(key, r)
      }
      // The step's page is the one shown, not a redirect to the mode's home.
      if (r.route.view !== page.view) out.push(`${t.id}: #${key} opens #${r.route.view}`)
      else if (!name || !r.html.includes(`data-tour="${name}"`))
        out.push(`${t.id}: ${name ?? s.target} on #${key}`)
    }
  return out
}

beforeAll(async () => {
  setSampleSource({ data: () => cachedSample().datasets, asOf: SAMPLE_AS_OF })
  await useStore.getState().init()
  await startPlan(new MemoryStore())
  // Registers the guards (the route guard included) and fills every mode's pick with its persona.
  connectAccess({ notify: () => undefined })
  useHelp.setState({ tour: null, open: false })
}, 120_000)

describe('tour step anchors on their pages', () => {
  for (const mode of MODES) {
    it(`draws every step target of every tour ${mode} mode runs, on the step's page`, () => {
      const access = accessOf(mode)
      const tours = toursInMode(access, TOURS)
      expect(tours.length, mode).toBeGreaterThan(0)
      expect(missingTargets(tours), mode).toEqual([])
    }, 300_000)
  }

  it('finds a target that is not drawn (the check is not vacuous)', () => {
    const access = accessOf('hr-admin')
    const steps: Step[] = [
      { target: '[data-tour="masthead-help"]', title: 'Help', body: 'B' },
      { target: '[data-tour="view-tabs"]', title: 'Tabs', body: 'B', view: 'plan', tab: 'positions' },
      { target: '[data-tour="kpi-strip"]', title: 'Tiles', body: 'B', view: 'plan', tab: 'positions' },
      {
        target: '[data-tour="figure-plan-positions-grid"]',
        title: 'Grid',
        body: 'B',
        view: 'plan',
        tab: 'positions',
      },
      { target: '[data-tour="no-such-target"]', title: 'Nothing', body: 'B', view: 'plan', tab: 'positions' },
    ]
    expect(steps.every((s) => stepShown(access, s))).toBe(true)
    expect(missingTargets([{ id: 'made-up', steps }])).toEqual(['made-up: no-such-target on #plan.positions'])
  }, 300_000)
})

describe('the ways into Help on each page', () => {
  for (const mode of MODES) {
    it(`shows About this view where ${mode} mode shows its article, and the welcome line on its own home only`, () => {
      const access = accessOf(mode)
      const pages = [
        ...VIEW_KEYS.filter((v) => routeShown(mode, v, '')),
        // The masthead pages: the Data room, the Action center and Audit carry "About this page".
        ...(['data', 'actions', 'audit'] as const).filter((p) => routeShown(mode, p, '')),
      ]
      const variant = welcomeVariantOf(mode)
      const title = variant ? welcomeCopy(variant, mode)?.title : undefined
      expect(title, mode).toBeTruthy()
      let homes = 0
      for (const v of pages) {
        const { html, route } = renderAt(v, '')
        expect(route.view, `${mode} ${v}`).toBe(v)
        const about = aboutArticle(access, v, route.tab)
        expect(html.includes('data-tour="about-view"'), `${mode} ${v} about`).toBe(!!about)
        const home = v === homeView()
        if (home) homes++
        expect(html.includes('data-tour="welcome-card"'), `${mode} ${v} welcome`).toBe(home)
        if (home) expect(html, `${mode} ${v}`).toContain(title)
      }
      expect(homes, mode).toBe(1)
    }, 300_000)
  }
})
