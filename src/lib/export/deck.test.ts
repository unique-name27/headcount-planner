/**
 * The deck and the file names (docs/PLAN.md 14.1 items 1 and 7): `deckOutline` gives the slides in
 * order, "About these numbers" second (left out for a meta with no plan facts and no mode lines),
 * then each tab's divider and its figures, and `exportViewDeck` writes exactly those slides; the
 * kicker is "HEADCOUNT PLANNER · PLANNING", the deck's author and the workbook's creator "Headcount
 * Planner"; files are named headcount-planner-<view>-<name>-<as-of>; the About slide states the
 * control totals it is given (item 4) and "Contains individual pay" when a figure shows pay.
 */
import { describe, expect, it, vi } from 'vitest'
import { APP_NAME } from '@/app/brand'
import type { ExportMeta, PlanHeader, RegisteredFigure } from '@/charts/types'
import { controlTotalLines } from './controlTotals'
import { decks, resetDecks, slideText } from './deck.testkit'
import { ABOUT_SLIDE_TITLE, INDIVIDUAL_PAY_LINE } from './exportHeader'
import { fileStem } from './names'
import { WHY_KEY } from './suppressedFlag'
import {
  buildViewWorkbook,
  DECK_KICKER,
  deckOutline,
  exportViewDeck,
  exportViewWorkbook,
  type FigureGroup,
} from './view'
import { buildWorkbook, downloadXlsx } from './xlsx'

const saved = vi.hoisted(() => [] as { name: string; blob: Blob }[])
vi.mock('./download', async (orig) => ({
  ...(await orig<typeof import('./download')>()),
  downloadBlob: (blob: Blob, name: string) => {
    saved.push({ blob, name })
  },
}))
vi.mock('pptxgenjs', async () => ({ default: (await import('./deck.testkit')).FakePptx }))

const PLAN: PlanHeader = {
  version: 'FY27 Working',
  versionState: 'working',
  lockHash: null,
  comparison: 'vs FY27 Budget',
  proration: 'daily',
  rates: 'Plan rates (EUR 1.08, ILS 0.27)',
  costDefinition: 'Loaded cost: base + bonus + burden + benefits + one-time, USD',
  filters: 'Whole company; period: FY27',
  rounding: 'Rounded down to $0.1M per team',
}
const META: ExportMeta = {
  view: 'Forecast',
  viewKey: 'forecast',
  tab: 'All tabs',
  scope: 'Silicon Engineering',
  window: 'FY27',
  asOf: '2026-09-30',
  isSample: true,
  company: 'Northgate Semiconductor',
  modeLine: 'Made in HRBP mode for Silicon Engineering.',
  costLine: 'Cost amounts are rounded down to $0.1M per team, and groups under 5 are left out.',
  mode: 'hrbp',
  plan: PLAN,
}

const fig = (id: string, title: string): RegisteredFigure => ({
  id,
  title,
  columns: [
    { key: 'org', label: 'Org' },
    { key: 'cost', label: 'Loaded cost (USD)', format: 'moneyM', cost: true },
  ],
  rows: [
    { org: 'Silicon Engineering', cost: 91_000_000 },
    { org: 'Physical Design team', cost: null, [WHY_KEY]: 'Cost shows for whole departments and teams.' },
  ],
  getSvg: () => null,
  order: 0,
})
const groups: FigureGroup[] = [
  {
    key: 'overview',
    label: 'Overview',
    figures: [fig('overview:a', 'Year-end heads'), fig('overview:b', 'Full-year cost')],
  },
  { key: 'variance', label: 'Variance', figures: [fig('variance:a', 'Variance')] },
]
const ROUNDED = { showPay: false, showCost: true, captured: new Map() }

describe('the deck', () => {
  it('outlines the title slide, About these numbers, then each tab and its figures', () => {
    expect(deckOutline(groups, META)).toEqual([
      'Forecast',
      ABOUT_SLIDE_TITLE,
      'Overview',
      'Year-end heads',
      'Full-year cost',
      'Variance',
      'Variance',
    ])
    expect(deckOutline([fig('a', 'Bridge')], META)).toEqual(['Forecast', ABOUT_SLIDE_TITLE, 'Bridge'])
    // No plan facts and no mode lines (HR admin, a view that reads no plan data): no About slide.
    const bare = { ...META, plan: undefined, modeLine: undefined, costLine: undefined }
    expect(deckOutline([fig('a', 'Bridge')], bare)).toEqual(['Forecast', 'Bridge'])
  })

  it('writes exactly the outlined slides, with the kicker and the author', async () => {
    for (const meta of [META, { ...META, plan: undefined, modeLine: undefined, costLine: undefined }]) {
      resetDecks()
      saved.length = 0
      await exportViewDeck(groups, meta, ROUNDED)
      const deck = decks[0]
      const outline = deckOutline(groups, meta)
      expect(deck.slides).toHaveLength(outline.length)
      outline.forEach((title, i) => {
        expect(
          deck.slides[i].texts.some((t) => t === title),
          `${i} ${title}`,
        ).toBe(true)
      })
      expect(deck.author).toBe(APP_NAME)
      expect(APP_NAME).toBe('Headcount Planner')
      expect(deck.slides[0].texts).toContain(DECK_KICKER)
      expect(saved[0].name).toBe('headcount-planner-forecast-all-tabs-2026-09-30.pptx')
    }
    expect(DECK_KICKER.replace(/\s+/g, ' ')).toBe('HEADCOUNT PLANNER · PLANNING')
  })

  it("states Finance's control totals by component on the About slide and the Summary (M4 review SB-1)", async () => {
    const totals = [
      {
        period: 'FY',
        heads: 1593,
        fte: 1482.17,
        usdByComponent: { loaded: 1 },
        loadedUsd: 1,
        suppressedCells: 0,
      },
    ]
    const componentLines = [
      'Control totals 2026-04, Operations, by component: base 1.00 USD, bonus 0.00 USD, loaded 1.00 USD',
    ]
    const controlTotals = { mode: 'exact' as const, totals, componentLines }
    resetDecks()
    await exportViewDeck(groups, META, { ...ROUNDED, controlTotals })
    const about = slideText(decks[0].slides[1])
    expect(about).toContain(controlTotalLines(totals, 'exact')[0])
    expect(about).toContain(componentLines[0])
    const wb = await buildViewWorkbook(groups, META, { ...ROUNDED, images: false, controlTotals })
    const facts = new Map<string, string>()
    wb.getWorksheet('Summary')!.eachRow((row) => {
      facts.set(String(row.getCell(1).value ?? ''), String(row.getCell(2).value ?? ''))
    })
    expect(facts.get('Control totals 2026-04, Operations, by component')).toBe(
      'base 1.00 USD, bonus 0.00 USD, loaded 1.00 USD',
    )
  })

  it('states the control totals it is given on the About slide, and individual pay when shown', async () => {
    resetDecks()
    const totals = [
      {
        period: 'FY',
        heads: 588.5,
        fte: 559.45,
        usdByComponent: null,
        loadedUsd: 91_000_000,
        suppressedCells: 12,
      },
    ]
    await exportViewDeck(groups, META, { ...ROUNDED, controlTotals: { mode: 'rounded', totals } })
    const about = slideText(decks[0].slides[1])
    for (const line of controlTotalLines(totals, 'rounded')) expect(about).toContain(line)
    expect(about).not.toContain(INDIVIDUAL_PAY_LINE)

    resetDecks()
    const pay = fig('pay', 'Offers')
    pay.columns = [...pay.columns, { key: 'base', label: 'Offer base', format: 'moneyFull', pay: true }]
    await exportViewDeck(
      [pay],
      { ...META, mode: 'hr-admin', modeLine: undefined, costLine: undefined },
      {
        showPay: true,
        showCost: true,
        captured: new Map(),
      },
    )
    expect(slideText(decks[0].slides[1])).toContain(INDIVIDUAL_PAY_LINE)
  })

  it('writes slide tables with the Suppressed flag', async () => {
    resetDecks()
    await exportViewDeck([fig('a', 'Variance')], META, ROUNDED)
    const table = decks[0].slides[2].tables[0]
    expect(table[0]).toEqual(['Org', 'Loaded cost (USD)', 'Suppressed', 'Why'])
    // A row that is not suppressed: blank Suppressed and Why, never "—" (M4 review EX-4).
    expect(table[1].slice(-2)).toEqual(['', ''])
    // The hidden amount is an empty cell, beside Yes and the reason.
    expect(table[2]).toEqual([
      'Physical Design team',
      '',
      'Yes',
      'Cost shows for whole departments and teams.',
    ])
  })
})

describe('file names and creators', () => {
  it('names files headcount-planner-<view>-<name>-<as-of>', async () => {
    expect(fileStem(META, 'long')).toBe('headcount-planner-forecast-long-2026-09-30')
    expect(fileStem({ view: 'Plan', viewKey: 'plan', asOf: '2026-09-30' }, 'plan-cost-by-unit')).toBe(
      'headcount-planner-plan-cost-by-unit-2026-09-30',
    )
    saved.length = 0
    await exportViewWorkbook(groups, META, { ...ROUNDED, images: false })
    expect(saved[0].name).toBe('headcount-planner-forecast-all-tabs-2026-09-30.xlsx')
    await downloadXlsx([{ name: 'Cost', columns: fig('a', 'a').columns, rows: [] }], META, {
      showPay: false,
      showCost: true,
    })
    expect(saved[1].name).toBe('headcount-planner-forecast-cost-2026-09-30.xlsx')
  })

  it('makes every workbook by Headcount Planner', async () => {
    const view = await buildViewWorkbook(groups, META, { ...ROUNDED, images: false })
    const book = await buildWorkbook([{ name: 'Cost', columns: fig('a', 'a').columns, rows: [] }], META, {
      showPay: false,
    })
    expect(view.creator).toBe(APP_NAME)
    expect(book.creator).toBe(APP_NAME)
  })

  it('states the control totals on the Summary when given them', async () => {
    const totals = [
      {
        period: 'FY',
        heads: 588.5,
        fte: 559.45,
        usdByComponent: null,
        loadedUsd: 91_000_000,
        suppressedCells: 12,
      },
      { period: '2026-10', heads: 590, fte: 560, usdByComponent: null, loadedUsd: null, suppressedCells: 40 },
    ]
    const wb = await buildViewWorkbook(groups, META, {
      ...ROUNDED,
      images: false,
      controlTotals: { mode: 'rounded', totals },
    })
    const facts = new Map<string, string>()
    wb.getWorksheet('Summary')!.eachRow((row) => {
      facts.set(String(row.getCell(1).value ?? ''), String(row.getCell(2).value ?? ''))
    })
    expect(facts.get('Control totals FY')).toBe(
      '588.5 heads, 559.45 FTE, loaded 91,000,000.00 USD, 12 suppressed cells',
    )
    expect(facts.get('Control totals 2026-10')).toBe('590 heads, 560 FTE, 40 suppressed cells')
    // Without them the Summary states none.
    const plain = await buildViewWorkbook(groups, META, { ...ROUNDED, images: false })
    const keys: string[] = []
    plain.getWorksheet('Summary')!.eachRow((row) => {
      keys.push(String(row.getCell(1).value ?? ''))
    })
    expect(keys.some((k) => k.startsWith('Control totals'))).toBe(false)
  })
})
