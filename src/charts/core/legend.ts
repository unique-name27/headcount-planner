/**
 * Legend description shared by the on-screen legend (HTML above the plot) and image exports,
 * which read it back from the chart SVG's `data-legend` attribute and draw it into the picture.
 */
/**
 * `medal`: the tier medal glyph (a disc on a ribbon), for tier-coded charts. `outline`: an
 * unfilled rounded square, for an outline drawn over bars (the Pyramid's year-ago shape). `dash`:
 * a dashed line (5px dashes, 4px apart), for a dashed line mark such as a projection beside a solid
 * one. `dotted`: a dotted line (2px dots, 3px apart), for a dotted reference level, so it never reads
 * as the dashed projection beside it.
 */
export type LegendShape = 'rect' | 'line' | 'dash' | 'dotted' | 'dot' | 'diamond' | 'medal' | 'outline'

export interface LegendSwatch {
  label: string
  /** Resolved color. */
  color: string
  /**
   * Mirrors the mark: rect for bars and areas, line for lines, dash for dashed lines, dot for
   * points, diamond for diamond markers, medal for tier-coded marks (with the tier colors from
   * `theme.tier`).
   */
  shape?: LegendShape
  /**
   * A full-strength outline around a `rect` swatch, for a light fill drawn with an outline so it
   * stays visible on the sheet (a projection's bars, 3:1 non-text contrast).
   */
  stroke?: string
}

export type LegendSpec =
  | { kind: 'swatch'; items: LegendSwatch[] }
  /** Continuous ramp; `labels` are spread evenly under the ramp (min, [mid,] max). */
  | { kind: 'ramp'; colors: string[]; labels: string[]; title?: string }

export const LEGEND_ATTR = 'data-legend'

export function readLegend(svg: Element): LegendSpec | null {
  const raw = svg.getAttribute(LEGEND_ATTR)
  if (!raw) return null
  try {
    const v = JSON.parse(raw) as LegendSpec
    return v && (v.kind === 'swatch' || v.kind === 'ramp') ? v : null
  } catch {
    return null
  }
}

/** An SVG element (tag and attributes, fill excluded) that draws a swatch. */
export interface SwatchSvg {
  tag: 'rect' | 'circle' | 'path'
  attrs: Record<string, number | string>
}

/**
 * The swatch for `shape` drawn from `x` (left edge) around the center line `cy`, as image
 * exports draw it: a 10px rounded square, a 14x2 line, the same line in three dashes, an 8px dot,
 * a 10px diamond, or a medal (an 8px disc under a two-strap ribbon, as the tier badge draws it).
 */
export function swatchSvg(shape: LegendShape | undefined, x: number, cy: number): SwatchSvg {
  switch (shape) {
    case 'line':
      return { tag: 'rect', attrs: { x, y: cy - 1, width: 14, height: 2, rx: 1 } }
    case 'dash':
      // Two 5px dashes 4px apart across the line's 14px (the 5,4 line), as one filled path.
      return {
        tag: 'path',
        attrs: { d: DASH_OFFSETS.map((d) => `M${x + d},${cy - 1}h5v2h-5Z`).join(' ') },
      }
    case 'dotted':
      // Three 2px dots 3px apart (the 2,3 line), as one filled path.
      return {
        tag: 'path',
        attrs: { d: DOT_OFFSETS.map((d) => `M${x + d},${cy - 1}h2v2h-2Z`).join(' ') },
      }
    case 'dot':
      return { tag: 'circle', attrs: { cx: x + 4, cy, r: 4 } }
    case 'diamond':
      return {
        tag: 'path',
        attrs: { d: `M${x + 5},${cy - 5}L${x + 10},${cy}L${x + 5},${cy + 5}L${x},${cy}Z` },
      }
    case 'medal':
      return { tag: 'path', attrs: { d: medalPath(x, cy) } }
    case 'outline':
      // A 10px square ring 1.5px wide, as one filled path (the export fills every swatch).
      return {
        tag: 'path',
        attrs: {
          d: `M${x},${cy - 5}h10v10h-10Z M${x + 1.5},${cy - 3.5}v7h7v-7Z`,
          'fill-rule': 'evenodd',
        },
      }
    default:
      return { tag: 'rect', attrs: { x, y: cy - 5, width: 10, height: 10, rx: 2 } }
  }
}

/** Where the dash swatch's two dashes start, from its left edge (px). */
const DASH_OFFSETS = [0, 9] as const
/** Where the dotted swatch's three dots start, from its left edge (px). */
const DOT_OFFSETS = [0, 5, 10] as const

/** The dash swatch on screen (the legend and the tooltip): a 2px line of 5px dashes, 4px apart, as a 5,4 line. */
export function dashBackground(color: string): string {
  return `repeating-linear-gradient(to right, ${color} 0 5px, transparent 5px 9px)`
}

/** The dotted swatch on screen: a 2px line of 2px dots, 3px apart, as a 2,3 line. */
export function dottedBackground(color: string): string {
  return `repeating-linear-gradient(to right, ${color} 0 2px, transparent 2px 5px)`
}

/** A swatch's background on screen for the shapes drawn as a gradient line; null for the others. */
export function lineBackground(shape: LegendShape | undefined, color: string): string | null {
  return shape === 'dash' ? dashBackground(color) : shape === 'dotted' ? dottedBackground(color) : null
}

/** The medal swatch as one filled path in a 10 x 12 box from `x`, centered on `cy`. */
export function medalPath(x: number, cy: number): string {
  const disc = `M${x + 1},${cy + 1.5}a4,4 0 1,0 8,0a4,4 0 1,0 -8,0Z`
  const left = `M${x + 1.6},${cy - 5.5}L${x + 3.2},${cy - 5.5}L${x + 5.4},${cy - 2.2}L${x + 3.8},${cy - 2.2}Z`
  const right = `M${x + 8.4},${cy - 5.5}L${x + 6.8},${cy - 5.5}L${x + 4.6},${cy - 2.2}L${x + 6.2},${cy - 2.2}Z`
  return `${disc}${left}${right}`
}
