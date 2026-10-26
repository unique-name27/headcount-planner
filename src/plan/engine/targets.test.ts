/**
 * Asks, head effects, band effects and gap (docs/PLAN.md 6.9 and 10.3): fixtures G1, G2, G3 and A2; and,
 * with chain.test.ts (16.2), routing on the guarded asks cost: a Filled baseSalary or offerBase change
 * that keeps its atom's rounded value moves no out-of-plan bit, chain or over-target flag, and sweeping
 * a draft New role's start day and FTE flips out of plan only where the shown gap after approval
 * crosses 0; and a seat with no planned start, whose pending band effect equals the change approval
 * makes to Working (15.1 R33, lead decision D-NOSTART).
 */
import { describe, expect, it } from 'vitest'
import { atomIndex, atomOf } from '@/cost/atoms'
import { monthsOf } from '@/data/fiscal'
import {
  type CompRow,
  type ISODate,
  MIN_GROUP,
  type PositionRow,
  type ReqRow,
  type WorkerRow,
} from '@/data/schema'
import { roundCost, sumRounded } from '@/lib/costRounding'
import { addDays } from '@/lib/dates'
import type { HcRequest, PlanLine, SeatPlace, WorkingPlan } from '../types'
import { assumptionLookup } from './assumptions'
import { bandEstimate, loadsOf, type SeatType } from './band'
import { chainFor, outOfPlan, type PlanCheck } from './chain'
import { lineContext, versionLines } from './cost'
import { cutLine, defaultCutAfter, rankAsks } from './cycle'
import { CHAIN_ORG, facts } from './fixtures/chain'
import { AS_OF, assumption, compRow, fy27Working, hcRequest, positionRow, workerRow } from './fixtures/common'
import { A2, G1, G2, G3, IN_SE } from './fixtures/targets'
import { toAssignments } from './heads'
import { applyApproval } from './requests'
import {
  asks,
  asksContext,
  asksCost,
  bandEffect,
  gap,
  gapAfterApproval,
  headEffect,
  targetDateOf,
} from './targets'
import { approvedHeadsOn, seatHistories } from './versions'

describe('G1: story 6, target B + 40 against asks B + 58', () => {
  it('B is the same at 31 Mar 2027 and 31 Mar 2028', () => {
    const seats = seatHistories({
      positions: G1.context.positions,
      assignments: G1.context.assignments,
      reqs: [],
      requests: [],
    }).values()
    const list = [...seats]
    for (const d of G1.bDates) expect(approvedHeadsOn(list, d), d).toBe(G1.b)
  })

  it('a blank target date is the fiscal year end', () => {
    expect(targetDateOf(G1.target)).toBe(G1.targetDate)
  })

  it('asks = B + 58 and the gap is −18', () => {
    const ctx = asksContext(G1.context)
    const a = asks(G1.org, G1.targetDate, G1.requests, ctx)
    expect(a.heads).toBe(G1.asks.heads)
    expect(a.seatHeads).toBe(G1.asks.seatHeads)
    expect(a.pendingHeads).toBe(G1.asks.pendingHeads)
    expect(gap({ heads: G1.target.targetHeads, cost: null }, { heads: a.heads, cost: null }).heads).toBe(
      G1.gapHeads,
    )
  })

  it('the cut line falls after the 40th ranked head', () => {
    const ranked = rankAsks(
      G1.requests,
      'cyc-fy28',
      () => 1,
      () => 0,
    )
    expect(ranked).toHaveLength(58)
    expect(ranked.map((r) => r.priority)).toEqual(G1.requests.map((r) => r.priority))
    expect(defaultCutAfter(ranked, G1.room)).toBe(G1.cutAfter)
    const line = cutLine(ranked, G1.cutAfter)
    expect(line.headsAbove).toBe(G1.above)
    expect(line.headsBelow).toBe(G1.below)
    expect(line.above).toHaveLength(G1.above)
    expect(line.below).toHaveLength(G1.below)
  })
})

describe('G2: a target date before a start leaves it out of asks', () => {
  it('dated 30 Sep 2027: the Planned seat and the New role starting 1 Jan 2028 are out', () => {
    expect(targetDateOf(G2.dated.target)).toBe(G2.dated.date)
    expect(asks(G2.org, G2.dated.date, G2.requests, asksContext(G2.context)).heads).toBe(G2.dated.asks)
  })

  it('blank (31 Mar 2028): both count', () => {
    expect(targetDateOf(G2.blank.target)).toBe(G2.blank.date)
    expect(asks(G2.org, G2.blank.date, G2.requests, asksContext(G2.context)).heads).toBe(G2.blank.asks)
  })
})

describe('G3: in-year asks cost of a pending trade (11.7 rates)', () => {
  it('8 × $33,859.20 × 3/12 − $287,400 × 5/12 = −$52,031.60, never the annual band estimate', () => {
    const effect = bandEffect(G3.request, G3.org, G3.fiscalYear, asksContext(G3.context))
    expect(effect).toBeCloseTo(G3.bandEffect, 2)
    expect(effect).not.toBeCloseTo(G3.negativeControl, 2)
  })

  it('its head effect is +7 at the FY end', () => {
    expect(headEffect(G3.request, G3.org, '2027-03-31', asksContext(G3.context))).toBe(G3.headEffect)
  })

  it('the gap after approval equals the gap with the request pending', () => {
    const without = gap(G3.target, G3.asksWithout)
    expect(without.heads).toBe(G3.gapWithout.heads)
    expect(without.cost).toBeCloseTo(G3.gapWithout.cost, 2)
    const after = gapAfterApproval(without, G3.headEffect, G3.bandEffect)
    expect(after.heads).toBe(G3.gapAfter.heads)
    expect(after.cost).toBeCloseTo(G3.gapAfter.cost, 2)
    const pending = gap(G3.target, {
      heads: G3.asksWithout.heads + G3.headEffect,
      cost: G3.asksWithout.cost + G3.bandEffect,
    })
    expect(pending.heads).toBe(after.heads)
    expect(pending.cost).toBeCloseTo(after.cost ?? Number.NaN, 2)
  })
})

describe('A2: a pending Backfill', () => {
  it('on an Open seat leaves asks unchanged', () => {
    expect(headEffect(A2.onOpen.request, A2.org, A2.date, asksContext(A2.context))).toBe(A2.onOpen.headEffect)
  })

  it('on a seat held On hold by an internal move adds 1', () => {
    expect(headEffect(A2.onHold.request, A2.org, A2.date, asksContext(A2.context))).toBe(A2.onHold.headEffect)
  })

  it('asks count it by its head effect', () => {
    const ctx = asksContext(A2.context)
    expect(asks(A2.org, A2.date, [], ctx).heads).toBe(A2.asksWithout)
    expect(asks(A2.org, A2.date, [A2.onOpen.request, A2.onHold.request], ctx).heads).toBe(A2.asksWithBoth)
  })
})

/* ───────────── routing reads guarded asks only (PLAN 16.2 with chain.test.ts, C19) ───────────── */

describe('out of plan and the chain read the guarded asks cost, never exact HRIS sums (C19)', () => {
  const SE = 'Silicon Engineering'
  const FY27 = monthsOf('FY27')
  const TARGET_DATE = '2027-03-31'
  const se = (positionId: string, department: string, over: Partial<PositionRow> = {}): PositionRow =>
    positionRow(positionId, {
      effectiveDate: '2025-04-01',
      businessUnit: SE,
      department,
      costCenter: department === 'Design Verification' ? '1130-SJC' : '1140-SJC',
      jobFamily: 'Engineering',
      ...over,
    })
  // Two department atoms (no leader seats): 9 Filled seats in Design Verification, 6 Filled seats, an
  // accepted offer and a Planned seat in Physical Design.
  const positions: PositionRow[] = [
    se('P-RT-A00', 'Design Verification', { level: 'M1' }),
    ...Array.from({ length: 8 }, (_, i) =>
      se(`P-RT-A0${i + 1}`, 'Design Verification', { managerPositionId: 'P-RT-A00' }),
    ),
    se('P-RT-B00', 'Physical Design', { level: 'M1' }),
    ...Array.from({ length: 5 }, (_, i) =>
      se(`P-RT-B0${i + 1}`, 'Physical Design', { level: 'P4', managerPositionId: 'P-RT-B00' }),
    ),
    se('P-RT-B06', 'Physical Design', { level: 'P4', status: 'Open', managerPositionId: 'P-RT-B00' }),
    se('P-RT-B07', 'Physical Design', {
      level: 'P4',
      status: 'Planned',
      startDate: '2026-11-01',
      managerPositionId: 'P-RT-B00',
    }),
  ]
  const filled = positions.filter((p) => p.status === 'Filled')
  const workers: WorkerRow[] = filled.map((p) =>
    workerRow(p.positionId.replace('P-', 'E-'), p.positionId, {
      businessUnit: SE,
      department: p.department ?? null,
      costCenter: p.costCenter,
    }),
  )
  const salary = (p: PositionRow) => (p.level === 'M1' ? 210_000 : p.level === 'P4' ? 182_000 : 151_000)
  const baseComp = filled.map((p) => compRow(p.positionId.replace('P-', 'E-'), '2026-04-01', salary(p)))
  const offer = (offerBase: number): ReqRow => ({
    reqId: 'REQ-RT-1',
    positionId: 'P-RT-B06',
    status: 'Open',
    stage: 'Offer accepted',
    reqType: 'New',
    openedDate: '2026-07-01',
    offerAcceptedDate: '2026-09-10',
    startDate: '2026-11-02',
    offerBase,
    offerCurrency: 'USD',
  })
  const assumptions = [
    assumption('band', 'P3|San Jose|FY27', 165_000),
    assumption('band', 'P4|San Jose|FY27', 195_000),
    assumption('band', 'M1|San Jose|FY27', 230_000),
    assumption('bonusTarget', 'P3', 0.1),
    assumption('bonusTarget', 'P4', 0.1),
    assumption('bonusTarget', 'M1', 0.15),
    assumption('bonusFunding', 'FY27', 1),
    assumption('burden', 'United States|social', 0.062),
    assumption('burdenCap', 'United States|social', 176_100),
    assumption('benefits', 'United States', 18_000),
  ]
  const working = fy27Working('daily')
  const BAND_USD: Readonly<Record<string, number>> = { P3: 190_000, P4: 226_000, M1: 270_000 }
  const ctx = asksContext({
    positions,
    assignments: toAssignments(workers),
    reqs: [offer(200_000)],
    requests: [],
    proration: 'daily',
    firstOpenMonth: '2026-10',
    bandUsd: (seat) => (BAND_USD[seat.level] ?? 0) * seat.fte,
  })
  const index = atomIndex(positions, '2026-09-30')
  const managerOf = (id: string) => positions.find((p) => p.positionId === id)?.managerPositionId ?? null

  /** Working lines for FY27 with this comp and offer. */
  const linesWith = (comp: readonly CompRow[], offerBase = 200_000) =>
    versionLines(
      working,
      lineContext({
        version: working,
        asOf: AS_OF,
        positions,
        workers,
        comp,
        reqs: [offer(offerBase)],
        requests: [],
        assumptions,
        rates: { table: [], use: 'plan', closedThrough: null },
      }),
    ).filter((l) => FY27.includes(l.month))

  /**
   * The guarded asks cost (7.2 rule 8) as the cost guard computes it for routing: each atom's filled
   * and band parts rounded down on their own, atoms under 5 costed people left out, `sumRounded`.
   */
  const guarded = (lines: readonly PlanLine[]): number => {
    const byAtom = new Map<string, { filled: number; band: number; people: Set<string> }>()
    for (const l of lines) {
      const id = atomOf(l.positionId, index, managerOf)
      if (!id) continue
      let a = byAtom.get(id)
      if (!a) {
        a = { filled: 0, band: 0, people: new Set() }
        byAtom.set(id, a)
      }
      if (l.basis === 'band') a.band += l.usd.loaded
      else {
        a.filled += l.usd.loaded
        if (l.holderId && l.active > 0) a.people.add(`${l.basis}:${l.holderId}`)
      }
    }
    const parts: number[] = []
    for (const a of byAtom.values())
      if (a.people.size >= MIN_GROUP) parts.push(roundCost(a.filled), roundCost(a.band))
    return sumRounded(parts)
  }
  const exact = (lines: readonly PlanLine[]) => asksCost(IN_SE, 'FY27', lines, [], ctx).total

  const draft = (startDate: ISODate, fte: number): HcRequest =>
    hcRequest('R-RT', {
      state: 'Draft',
      requesterId: 'E2110',
      managerPositionId: 'P-SE-MGR',
      businessUnit: SE,
      department: 'Design Verification',
      level: 'P3',
      location: 'San Jose',
      fte,
      startDate,
    })
  const asksHeads = asks(IN_SE, TARGET_DATE, [], ctx).heads

  /** The PlanCheck routing builds, from the guarded asks without the request. */
  const checkOf = (
    req: HcRequest,
    guardedAsks: number,
    target: { heads: number; cost: number },
  ): PlanCheck => ({
    org: SE,
    target,
    asks: { heads: asksHeads, cost: guardedAsks },
    effect: { heads: headEffect(req, IN_SE, TARGET_DATE, ctx), cost: bandEffect(req, IN_SE, 'FY27', ctx) },
  })
  const routeOf = (req: HcRequest, check: PlanCheck) => {
    const f = facts({ bandEstimateUsd: (BAND_USD[req.level ?? ''] ?? 0) * (req.fte ?? 1), checks: [check] })
    return {
      outOfPlan: outOfPlan(req, { org: CHAIN_ORG, facts: f }),
      chain: chainFor(req, { org: CHAIN_ORG, facts: f }).map((s) => [s.role, s.approverId, s.reasons]),
      overTarget: gap(check.target!, check.asks).cost! < 0,
      gapAfter: gapAfterApproval(gap(check.target!, check.asks), check.effect.heads, check.effect.cost),
    }
  }

  const base = linesWith(baseComp)
  const req = draft('2026-12-01', 1)
  // The target sits exactly at the guarded asks plus this request's band effect: in plan, with no room.
  const target = { heads: asksHeads + 1, cost: guarded(base) + bandEffect(req, IN_SE, 'FY27', ctx) }
  const baseline = routeOf(req, checkOf(req, guarded(base), target))

  it('reads in plan at the boundary, and the chain has no leader step', () => {
    // 15 Filled seats, the accepted offer (from 2 Nov) and the Planned seat (from 1 Nov).
    expect(asksHeads).toBe(17)
    expect(baseline.outOfPlan).toBe(false)
    expect(baseline.chain.map(([role, who]) => [role, who])).toEqual([
      ['manager', 'E2100'],
      ['hrbp', 'E9002'],
      ['finance', 'E8001'],
    ])
  })

  it('a Filled baseSalary or offerBase change that keeps its atom rounded moves no bit, chain or flag', () => {
    const perturbations: [string, readonly PlanLine[]][] = [
      [
        'baseSalary +$1',
        linesWith(
          baseComp.map((c) => (c.employeeId === 'E-RT-A03' ? { ...c, baseSalary: c.baseSalary + 1 } : c)),
        ),
      ],
      [
        'baseSalary −$1,000',
        linesWith(
          baseComp.map((c) => (c.employeeId === 'E-RT-B02' ? { ...c, baseSalary: c.baseSalary - 1_000 } : c)),
        ),
      ],
      ['offerBase +$1', linesWith(baseComp, 200_001)],
      ['offerBase −$500', linesWith(baseComp, 199_500)],
    ]
    for (const [what, lines] of perturbations) {
      // The change is real in exact terms, and the guard's rounded value does not move.
      expect(exact(lines), what).not.toBeCloseTo(exact(base), 2)
      expect(guarded(lines), what).toBe(guarded(base))
      expect(routeOf(req, checkOf(req, guarded(lines), target)), what).toEqual(baseline)
    }
  })

  it('control: a raise that moves the atom a step does flip out of plan, adding the leader', () => {
    const raised = linesWith(
      baseComp.map((c) => (c.employeeId === 'E-RT-A03' ? { ...c, baseSalary: c.baseSalary + 150_000 } : c)),
    )
    expect(guarded(raised)).toBeGreaterThan(guarded(base))
    const after = routeOf(req, checkOf(req, guarded(raised), target))
    expect(after.outOfPlan).toBe(true)
    expect(after.chain.map(([role, who]) => [role, who])).toEqual([
      ['hrbp', 'E9002'],
      ['leader', 'E2100'],
      ['finance', 'E8001'],
    ])
  })

  it('sweeping the draft New role by start day and FTE flips out of plan only where the shown gap after approval crosses 0', () => {
    const asksCostShown = guarded(base)
    // A target the sweep crosses: room for half the largest in-year band effect.
    const widest = bandEffect(draft('2026-10-01', 1), IN_SE, 'FY27', ctx)
    const sweepTarget = { heads: asksHeads + 1, cost: asksCostShown + widest / 2 }
    const days: ISODate[] = []
    for (let d: ISODate = '2026-10-01'; d <= TARGET_DATE; d = addDays(d, 1)) days.push(d)
    let flipsSeen = 0
    for (let tenths = 1; tenths <= 10; tenths++) {
      const fte = tenths / 10
      let previous: boolean | null = null
      let flips = 0
      for (const day of days) {
        const r = draft(day, fte)
        const check = checkOf(r, asksCostShown, sweepTarget)
        const routed = routeOf(r, check)
        const shownOver = routed.gapAfter.heads < 0 || (routed.gapAfter.cost ?? 0) < 0
        expect(routed.outOfPlan, `${day} at ${fte} FTE`).toBe(shownOver)
        expect(
          routed.chain.some(([role]) => role === 'leader'),
          `${day} at ${fte} FTE`,
        ).toBe(shownOver)
        if (previous !== null && previous !== routed.outOfPlan) flips++
        previous = routed.outOfPlan
      }
      // A later start or a smaller FTE only lowers the band effect: at most one flip a row.
      expect(flips, `${fte} FTE`).toBeLessThanOrEqual(1)
      flipsSeen += flips
    }
    expect(flipsSeen).toBeGreaterThan(0)
  })
})

describe('a seat with no planned start is costed nowhere: band effect = the change approval makes (15.1 R33, D-NOSTART)', () => {
  // A P4 San Jose seat Open after its holder's last day, 15 Aug 2026, with no req and no Backfill.
  const seatRow = positionRow('P-NS', {
    effectiveDate: '2025-04-01',
    level: 'P4',
    managerPositionId: 'P-NS-MGR',
  })
  const positions: PositionRow[] = [
    positionRow('P-NS-MGR', { effectiveDate: '2025-04-01', level: 'M1' }),
    seatRow,
  ]
  const workers: WorkerRow[] = [
    workerRow('E-NS-MGR', 'P-NS-MGR', { hireDate: '2023-01-01' }),
    workerRow('E-NS', 'P-NS', { hireDate: '2024-01-01', terminationDate: '2026-08-15' }),
  ]
  const comp: CompRow[] = [compRow('E-NS-MGR', '2026-04-01', 210_000), compRow('E-NS', '2026-04-01', 182_000)]
  const assumptions = [
    assumption('band', 'P3|San Jose|FY27', 165_000),
    assumption('band', 'P4|San Jose|FY27', 195_000),
    assumption('band', 'P5|San Jose|FY27', 235_000),
    assumption('band', 'P4|Austin|FY27', 176_000),
    assumption('band', 'M1|San Jose|FY27', 225_000),
    assumption('bonusTarget', 'P3', 0.1),
    assumption('bonusTarget', 'P4', 0.1),
    assumption('bonusTarget', 'P5', 0.12),
    assumption('bonusTarget', 'M1', 0.12),
    assumption('bonusFunding', 'FY27', 1),
    assumption('burden', 'United States|social', 0.062),
    assumption('burdenCap', 'United States|social', 176_100),
    assumption('benefits', 'United States', 18_000),
  ]
  const working = fy27Working('daily')
  const lookup = assumptionLookup(assumptions, working)
  // The band estimate Working's lines price a seat at: midpoint × FTE plus loads, plan rate 1 (USD).
  const bandUsd = (seat: SeatType, place: SeatPlace): number | null => {
    const loads = loadsOf(
      seat,
      'FY27',
      { businessUnit: place.businessUnit, department: place.department },
      lookup,
    )
    return loads ? bandEstimate(seat, place.positionId ?? '', loads, 1).usd : null
  }
  const assignments = toAssignments(workers)
  const ctx = asksContext({
    positions,
    assignments,
    reqs: [],
    requests: [],
    proration: 'daily',
    firstOpenMonth: '2026-10',
    bandUsd,
  })
  const plan: WorkingPlan = {
    versionId: 'fy27-working',
    positions,
    assignments,
    newPositionId: (requestId, n) => [requestId, n].join('-'),
    placeOf: () => ({
      businessUnit: 'Go-to-Market',
      department: 'Sales',
      costCenter: '4110-SJC',
      legalEntity: 'Northgate Semiconductor Inc.',
    }),
    actor: { personId: 'E9001', name: 'Go-to-Market HRBP', mode: 'hrbp' },
  }
  const FY27 = monthsOf('FY27')
  /** Working's FY27 loaded cost with these position rows and requests. */
  const workingCost = (rows: readonly PositionRow[], requests: readonly HcRequest[]): number => {
    let usd = 0
    const lines = versionLines(
      working,
      lineContext({
        version: working,
        asOf: '2026-10-05',
        positions: rows,
        workers,
        comp,
        reqs: [],
        requests,
        assumptions,
        rates: { table: [], use: 'plan', closedThrough: null },
      }),
    )
    for (const l of lines) if (FY27.includes(l.month)) usd += l.usd.loaded
    return usd
  }
  const before = workingCost(positions, [])
  const approved = (r: HcRequest) => ({ ...r, state: 'Approved' as const })
  const changeOf = (r: HcRequest): number => {
    const rows = applyApproval(approved(r), plan, '2026-10-05').flatMap((e) =>
      e.kind === 'position' ? [e.change.row] : [],
    )
    expect(rows.length, r.type).toBeGreaterThan(0)
    return workingCost([...positions, ...rows], [approved(r)]) - before
  }
  const pending = (type: HcRequest['type'], over: Partial<HcRequest>): HcRequest =>
    hcRequest(`R-NS-${type.replace(' ', '-')}`, {
      type,
      state: 'Submitted',
      positionId: 'P-NS',
      managerPositionId: 'P-NS-MGR',
      ...over,
    })
  const P4_SJ = bandUsd(
    { level: 'P4', location: 'San Jose', fte: 1 },
    {
      positionId: null,
      managerPositionId: null,
      businessUnit: 'Go-to-Market',
      department: 'Sales',
      costCenter: null,
    },
  ) as number
  const P3_SJ = bandUsd(
    { level: 'P3', location: 'San Jose', fte: 1 },
    {
      positionId: null,
      managerPositionId: null,
      businessUnit: 'Go-to-Market',
      department: 'Sales',
      costCenter: null,
    },
  ) as number

  it('the seat is an approved head with no planned start and no cost from 16 Aug 2026', () => {
    expect(ctx.seatOn('P-NS', '2026-10-01')).toMatchObject({ status: 'Open', start: null })
    expect(asks(() => true, '2027-03-31', [], ctx).seatHeads).toBe(2)
  })

  const cases: [string, HcRequest, number][] = [
    ['Elimination (last day 31 Oct)', pending('Elimination', { startDate: '2026-10-31' }), 0],
    ['Start date (1 Jan 2027)', pending('Start date', { startDate: '2027-01-01' }), (P4_SJ * 3) / 12],
    ['Backfill (starting 1 Dec 2026)', pending('Backfill', { startDate: '2026-12-01' }), (P4_SJ * 4) / 12],
    ['Level change (to P5 from 1 Nov)', pending('Level change', { level: 'P5', startDate: '2026-11-01' }), 0],
    [
      'Location change (to Austin from 1 Nov)',
      pending('Location change', { location: 'Austin', startDate: '2026-11-01' }),
      0,
    ],
    [
      'Trade (gives the seat for 1 P3 San Jose from 1 Jan 2027)',
      pending('Trade', {
        positionId: null,
        level: 'P3',
        location: 'San Jose',
        fte: 1,
        startDate: '2027-01-01',
        trade: {
          givePositionIds: ['P-NS'],
          giveOrgPositionId: 'P-NS-MGR',
          creditUsedBp: 0,
          count: 1,
          jobFamily: 'Sales',
          partTimeRest: false,
          restFte: null,
          rateVersion: null,
          rateHash: null,
          giveBp: null,
          getBp: null,
          creditBp: null,
        },
      }),
      // The give side saves nothing: only the get seat's 3 months cost.
      (P3_SJ * 3) / 12,
    ],
  ]
  for (const [name, r, expected] of cases) {
    it(`${name}: the pending band effect equals the change in Working's in-year lines after approval`, () => {
      const effect = bandEffect(r, () => true, 'FY27', ctx)
      expect(effect).toBeCloseTo(expected, 2)
      expect(effect).toBeCloseTo(changeOf(r), 2)
    })
  }

  it('asks cost moves by the same amount at approval, so the gap does not jump (C18)', () => {
    for (const [name, r] of cases) {
      const pendingCost = asksCost(() => true, 'FY27', [], [r], ctx).pending
      expect(pendingCost, name).toBeCloseTo(changeOf(r), 2)
    }
  })
})
