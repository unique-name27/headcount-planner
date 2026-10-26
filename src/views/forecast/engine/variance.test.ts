/**
 * Forecast > Variance (docs/PLAN.md 6.8, 9.4, 7.3): stories 1, 2 and 5's full-year cost variances
 * against the Budget to the cent; heads at the year end; months, QTD, YTD and FY for the scope and
 * its units, QTD to FY for departments; rounded modes leave monthly cost out; a department's cost
 * keeps to its unit's shown cost centers in Finance; a target comparison is an empty state.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { FINANCE_FILTER_NOTE } from '@/cost/fit'
import { prepare } from './base'
import { sample, sampleCtx } from './fixtures'
import { varianceTable, windowsOf } from './variance'

beforeAll(() => {
  sample()
}, 60_000)

const fyCost = (orgKey: string, mode: 'finance' | 'hr-admin', filters = {}, showPay = false) =>
  varianceTable(prepare(sampleCtx(mode, { filters, compare: 'fy27-budget', showPay }))).rows.find(
    (r) => r.orgKey === orgKey && r.measure === 'cost' && r.window === 'fy',
  )

describe('the stories’ variances', () => {
  it('story 1: Go-to-Market is over the Budget by $1,936,119.22', () => {
    const r = fyCost('unit:Go-to-Market', 'finance')
    expect(r?.actual).toBeCloseTo(34_252_218.32, 2)
    expect(r?.comparison).toBeCloseTo(32_316_099.11, 2)
    expect(r?.variance).toBeCloseTo(1_936_119.22, 2)
  })

  it('story 2: Silicon Engineering is over by $4,118,331.83', () => {
    expect(fyCost('unit:Silicon Engineering', 'finance')?.variance).toBeCloseTo(4_118_331.83, 2)
  })

  it('story 5: Munich and Haifa are over with heads flat', () => {
    // A location is no cost dimension of Finance's or of HR admin's with the switch off: the switch reads it.
    expect(fyCost('scope', 'hr-admin', { location: ['Munich'] })?.variance).toBeNull()
    const munich = fyCost('scope', 'hr-admin', { location: ['Munich'] }, true)
    expect(munich?.variance).toBeCloseTo(674_960.5, 2)
    const haifa = fyCost('scope', 'hr-admin', { location: ['Haifa'] }, true)
    expect(haifa?.variance).toBeCloseTo(675_470.23, 2)
    // C33: a country is a row of a unit's breakdown, never a cost filter of Finance's, so the variance
    // under a country filter reads "—" (heads still show); before C33 Finance read them as countries.
    for (const country of ['Germany', 'Israel']) {
      const r = fyCost('scope', 'finance', { country: [country] })
      expect(r?.variance, country).toBeNull()
      expect(r?.reason, country).toBe(FINANCE_FILTER_NOTE)
    }
  })
})

describe('the table', () => {
  it('lists every window for the scope and its units, QTD to FY for departments', () => {
    const p = prepare(sampleCtx('finance'))
    const t = varianceTable(p)
    const w = windowsOf(p)
    expect(w.map((x) => x.window).filter((x) => x === 'month').length).toBe(12)
    const scopeRows = t.rows.filter((r) => r.orgKey === 'scope')
    expect(scopeRows.length).toBe(w.length * 3)
    const dept = t.rows.filter((r) => r.level === 'department')
    expect(new Set(dept.map((r) => r.window))).toEqual(new Set(['qtd', 'ytd', 'fy']))
  })

  it('keeps a department’s cost to its unit’s shown cost centers in Finance', () => {
    const t = varianceTable(prepare(sampleCtx('finance')))
    const facilities = t.rows.find(
      (r) => r.orgKey === 'department:Facilities' && r.measure === 'cost' && r.window === 'fy',
    )
    // 1550-HSZ's 3 people sit in Corporate's Other (story 8): the row notes who is left out.
    expect(facilities?.reason).toMatch(/cost centers under 5 are left out/)
  })

  it('leaves monthly cost out in rounded modes', () => {
    for (const mode of ['hrbp', 'leader'] as const) {
      const t = varianceTable(prepare(sampleCtx(mode)))
      for (const r of t.rows.filter((x) => x.measure === 'cost' && x.window === 'month')) {
        expect(r.actual, mode).toBeNull()
        expect(r.reason, mode).toBeTruthy()
      }
      expect(
        t.rows.some((x) => x.measure === 'cost' && x.window === 'fy' && x.variance != null),
        mode,
      ).toBe(true)
    }
  })

  it('is an empty state against a target', () => {
    const t = varianceTable(prepare(sampleCtx('finance', { compare: 'target' })))
    expect(t.rows).toEqual([])
    expect(t.empty).toBe('A target has no monthly plan. Pick a version to compare.')
  })
})
