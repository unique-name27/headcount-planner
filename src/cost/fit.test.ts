/**
 * Whether cost can show under the filters and period (docs/PLAN.md 7.3b, 7.4, 7.5, 9.2): every
 * period preset in every mode; the rounded modes' whole-atom filters and their short to-date windows
 * (review RR-3); the 7.4 fixture under change C33 (Finance, and HR admin with the switch off, show
 * cost for whole business units only: a cost-center, legal-entity, country or currency filter shows
 * heads, story 8's 1550-HSZ included); HR admin with the switch off under a department filter plus a
 * level include.
 */
import { describe, expect, it } from 'vitest'
import { guardModeIn } from '@/access/pay'
import type { TreeScope } from '@/access/scopes/types'
import { MODES, type Mode } from '@/data/schema'
import { DEFAULT_FILTERS, type Filters, PERIOD_PRESETS } from '@/data/scope'
import { AT1 } from '@/plan/engine/fixtures/atoms'
import { atomIndex } from './atoms'
import {
  costFit,
  FINANCE_FILTER_NOTE,
  isPartialCostFilter,
  NO_AMOUNTS_NOTE,
  ROUNDED_FILTER_NOTE,
  ROUNDED_PERIOD_NOTE,
  ROUNDED_SHORT_WINDOW_NOTE,
  SWITCH_FILTER_NOTE,
  WHOLE_TEAMS_NOTE,
} from './fit'
import { financeFold } from './fold'

const f = (over: Partial<Filters> = {}): Filters => ({ ...DEFAULT_FILTERS, ...over })

describe('every period preset in every mode', () => {
  const expected = (mode: Mode, period: string): string | null => {
    if (mode === 'manager') return NO_AMOUNTS_NOTE
    if (mode === 'hrbp' || mode === 'leader')
      return ['fy', 'ytd', 'qtd'].includes(period) ? null : ROUNDED_PERIOD_NOTE
    return null
  }

  it('rounded modes show cost at fy, ytd and qtd only; Finance and HR admin at every period; Manager never', () => {
    for (const mode of MODES)
      for (const switchOn of [false, true])
        for (const period of PERIOD_PRESETS) {
          const filters = f({
            period,
            ...(period === 'custom' ? { customStart: '2026-09-01', customEnd: '2026-09-30' } : {}),
          })
          expect(costFit(filters, null, mode, switchOn), `${mode} ${switchOn} ${period}`).toBe(
            expected(mode, period),
          )
        }
  })

  it('reads the pay table src/access/pay.ts holds, for every mode and switch', () => {
    const anyFilter = f({ level: ['P3'], location: ['Munich'], period: 'month' })
    for (const mode of MODES)
      for (const switchOn of [false, true]) {
        const guard = guardModeIn(mode, switchOn)
        const got = costFit(anyFilter, null, mode, switchOn)
        if (guard === 'none') expect(got, mode).toBe(NO_AMOUNTS_NOTE)
        else if (guard === 'open') expect(got, mode).toBeNull()
        else if (guard === 'rounded') expect(got, mode).toBe(ROUNDED_FILTER_NOTE)
        else expect(got, mode).toBe(mode === 'finance' ? FINANCE_FILTER_NOTE : SWITCH_FILTER_NOTE)
      }
  })
})

describe('rounded modes: whole units, departments and leaders (7.3b)', () => {
  it('a level, location, cost center, legal entity, country or currency filter hides cost, included or excluded', () => {
    for (const mode of ['hrbp', 'leader'] as const)
      for (const [dim, value] of [
        ['level', 'P3'],
        ['location', 'Munich'],
        ['costCenter', '1110-SJC'],
        ['legalEntity', 'Northgate Semiconductor GmbH'],
        ['country', 'Germany'],
        ['currency', 'EUR'],
      ] as const) {
        expect(costFit(f({ [dim]: [value] }), null, mode, false), `${mode} ${dim}`).toBe(ROUNDED_FILTER_NOTE)
        expect(costFit(f({ [dim]: [value], modes: { [dim]: 'exclude' } }), null, mode, false)).toBe(
          ROUNDED_FILTER_NOTE,
        )
      }
  })

  it('unit, department and leader filters show cost; the filter note comes before the period note', () => {
    expect(costFit(f({ businessUnit: ['Silicon Engineering'] }), null, 'hrbp', false)).toBeNull()
    expect(costFit(f({ department: ['Design Verification'], period: 'qtd' }), null, 'hrbp', false)).toBeNull()
    expect(costFit(f({ leaderId: 'A-DIR', period: 'ytd' }), null, 'leader', false)).toBeNull()
    expect(costFit(f({ level: ['P3'], period: 'month' }), null, 'hrbp', false)).toBe(ROUNDED_FILTER_NOTE)
    expect(costFit(f({ department: ['Design Verification'], period: 'custom' }), null, 'hrbp', false)).toBe(
      ROUNDED_PERIOD_NOTE,
    )
  })

  it('a department or leader selection that cuts an atom shows heads', () => {
    const atoms = atomIndex(AT1.positions, AT1.closeDate)
    for (const { set, expected } of AT1.unions) {
      const got = costFit(f({ leaderId: 'A-MGR' }), null, 'leader', false, { atoms, selected: new Set(set) })
      expect(got, set.join()).toBe(expected ? null : WHOLE_TEAMS_NOTE)
    }
    // With no selection given, the filter alone decides.
    expect(costFit(f({ leaderId: 'A-MGR' }), null, 'leader', false, { atoms })).toBeNull()
    // A unit filter alone is never checked against atoms.
    expect(
      costFit(f({ businessUnit: ['Silicon Engineering'] }), null, 'hrbp', false, {
        atoms,
        selected: new Set(['A-IC1']),
      }),
    ).toBeNull()
  })

  it('a Leader’s filter on a direct sub-org that cuts an atom shows heads', () => {
    const scope: TreeScope = {
      kind: 'tree',
      rootPersonId: 'E1',
      rootName: 'Dana Ito',
      rootPositionIds: new Set(['A-DIR']),
      positionIds: new Set(['A-MGR', 'A-IC1', 'A-IC2', 'A-DIR-IC', 'A-MGR-OPEN']),
      personIds: new Set(),
      subOrgs: [
        {
          positionId: 'A-MGR',
          label: 'A manager’s team',
          positionIds: new Set(['A-MGR', 'A-IC1']),
          atoms: null,
        },
        { positionId: 'A-VP', label: 'A VP’s org', positionIds: new Set(['A-VP']), atoms: ['A-VP'] },
      ],
      size: 5,
      label: 'Dana Ito’s org',
    }
    expect(costFit(f({ leaderId: 'A-MGR' }), scope, 'leader', false)).toBe(WHOLE_TEAMS_NOTE)
    expect(costFit(f({ leaderId: 'A-VP' }), scope, 'leader', false)).toBeNull()
    expect(costFit(f(), scope, 'leader', false)).toBeNull()
  })
})

describe('Finance: whole business units only (the 7.4 fixture under C33)', () => {
  // Corporate's Hsinchu cost centers 1510-HSZ (4), 1520-HSZ (4) and 1550-HSZ (3) all fold into its Other.
  const fold = financeFold(
    'Corporate',
    [
      { cc: '1500-SJC', n: 40 },
      { cc: '1510-HSZ', n: 4 },
      { cc: '1520-HSZ', n: 4 },
      { cc: '1550-HSZ', n: 3 },
    ].map(({ cc, n }) => ({
      costCenter: cc,
      department: 'Facilities',
      location: cc.endsWith('HSZ') ? 'Hsinchu' : 'San Jose',
      country: cc.endsWith('HSZ') ? 'Taiwan' : 'United States',
      legalEntity: 'Northgate',
      currency: cc.endsWith('HSZ') ? 'TWD' : 'USD',
      costedByMonth: new Array(12).fill(n),
      positionIds: [],
    })),
    5,
  )
  const shownCostCenters = new Set(fold.shown)
  const fin = (filters: Filters) => costFit(filters, null, 'finance', false, { shownCostCenters })

  it('the fold this test reads', () => {
    expect(fold.shown).toEqual(['1500-SJC'])
    expect(fold.other).toEqual(['1510-HSZ', '1520-HSZ', '1550-HSZ'])
  })

  it('shows a cost figure for the company and for whole units, included or excluded, at any period', () => {
    expect(fin(f())).toBeNull()
    expect(fin(f({ businessUnit: ['Corporate'] }))).toBeNull()
    expect(fin(f({ businessUnit: ['Corporate', 'Operations'], period: 'month' }))).toBeNull()
    expect(fin(f({ businessUnit: ['Corporate'], modes: { businessUnit: 'exclude' } }))).toBeNull()
  })

  it('a cost-center, legal-entity, country or currency filter shows heads, a shown cost center too (RF-2, RF-5)', () => {
    // Before C33 a shown cost center, or several, showed cost: two selections differing by a center
    // with one sign-on gave that sign-on (RF-2).
    expect(fin(f({ costCenter: ['1500-SJC'] }))).toBe(FINANCE_FILTER_NOTE)
    expect(fin(f({ costCenter: ['1500-SJC', '1510-HSZ'] }))).toBe(FINANCE_FILTER_NOTE)
    expect(fin(f({ country: ['Taiwan', 'United States'] }))).toBe(FINANCE_FILTER_NOTE)
    expect(fin(f({ legalEntity: ['Northgate'], businessUnit: ['Corporate'] }))).toBe(FINANCE_FILTER_NOTE)
    expect(fin(f({ currency: ['TWD'], period: 'month' }))).toBe(FINANCE_FILTER_NOTE)
    expect(fin(f({ country: ['Taiwan'], modes: { country: 'exclude' } }))).toBe(FINANCE_FILTER_NOTE)
    // Story 8: 1550-HSZ (3 costed people) sits in Corporate's Other.
    expect(fin(f({ costCenter: ['1550-HSZ'] }))).toBe(FINANCE_FILTER_NOTE)
    expect(fin(f({ country: ['Taiwan'], currency: ['TWD'] }))).toBe(FINANCE_FILTER_NOTE)
    // With no shown cost centers given the answer is the same.
    expect(costFit(f({ costCenter: ['1500-SJC'] }), null, 'finance', false)).toBe(FINANCE_FILTER_NOTE)
  })

  it('a leader, department, level or location filter shows heads (the clamp clears them)', () => {
    for (const over of [
      { leaderId: 'P-1' },
      { department: ['IT'] },
      { level: ['P3'] },
      { location: ['Hsinchu'] },
    ])
      expect(fin(f(over)), JSON.stringify(over)).toBe(FINANCE_FILTER_NOTE)
  })

  it('words the C33 rule as the lead decided', () => {
    expect(FINANCE_FILTER_NOTE).toBe(
      "Cost shows for whole business units. Cost centers, countries, legal entities and currencies are rows of each unit's breakdown.",
    )
  })
})

describe('HR admin with the switch off (7.5 under C33)', () => {
  const opts = { shownCostCenters: new Set(['1110-SJC', '1120-SJC']) }
  const adm = (filters: Filters, switchOn = false) => costFit(filters, null, 'hr-admin', switchOn, opts)

  it('a department filter plus a level include returns the reason', () => {
    expect(adm(f({ department: ['Design Verification'], level: ['P3'] }))).toBe(SWITCH_FILTER_NOTE)
  })

  it('whole units show; a department, leader, level or location filter needs the switch', () => {
    expect(adm(f())).toBeNull()
    expect(adm(f({ businessUnit: ['Silicon Engineering'], period: 'month' }))).toBeNull()
    expect(adm(f({ department: ['Design Verification'] }))).toBe(SWITCH_FILTER_NOTE)
    expect(adm(f({ department: ['Design Verification'], modes: { department: 'exclude' } }))).toBe(
      SWITCH_FILTER_NOTE,
    )
    expect(adm(f({ department: ['Design Verification'], country: ['Germany'] }))).toBe(SWITCH_FILTER_NOTE)
    for (const over of [{ leaderId: 'P-1' }, { level: ['P3'] }, { location: ['Munich'] }])
      expect(adm(f(over)), JSON.stringify(over)).toBe(SWITCH_FILTER_NOTE)
  })

  it('a cost-center, legal-entity, country or currency filter shows heads with the C33 note', () => {
    expect(adm(f({ costCenter: ['1110-SJC'], period: 'month' }))).toBe(FINANCE_FILTER_NOTE)
    expect(adm(f({ costCenter: ['1550-HSZ'] }))).toBe(FINANCE_FILTER_NOTE)
    expect(adm(f({ legalEntity: ['Northgate Semiconductor GmbH'] }))).toBe(FINANCE_FILTER_NOTE)
    expect(adm(f({ currency: ['EUR'], businessUnit: ['Silicon Engineering'] }))).toBe(FINANCE_FILTER_NOTE)
  })

  it('with the switch on, cost shows under any filter and period', () => {
    expect(adm(f({ department: ['Design Verification'], level: ['P3'], period: 'custom' }), true)).toBeNull()
    expect(adm(f({ leaderId: 'P-1', location: ['Munich'], costCenter: ['1550-HSZ'] }), true)).toBeNull()
  })
})

describe('rounded modes: a to-date window needs two closed months (RR-3)', () => {
  it('qtd and ytd windows of one closed month show heads with the reason; two or more show', () => {
    for (const mode of ['hrbp', 'leader'] as const) {
      // The first close of a quarter (July) and of the year (April).
      expect(costFit(f({ period: 'qtd' }), null, mode, false, { windowMonths: ['2026-07'] })).toBe(
        ROUNDED_SHORT_WINDOW_NOTE,
      )
      expect(costFit(f({ period: 'ytd' }), null, mode, false, { windowMonths: ['2026-04'] })).toBe(
        ROUNDED_SHORT_WINDOW_NOTE,
      )
      expect(costFit(f({ period: 'qtd' }), null, mode, false, { windowMonths: [] })).toBe(
        ROUNDED_SHORT_WINDOW_NOTE,
      )
      expect(
        costFit(f({ period: 'qtd' }), null, mode, false, { windowMonths: ['2026-07', '2026-08'] }),
      ).toBeNull()
      expect(
        costFit(f({ period: 'ytd' }), null, mode, false, { windowMonths: ['2026-04', '2026-05'] }),
      ).toBeNull()
      // The full year is not a to-date window; with no window given nothing is checked.
      expect(costFit(f({ period: 'fy' }), null, mode, false, { windowMonths: ['2026-04'] })).toBeNull()
      expect(costFit(f({ period: 'qtd' }), null, mode, false)).toBeNull()
    }
  })

  it('exact modes read any window', () => {
    expect(costFit(f({ period: 'qtd' }), null, 'finance', false, { windowMonths: ['2026-07'] })).toBeNull()
    expect(costFit(f({ period: 'ytd' }), null, 'hr-admin', false, { windowMonths: ['2026-04'] })).toBeNull()
  })

  it('names the rule without an amount', () => {
    expect(ROUNDED_SHORT_WINDOW_NOTE).toBe(
      'Cost shows for the quarter to date and year to date once they cover two closed months in this mode.',
    )
  })
})

describe('isPartialCostFilter', () => {
  it('is set by a cost-center, legal-entity, country, currency or department filter, never by a unit', () => {
    expect(isPartialCostFilter(f())).toBe(false)
    expect(isPartialCostFilter(f({ businessUnit: ['Corporate'] }))).toBe(false)
    for (const dim of ['costCenter', 'legalEntity', 'country', 'currency', 'department'] as const)
      expect(isPartialCostFilter(f({ [dim]: ['x'] })), dim).toBe(true)
  })
})
