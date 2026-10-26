/**
 * Export context for a figure on screen: the view and tab it sits in, the scope, window and
 * as-of date, whether the data is the sample company, the data standard in force, the mode lines,
 * the mode itself (free text reads through `managerText` in Manager mode) and the plan facts of the
 * export header (docs/PLAN.md 14.1 item 1: `planHeaderFor`, the shell's `planHeaderOf` once per
 * context and view). None of the data parts for a view that reads no data.
 */
import { planHeaderFor } from '@/app/exportMeta'
import { useCurrentView } from '@/components/currentView'
import { useAnalytics } from '@/data/context'
import { SAMPLE_COMPANY } from '@/data/sample'
import { modeMeta } from '@/lib/export/modeMeta'
import { withoutDataContext } from '@/lib/export/names'
import type { ExportMeta } from './types'

export function useExportMeta(): ExportMeta {
  const ctx = useAnalytics()
  const view = useCurrentView()
  const meta: ExportMeta = {
    view: view?.label ?? '',
    viewKey: view?.key,
    tab: view?.tabs.find((t) => t.key === view.tab)?.label,
    scope: ctx.scopeLabel,
    window: ctx.window.label,
    asOf: ctx.asOf,
    isSample: ctx.isSample,
    company: ctx.isSample ? SAMPLE_COMPANY : 'Company data',
    standard: ctx.standard,
    // Outside HR admin: "Made in HRBP mode for Silicon Engineering." and the mode's cost line (14.3).
    ...modeMeta(ctx.access),
    mode: ctx.access.mode,
    plan: planHeaderFor(ctx, view?.key),
  }
  // A view that reads no datasets exports without scope, as-of, data standard or plan facts.
  if (view?.datasets?.length !== 0) return meta
  const { plan: _plan, ...rest } = withoutDataContext(meta)
  return rest
}
