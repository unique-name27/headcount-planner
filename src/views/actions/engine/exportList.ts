/**
 * The Action center's "Export list" workbook (docs/PLAN.md 14.1 item 7, M4 review EX-7): its meta
 * names the Action center whatever view the page was opened over, and its file name follows every
 * other export's, headcount-planner-action-center-<list>-<as-of>.xlsx. Pure.
 */
import type { ExportMeta } from '@/charts/types'
import { fileStem } from '@/lib/export/names'

/** The page's view label and key, as the workbook's header and file name state them. */
export const ACTION_CENTER_VIEW = { view: 'Action center', viewKey: 'actions' } as const

/** The export meta of the list: the shell's meta with the Action center as its view. */
export const actionListMeta = (meta: ExportMeta): ExportMeta => ({ ...meta, ...ACTION_CENTER_VIEW })

/** "headcount-planner-action-center-needs-2026-09-30": the list's name and the as-of date. */
export const actionListFileName = (meta: Pick<ExportMeta, 'asOf'>, list: string): string =>
  fileStem({ ...ACTION_CENTER_VIEW, asOf: meta.asOf }, list)
