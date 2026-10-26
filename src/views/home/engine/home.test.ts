/**
 * The role homes' model (docs/PLAN.md 9.3): a home never computes a number. Its key figures are the
 * producing tabs' own tiles re-linked by metric id (`tile()`), in `HOME_KEY_FIGURES` order and count
 * (HRBP 6, Leader 6, Finance 6, with Plan > Hiring's Open to hire on the first two, 9.7), each
 * naming its comparison; the Leader's "Cost vs target" and
 * Finance's "FX effect YTD" are the two model fields 9.3 names, not their strips' tiles; the heroes,
 * lists and other figures are the producers' numbers and rows under the home's own figure ids; a
 * producer's row outside the mode's scope never reaches a home (the scope test); the folder tab's
 * headline per mode; and Manager mode and HR admin have no role home.
 *
 * The producing views' models are stood in for here (the home is only composition), so these tests
 * read exactly what the home does with what it is given. The sample gives the real modes, picks and
 * scopes.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { Kpi } from '@/components/types'
import type { AnalyticsContext } from '@/data/context'
import { resolveDrill } from '@/drill/types'
import { TARGET_HAS_NO_MONTHS } from '@/plan/engine/variance'
import { MemoryStorage } from '@/testkit/memoryStorage'
import { ID as FORECAST } from '@/views/forecast/metrics'
import { ID as PLAN } from '@/views/plan/metrics'
import { sampleContext } from '@/views/team/engine/testkit'
import type { FigureData } from '../../types'
import {
  HIRING_KEY_FIGURE,
  HIRING_TILE_AT,
  HOME_FIGURES,
  HOME_KEY_COUNT_WITH_HIRING,
  HOME_KEY_FIGURES,
  SHARED,
} from './figures'
import { k, producerFixtures } from './fixtures'
import {
  type FinHomeModel,
  homeHeadline,
  homeModel,
  homeTitle,
  type RollupHomeModel,
  type UnitHomeModel,
} from './index'
import { tile } from './kpis'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
vi.stubGlobal('localStorage', new MemoryStorage())

/** The producing models the home is handed (stand-ins; the real ones are their builders'). */
const fx = vi.hoisted(() => ({
  plan: null as unknown,
  hiring: null as unknown,
  hiringReads: [] as string[],
  forecast: null as unknown,
  targets: null as unknown,
  requests: null as unknown,
  finance: null as unknown,
}))
vi.mock('@/views/plan/engine', () => ({ planModel: () => fx.plan }))
// Plan > Hiring is its own model (reading H10): the stand-in, and the modes that read it.
vi.mock('@/views/plan/engine/hiringTab', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/views/plan/engine/hiringTab')>()),
  planHiringModel: (ctx: AnalyticsContext) => {
    fx.hiringReads.push(ctx.access.mode)
    return fx.hiring
  },
}))
vi.mock('@/views/forecast/engine', () => ({ forecastModel: () => fx.forecast }))
vi.mock('@/views/targets/engine', () => ({
  targetsModel: () => fx.targets,
  targetsHeadline: () => ({ value: '−18', label: 'gap in heads', metricId: 'targets.gap.heads' }),
}))
vi.mock('@/views/requests/engine', () => ({ requestsModel: () => fx.requests }))
vi.mock('@/views/finance/engine', () => ({ financeModel: () => fx.finance }))

let hrbp: AnalyticsContext
let leader: AnalyticsContext
let finance: AnalyticsContext
let actualCell: ReturnType<typeof producerFixtures>['actualCell']

beforeAll(() => {
  hrbp = sampleContext('hrbp')
  leader = sampleContext('leader')
  finance = sampleContext('finance')
  const tree = leader.access.scope?.kind === 'tree' ? [...leader.access.scope.positionIds] : []
  const p = producerFixtures(tree)
  fx.plan = p.plan
  fx.hiring = p.hiring
  fx.forecast = p.forecast
  fx.targets = p.targets
  fx.requests = p.requests
  fx.finance = p.finance
  actualCell = p.actualCell
}, 120_000)

const unit = () => homeModel(hrbp) as UnitHomeModel
const rollup = () => homeModel(leader) as RollupHomeModel
const fin = () => homeModel(finance) as FinHomeModel

describe('which home each mode opens', () => {
  it('is Unit plan, Rollup vs target and Plan vs actual, and none in Manager mode or HR admin', () => {
    expect(unit().slug).toBe('unit')
    expect(rollup().slug).toBe('rollup')
    expect(fin().slug).toBe('fin')
    expect(homeModel(sampleContext('manager'))).toBeNull()
    expect(homeModel(sampleContext('hr-admin'))).toBeNull()
    expect([unit().title, rollup().title, fin().title]).toEqual([
      homeTitle('hrbp'),
      homeTitle('leader'),
      homeTitle('finance'),
    ])
  })
})

describe('key figures (docs/PLAN.md 9.3)', () => {
  it('resolve every metric 9.3 and 9.7 name to exactly one tile, in order (6, 6 and 6)', () => {
    for (const m of [unit(), rollup(), fin()]) {
      expect(m.kpis.map((t) => t.metricId)).toEqual(HOME_KEY_FIGURES[m.slug].map((x) => x.metricId))
      expect(m.kpis).toHaveLength(HOME_KEY_FIGURES[m.slug].length)
      expect(m.kpis, m.slug).toHaveLength(HOME_KEY_COUNT_WITH_HIRING[m.slug])
      // 9.3's rule: 5 to 7 key figures on every home.
      expect(m.kpis.length, m.slug).toBeGreaterThanOrEqual(5)
      expect(m.kpis.length, m.slug).toBeLessThanOrEqual(7)
    }
  })

  it('are the producers’ own numbers, re-linked to the tab they come from', () => {
    for (const m of [unit(), rollup(), fin()])
      HOME_KEY_FIGURES[m.slug].forEach((src, i) => {
        const t = m.kpis[i]
        expect(t.tab, t.id).toBeUndefined()
        expect(t.link?.view, t.id).toBe(src.view)
        expect(t.link?.tab, t.id).toBe(src.tab)
        expect(t.link?.label, t.id).toMatch(/^[A-Z][a-z ]+, [A-Z]/)
      })
    const p = fx.plan as { overview: { kpis: Kpi[] } }
    const heads = unit().kpis[0]
    const own = p.overview.kpis[0]
    expect([heads.value, heads.delta, heads.deltaLabel, heads.drill]).toEqual([
      own.value,
      own.delta,
      own.deltaLabel,
      own.drill,
    ])
  })

  it('take the Leader’s cost vs target and Finance’s FX effect YTD from the model fields 9.3 names', () => {
    expect(rollup().kpis[1].id).toBe('cost-vs-target')
    expect(rollup().kpis[1].deltaLabel).toBe('vs FY27 target')
    expect(fin().kpis[3].id).toBe('fx-ytd')
    expect(fin().kpis[3].value).toBe(785_544.9)
  })

  it('name the comparison of every figure that has a change', () => {
    for (const m of [unit(), rollup(), fin()])
      for (const t of m.kpis) if (t.delta != null) expect(t.deltaLabel, t.id).toMatch(/^vs /)
  })

  it('leave a tile out when its producer has none (tile() returns nothing)', () => {
    expect(tile([k(PLAN.headsActual, 1)], PLAN.hiresYtd)).toEqual([])
    const linked = {
      ...k(PLAN.headsActual, 1),
      link: { view: 'plan' as const, tab: 'overview', label: 'Plan, Overview' },
    }
    expect(tile([linked], PLAN.headsActual, { view: 'forecast', label: 'x' })[0].link?.view).toBe('plan')
  })
})

describe('Open to hire on the HRBP and Leader homes (docs/PLAN.md 9.7 Homes)', () => {
  const own = () => (fx.hiring as { kpis: Kpi[] }).kpis[0]

  it('sits at HIRING_TILE_AT: after Openings past target start, and after Year-end gap', () => {
    expect(unit().kpis[HIRING_TILE_AT.unit].metricId).toBe(PLAN.hiringOpen)
    expect(unit().kpis[HIRING_TILE_AT.unit - 1].metricId).toBe(PLAN.openingsPastStart)
    expect(rollup().kpis[HIRING_TILE_AT.rollup].metricId).toBe(PLAN.hiringOpen)
    expect(rollup().kpis[HIRING_TILE_AT.rollup - 1].metricId).toBe('targets.gap.heads')
    expect(HOME_KEY_FIGURES.unit[HIRING_TILE_AT.unit]).toEqual(HIRING_KEY_FIGURE)
    expect(HOME_KEY_FIGURES.rollup[HIRING_TILE_AT.rollup]).toEqual(HIRING_KEY_FIGURE)
  })

  it('is Plan > Hiring’s own tile, labelled "Open to hire, FY27", opening Plan > Hiring', () => {
    for (const m of [unit(), rollup()]) {
      const t = m.kpis.find((x) => x.metricId === PLAN.hiringOpen)
      expect(t?.label, m.slug).toBe('Open to hire, FY27')
      expect(t?.link, m.slug).toEqual({ view: 'plan', tab: 'hiring', label: 'Plan, Hiring' })
      expect(t?.tab, m.slug).toBeUndefined()
      // The producer's number, records and note, never recomputed (9.3: a home computes nothing).
      expect([t?.id, t?.value, t?.format, t?.drill, t?.note, t?.uses], m.slug).toEqual([
        own().id,
        own().value,
        own().format,
        own().drill,
        own().note,
        own().uses,
      ])
    }
  })

  it('takes the fiscal year Plan > Hiring shows into its label', () => {
    const saved = fx.hiring as { fiscalYear: string }
    fx.hiring = { ...saved, fiscalYear: 'FY28' }
    try {
      const m = homeModel(sampleContext('hrbp')) as UnitHomeModel
      expect(m.kpis.find((x) => x.metricId === PLAN.hiringOpen)?.label).toBe('Open to hire, FY28')
    } finally {
      fx.hiring = saved
    }
  })

  it('leaves Plan vs actual as it was: no Open to hire, and Plan > Hiring not read', () => {
    expect(fin().kpis.some((t) => t.metricId === PLAN.hiringOpen)).toBe(false)
    fx.hiringReads.length = 0
    homeModel(sampleContext('finance'))
    expect(fx.hiringReads).toEqual([])
    homeModel(sampleContext('leader'))
    expect(fx.hiringReads).toEqual(['leader'])
  })

  it('is left out, never made up, when Plan > Hiring has no such tile (the strip is short by one)', () => {
    const saved = fx.hiring as { kpis: Kpi[] }
    fx.hiring = { ...saved, kpis: saved.kpis.slice(1) }
    try {
      const m = homeModel(sampleContext('hrbp')) as UnitHomeModel
      expect(m.kpis.some((x) => x.metricId === PLAN.hiringOpen)).toBe(false)
      expect(m.kpis).toHaveLength(HOME_KEY_FIGURES.unit.length - 1)
    } finally {
      fx.hiring = saved
    }
  })

  it('carries no amount: the tile is heads', () => {
    for (const m of [unit(), rollup()]) {
      const t = m.kpis.find((x) => x.metricId === PLAN.hiringOpen)
      expect(t?.format, m.slug).toBe('int')
      expect(JSON.stringify({ ...t, drill: undefined }), m.slug).not.toMatch(/[$€£¥₹₪]|\b(USD|EUR|INR|ILS)\b/)
    }
  })
})

describe('heroes', () => {
  it('Unit plan: actual heads at the last closed month-end against the comparison, opening that cell’s records', () => {
    const h = unit().hero
    expect(h.id).toBe(HOME_FIGURES.unit[0])
    expect(h.value).toBe(556)
    expect(h.comparison).toEqual({ label: 'vs plan of record (Q1 Reforecast)', value: 566 })
    expect(h.label).toBe('heads at 30 Sep 2026')
    expect(resolveDrill(h.drill)?.rows).toHaveLength(556)
    expect(actualCell).toHaveBeenCalled()
    expect(h.parts).toEqual([])
  })

  it('Rollup vs target: the year-end heads tile against the target heads tile', () => {
    const h = rollup().hero
    expect(h.id).toBe(HOME_FIGURES.rollup[0])
    expect([h.value, h.format, h.comparison]).toEqual([
      640.4,
      'num1',
      { label: 'vs FY27 target', value: 644 },
    ])
  })

  it('Plan vs actual: the full-year cost tile against the company’s full-year comparison', () => {
    const h = fin().hero
    expect(h.id).toBe(HOME_FIGURES.fin[0])
    expect([h.value, h.format]).toEqual([93_800_000, 'moneyM'])
    expect(h.comparison).toEqual({ label: 'vs plan of record (Q1 Reforecast)', value: 245_000_000 })
  })

  it('reads "—" with the producer’s reason when the producer hides the number', () => {
    const f = fx.forecast as { overview: { kpis: Kpi[] } }
    const saved = f.overview.kpis
    f.overview.kpis = [
      { ...saved[0], suppressed: true, suppressedNote: 'Hidden to protect anonymity (n < 5)' },
      saved[1],
    ]
    // A new context, so the cached model is not reused.
    const h = homeModel(sampleContext('leader')) as RollupHomeModel
    f.overview.kpis = saved
    expect(h.hero.value).toBeNull()
    expect(h.hero.reason).toBe('Hidden to protect anonymity (n < 5)')
  })
})

describe('heroes against a target comparison (docs/PLAN.md 9.2)', () => {
  it('Unit plan compares with nothing and says why, as the producer’s monthly tile does', () => {
    const ctx = sampleContext('hrbp', { compare: 'target' })
    expect(ctx.compare.kind).toBe('target')
    const h = (homeModel(ctx) as UnitHomeModel).hero
    expect(h.value).toBe(556)
    expect(h.comparison).toEqual({ label: 'vs FY27 target', value: null })
    expect(h.note).toBe(TARGET_HAS_NO_MONTHS)
    expect(homeHeadline(ctx).label).toBe('heads')
  })

  it('Plan vs actual compares the full-year cost with Targets > Gap’s target cost, and is titled by it', () => {
    const ctx = sampleContext('finance', { compare: 'target' })
    const h = (homeModel(ctx) as FinHomeModel).hero
    // The stand-in tile names its own comparison; the hero takes the tile’s words.
    expect(h.comparison).toEqual({ label: 'vs plan of record (Q1 Reforecast)', value: 240_000_000 })
    expect(h.title).toBe('Full-year cost vs plan of record (Q1 Reforecast)')
  })

  it('name the comparison in the Plan vs actual title under a version comparison too', () => {
    expect(fin().hero.title).toBe(`Full-year cost ${fin().hero.comparison?.label}`)
  })

  it('Unit plan says which year has no closed month for a later fiscal year', () => {
    const p = fx.plan as { overview: { headsByMonth: FigureData<{ actual: number | null }> } }
    const saved = p.overview.headsByMonth
    p.overview.headsByMonth = { ...saved, rows: saved.rows.map((r) => ({ ...r, actual: null })) }
    try {
      const h = (homeModel(sampleContext('hrbp', { version: 'fy28-working' })) as UnitHomeModel).hero
      expect(h.value).toBeNull()
      expect(h.reason).toBe('No month of FY28 is closed yet.')
    } finally {
      p.overview.headsByMonth = saved
    }
  })
})

describe('lists and other figures keep to the scope (the scope test)', () => {
  it('Unit plan lists only the unit’s open requests, by step, under the home’s own ids', () => {
    const m = unit()
    expect(m.list.id).toBe('home-list')
    expect(m.list.rows.map((r) => r.requestId)).toEqual(['R-2', 'R-1', 'R-5'])
    expect(m.openings.id).toBe('home-unit-openings')
    expect(m.forecast.id).toBe('home-unit-forecast')
    expect(m.openings.rows).toBe(
      (fx.plan as { overview: { openingsByStage: FigureData<object> } }).overview.openingsByStage.rows,
    )
  })

  it('Rollup vs target lists only sub-orgs inside the leader’s tree', () => {
    const m = rollup()
    expect(m.list.rows.map((r) => r.positionId)).not.toContain('P-OUTSIDE')
    expect(m.list.rows).toHaveLength(2)
    expect(m.suborgs.id).toBe('home-rollup-suborgs')
    expect(m.suborgs.rows).toEqual(m.list.rows)
  })

  it('Plan vs actual lists the units by full-year cost variance, largest first', () => {
    const m = fin()
    expect(m.list.rows.map((r) => r.org)).toEqual(['Operations', 'Silicon Engineering', 'Go-to-Market'])
    expect(m.costByUnit.rows.map((r) => r.org)).toEqual(['Go-to-Market', 'Operations', 'Silicon Engineering'])
    expect(m.bridge.id).toBe('home-fin-bridge')
    expect(m.costByUnit.id).toBe('home-fin-cost-unit')
  })

  it('say why a list is empty: the producer’s reason first, else the home’s own words', () => {
    const r = fx.requests as { queue: { rows: FigureData<object> } }
    const saved = r.queue.rows
    r.queue.rows = { ...saved, rows: [] }
    try {
      expect((homeModel(sampleContext('hrbp')) as UnitHomeModel).list.empty).toBe(
        'No open requests in the unit.',
      )
      r.queue.rows = { ...saved, rows: [], empty: 'A target has no monthly plan.' }
      expect((homeModel(sampleContext('hrbp')) as UnitHomeModel).list.empty).toBe(
        'A target has no monthly plan.',
      )
    } finally {
      r.queue.rows = saved
    }
    expect(unit().list.empty).toBeNull()
  })

  it('draw exactly the figure ids each home lists, beside Needs attention’s two', () => {
    const ids = (m: UnitHomeModel | RollupHomeModel | FinHomeModel) => {
      const own =
        m.slug === 'unit'
          ? [m.openings.id, m.forecast.id, m.changes.id]
          : m.slug === 'rollup'
            ? [m.suborgs.id]
            : [m.bridge.id, m.costByUnit.id]
      return [m.hero.id, `home-${m.slug}-kpis`, ...SHARED, ...own]
    }
    for (const m of [unit(), rollup(), fin()])
      expect(new Set(ids(m)), m.slug).toEqual(new Set(HOME_FIGURES[m.slug]))
  })
})

describe('the folder tab’s headline', () => {
  it('is heads vs plan, the year-end gap and the full-year cost, per mode', () => {
    expect(homeHeadline(hrbp)).toMatchObject({
      value: '556',
      label: 'heads, vs plan of record (Q1 Reforecast): 566 plan heads',
      metricId: PLAN.headsActual,
    })
    // Another comparison gives other words, never the same "plan" (RC-6).
    expect(homeHeadline(sampleContext('hrbp', { compare: 'fy27-budget' })).label).toBe(
      'heads, vs FY27 Budget: 566 plan heads',
    )
    expect(homeHeadline(leader)).toMatchObject({ value: '−18', metricId: 'targets.gap.heads' })
    expect(homeHeadline(finance)).toMatchObject({ value: '$93.8M', metricId: FORECAST.costFullYear })
    expect(homeHeadline(finance).label).toBe('full-year cost, +$1.4M vs plan of record (Q1 Reforecast)')
  })
})
