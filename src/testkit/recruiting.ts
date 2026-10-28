/**
 * Plan > Recruiting summary in the leak crawl (docs/PLAN.md 9.8, change C38; its privacy is 9.7's,
 * 16.1). The crawl reads the tab under `plan.recruiting` from its own model (src/testkit/crawl.ts
 * `TAB_MODELS`); this module adds what the recruiting leak test needs on top:
 *
 *  - `recruitingCrawl`: a crawl of Plan > Recruiting summary alone (its seven tiles, heads and hiring
 *    by month, by quarter ahead, where hiring happened, every records list and calculation card
 *    behind them, each figure's CSV and clipboard text). Position cards are opt-in, as in
 *    `hiringCrawl` (a card opened from a row follows its own rules, reading H13).
 *  - `recruitingFiles`: the tab's files as written: its workbook (every figure, a sheet each) and its
 *    deck as the tab's Export menu writes it, one summary slide after "About these numbers" (9.8 item
 *    5, `DECK_SUMMARIES`), each read back into the crawl.
 *  - `recruitingScanned`: what a scan reads, the deck's frame aside (its title slide and "About these
 *    numbers": the mode's export header, the same on every tab, as the files' header lines
 *    `exportHeaderOf` leaves out).
 *  - `menuFiles` and `FILE_AMOUNT`: any Plan tab's own deck and workbook as the Export menu writes
 *    them, frame slides and the Summary sheet included, scanned line by line for an amount (review
 *    RP-1); the recruiting and the hiring leak tests both run it, with Plan > Overview's own files
 *    (`overviewFilesCrawl`) as the control (finish audit AF-5).
 *
 * The scan itself is Plan > Hiring's (`hiringScan`): the tab's drills are Plan > Hiring's own, so the
 * records kinds it may open and the columns it must leave out are `HIRING_DRILL_KINDS` and
 * `HIRING_DRILL_HIDE`. Test code only.
 */
import { exportMetaOf } from '@/app/tabExport'
import type { AnalyticsContext } from '@/data/context'
import { ABOUT_SLIDE_TITLE, headerFacts } from '@/lib/export/exportHeader'
import { modeLines } from '@/lib/export/names'
import { VIEWS } from '@/views/registry'
import { Crawl, type CrawlOptions, crawl, type DeckSlide, type Seen } from './crawl'

/** The tab, as `<view>.<tab>`. */
export const RECRUITING_KEY = 'plan.recruiting'
/** Where the crawl reads the tab. */
export const RECRUITING_TAB = 'view plan/tab recruiting'
/** Where the crawl reads the tab's workbook. */
export const RECRUITING_WORKBOOK = 'workbook plan.recruiting'
/** Where `recruitingFiles` reads the tab's deck. */
export const RECRUITING_DECK = 'deck plan.recruiting'

/**
 * Plan > Recruiting summary alone, as a mode reads it: `crawl` narrowed to the tab. Every other part
 * is off unless `opts` turns it on.
 */
export function recruitingCrawl(ctx: AnalyticsContext, opts: CrawlOptions = {}): Crawl {
  const c = new Crawl(ctx, {
    views: ['plan'],
    tabs: [RECRUITING_KEY],
    pages: false,
    help: false,
    texts: false,
    files: false,
    exports: false,
    writes: false,
    cards: false,
    ...opts,
  })
  c.views()
  if (c.opts.cards !== false) c.cards()
  return c
}

/** The tab's deck as written: its outline, its slides and how many of them are the frame. */
export interface RecruitingDeck {
  outline: string[]
  slides: DeckSlide[]
  /** The title slide, and "About these numbers" when the export header has facts. */
  frame: number
}

const frames = new WeakMap<Crawl, number>()

/** The tab's workbook and deck as written, read back into the crawl (see the module comment). */
export async function recruitingFiles(c: Crawl): Promise<RecruitingDeck> {
  await c.workbooks()
  const { outline, slides } = await c.tabDeck(RECRUITING_KEY)
  const frame = outline[1] === ABOUT_SLIDE_TITLE ? 2 : 1
  frames.set(c, frame)
  return { outline, slides, frame }
}

/** Whether a value is on one of the deck's frame slides. */
function onFrame(where: string, frame: number): boolean {
  // "deck plan.recruiting/slide 2[12]" (a text run) or ".../slide 3/table 1/row 2" (a table row).
  const n = /^deck plan\.recruiting\/slide (\d+)([/[]|$)/.exec(where)?.[1]
  return n != null && Number(n) <= frame
}

/** The values a recruiting crawl read, the folder headline aside (the Plan view's approved heads, not this tab). */
export const recruitingSeen = (c: Crawl): Seen[] =>
  c.seen.filter((s) => !s.where.startsWith('view plan/headline'))

/** What a scan reads: `recruitingSeen` without the deck's frame slides (the export header's own words). */
export function recruitingScanned(c: Crawl): Seen[] {
  const frame = frames.get(c) ?? 0
  return recruitingSeen(c).filter((s) => !onFrame(s.where, frame))
}

/* ───────────── a tab's own files, as the Export menu writes them (review RP-1) ───────────── */

/** An amount on a file's slide or sheet: a currency sign or code, loaded cost, a split by component, or control totals. */
export const FILE_AMOUNT =
  /\p{Sc}|\b(?:USD|EUR|GBP|INR|ILS|TWD|JPY|CAD|SGD|KRW|CNY)\b|\bloaded\b|by component|control totals/iu

/**
 * Every line of a Plan tab's own deck and workbook, as the menu writes them (`tabDeck`,
 * `tabWorkbook`), the title slide, About these numbers and the Summary sheet included, less the lines
 * that carry the export header's facts and mode lines (the mode's words, the same on every tab: rates,
 * the cost definition, the rounding rule; 15.1 R105 keeps them). The control totals are no header
 * fact. The crawl must have read the tab (`recruitingCrawl`, `hiringCrawl`, `overviewFilesCrawl`).
 */
export async function menuFiles(c: Crawl, key: string): Promise<{ lines: string[]; sheets: string[] }> {
  const { slides } = await c.tabDeck(key)
  const sheets = await c.tabWorkbook(key)
  const book = c.seen.filter((x) => x.where.startsWith(`workbook ${key} (menu)/`)).map((x) => String(x.value))
  const plan = VIEWS.find((v) => v.key === 'plan')
  if (!plan) throw new Error('No Plan view.')
  const tab = key.split('.')[1]
  const meta = exportMetaOf(c.ctx, plan, plan.tabs.find((t) => t.key === tab)?.label)
  const facts = [...headerFacts(meta).map((f) => f.value), ...modeLines(meta)].filter(Boolean)
  const lines = [...slides.flatMap((x) => [...x.texts, ...x.tables.flat(2)]), ...book]
    .flatMap((t) => t.split(/\r?\n/))
    .filter((line) => !facts.some((f) => line.includes(f)))
  return { lines, sheets }
}

/** Plan > Overview alone, its tables read for its own files: the control the menu files scans run against. */
export const overviewFilesCrawl = (ctx: AnalyticsContext): Crawl =>
  crawl(ctx, {
    views: ['plan'],
    tabs: ['plan.overview'],
    pages: false,
    help: false,
    texts: false,
    files: false,
    exports: false,
    writes: false,
    cards: false,
    drills: false,
  })

/** The deck's slides after its frame: the tab's own (one summary slide). */
export const deckOwnSlides = (d: RecruitingDeck): DeckSlide[] => d.slides.slice(d.frame)

/** The values as JSON, for byte-equal comparisons. */
export const recruitingJson = (c: Crawl): string =>
  JSON.stringify(recruitingSeen(c).map((s) => [s.where, s.value]))

/** The first value where two recruiting crawls part, for a failure message. */
export function recruitingDifference(a: Crawl, b: Crawl): string {
  const x = recruitingSeen(a)
  const y = recruitingSeen(b)
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const l = JSON.stringify([x[i]?.where, x[i]?.value])
    const r = JSON.stringify([y[i]?.where, y[i]?.value])
    if (l !== r) return `#${i}: ${l.slice(0, 220)} | ${r.slice(0, 220)}`
  }
  return 'none'
}
