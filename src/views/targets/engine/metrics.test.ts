/**
 * The Targets view's dictionary entries and how the view uses them (the template app's per-view
 * metrics test): the entries pass `validateCatalog` and are the catalog's own objects, home on
 * `targets`, carry exactly the frozen ids, and every KPI on the view reads its definition from the
 * dictionary. The UI files give every `<Figure` its `metric={` and `definitions={` (source scan), and
 * the view reads every setting it registers (none: its rules come through `ctx.guard`).
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { FY28_WORKING } from '@/data/sample'
import { CATALOG } from '@/metrics/catalog'
import { validateCatalog } from '@/metrics/registry'
import { paramsOfView } from '@/metrics/testing'
import { MemoryStorage } from '@/testkit/memoryStorage'
import { ID, metrics } from '../metrics'
import { sampleCtx } from './fixtures'
import { targetsModel } from './index'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
vi.stubGlobal('localStorage', new MemoryStorage())

const UI = join(process.cwd(), 'src/views/targets/ui')

describe('the Targets dictionary entries', () => {
  it('are valid, the catalog’s own, at home on targets, with exactly the frozen ids', () => {
    expect(validateCatalog(metrics)).toEqual([])
    expect(metrics.map((m) => m.id)).toEqual(Object.values(ID))
    for (const m of metrics) {
      expect(CATALOG.byId.get(m.id)).toBe(m)
      expect(m.views[0]).toBe('targets')
      expect(m.owner).toBe(metrics[0].owner)
      for (const t of [m.definition, m.formula ?? '', m.population ?? '', m.window ?? '']) {
        expect(t).not.toMatch(/[A-Za-z0-9)]\s*—\s*[A-Za-z0-9(]/)
        expect(t).not.toMatch(/!/)
      }
    }
    expect(paramsOfView('targets')).toEqual([])
  })

  it('give every KPI its definition from the dictionary', () => {
    for (const version of [null, FY28_WORKING])
      for (const mode of ['hrbp', 'leader', 'finance', 'hr-admin'] as const) {
        const ctx = sampleCtx(mode, { version })
        const m = targetsModel(ctx)
        for (const k of [...m.gap.kpis, ...m.suborgs.kpis, ...m.tree.kpis])
          expect(k.definition, k.id).toBe(ctx.metrics.def(k.metricId as string)?.definition)
      }
  })
})

describe('the Targets UI files', () => {
  it('give every Figure a metric and definitions, written out, with no spread props', () => {
    let figures = 0
    for (const f of readdirSync(UI).filter((x) => x.endsWith('.tsx'))) {
      const src = readFileSync(join(UI, f), 'utf8')
      const n = (re: RegExp) => (src.match(re) ?? []).length
      expect(n(/metric=\{/g), f).toBe(n(/<Figure\b/g))
      expect(n(/definitions=\{/g), f).toBe(n(/<Figure\b/g))
      expect(src, f).not.toMatch(/<Figure\s*\{\.\.\./)
      expect(src, f).not.toMatch(/[A-Za-z0-9)]\s*—\s*[A-Za-z0-9(]/)
      expect(src, f).not.toMatch(/'[^']*!'|"[^"]*!"/)
      figures += n(/<Figure\b/g)
      for (const id of src.match(/id="([a-z0-9-]+)"/g) ?? []) expect(id, f).toMatch(/^id="targets-/)
    }
    expect(figures).toBeGreaterThanOrEqual(5)
  })
})
