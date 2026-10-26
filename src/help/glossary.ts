/**
 * The glossary (PLAN 14.2: "generated from the catalog"): one entry per metric in the dictionary,
 * built from the definitions in force (yours or the defaults), so it is never out of date. Pure.
 * The template app's help/glossary.ts with HCP's pages; the rule entries (`privacy.*`,
 * `cost.guard.*`) read "Privacy rule" and go with their articles (`glossaryInMode`).
 *
 * M4 freeze (docs/CONTRACTS-M4.md): types and the page labels are data; help-engine filled the body.
 *
 * A mode never reads about something it hides (14.2), the glossary included (M4 review HL-8): a
 * catalog definition that names an amount kind, a page or a switch the mode hides reads, in that
 * mode, as `GLOSSARY_WORDING` words it, in each part still the catalog's own; each
 * entry lives on a page the mode shows; and `glossaryInMode` leaves out whatever still names
 * something hidden.
 */
import { PAGE_LABEL as PAGE_NAME, VIEW_LABEL } from '@/data/schema'
import { CATALOG } from '@/metrics/catalog'
import { METRIC_WORDING, type MetricWording } from '@/metrics/modeWording'
import type { MetricDef, MetricView } from '@/metrics/types'
import type { Condition } from './types'

export interface GlossaryEntry {
  /** The metric id; links open it in Metric definitions. */
  id: string
  term: string
  definition: string
  formula?: string
  /** Where it lives: "Plan", or "Privacy rule" for a rule entry. */
  where: string
  view: MetricView
  /** Every view the metric shows in, its home first (where it lives in a mode that hides the home). */
  views?: readonly MetricView[]
  /**
   * The parts changed in Metric definitions (absent: none): a mode's `GLOSSARY_WORDING` replaces
   * only the parts that are still the catalog's own.
   */
  edited?: readonly ('definition' | 'formula')[]
}

/** Page names as the folder tabs and masthead say them. */
export const PAGE_LABEL: Readonly<Record<MetricView, string>> = { ...VIEW_LABEL, ...PAGE_NAME }

/** The metric id prefixes of the rule entries (src/metrics/rules.ts): "Privacy rule" in the glossary. */
export const RULE_PREFIXES: readonly string[] = ['privacy.', 'cost.guard.']

/** Whether a metric id is a rule entry's. */
export const isRuleMetric = (id: string): boolean => RULE_PREFIXES.some((p) => id.startsWith(p))

/** What a rule entry's "where" reads. */
export const RULE_WHERE = 'Privacy rule'

/** The cost guard's rule entries: about amounts, so a mode with no amounts leaves them out. */
export const isCostRule = (id: string): boolean => id.startsWith('cost.guard.')

/**
 * A metric's definition, and its formula when given, for the modes that meet the condition: the
 * dictionary's own per-mode wording (src/metrics/modeWording.ts, M4 recheck HL-8-a), which every
 * definition a mode reads goes through, tiles and Settings > Formulas included.
 */
export type GlossaryWording = MetricWording & Condition

/**
 * Wording for the modes that hide what a catalog definition names (the first whose condition holds
 * wins): `METRIC_WORDING`, the one wording source.
 */
export const GLOSSARY_WORDING: Readonly<Record<string, readonly GlossaryWording[]>> = METRIC_WORDING

/**
 * The parts of a definition in force that differ from the catalog's own (a mode's own wording of
 * it, which `ctx.metrics` already reads in, is the catalog's).
 */
function editedOf(d: MetricDef): ('definition' | 'formula')[] {
  const base = CATALOG.byId.get(d.id)
  if (!base) return []
  const worded = METRIC_WORDING[d.id] ?? []
  const out: ('definition' | 'formula')[] = []
  if (base.definition !== d.definition && !worded.some((w) => w.definition === d.definition))
    out.push('definition')
  if ((base.formula ?? '') !== (d.formula ?? '') && !worded.some((w) => w.formula === d.formula))
    out.push('formula')
  return out
}

/**
 * Glossary entries, sorted by term (then by where they live), one per metric id (the first
 * definition of an id wins). A metric lives on its first view; a rule entry lives in the Data room
 * and reads "Privacy rule".
 */
export function buildGlossary(defs: readonly MetricDef[]): GlossaryEntry[] {
  const seen = new Set<string>()
  const out: GlossaryEntry[] = []
  for (const d of defs) {
    if (seen.has(d.id)) continue
    seen.add(d.id)
    const rule = isRuleMetric(d.id)
    const view: MetricView = rule ? 'data' : (d.views[0] ?? 'data')
    out.push({
      id: d.id,
      term: d.name,
      definition: d.definition,
      ...(d.formula ? { formula: d.formula } : {}),
      where: rule ? RULE_WHERE : (PAGE_LABEL[view] ?? view),
      view,
      views: d.views,
      edited: editedOf(d),
    })
  }
  return out.sort(
    (a, b) =>
      a.term.localeCompare(b.term, 'en', { sensitivity: 'base' }) || a.where.localeCompare(b.where, 'en'),
  )
}
