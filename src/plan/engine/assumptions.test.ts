/**
 * Assumption lookup (docs/PLAN.md 5.2): the org fallback (department, then unit, then company), '*'
 * keys, version matching by ID or name, and the loads readers cost.ts and band.ts share.
 */
import { describe, expect, it } from 'vitest'
import type { AssumptionRow } from '@/data/schema'
import {
  assumptionLookup,
  burdenComponents,
  dateOfNumber,
  meritRules,
  promotionRules,
  seatLoads,
  standardLoads,
} from './assumptions'
import { assumption } from './fixtures/common'
import { MUNICH_ROWS } from './fixtures/cost'

const FY27 = { versionId: 'fy27-working', name: 'FY27 Working' }
const GTM_SALES = { businessUnit: 'Go-to-Market', department: 'Sales' }
const GTM_MKT = { businessUnit: 'Go-to-Market', department: 'Marketing' }
const SE = { businessUnit: 'Silicon Engineering', department: 'Design Verification' }

const ROWS: AssumptionRow[] = [
  assumption('attrition', '*', 0.1),
  assumption('attrition', '*', 0.14, 'Go-to-Market'),
  assumption('attrition', '*', 0.2, 'Sales'),
  assumption('band', 'P4|Munich|FY27', 110_000),
  assumption('band', 'P4|Munich|FY27', 999_999, null, 'fy28-working'),
  assumption('trade', 'partTime|*', 1),
  assumption('trade', 'partTime|Bengaluru', 0),
  assumption('trade', 'partTime|*', 0, 'Marketing'),
  { version: 'FY27 Working', table: 'timeToFill', org: null, key: 'P4', value: 75 },
  assumption('benefits', 'Germany', 0),
  assumption('benefits', 'Germany', 500),
]

describe('assumptionLookup', () => {
  const lookup = assumptionLookup(ROWS, FY27)

  it('falls back from the department to the unit to the company', () => {
    expect(lookup.get('attrition', [], GTM_SALES)).toMatchObject({ value: 0.2, level: 'org' })
    expect(lookup.get('attrition', [], GTM_MKT)).toMatchObject({ value: 0.14, level: 'unit' })
    expect(lookup.get('attrition', [], SE)).toMatchObject({ value: 0.1, level: 'company' })
    expect(lookup.get('attrition', [], null)).toMatchObject({ value: 0.1, level: 'company' })
  })

  it("an exact key wins over '*', and the org decides before the key", () => {
    expect(lookup.num('trade', ['partTime', 'Munich'], GTM_SALES)).toBe(1)
    expect(lookup.num('trade', ['partTime', 'Bengaluru'], GTM_SALES)).toBe(0)
    // Marketing turns part time off everywhere, even where the company names the location.
    expect(lookup.num('trade', ['partTime', 'Munich'], GTM_MKT)).toBe(0)
  })

  it('reads only the version asked for, by ID or by name', () => {
    expect(lookup.num('band', ['P4', 'Munich', 'FY27'])).toBe(110_000)
    expect(lookup.num('timeToFill', ['P4'])).toBe(75)
    expect(lookup.rows('band')).toHaveLength(1)
    const fy28 = assumptionLookup(ROWS, { versionId: 'fy28-working', name: 'FY28 Plan Working' })
    expect(fy28.num('band', ['P4', 'Munich', 'FY27'])).toBe(999_999)
    expect(fy28.num('attrition', [])).toBeNull()
  })

  it('the later of two equal rows wins; num falls back when nothing is set', () => {
    expect(lookup.num('benefits', ['Germany'])).toBe(500)
    expect(lookup.num('benefits', ['India'])).toBeNull()
    expect(lookup.num('benefits', ['India'], null, 7)).toBe(7)
    expect(lookup.get('severance', ['Germany'])).toBeNull()
  })

  it('returns the row a value came from', () => {
    expect(lookup.get('attrition', [], GTM_SALES)?.row.org).toBe('Sales')
  })
})

describe('loads readers', () => {
  const US: AssumptionRow[] = [
    assumption('band', 'P5|San Jose|FY27', 235_000),
    assumption('bonusTarget', 'P5', 0.12),
    assumption('bonusFunding', 'FY27', 0.9),
    assumption('burden', 'United States|social security', 0.062),
    assumption('burdenCap', 'United States|social security', 176_100),
    assumption('burden', 'United States|medicare', 0.0145),
    assumption('burden', 'United States|unemployment', 0.006),
    assumption('burdenCap', 'United States|unemployment', 7_000),
    assumption('burden', 'Germany|social', 0.21),
    assumption('benefits', 'United States', 18_000),
    assumption('equity', 'P5', 40_000),
    assumption('merit', 'FY27|date', 20260401),
    assumption('merit', 'FY27|pct', 0.035),
    assumption('merit', 'FY27|cutoff', 20260101),
    assumption('merit', 'FY28|date', 20270401),
    assumption('merit', 'FY28|pct', 0.035),
    assumption('merit', 'FY28|pct', 0.05, 'Sales'),
    assumption('promotionPool', 'FY27|date', 20261001),
    assumption('promotionPool', 'FY27|pct', 0.01),
  ]
  const lookup = assumptionLookup(US, FY27)

  it("reads a country's burden components with caps (none: uncapped)", () => {
    expect(burdenComponents('United States', null, lookup)).toEqual([
      { component: 'social security', rate: 0.062, cap: 176_100 },
      { component: 'medicare', rate: 0.0145, cap: null },
      { component: 'unemployment', rate: 0.006, cap: 7_000 },
    ])
    expect(burdenComponents('India', null, lookup)).toEqual([])
  })

  it('reads standard loads with defaults for what is not set', () => {
    expect(standardLoads('P5', 'United States', 'FY27', null, lookup)).toMatchObject({
      bonusTarget: 0.12,
      bonusFunding: 0.9,
      benefits: 18_000,
      equityUsd: 40_000,
    })
    expect(standardLoads('P1', 'India', 'FY28', null, lookup)).toEqual({
      bonusTarget: 0,
      bonusFunding: 1,
      burden: [],
      benefits: 0,
      equityUsd: 0,
    })
  })

  it("reads a seat's loads in its site's currency, and none without a band or a site", () => {
    expect(seatLoads({ level: 'P5', location: 'San Jose' }, 'FY27', null, lookup)).toMatchObject({
      midpoint: 235_000,
      currency: 'USD',
    })
    expect(seatLoads({ level: 'P4', location: 'San Jose' }, 'FY27', null, lookup)).toBeNull()
    expect(seatLoads({ level: 'P5', location: 'Atlantis' }, 'FY27', null, lookup)).toBeNull()
    const munich = assumptionLookup(MUNICH_ROWS, FY27)
    expect(seatLoads({ level: 'P4', location: 'Munich' }, 'FY27', GTM_SALES, munich)?.currency).toBe('EUR')
  })

  it('reads merit and promotion rules by date, through the org fallback', () => {
    expect(meritRules(lookup, null)).toEqual([
      { fiscalYear: 'FY27', date: '2026-04-01', pct: 0.035, cutoff: '2026-01-01' },
      // No cutoff row: the merit date.
      { fiscalYear: 'FY28', date: '2027-04-01', pct: 0.035, cutoff: '2027-04-01' },
    ])
    expect(meritRules(lookup, GTM_SALES)[1].pct).toBe(0.05)
    expect(promotionRules(lookup, null)).toEqual([{ fiscalYear: 'FY27', date: '2026-10-01', pct: 0.01 }])
  })

  it('reads YYYYMMDD numbers as dates', () => {
    expect(dateOfNumber(20260401)).toBe('2026-04-01')
    expect(dateOfNumber(20271231)).toBe('2027-12-31')
    expect(dateOfNumber(2026041)).toBeNull()
    expect(dateOfNumber(20261301)).toBeNull()
    expect(dateOfNumber(null)).toBeNull()
  })
})
