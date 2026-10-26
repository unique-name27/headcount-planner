/**
 * A metric's words in each mode (PLAN 12, 14.2: a mode never reads about something it hides; M4
 * review HL-8, recheck HL-8-a). A catalog definition that names an amount kind or a switch a mode
 * hides reads, in that mode, as `METRIC_WORDING` words it: the one wording source for the help
 * sheet's glossary (src/help/glossary.ts `GLOSSARY_WORDING` is this table), every tile's and
 * figure's definition, and Settings > Formulas, since each reads the dictionary through
 * `ctx.metrics`, which src/data/context.tsx builds with `metricsInMode`. Only the parts still the
 * catalog's own are worded: a definition or formula changed in Metric definitions reads as written.
 * Pure.
 */
import type { MetricDef, MetricsApi } from './types'

/** When a wording applies: every `surface` shown, and not every `unless` shown (help's `holds`). */
export interface WordingCondition {
  surface?: string | readonly string[]
  unless?: string | readonly string[]
}

/** A metric's definition, and its formula when given, for the modes that meet the condition. */
export interface MetricWording extends WordingCondition {
  definition: string
  formula?: string
}

/** Manager mode shows no amount and no band estimate (7.6): `cost:band` is hidden there. */
const NO_AMOUNTS: WordingCondition = { unless: 'cost:band' }

/**
 * Wording for the modes that hide what a catalog definition names (the first whose condition holds
 * wins), written against surfaces like every help text. Each one says what the catalog says, in
 * the words the mode shows.
 */
export const METRIC_WORDING: Readonly<Record<string, readonly MetricWording[]>> = {
  // Manager mode shows no band estimate (7.6): standard heads by level and location instead.
  'plan.trade.weight': [
    {
      ...NO_AMOUNTS,
      definition:
        'A seat’s weight: what its level and location are worth at its own FTE, measured in standard heads, so an average full-time seat weighs 1.00. Weights come only from bands, standard loads and plan rates, never from anyone’s pay or offer.',
      formula:
        'the weight of the seat’s level and location at its FTE, in whole basis points of a standard head',
    },
  ],
  'requests.cycle.asks': [
    {
      ...NO_AMOUNTS,
      definition:
        'Requests submitted to the planning cycle, in each manager’s rank order. Each ask shows its heads.',
    },
  ],
  // The switch is HR admin's: the other modes read that one person's pay shows only there.
  'privacy.payAmounts': [
    {
      unless: 'pay:switch',
      definition:
        'Amounts tied to one person or one seat (base salary, an offer and its sign-on, relocation and agency fee, and the cost of a Filled seat) show and export only in HR admin mode, behind a switch that lasts for the session and turns off on every mode change.',
      formula: 'per-person and per-position amounts show only in HR admin mode, while its switch is on',
    },
  ],
}

const listOf = (s: string | readonly string[] | undefined): readonly string[] =>
  s === undefined ? [] : typeof s === 'string' ? [s] : s

/** Whether a wording applies where `can` decides each surface. */
export function wordingHolds(can: (surface: string) => boolean, c: WordingCondition): boolean {
  const unless = listOf(c.unless)
  return listOf(c.surface).every((s) => can(s)) && !(unless.length && unless.every((s) => can(s)))
}

/** The wording of a metric in a mode, or null where the catalog's own words stand. */
export function wordingIn(can: (surface: string) => boolean, id: string): MetricWording | null {
  return METRIC_WORDING[id]?.find((w) => wordingHolds(can, w)) ?? null
}

/** A metric as a mode reads it: the mode's wording of each part that is still the catalog's own. */
export function defInMode(
  def: MetricDef,
  can: (surface: string) => boolean,
  edited: readonly string[] = [],
): MetricDef {
  const w = wordingIn(can, def.id)
  if (!w) return def
  const definition = !edited.includes('definition') ? w.definition : def.definition
  const formula = w.formula && !edited.includes('formula') ? w.formula : def.formula
  if (definition === def.definition && formula === def.formula) return def
  return formula === undefined ? { ...def, definition } : { ...def, definition, formula }
}

/** The dictionary each worded dictionary was built over, so a context built from another's never words twice. */
const rawOf = new WeakMap<MetricsApi, MetricsApi>()
/** One worded dictionary per dictionary and set of wordings that hold. */
const inMode = new WeakMap<MetricsApi, Map<string, MetricsApi>>()

/**
 * The dictionary as a mode reads it (`defInMode` on `def` and `list`; every setting, target and
 * change exactly the dictionary's, so engines calculate the same in every mode): the same object
 * when no wording holds, and one object per dictionary and set of wordings that hold, so models
 * memoized on it stay warm. Given a dictionary already worded for another mode, it words the
 * dictionary underneath (contextAs builds one mode's context from another's).
 */
export function metricsInMode(metrics: MetricsApi, can: (surface: string) => boolean): MetricsApi {
  const raw = rawOf.get(metrics) ?? metrics
  const held = Object.keys(METRIC_WORDING).filter((id) => wordingIn(can, id))
  if (!held.length) return raw
  const key = held
    .map((id) => `${id}:${METRIC_WORDING[id].indexOf(wordingIn(can, id) as MetricWording)}`)
    .join('|')
  let byKey = inMode.get(raw)
  if (!byKey) {
    byKey = new Map()
    inMode.set(raw, byKey)
  }
  const hit = byKey.get(key)
  if (hit) return hit
  const worded = new Map<string, MetricDef>()
  const def = (id: string): MetricDef | undefined => {
    const d = raw.def(id)
    if (!d || !METRIC_WORDING[id]) return d
    let w = worded.get(id)
    if (!w) {
      w = defInMode(d, can, raw.changedFields(id))
      worded.set(id, w)
    }
    return w
  }
  let list: readonly MetricDef[] | null = null
  const api: MetricsApi = {
    get list() {
      list ??= raw.list.map((d) => def(d.id) ?? d)
      return list
    },
    def,
    defaultDef: (id) => raw.defaultDef(id),
    paramDef: (id, key) => raw.paramDef(id, key),
    param: (id, key) => raw.param(id, key),
    num: (id, key) => raw.num(id, key),
    flag: (id, key) => raw.flag(id, key),
    choice: (id, key) => raw.choice(id, key),
    ratings: (id, key) => raw.ratings(id, key),
    range: (id, key) => raw.range(id, key),
    target: (id) => raw.target(id),
    isChanged: (id) => raw.isChanged(id),
    changedFields: (id) => raw.changedFields(id),
    sourcesOf: (id) => raw.sourcesOf(id),
    changesBehind: (id) => raw.changesBehind(id),
    usesOf: (id) => raw.usesOf(id),
    get changedCount() {
      return raw.changedCount
    },
    get changes() {
      return raw.changes
    },
    get state() {
      return raw.state
    },
  }
  rawOf.set(api, raw)
  byKey.set(key, api)
  return api
}

/** The dictionary a worded one was built over (the dictionary itself when it is not worded). */
export const metricsUnworded = (metrics: MetricsApi): MetricsApi => rawOf.get(metrics) ?? metrics
