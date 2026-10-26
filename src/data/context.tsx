/**
 * The analytics context every view reads (docs/PLAN.md 9.2): the as-of date, the reporting window,
 * the scoped datasets, the unscoped company datasets, the position tree, the quality index with the
 * data standard, the metric dictionary, the mode with its access context (`ctx.access`: scope,
 * Acting as, pay and leave views, `decide`), the plan state and its versions, the version shown, the
 * one comparison every "vs" figure uses, and the cost guard's settings (`ctx.guard`: the mode's
 * guard, the locked rules in force and the last close's atom index).
 *
 * `metrics` is the metric dictionary with your changes: engines read every calculation setting
 * through `ctx.metrics`, and the quality index uses the data quality rules it holds.
 *
 * Every dataset key is always present in `data` and `all` (an empty list when nothing is loaded).
 *
 * The mode's scope is not decided here. `buildContext` takes a `clamp` (identity when not given)
 * that holds the filters and the datasets inside the mode's scope, and hands `ctx.access` its scope;
 * the access layer supplies one built from `scopeFor` and `clampFilters` (src/access/context.ts
 * `accessClamp`, docs/PLAN.md 8.2). The version and comparison are pickers, never clamped: an
 * unknown or cross-year pick resets to the default (`checkPicks`), and the comparison is resolved
 * once, here, by `resolveCompare`.
 *
 * M2 freeze (docs/CONTRACTS-M2.md): the context's shape is frozen; the access builder filled the
 * default clamp (`accessClamp` over the Acting as picks and the lists in force, src/access/lists.ts,
 * whose sample source names the sample's people for `validationVocab` too) and the provider's wiring
 * to the mode store (src/access/store.ts). The position tree is memoized per positions array and
 * date, so a filter change keeps the same tree and the same scope.
 *
 * No Ask panel and no Developer parts (docs/PLAN.md 1.1).
 */
import { createContext, type ReactNode, use, useDeferredValue, useMemo } from 'react'
import { type AccessContext, accessClamp, accessFor } from '@/access/context'
import { listsInForce, sampleListSource, setContextLists } from '@/access/lists'
import type { ModePicks } from '@/access/modes'
import { COMPARE_DEFAULT, NO_PICKS } from '@/access/modes'
import { guardModeIn, showCostIn, showPayIn } from '@/access/pay'
import { atomsOn } from '@/access/scopes/atoms'
import type { ScopeLock } from '@/access/scopes/types'
import { useMode } from '@/access/store'
import { managerText } from '@/access/visibility'
import type { AtomIndex } from '@/cost/atoms'
import type { GuardMode } from '@/cost/guard'
import { timed } from '@/lib/timing'
import { defaultMetrics } from '@/metrics/api'
import { type CostGuardSettings, costGuardOf } from '@/metrics/costGuard'
import { metricsInMode, metricsUnworded } from '@/metrics/modeWording'
import { qualityRulesOf } from '@/metrics/quality'
import type { MetricsApi } from '@/metrics/types'
import { budgetOf, isLocked, planOfRecord } from '@/plan/engine/versions'
import { withOverlay } from '@/plan/store/overlay'
import type { AnyVersion, AuditEntry, LockedVersion, PlanState } from '@/plan/types'
import { fiscalYearOf } from './fiscal'
import { validationVocab } from './lists/effective'
import type { ListsState } from './lists/types'
import { computeQuality } from './quality/compute'
import type { QualityRules } from './quality/rules'
import { type DataStandard, DEFAULT_STANDARD } from './quality/tier'
import type { DatasetVersion, QualityIndex } from './quality/types'
import type { VocabOverlay } from './quality/vocab'
import {
  type DatasetKey,
  type Datasets,
  type FiscalYear,
  type ISODate,
  type Mode,
  type PositionRow,
  type ReqRow,
  withAllDatasets,
} from './schema'
import {
  buildPositionIndex,
  type Filters,
  hasOrgFilter,
  holderNames,
  type PeriodWindow,
  type PositionIndex,
  periodWindow,
  scopeDatasets,
  scopeLabel,
} from './scope'
import { contextAsOf, type SourceMeta, useStore } from './store'
import {
  checkPicks,
  DEFAULT_SCOPE,
  type PickCatalog,
  type PickProblem,
  shownVersion,
  TARGET_COMPARE,
  type UrlScope,
  type VersionChoice,
} from './urlScope'

/* ───────────── the comparison ───────────── */

/**
 * What every "vs" figure compares with (docs/PLAN.md 9.2): a locked version of the shown version's
 * fiscal year, or that year's target. `label` is what follows "vs" (`compareDeltaLabel`).
 */
export type Compare =
  | { kind: 'version'; versionId: string; fiscalYear: FiscalYear; label: string }
  | { kind: 'target'; fiscalYear: FiscalYear; label: string }

/**
 * Each mode's default comparison (docs/PLAN.md 8.1 `COMPARE_DEFAULT`): Finance compares with the
 * fiscal year's Budget, every other mode with its plan of record. A year without that version
 * compares with its target in every mode, Finance included (`resolveCompare`). Declared with the
 * other per-mode tables in src/access/modes.ts and re-exported here.
 */
export { COMPARE_DEFAULT, type CompareDefault } from '@/access/modes'

/** "Q1 Reforecast" for "FY27 Q1 Reforecast": the name without its fiscal year. */
const shortName = (v: AnyVersion): string =>
  v.name.startsWith(`${v.fiscalYear} `) ? v.name.slice(v.fiscalYear.length + 1) : v.name

/**
 * The words after "vs" for a locked version: "plan of record (Q1 Reforecast)" for the fiscal year's
 * plan of record when it is a reforecast, else the version's name ("FY27 Budget").
 */
export function versionCompareLabel(v: LockedVersion, versions: readonly AnyVersion[]): string {
  const ofRecord = planOfRecord(versions, v.fiscalYear)
  return ofRecord?.versionId === v.versionId && v.kind !== 'budget'
    ? `plan of record (${shortName(v)})`
    : v.name
}

/** "FY28 target". */
export const targetCompareLabel = (fy: FiscalYear): string => `${fy} target`

/** Every delta's label (docs/PLAN.md 9.2): "vs FY27 Budget", "vs plan of record (Q1 Reforecast)", "vs FY28 target". */
export const compareDeltaLabel = (compare: Pick<Compare, 'label'>): string => `vs ${compare.label}`

/** What the version and comparison pickers can offer from the plan versions, for the as-of date's fiscal year. */
export function pickCatalog(versions: readonly AnyVersion[], asOf: ISODate): PickCatalog {
  return {
    fiscalYear: fiscalYearOf(asOf),
    versions: versions.map(
      (v): VersionChoice => ({ versionId: v.versionId, fiscalYear: v.fiscalYear, state: v.state }),
    ),
  }
}

/**
 * The comparison (docs/PLAN.md 9.2), looked up within the shown version's fiscal year:
 *  - an explicit `vs` that `checkPicks` keeps wins: the target, or a locked version of that year;
 *  - otherwise the mode's default (`COMPARE_DEFAULT`): Finance's is that year's locked Budget, every
 *    other mode's the year's plan of record (its latest locked version);
 *  - when the year has no such version (FY28 today), every mode, Finance included, compares with the
 *    year's target: `{ kind: 'target', fiscalYear, label: 'FY28 target' }`.
 * An unknown, Working or cross-year `vs` falls back to the default. Pure.
 */
export function resolveCompare(
  mode: Mode,
  scope: Pick<UrlScope, 'version' | 'compare'>,
  catalog: PickCatalog,
  versions: readonly AnyVersion[],
): Compare {
  const checked = checkPicks(
    { ...DEFAULT_SCOPE, version: scope.version, compare: scope.compare },
    catalog,
  ).scope
  const fiscalYear = shownVersion(checked, catalog)?.fiscalYear ?? catalog.fiscalYear
  const target: Compare = { kind: 'target', fiscalYear, label: targetCompareLabel(fiscalYear) }
  if (checked.compare === TARGET_COMPARE) return target
  const picked = checked.compare
    ? (versions.find(
        (v): v is LockedVersion =>
          v.versionId === checked.compare && isLocked(v) && v.fiscalYear === fiscalYear,
      ) ?? null)
    : null
  const v =
    picked ??
    (COMPARE_DEFAULT[mode] === 'budget' ? budgetOf(versions, fiscalYear) : planOfRecord(versions, fiscalYear))
  if (!v) return target
  return { kind: 'version', versionId: v.versionId, fiscalYear, label: versionCompareLabel(v, versions) }
}

/* ───────────── the scope clamp ───────────── */

/** What a mode's scope clamp is given. */
export interface ClampInput {
  mode: Mode
  filters: Filters
  /** Every dataset, unscoped. */
  all: Datasets
  positionIndex: PositionIndex
  asOf: ISODate
  /**
   * The cost-atom index the context's guard reads (the last close's), so a tree's sub-orgs are
   * tested against the same atoms (an addition to the M2 freeze's input; optional).
   */
  atoms?: AtomIndex
}

/** What a mode's scope holds the context to. */
export interface Clamp {
  /** The filters inside the scope (`clampFilters`: the same object when unchanged). */
  filters: Filters
  /** The datasets after the filters, narrowed to the scope (`applyScope`); unchanged when not given. */
  narrow?: (data: Datasets) => Datasets
  /** The scope's label ("Dana Ito's org"); the filters' own label when not given. */
  label?: string
  /** A scope holds the data (a tree or a unit, or an unset pick that holds nobody): not the whole company. */
  scoped?: boolean
  /** The scope itself, for `ctx.access.scope` (null or not given: none). */
  scope?: ScopeLock | null
  /** The mode needs a pick it does not have: the scope holds nobody (`ctx.access.unset`). */
  unset?: boolean
}

/** Holds the filters and datasets inside a mode's scope; the access layer builds it from `scopeFor`. */
export type ScopeClamp = (input: ClampInput) => Clamp

/** No scope: the filters as they are (HR admin, Finance, and every mode until the access layer supplies one). */
export const NO_CLAMP: ScopeClamp = ({ filters }) => ({ filters })

/* ───────────── the cost guard's settings ───────────── */

/**
 * What every model builder passes to the cost guard (src/cost/, docs/PLAN.md 7), resolved once per
 * context: the guard is never decided in the UI.
 */
export interface GuardSettings {
  /** How amounts show (src/access/pay.ts `guardModeIn`): 'none', 'exact', 'rounded' or 'open'. */
  mode: GuardMode
  /**
   * The locked rules in force (`cost.guard.minCosted`, `floorUsd`, `minContributors`, raise only),
   * from the metric dictionary (`costGuardOf(ctx.metrics)`), never constants.
   */
  rules: CostGuardSettings
  /**
   * The cost-atom index every rounded figure reads (7.3a, C20): the last month close's stored index;
   * with no close in plan state, the index at the last month-end on or before the as-of date.
   */
  atoms: AtomIndex
}

/** The last close's atom index, else the one at the last month-end on or before the as-of date (memoized). */
function contextAtoms(plan: PlanState | null, positions: readonly PositionRow[], asOf: ISODate): AtomIndex {
  let last: PlanState['closes'][number] | null = null
  for (const c of plan?.closes ?? []) if (!last || c.month > last.month) last = c
  if (last) return last.atoms
  return atomsOn(positions, asOf)
}

const indexMemo = new WeakMap<readonly PositionRow[], Map<ISODate, PositionIndex>>()

/** The position tree at the as-of date, memoized per positions array, so a filter change keeps it (and the scope). */
export function positionIndexOf(positions: readonly PositionRow[], asOf: ISODate): PositionIndex {
  let byDate = indexMemo.get(positions)
  if (!byDate) {
    byDate = new Map()
    indexMemo.set(positions, byDate)
  }
  let hit = byDate.get(asOf)
  if (!hit) {
    hit = buildPositionIndex(positions, asOf)
    byDate.set(asOf, hit)
  }
  return hit
}

/* ───────────── the context ───────────── */

export interface AnalyticsContext {
  asOf: ISODate
  /** The period the filters pick, at the as-of date. */
  window: PeriodWindow
  /** The filters after the mode's clamp. */
  filters: Filters
  scopeLabel: string
  /** No org filter and no scope applies. */
  isCompany: boolean
  /** Org-scoped datasets. */
  data: Datasets
  /** Unscoped datasets, for company benchmarks. */
  all: Datasets
  /** The position tree over every position as of the as-of date. */
  positionIndex: PositionIndex
  sources: Record<DatasetKey, SourceMeta>
  /** Every dataset is the generated sample. */
  isSample: boolean
  /**
   * The "Show pay amounts" switch is on, in HR admin, the one mode that has it (docs/PLAN.md 7.5 and
   * 8.1 `PAY_OF`): per-person amounts (`pay: true` columns) may show. What every other mode shows of
   * pay is the cost guard's job.
   */
  showPay: boolean
  /**
   * Cost totals may show (`cost: true` columns), under the mode's guard: every mode but Manager
   * (src/access/pay.ts `showCostIn`).
   */
  showCost: boolean
  /** Tiers of every dataset and field, with explanations. */
  quality: QualityIndex
  /** The lowest tier the app shows. */
  standard: DataStandard
  /** The metric dictionary: wording, targets and the calculation settings engines read. */
  metrics: MetricsApi
  mode: Mode
  /**
   * The mode, its scope, its Acting as pick, its pay and leave views, and `decide` bound to them
   * (src/access/context.ts). Ask it, never the mode store, so an off-screen render with its own mode
   * gets its own answers. In a scoped mode `filters` and `data` are inside the scope and `isCompany`
   * is false; `all` is never narrowed.
   */
  access: AccessContext
  /** The cost guard's settings (`GuardSettings`). */
  guard: GuardSettings
  /**
   * The plan state (docs/PLAN.md 5.3: versions, closes, adjustments, Working overlay, requests,
   * cycles, reviews), or null when none is loaded (tests, the scaffold).
   */
  plan: PlanState | null
  /** The audit log the provider loaded (`PlanStore.listAudit`); every reader outside HR admin goes through `auditView`. */
  audit: readonly AuditEntry[]
  /** Every plan version (locked, Working and retired). */
  versions: readonly AnyVersion[]
  /** The version shown (`ver`, else the as-of fiscal year's Working); null when there is none. */
  version: AnyVersion | null
  /** The pickers after `checkPicks`, and which ones a link named that were reset. */
  picks: { version: string | null; compare: string | null; reset: readonly PickProblem[] }
  /** What every "vs" figure compares with, resolved once (`resolveCompare`). */
  compare: Compare
}

/**
 * The quality index for the datasets under the data quality rules in force (the defaults when not
 * given). Memoized inside `computeQuality`; pass the rules from `qualityRulesOf` so the same values
 * reuse the same index.
 */
export function qualityFor(
  data: Datasets,
  versions: Partial<Record<DatasetKey, DatasetVersion | null>>,
  asOf: ISODate,
  opts: {
    rules?: QualityRules
    /** The official lists in force (`validationVocab`); the built-in vocabularies when not given. */
    vocab?: VocabOverlay | null
    /** The date the loaded data describes, whatever the as-of override (the sample's own date). */
    dataAsOf?: ISODate
  } = {},
): QualityIndex {
  return computeQuality(data, versions, undefined, {
    asOf,
    ...(opts.dataAsOf && opts.dataAsOf !== asOf ? { dataAsOf: opts.dataAsOf } : {}),
    ...(opts.rules ? { rules: opts.rules } : {}),
    ...(opts.vocab ? { vocab: opts.vocab } : {}),
  })
}

const datasetVersionsFallback = new WeakMap<Datasets, Partial<Record<DatasetKey, DatasetVersion | null>>>()
const NO_VERSIONS: readonly AnyVersion[] = []

const managerVersions = new WeakMap<readonly AnyVersion[], readonly AnyVersion[]>()

/**
 * The plan versions as a mode reads them (docs/PLAN.md 7.6, 8.4 rule 5, M3 review UI-3): in Manager
 * mode a version name with an amount reads "an amount", since a name that came with a Full file's
 * Replace or Merge never passed the entry check; tiles, labels and files all read names from here.
 * The same array in every other mode and when no name holds an amount (memoized per list).
 */
function versionsIn(mode: Mode, versions: readonly AnyVersion[]): readonly AnyVersion[] {
  if (mode !== 'manager' || !versions.length) return versions
  let hit = managerVersions.get(versions)
  if (!hit) {
    let out: AnyVersion[] | null = null
    versions.forEach((v, i) => {
      const name = managerText(v.name, { mode })
      if (name === v.name) return
      out ??= versions.slice()
      out[i] = { ...v, name }
    })
    hit = out ?? versions
    managerVersions.set(versions, hit)
  }
  return hit
}
const NO_AUDIT: readonly AuditEntry[] = []

const managerPositions = new WeakMap<readonly PositionRow[], readonly PositionRow[]>()

/**
 * The position rows a Manager-mode context reads (R48, 7.6; M4 review EX-3): every title and job
 * family through `managerText`, so an amount that arrived in the positions dataset reads "an amount"
 * on every surface, export, Shareable and Export for a manager file, as request titles and version
 * names already do. The same array in every other mode and when no row holds an amount (memoized
 * per list). Only free text changes: no key, org, level or date a join reads.
 */
function positionsIn(mode: Mode, positions: readonly PositionRow[]): readonly PositionRow[] {
  if (mode !== 'manager' || !positions.length) return positions
  let hit = managerPositions.get(positions)
  if (!hit) {
    let out: PositionRow[] | null = null
    positions.forEach((p, i) => {
      const title = p.title ? managerText(p.title, { mode }) : p.title
      const jobFamily = p.jobFamily ? managerText(p.jobFamily, { mode }) : p.jobFamily
      if (title === p.title && jobFamily === p.jobFamily) return
      out ??= positions.slice()
      out[i] = { ...p, title, jobFamily }
    })
    hit = out ?? positions
    managerPositions.set(positions, hit)
  }
  return hit
}

const managerReqs = new WeakMap<readonly ReqRow[], readonly ReqRow[]>()

/**
 * The req rows a Manager-mode context reads (M4 recheck EX-3-a): each recruiter, the ATS's one free
 * text column a Manager surface lists (a position card's Reqs, `reqs` records), through
 * `managerText`, as `positionsIn` does for titles. The same array elsewhere and when no row holds an
 * amount (memoized per list). Its stage and type are the ATS's fixed words, and its offer amounts are
 * pay columns no Manager surface shows.
 */
function reqsIn(mode: Mode, reqs: readonly ReqRow[]): readonly ReqRow[] {
  if (mode !== 'manager' || !reqs.length) return reqs
  let hit = managerReqs.get(reqs)
  if (!hit) {
    let out: ReqRow[] | null = null
    reqs.forEach((r, i) => {
      const recruiter = r.recruiter ? managerText(r.recruiter, { mode }) : r.recruiter
      if (recruiter === r.recruiter) return
      out ??= reqs.slice()
      out[i] = { ...r, recruiter }
    })
    hit = out ?? reqs
    managerReqs.set(reqs, hit)
  }
  return hit
}

const managerDatasets = new WeakMap<Datasets, Datasets>()

/**
 * The datasets with `positionsIn` and `reqsIn` applied: the same object when nothing changes, and
 * one object per datasets object when something does, so the scope, the position index and every
 * memoized model stay warm across contexts built from the same rows.
 */
function datasetsIn(mode: Mode, data: Datasets): Datasets {
  const positions = positionsIn(mode, data.positions)
  const reqs = reqsIn(mode, data.reqs)
  if (positions === data.positions && reqs === data.reqs) return data
  let hit = managerDatasets.get(data)
  if (!hit || hit.positions !== positions || hit.reqs !== reqs) {
    hit = { ...data, positions: positions as PositionRow[], reqs: reqs as ReqRow[] }
    managerDatasets.set(data, hit)
  }
  return hit
}

export function buildContext(args: {
  data: Partial<Datasets>
  sources: Record<DatasetKey, SourceMeta>
  filters: Filters
  asOfOverride: ISODate | null
  /** The mode (docs/PLAN.md 8.1). */
  mode: Mode
  /** Every mode's Acting as pick (src/access/store.ts); none when not given. */
  actingAs?: ModePicks
  /** The plan state; none when not given. */
  plan?: PlanState | null
  /** The plan versions; the plan state's when not given (none without a plan state). */
  versions?: readonly AnyVersion[]
  /** The audit log; empty when not given. */
  audit?: readonly AuditEntry[]
  /** The version and comparison pickers (`ver` and `vs`); the defaults when not given. */
  picks?: Pick<UrlScope, 'version' | 'compare'>
  /** Holds the filters and datasets inside the mode's scope; none when not given. */
  clamp?: ScopeClamp
  /** "Show pay amounts" (memory only); off when not given. */
  showPay?: boolean
  today?: ISODate
  /** Version records per dataset; tests may leave them out (every dataset is then bronze). */
  datasetVersions?: Partial<Record<DatasetKey, DatasetVersion | null>>
  standard?: DataStandard
  quality?: QualityIndex
  /** The metric dictionary; every metric at its defaults when not given. */
  metrics?: MetricsApi
  /** The saved official lists (Settings > Official lists); none saved when not given. */
  lists?: ListsState
}): AnalyticsContext {
  const { sources, asOfOverride, mode } = args
  const plan = args.plan ?? null
  const versions = versionsIn(mode, args.versions ?? plan?.versions ?? NO_VERSIONS)
  // A dictionary another context worded for its mode is read underneath (contextAs).
  const metrics = metricsUnworded(args.metrics ?? defaultMetrics())
  // Plan state's Working overlay (approvals, seat edits, targets, freezes, Working's assumptions) is
  // laid over the imported rows once, here, before the scope clamp: every view reads one set of rows
  // and none applies the overlay itself (M3, docs/CONTRACTS-M3.md 4). An empty overlay returns the
  // datasets object itself, so memoized models stay warm.
  // In Manager mode, position titles, job families (EX-3) and req recruiters (M4 recheck EX-3-a)
  // read through `managerText`; the lists in force read the rows as imported, as in every other mode.
  const overlaid = withOverlay(withAllDatasets(args.data), plan)
  const all = datasetsIn(mode, overlaid)
  const isSample = Object.values(sources).every((s) => s.kind === 'sample')
  const asOf = contextAsOf({ data: all, sources, asOfOverride, today: args.today })
  const positionIndex = positionIndexOf(all.positions, asOf)
  const atoms = contextAtoms(plan, all.positions, asOf)

  // The mode's scope: the clamp runs again here (defensive: the store's filter guard already
  // clamps), then the filters, then the scope's own narrowing. Without a clamp given, the access
  // layer's: the mode's Acting as pick held over the lists in force (src/access/context.ts).
  const effective = listsInForce(args.lists, overlaid, sources)
  const scopeClamp = args.clamp ?? accessClamp(args.actingAs ?? NO_PICKS, effective)
  const clamp = scopeClamp({ mode, filters: args.filters, all, positionIndex, asOf, atoms })
  const filters = clamp.filters
  const scoped = scopeDatasets(all, filters, positionIndex)
  const data = clamp.narrow ? clamp.narrow(scoped) : scoped
  let names: ReadonlyMap<string, string> | null = null
  const nameOf = (positionId: string) => {
    names ??= holderNames(all.workers, asOf)
    return names.get(positionId)
  }

  // The pickers are never clamped: unknown or cross-year values reset to the defaults.
  const catalog = pickCatalog(versions, asOf)
  const checked = checkPicks(
    {
      ...DEFAULT_SCOPE,
      version: args.picks?.version ?? null,
      compare: args.picks?.compare ?? null,
    },
    catalog,
  )
  const shownId = shownVersion(checked.scope, catalog)?.versionId
  const version = shownId ? (versions.find((v) => v.versionId === shownId) ?? null) : null

  let datasetVersions = args.datasetVersions
  if (!datasetVersions) {
    datasetVersions = datasetVersionsFallback.get(all) ?? {}
    datasetVersionsFallback.set(all, datasetVersions)
  }
  const quality =
    args.quality ??
    qualityFor(all, datasetVersions, asOf, {
      rules: qualityRulesOf(metrics),
      vocab: args.lists ? validationVocab(args.lists, sources, sampleListSource(sources)) : null,
      dataAsOf: contextAsOf({ data: all, sources, asOfOverride: null, today: args.today }),
    })

  const access = accessFor(mode, clamp.scope ?? null, metrics, !!clamp.unset, {
    actingAs: args.actingAs?.[mode] ?? null,
    switchOn: !!args.showPay,
  })
  const ctx: AnalyticsContext = {
    asOf,
    // The shown version's fiscal year: the header and every export name the year the figures use.
    window: periodWindow(filters.period, asOf, {
      customStart: filters.customStart,
      customEnd: filters.customEnd,
      fiscalYear: version?.fiscalYear ?? null,
    }),
    filters,
    scopeLabel: clamp.label ?? scopeLabel(filters, nameOf),
    isCompany: !clamp.scoped && !hasOrgFilter(filters),
    data,
    all,
    positionIndex,
    sources,
    isSample,
    showPay: showPayIn(mode, !!args.showPay),
    showCost: showCostIn(mode, !!args.showPay),
    quality,
    standard: args.standard ?? DEFAULT_STANDARD,
    // The dictionary in the mode's own words (M4 recheck HL-8-a): every definition a tile, figure,
    // card or Settings > Formulas reads names nothing the mode hides; every setting is the same.
    metrics: metricsInMode(metrics, access.can),
    mode,
    access,
    guard: {
      mode: guardModeIn(mode, !!args.showPay),
      rules: costGuardOf(metrics),
      atoms,
    },
    plan,
    audit: args.audit ?? NO_AUDIT,
    versions,
    version,
    picks: { version: checked.scope.version, compare: checked.scope.compare, reset: checked.reset },
    compare: resolveCompare(mode, checked.scope, catalog, versions),
  }
  setContextLists(ctx, effective)
  return ctx
}

/* ───────────── the provider ───────────── */

const Ctx = createContext<AnalyticsContext | null>(null)
const PendingCtx = createContext(false)

export function AnalyticsProvider({
  children,
  mode: givenMode,
  actingAs: givenPicks,
  plan = null,
  versions,
  audit,
  clamp: givenClamp,
  metrics: givenMetrics,
  lists,
}: {
  children: ReactNode
  /** The mode (an off-screen render's own mode); the access layer's mode store when not given. */
  mode?: Mode
  /** Every mode's Acting as pick; the access layer's mode store when not given. */
  actingAs?: ModePicks
  /** The plan state, from the plan store. */
  plan?: PlanState | null
  /** The plan versions; the plan state's when not given. */
  versions?: readonly AnyVersion[]
  /** The audit log, from the plan store. */
  audit?: readonly AuditEntry[]
  /**
   * The mode's scope clamp; the access layer's (`accessClamp` over the picks and the lists in force)
   * when not given. Keep it the same function for the same scope.
   */
  clamp?: ScopeClamp
  /** The metric dictionary with your changes; the defaults when not given. */
  metrics?: MetricsApi
  /** The saved official lists. */
  lists?: ListsState
}) {
  const data = useStore((s) => s.data)
  const sources = useStore((s) => s.sources)
  const filters = useStore((s) => s.filters)
  const asOfOverride = useStore((s) => s.asOfOverride)
  const showPay = useStore((s) => s.showPay)
  const datasetVersions = useStore((s) => s.versions)
  const standard = useStore((s) => s.dataStandard)
  const version = useStore((s) => s.version)
  const compare = useStore((s) => s.compare)
  const storeMode = useMode((s) => s.mode)
  const storePicks = useMode((s) => s.actingAs)
  const mode = givenMode ?? storeMode
  const actingAs = givenPicks ?? storePicks
  const metrics = useMemo(() => givenMetrics ?? defaultMetrics(), [givenMetrics])
  // Layers that don't depend on the filters, so a filter change only rescopes.
  const all = useMemo(() => withAllDatasets(data), [data])
  const effective = useMemo(() => listsInForce(lists, all, sources), [lists, all, sources])
  const clamp = givenClamp ?? accessClamp(actingAs, effective)
  const asOf = useMemo(() => contextAsOf({ data: all, sources, asOfOverride }), [all, sources, asOfOverride])
  const dataAsOf = useMemo(() => contextAsOf({ data: all, sources, asOfOverride: null }), [all, sources])
  const rules = qualityRulesOf(metrics)
  const vocab = lists ? validationVocab(lists, sources, sampleListSource(sources)) : null
  const quality = useMemo(
    () => timed('hcp:quality', () => qualityFor(all, datasetVersions, asOf, { rules, vocab, dataAsOf })),
    [all, datasetVersions, asOf, rules, vocab, dataAsOf],
  )
  const value = useMemo(
    () =>
      timed('hcp:context', () =>
        buildContext({
          data: all,
          sources,
          filters,
          asOfOverride,
          mode,
          actingAs,
          plan,
          versions,
          audit,
          picks: { version, compare },
          clamp,
          showPay,
          datasetVersions,
          standard,
          quality,
          metrics,
          lists,
        }),
      ),
    [
      all,
      sources,
      filters,
      asOfOverride,
      mode,
      actingAs,
      plan,
      versions,
      audit,
      version,
      compare,
      clamp,
      showPay,
      datasetVersions,
      standard,
      quality,
      metrics,
      lists,
    ],
  )
  // A filter, mode or data change recomputes every engine. The new context is built in the
  // background (useDeferredValue) while the page keeps the previous one; `useAnalyticsPending()`
  // is true meanwhile.
  const deferred = useDeferredValue(value)
  return (
    <Ctx value={deferred}>
      <PendingCtx value={deferred !== value}>{children}</PendingCtx>
    </Ctx>
  )
}

/** True while a newer analytics context is being computed and the page still shows the previous one. */
export function useAnalyticsPending(): boolean {
  return use(PendingCtx)
}

/** The analytics context, or null outside a provider (shared pieces that also render alone). */
export function useAnalyticsIfAny(): AnalyticsContext | null {
  return use(Ctx)
}

export function useAnalytics(): AnalyticsContext {
  const v = use(Ctx)
  if (!v) throw new Error('useAnalytics must be used inside <AnalyticsProvider>')
  return v
}
