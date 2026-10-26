/**
 * Quality basics (docs/PLAN.md 16.2): tier order and the data standard, field references against the
 * schema, vocabularies per field, import-log counts, and wording that never rounds a gap away.
 */
import { describe, expect, it } from 'vitest'
import type { ImportIssue } from '../import/types'
import { DATASETS, LEVELS } from '../schema'
import { datasetOfRef, FIELD_REFS, fieldRef, invalidRefs, isFieldRef, parseFieldRef } from './fieldRef'
import { dedupeKey, rowKeyOf, summarizeImport } from './importSummary'
import { limitText, pctAgainst, pctText, shortDate } from './text'
import { compareTiers, lowestTier, meetsStandard, minTier, TIERS, tierRank } from './tier'
import { isUnrecognized, vocabList, vocabOf } from './vocab'

describe('tiers and the standard', () => {
  it('orders none < bronze < silver < gold', () => {
    expect(TIERS.map(tierRank)).toEqual([0, 1, 2, 3])
    expect(minTier('gold', 'bronze')).toBe('bronze')
    expect(compareTiers('silver', 'gold')).toBe(-1)
    expect(lowestTier(['gold', 'silver', 'gold'])).toBe('silver')
    expect(lowestTier([])).toBe('bronze')
    expect(lowestTier([], 'none')).toBe('none')
  })

  it('shows a number when its tier meets the standard; no data never does', () => {
    expect(meetsStandard('gold', 'gold')).toBe(true)
    expect(meetsStandard('silver', 'gold')).toBe(false)
    expect(meetsStandard('silver', 'silver')).toBe(true)
    expect(meetsStandard('bronze', 'bronze')).toBe(true)
    expect(meetsStandard('none', 'bronze')).toBe(false)
  })
})

describe('field references', () => {
  it('validates against the schema', () => {
    expect(isFieldRef('workers.terminationDate')).toBe(true)
    expect(isFieldRef('requests.steps')).toBe(true)
    expect(isFieldRef('workers.salary')).toBe(false)
    expect(isFieldRef('employees.name')).toBe(false)
    expect(isFieldRef('workers.__proto__')).toBe(false)
    expect(isFieldRef(42)).toBe(false)
    expect(parseFieldRef('reqs.stage')).toEqual({ dataset: 'reqs', field: 'stage' })
    expect(parseFieldRef('reqs.currentStage')).toBeNull()
    expect(datasetOfRef('reqs.currentStage')).toBe('reqs')
    expect(datasetOfRef('nope.stage')).toBeNull()
    expect(datasetOfRef('constructor.stage')).toBeNull()
    expect(fieldRef('comp', 'targetBonusPct')).toBe('comp.targetBonusPct')
    expect(invalidRefs(['comp.targetBonusPct', 'comp.meritPct'])).toEqual(['comp.meritPct'])
  })

  it('lists every schema field once', () => {
    const n = DATASETS.reduce((a, d) => a + d.fields.length, 0)
    expect(FIELD_REFS).toHaveLength(n)
    expect(new Set(FIELD_REFS).size).toBe(n)
  })
})

describe('vocabularies', () => {
  it('flags values outside a field list; free text without a list is never flagged', () => {
    expect(isUnrecognized('positions.status', 'Vacant')).toBe(true)
    expect(isUnrecognized('positions.status', 'Open')).toBe(false)
    expect(isUnrecognized('workers.level', 'L4')).toBe(true)
    expect(isUnrecognized('workers.level', 'P4')).toBe(false)
    expect(isUnrecognized('requests.reasonCode', 'Because')).toBe(true)
    expect(isUnrecognized('assumptions.table', 'band')).toBe(false)
    expect(isUnrecognized('workers.location', 'London')).toBe(false)
    expect(isUnrecognized('positions.department', 'Anything')).toBe(false)
    expect(isUnrecognized('workers.onLeave', true)).toBe(false)
    expect(isUnrecognized('requests.steps', [])).toBe(false)
    expect(vocabList('positions.level')).toEqual([...LEVELS])
    expect(vocabOf('positions.title')).toBeUndefined()
  })

  it('reads an official list in place of the built-in one', () => {
    const overlay = {
      version: 'x',
      refs: new Map([['positions.department', new Set(['Design Verification'])]]),
    }
    expect(isUnrecognized('positions.department', 'Photonics', overlay)).toBe(true)
    expect(isUnrecognized('positions.department', 'Design Verification', overlay)).toBe(false)
    expect(isUnrecognized('positions.status', 'Vacant', overlay)).toBe(true)
  })
})

describe('row keys', () => {
  it('joins the filled row-key values for the import log', () => {
    expect(rowKeyOf('workers', { employeeId: 'E1', positionId: 'P1', assignmentStart: null })).toBe('E1 · P1')
    expect(rowKeyOf('reqs', { reqId: null })).toBeNull()
  })

  it('reads a worker’s blank assignment start as the hire date when telling rows apart', () => {
    const a = { employeeId: 'E1', positionId: null, assignmentStart: null, hireDate: '2015-01-01' }
    const b = { employeeId: 'E1', positionId: null, assignmentStart: null, hireDate: '2023-05-01' }
    const c = { employeeId: 'E1', positionId: null, assignmentStart: '2023-05-01', hireDate: '2023-05-01' }
    expect(dedupeKey('workers', a)).not.toBe(dedupeKey('workers', b))
    expect(dedupeKey('workers', b)).toBe(dedupeKey('workers', c))
    expect(dedupeKey('positions', { positionId: 'P1', effectiveDate: null, startDate: '2026-01-01' })).toBe(
      'P1\u0001',
    )
  })
})

describe('import summary', () => {
  const issue = (p: Partial<ImportIssue>): ImportIssue => ({
    row: 2,
    id: 'E001',
    field: 'level',
    label: 'Level',
    value: 'x',
    code: 'unknown-value',
    issue: '',
    action: 'left-blank',
    ...p,
  })

  it('counts codes, fields, error rows, blocking issues, invalid and defaulted values', () => {
    const rows = [
      { employeeId: 'E001', workerType: 'Employee', location: 'Bengaluru', name: 'A' },
      { employeeId: 'E002', workerType: 'Unknown', location: 'Bengaluru', name: null },
      { employeeId: 'E003', workerType: 'Employee', location: 'Bengaluru', name: 'C' },
    ]
    const c = summarizeImport({
      dataset: 'workers',
      rows,
      issues: [
        issue({}),
        issue({ row: 3, id: 'E002', field: 'hireDate', code: 'unreadable' }),
        issue({ row: 5, id: 'E004', field: 'hireDate', code: 'missing-required', action: 'row-skipped' }),
        issue({ row: 2, id: 'E001', field: 'workerType', code: 'defaulted', action: 'defaulted' }),
        // The default left "Unknown", which is blank anyway: not counted as defaulted.
        issue({ row: 3, id: 'E002', field: 'workerType', code: 'defaulted', action: 'defaulted' }),
        issue({ row: 0, id: null, field: 'location', code: 'defaulted', action: 'defaulted' }),
        issue({ row: 0, id: null, field: '', code: 'manager-cycle', action: 'cleared' }),
      ],
      mapped: (f) => f !== 'location',
    })
    expect(c.rowsIn).toBe(4)
    expect(c.rowsOut).toBe(3)
    expect(c.total).toBe(7)
    expect(c.byCode).toMatchObject({ 'unknown-value': 1, unreadable: 1, defaulted: 3, 'manager-cycle': 1 })
    expect(c.rowsWithErrors).toBe(3)
    expect(c.blocking).toBe(1)
    expect(c.invalidByField).toEqual({ level: 1, hireDate: 1 })
    // Location had no column, so every filled value came from the default.
    expect(c.defaultedByField).toEqual({ workerType: 1, location: 3 })
  })
})

describe('wording helpers', () => {
  it('never rounds a gap away', () => {
    expect(pctText(0.996)).toBe('99.6%')
    expect(pctText(0.003)).toBe('<1%')
    expect(pctText(0.6)).toBe('60%')
    expect(pctText(1)).toBe('100%')
    expect(pctText(Number.NaN)).toBe('—')
  })

  it('states a share against its threshold without contradicting the verdict', () => {
    expect(pctAgainst(0.946, 0.95, 'min')).toBe('94.6%')
    expect(pctAgainst(0.0247, 0.02, 'max')).toBe('2.5%')
    expect(pctAgainst(0.6, 0.95, 'min')).toBe('60%')
    expect(limitText(0.975)).toBe('97.5%')
    expect(limitText(0.005)).toBe('0.5%')
  })

  it('drops the year in the reference year', () => {
    expect(shortDate('2026-10-02T10:00:00.000Z', '2026')).toBe('2 Oct')
    expect(shortDate('2025-01-15', '2026')).toBe('15 Jan 2025')
    expect(shortDate(null)).toBe('an unknown date')
  })
})
