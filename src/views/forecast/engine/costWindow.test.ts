/**
 * Cost to date on the forecast ends at the last closed month-end in rounded modes (docs/PLAN.md 7.3b,
 * 9.2, C21; review RR-2), as on the Plan view (src/views/plan/engine/costWindow.test.ts): Forecast >
 * Variance's QTD and YTD cost cells and the FX effect YTD never cover the as-of date's open month or
 * a close after the as-of date. With no month closed by the as-of date they show no amount and say
 * why. Heads and FTE keep their own window, and Finance is unchanged.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import type { ISODate } from '@/data/schema'
import type { PeriodPreset } from '@/data/scope'
import { type CtxOptions, sample, sampleCtx } from '@/views/plan/engine/fixtures'
import { forecastModel } from '.'
import { prepare } from './base'
import { windowsOf } from './variance'

beforeAll(() => {
  sample()
}, 60_000)

const noCloses = () => {
  const s = sample()
  return { ...s, plan: { ...s.plan, closes: [] } }
}

const ctxOf = (
  mode: 'hrbp' | 'leader' | 'finance',
  asOf: ISODate,
  opts: CtxOptions = {},
  period: PeriodPreset = 'fy',
) => sampleCtx(mode, { ...opts, asOf, filters: { period } })

const costCells = (ctx: ReturnType<typeof sampleCtx>, window: 'qtd' | 'ytd') =>
  forecastModel(ctx).variance.rows.rows.filter((r) => r.measure === 'cost' && r.window === window)

describe('the forecast in rounded modes with no month closed', () => {
  it('shows no QTD or YTD cost and no FX effect YTD at a mid-month as-of date, with the reason', () => {
    for (const mode of ['hrbp', 'leader'] as const) {
      const ctx = ctxOf(mode, '2026-09-15', { sample: noCloses() })
      for (const window of ['qtd', 'ytd'] as const) {
        const cells = costCells(ctx, window)
        expect(cells.length, `${mode} ${window}`).toBeGreaterThan(0)
        for (const r of cells) {
          expect(r.actual, `${mode} ${window} ${r.org}`).toBeNull()
          expect(r.variance, `${mode} ${window} ${r.org}`).toBeNull()
          expect(r.reason, `${mode} ${window} ${r.org}`).toBeTruthy()
        }
      }
      const fx = forecastModel(ctx).bridge.fxEffectYtd
      expect(fx?.value ?? null, mode).toBeNull()
      // Heads to date keep the months through the as-of month.
      const ytd = windowsOf(prepare(ctx)).find((w) => w.key === 'ytd')
      expect(ytd?.months.length, mode).toBe(6)
      const heads = forecastModel(ctx).variance.rows.rows.find(
        (r) => r.measure === 'heads' && r.window === 'ytd' && r.level === 'company',
      )
      expect(heads?.actual, mode).not.toBeNull()
    }
  })
})

describe('the forecast in rounded modes with the as-of date before the last close', () => {
  it('ends QTD and YTD cost at the last close on or before the as-of date', () => {
    for (const mode of ['hrbp', 'leader'] as const) {
      const p = prepare(ctxOf(mode, '2026-07-10'))
      const w = windowsOf(p)
      expect(w.find((x) => x.key === 'ytd')?.costMonths, mode).toEqual(['2026-04', '2026-05', '2026-06'])
      // The quarter (Jul to Sep) has no month closed by 10 Jul.
      expect(w.find((x) => x.key === 'qtd')?.costMonths, mode).toEqual([])
      for (const r of costCells(p.ctx, 'qtd')) expect(r.actual, `${mode} ${r.org}`).toBeNull()
    }
  })
})

describe('Finance', () => {
  it('keeps its windows: cost to date runs with the heads', () => {
    const p = prepare(ctxOf('finance', '2026-09-15', { sample: noCloses() }))
    for (const w of windowsOf(p)) expect(w.costMonths ?? w.months, w.key).toEqual(w.months)
    expect(costCells(p.ctx, 'ytd').some((r) => r.actual != null)).toBe(true)
  })
})
