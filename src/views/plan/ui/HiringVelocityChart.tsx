/**
 * Hiring velocity (docs/PLAN.md 9.7 screen 3, change C37): one column per month, hires up and exits
 * down from the zero line with the net line through them, the trailing closed months in full color
 * and the months ahead to the fiscal year end (future starts, the signed offers by start month, and
 * expected exits) lighter, their net line dashed. No forecast start is drawn.
 * A bar opens its records or calculation card (the model's own cells), and the keyboard steps
 * through the months, hires and exits alike. Presentation only: every number comes from the model's
 * rows.
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
import type { Column } from '@/charts/types'
import { useChartHeight, useNarrow } from '@/components/useNarrow'
import { formatMonth, formatMonthShort } from '@/lib/dates'
import { fmt, MINUS } from '@/lib/format'
import type { HiringVelocityRow } from '../engine/hiringTab'
import { cellOpens, openCellOrCard } from './shared'

/** How much of the sheet a forecast month's bar takes on: the same hue, lighter. */
const FORECAST_SHARE = 0.55

/** A color moved toward another by a share (hex or rgb colors; anything else is kept). */
export function towards(color: string, to: string, share: number): string {
  const a = rgbOf(color)
  const b = rgbOf(to)
  if (!a || !b) return color
  const mix = a.map((v, i) => Math.round(v + (b[i] - v) * share))
  return `rgb(${mix[0]}, ${mix[1]}, ${mix[2]})`
}

function rgbOf(c: string): [number, number, number] | null {
  const s = c.trim()
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s)
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map((x) => x + x).join('') : hex[1]
    return [
      Number.parseInt(h.slice(0, 2), 16),
      Number.parseInt(h.slice(2, 4), 16),
      Number.parseInt(h.slice(4, 6), 16),
    ]
  }
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(s)
  return rgb ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] : null
}

interface Colors {
  hires: string
  exits: string
  hiresAhead: string
  exitsAhead: string
  net: string
}

const colorsOf = (t: ChartTheme): Colors => ({
  hires: t.series[0],
  exits: t.series[1] ?? t.status.serious,
  hiresAhead: towards(t.series[0], t.sheet, FORECAST_SHARE),
  exitsAhead: towards(t.series[1] ?? t.status.serious, t.sheet, FORECAST_SHARE),
  net: t.ink,
})

const signed = (v: number, actual: boolean): string => {
  const body = fmt(Math.abs(v), actual ? 'int' : 'num1')
  return v > 0 ? `+${body}` : v < 0 ? `${MINUS}${body}` : body
}

/**
 * The keyboard's stops: every month's hires bar, then every month's exits bar (review HU-4), so Left
 * and Right step through the months and Up and Down switch between hires and exits, as the Columns
 * kit does. Each stop names its part, so Enter opens that bar's records or card, and carries the
 * bar's box for the focus ring.
 */
export function velocityKeyPoints(
  rows: readonly HiringVelocityRow[],
  plot: PlotElement,
): KeyPoint<HiringVelocityRow>[] {
  const w = Math.max(4, plotBand(plot, 'x') * 0.75)
  const bar = (r: HiringVelocityRow, part: 'hires' | 'exits'): KeyPoint<HiringVelocityRow> => {
    const lo = part === 'hires' ? 0 : -r.exits
    const hi = part === 'hires' ? r.hires : 0
    const a = plotPos(plot, 'y', lo)
    const b = plotPos(plot, 'y', hi)
    return {
      datum: r,
      part,
      group: part,
      x: plotPos(plot, 'x', r.month),
      y: (a + b) / 2,
      w,
      h: Math.max(4, Math.abs(a - b)),
    }
  }
  return [...rows.map((r) => bar(r, 'hires')), ...rows.map((r) => bar(r, 'exits'))]
}

export function HiringVelocityChart({
  rows,
  columns,
}: {
  rows: readonly HiringVelocityRow[]
  columns: readonly Column<HiringVelocityRow>[]
}) {
  const theme = useChartTheme()
  const narrow = useNarrow()
  const height = useChartHeight('lead')
  const c = colorsOf(theme)
  const order = rows.map((r) => r.month)
  const firstAhead = rows.find((r) => r.kind === 'forecast')?.month ?? null
  const lo = Math.min(0, ...rows.map((r) => -r.exits), ...rows.map((r) => r.net))
  const hi = Math.max(0, ...rows.map((r) => r.hires), ...rows.map((r) => r.net)) || 1
  const ticks = tickFormat('num1')
  const legend: LegendSpec = {
    kind: 'swatch',
    items: [
      { label: 'Hires', color: c.hires, shape: 'rect' },
      { label: 'Exits', color: c.exits, shape: 'rect' },
      { label: 'Net', color: c.net, shape: 'line' },
      ...(firstAhead
        ? [
            { label: 'Future starts', color: c.hiresAhead, shape: 'rect' as const },
            { label: 'Expected exits', color: c.exitsAhead, shape: 'rect' as const },
          ]
        : []),
    ],
  }
  const actualNet = rows.filter((r) => r.kind === 'actual')
  // The forecast's net line starts at the last closed month, so the two lines meet.
  const lastActual = actualNet.at(-1)
  const aheadNet = [...(lastActual ? [lastActual] : []), ...rows.filter((r) => r.kind === 'forecast')]
  return (
    <PlotChart<HiringVelocityRow>
      height={height}
      legend={legend}
      ariaLabel="Hires and exits by month, closed months then the months ahead"
      tip={(r, part): TipContent => {
        const actual = r.kind === 'actual'
        return {
          title: `${formatMonth(`${r.month}-01`)}${actual ? '' : ', ahead'}`,
          rows: [
            {
              label: actual ? 'Hires' : 'Future starts',
              value: fmt(r.hires, 'int'),
              color: actual ? c.hires : c.hiresAhead,
              shape: 'rect',
              strong: part === 'hires',
            },
            {
              label: actual ? 'Exits' : 'Expected exits',
              value: fmt(r.exits, actual ? 'int' : 'num1'),
              color: actual ? c.exits : c.exitsAhead,
              shape: 'rect',
              strong: part === 'exits',
            },
            { label: 'Net', value: signed(r.net, actual), color: c.net, shape: 'line' },
          ],
        }
      }}
      pick={(_r, at, plot) => {
        const zero = plotPos(plot, 'y', 0)
        return at.y <= zero ? 'hires' : 'exits'
      }}
      selectable={(r, part) => cellOpens(columns, part ?? 'hires', r)}
      onSelect={(r, part) => openCellOrCard(columns, part ?? 'hires', r)}
      keyPoints={(plot: PlotElement) => velocityKeyPoints(rows, plot)}
      build={(ctx) => {
        const t = ctx.theme
        const k = colorsOf(t)
        return housePlot(ctx, {
          height,
          marginLeft: 40,
          marginTop: 12,
          marginBottom: 28,
          x: { type: 'band', domain: order, padding: 0.25 },
          y: { domain: [lo * 1.08, hi * 1.08], nice: true },
          marks: [
            gridY(t, { ticks: 5 }),
            axisY(t, { tickFormat: ticks, ticks: 5 }),
            axisX(t, {
              tickFormat: (m: string, i: number) =>
                narrow && i % 2 === 1 ? '' : formatMonthShort(`${m}-01`, i === 0 || m.endsWith('-01')),
            }),
            hoverBand(rows, { axis: 'x', value: (r) => r.month, color: t.ink }),
            Plot.barY(rows, {
              x: 'month',
              y1: 0,
              y2: (r: HiringVelocityRow) => r.hires,
              fill: (r: HiringVelocityRow) => (r.kind === 'actual' ? k.hires : k.hiresAhead),
              ry1: 2,
            }),
            Plot.barY(rows, {
              x: 'month',
              y1: (r: HiringVelocityRow) => -r.exits,
              y2: 0,
              fill: (r: HiringVelocityRow) => (r.kind === 'actual' ? k.exits : k.exitsAhead),
              ry2: 2,
            }),
            baseline(t, 'y'),
            Plot.line(actualNet, { x: 'month', y: 'net', stroke: k.net, strokeWidth: 1.5 }),
            Plot.dot(actualNet, { x: 'month', y: 'net', r: 2.5, fill: k.net }),
            ...(aheadNet.length > 1
              ? [
                  Plot.line(aheadNet, {
                    x: 'month',
                    y: 'net',
                    stroke: k.net,
                    strokeWidth: 1.5,
                    strokeDasharray: '4,3',
                  }),
                ]
              : []),
          ],
        })
      }}
    />
  )
}
