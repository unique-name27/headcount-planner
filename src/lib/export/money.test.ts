/**
 * Money columns and the mode lines in every export (docs/PLAN.md 14.1 items 1 and 5, 14.3): `pay`
 * columns follow pay amounts (HR admin with the switch), `cost` columns follow cost totals (every
 * mode but Manager), `band` columns follow band estimates (every mode but Manager), and every
 * export says which mode made it (HR admin's too: lead decision D-MODELINE), with the mode's cost line
 * under "Cost amounts" in place of "Pay amounts" where it has one.
 */
import { describe, expect, it, vi } from 'vitest'
import type { AccessContext } from '@/access/context'
import { BANNED_MODE_WORDS, FINANCE_EXPORT_LINE, managerExportLine, ROUNDED_EXPORT_LINE } from '@/access/copy'
import { MODES } from '@/access/modes'
import type { ScopeLock, UnitScope } from '@/access/scopes/types'
import type { Column, ExportMeta, RegisteredFigure } from '@/charts/types'
import type { Mode } from '@/data/schema'
import { toTsv } from './clipboard'
import { moneyDropped, moneyLeftOut, moneyOpts, moneyShown, readMoney, visibleColumns } from './columns'
import { csvPreamble, downloadCsv, toCsv } from './csv'
import { INDIVIDUAL_PAY_LINE } from './exportHeader'
import { modeMeta } from './modeMeta'
import { imageFooter, modeLines, withoutDataContext } from './names'
import { WHY_KEY } from './suppressedFlag'
import { buildViewWorkbook, payFact } from './view'
import { buildWorkbook } from './xlsx'

const saved = vi.hoisted(() => [] as { name: string; blob: Blob }[])
vi.mock('./download', async (orig) => ({
  ...(await orig<typeof import('./download')>()),
  downloadBlob: (blob: Blob, name: string) => {
    saved.push({ blob, name })
  },
}))

const cols: Column[] = [
  { key: 'unit', label: 'Business unit' },
  { key: 'heads', label: 'Heads', format: 'int' },
  { key: 'loaded', label: 'Loaded cost (USD)', format: 'money', cost: true },
  { key: 'band', label: 'Band estimate (USD)', format: 'moneyFull', band: true },
  { key: 'base', label: 'Base salary', format: 'moneyFull', pay: true },
  { key: 'weight', label: 'Standard heads', format: 'num2' },
]
const rows = [
  {
    unit: 'Silicon Engineering',
    heads: 556,
    loaded: 93_800_000,
    band: 288_691.2,
    base: 182_000,
    weight: 1.66,
  },
]
const keys = (cs: readonly Column[]) => cs.map((c) => c.key)

const meta: ExportMeta = {
  view: 'Plan',
  tab: 'Overview',
  scope: 'Whole company',
  window: 'FY27',
  asOf: '2026-09-30',
  isSample: true,
  company: 'Northgate Semiconductor',
}

describe('money columns', () => {
  it('keeps pay columns with pay amounts on, cost and band columns with cost totals on', () => {
    // Manager: no amount of any kind.
    expect(keys(visibleColumns(cols, { pay: false, cost: false }))).toEqual(['unit', 'heads', 'weight'])
    // Finance and the rounded modes: totals over groups and band estimates, never one person's amount.
    expect(keys(visibleColumns(cols, { pay: false, cost: true }))).toEqual([
      'unit',
      'heads',
      'loaded',
      'band',
      'weight',
    ])
    expect(keys(visibleColumns(cols, { pay: true, cost: true }))).toEqual(keys(cols))
    // Pay amounts on always allows totals; a plain boolean means pay amounts.
    expect(keys(visibleColumns(cols, { pay: true, cost: false }))).toEqual(keys(cols))
    expect(keys(visibleColumns(cols, true))).toEqual(keys(cols))
    expect(keys(visibleColumns(cols, false))).toEqual(['unit', 'heads', 'weight'])
    // A band flag of its own wins over the cost flag.
    expect(keys(visibleColumns(cols, { pay: false, cost: true, band: false }))).toEqual([
      'unit',
      'heads',
      'loaded',
      'weight',
    ])
  })

  it('reads the context flags, cost following pay and band following cost when not given', () => {
    expect(moneyShown({ showPay: false })).toEqual({ pay: false, cost: false, band: false })
    expect(moneyShown({ showPay: true })).toEqual({ pay: true, cost: true, band: true })
    expect(moneyShown({ showPay: false, showCost: true })).toEqual({ pay: false, cost: true, band: true })
    expect(moneyOpts({ showPay: false, showCost: true })).toEqual({
      showPay: false,
      showCost: true,
      showBand: true,
    })
    expect(readMoney({ pay: true, cost: false })).toEqual({ pay: true, cost: true, band: true })
    expect(moneyDropped({ cost: true }, { pay: false, cost: true })).toBe(false)
    expect(moneyDropped({ band: true }, { pay: false, cost: false })).toBe(true)
    expect(moneyDropped({ pay: true }, { pay: false, cost: true })).toBe(true)
  })

  it('says when money was left out of an export', () => {
    const tables = [{ columns: cols }]
    expect(moneyLeftOut(tables, { pay: true, cost: true })).toBe(false)
    expect(moneyLeftOut(tables, { pay: false, cost: true })).toBe(true)
    expect(moneyLeftOut([{ columns: [cols[0], cols[2], cols[3]] }], { pay: false, cost: true })).toBe(false)
    expect(moneyLeftOut([{ columns: [cols[0], cols[3]] }], { pay: false, cost: false })).toBe(true)
  })

  it('writes the same columns to CSV and the clipboard', () => {
    const csv = toCsv({ columns: cols, rows }, { showPay: false, showCost: true, bom: false })
    expect(csv.split('\r\n')[0]).toBe(
      'Business unit,Heads,Loaded cost (USD),Band estimate (USD),Standard heads,Suppressed,Why',
    )
    expect(toTsv({ columns: cols, rows }, { showPay: false }).split('\n')[0]).toBe(
      'Business unit\tHeads\tStandard heads',
    )
  })

  it('keeps the cost columns in a downloaded CSV (the template app passed showPay alone and dropped them)', async () => {
    saved.length = 0
    downloadCsv({ name: 'Cost', columns: cols, rows }, meta, {
      showPay: false,
      showCost: true,
      preamble: false,
    })
    const text = (await saved[0].blob.text()).replace(/^﻿/, '')
    const [head, row] = text.split('\r\n')
    expect(head).toBe(
      'Business unit,Heads,Loaded cost (USD),Band estimate (USD),Standard heads,Suppressed,Why',
    )
    expect(row).toBe('Silicon Engineering,556,93800000,288691.2,1.66,,')
    // Manager mode: no amount column at all.
    saved.length = 0
    downloadCsv({ name: 'Cost', columns: cols, rows }, meta, {
      showPay: false,
      showCost: false,
      preamble: false,
    })
    expect((await saved[0].blob.text()).split('\r\n')[0]).toContain('Business unit,Heads,Standard heads')
  })

  it('writes a rounded amount as a number, never as words', () => {
    const money: Column[] = [{ key: 'v', label: 'Cost', format: 'moneyM', cost: true }]
    const csv = toCsv(
      {
        columns: money,
        rows: [
          { v: 0 },
          { v: 0 },
          { v: null, [WHY_KEY]: 'Hidden to protect anonymity (n < 5)' },
          { v: null },
        ],
      },
      {
        showPay: false,
        showCost: true,
        bom: false,
      },
    )
    // A hidden amount is an empty cell, flagged Suppressed with the guard's reason (14.1 item 2); an
    // amount that is not there at all is empty too, and not flagged.
    expect(csv.split('\r\n')).toEqual([
      'Cost,Suppressed,Why',
      '0,,',
      '0,,',
      ',Yes,Hidden to protect anonymity (n < 5)',
      ',,',
      '',
    ])
  })

  it('writes the cost column to Excel in Finance and drops the pay column', async () => {
    const wb = await buildWorkbook([{ name: 'Cost', columns: cols, rows }], meta, {
      showPay: false,
      showCost: true,
    })
    const ws = wb.getWorksheet('Cost')!
    const heads: string[] = []
    ws.eachRow((row) => {
      if (row.getCell(1).value === 'Business unit')
        row.eachCell((c) => {
          heads.push(String(c.value))
        })
    })
    expect(heads).toEqual([
      'Business unit',
      'Heads',
      'Loaded cost (USD)',
      'Band estimate (USD)',
      'Standard heads',
      'Suppressed',
      'Why',
    ])
  })
})

const unit = (label: string): UnitScope => ({
  kind: 'unit',
  unit: label,
  positionIds: new Set(),
  personIds: new Set(),
  otherDepartments: new Set(),
  leaderPositionIds: new Set(),
  size: 0,
  label,
})

type ModeAccess = Pick<AccessContext, 'mode' | 'scope' | 'unset' | 'actingAs'> &
  Partial<Pick<AccessContext, 'switchOn'>>
const access = (mode: Mode, scope: ScopeLock | null = null, extra: Partial<ModeAccess> = {}): ModeAccess => ({
  mode,
  scope,
  unset: false,
  actingAs: null,
  ...extra,
})

describe('mode lines', () => {
  const plain = (mode: Mode) => modeMeta(access(mode))

  it('stamps every mode, each with its cost line', () => {
    // HR admin names its mode too (D-MODELINE), and says when pay amounts are shown.
    expect(plain('hr-admin')).toEqual({ modeLine: 'Made in HR admin mode.' })
    expect(modeMeta(access('hr-admin', null, { switchOn: true }))).toEqual({
      modeLine: 'Made in HR admin mode with pay amounts shown.',
    })
    expect(plain('finance')).toEqual({ modeLine: 'Made in Finance mode.', costLine: FINANCE_EXPORT_LINE })
    expect(plain('hrbp')).toEqual({ modeLine: 'Made in HRBP mode.', costLine: ROUNDED_EXPORT_LINE })
    // A leader whose pick holds no scope is company-wide (CEO, CFO, CHRO).
    expect(plain('leader')).toEqual({
      modeLine: 'Made in Leader mode for the whole company.',
      costLine: ROUNDED_EXPORT_LINE,
    })
    expect(modeMeta(access('leader', null, { unset: true })).modeLine).toBe('Made in Leader mode.')
    // Manager: no amounts, so no cost line.
    expect(plain('manager')).toEqual({ modeLine: 'Made in Manager mode.' })
    for (const m of MODES) {
      const lines = [
        ...modeLines(plain(m)),
        ...modeLines(modeMeta(access(m, null, { switchOn: true }))),
      ].join(' ')
      expect(lines, m).toMatch(/^Made in /)
      expect(lines, m).not.toMatch(/—/)
      for (const w of BANNED_MODE_WORDS) expect(lines.toLowerCase(), m).not.toContain(w)
    }
  })

  it('names the scope or the manager, and nobody while the pick is missing', () => {
    expect(modeMeta(access('hrbp', unit('Silicon Engineering'))).modeLine).toBe(
      'Made in HRBP mode for Silicon Engineering.',
    )
    expect(
      modeMeta(access('manager', null, { actingAs: { personId: 'E1', name: 'Priya Raman' } })).modeLine,
    ).toBe(managerExportLine('Priya Raman'))
    expect(managerExportLine('Priya Raman')).toBe(
      "Made in Manager mode for Priya Raman's team. No amounts are included.",
    )
    expect(modeMeta(access('hrbp', unit('Silicon Engineering'), { unset: true })).modeLine).toBe(
      'Made in HRBP mode.',
    )
    expect(
      modeMeta(access('manager', null, { unset: true, actingAs: { personId: 'E1', name: 'Priya Raman' } }))
        .modeLine,
    ).toBe('Made in Manager mode.')
  })

  it('puts the lines on CSV preambles, sheet title blocks, image footers and the Summary', async () => {
    const fin = { ...meta, ...plain('finance') }
    const pre = csvPreamble({ name: 'Cost', columns: cols, rows }, fin)
    expect(pre).toContain('Made in Finance mode.')
    expect(pre).toContain(FINANCE_EXPORT_LINE)
    expect(csvPreamble({ name: 'Cost', columns: cols, rows }, meta).join(' ')).not.toContain('Made in')
    expect(imageFooter({ ...meta, ...plain('leader') })).toContain(
      'Made in Leader mode for the whole company ·',
    )
    // A view that reads no plan data carries no mode lines.
    expect(modeLines(withoutDataContext(fin))).toEqual([])

    const book = await buildWorkbook([{ name: 'Cost', columns: cols, rows }], fin, {
      showPay: false,
      showCost: true,
    })
    const block: string[] = []
    book.getWorksheet('Cost')!.eachRow((row) => {
      block.push(String(row.getCell(1).value ?? ''))
    })
    expect(block).toContain('Made in Finance mode.')
    expect(block).toContain(FINANCE_EXPORT_LINE)

    const figure: RegisteredFigure = {
      id: 'c',
      title: 'Cost',
      columns: cols,
      rows,
      getSvg: () => null,
      order: 0,
    }
    const wb = await buildViewWorkbook([figure], fin, { showPay: false, showCost: true, images: false })
    const facts = new Map<string, string>()
    wb.getWorksheet('Summary')!.eachRow((row) => {
      facts.set(String(row.getCell(1).value ?? ''), String(row.getCell(2).value ?? ''))
    })
    expect(facts.get('Mode')).toBe('Made in Finance mode.')
    // The cost line under its own name, not "Pay" (M4 review CP-10).
    expect(facts.get('Cost amounts')).toBe(FINANCE_EXPORT_LINE)
    expect(facts.has('Pay')).toBe(false)
    expect(facts.has('Pay amounts')).toBe(false)
  })

  it('says "Pay amounts" outside the modes with a cost line only when a figure has money columns', () => {
    expect(payFact({}, { pay: false, cost: false }, false, false)).toEqual([])
    expect(payFact({}, { pay: true, cost: true }, true, true)).toEqual([['Pay amounts', 'Included']])
    expect(payFact({}, { pay: false, cost: false }, false, true)).toEqual([['Pay amounts', 'Left out']])
    expect(payFact({ costLine: FINANCE_EXPORT_LINE }, { pay: false, cost: true }, true, true)).toEqual([
      ['Cost amounts', FINANCE_EXPORT_LINE],
    ])
  })
})

describe('money flags in every output, per mode (docs/PLAN.md 14.1 item 5)', () => {
  /** What each mode shows: no amount in Manager, totals and band estimates elsewhere, pay with the switch. */
  const expected: Record<string, string[]> = {
    manager: ['unit', 'heads', 'weight'],
    hrbp: ['unit', 'heads', 'loaded', 'band', 'weight'],
    leader: ['unit', 'heads', 'loaded', 'band', 'weight'],
    finance: ['unit', 'heads', 'loaded', 'band', 'weight'],
    'hr-admin': ['unit', 'heads', 'loaded', 'band', 'weight'],
    'hr-admin+pay': ['unit', 'heads', 'loaded', 'band', 'base', 'weight'],
  }
  const cases = [...MODES.map((m) => ({ mode: m, pay: false })), { mode: 'hr-admin' as Mode, pay: true }]
  const flags = (keys: string[]) => keys.filter((k) => k !== '__suppressed' && k !== '__suppressedWhy')
  const labels = new Map([
    ...cols.map((c): [string, string] => [c.label, c.key]),
    ['Suppressed', '__suppressed'],
    ['Why', '__suppressedWhy'],
  ])

  it('drops pay, cost and band columns per mode in tables, CSV, clipboard, Excel, slides and the long CSV', async () => {
    const { sampleCtx } = await import('@/testkit/sample')
    const { slideTable } = await import('./view')
    const { longColumns } = await import('./longCsv')
    for (const { mode, pay } of cases) {
      const ctx = sampleCtx(mode, { showPay: pay })
      const want = expected[pay ? 'hr-admin+pay' : mode]
      const opts = moneyOpts(ctx)
      const name = `${mode}${pay ? ' with pay' : ''}`
      // Tables on screen (DataTable reads the same `visibleColumns(columns, moneyShown(ctx))`).
      expect(keys(visibleColumns(cols, moneyShown(ctx))), name).toEqual(want)
      const csvHead = toCsv({ columns: cols, rows }, { ...opts, bom: false })
        .split('\r\n')[0]
        .split(',')
      expect(flags(csvHead.map((l) => labels.get(l) ?? l)), `${name} CSV`).toEqual(want)
      // With the switch on, the copy says "Contains individual pay" first (D-PAYFILES).
      const tsv = toTsv({ columns: cols, rows }, opts).split('\n')
      expect(tsv[0] === INDIVIDUAL_PAY_LINE, `${name} clipboard pay line`).toBe(pay)
      const tsvHead = tsv[pay ? 1 : 0].split('\t')
      expect(flags(tsvHead.map((l) => labels.get(l) ?? l)), `${name} clipboard`).toEqual(want)
      const wb = await buildWorkbook([{ name: 'Cost', columns: cols, rows }], meta, opts)
      const heads: string[] = []
      wb.getWorksheet('Cost')!.eachRow((row) => {
        if (row.getCell(1).value === 'Business unit')
          row.eachCell((c) => {
            heads.push(labels.get(String(c.value)) ?? String(c.value))
          })
      })
      expect(flags(heads), `${name} Excel`).toEqual(want)
      const slide = slideTable({ columns: cols, rows }, moneyShown(opts))
      expect(flags(keys(slide.columns)), `${name} slides`).toEqual(want)
      // The flag columns come with the amount columns, never without them.
      expect(csvHead.includes('Suppressed'), name).toBe(want.includes('loaded'))
      // The long CSV: Manager mode writes no amount, flag or rate column.
      const long = longColumns(ctx.guard.mode)
      expect(
        long.some((c) => c.cost),
        `${name} long CSV`,
      ).toBe(mode !== 'manager')
    }
  }, 120_000)
})
