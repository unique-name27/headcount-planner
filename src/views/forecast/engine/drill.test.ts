/**
 * The Forecast view's drills and cards hold their numbers (docs/PLAN.md 9.5): weighted tiles and
 * cells open positions whose "Counts as" adds up to them (expected starts, modeled exits, forecast
 * heads, unfilled openings), counted cells open exactly their rows, every card's last step is its
 * value (the year-end heads card's rows add up to it), and the bridge's steps each open a card.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { resolveDrill } from '@/drill/types'
import {
  expectCardHolds,
  expectCellsHold,
  expectDrillHolds,
  expectNoMoneyText,
} from '@/views/plan/engine/testing'
import { type ForecastModel, forecastModel } from '.'
import { everyMode, sample, sampleCtx } from './fixtures'

beforeAll(() => {
  sample()
}, 60_000)

const allKpis = (m: ForecastModel) => [
  ...m.overview.kpis,
  ...m.variance.kpis,
  ...m.bridge.kpis,
  ...(m.overview.costVsTarget ? [m.overview.costVsTarget] : []),
  ...(m.bridge.fxEffectYtd ? [m.bridge.fxEffectYtd] : []),
]

describe('forecast drills and cards', () => {
  it('hold their numbers in every mode', () => {
    for (const { mode, ctx } of everyMode()) {
      const m = forecastModel(ctx)
      for (const k of allKpis(m)) {
        expectDrillHolds(k, mode)
        expectCardHolds(k.calc, mode)
        expectCardHolds(k.deltaCalc, mode)
      }
      const cells =
        expectCellsHold(m.overview.headsByMonth, mode) + expectCellsHold(m.overview.startsExits, mode)
      expect(cells, mode).toBeGreaterThan(10)
      for (const s of m.bridge.steps.rows) {
        if (!s.calc) continue
        const card = expectCardHolds(s.calc, `${mode} ${s.key}`)
        expect(card?.value ?? null, `${mode} ${s.key}`).toBe(s.value)
      }
      for (const f of m.overview.findings)
        expect(resolveDrill(f.drill)?.rows.length, `${mode} ${f.id}`).toBeGreaterThan(0)
      expectNoMoneyText([...allKpis(m), ...m.overview.findings], mode)
    }
  })

  it('open a card from every variance cell, its value the cell’s', () => {
    for (const mode of ['hrbp', 'finance', 'hr-admin'] as const) {
      const v = forecastModel(sampleCtx(mode)).variance.rows
      const col = v.columns.find((c) => c.key === 'variance')
      let cards = 0
      for (const r of v.rows) {
        const card = expectCardHolds(col?.calc?.(r) as never, `${mode} ${r.orgKey} ${r.measure} ${r.window}`)
        if (!card) continue
        cards++
        expect(card.value, `${mode} ${r.orgKey} ${r.measure}`).toBe(r.variance)
        // A hidden difference never says how many positions moved (1 to 4 would).
        if (r.variance == null)
          for (const i of card.inputs) if (/positions/i.test(i.label)) expect(i.value, mode).toBeNull()
      }
      expect(cards, mode).toBe(v.rows.length)
    }
  })

  it('open the year-end heads card down to the figure, its seats adding up to it', () => {
    const m = forecastModel(sampleCtx('finance'))
    const k = m.overview.kpis.find((x) => x.id === 'year-end-heads')
    const card = expectCardHolds(k?.calc)
    expect(card?.value).toBe(k?.value)
    const rows = resolveDrill(card?.rows)
    expect(rows?.weight).toBeDefined()
  })

  it('hold under filters', () => {
    for (const filters of [{ businessUnit: ['Go-to-Market'] }, { location: ['Haifa'] }, { level: ['P3'] }]) {
      const m = forecastModel(sampleCtx('hr-admin', { filters }))
      for (const k of allKpis(m)) expectDrillHolds(k, JSON.stringify(filters))
      expectCellsHold(m.overview.headsByMonth, JSON.stringify(filters))
      expectCellsHold(m.overview.startsExits, JSON.stringify(filters))
    }
  })
})
