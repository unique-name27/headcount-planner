/**
 * Reading files (docs/PLAN.md 16.2): header detection under title rows, blank and repeated
 * headers, delimiters, CSV kept as text so the day order is decided per column, Excel cells with
 * their types and UTC dates, and plain messages for files that cannot be read. SheetJS loads on
 * demand, so `readWorkbook` is async.
 */
import { describe, expect, it } from 'vitest'
import {
  dedupeHeaders,
  detectHeaderRow,
  formatOf,
  readWorkbook,
  sheetFromRows,
  sniffDelimiter,
  WorkbookReadError,
} from './parse'

type ExcelModule = typeof import('exceljs')
async function excel(): Promise<ExcelModule> {
  const mod = await import('exceljs')
  return ((mod as unknown as { default?: ExcelModule }).default ?? mod) as ExcelModule
}

const enc = (s: string) => new TextEncoder().encode(s)

describe('header detection', () => {
  it('skips title rows and picks the first real header row', () => {
    const rows = [
      ['Headcount report'],
      [],
      ['As of', '2026-09-30'],
      ['Employee ID', 'Name', 'Hire date'],
      ['E1', 'Ana', '2020-01-01'],
    ]
    expect(detectHeaderRow(rows)).toBe(3)
  })

  it('rejects numeric rows, narrow rows and rows with repeated cells', () => {
    expect(
      detectHeaderRow([
        [1, 2, 3],
        ['a', 'a', 'b'],
        ['id', 'name', 'level'],
      ]),
    ).toBe(2)
    expect(
      detectHeaderRow([
        ['Report', 'Headcount'],
        ['ID', 'Name', 'Level', 'Site'],
        ['E1', 'Ana', 'P3', 'Austin'],
      ]),
    ).toBe(1)
    expect(
      detectHeaderRow([
        ['Run on', '2026-09-30', ''],
        ['ID', 'Name', 'Hire date'],
      ]),
    ).toBe(1)
    expect(detectHeaderRow([[1, 2, 3]])).toBe(0)
  })

  it('tolerates one repeated column name but not a repeated banner', () => {
    expect(
      detectHeaderRow([
        ['Roster'],
        ['ID', 'Name', 'Hire date', 'Name'],
        ['E1', 'Ana', '2020-01-01', 'Ana B'],
      ]),
    ).toBe(1)
    expect(
      detectHeaderRow([
        ['Q3', 'Q3', 'Q3'],
        ['ID', 'Name', 'Site'],
        ['E1', 'Ana', 'Austin'],
      ]),
    ).toBe(1)
  })

  it('names blank headers and de-duplicates repeats', () => {
    expect(dedupeHeaders(['Name', '', ' Name ', 'name', null, 'Hire\n date'], 7)).toEqual([
      'Name',
      'Column 2',
      'Name (2)',
      'name (3)',
      'Column 5',
      'Hire date',
      'Column 7',
    ])
  })

  it('sniffs delimiters and file formats', () => {
    expect(sniffDelimiter('a;b;c\n1;2;3')).toBe(';')
    expect(sniffDelimiter('\n\na\tb\tc')).toBe('\t')
    expect(sniffDelimiter('a|b|c')).toBe('|')
    expect(sniffDelimiter('a,b')).toBe(',')
    expect(['roster.CSV', 'x.txt', 'x.tsv', 'x.xls', 'x.xlsm', 'x.pdf'].map(formatOf)).toEqual([
      'csv',
      'csv',
      'tsv',
      'xls',
      'xlsx',
      'other',
    ])
  })
})

describe('readWorkbook: text files', () => {
  it('keeps CSV values as text so the day order can be decided per column', async () => {
    const csv =
      '﻿Employee ID,Name,Hire date,Salary,Site\n00123,"Smith, Jane",03/04/2024,"$120,000","San Jose,\nCA"\n,,,,\n00124,Bob,14/03/2024,1e3,\n'
    const book = await readWorkbook(enc(csv), 'roster.csv')
    expect(book.format).toBe('csv')
    expect(book.sheets).toHaveLength(1)
    const s = book.sheets[0]
    expect(s.headers).toEqual(['Employee ID', 'Name', 'Hire date', 'Salary', 'Site'])
    expect(s.rows).toEqual([
      {
        'Employee ID': '00123',
        Name: 'Smith, Jane',
        'Hire date': '03/04/2024',
        Salary: '$120,000',
        Site: 'San Jose,\nCA',
      },
      { 'Employee ID': '00124', Name: 'Bob', 'Hire date': '14/03/2024', Salary: '1e3', Site: null },
    ])
    // The quoted line break stays inside one record, so Bob is on line 4 as Excel shows it.
    expect(s.rowNumbers).toEqual([2, 4])
  })

  it('leaves free-text columns out of the sheet when it is read', async () => {
    const book = await readWorkbook(
      enc('Request ID,Justification,Type\nHCR-1,"Need $95k for this",New role\n'),
      'r.csv',
    )
    expect(book.sheets[0].headers).toEqual(['Request ID', 'Type'])
    expect(JSON.stringify(book.sheets[0].rows)).not.toContain('95k')
    expect(book.sheets[0].dropped).toEqual([{ header: 'Justification', reason: 'comment' }])
  })

  it('reads semicolon CSV, TSV and non-ASCII text', async () => {
    const semi = (await readWorkbook(enc('Ort;Gehalt\nMünchen;1.234,50\n'), 'de.csv')).sheets[0]
    expect(semi.rows).toEqual([{ Ort: 'München', Gehalt: '1.234,50' }])
    const tsv = (await readWorkbook(enc('Request ID\tSubmitted\nHCR-1\t2026-09-30 14:05\n'), 'r.tsv'))
      .sheets[0]
    expect(tsv.rows).toEqual([{ 'Request ID': 'HCR-1', Submitted: '2026-09-30 14:05' }])
  })

  it('builds sheets from in-memory rows', () => {
    const s = sheetFromRows('Pasted', [
      ['Req ID', 'Status'],
      ['R-1', 'Open'],
      [null, '  '],
    ])
    expect(s?.rows).toEqual([{ 'Req ID': 'R-1', Status: 'Open' }])
    expect(sheetFromRows('Empty', [[], [null]])).toBe(null)
  })
})

describe('readWorkbook: Excel files', () => {
  it('reads every non-empty sheet with typed cells and UTC dates', async () => {
    const ExcelJS = await excel()
    const wb = new ExcelJS.Workbook()
    const a = wb.addWorksheet('Workers')
    a.addRow(['Northgate roster'])
    a.addRow([])
    a.addRow(['Employee ID', 'Hire date', 'Submitted', 'Salary', 'Name', 'Name'])
    a.addRow([
      '00123',
      new Date(Date.UTC(2026, 8, 30)),
      new Date(Date.UTC(2026, 8, 30, 14, 5)),
      120000.5,
      'Ana',
      'Dup',
    ])
    a.addRow([])
    a.addRow([456, new Date(Date.UTC(2019, 0, 1)), null, null, 'Bo', null])
    wb.addWorksheet('Empty')
    const b = wb.addWorksheet('Reqs')
    b.addRow(['Req ID', 'Status'])
    b.addRow(['R-1', 'Open'])
    const buf = await wb.xlsx.writeBuffer()

    const book = await readWorkbook(buf as ArrayBuffer, 'export.xlsx')
    expect(book.format).toBe('xlsx')
    expect(book.sheets.map((s) => s.name)).toEqual(['Workers', 'Reqs'])
    expect(book.emptySheets).toEqual(['Empty'])
    const roster = book.sheets[0]
    expect(roster.headerRow).toBe(2)
    expect(roster.headers).toEqual(['Employee ID', 'Hire date', 'Submitted', 'Salary', 'Name', 'Name (2)'])
    expect(roster.rowNumbers).toEqual([4, 6])
    const [r1, r2] = roster.rows
    expect(r1['Employee ID']).toBe('00123')
    expect((r1['Hire date'] as Date).toISOString()).toBe('2026-09-30T00:00:00.000Z')
    expect(Math.abs((r1.Submitted as Date).getTime() - Date.UTC(2026, 8, 30, 14, 5))).toBeLessThan(1000)
    expect(r1.Salary).toBe(120000.5)
    expect(r2['Employee ID']).toBe(456)
    expect(r2.Submitted).toBe(null)
  })

  it('explains files it cannot read', async () => {
    const junk = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4, 5, 6, 7, 8])
    await expect(readWorkbook(junk, 'broken.xlsx')).rejects.toThrow(WorkbookReadError)
    await expect(readWorkbook(junk, 'broken.xlsx')).rejects.toThrow(
      '"broken.xlsx" could not be read. Save it as .xlsx or .csv and try again.',
    )
  })
})
