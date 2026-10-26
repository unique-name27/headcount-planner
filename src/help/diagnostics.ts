/**
 * "Report a problem" (PLAN 14.2; the template app's help/diagnostics.ts): a plain-text summary of
 * where the reader is and how the data is set up, to paste into a message or ticket. It names the
 * mode and the unit (`reportModeLine`), never a person, a position, a request ID, a file name or a
 * value from the data: the leader filter is reported as set or not, the other filters as how many
 * values are picked. It carries no workspace counts (requests, audit entries), since such a count
 * could move with a request the reader cannot see (8.4 rule 6). Pure, so the privacy promise is
 * tested.
 */
import { APP_NAME } from '@/app/brand'
import type { PeriodPreset } from '@/data/fiscal'
import { isRouteView } from '@/data/schema'

export interface DiagnosticDataset {
  label: string
  source: 'sample' | 'upload'
  rows: number
  tier: string
}

export interface DiagnosticInput {
  /** "Mode: HRBP (Silicon Engineering)", "Mode: Manager (manager set, name left out)" (`reportModeLine`). */
  modeLine?: string
  viewLabel: string
  tabLabel: string | null
  /** The route as the address bar shows it, without any record IDs or the scope after "?": "#plan.openings". */
  address: string
  period: { preset: PeriodPreset; label: string }
  /** The version shown and the comparison, as the pickers name them ("FY27 Working", "vs FY27 Budget"). */
  planVersion: string | null
  comparison: string | null
  leaderSet: boolean
  orgFilters: { label: string; count: number }[]
  /** Positions in the mode's scope at the as-of date; null when it cannot be counted. */
  positionsInScope: number | null
  standard: string
  asOf: string
  asOfSource: 'sample' | 'data' | 'set by you'
  datasets: readonly DiagnosticDataset[]
  definitionsChanged: number
  switches: { label: string; on: boolean }[]
  /** "Another tab writes" while this tab is a reader (5.4). */
  readOnly: boolean
  display: string
  storage: string
  /** The app version (`APP_VERSION`). */
  version: string
  browser: string
  windowSize: string
  at: string
  /**
   * Whether the datasets' row counts are given (HR admin, whose Data room shows them). Elsewhere a
   * file's row count is over rows the mode may not see, so the lines give the source and tier only.
   * Given unless false.
   */
  rowsShown?: boolean
}

const count = (n: number): string => n.toLocaleString('en-US')
const plural = (n: number, one: string, many = `${one}s`) => `${count(n)} ${n === 1 ? one : many}`

/** A tab word ("openings"): lower case, so a record ID ("P10234", "R-NG7-0012") never passes for one. */
const WORD = /^[a-z][a-z0-9-]*$/
/** A tab's part ("trade-rates"): lower case words and hyphens. */
const PART = /^[a-z][a-z-]*$/
/** A metric id ("plan.heads.approved"): it names a definition, not a record. */
const METRIC_ID = /^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9]+)+$/
/** A dataset panel address ("positions-raw"). */
const PANEL = /^[a-z]+(-[a-z]+)?$/

/** The Data room's part of an address that names no record, or null to cut it. */
function dataRoomTab(tab: string): string | null {
  const slash = tab.indexOf('/')
  if (slash < 0) return PANEL.test(tab) ? tab : null
  const [sub, item] = [tab.slice(0, slash), tab.slice(slash + 1)]
  if (sub === 'metrics' && METRIC_ID.test(item)) return tab
  if (sub === 'lists' && /^[a-z][a-zA-Z]*$/.test(item)) return tab
  return WORD.test(sub) ? sub : null
}

/**
 * The address with any record identifiers dropped: a view and tab are fine, a tab's part is fine
 * ("finance.assumptions:trade-rates"), a metric id is fine (it names a definition), a dataset panel
 * and a list are fine (they name a dataset or a list); anything else after the tab is cut, and the
 * scope after "?" (leader position IDs, departments, versions) goes first, on every page.
 */
export function safeAddress(hash: string): string {
  const h = hash.startsWith('#') ? hash.slice(1) : hash
  const route = h.split('?')[0]
  const dot = route.indexOf('.')
  const view = dot < 0 ? route : route.slice(0, dot)
  const tab = dot < 0 ? '' : route.slice(dot + 1)
  // Only a page the app has is named; anything else in that place is not one.
  if (!isRouteView(view)) return '#'
  if (!tab) return `#${view}`
  if (view === 'data') {
    const kept = dataRoomTab(tab)
    return kept ? `#data.${kept}` : '#data'
  }
  const at = tab.search(/[:/]/)
  const base = at < 0 ? tab : tab.slice(0, at)
  if (!WORD.test(base)) return `#${view}`
  if (at < 0) return `#${view}.${base}`
  const part = tab.slice(at + 1)
  return tab[at] === ':' && PART.test(part) ? `#${view}.${base}:${part}` : `#${view}.${base}`
}

/** The summary, one fact per line, starting "Headcount Planner problem report". */
export function diagnosticText(d: DiagnosticInput): string {
  const filters = [
    d.leaderSet ? 'leader set (name left out)' : null,
    ...d.orgFilters
      .filter((f) => f.count > 0)
      .map((f) => `${f.label.toLowerCase()}: ${plural(f.count, 'value')}`),
  ].filter(Boolean)
  const rows = d.rowsShown !== false
  const lines = [
    `${APP_NAME} problem report`,
    `Created ${d.at}. No names, position IDs, request IDs, file names or values from the data are included.`,
    '',
    d.modeLine ?? null,
    `Page: ${d.viewLabel}${d.tabLabel ? `, ${d.tabLabel}` : ''} (${d.address})`,
    `Period: ${d.period.label} (${d.period.preset})`,
    d.planVersion ? `Version: ${d.planVersion}` : 'Version: none',
    d.comparison ? `Comparison: ${d.comparison}` : null,
    `Filters: ${filters.length ? filters.join('; ') : 'none'}`,
    d.positionsInScope == null ? null : `Positions in scope: ${count(d.positionsInScope)}`,
    `Data standard: ${d.standard}`,
    `As of: ${d.asOf} (${d.asOfSource})`,
    `Definitions changed from defaults: ${d.definitionsChanged}`,
    `Session switches: ${d.switches.length ? d.switches.map((s) => `${s.label} ${s.on ? 'on' : 'off'}`).join('; ') : 'none'}`,
    `This tab: ${d.readOnly ? 'read only (another tab writes)' : 'writes'}`,
    '',
    rows ? 'Datasets (source, rows, tier):' : 'Datasets (source, tier):',
    ...d.datasets.map((x) =>
      rows
        ? `- ${x.label}: ${x.source}, ${plural(x.rows, 'row')}, ${x.tier}`
        : `- ${x.label}: ${x.source}, ${x.tier}`,
    ),
    '',
    `Display: ${d.display}`,
    `Browser storage: ${d.storage}`,
    `App version: ${d.version}`,
    `Browser: ${d.browser}`,
    `Window: ${d.windowSize}`,
    '',
    'What happened, and what did you expect to see?',
  ]
  return lines.filter((l): l is string => l != null).join('\n')
}
