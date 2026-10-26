/**
 * The target org's gap after approval (docs/PLAN.md 6.9, 10.2, 7.2 rules 5 and 8, 7.3, 7.4): what
 * Requests > New shows beside a draft and Approvals beside each request waiting on you.
 *
 * Gap after approval = the target org's gap with the request left out of asks, minus the request's
 * head effect and its in-year band effect. A pending request is already counted in asks by those two
 * effects, so its gap after approval is the org's gap as it stands (11.7: it does not move at
 * approval); a draft is not counted yet, so its effects come off the gap here. It is never a
 * recompute of Working with the request applied, so severance, HRIS pay and offers never enter it.
 *
 * Each mode shows the cost gap under its own cost rules, read from the Targets engine's one result
 * per org (src/views/targets/engine/gap.ts `gapRows`, cost.ts `orgAsksCost`), so this card and
 * Targets > Gap never disagree: in HRBP and Leader mode only for an org that is a whole union of cost
 * atoms (rounded, 7.3); in Finance, and in HR admin with the switch off, a unit row exactly and an
 * org below the unit only under 7.4's org-row rule; HR admin with the switch on exactly. Elsewhere the
 * gap shows in heads only, with the reason. A draft's cost change is its band effect, a band figure
 * (7.2 rule 5). Manager mode shows no gap at all (7.6: a manager approving as a manager's manager
 * sees heads, never the band estimate or the cost gap), and transfers never show an amount (10.5).
 *
 * Readings taken here (requests-ui, M3):
 *  - The target org is the nearest org at or above the request's own place with a target for its
 *    fiscal year (targets.ts `targetFor`): for a trade the receiving org (the get seats' manager
 *    position), with the trade's net effect on it; for a transfer the seat it leaves.
 *  - The gap reads the shown version's fiscal year on Targets; for a request in another year the
 *    heads come from that year's Working asks and the cost reads "—" with a note. A target org in the
 *    shown year that the viewer's Targets does not list (outside the mode's scope, such as another
 *    org's target a leader approves for) shows heads, and its cost reads "—" saying so.
 *  - In HRBP and Leader mode a draft's (not yet counted) gap after approval shows heads only, with
 *    ROUNDED_DRAFT_NOTE: the rounded gap less the draft's exact band effect is no whole rounding step
 *    (7.3 (c)), so the two show apart (Targets > Gap and the band estimate). Integration reading.
 *
 * Pure.
 */
import type { AnalyticsContext } from '@/data/context'
import type { TargetRow } from '@/data/schema'
import { fmt } from '@/lib/format'
import { bandEffect, headEffect, asks as orgAsks, targetDateOf, targetFor } from '@/plan/engine/targets'
import { targetKey } from '@/plan/engine/transfer'
import type { HcRequest, SeatPlace } from '@/plan/types'
import { prepare } from '@/views/targets/engine/base'
import { gapRows } from '@/views/targets/engine/gap'
import { orgOfTarget } from '@/views/targets/engine/working'
import { ancestorsOf, targetLabel } from './cycle'
import { fiscalYearOfRequest, planYearOf } from './planYear'

/** The gap after approval as a mode shows it. */
export interface GapAfter {
  /** The target org in words ("Silicon Engineering"). */
  org: string
  /** The org's key, as Targets > Gap keys its row ('unit:Silicon Engineering', 'tree:P-1002'). */
  orgKey: string
  /** Heads: the target less asks after approval; negative is over the target. Null with no target. */
  heads: number | null
  /** USD, under the mode's cost rules; null where it reads "—" (then `note` says why). */
  cost: number | null
  /** Why the cost reads "—", or what the figure is; null when nothing needs saying. */
  note: string | null
}

/** Where a request's own seat sits (a new seat or a trade's get seats: their manager position). */
export function placeOf(req: HcRequest): SeatPlace {
  const fresh = req.type === 'New role' || req.type === 'Trade'
  return {
    positionId: fresh ? null : (req.transfer?.fromPositionId ?? req.positionId),
    managerPositionId: req.managerPositionId || null,
    businessUnit: req.businessUnit,
    department: req.department,
    costCenter: req.costCenter,
  }
}

const NOT_IN_YEAR = (fy: string) => `Cost shows on Targets when ${fy} is the version shown.`
const OUTSIDE_TARGETS = (org: string) =>
  `${org} is outside the targets this mode shows, so its cost gap is not shown here.`
const NO_COST_TARGET = 'This target is in heads only.'
const TRANSFER_NOTE = 'Transfers show no amounts.'
/** A draft's gap after approval in HRBP and Leader mode (see `gapAfterOf`). */
export const ROUNDED_DRAFT_NOTE =
  'In this mode the cost gap shows on Targets, and this request’s band estimate shows beside it.'

/**
 * The gap after approval for a request (see the module comment). `counted`: the request is pending
 * and already in asks (Approvals); false for a draft (Requests > New). Null in Manager mode.
 */
export function gapAfterOf(
  ctx: AnalyticsContext,
  req: HcRequest,
  opts: { counted: boolean; visible: readonly HcRequest[] },
): GapAfter | null {
  if (ctx.access.mode === 'manager') return null
  const fy = fiscalYearOfRequest(req, ctx.asOf)
  const year = planYearOf(ctx, fy)
  const targets: readonly TargetRow[] = ctx.all.targets
  const t = targetFor(placeOf(req), targets, fy, ancestorsOf(ctx))
  if (!t)
    return {
      org: req.businessUnit,
      orgKey: `unit:${req.businessUnit}`,
      heads: null,
      cost: null,
      note: `${req.businessUnit} has no ${fy} target.`,
    }
  const prep = prepare(ctx)
  const row =
    prep.fiscalYear === fy ? (gapRows(prep).find((r) => targetKey(r.target) === targetKey(t)) ?? null) : null
  const org = row ? row.org : orgOfTarget(ctx.all.positions, t)
  const date = targetDateOf(t)
  const asksCtx = row ? prep.actx : year.asks
  const label = row ? row.row.org : targetLabel(t, (id) => prep.holderOf(id))
  let heads = row ? row.row.gapHeads : t.targetHeads - orgAsks(org.match, date, opts.visible, year.asks).heads
  if (!opts.counted) heads -= headEffect(req, org.match, date, asksCtx)
  const bandShown = ctx.access.can('cost:band')
  let cost: number | null = null
  let note: string | null = null
  if (req.type === 'Transfer') note = TRANSFER_NOTE
  else if (!bandShown) note = null
  else if (!row) note = prep.fiscalYear === fy ? OUTSIDE_TARGETS(label) : NOT_IN_YEAR(fy)
  else if (row.row.gapCostUsd == null) note = row.row.targetCostUsd == null ? NO_COST_TARGET : row.row.reason
  // Rounded modes: a draft's gap less its exact band effect would be no whole rounding step (7.3 (c):
  // a rounded difference is built from rounded parts), so the cost reads on Targets and the band
  // estimate beside the draft, apart. A pending request's gap after approval is the gap as it stands.
  else if (!opts.counted && ctx.guard.mode === 'rounded') note = ROUNDED_DRAFT_NOTE
  else {
    cost = row.row.gapCostUsd
    if (!opts.counted) cost -= bandEffect(req, org.match, fy, asksCtx)
  }
  return { org: label, orgKey: org.key, heads, cost, note }
}

/** "1 head", "40 heads", "−1 head": a count of heads with its noun (a gap's sign kept). */
export const headsCount = (n: number): string => `${fmt(n, 'int')} ${Math.abs(n) === 1 ? 'head' : 'heads'}`

/** "3 heads under the target", "18 heads over the target", "at the target". */
export function gapHeadsText(heads: number): string {
  if (heads === 0) return 'at the target'
  return `${fmt(Math.abs(heads), 'int')} ${Math.abs(heads) === 1 ? 'head' : 'heads'} ${heads < 0 ? 'over' : 'under'} the target`
}
