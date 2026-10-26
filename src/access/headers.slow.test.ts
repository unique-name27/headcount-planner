/**
 * Every output names its mode, and individual pay leaves the app only where it says so (lead
 * decisions D-MODELINE and D-PAYFILES of the M4 review: CP-1, CP-2, EX-1, EX-2, EX-8). The crawl
 * reads every export as written bytes (src/testkit/crawl.ts: each figure's and records list's CSV
 * and clipboard text, the long CSV of each source, the load files, each tab's workbook, each view's
 * whole-view workbook and deck, and the workspace files), in each mode:
 *
 *  - HR admin with Show pay amounts on: every CSV, clipboard text, long CSV and both load files
 *    start "Contains individual pay", and every workbook and deck carries it; each names "Made in HR
 *    admin mode with pay amounts shown.". The load file at Finance's rules keeps the rows it is
 *    written with the switch off (CONTRACTS-M4 5), and starts as every switch-on output does, as
 *    Finance > Export's own figures of its rows do (M4 recheck D-PAYFILES-a). A Shareable file is
 *    written as HR admin sees it with the switch off (7.5, Finance's rules): byte-equal to the one HR
 *    admin writes with the switch off, so individual pay leaves only in a Full file or an output made
 *    with the switch on.
 *  - Every other mode, and HR admin with the switch off: no output says "Contains individual pay",
 *    and every output with a preamble names the mode it was made in ("Made in HR admin mode.",
 *    "Made in Finance mode.", "Made in HRBP mode for …", "Made in Leader mode for …", "Made in
 *    Manager mode for …'s team. No amounts are included.").
 *  - Manager mode's own Shareable and Requests files, and Export for a manager written for that
 *    manager, carry the Manager export line for the acting manager.
 *
 * The clipboard carries no preamble (src/lib/export/clipboard.ts), so it is held to the pay line only.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { AnalyticsContext } from '@/data/context'
import { INDIVIDUAL_PAY_LINE } from '@/lib/export/exportHeader'
import { hrAdminExportLine, modeMeta } from '@/lib/export/modeMeta'
import { type Crawl, crawlAll, forManagerText, workspaceText } from '@/testkit/crawl'
import { MemoryStorage } from '@/testkit/memoryStorage'
import { leakSample, personaOf, pinClock, sampleCtx, unpinClock } from '@/testkit/sample'
import { managerExportLine } from './copy'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
vi.stubGlobal('localStorage', new MemoryStorage())

beforeAll(() => pinClock())
afterAll(() => unpinClock())

/** One written output: what it is, where the crawl read it, and its lines as written. */
interface Output {
  kind: 'csv' | 'records' | 'tsv' | 'long' | 'load' | 'load-full' | 'workbook' | 'deck'
  where: string
  lines: string[]
}

const linesOf = (text: string): string[] => text.replace(/^\uFEFF/, '').split(/\r?\n/)
/** A CSV field as written: quotes taken off. */
const unquote = (s: string): string => s.replace(/^"(.*)"$/, '$1').replace(/""/g, '"')

/** A value the crawl read from an array (`where[3]`): the array's where and the item. */
const ARRAY_ITEM = /^(.*)\[(\d+)\]$/

/** A sheet row as SheetJS writes it: its first cell. */
const firstCell = (line: string): string => unquote(line.split(',')[0] ?? '')

/** Every output the crawl read as written bytes, by kind (workbooks and decks one output each). */
function outputsOf(c: Crawl): Output[] {
  const out = new Map<string, Output>()
  const add = (kind: Output['kind'], where: string, lines: readonly string[]) => {
    const o = out.get(where) ?? { kind, where, lines: [] }
    o.lines.push(...lines)
    out.set(where, o)
  }
  for (const s of c.seen) {
    const item = ARRAY_ITEM.exec(s.where)
    const w = item ? item[1] : s.where
    if (w.startsWith('workbook ')) {
      add('workbook', w.slice(0, w.lastIndexOf('/')), linesOf(String(s.value)))
      continue
    }
    if (w.startsWith('deck ')) {
      add('deck', w.slice(0, w.indexOf('/slide ')), [String(s.value)])
      continue
    }
    if (w.endsWith('.tsv') && typeof s.value === 'string') {
      add('tsv', w, linesOf(s.value))
      continue
    }
    if (!w.endsWith('.csv') || typeof s.value !== 'string') continue
    if (item) {
      // A records list's file as the crawl keeps it: its preamble and header lines as written.
      add('records', w, [s.value])
      continue
    }
    const kind: Output['kind'] = w.startsWith('export long-csv')
      ? 'long'
      : w === 'file load-file-full.csv'
        ? 'load-full'
        : w === 'file load-file.csv'
          ? 'load'
          : 'csv'
    add(kind, w, linesOf(s.value).map(unquote))
  }
  return [...out.values()]
}

/** The modes the outputs are read in. */
const CASES = [
  { label: 'HR admin, pay shown', mode: 'hr-admin', showPay: true },
  { label: 'HR admin', mode: 'hr-admin', showPay: false },
  { label: 'Finance', mode: 'finance', showPay: false },
  { label: 'HRBP', mode: 'hrbp', showPay: false },
  { label: 'Leader', mode: 'leader', showPay: false },
  { label: 'Manager', mode: 'manager', showPay: false },
] as const

type Case = (typeof CASES)[number]

const read = new Map<string, { ctx: AnalyticsContext; crawl: Crawl; outputs: Output[] }>()

/** The crawl's options: every export as written; the lists and cards behind numbers only in part. */
const OPTS = { cellRows: 1, cards: 2, texts: false, writes: false } as const

beforeAll(async () => {
  for (const c of CASES) {
    const ctx = sampleCtx(c.mode, { showPay: c.showPay })
    const crawl = await crawlAll(ctx, OPTS)
    read.set(c.label, { ctx, crawl, outputs: outputsOf(crawl) })
  }
}, 1_800_000)

const of = (c: Case) => read.get(c.label) as { ctx: AnalyticsContext; crawl: Crawl; outputs: Output[] }

describe('every output names its mode (D-MODELINE: review CP-1, EX-8)', () => {
  it('reads every kind of output in every mode (non-vacuous)', () => {
    for (const c of CASES) {
      const kinds = new Set(of(c).outputs.map((o) => o.kind))
      for (const k of ['csv', 'records', 'tsv', 'workbook', 'deck'] as const)
        expect(kinds, `${c.label} ${k}`).toContain(k)
      expect(of(c).crawl.errors, c.label).toEqual([])
    }
    expect(new Set(of(CASES[0]).outputs.map((o) => o.kind))).toContain('load-full')
    for (const c of CASES.slice(0, 3))
      expect(new Set(of(c).outputs.map((o) => o.kind)), c.label).toContain('load')
    for (const c of CASES.slice(0, 5))
      expect(new Set(of(c).outputs.map((o) => o.kind)), c.label).toContain('long')
  })

  it('states the mode line in every CSV, long CSV, load file, workbook and deck', () => {
    for (const c of CASES) {
      const { ctx, outputs } = of(c)
      const line = modeMeta(ctx.access).modeLine as string
      expect(line, c.label).toMatch(/^Made in /)
      if (c.mode === 'hr-admin') expect(line).toBe(hrAdminExportLine(c.showPay))
      const missing: string[] = []
      for (const o of outputs) {
        if (o.kind === 'tsv') continue
        if (!o.lines.some((l) => l.includes(line))) missing.push(`${o.kind} ${o.where}`)
      }
      expect(missing.slice(0, 10), `${c.label}: outputs with no "${line}"`).toEqual([])
    }
  })
})

describe('individual pay leaves the app only where it says so (D-PAYFILES: review EX-1, EX-2)', () => {
  it('HR admin with the switch on: every output starts, or carries, "Contains individual pay"', () => {
    const missing: string[] = []
    // Every load file too: the one at Finance's rules starts as Finance > Export's figures of its rows
    // do (M4 recheck D-PAYFILES-a).
    expect(new Set(of(CASES[0]).outputs.map((o) => o.kind))).toContain('load')
    for (const o of of(CASES[0]).outputs) {
      const first = o.lines.find((l) => l.trim() !== '')
      const ok =
        o.kind === 'workbook'
          ? o.lines.some((l) => firstCell(l) === INDIVIDUAL_PAY_LINE)
          : o.kind === 'deck'
            ? o.lines.includes(INDIVIDUAL_PAY_LINE)
            : first === INDIVIDUAL_PAY_LINE
      if (!ok) missing.push(`${o.kind} ${o.where}: ${first?.slice(0, 60)}`)
    }
    expect(missing.slice(0, 12)).toEqual([])
  })

  it('no other mode, and not HR admin with the switch off, writes "Contains individual pay"', () => {
    for (const c of CASES.slice(1)) {
      const hits = of(c)
        .outputs.filter((o) => o.lines.some((l) => l.includes(INDIVIDUAL_PAY_LINE)))
        .map((o) => `${o.kind} ${o.where}`)
      expect(hits.slice(0, 8), c.label).toEqual([])
    }
  })

  it('a Shareable file is written as HR admin sees it with the switch off, whatever the switch says', () => {
    const on = of(CASES[0])
    const off = of(CASES[1])
    const shareOn = workspaceText(on.crawl, 'shareable')
    expect(shareOn.length).toBeGreaterThan(1000)
    expect(shareOn).toBe(workspaceText(off.crawl, 'shareable'))
    expect(shareOn).not.toContain(INDIVIDUAL_PAY_LINE)
    expect(shareOn).not.toContain(hrAdminExportLine(true))
  })
})

describe('Manager files name the acting manager (D-MODELINE: review CP-2)', () => {
  it('Manager’s own Shareable and Requests files, and Export for a manager for them, carry the Manager export line', () => {
    const mgr = of(CASES[5])
    const who = mgr.ctx.access.actingAs
    if (!who) throw new Error('Manager mode has no pick on the sample.')
    const line = managerExportLine(who.name)
    expect(modeMeta(mgr.ctx.access).modeLine).toBe(line)
    for (const kind of ['shareable', 'requests'] as const)
      expect(workspaceText(mgr.crawl, kind), kind).toContain(line)
    // Export for a manager, written by HR admin for the same manager, says whom it was made for.
    expect(forManagerText(of(CASES[1]).ctx, who.personId)).toContain(line)
    // Another manager's line is not in it.
    const b = personaOf(leakSample(), 'manager-b')
    if (b.employeeId !== who.personId)
      expect(forManagerText(of(CASES[1]).ctx, b.employeeId)).not.toContain(line)
  })
})
