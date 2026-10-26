/**
 * Replacing one dataset with your own file (the template app's import session, kept lean): read the
 * file (SheetJS loads on demand), pick the sheet that fits the dataset best, map its columns (a saved
 * mapping for the same headers first, else the automatic mapping with what you taught it), and
 * apply it, logging every change. The Data room shows the result for review before anything is
 * replaced; nothing is stored until you choose Replace. Protected characteristics and free-text
 * comment columns are dropped as the sheet is read (`droppedColumns`). Async; no React.
 */
import { applyMapping } from '@/data/import/apply'
import { autoMap } from '@/data/import/automap'
import { guessDataset } from '@/data/import/detect'
import { readWorkbook } from '@/data/import/parse'
import {
  applyProfile,
  headerFingerprint,
  loadLearnedSynonyms,
  loadProfile,
  makeProfile,
  saveProfile,
} from '@/data/import/profiles'
import type { ApplyOptions, ImportResult, Mapping, ParsedSheet } from '@/data/import/types'
import { type DatasetKey, datasetDef, type WorkerRow } from '@/data/schema'
import type { ReplaceExtra, SourceMeta } from '@/data/store'

/** A file read and mapped for one dataset, waiting for review. */
export interface PreparedImport {
  key: DatasetKey
  fileName: string
  sheet: ParsedSheet
  mapping: Mapping
  options: ApplyOptions
  result: ImportResult
  /** Required fields with no column in the file. */
  missingRequired: string[]
  /** The mapping came from one you saved for these headers. */
  fromProfile: boolean
}

/** Read a file and map its best sheet for `key`. Throws a plain sentence when it cannot be read. */
export async function prepareImport(
  file: { name: string; arrayBuffer: () => Promise<ArrayBuffer> },
  key: DatasetKey,
  roster: readonly WorkerRow[],
): Promise<PreparedImport> {
  const book = await readWorkbook(await file.arrayBuffer(), file.name)
  if (!book.sheets.length) throw new Error(`${file.name} has no rows to read.`)
  const fitOf = (s: ParsedSheet) => guessDataset(s).find((g) => g.key === key)?.confidence ?? 0
  const sheet = [...book.sheets].sort((a, b) => fitOf(b) - fitOf(a))[0]
  const def = datasetDef(key)
  const saved = await loadProfile(key, sheet.headers)
  const { mapping, options } = saved
    ? applyProfile(saved, sheet.headers, def)
    : { mapping: autoMap(sheet.headers, sheet.rows, def, await loadLearnedSynonyms(key)), options: {} }
  const result = applyMapping({ sheet, def, mapping, roster, options })
  const missingRequired = def.fields
    .filter((field) => field.required && !mapping[field.key]?.header)
    .map((field) => field.label)
  return { key, fileName: file.name, sheet, mapping, options, result, missingRequired, fromProfile: !!saved }
}

/** What the store keeps with the new version: where it came from, its sheet, mapping and import log. */
export function replaceArgs(
  p: PreparedImport,
  now: Date = new Date(),
): {
  meta: Omit<SourceMeta, 'kind' | 'rowCount'>
  extra: ReplaceExtra
} {
  const warned = new Set(p.result.issues.filter((i) => i.row > 0).map((i) => i.row)).size
  return {
    meta: {
      fileName: p.fileName,
      sheetName: p.sheet.name,
      importedAt: now.toISOString(),
      warnings: warned,
      profileFingerprint: headerFingerprint(p.sheet.headers),
    },
    extra: {
      raw: p.sheet,
      mapping: p.mapping,
      options: { ...p.options, ...p.result.used },
      issues: p.result.issues,
      rowsIn: p.result.stats.rowsIn,
    },
  }
}

/** Remember the mapping for files with the same headers. */
export const rememberMapping = (p: PreparedImport): Promise<void> =>
  saveProfile(
    makeProfile(
      p.key,
      p.sheet.headers,
      p.mapping,
      { ...p.options, ...p.result.used },
      new Date().toISOString(),
    ),
  )
