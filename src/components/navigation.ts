/**
 * In-app navigation with browser history: each move pushes an entry, so Back and Forward walk
 * through views and tabs (and filter changes). The address is `#view.tab?scope` (docs/PLAN.md 9.1);
 * one writer (src/app/addressWriter.ts) keeps it in step with the store.
 *
 * Every move keeps the current scope. Links in the page carry the route only (`routeHash`): an
 * address without a scope keeps the scope on screen, and a new tab (a middle-click) opens as
 * the app does without a scope in its address: on the saved view set to open it, else your last
 * filters. So a link drawn earlier never carries an out-of-date scope. "Copy link to this view"
 * writes the scope out in full (`linkToView`).
 */
import { lensOn } from '@/data/address'
import { type RouteView, useStore } from '@/data/store'
import { hashWithScope, type UrlScope } from '@/data/urlScope'

/** The scope on screen: filters, data standard, the quality lens and the version and comparison pickers. */
export function currentScope(): UrlScope {
  const s = useStore.getState()
  return {
    filters: s.filters,
    standard: s.dataStandard,
    lens: lensOn(),
    version: s.version,
    compare: s.compare,
  }
}

/** The route part of an address, without "#": "plan.openings". */
export const routePath = (view: RouteView, tab = ''): string => `${view}${tab ? `.${tab}` : ''}`

/** The address of a view and tab for a link: "#plan.openings" (it keeps the scope on screen). */
export const routeHash = (view: RouteView, tab = ''): string => `#${routePath(view, tab)}`

/**
 * The full address of the view on screen with its scope spelled out (`scope=all` at the
 * defaults, so the link resets the recipient's filters too).
 */
export function linkToView(
  scope: UrlScope = currentScope(),
  route: { view: RouteView; tab: string } = useStore.getState().route,
): string {
  const base = typeof location === 'undefined' ? '' : location.href.split('#')[0]
  return `${base}${hashWithScope(routePath(route.view, route.tab), scope, { explicit: true })}`
}

export function goTo(view: RouteView, tab = ''): void {
  // Keep the reader's place when switching tabs inside a view; jump to the top for a new view.
  const { route, navigate } = useStore.getState()
  navigate(view, tab, { scroll: route.view !== view, history: 'push' })
}
