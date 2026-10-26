/**
 * Building blocks for the five mode tables (docs/PLAN.md 8.3; the template app's kit.ts): every
 * view's tabs in folder order (`tabTable`), the frame every mode shares (masthead, page header,
 * settings, help, filter row, exports that are not actions, focus, shortcuts, shared ui parts, and
 * the pay, leave and cost surfaces from the mode's pay and leave views), the metric hide lists with a
 * sentence on each id, and the column lists. Each limited or hidden decision carries its plain
 * sentence. The tables in manager.ts, hrbp.ts, leader.ts, finance.ts and admin.ts start from these
 * and name what differs, so every table is still plain data.
 *
 * The policy never imports the view registry: the tab lists come from ../ids.ts `VIEW_TABS`, which a
 * test keeps equal to the registry's. Pure.
 */
import { FINANCE_FILTER_NOTE, ROUNDED_PERIOD_NOTE } from '@/cost/fit'
import { DATASET_KEYS, type DatasetKey, type ViewKey } from '@/data/schema'
import type { FilterDimension } from '@/data/scope'
import {
  DRILL_KINDS,
  type DrillKind,
  FILTER_CONTROLS,
  FOCUS_PARTS,
  METRIC_IDS,
  SETTINGS_SURFACES,
  SHORTCUT_KEYS,
  VIEW_TABS,
} from '../ids'
import { leaveDecisions } from '../leave'
import { FILTER_DIMS_OF, HOME_LABEL, MODE_NAME, type Mode } from '../modes'
import { costDecisions, PAY_OF, payDecisions } from '../pay'
import type { FilterControl } from '../surfaces'
import { type Decision, hidden, limited, type PolicyPlace, type RoleTab, SHOWN } from './types'

/* ───────────── views and tabs ───────────── */

/** Tabs a table names, by view: the decision for each tab that is not plainly shown. */
export type NamedTabs = Partial<Record<ViewKey, Readonly<Record<string, Decision>>>>

/**
 * The tab table for a mode: every tab of every view it shows, in order. A tab takes `named`'s
 * decision, else shown (with `inherit`, its view's decision: 8.3's "(all tabs)"). A named tab the
 * view does not have throws, so a typo fails at load.
 */
export function tabTable(
  views: Readonly<Record<PolicyPlace, Decision>>,
  named: NamedTabs = {},
  opts: { inherit?: boolean } = {},
): Partial<Record<PolicyPlace, readonly RoleTab[]>> {
  const out: Partial<Record<PolicyPlace, readonly RoleTab[]>> = {}
  for (const [view, defs] of Object.entries(VIEW_TABS) as [ViewKey, (typeof VIEW_TABS)[ViewKey]][]) {
    const given = named[view] ?? {}
    for (const k of Object.keys(given))
      if (!defs.some((d) => d.key === k)) throw new Error(`No tab ${view}.${k}`)
    const v = views[view]
    if (v.access === 'hidden') continue
    const fallback = opts.inherit ? v : SHOWN
    out[view] = defs.map((d) => ({ key: d.key, label: d.label, decision: given[d.key] ?? fallback }))
  }
  return out
}

/* ───────────── shared sentences ───────────── */

/** "HRBP mode", "HR admin mode". */
export const modeWords = (mode: Mode): string => `${MODE_NAME[mode]} mode`

/** "unit, cost center and currency". */
export function listWords(items: readonly string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`
}

export const TEAM_HOW = 'My team is the Manager mode home.'
export const DATA_ROOM_HOW = "The Data room is HR admin's."
export const AS_OF_HOW = 'The as-of date is set by HR admin.'
/** Plan > Positions outside Manager and HR admin (8.3). */
export const POSITIONS_BAND =
  'Band estimates for Open and Planned seats; nothing tied to a filled seat or an offer.'
/** Forecast (all tabs) in HRBP and Leader mode (8.3). */
export const FORECAST_ROUNDED =
  'Cost rounded down to $0.1M per team, at QTD, YTD and full year. Monthly cost shows as heads; exit run rate and cost incl. SBC show in Finance mode.'
export const FINANCE_OWN =
  "Finance settings are Finance's. Leaders compare versions with the comparison picker."
export const ACTIONS_SCOPED = 'Items about your team, unit or org.'
export const AUDIT_LIMITED =
  "Your unit, org or the company; pay and cost changes read 'changed'; the chain check shows in HR admin."

/* ───────────── metrics ───────────── */

/** One rule of a mode's metric hide list: a metric id or an id prefix ending in "." , and why. */
export interface MetricHide {
  match: string
  how: string
}

/**
 * A metric hide list as a table holds it: the prefixes and ids, and an exact `metric:<id>` decision
 * with its sentence for every catalog id a rule matches (the first rule wins), so the matrix shows
 * each hidden metric with its reason.
 */
export function metricHides(rules: readonly MetricHide[]): {
  hidePrefixes: string[]
  hide: string[]
  surfaces: Record<string, Decision>
} {
  const hidePrefixes: string[] = []
  const hide: string[] = []
  for (const r of rules) (r.match.endsWith('.') ? hidePrefixes : hide).push(r.match)
  const surfaces: Record<string, Decision> = {}
  for (const id of METRIC_IDS) {
    const r = rules.find((x) => (x.match.endsWith('.') ? id.startsWith(x.match) : id === x.match))
    if (r) surfaces[`metric:${id}`] = hidden(r.how)
  }
  return { hidePrefixes, hide, surfaces }
}

/** The Data room's own metrics (`data.`) are HR admin's, with their page. */
export const DATA_METRICS_HIDE: MetricHide = { match: 'data.', how: DATA_ROOM_HOW }

/* ───────────── kinds, datasets and columns ───────────── */

/** Every drill kind (../ids.ts `DRILL_KINDS`). */
export const ALL_DRILL_KINDS: readonly DrillKind[] = DRILL_KINDS
/** Every dataset. */
export const ALL_DATASETS: readonly DatasetKey[] = DATASET_KEYS

/** One decision for each of a list of columns (`'reqs.offerBase'` → `column:reqs.offerBase`). */
export const columnSurfaces = (columns: readonly string[], d: Decision): Record<string, Decision> =>
  Object.fromEntries(columns.map((c) => [`column:${c}`, d]))

/* ───────────── the frame ───────────── */

const DIM_WORD: Readonly<Record<FilterDimension, string>> = {
  leaderId: 'leader',
  businessUnit: 'unit',
  department: 'department',
  costCenter: 'cost center',
  location: 'location',
  level: 'level',
  legalEntity: 'legal entity',
  country: 'country',
  currency: 'currency',
}

export interface FrameSpec {
  mode: Mode
  views: Readonly<Record<PolicyPlace, Decision>>
  /**
   * For the scoped modes: the scope in words ("your team", "your business unit", "your org") and how
   * the Mode button reads ('Reads "Manager:" and the name you act as.').
   */
  scope?: { words: string; button: string }
  /** HR admin: the Data room, the lists, settings files and Edit definition. */
  owner?: boolean
  /** The filter row's controls as the mode decides them (the rest: from `FILTER_DIMS_OF`, else shown). */
  filters?: Partial<Record<FilterControl, Decision>>
  /** The Report a problem line, in a sentence. */
  report?: Decision
}

/**
 * Every surface a mode decides beyond views, tabs, metrics, figures, kinds, datasets, help articles,
 * tours and actions, with the defaults the modes share. Scoped modes get "inside <scope>"; the owner
 * (HR admin) gets the Data room's tools. Tables spread this and override what differs.
 */
export function frameSurfaces(s: FrameSpec): Record<string, Decision> {
  const name = modeWords(s.mode)
  const sc = s.scope
  const owner = !!s.owner
  const sw = PAY_OF[s.mode] === 'switch'
  const pay = payDecisions(s.mode)
  const auditShown = s.views.audit.access !== 'hidden'
  const offered = new Set<FilterDimension>(FILTER_DIMS_OF[s.mode])
  const offeredWords = listWords(FILTER_DIMS_OF[s.mode].map((d) => DIM_WORD[d]))
  const filters: Record<string, Decision> = {}
  for (const c of FILTER_CONTROLS) {
    const given = s.filters?.[c]
    if (given) filters[`filter:${c}`] = given
    else if (c in DIM_WORD && !offered.has(c as FilterDimension))
      filters[`filter:${c}`] = hidden(`${name} filters by ${offeredWords}.`)
    else filters[`filter:${c}`] = SHOWN
  }
  const focus: Record<string, Decision> = {}
  for (const f of FOCUS_PARTS)
    focus[`focus:${f}`] = sc ? limited(`Offered only when the result stays inside ${sc.words}.`) : SHOWN
  const shortcuts: Record<string, Decision> = {}
  for (const k of SHORTCUT_KEYS)
    shortcuts[`shortcut:${k}`] =
      k === 'tabs' && !owner ? limited('Arrows move over the shown tabs only.') : SHOWN
  const settings: Record<string, Decision> = {}
  for (const id of SETTINGS_SURFACES) settings[id] = SHOWN
  return {
    // Masthead and page frame
    'masthead:wordmark': owner ? SHOWN : limited(`Goes to ${HOME_LABEL[s.mode]}.`),
    'masthead:company': SHOWN,
    'masthead:mode': sc ? limited(sc.button) : SHOWN,
    'masthead:pay-tags': sw
      ? limited('Shows while Show pay amounts is on.')
      : hidden('This mode has no Show pay amounts switch.'),
    'masthead:read-only': SHOWN,
    'masthead:actions': owner ? SHOWN : limited("Counts this mode's Needs attention items."),
    'masthead:audit': !auditShown
      ? hidden(s.views.audit.how ?? `Audit is not shown in ${name}.`)
      : owner
        ? SHOWN
        : limited('Opens the entries this mode shows.'),
    'masthead:data': owner ? SHOWN : hidden(DATA_ROOM_HOW),
    'masthead:workspace': owner ? SHOWN : limited('Lists only the files this mode saves and opens.'),
    'masthead:settings': owner ? SHOWN : limited('Lists only the sections shown in this mode.'),
    'masthead:help': owner ? SHOWN : limited('Lists only the articles and tours shown in this mode.'),
    'masthead:skip': SHOWN,
    'header:scope': sc ? limited(`The scope line names ${sc.words}.`) : SHOWN,
    'header:about': owner ? SHOWN : limited("Follows the view's article."),
    // Shared parts
    'ui:trade-weights': SHOWN,
    'ui:tier-badge': owner ? SHOWN : limited('Glyph, word and hover explanation; not a button.'),
    'ui:edit-definition': owner ? SHOWN : hidden('The metric dictionary is in the Data room.'),
    'ui:route-link': owner ? SHOWN : limited('A link to a page this mode hides reads as plain text.'),
    'ui:attention-lists': owner
      ? hidden('HR admin lists every open item; the two lists are for the role modes.')
      : SHOWN,
    'ui:kpi-delta-company': sc
      ? hidden("A company comparison opens no records: the company's records are not listed.")
      : SHOWN,
    // Help
    'help:learn-more': owner ? SHOWN : limited('Shown when its article is shown in this mode.'),
    'help:search': owner ? SHOWN : limited('Covers the shown articles and the glossary of shown metrics.'),
    'help:shortcuts': SHOWN,
    'help:report': s.report ?? SHOWN,
    'help:whats-new': SHOWN,
    'help:links': owner ? SHOWN : limited('Links to hidden targets read as plain text.'),
    // Settings
    ...settings,
    'settings:data': owner ? SHOWN : hidden(AS_OF_HOW),
    'settings:formulas': owner
      ? SHOWN
      : limited('Metrics of the shown views only, without links to Metric definitions.'),
    'settings:lists': owner ? SHOWN : hidden('The official lists are kept by HR admin.'),
    'settings:privacy': sw
      ? SHOWN
      : hidden(pay['pay:switch'].how ?? 'This mode has no Show pay amounts switch.'),
    'settings:device': owner ? SHOWN : limited('Clear everything only; settings files are hidden.'),
    'settings:device-files': owner
      ? SHOWN
      : hidden('Settings files carry team configuration, kept by HR admin.'),
    // Filter row
    ...filters,
    // Exports that are not actions
    'export:link': SHOWN,
    'export:records': sc ? limited('The rows the panel lists.') : SHOWN,
    'export:action-list': SHOWN,
    'export:data-room': owner ? SHOWN : hidden(DATA_ROOM_HOW),
    'export:formulas': owner ? SHOWN : limited('The shown metrics only.'),
    // Filter to, Leave out, findings
    ...focus,
    ...shortcuts,
    // Money, leave and cost (8.3)
    ...pay,
    ...leaveDecisions(s.mode),
    ...costDecisions(s.mode),
  }
}

/** HRBP and Leader: cost shows for whole teams at QTD, YTD and full year (the period control). */
export const ROUNDED_PERIOD = limited(ROUNDED_PERIOD_NOTE)
/** Finance's kept filter dimensions: include only, one cost dimension at a time. */
export const FINANCE_DIMENSION = limited(`Include only. ${FINANCE_FILTER_NOTE}`)
