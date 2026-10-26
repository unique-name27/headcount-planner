/**
 * Forecast > Bridge (docs/PLAN.md 6.8, 9.4): from the comparison's total to the forecast's, one
 * driver at a time (src/plan/engine/bridge.ts), under the cost guard: the start and the end are
 * guarded totals, every step is a displayed difference under 7.2 rule 5 (a step with fewer than 5
 * contributors folds into "Other changes", a step where only band estimates move is a band figure),
 * and in HRBP and Leader mode every total is built from rounded parts, so each step is the
 * difference of two rounded totals. The FX effect of a window is the FX step of that window's
 * bridge. Pure.
 *
 * Readings taken here (views-1 builder, M2):
 *  - Sides: a seat counts on both sides when it is in the scope now. Lines follow the current
 *    hierarchy (docs/PLAN.md 6.5 and 15.1 R26: a locked line stores its positionId and the org is
 *    joined at read time), so the bridge starts on the comparison's total for the scope exactly as
 *    every other "vs" figure reads it. Reading a seat by its lock-date row (the bridge engine's own
 *    option) would start on another total, and the two totals' difference would be the Budget lines
 *    of the 1 to 4 positions that moved, unguarded. Modeled exits and backfills enter as cohort
 *    seats of the scope's own seats' parts (./run.ts), one per unit, currency, part and atom.
 *  - Finance and HR admin with the switch off: each side keeps the members its guarded total keeps
 *    (a unit whose Other is under the minimum is left out; under a filter's share of a unit only its
 *    shown cost centers count), so the bridge starts and ends on the shown totals exactly.
 *  - Rounded modes: the totals before and after each step are summed per cost atom and part (the
 *    filled part, and the band part of seats costed at band at that point of the bridge), each part
 *    rounded down, then added with `sumRounded`, over the atoms with 5 or more costed people on both
 *    sides (the others are left out, with the note). Each step is then the next rounded total less
 *    the last, so the steps close on the end.
 *  - Contributors are the costed positions a step moves (band seats and cohort seats left out); a
 *    step that moves band seats only is a band figure.
 *
 * Readings taken here (finance-guard fix, lead decision D-FIN (c), PLAN change C33):
 *  - Contributor lists never read leave (7.2 rule 1, C26, review RR-1): a position with a month on
 *    unpaid leave is tested on its seats priced with that month paid (./paidTwins.ts, the line the
 *    run gives the seat with the leave paid), so a leave start never adds a seat to a step's list,
 *    its count or its drill.
 *  - Bridge steps and the FX effect show per unit and company only in exact modes (a cost-center,
 *    country, legal-entity or currency filter shows heads, src/cost/fit.ts), and Other changes never
 *    takes in a step another surface publishes (the FX tile) while another step can go (RC-1, RF-5).
 *  - The FX effect tile is read from the same folded result as the bridge row: it shows only when the
 *    window's bridge shows FX as its own step (RC-1).
 *  - Rounded modes: a window of fewer than two months shows no bridge and no FX effect (RR-3).
 *
 * Readings taken here (bridge shape, lead decision C34 and reading R39, M2 close):
 *  - The bridge's shape never reads leave (C34, C26). Which rows show, which steps fold, the band
 *    rows, the contributor counts and lists, and the FX tile's showing are all read from the
 *    leave-neutral seats (`neutralListOf`: a position with an unpaid month by its seats priced
 *    paid). Step values, totals and the band parts' amounts keep the real prices, and the steps
 *    still add up to the end less the start.
 *  - The paid seats are priced from the run's own inputs by the engine that priced each line
 *    (./paidTwins.ts, attack A1, M2 close): before, the twin came from the Working version's line
 *    context at the as-of date, which does not know a person hired after it, so with the reporting
 *    date before the last close a September hire's unpaid line stood in for its own twin and the FX
 *    tile's count and the fold read the leave.
 *  - One fold for every scope of a mode (`globalFold`), decided over grains, the finest sets a
 *    mode's scopes can be differenced down to: business units in exact modes, cost atoms in rounded
 *    modes (every HRBP and Leader scope, and every filter that shows cost there, is a union of
 *    atoms). A step's costed part folds everywhere when some grain has 1 to 4 positions that moved
 *    in it, or when a leave alone could move it in a grain where no position moved
 *    (`LEAVE_MOVABLE`); then Other changes takes in whole steps, chosen company-wide, until every
 *    grain's Other changes holds 5 or more positions that moved. So a step never shows in one scope
 *    and folds in another, and no scope less another reads a grain's folded part.
 *  - Other changes is always a row of a costed bridge (exact and rounded modes): every costed part
 *    that does not show is in it, a band step's costed rest included. So nothing is left for a
 *    Rounding bar, and a row never comes or goes with a leave. With fewer than 5 positions in it
 *    (no grain of the scope has any), the bridge shows no step at all.
 *  - A step whose band seats moved keeps its band part on its row (a band figure, structure), and a
 *    step with no position that moved in a scope is never a row of its own there.
 *  - Periods: the rows are the full year's, and the FX tile reads any window (exact modes take month
 *    and custom periods). FX shows in exact modes only while every unit holds 0 or 5 or more non-USD
 *    positions that moved in each month, so no two windows' tiles less each other read 1 to 4
 *    people; rounded windows (full year, year and quarter to date) are bounded by the LP test.
 *  - The transfers step (6.8 step 7) reads 0 in every scope under R26 (R39): no position enters or
 *    leaves a scope between the two sides, because both join the org at read time. It stays a row at
 *    0 with `TRANSFERS_NOTE` on its card; its costed rest (none under R26) is in Other changes.
 *  - A step's card reads the bridge as shown: its total before is where the step starts on the
 *    waterfall (the start and every row above it), never the engine's running total, which would
 *    give a folded step back as the difference of two cards.
 *  - HR admin with the switch on hides nothing: each scope folds on its own (`foldSteps`).
 */

import { waterfallSteps } from '@/charts/kit/waterfallModel'
import type { WaterfallStep } from '@/charts/types'
import { atomOf } from '@/cost/atoms'
import {
  differenceNote,
  type FoldedSteps,
  foldSteps,
  type GuardedDifference,
  guardedDifference,
  OTHER_CHANGES,
  type StepFacts,
} from '@/cost/differences'
import { isPartialCostFilter, NO_AMOUNTS_NOTE, ROUNDED_SHORT_WINDOW_NOTE } from '@/cost/fit'
import { OTHER } from '@/cost/fold'
import { type CostMember, leftOutNote, peopleOf } from '@/cost/guard'
import type { ISODate, Month } from '@/data/schema'
import { type CalcSpec, calcInput, calcStep } from '@/drill/calc'
import { subtitleOf } from '@/drill/subtitle'
import { roundCostTo, sumRoundedTo } from '@/lib/costRounding'
import {
  BRIDGE_STEP_LABEL,
  BRIDGE_STEPS,
  type BridgeSeat,
  type BridgeStepKey,
  bridge,
  isCohortSeat,
  scopedBridgeSeats,
  seatStagePrices,
} from '@/plan/engine/bridge'
import { type CohortLine, cohortKey } from '@/plan/engine/forecast'
import { fxEffect } from '@/plan/engine/fx'
import { emptyComparisonReason } from '@/plan/engine/variance'
import type { OrgMatch, PlanLine, SeatPlace } from '@/plan/types'
import { isUnpaidLine } from '@/views/lineSource'
import { costSeatOf, managerOfIn, placementOf, versionLinesOf } from '@/views/plan/engine/core'
import { positionsSpec } from '@/views/plan/engine/drill'
import {
  costIdsOf,
  fitOf,
  foldsOf,
  guardEnvOf,
  guardFigure,
  linesIn,
  pooledMembers,
} from '@/views/plan/engine/guarded'
import { ID } from '../metrics'
import type { BridgeStepRow } from '.'
import type { FPrep } from './base'
import { membersInIfBuilt } from './members'
import { paidTwinsOf } from './paidTwins'
import { type ForecastRun, isSpreadLine } from './run'

/** The bridge seats of a scope, with each side's positions. */
interface Sides {
  seats: BridgeSeat[]
  /** Positions on each side (exact: what the guarded totals keep). */
  comparison: ReadonlySet<string>
  forecast: ReadonlySet<string>
  /** Each side's members over the fiscal year, for atoms and contributors. */
  compMembers: readonly CostMember[]
  fcMembers: readonly CostMember[]
  /** The forecast side's lines (seat lines and the scope's cohort lines), for the FX effect. */
  fcLines: readonly PlanLine[]
}

/** A seat key's position, or null for a cohort seat. */
const positionOfSeat = (key: string): string | null => (isCohortSeat(key) ? null : key)

/** A cohort seat's key with its atom and part: 'cohort:<unit>|<currency>|<part>|<atom>'. */
const cohortSeatKey = (unit: string, currency: string, part: string, atom: string): string =>
  `${cohortKey(unit, currency)}|${part}|${atom}`

const ATOM_OF_COHORT = /^cohort:[^|]*\|[^|]*\|([^|]*)\|(.*)$/

const sidesMemo = new WeakMap<FPrep, Sides | null>()

/** The run's seat lines, every position (the spread cohort parts left out), once per run. */
const seatLinesMemo = new WeakMap<ForecastRun, PlanLine[]>()
function seatLinesOf(run: ForecastRun): PlanLine[] {
  let hit = seatLinesMemo.get(run)
  if (!hit) {
    hit = run.lines.filter((l) => !isSpreadLine(l))
    seatLinesMemo.set(run, hit)
  }
  return hit
}

/** A spread line's cohort seat key (with its atom) and the id of its regrouped line. */
interface CohortId {
  key: string
  id: string
}

const cohortIdsMemo = new WeakMap<ForecastRun, WeakMap<object, WeakMap<object, Map<PlanLine, CohortId>>>>()
const NO_ATOMS: object = {}

/**
 * Each spread line's cohort seat key and regrouped line id under the context's atom index (the atom
 * of the line's seat, its manager's for a seat created since the close), once per run, atom index and
 * placement: the same for every scope.
 */
function cohortIdsOf(p: FPrep, run: ForecastRun): Map<PlanLine, CohortId> {
  const ctx = p.ctx
  const atoms = ctx.guard.atoms
  const place = placementOf(ctx)
  let byAtoms = cohortIdsMemo.get(run)
  if (!byAtoms) {
    byAtoms = new WeakMap()
    cohortIdsMemo.set(run, byAtoms)
  }
  const atomsKey = (atoms as object | null) ?? NO_ATOMS
  let byPlace = byAtoms.get(atomsKey)
  if (!byPlace) {
    byPlace = new WeakMap()
    byAtoms.set(atomsKey, byPlace)
  }
  let ids = byPlace.get(place)
  if (!ids) {
    ids = new Map()
    const managerOf = managerOfIn(ctx)
    for (const l of run.lines) {
      if (!isSpreadLine(l)) continue
      const tag = l.spreadOf
      const atom = atomOf(l.positionId, atoms, managerOf) ?? 'none'
      const key = cohortSeatKey(tag.businessUnit, tag.currency, tag.part, atom)
      ids.set(l, { key, id: `${key}|${l.month}` })
    }
    byPlace.set(place, ids)
  }
  return ids
}

/** Each seat's stage prices over a window (`seatStagePrices`), kept per seat: cached seats are shared by scopes. */
const pricesMemo = new WeakMap<BridgeSeat, Map<string, readonly number[]>>()
function pricesOf(seat: BridgeSeat, months: readonly Month[], key: string): readonly number[] {
  let byWindow = pricesMemo.get(seat)
  if (!byWindow) {
    byWindow = new Map()
    pricesMemo.set(seat, byWindow)
  }
  let hit = byWindow.get(key)
  if (!hit) {
    hit = seatStagePrices(seat, months)
    byWindow.set(key, hit)
  }
  return hit
}

/** The scope's bridge seats over the fiscal year (see the module comment); null with no comparison or forecast. */
function sidesOf(p: FPrep): Sides | null {
  if (sidesMemo.has(p)) return sidesMemo.get(p) ?? null
  const out =
    p.comparison && p.run
      ? sidesFor(p, costIdsOf(p.ctx), p.costLines, isPartialCostFilter(p.ctx.filters))
      : null
  sidesMemo.set(p, out)
  return out
}

/**
 * Bridge seats of a cost selection over the fiscal year: each side keeps the members its guarded
 * total keeps (the cost selection's members of each side's lines, pooled as the exact modes pool
 * them), and the forecast side's lines are the selection's seat lines and spread cohort parts
 * regrouped into cohort seats.
 */
function sidesFor(
  p: FPrep,
  cost: ReadonlySet<string>,
  costLines: readonly PlanLine[],
  partial: boolean,
): Sides {
  const v = p.comparison as NonNullable<FPrep['comparison']>
  const run = p.run as ForecastRun
  const ctx = p.ctx
  const months = p.fyMonths
  // Each side's positions, kept as their guarded totals keep them: the cost selection's members of
  // each side's lines (the company's, ./members.ts, once a guarded side has built them; the bridge
  // never builds the shared ones itself, as its seats are also read on their own).
  let compMembers = membersInIfBuilt(ctx, versionLinesOf(ctx, v), months, cost)
  let fcMembers = membersInIfBuilt(ctx, run.lines, months, cost)
  compMembers = pooledMembers(ctx, compMembers, v, partial)
  fcMembers = pooledMembers(ctx, fcMembers, p.working, partial)
  const comparison = new Set(compMembers.map((m) => m.positionId))
  const forecast = new Set(fcMembers.map((m) => m.positionId))
  // The forecast's lines of the forecast side: seat lines, and the spread cohort parts regrouped.
  const ids = cohortIdsOf(p, run)
  const seatLines: PlanLine[] = []
  const cohorts = new Map<string, CohortLine>()
  for (const l of costLines) {
    if (!forecast.has(l.positionId)) continue
    if (!isSpreadLine(l)) {
      seatLines.push(l)
      continue
    }
    const { key, id } = ids.get(l) as CohortId
    let c = cohorts.get(id)
    if (!c) {
      const { spreadOf: _s, weight: _w, ...base } = l
      c = {
        ...base,
        positionId: '',
        heads: 0,
        fte: 0,
        local: { base: 0, bonus: 0, burden: 0, benefits: 0, oneTime: 0, vacancy: 0 },
        usd: { base: 0, bonus: 0, burden: 0, benefits: 0, oneTime: 0, vacancy: 0, equity: 0, loaded: 0 },
        cohort: { ...l.spreadOf, key },
      }
      cohorts.set(id, c)
    }
    c.heads += l.heads
    c.fte += l.fte
    c.local.base += l.local.base
    c.local.bonus += l.local.bonus
    c.local.burden += l.local.burden
    c.local.benefits += l.local.benefits
    c.local.oneTime += l.local.oneTime
    c.local.vacancy += l.local.vacancy
    c.usd.base += l.usd.base
    c.usd.bonus += l.usd.bonus
    c.usd.burden += l.usd.burden
    c.usd.benefits += l.usd.benefits
    c.usd.oneTime += l.usd.oneTime
    c.usd.vacancy += l.usd.vacancy
    c.usd.equity += l.usd.equity
    c.usd.loaded += l.usd.loaded
  }
  const cohortLines = [...cohorts.values()]
  const asOf = ctx.asOf
  const scope: OrgMatch = (place: SeatPlace, on: ISODate) => {
    if (place.positionId == null) return true
    return on < asOf ? comparison.has(place.positionId) : forecast.has(place.positionId)
  }
  // The bridge engine's seats for these lines (`bridgeSeats` of the forecast side's seat lines and
  // these cohort lines), each position's built once per run and shared by every scope.
  const seats = scopedBridgeSeats({
    comparison: v,
    seatLines: seatLinesOf(run),
    cohortLines,
    asOf: run.detail.asOf,
    positions: ctx.all.positions,
    months,
    forecastHas: (id) => forecast.has(id),
    scope,
  })
  const fcLines = [...seatLines, ...cohortLines]
  return { seats, comparison, forecast, compMembers, fcMembers, fcLines }
}

/* ───────────── the company's sides (the exact modes' one fold of steps, C33) ───────────── */

/** A small number for an object, stable while the object lives. */
const objectIds = new WeakMap<object, number>()
let nextObjectId = 1
const objectId = (o: object | null | undefined): number => {
  if (!o) return 0
  let id = objectIds.get(o)
  if (id === undefined) {
    id = nextObjectId++
    objectIds.set(o, id)
  }
  return id
}

const allIdsMemo = new WeakMap<readonly { positionId: string }[], ReadonlySet<string>>()
const companySidesMemo = new WeakMap<ForecastRun, WeakMap<object, WeakMap<object, Map<string, Sides>>>>()

/**
 * The whole company's sides (every position, whole units, pooled as the exact modes pool them), the
 * same whatever the context's filters: the units' step contributors the exact modes' one fold of
 * steps reads (`globalFold`). Kept per run, comparison, placement, atoms, folds and minimum.
 */
function companySidesOf(p: FPrep): Sides | null {
  const v = p.comparison
  const run = p.run
  if (!v || !run) return null
  const ctx = p.ctx
  let all = allIdsMemo.get(ctx.all.positions)
  if (!all) {
    all = new Set(ctx.all.positions.map((r) => r.positionId))
    allIdsMemo.set(ctx.all.positions, all)
  }
  let byComparison = companySidesMemo.get(run)
  if (!byComparison) {
    byComparison = new WeakMap()
    companySidesMemo.set(run, byComparison)
  }
  let byPlace = byComparison.get(v)
  if (!byPlace) {
    byPlace = new WeakMap()
    byComparison.set(v, byPlace)
  }
  const place = placementOf(ctx)
  let byKey = byPlace.get(place)
  if (!byKey) {
    byKey = new Map()
    byPlace.set(place, byKey)
  }
  const key = [
    objectId(ctx.guard.atoms),
    objectId(foldsOf(ctx, v)),
    objectId(foldsOf(ctx, p.working)),
    ctx.guard.rules.minCosted,
    p.fyMonths.join(','),
  ].join('|')
  let hit = byKey.get(key)
  if (!hit) {
    hit = sidesFor(p, all, run.lines, false)
    if (byKey.size > 8) byKey.clear()
    byKey.set(key, hit)
  }
  return hit
}

/* ───────────── leave-neutral seats (7.2 rule 1, C26, review RR-1, C34) ───────────── */

/** Seats priced with every unpaid-leave month paid: the bridge's shape reads these, never leave. */
interface NeutralSeats {
  /** The positions with a month on unpaid leave (their shape reads `seats`). */
  positions: ReadonlySet<string>
  /** Their seats from their lines with each unpaid month priced as paid. */
  seats: readonly BridgeSeat[]
}

const NO_NEUTRAL: NeutralSeats = { positions: new Set(), seats: [] }

const paidLinesMemo = new WeakMap<ForecastRun, { positions: ReadonlySet<string>; lines: PlanLine[] }>()

/** The run's seat lines of positions with an unpaid month, those months priced as paid (once per run). */
function paidSeatLines(run: ForecastRun): { positions: ReadonlySet<string>; lines: PlanLine[] } {
  let hit = paidLinesMemo.get(run)
  if (!hit) {
    const seatLines = seatLinesOf(run)
    const positions = new Set<string>()
    for (const l of seatLines) if (l.positionId && isUnpaidLine(l)) positions.add(l.positionId)
    const lines: PlanLine[] = []
    // Each unpaid line by the line the run gives it with the leave paid (./paidTwins.ts, C34, A1).
    const twins = paidTwinsOf(run)
    for (const l of seatLines)
      if (positions.has(l.positionId)) lines.push(isUnpaidLine(l) ? (twins.get(l) ?? l) : l)
    hit = { positions, lines }
    paidLinesMemo.set(run, hit)
  }
  return hit
}

const neutralMemo = new WeakMap<Sides, NeutralSeats>()

/** The sides' seats of positions with an unpaid month, built from their paid lines (cached per sides). */
function neutralSeatsOf(p: FPrep, sides: Sides): NeutralSeats {
  const hit = neutralMemo.get(sides)
  if (hit) return hit
  const v = p.comparison
  const run = p.run
  let out = NO_NEUTRAL
  if (v && run) {
    const paid = paidSeatLines(run)
    const positions = new Set([...paid.positions].filter((id) => sides.forecast.has(id)))
    if (positions.size) {
      const asOf = p.ctx.asOf
      const scope: OrgMatch = (place: SeatPlace, on: ISODate) => {
        if (place.positionId == null || !positions.has(place.positionId)) return false
        return on < asOf ? sides.comparison.has(place.positionId) : sides.forecast.has(place.positionId)
      }
      const seats = scopedBridgeSeats({
        comparison: v,
        seatLines: paid.lines,
        cohortLines: [],
        asOf: run.detail.asOf,
        positions: p.ctx.all.positions,
        months: p.fyMonths,
        forecastHas: (id) => positions.has(id) && sides.forecast.has(id),
        scope,
      })
      out = { positions, seats }
    }
  }
  neutralMemo.set(sides, out)
  return out
}

const listMemo = new WeakMap<Sides, readonly BridgeSeat[]>()

/**
 * The sides' seats as the bridge's shape reads them (C34): a position with a month on unpaid leave
 * by its paid seats (`neutralSeatsOf`), every other seat and every cohort seat as it is. Cached per
 * sides.
 */
function neutralListOf(p: FPrep, sides: Sides): readonly BridgeSeat[] {
  const hit = listMemo.get(sides)
  if (hit) return hit
  const n = neutralSeatsOf(p, sides)
  const out = n.positions.size
    ? [...sides.seats.filter((s) => isCohortSeat(s.positionId) || !n.positions.has(s.positionId)), ...n.seats]
    : sides.seats
  listMemo.set(sides, out)
  return out
}

/** A seat's part at a stage of the bridge: band when its basis then is band. */
function partAt(seat: BridgeSeat, stage: number): 'filled' | 'band' {
  const m = ATOM_OF_COHORT.exec(seat.positionId)
  if (m) return m[1] === 'band' ? 'band' : 'filled'
  const payRateAt = BRIDGE_STEPS.indexOf('payRate') + 1
  const side = stage >= payRateAt ? (seat.forecast ?? seat.comparison) : (seat.comparison ?? seat.forecast)
  return side?.basis === 'band' ? 'band' : 'filled'
}

/** Each seat's price at each stage: 0 (nothing from the forecast) to 8 (everything). */
function stagePrices(seats: readonly BridgeSeat[], months: readonly Month[]): number[][] {
  const key = months.join(',')
  const rows = seats.map((s) => pricesOf(s, months, key))
  const out: number[][] = []
  for (let k = 0; k <= BRIDGE_STEPS.length; k++) out.push(rows.map((r) => r[k]))
  return out
}

/** Whether a seat is costed at band on both sides (a band seat: never a contributor, 7.2 rule 5). */
const bandSeat = (s: BridgeSeat): boolean =>
  (s.comparison?.basis ?? 'band') === 'band' && (s.forecast?.basis ?? 'band') === 'band'

/** A seat whose every move is a band figure: a band seat, or a band cohort's modeled exits and backfills. */
const bandMover = (s: BridgeSeat): boolean => {
  const m = ATOM_OF_COHORT.exec(s.positionId)
  return m ? m[1] === 'band' : !isCohortSeat(s.positionId) && bandSeat(s)
}

/** Positions every seat of which is costed at band on both sides (exact modes: never contributors). */
function bandPositionsOf(seats: readonly BridgeSeat[]): ReadonlySet<string> {
  const costed = new Set<string>()
  const banded = new Set<string>()
  for (const s of seats) {
    if (isCohortSeat(s.positionId)) continue
    if (bandSeat(s)) banded.add(s.positionId)
    else costed.add(s.positionId)
  }
  return new Set([...banded].filter((id) => !costed.has(id)))
}

/** A cohort seat's atom, or a position's (its manager's for a seat created since the close). */
function seatAtomOf(p: FPrep): (s: BridgeSeat) => string | null {
  const atoms = p.ctx.guard.atoms
  const managerOf = managerOfIn(p.ctx)
  return (s) => {
    const m = ATOM_OF_COHORT.exec(s.positionId)
    if (m) return m[2] === 'none' ? null : m[2]
    return atomOf(s.positionId, atoms, managerOf)
  }
}

/* ───────────── rounded modes: the atoms both sides keep ───────────── */

/** The atoms with the minimum or more costed people on both sides, and the people left out. */
interface Kept {
  atoms: ReadonlySet<string>
  leftPeople: number
}

const keptMemo = new WeakMap<Sides, Map<number, Kept>>()

/** Rounded modes: the sides' atoms with the minimum costed people on both sides (costed people never read leave). */
function keptOf(sides: Sides, min: number): Kept {
  let byMin = keptMemo.get(sides)
  if (!byMin) {
    byMin = new Map()
    keptMemo.set(sides, byMin)
  }
  const hit = byMin.get(min)
  if (hit) return hit
  const costed = (members: readonly CostMember[]) => {
    const by = new Map<string, CostMember[]>()
    for (const m of members) {
      if (!m.atomId) continue
      const l = by.get(m.atomId) ?? []
      l.push(m)
      by.set(m.atomId, l)
    }
    return new Map([...by].map(([a, ms]) => [a, peopleOf(ms).size]))
  }
  const a = costed(sides.compMembers)
  const b = costed(sides.fcMembers)
  const atoms = new Set([...a.keys()].filter((x) => (a.get(x) ?? 0) >= min && (b.get(x) ?? 0) >= min))
  const left = new Set<string>()
  for (const m of [...sides.compMembers, ...sides.fcMembers])
    if (!m.atomId || !atoms.has(m.atomId)) for (const x of m.people) left.add(x)
  const out = { atoms, leftPeople: left.size }
  byMin.set(min, out)
  return out
}

/* ───────────── the bridge's shape, from the leave-neutral seats (C34) ───────────── */

/** What decides a step's row in one scope, read from the leave-neutral seats only. */
interface StepShape {
  /** The costed positions whose amount the step moves (7.2 rule 5). */
  movers: ReadonlySet<string>
  /** Some band seat or band cohort moved (structure: it reads no pay, offer or leave). */
  bandAny: boolean
  /** Something moved, and only band seats and band cohorts did: a band figure. */
  bandOnly: boolean
  /** Some costed seat moved: a costed position, its vacancy allowance, or an HRIS cohort's exits. */
  costed: boolean
  /** The band seats that moved (positions). */
  bandMoved: ReadonlySet<string>
}

interface Shape {
  steps: readonly StepShape[]
  /**
   * The band seats' and band cohorts' own total at each stage (exact: their sum; rounded: per kept
   * atom, rounded down, then `sumRounded`). It reads no pay, offer or leave.
   */
  bandTotals: readonly number[]
}

const shapeMemo = new WeakMap<Sides, Map<string, Shape>>()
const keySets = new WeakMap<ReadonlySet<string>, number>()
let nextKeySet = 1

/**
 * The bridge's shape over a window (see the module comment): who moved in each step, whether band
 * seats moved, whether only they did, and the band seats' own totals, all on the leave-neutral seats.
 * Exact modes (`kept` null) count every seat and leave out the positions every seat of which is at
 * band; rounded modes count the seats of the kept atoms only (the rounded totals hold no other) and
 * leave out each band seat. Kept per sides, window and kept atoms.
 */
function shapeOf(p: FPrep, sides: Sides, months: readonly Month[], kept: ReadonlySet<string> | null): Shape {
  let byKey = shapeMemo.get(sides)
  if (!byKey) {
    byKey = new Map()
    shapeMemo.set(sides, byKey)
  }
  let keptId = 0
  if (kept) {
    keptId = keySets.get(kept) ?? 0
    if (!keptId) {
      keptId = nextKeySet++
      keySets.set(kept, keptId)
    }
  }
  const step = p.env.rules.floorUsd
  const key = `${months.join(',')}|${keptId}|${step}`
  const hit = byKey.get(key)
  if (hit) return hit
  const list = neutralListOf(p, sides)
  const prices = stagePrices(list, months)
  const rounded = kept != null
  const atomOfSeat = seatAtomOf(p)
  const seatAtom = rounded ? list.map(atomOfSeat) : []
  const counted = list.map((_, j) => {
    if (!kept) return true
    const a = seatAtom[j]
    return a != null && kept.has(a)
  })
  const bandPositions = rounded ? new Set<string>() : bandPositionsOf(list)
  const steps = BRIDGE_STEPS.map((_, i): StepShape => {
    const movers = new Set<string>()
    const bandMoved = new Set<string>()
    let bandAny = false
    let costed = false
    list.forEach((s, j) => {
      if (!counted[j] || Math.abs(prices[i + 1][j] - prices[i][j]) <= 0.005) return
      const id = positionOfSeat(s.positionId)
      if (bandMover(s)) {
        bandAny = true
        if (id) bandMoved.add(id)
        // Exact modes count a band seat of a position that is also costed (as they always did).
        if (!rounded && id && !bandPositions.has(id)) {
          costed = true
          movers.add(id)
        }
        return
      }
      costed = true
      if (id && !bandPositions.has(id)) movers.add(id)
    })
    return { movers, bandAny, bandOnly: bandAny && !costed, costed, bandMoved }
  })
  const bandIdx: number[] = []
  list.forEach((s, j) => {
    if (counted[j] && bandMover(s)) bandIdx.push(j)
  })
  const bandTotals = prices.map((row) => {
    if (!rounded) {
      let t = 0
      for (const j of bandIdx) t += row[j]
      return t
    }
    const parts = new Map<string, number>()
    for (const j of bandIdx) {
      const a = seatAtom[j] as string
      parts.set(a, (parts.get(a) ?? 0) + row[j])
    }
    return sumRoundedTo(
      [...parts.values()].map((v) => roundCostTo(v, step)),
      step,
    )
  })
  const out: Shape = { steps, bandTotals }
  // The year's windows and its twelve one-month windows (the exact modes' FX check) all fit.
  if (byKey.size > 40) byKey.clear()
  byKey.set(key, out)
  return out
}

/* ───────────── a window's bridge ───────────── */

/** One step of a window's bridge, before the fold. */
export interface StepValue {
  key: BridgeStepKey
  label: string
  /** The step's amount, at the real prices (the steps add up to the end less the start). */
  value: number
  /** The costed positions the step moves, on the leave-neutral seats (7.2 rule 5, C26). */
  contributors: Set<string>
  /** Only band seats and band cohorts moved, on the leave-neutral seats: a band figure. */
  band: boolean
  /**
   * The step's band part: what the band seats and band cohorts alone move (exact: Σ their moves to
   * the cent; rounded: the difference of their rounded subtotals, per atom). It reads no pay, offer
   * or leave, so it stays on the step's row when the costed part folds into Other changes.
   */
  bandValue: number
  /** The band subtotals before and after the step (the band row's card). */
  bandBefore: number
  bandAfter: number
  /** The band seats whose amount moved in the step (positions only). */
  bandMoved: Set<string>
  /** Some band seat or band cohort moved in the step (structure: it reads no pay, offer or leave). */
  bandAny: boolean
  /**
   * Some costed seat moved in the step on the leave-neutral seats: a costed position, its vacancy
   * allowance, or an HRIS cohort's modeled exits (which are not positions, so not contributors).
   */
  moves: boolean
}

export interface BridgeWindow {
  start: number | null
  end: number | null
  steps: StepValue[]
  /** "n people in groups under 5 are left out" (rounded), else null. */
  note: string | null
  /** Why every amount reads "—", else null. */
  reason: string | null
}

const windowMemo = new WeakMap<FPrep, Map<string, BridgeWindow>>()

/** A window's bridge under the guard (see the module comment). */
export function bridgeWindow(p: FPrep, months: readonly Month[]): BridgeWindow {
  let byKey = windowMemo.get(p)
  if (!byKey) {
    byKey = new Map()
    windowMemo.set(p, byKey)
  }
  const key = months.join(',')
  const hit = byKey.get(key)
  if (hit) return hit
  const out = computeWindow(p, months)
  byKey.set(key, out)
  return out
}

function computeWindow(p: FPrep, months: readonly Month[]): BridgeWindow {
  const env = guardEnvOf(p.ctx)
  const none = (reason: string): BridgeWindow => ({ start: null, end: null, steps: [], note: null, reason })
  if (!p.comparison) {
    const locked = p.ctx.versions.some((x) => x.state === 'locked' && x.fiscalYear === p.fiscalYear)
    return none(emptyComparisonReason(p.fiscalYear, locked))
  }
  if (env.mode === 'none') return none(NO_AMOUNTS_NOTE)
  const fit = fitOf(p.ctx, p.working)
  if (fit) return none(fit)
  if (!months.length) return none('No closed month in this window yet.')
  // A one-month window in a rounded mode is that month's cost per team (RR-3, C21); under `month`
  // and `custom` the period note above already says so.
  const period = p.ctx.filters.period
  const rounded = env.mode === 'rounded'
  if (rounded && months.length < 2 && period !== 'month' && period !== 'custom')
    return none(ROUNDED_SHORT_WINDOW_NOTE)
  const sides = sidesOf(p)
  if (!sides) return none('No forecast for this fiscal year.')
  if (!rounded) {
    // Both totals must show (5 or more costed people each), as they do elsewhere.
    const a = guardFigure(p.ctx, { members: sides.compMembers, version: p.comparison, fit: null })
    const b = guardFigure(p.ctx, { members: sides.fcMembers, version: p.working, fit: null })
    if (a.total.totalUsd == null || b.total.totalUsd == null)
      return none(a.total.reason ?? b.total.reason ?? 'Hidden')
  }
  const kept = rounded ? keptOf(sides, env.rules.minCosted) : null
  // Every fact of the step's shape reads the leave-neutral seats (C34); its value the real prices.
  const shape = shapeOf(p, sides, months, kept?.atoms ?? null)
  const facts = (i: number) => {
    const sh = shape.steps[i]
    const before = shape.bandTotals[i]
    const after = shape.bandTotals[i + 1]
    return {
      contributors: new Set(sh.movers),
      band: sh.bandOnly,
      bandAny: sh.bandAny,
      moves: sh.costed,
      bandValue: rounded ? after - before : Math.round((after - before) * 100) / 100 + 0,
      bandBefore: before,
      bandAfter: after,
      bandMoved: new Set(sh.bandMoved),
    }
  }
  const seats = sides.seats
  if (kept) {
    const prices = stagePrices(seats, months)
    const step = env.rules.floorUsd
    const seatAtom = seats.map(seatAtomOf(p))
    const totals = prices.map((row, stage) => {
      const parts = new Map<string, number>()
      seats.forEach((s, j) => {
        const atom = seatAtom[j]
        if (!atom || !kept.atoms.has(atom)) return
        const k = `${atom}|${partAt(s, stage)}`
        parts.set(k, (parts.get(k) ?? 0) + row[j])
      })
      return sumRoundedTo(
        [...parts.values()].map((v) => roundCostTo(v, step)),
        step,
      )
    })
    const steps = BRIDGE_STEPS.map(
      (k, i): StepValue => ({
        key: k,
        label: BRIDGE_STEP_LABEL[k],
        value: totals[i + 1] - totals[i],
        ...facts(i),
      }),
    )
    return {
      start: totals[0],
      end: totals[totals.length - 1],
      steps,
      note: kept.leftPeople ? leftOutNote(kept.leftPeople, env.rules.minCosted) : null,
      reason: kept.atoms.size ? null : 'No team has 5 or more costed people on both sides.',
    }
  }
  const windowKey = months.join(',')
  const r = bridge(
    {
      fiscalYear: p.fiscalYear,
      comparison: { versionId: p.comparison.versionId, label: p.comparison.name, fiscalYear: p.fiscalYear },
      yearHasLockedVersion: true,
      months,
      seats,
    },
    (seat) => pricesOf(seat, months, windowKey),
  )
  if (r.kind === 'empty') return none(r.reason)
  const steps = r.steps.map(
    (s, i): StepValue => ({ key: s.key, label: s.label, value: s.amount, ...facts(i) }),
  )
  return { start: r.start, end: r.end, steps, note: null, reason: null }
}

/* ───────────── the fold (7.2 rule 5, C33 (c), C34) ───────────── */

/** A step as the fold reads it: the whole step, its band part, or its costed part. */
export interface StepFact extends StepFacts {
  step: StepValue
  part: 'whole' | 'band' | 'costed'
}

const NOBODY: ReadonlySet<string> = new Set()
const NO_STEPS: ReadonlySet<BridgeStepKey> = new Set()

/** Whole cents. */
const toCents = (v: number): number => Math.round(v * 100)

/**
 * What HR admin's fold with the switch on reads of one step (7.2 rules 3 and 5; the guarded modes
 * fold in `foldedOf` instead):
 *  - a step that moves band seats only is a band figure, never folded (rounded modes: its band
 *    seats' own rounded subtotals);
 *  - a step with the minimum contributors or more shows whole;
 *  - a step with 1 to 4 contributors keeps its band part on its row as a band figure, and its
 *    costed part (the rest, with the contributors) folds into Other changes;
 *  - a step that moves no band seat folds whole.
 */
export function stepFacts(s: StepValue, min: number, rounded: boolean): StepFact[] {
  if (s.band)
    return [
      {
        key: s.key,
        delta: rounded ? s.bandValue : s.value,
        contributors: NOBODY,
        band: true,
        step: s,
        part: 'band',
      },
    ]
  if (s.contributors.size >= min || !s.bandAny)
    return [
      { key: s.key, delta: s.value, contributors: s.contributors, moves: s.moves, step: s, part: 'whole' },
    ]
  return [
    { key: s.key, delta: s.bandValue, contributors: NOBODY, band: true, step: s, part: 'band' },
    {
      key: `${s.key}:costed`,
      delta: Math.round((s.value - s.bandValue) * 100) / 100 + 0,
      contributors: s.contributors,
      moves: s.moves,
      step: s,
      part: 'costed',
    },
  ]
}

/** The words every step's card carries, whatever the step shows (so the card never says which). */
export const stepCardNote = (min: number): string =>
  `Band estimates of Open and Planned seats stay on their step. Changes of fewer than ${min} costed positions are in Other changes.`

/**
 * What every step's card says in HR admin with the switch on, where nothing folds (PLAN 7.5; M4
 * review SA-4, recheck SA-4-a): no Other changes to send a small change to.
 */
export const OPEN_STEP_CARD_NOTE =
  'In HR admin mode with pay amounts shown nothing folds: every step is its own row, band estimates of Open and Planned seats included.'

/** The transfers step's card note (R39: under R26 the step reads 0 in every scope). */
export const TRANSFERS_NOTE =
  'Moved seats carry their plan with them, so a move between orgs shows in the other steps, not here.'

/**
 * Steps another surface publishes on its own (the FX effect tile, `forecast.fx.effect`): Other
 * changes never takes one in while another step can go (C33, RC-1: Other changes less the FX tile
 * gave one position's cost change).
 */
export const PUBLISHED_STEPS: ReadonlySet<string> = new Set<BridgeStepKey>(['fx'])

/**
 * The steps a leave alone can move with no position counted (C34). A leave turns a holder's unpaid
 * months' pay to 0, which changes the seat's forecast-side active fraction (timing) and can move
 * the line its rates are read from (FTE: mix; pay rate and basis: pay rate; bonus, burden and
 * benefits rates: assumption rates). The other drivers come from position rows and the comparison
 * (positions: whether the seat exists; attrition: retention and the comparison's allowance;
 * transfers: whether the seat is in the scope), or move a seat only where its paid twin moves too
 * (FX: the seat's rates differ from the plan rates wherever it has a local amount), so outside this
 * set a leave moves a step only where a position that moved is counted.
 */
export const LEAVE_MOVABLE: ReadonlySet<BridgeStepKey> = new Set<BridgeStepKey>([
  'timing',
  'mix',
  'payRate',
  'assumptionRates',
])

const globalMemo = new WeakMap<Sides, Map<string, ReadonlySet<BridgeStepKey>>>()
const monthSafeMemo = new WeakMap<Sides, Map<number, boolean>>()

/**
 * Exact modes: whether every unit holds 0 or `min` or more non-USD positions whose FX moved in each
 * month of the fiscal year (the leave-neutral shape of each one-month window), so no difference of
 * two windows' FX effects isolates 1 to 4 of them. Kept per sides and minimum.
 */
function fxMonthSafe(p: FPrep, sides: Sides, grainOf: (id: string) => string, min: number): boolean {
  let byMin = monthSafeMemo.get(sides)
  if (!byMin) {
    byMin = new Map()
    monthSafeMemo.set(sides, byMin)
  }
  const hit = byMin.get(min)
  if (hit !== undefined) return hit
  const fx = BRIDGE_STEPS.indexOf('fx')
  let safe = true
  for (const m of p.fyMonths) {
    const by = new Map<string, number>()
    for (const id of shapeOf(p, sides, [m], null).steps[fx].movers) {
      const g = grainOf(id)
      by.set(g, (by.get(g) ?? 0) + 1)
    }
    if ([...by.values()].some((n) => n > 0 && n < min)) {
      safe = false
      break
    }
  }
  byMin.set(min, safe)
  return safe
}

/**
 * The guarded modes' one fold of steps (C33 (c), C34): the steps whose costed part is in Other
 * changes in every scope of the mode, decided once per comparison and window from the leave-neutral
 * shape of the company's seats, grain by grain (see the module comment: units in exact modes, kept
 * atoms in rounded modes). A step folds when
 *  - some grain has 1 to 4 positions that moved in it (rule 5), or
 *  - it is `LEAVE_MOVABLE` and some grain with costed people has no position that moved in it, since
 *    that grain's part of the step would be leave alone, read as a scope less the others;
 *  - it is FX, in exact modes, and some unit holds 1 to 4 non-USD positions that moved in some month
 *    (`fxMonthSafe`): the FX tile shows for any month and custom window there, so two windows less
 *    each other must never read a month of 1 to 4;
 * then, while some grain's Other changes holds fewer than the minimum positions that moved, the step
 * that brings the most such grains to the minimum joins it, everywhere (the fewest positions
 * company-wide first, ties to the first in order; the published FX step only when no other can).
 * Nothing here reads leave, so a leave flip changes no fold; HR admin with the switch on has none.
 */
export function globalFold(p: FPrep, months: readonly Month[]): ReadonlySet<BridgeStepKey> {
  const mode = p.env.mode
  if (mode !== 'exact' && mode !== 'rounded') return NO_STEPS
  const sides = companySidesOf(p)
  if (!sides) return NO_STEPS
  const min = p.env.rules.minContributors
  let byWindow = globalMemo.get(sides)
  if (!byWindow) {
    byWindow = new Map()
    globalMemo.set(sides, byWindow)
  }
  const key = `${months.join(',')}|${min}|${mode}|${p.env.rules.minCosted}|${p.env.rules.floorUsd}`
  const hit = byWindow.get(key)
  if (hit) return hit
  const rounded = mode === 'rounded'
  const kept = rounded ? keptOf(sides, p.env.rules.minCosted).atoms : null
  const shape = shapeOf(p, sides, months, kept)
  const atoms = p.ctx.guard.atoms
  const managerOf = managerOfIn(p.ctx)
  const seatOf = costSeatOf(p.ctx)
  const grainOf = (id: string): string =>
    rounded ? (atomOf(id, atoms, managerOf) ?? '') : (seatOf(id)?.businessUnit ?? '')
  // Each grain's movers by step: every kept atom (rounded); every unit with a costed person (exact).
  const by = new Map<string, Set<string>[]>()
  const of = (g: string): Set<string>[] => {
    let x = by.get(g)
    if (!x) {
      x = BRIDGE_STEPS.map(() => new Set<string>())
      by.set(g, x)
    }
    return x
  }
  if (kept) for (const a of kept) of(a)
  else
    for (const m of [...sides.compMembers, ...sides.fcMembers])
      if (m.part === 'filled' && m.people.length) of(m.seat.businessUnit)
  shape.steps.forEach((sh, i) => {
    for (const id of sh.movers) of(grainOf(id))[i].add(id)
  })
  const grains = [...by.keys()].sort()
  const folded = new Set<BridgeStepKey>()
  BRIDGE_STEPS.forEach((k, i) => {
    for (const g of grains) {
      const n = (by.get(g) as Set<string>[])[i].size
      if ((n > 0 && n < min) || (n === 0 && LEAVE_MOVABLE.has(k))) folded.add(k)
    }
  })
  // Exact modes show the FX tile for any month and custom window, so two windows' tiles less each
  // other are a window too: FX folds in every window unless each unit holds 0 or the minimum or more
  // non-USD positions that moved in every month of the year (rule 5 by month; rounded windows are
  // the LP test's, src/cost/costLp.slow.test.ts).
  if (!rounded && !fxMonthSafe(p, sides, grainOf, min)) folded.add('fx')
  const otherWith = (g: string, extra: BridgeStepKey | null): number => {
    const steps = by.get(g) as Set<string>[]
    const people = new Set<string>()
    BRIDGE_STEPS.forEach((k, i) => {
      if (folded.has(k) || k === extra) for (const id of steps[i]) people.add(id)
    })
    return people.size
  }
  const company = (k: BridgeStepKey): number => shape.steps[BRIDGE_STEPS.indexOf(k)].movers.size
  for (;;) {
    const short = grains.filter((g) => otherWith(g, null) < min)
    if (!short.length) break
    const cands = BRIDGE_STEPS.filter(
      (k, i) => !folded.has(k) && short.some((g) => (by.get(g) as Set<string>[])[i].size > 0),
    )
    if (!cands.length) break
    const free = cands.filter((k) => !PUBLISHED_STEPS.has(k))
    const pool = free.length ? free : cands
    const fixes = (k: BridgeStepKey): number => short.filter((g) => otherWith(g, k) >= min).length
    let pick = pool[0]
    for (const k of pool) {
      const a = fixes(k)
      const b = fixes(pick)
      if (a > b || (a === b && company(k) < company(pick))) pick = k
    }
    folded.add(pick)
  }
  if (byWindow.size > 16) byWindow.clear()
  byWindow.set(key, folded)
  return folded
}

/**
 * A window's steps after the fold (7.2 rule 5, C34). Guarded modes (exact and rounded): a step shows
 * whole only when it is not in the one fold (`globalFold`) and 5 or more positions moved in it; else
 * its band part stays on its row where band seats moved (and the transfers step always keeps its
 * row, R39), and its costed part, or the whole step, is in Other changes, which is always there.
 * HR admin with the switch on: no fold at all (PLAN 7.5 "exact totals with no minimum", 14.1 "no
 * folds and no suppression"; M4 review SA-4): every step is its own row, transfers included, and
 * there is no Other changes row. Manager mode (no amounts): each scope's own fold, as before.
 */
export function foldedOf(p: FPrep, w: BridgeWindow, months: readonly Month[]): FoldedSteps<StepFact> {
  const env = guardEnvOf(p.ctx)
  const min = env.rules.minContributors
  const order = (f: StepFact) => BRIDGE_STEPS.indexOf(f.step.key)
  if (env.mode === 'open') {
    const shown: StepFact[] = w.steps.map((s) => ({
      key: s.key,
      delta: s.value,
      contributors: s.contributors,
      moves: s.moves,
      step: s,
      part: 'whole',
    }))
    return { shown: shown.sort((a, b) => order(a) - order(b)), other: null }
  }
  if (env.mode !== 'exact' && env.mode !== 'rounded') {
    const transfers = w.steps.filter((s) => s.key === 'transfers')
    const facts = w.steps.filter((s) => s.key !== 'transfers').flatMap((s) => stepFacts(s, min, false))
    const f = foldSteps(facts, min, { published: PUBLISHED_STEPS })
    const kept: StepFact[] = transfers.map((s) => ({
      key: s.key,
      delta: s.value,
      contributors: s.contributors,
      step: s,
      part: 'whole',
    }))
    return { shown: [...f.shown, ...kept].sort((a, b) => order(a) - order(b)), other: f.other }
  }
  const forced = globalFold(p, months)
  const shown: StepFact[] = []
  const folded: StepFact[] = []
  for (const s of w.steps) {
    if (!s.band && !forced.has(s.key) && s.contributors.size >= min) {
      shown.push({
        key: s.key,
        delta: s.value,
        contributors: s.contributors,
        moves: s.moves,
        step: s,
        part: 'whole',
      })
      continue
    }
    if (s.band || s.bandAny || s.key === 'transfers') {
      shown.push({ key: s.key, delta: s.bandValue, contributors: NOBODY, band: true, step: s, part: 'band' })
      folded.push({
        key: `${s.key}:costed`,
        delta: (toCents(s.value) - toCents(s.bandValue)) / 100 + 0,
        contributors: s.contributors,
        moves: s.moves,
        step: s,
        part: 'costed',
      })
    } else
      folded.push({
        key: s.key,
        delta: s.value,
        contributors: s.contributors,
        moves: s.moves,
        step: s,
        part: 'whole',
      })
  }
  const people = new Set<string>()
  for (const f of folded) for (const id of f.contributors) people.add(id)
  return {
    shown,
    other: {
      key: OTHER,
      label: OTHER_CHANGES,
      delta: folded.reduce((a, f) => a + toCents(f.delta), 0) / 100 + 0,
      contributors: people.size,
      steps: folded,
    },
  }
}

/* ───────────── rows and cards ───────────── */

/** What a step's card reads beside the step. */
interface CardInput {
  /** The step shows whole (its positions and the totals around it), else its band part only. */
  whole: boolean
  /** The row's shown value (null: "—"). */
  value: number | null
  /** Where the row starts on the waterfall: the start and every row above it. */
  before: number
  /** The row's "Positions that moved" (null: not shown). */
  positions: number | null
}

/**
 * A step's card, one layout for every step (7.2 rules 3 and 5): the band seats' subtotals before and
 * after the step and its band part; then, only when the step shows whole (5 or more positions that
 * moved), the totals around it on the waterfall, the positions that moved and the costed part. A
 * step that shows its band part only has the same labels with "—" in the costed lines, so the card's
 * shape never tells a band step from one whose costed part folded. The totals are the bridge as
 * shown, so two cards never give back a folded part.
 */
function driverCard(p: FPrep, s: StepValue, o: CardInput): CalcSpec {
  const { whole, value, before } = o
  const shown = value != null
  const after = shown ? (toCents(before) + toCents(value)) / 100 : null
  const band = shown ? (whole ? s.bandValue : value) : null
  const costed = shown && whole && band != null ? (toCents(value) - toCents(band)) / 100 + 0 : null
  const rounded = p.env.mode === 'rounded'
  const notes = [
    p.env.mode === 'open' ? OPEN_STEP_CARD_NOTE : stepCardNote(p.env.rules.minContributors),
    s.key === 'transfers' ? TRANSFERS_NOTE : null,
  ]
  return {
    title: `Bridge step: ${s.label}`,
    subtitle: subtitleOf(p.fiscalYear, p.ctx.scopeLabel, p.comparison?.name),
    metricId: ID.bridgeStep,
    value,
    format: rounded ? 'moneyM' : 'money',
    inputs: [
      calcInput(
        'Open and Planned at band estimate before this step',
        shown ? s.bandBefore : null,
        'money',
        rounded
          ? 'Band seats per team, rounded down to $0.1M, then added'
          : 'Band midpoint × FTE with standard loads, plan rates',
      ),
      calcInput(
        'Open and Planned at band estimate after this step',
        shown ? s.bandAfter : null,
        'money',
        'The same seats with this driver from the forecast',
      ),
      calcInput(
        'Total before this step',
        shown && whole ? before : null,
        'money',
        'Where this step starts on the bridge: the start and every row above it',
      ),
      calcInput(
        'Total after this step',
        shown && whole ? after : null,
        'money',
        'The total before this step, plus this step',
      ),
      calcInput('Positions that moved', o.positions, 'int', 'Costed positions only'),
    ],
    steps: shown
      ? [
          calcStep(
            'Open and Planned at band estimate',
            `${fmtUsd(s.bandAfter)} − ${fmtUsd(s.bandBefore)}`,
            band,
            'money',
          ),
          calcStep(
            'Costed positions',
            costed != null ? `${fmtUsd(after)} − ${fmtUsd(before)} − ${fmtUsd(band)}` : '—',
            costed,
            'money',
          ),
          calcStep(
            s.label,
            costed != null ? `${fmtUsd(band)} + ${fmtUsd(costed)}` : fmtUsd(band),
            value,
            'money',
          ),
        ]
      : [
          calcStep('Open and Planned at band estimate', '—', null, 'money'),
          calcStep('Costed positions', '—', null, 'money'),
          calcStep(s.label, '—', null, 'money'),
        ],
    note: notes.filter(Boolean).join(' '),
    uses: p.uses(),
  }
}

/**
 * The bridge's rows: start, the shown steps (whole, or their band part), Other changes, Rounding when
 * a rounded waterfall leaves anything (it does not since C34), end.
 */
export function bridgeRows(p: FPrep): { rows: BridgeStepRow[]; empty: string | null; note: string | null } {
  const env = guardEnvOf(p.ctx)
  const w = bridgeWindow(p, p.fyMonths)
  const v = p.comparison
  if (w.reason || w.start == null || w.end == null)
    return { rows: [], empty: w.reason ?? 'Hidden', note: null }
  const min = env.rules.minContributors
  const guarded = env.mode === 'exact' || env.mode === 'rounded'
  const folded = foldedOf(p, w, p.fyMonths)
  // Other changes holds every costed part that does not show (C34): under the minimum (no grain of
  // the scope has 5 or more positions that moved), the steps around it would give it back.
  if (guarded && (folded.other?.contributors ?? 0) < min)
    return { rows: [], empty: differenceNote(min), note: null }
  const rows: BridgeStepRow[] = []
  const start: BridgeStepRow = {
    key: 'start',
    label: v?.name ?? 'Comparison',
    kind: 'start',
    value: w.start,
    contributors: null,
  }
  const end: BridgeStepRow = {
    key: 'end',
    label: `${p.fiscalYear} forecast`,
    kind: 'end',
    value: w.end,
    contributors: null,
  }
  // Where each row starts on the waterfall, in whole cents (what its card's totals read).
  let running = toCents(w.start)
  for (const f of folded.shown) {
    const s = f.step
    const before = running / 100
    if (f.part === 'band') {
      const g = guardedDifference(f.delta, 0, min, {
        bandOnly: true,
        bandShown: env.bandShown,
        mode: env.mode,
      })
      // A band row lists no positions: its costed movers, if any, are in Other changes (rule 5). The
      // transfers row reads 0 positions under R26.
      const positions = s.key === 'transfers' ? 0 : null
      rows.push({
        key: s.key,
        label: s.label,
        kind: 'step',
        value: g.value,
        contributors: positions,
        calc: () => driverCard(p, s, { whole: false, value: g.value, before, positions }),
      })
      if (g.value != null) running += toCents(g.value)
      continue
    }
    const g = guardedDifference(s.value, s.contributors, min, { mode: env.mode })
    // A step made only of band estimates lists no positions, as a band row does in the guarded modes
    // (M4 recheck SA-4-a: with the switch on such a step shows whole, never "0 positions that moved").
    const positions = s.band && s.key !== 'transfers' && !s.contributors.size ? null : s.contributors.size
    rows.push({
      key: s.key,
      label: s.label,
      kind: 'step',
      value: g.value,
      contributors: positions,
      calc: () => driverCard(p, s, { whole: true, value: g.value, before, positions }),
      drill: () =>
        s.contributors.size
          ? positionsSpec(p, `${s.label}: positions that moved`, [...s.contributors].sort(), {
              note: 'Positions only: no amount is listed per position, nor why it moved.',
            })
          : null,
    })
    if (g.value != null) running += toCents(g.value)
  }
  const o = folded.other
  if (o && (guarded || o.contributors > 0 || Math.abs(o.delta) >= 0.005)) {
    const people = new Set<string>()
    for (const s of o.steps) for (const id of s.contributors) people.add(id)
    const g = guardedDifference(o.delta, people, min, { mode: env.mode })
    // Its count and positions show with its amount only (1 to 4 would say how many moved).
    const n = g.value != null ? people.size : null
    rows.push({
      key: 'other',
      label: OTHER_CHANGES,
      kind: 'other',
      value: g.value,
      contributors: n,
      calc: () => otherCard(p, w, g, n),
      drill: () =>
        n
          ? positionsSpec(p, `${OTHER_CHANGES}: positions that moved`, [...people].sort(), {
              note: 'Positions only: no amount is listed per position, nor why it moved.',
            })
          : null,
    })
  }
  const all = waterfallSteps<BridgeStepRow | WaterfallStep>(start, rows, end, {
    rounded: env.mode === 'rounded',
  })
  const out = all.map((s): BridgeStepRow => ('contributors' in s ? s : { ...s, contributors: null }))
  return { rows: out, empty: null, note: w.note }
}

/**
 * Other changes' card: the steps' parts folded into it and their positions that moved, or why it
 * reads "—". Its count shows with its amount only.
 */
function otherCard(p: FPrep, w: BridgeWindow, g: GuardedDifference, n: number | null): CalcSpec {
  return {
    title: `Bridge step: ${OTHER_CHANGES}`,
    subtitle: subtitleOf(p.fiscalYear, p.ctx.scopeLabel, p.comparison?.name),
    metricId: ID.bridgeStep,
    value: g.value,
    format: p.env.mode === 'rounded' ? 'moneyM' : 'money',
    inputs: [calcInput('Positions that moved', n, 'int', 'Costed positions only')],
    steps:
      g.value != null
        ? [
            calcStep(
              `${OTHER_CHANGES} = Σ the steps folded into it`,
              `Steps with fewer than ${p.env.rules.minContributors} positions that moved, joined until ${p.env.rules.minContributors} or more`,
              g.value,
              'money',
            ),
          ]
        : [calcStep(g.reason ?? 'Hidden', '—', null, 'money')],
    note: [stepCardNote(p.env.rules.minContributors), w.note].filter(Boolean).join(' '),
    uses: p.uses(),
  }
}

const fmtUsd = (v: number | null): string => (v == null ? '—' : `$${Math.round(v).toLocaleString('en-US')}`)

/* ───────────── the FX effect ───────────── */

/** The window's FX step as the bridge shows it after the fold: whole, a band row, or not on its own. */
function fxShown(folded: FoldedSteps<StepFact>): StepFact | null {
  return folded.shown.find((f) => f.step.key === 'fx' && (f.part === 'whole' || f.step.band)) ?? null
}

/**
 * The FX effect of a window: its bridge's FX step under rule 5 (only non-USD costed positions count,
 * by each line's own currency), read from the same folded result as the bridge row: it shows only
 * when the window's bridge shows FX as its own step (C33, RC-1), at the row's band part when FX is a
 * band figure.
 */
export function fxEffectOf(p: FPrep, months: readonly Month[]): GuardedDifference & { window: BridgeWindow } {
  const env = guardEnvOf(p.ctx)
  const w = bridgeWindow(p, months)
  const fx = w.steps.find((s) => s.key === 'fx')
  if (w.reason || !fx)
    return { value: null, contributors: 0, band: false, reason: w.reason ?? 'Hidden', window: w }
  const shownFx = env.mode !== 'open' ? fxShown(foldedOf(p, w, months)) : null
  if (env.mode !== 'open' && !shownFx)
    return {
      value: null,
      contributors: fx.contributors.size,
      band: fx.band,
      reason: differenceNote(env.rules.minContributors),
      window: w,
    }
  // Guarded modes read the bridge's own FX step, as the fold leaves it (C33 (c), review PV-2): a
  // second formula over the forecast side's lines read a comparison's closed-month plan rates the step
  // never reads, so the company tile less the shown units' gave a folded unit's one person. A band FX
  // step reads its row's band part. HR admin with the switch on (no fold) reads the FX formula itself
  // on the forecast side's lines, to the cent of 6.4's fixtures (story 5).
  const sides = env.mode === 'open' ? sidesOf(p) : null
  const value =
    sides && p.comparison
      ? fxEffect(linesIn(sides.fcLines, months, null), p.comparison.rates)
      : shownFx
        ? shownFx.delta
        : fx.value
  const g = guardedDifference(value, fx.contributors, env.rules.minContributors, {
    bandOnly: fx.band,
    bandShown: env.bandShown,
    mode: env.mode,
  })
  return { ...g, window: w }
}

/** For tests: the scope's bridge seats. */
export const bridgeSeatsOf = (p: FPrep): readonly BridgeSeat[] => sidesOf(p)?.seats ?? []
