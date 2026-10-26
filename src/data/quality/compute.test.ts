/**
 * The quality index (docs/PLAN.md 16.2): dataset tiers from the silver and gold rules, field tiers
 * capped by fill and by values not recognized or defaulted (for the rows each field applies to),
 * lineage across fields and datasets, plain-English explanations, the memo, and every dataset and
 * field of the data-layer test org.
 */
import { describe, expect, it } from 'vitest'
import { ORG_AS_OF, orgDatasets } from '@/testkit/orgFixture'
import type { ImportIssue } from '../import/types'
import { DATASET_KEYS, type DatasetKey, type Datasets } from '../schema'
import { computeQuality, type VersionMap } from './compute'
import { FIELD_REFS } from './fieldRef'
import { emptyDatasets, req, smallCompany, worker } from './test-fixtures'
import type { DatasetVersion } from './types'
import { confirmVersion, makeCertification, makeVersion } from './versions'

const AS_OF = '2026-09-30'

function upload(
  key: DatasetKey,
  data: Datasets,
  issues: ImportIssue[] = [],
  rowsIn?: number,
): DatasetVersion {
  return makeVersion({
    dataset: key,
    source: 'upload',
    rows: data[key] as object[],
    versionId: `${key}-v1`,
    fileName: `${key}.xlsx`,
    importedAt: '2026-10-01T09:00:00.000Z',
    mapping: { employeeId: { header: 'ID', confidence: 'high', score: 1, reason: '' } },
    issues,
    rowsIn,
  })
}

const confirmed = (v: DatasetVersion) => confirmVersion(v, 'Jamie', '2026-10-02T10:00:00.000Z')

function certified(
  v: DatasetVersion,
  data: Datasets,
  totals = [] as { metric: 'activeHeadcount' | 'filledPositions'; expected: number }[],
) {
  const c = confirmed(v)
  return {
    ...c,
    certification: makeCertification({
      version: c,
      data,
      asOf: AS_OF,
      at: '2026-10-03T10:00:00.000Z',
      input: {
        by: 'HRIS team',
        controlTotals: totals.map((t) => ({ label: 'Headcount per HRIS', tolerance: 0.005, ...t })),
      },
    }),
  }
}

const issue = (
  row: number,
  field: string,
  code: ImportIssue['code'],
  id: string | null = null,
): ImportIssue => ({
  row,
  id,
  field,
  label: field,
  value: 'x',
  code,
  issue: 'x',
  action: code === 'defaulted' ? 'defaulted' : 'left-blank',
})

/** Workers' row key, as the importer writes it on each issue. */
const wid = (n: number) => `E${String(n).padStart(3, '0')} · P${String(n).padStart(3, '0')}`
/** Positions' row key: position and effective date. */
const pid = (n: number, at: string) => `P${String(n).padStart(3, '0')} · ${at}`

describe('dataset tiers', () => {
  it('is none for an empty dataset and bronze before the mapping is confirmed', () => {
    const data = smallCompany()
    const q = computeQuality(data, { workers: upload('workers', data) }, undefined, { asOf: AS_OF })
    expect(q.datasetTier('freezes')).toBe('none')
    expect(q.explain('freezes')).toBe('No data: Hiring freezes has no rows loaded.')
    expect(q.datasetTier('workers')).toBe('bronze')
    expect(q.explain('workers')).toBe('Bronze: Workers mapping not yet confirmed.')
    expect(q.dataset('workers').missing).toEqual(['Mapping confirmed'])
  })

  it('is silver once confirmed with clean checks, and gold when certified, reconciled and fresh', () => {
    const data = smallCompany()
    const v = upload('workers', data)
    const silver = computeQuality(data, { workers: confirmed(v) }, undefined, { asOf: AS_OF })
    expect(silver.datasetTier('workers')).toBe('silver')
    expect(silver.explain('workers')).toBe('Silver: Workers mapping confirmed 2 Oct by Jamie; not certified.')
    expect(silver.dataset('workers').missing).toEqual(['Certified for this version'])

    const gold = computeQuality(
      data,
      { workers: certified(v, data, [{ metric: 'activeHeadcount', expected: 30 }]) },
      undefined,
      { asOf: AS_OF },
    )
    expect(gold.datasetTier('workers')).toBe('gold')
    expect(gold.explain('workers')).toBe('Gold: Workers certified 3 Oct by HRIS team.')
    expect(gold.dataset('workers').missing).toEqual([])
  })

  it('stays silver when control totals miss the 0.5% tolerance or the data is stale', () => {
    const data = smallCompany()
    const v = upload('workers', data)
    const off = computeQuality(
      data,
      { workers: certified(v, data, [{ metric: 'activeHeadcount', expected: 31 }]) },
      undefined,
      { asOf: AS_OF },
    )
    expect(off.datasetTier('workers')).toBe('silver')
    expect(off.checks('workers').find((r) => r.id === 'control-totals')).toMatchObject({
      pass: false,
      detail: 'Headcount per HRIS does not reconcile.',
    })
    expect(off.explain('workers')).toContain('control totals do not reconcile')

    const stale = computeQuality(data, { workers: certified(v, data) }, undefined, { asOf: '2027-06-30' })
    expect(stale.datasetTier('workers')).toBe('silver')
    expect(stale.checks('workers').find((r) => r.id === 'fresh')).toMatchObject({
      pass: false,
      detail:
        'The latest hire, exit or move is dated 1 Sep 2026, 302 d before the as-of date; 120 d is the limit.',
    })
    expect(stale.explain('workers')).toBe(
      'Silver: Workers mapping confirmed 2 Oct 2026 by Jamie; certified, but the data is not fresh.',
    )
  })

  it('does not carry a certification over to another version', () => {
    const data = smallCompany()
    const v = certified(upload('workers', data), data)
    const next = { ...v, versionId: 'workers-v2' }
    const q = computeQuality(data, { workers: next }, undefined, { asOf: AS_OF })
    expect(q.datasetTier('workers')).toBe('silver')
    expect(q.checks('workers').find((r) => r.id === 'certified')?.detail).toBe(
      'Certified for an earlier version; this version is not certified.',
    )
  })

  it('needs the issue rate within 2% and no blocking issues', () => {
    const data = smallCompany()
    // 2 of 40 rows with an error is 5%.
    const errors = [issue(2, 'level', 'unknown-value', wid(1)), issue(3, 'level', 'unknown-value', wid(2))]
    const q = computeQuality(
      data,
      { workers: confirmed(upload('workers', data, errors)) },
      { workers: errors },
      {
        asOf: AS_OF,
      },
    )
    expect(q.datasetTier('workers')).toBe('bronze')
    const rate = q.checks('workers').find((r) => r.id === 'issue-rate')!
    expect(rate.pass).toBe(false)
    expect(rate.detail).toBe('5.0% of rows (2 of 40) had an import error; 2% is allowed.')
    expect(rate.rows).toEqual([0, 1])
    expect(q.explain('workers')).toBe(
      'Bronze: Workers mapping confirmed 2 Oct by Jamie, but 5.0% of rows (2 of 40) had an import error; 2% is allowed.',
    )

    const blocking: ImportIssue[] = [{ ...issue(0, 'hireDate', 'column-missing'), action: 'row-skipped' }]
    const b = computeQuality(data, { workers: confirmed(upload('workers', data, blocking)) }, undefined, {
      asOf: AS_OF,
    })
    expect(b.datasetTier('workers')).toBe('bronze')
    expect(b.checks('workers').find((r) => r.id === 'no-blocking')?.detail).toBe('1 blocking issue remains.')
  })

  it('needs every link’s references to resolve for all but 2% of rows', () => {
    const data = smallCompany()
    data.reqs = Array.from({ length: 20 }, (_, i) => req(i + 1, { positionId: i < 1 ? 'P999' : 'P031' }))
    const v = confirmed(upload('reqs', data))
    // 1 of 20 is 5%.
    const q = computeQuality(data, { reqs: v }, undefined, { asOf: AS_OF })
    expect(q.datasetTier('reqs')).toBe('bronze')
    const refs = q.checks('reqs').find((r) => r.id === 'references')!
    expect(refs.rows).toEqual([0])
    expect(refs.detail).toBe('5% of rows (1) have a position ID that is not in Positions.')

    // Workers have two links; each is judged on its own and both are named.
    data.workers[5] = { ...data.workers[5], managerId: 'E999' }
    const w = computeQuality(data, { workers: confirmed(upload('workers', data)) }, undefined, {
      asOf: AS_OF,
    })
    const wr = w.checks('workers').find((r) => r.id === 'references')!
    expect(wr.pass).toBe(false)
    expect(wr.detail).toBe(
      // 1 of the 39 rows that name a manager is 2.6%, just over the limit.
      'Every position ID is in Positions. 2.6% of rows (1) have a manager ID that is not in Workers.',
    )
  })

  it('lists the informing checks after the gates: duplicates, reused position IDs, reasons', () => {
    const data = smallCompany()
    data.positions.push({ ...data.positions[0] })
    const q = computeQuality(data, {}, undefined, { asOf: AS_OF })
    const ids = q.checks('positions').map((r) => r.id)
    expect(ids).toEqual([
      'has-rows',
      'mapping-confirmed',
      'no-blocking',
      'issue-rate',
      'references',
      'certified',
      'control-totals',
      'fresh',
      'dates-in-order',
      'no-duplicates',
      'ids-not-reused',
    ])
    expect(q.checks('positions').find((r) => r.id === 'no-duplicates')).toMatchObject({
      pass: false,
      rows: [50],
      detail: '1 row repeats the position ID + effective date of an earlier row.',
    })
  })
})

describe('field tiers', () => {
  function goldCompany(
    mutate: (d: Datasets) => void,
    issues: ImportIssue[] = [],
    key: DatasetKey = 'workers',
  ) {
    const data = smallCompany()
    mutate(data)
    // 100 rows in the file, so one import error stays under the 2% issue rate.
    const v = certified(upload(key, data, issues, 100), data)
    return { data, q: computeQuality(data, { [key]: v }, { [key]: issues }, { asOf: AS_OF }) }
  }

  it('caps a field at bronze when it is under 95% filled for the rows it applies to', () => {
    const { q } = goldCompany(
      (d) => {
        // 4 of the 10 Eliminated rows lose their end date: 60% filled.
        for (const p of d.positions.filter((x) => x.status === 'Eliminated').slice(0, 4)) p.endDate = null
      },
      [],
      'positions',
    )
    expect(q.datasetTier('positions')).toBe('gold')
    expect(q.fieldTier('positions.endDate')).toBe('bronze')
    expect(q.fieldTier('positions.endReason')).toBe('gold')
    expect(q.fieldStats('positions.endDate')).toMatchObject({
      applicableRows: 10,
      filled: 6,
      blank: 4,
      coverage: 0.6,
    })
    expect(q.explain('positions.endDate')).toBe(
      'Bronze: Positions certified 3 Oct by HRIS team. End date is 60% filled for eliminated seats; silver needs 95%.',
    )
    expect(q.fieldRows('positions.endDate', 'blank')).toEqual([31, 33, 35, 37])
  })

  it('caps a field when over 2% of values were defaulted', () => {
    const { q } = goldCompany(() => {}, [issue(9, 'workerType', 'defaulted', wid(8))])
    // 1 of 40 rows is 2.5%.
    expect(q.datasetTier('workers')).toBe('gold')
    expect(q.fieldStats('workers.workerType')).toMatchObject({ defaulted: 1, problemRate: 0.025 })
    expect(q.fieldTier('workers.workerType')).toBe('bronze')
    expect(q.fieldStats('workers.workerType').capReason).toBe(
      'Worker type has 2.5% of values not recognized or defaulted; a field needs 2% or less to count as silver.',
    )
    expect(q.fieldRows('workers.workerType', 'defaulted')).toEqual([7])
  })

  it('knows which values not recognized the importer left blank, so a row is counted once', () => {
    const issues = [issue(34, 'level', 'unknown-value', wid(33))]
    const { data, q } = goldCompany((d) => {
      d.workers[32].level = null
    }, issues)
    const s = q.fieldStats('workers.level')
    expect(s).toMatchObject({ blank: 1, invalid: 1, invalidBlank: 1 })
    expect(q.fieldRows('workers.level', 'blank')).toEqual([32])
    expect(q.fieldRows('workers.level', 'invalid')).toEqual([32])
    // Without the import log the index can't name the row, so it takes as many as there are blanks.
    const v = certified(upload('workers', data, issues, 100), data)
    const noLog = computeQuality(data, { workers: v }, undefined, { asOf: AS_OF })
    expect(noLog.fieldStats('workers.level').invalidBlank).toBe(1)
  })

  it('gives each dataset the freshness its tier is judged by', () => {
    const { q } = goldCompany(() => {})
    const ds = q.dataset('workers')
    const fresh = ds.rules.find((r) => r.id === 'fresh')!
    expect(ds.freshness.fresh).toBe(fresh.pass)
    expect(ds.freshness).toMatchObject({ latest: '2026-09-01', ageDays: 29 })
    expect(q.dataset('requests').freshness).toMatchObject({ latest: null, fresh: false })
    // Freezes carry no event dates: freshness never holds them back.
    expect(q.dataset('freezes').freshness.fresh).toBe(true)
  })

  it('ignores values outside the rows a field applies to', () => {
    const { q } = goldCompany(
      (d) => {
        d.positions[5].endReason = 'Moved away' as never
      },
      [],
      'positions',
    )
    expect(q.fieldStats('positions.endReason')).toMatchObject({ applicableRows: 10, invalid: 0 })
    expect(q.fieldTier('positions.endReason')).toBe('gold')
  })

  it('counts unrecognized values in the rows and blanked ones from the import log', () => {
    const { q } = goldCompany(
      (d) => {
        const eliminated = d.positions.filter((p) => p.status === 'Eliminated')
        eliminated[0].endReason = 'Moved away' as never
        eliminated[1].endReason = null
      },
      [issue(34, 'endReason', 'unknown-value', pid(32, '2026-07-01'))],
      'positions',
    )
    const s = q.fieldStats('positions.endReason')
    expect(s.invalid).toBe(2)
    expect(s.problemRate).toBeCloseTo(0.2)
    expect(s.tier).toBe('bronze')
    expect(q.fieldRows('positions.endReason', 'invalid')).toEqual([31, 33])
  })

  it('is none when the field is blank in every row, and none for an unknown field', () => {
    const { q } = goldCompany((d) => {
      for (const w of d.workers) w.costCenter = null
    })
    expect(q.fieldTier('workers.costCenter')).toBe('none')
    expect(q.explain('workers.costCenter')).toBe('No data: Cost center is blank in every row of Workers.')
    expect(q.fieldTier('workers.salary' as never)).toBe('none')
    expect(q.explain('workers.salary' as never)).toBe(
      'No data: workers.salary is not a field Headcount Planner knows.',
    )
  })

  it('never reads an optional field blank in every row as no data: it applies to no row (the M2 review, UI-1)', () => {
    const { q } = goldCompany((d) => {
      for (const w of d.workers) {
        w.legalEntity = null
        w.costCenter = null
      }
    })
    // Optional (blanks are normal, it reads the location's): the dataset's tier, with nothing to fill.
    expect(q.fieldTier('workers.legalEntity')).toBe('gold')
    expect(q.fieldStats('workers.legalEntity')).toMatchObject({
      blankOk: true,
      filled: 0,
      applicableRows: 0,
      blank: 0,
      coverage: null,
    })
    expect(q.fieldRows('workers.legalEntity', 'applicable')).toEqual([])
    expect(q.fieldRows('workers.legalEntity', 'blank')).toEqual([])
    expect(q.explain('workers.legalEntity')).toMatch(
      /^Gold: .*\. Legal entity is optional and blank in every row\.$/,
    )
    // A figure reading it with a required field takes the required field's tier, never "No data".
    expect(q.tierOf(['workers.legalEntity', 'workers.businessUnit'], [])).toBe('gold')
    // A required field blank in every row is still no data.
    expect(q.fieldTier('workers.costCenter')).toBe('none')
    expect(q.tierOf(['workers.legalEntity', 'workers.costCenter'], [])).toBe('none')
  })

  it('treats "Unknown" as blank, and does not cap blank-ok fields on coverage', () => {
    const data = emptyDatasets()
    data.workers = Array.from({ length: 20 }, (_, i) =>
      worker(i + 1, { location: i < 3 ? 'Unknown' : 'San Jose', fte: i < 10 ? null : 1, positionId: null }),
    )
    const v = confirmed(upload('workers', data))
    const q = computeQuality(data, { workers: v }, undefined, { asOf: AS_OF })
    expect(q.fieldStats('workers.location')).toMatchObject({ filled: 17, coverage: 0.85 })
    expect(q.fieldTier('workers.location')).toBe('bronze')
    // A blank FTE reads as 1: half blank still counts as silver.
    expect(q.fieldStats('workers.fte')).toMatchObject({ coverage: 0.5, blankOk: true })
    expect(q.fieldTier('workers.fte')).toBe('silver')
  })

  it('counts a field only for the rows it applies to: contractors hold no seat', () => {
    const data = smallCompany()
    data.workers.push(worker(41, { workerType: 'Contractor', positionId: null }))
    const q = computeQuality(data, { workers: confirmed(upload('workers', data)) }, undefined, {
      asOf: AS_OF,
    })
    expect(q.fieldStats('workers.positionId')).toMatchObject({
      rows: 41,
      applicableRows: 40,
      coverage: 1,
      scope: 'Employees (not contractors or interns)',
    })
    expect(q.fieldStats('workers.managerId')).toMatchObject({ applicableRows: 40, filled: 40 })
  })

  it('names the dataset when a field had no column in the file', () => {
    const data = smallCompany()
    for (const w of data.workers) w.costCenter = null
    const v = confirmed(upload('workers', data))
    v.mapping.costCenter = { header: null, confidence: 'low', confirmed: true }
    const q = computeQuality(data, { workers: v }, undefined, { asOf: AS_OF })
    expect(q.explain('workers.costCenter')).toBe('No data: Workers had no column for cost center.')
  })

  it('says an optional field had no column without calling it no data', () => {
    const data = smallCompany()
    for (const w of data.workers) w.legalEntity = null
    const v = confirmed(upload('workers', data))
    v.mapping.legalEntity = { header: null, confidence: 'low', confirmed: true }
    const q = computeQuality(data, { workers: v }, undefined, { asOf: AS_OF })
    expect(q.fieldTier('workers.legalEntity')).toBe('silver')
    expect(q.explain('workers.legalEntity')).toMatch(
      /^Silver: .*\. Workers had no column for legal entity, which is optional\.$/,
    )
  })

  it('explains a silver field with its fill rate and reference remaps', () => {
    const data = smallCompany()
    const v = confirmed(upload('workers', data))
    const q = computeQuality(data, { workers: v }, undefined, {
      asOf: AS_OF,
      reference: { changes: { 'workers.businessUnit': 14 }, by: { 'workers.businessUnit': null } },
    })
    expect(q.explain('workers.businessUnit')).toBe(
      'Silver: Workers mapping confirmed 2 Oct by Jamie; not certified. Business unit is 100% filled. Business unit remapped by you for 14 rows.',
    )
  })

  it('caps a gold field at silver when it was remapped after certification', () => {
    const data = smallCompany()
    const v = certified(upload('workers', data), data)
    const q = computeQuality(data, { workers: v }, undefined, {
      asOf: AS_OF,
      reference: {
        changes: { 'workers.department': 3 },
        by: { 'workers.department': 'Sam' },
        at: { 'workers.department': '2026-10-05T09:00:00.000Z' },
      },
    })
    expect(q.fieldTier('workers.department')).toBe('silver')
    expect(q.fieldStats('workers.department').capReason).toBe(
      'Department remapped by Sam for 3 rows after certification; gold needs a new certification.',
    )
  })
})

describe('lineage', () => {
  it('takes the lowest tier among the fields used, or among the fallback datasets', () => {
    const data = smallCompany()
    for (const p of data.positions.filter((x) => x.status === 'Eliminated').slice(0, 4)) p.endDate = null
    const versions: VersionMap = { positions: certified(upload('positions', data), data) }
    const q = computeQuality(data, versions, undefined, { asOf: AS_OF })
    expect(q.tierOf(['positions.endReason'], [])).toBe('gold')
    expect(q.tierOf(['positions.endReason', 'positions.endDate'], [])).toBe('bronze')
    expect(q.limitingOf(['positions.endReason', 'positions.endDate'], [])).toEqual({
      tier: 'bronze',
      dataset: 'positions',
      ref: 'positions.endDate',
    })
    expect(q.tierOf(undefined, ['positions'])).toBe('gold')
    expect(q.tierOf([], ['positions', 'reqs'])).toBe('bronze')
    expect(q.tierOf(undefined, ['positions', 'freezes'])).toBe('none')
    expect(q.tierOf(undefined, [])).toBe('bronze')
    expect(q.explainOf(undefined, ['reqs'])).toBe('Bronze: Requisitions mapping not yet confirmed.')
    expect(q.explainOf(undefined, [])).toBe('Bronze: this number names no data, so it is treated as raw.')
  })
})

describe('memo and the test org', () => {
  it('returns the same index for the same inputs', () => {
    const data = smallCompany()
    const versions: VersionMap = {}
    const a = computeQuality(data, versions, undefined, { asOf: AS_OF })
    expect(computeQuality(data, versions, undefined, { asOf: AS_OF })).toBe(a)
    expect(computeQuality(data, {}, undefined, { asOf: AS_OF })).not.toBe(a)
    expect(computeQuality(data, versions, undefined, { asOf: '2026-08-31' })).not.toBe(a)
  })

  it('evaluates every dataset and field of the test org with finite numbers, and finds its planted references', () => {
    const data = orgDatasets()
    const versions = Object.fromEntries(
      DATASET_KEYS.map((k) => [
        k,
        confirmed(makeVersion({ dataset: k, source: 'sample', rows: data[k] as object[] })),
      ]),
    ) as VersionMap
    const q = computeQuality(data, versions, undefined, { asOf: ORG_AS_OF })
    for (const ref of FIELD_REFS) {
      const s = q.fieldStats(ref)
      if (s.coverage != null) expect(Number.isFinite(s.coverage)).toBe(true)
      expect(q.explain(ref).length).toBeGreaterThan(10)
    }
    // The org plants references that do not resolve: a worker in P-GHOST, pay for E-NOBODY, a req
    // for P-GHOST2 and a trade that gives P-X. Those datasets stay bronze; the rest are silver.
    expect(Object.fromEntries(DATASET_KEYS.map((k) => [k, q.datasetTier(k)]))).toEqual({
      positions: 'silver',
      workers: 'bronze',
      comp: 'bronze',
      reqs: 'bronze',
      requests: 'bronze',
      targets: 'silver',
      freezes: 'silver',
      assumptions: 'silver',
    })
    expect(q.checks('requests').find((r) => r.id === 'references')?.rows).toEqual([2])
    expect(q.checks('comp').find((r) => r.id === 'references')?.rows).toEqual([11])
  })
})
