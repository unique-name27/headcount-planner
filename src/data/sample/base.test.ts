/**
 * The sample base (docs/PLAN.md 13.1 to 13.4): determinism, sizes, referential integrity, status
 * against assignments, the band pins, and the planted rows of stories 1 to 4, 7, 8 and 9 that live in
 * the base data. One generated sample per file (16.0); a second generation checks determinism.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { addDays, daysBetween } from '@/lib/dates'
import { MIN_COSTED } from '@/metrics/rules'
import { lineContext, positionLines, versionLines } from '@/plan/engine/cost'
import { forecast } from '@/plan/engine/forecast'
import { type FreezeOpening, frozenOpenings } from '@/plan/engine/freeze'
import { fxRatesFromAssumptions } from '@/plan/engine/fx'
import { headsOn, isActiveOn, toAssignments } from '@/plan/engine/heads'
import { reconcile } from '@/plan/engine/reconcile'
import { backfillFlag, fromRow } from '@/plan/engine/requests'
import {
  approvedHeadsOn,
  rowOn,
  type SeatHistory,
  seatDetailOn,
  seatHistories,
  toPosition,
} from '@/plan/engine/versions'
import type { PlanLine, Version } from '@/plan/types'
import { monthEnd, monthRange } from '../fiscal'
import { type Datasets, type Month, PENDING_REQUEST_STATES, type PositionRow } from '../schema'
import { bandMidpoint } from './assumptions'
import { asKnownOn, generateSampleBase, type SampleBase } from './index'

const AS_OF = '2026-09-30'
const LOCK = '2026-03-20'
const HISTORY_START = '2025-04-01'
const STORY_UNITS = new Set(['Go-to-Market', 'Silicon Engineering'])
const STORY_SITES = new Set(['Munich', 'Haifa'])
const UNITS = [
  'Silicon Engineering',
  'Systems & Software',
  'Operations',
  'Go-to-Market',
  'Corporate',
  'Executive Office',
]

let base: SampleBase
let data: Datasets
let seats: Map<string, SeatHistory>
let budgetSeats: Map<string, SeatHistory>
let rowsById: Map<string, PositionRow[]>

const histories = (d: Datasets) =>
  seatHistories({
    positions: d.positions,
    assignments: toAssignments(d.workers),
    reqs: d.reqs,
    requests: d.requests.map(fromRow),
  })
const latest = (id: string) => rowOn(rowsById.get(id)!, '9999-12-31')!
const months = (from: string, to: string): string[] => monthRange(from as Month, to as Month)

beforeAll(() => {
  base = generateSampleBase()
  data = base.datasets
  seats = histories(data)
  budgetSeats = histories(asKnownOn(base, LOCK))
  rowsById = new Map()
  for (const r of data.positions) {
    const list = rowsById.get(r.positionId)
    if (list) list.push(r)
    else rowsById.set(r.positionId, [r])
  }
}, 120_000)

describe('determinism', () => {
  it('two runs are deep-equal', () => {
    const again = generateSampleBase()
    const pick = (b: SampleBase) =>
      JSON.stringify({
        datasets: b.datasets,
        personas: b.personas,
        planted: b.planted,
        known: b.known,
        headroom: b.headroom,
        standardHead: b.standardHead,
      })
    expect(pick(again)).toBe(pick(base))
  })
})

describe('sizes (13.1)', () => {
  it('has 1,650 positions: 1,450 Filled, 100 Open, 60 Planned, 15 On hold, 25 Eliminated on 30 Sep 2026', () => {
    expect(seats.size).toBe(1_650)
    const tally: Record<string, number> = {}
    for (const seat of seats.values()) {
      const s = seatDetailOn(seat, AS_OF)!
      tally[s.status] = (tally[s.status] ?? 0) + 1
    }
    expect(tally).toEqual({ Filled: 1_450, Open: 100, Planned: 60, 'On hold': 15, Eliminated: 25 })
    expect(approvedHeadsOn(seats.values(), AS_OF)).toBe(1_610)
  })

  it('has 1,456 actual heads on 30 Sep 2026 (1,450 in seats and 6 not in plan)', () => {
    expect(headsOn(toAssignments(data.workers), AS_OF)).toBe(1_456)
  })

  it('derives 92 cost centers from the positions', () => {
    expect(new Set(data.positions.map((p) => p.costCenter)).size).toBe(92)
    for (const p of data.positions) expect(p.costCenter).toMatch(/^\d{4}-[A-Z]{3}$/)
  })

  it('has the six units at 556, 337, 170, 184, 196 and 7 Filled seats', () => {
    const filled: Record<string, number> = {}
    for (const seat of seats.values()) {
      const s = seatDetailOn(seat, AS_OF)!
      if (s.status === 'Filled') filled[s.position.businessUnit] = (filled[s.position.businessUnit] ?? 0) + 1
    }
    expect(filled).toEqual({
      'Silicon Engineering': 556,
      'Systems & Software': 337,
      Operations: 170,
      'Go-to-Market': 184,
      Corporate: 196,
      'Executive Office': 7,
    })
  })

  it('has 60 contractors and 20 interns with no seat, 20 part-timers and 20 people on leave (4 unpaid)', () => {
    const active = data.workers.filter((w) =>
      isActiveOn({ start: w.assignmentStart ?? w.hireDate, end: w.terminationDate }, AS_OF),
    )
    expect(active.filter((w) => w.workerType === 'Contractor' && !w.positionId)).toHaveLength(60)
    expect(active.filter((w) => w.workerType === 'Intern' && !w.positionId)).toHaveLength(20)
    expect(data.workers.filter((w) => w.workerType !== 'Employee' && w.positionId)).toHaveLength(0)
    const partTime: Record<string, number> = {}
    for (const seat of seats.values()) {
      const s = seatDetailOn(seat, AS_OF)!
      if (s.status === 'Filled' && s.position.fte < 1)
        partTime[s.position.location] = (partTime[s.position.location] ?? 0) + 1
    }
    expect(partTime).toEqual({ Munich: 8, Haifa: 5, Toronto: 4, 'San Jose': 3 })
    for (const seat of seats.values())
      expect([0.5, 0.6, 0.8, 1]).toContain(seatDetailOn(seat, AS_OF)!.position.fte)
    const onLeave = data.workers.filter((w) => w.onLeave)
    expect(onLeave).toHaveLength(20)
    expect(onLeave.filter((w) => w.leavePaid === false)).toHaveLength(4)
    expect(onLeave.filter((w) => w.location === 'Munich' && w.level === 'P6')).toHaveLength(1)
  })

  it('starts every opening by 31 Mar 2027, so every Filled, Open and Planned seat is an approved head', () => {
    for (const seat of seats.values()) {
      const s = seatDetailOn(seat, AS_OF)!
      if (s.status === 'Open' || s.status === 'Planned') {
        if (s.plannedStart) expect(s.plannedStart <= '2027-03-31').toBe(true)
        expect(s.approvedHead).toBe(true)
      }
    }
  })
})

describe('referential integrity', () => {
  it('keeps one row a day per position and never reuses a position after it is eliminated', () => {
    const keys = new Set(data.positions.map((p) => `${p.positionId}|${p.effectiveDate}`))
    expect(keys.size).toBe(data.positions.length)
    for (const [id, list] of rowsById) {
      const sorted = [...list].sort((a, b) => (a.effectiveDate < b.effectiveDate ? -1 : 1))
      const at = sorted.findIndex((r) => r.status === 'Eliminated')
      if (at < 0) continue
      expect(
        sorted.slice(at).every((r) => r.status === 'Eliminated'),
        id,
      ).toBe(true)
      expect(sorted[at].endDate).toBe(addDays(sorted[at].effectiveDate, -1))
      const after = toAssignments(data.workers).filter(
        (a) => a.positionId === id && a.start >= sorted[at].effectiveDate,
      )
      expect(after, id).toHaveLength(0)
    }
  })

  it('numbers positions in creation order and every manager position exists by the row it is named on', () => {
    const first = [...rowsById.entries()].map(
      ([id, list]) =>
        [+id.slice(2), list.reduce((m, r) => (r.effectiveDate < m ? r.effectiveDate : m), '9999')] as const,
    )
    first.sort((a, b) => a[0] - b[0])
    for (let i = 1; i < first.length; i++) expect(first[i][1] >= first[i - 1][1]).toBe(true)
    for (const r of data.positions) {
      if (r.managerPositionId == null) {
        expect(r.level).toBe('E3')
        continue
      }
      const mgr = rowsById.get(r.managerPositionId)
      expect(mgr, r.positionId).toBeDefined()
      expect(rowOn(mgr!, r.effectiveDate), `${r.positionId} ${r.effectiveDate}`).not.toBeNull()
    }
  })

  it('names only positions, people and reqs that exist', () => {
    const people = new Set(data.workers.map((w) => w.employeeId))
    for (const w of data.workers) {
      if (w.positionId) expect(rowsById.has(w.positionId), w.employeeId).toBe(true)
      if (w.managerId) expect(people.has(w.managerId), w.employeeId).toBe(true)
      expect(w.costCenter).toBeTruthy()
    }
    for (const c of data.comp) expect(people.has(c.employeeId)).toBe(true)
    const employees = data.workers.filter((w) => w.workerType === 'Employee').map((w) => w.employeeId)
    const paid = new Set(data.comp.map((c) => c.employeeId))
    for (const e of employees) expect(paid.has(e), e).toBe(true)
    expect(new Set(data.reqs.map((r) => r.reqId)).size).toBe(data.reqs.length)
    for (const r of data.reqs) {
      expect(rowsById.has(r.positionId!)).toBe(true)
      if (r.hiringManagerId) expect(people.has(r.hiringManagerId)).toBe(true)
    }
    const requestIds = new Set(data.requests.map((q) => q.requestId))
    expect(requestIds.size).toBe(data.requests.length)
    for (const q of data.requests) {
      for (const id of [
        q.positionId,
        q.managerPositionId,
        q.fromPositionId,
        q.toPositionId,
        q.toManagerPositionId,
      ])
        if (id) expect(rowsById.has(id), `${q.requestId} ${id}`).toBe(true)
      for (const id of [q.requesterId, q.personId, ...(q.steps ?? []).map((s) => s.approverId)])
        if (id) expect(people.has(id), `${q.requestId} ${id}`).toBe(true)
    }
    for (const p of data.positions)
      if (p.sourceRequestId) expect(requestIds.has(p.sourceRequestId)).toBe(true)
  })

  it('puts every assignment in a position that exists on its start (history opens on 1 Apr 2025)', () => {
    for (const a of toAssignments(data.workers)) {
      if (!a.positionId) continue
      const row = rowOn(rowsById.get(a.positionId)!, a.start > HISTORY_START ? a.start : HISTORY_START)
      expect(row, `${a.employeeId} ${a.positionId}`).not.toBeNull()
    }
  })
})

describe('status against assignments (6.5, 6.10)', () => {
  it('imports Filled on 30 Sep exactly where an Employee is active', () => {
    const active = new Set<string>()
    for (const a of toAssignments(data.workers))
      if (a.workerType === 'Employee' && a.positionId && isActiveOn(a, AS_OF)) active.add(a.positionId)
    for (const [id, list] of rowsById) {
      const row = rowOn(list, AS_OF)!
      expect(row.status === 'Filled', id).toBe(active.has(id))
    }
  })

  it('reconciles to story 7 alone: 6 not in plan and 3 cost-center mismatches', () => {
    const ex = reconcile(data, AS_OF)
    expect(
      ex
        .filter((e) => e.kind === 'not-in-plan')
        .map((e) => e.employeeId)
        .sort(),
    ).toEqual(base.planted.notInPlan)
    expect(
      ex
        .filter((e) => e.kind === 'cost-center-mismatch')
        .map((e) => e.employeeId)
        .sort(),
    ).toEqual(base.planted.costCenterMismatches)
    expect(ex).toHaveLength(9)
    for (const id of [...base.planted.notInPlan, ...base.planted.costCenterMismatches]) {
      const w = data.workers.find(
        (x) =>
          x.employeeId === id &&
          isActiveOn(
            { start: x.assignmentStart ?? x.hireDate, end: x.assignmentEnd ?? x.terminationDate },
            AS_OF,
          ),
      )!
      expect(STORY_UNITS.has(w.businessUnit!)).toBe(false)
      expect(STORY_SITES.has(w.location!)).toBe(false)
      if (w.positionId) {
        const seat = rowOn(rowsById.get(w.positionId)!, AS_OF)!
        expect(STORY_SITES.has(seat.location)).toBe(false)
      }
    }
  })
})

describe('assumptions (13.2)', () => {
  const band = (key: string, version: string) =>
    data.assumptions.find((r) => r.version === version && r.table === 'band' && r.key === key && !r.org)
      ?.value
  it('pins P4 Munich FY27 at €110,000, P3 Bengaluru at ₹3,580,000 and P5 San Jose at $235,000 in every version', () => {
    for (const v of ['fy27-budget', 'fy27-q1-reforecast', 'fy27-working', 'fy28-working']) {
      expect(band('P4|Munich|FY27', v)).toBe(110_000)
      expect(band('P3|Bengaluru|FY27', v)).toBe(3_580_000)
      expect(band('P5|San Jose|FY27', v)).toBe(235_000)
    }
    expect(bandMidpoint('P4', 'Munich', 'FY28')).toBe(113_000)
  })

  it('reproduces fixture C1 on the planted Munich P4 in the Q1 Reforecast', () => {
    const p4 = base.planted.munichP4.positionId
    const view = asKnownOn(base, '2026-07-15')
    const rows = view.assumptions.filter((r) => r.version === 'fy27-q1-reforecast')
    const version: Version = {
      versionId: 'fy27-q1-reforecast',
      name: 'FY27 Q1 Reforecast',
      kind: 'reforecast',
      fiscalYear: 'FY27',
      grid: { from: '2026-04', to: '2027-03' },
      proration: 'daily',
      state: 'locked',
      createdAt: '2026-07-06T09:00',
      lockedAt: '2026-07-15T17:00',
      lockedBy: null,
      engineVersion: 'test',
      parentId: null,
      hash: null,
    }
    const ctx = lineContext({
      version,
      asOf: '2026-07-15',
      positions: view.positions,
      workers: view.workers,
      comp: view.comp,
      reqs: view.reqs,
      requests: view.requests.map(fromRow),
      assumptions: rows,
      rates: { table: fxRatesFromAssumptions(rows), use: 'plan', closedThrough: null },
    })
    const lines = positionLines(toPosition(view.positions.find((r) => r.positionId === p4)!), version, ctx)
    const sep = lines.filter((l) => l.month === '2026-09')
    expect(sep.reduce((a, l) => a + l.usd.loaded, 0)).toBeCloseTo(6_301.17, 2)
    const local = lines.reduce(
      (a, l) => a + l.local.base + l.local.bonus + l.local.burden + l.local.benefits,
      0,
    )
    expect(local).toBeCloseTo(75_847.42, 2)
    expect(lines.reduce((a, l) => a + l.usd.loaded, 0)).toBeCloseTo(81_915.21, 2)
    // Not in the Budget (approved after the lock), Planned and with no req or hire at 30 Sep.
    expect(budgetSeats.has(p4)).toBe(false)
    expect(seatDetailOn(seats.get(p4)!, AS_OF)!.status).toBe('Planned')
    expect(data.reqs.some((r) => r.positionId === p4)).toBe(false)
    expect(rowsById.get(p4)).toEqual([
      expect.objectContaining({
        effectiveDate: '2026-06-10',
        status: 'Planned',
        level: 'P4',
        location: 'Munich',
        startDate: '2026-09-16',
      }),
    ])
  })

  it('stores a standard head per version from bands only', () => {
    const s = (v: string) =>
      data.assumptions.find((r) => r.version === v && r.table === 'trade' && r.key === 'standardHeadUsd')
        ?.value
    expect(s('fy27-budget')).toBe(base.standardHead.FY27)
    expect(s('fy27-q1-reforecast')).toBe(base.standardHead.FY27)
    expect(s('fy27-working')).toBe(base.standardHead.FY27)
    expect(s('fy28-working')).toBe(base.standardHead.FY28)
    expect(base.standardHead.FY27 % 1_000).toBe(0)
  })
})

describe('story orgs match the Budget seat by seat (stories 1, 2 and 5)', () => {
  it('differs from the Budget only by the 8 early starts and the 10 late Bengaluru seats', () => {
    const actual = new Set<string>()
    for (const a of toAssignments(data.workers))
      if (a.workerType === 'Employee' && a.positionId && isActiveOn(a, AS_OF)) actual.add(a.positionId)
    const plus: string[] = []
    const minus: string[] = []
    for (const [id, seat] of seats) {
      const pos = seatDetailOn(seat, AS_OF)!.position
      if (!STORY_UNITS.has(pos.businessUnit) && !STORY_SITES.has(pos.location)) continue
      const b = budgetSeats.get(id)
      const plan = b ? seatDetailOn(b, AS_OF)?.planHead === true : false
      if (actual.has(id) && !plan) plus.push(id)
      if (!actual.has(id) && plan) minus.push(id)
    }
    expect(plus.sort()).toEqual(base.planted.earlyStarts)
    expect(minus.sort()).toEqual(base.planted.lateBengaluru)
    expect(plus).toHaveLength(8)
    for (const id of plus) {
      expect(latest(id).businessUnit).toBe('Go-to-Market')
      expect(STORY_SITES.has(latest(id).location)).toBe(false)
    }
    const cc = minus.map((id) => latest(id).costCenter).sort()
    expect(cc).toEqual([
      ...Array(5).fill('1130-BLR'),
      ...Array(3).fill('1140-BLR'),
      ...Array(2).fill('1160-BLR'),
    ])
    for (const id of minus) {
      const s = seatDetailOn(seats.get(id)!, AS_OF)!
      expect(s.status).toBe('Open')
      expect(s.plannedStart! < AS_OF).toBe(true)
    }
  })

  it('keeps every Munich and Haifa cost center at 5 or more costed people in every month of the FY27 grid', () => {
    const assignments = toAssignments(data.workers).filter((a) => a.workerType === 'Employee')
    for (const cc of new Set(
      data.positions.filter((p) => STORY_SITES.has(p.location)).map((p) => p.costCenter),
    )) {
      for (const m of months('2026-04', '2027-09')) {
        const from = `${m}-01`
        const to = monthEnd(m)
        const people = new Set<string>()
        for (const a of assignments) {
          if (!a.positionId || a.start > to || (a.end != null && a.end < from)) continue
          if (rowOn(rowsById.get(a.positionId)!, a.end != null && a.end < to ? a.end : to)?.costCenter === cc)
            people.add(a.employeeId)
        }
        for (const r of data.reqs)
          if (
            r.stage === 'Offer accepted' &&
            r.startDate &&
            r.startDate <= to &&
            latest(r.positionId!).costCenter === cc
          )
            people.add(r.reqId)
        expect(people.size, `${cc} ${m}`).toBeGreaterThanOrEqual(5)
      }
    }
  })

  it('plants 6 Hsinchu offers in Silicon Engineering 25 to 30% above midpoint with sign-on, relocation and agency fees', () => {
    expect(base.planted.hsinchuOffers).toHaveLength(6)
    for (const { positionId, reqId } of base.planted.hsinchuOffers) {
      const r = data.reqs.find((x) => x.reqId === reqId)!
      const pos = latest(positionId)
      expect(pos.businessUnit).toBe('Silicon Engineering')
      expect(pos.location).toBe('Hsinchu')
      expect(r.stage).toBe('Offer accepted')
      expect(r.startDate! > AS_OF).toBe(true)
      const ratio = r.offerBase! / bandMidpoint(pos.level, 'Hsinchu', 'FY27')
      expect(ratio).toBeGreaterThanOrEqual(1.25)
      expect(ratio).toBeLessThanOrEqual(1.3)
      expect(r.signOnBonus).toBeGreaterThan(0)
      expect(r.relocation).toBeGreaterThan(0)
      expect(r.agencyFee).toBeGreaterThan(0)
      expect(r.offerCurrency).toBe('TWD')
    }
  })
})

describe('cost directions the stories need (wave 2 asserts the values)', () => {
  it('puts Silicon Engineering, Go-to-Market, Munich and Haifa over the Budget and Systems & Software under its target', () => {
    const rows = data.assumptions.filter((r) => r.version === 'fy27-working')
    const fy27 = { from: '2026-04' as const, to: '2027-03' as const }
    const working = {
      versionId: 'fy27-working',
      name: 'FY27 Working',
      fiscalYear: 'FY27' as const,
      grid: fy27,
      proration: 'daily' as const,
    }
    const f = forecast({
      version: working,
      asOf: AS_OF,
      closes: [],
      positions: data.positions,
      workers: data.workers,
      comp: data.comp,
      reqs: data.reqs,
      requests: data.requests.map(fromRow),
      freezes: data.freezes,
      assumptions: rows,
      rates: fxRatesFromAssumptions(rows),
      inTree: () => false,
      minCosted: Number(MIN_COSTED.default),
    })
    const view = asKnownOn(base, LOCK)
    const brows = view.assumptions.filter((r) => r.version === 'fy27-budget')
    const budget: Version = {
      ...working,
      versionId: 'fy27-budget',
      name: 'FY27 Budget',
      kind: 'budget',
      state: 'locked',
      createdAt: '2026-02-02T09:00',
      lockedAt: '2026-03-20T17:00',
      lockedBy: null,
      engineVersion: 'test',
      parentId: null,
      hash: null,
    }
    const bctx = lineContext({
      version: budget,
      asOf: LOCK,
      positions: view.positions,
      workers: view.workers,
      comp: view.comp,
      reqs: view.reqs,
      requests: view.requests.map(fromRow),
      assumptions: brows,
      rates: { table: fxRatesFromAssumptions(brows), use: 'plan', closedThrough: null },
    })
    const wctx = lineContext({
      version: { ...budget, versionId: 'fy27-working', name: 'FY27 Working' },
      asOf: AS_OF,
      positions: data.positions,
      workers: data.workers,
      comp: data.comp,
      reqs: data.reqs,
      requests: data.requests.map(fromRow),
      assumptions: rows,
      rates: { table: fxRatesFromAssumptions(rows), use: 'plan', closedThrough: null },
    })
    const sum = (lines: readonly PlanLine[], key: (l: PlanLine) => string, ytd = false) => {
      const out = new Map<string, number>()
      for (const l of lines) {
        if (ytd && l.month > '2026-09') continue
        const k = key(l)
        out.set(k, (out.get(k) ?? 0) + l.usd.loaded)
      }
      return out
    }
    const unit = (l: PlanLine) =>
      l.positionId
        ? latest(l.positionId).businessUnit
        : (l as PlanLine & { cohort: { businessUnit: string } }).cohort.businessUnit
    const site = (l: PlanLine) => (l.positionId ? latest(l.positionId).location : '')
    const b = versionLines(budget, bctx)
    const fu = sum(f.lines, unit)
    const bu = sum(b, unit)
    expect(fu.get('Silicon Engineering')! - bu.get('Silicon Engineering')!).toBeGreaterThan(0)
    expect(fu.get('Go-to-Market')! - bu.get('Go-to-Market')!).toBeGreaterThan(0)
    expect(
      sum(f.lines, unit, true).get('Go-to-Market')! - sum(b, unit, true).get('Go-to-Market')!,
    ).toBeGreaterThan(0)
    const fs = sum(f.lines, site)
    const bs = sum(b, site)
    for (const s of ['Munich', 'Haifa']) expect(fs.get(s)! - bs.get(s)!, s).toBeGreaterThan(0)
    const ss = data.targets.find((t) => t.fiscalYear === 'FY27' && t.businessUnit === 'Systems & Software')!
    expect(
      ss.targetCost! - sum(versionLines(wctx.version as Version, wctx), unit).get('Systems & Software')!,
    ).toBeGreaterThan(0)
    // The FY27 target cost is the Budget's FY27 loaded cost to the cent.
    for (const t of data.targets.filter((x) => x.fiscalYear === 'FY27'))
      expect(t.targetCost).toBeCloseTo(bu.get(t.businessUnit) ?? 0, 2)
  })
})

describe('story 3: Systems & Software backfills of new positions', () => {
  it('flags exactly 4 Backfill requests as naming a new position, all in Systems & Software', () => {
    const assignments = toAssignments(data.workers)
    const exits = new Map<string, string[]>()
    for (const a of assignments)
      if (a.positionId && a.end) exits.set(a.positionId, [...(exits.get(a.positionId) ?? []), a.end])
    const ctx = {
      createdOn: (id: string) =>
        rowsById.get(id)!.reduce((m, r) => (r.effectiveDate < m ? r.effectiveDate : m), '9999'),
      exitsOf: (id: string) => exits.get(id) ?? [],
      orgExits: (id: string) => {
        const dept = latest(id).department
        const out: string[] = []
        for (const [seat, list] of exits) if (latest(seat).department === dept) out.push(...list)
        return out
      },
      windowDays: 30,
    }
    const flagged: Record<string, string[]> = {}
    for (const row of data.requests) {
      const flag = backfillFlag(fromRow(row), ctx)
      if (flag === 'backfill-new-position')
        flagged[row.businessUnit] = [...(flagged[row.businessUnit] ?? []), row.requestId]
      if (flag === 'backfill-no-exit') throw new Error(`${row.requestId} names a seat with no exit`)
    }
    expect(Object.keys(flagged)).toEqual(['Systems & Software'])
    expect(flagged['Systems & Software'].sort()).toEqual(base.planted.story3.backfillRequestIds)
    expect(flagged['Systems & Software']).toHaveLength(4)
    for (const id of base.planted.story3.backfillRequestIds)
      expect(PENDING_REQUEST_STATES).toContain(data.requests.find((q) => q.requestId === id)!.state)
    // Each new seat sits under the manager of a seat left by an exit within 30 days of its creation.
    base.planted.story3.newPositionIds.forEach((id) => {
      const created = ctx.createdOn(id)
      const near = base.planted.story3.exitPositionIds.some(
        (x) =>
          latest(x).managerPositionId === latest(id).managerPositionId &&
          ctx.exitsOf(x).some((e) => Math.abs(daysBetween(e, created)) <= 30),
      )
      expect(near, id).toBe(true)
    })
  })
})

describe('story 4: the Corporate freeze', () => {
  it('freezes Corporate from 1 Aug 2026 with no backfills', () => {
    expect(data.freezes).toEqual([
      expect.objectContaining({
        businessUnit: 'Corporate',
        startDate: '2026-08-01',
        endDate: null,
        allowBackfill: false,
      }),
    ])
  })

  it('holds exactly 3 Interviewing openings and honors 1 accepted offer with a sign-on bonus and an agency fee', () => {
    const openings: FreezeOpening[] = []
    let corporate = 0
    for (const seat of seats.values()) {
      const s = seatDetailOn(seat, AS_OF)!
      if (s.status !== 'Open' && s.status !== 'Planned') continue
      if (s.position.businessUnit === 'Corporate') corporate++
      openings.push({
        positionId: s.positionId,
        status: s.status,
        place: {
          positionId: s.positionId,
          managerPositionId: s.position.managerPositionId,
          businessUnit: s.position.businessUnit,
          department: s.position.department,
          costCenter: s.position.costCenter,
        },
        seat: { level: s.position.level, location: s.position.location, fte: s.position.fte },
        unfrozenStart: s.plannedStart ?? AS_OF,
        acceptedOffer: s.acceptedOffer != null,
        backfill: seat.assignments.length > 0,
      })
    }
    expect(corporate).toBe(4)
    const held = frozenOpenings(openings, data.freezes, AS_OF, () => false)
    expect(held.map((h) => h.positionId).sort()).toEqual(base.planted.corporateInterviewing)
    expect(held).toHaveLength(3)
    const cc = held.map((h) => latest(h.positionId).costCenter.slice(0, 4)).sort()
    expect(cc).toEqual(['1540', '1540', '1550'])
    for (const h of held) {
      const reqs = data.reqs.filter((r) => r.positionId === h.positionId && r.status === 'Open')
      expect(reqs.map((r) => r.stage)).toEqual(['Interviewing'])
    }
    const offer = data.reqs.find((r) => r.reqId === base.planted.corporateOffer.reqId)!
    expect(offer.stage).toBe('Offer accepted')
    expect(offer.offerAcceptedDate! < '2026-08-01').toBe(true)
    expect(offer.startDate! > AS_OF).toBe(true)
    expect(offer.signOnBonus).toBeGreaterThan(0)
    expect(offer.agencyFee).toBeGreaterThan(0)
  })

  it('has no other Corporate opening and no Corporate exit from 1 Aug 2026', () => {
    const planted = new Set([...base.planted.corporateInterviewing, base.planted.corporateOffer.positionId])
    for (const [id, seat] of seats) {
      if (seatDetailOn(seat, AS_OF)!.position.businessUnit !== 'Corporate') continue
      for (const m of months('2026-08', '2027-09')) {
        const s = seatDetailOn(seat, monthEnd(m))!
        if (planted.has(id)) continue
        expect(['Filled', 'Eliminated'], `${id} ${m}`).toContain(s.status)
      }
    }
    for (const w of data.workers)
      if (w.businessUnit === 'Corporate' && w.workerType === 'Employee' && w.terminationDate)
        expect(w.terminationDate < '2026-08-01', w.employeeId).toBe(true)
  })
})

describe('story 8: 1550-HSZ', () => {
  it('holds the same 3 costed people in every month of the FY27 grid and no opening', () => {
    const ids = [...rowsById.keys()].filter((id) =>
      rowsById.get(id)!.some((r) => r.costCenter === '1550-HSZ'),
    )
    expect(ids).toHaveLength(3)
    const assignments = toAssignments(data.workers).filter((a) => a.positionId && ids.includes(a.positionId))
    const people = new Set(assignments.map((a) => a.employeeId))
    expect(people.size).toBe(3)
    for (const m of months('2026-04', '2027-09'))
      for (const id of ids) {
        const s = seatDetailOn(seats.get(id)!, monthEnd(m))!
        expect(s.status).toBe('Filled')
        expect(s.holderIds).toHaveLength(1)
      }
    expect(data.reqs.some((r) => ids.includes(r.positionId!))).toBe(false)
    expect(data.workers.filter((w) => w.costCenter === '1550-HSZ')).toHaveLength(3)
  })
})

describe('story 9 and story 6: the headroom and the targets', () => {
  const approvedByUnit = (map: Map<string, SeatHistory>, on: string, unit: string) =>
    approvedHeadsOn(
      [...map.values()].filter((s) => {
        const d = seatDetailOn(s, on)
        return d != null && d.position.businessUnit === unit
      }),
      on,
    )

  it('sets FY27 targets at the Budget heads and FY28 at Working plus growth (Silicon Engineering + 40)', () => {
    for (const unit of UNITS) {
      const t27 = data.targets.find((t) => t.fiscalYear === 'FY27' && t.businessUnit === unit)!
      expect(t27.targetHeads).toBe(approvedByUnit(budgetSeats, '2027-03-31', unit))
      expect(t27.targetCost).toBeGreaterThan(0)
    }
    const se27 = approvedByUnit(seats, '2027-03-31', 'Silicon Engineering')
    expect(approvedByUnit(seats, '2028-03-31', 'Silicon Engineering')).toBe(se27)
    const se28 = data.targets.find(
      (t) => t.fiscalYear === 'FY28' && t.businessUnit === 'Silicon Engineering',
    )!
    expect(se28.targetHeads).toBe(se27 + 40)
    // No Silicon Engineering request is pending (story 6 adds its cycle asks).
    expect(
      data.requests.filter(
        (q) => q.businessUnit === 'Silicon Engineering' && PENDING_REQUEST_STATES.includes(q.state),
      ),
    ).toHaveLength(0)
  })

  it("puts Systems & Software's FY27 asks at 31 Mar 2027 exactly 8 heads under its target", () => {
    const target = data.targets.find(
      (t) => t.fiscalYear === 'FY27' && t.businessUnit === 'Systems & Software',
    )!
    // Its pending requests move no heads: Backfills on seats that are not On hold, a Location change,
    // and an internal move into an Open seat.
    const pending = data.requests.filter(
      (q) =>
        PENDING_REQUEST_STATES.includes(q.state) &&
        (q.businessUnit === 'Systems & Software' ||
          (q.toPositionId && latest(q.toPositionId).businessUnit === 'Systems & Software')),
    )
    for (const q of pending) {
      if (q.type === 'Backfill')
        expect(seatDetailOn(seats.get(q.positionId!)!, '2027-03-31')!.status).not.toBe('On hold')
      else if (q.type === 'Transfer') {
        expect(q.transferKind).toBe('Internal move')
        expect(latest(q.fromPositionId!).businessUnit).not.toBe('Systems & Software')
      } else expect(['Location change', 'Level change']).toContain(q.type)
    }
    expect(approvedByUnit(seats, '2027-03-31', 'Systems & Software')).toBe(target.targetHeads - 8)
    expect(base.planted.headroom).toHaveLength(base.headroom)
    for (const id of base.planted.headroom) {
      const rows = rowsById.get(id)!
      const elim = rows.find((r) => r.status === 'Eliminated')!
      expect(elim.effectiveDate < '2026-07-15').toBe(true)
      expect(elim.effectiveDate > LOCK).toBe(true)
      const planned = rows.find((r) => r.status === 'Planned')!
      expect(planned.startDate! > '2026-10-31').toBe(true)
      expect(planned.effectiveDate <= LOCK).toBe(true)
      expect(STORY_SITES.has(planned.location)).toBe(false)
    }
    const give = seatDetailOn(seats.get(base.planted.tradeGive)!, AS_OF)!
    expect(give.status).toBe('Planned')
    expect([give.position.level, give.position.location, give.position.businessUnit]).toEqual([
      'P5',
      'San Jose',
      'Systems & Software',
    ])
  })
})

describe('personas (13.3)', () => {
  it('names one persona per mode, plus the CFO, a Design Verification director and Managers B and C', () => {
    expect(base.personas.map((p) => p.key)).toEqual([
      'hr-admin',
      'hrbp-se',
      'leader-svp-se',
      'leader-cfo',
      'leader-dv-director',
      'finance-fpa',
      'manager-a',
      'manager-b',
      'manager-c',
    ])
    expect(new Set(base.personas.map((p) => p.mode))).toEqual(
      new Set(['hr-admin', 'hrbp', 'leader', 'finance', 'manager']),
    )
    for (const p of base.personas) {
      expect(seatDetailOn(seats.get(p.positionId)!, AS_OF)!.holderIds).toEqual([p.employeeId])
      for (const text of [p.label, p.why]) {
        expect(text.includes('!') || text.includes(String.fromCharCode(0x2014))).toBe(false)
        expect(text.toLowerCase()).not.toContain('cen' + 'sus')
      }
    }
    const svp = base.personas.find((p) => p.key === 'leader-svp-se')!
    expect(rowOn(rowsById.get(svp.positionId)!, AS_OF)!.level).toBe('E2')
  })

  const reports = (positionId: string) =>
    [...seats.values()]
      .map((s) => seatDetailOn(s, AS_OF)!)
      .filter((s) => s.position.managerPositionId === positionId)
      .map((s) => s.status)
      .sort()

  it('gives Manager A 7 Filled reports, an Open seat, the Munich P4 and a pending New role', () => {
    const a = base.personas.find((p) => p.key === 'manager-a')!
    expect(reports(a.positionId)).toEqual([...Array(7).fill('Filled'), 'Open', 'Planned'])
    const open = seatDetailOn(seats.get(base.planted.managerAOpen)!, AS_OF)!
    expect(open.plannedStart! > AS_OF).toBe(true)
    expect(latest(base.planted.munichP4.positionId).managerPositionId).toBe(a.positionId)
    const q = data.requests.find((r) => r.requestId === base.planted.managerANewRole)!
    expect([q.type, q.state, q.requesterId, q.managerPositionId]).toEqual([
      'New role',
      'Submitted',
      a.employeeId,
      a.positionId,
    ])
  })

  it('gives Manager B 3 Filled and 2 Open seats, one with an accepted offer and one person on leave', () => {
    const b = base.personas.find((p) => p.key === 'manager-b')!
    expect(reports(b.positionId)).toEqual(['Filled', 'Filled', 'Filled', 'Open', 'Open'])
    const offers = base.planted.managerBOpen.flatMap((id) =>
      data.reqs.filter((r) => r.positionId === id && r.stage === 'Offer accepted'),
    )
    expect(offers).toHaveLength(1)
    expect(offers[0].startDate! > AS_OF).toBe(true)
    const team = data.positions.filter((p) => p.managerPositionId === b.positionId).map((p) => p.positionId)
    const onLeave = data.workers.filter((w) => w.onLeave && team.includes(w.positionId!))
    expect(onLeave.map((w) => w.leavePaid)).toEqual([true])
  })

  it("puts Manager C's own seat in a confidential Elimination, In review at the HRBP step, effective 31 Dec 2026", () => {
    const c = base.personas.find((p) => p.key === 'manager-c')!
    const q = data.requests.find((r) => r.requestId === base.planted.managerCElimination)!
    expect([q.type, q.state, q.positionId, q.confidential, q.startDate]).toEqual([
      'Elimination',
      'In review',
      c.positionId,
      true,
      '2026-12-31',
    ])
    const managerOfC = rowOn(rowsById.get(c.positionId)!, AS_OF)!.managerPositionId!
    expect(seatDetailOn(seats.get(managerOfC)!, AS_OF)!.holderIds).toEqual([q.requesterId])
    expect(q.steps![0]).toMatchObject({ role: 'HRBP', decision: 'Pending' })
    expect(q.steps!.some((s) => s.approverId === c.employeeId)).toBe(false)
  })
})

describe('dates in order', () => {
  const inOrder = (row: Record<string, unknown>, fields: string[]) => {
    let prev = ''
    for (const f of fields) {
      const v = row[f]
      if (typeof v !== 'string') continue
      if (prev && v < prev) return false
      prev = v
    }
    return true
  }
  it('never dates a later step before an earlier one', () => {
    for (const w of data.workers) {
      expect(inOrder({ ...w }, ['hireDate', 'assignmentStart', 'assignmentEnd']), w.employeeId).toBe(true)
      expect(inOrder({ ...w }, ['hireDate', 'terminationDate']), w.employeeId).toBe(true)
    }
    for (const r of data.reqs) {
      expect(inOrder({ ...r }, ['openedDate', 'offerAcceptedDate', 'startDate']), r.reqId).toBe(true)
      expect(inOrder({ ...r }, ['openedDate', 'closedDate']), r.reqId).toBe(true)
    }
    for (const q of data.requests)
      expect(inOrder({ ...q }, ['submittedAt', 'updatedAt']), q.requestId).toBe(true)
    const hired = new Map(data.workers.map((w) => [w.employeeId, w.hireDate]))
    for (const c of data.comp) expect(c.effectiveDate >= hired.get(c.employeeId)!, c.employeeId).toBe(true)
  })
})

describe('as known on a date', () => {
  it('is the datasets themselves on 30 Sep 2026', () => {
    expect(asKnownOn(base, AS_OF)).toEqual(data)
  })

  it('shows the Budget the seats, people and pay it knew on 20 Mar 2026', () => {
    const view = asKnownOn(base, LOCK)
    for (const w of view.workers) {
      expect((w.assignmentStart ?? w.hireDate) <= LOCK).toBe(true)
      expect(w.onLeave ?? null).toBeNull()
    }
    for (const c of view.comp) expect(c.effectiveDate <= LOCK).toBe(true)
    for (const r of view.reqs) expect(r.openedDate <= LOCK).toBe(true)
    expect(view.targets.every((t) => t.fiscalYear === 'FY27')).toBe(true)
    expect(view.freezes).toHaveLength(0)
    expect(view.assumptions.some((r) => r.version === 'fy28-working')).toBe(false)
    expect(view.assumptions.some((r) => r.table === 'fx' && r.key.includes('|actual|'))).toBe(false)
    // 13.1 (a): a story-org exit with a last day from the lock to 29 Sep was not known to the Budget.
    let unseen = 0
    for (const w of data.workers) {
      const story = STORY_UNITS.has(w.businessUnit!) || STORY_SITES.has(w.location!)
      if (!story || w.workerType !== 'Employee' || !w.terminationDate) continue
      if (w.terminationDate < LOCK || w.terminationDate > '2026-09-29') continue
      const seen = view.workers.find((x) => x.employeeId === w.employeeId && x.positionId === w.positionId)!
      expect(seen.terminationDate ?? null, w.employeeId).toBeNull()
      unseen++
    }
    expect(unseen).toBeGreaterThan(0)
  })
})
