/**
 * Text and tone for KPI tiles, and the rows a KPI strip contributes to view exports. Pure.
 */
import type { Column } from '@/charts/types'
import type { Compare } from '@/data/context'
import { TIER_LABEL } from '@/data/quality/tier'
import { MIN_GROUP } from '@/data/schema'
import type { RouteView } from '@/data/store'
import { WHY_KEY } from '@/lib/export/suppressedFlag'
import { DASH, type Format, fmt, fmtDelta, isNum, plural } from '@/lib/format'
import { emptyComparisonReason } from '@/plan/engine/variance'
import type { AnyVersion } from '@/plan/types'
import type { CurrentView } from './currentView'
import type { TierGate } from './tier/tierModel'
import type { Kpi } from './types'

export const SUPPRESSED_NOTE = `Hidden to protect anonymity (n < ${MIN_GROUP})`

export type DeltaTone = 'good' | 'bad' | 'neutral'

export function deltaDirection(delta: number | null | undefined): 'up' | 'down' | 'flat' | null {
  if (!isNum(delta)) return null
  return delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'
}

/**
 * Good or bad only when the KPI says which direction is good AND the change is material;
 * everything else (neutral KPIs, small changes, no change) stays gray.
 */
export function deltaTone(
  k: Pick<Kpi, 'delta' | 'goodDirection' | 'deltaMaterial' | 'suppressed'>,
): DeltaTone {
  const dir = deltaDirection(k.delta)
  if (k.suppressed || !k.goodDirection || k.deltaMaterial === false || !dir || dir === 'flat')
    return 'neutral'
  return dir === k.goodDirection ? 'good' : 'bad'
}

export function kpiValueText(k: Pick<Kpi, 'value' | 'format' | 'suppressed'>): string {
  return k.suppressed ? DASH : fmt(k.value, k.format)
}

/** "+4 d", "−1.2 pts"; null when there is no comparable delta. */
export function kpiDeltaText(k: Pick<Kpi, 'delta' | 'format' | 'suppressed'>): string | null {
  if (k.suppressed || !isNum(k.delta)) return null
  return fmtDelta(k.delta, k.format)
}

/**
 * Why a monthly, QTD or YTD "vs" figure compares with nothing under a target comparison
 * (docs/PLAN.md 9.2): "A target has no monthly plan. Pick a version to compare." when the year has a
 * locked version, "FY28 has no locked version yet." when it has none; null under a version.
 */
export function targetComparisonEmpty(
  compare: Compare,
  versions: readonly Pick<AnyVersion, 'state' | 'fiscalYear'>[],
): string | null {
  if (compare.kind !== 'target') return null
  const locked = versions.some((v) => v.state === 'locked' && v.fiscalYear === compare.fiscalYear)
  return emptyComparisonReason(compare.fiscalYear, locked)
}

/** The comparison every "vs" tile names, and why it has no change when that is known. */
export interface ComparisonContext {
  label: string
  reason: string | null
}

/** A change row with no change: the comparison it names and why there is none, when known. */
export interface EmptyDelta {
  label: string
  reason: string | null
}

/**
 * The change row of a tile that names its comparison but has no change (docs/PLAN.md 9.2 and 9.3,
 * "every KPI names its comparison"; 7.2 rule 5's "—" for a hidden difference): "—", the comparison,
 * and why. The reason is the tile's own (`deltaEmpty`), else the comparison's when the tile names it
 * and has no change card to say why. Null when the tile has a change, names no comparison or hides
 * its value.
 */
export function emptyDelta(
  k: Pick<Kpi, 'delta' | 'deltaLabel' | 'deltaEmpty' | 'deltaCalc' | 'suppressed'>,
  comparison: ComparisonContext | null,
): EmptyDelta | null {
  if (k.suppressed || isNum(k.delta) || !k.deltaLabel) return null
  const theirs = comparison && !k.deltaCalc && comparison.label === k.deltaLabel ? comparison.reason : null
  return { label: k.deltaLabel, reason: k.deltaEmpty ?? theirs }
}

/** `emptyDelta` for each tile of a strip. */
export const emptyDeltas = (
  kpis: readonly Kpi[],
  comparison: ComparisonContext | null,
): (EmptyDelta | null)[] => kpis.map((k) => emptyDelta(k, comparison))

/** Where a tile opens: `view` and `tab`, and its name for the accessible label. */
export interface TileTarget {
  view: RouteView
  tab: string
  label: string
}

/**
 * Where clicking a tile goes: another view's tab when it carries a `link`, else a tab of the
 * view showing it (`tab`, named by that view's tab label); null when it opens nothing, or when it
 * would open the tab already on screen (`view.tab`).
 */
export function tileTarget(
  k: Pick<Kpi, 'tab' | 'link'>,
  view: (Pick<CurrentView, 'key' | 'tabs'> & { tab?: string }) | null,
  /** Whether the mode shows a route (`routeShown`); a tile opens nothing the mode hides. */
  shown: (view: string, tab: string) => boolean = () => true,
): TileTarget | null {
  const here = (v: string, tab: string) => !!view?.tab && v === view.key && tab === view.tab
  if (k.link) {
    const tab = k.link.tab ?? ''
    return here(k.link.view, tab) || !shown(k.link.view, tab)
      ? null
      : { view: k.link.view, tab, label: k.link.label }
  }
  if (!k.tab || !view || here(view.key, k.tab) || !shown(view.key, k.tab)) return null
  return { view: view.key, tab: k.tab, label: view.tabs.find((t) => t.key === k.tab)?.label ?? k.tab }
}

/** The unit a number in `format` is counted in, for the unit columns of exports. */
export function unitOf(format: Format): string {
  switch (format) {
    case 'pct':
    case 'pct0':
    case 'pct2':
    case 'deltaPct':
      return '%'
    case 'pts':
    case 'pts2':
      return 'pts'
    case 'days':
    case 'deltaDays':
      return 'd'
    case 'hours':
      return 'h'
    case 'years':
      return 'yrs'
    case 'money':
    case 'moneyFull':
    case 'moneyM':
      return 'USD'
    case 'times':
      return '×'
    case 'int':
    case 'compact':
      return 'count'
    case 'ratio':
      return 'ratio'
    default:
      return ''
  }
}

/** A number as the key figures export stores it: in its unit, with the format that shows it. */
interface ExportCell {
  value: number | null
  format: Format
  unit: string
}

const POINTS = new Set<Format>(['pts', 'pts2'])
/** Formats whose change is a difference in percentage points. */
const RATE_CHANGE = new Set<Format>(['pct', 'pct0', 'pct2', 'pts', 'pts2', 'deltaPct'])
const FINE = new Set<Format>(['pct2', 'pts2'])

const num = (v: number | null | undefined): number | null => (isNum(v) ? v : null)
/** Points are fractions in the engines; exports store them as a number of points (2.1, not 0.021). */
const toPoints = (v: number | null): number | null => (v == null ? null : v * 100)

/** A value or trend point: rates stay fractions (Excel shows them as %), points become points. */
export function valueCell(v: number | null | undefined, format: Format): ExportCell {
  const n = num(v)
  if (POINTS.has(format))
    return { value: toPoints(n), format: FINE.has(format) ? 'num2' : 'num1', unit: 'pts' }
  return { value: n, format, unit: unitOf(format) }
}

/** The change, in the unit the tile shows it in: points for a rate, else the value's own unit. */
export function changeCell(delta: number | null | undefined, format: Format): ExportCell {
  const n = num(delta)
  if (RATE_CHANGE.has(format))
    return { value: toPoints(n), format: FINE.has(format) ? 'num2' : 'num1', unit: 'pts' }
  return { value: n, format, unit: unitOf(format) }
}

/** Hidden row keys holding each row's own number formats (units differ by row). */
const VALUE_FORMAT = '__valueFormat'
const CHANGE_FORMAT = '__changeFormat'
const TREND_FORMAT = '__trendFormat'
const formatAt =
  (key: string) =>
  (row: Record<string, unknown>): Format =>
    (row[key] as Format | undefined) ?? 'num2'

const trendKey = (back: number) => `trend${back}`
/** "Trend, 3 periods back" … "Trend, latest": the latest point lines up across tiles. */
const trendLabel = (back: number) => (back === 0 ? 'Trend, latest' : `Trend, ${plural(back, 'period')} back`)

/** Trend points a tile shows (none when its number is hidden or suppressed). */
function shownSpark(k: Kpi, gate: TierGate | null | undefined): readonly (number | null)[] {
  if (k.suppressed || (gate && !gate.shown) || !k.spark || k.spark.length < 2) return []
  return k.spark
}

/**
 * Columns of the "Key figures" table. Sheets (Excel, CSV, copy) get numbers: each value with its
 * unit, the change with its unit, and one column per trend point (the tile's sparkline), oldest
 * first. Slides get the tile's own text ("42 d", "+4 d") and no trend: a dozen points would not fit.
 */
export function kpiColumns(
  kpis: readonly Kpi[],
  opts: {
    tiered?: boolean
    gates?: readonly (TierGate | null)[]
    /** Each tile's target in words ("Met: target at most 8.0%"), or null; a column when any has one. */
    targets?: readonly (string | null)[]
  } = {},
): Column[] {
  const points = Math.max(0, ...kpis.map((k, i) => shownSpark(k, opts.gates?.[i]).length))
  const trend: Column[] = []
  for (let back = points - 1; back >= 0; back--)
    trend.push({
      key: trendKey(back),
      label: trendLabel(back),
      format: formatAt(TREND_FORMAT),
      only: 'sheets',
      // A point before the tile's series starts is no value, not a hidden one (14.1 item 2).
      flagEmpty: false,
    })
  return [
    { key: 'measure', label: 'Measure', format: 'text' },
    { key: 'value', label: 'Value', format: formatAt(VALUE_FORMAT), align: 'right', only: 'sheets' },
    { key: 'valueText', label: 'Value', format: 'text', align: 'right', only: 'slides' },
    { key: 'unit', label: 'Unit', format: 'text', only: 'sheets' },
    ...(opts.tiered ? [{ key: 'tier', label: 'Tier', format: 'text' } satisfies Column] : []),
    { key: 'change', label: 'Change', format: formatAt(CHANGE_FORMAT), align: 'right', only: 'sheets' },
    { key: 'changeText', label: 'Change', format: 'text', align: 'right', only: 'slides' },
    { key: 'changeUnit', label: 'Change unit', format: 'text', only: 'sheets' },
    { key: 'comparedWith', label: 'Compared with', format: 'text' },
    ...(opts.targets?.some(Boolean)
      ? [{ key: 'target', label: 'Target', format: 'text' } satisfies Column]
      : []),
    { key: 'note', label: 'Note', format: 'text' },
    ...trend,
  ]
}

/**
 * Rows for the "Key figures" table in view exports: numbers (not text), each with its own format
 * and unit, so a workbook can sum and chart them, plus the tile's text for slides. With `gates`
 * (one per KPI), each row carries its tier, and a number the data standard hides exports blank
 * (a dash on slides) with the reason, as the tile shows it. A suppressed number is blank with the
 * anonymity note.
 */
export function kpiRows(
  kpis: readonly Kpi[],
  gates?: readonly (TierGate | null)[],
  targets?: readonly (string | null)[],
  /** Each tile's change row with no change (`emptyDeltas`), as the tile shows it. */
  empties?: readonly (EmptyDelta | null)[],
): Record<string, unknown>[] {
  return kpis.map((k, i) => {
    const gate = gates?.[i] ?? null
    const hidden = !!gate && !gate.shown
    const blank = hidden || !!k.suppressed
    const value = valueCell(blank ? null : k.value, k.format)
    const change = changeCell(blank ? null : k.delta, k.format)
    const changeText = blank ? null : kpiDeltaText(k)
    const empty = blank ? null : (empties?.[i] ?? null)
    const note = hidden
      ? (gate.reason ?? '')
      : k.suppressed
        ? (k.suppressedNote ?? SUPPRESSED_NOTE)
        : (k.note ?? '')
    const row: Record<string, unknown> = {
      measure: k.label,
      value: value.value,
      valueText: hidden ? DASH : kpiValueText(k),
      unit: value.unit,
      change: change.value,
      changeText: changeText ?? (empty ? DASH : ''),
      changeUnit: change.value == null ? '' : change.unit,
      comparedWith: change.value == null ? (empty?.label ?? '') : (k.deltaLabel ?? ''),
      note: empty?.reason ? [note, empty.reason].filter(Boolean).join(' ') : note,
      [VALUE_FORMAT]: value.format,
      [CHANGE_FORMAT]: change.format,
      [TREND_FORMAT]: value.format,
    }
    // Why an amount cell is empty (docs/PLAN.md 14.1 item 2: the Suppressed flag's Why column).
    const why = blank ? note : change.value == null ? (empty?.reason ?? k.deltaEmpty ?? '') : ''
    if (why) row[WHY_KEY] = why
    const spark = shownSpark(k, gate)
    spark.forEach((v, j) => {
      row[trendKey(spark.length - 1 - j)] = valueCell(v, k.format).value
    })
    if (gates) row.tier = gate ? TIER_LABEL[gate.tier] : ''
    if (targets) row.target = blank ? '' : (targets[i] ?? '')
    return row
  })
}
