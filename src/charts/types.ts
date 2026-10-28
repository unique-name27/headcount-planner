/**
 * Contracts shared by figures, tables and exports. Types only: no React, no runtime code, so the
 * metric dictionary, the data layer and the exports can share them.
 *
 * Money columns (docs/PLAN.md 7 and 14.1). Mark every column that holds money with exactly one of
 * three flags:
 *
 * - `pay: true`: one person's amount, or a per-position amount built from pay or an offer (base
 *   salary, offer base, a Filled seat's monthly cost). Shown only to HR admin with "Show pay amounts"
 *   on (`ctx.showPay`).
 * - `cost: true`: a total over a group of costed people under the cost guard (cost by unit, the
 *   bridge, a target's cost). Shown while `ctx.showCost`: Finance, HR admin, and HRBP and Leader for
 *   their rounded totals; never in Manager mode.
 * - `band: true`: a band estimate (band midpoint × FTE plus standard loads, at plan rates). It reads
 *   no one's pay, so it shows to HRBP, Leader, Finance and HR admin, and never in Manager mode.
 *
 * ```ts
 * const columns: Column<Row>[] = [
 *   { key: 'unit', label: 'Business unit' },
 *   { key: 'heads', label: 'Heads', format: 'int' },
 *   { key: 'loadedUsd', label: 'Loaded cost (USD)', format: 'money', cost: true },
 *   { key: 'bandUsd', label: 'Band estimate (USD)', format: 'moneyFull', band: true },
 *   { key: 'baseLocal', label: 'Base (local)', format: 'moneyFull', pay: true },
 * ]
 * ```
 *
 * `Figure`, `DataTable`, every export (CSV, Excel, slides, copy, whole-view workbook and deck), the
 * records panel and calculation cards drop what the mode does not allow, through `visibleColumns`
 * in `@/lib/export`. Ratios and standard heads (trade weights) carry no flag.
 */
import type { DataStandard, Tier } from '@/data/quality/tier'
import type { Mode, Proration } from '@/data/schema'
import type { Format } from '@/lib/format'

/** A per-row format, for columns whose unit differs by row (e.g. a "Value" column holding rates and day counts). */
export type RowFormat<T = Record<string, unknown>> = (row: T) => Format

/**
 * Where the drill layer registers what a cell's `drill` returns. src/drill/Drill.tsx adds, once it
 * exists,
 *
 *   declare module '@/charts/types' { interface DrillRegistry { source: DrillSource } }
 *
 * so `CellDrill` is the drill layer's `DrillSource` without this file importing the drill layer
 * (and React). Until then a cell's drill is `unknown`.
 */
// biome-ignore lint/suspicious/noEmptyInterface: filled by declaration merging from src/drill (see above)
export interface DrillRegistry {}

/** What a column's `drill` returns: the drill layer's `DrillSource` once it registers it in `DrillRegistry`. */
export type CellDrill = DrillRegistry extends { source: infer S } ? S : unknown

/**
 * Where the drill layer registers what a cell's `calc` returns (docs/PLAN.md 9.5): src/drill/calc.ts
 * adds `declare module '@/charts/types' { interface CalcRegistry { source: CalcSource } }`, so
 * `CellCalc` is the drill layer's `CalcSource` without this file importing it.
 */
// biome-ignore lint/suspicious/noEmptyInterface: filled by declaration merging from src/drill/calc.ts (see above)
export interface CalcRegistry {}

/** What a column's `calc` returns: the drill layer's `CalcSource` once it registers it in `CalcRegistry`. */
export type CellCalc = CalcRegistry extends { source: infer S } ? S : unknown

/**
 * A column of the rows behind a figure: drives the table view and every export. The untyped
 * `Column` takes any row so typed columns (`Column<Row>`, whose per-row format reads a `Row`) fit
 * the untyped lists that registries and exports take.
 */
// biome-ignore lint/suspicious/noExplicitAny: see above; only the per-row format's parameter depends on T
export interface Column<T = any> {
  key: Extract<keyof T, string> | string
  label: string
  /** One format for the column, or one per row (`(row) => Format`); Excel gets a per-cell number format. */
  format?: Format | RowFormat<T>
  /** One person's amount, or a per-position amount built from pay or an offer: HR admin with pay amounts on only. */
  pay?: boolean
  /** A cost total over a group of costed people, under the cost guard: hidden unless `ctx.showCost`. */
  cost?: boolean
  /** A band estimate (reads no pay): hidden in Manager mode. */
  band?: boolean
  /**
   * Free text a person typed (a comment, a change, send-back, reject or exception reason, an audit
   * comment, a version name): every export reads the column through `managerText` in Manager mode and
   * in an Export for a manager file (docs/PLAN.md 14.1 item 8, `guardFreeText` in
   * `@/lib/export/freeText`). Comments are already cut to `commentVisible` by the model.
   */
  freeText?: boolean
  /**
   * `false` for an amount column whose empty cells mean "no value here" rather than "hidden" (a trend
   * point before a series starts): its cells are still written as numbers or empty, but an empty one
   * does not set the row's `Suppressed` flag (docs/PLAN.md 14.1 item 2, `withSuppressedFlag`).
   */
  flagEmpty?: false
  /**
   * The column holds the reason a row's amounts read "—" (the guard's reason): the `Why` column of
   * every export reads it (docs/PLAN.md 14.1 item 2, `withSuppressedFlag`). A column keyed `reason`
   * and labelled 'Why "—"' or 'Note' is read so without the flag.
   */
  why?: true
  align?: 'left' | 'right'
  /** Optional width hint for tables, in ch. */
  width?: number
  /**
   * Limit the column to one kind of output. 'sheets': tables on screen, Excel, CSV and copy, not
   * slides (units and long series that a slide shows inside the value or has no room for).
   * 'slides': slide tables only (a readable "+4 d" beside the numbers sheets carry).
   */
  only?: 'sheets' | 'slides'
  /**
   * The records behind a cell (usually a count): the cell becomes a button that opens the drill
   * panel. Return null for cells with nothing behind them. Not used by exports.
   */
  drill?: { bivarianceHack(row: T): CellDrill }['bivarianceHack']
  /**
   * The calculation card behind a modeled cell (docs/PLAN.md 9.5: an amount, a weighted or a
   * probability-weighted number): the cell opens the card in the drill stack. A counted cell keeps
   * `drill`; a cell with both opens its records. Return null for cells with no card. Not used by exports.
   */
  calc?: { bivarianceHack(row: T): CellCalc }['bivarianceHack']
  /**
   * A link for the cell: the table shows the value as a link that opens in a new tab. Return null
   * for no link; when it gives one it wins over `drill` for that cell. Only web, mail and same-site
   * links render. Exports keep the plain value.
   */
  href?: { bivarianceHack(row: T): string | null }['bivarianceHack']
  /**
   * What the table sorts the column by, when the value shown does not sort in order (a month
   * shown as "Apr 2026" sorts by "2026-04"). Exports keep the value shown.
   */
  sortValue?: { bivarianceHack(row: T): unknown }['bivarianceHack']
}

/**
 * One bar of a waterfall (docs/PLAN.md 9.5, `charts/kit/Waterfall` with `waterfallModel.ts`): the
 * bridge from the comparison's total to the forecast's, and the FX effect. 'start' and 'end' are
 * totals drawn from zero; 'step', 'other' ("Other changes", steps under the contributor minimum
 * folded, 7.2 rule 5) and 'rounding' (rounded modes: what `sumRounded` adds, so the steps close on
 * the end) float from the running total. The steps between the start and the end add up to the end
 * minus the start (`waterfallModel.test.ts`). A null value reads "—" and draws no bar; it never
 * counts as 0. A row type may add fields (its records, its calculation card).
 */
export interface WaterfallStep {
  /** Stable within the chart: a bridge step's key (`BridgeStepKey`), 'start', 'end', 'other' or 'rounding'. */
  key: string
  label: string
  kind: 'start' | 'step' | 'other' | 'rounding' | 'end'
  /** USD; positive raises the running total. */
  value: number | null
}

/** A row of the "datasheet" popover that defines a metric. */
export interface Definition {
  term: string
  text: string
  /** Muted formula line, e.g. "Σ band estimate ÷ Σ FTE". */
  formula?: string
}

/** What a figure registers with its view so "Export view" can collect it. */
export interface RegisteredFigure {
  id: string
  title: string
  subtitle?: string
  note?: string
  columns: Column[]
  rows: Record<string, unknown>[]
  /** The rendered chart SVG, if the figure has one. */
  getSvg: () => SVGSVGElement | null
  order: number
  /** The figure's data tier; absent when it is not gated (e.g. the Data room). */
  tier?: Tier | null
  /**
   * The data standard hides the figure: `rows` hold the reason instead of its data, and there is
   * no image. A preview shown on screen is never exported.
   */
  withheld?: boolean
  /** The metric dictionary entry the figure shows (`Figure`'s `metric`). */
  metric?: string
  /**
   * The part of a tab the figure belongs to, when one tab holds several. Set by `FigureSection`;
   * exports name it on the sheets and use its own window.
   */
  section?: ExportSection
  /**
   * Why the figure's empty amount cells are empty, when its rows do not say (the guard's reason or
   * note): the `Why` column of `withSuppressedFlag` (docs/PLAN.md 14.1 item 2). M4 freeze.
   */
  suppressedWhy?: string
  /**
   * A summary slide (docs/PLAN.md 9.8, change C38): in a deck, the figure's slide carries these
   * numbers above its chart under the summary's own title, and the figures of its tab it names in
   * `replaces` get no slide of their own. Workbooks and CSVs are unchanged.
   */
  deckSummary?: DeckSummary
}

/** One number of a summary slide, as the screen shows it ("12", "Signed offers, by start date"). */
export interface DeckNumber {
  label: string
  value: string
  note?: string
}

/** A summary slide's title, numbers and the figures of its tab it stands in for in a deck. */
export interface DeckSummary {
  title: string
  subtitle?: string
  numbers: readonly DeckNumber[]
  replaces: readonly string[]
}

/** A named part of a tab whose figures export together (`FigureSection` in `@/charts`). */
export interface ExportSection {
  /** Stable key, e.g. 'openings'. */
  key: string
  /** Its name in titles, meta lines and file names: "Openings by stage". */
  label: string
  /** Its name before a sheet name, where Excel allows 31 characters: "Openings". */
  short: string
  /**
   * The window its numbers cover when it is not the period picked ("As of 30 Sep 2026"); exports
   * state it instead of the period.
   */
  window?: string
}

/** One KPI tile or readout finding, as the contract checks read it. */
export interface FigureItemFacts {
  id: string
  metricId?: string
  /** It declares `uses`. */
  uses: boolean
  /** It opens its records or a calculation card. */
  drill: boolean
}

/**
 * What a figure on screen declares, whether or not it has rows (the registry's `track`): the
 * contract checks and the leak crawler read these. Never exported.
 */
export interface FigureFacts {
  id: string
  title: string
  metric?: string
  uses?: readonly string[]
  /** Judged against the data standard (`Figure`'s `gate`); false for figures about the app or the data itself. */
  gated: boolean
  rows: number
  tier?: Tier | null
  withheld?: boolean
  /** It has a chart image to export. */
  image: boolean
  /** 'figure' for a Figure, 'table' for a table-only registration (a KPI strip, a readout). */
  kind: 'figure' | 'table'
  /** A KPI strip's tiles or a readout's findings. */
  items?: { kind: 'kpi' | 'finding'; list: readonly FigureItemFacts[] }
  order: number
}

/**
 * The plan facts every output states (docs/PLAN.md 14.1 item 1), one source for the workbook
 * Summary, each sheet's title block, the CSV preamble, the deck's "About these numbers" slide and
 * image footers (`headerLines(meta)` in `@/lib/export`, M4). Each value is already worded.
 */
export interface PlanHeader {
  /** The version shown: "FY27 Working". */
  version: string
  versionState: 'working' | 'locked' | 'retired'
  /** 'sha256-<hex>' for a locked version; null for Working ("Working, not locked"). */
  lockHash: string | null
  /** What every "vs" figure compares with: "vs FY27 Budget", "vs FY28 target". */
  comparison: string
  proration: Proration
  /** "Plan rates (EUR 1.08, ILS 0.27)", or "Actual for closed months, forecast for open". */
  rates: string
  /** "Loaded cost: base + bonus + burden + benefits + one-time, USD", plus "incl. SBC" where it applies. */
  costDefinition: string
  /** The filters in force, in words: "Business unit: Silicon Engineering; period: FY27". */
  filters: string
  /** "Exact for groups of 5 or more", "Rounded down to $0.1M per team", or "None: HR admin with pay amounts shown". */
  rounding: string
}

/** Context stamped on every export (header rows, file names, slide footers). */
export interface ExportMeta {
  /** The view's label, e.g. "Plan". */
  view: string
  /** The view's key ('plan'); file names drop it where a figure id repeats it. */
  viewKey?: string
  tab?: string
  scope: string
  window: string
  asOf: string
  isSample: boolean
  company: string
  /** The data standard in force; every sheet, slide and CSV preamble states it. */
  standard?: DataStandard
  /**
   * The mode an export was made in, when it shapes what is in it: "Made in HRBP mode for Silicon
   * Engineering." The workbook's cover and every sheet, the deck's title slide, CSV preambles and
   * image footers state it.
   */
  modeLine?: string
  /** The mode's cost line, stated with the mode line ("Cost totals cover groups of 5 or more costed people."). */
  costLine?: string
  /** The plan facts (version, lock hash, comparison, proration, rates, cost definition, filters, rounding). */
  plan?: PlanHeader
  /**
   * The mode the output is for (an Export for a manager file is Manager mode's): free text reads
   * through `managerText` in Manager mode (docs/PLAN.md 14.1 item 8, `guardFreeText`), and a Manager
   * header states no rate, cost definition or rounding (`headerFacts`). When not given, a Manager
   * mode line says it.
   */
  mode?: Mode
}
