/**
 * "Filter to this" (docs/PLAN.md 9.2 and 9.5; the template app's tests): Focus on's merge, the
 * records panel's narrowing and when it offers its actions, the action labels, the chart-kit
 * helper, and the invariant on producers over the sample (Filled heads by location, department,
 * level and unit), from the default scope and from inside other filters. The small-exclusion rule
 * counts Filled heads (9.2: an exclusion that removes 1 to 4 Filled heads cannot be picked). A tree
 * scope never offers leaving out a leader; the mode decides each action.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { byGroup, withFilter } from '@/charts/kit/groupDrill'
import type { AnalyticsContext } from '@/data/context'
import type { PositionRow, WorkerRow } from '@/data/schema'
import {
  buildPositionIndex,
  DEFAULT_FILTERS,
  type Filters,
  isActiveOn,
  type ListDimension,
  placementRows,
  positionValues,
  workerValues,
} from '@/data/scope'
import { minGroupOf } from '@/metrics/privacy'
import { headsIn } from './exclusion'
import {
  canLeaveOut,
  filterActionLabels,
  filterInData,
  groupFilter,
  groupScopes,
  mergeFilter,
  namedScopeLabel,
  narrowFilters,
  periodFilter,
} from './filter'
import { expectDrillSums, expectFilterTo, expectLeaveOut, rescopeContext } from './testing'
import { drillContext } from './testkit'
import { type DrillSource, drillSpec, resolveDrill } from './types'

// The clamp is the access layer's; here it keeps every scope (a scoped mode's own rule is tested there).
vi.mock('@/access/lock', () => ({ clampFilters: (f: Filters) => f }))

const f = (patch: Partial<Filters> = {}): Filters => ({ ...DEFAULT_FILTERS, modes: {}, ...patch })

describe('Focus on', () => {
  it('replaces the dimension’s values and mode and keeps the other filters', () => {
    const cur = f({
      period: 'ytd',
      businessUnit: ['Silicon Engineering'],
      location: ['Hsinchu', 'Munich'],
      modes: { location: 'exclude' },
    })
    const to = mergeFilter(cur, { location: ['Bengaluru'] }, 'include')
    expect(to).toMatchObject({
      period: 'ytd',
      businessUnit: ['Silicon Engineering'],
      location: ['Bengaluru'],
    })
    expect(to.modes).toEqual({})
    // A leader replaces the leader; a period replaces the period.
    const lead = mergeFilter(f({ leaderId: 'P-1', modes: { leaderId: 'exclude' } }), { leaderId: 'P-2' })
    expect(lead).toMatchObject({ leaderId: 'P-2', modes: {} })
    const month = mergeFilter(cur, {
      ...groupFilter('department', 'Layout'),
      ...periodFilter('2026-09-01', '2026-09-30'),
    })
    expect(month).toMatchObject({
      period: 'custom',
      customStart: '2026-09-01',
      customEnd: '2026-09-30',
      department: ['Layout'],
      location: ['Hsinchu', 'Munich'],
    })
    // A filter's own modes apply without an explicit mode (findings' "Focus on").
    expect(mergeFilter(cur, { level: ['P1'], modes: { level: 'exclude' } }).modes).toEqual({
      location: 'exclude',
      level: 'exclude',
    })
  })

  it('names the actions after the group, and offers Leave out for one group of one dimension', () => {
    const nameOf = (id: string) => (id === 'P-7' ? 'Dana Ito' : undefined)
    expect(filterActionLabels({ location: ['Bengaluru'] }, nameOf)).toEqual({
      filterTo: 'Filter to Bengaluru',
      leaveOut: 'Leave out Bengaluru',
    })
    expect(filterActionLabels({ leaderId: 'P-7' }, nameOf)).toEqual({
      filterTo: "Filter to Dana Ito's org",
      leaveOut: "Leave out Dana Ito's org",
    })
    expect(filterActionLabels({ leaderId: 'P-9' }, nameOf).filterTo).toBe('Filter to The org under P-9')
    expect(filterActionLabels({ level: ['P4'] }, nameOf).filterTo).toBe('Filter to P4 Senior')
    expect(filterActionLabels({ costCenter: ['1110-SJC'] }, nameOf).leaveOut).toBe('Leave out 1110-SJC')
    // A drill's own name for its group wins over its values.
    expect(filterActionLabels({ level: ['P1', 'P2', 'P3'] }, nameOf, 'P1-P3')).toEqual({
      filterTo: 'Filter to P1-P3',
      leaveOut: 'Leave out P1-P3',
    })
    expect(filterActionLabels(periodFilter('2026-09-01', '2026-09-30'), nameOf)).toEqual({
      filterTo: 'Filter to Sep 2026',
      leaveOut: null,
    })
    expect(filterActionLabels(periodFilter('2026-07-01', '2026-09-30'), nameOf).filterTo).toBe(
      'Filter to FY27 Q2',
    )
    expect(canLeaveOut({ businessUnit: ['A'], department: ['B'] })).toBe(false)
  })

  it('names the group in the new scope when a dimension holds exactly its values', () => {
    const nameOf = () => undefined
    const juniors = ['P1', 'P2', 'P3']
    const out = f({ level: [...juniors].reverse(), modes: { level: 'exclude' } })
    expect(namedScopeLabel(out, { level: juniors }, nameOf, 'P1-P3')).toBe('Whole company except P1-P3')
    expect(namedScopeLabel(out, { level: juniors }, nameOf)).toBe('Whole company except P3 +2')
    const band = f({
      businessUnit: ['Silicon Engineering'],
      department: ['Layout'],
      level: ['P1', 'P2', 'P3'],
    })
    expect(
      namedScopeLabel(band, { department: ['Layout'], level: ['P3', 'P2', 'P1'] }, nameOf, 'Layout P1-P3'),
    ).toBe('Silicon Engineering · Layout P1-P3')
  })

  it('makes no filter for rows that are not a group', () => {
    expect(groupFilter('location', 'Other (4)')).toBeUndefined()
    expect(groupFilter('location', 'Not recorded')).toBeUndefined()
    expect(groupFilter('department', 'Not set')).toBeUndefined()
    expect(groupFilter('businessUnit', 'Unallocated')).toBeUndefined()
    expect(groupFilter('level', '')).toBeUndefined()
    expect(groupFilter('level', null)).toBeUndefined()
    expect(groupFilter('level', ['P1', 'Other'])).toBeUndefined()
    expect(groupFilter('level', ['P1', 'P2'])).toEqual({ level: ['P1', 'P2'] })
    expect(groupFilter('leaderId', 'P-1')).toEqual({ leaderId: 'P-1' })
  })
})

describe('the records panel narrows the scope you are in', () => {
  // P-1 leads P-2 and P-4; P-2 leads P-3.
  const seat = (positionId: string, managerPositionId: string | null): PositionRow => ({
    positionId,
    effectiveDate: '2025-04-01',
    status: 'Filled',
    level: 'P3',
    businessUnit: 'Silicon Engineering',
    costCenter: '1110-SJC',
    location: 'San Jose',
    managerPositionId,
  })
  const index = buildPositionIndex(
    [seat('P-1', null), seat('P-2', 'P-1'), seat('P-3', 'P-2'), seat('P-4', 'P-1')],
    '2026-09-30',
  )
  const loc = (values: string[], exclude = false) =>
    f({ location: values, modes: exclude ? { location: 'exclude' } : {} })
  const lead = (id: string, exclude = false) =>
    f({ leaderId: id, modes: exclude ? { leaderId: 'exclude' } : {} })

  it('Leave out takes the group away from a list that is already filtered', () => {
    expect(
      narrowFilters(loc(['San Jose', 'Bengaluru']), { location: ['Bengaluru'] }, 'leaveOut', index),
    ).toMatchObject({
      location: ['San Jose'],
      modes: {},
    })
    expect(narrowFilters(loc(['Bengaluru']), { location: ['Bengaluru'] }, 'leaveOut', index)).toBeNull()
    expect(
      narrowFilters(loc(['Hsinchu'], true), { location: ['Bengaluru'] }, 'leaveOut', index),
    ).toMatchObject({
      location: ['Hsinchu', 'Bengaluru'],
      modes: { location: 'exclude' },
    })
    expect(
      narrowFilters(f({ period: 'ytd', level: ['P4'] }), { location: ['Bengaluru'] }, 'leaveOut', index),
    ).toMatchObject({
      period: 'ytd',
      level: ['P4'],
      location: ['Bengaluru'],
      modes: { location: 'exclude' },
    })
    expect(narrowFilters(f(), periodFilter('2026-09-01', '2026-09-30'), 'leaveOut', index)).toBeNull()
    expect(narrowFilters(f(), { businessUnit: ['A'], department: ['B'] }, 'leaveOut', index)).toBeNull()
  })

  it('Filter to keeps what is in both the scope and the group', () => {
    expect(
      narrowFilters(loc(['San Jose', 'Bengaluru']), { location: ['Bengaluru'] }, 'filterTo', index),
    ).toMatchObject({
      location: ['Bengaluru'],
      modes: {},
    })
    expect(
      narrowFilters(
        loc(['Hsinchu'], true),
        { location: ['Bengaluru', 'Hsinchu', 'Munich'] },
        'filterTo',
        index,
      ),
    ).toMatchObject({ location: ['Bengaluru', 'Munich'], modes: {} })
    expect(narrowFilters(loc(['Hsinchu'], true), { location: ['Hsinchu'] }, 'filterTo', index)).toBeNull()
    expect(narrowFilters(loc(['San Jose']), { location: ['Bengaluru'] }, 'filterTo', index)).toBeNull()
    expect(
      narrowFilters(
        f({ level: ['P4'] }),
        { ...groupFilter('department', 'Layout'), ...periodFilter('2026-09-01', '2026-09-30') },
        'filterTo',
        index,
      ),
    ).toMatchObject({
      period: 'custom',
      customStart: '2026-09-01',
      customEnd: '2026-09-30',
      department: ['Layout'],
      level: ['P4'],
    })
    expect(
      narrowFilters(f(), { level: ['P1'], modes: { level: 'exclude' } }, 'filterTo', index),
    ).toMatchObject({
      level: ['P1'],
      modes: { level: 'exclude' },
    })
  })

  it('keeps to what one leader filter can say, over the position tree', () => {
    expect(narrowFilters(lead('P-1'), { leaderId: 'P-2' }, 'filterTo', index)).toMatchObject({
      leaderId: 'P-2',
      modes: {},
    })
    expect(narrowFilters(lead('P-1'), { leaderId: 'P-2' }, 'leaveOut', index)).toBeNull()
    expect(narrowFilters(lead('P-2'), { leaderId: 'P-1' }, 'filterTo', index)).toMatchObject({
      leaderId: 'P-2',
    })
    expect(narrowFilters(lead('P-2'), { leaderId: 'P-4' }, 'filterTo', index)).toBeNull()
    expect(narrowFilters(lead('P-2'), { leaderId: 'P-1' }, 'leaveOut', index)).toBeNull()
    expect(narrowFilters(lead('P-2', true), { leaderId: 'P-4' }, 'filterTo', index)).toMatchObject({
      leaderId: 'P-4',
      modes: {},
    })
    expect(narrowFilters(lead('P-2', true), { leaderId: 'P-1' }, 'filterTo', index)).toBeNull()
    expect(narrowFilters(lead('P-2', true), { leaderId: 'P-3' }, 'filterTo', index)).toBeNull()
    expect(narrowFilters(lead('P-3', true), { leaderId: 'P-2' }, 'leaveOut', index)).toMatchObject({
      leaderId: 'P-2',
      modes: { leaderId: 'exclude' },
    })
    expect(narrowFilters(lead('P-2', true), { leaderId: 'P-4' }, 'leaveOut', index)).toBeNull()
  })
})

describe('the chart-kit helper', () => {
  it('sets the filter once for every mark, built on click, and keeps a period the spec sets', () => {
    let built = 0
    const make = byGroup('location', 'site', (d: { site: string; n: number }) => {
      if (!d.n) return null
      return () => {
        built++
        return drillSpec({
          kind: 'positions',
          title: d.site,
          rows: [],
          filter: periodFilter('2026-09-01', '2026-09-30'),
        })
      }
    })
    const src = make({ site: 'Bengaluru', n: 3 })
    expect(built).toBe(0)
    expect(resolveDrill(src)?.filter).toEqual({
      period: 'custom',
      customStart: '2026-09-01',
      customEnd: '2026-09-30',
      location: ['Bengaluru'],
      modes: {},
    })
    expect(make({ site: 'Bengaluru', n: 0 })).toBeNull()
    expect(resolveDrill(make({ site: 'Other (3)', n: 3 }))?.filter).toEqual(
      periodFilter('2026-09-01', '2026-09-30'),
    )
    expect(
      withFilter(drillSpec({ kind: 'positions', title: 'x', rows: [] }), undefined).filter,
    ).toBeUndefined()
  })
})

/* ───────────── producers over the sample ───────────── */

interface HeadsRow {
  label: string
  heads: number
  rows: WorkerRow[]
}

/** Filled heads on the as-of date by a dimension of the seat they hold (not in plan: their own fields). */
function headsBy(x: AnalyticsContext, dim: ListDimension): HeadsRow[] {
  const place = placementRows(x.all.positions, x.positionIndex)
  const by = new Map<string, WorkerRow[]>()
  const seen = new Set<string>()
  for (const w of x.data.workers) {
    if (w.workerType !== 'Employee' || seen.has(w.employeeId)) continue
    const start = w.assignmentStart || w.hireDate
    if (!start || !isActiveOn({ start, end: w.assignmentEnd || w.terminationDate || null }, x.asOf)) continue
    seen.add(w.employeeId)
    const seat = w.positionId ? place.get(w.positionId) : undefined
    const v = (seat ? positionValues(seat) : workerValues(w))[dim]
    if (!v) continue
    const list = by.get(v)
    if (list) list.push(w)
    else by.set(v, [w])
  }
  return [...by].map(([label, rows]) => ({ label, heads: rows.length, rows }))
}

const headsDrill = (dim: ListDimension) =>
  byGroup(
    dim,
    'label',
    (r: HeadsRow): DrillSource =>
      () =>
        drillSpec({ kind: 'workers', title: r.label, rows: r.rows }),
  )

describe('the invariant on producers over the sample', () => {
  let ctx: AnalyticsContext
  beforeAll(() => {
    ctx = drillContext('hr-admin')
  }, 120_000)

  it('heads by location, department, level and unit: Filter to keeps N, Leave out removes it', () => {
    for (const dim of ['location', 'department', 'level', 'businessUnit'] as const) {
      const c = {
        name: `heads by ${dim}`,
        rows: (x: AnalyticsContext) => headsBy(x, dim),
        key: (r: HeadsRow) => r.label,
        value: (r: HeadsRow) => r.heads,
        drill: (r: HeadsRow) => headsDrill(dim)(r),
      }
      expectDrillSums(ctx, c)
      expectFilterTo(ctx, c, { sample: 3, variants: dim === 'location' })
      expectLeaveOut(ctx, c, { sample: 2, variants: dim === 'level' })
    }
    // From inside another scope too: the merge keeps the other filters.
    const narrowed = rescopeContext(ctx, f({ period: 'ytd', level: ['P1'], modes: { level: 'exclude' } }))
    expectFilterTo(
      narrowed,
      {
        name: 'heads by location, not P1',
        rows: (x) => headsBy(x, 'location'),
        key: (r) => r.label,
        value: (r) => r.heads,
        drill: (r) => headsDrill('location')(r),
      },
      { sample: 3 },
    )
  })

  it('offers neither action for the whole scope, and no Leave out that singles out 1 to 4 heads', () => {
    const min = minGroupOf(ctx.metrics)
    const all = headsIn(ctx.all, f(), ctx.positionIndex)
    const index = ctx.positionIndex
    const size = (id: string) => headsIn(ctx.all, f({ leaderId: id }), index)
    const top = [...index.byId.keys()]
      .filter((id) => !index.byId.get(id)?.managerPositionId)
      .sort((a, b) => size(b) - size(a))[0]
    expect(groupScopes(ctx, { leaderId: top })).toEqual({ filterTo: null, leaveOut: null })
    let small = 0
    let checked = 0
    for (const id of index.children.keys()) {
      if (checked > 60 && small > 0) break
      checked++
      const removed = all - headsIn(ctx.all, f({ leaderId: id, modes: { leaderId: 'exclude' } }), index)
      const scopes = groupScopes(ctx, { leaderId: id })
      if (removed > 0 && removed < min) {
        small++
        expect(scopes.leaveOut, id).toBeNull()
      } else if (removed >= min && removed < all) expect(scopes.leaveOut, id).not.toBeNull()
    }
    expect(small).toBeGreaterThan(0)
    for (const r of headsBy(ctx, 'location'))
      if (r.heads < min) expect(groupScopes(ctx, { location: [r.label] }).leaveOut, r.label).toBeNull()
  })

  it('inside a leader’s org, offers Filter to a sub-org and no Leave out of the scope’s root', () => {
    const index = ctx.positionIndex
    const withTree = (id: string) =>
      (index.children.get(id) ?? []).filter((r) => index.children.has(r.positionId))
    const size = (id: string) => headsIn(ctx.all, f({ leaderId: id }), index)
    const top = [...index.byId.keys()]
      .filter((id) => !index.byId.get(id)?.managerPositionId)
      .sort((a, b) => size(b) - size(a))[0]
    const [leadRow] = withTree(top).sort((a, b) => size(b.positionId) - size(a.positionId))
    const subRow = withTree(leadRow.positionId).find(
      (r) => size(r.positionId) > 0 && size(r.positionId) < size(leadRow.positionId),
    )
    expect(subRow).toBeDefined()
    const lead = leadRow.positionId
    const sub = subRow?.positionId as string
    const inLead = rescopeContext(ctx, f({ leaderId: lead }))
    const scopes = groupScopes(inLead, { leaderId: sub })
    expect(scopes.filterTo).toMatchObject({ leaderId: sub, modes: {} })
    expect(scopes.leaveOut).toBeNull()
    const without = rescopeContext(ctx, f({ leaderId: lead, modes: { leaderId: 'exclude' } }))
    expect(groupScopes(without, { leaderId: top }).filterTo).toBeNull()
    expect(groupScopes(without, { leaderId: sub }).filterTo).toBeNull()
  })

  it('never offers leaving out a leader in a tree scope, and follows the mode’s decisions', () => {
    const index = ctx.positionIndex
    const id = [...index.children.keys()].find((p) => {
      const n = headsIn(ctx.all, f({ leaderId: p }), index)
      return n >= 10 && n < 200
    }) as string
    expect(groupScopes(ctx, { leaderId: id }).leaveOut).not.toBeNull()
    const tree = {
      ...ctx,
      access: {
        ...ctx.access,
        mode: 'leader' as const,
        scope: { kind: 'tree', label: "Dana Ito's org" } as unknown as AnalyticsContext['access']['scope'],
      },
    }
    expect(groupScopes(tree, { leaderId: id }).leaveOut).toBeNull()
    const noLeave = drillContext('hr-admin', {
      access: { hidden: ['focus:leave-out', 'focus:leave-out-leader'] },
    })
    const loc = headsBy(noLeave, 'location').find((r) => r.heads >= 20) as HeadsRow
    const scopes = groupScopes(noLeave, { location: [loc.label] })
    expect(scopes.leaveOut).toBeNull()
    expect(scopes.filterTo).not.toBeNull()
    const noFilter = drillContext('hr-admin', { access: { hidden: ['focus:filter-to'] } })
    expect(groupScopes(noFilter, { location: [loc.label] }).filterTo).toBeNull()
  })

  it('offers no Filter to whose scope would leave a small group out by comparison', () => {
    const min = minGroupOf(ctx.metrics)
    const index = ctx.positionIndex
    const all = headsIn(ctx.all, f(), index)
    const sites = headsBy(ctx, 'location').map((r) => r.label)
    let found = 0
    for (const id of index.children.keys()) {
      if (found >= 2) break
      const out = f({ leaderId: id, modes: { leaderId: 'exclude' } })
      const removed = all - headsIn(ctx.all, out, index)
      if (removed < min || removed > all / 3) continue
      const scoped = rescopeContext(ctx, out)
      for (const site of sites) {
        const inSite = headsIn(ctx.all, f({ location: [site] }), index)
        const left = headsIn(ctx.all, { ...out, location: [site] }, index)
        if (left === 0 || inSite - left <= 0 || inSite - left >= min) continue
        expect(groupScopes(scoped, { location: [site] }).filterTo, `${id} ${site}`).toBeNull()
        found++
      }
    }
    expect(found).toBeGreaterThan(0)
  })

  it('only offers the actions for values in the loaded data', () => {
    const vocab = { hasLeader: (id: string) => ctx.positionIndex.byId.has(id), hasValue: () => false }
    expect(filterInData({ location: ['Atlantis'] }, vocab)).toBe(false)
    expect(filterInData(periodFilter('2026-09-01', '2026-09-30'), vocab)).toBe(true)
    expect(filterInData({ leaderId: 'P-NOPE' }, vocab)).toBe(false)
  })
})
