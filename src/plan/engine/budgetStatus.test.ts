/**
 * Manager allocation and budget status (docs/PLAN.md 6.9, 15.1 R2, R3 and R32): fixture A1, cases (1)
 * to (5), and the reading behind them: the allocation is constant at plan-of-record pricing, staffed
 * counts people, and the first rule that applies shows.
 */
import { describe, expect, it } from 'vitest'
import type { PositionRow } from '@/data/schema'
import { allocation, allocationSeats, approvalEndsBy, byRequestId } from './allocation'
import type { SeatType } from './band'
import { budgetStatus, type PendingEffect, type StaffedPerson, staffed } from './budgetStatus'
import { A1, A1_5, a1BandCost } from './fixtures/budgetStatus'
import { positionRow } from './fixtures/common'

describe('A1: allocation 6 heads, $480,000', () => {
  it('adds up: 5 Filled + 1 Open, left to fill 1, left to request 0', () => {
    const a = allocation(A1.allocation.input)
    expect(a.heads).toBe(A1.allocation.heads)
    expect(a.bandCost).toBeCloseTo(A1.allocation.bandCost, 2)
    expect(a.filled).toBe(A1.allocation.filled)
    expect(a.open).toBe(A1.allocation.open)
    expect(a.planned).toBe(A1.allocation.planned)
    expect(a.leftToFill).toBe(A1.allocation.leftToFill)
    expect(a.leftToRequest).toBe(A1.allocation.leftToRequest)
    expect(a.leftToFill).toBe(a.open + a.planned)
  })

  for (const c of A1.cases) {
    it(`${c.id}: ${c.text}`, () => {
      const months = staffed(c.people, A1.months, a1BandCost)
      expect(months.map((m) => m.month)).toEqual([...A1.months])
      for (const want of 'staffedAt' in c ? c.staffedAt : []) {
        const got = months.find((m) => m.month === want.month)
        expect(got?.heads, want.month).toBe(want.heads)
        expect(got?.bandCost, want.month).toBeCloseTo(want.bandCost, 2)
      }
      const status = budgetStatus({
        allocation: { heads: A1.allocation.heads, bandCost: A1.allocation.bandCost },
        staffed: months,
        pending: c.pending,
        atRiskShare: A1.atRiskShare,
      })
      expect(status.status).toBe(c.status)
      expect(status.text).toBe(c.text)
      expect(status.text).not.toMatch(/\$|\d{1,3},\d{3}/)
    })
  }
})

describe('A1 (5): the allocation is priced at the plan of record, never at Working', () => {
  it('prices a seat raised by a Level change after the lock at its lock-date level', () => {
    const { seats, eliminated } = allocationSeats(A1_5.input)
    const raised = seats.find((s) => s.positionId === 'P-A1-6')
    expect(raised?.seat.level).toBe(A1_5.pricedLevel)
    const a = allocation({ fiscalYear: 'FY27', seats, eliminated, bandCost: a1BandCost })
    expect(a.bandCost).toBeCloseTo(A1_5.bandCost, 2)
  })

  it("so case (4)'s team reads Over, not At risk", () => {
    const { seats, eliminated } = allocationSeats(A1_5.input)
    const a = allocation({ fiscalYear: 'FY27', seats, eliminated, bandCost: a1BandCost })
    const c4 = A1.cases[3]
    const status = budgetStatus({
      allocation: { heads: a.heads, bandCost: a.bandCost },
      staffed: staffed(c4.people, A1.months, a1BandCost),
      pending: [],
      atRiskShare: A1.atRiskShare,
    })
    expect(status.status).toBe(A1_5.status)
  })
})

/* ───────────── the D2 reading: allocation constant, staffed people, precedence ───────────── */

const P3: SeatType = { level: 'P3', location: 'San Jose', fte: 1 }
const P4: SeatType = { level: 'P4', location: 'San Jose', fte: 1 }
const person = (n: number, over: Partial<StaffedPerson> = {}): StaffedPerson => ({
  id: `E-D2-${n}`,
  positionId: `P-A1-${n}`,
  start: '2024-01-01',
  lastDay: null,
  seat: P3,
  allocated: P3,
  ...over,
})
const team = (n: number): StaffedPerson[] => Array.from({ length: n }, (_, i) => person(i + 1))
const status = (people: readonly StaffedPerson[], pending: PendingEffect[] = [], cost = a1BandCost) =>
  budgetStatus({
    allocation: { heads: A1.allocation.heads, bandCost: A1.allocation.bandCost },
    staffed: staffed(people, A1.months, cost),
    pending,
    atRiskShare: A1.atRiskShare,
  })

describe('the allocation is constant for the fiscal year (D2, R2)', () => {
  const rows: PositionRow[] = [
    ...[1, 2, 3, 4, 5, 6].map((n) => positionRow(`P-A1-${n}`, { managerPositionId: 'P-A1-MGR' })),
    // After the lock: an approved Location change, an approved FTE change, an HRBP Working edit, and a seat put On hold.
    positionRow('P-A1-1', {
      effectiveDate: '2026-08-01',
      location: 'Austin',
      managerPositionId: 'P-A1-MGR',
      sourceRequestId: 'R-LOC',
    }),
    positionRow('P-A1-2', {
      effectiveDate: '2026-08-01',
      fte: 0.5,
      managerPositionId: 'P-A1-MGR',
      sourceRequestId: 'R-FTE',
    }),
    positionRow('P-A1-3', { effectiveDate: '2026-08-15', level: 'P4', managerPositionId: 'P-A1-MGR' }),
    positionRow('P-A1-6', { effectiveDate: '2026-09-01', status: 'On hold', managerPositionId: 'P-A1-MGR' }),
    // An approved New role since the lock, and one that starts after FY end (the seats they created).
    positionRow('P-NEW-1', {
      effectiveDate: '2026-08-20',
      status: 'Planned',
      level: 'P4',
      managerPositionId: 'P-A1-MGR',
      startDate: '2026-12-01',
      sourceRequestId: 'R-NEW',
    }),
    positionRow('P-NEW-2', {
      effectiveDate: '2026-08-20',
      status: 'Planned',
      managerPositionId: 'P-A1-MGR',
      startDate: '2027-06-01',
      sourceRequestId: 'R-NEW2',
    }),
    // An approved Elimination since the lock: last day 31 Dec 2026, the Eliminated row from 1 Jan.
    positionRow('P-A1-5', {
      effectiveDate: '2027-01-01',
      status: 'Eliminated',
      managerPositionId: 'P-A1-MGR',
      endDate: '2026-12-31',
      endReason: 'Eliminated',
      sourceRequestId: 'R-ELIM',
    }),
    // Outside the tree.
    positionRow('P-OTHER', { managerPositionId: 'P-ELSEWHERE' }),
  ]
  const planOfRecordSeats = ['P-A1-1', 'P-A1-2', 'P-A1-3', 'P-A1-4', 'P-A1-5', 'P-A1-6', 'P-OTHER']
  const input = {
    fiscalYear: 'FY27' as const,
    lockDate: '2026-07-15',
    planOfRecordSeats,
    lockedPositions: new Set(planOfRecordSeats),
    positions: rows,
    tree: (seat: { managerPositionId: string | null }) => seat.managerPositionId === 'P-A1-MGR',
    seatNow: (id: string) =>
      id === 'P-A1-6'
        ? { status: 'On hold' as const, hasReq: false, pendingStartRecruiting: false }
        : id.startsWith('P-NEW') || id.startsWith('R-')
          ? { status: 'Planned' as const, hasReq: false, pendingStartRecruiting: false }
          : { status: 'Filled' as const, hasReq: false, pendingStartRecruiting: false },
  }

  it('prices plan-of-record seats at their lock-date rows, whatever was approved or edited since', () => {
    const { seats } = allocationSeats(input)
    const byId = new Map(seats.map((s) => [s.positionId, s]))
    expect(byId.get('P-A1-1')?.seat).toEqual(P3)
    expect(byId.get('P-A1-2')?.seat).toEqual(P3)
    expect(byId.get('P-A1-3')?.seat).toEqual(P3)
    expect(byId.get('P-A1-1')?.source).toBe('plan-of-record')
  })

  it('adds approved New roles at their approved values, only those starting in the year', () => {
    const { seats } = allocationSeats(input)
    const add = seats.find((s) => s.positionId === 'P-NEW-1')
    expect(add).toMatchObject({ source: 'approved-add', seat: P4, status: 'Planned' })
    expect(seats.some((s) => s.positionId === 'P-NEW-2')).toBe(false)
  })

  it('leaves out On hold seats, seats outside the tree and approved eliminations', () => {
    const { seats, eliminated } = allocationSeats(input)
    expect(seats.some((s) => s.positionId === 'P-A1-6')).toBe(false)
    expect(seats.some((s) => s.positionId === 'P-OTHER')).toBe(false)
    expect([...eliminated]).toEqual(['P-A1-5'])
    const a = allocation({ fiscalYear: 'FY27', seats, eliminated, bandCost: a1BandCost })
    // P-A1-1 to P-A1-4 at P3 ($80,000 each) + P-NEW-1 at P4 ($108,800).
    expect(a.heads).toBe(5)
    expect(a.bandCost).toBeCloseTo(4 * 80_000 + 108_800, 2)
    expect(a.leftToFill).toBe(1)
    expect(a.leftToRequest).toBe(1)
  })

  it('an approved trade is absorbed: its give seats leave, its get seats join at their values', () => {
    // The rows applyTrade writes: the give seat Eliminated (Traded) from the approval date, a new get seat.
    const withTrade = {
      ...input,
      positions: [
        ...rows,
        positionRow('P-A1-4', {
          effectiveDate: '2026-09-10',
          status: 'Eliminated',
          managerPositionId: 'P-A1-MGR',
          endDate: '2026-09-09',
          endReason: 'Traded',
          sourceRequestId: 'R-TR',
        }),
        positionRow('R-TR-1', {
          effectiveDate: '2026-09-10',
          status: 'Planned' as const,
          managerPositionId: 'P-A1-MGR',
          startDate: '2027-01-01',
          sourceRequestId: 'R-TR',
        }),
      ],
    }
    const { seats, eliminated } = allocationSeats(withTrade)
    expect(eliminated.has('P-A1-4')).toBe(true)
    expect(seats.find((s) => s.positionId === 'R-TR-1')?.source).toBe('approved-add')
  })

  it('standard heads are a note: Σ weight ÷ 10,000, and they never set the status', () => {
    const a = allocation({ ...A1.allocation.input, weightBp: () => 4_567 })
    expect(a.standardHeads).toBeCloseTo((6 * 4_567) / 10_000, 12)
    const plain = allocation(A1.allocation.input)
    expect(plain.standardHeads).toBeNull()
    expect(a.heads).toBe(plain.heads)
    expect(a.bandCost).toBe(plain.bandCost)
  })
})

describe('approved changes come from the rows the approvals wrote, never the requests (known gap 6)', () => {
  const mgr = { managerPositionId: 'P-A1-MGR' }
  const planned = { status: 'Planned' as const, hasReq: false, pendingStartRecruiting: false }
  const filled = { status: 'Filled' as const, hasReq: false, pendingStartRecruiting: false }
  /** Two plan-of-record seats the lock saw, plus `extra` rows; every seat reads Filled, a created one Planned. */
  const run = (extra: PositionRow[], locked: readonly string[] = []) => {
    const positions = [positionRow('P-1', mgr), positionRow('P-2', mgr), ...extra]
    const created = new Set(positions.filter((r) => r.status === 'Planned').map((r) => r.positionId))
    return allocationSeats({
      fiscalYear: 'FY27',
      lockDate: '2026-07-15',
      planOfRecordSeats: ['P-1', 'P-2'],
      lockedPositions: new Set(['P-1', 'P-2', ...locked]),
      positions,
      tree: (seat) => seat.managerPositionId === 'P-A1-MGR',
      seatNow: (id) => (created.has(id) ? planned : filled),
    })
  }
  const created = (id: string, sourceRequestId: string | null, over: Partial<PositionRow> = {}) =>
    positionRow(id, { ...mgr, effectiveDate: '2026-08-01', status: 'Planned', sourceRequestId, ...over })
  const ended = (id: string, over: Partial<PositionRow>) =>
    positionRow(id, {
      ...mgr,
      status: 'Eliminated',
      sourceRequestId: 'R-E',
      endReason: 'Eliminated',
      ...over,
    })
  const ids = (r: ReturnType<typeof run>) => r.seats.map((s) => `${s.positionId}:${s.source}`)

  it('a seat an approval created that the lock never saw is an add, even on the lock day', () => {
    expect(ids(run([created('P-NEW', 'R-1', { effectiveDate: '2026-07-15' })]))).toEqual([
      'P-1:plan-of-record',
      'P-2:plan-of-record',
      'P-NEW:approved-add',
    ])
  })

  it('a seat the lock saw is never an add, and a seat no approval created is never one', () => {
    // Created by a request approved before the lock, and not alive at FY end in the plan of record.
    expect(ids(run([created('P-OLD', 'R-0', { effectiveDate: '2026-06-01' })], ['P-OLD']))).toEqual([
      'P-1:plan-of-record',
      'P-2:plan-of-record',
    ])
    // A seat imported after the lock with no request on its first row, then changed by one.
    expect(
      ids(
        run([
          created('P-HRIS', null),
          created('P-HRIS', 'R-2', { effectiveDate: '2026-09-01', level: 'P4' }),
        ]),
      ),
    ).toEqual(['P-1:plan-of-record', 'P-2:plan-of-record'])
  })

  it('lists adds after the plan-of-record seats in request ID order, then in the positions’ order', () => {
    const got = run([
      created('P-B', 'R-1000'),
      created('P-C', 'R-999'),
      created('P-A', 'R-1000'),
      created('P-D', 'R-1000', { startDate: '2027-04-01' }),
    ])
    expect(ids(got)).toEqual([
      'P-1:plan-of-record',
      'P-2:plan-of-record',
      'P-C:approved-add',
      'P-B:approved-add',
      'P-A:approved-add',
    ])
  })

  it('an approval’s Eliminated row ending a seat by FY end removes it before the last day', () => {
    const got = run([
      ended('P-1', { effectiveDate: '2027-03-31', endDate: '2027-03-30' }),
      created('P-NEW', 'R-1'),
      ended('P-NEW', { effectiveDate: '2026-11-01', endDate: '2026-10-31', sourceRequestId: 'R-2' }),
    ])
    expect([...got.eliminated].sort()).toEqual(['P-1', 'P-NEW'])
    expect(allocation({ fiscalYear: 'FY27', ...got, bandCost: a1BandCost }).heads).toBe(1)
  })

  it('keeps a seat whose Eliminated row no approval wrote, ends after FY end or is a transfer', () => {
    const got = run([
      ended('P-1', { effectiveDate: '2026-12-01', endDate: '2026-11-30', sourceRequestId: null }),
      // Last day 31 Mar 2027: a head at FY end, so this year's shape keeps it.
      ended('P-2', { effectiveDate: '2027-04-01', endDate: '2027-03-31' }),
      created('P-NEW', 'R-1'),
      ended('P-NEW', { effectiveDate: '2026-12-01', endDate: '2026-11-30', endReason: 'Transferred' }),
    ])
    expect([...got.eliminated]).toEqual([])
    expect(allocation({ fiscalYear: 'FY27', ...got, bandCost: a1BandCost }).heads).toBe(3)
  })

  it('reads an Eliminated row with a request and no reason as an elimination (cost.ts)', () => {
    expect(approvalEndsBy(ended('P-1', { effectiveDate: '2026-12-01', endReason: null }), '2027-03-31')).toBe(
      true,
    )
    expect(approvalEndsBy(ended('P-1', { effectiveDate: '2027-04-01', endDate: null }), '2027-03-31')).toBe(
      false,
    )
    expect(approvalEndsBy(ended('P-1', { status: 'On hold' }), '2027-03-31')).toBe(false)
  })

  it('orders request IDs naturally', () => {
    expect(['R-1000', 'R-999', 'R-1000-2', 'Q-5', 'R-10'].sort(byRequestId)).toEqual([
      'Q-5',
      'R-10',
      'R-999',
      'R-1000',
      'R-1000-2',
    ])
  })
})

describe('staffed counts people (D2, R32)', () => {
  it('a known exit leaves after its last day', () => {
    const people = [...team(5), person(6, { lastDay: '2026-10-15' })]
    const months = staffed(people, A1.months, a1BandCost)
    expect(months[0].heads).toBe(6)
    expect(months[1].heads).toBe(5)
    expect(months[1].bandCost).toBeCloseTo(400_000, 2)
  })

  it('a leaver and a replacement in one seat at one month-end are two people', () => {
    const people = [
      ...team(5),
      person(6, { lastDay: '2026-10-31' }),
      person(7, { positionId: 'P-A1-6', start: '2026-10-15' }),
    ]
    const oct = staffed(people, A1.months, a1BandCost)[1]
    expect(oct.heads).toBe(7)
    expect(status(people).status).toBe('At risk')
  })

  it('a not-in-plan employee who reports into the tree counts, at their HRIS level and location', () => {
    const people = [...team(5), person(6, { positionId: null, seat: P4, allocated: null })]
    const sep = staffed(people, A1.months, a1BandCost)[0]
    expect(sep.heads).toBe(6)
    expect(sep.bandCost).toBeCloseTo(5 * 80_000 + 108_800, 2)
    expect(sep.drivers).toEqual([])
  })
})

describe('budget status: the first rule that applies (R32)', () => {
  it('Over beats crossing: one more head than the allocation at the as-of month-end', () => {
    const s = status(team(7), [
      { requestId: 'R-1', type: 'New role', month: '2027-03', heads: 1, bandCost: 80_000 },
    ])
    expect(s).toMatchObject({
      status: 'Over',
      rule: 'over',
      text: 'Over: you have 1 more head than your allocation',
    })
  })

  it('crossing beats within 2%: a full team with a pending request in Mar', () => {
    const s = status(team(6), [
      { requestId: 'R-1', type: 'New role', month: '2027-03', heads: 1, bandCost: 80_000 },
    ])
    expect(s).toMatchObject({ status: 'At risk', rule: 'crossing', month: '2027-03' })
    expect(s.text).toBe('At risk: a pending request adds 1 head in Mar')
  })

  it('start dates that push staffed over in Feb are a crossing in heads', () => {
    const s = status([...team(6), person(7, { start: '2027-02-01' })])
    expect(s.text).toBe('At risk: start dates push you over in Feb')
  })

  it('a pending trade reads in heads from its start month', () => {
    const s = status(team(5), [
      { requestId: 'R-T', type: 'Trade', month: '2027-01', heads: 7, bandCost: 237_014.4 },
    ])
    expect(s.text).toBe('At risk: a pending trade adds 7 heads from Jan')
  })

  it('within 2% is read literally: 98% of the allocation is At risk, just under it is On track', () => {
    const cost = (share: number) => () => (A1.allocation.bandCost * share) / 6
    expect(status(team(6), [], cost(0.98)).rule).toBe('within')
    expect(status(team(6), [], cost(0.979)).status).toBe('On track')
  })

  it('reasons are heads or plain drivers, never amounts', () => {
    for (const s of [
      status(team(7)),
      status([...team(6), person(7, { start: '2027-02-01' })]),
      status([...team(5), person(6, { seat: P4 })]),
      status(team(6)),
    ])
      expect(s.text).not.toMatch(/\$|\d{1,3},\d{3}|\d{4,}/)
  })
})
