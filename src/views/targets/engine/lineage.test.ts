/**
 * What the Targets view's numbers read (the template app's lineage test): every lineage names schema
 * fields only, every figure, tile and folder-tab headline declares one, and the active filters add
 * the fields they read (a filter decides which target rows show and what the tree counts).
 */
import { describe, expect, it, vi } from 'vitest'
import { invalidRefs } from '@/data/quality/fieldRef'
import { MemoryStorage } from '@/testkit/memoryStorage'
import { sampleCtx } from './fixtures'
import { targetsHeadline, targetsModel } from './index'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
vi.stubGlobal('localStorage', new MemoryStorage())

describe('Targets lineage', () => {
  it('names schema fields only, on every figure, tile and the headline', () => {
    for (const mode of ['hrbp', 'leader', 'finance', 'hr-admin'] as const) {
      const ctx = sampleCtx(mode)
      const m = targetsModel(ctx)
      const figures = [
        m.gap.rows,
        m.suborgs.rows,
        m.suborgs.unallocated,
        m.suborgs.exceptions,
        m.tree.cells,
        m.tree.costCenters,
      ]
      for (const f of figures) {
        expect(f.uses.length, `${mode} ${f.id}`).toBeGreaterThan(0)
        expect(invalidRefs(f.uses), `${mode} ${f.id}`).toEqual([])
      }
      for (const k of [...m.gap.kpis, ...m.suborgs.kpis, ...m.tree.kpis]) {
        expect(k.uses?.length, `${mode} ${k.id}`).toBeGreaterThan(0)
        expect(invalidRefs(k.uses ?? []), `${mode} ${k.id}`).toEqual([])
      }
      expect(targetsHeadline(ctx).uses?.length, mode).toBeGreaterThan(0)
    }
  })

  it('adds the fields the active filters read', () => {
    const ctx = sampleCtx('hr-admin', { filters: { location: ['Munich'], level: ['P4'] } })
    const m = targetsModel(ctx)
    for (const f of [m.gap.rows, m.suborgs.rows, m.tree.cells]) {
      expect(f.uses, f.id).toContain('positions.location')
      expect(f.uses, f.id).toContain('positions.level')
    }
    for (const k of [...m.gap.kpis, ...m.tree.kpis]) expect(k.uses, k.id).toContain('positions.level')
  })
})
