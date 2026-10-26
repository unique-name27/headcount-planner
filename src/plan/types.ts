/**
 * Plan state types (docs/PLAN.md 5.3, 5.5, 10.1, 10.5, 11.3 and 11.4). Types only: no runtime code.
 *
 * Frozen in M1: builders fill the engines behind these types and never rename or retype an export;
 * a builder who needs a change reports it to the lead instead of making it. New exports may be added.
 *
 * Two layers (docs/PLAN.md 5):
 *  - the eight imported datasets (`src/data/schema.ts`, rows named `*Row`);
 *  - plan state, what people do in the app: versions and their locked lines, month closes and
 *    back-dated adjustments, Working edits (dated position rows and other dataset rows written in
 *    the app), requests with their steps and comments, cycles and trades. The audit log is kept
 *    apart (`PlanStore.appendAudit`, 500 entries a chunk).
 *
 * Vocabularies (levels, statuses, request types, prorations, ...) come from `src/data/schema.ts` and
 * are re-exported here, so plan code imports one module. Money is carried in floating point and
 * never rounded by an engine; only display rounds (docs/PLAN.md 6).
 */
import type { AtomIndex } from '@/cost/atoms'
import type {
  AssumptionRow,
  CycleStage,
  Datasets,
  EndReason,
  FiscalYear,
  FreezeRow,
  FxSet,
  ISODate,
  ISODateTime,
  Level,
  Mode,
  Month,
  PositionRow,
  PositionStatus,
  Proration,
  ReasonCode,
  ReqType,
  RequestState,
  RequestType,
  StepDecision,
  TargetRow,
  WorkerType,
} from '@/data/schema'

export type {
  AssumptionRow,
  CycleStage,
  EndReason,
  FiscalYear,
  FxSet,
  ISODate,
  ISODateTime,
  Level,
  Mode,
  Month,
  PositionStatus,
  Proration,
  ReasonCode,
  ReqType,
  RequestState,
  RequestType,
  WorkerType,
} from '@/data/schema'

/* ───────────────────────── positions and people ───────────────────────── */

/**
 * One effective-dated position row resolved "as of" a date, with every blank filled: `fte` 1,
 * `workerType` Employee, `legalEntity` from the location's site (src/plan/engine/versions.ts
 * `toPosition`). `status` is as imported; computed lines derive Filled and Open from assignments
 * (docs/PLAN.md 6.5, 15.1 R31).
 */
export interface Position {
  positionId: string
  effectiveDate: ISODate
  status: PositionStatus
  title: string | null
  jobFamily: string | null
  level: Level
  businessUnit: string
  department: string | null
  costCenter: string
  location: string
  legalEntity: string
  managerPositionId: string | null
  workerType: WorkerType
  fte: number
  /** Target or planned start of whoever fills an Open or Planned seat. */
  startDate: ISODate | null
  /** The date the seat last became Open; null derives it (forecast.ts `openedOn`). */
  openedDate: ISODate | null
  reqType: ReqType | null
  /** Overrides the level rule for leader seats; null: Director (M2) or above. */
  leaderLevel: boolean | null
  /** For Eliminated: the seat's last day, inclusive; its Eliminated row starts the day after. */
  endDate: ISODate | null
  endReason: EndReason | null
  sourceRequestId: string | null
}

/**
 * A person in a position, from the first day to the last day (both inclusive), from one `workers`
 * row (heads.ts `toAssignments`): `start` is assignmentStart or the hire date; `end` is the earlier
 * of assignmentEnd and terminationDate; `fte` is 1 when blank. A null `positionId` is a person not in
 * the plan. Only Employee assignments count heads or cost.
 */
export interface Assignment {
  employeeId: string
  positionId: string | null
  start: ISODate
  end: ISODate | null
  fte: number
  workerType: WorkerType
}

/**
 * Where a seat sits, for the org tests of targets, freezes, scopes and transfers. For a seat that
 * does not exist yet (a New role, a trade's get seat) `positionId` is null and the manager position
 * places it.
 */
export interface SeatPlace {
  positionId: string | null
  managerPositionId: string | null
  businessUnit: string
  department: string | null
  costCenter: string | null
}

/**
 * Whether a seat belongs to an org on a date: a target's org (unit, department, cost center or
 * leader tree), a manager's tree (strictly below the manager's own seat), a freeze's org or a scope.
 * Built by the caller from the position tree; engines only call it. Pure.
 */
export type OrgMatch = (seat: SeatPlace, on: ISODate) => boolean

/** The org fields a new seat takes from where it sits (applyTrade, transfers, New role approval). */
export interface SeatOrgFields {
  businessUnit: string
  department: string | null
  costCenter: string
  legalEntity: string
}

/* ───────────────────────── plan lines ───────────────────────── */

/** Where a line's base came from; the cost guard reads it (docs/PLAN.md 7.2 rule 3). */
export type CostBasis = 'hris' | 'offer' | 'band'

/** A line's monthly amounts in its local currency. `oneTime` books whole in its month. */
export interface LocalAmounts {
  base: number
  bonus: number
  burden: number
  benefits: number
  oneTime: number
  /**
   * The vacancy allowance (docs/PLAN.md 15.2 C31): −vacancyFactor × the filled part's recurring cost
   * (base + bonus + burden + benefits of the seat's 'hris' and 'offer' lines in the month). Only plan
   * versions (Budget, reforecasts and Working) carry it, on an allowance line of its own (cost.ts
   * `isAllowanceLine`); it is 0 on every seat line, on forecast lines and on actual lines. An
   * addition to PLAN.md 5.3 (lead decision D-VAC, M1 fix-up).
   */
  vacancy: number
}

/**
 * A line's monthly amounts in USD: the local amounts × the line's rate, plus `equity` (USD, shown only
 * "incl. SBC") and `loaded` = base + bonus + burden + benefits + oneTime + vacancy (equity excluded).
 * A seat line's vacancy is 0, so its loaded cost is base + bonus + burden + benefits + oneTime; a plan
 * version's total (Σ loaded) includes its allowance lines.
 */
export interface UsdAmounts extends LocalAmounts {
  equity: number
  loaded: number
}

/**
 * One position × version × month (docs/PLAN.md 5.3, 6.3 and 6.5).
 *
 * A month normally has one line per position. A seat that changes hands, or changes basis, inside
 * the month (a holder's last day, then a replacement) has one line per costed segment, told apart by
 * `holderId`, so the guard can count costed people and keep the filled part and the band part apart.
 * Only the segment in effect at the month's end carries `heads` (at most one line per position and
 * month has heads 1).
 *
 * A plan version also carries one allowance line per seat, month and currency with filled-part cost
 * (15.2 C31): every amount 0 but `vacancy` and `loaded` (= vacancy), heads, FTE and active 0,
 * holderId null, basis 'hris' (or 'offer' when the seat's filled part is an offer alone).
 */
export interface PlanLine {
  positionId: string
  versionId: string
  month: Month
  /**
   * Who the segment costs: the employee ID for an `hris` line, the req ID for an `offer` line, null
   * for a `band` run of an Open or Planned seat and for an allowance line. A holder with no comp row
   * and an accepted offer with no `offerBase` are costed at band (basis 'band') and keep their
   * employee or req ID (M1 fix-up). An addition to PLAN.md 5.3 (see above); never shown outside HR
   * admin with the switch, and never written to a Shareable or Requests file.
   */
  holderId: string | null
  /**
   * The seat's plan status at the month's end (6.5): Filled when it has an active Employee assignment,
   * or when it is Open or Planned with a planned start on or before the month's end (planned to be
   * filled); otherwise its derived status (a Filled row reads Open from the day after the last
   * assignment's last day).
   */
  status: PositionStatus
  /** 1 when the seat is a plan head at the month's end (`status` Filled), else 0. */
  heads: number
  /** The segment's FTE: the holder's assignment FTE for `hris`, the position's FTE otherwise. */
  fte: number
  /** The segment's active fraction in the month under the version's proration (proration.ts). */
  active: number
  /**
   * The segment's active fraction by day (`activeFraction('daily', ...)`), on a line whose `active`
   * follows another proration: average FTE is always daily (spec "Heads and FTE", PLAN 2; M4 review
   * SA-5), so FTE reads `fte × activeDaily` there and `fte × active` everywhere else. Set by the
   * engines on the lines they compute (Working, the forecast); absent under daily proration and on
   * stored line tables (`PlanLineTable` has no such column; a locked version reads `active`).
   */
  activeDaily?: number
  currency: string
  /** USD per 1 local, from the line's rate set (plan lines: the version's plan rates). */
  rate: number
  local: LocalAmounts
  usd: UsdAmounts
  basis: CostBasis
}

/** A column of strings stored as codes into a dictionary: `dict[codes[i]]` is row i's value. */
export interface StringColumn<T extends string = string> {
  readonly dict: readonly T[]
  readonly codes: Uint32Array
}

/** The number columns of a PlanLineTable, one Float64Array each. */
export type PlanLineNumber =
  | 'heads'
  | 'fte'
  | 'active'
  | 'rate'
  | 'localBase'
  | 'localBonus'
  | 'localBurden'
  | 'localBenefits'
  | 'localOneTime'
  | 'localVacancy'
  | 'usdBase'
  | 'usdBonus'
  | 'usdBurden'
  | 'usdBenefits'
  | 'usdOneTime'
  | 'usdVacancy'
  | 'usdEquity'
  | 'usdLoaded'

/**
 * A locked version's lines, columnar so about 30,000 lines stay small (docs/PLAN.md 5.3). Plain data:
 * it clones into IndexedDB as it is. Read it back as `PlanLine` objects with
 * `planLineRows` (src/plan/engine/lineTable.ts), a `RowsOf<PlanLineTable, PlanLine>`. A null holder
 * is stored as ''. Rows are sorted by positionId, month, then holderId.
 */
export interface PlanLineTable {
  readonly length: number
  readonly versionId: string
  readonly positionId: StringColumn
  readonly holderId: StringColumn
  readonly month: StringColumn<Month>
  readonly status: StringColumn<PositionStatus>
  readonly currency: StringColumn
  readonly basis: StringColumn<CostBasis>
  readonly numbers: Readonly<Record<PlanLineNumber, Float64Array>>
}

/** Reads a columnar table back as row objects, in stored order (for drills and tests). */
export type RowsOf<Table, Row> = (table: Table) => IterableIterator<Row>

/* ───────────────────────── FX ───────────────────────── */

/** One rate: USD per 1 unit of local currency, for a currency, rate set and month. USD is always 1. */
export interface FxRate {
  currency: string
  set: FxSet
  month: Month
  usdPerLocal: number
}

/** A version's rates (a locked version stores its own, docs/PLAN.md 6.4). Look up with fx.ts `rateOf`. */
export type FxTable = readonly FxRate[]

/* ───────────────────────── versions ───────────────────────── */

export type VersionKind = 'budget' | 'reforecast' | 'working'
export type VersionState = 'working' | 'locked' | 'retired'

/**
 * A plan version (docs/PLAN.md 5.3 and 6.5). Each fiscal year has exactly one 'working' version.
 * 'retired' is a former Working replaced by "Reopen as new": read only, never a picker default, no
 * hash.
 */
export interface Version {
  versionId: string
  name: string
  kind: VersionKind
  fiscalYear: FiscalYear
  /** The fiscal year plus up to 6 months, fixed at creation. */
  grid: { from: Month; to: Month }
  proration: Proration
  state: VersionState
  createdAt: ISODateTime
  lockedAt: ISODateTime | null
  lockedBy: string | null
  engineVersion: string
  parentId: string | null
  /** 'sha256-<hex>' when locked, else null. */
  hash: string | null
}

/** A Working or retired version: its lines are computed live (Working) or not at all (retired). */
export interface WorkingVersion extends Version {
  state: 'working' | 'retired'
  hash: null
}

/**
 * A locked Budget or reforecast: lines, assumptions, rates, proration, engine version and a SHA-256,
 * never recomputed (docs/PLAN.md 6.5). Budget never unlocks. Reforecasts store their forecast.
 */
export interface LockedVersion extends Version {
  state: 'locked'
  kind: 'budget' | 'reforecast'
  lockedAt: ISODateTime
  lockedBy: string
  hash: string
  lines: PlanLineTable
  assumptions: readonly AssumptionRow[]
  rates: FxTable
  forecast: ForecastTable | null
}

/** Every version plan state holds, told apart by `state`. */
export type AnyVersion = WorkingVersion | LockedVersion

/** A version by reference only: what a Shareable file and a workspace's hash check carry (5.5). */
export interface LockedVersionRef {
  versionId: string
  name: string
  kind: VersionKind
  fiscalYear: FiscalYear
  state: VersionState
  hash: string | null
}

/* ───────────────────────── forecast (stored with reforecasts) ───────────────────────── */

/** Heads and modeled exits of one forecast cohort in a month (docs/PLAN.md 6.7 step 2). */
export interface CohortMonth {
  /** The cohort's expected heads at the month's start. */
  headsAtStart: number
  modeledExits: number
}

/** One month of a forecast (docs/PLAN.md 6.7). Expected values: starts are probability-weighted. */
export interface ForecastMonth {
  month: Month
  /** Read from the month's close (actuals, one-time items included, C32), not projected. */
  closed: boolean
  /** Expected heads at the month's end. */
  heads: number
  /** Expected average FTE over the month (daily). */
  fte: number
  /** Probability-weighted starts in the month (accepted offers count 1). */
  starts: number
  knownExits: number
  /** Every modeled exit in the month: the HRIS cohort's plus the band cohort's. */
  modeledExits: number
  /** Modeled backfills starting in the month (0 under a freeze). */
  backfills: number
  /** The HRIS cohort (Filled seats at the as-of date and accepted offers) and the band cohort (modeled starts and backfills). */
  cohorts: { hris: CohortMonth; band: CohortMonth }
  /**
   * The month's cost in USD, as the guard's two parts (docs/PLAN.md 7.2 rule 3): `filled` is Filled
   * seats at HRIS pay, accepted offers at offer and HRIS-cohort modeled exits; `band` is starts and
   * backfills at midpoint and band-cohort modeled exits at band estimate.
   */
  cost: { filled: UsdAmounts; band: UsdAmounts }
}

/** What a reforecast stores of its forecast: enough for forecast accuracy and the version card. */
export interface ForecastTable {
  asOf: ISODate
  /** The last closed month when the forecast ran. */
  closedThrough: Month | null
  months: readonly ForecastMonth[]
  unfilledAtHorizon: number
  yearEnd: { heads: number; cost: UsdAmounts }
}

/* ───────────────────────── month close and actuals ───────────────────────── */

/** A leave state on an actual line (a `pay` and `leave` fact: HR admin with the switch only). */
export type LeaveState = 'none' | 'paid' | 'unpaid'

/**
 * One employee's HRIS actuals for a closed month (docs/PLAN.md 6.6): heads, FTE and cost components
 * from HRIS pay at the close, at the month's actual rate. Unpaid leave sets the pay components to 0
 * and never changes who is costed. A null `positionId` is an employee not in the plan.
 *
 * A close also snapshots the one-time items booked in its month (15.2 C32: sign-on, relocation,
 * agency fee, severance, by the 6.3 rules) as one-time lines of their own: heads, FTE, active and the
 * recurring amounts 0, `oneTime` the item at the month's actual rate. Such a line's `employeeId` is
 * the person the item belongs to (the hire who took the offer, the eliminated seat's last holder), or
 * the req ID for an agency fee or sign-on whose hire has not started.
 */
export interface ActualLine {
  employeeId: string
  positionId: string | null
  month: Month
  heads: number
  fte: number
  active: number
  currency: string
  /** The month's actual rate, USD per 1 local. */
  rate: number
  local: LocalAmounts
  usd: UsdAmounts
  leave: LeaveState
}

/** The number columns of an ActualLineTable. */
export type ActualLineNumber = PlanLineNumber

/**
 * A close's lines, columnar like PlanLineTable; read back with `actualLineRows`
 * (src/plan/engine/lineTable.ts). A null positionId is stored as ''.
 */
export interface ActualLineTable {
  readonly length: number
  readonly employeeId: StringColumn
  readonly positionId: StringColumn
  readonly month: StringColumn<Month>
  readonly currency: StringColumn
  readonly leave: StringColumn<LeaveState>
  readonly numbers: Readonly<Record<ActualLineNumber, Float64Array>>
}

/**
 * A closed month: the HRIS actuals snapshot, read instead of recomputed, and the cost-atom index in
 * force from this close until the next (docs/PLAN.md 7.3a, change C20).
 */
export interface MonthClose {
  month: Month
  closedAt: ISODateTime
  /** The Acting as person who closed it. */
  by: string
  lines: ActualLineTable
  /** `atomIndex(positions, monthEnd(month))`, stored with the close; every rounded figure reads the last close's. */
  atoms: AtomIndex
  /** 'sha256-<hex>' over the canonical JSON of the close without `hash`. */
  hash: string
}

/** A close by reference only (Shareable files, 5.5). */
export interface CloseRef {
  month: Month
  closedAt: ISODateTime
  hash: string
}

/** Pay, comp, FTE and leave changes are all 'other' (docs/PLAN.md 6.6). */
export type AdjustmentKind = 'hire' | 'exit' | 'other'

/** Generated from the kind, never typed, never naming leave (close.ts `ADJUSTMENT_REASON`). */
export type AdjustmentReason = 'Back-dated hire' | 'Back-dated exit' | 'Other HRIS change'

/**
 * A back-dated change to a closed month, posted in the first open month (docs/PLAN.md 6.6). `delta`
 * is the change to the closed month's actual line (new minus closed). A null positionId is an
 * employee not in the plan (an addition to PLAN.md 5.3, which types it `string`).
 */
export interface Adjustment {
  id: string
  postedIn: Month
  forMonth: Month
  positionId: string | null
  kind: AdjustmentKind
  delta: ActualLine
  reason: AdjustmentReason
}

/* ───────────────────────── requests (docs/PLAN.md 10.1) ───────────────────────── */

/** An approval step's role. */
export type StepRoleCode = 'manager' | 'hrbp' | 'leader' | 'finance'

/** A decision taken on a step (StepDecision less 'Pending'). */
export type Decision = Exclude<StepDecision, 'Pending'>

/** Why a chain rule added its step (docs/PLAN.md 10.2 `CHAIN_RULES[].when`). */
export type ChainTrigger =
  | 'cross-unit'
  | 'band-estimate-over-threshold'
  | 'director-plus'
  | 'out-of-plan'
  | 'different-direct-reports'
  | 'new-role'
  | 'freeze-exception'
  | 'envelope-exception'

/** A step's reasons: 'always' for an unconditional rule, else the triggers that held. */
export type ChainReason = 'always' | ChainTrigger

/** One approval step, stored on the request so every viewer reads the same chain (10.2). */
export interface Step {
  /** 1-based order in the chain. */
  n: number
  role: StepRoleCode
  approverId: string
  reasons: readonly ChainReason[]
  /** When the request reached this step; null while it waits on an earlier step. */
  enteredAt: ISODateTime | null
  decision: Decision | null
  at: ISODateTime | null
  /**
   * The send-back, reject or change reason typed with the decision (refused at entry when it holds
   * an amount, 8.4 rule 5). An addition to PLAN.md 10.1.
   */
  note: string | null
}

export type CommentAudience = 'everyone' | 'approvers'

/** A comment on a request. Text with an amount is always 'approvers' (8.4 rule 5). */
export interface Comment {
  id: string
  at: ISODateTime
  by: string
  mode: Mode
  text: string
  audience: CommentAudience
}

/** The fields an approver may change with "Approve with changes" (HRBP; a trade's count and start). */
export type ChangeableField = 'level' | 'location' | 'fte' | 'startDate' | 'count'

/** "Approved with changes": what changed, from what, and why. Managers see each change with its reason. */
export interface ChangeSet {
  by: string
  at: ISODateTime
  /** Refused at entry when it holds an amount (8.4 rule 5). */
  reason: string
  changes: readonly { field: ChangeableField; old: string | number | null; new: string | number | null }[]
  /**
   * A trade's credit in bp before the first change and after the last (11.4's "credit 0.11 to 0.56
   * standard heads", review SC-16, UI-6); absent when the credit did not move or the request is no
   * trade. Files carry it (M3 verify).
   */
  credit?: { old: number | null; new: number | null }
}

/**
 * A trade's own fields (docs/PLAN.md 11.4). The get seats' level, location, FTE, start and org are the
 * request's own `level`, `location`, `fte`, `startDate` and `managerPositionId`, and the request's
 * `businessUnit`, `department` and `costCenter` are the get seats' org (the receiving org). The giving
 * org is `giveOrgPositionId`.
 */
export interface TradeFields {
  /** The seats given (`givePositionIds`, ";"-separated in files). */
  givePositionIds: readonly string[]
  /** The giving org, stored at submit and never derived again (11.2); null only on a draft. */
  giveOrgPositionId: string | null
  creditUsedBp: number
  /** Whole seats received (the part-time rest seat is extra: seats received = count + (restFte ? 1 : 0)). */
  count: number
  jobFamily: string | null
  /** Ask for a part-time last seat with what is left, where the location allows part time. */
  partTimeRest: boolean
  /**
   * The part-time last seat's FTE as the quote at submit found it (re-stored at each approval), so
   * `applyTrade` can create it without re-pricing; null when the trade has none (none asked, or none
   * fits). An addition to PLAN.md 11.4; a `requests` row has no such column, so an imported trade
   * reads null and is re-quoted at its next approval step.
   */
  restFte: number | null
  /** The rates the quote used: version id and lock hash (null: Working). */
  rateVersion: string | null
  rateHash: string | null
  /** Stored at submit and re-stored at each approval; null on a draft. */
  giveBp: number | null
  getBp: number | null
  creditBp: number | null
  /**
   * Finance's "Move target too?" on a cross-unit trade (11.4, review SP-5), stored at the final
   * approval so an imported copy replays the same choice (D-MERGE); absent before it (on by default).
   */
  moveTarget?: boolean
}

/** A transfer's own fields (docs/PLAN.md 10.5). */
export interface TransferFields {
  kind: 'position' | 'internal'
  personId: string
  fromPositionId: string
  /** Position move: the new manager position. */
  toManagerPositionId: string | null
  /** Internal move: the Open seat the person fills. */
  toPositionId: string | null
  effectiveDate: ISODate
  /** "Move budget too?": shift both orgs' targets by one head and the seat's in-year band estimate. */
  moveBudget: boolean
}

/** What approving did: positions created (never reused IDs) and changed. */
export interface RequestOutcome {
  createdPositionIds: readonly string[]
  changedPositionIds: readonly string[]
}

/**
 * A headcount request in plan state (docs/PLAN.md 10.1). Built from a `requests` row by
 * requests.ts `fromRow`, written back by `toRow`.
 */
export interface HcRequest {
  requestId: string
  type: RequestType
  state: RequestState
  reasonCode: ReasonCode
  requesterId: string
  /** Who submitted it for the requester ("Submit on behalf"), or null. */
  submittedById: string | null
  submittedAt: ISODateTime | null
  /** The business time of the last change (R47: the as-of date with the wall clock's time of day); idle expiry reads it. */
  updatedAt: ISODateTime
  /**
   * The wall-clock time of the last change, in the workspace that made it (M3 recheck): what Import
   * requests and Merge compare to find the later copy, since two business times on one as-of date
   * can run backwards across wall-clock days. Set by the write path on every change; a merge keeps
   * the file's. Absent on the sample's, the dataset's and older requests: `updatedAt` stands in.
   */
  revisedAt?: ISODateTime
  /**
   * The wall-clock time the request was made, in the workspace that minted its ID (M3 recheck): two
   * copies of one ID made at different times are two requests (merge.ts reads an ID clash). Absent on
   * the sample's, the dataset's and older requests.
   */
  createdAt?: ISODateTime
  /** The seat changed, backfilled, eliminated or recruited for; null for a New role and a trade. */
  positionId: string | null
  /** The org: the position a new seat reports to; for a trade, the get seats' org. */
  managerPositionId: string
  businessUnit: string
  department: string | null
  costCenter: string | null
  level: Level | null
  location: string | null
  jobTitle: string | null
  fte: number | null
  /** Proposed start, or the date a change takes effect. */
  startDate: ISODate | null
  /** Rank among the requester's asks in a cycle; 1 is first. */
  priority: number | null
  cycleId: string | null
  confidential: boolean
  /** Raised against a hiring freeze: the freeze and the business reason (no amount, 8.4 rule 5). */
  exception: { freezeId: string; reason: string } | null
  steps: readonly Step[]
  comments: readonly Comment[]
  /** Set by "Approve with changes". */
  changes: ChangeSet | null
  trade: TradeFields | null
  transfer: TransferFields | null
  outcome: RequestOutcome | null
}

/* ───────────────────────── cycles (docs/PLAN.md 10.3) ───────────────────────── */

/** Where a unit's cut line sits: after this many ranked heads. */
export interface CutLineMark {
  businessUnit: string
  afterHeads: number
}

/**
 * The order an HRBP (or a leader, within the envelope) set for a unit's ranked asks
 * (`action:cycle.rank`, Requests > Cycle): request IDs, first ranked first. cycle.ts `rankAsks` reads
 * it as `order`; asks missing from it follow in the default order. An addition to PLAN.md 10.3
 * (M3 freeze): a manager ranks their own asks through each request's `priority` instead.
 */
export interface CycleOrder {
  businessUnit: string
  requestIds: readonly string[]
}

/** A planning cycle for one fiscal year. Finance opens, dates, locks or returns it. */
export interface Cycle {
  cycleId: string
  fiscalYear: FiscalYear
  stage: CycleStage
  openedAt: ISODateTime
  openedBy: string
  dates: {
    asksDue: ISODate
    hrbpReviewDue: ISODate | null
    leaderReviewDue: ISODate | null
    financeReviewDue: ISODate | null
  }
  /** Units whose HRBP finished HRBP review. */
  hrbpDone: readonly string[]
  /** Leader positions whose leader finished Leader review. */
  leaderDone: readonly string[]
  cutLines: readonly CutLineMark[]
  /** Each unit's ranked order as the HRBP set it (absent: the default order). An addition (M3 freeze). */
  order?: readonly CycleOrder[]
  lockedAt: ISODateTime | null
  lockedBy: string | null
}

/* ───────────────────────── audit (docs/PLAN.md 5.3 and 10.7) ───────────────────────── */

export type AuditObject =
  | 'position'
  | 'request'
  | 'version'
  | 'assumption'
  | 'target'
  | 'freeze'
  | 'cycle'
  | 'close'
  | 'transfer'
  | 'workspace'

/** One append-only audit entry. `hash` is sha256 over the canonical JSON of the entry without `hash`. */
export interface AuditEntry {
  seq: number
  at: ISODateTime
  /** The Acting as person. */
  by: string
  byName: string
  mode: Mode
  object: AuditObject
  id: string
  field: string
  old: unknown
  new: unknown
  effectiveDate: ISODate | null
  comment: string | null
  /**
   * Set when `comment` comes from a request comment or a decision note, so `auditView` can apply
   * `commentVisible` (8.4); null otherwise.
   */
  commentAudience: CommentAudience | null
  prevHash: string
  hash: string
}

/** An entry before the chain numbers and hashes it: what engines return and `appendAudit` takes. */
export type AuditDraft = Omit<AuditEntry, 'seq' | 'prevHash' | 'hash'>

/**
 * An entry as every mode but HR admin sees it (`auditView`, src/access/visibility.ts): no `seq`,
 * `prevHash` or `hash`, since each hash covers entries the viewer may not see (8.4 rule 7).
 */
export type AuditRow = Omit<AuditEntry, 'seq' | 'prevHash' | 'hash'>

/** Who acts: the Acting as pick, its name and the mode (sets audit `by`, `byName` and `mode`). */
export interface Actor {
  personId: string
  name: string
  mode: Mode
}

/* ───────────────────────── Working edits and effects ───────────────────────── */

/**
 * Dataset rows written in the app, applied over the imported datasets (src/plan/store overlay
 * merge): each row replaces the imported row with the same row key (`DATASETS[].rowKey`) or adds
 * one. Position rows are dated, so an edit adds a row rather than changing history.
 */
export interface DatasetOverlay {
  positions: readonly PositionRow[]
  targets: readonly TargetRow[]
  freezes: readonly FreezeRow[]
  /** Assumption rows edited in Working; each names its version. */
  assumptions: readonly AssumptionRow[]
  /**
   * Assumption rows taken back by Remove override (M3 review): an imported or overlay row with the
   * same row key is left out (src/plan/store/overlay.ts `withOverlay`), so the value falls back to
   * the org's parent. Setting the key again takes the removal back. Absent: none.
   */
  removedAssumptions?: readonly AssumptionRow[]
}

/** A dated position row an approval or edit adds, and why. */
export interface PositionChange {
  kind: 'created' | 'changed' | 'opened' | 'held' | 'eliminated'
  row: PositionRow
}

/** What approving a request (or applying an edit) does to plan state. */
export type PlanEffect =
  | { kind: 'position'; change: PositionChange }
  | { kind: 'target'; row: TargetRow; previous: TargetRow | null }

/**
 * The Working plan an approval applies to (applyTrade, transfers, New role): every position row
 * (imported plus overlay), the assignments, and how new seats get IDs and org fields.
 */
export interface WorkingPlan {
  versionId: string
  positions: readonly PositionRow[]
  assignments: readonly Assignment[]
  /** A position ID never used before, stable for a request: the n-th new seat of `requestId`. */
  newPositionId(requestId: string, n: number): string
  /** The org fields a new seat under a manager position at a location takes; null when the manager is unknown. */
  placeOf(managerPositionId: string, location: string): SeatOrgFields | null
  actor: Actor
}

/** A reconciliation exception marked reviewed (Finance > Reconcile). */
export interface ReconReview {
  /** reconcile.ts `ReconException.id`. */
  exceptionId: string
  at: ISODateTime
  by: string
}

/* ───────────────────────── plan state ───────────────────────── */

/**
 * Everything the PlanStore keeps (docs/PLAN.md 5.4), apart from the audit log. On the sample (which
 * is regenerated on every load and never stored), plan state is an overlay against the sample's
 * baseline id, so a reload keeps your approvals.
 */
export interface PlanState {
  v: 1
  /** The sample baseline this state overlays, or null for imported data. */
  baselineId: string | null
  versions: readonly AnyVersion[]
  closes: readonly MonthClose[]
  adjustments: readonly Adjustment[]
  overlay: DatasetOverlay
  requests: readonly HcRequest[]
  cycles: readonly Cycle[]
  reviewed: readonly ReconReview[]
  /** Each request's `updatedAt` at the last Import requests merge, to find rows changed on both sides. */
  mergeBase: readonly { requestId: string; updatedAt: ISODateTime }[]
  /** The last audit entry's `seq` and `hash`, or null before the first entry. */
  auditHead: { seq: number; hash: string } | null
  /**
   * This workspace's request ID tag (M3 review D-ID, IN-1): four Crockford base32 characters the
   * store mints once per workspace (src/plan/store/idTag.ts) and keeps with the plan state, so new
   * request IDs are 'R-<tag>-<n>' (src/plan/actions/requestIds.ts) and never collide across
   * browsers. The sample's and imported requests keep their own IDs. Absent until the store gives
   * one; a Replace or Merge keeps this workspace's tag.
   */
  idTag?: string
  /**
   * This workspace's request ID secret (M3 recheck): 32 hex characters the store mints with the tag.
   * A new request's number is a keyed hash of it, the Acting as person and their own count
   * (src/plan/actions/requestIds.ts), so no ID tells who raised it. Kept with the plan state (and in a
   * Full file, which holds everything), never in a Shareable or Requests file. Merge keeps this
   * workspace's; Replace takes a new one, so a restore never mints an ID again.
   */
  idSecret?: string
}

/** Any JSON value: what a guarded model value written to a file can be. */
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [k: string]: JsonValue }

/**
 * What a workspace file carries of plan state (docs/PLAN.md 5.5), by kind:
 *  - 'full' (HR admin with "Show pay amounts" on): the whole state and the whole audit log;
 *  - 'shareable': the exporting mode's guarded output only: requests through `requestView`,
 *    comments through `commentVisible`, audit rows through `auditView`, versions and closes by
 *    reference, and the mode's model values by figure id exactly as on screen (rounded, folded or
 *    absent). Never a PlanLineTable, ActualLineTable, Adjustment, comp row, pay or leave field;
 *  - 'requests' ("Export requests"): requests whose `requestView` is 'full' for the exporter, with
 *    their steps and comments only.
 * Import requests reads `requests` from a 'requests' or 'shareable' slice and nothing else.
 */
export type PlanStateSlice =
  | { kind: 'full'; state: PlanState; audit: readonly AuditEntry[] }
  | {
      kind: 'shareable'
      requests: readonly HcRequest[]
      cycles: readonly Cycle[]
      versions: readonly LockedVersionRef[]
      closes: readonly CloseRef[]
      audit: readonly AuditRow[]
      models: Readonly<Record<string, JsonValue>>
    }
  | { kind: 'requests'; requests: readonly HcRequest[] }

export type WorkspaceKind = 'shareable' | 'full' | 'requests'

/** The first line of a Full file, and of its save dialog. */
export type FullFileNotice = 'Contains individual pay'

/** A `.hcplan.json` workspace file (docs/PLAN.md 5.5). */
export interface WorkspaceFile {
  format: 'hcplan'
  version: 1
  kind: WorkspaceKind
  /** Full files only, written first so the file's first line says it (an addition to PLAN.md 5.5). */
  notice?: FullFileNotice
  /**
   * The mode line of a file made in Manager mode (D-MODELINE, review CP-2): "Made in Manager mode for
   * Aditya Joshi's team. No amounts are included." on a manager's own Shareable and Requests files
   * and on every Export for a manager file, written first. Only that line, for a file whose mode is
   * 'manager', reads back (validate.ts `managerModeLine`); an addition to PLAN.md 5.5.
   */
  modeLine?: string
  savedAt: ISODateTime
  app: 'Headcount Planner'
  /** The mode it was made in ('manager' for Export for a manager). */
  mode: Mode
  scopeLabel: string
  /**
   * The scope identity the file was made for (src/plan/workspace/shared.ts `scopeKeyOf`:
   * 'scope-sha256-<hex>' over the mode, the Acting as person, the unit and the scope's seats),
   * written beside `scopeLabel`. "Open a shared file" compares it, never the label; a file without
   * one shows no figures. An addition to PLAN.md 5.5 (review RM-3), frozen in the M3 freeze in place
   * of M2's `ScopedWorkspaceFile`.
   */
  scopeKey?: string
  /** Made while Acting as someone other than the mode's default. */
  actingAs: boolean
  /** 'sha256-<hex>' via src/lib/sha256.ts over the canonical JSON of `body`. */
  checksum: string
  body: WorkspaceBody
}

export interface WorkspaceBody {
  /** Full files only (every dataset); never in Shareable or Requests files. */
  datasets?: Partial<Datasets>
  plan: PlanStateSlice
  /** The workspace's locked versions by reference: an import whose hashes differ is refused. */
  lockedVersions: readonly LockedVersionRef[]
}
