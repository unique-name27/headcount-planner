/**
 * End to end on a messy, realistic export (docs/PLAN.md 13.5 and 16.2): an HRIS worker report saved
 * as CSV with the system's own column names, title rows above the header, day-first dates, month
 * names, title-style levels ("IC4", "Senior", "Director"), managers given as "Last, First" names,
 * free-text worker types, FTE as a percentage, site and legal-entity spellings, and a graduation
 * year that is never read. The import must reproduce the clean roster exactly, with nothing to
 * report.
 */
import { describe, expect, it } from 'vitest'
import { datasetDef, type Level, type WorkerRow, type WorkerType } from '../schema'
import { applyMapping } from './apply'
import { autoMap } from './automap'
import { guessDataset } from './detect'
import { summarizeIssues } from './issues'
import { readWorkbook } from './parse'
import { FIXTURE } from './test-fixtures'

const LEVEL_TEXT: Record<Level, string> = {
  P1: 'IC1',
  P2: 'IC2',
  P3: 'IC3',
  P4: 'Senior',
  P5: 'Staff',
  P6: 'Principal',
  M1: 'Manager',
  M2: 'Director',
  E1: 'VP',
  E2: 'SVP',
  E3: 'CEO',
}
const WORKER_TEXT: Record<WorkerType, string> = {
  Employee: 'Regular',
  Contractor: 'Contingent Worker',
  Intern: 'Summer intern',
}
/** How the HRIS spells the sites. */
const SITE_TEXT: Record<string, string> = {
  'San Jose': 'San Jose, CA',
  Bengaluru: 'Bangalore, India',
  Munich: 'München',
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const dmy = (d: string | null | undefined) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '')
const dMonY = (d: string | null | undefined) =>
  d ? `${+d.slice(8, 10)}-${MONTHS[+d.slice(5, 7) - 1]}-${d.slice(0, 4)}` : ''
const lastFirst = (name: string) => {
  const parts = name.split(' ')
  return `${parts.slice(1).join(' ')}, ${parts[0]}`
}
const yn = (v: boolean | null | undefined) => (v == null ? '' : v ? 'Y' : 'N')
const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)

function hrisExport(workers: readonly WorkerRow[]): string {
  const nameOf = new Map(workers.map((w) => [w.employeeId, w.name ?? w.employeeId]))
  const header = [
    'Employee Number',
    'Full Name',
    'Position',
    'Job Start Date',
    'Job End Date',
    'Original Hire Date',
    'Termination Date',
    'Worker Type',
    'FTE %',
    'Management Level',
    'Division',
    'Supervisory Organization',
    'Cost Centre',
    'Work Location',
    'Company',
    'Manager',
    'On Leave',
    'Paid Leave',
    'Graduation Year',
  ]
  const lines = workers.map((w) => {
    const manager = w.managerId ? nameOf.get(w.managerId) : undefined
    return [
      w.employeeId,
      w.name ?? '',
      w.positionId ?? '',
      dmy(w.assignmentStart),
      dmy(w.assignmentEnd),
      dmy(w.hireDate),
      dMonY(w.terminationDate),
      WORKER_TEXT[w.workerType],
      w.fte == null ? '' : String(Math.round(w.fte * 100)),
      w.level ? LEVEL_TEXT[w.level] : '',
      w.businessUnit ?? '',
      w.department ?? '',
      w.costCenter ?? '',
      w.location ? (SITE_TEXT[w.location] ?? w.location) : '',
      (w.legalEntity ?? '').toUpperCase(),
      manager ? lastFirst(manager) : '',
      yn(w.onLeave),
      w.leavePaid == null ? '' : w.leavePaid ? 'Yes' : 'No',
      // Never read: it reveals age.
      '2009',
    ]
      .map(csvCell)
      .join(',')
  })
  return ['Workers report', 'Run on 30/09/2026', '', header.join(','), ...lines].join('\r\n')
}

describe('messy HRIS worker export', () => {
  it('imports to exactly the clean roster', async () => {
    const csv = hrisExport(FIXTURE.workers)
    const book = await readWorkbook(new TextEncoder().encode(csv), 'Workers report.csv')
    const sheet = book.sheets[0]
    expect(sheet.headerRow).toBe(3)
    expect(sheet.dropped).toEqual([{ header: 'Graduation Year', reason: 'proxy' }])

    const [best] = guessDataset(sheet)
    expect(best.key).toBe('workers')
    const def = datasetDef('workers')
    const mapping = autoMap(sheet.headers, sheet.rows, def)
    const unmapped = def.fields.filter((f) => !mapping[f.key].header).map((f) => f.key)
    expect(unmapped).toEqual([])

    const r = applyMapping<'workers'>({ sheet, def, mapping })
    expect(r.used.dateOrders['Original Hire Date']).toBe('DMY')
    expect(r.used.dateOrders['Job Start Date']).toBe('DMY')
    expect(r.stats.managers).toEqual({ byId: 0, byName: 7, cleared: 0, topLevel: 1 })
    expect(summarizeIssues(r.issues)).toEqual([])
    expect(r.rows).toEqual(FIXTURE.workers)
  })

  it('reads the comp extract that goes with it against the roster', async () => {
    const lines = [
      'Employee Number,Effective On,Currency,Annual Base Salary,Target Bonus Percent',
      ...FIXTURE.comp.map((c) =>
        [
          // The payroll system writes IDs in lower case.
          c.employeeId.toLowerCase(),
          dMonY(c.effectiveDate),
          c.currency === 'EUR' ? '€' : c.currency === 'INR' ? '₹' : (c.currency ?? ''),
          c.baseSalary.toLocaleString('en-US'),
          c.targetBonusPct == null ? '' : `${+(c.targetBonusPct * 100).toFixed(1)}%`,
        ]
          .map(csvCell)
          .join(','),
      ),
    ]
    const sheet = (await readWorkbook(new TextEncoder().encode(lines.join('\n')), 'comp.csv')).sheets[0]
    const def = datasetDef('comp')
    expect(guessDataset(sheet)[0].key).toBe('comp')
    const r = applyMapping<'comp'>({
      sheet,
      def,
      mapping: autoMap(sheet.headers, sheet.rows, def),
      roster: FIXTURE.workers,
    })
    expect(r.rows).toEqual(FIXTURE.comp)
    expect(r.stats.notInRoster).toBe(0)
    // Each ID repaired against the roster is logged as a conversion, and nothing else is.
    expect(new Set(r.issues.map((i) => i.code))).toEqual(new Set(['converted']))
  })
})
