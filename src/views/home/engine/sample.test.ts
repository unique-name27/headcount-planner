/**
 * The role homes on the sample with the real producing views (docs/PLAN.md 9.3 and 13.3): in each
 * home mode, acting as the mode's sample persona, every key figure 9.3 names resolves through
 * `tile()` to exactly one tile, every tile that carries a change names its comparison, the hero has
 * its number and its comparison, every list row is inside the mode's scope, and the folder tab has a
 * headline. A producer that drops a tile, or names no comparison, fails here. Against a target
 * (picked, or the only comparison a year with no locked version has), every change names the target,
 * Unit plan's monthly hero compares with nothing and says why, and Plan vs actual's hero compares
 * the full-year cost with the target cost (9.2). The HRBP and Leader homes carry Plan > Hiring's own
 * Open to hire tile for their scope at `HIRING_TILE_AT` (9.7), and Plan vs actual does not.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { inScope, positionInScope } from '@/access/records'
import type { AnalyticsContext } from '@/data/context'
import { resolveDrill } from '@/drill/types'
import { TARGET_HAS_NO_MONTHS } from '@/plan/engine/variance'
import { MemoryStorage } from '@/testkit/memoryStorage'
import { forecastModel } from '@/views/forecast/engine'
import { ID as FORECAST } from '@/views/forecast/metrics'
import { planHiringModel } from '@/views/plan/engine/hiringTab'
import { ID as PLAN } from '@/views/plan/metrics'
import { sampleContext, teamSample } from '@/views/team/engine/testkit'
import { HIRING_TILE_AT, HOME_KEY_COUNT_WITH_HIRING, HOME_KEY_FIGURES } from './figures'
import { type FinHomeModel, type HomeModel, homeHeadline, homeModel, type UnitHomeModel } from './index'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
vi.stubGlobal('localStorage', new MemoryStorage())

const MODES = ['hrbp', 'leader', 'finance'] as const
const ctxs = {} as Record<(typeof MODES)[number], AnalyticsContext>
const models = {} as Record<(typeof MODES)[number], HomeModel>

beforeAll(() => {
  teamSample()
  for (const mode of MODES) {
    ctxs[mode] = sampleContext(mode)
    const m = homeModel(ctxs[mode])
    if (!m) throw new Error(`${mode} has no home`)
    models[mode] = m
  }
}, 120_000)

describe('the role homes on the sample', () => {
  it('resolve every key figure to exactly one producing tile, in order', () => {
    for (const mode of MODES) {
      const m = models[mode]
      expect(
        m.kpis.map((k) => k.metricId),
        mode,
      ).toEqual(HOME_KEY_FIGURES[m.slug].map((k) => k.metricId))
      for (const k of m.kpis) {
        expect(k.uses?.length, `${mode} ${k.id}`).toBeGreaterThan(0)
        expect(!!k.drill || !!k.calc, `${mode} ${k.id}`).toBe(true)
      }
    }
  })

  it('name the comparison of every figure with a change', () => {
    for (const mode of MODES)
      for (const k of models[mode].kpis)
        if (k.delta != null) expect(k.deltaLabel, `${mode} ${k.id}`).toMatch(/^vs /)
  })

  it('give each hero its number and what it compares with', () => {
    for (const mode of MODES) {
      const h = models[mode].hero
      expect(h.value, mode).not.toBeNull()
      expect(h.comparison?.label, mode).toMatch(/^vs /)
      expect(h.comparison?.value, mode).not.toBeNull()
    }
    expect(models.hrbp.hero.value).toBe(556)
  })

  it('list no requests field on a heads figure: the hero, actual heads and hires read workers and positions (B3)', () => {
    // The Plan view's heads tiles a home re-links; the request-driven ones (Approvals waiting) and
    // the forecast's and targets' own tiles keep their producers' lineage.
    const heads = new Set<string>([
      PLAN.headsActual,
      PLAN.hiresYtd,
      PLAN.openingsPastStart,
      PLAN.openingsFrozen,
      PLAN.reqsNotInPlan,
    ])
    let checked = 0
    for (const mode of MODES)
      for (const k of models[mode].kpis) {
        if (!heads.has(k.metricId ?? '')) continue
        expect(
          (k.uses ?? []).filter((r) => r.startsWith('requests.')),
          `${mode} ${k.id}`,
        ).toEqual([])
        checked++
      }
    expect(checked).toBeGreaterThanOrEqual(5)
    const datasets = (uses: readonly string[] | undefined) =>
      [...new Set((uses ?? []).map((r) => r.split('.')[0]))].sort()
    expect(datasets(models.hrbp.hero.uses)).toEqual(['positions', 'workers'])
    for (const mode of ['hrbp', 'finance'] as const) {
      const actual = models[mode].kpis.find((k) => k.metricId === PLAN.headsActual)
      expect(datasets(actual?.uses), mode).toEqual(['positions', 'workers'])
    }
    const hires = models.hrbp.kpis.find((k) => k.metricId === PLAN.hiresYtd)
    expect(datasets(hires?.uses)).toEqual(['positions', 'workers'])
  })

  it('keep every list row inside the mode’s scope', () => {
    const unit = models.hrbp
    if (unit.slug === 'unit')
      for (const r of unit.list.rows) expect(inScope('requests', r, ctxs.hrbp), r.requestId).toBe(true)
    const rollup = models.leader
    if (rollup.slug === 'rollup')
      for (const r of rollup.list.rows)
        expect(positionInScope(r.positionId, ctxs.leader.access), r.positionId).toBe(true)
  })

  it('put a headline on the folder tab in each mode', () => {
    for (const mode of MODES) expect(homeHeadline(ctxs[mode]).value.length, mode).toBeGreaterThan(0)
  })
})

describe('Open to hire on the sample homes (docs/PLAN.md 9.7 Homes)', () => {
  it('is Plan > Hiring’s own tile for the scope, at its slot, labelled "Open to hire, FY27"', () => {
    for (const mode of ['hrbp', 'leader'] as const) {
      const m = models[mode]
      if (m.slug !== 'unit' && m.slug !== 'rollup') throw new Error(`${mode} has no hiring slot`)
      const t = m.kpis[HIRING_TILE_AT[m.slug]]
      const own = planHiringModel(ctxs[mode]).kpis.find((k) => k.metricId === PLAN.hiringOpen)
      expect(own, mode).toBeDefined()
      expect(t.metricId, mode).toBe(PLAN.hiringOpen)
      expect(t.label, mode).toBe('Open to hire, FY27')
      expect(t.link, mode).toEqual({ view: 'plan', tab: 'hiring', label: 'Plan, Hiring' })
      expect([t.value, t.format, t.uses, t.note], mode).toEqual([
        own?.value,
        own?.format,
        own?.uses,
        own?.note,
      ])
      expect(resolveDrill(t.drill)?.rows.length, mode).toBe(resolveDrill(own?.drill)?.rows.length)
      expect(m.kpis, mode).toHaveLength(HOME_KEY_COUNT_WITH_HIRING[m.slug])
    }
  })

  it('is not on Plan vs actual, which keeps its 6', () => {
    expect(models.finance.kpis.some((k) => k.metricId === PLAN.hiringOpen)).toBe(false)
    expect(models.finance.kpis).toHaveLength(HOME_KEY_COUNT_WITH_HIRING.fin)
  })
})

describe('Rollup vs target for the other leader picks (docs/PLAN.md 13.3: the CFO and a director)', () => {
  it('resolves every key figure, names each change’s comparison and keeps the list in scope', () => {
    for (const persona of ['leader-cfo', 'leader-dv-director'] as const) {
      const ctx = sampleContext('leader', { persona })
      const m = homeModel(ctx)
      if (m?.slug !== 'rollup') throw new Error(`${persona} has no Rollup vs target`)
      expect(
        m.kpis.map((k) => k.metricId),
        persona,
      ).toEqual(HOME_KEY_FIGURES.rollup.map((k) => k.metricId))
      for (const k of m.kpis) if (k.delta != null) expect(k.deltaLabel, `${persona} ${k.id}`).toMatch(/^vs /)
      expect(m.hero.comparison?.label, persona).toMatch(/^vs /)
      for (const r of m.list.rows)
        expect(
          !ctx.access.scope || positionInScope(r.positionId, ctx.access),
          `${persona} ${r.positionId}`,
        ).toBe(true)
    }
    // The CFO sees the company: no scope narrows the list.
    expect(sampleContext('leader', { persona: 'leader-cfo' }).access.scope).toBeNull()
  })
})

describe('the role homes against a target, and for a year with no locked version (docs/PLAN.md 9.2)', () => {
  const cases = [
    { name: 'FY27 target', opts: { compare: 'target' }, label: 'vs FY27 target', why: TARGET_HAS_NO_MONTHS },
    {
      name: 'FY28 Working',
      opts: { version: 'fy28-working' },
      label: 'vs FY28 target',
      why: 'FY28 has no locked version yet.',
    },
  ] as const

  it('name the target as the comparison of every figure with a change', () => {
    for (const c of cases)
      for (const mode of MODES) {
        const ctx = sampleContext(mode, c.opts)
        expect(ctx.compare.kind, c.name).toBe('target')
        const m = homeModel(ctx)
        if (!m) throw new Error(`${mode} has no home`)
        for (const k of m.kpis)
          if (k.delta != null) expect(k.deltaLabel, `${c.name} ${mode} ${k.id}`).toBe(c.label)
        if (m.hero.comparison) expect(m.hero.comparison.label, `${c.name} ${mode}`).toBe(c.label)
      }
  })

  it('give Unit plan no monthly comparison, with the reason, and the folder tab no plan heads', () => {
    const ctx = sampleContext('hrbp', cases[0].opts)
    const h = (homeModel(ctx) as UnitHomeModel).hero
    expect(h.value).toBe(556)
    expect(h.comparison?.value).toBeNull()
    expect(h.note).toBe(cases[0].why)
    expect(homeHeadline(ctx).label).toBe('heads')
    const later = (homeModel(sampleContext('hrbp', cases[1].opts)) as UnitHomeModel).hero
    expect(later.value).toBeNull()
    expect(later.reason).toBe('No month of FY28 is closed yet.')
  })

  it('compare Plan vs actual’s full-year cost with the target cost Targets > Gap shows', () => {
    for (const c of cases) {
      const ctx = sampleContext('finance', c.opts)
      const h = (homeModel(ctx) as FinHomeModel).hero
      expect(h.title, c.name).toBe(`Full-year cost ${c.label}`)
      expect(h.comparison?.value, c.name).not.toBeNull()
      const t = forecastModel(ctx).overview.kpis.find((k) => k.metricId === FORECAST.costFullYear)
      // The forecast tile's change against the target is the hero's value less its comparison.
      expect((h.value ?? 0) - (h.comparison?.value ?? 0), c.name).toBeCloseTo(t?.delta ?? Number.NaN, 0)
    }
  })
})
