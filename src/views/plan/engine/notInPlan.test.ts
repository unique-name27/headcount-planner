/**
 * Actual heads' "Not in plan" row (the spec's glossary and docs/PLAN.md 2: "active HRIS employees on
 * the last day, plus a Not in plan row"; M4 review SA-6): Plan > Overview's Heads by unit lists the
 * 6 people with no position on their own row, with actual heads only, not in their HRIS unit, so a
 * unit's actual heads compare like for like with its plan; the rows still add up to the tile, and the
 * row opens exactly those people.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { HIDDEN_NOTE } from '@/charts/kit/shared'
import { resolveDrill } from '@/drill/types'
import { MemoryStorage } from '@/testkit/memoryStorage'
import { leakSample, sampleCtx } from '@/testkit/sample'
import { prepare } from './base'
import { actualOn } from './heads'
import { planModel } from './index'
import { NOT_IN_PLAN, NOT_IN_PLAN_BAR_NOTE } from './overview'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
vi.stubGlobal('localStorage', new MemoryStorage())

beforeAll(() => {
  leakSample()
}, 120_000)

describe('Heads by unit: the Not in plan row (review SA-6)', () => {
  it('holds the people with no position, actual heads only, and the rows add up to the tile', () => {
    for (const mode of ['hr-admin', 'finance'] as const) {
      const ctx = sampleCtx(mode)
      const m = planModel(ctx).overview
      const fig = m.headsByUnit
      const row = fig.rows.find((r) => r.key === NOT_IN_PLAN)
      const seatless = [...actualOn(prepare(ctx)).values()].filter((e) => !e.assignment.positionId)
      expect(seatless.length, mode).toBe(6)
      expect(row, mode).toEqual({
        key: NOT_IN_PLAN,
        label: 'Not in plan',
        approved: null,
        actual: 6,
        plan: null,
        comparison: null,
      })
      // Last, after the units.
      expect(fig.rows.at(-1)?.key, mode).toBe(NOT_IN_PLAN)
      const tile = m.kpis.find((k) => k.id === 'actual')?.value
      expect(
        fig.rows.reduce((n, r) => n + r.actual, 0),
        mode,
      ).toBe(tile)
      // The unit rows count the people in their seats only.
      const inSeats = [...actualOn(prepare(ctx)).values()].filter((e) => e.assignment.positionId).length
      expect(
        fig.rows.filter((r) => r.key !== NOT_IN_PLAN).reduce((n, r) => n + r.actual, 0),
        mode,
      ).toBe(inSeats)
      // Its actual heads open exactly those people; nothing else on the row drills.
      const col = (k: string) => fig.columns.find((c) => c.key === k)
      const spec = resolveDrill(col('actual')?.drill?.(row as never) as never)
      expect(spec?.kind, mode).toBe('workers')
      expect(
        ((spec?.rows ?? []) as unknown as { employeeId: string }[]).map((w) => w.employeeId).sort(),
        mode,
      ).toEqual(seatless.map((e) => e.worker.employeeId).sort())
      for (const k of ['approved', 'plan', 'comparison'])
        expect(col(k)?.drill?.(row as never) ?? null, `${mode} ${k}`).toBeNull()
    }
  })

  it('says on its bar why it has no approved heads, never that a count is hidden', () => {
    const rows = planModel(sampleCtx('hr-admin')).overview.headsByUnit.rows
    // The one row with blank approved heads is Not in plan, so the bar list's note for a blank value
    // reads only there.
    expect(rows.filter((r) => r.approved == null).map((r) => r.key)).toEqual([NOT_IN_PLAN])
    expect(NOT_IN_PLAN_BAR_NOTE).not.toBe(HIDDEN_NOTE)
    expect(NOT_IN_PLAN_BAR_NOTE).not.toMatch(/hidden|anonymity|n < 5/i)
    const ui = readFileSync(fileURLToPath(new URL('../ui/Overview.tsx', import.meta.url)), 'utf8')
    const bars = ui.slice(ui.indexOf('id="plan-heads-by-unit"'), ui.indexOf('id="plan-positions-by-status"'))
    expect(bars).toContain('nullNote={NOT_IN_PLAN_BAR_NOTE}')
  })
})
