/**
 * A summary slide (docs/PLAN.md 9.8 item 5, change C38): a figure that carries `deckSummary` gets a
 * slide with the summary's title, its numbers and the figure's chart under the chart's own title, and
 * the figures of its tab it names in `replaces` get no slide of their own (`deckEntries`), whether the
 * deck is the tab's own export or a whole view's (ids prefixed with the tab key). A figure of another
 * tab is never dropped, and a summary figure that did not register (no rows) drops nothing. The
 * workbook keeps every figure.
 */
import { describe, expect, it, vi } from 'vitest'
import type { DeckNumber, ExportMeta, RegisteredFigure } from '@/charts/types'
import { decks, resetDecks, slideText } from './deck.testkit'
import { ABOUT_SLIDE_TITLE } from './exportHeader'
import {
  buildViewWorkbook,
  deckEntries,
  deckOutline,
  entrySheetName,
  exportViewDeck,
  type FigureGroup,
  fitRows,
  viewEntries,
} from './view'
import { uniqueSheetNames } from './xlsx'

vi.mock('./download', async (orig) => ({
  ...(await orig<typeof import('./download')>()),
  downloadBlob: () => undefined,
}))
vi.mock('pptxgenjs', async () => ({ default: (await import('./deck.testkit')).FakePptx }))
// A chart picture's data URL, as a browser reads it (node has no FileReader).
vi.stubGlobal(
  'FileReader',
  class {
    result: string | null = null
    error: Error | null = null
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    readAsDataURL() {
      this.result = 'data:image/png;base64,AAAA'
      this.onload?.()
    }
  },
)

const META: ExportMeta = {
  view: 'Plan',
  viewKey: 'plan',
  tab: 'Recruiting summary',
  scope: 'Silicon Engineering',
  window: 'FY27',
  asOf: '2026-09-30',
  isSample: true,
  company: 'Northgate Semiconductor',
  modeLine: 'Made in HRBP mode for Silicon Engineering.',
  mode: 'hrbp',
}

/** The seven numbers as the strip shows them (the sample's Silicon Engineering, FY27). */
const NUMBERS: DeckNumber[] = [
  { label: 'Approved heads, FY27', value: '604', note: 'By 31 Mar 2027' },
  { label: 'Current heads', value: '556', note: 'On 30 Sep 2026' },
  { label: 'Open to hire, FY27', value: '39', note: 'Approved − current − future starts' },
  { label: 'Future starts', value: '9', note: 'Signed offers, by start date' },
  { label: 'Projected starts', value: '38.8', note: 'Model: fill rate, time to fill and backfills' },
  { label: 'Projected attrition', value: '23.8', note: 'Attrition (heads) 6.6% a year' },
  { label: 'Hiring velocity', value: '4.3' },
]

const ID = {
  kpis: 'plan-recruiting-kpis',
  months: 'plan-recruiting-months',
  quarters: 'plan-recruiting-quarters',
  where: 'plan-recruiting-where',
} as const

const fig = (id: string, title: string, extra: Partial<RegisteredFigure> = {}): RegisteredFigure => ({
  id,
  title,
  subtitle: `${title}, heads only.`,
  columns: [
    { key: 'name', label: 'Name' },
    { key: 'heads', label: 'Heads', format: 'int' },
  ],
  rows: [
    { name: 'Oct 2026', heads: 3 },
    { name: 'Nov 2026', heads: 4 },
  ],
  getSvg: () => null,
  order: 0,
  ...extra,
})

/** The tab's four figures as it registers them, the chart's carrying the summary (ids as given). */
function recruitingFigures(prefix = ''): RegisteredFigure[] {
  return [
    fig(`${prefix}${ID.kpis}`, 'Key figures'),
    fig(`${prefix}${ID.months}`, 'Heads and hiring by month', {
      deckSummary: {
        title: 'Recruiting summary',
        subtitle: 'As of 30 Sep 2026 · Silicon Engineering · FY27',
        numbers: NUMBERS,
        replaces: [ID.kpis, ID.quarters, ID.where],
      },
    }),
    fig(`${prefix}${ID.quarters}`, 'By quarter ahead'),
    fig(`${prefix}${ID.where}`, 'Where hiring happened'),
  ]
}

/** A whole view's export: Plan > Hiring, the recruiting summary and Transfers, ids prefixed as the shell does. */
function wholeView(): FigureGroup[] {
  return [
    {
      key: 'hiring',
      label: 'Hiring',
      figures: [
        fig('hiring:key-figures', 'Key figures'),
        fig('hiring:plan-hiring-quarters', 'Open to hire by quarter'),
      ],
    },
    { key: 'recruiting', label: 'Recruiting summary', figures: recruitingFigures('recruiting:') },
    {
      key: 'transfers',
      label: 'Transfers',
      // A figure of another tab with an id the summary names: never dropped.
      figures: [fig(`transfers:${ID.quarters}`, 'Transfers by quarter')],
    },
  ]
}

describe('deckEntries', () => {
  it('drops exactly the figures the summary names, in a tab’s own export', () => {
    const entries = viewEntries(recruitingFigures())
    expect(deckEntries(entries).map((e) => e.figure.id)).toEqual([ID.months])
  })

  it('drops them by the tab’s ids in a whole view’s export, and nothing in another tab', () => {
    const kept = deckEntries(viewEntries(wholeView())).map((e) => e.figure.id)
    expect(kept).toEqual([
      'hiring:key-figures',
      'hiring:plan-hiring-quarters',
      `recruiting:${ID.months}`,
      `transfers:${ID.quarters}`,
    ])
    // The same with groups whose ids are not prefixed: the tab decides, not the id alone.
    const bare: FigureGroup[] = [
      { key: 'recruiting', label: 'Recruiting summary', figures: recruitingFigures() },
      { key: 'other', label: 'Other', figures: [fig(ID.where, 'Where hiring happened elsewhere')] },
    ]
    expect(deckEntries(viewEntries(bare)).map((e) => [e.group?.key, e.figure.id])).toEqual([
      ['recruiting', ID.months],
      ['other', ID.where],
    ])
  })

  it('never drops the summary figure itself, and keeps every figure when no figure has a summary', () => {
    const self = recruitingFigures().map((f) =>
      f.deckSummary ? { ...f, deckSummary: { ...f.deckSummary, replaces: [ID.months, ID.kpis] } } : f,
    )
    expect(deckEntries(viewEntries(self)).map((e) => e.figure.id)).toEqual([ID.months, ID.quarters, ID.where])
    const plain = recruitingFigures().map(({ deckSummary: _drop, ...f }) => f)
    expect(deckEntries(viewEntries(plain)).map((e) => e.figure.id)).toEqual([
      ID.kpis,
      ID.months,
      ID.quarters,
      ID.where,
    ])
  })

  it('leaves the other figures when the summary figure did not register (no rows)', () => {
    const left = recruitingFigures().filter((f) => f.id !== ID.months)
    expect(deckEntries(viewEntries(left)).map((e) => e.figure.id)).toEqual([ID.kpis, ID.quarters, ID.where])
    expect(deckOutline(left, META)).toEqual([
      'Plan',
      ABOUT_SLIDE_TITLE,
      'Key figures',
      'By quarter ahead',
      'Where hiring happened',
    ])
  })
})

describe('the outline and the workbook', () => {
  it('outlines the tab as the title slide, About these numbers and one "Recruiting summary" slide', () => {
    expect(deckOutline(recruitingFigures(), META)).toEqual(['Plan', ABOUT_SLIDE_TITLE, 'Recruiting summary'])
  })

  it('gives the tab its one slide in a whole view’s outline, with no divider of the same title (review RU-17)', () => {
    expect(deckOutline(wholeView(), { ...META, tab: 'All tabs' })).toEqual([
      'Plan',
      ABOUT_SLIDE_TITLE,
      'Hiring',
      'Key figures',
      'Open to hire by quarter',
      'Recruiting summary',
      'Transfers',
      'Transfers by quarter',
    ])
    // Control: a tab whose summary is titled apart from the tab keeps its divider.
    const renamed = wholeView().map((g) => (g.key === 'recruiting' ? { ...g, label: 'Recruiting' } : g))
    expect(deckOutline(renamed, { ...META, tab: 'All tabs' }).slice(5, 7)).toEqual([
      'Recruiting',
      'Recruiting summary',
    ])
  })

  it('keeps every figure in the workbook, a sheet each', async () => {
    const one = await buildViewWorkbook(recruitingFigures(), META, { showPay: false, images: false })
    expect(one.worksheets.map((w) => w.name)).toEqual([
      'Summary',
      'Key figures',
      'Heads and hiring by month',
      'By quarter ahead',
      'Where hiring happened',
    ])
    // A whole view's: a sheet for every figure of every tab, the summary's tab's four among them.
    const all = await buildViewWorkbook(
      wholeView(),
      { ...META, tab: 'All tabs' },
      { showPay: false, images: false },
    )
    const entries = viewEntries(wholeView())
    expect(all.worksheets.map((w) => w.name)).toEqual(
      uniqueSheetNames(['Summary', ...entries.map((e, i) => entrySheetName(e, i + 1))]),
    )
    expect(entries.filter((e) => e.group?.key === 'recruiting')).toHaveLength(4)
    expect(all.worksheets).toHaveLength(1 + 2 + 4 + 1)
  })
})

describe('the summary slide', () => {
  const picture = { blob: new Blob(['png']), width: 1100, height: 280 }

  it('writes the title, the scope and as-of line, the seven numbers and the chart under its own title', async () => {
    resetDecks()
    await exportViewDeck(recruitingFigures(), META, {
      showPay: false,
      captured: new Map([[ID.months, picture]]),
    })
    const deck = decks[0]
    expect(deck.slides).toHaveLength(deckOutline(recruitingFigures(), META).length)
    const slide = deck.slides[2]
    expect(slide.texts[0]).toBe('Recruiting summary')
    expect(slide.texts[1]).toBe('As of 30 Sep 2026 · Silicon Engineering · FY27')
    // Each number: its value, its label and its note, in strip order.
    const boxes = NUMBERS.map((n) => [n.value, n.label, ...(n.note ? [n.note] : [])].join('\n'))
    const at = slide.texts.indexOf(boxes[0])
    expect(at).toBeGreaterThan(1)
    expect(slide.texts.slice(at, at + NUMBERS.length)).toEqual(boxes)
    // "Future starts" and "Projected starts" are two numbers, never one.
    expect(slide.texts.filter((t) => /Future starts$|Future starts\n/.test(t))).toHaveLength(1)
    expect(slide.texts.filter((t) => /Projected starts\n/.test(t))).toHaveLength(1)
    // The chart's own title over its picture, the picture itself, and no other figure's table.
    expect(slide.texts[at + NUMBERS.length]).toBe('Heads and hiring by month')
    expect(slide.images).toBe(1)
    expect(slide.tables).toEqual([])
    expect(slideText(slide)).not.toMatch(/By quarter ahead|Where hiring happened|Key figures/)
    // The speaker notes keep the chart's own subtitle.
    expect(slide.notes.join('\n')).toContain('Heads and hiring by month, heads only.')
  })

  it('fits the chart’s table on the slide under the numbers when there is no picture (review RU-16)', async () => {
    resetDecks()
    const months = recruitingFigures().map((f) =>
      f.id === ID.months
        ? { ...f, rows: Array.from({ length: 18 }, (_, i) => ({ name: `Month ${i + 1}`, heads: i })) }
        : f,
    )
    await exportViewDeck(months, META, { showPay: false, captured: new Map() })
    const slide = decks[0].slides[2]
    const table = slide.boxes.find((b) => b.kind === 'table')
    expect(table).toBeDefined()
    // 7.5in slide, footer 0.85in from the bottom: the table and its "more" line end above it.
    expect((table?.y ?? 0) + (table?.h ?? 0)).toBeLessThanOrEqual(7.5 - 0.85)
    expect(slide.tables[0].length - 1).toBe(fitRows(7.5 - 0.85 - (table?.y ?? 0)))
    const more = slide.boxes.find((b) => b.kind === 'text' && /^And \d+ more rows/.test(b.text ?? ''))
    expect(more?.text).toBe(`And ${18 - (slide.tables[0].length - 1)} more rows in the Excel export.`)
    expect(more?.y ?? 0).toBeGreaterThanOrEqual((table?.y ?? 0) + (table?.h ?? 0))
    expect((more?.y ?? 0) + (more?.h ?? 0)).toBeLessThanOrEqual(7.5 - 0.85)
    // Control: a plain slide still shows 14 rows.
    expect(fitRows(5.1)).toBe(14)
  })

  it('writes the chart’s table under the numbers when there is no picture', async () => {
    resetDecks()
    await exportViewDeck(recruitingFigures(), META, { showPay: false, captured: new Map() })
    const slide = decks[0].slides[2]
    expect(slide.images).toBe(0)
    expect(slide.tables[0][0]).toEqual(['Name', 'Heads'])
    expect(slide.texts).toContain('604\nApproved heads, FY27\nBy 31 Mar 2027')
  })

  it('writes the tab’s divider and its one slide in a whole view’s deck, the other tabs as before', async () => {
    resetDecks()
    const meta = { ...META, tab: 'All tabs' }
    await exportViewDeck(wholeView(), meta, { showPay: false, captured: new Map() })
    const deck = decks[0]
    const outline = deckOutline(wholeView(), meta)
    expect(deck.slides).toHaveLength(outline.length)
    outline.forEach((title, i) => {
      expect(
        deck.slides[i].texts.some((t) => t === title),
        `${i} ${title}`,
      ).toBe(true)
    })
    const summary = deck.slides[outline.lastIndexOf('Recruiting summary')]
    expect(summary.texts).toContain('9\nFuture starts\nSigned offers, by start date')
    expect(summary.texts).toContain('38.8\nProjected starts\nModel: fill rate, time to fill and backfills')
  })
})
