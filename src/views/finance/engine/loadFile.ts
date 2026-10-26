/**
 * The FP&A load file (docs/PLAN.md 14.1 item 6, 9.4 Finance > Export): the long CSV at Finance's
 * rules: exact for 5 or more, each unit's one fold, a component split only where every component
 * has 5 or more contributing positions, suppressed flags (`action:export.load-file`: Finance
 * limited, HR admin shown, with the switch off or on). The unsuppressed load file
 * (`action:export.load-file-full`) only from HR admin with Show pay amounts on: no folds and no
 * suppression, and its first header line says "Contains individual pay".
 *
 * Readings frozen here (M4 freeze, docs/CONTRACTS-M4.md):
 *  - HR admin with the switch on is offered both files: the load file at Finance's rules is written
 *    from the same data with the switch off (src/access/contextAs.ts `contextAs`), the full one from
 *    the context as it is. Made with the switch on, both start with "Contains individual pay" and
 *    HR admin's switch-on mode line, as every output made with the switch on does (lead decision
 *    D-PAYFILES, M4 recheck D-PAYFILES-a): the rows and facts of the first stay Finance's.
 *  - The file is the whole company's (Finance and HR admin have no scope), for the version picked on
 *    the tab (default: the shown version), and is never cut by the screen's filters.
 *  - File names: `headcount-planner-finance-load-file-<version>-<as-of>.csv`, and
 *    `…-load-file-full-<version>-<as-of>.csv` for the unsuppressed one.
 *
 * Readings taken here (finance-export builder, M4):
 *  - The file is written only from a screen with no org filter (no unit, department, cost center,
 *    leader, level, location, legal entity, country or currency picked; the period, version and
 *    comparison are free): it is the whole company's, so a screen narrowed to a part of it offers no
 *    file of the whole (`loadFileOf` gives null and the tab says `FILTERED_TEXT`). A screen of one
 *    cost center never hands out the company's amounts beside it (story 8: under a filter on
 *    1550-HSZ no amount shows anywhere, the load file included).
 *  - The rows are ./longCsv.ts `longRowsOf` over every position with no filter and no fit, in the
 *    exact guard (Finance, HR admin with the switch off) or the open one (the full file): the same
 *    members, folds, gate and guard the screen reads, never a second rule. A context already exact
 *    is read as it is (its filters are not read: every position, no fit), so the file's cost sets
 *    are the screen's own; only the switch-on HR admin's Finance-rules file reads `contextAs`.
 *  - The file's rows and totals are kept per loaded data, plan state, guard and version (`Memo`), so
 *    a filter change on screen never builds them again; its header is written for each context
 *    (`fileMeta`), so it names the mode, Acting as and comparison it was written in (D-MODELINE: a
 *    kept header once named Finance on HR admin's file).
 *  - Fix step (review SB-1): the file carries the control totals by component of the whole company
 *    and each unit where the guard shows their split (./longCsv.ts `ComponentTotal`), written after
 *    the control total lines (`longFileText`).
 *  - In a reader tab the file still writes (exports never take the write lock, CONTRACTS-M3 4).
 */
import { contextAs } from '@/access/contextAs'
import { WHOLE_COMPANY } from '@/access/copy'
import { NO_PICKS } from '@/access/modes'
import { buildExportMeta, planHeaderOf } from '@/app/exportMeta'
import type { ExportMeta } from '@/charts/types'
import type { GuardMode } from '@/cost/guard'
import type { AnalyticsContext } from '@/data/context'
import { periodWindow } from '@/data/fiscal'
import { SAMPLE_COMPANY } from '@/data/sample/base'
import { DEFAULT_FILTERS, hasOrgFilter } from '@/data/scope'
import type { ControlTotal } from '@/lib/export/controlTotals'
import { isAmountRow, type LongRow } from '@/lib/export/longCsv'
import { modeMeta } from '@/lib/export/modeMeta'
import { fileStem } from '@/lib/export/names'
import { isLocked } from '@/plan/engine/versions'
import type { AnyVersion } from '@/plan/types'
import { Memo } from '@/views/plan/engine/core'
import {
  type ComponentTotal,
  costedOfRows,
  everyPosition,
  longFileText,
  longRowsOf,
  versionFor,
} from './longCsv'

export interface LoadFileOptions {
  /** The version the file reads; the context's shown version when not given. */
  versionId?: string
  /** The unsuppressed file (HR admin with Show pay amounts on only). */
  full?: boolean
}

export interface LoadFile {
  rows: readonly LongRow[]
  totals: readonly ControlTotal[]
  /**
   * Its first header line is "Contains individual pay": the unsuppressed file, and the file at
   * Finance's rules made with Show pay amounts on (M4 recheck D-PAYFILES-a).
   */
  individualPay: boolean
  /** Without extension. */
  fileName: string
  /** The left-out note, else null. */
  note: string | null
  /** Added by the builder: the version the file reads. */
  versionId: string
  /** Added by the builder: the guard the rows were written under ('exact', or 'open' for the full file). */
  mode: GuardMode
  /** Added by the builder: the file's header (`headerLines`): Finance > Export, the whole company, the version's facts. */
  meta: ExportMeta
  /** Added by the builder: each row's costed people behind its amount (./longCsv.ts `costedOfRow`). */
  costed: readonly (number | null)[]
  /** Added by the builder: each period's costed people behind its loaded control total, by period key. */
  costedByPeriod: Readonly<Record<string, number | null>>
  /**
   * Fix step (review SB-1): the control totals by component of the whole company and each unit,
   * where the guard shows the split (./longCsv.ts `ComponentTotal`); empty in the full file, whose
   * rows and control totals already split every component.
   */
  componentTotals: readonly ComponentTotal[]
}

/** Why the tab writes no file while a filter narrows the screen (see the module comment). */
export const FILTERED_TEXT = "The load file is the whole company's. Clear the filters to write it."

/** The view and tab a load file is named and stamped for. */
const VIEW = { label: 'Finance', key: 'finance', tab: 'Export' } as const

/** Whether the policy hides an export action in the context's mode. */
const hidden = (ctx: AnalyticsContext, id: string): boolean => !ctx.access.can(`action:${id}`)

/** The context the file at Finance's rules is written from: the context itself when it is exact. */
function exactBase(ctx: AnalyticsContext): AnalyticsContext {
  if (ctx.guard.mode === 'exact') return ctx
  return contextAs(ctx, {
    mode: ctx.mode,
    picks: { ...NO_PICKS, [ctx.mode]: ctx.access.actingAs },
    switchOn: false,
  })
}

/** The file's header meta: the whole company, no filter, the version's full year. */
function fileMeta(base: AnalyticsContext, v: AnyVersion): ExportMeta {
  const window = periodWindow('fy', base.asOf, { fiscalYear: v.fiscalYear })
  return {
    ...buildExportMeta({
      viewLabel: VIEW.label,
      viewKey: VIEW.key,
      tabLabel: VIEW.tab,
      scopeLabel: WHOLE_COMPANY,
      window,
      asOf: base.asOf,
      isSample: base.isSample,
      sampleCompany: SAMPLE_COMPANY,
      standard: base.standard,
      plan: planHeaderOf({ ...base, version: v, filters: DEFAULT_FILTERS, window }),
      ...modeMeta(base.access),
    }),
    mode: base.mode,
  }
}

/** A file's rows and totals, kept across contexts; its header is the context's own (`fileMeta`). */
type FileBody = Omit<LoadFile, 'meta'>

const memo = new Memo<FileBody | null>()

/**
 * The load file for the context, or null where its action is hidden (the full file without the
 * switch), and while an org filter narrows the screen (`FILTERED_TEXT`).
 */
export function loadFileOf(ctx: AnalyticsContext, opts: LoadFileOptions = {}): LoadFile | null {
  const full = !!opts.full
  if (hidden(ctx, 'export.load-file') || ctx.access.unset || hasOrgFilter(ctx.filters)) return null
  if (full && (hidden(ctx, 'export.load-file-full') || ctx.guard.mode !== 'open')) return null
  const v = versionFor(ctx, opts.versionId)
  if (!v || v.state === 'retired') return null
  const base = full ? ctx : exactBase(ctx)
  const rules = base.guard.rules
  const key = [
    base.guard.mode,
    v.versionId,
    isLocked(v) ? v.hash : '',
    base.asOf,
    rules.minCosted,
    rules.minContributors,
    rules.floorUsd,
    base.isSample,
    base.standard,
  ].join('|')
  // The header is written fresh for each context: the mode line and the comparison are the
  // context's, while the rows are the same for every context with the same data, guard and version
  // (a Finance file kept here once headed HR admin's file "Made in Finance mode.").
  const body = memo.get(base.all, base.plan, key, () => build(base, v, full))
  if (!body) return null
  // Made with Show pay amounts on, the file at Finance's rules keeps Finance's rows and its facts
  // (rounding included), and starts as every output made with the switch on does: "Contains
  // individual pay", then HR admin's switch-on mode line (M4 recheck D-PAYFILES-a), as Finance >
  // Export's own figures of the same rows do.
  const switchOn = !full && base !== ctx && !!ctx.access.switchOn
  const meta = fileMeta(base, v)
  return switchOn
    ? { ...body, individualPay: true, meta: { ...meta, ...modeMeta(ctx.access) } }
    : { ...body, meta }
}

function build(base: AnalyticsContext, v: AnyVersion, full: boolean): FileBody | null {
  const ids = everyPosition(base)
  const built = longRowsOf(base, v, { ids, costIds: ids, fit: null, partial: false, source: 'version' })
  if (!built) return null
  const rows = built.rows.filter(isAmountRow)
  return {
    rows,
    totals: built.totals,
    individualPay: full,
    fileName: fileStem(
      { view: VIEW.label, viewKey: VIEW.key, asOf: base.asOf },
      `${full ? 'load-file-full' : 'load-file'}-${v.versionId}`,
    ),
    note: built.note,
    versionId: v.versionId,
    mode: base.guard.mode,
    costed: costedOfRows(rows),
    costedByPeriod: built.costedByPeriod,
    componentTotals: built.componentTotals,
  }
}

/**
 * The file's text (./longCsv.ts `longFileText`: src/lib/export/longCsv.ts `longCsvText` with its
 * header, control totals and component control totals).
 */
export function loadFileText(_ctx: AnalyticsContext, file: LoadFile): string {
  return longFileText(file.rows, file.meta, {
    mode: file.mode,
    individualPay: file.individualPay,
    totals: file.totals,
    components: file.componentTotals,
  })
}
