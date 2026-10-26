/**
 * Every shown Finance total is affine in each Finance-editable rate (docs/PLAN.md 7.4 (b), 16.1).
 * Finance edits FX, burden rates, benefits, equity and severance months; a total that bent with one
 * of them (a cap, a cutoff, a step) would let a sweep of the value read single salaries out of exact
 * totals, which is why caps, dates, cutoffs and the pay percentages are import-only (7.4,
 * assumptionEdits.slow.test.ts checks those and the edits' contributors).
 *
 * Totals are Working FY27's own lines and its forecast, by source, unit, cost center and month, every
 * amount field. For each value, 22 seeded random points across its allowed range: every total at
 * each of the 20 inner points lies on the line through the totals at the two outer points, to the
 * cent. That is the 7.4 check T(v + 2δ) − 2T(v + δ) + T(v) = 0 with steps as wide as the range
 * (two points a step either side of v, unequal), so a bend anywhere between the outer points shows,
 * not only one within 2δ of a point. It sits apart from assumptionEdits.slow.test.ts so each file
 * stays inside the slow project's time budget: every point prices the company again.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { type ModePicks, NO_PICKS } from '@/access/modes'
import { samplePicks } from '@/access/store'
import { type AnalyticsContext, buildContext } from '@/data/context'
import { cachedSample, SAMPLE_AS_OF, type Sample } from '@/data/sample'
import {
  type AssumptionRow,
  assumptionKey,
  DATASET_KEYS,
  type DatasetKey,
  type Datasets,
  type Mode,
} from '@/data/schema'
import { DEFAULT_FILTERS } from '@/data/scope'
import type { SourceMeta } from '@/data/store'
import type { AnyVersion, PlanLine } from '@/plan/types'
import { forecastRunOf } from '@/views/forecast/engine/run'
import { costSeatOf, versionLinesOf } from '@/views/plan/engine/core'
import { COST_FIELDS, memberIdOf } from './guard'

/* ───────────── contexts and totals ───────────── */

const sourcesOf = (data: Datasets): Record<DatasetKey, SourceMeta> =>
  Object.fromEntries(DATASET_KEYS.map((k) => [k, { kind: 'sample', rowCount: data[k].length }])) as Record<
    DatasetKey,
    SourceMeta
  >

function ctxOf(s: Sample, data: Datasets, mode: Mode, picks: ModePicks): AnalyticsContext {
  return buildContext({
    data,
    sources: sourcesOf(data),
    filters: { ...DEFAULT_FILTERS },
    asOfOverride: null,
    today: SAMPLE_AS_OF,
    mode,
    actingAs: picks,
    plan: s.plan,
    showPay: false,
    picks: { version: null, compare: null },
  })
}

const WORKING = 'fy27-working'

/** Working FY27's own lines and its forecast's lines (the plan alone, or the forecast alone, when asked). */
function linesOf(
  ctx: AnalyticsContext,
  which: 'both' | 'plan' | 'forecast',
): { source: string; lines: readonly PlanLine[] }[] {
  const v = ctx.versions.find((x) => x.versionId === WORKING) as AnyVersion
  const out: { source: string; lines: readonly PlanLine[] }[] = []
  if (which !== 'forecast') out.push({ source: 'plan', lines: versionLinesOf(ctx, v) })
  if (which !== 'plan') out.push({ source: 'forecast', lines: forecastRunOf(ctx, v)?.lines ?? [] })
  return out
}

/** The shown Finance totals' cells: every amount field by source, unit, cost center and month. */
function totals(ctx: AnalyticsContext, which: 'both' | 'plan' | 'forecast'): Map<string, number[]> {
  const seatOf = costSeatOf(ctx)
  // Each member's unit and cost center, worked out once.
  const placeOf = new Map<string, string>()
  const out = new Map<string, number[]>()
  for (const { source, lines } of linesOf(ctx, which)) {
    const byPlace = new Map<string, Map<string, number[]>>()
    for (const l of lines) {
      const id = memberIdOf(l)
      let place = placeOf.get(id)
      if (place === undefined) {
        const s = seatOf(id)
        place = `${s?.businessUnit ?? ''}|${s?.costCenter ?? ''}`
        placeOf.set(id, place)
      }
      let byMonth = byPlace.get(place)
      if (!byMonth) {
        byMonth = new Map()
        byPlace.set(place, byMonth)
      }
      let v = byMonth.get(l.month)
      if (!v) {
        v = new Array<number>(COST_FIELDS.length).fill(0)
        byMonth.set(l.month, v)
      }
      for (let i = 0; i < COST_FIELDS.length; i++) v[i] += l.usd[COST_FIELDS[i]]
    }
    for (const [place, byMonth] of byPlace)
      for (const [month, v] of byMonth) out.set(`${source}|${place}|${month}`, v)
  }
  return out
}

/** An assumption row of Working replaced (or added) with a new value. */
function withValue(
  data: Datasets,
  table: AssumptionRow['table'],
  key: string,
  org: string | null,
  value: number,
): Datasets {
  const match = (r: AssumptionRow) =>
    r.version === WORKING && r.table === table && r.key === key && (r.org ?? null) === org
  return {
    ...data,
    assumptions: [...data.assumptions.filter((r) => !match(r)), { version: WORKING, table, org, key, value }],
  }
}

/** Several rows of Working at once (an FX set's every month). */
function withValues(data: Datasets, pick: (r: AssumptionRow) => boolean, value: number): Datasets {
  return {
    ...data,
    assumptions: data.assumptions.map((r) => (r.version === WORKING && pick(r) ? { ...r, value } : r)),
  }
}

/** A seeded generator (mulberry32). */
function prng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/* ───────────── the test ───────────── */

/** The points per value: the two outer ones and the 20 the check is made at. */
const POINTS = 22

describe('every shown Finance total is affine in each Finance-editable rate (7.4 b)', () => {
  let sample: Sample
  let picks: ModePicks

  beforeAll(() => {
    sample = cachedSample()
    picks = { ...NO_PICKS, ...samplePicks(sample.personas) }
  }, 120_000)

  it('lies, at 20 random points across each FX, burden-rate, benefits, equity and severance-months range, on its line to the cent', () => {
    const data = sample.datasets
    const params: {
      label: string
      which: 'both' | 'plan' | 'forecast'
      lo: number
      hi: number
      set: (v: number) => Datasets
    }[] = [
      {
        label: 'EUR plan rate',
        which: 'plan',
        lo: 0.8,
        hi: 1.4,
        set: (v) => withValues(data, (r) => r.table === 'fx' && r.key.startsWith('EUR|plan|'), v),
      },
      {
        label: 'EUR forecast rate',
        which: 'forecast',
        lo: 0.8,
        hi: 1.4,
        set: (v) => withValues(data, (r) => r.table === 'fx' && r.key.startsWith('EUR|forecast|'), v),
      },
      {
        label: 'US social security burden rate',
        which: 'both',
        lo: 0,
        hi: 0.2,
        set: (v) => withValue(data, 'burden', assumptionKey(['United States', 'socialSecurity']), null, v),
      },
      {
        label: 'US benefits',
        which: 'both',
        lo: 0,
        hi: 40_000,
        set: (v) => withValue(data, 'benefits', 'United States', null, v),
      },
      {
        label: 'P4 equity',
        which: 'both',
        lo: 0,
        hi: 100_000,
        set: (v) => withValue(data, 'equity', 'P4', null, v),
      },
      {
        label: 'US severance months',
        which: 'both',
        lo: 0,
        hi: 12,
        set: (v) => withValue(data, 'severance', 'United States', null, v),
      },
    ]
    const rand = prng(20261021)
    const broken: string[] = []
    let checked = 0
    let moving = 0
    for (const p of params) {
      const vs = Array.from({ length: POINTS }, () => p.lo + rand() * (p.hi - p.lo)).sort((x, y) => x - y)
      const t = vs.map((v) => totals(ctxOf(sample, p.set(v), 'finance', picks), p.which))
      const first = t[0]
      const last = t[POINTS - 1]
      const span = vs[POINTS - 1] - vs[0]
      const keys = new Set(t.flatMap((m) => [...m.keys()]))
      const zero = COST_FIELDS.map(() => 0)
      // Per value: the cells off their line, and the worst.
      let off = 0
      let worst = { d: 0, at: '' }
      for (const k of keys) {
        const a = first.get(k) ?? zero
        const b = last.get(k) ?? zero
        if (a.some((x, n) => Math.abs(b[n] - x) > 0.01)) moving++
        for (let i = 1; i < POINTS - 1; i++) {
          const c = t[i].get(k) ?? zero
          const w = (vs[i] - vs[0]) / span
          checked++
          let bent = false
          c.forEach((x, n) => {
            const line = a[n] + w * (b[n] - a[n])
            const d = Math.abs(x - line)
            if (d <= 0.01) return
            bent = true
            if (d > worst.d)
              worst = {
                d,
                at: `${k} ${COST_FIELDS[n]} at ${vs[i]}: ${x.toFixed(2)}, its line ${line.toFixed(2)}`,
              }
          })
          if (bent) off++
        }
      }
      if (off) broken.push(`${p.label}: ${off} cells off their line, the worst ${worst.at}`)
    }
    expect(checked).toBeGreaterThan(10_000)
    // The values move totals (the check is not over constants).
    expect(moving).toBeGreaterThan(100)
    expect(broken).toEqual([])
  }, 900_000)

  it('the control: a capped burden (the US social security cap) bends the totals as its rate does not', () => {
    // The cap is HR admin's and import-only: as a value swept from $150,000 to $200,000, the
    // burden total is no line, which is why Finance may not edit it (7.4).
    const data = sample.datasets
    const key = assumptionKey(['United States', 'socialSecurity'])
    const burdenAt = (cap: number) => {
      let total = 0
      for (const { lines } of linesOf(
        ctxOf(sample, withValue(data, 'burdenCap', key, null, cap), 'hr-admin', picks),
        'plan',
      ))
        for (const l of lines) total += l.usd.burden
      return total
    }
    const [a, m, b] = [150_000, 175_000, 200_000].map(burdenAt)
    expect(Math.abs(m - (a + b) / 2)).toBeGreaterThan(0.01)
  }, 900_000)
})
