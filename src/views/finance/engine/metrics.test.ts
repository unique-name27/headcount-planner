/**
 * The Finance view's dictionary entries and how the view uses them (the template app's per-view
 * metrics test): the entries pass `validateCatalog` and are the catalog's own objects, home on
 * `finance`, carry exactly the frozen ids, and every KPI on the view reads its definition from the
 * dictionary. The UI files give every `<Figure` its `metric={` and `definitions={` (source scan).
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { CATALOG } from '@/metrics/catalog'
import { validateCatalog } from '@/metrics/registry'
import { paramsOfView } from '@/metrics/testing'
import { MemoryStorage } from '@/testkit/memoryStorage'
import { sampleCtx } from '@/views/targets/engine/fixtures'
import { ID, metrics } from '../metrics'
import { financeModel } from './index'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
vi.stubGlobal('localStorage', new MemoryStorage())

const UI = join(process.cwd(), 'src/views/finance/ui')

describe('the Finance dictionary entries', () => {
  it('are valid, the catalog’s own, at home on finance, with exactly the frozen ids', () => {
    expect(validateCatalog(metrics)).toEqual([])
    expect(metrics.map((m) => m.id)).toEqual(Object.values(ID))
    for (const m of metrics) {
      expect(CATALOG.byId.get(m.id)).toBe(m)
      expect(m.views[0]).toBe('finance')
      expect(m.owner).toBe(metrics[0].owner)
    }
    expect(paramsOfView('finance')).toEqual([])
  })

  it('give every KPI its definition from the dictionary', () => {
    for (const mode of ['hrbp', 'finance', 'hr-admin'] as const) {
      const ctx = sampleCtx(mode)
      const m = financeModel(ctx)
      for (const tab of [m.versions, m.assumptions, m.freezes, m.reconcile])
        for (const k of tab.kpis)
          expect(k.definition, k.id).toBe(ctx.metrics.def(k.metricId as string)?.definition)
    }
  })
})

describe('the Finance UI files', () => {
  it('give every Figure a metric and definitions, written out, with no spread props', () => {
    let figures = 0
    for (const f of readdirSync(UI).filter((x) => x.endsWith('.tsx'))) {
      const src = readFileSync(join(UI, f), 'utf8')
      const n = (re: RegExp) => (src.match(re) ?? []).length
      expect(n(/metric=\{/g), f).toBe(n(/<Figure\b/g))
      expect(n(/definitions=\{/g), f).toBe(n(/<Figure\b/g))
      expect(src, f).not.toMatch(/<Figure\s*\{\.\.\./)
      expect(src, f).not.toMatch(/[A-Za-z0-9)]\s*—\s*[A-Za-z0-9(]/)
      figures += n(/<Figure\b/g)
      for (const id of src.match(/id="([a-z0-9-]+)"/g) ?? []) expect(id, f).toMatch(/^id="finance-/)
    }
    expect(figures).toBeGreaterThanOrEqual(7)
  })
})
