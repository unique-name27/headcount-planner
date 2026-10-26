/**
 * The facts behind the tiers and the version records (docs/PLAN.md 5.2 and 16.2): references per
 * link (workers point at positions and at other workers), dates in order, duplicates as the
 * importer reads them, position IDs never reused, reason codes a type does not offer, freshness
 * from events or a pay snapshot, control totals, version records, the history of 3, and the
 * sample's seed.
 */
import { describe, expect, it } from 'vitest'
import { ORG_AS_OF, orgDatasets } from '@/testkit/orgFixture'
import type { ParsedSheet } from '../import/types'
import {
  checkReferences,
  computeControlTotal,
  controlMetricsFor,
  datesOutOfOrder,
  duplicateRows,
  freshness,
  reasonsNotOffered,
  reconciles,
  reusedPositionIds,
} from './rules'
import { buildSampleState, mergeStoredSample } from './seed'
import { comp, pos, req, request, smallCompany, worker } from './test-fixtures'
import {
  confirmVersion,
  droppedVersions,
  isCertified,
  isVersion,
  makeCertification,
  makeVersion,
  newVersionId,
  pushHistory,
  sampleVersionId,
  toVersionMapping,
} from './versions'

describe('references', () => {
  it('checks each link of a dataset and finds the rows that do not resolve', () => {
    const data = smallCompany()
    data.reqs = [req(1), req(2, { positionId: 'P999' }), req(3, { positionId: null })]
    const [r] = checkReferences('reqs', data)
    expect(r.rows).toEqual([1])
    expect(r.withRef).toBe(2)
    expect(r.targetEmpty).toBe(false)
    expect(checkReferences('reqs', { ...data, positions: [] })[0].targetEmpty).toBe(true)
    expect(checkReferences('freezes', data)).toEqual([])
  })

  it('checks workers against positions and against other workers', () => {
    const data = smallCompany()
    data.workers[3] = { ...data.workers[3], positionId: 'P-GHOST' }
    data.workers[4] = { ...data.workers[4], managerId: 'E999' }
    const [seats, managers] = checkReferences('workers', data)
    expect(seats.link.target).toBe('positions')
    expect(seats.rows).toEqual([3])
    expect(managers.link.target).toBe('workers')
    expect(managers.rows).toEqual([4])
  })

  it('reads a trade’s give seats one ID at a time', () => {
    const data = smallCompany()
    data.requests = [
      request(1, { type: 'Trade', reasonCode: 'Level mix', givePositionIds: 'P031; P032' }),
      request(2, { type: 'Trade', reasonCode: 'Level mix', givePositionIds: 'P031;P-X' }),
    ]
    const [, give] = checkReferences('requests', data)
    expect(give.link.multi).toBe(true)
    expect(give.withRef).toBe(2)
    expect(give.rows).toEqual([1])
  })
})

describe('dates, duplicates, reused IDs and reasons', () => {
  it('finds dates out of order', () => {
    const rows = [
      worker(1, { hireDate: '2026-01-05', assignmentStart: '2026-01-01' }),
      worker(2, { hireDate: '2020-01-01', terminationDate: '2019-12-31' }),
      worker(3, { hireDate: '2020-01-01', assignmentStart: '2021-01-01', assignmentEnd: '2022-06-30' }),
    ]
    expect(datesOutOfOrder('workers', rows)).toEqual([0, 1])
    expect(
      datesOutOfOrder('reqs', [req(1, { openedDate: '2026-08-01', offerAcceptedDate: '2026-07-01' })]),
    ).toEqual([0])
    expect(datesOutOfOrder('positions', [pos(1)])).toEqual([])
  })

  it('finds duplicate keys as the importer reads them: two stints of a rehire are two rows', () => {
    const rows = [
      worker(1, { positionId: null, hireDate: '2015-01-01', terminationDate: '2020-06-30' }),
      worker(1, { positionId: null, hireDate: '2023-05-01' }),
      worker(1, { positionId: null, hireDate: '2023-05-01', assignmentStart: '2023-05-01' }),
    ]
    expect(duplicateRows('workers', rows)).toEqual([2])
    expect(duplicateRows('positions', [pos(1), pos(1, { effectiveDate: '2026-07-01' }), pos(1)])).toEqual([2])
  })

  it('finds a position ID used again after its seat was eliminated', () => {
    const rows = [
      pos(1),
      pos(1, { effectiveDate: '2026-07-01', status: 'Eliminated', endDate: '2026-06-30' }),
      pos(1, { effectiveDate: '2026-09-01', status: 'Open' }),
      pos(2, { effectiveDate: '2026-07-01', status: 'Eliminated' }),
      pos(2, { effectiveDate: '2026-08-01', status: 'Eliminated' }),
    ]
    expect(reusedPositionIds(rows)).toEqual([2])
  })

  it('flags reasons a type does not offer, except the cycle’s own cut line', () => {
    const rows = [
      request(1, { type: 'Trade', reasonCode: 'Growth' }),
      request(2, { type: 'Trade', reasonCode: 'Cost-neutral mix' }),
      request(3, { type: 'New role', reasonCode: 'Cost-neutral mix' }),
      request(4, { type: 'New role', reasonCode: 'Below the cut line', state: 'Rejected' }),
      request(5, { type: 'New role', reasonCode: 'Below the cut line', state: 'Submitted' }),
    ]
    expect(reasonsNotOffered(rows)).toEqual([0, 2, 4])
  })
})

describe('freshness', () => {
  it('judges freshness from the latest event on or before the as-of date', () => {
    const rows = [worker(1, { hireDate: '2026-08-01' }), worker(2, { hireDate: '2026-12-01' })]
    expect(freshness('workers', rows, '2026-09-30')).toMatchObject({
      latest: '2026-08-01',
      ageDays: 60,
      maxDays: 120,
      fresh: true,
    })
    expect(freshness('workers', rows, '2027-06-30').fresh).toBe(false)
    // No event dated at all: not fresh.
    expect(freshness('workers', [], '2026-09-30').fresh).toBe(false)
    // A dataset with no event dates is never stale.
    expect(freshness('freezes', [], '2026-09-30')).toMatchObject({ latest: null, what: null, fresh: true })
    // The limit in force wins over the default.
    expect(freshness('workers', rows, '2026-09-30', null, 30).fresh).toBe(false)
  })

  it('judges a pay snapshot by the date it was taken, 45 d at most', () => {
    expect(freshness('comp', [], '2026-09-30', '2026-09-15')).toMatchObject({
      latest: '2026-09-15',
      ageDays: 15,
      what: 'pay extract',
      fresh: true,
    })
    expect(freshness('comp', [], '2026-09-30', '2026-08-01').fresh).toBe(false)
    // Taken after the as-of date: current for it.
    expect(freshness('comp', [], '2026-09-30', '2026-10-03T09:00')).toMatchObject({ ageDays: 0, fresh: true })
    // Nothing says when it was taken: it cannot be shown to be fresh.
    expect(freshness('comp', [], '2026-09-30')).toMatchObject({ latest: null, fresh: false })
  })
})

describe('control totals', () => {
  it('computes them from the data and reconciles within tolerance', () => {
    const data = smallCompany()
    expect(computeControlTotal('activeHeadcount', data, 'workers', '2026-09-30')).toBe(30)
    expect(computeControlTotal('activeHeadcount', data, 'workers', '2026-08-31')).toBe(29)
    // The last day counts: someone who left on 30 Jun is a head that day.
    expect(computeControlTotal('activeHeadcount', data, 'workers', '2026-06-30')).toBe(39)
    expect(computeControlTotal('exits12m', data, 'workers', '2026-09-30')).toBe(10)
    expect(computeControlTotal('filledPositions', data, 'positions', '2026-09-30')).toBe(30)
    expect(computeControlTotal('filledPositions', data, 'positions', '2026-06-30')).toBe(40)
    expect(computeControlTotal('rows', data, 'reqs', '2026-09-30')).toBe(2)
    expect(computeControlTotal('openReqs', data, 'reqs', '2026-09-30')).toBe(2)
    expect(computeControlTotal('openReqs', data, 'workers', '2026-09-30')).toBeNull()
    expect(computeControlTotal('constructor' as never, data, 'workers', '2026-09-30')).toBeNull()
    expect(reconciles({ expected: 1456, tolerance: 0.005 }, 1450)).toBe(true)
    expect(reconciles({ expected: 1456, tolerance: 0.005 }, 1440)).toBe(false)
    expect(reconciles({ expected: 0, tolerance: 0.005 }, 0)).toBe(true)
    expect(reconciles({ expected: 10, tolerance: 0.005 }, null)).toBe(false)
    expect(reconciles({ expected: 100, tolerance: Number.NaN }, 101, 0.01)).toBe(true)
  })

  it('totals full-time base in USD at the plan rate of each pay row’s currency', () => {
    const data = smallCompany()
    data.comp = [
      comp(1, { baseSalary: 200_000 }),
      comp(2, { currency: 'EUR', baseSalary: 100_000 }),
      comp(2, { effectiveDate: '2026-10-01', currency: 'EUR', baseSalary: 120_000 }),
      // A blank currency takes the location's: San Jose pays in USD.
      comp(3, { currency: null, baseSalary: 50_000 }),
    ]
    data.assumptions = [
      { version: 'fy27-working', table: 'fx', key: 'EUR|plan|2026-04', value: 1.05 },
      { version: 'fy27-working', table: 'fx', key: 'EUR|plan|2026-09', value: 1.1 },
      { version: 'fy27-working', table: 'fx', key: 'EUR|actual|2026-09', value: 2 },
    ]
    expect(computeControlTotal('totalBaseUsd', data, 'comp', '2026-09-30')).toBe(360_000)
    expect(controlMetricsFor('comp').map((m) => [m.id, m.pay ?? false])).toEqual([
      ['rows', false],
      ['totalBaseUsd', true],
    ])
  })
})

describe('versions', () => {
  it('makes an unconfirmed, uncertified version from an import', () => {
    const rows = smallCompany().workers
    const v = makeVersion({
      dataset: 'workers',
      source: 'upload',
      rows,
      now: Date.UTC(2026, 9, 1),
      mapping: { employeeId: { header: 'Emp ID', confidence: 'high', score: 1, reason: 'exact' } },
      rowsIn: 45,
    })
    expect(v.versionId).toMatch(/^workers-[0-9a-z]+-[0-9a-z]{4}$/)
    expect(v.mapping).toEqual({ employeeId: { header: 'Emp ID', confidence: 'high', confirmed: false } })
    expect(v.issues.rowsIn).toBe(45)
    expect(v.rowCount).toBe(40)
    expect(v.mappingConfirmedAt).toBeNull()
    expect(isCertified(v)).toBe(false)
    expect(isVersion(v)).toBe(true)
    expect(isVersion({ versionId: 'x' })).toBe(false)
    expect(newVersionId('comp', 0)).not.toBe(newVersionId('comp', 0))
    expect(sampleVersionId('reqs')).toBe('sample-reqs')
    expect(sampleVersionId('reqs', true)).toBe('sample-reqs-raw')
  })

  it('reads a stored mapping field by field', () => {
    expect(
      toVersionMapping({
        a: { header: 'A', confidence: 'medium', confirmed: true },
        b: { header: 7, confidence: 'certain' } as never,
        c: null as never,
      }),
    ).toEqual({
      a: { header: 'A', confidence: 'medium', confirmed: true },
      b: { header: null, confidence: 'low', confirmed: false },
    })
  })

  it('confirms every field and certifies with actual control totals', () => {
    const data = smallCompany()
    const v = confirmVersion(
      makeVersion({
        dataset: 'workers',
        source: 'upload',
        rows: data.workers,
        mapping: toVersionMapping({ name: { header: 'Name', confidence: 'low', confirmed: false } }),
      }),
      ' Jamie ',
      '2026-10-02T00:00:00.000Z',
    )
    expect(v.mapping.name.confirmed).toBe(true)
    expect(v.mappingConfirmedBy).toBe('Jamie')
    const c = makeCertification({
      version: v,
      data,
      asOf: '2026-09-30',
      at: '2026-10-03T10:00:00.000Z',
      input: {
        by: 'HRIS team',
        note: '  ',
        controlTotals: [
          { label: 'HRIS headcount', metric: 'activeHeadcount', expected: 30, tolerance: Number.NaN },
        ],
      },
    })
    expect(c).toEqual({
      by: 'HRIS team',
      at: '2026-10-03T10:00:00.000Z',
      controlTotals: [
        { label: 'HRIS headcount', metric: 'activeHeadcount', expected: 30, tolerance: 0.005, actual: 30 },
      ],
      versionId: v.versionId,
      asOf: '2026-09-30',
    })
    expect(isCertified({ ...v, certification: c })).toBe(true)
    expect(isCertified({ ...v, versionId: 'other', certification: c })).toBe(false)
  })

  it('keeps the last three earlier versions and says which dropped out', () => {
    const mk = (id: string) => makeVersion({ dataset: 'comp', source: 'upload', rows: [], versionId: id })
    let history = pushHistory([], mk('a'))
    history = pushHistory(history, mk('b'))
    history = pushHistory(history, mk('c'))
    const before = history
    history = pushHistory(history, mk('d'))
    expect(history.map((v) => v.versionId)).toEqual(['d', 'c', 'b'])
    expect(droppedVersions(before, history, mk('e'))).toEqual(['a'])
    // The same version pushed twice is kept once.
    expect(pushHistory(history, mk('c')).map((v) => v.versionId)).toEqual(['c', 'd', 'b'])
  })
})

describe('sample seed', () => {
  const base = orgDatasets()

  it('without a seed, every dataset is the plain sample with a fixed version ID', () => {
    const s = buildSampleState(base, null, ORG_AS_OF)
    expect(s.data.workers).toBe(base.workers)
    expect(s.versions.workers.versionId).toBe(sampleVersionId('workers'))
    expect(s.versions.workers.mapping).toEqual({})
    expect(s.raws).toEqual([])
  })

  it('applies seeded rows, raw sheets, a starter confirmation and certification', () => {
    const sheet: ParsedSheet = {
      name: 'Reqs',
      headerRow: 0,
      headers: ['ID'],
      rows: [{ ID: 'R1' }],
      rowNumbers: [2],
    }
    const s = buildSampleState(
      base,
      {
        reqs: {
          rows: base.reqs.slice(0, 2),
          raw: sheet,
          fileName: 'ATS export.csv',
          mapping: { reqId: { header: 'ID', confidence: 'high', score: 1, reason: '' } },
        },
        positions: { mappingConfirmed: { by: 'Finance', at: '2026-09-15T00:00:00.000Z' } },
        workers: {
          certification: {
            by: 'HRIS team',
            at: '2026-09-20T00:00:00.000Z',
            controlTotals: [
              { label: 'HRIS headcount', metric: 'activeHeadcount', expected: 11, tolerance: 0.005 },
            ],
          },
        },
      },
      ORG_AS_OF,
    )
    expect(s.data.reqs).toHaveLength(2)
    expect(s.versions.reqs).toMatchObject({
      versionId: 'sample-reqs-raw',
      hasRaw: true,
      fileName: 'ATS export.csv',
    })
    expect(s.raws).toHaveLength(1)
    expect(s.versions.positions.mappingConfirmedBy).toBe('Finance')
    expect(s.versions.workers.mappingConfirmedBy).toBe('HRIS team')
    // E1 to E11 are employees on 30 Sep (E12 is a contractor); E8's two assignments are one person.
    expect(s.versions.workers.certification?.controlTotals?.[0].actual).toBe(11)
  })

  it('keeps your own decisions on a stored sample version', () => {
    const fresh = buildSampleState(base, null, ORG_AS_OF).versions.targets
    const stored = confirmVersion(fresh, 'You', '2026-10-01T00:00:00.000Z')
    expect(mergeStoredSample(fresh, stored).mappingConfirmedBy).toBe('You')
    expect(mergeStoredSample(fresh, { ...stored, versionId: 'other' }).mappingConfirmedBy).toBeNull()
    expect(mergeStoredSample(fresh, null)).toBe(fresh)
  })
})
