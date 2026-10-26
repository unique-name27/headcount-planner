/**
 * The nine stories' numbers (docs/PLAN.md 13.4), computed from a sample with the plan engines, so the
 * README, sample.test.ts, raw/stories.test.ts (the same on messy data) and the app agree. Pure.
 *
 * Readings taken here (each stated in README.md):
 *  - Orgs join at read time (15.1 R26): a position's unit, site and cost center are its latest row's.
 *    A cohort line (forecast.ts, positionId '') belongs to its unit, and to the one site of its
 *    currency (EUR is Munich only, ILS Haifa only).
 *  - Actual heads at 30 Sep 2026 are Employee assignments active that day, by seat; Budget plan heads
 *    at Sep month-end are the locked Budget's September lines with a head. An employee not in the
 *    plan has no seat and falls in no story org (story 7 keeps them outside).
 *  - Actual cost YTD is the closes' April to September lines: HRIS pay, plus the one-time items each
 *    close books in its month (change C32, lead decision D-CLOSE). The full-year forecast is FY27
 *    Working's forecast as of 30 Sep 2026 over April 2026 to March 2027 (closed months from the
 *    closes, open months projected at forecast rates; no vacancy allowance). Budget figures are its
 *    locked lines over the same months, its vacancy allowance lines included (change C31, lead
 *    decision D-VAC). Variance = forecast − Budget.
 *  - Hires YTD (`plan.hires.ytd`, R29): employees hired from 1 Apr 2026 to the last close (30 Sep)
 *    into a seat of the org. Planned hires (`plan.hires.planned`): Budget seats of the org whose
 *    first September-or-earlier line with a head falls in April to September, leaving out seats the
 *    Budget saw Filled on 1 Apr 2026 and seats that receive a transfer.
 *  - Story 5's FX effect is fx.ts `fxEffect` of the site's forecast lines against the Budget's stored
 *    rates; `fxByMonth` gives the hand calculation's terms (Σ local × (rate − plan) per month).
 *  - Story 8 counts costed people per FY27 month: holders of the cost center's 'hris' lines and
 *    accepted offers of its 'offer' lines with an active fraction above 0, from the forecast lines
 *    (a one-time line has an active fraction of 0 and counts no one).
 */

import { MIN_COSTED } from '@/metrics/rules'
import { cutLine, defaultCutAfter, notSubmitted, rankAsks } from '@/plan/engine/cycle'
import {
  type ExpectedStart,
  type ForecastResult,
  forecast,
  forecastStart,
  isCohortLine,
  openedOn,
} from '@/plan/engine/forecast'
import { type FreezeOpening, frozenOpenings } from '@/plan/engine/freeze'
import { fxEffect, fxRatesFromAssumptions } from '@/plan/engine/fx'
import { isActiveOn, toAssignments } from '@/plan/engine/heads'
import { actualLineRows, planLineRows } from '@/plan/engine/lineTable'
import { reconcile } from '@/plan/engine/reconcile'
import { backfillFlag, fromRow } from '@/plan/engine/requests'
import { asks, bandEffect, headEffect } from '@/plan/engine/targets'
import type { TradeQuote } from '@/plan/engine/trade'
import { seatDetailOn, seatHistories } from '@/plan/engine/versions'
import type { HcRequest, MonthClose, PlanLine, Step } from '@/plan/types'
import { monthsOf, shiftMonth } from '../fiscal'
import { type Datasets, type ISODate, type Month, PENDING_REQUEST_STATES, type PositionRow } from '../schema'
import { FY27_WORKING, FY28_WORKING, TIME_TO_FILL } from './assumptions'
import { asKnownOn, assumptionsOf, type KnownDates, type Planted, SAMPLE_AS_OF } from './base'
import { sampleCloses } from './closes'
import { CORP, GTM, SE } from './departments'
import type { SampleStoryIds } from './generate'
import type { World } from './org'
import { inTreeOf, latestRows } from './orgs'
import type { Persona } from './personas'
import { ratesOf, unitOrg, workingAsksContext } from './routing'
import { quoteTrade, routeTrade, TRADE_SUBMIT, type TradeRouting } from './trades'
import { lockBudget, lockQ1Reforecast, type SampleLocks, versionFrame } from './versions'

const AS_OF: ISODate = SAMPLE_AS_OF
const FY27_MONTHS: readonly Month[] = monthsOf('FY27')
const YTD_MONTHS: readonly Month[] = FY27_MONTHS.slice(0, 6)
const SEP: Month = '2026-09'
const SITE_OF_CURRENCY: Readonly<Record<string, string>> = { EUR: 'Munich', ILS: 'Haifa' }

/** What the stories are computed from: a sample's datasets and IDs, with its closes and locks if known. */
export interface StoryInput {
  datasets: Datasets
  known: KnownDates
  personas: readonly Persona[]
  planted: Planted
  story: SampleStoryIds
  world: World
  closes?: readonly MonthClose[]
  locks?: SampleLocks
}

/** The expensive parts, built once: closes, locks, the Working forecast and the lines by org. */
export interface StoryModel {
  input: StoryInput
  closes: readonly MonthClose[]
  locks: SampleLocks
  latest: Map<string, PositionRow>
  budgetLines: PlanLine[]
  closeLines: { positionId: string | null; month: Month; usd: number }[]
  forecast: ForecastResult
  requests: HcRequest[]
}

const financeActor = (personas: readonly Persona[]) => {
  const p = personas.find((x) => x.key === 'finance-fpa')!
  return { personId: p.employeeId, name: p.name, mode: 'finance' as const }
}

export function storyModel(input: StoryInput): StoryModel {
  const data = input.datasets
  const finance = financeActor(input.personas)
  const closes = input.closes ?? sampleCloses(input, finance.personId)
  let locks = input.locks
  if (!locks) {
    const budget = lockBudget(input, finance)
    locks = { budget, q1: lockQ1Reforecast(input, closes, finance, [budget]) }
  }
  const rows = assumptionsOf(data, FY27_WORKING)
  const requests = data.requests.map(fromRow)
  const f = forecast({
    version: versionFrame(FY27_WORKING),
    asOf: AS_OF,
    closes,
    positions: data.positions,
    workers: data.workers,
    comp: data.comp,
    reqs: data.reqs,
    requests,
    freezes: data.freezes,
    assumptions: rows,
    rates: fxRatesFromAssumptions(rows),
    inTree: inTreeOf(data.positions),
    minCosted: Number(MIN_COSTED.default),
  })
  const closeLines: StoryModel['closeLines'] = []
  for (const c of closes)
    for (const l of actualLineRows(c.lines))
      closeLines.push({ positionId: l.positionId, month: l.month, usd: l.usd.loaded })
  return {
    input,
    closes,
    locks,
    latest: latestRows(data.positions),
    budgetLines: [...planLineRows(locks.budget.lines)],
    closeLines,
    forecast: f,
    requests,
  }
}

/* ───────────────────────── heads and cost by org ───────────────────────── */

export interface OrgFigures {
  /** Actual heads at 30 Sep 2026 minus Budget plan heads at Sep month-end. */
  headsDelta: number
  actualHeads: number
  budgetPlanHeads: number
  /** Positions with an actual head and no Budget plan head, and the reverse. */
  plus: string[]
  minus: string[]
  ytdActual: number
  ytdBudget: number
  fyForecast: number
  fyBudget: number
  fyVariance: number
}

type InOrg = (row: PositionRow) => boolean
type CohortIn = (businessUnit: string, currency: string) => boolean

function sum(lines: readonly PlanLine[], months: readonly Month[], keep: (l: PlanLine) => boolean): number {
  const set = new Set(months)
  let total = 0
  for (const l of lines) if (set.has(l.month) && keep(l)) total += l.usd.loaded
  return total
}

function lineIn(m: StoryModel, inOrg: InOrg, cohortIn: CohortIn): (l: PlanLine) => boolean {
  return (l) => {
    if (isCohortLine(l)) return cohortIn(l.cohort.businessUnit, l.cohort.currency)
    const r = m.latest.get(l.positionId)
    return r != null && inOrg(r)
  }
}

/** Positions with an active Employee assignment on 30 Sep 2026. */
function actualSeats(data: Datasets): Set<string> {
  const out = new Set<string>()
  for (const a of toAssignments(data.workers))
    if (a.workerType === 'Employee' && a.positionId && isActiveOn(a, AS_OF)) out.add(a.positionId)
  return out
}

/** Positions with a Budget plan head at Sep month-end. */
function budgetSeptember(m: StoryModel): Set<string> {
  const out = new Set<string>()
  for (const l of m.budgetLines) if (l.month === SEP && l.heads > 0) out.add(l.positionId)
  return out
}

export function orgFigures(m: StoryModel, inOrg: InOrg, cohortIn: CohortIn): OrgFigures {
  const actual = actualSeats(m.input.datasets)
  const plan = budgetSeptember(m)
  const plus: string[] = []
  const minus: string[] = []
  let a = 0
  let b = 0
  for (const [id, r] of m.latest) {
    if (!inOrg(r)) continue
    const has = actual.has(id)
    const planned = plan.has(id)
    if (has) a++
    if (planned) b++
    if (has && !planned) plus.push(id)
    if (!has && planned) minus.push(id)
  }
  const keep = lineIn(m, inOrg, cohortIn)
  let ytdActual = 0
  for (const l of m.closeLines) {
    const r = l.positionId ? m.latest.get(l.positionId) : undefined
    if (r && inOrg(r)) ytdActual += l.usd
  }
  const fyForecast = sum(m.forecast.lines, FY27_MONTHS, keep)
  const fyBudget = sum(m.budgetLines, FY27_MONTHS, keep)
  return {
    headsDelta: a - b,
    actualHeads: a,
    budgetPlanHeads: b,
    plus: plus.sort(),
    minus: minus.sort(),
    ytdActual,
    ytdBudget: sum(m.budgetLines, YTD_MONTHS, keep),
    fyForecast,
    fyBudget,
    fyVariance: fyForecast - fyBudget,
  }
}

const unitIs =
  (bu: string): InOrg =>
  (r) =>
    r.businessUnit === bu
const unitCohort =
  (bu: string): CohortIn =>
  (u) =>
    u === bu
const siteIs =
  (site: string): InOrg =>
  (r) =>
    r.location === site
const siteCohort =
  (site: string): CohortIn =>
  (_u, currency) =>
    SITE_OF_CURRENCY[currency] === site

/* ───────────────────────── hires (story 1) ───────────────────────── */

export interface Hires {
  ytd: number
  planned: number
  hiredIds: string[]
  plannedSeats: string[]
}

export function hiresOf(m: StoryModel, inOrg: InOrg): Hires {
  const data = m.input.datasets
  const first = FY27_MONTHS[0]
  const from = `${first}-01`
  const hired = new Set<string>()
  for (const w of data.workers) {
    if (w.workerType !== 'Employee' || !w.positionId || w.hireDate < from || w.hireDate > AS_OF) continue
    if ((w.assignmentStart ?? w.hireDate) !== w.hireDate) continue
    const r = m.latest.get(w.positionId)
    if (r && inOrg(r)) hired.add(w.employeeId)
  }
  // The Budget's view: seats Filled on 1 Apr 2026 as it knew them, and seats a transfer fills.
  const view = asKnownOn(m.input, m.locks.budget.lockedAt.slice(0, 10))
  const seats = seatHistories({
    positions: view.positions,
    assignments: toAssignments(view.workers),
    reqs: view.reqs,
    requests: view.requests.map(fromRow),
  })
  const transferred = new Set<string>()
  for (const q of data.requests) if (q.type === 'Transfer' && q.toPositionId) transferred.add(q.toPositionId)
  const firstHead = new Map<string, Month>()
  for (const l of m.budgetLines) {
    if (l.heads <= 0 || l.month > SEP) continue
    const seen = firstHead.get(l.positionId)
    if (!seen || l.month < seen) firstHead.set(l.positionId, l.month)
  }
  const planned: string[] = []
  for (const [id, month] of firstHead) {
    const r = m.latest.get(id)
    if (!r || !inOrg(r) || month < first || transferred.has(id)) continue
    const s = seats.get(id)
    if (s && seatDetailOn(s, from)?.status === 'Filled') continue
    planned.push(id)
  }
  return {
    ytd: hired.size,
    planned: planned.length,
    hiredIds: [...hired].sort(),
    plannedSeats: planned.sort(),
  }
}

/* ───────────────────────── FX (story 5) ───────────────────────── */

export interface FxMonth {
  month: Month
  currency: string
  local: number
  rate: number
  plan: number
  effect: number
}

/** The site's FX effect against the Budget's rates and its terms by month. */
export function fxOf(m: StoryModel, site: string): { effect: number; months: FxMonth[] } {
  const keep = lineIn(m, siteIs(site), siteCohort(site))
  const lines = m.forecast.lines.filter((l) => FY27_MONTHS.includes(l.month) && keep(l))
  const byMonth = new Map<string, FxMonth>()
  for (const l of lines) {
    if (l.currency === 'USD') continue
    const key = `${l.month}|${l.currency}|${l.rate}`
    const local = l.local.base + l.local.bonus + l.local.burden + l.local.benefits + l.local.oneTime
    let e = byMonth.get(key)
    if (!e) {
      const plan = m.locks.budget.rates.find(
        (r) => r.currency === l.currency && r.set === 'plan' && r.month === l.month,
      )!
      e = { month: l.month, currency: l.currency, local: 0, rate: l.rate, plan: plan.usdPerLocal, effect: 0 }
      byMonth.set(key, e)
    }
    e.local += local
  }
  const months = [...byMonth.values()].sort((a, b) => (a.month < b.month ? -1 : 1))
  for (const e of months) e.effect = e.local * (e.rate - e.plan)
  return { effect: fxEffect(lines, m.locks.budget.rates), months }
}

/** Every site's FX effect against the Budget. */
export function fxBySite(m: StoryModel): Map<string, number> {
  const out = new Map<string, number>()
  const sites = new Set([...m.latest.values()].map((r) => r.location))
  for (const site of sites) out.set(site, fxOf(m, site).effect)
  return out
}

/* ───────────────────────── the stories ───────────────────────── */

/** Stories 1 to 8 (story 9's trade must leave them unchanged). */
export interface StoriesOneToEight {
  s1: OrgFigures & { hires: Hires }
  s2: OrgFigures
  s3: { flagged: Record<string, string[]> }
  s4: { frozen: string[]; corporateOpenPlanned: number; offerStart: ExpectedStart | null }
  s5: {
    munich: OrgFigures & { fx: number; fxMonths: FxMonth[] }
    haifa: OrgFigures & { fx: number; fxMonths: FxMonth[] }
    otherSitesFx: Record<string, number>
  }
  s6: {
    targetHeads: number
    asksHeads: number
    gap: number
    room: number
    cutAfter: number
    rankedHeads: number
    above: number
    notSubmitted: string[]
    otherPending: string[]
  }
  s7: { exceptions: Record<string, number> }
  s8: { costedPeople: Record<Month, number> }
}

export interface StoryNine {
  quote: TradeQuote
  routing: TradeRouting
  storedSteps: { role: string; approverId: string }[]
  /** The negative control: the chain with Systems & Software's target heads set to its asks. */
  control: Step[]
}

export interface Stories extends StoriesOneToEight {
  s9: StoryNine
}

export function storiesOneToEight(m: StoryModel): StoriesOneToEight {
  const { input } = m
  const data = input.datasets

  const s1 = { ...orgFigures(m, unitIs(GTM), unitCohort(GTM)), hires: hiresOf(m, unitIs(GTM)) }
  const s2 = orgFigures(m, unitIs(SE), unitCohort(SE))

  // Story 3: Backfill flags by unit (30-day window, same department).
  const assignments = toAssignments(data.workers)
  const exits = new Map<string, ISODate[]>()
  for (const a of assignments)
    if (a.positionId && a.end) exits.set(a.positionId, [...(exits.get(a.positionId) ?? []), a.end])
  const firstRow = new Map<string, ISODate>()
  for (const r of data.positions) {
    const seen = firstRow.get(r.positionId)
    if (!seen || r.effectiveDate < seen) firstRow.set(r.positionId, r.effectiveDate)
  }
  const exitsByDept = new Map<string, ISODate[]>()
  for (const [id, list] of exits) {
    const dept = m.latest.get(id)?.department ?? ''
    exitsByDept.set(dept, [...(exitsByDept.get(dept) ?? []), ...list])
  }
  const flagged: Record<string, string[]> = {}
  for (const q of m.requests) {
    if (!PENDING_REQUEST_STATES.includes(q.state)) continue
    const flag = backfillFlag(q, {
      createdOn: (id) => firstRow.get(id) ?? null,
      exitsOf: (id) => exits.get(id) ?? [],
      orgExits: (id) => exitsByDept.get(m.latest.get(id)?.department ?? '') ?? [],
      windowDays: 30,
    })
    if (flag !== 'backfill-new-position') continue
    flagged[q.businessUnit] = [...(flagged[q.businessUnit] ?? []), q.requestId]
  }

  // Story 4: openings under the Corporate freeze on 30 Sep 2026.
  const seats = seatHistories({
    positions: data.positions,
    assignments,
    reqs: data.reqs,
    requests: m.requests,
  })
  const wrows = assumptionsOf(data, FY27_WORKING)
  const ttf = (level: string) =>
    wrows.find((r) => r.table === 'timeToFill' && r.key === level)?.value ?? TIME_TO_FILL[level as 'P1']
  const openings: FreezeOpening[] = []
  let corporateOpenPlanned = 0
  for (const seat of seats.values()) {
    const s = seatDetailOn(seat, AS_OF)
    if (!s || (s.status !== 'Open' && s.status !== 'Planned')) continue
    if (s.position.businessUnit === CORP) corporateOpenPlanned++
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
      unfrozenStart: forecastStart(
        { status: s.status, targetStart: s.plannedStart, openedOn: openedOn(seat, AS_OF) },
        AS_OF,
        ttf(s.position.level),
      ),
      acceptedOffer: s.acceptedOffer != null,
      backfill: seat.assignments.length > 0,
    })
  }
  const frozen = frozenOpenings(openings, data.freezes, AS_OF, inTreeOf(data.positions)).map(
    (h) => h.positionId,
  )
  const offerStart =
    m.forecast.expectedStarts.find((e) => e.positionId === input.planted.corporateOffer.positionId) ?? null

  // Story 5: Munich and Haifa.
  const muc = fxOf(m, 'Munich')
  const hfa = fxOf(m, 'Haifa')
  const otherSitesFx: Record<string, number> = {}
  for (const [site, fx] of fxBySite(m)) if (site !== 'Munich' && site !== 'Haifa') otherSitesFx[site] = fx

  // Story 6: Silicon Engineering's FY28 gap and the cut line.
  const r28 = assumptionsOf(data, FY28_WORKING)
  const rates28 = ratesOf(r28, fxRatesFromAssumptions(r28), versionFrame(FY28_WORKING), null, data.positions)
  const firstOpen = shiftMonth(
    m.closes.reduce((x, c) => (c.month > x ? c.month : x), m.closes[0].month),
    1,
  )
  const ctx28 = workingAsksContext(data, rates28, firstOpen, m.requests)
  const se = unitOrg(SE)
  const target28 = data.targets.find(
    (t) => t.fiscalYear === 'FY28' && t.businessUnit === SE && !t.department,
  )!
  const date28 = target28.targetDate || '2028-03-31'
  const a28 = asks(se, date28, m.requests, ctx28)
  const ranked = rankAsks(
    m.requests,
    input.story.cycleId,
    (r) => headEffect(r, se, date28, ctx28),
    (r) => bandEffect(r, se, 'FY28', ctx28),
  ).filter((r) => m.requests.find((q) => q.requestId === r.requestId)?.businessUnit === SE)
  const rankedHeads = ranked.reduce((n, r) => n + r.heads, 0)
  const room = target28.targetHeads - (a28.heads - rankedHeads)
  const cutAfter = defaultCutAfter(ranked, room)
  const line = cutLine(ranked, cutAfter)
  const cycleIds = new Set(input.story.cycleAskIds)
  const otherPending = a28.byRequest
    .filter((b) => b.heads !== 0 && !cycleIds.has(b.requestId))
    .map((b) => b.requestId)

  // Story 7.
  const exceptions: Record<string, number> = {}
  for (const e of reconcile(data, AS_OF)) exceptions[e.kind] = (exceptions[e.kind] ?? 0) + 1

  // Story 8: 1550-HSZ's costed people per FY27 month.
  const costedPeople: Record<Month, number> = {}
  for (const month of FY27_MONTHS) {
    const people = new Set<string>()
    for (const l of m.forecast.lines) {
      if (l.month !== month || isCohortLine(l) || l.basis === 'band' || !l.holderId || l.active <= 0) continue
      if (m.latest.get(l.positionId)?.costCenter === '1550-HSZ') people.add(`${l.basis}:${l.holderId}`)
    }
    costedPeople[month] = people.size
  }

  return {
    s1,
    s2,
    s3: { flagged },
    s4: { frozen: frozen.sort(), corporateOpenPlanned, offerStart },
    s5: {
      munich: {
        ...orgFigures(m, siteIs('Munich'), siteCohort('Munich')),
        fx: muc.effect,
        fxMonths: muc.months,
      },
      haifa: { ...orgFigures(m, siteIs('Haifa'), siteCohort('Haifa')), fx: hfa.effect, fxMonths: hfa.months },
      otherSitesFx,
    },
    s6: {
      targetHeads: target28.targetHeads,
      asksHeads: a28.heads,
      gap: target28.targetHeads - a28.heads,
      room,
      cutAfter,
      rankedHeads,
      above: line.headsAbove,
      notSubmitted: notSubmitted(input.story.seManagers, m.requests, input.story.cycleId),
      otherPending,
    },
    s7: { exceptions },
    s8: { costedPeople },
  }
}

/** Story 9: the trade, re-priced at submit and re-routed on the as-of date, and its negative control. */
export function storyNine(m: StoryModel): StoryNine {
  const { input } = m
  const data = input.datasets
  const tradeRow = data.requests.find((r) => r.requestId === input.story.tradeRequestId)!
  const others = m.requests.filter((q) => q.requestId !== tradeRow.requestId)
  const quote = quoteTrade({
    data,
    q1: m.locks.q1,
    parties: input.story.trade,
    on: TRADE_SUBMIT.day,
    firstOpenMonth: TRADE_SUBMIT.firstOpenMonth,
    requests: others,
  })
  const finance = financeActor(input.personas)
  const route = (targetHeadsOverride?: number) =>
    routeTrade({
      w: input.world,
      data,
      trade: tradeRow,
      requests: others,
      closes: m.closes,
      financeApproverId: finance.personId,
      getBandUsd: quote.getBandUsd,
      targetHeadsOverride,
    })
  const routing = route()
  return {
    quote,
    routing,
    storedSteps: (tradeRow.steps ?? []).map((s) => ({ role: s.role, approverId: s.approverId })),
    control: route(routing.asksHeads).steps,
  }
}

export const computeStories = (m: StoryModel): Stories => ({ ...storiesOneToEight(m), s9: storyNine(m) })

/** The stories of a sample in one call. */
export const sampleStories = (input: StoryInput): Stories => computeStories(storyModel(input))
