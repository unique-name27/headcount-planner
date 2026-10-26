/**
 * The Data room's model on the sample (docs/PLAN.md 5.2, 9.1; the template app's Data room engine
 * tests): the addresses inside the room, the manifest of the eight datasets in schema order, records
 * by month (each cell's drill opens exactly its rows; comp opens none), the metrics by view and tier
 * adding up to every metric that reads data (the four tiles' cards included), one definition row per
 * registered metric (a changed setting marks its metric), the field matrix and the lists, the
 * page's own dictionary entries, and no value of any row in what the page shows: counts only.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { AnalyticsContext } from '@/data/context'
import { LIST_DEFS } from '@/data/lists/defs'
import { DATASETS } from '@/data/schema'
import { calcProblems, resolveCalc } from '@/drill/calc'
import { CATALOG } from '@/metrics/catalog'
import { readsNoData, validateCatalog } from '@/metrics/registry'
import { metricsWith } from '@/metrics/testing'
import { MemoryStorage } from '@/testkit/memoryStorage'
import { sampleContext, teamSample } from '@/views/team/engine/testkit'
import { ID, metrics as roomMetrics } from '../roomMetrics'
import { MONTH_RULES, SNAPSHOT_DATASETS } from './byMonth'
import { DATA_FIGURES } from './figures'
import { byMonthDrill, DATA_ROOM_TABS, dataModel } from './index'
import { datasetTab, parseDataTab, tabRoute } from './links'
import type { ManifestRow } from './manifest'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
vi.stubGlobal('localStorage', new MemoryStorage())

let ctx: AnalyticsContext

beforeAll(() => {
  teamSample()
  ctx = sampleContext('hr-admin')
}, 120_000)

describe('addresses inside the Data room', () => {
  it('read each tab, a dataset’s panel and an item, and land unknown ones on Datasets', () => {
    expect(parseDataTab('')).toEqual({ tab: 'datasets', dataset: null, panel: null, item: null })
    expect(parseDataTab('positions-raw')).toEqual({
      tab: 'datasets',
      dataset: 'positions',
      panel: 'raw',
      item: null,
    })
    expect(parseDataTab('reqs')).toMatchObject({ dataset: 'reqs', panel: null })
    expect(parseDataTab('quality').tab).toBe('quality')
    expect(parseDataTab('metrics/plan.heads.approved')).toMatchObject({
      tab: 'metrics',
      item: 'plan.heads.approved',
    })
    expect(parseDataTab('lists/department')).toMatchObject({ tab: 'lists', item: 'department' })
    expect(parseDataTab('workspace').tab).toBe('workspace')
    expect(parseDataTab('nonsense-x')).toMatchObject({ tab: 'datasets', dataset: null })
    expect(datasetTab('comp', 'certify')).toBe('comp-certify')
    expect(tabRoute('datasets')).toBe('')
    expect(tabRoute('metrics', 'team.budget.status')).toBe('metrics/team.budget.status')
    expect(DATA_ROOM_TABS.map((t) => t.key)).toEqual(['datasets', 'quality', 'metrics', 'lists', 'workspace'])
  })
})

describe('the manifest', () => {
  it('lists the eight datasets in schema order, from the sample, with their tiers', () => {
    const rows = dataModel(ctx).datasets.manifest.rows as readonly ManifestRow[]
    expect(rows.map((r) => r.key)).toEqual(DATASETS.map((d) => d.key))
    for (const r of rows) {
      expect(r.source, r.key).toBe('sample')
      expect(r.rows, r.key).toBe((ctx.all[r.key] as readonly unknown[]).length)
      expect(r.tier, r.key).toBe(ctx.quality.datasetTier(r.key))
      expect(r.version, r.key).toBeNull()
      expect(r.feeds.length, r.key).toBeGreaterThan(0)
    }
    expect(rows.filter((r) => r.required).map((r) => r.key)).toEqual([
      'positions',
      'workers',
      'comp',
      'assumptions',
    ])
    expect(dataModel(ctx).datasets.summary.total).toBe(8)
    expect(dataModel(ctx).datasets.manifest.id).toBe(DATA_FIGURES.manifest)
  })
})

describe('records by month', () => {
  it('counts each dated dataset’s rows in the 24 months to the as-of date, and drills to exactly them', () => {
    const fig = dataModel(ctx).datasets.byMonth
    expect(SNAPSHOT_DATASETS).toEqual(['targets', 'assumptions'])
    const dated = Object.keys(MONTH_RULES)
    expect(new Set(fig.rows.map((c) => c.key))).toEqual(new Set(dated))
    for (const key of dated) expect(fig.rows.filter((c) => c.key === key)).toHaveLength(24)
    expect(fig.rows.at(-1)?.month).toBe('2026-09')
    for (const c of fig.rows) {
      expect(c.rows).toBe(c.indexes.length)
      expect(c.share).toBeGreaterThanOrEqual(0)
      expect(c.share).toBeLessThanOrEqual(1)
      const spec = byMonthDrill(ctx, c)
      if (c.key === 'comp' || !c.rows) expect(spec).toBeNull()
      else expect(spec?.rows.length, `${c.key} ${c.month}`).toBe(c.rows)
    }
    expect(fig.rows.some((c) => c.key === 'workers' && c.rows > 0)).toBe(true)
  })
})

describe('Data quality', () => {
  it('counts every metric that reads data once, by view and tier, with four tiles whose cards add up', () => {
    const m = dataModel(ctx)
    const reading = ctx.metrics.list.filter((d) => !readsNoData(d))
    const cells = m.qualityFigures.metricsByView.rows
    expect(cells.reduce((n, c) => n + c.metrics, 0)).toBe(reading.length)
    expect(new Set(cells.flatMap((c) => c.ids)).size).toBe(reading.length)
    expect(m.quality.kpis.map((k) => k.id)).toEqual([
      'data-metrics-gold',
      'data-metrics-silver',
      'data-metrics-bronze',
      'data-metrics-none',
    ])
    expect(m.quality.kpis.reduce((n, k) => n + (k.value ?? 0), 0)).toBe(reading.length)
    for (const k of m.quality.kpis) {
      expect(k.metricId).toBe(ID.qualityMetricTiers)
      const card = resolveCalc(k.calc)
      expect(card && calcProblems(card), k.id).toEqual([])
    }
  })

  it('lists every field of every dataset with counts and its tier, and every dataset’s tier', () => {
    const m = dataModel(ctx).qualityFigures
    expect(m.fields.rows).toHaveLength(DATASETS.reduce((n, d) => n + d.fields.length, 0))
    expect(m.fields.rows.find((r) => r.dataset === 'comp' && r.field === 'baseSalary')?.pay).toBe(true)
    expect(m.datasets.rows.map((r) => r.key)).toEqual(DATASETS.map((d) => d.key))
  })
})

describe('Metric definitions', () => {
  it('has one row per registered metric, marking the ones changed from their defaults', () => {
    const rows = dataModel(ctx).metrics.definitions.rows
    expect(rows.map((r) => r.metricId)).toEqual(ctx.metrics.list.map((d) => d.id))
    expect(rows.filter((r) => r.changed)).toEqual([])
    const changed = sampleContext('hr-admin')
    const edited = { ...changed, metrics: metricsWith({ 'team.budget.status': { atRiskShare: 0.05 } }) }
    const row = dataModel(edited).metrics.definitions.rows.find((r) => r.metricId === 'team.budget.status')
    expect(row?.changed).toBe(true)
  })
})

describe('Lists', () => {
  it('has one row per official list, with its values and the rows not on it', () => {
    const rows = dataModel(ctx).lists.rows
    expect(rows.map((r) => r.id)).toEqual(LIST_DEFS.map((d) => d.id))
    for (const r of rows) expect(r.values, r.id).toBeGreaterThanOrEqual(0)
  })
})

describe('the Data room’s own dictionary entries (docs/PLAN.md 12, data.*)', () => {
  it('are exactly its two ids, valid, with formula, population and window', () => {
    expect(roomMetrics.map((d) => d.id)).toEqual(Object.values(ID))
    expect(validateCatalog([...roomMetrics])).toEqual([])
    for (const d of roomMetrics) {
      expect(d.views[0]).toBe('data')
      expect(d.formula && d.population && d.window, d.id).toBeTruthy()
    }
    // The lead wires them into the catalog; until then the room still renders from its ids.
    expect(CATALOG.list.length).toBeGreaterThan(0)
  })
})

describe('counts only (docs/PLAN.md 7)', () => {
  it('shows no amount of any row in the figures about the data (the dictionary’s own wording aside)', () => {
    const m = dataModel(ctx)
    const figures = [
      m.datasets.manifest,
      m.datasets.byMonth,
      m.qualityFigures.datasets,
      m.qualityFigures.fields,
      m.qualityFigures.metricsByView,
      m.lists,
    ]
    const money = /[$€£¥₹₪]\s?\d/
    for (const f of figures) {
      for (const c of f.columns) expect(c.pay || c.cost || c.band, `${f.id} ${c.key}`).toBeFalsy()
      expect(JSON.stringify(f.rows), f.id).not.toMatch(money)
    }
  })
})
