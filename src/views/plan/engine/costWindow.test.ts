/**
 * Cost to date in rounded modes ends at the last closed month-end (docs/PLAN.md 7.3b, 9.2, C21):
 * never the as-of date's open month, and never a close after the as-of date. With no month closed
 * by the as-of date, Loaded cost YTD and the period's cost by unit under `ytd` and `qtd` show no
 * amount, and say why. Heads to date keep their own window, and exact modes are unchanged.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import type { ISODate } from '@/data/schema'
import type { PeriodPreset } from '@/data/scope'
import { planModel } from '.'
import { prepare } from './base'
import { type CtxOptions, sample, sampleCtx } from './fixtures'

beforeAll(() => {
  sample()
}, 60_000)

const noCloses = () => {
  const s = sample()
  return { ...s, plan: { ...s.plan, closes: [] } }
}

const ctxOf = (
  mode: 'hrbp' | 'leader' | 'finance',
  period: PeriodPreset,
  asOf: ISODate,
  opts: CtxOptions = {},
) => sampleCtx(mode, { ...opts, asOf, filters: { period } })

const costYtd = (ctx: ReturnType<typeof sampleCtx>) =>
  planModel(ctx).overview.kpis.find((k) => k.id === 'cost-ytd')

describe('rounded modes with no month closed', () => {
  it('show no cost to date at a mid-month as-of date, with the reason', () => {
    for (const mode of ['hrbp', 'leader'] as const)
      for (const period of ['ytd', 'qtd'] as const) {
        const where = `${mode} ${period}`
        const ctx = ctxOf(mode, period, '2026-10-15', { sample: noCloses() })
        const p = prepare(ctx)
        expect(p.costYtdMonths, where).toEqual([])
        expect(p.windowMonths, where).toEqual([])
        const m = planModel(ctx)
        const byUnit = m.overview.costByUnit
        for (const r of byUnit.rows) {
          expect(r.totalUsd, where).toBeNull()
          expect(r.bandUsd, where).toBeNull()
        }
        if (!byUnit.rows.length) expect(byUnit.empty, where).toBe('No closed month in this period yet')
        const k = costYtd(ctx)
        expect(k?.value ?? null, where).toBeNull()
        expect(k?.delta ?? null, where).toBeNull()
        expect(k?.suppressedNote, where).toMatch(/^No month of FY27 is closed by 15 Oct 2026\./)
      }
  })

  it('still show the full year', () => {
    const ctx = ctxOf('hrbp', 'fy', '2026-10-15', { sample: noCloses() })
    expect(prepare(ctx).windowMonths).toHaveLength(12)
    expect(planModel(ctx).overview.costByUnit.rows.some((r) => r.totalUsd != null)).toBe(true)
  })
})

describe('rounded modes with the as-of date before the last close', () => {
  it('end cost to date at the last close on or before the as-of date', () => {
    for (const mode of ['hrbp', 'leader'] as const) {
      const ytd = prepare(ctxOf(mode, 'ytd', '2026-07-10'))
      expect(ytd.costClose?.date, mode).toBe('2026-06-30')
      expect(ytd.costYtdMonths, mode).toEqual(['2026-04', '2026-05', '2026-06'])
      expect(ytd.windowMonths, mode).toEqual(['2026-04', '2026-05', '2026-06'])
      // The quarter (Jul to Sep) has no month closed by 10 Jul.
      const qtd = ctxOf(mode, 'qtd', '2026-07-10')
      expect(prepare(qtd).windowMonths, mode).toEqual([])
      for (const r of planModel(qtd).overview.costByUnit.rows) expect(r.totalUsd, mode).toBeNull()
      const k = costYtd(ctxOf(mode, 'fy', '2026-07-10'))
      expect(k?.note ?? '', mode).not.toContain('Sep 2026')
    }
  })

  it('keep heads to date on their own window', () => {
    const p = prepare(ctxOf('hrbp', 'fy', '2026-07-10'))
    expect(p.ytdMonths.at(-1)).toBe('2026-09')
  })
})

describe('controls', () => {
  it('show cost to date at the sample’s close', () => {
    for (const mode of ['hrbp', 'leader'] as const) {
      const ctx = sampleCtx(mode, { filters: { period: 'ytd' } })
      expect(prepare(ctx).windowMonths.at(-1), mode).toBe('2026-09')
      expect(costYtd(ctx)?.value, mode).toBeGreaterThan(0)
    }
  })

  it('leave Finance’s exact windows as they were', () => {
    const p = prepare(ctxOf('finance', 'qtd', '2026-10-15', { sample: noCloses() }))
    expect(p.costClose).toBeNull()
    expect(p.windowMonths).toEqual(['2026-10'])
  })
})
