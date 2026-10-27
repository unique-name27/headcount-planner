/**
 * Plan > Hiring in the leak crawl (docs/PLAN.md 9.7 Privacy, 16.1; docs/CONTRACTS-HIRING.md, the
 * checks owner's part). The crawl reads the tab under `plan.hiring` from its own model
 * (src/testkit/crawl.ts `TAB_MODELS`); this module adds what the hiring leak test needs on top:
 *
 *  - `hiringCrawl`: a crawl of Plan > Hiring alone (its six tiles, the quarter table, the open to hire
 *    bars, the velocity chart, the hires of the last 3 months by location and department (C37), the
 *    readout, every records list and calculation card behind them, each
 *    figure's CSV and clipboard text), plus the Open to hire tile the HRBP and Leader homes and My
 *    team re-link (with its records and card). Position cards are opt-in: a card opened from a row
 *    follows its own rules, not the module's (reading H13).
 *  - `hiringScan`: what a heads-only module must never show, in any mode: a value in an amount
 *    column or format, an amount-like key, a currency sign or ISO code, a pay value of the data, a
 *    records list of a kind the module does not open, a column `HIRING_DRILL_HIDE` leaves out, and
 *    any leave word, key or metric (exits are last days, never leave).
 *  - `seatAndAbove`: a manager's own seat and every seat above it, with the people who hold them,
 *    for 8.4 rule 3 and R23 (nothing about a manager's own seat or above reaches them).
 *
 * Test code only.
 */
import { HIRING_DRILL_HIDE, HIRING_DRILL_KINDS } from '@/access/ids'
import type { Kpi } from '@/components/types'
import type { AnalyticsContext } from '@/data/context'
import type { Sample } from '@/data/sample'
import type { PositionRow } from '@/data/schema'
import { standardColumnLabel } from '@/drill/records'
import type { DrillKind } from '@/drill/types'
import { moneyOpts, moneyShown } from '@/lib/export/columns'
import { csvPreamble } from '@/lib/export/csv'
import { homeModel } from '@/views/home/engine'
import { VIEWS } from '@/views/registry'
import { teamModel } from '@/views/team/engine'
import { Crawl, type CrawlOptions, figureMeta, type Seen } from './crawl'
import { amountsIn, cellsOf, isAmountKey, keysOf, payHits, type Secrets } from './leaks'

/** Where the crawl reads the tab. */
export const HIRING_TAB = 'view plan/tab hiring'
/** Where the crawl reads the tab's workbook. */
export const HIRING_WORKBOOK = 'workbook plan.hiring'
/** The metric ids Plan > Hiring's tiles carry (each starts with it). */
const HIRING_METRIC = 'plan.hiring.'

/** Every tile in a model whose metric is one of Plan > Hiring's (the homes' and My team's re-linked tile). */
function hiringTilesIn(v: unknown, out: Kpi[] = [], depth = 0): Kpi[] {
  if (!v || typeof v !== 'object' || depth > 6) return out
  if (Array.isArray(v)) {
    for (const x of v) hiringTilesIn(x, out, depth + 1)
    return out
  }
  const o = v as Record<string, unknown>
  if (typeof o.id === 'string' && typeof o.metricId === 'string' && 'value' in o && 'format' in o) {
    if (o.metricId.startsWith(HIRING_METRIC)) out.push(o as unknown as Kpi)
    return out
  }
  for (const [k, x] of Object.entries(o)) if (k !== 'uses') hiringTilesIn(x, out, depth + 1)
  return out
}

/**
 * Plan > Hiring alone, as a mode reads it (see the module comment): `crawl` narrowed to the tab, then
 * the Home and My team tiles that re-link it. Every other part is off unless `opts` turns it on.
 */
export function hiringCrawl(ctx: AnalyticsContext, opts: CrawlOptions = {}): Crawl {
  const c = new Crawl(ctx, {
    views: ['plan'],
    tabs: ['plan.hiring'],
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
  const a = ctx.access
  const homes: [string, () => unknown][] = [
    ['view home/hiring', () => (a.can('view:home') ? homeModel(ctx) : null)],
    ['view team/hiring', () => (a.can('view:team') ? teamModel(ctx) : null)],
  ]
  for (const [where, read] of homes) {
    let model: unknown
    try {
      model = read()
    } catch (e) {
      c.errors.push({ where, message: (e as Error).message })
      continue
    }
    const tiles = hiringTilesIn(model)
    if (tiles.length) c.kpis(where, tiles as never)
  }
  if (c.opts.cards !== false) c.cards()
  return c
}

/** The values a hiring crawl read, the folder headline aside (the Plan view's approved heads, not this module). */
export const hiringSeen = (c: Crawl): Seen[] =>
  c.seen.filter((s) => !s.where.startsWith('view plan/headline'))

/** The values as JSON, for byte-equal comparisons. */
export const hiringJson = (c: Crawl): string => JSON.stringify(hiringSeen(c).map((s) => [s.where, s.value]))

/** The first value where two hiring crawls part, for a failure message. */
export function hiringDifference(a: Crawl, b: Crawl): string {
  const x = hiringSeen(a)
  const y = hiringSeen(b)
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const l = JSON.stringify([x[i]?.where, x[i]?.value])
    const r = JSON.stringify([y[i]?.where, y[i]?.value])
    if (l !== r) return `#${i}: ${l.slice(0, 220)} | ${r.slice(0, 220)}`
  }
  return 'none'
}

/** A leave key on a path, the leave metric, or the word "leave" in any text. */
const LEAVE_KEY = /^(onLeave|leavePaid|leave|leaveState|unpaidLeave|leaveFrom)$/
const LEAVE_WORD = /\bleave\b/i

/** A records list's column label as the crawl reads it (`…/records <kind>.columns[i]`): its kind. */
const RECORDS_COLUMNS = /\/records ([A-Za-z]+)\.columns\[\d+\]$/
/** A records list the crawl read or reported hidden (`…/records <kind>…`). */
const RECORDS_KIND = /\/records ([A-Za-z]+)[./]/

export interface HiringHit {
  where: string
  what: string
  text: string
}

/**
 * A written file's value: a figure's or list's CSV or clipboard text (or, for a records list read as a
 * digest, its preamble and header line by line, `.csv[i]`), or a workbook sheet read back.
 */
const isFile = (where: string): boolean =>
  /\.(csv|tsv)(\[\d+\])?$/.test(where) || where.startsWith('workbook ')

/** The texts a value shows: a written file cell by cell, any other text whole. */
function textsOf(s: Seen): string[] {
  if (typeof s.value !== 'string') return []
  if (/\.tsv(\[\d+\])?$/.test(s.where)) return cellsOf(s.value, '\t')
  if (isFile(s.where)) return cellsOf(s.value, ',')
  return [s.value]
}

/**
 * The export header every file a mode writes carries (docs/PLAN.md 14.1: the version, its lock, the
 * rates, the cost and rounding conventions, the mode stamp), as the CSV preamble writes it for Plan >
 * Hiring: the same lines in every file of the mode, about the version and not the module, so a scan
 * of the module's own words leaves them out (`hiringScan`'s `header`).
 */
export function exportHeaderOf(ctx: AnalyticsContext): Set<string> {
  const plan = VIEWS.find((v) => v.key === 'plan') ?? null
  const meta = figureMeta(ctx, plan, 'hiring')
  return new Set(
    csvPreamble({ name: '', title: '', columns: [], rows: [] }, meta, moneyShown(moneyOpts(ctx))),
  )
}

/** A file's text with the export header's lines taken out (as written, quoted or not); any other value as it is. */
function withoutHeader(s: Seen, header: ReadonlySet<string>): Seen {
  if (typeof s.value !== 'string' || !isFile(s.where)) return s
  const lines = s.value.split(/\r?\n/).filter((line) => {
    // A sheet row read back carries a comma for each empty cell after it.
    const bare = line.replace(/^\uFEFF/, '').replace(/,+$/, '')
    const unquoted = /^".*"$/.test(bare) ? bare.slice(1, -1).replace(/""/g, '"') : bare
    return !header.has(unquoted)
  })
  return { ...s, value: lines.join('\n') }
}

/**
 * What a heads-only module must never show (see the module comment), over every value a hiring crawl
 * read, written files cell by cell with the mode's export header left out (`exportHeaderOf`), and the
 * leave word looked for outside the positions' own titles (`titles`, the data's words).
 * Counts of 1,000 or more are counts here (a company's heads), so the grouped-number rule of Manager
 * mode's amount scan is left to `amountHits` where a test wants it.
 */
export function hiringScan(
  given: readonly Seen[],
  secrets: Secrets,
  header: ReadonlySet<string> = new Set(),
  titles: ReadonlySet<string> = new Set(),
): HiringHit[] {
  const seen = header.size ? given.map((x) => withoutHeader(x, header)) : given
  const out: HiringHit[] = []
  const kinds: readonly string[] = HIRING_DRILL_KINDS
  const hidden = new Map<string, Set<string>>(
    HIRING_DRILL_KINDS.map((k) => [
      k,
      new Set(HIRING_DRILL_HIDE[k].map((key) => standardColumnLabel(k as DrillKind, key) ?? key)),
    ]),
  )
  const keyHits = new Set<string>()
  for (const s of seen) {
    const at = s.where
    for (const k of keysOf(at)) {
      if (isAmountKey(k) && !keyHits.has(`a ${k}`)) {
        keyHits.add(`a ${k}`)
        out.push({ where: at, what: `amount-like key ${k}`, text: String(s.value) })
      }
      if (LEAVE_KEY.test(k) && !keyHits.has(`l ${k}`)) {
        keyHits.add(`l ${k}`)
        out.push({ where: at, what: `leave key ${k}`, text: String(s.value) })
      }
    }
    for (const flag of ['money', 'band', 'perHead', 'component'] as const)
      if (s.tag[flag] && s.value != null && s.value !== '' && s.value !== '—')
        out.push({ where: at, what: `value tagged ${flag}`, text: String(s.value) })
    if (/plan\.leave\./.test(at) || /plan\.leave\./.test(s.tag.in))
      out.push({ where: at, what: 'leave metric', text: String(s.value) })
    const kind = RECORDS_KIND.exec(at)?.[1]
    if (kind && !kinds.includes(kind)) out.push({ where: at, what: `records of kind ${kind}`, text: '' })
    const cols = RECORDS_COLUMNS.exec(at)?.[1]
    if (cols && typeof s.value === 'string' && hidden.get(cols)?.has(s.value))
      out.push({ where: at, what: `hidden column ${s.value}`, text: s.value })
    for (const t of textsOf(s)) {
      for (const what of amountsIn(t))
        if (what.startsWith('currency')) out.push({ where: at, what, text: t.slice(0, 120) })
      // A position's own title is the data's words, not a leave fact ("Leave and Accommodation Specialist").
      if (LEAVE_WORD.test(t) && !titles.has(t))
        out.push({ where: at, what: 'leave word', text: t.slice(0, 120) })
    }
  }
  for (const h of payHits(seen, secrets)) out.push({ where: h.where, what: h.what, text: h.text })
  return out
}

/** The hits as lines, for a failure message. */
export const hitLines = (hits: readonly HiringHit[], n = 8): string =>
  hits
    .slice(0, n)
    .map((h) => `${h.what} at ${h.where.slice(0, 180)}: ${h.text.slice(0, 100)}`)
    .join('\n')

/** A seat and every seat above it, with the people who hold them on the as-of date (8.4 rule 3, R23). */
export interface SeatAndAbove {
  /** The manager's own seat. */
  own: string
  /** Every seat above it, nearest first. */
  above: string[]
  /** The employee IDs and names of the manager and of everyone holding a seat above. */
  people: { employeeId: string; name: string }[]
}

/** Each position's row on the as-of date, else its first row (the placement the scopes read). */
function placements(s: Sample): Map<string, PositionRow> {
  const out = new Map<string, PositionRow>()
  for (const r of s.datasets.positions) {
    const cur = out.get(r.positionId)
    const onAsOf = r.effectiveDate <= s.asOf
    if (!cur) out.set(r.positionId, r)
    else if (onAsOf && (cur.effectiveDate > s.asOf || r.effectiveDate >= cur.effectiveDate))
      out.set(r.positionId, r)
  }
  return out
}

export function seatAndAbove(s: Sample, positionId: string): SeatAndAbove {
  const place = placements(s)
  const above: string[] = []
  const seen = new Set<string>([positionId])
  for (let up = place.get(positionId)?.managerPositionId ?? null; up && !seen.has(up); ) {
    above.push(up)
    seen.add(up)
    up = place.get(up)?.managerPositionId ?? null
  }
  const seats = new Set([positionId, ...above])
  const people = s.datasets.workers
    .filter(
      (w) =>
        !!w.positionId &&
        seats.has(w.positionId) &&
        (w.assignmentStart || w.hireDate) <= s.asOf &&
        !(w.assignmentEnd && w.assignmentEnd < s.asOf) &&
        !(w.terminationDate && w.terminationDate < s.asOf),
    )
    .map((w) => ({ employeeId: w.employeeId, name: w.name ?? w.employeeId }))
  return { own: positionId, above, people }
}
