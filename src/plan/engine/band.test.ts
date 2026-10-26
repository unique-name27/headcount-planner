/**
 * Band estimates, weights and the standard head (docs/PLAN.md 11.2, 11.3 and 11.7): the 11.7 seat
 * table, F-S and F-S2, BL1 (loads read from assumption rows) and the 11.7 rates through `tradeRatesOf`.
 */
import { describe, expect, it } from 'vitest'
import { assumptionLookup } from './assumptions'
import { bandEstimate, loadsOf, standardHeadOf, standardHeadRaw, tradeRatesOf, weightBp } from './band'
import {
  BAND_CASES,
  F_S,
  F_S2,
  LOADS_11_7,
  PLAN_RATE,
  STANDARD_HEAD_USD,
  TRADE_RATES_11_7,
} from './fixtures/band'
import { assumption } from './fixtures/common'
import { MUNICH_ROWS } from './fixtures/cost'

describe('the 11.7 seat table', () => {
  for (const c of BAND_CASES) {
    const name = `${c.seat.level} ${c.seat.location} at ${c.seat.fte} FTE`
    it(`${name}: $${c.usd.toLocaleString('en-US')}, ${c.weightBp} bp`, () => {
      const loads = LOADS_11_7[`${c.seat.level}|${c.seat.location}`]
      const est = bandEstimate(c.seat, 'P-GTM-MGR', loads, PLAN_RATE[loads.currency])
      expect(est.annualLocal).toBeCloseTo(c.annualLocal, 6)
      expect(est.usd).toBeCloseTo(c.usd, 2)
      expect(est.equityUsd).toBe(0)
      expect(weightBp(est.usd, STANDARD_HEAD_USD)).toBe(c.weightBp)
    })
  }

  it('the fixtures’ own band estimates agree with the table (a check on the fixture, not the engine)', () => {
    for (const c of BAND_CASES) expect(TRADE_RATES_11_7.bandUsd(c.seat, 'P-GTM-MGR')).toBeCloseTo(c.usd, 6)
  })
})

describe('the standard head', () => {
  it('F-S: Σ $1,498,486.88 ÷ 10 FTE = $149,848.69, in use $150,000', () => {
    const sum = F_S.positions.reduce((n, p) => n + (TRADE_RATES_11_7.bandUsd(p, p.orgPositionId) ?? 0), 0)
    expect(sum).toBeCloseTo(F_S.sumBandUsd, 2)
    expect(standardHeadRaw(F_S.positions, TRADE_RATES_11_7)).toBeCloseTo(F_S.raw, 3)
    expect(standardHeadRaw(F_S.positions, TRADE_RATES_11_7).toFixed(2)).toBe('149848.69')
    expect(standardHeadOf(F_S.positions, TRADE_RATES_11_7)).toBe(F_S.standardHead)
  })

  it('F-S2: a 0.5 FTE seat pins the divisor to Σ FTE ($150,242.69, still $150,000; not $143,000)', () => {
    const sum = F_S2.positions.reduce((n, p) => n + (TRADE_RATES_11_7.bandUsd(p, p.orgPositionId) ?? 0), 0)
    expect(sum).toBeCloseTo(F_S2.sumBandUsd, 2)
    expect(TRADE_RATES_11_7.bandUsd({ level: 'P4', location: 'Munich', fte: 0.5 }, 'P-GTM-MGR')).toBeCloseTo(
      79_061.4,
      2,
    )
    expect(standardHeadRaw(F_S2.positions, TRADE_RATES_11_7)).toBeCloseTo(F_S2.raw, 3)
    expect(standardHeadRaw(F_S2.positions, TRADE_RATES_11_7).toFixed(2)).toBe('150242.69')
    // Dividing by heads instead (the negative control): $143,413.48, which rounds to $143,000.
    const perHead = sum / F_S2.positions.length
    expect(perHead).toBeCloseTo(F_S2.perHeadRaw, 2)
    expect(Math.round(perHead / 1_000) * 1_000).toBe(F_S2.perHeadRounded)
    const s = standardHeadOf(F_S2.positions, TRADE_RATES_11_7)
    expect(s).toBe(F_S2.standardHead)
    expect(s).not.toBe(F_S2.perHeadRounded)
  })
})

describe('BL1: loads from assumption rows', () => {
  it("P4 Munich FY27 reads C1's loads", () => {
    const lookup = assumptionLookup(MUNICH_ROWS, { versionId: 'fy27-working', name: 'FY27 Working' })
    expect(
      loadsOf(
        { level: 'P4', location: 'Munich' },
        'FY27',
        { businessUnit: 'Go-to-Market', department: 'Sales' },
        lookup,
      ),
    ).toEqual({
      midpoint: 110_000,
      currency: 'EUR',
      bonusTarget: 0.1,
      bonusFunding: 1,
      burden: [{ component: 'social', rate: 0.21, cap: 90_600 }],
      benefits: 0,
      equityUsd: 0,
    })
  })

  it('has no loads where the band has no midpoint', () => {
    const lookup = assumptionLookup(MUNICH_ROWS, { versionId: 'fy27-working', name: 'FY27 Working' })
    expect(loadsOf({ level: 'E3', location: 'Munich' }, 'FY27', null, lookup)).toBeNull()
  })
})

describe('tradeRatesOf: the 11.7 rates from assumption rows', () => {
  // One org's rows: P4 reads 10% bonus here (the 11.7 table's P4 San Jose at 12% sits in another org).
  const rows = [
    assumption('band', 'P3|San Jose|FY27', 150_000),
    assumption('band', 'P5|San Jose|FY27', 220_000),
    assumption('band', 'M2|San Jose|FY27', 300_000),
    assumption('band', 'P4|Munich|FY27', 110_000),
    assumption('band', 'P3|Bengaluru|FY27', 2_500_000),
    assumption('band', 'P4|Haifa|FY27', 480_000),
    assumption('bonusTarget', 'P3', 0.1),
    assumption('bonusTarget', 'P4', 0.1),
    assumption('bonusTarget', 'P5', 0.15),
    assumption('bonusTarget', 'M2', 0.2),
    assumption('bonusFunding', 'FY27', 1),
    assumption('burden', 'United States|social', 0.08),
    assumption('burdenCap', 'United States|social', 180_000),
    assumption('benefits', 'United States', 20_000),
    assumption('burden', 'Germany|social', 0.21),
    assumption('burdenCap', 'Germany|social', 90_600),
    assumption('burden', 'India|social', 0.12),
    assumption('burdenCap', 'India|social', 180_000),
    assumption('benefits', 'India', 50_000),
    assumption('burden', 'Israel|social', 0.125),
    assumption('burdenCap', 'Israel|social', 600_000),
    assumption('trade', 'standardHeadUsd', 150_000),
    assumption('trade', 'minFte', 0.5),
    assumption('trade', 'fteStep', 0.1),
    assumption('trade', 'partTime|*', 1),
    assumption('trade', 'partTime|Bengaluru', 0),
  ]
  const rates = tradeRatesOf({
    version: { versionId: 'fy27-working', name: 'FY27 Working', fiscalYear: 'FY27' },
    lockHash: null,
    lookup: assumptionLookup(rows, { versionId: 'fy27-working', name: 'FY27 Working' }),
    planRate: (currency) => PLAN_RATE[currency] ?? null,
    orgPathOf: () => ({ businessUnit: 'Go-to-Market', department: 'Sales' }),
  })

  it('reads the standard head and the trade settings', () => {
    expect(rates.standardHeadUsd).toBe(STANDARD_HEAD_USD)
    expect(rates.minFte).toBe(0.5)
    expect(rates.fteStep).toBe(0.1)
    expect(rates.year).toBe('FY27')
  })

  it('gives the 11.7 band estimates and weights', () => {
    for (const c of BAND_CASES) {
      if (c.seat.level === 'P4' && c.seat.location === 'San Jose') continue
      const usd = rates.bandUsd(c.seat, 'P-GTM-MGR')
      expect(usd, `${c.seat.level} ${c.seat.location} ${c.seat.fte}`).toBeCloseTo(c.usd, 2)
      expect(weightBp(usd ?? 0, rates.standardHeadUsd)).toBe(c.weightBp)
    }
  })

  it('allows part time in San Jose, Munich and Haifa, not in Bengaluru', () => {
    expect(['San Jose', 'Munich', 'Haifa'].map((l) => rates.partTimeAllowed(l, 'P-GTM-MGR'))).toEqual([
      true,
      true,
      true,
    ])
    expect(rates.partTimeAllowed('Bengaluru', 'P-GTM-MGR')).toBe(false)
  })

  it('has no band for a seat with no midpoint or no plan rate', () => {
    expect(rates.bandUsd({ level: 'E3', location: 'San Jose', fte: 1 }, 'P-GTM-MGR')).toBeNull()
    const noFx = tradeRatesOf({
      version: { versionId: 'fy27-working', name: 'FY27 Working', fiscalYear: 'FY27' },
      lockHash: null,
      lookup: assumptionLookup(rows, { versionId: 'fy27-working', name: 'FY27 Working' }),
      planRate: () => null,
      orgPathOf: () => null,
    })
    expect(noFx.bandUsd({ level: 'P4', location: 'Munich', fte: 1 }, 'P-GTM-MGR')).toBeNull()
    expect(noFx.bandUsd({ level: 'P3', location: 'San Jose', fte: 1 }, 'P-GTM-MGR')).toBeCloseTo(198_200, 2)
  })

  it('F-S from these rates: S reads bands and loads only, so no HRIS salary can move it', () => {
    const seats = F_S.positions.filter((p) => !(p.level === 'P4' && p.location === 'San Jose'))
    const sum = seats.reduce((n, p) => n + (rates.bandUsd(p, p.orgPositionId) ?? 0), 0)
    expect(standardHeadRaw(seats, rates)).toBeCloseTo(sum / seats.length, 6)
    expect(standardHeadOf(seats, rates)).toBe(Math.round(sum / seats.length / 1_000) * 1_000)
  })
})
