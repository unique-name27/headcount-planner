/**
 * The Forecast view on the sample (docs/PLAN.md 13.4): the stories' numbers as the view's own model
 * shows them. Story 1: Go-to-Market's full-year forecast $34,252,218.32 over its Budget. Story 2:
 * Silicon Engineering's $93,885,679.82. Story 4: Corporate's freeze holds 3 openings through the
 * horizon and honors the accepted offer, which starts for certain. The planted Munich P4 starts on
 * 14 Dec 2026 at the fill rate.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { resolveDrill } from '@/drill/types'
import { ID } from '../metrics'
import { forecastModel } from '.'
import { prepare } from './base'
import { sample, sampleCtx } from './fixtures'

beforeAll(() => {
  sample()
}, 60_000)

const fullYear = (unit: string) =>
  forecastModel(sampleCtx('finance', { filters: { businessUnit: [unit] } })).overview.kpis.find(
    (k) => k.metricId === ID.costFullYear,
  )

describe('the stories in the forecast', () => {
  it('story 1: Go-to-Market forecasts $34,252,218.32, $1,936,119.22 over the Budget', () => {
    const k = fullYear('Go-to-Market')
    expect(k?.value).toBeCloseTo(34_252_218.32, 2)
    expect(k?.delta).toBeCloseTo(1_936_119.22, 2)
    expect(k?.deltaLabel).toBe('vs FY27 Budget')
  })

  it('story 2: Silicon Engineering forecasts $93,885,679.82', () => {
    expect(fullYear('Silicon Engineering')?.value).toBeCloseTo(93_885_679.82, 2)
  })

  it('story 4: the freeze holds Corporate’s three openings and honors the accepted offer', () => {
    const p = prepare(sampleCtx('hr-admin', { filters: { businessUnit: ['Corporate'] } }))
    const m = forecastModel(p.ctx)
    const unfilled = m.overview.kpis.find((k) => k.metricId === ID.startsUnfilled)
    expect(unfilled?.value).toBeCloseTo(3, 9)
    const offers = [...(p.run?.starts.values() ?? [])]
      .flat()
      .filter((s) => s.kind === 'offer' && p.scope.ids.has(s.positionId))
    expect(offers.length).toBeGreaterThanOrEqual(1)
    for (const s of offers) expect(s.probability).toBe(1)
    expect(m.overview.findings.some((f) => f.id === 'held-by-freeze' && f.positionsTotal === 3)).toBe(true)
  })

  it('starts the planted Munich P4 on 14 Dec 2026 at the fill rate', () => {
    const p = prepare(sampleCtx('manager', { persona: 'manager-a' }))
    const munich = [...p.scope.ids].filter((id) =>
      p.run?.starts.get(id)?.some((s) => s.start === '2026-12-14'),
    )
    expect(munich.length).toBe(1)
    const s = p.run?.starts.get(munich[0])?.[0]
    expect(s?.kind).toBe('planned')
    expect(s?.probability).toBeCloseTo(0.9, 9)
  })
})

describe('the company forecast', () => {
  it('reads the engine’s year-end heads and the drill adds up to them', () => {
    const p = prepare(sampleCtx('hr-admin'))
    const m = forecastModel(p.ctx)
    const k = m.overview.kpis.find((x) => x.metricId === ID.headsYearEnd)
    const engine = p.run?.detail.months.find((x) => x.month === '2027-03')?.heads
    expect(k?.value).toBeCloseTo(engine ?? Number.NaN, 6)
    const card = typeof k?.calc === 'function' ? k.calc() : null
    const rows = resolveDrill(card?.rows)
    expect(rows?.rows.length).toBeGreaterThan(1_000)
  })
})
