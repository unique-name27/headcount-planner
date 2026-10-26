/**
 * Templates and dataset exports (docs/PLAN.md 16.2): layout, dropdowns and pay columns, checked on
 * the workbook itself, and a dataset export read back with and without pay amounts. The round trips
 * of the fixture, the test org and the whole generated sample (ExcelJS write, SheetJS read, every
 * dataset re-imported exactly) are in templates.slow.test.ts, moved there in M4 with every assert as
 * it was (docs/M3-REPORT.md, known gap 9).
 *
 * ExcelJS and SheetJS load once in `beforeAll`, under a hook timeout of their own: under a full
 * parallel unit run their cold load took most of the 30 s test timeout, so the first test that met
 * it timed out. Each test then times only its own workbook.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { type DatasetKey, datasetDef } from '../schema'
import { applyMapping } from './apply'
import { autoMap } from './automap'
import { readWorkbook } from './parse'
import { buildTemplateWorkbook, exportDatasetWorkbook } from './templates'
import { FIXTURE } from './test-fixtures'

type ExcelModule = typeof import('exceljs')
async function excel(): Promise<ExcelModule> {
  const mod = await import('exceljs')
  return ((mod as unknown as { default?: ExcelModule }).default ?? mod) as ExcelModule
}

beforeAll(async () => {
  await Promise.all([import('exceljs'), import('xlsx')])
}, 120_000)

/** Records with every schema field present: absent optional fields read back as null. */
function complete(key: DatasetKey, rows: readonly object[]): Record<string, unknown>[] {
  const fields = datasetDef(key).fields
  return rows.map((r) =>
    Object.fromEntries(fields.map((f) => [f.key, (r as Record<string, unknown>)[f.key] ?? null])),
  )
}

describe('template layout', () => {
  it('adds the notes it is given under the Read me introduction', async () => {
    const ExcelJS = await excel()
    const note = 'Compensation is left out because pay amounts are off.'
    const blob = await buildTemplateWorkbook({ datasets: ['workers'], notes: [note], today: '2026-10-13' })
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(await blob.arrayBuffer())
    const readMe = wb.getWorksheet('Read me')!
    const lines = [1, 2, 3, 4, 5].map((r) => readMe.getRow(r).getCell(1).value)
    expect(lines[0]).toBe('Headcount Planner data template')
    expect(lines[1]).toBe(
      'Prepared 2026-10-13. Fill one sheet per dataset, then upload the file in the Data room.',
    )
    expect(lines.slice(0, 4)).toContain(note)
    expect(lines.indexOf(note)).toBeGreaterThan(1)
  })

  it('marks required headers, freezes them and adds dropdowns for list fields', async () => {
    const ExcelJS = await excel()
    const blob = await buildTemplateWorkbook({
      datasets: ['positions', 'comp'],
      sample: FIXTURE,
      sampleRows: 2,
    })
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(await blob.arrayBuffer())
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Read me', 'Positions', 'Compensation', 'Fields'])

    const ws = wb.getWorksheet('Positions')!
    const header = ws.getRow(1).values as unknown[]
    expect(header.slice(1, 4)).toEqual(['Position ID *', 'Effective date *', 'Status *'])
    expect(ws.getRow(1).getCell(1).font?.bold).toBe(true)
    expect(ws.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 })
    expect(ws.rowCount).toBe(3)
    expect(ws.getCell('B2').value).toEqual(new Date(Date.UTC(2026, 3, 1)))
    const statusCol = datasetDef('positions').fields.findIndex((f) => f.key === 'status') + 1
    expect(ws.getRow(2).getCell(statusCol).dataValidation).toMatchObject({
      type: 'list',
      formulae: ['"Filled,Open,Planned,On hold,Eliminated"'],
    })
    expect(ws.getRow(400).getCell(statusCol).dataValidation).toMatchObject({ type: 'list' })
    const levelCol = datasetDef('positions').fields.findIndex((f) => f.key === 'level') + 1
    expect(ws.getRow(2).getCell(levelCol).dataValidation).toMatchObject({
      type: 'list',
      formulae: ['"P1,P2,P3,P4,P5,P6,M1,M2,E1,E2,E3"'],
    })

    // Pay amounts in example rows stay blank unless asked for; the column is still there.
    const comp = wb.getWorksheet('Compensation')!
    expect((comp.getRow(1).values as unknown[]).slice(1)).toEqual([
      'Employee ID *',
      'Effective date *',
      'Currency',
      'Base salary (FTE rate) *',
      'Target bonus %',
    ])
    expect(comp.getRow(2).getCell(1).value).toBe('E0001')
    expect(comp.getRow(2).getCell(4).value).toBe(null)
    expect(comp.getRow(2).getCell(5).value).toBe(0.6)

    const fields = wb.getWorksheet('Fields')!
    expect(fields.getRow(1).values).toEqual([
      undefined,
      'Sheet',
      'Column',
      'Requirement',
      'Type',
      'Allowed values',
      'Description',
      'Pay amount',
    ])
    expect((fields.getRow(2).values as unknown[]).slice(1, 6)).toEqual([
      'Positions',
      'Position ID *',
      'Required',
      'ID',
      '',
    ])
    const payRows = fields
      .getRows(2, fields.rowCount - 1)!
      .filter((r) => r.getCell(7).value === 'Yes')
      .map((r) => r.getCell(2).value)
    expect(payRows).toEqual(['Base salary (FTE rate) *'])
  })

  it('writes approval steps as one cell of compact text and explains them', async () => {
    const ExcelJS = await excel()
    const blob = await buildTemplateWorkbook({ datasets: ['requests'], sample: FIXTURE, sampleRows: 1 })
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(await blob.arrayBuffer())
    const ws = wb.getWorksheet('Requests')!
    const col = datasetDef('requests').fields.findIndex((f) => f.key === 'steps') + 1
    expect(ws.getRow(1).getCell(col).value).toBe('Steps')
    expect(ws.getRow(2).getCell(col).value).toBe(
      'Manager E0002 Approved 2026-08-03; HRBP E0009 Approved with changes 2026-08-04; Leader E0001 Pending',
    )
    const fields = wb.getWorksheet('Fields')!
    const stepsRow = fields.getRows(2, fields.rowCount - 1)!.find((r) => r.getCell(2).value === 'Steps')!
    expect(stepsRow.getCell(4).value).toBe('Approval steps')
    expect(String(stepsRow.getCell(5).value)).toContain(
      'Manager E10234 Approved 2026-08-03; HRBP E10077 Pending',
    )
  })

  it('exports a dataset without pay amounts unless they are switched on', async () => {
    const ExcelJS = await excel()
    const load = async (blob: Blob) => {
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(await blob.arrayBuffer())
      return wb
    }
    const without = await load(await exportDatasetWorkbook('reqs', FIXTURE.reqs, { includePay: false }))
    expect(without.worksheets.map((w) => w.name)).toEqual(['Requisitions', 'Fields', 'Read me'])
    const headers = (without.getWorksheet('Requisitions')!.getRow(1).values as unknown[]).filter(Boolean)
    expect(headers).toEqual([
      'Req ID *',
      'Position ID',
      'Status *',
      'Stage',
      'Req type',
      'Opened date *',
      'Target start',
      'Offer accepted',
      'Start date',
      'Closed date',
      'Hiring manager ID',
      'Recruiter',
      'Offer currency',
    ])

    const leave = await load(await exportDatasetWorkbook('workers', FIXTURE.workers, { includePay: false }))
    const workerHeaders = (leave.getWorksheet('Workers')!.getRow(1).values as unknown[]).filter(Boolean)
    expect(workerHeaders).not.toContain('On leave')
    expect(workerHeaders).not.toContain('Leave paid')

    const withPay = await exportDatasetWorkbook('reqs', FIXTURE.reqs, { includePay: true })
    const book = await readWorkbook(await withPay.arrayBuffer(), 'reqs.xlsx')
    const sheet = book.sheets.find((s) => s.name === 'Requisitions')!
    const def = datasetDef('reqs')
    const r = applyMapping({ sheet, def, mapping: autoMap(sheet.headers, sheet.rows, def) })
    expect(r.issues).toEqual([])
    expect(r.rows).toEqual(complete('reqs', FIXTURE.reqs))
  })
})
