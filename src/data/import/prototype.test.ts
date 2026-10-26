/**
 * Row objects from files are prototype-safe (docs/PLAN.md 5.2): rows are built with
 * `Object.create(null)`, columns named `__proto__`, `constructor` or `prototype` are refused when the
 * sheet is read, a record holds the schema's field keys and nothing else, and no vocabulary lookup
 * ever answers with something every object inherits ("constructor" is not a site, a currency, a role
 * or an assumption table).
 */
import { afterEach, describe, expect, it } from 'vitest'
import { datasetDef } from '../schema'
import { applyMapping } from './apply'
import { autoMap } from './automap'
import { canonicalLocation, canonicalText, normalizeCurrency } from './canonical'
import { readDate } from './dates'
import { readAssumptionKey } from './defaults'
import { readWorkbook } from './parse'
import { sheetFromRows } from './sheet'
import { readSteps } from './steps'
import { headerTokens } from './text'
import type { ParsedSheet } from './types'
import { normalizeAssumptionTable, normalizeEnumValue, normalizeLevel } from './vocab'

const RESERVED = ['__proto__', 'constructor', 'prototype']
const INHERITED = ['constructor', '__proto__', 'toString', 'valueOf', 'hasOwnProperty', 'prototype']

afterEach(() => {
  // Nothing a file holds may reach the prototype every object shares.
  expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  expect(Object.keys(Object.prototype)).toEqual([])
})

describe('rows read from a file', () => {
  it('have no prototype and never take a reserved column name', () => {
    const sheet = sheetFromRows('Workers', [
      ['Employee ID', '__proto__', 'Constructor', ' prototype ', 'Hire date', 'Worker type'],
      ['E1', '{"polluted": true}', 'x', 'y', '2020-01-06', 'Employee'],
    ]) as ParsedSheet
    expect(sheet.headers).toEqual(['Employee ID', 'Hire date', 'Worker type'])
    expect(sheet.dropped?.map((d) => d.reason)).toEqual(['reserved', 'reserved', 'reserved'])
    for (const row of sheet.rows) {
      expect(Object.getPrototypeOf(row)).toBeNull()
      expect(Object.keys(row)).toEqual(['Employee ID', 'Hire date', 'Worker type'])
    }
  })

  it('reads a CSV with reserved headers into the same safe rows', async () => {
    const csv = '__proto__,constructor,prototype,Req ID,Status,Opened date\n{},a,b,R-1,Open,2026-09-01\n'
    const book = await readWorkbook(new TextEncoder().encode(csv), 'reqs.csv')
    const sheet = book.sheets[0]
    expect(sheet.headers).toEqual(['Req ID', 'Status', 'Opened date'])
    expect(Object.getPrototypeOf(sheet.rows[0])).toBeNull()
    expect(JSON.stringify(sheet.rows)).toBe('[{"Req ID":"R-1","Status":"Open","Opened date":"2026-09-01"}]')
  })

  it('import to records with no prototype that hold exactly the schema fields', () => {
    const sheet = sheetFromRows('Workers', [
      ['Employee ID', 'Hire date', 'Worker type', 'Extra column'],
      ['E1', '2020-01-06', 'Employee', 'anything'],
    ]) as ParsedSheet
    const def = datasetDef('workers')
    const r = applyMapping({ sheet, def, mapping: autoMap(sheet.headers, sheet.rows, def) })
    const row = r.rows[0] as unknown as Record<string, unknown>
    expect(Object.getPrototypeOf(row)).toBeNull()
    expect(Object.keys(row)).toEqual(def.fields.map((f) => f.key))
  })

  it('never let a hand-built sheet’s inherited or reserved keys reach a record', () => {
    // Rows from elsewhere (pasted tables, a parsed JSON file) can carry an own __proto__ key.
    const hostile = JSON.parse(
      '{"Employee ID": "E1", "Hire date": "2020-01-06", "__proto__": {"polluted": 1}}',
    )
    const sheet: ParsedSheet = {
      name: 'Workers',
      headerRow: 0,
      headers: ['Employee ID', 'Hire date', 'Worker type', 'toString'],
      rows: [hostile],
      rowNumbers: [2],
    }
    const def = datasetDef('workers')
    const r = applyMapping({ sheet, def, mapping: autoMap(sheet.headers, sheet.rows, def) })
    const row = r.rows[0] as unknown as Record<string, unknown>
    expect(row.employeeId).toBe('E1')
    // "Worker type" is absent from the row (not inherited): the documented default fills it.
    expect(row.workerType).toBe('Employee')
    expect(Object.getPrototypeOf(row)).toBeNull()
    expect('polluted' in row).toBe(false)
  })

  it('keep a cell that spells a reserved name as plain text', () => {
    const sheet = sheetFromRows('Positions', [
      [
        'Position ID',
        'Effective date',
        'Status',
        'Level',
        'Business unit',
        'Cost center',
        'Location',
        'Legal entity',
      ],
      ['constructor', '2026-04-01', 'Filled', 'P3', '__proto__', 'toString', 'constructor', 'hasOwnProperty'],
    ]) as ParsedSheet
    const def = datasetDef('positions')
    const r = applyMapping<'positions'>({ sheet, def, mapping: autoMap(sheet.headers, sheet.rows, def) })
    expect(r.rows[0]).toMatchObject({
      positionId: 'constructor',
      businessUnit: '__proto__',
      costCenter: 'toString',
      location: 'constructor',
      legalEntity: 'hasOwnProperty',
    })
    for (const v of Object.values(r.rows[0])) expect(typeof v === 'function').toBe(false)
  })
})

describe('vocabulary lookups', () => {
  it.each(INHERITED)('never read %s as a site, currency, role, table, level or enum value', (word) => {
    expect(canonicalLocation(word)).toBeNull()
    expect(canonicalText('positions', 'legalEntity', word)).toBeNull()
    expect(normalizeCurrency(word)).toBeNull()
    expect(normalizeAssumptionTable(word.toLowerCase())).toBeNull()
    expect(normalizeLevel(word)).toBeNull()
    expect(
      normalizeEnumValue('positions', 'status', datasetDef('positions').fields[2].values ?? [], word),
    ).toBeNull()
    expect(readSteps(`${word} E1 Approved`)).toBeNull()
    expect(readSteps(`Manager E1 ${word}`)).toBeNull()
    expect(readDate(`1 ${word} 2026`)).toEqual({ ok: false, reason: 'unreadable' })
    for (const t of headerTokens(`${word} name`)) expect(typeof t).toBe('string')
  })

  it('reads a reserved word in an assumption key as a part that does not read', () => {
    expect(readAssumptionKey('trade', 'constructor').problem).toBe(
      '"constructor" is not a part this key can use.',
    )
    expect(readAssumptionKey('band', 'constructor|Munich|FY27').problem).toBe(
      '"constructor" is not a level this key can use.',
    )
  })

  it('refuses every reserved name as a column wherever it is written', () => {
    for (const h of RESERVED) {
      const sheet = sheetFromRows('Sheet1', [
        [h, 'Employee ID'],
        ['x', 'E1'],
      ]) as ParsedSheet
      expect(sheet.headers).toEqual(['Employee ID'])
    }
  })
})
