/**
 * The Forecast view in the metric dictionary (docs/PLAN.md 12): its entries pass the catalog checks
 * and are the catalog's own; every tile, figure and finding links to a registered metric with the
 * dictionary's wording; every <Figure> in ui/ names its metric, lineage and definitions; and the
 * engine reads the cost guard's rules through the dictionary (the view registers no setting of its
 * own: its drivers are assumptions data).
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { invalidRefs } from '@/data/quality/fieldRef'
import { defaultMetrics } from '@/metrics/api'
import { CATALOG } from '@/metrics/catalog'
import { validateCatalog } from '@/metrics/registry'
import { paramRef, paramsOfView, recordParamReads } from '@/metrics/testing'
import { ID, metrics } from '../metrics'
import { type ForecastModel, forecastHeadline, forecastModel } from '.'
import { sample, sampleCtx } from './fixtures'

const IDS = Object.values(ID) as string[]

beforeAll(() => {
  sample()
}, 60_000)

const tiles = (m: ForecastModel) => [
  ...m.overview.kpis,
  ...m.variance.kpis,
  ...m.bridge.kpis,
  ...(m.overview.costVsTarget ? [m.overview.costVsTarget] : []),
  ...(m.bridge.fxEffectYtd ? [m.bridge.fxEffectYtd] : []),
]

describe('the Forecast entries', () => {
  it('pass the catalog checks and are the catalog’s own', () => {
    expect(validateCatalog(metrics)).toEqual([])
    for (const d of metrics) {
      expect(CATALOG.byId.get(d.id), d.id).toBe(d)
      expect(d.views[0]).toBe('forecast')
      expect(invalidRefs(d.uses), d.id).toEqual([])
    }
    expect(metrics.map((d) => d.id).sort()).toEqual([...IDS].sort())
    expect(paramsOfView('forecast').filter((r) => r.startsWith('forecast.'))).toEqual([])
  })
})

describe('every tile, figure and finding links to a registered metric', () => {
  for (const mode of ['hr-admin', 'finance', 'hrbp', 'leader'] as const)
    it(`in ${mode} mode`, () => {
      const ctx = sampleCtx(mode)
      const m = forecastModel(ctx)
      for (const k of tiles(m)) {
        expect(IDS, k.id).toContain(k.metricId)
        expect(k.definition, k.id).toBe(ctx.metrics.def(k.metricId as string)?.definition)
      }
      for (const f of [m.overview.headsByMonth, m.overview.startsExits, m.variance.rows, m.bridge.steps])
        expect(IDS, f.id).toContain(f.metric)
      for (const f of m.overview.findings) expect(IDS, f.id).toContain(f.metricId)
    })

  it('links the folder-tab headline to the year-end heads forecast', () => {
    const h = forecastHeadline(sampleCtx('hr-admin'))
    expect(h.metricId).toBe(ID.headsYearEnd)
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
      for (const [, key] of text.matchAll(/\bID\.(\w+)/g))
        expect(Object.keys(ID), `${file}: ID.${key}`).toContain(key)
      for (const [, id] of text.matchAll(/id="([a-z0-9-]+)"/g))
        expect(id.startsWith('forecast-'), `${file}: ${id}`).toBe(true)
    }
    expect(n).toBe(4)
  })
})

describe('the cost guard’s rules are read through the dictionary', () => {
  it('while computing the model and its headline', () => {
    const { metrics: recorded, reads } = recordParamReads(defaultMetrics())
    const ctx = sampleCtx('finance', { metrics: recorded })
    forecastModel(ctx)
    forecastHeadline(ctx)
    for (const r of [paramRef('cost.guard.minCosted', 'min'), paramRef('cost.guard.minContributors', 'min')])
      expect(reads.has(r), r).toBe(true)
  })
})
