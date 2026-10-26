/**
 * The messy sample (docs/PLAN.md 13.5): deterministic; every raw extract auto-maps and imports to
 * exactly its planted rows with the planted issues and nothing else; only the planted cells differ
 * from the clean sample; the starter state equals the import; every dataset starts at its tier.
 * One generated sample per file (16.0).
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { computeQuality } from '../../quality'
import { buildSampleState } from '../../quality/seed'
import { DATASET_KEYS, type DatasetKey, type Datasets } from '../../schema'
import { SAMPLE_AS_OF } from '../base'
import { generateSample } from '../generate'
import {
  buildMessySample,
  completeMessySample,
  type MessySample,
  RAW_DATASETS,
  type RawDataset,
  SAMPLE_TIERS,
  sameRows,
  starterSample,
} from '.'
import { CONVERSIONS, NO_MANAGER_SHARE, reqMess } from './extracts/reqs'
import { noCostCenterRows, TITLE_ROW } from './extracts/requests'

let base: Datasets
let messy: MessySample

beforeAll(() => {
  base = generateSample().datasets
  messy = buildMessySample(base)
}, 120_000)

const qualityOf = (m: MessySample) => {
  const state = buildSampleState(base, m.seed, SAMPLE_AS_OF)
  const issues: Partial<Record<DatasetKey, readonly import('../../import/types').ImportIssue[]>> = {}
  for (const k of RAW_DATASETS) issues[k] = m.imports[k].result.issues
  return { state, q: computeQuality(state.data, state.versions, issues, { asOf: SAMPLE_AS_OF }) }
}

/** Field → rows whose value differs from the clean sample. */
function diffs(key: DatasetKey, rows: readonly object[]): Record<string, number> {
  const clean = base[key] as unknown as readonly Record<string, unknown>[]
  const got = rows as readonly Record<string, unknown>[]
  const out: Record<string, number> = {}
  clean.forEach((c, i) => {
    for (const f of new Set([...Object.keys(c), ...Object.keys(got[i] ?? {})]))
      if (JSON.stringify(c[f] ?? null) !== JSON.stringify(got[i]?.[f] ?? null)) out[f] = (out[f] ?? 0) + 1
  })
  return out
}

describe('messy sample', () => {
  it('is deterministic', () => {
    const again = buildMessySample(generateSample().datasets)
    expect(JSON.stringify(again.seed)).toBe(JSON.stringify(messy.seed))
  })

  it('imports every row of every extract, with the planted issues and nothing else', () => {
    const expected: Record<RawDataset, Record<string, number>> = {
      reqs: { 'unknown-value': CONVERSIONS },
      targets: {},
      freezes: {},
      requests: {},
    }
    for (const k of RAW_DATASETS) {
      const { result } = messy.imports[k]
      const byCode: Record<string, number> = {}
      for (const i of result.issues) byCode[i.code] = (byCode[i.code] ?? 0) + 1
      expect(byCode, k).toEqual(expected[k])
      expect(result.stats.rowsIn, k).toBe(base[k].length)
      expect(result.stats.rowsOut, k).toBe(base[k].length)
    }
  })

  it('auto-maps every foreign header to the field it holds', () => {
    // Fields the extracts have no column for.
    const unmapped: Record<RawDataset, string[]> = {
      reqs: [],
      targets: [],
      freezes: [],
      requests: [],
    }
    // The ATS's own columns the reqs dataset does not hold (the seat has them).
    const extra: Record<RawDataset, string[]> = {
      reqs: ['Job Level', 'Primary Location'],
      targets: [],
      freezes: [],
      requests: [],
    }
    for (const k of RAW_DATASETS) {
      const { mapping, sheet } = messy.imports[k]
      const missing = Object.entries(mapping)
        .filter(([, m]) => !m.header)
        .map(([f]) => f)
      expect(missing, k).toEqual(unmapped[k])
      const used = new Set(Object.values(mapping).map((m) => m.header))
      expect(
        sheet.headers.filter((h) => !used.has(h)),
        k,
      ).toEqual(extra[k])
    }
  })

  it('changes only the planted values, so every story survives the import', () => {
    const mess = reqMess(base.reqs)
    const expected: Record<RawDataset, Record<string, number>> = {
      reqs: { hiringManagerId: mess.noManager.size, reqType: CONVERSIONS },
      targets: {},
      freezes: {},
      requests: { costCenter: noCostCenterRows(base.requests).size },
    }
    for (const k of RAW_DATASETS) expect(diffs(k, messy.data[k]), k).toEqual(expected[k])
    expect(mess.noManager.size).toBe(Math.round(base.reqs.length * NO_MANAGER_SHARE))
    expect(noCostCenterRows(base.requests).size).toBeGreaterThan(0)
    for (const k of ['positions', 'workers', 'comp', 'assumptions'] as const)
      expect(diffs(k, messy.data[k]), k).toEqual({})
  })

  it('keeps the original sheets, including the title row of the requests tracker', () => {
    const r = messy.imports.requests
    expect(r.extract.aoa[0]).toEqual([TITLE_ROW])
    expect(r.sheet.headerRow).toBeGreaterThan(1)
    expect(r.sheet.headers[0]).toBe('Request Ref')
    for (const k of RAW_DATASETS) {
      const e = messy.seed[k]
      expect(e?.raw, k).toBe(messy.imports[k].sheet)
      expect(e?.issues, k).toBe(messy.imports[k].result.issues)
    }
  })

  it('loads every dataset at the tier the plan gives it', () => {
    const { q } = qualityOf(messy)
    const tiers = Object.fromEntries(DATASET_KEYS.map((k) => [k, q.datasetTier(k)]))
    expect(tiers).toEqual(SAMPLE_TIERS)
  })
})

describe('starter state and background import', () => {
  it('the starter state has exactly the rows the import of each raw extract yields', () => {
    const starter = starterSample(base)
    for (const k of DATASET_KEYS) expect(sameRows(starter.data[k], messy.data[k]), k).toBe(true)
  })

  it('the starter state has the same tiers, so nothing changes on screen when the import lands', () => {
    const starter = starterSample(base)
    const state = buildSampleState(base, starter.seed, SAMPLE_AS_OF)
    const q = computeQuality(state.data, state.versions, undefined, { asOf: SAMPLE_AS_OF })
    expect(Object.fromEntries(DATASET_KEYS.map((k) => [k, q.datasetTier(k)]))).toEqual(SAMPLE_TIERS)
    for (const k of RAW_DATASETS) expect(state.versions[k].hasRaw, k).toBe(false)
  })

  it('completing the starter keeps its rows and adds each sheet, mapping and import log', async () => {
    const starter = starterSample(base)
    const full = await completeMessySample(starter, base)
    for (const k of RAW_DATASETS) {
      const e = full[k]
      expect(e?.rows, k).toBe(starter.data[k])
      expect(e?.raw?.headers, k).toEqual(messy.imports[k].sheet.headers)
      expect(e?.issues, k).toEqual(messy.imports[k].result.issues)
      expect(e?.mappingConfirmed, k).toEqual(starter.seed[k]?.mappingConfirmed)
    }
    expect(full.workers?.certification).toEqual(starter.seed.workers?.certification)
  })

  it('certifies the gold datasets with control totals that reconcile, and confirms only the silver mappings', () => {
    const { state, q } = qualityOf(messy)
    for (const k of DATASET_KEYS) {
      const v = state.versions[k]
      const tier = SAMPLE_TIERS[k]
      expect(!!v.mappingConfirmedAt, k).toBe(tier === 'silver' || tier === 'gold')
      expect(!!v.certification, k).toBe(tier === 'gold')
      if (tier === 'gold') expect(q.checks(k).find((r) => r.id === 'control-totals')?.pass, k).toBe(true)
    }
    const hc = state.versions.workers.certification!.controlTotals!.find(
      (t) => t.metric === 'activeHeadcount',
    )
    expect(hc).toMatchObject({ expected: 1_456, actual: 1_456 })
  })
})
