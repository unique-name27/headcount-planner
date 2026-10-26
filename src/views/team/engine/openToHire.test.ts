/**
 * My team's Open to hire tile (docs/PLAN.md 9.7 Homes, change C36; the hiring freeze H11): Plan >
 * Hiring's own headline tile for the tree, beside the hero Left to fill, not an eighth key figure.
 * Plan > Hiring's model is stood in here (the tile is only composition: the sample's own numbers are
 * checked in ./team.test.ts), so these tests read exactly what My team does with what it is given:
 * the tab's value, records and fields kept, the label "Open to hire, FY27", the link to Plan > Hiring,
 * `OPEN_TO_HIRE_NOTE` after the tab's own note, nothing read or shown with no manager picked, and the
 * seven key figures and the hero as they were.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { TEAM_HIRING_FIGURE } from '@/access/ids'
import { MODES } from '@/access/modes'
import { decide } from '@/access/policy'
import { samplePicks } from '@/access/store'
import type { Kpi } from '@/components/types'
import { type AnalyticsContext, buildContext } from '@/data/context'
import { SAMPLE_AS_OF } from '@/data/sample'
import { DEFAULT_FILTERS } from '@/data/scope'
import { MemoryStorage } from '@/testkit/memoryStorage'
import { OPEN_TO_HIRE_NOTE } from '@/views/plan/engine/hiringTab'
import { ID as PLAN } from '@/views/plan/metrics'
import { TEAM_FIGURES, TEAM_HIRING, TEAM_KEY_METRICS } from './figures'
import { teamModel } from './index'
import { sampleContext, sampleSources, teamSample } from './testkit'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
vi.stubGlobal('localStorage', new MemoryStorage())

const fx = vi.hoisted(() => ({ hiring: null as unknown, reads: 0 }))
vi.mock('@/views/plan/engine/hiringTab', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/views/plan/engine/hiringTab')>()),
  planHiringModel: () => {
    fx.reads++
    return fx.hiring
  },
}))

const drill = () => ({ kind: 'positions' as const, title: 'Open to hire', rows: [] })

/** Plan > Hiring's strip for the tree, as the tab hands it over (heads only). */
function standIn(note?: string): { fiscalYear: string; kpis: Kpi[] } {
  return {
    fiscalYear: 'FY27',
    kpis: [
      {
        id: 'hiring-open',
        metricId: PLAN.hiringOpen,
        label: 'Open to hire',
        value: 2,
        format: 'int',
        tab: 'hiring',
        drill,
        uses: ['positions.positionId', 'workers.hireDate'],
        ...(note ? { note } : {}),
      },
      {
        id: 'hiring-accepted',
        metricId: PLAN.hiringAcceptedStarts,
        label: 'Accepted starts to come',
        value: 1,
        format: 'int',
      },
    ],
  }
}

/** Manager mode with no manager picked: My team holds no tree. */
function unsetManager(): AnalyticsContext {
  const sample = teamSample()
  return buildContext({
    data: sample.datasets,
    sources: sampleSources(sample),
    filters: DEFAULT_FILTERS,
    asOfOverride: null,
    today: SAMPLE_AS_OF,
    mode: 'manager',
    actingAs: { ...samplePicks(sample.personas), manager: null },
    plan: sample.plan,
    picks: { version: null, compare: null },
  })
}

const manager = () => sampleContext('manager', { persona: 'manager-a' })

beforeAll(() => {
  teamSample()
}, 120_000)

describe('My team’s Open to hire (9.7 Homes)', () => {
  it('is Plan > Hiring’s own tile, labelled "Open to hire, FY27", opening Plan > Hiring', () => {
    fx.hiring = standIn('Over by 1')
    const t = teamModel(manager()).openToHire
    expect(t?.id).toBe('hiring-open')
    expect(t?.metricId).toBe(TEAM_HIRING.metricId)
    expect(t?.label).toBe('Open to hire, FY27')
    expect(t?.link).toEqual({ view: 'plan', tab: 'hiring', label: 'Plan, Hiring' })
    expect(t?.tab).toBeUndefined()
    // The tab's number, records and fields, never recomputed here.
    expect([t?.value, t?.format, t?.drill, t?.uses]).toEqual([
      2,
      'int',
      drill,
      ['positions.positionId', 'workers.hireDate'],
    ])
  })

  it('carries the note that sets it against Left to fill, after the tab’s own note', () => {
    fx.hiring = standIn('Over by 1')
    expect(teamModel(manager()).openToHire?.note).toBe(`Over by 1. ${OPEN_TO_HIRE_NOTE}`)
    fx.hiring = standIn('3 open seats, 1 not in plan.')
    expect(teamModel(manager()).openToHire?.note).toBe(`3 open seats, 1 not in plan. ${OPEN_TO_HIRE_NOTE}`)
    fx.hiring = standIn()
    expect(teamModel(manager()).openToHire?.note).toBe(OPEN_TO_HIRE_NOTE)
    expect(OPEN_TO_HIRE_NOTE).toMatch(/^Left to fill counts Open and Planned seats\./)
  })

  it('reads nothing and shows nothing with no manager picked', () => {
    fx.hiring = standIn()
    fx.reads = 0
    const m = teamModel(unsetManager())
    expect(m.openToHire).toBeNull()
    expect(fx.reads).toBe(0)
    teamModel(manager())
    expect(fx.reads).toBe(1)
  })

  it('is left out, never made up, when Plan > Hiring has no such tile', () => {
    fx.hiring = { ...standIn(), kpis: standIn().kpis.slice(1) }
    expect(teamModel(manager()).openToHire).toBeNull()
  })

  it('sits beside the hero, not among the seven key figures, which stay as they were', () => {
    fx.hiring = standIn()
    const m = teamModel(manager())
    expect(m.kpis.map((k) => k.metricId)).toEqual(TEAM_KEY_METRICS)
    expect(m.kpis).toHaveLength(7)
    expect(m.kpis.some((k) => k.metricId === PLAN.hiringOpen)).toBe(false)
    expect(m.hero.id).toBe(TEAM_FIGURES.hero)
    expect(m.hero.metric).not.toBe(PLAN.hiringOpen)
  })

  it('has its own figure id, shown in Manager mode only (its view)', () => {
    expect(TEAM_FIGURES.openToHire).toBe(TEAM_HIRING.figure)
    expect(TEAM_HIRING.figure).toBe(TEAM_HIRING_FIGURE)
    for (const mode of MODES)
      expect(decide(mode, `figure:${TEAM_FIGURES.openToHire}`).access !== 'hidden', mode).toBe(
        mode === 'manager',
      )
  })

  it('carries no amount: the tile is heads', () => {
    fx.hiring = standIn('Over by 1')
    const t = teamModel(manager()).openToHire
    expect(JSON.stringify({ ...t, drill: undefined })).not.toMatch(
      /[$€£¥₹₪]|\b(USD|EUR|INR|ILS)\b|\b(band|salary|offer amount|leave)\b/i,
    )
  })
})
