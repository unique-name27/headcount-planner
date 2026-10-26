/**
 * The messy sample through the real import pipeline: each raw extract is read the way the Data room
 * reads an upload (sheet, auto-map, apply, with the workers for linking people), and its version
 * keeps the original sheet, the mapping and the import log.
 */
import { applyMapping } from '../../import/apply'
import { autoMap } from '../../import/automap'
import { sheetFromRows } from '../../import/sheet'
import type { ImportResult, Mapping, ParsedSheet } from '../../import/types'
import type { SampleSeed, SampleSeedEntry } from '../../quality/seed'
import { type DatasetKey, type Datasets, datasetDef, type WorkerRow } from '../../schema'
import { cachedSample } from '../generate'
import type { RawExtract } from './extract'
import { freezesExtract } from './extracts/freezes'
import { reqsExtract } from './extracts/reqs'
import { requestsExtract } from './extracts/requests'
import { targetsExtract } from './extracts/targets'
import { RAW_DATASETS, type RawDataset } from './plan'
import { certify, goldRows, rawEntryMeta, type StarterSample } from './starter'

const EXTRACTS: { [K in RawDataset]: (base: Datasets) => RawExtract<K> } = {
  reqs: reqsExtract,
  targets: targetsExtract,
  freezes: freezesExtract,
  requests: requestsExtract,
}

/** The raw extract of one dataset, built from the clean sample. */
export const rawExtract = <K extends RawDataset>(key: K, base: Datasets): RawExtract<K> =>
  EXTRACTS[key](base) as RawExtract<K>

export interface ImportedExtract<K extends DatasetKey = DatasetKey> {
  extract: RawExtract<K>
  sheet: ParsedSheet
  mapping: Mapping
  result: ImportResult<K>
}

/** Read an extract the way the Data room reads an upload: header detection, auto-mapping, import. */
export function importExtract<K extends DatasetKey>(
  extract: RawExtract<K>,
  roster: readonly WorkerRow[],
): ImportedExtract<K> {
  const sheet = sheetFromRows(extract.sheetName, extract.aoa)
  if (!sheet) throw new Error(`The ${extract.dataset} extract has no rows.`)
  const def = datasetDef(extract.dataset)
  const mapping = autoMap(sheet.headers, sheet.rows, def)
  const result = applyMapping<K>({ sheet, def, mapping, roster })
  return { extract, sheet, mapping, result }
}

/** Two cell values are the same: equal, both blank, or arrays and records with the same entries. */
function same(x: unknown, y: unknown): boolean {
  if ((x ?? null) === (y ?? null)) return true
  if (Array.isArray(x) && Array.isArray(y)) return x.length === y.length && x.every((v, i) => same(v, y[i]))
  if (x && y && typeof x === 'object' && typeof y === 'object' && !Array.isArray(x) && !Array.isArray(y)) {
    const a = x as Record<string, unknown>
    const b = y as Record<string, unknown>
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if (!same(a[k], b[k])) return false
    return true
  }
  return false
}

/** True when two row lists hold the same values, field by field (a blank and a missing field match). */
export function sameRows(a: readonly object[], b: readonly object[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i] && !same(a[i], b[i])) return false
  return true
}

/**
 * A raw dataset's seed entry from its import. When the import gives the same rows as the starter
 * state, the starter's rows are kept, so loading the import changes no number on screen.
 */
function importedEntry(
  key: RawDataset,
  imp: ImportedExtract,
  starterRows?: readonly object[],
): SampleSeedEntry {
  const rows = starterRows && sameRows(starterRows, imp.result.rows) ? starterRows : imp.result.rows
  return {
    ...rawEntryMeta(key),
    rows: rows as SampleSeedEntry['rows'],
    raw: imp.sheet,
    mapping: imp.mapping,
    options: imp.result.used,
    issues: imp.result.issues,
    rowsIn: imp.result.stats.rowsIn,
  }
}

export interface MessySample {
  /** Every dataset as the app loads it. */
  data: Datasets
  seed: SampleSeed
  imports: { [K in RawDataset]: ImportedExtract<K> }
}

/** The whole messy sample in one go (tests, and anything that needs the import logs at once). */
export function buildMessySample(base: Datasets = cachedSample().datasets): MessySample {
  const gold = goldRows(base)
  const imports: Partial<Record<RawDataset, ImportedExtract>> = {}
  const seed: SampleSeed = {}
  const entries = seed as Partial<Record<DatasetKey, SampleSeedEntry>>
  const data: Record<DatasetKey, unknown> = { ...gold }
  for (const key of RAW_DATASETS) {
    const imp: ImportedExtract = importExtract(rawExtract(key, gold), gold.workers)
    imports[key] = imp
    entries[key] = importedEntry(key, imp)
    data[key] = imp.result.rows
  }
  const loaded = data as unknown as Datasets
  certify(seed, loaded)
  return { data: loaded, seed, imports: imports as MessySample['imports'] }
}

/** Yield until the browser is idle (at most 500 ms), so the import runs after first paint and input. */
const nextTask = () =>
  new Promise<void>((resolve) => {
    if (typeof requestIdleCallback === 'function') requestIdleCallback(() => resolve(), { timeout: 500 })
    else setTimeout(resolve, 0)
  })

/**
 * Import the raw extracts behind a starter state, one dataset per task so the page stays responsive,
 * and return the full seed (the starter's rows kept wherever the import agrees).
 */
export async function completeMessySample(
  starter: StarterSample,
  base: Datasets = cachedSample().datasets,
): Promise<SampleSeed> {
  const gold = goldRows(base)
  const seed: SampleSeed = { ...starter.seed }
  const entries = seed as Partial<Record<DatasetKey, SampleSeedEntry>>
  for (const key of RAW_DATASETS) {
    await nextTask()
    const imp: ImportedExtract = importExtract(rawExtract(key, gold), starter.data.workers)
    entries[key] = importedEntry(key, imp, starter.data[key])
  }
  return seed
}
