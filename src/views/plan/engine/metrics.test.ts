/**
 * The Plan view in the metric dictionary (docs/PLAN.md 12; the template app's metrics.test): its
 * entries pass the catalog checks, every tile, figure and finding links to a registered metric with
 * the dictionary's wording, every <Figure> in ui/ names its metric, lineage and definitions, and the
 * one setting the view registers (`plan.openings.noReq#days`) is read through `ctx.metrics` and
 * changes the numbers built on it.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { invalidRefs } from '@/data/quality/fieldRef'
import { defaultMetrics } from '@/metrics/api'
import { CATALOG } from '@/metrics/catalog'
import { validateCatalog } from '@/metrics/registry'
import { metricsWith, paramRef, paramsOfView, recordParamReads } from '@/metrics/testing'
import { ID, metrics, PARAM } from '../metrics'
import { type PlanModel, planHeadline, planModel } from '.'
import { planActions } from './actions'
import { sample, sampleCtx } from './fixtures'

const IDS = Object.values(ID) as string[]
/** The settings of the view's own entries (the rule entries list the view among theirs). */
const own = () =>
  paramsOfView('plan')
    .filter((r) => r.startsWith('plan.'))
    .sort()

beforeAll(() => {
  sample()
}, 60_000)

const tiles = (m: PlanModel) => [
  ...m.overview.kpis,
  ...m.positions.kpis,
  ...m.openings.kpis,
  ...m.transfers.kpis,
]
const figures = (m: PlanModel) => [
  m.overview.headsByMonth,
  m.overview.headsByUnit,
  m.overview.positionsByStatus,
  m.overview.costByUnit,
  m.overview.openingsByStage,
  m.positions.grid,
  m.openings.byStage,
  m.openings.byAge,
  m.openings.table,
  m.transfers.table,
]

describe('the Plan entries', () => {
  it('pass the catalog checks and are the catalog’s own', () => {
    expect(validateCatalog(metrics)).toEqual([])
    for (const d of metrics) {
      expect(CATALOG.byId.get(d.id), d.id).toBe(d)
      expect(d.views[0]).toBe('plan')
      expect(invalidRefs(d.uses), d.id).toEqual([])
    }
    expect(metrics.map((d) => d.id).sort()).toEqual([...IDS].sort())
  })

  it('name every setting the engine reads, and register no other', () => {
    expect(own()).toEqual([paramRef(PARAM.noReqDays.metricId, PARAM.noReqDays.key)])
  })
})

describe('every tile, figure and finding links to a registered metric', () => {
  const scopes = [
    { mode: 'hr-admin' as const, filters: {} },
    { mode: 'hr-admin' as const, filters: { businessUnit: ['Silicon Engineering'] } },
    { mode: 'finance' as const, filters: {} },
    { mode: 'hrbp' as const, filters: {} },
    { mode: 'leader' as const, filters: {} },
    { mode: 'manager' as const, filters: {} },
  ]
  it.each(scopes.map((s) => [`${s.mode} ${JSON.stringify(s.filters)}`, s] as const))('under %s', (_, s) => {
    const ctx = sampleCtx(s.mode, { filters: s.filters })
    const m = planModel(ctx)
    for (const k of tiles(m)) {
      expect(IDS, k.id).toContain(k.metricId)
      expect(k.definition, k.id).toBe(ctx.metrics.def(k.metricId as string)?.definition)
    }
    for (const f of figures(m)) expect(IDS, f.id).toContain(f.metric)
    for (const f of m.overview.findings) expect(IDS, f.id).toContain(f.metricId)
  })

  it('links the folder-tab headline to approved heads', () => {
    const h = planHeadline(sampleCtx('hr-admin'))
    expect(h.metricId).toBe(ID.headsApproved)
    expect(h.value).toBe('1,610')
    expect(h.uses?.length).toBeGreaterThan(0)
  })

  const dir = fileURLToPath(new URL('../ui', import.meta.url))
  const ui = readdirSync(dir)
    .filter((f) => f.endsWith('.tsx'))
    .map((f) => ({ file: f, text: readFileSync(join(dir, f), 'utf8') }))

  it('gives every <Figure> its metric, lineage and dictionary definitions', () => {
    let n = 0
    for (const { file, text } of ui) {
      const count = text.split('<Figure').length - 1
      n += count
      expect(text.split('metric={').length - 1, file).toBe(count)
      expect(text.split('uses={').length - 1, file).toBe(count)
      expect(text.split('definitions={definitionsOf(').length - 1, file).toBe(count)
      expect(text, file).not.toMatch(/definitions=\{\[\s*\{/)
      for (const [, key] of text.matchAll(/\bID\.(\w+)/g))
        expect(Object.keys(ID), `${file}: ID.${key}`).toContain(key)
      for (const [, id] of text.matchAll(/id="([a-z0-9-]+)"/g))
        expect(id.startsWith('plan-'), `${file}: ${id}`).toBe(true)
    }
    // Ten from M2, M3's two (Plan > Positions' changes in Working and Plan > Transfers' drafts), and
    // Plan > Hiring's three (open to hire by quarter, its bar chart and hiring velocity; 9.7, C36).
    expect(n).toBe(15)
  })
})

describe('the setting is read through the dictionary', () => {
  it('reads plan.openings.noReq#days while computing the view, its headline and its items', () => {
    const { metrics: recorded, reads } = recordParamReads(defaultMetrics())
    const ctx = sampleCtx('hr-admin', { metrics: recorded })
    planModel(ctx)
    planHeadline(ctx)
    planActions(ctx)
    expect(own().filter((r) => !reads.has(r))).toEqual([])
    // The cost guard's rules too, instead of constants.
    expect(reads.has(paramRef('cost.guard.minCosted', 'min'))).toBe(true)
  })

  it('changes the count it decides', () => {
    const tile = (days: number) =>
      planModel(
        sampleCtx('hr-admin', { metrics: metricsWith({ [PARAM.noReqDays.metricId]: { days } }) }),
      ).openings.kpis.find((k) => k.metricId === ID.openingsNoReq)?.value
    const narrow = tile(10) as number
    const wide = tile(120) as number
    expect(wide).toBeGreaterThan(narrow)
    expect(tile(45)).toBe(
      planModel(sampleCtx('hr-admin')).openings.kpis.find((k) => k.metricId === ID.openingsNoReq)?.value,
    )
  })
})
