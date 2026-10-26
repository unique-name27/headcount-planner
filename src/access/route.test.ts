/**
 * Routes in every mode (docs/PLAN.md 8.3 and 16.2; the template app's route.test): `routeDecision`
 * leaves shown routes alone, sends a hidden view or page to the mode's home and a hidden tab to the
 * view's first shown tab, for every one of the five modes and every route and tab (deep addresses
 * included). The expected answer is read from the plan's grid (`PLAN_GRID`, 8.3's letters), not from
 * the tables. Then, with the data store and the mode connection: `navigate` lands where the guard
 * sends it and says why, a scoped mode waiting for its pick shows only its home, and the as-of date
 * moves only in HR admin.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { cachedSample, SAMPLE_AS_OF } from '@/data/sample'
import { DATASET_KEYS, type DatasetKey, PAGE_KEYS, type RouteView, VIEW_KEYS } from '@/data/schema'
import type { Route, SourceMeta } from '@/data/store'
import { MemoryStorage } from '@/testkit/memoryStorage'
import { DATA_TABS, PLAN_GRID, VIEW_TABS } from './ids'
import { HOME_LABEL, HOME_OF, homeOf, MODES, type Mode, NO_PICKS } from './modes'
import { can, routeDecision, routeShown } from './policy'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
vi.stubGlobal('localStorage', new MemoryStorage())

const tabsOf = (view: RouteView): string[] => {
  if (view === 'data') return ['', ...DATA_TABS.map((t) => t.key), 'datasets:positions-raw']
  if ((PAGE_KEYS as readonly string[]).includes(view)) return ['', 'open']
  return ['', ...VIEW_TABS[view as keyof typeof VIEW_TABS].map((t) => t.key)]
}

/** Every route an address can name, with each tab, plus deep addresses. */
const ROUTES: Route[] = [
  ...[...VIEW_KEYS, ...PAGE_KEYS].flatMap((view) => tabsOf(view).map((tab) => ({ view, tab }))),
  { view: 'finance', tab: 'assumptions:trade-rates' },
  { view: 'plan', tab: 'positions:P-1001' },
  { view: 'requests', tab: 'unknown' },
]

const idx = (m: Mode) => MODES.indexOf(m)
/** The plan's letter for a surface in a mode. */
const letter = (id: string, m: Mode): string => PLAN_GRID[id]?.[idx(m)] ?? '?'
const placeLetter = (view: string, m: Mode) =>
  letter((PAGE_KEYS as readonly string[]).includes(view) ? `page:${view}` : `view:${view}`, m)

/** What 8.3 says each mode does with a route, read from the plan's letters. */
function expected(mode: Mode, r: Route): Route {
  if (placeLetter(r.view, mode) === 'H') return r.view === HOME_OF[mode] ? r : homeOf(mode)
  if ((PAGE_KEYS as readonly string[]).includes(r.view) || !r.tab) return r
  const tabs = VIEW_TABS[r.view as keyof typeof VIEW_TABS]
  const base = r.tab.split(/[:/]/)[0]
  const named = tabs.find((t) => t.key === base)
  if (!named) return r
  if (letter(`tab:${r.view}.${named.key}`, mode) !== 'H') return r
  return { view: r.view, tab: tabs.find((t) => letter(`tab:${r.view}.${t.key}`, mode) !== 'H')?.key ?? '' }
}

describe('routeDecision', () => {
  for (const mode of MODES)
    it(`in ${mode} mode follows the plan's grid for every route and tab`, () => {
      for (const r of ROUTES) {
        const d = routeDecision(mode, r)
        const at = `${mode} #${r.view}.${r.tab}`
        expect(d.route, at).toEqual(expected(mode, r))
        expect(d.redirected, at).toBe(d.route.view !== r.view || d.route.tab !== r.tab)
        if (d.redirected) {
          expect(d.reason?.title, at).toMatch(/ is not shown in .+ mode$/)
          expect(d.reason?.description, at).toMatch(/^Headcount Planner opened .+ instead\.$/)
          expect(routeShown(mode, d.route.view, d.route.tab), at).toBe(true)
        } else if (r.view !== HOME_OF[mode]) expect(routeShown(mode, r.view, r.tab), at).toBe(true)
      }
    })

  it('never redirects a mode away from its own home', () => {
    for (const mode of MODES) {
      expect(routeDecision(mode, homeOf(mode)).redirected, mode).toBe(false)
      expect(routeShown(mode, HOME_OF[mode]), mode).toBe(true)
    }
    expect(HOME_OF).toEqual({
      manager: 'team',
      hrbp: 'home',
      leader: 'home',
      finance: 'home',
      'hr-admin': 'data',
    })
  })

  it('words the redirects as the plan does', () => {
    expect(routeDecision('manager', { view: 'forecast', tab: 'bridge' })).toEqual({
      route: { view: 'team', tab: '' },
      redirected: true,
      reason: {
        title: 'Forecast is not shown in Manager mode',
        description: 'Headcount Planner opened My team instead.',
      },
    })
    expect(routeDecision('hr-admin', { view: 'home', tab: '' }).reason).toEqual({
      title: 'Home is not shown in HR admin mode',
      description: 'Headcount Planner opened the Data room instead.',
    })
    expect(routeDecision('hrbp', { view: 'data', tab: 'lists' }).reason?.title).toBe(
      'The Data room is not shown in HRBP mode',
    )
    expect(routeDecision('hrbp', { view: 'finance', tab: 'export' })).toEqual({
      route: { view: 'finance', tab: 'versions' },
      redirected: true,
      reason: {
        title: 'Finance, Export is not shown in HRBP mode',
        description: 'Headcount Planner opened Versions instead.',
      },
    })
    expect(routeDecision('finance', { view: 'plan', tab: 'transfers' }).route).toEqual({
      view: 'plan',
      tab: 'overview',
    })
    expect(routeDecision('manager', { view: 'requests', tab: 'queue' }).route).toEqual({
      view: 'requests',
      tab: 'new',
    })
    expect(routeDecision('leader', { view: 'finance', tab: 'assumptions:trade-rates' }).route).toEqual(
      homeOf('leader'),
    )
    expect(routeDecision('hrbp', { view: 'finance', tab: 'assumptions:trade-rates' }).redirected).toBe(false)
    expect(routeDecision('manager', { view: 'audit', tab: '' }).reason?.title).toBe(
      'Audit is not shown in Manager mode',
    )
    // The Action center opens in every mode (limited per mode).
    for (const mode of MODES)
      expect(routeDecision(mode, { view: 'actions', tab: '' }).redirected, mode).toBe(false)
    for (const mode of MODES) expect(HOME_LABEL[mode].length, mode).toBeGreaterThan(0)
  })

  it('lets only HR admin move the as-of date (settings:data)', () => {
    for (const mode of MODES) expect(can(mode, 'settings:data'), mode).toBe(mode === 'hr-admin')
  })
})

/* ───────── with the data store and the mode connection ───────── */

type Store = typeof import('@/data/store')
type Modes = typeof import('./store')
type Connect = typeof import('./connect')
let S: Store
let M: Modes
let C: Connect
let stop: () => void = () => undefined
const notices: { title: string; description?: string; action?: { label: string } }[] = []

beforeAll(async () => {
  S = await import('@/data/store')
  M = await import('./store')
  C = await import('./connect')
  const sample = cachedSample()
  S.setSampleSource({ data: () => sample.datasets, asOf: SAMPLE_AS_OF })
  const sources = Object.fromEntries(
    DATASET_KEYS.map((k) => [k, { kind: 'sample', rowCount: sample.datasets[k].length }]),
  ) as Record<DatasetKey, SourceMeta>
  S.useStore.setState({ data: sample.datasets, sources, ready: true })
  stop = C.connectAccess({ notify: (n) => notices.push(n) })
}, 60_000)

afterAll(() => {
  stop()
  vi.unstubAllGlobals()
})

const route = () => S.useStore.getState().route

describe('navigate through the route guard', () => {
  it('opens a hidden page on the mode home and says why, with Change mode', () => {
    M.useMode.getState().setMode('manager')
    expect(M.useMode.getState().mode).toBe('manager')
    S.useStore.getState().navigate('forecast', 'overview', { history: 'push' })
    expect(route()).toEqual({ view: 'team', tab: '' })
    expect(notices.at(-1)).toMatchObject({
      title: 'Forecast is not shown in Manager mode',
      description: 'Headcount Planner opened My team instead.',
      action: { label: 'Change mode' },
    })
    S.useStore.getState().navigate('plan', 'overview')
    expect(route()).toEqual({ view: 'plan', tab: 'positions' })
    S.useStore.getState().navigate('plan', 'openings')
    expect(route()).toEqual({ view: 'plan', tab: 'openings' })
  })

  it('moves a hidden route home when the mode changes', () => {
    M.useMode.getState().setMode('hr-admin')
    S.useStore.getState().navigate('data', 'lists')
    expect(route()).toEqual({ view: 'data', tab: 'lists' })
    M.useMode.getState().setMode('finance')
    expect(route()).toEqual(homeOf('finance'))
    M.useMode.getState().setMode('hr-admin')
  })

  it('shows a scoped mode only its home while its pick is to be made', () => {
    const picks = M.useMode.getState().actingAs
    M.useMode.setState({ actingAs: { ...picks, leader: { personId: 'E99999', name: 'Nobody Here' } } })
    M.useMode.getState().setMode('leader')
    expect(M.useMode.getState().mode).toBe('leader')
    expect(C.waitingForPick('leader')).toBe(true)
    expect(route()).toEqual(homeOf('leader'))
    expect(M.useMode.getState().picking).toBe('leader')
    expect(M.useMode.getState().pickNote).toBe(
      'Nobody Here is not in the loaded data for this mode. Pick again.',
    )
    S.useStore.getState().navigate('plan', 'positions')
    expect(route()).toEqual(homeOf('leader'))
    // Nothing picked at all: the picker opens and the mode stays as it was.
    M.useMode.setState({ mode: 'hr-admin', actingAs: { ...NO_PICKS }, picking: null })
    M.useMode.getState().setMode('hrbp')
    expect(M.useMode.getState().mode).toBe('hr-admin')
    expect(M.useMode.getState().picking).toBe('hrbp')
    M.useMode.setState({ actingAs: picks, picking: null })
  })
})
