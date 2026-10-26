/**
 * Settings as data (the template app's settings/model.ts and formulaIndex.ts, read only in M2):
 *
 * - Formulas: one row per metric the mode shows (`metric:<id>`, docs/PLAN.md 12) and lists as the
 *   glossary does (src/help/access.ts `formulaRowShown`, M4 recheck HL-8-a), each in the mode's own
 *   words (`ctx.metrics`, src/metrics/modeWording.ts), grouped by home
 *   view in folder-tab order, then the pages, then the rules and settings; each with its definition,
 *   formula, population and window and the settings it calculates with, at their values in force. A
 *   money setting (the leader threshold, the rounding step) shows only where the mode shows cost:
 *   Manager mode lists the setting and "—" (docs/PLAN.md 7.6, the leak crawl reads these values).
 * - Official lists: each list in force, its status and how many values it holds.
 * - The sheet's description and the wording after a settings import.
 *
 * Editing a definition or a list is the Data room's (Metric definitions, Lists). Pure.
 */
import type { AccessContext } from '@/access/context'
import type { EffectiveLists } from '@/data/lists/types'
import { PAGE_KEYS, VIEW_KEYS } from '@/data/schema'
import { SECTION_LABEL, type Settings, type SettingsSection } from '@/data/settings'
import { formulaRowShown } from '@/help/access'
import { DASH } from '@/lib/format'
import { formatParam, isMoneyParam } from '@/metrics/params'
import { METRIC_VIEW_LABEL, readsNoData } from '@/metrics/registry'
import type { MetricDef, MetricsApi, MetricView } from '@/metrics/types'

/* ───────────── formulas ───────────── */

export type FormulaSectionKey = MetricView | 'rules'

export interface FormulaSetting {
  key: string
  label: string
  /** The value in force, formatted; "—" where the mode shows no amount. */
  value: string
  changed: boolean
}

export interface FormulaRow {
  id: string
  name: string
  definition: string
  formula: string | null
  population: string | null
  window: string | null
  settings: FormulaSetting[]
  /** Anything behind it differs from the defaults. */
  changed: boolean
}

export interface FormulaSection {
  key: FormulaSectionKey
  label: string
  rows: FormulaRow[]
}

/** Folder-tab order, then the masthead pages, then the rules. */
export const FORMULA_SECTION_ORDER: readonly FormulaSectionKey[] = [...VIEW_KEYS, ...PAGE_KEYS, 'rules']

const sectionOf = (def: MetricDef): FormulaSectionKey =>
  readsNoData(def) ? 'rules' : (def.views[0] ?? 'rules')

/**
 * Settings > Formulas for a context: the metrics the mode shows, with the settings they calculate
 * with. `access.can('metric:<id>')` decides each metric; money settings follow `showCost`.
 */
export function formulaSections(ctx: {
  metrics: Pick<MetricsApi, 'list' | 'param' | 'changedFields' | 'isChanged'>
  access: Pick<AccessContext, 'can' | 'mode'>
  showCost: boolean
}): FormulaSection[] {
  const bySection = new Map<FormulaSectionKey, FormulaRow[]>()
  for (const def of ctx.metrics.list) {
    if (!ctx.access.can(`metric:${def.id}`)) continue
    // Like the glossary (M4 recheck HL-8-a): a rule only with its article and where amounts show,
    // and nothing that still names something the mode hides.
    const texts = [
      def.name,
      def.definition,
      def.formula,
      def.population,
      def.window,
      ...def.params.map((p) => p.label),
    ]
    if (
      !formulaRowShown(
        ctx.access,
        def.id,
        texts.map((t) => t ?? null),
      )
    )
      continue
    const changed = new Set(ctx.metrics.changedFields(def.id))
    const settings = def.params.map((p) => ({
      key: p.key,
      label: p.label,
      value: isMoneyParam(p) && !ctx.showCost ? DASH : formatParam(p, ctx.metrics.param(def.id, p.key)),
      changed: changed.has(`params.${p.key}`),
    }))
    const row: FormulaRow = {
      id: def.id,
      name: def.name,
      definition: def.definition,
      formula: def.formula ?? null,
      population: def.population ?? null,
      window: def.window ?? null,
      settings,
      changed: ctx.metrics.isChanged(def.id),
    }
    const key = sectionOf(def)
    const list = bySection.get(key)
    if (list) list.push(row)
    else bySection.set(key, [row])
  }
  return FORMULA_SECTION_ORDER.filter((k) => bySection.has(k)).map((key) => ({
    key,
    label: key === 'rules' ? 'Rules and settings' : METRIC_VIEW_LABEL[key],
    rows: bySection.get(key) ?? [],
  }))
}

/* ───────────── official lists ───────────── */

export interface ListRow {
  id: string
  label: string
  about: string
  /** "Official" or "Proposed". */
  status: string
  /** Where it comes from: "Saved", "Sample company", "From your data", "Built in". */
  source: string
  /** Values in use (retired ones left out). */
  values: number
}

const SOURCE_LABEL: Record<string, string> = {
  saved: 'Saved',
  sample: 'Sample company',
  data: 'From your data',
  builtin: 'Built in',
}

/** The lists in force, in list order, for Settings > Official lists. */
export function listRows(lists: EffectiveLists): ListRow[] {
  return Object.values(lists).map((l) => ({
    id: l.def.id,
    label: l.def.label,
    about: l.def.about,
    status: l.status === 'official' ? 'Official' : 'Proposed',
    source: SOURCE_LABEL[l.source] ?? l.source,
    values: l.values.filter((v) => !v.retired).length,
  }))
}

/* ───────────── the sheet ───────────── */

/** "Mode, display, data and this device." */
export function describeSections(sections: readonly SettingsSection[]): string {
  const words = sections.map((s, i) => (i === 0 ? SECTION_LABEL[s] : SECTION_LABEL[s].toLowerCase()))
  const list =
    words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}` : (words[0] ?? '')
  return list ? `${list}.` : ''
}

const SETTING_NAME: Record<keyof Settings, string> = {
  theme: 'theme',
  textSize: 'text size',
  motion: 'motion',
  dataStandard: 'data standard',
  asOfOverride: 'reporting date',
}

/** "Applied the theme, text size and data standard from the file." */
export function importedText(applied: readonly (keyof Settings)[]): string {
  const names = applied.map((k) => SETTING_NAME[k])
  if (!names.length) return 'Nothing in the file could be applied.'
  const list = names.length < 2 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
  return `Applied the ${list} from the file.`
}
