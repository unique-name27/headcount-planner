/**
 * Applying a mapping (docs/PLAN.md 16.2): required values, documented defaults, day-first dates,
 * de-duplication by row key, manager links, people resolved against Workers, pay conversions,
 * and each dataset's own rules (positions, reqs, requests and their steps, targets, freezes,
 * assumptions), through the real pipeline: sheet → auto-map → apply.
 */
import { describe, expect, it } from 'vitest'
import { type DatasetKey, datasetDef, type WorkerRow } from '../schema'
import { applyMapping, suggestOptions } from './apply'
import { autoMap } from './automap'
import { issueTableRows, summarizeIssues } from './issues'
import { sheetFromRows } from './sheet'
import { FIXTURE } from './test-fixtures'
import type { ApplyOptions, ParsedSheet } from './types'
import { summarizeValues } from './values'

function sheetOf(aoa: unknown[][]): ParsedSheet {
  const s = sheetFromRows('Sheet1', aoa)
  if (!s) throw new Error('empty sheet')
  return s
}

function run<K extends DatasetKey>(
  key: K,
  aoa: unknown[][],
  extra: { roster?: WorkerRow[]; options?: ApplyOptions } = {},
) {
  const sheet = sheetOf(aoa)
  const def = datasetDef(key)
  const mapping = autoMap(sheet.headers, sheet.rows, def)
  return applyMapping<K>({ sheet, def, mapping, ...extra })
}

const ROSTER: WorkerRow[] = FIXTURE.workers

describe('workers', () => {
  it('skips rows missing required values and says why', () => {
    const r = run('workers', [
      ['Employee ID', 'Name', 'Hire date', 'Worker type'],
      ['E1', 'Ana Ruiz', '2020-01-06', 'Employee'],
      [null, 'No Id', '2020-01-06', 'Employee'],
      ['E3', 'Bad Date', 'soon', 'Employee'],
    ])
    expect(r.rows.map((e) => e.employeeId)).toEqual(['E1'])
    expect(r.stats.skippedMissingRequired).toBe(2)
    const skipped = r.issues.filter((i) => i.action === 'row-skipped')
    expect(skipped).toEqual([
      expect.objectContaining({
        row: 3,
        field: 'employeeId',
        code: 'missing-required',
        issue: 'Employee ID is blank, and it is required.',
      }),
      expect.objectContaining({
        row: 4,
        id: 'E3',
        field: 'hireDate',
        code: 'unreadable',
        value: 'soon',
        issue: '"soon" is not a date.',
      }),
    ])
  })

  it('stops with one clear issue when a required column is not mapped', () => {
    const r = run('workers', [
      ['Employee ID', 'Name'],
      ['E1', 'Ana'],
    ])
    expect(r.rows).toEqual([])
    expect(r.issues).toEqual([
      expect.objectContaining({ row: 0, field: 'hireDate', code: 'column-missing', action: 'row-skipped' }),
    ])
    expect(r.issues[0].issue).toBe(
      'Hire date is required, but no column is mapped to it. Map a column to import this sheet.',
    )
    expect(r.stats.skippedMissingRequired).toBe(1)
  })

  it('fills a blank worker type as Employee and logs it, and never replaces a value it cannot read', () => {
    const r = run('workers', [
      ['Employee ID', 'Hire date', 'Location', 'Worker type'],
      ['E1', '2020-01-06', 'bangalore', 'Full-time'],
      ['E2', '2021-02-01', 'Phoenix', null],
      ['E3', '2022-03-01', null, 'Seasonal'],
    ])
    const [a, b] = r.rows
    expect(a).toMatchObject({ location: 'Bengaluru', workerType: 'Employee', name: null, fte: null })
    expect(b).toMatchObject({ location: 'Phoenix', workerType: 'Employee' })
    // The worker type is required: an unrecognized one is never replaced by the default.
    expect(r.rows).toHaveLength(2)
    expect(r.stats.defaults).toEqual({ workerType: 1 })
    expect(r.stats.rowsWithIssues).toBe(1)
    const byField = (f: string) => r.issues.filter((i) => i.field === f)
    expect(byField('workerType')).toEqual([
      expect.objectContaining({
        row: 3,
        code: 'defaulted',
        action: 'defaulted',
        issue: 'Worker type was blank, so it was treated as Employee.',
      }),
      expect.objectContaining({
        row: 4,
        code: 'unknown-value',
        action: 'row-skipped',
        issue: '"Seasonal" is not a recognized worker type (Employee, Contractor, Intern).',
      }),
    ])
  })

  it('treats every row as an Employee, in one sheet-level line, when no column holds the worker type', () => {
    const r = run('workers', [
      ['Employee ID', 'Hire date'],
      ['E1', '2020-01-06'],
      ['E2', '2021-02-01'],
    ])
    expect(r.rows.map((w) => w.workerType)).toEqual(['Employee', 'Employee'])
    expect(r.issues).toEqual([
      expect.objectContaining({
        row: 0,
        field: 'workerType',
        code: 'defaulted',
        issue: 'No column is mapped to Worker type, so 2 rows were treated as Employee.',
      }),
    ])
  })

  it('builds the name from first and last name columns', () => {
    const r = run('workers', [
      ['Employee ID', 'First Name', 'Last Name', 'Hire date', 'Worker type'],
      ['E1', 'Ana', 'Ruiz', '2020-01-06', 'Employee'],
    ])
    expect(r.rows[0].name).toBe('Ana Ruiz')
    expect(r.issues).toEqual([])
  })

  it('reads a day-first date column as day-first', () => {
    const r = run('workers', [
      ['Employee ID', 'Hire date', 'Last day', 'Worker type'],
      ['E1', '03/04/2020', '01/02/2026', 'Employee'],
      ['E2', '25/12/2019', null, 'Employee'],
      ['E3', '01/02/2021', '02/14/2026', 'Employee'],
    ])
    expect(r.used.dateOrders).toEqual({ 'Hire date': 'DMY', 'Last day': 'MDY' })
    expect(r.rows.map((e) => [e.hireDate, e.terminationDate])).toEqual([
      ['2020-04-03', '2026-01-02'],
      ['2019-12-25', null],
      ['2021-02-01', '2026-02-14'],
    ])
  })

  it('lets the user override a detected day order', () => {
    const r = run(
      'workers',
      [
        ['Employee ID', 'Hire date', 'Worker type'],
        ['E1', '03/04/2020', 'Employee'],
      ],
      { options: { dateOrders: { 'Hire date': 'DMY' } } },
    )
    expect(r.rows[0].hireDate).toBe('2020-04-03')
  })

  it('keeps one row per assignment: the most recent duplicate, and each stint of a rehire', () => {
    const r = run('workers', [
      ['Employee ID', 'Name', 'Hire date', 'Last day', 'Worker type'],
      ['E1', 'Ana (rehire)', '2023-05-01', null, 'Employee'],
      ['E1', 'Ana', '2015-01-01', '2020-06-30', 'Employee'],
      ['E2', 'Bo', '2019-01-01', null, 'Employee'],
      ['E2', 'Bo Chen', '2019-01-01', null, 'Employee'],
    ])
    // A blank assignment start is the hire date, so Ana's two stints are two assignments.
    expect(r.rows.map((e) => e.name)).toEqual(['Ana (rehire)', 'Ana', 'Bo Chen'])
    expect(r.stats.duplicates).toBe(1)
    const dups = r.issues.filter((i) => i.code === 'duplicate')
    expect(dups.map((d) => [d.row, d.issue])).toEqual([
      [4, 'Same Employee ID + Position ID + Assignment start as row 5; the later row in the file was kept.'],
    ])
  })

  it('keeps the row with the more recent dates of the same assignment', () => {
    const r = run('workers', [
      ['Employee ID', 'Position ID', 'Assignment start', 'Hire date', 'Last day', 'Worker type'],
      ['E1', 'P-1', '2024-01-01', '2024-01-01', '2026-12-31', 'Employee'],
      ['E1', 'P-1', '2024-01-01', '2024-01-01', null, 'Employee'],
    ])
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0].terminationDate).toBe('2026-12-31')
    expect(r.issues.find((i) => i.code === 'duplicate')?.issue).toBe(
      'Same Employee ID + Position ID + Assignment start as row 2; the row with the more recent dates was kept.',
    )
  })

  it('links managers by ID, then by name, and clears what it cannot trust', () => {
    const r = run('workers', [
      ['Employee ID', 'Name', 'Level', 'Manager', 'Hire date', 'Worker type'],
      ['00100', 'Maya Lindqvist', 'E3', null, '2012-01-01', 'Employee'],
      ['200', 'Rahul Menon', 'E1', '100', '2015-01-01', 'Employee'],
      ['300', 'Jane Q. Smith', 'M1', 'Menon, Rahul', '2016-01-01', 'Employee'],
      ['400', 'Tom Ray', 'P3', 'Jane Smith', '2018-01-01', 'Employee'],
      ['500', 'Lee Park', 'P3', '500', '2019-01-01', 'Employee'],
      ['600', 'Alex Kim', 'P2', 'Nobody Here', '2019-01-01', 'Employee'],
      ['601', 'Alex Kim', 'P2', '300', '2019-01-01', 'Employee'],
      ['700', 'Sam Ito', 'P3', 'Alex Kim', '2020-01-01', 'Employee'],
      ['800', 'Loop A', 'P4', '900', '2020-01-01', 'Employee'],
      ['900', 'Loop B', 'M2', '1000', '2020-01-01', 'Employee'],
      ['1000', 'Loop C', 'P5', '800', '2020-01-01', 'Employee'],
    ])
    const mgr = Object.fromEntries(r.rows.map((e) => [e.employeeId, e.managerId]))
    expect(mgr).toEqual({
      '00100': null,
      '200': '00100',
      '300': '200',
      '400': '300',
      '500': null,
      '600': null,
      '601': '300',
      '700': null,
      '800': '900',
      '900': null,
      '1000': '800',
    })
    expect(r.stats.managers).toEqual({ byId: 5, byName: 2, cleared: 4, topLevel: 5 })
    const codes = r.issues.filter((i) => i.field === 'managerId').map((i) => [i.id, i.code])
    expect(codes).toEqual([
      ['500', 'manager-self'],
      ['600', 'manager-unknown'],
      ['700', 'manager-ambiguous'],
      ['900', 'manager-cycle'],
    ])
    expect(r.issues.find((i) => i.code === 'manager-cycle')?.issue).toBe(
      'Reporting line loops back (800 → 900 → 1000 → 800); cleared here so this person sits at the top.',
    )
  })

  it('looks for reporting loops only among assignments that have not ended', () => {
    // A manager and a report who swapped seats: the ended rows say the opposite of the current ones.
    const r = run('workers', [
      ['Employee ID', 'Name', 'Position ID', 'Assignment end', 'Manager', 'Hire date', 'Worker type'],
      ['E1', 'Ana Ruiz', 'P-1', '2026-06-30', 'E2', '2020-01-01', 'Employee'],
      ['E2', 'Bo Chen', 'P-2', '2026-06-30', null, '2020-01-01', 'Employee'],
      ['E1', 'Ana Ruiz', 'P-2', null, null, '2020-01-01', 'Employee'],
      ['E2', 'Bo Chen', 'P-1', null, 'E1', '2020-01-01', 'Employee'],
    ])
    expect(r.issues.filter((i) => i.code === 'manager-cycle')).toEqual([])
    expect(r.rows.map((w) => w.managerId)).toEqual(['E2', null, null, 'E1'])
  })

  it('reads FTE as a share, leave as yes or no, and levels from codes and titles', () => {
    const r = run('workers', [
      ['Employee ID', 'Hire date', 'Worker type', 'FTE', 'Level', 'On leave', 'Leave paid'],
      ['E1', '2020-01-01', 'Regular', '80%', 'IC4', 'Y', 'No'],
      ['E2', '2020-01-01', 'Contingent worker', '50', 'Senior', 'N', null],
      ['E3', '2020-01-01', 'Summer intern', 0.6, 'Director', null, null],
      ['E4', '2020-01-01', 'Part time', '0', 'Wizard', 'maybe', null],
    ])
    expect(r.rows.map((w) => [w.workerType, w.fte, w.level, w.onLeave, w.leavePaid])).toEqual([
      ['Employee', 0.8, 'P4', true, false],
      ['Contractor', 0.5, 'P4', false, null],
      ['Intern', 0.6, 'M2', null, null],
      ['Employee', null, null, null, null],
    ])
    expect(r.issues.filter((i) => i.row === 5).map((i) => [i.field, i.code, i.issue])).toEqual([
      ['fte', 'out-of-range', '"0" is outside the range for an FTE.'],
      ['level', 'unknown-value', '"Wizard" is not a recognized level (P1-P6, M1-M2, E1-E3).'],
      ['onLeave', 'unknown-value', '"maybe" is not yes or no.'],
    ])
  })
})

describe('positions', () => {
  it('reads seat statuses and FTEs in their common spellings', () => {
    const r = run('positions', [
      ['Position ID', 'Effective date', 'Status', 'Level', 'Business unit', 'Cost center', 'Location', 'FTE'],
      ['P-1', '2026-04-01', 'Filled', 'P3', 'Silicon Engineering', '1130-BLR', 'Bangalore, India', 1],
      ['P-2', '2026-04-01', 'Vacant', 'IC4', 'Silicon Engineering', '1130-MUC', 'München', '80%'],
      ['P-3', '2026-04-01', 'Not yet open', 'Senior', 'Silicon Engineering', '1130-HSZ', 'HSZ', '50'],
      ['P-4', '2026-04-01', 'Frozen', 'P2', 'Silicon Engineering', '1130-BLR', 'Bengaluru', null],
      ['P-5', '2026-04-01', 'Closed', 'Director', 'Silicon Engineering', '1130-BLR', 'Bengaluru', null],
      ['P-6', '2026-04-01', 'Reorganized', 'P3', 'Silicon Engineering', '1130-BLR', 'Bengaluru', null],
    ])
    expect(r.rows.map((p) => [p.positionId, p.status, p.level, p.location, p.fte])).toEqual([
      ['P-1', 'Filled', 'P3', 'Bengaluru', 1],
      ['P-2', 'Open', 'P4', 'Munich', 0.8],
      ['P-3', 'Planned', 'P4', 'Hsinchu', 0.5],
      ['P-4', 'On hold', 'P2', 'Bengaluru', null],
      ['P-5', 'Eliminated', 'M2', 'Bengaluru', null],
    ])
    expect(r.issues).toEqual([
      expect.objectContaining({
        row: 7,
        field: 'status',
        code: 'unknown-value',
        action: 'row-skipped',
        issue: '"Reorganized" is not a recognized status (Filled, Open, Planned, On hold, Eliminated).',
      }),
    ])
  })

  it('clears a manager position that is the seat itself, and keeps every effective-dated row', () => {
    const r = run('positions', [
      [
        'Position ID',
        'Effective date',
        'Status',
        'Level',
        'Business unit',
        'Cost center',
        'Location',
        'Manager position ID',
      ],
      ['P-1', '2026-04-01', 'Filled', 'M1', 'Operations', '1310-HSZ', 'Hsinchu', 'P-1'],
      ['P-1', '2026-08-01', 'Filled', 'M1', 'Operations', '1310-SHA', 'Shanghai', 'P-9'],
      ['P-1', '2026-08-01', 'Filled', 'M1', 'Operations', '1310-SHA', 'Shanghai', 'P-8'],
    ])
    expect(r.rows.map((p) => [p.effectiveDate, p.managerPositionId])).toEqual([
      ['2026-04-01', null],
      ['2026-08-01', 'P-8'],
    ])
    expect(r.issues.map((i) => [i.row, i.code, i.action])).toEqual([
      [2, 'manager-self', 'cleared'],
      [3, 'duplicate', 'row-skipped'],
    ])
    expect(r.issues[0].issue).toBe('The position reports to itself, so its manager position was cleared.')
  })
})

describe('compensation', () => {
  it('detects whole-number percents and converts them', () => {
    const r = run('comp', [
      ['Employee ID', 'Effective date', 'Currency', 'Base salary', 'Target bonus'],
      ['E0001', '2026-04-01', 'USD', '128,000', '10'],
      ['E0002', '2026-04-01', 'US$', '$95k', '12.5%'],
    ])
    expect(r.used.percentWhole).toEqual({ targetBonusPct: true })
    expect(r.rows.map((c) => [c.baseSalary, c.targetBonusPct, c.currency])).toEqual([
      [128000, 0.1, 'USD'],
      [95000, 0.125, 'USD'],
    ])
  })

  it('annualizes hourly rows named by a pay basis column', () => {
    const sheet = sheetOf([
      ['Employee ID', 'Effective date', 'Currency', 'Base salary', 'Pay basis'],
      ['E0006', '2026-04-01', 'USD', 46, 'Hourly'],
      ['E0005', '2026-04-01', 'USD', 120000, 'Salaried'],
    ])
    const def = datasetDef('comp')
    const mapping = autoMap(sheet.headers, sheet.rows, def)
    expect(suggestOptions(sheet, def, mapping).hourlyToAnnual).toEqual({
      hours: 2080,
      basisHeader: 'Pay basis',
    })
    const r = applyMapping<'comp'>({ sheet, def, mapping })
    expect(r.rows.map((c) => c.baseSalary)).toEqual([95680, 120000])
    expect(r.issues).toContainEqual(
      expect.objectContaining({
        row: 2,
        code: 'converted',
        issue: 'Hourly rate 46 annualized to 95,680 (2,080 hours a year).',
      }),
    )
    const off = applyMapping<'comp'>({ sheet, def, mapping, options: { hourlyToAnnual: null } })
    expect(off.rows[0].baseSalary).toBe(46)
  })

  it('treats a column of small amounts as hourly when there is no basis column', () => {
    const r = run('comp', [
      ['Employee ID', 'Effective date', 'Hourly rate'],
      ['E0006', '2026-04-01', 40],
      ['E0005', '2026-04-01', 52.5],
    ])
    expect(r.used.hourlyToAnnual).toEqual({ hours: 2080, basisHeader: null })
    expect(r.rows.map((c) => c.baseSalary)).toEqual([83200, 109200])
  })

  it('keeps one pay row per person and effective date, and leaves the currency blank for the location to fill', () => {
    const r = run(
      'comp',
      [
        ['Employee ID', 'Effective date', 'Base salary'],
        ['E0004', '2025-04-01', 3_100_000],
        ['E0004', '2026-07-01', 3_800_000],
        ['E0004', '2026-07-01', 3_900_000],
        ['E9999', '2026-04-01', 50000],
        ['E0005', '2026-04-01', -5],
      ],
      { roster: ROSTER },
    )
    expect(r.rows.map((c) => [c.employeeId, c.effectiveDate, c.baseSalary, c.currency])).toEqual([
      ['E0004', '2025-04-01', 3_100_000, null],
      ['E0004', '2026-07-01', 3_900_000, null],
      ['E9999', '2026-04-01', 50000, null],
    ])
    expect(r.stats.duplicates).toBe(1)
    expect(r.stats.notInRoster).toBe(1)
    expect(r.issues).toContainEqual(
      expect.objectContaining({
        row: 5,
        code: 'not-in-roster',
        issue: 'Employee ID E9999 is not in Workers.',
      }),
    )
    // A base below zero is left blank, and the base is required, so the row is skipped.
    expect(r.issues).toContainEqual(
      expect.objectContaining({
        row: 6,
        field: 'baseSalary',
        code: 'out-of-range',
        action: 'row-skipped',
        issue: 'Base salary -5 is below zero, so it was left blank.',
      }),
    )
  })

  it('restores leading zeros against Workers', () => {
    const roster: WorkerRow[] = [{ ...ROSTER[0], employeeId: '00123' }]
    const r = run(
      'comp',
      [
        ['Employee ID', 'Effective date', 'Base salary', 'Currency'],
        [123, '2026-04-01', 100000, 'eur'],
      ],
      { roster },
    )
    expect(r.rows[0]).toMatchObject({ employeeId: '00123', currency: 'EUR' })
    expect(r.stats.notInRoster).toBe(0)
    expect(r.issues).toContainEqual(
      expect.objectContaining({
        code: 'converted',
        issue: 'Matched to Workers ID 00123 (the ID was written differently).',
      }),
    )
  })
})

describe('requisitions', () => {
  it('skips unknown statuses and resolves hiring managers by name', () => {
    const r = run(
      'reqs',
      [
        ['Req ID', 'Position ID', 'Hiring manager', 'Opened date', 'Status'],
        ['REQ-1', 'P-1132', 'Chen Wei-Ling', '2026-01-05', 'Approved'],
        ['REQ-2', null, 'Avi Peretz', '2026-02-01', 'Draft'],
      ],
      { roster: ROSTER },
    )
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0]).toMatchObject({ status: 'Open', hiringManagerId: 'E0003', positionId: 'P-1132' })
    expect(r.issues.find((i) => i.row === 3)).toMatchObject({
      field: 'status',
      code: 'unknown-value',
      action: 'row-skipped',
    })
  })

  it('reads an ATS export: vendor statuses, stages, M/D/YYYY dates and currency symbols', () => {
    const r = run('reqs', [
      [
        'Job Req ID',
        'Req Status',
        'Current Stage',
        'Date Opened',
        'Offer Accepted Date',
        'Offer Base',
        'Offer Currency',
        'Sign-on Bonus',
        'Relocation',
      ],
      ['JR-1', 'Closed - Filled', 'Hired', '3/2/2026', '5/20/2026', '3,900,000', 'Rs', null, null],
      ['JR-2', 'Sourcing', 'Phone screen', '9/10/2026', null, null, null, null, null],
      ['JR-3', 'Open', 'Offer accepted', '8/15/2026', '9/22/2026', 'NT$1,450,000', 'NT$', '-5', '25000'],
      ['JR-4', 'Closed', 'Req opened', '2/1/2026', null, null, null, null, null],
    ])
    expect(r.rows.map((q) => [q.reqId, q.status, q.stage, q.openedDate, q.offerAcceptedDate])).toEqual([
      ['JR-1', 'Filled', 'Started', '2026-03-02', '2026-05-20'],
      ['JR-2', 'Open', 'Interviewing', '2026-09-10', null],
      ['JR-3', 'Open', 'Offer accepted', '2026-08-15', '2026-09-22'],
      ['JR-4', 'Cancelled', 'Req opened', '2026-02-01', null],
    ])
    expect(r.rows.map((q) => [q.offerBase, q.offerCurrency, q.signOnBonus, q.relocation])).toEqual([
      [3_900_000, 'INR', null, null],
      [null, null, null, null],
      [1_450_000, 'TWD', null, 25000],
      [null, null, null, null],
    ])
    expect(r.issues).toEqual([
      expect.objectContaining({
        row: 4,
        field: 'signOnBonus',
        code: 'out-of-range',
        action: 'left-blank',
        issue: 'Sign-on bonus -5 is below zero, so it was left blank.',
      }),
    ])
  })
})

describe('requests', () => {
  const header = ['Request ID', 'Type', 'State', 'Reason', 'Requester', 'Business unit', 'Approval steps']

  it('reads approval steps one step per part, in their common spellings', () => {
    const r = run('requests', [
      header,
      [
        'HCR-1',
        'New role',
        'Pending approval',
        'Growth',
        'E0003',
        'Silicon Engineering',
        'Manager E10234 Approved 2026-08-03; HRBP E10077 Pending',
      ],
      [
        'HCR-2',
        'Headcount trade',
        'Approved',
        'Cost neutral',
        'Chen Wei-Ling',
        'Silicon Engineering',
        'Line manager: E0002 (Approved, 3 Aug 2026) | HR business partner E0009 approved with edits 08/04/2026 | FP&A E0008 rejected 2026-08-05',
      ],
      ['HCR-3', 'Backfill', 'Draft', 'Attrition', 'E0003', 'Silicon Engineering', null],
    ])
    expect(r.rows.map((q) => [q.requestId, q.type, q.state, q.reasonCode, q.requesterId])).toEqual([
      ['HCR-1', 'New role', 'In review', 'Growth', 'E0003'],
      ['HCR-2', 'Trade', 'Approved', 'Cost-neutral mix', 'Chen Wei-Ling'],
      ['HCR-3', 'Backfill', 'Draft', 'Attrition backfill', 'E0003'],
    ])
    expect(r.rows[0].steps).toEqual([
      { role: 'Manager', approverId: 'E10234', decision: 'Approved', at: '2026-08-03' },
      { role: 'HRBP', approverId: 'E10077', decision: 'Pending', at: null },
    ])
    expect(r.rows[1].steps).toEqual([
      { role: 'Manager', approverId: 'E0002', decision: 'Approved', at: '2026-08-03' },
      { role: 'HRBP', approverId: 'E0009', decision: 'Approved with changes', at: '2026-08-04' },
      { role: 'Finance', approverId: 'E0008', decision: 'Rejected', at: '2026-08-05' },
    ])
    expect(r.rows[2].steps).toBeNull()
    expect(r.issues).toEqual([])
  })

  it('resolves requesters given as names against Workers', () => {
    const r = run(
      'requests',
      [header, ['HCR-2', 'Trade', 'Approved', 'Level mix', 'Chen Wei-Ling', 'Silicon Engineering', null]],
      { roster: ROSTER },
    )
    expect(r.rows[0].requesterId).toBe('E0003')
  })

  it('leaves steps it cannot read blank and says what they should look like', () => {
    const r = run('requests', [
      header,
      ['HCR-4', 'New role', 'Submitted', 'Growth', 'E0003', 'Silicon Engineering', 'Waiting on Dana'],
      ['HCR-5', 'Promotion', 'Submitted', 'Level mix', 'E0003', 'Silicon Engineering', null],
      ['HCR-6', 'Hire a llama', 'Submitted', 'Growth', 'E0003', 'Silicon Engineering', null],
    ])
    expect(r.rows.map((q) => [q.requestId, q.type, q.steps])).toEqual([
      ['HCR-4', 'New role', null],
      ['HCR-5', 'Level change', null],
    ])
    expect(r.issues.map((i) => [i.row, i.field, i.code, i.action])).toEqual([
      [2, 'steps', 'unreadable', 'left-blank'],
      [4, 'type', 'unknown-value', 'row-skipped'],
    ])
    expect(r.issues[0].issue).toBe(
      '"Waiting on Dana" is not a list of approval steps such as "Manager E10234 Approved 2026-08-03; HRBP E10077 Pending".',
    )
  })

  it('accepts any reason code, even one New request does not offer for the type', () => {
    const r = run('requests', [
      header,
      ['HCR-7', 'Trade', 'Submitted', 'Growth', 'E0003', 'Silicon Engineering', null],
    ])
    expect(r.rows[0]).toMatchObject({ type: 'Trade', reasonCode: 'Growth' })
    expect(r.issues).toEqual([])
  })
})

describe('targets', () => {
  const sheet = [
    [
      'Fiscal Year',
      'Business Unit Name',
      'Department Name',
      'Cost Centre',
      'Leader Position ID',
      'Approved Headcount',
      'Fully Loaded Cost',
    ],
    ['FY 2027', 'Silicon Engineering', 'Design Verification', '1130-BLR', null, 69, '$2.15M'],
    ['2027/28', 'Silicon Engineering', null, null, 'P-1100', 70, 31_000_000],
    [28, 'Go-to-Market', null, null, null, 176, null],
    ['FY27', 'Corporate', 'Finance', null, null, -2, 50000],
    ['FY27', 'Corporate', 'Legal', null, null, 12, -5],
    ['next year', 'Corporate', 'IT', null, null, 40, null],
  ]

  it('maps planning-tool headers to the target fields', () => {
    const s = sheetOf(sheet)
    const m = autoMap(s.headers, s.rows, datasetDef('targets'))
    expect(Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.header]))).toEqual({
      fiscalYear: 'Fiscal Year',
      targetDate: null,
      businessUnit: 'Business Unit Name',
      department: 'Department Name',
      costCenter: 'Cost Centre',
      leaderPositionId: 'Leader Position ID',
      targetHeads: 'Approved Headcount',
      targetCost: 'Fully Loaded Cost',
    })
  })

  it('reads fiscal years in every common spelling and amounts with suffixes', () => {
    const r = run('targets', sheet)
    expect(
      r.rows.map((t) => [t.fiscalYear, t.department ?? t.businessUnit, t.targetHeads, t.targetCost]),
    ).toEqual([
      ['FY27', 'Design Verification', 69, 2_150_000],
      ['FY28', 'Silicon Engineering', 70, 31_000_000],
      ['FY28', 'Go-to-Market', 176, null],
      ['FY27', 'Legal', 12, null],
    ])
    // A blank target date stays blank: it reads as the fiscal year's last day.
    expect(r.rows.every((t) => t.targetDate === null)).toBe(true)
  })

  it('leaves heads or cost below zero blank, skips a target without heads or a fiscal year', () => {
    const r = run('targets', sheet)
    expect(r.issues.map((i) => [i.row, i.field, i.code, i.action])).toEqual([
      [5, 'targetHeads', 'out-of-range', 'row-skipped'],
      [6, 'targetCost', 'out-of-range', 'left-blank'],
      [7, 'fiscalYear', 'unknown-value', 'row-skipped'],
    ])
    expect(r.issues[1].issue).toBe('Target cost -5 is below zero, so it was left blank.')
    expect(r.issues[2].issue).toBe('"next year" is not a fiscal year such as FY28.')
  })

  it('is a group total under the cost guard, not one person’s pay', () => {
    expect(datasetDef('targets').fields.find((f) => f.key === 'targetCost')).toMatchObject({
      type: 'money',
      cost: true,
    })
    expect(datasetDef('targets').fields.find((f) => f.key === 'targetCost')?.pay).toBeUndefined()
  })
})

describe('freezes', () => {
  it('keeps a blank end date open-ended and a blank backfill rule blank (read as No)', () => {
    const r = run('freezes', [
      [
        'Freeze ID',
        'Business unit',
        'Department',
        'Freeze start date',
        'Frozen until',
        'Backfills allowed',
        'Reason',
      ],
      ['F-1', 'Go-to-Market', 'Sales', '2026-09-01', null, null, 'Pipeline review'],
      ['F-2', 'Corporate', null, '13/10/2026', '31/12/2026', 'Y', null],
      ['F-3', 'Corporate', null, null, null, 'No', null],
    ])
    expect(r.rows.map((f) => [f.freezeId, f.startDate, f.endDate, f.allowBackfill, f.reason])).toEqual([
      ['F-1', '2026-09-01', null, null, 'Pipeline review'],
      ['F-2', '2026-10-13', '2026-12-31', true, null],
    ])
    expect(r.issues).toEqual([
      expect.objectContaining({
        row: 4,
        field: 'startDate',
        code: 'missing-required',
        action: 'row-skipped',
      }),
    ])
  })
})

describe('assumptions', () => {
  const header = ['Version', 'Table', 'Org', 'Key', 'Value']

  it('rewrites keys in the standard form, once for the sheet', () => {
    const r = run('assumptions', [
      header,
      ['fy27-working', 'Band midpoints', null, 'L4 | munich | fy 27', '€110,000'],
      ['fy27-working', 'FX rate', null, 'eur|Plan|Sep 2026', 1.09],
      ['fy27-working', 'fillRate', 'Silicon Engineering', null, '85%'],
      ['fy27-working', 'Merit', null, 'FY27|date', '2026-04-01'],
      ['fy27-working', 'Payroll tax', null, 'Germany|pension', 0.093],
    ])
    expect(r.rows.map((a) => [a.table, a.org, a.key, a.value])).toEqual([
      ['band', null, 'P4|Munich|FY27', 110000],
      ['fx', null, 'EUR|plan|2026-09', 1.09],
      ['fillRate', 'Silicon Engineering', '*', 0.85],
      ['merit', null, 'FY27|date', 20260401],
      ['burden', null, 'Germany|pension', 0.093],
    ])
    expect(r.issues).toEqual([
      expect.objectContaining({
        row: 0,
        field: 'key',
        code: 'converted',
        issue: 'Assumption keys were rewritten in the standard form on 2 rows.',
      }),
    ])
  })

  it('keeps a key that does not read, and logs it', () => {
    const r = run('assumptions', [
      header,
      ['fy27-working', 'band', null, 'P4|Munich', 110000],
      ['fy27-working', 'fx', null, 'EUR|budget|2026-09', 1.09],
      ['fy27-working', 'attrition', null, 'P4', 0.1],
      ['fy27-working', 'Moon rocks', null, '*', 1],
    ])
    expect(r.rows.map((a) => a.key)).toEqual(['P4|Munich', 'EUR|budget|2026-09', 'P4'])
    expect(r.issues.map((i) => [i.row, i.field, i.code, i.action, i.issue])).toEqual([
      [
        2,
        'key',
        'unknown-value',
        'kept',
        'A band midpoints key has 3 parts (level|zone|fiscalYear), not 2. The key was kept as written.',
      ],
      [
        3,
        'key',
        'unknown-value',
        'kept',
        '"budget" is not a set this key can use. The key was kept as written.',
      ],
      [
        4,
        'key',
        'unknown-value',
        'kept',
        'Attrition is set by org alone, so its key is *. The key was kept as written.',
      ],
      [
        5,
        'table',
        'unknown-value',
        'row-skipped',
        expect.stringMatching(/^"Moon rocks" is not a recognized table \(band, bonusTarget/),
      ],
    ])
  })
})

describe('value grid and manual corrections', () => {
  it('summarizes distinct values for the value grid', () => {
    const sheet = sheetOf([['Status'], ['Vacant'], ['vacant'], ['Filled'], ['Mystery'], [null]])
    expect(summarizeValues(sheet, 'Status', datasetDef('positions'), 'status')).toEqual([
      { raw: 'Vacant', key: 'vacant', count: 2, value: 'Open', recognized: true },
      { raw: 'Filled', key: 'filled', count: 1, value: 'Filled', recognized: true },
      { raw: 'Mystery', key: 'mystery', count: 1, value: null, recognized: false },
    ])
  })

  it('imports a value the user corrected in the grid', () => {
    const aoa = [
      ['Req ID', 'Status', 'Opened date'],
      ['R1', 'Awaiting budget', '2026-01-01'],
      ['R2', 'Open', '2026-01-01'],
    ]
    expect(run('reqs', aoa).rows.map((q) => q.reqId)).toEqual(['R2'])
    const fixed = run('reqs', aoa, { options: { valueMaps: { status: { 'awaiting budget': 'On hold' } } } })
    expect(fixed.rows.map((q) => q.status)).toEqual(['On hold', 'Open'])
  })
})

describe('issue summaries', () => {
  it('groups the log, most serious first, in plain sentences', () => {
    const r = run('workers', [
      ['Employee ID', 'Hire date', 'Level', 'Worker type'],
      ['E1', 'soon', 'P3', 'FTE'],
      ['E2', '2020-01-01', 'Wizard', null],
      ['E3', '2020-01-01', 'Guru', null],
      ['E3', '2020-01-01', 'P4', 'FTE'],
    ])
    const s = summarizeIssues(r.issues)
    expect(s.map((x) => x.message)).toEqual([
      '1 hire date value could not be read (for example "soon"); the row was skipped.',
      '1 duplicate row by employee ID + position ID + assignment start; the most recent row was kept.',
      '1 level value is not recognized (for example "Wizard"); left blank.',
      'Worker type was filled with a default in 1 row.',
    ])
    expect(issueTableRows(r.issues)[0]).toEqual({
      row: 2,
      id: 'E1',
      field: 'Hire date',
      value: 'soon',
      issue: '"soon" is not a date.',
      action: 'Row skipped',
    })
  })

  it('counts defaults on the imported rows only, after duplicates are dropped', () => {
    const r = run('workers', [
      ['Employee ID', 'Hire date', 'Worker type'],
      ['E1', '2020-01-01', null],
      ['E2', '2020-01-01', null],
      ['E2', '2020-01-01', 'FTE'],
      ['E3', 'never', null],
    ])
    expect(r.stats.rowsIn).toBe(4)
    expect(r.stats.duplicates).toBe(1)
    expect(r.stats.skippedMissingRequired).toBe(1)
    expect(r.stats.rowsOut).toBe(2)
    // A mapped column left blank: only E1 (the kept E2 row has a worker type).
    expect(r.stats.defaults).toEqual({ workerType: 1 })
    expect(r.stats.defaulted).toBe(1)
    for (const n of Object.values(r.stats.defaults)) expect(n).toBeLessThanOrEqual(r.stats.rowsOut)
  })
})
