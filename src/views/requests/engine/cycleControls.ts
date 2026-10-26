/**
 * What the viewer may do on Requests > Cycle now (docs/PLAN.md 8.3 `cycle.*`, 10.3, 15.1 R7, R8):
 * each HRBP orders its unit's ranked asks and moves its cut line, a leader does both within its org
 * (the envelope), a manager ranks only its own asks; each HRBP finishes HRBP review for its unit and
 * each leader Leader review for its org; Finance moves the stage on, locks the cycle from Finance
 * review or returns it to an earlier stage, changes its due dates, and opens the next year's cycle
 * when none is under way (`cycleOpenOf`). Every control follows the policy (the action's id not
 * hidden) and the cycle's stage, and the action checks its own rule again when it runs.
 *
 * The cut line's places (`CutOption`): one for each whole number of ranked heads the line can fall
 * after (0, then each run of asks), with the heads and the in-year band estimate above and below it
 * (band figures, 6.9; left out where `cost:band` is hidden). The cut line never reaches Manager mode
 * (M2 review RM-2): its units list is empty there. Pure.
 *
 * Readings taken here (requests-ui, M3), the same as the cycle actions' (src/plan/actions/cycle.ts):
 *  - The units that finish HRBP review are those with ranked asks in the cycle; the leader orgs that
 *    finish Leader review are those units' top leader seats (a leader seat whose manager sits outside
 *    the unit). A unit or org already finished offers nothing.
 *  - A leader ranks a unit's asks when every ask of it the leader sees is inside the org, and moves a
 *    unit's line when the unit is inside the org.
 *  - The line's places run over every ask of the unit (the line is the unit's, ./cycle.ts); a unit's
 *    order names only the asks the viewer sees, so no hidden request's ID reaches the model.
 */
import { holdingsOn } from '@/access/scopes/people'
import { personRulesOf } from '@/app/write/context'
import type { AnalyticsContext } from '@/data/context'
import { fiscalYearOf } from '@/data/fiscal'
import { CYCLE_STAGES, type CycleStage, type FiscalYear, isLeaderLevel } from '@/data/schema'
import { addDays } from '@/lib/dates'
import type { ActionContext, FinishStageInput } from '@/plan/actions'
import { inScope as askInScope, latestRows } from '@/plan/actions/shared'
import { cutLine, lockWaitingText, type RankedAsk, waitingOnManager } from '@/plan/engine/cycle'
import type { Cycle } from '@/plan/types'
import type { Prep } from './base'
import type { UnitAsks } from './cycle'

/** One place the cut line can fall. */
export interface CutOption {
  /** The line falls after this many ranked heads (what `moveCutLine` stores). */
  afterHeads: number
  /** How many ranked asks sit above it. */
  above: number
  headsAbove: number
  headsBelow: number
  /** In-year band estimate above and below (band figures); absent where `cost:band` is hidden. */
  bandAbove?: number
  bandBelow?: number
}

/** One unit's ranked asks as the viewer may order them and cut them. */
export interface UnitControls {
  businessUnit: string
  /** The unit's asks the viewer sees, in rank order (request IDs). */
  order: readonly string[]
  canRank: boolean
  canCut: boolean
  /** Where the line falls now, after this many heads; null when nothing is cut. */
  cutAfter: number | null
  /** The line was set (moved or confirmed); false while it follows the target by default. */
  cutSet: boolean
  options: readonly CutOption[]
}

export interface CycleControls {
  cycleId: string
  stage: CycleStage
  /** Finish HRBP review for a unit, Leader review for an org, or Finance's move to the next stage. */
  finish: readonly { label: string; input: FinishStageInput }[]
  /** Finance (and HR admin) may lock the cycle now. */
  lock: boolean
  /**
   * Why the lock waits, beside a disabled Lock button: asks of the cycle still waiting on their
   * manager's step ("Lock the FY28 cycle once these asks have their manager's decision: 3 asks with
   * 2 managers.", D-CYCLE); null when it may go.
   */
  lockWaiting: string | null
  /** The earlier stages Finance may return the cycle to. */
  returnTo: readonly CycleStage[]
  units: readonly UnitControls[]
  /** Manager mode: the manager's own asks in their order, and whether they may rank them. */
  mine: { requestIds: readonly string[]; canRank: boolean } | null
  /** Finance (and HR admin) may change the cycle's due dates (`cycle.dates`), from these. Null otherwise. */
  dates: Cycle['dates'] | null
}

/** "Open the FY28 planning cycle" (`cycle.open`, Finance and HR admin): the year and its suggested dates. */
export interface CycleOpenOption {
  fiscalYear: FiscalYear
  /** Suggested due dates, 3, 5, 7 and 9 weeks after the as-of date; the form changes them. */
  dates: Cycle['dates']
}

/**
 * The next fiscal year's cycle Finance may open: offered where `cycle.open` is not hidden and no
 * cycle is under way (every cycle in plan state is Locked, or there is none). The year is the one
 * after the as-of date's (the cycle plans next year), or the one after the latest locked cycle's when
 * that is later.
 */
export function cycleOpenOf(ctx: AnalyticsContext): CycleOpenOption | null {
  if (ctx.access.unset || ctx.access.decide('action:cycle.open').access === 'hidden') return null
  const cycles = ctx.plan?.cycles ?? []
  if (cycles.some((c) => c.stage !== 'Locked')) return null
  const next = (fy: FiscalYear): FiscalYear => `FY${Number(fy.slice(2)) + 1}` as FiscalYear
  let fy = next(fiscalYearOf(ctx.asOf))
  for (const c of cycles) if (c.fiscalYear >= fy) fy = next(c.fiscalYear)
  return {
    fiscalYear: fy,
    dates: {
      asksDue: addDays(ctx.asOf, 21),
      hrbpReviewDue: addDays(ctx.asOf, 35),
      leaderReviewDue: addDays(ctx.asOf, 49),
      financeReviewDue: addDays(ctx.asOf, 63),
    },
  }
}

const isFinanceMode = (mode: string): boolean => mode === 'finance' || mode === 'hr-admin'

/** The units with ranked asks and their top leader seats (who finish HRBP and Leader review). */
function finishers(
  ctx: AnalyticsContext,
  lines: readonly UnitAsks[],
): { units: string[]; leaderOrgs: string[] } {
  const units = lines
    .filter((u) => u.asks.length)
    .map((u) => u.businessUnit)
    .sort()
  const latest = latestRows(ctx.all.positions)
  const leaderOrgs: string[] = []
  for (const [id, r] of latest) {
    if (!units.includes(r.businessUnit) || r.status === 'Eliminated') continue
    const leader = r.leaderLevel === true || (r.leaderLevel !== false && isLeaderLevel(r.level))
    if (!leader) continue
    const m = r.managerPositionId ? latest.get(r.managerPositionId) : null
    if (!m || m.businessUnit !== r.businessUnit) leaderOrgs.push(id)
  }
  return { units, leaderOrgs: leaderOrgs.sort() }
}

/** Every place the line can fall in a unit's ranked asks. */
export function cutOptions(u: UnitAsks, bandShown: boolean): CutOption[] {
  const ranked: RankedAsk[] = u.asks.map((a) => ({
    requestId: a.request.requestId,
    requesterId: a.request.requesterId,
    priority: a.request.priority ?? 0,
    heads: a.heads,
    bandUsd: a.bandUsd,
  }))
  const marks = [...new Set([0, ...u.asks.map((a) => a.cumulative)])]
    .filter((h) => h >= 0)
    .sort((a, b) => a - b)
  return marks.map((h) => {
    const line = cutLine(ranked, h)
    return {
      afterHeads: h,
      above: line.above.length,
      headsAbove: line.headsAbove,
      headsBelow: line.headsBelow,
      ...(bandShown ? { bandAbove: line.bandAbove, bandBelow: line.bandBelow } : {}),
    }
  })
}

/** The cycle's controls for the viewer (see the module comment); null with no cycle shown. */
export function cycleControlsOf(
  p: Prep,
  cycle: Cycle | null,
  lines: readonly UnitAsks[],
): CycleControls | null {
  if (!cycle) return null
  const ctx = p.ctx
  const mode = ctx.access.mode
  const shown = (id: string) => !ctx.access.unset && ctx.access.decide(`action:${id}`).access !== 'hidden'
  const locked = cycle.stage === 'Locked'
  const rules = personRulesOf(ctx)
  // The actions' scope test reads only the person-level rules (src/plan/actions/shared.ts `inScope`).
  const actx = { rules } as unknown as ActionContext
  const bandShown = ctx.access.can('cost:band')
  const at = CYCLE_STAGES.indexOf(cycle.stage)

  const finish: { label: string; input: FinishStageInput }[] = []
  if (!locked && shown('cycle.advance')) {
    const f = finishers(ctx, lines)
    if (cycle.stage === 'HRBP review' && (mode === 'hrbp' || mode === 'hr-admin'))
      for (const unit of f.units)
        if (!cycle.hrbpDone.includes(unit) && (mode === 'hr-admin' || rules.hrbpUnits.has(unit)))
          finish.push({
            label: `Finish HRBP review for ${unit}`,
            input: { cycleId: cycle.cycleId, businessUnit: unit },
          })
    if (cycle.stage === 'Leader review' && (mode === 'leader' || mode === 'hr-admin'))
      for (const seat of f.leaderOrgs)
        if (!cycle.leaderDone.includes(seat) && (mode === 'hr-admin' || rules.leaderSeats.has(seat)))
          finish.push({
            label:
              mode === 'leader'
                ? 'Finish Leader review for your org'
                : `Finish Leader review for ${p.nameOf(holderOf(p, seat) ?? '') ?? seat}'s org`,
            input: { cycleId: cycle.cycleId, leaderPositionId: seat },
          })
    if (isFinanceMode(mode) && cycle.stage !== 'Finance review')
      finish.push({ label: `Move the cycle to ${CYCLE_STAGES[at + 1]}`, input: { cycleId: cycle.cycleId } })
  }

  const units: UnitControls[] =
    mode === 'manager'
      ? []
      : lines.map((u) => {
          // The line is the unit's (every ask counts); the order lists only the asks the viewer sees.
          const reqs = u.asks.map((a) => a.request).filter((r) => p.view(r) !== 'none')
          const rankOk =
            !locked &&
            shown('cycle.rank') &&
            (mode === 'hrbp'
              ? rules.hrbpUnits.has(u.businessUnit)
              : mode === 'leader'
                ? reqs.every((r) => askInScope(actx, r))
                : true)
          const cutOk =
            !locked &&
            shown('cycle.cut-line') &&
            (mode === 'hrbp'
              ? rules.hrbpUnits.has(u.businessUnit)
              : mode === 'leader'
                ? rules.unitInScope(u.businessUnit)
                : true)
          return {
            businessUnit: u.businessUnit,
            order: reqs.map((r) => r.requestId),
            canRank: rankOk,
            canCut: cutOk,
            cutAfter: u.cutAfter,
            cutSet: u.source === 'set',
            options: cutOptions(u, bandShown),
          }
        })

  const me = p.me
  const mine =
    mode === 'manager'
      ? {
          requestIds: lines.flatMap((u) =>
            u.asks.filter((a) => a.request.requesterId === me).map((a) => a.request.requestId),
          ),
          canRank: !locked && shown('cycle.rank'),
        }
      : null

  const lock = !locked && cycle.stage === 'Finance review' && isFinanceMode(mode) && shown('cycle.lock')
  // The lock decides only asks their manager approved: it waits while any ask's manager step does.
  const waits = lock ? waitingOnManager(p.all, cycle.cycleId) : null
  return {
    cycleId: cycle.cycleId,
    stage: cycle.stage,
    finish,
    lock,
    lockWaiting: waits?.requestIds.length
      ? lockWaitingText(cycle.fiscalYear, waits.requestIds.length, waits.managerIds.length)
      : null,
    returnTo:
      !locked && isFinanceMode(mode) && shown('cycle.return') ? CYCLE_STAGES.slice(0, Math.max(0, at)) : [],
    units,
    mine,
    dates: !locked && isFinanceMode(mode) && shown('cycle.dates') ? cycle.dates : null,
  }
}

/** Who holds a seat on the as-of date. */
const holderOf = (p: Prep, seat: string): string | null =>
  holdingsOn(p.ctx.all.workers, p.ctx.asOf).holderOf.get(seat) ?? null
