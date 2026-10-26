/**
 * The Finance view's model (docs/PLAN.md 6.6, 6.10, 9.4, 11.5), read only in M2 and with its write
 * side from M3 (each tab's `writes`, ./writes.ts: what the tab offers to change): versions with their
 * state, lock date, hash and engine version, back-dated adjustments, every assumption table with its
 * fallback level and the trade rates, freezes with the openings they hold, and the reconciliation
 * exceptions. Outside HR admin with the switch, adjustments list by position with no amount, "Other
 * HRIS change" is a count per posted month (5 or more, else "—") and amounts show only as sums by
 * posted month under 7.2 rules 1 and 5; HRBP sees counts only. One model per analytics context
 * (`financeModel`, cached in a WeakMap).
 *
 * Other views read it: the Finance home re-links Freezes' freeze savings and Reconcile's
 * reconciliation exceptions and reqs not in plan (9.3).
 *
 * Frozen in the M2 freeze (docs/CONTRACTS-M2.md). The interfaces list what other builders read; the
 * views-2 builder may add fields, never rename or retype these. Built by the views-2 builder: each
 * tab lives in its own module (./versions.ts, ./assumptions.ts, ./freezes.ts, ./reconcile.ts, and
 * from M4 ./export.ts, the FP&A load file, by the finance-export builder) and is built when first
 * read, so the Finance home's two tabs never pay for the others.
 */
import type { AnalyticsContext } from '@/data/context'
import type {
  AssumptionTable,
  FiscalYear,
  ISODate,
  ISODateTime,
  Level,
  Month,
  PositionStatus,
} from '@/data/schema'
import type { LongRow } from '@/lib/export/longCsv'
import type { Format } from '@/lib/format'
import type { ReconException } from '@/plan/engine/reconcile'
import type { AdjustmentKind, AdjustmentReason, VersionKind, VersionState } from '@/plan/types'
import type { FigureData, Headline, TabModel } from '../../types'
import { ID } from '../metrics'
import { assumptionsTab } from './assumptions'
import { prepareFinance } from './base'
import { exportTab } from './export'
import { freezesTab } from './freezes'
import { reconcileTab } from './reconcile'
import { versionsTab } from './versions'
import type { AssumptionWrites, FreezeWrites, ReconWrites, VersionWrites } from './writes'

export type {
  AssumptionWrites,
  CloseChoice,
  CreateChoice,
  EditableTable,
  EditableValue,
  FreezeOrgOption,
  FreezeWrites,
  FxForm,
  LockChoice,
  ReconWrites,
  ReopenChoice,
  ReopenRow,
  VersionWrites,
  WriteAccess,
} from './writes'

/* ───────────── rows ───────────── */

/** One version of Finance > Versions. */
export interface VersionRow {
  versionId: string
  name: string
  kind: VersionKind
  fiscalYear: FiscalYear
  state: VersionState
  lockedAt: ISODateTime | null
  /** The locker's name (the Acting as pick at lock). */
  lockedBy: string | null
  /** 'sha256-<hex>', or null for Working ("Working, not locked"). */
  hash: string | null
  /** The lock's hash still verifies (`verifyLock`); null for Working and retired versions. */
  verifies: boolean | null
  engineVersion: string
  /** Added by the builder: "Hash still verifies", "Hash differs" or "Working, not locked". */
  verifiesText: string
}

/** Added by the builder: one month close of Finance > Versions (6.6), with no amount. */
export interface CloseRow {
  month: Month
  closedAt: ISODateTime
  /** The closer's name (the Acting as pick at close). */
  closedBy: string
  hash: string
  verifies: boolean
  verifiesText: string
}

/** One back-dated hire or exit, by position, with no amount (6.6). "Other HRIS change" is never a row here. */
export interface AdjustmentListRow {
  id: string
  postedIn: Month
  forMonth: Month
  positionId: string | null
  kind: Exclude<AdjustmentKind, 'other'>
  reason: AdjustmentReason
}

/** Back-dated adjustments by posted month: counts, and the amount only as a guarded sum. */
export interface AdjustmentMonthRow {
  postedIn: Month
  hires: number
  exits: number
  /** "Other HRIS change": a count of 5 or more, else null ("—"); no drill. */
  other: number | null
  /** The month's adjustment amount under 7.2 rules 1 and 5; null where hidden (and always for HRBP). */
  amountUsd: number | null
  reason: string | null
  /** Added by the builder: the row's key (the posted month), and the positions that moved, only where the amount shows. */
  month: Month
  contributors: number | null
}

/** One assumption value with its fallback level (org, unit, company). */
export interface AssumptionValueRow {
  table: AssumptionTable
  /** The org it is set for; null for the company. */
  org: string | null
  level: 'org' | 'unit' | 'company'
  key: string
  value: number
  /** "Set by import." for the read-only keys outside HR admin (7.4), else null. */
  note: string | null
  /** Added by the builder: the table's name, the value's unit, the value as the table writes it and its format. */
  tableLabel: string
  unit: string
  /** The value as the table writes it; null for an amount, which `amount` carries. */
  shown: number | string | null
  /** An amount in the key's local currency or USD (band midpoints, caps, benefits, equity), else null. */
  amount: number | null
  format: Format
}

/** One row of Finance > Assumptions > Trade rates (11.5): a level × location for the version's year. */
export interface TradeRateRow {
  level: Level
  location: string
  /** Annual band estimate in USD at plan FX (`band: true`); null where `cost:band` hides it. */
  bandUsd: number | null
  weightBp: number
  /** For information, labeled "incl. SBC". */
  weightInclSbcBp: number | null
  partTimeAllowed: boolean
  /** Added by the builder: "Yes" or "No". */
  partTimeText: string
}

/** The standard head row: "Compute from Budget: $149,849, in use $150,000" (`finance.trade.standardHead`). */
export interface StandardHeadFacts {
  computedUsd: number | null
  inUseUsd: number | null
  /** "Rates can change until FY28 locks" for a year with no locked Budget, else null. */
  note: string | null
}

/** One freeze of Finance > Freezes, with what it holds. Savings amounts show to Finance and HR admin only. */
export interface FreezeListRow {
  freezeId: string
  org: string
  startDate: ISODate
  endDate: ISODate | null
  allowBackfill: boolean
  openingsHeld: number
  exceptions: number
  /** Freeze savings (`finance.freeze.savings`, a band figure); null where hidden (HRBP: "Shows in Finance mode."). */
  savingsUsd: number | null
  /** Added by the builder: "Yes" or "No", and why the savings read "—". */
  allowBackfillText: string
  reason: string | null
}

/** One opening a freeze holds. */
export interface FrozenOpeningRow {
  positionId: string
  title: string | null
  org: string
  status: PositionStatus
  startDate: ISODate | null
  freezeId: string
  /** Added by the builder: the opening's savings under this freeze (Finance and HR admin), and why it reads "—". */
  savingsUsd: number | null
  reason: string | null
}

/** One reconciliation exception, with whether it was marked reviewed. */
export interface ReconRow extends ReconException {
  reviewed: boolean
  /** Added by the builder: the kind's and the review's words. */
  kindText: string
  reviewedText: string
  /** Added in M3: the viewer may mark it reviewed (open, and an HRBP's own unit's). */
  reviewable: boolean
}

/* ───────────── tabs ───────────── */

export interface FinanceVersions extends TabModel {
  versions: FigureData<VersionRow>
  /** Added by the builder: the month closes. */
  closes: FigureData<CloseRow>
  adjustments: FigureData<AdjustmentListRow>
  adjustmentsByMonth: FigureData<AdjustmentMonthRow>
  /** Added in M3: what the tab offers to change (create, lock, reopen, close). */
  writes: VersionWrites
}

export interface FinanceAssumptions extends TabModel {
  values: FigureData<AssumptionValueRow>
  /** Null where `tab:finance.assumptions:trade-rates` is hidden. */
  tradeRates: FigureData<TradeRateRow> | null
  standardHead: StandardHeadFacts | null
  /** Added by the builder: why Trade rates show nothing (the part is hidden, or no version to price with), else null. */
  tradeRatesEmpty: string | null
  /** Added in M3: the values the viewer may change, and how. */
  writes: AssumptionWrites
}

export interface FinanceFreezes extends TabModel {
  freezes: FigureData<FreezeListRow>
  openings: FigureData<FrozenOpeningRow>
  /** Added in M3: create and edit. */
  writes: FreezeWrites
}

export interface FinanceReconcile extends TabModel {
  exceptions: FigureData<ReconRow>
  /** Added in M3: Mark reviewed. */
  writes: ReconWrites
}

/** One version a load file can be written for: the shown fiscal year's Working and locked versions. */
export interface ExportVersionOption {
  versionId: string
  /** "FY27 Budget (locked)", "FY27 Working". */
  label: string
}

/** One load file the tab offers. */
export interface LoadFileChoice {
  /** "Download the load file", "Download the load file with individual pay". */
  label: string
  /** The sentence under the button (the mode's rule for the file). */
  note: string
  /** Why it cannot be written now (no version to read), else null. A reader tab still exports. */
  disabled: string | null
  individualPay: boolean
}

/** One period of the control totals table (src/lib/export/controlTotals.ts `CONTROL_TOTAL_COLUMNS`). */
export interface ControlTotalRow {
  period: string
  heads: number
  fte: number
  loadedUsd: number | null
  suppressedCells: number
  /** Added by the builder: the costed people behind the loaded total (not a column; leak tests read it). */
  costed: number | null
}

/**
 * One control total by component (./longCsv.ts `ComponentTotal`, review SB-1): a unit's or the whole
 * company's split in one period, where the guard shows it.
 */
export interface ComponentTotalRow {
  period: string
  /** The unit, or "Whole company". */
  org: string
  /** The filled part's components in USD (keys apart from a seat's `base`: no row is one position's). */
  usdBase: number
  usdBonus: number
  usdBurden: number
  usdBenefits: number
  usdOneTime: number
  usdVacancy: number
  /** "Open and Planned at band estimate", apart (7.2 rule 3). */
  bandUsd: number | null
  loadedUsd: number
  /** The costed people behind it (not a column; leak tests read it). */
  costed: number
}

/**
 * Finance > Export (docs/PLAN.md 9.4, 14.1 items 3, 4 and 6; M4 freeze, docs/CONTRACTS-M4.md): the
 * FP&A load file at Finance's rules (`export.load-file`), the unsuppressed one for HR admin with the
 * switch on (`export.load-file-full`), the version they read, and the shown version's control
 * totals. Was `TabModel` in M2 and M3.
 */
export interface FinanceExport extends TabModel {
  versions: readonly ExportVersionOption[]
  /** Null where `action:export.load-file` is hidden. */
  loadFile: LoadFileChoice | null
  /** Null where `action:export.load-file-full` is hidden (every mode but HR admin with the switch on). */
  fullLoadFile: LoadFileChoice | null
  /** The control totals of the shown version's load file (figure `finance-export-totals`); null until built. */
  totals: FigureData<ControlTotalRow> | null
  /**
   * Added by the finance-export builder: the shown version's load file, its full-year rows (figure
   * `finance-export-preview`); null where `totals` is.
   */
  preview: FigureData<LongRow & { costed: number | null }> | null
  /**
   * Fix step (review SB-1): the load file's control totals by component, each unit's and the whole
   * company's where the guard shows the split (figure `finance-export-components`); null where
   * `totals` is.
   */
  components: FigureData<ComponentTotalRow> | null
}

export interface FinanceModel {
  versions: FinanceVersions
  assumptions: FinanceAssumptions
  freezes: FinanceFreezes
  reconcile: FinanceReconcile
  export: FinanceExport
}

const cache = new WeakMap<AnalyticsContext, FinanceModel>()

/** A value built when first read. */
function once<T>(make: () => T): () => T {
  let done = false
  let v: T
  return () => {
    if (!done) {
      v = make()
      done = true
    }
    return v
  }
}

/** The Finance view's model for a context (cached per context). Each tab is built when first read. */
export function financeModel(ctx: AnalyticsContext): FinanceModel {
  const hit = cache.get(ctx)
  if (hit) return hit
  const p = prepareFinance(ctx)
  const versions = once(() => versionsTab(p))
  const assumptions = once(() => assumptionsTab(p))
  const freezes = once(() => freezesTab(p))
  const reconcile = once(() => reconcileTab(p))
  const exported = once(() => exportTab(p))
  const model: FinanceModel = {
    get versions() {
      return versions()
    },
    get assumptions() {
      return assumptions()
    },
    get freezes() {
      return freezes()
    },
    get reconcile() {
      return reconcile()
    },
    get export() {
      return exported()
    },
  }
  cache.set(ctx, model)
  return model
}

/** The folder tab's number: versions locked (9.1), for the shown fiscal year. */
export function financeHeadline(ctx: AnalyticsContext): Headline {
  const p = prepareFinance(ctx)
  const n = ctx.versions.filter((v) => v.fiscalYear === p.fiscalYear && v.state === 'locked').length
  return {
    value: String(n),
    label: `${p.fiscalYear} versions locked`,
    metricId: ID.versionsLocked,
    uses: p.uses(ID.versionsLocked),
  }
}
