import { describe, expect, it, vi } from 'vitest'
import type { Column, ExportMeta } from '@/charts/types'
import { toTsv } from './clipboard'
import { csvField, csvPreamble, downloadCsv, guardFormula, toCsv } from './csv'
import { INDIVIDUAL_PAY_LINE } from './exportHeader'
import { fileStem, withoutDataContext } from './names'

const saved = vi.hoisted(() => [] as { blob: Blob; name: string }[])
vi.mock('./download', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./download')>()),
  downloadBlob: (blob: Blob, name: string) => saved.push({ blob, name }),
}))

const columns: Column[] = [
  { key: 'name', label: 'Name' },
  { key: 'rate', label: 'Attrition', format: 'pct' },
  { key: 'salary', label: 'Salary', format: 'moneyFull', pay: true },
  { key: 'n', label: 'People', format: 'int' },
]

describe('guardFormula', () => {
  it('prefixes values a spreadsheet would execute', () => {
    for (const s of ['=SUM(A1)', '+1', '-2+3', '@cmd', '\tx', '\rx']) expect(guardFormula(s)).toBe(`'${s}`)
  })
  it('leaves ordinary text alone', () => {
    for (const s of ['Bengaluru', 'a=b', '', ' =x']) expect(guardFormula(s)).toBe(s)
  })
})

describe('csvField', () => {
  it('quotes commas, quotes and line breaks and doubles quotes', () => {
    expect(csvField('a,b')).toBe('"a,b"')
    expect(csvField('say "hi"')).toBe('"say ""hi"""')
    expect(csvField('line1\nline2')).toBe('"line1\nline2"')
    expect(csvField('plain')).toBe('plain')
  })
  it('guards before quoting', () => {
    expect(csvField('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`)
  })
})

describe('toCsv', () => {
  const rows = [
    { name: 'Austin, TX', rate: 0.124, salary: 150000, n: 42 },
    { name: '=cmd()', rate: null, salary: 90000, n: -3 },
  ]

  it('writes a BOM, CRLF rows and drops pay columns by default', () => {
    const csv = toCsv({ columns, rows }, { showPay: false })
    expect(csv.startsWith('﻿')).toBe(true)
    const lines = csv.slice(1).split('\r\n')
    expect(lines[0]).toBe('Name,Attrition,People')
    expect(lines[1]).toBe('"Austin, TX",12.4%,42')
    // missing stays empty, negative numbers are not treated as formulas
    expect(lines[2]).toBe(`'=cmd(),,-3`)
    expect(lines[3]).toBe('')
  })

  it('includes pay columns when pay amounts are on, with the Suppressed flag (docs/PLAN.md 14.1 item 2)', () => {
    const csv = toCsv({ columns, rows }, { showPay: true, bom: false })
    expect(csv.split('\r\n')[0]).toBe('Name,Attrition,Salary,People,Suppressed,Why')
    expect(csv.split('\r\n')[1]).toBe('"Austin, TX",12.4%,150000,42,,')
  })

  it('writes an optional preamble above the header', () => {
    const csv = toCsv(
      { columns, rows: [] },
      { showPay: false, bom: false, preamble: ['Title', 'Whole company'] },
    )
    expect(csv.split('\r\n').slice(0, 4)).toEqual(['Title', 'Whole company', '', 'Name,Attrition,People'])
  })
})

const CRLF = '\r\n'
const stripBom = (t: string) => (t.charCodeAt(0) === 0xfeff ? t.slice(1) : t)

describe('downloadCsv', () => {
  const meta: ExportMeta = {
    view: 'Plan',
    viewKey: 'plan',
    scope: 'Whole company',
    window: '1 Oct 2025 – 30 Sep 2026',
    asOf: '2026-09-30',
    isSample: true,
    company: 'Northgate Semiconductor',
    standard: 'bronze',
  }
  const table = { name: 'Stage conversion', columns, rows: [{ name: 'Screen', rate: 0.5, n: 10 }] }

  it('carries the context lines by default and names the view once', async () => {
    saved.length = 0
    downloadCsv({ ...table, tier: 'silver' }, meta, { showPay: false, fileName: 'headcount-planner-plan-x' })
    const text = await saved[0].blob.text()
    const lines = stripBom(text).split(CRLF)
    expect(lines.slice(0, 5)).toEqual([
      'Stage conversion',
      'Whole company · 1 Oct 2025 – 30 Sep 2026 · As of 30 Sep 2026',
      'Data standard: Everything (bronze and up) · Tier: Silver',
      'Company confidential · Sample data',
      '',
    ])
    expect(lines[5]).toBe('Name,Attrition,People')
    expect(saved[0].name).toBe('headcount-planner-plan-x.csv')
  })

  it('passes every money flag through: cost and band columns stay with showCost (docs/PLAN.md 14.1 item 5)', async () => {
    const money: Column[] = [
      { key: 'unit', label: 'Business unit' },
      { key: 'cost', label: 'Loaded cost (USD)', format: 'money', cost: true },
      { key: 'band', label: 'Band estimate (USD)', format: 'money', band: true },
      { key: 'salary', label: 'Salary', format: 'moneyFull', pay: true },
    ]
    const costTable = {
      name: 'Cost by unit',
      columns: money,
      rows: [{ unit: 'Go-to-Market', cost: 32_300_000, band: 288_691.2, salary: 150_000 }],
    }
    const header = async (opts: { showPay: boolean; showCost?: boolean; showBand?: boolean }) => {
      saved.length = 0
      downloadCsv(costTable, meta, { ...opts, preamble: false })
      return stripBom(await saved[0].blob.text())
        .split(CRLF)
        .slice(0, 2)
    }
    // Finance and the rounded modes: cost totals and band estimates, never one person's pay; the
    // amount columns bring the Suppressed flag (14.1 item 2).
    expect(await header({ showPay: false, showCost: true })).toEqual([
      'Business unit,Loaded cost (USD),Band estimate (USD),Suppressed,Why',
      'Go-to-Market,32300000,288691.2,,',
    ])
    // Band estimates can be off while cost totals show.
    expect((await header({ showPay: false, showCost: true, showBand: false }))[0]).toBe(
      'Business unit,Loaded cost (USD),Suppressed,Why',
    )
    // Manager mode: no amount column at all, so no flag either.
    expect(await header({ showPay: false, showCost: false })).toEqual(['Business unit', 'Go-to-Market'])
    // HR admin with the switch: pay columns too, under "Contains individual pay" even with no
    // preamble (lead decision D-PAYFILES).
    saved.length = 0
    downloadCsv(costTable, meta, { showPay: true, showCost: true, preamble: false })
    expect(
      stripBom(await saved[0].blob.text())
        .split(CRLF)
        .slice(0, 3),
    ).toEqual([
      INDIVIDUAL_PAY_LINE,
      '',
      'Business unit,Loaded cost (USD),Band estimate (USD),Salary,Suppressed,Why',
    ])
  })

  it('writes the bare table when asked', async () => {
    saved.length = 0
    downloadCsv(table, meta, { showPay: false, preamble: false })
    const text = await saved[0].blob.text()
    expect(stripBom(text).split(CRLF)[0]).toBe('Name,Attrition,People')
    expect(saved[0].name).toBe('headcount-planner-plan-stage-conversion-2026-09-30.csv')
  })
})

describe('toTsv', () => {
  it('flattens tabs and newlines and guards formulas', () => {
    const tsv = toTsv(
      {
        columns: [
          { key: 'a', label: 'A' },
          { key: 'b', label: 'B', format: 'pct0' },
        ],
        rows: [
          { a: 'x\ty\nz', b: 0.5 },
          { a: '+1', b: null },
        ],
      },
      { showPay: false },
    )
    expect(tsv).toBe("A\tB\nx y z\t50%\n'+1\t")
  })
})

describe('csvPreamble', () => {
  it('states the data standard and the tier between the context and the stamp', () => {
    const lines = csvPreamble(
      { name: 'ttf', title: 'Time to fill', columns, rows: [], tier: 'gold' },
      {
        view: 'Plan',
        scope: 'Whole company',
        window: 'Last 12 months',
        asOf: '2026-09-30',
        isSample: false,
        company: 'Company data',
        standard: 'silver',
      },
    )
    expect(lines).toEqual([
      'Time to fill',
      'Whole company · Last 12 months · As of 30 Sep 2026',
      'Data standard: Validated (silver and up) · Tier: Gold',
      'Company confidential',
    ])
  })

  it('leaves out scope, as-of, data standard and sample lines for a view that reads no data', () => {
    const meta = withoutDataContext({
      view: 'Data room',
      viewKey: 'ai',
      scope: 'Whole company',
      window: 'Last 12 months',
      asOf: '2026-09-30',
      isSample: true,
      company: 'Northgate Semiconductor',
      standard: 'bronze',
    })
    const lines = csvPreamble(
      { name: 'ai-agent-catalog', title: 'Agent catalog', subtitle: 'Every agent', columns, rows: [] },
      meta,
    )
    expect(lines).toEqual(['Agent catalog', 'Every agent', 'Company confidential'])
    expect(fileStem(meta, 'ai-agent-catalog')).toBe('headcount-planner-data-room-agent-catalog')
  })
})
