/**
 * Template round trips (docs/PLAN.md 16.2): a template built from the fixture, the data-layer test
 * org or the whole generated sample, written by ExcelJS and read back by SheetJS, re-detects,
 * re-maps and re-imports every one of the eight datasets with nothing to report and identical rows,
 * approval steps included. The sample is generated once for the file (16.0).
 *
 * Moved here from templates.test.ts in M4 (docs/M3-REPORT.md, known gap 9) with every assert as it
 * was: in a full parallel unit run the first round trip paid the cold load of ExcelJS and SheetJS
 * under load and once ran past 30 s. The slow project runs one file at a time; the two libraries
 * load in `beforeAll` with a hook timeout of their own, and each round trip has its own timeout
 * (`ROUND_TRIP_MS`, set on its describe block). templates.test.ts keeps the layout checks on the
 * workbook itself.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { orgDatasets } from '@/testkit/orgFixture'
import { generateSample } from '../sample'
import { DATASET_KEYS, type DatasetKey, type Datasets, datasetDef } from '../schema'
import { applyMapping } from './apply'
import { autoMap } from './automap'
import { guessDataset } from './detect'
import { readWorkbook } from './parse'
import { buildTemplateWorkbook } from './templates'
import { FIXTURE } from './test-fixtures'

/** A round trip writes and reads a whole workbook; under a busy machine it gets this long. */
const ROUND_TRIP_MS = 180_000
/** Loading ExcelJS and SheetJS cold, before any round trip starts. */
const LOAD_MS = 120_000

beforeAll(async () => {
  await Promise.all([import('exceljs'), import('xlsx')])
}, LOAD_MS)

/** Records with every schema field present: absent optional fields read back as null. */
function complete(key: DatasetKey, rows: readonly object[]): Record<string, unknown>[] {
  const fields = datasetDef(key).fields
  return rows.map((r) =>
    Object.fromEntries(fields.map((f) => [f.key, (r as Record<string, unknown>)[f.key] ?? null])),
  )
}

/** Build a template from `source`, read it back and import every dataset sheet. */
async function roundTrip(source: Datasets, keys: DatasetKey[]) {
  const blob = await buildTemplateWorkbook({
    sample: source,
    sampleRows: Number.POSITIVE_INFINITY,
    includePay: true,
    datasets: keys,
    today: '2026-10-13',
  })
  const book = await readWorkbook(await blob.arrayBuffer(), 'hcp-template.xlsx')
  const out: Partial<Record<DatasetKey, { rows: unknown[]; issues: unknown[] }>> = {}
  for (const key of keys) {
    const def = datasetDef(key)
    const sheet = book.sheets.find((s) => s.name === def.sheet)
    if (!sheet) throw new Error(`missing sheet ${def.sheet}`)
    const [best] = guessDataset(sheet)
    expect(best.key, def.sheet).toBe(key)
    const mapping = autoMap(sheet.headers, sheet.rows, def)
    const result = applyMapping({
      sheet,
      def,
      mapping,
      roster: key === 'workers' ? undefined : source.workers,
    })
    out[key] = { rows: result.rows, issues: result.issues }
  }
  return { book, out }
}

describe('template round trip', { timeout: ROUND_TRIP_MS }, () => {
  it('reads back every dataset of the fixture exactly, approval steps included', async () => {
    const { book, out } = await roundTrip(FIXTURE, DATASET_KEYS)
    expect(book.sheets.map((s) => s.name)).toEqual([
      'Read me',
      ...DATASET_KEYS.map((k) => datasetDef(k).sheet),
      'Fields',
    ])
    for (const key of DATASET_KEYS) {
      expect(out[key]?.issues, key).toEqual([])
      expect(out[key]?.rows, key).toEqual(complete(key, FIXTURE[key]))
    }
    // The steps came back as steps, not as their text.
    const first = out.requests?.rows[0] as { steps: unknown } | undefined
    expect(first?.steps).toEqual(FIXTURE.requests[0].steps)
    const steps = first?.steps
    expect(steps).toEqual(FIXTURE.requests[0].steps)
  })

  it('fills every field of every dataset at least once, so every coercer is exercised', () => {
    for (const key of DATASET_KEYS)
      for (const f of datasetDef(key).fields) {
        const filled = (FIXTURE[key] as unknown as Record<string, unknown>[]).some(
          (r) => r[f.key] != null && r[f.key] !== '',
        )
        expect(filled, `${key}.${f.key}`).toBe(true)
      }
  })

  it('reads back the data-layer test org exactly, with nothing to report', async () => {
    const org = orgDatasets()
    const { out } = await roundTrip(org, DATASET_KEYS)
    for (const key of DATASET_KEYS) {
      if (key === 'workers' || key === 'positions') continue
      expect(out[key]?.rows, key).toEqual(complete(key, org[key]))
    }
    // The org plants a reporting loop (P-LOOP1 and P-LOOP2) and workers who hold no seat: the
    // importer reads them as they are and links managers without a change.
    expect(out.positions?.rows).toEqual(complete('positions', org.positions))
    expect(out.workers?.rows).toEqual(complete('workers', org.workers))
  })
})

describe('template round trip of the sample', { timeout: ROUND_TRIP_MS }, () => {
  let sample: Datasets
  beforeAll(() => {
    sample = generateSample().datasets
  }, 120_000)

  it('reads back every dataset of the generated sample exactly, with nothing to report', async () => {
    const { out } = await roundTrip(sample, DATASET_KEYS)
    for (const key of DATASET_KEYS) {
      expect(sample[key].length, key).toBeGreaterThan(0)
      expect(out[key]?.issues, key).toEqual([])
      expect(out[key]?.rows, key).toEqual(complete(key, sample[key]))
    }
    // Every request with approval steps came back with them as steps.
    const stepped = sample.requests.filter((r) => r.steps?.length)
    expect(stepped.length).toBeGreaterThan(0)
    const rows = (out.requests?.rows ?? []) as { requestId: string; steps: unknown }[]
    const back = new Map(rows.map((r) => [r.requestId, r]))
    for (const r of stepped) expect(back.get(r.requestId)?.steps, r.requestId).toEqual(r.steps)
  })
})
