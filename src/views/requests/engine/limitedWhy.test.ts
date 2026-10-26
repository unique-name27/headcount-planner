/**
 * A limited request's hidden band estimate in exports (docs/PLAN.md 14.1 item 2, 8.4 rule 2; M4
 * review EX-9): the cell is empty with Suppressed "Yes" and the reason, in Finance's queue and the
 * Leader's ranked asks, while a full row with an estimate is not flagged.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { Column } from '@/charts/types'
import { LIMITED_WHY_TEXT } from '@/drill/requestRecord'
import { moneyOpts, moneyShown } from '@/lib/export/columns'
import { SUPPRESSED_KEY, SUPPRESSED_WHY_KEY, withSuppressedFlag } from '@/lib/export/suppressedFlag'
import { MemoryStorage } from '@/testkit/memoryStorage'
import { leakSample, personaCtx } from '@/testkit/sample'
import { requestsModel } from './index'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
vi.stubGlobal('localStorage', new MemoryStorage())

beforeAll(() => {
  leakSample()
}, 120_000)

const written = (
  fig: { rows: readonly object[]; columns: readonly Column[] },
  money: ReturnType<typeof moneyShown>,
) =>
  withSuppressedFlag(
    { name: 'x', title: 'x', columns: fig.columns as Column[], rows: fig.rows as Record<string, unknown>[] },
    money,
  ).rows

describe('limited request rows in exports (review EX-9)', () => {
  it('flag the hidden band estimate with the reason in Finance’s queue', () => {
    const ctx = personaCtx('finance-fpa')
    const fig = requestsModel(ctx).queue.rows
    const rows = written(fig, moneyShown(moneyOpts(ctx)))
    const limited = rows.filter((r) => r.view === 'limited')
    expect(limited.length).toBeGreaterThan(0)
    for (const r of limited) {
      expect(r.bandEstimateUsd ?? null, String(r.requestId)).toBeNull()
      expect([r[SUPPRESSED_KEY], r[SUPPRESSED_WHY_KEY]], String(r.requestId)).toEqual([
        'Yes',
        LIMITED_WHY_TEXT,
      ])
    }
    for (const r of rows.filter((x) => x.view === 'full' && x.bandEstimateUsd != null))
      expect(r[SUPPRESSED_KEY], String(r.requestId)).toBe('')
  })

  it('flag it in the Leader’s ranked asks too', () => {
    const ctx = personaCtx('leader-svp-se')
    const cycle = requestsModel(ctx).cycle
    const fig = cycle.asks
    const rows = written(fig, moneyShown(moneyOpts(ctx)))
    const limited = rows.filter((r) => r.manager == null && r.priority == null && r.bandEstimateUsd == null)
    expect(limited.length).toBeGreaterThan(0)
    for (const r of limited)
      expect([r[SUPPRESSED_KEY], r[SUPPRESSED_WHY_KEY]], String(r.requestId)).toEqual([
        'Yes',
        LIMITED_WHY_TEXT,
      ])
    for (const r of rows.filter((x) => x.bandEstimateUsd != null)) expect(r[SUPPRESSED_KEY]).toBe('')
  })

  it('flag it in the Leader’s queue and in Approvals, which list request records', () => {
    const ctx = personaCtx('leader-svp-se')
    const m = requestsModel(ctx)
    let seen = 0
    for (const fig of [m.queue.rows, m.approvals.rows]) {
      const rows = written(fig, moneyShown(moneyOpts(ctx)))
      for (const r of rows.filter((x) => x.view === 'limited')) {
        seen++
        expect([r[SUPPRESSED_KEY], r[SUPPRESSED_WHY_KEY]], String(r.requestId)).toEqual([
          'Yes',
          LIMITED_WHY_TEXT,
        ])
      }
    }
    expect(seen).toBeGreaterThan(0)
  })
})
