/**
 * The bridge in HR admin with Show pay amounts on (docs/PLAN.md 7.5 "exact totals with no minimum",
 * 14.1 "no folds and no suppression"; M4 review SA-4): every step of the engine is its own row with
 * its own value, transfers included, and there is no Other changes row, in a unit where most steps
 * have fewer than 5 contributors (Corporate against the Q1 Reforecast). With the switch off the same
 * scope folds, as Finance's rules say.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { MemoryStorage } from '@/testkit/memoryStorage'
import { leakSample, type SampleCtxOptions, sampleCtx } from '@/testkit/sample'
import { ID, metrics } from '../metrics'
import { prepare } from './base'
import { bridgeRows, bridgeWindow, OPEN_STEP_CARD_NOTE } from './bridge'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
vi.stubGlobal('localStorage', new MemoryStorage())

beforeAll(() => {
  leakSample()
}, 120_000)

const opts: SampleCtxOptions = { filters: { businessUnit: ['Corporate'] }, compare: 'fy27-q1-reforecast' }

describe('the bridge with Show pay amounts on (review SA-4)', () => {
  it('shows every step as its own row and folds nothing', () => {
    const ctx = sampleCtx('hr-admin', { ...opts, showPay: true })
    const p = prepare(ctx)
    const w = bridgeWindow(p, p.fyMonths)
    const { rows, empty } = bridgeRows(p)
    expect(empty).toBeNull()
    expect(rows.some((r) => r.kind === 'other')).toBe(false)
    // At least one step under the minimum, which would fold with the switch off.
    expect(w.steps.some((s) => s.contributors.size > 0 && s.contributors.size < 5)).toBe(true)
    const steps = rows.filter((r) => r.kind === 'step')
    expect(steps.map((r) => r.key)).toEqual(w.steps.map((s) => s.key))
    for (const s of w.steps) {
      const row = steps.find((r) => r.key === s.key)
      expect(row?.value, s.key).toBeCloseTo(s.value, 2)
      // A step made only of band estimates lists no count (M4 recheck SA-4-a).
      const bandOnly = s.band && s.key !== 'transfers' && !s.contributors.size
      expect(row?.contributors, s.key).toBe(bandOnly ? null : s.contributors.size)
    }
    // The steps still add up from start to end.
    const sum = steps.reduce((n, r) => n + (r.value ?? 0), 0)
    expect((w.start ?? 0) + sum).toBeCloseTo(w.end ?? 0, 2)
  })

  it('is what the step’s definition says: nothing folds in HR admin mode with pay amounts shown', () => {
    const def = metrics.find((m) => m.id === ID.bridgeStep)
    expect(def?.population).toContain('In HR admin mode with pay amounts shown nothing folds')
    expect(def?.population).not.toContain('Show pay amounts')
  })

  // M4 recheck SA-4-a: the open bridge's copy says what it does, and a band-only step shows no count.
  it('says on every step’s card that nothing folds, never that small changes are in Other changes', () => {
    for (const o of [opts, { compare: 'fy27-q1-reforecast' }] as const) {
      const p = prepare(sampleCtx('hr-admin', { ...o, showPay: true }))
      const steps = bridgeRows(p).rows.filter((r) => r.kind === 'step')
      expect(steps.length).toBeGreaterThan(0)
      for (const r of steps) {
        const card = typeof r.calc === 'function' ? r.calc() : r.calc
        expect(card?.note, r.key).toContain(OPEN_STEP_CARD_NOTE)
        expect(card?.note, r.key).not.toContain('Other changes')
      }
    }
    expect(OPEN_STEP_CARD_NOTE).toBe(
      'In HR admin mode with pay amounts shown nothing folds: every step is its own row, band estimates of Open and Planned seats included.',
    )
    // Control: with the switch off the card still says where small changes go.
    const off = bridgeRows(prepare(sampleCtx('hr-admin', { compare: 'fy27-q1-reforecast' }))).rows
    const first = off.find((r) => r.kind === 'step')
    const card = typeof first?.calc === 'function' ? first.calc() : first?.calc
    expect(card?.note).toContain('are in Other changes')
  })

  it('leaves the count blank on a step made only of band estimates, as the guarded modes do', () => {
    const p = prepare(sampleCtx('hr-admin', { compare: 'fy27-q1-reforecast', showPay: true }))
    const w = bridgeWindow(p, p.fyMonths)
    const rows = bridgeRows(p).rows.filter((r) => r.kind === 'step')
    const bandOnly = w.steps.filter((s) => s.band && s.key !== 'transfers')
    // Non-vacuous: the company's Position changes and Mix move band seats only.
    expect(bandOnly.map((s) => s.key)).toEqual(expect.arrayContaining(['positions', 'mix']))
    for (const s of bandOnly) {
      const row = rows.find((r) => r.key === s.key)
      expect(Math.abs(row?.value ?? 0), s.key).toBeGreaterThan(1)
      expect(row?.contributors, s.key).toBeNull()
      const card = typeof row?.calc === 'function' ? row.calc() : row?.calc
      expect(card?.inputs.find((i) => i.label === 'Positions that moved')?.value, s.key).toBeNull()
    }
    // A step with costed positions keeps its count.
    const costed = w.steps.find((s) => !s.band && s.contributors.size > 0)
    expect(costed).toBeTruthy()
    if (costed) expect(rows.find((r) => r.key === costed.key)?.contributors).toBe(costed.contributors.size)
    // Finance leaves the same steps' counts blank.
    const fin = bridgeRows(prepare(sampleCtx('finance', { compare: 'fy27-q1-reforecast' }))).rows
    for (const s of bandOnly) {
      const row = fin.find((r) => r.key === s.key)
      if (row) expect(row.contributors, `finance ${s.key}`).toBeNull()
    }
  })

  it('control: with the switch off the same scope folds into Other changes', () => {
    const p = prepare(sampleCtx('hr-admin', opts))
    const { rows } = bridgeRows(p)
    if (rows.length) expect(rows.some((r) => r.kind === 'other')).toBe(true)
  })
})
