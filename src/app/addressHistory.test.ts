/**
 * The address sync over a page's history (the template app's addressHistory test), with a stub
 * browser:
 *
 * - An example set to open with is forgotten once your own data is loaded (examples are not listed
 *   then, so it could be neither seen nor unset), and the app opens with your last filters.
 * - Back and Forward show the saved view each entry was in: never "edited" over a scope the view
 *   was not applied to.
 * - A link's version or comparison this workspace does not have resets to the default.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { AnalyticsContext } from '@/data/context'
import { MemoryStorage } from '@/testkit/memoryStorage'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))

/* ───────── a browser tab: one history stack, the hash and popstate ───────── */

const entries: { hash: string; state: unknown }[] = [{ hash: '', state: null }]
let at = 0
const win = Object.assign(new EventTarget(), { scrollTo: () => undefined })
const fakeHistory = {
  get state() {
    return entries[at].state
  },
  get length() {
    return entries.length
  },
  pushState(state: unknown, _title: string, url: string) {
    entries.splice(at + 1)
    entries.push({ hash: url, state })
    at++
  },
  replaceState(state: unknown, _title: string, url: string) {
    entries[at] = { hash: url, state }
  },
}
const fakeLocation = {
  get hash() {
    return entries[at].hash
  },
  set hash(h: string) {
    fakeHistory.pushState(null, '', h)
  },
  get href() {
    return `http://hcp.test/${entries[at].hash}`
  },
}
/** Back (-1) or Forward (+1), as the browser does it. */
function go(delta: number): void {
  at += delta
  win.dispatchEvent(new Event('popstate'))
}

const own = {
  id: 'mine',
  name: 'Bengaluru P3',
  filters: { period: 'fy', location: ['Bengaluru'], level: ['P3'], modes: {} },
  standard: 'bronze',
  lens: false,
  version: null,
  compare: null,
  page: null,
}

const storage = new MemoryStorage()
storage.setItem('hcp:filters', JSON.stringify({ period: 'ytd', level: ['P4'] }))
// "Bengaluru, year to date" (an example) set to open with, next to a view of your own.
storage.setItem(
  'hcp:views',
  JSON.stringify({
    version: 1,
    views: [
      {
        id: 'example-bengaluru-ytd',
        name: 'Bengaluru, year to date',
        filters: { period: 'ytd', location: ['Bengaluru'], modes: {} },
        standard: 'bronze',
        lens: false,
        version: null,
        compare: null,
        page: { view: 'forecast', tab: '' },
        example: true,
      },
      own,
    ],
    startupId: 'example-bengaluru-ytd',
  }),
)
vi.stubGlobal('localStorage', storage)
vi.stubGlobal('window', win)
vi.stubGlobal('location', fakeLocation)
vi.stubGlobal('history', fakeHistory)
vi.stubGlobal('BroadcastChannel', undefined)

/** Your own data: the vocabulary a scope is checked against (Bengaluru, P3 and P4 exist). */
const seat = (positionId: string, location: string, level: string) => ({
  positionId,
  effectiveDate: '2026-01-01',
  status: 'Filled',
  level,
  businessUnit: 'Silicon Engineering',
  department: 'Design Verification',
  costCenter: '1130-BLR',
  location,
})
const ctx = {
  isSample: false,
  asOf: '2026-09-30',
  versions: [],
  all: {
    positions: [seat('P-1', 'Bengaluru', 'P3'), seat('P-2', 'Hsinchu', 'P4')],
    workers: [],
    requests: [],
    targets: [],
    freezes: [],
  },
} as unknown as AnalyticsContext

type Mods = {
  store: typeof import('@/data/store')
  address: typeof import('./address')
  views: typeof import('@/data/viewsStore')
  actions: typeof import('./viewActions')
  saved: typeof import('@/data/savedViews')
}
let m: Mods
let stop: () => void = () => undefined

beforeAll(async () => {
  m = {
    store: await import('@/data/store'),
    address: await import('./address'),
    views: await import('@/data/viewsStore'),
    actions: await import('./viewActions'),
    saved: await import('@/data/savedViews'),
  }
}, 60_000)

afterAll(() => {
  stop()
  vi.unstubAllGlobals()
})

/** What the filter row's Views button shows for the scope on screen. */
function viewsButton(): string {
  const v = m.views.useSavedViews.getState()
  const listed = m.saved.listedViews(v, ctx.isSample)
  const { view, edited } = m.saved.matchView(listed, m.address.currentScope(), v.appliedId)
  return view ? `${view.name}${edited ? ', edited' : ''}` : 'Views'
}

describe('an example set to open with, with your own data loaded', () => {
  it('is forgotten: the app opens on your last filters and the page the address names', () => {
    m.address.loadAddress(ctx)
    const views = m.views.useSavedViews.getState()
    expect(views.startupId).toBeNull()
    expect(views.appliedId).toBeNull()
    expect((JSON.parse(storage.getItem('hcp:views') ?? '{}') as { startupId?: unknown }).startupId).toBeNull()
    const st = m.store.useStore.getState()
    expect(st.filters.period).toBe('ytd')
    expect(st.filters.level).toEqual(['P4'])
    expect(st.filters.location).toEqual([])
    // Not the example's page: the address named none, so the home page.
    expect(st.route.view).toBe(m.store.HOME_VIEW)
    expect(fakeLocation.hash).toBe(`#${m.store.HOME_VIEW}?period=ytd&level=P4`)
    expect(entries).toHaveLength(1)
  })
})

describe('Back and Forward over a saved view', () => {
  it('show the view each entry was in, never "edited" over another scope', () => {
    stop = m.address.connectAddress(() => ctx)
    const st = m.store.useStore
    st.getState().setFilters({ period: 'fy', level: ['P3', 'P4'] }, { history: 'push' })
    expect(entries).toHaveLength(2)
    expect(viewsButton()).toBe('Views')

    const view = m.views.useSavedViews.getState().views.find((v) => v.id === 'mine')
    if (!view) throw new Error('the own view did not load')
    m.actions.applySavedView(view, ctx)
    expect(entries).toHaveLength(3)
    expect(fakeLocation.hash).toBe(`#${m.store.HOME_VIEW}?loc=Bengaluru&level=P3`)
    expect(viewsButton()).toBe('Bengaluru P3')

    go(-1)
    expect(st.getState().filters.level).toEqual(['P3', 'P4'])
    expect(m.views.useSavedViews.getState().appliedId).toBeNull()
    expect(viewsButton()).toBe('Views')

    go(1)
    expect(st.getState().filters.location).toEqual(['Bengaluru'])
    expect(viewsButton()).toBe('Bengaluru P3')

    // Changing the scope after applying it is "edited", and Back from there shows the view again.
    st.getState().setFilters({ level: ['P4'] }, { history: 'push' })
    expect(viewsButton()).toBe('Bengaluru P3, edited')
    go(-1)
    expect(viewsButton()).toBe('Bengaluru P3')
    // The first entry, from before any view was applied.
    go(-1)
    go(-1)
    expect(at).toBe(0)
    expect(viewsButton()).toBe('Views')
    expect(st.getState().filters.level).toEqual(['P4'])
    expect(entries).toHaveLength(4)
  })
})

describe('a pasted address', () => {
  it('applies its scope, drops what the data does not have and resets an unknown version', () => {
    const st = m.store.useStore
    fakeHistory.pushState(
      null,
      '',
      '#plan.positions?loc=Bengaluru&loc=Atlantis&ver=fy99-working&vs=fy27-budget',
    )
    win.dispatchEvent(new Event('hashchange'))
    expect(st.getState().route).toEqual({ view: 'plan', tab: 'positions' })
    expect(st.getState().filters.location).toEqual(['Bengaluru'])
    // No version in this workspace: both pickers go back to their defaults.
    expect(st.getState().version).toBeNull()
    expect(st.getState().compare).toBeNull()
    expect(fakeLocation.hash).toBe('#plan.positions?loc=Bengaluru')
  })
})
