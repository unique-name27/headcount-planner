/**
 * Opening the page a tour step needs (the template app's TourLayer `openStepPage`, as its own
 * module so a test can check it). The tab a route lands on is read in the mode: '' is the view's
 * first tab the mode shows (Manager mode's Plan opens on Positions). A tour never adds to the browser
 * history: every move it makes replaces the entry on screen, and the store puts the page and the
 * filters back when the tour ends (`endTour`).
 */
import { VIEW_TABS } from '@/access/ids'
import { isViewKey } from '@/data/schema'
import { type Route, useStore } from '@/data/store'
import type { HelpAccess } from '../access'
import type { TourStep } from '../types'

/** The tab a route lands on in a mode: the tab it names (without a part), else the first shown tab. */
export function landedTab(access: Pick<HelpAccess, 'can'>, view: string, tab: string): string {
  if (tab) return tab.split(/[:/]/)[0]
  if (!isViewKey(view)) return ''
  return VIEW_TABS[view].find((t) => access.can(`tab:${view}.${t.key}`))?.key ?? ''
}

/** The route a step needs, or null when the page on screen already is it (or the step needs none). */
export function stepRoute(access: Pick<HelpAccess, 'can'>, step: TourStep, route: Route): Route | null {
  if (!step.view) return null
  const want = step.tab ?? ''
  const here =
    route.view === step.view &&
    (step.tab === undefined ||
      landedTab(access, route.view, route.tab) === landedTab(access, step.view, want))
  return here ? null : { view: step.view, tab: want }
}

/** Open the page a step needs, unless it is already showing, replacing the entry on screen. */
export function openStepPage(access: Pick<HelpAccess, 'can'>, step: TourStep): void {
  const { route, navigate } = useStore.getState()
  const next = stepRoute(access, step, route)
  if (next) navigate(next.view, next.tab, { history: 'replace', scroll: route.view !== next.view })
}
