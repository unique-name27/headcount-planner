/**
 * The scope in the address (docs/PLAN.md 9.1, 9.2 and 16.2): the template app's grammar with the HCP
 * filter dimensions, plus the version (`ver`) and comparison (`vs`) pickers. Every combination
 * round-trips, `vs=target` round-trips, and an unknown or cross-year `vs` resets to the default.
 */
import { describe, expect, it } from 'vitest'
import { ORG_AS_OF, orgDatasets } from '@/testkit/orgFixture'
import { DEFAULT_FILTERS, type Filters, LIST_DIMENSIONS, type ListDimension } from './scope'
import {
  checkPicks,
  checkScope,
  comparisonChoices,
  DEFAULT_SCOPE,
  DIM_PARAM,
  hashWithScope,
  leftOutMessage,
  type PickCatalog,
  periodMessage,
  picksMessage,
  readScope,
  SCOPE_KEYS,
  type ScopeVocabulary,
  sameScope,
  scopeQuery,
  shownVersion,
  splitHash,
  TARGET_COMPARE,
  type UrlScope,
  vocabularyOf,
} from './urlScope'

const scope = (f: Partial<Filters> = {}, rest: Partial<UrlScope> = {}): UrlScope => ({
  ...DEFAULT_SCOPE,
  filters: { ...DEFAULT_FILTERS, modes: {}, ...f },
  ...rest,
})

/** Write the scope into an address after a route, read it back. */
function roundTrip(route: string, s: UrlScope): { route: string; scope: UrlScope } {
  const { route: r, query } = splitHash(hashWithScope(route, s))
  return { route: r, scope: readScope(query).scope }
}

/** FY27 has a Budget and a Q1 Reforecast; FY28 has only its Working (docs/PLAN.md 13.2). */
const catalog: PickCatalog = {
  fiscalYear: 'FY27',
  versions: [
    { versionId: 'fy27-budget', fiscalYear: 'FY27', state: 'locked' },
    { versionId: 'fy27-q1-reforecast', fiscalYear: 'FY27', state: 'locked' },
    { versionId: 'fy27-working', fiscalYear: 'FY27', state: 'working' },
    { versionId: 'fy27-working-r1', fiscalYear: 'FY27', state: 'retired' },
    { versionId: 'fy28-plan-working', fiscalYear: 'FY28', state: 'working' },
  ],
}

describe('the scope in the address', () => {
  it('leaves defaults out, so the whole company over the fiscal year is just the route', () => {
    expect(hashWithScope('plan.positions', DEFAULT_SCOPE)).toBe('#plan.positions')
    expect(hashWithScope('plan.positions', DEFAULT_SCOPE, { explicit: true })).toBe(
      '#plan.positions?scope=all',
    )
    // A mode on a filter with no values filters nothing and is not written.
    expect(scopeQuery(scope({ modes: { costCenter: 'exclude' } }))).toBe('')
  })

  it('writes the documented example', () => {
    const s = scope(
      { businessUnit: ['Silicon Engineering'] },
      { version: 'fy27-working', compare: 'fy27-budget' },
    )
    expect(hashWithScope('plan.positions', s)).toBe(
      '#plan.positions?bu=Silicon+Engineering&ver=fy27-working&vs=fy27-budget',
    )
    // The plan writes period=fy in its example; reading it is the default period.
    const read = readScope('period=fy&bu=Silicon+Engineering&ver=fy27-working&vs=fy27-budget')
    expect(read.unreadable).toEqual([])
    expect(sameScope(read.scope, s)).toBe(true)
  })

  it('names every dimension with its own key', () => {
    expect(DIM_PARAM).toEqual({
      leaderId: 'leader',
      businessUnit: 'bu',
      department: 'dept',
      costCenter: 'cc',
      location: 'loc',
      level: 'level',
      legalEntity: 'le',
      country: 'country',
      currency: 'ccy',
    })
    expect(new Set(SCOPE_KEYS).size).toBe(SCOPE_KEYS.length)
    for (const k of ['ver', 'vs', 'std', 'lens', 'not', 'scope']) expect(SCOPE_KEYS).toContain(k)
  })

  it('round-trips every filter combination, with exclusions, custom dates, pickers and special routes', () => {
    const routes = ['plan.positions', 'data.metrics/plan/heads/approved', 'actions', 'home', 'requests.queue']
    const values: Record<ListDimension, string[]> = {
      businessUnit: ['Silicon Engineering', 'Go-to-Market'],
      department: ['Design Verification', 'R&D / Labs'],
      costCenter: ['1130-BLR', '1410-SJC'],
      location: ['Bengaluru', 'Ho Chi Minh City'],
      level: ['P4', 'M2'],
      legalEntity: ['Northgate Semiconductor GmbH', 'Northgate Semiconductor (Shanghai) Co., Ltd.'],
      country: ['India', 'Germany'],
      currency: ['INR', 'EUR'],
    }
    const pickers: Partial<UrlScope>[] = [
      {},
      { version: 'fy27-q1-reforecast' },
      { compare: TARGET_COMPARE },
      { version: 'fy28-plan-working', compare: TARGET_COMPARE },
      { version: 'fy27-working', compare: 'fy27-budget' },
    ]
    let checked = 0
    // Every subset of the eight list dimensions, in include and exclude mode, with and without a leader.
    for (let mask = 0; mask < 1 << LIST_DIMENSIONS.length; mask++)
      for (const exclude of [false, true])
        for (const leader of [null, 'P-DIR1'])
          for (const period of [
            { period: 'fy' as const },
            { period: 'custom' as const, customStart: '2026-07-01', customEnd: '2026-09-30' },
          ]) {
            const f: Partial<Filters> = { ...period, leaderId: leader, modes: {} }
            LIST_DIMENSIONS.forEach((d, i) => {
              if (mask & (1 << i)) {
                f[d] = values[d]
                if (exclude) f.modes = { ...f.modes, [d]: 'exclude' }
              }
            })
            if (leader && exclude) f.modes = { ...f.modes, leaderId: 'exclude' }
            const s = scope(f, {
              standard: mask % 3 === 0 ? 'gold' : 'bronze',
              lens: !!(mask & 4),
              ...pickers[mask % pickers.length],
            })
            for (const route of routes) {
              const back = roundTrip(route, s)
              expect(back.route).toBe(route)
              expect(sameScope(back.scope, s)).toBe(true)
              checked++
            }
          }
    expect(checked).toBe(256 * 2 * 2 * 2 * routes.length)
  })

  it('round-trips the target comparison and every period preset', () => {
    for (const s of [
      scope({}, { compare: TARGET_COMPARE }),
      scope({ period: 'ytd' }),
      scope({ period: 'qtd' }),
      scope({ period: 'month' }),
    ]) {
      const back = roundTrip('forecast.variance', s).scope
      expect(back).toEqual({ ...s, filters: { ...s.filters } })
    }
    expect(hashWithScope('home', scope({}, { compare: TARGET_COMPARE }))).toBe('#home?vs=target')
  })

  it('says whether a query names a scope at all', () => {
    expect(readScope(null).present).toBe(false)
    expect(readScope('').present).toBe(false)
    expect(readScope('utm=1').present).toBe(false)
    expect(readScope('scope=all')).toMatchObject({ present: true, scope: DEFAULT_SCOPE })
    expect(readScope('vs=target')).toMatchObject({ present: true, scope: { compare: 'target' } })
    expect(readScope('std=gold').scope.standard).toBe('gold')
    expect(readScope('lens=1').scope.lens).toBe(true)
  })

  it('reads exclusions and ignores modes it does not know', () => {
    const r = readScope('cc=1130-BLR&not=cc&not=planet&leader=P-DIR1&not=leader&ccy=EUR')
    expect(r.scope.filters.costCenter).toEqual(['1130-BLR'])
    expect(r.scope.filters.currency).toEqual(['EUR'])
    expect(r.scope.filters.modes).toEqual({ costCenter: 'exclude', leaderId: 'exclude' })
  })

  it('leaves unreadable parts at the default and says so', () => {
    expect(readScope('period=t12m')).toMatchObject({
      scope: { filters: { period: 'fy' } },
      unreadable: ['period "t12m"'],
    })
    const r = readScope('period=custom&from=2026-02-30&to=2026-01-01')
    expect(r.scope.filters.period).toBe('fy')
    expect(r.unreadable).toEqual(['custom dates'])
    expect(readScope('std=platinum').unreadable).toEqual(['data standard "platinum"'])
    const bad = readScope('ver=<script>&vs=a b')
    expect(bad.scope).toMatchObject({ version: null, compare: null })
    expect(bad.unreadable).toEqual(['version "<script>"', 'comparison "a b"'])
  })
})

describe('the version and comparison pickers', () => {
  it('show the fiscal year’s Working by default, and offer only the target and that year’s locked versions', () => {
    expect(shownVersion({ version: null }, catalog)?.versionId).toBe('fy27-working')
    expect(shownVersion({ version: 'fy28-plan-working' }, catalog)?.fiscalYear).toBe('FY28')
    expect(comparisonChoices(shownVersion({ version: null }, catalog), catalog)).toEqual([
      'target',
      'fy27-budget',
      'fy27-q1-reforecast',
    ])
    // FY28 has no locked version yet: only its target.
    expect(comparisonChoices(shownVersion({ version: 'fy28-plan-working' }, catalog), catalog)).toEqual([
      'target',
    ])
  })

  it('keep vs=target and a same-year locked version, and the same object when nothing changes', () => {
    for (const s of [
      scope({}, { compare: TARGET_COMPARE }),
      scope({}, { compare: 'fy27-budget' }),
      scope({}, { version: 'fy27-q1-reforecast', compare: 'fy27-budget' }),
      scope({}, { version: 'fy28-plan-working', compare: TARGET_COMPARE }),
      scope({}, { version: 'fy27-working-r1', compare: 'fy27-q1-reforecast' }),
    ]) {
      const r = checkPicks(s, catalog)
      expect(r.reset, JSON.stringify(s)).toEqual([])
      expect(r.scope).toBe(s)
    }
  })

  it('reset an unknown or cross-year comparison, and an unknown version, to the defaults', () => {
    const crossYear = checkPicks(scope({}, { version: 'fy28-plan-working', compare: 'fy27-budget' }), catalog)
    expect(crossYear.scope).toMatchObject({ version: 'fy28-plan-working', compare: null })
    expect(crossYear.reset).toEqual(['compare'])
    expect(checkPicks(scope({}, { compare: 'fy26-budget' }), catalog).reset).toEqual(['compare'])
    // A Working version is not a comparison.
    expect(checkPicks(scope({}, { compare: 'fy27-working' }), catalog).scope.compare).toBeNull()
    const unknown = checkPicks(scope({}, { version: 'fy99-working', compare: 'fy27-budget' }), catalog)
    expect(unknown.scope).toMatchObject({ version: null, compare: 'fy27-budget' })
    expect(unknown.reset).toEqual(['version'])
    // An unknown version falls back to FY27's Working, so an FY28-only comparison goes too.
    expect(checkPicks(scope({}, { version: 'nope', compare: 'fy28-x' }), catalog).reset).toEqual([
      'version',
      'compare',
    ])
    // Naming the default Working is the same as leaving it out.
    expect(checkPicks(scope({}, { version: 'fy27-working' }), catalog)).toMatchObject({
      scope: { version: null },
      reset: [],
    })
    // Read from an address, a cross-year vs never survives.
    const link = readScope('ver=fy28-plan-working&vs=fy27-q1-reforecast').scope
    expect(checkPicks(link, catalog).scope.compare).toBeNull()
  })

  it('say what was reset in one plain sentence', () => {
    expect(picksMessage([])).toBe('')
    expect(picksMessage(['compare'])).toBe(
      "The link's comparison is not offered for this version, so the default comparison was used.",
    )
    expect(picksMessage(['version'], "The view's")).toBe(
      "The view's version is not in this workspace, so the default version was used.",
    )
    expect(picksMessage(['version', 'compare'])).toBe(
      "The link's version and comparison are not in this workspace, so the defaults were used.",
    )
  })
})

describe('values the data does not have', () => {
  const vocab: ScopeVocabulary = {
    hasLeader: (id) => id === 'P-DIR1',
    hasValue: (dim, v) => (dim === 'department' ? v === 'Design Verification' : v !== 'Mars'),
  }

  it('are left out, and the message names them', () => {
    const s = readScope('dept=Photonics&dept=Design+Verification&leader=P-9&loc=Mars&cc=Mars&not=cc').scope
    const r = checkScope(s, vocab)
    expect(r.scope.filters.department).toEqual(['Design Verification'])
    expect(r.scope.filters.leaderId).toBeNull()
    expect(r.scope.filters.location).toEqual([])
    expect(r.scope.filters.modes).toEqual({})
    expect(r.leftOut).toEqual([
      { dim: 'leaderId', value: 'P-9' },
      { dim: 'department', value: 'Photonics' },
      { dim: 'costCenter', value: 'Mars' },
      { dim: 'location', value: 'Mars' },
    ])
  })

  it('reads as one plain sentence', () => {
    expect(leftOutMessage([{ dim: 'costCenter', value: '1130-XYZ' }])).toBe(
      "The link's cost center 1130-XYZ is not in your data, so it was left out.",
    )
    expect(
      leftOutMessage([
        { dim: 'currency', value: 'GBP' },
        { dim: 'currency', value: 'JPY' },
      ]),
    ).toBe("The link's currencies GBP and JPY are not in your data, so they were left out.")
    expect(
      leftOutMessage([
        { dim: 'leaderId', value: 'P-9' },
        { dim: 'legalEntity', value: 'Acme Ltd.' },
      ]),
    ).toBe(
      "The link's leader with position ID P-9 and legal entity Acme Ltd. are not in your data, so they were left out.",
    )
  })

  it('keeps the scope object when nothing is left out, and moves a custom period inside the data', () => {
    const s = readScope('dept=Design+Verification').scope
    expect(checkScope(s, vocab).scope).toBe(s)
    const late = readScope('period=custom&from=2026-07-01&to=2026-12-31').scope
    const r = checkScope(late, { ...vocab, asOf: ORG_AS_OF })
    expect(r.scope.filters.customEnd).toBe(ORG_AS_OF)
    expect(periodMessage(r.period!)).toBe(
      "The link's custom period ends after the reporting date, 30 Sep 2026, so it ends there instead.",
    )
    const after = checkScope(readScope('period=custom&from=2026-11-01&to=2026-12-31').scope, {
      ...vocab,
      asOf: ORG_AS_OF,
    })
    expect(after.scope.filters.period).toBe('fy')
    expect(after.period?.kind).toBe('after')
  })

  it('come from every dataset that carries the dimension, legal entity, country and currency included', () => {
    const v = vocabularyOf({ all: orgDatasets(), asOf: ORG_AS_OF })
    expect(v.asOf).toBe(ORG_AS_OF)
    expect(v.hasLeader('P-DIR1')).toBe(true)
    expect(v.hasLeader('P-FUT')).toBe(true)
    expect(v.hasLeader('E3')).toBe(false)
    expect(v.hasValue('country', 'Germany')).toBe(true)
    expect(v.hasValue('currency', 'INR')).toBe(true)
    expect(v.hasValue('legalEntity', 'Northgate Semiconductor GmbH')).toBe(true)
    expect(v.hasValue('costCenter', '1130-HSZ')).toBe(true)
    expect(v.hasValue('level', 'P6')).toBe(true)
    expect(v.hasValue('location', 'Toronto')).toBe(false)
  })
})
