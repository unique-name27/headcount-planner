/**
 * The policy (docs/PLAN.md 8.3): one pure function answers, for every surface and action in every
 * mode, shown, limited or hidden, with one plain sentence for limited and hidden. Every mode is a
 * table (`ROLE_POLICY`, plain data, a test round-trips it through JSON); anything a table does not
 * name is hidden with "Not named by the <mode> mode policy."
 *
 * Routes (`routeShown`, `routeDecision`) ask `decide` for the view and tab. A hidden route goes to the
 * mode's home with the toast "<Page> is not shown in <mode> mode. Headcount Planner opened <home>
 * instead." (src/access/copy.ts), and the guard in `navigate` replaces the history entry so Back
 * never returns to it. Callers ask through `ctx.access.decide` (the context binds the mode), so an
 * off-screen render with its own mode gets its own answers. The policy never imports the view
 * registry. Pure.
 *
 * Frozen in the M2 freeze (docs/CONTRACTS-M2.md). The five tables are manager.ts, hrbp.ts, leader.ts,
 * finance.ts and admin.ts, built with kit.ts and read by table.ts (the template app's); the Actions
 * table is actions.ts and the Action center's item routing helpers routing.ts.
 */
import { isPageKey, type Mode, type PageKey, type RouteView, VIEW_LABEL } from '@/data/schema'
import type { Route } from '@/data/store'
import { hiddenPageTitle, hiddenTabTitle, openedInstead, openedTabInstead } from '../copy'
import { homeOf, homeViewOf } from '../modes'
import type { SurfaceId } from '../surfaces'
import { ADMIN_POLICY } from './admin'
import { FINANCE_POLICY } from './finance'
import { HRBP_POLICY } from './hrbp'
import { LEADER_POLICY } from './leader'
import { MANAGER_POLICY } from './manager'
import { baseTab, decideTable, PAGE_KEY_SET } from './table'
import type { At, DecideInfo, Decision, HiddenPart, RolePolicy, RoleTab } from './types'

export * from './routing'
export * from './table'
export * from './types'

/** Every mode's table (docs/PLAN.md 8.3). */
export const ROLE_POLICY: Readonly<Record<Mode, RolePolicy>> = {
  manager: MANAGER_POLICY,
  hrbp: HRBP_POLICY,
  leader: LEADER_POLICY,
  finance: FINANCE_POLICY,
  'hr-admin': ADMIN_POLICY,
}

/** The mode's table. */
export const policyOf = (mode: Mode): RolePolicy => ROLE_POLICY[mode]

/** The policy's version, part of `accessFor`'s memo key: constant in Phase 1 (no overrides). */
export const policyVersion = (): number => 0

/**
 * Shown, limited or hidden for a surface in a mode (docs/PLAN.md 8.3): `ROLE_POLICY[mode]` read by
 * the table engine. `at` places a figure on its view and tab; `info` carries a metric's views or a
 * KPI's metric.
 */
export function decide(mode: Mode, surface: SurfaceId | string, at?: At, info?: DecideInfo): Decision {
  return decideTable(ROLE_POLICY[mode], surface, at, info)
}

/** Anything but hidden. */
export const can = (mode: Mode, surface: SurfaceId | string, at?: At, info?: DecideInfo): boolean =>
  decide(mode, surface, at, info).access !== 'hidden'

/** The masthead pages as a redirect toast names them at the start of a sentence. */
export const PLACE_LABEL: Readonly<Record<PageKey, string>> = {
  data: 'The Data room',
  actions: 'The Action center',
  audit: 'Audit',
}

/** A route's page label for the toast: "Plan", "The Data room". */
export const placeLabel = (view: RouteView): string =>
  isPageKey(view) ? PLACE_LABEL[view] : VIEW_LABEL[view]

/** The first tab of a view the mode shows; null when the view is hidden or has no tabs. */
export function firstShownTab(mode: Mode, view: string): RoleTab | null {
  if (!placeShown(mode, view)) return null
  const tabs = namedTabs(mode, view)
  return tabs?.find((t) => can(mode, `tab:${view}.${t.key}`)) ?? null
}

/** Whether a route (view, and tab when given) shows in the mode. */
export function routeShown(mode: Mode, view: string, t = ''): boolean {
  if (!placeShown(mode, view)) return false
  if (!t) return true
  if (hiddenPartOf(mode, view, t)) return false
  // A part of a tab picked in its address has its own decision.
  if (t.includes(':') && ROLE_POLICY[mode].surfaces[`tab:${view}.${t}`]) return can(mode, `tab:${view}.${t}`)
  // A tab the policy does not name is left for the view to resolve (it opens its first shown tab).
  const named = namedTabs(mode, view)?.find((x) => x.key === baseTab(t))
  if (!named) return true
  return can(mode, `tab:${view}.${named.key}`)
}

export interface RouteDecision {
  route: Route
  redirected: boolean
  /** For a redirect: the toast's title and description. */
  reason?: { title: string; description: string }
}

/**
 * Where a route goes in a mode (the template app's route guard): a hidden view or page opens the
 * mode's home ("<Page> is not shown in <mode> mode" / "Headcount Planner opened <home> instead."), a
 * hidden tab of a shown view opens its first shown tab; the mode's own home is never redirected.
 */
export function routeDecision(mode: Mode, route: Route): RouteDecision {
  const same: RouteDecision = { route, redirected: false }
  if (!placeShown(mode, route.view)) {
    if (route.view === homeViewOf(mode)) return same
    return {
      route: homeOf(mode),
      redirected: true,
      reason: { title: hiddenPageTitle(placeLabel(route.view), mode), description: openedInstead(mode) },
    }
  }
  const tabs = namedTabs(mode, route.view)
  if (!tabs || !route.tab) return same
  const named = tabs.find((x) => x.key === baseTab(route.tab))
  // A hidden part of a shown tab opens the part named instead, with the same toast.
  const part = hiddenPartOf(mode, route.view, route.tab)
  if (part && named && can(mode, `tab:${route.view}.${named.key}`))
    return {
      route: { view: route.view, tab: part.instead },
      redirected: true,
      reason: {
        title: hiddenTabTitle(placeLabel(route.view), part.label, mode),
        description: openedTabInstead(part.insteadLabel),
      },
    }
  if (!named || can(mode, `tab:${route.view}.${named.key}`)) return same
  const first = firstShownTab(mode, route.view)
  return {
    route: { view: route.view, tab: first?.key ?? '' },
    redirected: true,
    reason: {
      title: hiddenTabTitle(placeLabel(route.view), named.label, mode),
      description: openedTabInstead(first?.label ?? placeLabel(route.view)),
    },
  }
}

const placeSurface = (view: string): string => (PAGE_KEY_SET.has(view) ? `page:${view}` : `view:${view}`)

/** Whether a view or page is shown in a mode. */
const placeShown = (mode: Mode, view: string): boolean => can(mode, placeSurface(view))

/** The tabs a mode's table names for a view; null for a page or a view with no tab table. */
const namedTabs = (mode: Mode, view: string): readonly RoleTab[] | null =>
  (ROLE_POLICY[mode].tabs as Record<string, readonly RoleTab[] | undefined>)[view] ?? null

const hiddenPartOf = (mode: Mode, view: string, t: string): HiddenPart | undefined =>
  ROLE_POLICY[mode].hiddenParts[`${view}.${t}`]
