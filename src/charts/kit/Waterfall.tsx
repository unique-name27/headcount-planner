/**
 * Waterfall (docs/PLAN.md 6.8 and 9.5; the template app has none): the bridge from the comparison's
 * total to the forecast's, one floating bar per driver in the bridge's fixed order, and the FX
 * effect. Totals (the start and the end) stand on the zero baseline in the first series color;
 * steps float from the running total, colored by whether they move cost the good way
 * (`goodDirection`, default 'down': cost going up reads in the serious status color); "Other
 * changes" (steps with too few contributors folded, 7.2 rule 5) and the Rounding bar (rounded
 * modes) are de-emphasized. Dotted hairlines join each bar to the next. A step that reads "—" has
 * no bar and shows "—" where its value would be; it never counts as 0.
 *
 * The geometry is `waterfallModel` (./waterfallModel.ts, pure and tested: the steps add up to the
 * end, a Rounding bar closes a rounded waterfall). Tooltip, click-to-drill (a step opens its
 * contributors or its calculation card) and the keyboard layer come from PlotChart; the chart
 * exports as one SVG.
 *
 *   <Figure id="forecast-bridge" metric="forecast.bridge.step" title="Bridge to forecast" data={rows} columns={cols} uses={uses}>
 *     <Waterfall data={rows} onSelect={(s) => calc(s.calc)} ariaLabel="Bridge from FY27 Budget to forecast" />
 *   </Figure>
 */
import * as Plot from '@observablehq/plot'
import { useNarrow } from '@/components/useNarrow'
import { DASH, type Format, fmt, MINUS } from '@/lib/format'
import type { KeyPoint } from '../core/keyboard'
import { hoverBand, labelsMark, type PixelLabel, scalePos } from '../core/marks'
import type { TipContent } from '../core/tooltip'
import {
  axisX,
  axisY,
  baseline,
  gridY,
  housePlot,
  PlotChart,
  type PlotElement,
  plotPos,
  tickFormat,
} from '../plot'
import type { ChartTheme } from '../theme'
import type { WaterfallStep } from '../types'
import { type ChartBaseProps, gateOf, HIDDEN_NOTE } from './shared'
import { type WaterfallBar, type WaterfallTone, waterfallModel } from './waterfallModel'

export interface WaterfallProps<S extends WaterfallStep> extends ChartBaseProps<S> {
  /** The rows in order: start, the steps, Rounding when rounded, end (`waterfallSteps`). */
  data: readonly S[]
  /** Value format (default 'money'). */
  format?: Format
  /** Which way is good for the measure (default 'down': cost). */
  goodDirection?: 'up' | 'down'
  /** Muted text under the value in the tooltip, e.g. "12 positions changed". */
  secondary?: (d: S) => string | null | undefined
  /** Plot height in px (default 260, 220 on phones). */
  height?: number
  /** The tooltip note for a step that reads "—" (default: hidden for anonymity). */
  nullNote?: string
}

/** "+$0.5M", "−$0.3M", "±$0": a step's signed change in the value's format. */
export function signedStep(v: number, format: Format): string {
  const body = fmt(Math.abs(v), format)
  if (!/[1-9]/.test(body)) return `±${body}`
  return `${v > 0 ? '+' : MINUS}${body}`
}

/** A bar's value as the chart prints it: totals plain, steps signed, hidden ones "—". */
export function waterfallValueText(b: Pick<WaterfallBar, 'kind' | 'value'>, format: Format): string {
  if (b.value == null) return DASH
  return b.kind === 'start' || b.kind === 'end' ? fmt(b.value, format) : signedStep(b.value, format)
}

/** A bar's fill: totals in the first series color, good and bad moves in status colors, the rest muted. */
export function waterfallColor(t: ChartTheme, tone: WaterfallTone, goodDirection: 'up' | 'down'): string {
  switch (tone) {
    case 'total':
      return t.series[0]
    case 'up':
      return goodDirection === 'up' ? t.status.good : t.status.serious
    case 'down':
      return goodDirection === 'down' ? t.status.good : t.status.serious
    default:
      return t.deemph
  }
}

export function Waterfall<S extends WaterfallStep>({
  data,
  format = 'money',
  goodDirection = 'down',
  secondary,
  height: heightProp,
  nullNote = HIDDEN_NOTE,
  onSelect,
  selectable,
  lockedNote,
  ariaLabel,
}: WaterfallProps<S>) {
  const narrow = useNarrow()
  const height = heightProp ?? (narrow ? 220 : 260)
  const model = waterfallModel(data)
  const bars = model.bars
  const order = bars.map((b) => b.key)
  const labelOf = new Map(bars.map((b) => [b.key, b.label]))
  const canOpen = gateOf<S>((d) => d.value != null, selectable)
  const shown = bars.filter((b) => b.from != null && b.to != null)
  const ticks = tickFormat(format)
  const lo = Math.min(0, model.min)
  const hi = Math.max(0, model.max) * 1.08 || 1

  return (
    <PlotChart<WaterfallBar<S>>
      height={height}
      ariaLabel={ariaLabel}
      onSelect={onSelect ? (b) => onSelect(b.step) : undefined}
      selectable={(b) => canOpen(b.step)}
      openHint="see what is behind this step"
      tip={(b) => {
        const total = b.kind === 'start' || b.kind === 'end'
        const rows: TipContent['rows'] = [
          { label: total ? 'Total' : 'Change', value: waterfallValueText(b, format), strong: true },
        ]
        const more = secondary?.(b.step)
        if (more) rows.push({ value: more })
        if (!total && b.value != null) rows.push({ label: 'Running total', value: fmt(b.running, format) })
        const note =
          b.value == null ? nullNote : !canOpen(b.step) ? (lockedNote?.(b.step) ?? undefined) : undefined
        return { title: b.label, rows, ...(note ? { note } : {}) }
      }}
      keyPoints={(plot: PlotElement): KeyPoint<WaterfallBar<S>>[] =>
        bars.map((b) => ({
          datum: b,
          x: plotPos(plot, 'x', b.key),
          y: plotPos(plot, 'y', b.to ?? b.running),
        }))
      }
      build={(ctx) => {
        const t = ctx.theme
        const connectors = bars
          .slice(0, -1)
          .map((b, i) => ({ from: b.key, to: bars[i + 1].key, y: b.running }))
        return housePlot(ctx, {
          height,
          marginLeft: 56,
          marginTop: 18,
          marginBottom: narrow ? 56 : 32,
          x: { type: 'band', domain: order, padding: 0.28 },
          y: { domain: [lo, hi], nice: true },
          marks: [
            gridY(t, { ticks: 5 }),
            axisY(t, { tickFormat: ticks, ticks: 5 }),
            axisX(t, {
              tickFormat: (k: string) => labelOf.get(k) ?? k,
              ...(narrow ? { tickRotate: -35 } : {}),
            }),
            hoverBand(bars, { axis: 'x', value: (b) => b.key, color: t.ink }),
            Plot.rectY(shown, {
              x: 'key',
              y1: (b: WaterfallBar<S>) => Math.min(b.from as number, b.to as number),
              y2: (b: WaterfallBar<S>) => Math.max(b.from as number, b.to as number),
              fill: (b: WaterfallBar<S>) => waterfallColor(t, b.tone, goodDirection),
              rx: 2,
            }),
            // Dotted hairlines from each bar's end to the next bar.
            Plot.link(connectors, {
              x1: 'from',
              x2: 'to',
              y1: 'y',
              y2: 'y',
              stroke: t.rule,
              strokeWidth: 1,
              strokeDasharray: '2,2',
            }),
            baseline(t, 'y'),
            labelsMark((scales) => {
              const out: PixelLabel[] = []
              for (const b of bars) {
                const top = Math.max(b.from ?? b.running, b.to ?? b.running)
                out.push({
                  x: scalePos(scales, 'x', b.key),
                  y: scalePos(scales, 'y', top) - 9,
                  anchor: 'middle',
                  parts: [{ text: waterfallValueText(b, format), color: b.value == null ? t.muted : t.ink2 }],
                  halo: t.sheet,
                })
              }
              return out
            }, 'values'),
          ],
        })
      }}
    />
  )
}
