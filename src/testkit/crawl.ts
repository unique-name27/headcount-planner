/**
 * The leak crawler (docs/PLAN.md 16.1; the template app's `Crawl` from its managerExits test, which
 * collected strings, extended to numbers, exports and files). One crawl collects every string and
 * number a mode can reach through the pure models, in model order, each with where it was read and
 * what it is:
 *
 *  - the folder headlines of the views the mode shows, and each shown tab's model (its part of the
 *    view's model, or a model of its own: Plan > Hiring's `planHiringModel` and Plan > Recruiting
 *    summary's `planRecruitingModel`, `TAB_MODELS`): its KPI
 *    tiles (`kpisInMode`), readout findings (`findingsInMode`), heroes, figures (the columns the mode
 *    keeps, `visibleColumns`, and every cell), and the words around them;
 *  - every records list a tile, finding, figure cell or card opens, as the records panel lists it
 *    (`drill:<kind>`, `rowsInScope`, `buildDrillTable`), and every calculation card (inputs, steps,
 *    its own records);
 *  - the position card of every position a list, finding or item opens (`positionCardModel`), with
 *    its requests, reqs and audit lists;
 *  - the Action center: the tiles, every listed item and roll-up (the mode's notifications), the
 *    note each owner's "Copy note" writes, and the "Export list" rows; the masthead's count;
 *  - the Audit page and the Data room where the mode shows them; Help as the mode shows it (M4):
 *    every article (`articlesInMode`, its text as `articleText` reads it), every tour step
 *    (`toursInMode`), the glossary (`glossaryInMode` over `buildGlossary`) and the release notes;
 *    the metric dictionary as each metric's definition reads it (`metric:<id>`); and Settings >
 *    Formulas (`formulaSections`, with the setting values in force);
 *  - exports through src/lib/export as written bytes: every figure's and records list's CSV
 *    (`toCsv` with its preamble) and clipboard text (`toTsv`); the long CSV of each source the mode
 *    reads (`longCsvOf`, row by row with each amount's costed people, its control totals, its
 *    control totals by component and its text as `longFileText` writes it), and where the mode
 *    offers them the FP&A load file and the unsuppressed one (`loadFileOf`, `loadFileText`) (M4,
 *    `exports`); and, with `workbooks`
 *    (`crawlAll`), each tab's workbook (`buildWorkbook`), each view's whole-view workbook
 *    (`buildViewWorkbook`, every tab, with the long CSV's control totals), all written with ExcelJS
 *    and read back cell by cell with SheetJS, and each view's deck (`exportViewDeck`, written by
 *    pptxgenjs and read back slide by slide from the file's XML), a tab's summary slide where its
 *    screen registers one (`DECK_SUMMARIES`, docs/PLAN.md 9.8 item 5); a tab's own deck, as its
 *    Export menu writes it, on request (`tabDeck`);
 *  - the request texts the mode may read (comments by `commentVisible`; step notes, change reasons
 *    and freeze-exception reasons through `managerText`), beside the request cards of Mine and
 *    Approvals that the requests model holds;
 *  - the write path's own models (M3): Requests > New's preview of one filled-in form per type the
 *    mode offers (`newRequestForms`), Plan > Positions' seat edit models and Plan > Transfers' form,
 *    What if with a lever of every kind (`crawlLevers`), and the masthead's Workspace menu;
 *  - the workspace files the app writes (src/views/data/engine/workspace.ts): Shareable, Requests and,
 *    where the mode offers it, Export for a manager, as their JSON text and value by value;
 *  - with `imports`, Import requests as its dialog shows the files given (`importRequestsPreview`,
 *    `conflictRows`; M3 review PV-8): the summary before and after, the counts, the refusals, each
 *    conflict as listed and the copies the preview hands the dialog.
 *
 * Each value is tagged with the figure, tile or card it sits in, whether it is an amount (a money
 * column flag or format), a band estimate (guard B), a per-head figure, a component cell or one of
 * Finance's inputs (a target cost), and, where the row or card says, its costed people and
 * contributors (7.2 rules 1 and 5), so a test can tell an amount the guard lets move from one it must
 * not. A heads or FTE row of a mixed table (variance) holds counts. A tab the mode hides is not read
 * (it cannot be reached). `uses`, fingerprints and other bookkeeping are never read.
 *
 * `openShared` reads a file through the app's own "Open a shared file" (`openSharedFile`): through
 * the current mode and Acting as person, never the mode it was made in. The files and the opener are
 * the app's, so every leak test reads what a person saves and opens.
 *
 * Test code only. The crawl is synchronous apart from the workbooks.
 */
import { kindNotShown, NOT_SECURITY_LONG } from '@/access/copy'
import { findingsInMode, kpisInMode } from '@/access/numbers'
import { inScope, rowsInScope } from '@/access/records'
import { commentVisible, managerText, requestView, type Viewer, viewerOf } from '@/access/visibility'
import { buildExportMeta, planHeaderOf } from '@/app/exportMeta'
import { menuControlTotals } from '@/app/longExport'
import { formulaSections } from '@/app/settings/model'
import { longSourceOf, tabExportOptions, tabTakesControlTotals } from '@/app/tabExport'
import { WHOLE_VIEW_LABEL } from '@/app/wholeViewModel'
import type { Column, DeckSummary, ExportMeta, RegisteredFigure } from '@/charts/types'
import { gateFor } from '@/components/tier/tierModel'
import type { AnalyticsContext } from '@/data/context'
import { SAMPLE_COMPANY } from '@/data/sample'
import type { ISODate, RequestType, ViewKey } from '@/data/schema'
import { type CalcSource, type CalcSpec, isMoneyFormat, resolveCalc } from '@/drill/calc'
import { recordsOutsideLine } from '@/drill/guard'
import { positionCardModel } from '@/drill/position'
import { buildDrillTable, POSITION_KEY, rowPosition } from '@/drill/records'
import { requestsOf } from '@/drill/seats'
import { asOfLine } from '@/drill/subtitle'
import { type DrillSource, type DrillSpec, drillSpec, resolveDrill } from '@/drill/types'
import { articlesInMode, glossaryInMode, toursInMode } from '@/help/access'
import { ARTICLES } from '@/help/articles'
import { buildGlossary } from '@/help/glossary'
import { articleText, plainText } from '@/help/markup'
import { TOURS } from '@/help/tours'
import { releaseNotesIn } from '@/help/whatsNew'
import { toTsv } from '@/lib/export/clipboard'
import { moneyOpts, moneyShown, visibleColumns } from '@/lib/export/columns'
import type { ControlTotal } from '@/lib/export/controlTotals'
import { csvPreamble, toCsv } from '@/lib/export/csv'
import { type AnyLongRow, isAmountRow, longColumns } from '@/lib/export/longCsv'
import { modeMeta } from '@/lib/export/modeMeta'
import type { ExportTable } from '@/lib/export/types'
import type { FigureGroup } from '@/lib/export/view'
import type { Format } from '@/lib/format'
import { sha256 } from '@/lib/sha256'
import type { Lever } from '@/plan/engine/whatif'
import { actionsModel, composeNote, EXPORT_COLUMNS, exportRows, groupByOwner } from '@/views/actions/engine'
import type { OpenAction } from '@/views/actions/engine/collect'
import { auditModel } from '@/views/audit/engine'
import { dataModel } from '@/views/data/engine'
import { workspaceMenuOf } from '@/views/data/engine/menu'
import {
  conflictRows,
  type FileResult,
  figureOf,
  forManagerFile,
  importRequestsPreview,
  managersForExport,
  openSharedFile,
  requestsFile,
  shareableFile,
} from '@/views/data/engine/workspace'
import { financeModel } from '@/views/finance/engine'
import { loadFileOf, loadFileText } from '@/views/finance/engine/loadFile'
import { type ComponentTotal, type LongSource, longCsvOf, longFileText } from '@/views/finance/engine/longCsv'
import { forecastModel } from '@/views/forecast/engine'
import { homeModel } from '@/views/home/engine'
import { planModel } from '@/views/plan/engine'
import { seatEditOf, seatEditsOf, transferOptions } from '@/views/plan/engine/edits'
import { PLAN_FIGURES } from '@/views/plan/engine/figures'
import type { PlanRecruiting } from '@/views/plan/engine/recruitingTab'
import { VIEWS, visibleViews } from '@/views/registry'
import {
  emptyForm,
  type NewRequestForm,
  newRequestPreview,
  type RequestsNew,
  requestsModel,
} from '@/views/requests/engine'
import { TAB_MODELS } from '@/views/tabModels'
import { targetsModel } from '@/views/targets/engine'
import { teamModel } from '@/views/team/engine'
import type { FigureData, ViewDef } from '@/views/types'
import { type WhatIfLevers, whatifModel } from '@/views/whatif/engine'
import { PINNED_AT } from './sample'

/* ───────────── what a crawl collects ───────────── */

export type Value = string | number | boolean | null

/** What a value is, for the tests that tell an amount the guard lets move from one it must not. */
export interface Tag {
  /** The figure, tile, card, list or file it sits in ("plan-cost-by-unit", "tile plan.cost.loaded"). */
  in: string
  /** An amount: a column flagged `pay`, `cost` or `band`, or a money format. */
  money?: boolean
  /** A band estimate (a `band` column, or a card input or step about band estimates). */
  band?: boolean
  /** A per-head figure (a column, input or step about cost per head). */
  perHead?: boolean
  /**
   * A ratio of amounts the same tile or card shows (`RATIO_METRICS`): it moves only as they do, so
   * the move rule sizes it as an amount (src/testkit/moves.ts), and never lets it move in a rounded
   * mode.
   */
  ratio?: boolean
  /** A cost component cell (base, bonus, burden, benefits, one-time, equity). */
  component?: boolean
  /** An input set by Finance (a target cost), not an amount over anyone. */
  input?: boolean
  /** Costed people behind it, where its row or card says (7.2 rule 1). */
  costed?: number
  /** Contributors to the difference it shows, where its row or card says (7.2 rule 5). */
  contributors?: number
  /** An export or file blob, derived from values already read (it moves only when they do). */
  derived?: boolean
  /** The order of a list's rows (moves only when an amount it is ranked by moves). */
  order?: boolean
  /** Part of a calculation card: an input or a step. */
  card?: 'value' | 'input' | 'step'
  /** The label beside it (a column, input or step label). */
  label?: string
  /** The format it shows in. */
  format?: string
}

export interface Seen {
  where: string
  value: Value
  tag: Tag
}

/** What to crawl. Every part is on unless switched off. */
export interface CrawlOptions {
  /** Records lists and calculation cards behind tiles, findings and cells (default true). */
  drills?: boolean
  /** Cell drills and cards for at most this many rows of each figure (default all). */
  cellRows?: number
  /** Position cards of the positions the crawl can open (default true; a number caps how many). */
  cards?: boolean | number
  /** Also open these positions' cards, whether or not a list named them (a test's own seats). */
  cardsOf?: readonly string[]
  /** Each figure's and list's CSV and clipboard text (default true). */
  text?: boolean
  /**
   * The workspace files the app writes (default true): Shareable and Requests (src/views/data/engine/
   * workspace.ts `shareableFile`, `requestsFile`), and where the mode offers it, Export for a manager
   * for the first manager it lists (or `forManager`).
   */
  files?: boolean
  /** The manager Export for a manager is read for (an employee ID); the first listed when not given. */
  forManager?: string
  /**
   * Files to read through Import requests' preview, as its dialog shows them (`importsCrawl`); none
   * by default, since the preview needs files a person picks.
   */
  imports?: readonly { name: string; text: string; sizeBytes: number }[]
  /**
   * The write path's own models (default true): Requests > New's preview for one filled-in form per
   * type the mode offers, Plan > Positions' seat edit models and Plan > Transfers' form, and the
   * masthead's Workspace menu. (What if is read with a lever of every kind either way.)
   */
  writes?: boolean
  /** The request texts (comments, reasons) the mode may read (default true). */
  texts?: boolean
  /** The Action center, the Audit page and the Data room (default true). */
  pages?: boolean
  /** Help, the glossary and Settings > Formulas (default true). */
  help?: boolean
  /**
   * The exports beyond each figure's and list's own (M4, docs/PLAN.md 14.1 items 3, 4 and 6): the long
   * CSV of each source the mode reads, its control totals, and the load files the mode offers; and,
   * with `crawlAll`, each view's whole-view workbook and deck. Default: on, unless `views` narrows
   * the crawl (a crawl of some views reads their figures only).
   */
  exports?: boolean
  /** Only these views (default every view the mode shows). */
  views?: readonly ViewKey[]
  /**
   * Only these tabs of a tabbed view, as `<view>.<tab>` ("plan.hiring", "plan.recruiting"; default
   * every tab the mode shows). Home and My team are one model each and are read whole whatever this
   * says.
   */
  tabs?: readonly string[]
  /**
   * A records list's CSV and clipboard text in full ('text'), or its preamble, header and a digest
   * of the rest ('digest', the default: its cells are already read row by row).
   */
  recordExports?: 'text' | 'digest'
  /**
   * 'all' (the default) reads every records list and card behind every number, cell by cell, with
   * its export text. 'money' opens the same lists and cards (a heads tile's list can hold an amount
   * column, a target's cost), but reads each list as its amounts cell by cell plus a digest of every
   * other cell and of its order, with no export text: what a perturbation test compares, at a
   * fraction of the time.
   */
  focus?: 'all' | 'money'
}

/** A figure as the mode sees it: what a workbook sheet and a Shareable file carry. */
export interface FigureSnapshot {
  id: string
  title: string
  subtitle: string | null
  note: string | null
  columns: { key: string; label: string; money: boolean; band: boolean }[]
  rows: Record<string, Value>[]
}

/** What failed while crawling (a drill or card that throws is a bug on screen). */
export interface CrawlError {
  where: string
  message: string
}

/* ───────────── helpers ───────────── */

/** Keys never read: bookkeeping, not what a reader sees. */
const SKIP = new Set([
  'uses',
  'fingerprint',
  'markKey',
  'matter',
  'collected',
  'getSvg',
  'sortValue',
  'filter',
  'batch',
  'place',
  'ownerKey',
])

/** Keys holding records behind a number. */
const DRILL_KEYS = new Set(['drill', 'deltaDrill', 'noteDrill', 'itemsDrill', 'subjectDrill'])
/** Keys holding a calculation card. */
const CALC_KEYS = new Set(['calc', 'deltaCalc'])

const COMPONENT_KEYS =
  /^(usd|local)?(base|bonus|burden|benefits|oneTime|equity|vacancy|signOn|relocation|agencyFee|severance)$/i
const PER_HEAD = /per[ -]?head|perHead/i
const BAND = /band estimate|bandEstimate|bandUsd|band part|at band/i
const CONTRIBUTORS = /positions whose cost (differs|moves)|contributors|positions that moved/i
const COSTED = /^costed people$/i
/** A card line about the filled part or a whole loaded total. */
const FILLED = /filled|loaded cost =|total/i

/** Inputs set by Finance (docs/PLAN.md 12: "input, floored for HRBP and Leader"), not amounts over anyone. */
const INPUT_METRICS: ReadonlySet<string> = new Set(['targets.target.cost'])
/** Columns holding Finance's targets and the arithmetic on them alone (allocated and unallocated target cost). */ const INPUT_KEY =
  /^(target|allocated|unallocated)Cost/

/**
 * The band figures of docs/PLAN.md 12 (guard B): band estimates, read from no one's pay, shown in
 * every mode but Manager and never added to a filled total under 5.
 */
const BAND_METRICS: ReadonlySet<string> = new Set([
  'plan.cost.openBand',
  'plan.cost.bandEstimate',
  'requests.chain.leaderThreshold',
  'finance.freeze.savings',
  'finance.trade.standardHead',
  'whatif.delta.cost',
])

/**
 * Ratios of guarded amounts (docs/PLAN.md 12, guard class G), read as amounts by the move rule:
 * forecast accuracy (cost) is 1 − |forecast − actual| ÷ actual over company totals its card lists
 * as amounts (a locked reforecast's stored months and the closed months' actual), so it says nothing
 * those totals do not (review SA-1; with back-dated adjustments posted into closed months, SA-2, it
 * moves with them).
 */
const RATIO_METRICS: ReadonlySet<string> = new Set(['forecast.accuracy.cost'])

const NL = '\n'
const CRLF = '\r\n'

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

const formatOf = (f: unknown): string | undefined =>
  typeof f === 'string' ? f : isObj(f) && typeof f.format === 'string' ? f.format : undefined

const isMoney = (f: string | undefined): boolean => !!f && isMoneyFormat(f as Format)

const isFigure = (v: Record<string, unknown>): boolean =>
  typeof v.id === 'string' &&
  typeof v.metric === 'string' &&
  typeof v.title === 'string' &&
  Array.isArray(v.rows) &&
  Array.isArray(v.columns)

const isKpi = (v: unknown): boolean =>
  isObj(v) && typeof v.id === 'string' && typeof v.label === 'string' && 'value' in v && 'format' in v

const isFinding = (v: unknown): boolean =>
  isObj(v) && typeof v.id === 'string' && typeof v.severity === 'string' && typeof v.title === 'string'

const isHero = (v: Record<string, unknown>): boolean =>
  typeof v.id === 'string' &&
  typeof v.metric === 'string' &&
  Array.isArray(v.parts) &&
  'value' in v &&
  typeof v.label === 'string'

/** A row's stable key in its list, so a reorder never reads as every row changing. */
const ROW_KEYS = [
  'nodePositionId',
  'key',
  'id',
  'requestId',
  'positionId',
  'reqId',
  'employeeId',
  'versionId',
  'freezeId',
  'exceptionId',
  'orgKey',
  'costCenter',
  'month',
  'stage',
  'state',
  'status',
  'label',
]
function rowKeyOf(row: Record<string, unknown>, i: number): string {
  const parts: string[] = []
  for (const k of ROW_KEYS) {
    const v = row[k]
    if (typeof v === 'string' || typeof v === 'number') {
      parts.push(`${k}=${v}`)
      if (k !== 'orgKey' && k !== 'month' && k !== 'nodePositionId' && k !== 'costCenter') break
    }
  }
  // Variance and cell rows repeat an org per window and measure.
  for (const k of ['measure', 'window', 'windowKey', 'level', 'currency', 'costCenter']) {
    const v = row[k]
    if (typeof v === 'string' && parts.length && !parts.includes(`${k}=${v}`)) parts.push(`${k}=${v}`)
  }
  return parts.length ? parts.join(',') : `#${i}`
}

/** Distinct keys for a list's rows (a repeated key gets "#2", "#3"). */
function rowKeys(rows: readonly Record<string, unknown>[]): string[] {
  const seen = new Map<string, number>()
  return rows.map((r, i) => {
    const k = rowKeyOf(r, i)
    const n = (seen.get(k) ?? 0) + 1
    seen.set(k, n)
    return n > 1 ? `${k}#${n}` : k
  })
}

/** What a card says about the people and contributors behind it. */
function cardFacts(spec: CalcSpec | null): { costed?: number; contributors?: number } {
  if (!spec) return {}
  const out: { costed?: number; contributors?: number } = {}
  for (const i of spec.inputs) {
    if (typeof i.value !== 'number') continue
    if (COSTED.test(i.label)) out.costed = i.value
    else if (CONTRIBUTORS.test(i.label)) out.contributors = i.value
  }
  return out
}

/** The export header a view's figure is stamped with (the shell's `useExportMeta`). */
export function figureMeta(ctx: AnalyticsContext, view: ViewDef | null, tab: string | null): ExportMeta {
  return buildExportMeta({
    viewLabel: view?.label ?? '',
    ...(view ? { viewKey: view.key } : {}),
    ...(tab && view ? { tabLabel: view.tabs.find((t) => t.key === tab)?.label ?? tab } : {}),
    scopeLabel: ctx.scopeLabel,
    window: ctx.window,
    asOf: ctx.asOf,
    isSample: ctx.isSample,
    sampleCompany: SAMPLE_COMPANY,
    standard: ctx.standard,
    ...modeMeta(ctx.access),
    plan: planHeaderOf(ctx),
  })
}

/* ───────────── the crawl ───────────── */

export class Crawl {
  readonly seen: Seen[] = []
  readonly errors: CrawlError[] = []
  /** Every figure the mode showed, by id (the first place it was drawn). */
  readonly figures = new Map<string, FigureSnapshot>()
  /** Export tables per view and tab, for the workbooks, each with the id of the figure it was read from. */
  readonly tables = new Map<
    string,
    { view: ViewDef | null; tab: string | null; tables: ExportTable[]; ids: string[] }
  >()
  /** The summary slide a tab's screen registers for its deck (`DECK_SUMMARIES`), by `<view>.<tab>`. */
  readonly deckSummaries = new Map<string, TabDeckSummary>()
  /** The models of the tabs with a summary slide, by `<view>.<tab>`, for `loadDeckSummaries`. */
  private readonly summaryParts = new Map<string, { def: ViewDef; part: unknown }>()
  /** Positions the crawl can open a card for. */
  readonly positions = new Set<string>()
  strings = 0
  numbers = 0
  /** Records lists already read, by rows array, with where they were first read. */
  private readonly lists = new WeakMap<object, { where: string; lean: boolean }>()
  private readonly cardsRead = new WeakMap<object, string>()
  private readonly money: ReturnType<typeof moneyShown>
  private readonly viewer: Viewer

  constructor(
    readonly ctx: AnalyticsContext,
    readonly opts: CrawlOptions = {},
  ) {
    this.money = moneyShown(moneyOpts(ctx))
    this.viewer = viewerOf(ctx)
  }

  /* ───── values ───── */

  value(where: string, v: unknown, tag: Tag): void {
    if (v === undefined || typeof v === 'function') return
    if (v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      if (typeof v === 'string') this.strings++
      if (typeof v === 'number') this.numbers++
      this.seen.push({ where, value: v, tag })
      return
    }
    this.walk(where, v, tag)
  }

  /** Every value in an object or list, reading figures, tiles, findings, heroes, records and cards as such. */
  walk(where: string, v: unknown, tag: Tag, at: At = this.at, depth = 0): void {
    if (v === undefined || typeof v === 'function' || depth > 12) return
    if (!isObj(v)) {
      this.value(where, v, tag)
      return
    }
    if (Array.isArray(v)) {
      if (v.length && v.every(isKpi)) {
        this.kpis(where, v)
        return
      }
      if (v.length && v.every(isFinding)) {
        this.findings(where, v as never)
        return
      }
      for (const [i, x] of v.entries()) this.walk(`${where}[${i}]`, x, tag, at, depth + 1)
      return
    }
    if (ArrayBuffer.isView(v)) return
    if (isFigure(v)) {
      this.figure(where, v as unknown as FigureData<object>, at)
      return
    }
    if (isHero(v)) {
      this.hero(where, v, at)
      return
    }
    if (isKpi(v)) {
      this.kpis(where, [v])
      return
    }
    for (const [k, x] of Object.entries(v)) {
      if (SKIP.has(k)) continue
      if (DRILL_KEYS.has(k)) {
        this.leanly(true, () => this.records(`${where}.${k}`, x as DrillSource))
        continue
      }
      if (CALC_KEYS.has(k)) {
        this.card(`${where}.${k}`, x as CalcSource)
        continue
      }
      this.walk(`${where}.${k}`, x, tag, at, depth + 1)
    }
  }

  /** Where the crawl is: the view and tab a figure is decided under. */
  private at: At = {}

  /* ───── tiles, findings, heroes ───── */

  kpis(where: string, list: readonly Record<string, unknown>[]): void {
    for (const k of kpisInMode(this.ctx.access, list as { metricId?: string }[]) as Record<
      string,
      unknown
    >[]) {
      const w = `${where}/tile ${k.id as string}`
      const format = formatOf(k.format)
      const drills = this.drillsFor(isMoney(format))
      const calc = drills ? this.resolveCard(`${w}.calc`, k.calc as CalcSource) : null
      const deltaCalc = drills ? this.resolveCard(`${w}.deltaCalc`, k.deltaCalc as CalcSource) : null
      const tag: Tag = {
        in: `tile ${(k.metricId as string) ?? k.id}`,
        ...(isMoney(format) ? { money: true } : {}),
        ...(isMoney(format) && INPUT_METRICS.has(k.metricId as string) ? { input: true } : {}),
        ...(isMoney(format) && BAND_METRICS.has(k.metricId as string) ? { band: true } : {}),
        ...(!isMoney(format) && RATIO_METRICS.has(k.metricId as string) ? { ratio: true } : {}),
        ...(format ? { format } : {}),
        ...cardFacts(calc),
      }
      for (const key of ['label', 'deltaLabel', 'note', 'suppressedNote', 'formula', 'definition', 'tab'])
        this.value(`${w}.${key}`, k[key], { in: tag.in })
      this.value(`${w}.value`, k.value, tag)
      this.value(`${w}.suppressed`, k.suppressed ?? false, { in: tag.in })
      this.value(`${w}.delta`, k.delta, {
        ...tag,
        ...cardFacts(deltaCalc),
        ...(deltaCalc ? {} : { contributors: undefined }),
      })
      if (Array.isArray(k.spark)) this.value(`${w}.spark`, k.spark, tag)
      if (isObj(k.link)) this.value(`${w}.link`, k.link.label, { in: tag.in })
      if (!drills) continue
      this.leanly(!isMoney(format), () => {
        for (const d of ['drill', 'deltaDrill', 'noteDrill']) this.records(`${w}.${d}`, k[d] as DrillSource)
        if (calc) this.cardOf(`${w}.calc`, calc)
        if (deltaCalc) this.cardOf(`${w}.deltaCalc`, deltaCalc)
      })
    }
  }

  findings(where: string, list: readonly Record<string, unknown>[]): void {
    for (const f of findingsInMode(this.ctx.access, list as never) as Record<string, unknown>[]) {
      const w = `${where}/finding ${f.id as string}`
      const tag: Tag = { in: `finding ${(f.metricId as string) ?? f.id}` }
      for (const key of ['severity', 'title', 'detail', 'action', 'filterLabel', 'tab', 'positionsTotal'])
        this.value(`${w}.${key}`, f[key], tag)
      for (const p of (f.positions as { positionId: string; title: string; note?: string }[]) ?? []) {
        this.value(`${w}.positions.${p.positionId}`, [p.title, p.note ?? null], tag)
        this.positions.add(p.positionId)
      }
      if (!this.drillsFor(false)) continue
      this.leanly(true, () => {
        this.records(`${w}.drill`, f.drill as DrillSource)
        this.card(`${w}.calc`, f.calc as CalcSource)
      })
    }
  }

  hero(where: string, h: Record<string, unknown>, at: At): void {
    const id = h.id as string
    if (!this.figureShown(id, h.metric as string, at)) return
    const w = `${where}/hero ${id}`
    const format = formatOf(h.format)
    const drills = this.drillsFor(isMoney(format))
    const calc = drills ? this.resolveCard(`${w}.calc`, h.calc as CalcSource) : null
    const tag: Tag = { in: id, ...(isMoney(format) ? { money: true } : {}), ...cardFacts(calc) }
    for (const key of ['title', 'subtitle', 'label', 'note', 'reason'])
      this.value(`${w}.${key}`, h[key], { in: id })
    this.value(`${w}.value`, h.value, tag)
    if (isObj(h.comparison)) {
      this.value(`${w}.comparison.label`, h.comparison.label, { in: id })
      this.value(`${w}.comparison.value`, h.comparison.value, tag)
    }
    for (const p of h.parts as Record<string, unknown>[]) {
      this.value(`${w}.parts.${p.key as string}`, [p.label, p.count] as never, { in: id })
      if (drills)
        this.leanly(true, () => this.records(`${w}.parts.${p.key as string}.drill`, p.drill as DrillSource))
    }
    if (!drills) return
    this.leanly(!isMoney(format), () => {
      this.records(`${w}.drill`, h.drill as DrillSource)
      if (calc) this.cardOf(`${w}.calc`, calc)
    })
  }

  /* ───── figures ───── */

  private figureShown(id: string, metric: string | undefined, at: At): boolean {
    const a = this.ctx.access
    const where = at.view ? { view: at.view, ...(at.tab ? { tab: at.tab } : {}) } : undefined
    return a.can(`figure:${id}`, where) && (!metric || a.can(`metric:${metric}`))
  }

  figure(where: string, f: FigureData<object>, at: At = this.at): void {
    if (!this.figureShown(f.id, f.metric, at)) return
    const w = `${where}/figure ${f.id}`
    const tag: Tag = { in: f.id }
    for (const key of ['title', 'subtitle', 'note', 'empty'] as const) this.value(`${w}.${key}`, f[key], tag)
    const cols = visibleColumns(f.columns as readonly Column[], this.money) as Column[]
    this.value(
      `${w}.columns`,
      cols.map((c) => c.label),
      tag,
    )
    const rows = f.rows as readonly Record<string, unknown>[]
    const keys = rowKeys(rows)
    this.value(`${w}.order`, keys.join(' | '), { ...tag, order: true })
    const snapshot: FigureSnapshot = {
      id: f.id,
      title: f.title,
      subtitle: f.subtitle ?? null,
      note: f.note ?? null,
      columns: cols.map((c) => ({
        key: c.key,
        label: c.label,
        money: !!(c.pay || c.cost || c.band),
        band: !!c.band && !c.pay && !c.cost,
      })),
      rows: [],
    }
    const cellLimit = this.opts.cellRows ?? Number.POSITIVE_INFINITY
    const moneyCols = cols.some((c) => this.cellTag(f.id, c, {}).money)
    rows.forEach((r, i) => {
      const rw = `${w}/r ${keys[i]}`
      const rowTag = this.rowFacts(r)
      const shot: Record<string, Value> = {}
      if (typeof r.positionId === 'string') this.positions.add(r.positionId)
      if (typeof r[POSITION_KEY] === 'string') this.positions.add(r[POSITION_KEY] as string)
      for (const c of cols) {
        const v = r[c.key]
        this.value(`${rw}.${c.key}`, v, this.cellTag(f.id, c, rowTag, r))
        shot[c.key] = isObj(v) ? JSON.stringify(v) : ((v ?? null) as Value)
        const cellMoney = !!this.cellTag(f.id, c, {}, r).money
        if (i >= cellLimit || !this.drillsFor(cellMoney)) continue
        this.leanly(!cellMoney, () => {
          if (c.drill)
            this.records(
              `${rw}.${c.key}.drill`,
              safe(() => c.drill?.(r as never) ?? null, this, rw),
            )
          const cc = (c as { calc?: (row: never) => CalcSource }).calc
          if (cc)
            this.card(
              `${rw}.${c.key}.calc`,
              safe(() => cc(r as never), this, rw),
            )
        })
      }
      snapshot.rows.push(shot)
      if (i >= cellLimit || !this.drillsFor(moneyCols)) return
      // A chart bar opens its row's own records or card (the bridge's steps).
      this.leanly(!moneyCols, () => {
        if (r.drill && !cols.some((c) => c.key === 'drill'))
          this.records(`${rw}.drill`, r.drill as DrillSource)
        if (r.calc && !cols.some((c) => c.key === 'calc')) this.card(`${rw}.calc`, r.calc as CalcSource)
      })
    })
    if (!this.figures.has(f.id)) this.figures.set(f.id, snapshot)
    if (this.opts.text !== false && rows.length) {
      const table: ExportTable = {
        name: f.title,
        title: f.title,
        ...(f.subtitle ? { subtitle: f.subtitle } : {}),
        ...(f.note ? { note: f.note } : {}),
        columns: f.columns as readonly Column[],
        rows,
      }
      this.exportText(w, table, f.id)
      const key = `${at.view ?? 'page'}.${at.tab ?? ''}`
      let group = this.tables.get(key)
      if (!group) {
        group = { view: at.def ?? null, tab: at.tab ?? null, tables: [], ids: [] }
        this.tables.set(key, group)
      }
      group.tables.push(table)
      group.ids.push(f.id)
    }
  }

  /** Whether to open the records and cards behind a number (an amount, or not). */
  private drillsFor(_amount: boolean): boolean {
    return this.opts.drills !== false
  }

  /** Behind a number that is not an amount (money focus): lists are read for their amounts only. */
  private lean = false

  /** Runs `fn` with the lists it opens read lean when `lean` (or already inside a lean list). */
  private leanly(lean: boolean, fn: () => void): void {
    const before = this.lean
    this.lean = before || lean
    try {
      fn()
    } finally {
      this.lean = before
    }
  }

  /** What a row says about the people behind it. */
  private rowFacts(r: Record<string, unknown>): Partial<Tag> {
    const out: Partial<Tag> = {}
    if (typeof r.costed === 'number') out.costed = r.costed
    if (typeof r.contributors === 'number') out.contributors = r.contributors
    return out
  }

  /**
   * A cell's tag. A row whose own `measure` is heads or FTE (a variance table mixes measures in one
   * set of columns) holds counts in every cell.
   */
  private cellTag(figure: string, c: Column, row: Partial<Tag>, r?: Record<string, unknown>): Tag {
    const format = formatOf(c.format)
    const counts = r?.measure === 'heads' || r?.measure === 'fte'
    const money = !counts && (!!(c.pay || c.cost || c.band) || isMoney(format))
    const text = `${c.key} ${c.label}`
    return {
      in: figure,
      label: c.label,
      ...(format ? { format } : {}),
      ...(money ? { money: true } : {}),
      ...(c.band || (money && BAND.test(text)) ? { band: true } : {}),
      ...(money && PER_HEAD.test(text) ? { perHead: true } : {}),
      ...(money && COMPONENT_KEYS.test(c.key) ? { component: true } : {}),
      ...(money && INPUT_KEY.test(c.key) ? { input: true } : {}),
      ...(money ? row : {}),
    }
  }

  /** A table's CSV (with its preamble) and clipboard text, as the export writes them. */
  private exportText(
    where: string,
    table: ExportTable,
    inId: string,
    meta?: ExportMeta,
    as: 'text' | 'digest' = 'text',
  ): void {
    const m = meta ?? figureMeta(this.ctx, this.at.def ?? null, this.at.tab ?? null)
    const opts = moneyOpts(this.ctx)
    // As `downloadCsv` writes it: the money flags decide "Contains individual pay" (D-PAYFILES).
    const preamble = csvPreamble(table, m, moneyShown(opts))
    const csv = toCsv(table, { ...opts, preamble })
    const tsv = toTsv(table, opts)
    const tag: Tag = { in: inId, derived: true }
    if (as === 'text') {
      this.value(`${where}.csv`, csv, tag)
      this.value(`${where}.tsv`, tsv, tag)
      return
    }
    // A records list's file: its preamble and header as written, and a digest of the whole text
    // (its cells are the rows read above, in the same order).
    const header = csv.split(CRLF)[preamble.length + 1] ?? ''
    this.value(`${where}.csv`, [...preamble, header] as never, tag)
    this.value(`${where}.csvDigest`, sha256(csv), tag)
    this.value(`${where}.tsvDigest`, sha256(tsv), tag)
  }

  /* ───── records and cards ───── */

  records(where: string, src: DrillSource, depth = 0): void {
    if (!src || this.opts.drills === false) return
    let spec: DrillSpec | null
    try {
      spec = resolveDrill(src)
    } catch (e) {
      this.errors.push({ where, message: (e as Error).message })
      return
    }
    if (!spec) return
    const w = `${where}/records ${spec.kind}`
    const tag: Tag = { in: `records ${spec.kind}: ${spec.title}` }
    if (!this.ctx.access.can(`drill:${spec.kind}`)) {
      this.value(`${w}.hidden`, kindNotShown(this.ctx.access.mode), tag)
      return
    }
    const lean = this.opts.focus === 'money' && this.lean
    const first = this.lists.get(spec.rows as object)
    // A list read in full is read; a list read lean is read again in full when an amount opens it.
    if (first && (lean || !first.lean)) {
      this.value(`${w}.same`, `${spec.title} | ${first.where}`, tag)
      return
    }
    this.lists.set(spec.rows as object, { where: w, lean })
    const { rows, leftOut } = rowsInScope(spec, this.ctx)
    const scoped = leftOut ? { ...spec, rows } : spec
    let table: ReturnType<typeof buildDrillTable>
    try {
      table = buildDrillTable(scoped, this.ctx)
    } catch (e) {
      this.errors.push({ where: w, message: (e as Error).message })
      return
    }
    for (const key of ['title', 'subtitle', 'note'] as const) this.value(`${w}.${key}`, scoped[key], tag)
    this.value(`${w}.outside`, recordsOutsideLine(this.ctx.access, leftOut), tag)
    const cols = visibleColumns(table.columns, this.money) as Column[]
    this.value(
      `${w}.columns`,
      cols.map((c) => c.label),
      tag,
    )
    const keys = rowKeys(table.rows)
    if (lean) {
      // Behind a count: only the amount cells, row by row (a heads tile's list can hold one).
      const moneyCols = cols.filter((c) => this.cellTag(tag.in, c, {}).money)
      if (!moneyCols.length) return
      table.rows.forEach((r, i) => {
        const facts = this.rowFacts(r)
        for (const c of moneyCols)
          this.value(`${w}/r ${keys[i]}.${c.key}`, r[c.key], this.cellTag(tag.in, c, facts, r))
      })
      return
    }
    if (this.opts.focus === 'money') {
      this.moneyRows(w, tag, cols, table.rows, keys)
      return
    }
    // Each distinct row is read once per kind (a position listed under twelve month-ends reads the
    // same); the list itself is the order of its rows' ids.
    const ids = table.rows.map((r, i) => this.recordRow(spec.kind, keys[i], cols, r, depth))
    this.value(`${w}.rows`, ids.join(' | '), { ...tag, order: true })
    if (this.opts.text !== false && table.rows.length && this.ctx.access.can('export:records'))
      this.exportText(
        w,
        {
          name: scoped.title,
          title: scoped.title,
          ...(scoped.subtitle ? { subtitle: scoped.subtitle } : {}),
          ...(scoped.note ? { note: scoped.note } : {}),
          columns: table.columns,
          rows: table.rows,
        },
        tag.in,
        undefined,
        this.opts.recordExports ?? 'digest',
      )
  }

  /**
   * A records list as a perturbation test compares it: its amounts cell by cell, a digest of every
   * other cell (rows in key order, so a reorder alone reads as `order`), and the order.
   */
  private moneyRows(
    w: string,
    tag: Tag,
    cols: readonly Column[],
    rows: readonly Record<string, unknown>[],
    keys: readonly string[],
  ): void {
    const plain: string[] = []
    rows.forEach((r, i) => {
      const facts = this.rowFacts(r)
      const cells: unknown[] = [keys[i]]
      for (const c of cols) {
        const t = this.cellTag(tag.in, c, facts, r)
        if (t.money) this.value(`${w}/r ${keys[i]}.${c.key}`, r[c.key], t)
        else cells.push(r[c.key] ?? null)
      }
      plain.push(JSON.stringify(cells))
      const id = rowPosition(this.ctx, r)
      if (id) this.positions.add(id)
    })
    this.value(`${w}.cells`, sha256(plain.slice().sort().join(NL)), tag)
    this.value(`${w}.order`, sha256(keys.join('|')), { ...tag, order: true })
  }

  /** Distinct record rows read so far, by kind and row key: their content and id. */
  private readonly recordRows = new Map<string, { content: string; id: string }[]>()

  /** One records row, read the first time its content is seen; its id either way. */
  private recordRow(
    kind: string,
    key: string,
    cols: readonly Column[],
    r: Record<string, unknown>,
    depth: number,
  ): string {
    const content = JSON.stringify(cols.map((c) => r[c.key] ?? null))
    const slot = `${kind}/${key}`
    const list = this.recordRows.get(slot) ?? []
    const hit = list.find((x) => x.content === content)
    const id = rowPosition(this.ctx, r)
    if (id) this.positions.add(id)
    if (hit) return hit.id
    const rowId = list.length ? `${key}~${list.length + 1}` : key
    list.push({ content, id: rowId })
    this.recordRows.set(slot, list)
    const rw = `rows ${kind}/${rowId}`
    const facts = this.rowFacts(r)
    for (const c of cols) {
      this.value(`${rw}.${c.key}`, r[c.key], this.cellTag(`records ${kind}`, c, facts, r))
      if (c.drill && depth < 1)
        this.records(
          `${rw}.${c.key}.drill`,
          safe(() => c.drill?.(r) ?? null, this, rw),
          depth + 1,
        )
    }
    return rowId
  }

  private resolveCard(where: string, src: CalcSource): CalcSpec | null {
    if (!src) return null
    try {
      return resolveCalc(src)
    } catch (e) {
      this.errors.push({ where, message: (e as Error).message })
      return null
    }
  }

  card(where: string, src: CalcSource): void {
    if (this.opts.drills === false) return
    const spec = this.resolveCard(where, src)
    if (spec) this.cardOf(where, spec)
  }

  cardOf(where: string, spec: CalcSpec): void {
    const first = this.cardsRead.get(spec)
    const w = `${where}/card`
    if (first) {
      this.value(`${w}.same`, first, { in: `card ${spec.title}` })
      return
    }
    this.cardsRead.set(spec, w)
    const facts = cardFacts(spec)
    const inId = `card ${spec.metricId}: ${spec.title}`
    const bandCard = BAND_METRICS.has(spec.metricId)
    const ratioCard = RATIO_METRICS.has(spec.metricId)
    const amount = (label: string, format: string): Partial<Tag> => {
      const money = isMoney(format)
      return {
        format,
        label,
        ...(money ? { money: true, ...facts } : {}),
        // The ratio itself (the card's value and its last step), read as the amounts it is made of.
        ...(!money && ratioCard && format === 'pct' ? { ratio: true, ...facts } : {}),
        // A step that adds the filled part to the band line ("filled part + Open and Planned at band
        // estimate") is a total, not a band figure.
        ...(money && (bandCard || BAND.test(label)) && !FILLED.test(label) ? { band: true } : {}),
        ...(money && PER_HEAD.test(label) ? { perHead: true } : {}),
        ...(money && /^(fy\d+ )?target\b|target cost/i.test(label) ? { input: true } : {}),
      }
    }
    for (const key of ['title', 'subtitle', 'note'] as const)
      this.value(`${w}.${key}`, spec[key], { in: inId })
    this.value(`${w}.value`, spec.value, { in: inId, card: 'value', ...amount(spec.title, spec.format) })
    spec.inputs.forEach((x, i) => {
      const iw = `${w}.inputs[${i}]`
      this.value(`${iw}.label`, x.label, { in: inId })
      this.value(`${iw}.source`, x.source, { in: inId })
      this.value(`${iw}.level`, x.level ?? null, { in: inId })
      const fmtTag = amount(`${x.label} ${x.source}`, x.format)
      this.value(`${iw}.value`, x.value, { in: inId, card: 'input', ...fmtTag, label: x.label })
    })
    spec.steps.forEach((s, i) => {
      const sw = `${w}.steps[${i}]`
      this.value(`${sw}.label`, s.label, { in: inId })
      // An expression restates the step's inputs: band amounts on a band figure's card, else the
      // totals before and after the step ("Position changes (band estimates only)" is a total's step).
      const { band, ...asText } = amount(s.label, s.format)
      this.value(`${sw}.expression`, s.expression, {
        in: inId,
        card: 'step',
        ...asText,
        ...(band && bandCard ? { band } : {}),
      })
      this.value(`${sw}.result`, s.result, { in: inId, card: 'step', ...amount(s.label, s.format) })
    })
    if (spec.comparison) {
      this.value(`${w}.comparison.label`, spec.comparison.label, { in: inId })
      // The comparison is read by its own label ("FY27 target": an input).
      this.value(`${w}.comparison.value`, spec.comparison.value, {
        in: inId,
        card: 'value',
        ...amount(spec.comparison.label, spec.format),
        ...(isMoney(spec.format) && /target/i.test(spec.comparison.label) ? { input: true } : {}),
      })
    }
    this.records(`${w}.rows`, spec.rows ?? null)
  }

  /* ───── the parts of the app ───── */

  /** The folder headline of every shown view, and each shown tab's model. */
  views(): void {
    const ctx = this.ctx
    for (const v of visibleViews(ctx.access)) {
      if (this.opts.views && !this.opts.views.includes(v.key)) continue
      const read = MODELS[v.key]
      if (!read) continue
      this.at = { view: v.key, def: v }
      try {
        const h = v.headline(ctx)
        // A headline is one figure of the whole scope in words: an amount when it prints one.
        this.value(`view ${v.key}/headline`, h, {
          in: `headline ${v.key}`,
          ...(JSON.stringify(h).includes('$') ? { money: true } : {}),
        })
      } catch (e) {
        this.errors.push({ where: `view ${v.key}/headline`, message: (e as Error).message })
      }
      // A tab the mode hides is not reachable (the route guard opens the mode's home instead); a
      // crawl narrowed to some tabs (`tabs`) reads only those of a tabbed view.
      const tabs = v.tabs.filter(
        (t) =>
          WHOLE_MODEL.has(v.key) ||
          (ctx.access.can(`tab:${v.key}.${t.key}`) &&
            (!this.opts.tabs || this.opts.tabs.includes(`${v.key}.${t.key}`))),
      )
      // The view's model, read once, when a tab reads it (a tab with a model of its own does not).
      const needed = tabs.some((t) => !TAB_MODELS[`${v.key}.${t.key}`])
      let model: unknown = null
      if (needed) {
        try {
          model = read(ctx)
        } catch (e) {
          this.errors.push({ where: `view ${v.key}`, message: (e as Error).message })
          continue
        }
        if (model == null) continue
      }
      for (const t of tabs) {
        this.at = { view: v.key, tab: t.key, def: v }
        const where = `view ${v.key}/tab ${t.key}`
        const own = TAB_MODELS[`${v.key}.${t.key}`]
        const part = own
          ? safe(() => own(ctx), this, where)
          : WHOLE_MODEL.has(v.key)
            ? model
            : (model as Record<string, unknown>)[t.key]
        this.walk(where, part, { in: `${v.key}.${t.key}` })
        if (DECK_SUMMARIES[`${v.key}.${t.key}`] && part != null)
          this.summaryParts.set(`${v.key}.${t.key}`, { def: v, part })
        if (this.opts.writes !== false) this.writeSurfaces(v, t.key, part)
      }
    }
    this.at = {}
  }

  /**
   * The write path's models a tab draws beside its own (docs/PLAN.md 9.4; M3): Requests > New's
   * preview of one filled-in form per type the mode offers (the chain, the band estimate, the gap after
   * approval, the quote card and the refusal, as the Save button would see them), and Plan's seat edit
   * and transfer forms. Each is read under its tab, so its figures follow the tab's decisions.
   */
  private writeSurfaces(v: ViewDef, tab: string, part: unknown): void {
    const ctx = this.ctx
    const w = `view ${v.key}/tab ${tab}`
    const tag: Tag = { in: `${v.key}.${tab}` }
    if (v.key === 'requests' && tab === 'new' && part)
      for (const form of newRequestForms(ctx, part as RequestsNew)) {
        const where = `${w}/preview ${form.type}`
        const preview = safe(() => newRequestPreview(ctx, form), this, where)
        if (preview) this.walk(where, preview, tag)
      }
    if (v.key === 'plan' && tab === 'positions') {
      const edits = safe(() => seatEditsOf(ctx), this, `${w}/edits`)
      if (!edits) return
      this.walk(`${w}/edits`, edits, tag)
      for (const seat of [...edits.seats.slice(0, 4), ...edits.others.slice(0, 2)]) {
        const where = `${w}/edit ${seat.positionId}`
        const facts = safe(() => seatEditOf(ctx, seat.positionId), this, where)
        if (facts) this.walk(where, facts, tag)
      }
    }
    if (v.key === 'plan' && tab === 'transfers') {
      const options = safe(() => transferOptions(ctx), this, `${w}/transfer form`)
      if (options) this.walk(`${w}/transfer form`, options, tag)
    }
  }

  /** The Action center (every mode lists its items), the Audit page and the Data room where shown. */
  pages(): void {
    const ctx = this.ctx
    const a = ctx.access
    if (a.can('page:actions')) {
      this.at = { view: 'actions' as ViewKey }
      const m = actionsModel(ctx, VIEWS)
      this.value('page actions/count', [m.count, m.critical, m.left, m.lists] as never, {
        in: 'masthead actions',
      })
      this.kpis('page actions', m.kpis as never)
      const listed = new Map<string, OpenAction>()
      const add = (list: readonly OpenAction[]) => {
        for (const x of list) {
          if (!listed.has(x.id)) listed.set(x.id, x)
          if (x.members) add(x.members)
        }
      }
      for (const list of [m.items, m.needs, m.waiting, m.parked]) add(list)
      for (const [id, x] of listed) this.item(`page actions/item ${id}`, x)
      for (const [name, list] of [
        ['needs', m.needs],
        ['waiting', m.waiting],
      ] as const)
        this.value(
          `page actions/${name}`,
          list.map((x) => x.id),
          { in: `actions ${name}` },
        )
      const me = a.actingAs?.name ?? null
      for (const g of groupByOwner(m.items, ctx.asOf))
        for (const o of g.owners)
          this.value(
            `page actions/note ${o.key}`,
            composeNote({ name: o.name, isTeam: o.isTeam }, o.items, ctx.asOf, { me }),
            { in: 'actions note' },
          )
      if (a.can('export:action-list') && this.opts.text !== false)
        this.exportText(
          'page actions/export',
          {
            name: 'Action list',
            title: 'Open items',
            columns: EXPORT_COLUMNS as readonly Column[],
            rows: exportRows(m.items, ctx.asOf),
          },
          'actions export',
        )
    }
    if (a.can('page:audit')) {
      this.at = { view: 'audit' as ViewKey }
      this.walk('page audit', auditModel(ctx), { in: 'audit' })
    }
    // The masthead's Workspace menu: what each item says in this mode (M3).
    if (this.opts.writes !== false && a.can('masthead:workspace')) {
      this.at = {}
      this.walk('masthead workspace', workspaceMenuOf(ctx), { in: 'workspace menu' })
    }
    if (a.can('page:data')) {
      const m = dataModel(ctx)
      const parts: Record<string, unknown[]> = {
        datasets: [m.datasets],
        quality: [m.quality, m.qualityFigures],
        metrics: [m.metrics],
        lists: [m.lists],
        workspace: [m.workspace],
      }
      for (const [tab, list] of Object.entries(parts)) {
        if (!a.can(`data:${tab}`)) continue
        this.at = { view: 'data' as ViewKey, tab }
        list.forEach((x, i) => {
          this.walk(`page data/tab ${tab}[${i}]`, x, { in: `data.${tab}` })
        })
      }
    }
    this.at = {}
  }

  /** One Action center item (a notification): every word it shows, and its records. */
  item(where: string, x: OpenAction): void {
    const i = x.item
    const tag: Tag = { in: `item ${i.id}` }
    this.value(
      where,
      {
        what: i.what,
        note: i.note ?? null,
        forOwner: i.forOwner ?? null,
        subject: i.subject.label,
        owner: x.ownerName,
        role: x.roleLabel,
        due: i.due ?? null,
        severity: i.severity,
        from: x.from,
        kind: i.kind ?? null,
        closesWhen: i.closesWhen ?? null,
        alsoFrom: x.alsoFrom.join(', '),
        members: x.members?.length ?? null,
      } as never,
      tag,
    )
    if (x.positionId) this.positions.add(x.positionId)
    if (this.opts.drills !== false) this.leanly(true, () => this.records(`${where}.drill`, i.drill ?? null))
  }

  /**
   * Help as the mode shows it (M4: every article, tour step, glossary entry and release note, through
   * the help's own mode filters), the metric dictionary as each figure's definition reads it, and
   * Settings > Formulas.
   */
  help(): void {
    const ctx = this.ctx
    const a = ctx.access
    if (a.can('masthead:help')) {
      this.value('help/not security', NOT_SECURITY_LONG, { in: 'help' })
      for (const art of articlesInMode(a, ARTICLES)) {
        const tag: Tag = { in: `help article ${art.id}` }
        this.value(`help/article ${art.id}`, articleText(art), tag)
        // Each note with the items the mode lists, as the What's new article shows them (review HL-10).
        if (art.generated === 'whats-new')
          for (const n of releaseNotesIn(a))
            this.value(`help/article ${art.id}/note ${n.date} ${n.title}`, [n.title, ...n.items], tag)
      }
      for (const t of toursInMode(a, TOURS)) {
        const tag: Tag = { in: `help tour ${t.id}` }
        this.value(`help/tour ${t.id}`, [t.title, t.summary], tag)
        t.steps.forEach((st, i) => {
          this.value(`help/tour ${t.id}/step ${i + 1}`, [st.title, plainText(st.body)], tag)
        })
      }
      for (const e of glossaryInMode(a, buildGlossary(ctx.metrics.list)))
        this.value(`help/glossary ${e.id}`, [e.term, e.definition, e.formula ?? null, e.where], {
          in: `help glossary ${e.id}`,
        })
    }
    for (const d of ctx.metrics.list) {
      if (!a.can(`metric:${d.id}`)) continue
      this.value(
        `glossary ${d.id}`,
        [d.name, d.definition, d.formula ?? null, d.population ?? null, d.window ?? null],
        {
          in: `glossary ${d.id}`,
        },
      )
    }
    if (a.can('settings:formulas'))
      for (const s of formulaSections(ctx))
        for (const r of s.rows)
          this.value(
            `formulas ${s.key} ${r.id}`,
            [
              r.name,
              r.definition,
              r.formula,
              r.population,
              r.window,
              ...r.settings.flatMap((x) => [x.label, x.value]),
            ],
            { in: `formulas ${r.id}` },
          )
  }

  /* ───── the long CSV, control totals and the load files (M4) ───── */

  /**
   * The long CSV of each source the mode reads (the version shown; the forecast where the Forecast
   * view shows), row by row with each amount's costed people, its control totals and its text; the
   * FP&A load file and, with Show pay amounts on in HR admin, the unsuppressed one.
   */
  longExports(): void {
    const ctx = this.ctx
    const a = ctx.access
    if (a.can('action:export.long-csv')) {
      const sources: LongSource[] = a.can('view:forecast') ? ['version', 'forecast'] : ['version']
      for (const source of sources) {
        const where = `export long-csv ${source}`
        const m = safe(() => longCsvOf(ctx, { source }), this, where)
        if (!m) continue
        this.value(`${where}.empty`, m.empty, { in: where })
        this.value(`${where}.note`, m.note, { in: where })
        this.longRows(where, m.rows, m.costed, m.mode)
        this.controlTotals(where, m.totals, m.costedByPeriod)
        this.componentTotals(where, m.componentTotals)
        if (this.opts.text !== false && m.rows.length && m.plan) {
          const meta: ExportMeta = { ...figureMeta(ctx, null, null), plan: m.plan }
          // As the Export menu writes it (src/views/finance/engine/longCsv.ts `longFileText`).
          const text = longFileText(m.rows, meta, {
            mode: m.mode,
            totals: m.totals,
            components: m.componentTotals,
            individualPay: m.mode === 'open',
          })
          this.value(`${where}.csv`, text, { in: where, derived: true })
        }
      }
    }
    for (const full of [false, true]) {
      const where = full ? 'file load-file-full' : 'file load-file'
      const f = safe(() => loadFileOf(ctx, { full }), this, where)
      if (!f) continue
      this.value(`${where}.name`, f.fileName, { in: where })
      this.value(`${where}.note`, f.note, { in: where })
      this.longRows(where, f.rows, f.costed, f.mode)
      this.controlTotals(where, f.totals, f.costedByPeriod)
      this.componentTotals(where, f.componentTotals)
      if (this.opts.text !== false)
        this.value(`${where}.csv`, loadFileText(ctx, f), { in: where, derived: true })
    }
  }

  /** Long CSV rows value by value: the facts once, then each row's cells (amounts with their costed people). */
  private longRows(
    where: string,
    rows: readonly AnyLongRow[],
    costed: readonly (number | null)[],
    mode: AnalyticsContext['guard']['mode'],
  ): void {
    const tag: Tag = { in: where }
    const first = rows[0]
    if (first) this.value(`${where}.facts`, [first.version, first.lockHash, first.asOf, first.proration], tag)
    const facts = new Set(['version', 'lockHash', 'asOf', 'proration'])
    const cols = longColumns(mode).filter((c) => !facts.has(c.key))
    const seen = new Map<string, number>()
    rows.forEach((r, i) => {
      const base = [
        `period=${r.period}`,
        `org=${r.org}`,
        `costCenter=${r.costCenter}`,
        ...(isAmountRow(r) ? [`component=${r.component}`, `currency=${r.currency}`] : []),
      ].join(',')
      const n = (seen.get(base) ?? 0) + 1
      seen.set(base, n)
      const rw = `${where}/r ${n > 1 ? `${base}#${n}` : base}`
      const people = costed[i]
      for (const c of cols) {
        const v = (r as unknown as Record<string, unknown>)[c.key]
        if (v === undefined) continue
        const money = !!c.cost
        this.value(`${rw}.${c.key}`, v as Value, {
          in: where,
          label: c.label,
          ...(typeof c.format === 'string' ? { format: c.format } : {}),
          ...(money ? { money: true } : {}),
          ...(money && isAmountRow(r) && r.component !== 'loaded' ? { component: true } : {}),
          ...(money && typeof people === 'number' ? { costed: people } : {}),
        })
      }
    })
    this.value(`${where}.rows`, rows.length, { ...tag, order: true })
  }

  /** Control totals value by value, each amount with the costed people behind its period's total. */
  private controlTotals(
    where: string,
    totals: readonly ControlTotal[],
    costed: Readonly<Record<string, number | null>>,
  ): void {
    for (const t of totals) {
      const w = `${where}/totals ${t.period}`
      const tag: Tag = { in: `${where} totals` }
      const people = costed[t.period]
      const sized = typeof people === 'number' ? { costed: people } : {}
      this.value(`${w}.heads`, t.heads, { ...tag, format: 'num1' })
      this.value(`${w}.fte`, t.fte, { ...tag, format: 'num2' })
      this.value(`${w}.suppressedCells`, t.suppressedCells, { ...tag, format: 'int' })
      if (t.loadedUsd !== null)
        this.value(`${w}.loadedUsd`, t.loadedUsd, { ...tag, money: true, format: 'moneyFull', ...sized })
      for (const [k, v] of Object.entries(t.usdByComponent ?? {}))
        if (typeof v === 'number')
          this.value(`${w}.usdByComponent.${k}`, v, {
            ...tag,
            money: true,
            format: 'moneyFull',
            ...sized,
            ...(k !== 'loaded' ? { component: true } : {}),
          })
    }
  }

  /**
   * Control totals by component (exact modes, review SB-1) value by value: each component of the
   * filled part, the band part and the loaded total, with the costed people behind them.
   */
  private componentTotals(where: string, totals: readonly ComponentTotal[]): void {
    for (const t of totals) {
      const w = `${where}/components ${t.period} ${t.org || 'scope'}`
      const tag: Tag = { in: `${where} totals`, money: true, format: 'moneyFull', costed: t.costed }
      this.value(`${w}.label`, t.label, { in: `${where} totals` })
      for (const [k, v] of Object.entries(t.usdByComponent))
        this.value(`${w}.${k}`, v, { ...tag, component: true, label: k })
      if (t.bandUsd != null) this.value(`${w}.bandUsd`, t.bandUsd, { ...tag, label: 'band' })
      this.value(`${w}.loadedUsd`, t.loadedUsd, { ...tag, label: 'loaded' })
    }
  }

  /** The request texts the mode may read (what the request card shows): comments and reasons. */
  texts(): void {
    for (const t of requestTexts(this.ctx, this.viewer))
      this.value(`texts/${t.requestId}/${t.what}`, t.text, { in: `request ${t.requestId}` })
  }

  /** The position card of every position the crawl can open, in ID order. */
  cards(): void {
    const ctx = this.ctx
    const cap = typeof this.opts.cards === 'number' ? this.opts.cards : Number.POSITIVE_INFINITY
    const ids = [...new Set([...[...this.positions].sort().slice(0, cap), ...(this.opts.cardsOf ?? [])])]
    for (const id of ids) {
      const m = positionCardModel(ctx, id)
      const w = `card ${id}`
      const tag: Tag = { in: w }
      const { requests, audit, reqRows, chain, ...rest } = m
      this.value(w, rest as never, tag)
      this.value(
        `${w}.chain`,
        chain.map((c) => [c.positionId, c.title, c.holder]),
        tag,
      )
      if (this.opts.drills === false) continue
      if (requests.length)
        this.records(
          `${w}.requests`,
          drillSpec({ kind: 'requests', title: `Requests that touch ${id}`, rows: requests }),
        )
      if (audit.length)
        this.records(
          `${w}.audit`,
          drillSpec({ kind: 'audit', title: `Audit entries for ${id}`, rows: audit }),
        )
      if (reqRows.length)
        this.records(`${w}.reqs`, drillSpec({ kind: 'reqs', title: `Reqs for ${id}`, rows: reqRows }))
    }
  }

  /**
   * The Shareable and Requests files the app writes in this mode (src/views/data/engine/workspace.ts),
   * as text and value by value; and where the mode offers Export for a manager (HRBP, Leader, HR admin),
   * the managers it lists and the file it writes for one of them (a Shareable made in Manager mode).
   */
  files(): void {
    for (const kind of ['shareable', 'requests'] as const) this.file(`file ${kind}`, appFile(this.ctx, kind))
    const managers = managersForExport(this.ctx)
    if (!managers.length) return
    this.value(
      'file for-manager/managers',
      managers.map((m) => m.label),
      { in: 'file for-manager' },
    )
    const pick = this.opts.forManager ?? managers[0]?.personId
    if (pick) this.file('file for-manager', forManagerFile(this.ctx, pick, PINNED_AT))
  }

  /**
   * Import requests as its dialog shows it for these files (M3 review PV-8): the preview's sentences
   * and counts, the conflicts as `conflictRows` lists them, and the copies the preview hands the
   * dialog (their comments only those the importer may read). A mode that may not import reads the
   * refusal the preview gives.
   */
  imports(files: readonly { name: string; text: string; sizeBytes: number }[]): void {
    const p = importRequestsPreview(this.ctx, files)
    const { files: read, conflicts, ...head } = p
    const tag: Tag = { in: 'import requests' }
    this.value('import requests/preview', head as never, tag)
    this.value(
      'import requests/files',
      read.map((f) => ({ name: f.name, kind: f.kind, skipped: f.skipped })) as never,
      tag,
    )
    this.value('import requests/conflicts', conflicts as never, tag)
    this.value('import requests/rows', conflictRows(this.ctx, conflicts) as never, tag)
  }

  /** One written file: its text and its JSON value by value, or the refusal the writer gave. */
  file(where: string, r: FileResult): void {
    if (!r.ok) {
      this.value(`${where}/refused`, r.refused, { in: where })
      return
    }
    this.value(where, r.out.text, { in: where, derived: true })
    this.fileValues(`${where}/json`, JSON.parse(r.out.text), where)
  }

  /** A file's JSON value by value, with the money flags its figures' columns carry. */
  private fileValues(where: string, json: unknown, file: string): void {
    const body = (json as { body: { plan: Record<string, unknown> } }).body.plan
    const tag: Tag = { in: file, derived: true }
    for (const [k, v] of Object.entries(body)) {
      if (k !== 'models') {
        this.value(`${where}.${k}`, v, tag)
        continue
      }
      for (const [id, fig] of Object.entries(v as Record<string, FigureSnapshot>)) {
        const cols = new Map(fig.columns.map((c) => [c.key, c]))
        fig.rows.forEach((r, i) => {
          // A heads or FTE row of a mixed table holds counts (as on screen, `cellTag`).
          const counts = r.measure === 'heads' || r.measure === 'fte'
          for (const [ck, cv] of Object.entries(r)) {
            const col = cols.get(ck)
            const money = !counts && !!col?.money
            this.value(`${where}.models.${id}[${i}].${ck}`, cv, {
              ...tag,
              ...(money ? { money: true } : {}),
              ...(money && col?.band ? { band: true } : {}),
              ...(money && INPUT_KEY.test(ck) ? { input: true } : {}),
              ...(typeof r.costed === 'number' && money ? { costed: r.costed } : {}),
            })
          }
        })
      }
    }
  }

  /**
   * Each tab's workbook, written and read back cell by cell (async: ExcelJS and SheetJS); with
   * `exports`, each view's whole-view workbook and deck too (`viewFiles`).
   */
  async workbooks(): Promise<void> {
    const { buildWorkbook } = await import('@/lib/export/xlsx')
    const XLSX = await import('xlsx')
    for (const [key, g] of this.tables) {
      const meta = figureMeta(this.ctx, g.view, g.tab)
      const wb = await buildWorkbook(g.tables, meta, moneyOpts(this.ctx))
      this.sheets(`workbook ${key}`, XLSX, await wb.xlsx.writeBuffer())
    }
    if (exportsOn(this.opts)) await this.viewFiles()
  }

  /** A written workbook read back sheet by sheet as CSV text (SheetJS). */
  private sheets(where: string, XLSX: typeof import('xlsx'), buffer: ArrayBuffer | Uint8Array): void {
    const book = XLSX.read(new Uint8Array(buffer as ArrayBuffer), { type: 'array' })
    for (const name of book.SheetNames) {
      const sheet = book.Sheets[name]
      if (!sheet) continue
      this.value(`${where}/${name}`, XLSX.utils.sheet_to_csv(sheet), { in: where, derived: true })
    }
  }

  /**
   * "Whole view, all tabs" for each view the crawl read: the workbook (every tab's figures, a sheet
   * each, the Summary with the long CSV's control totals) read back cell by cell, and the deck
   * (title slide, "About these numbers", a divider per tab and a slide per figure) read back from
   * the file's own slides, every text run in slide order. Each follows its decision
   * (`action:export.view`, `action:export.deck`).
   */
  async viewFiles(): Promise<void> {
    const ctx = this.ctx
    const a = ctx.access
    const lib = await import('@/lib/export/view')
    const XLSX = await import('xlsx')
    await this.loadDeckSummaries()
    const byView = this.figureGroups()
    const long = a.can('action:export.long-csv') ? safe(() => longCsvOf(ctx), this, 'view files') : null
    const money = moneyOpts(ctx)
    const opts = {
      ...money,
      images: false,
      captured: new Map(),
      ...(long?.totals.length ? { controlTotals: { mode: long.mode, totals: long.totals } } : {}),
    }
    for (const [key, { def, groups }] of byView) {
      const meta: ExportMeta = { ...figureMeta(ctx, def, null), tab: WHOLE_VIEW_LABEL }
      if (a.can('action:export.view')) {
        const wb = await lib.buildViewWorkbook(groups, meta, opts)
        this.sheets(`workbook view ${key}`, XLSX, await wb.xlsx.writeBuffer())
      }
      if (a.can('action:export.deck')) {
        const slides = await deckSlides(() => lib.exportViewDeck(groups, meta, opts))
        slides.forEach((slide, i) => {
          const w = `deck ${key}/slide ${i + 1}`
          this.value(w, slide.texts, { in: `deck ${key}`, derived: true })
          // Each table row as its cells, so a scan reads a row's label beside its amounts.
          slide.tables.forEach((rows, t) => {
            rows.forEach((cells, r) => {
              this.value(`${w}/table ${t + 1}/row ${r + 1}`, cells.join(' | '), {
                in: `deck ${key}`,
                derived: true,
              })
            })
          })
        })
      }
    }
  }

  /**
   * The summary slides of the tabs the crawl read (`DECK_SUMMARIES`), built as their screens build
   * them (async: the screens' own modules load on demand). The decks call it; a test may too.
   */
  async loadDeckSummaries(): Promise<void> {
    for (const [key, { def, part }] of this.summaryParts) {
      if (this.deckSummaries.has(key)) continue
      const make = DECK_SUMMARIES[key]
      if (!make) continue
      try {
        const made = await make(this.ctx, def, part)
        if (made) this.deckSummaries.set(key, made)
      } catch (e) {
        this.errors.push({ where: `deck summary ${key}`, message: (e as Error).message })
      }
    }
  }

  /**
   * The figures the crawl read, as the whole-view export groups them: a group per tab, in the order
   * read, each figure registered as the screen registers it, with the tab's summary slide on its
   * figure (`DECK_SUMMARIES`, after `loadDeckSummaries`) standing in for the figures it names.
   */
  figureGroups(): Map<ViewKey, { def: ViewDef; groups: FigureGroup[] }> {
    const byView = new Map<ViewKey, { def: ViewDef; groups: FigureGroup[] }>()
    for (const [key, g] of this.tables) {
      if (!g.view || !g.tab) continue
      let v = byView.get(g.view.key)
      if (!v) {
        v = { def: g.view, groups: [] }
        byView.set(g.view.key, v)
      }
      const tab = g.tab
      v.groups.push({
        key: tab,
        label: g.view.tabs.find((t) => t.key === tab)?.label ?? tab,
        figures: registeredGroup(tab, g, this.deckSummaries.get(key) ?? null),
      })
    }
    return byView
  }

  /**
   * A tab's own files' header and options exactly as its Export menu builds them (src/app/tabExport.ts
   * `tabExportOptions`, the menu's `runTab`; review RP-1): the long CSV's control totals where the
   * mode shows the long CSV and the tab is not heads only.
   */
  private tabFileOptions(view: ViewDef, tab: string) {
    const ctx = this.ctx
    const totals = tabTakesControlTotals(ctx, view, tab)
      ? safe(
          () => menuControlTotals(longCsvOf(ctx, longSourceOf(view))),
          this,
          `tab files ${view.key}.${tab}`,
        )
      : null
    return tabExportOptions(ctx, view, tab, totals ?? undefined)
  }

  /**
   * One tab's deck as its Export menu writes it ("Slides" for the tab: its figures with no dividers,
   * src/app/ExportMenu.tsx `runTab`, header and options from `tabExportOptions`), read back slide by
   * slide into the crawl under `deck <view>.<tab>/slide n`; returns the deck's outline
   * (`deckOutline`) beside the slides read.
   */
  async tabDeck(key: string): Promise<{ outline: string[]; slides: DeckSlide[] }> {
    const g = this.tables.get(key)
    if (!g?.view || !g.tab) return { outline: [], slides: [] }
    const lib = await import('@/lib/export/view')
    await this.loadDeckSummaries()
    const figures = registeredGroup(g.tab, g, this.deckSummaries.get(key) ?? null)
    const { meta, opts: base } = this.tabFileOptions(g.view, g.tab)
    const opts = { ...base, images: false, captured: new Map() }
    const outline = lib.deckOutline(figures, meta)
    if (!this.ctx.access.can('action:export.deck')) return { outline, slides: [] }
    const slides = await deckSlides(() => lib.exportViewDeck(figures, meta, opts))
    const tag: Tag = { in: `deck ${key}`, derived: true }
    slides.forEach((slide, i) => {
      const w = `deck ${key}/slide ${i + 1}`
      this.value(w, slide.texts, tag)
      slide.tables.forEach((rows, t) => {
        rows.forEach((cells, r) => {
          this.value(`${w}/table ${t + 1}/row ${r + 1}`, cells.join(' | '), tag)
        })
      })
    })
    return { outline, slides }
  }

  /**
   * One tab's workbook as its Export menu writes it (`exportViewWorkbook`: a Summary sheet with the
   * header and, where `tabTakesControlTotals`, the control totals, then a sheet per figure), read back
   * sheet by sheet under `workbook <view>.<tab> (menu)/<sheet>`; returns the sheet names (review RP-1).
   */
  async tabWorkbook(key: string): Promise<string[]> {
    const g = this.tables.get(key)
    if (!g?.view || !g.tab || !this.ctx.access.can('action:export.view')) return []
    const lib = await import('@/lib/export/view')
    const XLSX = await import('xlsx')
    await this.loadDeckSummaries()
    const figures = registeredGroup(g.tab, g, this.deckSummaries.get(key) ?? null)
    const { meta, opts } = this.tabFileOptions(g.view, g.tab)
    const wb = await lib.buildViewWorkbook(figures, meta, { ...opts, images: false })
    this.sheets(`workbook ${key} (menu)`, XLSX, await wb.xlsx.writeBuffer())
    return wb.worksheets.map((w) => w.name)
  }

  /* ───── reading the result ───── */

  /** Every value as text, one per line ("where = value"), for scanning. */
  text(): string {
    return this.seen.map((s) => `${s.where} = ${String(s.value)}`).join('\n')
  }

  /** The values in order, for `JSON.stringify` comparisons. */
  snapshot(): [string, Value][] {
    return this.seen.map((s) => [s.where, s.value])
  }

  /** The values by where they were read (the last read wins; wheres are unique in practice). */
  byWhere(): Map<string, Seen> {
    const out = new Map<string, Seen>()
    for (const s of this.seen) out.set(s.where, s)
    return out
  }
}

interface At {
  view?: ViewKey
  tab?: string
  def?: ViewDef
}

/** A cell drill or card, catching what it throws. */
function safe<T>(f: () => T, c: Crawl, where: string): T | null {
  try {
    return f()
  } catch (e) {
    c.errors.push({ where, message: (e as Error).message })
    return null
  }
}

/**
 * What if with a lever of every kind the pickers offer (M3): the results strip, each lever's row, the
 * trade quotes and the Turn into requests preview, as they read with levers set.
 */
function whatifCrawlModel(ctx: AnalyticsContext): unknown {
  const empty = whatifModel(ctx)
  const levers = crawlLevers(empty.levers)
  return levers.length ? whatifModel(ctx, levers) : empty
}

/** Each view's model. */
const MODELS: Partial<Record<ViewKey, (ctx: AnalyticsContext) => unknown>> = {
  home: homeModel,
  team: teamModel,
  plan: planModel,
  requests: requestsModel,
  forecast: forecastModel,
  targets: targetsModel,
  finance: financeModel,
  whatif: whatifCrawlModel,
}

/* ───────────── the write path's forms ───────────── */

/**
 * One lever of every kind on the scope's own seats and orgs, picked from What if's pickers as a person
 * would: defer, cancel, shift, level and location on the first seats a lever may name, a freeze of the
 * first org from its first open day, and a trade of the first tradable seat for P2 seats. Empty where
 * the view is hidden or has no seat.
 */
export function crawlLevers(m: WhatIfLevers): Lever[] {
  if (m.hidden) return []
  const seats = m.seats.rows
  const p = m.pickers
  const out: Lever[] = []
  const a = seats[0]
  if (a) out.push({ kind: 'defer', positionId: a.positionId, to: p.fyEnd })
  const b = seats[1]
  if (b) out.push({ kind: 'cancel', positionId: b.positionId })
  const c = seats[2]
  if (c) out.push({ kind: 'shift', positionIds: [c.positionId], months: 2 })
  const d = seats[3]
  const level = d ? p.levels.find((l) => l !== d.level) : undefined
  if (d && level) out.push({ kind: 'level', positionId: d.positionId, level })
  const e = seats[4]
  const location = e ? p.locations.find((l) => l !== e.location) : undefined
  if (e && location) out.push({ kind: 'location', positionId: e.positionId, location })
  const org = p.orgs[0]
  if (org) out.push({ kind: 'freeze', orgPositionId: org.positionId, from: p.firstStart })
  const give = p.give.find((g) => !g.blocked)
  const getLevel = p.levels.includes('P2') ? 'P2' : p.levels[0]
  const getLocation = p.locations[0]
  if (org && give && getLevel && getLocation)
    out.push({
      kind: 'trade',
      ask: {
        give: [give.positionId],
        creditUsedBp: 0,
        giveOrgPositionId: null,
        get: {
          level: getLevel,
          location: getLocation,
          fte: 1,
          orgPositionId: org.positionId,
          businessUnit: org.businessUnit,
          jobFamily: null,
          start: p.firstStart,
          count: 'max',
          partTimeRest: false,
        },
      },
    })
  return out
}

/**
 * One filled-in Requests > New form per type the mode offers, from the tab's own model (its seats,
 * managers, levels, locations, reasons and first open month) and, for a Transfer, Plan > Transfers'
 * choices: what a person would pick, so the crawl reads each type's preview.
 */
export function newRequestForms(ctx: AnalyticsContext, m: RequestsNew): NewRequestForm[] {
  const start = `${m.firstOpenMonth}-01` as ISODate
  const manager = m.managers[0]?.positionId ?? null
  const level = m.levels.includes('P3') ? 'P3' : (m.levels[0] ?? null)
  const location = m.locations[0] ?? null
  const seatFor = (t: RequestType) => m.seats.rows.find((r) => r.types.includes(t)) ?? null
  const out: NewRequestForm[] = []
  for (const option of m.types) {
    if (!option.shown) continue
    const t = option.type
    const f: NewRequestForm = { ...emptyForm(t), reasonCode: m.reasons[t]?.[0] ?? null }
    const seat = seatFor(t)
    switch (t) {
      case 'New role':
        out.push({ ...f, managerPositionId: manager, level, location, startDate: start, jobTitle: 'Analyst' })
        break
      case 'Backfill':
      case 'Elimination':
      case 'Start recruiting':
      case 'Start date':
        if (seat) out.push({ ...f, positionId: seat.positionId, startDate: start })
        break
      case 'Level change': {
        const to = seat ? m.levels.find((l) => l !== seat.level) : undefined
        if (seat && to) out.push({ ...f, positionId: seat.positionId, level: to, startDate: start })
        break
      }
      case 'Location change': {
        const to = seat ? m.locations.find((l) => l !== seat.location) : undefined
        if (seat && to) out.push({ ...f, positionId: seat.positionId, location: to, startDate: start })
        break
      }
      case 'Trade': {
        const give = m.seats.rows.find((r) => r.tradeBlock == null && r.weightBp != null)
        if (give && manager && location)
          out.push({
            ...f,
            managerPositionId: manager,
            level: m.levels.includes('P2') ? 'P2' : level,
            location,
            startDate: start,
            trade: {
              give: [give.positionId],
              creditUsedBp: 0,
              giveOrgPositionId: null,
              count: 'max',
              partTimeRest: false,
            },
          })
        break
      }
      case 'Transfer': {
        const o = transferOptions(ctx)
        const who = o.people[0]
        const to = who ? o.openSeats.find((x) => x.positionId !== who.positionId) : undefined
        if (who && to)
          out.push({
            ...f,
            transfer: {
              kind: 'internal',
              personId: who.personId,
              fromPositionId: who.positionId,
              toManagerPositionId: null,
              toPositionId: to.positionId,
              effectiveDate: o.effectiveDate,
              moveBudget: o.moveBudget,
            },
          })
        break
      }
    }
  }
  return out
}

/** Views whose one tab is the whole model. */
const WHOLE_MODEL = new Set<ViewKey>(['home', 'team'])

/**
 * Tabs with a model of their own instead of a part of their view's (`<view>.<tab>`): Plan > Hiring
 * reads `planHiringModel` and Plan > Recruiting summary `planRecruitingModel`, each cached per
 * context, which are no `PlanModel` fields because they read the forecast (docs/PLAN.md 9.7 and 9.8,
 * reading H10 in docs/CONTRACTS-HIRING.md). The crawl reads each under its tab, with its tiles,
 * figures, findings, drills, cards and exports, as every other tab.
 * The map is the app's own (src/views/tabModels.ts), so the Shareable file's figures
 * (src/views/data/engine/snapshots.ts) read the same tabs the crawl reads.
 */
export { TAB_MODELS }

/** A tab's summary slide (docs/PLAN.md 9.8 item 5): the figure it rides on and the summary itself. */
export interface TabDeckSummary {
  figure: string
  summary: DeckSummary
}

/**
 * The summary slides tabs' screens register for their decks, by `<view>.<tab>`, built from the tab's
 * model with the screen's own parts. Plan > Recruiting summary (src/views/plan/ui/Recruiting.tsx):
 * the months chart carries the seven numbers (the tiles the mode shows, each through its tier gate,
 * `summaryNumbersOf`) under "Recruiting summary" with the scope and as-of date, standing in for the
 * figures `SUMMARY_REPLACES` names (the strip, the quarter table and where hiring happened), so the
 * tab's deck is one slide after "About these numbers" (src/access/leaks.recruiting.slow.test.ts holds
 * the screen's figure to these words).
 */
export const DECK_SUMMARIES: Readonly<
  Record<string, (ctx: AnalyticsContext, view: ViewDef, model: unknown) => Promise<TabDeckSummary | null>>
> = {
  'plan.recruiting': async (ctx, view, model) => {
    const m = model as PlanRecruiting
    const ui = await import('@/views/plan/ui/Recruiting')
    const tiles = kpisInMode(ctx.access, m.kpis)
    const gates = tiles.map((k) => gateFor(ctx.quality, ctx.standard, k.uses, view.datasets))
    return {
      figure: PLAN_FIGURES.recruitingMonths,
      summary: {
        title: 'Recruiting summary',
        subtitle: asOfLine(ctx.asOf, ctx.scopeLabel, m.fiscalYear),
        numbers: ui.summaryNumbersOf(tiles, gates),
        replaces: ui.SUMMARY_REPLACES,
      },
    }
  },
}

/* ───────────── request texts ───────────── */

export interface RequestText {
  requestId: string
  /** "comment c1", "step 2 note", "changes", "exception". */
  what: string
  text: string
}

/**
 * The free text of every request the viewer sees in full, inside the scope (8.4 rules 1 to 5):
 * comments that `commentVisible` lets through, and the step notes, change reasons and
 * freeze-exception reasons, through `managerText` (Manager mode reads "an amount" for each amount).
 */
export function requestTexts(ctx: AnalyticsContext, viewer: Viewer = viewerOf(ctx)): RequestText[] {
  const out: RequestText[] = []
  for (const r of requestsOf(ctx)) {
    if (requestView(r, viewer) !== 'full' || !inScope('requests', r, ctx)) continue
    for (const c of r.comments)
      if (commentVisible(c, r, viewer))
        out.push({ requestId: r.requestId, what: `comment ${c.id}`, text: c.text })
    for (const s of r.steps)
      if (s.note)
        out.push({ requestId: r.requestId, what: `step ${s.n} note`, text: managerText(s.note, viewer) })
    if (r.changes?.reason)
      out.push({ requestId: r.requestId, what: 'changes', text: managerText(r.changes.reason, viewer) })
    if (r.exception?.reason)
      out.push({ requestId: r.requestId, what: 'exception', text: managerText(r.exception.reason, viewer) })
  }
  return out
}

/* ───────────── workspace files ───────────── */

/**
 * The file the app writes for a kind in this context (src/views/data/engine/workspace.ts: the
 * Shareable file is the mode's guarded output, the Requests file the requests it sees in full), saved
 * at the pinned time.
 */
export function appFile(ctx: AnalyticsContext, kind: 'shareable' | 'requests'): FileResult {
  return kind === 'shareable' ? shareableFile(ctx, PINNED_AT) : requestsFile(ctx, PINNED_AT)
}

/**
 * The file's text as the app writes it (`serializeWorkspace`), saved at the pinned time; the writer's
 * refusal as the text when the mode does not save one. A crawl's own context is the one written.
 */
export function workspaceText(c: Pick<Crawl, 'ctx'>, kind: 'shareable' | 'requests'): string {
  const r = appFile(c.ctx, kind)
  return r.ok ? r.out.text : r.refused
}

/** Export for a manager as the app writes it from a context (HRBP, Leader, HR admin), or its refusal. */
export function forManagerText(ctx: AnalyticsContext, managerPersonId: string): string {
  const r = forManagerFile(ctx, managerPersonId, PINNED_AT)
  return r.ok ? r.out.text : r.refused
}

/** A written file read value by value as a crawl reads one (`file <where>`), for the amount scans. */
export function fileCrawl(ctx: AnalyticsContext, where: string, r: FileResult): Crawl {
  const c = new Crawl(ctx, { drills: false, text: false })
  c.file(where, r)
  return c
}

/* ───────────── opening a shared file ───────────── */

/**
 * What "Open a shared file" shows of a file in a context, read through the app's own opener
 * (src/views/data/engine/workspace.ts `openSharedFile`, docs/PLAN.md 8.4 and C30): through the current
 * mode and Acting as person, never the mode it was made in; nothing merges. Its requests as the
 * viewer's records, the comments the viewer may read, its audit rows through the Audit page's rule, and
 * its figures only when the file was made for this view (the same mode and scope identity,
 * `openedFileView`; never a matching display name), each cell with its column's money flags. Returns
 * the values as a crawl collects them; a refused file reads as its refusal.
 */
export function openShared(text: string, ctx: AnalyticsContext): Crawl {
  const c = new Crawl(ctx, { drills: false, text: false })
  const r = openSharedFile(ctx, text, new TextEncoder().encode(text).length)
  if (!r.ok) {
    c.value('opened/refused', r.reason, { in: 'opened file' })
    return c
  }
  const { requests, comments, audit, figures, ...head } = r.view
  c.value('opened/file', head as never, { in: 'opened file' })
  c.value('opened/requests', requests as never, { in: 'opened file' })
  c.value('opened/comments', comments as never, { in: 'opened file' })
  c.value('opened/audit', audit as never, { in: 'opened file' })
  for (const [id, v] of Object.entries(figures ?? {})) {
    const f = figureOf(v)
    if (!f) continue
    const tag: Tag = { in: `opened ${id}` }
    c.value(`opened/models.${id}`, [f.title, f.subtitle, f.note] as never, tag)
    const cols = new Map(f.columns.map((col) => [col.key, col]))
    f.rows.forEach((row, i) => {
      // A heads or FTE row of a mixed table holds counts (as on screen).
      const counts = row.measure === 'heads' || row.measure === 'fte'
      for (const [k, cv] of Object.entries(row)) {
        const col = cols.get(k)
        const money = !counts && !!(col?.money || col?.pay || col?.band)
        c.value(`opened/models.${id}[${i}].${k}`, cv, {
          ...tag,
          ...(money ? { money: true } : {}),
          ...(money && col?.band ? { band: true } : {}),
        })
      }
    })
  }
  return c
}

/* ───────────── one call ───────────── */

/** Whether a crawl reads the exports beyond the figures' own (`CrawlOptions.exports`). */
const exportsOn = (opts: CrawlOptions): boolean => opts.exports ?? !opts.views

/** Crawl everything a context can reach (workbooks, whole-view workbooks and decks apart: `crawlAll` adds them). */
export function crawl(ctx: AnalyticsContext, opts: CrawlOptions = {}): Crawl {
  const c = new Crawl(ctx, opts)
  c.views()
  if (opts.pages !== false) c.pages()
  if (opts.help !== false) c.help()
  if (opts.texts !== false) c.texts()
  if (opts.cards !== false) c.cards()
  if (opts.files !== false) c.files()
  if (exportsOn(opts)) c.longExports()
  if (opts.imports?.length) c.imports(opts.imports)
  return c
}

/**
 * A tab's figures as its screen registers them (ids `<tab>:<i>`, in the order read), with the tab's
 * summary slide on the first figure it rides on and its `replaces` pointing at the figures read under
 * the ids it names.
 */
function registeredGroup(
  tab: string,
  g: { tables: readonly ExportTable[]; ids: readonly string[] },
  summary: TabDeckSummary | null,
): RegisteredFigure[] {
  const at = summary ? g.ids.indexOf(summary.figure) : -1
  const replaces =
    summary && at >= 0
      ? g.ids.flatMap((id, j) => (j !== at && summary.summary.replaces.includes(id) ? [`${tab}:${j}`] : []))
      : []
  return g.tables.map((t, i) => {
    const f = registered(`${tab}:${i}`, t, i)
    return summary && i === at ? { ...f, deckSummary: { ...summary.summary, replaces } } : f
  })
}

/** An export table as the figure registry hands it to the whole-view exports (no chart image). */
function registered(id: string, t: ExportTable, order: number): RegisteredFigure {
  return {
    id,
    title: t.title ?? t.name,
    ...(t.subtitle ? { subtitle: t.subtitle } : {}),
    ...(t.note ? { note: t.note } : {}),
    columns: [...t.columns] as Column[],
    rows: [...t.rows] as Record<string, unknown>[],
    getSvg: () => null,
    order,
    ...(t.suppressedWhy ? { suppressedWhy: t.suppressedWhy } : {}),
  }
}

/** One slide of a written deck: its text runs in order, and its tables as rows of cells. */
export interface DeckSlide {
  texts: string[]
  tables: string[][][]
}

/**
 * A deck as written: runs an export that saves a .pptx (`exportViewDeck`), takes the file it hands
 * the download (the page's object URL and link, stood in for while it runs: test code has no page),
 * and reads every slide's text runs and table cells from the file's XML, slides in order.
 */
export async function deckSlides(write: () => Promise<void>): Promise<DeckSlide[]> {
  const g = globalThis as unknown as Record<string, unknown>
  const urls = URL as unknown as Record<string, unknown>
  const saved = {
    create: urls.createObjectURL,
    revoke: urls.revokeObjectURL,
    document: g.document,
    window: g.window,
  }
  let file: Blob | null = null
  urls.createObjectURL = (b: Blob) => {
    file = b
    return 'blob:crawl'
  }
  urls.revokeObjectURL = () => undefined
  g.document = {
    createElement: () => ({ style: {}, click: () => undefined, remove: () => undefined }),
    body: { append: () => undefined },
  }
  g.window = { setTimeout: () => 0 }
  try {
    await write()
  } finally {
    urls.createObjectURL = saved.create
    urls.revokeObjectURL = saved.revoke
    g.document = saved.document
    g.window = saved.window
  }
  if (!file) throw new Error('The deck export saved no file.')
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(await (file as Blob).arrayBuffer())
  const names = Object.keys(zip.files)
    .map((n) => ({ n, i: Number(/^ppt\/slides\/slide(\d+)\.xml$/.exec(n)?.[1] ?? 0) }))
    .filter((x) => x.i > 0)
    .sort((a, b) => a.i - b.i)
  const out: DeckSlide[] = []
  const runs = (xml: string): string[] => [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => unxml(m[1]))
  for (const { n } of names) {
    const xml = (await zip.file(n)?.async('string')) ?? ''
    const tables = [...xml.matchAll(/<a:tbl>([\s\S]*?)<\/a:tbl>/g)].map((t) =>
      [...t[1].matchAll(/<a:tr(?:\s[^>]*)?>([\s\S]*?)<\/a:tr>/g)].map((row) =>
        [...row[1].matchAll(/<a:tc(?:\s[^>]*)?>([\s\S]*?)<\/a:tc>/g)].map((cell) => runs(cell[1]).join('')),
      ),
    )
    out.push({ texts: runs(xml), tables })
  }
  return out
}

/** XML text as written (`&amp;` and its kin). */
const unxml = (s: string): string =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')

/** Import requests' preview of these files as a crawl reads it (`Crawl.imports`), alone. */
export function importsCrawl(
  ctx: AnalyticsContext,
  files: readonly { name: string; text: string; sizeBytes: number }[],
): Crawl {
  const c = new Crawl(ctx, { drills: false, text: false })
  c.imports(files)
  return c
}

/** `crawl`, then each tab's workbook as written bytes. */
export async function crawlAll(ctx: AnalyticsContext, opts: CrawlOptions = {}): Promise<Crawl> {
  const c = crawl(ctx, opts)
  await c.workbooks()
  return c
}
