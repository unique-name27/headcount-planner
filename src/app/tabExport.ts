/**
 * What a tab's own export writes with (src/app/ExportMenu.tsx `runTab`, docs/PLAN.md 14.1): the
 * export header (`exportMetaOf`, the menu's `metaFor`) and the options (`tabExportOptions`), one pure
 * function so the leak crawl writes the files the menu writes (src/testkit/crawl.ts `tabDeck`,
 * `tabWorkbook`; review RP-1, 27 Oct 2026).
 *
 * A heads-only tab (`HEADS_ONLY_TABS`: Plan > Hiring and Plan > Recruiting summary, 9.7 and 9.8)
 * carries no long CSV control totals: those describe the view's long CSV (loaded cost in the
 * reporting currency, and with Show pay amounts on its split by component), not the tab's figures,
 * and the tab is heads only in every mode. Its header keeps its facts (rates, cost definition,
 * rounding) and, with the switch on, the "Contains individual pay" line (15.1 R105). The whole-view
 * export (`runView`) keeps the totals: it holds the cost tabs too.
 */
import { HEADS_ONLY_TABS } from '@/access/ids'
import type { ExportMeta } from '@/charts/types'
import type { AnalyticsContext } from '@/data/context'
import { SAMPLE_COMPANY } from '@/data/sample/base'
import { moneyOpts } from '@/lib/export/columns'
import { modeMeta } from '@/lib/export/modeMeta'
import type { ViewControlTotals, ViewExportOptions } from '@/lib/export/view'
import type { ViewDef } from '@/views/types'
import { buildExportMeta, planHeaderOf } from './exportMeta'

/** Whether a view's tab is heads only, so its files carry no long CSV control totals (RP-1). */
export const isHeadsOnlyTab = (view: string, tab: string): boolean =>
  HEADS_ONLY_TABS.some((t) => t.view === view && t.tab === tab)

/** Whether a tab's own files carry the long CSV's control totals: where the mode shows the long CSV, on a tab that is not heads only. */
export const tabTakesControlTotals = (ctx: AnalyticsContext, view: ViewDef, tab: string): boolean =>
  ctx.access.can('action:export.long-csv') && !isHeadsOnlyTab(view.key, tab)

/** The long CSV a view's files total: the forecast's reads the forecast, every other view the version. */
export const longSourceOf = (view: ViewDef): { source: 'forecast' | 'version' } => ({
  source: view.key === 'forecast' ? 'forecast' : 'version',
})

/** The export header of a view's files (the menu's `metaFor`): the tab's label, or "All tabs". */
export function exportMetaOf(ctx: AnalyticsContext, view: ViewDef, tabLabel: string | undefined): ExportMeta {
  return buildExportMeta({
    viewLabel: view.label,
    viewKey: view.key,
    tabLabel,
    scopeLabel: ctx.scopeLabel,
    window: ctx.window,
    asOf: ctx.asOf,
    isSample: ctx.isSample,
    sampleCompany: SAMPLE_COMPANY,
    standard: ctx.standard,
    readsData: view.datasets.length > 0,
    plan: planHeaderOf(ctx, view.key),
    mode: ctx.access.mode,
    ...modeMeta(ctx.access),
  })
}

/**
 * A tab's own export: its header and its options, the money the mode shows and, on a tab that is not
 * heads only, the control totals given (the menu reads them from the long CSV only where
 * `tabTakesControlTotals`).
 */
export function tabExportOptions(
  ctx: AnalyticsContext,
  view: ViewDef,
  tab: string,
  controlTotals?: ViewControlTotals,
): { meta: ExportMeta; opts: ViewExportOptions } {
  const meta = exportMetaOf(ctx, view, view.tabs.find((t) => t.key === tab)?.label)
  const opts = moneyOpts(ctx)
  return {
    meta,
    opts: controlTotals && !isHeadsOnlyTab(view.key, tab) ? { ...opts, controlTotals } : opts,
  }
}
