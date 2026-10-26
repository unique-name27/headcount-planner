/**
 * The header on every output (docs/PLAN.md 14.1 item 1): one source (`headerFacts`), in
 * `HEADER_LABELS` order, per mode; Manager's header holds no rate, currency code or rounding amount
 * (7.6); "Contains individual pay" first only when asked (item 6); and the workbook Summary, each
 * sheet's title block, the CSV preamble, the deck's second slide and image footers carry it.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { BANNED_HASH_WORDS, BANNED_MODE_WORDS, managerExportLine } from '@/access/copy'
import { MODES } from '@/access/modes'
import { buildExportMeta, FORECAST_RATES, planHeaderOf } from '@/app/exportMeta'
import type { Column, ExportMeta, PlanHeader, RegisteredFigure } from '@/charts/types'
import type { AnalyticsContext } from '@/data/context'
import { SAMPLE_COMPANY } from '@/data/sample'
import type { Mode } from '@/data/schema'
import { amountsIn } from '@/testkit/leaks'
import { sampleCtx } from '@/testkit/sample'
import { toTsv } from './clipboard'
import { moneyOpts } from './columns'
import { csvPreamble, downloadCsv } from './csv'
import { decks, resetDecks, slideText } from './deck.testkit'
import {
  ABOUT_SLIDE_TITLE,
  compactHeaderLine,
  factLine,
  HEADER_LABELS,
  headerFacts,
  headerLines,
  INCL_SBC,
  INDIVIDUAL_PAY_LINE,
  imageHeaderLine,
  lockLine,
  MANAGER_FACTS,
  madeWithPay,
  RETIRED_NOT_LOCKED,
  WORKING_NOT_LOCKED,
} from './exportHeader'
import { hrAdminExportLine, modeMeta } from './modeMeta'
import { imageFooter, modeLines, withoutDataContext } from './names'
import { buildViewWorkbook, deckOutline, exportViewDeck } from './view'
import { buildWorkbook } from './xlsx'

const saved = vi.hoisted(() => [] as { name: string; blob: Blob }[])
vi.mock('./download', async (orig) => ({
  ...(await orig<typeof import('./download')>()),
  downloadBlob: (blob: Blob, name: string) => {
    saved.push({ blob, name })
  },
}))
vi.mock('pptxgenjs', async () => ({ default: (await import('./deck.testkit')).FakePptx }))

const PLAN: PlanHeader = {
  version: 'FY27 Budget',
  versionState: 'locked',
  lockHash: `sha256-${'ab'.repeat(32)}`,
  comparison: 'vs FY27 Working',
  proration: 'half-month',
  rates: 'Plan rates (EUR 1.08, ILS 0.27)',
  costDefinition: 'Loaded cost: base + bonus + burden + benefits + one-time, USD',
  filters: 'Business unit: Silicon Engineering; period: FY27',
  rounding: 'Exact for groups of 5 or more',
}

const META: ExportMeta = {
  view: 'Plan',
  viewKey: 'plan',
  tab: 'Overview',
  scope: 'Silicon Engineering',
  window: 'FY27',
  asOf: '2026-09-30',
  isSample: true,
  company: 'Northgate Semiconductor',
  modeLine: 'Made in Finance mode.',
  costLine: 'Cost amounts cover groups of 5 or more costed people. Individual pay is left out.',
  mode: 'finance',
  plan: PLAN,
}

/** A figure export's meta in a mode, as the shell builds it (`useExportMeta`, the view menu). */
function metaIn(ctx: AnalyticsContext, viewKey = 'plan', viewLabel = 'Plan'): ExportMeta {
  return buildExportMeta({
    viewLabel,
    viewKey,
    tabLabel: 'Overview',
    scopeLabel: ctx.scopeLabel,
    window: ctx.window,
    asOf: ctx.asOf,
    isSample: ctx.isSample,
    sampleCompany: SAMPLE_COMPANY,
    standard: ctx.standard,
    ...modeMeta(ctx.access),
    mode: ctx.access.mode,
    plan: planHeaderOf(ctx, viewKey),
  })
}

const ctxs = new Map<string, AnalyticsContext>()
const ctxOf = (mode: Mode, showPay = false): AnalyticsContext => {
  const key = `${mode}:${showPay}`
  let c = ctxs.get(key)
  if (!c) {
    c = sampleCtx(mode, { showPay })
    ctxs.set(key, c)
  }
  return c
}

describe('the header facts', () => {
  it('states every fact in header order, with its label', () => {
    const facts = headerFacts(META)
    expect(facts.map((f) => f.label)).toEqual([...HEADER_LABELS])
    expect(facts.map(factLine)).toEqual([
      'Version: FY27 Budget',
      `Lock: sha256-${'ab'.repeat(32)}`,
      'Comparison: vs FY27 Working',
      'As of: 30 Sep 2026',
      'Proration: Half month',
      'Rates: Plan rates (EUR 1.08, ILS 0.27)',
      'Cost: Loaded cost: base + bonus + burden + benefits + one-time, USD',
      'Filters: Business unit: Silicon Engineering; period: FY27',
      'Rounding: Exact for groups of 5 or more',
    ])
    // The lines: the facts, then the mode lines.
    expect(headerLines(META)).toEqual([...facts.map(factLine), ...modeLines(META)])
  })

  it('words the lock: the hash when locked, else Working or Retired, not locked', () => {
    expect(lockLine({ versionState: 'locked', lockHash: 'sha256-00' })).toBe('sha256-00')
    expect(lockLine({ versionState: 'working', lockHash: null })).toBe(WORKING_NOT_LOCKED)
    expect(lockLine({ versionState: 'retired', lockHash: null })).toBe(RETIRED_NOT_LOCKED)
    expect(WORKING_NOT_LOCKED).toBe('Working, not locked')
  })

  it('leaves out a fact with no value, and states nothing for a meta with no plan facts', () => {
    const facts = headerFacts({ ...META, asOf: '', plan: { ...PLAN, comparison: '', rates: '' } })
    expect(facts.map((f) => f.label)).toEqual(['Version', 'Lock', 'Proration', 'Cost', 'Filters', 'Rounding'])
    const { plan: _plan, ...bare } = META
    expect(headerFacts(bare)).toEqual([])
    expect(headerLines(bare)).toEqual(modeLines(bare))
    expect(compactHeaderLine(bare)).toBeNull()
    expect(imageHeaderLine(bare)).toBeNull()
  })

  it('says "Contains individual pay" first, and only when asked', () => {
    const lines = headerLines(META, { individualPay: true })
    expect(lines[0]).toBe(INDIVIDUAL_PAY_LINE)
    expect(lines[0]).toBe('Contains individual pay')
    expect(lines.slice(1)).toEqual(headerLines(META))
    expect(headerLines(META).join('\n')).not.toContain(INDIVIDUAL_PAY_LINE)
  })

  it('adds "incl. SBC" to the cost definition where the output includes equity', () => {
    const cost = headerFacts(META, { inclSbc: true }).find((f) => f.label === 'Cost')
    expect(cost?.value).toBe(`${PLAN.costDefinition}, ${INCL_SBC}`)
    expect(headerFacts(META).find((f) => f.label === 'Cost')?.value).toBe(PLAN.costDefinition)
  })

  it('gives a sheet one compact line and an image its version and as-of date', () => {
    expect(compactHeaderLine(META)).toBe(
      `FY27 Budget · sha256-${'ab'.repeat(32)} · vs FY27 Working · Exact for groups of 5 or more`,
    )
    expect(imageHeaderLine(META)).toBe('FY27 Budget · As of 30 Sep 2026')
  })
})

describe('the header in every mode (the sample)', () => {
  beforeAll(() => {
    for (const mode of MODES) ctxOf(mode)
    ctxOf('hr-admin', true)
  }, 120_000)

  it('states the plan facts each mode may read, with its rounding', () => {
    const rounding: Record<Mode, string> = {
      // Manager: amount-free words (7.6, M4 review SB-4).
      manager: MANAGER_FACTS.Rounding,
      hrbp: 'Rounded down to $0.1M per team',
      leader: 'Rounded down to $0.1M per team',
      finance: 'Exact for groups of 5 or more',
      'hr-admin': 'Exact for groups of 5 or more',
    }
    for (const mode of MODES) {
      const meta = metaIn(ctxOf(mode))
      const labels = headerFacts(meta).map((f) => f.label)
      // In header order, every mode.
      expect(labels, mode).toEqual(HEADER_LABELS.filter((l) => labels.includes(l)))
      for (const l of ['Version', 'Lock', 'Comparison', 'As of', 'Proration', 'Filters'] as const)
        expect(labels, `${mode} ${l}`).toContain(l)
      expect(headerFacts(meta).find((f) => f.label === 'Rounding')?.value ?? '', mode).toBe(rounding[mode])
      // Every mode states all nine facts (the spec's header list), Manager's in amount-free words.
      expect(labels, mode).toEqual([...HEADER_LABELS])
      if (mode !== 'manager') expect(meta.plan?.rates, mode).toMatch(/^Plan rates/)
    }
    expect(headerFacts(metaIn(ctxOf('hr-admin', true))).find((f) => f.label === 'Rounding')?.value).toBe(
      'None: HR admin with pay amounts shown',
    )
  })

  it("holds no rate, currency code or rounding amount in Manager mode's header", () => {
    const ctx = ctxOf('manager')
    const plan = planHeaderOf(ctx)
    // The shell's plan facts hold no amount or currency code (empty, or MANAGER_FACTS' words).
    for (const v of [plan.rates, plan.costDefinition, plan.rounding]) {
      expect(amountsIn(v), v).toEqual([])
      expect(v, v).not.toMatch(/USD|Plan rates/)
    }
    const meta = metaIn(ctx)
    const lines = [...headerLines(meta), compactHeaderLine(meta) ?? '', imageHeaderLine(meta) ?? '']
    expect(lines.flatMap((l) => amountsIn(l))).toEqual([])
    // The spec's header names rates, cost definition and rounding: Manager states them in words
    // that hold no amount or currency code (M4 review SB-4).
    const said = (m: ExportMeta) => Object.fromEntries(headerFacts(m).map((f) => [f.label, f.value]))
    expect(said(meta)).toMatchObject(MANAGER_FACTS)
    expect(MANAGER_FACTS).toEqual({
      Rates: 'Not used: no amounts in Manager mode',
      Cost: 'Heads and FTE only',
      Rounding: 'No amounts',
    })
    // Whatever a Manager meta is handed, its header states no rates, cost or rounding amount: by the
    // mode, or by the Manager mode line when the mode is not given.
    const handed = { ...META, mode: 'manager' as const, modeLine: managerExportLine('Priya Raman') }
    for (const m of [handed, { ...handed, mode: undefined }]) {
      expect(headerFacts(m).map((f) => f.label)).toEqual([...HEADER_LABELS])
      expect(said(m)).toMatchObject(MANAGER_FACTS)
      expect(headerLines(m).flatMap((l) => amountsIn(l))).toEqual([])
      expect(headerLines(m).join(' ')).not.toContain('EUR')
    }
  })

  it("states the forecast's rate set on the forecast's files", () => {
    expect(planHeaderOf(ctxOf('finance'), 'forecast').rates).toBe(FORECAST_RATES)
    expect(FORECAST_RATES).toBe('Actual for closed months, forecast for open')
    expect(planHeaderOf(ctxOf('finance'), 'plan').rates).toMatch(/^Plan rates/)
    // Manager: never a rate set, on the forecast's files either.
    const manager = metaIn(ctxOf('manager'), 'forecast', 'Forecast')
    expect(headerFacts(manager).find((f) => f.label === 'Rates')?.value).toBe(MANAGER_FACTS.Rates)
    expect(planHeaderOf(ctxOf('manager'), 'forecast').rates).not.toBe(FORECAST_RATES)
  })

  it('keeps the copy rules: no banned word, no em dash between words, no "!"', () => {
    const texts = [
      WORKING_NOT_LOCKED,
      RETIRED_NOT_LOCKED,
      INDIVIDUAL_PAY_LINE,
      ABOUT_SLIDE_TITLE,
      FORECAST_RATES,
      ...HEADER_LABELS,
      ...MODES.flatMap((m) => headerLines(metaIn(ctxOf(m)), { individualPay: true })),
      ...headerLines(metaIn(ctxOf('hr-admin', true)), { individualPay: true }),
      ...Object.values(MANAGER_FACTS),
    ]
    for (const t of texts) {
      const lower = t.toLowerCase()
      for (const w of [...BANNED_MODE_WORDS, ...BANNED_HASH_WORDS]) expect(lower, t).not.toContain(w)
      expect(t, t).not.toMatch(/\w\s?—\s?\w/)
      expect(t, t).not.toContain('!')
    }
    // Sentence case: the labels and the slide title start upper case and go on lower case.
    for (const t of [...HEADER_LABELS, ABOUT_SLIDE_TITLE, INDIVIDUAL_PAY_LINE, WORKING_NOT_LOCKED])
      expect(t.slice(1), t).toBe(t.slice(1).replace(/\b[A-Z][a-z]/g, (m) => m.toLowerCase()))
  })
})

/* ───────────── every output carries it ───────────── */

const COLUMNS: Column[] = [
  { key: 'unit', label: 'Business unit' },
  { key: 'heads', label: 'Heads', format: 'int' },
  { key: 'loaded', label: 'Loaded cost (USD)', format: 'money', cost: true },
]
const ROWS = [
  { unit: 'Silicon Engineering', heads: 604, loaded: 93_100_000 },
  { unit: 'Other (2)', heads: 9, loaded: null, reason: 'Hidden to protect anonymity (n < 5)' },
]
const FINANCE = { showPay: false, showCost: true }

const figure = (id: string, title: string): RegisteredFigure => ({
  id,
  title,
  columns: COLUMNS,
  rows: ROWS,
  getSvg: () => null,
  order: 0,
})

/** The values of column A of a sheet, top down, up to the header row. */
function columnA(ws: { getCell: (r: number, c: number) => { value: unknown } }, rows = 30): string[] {
  const out: string[] = []
  for (let r = 1; r <= rows; r++) out.push(String(ws.getCell(r, 1).value ?? ''))
  return out
}

describe('the header on every output', () => {
  it('writes every header line in the CSV preamble', async () => {
    saved.length = 0
    downloadCsv({ name: 'Cost by unit', columns: COLUMNS, rows: ROWS }, META, FINANCE)
    const lines = (await saved[0].blob.text()).replace(/^﻿/, '').split('\r\n')
    // One quoted field per preamble line.
    const head = lines.slice(0, lines.indexOf('')).map((l) => l.replace(/^"(.*)"$/, '$1').replace(/""/g, '"'))
    for (const line of headerLines(META)) expect(head).toContain(line)
    expect(head).not.toContain(INDIVIDUAL_PAY_LINE)
    // HR admin with the switch: a CSV that shows a pay column says so first.
    saved.length = 0
    downloadCsv(
      {
        name: 'Pay',
        columns: [...COLUMNS, { key: 'base', label: 'Base salary', format: 'moneyFull', pay: true }],
        rows: [{ unit: 'x', heads: 1, loaded: 1, base: 150_000 }],
      },
      { ...META, mode: 'hr-admin', modeLine: undefined, costLine: undefined },
      { showPay: true, showCost: true },
    )
    expect((await saved[0].blob.text()).replace(/^﻿/, '').split('\r\n')[0]).toBe(INDIVIDUAL_PAY_LINE)
  })

  it('writes every fact in a figure workbook sheet, and the compact line on a view workbook sheet', async () => {
    const wb = await buildWorkbook([{ name: 'Cost by unit', columns: COLUMNS, rows: ROWS }], META, FINANCE)
    const block = columnA(wb.getWorksheet('Cost by unit')!)
    for (const line of headerLines(META)) expect(block).toContain(line)

    const view = await buildViewWorkbook([figure('cost', 'Cost by unit')], META, {
      ...FINANCE,
      images: false,
    })
    const sheet = columnA(view.getWorksheet('Cost by unit')!)
    expect(sheet).toContain(compactHeaderLine(META))
    // The Summary: every fact under its label.
    const facts = new Map<string, string>()
    view.getWorksheet('Summary')!.eachRow((row) => {
      facts.set(String(row.getCell(1).value ?? ''), String(row.getCell(2).value ?? ''))
    })
    for (const f of headerFacts(META)) expect(facts.get(f.label), f.label).toBe(f.value)
    expect(facts.get('Mode')).toBe(META.modeLine)
    // The mode's cost line under its own name (M4 review CP-10).
    expect(facts.get('Cost amounts')).toBe(META.costLine)
    expect(facts.has('Pay')).toBe(false)
  })

  it('puts "About these numbers" second in the deck, with every fact and the mode lines', async () => {
    resetDecks()
    saved.length = 0
    await exportViewDeck([figure('cost', 'Cost by unit')], META, { ...FINANCE, captured: new Map() })
    const deck = decks[0]
    expect(deckOutline([figure('cost', 'Cost by unit')], META)).toEqual([
      'Plan',
      ABOUT_SLIDE_TITLE,
      'Cost by unit',
    ])
    expect(deck.slides).toHaveLength(3)
    const about = slideText(deck.slides[1])
    expect(about).toContain(ABOUT_SLIDE_TITLE)
    for (const f of headerFacts(META)) expect(about).toContain(`${f.label} | ${f.value}`)
    for (const line of modeLines(META)) expect(about).toContain(line)
    expect(about).not.toContain(INDIVIDUAL_PAY_LINE)
  })

  it('states the as-of date once in a CSV preamble and a figure workbook sheet (M4 review CP-10)', async () => {
    const times = (lines: readonly string[]) => lines.join('\n').split('30 Sep 2026').length - 1
    const table = { name: 'Cost by unit', columns: COLUMNS, rows: ROWS }
    const pre = csvPreamble(table, META, FINANCE)
    expect(times(pre)).toBe(1)
    expect(pre).toContain('As of: 30 Sep 2026')
    expect(pre).toContain('Silicon Engineering · FY27')
    // With no plan facts, the context line keeps it.
    const { plan: _plan, ...bare } = META
    const plain = csvPreamble(table, bare, FINANCE)
    expect(times(plain)).toBe(1)
    expect(plain).toContain('Silicon Engineering · FY27 · As of 30 Sep 2026')
    // A figure workbook's sheet states every fact, the as-of date among them, once.
    const wb = await buildWorkbook([table], META, FINANCE)
    expect(times(columnA(wb.getWorksheet('Cost by unit')!))).toBe(1)
    // A view workbook's sheet has the compact line (no as-of), so its context line keeps the date.
    const view = await buildViewWorkbook([figure('cost', 'Cost by unit')], META, {
      ...FINANCE,
      images: false,
    })
    expect(times(columnA(view.getWorksheet('Cost by unit')!))).toBe(1)
  })

  it('puts the version and the as-of date in image footers', () => {
    const footer = imageFooter(META)
    expect(footer).toContain(imageHeaderLine(META))
    expect(footer).toContain('FY27 Budget · As of 30 Sep 2026')
  })
})

/* ───────────── every output names its mode (lead decision D-MODELINE) ───────────── */

describe('every output names its mode, HR admin too (M4 review CP-1, EX-8, CP-10)', () => {
  it('says "Made in HR admin mode.", with pay amounts shown while the switch is on', () => {
    expect(hrAdminExportLine(false)).toBe('Made in HR admin mode.')
    expect(hrAdminExportLine(true)).toBe('Made in HR admin mode with pay amounts shown.')
    expect(headerLines(metaIn(ctxOf('hr-admin')))).toContain('Made in HR admin mode.')
    const on = headerLines(metaIn(ctxOf('hr-admin', true)))
    expect(on).toContain('Made in HR admin mode with pay amounts shown.')
    expect(on).not.toContain('Made in HR admin mode.')
    // Every mode's header ends with its mode line.
    for (const mode of MODES) {
      const lines = modeLines(metaIn(ctxOf(mode)))
      expect(lines[0] ?? '', mode).toMatch(/^Made in .+ mode\b/)
    }
  })

  it('names the whole company for a leader with no scope of their own', async () => {
    const { personaCtx } = await import('@/testkit/sample')
    const cfo = personaCtx('leader-cfo')
    expect(cfo.access.scope).toBeNull()
    expect(modeMeta(cfo.access).modeLine).toBe('Made in Leader mode for the whole company.')
  })

  it("puts HR admin's mode line on the Summary, the deck and image footers", async () => {
    const meta = metaIn(ctxOf('hr-admin'))
    const money = moneyOpts(ctxOf('hr-admin'))
    const wb = await buildViewWorkbook([figure('cost', 'Cost by unit')], meta, { ...money, images: false })
    const facts = new Map<string, string>()
    wb.getWorksheet('Summary')!.eachRow((row) => {
      facts.set(String(row.getCell(1).value ?? ''), String(row.getCell(2).value ?? ''))
    })
    expect(facts.get('Mode')).toBe('Made in HR admin mode.')
    resetDecks()
    await exportViewDeck([figure('cost', 'Cost by unit')], meta, { ...money, captured: new Map() })
    expect(slideText(decks[0].slides[1])).toContain('Made in HR admin mode.')
    expect(imageFooter(meta)).toContain('Made in HR admin mode ·')
  })
})

/* ───────────── made with Show pay amounts on (lead decision D-PAYFILES) ───────────── */

describe('"Contains individual pay" first on every output made with Show pay amounts on (M4 review EX-1)', () => {
  // A cost center of 1 under the open guard: one person's cost in a `cost: true` column, no pay column.
  const ONE: { name: string; columns: Column[]; rows: Record<string, unknown>[] } = {
    name: 'Cost by cost center',
    columns: COLUMNS,
    rows: [{ unit: '1520-RDU', heads: 1, loaded: 204_123.67 }],
  }
  const onCtx = () => ctxOf('hr-admin', true)

  it('keys the line on the switch, not on a pay column', () => {
    const on = moneyOpts(onCtx())
    expect(on.showPay).toBe(true)
    expect(madeWithPay(on, metaIn(onCtx()))).toBe(true)
    for (const mode of MODES)
      expect(madeWithPay(moneyOpts(ctxOf(mode)), metaIn(ctxOf(mode))), mode).toBe(false)
    // A view that reads no data (the metric dictionary) holds no pay.
    expect(madeWithPay(on, withoutDataContext(metaIn(onCtx())))).toBe(false)
  })

  it('in a figure CSV, the clipboard and a figure workbook', async () => {
    const meta = metaIn(onCtx())
    const money = moneyOpts(onCtx())
    saved.length = 0
    downloadCsv(ONE, meta, { ...money, preamble: true })
    expect((await saved[0].blob.text()).replace(/^﻿/, '').split('\r\n')[0]).toBe(INDIVIDUAL_PAY_LINE)
    expect(toTsv(ONE, money).split('\n')[0]).toBe(INDIVIDUAL_PAY_LINE)
    expect(toTsv(ONE, { ...money, individualPay: madeWithPay(money, meta) }).split('\n')[0]).toBe(
      INDIVIDUAL_PAY_LINE,
    )
    const wb = await buildWorkbook([ONE], meta, money)
    expect(columnA(wb.getWorksheet('Cost by cost center')!)[0]).toBe(INDIVIDUAL_PAY_LINE)

    // Switch off (HR admin at Finance's rules, and Finance): no such line anywhere.
    for (const mode of ['hr-admin', 'finance'] as const) {
      const off = metaIn(ctxOf(mode))
      const offMoney = moneyOpts(ctxOf(mode))
      saved.length = 0
      downloadCsv(ONE, off, { ...offMoney, preamble: true })
      expect(await saved[0].blob.text(), mode).not.toContain(INDIVIDUAL_PAY_LINE)
      expect(toTsv(ONE, offMoney), mode).not.toContain(INDIVIDUAL_PAY_LINE)
      const book = await buildWorkbook([ONE], off, offMoney)
      expect(columnA(book.getWorksheet('Cost by cost center')!), mode).not.toContain(INDIVIDUAL_PAY_LINE)
    }
  })

  it('in the whole-view workbook and the deck', async () => {
    const meta = metaIn(onCtx())
    const money = moneyOpts(onCtx())
    const fig = figure('cc', 'Cost by cost center')
    fig.rows = ONE.rows
    const wb = await buildViewWorkbook([fig], meta, { ...money, images: false })
    expect(columnA(wb.getWorksheet('Summary')!)[0]).toBe(INDIVIDUAL_PAY_LINE)
    expect(columnA(wb.getWorksheet('Cost by cost center')!)[0]).toBe(INDIVIDUAL_PAY_LINE)
    resetDecks()
    await exportViewDeck([fig], meta, { ...money, captured: new Map() })
    const [title, about] = decks[0].slides
    const context = title.texts.find((t) => t.includes(meta.scope)) ?? ''
    expect(context.split('\n')[0]).toBe(INDIVIDUAL_PAY_LINE)
    expect(about.texts[0]).toBe(ABOUT_SLIDE_TITLE)
    expect(about.texts[1]).toBe(INDIVIDUAL_PAY_LINE)

    const off = metaIn(ctxOf('hr-admin'))
    const offMoney = moneyOpts(ctxOf('hr-admin'))
    const plain = await buildViewWorkbook([fig], off, { ...offMoney, images: false })
    expect(columnA(plain.getWorksheet('Summary')!)).not.toContain(INDIVIDUAL_PAY_LINE)
    resetDecks()
    await exportViewDeck([fig], off, { ...offMoney, captured: new Map() })
    expect(decks[0].slides.map(slideText).join('\n')).not.toContain(INDIVIDUAL_PAY_LINE)
  })

  it("in the Export menu's long CSV and in image footers", async () => {
    const { longCsvOf } = await import('@/views/finance/engine/longCsv')
    const { longCsvText } = await import('./longCsv')
    const ctx = onCtx()
    const model = longCsvOf(ctx)
    expect(model.mode).toBe('open')
    // Exactly as the Export menu writes it: no `individualPay` option, the rows' mode only.
    const text = longCsvText(model.rows, metaIn(ctx), { mode: model.mode, totals: model.totals })
    expect(text.replace(/^﻿/, '').split('\r\n')[0]).toBe(INDIVIDUAL_PAY_LINE)

    const meta = metaIn(ctx)
    const footer = imageFooter(meta, null, { individualPay: madeWithPay(moneyOpts(ctx), meta) })
    expect(footer.split(' · ')[0]).toBe(INDIVIDUAL_PAY_LINE)
    expect(imageFooter(metaIn(ctxOf('hr-admin')))).not.toContain(INDIVIDUAL_PAY_LINE)
  }, 120_000)
})
