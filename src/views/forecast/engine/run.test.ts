/**
 * The forecast read per seat (./run.ts): the cohort lines spread over the seats they come from add
 * up to the engine's lines exactly, field by field, so the whole company reads the engine's own heads
 * and cost month by month; each seat's part is what the seat added to the line (never a share of the
 * line's mix); every line finds a seat; and "Unfilled at horizon" by seat adds up to the engine's.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { isCohortLine } from '@/plan/engine/forecast'
import { prepare } from './base'
import { sample, sampleCtx } from './fixtures'
import { unfilledBySeat } from './kpis'
import { forecastRunOf, isSpreadLine } from './run'

beforeAll(() => {
  sample()
}, 60_000)

describe('the forecast by seat', () => {
  it('adds up to the engine month by month, heads and cost', () => {
    const run = forecastRunOf(sampleCtx('hr-admin'))
    expect(run).not.toBeNull()
    if (!run) return
    expect(run.unplaced).toEqual([])
    const heads = new Map<string, number>()
    const cost = new Map<string, number>()
    for (const l of run.lines) {
      heads.set(l.month, (heads.get(l.month) ?? 0) + l.heads)
      cost.set(l.month, (cost.get(l.month) ?? 0) + l.usd.loaded)
    }
    for (const m of run.detail.months) {
      expect(heads.get(m.month) ?? 0, m.month).toBeCloseTo(m.heads, 6)
      expect(cost.get(m.month) ?? 0, m.month).toBeCloseTo(m.cost.filled.loaded + m.cost.band.loaded, 2)
    }
  })

  it('spreads each cohort line over its seats with weights that add up to 1', () => {
    const run = forecastRunOf(sampleCtx('hr-admin'))
    if (!run) throw new Error('no run')
    const weights = new Map<string, number>()
    for (const l of run.lines)
      if (isSpreadLine(l)) {
        const k = `${l.spreadOf.key}|${l.spreadOf.part}|${l.month}`
        weights.set(k, (weights.get(k) ?? 0) + l.weight)
      }
    const cohorts = run.detail.lines.filter(isCohortLine)
    expect(cohorts.length).toBeGreaterThan(0)
    for (const c of cohorts)
      expect(weights.get(`${c.cohort.key}|${c.cohort.part}|${c.month}`), c.cohort.key).toBeCloseTo(1, 9)
    // HRIS-cohort exits stay in the filled part, backfills less band-cohort exits in the band part.
    for (const l of run.lines)
      if (isSpreadLine(l)) expect(l.basis).toBe(l.spreadOf.part === 'hris' ? 'hris' : 'band')
  })

  it('gives each seat its own part of a cohort line, every field, adding up to the line', () => {
    const run = forecastRunOf(sampleCtx('hr-admin'))
    if (!run) throw new Error('no run')
    const sums = new Map<
      string,
      { local: Record<string, number>; usd: Record<string, number>; heads: number; fte: number }
    >()
    for (const l of run.lines) {
      if (!isSpreadLine(l)) continue
      const k = `${l.spreadOf.key}|${l.spreadOf.part}|${l.month}`
      let s = sums.get(k)
      if (!s) {
        s = { local: {}, usd: {}, heads: 0, fte: 0 }
        sums.set(k, s)
      }
      s.heads += l.heads
      s.fte += l.fte
      for (const [f, v] of Object.entries(l.local)) s.local[f] = (s.local[f] ?? 0) + v
      for (const [f, v] of Object.entries(l.usd)) s.usd[f] = (s.usd[f] ?? 0) + v
    }
    const cohorts = run.detail.lines.filter(isCohortLine)
    for (const c of cohorts) {
      const s = sums.get(`${c.cohort.key}|${c.cohort.part}|${c.month}`)
      expect(s, c.cohort.key).toBeDefined()
      expect(s?.heads, c.cohort.key).toBeCloseTo(c.heads, 9)
      expect(s?.fte, c.cohort.key).toBeCloseTo(c.fte, 9)
      for (const [f, v] of Object.entries(c.local))
        expect(s?.local[f], `${c.cohort.key} local ${f}`).toBeCloseTo(v, 6)
      for (const [f, v] of Object.entries(c.usd))
        expect(s?.usd[f], `${c.cohort.key} usd ${f}`).toBeCloseTo(v, 6)
    }
    // A seat's part is its own: the engine's per-seat parts, as they are, for every spread line.
    const own = new Map(run.detail.cohortParts.map((x) => [`${x.lineId}|${x.positionId}`, x]))
    for (const l of run.lines)
      if (isSpreadLine(l)) {
        const x = own.get(`${l.spreadOf.key}|${l.spreadOf.part}|${l.month}|${l.positionId}`)
        expect(x?.usd, l.positionId).toEqual(l.usd)
      }
  })

  it('counts unfilled openings as the engine does', () => {
    const p = prepare(sampleCtx('hr-admin'))
    let sum = 0
    for (const v of unfilledBySeat(p).values()) sum += v
    expect(sum).toBeCloseTo(p.run?.detail.unfilledAtHorizon ?? -1, 9)
  })

  it('is the shown fiscal year’s Working forecast, whatever version is shown', () => {
    const budget = forecastRunOf(sampleCtx('hr-admin', { version: 'fy27-budget' }))
    const working = forecastRunOf(sampleCtx('hr-admin'))
    expect(budget?.version.versionId).toBe('fy27-working')
    expect(budget).toBe(working)
  })
})

describe('runs with seats in a cohort of their own (review HP-1)', () => {
  it('are one per seat set, apart from the shared run, and only the last 4 are kept', () => {
    const ctx = sampleCtx('hr-admin')
    const shared = forecastRunOf(ctx)
    const ids = [...new Set(ctx.all.positions.map((p) => p.positionId))].sort()
    const sets = Array.from({ length: 6 }, (_, i) => new Set(ids.slice(i * 5, i * 5 + 5)))
    const first = forecastRunOf(ctx, ctx.version, { ownCohort: sets[0] })
    expect(first).not.toBeNull()
    expect(first).not.toBe(shared)
    // The same set reads the same run; an empty set reads the shared one.
    expect(forecastRunOf(ctx, ctx.version, { ownCohort: new Set(sets[0]) })).toBe(first)
    expect(forecastRunOf(ctx, ctx.version, { ownCohort: new Set() })).toBe(shared)
    // Four more sets push the first out: it is built again, and the shared run stays.
    for (const set of sets.slice(1, 5)) forecastRunOf(ctx, ctx.version, { ownCohort: set })
    const again = forecastRunOf(ctx, ctx.version, { ownCohort: sets[0] })
    expect(again).not.toBe(first)
    expect(JSON.stringify(again?.cohorts.get(ids[0]))).toBe(JSON.stringify(first?.cohorts.get(ids[0])))
    expect(forecastRunOf(ctx)).toBe(shared)
  }, 120_000)
})
