/**
 * Month close and actuals (docs/PLAN.md 6.6 and 7.3a): closes snapshot HRIS actuals and store the
 * cost-atom index at the month's end; back-dated changes post as adjustments in the first open month
 * with a kind and a generated reason that never names leave; each close also snapshots the one-time
 * items booked in its month (15.2 C32, lead decision D-CLOSE).
 */
import { describe, expect, it } from 'vitest'
import { atomIndex, atomOf } from '@/cost/atoms'
import type { AssumptionRow, CompRow, PositionRow, ReqRow, WorkerRow } from '@/data/schema'
import type { ActualLine, Adjustment, MonthClose } from '../types'
import {
  type ActualsInput,
  ADJUSTMENT_REASON,
  actualLines,
  adjustmentsFor,
  closedThrough,
  closeHash,
  closeMonth,
  firstOpenMonth,
  lastCloseDate,
  verifyClose,
} from './close'
import { lineContext, monthLine } from './cost'
import { assumption, compRow, fxRates, positionRow, workerRow } from './fixtures/common'
import { actualLineRows } from './lineTable'
import { toPosition } from './versions'

const SE = 'Silicon Engineering'

const se = (positionId: string, over: Partial<PositionRow>): PositionRow =>
  positionRow(positionId, {
    effectiveDate: '2025-04-01',
    businessUnit: SE,
    department: 'Design Verification',
    costCenter: '1130-SJC',
    ...over,
  })

/** A director's org: a manager seat (Open at 31 Aug, raised to M2 on 10 Sep), two ICs, one on unpaid leave. */
const POSITIONS: readonly PositionRow[] = [
  se('A-DIR', { level: 'M2' }),
  se('A-MGR', { level: 'M1', managerPositionId: 'A-DIR', status: 'Open' }),
  se('A-MGR', { effectiveDate: '2026-09-10', level: 'M2', managerPositionId: 'A-DIR', status: 'Open' }),
  se('A-IC1', { level: 'P3', managerPositionId: 'A-MGR' }),
  se('A-IC2', { level: 'P3', managerPositionId: 'A-DIR' }),
  se('A-IC3', { level: 'P3', managerPositionId: 'A-DIR' }),
  se('A-MUC', { level: 'P4', managerPositionId: 'A-DIR', location: 'Munich', costCenter: '1130-MUC' }),
  se('A-CON', { level: 'P3', managerPositionId: 'A-DIR', workerType: 'Contractor' }),
]

const WORKERS: readonly WorkerRow[] = [
  workerRow('E-DIR', 'A-DIR', { businessUnit: SE }),
  workerRow('E-1', 'A-IC1', { businessUnit: SE }),
  workerRow('E-2', 'A-IC2', { businessUnit: SE, hireDate: '2026-09-16' }),
  workerRow('E-3', 'A-IC3', { businessUnit: SE, onLeave: true, leavePaid: false }),
  workerRow('E-MUC', 'A-MUC', { businessUnit: SE, location: 'Munich' }),
  workerRow('E-CON', 'A-CON', { businessUnit: SE, workerType: 'Contractor' }),
  // Not in plan: an employee with no position.
  workerRow('E-X', null, { businessUnit: SE, level: 'P3', department: 'Design Verification' }),
]

const COMP: readonly CompRow[] = [
  compRow('E-DIR', '2026-04-01', 250_000),
  compRow('E-1', '2026-04-01', 120_000),
  compRow('E-2', '2026-09-16', 120_000),
  compRow('E-3', '2026-04-01', 120_000),
  compRow('E-MUC', '2026-04-01', 100_000, 'EUR'),
  compRow('E-X', '2026-04-01', 120_000),
]

const ASSUMPTIONS: readonly AssumptionRow[] = [
  assumption('bonusTarget', 'P3', 0.1),
  assumption('bonusTarget', 'P4', 0.1),
  assumption('bonusTarget', 'M2', 0.2),
  assumption('bonusFunding', 'FY27', 1),
  assumption('burden', 'United States|social', 0.062),
  assumption('burdenCap', 'United States|social', 176_100),
  assumption('benefits', 'United States', 18_000),
  assumption('burden', 'Germany|social', 0.21),
  assumption('burdenCap', 'Germany|social', 90_600),
  assumption('benefits', 'Germany', 0),
  assumption('equity', 'P3', 0),
  assumption('equity', 'P4', 0),
  assumption('equity', 'M2', 0),
]

/** EUR actual 1.10 in August and 1.12 in September. */
const RATES = [...fxRates('EUR', 'actual', ['2026-08'], 1.1), ...fxRates('EUR', 'actual', ['2026-09'], 1.12)]

const actuals = (month: '2026-08' | '2026-09', over: Partial<ActualsInput> = {}): ActualsInput => ({
  month,
  positions: POSITIONS,
  workers: WORKERS,
  comp: COMP,
  assumptions: ASSUMPTIONS,
  versionId: 'fy27-working',
  versionName: 'FY27 Working',
  rates: RATES,
  ...over,
})

/** $120,000 P3 San Jose: (120,000 + 12,000 + 0.062 × 132,000 + 18,000) ÷ 12 = $13,182.00 a month. */
const P3_MONTH = 13_182
/** €100,000 P4 Munich: (100,000 + 10,000 + 0.21 × 90,600) ÷ 12 = €10,752.1667 a month. */
const MUC_MONTH_LOCAL = 129_026 / 12

const lineOf = (lines: readonly ActualLine[], employeeId: string): ActualLine => {
  const l = lines.find((x) => x.employeeId === employeeId)
  if (!l) throw new Error(`no line for ${employeeId}`)
  return l
}

describe('actualLines: HRIS actuals for a month', () => {
  const sep = actualLines(actuals('2026-09'))

  it('one line per Employee assignment active in the month; contractors have none', () => {
    expect(sep.map((l) => l.employeeId).sort()).toEqual(['E-1', 'E-2', 'E-3', 'E-DIR', 'E-MUC', 'E-X'])
  })

  it('a full month at HRIS pay: $13,182.00, heads 1, no one-time', () => {
    const l = lineOf(sep, 'E-1')
    expect(l).toMatchObject({ positionId: 'A-IC1', month: '2026-09', heads: 1, fte: 1, active: 1, rate: 1 })
    expect(l.usd.loaded).toBeCloseTo(P3_MONTH, 2)
    expect(l.local.base).toBeCloseTo(10_000, 2)
    expect(l.usd.oneTime).toBe(0)
    expect(l.leave).toBe('none')
  })

  it('a hire on 16 Sep is 1 head at 30 Sep and costs 15 of 30 days (daily)', () => {
    const l = lineOf(sep, 'E-2')
    expect(l.heads).toBe(1)
    expect(l.active).toBeCloseTo(0.5, 12)
    expect(l.usd.loaded).toBeCloseTo(P3_MONTH / 2, 2)
  })

  it('unpaid leave sets the pay lines to 0 and keeps the line and the head', () => {
    const l = lineOf(sep, 'E-3')
    expect(l.leave).toBe('unpaid')
    expect(l.heads).toBe(1)
    expect(l.usd.loaded).toBe(0)
    expect(l.usd.equity).toBe(0)
  })

  it('a non-USD line is at the month’s actual rate', () => {
    const l = lineOf(sep, 'E-MUC')
    expect(l.currency).toBe('EUR')
    expect(l.rate).toBe(1.12)
    expect(l.local.base + l.local.bonus + l.local.burden + l.local.benefits).toBeCloseTo(MUC_MONTH_LOCAL, 6)
    expect(l.usd.loaded).toBeCloseTo(MUC_MONTH_LOCAL * 1.12, 2)
    expect(lineOf(actualLines(actuals('2026-08')), 'E-MUC').rate).toBe(1.1)
  })

  it('an employee not in the plan has a line with no position, at their HRIS level', () => {
    const l = lineOf(sep, 'E-X')
    expect(l.positionId).toBeNull()
    expect(l.usd.loaded).toBeCloseTo(P3_MONTH, 2)
  })

  it('refuses a month with no actual rate for a currency paid', () => {
    expect(() => actualLines(actuals('2026-09', { rates: [] }))).toThrow(/No actual rate for EUR/)
  })
})

describe('closeMonth: the snapshot and its atom index (7.3a, C20)', () => {
  const aug = closeMonth(actuals('2026-08'), '2026-09-02T10:00', 'E8001')
  const sep = closeMonth(actuals('2026-09'), '2026-10-02T10:00', 'E8001')

  it('stores the lines as a table that reads back the same', () => {
    expect([...actualLineRows(sep.lines)].map((l) => l.employeeId).sort()).toEqual(
      actualLines(actuals('2026-09'))
        .map((l) => l.employeeId)
        .sort(),
    )
    expect(sep).toMatchObject({ month: '2026-09', closedAt: '2026-10-02T10:00', by: 'E8001' })
  })

  it('stores atomIndex(positions, month end) with each close', () => {
    expect(aug.atoms).toEqual(atomIndex(POSITIONS, '2026-08-31'))
    expect(sep.atoms).toEqual(atomIndex(POSITIONS, '2026-09-30'))
    expect(aug.atoms.closeDate).toBe('2026-08-31')
    expect(sep.atoms.closeDate).toBe('2026-09-30')
  })

  it('the two closes differ by one partition change: the Open manager seat raised to M2', () => {
    expect(atomOf('A-IC1', aug.atoms)).toBe('A-DIR')
    expect(atomOf('A-MGR', aug.atoms)).toBe('A-DIR')
    expect(atomOf('A-IC1', sep.atoms)).toBe('A-MGR')
    expect(atomOf('A-MGR', sep.atoms)).toBe('A-MGR')
    const moved = Object.keys(sep.atoms.byPosition).filter(
      (id) => sep.atoms.byPosition[id] !== aug.atoms.byPosition[id],
    )
    expect(moved.sort()).toEqual(['A-IC1', 'A-MGR'])
    for (const id of ['A-DIR', 'A-IC2', 'A-IC3', 'A-MUC'])
      expect(atomOf(id, sep.atoms), id).toBe(atomOf(id, aug.atoms))
  })

  it('the stored index stays as it was when the positions change after the close', () => {
    const before = structuredClone(aug.atoms)
    closeMonth(actuals('2026-09'), '2026-10-02T10:00', 'E8001')
    expect(aug.atoms).toEqual(before)
  })

  it('hashes the close: verifyClose holds, and a changed line or index does not', () => {
    expect(aug.hash).toMatch(/^sha256-[0-9a-f]{64}$/)
    expect(verifyClose(aug)).toBe(true)
    expect(closeHash(aug)).toBe(aug.hash)
    const lines = structuredClone(aug.lines)
    lines.numbers.usdLoaded[0] += 0.01
    expect(verifyClose({ ...aug, lines })).toBe(false)
    expect(verifyClose({ ...aug, atoms: sep.atoms })).toBe(false)
    expect(closeMonth(actuals('2026-08'), '2026-09-02T10:00', 'E8001').hash).toBe(aug.hash)
  })
})

describe('closed months', () => {
  const closes = [
    closeMonth(actuals('2026-08'), '2026-09-02T10:00', 'E8001'),
    closeMonth(actuals('2026-09'), '2026-10-02T10:00', 'E8001'),
  ]

  it('closedThrough, lastCloseDate and firstOpenMonth', () => {
    expect(closedThrough(closes)).toBe('2026-09')
    expect(lastCloseDate(closes)).toBe('2026-09-30')
    expect(firstOpenMonth(closes, '2026-04')).toBe('2026-10')
    expect(closedThrough([])).toBeNull()
    expect(lastCloseDate([])).toBeNull()
    expect(firstOpenMonth([], '2026-04')).toBe('2026-04')
    // A grid that starts after the first open month (FY28 while FY27 closes) reads its own first month.
    expect(firstOpenMonth(closes, '2027-04')).toBe('2027-04')
  })
})

describe('adjustmentsFor: back-dated changes (6.6)', () => {
  const closes: MonthClose[] = [
    closeMonth(actuals('2026-08'), '2026-09-02T10:00', 'E8001'),
    closeMonth(actuals('2026-09'), '2026-10-02T10:00', 'E8001'),
  ]
  const postIn = firstOpenMonth(closes, '2026-04')
  const recomputeWith =
    (over: Partial<ActualsInput>) =>
    (month: string): ActualLine[] =>
      actualLines(actuals(month as '2026-08' | '2026-09', over))

  it('ADJUSTMENT_REASON is generated from the kind and never names leave', () => {
    expect(ADJUSTMENT_REASON).toEqual({
      hire: 'Back-dated hire',
      exit: 'Back-dated exit',
      other: 'Other HRIS change',
    })
    for (const r of Object.values(ADJUSTMENT_REASON)) expect(r).not.toMatch(/leave/i)
  })

  it('nothing posts when nothing changed', () => {
    expect(adjustmentsFor(closes, recomputeWith({}), postIn, [])).toEqual([])
  })

  it('a back-dated hire in August posts as a hire in the first open month', () => {
    const workers = [...WORKERS, workerRow('E-4', 'A-IC2', { businessUnit: SE, hireDate: '2026-08-10' })]
    const comp = [...COMP, compRow('E-4', '2026-08-10', 120_000)]
    const adj = adjustmentsFor(closes, recomputeWith({ workers, comp }), postIn, [])
    const aug = adj.filter((a) => a.forMonth === '2026-08')
    expect(aug).toHaveLength(1)
    expect(aug[0]).toMatchObject({
      id: 'adj-2026-08-E-4-hire',
      postedIn: '2026-10',
      forMonth: '2026-08',
      positionId: 'A-IC2',
      kind: 'hire',
      reason: 'Back-dated hire',
    })
    expect(aug[0].delta.active).toBeCloseTo(22 / 31, 12)
    expect(aug[0].delta.usd.loaded).toBeCloseTo((P3_MONTH * 22) / 31, 2)
    // E-4 is also new in September: the second line moves the head, not E-2's.
    expect(adj.find((a) => a.forMonth === '2026-09')?.kind).toBe('hire')
  })

  it('a back-dated exit posts as an exit in each closed month it changes', () => {
    const workers = WORKERS.map((w) => (w.employeeId === 'E-1' ? { ...w, terminationDate: '2026-08-20' } : w))
    const adj = adjustmentsFor(closes, recomputeWith({ workers }), postIn, [])
    expect(adj.map((a) => [a.id, a.kind, a.reason])).toEqual([
      ['adj-2026-08-E-1-exit', 'exit', 'Back-dated exit'],
      ['adj-2026-09-E-1-exit', 'exit', 'Back-dated exit'],
    ])
    expect(adj[0].delta.active).toBeCloseTo(20 / 31 - 1, 12)
    expect(adj[1].delta.heads).toBe(-1)
    expect(adj[1].delta.usd.loaded).toBeCloseTo(-P3_MONTH, 2)
  })

  it('pay, comp, FTE and leave changes are all "Other HRIS change"', () => {
    const comp = [...COMP, compRow('E-2', '2026-09-16', 130_000)]
    const fte = WORKERS.map((w) => (w.employeeId === 'E-DIR' ? { ...w, fte: 0.8 } : w))
    const leave = WORKERS.map((w) => (w.employeeId === 'E-1' ? { ...w, onLeave: true, leavePaid: false } : w))
    for (const over of [{ comp }, { workers: fte }, { workers: leave }]) {
      const adj = adjustmentsFor(closes, recomputeWith(over), postIn, [])
      expect(adj.length).toBeGreaterThan(0)
      for (const a of adj) {
        expect(a.kind).toBe('other')
        expect(a.reason).toBe('Other HRIS change')
        expect(a.reason).not.toMatch(/leave/i)
        expect(a.postedIn).toBe('2026-10')
      }
    }
  })

  it('a change in the paid-leave flag alone moves no amount and posts nothing', () => {
    const paid = WORKERS.map((w) => (w.employeeId === 'E-1' ? { ...w, onLeave: true, leavePaid: true } : w))
    expect(adjustmentsFor(closes, recomputeWith({ workers: paid }), postIn, [])).toEqual([])
  })

  it('a posted change never posts again, and one that moves again posts only the new difference', () => {
    const comp130 = [...COMP, compRow('E-2', '2026-09-16', 130_000)]
    const first = adjustmentsFor(closes, recomputeWith({ comp: comp130 }), postIn, [])
    expect(first.map((a) => a.id)).toEqual(['adj-2026-09-E-2-other'])
    expect(adjustmentsFor(closes, recomputeWith({ comp: comp130 }), postIn, first)).toEqual([])
    const comp140 = [...COMP, compRow('E-2', '2026-09-16', 140_000)]
    const again: Adjustment[] = adjustmentsFor(closes, recomputeWith({ comp: comp140 }), postIn, first)
    expect(again.map((a) => a.id)).toEqual(['adj-2026-09-E-2-other-2'])
    expect(again[0].delta.usd.base).toBeCloseTo(first[0].delta.usd.base, 6)
  })
})

describe('closes snapshot the one-time items booked in their month (15.2 C32, lead decision D-CLOSE)', () => {
  const offer = (over: Partial<ReqRow> & Pick<ReqRow, 'reqId' | 'positionId'>): ReqRow => ({
    status: 'Open',
    stage: 'Offer accepted',
    reqType: 'New',
    openedDate: '2026-05-01',
    offerCurrency: 'USD',
    offerBase: 150_000,
    ...over,
  })
  const positions: PositionRow[] = [
    se('P-CL-AG', { level: 'P3', status: 'Open' }),
    se('P-CL-HIRE', { level: 'P3', status: 'Open' }),
    se('P-CL-MUC', { level: 'P4', status: 'Open', location: 'Munich', costCenter: '1130-MUC' }),
    se('P-CL-ELIM', { level: 'P3' }),
    // Eliminated with last day 31 Aug; HRIS still shows the holder (D-ELIM), severance books in September.
    se('P-CL-ELIM', {
      level: 'P3',
      effectiveDate: '2026-09-01',
      status: 'Eliminated',
      endDate: '2026-08-31',
      endReason: 'Eliminated',
    }),
  ]
  const reqs: ReqRow[] = [
    // Agency fee in the accepted month (August); sign-on in the start month (November).
    offer({
      reqId: 'REQ-CL-AG',
      positionId: 'P-CL-AG',
      offerAcceptedDate: '2026-08-12',
      startDate: '2026-11-02',
      agencyFee: 25_000,
      signOnBonus: 8_000,
    }),
    // Started 1 Sep: sign-on and relocation in September, on the hire.
    offer({
      reqId: 'REQ-CL-HIRE',
      positionId: 'P-CL-HIRE',
      status: 'Filled',
      stage: 'Started',
      offerAcceptedDate: '2026-07-20',
      startDate: '2026-09-01',
      closedDate: '2026-09-01',
      offerBase: 120_000,
      signOnBonus: 12_000,
      relocation: 4_000,
    }),
    // A EUR agency fee accepted 10 Sep: at September's actual rate, 1.12.
    offer({
      reqId: 'REQ-CL-MUC',
      positionId: 'P-CL-MUC',
      offerAcceptedDate: '2026-09-10',
      startDate: '2027-01-04',
      offerCurrency: 'EUR',
      offerBase: 100_000,
      agencyFee: 10_000,
    }),
  ]
  const workers: WorkerRow[] = [
    workerRow('E-CL-HIRE', 'P-CL-HIRE', { businessUnit: SE, hireDate: '2026-09-01' }),
    workerRow('E-CL-ELIM', 'P-CL-ELIM', { businessUnit: SE }),
  ]
  const comp: CompRow[] = [
    compRow('E-CL-HIRE', '2026-09-01', 120_000),
    compRow('E-CL-ELIM', '2026-04-01', 120_000),
  ]
  const assumptions = [...ASSUMPTIONS, assumption('severance', 'United States', 3)]
  const input = (month: '2026-08' | '2026-09', withReqs = true): ActualsInput => ({
    month,
    positions,
    workers,
    comp,
    assumptions,
    versionId: 'fy27-working',
    versionName: 'FY27 Working',
    rates: RATES,
    ...(withReqs ? { reqs } : {}),
  })
  const oneTime = (lines: readonly ActualLine[]) =>
    lines
      .filter((l) => l.local.oneTime !== 0)
      .map((l) => [l.employeeId, l.positionId, l.currency, l.rate, l.local.oneTime, l.usd.oneTime])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])))

  it('August: the agency fee in its offer-accepted month, keyed by the req while the hire has not started', () => {
    expect(oneTime(actualLines(input('2026-08')))).toEqual([
      ['REQ-CL-AG', 'P-CL-AG', 'USD', 1, 25_000, 25_000],
    ])
  })

  it('September: the hire’s sign-on and relocation, the severance, and a EUR fee at the month’s actual rate', () => {
    const close = closeMonth(input('2026-09'), '2026-10-02T10:00', 'E8001')
    const lines = [...actualLineRows(close.lines)]
    expect(oneTime(lines)).toEqual([
      ['E-CL-ELIM', 'P-CL-ELIM', 'USD', 1, 30_000, 30_000],
      ['E-CL-HIRE', 'P-CL-HIRE', 'USD', 1, 16_000, 16_000],
      ['REQ-CL-MUC', 'P-CL-MUC', 'EUR', 1.12, 10_000, expect.closeTo(11_200, 6)],
    ])
    for (const l of lines.filter((x) => x.local.oneTime !== 0)) {
      expect(l).toMatchObject({ heads: 0, fte: 0, active: 0, leave: 'none' })
      expect([l.local.base, l.local.bonus, l.local.burden, l.local.benefits, l.local.vacancy]).toEqual([
        0, 0, 0, 0, 0,
      ])
      expect(l.usd.loaded).toBe(l.usd.oneTime)
    }
    expect(verifyClose(close)).toBe(true)
  })

  it('without reqs a close books severance only', () => {
    expect(oneTime(actualLines(input('2026-09', false)))).toEqual([
      ['E-CL-ELIM', 'P-CL-ELIM', 'USD', 1, 30_000, 30_000],
    ])
  })

  it("matches Working's one-time items month by month (local), so the forecast's closed months carry them", () => {
    const working = {
      versionId: 'fy27-working',
      name: 'FY27 Working',
      fiscalYear: 'FY27' as const,
      grid: { from: '2026-04' as const, to: '2027-03' as const },
      proration: 'daily' as const,
    }
    const months = ['2026-08', '2026-09'] as const
    const planRates = [
      ...fxRates('EUR', 'plan', ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'], 1.08),
      ...fxRates('EUR', 'plan', ['2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03'], 1.08),
    ]
    const ctx = lineContext({
      version: working,
      asOf: '2026-09-30',
      positions,
      workers,
      comp,
      reqs,
      requests: [],
      assumptions,
      rates: { table: planRates, use: 'plan', closedThrough: null },
    })
    const ids = [...new Set(positions.map((p) => p.positionId))]
    for (const month of months) {
      let plan = 0
      for (const id of ids)
        for (const l of monthLine(toPosition(positions.find((p) => p.positionId === id)!), month, ctx))
          plan += l.local.oneTime
      const closed = actualLines(input(month)).reduce((n, l) => n + l.local.oneTime, 0)
      expect(closed, month).toBeCloseTo(plan, 6)
      expect(closed, month).toBeGreaterThan(0)
    }
  })

  it('a back-dated change to a one-time item posts as an "Other HRIS change", never a hire', () => {
    const closes = [closeMonth(input('2026-08'), '2026-09-02T10:00', 'E8001')]
    const raised = reqs.map((r) => (r.reqId === 'REQ-CL-AG' ? { ...r, agencyFee: 26_000 } : r))
    const adj = adjustmentsFor(
      closes,
      () => actualLines({ ...input('2026-08'), reqs: raised }),
      '2026-10',
      [],
    )
    expect(adj.map((a) => [a.id, a.kind, a.reason, a.delta.usd.oneTime])).toEqual([
      ['adj-2026-08-REQ-CL-AG-other', 'other', 'Other HRIS change', 1_000],
    ])
  })
})
