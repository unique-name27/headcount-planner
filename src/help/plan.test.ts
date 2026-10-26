/**
 * docs/PLAN.md 14.2 against what the app registers and wires: every article and tour id the plan
 * names is registered, in its group and order, and nothing else is; the modes each one shows in
 * follow the plan's rules (`about-server` everywhere, a view's article with its view, `own-data` and
 * the Data room's articles HR admin's, `requests-start` in Manager mode, each mode's first tour on its
 * own home); and every article and tour a mode shows is reached in the app: listed on the Help
 * sheet's home on every page the mode shows, or, for a view's article and tour, on its own page.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { type AccessContext, accessFor } from '@/access/context'
import { HELP_ARTICLE_IDS, HELP_TOUR_IDS } from '@/access/ids'
import { HOME_OF, MODES, type Mode } from '@/access/modes'
import { routeShown } from '@/access/policy'
import { VIEW_KEYS } from '@/data/schema'
import type { RouteView } from '@/data/store'
import { articleShown, homeTourOf, tourShown } from './access'
import { ARTICLES } from './articles'
import { sheetHome } from './sheet'
import { TOURS } from './tours'
import { HELP_GROUPS } from './types'

const PLAN = readFileSync(fileURLToPath(new URL('../../docs/PLAN.md', import.meta.url)), 'utf8').replace(
  /\r\n/g,
  '\n',
)
const HELP = PLAN.slice(PLAN.indexOf('\n### 14.2 Help'), PLAN.indexOf('\n### 14.3 '))
const ACCESS = Object.fromEntries(MODES.map((m) => [m, accessFor(m)])) as Record<Mode, AccessContext>

/** The bullet of 14.2 that starts with `lead` ("Start here:"), joined onto one line. */
function bullet(lead: string): string {
  const start = HELP.indexOf(`\n- ${lead}`)
  expect(start, lead).toBeGreaterThanOrEqual(0)
  const rest = HELP.slice(start + 3)
  const end = rest.indexOf('\n- ')
  return (end < 0 ? rest : rest.slice(0, end)).replace(/\s+/g, ' ')
}

/** The ids a bullet names: backticked lower-case words with hyphens, in order. */
const idsIn = (text: string): string[] => [...text.matchAll(/`([a-z][a-z-]*[a-z])`/g)].map((m) => m[1])

/** The plan's article bullets, in Help sheet order (src/help/types.ts `HELP_GROUPS`). */
const GROUP_BULLETS = [
  'Start here:',
  'Each view:',
  'Your data:',
  'Definitions:',
  'Privacy and trust:',
  'Help and support:',
] as const

/** Every page a mode shows, as a route. */
const pagesOf = (mode: Mode) =>
  [...VIEW_KEYS, 'data', 'actions', 'audit']
    .filter((v) => routeShown(mode, v, ''))
    .map((view) => ({ view: view as RouteView, tab: '' }))

describe('PLAN 14.2: every article and tour it names', () => {
  it('is registered, in its group and in the plan’s order, and no other is', () => {
    expect(HELP_GROUPS).toHaveLength(GROUP_BULLETS.length)
    const named = GROUP_BULLETS.flatMap((lead, i) => {
      const ids = idsIn(bullet(lead))
      // Each id sits in the group whose bullet names it.
      for (const id of ids) expect(ARTICLES.find((a) => a.id === id)?.group, id).toBe(HELP_GROUPS[i].key)
      return ids
    })
    expect(named).toEqual([...HELP_ARTICLE_IDS])
    expect(ARTICLES.map((a) => a.id)).toEqual(named)
  })

  it('names the tours the app registers: the first tours, requests-start, own-data and one per view', () => {
    const named = idsIn(bullet('Tours:')).filter((id) => id !== 'view-whatif')
    expect(named).toEqual(['getting-started', 'home-start', 'requests-start', 'own-data'])
    const views = VIEW_KEYS.map((v) => `view-${v}`)
    expect(new Set(TOURS.map((t) => t.id))).toEqual(new Set([...named, ...views]))
    expect(TOURS.map((t) => t.id)).toEqual([...HELP_TOUR_IDS])
    // The view tours are 4 to 6 steps each, and view-whatif walks the Levers tab.
    for (const t of TOURS.filter((x) => x.id.startsWith('view-')))
      expect(t.steps.length, t.id).toBeGreaterThanOrEqual(4)
    const whatif = TOURS.find((t) => t.id === 'view-whatif')
    expect(whatif?.steps.every((s) => s.view === 'whatif' && s.tab === 'levers')).toBe(true)
  })
})

describe('PLAN 14.2: the modes each one shows in', () => {
  it('shows about-server in every mode, and each view’s article wherever its view shows', () => {
    for (const m of MODES) {
      expect(articleShown(ACCESS[m], 'about-server'), m).toBe(true)
      for (const v of [...VIEW_KEYS, 'data', 'actions', 'audit'])
        expect(articleShown(ACCESS[m], `view-${v}`), `${m} view-${v}`).toBe(routeShown(m, v, ''))
    }
  })

  it('keeps own-data and the Data room’s articles to HR admin, and gives Manager requests-start', () => {
    for (const m of MODES) {
      const dataRoom = routeShown(m, 'data', '')
      expect(dataRoom, m).toBe(m === 'hr-admin')
      expect(tourShown(ACCESS[m], 'own-data'), m).toBe(dataRoom)
      for (const id of [
        'data-loading',
        'data-mapping',
        'data-tiers',
        'data-certify',
        'data-quality',
        'data-wrong',
      ])
        expect(articleShown(ACCESS[m], id), `${m} ${id}`).toBe(dataRoom)
    }
    expect(tourShown(ACCESS.manager, 'requests-start')).toBe(true)
  })

  it('runs each mode’s first tour in it, on its own home', () => {
    for (const m of MODES) {
      const first = homeTourOf(m)
      expect(tourShown(ACCESS[m], first), m).toBe(true)
      expect(first, m).toBe(HOME_OF[m] === 'data' ? 'getting-started' : 'home-start')
    }
  })
})

describe('every article and tour a mode shows is reached in the app', () => {
  it('lists each on the Help sheet’s home, and gives each view its own article and tour on its page', () => {
    for (const m of MODES) {
      const access = ACCESS[m]
      const shownArticles = ARTICLES.filter((a) => articleShown(access, a.id)).map((a) => a.id)
      const shownTours = TOURS.filter((t) => tourShown(access, t.id)).map((t) => t.id)
      expect(shownArticles.length, m).toBeGreaterThan(20)
      for (const page of pagesOf(m)) {
        const home = sheetHome(access, page)
        const where = `${m} #${page.view}`
        const listed = new Set(home.groups.flatMap((g) => g.articles.map((a) => a.id)))
        expect([...listed].sort(), where).toEqual([...shownArticles].sort())
        const tours = new Set(
          [home.homeTour, home.pageTour, ...home.tours].filter((t) => !!t).map((t) => t?.id),
        )
        expect([...tours].sort(), where).toEqual([...shownTours].sort())
        // A view's page offers its own article and tour where the mode shows them.
        const own = `view-${page.view}`
        if (shownArticles.includes(own)) expect(home.here?.id, where).toBe(own)
        if (page.view !== 'data' && shownTours.includes(own)) expect(home.pageTour?.id, where).toBe(own)
      }
    }
  })
})
