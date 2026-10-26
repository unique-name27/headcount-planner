/**
 * What a help link does, and whether it points somewhere real (the template app's help/links.ts).
 * `checkLink` is pure (the content tests run it over every article); `followLink` acts in the app.
 *
 * A route target is "view" or "view.tab", where tab may carry a part
 * ("finance.assumptions:trade-rates", src/access/ids.ts `TAB_PARTS`) or a Data room address
 * ("data.metrics/plan.heads.approved", src/views/data/engine/links.ts). The Action center and Audit
 * are single pages with no tabs.
 */
import { TAB_PARTS } from '@/access/ids'
import { openSettings } from '@/app/settings/store'
import { goTo, routeHash } from '@/components/navigation'
import { SETTINGS_SECTIONS, type SettingsSection } from '@/data/settings'
import { ROUTE_VIEWS, type RouteView } from '@/data/store'
import { metricHref, openMetricDefinition } from '@/views/data/metrics/open'
import type { HelpLink } from './markup'
import { closeHelp, startTour, useHelp } from './store'

/** What the link checks need to know about the app: its pages, their tabs, metrics, articles and tours. */
export interface LinkWorld {
  /** Tabs of each folder-tab view (src/views/registry.ts `VIEWS`, every tab). */
  viewTabs: ReadonlyMap<string, readonly string[]>
  /** Route tabs the Data room accepts (src/views/data/engine/links.ts `parseDataTab`). */
  isDataTab: (tab: string) => boolean
  hasMetric: (id: string) => boolean
  hasArticle: (id: string) => boolean
  hasTour: (id: string) => boolean
}

/** A route target "view" or "view.tab", split. */
export function parseRouteTarget(target: string): { view: string; tab: string } {
  const [view, ...rest] = target.split('.')
  return { view, tab: rest.join('.') }
}

/** Why a folder-tab view's tab ("assumptions", "assumptions:trade-rates") does not exist, or null. */
function viewTabProblem(view: string, tab: string, world: LinkWorld): string | null {
  const at = tab.search(/[:/]/)
  const base = at < 0 ? tab : tab.slice(0, at)
  if (!world.viewTabs.get(view)?.includes(base)) return `no tab "${base}" in ${view}`
  if (at < 0) return null
  if (tab[at] !== ':') return `no address "${tab}" in ${view}`
  const part = tab.slice(at + 1)
  return TAB_PARTS.some((p) => p.view === view && p.tab === base && p.part === part)
    ? null
    : `no part "${part}" of ${view}.${base}`
}

/** Null when the link resolves; otherwise why it does not. */
export function checkLink(link: HelpLink, world: LinkWorld): string | null {
  switch (link.kind) {
    case 'route': {
      const { view, tab } = parseRouteTarget(link.target)
      if (!ROUTE_VIEWS.includes(view as RouteView)) return `no page "${view}"`
      if (!tab) return null
      if (view === 'data') return world.isDataTab(tab) ? null : `no Data room tab "${tab}"`
      if (view === 'actions' || view === 'audit') return `no tab "${tab}" on the ${view} page`
      return viewTabProblem(view, tab, world)
    }
    case 'metric':
      return world.hasMetric(link.target) ? null : `no metric "${link.target}"`
    case 'article':
      return world.hasArticle(link.target) ? null : `no article "${link.target}"`
    case 'tour':
      return world.hasTour(link.target) ? null : `no tour "${link.target}"`
    case 'settings':
      return (SETTINGS_SECTIONS as readonly string[]).includes(link.target)
        ? null
        : `no Settings section "${link.target}"`
  }
}

/** The address a link can carry, for links that go to a page (so they open in a new tab too). */
export function linkHref(link: HelpLink): string | undefined {
  if (link.kind === 'route') {
    const { view, tab } = parseRouteTarget(link.target)
    return routeHash(view as RouteView, tab)
  }
  if (link.kind === 'metric') return metricHref(link.target)
  return undefined
}

/** Do what the link says. Links that leave the Help sheet close it. */
export function followLink(link: HelpLink): void {
  switch (link.kind) {
    case 'route': {
      const { view, tab } = parseRouteTarget(link.target)
      closeHelp()
      goTo(view as RouteView, tab)
      return
    }
    case 'metric':
      closeHelp()
      openMetricDefinition(link.target)
      return
    case 'article':
      useHelp.getState().showArticle(link.target)
      return
    case 'tour':
      startTour(link.target)
      return
    case 'settings':
      closeHelp()
      openSettings(link.target as SettingsSection)
  }
}
