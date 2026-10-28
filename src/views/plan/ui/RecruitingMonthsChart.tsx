/**
 * Heads and hiring by month (docs/PLAN.md 9.8 item 2, change C38): one column per month. The closed
 * months, and the months ended since the last close (review RN-1), show actual hires up and exits
 * down, with actual heads as a line; the months ahead show the future starts (signed offers), the
 * moves in (their own segment, review RS-2) and, stacked on them in a lighter fill with a full-strength
 * outline (review RU-1), the projected starts (the model); projected attrition down and projected
 * heads as a dashed line; approved heads at the year end are a dotted reference line, dated in the
 * legend (review RU-3). The month that holds a mid-month as-of date also shows its actual hires and
 * exits to date in the closed colours, under its months-ahead parts (review RU-5). Bars read the left
 * axis (hires and exits a month); the lines read the right axis (heads), drawn on the same plot by a
 * linear map so the chart stays one chart; both axes are titled (review RU-2). The rare terms of
 * projected heads are drawn in the month they ride on, each with its own tint, key and keyboard stop
 * only when not 0: signed offers past their start date and pre-hires up after the future starts, last
 * days on the as-of date down after the exits. So every month ahead's bars net to the dashed line's
 * step (finish audit AF-1).
 *
 * A bar opens its records or calculation card (the model's own cells), and the keyboard steps
 * through the months, starts and exits alike (`recruitingKeyPoints`). Presentation only: every
 * number comes from the model's rows; the pure parts (`chartColors`, `segmentsOf`, `barDomain`,
 * `legendOf`, `tipOf`, `AXIS_TITLES`) are exported for the tests.
 */
import * as Plot from '@observablehq/plot'
import {
  axisX,
  axisY,
  baseline,
  type ChartTheme,
  gridY,
  housePlot,
  hoverBand,
  type KeyPoint,
  type LegendSpec,
  PlotChart,
  type PlotElement,
  plotBand,
  plotPos,
  type TipContent,
  tickFormat,
  useChartTheme,
} from '@/charts'
import type { LegendSwatch } from '@/charts/core/legend'
import type { Column } from '@/charts/types'
import { useChartHeight } from '@/components/useNarrow'
import { formatMonth } from '@/lib/dates'
import { fmt } from '@/lib/format'
import type { RecruitingMonthRow } from '../engine/recruitingTab'
import { towards } from './HiringVelocityChart'
import { bandStep, monthTickLabels } from './monthTicks'
import { cellOpens, openCellOrCard } from './shared'

export interface Colors {
  hires: string
  exits: string
  future: string
  /** Signed offers past their start date (HRIS lag) and pre-hires the HRIS holds: their own tints (AF-1). */
  pastStart: string
  preHires: string
  moves: string
  projected: string
  /** The projected starts' outline: the series colour at full strength (3:1 on the sheet, RU-1). */
  projectedStroke: string
  exitsAhead: string
  /** Last days on the as-of date, down after the exits (AF-1). */
  leaving: string
  heads: string
  approved: string
}

export const chartColors = (t: ChartTheme): Colors => ({
  hires: t.series[0],
  exits: t.series[1] ?? t.status.serious,
  future: towards(t.series[0], t.sheet, 0.4),
  pastStart: towards(t.series[3] ?? t.ink, t.sheet, 0.35),
  preHires: towards(t.series[4] ?? t.ink, t.sheet, 0.35),
  moves: towards(t.series[2] ?? t.ink, t.sheet, 0.35),
  projected: towards(t.series[0], t.sheet, 0.75),
  projectedStroke: t.series[0],
  exitsAhead: towards(t.series[1] ?? t.status.serious, t.sheet, 0.55),
  leaving: towards(t.series[5] ?? t.status.serious, t.sheet, 0.35),
  heads: t.ink,
  approved: t.muted,
})

/** The two axes' titles (review RU-2): bars read the left one, lines the right one. */
export const AXIS_TITLES = { left: 'Hires and exits a month', right: 'Heads' } as const

/** The chart's name for the keyboard and screen readers (the chart kit adds how the arrow keys move). */
export const ARIA_LABEL =
  'Heads and hiring by month: hires and exits in the closed months, then future starts, moves in, projected starts and projected attrition in the months ahead, with heads against approved heads'

/**
 * A bar's part: hires, future starts, signed offers past their start date, pre-hires, moves in or
 * projected starts up; exits, last days on the as-of date or projected attrition down.
 */
export type MonthPart =
  | 'hires'
  | 'future'
  | 'pastStart'
  | 'preHires'
  | 'moves'
  | 'projected'
  | 'exits'
  | 'leaving'
  | 'attrition'

/** One stacked segment of a month's bar, from y1 to y2 on the bars' axis. */
export interface Segment {
  part: MonthPart
  y1: number
  y2: number
}

const UP: readonly MonthPart[] = ['hires', 'future', 'pastStart', 'preHires', 'moves', 'projected']

/**
 * A month's segments, stacked from 0: a closed or ended month's hires up and exits down; a month
 * ahead's hires to date (a mid-month as-of date), future starts, signed offers past their start date,
 * pre-hires, moves in and projected starts up, and its exits to date, last days on the as-of date and
 * projected attrition down. So a month ahead's segments net to the line's step: its projected heads
 * less the month before's heads (finish audit AF-1). Only parts above 0, but a month always has one
 * up and one down (an empty one at 0), so the keyboard stops on every month.
 */
export function segmentsOf(r: RecruitingMonthRow): Segment[] {
  const ahead = r.kind === 'ahead'
  const up: [MonthPart, number][] = ahead
    ? [
        ['hires', r.hires ?? 0],
        ['future', r.futureStarts ?? 0],
        ['pastStart', r.pastStart ?? 0],
        ['preHires', r.preHires ?? 0],
        ['moves', r.movesIn ?? 0],
        ['projected', r.projectedStarts ?? 0],
      ]
    : [['hires', r.hires ?? 0]]
  const down: [MonthPart, number][] = ahead
    ? [
        ['exits', r.exits ?? 0],
        ['leaving', r.leaving ?? 0],
        ['attrition', r.projectedExits ?? 0],
      ]
    : [['exits', r.exits ?? 0]]
  const out: Segment[] = []
  let top = 0
  for (const [part, v] of up)
    if (v > 0) {
      out.push({ part, y1: top, y2: top + v })
      top += v
    }
  if (!out.length) out.push({ part: ahead ? 'future' : 'hires', y1: 0, y2: 0 })
  const ups = out.length
  let bottom = 0
  for (const [part, v] of down)
    if (v > 0) {
      out.push({ part, y1: bottom - v, y2: bottom })
      bottom -= v
    }
  if (out.length === ups) out.push({ part: ahead ? 'attrition' : 'exits', y1: 0, y2: 0 })
  return out
}

const upOf = (r: RecruitingMonthRow) => Math.max(0, ...segmentsOf(r).map((s) => s.y2))
const downOf = (r: RecruitingMonthRow) => -Math.min(0, ...segmentsOf(r).map((s) => s.y1))
const headsOf = (r: RecruitingMonthRow) => (r.kind === 'ahead' ? r.projectedHeads : r.heads)

/**
 * The bars' domain (review RU-8): a floor of one head each way, so a fraction of a head (a small
 * team's 0.06 projected exits) reads as a fraction of a head, never fills the plot; below 0 only when
 * some month shows an exit. With 10% headroom.
 */
export function barDomain(rows: readonly RecruitingMonthRow[]): [number, number] {
  const hi = Math.max(1, ...rows.map(upOf))
  const anyDown = rows.some((r) => downOf(r) > 0)
  const lo = anyDown ? Math.min(-1, ...rows.map((r) => -downOf(r))) : 0
  return [lo * 1.1, hi * 1.1]
}

/**
 * About `count` round ticks (steps of 1, 2, 2.5 or 5 times a power of ten) from the first multiple
 * of the step at or above `lo` to `hi`. With `whole` (heads, the right axis) every tick is a whole
 * number: the step is at least 1 and never 2.5 times a power of ten below 10, so a label never
 * rounds a tick it does not sit on.
 */
export function niceTicks(lo: number, hi: number, count = 4, whole = false): number[] {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return []
  if (!(hi > lo)) return [lo]
  const raw = (hi - lo) / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const steps = [1, 2, 2.5, 5, 10].map((k) => k * mag).filter((x) => !whole || Number.isInteger(x))
  const step = Math.max(whole ? 1 : 0, steps.find((x) => x >= raw) ?? 10 * mag)
  const out: number[] = []
  // `|| 0`: the first tick of a range from 0 is 0, never −0.
  for (let i = Math.ceil(lo / step - 1e-9); i * step <= hi + 1e-9; i++)
    out.push(Math.round(i * step * 1e6) / 1e6 || 0)
  return out
}

/**
 * The model's cell a bar opens (`Column.key` of the figure's columns): a closed or ended month's
 * hires or exits; a month ahead's hires or exits to date, future starts, signed offers past their
 * start date, pre-hires, moves in, projected starts, last days on the as-of date or projected
 * attrition, one cell per part (a move in is never a future start, RS-2).
 */
export function keyOf(r: RecruitingMonthRow, part: string): string {
  if (r.kind !== 'ahead')
    return part === 'exits' || part === 'leaving' || part === 'attrition' ? 'exits' : 'hires'
  switch (part) {
    case 'hires':
      return 'hires'
    case 'exits':
      return 'exits'
    case 'pastStart':
      return 'pastStart'
    case 'preHires':
      return 'preHires'
    case 'leaving':
      return 'leaving'
    case 'moves':
      return 'movesIn'
    case 'projected':
      return 'projectedStarts'
    case 'attrition':
      return 'projectedExits'
    default:
      return 'futureStarts'
  }
}

/** The upward bar's first part of a month: hires when closed or ended, else future starts. */
const upPart = (r: RecruitingMonthRow): MonthPart => (r.kind === 'ahead' ? 'future' : 'hires')

/**
 * The keyboard's stops, two rows (groups): the starts, month by month (each month's upward
 * segments, bottom to top), then every month's exits (its downward segments). Left and Right step
 * through the months along a row and Up and Down switch between starts and exits, landing on the
 * same month, as Plan > Hiring's velocity chart does (review HU-4). Each stop names its part, so
 * Enter opens that segment's own records or card, and carries the segment's box.
 */
export function recruitingKeyPoints(
  rows: readonly RecruitingMonthRow[],
  plot: PlotElement,
): KeyPoint<RecruitingMonthRow>[] {
  const w = Math.max(4, plotBand(plot, 'x') * 0.75)
  const box = (r: RecruitingMonthRow, s: Segment): KeyPoint<RecruitingMonthRow> => {
    const a = plotPos(plot, 'y', s.y1)
    const b = plotPos(plot, 'y', s.y2)
    return {
      datum: r,
      part: s.part,
      group: UP.includes(s.part) ? 'starts' : 'exits',
      x: plotPos(plot, 'x', r.month),
      y: (a + b) / 2,
      w,
      h: Math.max(4, Math.abs(a - b)),
    }
  }
  const starts = rows.flatMap((r) =>
    segmentsOf(r)
      .filter((s) => UP.includes(s.part))
      .map((s) => box(r, s)),
  )
  const exits = rows.flatMap((r) =>
    segmentsOf(r)
      .filter((s) => !UP.includes(s.part))
      .map((s) => box(r, s)),
  )
  return [...starts, ...exits]
}

/** The rare terms' keys, in the legend and the tooltip (finish audit AF-1). */
export const PAST_START_LABEL = 'Signed offers past their start date'
export const PRE_HIRES_LABEL = 'Pre-hires in the HRIS'
export const LEAVING_LABEL = 'Last days on the as-of date'

/** The approved heads line's name, dated (review RU-3): the months table column's label. */
export const approvedLabelOf = (columns: readonly Column<RecruitingMonthRow>[]): string =>
  columns.find((c) => c.key === 'approved')?.label ?? 'Approved heads'

/** The chart's legend: a key for every mark drawn, and only for those (reviews RU-6, RS-2, RU-14, AF-1). */
export function legendOf(rows: readonly RecruitingMonthRow[], c: Colors, approvedLabel: string): LegendSpec {
  const ahead = rows.filter((r) => r.kind === 'ahead')
  const anyActual =
    rows.some((r) => r.kind !== 'ahead') || ahead.some((r) => (r.hires ?? 0) > 0 || (r.exits ?? 0) > 0)
  const anyHeads = rows.some((r) => r.kind !== 'ahead' && r.heads != null)
  const anyMoves = ahead.some((r) => (r.movesIn ?? 0) > 0)
  const anyPastStart = ahead.some((r) => (r.pastStart ?? 0) > 0)
  const anyPreHires = ahead.some((r) => (r.preHires ?? 0) > 0)
  const anyLeaving = ahead.some((r) => (r.leaving ?? 0) > 0)
  const anyProjected = ahead.some((r) => (r.projectedStarts ?? 0) > 0)
  // The dashed line needs two points: the last actual heads and a month ahead, or two months ahead.
  const anyProjectedHeads = (anyHeads ? 1 : 0) + ahead.filter((r) => r.projectedHeads != null).length > 1
  const approved = rows.find((r) => r.approved != null)?.approved ?? null
  const items: LegendSwatch[] = [
    ...(anyActual
      ? [
          { label: 'Hires', color: c.hires, shape: 'rect' as const },
          { label: 'Exits', color: c.exits, shape: 'rect' as const },
        ]
      : []),
    ...(anyHeads ? [{ label: 'Heads', color: c.heads, shape: 'line' as const }] : []),
    ...(ahead.length
      ? [
          { label: 'Future starts (signed offers)', color: c.future, shape: 'rect' as const },
          ...(anyPastStart ? [{ label: PAST_START_LABEL, color: c.pastStart, shape: 'rect' as const }] : []),
          ...(anyPreHires ? [{ label: PRE_HIRES_LABEL, color: c.preHires, shape: 'rect' as const }] : []),
          ...(anyMoves ? [{ label: 'Moves in', color: c.moves, shape: 'rect' as const }] : []),
          ...(anyProjected
            ? [
                {
                  label: 'Projected starts (model)',
                  color: c.projected,
                  shape: 'rect' as const,
                  stroke: c.projectedStroke,
                },
              ]
            : []),
          ...(anyLeaving ? [{ label: LEAVING_LABEL, color: c.leaving, shape: 'rect' as const }] : []),
          { label: 'Projected attrition', color: c.exitsAhead, shape: 'rect' as const },
          ...(anyProjectedHeads
            ? [{ label: 'Projected heads', color: c.heads, shape: 'dash' as const }]
            : []),
        ]
      : []),
    ...(approved != null ? [{ label: approvedLabel, color: c.approved, shape: 'dotted' as const }] : []),
  ]
  return { kind: 'swatch', items }
}

/** A month's tooltip: its title by kind, its parts (each in its own colour), and approved heads ahead only. */
export function tipOf(
  r: RecruitingMonthRow,
  part: string | null | undefined,
  c: Colors,
  approvedLabel: string,
): TipContent {
  const key = keyOf(r, part ?? upPart(r))
  const month = formatMonth(`${r.month}-01`)
  const strong = (k: string) => key === k
  if (r.kind !== 'ahead')
    return {
      title: r.kind === 'ended' ? `${month}, ended, not closed` : month,
      rows: [
        {
          label: 'Hires',
          value: fmt(r.hires, 'int'),
          color: c.hires,
          shape: 'rect',
          strong: strong('hires'),
        },
        {
          label: 'Exits',
          value: fmt(r.exits, 'int'),
          color: c.exits,
          shape: 'rect',
          strong: strong('exits'),
        },
        { label: 'Heads at month end', value: fmt(r.heads, 'int'), color: c.heads, shape: 'line' },
      ],
    }
  const when = (n: number | null | undefined) => (n ?? 0) !== 0
  const partial = r.kindText !== 'Ahead'
  const rows: TipContent['rows'] = [
    ...(partial
      ? [
          {
            label: 'Hires to date',
            value: fmt(r.hires, 'int'),
            color: c.hires,
            shape: 'rect' as const,
            strong: strong('hires'),
          },
          {
            label: 'Exits to date',
            value: fmt(r.exits, 'int'),
            color: c.exits,
            shape: 'rect' as const,
            strong: strong('exits'),
          },
        ]
      : []),
    {
      label: 'Future starts (signed offers)',
      value: fmt(r.futureStarts, 'int'),
      color: c.future,
      shape: 'rect',
      strong: strong('futureStarts'),
    },
    ...(when(r.movesIn)
      ? [
          {
            label: 'Moves in',
            value: fmt(r.movesIn, 'int'),
            color: c.moves,
            shape: 'rect' as const,
            strong: strong('movesIn'),
          },
        ]
      : []),
    ...(when(r.pastStart)
      ? [
          {
            label: PAST_START_LABEL,
            value: fmt(r.pastStart, 'int'),
            color: c.pastStart,
            shape: 'rect' as const,
            strong: strong('pastStart'),
          },
        ]
      : []),
    ...(when(r.preHires)
      ? [
          {
            label: PRE_HIRES_LABEL,
            value: fmt(r.preHires, 'int'),
            color: c.preHires,
            shape: 'rect' as const,
            strong: strong('preHires'),
          },
        ]
      : []),
    ...(when(r.leaving)
      ? [
          {
            label: LEAVING_LABEL,
            value: fmt(r.leaving, 'int'),
            color: c.leaving,
            shape: 'rect' as const,
            strong: strong('leaving'),
          },
        ]
      : []),
    // No Working forecast: no projected start to name (the figure's note says why).
    ...(r.projectedStarts == null
      ? []
      : [
          {
            label: 'Projected starts (model)',
            value: fmt(r.projectedStarts, 'num1'),
            color: c.projected,
            stroke: c.projectedStroke,
            shape: 'rect' as const,
            strong: strong('projectedStarts'),
          },
        ]),
    {
      label: 'Projected attrition',
      value: fmt(r.projectedExits, 'num1'),
      color: c.exitsAhead,
      shape: 'rect',
      strong: strong('projectedExits'),
    },
    ...(r.projectedHeads == null
      ? []
      : [
          {
            label: 'Projected heads',
            value: fmt(r.projectedHeads, 'num1'),
            color: c.heads,
            shape: 'dash' as const,
          },
        ]),
    ...(r.approved != null
      ? [{ label: approvedLabel, value: fmt(r.approved, 'int'), color: c.approved, shape: 'dotted' as const }]
      : []),
  ]
  const lead = r.kindText.charAt(0).toLowerCase() + r.kindText.slice(1)
  return { title: partial ? `${month}: ${lead}` : `${month}, ahead`, rows }
}

/** The pick of a pointer on a month: the segment under it, or the nearest one on its side of 0. */
function pickOf(r: RecruitingMonthRow, y: number, plot: PlotElement): MonthPart {
  const segs = segmentsOf(r)
  const zero = plotPos(plot, 'y', 0)
  const side = segs.filter((s) => (y > zero ? !UP.includes(s.part) : UP.includes(s.part)))
  const hit = side.find((s) => {
    const a = plotPos(plot, 'y', s.y1)
    const b = plotPos(plot, 'y', s.y2)
    return y >= Math.min(a, b) && y <= Math.max(a, b)
  })
  return (hit ?? side.at(-1) ?? segs[0]).part
}

export function RecruitingMonthsChart({
  rows,
  columns,
}: {
  rows: readonly RecruitingMonthRow[]
  columns: readonly Column<RecruitingMonthRow>[]
}) {
  const theme = useChartTheme()
  const height = useChartHeight('lead')
  const c = chartColors(theme)
  const approvedLabel = approvedLabelOf(columns)
  const order = rows.map((r) => r.month)
  const [yLo, yHi] = barDomain(rows)
  const approved = rows.find((r) => r.approved != null)?.approved ?? null
  const headVals = [
    ...rows.map(headsOf).filter((v): v is number => v != null),
    ...(approved != null ? [approved] : []),
  ]
  const hMin0 = headVals.length ? Math.min(...headVals) : 0
  const hMax0 = headVals.length ? Math.max(...headVals) : 1
  const pad = Math.max(1, (hMax0 - hMin0) * 0.1)
  const hMin = Math.max(0, hMin0 - pad)
  const hMax = hMax0 + pad
  // Heads on the bars' axis: a linear map of [hMin, hMax] onto the plot's height.
  const toY = (h: number) => yLo + ((h - hMin) / (hMax - hMin || 1)) * (yHi - yLo)
  const fromY = (y: number) => hMin + ((y - yLo) / (yHi - yLo || 1)) * (hMax - hMin)
  const headTicks = niceTicks(hMin, hMax, 4, true).map(toY)
  const actualHeads = rows.filter((r) => r.kind !== 'ahead' && r.heads != null)
  const lastActual = actualHeads.at(-1)
  const aheadHeads = [
    ...(lastActual ? [lastActual] : []),
    ...rows.filter((r) => r.kind === 'ahead' && r.projectedHeads != null),
  ]
  const legend = legendOf(rows, c, approvedLabel)
  const segs = rows.flatMap((r) =>
    segmentsOf(r)
      .filter((s) => s.y1 !== s.y2)
      .map((s, i, all) => ({
        ...s,
        month: r.month,
        actual: r.kind !== 'ahead' || s.part === 'hires' || s.part === 'exits',
        // The outermost segment on each side gets the rounded end.
        outer: UP.includes(s.part)
          ? !all.slice(i + 1).some((x) => UP.includes(x.part))
          : !all.slice(i + 1).some((x) => !UP.includes(x.part)),
      })),
  )
  type Seg = (typeof segs)[number]
  return (
    <PlotChart<RecruitingMonthRow>
      height={height}
      legend={legend}
      ariaLabel={ARIA_LABEL}
      tip={(r, part): TipContent => tipOf(r, part, c, approvedLabel)}
      pick={(r, at, plot) => pickOf(r, at.y, plot)}
      selectable={(r, part) => cellOpens(columns, keyOf(r, part ?? upPart(r)), r)}
      onSelect={(r, part) => openCellOrCard(columns, keyOf(r, part ?? upPart(r)), r)}
      keyPoints={(plot: PlotElement) => recruitingKeyPoints(rows, plot)}
      build={(ctx) => {
        const t = ctx.theme
        const k = chartColors(t)
        const ticks = tickFormat('num1')
        const fills: Record<MonthPart, string> = {
          hires: k.hires,
          exits: k.exits,
          future: k.future,
          pastStart: k.pastStart,
          preHires: k.preHires,
          moves: k.moves,
          projected: k.projected,
          leaving: k.leaving,
          attrition: k.exitsAhead,
        }
        const fill = (s: Seg) => fills[s.part]
        const up = (s: Seg) => UP.includes(s.part)
        const marginLeft = 40
        const marginRight = 52
        return housePlot(ctx, {
          height,
          marginLeft,
          marginRight,
          marginTop: 24,
          marginBottom: 28,
          x: { type: 'band', domain: order, padding: 0.25 },
          y: { domain: [yLo, yHi] },
          marks: [
            gridY(t, { ticks: 5 }),
            axisY(t, {
              tickFormat: ticks,
              ticks: 5,
              label: AXIS_TITLES.left,
              labelAnchor: 'top',
              labelArrow: 'none',
            }),
            axisY(t, {
              anchor: 'right',
              ticks: headTicks,
              tickFormat: (v: number) => fmt(Math.round(fromY(v)), 'int'),
              label: AXIS_TITLES.right,
              labelAnchor: 'top',
              labelArrow: 'none',
            }),
            // Thinned to fit, the year on the first label and wherever it changes (review RU-11).
            axisX(t, {
              tickFormat: monthTickLabels(order, bandStep(ctx.width, marginLeft, marginRight, order.length)),
            }),
            hoverBand(rows, { axis: 'x', value: (r) => r.month, color: t.ink }),
            // Inner segments square; the outermost one on each side rounded at its end.
            Plot.barY(
              segs.filter((s) => !s.outer),
              { x: 'month', y1: 'y1', y2: 'y2', fill },
            ),
            Plot.barY(
              segs.filter((s) => s.outer && up(s)),
              { x: 'month', y1: 'y1', y2: 'y2', fill, ry1: 2 },
            ),
            Plot.barY(
              segs.filter((s) => s.outer && !up(s)),
              { x: 'month', y1: 'y1', y2: 'y2', fill, ry2: 2 },
            ),
            // The projected starts' full-strength outline, dashed like the projected heads line (RU-1).
            Plot.barY(
              segs.filter((s) => s.part === 'projected'),
              {
                x: 'month',
                y1: 'y1',
                y2: 'y2',
                fill: 'none',
                stroke: k.projectedStroke,
                strokeWidth: 1,
                strokeDasharray: '3,2',
                inset: 0.5,
              },
            ),
            baseline(t, 'y'),
            ...(approved != null
              ? [
                  Plot.ruleY([toY(approved)], {
                    stroke: k.approved,
                    strokeWidth: 1.25,
                    strokeDasharray: '2,3',
                  }),
                ]
              : []),
            Plot.line(actualHeads, {
              x: 'month',
              y: (r: RecruitingMonthRow) => toY(r.heads ?? 0),
              stroke: k.heads,
              strokeWidth: 1.75,
            }),
            Plot.dot(actualHeads, {
              x: 'month',
              y: (r: RecruitingMonthRow) => toY(r.heads ?? 0),
              r: 2.5,
              fill: k.heads,
            }),
            ...(aheadHeads.length > 1
              ? [
                  Plot.line(aheadHeads, {
                    x: 'month',
                    y: (r: RecruitingMonthRow) => toY(headsOf(r) ?? 0),
                    stroke: k.heads,
                    strokeWidth: 1.75,
                    strokeDasharray: '5,4',
                  }),
                ]
              : []),
          ],
        })
      }}
    />
  )
}
