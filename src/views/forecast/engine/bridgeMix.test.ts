/**
 * The bridge's Mix step moves for level and location changes, not only FTE (docs/PLAN.md 6.8 step 4
 * "mix (level, location, FTE)"; M4 review SA-3): a Planned seat (P-2460, P3 San Jose, starting 22 Feb
 * 2027) given a Working row at P4, or moved to Austin, moves in Mix by its band estimate at the new
 * level or site under the comparison's tables, while Pay rate and Assumption rates read exactly what
 * they read without the change; the steps still add up from start to end.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { Sample } from '@/data/sample'
import type { PositionRow } from '@/data/schema'
import { MemoryStorage } from '@/testkit/memoryStorage'
import { leakSample, sampleCtx, withDatasets } from '@/testkit/sample'
import { prepare } from './base'
import { bridgeWindow } from './bridge'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
vi.stubGlobal('localStorage', new MemoryStorage())

const SEAT = 'P-2460'
let s: Sample
let row: PositionRow

beforeAll(() => {
  s = leakSample()
  row = s.datasets.positions.find((r) => r.positionId === SEAT) as PositionRow
}, 120_000)

const stepsOf = (sample: Sample) => {
  const p = prepare(sampleCtx('hr-admin', { sample, showPay: true, compare: 'fy27-budget' }))
  const w = bridgeWindow(p, p.fyMonths)
  const by = new Map(w.steps.map((x) => [x.key, x]))
  return { w, by }
}

const changed = (patch: Partial<PositionRow>): Sample =>
  withDatasets(s, { positions: [...s.datasets.positions, { ...row, effectiveDate: '2026-09-15', ...patch }] })

describe('the Mix step (review SA-3)', () => {
  it('the seat is a Planned P3 in San Jose, at band estimate on both sides', () => {
    expect([row.status, row.level, row.location, row.fte ?? 1]).toEqual(['Planned', 'P3', 'San Jose', 1])
    expect(stepsOf(s).by.get('mix')?.value ?? 0).toBeCloseTo(0, 2)
  })

  for (const [name, patch] of [
    ['a level change P3 to P4', { level: 'P4' }],
    ['a location change San Jose to Austin', { location: 'Austin' }],
  ] as const)
    it(`moves Mix for ${name}, leaving Pay rate and Assumption rates as they were`, () => {
      const before = stepsOf(s)
      const after = stepsOf(changed(patch))
      const mix = after.by.get('mix')
      expect(Math.abs(mix?.value ?? 0), name).toBeGreaterThan(100)
      expect(mix?.bandMoved.has(SEAT), name).toBe(true)
      for (const k of ['payRate', 'assumptionRates'] as const) {
        expect(after.by.get(k)?.value, `${name} ${k}`).toBeCloseTo(before.by.get(k)?.value ?? 0, 1)
        expect(after.by.get(k)?.bandMoved.has(SEAT), `${name} ${k}`).toBe(
          before.by.get(k)?.bandMoved.has(SEAT),
        )
      }
      // Up for a higher level, down for a cheaper site.
      expect(Math.sign(mix?.value ?? 0), name).toBe(patch.level ? 1 : -1)
      const sum = after.w.steps.reduce((n, x) => n + x.value, 0)
      expect((after.w.start ?? 0) + sum, name).toBeCloseTo(after.w.end ?? 0, 2)
    })

  // M4 recheck SA-3-a: a move to a site in another currency is a location change too (6.8 step 4),
  // not an elimination and an addition. The seat stays one seat on both sides: Mix carries its band
  // estimate at the new site under the comparison's tables, priced at the comparison's plan rate for
  // the new currency; Timing and Position changes read what they read without the move, and only the
  // swap from plan rates to actual and forecast rates is FX.
  for (const [name, patch, currency] of [
    ['a move San Jose to Munich (EUR)', { location: 'Munich', legalEntity: null }, 'EUR'],
    ['a move San Jose to Haifa (ILS)', { location: 'Haifa', legalEntity: null }, 'ILS'],
  ] as const)
    for (const compare of ['fy27-budget', 'fy27-q1-reforecast'] as const)
      it(`moves Mix for ${name} against ${compare}, never Timing or Position changes`, () => {
        const stepsVs = (sample: Sample) => {
          const p = prepare(sampleCtx('hr-admin', { sample, showPay: true, compare }))
          const w = bridgeWindow(p, p.fyMonths)
          return { w, by: new Map(w.steps.map((x) => [x.key, x])) }
        }
        const before = stepsVs(s)
        const after = stepsVs(changed(patch))
        const moved = (k: string) =>
          (after.by.get(k as never)?.value ?? 0) - (before.by.get(k as never)?.value ?? 0)
        // The band estimate at Munich or Haifa is well below San Jose's: Mix carries the drop.
        expect(moved('mix'), `${name} mix`).toBeLessThan(-1000)
        expect(after.by.get('mix')?.bandMoved.has(SEAT), name).toBe(true)
        for (const k of ['timing', 'positions'] as const) {
          expect(moved(k), `${name} ${k}`).toBeCloseTo(0, 2)
          expect(after.by.get(k)?.bandMoved.has(SEAT), `${name} ${k}`).toBe(
            before.by.get(k)?.bandMoved.has(SEAT),
          )
        }
        // Pay rate and Assumption rates read the forecast's own tables against the comparison's: no
        // more than the rounding of a rate.
        for (const k of ['payRate', 'assumptionRates'] as const)
          expect(Math.abs(moved(k)), `${name} ${k}`).toBeLessThan(1)
        // FX takes the seat's new currency from plan rates to actual and forecast rates.
        expect(Math.abs(moved('fx')), `${name} fx`).toBeGreaterThan(1)
        expect(currency).not.toBe('USD')
        // The steps add up in whole cents (each step is a difference of cent totals).
        const sum = after.w.steps.reduce((n, x) => n + x.value, 0)
        expect(Math.abs((after.w.start ?? 0) + sum - (after.w.end ?? 0)), name).toBeLessThan(0.01)
        // The start and the end are the comparison's and the forecast's totals, as without the fix.
        expect(after.w.start, name).toBeCloseTo(before.w.start ?? 0, 2)
      })
})
