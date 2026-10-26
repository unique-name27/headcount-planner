/**
 * What the Views menu and "Copy link to this view" do (the template app's viewActions.ts): apply a
 * saved view in one step (one history entry), and copy the full address of a view.
 */

import { currentScope, linkToView } from '@/components/navigation'
import { toast } from '@/components/toast'
import { batchAddress, setLensOn } from '@/data/address'
import { type AnalyticsContext, pickCatalog } from '@/data/context'
import { type SavedView, viewScope } from '@/data/savedViews'
import { type RouteView, useStore } from '@/data/store'
import {
  checkPicks,
  checkScope,
  leftOutMessage,
  periodMessage,
  picksMessage,
  type UrlScope,
  vocabularyOf,
} from '@/data/urlScope'
import { isRouteView, useSavedViews } from '@/data/viewsStore'
import { writeClipboard } from '@/lib/export/clipboard'

/**
 * Apply a saved view: its scope (filters, version, comparison, data standard, lens) in one step
 * and, when it has one, its page. One history entry. Values the loaded data doesn't have, a custom
 * period past the reporting date and pickers this workspace can't show are left out, as a link's
 * are; a toast says what changed. The mode's clamp keeps a scoped mode inside its scope (the store's
 * filter guard). The data standard and lens are this tab's scope, so applying a view saves neither.
 */
export function applySavedView(
  view: SavedView,
  ctx: Pick<AnalyticsContext, 'all' | 'asOf' | 'versions'>,
): void {
  const checked = checkScope(viewScope(view), vocabularyOf(ctx))
  const picked = checkPicks(checked.scope, pickCatalog(ctx.versions, ctx.asOf))
  const scope = picked.scope
  const st = useStore.getState()
  const page = view.page && isRouteView(view.page.view) ? view.page : null
  batchAddress('push', () => {
    st.setFilters(scope.filters)
    st.setPicks({ version: scope.version, compare: scope.compare })
    st.setScopeStandard(scope.standard)
    setLensOn(scope.lens)
    if (page && (page.view !== st.route.view || page.tab !== st.route.tab))
      st.navigate(page.view as RouteView, page.tab, { scroll: page.view !== st.route.view })
  })
  useSavedViews.getState().setApplied(view.id)
  const notes = [
    checked.leftOut.length ? leftOutMessage(checked.leftOut, "The view's") : '',
    checked.period ? periodMessage(checked.period, "The view's") : '',
    picked.reset.length ? picksMessage(picked.reset, "The view's") : '',
  ].filter(Boolean)
  if (notes.length)
    toast(`Applied "${view.name}" without part of its scope`, { description: notes.join(' '), timeout: 9000 })
}

/** Copy a link to a scope and page (the view on screen by default), with a toast. */
export async function copyViewLink(
  opts: { scope?: UrlScope; route?: { view: RouteView; tab: string }; what?: string } = {},
): Promise<void> {
  const url = linkToView(opts.scope ?? currentScope(), opts.route ?? useStore.getState().route)
  try {
    await writeClipboard(url)
    toast('Link copied', {
      tone: 'good',
      description: `It opens ${opts.what ?? 'this view'} with the same filters, version and comparison. Only people with the same data loaded see the same numbers.`,
    })
  } catch {
    toast('The browser blocked copying', { tone: 'critical', description: url })
  }
}
