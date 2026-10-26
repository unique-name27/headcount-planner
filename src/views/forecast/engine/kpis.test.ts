/**
 * The Forecast view's tiles (docs/PLAN.md 9.1, 9.3, 9.4, 7): Overview holds 5 to 7 tiles in every
 * mode that shows the view (five in HRBP and Leader mode, the exit run rate being Finance's), every
 * tile has `metricId`, `uses` and a drill or a card, every "vs" figure names its comparison, the
 * homes find the tiles they re-link (the year-end heads and full-year cost, "Cost vs target", "FX
 * effect YTD"), and amounts follow the mode.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import type { TargetRow } from '@/data/schema'
import { resolveDrill } from '@/drill/types'
import { isRoundedCost } from '@/lib/costRounding'
import { HOME_KEY_FIGURES } from '@/views/home/engine/figures'
import { ID } from '../metrics'
import { type ForecastModel, forecastModel } from '.'
import { everyMode, sample, sampleCtx } from './fixtures'

beforeAll(() => {
  sample()
}, 60_000)

const strips = (m: ForecastModel) => ({
  overview: m.overview.kpis,
  variance: m.variance.kpis,
  bridge: m.bridge.kpis,
})

describe('the strips', () => {
  it('holds 5 to 7 Overview tiles where the view shows, each linked and opening something', () => {
    for (const { mode, ctx } of everyMode()) {
      const m = forecastModel(ctx)
      if (ctx.access.can('view:forecast')) {
        expect(m.overview.kpis.length, mode).toBeGreaterThanOrEqual(5)
        expect(m.overview.kpis.length, mode).toBeLessThanOrEqual(7)
      } else expect(m.overview.kpis, mode).toEqual([])
      for (const [tab, kpis] of Object.entries(strips(m))) {
        const ids = kpis.map((k) => k.metricId)
        expect(new Set(ids).size, `${mode} ${tab}`).toBe(ids.length)
        for (const k of kpis) {
          expect(k.uses?.length, `${mode} ${k.id}`).toBeGreaterThan(0)
          expect(!!k.drill || !!k.calc, `${mode} ${k.id}`).toBe(true)
          if (k.delta !== undefined) expect(k.deltaLabel, `${mode} ${k.id}`).toMatch(/^vs /)
        }
      }
    }
  })

  it('shows five Overview tiles to HRBP and Leader (no exit run rate) and six to Finance', () => {
    for (const mode of ['hrbp', 'leader'] as const) {
      const m = forecastModel(sampleCtx(mode))
      expect(m.overview.kpis.map((k) => k.metricId)).toEqual([
        ID.headsYearEnd,
        ID.costFullYear,
        ID.startsExpected,
        ID.exitsModeled,
        ID.startsUnfilled,
      ])
    }
    expect(forecastModel(sampleCtx('finance')).overview.kpis.map((k) => k.metricId)).toContain(
      ID.costExitRunRate,
    )
  })

  it('gives the homes the tiles they re-link', () => {
    for (const [slug, mode] of [
      ['unit', 'hrbp'],
      ['rollup', 'leader'],
      ['fin', 'finance'],
    ] as const) {
      const m = forecastModel(sampleCtx(mode))
      for (const f of HOME_KEY_FIGURES[slug]) {
        if (f.view !== 'forecast') continue
        if (slug === 'rollup' && f.metricId === ID.costFullYear) {
          expect(m.overview.costVsTarget?.metricId).toBe(ID.costFullYear)
          expect(m.overview.costVsTarget?.deltaLabel).toBe('vs FY27 target')
          continue
        }
        if (slug === 'fin' && f.metricId === ID.fxEffect) {
          expect(m.bridge.fxEffectYtd?.metricId).toBe(ID.fxEffect)
          continue
        }
        const tab = strips(m)[f.tab as keyof ReturnType<typeof strips>]
        expect(tab.filter((k) => k.metricId === f.metricId).length, `${slug} ${f.metricId}`).toBe(1)
      }
    }
  })

  it('compares year-end heads with the target, and full-year cost with the comparison', () => {
    const m = forecastModel(sampleCtx('finance'))
    const heads = m.overview.kpis.find((k) => k.metricId === ID.headsYearEnd)
    expect(heads?.deltaLabel).toBe('vs FY27 target')
    expect(heads?.delta).toBeCloseTo((heads?.value ?? 0) - 1_610, 9)
    const cost = m.overview.kpis.find((k) => k.metricId === ID.costFullYear)
    expect(cost?.deltaLabel).toBe('vs FY27 Budget')
    // FY28 has no locked version: full-year cost compares with the FY28 target (9.2).
    const fy28 = forecastModel(sampleCtx('finance', { version: 'fy28-working' }))
    expect(fy28.overview.kpis.find((k) => k.metricId === ID.costFullYear)?.deltaLabel).toBe('vs FY28 target')
  })
})

describe('the target rows behind a "vs target" figure (PLAN 12: floored for HRBP and Leader)', () => {
  const targetDrills = (m: ForecastModel) =>
    [m.overview.kpis.find((k) => k.id === 'year-end-heads'), m.overview.costVsTarget].map((k) =>
      resolveDrill(k?.deltaDrill ?? null),
    )

  it('floors each row’s target cost to the rounding step in HRBP and Leader mode', () => {
    let rows = 0
    for (const mode of ['hrbp', 'leader'] as const)
      for (const spec of targetDrills(forecastModel(sampleCtx(mode)))) {
        expect(spec?.kind, mode).toBe('targets')
        for (const r of (spec?.rows ?? []) as TargetRow[]) {
          rows++
          if (r.targetCost != null) expect(isRoundedCost(r.targetCost), `${mode} ${r.targetCost}`).toBe(true)
        }
      }
    expect(rows).toBeGreaterThan(0)
  })

  it('shows Finance the input rows themselves', () => {
    const ctx = sampleCtx('finance')
    let rows = 0
    for (const spec of targetDrills(forecastModel(ctx)))
      for (const r of (spec?.rows ?? []) as TargetRow[]) {
        rows++
        expect(ctx.all.targets.includes(r)).toBe(true)
      }
    expect(rows).toBeGreaterThan(0)
  })
})

describe('amounts by mode', () => {
  it('Manager mode has no amount: no tile, no cost vs target, no bridge, no variance cost', () => {
    const m = forecastModel(sampleCtx('manager'))
    expect(m.overview.costVsTarget).toBeNull()
    expect(m.bridge.fxEffectYtd).toBeNull()
    expect(m.bridge.steps.rows).toEqual([])
    for (const r of m.variance.rows.rows)
      if (r.measure === 'cost') expect(r.variance ?? r.actual ?? r.comparison).toBeNull()
  })

  it('HRBP and Leader read whole $0.1M steps and no monthly cost', () => {
    for (const mode of ['hrbp', 'leader'] as const) {
      const m = forecastModel(sampleCtx(mode))
      for (const k of [...m.overview.kpis, ...m.variance.kpis, ...m.bridge.kpis, m.overview.costVsTarget]) {
        if (!k?.format.startsWith('money')) continue
        if (k.value != null) expect(isRoundedCost(k.value), `${mode} ${k.id}`).toBe(true)
        if (k.delta != null) expect(isRoundedCost(k.delta), `${mode} ${k.id}`).toBe(true)
      }
      for (const r of m.variance.rows.rows) {
        if (r.measure !== 'cost') continue
        if (r.window === 'month') expect(r.actual ?? r.comparison ?? r.variance, mode).toBeNull()
        for (const v of [r.actual, r.comparison, r.variance])
          if (v != null) expect(isRoundedCost(v), mode).toBe(true)
      }
      for (const s of m.bridge.steps.rows)
        if (s.value != null) expect(isRoundedCost(s.value), `${mode} ${s.key}`).toBe(true)
    }
  })
})
