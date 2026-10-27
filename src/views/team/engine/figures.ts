/**
 * My team's figures, key figures and Needs attention kinds (docs/PLAN.md 9.3, the Manager home). Ids
 * start with `team-` (the policy decides them by that prefix); `team-heads-vs-allocation` is
 * src/access/ids.ts `HOME_FIGURES`' entry for this home. Frozen in the M2 freeze: the builder may add
 * ids with the prefix, never rename these. Plain data.
 */
import type { ItemKind } from '@/access/ids'
import { plural } from '@/lib/format'
import { ID as PLAN_ID } from '@/views/plan/metrics'
import { ID } from '../metrics'

/** The hero's drill label for a screen reader: "Show the 1 seat left to fill" (14.3, review CP-5). */
export const heroDrillLabel = (count: number, label: string): string =>
  `Show the ${plural(count, 'seat')} ${label}`

export const TEAM_FIGURES = {
  /** The hero: Left to fill, split Open / requested / left to request. */
  hero: 'team-left-to-fill',
  kpis: 'team-kpis',
  attention: 'team-attention',
  /** My list: the request tracker. */
  tracker: 'team-tracker',
  headsVsAllocation: 'team-heads-vs-allocation',
  /** "Changed by your HRBP": the HRBP's Working edits of the tree's seats, with their reasons (M3). */
  hrbpChanges: 'team-hrbp-changes',
  /** Plan > Hiring's Open to hire tile, beside the hero (9.7, change C36; `TEAM_HIRING`). */
  openToHire: 'team-open-to-hire',
} as const
export type TeamFigureId = (typeof TEAM_FIGURES)[keyof typeof TEAM_FIGURES]

/** The key figures' metric ids, in strip order (9.3: Manager 7). */
export const TEAM_KEY_METRICS: readonly string[] = [
  ID.allocationHeads,
  ID.allocationFilled,
  ID.allocationOpen,
  ID.allocationPlanned,
  ID.requestsPending,
  ID.allocationLeftToRequest,
  ID.budgetStatus,
]

/**
 * My team's Open to hire tile (docs/PLAN.md 9.7, change C36; the hiring freeze): Plan > Hiring's own
 * tile for the tree, re-linked to Plan > Hiring, drawn beside the hero Left to fill with
 * `OPEN_TO_HIRE_NOTE` (Left to fill counts seats; Open to hire also subtracts current heads and the
 * future starts to come). It is not an eighth key figure: Manager mode keeps its 7 (9.3's 5 to 7
 * rule), and none of them made way for it. `TEAM_FIGURES.openToHire` is its figure; the engine fills
 * `TeamModel.openToHire` (./index.ts).
 */
export const TEAM_HIRING = {
  /** src/access/ids.ts `TEAM_HIRING_FIGURE`. */
  figure: 'team-open-to-hire',
  metricId: PLAN_ID.hiringOpen,
  /** Where it links: Plan > Hiring. */
  view: 'plan',
  tab: 'hiring',
} as const

/**
 * The item kinds My team's Needs attention promises (9.3): approvals waiting on you, sent-back
 * requests, Planned seats near start with no req, trade credit about to lapse. Each routes to `needs`
 * in Manager mode (src/access/items.ts `ITEM_ROUTING`; `roleItems.test.ts`).
 */
export const TEAM_NEEDS: readonly ItemKind[] = [
  'requests:approve',
  'requests:waiting',
  'requests:sent-back',
  'plan:planned-no-req',
  'requests:trade-credit-lapse',
]
