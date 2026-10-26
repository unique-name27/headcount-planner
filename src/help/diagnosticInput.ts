/**
 * What goes into the "Report a problem" summary, gathered from the analytics context and the
 * settings (the template app's help/diagnosticInput.ts). Only labels, counts and settings: never a
 * name, a position or request ID, a file name or a value from the data. Counts are over what the
 * mode shows (8.4 rule 6), so a report never moves with a record the reader cannot see: positions
 * are counted in the mode's own datasets, and no request, comment or audit entry is counted at all.
 * Pure, so a test can run it on the sample with a leader filter set.
 */
import { reportModeLine } from '@/access/copy'
import { DATA_TABS, VIEW_TABS } from '@/access/ids'
import { S } from '@/access/surfaces'
import { FILTER_DIMENSION_LABELS } from '@/components/filterLabels'
import { type AnalyticsContext, compareDeltaLabel } from '@/data/context'
import { STANDARD_LABEL } from '@/data/quality/tier'
import { DATASET_KEYS, datasetDef, isViewKey, PAGE_LABEL, VIEW_LABEL } from '@/data/schema'
import { buildPositionIndex, type Filters, LIST_DIMENSIONS, PERIOD_LABELS } from '@/data/scope'
import type { HcpState } from '@/data/store'
import { parseDataTab } from '@/views/data/engine/links'
import { type DiagnosticInput, safeAddress } from './diagnostics'
import { APP_VERSION } from './whatsNew'

/** The settings the summary reads. */
export type DiagnosticState = Pick<
  HcpState,
  | 'route'
  | 'dataStandard'
  | 'asOfOverride'
  | 'showPay'
  | 'theme'
  | 'textSize'
  | 'motion'
  | 'storageUnavailable'
  | 'readOnly'
> & { filters: Filters }

/** Facts about the browser, passed in so the builder stays pure. */
export interface DiagnosticEnv {
  hash: string
  browser: string
  windowSize: string
  at: string
  lensOn: boolean
}

const TIER_WORD: Readonly<Record<string, string>> = {
  none: 'no data',
  bronze: 'bronze',
  silver: 'silver',
  gold: 'gold',
}

/** The page and tab as the reader sees them: "Plan", "Openings"; "Data room", "Data quality". */
export function pageLabels(view: string, tab: string): { view: string; tab: string | null } {
  if (view === 'data') {
    const t = parseDataTab(tab).tab
    return { view: PAGE_LABEL.data, tab: DATA_TABS.find((d) => d.key === t)?.label ?? null }
  }
  if (view === 'actions' || view === 'audit') return { view: PAGE_LABEL[view], tab: null }
  if (!isViewKey(view)) return { view: 'Unknown page', tab: null }
  const tabs = VIEW_TABS[view]
  const base = tab.split(/[:/]/)[0]
  const t = tabs.find((x) => x.key === base) ?? tabs[0]
  return { view: VIEW_LABEL[view], tab: tabs.length > 1 ? (t?.label ?? null) : null }
}

/**
 * "Mode: HRBP (Silicon Engineering)" (`reportModeLine`): a business unit is not about a person and is
 * named; a manager or a leader is, and is left out ("manager set, name left out").
 */
export function modeLine(access: AnalyticsContext['access']): string {
  const { mode, scope, unset, actingAs } = access
  if (mode === 'hrbp') {
    const unit = unset ? null : scope?.kind === 'unit' ? scope.unit : (actingAs?.unit ?? null)
    return reportModeLine(mode, unit, !unset && !!unit)
  }
  return reportModeLine(mode, null, !unset && !!actingAs)
}

/** Seats in the mode's own datasets at the as-of date, Eliminated ones left out. */
function positionsIn(ctx: AnalyticsContext): number | null {
  try {
    let n = 0
    for (const r of buildPositionIndex(ctx.data.positions, ctx.asOf).byId.values())
      if (r.status !== 'Eliminated') n++
    return n
  } catch {
    return null
  }
}

export function diagnosticInput(
  ctx: AnalyticsContext,
  s: DiagnosticState,
  env: DiagnosticEnv,
): DiagnosticInput {
  const page = pageLabels(s.route.view, s.route.tab)
  const f = s.filters
  const access = ctx.access
  // Row counts are over every row of a file, rows the mode does not show included: HR admin's only.
  const rowsShown = access.can('page:data')
  return {
    modeLine: modeLine(access),
    viewLabel: page.view,
    tabLabel: page.tab,
    address: safeAddress(env.hash),
    period: { preset: f.period, label: f.period === 'custom' ? ctx.window.label : PERIOD_LABELS[f.period] },
    planVersion: ctx.version?.name ?? null,
    comparison: ctx.version ? compareDeltaLabel(ctx.compare) : null,
    leaderSet: !!f.leaderId,
    orgFilters: LIST_DIMENSIONS.map((d) => ({ label: FILTER_DIMENSION_LABELS[d], count: f[d].length })),
    positionsInScope: positionsIn(ctx),
    standard: STANDARD_LABEL[s.dataStandard] ?? s.dataStandard,
    asOf: ctx.asOf,
    asOfSource: s.asOfOverride ? 'set by you' : ctx.isSample ? 'sample' : 'data',
    // Only the datasets this mode reads.
    datasets: DATASET_KEYS.filter((k) => access.can(S.dataset(k))).map((k) => {
      const tier = ctx.quality.datasetTier(k)
      return {
        label: datasetDef(k).label,
        source: ctx.sources[k]?.kind === 'upload' ? ('upload' as const) : ('sample' as const),
        rows: rowsShown ? (ctx.sources[k]?.rowCount ?? 0) : 0,
        tier: TIER_WORD[tier] ?? tier,
      }
    }),
    rowsShown,
    definitionsChanged: ctx.metrics.changedCount,
    switches: [
      ...(access.can('pay:switch') ? [{ label: 'pay amounts', on: s.showPay }] : []),
      { label: 'show data quality', on: env.lensOn },
    ],
    readOnly: s.readOnly,
    display: `theme ${s.theme}, text size ${s.textSize}, motion ${s.motion}`,
    storage: s.storageUnavailable ? 'did not open at start-up (showing the sample)' : 'available',
    version: APP_VERSION,
    browser: env.browser,
    windowSize: env.windowSize,
    at: env.at,
  }
}
