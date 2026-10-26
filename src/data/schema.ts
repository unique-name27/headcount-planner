/**
 * Headcount Planner data model (docs/PLAN.md 5.1 and 5.2).
 *
 * Plan positions, not people. Eight datasets, each one Excel sheet: positions (effective-dated seats),
 * workers (one row per person per position), comp (effective-dated pay), reqs (the applicant tracking
 * system), requests (headcount requests and their steps), targets (Finance's heads and cost per org),
 * freezes and assumptions (long form). Dates are ISO strings: `YYYY-MM-DD` for dates and
 * `YYYY-MM-DDTHH:mm` for timestamps; months are `YYYY-MM`. Enumerated values are stored in the
 * canonical spellings defined below; importers normalize free text into them.
 *
 * Privacy posture:
 *  - no gender or other protected-class fields anywhere;
 *  - `pay: true` fields (one person's amount, and leave) show only to HR admin with "Show pay
 *    amounts" on; `leave: true` fields never show in Manager or Finance mode and show to HRBP and
 *    Leader only as one count of 5 or more; `cost: true` fields are group totals under the cost guard;
 *  - any people group smaller than MIN_GROUP is shown as "—" (hidden to protect anonymity).
 *
 * Frozen in M1: later builders fill bodies behind these names and never rename or retype them.
 * `Mode`, `MODES` and `isMode` live here so `plan/` and `cost/` can read them without `access/`
 * (docs/PLAN.md 4); `src/access/modes.ts` re-exports them and adds the per-mode tables.
 */

export type ISODate = string
export type ISODateTime = string
/** A calendar month, "2026-09". */
export type Month = `${number}-${string}`
/** A fiscal year, named by the calendar year it ends in: 'FY27' is 1 Apr 2026 to 31 Mar 2027 (src/data/fiscal.ts). */
export type FiscalYear = `FY${number}`

export const MIN_GROUP = 5

/* ───────────────────────── modes ───────────────────────── */

/** The five modes (docs/PLAN.md 8.1), in Mode menu order. */
export const MODES = ['manager', 'hrbp', 'leader', 'finance', 'hr-admin'] as const
export type Mode = (typeof MODES)[number]
export const isMode = (v: unknown): v is Mode =>
  typeof v === 'string' && (MODES as readonly string[]).includes(v)

/* ───────────────────────── vocabularies ───────────────────────── */

/**
 * Levels: P1 to P6 for individual contributors, M1 Manager, M2 Director, E1 to E3 executives. The
 * importer also reads IC4, L4, P4 and T4 as the fourth contributor level, and title words.
 */
export const LEVELS = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'M1', 'M2', 'E1', 'E2', 'E3'] as const
export type Level = (typeof LEVELS)[number]
export const LEVEL_LABELS: Record<Level, string> = {
  P1: 'P1 Entry',
  P2: 'P2 Developing',
  P3: 'P3 Career',
  P4: 'P4 Senior',
  P5: 'P5 Staff',
  P6: 'P6 Principal',
  M1: 'M1 Manager',
  M2: 'M2 Director',
  E1: 'E1 Vice president',
  E2: 'E2 Senior VP',
  E3: 'E3 Executive',
}
export type LevelTrack = 'Individual contributor' | 'Manager' | 'Executive'
export const levelTrack = (l: Level): LevelTrack =>
  l.startsWith('P') ? 'Individual contributor' : l.startsWith('M') ? 'Manager' : 'Executive'
/** Position on the ladder, P1 = 0 up to E3 = 10; -1 for a value that is not a level. */
export const levelIndex = (l: string): number => LEVELS.indexOf(l as Level)
/** "Director+": the lowest level whose seats are leader seats unless Lists or `leaderLevel` say otherwise. */
export const LEADER_MIN_LEVEL: Level = 'M2'
/** The level is Director (M2) or above. A seat's own `leaderLevel` and the Lists override this. */
export const isLeaderLevel = (l: Level): boolean => levelIndex(l) >= levelIndex(LEADER_MIN_LEVEL)

export const REGIONS = ['Americas', 'EMEA', 'APAC'] as const
export type Region = (typeof REGIONS)[number]

/**
 * Work sites. One legal entity per country. `zone` is the band table's zone key, the location
 * itself in Phase 1 (docs/PLAN.md 5.2); `zoneFactor` is the site's pay zone against San Jose, which
 * the sample's bands are built from (docs/PLAN.md 13.2: Munich 0.61 makes P4 Munich €110,000).
 * `jurisdiction` ids: us-ca, de, in, ...
 */
export interface Site {
  location: string
  country: string
  jurisdiction: string
  region: Region
  currency: string
  legalEntity: string
  zone: string
  zoneFactor: number
}

const US = 'Northgate Semiconductor Inc.'
export const SITES: Site[] = [
  {
    location: 'San Jose',
    country: 'United States',
    jurisdiction: 'us-ca',
    region: 'Americas',
    currency: 'USD',
    legalEntity: US,
    zone: 'San Jose',
    zoneFactor: 1,
  },
  {
    location: 'Austin',
    country: 'United States',
    jurisdiction: 'us-tx',
    region: 'Americas',
    currency: 'USD',
    legalEntity: US,
    zone: 'Austin',
    zoneFactor: 0.9,
  },
  {
    location: 'Raleigh',
    country: 'United States',
    jurisdiction: 'us-nc',
    region: 'Americas',
    currency: 'USD',
    legalEntity: US,
    zone: 'Raleigh',
    zoneFactor: 0.88,
  },
  {
    location: 'Boulder',
    country: 'United States',
    jurisdiction: 'us-co',
    region: 'Americas',
    currency: 'USD',
    legalEntity: US,
    zone: 'Boulder',
    zoneFactor: 0.9,
  },
  {
    location: 'Seattle',
    country: 'United States',
    jurisdiction: 'us-wa',
    region: 'Americas',
    currency: 'USD',
    legalEntity: US,
    zone: 'Seattle',
    zoneFactor: 0.97,
  },
  {
    location: 'Toronto',
    country: 'Canada',
    jurisdiction: 'ca',
    region: 'Americas',
    currency: 'CAD',
    legalEntity: 'Northgate Semiconductor Canada Ltd.',
    zone: 'Toronto',
    zoneFactor: 0.72,
  },
  {
    location: 'Vancouver',
    country: 'Canada',
    jurisdiction: 'ca',
    region: 'Americas',
    currency: 'CAD',
    legalEntity: 'Northgate Semiconductor Canada Ltd.',
    zone: 'Vancouver',
    zoneFactor: 0.72,
  },
  {
    location: 'Munich',
    country: 'Germany',
    jurisdiction: 'de',
    region: 'EMEA',
    currency: 'EUR',
    legalEntity: 'Northgate Semiconductor GmbH',
    zone: 'Munich',
    zoneFactor: 0.61,
  },
  {
    location: 'Haifa',
    country: 'Israel',
    jurisdiction: 'il',
    region: 'EMEA',
    currency: 'ILS',
    legalEntity: 'Northgate Semiconductor Israel Ltd.',
    zone: 'Haifa',
    zoneFactor: 0.7,
  },
  {
    location: 'Bengaluru',
    country: 'India',
    jurisdiction: 'in',
    region: 'APAC',
    currency: 'INR',
    legalEntity: 'Northgate Semiconductor India Pvt. Ltd.',
    zone: 'Bengaluru',
    zoneFactor: 0.26,
  },
  {
    location: 'Hsinchu',
    country: 'Taiwan',
    jurisdiction: 'tw',
    region: 'APAC',
    currency: 'TWD',
    legalEntity: 'Northgate Semiconductor Taiwan Co., Ltd.',
    zone: 'Hsinchu',
    zoneFactor: 0.42,
  },
  {
    location: 'Shanghai',
    country: 'China',
    jurisdiction: 'cn',
    region: 'APAC',
    currency: 'CNY',
    legalEntity: 'Northgate Semiconductor (Shanghai) Co., Ltd.',
    zone: 'Shanghai',
    zoneFactor: 0.38,
  },
  {
    location: 'Ho Chi Minh City',
    country: 'Vietnam',
    jurisdiction: 'vn',
    region: 'APAC',
    currency: 'VND',
    legalEntity: 'Northgate Semiconductor Vietnam Co., Ltd.',
    zone: 'Ho Chi Minh City',
    zoneFactor: 0.2,
  },
]
export const siteByLocation = new Map(SITES.map((s) => [s.location, s]))

/** Seat and imported status. Planned, On hold and Eliminated are read from the import; Filled and Open come from assignments. */
export const POSITION_STATUSES = ['Filled', 'Open', 'Planned', 'On hold', 'Eliminated'] as const
export type PositionStatus = (typeof POSITION_STATUSES)[number]

/** Why a seat ended (`positions.endReason`). */
export const END_REASONS = ['Eliminated', 'Traded', 'Transferred'] as const
export type EndReason = (typeof END_REASONS)[number]

/** Heads: an Employee counts 1 (on leave too); contractors and interns count 0 and are not costed. */
export const WORKER_TYPES = ['Employee', 'Contractor', 'Intern'] as const
export type WorkerType = (typeof WORKER_TYPES)[number]

/* recruiting */
export const REQ_STATUSES = ['Open', 'On hold', 'Filled', 'Cancelled'] as const
export type ReqStatus = (typeof REQ_STATUSES)[number]
/** The tracker after approval. An accepted offer shows its date only. */
export const REQ_STAGES = ['Req opened', 'Interviewing', 'Offer accepted', 'Started'] as const
export type ReqStage = (typeof REQ_STAGES)[number]
export const REQ_TYPES = ['New', 'Backfill'] as const
export type ReqType = (typeof REQ_TYPES)[number]

/* requests (docs/PLAN.md 10 and 11) */

/** Trade, Start recruiting and Start date are additions to the spec's six (docs/PLAN.md 15.1 R5, 11). */
export const REQUEST_TYPES = [
  'New role',
  'Backfill',
  'Level change',
  'Location change',
  'Transfer',
  'Elimination',
  'Trade',
  'Start recruiting',
  'Start date',
] as const
export type RequestType = (typeof REQUEST_TYPES)[number]

export const REQUEST_STATES = [
  'Draft',
  'Submitted',
  'In review',
  'Sent back',
  'Approved',
  'Approved with changes',
  'Rejected',
  'Withdrawn',
  'Expired',
] as const
export type RequestState = (typeof REQUEST_STATES)[number]
/** Waiting on a decision: these count in asks and the gap by their head effect (docs/PLAN.md 6.9). */
export const PENDING_REQUEST_STATES: readonly RequestState[] = ['Submitted', 'In review', 'Sent back']
/** Decided yes: applied to Working. */
export const APPROVED_REQUEST_STATES: readonly RequestState[] = ['Approved', 'Approved with changes']

export const REASON_CODES = [
  'Growth',
  'New capability',
  'Attrition backfill',
  'Restructure',
  'Cost reduction',
  'Cost-neutral mix',
  'Level mix',
  'Location strategy',
  'Freeze exception',
  'Below the cut line',
  'Other',
] as const
export type ReasonCode = (typeof REASON_CODES)[number]

/** Every type but Trade: the full list less the trade-only "Cost-neutral mix" and the system's "Below the cut line". */
const GENERAL_REASONS: readonly ReasonCode[] = REASON_CODES.filter(
  (r) => r !== 'Cost-neutral mix' && r !== 'Below the cut line',
)

/**
 * The reason codes Requests > New offers for each type. "Below the cut line" is set only by the
 * system at cycle lock (docs/PLAN.md 15.1 R7) and is never offered. Import accepts any REASON_CODES
 * value and flags one outside its type's list as a quality warning, not a refusal.
 */
export const REASON_CODES_OF: Record<RequestType, readonly ReasonCode[]> = {
  'New role': GENERAL_REASONS,
  Backfill: GENERAL_REASONS,
  'Level change': GENERAL_REASONS,
  'Location change': GENERAL_REASONS,
  Transfer: GENERAL_REASONS,
  Elimination: GENERAL_REASONS,
  Trade: ['Cost-neutral mix', 'Location strategy', 'Level mix', 'Other'],
  'Start recruiting': GENERAL_REASONS,
  'Start date': GENERAL_REASONS,
}

/** A transfer's kind (docs/PLAN.md 10.5), as files spell it. */
export const TRANSFER_KINDS = ['Position move', 'Internal move'] as const
export type TransferKind = (typeof TRANSFER_KINDS)[number]
/** The engine's code for each kind (`TransferFields.kind` in src/plan/types.ts). */
export const TRANSFER_KIND_CODE: Record<TransferKind, 'position' | 'internal'> = {
  'Position move': 'position',
  'Internal move': 'internal',
}

/**
 * One approval step as the `requests.steps` field holds it. In files the steps are compact text,
 * steps separated by "; ", each "<role> <approver employee ID> <decision>[ <date>]":
 * "Manager E10234 Approved 2026-08-03; HRBP E10077 Pending".
 */
export const STEP_ROLES = ['Manager', 'HRBP', 'Leader', 'Finance'] as const
export type StepRole = (typeof STEP_ROLES)[number]
export const STEP_DECISIONS = [
  'Pending',
  'Approved',
  'Approved with changes',
  'Sent back',
  'Rejected',
] as const
export type StepDecision = (typeof STEP_DECISIONS)[number]
export interface StepRow {
  role: StepRole
  approverId: string
  decision: StepDecision
  /** The decision's date; null while Pending. */
  at: ISODate | null
}

/** The planning cycle's stages, in order (docs/PLAN.md 10.3). */
export const CYCLE_STAGES = [
  'Open for asks',
  'HRBP review',
  'Leader review',
  'Finance review',
  'Locked',
] as const
export type CycleStage = (typeof CYCLE_STAGES)[number]

/** How a month's active fraction is worked out; a property of each version (docs/PLAN.md 6.2). */
export const PRORATIONS = ['daily', 'half-month', 'full-month'] as const
export type Proration = (typeof PRORATIONS)[number]

/** FX rate sets: plan rates for plan lines, actual for closed months, forecast for open months. */
export const FX_SETS = ['plan', 'actual', 'forecast'] as const
export type FxSet = (typeof FX_SETS)[number]

/* ───────────────────────── assumptions ───────────────────────── */

/** The assumption tables (docs/PLAN.md 5.2). Values fall back from org to unit to company. */
export const ASSUMPTION_TABLES = [
  'band',
  'bonusTarget',
  'bonusFunding',
  'equity',
  'burden',
  'burdenCap',
  'benefits',
  'severance',
  'merit',
  'promotionPool',
  'fx',
  'timeToFill',
  'fillRate',
  'attrition',
  'backfillRate',
  'backfillLag',
  'vacancyFactor',
  'glAccount',
  'trade',
] as const
export type AssumptionTable = (typeof ASSUMPTION_TABLES)[number]

/** A dimension of an assumption key. `part` names one of a table's parts (merit's date, pct or cutoff). */
export type AssumptionDim =
  | 'level'
  | 'zone'
  | 'fiscalYear'
  | 'country'
  | 'component'
  | 'currency'
  | 'set'
  | 'month'
  | 'location'
  | 'dimension'
  | 'part'

/**
 * The unit of an assumption value: an amount in the key's local currency, USD, a fraction
 * (0.035 = 3.5%), months, days, a date written as the number YYYYMMDD, USD per 1 unit of local
 * currency, an account code, an FTE, or a flag (1 yes, 0 no).
 */
export type AssumptionUnit =
  | 'local'
  | 'usd'
  | 'fraction'
  | 'months'
  | 'days'
  | 'yyyymmdd'
  | 'usdPerLocal'
  | 'code'
  | 'fte'
  | 'flag'

/** One part of a table whose key names a part: its own unit and any dimensions after the part name. */
export interface AssumptionPart {
  label: string
  unit: AssumptionUnit
  /** Dimensions written after the part name ('partTime|Bengaluru'). */
  dims: readonly AssumptionDim[]
}

export interface AssumptionTableDef {
  table: AssumptionTable
  label: string
  /**
   * The key's dimensions in order, pipe-joined in `key` ('P4|Munich|FY27'). Empty: the table is
   * keyed by org alone and every row's `key` is ASSUMPTION_ANY_KEY. A dimension written as
   * ASSUMPTION_ANY_KEY matches every value ('partTime|*').
   */
  dims: readonly AssumptionDim[]
  /** The unit of `value`; 'by part' when each part has its own (`parts`). */
  unit: AssumptionUnit | 'by part'
  /** For a key with a `part` dimension: every allowed part name, with its unit and extra dimensions. */
  parts?: Readonly<Record<string, AssumptionPart>>
  /**
   * Set by import and read only outside HR admin, with "Set by import." (docs/PLAN.md 7.4): a cap,
   * cutoff or pay-percentage sweep would read single salaries out of exact totals.
   */
  hrAdminOnly: boolean
  /**
   * The modes that may edit the table in the app. HR admin edits every table. HRBP edits only its
   * own unit's rows, in Working (docs/PLAN.md 15.1 R18). Finance's edits pass 7.4's edit rule.
   */
  editors: readonly Mode[]
  note: string
}

/** The key of a table keyed by org alone, and the wildcard for one dimension of a key. */
export const ASSUMPTION_ANY_KEY = '*'
/** Joins the dimensions of an assumption key. */
export const ASSUMPTION_KEY_SEP = '|'
/** An assumption key from its parts: assumptionKey(['P4', 'Munich', 'FY27']) is 'P4|Munich|FY27'. */
export const assumptionKey = (parts: readonly (string | number)[]): string =>
  parts.length ? parts.map(String).join(ASSUMPTION_KEY_SEP) : ASSUMPTION_ANY_KEY
/** The parts of an assumption key ('EUR|plan|2026-09' gives ['EUR', 'plan', '2026-09']). */
export const splitAssumptionKey = (key: string): string[] =>
  key.split(ASSUMPTION_KEY_SEP).map((s) => s.trim())

const FINANCE: readonly Mode[] = ['hr-admin', 'finance']
const HR_ADMIN: readonly Mode[] = ['hr-admin']
const DRIVERS: readonly Mode[] = ['hr-admin', 'finance', 'hrbp']

/** Each table's key dimensions, unit and editors (docs/PLAN.md 5.2 and 7.4). */
export const ASSUMPTION_KEYS: Record<AssumptionTable, AssumptionTableDef> = {
  band: {
    table: 'band',
    label: 'Band midpoints',
    dims: ['level', 'zone', 'fiscalYear'],
    unit: 'local',
    hrAdminOnly: false,
    editors: FINANCE,
    note: 'Midpoint at 1.0 FTE in the zone’s local currency. The zone is the location in Phase 1; FY28 is FY27 × (1 + band increase).',
  },
  bonusTarget: {
    table: 'bonusTarget',
    label: 'Target bonus',
    dims: ['level'],
    unit: 'fraction',
    hrAdminOnly: true,
    editors: HR_ADMIN,
    note: 'Target bonus as a share of base. A comp row’s own target bonus overrides it for that person.',
  },
  bonusFunding: {
    table: 'bonusFunding',
    label: 'Bonus funding',
    dims: ['fiscalYear'],
    unit: 'fraction',
    hrAdminOnly: true,
    editors: HR_ADMIN,
    note: 'Share of target bonus funded in the year (1 is 100%).',
  },
  equity: {
    table: 'equity',
    label: 'Equity',
    dims: ['level'],
    unit: 'usd',
    hrAdminOnly: false,
    editors: FINANCE,
    note: 'USD a year at 1.0 FTE. Used only in figures labeled "incl. SBC".',
  },
  burden: {
    table: 'burden',
    label: 'Burden rates',
    dims: ['country', 'component'],
    unit: 'fraction',
    hrAdminOnly: false,
    editors: FINANCE,
    note: 'Employer tax or social charge as a share of base + bonus, up to the component’s cap.',
  },
  burdenCap: {
    table: 'burdenCap',
    label: 'Burden caps',
    dims: ['country', 'component'],
    unit: 'local',
    hrAdminOnly: true,
    editors: HR_ADMIN,
    note: 'The most of base + bonus a burden component applies to, in local currency, not scaled by FTE. No row: uncapped.',
  },
  benefits: {
    table: 'benefits',
    label: 'Benefits',
    dims: ['country'],
    unit: 'local',
    hrAdminOnly: false,
    editors: FINANCE,
    note: 'Local amount a head a year, not scaled by FTE.',
  },
  severance: {
    table: 'severance',
    label: 'Severance',
    dims: ['country'],
    unit: 'months',
    hrAdminOnly: false,
    editors: FINANCE,
    note: 'Months of local base, booked once in the month of the day after an eliminated Filled seat’s last day.',
  },
  merit: {
    table: 'merit',
    label: 'Merit',
    dims: ['fiscalYear', 'part'],
    unit: 'by part',
    parts: {
      date: { label: 'Merit date', unit: 'yyyymmdd', dims: [] },
      pct: { label: 'Merit increase', unit: 'fraction', dims: [] },
      cutoff: { label: 'Hired by', unit: 'yyyymmdd', dims: [] },
    },
    hrAdminOnly: true,
    editors: HR_ADMIN,
    note: 'From the merit date, for anyone started by the cutoff, unless their latest comp row is on or after the merit date.',
  },
  promotionPool: {
    table: 'promotionPool',
    label: 'Promotion pool',
    dims: ['fiscalYear', 'part'],
    unit: 'by part',
    parts: {
      date: { label: 'From', unit: 'yyyymmdd', dims: [] },
      pct: { label: 'Uplift', unit: 'fraction', dims: [] },
    },
    hrAdminOnly: true,
    editors: HR_ADMIN,
    note: 'An uplift on Filled base from its date, by org.',
  },
  fx: {
    table: 'fx',
    label: 'FX rates',
    dims: ['currency', 'set', 'month'],
    unit: 'usdPerLocal',
    hrAdminOnly: false,
    editors: FINANCE,
    note: 'USD per 1 unit of local currency. Sets: plan, actual (closed months) and forecast (open months).',
  },
  timeToFill: {
    table: 'timeToFill',
    label: 'Time to fill',
    dims: ['level'],
    unit: 'days',
    hrAdminOnly: false,
    editors: DRIVERS,
    note: 'Days from opening to start, used by the forecast.',
  },
  fillRate: {
    table: 'fillRate',
    label: 'Fill rate',
    dims: [],
    unit: 'fraction',
    hrAdminOnly: false,
    editors: DRIVERS,
    note: 'Share of openings expected to start; the rest is "Unfilled at horizon".',
  },
  attrition: {
    table: 'attrition',
    label: 'Attrition',
    dims: [],
    unit: 'fraction',
    hrAdminOnly: false,
    editors: FINANCE,
    note: 'Annual attrition; the forecast takes 1 − (1 − annual)^(1/12) a month.',
  },
  backfillRate: {
    table: 'backfillRate',
    label: 'Backfill rate',
    dims: [],
    unit: 'fraction',
    hrAdminOnly: false,
    editors: DRIVERS,
    note: 'Share of modeled exits backfilled; 0 under a freeze.',
  },
  backfillLag: {
    table: 'backfillLag',
    label: 'Backfill lag',
    dims: [],
    unit: 'months',
    hrAdminOnly: false,
    editors: DRIVERS,
    note: 'Months from a modeled exit to its backfill.',
  },
  vacancyFactor: {
    table: 'vacancyFactor',
    label: 'Vacancy factor',
    dims: [],
    unit: 'fraction',
    hrAdminOnly: false,
    editors: FINANCE,
    note: 'Share of filled cost expected to go unspent; plan versions only.',
  },
  glAccount: {
    table: 'glAccount',
    label: 'GL accounts',
    dims: ['component'],
    unit: 'code',
    hrAdminOnly: false,
    editors: FINANCE,
    note: 'The account each cost component posts to, for the long CSV and the FP&A load file.',
  },
  trade: {
    table: 'trade',
    label: 'Trade rates',
    dims: ['part'],
    unit: 'by part',
    parts: {
      standardHeadUsd: { label: 'Standard head', unit: 'usd', dims: [] },
      minFte: { label: 'Smallest FTE', unit: 'fte', dims: [] },
      fteStep: { label: 'FTE step', unit: 'fte', dims: [] },
      partTime: { label: 'Part time allowed', unit: 'flag', dims: ['location'] },
      dimensions: { label: 'Tradable dimension', unit: 'flag', dims: ['dimension'] },
      creditLapse: { label: 'Credit lapses at year end', unit: 'flag', dims: [] },
    },
    hrAdminOnly: false,
    editors: FINANCE,
    note: 'The standard head, the smallest FTE, the FTE step and what a trade may change. Part time allowed is set per location (* for every location); a tradable dimension is level, location, fte or org.',
  },
}

/** Set by import and read only outside HR admin (docs/PLAN.md 7.4). */
export const isHrAdminOnly = (table: AssumptionTable): boolean => ASSUMPTION_KEYS[table].hrAdminOnly

/* ───────────────────────── record types ───────────────────────── */

/**
 * One effective-dated row of a seat. The latest row on or before a date describes the seat on that
 * date (src/plan/types.ts `Position` is a row resolved "as of" a date).
 */
export interface PositionRow {
  /** Stable, never reused. */
  positionId: string
  effectiveDate: ISODate
  /** As imported. Planned, On hold and Eliminated count from it; Filled and Open derive from assignments. */
  status: PositionStatus
  title?: string | null
  jobFamily?: string | null
  level: Level
  businessUnit: string
  department?: string | null
  costCenter: string
  location: string
  /** Blank reads the location's legal entity. */
  legalEntity?: string | null
  managerPositionId?: string | null
  /** Blank reads as Employee. */
  workerType?: WorkerType | null
  /** Share of a full-time schedule; blank is 1. */
  fte?: number | null
  /** Target or planned start, for Open and Planned seats. */
  startDate?: ISODate | null
  /** The date the seat last became Open; blank derives it (docs/PLAN.md 6.7 `openedOn`). */
  openedDate?: ISODate | null
  reqType?: ReqType | null
  /** Overrides the level rule for leader seats; blank: Director (M2) or above. */
  leaderLevel?: boolean | null
  /** For Eliminated: the seat's last day, inclusive; the Eliminated row starts the day after. */
  endDate?: ISODate | null
  endReason?: EndReason | null
  /** The request that created or changed this row. */
  sourceRequestId?: string | null
}

/** One assignment: a person in a position from start to last day (inclusive). */
export interface WorkerRow {
  employeeId: string
  name?: string | null
  /** Blank: the person holds no position (not in plan). */
  positionId?: string | null
  /** Blank is the hire date. */
  assignmentStart?: ISODate | null
  /** Last day in the position, inclusive. */
  assignmentEnd?: ISODate | null
  hireDate: ISODate
  /** Last day of employment, inclusive; known future exits are filled in. */
  terminationDate?: ISODate | null
  workerType: WorkerType
  fte?: number | null
  level?: Level | null
  businessUnit?: string | null
  department?: string | null
  costCenter?: string | null
  location?: string | null
  legalEntity?: string | null
  managerId?: string | null
  /** Leave (pay and leave field): on a leave of absence on the extract date. */
  onLeave?: boolean | null
  /** Leave (pay and leave field): blank is paid. Unpaid leave zeroes pay lines, never who is costed. */
  leavePaid?: boolean | null
}

/** One effective-dated pay row. */
export interface CompRow {
  employeeId: string
  effectiveDate: ISODate
  /** ISO code; blank takes the location's currency. */
  currency?: string | null
  /** Annual base at 1.0 FTE in local currency (the full-time rate); cost multiplies it by FTE. */
  baseSalary: number
  /** Overrides the level's target bonus (a fraction, 0.1 = 10%). */
  targetBonusPct?: number | null
}

/** One requisition from the applicant tracking system. */
export interface ReqRow {
  reqId: string
  positionId?: string | null
  status: ReqStatus
  stage?: ReqStage | null
  reqType?: ReqType | null
  openedDate: ISODate
  targetStartDate?: ISODate | null
  /** Date only; no candidate detail. */
  offerAcceptedDate?: ISODate | null
  /** The agreed first day of an accepted offer; the offer is costed from it. */
  startDate?: ISODate | null
  closedDate?: ISODate | null
  hiringManagerId?: string | null
  recruiter?: string | null
  /** Annual base at 1.0 FTE (the full-time rate, like baseSalary), in the offer currency. */
  offerBase?: number | null
  offerCurrency?: string | null
  signOnBonus?: number | null
  relocation?: number | null
  agencyFee?: number | null
}

/**
 * One headcount request. Trade fields (docs/PLAN.md 11.4) and transfer fields (10.5) are blank on
 * other types. `src/plan/engine/requests.ts` turns rows into `HcRequest`s.
 */
export interface RequestRow {
  requestId: string
  type: RequestType
  state: RequestState
  reasonCode: ReasonCode
  requesterId: string
  submittedById?: string | null
  submittedAt?: ISODateTime | null
  updatedAt?: ISODateTime | null
  positionId?: string | null
  businessUnit: string
  department?: string | null
  costCenter?: string | null
  /** The position a new seat reports to; for a trade, the get seats' org. */
  managerPositionId?: string | null
  level?: Level | null
  location?: string | null
  jobTitle?: string | null
  fte?: number | null
  /** Proposed start, or the date a change takes effect. */
  startDate?: ISODate | null
  /** Rank among the requester's asks in a cycle; 1 is first. */
  priority?: number | null
  cycleId?: string | null
  steps?: StepRow[] | null
  confidential?: boolean | null
  /** Raised against a hiring freeze. */
  exception?: boolean | null
  /* trade (docs/PLAN.md 11.4) */
  /** The seats given, ";"-separated position IDs as files write them (`splitIds` reads them). */
  givePositionIds?: string | null
  /** The giving org, stored at submit and never derived again (docs/PLAN.md 11.2). */
  giveOrgPositionId?: string | null
  creditUsedBp?: number | null
  /** Whole seats received. */
  count?: number | null
  jobFamily?: string | null
  partTimeRest?: boolean | null
  /**
   * The part-time rest seat's FTE as the quote at submit found it (re-stored at each approval);
   * blank when the trade has none.
   */
  restFte?: number | null
  rateVersion?: string | null
  rateHash?: string | null
  giveBp?: number | null
  getBp?: number | null
  creditBp?: number | null
  /* transfer (docs/PLAN.md 10.5) */
  transferKind?: TransferKind | null
  /** The person who moves. */
  personId?: string | null
  fromPositionId?: string | null
  toManagerPositionId?: string | null
  toPositionId?: string | null
  effectiveDate?: ISODate | null
  moveBudget?: boolean | null
}

/** Finance's heads and loaded cost for an org and fiscal year. */
export interface TargetRow {
  fiscalYear: FiscalYear
  /** Blank is the fiscal year's last day. */
  targetDate?: ISODate | null
  businessUnit: string
  department?: string | null
  costCenter?: string | null
  leaderPositionId?: string | null
  targetHeads: number
  /** The fiscal year's loaded cost in USD (the sum of its months), not a year-end run rate. */
  targetCost?: number | null
}

/** A hiring freeze on an org from a date. */
export interface FreezeRow {
  freezeId: string
  businessUnit: string
  department?: string | null
  costCenter?: string | null
  leaderPositionId?: string | null
  startDate: ISODate
  /** Last frozen day; blank is open-ended. */
  endDate?: ISODate | null
  /** Blank is No. */
  allowBackfill?: boolean | null
  reason?: string | null
}

/** One assumption value, long form: a table, an org (blank is the company) and a pipe-joined key. */
export interface AssumptionRow {
  /** The version the value is for, by ID or name (fy27-working, FY27 Working). */
  version: string
  table: AssumptionTable
  /** Blank is the company; a unit or department overrides it. */
  org?: string | null
  key: string
  value: number
}

/** ";"-separated IDs as files write them (`requests.givePositionIds`), trimmed, blanks dropped. */
export const splitIds = (v: string | null | undefined): string[] =>
  (v ?? '')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)

export interface Datasets {
  positions: PositionRow[]
  workers: WorkerRow[]
  comp: CompRow[]
  reqs: ReqRow[]
  requests: RequestRow[]
  targets: TargetRow[]
  freezes: FreezeRow[]
  assumptions: AssumptionRow[]
}
export type DatasetKey = keyof Datasets
export const DATASET_KEYS: DatasetKey[] = [
  'positions',
  'workers',
  'comp',
  'reqs',
  'requests',
  'targets',
  'freezes',
  'assumptions',
]

/**
 * The app runs without these and says what is missing. Positions, workers, comp and assumptions are
 * required.
 */
export const OPTIONAL_DATASETS: readonly DatasetKey[] = ['reqs', 'requests', 'targets', 'freezes']

/** Every dataset with no rows. */
export function emptyDatasets(): Datasets {
  return Object.fromEntries(DATASET_KEYS.map((k) => [k, []])) as unknown as Datasets
}

/**
 * The datasets with every key present: rows loaded before a dataset existed (or a partial test
 * fixture) get an empty list for it, so engines never meet `undefined`.
 */
export function withAllDatasets(data: Partial<Datasets>): Datasets {
  if (DATASET_KEYS.every((k) => Array.isArray(data[k]))) return data as Datasets
  const out = { ...data } as Record<DatasetKey, unknown[]>
  for (const k of DATASET_KEYS) if (!Array.isArray(out[k])) out[k] = []
  return out as unknown as Datasets
}

/* ───────────────────────── views and pages ───────────────────────── */

export type ViewKey = 'home' | 'team' | 'plan' | 'requests' | 'forecast' | 'targets' | 'whatif' | 'finance'

/** Folder-tab labels, in folder-tab order (docs/PLAN.md 9.1). */
export const VIEW_LABEL: Record<ViewKey, string> = {
  home: 'Home',
  team: 'My team',
  plan: 'Plan',
  requests: 'Requests',
  forecast: 'Forecast',
  targets: 'Targets',
  whatif: 'What if',
  finance: 'Finance',
}
export const VIEW_KEYS = Object.keys(VIEW_LABEL) as ViewKey[]
export const isViewKey = (v: unknown): v is ViewKey =>
  typeof v === 'string' && (VIEW_KEYS as readonly string[]).includes(v)

/** Masthead pages, not folder tabs. */
export type PageKey = 'data' | 'actions' | 'audit'
export const PAGE_LABEL: Record<PageKey, string> = {
  data: 'Data room',
  actions: 'Action center',
  audit: 'Audit',
}
export const PAGE_KEYS = Object.keys(PAGE_LABEL) as PageKey[]
export const isPageKey = (v: unknown): v is PageKey =>
  typeof v === 'string' && (PAGE_KEYS as readonly string[]).includes(v)

/** Anything the address can open: a view or a page. */
export type RouteView = ViewKey | PageKey
export const isRouteView = (v: unknown): v is RouteView => isViewKey(v) || isPageKey(v)

/* ───────────────────────── field definitions (import, templates, exports) ───────────────────────── */

export type FieldType =
  | 'string'
  | 'id'
  | 'date'
  | 'datetime'
  | 'number'
  | 'percent'
  | 'money'
  | 'boolean'
  | 'enum'
  | 'level'
  /** Approval steps in compact text, read into `StepRow[]` (`requests.steps`). */
  | 'steps'

export interface FieldDef {
  key: string
  label: string
  type: FieldType
  required?: boolean
  /** Unlocks analyses; shown amber when missing. */
  recommended?: boolean
  /** Header aliases (normalized: lowercase, punctuation to spaces). Vendor headers live in import/synonyms.ts. */
  synonyms: string[]
  /** Allowed canonical values for enum fields. */
  values?: readonly string[]
  description: string
  /** One person's amount (or leave): hidden from screens and exports unless HR admin shows pay amounts. */
  pay?: boolean
  /** Leave: shown only as one count of 5 or more to HRBP and Leader, never in Manager or Finance mode. */
  leave?: true
  /** A group total under the cost guard. */
  cost?: true
}

export interface DatasetDef {
  key: DatasetKey
  label: string
  /** Sheet name used in templates and multi-sheet workbooks. */
  sheet: string
  description: string
  /** Views that read this dataset (docs/PLAN.md 9.1). */
  usedBy: ViewKey[]
  /** Fields that identify a row, for de-duplication. */
  rowKey: string[]
  /**
   * Rows with the same row key are one line whose `sum` field adds up, instead of duplicates where
   * one row is kept.
   */
  mergeDuplicates?: { sum: string }
  /** At least one of these fields must be filled for a row to import. */
  requireOneOf?: string[]
  fields: FieldDef[]
}

const f = (
  key: string,
  label: string,
  type: FieldType,
  synonyms: string[],
  description: string,
  extra: Partial<FieldDef> = {},
): FieldDef => ({ key, label, type, synonyms, description, ...extra })

export const DATASETS: DatasetDef[] = [
  {
    key: 'positions',
    label: 'Positions',
    sheet: 'Positions',
    description:
      'Every seat in the plan, one row per position and effective date: Filled, Open, Planned, On hold or Eliminated. Eliminated seats are kept and position IDs are never reused.',
    usedBy: ['home', 'team', 'plan', 'requests', 'forecast', 'targets', 'whatif', 'finance'],
    rowKey: ['positionId', 'effectiveDate'],
    fields: [
      f(
        'positionId',
        'Position ID',
        'id',
        ['position id', 'position number', 'position', 'pos id', 'seat id', 'position code'],
        'Stable seat identifier, never reused.',
        { required: true },
      ),
      f(
        'effectiveDate',
        'Effective date',
        'date',
        ['effective date', 'effective from', 'as of date', 'change date', 'row effective date'],
        'Date this row takes effect. The latest row on or before a date describes the seat on that date.',
        { required: true },
      ),
      f(
        'status',
        'Status',
        'enum',
        ['status', 'position status', 'seat status'],
        'Filled, Open, Planned, On hold or Eliminated, as imported. Planned, On hold and Eliminated are read from it; Filled and Open come from assignments, and reconciliation compares the two.',
        { required: true, values: POSITION_STATUSES },
      ),
      f(
        'title',
        'Title',
        'string',
        ['title', 'position title', 'job title', 'business title'],
        'Position title.',
        { recommended: true },
      ),
      f(
        'jobFamily',
        'Job family',
        'string',
        ['job family', 'family', 'job family group'],
        'Broad group of related jobs.',
      ),
      f(
        'level',
        'Level',
        'level',
        ['level', 'grade', 'job level', 'career level'],
        'Level of the seat, normalized to P1 to P6, M1, M2 and E1 to E3.',
        { required: true },
      ),
      f(
        'businessUnit',
        'Business unit',
        'string',
        ['business unit', 'bu', 'business group', 'division'],
        'Top-level organization.',
        { required: true },
      ),
      f(
        'department',
        'Department',
        'string',
        ['department', 'dept', 'supervisory organization', 'org unit'],
        'Department within the business unit.',
        { recommended: true },
      ),
      f(
        'costCenter',
        'Cost center',
        'string',
        ['cost center', 'cost centre', 'cc', 'cost center code'],
        'Cost center code: the department code and the site code, such as 1130-BLR.',
        { required: true },
      ),
      f(
        'location',
        'Location',
        'string',
        ['location', 'site', 'work location', 'office'],
        'Work site of the seat.',
        { required: true },
      ),
      f(
        'legalEntity',
        'Legal entity',
        'string',
        ['legal entity', 'company', 'employing entity', 'entity'],
        'Employing legal entity; blank reads it from the location.',
      ),
      f(
        'managerPositionId',
        'Manager position ID',
        'id',
        [
          'manager position id',
          'manager position',
          'reports to position',
          'supervisor position',
          'parent position',
        ],
        'The position this seat reports to. Trees and the leader filter follow it.',
        { recommended: true },
      ),
      f(
        'workerType',
        'Worker type',
        'enum',
        ['worker type', 'employee type', 'position type', 'worker category'],
        'Employee, Contractor or Intern seat; blank reads as Employee. Only Employee seats count as heads.',
        { values: WORKER_TYPES },
      ),
      f(
        'fte',
        'FTE',
        'number',
        ['fte', 'scheduled fte', 'position fte', 'full time equivalent'],
        'Share of a full-time schedule: 1 full time, 0.5 half. Blank is 1.',
      ),
      f(
        'startDate',
        'Target start',
        'date',
        ['target start', 'planned start', 'start date', 'target start date', 'need by date'],
        'For Open and Planned seats: the target or planned first day of whoever fills the seat.',
        { recommended: true },
      ),
      f(
        'openedDate',
        'Opened date',
        'date',
        ['opened date', 'date opened', 'position opened', 'availability date'],
        'The date the seat last became Open. Blank works it out from reqs and exits.',
      ),
      f(
        'reqType',
        'Req type',
        'enum',
        ['req type', 'new or backfill', 'reason for hire', 'origin'],
        'New or Backfill.',
        { values: REQ_TYPES },
      ),
      f(
        'leaderLevel',
        'Leader seat',
        'boolean',
        ['leader seat', 'leader level', 'is leader', 'leader'],
        'Marks a leader seat, or not. Blank: a leader seat when the level is Director (M2) or above.',
      ),
      f(
        'endDate',
        'End date',
        'date',
        ['end date', 'position end date', 'elimination date', 'last day of seat'],
        'For an Eliminated seat: its last day, inclusive. The Eliminated row starts the day after.',
      ),
      f(
        'endReason',
        'End reason',
        'enum',
        ['end reason', 'elimination reason', 'close reason'],
        'Why the seat ended: Eliminated, Traded or Transferred.',
        { values: END_REASONS },
      ),
      f(
        'sourceRequestId',
        'Source request ID',
        'id',
        ['source request id', 'source request', 'request id', 'created by request'],
        'The request that created or changed this row.',
      ),
    ],
  },
  {
    key: 'workers',
    label: 'Workers',
    sheet: 'Workers',
    description:
      'HRIS workers and their assignments: one row per person per position, from the first day to the last day in it.',
    usedBy: ['home', 'team', 'plan', 'forecast', 'finance'],
    rowKey: ['employeeId', 'positionId', 'assignmentStart'],
    fields: [
      f(
        'employeeId',
        'Employee ID',
        'id',
        ['employee id', 'worker id', 'emp id', 'person id', 'employee number'],
        'Unique worker identifier.',
        { required: true },
      ),
      f(
        'name',
        'Name',
        'string',
        ['name', 'full name', 'employee name', 'display name', 'worker'],
        'Display name.',
        { recommended: true },
      ),
      f(
        'positionId',
        'Position ID',
        'id',
        ['position id', 'position number', 'position', 'seat id'],
        'The seat held. Blank means the person is not in the plan.',
        { recommended: true },
      ),
      f(
        'assignmentStart',
        'Assignment start',
        'date',
        ['assignment start', 'assignment start date', 'position start date', 'start date in position'],
        'First day in the position; blank is the hire date.',
      ),
      f(
        'assignmentEnd',
        'Assignment end',
        'date',
        ['assignment end', 'assignment end date', 'position end date', 'end date in position'],
        'Last day in the position, inclusive; blank while the assignment lasts.',
      ),
      f(
        'hireDate',
        'Hire date',
        'date',
        ['hire date', 'start date', 'original hire date', 'date of joining', 'date hired'],
        'First day of employment.',
        { required: true },
      ),
      f(
        'terminationDate',
        'Last day',
        'date',
        ['termination date', 'last day', 'exit date', 'separation date', 'end date'],
        'Last day of employment, inclusive. Known future exits are filled in too.',
      ),
      f(
        'workerType',
        'Worker type',
        'enum',
        ['worker type', 'employment type', 'employee type', 'worker category'],
        'Employee, Contractor or Intern. An employee counts 1 head; contractors and interns count 0 and are not costed.',
        { required: true, values: WORKER_TYPES },
      ),
      f(
        'fte',
        'FTE',
        'number',
        ['fte', 'full time equivalent', 'scheduled fte', 'work percentage'],
        'Share of a full-time schedule: 1 full time, 0.5 half. Blank is 1.',
      ),
      f('level', 'Level', 'level', ['level', 'grade', 'job level', 'career level'], 'HRIS level.'),
      f(
        'businessUnit',
        'Business unit',
        'string',
        ['business unit', 'bu', 'business group', 'division'],
        'HRIS business unit.',
      ),
      f(
        'department',
        'Department',
        'string',
        ['department', 'dept', 'supervisory organization', 'org unit'],
        'HRIS department.',
      ),
      f(
        'costCenter',
        'Cost center',
        'string',
        ['cost center', 'cost centre', 'cc', 'cost center code'],
        'HRIS cost center. One that differs from the position’s is a reconciliation exception.',
        { recommended: true },
      ),
      f('location', 'Location', 'string', ['location', 'site', 'work location', 'office'], 'Work site.', {
        recommended: true,
      }),
      f(
        'legalEntity',
        'Legal entity',
        'string',
        ['legal entity', 'company', 'employing entity', 'entity'],
        'Employing legal entity.',
      ),
      f(
        'managerId',
        'Manager ID',
        'id',
        ['manager id', 'manager employee id', 'supervisor id', 'reports to', 'manager'],
        'Employee ID of the direct manager in the HRIS.',
      ),
      f(
        'onLeave',
        'On leave',
        'boolean',
        ['on leave', 'leave status', 'loa', 'leave of absence'],
        'On a leave of absence on the extract date. Shown only as one count of 5 or more, never in Manager or Finance mode.',
        { pay: true, leave: true },
      ),
      f(
        'leavePaid',
        'Leave paid',
        'boolean',
        ['leave paid', 'paid leave', 'loa paid', 'paid loa'],
        'Whether the leave is paid; blank is Yes. Unpaid leave sets pay to 0 for its months, and the person stays costed.',
        { pay: true, leave: true },
      ),
    ],
  },
  {
    key: 'comp',
    label: 'Compensation',
    sheet: 'Compensation',
    description:
      'Pay rows by employee and effective date. Base is the full-time rate; cost multiplies it by FTE.',
    usedBy: ['home', 'plan', 'forecast', 'finance'],
    rowKey: ['employeeId', 'effectiveDate'],
    fields: [
      f(
        'employeeId',
        'Employee ID',
        'id',
        ['employee id', 'worker id', 'emp id', 'person id', 'employee number'],
        'The paid employee.',
        { required: true },
      ),
      f(
        'effectiveDate',
        'Effective date',
        'date',
        ['effective date', 'pay effective date', 'compensation effective date', 'change date'],
        'Date this pay took effect. The merit rule reads the latest row.',
        { required: true },
      ),
      f(
        'currency',
        'Currency',
        'string',
        ['currency', 'pay currency', 'local currency', 'currency code'],
        'ISO code of the pay; blank takes the location’s currency.',
      ),
      f(
        'baseSalary',
        'Base salary (FTE rate)',
        'money',
        ['base salary', 'annual base', 'base pay', 'fte salary', 'annual rate', 'salary'],
        'Annual base at 1.0 FTE in local currency: the full-time rate, not part-time pay.',
        { required: true, pay: true },
      ),
      f(
        'targetBonusPct',
        'Target bonus %',
        'percent',
        ['target bonus', 'bonus target', 'sti target', 'target incentive'],
        'Overrides the level’s target bonus for this person.',
      ),
    ],
  },
  {
    key: 'reqs',
    label: 'Requisitions',
    sheet: 'Requisitions',
    description:
      'Requisitions from the applicant tracking system, linked to positions, with stage, accepted offers and one-time hiring costs.',
    usedBy: ['home', 'team', 'plan', 'forecast', 'finance'],
    rowKey: ['reqId'],
    fields: [
      f(
        'reqId',
        'Req ID',
        'id',
        ['req id', 'requisition id', 'job req id', 'job id', 'requisition number'],
        'Requisition identifier.',
        { required: true },
      ),
      f(
        'positionId',
        'Position ID',
        'id',
        ['position id', 'position number', 'position', 'seat id'],
        'The seat the req fills.',
        { recommended: true },
      ),
      f(
        'status',
        'Status',
        'enum',
        ['status', 'req status', 'requisition status', 'job status'],
        'Open, On hold, Filled or Cancelled.',
        { required: true, values: REQ_STATUSES },
      ),
      f(
        'stage',
        'Stage',
        'enum',
        ['stage', 'req stage', 'pipeline stage', 'hiring stage'],
        'Req opened, Interviewing, Offer accepted or Started.',
        { recommended: true, values: REQ_STAGES },
      ),
      f(
        'reqType',
        'Req type',
        'enum',
        ['req type', 'reason for hire', 'new or backfill', 'hire type'],
        'New or Backfill.',
        { values: REQ_TYPES },
      ),
      f(
        'openedDate',
        'Opened date',
        'date',
        ['opened date', 'date opened', 'open date', 'req opened date', 'approval date'],
        'Date the req was approved and opened.',
        { required: true },
      ),
      f(
        'targetStartDate',
        'Target start',
        'date',
        ['target start', 'target start date', 'desired start date'],
        'Wanted first day.',
      ),
      f(
        'offerAcceptedDate',
        'Offer accepted',
        'date',
        ['offer accepted date', 'offer accepted', 'date offer accepted', 'filled date'],
        'Date only; no candidate detail.',
      ),
      f(
        'startDate',
        'Start date',
        'date',
        ['start date', 'expected start date', 'agreed start date', 'hire start date'],
        'The agreed first day of an accepted offer. The offer is costed from this day.',
      ),
      f(
        'closedDate',
        'Closed date',
        'date',
        ['closed date', 'date closed', 'close date', 'cancelled date'],
        'Date the req closed or was cancelled.',
      ),
      f(
        'hiringManagerId',
        'Hiring manager ID',
        'id',
        ['hiring manager id', 'hiring manager', 'hm id', 'hiring manager employee id'],
        'Employee ID of the hiring manager.',
      ),
      f(
        'recruiter',
        'Recruiter',
        'string',
        ['recruiter', 'recruiter name', 'owning recruiter'],
        'Owning recruiter.',
      ),
      f(
        'offerBase',
        'Offer base (FTE rate)',
        'money',
        ['offer base', 'offered salary', 'offer amount', 'base offer', 'offer salary'],
        'The accepted offer’s annual base: the full-time rate, not part-time pay, in the offer currency.',
        { pay: true },
      ),
      f(
        'offerCurrency',
        'Offer currency',
        'string',
        ['offer currency', 'currency', 'salary currency'],
        'ISO code of the offer amounts.',
      ),
      f(
        'signOnBonus',
        'Sign-on bonus',
        'money',
        ['sign on bonus', 'signing bonus', 'sign on', 'joining bonus'],
        'One-time; books whole in the start month.',
        { pay: true },
      ),
      f(
        'relocation',
        'Relocation',
        'money',
        ['relocation', 'relo', 'relocation cost', 'relocation amount'],
        'One-time; books whole in the start month.',
        { pay: true },
      ),
      f(
        'agencyFee',
        'Agency fee',
        'money',
        ['agency fee', 'search fee', 'recruiting fee', 'placement fee'],
        'One-time; books whole in the month the offer is accepted.',
        { pay: true },
      ),
    ],
  },
  {
    key: 'requests',
    label: 'Requests',
    sheet: 'Requests',
    description:
      'Headcount requests and their approval steps. Import requests merges files by request ID; the later update wins.',
    usedBy: ['home', 'team', 'requests', 'targets', 'whatif', 'finance'],
    rowKey: ['requestId'],
    fields: [
      f(
        'requestId',
        'Request ID',
        'id',
        ['request id', 'request number', 'ticket', 'request'],
        'Request identifier.',
        { required: true },
      ),
      f(
        'type',
        'Type',
        'enum',
        ['type', 'request type', 'change type'],
        'New role, Backfill, Level change, Location change, Transfer, Elimination, Trade, Start recruiting or Start date.',
        { required: true, values: REQUEST_TYPES },
      ),
      f(
        'state',
        'State',
        'enum',
        ['state', 'request state', 'status', 'request status'],
        'Draft, Submitted, In review, Sent back, Approved, Approved with changes, Rejected, Withdrawn or Expired.',
        { required: true, values: REQUEST_STATES },
      ),
      f(
        'reasonCode',
        'Reason',
        'enum',
        ['reason code', 'reason', 'request reason'],
        'Why the request is made, from the reason code list.',
        { required: true, values: REASON_CODES },
      ),
      f(
        'requesterId',
        'Requester ID',
        'id',
        ['requester id', 'requester', 'requested by', 'raised by'],
        'Employee ID of the requester.',
        { required: true },
      ),
      f(
        'submittedById',
        'Submitted by',
        'id',
        ['submitted by', 'submitted by id', 'submitter', 'on behalf of'],
        'Employee ID of whoever submitted it for the requester, such as their HRBP.',
      ),
      f(
        'submittedAt',
        'Submitted at',
        'datetime',
        ['submitted at', 'submitted', 'date submitted', 'submission date'],
        'When it was submitted.',
      ),
      f(
        'updatedAt',
        'Updated at',
        'datetime',
        ['updated at', 'last updated', 'modified', 'last modified'],
        'Latest change. The later one wins when requests merge.',
        { recommended: true },
      ),
      f(
        'positionId',
        'Position ID',
        'id',
        ['position id', 'position number', 'position', 'seat id'],
        'The seat changed, backfilled or eliminated; blank for a new role.',
      ),
      f(
        'businessUnit',
        'Business unit',
        'string',
        ['business unit', 'bu', 'business group', 'division'],
        'Org of the request.',
        { required: true },
      ),
      f(
        'department',
        'Department',
        'string',
        ['department', 'dept', 'org unit'],
        'Department of the request.',
      ),
      f(
        'costCenter',
        'Cost center',
        'string',
        ['cost center', 'cost centre', 'cc'],
        'Cost center of the request.',
      ),
      f(
        'managerPositionId',
        'Manager position ID',
        'id',
        ['manager position id', 'manager position', 'reports to position'],
        'The position a new seat reports to; for a trade, the org of the seats received.',
      ),
      f('level', 'Level', 'level', ['level', 'grade', 'job level', 'requested level'], 'Requested level.'),
      f(
        'location',
        'Location',
        'string',
        ['location', 'site', 'work location', 'requested location'],
        'Requested site.',
      ),
      f(
        'jobTitle',
        'Title',
        'string',
        ['title', 'job title', 'position title', 'requested title'],
        'Requested title.',
      ),
      f(
        'fte',
        'FTE',
        'number',
        ['fte', 'full time equivalent', 'requested fte'],
        'Requested FTE; blank is 1.',
      ),
      f(
        'startDate',
        'Proposed start',
        'date',
        ['proposed start', 'proposed start date', 'start date', 'target start'],
        'Proposed start, or the date the change takes effect.',
      ),
      f(
        'priority',
        'Rank',
        'number',
        ['priority', 'rank', 'ranking'],
        'Rank among the requester’s asks in a planning cycle; 1 is first.',
      ),
      f(
        'cycleId',
        'Cycle',
        'string',
        ['cycle', 'cycle id', 'planning cycle'],
        'The planning cycle the ask belongs to, such as FY28 plan.',
      ),
      f(
        'steps',
        'Steps',
        'steps',
        ['steps', 'approval steps', 'approvals', 'approval chain'],
        'Approval steps in order, as "Manager E10234 Approved 2026-08-03; HRBP E10077 Pending".',
      ),
      f(
        'confidential',
        'Confidential',
        'boolean',
        ['confidential', 'restricted', 'private'],
        'Shown only to the requester, the approval chain, the HRBP and HR admin, as for eliminations.',
      ),
      f(
        'exception',
        'Freeze exception',
        'boolean',
        ['freeze exception', 'exception', 'exception requested'],
        'Raised against a hiring freeze with a business reason; adds a Finance step.',
      ),
      f(
        'givePositionIds',
        'Give positions',
        'string',
        ['give positions', 'give position ids', 'positions given', 'traded positions'],
        'Trade: the seats given up, position IDs separated by ";".',
      ),
      f(
        'giveOrgPositionId',
        'Giving org position ID',
        'id',
        ['giving org position id', 'giving org', 'give org position'],
        'Trade: the giving org, the lowest manager position over every seat given, fixed at submit.',
      ),
      f(
        'creditUsedBp',
        'Credit used (bp)',
        'number',
        ['credit used bp', 'credit used', 'trade credit used'],
        'Trade: trade credit spent, in basis points of a standard head (10,000 is one standard head).',
      ),
      f(
        'count',
        'Seats',
        'number',
        ['count', 'seats', 'seats received', 'get count'],
        'Trade: whole seats received.',
      ),
      f(
        'jobFamily',
        'Job family',
        'string',
        ['job family', 'family', 'job family group'],
        'Trade: job family of the seats received.',
      ),
      f(
        'partTimeRest',
        'Part-time last seat',
        'boolean',
        ['part time rest', 'part time last seat', 'partial seat'],
        'Trade: adds one part-time seat with what is left, where the location allows part time.',
      ),
      f(
        'restFte',
        'Rest FTE',
        'number',
        ['rest fte', 'part time rest fte', 'last seat fte', 'partial seat fte'],
        'Trade: the FTE of the part-time seat made from what is left; blank when there is none.',
      ),
      f(
        'rateVersion',
        'Rate version',
        'string',
        ['rate version', 'trade rate version', 'priced on'],
        'Trade: the version whose rates priced the quote.',
      ),
      f(
        'rateHash',
        'Rate hash',
        'string',
        ['rate hash', 'rate lock hash', 'pricing hash'],
        'Trade: the lock hash of that version; blank for a Working version.',
      ),
      f(
        'giveBp',
        'Give (bp)',
        'number',
        ['give bp', 'give weight', 'given bp'],
        'Trade: the weight given, in basis points, stored at submit and again at each approval.',
      ),
      f(
        'getBp',
        'Get (bp)',
        'number',
        ['get bp', 'get weight', 'received bp'],
        'Trade: the weight received, in basis points.',
      ),
      f(
        'creditBp',
        'Credit (bp)',
        'number',
        ['credit bp', 'trade credit', 'credit left'],
        'Trade: the weight left over as trade credit, in basis points. Give = get + credit.',
      ),
      f(
        'transferKind',
        'Transfer kind',
        'enum',
        ['transfer kind', 'transfer type', 'move type'],
        'Transfer: Position move (the seat and its person move) or Internal move (the person fills an Open seat).',
        { values: TRANSFER_KINDS },
      ),
      f(
        'personId',
        'Moving person ID',
        'id',
        ['moving person id', 'person id', 'transferee id', 'employee moving'],
        'Transfer: Employee ID of the person who moves.',
      ),
      f(
        'fromPositionId',
        'From position ID',
        'id',
        ['from position id', 'from position', 'current position id'],
        'Transfer: the seat the person leaves, or the seat that moves.',
      ),
      f(
        'toManagerPositionId',
        'To manager position ID',
        'id',
        ['to manager position id', 'to manager position', 'new manager position'],
        'Transfer: the manager position the seat moves under (position move).',
      ),
      f(
        'toPositionId',
        'To position ID',
        'id',
        ['to position id', 'to position', 'receiving position id'],
        'Transfer: the Open seat the person fills (internal move).',
      ),
      f(
        'effectiveDate',
        'Effective date',
        'date',
        ['effective date', 'move date', 'transfer date'],
        'Transfer: the first day in the new place.',
      ),
      f(
        'moveBudget',
        'Move budget too',
        'boolean',
        ['move budget', 'move budget too', 'budget moves'],
        'Transfer: moves one head and the seat’s in-year band estimate between the two orgs’ targets.',
      ),
    ],
  },
  {
    key: 'targets',
    label: 'Targets',
    sheet: 'Targets',
    description: 'Finance’s heads and loaded cost per org and fiscal year.',
    usedBy: ['home', 'requests', 'targets', 'whatif', 'finance'],
    rowKey: ['fiscalYear', 'businessUnit', 'department', 'costCenter', 'leaderPositionId'],
    fields: [
      f(
        'fiscalYear',
        'Fiscal year',
        'string',
        ['fiscal year', 'fy', 'plan year', 'budget year'],
        'Such as FY28. FY27 runs from 1 Apr 2026 to 31 Mar 2027.',
        { required: true },
      ),
      f(
        'targetDate',
        'Target date',
        'date',
        ['target date', 'target as of', 'as of date', 'year end date'],
        'The date the heads target is for; blank is the fiscal year’s last day.',
      ),
      f(
        'businessUnit',
        'Business unit',
        'string',
        ['business unit', 'bu', 'business group', 'division'],
        'Org of the target.',
        { required: true },
      ),
      f(
        'department',
        'Department',
        'string',
        ['department', 'dept', 'org unit'],
        'Blank targets the whole unit.',
      ),
      f(
        'costCenter',
        'Cost center',
        'string',
        ['cost center', 'cost centre', 'cc'],
        'Blank targets a whole department or unit.',
      ),
      f(
        'leaderPositionId',
        'Leader position ID',
        'id',
        ['leader position id', 'leader position', 'sub org', 'leader'],
        'Targets a leader’s tree instead of an org unit.',
      ),
      f(
        'targetHeads',
        'Target heads',
        'number',
        ['target heads', 'target headcount', 'headcount target', 'hc target', 'ending headcount'],
        'Employee heads at the target date.',
        { required: true },
      ),
      f(
        'targetCost',
        'Target cost (USD)',
        'money',
        ['target cost', 'cost target', 'personnel cost target', 'budget cost'],
        'Loaded cost for the whole fiscal year in USD, the sum of its months, not a year-end run rate.',
        { recommended: true, cost: true },
      ),
    ],
  },
  {
    key: 'freezes',
    label: 'Hiring freezes',
    sheet: 'Freezes',
    description: 'Hiring freezes by org and date. Accepted offers are honored; backfills need an exception.',
    usedBy: ['home', 'plan', 'requests', 'forecast', 'whatif', 'finance'],
    rowKey: ['freezeId'],
    fields: [
      f('freezeId', 'Freeze ID', 'id', ['freeze id', 'freeze', 'freeze number'], 'Freeze identifier.', {
        required: true,
      }),
      f(
        'businessUnit',
        'Business unit',
        'string',
        ['business unit', 'bu', 'business group', 'division'],
        'The frozen org.',
        { required: true },
      ),
      f(
        'department',
        'Department',
        'string',
        ['department', 'dept', 'org unit'],
        'Blank freezes the whole unit.',
      ),
      f(
        'costCenter',
        'Cost center',
        'string',
        ['cost center', 'cost centre', 'cc'],
        'Blank freezes the whole department or unit.',
      ),
      f(
        'leaderPositionId',
        'Leader position ID',
        'id',
        ['leader position id', 'leader position', 'sub org', 'leader'],
        'Freezes a leader’s tree.',
      ),
      f(
        'startDate',
        'From',
        'date',
        ['start date', 'from', 'freeze start', 'effective date'],
        'First frozen day.',
        { required: true },
      ),
      f(
        'endDate',
        'To',
        'date',
        ['end date', 'to', 'until', 'freeze end'],
        'Last frozen day; blank is open-ended.',
      ),
      f(
        'allowBackfill',
        'Backfills allowed',
        'boolean',
        ['allow backfill', 'backfills allowed', 'backfill allowed', 'backfill exception'],
        'Whether backfills may go ahead during the freeze; blank is No.',
      ),
      f(
        'reason',
        'Reason',
        'string',
        ['reason', 'freeze reason', 'why'],
        'Short reason, shown on New request.',
      ),
    ],
  },
  {
    key: 'assumptions',
    label: 'Assumptions',
    sheet: 'Assumptions',
    description:
      'Planning assumptions in long form: a table, an org and a key per row. Values fall back from org to unit to company.',
    usedBy: ['home', 'team', 'plan', 'requests', 'forecast', 'targets', 'whatif', 'finance'],
    rowKey: ['version', 'table', 'org', 'key'],
    fields: [
      f(
        'version',
        'Version',
        'string',
        ['version', 'plan version', 'version id', 'scenario'],
        'The version the value is for, by ID or name, such as fy27-working or FY27 Working.',
        { required: true },
      ),
      f(
        'table',
        'Table',
        'enum',
        ['table', 'assumption table', 'assumption', 'driver'],
        'Which assumption: band, bonusTarget, fx, attrition and the rest of the assumption tables.',
        { required: true, values: ASSUMPTION_TABLES },
      ),
      f(
        'org',
        'Org',
        'string',
        ['org', 'scope', 'org unit', 'applies to'],
        'Blank is the company; a business unit or department overrides it.',
      ),
      f(
        'key',
        'Key',
        'string',
        ['key', 'dimension', 'dimensions', 'for'],
        'The table’s dimensions joined by "|", such as P4|Munich|FY27 or EUR|plan|2026-09; * for a table set by org alone.',
        { required: true },
      ),
      f(
        'value',
        'Value',
        'number',
        ['value', 'amount', 'rate'],
        'A number in the table’s unit: local currency, USD, a fraction, days, months or a date as YYYYMMDD.',
        { required: true },
      ),
    ],
  },
]

export const datasetDef = (key: DatasetKey): DatasetDef => DATASETS.find((d) => d.key === key)!
