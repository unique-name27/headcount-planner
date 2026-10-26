/**
 * Finance > Export (docs/PLAN.md 9.4, 14.1 items 3, 4 and 6): the FP&A load file at Finance's rules
 * (`action:export.load-file`), the unsuppressed one for HR admin with Show pay amounts on
 * (`action:export.load-file-full`), the versions it can read, and the shown version's file as the
 * tab shows it: its control totals (`finance-export-totals`), its control totals by component
 * (`finance-export-components`, review SB-1) and its full-year rows (`finance-export-preview`).
 * Every number is the load file's own (./loadFile.ts), so the tab shows
 * what the file holds and nothing else.
 *
 * Readings taken here (finance-export builder, M4):
 *  - The version the file reads is the version shown (the header's picker, `ver`); the tab lists the
 *    shown fiscal year's Working and locked versions, and picking one moves the picker, so the
 *    totals, the preview and the file always read the same version.
 *  - HR admin with the switch on sees the file at Finance's rules on the tab (its totals and
 *    preview), and both downloads; the full file's numbers stay in the file.
 *  - Where the tab is hidden, or nobody is picked, the model is empty and builds no file. While an
 *    org filter narrows the screen the buttons say why they write nothing (./loadFile.ts
 *    `FILTERED_TEXT`) and no total or row shows: the file is the whole company's.
 */
import { FINANCE_EXPORT_LINE } from '@/access/copy'
import type { Column } from '@/charts/types'
import { hasOrgFilter } from '@/data/scope'
import { CONTROL_TOTAL_COLUMNS } from '@/lib/export/controlTotals'
import { LONG_CSV_COLUMNS, type LongRow } from '@/lib/export/longCsv'
import { ID as PLAN } from '@/views/plan/metrics'
import type { FigureData } from '../../types'
import type { FinancePrep } from './base'
import { FINANCE_FIGURES } from './figures'
import type {
  ComponentTotalRow,
  ControlTotalRow,
  ExportVersionOption,
  FinanceExport,
  LoadFileChoice,
} from './index'
import { FILTERED_TEXT, type LoadFile, loadFileOf } from './loadFile'
import { componentCents, NO_VERSION_TEXT } from './longCsv'

/** The buttons' words. */
export const LOAD_FILE_LABEL = 'Download the load file'
export const FULL_LOAD_FILE_LABEL = 'Download the load file with individual pay'

/** What each file holds, under its button. */
export const LOAD_FILE_NOTE = `${FINANCE_EXPORT_LINE} Each unit's cost centers under 5 are in its Other row, and cost shows as loaded cost.`
export const FULL_LOAD_FILE_NOTE =
  'Every cost center, component and currency, with no folds and no suppression. Its first line says it contains individual pay.'

/** The preview's columns: the rows' own, without the facts every row repeats. */
const FACT_KEYS: ReadonlySet<string> = new Set(['version', 'lockHash', 'asOf', 'proration', 'rateSet'])
const PREVIEW_COLUMNS: readonly Column<LongRow & { costed: number | null }>[] = LONG_CSV_COLUMNS.filter(
  (c) => !FACT_KEYS.has(c.key),
)

/** The tab when it is hidden or has nobody picked: no file is built. */
export const EMPTY_EXPORT: FinanceExport = Object.freeze({
  kpis: [],
  versions: [],
  loadFile: null,
  fullLoadFile: null,
  totals: null,
  preview: null,
  components: null,
}) as FinanceExport

/** The columns of the control totals by component (amounts `cost: true`, the components flagged). */
const COMPONENT_COLUMNS: readonly Column<ComponentTotalRow>[] = [
  { key: 'period', label: 'Period', format: 'text' },
  { key: 'org', label: 'Unit', format: 'text' },
  { key: 'usdBase', label: 'Base (USD)', format: 'moneyFull', cost: true },
  { key: 'usdBonus', label: 'Bonus (USD)', format: 'moneyFull', cost: true },
  { key: 'usdBurden', label: 'Burden (USD)', format: 'moneyFull', cost: true },
  { key: 'usdBenefits', label: 'Benefits (USD)', format: 'moneyFull', cost: true },
  { key: 'usdOneTime', label: 'One-time (USD)', format: 'moneyFull', cost: true },
  { key: 'usdVacancy', label: 'Vacancy allowance (USD)', format: 'moneyFull', cost: true },
  {
    key: 'bandUsd',
    label: 'Open and Planned at band estimate (USD)',
    format: 'moneyFull',
    cost: true,
    band: true,
  },
  { key: 'loadedUsd', label: 'Loaded cost (USD)', format: 'moneyFull', cost: true },
]

/** Why the table holds no row (the sample's company never splits; most units only in some months). */
export const NO_COMPONENT_SPLIT =
  'No unit splits by component in this version: a split needs 5 or more contributing positions in every component.'

/** "FY27 Budget (locked)", "FY27 Working". */
const versionLabel = (v: { name: string; state: string }): string =>
  v.state === 'locked' ? `${v.name} (locked)` : v.name

export function exportTab(p: FinancePrep): FinanceExport {
  const ctx = p.ctx
  const a = ctx.access
  if (!a.can('tab:finance.export') || a.unset) return EMPTY_EXPORT
  const v = p.version
  const year = v?.fiscalYear ?? p.fiscalYear
  const versions: ExportVersionOption[] = ctx.versions
    .filter((x) => x.fiscalYear === year && x.state !== 'retired')
    .map((x) => ({ versionId: x.versionId, label: versionLabel(x) }))
  const disabled =
    !v || v.state === 'retired' ? NO_VERSION_TEXT : hasOrgFilter(ctx.filters) ? FILTERED_TEXT : null
  const loadFile: LoadFileChoice | null = a.can('action:export.load-file')
    ? { label: LOAD_FILE_LABEL, note: LOAD_FILE_NOTE, disabled, individualPay: false }
    : null
  const fullLoadFile: LoadFileChoice | null =
    a.can('action:export.load-file-full') && ctx.guard.mode === 'open'
      ? { label: FULL_LOAD_FILE_LABEL, note: FULL_LOAD_FILE_NOTE, disabled, individualPay: true }
      : null
  const file = loadFile && !disabled && v ? loadFileOf(ctx, { versionId: v.versionId }) : null
  return {
    kpis: [],
    versions,
    loadFile,
    fullLoadFile,
    totals: file ? totalsFigure(p, file) : null,
    preview: file ? previewFigure(p, file) : null,
    components: file ? componentsFigure(p, file) : null,
  }
}

function componentsFigure(p: FinancePrep, file: LoadFile): FigureData<ComponentTotalRow> {
  // In whole cents as the file writes them, so the parts add to the loaded total (M4 recheck SB-1-a).
  const rows: ComponentTotalRow[] = file.componentTotals.map((t) => {
    const w = componentCents(t)
    return {
      period: t.period,
      org: t.label,
      usdBase: w.usdByComponent.base,
      usdBonus: w.usdByComponent.bonus,
      usdBurden: w.usdByComponent.burden,
      usdBenefits: w.usdByComponent.benefits,
      usdOneTime: w.usdByComponent.oneTime,
      usdVacancy: w.usdByComponent.vacancy,
      bandUsd: w.bandUsd,
      loadedUsd: w.loadedUsd,
      costed: t.costed,
    }
  })
  return {
    id: FINANCE_FIGURES.exportComponents,
    metric: PLAN.costLoaded,
    title: 'Control totals by component',
    subtitle: `${file.meta.plan?.version ?? ''} · each unit and the whole company where every component has 5 or more contributing positions`,
    rows,
    columns: COMPONENT_COLUMNS,
    note: null,
    empty: rows.length ? null : NO_COMPONENT_SPLIT,
    uses: p.uses(PLAN.costLoaded),
  }
}

function totalsFigure(p: FinancePrep, file: LoadFile): FigureData<ControlTotalRow> {
  const rows: ControlTotalRow[] = file.totals.map((t) => ({
    period: t.period,
    heads: t.heads,
    fte: t.fte,
    loadedUsd: t.loadedUsd,
    suppressedCells: t.suppressedCells,
    costed: file.costedByPeriod[t.period] ?? null,
  }))
  return {
    id: FINANCE_FIGURES.exportTotals,
    metric: PLAN.costLoaded,
    title: 'Control totals',
    subtitle: `${file.meta.plan?.version ?? ''} · every month, then the quarter and year to date and the full year`,
    rows,
    columns: CONTROL_TOTAL_COLUMNS as readonly Column<ControlTotalRow>[],
    note: file.note,
    empty: rows.length ? null : 'No position to load.',
    uses: p.uses(PLAN.costLoaded),
  }
}

function previewFigure(p: FinancePrep, file: LoadFile): FigureData<LongRow & { costed: number | null }> {
  // Each row with its costed people beside it (not a column): what the leak tests size it by.
  const rows = file.rows.flatMap((r, i) =>
    r.period === 'FY' ? [{ ...r, costed: file.costed[i] ?? null }] : [],
  )
  return {
    id: FINANCE_FIGURES.exportPreview,
    metric: PLAN.costLoaded,
    title: 'The load file, full year',
    subtitle: `${file.meta.plan?.version ?? ''} · one row per unit and cost center, each unit's Other last`,
    rows,
    columns: PREVIEW_COLUMNS,
    note: file.note,
    empty: rows.length ? null : 'No position to load.',
    uses: p.uses(PLAN.costLoaded),
  }
}
