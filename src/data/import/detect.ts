/**
 * Which dataset is this sheet? Each dataset is auto-mapped against the sheet and scored on how
 * many of its required fields found a column, how much of the sheet it explains, and how close
 * the sheet's name is to the dataset's.
 */
import { DATASETS, type DatasetDef, type DatasetKey } from '../schema'
import { autoMapProfiled, profileColumns } from './automap'
import { headerTokens, normalizeHeader } from './text'
import type { DatasetGuess, Mapping, ParsedSheet } from './types'

/** Sheets the template adds for people, not data (Lists holds the official lists' dropdown values). */
export const TEMPLATE_HELP_SHEETS = ['Read me', 'Fields', 'Lists']
/** The help sheets every template has. */
const CORE_HELP = new Set(['Read me', 'Fields'].map(normalizeHeader))

/**
 * A sheet the template adds for people, not data. Read me and Fields always are. Lists is the
 * template's only beside one of them in `sheetNames` (the workbook's sheets), so a sheet of your
 * own named Lists is read like any other; without `sheetNames`, Lists counts as the template's.
 */
export const isTemplateHelpSheet = (name: string, sheetNames?: readonly string[]): boolean => {
  const n = normalizeHeader(name)
  if (CORE_HELP.has(n)) return true
  if (n !== normalizeHeader('Lists')) return false
  return !sheetNames || sheetNames.some((s) => CORE_HELP.has(normalizeHeader(s)))
}

/** Common sheet names for each dataset, beyond its own sheet name and label. */
const SHEET_ALIASES: Record<DatasetKey, string[]> = {
  positions: [
    'position management',
    'positions',
    'position list',
    'position report',
    'position roster',
    'position control',
    'approved positions',
    'seats',
    'seat list',
  ],
  workers: [
    'roster',
    'worker roster',
    'headcount',
    'people',
    'staff',
    'employees',
    'employee list',
    'active employees',
    'hris',
    'all workers',
    'assignments',
  ],
  comp: ['compensation', 'pay', 'salary', 'salaries', 'comp data', 'total rewards', 'base pay'],
  reqs: [
    'requisitions',
    'reqs',
    'jobs',
    'openings',
    'job requisitions',
    'open roles',
    'ats export',
    'recruiting',
  ],
  requests: [
    'requests',
    'headcount requests',
    'hc requests',
    'position requests',
    'approvals',
    'asks',
    'request log',
  ],
  targets: [
    'targets',
    'headcount targets',
    'hc targets',
    'headcount budget',
    'hc budget',
    'budget',
    'aop',
    'plan targets',
    'envelope',
  ],
  freezes: ['freezes', 'hiring freezes', 'hiring freeze', 'freeze list'],
  assumptions: ['assumptions', 'drivers', 'planning assumptions', 'rates', 'fx rates', 'bands', 'inputs'],
}

function nameAffinity(sheetName: string, def: DatasetDef): number {
  const s = headerTokens(sheetName)
  if (!s.length) return 0
  const names = [def.sheet, def.label, def.key, ...SHEET_ALIASES[def.key]].map(headerTokens)
  if (names.some((n) => n.join(' ') === s.join(' '))) return 1
  const set = new Set(s)
  return names.some((n) => n.length > 0 && n.every((t) => set.has(t))) ? 0.5 : 0
}

function fitScore(
  def: DatasetDef,
  mapping: Mapping,
  headerCount: number,
): { confidence: number; matched: number; missingRequired: string[] } {
  let reqSum = 0
  let reqN = 0
  let coreSum = 0
  let coreN = 0
  let matched = 0
  const missingRequired: string[] = []
  for (const f of def.fields) {
    const m = mapping[f.key]
    const score = m?.header ? m.score : 0
    if (m?.header) matched++
    if (f.required) {
      reqSum += score
      reqN++
      if (!m?.header) missingRequired.push(f.key)
    }
    if (f.required || f.recommended) {
      coreSum += score
      coreN++
    }
  }
  const required = reqN ? reqSum / reqN : 0
  const core = coreN ? coreSum / coreN : 0
  const explained = headerCount ? matched / headerCount : 0
  return {
    confidence: 0.5 * required + 0.25 * core + 0.25 * Math.min(1, explained),
    matched,
    missingRequired,
  }
}

/**
 * Rank the datasets for a sheet, best first. `confidence` is 0-1; above about 0.6 the sheet
 * can be imported without asking, below about 0.35 it probably isn't planning data at all.
 */
export function guessDataset(
  sheet: ParsedSheet,
  learned?: Partial<Record<DatasetKey, Record<string, string>>>,
): DatasetGuess[] {
  // Only Read me and Fields: a Lists sheet that reaches here is one of your own.
  if (CORE_HELP.has(normalizeHeader(sheet.name)))
    return DATASETS.map((d) => ({
      key: d.key,
      confidence: 0,
      matched: 0,
      missingRequired: d.fields.filter((f) => f.required).map((f) => f.key),
    }))
  const profiles = profileColumns(sheet.headers, sheet.rows)
  const guesses = DATASETS.map((def, order) => {
    const mapping = autoMapProfiled(sheet.headers, profiles, def, learned?.[def.key])
    const fit = fitScore(def, mapping, sheet.headers.length)
    const bonus = 0.2 * nameAffinity(sheet.name, def)
    return {
      key: def.key,
      confidence: Math.round(Math.min(1, fit.confidence + bonus) * 100) / 100,
      matched: fit.matched,
      missingRequired: fit.missingRequired,
      order,
    }
  })
  guesses.sort((a, b) => b.confidence - a.confidence || a.order - b.order)
  return guesses.map((g) => ({
    key: g.key,
    confidence: g.confidence,
    matched: g.matched,
    missingRequired: g.missingRequired,
  }))
}
