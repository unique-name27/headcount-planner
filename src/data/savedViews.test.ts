/**
 * Saved views (docs/PLAN.md 9.2 and 16.2): add, update, rename, reorder, delete with undo, the view
 * Headcount Planner opens with, matching the scope (version and comparison included), the limit,
 * storage at `hcp:views`, and the settings file section.
 */
import { describe, expect, it } from 'vitest'
import { MemoryStorage } from '@/testkit/memoryStorage'
import {
  addView,
  EMPTY_VIEWS,
  EXAMPLE_VIEWS,
  importViewsSection,
  listedViews,
  loadViews,
  matchView,
  moveView,
  nameProblem,
  removeView,
  renameView,
  restoreView,
  type SavedViewsState,
  STARTING_VIEWS,
  sanitizeViews,
  saveViews,
  setStartup,
  uniqueName,
  updateView,
  VIEWS_FULL,
  VIEWS_KEY,
  VIEWS_MAX,
  viewScope,
  viewsFileSection,
  viewsFull,
} from './savedViews'
import { isRouteView } from './schema'
import { DEFAULT_FILTERS, type Filters } from './scope'
import { DEFAULT_SETTINGS, parseSettingsFile, settingsBlob } from './settings'
import { checkScope, DEFAULT_SCOPE, leftOutMessage, type UrlScope } from './urlScope'

const isRoute = (v: string) => isRouteView(v)
const scope = (f: Partial<Filters> = {}, rest: Partial<UrlScope> = {}): UrlScope => ({
  ...DEFAULT_SCOPE,
  filters: { ...DEFAULT_FILTERS, modes: {}, ...f },
  ...rest,
})
const named = (n: number, prefix = 'v'): SavedViewsState =>
  sanitizeViews(
    { views: Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, name: `${prefix}${i}` })) },
    isRoute,
  )

describe('saved views', () => {
  it('start with the two examples on the sample, and none with your own data', () => {
    const s = loadViews(isRoute, new MemoryStorage())
    expect(s).toBe(STARTING_VIEWS)
    expect(listedViews(s, true).map((v) => v.name)).toEqual([
      'Silicon Engineering, fiscal year',
      'Bengaluru, year to date',
    ])
    expect(listedViews(s, false)).toEqual([])
    // Removable like any other: once removed they stay removed.
    const store = new MemoryStorage()
    saveViews(removeView(s, EXAMPLE_VIEWS[0].id).state, store)
    expect(loadViews(isRoute, store).views.map((v) => v.id)).toEqual([EXAMPLE_VIEWS[1].id])
    expect(VIEWS_KEY).toBe('hcp:views')
  })

  it('add, update, rename, reorder, delete with undo, and choose the one to open with', () => {
    let s: SavedViewsState = EMPTY_VIEWS
    s = addView(
      s,
      { name: '  My org,   last quarter ', scope: scope({ leaderId: 'P-DIR1', period: 'qtd' }), page: null },
      'a',
    )
    s = addView(
      s,
      {
        name: 'Not Go-to-Market',
        scope: scope({ businessUnit: ['Go-to-Market'], modes: { businessUnit: 'exclude' } }),
        page: { view: 'plan', tab: 'positions' },
      },
      'b',
    )
    s = addView(
      s,
      {
        name: 'FY28 vs target',
        scope: scope({}, { version: 'fy28-plan-working', compare: 'target', lens: true }),
        page: null,
      },
      'c',
    )
    expect(s.views.map((v) => v.name)).toEqual(['My org, last quarter', 'Not Go-to-Market', 'FY28 vs target'])
    expect(s.views[2]).toMatchObject({ version: 'fy28-plan-working', compare: 'target', lens: true })
    expect(nameProblem(s, 'not go-to-market')).toBe('A saved view already has this name.')
    expect(nameProblem(s, 'not go-to-market', 'b')).toBeNull()
    expect(nameProblem(s, '   ')).toBe('Enter a name.')
    s = updateView(s, 'a', scope({ leaderId: 'P-DIR1', period: 'ytd' }, { compare: 'fy27-budget' }))
    expect(s.views[0]).toMatchObject({ filters: { period: 'ytd' }, compare: 'fy27-budget' })
    s = renameView(s, 'a', 'My org')
    s = moveView(s, 'c', -2)
    expect(s.views.map((v) => v.id)).toEqual(['c', 'a', 'b'])
    expect(moveView(s, 'c', -1)).toBe(s)
    s = setStartup(s, 'b')
    expect(s.startupId).toBe('b')
    const r = removeView(s, 'b')
    expect(r.state.startupId).toBeNull()
    expect(r.state.views.map((v) => v.id)).toEqual(['c', 'a'])
    const back = restoreView(r.state, r.removed!)
    expect(back.views.map((v) => v.id)).toEqual(['c', 'a', 'b'])
    expect(back.startupId).toBe('b')
    expect(setStartup(back, 'nope').startupId).toBeNull()
    // Renaming an example makes it yours.
    const renamed = renameView(STARTING_VIEWS, EXAMPLE_VIEWS[0].id, 'Silicon')
    expect(renamed.views[0].example).toBeUndefined()
  })

  it('match the scope exactly, then say "edited" once it changes, the pickers included', () => {
    let s: SavedViewsState = EMPTY_VIEWS
    s = addView(s, { name: 'Hsinchu', scope: scope({ location: ['Hsinchu'] }), page: null }, 'h')
    s = addView(
      s,
      {
        name: 'Not Hsinchu',
        scope: scope({ location: ['Hsinchu'], modes: { location: 'exclude' } }),
        page: null,
      },
      'n',
    )
    expect(matchView(s.views, scope({ location: ['Hsinchu'] }), null)).toEqual({
      view: s.views[0],
      edited: false,
    })
    // Exclude is another view, not the same one.
    expect(
      matchView(s.views, scope({ location: ['Hsinchu'], modes: { location: 'exclude' } }), 'h').view?.id,
    ).toBe('n')
    // An idle mode and the order of values don't make it edited.
    expect(
      matchView(s.views, scope({ location: ['Hsinchu'], modes: { level: 'exclude' } }), 'h').edited,
    ).toBe(false)
    expect(matchView(s.views, scope({ location: ['Hsinchu'], period: 'ytd' }), 'h')).toEqual({
      view: s.views[0],
      edited: true,
    })
    expect(matchView(s.views, scope({ location: ['Hsinchu'] }, { standard: 'gold' }), 'h').edited).toBe(true)
    expect(matchView(s.views, scope({ location: ['Hsinchu'] }, { compare: 'target' }), 'h').edited).toBe(true)
    expect(matchView(s.views, scope({ location: ['Hsinchu'] }, { version: 'fy27-budget' }), 'h').edited).toBe(
      true,
    )
    expect(matchView(s.views, scope({ location: ['Munich'] }), null)).toEqual({ view: null, edited: false })
    expect(viewScope(s.views[0])).toEqual(scope({ location: ['Hsinchu'] }))
  })

  it('never store an exclude mode without values, or a picker that is not an ID', () => {
    const odd = scope(
      { level: ['P1'], modes: { level: 'exclude', leaderId: 'exclude' } },
      { version: 'not an id', compare: 'target' },
    )
    const s = addView(EMPTY_VIEWS, { name: 'Not P1', scope: odd, page: null }, 'x')
    expect(s.views[0].filters.modes).toEqual({ level: 'exclude' })
    expect(s.views[0]).toMatchObject({ version: null, compare: 'target' })
  })

  it('drop invalid entries from storage and load filters saved before modes as include', () => {
    const store = new MemoryStorage()
    store.setItem(
      VIEWS_KEY,
      JSON.stringify({
        version: 1,
        views: [
          {
            id: 'ok',
            name: 'Old',
            filters: { period: 'ytd', businessUnit: ['Go-to-Market'] },
            standard: 'silver',
            version: 'fy27-budget',
            compare: '<b>',
            page: { view: 'nowhere', tab: '' },
          },
          { id: 'bad id!', name: 'x' },
          { id: 'noname', name: '  ' },
          'junk',
        ],
        startupId: 'gone',
      }),
    )
    const s = loadViews(isRoute, store)
    expect(s.views).toHaveLength(1)
    expect(s.views[0]).toMatchObject({
      id: 'ok',
      standard: 'silver',
      page: null,
      lens: false,
      version: 'fy27-budget',
      compare: null,
    })
    expect(s.views[0].filters.modes).toEqual({})
    expect(s.startupId).toBeNull()
    store.setItem(VIEWS_KEY, '{not json')
    expect(loadViews(isRoute, store)).toBe(STARTING_VIEWS)
    store.failure = new Error('blocked')
    expect(loadViews(isRoute, store)).toBe(STARTING_VIEWS)
    expect(() => saveViews(EMPTY_VIEWS, store)).not.toThrow()
    expect(sanitizeViews(null, isRoute)).toEqual(EMPTY_VIEWS)
    // A page must be a view or a masthead page.
    const pages = sanitizeViews(
      {
        views: [
          { id: 'p', name: 'P', page: { view: 'audit', tab: '' } },
          { id: 'q', name: 'Q', page: { view: 'scorecard', tab: '' } },
        ],
      },
      isRoute,
    )
    expect(pages.views.map((v) => v.page?.view ?? null)).toEqual(['audit', null])
  })

  it('apply without a leader who is not in the loaded data, and say so', () => {
    const v = addView(
      EMPTY_VIEWS,
      { name: 'Gone leader', scope: scope({ leaderId: 'P-404', location: ['Hsinchu'] }), page: null },
      'g',
    ).views[0]
    const r = checkScope(viewScope(v), { hasLeader: () => false, hasValue: () => true })
    expect(r.scope.filters.leaderId).toBeNull()
    expect(r.scope.filters.location).toEqual(['Hsinchu'])
    expect(leftOutMessage(r.leftOut, "The view's")).toBe(
      "The view's leader with position ID P-404 is not in your data, so it was left out.",
    )
  })
})

describe('the saved views limit', () => {
  it('refuses a new view once the list is full, leaving the list and the startup view as they were', () => {
    const full = { ...named(VIEWS_MAX), startupId: 'v0' }
    expect(viewsFull(full)).toBe(true)
    const after = addView(full, { name: 'One more', scope: DEFAULT_SCOPE, page: null }, 'extra')
    expect(after).toBe(full)
    expect(viewsFull(named(VIEWS_MAX - 1))).toBe(false)
    expect(VIEWS_FULL).toBe(
      'You have 50 saved views, the most Headcount Planner keeps. Delete one in Manage views to save another.',
    )
  })

  it('reads a stored list over the limit without pointing the startup view at a view it dropped', () => {
    const raw = {
      views: Array.from({ length: VIEWS_MAX + 2 }, (_, i) => ({ id: `k${i}`, name: `k${i}` })),
      startupId: `k${VIEWS_MAX + 1}`,
    }
    const s = sanitizeViews(raw, isRoute)
    expect(s.views).toHaveLength(VIEWS_MAX)
    expect(s.startupId).toBeNull()
  })
})

describe('saved views in the settings file', () => {
  it('travel in the file and merge on import', async () => {
    let s: SavedViewsState = EMPTY_VIEWS
    s = addView(
      s,
      {
        name: 'Not Go-to-Market',
        scope: scope(
          { businessUnit: ['Go-to-Market'], modes: { businessUnit: 'exclude' } },
          { compare: 'target' },
        ),
        page: { view: 'targets', tab: 'gap' },
      },
      'b',
    )
    s = setStartup(s, 'b')
    const text = await settingsBlob(DEFAULT_SETTINGS, new Date('2026-10-04T00:00:00Z'), {
      views: viewsFileSection(s),
    }).text()
    const parsed = parseSettingsFile(text, DEFAULT_SETTINGS, '2026-10-04')
    if (!parsed.ok) throw new Error(parsed.error)
    let mine: SavedViewsState = addView(
      EMPTY_VIEWS,
      { name: 'not go-to-market', scope: scope(), page: null },
      'x',
    )
    mine = addView(mine, { name: 'Keep me', scope: scope({ period: 'ytd' }), page: null }, 'k')
    const r = importViewsSection(mine, parsed.viewsSection, isRoute)
    if (!r.ok) throw new Error(r.error)
    // The file's view replaces the one with the same name; the others stay.
    expect(r.state.views.map((v) => v.name)).toEqual(['Not Go-to-Market', 'Keep me'])
    expect(r.state.views[0]).toMatchObject({
      filters: { modes: { businessUnit: 'exclude' } },
      compare: 'target',
      page: { view: 'targets', tab: 'gap' },
    })
    expect(r.state.startupId).toBe('b')
    expect(r.summary).toBe('1 saved view')
    expect(importViewsSection(mine, { views: 'nope' }, isRoute).ok).toBe(false)
  })

  it('counts the views that came in, not the views in the file', () => {
    const r = importViewsSection(
      named(VIEWS_MAX - 1),
      { views: Array.from({ length: 5 }, (_, i) => ({ id: `n${i}`, name: `n${i}` })) },
      isRoute,
    )
    if (!r.ok) throw new Error(r.error)
    expect(r.state.views).toHaveLength(VIEWS_MAX)
    expect(r.summary).toBe(
      `1 saved view (4 more left out: Headcount Planner keeps at most ${VIEWS_MAX} saved views)`,
    )
  })

  it('replaces a view by id, else by name, and never leaves two views with one name', () => {
    const s = sanitizeViews(
      {
        views: [
          { id: 'a', name: 'X' },
          { id: 'b', name: 'Y' },
        ],
      },
      isRoute,
    )
    const byId = importViewsSection(s, { views: [{ id: 'a', name: 'Y' }] }, isRoute)
    expect(byId.ok && byId.state.views.map((v) => [v.id, v.name])).toEqual([
      ['a', 'Y (2)'],
      ['b', 'Y'],
    ])
    const byName = importViewsSection(s, { views: [{ id: 'c', name: 'y' }] }, isRoute)
    expect(byName.ok && byName.state.views.map((v) => [v.id, v.name])).toEqual([
      ['a', 'X'],
      ['c', 'y'],
    ])
    const twins = importViewsSection(
      named(1),
      {
        views: [
          { id: 'p', name: 'Same' },
          { id: 'q', name: 'same' },
        ],
      },
      isRoute,
    )
    expect(twins.ok && twins.state.views.map((v) => [v.id, v.name])).toEqual([
      ['v0', 'v0'],
      ['p', 'Same'],
      ['q', 'same (2)'],
    ])
  })

  it('makes names unique with a number, within the name length', () => {
    const views = named(2).views.map((v, i) => ({ ...v, name: i ? 'Report (2)' : 'Report' }))
    expect(uniqueName(views, 'Report')).toBe('Report (3)')
    expect(uniqueName(views, 'Other')).toBe('Other')
    expect(uniqueName(views, 'report', views[0].id)).toBe('report')
    expect(uniqueName([{ ...views[0], name: 'x'.repeat(60) }], 'x'.repeat(60))).toBe(`${'x'.repeat(56)} (2)`)
  })
})
