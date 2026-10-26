/**
 * Labels the shell stamps on screens and exports (the template app's exportMeta.ts, with HCP's plan
 * facts): the company line, dataset provenance, the `ExportMeta` header for workbooks and decks with
 * its plan header (docs/PLAN.md 14.1 item 1: version and state, lock hash, comparison, proration,
 * rate set, cost definition, filters, rounding), and the mode an off-screen export renders in. Pure.
 */
import type { AccessContext, AccessInput } from '@/access/context'
import { NO_PICKS } from '@/access/modes'
import type { ExportMeta, PlanHeader } from '@/charts/types'
import { type AnalyticsContext, compareDeltaLabel } from '@/data/context'
import type { DataStandard } from '@/data/quality/tier'
import { DATASET_KEYS, type DatasetKey, datasetDef, type Mode } from '@/data/schema'
import { holderNames, scopeLabel, type Window } from '@/data/scope'
import type { SourceMeta } from '@/data/store'
import { MANAGER_FACTS } from '@/lib/export/exportHeader'
import { withoutDataContext } from '@/lib/export/names'
import { fmt } from '@/lib/format'
import type { AnyVersion, AssumptionRow, FxTable } from '@/plan/types'

/** The company line in the masthead: the sample company, or the user's own data. */
export function companyLine(isSample: boolean, sampleCompany: string): string {
  return isSample ? sampleCompany : 'Your data'
}

/** How many datasets were uploaded rather than sample, out of all of them. */
export function uploadedCount(sources: Record<DatasetKey, SourceMeta>): { uploaded: number; total: number } {
  return {
    uploaded: DATASET_KEYS.filter((k) => sources[k]?.kind === 'upload').length,
    total: DATASET_KEYS.length,
  }
}

export interface DatasetProvenance {
  key: DatasetKey
  label: string
  kind: SourceMeta['kind']
  rowCount: number
  fileName?: string
}

export interface DatasetNote {
  /** "Sample data" or "Uploaded 2 of 3 datasets". */
  text: string
  allSample: boolean
  datasets: DatasetProvenance[]
}

/** Where the datasets a view reads came from. */
export function datasetNote(
  keys: readonly DatasetKey[],
  sources: Record<DatasetKey, SourceMeta>,
): DatasetNote {
  const datasets = keys.map((key) => {
    const s = sources[key]
    return {
      key,
      label: datasetDef(key).label,
      kind: s?.kind ?? 'sample',
      rowCount: s?.rowCount ?? 0,
      ...(s?.fileName ? { fileName: s.fileName } : {}),
    }
  })
  const uploaded = datasets.filter((d) => d.kind === 'upload').length
  return {
    text: uploaded ? `Uploaded ${uploaded} of ${datasets.length} datasets` : 'Sample data',
    allSample: uploaded === 0,
    datasets,
  }
}

/** The sub-tab to show: the requested one when the view has it, else the view's first tab. */
export function resolveTab(tabs: readonly { key: string }[], requested: string): string {
  return tabs.some((t) => t.key === requested) ? requested : (tabs[0]?.key ?? '')
}

/** Context stamped on every export from a view. */
export function buildExportMeta(args: {
  viewLabel: string
  viewKey?: string
  tabLabel?: string
  scopeLabel: string
  window: Window
  asOf: string
  isSample: boolean
  sampleCompany: string
  /** The data standard in force, stated on every sheet and slide. */
  standard?: DataStandard
  /** False for a page that reads no datasets: no scope, window, as-of or standard lines. */
  readsData?: boolean
  /** The mode line (`modeMeta`: "Made in HRBP mode for Silicon Engineering."). */
  modeLine?: string
  /** The mode's cost line (`modeMeta`). */
  costLine?: string
  /** The plan facts (`planHeaderOf`). */
  plan?: PlanHeader
  /** The mode the export is for (free text through `managerText` in Manager mode, docs/PLAN.md 14.1 item 8). */
  mode?: Mode
}): ExportMeta {
  const meta: ExportMeta = {
    view: args.viewLabel,
    ...(args.viewKey ? { viewKey: args.viewKey } : {}),
    ...(args.tabLabel ? { tab: args.tabLabel } : {}),
    scope: args.scopeLabel,
    window: args.window.label,
    // ISO, like the per-figure meta; the export library formats it for title rows and file names.
    asOf: args.asOf,
    isSample: args.isSample,
    company: args.isSample ? args.sampleCompany : 'Company data',
    ...(args.standard && { standard: args.standard }),
    ...(args.modeLine && { modeLine: args.modeLine }),
    ...(args.costLine && { costLine: args.costLine }),
    ...(args.plan && { plan: args.plan }),
    ...(args.mode && { mode: args.mode }),
  }
  if (args.readsData !== false) return meta
  const { plan: _plan, ...rest } = withoutDataContext(meta)
  return rest
}

/* ───────────── the plan header (docs/PLAN.md 14.1 item 1) ───────────── */

/** The cost definition every output states. */
export const COST_DEFINITION = 'Loaded cost: base + bonus + burden + benefits + one-time, USD'

/** The rate set the forecast's exports state (docs/PLAN.md 14.1 item 1). */
export const FORECAST_RATES = 'Actual for closed months, forecast for open'

/** The views whose figures read the forecast (actual for closed months, forecast for open). */
const FORECAST_VIEWS: ReadonlySet<string> = new Set(['forecast'])

/** What rounding the mode's amounts carry, in words, with the minimum in force. */
export function roundingLine(guard: Pick<AnalyticsContext['guard'], 'mode' | 'rules'>): string {
  switch (guard.mode) {
    case 'exact':
      return `Exact for groups of ${fmt(guard.rules.minCosted, 'int')} or more`
    case 'rounded':
      return `Rounded down to ${fmt(guard.rules.floorUsd, 'moneyM')} per team`
    case 'open':
      return 'None: HR admin with pay amounts shown'
    case 'none':
      return 'No amounts'
  }
}

/**
 * A rate in the header: "1.08", "0.27", up to 4 decimals, trailing zeros dropped; a rate under 0.1
 * keeps 4 significant digits ("VND 0.00003968"), so no currency's rate reads as 0.
 */
export const rateText = (r: number): string =>
  String(Number(Math.abs(r) >= 0.1 ? r.toFixed(4) : r.toPrecision(4)))

/** The version's plan rates for one month: its own table when locked, else its assumption rows. */
function planRates(
  version: AnyVersion,
  assumptions: readonly AssumptionRow[],
): { currency: string; rate: number }[] {
  const month = version.grid.from
  const out = new Map<string, number>()
  const table: FxTable | null = version.state === 'locked' && 'rates' in version ? version.rates : null
  if (table) {
    for (const r of table)
      if (r.set === 'plan' && r.month === month && r.currency !== 'USD') out.set(r.currency, r.usdPerLocal)
  } else {
    for (const a of assumptions) {
      if (a.table !== 'fx' || (a.version !== version.versionId && a.version !== version.name)) continue
      const [currency, set, m] = a.key.split('|')
      if (!currency || currency === 'USD' || set !== 'plan' || m !== month) continue
      if (Number.isFinite(a.value)) out.set(currency, a.value)
    }
  }
  return [...out].sort((a, b) => a[0].localeCompare(b[0])).map(([currency, rate]) => ({ currency, rate }))
}

/** "Plan rates (EUR 1.08, ILS 0.27)"; "Plan rates" when the version holds none. */
export function ratesLine(version: AnyVersion | null, assumptions: readonly AssumptionRow[]): string {
  if (!version) return 'Plan rates'
  const rates = planRates(version, assumptions)
  if (!rates.length) return 'Plan rates'
  return `Plan rates (${rates.map((r) => `${r.currency} ${rateText(r.rate)}`).join(', ')})`
}

/**
 * The plan facts for the context on screen: the version shown and its state, its lock hash, the
 * comparison, the proration, the plan rates (the forecast's views: "Actual for closed months,
 * forecast for open"), the cost definition, the filters in words and the rounding the mode's guard
 * applies. Manager mode states all nine facts too (the spec's header list, M4 review SB-4), its
 * rates, cost definition and rounding in amount-free words (`MANAGER_FACTS`: "Not used: no amounts
 * in Manager mode", "Heads and FTE only", "No amounts"), since its outputs hold no currency code or
 * amount (docs/PLAN.md 7.6). Version names come through the context, which reads them through
 * `managerText` in Manager mode.
 */
export function planHeaderOf(
  ctx: Pick<AnalyticsContext, 'version' | 'compare' | 'filters' | 'window' | 'guard' | 'all'> &
    Partial<Pick<AnalyticsContext, 'access' | 'asOf'>>,
  view?: string,
): PlanHeader {
  const v = ctx.version
  const amounts = ctx.guard.mode !== 'none'
  return {
    version: v?.name ?? 'No version',
    versionState: v?.state ?? 'working',
    lockHash: v?.state === 'locked' ? (v.hash ?? null) : null,
    comparison: compareDeltaLabel(ctx.compare),
    proration: v?.proration ?? 'daily',
    rates: amounts
      ? view && FORECAST_VIEWS.has(view)
        ? FORECAST_RATES
        : ratesLine(v, ctx.all.assumptions)
      : MANAGER_FACTS.Rates,
    costDefinition: amounts ? COST_DEFINITION : MANAGER_FACTS.Cost,
    filters: `${filtersText(ctx)}; period: ${ctx.window.name}`,
    rounding: amounts ? roundingLine(ctx.guard) : MANAGER_FACTS.Rounding,
  }
}

const namesMemo = new WeakMap<readonly unknown[], Map<string, ReadonlyMap<string, string>>>()

/**
 * The Filters fact in words (M4 review CP-10): the leader filter named by the scope's own label
 * where it is the Acting as person's tree ("Sebastian Wagner's team", as the mode line names it),
 * else by the seat's holder on the as-of date ("Dana Ito's org"), never by a position ID while a name
 * is known; the other filters as `scopeLabel` words them.
 */
function filtersText(
  ctx: Pick<AnalyticsContext, 'filters' | 'all'> & Partial<Pick<AnalyticsContext, 'access' | 'asOf'>>,
): string {
  const leader = ctx.filters.leaderId
  if (!leader) return scopeLabel(ctx.filters)
  const scope = ctx.access?.scope
  const tree = scope?.kind === 'tree' ? scope : null
  let names: ReadonlyMap<string, string> | null = null
  if (ctx.asOf) {
    let byDate = namesMemo.get(ctx.all.workers)
    if (!byDate) {
      byDate = new Map()
      namesMemo.set(ctx.all.workers, byDate)
    }
    names = byDate.get(ctx.asOf) ?? null
    if (!names) {
      names = holderNames(ctx.all.workers, ctx.asOf)
      byDate.set(ctx.asOf, names)
    }
  }
  return scopeLabel(
    ctx.filters,
    (id) => names?.get(id),
    (id) => (tree?.rootPositionIds.has(id) && tree.label ? tree.label : null),
  )
}

const headers = new WeakMap<object, Map<string, PlanHeader>>()

/** `planHeaderOf`, once per context and view (figures ask for it on every render). */
export function planHeaderFor(
  ctx: Pick<AnalyticsContext, 'version' | 'compare' | 'filters' | 'window' | 'guard' | 'all'>,
  view?: string,
): PlanHeader {
  let byView = headers.get(ctx)
  if (!byView) {
    byView = new Map()
    headers.set(ctx, byView)
  }
  const key = view ?? ''
  let hit = byView.get(key)
  if (!hit) {
    hit = planHeaderOf(ctx, view)
    byView.set(key, hit)
  }
  return hit
}

/* ───────────── the mode an off-screen render is in ───────────── */

/**
 * The mode, pick and switch that rebuild this access context in an off-screen render (a whole-view
 * export lays the other tabs out in the same mode and scope): the mode's own Acting as pick, kept
 * even when it is gone from the data, so the render holds nobody too.
 */
export function accessInputOf(access: Pick<AccessContext, 'mode' | 'actingAs' | 'switchOn'>): AccessInput {
  return {
    mode: access.mode,
    picks: { ...NO_PICKS, [access.mode]: access.actingAs },
    switchOn: access.switchOn,
  }
}
