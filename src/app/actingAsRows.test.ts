/**
 * The Acting as dialog's rows (docs/PLAN.md 8.1 and 13.3; the M2 review, UI-4): on the sample, every
 * mode lists its sample persona first, marked as one ("Sample persona"); with uploaded data there is
 * no persona, and the largest scope comes first.
 */
import { describe, expect, it, vi } from 'vitest'
import { MODES } from '@/access/modes'
import { samplePicks } from '@/access/store'
import { DATASET_KEYS, type DatasetKey } from '@/data/schema'
import type { SourceMeta } from '@/data/store'
import { MemoryStorage } from '@/testkit/memoryStorage'
import { leakSample, sampleCtx } from '@/testkit/sample'
import { actingAsRows } from './actingAsRows'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
vi.stubGlobal('localStorage', new MemoryStorage())

describe('the Acting as rows', () => {
  it("list the sample's persona first in every mode, marked as the persona", () => {
    const s = leakSample()
    const picks = samplePicks(s.personas)
    for (const mode of MODES) {
      const ctx = sampleCtx(mode, { sample: s })
      const rows = actingAsRows(mode, ctx, null)
      expect(rows.length, mode).toBeGreaterThan(0)
      expect(rows[0].persona, mode).toBe(true)
      expect(rows[0].pick.personId, mode).toBe(picks[mode]?.personId)
      expect(rows.filter((r) => r.persona).length, mode).toBeGreaterThanOrEqual(1)
    }
    // The three Manager personas (the team, B's team of 3 and C) and the three Leader ones.
    expect(
      actingAsRows('manager', sampleCtx('manager', { sample: s }), null).filter((r) => r.persona),
    ).toHaveLength(3)
  })

  it('list no persona with uploaded data', () => {
    const s = leakSample()
    const ctx = sampleCtx('manager', { sample: s })
    const uploaded = Object.fromEntries(
      DATASET_KEYS.map((k) => [k, { kind: 'upload', rowCount: s.datasets[k].length }]),
    ) as Record<DatasetKey, SourceMeta>
    const rows = actingAsRows('manager', { ...ctx, sources: uploaded }, null)
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.some((r) => r.persona)).toBe(false)
  })
})
