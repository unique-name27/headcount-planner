/**
 * Filters, fiscal period presets and position trees (docs/PLAN.md 9.2 and 16.2): the position index
 * as of a date, subtrees, and `scopeDatasets` over all eight datasets on a hand-made org
 * (src/testkit/orgFixture.ts), each expectation written out from the fixture's picture.
 */
import { describe, expect, it } from 'vitest'
import { ORG_AS_OF, orgDatasets } from '@/testkit/orgFixture'
import type { Datasets } from './schema'
import {
  buildPositionIndex,
  canonicalFilters,
  DEFAULT_FILTERS,
  dropIdleModes,
  FILTER_DIMENSIONS,
  type Filters,
  focusLeader,
  hasOrgFilter,
  holderNames,
  isActiveOn,
  LIST_DIMENSIONS,
  normalizeFilters,
  periodWindow,
  placementRows,
  requestPositions,
  requestValues,
  resolveAsOf,
  sameFilters,
  scopeDatasets,
  scopeInSentence,
  scopeLabel,
  seatsOf,
  subtreeIds,
  withMode,
} from './scope'

const f = (patch: Partial<Filters>): Filters => ({ ...DEFAULT_FILTERS, modes: {}, ...patch })
const data = orgDatasets()
const index = buildPositionIndex(data.positions, ORG_AS_OF)

const ids = {
  positions: (d: Datasets) => [...new Set(d.positions.map((r) => r.positionId))].sort(),
  workers: (d: Datasets) => d.workers.map((w) => `${w.employeeId}@${w.positionId ?? '-'}`).sort(),
  comp: (d: Datasets) => d.comp.map((c) => c.employeeId).sort(),
  reqs: (d: Datasets) => d.reqs.map((r) => r.reqId).sort(),
  requests: (d: Datasets) => d.requests.map((r) => r.requestId).sort(),
  targets: (d: Datasets) =>
    d.targets.map((t) => [t.businessUnit, t.department, t.costCenter, t.leaderPositionId].join('/')),
  freezes: (d: Datasets) => d.freezes.map((r) => r.freezeId).sort(),
}

describe('the fiscal period presets', () => {
  it('default to the as-of date’s fiscal year, April to March', () => {
    expect(DEFAULT_FILTERS.period).toBe('fy')
    expect(periodWindow('fy', ORG_AS_OF)).toMatchObject({
      start: '2026-04-01',
      end: '2027-03-31',
      months: 12,
      fiscalYear: 'FY27',
    })
    expect(periodWindow('ytd', ORG_AS_OF)).toMatchObject({
      start: '2026-04-01',
      end: '2026-09-30',
      months: 6,
    })
    expect(periodWindow('qtd', ORG_AS_OF)).toMatchObject({
      start: '2026-07-01',
      end: '2026-09-30',
      months: 3,
    })
    expect(periodWindow('month', '2026-09-16')).toMatchObject({ start: '2026-09-01', end: '2026-09-16' })
    // A March as-of date is still the fiscal year that started the April before.
    expect(periodWindow('fy', '2027-03-31').fiscalYear).toBe('FY27')
  })
})

describe('the position tree', () => {
  it('reads each seat as of the date, and leaves out seats that start later', () => {
    expect(index.byId.get('P-IC3')?.location).toBe('Hsinchu')
    expect(index.byId.get('P-MOVE')?.managerPositionId).toBe('P-MGR1')
    expect(index.byId.get('P-ELIM')?.status).toBe('Eliminated')
    expect(index.byId.has('P-FUT')).toBe(false)
    expect(index.byId.has('P-FUT2')).toBe(false)
    expect(index.children.get('P-MGR1')?.map((r) => r.positionId)).toEqual([
      'P-IC1',
      'P-IC2',
      'P-IC3',
      'P-MOVE',
    ])
    expect(index.children.get('P-DIR2')?.map((r) => r.positionId)).toEqual(['P-IC4', 'P-ELIM'])
    // Earlier in the year the moved seat was still in Sales.
    const june = buildPositionIndex(data.positions, '2026-06-30')
    expect(june.byId.get('P-MOVE')?.managerPositionId).toBe('P-DIR2')
    expect(june.byId.get('P-ELIM')?.status).toBe('Filled')
    // Later, the Planned seat has moved to Bengaluru and the new seats are in.
    const january = buildPositionIndex(data.positions, '2027-01-15')
    expect(january.byId.get('P-IC3')?.location).toBe('Bengaluru')
    expect(january.children.get('P-FUT')?.map((r) => r.positionId)).toEqual(['P-FUT2'])
  })

  it('walks a subtree from any seat, never hangs on a loop, and is empty for an unknown seat', () => {
    expect([...subtreeIds(index, 'P-DIR1')].sort()).toEqual(
      ['P-DIR1', 'P-IC1', 'P-IC2', 'P-IC3', 'P-MGR1', 'P-MOVE'].sort(),
    )
    // Everything in effect but the loop, which hangs under no one.
    expect(subtreeIds(index, 'P-CEO').size).toBe(11)
    expect([...subtreeIds(index, 'P-LOOP1')].sort()).toEqual(['P-LOOP1', 'P-LOOP2'])
    expect(subtreeIds(index, 'P-NOPE').size).toBe(0)
    expect(subtreeIds(index, 'P-FUT').size).toBe(0)
  })

  it('places a seat that starts later by its first row', () => {
    const place = placementRows(data.positions, index)
    expect(place.get('P-FUT')?.effectiveDate).toBe('2026-12-01')
    expect(place.get('P-IC3')?.location).toBe('Hsinchu')
    expect(place.size).toBe(15)
  })

  it('knows who sits where on the as-of date', () => {
    expect(seatsOf(data.workers, ORG_AS_OF).get('E8')).toBe('P-MOVE')
    expect(seatsOf(data.workers, '2026-06-30').get('E8')).toBe('P-ELIM')
    expect(seatsOf(data.workers, ORG_AS_OF).has('E9')).toBe(false)
    const names = holderNames(data.workers, ORG_AS_OF)
    expect(names.get('P-DIR1')).toBe('Dana Ito')
    expect(names.get('P-MOVE')).toBe('Hana Ruiz')
    expect(names.has('P-ELIM')).toBe(false)
    expect(holderNames(data.workers, '2026-06-30').get('P-ELIM')).toBe('Hana Ruiz')
  })

  it('counts the last day as active', () => {
    expect(isActiveOn({ start: '2026-04-01', end: '2026-09-30' }, '2026-09-30')).toBe(true)
    expect(isActiveOn({ start: '2026-04-01', end: '2026-09-30' }, '2026-10-01')).toBe(false)
    expect(isActiveOn({ start: '2026-10-01', end: null }, '2026-09-30')).toBe(false)
  })
})

describe('scoping the datasets', () => {
  it('returns the datasets as they are with no org filter (the period is not one)', () => {
    expect(scopeDatasets(data, f({ period: 'ytd' }), index)).toBe(data)
    expect(hasOrgFilter(f({ period: 'custom' }))).toBe(false)
  })

  it('keeps a leader’s tree in every dataset', () => {
    const s = scopeDatasets(data, f({ leaderId: 'P-DIR1' }), index)
    expect(ids.positions(s)).toEqual(
      ['P-DIR1', 'P-FUT', 'P-FUT2', 'P-IC1', 'P-IC2', 'P-IC3', 'P-MGR1', 'P-MOVE'].sort(),
    )
    // Every row of a seat in the tree, its earlier and later rows too.
    expect(s.positions.filter((r) => r.positionId === 'P-MOVE')).toHaveLength(2)
    expect(s.positions.filter((r) => r.positionId === 'P-IC3')).toHaveLength(2)
    // Assignments by the seat they hold (Hana's Sales row stays out); people with no seat by their
    // manager's seat (Jo reports to Eli, Max to Dana).
    expect(ids.workers(s)).toEqual(['E12@-', 'E3@P-DIR1', 'E4@P-MGR1', 'E5@P-IC1', 'E8@P-MOVE', 'E9@-'])
    expect(ids.comp(s)).toEqual(['E3', 'E4', 'E5', 'E8', 'E9'])
    // R2 is for a seat that starts later; R3 and R4 cannot be placed, so an include leaves them out.
    expect(ids.reqs(s)).toEqual(['R1', 'R2'])
    // The new role reports into the tree; the transfer moves someone into it.
    expect(ids.requests(s)).toEqual(['Q1', 'Q4'])
    expect(ids.targets(s)).toEqual(['Silicon Engineering/Design Verification//P-DIR1'])
    expect(ids.freezes(s)).toEqual([])
    expect(s.assumptions).toBe(data.assumptions)
  })

  it('splits every dataset between "Filter to" and "Leave out" a leader or a value', () => {
    const cases: Partial<Filters>[] = [
      { leaderId: 'P-DIR1' },
      { leaderId: 'P-DIR2' },
      { leaderId: 'P-LOOP1' },
      { location: ['Munich'] },
      { businessUnit: ['Go-to-Market'] },
      { department: ['Design Verification'] },
      { costCenter: ['1130-BLR'] },
      { level: ['P3', 'P5'] },
      { legalEntity: ['Northgate Semiconductor GmbH'] },
      { country: ['India'] },
      { currency: ['USD'] },
    ]
    for (const c of cases) {
      const dim = FILTER_DIMENSIONS.find((d) => (d === 'leaderId' ? !!c.leaderId : !!c[d]?.length))!
      const inc = scopeDatasets(data, f(c), index)
      const exc = scopeDatasets(data, f({ ...c, modes: { [dim]: 'exclude' } }), index)
      for (const k of ['positions', 'workers', 'reqs', 'requests', 'targets', 'freezes'] as const) {
        const a = inc[k] as object[]
        const b = exc[k] as object[]
        expect(
          a.filter((r) => b.includes(r)),
          `${dim} ${k}`,
        ).toEqual([])
        expect(a.length + b.length, `${dim} ${k}`).toBe((data[k] as object[]).length)
      }
    }
  })

  it('places positions by their own fields and their location’s legal entity, country and currency', () => {
    const munich = ['P-IC2', 'P-IC4']
    for (const c of [
      { location: ['Munich'] },
      { country: ['Germany'] },
      { currency: ['EUR'] },
      // P-IC4 leaves its legal entity blank: it reads the location's.
      { legalEntity: ['Northgate Semiconductor GmbH'] },
    ])
      expect(ids.positions(scopeDatasets(data, f(c), index)), JSON.stringify(c)).toEqual(munich)
    const s = scopeDatasets(data, f({ location: ['Munich'] }), index)
    expect(ids.workers(s)).toEqual(['E7@P-IC4'])
    // The level change names no location: it reads its seat's, Munich.
    expect(ids.requests(s)).toEqual(['Q2'])
    // Targets and freezes have no location: an include leaves them out, an exclude keeps them.
    expect(s.targets).toEqual([])
    const out = scopeDatasets(data, f({ location: ['Munich'], modes: { location: 'exclude' } }), index)
    expect(out.targets).toBe(data.targets)
    expect(out.freezes).toBe(data.freezes)
  })

  it('uses the as-of row of a seat that changes later, and the first row of one that starts later', () => {
    const blr = scopeDatasets(data, f({ location: ['Bengaluru'] }), index)
    const p = ids.positions(blr)
    expect(p).toContain('P-FUT')
    expect(p).toContain('P-FUT2')
    expect(p).not.toContain('P-IC3')
    // Not-in-plan people by their own HRIS fields.
    expect(ids.workers(blr)).toContain('E9@-')
    expect(ids.workers(blr)).toContain('E12@-')
  })

  it('reads people in a seat the data does not have by their own fields', () => {
    const s = scopeDatasets(data, f({ businessUnit: ['Corporate'] }), index)
    expect(ids.workers(s)).toEqual(['E11@P-GHOST'])
    expect(ids.positions(s)).toEqual(['P-LOOP1', 'P-LOOP2'])
    expect(ids.requests(s)).toEqual(['Q5'])
  })

  it('cuts targets and freezes by unit, department, cost center and leader seat', () => {
    expect(ids.targets(scopeDatasets(data, f({ costCenter: ['1130-BLR'] }), index))).toEqual([
      'Silicon Engineering/Design Verification/1130-BLR/',
    ])
    expect(ids.targets(scopeDatasets(data, f({ businessUnit: ['Go-to-Market'] }), index))).toEqual([
      'Go-to-Market///',
    ])
    expect(ids.freezes(scopeDatasets(data, f({ leaderId: 'P-DIR2' }), index))).toEqual(['F1'])
    expect(ids.freezes(scopeDatasets(data, f({ department: ['Design Verification'] }), index))).toEqual([
      'F2',
    ])
  })

  it('keeps what it cannot place only when every filter excludes', () => {
    const exc = scopeDatasets(data, f({ leaderId: 'P-DIR1', modes: { leaderId: 'exclude' } }), index)
    expect(ids.reqs(exc)).toEqual(['R3', 'R4'])
    expect(ids.comp(exc)).toContain('E-NOBODY')
    const mixed = scopeDatasets(
      data,
      f({ leaderId: 'P-DIR1', modes: { leaderId: 'exclude' }, businessUnit: ['Go-to-Market'] }),
      index,
    )
    expect(ids.reqs(mixed)).toEqual([])
    expect(ids.comp(mixed)).not.toContain('E-NOBODY')
  })

  it('keeps the same array for a dataset no row of which is cut', () => {
    const every = [...new Set(data.positions.map((r) => r.businessUnit))]
    const s = scopeDatasets(data, f({ businessUnit: every }), index)
    expect(s.positions).toBe(data.positions)
    expect(s.assumptions).toBe(data.assumptions)
    expect(s.workers).toBe(data.workers)
    expect(scopeDatasets(data, f({ businessUnit: ['Corporate'] }), index).workers).not.toBe(data.workers)
  })

  it('fills a request’s blank fields from its seat, and lists every seat it touches', () => {
    const [q1, q2, q3, q4] = data.requests
    const seat = placementRows(data.positions, index).get('P-IC4')
    expect(requestValues(q2, seat)).toMatchObject({
      businessUnit: 'Go-to-Market',
      level: 'P6',
      location: 'Munich',
      country: 'Germany',
      currency: 'EUR',
      legalEntity: 'Northgate Semiconductor GmbH',
    })
    expect(requestValues(q1)).toMatchObject({ location: 'Bengaluru', country: 'India', currency: 'INR' })
    expect(requestPositions(q3)).toEqual(['P-DIR2', 'P-ELIM', 'P-X'])
    expect(requestPositions(q4)).toEqual(['P-IC4', 'P-MGR1'])
  })
})

describe('filters from anywhere', () => {
  it('are read field by field, anything invalid at its default', () => {
    expect(normalizeFilters(null)).toEqual(DEFAULT_FILTERS)
    const r = normalizeFilters({
      period: 't12m',
      leaderId: '',
      costCenter: ['1130-BLR', '1130-BLR', '', 7],
      currency: 'EUR',
      modes: { costCenter: 'exclude', currency: 'include', planet: 'exclude' },
    })
    expect(r.period).toBe('fy')
    expect(r.leaderId).toBeNull()
    expect(r.costCenter).toEqual(['1130-BLR'])
    expect(r.currency).toEqual([])
    expect(r.modes).toEqual({ costCenter: 'exclude' })
    for (const d of LIST_DIMENSIONS) expect(Array.isArray(r[d]), d).toBe(true)
    // Custom dates: real dates, in order, on a custom period only.
    expect(
      normalizeFilters({ period: 'custom', customStart: '2026-07-01', customEnd: '2026-09-30' }),
    ).toMatchObject({ customStart: '2026-07-01', customEnd: '2026-09-30' })
    expect(
      normalizeFilters({ period: 'custom', customStart: '2026-02-30', customEnd: '2026-09-30' }),
    ).toMatchObject({ period: 'custom', customStart: null, customEnd: null })
    expect(
      normalizeFilters({ period: 'qtd', customStart: '2026-07-01', customEnd: '2026-09-30' }).customStart,
    ).toBeNull()
  })

  it('compare equal when they pick the same records, whatever the order and idle modes', () => {
    const a = f({ level: ['P4', 'P3'], modes: { level: 'exclude', country: 'exclude' } })
    const b = f({ level: ['P3', 'P4'], modes: { level: 'exclude' } })
    expect(sameFilters(a, b)).toBe(true)
    expect(sameFilters(a, f({ level: ['P3', 'P4'] }))).toBe(false)
    expect(canonicalFilters(a).modes).toEqual({ level: 'exclude' })
    expect(dropIdleModes(a).modes).toEqual({ level: 'exclude' })
    expect(dropIdleModes(b)).toBe(b)
    expect(withMode({ level: 'exclude' }, 'currency', 'exclude')).toEqual({
      level: 'exclude',
      currency: 'exclude',
    })
    expect(withMode({ level: 'exclude' }, 'level', 'include')).toEqual({})
    expect(focusLeader(f({ leaderId: 'P-DIR1' }))).toBe('P-DIR1')
    expect(focusLeader(f({ leaderId: 'P-DIR1', modes: { leaderId: 'exclude' } }))).toBeNull()
  })
})

describe('labels and the as-of date', () => {
  const names = holderNames(data.workers, ORG_AS_OF)
  const nameOf = (id: string) => names.get(id)

  it('say the scope in plain words', () => {
    expect(scopeLabel(f({}), nameOf)).toBe('Whole company')
    expect(scopeLabel(f({ leaderId: 'P-DIR1', location: ['Munich'] }), nameOf)).toBe(
      "Dana Ito's org · Munich",
    )
    expect(
      scopeLabel(
        f({ businessUnit: ['Silicon Engineering'], location: ['Munich'], modes: { location: 'exclude' } }),
        nameOf,
      ),
    ).toBe('Silicon Engineering · not Munich')
    expect(scopeLabel(f({ leaderId: 'P-DIR2', modes: { leaderId: 'exclude' } }), nameOf)).toBe(
      "Whole company except Gil Moss's org",
    )
    expect(scopeLabel(f({ leaderId: 'P-FUT' }))).toBe('The org under P-FUT')
    // A caller's own label for the leader wins over the holder's name (review CP-10).
    const own = (id: string) => (id === 'P-DIR1' ? "Dana Ito's team" : null)
    expect(scopeLabel(f({ leaderId: 'P-DIR1', location: ['Munich'] }), nameOf, own)).toBe(
      "Dana Ito's team · Munich",
    )
    expect(scopeLabel(f({ leaderId: 'P-DIR1', modes: { leaderId: 'exclude' } }), nameOf, own)).toBe(
      "Whole company except Dana Ito's team",
    )
    expect(scopeLabel(f({ leaderId: 'P-DIR2' }), nameOf, own)).toBe("Gil Moss's org")
    expect(scopeLabel(f({ currency: ['EUR', 'INR', 'USD'] }))).toBe('EUR +2')
    expect(scopeInSentence('Whole company except Sales')).toBe('the whole company except Sales')
  })

  it('is the latest date in the data up to today, or the override', () => {
    expect(resolveAsOf(data, '2026-10-13')).toBe('2026-09-20')
    expect(resolveAsOf(data, '2026-09-15')).toBe('2026-09-10')
    expect(resolveAsOf(data, '2026-10-13', '2026-06-30')).toBe('2026-06-30')
    expect(resolveAsOf({}, '2026-10-13')).toBe('2026-10-13')
  })
})
