/**
 * The analytics context (docs/PLAN.md 9.2 and 16.2) on the generated sample: the comparison is
 * resolved once, per mode, within the shown version's fiscal year. FY28 Working has no locked
 * version, so every mode, Finance included, compares with the FY28 target; FY27 Working gives
 * Finance the FY27 Budget and everyone else the plan of record (Q1 Reforecast). An explicit
 * `vs=target` is kept, and an unknown, Working or cross-year `vs` falls back to the mode's default.
 * The mode's scope comes in as a clamp (the access layer's by default: the Acting as pick held over
 * the lists in force, whose sample source names the sample's people); the pickers are never clamped.
 * Since the M2 freeze the context also carries `access` (mode, scope, Acting as, pay and leave
 * views), `showCost`, the plan state and audit log, and `guard` (the mode's guard, the locked rules in
 * force and the last close's atom index).
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { accessClamp } from '@/access/context'
import { listsInForce, sampleListSourceOf } from '@/access/lists'
import { LEAVE_OF, type ModePicks, NO_PICKS, PAY_OF, SCOPE_OF } from '@/access/modes'
import type { UnitScope } from '@/access/scopes/types'
import { samplePicks } from '@/access/store'
import { metricsWith } from '@/metrics/testing'
import type { AnyVersion } from '@/plan/types'
import { MemoryStorage } from '@/testkit/memoryStorage'
import {
  type AnalyticsContext,
  buildContext,
  COMPARE_DEFAULT,
  type Compare,
  compareDeltaLabel,
  pickCatalog,
  resolveCompare,
  type ScopeClamp,
} from './context'
import { EMPTY_LISTS } from './lists/edit'
import { validationVocab } from './lists/effective'
import { rolePeople, unitHrbps } from './lists/roles'
import {
  cachedSample,
  FY27_BUDGET,
  FY27_Q1_REFORECAST,
  FY27_WORKING,
  FY28_WORKING,
  SAMPLE_AS_OF,
  type Sample,
} from './sample'
import { DATASET_KEYS, type DatasetKey, MODES, type Mode } from './schema'
import { DEFAULT_FILTERS, type Filters } from './scope'
import type { SourceMeta } from './store'
import { TARGET_COMPARE } from './urlScope'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
vi.stubGlobal('localStorage', new MemoryStorage())

let sample: Sample
let sources: Record<DatasetKey, SourceMeta>
let versions: readonly AnyVersion[]

beforeAll(() => {
  sample = cachedSample()
  versions = sample.plan.versions
  sources = Object.fromEntries(
    DATASET_KEYS.map((k) => [k, { kind: 'sample', rowCount: sample.datasets[k].length }]),
  ) as Record<DatasetKey, SourceMeta>
}, 120_000)

/** A context on the sample in a mode, with the pickers given. */
function ctxOf(
  mode: Mode,
  picks: { version?: string | null; compare?: string | null } = {},
  extra: { filters?: Filters; clamp?: ScopeClamp; showPay?: boolean } = {},
): AnalyticsContext {
  return buildContext({
    data: sample.datasets,
    sources,
    filters: extra.filters ?? DEFAULT_FILTERS,
    asOfOverride: null,
    today: SAMPLE_AS_OF,
    mode,
    versions,
    picks: { version: picks.version ?? null, compare: picks.compare ?? null },
    ...(extra.clamp ? { clamp: extra.clamp } : {}),
    ...(extra.showPay != null ? { showPay: extra.showPay } : {}),
  })
}

const FY28_TARGET: Compare = { kind: 'target', fiscalYear: 'FY28', label: 'FY28 target' }
const FY27_TARGET: Compare = { kind: 'target', fiscalYear: 'FY27', label: 'FY27 target' }
const BUDGET: Compare = { kind: 'version', versionId: FY27_BUDGET, fiscalYear: 'FY27', label: 'FY27 Budget' }
const PLAN_OF_RECORD: Compare = {
  kind: 'version',
  versionId: FY27_Q1_REFORECAST,
  fiscalYear: 'FY27',
  label: 'plan of record (Q1 Reforecast)',
}

describe('the comparison in the analytics context', () => {
  it('compares FY28 Working with the FY28 target in all five modes, Finance included', () => {
    expect(MODES).toHaveLength(5)
    for (const mode of MODES) {
      const ctx = ctxOf(mode, { version: FY28_WORKING })
      expect(ctx.version?.versionId, mode).toBe(FY28_WORKING)
      expect(ctx.compare, mode).toEqual(FY28_TARGET)
      expect(compareDeltaLabel(ctx.compare), mode).toBe('vs FY28 target')
    }
  })

  it("puts the shown version's fiscal year in the window the header and exports name (the M2 review, UI-3)", () => {
    for (const mode of MODES) {
      const fy28 = ctxOf(mode, { version: FY28_WORKING })
      expect(fy28.window, mode).toMatchObject({
        start: '2027-04-01',
        end: '2028-03-31',
        fiscalYear: 'FY28',
        name: 'FY28',
        label: '1 Apr 2027 – 31 Mar 2028',
      })
      expect(ctxOf(mode).window.label, mode).toBe('1 Apr 2026 – 31 Mar 2027')
      const ytd = ctxOf(mode, { version: FY28_WORKING }, { filters: { ...DEFAULT_FILTERS, period: 'ytd' } })
      expect(ytd.window, mode).toMatchObject({
        fiscalYear: 'FY28',
        empty: true,
        label: 'FY28 has not started yet',
      })
    }
  })

  it('gives FY27 Working the FY27 Budget in Finance and the plan of record (Q1 Reforecast) elsewhere', () => {
    for (const mode of MODES) {
      // FY27 Working is the default version on 30 Sep 2026; naming it is the same as leaving it out.
      for (const picks of [{}, { version: FY27_WORKING }]) {
        const ctx = ctxOf(mode, picks)
        expect(ctx.version?.versionId, mode).toBe(FY27_WORKING)
        expect(ctx.compare, mode).toEqual(mode === 'finance' ? BUDGET : PLAN_OF_RECORD)
      }
    }
    expect(compareDeltaLabel(ctxOf('finance').compare)).toBe('vs FY27 Budget')
    expect(compareDeltaLabel(ctxOf('hrbp').compare)).toBe('vs plan of record (Q1 Reforecast)')
  })

  it('keeps an explicit vs=target, in a year with locked versions and in one without', () => {
    for (const mode of MODES) {
      const fy27 = ctxOf(mode, { compare: TARGET_COMPARE })
      expect(fy27.compare, mode).toEqual(FY27_TARGET)
      expect(fy27.picks).toEqual({ version: null, compare: TARGET_COMPARE, reset: [] })
      expect(ctxOf(mode, { version: FY28_WORKING, compare: TARGET_COMPARE }).compare, mode).toEqual(
        FY28_TARGET,
      )
    }
  })

  it('keeps an explicit locked version of the same year in every mode', () => {
    expect(ctxOf('hrbp', { compare: FY27_BUDGET }).compare).toEqual(BUDGET)
    expect(ctxOf('manager', { compare: FY27_BUDGET }).compare).toEqual(BUDGET)
    expect(ctxOf('finance', { compare: FY27_Q1_REFORECAST }).compare).toEqual(PLAN_OF_RECORD)
    // A locked version shown compares with the other locked version picked.
    const shown = ctxOf('leader', { version: FY27_Q1_REFORECAST, compare: FY27_BUDGET })
    expect(shown.version?.versionId).toBe(FY27_Q1_REFORECAST)
    expect(shown.compare).toEqual(BUDGET)
  })

  it('falls back to the mode default for a cross-year, Working or unknown vs', () => {
    for (const mode of MODES) {
      // FY28 Working against FY27's Budget: not offered, so FY28's default, its target.
      const cross = ctxOf(mode, { version: FY28_WORKING, compare: FY27_BUDGET })
      expect(cross.compare, mode).toEqual(FY28_TARGET)
      expect(cross.picks, mode).toEqual({ version: FY28_WORKING, compare: null, reset: ['compare'] })
      const fy27Default = mode === 'finance' ? BUDGET : PLAN_OF_RECORD
      for (const compare of [FY27_WORKING, FY28_WORKING, 'fy26-budget']) {
        const ctx = ctxOf(mode, { compare })
        expect(ctx.compare, `${mode} vs ${compare}`).toEqual(fy27Default)
        expect(ctx.picks.reset, `${mode} vs ${compare}`).toEqual(['compare'])
      }
    }
    // An unknown version shows the default Working, and its comparison is checked against that year.
    const unknown = ctxOf('finance', { version: 'fy99-working', compare: FY27_BUDGET })
    expect(unknown.version?.versionId).toBe(FY27_WORKING)
    expect(unknown.picks).toEqual({ version: null, compare: FY27_BUDGET, reset: ['version'] })
    expect(unknown.compare).toEqual(BUDGET)
  })
})

describe('resolveCompare', () => {
  it('holds the default per mode as PLAN 8.1 lists it', () => {
    expect(COMPARE_DEFAULT).toEqual({
      manager: 'plan-of-record',
      hrbp: 'plan-of-record',
      leader: 'plan-of-record',
      finance: 'budget',
      'hr-admin': 'plan-of-record',
    })
    expect(Object.keys(COMPARE_DEFAULT).sort()).toEqual([...MODES].sort())
  })

  it('takes the latest locked version as the plan of record, and the target where a mode has no such version', () => {
    const catalog = pickCatalog(versions, SAMPLE_AS_OF)
    expect(catalog.fiscalYear).toBe('FY27')
    const none = { version: null, compare: null }
    // Before the Q1 Reforecast locked, the Budget was the plan of record and keeps its own name.
    const budgetOnly = versions.filter((v) => v.versionId !== FY27_Q1_REFORECAST)
    for (const mode of MODES)
      expect(resolveCompare(mode, none, pickCatalog(budgetOnly, SAMPLE_AS_OF), budgetOnly), mode).toEqual(
        BUDGET,
      )
    // A year with a reforecast but no Budget: Finance's default version does not exist, so its target.
    const noBudget = versions.filter((v) => v.versionId !== FY27_BUDGET)
    const noBudgetCatalog = pickCatalog(noBudget, SAMPLE_AS_OF)
    expect(resolveCompare('finance', none, noBudgetCatalog, noBudget)).toEqual(FY27_TARGET)
    expect(resolveCompare('hrbp', none, noBudgetCatalog, noBudget)).toEqual(PLAN_OF_RECORD)
    // No locked version at all: the target in every mode.
    const workingOnly = versions.filter((v) => v.state === 'working')
    for (const mode of MODES)
      expect(resolveCompare(mode, none, pickCatalog(workingOnly, SAMPLE_AS_OF), workingOnly), mode).toEqual(
        FY27_TARGET,
      )
  })

  it('is what the context holds', () => {
    const catalog = pickCatalog(versions, SAMPLE_AS_OF)
    for (const mode of MODES)
      for (const picks of [
        { version: null, compare: null },
        { version: FY28_WORKING, compare: null },
        { version: FY28_WORKING, compare: FY27_BUDGET },
        { version: null, compare: TARGET_COMPARE },
      ])
        expect(ctxOf(mode, picks).compare).toEqual(resolveCompare(mode, picks, catalog, versions))
  })
})

describe('the rest of the analytics context', () => {
  it('opens on the sample at its own date, the whole company, every dataset unscoped', () => {
    const ctx = ctxOf('hr-admin')
    expect(ctx.asOf).toBe(SAMPLE_AS_OF)
    expect(ctx.isSample).toBe(true)
    expect(ctx.isCompany).toBe(true)
    expect(ctx.scopeLabel).toBe('Whole company')
    expect(ctx.window).toMatchObject({
      preset: 'fy',
      fiscalYear: 'FY27',
      start: '2026-04-01',
      end: '2027-03-31',
    })
    expect(ctx.data).toBe(ctx.all)
    expect(ctx.versions).toBe(versions)
    expect(ctx.standard).toBe('bronze')
    for (const k of DATASET_KEYS) expect(Array.isArray(ctx.all[k]), k).toBe(true)
  })

  it('scopes by the filters, and keeps the quality index when only the filters change', () => {
    const a = ctxOf('hr-admin')
    const b = ctxOf(
      'hr-admin',
      {},
      { filters: { ...DEFAULT_FILTERS, businessUnit: ['Silicon Engineering'] } },
    )
    expect(b.isCompany).toBe(false)
    expect(b.scopeLabel).toBe('Silicon Engineering')
    expect(b.data.positions.length).toBeGreaterThan(0)
    expect(b.data.positions.length).toBeLessThan(a.data.positions.length)
    expect(b.quality).toBe(a.quality)
  })

  it('applies the clamp it is given to the filters and data, never to the pickers', () => {
    const seen: Mode[] = []
    const clamp: ScopeClamp = ({ mode, filters }) => {
      seen.push(mode)
      return {
        filters: { ...filters, businessUnit: ['Silicon Engineering'], modes: {} },
        narrow: (data) => ({ ...data, requests: [] }),
        label: 'Silicon Engineering (unit)',
        scoped: true,
      }
    }
    const ctx = ctxOf('hrbp', { version: FY28_WORKING, compare: TARGET_COMPARE }, { clamp })
    expect(seen).toEqual(['hrbp'])
    expect(ctx.filters.businessUnit).toEqual(['Silicon Engineering'])
    expect(ctx.data.requests).toEqual([])
    expect(ctx.all.requests.length).toBeGreaterThan(0)
    expect(ctx.data.positions.every((p) => p.businessUnit === 'Silicon Engineering')).toBe(true)
    expect(ctx.scopeLabel).toBe('Silicon Engineering (unit)')
    expect(ctx.isCompany).toBe(false)
    expect(ctx.picks).toEqual({ version: FY28_WORKING, compare: TARGET_COMPARE, reset: [] })
    expect(ctx.compare).toEqual(FY28_TARGET)
  })

  it('shows pay amounts only in HR admin with the switch on', () => {
    for (const mode of MODES) {
      expect(ctxOf(mode, {}, { showPay: true }).showPay, mode).toBe(mode === 'hr-admin')
      expect(ctxOf(mode).showPay, mode).toBe(false)
    }
  })
})

describe('the access and guard parts of the context (M2 freeze)', () => {
  const build = (
    mode: Mode,
    extra: {
      showPay?: boolean
      actingAs?: ModePicks
      clamp?: ScopeClamp
      withPlan?: boolean
      metrics?: ReturnType<typeof metricsWith>
    } = {},
  ): AnalyticsContext =>
    buildContext({
      data: sample.datasets,
      sources,
      filters: DEFAULT_FILTERS,
      asOfOverride: null,
      today: SAMPLE_AS_OF,
      mode,
      ...(extra.withPlan ? { plan: sample.plan } : { versions }),
      ...(extra.showPay != null ? { showPay: extra.showPay } : {}),
      ...(extra.actingAs ? { actingAs: extra.actingAs } : {}),
      ...(extra.clamp ? { clamp: extra.clamp } : {}),
      ...(extra.metrics ? { metrics: extra.metrics } : {}),
    })

  it("binds the mode's pay and leave views, its pick and the switch to ctx.access", () => {
    for (const mode of MODES) {
      const ctx = build(mode, { showPay: true })
      expect(ctx.access.mode, mode).toBe(mode)
      expect(ctx.access.pay, mode).toBe(PAY_OF[mode])
      expect(ctx.access.leave, mode).toBe(LEAVE_OF[mode])
      // No pick given: a scoped mode holds an empty scope, never the company (8.2).
      if (SCOPE_OF[mode]) {
        expect(ctx.access.scope?.kind, mode).toBe(SCOPE_OF[mode])
        expect(ctx.access.scope?.positionIds.size, mode).toBe(0)
        expect(ctx.access.unset, mode).toBe(true)
        expect(ctx.data.positions, mode).toEqual([])
      } else {
        expect(ctx.access.scope, mode).toBeNull()
        expect(ctx.access.unset, mode).toBe(false)
      }
      expect(ctx.access.actingAs, mode).toBeNull()
      expect(ctx.access.switchOn, mode).toBe(mode === 'hr-admin')
      expect(ctx.showCost, mode).toBe(mode !== 'manager')
    }
    const pick = { personId: 'E10077', name: 'Ana Ruiz', unit: 'Silicon Engineering' }
    const ctx = build('hrbp', { actingAs: { ...NO_PICKS, hrbp: pick } })
    expect(ctx.access.actingAs).toEqual(pick)
    expect(build('finance', { actingAs: { ...NO_PICKS, hrbp: pick } }).access.actingAs).toBeNull()
  })

  it("holds the mode's Acting as pick through the access layer's clamp by default", () => {
    const picks = samplePicks(sample.personas)
    const hrbp = build('hrbp', { actingAs: picks })
    expect(hrbp.access.unset).toBe(false)
    expect(hrbp.access.scope).toMatchObject({ kind: 'unit', unit: 'Silicon Engineering' })
    expect(hrbp.filters.businessUnit).toEqual(['Silicon Engineering'])
    expect(hrbp.scopeLabel).toBe('Silicon Engineering')
    expect(hrbp.isCompany).toBe(false)
    const manager = build('manager', { actingAs: picks })
    expect(manager.access.scope?.kind).toBe('tree')
    expect(manager.access.actingAs).toEqual(picks.manager)
    // The same as passing the access layer's clamp by hand.
    const lists = listsInForce(null, sample.datasets, sources)
    const byHand = build('manager', { actingAs: picks, clamp: accessClamp(picks, lists) })
    expect(byHand.access.scope).toBe(manager.access.scope)
    expect(byHand.data.positions).toEqual(manager.data.positions)
    // A filter change keeps the same position tree and the same scope.
    const ytd = buildContext({
      data: sample.datasets,
      sources,
      filters: { ...DEFAULT_FILTERS, period: 'ytd' },
      asOfOverride: null,
      today: SAMPLE_AS_OF,
      mode: 'manager',
      actingAs: picks,
      versions,
    })
    expect(ytd.positionIndex).toBe(manager.positionIndex)
    expect(ytd.access.scope).toBe(manager.access.scope)
  })

  it("passes validationVocab the sample's people: the unit HRBPs and the HR admin and Finance personas", () => {
    const ctx = buildContext({
      data: sample.datasets,
      sources,
      filters: DEFAULT_FILTERS,
      asOfOverride: null,
      today: SAMPLE_AS_OF,
      mode: 'hr-admin',
      versions,
      lists: EMPTY_LISTS,
    })
    const source = sampleListSourceOf(sample)
    expect(ctx.quality.vocab).toBe(validationVocab(EMPTY_LISTS, sources, source))
    const persona = (key: string) => sample.personas.find((p) => p.key === key)!.employeeId
    expect(source.people?.roles).toEqual({
      'HR admin': [persona('hr-admin')],
      Finance: [persona('finance-fpa')],
    })
    for (const [unit, idx] of sample.world.hrbp)
      expect(source.people?.hrbp?.[unit], unit).toBe(sample.world.people[idx].id)
    const lists = listsInForce(EMPTY_LISTS, sample.datasets, sources)
    expect(unitHrbps(lists).get('Silicon Engineering')).toBe(persona('hrbp-se'))
    expect(rolePeople(lists, 'Finance')).toEqual([persona('finance-fpa')])
    expect(rolePeople(lists, 'HR admin')).toEqual([persona('hr-admin')])
  })

  it('takes the scope and the unset pick from the clamp it is given', () => {
    const scope: UnitScope = {
      kind: 'unit',
      unit: 'Silicon Engineering',
      positionIds: new Set(),
      personIds: new Set(),
      otherDepartments: new Set(),
      leaderPositionIds: new Set(),
      size: 0,
      label: 'Silicon Engineering',
    }
    const ctx = build('hrbp', { clamp: ({ filters }) => ({ filters, scope, unset: true, scoped: true }) })
    expect(ctx.access.scope).toBe(scope)
    expect(ctx.access.unset).toBe(true)
  })

  it("resolves the guard's mode per mode and switch, and reads its rules from the dictionary", () => {
    expect(MODES.map((m) => build(m).guard.mode)).toEqual(['none', 'rounded', 'rounded', 'exact', 'exact'])
    expect(build('hr-admin', { showPay: true }).guard.mode).toBe('open')
    expect(build('finance').guard.rules).toEqual({ minCosted: 5, floorUsd: 100_000, minContributors: 5 })
    const raised = metricsWith({ 'cost.guard.minCosted': { min: 8 } })
    expect(build('finance', { metrics: raised }).guard.rules.minCosted).toBe(8)
  })

  it('reads the atom index from the last close, else at the last month-end on or before the as-of date', () => {
    const last = [...sample.plan.closes].sort((a, b) => (a.month < b.month ? -1 : 1)).at(-1)!
    const withPlan = build('hrbp', { withPlan: true })
    expect(withPlan.plan).toBe(sample.plan)
    expect(withPlan.versions).toBe(sample.plan.versions)
    expect(withPlan.guard.atoms).toBe(last.atoms)
    const without = build('hrbp')
    expect(without.plan).toBeNull()
    expect(without.audit).toEqual([])
    expect(without.guard.atoms.closeDate).toBe('2026-09-30')
    expect(without.guard.atoms.atoms.length).toBeGreaterThan(0)
    expect(build('leader').guard.atoms).toBe(without.guard.atoms)
  })
})
