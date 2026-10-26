/**
 * Forecast > Bridge under the guard (docs/PLAN.md 6.8, 7.2 rule 5, 7.3c, 9.2): exact modes start on
 * the comparison's total and end on the forecast's, the steps adding up to the difference in whole
 * cents; the FX step is the FX formula on the same lines (story 5's hand calculations to the cent);
 * a step with fewer than 5 contributors folds into "Other changes"; rounded modes read whole $0.1M
 * steps that close on the end; Manager mode and a target comparison draw nothing.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { FINANCE_FILTER_NOTE } from '@/cost/fit'
import { isRoundedCost } from '@/lib/costRounding'
import { seatViewerContexts } from '@/testkit/sample'
import { type BridgeStepRow, forecastModel } from '.'
import { prepare } from './base'
import { bridgeRows, bridgeWindow, fxEffectOf, type StepValue, stepFacts } from './bridge'
import { forecastCost } from './cost'
import { sample, sampleCtx, withData } from './fixtures'

beforeAll(() => {
  sample()
}, 60_000)

const cents = (v: number) => Math.round(v * 100)

describe('the exact bridge', () => {
  it('starts on the comparison, ends on the forecast, and its steps add up in whole cents', () => {
    const p = prepare(sampleCtx('hr-admin', { showPay: true, filters: { businessUnit: ['Go-to-Market'] } }))
    const w = bridgeWindow(p, p.fyMonths)
    expect(w.reason).toBeNull()
    const c = forecastCost(p)
    expect(w.end).toBeCloseTo(c.fullYear?.figure.total.totalUsd ?? Number.NaN, 2)
    // Story 1: the Go-to-Market forecast and its Budget total (src/data/sample/stories.ts).
    const fin = prepare(sampleCtx('finance', { filters: { businessUnit: ['Go-to-Market'] } }))
    const fw = bridgeWindow(fin, fin.fyMonths)
    expect(fw.start).toBeCloseTo(32_316_099.11, 2)
    expect(fw.end).toBeCloseTo(34_252_218.32, 2)
    const sum = fw.steps.reduce((a, s) => a + cents(s.value), 0)
    expect(sum).toBe(cents(fw.end as number) - cents(fw.start as number))
  })

  it('folds steps under 5 contributors into Other changes and still closes', () => {
    const m = forecastModel(sampleCtx('finance'))
    const rows = m.bridge.steps.rows
    expect(rows[0].kind).toBe('start')
    expect(rows[rows.length - 1].kind).toBe('end')
    // Rule 5: 0 or 5 or more positions; a row of nobody reads 0 (the transfers step, R39).
    for (const r of rows)
      if (r.kind === 'step' && r.contributors != null) {
        expect(r.contributors === 0 || r.contributors >= 5, `${r.key}: ${r.contributors}`).toBe(true)
        if (r.contributors === 0) expect(r.value, r.key).toBe(0)
      }
    const shown = rows.filter((r) => r.kind !== 'start' && r.kind !== 'end')
    if (shown.every((r) => r.value != null)) {
      const sum = shown.reduce((a, r) => a + cents(r.value as number), 0)
      expect(sum).toBe(cents(rows[rows.length - 1].value as number) - cents(rows[0].value as number))
    }
  })
})

describe('story 5: EUR and ILS against the Budget', () => {
  it('reads Munich’s and Haifa’s FX effects to the cent, and none elsewhere', () => {
    const fx = (location: string) => {
      const p = prepare(
        sampleCtx('hr-admin', { showPay: true, compare: 'fy27-budget', filters: { location: [location] } }),
      )
      return fxEffectOf(p, p.fyMonths).value
    }
    expect(fx('Munich')).toBeCloseTo(367_663.38, 2)
    expect(fx('Haifa')).toBeCloseTo(417_881.52, 2)
    expect(fx('San Jose')).toBeCloseTo(0, 2)
  })

  it('shows Finance no FX effect under a country filter: cost filters are whole units (C33)', () => {
    // Before C33 Finance read Germany's and Israel's effects under a country filter, and two
    // cost-center selections gave an FX effect of 1 to 4 positions (RF-5). Countries are rows of a
    // unit's breakdown now, never cost filters; the unit and the company still show theirs.
    for (const country of ['Germany', 'Israel']) {
      const p = prepare(sampleCtx('finance', { filters: { country: [country] } }))
      const g = fxEffectOf(p, p.fyMonths)
      expect(g.value, country).toBeNull()
      expect(g.reason, country).toBe(FINANCE_FILTER_NOTE)
    }
  })
})

describe('the rounded bridge', () => {
  it('reads whole $0.1M steps that close on the end, its end a rounded total', () => {
    for (const mode of ['hrbp', 'leader'] as const) {
      const p = prepare(sampleCtx(mode))
      const b = bridgeRows(p)
      expect(b.empty, mode).toBeNull()
      const start = b.rows[0].value as number
      const end = b.rows[b.rows.length - 1].value as number
      expect(isRoundedCost(start) && isRoundedCost(end), mode).toBe(true)
      const between = b.rows.slice(1, -1)
      for (const r of between)
        if (r.value != null) expect(isRoundedCost(r.value), `${mode} ${r.key}`).toBe(true)
      if (between.every((r) => r.value != null))
        expect(between.reduce((a, r) => a + (r.value as number), 0)).toBeCloseTo(end - start, 6)
    }
  })
})

describe('band rows (7.2 rules 3 and 5)', () => {
  const step = (over: Partial<StepValue>): StepValue => ({
    key: 'timing',
    label: 'Timing',
    value: 1_000,
    contributors: new Set<string>(),
    band: false,
    bandValue: 400,
    bandBefore: 10_000,
    bandAfter: 10_400,
    bandMoved: new Set(['P-1']),
    bandAny: true,
    moves: true,
    ...over,
  })
  const parts = (s: StepValue) =>
    stepFacts(s, 5, false).map((f) => `${f.part}:${f.delta}:${f.contributors.size}`)

  it('keeps a step’s band part on its row while its 1 to 4 costed movers fold into Other changes', () => {
    expect(parts(step({ band: true, value: 400 }))).toEqual(['band:400:0'])
    expect(parts(step({ contributors: new Set(['A', 'B', 'C']) }))).toEqual(['band:400:0', 'costed:600:3'])
    const five = new Set(['A', 'B', 'C', 'D', 'E'])
    expect(parts(step({ contributors: five }))).toEqual(['whole:1000:5'])
    // A step that moves no band seat folds whole, as before.
    expect(parts(step({ contributors: new Set(['A']), bandAny: false, bandValue: 0 }))).toEqual([
      'whole:1000:1',
    ])
  })

  it('decides the band row from band seats alone, whatever its band part rounds to', () => {
    // Rounded: the band seats moved but their rounded subtotal did not; the row still shows, at $0.
    expect(
      stepFacts(step({ contributors: new Set(['A']), bandValue: 0 }), 5, true).map((f) => f.part),
    ).toEqual(['band', 'costed'])
  })

  it('keeps every band row, its value and card, when one person’s leave changes', () => {
    const s = sample()
    const onLeave = s.datasets.workers
      .filter(
        (w) =>
          w.workerType === 'Employee' &&
          !!w.positionId &&
          w.onLeave === true &&
          w.leavePaid !== false &&
          !w.assignmentEnd &&
          !w.terminationDate,
      )
      .sort((a, b) => (a.employeeId < b.employeeId ? -1 : 1))
      .slice(0, 4)
    expect(onLeave.length).toBeGreaterThan(0)
    const bandRows = (rows: readonly BridgeStepRow[]) =>
      rows
        .filter((r) => r.kind === 'step' && r.contributors == null)
        .map((r) => {
          const card = typeof r.calc === 'function' ? r.calc() : null
          return JSON.stringify([
            r.key,
            r.value,
            card?.inputs.map((i) => i.label),
            card?.steps.map((x) => x.label),
          ])
        })
    let seen = 0
    for (const w of onLeave) {
      const viewer = seatViewerContexts(s, w.positionId as string).find((v) => v.key.startsWith('leader'))
      if (!viewer) continue
      const changed = withData({
        workers: s.datasets.workers.map((x) =>
          x.employeeId === w.employeeId ? { ...x, leavePaid: false } : x,
        ),
      })
      const before = bandRows(bridgeRows(prepare(viewer.ctx(s))).rows)
      const after = bandRows(bridgeRows(prepare(viewer.ctx(changed))).rows)
      expect(after, `${w.employeeId} ${viewer.key}`).toEqual(before)
      seen += before.length
    }
    expect(seen).toBeGreaterThan(0)
  })
})

describe('nothing to draw', () => {
  it('in Manager mode', () => {
    expect(forecastModel(sampleCtx('manager')).bridge.steps.rows).toEqual([])
  })

  it('against a target', () => {
    const b = forecastModel(sampleCtx('finance', { compare: 'target' })).bridge.steps
    expect(b.rows).toEqual([])
    expect(b.empty).toBe('A target has no monthly plan. Pick a version to compare.')
    const fy28 = forecastModel(sampleCtx('finance', { version: 'fy28-working' })).bridge.steps
    expect(fy28.empty).toBe('FY28 has no locked version yet.')
  })
})
