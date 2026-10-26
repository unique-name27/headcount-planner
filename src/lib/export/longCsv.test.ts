/**
 * The long CSV's writer side (docs/PLAN.md 14.1 item 3): the columns per mode, the file text (the
 * header lines and control totals above the rows, numbers as numbers, empty for missing, text
 * guarded), the file name, and `longRowProblems` catching each break of item 3's rules on synthetic
 * rows. The rows themselves come from the guarded model (src/views/finance/engine/longCsv.ts).
 */
import { describe, expect, it, vi } from 'vitest'
import { managerExportLine } from '@/access/copy'
import type { ExportMeta, PlanHeader } from '@/charts/types'
import { amountsIn } from '@/testkit/leaks'
import { controlTotalLines, controlTotals } from './controlTotals'
import { headerLines, INDIVIDUAL_PAY_LINE } from './exportHeader'
import {
  downloadLongCsv,
  LONG_CSV_COLUMNS,
  LONG_HEADS_COLUMNS,
  type LongHeadsRow,
  type LongRow,
  longColumns,
  longCsvText,
  longFactsOf,
  longNumber,
  longRowProblems,
  ROUNDED_HEADS_REASON,
} from './longCsv'

const saved = vi.hoisted(() => [] as { name: string; blob: Blob }[])
vi.mock('./download', async (orig) => ({
  ...(await orig<typeof import('./download')>()),
  downloadBlob: (blob: Blob, name: string) => {
    saved.push({ blob, name })
  },
}))

const PLAN: PlanHeader = {
  version: 'FY27 Working',
  versionState: 'working',
  lockHash: null,
  comparison: 'vs FY27 Budget',
  proration: 'daily',
  rates: 'Plan rates (EUR 1.08, ILS 0.27)',
  costDefinition: 'Loaded cost: base + bonus + burden + benefits + one-time, USD',
  filters: 'Whole company; period: FY27',
  rounding: 'Exact for groups of 5 or more',
}
const META: ExportMeta = {
  view: 'Finance',
  viewKey: 'finance',
  tab: 'Export',
  scope: 'Whole company',
  window: 'FY27',
  asOf: '2026-09-30',
  isSample: true,
  company: 'Northgate Semiconductor',
  modeLine: 'Made in Finance mode.',
  costLine: 'Cost amounts cover groups of 5 or more costed people. Individual pay is left out.',
  mode: 'finance',
  plan: PLAN,
}
const facts = longFactsOf(META)

const row = (patch: Partial<LongRow>): LongRow => ({
  ...facts,
  period: 'FY',
  org: 'Silicon Engineering',
  costCenter: '1110-SJC',
  account: '6000',
  component: 'base',
  currency: 'USD',
  amountLocal: 1_000_000,
  rate: 1,
  amountUsd: 1_000_000,
  heads: 20,
  fte: 19.5,
  suppressed: '',
  suppressedReason: '',
  rateSet: PLAN.rates,
  ...patch,
})

/** A rounded mode's amount row: QTD, YTD or FY, a union of atoms, loaded, USD, no local amount. */
const rounded = (patch: Partial<LongRow> = {}): LongRow =>
  row({
    costCenter: '',
    account: '',
    component: 'loaded',
    amountLocal: null,
    rate: null,
    amountUsd: 90_300_000,
    ...patch,
  })

describe('columns and facts', () => {
  it('writes the 18 columns in PLAN order, and Manager the 9 with no amount, flag or rate', () => {
    expect(LONG_CSV_COLUMNS.map((c) => c.key)).toEqual([
      'period',
      'org',
      'costCenter',
      'account',
      'component',
      'currency',
      'amountLocal',
      'rate',
      'amountUsd',
      'heads',
      'fte',
      'suppressed',
      'suppressedReason',
      'version',
      'lockHash',
      'asOf',
      'proration',
      'rateSet',
    ])
    for (const mode of ['exact', 'open', 'rounded'] as const) expect(longColumns(mode)).toBe(LONG_CSV_COLUMNS)
    expect(longColumns('none')).toBe(LONG_HEADS_COLUMNS)
    expect(LONG_HEADS_COLUMNS.map((c) => c.key)).toEqual([
      'period',
      'org',
      'costCenter',
      'heads',
      'fte',
      'version',
      'lockHash',
      'asOf',
      'proration',
    ])
  })

  it('repeats the header facts in every row', () => {
    expect(facts).toEqual({
      version: 'FY27 Working',
      lockHash: 'Working, not locked',
      asOf: '2026-09-30',
      proration: 'Daily',
    })
    expect(longFactsOf({ ...META, asOf: '30 Sep 2026' }).asOf).toBe('2026-09-30')
  })
})

describe('the file', () => {
  const rows: LongRow[] = [
    row({}),
    row({
      component: 'bonus',
      account: '6100',
      amountLocal: 120_000.456,
      amountUsd: 120_000.456,
      heads: null,
      fte: null,
    }),
    row({
      org: '=Other (3)',
      costCenter: '',
      account: '',
      component: 'loaded',
      currency: 'USD',
      amountLocal: null,
      rate: null,
      amountUsd: 410_000,
      heads: 7,
      fte: 6.75,
    }),
    row({
      period: '2026-10',
      component: 'loaded',
      account: '',
      currency: 'EUR',
      amountLocal: null,
      rate: null,
      amountUsd: null,
      suppressed: 'Yes',
      suppressedReason: 'Hidden to protect anonymity (n < 5)',
    }),
    row({ currency: 'EUR', rate: 1.0823456789, amountLocal: -2_000, amountUsd: -2_164.69 }),
  ]
  const totals = controlTotals({ rows, mode: 'exact' })

  it('writes the header lines and control totals, a blank line, the columns and the rows', () => {
    const lines = longCsvText(rows, META, { mode: 'exact', totals }).replace(/^﻿/, '').split('\r\n')
    const pre = [...headerLines(META), ...controlTotalLines(totals, 'exact')]
    const unq = (l: string) => l.replace(/^"(.*)"$/, '$1').replace(/""/g, '"')
    expect(lines.slice(0, pre.length).map(unq)).toEqual(pre)
    expect(lines[pre.length]).toBe('')
    expect(lines[pre.length + 1]).toBe(LONG_CSV_COLUMNS.map((c) => c.label).join(','))
    const body = lines.slice(pre.length + 2)
    expect(body[0]).toBe(
      'FY,Silicon Engineering,1110-SJC,6000,base,USD,1000000,1,1000000,20,19.5,,,FY27 Working,"Working, not locked",2026-09-30,Daily,"Plan rates (EUR 1.08, ILS 0.27)"',
    )
    // Amounts to the cent, numbers never quoted, a component row's heads and FTE empty.
    expect(body[1]).toContain(',6100,bonus,USD,120000.46,1,120000.46,,,')
    // A text cell that would run as a formula is guarded; Other is USD with no local amount or rate.
    expect(body[2].startsWith("FY,'=Other (3),,,loaded,USD,,,410000,7,6.75,")).toBe(true)
    // A suppressed cell is empty, never 0 or words, with the flag and the reason.
    expect(body[3]).toContain(',loaded,EUR,,,,20,19.5,Yes,Hidden to protect anonymity (n < 5),')
    // Rates keep 6 places; negative amounts are numbers, not guarded text.
    expect(body[4]).toContain(',EUR,-2000,1.082346,-2164.69,')
    expect(body).toHaveLength(rows.length + 1)
    expect(body.at(-1)).toBe('')
  })

  it('puts "Contains individual pay" first in the unsuppressed load file only', () => {
    const full = longCsvText(rows, { ...META, mode: 'hr-admin' }, { mode: 'open', individualPay: true })
    expect(full.replace(/^﻿/, '').split('\r\n')[0]).toBe(INDIVIDUAL_PAY_LINE)
    expect(longCsvText(rows, META, { mode: 'exact' })).not.toContain(INDIVIDUAL_PAY_LINE)
    // The bare file for machines: the column row first.
    expect(
      longCsvText(rows, META, { mode: 'exact', preamble: false }).replace(/^﻿/, '').split('\r\n')[0],
    ).toBe(LONG_CSV_COLUMNS.map((c) => c.label).join(','))
  })

  it("writes a Manager file's heads and FTE columns only, whatever a row holds", () => {
    const manager: ExportMeta = {
      ...META,
      mode: 'manager',
      modeLine: managerExportLine('Priya Raman'),
      costLine: undefined,
      plan: { ...PLAN, rates: '', costDefinition: '', rounding: '' },
    }
    const heads: LongHeadsRow[] = [
      { ...facts, period: 'FY', org: "Priya Raman's team", costCenter: '', heads: 9, fte: 8.5 },
    ]
    // A row that wrongly carries amounts still writes none.
    const leaky = [{ ...heads[0], amountUsd: 1_200_000, rateSet: PLAN.rates } as LongHeadsRow]
    const text = longCsvText(leaky, manager, {
      mode: 'none',
      totals: controlTotals({ rows: heads, mode: 'none' }),
    })
    const lines = text.replace(/^﻿/, '').split('\r\n')
    expect(lines).toContain(LONG_HEADS_COLUMNS.map((c) => c.label).join(','))
    expect(text).not.toContain('1200000')
    expect(text).not.toContain('EUR')
    expect(lines.flatMap((l) => amountsIn(l))).toEqual([])
    expect(lines).toContain(
      'FY,Priya Raman\'s team,,9,8.5,FY27 Working,"Working, not locked",2026-09-30,Daily',
    )
  })

  it('never writes a number with exactly three decimals, which reads as thousands grouped by dots', () => {
    expect(longNumber(43.871, 'fte')).toBe('43.8710')
    expect(longNumber(43.87123, 'fte')).toBe('43.8712')
    expect(longNumber(8.5, 'heads')).toBe('8.5')
    expect(longNumber(588.5104198, 'heads')).toBe('588.5104')
    expect(longNumber(1.082, 'rate')).toBe('1.0820')
    expect(longNumber(120_000.456, 'amountUsd')).toBe('120000.46')
    expect(longNumber(-0.0001, 'amountUsd')).toBe('0')
    // A Manager file of such counts reads as counts, not amounts.
    const rows: LongHeadsRow[] = [17.737, 26.411, 43.871].map((fte, i) => ({
      ...facts,
      period: 'FY',
      org: `Team ${i}`,
      costCenter: '',
      heads: fte,
      fte,
    }))
    const text = longCsvText(rows, { ...META, mode: 'manager', plan: undefined }, { mode: 'none' })
    expect(text.split('\r\n').flatMap((l) => amountsIn(l))).toEqual([])
    expect(text).toContain(',17.7370,17.7370,')
  })

  it('downloads as headcount-planner-<view>-long-<as-of>.csv', () => {
    saved.length = 0
    downloadLongCsv(rows, META, { mode: 'exact' })
    expect(saved[0].name).toBe('headcount-planner-finance-long-2026-09-30.csv')
    downloadLongCsv(rows, META, {
      mode: 'exact',
      fileName: 'headcount-planner-finance-load-file-fy27-working-2026-09-30',
    })
    expect(saved[1].name).toBe('headcount-planner-finance-load-file-fy27-working-2026-09-30.csv')
  })
})

describe('longRowProblems', () => {
  const union = new Set(['Silicon Engineering', 'Architecture (Rahul Kamaraj)'])
  const roundedRules = { mode: 'rounded' as const, isUnion: (org: string) => union.has(org) }

  it('finds nothing in rows that keep the rules', () => {
    expect(
      longRowProblems([row({}), row({ component: 'loaded', account: '' })], {
        mode: 'exact',
        isUnion: () => false,
      }),
    ).toEqual([])
    const ok = [
      rounded({ period: 'QTD' }),
      rounded({ period: 'YTD' }),
      rounded({ period: 'FY', org: 'Architecture (Rahul Kamaraj)' }),
      // A month row carries heads and FTE only, flagged with the mode's reason.
      rounded({
        period: '2026-10',
        amountUsd: null,
        suppressed: 'Yes',
        suppressedReason: ROUNDED_HEADS_REASON,
      }),
      rounded({
        period: 'FY',
        org: 'Physical Design team',
        amountUsd: null,
        suppressed: 'Yes',
        suppressedReason: ROUNDED_HEADS_REASON,
      }),
    ]
    expect(longRowProblems(ok, roundedRules)).toEqual([])
    const manager: LongHeadsRow = { ...facts, period: 'FY', org: 'Team', costCenter: '', heads: 3, fte: 3 }
    expect(longRowProblems([manager], { mode: 'none', isUnion: () => true })).toEqual([])
  })

  it('catches each break of the rounded modes rules', () => {
    const cases: [Partial<LongRow>, RegExp][] = [
      [{ period: '2026-10' }, /month period/],
      [{ component: 'bonus' }, /bonus component/],
      [{ costCenter: '1110-SJC' }, /cost center/],
      [{ account: '6000' }, /account/],
      [{ currency: 'EUR' }, /in EUR/],
      [{ amountLocal: 90_300_000 }, /local currency/],
      [{ rate: 1 }, /with a rate/],
      [{ org: 'Physical Design team' }, /not a whole union of atoms/],
    ]
    for (const [patch, what] of cases) {
      const found = longRowProblems([rounded(patch)], roundedRules)
      expect(found.length, String(what)).toBeGreaterThan(0)
      expect(found.join(' '), String(what)).toMatch(what)
    }
    // The same breaks are fine in exact modes.
    expect(
      longRowProblems([row({ period: '2026-10', costCenter: '1110-SJC', currency: 'EUR' })], {
        mode: 'exact',
        isUnion: () => false,
      }),
    ).toEqual([])
  })

  it('catches an amount key in a Manager row, an amount on a suppressed row, and a non-number amount', () => {
    const manager = {
      ...facts,
      period: 'FY',
      org: 'Team',
      costCenter: '',
      heads: 3,
      fte: 3,
      amountUsd: 1,
    } as LongHeadsRow
    expect(longRowProblems([manager], { mode: 'none', isUnion: () => true }).join(' ')).toMatch(
      /amountUsd column/,
    )
    const withRates = {
      ...facts,
      period: 'FY',
      org: 'Team',
      costCenter: '',
      heads: 3,
      fte: 3,
      rateSet: 'x',
    } as LongHeadsRow
    expect(longRowProblems([withRates], { mode: 'none', isUnion: () => true }).join(' ')).toMatch(/rate set/)
    const rules = { mode: 'exact' as const, isUnion: () => true }
    expect(longRowProblems([row({ suppressed: 'Yes', suppressedReason: 'x' })], rules).join(' ')).toMatch(
      /suppressed row carries an amount/,
    )
    expect(
      longRowProblems(
        [row({ suppressed: 'Yes', amountLocal: null, rate: null, amountUsd: null })],
        rules,
      ).join(' '),
    ).toMatch(/gives no reason/)
    expect(longRowProblems([row({ amountUsd: Number.NaN })], rules).join(' ')).toMatch(
      /amountUsd is not a number/,
    )
    expect(
      longRowProblems([row({ amountUsd: 'under $0.1M' as unknown as number })], rules).join(' '),
    ).toMatch(/amountUsd is not a number/)
    expect(longRowProblems([row({ currency: '' })], rules).join(' ')).toMatch(/no currency/)
    expect(
      longRowProblems([{ ...facts, period: 'FY', org: 'x', costCenter: '', heads: 1, fte: 1 }], rules).join(
        ' ',
      ),
    ).toMatch(/no amount columns/)
  })
})
