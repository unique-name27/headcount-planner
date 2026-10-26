/**
 * The component gate never reads leave, on the sample (M2 carry-over, docs/PLAN.md 7.2 rule 1, C26,
 * R44, D-FIN (b)): Finance's gate over FY27 Working's shown lines and its forecast, for every month
 * of the grid, the quarter and year to date and the full year, with the lines' paid twins
 * (src/views/lineSource.ts `paidLineOf`) and cap sides, decides the same for every unit with every
 * leave unpaid, with every leave paid, and with each leave flipped on its own, either way; also at a
 * reporting date before the last close (31 August), where people hired in September need twins from
 * HRIS. The unit fixtures and the control (counting the lines' own amounts, one unpaid month turns 5
 * contributors into 4) are in gateLeave.test.ts.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import type { AnalyticsContext } from '@/data/context'
import type { Sample } from '@/data/sample'
import type { ISODate, Month } from '@/data/schema'
import type { AnyVersion, PlanLine } from '@/plan/types'
import { leakSample, sampleCtx, withDatasets, withWorker } from '@/testkit/sample'
import { forecastRunOf } from '@/views/forecast/engine/run'
import { capSidesOf, paidLineOf } from '@/views/lineSource'
import { costSeatOf, gridMonths, shownLines } from '@/views/plan/engine/core'
import { componentGate } from './guard'

const WORKING = 'fy27-working'

/** Every unit's gate decision, per line source and window, as sorted text. */
function decisions(ctx: AnalyticsContext): string[] {
  const v = ctx.versions.find((x) => x.versionId === WORKING) as AnyVersion
  const months = gridMonths(v)
  const windows: [string, readonly Month[]][] = [
    ...months.map((m): [string, readonly Month[]] => [m, [m]]),
    ['qtd', months.slice(3, 6)],
    ['ytd', months.slice(0, 6)],
    ['fy', months.slice(0, 12)],
  ]
  const sources: [string, readonly PlanLine[]][] = [
    ['plan', shownLines(ctx, v)],
    ['forecast', forecastRunOf(ctx, v)?.lines ?? []],
  ]
  const seatOf = costSeatOf(ctx)
  const capSides = capSidesOf(ctx)
  const out: string[] = []
  for (const [src, lines] of sources)
    for (const [w, ms] of windows) {
      const gate = componentGate(
        { lines, months: ms, seatOf, capSides, paidLineOf: (l) => paidLineOf(ctx, l) },
        ctx.guard.rules.minCosted,
      )
      for (const [unit, u] of [...gate.units].sort((a, b) => (a[0] < b[0] ? -1 : 1)))
        out.push(`${src} ${w} ${unit} ${u.ok ? 'split' : 'loaded only'}`)
    }
  return out
}

const firstDiff = (a: readonly string[], b: readonly string[]): string => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) return `${a[i]} -> ${b[i]}`
  return ''
}

describe('the component gate decides the same whatever anyone’s leave (C26, R44)', () => {
  let s: Sample
  let base: string[]
  const ctxOf = (x: Sample, asOf: ISODate | null = null) =>
    sampleCtx('finance', { sample: x, ...(asOf ? { asOfOverride: asOf } : {}) })
  const everyLeave = (x: Sample, paid: boolean): Sample =>
    withDatasets(x, {
      workers: x.datasets.workers.map((w) => (w.onLeave === true ? { ...w, leavePaid: paid } : w)),
    })

  beforeAll(() => {
    s = leakSample()
    base = decisions(ctxOf(s))
  }, 600_000)

  it('is not vacuous: units show their split in some windows and loaded cost only in others', () => {
    expect(base.length).toBeGreaterThan(100)
    expect(base.some((x) => x.endsWith(' split'))).toBe(true)
    expect(base.some((x) => x.endsWith(' loaded only'))).toBe(true)
    expect(
      s.datasets.workers.filter((w) => w.onLeave === true && w.leavePaid === false).length,
    ).toBeGreaterThan(0)
  })

  it('with every leave unpaid, and with every leave paid', () => {
    for (const paid of [false, true]) {
      const after = decisions(ctxOf(everyLeave(s, paid)))
      expect(firstDiff(base, after), paid ? 'paid' : 'unpaid').toBe('')
    }
  }, 600_000)

  it('with each leave flipped on its own, either way', () => {
    const people = s.datasets.workers
      .filter((w) => w.workerType === 'Employee' && w.onLeave === true && !!w.positionId)
      .sort((a, b) => (a.employeeId < b.employeeId ? -1 : 1))
    expect(people.length).toBeGreaterThan(10)
    const problems: string[] = []
    for (const w of people) {
      const after = decisions(ctxOf(withWorker(s, w.employeeId, { leavePaid: w.leavePaid === false })))
      const d = firstDiff(base, after)
      if (d) problems.push(`${w.employeeId}: ${d}`)
    }
    expect(problems.join('\n')).toBe('')
  }, 1_800_000)

  it('at a reporting date before the last close, with every leave unpaid', () => {
    const asOf: ISODate = '2026-08-31'
    const at = decisions(ctxOf(s, asOf))
    expect(firstDiff(at, decisions(ctxOf(everyLeave(s, false), asOf)))).toBe('')
    expect(firstDiff(at, decisions(ctxOf(everyLeave(s, true), asOf)))).toBe('')
  }, 900_000)
})
