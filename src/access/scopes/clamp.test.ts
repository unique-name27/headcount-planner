/**
 * The one clamp per scope kind (docs/PLAN.md 8.2 and 16.2; the template app's clamp.test), on the
 * sample: `tree` (Manager and Leader), `unit` (HRBP), Finance's dimensions and HR admin's untouched
 * filters. The clamp keeps each kind's rule, is idempotent, and returns the same object when nothing
 * changes, for every filter a reader can build (a sweep of more than 500 combinations per kind); the
 * period never changes; and a changed link gets one toast, worded for the mode.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { cachedSample, SAMPLE_AS_OF, type Sample } from '@/data/sample'
import { DATASET_KEYS, type DatasetKey } from '@/data/schema'
import {
  buildPositionIndex,
  DEFAULT_FILTERS,
  FILTER_DIMENSIONS,
  type FilterModes,
  type Filters,
  isExcluded,
} from '@/data/scope'
import type { SourceMeta } from '@/data/store'
import { listsInForce } from '../lists'
import { type Mode, NO_PICKS } from '../modes'
import { samplePicks } from '../store'
import { clampFilters, clampReason, clamps, FILTER_DIMS_OF, treePin } from './clamp'
import { NOBODY, type ScopeEnv, scopeFor } from './index'
import { emptyTreeScope } from './tree'
import type { ScopeLock, TreeScope, UnitScope } from './types'
import { emptyUnitScope } from './unit'

const SE = 'Silicon Engineering'
let sample: Sample
let env: ScopeEnv
let manager: TreeScope
let leader: TreeScope
let unit: UnitScope
let seDept: string
let corpDept: string
let insideLeader: string
let outsideLeader: string

const f = (patch: Partial<Filters> = {}): Filters => ({ ...DEFAULT_FILTERS, modes: {}, ...patch })

beforeAll(() => {
  sample = cachedSample()
  const all = sample.datasets
  const sources = Object.fromEntries(
    DATASET_KEYS.map((k) => [k, { kind: 'sample', rowCount: all[k].length }]),
  ) as Record<DatasetKey, SourceMeta>
  env = {
    positionIndex: buildPositionIndex(all.positions, SAMPLE_AS_OF),
    asOf: SAMPLE_AS_OF,
    all,
    lists: listsInForce(null, all, sources),
  }
  const picks = samplePicks(sample.personas)
  manager = scopeFor('manager', picks, env).scope as TreeScope
  leader = scopeFor('leader', picks, env).scope as TreeScope
  unit = scopeFor('hrbp', picks, env).scope as UnitScope
  const deptOf = (bu: string) =>
    [...env.positionIndex.byId.values()].filter((r) => r.businessUnit === bu).map((r) => r.department ?? '')
  seDept = deptOf(SE).find((d) => d && !unit.otherDepartments.has(d)) ?? ''
  corpDept = deptOf('Corporate').find((d) => d && unit.otherDepartments.has(d)) ?? ''
  insideLeader =
    [...leader.positionIds].find((id) => (env.positionIndex.children.get(id)?.length ?? 0) > 2) ?? ''
  outsideLeader =
    [...env.positionIndex.byId.values()].find(
      (r) =>
        r.businessUnit === 'Corporate' &&
        !leader.positionIds.has(r.positionId) &&
        !unit.leaderPositionIds.has(r.positionId),
    )?.positionId ?? ''
}, 60_000)

describe('the sample has what these tests need', () => {
  it('has a team, an org, a unit, departments on both sides and leaders on both sides', () => {
    expect(manager.kind).toBe('tree')
    expect(manager.positionIds.size).toBeGreaterThan(3)
    expect(leader.positionIds.size).toBeGreaterThan(100)
    expect(unit.positionIds.size).toBeGreaterThan(500)
    expect(seDept && corpDept && insideLeader && outsideLeader).toBeTruthy()
  })
})

describe('tree', () => {
  it('pins the leader filter to the root seat, include only, when it is outside', () => {
    const pin = treePin(leader)
    expect(leader.rootPositionIds.has(pin)).toBe(true)
    expect(clampFilters(f(), leader, 'leader').leaderId).toBe(pin)
    expect(clampFilters(f({ leaderId: outsideLeader }), leader, 'leader').leaderId).toBe(pin)
    const ex = clampFilters(f({ leaderId: insideLeader, modes: { leaderId: 'exclude' } }), leader, 'leader')
    expect(ex.leaderId).toBe(pin)
    expect(isExcluded(ex, 'leaderId')).toBe(false)
    // A leader inside the org, with other filters, is kept as it is.
    const inside = f({ leaderId: insideLeader, location: ['Bengaluru'], modes: { location: 'exclude' } })
    expect(clampFilters(inside, leader, 'leader')).toBe(inside)
  })

  it("never pins a Manager's own seat out, and never lets a seat above it in", () => {
    const root = treePin(manager)
    expect(manager.positionIds.has(root)).toBe(false)
    const above = env.positionIndex.byId.get(root)?.managerPositionId ?? ''
    expect(clampFilters(f({ leaderId: above }), manager, 'manager').leaderId).toBe(root)
  })

  it('pins a value no record has while nobody is picked', () => {
    const empty = emptyTreeScope(null)
    const c = clampFilters(f({ leaderId: insideLeader }), empty, 'manager')
    expect(c.leaderId).toBe(NOBODY)
    expect(clampFilters(c, empty, 'manager')).toBe(c)
  })
})

describe('unit', () => {
  it('pins the business unit, include only, and keeps the other filters with their modes', () => {
    for (const asked of [
      f(),
      f({ businessUnit: ['Corporate'] }),
      f({ businessUnit: [SE, 'Corporate'] }),
      f({ businessUnit: [SE], modes: { businessUnit: 'exclude' } }),
      f({ businessUnit: ['Corporate'], modes: { businessUnit: 'exclude' } }),
    ]) {
      const c = clampFilters(asked, unit, 'hrbp')
      expect(c.businessUnit).toEqual([SE])
      expect(isExcluded(c, 'businessUnit')).toBe(false)
    }
    const narrow = f({
      location: ['Munich'],
      level: ['P4'],
      period: 'ytd',
      modes: { location: 'exclude' },
      businessUnit: [SE],
    })
    expect(clampFilters(narrow, unit, 'hrbp')).toBe(narrow)
  })

  it("drops other units' departments and leaders outside the unit", () => {
    const c = clampFilters(f({ businessUnit: [SE], department: [seDept, corpDept] }), unit, 'hrbp')
    expect(c.department).toEqual([seDept])
    const out = clampFilters(
      f({ businessUnit: [SE], department: [corpDept], modes: { department: 'exclude' } }),
      unit,
      'hrbp',
    )
    expect(out.department).toEqual([])
    expect(isExcluded(out, 'department')).toBe(false)
    expect(clampFilters(f({ businessUnit: [SE], leaderId: outsideLeader }), unit, 'hrbp').leaderId).toBeNull()
    const kept = f({ businessUnit: [SE], leaderId: insideLeader, modes: { leaderId: 'exclude' } })
    expect(clampFilters(kept, unit, 'hrbp')).toBe(kept)
  })

  it('pins a value no record has while no HRBP is picked', () => {
    expect(clampFilters(f({ businessUnit: [SE] }), emptyUnitScope(null), 'hrbp').businessUnit).toEqual([
      NOBODY,
    ])
  })
})

describe('a list filter that leaves out the whole scope (the M2 review, B2)', () => {
  const valuesIn = (
    ids: ReadonlySet<string>,
    pick: (r: { businessUnit?: string | null; location?: string | null }) => string | null | undefined,
  ) => new Set([...ids].map((id) => pick(env.positionIndex.byId.get(id) ?? {}) ?? null))
  const allLocations = () => new Set([...env.positionIndex.byId.values()].map((r) => r.location ?? ''))

  it('is dropped by the tree clamp, while a filter that keeps part of the tree stays', () => {
    const units = valuesIn(manager.positionIds, (r) => r.businessUnit)
    const away =
      ['Silicon Engineering', 'Go-to-Market', 'Operations', 'Corporate'].find((u) => !units.has(u)) ?? ''
    const home = [...units].find(Boolean) ?? ''
    expect(away && home).toBeTruthy()
    const pin = treePin(manager)
    // Another mode's unit: dropped, and the leader pinned to the team.
    const c = clampFilters(f({ businessUnit: [away] }), manager, 'manager')
    expect(c).toEqual(f({ leaderId: pin }))
    // The team's own unit stays.
    const kept = clampFilters(f({ businessUnit: [home] }), manager, 'manager')
    expect(kept.businessUnit).toEqual([home])
    // Leaving out every value the team has leaves it empty: dropped, back to include.
    if (units.size === 1) {
      const ex = clampFilters(
        f({ businessUnit: [home], modes: { businessUnit: 'exclude' } }),
        manager,
        'manager',
      )
      expect(ex.businessUnit).toEqual([])
      expect(isExcluded(ex, 'businessUnit')).toBe(false)
    }
    // A site the team has none of, beside one it has: kept (part of the team is still in).
    const sites = valuesIn(manager.positionIds, (r) => r.location)
    const none = [...allLocations()].find((l) => l && !sites.has(l)) ?? ''
    const some = [...sites].find(Boolean) ?? ''
    expect(clampFilters(f({ location: [none] }), manager, 'manager').location).toEqual([])
    expect(clampFilters(f({ location: [none, some] }), manager, 'manager').location).toEqual([none, some])
    // Same object once inside.
    expect(clampFilters(c, manager, 'manager')).toBe(c)
  })

  it('is dropped by the unit clamp too, and says so on a link', () => {
    const sites = valuesIn(unit.positionIds, (r) => r.location)
    const none = [...allLocations()].find((l) => l && !sites.has(l))
    if (none) {
      const asked = f({ businessUnit: [SE], location: [none] })
      const c = clampFilters(asked, unit, 'hrbp')
      expect(c.location).toEqual([])
      expect(clampReason('hrbp', unit, asked, c, 'link')).toBe(
        "HRBP mode shows Silicon Engineering, so the link's filters outside it were left out.",
      )
    }
    const level = f({ businessUnit: [SE], level: ['E9'] })
    expect(clampFilters(level, unit, 'hrbp').level).toEqual([])
  })

  it('says so on a link in a tree, and leaves a tree with nobody picked as it is', () => {
    const units = valuesIn(manager.positionIds, (r) => r.businessUnit)
    const away =
      ['Silicon Engineering', 'Go-to-Market', 'Operations', 'Corporate'].find((u) => !units.has(u)) ?? ''
    const asked = f({ leaderId: treePin(manager), businessUnit: [away] })
    expect(clampReason('manager', manager, asked, clampFilters(asked, manager, 'manager'), 'link')).toBe(
      `Manager mode shows ${manager.label}, so the link's filters outside it were left out.`,
    )
    const empty = emptyTreeScope(null)
    expect(clampFilters(f({ businessUnit: [away] }), empty, 'manager').businessUnit).toEqual([away])
  })
})

describe('Finance and HR admin', () => {
  it('keeps unit, cost center, legal entity, country and currency, include only, and clears the rest', () => {
    const asked = f({
      period: 'ytd',
      leaderId: insideLeader,
      businessUnit: [SE, 'Corporate'],
      department: [seDept],
      costCenter: ['1130-BLR'],
      location: ['Munich'],
      level: ['P4'],
      country: ['India'],
      currency: ['INR'],
      legalEntity: ['Northgate Semiconductor India Pvt. Ltd.'],
      modes: { location: 'exclude' },
    })
    expect(clampFilters(asked, null, 'finance')).toEqual(
      f({
        period: 'ytd',
        businessUnit: [SE, 'Corporate'],
        costCenter: ['1130-BLR'],
        country: ['India'],
        currency: ['INR'],
        legalEntity: ['Northgate Semiconductor India Pvt. Ltd.'],
      }),
    )
    // An excluded list reads as no filter.
    expect(
      clampFilters(f({ businessUnit: [SE], modes: { businessUnit: 'exclude' } }), null, 'finance'),
    ).toEqual(f())
    expect(
      clampFilters(
        f({ currency: ['EUR'], costCenter: ['1110-MUC'], modes: { currency: 'exclude' } }),
        null,
        'finance',
      ),
    ).toEqual(f({ costCenter: ['1110-MUC'] }))
    const ok = f({ period: 'qtd', businessUnit: [SE], currency: ['EUR'] })
    expect(clampFilters(ok, null, 'finance')).toBe(ok)
    expect(FILTER_DIMS_OF.finance).toEqual([
      'businessUnit',
      'costCenter',
      'legalEntity',
      'country',
      'currency',
    ])
  })

  it("leaves HR admin's filters, and a company-wide leader's, untouched", () => {
    const asked = f({
      leaderId: insideLeader,
      location: ['Munich'],
      level: ['P6'],
      modes: { location: 'exclude' },
    })
    expect(clampFilters(asked, null, 'hr-admin')).toBe(asked)
    expect(clampFilters(asked, null, 'leader')).toBe(asked)
    expect(clamps(null, 'hr-admin')).toBe(false)
    expect(clamps(null, 'finance')).toBe(true)
    expect(clamps(unit, 'hrbp')).toBe(true)
  })
})

describe('every kind', () => {
  /** A deterministic spread of filters: every dimension, values inside and outside, both modes. */
  function* filters(): Generator<Filters> {
    const values: Record<string, string[][]> = {
      businessUnit: [[], [SE], ['Corporate'], [SE, 'Go-to-Market']],
      department: [[], [seDept], [corpDept], [seDept, corpDept]],
      location: [[], ['Hsinchu'], ['Bengaluru', 'Munich']],
      level: [[], ['P4'], ['P3', 'M2']],
      currency: [[], ['EUR']],
    }
    const leaders = [null, insideLeader, outsideLeader, treePin(manager), treePin(leader)]
    let i = 0
    for (const bu of values.businessUnit)
      for (const dept of values.department)
        for (const loc of values.location)
          for (const lvl of values.level)
            for (const cur of values.currency)
              for (const leaderId of leaders) {
                i++
                const modes: FilterModes = {}
                for (const [k, d] of FILTER_DIMENSIONS.entries()) if ((i >> k) & 1) modes[d] = 'exclude'
                yield f({
                  period: (['fy', 'ytd', 'qtd', 'month'] as const)[i % 4],
                  businessUnit: bu,
                  department: dept,
                  location: loc,
                  level: lvl,
                  currency: cur,
                  leaderId,
                  modes,
                })
              }
  }

  const cases: [string, () => ScopeLock | null, Mode][] = [
    ['tree (Manager)', () => manager, 'manager'],
    ['tree (Leader)', () => leader, 'leader'],
    ['tree (nobody picked)', () => emptyTreeScope(null), 'manager'],
    ['unit', () => unit, 'hrbp'],
    ['unit (nobody picked)', () => emptyUnitScope(null), 'hrbp'],
    ['finance', () => null, 'finance'],
    ['hr-admin', () => null, 'hr-admin'],
  ]

  for (const [name, scopeOf, mode] of cases)
    it(`is idempotent and keeps the same object when nothing changes (${name})`, () => {
      const scope = scopeOf()
      let n = 0
      let changed = 0
      for (const asked of filters()) {
        const once = clampFilters(asked, scope, mode)
        expect(clampFilters(once, scope, mode)).toBe(once)
        if (once !== asked) {
          changed++
          expect(once).not.toEqual(asked)
        }
        // The period never changes.
        expect([once.period, once.customStart, once.customEnd]).toEqual([
          asked.period,
          asked.customStart,
          asked.customEnd,
        ])
        n++
      }
      expect(n).toBeGreaterThan(500)
      if (mode === 'hr-admin') expect(changed).toBe(0)
      else expect(changed).toBeGreaterThan(0)
    })
})

describe('the toast a changed link gets', () => {
  it('names the scope, worded for the mode', () => {
    const asked = f({ businessUnit: ['Corporate'] })
    expect(clampReason('hrbp', unit, asked, clampFilters(asked, unit, 'hrbp'), 'link')).toBe(
      "HRBP mode shows Silicon Engineering, so the link's other business units were left out.",
    )
    const dept = f({ businessUnit: [SE], department: [corpDept] })
    expect(clampReason('hrbp', unit, dept, clampFilters(dept, unit, 'hrbp'), 'view')).toBe(
      "HRBP mode shows Silicon Engineering, so the saved view's filters outside it were left out.",
    )
    const loc = f({ location: ['Munich'], leaderId: insideLeader })
    expect(clampReason('finance', null, loc, clampFilters(loc, null, 'finance'), 'link')).toBe(
      "Finance mode filters by unit, cost center, legal entity, country and currency, so the link's other filters were left out.",
    )
    const out = f({ leaderId: outsideLeader })
    expect(clampReason('leader', leader, out, clampFilters(out, leader, 'leader'), 'link')).toBe(
      `Leader mode shows ${leader.label}, so the link's leader outside it was left out.`,
    )
    const same = f({ businessUnit: [SE] })
    expect(clampReason('hrbp', unit, same, clampFilters(same, unit, 'hrbp'), 'link')).toBeNull()
    expect(clampReason('hr-admin', null, out, out, 'link')).toBeNull()
  })
})

describe('the picks the tests use', () => {
  it("are the sample's personas", () => {
    const picks = samplePicks(sample.personas)
    expect(picks.hrbp?.unit).toBe(SE)
    expect(Object.keys(picks).sort()).toEqual(Object.keys(NO_PICKS).sort())
  })
})
