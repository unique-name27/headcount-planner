/**
 * Which dataset a sheet holds (docs/PLAN.md 16.2): every dataset by its own columns, real exports
 * from HRIS, ATS and planning tools, positions never confused with workers (both carry a position
 * ID, level, cost center and location), the sheet name as a tie-breaker, unrelated sheets low and
 * the template's help sheets ignored.
 */
import { describe, expect, it } from 'vitest'
import { DATASETS } from '../schema'
import { guessDataset, isTemplateHelpSheet } from './detect'
import { sheetFromRows } from './sheet'
import type { ParsedSheet } from './types'

const sheet = (name: string, headers: string[], rows: Record<string, unknown>[] = []): ParsedSheet => ({
  name,
  headerRow: 0,
  headers,
  rows,
  rowNumbers: rows.map((_, i) => i + 2),
})

/** A Workday Position Management export: one row per seat and effective date. */
const POSITION_MANAGEMENT: unknown[][] = [
  [
    'Position ID',
    'Effective Date',
    'Hiring Status',
    'Job Profile',
    'Job Family',
    'Management Level',
    'Company Hierarchy',
    'Supervisory Organization',
    'Cost Center',
    'Location',
    'Company',
    'Reports To Position ID',
    'Worker Type',
    'FTE Percent',
    'Earliest Hire Date',
  ],
  [
    'P-1000',
    '04/01/2026',
    'Filled',
    'Chief executive officer',
    'Executive',
    '1 Executive',
    'Executive Office',
    'Executive Office',
    '1010-SJC',
    'San Jose',
    'Northgate Semiconductor Inc.',
    null,
    'Employee',
    100,
    null,
  ],
  [
    'P-1130',
    '04/01/2026',
    'Filled',
    'Director, Design Verification',
    'Silicon Engineering',
    '5 Director',
    'Silicon Engineering',
    'Design Verification',
    '1130-BLR',
    'Bengaluru',
    'Northgate Semiconductor India Pvt. Ltd.',
    'P-1100',
    'Employee',
    100,
    null,
  ],
  [
    'P-1132',
    '06/15/2026',
    'Open',
    'Senior verification engineer',
    'Silicon Engineering',
    'IC4',
    'Silicon Engineering',
    'Design Verification',
    '1130-MUC',
    'Munich',
    'Northgate Semiconductor GmbH',
    'P-1130',
    'Employee',
    80,
    '11/02/2026',
  ],
]

/** An HRIS worker roster: one row per person in a seat. */
const WORKER_ROSTER: unknown[][] = [
  [
    'Employee ID',
    'Worker',
    'Position ID',
    'Hire Date',
    'Termination Date',
    'Worker Type',
    'Management Level',
    'Supervisory Organization',
    'Cost Center',
    'Location',
    'Company',
    'Manager',
    'FTE',
  ],
  [
    'E0001',
    'Maya Lindqvist',
    'P-1000',
    '03/03/2014',
    null,
    'Regular',
    '1 Executive',
    'Executive Office',
    '1010-SJC',
    'San Jose',
    'Northgate Semiconductor Inc.',
    null,
    1,
  ],
  [
    'E0003',
    'Chen Wei-Ling',
    'P-1130',
    '01/09/2018',
    null,
    'Regular',
    '5 Director',
    'Design Verification',
    '1130-BLR',
    'Bengaluru',
    'Northgate Semiconductor India Pvt. Ltd.',
    'Menon, Rahul',
    1,
  ],
  [
    'E0005',
    'Jonas Becker',
    null,
    '09/01/2021',
    '12/31/2026',
    'Regular',
    'Senior',
    'Design Verification',
    '1130-MUC',
    'Munich',
    'Northgate Semiconductor GmbH',
    'Chen, Wei-Ling',
    0.8,
  ],
]

describe('guessDataset', () => {
  it.each(DATASETS.map((d) => [d.key, d] as const))(
    'recognizes a %s sheet by its columns alone',
    (key, def) => {
      const guesses = guessDataset(
        sheet(
          'Sheet1',
          def.fields.map((f) => f.label),
        ),
      )
      expect(guesses[0].key).toBe(key)
      expect(guesses[0].confidence).toBeGreaterThan(0.6)
      expect(guesses[0].missingRequired).toEqual([])
      expect(guesses[0].confidence).toBeGreaterThan(guesses[1].confidence)
      expect(guesses).toHaveLength(DATASETS.length)
    },
  )

  it('reads a Workday Position Management export as positions and an HRIS worker roster as workers', () => {
    for (const name of ['Position Management', 'Sheet1']) {
      const g = guessDataset(sheetFromRows(name, POSITION_MANAGEMENT)!)
      expect(g[0].key, name).toBe('positions')
      expect(g[0].missingRequired, name).toEqual([])
      expect(g[0].confidence - g[1].confidence, name).toBeGreaterThan(0.1)
    }
    for (const name of ['Worker roster', 'Sheet1']) {
      const g = guessDataset(sheetFromRows(name, WORKER_ROSTER)!)
      expect(g[0].key, name).toBe('workers')
      expect(g[0].missingRequired, name).toEqual([])
      expect(g[0].confidence - g[1].confidence, name).toBeGreaterThan(0.1)
    }
  })

  it('keeps positions and workers apart on a sheet named for the other one', () => {
    expect(guessDataset(sheetFromRows('Workers', POSITION_MANAGEMENT)!)[0].key).toBe('positions')
    expect(guessDataset(sheetFromRows('Positions', WORKER_ROSTER)!)[0].key).toBe('workers')
  })

  it('recognizes an ATS requisition export and a planning-tool target export', () => {
    const reqs = guessDataset(
      sheet('Export', [
        'Job Req ID',
        'Position ID',
        'Req Status',
        'Current Stage',
        'Date Opened',
        'Hiring Manager',
      ]),
    )
    expect(reqs[0].key).toBe('reqs')
    expect(reqs[0].missingRequired).toEqual([])
    const targets = guessDataset(
      sheet('AOP', ['Fiscal Year', 'Level 1', 'Level 2', 'Level 3', 'HC EOP', 'Total Personnel Expense']),
    )
    expect(targets[0].key).toBe('targets')
    expect(targets[0].missingRequired).toEqual([])
  })

  it('recognizes a request log with approval steps and a long-form assumptions sheet', () => {
    expect(
      guessDataset(
        sheet('Sheet1', [
          'Request ID',
          'Type',
          'Approval status',
          'Reason',
          'Requested by',
          'BU',
          'Approvals',
        ]),
      )[0].key,
    ).toBe('requests')
    expect(guessDataset(sheet('Drivers', ['Scenario', 'Driver', 'Org', 'Key', 'Value']))[0].key).toBe(
      'assumptions',
    )
    expect(
      guessDataset(sheet('Sheet1', ['Freeze ID', 'BU', 'Freeze start', 'Freeze end', 'Backfills allowed']))[0]
        .key,
    ).toBe('freezes')
  })

  it('uses the sheet name to break near ties', () => {
    const headers = ['Employee ID', 'Effective date']
    expect(guessDataset(sheet('Compensation', headers))[0].key).toBe('comp')
    const conf = (name: string) =>
      guessDataset(sheet(name, headers)).find((g) => g.key === 'comp')!.confidence
    expect(conf('Total rewards')).toBeCloseTo(conf('Sheet1') + 0.2)
    expect(conf('Comp data 2026')).toBeCloseTo(conf('Sheet1') + 0.1)
  })

  it('scores unrelated sheets low', () => {
    const g = guessDataset(sheet('P&L', ['Account', 'FY26 plan', 'FY26 actual', 'Variance']))
    expect(g[0].confidence).toBeLessThan(0.35)
  })

  it('ignores the template help sheets', () => {
    expect(isTemplateHelpSheet('Read me')).toBe(true)
    expect(isTemplateHelpSheet('fields')).toBe(true)
    expect(isTemplateHelpSheet('Workers')).toBe(false)
    // Lists is the template's only beside its Read me or Fields.
    expect(isTemplateHelpSheet('Lists', ['Read me', 'Workers', 'Lists'])).toBe(true)
    expect(isTemplateHelpSheet('Lists', ['Workers', 'Lists'])).toBe(false)
    expect(isTemplateHelpSheet('Lists')).toBe(true)
    expect(
      guessDataset({
        name: 'Lists',
        headerRow: 0,
        headers: ['Employee ID', 'Name', 'Hire date'],
        rows: [],
        rowNumbers: [],
      })[0].confidence,
    ).toBeGreaterThan(0)
    const g = guessDataset(
      sheet('Fields', [
        'Sheet',
        'Column',
        'Requirement',
        'Type',
        'Allowed values',
        'Description',
        'Pay amount',
      ]),
    )
    expect(g.every((x) => x.confidence === 0)).toBe(true)
  })
})
