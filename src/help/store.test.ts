/**
 * The help store (the template app's help/store.test.ts) with the stores and the address writer
 * (`followStores`) connected: every open starts from a clean search; a tour closes the records panel
 * and Settings, puts the page and the filters back when it ends, and adds nothing to the history
 * (each of its moves replaces the entry on screen); each mode's welcome line is dismissed on its own
 * and ends with that mode's own first tour, in that mode only; another tab's change is read back.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AddressIntent } from '@/data/address'
import { MemoryStorage } from '@/testkit/memoryStorage'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))

const storage = new MemoryStorage()
const win = Object.assign(new EventTarget(), { scrollTo: () => undefined })
vi.stubGlobal('localStorage', storage)
vi.stubGlobal('window', win)
vi.stubGlobal('BroadcastChannel', undefined)

type Mods = {
  store: typeof import('@/data/store')
  address: typeof import('@/app/address')
  help: typeof import('./store')
  access: typeof import('./access')
  open: typeof import('./tour/open')
  mode: typeof import('@/access/store')
  drill: typeof import('@/drill/store')
  settings: typeof import('@/app/settings/store')
  context: typeof import('@/access/context')
  modes: typeof import('@/access/modes')
}
let m: Mods
const writes: (AddressIntent | null)[] = []
let stop: () => void = () => undefined
const take = () => writes.splice(0)

beforeAll(async () => {
  m = {
    store: await import('@/data/store'),
    address: await import('@/app/address'),
    help: await import('./store'),
    access: await import('./access'),
    open: await import('./tour/open'),
    mode: await import('@/access/store'),
    drill: await import('@/drill/store'),
    settings: await import('@/app/settings/store'),
    context: await import('@/access/context'),
    modes: await import('@/access/modes'),
  }
  await m.store.useStore.getState().init()
  stop = m.address.followStores((intent) => writes.push(intent))
}, 60_000)

afterAll(() => {
  stop()
  vi.unstubAllGlobals()
})

beforeEach(() => {
  m.help.useHelp.setState({
    open: false,
    tour: null,
    query: '',
    articleId: null,
    prefs: m.help.DEFAULT_PREFS,
  })
  storage.removeItem(m.help.HELP_STORAGE_KEY)
})

describe('the Help sheet', () => {
  it('starts every open from a clean search', () => {
    const { openHelp, closeHelp, useHelp } = m.help
    openHelp()
    useHelp.getState().setQuery('approved heads')
    expect(useHelp.getState().query).toBe('approved heads')
    closeHelp()
    expect(useHelp.getState().open).toBe(false)
    openHelp()
    expect(useHelp.getState().query).toBe('')
  })

  it('opening an article ("Learn more", "About this view") clears an old search, and says why when asked', () => {
    const { openHelp, closeHelp, useHelp } = m.help
    openHelp()
    useHelp.getState().setQuery('forecast')
    closeHelp()
    const before = useHelp.getState().nonce
    openHelp('view-plan')
    const s = useHelp.getState()
    expect(s).toMatchObject({ open: true, articleId: 'view-plan', query: '', notice: null })
    expect(s.nonce).toBe(before + 1)
    openHelp(null, 'That tour is not shown in this mode.')
    expect(useHelp.getState()).toMatchObject({
      articleId: null,
      notice: 'That tour is not shown in this mode.',
    })
    // A search goes back to the results list.
    useHelp.getState().showArticle('glossary')
    useHelp.getState().setQuery('heads')
    expect(useHelp.getState().articleId).toBeNull()
  })
})

describe('a tour', () => {
  it('closes the records panel and Settings, and puts the page and the filters back, with no history entry', () => {
    const st = m.store.useStore
    st.getState().navigate('plan', 'openings', { history: 'push' })
    st.getState().setFilters({ department: ['Design Verification'] }, { history: 'push' })
    take()
    m.drill.useDrillStore.setState({ stack: [{ type: 'position', positionId: 'P1' }] })
    m.settings.openSettings('display')
    m.mode.useMode.setState({ mode: 'hr-admin' })

    m.help.openHelp()
    m.help.startTour('view-forecast')
    const run = m.help.useHelp.getState().tour!
    expect(run).toMatchObject({
      id: 'view-forecast',
      index: 0,
      from: { view: 'plan', tab: 'openings' },
      mode: 'hr-admin',
    })
    expect(run.filters.department).toEqual(['Design Verification'])
    expect(m.help.useHelp.getState().open).toBe(false)
    expect(m.drill.useDrillStore.getState().stack).toEqual([])
    expect(m.settings.useSettingsSheet.getState().open).toBe(false)
    // Starting a tour moves nothing.
    expect(take()).toEqual([])

    // The tour opens its steps' pages: each move replaces the entry on screen.
    const access = m.context.accessFor('hr-admin')
    m.open.openStepPage(access, { title: 'T', body: 'B', view: 'forecast', tab: 'variance' })
    expect(st.getState().route).toEqual({ view: 'forecast', tab: 'variance' })
    m.open.openStepPage(access, { title: 'T', body: 'B', view: 'forecast', tab: 'bridge' })
    // A step already on its page moves nothing; one without a page neither.
    m.open.openStepPage(access, { title: 'T', body: 'B', view: 'forecast', tab: 'bridge' })
    m.open.openStepPage(access, { title: 'T', body: 'B', view: 'forecast' })
    m.open.openStepPage(access, { title: 'T', body: 'B', target: '[data-tour="masthead-help"]' })
    expect(take()).toEqual(['replace', 'replace'])

    // The reader changes a filter mid-tour; the end puts it back with the page.
    st.getState().setFilters({ department: [], location: ['Hsinchu'] }, { history: 'replace' })
    take()
    m.help.useHelp.getState().goToStep(3)
    expect(m.help.useHelp.getState().tour?.index).toBe(3)
    m.help.useHelp.getState().endTour('skip')
    expect(st.getState().route).toEqual({ view: 'plan', tab: 'openings' })
    expect(st.getState().filters.department).toEqual(['Design Verification'])
    expect(st.getState().filters.location).toEqual([])
    const ended = take()
    expect(ended.length).toBeGreaterThan(0)
    expect(ended.every((w) => w === 'replace')).toBe(true)
    expect(m.help.useHelp.getState()).toMatchObject({
      tour: null,
      lastEnded: { id: 'view-forecast', how: 'skip' },
    })
    // A skipped tour is not finished.
    expect(m.help.useHelp.getState().prefs.completed).toEqual([])
    // Ending again does nothing.
    m.help.useHelp.getState().endTour('done')
    expect(take()).toEqual([])
  })

  it('reads the tab a step lands on in the mode: Manager mode opens Plan on Positions', () => {
    const manager = m.context.accessFor('manager')
    const admin = m.context.accessFor('hr-admin')
    expect(m.open.landedTab(manager, 'plan', '')).toBe('positions')
    expect(m.open.landedTab(admin, 'plan', '')).toBe('overview')
    expect(m.open.landedTab(admin, 'finance', 'assumptions:trade-rates')).toBe('assumptions')
    const step = { title: 'T', body: 'B', view: 'plan' as const, tab: '' }
    expect(m.open.stepRoute(manager, step, { view: 'plan', tab: 'positions' })).toBeNull()
    expect(m.open.stepRoute(admin, step, { view: 'plan', tab: 'positions' })).toEqual({
      view: 'plan',
      tab: '',
    })
  })

  it("marks a finished tour done, remembered in this browser, and the mode's own first tour ends its line", () => {
    const { useHelp, parsePrefs, welcomeDismissed, HELP_STORAGE_KEY } = m.help
    m.mode.useMode.setState({ mode: 'finance' })
    m.help.startTour('home-start')
    useHelp.getState().endTour('done')
    const p = useHelp.getState().prefs
    expect(p.completed).toEqual(['home-start'])
    expect(welcomeDismissed(p, 'finance')).toBe(true)
    for (const other of ['manager', 'hrbp', 'leader', 'hr-admin'] as const)
      expect(welcomeDismissed(p, other), other).toBe(false)
    expect(parsePrefs(storage.getItem(HELP_STORAGE_KEY))).toEqual(p)
  })

  it("leaves every line when the tour is skipped, or when it is not the mode's first tour", () => {
    const { useHelp, welcomeDismissed } = m.help
    m.mode.useMode.setState({ mode: 'leader' })
    m.help.startTour('home-start')
    useHelp.getState().endTour('skip')
    expect(welcomeDismissed(useHelp.getState().prefs, 'leader')).toBe(false)
    m.help.startTour('view-forecast')
    useHelp.getState().endTour('done')
    expect(useHelp.getState().prefs.completed).toEqual(['view-forecast'])
    expect(useHelp.getState().prefs.welcomeDismissed).toEqual([])
    // HR admin's first tour is "Getting started": "Getting started with your home" taken there ends no line.
    m.mode.useMode.setState({ mode: 'hr-admin' })
    m.help.startTour('home-start')
    useHelp.getState().endTour('done')
    expect(welcomeDismissed(useHelp.getState().prefs, 'hr-admin')).toBe(false)
    m.help.startTour('getting-started')
    useHelp.getState().endTour('done')
    expect(welcomeDismissed(useHelp.getState().prefs, 'hr-admin')).toBe(true)
  })
})

describe("each mode's welcome line, on its own", () => {
  it('is dismissed for its mode only, once, and remembered', () => {
    const { useHelp, welcomeDismissed, parsePrefs, HELP_STORAGE_KEY } = m.help
    useHelp.getState().dismissWelcome('hrbp')
    const p = useHelp.getState().prefs
    expect(p.welcomeDismissed).toEqual(['hrbp'])
    for (const mode of m.modes.MODES) expect(welcomeDismissed(p, mode), mode).toBe(mode === 'hrbp')
    useHelp.getState().dismissWelcome('hrbp')
    expect(useHelp.getState().prefs).toBe(p)
    expect(parsePrefs(storage.getItem(HELP_STORAGE_KEY))).toEqual(p)
  })

  it('withTourDone ends the line of the mode the home tour was taken in, and no other', () => {
    const { withTourDone, welcomeDismissed, DEFAULT_PREFS } = m.help
    for (const mode of m.modes.MODES) {
      const done = withTourDone(DEFAULT_PREFS, m.access.homeTourOf(mode), mode)
      for (const other of m.modes.MODES)
        expect(welcomeDismissed(done, other), `${mode} ${other}`).toBe(other === mode)
      // Without the mode it was taken in, no line ends.
      expect(withTourDone(DEFAULT_PREFS, m.access.homeTourOf(mode)).welcomeDismissed).toEqual([])
    }
  })

  it("reads another tab's change back", () => {
    const { useHelp, HELP_STORAGE_KEY } = m.help
    storage.setItem(
      HELP_STORAGE_KEY,
      JSON.stringify({ completed: ['own-data'], welcomeDismissed: ['manager'] }),
    )
    win.dispatchEvent(Object.assign(new Event('storage'), { key: HELP_STORAGE_KEY }))
    expect(useHelp.getState().prefs).toEqual({ completed: ['own-data'], welcomeDismissed: ['manager'] })
    // Storage that cannot be read leaves the defaults.
    storage.setItem(HELP_STORAGE_KEY, '{broken')
    win.dispatchEvent(Object.assign(new Event('storage'), { key: null }))
    expect(useHelp.getState().prefs).toEqual({ completed: [], welcomeDismissed: [] })
  })
})
