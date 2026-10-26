/**
 * Plan > Hiring's keyboard and screen reader paths (review HU-4 and HU-5): the velocity chart's
 * keyboard stops reach the exits bars as well as the hires bars, each opening that bar's own records
 * or card; and every button of the quarter grid names its measure, quarter and value, once.
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { PlotElement } from '@/charts'
import type { CalcSource } from '@/drill/calc'
import { resolveCalc } from '@/drill/calc'
import { type DrillSource, resolveDrill } from '@/drill/types'

// The chart kit reads the theme's tokens from the page's styles; markup on the server has none.
vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: () => '', colorScheme: 'light' }))
vi.stubGlobal('document', { documentElement: {} })

const { sample, sampleCtx } = await import('../engine/fixtures')
const { planHiringModel, QUARTER_KEYS } = await import('../engine/hiringTab')
const { HiringQuarterGrid, quarterCellName } = await import('./HiringQuarterGrid')
const { velocityKeyPoints } = await import('./HiringVelocityChart')
const { cellOpens } = await import('./shared')

beforeAll(() => {
  sample()
}, 120_000)

/** A plot whose x scale puts month i at 10 × i (band 8) and whose y scale is the identity. */
function fakePlot(months: readonly string[]): PlotElement {
  return {
    scale: (name: string) =>
      name === 'x'
        ? { apply: (v: unknown) => months.indexOf(String(v)) * 10, bandwidth: 8 }
        : { apply: (v: unknown) => -Number(v), bandwidth: 0 },
  } as unknown as PlotElement
}

describe('the velocity chart from the keyboard (HU-4)', () => {
  it('stops on every month’s hires bar, then every month’s exits bar, each naming its part', () => {
    const m = planHiringModel(sampleCtx('hrbp'))
    const rows = m.velocity.rows
    const points = velocityKeyPoints(rows, fakePlot(rows.map((r) => r.month)))
    expect(points).toHaveLength(rows.length * 2)
    expect(points.slice(0, rows.length).every((p) => p.part === 'hires' && p.group === 'hires')).toBe(true)
    expect(points.slice(rows.length).every((p) => p.part === 'exits' && p.group === 'exits')).toBe(true)
    // Each stop carries its bar's box; an exits bar sits below the zero line.
    for (const p of points) expect(p.w ?? 0).toBeGreaterThan(0)
    const busy = points.find((p) => p.part === 'exits' && p.datum.exits > 0)
    expect(busy && busy.y > 0).toBe(true)
  })

  it('opens an exits bar’s own records or card from its stop, not the hires bar’s', () => {
    const m = planHiringModel(sampleCtx('hrbp'))
    const rows = m.velocity.rows
    const cols = m.velocity.columns
    const exitsCol = cols.find((c) => c.key === 'exits')
    for (const p of velocityKeyPoints(rows, fakePlot(rows.map((r) => r.month))).filter(
      (x) => x.part === 'exits',
    )) {
      expect(cellOpens(cols, 'exits', p.datum), p.datum.month).toBe(true)
      const records = resolveDrill(exitsCol?.drill?.(p.datum) as DrillSource)
      const card = records ? null : resolveCalc(exitsCol?.calc?.(p.datum) as CalcSource)
      const title = records?.title ?? card?.title ?? ''
      expect(title, p.datum.month).toMatch(/^(Exits|Seats left by exits|Expected exits),/)
    }
  })
})

const buttonsOf = (html: string) =>
  [...html.matchAll(/<button[^>]*aria-label="([^"]*)"[^>]*>([^<]*)</g)].map((m) => ({
    label: m[1].replace(/&#x27;/g, "'").replace(/&amp;/g, '&'),
    text: m[2],
  }))

describe('the quarter grid’s button names (HU-5)', () => {
  it.each([['hrbp'], ['manager']] as const)(
    'name the measure, the quarter and the value, once each (%s)',
    (mode) => {
      const m = planHiringModel(sampleCtx(mode))
      const q = m.quarters
      const kinds = Object.fromEntries(
        QUARTER_KEYS.map((k, i) => [k, m.openByQuarter.rows[i]?.kind ?? 'ahead']),
      )
      const html = renderToStaticMarkup(
        createElement(HiringQuarterGrid, { rows: q.rows, columns: q.columns, kinds: kinds as never }),
      )
      const buttons = buttonsOf(html)
      expect(buttons.length).toBeGreaterThan(10)
      for (const b of buttons) {
        expect(b.label, b.label).toContain(`: ${b.text}.`)
        expect(b.label, b.label).toMatch(/Q[1-4], [A-Z][a-z]{2} to [A-Z][a-z]{2}/)
      }
      const names = buttons.map((b) => b.label)
      expect(names.filter((n, i) => names.indexOf(n) !== i)).toEqual([])
      // A closed quarter's Current heads cell holds the heads at that quarter's end.
      expect(names.some((n) => n.startsWith('Heads at the quarter end, Q1, Apr to Jun (closed): '))).toBe(
        true,
      )
      expect(names.some((n) => n.startsWith('Current heads, Q1'))).toBe(false)
    },
  )

  it('reads as DataTable names a cell: "<measure>, <quarter>: <value>. Show …"', () => {
    expect(
      quarterCellName({ key: 'open', label: 'Open to hire' }, 'Q3, Oct to Dec', false, '25', 'card'),
    ).toBe('Open to hire, Q3, Oct to Dec: 25. Show how it is worked out')
    expect(
      quarterCellName(
        { key: 'current', label: 'Current heads' },
        'Q1, Apr to Jun (closed)',
        true,
        '551',
        'records',
      ),
    ).toBe('Heads at the quarter end, Q1, Apr to Jun (closed): 551. Show the records')
  })
})
