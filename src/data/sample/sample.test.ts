/**
 * The sample's nine stories with exact asserts (docs/PLAN.md 13.4, 16.1 "a smoke test finds all 8
 * stories plus story 9"), the versions, closes, cycle and plan state generate.ts adds, the
 * per-position differences of stories 1, 2 and 5, determinism, the README's hand calculations, and
 * Plan > Hiring (9.7, C36 and C37) recomputed from raw rows by code of its own for the HRBP's unit, the
 * leader's org, the company and Manager A's team, against the tab, the engine, Openings, Overview,
 * the forecast, the closes and My team; and Plan > Recruiting summary (9.8, C38) from that code and
 * the forecast run, against the tab, Plan > Hiring and the forecast's own heads.
 * One generated sample per file (16.0). base.test.ts covers the base datasets; raw/stories.test.ts
 * runs the same stories on the messy data.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { RECRUITING_KPI_IDS } from '@/access/ids'
import { PLANNED_STORIES, storyChecks } from '@/app/status'
import type { AnalyticsContext } from '@/data/context'
import { resolveDrill } from '@/drill/types'
import { fmt as formatAs } from '@/lib/format'
import { MIN_COSTED } from '@/metrics/rules'
import { bridge, bridgeSeats } from '@/plan/engine/bridge'
import { chainFor, type PlanCheck } from '@/plan/engine/chain'
import { actualLines, adjustmentsFor, verifyClose } from '@/plan/engine/close'
import { isAllowanceLine } from '@/plan/engine/cost'
import { isCohortLine } from '@/plan/engine/forecast'
import { fxEffect, fxRatesFromAssumptions } from '@/plan/engine/fx'
import { headsOn, toAssignments } from '@/plan/engine/heads'
import { hiringOf } from '@/plan/engine/hiring'
import { actualLineRows, planLineRows } from '@/plan/engine/lineTable'
import { fromRow } from '@/plan/engine/requests'
import { asks, bandEffect, headEffect } from '@/plan/engine/targets'
import { budgetOf, isLocked, lockHash, planOfRecord, verifyLock, workingOf } from '@/plan/engine/versions'
import type { LockedVersion, PlanLine } from '@/plan/types'
import { personaCtx, personaOf } from '@/testkit/sample'
import { prepare as prepareForecast } from '@/views/forecast/engine/base'
import { forecastFlows, forecastHeads } from '@/views/forecast/engine/heads'
import { planModel } from '@/views/plan/engine'
import { prepare as preparePlan } from '@/views/plan/engine/base'
import { hiringForecast } from '@/views/plan/engine/hiringData'
import { behindByText, hiringInputOf, planHiringModel, QUARTER_KEYS } from '@/views/plan/engine/hiringTab'
import { openingsOf } from '@/views/plan/engine/openings'
import {
  FUTURE_STARTS_NOTE,
  PROJECTED_STARTS_NOTE,
  planRecruitingModel,
} from '@/views/plan/engine/recruitingTab'
import { teamModel } from '@/views/team/engine'
import { monthEnd, monthsOf } from '../fiscal'
import {
  type Datasets,
  type ISODate,
  type Month,
  PENDING_REQUEST_STATES,
  type PositionRow,
  type ReqRow,
  siteByLocation,
  type WorkerRow,
} from '../schema'
import { FY27_BUDGET, FY27_Q1_REFORECAST, FY27_WORKING, VACANCY_FACTOR } from './assumptions'
import { asKnownOn, assumptionsOf } from './base'
import { day } from './calendar'
import { CLOSE_MONTHS, closeInput } from './closes'
import { FY28_CYCLE_ID, SE_ASK_HEADS, SE_NOT_SUBMITTED } from './cycle'
import { SE as SILICON, UNITS } from './departments'
import { generateSample, type Sample, sampleBaselineId } from './generate'
import { chainOrgOf, guardedAsksCost, ratesOf, unitOrg, unitPeople, workingAsksContext } from './routing'
import { computeStories, type Stories, type StoryModel, storiesOneToEight, storyModel } from './stories'
import { TRADE_GET_START, unitWorkingLines } from './trades'
import { planLinesOf, versionFrame } from './versions'

const AS_OF = '2026-09-30'
const FY27 = monthsOf('FY27')
const STORY_UNITS = ['Go-to-Market', 'Silicon Engineering']
const STORY_SITES = ['Munich', 'Haifa']

let sample: Sample
let data: Datasets
let model: StoryModel
let st: Stories
/** Each cost center's latest position row (its unit, site and currency). */
let centerRow: Map<string, PositionRow>

beforeAll(() => {
  sample = generateSample()
  data = sample.datasets
  model = storyModel(sample)
  st = computeStories(model)
  centerRow = new Map([...model.latest.values()].map((r) => [r.costCenter, r]))
}, 120_000)

/** Cents, so amounts compare exactly. */
const cents = (x: number) => Math.round(x * 100)

/* ───────────────────────── Finance's cost-center fold (docs/PLAN.md 7.2 rule 2, 7.4) ───────────────────────── */

const MIN_COSTED_PEOPLE = Number(MIN_COSTED.default)
/** Every FY27 version's grid (asserted in 'versions' below). */
const GRID = monthsBetween('2026-04', '2027-09')

/**
 * The totals rule's fold, ported verbatim: groups under the minimum go to Other; while Other is still
 * under it and the total is shown, the smallest shown group joins (ties to the first in order).
 */
function foldGroups<T>(
  groups: readonly T[],
  size: (g: T) => number,
  minGroup: number,
  totalShown: boolean,
): { shown: T[]; folded: T[] } {
  const shown = groups.filter((g) => size(g) >= minGroup)
  const folded = groups.filter((g) => size(g) < minGroup)
  if (!folded.length) return { shown, folded }
  let otherSize = folded.reduce((s, g) => s + size(g), 0)
  while (totalShown && otherSize < minGroup && shown.length) {
    let i = 0
    for (let j = 1; j < shown.length; j++) if (size(shown[j]) < size(shown[i])) i = j
    const [g] = shown.splice(i, 1)
    folded.push(g)
    otherSize += size(g)
  }
  return { shown, folded }
}

interface Center {
  costCenter: string
  currency: string
  /** The fewest costed people in any month of the grid (7.2 rule 1). */
  size: number
}

/**
 * Finance's one fold of a unit's cost centers (7.4), given in cost-center order: `foldGroups` with the
 * unit total shown, then, while a currency's share of Other has 1 to 4 costed people, the smallest
 * shown cost center in that currency joins it (ties to the first in order). A currency with no shown
 * cost center keeps its share (15.3.8).
 */
function financeFold(centers: readonly Center[], min: number): { shown: Center[]; other: Center[] } {
  const { shown, folded } = foldGroups(centers, (c) => c.size, min, true)
  for (;;) {
    const share = new Map<string, number>()
    for (const c of folded) share.set(c.currency, (share.get(c.currency) ?? 0) + c.size)
    const short = [...share].find(([cur, n]) => n > 0 && n < min && shown.some((c) => c.currency === cur))
    if (!short) break
    let i = -1
    for (let j = 0; j < shown.length; j++)
      if (shown[j].currency === short[0] && (i < 0 || shown[j].size < shown[i].size)) i = j
    folded.push(...shown.splice(i, 1))
  }
  return { shown, other: folded }
}

/**
 * Each unit's cost centers in a version's lines, in cost-center order, each sized by its fewest
 * costed people in any month of the grid: holders of its 'hris' lines and accepted offers of its
 * 'offer' lines with an active fraction above 0 (leave never counts). Orgs join at read time (R26);
 * cohort lines belong to no cost center.
 */
function centersByUnit(lines: Iterable<PlanLine>): Map<string, Center[]> {
  const people = new Map<string, Map<Month, Set<string>>>()
  for (const l of lines) {
    if (isCohortLine(l) || !GRID.includes(l.month)) continue
    const cc = model.latest.get(l.positionId)!.costCenter
    let byMonth = people.get(cc)
    if (!byMonth) {
      byMonth = new Map()
      people.set(cc, byMonth)
    }
    if (l.basis === 'band' || !l.holderId || !(l.active > 0)) continue
    let costed = byMonth.get(l.month)
    if (!costed) {
      costed = new Set()
      byMonth.set(l.month, costed)
    }
    costed.add(`${l.basis}:${l.holderId}`)
  }
  const out = new Map<string, Center[]>()
  for (const cc of [...people.keys()].sort()) {
    const row = centerRow.get(cc)!
    const byMonth = people.get(cc)!
    const list = out.get(row.businessUnit) ?? []
    list.push({
      costCenter: cc,
      currency: siteByLocation.get(row.location)!.currency,
      size: Math.min(...GRID.map((m) => byMonth.get(m)?.size ?? 0)),
    })
    out.set(row.businessUnit, list)
  }
  return out
}

/** Each FY27 version's lines: the locks' stored lines, FY27 Working's own lines and its forecast. */
const versionLines = (): [string, Iterable<PlanLine>][] => [
  ['FY27 Budget', planLineRows(sample.locks.budget.lines)],
  ['FY27 Q1 Reforecast', planLineRows(sample.locks.q1.lines)],
  ['FY27 Working', planLinesOf(data, FY27_WORKING, AS_OF)],
  ['FY27 Working forecast', model.forecast.lines],
]

describe('determinism', () => {
  it('two runs are deep-equal, hashes included', () => {
    const again = generateSample()
    expect(JSON.stringify(again.datasets)).toBe(JSON.stringify(sample.datasets))
    expect(JSON.stringify(again.plan)).toBe(JSON.stringify(sample.plan))
    expect(again.story).toEqual(sample.story)
    expect(again.locks.budget.hash).toBe(sample.locks.budget.hash)
    expect(again.locks.q1.hash).toBe(sample.locks.q1.hash)
  })
})

describe('versions (13.2, 6.5)', () => {
  it('holds the FY27 Budget and Q1 Reforecast locked, FY27 Working and FY28 Working', () => {
    const v = sample.plan.versions
    expect(
      v.map((x) => [x.versionId, x.name, x.kind, x.state, x.fiscalYear, x.grid.from, x.grid.to]),
    ).toEqual([
      ['fy27-budget', 'FY27 Budget', 'budget', 'locked', 'FY27', '2026-04', '2027-09'],
      ['fy27-q1-reforecast', 'FY27 Q1 Reforecast', 'reforecast', 'locked', 'FY27', '2026-04', '2027-09'],
      ['fy27-working', 'FY27 Working', 'working', 'working', 'FY27', '2026-04', '2027-09'],
      ['fy28-working', 'FY28 Working', 'working', 'working', 'FY28', '2027-04', '2028-09'],
    ])
    for (const x of v) expect(x.proration).toBe('daily')
    expect(budgetOf(v, 'FY27')?.versionId).toBe(FY27_BUDGET)
    expect(planOfRecord(v, 'FY27')?.versionId).toBe(FY27_Q1_REFORECAST)
    expect(workingOf(v, 'FY27')?.versionId).toBe('fy27-working')
    expect(workingOf(v, 'FY28')?.versionId).toBe('fy28-working')
    expect(planOfRecord(v, 'FY28')).toBeNull()
    const fpa = sample.personas.find((p) => p.key === 'finance-fpa')!
    for (const x of v.filter(isLocked)) {
      expect(x.parentId).toBe('fy27-working')
      expect(x.lockedBy).toBe(fpa.employeeId)
      expect(x.hash).toMatch(/^sha256-[0-9a-f]{64}$/)
      expect(verifyLock(x)).toBe(true)
    }
    expect(sample.locks.budget.lockedAt).toBe('2026-03-20T17:00')
    expect(sample.locks.q1.lockedAt).toBe('2026-07-15T17:00')
    expect(sample.locks.budget.forecast).toBeNull()
    // The baseline id names the whole generated sample, not only the Budget's lock (B9).
    expect(sample.plan.baselineId).toBe(sampleBaselineId(sample.datasets, sample.plan))
    expect(sample.plan.baselineId).toMatch(/^northgate-[0-9a-f]{12}$/)
  })

  it('locks lines the engine computes "as of" each lock date, and the hash says so', () => {
    const check = (locked: LockedVersion, day: string) => {
      const view = asKnownOn(sample, day)
      const lines = planLinesOf(view, locked.versionId, day)
      expect(
        lockHash({
          lines,
          assumptions: locked.assumptions,
          rates: locked.rates,
          proration: locked.proration,
          engineVersion: locked.engineVersion,
        }),
      ).toBe(locked.hash)
      // Today's data would give other lines: the lock is not a recomputation of Working.
      const today = planLinesOf(data, locked.versionId, AS_OF)
      expect(
        lockHash({
          lines: today,
          assumptions: locked.assumptions,
          rates: locked.rates,
          proration: locked.proration,
          engineVersion: locked.engineVersion,
        }),
      ).not.toBe(locked.hash)
    }
    check(sample.locks.budget, '2026-03-20')
    check(sample.locks.q1, '2026-07-15')
  })

  it('keeps the locks when Working assumptions change (locked lines are never recomputed)', () => {
    const edited = data.assumptions.map((r) =>
      r.version === 'fy27-working' && r.table === 'band' ? { ...r, value: r.value * 1.1 } : r,
    )
    const view = asKnownOn({ ...sample, datasets: { ...data, assumptions: edited } }, '2026-03-20')
    const lines = planLinesOf(view, FY27_BUDGET, '2026-03-20')
    const b = sample.locks.budget
    expect(lockHash({ ...b, lines, engineVersion: b.engineVersion })).toBe(b.hash)
  })

  it('sets the FY27 targets at the Budget lock lines to the cent', () => {
    const lines = [...planLineRows(sample.locks.budget.lines)]
    for (const t of data.targets.filter((x) => x.fiscalYear === 'FY27')) {
      let usd = 0
      for (const l of lines)
        if (FY27.includes(l.month) && model.latest.get(l.positionId)?.businessUnit === t.businessUnit)
          usd += l.usd.loaded
      expect(cents(usd), t.businessUnit).toBe(cents(t.targetCost!))
    }
  })

  it('stores the Q1 Reforecast forecast as of the last close before its lock', () => {
    const f = sample.locks.q1.forecast!
    expect(f.asOf).toBe('2026-06-30')
    expect(f.closedThrough).toBe('2026-06')
    expect(f.months.map((m) => m.month)).toEqual(monthsBetween('2026-04', '2027-09'))
    expect(f.months.filter((m) => m.closed).map((m) => m.month)).toEqual(['2026-04', '2026-05', '2026-06'])
    expect(f.unfilledAtHorizon).toBeCloseTo(18.1, 6)
    // Lead decisions D-PREHIRE and D-CLOSE moved this from $251,551,461.59: the 8 hires known at the
    // 15 Jul lock that start 1 to 13 Jul (after the 30 Jun as-of) are costed at HRIS pay, and the
    // April to June closes carry their one-time items.
    expect(f.yearEnd.cost.loaded).toBeCloseTo(251_672_670.67, 2)
    // A forecast carries no vacancy allowance (D-VAC).
    expect(f.yearEnd.cost.vacancy).toBe(0)
  })

  it('carries a 3% vacancy allowance in every plan version, and none in the forecast or the closes (D-VAC)', () => {
    expect(VACANCY_FACTOR).toBe(0.03)
    for (const [name, lines] of versionLines()) {
      let recurring = 0
      let vacancy = 0
      let allowanceLines = 0
      for (const l of lines) {
        if (!GRID.includes(l.month)) continue
        if (l.basis !== 'band') recurring += l.usd.base + l.usd.bonus + l.usd.burden + l.usd.benefits
        vacancy += l.usd.vacancy
        if (isAllowanceLine(l)) {
          allowanceLines++
          // Its own line: no head, no person, nothing but the allowance in its loaded cost.
          expect([l.heads, l.active, l.holderId, cents(l.usd.loaded)]).toEqual([
            0,
            0,
            null,
            cents(l.usd.vacancy),
          ])
        } else expect(l.usd.vacancy, name).toBe(0)
      }
      if (name === 'FY27 Working forecast') {
        expect([allowanceLines, vacancy], name).toEqual([0, 0])
        continue
      }
      // −3% of the filled part's recurring cost (base, bonus, burden, benefits; no one-time, no band seats).
      expect(allowanceLines, name).toBeGreaterThan(0)
      expect(cents(vacancy), name).toBe(cents(-VACANCY_FACTOR * recurring))
    }
    for (const c of sample.plan.closes) for (const l of actualLineRows(c.lines)) expect(l.usd.vacancy).toBe(0)
  })

  it('plants the Munich P4: not in the Budget, Planned in the Q1 Reforecast with fixture C1, started 14 Dec 2026 at 0.9', () => {
    const id = sample.planted.munichP4.positionId
    expect([...planLineRows(sample.locks.budget.lines)].some((l) => l.positionId === id)).toBe(false)
    const q1 = [...planLineRows(sample.locks.q1.lines)].filter((l) => l.positionId === id)
    const sep = q1.filter((l) => l.month === '2026-09')
    expect(sep.map((l) => l.status)).toEqual(['Filled'])
    expect(cents(sep[0].usd.loaded)).toBe(630_117)
    const fy = q1.filter((l) => FY27.includes(l.month))
    const local = fy.reduce((a, l) => a + l.local.base + l.local.bonus + l.local.burden + l.local.benefits, 0)
    expect(cents(local)).toBe(7_584_742)
    expect(cents(fy.reduce((a, l) => a + l.usd.loaded, 0))).toBe(8_191_521)
    const start = model.forecast.expectedStarts.find((e) => e.positionId === id)!
    expect([start.kind, start.start, start.probability]).toEqual(['planned', '2026-12-14', 0.9])
  })
})

/** The months from one to another, both included. */
function monthsBetween(from: Month, to: Month): Month[] {
  const out: Month[] = []
  for (let m = from; m <= to; ) {
    out.push(m)
    const y = +m.slice(0, 4)
    const mo = +m.slice(5, 7)
    m = (mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`) as Month
  }
  return out
}

describe('closes (6.6, 7.3a)', () => {
  it('closes April to September 2026 on each last day, by the FP&A lead, hashed', () => {
    const fpa = sample.personas.find((p) => p.key === 'finance-fpa')!
    expect(sample.plan.closes.map((c) => [c.month, c.closedAt, c.by])).toEqual(
      CLOSE_MONTHS.map((m) => [m, `${monthEnd(m)}T18:00`, fpa.employeeId]),
    )
    for (const c of sample.plan.closes) {
      expect(verifyClose(c)).toBe(true)
      expect(c.atoms.closeDate).toBe(monthEnd(c.month))
      // Heads at the month's end: one line per employee active then, not-in-plan people included.
      let heads = 0
      for (const l of actualLineRows(c.lines)) heads += l.heads
      expect(heads, c.month).toBe(
        headsOn(toAssignments(asKnownOn(sample, monthEnd(c.month)).workers), monthEnd(c.month)),
      )
    }
    let sepHeads = 0
    for (const l of actualLineRows(sample.plan.closes[5].lines)) sepHeads += l.heads
    expect(sepHeads).toBe(1_456)
  })

  it('changes the atom index once between the 31 Aug and 30 Sep closes: the seat raised to M2 heads a new atom', () => {
    const [aug, sep] = [sample.plan.closes[4].atoms, sample.plan.closes[5].atoms]
    const augIds = new Set(aug.atoms.map((a) => a.atomId))
    const sepIds = new Set(sep.atoms.map((a) => a.atomId))
    expect([...sepIds].filter((id) => !augIds.has(id))).toEqual([sample.planted.raisedToM2])
    expect([...augIds].filter((id) => !sepIds.has(id))).toEqual([])
    // Positions in both indexes move only into the new atom; positions created in September join theirs.
    const moved = Object.keys(sep.byPosition).filter(
      (id) => Object.hasOwn(aug.byPosition, id) && aug.byPosition[id] !== sep.byPosition[id],
    )
    const newAtom = sep.atoms.find((a) => a.atomId === sample.planted.raisedToM2)!
    expect(moved.sort()).toEqual([...newAtom.positionIds].sort())
    expect(newAtom.positionIds.length).toBeGreaterThan(1)
    // The earlier closes keep one partition.
    for (let i = 1; i < 5; i++)
      expect(sample.plan.closes[i].atoms.atoms.map((a) => a.atomId)).toEqual(
        sample.plan.closes[0].atoms.atoms.map((a) => a.atomId),
      )
  })

  it('posts no adjustment: every closed month recomputed from the final data, with its month-end leave, gives the same lines', () => {
    const recompute = (month: Month) => {
      const end = monthEnd(month)
      const input = closeInput(sample, month)
      const workers = data.workers.map((w, i) => {
        const from = sample.known.workers[i].leaveFrom
        return w.onLeave && (from == null || from > end) ? { ...w, onLeave: null, leavePaid: null } : w
      })
      return actualLines({ ...input, positions: data.positions, workers, comp: data.comp })
    }
    expect(adjustmentsFor(sample.plan.closes, recompute, '2026-10', [])).toEqual([])
    expect(sample.plan.adjustments).toEqual([])
  })

  it("books each month's one-time items in its close, as FY27 Working books them, and the forecast carries them (D-CLOSE)", () => {
    const key = (positionId: string | null, month: Month) => `${positionId}|${month}`
    const working = new Map<string, number>()
    for (const l of planLinesOf(data, FY27_WORKING, AS_OF))
      if (l.month <= '2026-09' && l.local.oneTime !== 0)
        working.set(
          key(l.positionId, l.month),
          (working.get(key(l.positionId, l.month)) ?? 0) + l.local.oneTime,
        )
    const closed = new Map<string, number>()
    let usd = 0
    for (const c of sample.plan.closes)
      for (const l of actualLineRows(c.lines)) {
        if (l.local.oneTime === 0) continue
        // A one-time line of its own: no head, no active fraction, no recurring pay.
        expect([l.heads, l.active, l.local.base + l.local.bonus + l.local.burden + l.local.benefits]).toEqual(
          [0, 0, 0],
        )
        closed.set(
          key(l.positionId, l.month),
          (closed.get(key(l.positionId, l.month)) ?? 0) + l.local.oneTime,
        )
        usd += l.usd.oneTime
      }
    // Position by position and month by month, in local currency (the close books at the actual rate).
    expect(closed.size).toBe(49)
    expect([...closed].sort()).toEqual([...working].sort())
    expect(cents(usd)).toBe(cents(902_391))
    // The forecast reads closed months from the closes, so its April to September one-time cost is theirs.
    let forecastUsd = 0
    for (const l of model.forecast.lines) if (l.month <= '2026-09') forecastUsd += l.usd.oneTime
    expect(cents(forecastUsd)).toBe(cents(usd))
  })
})

describe('the cycle and the plan state (13.2)', () => {
  it('has one cycle record, FY28 Open for asks with asks due 16 Oct 2026, opened by Finance', () => {
    expect(sample.plan.cycles).toEqual([
      expect.objectContaining({
        cycleId: FY28_CYCLE_ID,
        fiscalYear: 'FY28',
        stage: 'Open for asks',
        openedAt: '2026-09-15T09:00',
        openedBy: sample.personas.find((p) => p.key === 'finance-fpa')!.employeeId,
        cutLines: [],
      }),
    ])
    expect(sample.plan.cycles[0].dates.asksDue).toBe('2026-10-16')
    expect(sample.plan.requests).toEqual([])
    expect(sample.plan.auditHead).toBeNull()
  })

  it('numbers the added requests after the base: the trade R-1040, then the cycle asks in raised order', () => {
    expect(sample.story.tradeRequestId).toBe('R-1040')
    const asks = sample.story.cycleAskIds.map((id) => data.requests.find((r) => r.requestId === id)!)
    expect(asks[0].requestId).toBe('R-1041')
    for (let i = 1; i < asks.length; i++) {
      expect(+asks[i].requestId.slice(2)).toBe(+asks[i - 1].requestId.slice(2) + 1)
      expect(asks[i].submittedAt! >= asks[i - 1].submittedAt!).toBe(true)
    }
    expect(new Set(data.requests.map((r) => r.requestId)).size).toBe(data.requests.length)
    // 87 asks from 82 managers: 58 New roles (18 from the directors, VPs and SVP, 40 from 35 M1
    // managers) and 29 Level changes from 1 Apr 2027 (0 heads).
    expect(asks).toHaveLength(87)
    expect(asks.filter((q) => q.type === 'New role')).toHaveLength(SE_ASK_HEADS)
    const levelChanges = asks.filter((q) => q.type === 'Level change')
    expect(levelChanges).toHaveLength(29)
    for (const q of levelChanges)
      expect([q.startDate, q.reasonCode, q.priority]).toEqual(['2027-04-01', 'Level mix', 1])
    expect(new Set(asks.map((q) => q.requesterId)).size).toBe(82)
    for (const q of asks) {
      expect(q.cycleId).toBe(FY28_CYCLE_ID)
      expect(q.businessUnit).toBe('Silicon Engineering')
      expect(PENDING_REQUEST_STATES).toContain(q.state)
      expect(q.submittedAt! >= '2026-09-16' && q.submittedAt! <= '2026-09-30T23:59').toBe(true)
      expect(q.startDate! >= '2027-04-01' && q.startDate! <= '2028-03-31').toBe(true)
      expect(q.steps?.map((s) => s.role)).toEqual(['Manager'])
      expect(q.steps?.[0].decision).toBe(q.state === 'In review' ? 'Approved' : 'Pending')
    }
  })
})

describe('stored approval steps (10.2)', () => {
  it("stores the chain engine's steps on every pending request but the cycle asks and the trade", () => {
    const rows = assumptionsOf(data, FY27_WORKING)
    const rates = ratesOf(
      rows,
      fxRatesFromAssumptions(rows),
      versionFrame(FY27_WORKING),
      null,
      data.positions,
    )
    const reqs = data.requests.map(fromRow)
    const ctx = workingAsksContext(data, rates, '2026-10', reqs)
    const fpa = sample.personas.find((p) => p.key === 'finance-fpa')!.employeeId
    const pending = reqs.filter((q) => PENDING_REQUEST_STATES.includes(q.state))
    const atoms = sample.plan.closes[5].atoms
    const guarded = new Map<string, number>()
    for (const t of data.targets.filter((x) => x.fiscalYear === 'FY27'))
      guarded.set(
        t.businessUnit,
        guardedAsksCost({
          lines: unitWorkingLines(data, t.businessUnit, sample.plan.closes),
          requests: pending,
          fiscalYear: 'FY27',
          org: unitOrg(t.businessUnit),
          ctx,
          index: atoms,
          managerOf: (id) => model.latest.get(id)?.managerPositionId ?? null,
        }).cost,
      )
    let n = 0
    for (const row of data.requests) {
      if (!PENDING_REQUEST_STATES.includes(row.state) || row.cycleId || row.type === 'Trade') continue
      const q = fromRow(row)
      const on = (row.submittedAt ?? row.updatedAt ?? '').slice(0, 10)
      const t = data.targets.find((x) => x.fiscalYear === 'FY27' && x.businessUnit === q.businessUnit)!
      const others = reqs.filter(
        (x) => x.requestId !== q.requestId && (!x.confidential || x.requesterId === q.requesterId),
      )
      const org = unitOrg(q.businessUnit)
      const check: PlanCheck = {
        org: q.businessUnit,
        target: { heads: t.targetHeads, cost: t.targetCost ?? null },
        asks: { heads: asks(org, '2027-03-31', others, ctx).heads, cost: guarded.get(q.businessUnit)! },
        effect: { heads: headEffect(q, org, '2027-03-31', ctx), cost: bandEffect(q, org, 'FY27', ctx) },
      }
      const seat = q.positionId ? model.latest.get(q.positionId) : undefined
      const level = q.level ?? seat?.level
      const location = q.location ?? seat?.location
      const band =
        level && location ? rates.bandUsd({ level, location, fte: q.fte ?? 1 }, q.managerPositionId) : null
      const steps = chainFor(q, {
        org: chainOrgOf(data, on, unitPeople(sample.world, day(on)), fpa),
        facts: {
          bandEstimateUsd: band,
          checks: [check],
          cycleLocked: false,
          likeForLikeBackfill: false,
          envelopeException: false,
        },
      })
      expect(
        steps.map((x) => [x.role, x.approverId]),
        row.requestId,
      ).toEqual((row.steps ?? []).map((x) => [x.role.toLowerCase(), x.approverId]))
      n++
    }
    expect(n).toBe(12)
  })
})

describe('story 1: Go-to-Market hired ahead of plan', () => {
  it('has 8 more actual heads at 30 Sep than Budget plan heads at Sep month-end, exactly the 8 early starts', () => {
    expect([st.s1.actualHeads, st.s1.budgetPlanHeads, st.s1.headsDelta]).toEqual([184, 176, 8])
    expect(st.s1.plus).toEqual(sample.planted.earlyStarts)
    expect(st.s1.minus).toEqual([])
  })

  it('costs more than the Budget year to date and for the full year', () => {
    // D-CLOSE: the closes now hold Go-to-Market's $214,091 of one-time items (was $16,211,952.48).
    expect(cents(st.s1.ytdActual)).toBe(cents(16_426_043.48))
    // D-VAC: the Budget includes its 3% vacancy allowance (was $15,702,534.64 and $33,251,713.77).
    expect(cents(st.s1.ytdBudget)).toBe(cents(15_236_845.85))
    expect(cents(st.s1.fyForecast)).toBe(cents(34_252_218.32))
    expect(cents(st.s1.fyBudget)).toBe(cents(32_316_099.11))
    expect(st.s1.ytdActual).toBeGreaterThan(st.s1.ytdBudget)
    expect(st.s1.fyForecast).toBeGreaterThan(st.s1.fyBudget)
    // D-VAC (was +$1,000,504.55).
    expect(cents(st.s1.fyVariance)).toBe(cents(1_936_119.22))
  })

  it('hired 18 people this year against 4 planned hires (+14)', () => {
    expect([st.s1.hires.ytd, st.s1.hires.planned, st.s1.hires.ytd - st.s1.hires.planned]).toEqual([18, 4, 14])
    for (const id of sample.planted.earlyStarts) {
      const holder = data.workers.find(
        (w) => w.positionId === id && w.hireDate <= AS_OF && !w.terminationDate,
      )!
      expect(st.s1.hires.hiredIds).toContain(holder.employeeId)
    }
  })
})

describe('story 2: Silicon Engineering is late in Bengaluru and over on cost', () => {
  it('has 10 fewer actual heads than Budget plan heads, exactly the 10 late Bengaluru seats', () => {
    expect([st.s2.actualHeads, st.s2.budgetPlanHeads, st.s2.headsDelta]).toEqual([556, 566, -10])
    expect(st.s2.minus).toEqual(sample.planted.lateBengaluru)
    expect(st.s2.plus).toEqual([])
  })

  it('forecasts the full year over the Budget', () => {
    expect(cents(st.s2.fyForecast)).toBe(cents(93_885_679.82))
    // D-VAC: the Budget includes its 3% vacancy allowance (was $92,474,837.01 and +$1,410,842.82).
    expect(cents(st.s2.fyBudget)).toBe(cents(89_767_347.99))
    expect(cents(st.s2.fyVariance)).toBe(cents(4_118_331.83))
    // D-CLOSE: year to date too, the closes holding the one-time items.
    expect(cents(st.s2.ytdActual)).toBe(cents(46_094_524.01))
    expect(cents(st.s2.ytdBudget)).toBe(cents(43_801_597.71))
  })

  it('books the six Hsinchu agency fees in the closes of their offer-accepted months (D-CLOSE)', () => {
    const offers = sample.planted.hsinchuOffers
    expect(offers).toHaveLength(6)
    for (const o of offers) {
      const req = data.reqs.find((r) => r.reqId === o.reqId)!
      expect(req.agencyFee! > 0 && req.signOnBonus! > 0 && req.relocation! > 0, o.reqId).toBe(true)
      const booked: [Month, string, number][] = []
      for (const c of sample.plan.closes)
        for (const l of actualLineRows(c.lines))
          if (l.positionId === o.positionId && l.local.oneTime !== 0)
            booked.push([l.month, l.currency, l.local.oneTime])
      // The agency fee alone: sign-on and relocation book in the start month, after September.
      expect(req.startDate! > AS_OF, o.reqId).toBe(true)
      expect(booked, o.reqId).toEqual([[req.offerAcceptedDate!.slice(0, 7) as Month, 'TWD', req.agencyFee]])
    }
  })

  it('keeps no not-in-plan employee in a story org', () => {
    for (const id of sample.planted.notInPlan) {
      const w = data.workers.find((x) => x.employeeId === id && !x.positionId)!
      expect(STORY_UNITS).not.toContain(w.businessUnit)
      expect(STORY_SITES).not.toContain(w.location)
    }
  })
})

describe('story 3: Systems & Software backfills of new positions', () => {
  it('flags exactly 4 Backfill requests, all in Systems & Software', () => {
    expect(st.s3.flagged).toEqual({ 'Systems & Software': sample.planted.story3.backfillRequestIds })
    expect(st.s3.flagged['Systems & Software']).toHaveLength(4)
  })
})

describe('story 4: the Corporate freeze', () => {
  it('holds 3 openings and honors the accepted offer, which starts in the forecast', () => {
    expect(st.s4.frozen).toEqual(sample.planted.corporateInterviewing)
    expect(st.s4.frozen).toHaveLength(3)
    expect(st.s4.corporateOpenPlanned).toBe(4)
    expect(st.s4.frozen).not.toContain(sample.planted.corporateOffer.positionId)
    const offer = data.reqs.find((r) => r.reqId === sample.planted.corporateOffer.reqId)!
    expect(st.s4.offerStart).toMatchObject({
      kind: 'offer',
      start: offer.startDate,
      probability: 1,
      heldBy: null,
    })
  })
})

describe('story 5: EUR and ILS rise against plan', () => {
  it('keeps Munich and Haifa heads flat against the Budget, seat by seat', () => {
    for (const s of [st.s5.munich, st.s5.haifa]) {
      expect(s.headsDelta).toBe(0)
      expect(s.plus).toEqual([])
      expect(s.minus).toEqual([])
    }
    expect([st.s5.munich.actualHeads, st.s5.haifa.actualHeads]).toEqual([53, 45])
  })

  it('puts both sites over the Budget on cost, by an FX effect equal to the hand calculation', () => {
    // D-VAC: the Budget includes its 3% vacancy allowance (was +$455,363.39 and +$447,340.77); the FX
    // effects do not move.
    expect(cents(st.s5.munich.fyVariance)).toBe(cents(674_960.5))
    expect(cents(st.s5.haifa.fyVariance)).toBe(cents(675_470.23))
    expect(cents(st.s5.munich.fx)).toBe(cents(367_663.38))
    expect(cents(st.s5.haifa.fx)).toBe(cents(417_881.52))
    // Σ actual local × (actual − plan) for April to September + Σ forecast local × (forecast − plan) after.
    for (const [s, actual, forecastRate, plan] of [
      [st.s5.munich, [1.09, 1.1, 1.11, 1.12, 1.13, 1.14], 1.15, 1.08],
      [st.s5.haifa, [0.272, 0.275, 0.278, 0.281, 0.284, 0.287], 0.29, 0.27],
    ] as const) {
      expect(s.fxMonths.map((m) => m.month)).toEqual(FY27)
      expect(s.fxMonths.map((m) => m.rate)).toEqual([...actual, ...Array(6).fill(forecastRate)])
      expect(new Set(s.fxMonths.map((m) => m.plan))).toEqual(new Set([plan]))
      let hand = 0
      s.fxMonths.forEach((m, i) => {
        hand += m.local * ((i < 6 ? actual[i] : forecastRate) - plan)
      })
      expect(cents(hand)).toBe(cents(s.fx))
    }
    expect(Object.values(st.s5.otherSitesFx).every((x) => x === 0)).toBe(true)
    expect(Object.keys(st.s5.otherSitesFx)).toHaveLength(11)
  })

  it('ports the fold verbatim: groups under 5 go to Other, then the smallest shown group joins while Other is under 5', () => {
    expect(foldGroups([9, 6, 2, 1], (x) => x, 5, true)).toEqual({ shown: [9], folded: [2, 1, 6] })
    expect(foldGroups([9, 6, 2, 1], (x) => x, 5, false)).toEqual({ shown: [9, 6], folded: [2, 1] })
    // Ties go to the first in order.
    const sizes: Record<string, number> = { a: 4, b: 6, c: 6 }
    expect(foldGroups(['a', 'b', 'c'], (x) => sizes[x], 5, true).folded).toEqual(['a', 'b'])
    // The currency rule: Other's USD share of 2 pulls in the smallest shown USD cost center.
    const fold = financeFold(
      [
        { costCenter: '1-A', currency: 'USD', size: 2 },
        { costCenter: '1-B', currency: 'TWD', size: 5 },
        { costCenter: '1-C', currency: 'USD', size: 9 },
        { costCenter: '1-D', currency: 'USD', size: 7 },
      ],
      MIN_COSTED_PEOPLE,
    )
    expect(fold.other.map((c) => c.costCenter)).toEqual(['1-A', '1-B', '1-D'])
  })

  it("keeps every MUC and HFA cost center out of its unit's Other in Finance's fold, in every FY27 version", () => {
    for (const [name, lines] of versionLines()) {
      const byUnit = centersByUnit(lines)
      expect([...byUnit.keys()].sort(), name).toEqual([...UNITS].sort())
      for (const [unit, centers] of byUnit) {
        const where = `${name}, ${unit}`
        const { shown, other } = financeFold(centers, MIN_COSTED_PEOPLE)
        expect(
          other.map((c) => c.costCenter).filter((c) => /-(MUC|HFA)$/.test(c)),
          where,
        ).toEqual([])
        for (const c of shown)
          expect(c.size, `${where}, ${c.costCenter}`).toBeGreaterThanOrEqual(MIN_COSTED_PEOPLE)
        const otherSize = other.reduce((a, c) => a + c.size, 0)
        expect(otherSize === 0 || otherSize >= MIN_COSTED_PEOPLE, where).toBe(true)
        // Each currency's share of Other is 0 or 5 or more, unless no shown cost center is in it (15.3.8).
        for (const currency of new Set(other.map((c) => c.currency))) {
          const share = other.filter((c) => c.currency === currency).reduce((a, c) => a + c.size, 0)
          if (shown.some((c) => c.currency === currency))
            expect(share === 0 || share >= MIN_COSTED_PEOPLE, `${where}, ${currency}`).toBe(true)
        }
        // Silicon Engineering has no cost center under 5, so nothing folds and nothing joins.
        if (unit === SILICON) expect(other, where).toEqual([])
      }
    }
  })

  it("equals Finance's Germany and Israel rows: the shown EUR and ILS cost centers plus the currency's cohort lines", () => {
    const shownCenters: string[] = []
    for (const centers of centersByUnit(model.forecast.lines).values())
      for (const c of financeFold(centers, MIN_COSTED_PEOPLE).shown) shownCenters.push(c.costCenter)
    const lines = model.forecast.lines.filter((l) => FY27.includes(l.month))
    for (const [currency, site, s] of [
      ['EUR', 'Munich', st.s5.munich],
      ['ILS', 'Haifa', st.s5.haifa],
    ] as const) {
      const shown = new Set(
        shownCenters.filter((c) => siteByLocation.get(centerRow.get(c)!.location)!.currency === currency),
      )
      // Every cost center paid in the currency sits in the site, and every one of them is shown.
      const all = new Set([...centerRow.values()].filter((r) => r.location === site).map((r) => r.costCenter))
      expect([...shown].sort(), currency).toEqual([...all].sort())
      // The cohort lines of the currency are the units' modeled exits and backfills paid in it.
      const row = lines.filter((l) =>
        isCohortLine(l) ? l.currency === currency : shown.has(model.latest.get(l.positionId)!.costCenter),
      )
      expect(cents(fxEffect(row, sample.locks.budget.rates)), currency).toBe(cents(s.fx))
    }
  })

  it("control: with 1110-AUS at 4 costed people, the fold puts Munich's 1110-MUC in Silicon Engineering's Other", () => {
    // The San Jose engineer seated with the Austin team (departments.ts `remote`) is what keeps 1110-AUS at 5.
    const remote = [...model.latest.values()].filter(
      (r) =>
        r.costCenter === '1110-AUS' &&
        r.level.startsWith('P') &&
        model.latest.get(r.managerPositionId!)?.costCenter === '1110-SJC',
    )
    expect(remote).toHaveLength(1)
    const lines = model.forecast.lines.filter((l) => l.positionId !== remote[0].positionId)
    const se = centersByUnit(lines).get(SILICON)!
    const size = (c: string) => se.find((x) => x.costCenter === c)!.size
    expect([size('1110-AUS'), size('1110-MUC'), size('1160-HSZ')]).toEqual([4, 6, 6])
    const other = financeFold(se, MIN_COSTED_PEOPLE).other.map((c) => c.costCenter)
    expect(other).toContain('1110-AUS')
    expect(other).toContain('1110-MUC')
    expect(other).not.toContain('1160-HSZ')
  })

  it('lists the only small currency group (15.3.8): Corporate has 1 costed person paid in CAD', () => {
    const groups = new Map<string, Set<string>>()
    for (const l of model.forecast.lines) {
      if (!FY27.includes(l.month) || isCohortLine(l) || l.basis === 'band' || !l.holderId || l.active <= 0)
        continue
      const k = `${model.latest.get(l.positionId)!.businessUnit}|${l.currency}`
      groups.set(k, new Set([...(groups.get(k) ?? []), `${l.basis}:${l.holderId}`]))
    }
    const small = [...groups].filter(([, v]) => v.size >= 1 && v.size <= 4).map(([k, v]) => [k, v.size])
    expect(small).toEqual([['Corporate|CAD', 1]])
  })

  it('shows the planted Munich P4 in the bridge position-changes step and the FX step equal to fxEffect', () => {
    const months = FY27
    const scope = (p: { businessUnit: string }) => p.businessUnit === 'Go-to-Market'
    const b = bridge({
      fiscalYear: 'FY27',
      comparison: { versionId: FY27_BUDGET, label: 'FY27 Budget', fiscalYear: 'FY27' },
      yearHasLockedVersion: true,
      months,
      seats: bridgeSeats({
        comparison: sample.locks.budget,
        forecast: model.forecast,
        positions: data.positions,
        scope,
        months,
      }),
    })
    if (b.kind !== 'ok') throw new Error('no bridge')
    const step = (k: string) => b.steps.find((s) => s.key === k)!
    expect(step('positions').contributors).toContain(sample.planted.munichP4.positionId)
    const gtm = model.forecast.lines.filter(
      (l) =>
        months.includes(l.month) &&
        (isCohortLine(l) ? l.cohort.businessUnit : model.latest.get(l.positionId)?.businessUnit) ===
          'Go-to-Market',
    )
    expect(cents(step('fx').amount)).toBe(cents(fxEffect(gtm, sample.locks.budget.rates)))
    expect(cents(b.end)).toBe(cents(st.s1.fyForecast))
  })

  it('starts the bridge at the Budget total with its vacancy allowance, and its steps add up to the variance (D-VAC)', () => {
    const months = FY27
    for (const [unit, s] of [
      ['Go-to-Market', st.s1],
      ['Silicon Engineering', st.s2],
    ] as const) {
      const b = bridge({
        fiscalYear: 'FY27',
        comparison: { versionId: FY27_BUDGET, label: 'FY27 Budget', fiscalYear: 'FY27' },
        yearHasLockedVersion: true,
        months,
        seats: bridgeSeats({
          comparison: sample.locks.budget,
          forecast: model.forecast,
          positions: data.positions,
          scope: (p) => p.businessUnit === unit,
          months,
        }),
      })
      if (b.kind !== 'ok') throw new Error('no bridge')
      expect(cents(b.start), unit).toBe(cents(s.fyBudget))
      expect(cents(b.end), unit).toBe(cents(s.fyForecast))
      const steps = b.steps.reduce((a, x) => a + cents(x.amount), 0)
      expect(steps, unit).toBe(cents(b.end) - cents(b.start))
      expect(cents(b.end - b.start), unit).toBe(cents(s.fyVariance))
      // Step 3 prices the forecast's exits and backfills against the Budget's allowance.
      expect(b.steps.find((x) => x.key === 'attrition')!.amount, unit).not.toBe(0)
    }
  })
})

describe('story 6: Silicon Engineering asks more than its FY28 target', () => {
  it('has a gap of −18 with the cut line after the 40th ranked head', () => {
    const se27 = data.targets.find(
      (t) => t.fiscalYear === 'FY28' && t.businessUnit === 'Silicon Engineering',
    )!
    expect(st.s6.targetHeads).toBe(se27.targetHeads)
    expect(st.s6.targetHeads - st.s6.room).toBe(st.s6.asksHeads - st.s6.rankedHeads)
    expect([st.s6.targetHeads, st.s6.asksHeads, st.s6.gap]).toEqual([644, 662, -18])
    expect([st.s6.rankedHeads, st.s6.room, st.s6.cutAfter, st.s6.above]).toEqual([SE_ASK_HEADS, 40, 40, 40])
    expect(st.s6.otherPending).toEqual([])
  })

  it('has 4 Silicon Engineering managers who have not submitted', () => {
    expect(st.s6.notSubmitted).toEqual(sample.story.notSubmitted)
    expect(st.s6.notSubmitted).toHaveLength(SE_NOT_SUBMITTED)
    expect(sample.story.seManagers).toHaveLength(86)
  })
})

describe('story 7: people not in the plan and cost-center mismatches', () => {
  it('reconciles to exactly 9 exceptions of two kinds', () => {
    expect(st.s7.exceptions).toEqual({ 'not-in-plan': 6, 'cost-center-mismatch': 3 })
  })

  it('places the 6 not in the plan, by their HRIS unit, 3 in Systems & Software and 3 in Operations', () => {
    // Plan > Overview's Heads by unit lists them on their own "Not in plan" row (M4 review SA-6), so
    // those two units read the people in their seats, 337 and 170, as the README says.
    const units = sample.planted.notInPlan.map(
      (id) => data.workers.find((w) => w.employeeId === id && !w.positionId)?.businessUnit,
    )
    expect(units.filter((u) => u === 'Systems & Software')).toHaveLength(3)
    expect(units.filter((u) => u === 'Operations')).toHaveLength(3)
    const readme = readFileSync(fileURLToPath(new URL('./README.md', import.meta.url)), 'utf8')
    expect(readme).toContain(
      'Systems & Software 337 and Operations 170, where the HRIS places 3 of the 6 each',
    )
  })
})

describe('story 8: 1550-HSZ', () => {
  it('has 3 costed people in every FY27 month', () => {
    expect(Object.values(st.s8.costedPeople)).toEqual(Array(12).fill(3))
  })
})

describe('story 9: the pending Systems & Software trade', () => {
  it('quotes 6 P3 Bengaluru seats for the Planned P5 San Jose at the plan of record', () => {
    const q = st.s9.quote
    expect(q.ok).toBe(true)
    expect(q.rates).toEqual({
      version: FY27_Q1_REFORECAST,
      lockHash: sample.locks.q1.hash,
      standardHeadUsd: 174_000,
    })
    expect(q.give.map((g) => [g.positionId, g.level, g.location, cents(g.bandUsd!), g.weightBp])).toEqual([
      [sample.planted.tradeGive, 'P5', 'San Jose', 29_597_660, 17_010],
    ])
    expect(q.get).toHaveLength(6)
    for (const g of q.get)
      expect([g.level, g.location, cents(g.bandUsd!), g.weightBp, g.start]).toEqual([
        'P3',
        'Bengaluru',
        4_811_520,
        2_765,
        TRADE_GET_START,
      ])
    expect(q.give[0].bandUsd! / q.get[0].bandUsd!).toBeCloseTo(6.1514, 4)
    expect([q.giveBp, q.getBp, q.creditBp, q.maxSeats, q.headsDelta]).toEqual([17_010, 16_590, 420, 6, 5])
    expect(q.ratio).toBeCloseTo(6.1519, 4)
    expect(cents(q.getBandUsd)).toBe(28_869_120)
    expect(q.getBandUsd).toBeGreaterThan(250_000)
    expect(q.inYearBp).toBeCloseTo(-4_275.25, 6)
    // P3 Bengaluru in local: ₹3,580,000 + 10% bonus + 12% of ₹180,000 + ₹50,000 = ₹4,009,600 at 0.012.
    expect(cents(4_009_600 * 0.012)).toBe(4_811_520)
  })

  it('stores the quote and the chain on the request: manager, HRBP, leader, waiting on the leader', () => {
    const row = data.requests.find((r) => r.requestId === sample.story.tradeRequestId)!
    expect([
      row.type,
      row.state,
      row.givePositionIds,
      row.count,
      row.giveBp,
      row.getBp,
      row.creditBp,
    ]).toEqual(['Trade', 'In review', sample.planted.tradeGive, 6, 17_010, 16_590, 420])
    expect([row.rateVersion, row.rateHash, row.giveOrgPositionId]).toEqual([
      FY27_Q1_REFORECAST,
      sample.locks.q1.hash,
      sample.story.trade.giveManagerPositionId,
    ])
    expect(st.s9.routing.steps.map((s) => s.role)).toEqual(['manager', 'hrbp', 'leader'])
    expect(st.s9.routing.steps[2].reasons).toEqual(['band-estimate-over-threshold'])
    expect(st.s9.storedSteps).toEqual(
      st.s9.routing.steps.map((s) => ({
        role: { manager: 'Manager', hrbp: 'HRBP', leader: 'Leader', finance: 'Finance' }[s.role],
        approverId: s.approverId,
      })),
    )
    expect(row.steps!.map((s) => s.decision)).toEqual(['Approved', 'Approved', 'Pending'])
    const req = fromRow(row)
    expect(req.steps[2].enteredAt).toBe('2026-09-21')
  })

  it('leaves Systems & Software in plan: a gap of +8 heads and $2,884,668.88 before the trade, on the guarded asks cost', () => {
    const c = st.s9.routing.check
    // D-VAC: the target (the Budget at the year end) and Working's asks include the 3% vacancy
    // allowance (were $61,741,086.49, $57,800,000 and $3,941,086.49).
    // C33 (review RF-4): Working's closed months (April to September) are the closes' actuals, as
    // every Plan, Forecast and Targets figure reads them, with no vacancy allowance on them (C31), so
    // the guarded asks cost is $57,100,000 (was $56,200,000 from Working's own recomputed lines,
    // R38) and the gap $2,884,668.88 (was $3,784,668.88). The trade still stays in plan.
    expect(c.target).toEqual({ heads: 389, cost: 59_984_668.88 })
    expect(c.asks).toEqual({ heads: 381, cost: 57_100_000 })
    expect(c.target!.heads - c.asks.heads).toBe(8)
    expect(cents(c.target!.cost! - c.asks.cost!)).toBe(cents(2_884_668.88))
    expect(c.effect.heads).toBe(5)
    expect(cents(c.effect.cost)).toBe(cents(-74_386.23))
    expect(c.target!.heads - c.asks.heads).toBeGreaterThanOrEqual(c.effect.heads)
    expect(c.target!.cost! - c.asks.cost!).toBeGreaterThanOrEqual(c.effect.cost)
    expect(st.s9.routing.steps.some((s) => s.role === 'finance')).toBe(false)
  })

  it('goes to Finance too when the target is set to the asks (negative control)', () => {
    expect(st.s9.control.map((s) => s.role)).toEqual(['manager', 'hrbp', 'leader', 'finance'])
    expect(st.s9.control[3].reasons).toEqual(['out-of-plan'])
  })

  it('leaves stories 1 to 8 unchanged', () => {
    const without = storyModel({
      ...sample,
      datasets: {
        ...data,
        requests: data.requests.filter((r) => r.requestId !== sample.story.tradeRequestId),
      },
      closes: sample.plan.closes,
      locks: sample.locks,
    })
    expect(JSON.stringify(storiesOneToEight(without))).toBe(JSON.stringify(storiesOneToEight(model)))
  })
})

describe('the status page story checks (src/app/status.ts)', () => {
  it('passes all nine on the sample, in the copy rules', () => {
    const checks = storyChecks(st)
    expect(checks.map((c) => c.story)).toEqual([...PLANNED_STORIES])
    for (const c of checks) {
      expect(c.ok, c.story).toBe(true)
      expect(c.detail.includes('!') || c.detail.includes(String.fromCharCode(0x2014)), c.detail).toBe(false)
    }
  })
})

describe('the README', () => {
  const money = (x: number) =>
    `$${Math.abs(x).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  it('states every asserted number and names the personas', () => {
    const readme = readFileSync(fileURLToPath(new URL('./README.md', import.meta.url)), 'utf8')
    const facts = [
      money(st.s1.ytdActual),
      money(st.s1.ytdBudget),
      money(st.s1.fyForecast),
      money(st.s1.fyBudget),
      money(st.s1.fyVariance),
      money(st.s2.fyForecast),
      money(st.s2.fyBudget),
      money(st.s2.fyVariance),
      money(st.s2.ytdActual),
      money(st.s2.ytdBudget),
      '$902,391 over the six closes',
      '3% vacancy allowance',
      money(st.s5.munich.fx),
      money(st.s5.haifa.fx),
      money(st.s5.munich.fyVariance),
      money(st.s5.haifa.fyVariance),
      money(st.s9.routing.check.target!.cost!),
      money(st.s9.routing.check.target!.cost! - st.s9.routing.check.asks.cost!),
      money(st.s9.routing.check.effect.cost),
      '$174,000',
      '$295,976.60',
      '$48,115.20',
      '₹4,009,600',
      '$288,691.20',
      '17,010',
      '2,765',
      '6.1514',
      sample.locks.budget.hash,
      sample.locks.q1.hash,
    ]
    for (const f of facts) expect(readme, f).toContain(f)
    for (const m of st.s5.munich.fxMonths.slice(0, 6)) expect(readme, m.month).toContain(`€${fmt(m.local)}`)
    for (const m of st.s5.haifa.fxMonths.slice(0, 6)) expect(readme, m.month).toContain(`₪${fmt(m.local)}`)
    for (const p of sample.personas) expect(readme, p.key).toContain(p.name)
    expect(readme.toLowerCase()).not.toContain('cen' + 'sus')
    expect(readme).not.toMatch(/tamper.?proof/i)
    expect(readme.includes('!')).toBe(false)
  })
})

const fmt = (x: number) => x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/* ───────────────────────── Plan > Hiring by independent code (docs/PLAN.md 9.7, C36, C37) ───────────────────────── */

/**
 * Plan > Hiring recomputed from the raw rows with code of its own, never src/plan/engine/hiring.ts nor
 * the tab's input (src/views/plan/engine/hiringData.ts): each scope from the position rows and the
 * assignments, the approved seats on the as-of date (R1, from the rows in effect, the assignments
 * and the reqs), current heads with their split, future starts (signed offers, C37), moves in (C37:
 * none on the sample), open to hire by quarter end, hires and exits by closed month, heads at each
 * closed month-end, the paces, attrition and months to close, the months ahead's future starts by
 * start month, and the hires of the last 3 closed months by the department and location of the seat
 * on the hire date (C37). Only the forecast's modeled exits are the forecast's own (6.7's cohort
 * model is not redone here); the check reads them from the forecast view's months and holds their
 * sum to the tab's.
 */
const HG_FY_END: ISODate = '2027-03-31'
/** The last close (asserted): history is every quarter ending on or before its month-end (H1). */
const HG_LAST_CLOSE: Month = '2026-09'
/** The trailing 12 closed months, oldest first. */
const HG_TRAILING = monthsBetween('2025-10', HG_LAST_CLOSE)
/** The fiscal year's open months, after the last close. */
const HG_OPEN = monthsBetween('2026-10', '2027-03')
/** The last 3 closed months: the recent hires table's columns (C37). */
const HG_RECENT = HG_TRAILING.slice(-3)
const HG_QUARTERS = [
  { key: 'q1', start: '2026-04-01', end: '2026-06-30' },
  { key: 'q2', start: '2026-07-01', end: '2026-09-30' },
  { key: 'q3', start: '2026-10-01', end: '2026-12-31' },
  { key: 'q4', start: '2027-01-01', end: '2027-03-31' },
] as const

const hgStart = (w: WorkerRow): ISODate => w.assignmentStart || w.hireDate
/** An assignment's last day: the earlier of its end and the person's last day. */
const hgEnd = (w: WorkerRow): ISODate | null => {
  const a = w.assignmentEnd || null
  const t = w.terminationDate || null
  return a && t ? (a < t ? a : t) : (a ?? t)
}
/** Active on a day, the last day counted (6.1). */
const hgActive = (w: WorkerRow, d: string): boolean => {
  const e = hgEnd(w)
  return hgStart(w) <= d && (e == null || e >= d)
}
const hgEmployee = (w: WorkerRow) => (w.workerType || 'Employee') === 'Employee'

/** Each position's rows, oldest first. */
function hgRows(d: Datasets): Map<string, PositionRow[]> {
  const out = new Map<string, PositionRow[]>()
  for (const r of d.positions) out.set(r.positionId, [...(out.get(r.positionId) ?? []), r])
  for (const list of out.values()) list.sort((a, b) => (a.effectiveDate < b.effectiveDate ? -1 : 1))
  return out
}
const hgRowOn = (rows: readonly PositionRow[], d: string): PositionRow | null => {
  let hit: PositionRow | null = null
  for (const r of rows) if (r.effectiveDate <= d) hit = r
  return hit
}

/** A scope: its positions (as of the as-of date) and its people (employees, current and former). */
interface HgScope {
  positions: Set<string>
  people: Set<string>
}

/** A unit: positions whose row on the as-of date (else their first) names it; its seats' people and its people not in plan. */
function hgUnit(d: Datasets, unit: string): HgScope {
  const positions = new Set<string>()
  for (const [id, list] of hgRows(d))
    if ((hgRowOn(list, AS_OF) ?? list[0]).businessUnit === unit) positions.add(id)
  const people = new Set<string>()
  for (const w of d.workers)
    if (hgEmployee(w) && (w.positionId ? positions.has(w.positionId) : w.businessUnit === unit))
      people.add(w.employeeId)
  return { positions, people }
}

/**
 * A tree: the positions strictly below a person's own seats (R23), through the managers of the rows
 * on the as-of date; its seats' people and the people not in plan who report to someone in it or to
 * the person, never the person.
 */
function hgTree(d: Datasets, personId: string): HgScope {
  const place = new Map([...hgRows(d)].map(([id, list]) => [id, hgRowOn(list, AS_OF) ?? list[0]]))
  const own = new Set(
    d.workers
      .filter((w) => w.employeeId === personId && w.positionId && hgActive(w, AS_OF))
      .map((w) => w.positionId as string),
  )
  const positions = new Set<string>()
  for (const id of place.keys()) {
    if (own.has(id)) continue
    const seen = new Set<string>([id])
    for (let up = place.get(id)?.managerPositionId ?? null; up && !seen.has(up); ) {
      if (own.has(up)) {
        positions.add(id)
        break
      }
      seen.add(up)
      up = place.get(up)?.managerPositionId ?? null
    }
  }
  const holds = new Set<string>()
  for (const w of d.workers)
    if (w.positionId && hgActive(w, AS_OF) && (positions.has(w.positionId) || own.has(w.positionId)))
      holds.add(w.employeeId)
  const people = new Set<string>()
  for (const w of d.workers)
    if (hgEmployee(w) && w.employeeId !== personId)
      if (w.positionId ? positions.has(w.positionId) : !!w.managerId && holds.has(w.managerId))
        people.add(w.employeeId)
  return { positions, people }
}

const hgCompany = (d: Datasets): HgScope => ({
  positions: new Set(d.positions.map((p) => p.positionId)),
  people: new Set(d.workers.filter(hgEmployee).map((w) => w.employeeId)),
})

/** An approved seat on the as-of date (R1) and its first head day (H2). */
interface HgSeat {
  positionId: string
  filled: boolean
  /** The accepted offer nobody has started on: its req and agreed first day. */
  offer: { reqId: string; start: ISODate } | null
  firstHeadDay: ISODate
}

/**
 * The scope's approved seats on the as-of date, read from the rows: Filled (an Employee holds it,
 * and no approved internal move holds it: an On hold row from a request with its holder still on
 * it, SC-6), or Open or Planned Employee seats whose planned start is blank or on or before the
 * fiscal year end. A seat's planned start is its pending accepted offer's start, else its row's
 * start (unless the seat is Open after an exit), else its latest open req's target start, else its
 * latest approved Backfill's start. Eliminated and On hold seats are out.
 */
function hgSeats(d: Datasets, scope: HgScope): HgSeat[] {
  const rows = hgRows(d)
  const byPos = new Map<string, WorkerRow[]>()
  for (const w of d.workers)
    if (w.positionId && hgEmployee(w)) byPos.set(w.positionId, [...(byPos.get(w.positionId) ?? []), w])
  const reqsOf = new Map<string, ReqRow[]>()
  for (const r of d.reqs) if (r.positionId) reqsOf.set(r.positionId, [...(reqsOf.get(r.positionId) ?? []), r])
  const out: HgSeat[] = []
  for (const id of [...scope.positions].sort()) {
    const row = hgRowOn(rows.get(id) ?? [], AS_OF)
    if (!row || row.status === 'Eliminated') continue
    const held = byPos.get(id) ?? []
    if (held.some((w) => hgActive(w, AS_OF))) {
      if (!(row.status === 'On hold' && row.sourceRequestId))
        out.push({ positionId: id, filled: true, offer: null, firstHeadDay: AS_OF })
      continue
    }
    const status = row.status === 'Filled' ? 'Open' : row.status
    if ((status !== 'Open' && status !== 'Planned') || (row.workerType || 'Employee') !== 'Employee') continue
    const reqs = reqsOf.get(id) ?? []
    const startedSince = (from: string) => held.some((w) => hgStart(w) >= from && hgStart(w) <= AS_OF)
    const pending = reqs
      .filter((r) => r.status !== 'Cancelled' && (r.stage === 'Offer accepted' || r.stage === 'Started'))
      .filter((r) => !!r.startDate && !startedSince(r.offerAcceptedDate || r.openedDate))
      .sort((a, b) =>
        (a.offerAcceptedDate || a.openedDate) < (b.offerAcceptedDate || b.openedDate) ? -1 : 1,
      )
      .at(-1)
    let planned: ISODate | null = null
    if (pending) planned = pending.startDate as ISODate
    else {
      const lastEnd = held
        .map(hgEnd)
        .filter((e): e is ISODate => !!e && e < AS_OF)
        .sort()
        .at(-1)
      const afterExit = row.status === 'Filled' || (!!lastEnd && row.effectiveDate <= lastEnd)
      if (!afterExit && row.startDate) planned = row.startDate
      else {
        const req = reqs
          .filter((r) => (r.status === 'Open' || r.status === 'On hold') && r.stage !== 'Offer accepted')
          .filter((r) => r.stage !== 'Started' && !!r.targetStartDate && !startedSince(r.openedDate))
          .sort((a, b) => (a.openedDate < b.openedDate ? -1 : a.openedDate > b.openedDate ? 1 : 0))
          .at(-1)
        const backfill = d.requests
          .filter(
            (q) => q.type === 'Backfill' && q.state === 'Approved' && q.positionId === id && !!q.startDate,
          )
          .filter((q) => !startedSince((q.submittedAt || q.updatedAt || '').slice(0, 10)))
          .sort((a, b) =>
            (a.submittedAt || a.updatedAt || '') < (b.submittedAt || b.updatedAt || '') ? -1 : 1,
          )
          .at(-1)
        planned = (req?.targetStartDate as ISODate | undefined) ?? (backfill?.startDate as ISODate) ?? null
      }
    }
    if (planned && planned > HG_FY_END) continue
    const offer =
      pending?.stage === 'Offer accepted'
        ? { reqId: pending.reqId, start: pending.startDate as ISODate }
        : null
    out.push({ positionId: id, filled: false, offer, firstHeadDay: offer?.start ?? planned ?? AS_OF })
  }
  return out
}

interface HgAhead {
  approved: number
  accepted: number
  open: number
  openSeats: string[]
  newToHire: number
  known: number
  modeled: number
  exits: number
  toReach: number
  monthsLeft: number
  needed: number | null
  behindBy: number | null
}
interface HgHistory {
  actualHeads: number
  hires: number
  exits: number
}
interface HgMonth {
  month: Month
  hires: number
  exits: number
  heads: number
}
/** The hires of the last 3 closed months by department and location (C37): each key's counts by month. */
interface HgRecent {
  /** "department|location" with a hire. */
  pairs: Map<string, number[]>
  departments: Map<string, number[]>
  locations: Map<string, number[]>
  total: number[]
}
interface Hg {
  heads: { total: number; inApproved: number; notInPlan: number; elsewhere: number; onLeave: number }
  approvedNow: number
  openNow: number
  history: Record<'q1' | 'q2', HgHistory>
  ahead: Record<'q3' | 'q4', HgAhead>
  months: HgMonth[]
  /** The months ahead: future starts (signed offers by start month, C37) as hires, known plus modeled exits as exits. */
  forecastMonths: { month: Month; hires: number; exits: number }[]
  /** Approved internal moves into the scope that have not started, by the year end (C37). */
  movesIn: number
  recent: HgRecent
  paces: {
    hires3: number
    hires6: number
    exits3: number
    exits6: number
    net3: number
    net6: number
    exits12: number
    averageHeads12: number
    attrition: number | null
  }
  openFyEnd: number
  acceptedToCome: number
  /** Months to close (H9): 0 with nothing open, null when the net pace is 0 or below. */
  monthsToClose: number | null
  seats: HgSeat[]
}

/** The forecast's flows for a context, by month: starts and modeled exits (heads only). */
type HgFlows = ReadonlyMap<Month, { starts: number; knownExits: number; modeledExits: number }>

/** Plan > Hiring for a scope, from the raw rows (see the section comment). */
function hgCompute(d: Datasets, scope: HgScope, flows: HgFlows): Hg {
  const seats = hgSeats(d, scope)
  const approvedIds = new Set(seats.map((x) => x.positionId))
  // Current heads: one per person active on the as-of date, the latest assignment to start.
  const people = new Map<string, WorkerRow>()
  for (const w of d.workers) {
    if (!hgEmployee(w) || !scope.people.has(w.employeeId) || !hgActive(w, AS_OF)) continue
    const cur = people.get(w.employeeId)
    if (!cur || hgStart(w) >= hgStart(cur)) people.set(w.employeeId, w)
  }
  const heads = { total: people.size, inApproved: 0, notInPlan: 0, elsewhere: 0, onLeave: 0 }
  for (const w of people.values()) {
    if (w.onLeave) heads.onLeave++
    if (!w.positionId) heads.notInPlan++
    else if (approvedIds.has(w.positionId)) heads.inApproved++
    else heads.elsewhere++
  }
  const H = heads.total
  const A = (end: string) => seats.filter((x) => x.firstHeadDay <= end).length
  const startsBy = (x: HgSeat, end: string) => !!x.offer && x.offer.start > AS_OF && x.offer.start <= end
  const S = (end: string) => seats.filter((x) => startsBy(x, end)).length
  // Moves into the scope that have not started (C37): an assignment in a seat in scope dated after
  // the as-of date that is no hire, of someone employed on the as-of date, and an approved move the
  // HRIS has not recorded (a held seat's On hold row with the receiving seat's Filled row, from one
  // request). They are their own term, M(q).
  // Where each employee sits on the as-of date (null: not in plan).
  const seatNow = new Map<string, string | null>()
  for (const w of d.workers)
    if (hgEmployee(w) && hgActive(w, AS_OF)) seatNow.set(w.employeeId, w.positionId || null)
  const outside = (id: string) => {
    const at = seatNow.get(id)
    return at !== undefined && !(at && scope.positions.has(at))
  }
  const moveDays = d.workers
    .filter(
      (w) =>
        hgEmployee(w) &&
        !!w.positionId &&
        scope.positions.has(w.positionId) &&
        hgStart(w) > AS_OF &&
        hgStart(w) !== w.hireDate &&
        outside(w.employeeId),
    )
    .map((w) => hgStart(w))
  const heldByRequest = new Set(
    d.positions.filter((r) => r.status === 'On hold' && !!r.sourceRequestId).map((r) => r.sourceRequestId),
  )
  for (const r of d.positions)
    if (
      r.status === 'Filled' &&
      r.sourceRequestId &&
      heldByRequest.has(r.sourceRequestId) &&
      scope.positions.has(r.positionId)
    )
      if (r.effectiveDate > AS_OF) moveDays.push(r.effectiveDate)
  const M = (end: string) => moveDays.filter((x) => x <= end).length
  const O = (end: string) => A(end) - H - S(end) - M(end)
  // Hires into a seat in scope (the row whose assignment starts on the hire date) and exits from one
  // (the row that holds the last day): internal moves are neither (H14).
  const hireRows = d.workers.filter(
    (w) => hgEmployee(w) && !!w.positionId && scope.positions.has(w.positionId) && hgStart(w) === w.hireDate,
  )
  const exitRows = d.workers.filter(
    (w) =>
      hgEmployee(w) &&
      !!w.terminationDate &&
      !!w.positionId &&
      scope.positions.has(w.positionId) &&
      hgEnd(w) === w.terminationDate,
  )
  const lastDay = (w: WorkerRow) => w.terminationDate as ISODate
  const inSpan = (v: string, from: string, to: string) => v >= from && v <= to
  // The last 3 closed months' hires by the department and location of the seat on the hire date.
  const rowsOf = hgRows(d)
  const recent: HgRecent = {
    pairs: new Map(),
    departments: new Map(),
    locations: new Map(),
    total: [0, 0, 0],
  }
  const bump = (map: Map<string, number[]>, key: string, i: number) => {
    const list = map.get(key) ?? [0, 0, 0]
    list[i]++
    map.set(key, list)
  }
  for (const w of hireRows) {
    const i = HG_RECENT.indexOf(w.hireDate.slice(0, 7) as Month)
    if (i < 0) continue
    const list = rowsOf.get(w.positionId as string) ?? []
    const row = hgRowOn(list, w.hireDate) ?? list[0]
    const dept = row?.department || 'No department'
    const loc = row?.location || 'No location'
    bump(recent.pairs, `${dept}|${loc}`, i)
    bump(recent.departments, dept, i)
    bump(recent.locations, loc, i)
    recent.total[i]++
  }
  const headsAt = (day: string) => {
    const ids = new Set<string>()
    for (const w of d.workers)
      if (hgEmployee(w) && hgActive(w, day))
        if (w.positionId ? scope.positions.has(w.positionId) : scope.people.has(w.employeeId))
          ids.add(w.employeeId)
    return ids.size
  }
  const months = HG_TRAILING.map((month) => ({
    month,
    hires: hireRows.filter((w) => w.hireDate.slice(0, 7) === month).length,
    exits: exitRows.filter((w) => lastDay(w).slice(0, 7) === month).length,
    heads: headsAt(monthEnd(month)),
  }))
  const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
  const lastN = (n: number, k: 'hires' | 'exits') => mean(months.slice(-n).map((m) => m[k]))
  const exits12 = months.reduce((a, m) => a + m.exits, 0)
  const averageHeads12 = mean(months.map((m) => m.heads))
  const paces = {
    hires3: lastN(3, 'hires'),
    hires6: lastN(6, 'hires'),
    exits3: lastN(3, 'exits'),
    exits6: lastN(6, 'exits'),
    net3: lastN(3, 'hires') - lastN(3, 'exits'),
    net6: lastN(6, 'hires') - lastN(6, 'exits'),
    exits12,
    averageHeads12,
    attrition: averageHeads12 > 0 ? exits12 / averageHeads12 : null,
  }
  const known = (end: string) => exitRows.filter((w) => lastDay(w) > AS_OF && lastDay(w) <= end).length
  const modeled = (end: string) =>
    HG_OPEN.filter((m) => monthEnd(m) <= end).reduce((a, m) => a + (flows.get(m)?.modeledExits ?? 0), 0)
  const approvedNow = A(AS_OF)
  const openNow = approvedNow - H
  const history = {} as Record<'q1' | 'q2', HgHistory>
  const ahead = {} as Record<'q3' | 'q4', HgAhead>
  let before = openNow
  for (const q of HG_QUARTERS) {
    if (q.end <= monthEnd(HG_LAST_CLOSE)) {
      history[q.key as 'q1' | 'q2'] = {
        actualHeads: headsAt(q.end),
        hires: hireRows.filter((w) => inSpan(w.hireDate, q.start, q.end)).length,
        exits: exitRows.filter((w) => inSpan(lastDay(w), q.start, q.end)).length,
      }
      continue
    }
    const open = O(q.end)
    const exits = known(q.end) + modeled(q.end)
    const monthsLeft = HG_OPEN.filter((m) => monthEnd(m) > AS_OF && monthEnd(m) <= q.end).length
    const toReach = open + exits
    const needed = monthsLeft ? toReach / monthsLeft : null
    ahead[q.key as 'q3' | 'q4'] = {
      approved: A(q.end),
      accepted: S(q.end),
      open,
      openSeats: seats
        .filter((x) => !x.filled && x.firstHeadDay <= q.end && !startsBy(x, q.end))
        .map((x) => x.positionId),
      newToHire: open - before,
      known: known(q.end),
      modeled: modeled(q.end),
      exits,
      toReach,
      monthsLeft,
      needed,
      behindBy: needed !== null && toReach > 0 && paces.hires3 < needed ? needed - paces.hires3 : null,
    }
    before = open
  }
  const openFyEnd = O(HG_FY_END)
  return {
    heads,
    approvedNow,
    openNow,
    history,
    ahead,
    months,
    forecastMonths: HG_OPEN.map((month) => ({
      month,
      // Future starts: the signed offers starting in the month (whole people), never the forecast's starts.
      hires: seats.filter((x) => !!x.offer && x.offer.start > AS_OF && x.offer.start.slice(0, 7) === month)
        .length,
      exits:
        exitRows.filter((w) => lastDay(w).slice(0, 7) === month).length +
        (flows.get(month)?.modeledExits ?? 0),
    })),
    movesIn: M(HG_FY_END),
    recent,
    paces,
    openFyEnd,
    acceptedToCome: S(HG_FY_END),
    monthsToClose: openFyEnd <= 0 ? 0 : paces.net3 > 0 ? openFyEnd / paces.net3 : null,
    seats,
  }
}

/**
 * The forecast's months for a context (heads only): the Forecast view's own run, and in Manager mode
 * the run Plan > Hiring reads, with the tree's seats in a cohort of their own (review HP-1).
 */
function hgFlows(ctx: AnalyticsContext): HgFlows {
  const out = new Map<Month, { starts: number; knownExits: number; modeledExits: number }>()
  const fp =
    ctx.access.mode === 'manager' ? hiringForecast(ctx, preparePlan(ctx).scope.ids) : prepareForecast(ctx)
  for (const [m, f] of forecastFlows(fp))
    out.set(m, { starts: f.starts, knownExits: f.knownExits, modeledExits: f.modeledExits })
  return out
}

/**
 * The pinned numbers, worked by hand from the rows (sample/README.md has none of them; this table is
 * their record): history quarters Q1 and Q2 (actual heads at the quarter end, hires, exits), the
 * quarters ahead Q3 and Q4 (approved heads by the quarter end, accepted starts, open to hire, new to
 * hire, known and modeled exits, months left), current heads with its split, the trailing 12 closed
 * months' hires, exits and month-end heads, and the paces. Modeled exits are the forecast's, to 6
 * decimals.
 */
const HG_PINS = {
  'hrbp-se': {
    heads: { total: 556, inApproved: 556, notInPlan: 0, elsewhere: 0, onLeave: 7 },
    approvedNow: 566,
    history: { q1: [551, 14, 9], q2: [556, 13, 8] },
    ahead: { q3: [590, 9, 25, 15, 0, 11.67899, 3], q4: [604, 9, 39, 14, 0, 23.75296, 6] },
    hires: [9, 3, 8, 5, 7, 7, 5, 7, 2, 2, 8, 3],
    exits: [1, 6, 5, 3, 1, 3, 5, 2, 2, 4, 3, 1],
    heads12: [534, 531, 534, 536, 542, 546, 546, 551, 551, 551, 554, 556],
    monthsToClose: 23.4,
    futureStarts: [3, 3, 3, 0, 0, 0],
    recent: {
      total: [2, 8, 3],
      pairs: 10,
      departments: {
        'Analog & Mixed-Signal': 3,
        Architecture: 1,
        DFT: 1,
        'Design Verification': 4,
        'Digital Design': 1,
        'Physical Design': 3,
      },
      locations: { Bengaluru: 3, 'Ho Chi Minh City': 1, Hsinchu: 1, Munich: 4, 'San Jose': 4 },
    },
  },
  'leader-svp-se': {
    heads: { total: 555, inApproved: 555, notInPlan: 0, elsewhere: 0, onLeave: 7 },
    approvedNow: 565,
    history: { q1: [550, 14, 9], q2: [555, 13, 8] },
    ahead: { q3: [589, 9, 25, 15, 0, 11.65836, 3], q4: [603, 9, 39, 14, 0, 23.71187, 6] },
    hires: [9, 3, 8, 5, 7, 7, 5, 7, 2, 2, 8, 3],
    exits: [1, 6, 5, 3, 1, 3, 5, 2, 2, 4, 3, 1],
    heads12: [533, 530, 533, 535, 541, 545, 545, 550, 550, 550, 553, 555],
    monthsToClose: 23.4,
    futureStarts: [3, 3, 3, 0, 0, 0],
    recent: {
      total: [2, 8, 3],
      pairs: 10,
      departments: {
        'Analog & Mixed-Signal': 3,
        Architecture: 1,
        DFT: 1,
        'Design Verification': 4,
        'Digital Design': 1,
        'Physical Design': 3,
      },
      locations: { Bengaluru: 3, 'Ho Chi Minh City': 1, Hsinchu: 1, Munich: 4, 'San Jose': 4 },
    },
  },
  'finance-fpa': {
    heads: { total: 1456, inApproved: 1450, notInPlan: 6, elsewhere: 0, onLeave: 20 },
    approvedNow: 1475,
    history: { q1: [1443, 39, 35], q2: [1456, 39, 31] },
    ahead: { q3: [1567, 22, 89, 70, 8, 32.62154, 3], q4: [1610, 22, 132, 43, 8, 71.93389, 6] },
    hires: [19, 14, 18, 15, 15, 22, 13, 12, 14, 11, 19, 9],
    exits: [11, 14, 13, 13, 11, 7, 11, 11, 13, 14, 12, 5],
    heads12: [1416, 1412, 1417, 1419, 1423, 1438, 1440, 1441, 1443, 1447, 1452, 1456],
    monthsToClose: 49.5,
    futureStarts: [8, 8, 6, 0, 0, 0],
    recent: {
      total: [11, 19, 9],
      pairs: 31,
      departments: {
        'Analog & Mixed-Signal': 3,
        Architecture: 1,
        DFT: 1,
        'Design Verification': 4,
        'Digital Design': 1,
        'Field Applications': 1,
        Firmware: 1,
        'Hardware Engineering': 2,
        'Physical Design': 3,
        'Product Marketing': 4,
        'Quality & Reliability': 2,
        Sales: 5,
        Software: 4,
        'Supply Chain': 3,
        'Systems Validation': 2,
        'Test & Product Engineering': 2,
      },
      locations: {
        Austin: 3,
        Bengaluru: 5,
        'Ho Chi Minh City': 1,
        Hsinchu: 3,
        Munich: 4,
        'San Jose': 15,
        Seattle: 1,
        Shanghai: 6,
        Toronto: 1,
      },
    },
  },
  'manager-a': {
    heads: { total: 7, inApproved: 7, notInPlan: 0, elsewhere: 0, onLeave: 0 },
    approvedNow: 8,
    history: { q1: [7, 0, 0], q2: [7, 0, 0] },
    ahead: { q3: [9, 0, 2, 1, 0, 0.270267, 3], q4: [9, 0, 2, 0, 0, 0.591824, 6] },
    hires: Array(12).fill(0),
    exits: Array(12).fill(0),
    heads12: Array(12).fill(7),
    monthsToClose: null,
    futureStarts: [0, 0, 0, 0, 0, 0],
    recent: { total: [0, 0, 0], pairs: 0, departments: {}, locations: {} },
  },
} as const
type HgCase = keyof typeof HG_PINS
/** The four scopes 9.7 names, and Managers B and C (My team's check, and Plan > Recruiting summary's). */
type HgKey = HgCase | 'manager-b' | 'manager-c'

/** Each persona's scope, from the raw rows. */
const HG_SCOPE_OF: Record<HgKey, (d: Datasets) => HgScope> = {
  'hrbp-se': (d) => hgUnit(d, SILICON),
  'leader-svp-se': (d) => hgTree(d, personaOf(sample, 'leader-svp-se').employeeId),
  'finance-fpa': hgCompany,
  'manager-a': (d) => hgTree(d, personaOf(sample, 'manager-a').employeeId),
  'manager-b': (d) => hgTree(d, personaOf(sample, 'manager-b').employeeId),
  'manager-c': (d) => hgTree(d, personaOf(sample, 'manager-c').employeeId),
}

/** A persona's context, scope, forecast months and Plan > Hiring by independent code. */
interface HgRun {
  ctx: AnalyticsContext
  scope: HgScope
  mine: Hg
  flows: HgFlows
}

const hgRuns = new Map<HgKey, HgRun>()

/** One run per persona for the file: Plan > Hiring's and Plan > Recruiting summary's checks read the same. */
function hgRunOf(key: HgKey): HgRun {
  let r = hgRuns.get(key)
  if (!r) {
    const ctx = personaCtx(key, { sample })
    const scope = HG_SCOPE_OF[key](data)
    const flows = hgFlows(ctx)
    r = { ctx, scope, mine: hgCompute(data, scope, flows), flows }
    hgRuns.set(key, r)
  }
  return r
}

describe('Plan > Hiring on the sample, by independent code (9.7, C36)', () => {
  const CASES: { key: HgCase; who: string }[] = [
    { key: 'hrbp-se', who: 'Silicon Engineering (HRBP)' },
    { key: 'leader-svp-se', who: "Chun-Hsien Kuo's org (Leader)" },
    { key: 'finance-fpa', who: 'the whole company (Finance)' },
    { key: 'manager-a', who: "Sebastian Wagner's team (Manager)" },
  ]
  const run = new Map<string, HgRun>()
  const of = (key: string) => run.get(key) as HgRun

  beforeAll(() => {
    for (const key of [...CASES.map((c) => c.key), 'manager-b' as const, 'manager-c' as const])
      run.set(key, hgRunOf(key))
  }, 300_000)

  it('reads the four scopes 9.7 names, at 30 Sep 2026 with September the last close', () => {
    expect(sample.plan.closes.map((c) => c.month).at(-1)).toBe(HG_LAST_CLOSE)
    expect(HG_QUARTERS.map((q) => q.key)).toEqual([...QUARTER_KEYS])
    expect([
      of('hrbp-se').ctx.scopeLabel,
      of('leader-svp-se').ctx.scopeLabel,
      of('finance-fpa').ctx.scopeLabel,
      of('manager-a').ctx.scopeLabel,
    ]).toEqual([SILICON, "Chun-Hsien Kuo's org", 'Whole company', "Sebastian Wagner's team"])
    for (const c of CASES) {
      expect(of(c.key).ctx.asOf, c.who).toBe(AS_OF)
      expect(of(c.key).ctx.version?.versionId, c.who).toBe(FY27_WORKING)
    }
  })

  it("derives each scope from the raw rows as the mode's context holds it", () => {
    for (const [key, { ctx, scope }] of run) {
      expect([...new Set(ctx.data.positions.map((p) => p.positionId))].sort(), key).toEqual(
        [...scope.positions].sort(),
      )
      expect([...new Set(ctx.data.workers.filter(hgEmployee).map((w) => w.employeeId))].sort(), key).toEqual(
        [...scope.people].sort(),
      )
    }
  })

  it('pins every row of the quarter table and the paces', () => {
    for (const c of CASES) {
      const { mine } = of(c.key)
      const pin = HG_PINS[c.key]
      expect(mine.heads, c.who).toEqual(pin.heads)
      expect(mine.approvedNow, c.who).toBe(pin.approvedNow)
      expect(mine.openNow, c.who).toBe(pin.approvedNow - pin.heads.total)
      for (const k of ['q1', 'q2'] as const) {
        const h = mine.history[k]
        expect([h.actualHeads, h.hires, h.exits], `${c.who} ${k}`).toEqual(pin.history[k])
      }
      for (const k of ['q3', 'q4'] as const) {
        const a = mine.ahead[k]
        const [approved, accepted, open, newToHire, known, modeled, monthsLeft] = pin.ahead[k]
        expect([a.approved, a.accepted, a.open, a.newToHire, a.known, a.monthsLeft], `${c.who} ${k}`).toEqual(
          [approved, accepted, open, newToHire, known, monthsLeft],
        )
        expect(a.modeled, `${c.who} ${k} modeled`).toBeCloseTo(modeled, 4)
        // The user's formula, and the reconciliations 9.7 gives it (no move in on the sample, C37).
        expect(a.open, `${c.who} ${k}`).toBe(a.approved - mine.heads.total - a.accepted)
        expect(a.open, `${c.who} ${k}`).toBe(a.openSeats.length - mine.heads.notInPlan - mine.heads.elsewhere)
        expect(a.exits, `${c.who} ${k}`).toBe(a.known + a.modeled)
        expect(a.toReach, `${c.who} ${k}`).toBe(a.open + a.exits)
        expect(a.needed, `${c.who} ${k}`).toBe(a.toReach / a.monthsLeft)
      }
      expect(mine.ahead.q3.newToHire + mine.ahead.q4.newToHire, c.who).toBe(mine.openFyEnd - mine.openNow)
      expect(mine.openFyEnd, c.who).toBe(mine.ahead.q4.open)
      expect(mine.acceptedToCome, c.who).toBe(mine.ahead.q4.accepted)
      expect(
        mine.months.map((m) => m.hires),
        c.who,
      ).toEqual([...pin.hires])
      expect(
        mine.months.map((m) => m.exits),
        c.who,
      ).toEqual([...pin.exits])
      expect(
        mine.months.map((m) => m.heads),
        c.who,
      ).toEqual([...pin.heads12])
      // The paces: the last 3 and 6 closed months; attrition over the last 12 against their heads.
      const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0)
      const p = mine.paces
      expect(p.hires3, c.who).toBe(sum(pin.hires.slice(-3)) / 3)
      expect(p.hires6, c.who).toBe(sum(pin.hires.slice(-6)) / 6)
      expect(p.exits3, c.who).toBe(sum(pin.exits.slice(-3)) / 3)
      expect(p.exits6, c.who).toBe(sum(pin.exits.slice(-6)) / 6)
      expect(p.net3, c.who).toBe(p.hires3 - p.exits3)
      expect(p.exits12, c.who).toBe(sum(pin.exits))
      expect(p.averageHeads12, c.who).toBe(sum(pin.heads12) / 12)
      expect(p.attrition, c.who).toBe(sum(pin.exits) / (sum(pin.heads12) / 12))
      if (pin.monthsToClose === null) expect(mine.monthsToClose, c.who).toBeNull()
      else expect(mine.monthsToClose, c.who).toBeCloseTo(pin.monthsToClose, 9)
      // C37: the months ahead's future starts, whole people, add up to the future starts by the year end.
      expect(
        mine.forecastMonths.map((m) => m.hires),
        c.who,
      ).toEqual([...pin.futureStarts])
      expect(sum(pin.futureStarts), c.who).toBe(mine.acceptedToCome)
      // No move into any of the four scopes on the sample: M(q) is 0, so O(q) = A(q) − H − S(q).
      expect(mine.movesIn, c.who).toBe(0)
      // The last 3 closed months' hires by department and location: the totals are those months'
      // hires, and the sub-totals add up both ways.
      const r = mine.recent
      expect(r.total, c.who).toEqual([...pin.recent.total])
      expect(r.total, c.who).toEqual(pin.hires.slice(-3))
      expect(r.pairs.size, c.who).toBe(pin.recent.pairs)
      expect(Object.fromEntries([...r.departments].map(([k, v]) => [k, sum(v)])), c.who).toEqual(
        pin.recent.departments,
      )
      expect(Object.fromEntries([...r.locations].map(([k, v]) => [k, sum(v)])), c.who).toEqual(
        pin.recent.locations,
      )
      for (const map of [r.departments, r.locations])
        for (const i of [0, 1, 2])
          expect(
            [...map.values()].reduce((a, v) => a + v[i], 0),
            c.who,
          ).toBe(r.total[i])
    }
    // Every quarter ahead is behind its needed pace at the 3-month hiring pace, by the gap (H7).
    for (const c of CASES)
      for (const k of ['q3', 'q4'] as const) {
        const a = of(c.key).mine.ahead[k]
        expect(a.behindBy, `${c.who} ${k}`).toBe((a.needed as number) - of(c.key).mine.paces.hires3)
      }
  })

  it('is what Plan > Hiring shows: the quarter table, the bars, the velocity chart and the tiles', () => {
    for (const c of CASES) {
      const { ctx, mine } = of(c.key)
      const m = planHiringModel(ctx)
      expect(m.fiscalYear, c.who).toBe('FY27')
      const row = (key: string) => m.quarters.rows.find((r) => r.key === key)
      const cells = (key: string) => {
        const r = row(key)
        return r ? [r.q1, r.q2, r.q3, r.q4] : null
      }
      const { q1, q2 } = mine.history
      const { q3, q4 } = mine.ahead
      const H = mine.heads.total
      expect(cells('approved'), c.who).toEqual([null, null, q3.approved, q4.approved])
      expect(cells('current'), c.who).toEqual([q1.actualHeads, q2.actualHeads, H, H])
      expect(cells('accepted'), c.who).toEqual([null, null, q3.accepted, q4.accepted])
      expect(cells('open'), c.who).toEqual([null, null, q3.open, q4.open])
      expect(cells('new'), c.who).toEqual([null, null, q3.newToHire, q4.newToHire])
      expect(cells('hires'), c.who).toEqual([q1.hires, q2.hires, null, null])
      expect(cells('exitsActual'), c.who).toEqual([q1.exits, q2.exits, null, null])
      for (const [key, pick] of [
        ['exits', (a: HgAhead) => a.exits],
        ['toReach', (a: HgAhead) => a.toReach],
        ['needed', (a: HgAhead) => a.needed as number],
      ] as const) {
        const r = row(key)
        expect([r?.q1, r?.q2], `${c.who} ${key}`).toEqual([null, null])
        expect(r?.q3, `${c.who} ${key}`).toBeCloseTo(pick(q3), 9)
        expect(r?.q4, `${c.who} ${key}`).toBeCloseTo(pick(q4), 9)
      }
      // Behind by the gap at the 3-month pace, one decimal; no open to hire is negative, so no "Over by".
      expect(row('needed')?.notes, c.who).toEqual({
        q3: behindByText(formatAs(q3.behindBy, 'num1')),
        q4: behindByText(formatAs(q4.behindBy, 'num1')),
      })
      expect(row('open')?.notes, c.who).toEqual({})
      // The bars: closed quarters carry none.
      expect(
        m.openByQuarter.rows.map((r) => [r.key, r.kind, r.open]),
        c.who,
      ).toEqual([
        ['q1', 'history', null],
        ['q2', 'history', null],
        ['q3', 'ahead', q3.open],
        ['q4', 'ahead', q4.open],
      ])
      // Velocity: the 12 closed months, then the forecast's months to the year end.
      const v = m.velocity.rows
      expect(
        v.map((r) => [r.month, r.kind]),
        c.who,
      ).toEqual([
        ...mine.months.map((x) => [x.month, 'actual']),
        ...mine.forecastMonths.map((x) => [x.month, 'forecast']),
      ])
      expect(
        v.slice(0, 12).map((r) => [r.hires, r.exits, r.net]),
        c.who,
      ).toEqual(mine.months.map((x) => [x.hires, x.exits, x.hires - x.exits]))
      v.slice(12).forEach((r, i) => {
        const f = mine.forecastMonths[i]
        // Future starts are whole people: the count of signed offers, exactly (C37).
        expect(r.hires, `${c.who} ${r.month}`).toBe(f.hires)
        expect(r.exits, `${c.who} ${r.month}`).toBeCloseTo(f.exits, 9)
        expect(r.net, `${c.who} ${r.month}`).toBeCloseTo(f.hires - f.exits, 9)
      })
      // No move in: the quarter table has no Moves in row (it shows only when not 0, C37).
      expect(row('moves'), c.who).toBeUndefined()
      // Hires in the last 3 months, by location and department (C37), row for row.
      const rec = m.recent.rows
      expect(m.recentMonths, c.who).toEqual(HG_RECENT)
      const cellsOf = (kind: string) =>
        Object.fromEntries(
          rec
            .filter((x) => x.kind === kind)
            .map((x) => [
              kind === 'pair'
                ? `${x.department}|${x.location}`
                : kind === 'department'
                  ? x.department
                  : x.location,
              [x.m1, x.m2, x.m3],
            ]),
        )
      expect(cellsOf('pair'), c.who).toEqual(Object.fromEntries(mine.recent.pairs))
      expect(cellsOf('department'), c.who).toEqual(Object.fromEntries(mine.recent.departments))
      expect(cellsOf('location'), c.who).toEqual(Object.fromEntries(mine.recent.locations))
      const totalRow = rec.find((x) => x.kind === 'total')
      expect([totalRow?.m1, totalRow?.m2, totalRow?.m3], c.who).toEqual(mine.recent.total)
      // The total is the velocity's hires in those months.
      expect(mine.recent.total, c.who).toEqual(v.slice(9, 12).map((x) => x.hires))
      // The six tiles.
      const tile = (id: string) => m.kpis.find((k) => k.id === id)?.value
      expect(
        m.kpis.map((k) => k.id),
        c.who,
      ).toEqual([
        'hiring-open',
        'hiring-accepted',
        'hiring-pace',
        'hiring-exit-pace',
        'hiring-net-pace',
        'hiring-months-to-close',
      ])
      expect([tile('hiring-open'), tile('hiring-accepted')], c.who).toEqual([
        mine.openFyEnd,
        mine.acceptedToCome,
      ])
      expect(tile('hiring-pace'), c.who).toBeCloseTo(mine.paces.hires3, 9)
      expect(tile('hiring-exit-pace'), c.who).toBeCloseTo(mine.paces.exits3, 9)
      expect(tile('hiring-net-pace'), c.who).toBeCloseTo(mine.paces.net3, 9)
      if (mine.monthsToClose === null) expect(tile('hiring-months-to-close'), c.who).toBeNull()
      else expect(tile('hiring-months-to-close'), c.who).toBeCloseTo(mine.monthsToClose, 9)
    }
  })

  it("is what the engine computes from the tab's input: the split, the seat view, the 6-month paces and attrition", () => {
    for (const c of CASES) {
      const { ctx, mine } = of(c.key)
      const r = hiringOf(hiringInputOf(ctx))
      const t = r.table
      expect(t.heads.total, c.who).toBe(mine.heads.total)
      expect([t.heads.inApprovedSeats, t.heads.notInPlan, t.heads.elsewhere], c.who).toEqual([
        mine.heads.inApproved,
        mine.heads.notInPlan,
        mine.heads.elsewhere,
      ])
      expect(t.openNow, c.who).toBe(mine.openNow)
      expect([t.openFyEnd, t.acceptedToCome], c.who).toEqual([mine.openFyEnd, mine.acceptedToCome])
      expect(
        t.quarters.map((q) => q.kind),
        c.who,
      ).toEqual(['history', 'history', 'ahead', 'ahead'])
      for (const [i, k] of [
        [2, 'q3'],
        [3, 'q4'],
      ] as const) {
        const q = t.quarters[i]
        const a = mine.ahead[k]
        expect([...q.openSeatIds].sort(), `${c.who} ${k}`).toEqual([...a.openSeats].sort())
        expect(q.openSeats, `${c.who} ${k}`).toBe(a.openSeats.length)
        expect(q.expectedExits?.known, `${c.who} ${k}`).toBe(a.known)
        expect(q.expectedExits?.modeled, `${c.who} ${k}`).toBeCloseTo(a.modeled, 9)
        expect(q.monthsLeft, `${c.who} ${k}`).toBe(a.monthsLeft)
        expect(q.paceStatus, `${c.who} ${k}`).toBe('behind')
        expect(q.behindBy, `${c.who} ${k}`).toBeCloseTo(a.behindBy as number, 9)
        expect([...q.approvedIds].sort(), `${c.who} ${k}`).toEqual(
          mine.seats
            .filter((x) => x.firstHeadDay <= HG_QUARTERS[i].end)
            .map((x) => x.positionId)
            .sort(),
        )
      }
      const p = r.velocity.paces
      for (const k of ['hires3', 'hires6', 'exits3', 'exits6', 'net3', 'net6', 'averageHeads12'] as const)
        expect(p[k], `${c.who} ${k}`).toBeCloseTo(mine.paces[k], 9)
      expect(p.exits12, c.who).toBe(mine.paces.exits12)
      expect(p.attrition, c.who).toBeCloseTo(mine.paces.attrition as number, 12)
      if (mine.monthsToClose === null)
        expect(r.monthsToClose, c.who).toEqual({ closing: false, months: null })
      else {
        expect(r.monthsToClose.closing, c.who).toBe(true)
        expect(r.monthsToClose.months, c.who).toBeCloseTo(mine.monthsToClose, 9)
      }
    }
  })

  it('agrees with Plan > Openings: its openings are the open seats plus the accepted starts to come', () => {
    for (const c of CASES) {
      const { ctx, mine } = of(c.key)
      const openings = openingsOf(preparePlan(ctx)).list.map((o) => o.positionId)
      const offers = mine.seats.filter((x) => x.offer && x.offer.start > AS_OF && x.offer.start <= HG_FY_END)
      expect([...mine.ahead.q4.openSeats, ...offers.map((x) => x.positionId)].sort(), c.who).toEqual(
        [...openings].sort(),
      )
      expect(offers.length, c.who).toBe(mine.acceptedToCome)
      // Every accepted offer of the scope starts in Q3, so Q3's accepted starts are all of them.
      expect(mine.ahead.q3.accepted, c.who).toBe(mine.acceptedToCome)
    }
  })

  it('agrees with Plan > Overview: current heads are its actual heads, approved heads by Q4 end its approved heads', () => {
    for (const c of CASES) {
      const { ctx, mine } = of(c.key)
      const plan = planModel(ctx)
      const tile = (id: string) => plan.overview.kpis.find((k) => k.metricId === id)?.value
      expect(tile('plan.heads.actual'), c.who).toBe(mine.heads.total)
      expect(tile('plan.heads.approved'), c.who).toBe(mine.ahead.q4.approved)
      // Hires to date (April to the last close) are Plan > Openings' Hires YTD.
      const ytd = plan.openings.kpis.find((k) => k.metricId === 'plan.hires.ytd')?.value
      expect(ytd, c.who).toBe(mine.history.q1.hires + mine.history.q2.hires)
    }
    // Story 2's actual heads at 30 Sep, and the September close's company heads.
    expect(of('hrbp-se').mine.heads.total).toBe(st.s2.actualHeads)
    expect(of('finance-fpa').mine.heads.total).toBe(1_456)
  })

  it("agrees with the forecast: expected exits by quarter end, its months to the year end and the closed months' flows", () => {
    for (const c of CASES) {
      const { mine, flows } = of(c.key)
      // The as-of date is a month-end, so known + modeled exits are the forecast's own over the same months (H5).
      for (const k of ['q3', 'q4'] as const) {
        const end = HG_QUARTERS.find((q) => q.key === k)?.end as string
        const months = HG_OPEN.filter((m) => monthEnd(m) <= end)
        const known = months.reduce((a, m) => a + (flows.get(m)?.knownExits ?? 0), 0)
        const modeled = months.reduce((a, m) => a + (flows.get(m)?.modeledExits ?? 0), 0)
        expect(mine.ahead[k].known, `${c.who} ${k}`).toBe(known)
        expect(mine.ahead[k].exits, `${c.who} ${k}`).toBeCloseTo(known + modeled, 9)
      }
      // The closed months the forecast reads as actuals (April to September): its starts are the
      // hires and its known exits the leavers, month by month.
      for (const m of mine.months.filter((x) => x.month >= '2026-04')) {
        expect(flows.get(m.month)?.starts, `${c.who} ${m.month}`).toBe(m.hires)
        expect(flows.get(m.month)?.knownExits, `${c.who} ${m.month}`).toBe(m.exits)
      }
      expect(mine.forecastMonths.map((x) => x.month)).toEqual(HG_OPEN)
    }
    // Finance's 8 known exits are the HRIS's last days after 30 Sep, all in October to December.
    expect(of('finance-fpa').mine.ahead.q3.known).toBe(8)
  })

  it('agrees with the closes: heads in scope at each closed month-end', () => {
    for (const c of CASES) {
      const { scope, mine } = of(c.key)
      for (const close of sample.plan.closes) {
        const ids = new Set<string>()
        for (const l of actualLineRows(close.lines))
          if (
            l.heads > 0 &&
            (l.positionId ? scope.positions.has(l.positionId) : scope.people.has(l.employeeId))
          )
            ids.add(l.employeeId)
        expect(ids.size, `${c.who} ${close.month}`).toBe(
          mine.months.find((m) => m.month === close.month)?.heads,
        )
      }
    }
  })

  it('agrees with My team: left to fill less accepted starts and people not in plan is open to hire (Managers A, B and C)', () => {
    for (const [key, open, accepted] of [
      ['manager-a', 2, 0],
      ['manager-b', 1, 1],
      ['manager-c', 0, 0],
    ] as const) {
      const { ctx, mine } = of(key)
      expect([mine.openFyEnd, mine.acceptedToCome], key).toEqual([open, accepted])
      const team = teamModel(ctx)
      expect(team.hero.value, key).toBe(
        mine.openFyEnd + mine.acceptedToCome + mine.heads.notInPlan + mine.heads.elsewhere,
      )
      expect(team.openToHire?.value, key).toBe(mine.openFyEnd)
      expect(planHiringModel(ctx).kpis.find((k) => k.id === 'hiring-open')?.value, key).toBe(mine.openFyEnd)
    }
  })

  it('keeps people on leave in current heads, never split out', () => {
    // On-leave people are in the pinned heads (Silicon Engineering's 7, the company's 20).
    expect(of('hrbp-se').mine.heads.onLeave).toBe(7)
    expect(of('finance-fpa').mine.heads.onLeave).toBe(20)
    for (const c of CASES) {
      const { ctx, mine } = of(c.key)
      const h = hiringOf(hiringInputOf(ctx)).table.heads
      expect(h.total, c.who).toBe(mine.heads.inApproved + mine.heads.notInPlan + mine.heads.elsewhere)
      expect(Object.keys(h).sort(), c.who).toEqual(
        ['elsewhere', 'inApprovedSeats', 'notInPlan', 'notInPlanIds', 'personIds', 'total'].sort(),
      )
    }
  })
})

/* ───────────────────────── Plan > Recruiting summary by independent code (docs/PLAN.md 9.8, C38) ───────────────────────── */

/**
 * Plan > Recruiting summary recomputed beside Plan > Hiring's independent code above (`hgCompute`,
 * from the raw rows): approved heads by each quarter end, current heads, open to hire, future starts
 * (signed offers), moves in, the known part of projected attrition, the closed months' hires, exits
 * and heads, the paces and the last 3 closed months' hires by the seat's location and department
 * are that code's. The modeled parts are read from the forecast run directly, never from the
 * recruiting model nor Plan > Hiring's input: the run's expected starts of kind open or planned at
 * their probability (the fill rate; a signed offer is kind offer, a future start, never a projected
 * one), and `forecastFlows`' modeled backfills and modeled exits of the open months. In Manager mode
 * the run is the one with the tree's own cohort (review HP-1), as `hgFlows` reads it.
 *
 * Reading taken by these checks: a projected start is any of those starts dated on or after the
 * as-of date and on or before the day. A start the forecast dates on the as-of date itself (an
 * overdue opening whose time to fill has run: 6.7's forecast start is the later of the target start
 * and the as-of date) is a head nobody holds on the as-of date, so it is not in current heads, and
 * the forecast counts it from then; the months ahead put it in the first month ahead. Modeled
 * backfills and exits are the open months' whose month-end is on or before the day. Projected heads
 * at a day are H + S + M + projected starts − E (9.8 item 2), so for a scope with nobody not in plan
 * they are the forecast's own heads at each month-end.
 */
interface RcForecast {
  /** The forecast's starts on Open and Planned seats in scope, at their probability. */
  starts: { positionId: string; start: ISODate; probability: number }[]
  /** Every start kind the run has in scope, with the probabilities they add up to. */
  kinds: Map<string, number>
  /** Modeled backfills of each open month. */
  backfills: Map<Month, number>
  /** The forecast's own heads at each month-end (position based: nobody not in plan). */
  heads: Map<Month, number>
}

/** The forecast run a context's Plan > Hiring reads (`hgFlows`'), read for its starts, backfills and heads. */
function rcForecast(ctx: AnalyticsContext, scope: HgScope): RcForecast {
  const fp =
    ctx.access.mode === 'manager' ? hiringForecast(ctx, preparePlan(ctx).scope.ids) : prepareForecast(ctx)
  const run = fp.run
  if (!run) throw new Error('No Working forecast on the sample.')
  const starts: RcForecast['starts'] = []
  const kinds = new Map<string, number>()
  for (const [positionId, list] of run.starts) {
    if (!scope.positions.has(positionId)) continue
    for (const s of list) {
      kinds.set(s.kind, (kinds.get(s.kind) ?? 0) + s.probability)
      if (s.kind === 'open' || s.kind === 'planned')
        starts.push({ positionId, start: s.start, probability: s.probability })
    }
  }
  const backfills = new Map<Month, number>()
  for (const [m, f] of forecastFlows(fp)) if (HG_OPEN.includes(m)) backfills.set(m, f.modeledBackfills)
  return { starts, kinds, backfills, heads: new Map(forecastHeads(fp).heads) }
}

interface RcQuarter {
  key: 'q3' | 'q4'
  approved: number
  futureStarts: number
  movesIn: number
  projectedStarts: number
  projectedExits: number
  projectedHeads: number
  gap: number
}
interface RcMonth {
  month: Month
  futureStarts: number
  movesIn: number
  projectedStarts: number
  projectedExits: number
  projectedHeads: number
}
interface Rc {
  /** The seven numbers in strip order: approved, current, open, future, projected, attrition, velocity. */
  seven: [number, number, number, number, number, number, number]
  /** The forecast's starts dated on the as-of date (overdue openings), at their probability. */
  dueNow: number
  quarters: RcQuarter[]
  ahead: RcMonth[]
  where: { locations: [string, number][]; departments: [string, number][]; more: [number, number] }
}

/** The top 5 by hires, then by name ("No location" and "No department" after the named); and how many more had a hire. */
function rcTop(map: Map<string, number[]>): { top: [string, number][]; more: number } {
  const blank = (x: string) => x === 'No location' || x === 'No department'
  const byName = (x: string, y: string) =>
    blank(x) !== blank(y) ? (blank(x) ? 1 : -1) : x < y ? -1 : x > y ? 1 : 0
  const all = [...map]
    .map(([name, v]): [string, number] => [name, v.reduce((a, b) => a + b, 0)])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1] || byName(a[0], b[0]))
  return { top: all.slice(0, 5), more: Math.max(0, all.length - 5) }
}

/** Plan > Recruiting summary for a scope: Plan > Hiring by independent code and the forecast run. */
function rcCompute(mine: Hg, f: RcForecast): Rc {
  const H = mine.heads.total
  const startsTo = (end: string) =>
    f.starts.filter((s) => s.start >= AS_OF && s.start <= end).reduce((a, s) => a + s.probability, 0)
  const backfillsTo = (end: string) =>
    HG_OPEN.filter((m) => monthEnd(m) <= end).reduce((a, m) => a + (f.backfills.get(m) ?? 0), 0)
  const projectedTo = (end: string) => startsTo(end) + backfillsTo(end)
  const quarters = (['q3', 'q4'] as const).map((key): RcQuarter => {
    const a = mine.ahead[key]
    const end = HG_QUARTERS.find((q) => q.key === key)?.end as string
    const projectedStarts = projectedTo(end)
    // No move in on the sample (asserted with Plan > Hiring's checks), so M(q) is 0.
    const projectedHeads = H + a.accepted + mine.movesIn + projectedStarts - a.exits
    return {
      key,
      approved: a.approved,
      futureStarts: a.accepted,
      movesIn: mine.movesIn,
      projectedStarts,
      projectedExits: a.exits,
      projectedHeads,
      gap: projectedHeads - a.approved,
    }
  })
  // The months ahead: what each month-end adds to the day before the first (the as-of date's
  // starts fall in the first month ahead).
  let future = 0
  let exits = 0
  let before = 0
  const ahead = mine.forecastMonths.map((m): RcMonth => {
    future += m.hires
    exits += m.exits
    const to = projectedTo(monthEnd(m.month))
    const out = {
      month: m.month,
      futureStarts: m.hires,
      movesIn: 0,
      projectedStarts: to - before,
      projectedExits: m.exits,
      projectedHeads: H + future + to - exits,
    }
    before = to
    return out
  })
  const fy = quarters[1]
  const locations = rcTop(mine.recent.locations)
  const departments = rcTop(mine.recent.departments)
  return {
    seven: [
      fy.approved,
      H,
      mine.openFyEnd,
      mine.acceptedToCome,
      fy.projectedStarts,
      fy.projectedExits,
      mine.paces.hires3,
    ],
    dueNow: f.starts.filter((s) => s.start === AS_OF).reduce((a, s) => a + s.probability, 0),
    quarters,
    ahead,
    where: {
      locations: locations.top,
      departments: departments.top,
      more: [locations.more, departments.more],
    },
  }
}

/**
 * The pinned numbers by independent code (the section comment): the seven numbers in strip order,
 * the forecast's starts on the as-of date (overdue openings, at their fill rate), the quarters ahead
 * (approved heads by the quarter end, future starts, moves in, projected starts, projected exits,
 * projected heads at the quarter end, the gap to approved heads), each month ahead's projected and
 * future starts, and where hiring happened (top 5 by hires, then name; and how many more). The
 * modeled parts are the forecast's, to 4 decimals.
 */
const RC_PINS: Record<
  HgKey,
  {
    seven: readonly number[]
    dueNow: number
    quarters: Record<'q3' | 'q4', readonly number[]>
    projectedByMonth: readonly number[]
    futureByMonth: readonly number[]
    where: { locations: [string, number][]; departments: [string, number][]; more: [number, number] }
  }
> = {
  'hrbp-se': {
    seven: [604, 556, 39, 9, 47.26338, 23.75296, 13 / 3],
    dueNow: 10 * 0.85,
    quarters: {
      q3: [590, 9, 0, 24.71496, 11.67899, 578.03597, -11.96403],
      q4: [604, 9, 0, 47.26338, 23.75296, 588.51042, -15.48958],
    },
    projectedByMonth: [8.5, 4.25, 11.96496, 6.91264, 7.78349, 7.85229],
    futureByMonth: [3, 3, 3, 0, 0, 0],
    where: {
      locations: [
        ['Munich', 4],
        ['San Jose', 4],
        ['Bengaluru', 3],
        ['Ho Chi Minh City', 1],
        ['Hsinchu', 1],
      ],
      departments: [
        ['Design Verification', 4],
        ['Analog & Mixed-Signal', 3],
        ['Physical Design', 3],
        ['Architecture', 1],
        ['DFT', 1],
      ],
      more: [0, 1],
    },
  },
  'leader-svp-se': {
    seven: [603, 555, 39, 9, 47.23867, 23.71187, 13 / 3],
    dueNow: 10 * 0.85,
    quarters: {
      q3: [589, 9, 0, 24.70873, 11.65836, 577.05037, -11.94963],
      q4: [603, 9, 0, 47.23867, 23.71187, 587.5268, -15.4732],
    },
    projectedByMonth: [8.5, 4.25, 11.95873, 6.90645, 7.77735, 7.84615],
    futureByMonth: [3, 3, 3, 0, 0, 0],
    where: {
      locations: [
        ['Munich', 4],
        ['San Jose', 4],
        ['Bengaluru', 3],
        ['Ho Chi Minh City', 1],
        ['Hsinchu', 1],
      ],
      departments: [
        ['Design Verification', 4],
        ['Analog & Mixed-Signal', 3],
        ['Physical Design', 3],
        ['Architecture', 1],
        ['DFT', 1],
      ],
      more: [0, 1],
    },
  },
  'finance-fpa': {
    seven: [1610, 1456, 132, 22, 161.70721, 79.93389, 13],
    dueNow: 10 * 0.85 + 6 * 0.9,
    quarters: {
      q3: [1567, 22, 0, 92.33546, 40.62154, 1529.71392, -37.28608],
      q4: [1610, 22, 0, 161.70721, 79.93389, 1559.77332, -50.22668],
    },
    projectedByMonth: [19.3, 21.35, 51.68546, 20.42411, 27.29841, 21.64923],
    futureByMonth: [8, 8, 6, 0, 0, 0],
    where: {
      locations: [
        ['San Jose', 15],
        ['Shanghai', 6],
        ['Bengaluru', 5],
        ['Munich', 4],
        ['Austin', 3],
      ],
      departments: [
        ['Sales', 5],
        ['Design Verification', 4],
        ['Product Marketing', 4],
        ['Software', 4],
        ['Analog & Mixed-Signal', 3],
      ],
      more: [4, 11],
    },
  },
  'manager-a': {
    seven: [9, 7, 2, 0, 2.14001, 0.59182, 0],
    dueNow: 0,
    quarters: {
      q3: [9, 0, 0, 1.87869, 0.27027, 8.60842, -0.39158],
      q4: [9, 0, 0, 2.14001, 0.59182, 8.54818, -0.45182],
    },
    projectedByMonth: [0, 0.9, 0.97869, 0.0777, 0.08685, 0.09677],
    futureByMonth: [0, 0, 0, 0, 0, 0],
    where: { locations: [], departments: [], more: [0, 0] },
  },
  'manager-b': {
    seven: [5, 3, 1, 1, 1.02313, 0.22087, 0],
    dueNow: 0,
    quarters: {
      q3: [5, 1, 0, 0.9236, 0.0946, 4.829, -0.171],
      q4: [5, 1, 0, 1.02313, 0.22087, 4.80226, -0.19774],
    },
    projectedByMonth: [0, 0.9, 0.0236, 0.0234, 0.03814, 0.03799],
    futureByMonth: [0, 1, 0, 0, 0, 0],
    where: { locations: [], departments: [], more: [0, 0] },
  },
  'manager-c': {
    seven: [7, 7, 0, 0, 0.21785, 0.36207, 0],
    dueNow: 0,
    quarters: {
      q3: [7, 0, 0, 0.05507, 0.18197, 6.8731, -0.1269],
      q4: [7, 0, 0, 0.21785, 0.36207, 6.85578, -0.14422],
    },
    projectedByMonth: [0, 0, 0.05507, 0.05459, 0.05411, 0.05407],
    futureByMonth: [0, 0, 0, 0, 0, 0],
    where: { locations: [], departments: [], more: [0, 0] },
  },
}

describe('Plan > Recruiting summary on the sample, by independent code (9.8, C38)', () => {
  const CASES: { key: HgKey; who: string }[] = [
    { key: 'hrbp-se', who: 'Silicon Engineering (HRBP)' },
    { key: 'leader-svp-se', who: "Chun-Hsien Kuo's org (Leader)" },
    { key: 'finance-fpa', who: 'the whole company (Finance)' },
    { key: 'manager-a', who: "Sebastian Wagner's team (Manager)" },
    { key: 'manager-b', who: 'Manager B' },
    { key: 'manager-c', who: 'Manager C' },
  ]
  type RcRun = HgRun & { f: RcForecast; rc: Rc }
  const run = new Map<HgKey, RcRun>()
  const of = (key: HgKey) => run.get(key) as RcRun

  beforeAll(() => {
    for (const { key } of CASES) {
      const r = hgRunOf(key)
      const f = rcForecast(r.ctx, r.scope)
      run.set(key, { ...r, f, rc: rcCompute(r.mine, f) })
    }
  }, 300_000)

  it('reads every start kind of the forecast run: signed offers apart, Open and Planned seats at their fill rate', () => {
    for (const { key, who } of CASES) {
      const { f, mine } = of(key)
      // A signed offer is a start of kind offer at probability 1: the future starts, never a projected start.
      expect(f.kinds.get('offer') ?? 0, who).toBe(mine.acceptedToCome)
      expect(
        [...f.kinds.keys()].every((k) => ['offer', 'open', 'planned'].includes(k)),
        who,
      ).toBe(true)
      for (const s of f.starts) {
        expect(s.probability, `${who} ${s.positionId}`).toBeGreaterThan(0)
        expect(s.probability, `${who} ${s.positionId}`).toBeLessThan(1)
      }
    }
    // Non-vacuity: Open and Planned seats in the unit, the org, the company and Managers A and B.
    for (const key of ['hrbp-se', 'leader-svp-se', 'finance-fpa', 'manager-a', 'manager-b'] as const)
      expect(of(key).f.starts.length, key).toBeGreaterThan(0)
    expect(of('manager-c').f.starts).toEqual([])
  })

  it('pins the seven numbers, the quarters ahead and the months ahead', () => {
    const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0)
    for (const { key, who } of CASES) {
      const { rc, mine } = of(key)
      const pin = RC_PINS[key]
      const [approved, current, open, future, projected, attrition, velocity] = rc.seven
      expect([approved, current, open, future], who).toEqual(pin.seven.slice(0, 4))
      expect(projected, `${who} projected starts`).toBeCloseTo(pin.seven[4], 4)
      expect(attrition, `${who} projected attrition`).toBeCloseTo(pin.seven[5], 4)
      expect(velocity, `${who} hiring velocity`).toBe(pin.seven[6])
      expect(rc.dueNow, `${who} due on the as-of date`).toBeCloseTo(pin.dueNow, 9)
      // The user's formula (9.7, no move in on the sample) and Plan > Hiring's own numbers.
      expect(open, who).toBe(approved - current - future)
      expect([approved, open, future], who).toEqual([
        mine.ahead.q4.approved,
        mine.openFyEnd,
        mine.acceptedToCome,
      ])
      for (const q of rc.quarters) {
        const [a, s, m, p, e, heads, gap] = pin.quarters[q.key]
        expect([q.approved, q.futureStarts, q.movesIn], `${who} ${q.key}`).toEqual([a, s, m])
        expect(q.projectedStarts, `${who} ${q.key} projected starts`).toBeCloseTo(p, 4)
        expect(q.projectedExits, `${who} ${q.key} projected exits`).toBeCloseTo(e, 4)
        expect(q.projectedHeads, `${who} ${q.key} projected heads`).toBeCloseTo(heads, 4)
        expect(q.gap, `${who} ${q.key} gap`).toBeCloseTo(gap, 4)
        expect(q.projectedHeads, `${who} ${q.key}`).toBeCloseTo(
          current + q.futureStarts + q.movesIn + q.projectedStarts - q.projectedExits,
          9,
        )
        expect(q.gap, `${who} ${q.key}`).toBeCloseTo(q.projectedHeads - q.approved, 9)
      }
      // The months ahead add up to the quarters and the seven numbers.
      expect(
        rc.ahead.map((m) => m.month),
        who,
      ).toEqual(HG_OPEN)
      rc.ahead.forEach((m, i) => {
        expect(m.projectedStarts, `${who} ${m.month}`).toBeCloseTo(pin.projectedByMonth[i], 4)
      })
      expect(
        rc.ahead.map((m) => m.futureStarts),
        who,
      ).toEqual([...pin.futureByMonth])
      expect(sum(rc.ahead.map((m) => m.futureStarts)), who).toBe(future)
      expect(sum(rc.ahead.map((m) => m.projectedStarts)), who).toBeCloseTo(projected, 9)
      expect(sum(rc.ahead.map((m) => m.projectedExits)), who).toBeCloseTo(attrition, 9)
      expect(sum(rc.ahead.slice(0, 3).map((m) => m.projectedStarts)), who).toBeCloseTo(
        rc.quarters[0].projectedStarts,
        9,
      )
      expect(rc.ahead[2].projectedHeads, who).toBeCloseTo(rc.quarters[0].projectedHeads, 9)
      expect(rc.ahead[5].projectedHeads, who).toBeCloseTo(rc.quarters[1].projectedHeads, 9)
      // Where hiring happened: the top 5 of each list, and how many more.
      expect(rc.where.locations, who).toEqual(pin.where.locations)
      expect(rc.where.departments, who).toEqual(pin.where.departments)
      expect(rc.where.more, who).toEqual(pin.where.more)
    }
  })

  it("counts the forecast's starts on the as-of date in the first month ahead, as the forecast counts their heads", () => {
    for (const { key, who } of CASES) {
      const { f, mine, rc } = of(key)
      const seats = new Map(mine.seats.map((x) => [x.positionId, x]))
      // Each is an overdue opening: an approved Open seat nobody holds, with no signed offer, due by now.
      for (const s of f.starts.filter((x) => x.start === AS_OF)) {
        const seat = seats.get(s.positionId)
        expect(seat, `${who} ${s.positionId}`).toBeTruthy()
        expect(
          [seat?.filled, seat?.offer, (seat?.firstHeadDay ?? '') <= AS_OF],
          `${who} ${s.positionId}`,
        ).toEqual([false, null, true])
      }
      // Nothing the forecast starts is dated before the as-of date.
      expect(
        f.starts.filter((x) => x.start < AS_OF).map((x) => x.positionId),
        who,
      ).toEqual([])
      expect(rc.ahead[0].projectedStarts, who).toBeCloseTo(
        rc.dueNow +
          f.starts
            .filter((x) => x.start > AS_OF && x.start <= monthEnd(HG_OPEN[0]))
            .reduce((a, x) => a + x.probability, 0) +
          (f.backfills.get(HG_OPEN[0]) ?? 0),
        9,
      )
      // Projected heads at each month-end are the forecast's own heads there: the position-based
      // forecast leaves out the people not in plan, whom current heads count.
      for (const m of rc.ahead) {
        const forecast = (f.heads.get(m.month) ?? 0) + mine.heads.notInPlan
        if (key === 'finance-fpa')
          // The one known leaver ahead whose head the forecast's modeled exits had thinned before
          // their last day (P-2015, 4 Dec 2026) counts in full as a known exit: 0.0174 heads.
          expect(Math.abs(m.projectedHeads - forecast), `${who} ${m.month}`).toBeLessThan(0.02)
        else expect(m.projectedHeads, `${who} ${m.month}`).toBeCloseTo(forecast, 6)
      }
    }
    // The unit, the org and the company have overdue openings; Managers A, B and C none.
    expect(of('hrbp-se').rc.dueNow).toBeGreaterThan(8)
    expect(of('finance-fpa').rc.dueNow).toBeGreaterThan(of('hrbp-se').rc.dueNow)
    for (const key of ['manager-a', 'manager-b', 'manager-c'] as const) expect(of(key).rc.dueNow, key).toBe(0)
  })

  it('keeps future starts and projected starts apart: no signed offer is a projected start', () => {
    for (const { key, who } of CASES) {
      const { f, mine } = of(key)
      const seats = new Map(mine.seats.map((x) => [x.positionId, x]))
      const known = new Set(
        data.workers
          .filter((w) => !!w.terminationDate && w.terminationDate > AS_OF && !!w.positionId)
          .map((w) => w.positionId as string),
      )
      // Every projected start by the year end is on an approved seat with no signed offer: an Open or
      // Planned seat nobody holds, or a Filled seat its holder leaves (a reopened seat).
      for (const s of f.starts.filter((x) => x.start <= HG_FY_END)) {
        const seat = seats.get(s.positionId)
        expect(seat, `${who} ${s.positionId}`).toBeTruthy()
        expect(seat?.offer ?? null, `${who} ${s.positionId}`).toBeNull()
        if (seat?.filled) expect(known.has(s.positionId), `${who} ${s.positionId}`).toBe(true)
      }
      // And the screen names them apart.
      const m = planRecruitingModel(of(key).ctx)
      const tile = (id: string) => m.kpis.find((k) => k.id === id)
      expect([tile('recruiting-future')?.label, tile('recruiting-future')?.note], who).toEqual([
        'Future starts',
        FUTURE_STARTS_NOTE,
      ])
      expect([tile('recruiting-projected')?.label, tile('recruiting-projected')?.note], who).toEqual([
        'Projected starts',
        PROJECTED_STARTS_NOTE,
      ])
      for (const fig of [m.months, m.quarters]) {
        const labels = fig.columns.map((c) => c.label)
        expect(labels, `${who} ${fig.id}`).toContain('Future starts (signed offers)')
        expect(labels, `${who} ${fig.id}`).toContain('Projected starts (model)')
      }
    }
  })

  it('is what Plan > Recruiting summary shows: the seven numbers, heads and hiring by month, by quarter ahead', () => {
    for (const { key, who } of CASES) {
      const { ctx, mine, rc } = of(key)
      const m = planRecruitingModel(ctx)
      expect(m.fiscalYear, who).toBe('FY27')
      expect(
        m.kpis.map((k) => k.id),
        who,
      ).toEqual([...RECRUITING_KPI_IDS])
      const value = (id: string) => m.kpis.find((k) => k.id === id)?.value as number
      const [approved, current, open, future, projected, attrition, velocity] = rc.seven
      expect(
        ['recruiting-approved', 'recruiting-current', 'recruiting-open', 'recruiting-future'].map(value),
        who,
      ).toEqual([approved, current, open, future])
      expect(value('recruiting-projected'), `${who} projected starts`).toBeCloseTo(projected, 9)
      expect(value('recruiting-attrition'), `${who} projected attrition`).toBeCloseTo(attrition, 9)
      expect(value('recruiting-velocity'), `${who} hiring velocity`).toBeCloseTo(velocity, 9)
      // Under projected attrition, the attrition rate (heads) over 12 closed months; under velocity, the 6-month pace
      // and the last 3 months' hires (9.8 item 1).
      const note = (id: string) => m.kpis.find((k) => k.id === id)?.note ?? ''
      expect(note('recruiting-attrition'), who).toContain(formatAs(mine.paces.attrition, 'pct'))
      expect(note('recruiting-velocity'), who).toContain(
        `6-month pace ${formatAs(mine.paces.hires6, 'num1')}`,
      )
      const last3 = mine.recent.total.reduce((a, b) => a + b, 0)
      // Short (review RU-9): "6-month pace 4.5; 13 hires in 3 months", the 3-month pace in the formula.
      expect(note('recruiting-velocity'), who).toContain(
        `${last3} ${last3 === 1 ? 'hire' : 'hires'} in 3 months`,
      )
      // The rate under projected attrition is the trailing one, over 12 closed months (review RN-6).
      expect(note('recruiting-attrition'), who).toMatch(/over 12 closed months$/)
      // The one slide's numbers are the tiles as the strip shows them.
      expect(
        m.deckNumbers.map((d) => d.value),
        who,
      ).toEqual(m.kpis.map((k) => formatAs(k.value, k.format)))
      expect(
        m.deckNumbers.map((d) => d.label),
        who,
      ).toEqual(m.kpis.map((k) => k.label))
      // By quarter ahead: Q3 and Q4, row for row.
      expect(
        m.quarters.rows.map((r) => r.key),
        who,
      ).toEqual(['q3', 'q4'])
      for (const q of rc.quarters) {
        const r = m.quarters.rows.find((x) => x.key === q.key)
        expect([r?.approved, r?.futureStarts, r?.movesIn], `${who} ${q.key}`).toEqual([
          q.approved,
          q.futureStarts,
          q.movesIn,
        ])
        expect(r?.projectedStarts, `${who} ${q.key} projected starts`).toBeCloseTo(q.projectedStarts, 9)
        expect(r?.projectedExits, `${who} ${q.key} projected exits`).toBeCloseTo(q.projectedExits, 9)
        expect(r?.projectedHeads, `${who} ${q.key} projected heads`).toBeCloseTo(q.projectedHeads, 9)
        expect(r?.gap, `${who} ${q.key} gap`).toBeCloseTo(q.gap, 9)
        const shown = formatAs(Math.abs(q.gap), 'num1')
        expect(r?.gapNote, `${who} ${q.key}`).toBe(q.gap < 0 ? `Short by ${shown}` : `Over by ${shown}`)
      }
      // No move in on the sample: neither table has a Moves in column (it shows only when not 0, C37).
      for (const fig of [m.months, m.quarters])
        expect(
          fig.columns.some((c) => c.key === 'movesIn'),
          `${who} ${fig.id}`,
        ).toBe(false)
      // Heads and hiring by month: the 12 closed months, then the months ahead to the year end.
      const rows = m.months.rows
      expect(
        rows.map((r) => [r.month, r.kind]),
        who,
      ).toEqual([...HG_TRAILING.map((x) => [x, 'actual']), ...HG_OPEN.map((x) => [x, 'ahead'])])
      expect(
        rows.slice(0, 12).map((r) => [r.hires, r.exits, r.heads]),
        who,
      ).toEqual(mine.months.map((x) => [x.hires, x.exits, x.heads]))
      for (const r of rows.slice(0, 12))
        expect(
          [r.futureStarts, r.movesIn, r.projectedStarts, r.projectedExits, r.projectedHeads],
          `${who} ${r.month}`,
        ).toEqual([null, null, null, null, null])
      rows.slice(12).forEach((r, i) => {
        const x = rc.ahead[i]
        expect([r.hires, r.exits, r.heads], `${who} ${r.month}`).toEqual([null, null, null])
        expect([r.futureStarts, r.movesIn], `${who} ${r.month}`).toEqual([x.futureStarts, x.movesIn])
        expect(r.projectedStarts, `${who} ${r.month} projected starts`).toBeCloseTo(x.projectedStarts, 9)
        expect(r.projectedExits, `${who} ${r.month} projected exits`).toBeCloseTo(x.projectedExits, 9)
        expect(r.projectedHeads, `${who} ${r.month} projected heads`).toBeCloseTo(x.projectedHeads, 9)
      })
      // Approved heads at the year end, the chart's reference line, on every month.
      expect(new Set(rows.map((r) => r.approved)), who).toEqual(new Set([approved]))
      // Where hiring happened.
      const where = (kind: string) =>
        m.where.rows.filter((r) => r.kind === kind).map((r): [string, number] => [r.name, r.hires])
      expect(where('location'), who).toEqual(rc.where.locations)
      expect(where('department'), who).toEqual(rc.where.departments)
      expect([m.whereMore.locations, m.whereMore.departments], who).toEqual(rc.where.more)
      for (const r of m.where.rows) expect(r.perMonth, `${who} ${r.name}`).toBe(r.hires / 3)
    }
  })

  it('agrees with Plan > Hiring: the same open to hire, future starts, pace and projected attrition', () => {
    for (const { key, who } of CASES) {
      const { ctx } = of(key)
      const r = planRecruitingModel(ctx)
      const h = planHiringModel(ctx)
      const rv = (id: string) => r.kpis.find((k) => k.id === id)?.value
      const hv = (id: string) => h.kpis.find((k) => k.id === id)?.value
      expect([rv('recruiting-open'), rv('recruiting-future'), rv('recruiting-velocity')], who).toEqual([
        hv('hiring-open'),
        hv('hiring-accepted'),
        hv('hiring-pace'),
      ])
      const row = (k: string) => h.quarters.rows.find((x) => x.key === k)
      for (const q of r.quarters.rows) {
        const k = q.key as 'q3' | 'q4'
        expect([q.approved, q.futureStarts, q.projectedExits], `${who} ${k}`).toEqual([
          row('approved')?.[k],
          row('accepted')?.[k],
          row('exits')?.[k],
        ])
      }
      expect(rv('recruiting-attrition'), who).toBe(row('exits')?.q4)
    }
  })

  it('opens the hires where hiring happened counts, the last 3 closed months, by the seat on the hire date', () => {
    let opened = 0
    for (const key of ['hrbp-se', 'leader-svp-se', 'finance-fpa'] as const) {
      const { ctx, mine } = of(key)
      const m = planRecruitingModel(ctx)
      const col = m.where.columns.find((c) => c.key === 'hires')
      for (const r of m.where.rows) {
        const spec = resolveDrill(col?.drill?.(r) ?? null)
        expect(spec?.kind, `${key} ${r.name}`).toBe('workers')
        expect(spec?.rows.length, `${key} ${r.name}`).toBe(r.hires)
        const ids = new Set((spec?.rows ?? []).map((w) => (w as { employeeId: string }).employeeId))
        // Each is a hire of those months into a seat at that place on the hire date.
        const rows = hgRows(data)
        for (const id of ids) {
          const w = data.workers.find(
            (x) =>
              x.employeeId === id &&
              !!x.positionId &&
              (x.assignmentStart || x.hireDate) === x.hireDate &&
              HG_RECENT.includes(x.hireDate.slice(0, 7) as Month),
          )
          const list = rows.get(w?.positionId as string) ?? []
          const at = hgRowOn(list, w?.hireDate as string) ?? list[0]
          expect(r.kind === 'location' ? at?.location : at?.department, `${key} ${r.name} ${id}`).toBe(r.name)
        }
        opened++
      }
      expect(
        mine.recent.total.reduce((a, b) => a + b, 0),
        key,
      ).toBeGreaterThan(0)
    }
    expect(opened).toBe(30)
    // Managers A, B and C hired nobody in those months: no row, and the figure says so.
    for (const key of ['manager-a', 'manager-b', 'manager-c'] as const) {
      const m = planRecruitingModel(of(key).ctx)
      expect(m.where.rows, key).toEqual([])
      expect(m.where.empty, key).toBeTruthy()
    }
  })
})
