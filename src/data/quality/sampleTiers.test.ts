/**
 * No figure on the sample reads "No data" because of an optional column nobody filled (the M2
 * review, UI-1 and the browser pass's B1). The sample leaves optional fields blank by design: a
 * freeze of a whole unit has no department, cost center or leader (docs/PLAN.md 5.2), every bonus
 * follows its level's target, targets name no date. In every mode, every key figure, hero, figure and
 * headline the mode shows on Plan (Overview, Openings), Forecast (Overview, Variance, Bridge),
 * Targets (Gap), the role homes and My team takes a tier, never 'none', and the forecast and home
 * figures carry a value.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { MODES } from '@/access/modes'
import type { AnalyticsContext } from '@/data/context'
import type { Sample } from '@/data/sample'
import { MemoryStorage } from '@/testkit/memoryStorage'
import { leakSample, sampleCtx } from '@/testkit/sample'
import { forecastHeadline, forecastModel } from '@/views/forecast/engine'
import { homeHeadline, homeModel } from '@/views/home/engine'
import { planHeadline, planModel } from '@/views/plan/engine'
import { targetsHeadline, targetsModel } from '@/views/targets/engine'
import { teamModel } from '@/views/team/engine'
import type { FieldRef } from './fieldRef'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
vi.stubGlobal('localStorage', new MemoryStorage())

let sample: Sample
beforeAll(() => {
  sample = leakSample()
}, 120_000)

interface Shown {
  where: string
  uses: readonly FieldRef[] | undefined
  /** A number the figure must show (forecast and home figures); undefined where it is not checked. */
  value?: number | string | null
  suppressed?: boolean
}

/** What each view the mode shows puts on screen, with the fields behind it. */
function shownIn(ctx: AnalyticsContext): Shown[] {
  const can = (s: string) => ctx.access.can(s as never)
  const out: Shown[] = []
  const kpis = (
    where: string,
    list: readonly {
      id: string
      uses?: readonly FieldRef[]
      value: number | string | null
      suppressed?: boolean
    }[],
    valued: boolean,
  ) => {
    for (const k of list)
      out.push({
        where: `${where} ${k.id}`,
        uses: k.uses,
        ...(valued ? { value: k.value, suppressed: !!k.suppressed } : {}),
      })
  }
  if (can('view:plan')) {
    const p = planModel(ctx)
    if (can('tab:plan.overview')) kpis('plan.overview', p.overview.kpis, false)
    kpis('plan.openings', p.openings.kpis, false)
    out.push({ where: 'plan headline', uses: planHeadline(ctx).uses })
  }
  if (can('view:forecast')) {
    const f = forecastModel(ctx)
    kpis('forecast.overview', f.overview.kpis, true)
    kpis('forecast.variance', f.variance.kpis, true)
    kpis('forecast.bridge', f.bridge.kpis, true)
    for (const fig of [f.overview.headsByMonth, f.overview.startsExits, f.variance.rows, f.bridge.steps])
      out.push({ where: `figure ${fig.id}`, uses: fig.uses })
    out.push({ where: 'forecast headline', uses: forecastHeadline(ctx).uses })
  }
  if (can('view:targets')) {
    kpis('targets.gap', targetsModel(ctx).gap.kpis, false)
    out.push({ where: 'targets headline', uses: targetsHeadline(ctx).uses })
  }
  if (can('view:home')) {
    const h = homeModel(ctx)
    if (h) {
      out.push({ where: `hero ${h.hero.id}`, uses: h.hero.uses, value: h.hero.value })
      kpis('home', h.kpis, true)
      out.push({ where: 'home headline', uses: homeHeadline(ctx).uses })
    }
  }
  if (can('view:team')) {
    const m = teamModel(ctx)
    out.push({ where: `hero ${m.hero.id}`, uses: m.hero.uses, value: m.hero.value })
    kpis('team', m.kpis, true)
  }
  return out
}

describe('optional columns nobody filled never make a figure "No data" (UI-1, B1)', () => {
  for (const mode of MODES)
    it(`${mode}: every figure shown takes a tier, and the forecast and home figures show a value`, () => {
      const ctx = sampleCtx(mode, { sample })
      const shown = shownIn(ctx)
      // Non-vacuity: every mode shows Plan > Openings and a home or My team.
      expect(shown.length, mode).toBeGreaterThan(8)
      const none = shown
        .filter((s) => s.uses?.length && ctx.quality.tierOf(s.uses, []) === 'none')
        .map((s) => `${s.where}: ${ctx.quality.explainOf(s.uses, [])}`)
      expect(none, mode).toEqual([])
      const blank = shown.filter((s) => 'value' in s && !s.suppressed && s.value == null).map((s) => s.where)
      expect(blank, mode).toEqual([])
    })
})
