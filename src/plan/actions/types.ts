/**
 * The write path's contract (docs/PLAN.md 5.4, 8.3, 8.4, 10, 11; milestone M3): every change a person
 * makes in the app is one pure action, `(state, ctx, input) => ActionResult`, that checks the policy
 * first (`decide(mode, 'action:<id>')`), then the person-level rules (8.4), then its own rules, and
 * returns the next plan state with its audit drafts (`by` = the Acting as person), or a refusal in one
 * plain sentence. Nothing here writes: src/app/write/ runs an action, saves `next` through the
 * PlanStore and appends `audit` (in order), so every write goes through the store and its write lock.
 *
 * plan/ never imports access/ at runtime (src/ship/imports.test.ts), not even its types, so the
 * context carries what the access layer decides as plain functions and data: `decide` bound to the
 * mode, the person-level rules over the Acting as person (`rules`), and `writeBlock` (no Acting as
 * pick yet). The engines' inputs that need the analytics context (routing on the guarded asks cost,
 * Working, seats, trade quotes, the 7.4 edit rule, a lock's content) come through `env`, built once
 * per context by src/app/write/context.ts `actionEnvOf`. Every function in `env` and `rules` is pure.
 *
 * Frozen in the M3 freeze (docs/CONTRACTS-M3.md): builders fill bodies and never rename or retype an
 * export; a builder who needs a change reports it to the lead. New exports may be added.
 */
import type { Datasets, ISODate, ISODateTime, Mode, Month, TargetRow } from '@/data/schema'
import type { ActualsInput } from '../engine/close'
import type { RankedAsk } from '../engine/cycle'
import type { ReconException } from '../engine/reconcile'
import type { TransitionContext } from '../engine/requests'
import type { AsksContext } from '../engine/targets'
import type { TradeAsk, TradeQuote } from '../engine/trade'
import type { LockContent } from '../store/types'
import type {
  Actor,
  AssumptionRow,
  AuditDraft,
  AuditEntry,
  Comment,
  FiscalYear,
  HcRequest,
  Level,
  PlanState,
  PositionStatus,
  WorkerType,
  WorkingPlan,
  WorkingVersion,
} from '../types'
import type { WriteActionId } from './ids'

/* ───────────── what the access layer decides, as plain data ───────────── */

/**
 * The policy's answer for one surface (src/access/policy/types.ts `Decision`, restated here because
 * plan/ cannot import access/): hidden refuses with `how`; limited lets the action apply its own
 * rule (steps assigned to you, inside your team or org, 7.4's edit rule, ...).
 */
export interface ActionDecision {
  access: 'shown' | 'limited' | 'hidden'
  how?: string
}

/** A request as a viewer may see it (src/access/visibility.ts `RequestView`). */
export type ActionRequestView = 'full' | 'limited' | 'none'

/**
 * The person-level rules (docs/PLAN.md 8.4) for the Acting as person in the context's mode and scope,
 * bound by src/app/write/context.ts `personRulesOf` over src/access/visibility.ts and the mode's scope.
 */
export interface PersonRules {
  /** 8.4 rules 1 to 3 and 2a: 'none' is never acted on (and never counted, rule 6). */
  requestView(req: HcRequest): ActionRequestView
  /** 8.4 rule 5: whether a comment reaches the viewer. */
  commentVisible(c: Comment, req: HcRequest): boolean
  /** 8.4 rule 5's amount grammar (src/access/visibility.ts `hasAmount`). */
  hasAmount(text: string): boolean
  /**
   * The seat is inside the mode's scope: the Manager's tree (strictly below the own seat, R23), the
   * Leader's org, the HRBP's unit; true in the modes with no scope (Finance, HR admin, a company-wide
   * leader).
   */
  seatInScope(positionId: string): boolean
  /** A new seat under this manager position sits inside the scope (a New role, a trade's get seats). */
  placeInScope(managerPositionId: string): boolean
  /** The unit is the HRBP's own (HRBP mode), or inside the scope; true with no scope. */
  unitInScope(businessUnit: string): boolean
  /** The units the Acting as person is HRBP of (the Units list, the HRBP pick's unit). */
  hrbpUnits: ReadonlySet<string>
  /** The seats the Acting as person holds at the as-of date. */
  ownSeats: ReadonlySet<string>
  /** The leader seats the Acting as person holds (Leader review, sub-org targets, the envelope). */
  leaderSeats: ReadonlySet<string>
  /**
   * Import requests in Leader mode with a tree scope (not CEO, CFO or CHRO): the request touches a
   * position in the leader's tree or the leader is on its chain (5.5). True in every other mode.
   */
  mayMerge(req: HcRequest): boolean
}

/** The settings the write path reads (the metric dictionary's, `ctx.metrics`; never a constant). */
export interface ActionSettings {
  /** `requests.queue.expired` idle days (60). */
  idleDays: number
  /** `cost.guard.minCosted` (5, locked, raise-only): 7.4's edit rule and every guarded check. */
  minCosted: number
  /** `cost.guard.minContributors` (5). */
  minContributors: number
  /** `requests.chain.leaderThreshold` (USD, strictly above). */
  leaderThresholdUsd: number
}

/* ───────────── what the engines read, from the analytics context ───────────── */

/** A seat as the write path reads it on the as-of date (src/plan/engine/versions.ts `seatOn`). */
export interface ActionSeat {
  positionId: string
  /** Derived status (6.5, R31): Filled and Open from assignments; Planned, On hold, Eliminated as imported. */
  status: PositionStatus
  /** Req stage Offer accepted, not Started (C23): refused for every Working edit but Elimination. */
  acceptedOffer: boolean
  businessUnit: string
  department: string | null
  costCenter: string
  managerPositionId: string | null
  level: Level
  location: string
  fte: number
  workerType: WorkerType
  /** Planned or target start; null when none (R33). */
  startDate: ISODate | null
  /** The pending request that already names the seat, if any. */
  pendingRequestId: string | null
}

/** New IDs, stable for one context and never reused (a request's comments and seats too). */
export interface ActionIds {
  /** A request ID never used before ('R-0412'). */
  request(n?: number): string
  /** A comment ID for the n-th comment on a request. */
  comment(requestId: string, n: number): string
  /** A freeze ID never used before. */
  freeze(): string
  /** A cycle ID for a fiscal year ('fy29-cycle'). */
  cycle(fiscalYear: FiscalYear): string
  /** A version ID never used before for a new Working or a reopen ('fy29-working'). */
  version(fiscalYear: FiscalYear, kind: 'working'): string
}

/**
 * What the actions read besides plan state (src/app/write/context.ts `actionEnvOf`, one per analytics
 * context, every function pure and memoized there). Datasets are the unscoped ones with plan state's
 * Working overlay applied (src/plan/store/overlay.ts `withOverlay`).
 */
export interface ActionEnv {
  /** Every request in force: the imported rows with plan state's own in place (src/drill/seats.ts `requestsOf`). */
  requests: readonly HcRequest[]
  /** A seat on the as-of date, or null when the data has no such seat. */
  seat(positionId: string): ActionSeat | null
  /** The Working plan approvals, seat edits, trades and transfers apply to (the fiscal year's Working; the as-of year's by default). */
  working(fiscalYear?: FiscalYear): WorkingPlan
  /**
   * What `transition` reads for one request: its chain context (routing on the guarded asks cost,
   * 7.2 rule 8, leaving out every request 8.4 rule 3 hides from its requester, rule 8), its seat,
   * the cycle, the Working plan and `hasAmount` (src/app/write/routing.ts).
   */
  transitionContext(req: HcRequest): TransitionContext
  /**
   * A trade's quote at the plan of record's rates for its year (trade.ts `tradeQuote` with the seats in
   * scope). `exceptRequestId` leaves that request out of the pending ones, so a trade re-quoted at
   * submit or at an approval step is not blocked by its own give seats or its own credit (11.4). An
   * optional parameter added by the core builder (M3).
   */
  quote(ask: TradeAsk, exceptRequestId?: string): TradeQuote
  /** Working's asks context (What if's "Turn into requests"; targets.ts `asksContext`). */
  asks: AsksContext
  /**
   * 7.4's edit rule for an assumption edit (or the assumption set given to `version.create`): null
   * when allowed, else the refusal ("Set by import." for a cap, date, cutoff or pay percentage outside
   * HR admin; "This change would move cost for fewer than 5 costed people." when it moves 1 to 4
   * contributors in all or in one part of Finance's fold). HR admin edits pass. Built by
   * src/views/finance/engine/edits.ts `assumptionEditCheck`.
   */
  assumptionEditRefusal(edits: readonly AssumptionRow[], versionId: string): string | null
  /** The year's Working computed as of `at`, as a lock stores it (src/app/write/lock.ts `lockContentOf`). */
  computeLock(working: WorkingVersion, at: ISODateTime): LockContent
  /** What a month's close snapshots: the datasets as they stand, with the month's actual rates. */
  closeInput(month: Month): ActualsInput
  /**
   * A cycle's ranked asks by business unit: every pending ask but a Sent back one, which is with its
   * requester and left out of the ranking and the lock (D-CYCLE).
   */
  rankedAsks(cycleId: string): ReadonlyMap<string, readonly RankedAsk[]>
  /** A seat's annual band estimate, USD at plan rates, no SBC, for "Move budget too?" (10.5); null with no band. */
  seatBandUsd(positionId: string, fiscalYear: FiscalYear): number | null
  /** Every target row in force for a fiscal year (imported, with Working's own in place). */
  targets(fiscalYear: FiscalYear): readonly TargetRow[]
  /** The direct sub-orgs of a leader seat: the leader seats reporting into its tree with no leader seat between. */
  subOrgsOf(leaderPositionId: string): readonly string[]
  /** The reconciliation exceptions on the as-of date (reconcile.ts `reconcile`). */
  exceptions(): readonly ReconException[]
  ids: ActionIds
}

/* ───────────── the context and the result ───────────── */

export interface ActionContext {
  /** The mode acted in. */
  mode: Mode
  /** The Acting as person: audit `by`, `byName` and `mode`, approvals and 8.4. */
  actor: Actor
  /**
   * The wall clock when the change is made: only the audit entry's own `at` (and nothing a model
   * measures). The write path's clock, tests pin it. Every business date uses `businessAt` (R47).
   */
  at: ISODateTime
  /**
   * The analytics as-of date: the app's business "today" (R47). Expiry, seat states, routing, and the
   * date part of every business date a write stores.
   */
  asOf: ISODate
  /**
   * The write's business date-time (PLAN R47): the as-of date with the wall clock's time of day
   * (src/lib/dates.ts `businessAtOf(asOf, at)`), so writes within a day keep their order. Every
   * business date an action stores reads it: submitted and updated (idle expiry), each step's entered
   * and decided dates, comments, approval and effective dates (`openedDate`, elimination, transfer and
   * trade defaults), cycle stage dates, freeze defaults, close and lock dates. Added by core-platform
   * in the M3 fixes (CONTRACTS-M3 8.1).
   */
  businessAt: ISODateTime
  /** The unscoped datasets with Working's overlay applied. */
  datasets: Datasets
  settings: ActionSettings
  /** This tab is a reader (`PlanStore.readOnly`): every action refuses with READ_ONLY_NOTE. */
  readOnly: boolean
  /** src/access/context.ts `writeBlock`: "Pick who you act as before making changes." or null. */
  writeBlock: string | null
  /** `decide(mode, surface)` bound to the context's mode (`ctx.access.decide`). */
  decide(surface: `action:${WriteActionId}` | string): ActionDecision
  rules: PersonRules
  env: ActionEnv
}

/** An action went through: the next plan state, its audit drafts (in order) and a plain notice. */
export interface ActionOk {
  ok: true
  next: PlanState
  /** One draft per changed field, `by` the Acting as person; appended in this order after the save. */
  audit: AuditDraft[]
  /** A plain sentence for the toast: no amount (7.2 rule 6), no "!", sentence case. */
  notice: string
  /**
   * Datasets a Full workspace Replace brings (`workspace.import`), replaced in the data store after
   * the save (each refuses in a reader tab like the store). Absent for every other action.
   */
  datasets?: Partial<Datasets>
  /**
   * The audit log a Full workspace Replace brings (C35), already verified: the store takes it in
   * place of this workspace's log in the same write as the state (`PlanStore.commit`'s
   * `replaceAudit`), and `audit` follows it. Absent for every other action (Merge keeps the log).
   */
  replaceAudit?: readonly AuditEntry[]
}

/** An action was refused before anything changed: one plain sentence, the PLAN's copy where it gives one. */
export interface ActionRefused {
  ok: false
  refused: string
}

export type ActionResult = ActionOk | ActionRefused

/** Every action's shape. */
export type PlanActionFn<I> = (state: PlanState, ctx: ActionContext, input: I) => ActionResult
