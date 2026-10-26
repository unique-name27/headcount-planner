/**
 * The Plan view on the sample (docs/PLAN.md 13): the company's shape and the stories' exact numbers
 * as the view's own model shows them, mode by mode, so the screen and src/data/sample/stories.ts
 * agree. Story 1: Go-to-Market 8 heads over the Budget at 30 Sep, its year to date over the Budget's,
 * 18 hires against 4 planned. Story 2: Silicon Engineering 10 heads under. Story 4: 3 openings under
 * Corporate's freeze, its 4 Open and Planned seats. Story 8: 1550-HSZ's cost never shows outside HR
 * admin with the switch.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { FINANCE_FILTER_NOTE } from '@/cost/fit'
import { forecastModel } from '@/views/forecast/engine'
import { ID as FORECAST } from '@/views/forecast/metrics'
import { ID } from '../metrics'
import { type PlanModel, planModel } from '.'
import { sample, sampleCtx } from './fixtures'

beforeAll(() => {
  sample()
}, 60_000)

const tile = (m: PlanModel, metricId: string) =>
  [...m.overview.kpis, ...m.openings.kpis, ...m.positions.kpis].find((k) => k.metricId === metricId)

describe('the company', () => {
  it('has the shape of 13.1 on 30 Sep 2026', () => {
    const m = planModel(sampleCtx('hr-admin'))
    expect(tile(m, ID.headsApproved)?.value).toBe(1_610)
    expect(tile(m, ID.headsActual)?.value).toBe(1_456)
    const status = Object.fromEntries(m.overview.positionsByStatus.rows.map((r) => [r.status, r.count]))
    expect(status).toEqual({ Filled: 1_450, Open: 100, Planned: 60, 'On hold': 15, Eliminated: 25 })
    expect(tile(m, ID.openingsCount)?.value).toBe(160)
  })
})

describe('story 1: Go-to-Market hired ahead of plan', () => {
  const gtm = () => planModel(sampleCtx('finance', { filters: { businessUnit: ['Go-to-Market'] } }))
  it('is 8 heads over the FY27 Budget at 30 Sep', () => {
    const m = gtm()
    expect(tile(m, ID.headsActual)?.value).toBe(184)
    expect(tile(m, ID.headsActual)?.delta).toBe(8)
    expect(tile(m, ID.headsActual)?.deltaLabel).toBe('vs FY27 Budget')
    // The company's readout names it (inside one unit the readout reads by department).
    const company = planModel(sampleCtx('finance')).overview.findings
    expect(
      company.some((f) => f.title === 'Go-to-Market is 8 heads over the FY27 Budget at 30 Sep 2026.'),
    ).toBe(true)
  })

  it('spent more year to date than the Budget, exactly as the closes and the lock say', () => {
    const k = tile(gtm(), ID.costLoaded)
    expect(k?.value).toBeCloseTo(16_426_043.48, 2)
    expect(k?.delta).toBeCloseTo(16_426_043.48 - 15_236_845.85, 1)
  })

  it('hired 18 against 4 planned hires year to date', () => {
    const k = tile(gtm(), ID.hiresYtd)
    expect(k?.value).toBe(18)
    expect(k?.delta).toBe(14)
  })
})

describe('story 2: Silicon Engineering is late in Bengaluru', () => {
  it('is 10 heads under the Budget, its year to date over it', () => {
    const m = planModel(sampleCtx('finance', { filters: { businessUnit: ['Silicon Engineering'] } }))
    expect(tile(m, ID.headsActual)?.value).toBe(556)
    expect(tile(m, ID.headsActual)?.delta).toBe(-10)
    expect(tile(m, ID.costLoaded)?.value).toBeCloseTo(46_094_524.01, 2)
    expect(tile(m, ID.costLoaded)?.delta).toBeCloseTo(46_094_524.01 - 43_801_597.71, 1)
  })

  it('shows its Bengaluru openings past their target start', () => {
    const m = planModel(
      sampleCtx('hr-admin', { filters: { businessUnit: ['Silicon Engineering'], location: ['Bengaluru'] } }),
    )
    expect(tile(m, ID.openingsPastStart)?.value).toBe(10)
  })
})

describe('story 4: the Corporate freeze', () => {
  it('holds 3 openings; Corporate has 4 Open and Planned seats, the accepted offer among them', () => {
    const m = planModel(sampleCtx('hr-admin', { filters: { businessUnit: ['Corporate'] } }))
    expect(tile(m, ID.openingsFrozen)?.value).toBe(3)
    expect(tile(m, ID.openingsCount)?.value).toBe(4)
    expect(tile(m, ID.offersAccepted)?.value).toBe(1)
    expect(
      planModel(sampleCtx('finance')).openings.kpis.find((k) => k.metricId === ID.openingsFrozen)?.value,
    ).toBe(3)
  })
})

describe('story 8: 1550-HSZ has 3 costed people', () => {
  it('shows no cost of its own outside HR admin with the switch', () => {
    const fin = planModel(sampleCtx('finance', { filters: { costCenter: ['1550-HSZ'] } }))
    expect(tile(fin, ID.costLoaded)?.value).toBeNull()
    const admin = planModel(sampleCtx('hr-admin', { filters: { costCenter: ['1550-HSZ'] } }))
    expect(tile(admin, ID.costLoaded)?.value).toBeNull()
    const open = planModel(sampleCtx('hr-admin', { filters: { costCenter: ['1550-HSZ'] }, showPay: true }))
    expect(tile(open, ID.costLoaded)?.value).toBeGreaterThan(0)
  })

  it('gives the C33 filter note for a folded cost center, as for a shown one and on the forecast', () => {
    // Since C33 cost shows for whole business units only, so a cost-center pick hides cost whether the
    // unit's fold shows the center or keeps it in Other; one reason on every view (review RC-5).
    for (const mode of ['finance', 'hr-admin'] as const)
      for (const cc of ['1550-HSZ', '1110-SJC']) {
        const ctx = sampleCtx(mode, { filters: { costCenter: [cc] } })
        const m = planModel(ctx)
        expect(tile(m, ID.costLoaded)?.suppressedNote, `${mode} ${cc}`).toBe(FINANCE_FILTER_NOTE)
        expect(m.overview.costByUnit.note, `${mode} ${cc}`).toBe(FINANCE_FILTER_NOTE)
        expect(tile(m, ID.costOpenBand)?.suppressedNote, `${mode} ${cc}`).toBe(FINANCE_FILTER_NOTE)
        const full = forecastModel(ctx).overview.kpis.find((k) => k.metricId === FORECAST.costFullYear)
        expect(full?.suppressedNote, `${mode} ${cc}`).toBe(FINANCE_FILTER_NOTE)
      }
    const unknown = planModel(sampleCtx('finance', { filters: { costCenter: ['9999-XXX'] } }))
    expect(tile(unknown, ID.costLoaded)?.suppressedNote).toBe(FINANCE_FILTER_NOTE)
  })
})

describe('the planted Munich P4', () => {
  it('is a Planned seat in Manager A’s team, past its planned start with no req', () => {
    const m = planModel(sampleCtx('manager'))
    const row = m.openings.table.rows.find(
      (r) => r.location === 'Munich' && r.level === 'P4' && r.status === 'Planned',
    )
    expect(row?.targetStart).toBe('2026-09-16')
    expect(row?.pastStart).toBe(true)
    expect(row?.noReq).toBe(true)
  })
})
