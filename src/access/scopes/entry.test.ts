/**
 * Every way into the filters keeps to the scope (docs/PLAN.md 8.2 and 16.2; the template app's
 * entry.test and managerScope.test), with the data store and the mode connection on the sample:
 * entering the mode, `setFilters` (a link's filters, a saved view's, Filter to and Leave out all
 * reach the store this way), `resetFilters`, an exclusion, and the context built from the store's
 * filters (every row inside). For Manager and Leader (`tree`), HRBP (`unit`) and Finance's
 * dimensions. Also: every mode change turns "Show pay amounts" off; leaving a scope releases what it
 * pinned, so every next mode opens on its own whole scope; and a filter another mode left that would
 * empty the scope is dropped (the M2 review, B2). The address writer's Back and Forward are the
 * shell's, which goes through the same store guard.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { type AnalyticsContext, buildContext } from '@/data/context'
import { cachedSample, SAMPLE_AS_OF, type Sample } from '@/data/sample'
import { DATASET_KEYS, type DatasetKey } from '@/data/schema'
import { DEFAULT_FILTERS, type Filters, isExcluded } from '@/data/scope'
import type { SourceMeta } from '@/data/store'
import { MemoryStorage } from '@/testkit/memoryStorage'
import { NOT_SECURITY_SHORT } from '../copy'
import type { Mode } from '../modes'
import { inScope, positionInScope } from './records'
import type { TreeScope, UnitScope } from './types'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
vi.stubGlobal('localStorage', new MemoryStorage())

type Store = typeof import('@/data/store')
type Modes = typeof import('../store')
type Connect = typeof import('../connect')
let S: Store
let M: Modes
let C: Connect
let sample: Sample
let sources: Record<DatasetKey, SourceMeta>
let stop: () => void = () => undefined
const notices: { title: string; description?: string; action?: { label: string; onClick: () => void } }[] = []

const SE = 'Silicon Engineering'

beforeAll(async () => {
  S = await import('@/data/store')
  M = await import('../store')
  C = await import('../connect')
  sample = cachedSample()
  S.setSampleSource({ data: () => sample.datasets, asOf: SAMPLE_AS_OF })
  sources = Object.fromEntries(
    DATASET_KEYS.map((k) => [k, { kind: 'sample', rowCount: sample.datasets[k].length }]),
  ) as Record<DatasetKey, SourceMeta>
  S.useStore.setState({ data: sample.datasets, sources, ready: true })
  stop = C.connectAccess({ notify: (n) => notices.push(n) })
}, 60_000)

afterAll(() => {
  stop()
  vi.unstubAllGlobals()
})

const filters = (): Filters => S.useStore.getState().filters
const st = () => S.useStore.getState()

/** The context the app would build now, from the stores. */
function liveCtx(): AnalyticsContext {
  const m = M.useMode.getState()
  return buildContext({
    data: sample.datasets,
    sources,
    filters: filters(),
    asOfOverride: null,
    today: SAMPLE_AS_OF,
    mode: m.mode,
    actingAs: m.actingAs,
    versions: sample.plan.versions,
  })
}

interface Case {
  mode: Mode
  /** The store's filters are inside the scope. */
  inside: (f: Filters) => boolean
}

const CASES: Case[] = [
  {
    mode: 'manager',
    inside: (f) => {
      const s = C.liveScope() as TreeScope
      return (
        !!f.leaderId &&
        !isExcluded(f, 'leaderId') &&
        (s.rootPositionIds.has(f.leaderId) || s.positionIds.has(f.leaderId))
      )
    },
  },
  {
    mode: 'leader',
    inside: (f) => {
      const s = C.liveScope() as TreeScope
      return (
        !!f.leaderId &&
        !isExcluded(f, 'leaderId') &&
        (s.rootPositionIds.has(f.leaderId) || s.positionIds.has(f.leaderId))
      )
    },
  },
  {
    mode: 'hrbp',
    inside: (f) => {
      const s = C.liveScope() as UnitScope
      return (
        f.businessUnit.length === 1 &&
        f.businessUnit[0] === SE &&
        !isExcluded(f, 'businessUnit') &&
        f.department.every((d) => !s.otherDepartments.has(d)) &&
        (!f.leaderId || s.leaderPositionIds.has(f.leaderId))
      )
    },
  },
  {
    mode: 'finance',
    inside: (f) =>
      !f.leaderId &&
      !f.department.length &&
      !f.location.length &&
      !f.level.length &&
      !Object.keys(f.modes).length,
  },
]

function expectInside(c: Case, how: string): void {
  const f = filters()
  expect(c.inside(f), `${c.mode}: ${how} ${JSON.stringify(f)}`).toBe(true)
  const ctx = liveCtx()
  expect(ctx.filters, `${c.mode}: ${how}`).toEqual(f)
  for (const p of ctx.data.positions)
    expect(positionInScope(p.positionId, ctx.access), `${c.mode}: ${how}`).toBe(true)
  for (const r of ctx.data.requests)
    expect(inScope('requests', r, ctx), `${c.mode}: ${how} ${r.requestId}`).toBe(true)
}

/** A seat outside every scope here: one in Corporate, away from the trees and the unit. */
const outsideSeat = () =>
  sample.datasets.positions.find((p) => p.businessUnit === 'Corporate' && p.level === 'E1')?.positionId ??
  null

describe('every way into the filters keeps to the scope', () => {
  for (const c of CASES)
    it(`${c.mode}: entering, setFilters, a link's filters, an exclusion, Filter to, Leave out and reset`, () => {
      M.useMode.getState().setMode('hr-admin')
      st().setFilters(
        { ...DEFAULT_FILTERS, businessUnit: ['Corporate'], location: ['Munich'], level: ['P4'], modes: {} },
        { history: 'push' },
      )
      M.useMode.getState().setMode(c.mode)
      expect(M.useMode.getState().mode).toBe(c.mode)
      expectInside(c, 'entering')

      st().setFilters({
        businessUnit: ['Corporate', 'Operations'],
        location: ['Munich'],
        modes: { location: 'exclude' },
      })
      expectInside(c, 'setFilters')
      st().setFilters({ leaderId: outsideSeat(), department: ['Facilities'] })
      expectInside(c, 'a link with a leader and a department outside')
      st().setFilters({ leaderId: outsideSeat(), modes: { leaderId: 'exclude' } }, { history: 'push' })
      expectInside(c, 'a saved view that excludes a leader')
      st().setFilters({ businessUnit: [SE], modes: { businessUnit: 'exclude' } })
      expectInside(c, 'an address that excludes the unit')
      st().setFilters({ location: ['Hsinchu'] }, { history: 'push' })
      expectInside(c, 'Filter to a site')
      st().setFilters({ location: ['Hsinchu'], modes: { location: 'exclude' } }, { history: 'push' })
      expectInside(c, 'Leave out a site')
      st().resetFilters()
      expectInside(c, 'resetFilters')

      // Leaving for HR admin lifts the scope: its values stay as ordinary filters.
      M.useMode.getState().setMode('hr-admin')
      st().resetFilters()
      expect(filters()).toEqual({ ...DEFAULT_FILTERS, modes: {} })
    })

  it('turns pay amounts off on every mode change', () => {
    M.useMode.getState().setMode('hr-admin')
    st().setShowPay(true)
    M.useMode.getState().setMode('finance')
    expect(st().showPay).toBe(false)
    M.useMode.getState().setMode('hr-admin')
    st().setShowPay(true)
    M.useMode.getState().choose('manager', M.useMode.getState().actingAs.manager!)
    expect(st().showPay).toBe(false)
    M.useMode.getState().setMode('hr-admin')
  })

  it('releases what a scoped mode pinned when leaving it, and names the new mode', () => {
    const hrbp = M.useMode.getState().actingAs.hrbp!
    M.useMode.getState().choose('hrbp', hrbp)
    expect(notices.at(-1)).toMatchObject({
      title: 'HRBP: Silicon Engineering',
      description: NOT_SECURITY_SHORT,
    })
    M.useMode.getState().setMode('hr-admin')
    expect(notices.at(-1)).toMatchObject({ title: 'HR admin mode', description: NOT_SECURITY_SHORT })
    expect(notices.at(-1)?.action).toBeUndefined()
    expect(filters().businessUnit).toEqual([])
    M.useMode.getState().setMode('finance')
    expect(notices.at(-1)?.description).toContain(
      'Finance mode filters by unit, cost center, legal entity, country and currency',
    )
    expect(notices.at(-1)?.description).toContain(NOT_SECURITY_SHORT)
    M.useMode.getState().setMode('hr-admin')
    st().resetFilters()
  })

  it("names the Mode button's text on entering a scoped mode", () => {
    const leader = M.useMode.getState().actingAs.leader!
    M.useMode.getState().choose('leader', leader)
    expect(notices.at(-1)?.title).toBe(`Leader: ${leader.name}`)
    expect(C.liveAccess()).toMatchObject({ mode: 'leader', unset: false, actingAs: leader })
    expect(C.waitingForPick()).toBe(false)
    M.useMode.getState().setMode('hr-admin')
    st().resetFilters()
  })

  /** The filters and positions a mode opens with from HR admin's defaults: its own whole scope. */
  function fresh(mode: Mode): { f: Filters; positions: number } {
    M.useMode.getState().setMode('hr-admin')
    st().resetFilters()
    M.useMode.getState().setMode(mode)
    return { f: filters(), positions: liveCtx().data.positions.length }
  }

  for (const next of ['manager', 'leader', 'finance', 'hr-admin'] as const)
    it(`shows ${next}'s own whole scope after HRBP, never the unit HRBP pinned (the M2 review, B2)`, () => {
      const want = fresh(next)
      expect(want.positions, next).toBeGreaterThan(0)
      M.useMode.getState().setMode('hr-admin')
      st().resetFilters()
      M.useMode.getState().setMode('hrbp')
      expect(filters().businessUnit).toEqual([SE])
      M.useMode.getState().setMode(next)
      expect(filters(), next).toEqual(want.f)
      expect(liveCtx().data.positions.length, next).toBe(want.positions)
      M.useMode.getState().setMode('hr-admin')
      st().resetFilters()
    })

  it('drops a filter another mode left that would empty the scope, on entering and on a link', () => {
    M.useMode.getState().setMode('hr-admin')
    st().resetFilters()
    // HR admin narrows to Silicon Engineering by hand; Manager A's team is in Go-to-Market.
    st().setFilters({ businessUnit: [SE] }, { history: 'push' })
    M.useMode.getState().setMode('manager')
    const s = C.liveScope() as TreeScope
    expect(filters().businessUnit).toEqual([])
    expect(filters().leaderId && s.rootPositionIds.has(filters().leaderId as string)).toBe(true)
    expect(liveCtx().data.positions.length).toBeGreaterThan(0)
    // A link (or a restored address) with the unit outside the team is clamped the same way.
    st().setFilters({ businessUnit: [SE] }, { history: 'push' })
    expect(filters().businessUnit).toEqual([])
    M.useMode.getState().setMode('hr-admin')
    st().resetFilters()
  })

  it("lists who each mode can act as, the sample's persona first", () => {
    const persona = (key: string) => sample.personas.find((p) => p.key === key)!
    const hrbp = C.liveActingAsOptions('hrbp')
    expect(hrbp.length).toBe(6)
    expect(hrbp[0]).toMatchObject({
      persona: true,
      pick: { personId: persona('hrbp-se').employeeId, unit: SE },
    })
    expect(hrbp[0].line).toMatch(/^Silicon Engineering · [0-9,]+ people$/)
    const leaders = C.liveActingAsOptions('leader')
    expect(leaders[0]).toMatchObject({ persona: true, company: false })
    expect(leaders.filter((r) => r.company).map((r) => r.pick.personId)).toContain(
      persona('leader-cfo').employeeId,
    )
    expect(leaders.filter((r) => r.company).length).toBe(3)
    const managers = C.liveActingAsOptions('manager').map((r) => r.pick.personId)
    expect(managers[0]).toBe(persona('manager-a').employeeId)
    for (const key of ['manager-b', 'manager-c']) expect(managers, key).toContain(persona(key).employeeId)
    const finance = C.liveActingAsOptions('finance')
    expect(finance.map((r) => r.pick.personId)).toEqual([persona('finance-fpa').employeeId])
    expect(C.liveActingAsOptions('hr-admin')[0].pick.personId).toBe(persona('hr-admin').employeeId)
  })
})
