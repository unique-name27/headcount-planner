/**
 * The paid twin of an unpaid seat line is the line the run gives the seat with the leave paid
 * (./paidTwins.ts; lead decision C34, M2 close attack A1). Before, twins came from the Working
 * version's line context at the as-of date, which does not know a person hired after it: with the
 * reporting date set to 31 August (September closed), 9 September hires had none (40 at 30 June), so
 * their unpaid lines stood in for their own twins and the bridge's shape read their leave
 * (`bridgeShape.test.ts` and `src/access/leaks.leave.slow.test.ts` read that on the bridge). Here
 * everyone with a seat is put on unpaid leave and on paid leave, at the default reporting date and at
 * two before the last close: every unpaid line of the run has a twin, and in projected months it is
 * the paid run's line field by field; an actual month without a close (no close at all: once a month
 * closes only closed months are actual, PLAN 15.1 R46) reads the paid line too; a closed month's
 * stored unpaid line is priced from HRIS pay.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import type { Sample } from '@/data/sample'
import type { ISODate } from '@/data/schema'
import type { PlanLine } from '@/plan/types'
import { leakSample, sampleCtx, withDatasets, withPlan } from '@/testkit/sample'
import { isUnpaidLine } from '@/views/lineSource'
import { paidTwinsOf } from './paidTwins'
import { type ForecastRun, forecastRunOf, isSpreadLine } from './run'

let s: Sample
beforeAll(() => {
  s = leakSample()
}, 120_000)

/** Every Employee with a seat on leave, paid or unpaid. */
const everyone = (x: Sample, paid: boolean): Sample =>
  withDatasets(x, {
    workers: x.datasets.workers.map((w) =>
      w.workerType === 'Employee' && w.positionId ? { ...w, onLeave: true, leavePaid: paid } : w,
    ),
  })

/** The people on leave in the sample, every leave paid or unpaid. */
const sampleLeaves = (x: Sample, paid: boolean): Sample =>
  withDatasets(x, {
    workers: x.datasets.workers.map((w) => (w.onLeave === true ? { ...w, leavePaid: paid } : w)),
  })

const runOf = (x: Sample, asOf: ISODate | null): ForecastRun => {
  const run = forecastRunOf(sampleCtx('hr-admin', { sample: x, asOfOverride: asOf }))
  if (!run) throw new Error('no forecast run')
  return run
}

const seatLines = (run: ForecastRun): PlanLine[] =>
  run.lines.filter((l) => !isSpreadLine(l) && !!l.positionId && l.active > 0)

const keyOf = (l: PlanLine): string => `${l.positionId}|${l.month}|${l.holderId}|${l.basis}`

/** The run's seat lines by seat, month, holder and basis, in order. */
function byKey(run: ForecastRun): Map<string, PlanLine[]> {
  const out = new Map<string, PlanLine[]>()
  for (const l of seatLines(run)) {
    const list = out.get(keyOf(l))
    if (list) list.push(l)
    else out.set(keyOf(l), [l])
  }
  return out
}

describe('the paid twin of an unpaid line (C34, attack A1)', () => {
  it('is the paid run’s line, field by field, in every projected month, at reporting dates before the last close too', () => {
    const unpaid = everyone(s, false)
    const paid = everyone(s, true)
    for (const asOf of [null, '2026-08-31', '2026-06-30'] as const) {
      const ru = runOf(unpaid, asOf)
      const rp = runOf(paid, asOf)
      expect(ru.actualThrough, `${asOf}`).toBe('2026-09')
      const truth = byKey(rp)
      const twins = paidTwinsOf(ru)
      const seen = new Map<string, number>()
      let projected = 0
      const hired = new Set<string>()
      for (const l of seatLines(ru)) {
        const i = seen.get(keyOf(l)) ?? 0
        seen.set(keyOf(l), i + 1)
        if (!isUnpaidLine(l) || l.month <= ru.actualThrough) continue
        const twin = twins.get(l)
        expect(twin, `${asOf} ${keyOf(l)}: a twin`).toBeDefined()
        expect(twin, `${asOf} ${keyOf(l)}`).toEqual(truth.get(keyOf(l))?.[i])
        projected++
        const w = s.datasets.workers.find((x) => x.employeeId === l.holderId)
        if (w && (w.assignmentStart || w.hireDate) > ru.detail.asOf) hired.add(w.employeeId)
      }
      // Non-vacuity: thousands of lines; before the last close, people hired since the reporting
      // date (none had a twin before the fix).
      expect(projected, `${asOf}`).toBeGreaterThan(10_000)
      if (asOf === '2026-08-31') {
        expect(hired.size).toBeGreaterThanOrEqual(9)
        expect(hired.has('E11729')).toBe(true)
      }
      if (asOf === '2026-06-30') expect(hired.size).toBeGreaterThan(30)
    }
  })

  it('is the paid line in an actual month without a close, and HRIS pay for a closed month’s stored line', () => {
    // Only closed months are actual once a month has closed (PLAN 15.1 R46), so an actual month
    // without a close is one read from HRIS now with no close at all: April to September here.
    const open = withPlan(s, { closes: [] })
    const ru = runOf(sampleLeaves(open, false), null)
    const rp = runOf(sampleLeaves(open, true), null)
    expect(ru.actualThrough).toBe('2026-09')
    const truth = byKey(rp)
    const twins = paidTwinsOf(ru)
    const seen = new Map<string, number>()
    let actual = 0
    for (const l of seatLines(ru)) {
      const i = seen.get(keyOf(l)) ?? 0
      seen.set(keyOf(l), i + 1)
      if (!isUnpaidLine(l) || l.month > ru.actualThrough) continue
      const twin = twins.get(l)
      expect(twin, keyOf(l)).toBeDefined()
      const t = truth.get(keyOf(l))?.[i] as PlanLine
      expect(isUnpaidLine(t), keyOf(l)).toBe(false)
      expect(twin?.local, keyOf(l)).toEqual(t.local)
      expect(twin?.usd, keyOf(l)).toEqual(t.usd)
      expect({ ...twin, local: null, usd: null }, keyOf(l)).toEqual({ ...t, local: null, usd: null })
      actual++
    }
    expect(actual).toBeGreaterThan(0)

    // With the closes, every actual month is a closed one: a close stored the month unpaid, and its
    // twin is the holder's HRIS pay for it.
    const cu = runOf(sampleLeaves(s, false), null)
    const ctwins = paidTwinsOf(cu)
    let closed = 0
    for (const l of seatLines(cu)) {
      if (!isUnpaidLine(l) || l.month > cu.actualThrough) continue
      const twin = ctwins.get(l)
      expect(twin, keyOf(l)).toBeDefined()
      expect(twin?.local.base, keyOf(l)).toBeGreaterThan(0)
      expect(twin?.usd.loaded, keyOf(l)).toBeGreaterThan(l.usd.loaded)
      closed++
    }
    expect(closed).toBeGreaterThan(0)
  })

  it('leaves every paid line as it is (a run with no unpaid line has no twin)', () => {
    const run = runOf(sampleLeaves(s, true), null)
    const projectedUnpaid = seatLines(run).filter((l) => isUnpaidLine(l) && l.month > run.actualThrough)
    expect(projectedUnpaid).toEqual([])
    for (const [l, twin] of paidTwinsOf(run)) {
      // Only closed months' stored unpaid lines remain (closes keep the leave they stored).
      expect(l.month <= run.actualThrough, keyOf(l)).toBe(true)
      expect(twin.positionId).toBe(l.positionId)
    }
  })
})
