import { describe, expect, it } from 'vitest'
import { ID as PLAN, PARAM as PLAN_PARAM } from '@/views/plan/metrics'
import { PARAM as REQUESTS_PARAM } from '@/views/requests/metrics'
import { PARAM as TEAM_PARAM } from '@/views/team/metrics'
import {
  defaultMetrics,
  definitionOf,
  definitionsStamp,
  kpiTarget,
  metricIdOf,
  metricsApi,
  targetStatus,
} from './api'
import { CATALOG } from './catalog'
import { COST_GUARD_METRICS, costGuardOf, FLOOR_USD, MIN_CONTRIBUTORS, MIN_COSTED } from './costGuard'
import { defineMetrics } from './define'
import { applyEdit, applyEdits, EMPTY_METRICS } from './overrides'
import { ANONYMITY, LEAVE_COUNTS, minGroupOf, minLeaveCountOf, PRIVACY_METRICS } from './privacy'
import { QUALITY_METRICS, QUALITY_RULES } from './quality'
import { catalogOf, validateCatalog } from './registry'
import { EXITS, FIXTURE, FIXTURE_DEFS, LOADS } from './test-fixtures'
import { metricsWith, paramRef, paramsOfView, recordParamReads } from './testing'
import type { MetricEdit, MetricsState } from './types'

const withEdits = (...edits: Parameters<typeof applyEdits>[2]): MetricsState => {
  const r = applyEdits(EMPTY_METRICS, FIXTURE, edits)
  if (r.rejected.length) throw new Error(r.rejected[0].error)
  return r.state
}

describe('ctx.metrics', () => {
  it('returns the defaults when nothing was changed', () => {
    const m = defaultMetrics()
    expect(m).toBe(metricsApi(EMPTY_METRICS))
    expect(m.num(ANONYMITY.metricId, ANONYMITY.key)).toBe(5)
    expect(minGroupOf(m)).toBe(5)
    expect(minLeaveCountOf(m)).toBe(5)
    expect(m.num(TEAM_PARAM.atRiskShare.metricId, TEAM_PARAM.atRiskShare.key)).toBe(0.02)
    expect(m.num(PLAN_PARAM.noReqDays.metricId, PLAN_PARAM.noReqDays.key)).toBe(45)
    expect(m.num(REQUESTS_PARAM.waitingDays.metricId, REQUESTS_PARAM.waitingDays.key)).toBe(5)
    expect(m.num(REQUESTS_PARAM.idleDays.metricId, REQUESTS_PARAM.idleDays.key)).toBe(60)
    expect(m.num(REQUESTS_PARAM.leaderThresholdUsd.metricId, REQUESTS_PARAM.leaderThresholdUsd.key)).toBe(
      250_000,
    )
    expect(m.num(REQUESTS_PARAM.backfillWindowDays.metricId, REQUESTS_PARAM.backfillWindowDays.key)).toBe(30)
    expect(costGuardOf(m)).toEqual({ minCosted: 5, floorUsd: 100_000, minContributors: 5 })
    expect(m.num(QUALITY_RULES.fill.metricId, QUALITY_RULES.fill.key)).toBe(0.95)
    expect(m.changedCount).toBe(0)
    expect(m.changes).toEqual([])
    // Every registered setting reads back as its default.
    for (const d of CATALOG.list) for (const p of d.params) expect(m.param(d.id, p.key)).toEqual(p.default)
  })

  it('gives the same object for the same state, and a new one only when the state changes', () => {
    const s = withEdits({ metricId: LOADS, field: 'params.loadBudget', value: 0.04 })
    const a = metricsApi(s, FIXTURE)
    expect(metricsApi(s, FIXTURE)).toBe(a)
    expect(a.param(LOADS, 'loadBudget')).toBe(0.04)
    expect(a.param(LOADS, 'loadBudget')).toBe(a.param(LOADS, 'loadBudget'))
    const noop = applyEdit(s, FIXTURE, { metricId: LOADS, field: 'params.loadBudget', value: 0.04 })
    expect(noop.ok && metricsApi(noop.state, FIXTURE)).toBe(a)
    // The cost guard's settings stay put for one dictionary state.
    const raised = metricsWith({ [MIN_COSTED.metricId]: { [MIN_COSTED.key]: 8 } })
    expect(costGuardOf(raised)).toBe(costGuardOf(raised))
    expect(costGuardOf(raised).minCosted).toBe(8)
    expect(costGuardOf(defaultMetrics()).minCosted).toBe(5)
  })

  it('merges your wording and target over the default definition', () => {
    const s = withEdits(
      { metricId: EXITS, field: 'definition', value: 'Exits as a share of average heads.' },
      { metricId: EXITS, field: 'formula', value: '' },
      { metricId: EXITS, field: 'target', value: { value: 0.07, comparator: '<=' } },
    )
    const m = metricsApi(s, FIXTURE)
    const d = m.def(EXITS)!
    expect(d.definition).toBe('Exits as a share of average heads.')
    expect(d).not.toHaveProperty('formula')
    expect(d.population).toBe('Employees only; contractors and interns excluded.')
    expect(m.target(EXITS)).toEqual({ value: 0.07, comparator: '<=' })
    expect(m.defaultDef(EXITS)!.definition).toContain('Employees who left')
    expect(m.isChanged(EXITS)).toBe(true)
    expect(m.isChanged(LOADS)).toBe(false)
    expect(m.changedFields(EXITS)).toEqual(['definition', 'formula', 'target'])
    expect(m.changedCount).toBe(1)
    expect(m.list.find((x) => x.id === EXITS)).toBe(d)
    expect(m.def('missing')).toBeUndefined()
    const removed = metricsApi(withEdits({ metricId: EXITS, field: 'target', value: null }), FIXTURE)
    expect(removed.target(EXITS)).toBeNull()
    expect(removed.def(EXITS)).not.toHaveProperty('target')
  })

  it('types its settings and throws for unknown ones', () => {
    const m = metricsApi(EMPTY_METRICS, FIXTURE)
    expect(m.flag(EXITS, 'annualize')).toBe(true)
    expect(m.choice(EXITS, 'cohort')).toBe('hris')
    expect(m.ratings(LOADS, 'uplift')[5]).toBe(0.06)
    expect(m.range(LOADS, 'healthyBand')).toEqual([0.9, 1.1])
    expect(m.paramDef(LOADS, 'reviewUsd')?.format).toBe('moneyFull')
    expect(() => m.num(EXITS, 'annualize')).toThrow('is not a number')
    expect(() => m.param('missing', 'x')).toThrow('Unknown metric "missing"')
    expect(() => m.param(EXITS, 'missing')).toThrow('has no setting "missing"')
    // Values handed out can't be changed by an engine.
    expect(Object.isFrozen(m.ratings(LOADS, 'uplift'))).toBe(true)
  })

  it('records which settings an engine reads', () => {
    const { metrics, reads } = recordParamReads(metricsApi(EMPTY_METRICS, FIXTURE))
    metrics.num(LOADS, 'loadBudget')
    metrics.param(EXITS, 'firstYearDays')
    expect([...reads]).toEqual([paramRef(LOADS, 'loadBudget'), paramRef(EXITS, 'firstYearDays')])
    expect(() => metricsWith({ [LOADS]: { loadBudget: 2 } }, FIXTURE)).toThrow('Load budget')
    // The guard's reads go through the dictionary too.
    const guard = recordParamReads(defaultMetrics())
    costGuardOf(guard.metrics)
    expect([...guard.reads].sort()).toEqual(
      [
        paramRef(MIN_COSTED.metricId, MIN_COSTED.key),
        paramRef(FLOOR_USD.metricId, FLOOR_USD.key),
        paramRef(MIN_CONTRIBUTORS.metricId, MIN_CONTRIBUTORS.key),
      ].sort(),
    )
  })

  it('lists each view’s settings, for the settings-read test of each view', () => {
    // The rules list several views and start at the one whose engine reads them; a view's own
    // entries are the ones under its prefix (as the template's view tests filter them).
    const own = (v: Parameters<typeof paramsOfView>[0]) =>
      paramsOfView(v).filter((r) => r.startsWith(`${v}.`))
    expect(own('team')).toEqual([paramRef(TEAM_PARAM.atRiskShare.metricId, 'atRiskShare')])
    expect(own('plan')).toEqual([paramRef(PLAN.openingsNoReq, 'days')])
    expect(own('requests')).toEqual(Object.values(REQUESTS_PARAM).map((r) => paramRef(r.metricId, r.key)))
    for (const v of ['forecast', 'targets', 'whatif', 'finance', 'audit'] as const)
      expect(own(v), v).toEqual([])
    // Every rule's setting has a home view.
    const homed = ['plan', 'forecast', 'data'].flatMap((v) => paramsOfView(v as 'plan'))
    for (const d of [...PRIVACY_METRICS, ...COST_GUARD_METRICS, ...QUALITY_METRICS])
      for (const p of d.params) expect(homed, d.id).toContain(paramRef(d.id, p.key))
  })
})

describe('helpers for the shared UI', () => {
  it('words definitions, the export stamp and target status', () => {
    const m = metricsApi(withEdits({ metricId: EXITS, field: 'owner', value: 'Finance team' }), FIXTURE)
    expect(definitionOf(m, EXITS)).toEqual({
      term: 'Attrition',
      text: 'Employees who left in the window, as a share of average heads, annualized.',
      formula: 'exits ÷ average heads × (12 ÷ window months)',
      metricId: EXITS,
    })
    expect(definitionOf(m, LOADS)).toEqual({
      term: 'Standard loads',
      text: 'Loads as a share of the band midpoint.',
      metricId: LOADS,
    })
    expect(metricIdOf(definitionOf(m, LOADS)!)).toBe(LOADS)
    expect(metricIdOf({ term: 'Written by hand', text: 'x' })).toBeNull()
    expect(definitionOf(m, 'missing')).toBeNull()
    expect(definitionsStamp(m)).toBe('Definitions changed from defaults: 1 (see Metric definitions)')
    expect(definitionsStamp(defaultMetrics())).toBeNull()
    const t = m.target(EXITS)
    expect(targetStatus(0.07, t)).toBe('met')
    expect(targetStatus(0.08, t)).toBe('met')
    expect(targetStatus(0.09, t)).toBe('missed')
    expect(targetStatus(0.9, { value: 0.9, comparator: '>=' })).toBe('met')
    expect(targetStatus(null, t)).toBeNull()
    expect(targetStatus(0.1, null)).toBeNull()
    // "Under" misses at the target itself.
    expect(targetStatus(0.02, { value: 0.02, comparator: '<' })).toBe('missed')
    expect(targetStatus(0.019, { value: 0.02, comparator: '<' })).toBe('met')
  })

  it("judges a KPI against its target only in the metric's own unit", () => {
    const m = metricsApi(EMPTY_METRICS, FIXTURE)
    expect(kpiTarget(m, EXITS, 0.09, 'pct')).toEqual({
      target: { value: 0.08, comparator: '<=' },
      status: 'missed',
    })
    expect(kpiTarget(m, EXITS, 0.07, 'pct0')?.status).toBe('met')
    // A count on a rate metric's tile, no metric, no target or no value: no status.
    expect(kpiTarget(m, EXITS, 12, 'int')).toBeNull()
    expect(kpiTarget(m, null, 0.07, 'pct')).toBeNull()
    expect(kpiTarget(m, LOADS, 0.03, 'pct2')).toBeNull()
    expect(kpiTarget(m, EXITS, null, 'pct')).toBeNull()
  })
})

describe('what a number depends on', () => {
  const HEADS = 'plan.heads.share'
  const COST = 'plan.cost.share'
  const RULE = 'plan.rules.floor'
  const DEPS = catalogOf([
    ...FIXTURE_DEFS.filter((d) => d.id !== ANONYMITY.metricId),
    ...defineMetrics('plan', [
      {
        id: HEADS,
        name: 'Exit share',
        definition: 'Exits as a share of heads.',
        unit: 'pct',
        goodDirection: 'down',
        uses: ['workers.terminationDate'],
        dependsOn: [EXITS],
      },
      {
        id: COST,
        name: 'Cost share',
        definition: 'A cost amount over a share of heads.',
        unit: 'money',
        goodDirection: null,
        uses: ['comp.baseSalary'],
        dependsOn: [HEADS, EXITS, MIN_COSTED.metricId],
      },
      {
        id: RULE,
        name: 'Material change',
        definition: 'A floor.',
        unit: 'pts',
        goodDirection: null,
        uses: [],
        kind: 'setting',
      },
    ]),
    ...PRIVACY_METRICS,
    ...COST_GUARD_METRICS,
    ...QUALITY_METRICS,
  ])
  const at = (edits: MetricEdit[]) => {
    const r = applyEdits(EMPTY_METRICS, DEPS, edits, { at: '2026-10-01T00:00:00.000Z' })
    expect(r.rejected).toEqual([])
    return metricsApi(r.state, DEPS)
  }

  it('follows dependencies through, then adds the anonymity minimum for numbers from data', () => {
    expect(validateCatalog(DEPS.list)).toEqual([])
    const m = metricsApi(EMPTY_METRICS, DEPS)
    expect(m.sourcesOf(COST)).toEqual([COST, HEADS, EXITS, MIN_COSTED.metricId, ANONYMITY.metricId])
    expect(m.sourcesOf(EXITS)).toEqual([EXITS, ANONYMITY.metricId])
    // A setting or a rule reads no data, so no anonymity minimum is behind it.
    expect(m.sourcesOf(RULE)).toEqual([RULE])
    expect(m.sourcesOf(MIN_COSTED.metricId)).toEqual([MIN_COSTED.metricId])
    expect(m.sourcesOf('missing')).toEqual([])
    expect(m.changesBehind(COST)).toEqual([])
  })

  it('marks a number changed by a setting registered on another metric, but not by its wording', () => {
    const m = at([
      { metricId: EXITS, field: 'params.annualize', value: false },
      { metricId: EXITS, field: 'definition', value: 'Ours.' },
    ])
    expect(m.isChanged(COST)).toBe(false)
    expect(m.changesBehind(COST)).toEqual([{ metricId: EXITS, fields: ['params.annualize'], role: 'source' }])
    expect(m.changesBehind(EXITS)).toEqual([
      { metricId: EXITS, fields: ['definition', 'params.annualize'], role: 'self' },
    ])
  })

  it('marks cost when a guard rule is raised, and every number from data for the anonymity minimum or a quality rule', () => {
    const m = at([
      { metricId: MIN_COSTED.metricId, field: `params.${MIN_COSTED.key}`, value: 7 },
      { metricId: ANONYMITY.metricId, field: `params.${ANONYMITY.key}`, value: 8 },
      { metricId: QUALITY_RULES.fill.metricId, field: `params.${QUALITY_RULES.fill.key}`, value: 0.9 },
    ])
    expect(m.changesBehind(COST)).toEqual([
      { metricId: MIN_COSTED.metricId, fields: [`params.${MIN_COSTED.key}`], role: 'source' },
      { metricId: ANONYMITY.metricId, fields: [`params.${ANONYMITY.key}`], role: 'source' },
      { metricId: QUALITY_RULES.fill.metricId, fields: [`params.${QUALITY_RULES.fill.key}`], role: 'rule' },
    ])
    expect(m.changesBehind(HEADS)).toEqual([
      { metricId: ANONYMITY.metricId, fields: [`params.${ANONYMITY.key}`], role: 'source' },
      { metricId: QUALITY_RULES.fill.metricId, fields: [`params.${QUALITY_RULES.fill.key}`], role: 'rule' },
    ])
    expect(m.changesBehind(RULE)).toEqual([])
    expect(m.num(LEAVE_COUNTS.metricId, LEAVE_COUNTS.key)).toBe(5)
  })

  it('adds the fields a setting brings in to the lineage while it has that value', () => {
    const LINE = catalogOf(
      defineMetrics('plan', [
        {
          id: 'plan.openings.ageFrom',
          name: 'Opening age',
          definition: 'Days since a seat opened.',
          unit: 'days',
          goodDirection: 'down',
          uses: ['positions.openedDate', 'positions.status'],
          usesWhen: [
            {
              setting: { key: 'from' },
              value: 'req',
              uses: ['reqs.openedDate', 'positions.status'],
            },
          ],
          params: [
            {
              key: 'from',
              label: 'Opened from',
              description: 'Where the age is counted from.',
              type: 'choice',
              default: 'seat',
              choices: [
                { value: 'seat', label: 'The seat’s opened date' },
                { value: 'req', label: 'The req’s opened date' },
              ],
            },
          ],
        },
      ]),
    )
    const id = 'plan.openings.ageFrom'
    expect(metricsApi(EMPTY_METRICS, LINE).usesOf(id)).toEqual(['positions.openedDate', 'positions.status'])
    const r = applyEdit(EMPTY_METRICS, LINE, { metricId: id, field: 'params.from', value: 'req' })
    if (!r.ok) throw new Error(r.error)
    expect(metricsApi(r.state, LINE).usesOf(id)).toEqual([
      'positions.openedDate',
      'positions.status',
      'reqs.openedDate',
    ])
    expect(metricsApi(r.state, LINE).def(id)?.uses).toContain('reqs.openedDate')
    expect(validateCatalog(LINE.list)).toEqual([])
    expect(
      validateCatalog([
        { ...LINE.list[0], usesWhen: [{ setting: { key: 'nope' }, value: 1, uses: [] }], dependsOn: [id] },
      ]),
    ).toEqual([`${id}: its lineage follows ${id} nope, which is not a setting.`, `${id}: depends on itself.`])
  })
})
