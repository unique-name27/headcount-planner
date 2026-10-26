/**
 * What the Finance view's numbers read (the template app's lineage test): every lineage names schema
 * fields only, every figure and tile that reads data declares one, and the active filters add the
 * fields they read.
 */
import { describe, expect, it, vi } from 'vitest'
import { invalidRefs } from '@/data/quality/fieldRef'
import { MemoryStorage } from '@/testkit/memoryStorage'
import { sampleCtx } from '@/views/targets/engine/fixtures'
import { ID } from '../metrics'
import { financeHeadline, financeModel } from './index'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
vi.stubGlobal('localStorage', new MemoryStorage())

describe('Finance lineage', () => {
  it('names schema fields only, on every figure and tile that reads data', () => {
    for (const mode of ['hrbp', 'finance', 'hr-admin'] as const) {
      const ctx = sampleCtx(mode)
      const m = financeModel(ctx)
      const figures = [
        m.versions.adjustments,
        m.versions.adjustmentsByMonth,
        m.assumptions.values,
        ...(m.assumptions.tradeRates ? [m.assumptions.tradeRates] : []),
        m.freezes.freezes,
        m.freezes.openings,
        m.reconcile.exceptions,
      ]
      for (const f of figures) {
        expect(f.uses.length, `${mode} ${f.id}`).toBeGreaterThan(0)
        expect(invalidRefs(f.uses), `${mode} ${f.id}`).toEqual([])
      }
      for (const k of [...m.versions.kpis, ...m.assumptions.kpis, ...m.freezes.kpis, ...m.reconcile.kpis]) {
        // Locked versions count versions, which read no dataset.
        if (k.metricId !== ID.versionsLocked) expect(k.uses?.length, `${mode} ${k.id}`).toBeGreaterThan(0)
        expect(invalidRefs(k.uses ?? []), `${mode} ${k.id}`).toEqual([])
      }
      expect(invalidRefs(financeHeadline(ctx).uses ?? []), mode).toEqual([])
    }
  })

  it('adds the fields the active filters read', () => {
    const m = financeModel(sampleCtx('finance', { filters: { businessUnit: ['Corporate'] } }))
    for (const f of [m.freezes.openings, m.reconcile.exceptions, m.versions.adjustments])
      expect(f.uses, f.id).toContain('positions.businessUnit')
    for (const k of [...m.freezes.kpis, ...m.reconcile.kpis])
      expect(k.uses, k.id).toContain('positions.businessUnit')
  })
})
