/**
 * The starter state of the messy sample: every dataset's rows as the import of its raw extract
 * yields them, built straight from the clean sample with the planted problems applied, plus the
 * confirmations and certifications. It costs a few milliseconds, so the app can open on it while the
 * real import of the raw extracts runs (`completeMessySample`), which then adds each version's
 * original sheet, mapping and import log. `raw.test.ts` checks that both give the same rows.
 */
import { computeControlTotal, DEFAULT_TOLERANCE } from '../../quality/rules'
import type { SampleSeed, SampleSeedEntry } from '../../quality/seed'
import type { DatasetKey, Datasets } from '../../schema'
import { SAMPLE_AS_OF } from '../base'
import { cachedSample } from '../generate'
import { CERTIFIED, CONFIRMED, FILES, IMPORTED_AT, RAW_DATASETS, type RawDataset } from './plan'
import { PLANTED } from './planted'

/** The rows each raw extract imports as (./planted.ts, which the sample's baseline id reads too). */
export { PLANTED }

export interface StarterSample {
  /** Every dataset as the app shows it. */
  data: Datasets
  seed: SampleSeed
}

type Entries = Partial<Record<DatasetKey, SampleSeedEntry>>

/** File, load time and confirmation of a raw dataset's version (no sheet or import log yet). */
export function rawEntryMeta(key: RawDataset): SampleSeedEntry {
  const confirmed = CONFIRMED[key]
  return {
    ...FILES[key],
    importedAt: IMPORTED_AT[key],
    ...(confirmed ? { mappingConfirmed: confirmed } : {}),
  }
}

/** Starter certifications, with control totals stated the way the owner's report states them. */
export function certify(seed: SampleSeed, data: Datasets): void {
  const entries = seed as Entries
  for (const key of Object.keys(CERTIFIED) as DatasetKey[]) {
    const cert = CERTIFIED[key]
    if (!cert) continue
    const controlTotals = cert.controlTotals.map((t) => {
      const actual = computeControlTotal(t.metric, data, key, SAMPLE_AS_OF) ?? 0
      return {
        label: t.label,
        metric: t.metric,
        expected: Math.round(actual / t.roundTo) * t.roundTo,
        tolerance: DEFAULT_TOLERANCE,
      }
    })
    entries[key] = {
      ...entries[key],
      certification: { by: cert.by, at: cert.at, note: cert.note, controlTotals },
    }
  }
}

/** The certified datasets load as the systems of record give them: the clean rows. */
export const goldRows = (base: Datasets): Datasets => base

/** The starter state, built from the clean sample (the generated one by default). */
export function starterSample(base: Datasets = cachedSample().datasets): StarterSample {
  const gold = goldRows(base)
  const seed: SampleSeed = {}
  const entries = seed as Entries
  const data: Record<DatasetKey, unknown> = { ...gold }
  for (const key of RAW_DATASETS) {
    const rows = PLANTED[key](gold)
    data[key] = rows
    entries[key] = { ...rawEntryMeta(key), rows } as SampleSeedEntry
  }
  const loaded = data as unknown as Datasets
  certify(seed, loaded)
  return { data: loaded, seed }
}
