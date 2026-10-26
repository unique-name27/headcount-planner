/**
 * The allowlist engine (docs/PLAN.md 8.3; the template app's table.ts): `decideTable(policy, surface,
 * at, info)` answers a surface from one mode's table, hidden by default.
 *
 * - An exact entry in `surfaces` wins; an `action:` surface reads `actions`.
 * - Views and pages come from `views`, tabs from `tabs` (a missing tab is hidden).
 * - A figure is hidden when on `hiddenFigures` or `hiddenFigurePrefixes`, when its id starts with a
 *   hidden view's or page's key ("forecast-…"), when it is another mode's home figure, or when its
 *   tab is hidden; otherwise it takes its tab's decision.
 * - A metric is hidden when outside `metrics.allow` (when set), on `hidePrefixes` or `hide`, or
 *   when none of the views it is listed on is shown.
 * - Drill kinds, datasets, help articles and tours from their lists; Action center items by
 *   `hiddenItemPrefixes`; a view's header actions follow the view; the Data room's tabs follow the
 *   Data room page.
 * - A column of a drill kind's records (`column:reqs.offerBase`) follows its kind, and is hidden
 *   when on `hiddenColumns` (its how is the `surfaces` entry, which wins).
 *
 * Every limited or hidden default says how, worded for the mode. Pure; the per-table sets are built
 * once per table object.
 */
import { PAGE_KEYS } from '@/data/schema'
import type { ActionId } from '../ids'
import { isOtherHomeFigure, MODE_NAME } from '../modes'
import { kindOf, restOf } from '../surfaces'
import {
  type At,
  type DecideInfo,
  type Decision,
  hidden,
  type PolicyPlace,
  type RolePolicy,
  type RoleTab,
  SHOWN,
} from './types'

/** A tab key without the colon or slash parts some addresses carry ("assumptions:trade-rates"). */
export const baseTab = (t: string): string => t.split(/[:/]/)[0]

/** Pages reached from the masthead; their surface is `page:<key>`. */
export const PAGE_KEY_SET: ReadonlySet<string> = new Set(PAGE_KEYS)

interface Compiled {
  name: string
  notNamed: Decision
  nA: Decision
  figures: ReadonlySet<string>
  metrics: ReadonlySet<string>
  drills: ReadonlySet<string>
  /** Columns left out of their records (`'reqs.offerBase'`). */
  columns: ReadonlySet<string>
  datasets: ReadonlySet<string>
  /** Hidden views' and pages' figure prefixes ("forecast-"). */
  placePrefixes: readonly string[]
}

const compiled = new WeakMap<RolePolicy, Compiled>()

function compile(p: RolePolicy): Compiled {
  const hit = compiled.get(p)
  if (hit) return hit
  const name = `${MODE_NAME[p.mode]} mode`
  const c: Compiled = {
    name,
    notNamed: hidden(`Not named by the ${name} policy.`),
    nA: hidden(`Its view is not shown in ${name}.`),
    figures: new Set(p.hiddenFigures),
    metrics: new Set(p.metrics.hide),
    drills: new Set(p.drillKinds),
    columns: new Set(p.hiddenColumns ?? []),
    datasets: new Set(p.datasets),
    placePrefixes: Object.entries(p.views)
      .filter(([, d]) => d.access === 'hidden')
      .map(([k]) => `${k}-`),
  }
  compiled.set(p, c)
  return c
}

/** The sentence a table gives a surface it does not name. */
export const notNamedOf = (p: RolePolicy): Decision => compile(p).notNamed

/** The decision for a view or page key (a missing one is hidden). */
export function tablePlace(p: RolePolicy, view: string): Decision {
  return p.views[view as PolicyPlace] ?? compile(p).notNamed
}

/** The decision for a tab of a view (an empty tab: the view's first tab). */
export function tableTab(p: RolePolicy, view: string, t: string): Decision {
  const c = compile(p)
  const v = tablePlace(p, view)
  if (v.access === 'hidden') return c.nA
  const tabs = p.tabs[view as PolicyPlace]
  // Pages without a tab table (the Action center, Audit) take the page's decision.
  if (!tabs) return v
  if (!t) return tabs[0]?.decision ?? v
  // A part of a tab picked in its address (`assumptions:trade-rates`) has its own decision.
  const part = t.includes(':') ? p.surfaces[`tab:${view}.${t}`] : undefined
  if (part) return part
  return tabs.find((x) => x.key === baseTab(t))?.decision ?? c.notNamed
}

/** The first tab of a view the table shows (null when the view is hidden or has no tab table). */
export function tableFirstTab(p: RolePolicy, view: string): RoleTab | null {
  return p.tabs[view as PolicyPlace]?.find((t) => t.decision.access !== 'hidden') ?? null
}

/** Whether a metric id is on the table's hide lists or outside its allowlist (by id or prefix). */
export function tableHidesMetricId(p: RolePolicy, id: string): boolean {
  if (p.metrics.allow && !p.metrics.allow.some((a) => id.startsWith(a))) return true
  return compile(p).metrics.has(id) || p.metrics.hidePrefixes.some((x) => id.startsWith(x))
}

function placeOf(p: RolePolicy, at: At): Decision {
  return at.tab != null ? tableTab(p, at.view, at.tab) : tablePlace(p, at.view)
}

function tableFigure(p: RolePolicy, id: string, at?: At): Decision {
  const c = compile(p)
  if (c.figures.has(id)) return hidden(`On the ${c.name} figure list.`)
  if (p.hiddenFigurePrefixes.some((x) => id.startsWith(x)))
    return hidden(`Its figures are not shown in ${c.name}.`)
  if (c.placePrefixes.some((x) => id.startsWith(x))) return c.nA
  if (isOtherHomeFigure(p.mode, id)) return hidden("Another mode's home.")
  if (!at) return SHOWN
  const d = placeOf(p, at)
  return d.access === 'hidden' ? hidden(`Its tab is not shown in ${c.name}.`) : d
}

function tableMetric(p: RolePolicy, id: string, info?: DecideInfo): Decision {
  const c = compile(p)
  if (p.metrics.allow && !p.metrics.allow.some((a) => id.startsWith(a)))
    return hidden(`Outside the ${c.name} metric list.`)
  if (c.metrics.has(id) || p.metrics.hidePrefixes.some((x) => id.startsWith(x)))
    return hidden(`On the ${c.name} metric list.`)
  const views = info?.metricViews?.(id)
  if (views?.length && !views.some((v) => tablePlace(p, v).access !== 'hidden'))
    return hidden(`None of the views it is on is shown in ${c.name}.`)
  return SHOWN
}

/** Shown, limited or hidden for a surface in one mode's table. */
export function decideTable(p: RolePolicy, s: string, at?: At, info?: DecideInfo): Decision {
  const exact = p.surfaces[s]
  if (exact) return exact
  const c = compile(p)
  const kind = kindOf(s)
  const rest = restOf(s)
  switch (kind) {
    case 'action':
      return (p.actions as Partial<Record<string, Decision>>)[rest as ActionId] ?? c.notNamed
    case 'view':
      return tablePlace(p, rest)
    case 'tab': {
      const dot = rest.indexOf('.')
      return dot < 0 ? tableTab(p, rest, '') : tableTab(p, rest.slice(0, dot), rest.slice(dot + 1))
    }
    case 'figure':
      return tableFigure(p, rest, at)
    case 'metric':
      return tableMetric(p, rest, info)
    case 'kpi': {
      if (info?.metric) return tableMetric(p, info.metric, info)
      const place = at ? placeOf(p, at) : SHOWN
      return place.access === 'hidden' ? hidden(`Its tab is not shown in ${c.name}.`) : SHOWN
    }
    case 'page':
      return tablePlace(p, rest)
    case 'data':
      return tablePlace(p, 'data').access === 'hidden'
        ? hidden(`The Data room is not shown in ${c.name}.`)
        : SHOWN
    case 'drill':
      return c.drills.has(rest) ? p.drillListed : hidden(`These records are not shown in ${c.name}.`)
    case 'column': {
      // A column follows its records; a listed column is left out of them.
      const dk = rest.slice(0, rest.indexOf('.'))
      if (!c.drills.has(dk)) return hidden(`These records are not shown in ${c.name}.`)
      return c.columns.has(rest) ? hidden(`Left out of these records in ${c.name}.`) : SHOWN
    }
    case 'dataset':
      return c.datasets.has(rest) ? SHOWN : hidden(`Not one of the datasets ${c.name} reads.`)
    case 'help': {
      if (rest.startsWith('article:')) return p.articles[rest.slice(8)] ?? hidden(`Not shown in ${c.name}.`)
      if (rest.startsWith('tour:')) return p.tours[rest.slice(5)] ?? hidden(`Not shown in ${c.name}.`)
      return c.notNamed
    }
    case 'item': {
      const prefix = p.hiddenItemPrefixes.find((x) => rest.startsWith(x))
      if (prefix === undefined) return SHOWN
      return p.surfaces[`item:${prefix}`] ?? hidden(`Left out in ${c.name}.`)
    }
    case 'header':
      // A view's own header actions follow the view (the ones a mode hides are in `surfaces`).
      if (!p.views[rest as PolicyPlace]) return c.notNamed
      return tablePlace(p, rest).access === 'hidden' ? c.nA : SHOWN
    default:
      return c.notNamed
  }
}
