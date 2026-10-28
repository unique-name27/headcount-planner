/**
 * Plan > Recruiting summary's chart under its fix review (27 Oct 2026; docs/PLAN.md 9.8 item 2): the
 * projected starts' outline reaches 3:1 on the sheet and the slide (RU-1), both axes are titled
 * (RU-2), approved heads are dated and keyed apart from the dashed projection (RU-3, RU-14), a key
 * shows only for a mark drawn (RU-6), a small team's bars read in heads (RU-8), the month labels
 * thin to fit with their years (RU-11), and a move in has its own segment, key and stop (RU-13, RS-2).
 * Each failed on the chart before its fix: no outline colour, no axis title, "Approved heads" on
 * every row, the 0.06-head domain, odd months blanked on a phone, moves drawn as future starts.
 *
 * Its finish audit (28 Oct 2026, AF-1): every month ahead's drawn segments net to the dashed line's
 * step, the rare terms of projected heads included (signed offers past their start date, pre-hires,
 * last days on the as-of date). Before the fix the bars left them out: HR admin at 15 Oct was 3 short
 * in October, Silicon Engineering at 31 Aug 3 short in September, Finance at 31 Oct 8 short in November.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { ticks as d3ticks } from 'd3-array'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { listsInForce } from '@/access/lists'
import type { PlotElement } from '@/charts'
import type { Column } from '@/charts/types'
import { unitHrbps } from '@/data/lists/roles'
import type { Sample } from '@/data/sample'
import type { ISODate, PositionRow, WorkerRow } from '@/data/schema'
import { type DrillSource, resolveDrill } from '@/drill/types'
import { fmt } from '@/lib/format'
import {
  ctxAs,
  leakSample,
  personaCtx,
  sampleCtx,
  sampleSources,
  withPlan,
  withWorker,
} from '@/testkit/sample'

// The chart kit reads the theme's tokens from the page's styles; a test sets them from tokens.css.
const tokens = vi.hoisted(() => ({ map: new Map<string, string>() }))
vi.stubGlobal('getComputedStyle', () => ({
  getPropertyValue: (name: string) => tokens.map.get(name) ?? '',
  colorScheme: 'light',
}))
vi.stubGlobal('document', { documentElement: {} })

const { readChartTheme } = await import('@/charts/theme')
const { planRecruitingModel } = await import('../engine/recruitingTab')
const {
  AXIS_TITLES,
  approvedLabelOf,
  barDomain,
  chartColors,
  keyOf,
  legendOf,
  recruitingKeyPoints,
  segmentsOf,
  tipOf,
} = await import('./RecruitingMonthsChart')
const { monthTickLabels } = await import('./monthTicks')

type Row = ReturnType<typeof planRecruitingModel>['months']['rows'][number]

const css = readFileSync(fileURLToPath(new URL('../../../styles/tokens.css', import.meta.url)), 'utf8')

/** The token blocks in file order: light :root, dark under the OS preference, dark pinned (as tierTokens.test.ts). */
function blocks(): Record<'light' | 'darkOs' | 'darkPinned', string> {
  const os = css.indexOf('@media (prefers-color-scheme: dark)')
  const pinned = css.indexOf(':root[data-theme="dark"]')
  return { light: css.slice(0, os), darkOs: css.slice(os, pinned), darkPinned: css.slice(pinned) }
}
/** A block's tokens, light ones under the dark ones the block redefines. */
function tokensOf(block: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const src of [blocks().light, block])
    for (const m of src.matchAll(/(--[\w-]+):\s*([^;]+);/g)) out.set(m[1], m[2].trim())
  return out
}
const channel = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
function rgbOf(color: string): [number, number, number] {
  const hex = /^#([0-9a-f]{6})$/i.exec(color)
  if (hex)
    return [0, 2, 4].map((i) => Number.parseInt(hex[1].slice(i, i + 2), 16)) as [number, number, number]
  const rgb = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(color)
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])]
  throw new Error(`Not a colour: ${color}`)
}
function luminance(color: string): number {
  const [r, g, b] = rgbOf(color).map((c) => channel(c / 255))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

let s: Sample
beforeAll(() => {
  s = leakSample()
}, 120_000)

const row = (over: Partial<Row>): Row => ({
  month: '2026-11',
  label: 'Nov 2026',
  kind: 'ahead',
  kindText: 'Ahead',
  hires: null,
  exits: null,
  heads: null,
  futureStarts: 0,
  movesIn: 0,
  leaving: 0,
  pastStart: 0,
  preHires: 0,
  projectedStarts: 0,
  projectedExits: 0,
  projectedHeads: 10,
  approved: 12,
  ...over,
})

/* ───────────── RU-1 ───────────── */

describe('the projected starts’ bars stay visible (RU-1)', () => {
  it.each(Object.keys(blocks()) as ('light' | 'darkOs' | 'darkPinned')[])(
    'carry a full-strength outline at least 3:1 against the sheet and the slide’s white (%s)',
    (mode) => {
      tokens.map = tokensOf(blocks()[mode])
      const theme = readChartTheme()
      const c = chartColors(theme)
      expect(c.projectedStroke).toBe(theme.series[0])
      expect(contrast(c.projectedStroke, theme.sheet)).toBeGreaterThanOrEqual(3)
      // Pictures for the deck are captured in the light theme, on a white slide.
      if (mode === 'light') expect(contrast(c.projectedStroke, '#ffffff')).toBeGreaterThanOrEqual(3)
      // Control: the light fill alone does not reach 3:1, which is why the outline is there.
      expect(contrast(c.projected, theme.sheet)).toBeLessThan(3)
      // The legend's and the tooltip's keys carry the same outline.
      const legend = legendOf([row({ projectedStarts: 2 })], c, 'Approved heads')
      const key =
        legend.kind === 'swatch' ? legend.items.find((i) => i.label === 'Projected starts (model)') : null
      expect(key?.stroke).toBe(c.projectedStroke)
      const tip = tipOf(row({ projectedStarts: 2 }), 'projected', c, 'Approved heads')
      expect(tip.rows.find((r) => r.label === 'Projected starts (model)')?.stroke).toBe(c.projectedStroke)
    },
  )
})

/* ───────────── RU-2 ───────────── */

describe('the two axes (RU-2)', () => {
  it('are titled in sentence case: the bars’ left one and the lines’ right one', () => {
    expect(AXIS_TITLES).toEqual({ left: 'Hires and exits a month', right: 'Heads' })
    const src = readFileSync(fileURLToPath(new URL('./RecruitingMonthsChart.tsx', import.meta.url)), 'utf8')
    // Both axisY marks pass their title in (the house axis sets none by default).
    expect(src.match(/label: AXIS_TITLES\.(left|right)/g)).toEqual([
      'label: AXIS_TITLES.left',
      'label: AXIS_TITLES.right',
    ])
  })
})

/* ───────────── RU-3, RU-6, RU-14 ───────────── */

describe('approved heads and the keys (RU-3, RU-6, RU-14)', () => {
  it('dates approved heads in the legend and the tooltip, and leaves them out of a closed month’s tooltip', () => {
    tokens.map = tokensOf(blocks().light)
    const c = chartColors(readChartTheme())
    const m = planRecruitingModel(sampleCtx('hrbp'))
    const label = approvedLabelOf(m.months.columns)
    expect(label).toBe('Approved heads by 31 Mar 2027')
    const legend = legendOf(m.months.rows, c, label)
    const items = legend.kind === 'swatch' ? legend.items : []
    expect(items.at(-1)).toMatchObject({ label: 'Approved heads by 31 Mar 2027', shape: 'dotted' })
    // The projection is dashed, the reference level dotted: two keys that never look alike.
    expect(items.find((i) => i.label === 'Projected heads')?.shape).toBe('dash')
    const closed = m.months.rows.find((r) => r.kind === 'actual') as Row
    expect(tipOf(closed, 'hires', c, label).rows.map((r) => r.label)).toEqual([
      'Hires',
      'Exits',
      'Heads at month end',
    ])
    const ahead = m.months.rows.find((r) => r.kind === 'ahead') as Row
    expect(tipOf(ahead, 'future', c, label).rows.at(-1)?.label).toBe('Approved heads by 31 Mar 2027')
  })

  it('titles a mid-month as-of date’s month as actual to date, then ahead, with its hires and exits to date (RU-5)', () => {
    const c = chartColors(readChartTheme())
    const r = row({ month: '2026-10', kindText: 'Actual to 15 Oct, then ahead', hires: 0, exits: 3 })
    const tip = tipOf(r, 'exits', c, 'Approved heads')
    expect(tip.title).toMatch(/: actual to 15 Oct, then ahead$/)
    expect(tip.rows.slice(0, 2).map((x) => [x.label, x.value, x.strong])).toEqual([
      ['Hires to date', '0', false],
      ['Exits to date', '3', true],
    ])
    // Its exits to date sit under the projected attrition, in the closed colour.
    const segs = segmentsOf({ ...r, projectedExits: 2 })
    expect(
      segs.filter((x) => x.part === 'exits' || x.part === 'attrition').map((x) => [x.part, x.y1, x.y2]),
    ).toEqual([
      ['exits', -3, 0],
      ['attrition', -5, -3],
    ])
  })

  it('names no projected heads in the tooltip with no Working forecast', () => {
    const c = chartColors(readChartTheme())
    const tip = tipOf(row({ projectedStarts: null, projectedHeads: null }), 'future', c, 'Approved heads')
    expect(tip.rows.map((r) => r.label)).not.toContain('Projected heads')
    expect(tip.rows.map((r) => r.label)).not.toContain('Projected starts (model)')
  })
})

/* ───────────── RU-8 ───────────── */

describe('a small team’s bars (RU-8)', () => {
  it('read in heads: a floor of one head each way, labelled exactly', () => {
    // Manager C: no hire or exit in 12 closed months and about 0.06 heads a month ahead.
    const tiny = [
      row({
        kind: 'actual',
        kindText: 'Closed',
        hires: 0,
        exits: 0,
        heads: 7,
        futureStarts: null,
        movesIn: null,
        projectedStarts: null,
        projectedExits: null,
        projectedHeads: null,
      }),
      row({ month: '2026-10', projectedStarts: 0.06, projectedExits: 0.05, projectedHeads: 7 }),
    ]
    const [lo, hi] = barDomain(tiny)
    expect([lo, hi]).toEqual([-1.1, 1.1])
    const labels = d3ticks(lo, hi, 5).map((v) => fmt(v, 'num1'))
    expect(new Set(labels).size).toBe(labels.length)
    expect(labels).toEqual(['−1.0', '−0.5', '0.0', '0.5', '1.0'])
    // No exit shown: nothing below 0.
    expect(barDomain([row({ futureStarts: 0.4 })])).toEqual([0, 1.1])
    // A team with whole hires keeps its own scale.
    expect(barDomain([row({ futureStarts: 12, projectedExits: 3 })])).toEqual([
      -3.3000000000000003, 13.200000000000001,
    ])
  })
})

/* ───────────── RU-11 ───────────── */

describe('the month labels (RU-11)', () => {
  const months = (from: string, n: number) => {
    const out: string[] = []
    let [y, mo] = from.split('-').map(Number)
    for (let i = 0; i < n; i++) {
      out.push(`${y}-${String(mo).padStart(2, '0')}`)
      mo++
      if (mo > 12) {
        mo = 1
        y++
      }
    }
    return out
  }
  const width = (texts: readonly string[], size: number) =>
    Math.max(...texts.map((t) => t.length)) * size * 0.6

  it('thin to fit on a phone, never repeat a label, and give the year where it changes', () => {
    for (const [n, step] of [
      [18, 219 / 18],
      [30, 219 / 30],
    ] as const) {
      const ms = months('2025-10', n)
      const label = monthTickLabels(ms, step, width)
      const shown = ms.map(label).filter(Boolean)
      expect(shown.length, `${n} months`).toBeGreaterThanOrEqual(3)
      expect(new Set(shown).size, `${n} months: ${shown.join(', ')}`).toBe(shown.length)
      // Labels never overlap: each shown label is at least its width plus 10px from the next.
      const idx = ms.map((m, i) => (label(m) ? i : -1)).filter((i) => i >= 0)
      for (let i = 1; i < idx.length; i++)
        expect((idx[i] - idx[i - 1]) * step, `${n} months`).toBeGreaterThanOrEqual(width(shown, 11) + 10)
      expect(shown[0]).toMatch(/'25$/)
      // A shown label in a new year carries it.
      for (const [i, m] of idx.map((j) => [j, ms[j]] as const))
        if (i !== idx[0] && ms[idx[idx.indexOf(i) - 1]].slice(0, 4) !== m.slice(0, 4))
          expect(label(m)).toMatch(/'\d\d$/)
    }
  })

  it('label every month on a wide screen, the year on the first and on January', () => {
    const ms = months('2025-10', 18)
    const label = monthTickLabels(ms, 60, width)
    expect(ms.map(label)).toEqual([
      "Oct '25",
      'Nov',
      'Dec',
      "Jan '26",
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
      "Jan '27",
      'Feb',
      'Mar',
    ])
  })
})

/* ───────────── RU-13, RS-2 ───────────── */

/** A plot whose x scale puts month i at 10 × i (band 8) and whose y scale is the negated identity. */
function fakePlot(ms: readonly string[]): PlotElement {
  return {
    scale: (name: string) =>
      name === 'x'
        ? { apply: (v: unknown) => ms.indexOf(String(v)) * 10, bandwidth: 8 }
        : { apply: (v: unknown) => -Number(v), bandwidth: 0 },
  } as unknown as PlotElement
}

const SE = 'Silicon Engineering'
const GTM = 'Go-to-Market'
const AS_OF: ISODate = '2026-09-30'
const isEmp = (w: WorkerRow) => (w.workerType || 'Employee') === 'Employee'
const activeOn = (w: WorkerRow, d: string) => {
  const end = [w.assignmentEnd, w.terminationDate].filter(Boolean).sort()[0] ?? null
  return (w.assignmentStart || w.hireDate) <= d && (end == null || end >= d)
}

/** An approved internal move from a Silicon Engineering seat into an Open Go-to-Market seat on 16 Oct, as applyTransfer writes it. */
function withMoveIn(x: Sample): { sample: Sample; to: string } {
  const at = new Map<string, PositionRow>()
  for (const r of [...x.datasets.positions, ...x.plan.overlay.positions].sort((a, b) =>
    a.effectiveDate < b.effectiveDate ? -1 : 1,
  ))
    if (r.effectiveDate <= AS_OF) at.set(r.positionId, r)
  const managers = new Set(x.datasets.workers.map((w) => w.managerId).filter(Boolean))
  const mover = x.datasets.workers.find(
    (w) =>
      isEmp(w) &&
      !!w.positionId &&
      at.get(w.positionId)?.businessUnit === SE &&
      at.get(w.positionId)?.status === 'Filled' &&
      activeOn(w, AS_OF) &&
      !w.terminationDate &&
      !w.assignmentEnd &&
      !managers.has(w.employeeId) &&
      x.datasets.workers.filter((y) => y.employeeId === w.employeeId).length === 1,
  ) as WorkerRow
  const offers = new Set(x.datasets.reqs.filter((q) => q.stage === 'Offer accepted').map((q) => q.positionId))
  const to = [...at.values()]
    .filter(
      (r) =>
        r.businessUnit === GTM &&
        r.status === 'Open' &&
        (r.workerType || 'Employee') === 'Employee' &&
        !offers.has(r.positionId) &&
        !x.datasets.workers.some((w) => w.positionId === r.positionId && activeOn(w, AS_OF)),
    )
    .sort((a, b) => (a.positionId < b.positionId ? 1 : -1))[0] as PositionRow
  const from = at.get(mover.positionId as string) as PositionRow
  const on: ISODate = '2026-10-16'
  const sample = withPlan(x, {
    overlay: {
      ...x.plan.overlay,
      positions: [
        ...x.plan.overlay.positions,
        { ...from, effectiveDate: on, status: 'On hold', sourceRequestId: 'REQ-FIX-MOVE' },
        { ...to, effectiveDate: on, status: 'Filled', sourceRequestId: 'REQ-FIX-MOVE' },
      ],
    },
  })
  return { sample, to: to.positionId }
}

describe('a move in on the chart (RU-13, RS-2)', () => {
  it('is its own segment, key and keyboard stop, opening the move, never the signed offers', () => {
    const { sample, to } = withMoveIn(s)
    const gtm = unitHrbps(listsInForce(null, sample.datasets, sampleSources(sample.datasets))).get(
      GTM,
    ) as string
    const m = planRecruitingModel(ctxAs('hrbp', gtm, { unit: GTM, sample }))
    const oct = m.months.rows.find((r) => r.month === '2026-10') as Row
    expect(oct.movesIn).toBe(1)
    expect(oct.futureStarts).toBeGreaterThan(0)
    // Segments: the future starts alone, then the move in on them, then the projected starts.
    const segs = segmentsOf(oct)
    const future = segs.find((x) => x.part === 'future')
    const moves = segs.find((x) => x.part === 'moves')
    expect(future && future.y2 - future.y1).toBe(oct.futureStarts)
    expect(moves && [moves.y1, moves.y2]).toEqual([oct.futureStarts, (oct.futureStarts ?? 0) + 1])
    tokens.map = tokensOf(blocks().light)
    const c = chartColors(readChartTheme())
    expect(c.moves).not.toBe(c.future)
    const legend = legendOf(m.months.rows, c, approvedLabelOf(m.months.columns))
    const items = legend.kind === 'swatch' ? legend.items : []
    expect(items.find((i) => i.label === 'Moves in')?.color).toBe(c.moves)
    // The keyboard stops on the future starts and on the move in, each opening its own records.
    const points = recruitingKeyPoints(m.months.rows, fakePlot(m.months.rows.map((r) => r.month)))
    const stops = points.filter((p) => p.datum === oct && p.group === 'starts').map((p) => p.part)
    expect(stops.slice(0, 2)).toEqual(['future', 'moves'])
    const open = (key: string) => {
      const col = m.months.columns.find((x) => x.key === key) as Column<Row>
      return resolveDrill(col.drill?.(oct) as DrillSource)
    }
    const offers = open(keyOf(oct, 'future'))
    expect(offers?.kind).toBe('reqs')
    expect(offers?.rows.length).toBe(oct.futureStarts)
    const moved = open(keyOf(oct, 'moves'))
    expect(moved?.title).toBe('Moves in, Oct 2026')
    expect(moved?.rows.map((r) => (r as { positionId: string }).positionId)).toEqual([to])
  })

  it('control: with no move in, no key and no stop', () => {
    const m = planRecruitingModel(sampleCtx('hrbp'))
    const c = chartColors(readChartTheme())
    const legend = legendOf(m.months.rows, c, 'Approved heads')
    expect((legend.kind === 'swatch' ? legend.items : []).some((i) => i.label === 'Moves in')).toBe(false)
    const points = recruitingKeyPoints(m.months.rows, fakePlot(m.months.rows.map((r) => r.month)))
    expect(points.some((p) => p.part === 'moves')).toBe(false)
  })
})

/* ───────────── AF-1 ───────────── */

/** A Silicon Engineering employee alone on a Filled seat with no last day, hired well before the as-of date. */
function seHolder(x: Sample): WorkerRow {
  const at = new Map<string, PositionRow>()
  for (const r of [...x.datasets.positions].sort((a, b) => (a.effectiveDate < b.effectiveDate ? -1 : 1)))
    if (r.effectiveDate <= AS_OF) at.set(r.positionId, r)
  return x.datasets.workers.find(
    (w) =>
      !!w.positionId &&
      at.get(w.positionId)?.businessUnit === SE &&
      isEmp(w) &&
      !w.terminationDate &&
      !w.assignmentEnd &&
      (w.assignmentStart || w.hireDate) <= '2026-01-01' &&
      x.datasets.workers.filter((y) => y.employeeId === w.employeeId).length === 1,
  ) as WorkerRow
}

/** A month's drawn segments, netted: up parts less down parts. */
const netOf = (r: Row) =>
  segmentsOf(r).reduce((a, x) => a + (UP_PARTS.has(x.part) ? 1 : -1) * (x.y2 - x.y1), 0)
const UP_PARTS = new Set(['hires', 'future', 'pastStart', 'preHires', 'moves', 'projected'])

describe('each month ahead’s drawn bars net to the line’s step (finish audit AF-1)', () => {
  const lastDay = (on: ISODate) => withWorker(s, seHolder(s).employeeId, { terminationDate: on })
  const CASES: [string, () => ReturnType<typeof sampleCtx>, string | null][] = [
    ['HR admin, 15 Oct', () => sampleCtx('hr-admin', { asOfOverride: '2026-10-15', sample: s }), 'pastStart'],
    [
      'Silicon Engineering, 15 Oct',
      () => personaCtx('hrbp-se', { asOfOverride: '2026-10-15', sample: s }),
      'pastStart',
    ],
    [
      'Silicon Engineering, a last day on 30 Sep',
      () => personaCtx('hrbp-se', { sample: lastDay('2026-09-30') }),
      'leaving',
    ],
    [
      'Silicon Engineering, a last day on 15 Oct, as of 15 Oct',
      () => personaCtx('hrbp-se', { asOfOverride: '2026-10-15', sample: lastDay('2026-10-15') }),
      'pastStart',
    ],
    [
      'Silicon Engineering, 31 Aug',
      () => personaCtx('hrbp-se', { asOfOverride: '2026-08-31', sample: s }),
      'preHires',
    ],
    [
      'Finance, 31 Oct',
      () => personaCtx('finance-fpa', { asOfOverride: '2026-10-31', sample: s }),
      'pastStart',
    ],
    ['control: Silicon Engineering, 30 Sep', () => personaCtx('hrbp-se', { sample: s }), null],
  ]

  it.each(CASES)('%s', (_, ctx, rare) => {
    const rows = planRecruitingModel(ctx()).months.rows
    let checked = 0
    for (const [i, r] of rows.entries()) {
      if (r.kind !== 'ahead' || r.projectedHeads == null || i === 0) continue
      const prev = rows[i - 1]
      const before = prev.kind === 'ahead' ? prev.projectedHeads : prev.heads
      if (before == null) continue
      expect(netOf(r), r.month).toBeCloseTo(r.projectedHeads - before, 9)
      checked++
    }
    expect(checked).toBeGreaterThan(4)
    const parts = new Set(rows.flatMap((r) => segmentsOf(r).map((x) => x.part)))
    // The case's rare term is drawn, as its own part; the control draws none.
    if (rare) expect(parts.has(rare as never), rare).toBe(true)
    else for (const k of ['pastStart', 'preHires', 'leaving'] as const) expect(parts.has(k), k).toBe(false)
  })

  it('counts a last day on a mid-month as-of date once, as an exit to date, never again as a last day', () => {
    const m = planRecruitingModel(
      personaCtx('hrbp-se', { asOfOverride: '2026-10-15', sample: lastDay('2026-10-15') }),
    )
    const oct = m.months.rows.find((r) => r.month === '2026-10') as Row
    expect([oct.exits, oct.leaving]).toEqual([1, 0])
    // The quarter table starts from current heads, which still hold the leaver: its last day stays a term there.
    expect(m.quarters.rows.find((r) => r.key === 'q3')?.leaving).toBe(1)
  })

  it('gives each rare term a key, a tooltip row in its colour and a keyboard stop opening its own records', () => {
    tokens.map = tokensOf(blocks().light)
    const c = chartColors(readChartTheme())
    const m = planRecruitingModel(personaCtx('finance-fpa', { asOfOverride: '2026-10-31', sample: s }))
    const nov = m.months.rows.find((r) => r.month === '2026-11') as Row
    expect(nov.pastStart).toBe(8)
    const items = (() => {
      const l = legendOf(m.months.rows, c, approvedLabelOf(m.months.columns))
      return l.kind === 'swatch' ? l.items : []
    })()
    expect(items.find((i) => i.label === 'Signed offers past their start date')?.color).toBe(c.pastStart)
    expect(new Set([c.pastStart, c.preHires, c.leaving, c.future, c.moves, c.exitsAhead]).size).toBe(6)
    const tip = tipOf(nov, 'pastStart', c, 'Approved heads')
    expect(tip.rows.find((x) => x.label === 'Signed offers past their start date')).toMatchObject({
      value: '8',
      color: c.pastStart,
      strong: true,
    })
    const points = recruitingKeyPoints(m.months.rows, fakePlot(m.months.rows.map((r) => r.month)))
    const stops = points.filter((p) => p.datum === nov && p.group === 'starts').map((p) => p.part)
    expect(stops.slice(0, 2)).toEqual(['future', 'pastStart'])
    expect(keyOf(nov, 'pastStart')).toBe('pastStart')
    const col = m.months.columns.find((x) => x.key === keyOf(nov, 'pastStart')) as Column<Row>
    expect(resolveDrill(col.drill?.(nov) as DrillSource)?.rows.length).toBe(8)
    // Control: with none, no key and no stop.
    const base = planRecruitingModel(personaCtx('finance-fpa', { sample: s }))
    const baseKeys = legendOf(base.months.rows, c, 'Approved heads')
    expect((baseKeys.kind === 'swatch' ? baseKeys.items : []).map((i) => i.label)).not.toContain(
      'Signed offers past their start date',
    )
  })
})
