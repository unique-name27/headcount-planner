/**
 * Requests > Cycle (docs/PLAN.md 10.3, 9.4; story 6): the planning cycle's stage and dates, the
 * ranked asks against each unit's target with the cut line shown, and the managers who have not
 * sent their ranked asks ("Copy note"). Read only in M2: the HRBP's ordering, moving the cut line and
 * locking are the write path (M3).
 *
 * - **Which cycle**: the shown version's fiscal year's cycle; when that year has none, the cycle open
 *   for a later fiscal year (the one under way: FY28's on the sample, while FY27 Working is shown),
 *   else the latest later one locked (M3: the lock and its outcomes stay on the tab).
 * - **Ranked asks** (`rankAsks`): the cycle's asks waiting in it (Submitted or In review, their
 *   manager's step decided or not), per business unit, each with its head effect at the unit target's
 *   date and its in-year band effect (`headEffect`, `bandEffect`, 6.9) in the cycle year's Working. A
 *   Sent back ask is with its requester: it is out of the ranking until it is submitted again, and the
 *   lock does not decide it (lead decision D-CYCLE).
 * - **The cut line** (`unitLinesOf`, one computation for the tab and the lock): the unit's mark when
 *   one is set (`Cycle.cutLines`), else the default: after the longest run of ranked heads that fits
 *   the room the target leaves (`defaultCutAfter`, room = target heads − the unit's asks other than
 *   its ranked asks: plan/engine/cycle.ts `roomOf` and `cutAfterOf`, the lock's own). A unit with no
 *   target and no mark has nothing cut. The line is the unit's, the same for every viewer and at
 *   lock: it is worked out over every request in force (src/drill/seats.ts `effectiveRequestsOf`),
 *   leaving out only those 8.4 rule 3 hides from the viewer (a request about the viewer's own seat or
 *   one above it, so a hidden elimination never moves a line its person reads). The rows list only
 *   the asks the viewer may see. Story 6: the line falls after the 40th of 58 ranked heads, and the
 *   lock approves the 40 and rejects the 18 "Below the cut line".
 * - **After lock**: the tab shows the lock's outcome per unit (asks approved, asks rejected below the
 *   cut line, with their heads), never a line over asks that are no longer pending.
 * - **Per mode**: HRBP its unit, Leader its org, Finance and HR admin every unit; Manager mode lists
 *   only the manager's own asks and shows no cut line or band estimate ("Your ranked asks and the
 *   cycle's dates", 8.3).
 * - **Not submitted** (`requests.cycle.notSubmitted`): while the cycle is Open for asks, managers in
 *   scope (holders of a seat another seat, not an Eliminated one, reports to) with no ask sent.
 *
 * Pure.
 */
import { orgOf as orgLabelOf } from '@/access/copy'
import { upward } from '@/access/scopes/people'
import type { Viewer } from '@/access/visibility'
import type { AnalyticsContext } from '@/data/context'
import { fiscalYearOf, fyRange } from '@/data/fiscal'
import { APPROVED_REQUEST_STATES, type FiscalYear, type ISODate, type TargetRow } from '@/data/schema'
import { subtreeIds } from '@/data/scope'
import { effectiveRequestsOf } from '@/drill/seats'
import {
  copyNote,
  cutAfterOf,
  cutLine,
  notSubmitted,
  type RankedAsk,
  rankAsks,
  roomOf,
} from '@/plan/engine/cycle'
import { BELOW_THE_CUT_LINE } from '@/plan/engine/requests'
import { bandEffect, headEffect, asks as orgAsks, targetDateOf, targetKindOf } from '@/plan/engine/targets'
import type { Cycle, HcRequest, OrgMatch } from '@/plan/types'
import type { Prep } from './base'
import { planYearOf } from './planYear'

/** The cycle the tab shows: the shown fiscal year's, else the one open for a later year. */
export function cycleShown(ctx: Pick<AnalyticsContext, 'plan' | 'version' | 'asOf'>): Cycle | null {
  const cycles = ctx.plan?.cycles ?? []
  const fy = ctx.version?.fiscalYear ?? fiscalYearOf(ctx.asOf)
  const own = cycles.find((c) => c.fiscalYear === fy)
  if (own) return own
  const later = cycles
    .filter((c) => c.fiscalYear > fy)
    .sort((a, b) => a.fiscalYear.localeCompare(b.fiscalYear))
  // The one under way, else (M3) the latest one locked, so a lock is still read on the tab.
  return later.find((c) => c.stage !== 'Locked') ?? later.at(-1) ?? null
}

/** The cycles open for asks (the not-submitted items and count read them, whatever version is shown). */
export const openForAsks = (ctx: Pick<AnalyticsContext, 'plan'>): readonly Cycle[] =>
  (ctx.plan?.cycles ?? []).filter((c) => c.stage === 'Open for asks')

/** An org a target row is keyed by, as asks read it. */
export function targetOrg(t: TargetRow, ctx: Pick<AnalyticsContext, 'positionIndex'>): OrgMatch {
  switch (targetKindOf(t)) {
    case 'leader': {
      const tree = subtreeIds(ctx.positionIndex, t.leaderPositionId as string)
      return (place) =>
        (!!place.positionId && tree.has(place.positionId)) ||
        (!place.positionId && !!place.managerPositionId && tree.has(place.managerPositionId))
    }
    case 'cost-center':
      return (place) => place.businessUnit === t.businessUnit && place.costCenter === t.costCenter
    case 'department':
      return (place) => place.businessUnit === t.businessUnit && place.department === t.department
    default:
      return (place) => place.businessUnit === t.businessUnit
  }
}

/** A target's org in words: the unit, its department or cost center, or a leader's org. */
export function targetLabel(t: TargetRow, holderName: (positionId: string) => string | null): string {
  switch (targetKindOf(t)) {
    case 'leader': {
      const n = holderName(t.leaderPositionId as string)
      return n ? orgLabelOf(n) : `The org under ${t.leaderPositionId}`
    }
    case 'cost-center':
      return `${t.businessUnit}, ${t.costCenter}`
    case 'department':
      return `${t.businessUnit}, ${t.department}`
    default:
      return t.businessUnit
  }
}

/** The unit's own target for a fiscal year (no department, cost center or leader). */
export function unitTarget(targets: readonly TargetRow[], unit: string, fy: FiscalYear): TargetRow | null {
  return (
    targets.find(
      (t) =>
        t.fiscalYear === fy &&
        t.businessUnit === unit &&
        !t.department &&
        !t.costCenter &&
        !t.leaderPositionId,
    ) ?? null
  )
}

/** The states of an ask the cycle ranks: waiting in the cycle. A Sent back ask is with its requester. */
const RANKED_STATES: ReadonlySet<HcRequest['state']> = new Set<HcRequest['state']>(['Submitted', 'In review'])

/** Whether an ask is in the cycle's ranking: the cycle's, and Submitted or In review (D-CYCLE). */
export const isRankedAsk = (r: HcRequest, cycleId: string): boolean =>
  r.cycleId === cycleId && RANKED_STATES.has(r.state)

/** One unit's line: its target, its ranked asks and where the cut line falls (the tab's and the lock's). */
export interface UnitLine {
  businessUnit: string
  target: TargetRow | null
  targetDate: ISODate
  /** The ranked asks, rank order (`rankAsks` over the asks waiting in the cycle). */
  ranked: readonly RankedAsk[]
  /** The unit's asks at the target date with every request counted (the cycle's included). */
  asksHeads: number
  /** Heads the ranked asks add. */
  rankedHeads: number
  /** Target − the unit's asks without its ranked asks (`roomOf`); null with no target. */
  room: number | null
  /** The cut line after this many ranked heads; null when nothing is cut (no mark, no target). */
  cutAfter: number | null
  source: 'set' | 'default' | 'none'
}

/**
 * Each unit's line for a cycle over `requests` (see the module comment): the tab passes every request
 * in force but those rule 3 hides from the viewer, the lock passes every request in force
 * (`cycleCutsOf`), so both read one computation. `units` keeps to some units (every unit with ranked
 * asks when null).
 */
export function unitLinesOf(
  ctx: Pick<AnalyticsContext, 'all' | 'asOf' | 'versions' | 'plan'>,
  cycle: Cycle,
  requests: readonly HcRequest[],
  units: ReadonlySet<string> | null = null,
): UnitLine[] {
  const year = planYearOf(ctx, cycle.fiscalYear)
  const byUnit = new Map<string, HcRequest[]>()
  for (const r of requests) {
    if (!isRankedAsk(r, cycle.cycleId)) continue
    if (units && !units.has(r.businessUnit)) continue
    const list = byUnit.get(r.businessUnit)
    if (list) list.push(r)
    else byUnit.set(r.businessUnit, [r])
  }
  const out: UnitLine[] = []
  for (const [unit, reqs] of [...byUnit].sort((a, b) => a[0].localeCompare(b[0]))) {
    const target = unitTarget(ctx.all.targets, unit, cycle.fiscalYear)
    const date = target ? targetDateOf(target) : fyRange(cycle.fiscalYear).end
    const org: OrgMatch = (place) => place.businessUnit === unit
    // The unit's order as its HRBP (or a leader) set it (`Cycle.order`, M3), else by each ask's priority.
    const ranked = rankAsks(
      reqs,
      cycle.cycleId,
      (r) => headEffect(r, org, date, year.asks),
      (r) => bandEffect(r, org, cycle.fiscalYear, year.asks),
      cycle.order?.find((o) => o.businessUnit === unit)?.requestIds,
    )
    const rankedHeads = ranked.reduce((n, a) => n + a.heads, 0)
    // The one line, the lock's alike (plan/engine/cycle.ts `roomOf`, `cutAfterOf`).
    const asksHeads = orgAsks(org, date, requests, year.asks).heads
    const room = roomOf(target?.targetHeads ?? null, asksHeads, ranked)
    const cut = cutAfterOf(cycle, unit, ranked, room)
    out.push({
      businessUnit: unit,
      target,
      targetDate: date,
      ranked,
      asksHeads,
      rankedHeads,
      room,
      cutAfter: cut.afterHeads,
      source: cut.source,
    })
  }
  return out
}

/** What the lock decides for one unit: the line, and its asks above and below it (request IDs, rank order). */
export interface UnitCut {
  cutAfter: number | null
  above: readonly string[]
  below: readonly string[]
}

/**
 * What the lock decides per unit (D-CYCLE): the line the tab shows, over every request in force.
 * Each unit with ranked asks maps to its asks above the line and below it; a unit with nothing cut
 * (no mark, no target) has every ranked ask above. For src/plan/actions/cycle.ts `lockCycle` through
 * the write path's env, so the tab and the lock never disagree.
 */
export function cycleCutsOf(
  ctx: Pick<AnalyticsContext, 'all' | 'asOf' | 'versions' | 'plan' | 'metrics'>,
  cycle: Cycle,
): ReadonlyMap<string, UnitCut> {
  const out = new Map<string, UnitCut>()
  for (const u of unitLinesOf(ctx, cycle, effectiveRequestsOf(ctx))) {
    const line = u.cutAfter != null ? cutLine(u.ranked, u.cutAfter) : null
    out.set(u.businessUnit, {
      cutAfter: u.cutAfter,
      above: line ? line.above : u.ranked.map((a) => a.requestId),
      below: line ? line.below : [],
    })
  }
  return out
}

/** Rule 3 (8.4): the request touches the viewer's own seat or one above it (never in HR admin). */
export function aboutViewer(req: HcRequest, viewer: Viewer): boolean {
  if (viewer.mode === 'hr-admin') return false
  const touched = [req.positionId, ...(req.trade?.givePositionIds ?? []), req.transfer?.fromPositionId]
  return touched.some((id) => !!id && viewer.atOrAbove.has(id))
}

/** One unit's ranked asks against its target. */
export interface UnitAsks {
  businessUnit: string
  /** The unit's target heads for the cycle year, or null with no target. */
  targetHeads: number | null
  targetDate: ISODate
  /** The unit's asks at the target date with every request counted (the cycle's included). */
  asksHeads: number
  /** Heads the ranked asks add. */
  rankedHeads: number
  /** Target − the unit's asks other than its ranked asks (`roomOf`); null with no target. */
  room: number | null
  /** The cut line after this many ranked heads; null when nothing is cut (no mark, no target). */
  cutAfter: number | null
  /** Where the line comes from: the unit's mark, the default from the room, or none. */
  source: 'set' | 'default' | 'none'
  headsAbove: number
  headsBelow: number
  /** In-year band estimate above and below (band figures); null where the mode hides band estimates. */
  bandAbove: number | null
  bandBelow: number | null
  /** The ranked asks, rank order, with their side of the line. */
  asks: readonly {
    request: HcRequest
    rank: number
    heads: number
    cumulative: number
    bandUsd: number
    above: boolean
  }[]
  /** A Locked cycle: what the lock decided for the unit (asks approved, asks rejected below the line); else null. */
  locked: { approved: number; approvedHeads: number; rejected: number; rejectedHeads: number } | null
}

/** The requests a viewer's lines are worked out over (see the module comment). */
function lineBasis(p: Prep): readonly HcRequest[] {
  return p.ctx.access.mode === 'manager' ? p.visible : p.all.filter((r) => !aboutViewer(r, p.viewer))
}

/**
 * The ranked asks of the cycle per unit, for the units in `units` (every unit with asks when null).
 * Manager mode ranks over the requests the manager may see (it shows no line, only its own asks). A
 * Locked cycle shows the lock's outcome instead (`lockedUnits`).
 */
export function unitAsks(p: Prep, cycle: Cycle, units: ReadonlySet<string> | null): UnitAsks[] {
  if (cycle.stage === 'Locked') return lockedUnits(p, cycle, units)
  const basis = lineBasis(p)
  const byId = new Map(basis.map((r) => [r.requestId, r]))
  return unitLinesOf(p.ctx, cycle, basis, units).map((u) => {
    const line = u.cutAfter != null ? cutLine(u.ranked, u.cutAfter) : null
    const above = new Set(line ? line.above : u.ranked.map((a) => a.requestId))
    let cumulative = 0
    return {
      businessUnit: u.businessUnit,
      targetHeads: u.target?.targetHeads ?? null,
      targetDate: u.targetDate,
      asksHeads: u.asksHeads,
      rankedHeads: u.rankedHeads,
      room: u.room,
      cutAfter: u.cutAfter,
      source: u.source,
      headsAbove: line ? line.headsAbove : u.rankedHeads,
      headsBelow: line ? line.headsBelow : 0,
      bandAbove: line ? line.bandAbove : u.ranked.reduce((n, a) => n + a.bandUsd, 0),
      bandBelow: line ? line.bandBelow : 0,
      asks: u.ranked.map((a, i) => {
        cumulative += a.heads
        return {
          request: byId.get(a.requestId) as HcRequest,
          rank: i + 1,
          heads: a.heads,
          cumulative,
          bandUsd: a.bandUsd,
          above: above.has(a.requestId),
        }
      }),
      locked: null,
    }
  })
}

/**
 * A Locked cycle's units: the asks the lock decided, the approved ones first and those rejected "Below
 * the cut line" after them, each in rank order, with their heads (the lock's outcome).
 */
function lockedUnits(p: Prep, cycle: Cycle, units: ReadonlySet<string> | null): UnitAsks[] {
  const ctx = p.ctx
  const year = planYearOf(ctx, cycle.fiscalYear)
  const approved = (r: HcRequest) => APPROVED_REQUEST_STATES.includes(r.state)
  const below = (r: HcRequest) => r.state === 'Rejected' && r.reasonCode === BELOW_THE_CUT_LINE
  const byUnit = new Map<string, HcRequest[]>()
  for (const r of lineBasis(p)) {
    if (r.cycleId !== cycle.cycleId || !(approved(r) || below(r))) continue
    if (units && !units.has(r.businessUnit)) continue
    const list = byUnit.get(r.businessUnit)
    if (list) list.push(r)
    else byUnit.set(r.businessUnit, [r])
  }
  const out: UnitAsks[] = []
  for (const [unit, reqs] of [...byUnit].sort((a, b) => a[0].localeCompare(b[0]))) {
    const target = unitTarget(ctx.all.targets, unit, cycle.fiscalYear)
    const date = target ? targetDateOf(target) : fyRange(cycle.fiscalYear).end
    const org: OrgMatch = (place) => place.businessUnit === unit
    const order = cycle.order?.find((o) => o.businessUnit === unit)?.requestIds
    // Decided asks in rank order: rankAsks' own order over them (it ranks waiting asks only).
    const rank = (list: readonly HcRequest[]) =>
      rankAsks(
        list.map((r) => ({ ...r, state: 'Submitted' as const })),
        cycle.cycleId,
        (r) => headEffect(r, org, date, year.asks),
        (r) => bandEffect(r, org, cycle.fiscalYear, year.asks),
        order,
      )
    const up = rank(reqs.filter(approved))
    const down = rank(reqs.filter(below))
    const byId = new Map(reqs.map((r) => [r.requestId, r]))
    const sum = (l: readonly RankedAsk[], f: (a: RankedAsk) => number) => l.reduce((n, a) => n + f(a), 0)
    const headsAbove = sum(up, (a) => a.heads)
    const headsBelow = sum(down, (a) => a.heads)
    let cumulative = 0
    out.push({
      businessUnit: unit,
      targetHeads: target?.targetHeads ?? null,
      targetDate: date,
      asksHeads: 0,
      rankedHeads: headsAbove + headsBelow,
      room: null,
      cutAfter: down.length ? headsAbove : null,
      source: 'set',
      headsAbove,
      headsBelow,
      bandAbove: sum(up, (a) => a.bandUsd),
      bandBelow: sum(down, (a) => a.bandUsd),
      asks: [...up, ...down].map((a, i) => {
        cumulative += a.heads
        return {
          request: byId.get(a.requestId) as HcRequest,
          rank: i + 1,
          heads: a.heads,
          cumulative,
          bandUsd: a.bandUsd,
          above: i < up.length,
        }
      }),
      locked: {
        approved: up.length,
        approvedHeads: headsAbove,
        rejected: down.length,
        rejectedHeads: headsBelow,
      },
    })
  }
  return out
}

/** A manager in scope with no ask sent to an open cycle. */
export interface ManagerSeat {
  employeeId: string
  name: string
  positionId: string
  title: string | null
  businessUnit: string
  department: string | null
}

/**
 * The managers in scope on the as-of date: holders of a seat that another seat (not an Eliminated
 * one) reports to. A scope's own root seats count (a manager is in their own population); the rest
 * keep to the scope's positions and the filters.
 */
export function managersInScope(p: Prep, holderOf: ReadonlyMap<string, string>): ManagerSeat[] {
  const ctx = p.ctx
  if (ctx.access.unset) return []
  const index = ctx.positionIndex
  const scope = ctx.access.scope
  const shown = new Set(ctx.data.positions.map((r) => r.positionId))
  const roots = scope?.kind === 'tree' ? scope.rootPositionIds : null
  const out: ManagerSeat[] = []
  const seen = new Set<string>()
  for (const [id, kids] of index.children) {
    if (!kids.some((k) => k.status !== 'Eliminated')) continue
    const row = index.byId.get(id)
    if (!row || row.status === 'Eliminated') continue
    if (!shown.has(id) && !roots?.has(id)) continue
    const person = holderOf.get(id)
    if (!person || seen.has(person)) continue
    seen.add(person)
    out.push({
      employeeId: person,
      name: p.nameOf(person) ?? person,
      positionId: id,
      title: row.title ?? null,
      businessUnit: row.businessUnit,
      department: row.department ?? null,
    })
  }
  return out.sort((a, b) => a.positionId.localeCompare(b.positionId))
}

/** The managers in scope who have not sent an ask to the cycle (`notSubmitted`). */
export function notSubmittedIn(p: Prep, cycle: Cycle, managers: readonly ManagerSeat[]): ManagerSeat[] {
  const missing = new Set(
    notSubmitted(
      managers.map((m) => m.employeeId),
      p.visible,
      cycle.cycleId,
    ),
  )
  return managers.filter((m) => missing.has(m.employeeId))
}

/** "Could you send your ranked asks for FY28 by 16 Oct?" */
export const cycleNote = (cycle: Cycle): string => copyNote(cycle.fiscalYear, cycle.dates.asksDue)

/** The positions above a seat, nearest first (for the targets that decide, 10.2). */
export const ancestorsOf =
  (ctx: Pick<AnalyticsContext, 'positionIndex'>) =>
  (positionId: string): readonly string[] =>
    upward(positionId, ctx.positionIndex).slice(1)
