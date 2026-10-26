/**
 * Column mapping (docs/PLAN.md 16.2): tricky headers, strongest-first assignment, value-shape
 * doubts, HRIS, ATS and planning-tool exports, values already loaded as a tie-breaker, learned
 * picks and manual choices, and every dataset mapping its own labels exactly.
 */
import { describe, expect, it } from 'vitest'
import { DATASET_KEYS, datasetDef } from '../schema'
import { autoMap, knownShare, rankHeaders, withChoice } from './automap'
import { profileColumn } from './sniff'
import type { Mapping } from './types'

/** Field → header for the mapped fields only. */
const picks = (m: Mapping) =>
  Object.fromEntries(Object.entries(m).flatMap(([k, v]) => (v.header ? [[k, v.header]] : [])))

/** Rows built from per-header sample columns. */
function rows(cols: Record<string, unknown[]>): Record<string, unknown>[] {
  const n = Math.max(...Object.values(cols).map((c) => c.length))
  return Array.from({ length: n }, (_, i) =>
    Object.fromEntries(Object.entries(cols).map(([h, c]) => [h, c[i] ?? null])),
  )
}

describe('autoMap: tricky headers', () => {
  it("doesn't give the worker's name to 'Manager name'", () => {
    const m = autoMap(['Employee ID', 'Manager name', 'Hire date'], [], datasetDef('workers'))
    expect(m.name.header).toBe(null)
    expect(m.managerId.header).toBe('Manager name')
  })

  it("doesn't read 'Termination type' as the worker type", () => {
    const m = autoMap(
      ['Employee ID', 'Hire date', 'Termination type'],
      rows({ 'Termination type': ['Voluntary', 'Involuntary', 'Voluntary', null] }),
      datasetDef('workers'),
    )
    expect(picks(m)).toEqual({ employeeId: 'Employee ID', hireDate: 'Hire date' })
  })

  it("never matches short words inside longer ones ('id', 'min', 'mid', 'rate')", () => {
    const headers = ['Paid Hours', 'Administration', 'Midwest Region', 'Accurate', 'Salary']
    expect(picks(autoMap(headers, [], datasetDef('comp')))).toEqual({ baseSalary: 'Salary' })
  })

  it('does not let a qualified header take a plain field', () => {
    const m = autoMap(['Manager Employee ID', 'Hire Date'], [], datasetDef('workers'))
    expect(m.employeeId.header).toBe(null)
    expect(m.managerId.header).toBe('Manager Employee ID')
    const p = autoMap(['Manager Position ID', 'Effective date'], [], datasetDef('positions'))
    expect(p.positionId.header).toBe(null)
    expect(p.managerPositionId.header).toBe('Manager Position ID')
  })

  it('assigns strongest matches first so every position column keeps its own field', () => {
    const m = autoMap(
      [
        'From position ID',
        'Giving org position ID',
        'Position ID',
        'To position ID',
        'Manager position ID',
        'To manager position ID',
        'Moving person ID',
        'Requester ID',
      ],
      [],
      datasetDef('requests'),
    )
    expect(picks(m)).toEqual({
      positionId: 'Position ID',
      fromPositionId: 'From position ID',
      giveOrgPositionId: 'Giving org position ID',
      toPositionId: 'To position ID',
      managerPositionId: 'Manager position ID',
      toManagerPositionId: 'To manager position ID',
      personId: 'Moving person ID',
      requesterId: 'Requester ID',
    })
  })

  it('prefers the more specific of two exact matches', () => {
    expect(autoMap(['ID', 'Employee ID', 'Name'], [], datasetDef('workers')).employeeId.header).toBe(
      'Employee ID',
    )
    // "Position #" reads as the position number, a synonym; the label wins the tie.
    expect(autoMap(['Position #', 'Position ID'], [], datasetDef('positions')).positionId.header).toBe(
      'Position ID',
    )
  })

  it('matches across spelling, order, case and abbreviations', () => {
    const m = autoMap(
      ['EMP_NO', 'Date Hired', 'Mgr ID', 'Dept.', 'termDate', 'Employee #'],
      [],
      datasetDef('workers'),
    )
    expect(m.hireDate.header).toBe('Date Hired')
    expect(m.managerId.header).toBe('Mgr ID')
    expect(m.department.header).toBe('Dept.')
    expect(m.terminationDate.header).toBe('termDate')
    expect(['EMP_NO', 'Employee #']).toContain(m.employeeId.header)
  })

  it('reads percent and hash signs in headers', () => {
    const m = autoMap(
      ['Employee ID', 'Effective date', 'Target Bonus %', 'Base salary'],
      [],
      datasetDef('comp'),
    )
    expect(m.targetBonusPct.header).toBe('Target Bonus %')
    expect(m.baseSalary.header).toBe('Base salary')
  })
})

describe('autoMap: value shapes', () => {
  it('drops a date field whose column holds names', () => {
    const headers = ['Position ID', 'Opened by']
    const names = rows({
      'Position ID': ['P-1', 'P-2', 'P-3'],
      'Opened by': ['Chen Wei-Ling', 'Avi Peretz', 'Chen Wei-Ling'],
    })
    expect(autoMap(headers, names, datasetDef('positions')).openedDate.header).toBe(null)
    const dates = rows({
      'Position ID': ['P-1', 'P-2', 'P-3'],
      'Opened by': ['2026-07-01', '2026-07-03', '2026-07-09'],
    })
    const m = autoMap(headers, dates, datasetDef('positions'))
    expect(m.openedDate.header).toBe('Opened by')
    expect(m.openedDate.reason).toMatch(/values are dates/)
  })

  it('finds an oddly named status column from its values', () => {
    const data = rows({
      'Position ID': ['P-1', 'P-2', 'P-3', 'P-4', 'P-5'],
      Disposition: ['Filled', 'Vacant', 'Filled', 'Frozen', 'Planned'],
    })
    const m = autoMap(['Position ID', 'Disposition'], data, datasetDef('positions'))
    expect(m.status.header).toBe('Disposition')
    expect(m.status.reason).toMatch(/values match the allowed list/i)
  })

  it('marks an exact header with the wrong kind of values as doubtful', () => {
    const data = rows({ 'Hire date': ['soon', 'later', 'TBD'] })
    const m = autoMap(['Employee ID', 'Hire date'], data, datasetDef('workers'))
    expect(m.hireDate.header).toBe('Hire date')
    expect(m.hireDate.confidence).toBe('low')
    expect(m.hireDate.reason).toMatch(/don't look like dates/)
  })

  it('doubts amounts that look like percentages and percentages that look like amounts', () => {
    const data = rows({
      Salary: [0.03, 0.04, 0.035],
      'Target bonus %': [120000, 98000, 101000],
    })
    const m = autoMap(['Employee ID', 'Salary', 'Target bonus %'], data, datasetDef('comp'))
    expect(m.baseSalary.reason).toMatch(/values look like percentages/)
    expect(m.baseSalary.confidence).not.toBe('high')
    expect(m.targetBonusPct.reason).toMatch(/values look like amounts/)
  })

  it('doubts a name column that holds email addresses', () => {
    const data = rows({ Name: ['ana@northgate.example', 'bo@northgate.example', 'cy@northgate.example'] })
    const m = autoMap(['Employee ID', 'Name', 'Hire date'], data, datasetDef('workers'))
    expect(m.name.reason).toMatch(/email addresses/)
    expect(m.name.confidence).toBe('medium')
  })

  it('takes approval steps only from a column that reads like them', () => {
    const steps = rows({ Approvals: ['Manager E1 Approved', 'HRBP E2 Pending', 'Finance E3 Rejected'] })
    expect(autoMap(['Request ID', 'Approvals'], steps, datasetDef('requests')).steps.header).toBe('Approvals')
    const dates = rows({ Approvals: ['2026-08-03', '2026-08-04', '2026-08-05'] })
    const m = autoMap(['Request ID', 'Approvals'], dates, datasetDef('requests'))
    expect(m.steps.confidence).toBe('low')
    expect(m.steps.reason).toMatch(/values are dates/)
  })
})

describe('autoMap: real exports', () => {
  it('maps a Workday Position Management export', () => {
    const headers = [
      'Position ID',
      'Position Effective Date',
      'Hiring Status',
      'Job Profile',
      'Job Family',
      'Management Level',
      'Company Hierarchy',
      'Supervisory Organization',
      'Cost Center',
      'Location',
      'Company',
      'Supervisory Position',
      'Worker Type',
      'FTE Percent',
      'Earliest Hire Date',
      'Availability Date',
    ]
    const data = rows({
      'Position ID': ['P-1000', 'P-1130', 'P-1132'],
      'Position Effective Date': ['04/01/2026', '04/01/2026', '06/15/2026'],
      'Hiring Status': ['Filled', 'Filled', 'Open'],
      'Job Profile': ['Chief executive officer', 'Director, Design Verification', 'Senior engineer'],
      'Job Family': ['Executive', 'Silicon Engineering', 'Silicon Engineering'],
      'Management Level': ['1 Executive', '5 Director', '7 Individual Contributor'],
      'Company Hierarchy': ['Executive Office', 'Silicon Engineering', 'Silicon Engineering'],
      'Supervisory Organization': ['Executive Office', 'Design Verification', 'Design Verification'],
      'Cost Center': ['1010-SJC', '1130-BLR', '1130-MUC'],
      Location: ['San Jose', 'Bengaluru', 'Munich'],
      Company: [
        'Northgate Semiconductor Inc.',
        'Northgate Semiconductor India Pvt. Ltd.',
        'Northgate Semiconductor GmbH',
      ],
      'Supervisory Position': [null, 'P-1100', 'P-1130'],
      'Worker Type': ['Employee', 'Employee', 'Employee'],
      'FTE Percent': [100, 100, 80],
      'Earliest Hire Date': [null, null, '11/02/2026'],
      'Availability Date': [null, null, '08/15/2026'],
    })
    const m = autoMap(headers, data, datasetDef('positions'))
    expect(picks(m)).toEqual({
      positionId: 'Position ID',
      effectiveDate: 'Position Effective Date',
      status: 'Hiring Status',
      title: 'Job Profile',
      jobFamily: 'Job Family',
      level: 'Management Level',
      businessUnit: 'Company Hierarchy',
      department: 'Supervisory Organization',
      costCenter: 'Cost Center',
      location: 'Location',
      legalEntity: 'Company',
      managerPositionId: 'Supervisory Position',
      workerType: 'Worker Type',
      fte: 'FTE Percent',
      startDate: 'Earliest Hire Date',
      openedDate: 'Availability Date',
    })
    for (const k of ['positionId', 'effectiveDate', 'status', 'costCenter', 'location', 'managerPositionId'])
      expect(m[k].confidence, k).toBe('high')
  })

  it('maps a Workday worker roster', () => {
    const headers = [
      'Employee Number',
      'Full Name',
      'Position ID',
      'Original Hire Date',
      'Termination Date',
      'Worker Type',
      'Management Level',
      'Supervisory Organization',
      'Cost Center',
      'Work Location',
      'Manager Employee ID',
      'On Leave',
    ]
    const data = rows({
      'Employee Number': ['10001', '10002', '10003'],
      'Full Name': ['Maya Lindqvist', 'Rahul Menon', 'Jonas Becker'],
      'Position ID': ['P-1000', 'P-1100', 'P-1132'],
      'Original Hire Date': ['03/01/2012', '07/13/2015', '04/01/2019'],
      'Termination Date': [null, null, '05/29/2026'],
      'Worker Type': ['Regular', 'Regular', 'Regular'],
      'Management Level': ['1 Executive', '3 Vice President', '7 Individual Contributor'],
      'Supervisory Organization': ['Office of the CEO', 'Engineering', 'Verification'],
      'Cost Center': ['1010-SJC', '1100-SJC', '1130-MUC'],
      'Work Location': ['San Jose', 'Bengaluru', 'Munich'],
      'Manager Employee ID': [null, '10001', '10002'],
      'On Leave': ['No', 'No', 'Yes'],
    })
    const m = autoMap(headers, data, datasetDef('workers'))
    expect(picks(m)).toEqual({
      employeeId: 'Employee Number',
      name: 'Full Name',
      positionId: 'Position ID',
      hireDate: 'Original Hire Date',
      terminationDate: 'Termination Date',
      workerType: 'Worker Type',
      level: 'Management Level',
      department: 'Supervisory Organization',
      costCenter: 'Cost Center',
      location: 'Work Location',
      managerId: 'Manager Employee ID',
      onLeave: 'On Leave',
    })
    for (const k of ['employeeId', 'name', 'hireDate', 'terminationDate', 'managerId', 'costCenter'])
      expect(m[k].confidence, k).toBe('high')
  })

  it('maps a Greenhouse job export to requisitions', () => {
    const headers = [
      'Job ID',
      'Requisition ID',
      'Job Name',
      'Job Status',
      'Open Date',
      'Close Date',
      'Hiring Manager',
      'Recruiter',
    ]
    const m = autoMap(headers, [], datasetDef('reqs'))
    expect(picks(m)).toEqual({
      reqId: 'Requisition ID',
      status: 'Job Status',
      openedDate: 'Open Date',
      closedDate: 'Close Date',
      hiringManagerId: 'Hiring Manager',
      recruiter: 'Recruiter',
    })
  })

  it('maps an Anaplan or Adaptive target export', () => {
    const headers = [
      'Version',
      'Fiscal Year',
      'Level 1',
      'Level 2',
      'Level 3',
      'HC EOP',
      'Total Personnel Expense',
    ]
    const m = autoMap(headers, [], datasetDef('targets'))
    expect(picks(m)).toEqual({
      fiscalYear: 'Fiscal Year',
      businessUnit: 'Level 1',
      department: 'Level 2',
      costCenter: 'Level 3',
      targetHeads: 'HC EOP',
      targetCost: 'Total Personnel Expense',
    })
  })
})

describe('autoMap: an ATS export with both Job ID and Requisition ID', () => {
  const headers = ['Job ID', 'Requisition ID', 'Job', 'Status', 'Opened']
  const data = rows({
    'Job ID': ['4012345005', '4012345006', '4012345006', '4012345011'],
    'Requisition ID': ['REQ-0042', 'REQ-0043', 'REQ-0043', 'REQ-0050'],
    Job: ['DV Engineer', 'PD Engineer', 'PD Engineer', 'Analog Designer'],
    Status: ['Open', 'Open', 'On hold', 'Filled'],
    Opened: ['2026-07-01', '2026-07-03', '2026-07-09', '2026-07-12'],
  })
  const def = datasetDef('reqs')

  it('prefers Requisition ID over Job ID for the req ID, in any column order', () => {
    expect(autoMap(headers, data, def).reqId.header).toBe('Requisition ID')
    const swapped = ['Requisition ID', ...headers.filter((h) => h !== 'Requisition ID')]
    expect(autoMap(swapped, data, def).reqId.header).toBe('Requisition ID')
    expect(autoMap(headers, [], def).reqId.header).toBe('Requisition ID')
    expect(
      rankHeaders(headers, data, def, 'reqId')
        .map((r) => r.header)
        .slice(0, 2),
    ).toEqual(['Requisition ID', 'Job ID'])
    // Job ID is left free for the user rather than mapped to something else.
    expect(Object.values(autoMap(headers, data, def)).some((x) => x.header === 'Job ID')).toBe(false)
  })

  it('prefers the column whose values match the loaded requisitions', () => {
    const byJobId = [{ field: 'reqId', values: new Set(['4012345005', '4012345006', '4012345011']) }]
    const m = autoMap(headers, data, def, undefined, byJobId)
    expect(m.reqId.header).toBe('Job ID')
    expect(m.reqId.reason).toMatch(/values match records already loaded/)
    expect(rankHeaders(headers, data, def, 'reqId', byJobId)[0].header).toBe('Job ID')

    // Requisition IDs written in another case still count.
    const byReq = [{ field: 'reqId', values: new Set(['req-0042', 'req-0043', 'req-0050']) }]
    expect(autoMap(headers, data, def, undefined, byReq).reqId.header).toBe('Requisition ID')
    // A hint for another field, or an empty one, changes nothing.
    const other = [
      { field: 'positionId', values: new Set(['4012345005']) },
      { field: 'reqId', values: new Set<string>() },
    ]
    expect(autoMap(headers, data, def, undefined, other).reqId.header).toBe('Requisition ID')
  })

  it('never lets a known-value match beat a clearly better name', () => {
    const titles = [{ field: 'reqId', values: new Set(['DV Engineer', 'PD Engineer', 'Analog Designer']) }]
    expect(autoMap(headers, data, def, undefined, titles).reqId.header).toBe('Requisition ID')
  })

  it('knownShare is the share of sampled values found in the known set', () => {
    const p = profileColumn('Job ID', data)
    expect(knownShare('reqId', p, [{ field: 'reqId', values: new Set(['4012345006']) }])).toBe(0.5)
    expect(knownShare('reqId', p, undefined)).toBe(0)
    expect(
      knownShare('reqId', profileColumn('Missing', data), [{ field: 'reqId', values: new Set(['x']) }]),
    ).toBe(0)
  })
})

describe('learned synonyms and manual choices', () => {
  it('applies learned picks before scoring', () => {
    const m = autoMap(['Worker Ref', 'Hire Date'], [], datasetDef('workers'), { 'worker ref': 'employeeId' })
    expect(m.employeeId).toEqual({
      header: 'Worker Ref',
      confidence: 'high',
      score: 1,
      reason: 'You chose this column before',
    })
  })

  it('ignores learned picks for fields the dataset lacks, and keys an object reserves', () => {
    expect(
      autoMap(['Worker Ref'], [], datasetDef('workers'), { 'worker ref': 'reqId' }).employeeId.header,
    ).toBe(null)
    // Only picks you made count: names every object inherits ("constructor") are never one.
    const m = autoMap(['Constructor', 'Has own property', 'Hire date'], [], datasetDef('workers'), {})
    expect(Object.values(m).filter((x) => x.reason === 'You chose this column before')).toEqual([])
    expect(picks(m)).toEqual({ hireDate: 'Hire date' })
  })

  it('withChoice moves a column to the chosen field and frees it elsewhere', () => {
    const m = autoMap(['Employee ID', 'Name'], [], datasetDef('workers'))
    const next = withChoice(m, 'department', 'Name')
    expect(next.name.header).toBe(null)
    expect(next.department).toEqual({ header: 'Name', confidence: 'high', score: 1, reason: 'Chosen by you' })
    expect(withChoice(next, 'department', null).department.reason).toBe('Left unmapped by you')
  })

  it('ranks columns for one field', () => {
    const ranked = rankHeaders(
      ['Hire Date', 'Start Date', 'Last Day', 'Name'],
      [],
      datasetDef('workers'),
      'hireDate',
    )
    expect(ranked.map((r) => r.header)).toEqual(['Hire Date', 'Start Date'])
    expect(ranked[0].confidence).toBe('high')
  })
})

describe('every dataset maps its own labels exactly', () => {
  it.each(DATASET_KEYS)('%s', (key) => {
    const def = datasetDef(key)
    const headers = def.fields.map((f) => (f.required ? `${f.label} *` : f.label))
    const m = autoMap(headers, [], def)
    for (const f of def.fields) {
      expect(m[f.key].header, f.key).toBe(f.required ? `${f.label} *` : f.label)
      expect(m[f.key].score, f.key).toBe(1)
    }
  })
})
