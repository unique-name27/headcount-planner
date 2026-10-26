/**
 * Folds (docs/PLAN.md 7.2 rule 2 and 7.4): the template app's `foldGroups`, `guardGroups`,
 * `wholeUnits` and `foldByUnit` cases (budget.test's totals rules, cost.test's top, costUnions' fold
 * by unit), Finance's one cost-center fold with its currency rule, and the org-row rule.
 */
import { describe, expect, it } from 'vitest'
import {
  type FinanceFold,
  type FoldCenter,
  financeFold,
  financeOrgCost,
  foldByPart,
  foldGroups,
  groupBy,
  guardGroups,
  NONE,
  ORG_COST_NOTE,
  type OrgCostRow,
  OTHER,
  otherLabel,
  wholeParts,
} from './fold'

const MIN = 5

/** A cost center with the same costed people every month of a 12-month grid. */
const center = (
  costCenter: string,
  n: number | readonly number[],
  over: Partial<FoldCenter> = {},
): FoldCenter => ({
  costCenter,
  department: 'Design',
  location: 'San Jose',
  country: 'United States',
  legalEntity: 'Northgate Semiconductor Inc.',
  currency: 'USD',
  costedByMonth: typeof n === 'number' ? new Array(12).fill(n) : n,
  positionIds: Array.from(
    { length: typeof n === 'number' ? n : Math.max(...n) },
    (_, i) => `${costCenter}-${i + 1}`,
  ),
  ...over,
})

describe('foldGroups (the template app’s, verbatim)', () => {
  it('pulls the smallest shown group into Other until it reaches the minimum', () => {
    const { shown, folded } = foldGroups([9, 6, 2, 1], (x) => x, 5, true)
    expect(shown).toEqual([9])
    expect(folded).toEqual([2, 1, 6])
    // With the total hidden there is nothing to subtract from.
    expect(foldGroups([9, 6, 2, 1], (x) => x, 5, false).folded).toEqual([2, 1])
  })

  it('takes the first of equal smallest groups, and leaves a breakdown with nothing small alone', () => {
    const a = { k: 'a', n: 6 }
    const b = { k: 'b', n: 6 }
    const { shown, folded } = foldGroups([a, b, { k: 'c', n: 3 }], (g) => g.n, 5, true)
    expect(shown).toEqual([b])
    expect(folded.map((g) => g.k)).toEqual(['c', 'a'])
    expect(foldGroups([7, 5], (x) => x, 5, true)).toEqual({ shown: [7, 5], folded: [] })
  })

  it('folds everything when the shown groups cannot lift Other to the minimum', () => {
    expect(foldGroups([2, 1], (x) => x, 5, true)).toEqual({ shown: [], folded: [2, 1] })
  })
})

describe('guardGroups and groupBy', () => {
  const g = (n: number) => ({ key: `g${n}`, label: `G${n}`, rows: Array.from({ length: n }, (_, i) => i) })

  it('names the largest groups up to the top, the rest in Other', () => {
    const { shown, folded } = guardGroups([g(5), g(9), g(7), g(6)], 5, true, {
      top: 2,
      rank: (x) => x.rows.length,
    })
    expect(shown.map((x) => x.key)).toEqual(['g9', 'g7'])
    expect(folded.map((x) => x.key).sort()).toEqual(['g5', 'g6'])
  })

  it('sizes groups by `size` when given (costed people, not rows)', () => {
    const { shown, folded } = guardGroups([g(6), g(7)], 5, true, { size: (x) => (x.key === 'g6' ? 2 : 7) })
    expect(shown.map((x) => x.key)).toEqual([])
    expect(folded.map((x) => x.key)).toEqual(['g6', 'g7'])
  })

  it('groups by key in first-seen order, with one group for no value', () => {
    const rows = [{ k: 'b' }, { k: null }, { k: 'a' }, { k: '' }, { k: 'b' }]
    const groups = groupBy(
      rows,
      (r) => r.k,
      'No team',
      (k) => k.toUpperCase(),
    )
    expect(groups.map((x) => [x.key, x.label, x.rows.length])).toEqual([
      ['b', 'B', 2],
      [NONE, 'No team', 2],
      ['a', 'A', 1],
    ])
    expect(otherLabel(3)).toBe('Other (3)')
    expect(OTHER).toBe('__other')
  })
})

describe('wholeParts and foldByPart (the template app’s wholeUnits and foldByUnit)', () => {
  it('keeps the rows of parts with the minimum or more, and leaves the rest out', () => {
    expect(wholeParts([{ u: 'A' }, { u: 'A' }, { u: 'B' }], (p) => p.u, 2).kept).toHaveLength(2)
    const rows = [
      ...Array.from({ length: 8 }, (_, i) => ({ id: `o${i}`, u: 'Operations' })),
      ...Array.from({ length: 3 }, (_, i) => ({ id: `x${i}`, u: 'Executive Office' })),
    ]
    const { kept, left } = wholeParts(rows, (r) => r.u, MIN)
    expect(kept).toHaveLength(8)
    expect(left.map((r) => r.u)).toEqual(['Executive Office', 'Executive Office', 'Executive Office'])
    // A part's size can be its distinct people rather than its rows.
    const one = wholeParts(
      rows,
      (r) => r.u,
      MIN,
      (rs) => new Set(rs.map((r) => r.u)).size,
    )
    expect(one.kept).toEqual([])
  })

  it('folds a group inside each part and keeps every row made of parts of 5 or more', () => {
    const rows = [
      ...Array.from({ length: 6 }, (_, i) => ({ id: `a${i}`, u: 'A', g: 'L3' })),
      ...Array.from({ length: 2 }, (_, i) => ({ id: `b${i}`, u: 'B', g: 'L3' })),
      ...Array.from({ length: 7 }, (_, i) => ({ id: `c${i}`, u: 'B', g: 'L4' })),
    ]
    const f = foldByPart(
      rows,
      (r) => r.g,
      (r) => r.u,
      'None',
      MIN,
    )
    // B's two L3s go to B's Other, and B's smallest shown group (L4) joins until it reaches 5.
    expect(f.groups.map((g) => [g.key, g.rows.length])).toEqual([['L3', 6]])
    expect(f.other).toHaveLength(9)
    expect([...f.otherKeys].sort()).toEqual(['L3', 'L4'])
  })

  it('merges a group shown in two parts into one row', () => {
    const rows = [
      ...Array.from({ length: 5 }, () => ({ u: 'A', g: 'L3' })),
      ...Array.from({ length: 6 }, () => ({ u: 'B', g: 'L3' })),
    ]
    const f = foldByPart(
      rows,
      (r) => r.g,
      (r) => r.u,
      'None',
      MIN,
    )
    expect(f.groups.map((g) => [g.key, g.rows.length])).toEqual([['L3', 11]])
    expect(f.other).toEqual([])
  })
})

describe('financeFold: one cost-center fold per unit (7.4)', () => {
  it('folds cost centers under 5 into the unit’s Other, the smallest shown joining while Other is under 5', () => {
    const fold = financeFold(
      'Chips',
      [center('CC-1', 12), center('CC-2', 7), center('CC-3', 3), center('CC-4', 1), center('CC-5', 1)],
      MIN,
    )
    expect(fold).toMatchObject({
      unit: 'Chips',
      shown: ['CC-1', 'CC-2'],
      other: ['CC-3', 'CC-4', 'CC-5'],
      otherSize: 5,
    })
    expect(fold.positionsOf['CC-4']).toEqual(['CC-4-1'])
    const pulled = financeFold('U', [center('A', 9), center('B', 6), center('C', 2), center('D', 1)], MIN)
    expect(pulled).toMatchObject({ shown: ['A'], other: ['B', 'C', 'D'], otherSize: 9 })
  })

  it('sizes a cost center by its fewest costed people in any month of the grid', () => {
    // 4 Filled seats and an accepted offer from February; 5 Filled seats with one last day 31 Oct.
    const offerCenter = center('B', [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 5, 5])
    const leaver = center('D', [5, 5, 5, 5, 5, 5, 5, 4, 4, 4, 4, 4])
    const fold = financeFold('U', [center('A', 10), offerCenter, center('C', 6), leaver], MIN)
    expect(fold.other).toEqual(['B', 'D'])
    // The Other is sized on its summed months (8 at the fewest), so nothing else joins.
    expect(fold.otherSize).toBe(8)
    expect(fold.shown).toEqual(['A', 'C'])
  })

  it('reads the minimum it is given, sorts by code and takes the first of equal smallest', () => {
    const fold = financeFold('U', [center('Z', 6), center('Y', 6), center('X', 2)], MIN)
    expect(fold).toMatchObject({ shown: ['Z'], other: ['X', 'Y'] })
    // Raised to 10: B (7) folds, and A must join it to bring the Other to 10.
    expect(financeFold('U', [center('A', 12), center('B', 7)], 10)).toMatchObject({
      shown: [],
      other: ['A', 'B'],
      otherSize: 19,
    })
    expect(financeFold('U', [center('A', 12), center('B', 7)], MIN)).toMatchObject({
      other: [],
      otherSize: 0,
    })
  })

  it('keeps each currency’s share of the Other at 0 or 5 or more (the PLAN’s Taiwan fixture)', () => {
    const tw = { country: 'Taiwan', currency: 'TWD', location: 'Hsinchu' }
    const fold = financeFold(
      'U',
      [center('A', 6, tw), center('B', 3, tw), center('C', 7), center('D', 6), center('E', 2)],
      MIN,
    )
    // Other = B + E = 5; its TWD share (B, 3) pulls A in, its USD share (E, 2) pulls D (the smallest US).
    expect(fold).toMatchObject({ shown: ['C'], other: ['A', 'B', 'D', 'E'], otherSize: 17 })
  })

  it('a unit with only 1 to 4 costed people in a currency in all keeps them in its Other (accepted risk 8)', () => {
    const cad = { country: 'Canada', currency: 'CAD', location: 'Toronto' }
    const fold = financeFold('Corporate', [center('A', 10), center('B', 8), center('T', 1, cad)], MIN)
    expect(fold).toMatchObject({ shown: ['A'], other: ['B', 'T'], otherSize: 9 })
  })

  it('reads a currency share month by month: 0 in some months and 5 or more in the rest is fine', () => {
    const late = { currency: 'EUR', country: 'Germany', location: 'Munich' }
    const fold = financeFold(
      'U',
      [
        center('A', 10),
        center('B', 6),
        center('M1', [0, 0, 0, 0, 0, 0, 5, 5, 5, 5, 5, 5], late),
        center('M2', 7, late),
      ],
      MIN,
    )
    // M1 is under 5 at its fewest and joins Other; B, the smallest shown, lifts Other to 5 or more.
    expect(fold.other).toEqual(['B', 'M1'])
    expect(fold.shown).toEqual(['A', 'M2'])
  })

  it('counts a center’s people in the currency of the lines that cost them (RF-5)', () => {
    // C sits in San Jose but pays one of its 3 people in EUR; M is a Munich center of 6.
    const eur = { currency: 'EUR', country: 'Germany', location: 'Munich' }
    const twelve = (n: number) => new Array(12).fill(n)
    const c = center('C', 3, { costedByCurrency: { USD: twelve(2), EUR: twelve(1) } })
    const fold = financeFold('U', [center('A', 10), c, center('D', 3), center('M', 6, eur)], MIN)
    // Other = C + D holds 1 EUR person: before the fix the share went unseen (C read as USD); now
    // the smallest shown center with EUR people, M, joins, and the EUR share is 7.
    expect(fold).toMatchObject({ shown: ['A'], other: ['C', 'D', 'M'] })
    // A center with no per-currency counts reads as its own currency, as before.
    expect(financeFold('U', [center('A', 10), center('C', 3), center('D', 3)], MIN).other).toEqual(['C', 'D'])
  })

  it('a folded center with nobody costed still makes the Other one to fill', () => {
    const fold = financeFold('U', [center('A', 10), center('B', 6), center('NEW', 0)], MIN)
    expect(fold).toMatchObject({ shown: ['A'], other: ['B', 'NEW'], otherSize: 6 })
  })
})

describe('financeOrgCost: org rows below the unit (7.4)', () => {
  const fold: FinanceFold = financeFold(
    'U',
    [center('CC-1', 5), center('CC-2', 5), center('CC-3', 6), center('CC-4', 3), center('CC-5', 2)],
    MIN,
  )
  const ids = (cc: string, n: number) => Array.from({ length: n }, (_, i) => `${cc}-${i + 1}`)
  const row = (
    key: string,
    parent: string | null,
    positionIds: readonly string[],
    unit = 'U',
  ): OrgCostRow => ({
    key,
    parent,
    unit,
    positionIds: new Set(positionIds),
  })
  const decide = (rows: readonly OrgCostRow[]) => financeOrgCost(rows, new Map([['U', fold]]))

  it('the fold this test reads', () => {
    expect(fold).toMatchObject({ shown: ['CC-1', 'CC-2', 'CC-3'], other: ['CC-4', 'CC-5'] })
  })

  it('shows cost on unions of whole shown cost centers, never on a part of one or of the Other', () => {
    const got = decide([
      row('vp', null, [...ids('CC-1', 5), ...ids('CC-2', 5)]),
      row('dir', 'vp', ids('CC-1', 5)),
      row('team', null, ids('CC-3', 3)),
      row('withOther', null, [...ids('CC-3', 6), 'CC-4-1']),
      row('unit', null, [
        ...ids('CC-1', 5),
        ...ids('CC-2', 5),
        ...ids('CC-3', 6),
        ...ids('CC-4', 3),
        ...ids('CC-5', 2),
      ]),
      row('unknown', null, [...ids('CC-2', 5), 'NOT-IN-THE-FOLD']),
      row('elsewhere', null, ids('CC-1', 5), 'Another unit'),
    ])
    expect(Object.fromEntries(got)).toEqual({
      vp: null,
      dir: null,
      team: ORG_COST_NOTE,
      withOther: ORG_COST_NOTE,
      unit: ORG_COST_NOTE,
      unknown: null,
      elsewhere: ORG_COST_NOTE,
    })
  })

  it('an SVP row of the sub-orgs plus the SVP’s own seat shows heads; its sub-orgs show cost', () => {
    const got = decide([
      row('svp', null, [...ids('CC-1', 5), ...ids('CC-2', 5), 'CC-3-1']),
      row('vp1', 'svp', ids('CC-1', 5)),
      row('vp2', 'svp', ids('CC-2', 5)),
    ])
    expect(Object.fromEntries(got)).toEqual({ svp: ORG_COST_NOTE, vp1: null, vp2: null })
  })

  it('decides children first and stops on a parent loop', () => {
    const got = decide([row('a', 'b', ids('CC-1', 5)), row('b', 'a', [...ids('CC-1', 5), ...ids('CC-2', 5)])])
    expect(got.size).toBe(2)
    expect(got.get('a')).toBeNull()
  })
})
