/**
 * Excel and CSV import for Headcount Planner: parse a file, recognize each sheet's dataset, map
 * its columns, normalize values into the schema's vocabularies and report every change.
 *
 *   const book = await readWorkbook(buffer, file.name)
 *   const sheet = book.sheets[0]
 *   const [best] = guessDataset(sheet)
 *   const def = datasetDef(best.key)
 *   const saved = await loadProfile(best.key, sheet.headers)
 *   const { mapping, options } = saved
 *     ? applyProfile(saved, sheet.headers, def)
 *     : { mapping: autoMap(sheet.headers, sheet.rows, def, await loadLearnedSynonyms(best.key)), options: {} }
 *   const result = applyMapping({ sheet, def, mapping, roster: workers, options })
 *   summarizeIssues(result.issues)
 *
 * SheetJS (`readWorkbook`) and ExcelJS (templates) load on demand: importing this module loads
 * neither.
 */
export { type ApplyArgs, applyMapping, suggestOptions } from './apply'
export { autoMap, confidenceOf, knownShare, MIN_SCORE, rankHeaders, withChoice } from './automap'
export { canonicalLocation, canonicalText, LOCATION_ALIASES, normalizeCurrency } from './canonical'
export {
  type AssumptionKeyRead,
  DEFAULT_HOURS_PER_YEAR,
  DOCUMENTED_DEFAULTS,
  readAssumptionKey,
  readMonthKey,
} from './defaults'
export { guessDataset, isTemplateHelpSheet, TEMPLATE_HELP_SHEETS } from './detect'
export { ACTION_LABELS, ISSUE_COLUMNS, issueTableRows, summarizeIssues } from './issues'
export { linkManagers, nameKey } from './managers'
export {
  type Coerced,
  coerceAssumptionValue,
  coerceBoolean,
  coerceDate,
  coerceDateTime,
  coerceFiscalYear,
  coerceLevel,
  coerceMoney,
  coerceNumber,
  coercePercent,
  coerceShare,
  coerceSteps,
  coerceValue,
  detectDateOrder,
  detectPercentWhole,
  readFiscalYear,
} from './normalize'
export { readWorkbook, sheetFromRows, WorkbookReadError } from './parse'
export {
  applyProfile,
  deleteProfile,
  forgetAllProfiles,
  forgetLearnedSynonyms,
  headerFingerprint,
  learnSynonym,
  loadLearnedSynonyms,
  loadProfile,
  type MappingProfile,
  makeProfile,
  saveProfile,
} from './profiles'
export { type DroppedColumn, type DropReason, droppedColumns, droppedText, dropReason } from './protected'
export { formatSteps, readSteps, STEPS_EXAMPLE } from './steps'
export {
  buildTemplateWorkbook,
  exportDatasetWorkbook,
  type TemplateList,
  type TemplateLists,
  type TemplateOptions,
} from './templates'
export { normalizeHeader, normText } from './text'
export type * from './types'
export { summarizeValues, type ValueSummary } from './values'
export { normalizeAssumptionTable, normalizeEnumValue, normalizeLevel } from './vocab'
