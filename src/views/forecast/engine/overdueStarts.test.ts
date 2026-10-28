/**
 * Overdue openings in the Forecast view's flows (change C38): an Open seat past its time to fill is
 * dated on the as-of date (forecast.ts `forecastStart`), which is in a closed month when the as-of
 * date is a closed month-end (the sample's 30 Sep 2026). The run counts its heads from the first
 * open month (forecast.ts `indexOf`), so `forecastFlows` counts its start there too: every expected
 * start of the scope is one open month's start, none is lost in a closed month, and the year-end
 * heads card books no overdue opening as timing. Plan > Recruiting summary's projected starts
 * (hiringData.ts `projectedStartsOf`) read the same month.
 *
 * With the as-of date before the last close (31 Aug and 15 Sep 2026; the sample's closes run to
 * September), the run dates the September hires it reads as pre-hires in September, as offers. Those
 * are September's HRIS hires, counted once there: the first open month's starts are the run's own
 * starts row (forecast.ts `startsByIndex`), never those hires again (finish audit AG-1).
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { monthKey, shiftMonth } from '@/data/fiscal'
import type { CalcSpec } from '@/drill/calc'
import { prepare } from './base'
import { sample, sampleCtx } from './fixtures'
import { forecastFlows } from './heads'
import { yearEndTile } from './kpis'
import type { ForecastRun } from './run'

beforeAll(() => {
  sample()
}, 60_000)

const CASES = [
  { who: 'HRBP (Silicon Engineering)', ctx: () => sampleCtx('hrbp') },
  { who: 'HR admin (whole company)', ctx: () => sampleCtx('hr-admin') },
] as const

/**
 * The scope's expected starts by the month the run counts their heads from (an opening dated in a
 * closed month clamped to the first open month). An offer start dated in a closed month is left out:
 * with the as-of date before the last close it is that month's HRIS hire (finish audit AG-1).
 */
function expectedByMonth(run: ForecastRun, ids: ReadonlySet<string>) {
  const first = shiftMonth(run.actualThrough, 1)
  const out = new Map<string, number>()
  const overdue = new Map<string, number>()
  for (const [id, starts] of run.starts) {
    if (!ids.has(id)) continue
    for (const s of starts) {
      const dated = monthKey(s.start)
      if (dated <= run.actualThrough && s.kind === 'offer') continue
      const m = dated <= run.actualThrough ? first : dated
      if (!run.months.includes(m)) continue
      out.set(m, (out.get(m) ?? 0) + s.probability)
      if (dated <= run.actualThrough) overdue.set(id, (overdue.get(id) ?? 0) + s.probability)
    }
  }
  return { first, out, overdue }
}

describe('the Forecast view counts an overdue opening in the first open month', () => {
  it.each(CASES)(
    'every expected start is one open month’s start, none lost in a closed month ($who)',
    ({ ctx }) => {
      const p = prepare(ctx())
      const run = p.run as ForecastRun
      expect(run).toBeTruthy()
      const flows = forecastFlows(p)
      const { first, out, overdue } = expectedByMonth(run, p.scope.ids)
      // The sample has overdue openings in both scopes (Open seats past their time to fill).
      let late = 0
      for (const v of overdue.values()) late += v
      expect(late).toBeGreaterThan(1)
      for (const [id, v] of overdue)
        expect(flows.get(first)?.startSeats.get(id) ?? 0, id).toBeGreaterThanOrEqual(v - 1e-9)
      for (const [m, f] of flows) {
        if (m <= run.actualThrough) {
          // A closed month's starts are its hires, whole people: never an expected start.
          expect(Number.isInteger(f.starts), m).toBe(true)
          for (const id of overdue.keys()) expect(f.startSeats.has(id), `${m} ${id}`).toBe(false)
        } else expect(f.starts, m).toBeCloseTo(out.get(m) ?? 0, 9)
      }
    },
  )

  it.each(CASES)('the year-end heads card books no overdue opening as timing ($who)', ({ ctx }) => {
    const p = prepare(ctx())
    const card = (yearEndTile(p).calc as () => CalcSpec)()
    const timing = card.steps.find((s) => s.label.startsWith('Timing within months'))
    const starts = card.inputs.find((i) => i.label === 'Expected starts')
    const { overdue } = expectedByMonth(p.run as ForecastRun, p.scope.ids)
    let late = 0
    for (const v of overdue.values()) late += v
    // The overdue openings are expected starts on the card, not part of the timing step.
    expect(Math.abs(timing?.result ?? 0)).toBeLessThan(late)
    expect(Number(starts?.value ?? 0)).toBeGreaterThan(late)
  })
})

/** Seats with an offer start dated in a closed month, and each seat's starts the first open month should hold. */
function closedOffers(run: ForecastRun, ids: ReadonlySet<string>) {
  const first = shiftMonth(run.actualThrough, 1)
  const seats = new Map<string, number>()
  for (const [id, starts] of run.starts) {
    if (!ids.has(id) || !starts.some((s) => s.kind === 'offer' && monthKey(s.start) <= run.actualThrough))
      continue
    // Its openings dated in or before the first open month, and its offers dated in it; never a closed-month offer.
    let want = 0
    for (const s of starts) {
      const m = monthKey(s.start)
      if (s.kind === 'offer' ? m === first : m <= first) want += s.probability
    }
    seats.set(id, want)
  }
  return { first, seats }
}

describe('an as-of date before the last close (finish audit AG-1)', () => {
  it.each(['2026-08-31', '2026-09-15'] as const)(
    'HR admin at %s: each open month’s starts are the run’s own starts row, and no closed-month hire counts again',
    (asOf) => {
      const p = prepare(sampleCtx('hr-admin', { asOf }))
      const run = p.run as ForecastRun
      // The as-of date is before September's close, which the run still reads.
      expect(run.actualThrough).toBe('2026-09')
      const flows = forecastFlows(p)
      for (const m of run.months) {
        if (m <= run.actualThrough) continue
        const own = run.detail.months.find((x) => x.month === m)
        expect(flows.get(m)?.starts ?? 0, m).toBeCloseTo(own?.starts ?? 0, 9)
      }
      const { first, seats } = closedOffers(run, p.scope.ids)
      // The sample's September hires the run reads as offers (9 at 31 Aug, 4 at 15 Sep).
      expect(seats.size).toBe(asOf === '2026-08-31' ? 9 : 4)
      for (const [id, want] of seats)
        expect(flows.get(first)?.startSeats.get(id) ?? 0, id).toBeCloseTo(want, 9)
    },
  )

  it('HRBP (Silicon Engineering) at 31 Aug: no closed-month hire counts again, and closed months count whole hires', () => {
    const p = prepare(sampleCtx('hrbp', { asOf: '2026-08-31' }))
    const run = p.run as ForecastRun
    const flows = forecastFlows(p)
    const { first, seats } = closedOffers(run, p.scope.ids)
    expect(seats.size).toBe(3)
    for (const [id, want] of seats) expect(flows.get(first)?.startSeats.get(id) ?? 0, id).toBeCloseTo(want, 9)
    for (const [m, f] of flows) if (m <= run.actualThrough) expect(Number.isInteger(f.starts), m).toBe(true)
  })
})
