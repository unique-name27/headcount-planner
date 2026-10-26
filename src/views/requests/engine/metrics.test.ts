/**
 * The Requests view in the metric dictionary (docs/PLAN.md 12; the template app's per-view metrics
 * test): its entries pass the catalog checks and are the catalog's own, at home on `requests`, with
 * exactly the frozen ids and settings; every tile and list links to a registered metric with the
 * dictionary's wording; every <Figure> in ui/ names its metric, lineage and dictionary definitions
 * (never a metric the mode hides); and the settings the lists read come through `ctx.metrics`.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { MODES } from '@/access/modes'
import { invalidRefs } from '@/data/quality/fieldRef'
import { defaultMetrics } from '@/metrics/api'
import { CATALOG } from '@/metrics/catalog'
import { validateCatalog } from '@/metrics/registry'
import { paramRef, paramsOfView, recordParamReads } from '@/metrics/testing'
import { modeCtx, sampleCtx, sampleOnce } from '@/views/actions/engine/roleKit'
import { ID as PLAN_ID } from '@/views/plan/metrics'
import { ID, metrics, PARAM } from '../metrics'
import { defsOf } from '../ui/model'
import { requestsActions } from './actions'
import { type RequestsModel, requestsHeadline, requestsModel } from './index'

const IDS = Object.values(ID) as string[]

beforeAll(() => {
  sampleOnce()
}, 120_000)

const tiles = (m: RequestsModel) => [...m.queue.kpis, ...m.mine.kpis, ...m.approvals.kpis, ...m.cycle.kpis]
const figures = (m: RequestsModel) => [
  m.queue.rows,
  m.queue.byState,
  m.mine.rows,
  m.approvals.rows,
  m.cycle.asks,
  m.cycle.notSubmitted,
]

describe('the Requests entries', () => {
  it('pass the catalog checks, are the catalog’s own and at home on requests, with the frozen ids', () => {
    expect(validateCatalog(metrics)).toEqual([])
    expect(metrics.map((d) => d.id)).toEqual(IDS)
    for (const d of metrics) {
      expect(CATALOG.byId.get(d.id), d.id).toBe(d)
      expect(d.views[0], d.id).toBe('requests')
      expect(d.owner, d.id).toBe(metrics[0].owner)
      expect(invalidRefs(d.uses), d.id).toEqual([])
      for (const t of [d.definition, d.formula ?? '', d.population ?? '', d.window ?? '']) {
        expect(t, d.id).not.toMatch(/[A-Za-z0-9)]\s*—\s*[A-Za-z0-9(]/)
        expect(t, d.id).not.toContain('!')
      }
    }
  })

  it('register exactly the settings PARAM names, the leader threshold locked', () => {
    const own = paramsOfView('requests')
      .filter((r) => r.startsWith('requests.'))
      .sort()
    expect(own).toEqual(
      Object.values(PARAM)
        .map((p) => paramRef(p.metricId, p.key))
        .sort(),
    )
    const threshold = CATALOG.byId
      .get(PARAM.leaderThresholdUsd.metricId)
      ?.params.find((p) => p.key === PARAM.leaderThresholdUsd.key)
    expect(threshold?.locked).toBe(true)
    expect(threshold?.default).toBe(250_000)
  })

  it('show each id on the view, or register a setting, or name the other view that shows it', () => {
    const shown = new Set<string>()
    for (const mode of MODES) {
      const m = requestsModel(modeCtx(mode))
      for (const k of tiles(m)) shown.add(k.metricId as string)
      for (const f of figures(m)) shown.add(f.metric)
    }
    for (const d of metrics)
      expect(shown.has(d.id) || d.params.length > 0 || d.views.length > 1, d.id).toBe(true)
  })
})

describe('every tile and list links to a registered metric', () => {
  it('in every mode, with the dictionary’s definition on each tile', () => {
    for (const mode of MODES) {
      const ctx = modeCtx(mode)
      const m = requestsModel(ctx)
      for (const k of tiles(m)) {
        expect(IDS, `${mode} ${k.id}`).toContain(k.metricId)
        expect(k.definition, `${mode} ${k.id}`).toBe(ctx.metrics.def(k.metricId as string)?.definition)
      }
      for (const f of figures(m)) {
        expect(IDS, `${mode} ${f.id}`).toContain(f.metric)
        expect(f.id.startsWith('requests-'), f.id).toBe(true)
      }
      const h = requestsHeadline(ctx)
      expect(h.metricId, mode).toBe(ID.queueWaiting)
      expect(h.uses?.length, mode).toBeGreaterThan(0)
    }
  })

  it('keeps a metric the mode hides out of a datasheet (the band estimate in Manager mode)', () => {
    const names = (mode: (typeof MODES)[number]) =>
      defsOf(modeCtx(mode), ID.queueOpen, PLAN_ID.costBandEstimate).map((d) => d.term)
    const band = CATALOG.byId.get(PLAN_ID.costBandEstimate)?.name as string
    expect(names('manager')).not.toContain(band)
    expect(names('manager')).toContain(CATALOG.byId.get(ID.queueOpen)?.name)
    for (const mode of ['hrbp', 'leader', 'finance'] as const) expect(names(mode), mode).toContain(band)
  })

  const dir = fileURLToPath(new URL('../ui', import.meta.url))
  const ui = readdirSync(dir)
    .filter((f) => f.endsWith('.tsx'))
    .map((f) => ({ file: f, text: readFileSync(join(dir, f), 'utf8') }))

  it('gives every <Figure> its metric, lineage and dictionary definitions, written out', () => {
    let n = 0
    for (const { file, text } of ui) {
      const count = text.split('<Figure').length - 1
      n += count
      expect(text.split('metric={').length - 1, file).toBe(count)
      expect(text.split('uses={').length - 1, file).toBe(count)
      expect(text.split('definitions={').length - 1, file).toBe(count)
      expect(text, file).not.toMatch(/definitions=\{\[\s*\{/)
      expect(text, file).not.toMatch(/<Figure\s*\{\.\.\./)
      for (const [, key] of text.matchAll(/\bID\.(\w+)/g))
        expect(Object.keys(ID), `${file}: ID.${key}`).toContain(key)
      for (const [, id] of text.matchAll(/id="([a-z0-9-]+)"/g))
        expect(id.startsWith('requests-'), `${file}: ${id}`).toBe(true)
    }
    // M2 drew 6; M3 adds Requests > New's seats, chain preview and trade quote card, and Approvals' gaps.
    expect(n).toBe(10)
  })
})

describe('the settings are read through the dictionary', () => {
  it('reads every setting the lists and items use while computing the view, its headline and its items', () => {
    const { metrics: recorded, reads } = recordParamReads(defaultMetrics())
    const ctx = sampleCtx('hr-admin', { metrics: recorded })
    requestsModel(ctx)
    requestsHeadline(ctx)
    requestsActions(ctx)
    // The leader threshold routes a request when it is raised (src/plan/engine/chain.ts, the write
    // path); the lists read the steps stored on each request, so they never route it again.
    const read = [PARAM.waitingDays, PARAM.idleDays, PARAM.backfillWindowDays].map((p) =>
      paramRef(p.metricId, p.key),
    )
    expect(read.filter((r) => !reads.has(r))).toEqual([])
    expect(reads.has(paramRef(PARAM.leaderThresholdUsd.metricId, PARAM.leaderThresholdUsd.key))).toBe(false)
  })
})
