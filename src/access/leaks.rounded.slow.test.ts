/**
 * HRBP and Leader cost is rounded per cost atom (docs/PLAN.md 7.3, C3, C21, 16.1): in every HRBP and
 * Leader crawl (every HRBP pick, every leader pick, the CEO, CFO and CHRO included), calculation cards
 * and the Shareable file included, every amount not tagged as a band estimate or a per-head step is a
 * whole rounding step (`isRoundedCost`, the locked `cost.guard.floorUsd`), and no card input is a
 * local-currency amount or an HRIS-derived average. Under a month or custom period no amount shows
 * at all (band figures apart). The controls: Finance's exact amounts fail the same scan, and the scan
 * reads card inputs and steps. Every export as written (M4): the long CSV's rows and control totals,
 * each view's deck (its tables read from the file) and whole-view workbook (read back sheet by
 * sheet) hold no monthly, cost-center, component or local-currency amount; Finance's exports, the
 * control, do.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { AnalyticsContext } from '@/data/context'
import type { Sample } from '@/data/sample'
import { isRoundedCostTo } from '@/lib/costRounding'
import { type Crawl, crawl, crawlAll, type Seen } from '@/testkit/crawl'
import { MemoryStorage } from '@/testkit/memoryStorage'
import { ctxAs, leakSample, personaCtx, pinClock, sampleSources, unpinClock } from '@/testkit/sample'
import { listsInForce } from './lists'
import { actingAsOptions } from './scopes'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
vi.stubGlobal('localStorage', new MemoryStorage())

let s: Sample
beforeAll(() => {
  pinClock()
  s = leakSample()
}, 120_000)
afterAll(() => unpinClock())

/** A currency other than USD in a card's words: a sign, an ISO code, or "local". */
const LOCAL = /[€₹₪¥£₫]|NT\$|C\$|\b(EUR|INR|ILS|TWD|CNY|VND|CAD|GBP)\b|\blocal\b/
/** An average of someone's pay: what a rounded card must never take as an input. */
const AVERAGE = /\b(average|avg|mean)\b/i

/** Why an amount in a rounded crawl breaks 7.3, or null. */
function roundedProblem(x: Seen, step: number): string | null {
  if (!x.tag.money || x.tag.band || x.tag.perHead) return null
  if (typeof x.value === 'number') return isRoundedCostTo(x.value, step) ? null : 'not a whole rounding step'
  if (typeof x.value === 'string' && x.tag.card === 'step') {
    // A step's expression: every dollar amount in it is a whole step ("$88,800,000 + $300,000").
    for (const m of x.value.matchAll(/\$([\d,]+(?:\.\d+)?)(M|K)?/g)) {
      const n = Number(m[1].replace(/,/g, '')) * (m[2] === 'M' ? 1e6 : m[2] === 'K' ? 1e3 : 1)
      if (!isRoundedCostTo(Math.round(n * 100) / 100, step)) return `a step holds ${m[0]}`
    }
  }
  return null
}

/** Card inputs that are a local-currency amount or an average. */
function inputProblem(x: Seen): string | null {
  if (x.tag.card !== 'input' || !x.tag.money || x.value == null) return null
  const words = `${x.tag.label ?? ''}`
  if (LOCAL.test(words)) return 'a local-currency card input'
  if (AVERAGE.test(words)) return 'an average as a card input'
  return null
}

function problems(c: Crawl, ctx: AnalyticsContext): string[] {
  const step = ctx.guard.rules.floorUsd
  const out: string[] = []
  for (const x of c.seen) {
    const p = roundedProblem(x, step) ?? inputProblem(x)
    if (p) out.push(`${p}: ${x.where.slice(0, 200)} = ${String(x.value).slice(0, 80)}`)
  }
  return out
}

/** The rounded-mode personas the period checks crawl. */
const ROUNDED_PERSONAS = ['hrbp-se', 'leader-svp-se', 'leader-dv-director'] as const

/** The amounts a crawl shows (band, per-head and Finance inputs apart), by where they sit. */
const shownAmounts = (c: Crawl): Seen[] =>
  c.seen.filter(
    (x) =>
      x.tag.money &&
      !x.tag.band &&
      !x.tag.perHead &&
      !x.tag.input &&
      typeof x.value === 'number' &&
      x.value !== 0,
  )

/** Figures to date whatever the period: the QTD and YTD variance cells, Loaded cost YTD, FX effect YTD. */
const ALWAYS_TO_DATE = /window=(ytd|qtd)\b|tile (cost-ytd|fx-effect-ytd)\b/
/**
 * Figures over the period picker's window, to date under `ytd` and `qtd`: cost by unit and the bridge
 * strip's FX effect (the bridge itself and the variance tiles are the full year's).
 */
const PERIOD_FIGURES = /figure plan-cost-by-unit\b|tile fx-effect(?![\w-])|models\.plan-cost-by-unit\b/

/** Whether a value sits in a figure that covers the year or quarter to date under the period. */
const isToDate = (where: string, period: 'fy' | 'ytd' | 'qtd'): boolean =>
  ALWAYS_TO_DATE.test(where) || (period !== 'fy' && PERIOD_FIGURES.test(where))

/** The sample with some closes' amounts inflated by half (their atom index kept), for RR-2's check. */
function withInflatedCloses(x: Sample, months: readonly string[]): Sample {
  const closes = x.plan.closes.map((c) => {
    if (!months.includes(c.month)) return c
    const numbers = Object.fromEntries(
      // Money columns only: heads, FTE, the active fraction and the rate stay as they are.
      Object.entries(c.lines.numbers).map(([k, col]) => [
        k,
        /^(local|usd)/.test(k) ? Float64Array.from(col, (v) => v * 1.5) : col,
      ]),
    ) as typeof c.lines.numbers
    return { ...c, lines: { ...c.lines, numbers } }
  })
  return { ...x, plan: { ...x.plan, closes } }
}

/** Every HRBP and Leader pick the Acting as menus list. */
function picks(): { mode: 'hrbp' | 'leader'; personId: string; unit?: string }[] {
  const ctx = personaCtx('hrbp-se')
  const env = {
    positionIndex: ctx.positionIndex,
    asOf: ctx.asOf,
    all: ctx.all,
    lists: listsInForce(null, ctx.all, sampleSources(ctx.all)),
    personas: s.personas,
  }
  return (['hrbp', 'leader'] as const).flatMap((mode) =>
    actingAsOptions(mode, env).map((o) => ({
      mode,
      personId: o.pick.personId,
      ...(o.pick.unit ? { unit: o.pick.unit } : {}),
    })),
  )
}

describe('rounded modes show whole rounding steps only (7.3)', () => {
  it('holds only whole steps, band estimates and per-head figures in every HRBP and Leader crawl', () => {
    const list = picks()
    // Six units' HRBPs, and every leader-seat holder (the CEO, CFO and CHRO among them).
    expect(list.filter((p) => p.mode === 'hrbp').length).toBe(6)
    expect(list.filter((p) => p.mode === 'leader').length).toBeGreaterThan(30)
    const bad: string[] = []
    let amounts = 0
    let cards = 0
    for (const p of list) {
      const ctx = ctxAs(p.mode, p.personId, p.unit ? { unit: p.unit } : {})
      if (ctx.access.unset) continue
      expect(ctx.guard.mode, p.personId).toBe('rounded')
      const c = crawl(ctx, { focus: 'money' })
      expect(c.errors, p.personId).toEqual([])
      for (const x of problems(c, ctx).slice(0, 3)) bad.push(`${p.mode} ${p.personId}: ${x}`)
      amounts += c.seen.filter((x) => x.tag.money && typeof x.value === 'number' && !x.tag.band).length
      cards += c.seen.filter((x) => x.tag.card === 'input' && x.tag.money).length
    }
    expect(bad.slice(0, 40).join('\n')).toBe('')
    // Non-vacuity: the crawls read thousands of rounded amounts and card inputs.
    expect(amounts).toBeGreaterThan(5000)
    expect(cards).toBeGreaterThan(200)
  }, 1_800_000)

  it('shows no amount under a month or custom period', () => {
    for (const key of ['hrbp-se', 'leader-svp-se', 'leader-dv-director'] as const)
      for (const filters of [
        { period: 'month' as const },
        { period: 'custom' as const, customStart: '2026-08-01', customEnd: '2026-08-31' },
      ]) {
        const c = crawl(personaCtx(key, { filters }), { focus: 'money', cards: false })
        const shown = c.seen.filter(
          (x) =>
            x.tag.money &&
            !x.tag.band &&
            !x.tag.perHead &&
            // The fiscal year's target is an input, not a figure of the period.
            !x.tag.input &&
            typeof x.value === 'number' &&
            x.value !== 0,
        )
        expect(
          shown.slice(0, 5).map((x) => `${x.where} = ${x.value}`),
          `${key} ${filters.period}`,
        ).toEqual([])
        expect(c.seen.length, key).toBeGreaterThan(1000)
      }
  }, 600_000)

  it('shows no to-date amount with no month closed, at a mid-month as-of date (RR-2)', () => {
    const noCloses = { ...s, plan: { ...s.plan, closes: [] } }
    let fyShown = 0
    for (const key of ROUNDED_PERSONAS)
      for (const period of ['fy', 'ytd', 'qtd'] as const) {
        const ctx = personaCtx(key, { sample: noCloses, asOfOverride: '2026-09-15', filters: { period } })
        const c = crawl(ctx, { focus: 'money', cards: false })
        expect(c.errors, `${key} ${period}`).toEqual([])
        const toDate = shownAmounts(c).filter((x) => isToDate(x.where, period))
        expect(
          toDate.slice(0, 5).map((x) => `${x.where} = ${x.value}`),
          `${key} ${period}`,
        ).toEqual([])
        if (period === 'fy') fyShown += shownAmounts(c).length
      }
    // Non-vacuity: the full year still shows its amounts.
    expect(fyShown).toBeGreaterThan(50)
  }, 900_000)

  it('ends every to-date amount at the last close on or before the as-of date (RR-2)', () => {
    // As of 10 Jul 2026 the last close on or before is June's; the July to September closes exist
    // (made later), and inflating their lines must move no to-date amount, only full-year ones.
    const later = withInflatedCloses(s, ['2026-07', '2026-08', '2026-09'])
    let toDateShown = 0
    let fyMoved = 0
    for (const key of ROUNDED_PERSONAS)
      for (const period of ['fy', 'ytd', 'qtd'] as const) {
        const opts = { asOfOverride: '2026-07-10', filters: { period } }
        const a = crawl(personaCtx(key, opts), { focus: 'money', cards: false })
        const b = crawl(personaCtx(key, { ...opts, sample: later }), { focus: 'money', cards: false })
        const before = new Map(shownAmounts(a).map((x) => [x.where, x.value]))
        const after = new Map(shownAmounts(b).map((x) => [x.where, x.value]))
        const moved: string[] = []
        for (const where of new Set([...before.keys(), ...after.keys()])) {
          if (before.get(where) === after.get(where)) continue
          if (isToDate(where, period)) moved.push(`${where}: ${before.get(where)} -> ${after.get(where)}`)
          else if (period === 'fy') fyMoved++
        }
        expect(moved.slice(0, 5), `${key} ${period}`).toEqual([])
        toDateShown += [...before.keys()].filter((w) => isToDate(w, period)).length
      }
    // Non-vacuity: April to June show to date, and the inflated closes reach the full year.
    expect(toDateShown).toBeGreaterThan(20)
    expect(fyMoved).toBeGreaterThan(0)
  }, 900_000)

  it('control: Finance shows exact amounts that fail the scan', () => {
    const ctx = personaCtx('finance-fpa')
    const c = crawl(ctx, { focus: 'money', views: ['plan', 'forecast'], cards: false })
    const exact = c.seen.filter((x) => roundedProblem(x, ctx.guard.rules.floorUsd))
    expect(exact.length).toBeGreaterThan(100)
  }, 300_000)
})

/* ───────────── every export as written (M4) ───────────── */

/** A month as the exports write one: "Oct 2026", "2026-10". */
const MONTH_CELL = /^(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4}|\d{4}-\d{2})$/
/** A cost center as the exports write one: "1120-SJC". */
const COST_CENTER_CELL = /^\d{4}-[A-Z]{3}$/
/** A component's column: base, bonus, burden, benefits, one-time, equity, vacancy. */
const COMPONENT_HEAD = /^(base|bonus|burden|benefits|one-time|one time|equity|vacancy|sbc)\b/i
/** Columns that may hold a band estimate, a per-head step or Finance's input in a rounded mode. */
const ALLOWED_HEAD = /band|per head|target|threshold|standard head/i
/** A dollar amount as a cell writes it. */
const DOLLARS = /^[−-]?\$[\d,.]+[KMB]?$/
/**
 * An amount in a local currency: a sign before digits, or an ISO code beside a number of three
 * digits or more (a rate set's "EUR 1.08" is a rate, not an amount).
 */
const LOCAL_AMOUNT =
  /(?:[€₹₪¥£₫]|NT\$|C\$)\s?\d|\b(?:EUR|INR|ILS|TWD|CNY|VND|CAD|GBP)\s?\d{3}|\d{3}[\d,.]*\s?(?:EUR|INR|ILS|TWD|CNY|VND|CAD|GBP)\b/

/** CSV text as rows of cells (RFC 4180 quotes, the BOM dropped). */
function csvRows(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  const body = text.replace(/^﻿/, '')
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]
    if (quoted) {
      if (ch === '"' && body[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"' && cell === '') quoted = true
    else if (ch === ',') {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && body[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  row.push(cell)
  rows.push(row)
  return rows
}

/**
 * A table's rows (its header first) that show a month, cost-center, component or local-currency
 * amount: a dollar cell, outside a band, per-head or input column, in a row labelled by a month or a
 * cost center or under a component's column; or any amount in a local currency.
 */
function tableProblems(rows: readonly (readonly string[])[], where: string): string[] {
  const out: string[] = []
  let head: readonly string[] | null = null
  for (const row of rows) {
    const cells = row.map((c) => c.trim())
    if (!head) {
      // The header: the first row with two or more labels and no amount.
      if (cells.filter(Boolean).length >= 2 && !cells.some((c) => DOLLARS.test(c))) head = cells
      continue
    }
    // The header's rate set names FX rates (14.1 item 1), not amounts.
    if (cells[0] === 'Rates') continue
    const amounts = cells
      .map((c, i) => ({ c, h: head?.[i] ?? '' }))
      .filter((x) => DOLLARS.test(x.c) && !ALLOWED_HEAD.test(x.h))
    for (const c of cells) if (LOCAL_AMOUNT.test(c)) out.push(`${where}: a local-currency amount ${c}`)
    if (!amounts.length) continue
    if (cells.some((c) => MONTH_CELL.test(c))) out.push(`${where}: a monthly amount in ${cells.join(' | ')}`)
    if (cells.some((c) => COST_CENTER_CELL.test(c)))
      out.push(`${where}: a cost-center amount in ${cells.join(' | ')}`)
    for (const a of amounts)
      if (COMPONENT_HEAD.test(a.h)) out.push(`${where}: a component amount under ${a.h}`)
  }
  return out
}

/** A long CSV row's cell path: period, org, cost center, component and currency, then the column. */
const LONG_CELL =
  /^export long-csv \w+\/r period=([^,]+),org=.*,costCenter=([^,]*),component=([^,]+),currency=([^.,]+)\.(amountUsd|amountLocal|rate)$/

/** What breaks 7.3 in the exports beyond the figures: the long CSV's rows, the decks' tables, the whole-view workbooks' sheets. */
function writtenProblems(c: Crawl): { problems: string[]; rows: number; tables: number; sheets: number } {
  const problems: string[] = []
  let rows = 0
  let tables = 0
  let sheets = 0
  const decks = new Map<string, string[][]>()
  for (const x of c.seen) {
    const long = LONG_CELL.exec(x.where)
    if (long) {
      rows++
      if (x.value == null) continue
      const [, period, cc, component, currency, col] = long
      if (!['QTD', 'YTD', 'FY'].includes(period)) problems.push(`${x.where}: a monthly amount`)
      if (cc !== '') problems.push(`${x.where}: a cost-center amount`)
      if (component !== 'loaded') problems.push(`${x.where}: a component amount`)
      if (currency !== 'USD' || col !== 'amountUsd') problems.push(`${x.where}: a local amount`)
      continue
    }
    const table = /^(deck \S+\/slide \d+\/table \d+)\/row \d+$/.exec(x.where)
    if (table && typeof x.value === 'string') {
      const list = decks.get(table[1]) ?? []
      list.push(x.value.split(' | '))
      decks.set(table[1], list)
      continue
    }
    if (/^workbook view /.test(x.where) && typeof x.value === 'string') {
      sheets++
      problems.push(...tableProblems(csvRows(x.value), x.where))
    }
  }
  for (const [where, list] of decks) {
    tables++
    problems.push(...tableProblems(list, where))
  }
  return { problems, rows, tables, sheets }
}

describe('every export as written in HRBP and Leader mode (M4: 14.1 items 1 to 4, 7.3)', () => {
  it('holds no monthly, cost-center, component or local-currency amount in the long CSV, decks or whole-view workbooks', async () => {
    let rows = 0
    let tables = 0
    let sheets = 0
    for (const key of ROUNDED_PERSONAS) {
      const ctx = personaCtx(key)
      const c = await crawlAll(ctx, { cards: false })
      expect(c.errors, key).toEqual([])
      const r = writtenProblems(c)
      expect(r.problems.slice(0, 10), key).toEqual([])
      rows += r.rows
      tables += r.tables
      sheets += r.sheets
      // The long CSV's amounts are whole steps, its control totals too (problems() reads them above).
      expect(problems(c, ctx).slice(0, 5), key).toEqual([])
    }
    // Non-vacuity: thousands of long CSV cells, and the decks' tables and workbooks' sheets.
    expect(rows).toBeGreaterThan(1000)
    expect(tables).toBeGreaterThan(20)
    expect(sheets).toBeGreaterThan(20)
  }, 900_000)

  it('control: Finance’s exports hold monthly, cost-center and local-currency amounts the same scan finds', async () => {
    const c = await crawlAll(personaCtx('finance-fpa'), { cards: false, views: ['plan'], exports: true })
    const r = writtenProblems(c)
    expect(
      r.problems.some((p) => p.includes('a monthly amount')),
      'monthly',
    ).toBe(true)
    expect(
      r.problems.some((p) => p.includes('a cost-center amount')),
      'cost center',
    ).toBe(true)
    expect(
      r.problems.some((p) => p.includes('a local amount')),
      'local',
    ).toBe(true)
  }, 600_000)
})
