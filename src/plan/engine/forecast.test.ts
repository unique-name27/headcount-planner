/**
 * Forecast (docs/PLAN.md 6.7): fixtures F1, F2, F3 and FS1; one-time items (6.3) in actual months,
 * which each close snapshots (15.2 C32, lead decision D-CLOSE), booked once in their month whether it
 * is closed or open; a pre-hire in HRIS and band seats with no opening (D-PREHIRE); the locked minimum
 * behind the average-cost fallback (D-MIN); an approved Elimination ending its holder (D-ELIM).
 */
import { describe, expect, it } from 'vitest'
import { monthsOf } from '@/data/fiscal'
import type { ISODate, Month, PositionRow, ReqRow, WorkerRow } from '@/data/schema'
import type { ForecastMonth, MonthClose, UsdAmounts } from '../types'
import { closeMonth } from './close'
import { AS_OF, assumption, compRow, fxRates, fy27Working, positionRow, workerRow } from './fixtures/common'
import { F1, F2, F3, FS1 } from './fixtures/forecast'
import {
  DEFAULT_MIN_COSTED,
  type ForecastInput,
  forecast,
  forecastDetail,
  forecastStart,
  isCohortLine,
  monthlyRate,
  openedOn,
} from './forecast'

const monthOf = (months: readonly ForecastMonth[], m: string): ForecastMonth => {
  const found = months.find((x) => x.month === m)
  if (!found) throw new Error(`no forecast month ${m}`)
  return found
}
const cents = (a: UsdAmounts): number[] =>
  [a.base, a.bonus, a.burden, a.benefits, a.oneTime, a.equity, a.loaded].map((x) => Math.round(x * 100))

describe('F1: the double-count trap', () => {
  it('monthly rate = 1 − (1 − 12%)^(1/12) = 0.0105962', () => {
    expect(monthlyRate(0.12)).toBeCloseTo(F1.monthlyRate, 10)
  })

  it('October: max(0, 100 × 0.0105962 − 1) = 0.0596 modeled exits, Dana a known exit', () => {
    const f = forecast(F1.input)
    const oct = monthOf(f.months, F1.october.month)
    expect(oct.cohorts.hris.headsAtStart).toBeCloseTo(F1.october.hrisHeadsAtStart, 6)
    expect(oct.knownExits).toBe(F1.october.knownExits)
    expect(oct.modeledExits).toBeCloseTo(F1.october.modeledExits, 6)
    expect(oct.modeledExits).not.toBeCloseTo(F1.negativeControlOctober, 2)
    expect(oct.modeledExits.toFixed(4)).toBe('0.0596')
    expect(oct.modeledExits.toFixed(2)).toBe('0.06')
  })

  it('Dana is never a modeled exit: her known exit takes no share of the cohort’s', () => {
    const d = forecastDetail(F1.input)
    const dana = d.seatCohorts.filter((c) => c.positionId === 'P-1042')
    for (const c of dana) expect(c.hrisExits, c.month).toBe(0)
  })

  it('November: heads at start 98.9404, modeled exits 1.0484', () => {
    const f = forecast(F1.input)
    const nov = monthOf(f.months, F1.november.month)
    expect(nov.cohorts.hris.headsAtStart).toBeCloseTo(F1.november.hrisHeadsAtStart, 6)
    expect(nov.modeledExits).toBeCloseTo(F1.november.modeledExits, 6)
    expect(nov.cohorts.hris.headsAtStart.toFixed(4)).toBe('98.9404')
    expect(nov.modeledExits.toFixed(4)).toBe('1.0484')
    expect(nov.modeledExits.toFixed(2)).toBe('1.05')
  })

  it('P-1042 refills through R-88 on 1 Dec; no extra seat is added', () => {
    const f = forecast(F1.input)
    const refills = f.expectedStarts.filter((s) => s.positionId === F1.refill.positionId)
    expect(refills).toHaveLength(1)
    expect(refills[0]).toMatchObject(F1.refill)
    const known = new Set(F1.input.positions.map((p) => p.positionId))
    for (const s of f.expectedStarts) expect(known.has(s.positionId), s.positionId).toBe(true)
  })
})

describe('F2: cohort invariance', () => {
  it('moving a Planned start from 1 Jan 2027 to 1 Nov 2026 leaves the filled part equal to the cent', () => {
    const a = forecast(F2.base)
    const b = forecast(F2.moved)
    expect(b.months.map((m) => m.month)).toEqual(a.months.map((m) => m.month))
    for (const m of a.months) {
      const other = monthOf(b.months, m.month)
      expect(cents(other.cost.filled), m.month).toEqual(cents(m.cost.filled))
      expect(other.cohorts.hris.modeledExits, m.month).toBeCloseTo(m.cohorts.hris.modeledExits, 10)
    }
  })

  it('and changes the band part and band-cohort exits', () => {
    const a = forecast(F2.base)
    const b = forecast(F2.moved)
    for (const m of F2.bandDiffersIn) {
      expect(monthOf(b.months, m).cost.band.loaded, m).not.toBeCloseTo(
        monthOf(a.months, m).cost.band.loaded,
        2,
      )
    }
    const bandExits = (f: typeof a) => f.months.reduce((n, m) => n + m.cohorts.band.modeledExits, 0)
    expect(bandExits(b)).not.toBeCloseTo(bandExits(a), 6)
  })
})

describe('F3: openedOn and the start of an Open seat', () => {
  it('a seat moved to Open by Start recruiting on 21 Aug 2026 opened on 21 Aug', () => {
    expect(openedOn(F3.seat, F3.asOf)).toBe(F3.openedOn)
  })

  it('starts at max(1 Oct, 30 Sep + max(0, 60 − 40)) = 20 Oct 2026', () => {
    expect(forecastStart(F3.opening, F3.asOf, F3.timeToFillDays)).toBe(F3.start)
  })

  it('and the forecast engine starts it on 20 Oct 2026', () => {
    const starts = forecast(F3.input).expectedStarts.filter((s) => s.positionId === 'P-F3')
    expect(starts).toEqual([
      { positionId: 'P-F3', kind: 'open', start: F3.start, probability: 1, heldBy: null, noReq: false },
    ])
  })
})

describe('FS1: the planted Munich P4 (13.4)', () => {
  it('starts at max(16 Sep 2026, 30 Sep 2026 + 75 days) = 14 Dec 2026', () => {
    expect(forecastStart(FS1.opening, FS1.asOf, FS1.timeToFillDays)).toBe(FS1.start)
  })
})

describe('one-time items in actual months (6.3, 6.6)', () => {
  const FY27 = monthsOf('FY27')
  const req = (over: Partial<ReqRow> & Pick<ReqRow, 'reqId' | 'positionId'>): ReqRow => ({
    status: 'Open',
    stage: 'Offer accepted',
    reqType: 'New',
    openedDate: '2026-05-01',
    offerCurrency: 'USD',
    offerBase: 150_000,
    ...over,
  })
  const positions: PositionRow[] = [
    // An accepted offer: agency fee $38,600 booked in the offer-accepted month (20 Jul), sign-on and
    // relocation in the start month (Oct).
    positionRow('P-OT-AGENCY', { status: 'Open', effectiveDate: '2026-04-01' }),
    // Munich: a €10,000 agency fee accepted 10 Jul, at July's actual rate.
    positionRow('P-OT-MUC', {
      status: 'Open',
      effectiveDate: '2026-04-01',
      location: 'Munich',
      costCenter: '4110-MUC',
    }),
    // A hire who started 1 Sep 2026 on an offer accepted 10 Aug: sign-on and relocation in September.
    positionRow('P-OT-HIRE', { status: 'Open', effectiveDate: '2026-04-01' }),
    // An eliminated Filled seat: last day 30 Jun, severance (3 months of $120,000) books in July.
    positionRow('P-OT-ELIM', { effectiveDate: '2025-04-01' }),
    positionRow('P-OT-ELIM', {
      effectiveDate: '2026-07-01',
      status: 'Eliminated',
      endDate: '2026-06-30',
      endReason: 'Eliminated',
    }),
  ]
  const reqs: ReqRow[] = [
    req({
      reqId: 'REQ-OT-AGENCY',
      positionId: 'P-OT-AGENCY',
      offerAcceptedDate: '2026-07-20',
      startDate: '2026-10-15',
      agencyFee: 38_600,
      signOnBonus: 10_000,
      relocation: 5_000,
    }),
    req({
      reqId: 'REQ-OT-MUC',
      positionId: 'P-OT-MUC',
      offerAcceptedDate: '2026-07-10',
      startDate: '2026-11-02',
      offerCurrency: 'EUR',
      offerBase: 100_000,
      agencyFee: 10_000,
    }),
    req({
      reqId: 'REQ-OT-HIRE',
      positionId: 'P-OT-HIRE',
      status: 'Filled',
      stage: 'Started',
      openedDate: '2026-06-01',
      offerAcceptedDate: '2026-08-10',
      startDate: '2026-09-01',
      closedDate: '2026-09-01',
      offerBase: 130_000,
      signOnBonus: 20_000,
      relocation: 7_000,
    }),
  ]
  const workers: WorkerRow[] = [
    workerRow('E-OT-HIRE', 'P-OT-HIRE', { hireDate: '2026-09-01', assignmentStart: '2026-09-01' }),
    workerRow('E-OT-ELIM', 'P-OT-ELIM', { terminationDate: '2026-06-30' }),
  ]
  const comp = [compRow('E-OT-HIRE', '2026-09-01', 130_000), compRow('E-OT-ELIM', '2026-04-01', 120_000)]
  const assumptions = [
    assumption('bonusFunding', 'FY27', 1),
    assumption('severance', 'United States', 3),
    assumption('band', 'P3|San Jose|FY27', 165_000),
  ]
  const rates = [
    ...fxRates('EUR', 'actual', FY27.slice(0, 6), 1.12),
    ...fxRates('EUR', 'forecast', FY27.slice(6), 1.15),
  ]
  const input = (asOf: ISODate, closes: readonly MonthClose[] = []): ForecastInput => ({
    version: fy27Working('daily'),
    asOf,
    closes,
    positions,
    workers,
    comp,
    reqs,
    requests: [],
    freezes: [],
    assumptions,
    rates,
    inTree: () => false,
  })
  const oneTimeIn = (f: ReturnType<typeof forecast>, month: Month): number =>
    monthOf(f.months, month).cost.filled.oneTime
  const closes = (through: Month): MonthClose[] =>
    FY27.filter((m) => m <= through).map((month) =>
      closeMonth(
        {
          month,
          positions,
          workers,
          comp,
          assumptions,
          versionId: 'fy27-working',
          versionName: 'FY27 Working',
          rates,
          // A close snapshots the month's one-time items; the offers' items need the reqs (D-CLOSE).
          reqs,
        },
        `${month}-28T10:00`,
        'E8001',
      ),
    )

  const sep = forecast(input(AS_OF))

  it("books July's agency fees and severance in the FY27 forecast, though July is an actual month", () => {
    // $38,600 + €10,000 × July's actual 1.12 + $30,000 severance.
    expect(oneTimeIn(sep, '2026-07')).toBeCloseTo(38_600 + 11_200 + 30_000, 2)
    const july = sep.lines.filter((l) => l.month === '2026-07' && l.usd.oneTime !== 0)
    // Lead decision D-CLOSE: actual months carry one-time items as actual lines (basis 'hris', the
    // actuals' basis), keyed by the req while the hire has not started.
    expect(july.map((l) => [l.positionId, l.holderId, l.basis, l.usd.oneTime])).toEqual([
      ['P-OT-AGENCY', 'REQ-OT-AGENCY', 'hris', 38_600],
      ['P-OT-ELIM', 'E-OT-ELIM', 'hris', 30_000],
      ['P-OT-MUC', 'REQ-OT-MUC', 'hris', expect.closeTo(11_200, 6)],
    ])
    for (const l of july) {
      expect(l).toMatchObject({ heads: 0, fte: 0, active: 0 })
      expect([l.local.base, l.local.bonus, l.local.burden, l.local.benefits]).toEqual([0, 0, 0, 0])
      expect([l.usd.base, l.usd.bonus, l.usd.burden, l.usd.benefits, l.usd.equity]).toEqual([0, 0, 0, 0, 0])
      expect(l.usd.loaded).toBe(l.usd.oneTime)
    }
    // Every one-time item once, in its 6.3 month: Jul, Sep (the hire), Oct (sign-on and relocation).
    expect(oneTimeIn(sep, '2026-09')).toBeCloseTo(27_000, 2)
    expect(oneTimeIn(sep, '2026-10')).toBeCloseTo(15_000, 2)
    expect(sep.yearEnd.cost.oneTime).toBeCloseTo(38_600 + 11_200 + 30_000 + 27_000 + 15_000, 2)
    expect(sep.months.reduce((n, m) => n + m.cost.band.oneTime, 0)).toBe(0)
  })

  it('keeps every one-time item when the months are closed', () => {
    const closed = forecast(input(AS_OF, closes('2026-09')))
    expect(closed.months.filter((m) => m.closed).map((m) => m.month)).toEqual(FY27.slice(0, 6))
    for (const m of FY27) expect(oneTimeIn(closed, m), m).toBeCloseTo(oneTimeIn(sep, m), 2)
    expect(closed.yearEnd.cost.oneTime).toBeCloseTo(sep.yearEnd.cost.oneTime, 2)
  })

  it("keeps September's one-time total when the same data is read as of 31 Aug and as of 30 Sep", () => {
    const aug = forecast(input('2026-08-31', closes('2026-08')))
    const sepClosed = forecast(input(AS_OF, closes('2026-09')))
    expect(monthOf(aug.months, '2026-09').closed).toBe(false)
    expect(monthOf(sepClosed.months, '2026-09').closed).toBe(true)
    expect(oneTimeIn(aug, '2026-09')).toBeCloseTo(27_000, 2)
    expect(oneTimeIn(sepClosed, '2026-09')).toBeCloseTo(oneTimeIn(aug, '2026-09'), 2)
    expect(oneTimeIn(aug, '2026-07')).toBeCloseTo(oneTimeIn(sepClosed, '2026-07'), 2)
  })
})

describe('seats costed outside an opening (lead decision D-PREHIRE)', () => {
  const positions: PositionRow[] = [
    // A Planned seat with a pre-hire in HRIS from 1 Nov 2026 at $96,000.
    positionRow('P-PH', { status: 'Planned', startDate: '2026-11-01' }),
    // A Filled seat whose holder has no comp row: costed at band.
    positionRow('P-NC', { effectiveDate: '2025-04-01' }),
    // An Open seat with an accepted offer starting 1 Dec 2026 and no offerBase: costed at band.
    positionRow('P-OF', { status: 'Open' }),
  ]
  const workers: WorkerRow[] = [
    workerRow('E-PH', 'P-PH', { hireDate: '2026-11-01', assignmentStart: '2026-11-01' }),
    workerRow('E-NC', 'P-NC', { hireDate: '2025-01-06' }),
  ]
  const reqs: ReqRow[] = [
    {
      reqId: 'REQ-OF',
      positionId: 'P-OF',
      status: 'Open',
      stage: 'Offer accepted',
      reqType: 'New',
      openedDate: '2026-06-01',
      offerAcceptedDate: '2026-09-10',
      startDate: '2026-12-01',
      offerBase: null,
      offerCurrency: 'USD',
    },
  ]
  const f = forecast({
    version: fy27Working('daily'),
    asOf: AS_OF,
    closes: [],
    positions,
    workers,
    comp: [compRow('E-PH', '2026-11-01', 96_000)],
    reqs,
    requests: [],
    freezes: [],
    assumptions: [
      assumption('band', 'P3|San Jose|FY27', 165_000),
      assumption('bonusFunding', 'FY27', 1),
      assumption('timeToFill', 'P3', 60),
      assumption('fillRate', '*', 1),
    ],
    rates: [],
    inTree: () => false,
  })
  const seatLines = (positionId: string, month: string) =>
    f.lines.filter((l) => l.positionId === positionId && l.month === month)

  it('costs a pre-hire through its HRIS assignment and comp from its start, in the filled part', () => {
    expect(seatLines('P-PH', '2026-10').reduce((n, l) => n + l.usd.loaded, 0)).toBe(0)
    for (const month of ['2026-11', '2026-12', '2027-01', '2027-02', '2027-03']) {
      const lines = seatLines('P-PH', month)
      expect(
        lines.map((l) => [l.basis, l.holderId]),
        month,
      ).toEqual([['hris', 'E-PH']])
      expect(lines[0].local.base, month).toBeCloseTo(8_000, 6)
    }
    expect(monthOf(f.months, '2026-11').cost.filled.base).toBeGreaterThan(0)
    expect(f.expectedStarts.filter((s) => s.positionId === 'P-PH')).toMatchObject([
      { kind: 'offer', start: '2026-11-01', probability: 1 },
    ])
  })

  it('keeps the band line of a holder with no comp row and of an accepted offer with no offerBase', () => {
    for (const month of ['2026-10', '2027-03']) {
      const nc = seatLines('P-NC', month)
      expect(
        nc.map((l) => [l.basis, l.holderId]),
        month,
      ).toEqual([['band', 'E-NC']])
      expect(nc[0].local.base, month).toBeCloseTo(165_000 / 12, 6)
    }
    expect(seatLines('P-OF', '2026-11').reduce((n, l) => n + l.usd.loaded, 0)).toBe(0)
    const dec = seatLines('P-OF', '2026-12')
    expect(dec.map((l) => [l.basis, l.holderId])).toEqual([['band', 'REQ-OF']])
    expect(dec[0].local.base).toBeCloseTo(165_000 / 12, 6)
  })
})

describe('the average-cost fallback reads the locked minimum (lead decision D-MIN)', () => {
  // Go-to-Market: 5 people at $100,000; Corporate: 5 at $200,000; 12% attrition, so both cohorts exit.
  const unitSeats = (unit: string, prefix: string, salary: number) =>
    Array.from({ length: 5 }, (_, i) => ({
      row: positionRow(`P-${prefix}-${i}`, {
        effectiveDate: '2025-04-01',
        businessUnit: unit,
        department: null,
      }),
      worker: workerRow(`E-${prefix}-${i}`, `P-${prefix}-${i}`, { businessUnit: unit, department: null }),
      comp: compRow(`E-${prefix}-${i}`, '2026-04-01', salary),
    }))
  const all = [...unitSeats('Go-to-Market', 'GTM', 100_000), ...unitSeats('Corporate', 'CORP', 200_000)]
  const run = (minCosted?: number) =>
    forecast({
      version: fy27Working('daily'),
      asOf: AS_OF,
      closes: [],
      positions: all.map((s) => s.row),
      workers: all.map((s) => s.worker),
      comp: all.map((s) => s.comp),
      reqs: [],
      requests: [],
      freezes: [],
      assumptions: [assumption('bonusFunding', 'FY27', 1), assumption('attrition', '*', 0.12)],
      rates: [],
      inTree: () => false,
      ...(minCosted === undefined ? {} : { minCosted }),
    })
  const gtmExitCost = (f: ReturnType<typeof forecast>) =>
    f.lines
      .filter((l) => isCohortLine(l) && l.cohort.part === 'hris' && l.cohort.businessUnit === 'Go-to-Market')
      .reduce((n, l) => n + l.usd.base, 0)

  it('a unit at the minimum prices its exits at its own average; under it, at the company’s', () => {
    const own = gtmExitCost(run(5))
    const company = gtmExitCost(run(6))
    expect(own).toBeLessThan(0)
    // The company's average ($150,000) is 1.5 × Go-to-Market's ($100,000).
    expect(company / own).toBeCloseTo(1.5, 10)
  })

  it('a caller that passes no minimum reads the rule’s default, 5', () => {
    expect(DEFAULT_MIN_COSTED).toBe(5)
    expect(gtmExitCost(run())).toBeCloseTo(gtmExitCost(run(5)), 6)
  })
})

describe('an approved Elimination ends the holder in the forecast too (15.1 R34, D-ELIM)', () => {
  // A Filled seat eliminated with last day 31 Dec 2026: HRIS still shows the holder, or has the exit.
  const run = (terminationDate: ISODate | null) =>
    forecast({
      version: fy27Working('daily'),
      asOf: AS_OF,
      closes: [],
      positions: [
        positionRow('P-EL', { effectiveDate: '2025-04-01' }),
        positionRow('P-EL', {
          effectiveDate: '2027-01-01',
          status: 'Eliminated',
          endDate: '2026-12-31',
          endReason: 'Eliminated',
        }),
      ],
      workers: [workerRow('E-EL', 'P-EL', { terminationDate })],
      comp: [compRow('E-EL', '2026-04-01', 120_000)],
      reqs: [],
      requests: [],
      freezes: [],
      assumptions: [assumption('bonusFunding', 'FY27', 1), assumption('severance', 'United States', 3)],
      rates: [],
      inTree: () => false,
    })
  const f = run(null)

  it('pays through 31 Dec, books severance once in 2027-01 and nothing after', () => {
    const lines = f.lines.filter((l) => l.positionId === 'P-EL')
    const recurring = (m: string) =>
      lines
        .filter((l) => l.month === m)
        .reduce((n, l) => n + l.usd.base + l.usd.bonus + l.usd.burden + l.usd.benefits, 0)
    expect(recurring('2026-12')).toBeCloseTo(10_000, 6)
    for (const m of ['2027-01', '2027-02', '2027-03']) expect(recurring(m), m).toBe(0)
    expect(lines.filter((l) => l.usd.oneTime !== 0).map((l) => [l.month, l.usd.oneTime])).toEqual([
      ['2027-01', 30_000],
    ])
    expect(monthOf(f.months, '2026-12').knownExits).toBe(1)
    expect(monthOf(f.months, '2027-01').heads).toBe(0)
  })

  it('reads the same as when HRIS records the exit on the last day', () => {
    const recorded = run('2026-12-31')
    expect(f.months).toEqual(recorded.months)
    expect(f.lines).toEqual(recorded.lines)
  })
})

describe('own cohort: seats netted over themselves alone (review HP-1)', () => {
  // F1's first 10 seats as a Manager's tree; Dana (P-1042, outside it) leaves on 15 Oct.
  const tree = new Set(Array.from({ length: 10 }, (_, i) => `P-F1-${String(i + 1).padStart(3, '0')}`))
  const treeExits = (input: ForecastInput, month: string) =>
    forecastDetail(input)
      .seatCohorts.filter((c) => tree.has(c.positionId) && c.month === month)
      .reduce((a, c) => a + c.hrisExits, 0)
  const withoutDana: ForecastInput = {
    ...F1.input,
    workers: F1.input.workers.map((w) => (w.employeeId === 'E-DANA' ? { ...w, terminationDate: null } : w)),
  }
  const own = (input: ForecastInput): ForecastInput => ({ ...input, ownCohort: tree })

  it('pooled, Dana’s known exit lowers the tree’s share of October (F1: 0.0596 over 99 members)', () => {
    expect(treeExits(F1.input, '2026-10')).toBeCloseTo((10 * F1.october.modeledExits) / 99, 9)
    expect(treeExits(withoutDana, '2026-10')).not.toBeCloseTo(treeExits(F1.input, '2026-10'), 6)
  })

  it('in its own cohort the tree models 10 × the monthly rate, whatever happens outside it', () => {
    expect(treeExits(own(F1.input), '2026-10')).toBeCloseTo(10 * monthlyRate(0.12), 12)
    const a = forecastDetail(own(F1.input)).seatCohorts.filter((c) => tree.has(c.positionId))
    const b = forecastDetail(own(withoutDana)).seatCohorts.filter((c) => tree.has(c.positionId))
    expect(a.length).toBeGreaterThan(10)
    expect(JSON.stringify(b)).toBe(JSON.stringify(a))
  })

  it('a known exit inside the tree still nets: max(0, 10 × rate − 1) = 0 in its month', () => {
    const leaves: ForecastInput = {
      ...own(F1.input),
      workers: F1.input.workers.map((w) =>
        w.employeeId === 'E-F1-001' ? { ...w, terminationDate: '2026-10-20' } : w,
      ),
    }
    expect(treeExits(leaves, '2026-10')).toBe(0)
    expect(treeExits(own(F1.input), '2026-10')).toBeGreaterThan(0)
  })

  it('leaves the seats outside the set in their org’s cohort', () => {
    const outside = (input: ForecastInput) =>
      forecastDetail(input)
        .seatCohorts.filter((c) => !tree.has(c.positionId) && c.month === '2026-10')
        .reduce((a, c) => a + c.hrisExits, 0)
    // 90 present at the start of October, Dana's known exit netted against them.
    expect(outside(own(F1.input))).toBeCloseTo(Math.max(0, 90 * monthlyRate(0.12) - 1), 9)
  })
})
