/**
 * What the cost guard reads of a line beside its amounts (src/views/lineSource.ts, change C33):
 * each costed line's side of each capped burden component (review RF-1), read from the line priced
 * as paid when it is on unpaid leave (7.2 rule 1, C26), so the component gate never reads leave.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { componentGate } from '@/cost/guard'
import type { AnalyticsContext } from '@/data/context'
import { monthEnd, monthRange, monthsOf } from '@/data/fiscal'
import type { Sample } from '@/data/sample'
import type { ISODate, Month } from '@/data/schema'
import type { PlanLine } from '@/plan/types'
import { leakSample, sampleCtx, withDatasets, withWorker } from '@/testkit/sample'
import { type ForecastRun, forecastRunOf } from './forecast/engine/run'
import { capSidesOf, isUnpaidLine, paidLineOf } from './lineSource'
import { costSeatOf, versionLinesOf } from './plan/engine/core'

beforeAll(() => {
  leakSample()
}, 60_000)

const SS = 'United States|socialSecurity'

describe('cap sides (RF-1)', () => {
  it('reads each US line’s side of the social security cap from its own base and bonus', () => {
    const ctx = sampleCtx('finance')
    const v = ctx.version
    if (!v) throw new Error('no version')
    const sides = capSidesOf(ctx)
    const seatOf = costSeatOf(ctx)
    let below = 0
    let at = 0
    for (const l of versionLinesOf(ctx, v)) {
      if (l.basis === 'band' || !l.holderId || !(l.active > 0) || l.month !== '2026-09') continue
      if (seatOf(l.positionId)?.country !== 'United States' || isUnpaidLine(l)) continue
      const s = sides(l)?.find((x) => x.key === SS)
      expect(s, l.positionId).toBeDefined()
      const annual = ((l.local.base + l.local.bonus) * 12) / l.active
      expect(s?.below, l.positionId).toBe(annual < 176_100)
      if (s?.below) below++
      else at++
    }
    expect(below).toBeGreaterThan(5)
    expect(at).toBeGreaterThan(5)
  })

  it('reads an unpaid month as paid: the sides and the gate do not change when a leave turns unpaid', () => {
    const s = leakSample()
    const w = s.datasets.workers.find(
      (x) =>
        x.workerType === 'Employee' &&
        x.onLeave === true &&
        x.leavePaid !== false &&
        !!x.positionId &&
        !x.terminationDate &&
        !x.assignmentEnd,
    )
    if (!w?.positionId) throw new Error('no one on paid leave')
    const unpaid = withWorker(s, w.employeeId, { leavePaid: false })
    const before = sampleCtx('finance', { sample: s })
    const after = sampleCtx('finance', { sample: unpaid })
    const v = before.version
    if (!v) throw new Error('no version')
    const months = monthsOf(v.fiscalYear)
    const own = (ctx: typeof before) =>
      versionLinesOf(ctx, ctx.version ?? v).filter(
        (l) => l.positionId === w.positionId && l.holderId === w.employeeId,
      )
    const lines = own(after).filter(isUnpaidLine)
    // The flip leaves some open month unpaid.
    expect(lines.length).toBeGreaterThan(0)
    for (const l of lines) {
      const paid = paidLineOf(after, l) as PlanLine
      expect(paid.local.base, l.month).toBeGreaterThan(0)
      const twin = own(before).find((x) => x.month === l.month) as PlanLine
      expect(paid.local.base, l.month).toBeCloseTo(twin.local.base, 6)
      expect(capSidesOf(after)(l), l.month).toEqual(capSidesOf(before)(twin))
    }
    // The unit's component gate over the year is the same with and without the leave.
    const gate = (ctx: typeof before) =>
      componentGate(
        {
          lines: versionLinesOf(ctx, ctx.version ?? v),
          months,
          seatOf: costSeatOf(ctx),
          capSides: capSidesOf(ctx),
        },
        5,
      )
    const unit = costSeatOf(before)(w.positionId)?.businessUnit as string
    expect(gate(after).units.get(unit)?.ok).toBe(gate(before).units.get(unit)?.ok)
  })
})

describe('cap sides of the forecast at a reporting date before the last close (M2 close-out)', () => {
  /** The last close's month end: the forecast prices people hired up to it from HRIS. */
  const lastCloseEnd = (x: Sample): ISODate =>
    monthEnd(
      x.plan.closes
        .map((c) => c.month)
        .sort()
        .at(-1) as Month,
    )

  /** People hired after a reporting date and on or before the last close. */
  const hiredSince = (x: Sample, asOf: ISODate): Set<string> =>
    new Set(
      x.datasets.workers
        .filter((w) => {
          const start = w.assignmentStart || w.hireDate
          return w.workerType === 'Employee' && !!w.positionId && start > asOf && start <= lastCloseEnd(x)
        })
        .map((w) => w.employeeId),
    )

  /** Those people on leave, paid or unpaid. */
  const onLeaveAs = (x: Sample, ids: ReadonlySet<string>, paid: boolean): Sample =>
    withDatasets(x, {
      workers: x.datasets.workers.map((w) =>
        ids.has(w.employeeId) ? { ...w, onLeave: true, leavePaid: paid } : w,
      ),
    })

  /** Seat, month, holder and basis: leave changes a line's amounts, never its segments. */
  const keyOf = (l: PlanLine): string => `${l.positionId}|${l.month}|${l.holderId ?? ''}|${l.basis}`

  /** Each unit's component gate over a window of the run's lines. */
  const gateOf = (ctx: AnalyticsContext, run: ForecastRun, months: readonly Month[]): string[] =>
    [
      ...componentGate({ lines: run.lines, months, seatOf: costSeatOf(ctx), capSides: capSidesOf(ctx) }, 5)
        .units,
    ]
      .map(([u, c]) => `${u}:${c.ok}`)
      .sort()

  it('reads each hire’s side of each cap from their paid line, so no unit’s split reads their leave', () => {
    const s = leakSample()
    for (const asOf of ['2026-08-31', '2026-06-30'] as const) {
      const ids = hiredSince(s, asOf)
      expect(ids.size, asOf).toBeGreaterThan(0)
      const paidCtx = sampleCtx('finance', { sample: onLeaveAs(s, ids, true), asOfOverride: asOf })
      const unpaidCtx = sampleCtx('finance', { sample: onLeaveAs(s, ids, false), asOfOverride: asOf })
      const paidRun = forecastRunOf(paidCtx)
      const unpaidRun = forecastRunOf(unpaidCtx)
      if (!paidRun || !unpaidRun) throw new Error('no forecast run')
      const paidLines = new Map<string, PlanLine[]>()
      for (const l of paidRun.lines) {
        const list = paidLines.get(keyOf(l))
        if (list) list.push(l)
        else paidLines.set(keyOf(l), [l])
      }
      const paidSides = capSidesOf(paidCtx)
      const unpaidSides = capSidesOf(unpaidCtx)
      const seen = new Map<string, number>()
      let checked = 0
      for (const l of unpaidRun.lines) {
        const k = keyOf(l)
        const i = seen.get(k) ?? 0
        seen.set(k, i + 1)
        if (!isUnpaidLine(l) || !ids.has(l.holderId ?? '')) continue
        const sides = unpaidSides(l)
        if (!sides?.length) continue
        const twin = paidLines.get(k)?.[i]
        if (!twin) throw new Error(`${asOf} ${k}: no paid line`)
        // One side per cap, the paid line's (a missing twin put the person on both sides).
        expect(sides, `${asOf} ${k}`).toEqual(paidSides(twin))
        checked++
      }
      expect(checked, asOf).toBeGreaterThan(0)
      // Every unit's gate, by month, over the year and over windows after the close.
      const windows: Month[][] = [
        ...unpaidRun.months.map((m) => [m]),
        [...unpaidRun.months],
        monthRange('2026-10', '2026-12'),
        monthRange('2026-10', '2027-03'),
      ]
      for (const months of windows)
        expect(gateOf(unpaidCtx, unpaidRun, months), `${asOf} ${months[0]}..${months.at(-1)}`).toEqual(
          gateOf(paidCtx, paidRun, months),
        )
    }
  }, 120_000)

  it('keeps every unit’s gate when any one person hired since 30 June goes on leave, paid or unpaid', () => {
    const s = leakSample()
    const asOf: ISODate = '2026-06-30'
    const windows: Month[][] = [
      ...monthRange('2026-10', '2027-09').map((m) => [m]),
      monthRange('2026-10', '2026-12'),
      monthRange('2026-10', '2027-03'),
    ]
    const gates = (x: Sample): string[] => {
      const ctx = sampleCtx('finance', { sample: x, asOfOverride: asOf })
      const run = forecastRunOf(ctx)
      if (!run) throw new Error('no forecast run')
      return windows.map((months) => `${months[0]}..${months.at(-1)} ${gateOf(ctx, run, months).join(' ')}`)
    }
    // Not vacuous: some unit's split passes the gate in these windows (Operations on the sample).
    expect(gates(s).some((g) => g.includes(':true'))).toBe(true)
    for (const id of hiredSince(s, asOf)) {
      const one = new Set([id])
      expect(gates(onLeaveAs(s, one, false)), id).toEqual(gates(onLeaveAs(s, one, true)))
    }
  }, 120_000)
})
