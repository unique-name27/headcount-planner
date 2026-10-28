/**
 * Plan > Recruiting summary's screen (docs/PLAN.md 9.8, change C38), below the render test: the
 * chart's right axis ticks (`niceTicks`, whole heads only), the cell each bar opens (`keyOf`), the
 * keyboard's stops (`recruitingKeyPoints`: Left and Right through the months, Up and Down between
 * starts and exits, each stop opening its own bar's records or card), and the one slide's summary the
 * tab hands its chart figure (`deckSummary`): the seven numbers as the strip shows them, standing in
 * for the strip, the quarter table and where hiring happened, never for the chart, in every mode.
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { PlotElement } from '@/charts'
import { stepKey } from '@/charts/core/keyboard'
import type { Column, DeckSummary } from '@/charts/types'
import type { Kpi } from '@/components/types'
import type { AnalyticsContext } from '@/data/context'
import type { CalcSource } from '@/drill/calc'
import { resolveCalc } from '@/drill/calc'
import { type DrillSource, resolveDrill } from '@/drill/types'

// The chart kit reads the theme's tokens from the page's styles; markup on the server has none.
vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: () => '', colorScheme: 'light' }))
vi.stubGlobal('document', { documentElement: {} })

/** What the tab hands its strip and its figures, captured in place of drawing them. */
const seen = vi.hoisted(() => ({
  ctx: null as unknown,
  strips: [] as { id?: string; kpis: readonly unknown[] }[],
  figures: [] as { id: string; deckSummary?: unknown; data: readonly unknown[] }[],
  /** The tiles' gate (the data standard): none by default; a test holds back the tiles it names. */
  holds: null as ((uses: readonly unknown[] | undefined) => boolean) | null,
}))
vi.mock('@/components/tier/useTierGate', async (orig) => {
  const real = await orig<typeof import('@/components/tier/useTierGate')>()
  return {
    ...real,
    useGateFn: () => (uses: readonly unknown[] | undefined) =>
      seen.holds?.(uses)
        ? {
            tier: 'bronze',
            shown: false,
            reason: 'Not shown under the Gold standard',
            explain: '',
            limiting: {},
          }
        : null,
  }
})
vi.mock('@/data/context', async (orig) => ({
  ...(await orig<typeof import('@/data/context')>()),
  useAnalytics: () => seen.ctx,
}))
vi.mock('@/charts', async (orig) => ({
  ...(await orig<typeof import('@/charts')>()),
  Figure: (p: { id: string; deckSummary?: unknown; data: readonly unknown[] }) => {
    seen.figures.push(p)
    return null
  },
}))
vi.mock('@/components', async (orig) => ({
  ...(await orig<typeof import('@/components')>()),
  KpiStrip: (p: { id?: string; kpis: readonly unknown[] }) => {
    seen.strips.push(p)
    return null
  },
}))

const { sample, sampleCtx } = await import('../engine/fixtures')
const { planRecruitingModel, FUTURE_STARTS_NOTE, PROJECTED_STARTS_NOTE } = await import(
  '../engine/recruitingTab'
)
const { RECRUITING_FIGURE_IDS } = await import('@/access/ids')
const { kpiValueText, SUPPRESSED_NOTE } = await import('@/components/kpiModel')
const { ARIA_LABEL, keyOf, niceTicks, RecruitingMonthsChart, recruitingKeyPoints } = await import(
  './RecruitingMonthsChart'
)
const { Recruiting, SUMMARY_REPLACES, summaryNumbersOf } = await import('./Recruiting')
const { cellOpens } = await import('./shared')

type Row = ReturnType<typeof planRecruitingModel>['months']['rows'][number]

beforeAll(() => {
  sample()
}, 120_000)

/** A plot whose x scale puts month i at 10 × i (band 8) and whose y scale is the negated identity. */
function fakePlot(months: readonly string[]): PlotElement {
  return {
    scale: (name: string) =>
      name === 'x'
        ? { apply: (v: unknown) => months.indexOf(String(v)) * 10, bandwidth: 8 }
        : { apply: (v: unknown) => -Number(v), bandwidth: 0 },
  } as unknown as PlotElement
}

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

describe('the right axis’s ticks (niceTicks)', () => {
  it('steps by 1, 2, 2.5 or 5 times a power of ten, from the first multiple at or above the low end', () => {
    expect(niceTicks(540, 620)).toEqual([540, 560, 580, 600, 620])
    expect(niceTicks(533.6, 610.4)).toEqual([540, 560, 580, 600])
    expect(niceTicks(0, 10)).toEqual([0, 2.5, 5, 7.5, 10])
    expect(niceTicks(0, 1.1)).toEqual([0, 0.5, 1])
    expect(niceTicks(0.3, 0.7)).toEqual([0.3, 0.4, 0.5, 0.6, 0.7])
  })

  it('gives whole heads only with `whole`: a label never rounds a tick it does not sit on', () => {
    expect(niceTicks(0, 10, 4, true)).toEqual([0, 5, 10])
    expect(niceTicks(6, 10, 4, true)).toEqual([6, 7, 8, 9, 10])
    expect(niceTicks(0, 1.1, 4, true)).toEqual([0, 1])
    expect(niceTicks(5.4, 9.9, 4, true)).toEqual([6, 8])
    expect(niceTicks(5.4, 9.9, 5, true)).toEqual([6, 7, 8, 9])
    for (const [lo, hi] of [
      [0, 3],
      [6.2, 14.9],
      [1400, 1700],
      [533.6, 610.4],
      [0.4, 2.6],
    ] as const) {
      const ticks = niceTicks(lo, hi, 4, true)
      expect(ticks.length, `${lo} to ${hi}`).toBeGreaterThan(0)
      for (const t of ticks) {
        expect(Number.isInteger(t), `${t}`).toBe(true)
        expect(t >= lo && t <= hi, `${t} in ${lo} to ${hi}`).toBe(true)
      }
    }
  })

  it('gives the one value for an empty range, and nothing for a range that is not a number', () => {
    expect(niceTicks(5, 5)).toEqual([5])
    expect(niceTicks(Number.NaN, 3)).toEqual([])
    expect(niceTicks(0, Number.POSITIVE_INFINITY)).toEqual([])
  })
})

describe('the cell a bar opens (keyOf)', () => {
  it('maps a closed month’s bars to hires and exits, and a month ahead’s to its own counts', () => {
    const closed = row({ kind: 'actual', kindText: 'Closed', hires: 3, exits: 1, heads: 50 })
    expect(keyOf(closed, 'hires')).toBe('hires')
    expect(keyOf(closed, 'exits')).toBe('exits')
    const ahead = row({ futureStarts: 2, projectedStarts: 1.5, projectedExits: 0.4 })
    expect(keyOf(ahead, 'future')).toBe('futureStarts')
    expect(keyOf(ahead, 'projected')).toBe('projectedStarts')
    expect(keyOf(ahead, 'attrition')).toBe('projectedExits')
    // A mid-month as-of date's month: its hires and exits to date (review RU-5).
    expect(keyOf(ahead, 'hires')).toBe('hires')
    expect(keyOf(ahead, 'exits')).toBe('exits')
    // A signed offer is never a projected start, nor a projected start a future start.
    expect(keyOf(ahead, 'future')).not.toBe(keyOf(ahead, 'projected'))
  })

  it('opens the moves in from their own segment, never from the future starts (review RS-2)', () => {
    expect(keyOf(row({ futureStarts: 0, movesIn: 2 }), 'moves')).toBe('movesIn')
    expect(keyOf(row({ futureStarts: 1, movesIn: 2 }), 'moves')).toBe('movesIn')
    expect(keyOf(row({ futureStarts: 0, movesIn: 2 }), 'future')).toBe('futureStarts')
    expect(keyOf(row({ futureStarts: 1, movesIn: 2 }), 'future')).toBe('futureStarts')
  })
})

describe('the chart from the keyboard (recruitingKeyPoints)', () => {
  const model = () => planRecruitingModel(sampleCtx('hrbp'))

  it('stops on every month’s starts, then every month’s exits, each naming its part', () => {
    const rows = model().months.rows
    const points = recruitingKeyPoints(rows, fakePlot(rows.map((r) => r.month)))
    const starts = points.filter((p) => p.group === 'starts')
    const exits = points.filter((p) => p.group === 'exits')
    const projected = rows.filter((r) => r.kind === 'ahead' && (r.projectedStarts ?? 0) > 0)
    expect(projected.length).toBeGreaterThan(0)
    // Every month has a stop in each row; a month ahead one per part it holds, bottom to top.
    for (const r of rows) {
      const own = starts.filter((p) => p.datum === r).map((p) => p.part)
      const want =
        r.kind === 'actual'
          ? ['hires']
          : [
              ...((r.futureStarts ?? 0) > 0 ? ['future'] : []),
              ...((r.movesIn ?? 0) > 0 ? ['moves'] : []),
              ...((r.projectedStarts ?? 0) > 0 ? ['projected'] : []),
            ]
      expect(own, r.month).toEqual(want.length ? want : ['future'])
      expect(exits.filter((p) => p.datum === r).length, r.month).toBeGreaterThan(0)
    }
    // The starts row first (the figure's subject), then the exits row; each row contiguous.
    expect(points.slice(0, starts.length).every((p) => p.group === 'starts')).toBe(true)
    expect(starts.filter((p) => p.part === 'projected').map((p) => p.datum.month)).toEqual(
      projected.map((r) => r.month),
    )
    // Months in order along the starts row, and every stop carries its bar's box.
    const order = [...new Set(starts.map((p) => p.datum.month))]
    expect(order).toEqual(rows.map((r) => r.month))
    for (const p of points) expect(p.w ?? 0).toBeGreaterThan(0)
    // An exits bar sits below the zero line (the fake y scale negates: below is a larger y).
    const busy = exits.find((p) => (p.datum.exits ?? p.datum.projectedExits ?? 0) > 0)
    expect(busy && busy.y > 0).toBe(true)
  })

  it('steps from the last closed month into the months ahead, and down to the same month’s exits', () => {
    const rows = model().months.rows
    const points = recruitingKeyPoints(rows, fakePlot(rows.map((r) => r.month)))
    const lastClosed = points.findLastIndex((p) => p.group === 'starts' && p.datum.kind === 'actual')
    expect(lastClosed).toBeGreaterThanOrEqual(0)
    const next = stepKey(points, lastClosed, 'ArrowRight') as number
    expect(points[next].datum.kind).toBe('ahead')
    expect(['future', 'projected']).toContain(points[next].part)
    const down = stepKey(points, next, 'ArrowDown') as number
    expect(points[down].group).toBe('exits')
    expect(points[down].datum.month).toBe(points[next].datum.month)
    const up = stepKey(points, down, 'ArrowUp') as number
    expect(points[up].group).toBe('starts')
    expect(points[up].datum.month).toBe(points[next].datum.month)
  })

  it('opens each stop’s own records or card, never another bar’s', () => {
    const m = model()
    const rows = m.months.rows
    const cols = m.months.columns
    const titles: Record<string, RegExp> = {
      hires: /^(Hires|Seats filled by hires),/,
      exits: /^(Exits|Seats left by exits),/,
      futureStarts: /^Future starts,/,
      projectedStarts: /^Projected starts,/,
      projectedExits: /^Projected attrition,/,
      movesIn: /^Moves in,/,
    }
    let opened = 0
    for (const p of recruitingKeyPoints(rows, fakePlot(rows.map((r) => r.month)))) {
      const key = keyOf(p.datum, p.part ?? '')
      const value = p.datum[key] as number | null
      if (!value) continue
      expect(cellOpens(cols, key, p.datum), `${p.datum.month} ${key}`).toBe(true)
      const col = cols.find((c) => c.key === key)
      const records = resolveDrill(col?.drill?.(p.datum) as DrillSource)
      const card = records ? null : resolveCalc(col?.calc?.(p.datum) as CalcSource)
      const title = records?.title ?? card?.title ?? ''
      expect(title, `${p.datum.month} ${key}`).toMatch(titles[key])
      opened++
    }
    expect(opened).toBeGreaterThan(rows.length)
  })

  it('makes no projected stop where the months carry no projection (no forecast)', () => {
    const rows = [
      row({ month: '2026-10', futureStarts: 2, projectedStarts: null }),
      row({ month: '2026-11', futureStarts: 0, projectedStarts: null }),
    ]
    const points = recruitingKeyPoints(rows, fakePlot(rows.map((r) => r.month)))
    expect(points.map((p) => p.part)).toEqual(['future', 'future', 'attrition', 'attrition'])
  })
})

describe('the chart’s legend and name', () => {
  /** The legend's keys as the chart draws them, in order. */
  const keysOf = (rows: readonly Row[], columns: readonly Column<Row>[] = []) => {
    const html = renderToStaticMarkup(createElement(RecruitingMonthsChart, { rows, columns }))
    return { html, keys: [...html.matchAll(/<\/span>([^<]+)<\/li>/g)].map((m) => m[1]) }
  }
  const closed = (month: Row['month']) =>
    row({
      month,
      kind: 'actual',
      kindText: 'Closed',
      hires: 2,
      exits: 1,
      heads: 50,
      futureStarts: null,
      movesIn: null,
      projectedStarts: null,
      projectedExits: null,
      projectedHeads: null,
    })

  it('keys every mark: the closed months’, the months ahead’s, and approved heads', () => {
    const months = planRecruitingModel(sampleCtx('hrbp')).months
    const { html, keys } = keysOf(months.rows, months.columns)
    expect(keys).toEqual([
      'Hires',
      'Exits',
      'Heads',
      'Future starts (signed offers)',
      'Projected starts (model)',
      'Projected attrition',
      'Projected heads',
      // Dated: the line is the year end's approved heads on every month (review RU-3).
      'Approved heads by 31 Mar 2027',
    ])
    // The projection is a dashed line and the reference level a dotted one, the actual heads solid.
    const lines = html.match(/repeating-linear-gradient\([^)]*\)/g) ?? []
    expect(lines).toHaveLength(2)
    expect(lines[0]).not.toBe(lines[1])
    expect(html).toContain(`aria-label="${ARIA_LABEL}. Arrow keys move through the data."`)
  })

  it('keys no projected start and no projected heads where there is no forecast, and still the future starts (RU-6)', () => {
    const rows = [
      closed('2026-09'),
      row({ month: '2026-10', futureStarts: 2, projectedStarts: null, projectedHeads: null }),
    ]
    expect(keysOf(rows).keys).toEqual([
      'Hires',
      'Exits',
      'Heads',
      'Future starts (signed offers)',
      'Projected attrition',
      'Approved heads',
    ])
  })

  it('keys only the closed months in a year that is over, and only the months ahead when none is closed', () => {
    // A year that is over: no month ahead, and no approved heads (the model gives none).
    const over = [closed('2026-08'), closed('2026-09')].map((r) => ({ ...r, approved: null }))
    expect(keysOf(over).keys).toEqual(['Hires', 'Exits', 'Heads'])
    // One month ahead and no actual heads: no dashed line to key (it needs two points).
    expect(keysOf([row({ month: '2026-10', futureStarts: 1, projectedStarts: 0.5 })]).keys).toEqual([
      'Future starts (signed offers)',
      'Projected starts (model)',
      'Projected attrition',
      'Approved heads',
    ])
  })
})

describe('the one slide’s numbers (summaryNumbersOf)', () => {
  const kpi = (over: Partial<Kpi>): Kpi =>
    ({
      id: 'recruiting-future',
      label: 'Future starts',
      value: 9,
      format: 'int',
      note: 'Signed',
      ...over,
    }) as Kpi
  const gate = (shown: boolean) =>
    ({ tier: 'bronze', shown, reason: shown ? null : 'Not shown under the Gold standard' }) as never

  it('prints each tile’s value and note as the tile shows them', () => {
    expect(
      summaryNumbersOf(
        [kpi({}), kpi({ label: 'Projected starts', value: 38.76, format: 'num1' })],
        [null, gate(true)],
      ),
    ).toEqual([
      { label: 'Future starts', value: '9', note: 'Signed' },
      { label: 'Projected starts', value: '38.8', note: 'Signed' },
    ])
    expect(summaryNumbersOf([kpi({ value: null, note: undefined })], [null])).toEqual([
      { label: 'Future starts', value: '—' },
    ])
  })

  it('prints "—" and why for a tile the data standard holds back or hides for anonymity, never its value', () => {
    const held = summaryNumbersOf([kpi({ value: 604 })], [gate(false)])
    expect(held).toEqual([{ label: 'Future starts', value: '—', note: 'Not shown under the Gold standard' }])
    const hidden = summaryNumbersOf([kpi({ value: 3, suppressed: true })], [null])
    expect(hidden).toEqual([{ label: 'Future starts', value: '—', note: SUPPRESSED_NOTE }])
    expect(JSON.stringify([held, hidden])).not.toMatch(/604|"3"/)
  })
})

describe('the tab’s one slide (deckSummary)', () => {
  it.each([['manager'], ['hrbp'], ['leader'], ['finance'], ['hr-admin']] as const)(
    'hands the chart figure the seven numbers, standing in for the other three figures (%s)',
    (mode) => {
      const ctx: AnalyticsContext = sampleCtx(mode)
      const m = planRecruitingModel(ctx)
      seen.ctx = ctx
      seen.strips.length = 0
      seen.figures.length = 0
      renderToStaticMarkup(createElement(Recruiting))
      // The strip and the three figures, by the tab's figure ids, in page order.
      expect(seen.strips.map((s) => s.id)).toEqual([RECRUITING_FIGURE_IDS[0]])
      expect(seen.figures.map((f) => f.id)).toEqual(RECRUITING_FIGURE_IDS.slice(1))
      // Only the chart's figure carries the summary; it stands in for the strip, the table and the lists.
      const withSummary = seen.figures.filter((f) => f.deckSummary)
      expect(withSummary.map((f) => f.id)).toEqual(['plan-recruiting-months'])
      const sum = withSummary[0].deckSummary as DeckSummary
      expect([...sum.replaces].sort()).toEqual(
        RECRUITING_FIGURE_IDS.filter((id) => id !== 'plan-recruiting-months').sort(),
      )
      expect(sum.replaces).toEqual(SUMMARY_REPLACES)
      expect(sum.title).toBe('Recruiting summary')
      expect(sum.subtitle).toContain('As of 30 Sep 2026')
      expect(sum.subtitle).toContain(ctx.scopeLabel)
      expect(sum.subtitle).toContain('FY27')
      // The seven numbers are the tiles as the strip shows them, "Future starts" and "Projected starts" apart.
      expect(sum.numbers.map((n) => n.label)).toEqual(m.kpis.map((k) => k.label))
      expect(sum.numbers.map((n) => n.value)).toEqual(m.kpis.map((k) => kpiValueText(k)))
      expect(sum.numbers).toHaveLength(7)
      const future = sum.numbers.find((n) => n.label === 'Future starts')
      const projected = sum.numbers.find((n) => n.label === 'Projected starts')
      expect(future?.note).toBe(FUTURE_STARTS_NOTE)
      expect(projected?.note).toBe(PROJECTED_STARTS_NOTE)
      // Heads only: no amount on the slide.
      expect(JSON.stringify(sum)).not.toMatch(/[$€£¥₹₪]\s?\d|USD|salary|sign-on|agency fee|band estimate/i)
    },
  )

  it('prints "—" and why for the tiles the data standard holds back, as the strip shows them', () => {
    const ctx = sampleCtx('hrbp')
    const m = planRecruitingModel(ctx)
    const held = m.kpis.find((k) => k.id === 'recruiting-projected')
    expect(held?.uses?.length).toBeGreaterThan(0)
    seen.ctx = ctx
    seen.figures.length = 0
    seen.holds = (uses) => uses === held?.uses
    try {
      renderToStaticMarkup(createElement(Recruiting))
    } finally {
      seen.holds = null
    }
    const sum = seen.figures.find((f) => f.deckSummary)?.deckSummary as DeckSummary
    const numbers = new Map(sum.numbers.map((n) => [n.label, n]))
    expect(numbers.get('Projected starts')).toEqual({
      label: 'Projected starts',
      value: '—',
      note: 'Not shown under the Gold standard',
    })
    // The held-back value is nowhere on the slide; the other six print as the strip shows them.
    expect(JSON.stringify(sum.numbers)).not.toContain(kpiValueText(held as Kpi))
    expect(numbers.get('Future starts')?.value).toBe(
      kpiValueText(m.kpis.find((k) => k.id === 'recruiting-future') as Kpi),
    )
  })
})
