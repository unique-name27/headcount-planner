/**
 * Freezes (docs/PLAN.md 10.4, 6.9 freeze savings, 15.1 R10, 16.2 "freeze"): which seats a freeze
 * covers, the notice, the openings it holds, and freeze savings at band estimate, never a Budget line.
 */
import { describe, expect, it } from 'vitest'
import type { FreezeRow } from '@/data/schema'
import type { SeatPlace } from '../types'
import type { SeatType } from './band'
import {
  type FreezeOpening,
  type FreezeSavingsInput,
  freezeCovers,
  freezeNotice,
  freezeOn,
  freezeSavings,
  frozenOpenings,
  type InTree,
} from './freeze'

const freeze = (freezeId: string, over: Partial<FreezeRow> = {}): FreezeRow => ({
  freezeId,
  businessUnit: 'Operations',
  department: null,
  costCenter: null,
  leaderPositionId: null,
  startDate: '2026-08-01',
  endDate: null,
  allowBackfill: null,
  reason: 'Cost review',
  ...over,
})

const place = (over: Partial<SeatPlace> = {}): SeatPlace => ({
  positionId: 'P-1',
  managerPositionId: 'P-MGR',
  businessUnit: 'Operations',
  department: 'Supply Chain',
  costCenter: '3100-SJC',
  ...over,
})

/** P-1 and P-MGR sit under P-VP; nothing else does. */
const inTree: InTree = (positionId, root) =>
  root === 'P-VP' && (positionId === 'P-1' || positionId === 'P-MGR')

describe('freezeCovers', () => {
  it('covers the freeze dates, both ends included, open-ended when blank', () => {
    const f = freeze('F-1', { endDate: '2026-12-31' })
    expect(freezeCovers(f, place(), '2026-07-31', inTree)).toBe(false)
    expect(freezeCovers(f, place(), '2026-08-01', inTree)).toBe(true)
    expect(freezeCovers(f, place(), '2026-12-31', inTree)).toBe(true)
    expect(freezeCovers(f, place(), '2027-01-01', inTree)).toBe(false)
    expect(freezeCovers(freeze('F-2', { endDate: '' }), place(), '2030-01-01', inTree)).toBe(true)
  })

  it('matches every org field the freeze sets', () => {
    const on = '2026-09-01'
    expect(freezeCovers(freeze('F'), place({ businessUnit: 'Corporate' }), on, inTree)).toBe(false)
    expect(freezeCovers(freeze('F', { department: 'Supply Chain' }), place(), on, inTree)).toBe(true)
    expect(freezeCovers(freeze('F', { department: 'Facilities' }), place(), on, inTree)).toBe(false)
    expect(freezeCovers(freeze('F', { department: ' ' }), place(), on, inTree)).toBe(true)
    expect(freezeCovers(freeze('F', { costCenter: '3100-SJC' }), place(), on, inTree)).toBe(true)
    expect(freezeCovers(freeze('F', { costCenter: '3200-SJC' }), place(), on, inTree)).toBe(false)
  })

  it("covers a leader's tree, a new seat placed by its manager included", () => {
    const f = freeze('F', { leaderPositionId: 'P-VP' })
    const on = '2026-09-01'
    expect(freezeCovers(f, place(), on, inTree)).toBe(true)
    expect(freezeCovers(f, place({ positionId: 'P-9' }), on, inTree)).toBe(false)
    expect(freezeCovers(f, place({ positionId: null, managerPositionId: 'P-VP' }), on, inTree)).toBe(true)
    expect(freezeCovers(f, place({ positionId: null, managerPositionId: 'P-MGR' }), on, inTree)).toBe(true)
    expect(freezeCovers(f, place({ positionId: null, managerPositionId: 'P-OTHER' }), on, inTree)).toBe(false)
    expect(freezeCovers(f, place({ positionId: null, managerPositionId: null }), on, inTree)).toBe(false)
  })
})

describe('freezeOn and freezeNotice', () => {
  it('finds the first covering freeze by freezeId', () => {
    const fs = [
      freeze('F-2'),
      freeze('F-1', { startDate: '2026-09-01' }),
      freeze('F-0', { businessUnit: 'Corporate' }),
    ]
    expect(freezeOn(fs, place(), '2026-08-15', inTree)?.freezeId).toBe('F-2')
    expect(freezeOn(fs, place(), '2026-09-15', inTree)?.freezeId).toBe('F-1')
    expect(freezeOn(fs, place(), '2026-07-15', inTree)).toBeNull()
  })

  it('says hiring is frozen and that an exception can still be asked for', () => {
    expect(freezeNotice('Operations', freeze('F-1'))).toBe(
      'Hiring is frozen for Operations from 1 Aug 2026. You can still submit an exception with a business reason.',
    )
    expect(freezeNotice('Supply Chain', freeze('F-1', { endDate: '2026-12-31' }))).toBe(
      'Hiring is frozen for Supply Chain from 1 Aug 2026 to 31 Dec 2026. You can still submit an exception with a business reason.',
    )
    expect(freezeNotice('Operations', freeze('F-1'))).not.toMatch(/restricted|!/i)
  })
})

const P4_SJ: SeatType = { level: 'P4', location: 'San Jose', fte: 1 }
const BAND = 236_000

const opening = (positionId: string, over: Partial<FreezeOpening> = {}): FreezeOpening => ({
  positionId,
  status: 'Open',
  place: place({ positionId }),
  seat: P4_SJ,
  unfrozenStart: '2026-08-01',
  acceptedOffer: false,
  backfill: false,
  ...over,
})

describe('frozenOpenings', () => {
  it('lists unstarted openings in a frozen org, honoring accepted offers and allowed backfills', () => {
    const openings = [
      opening('P-A'),
      opening('P-B', { status: 'Planned' }),
      opening('P-C', { acceptedOffer: true }),
      opening('P-D', { backfill: true }),
      opening('P-E', { place: place({ positionId: 'P-E', businessUnit: 'Corporate' }) }),
    ]
    expect(frozenOpenings(openings, [freeze('F-1')], '2026-09-30', inTree)).toEqual([
      { positionId: 'P-A', freezeId: 'F-1' },
      { positionId: 'P-B', freezeId: 'F-1' },
      { positionId: 'P-D', freezeId: 'F-1' },
    ])
    expect(frozenOpenings(openings, [freeze('F-1', { allowBackfill: true })], '2026-09-30', inTree)).toEqual([
      { positionId: 'P-A', freezeId: 'F-1' },
      { positionId: 'P-B', freezeId: 'F-1' },
    ])
    expect(frozenOpenings(openings, [freeze('F-1')], '2026-07-31', inTree)).toEqual([])
  })

  it('names the freeze that holds a backfill when the first one allows it', () => {
    const fs = [freeze('F-1', { allowBackfill: true }), freeze('F-2')]
    expect(frozenOpenings([opening('P-D', { backfill: true })], fs, '2026-09-30', inTree)).toEqual([
      { positionId: 'P-D', freezeId: 'F-2' },
    ])
  })
})

describe('freezeSavings', () => {
  const input = (over: Partial<FreezeSavingsInput> = {}): FreezeSavingsInput => ({
    openings: [opening('P-A')],
    freezes: [freeze('F-1')],
    gridEnd: '2027-03-31',
    proration: 'daily',
    inTree,
    bandUsd: (seat) => (seat.level === 'P4' ? BAND : null),
    suppressedBackfills: [],
    ...over,
  })

  it("saves a reopened seat's band estimate ÷ 12 per month held, never its Budget line (6.9)", () => {
    // Filled at Budget lock at HRIS pay; the holder's last day was 15 Jul 2026, so the seat reopened on
    // 16 Jul and would have filled from 1 Aug; the freeze holds it from 1 Aug to the grid's end.
    const budgetLineMonthly = (150_000 * 1.1 * 1.08 + 18_000) / 12
    const s = freezeSavings(input())
    expect(s.byOpening).toEqual([
      {
        positionId: 'P-A',
        freezeId: 'F-1',
        from: '2026-08-01',
        to: '2027-03-31',
        amount: expect.any(Number),
      },
    ])
    expect(s.byOpening[0].amount).toBeCloseTo((BAND / 12) * 8, 6)
    expect(s.total).toBeCloseTo(157_333.33, 2)
    expect(s.byFreeze).toEqual([{ freezeId: 'F-1', amount: s.total }])
    for (const v of [s.total, s.byOpening[0].amount, s.byFreeze[0].amount])
      expect(Math.abs(v - budgetLineMonthly * 8)).toBeGreaterThan(1)
  })

  it('holds from the later of the freeze start and the unfrozen start, to the earlier of its end and the grid end', () => {
    const late = freezeSavings(input({ openings: [opening('P-A', { unfrozenStart: '2026-10-16' })] }))
    expect(late.byOpening[0]).toMatchObject({ from: '2026-10-16', to: '2027-03-31' })
    expect(late.total).toBeCloseTo((BAND * (16 / 31 + 5)) / 12, 6)
    const ended = freezeSavings(input({ freezes: [freeze('F-1', { endDate: '2026-10-31' })] }))
    expect(ended.byOpening[0]).toMatchObject({ from: '2026-08-01', to: '2026-10-31' })
    expect(ended.total).toBeCloseTo((BAND * 3) / 12, 6)
    const after = freezeSavings(input({ openings: [opening('P-A', { unfrozenStart: '2027-06-01' })] }))
    expect(after.byOpening).toEqual([])
    expect(after.total).toBe(0)
  })

  it("follows the version's proration", () => {
    const s = freezeSavings(
      input({ proration: 'full-month', openings: [opening('P-A', { unfrozenStart: '2026-10-16' })] }),
    )
    expect(s.total).toBeCloseTo((BAND * 6) / 12, 6)
  })

  it('never counts a month twice under overlapping freezes', () => {
    const s = freezeSavings(
      input({
        freezes: [
          freeze('F-1'),
          freeze('F-0', { startDate: '2026-09-01', endDate: '2026-12-31', department: 'Supply Chain' }),
        ],
      }),
    )
    expect(s.byOpening.map((x) => [x.freezeId, x.from, x.to])).toEqual([
      ['F-0', '2026-09-01', '2026-12-31'],
      ['F-1', '2026-08-01', '2026-08-31'],
      ['F-1', '2027-01-01', '2027-03-31'],
    ])
    expect(s.total).toBeCloseTo((BAND * 8) / 12, 6)
    expect(s.byFreeze.map((x) => x.freezeId)).toEqual(['F-0', 'F-1'])
    expect(s.byFreeze[0].amount).toBeCloseTo((BAND * 4) / 12, 6)
  })

  it('leaves out accepted offers, allowed backfills, other orgs and seats with no band', () => {
    const s = freezeSavings(
      input({
        freezes: [freeze('F-1', { allowBackfill: true })],
        openings: [
          opening('P-C', { acceptedOffer: true }),
          opening('P-D', { backfill: true }),
          opening('P-E', { place: place({ positionId: 'P-E', businessUnit: 'Corporate' }) }),
          opening('P-F', { seat: { level: 'P1', location: 'San Jose', fte: 1 } }),
        ],
      }),
    )
    expect(s.byOpening.map((x) => [x.positionId, x.amount])).toEqual([['P-F', 0]])
    expect(s.total).toBe(0)
    expect(s.byFreeze).toEqual([{ freezeId: 'F-1', amount: 0 }])
  })

  it('adds suppressed modeled backfills at midpoint to their freeze', () => {
    const s = freezeSavings(input({ suppressedBackfills: [{ freezeId: 'F-1', usd: 12_000 }] }))
    expect(s.byFreeze[0].amount).toBeCloseTo((BAND * 8) / 12 + 12_000, 6)
    expect(s.total).toBeCloseTo((BAND * 8) / 12 + 12_000, 6)
    expect(s.byOpening.reduce((n, o) => n + o.amount, 0)).toBeCloseTo((BAND * 8) / 12, 6)
  })
})
