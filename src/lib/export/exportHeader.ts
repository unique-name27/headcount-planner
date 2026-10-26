/**
 * The header every output carries (docs/PLAN.md 14.1 item 1): one source, `headerFacts(meta)`, for
 * the plan facts `ExportMeta.plan` holds (`PlanHeader`, built by src/app/exportMeta.ts
 * `planHeaderOf`), in this order and with these labels:
 *
 *   Version     "FY27 Working"
 *   Lock        "sha256-…" for a locked version, "Working, not locked", "Retired, not locked"
 *   Comparison  "vs FY27 Budget", "vs FY28 target"
 *   As of       "30 Sep 2026"
 *   Proration   "Daily", "Half month", "Full month"
 *   Rates       "Plan rates (EUR 1.08, ILS 0.27)" or "Actual for closed months, forecast for open"
 *   Cost        "Loaded cost: base + bonus + burden + benefits + one-time, USD" (+ ", incl. SBC")
 *   Filters     "Business unit: Silicon Engineering; period: FY27"
 *   Rounding    "Exact for groups of 5 or more", "Rounded down to $0.1M per team",
 *               "None: HR admin with pay amounts shown"
 *
 * then the mode lines (`modeLines(meta)`: "Made in HRBP mode for Silicon Engineering." and the mode's
 * cost line; "Made in HR admin mode." in HR admin). A fact whose value is '' is left out. A Manager
 * output states all nine facts, but its Rates, Cost and Rounding are amount-free words whatever the
 * meta holds (`MANAGER_FACTS`), since Manager outputs hold no currency code or amount (7.6; M4 review
 * SB-4: the spec lists rates, cost definition and rounding among every export's header facts).
 *
 * "Contains individual pay" (lead decision D-PAYFILES): the unsuppressed load file's first line (item
 * 6), and the first header line of every output made with Show pay amounts on (`madeWithPay`): figure
 * CSV, Excel, the clipboard, the whole-view workbook, the deck, the long CSV and image footers. It is
 * keyed on the switch, not on a `pay: true` column, since with the switch on the guard is open and a
 * `cost: true` total can be one person's (a cost center of 1).
 *
 * Where each output takes it: the workbook Summary (every fact), each sheet's title block
 * (`compactHeaderLine`; a figure workbook, which has no Summary, every line), the CSV preamble and the
 * long CSV (`headerLines`), the deck's "About these numbers" slide after the title slide
 * (`headerFacts`), and image footers (`imageHeaderLine`: the version and the as-of date). Pure.
 *
 * M4 freeze (docs/CONTRACTS-M4.md): the constants and shapes are frozen; the exports builder filled
 * the bodies.
 */
import type { Column, ExportMeta, PlanHeader } from '@/charts/types'
import type { Proration } from '@/data/schema'
import { type MoneyArg, type MoneyOpts, readMoney, visibleColumns } from './columns'
import { textViewerOf } from './freeText'
import { asOfLabel, hasDataContext, INDIVIDUAL_PAY_TEXT, modeLines } from './names'

/** A version that is not locked (14.1 item 1). */
export const WORKING_NOT_LOCKED = 'Working, not locked'
/** A retired Working version (C28). */
export const RETIRED_NOT_LOCKED = 'Retired, not locked'
/**
 * The first header line of the unsuppressed load file (14.1 item 6) and of every output made with
 * Show pay amounts on (`madeWithPay`).
 */
export const INDIVIDUAL_PAY_LINE: 'Contains individual pay' = INDIVIDUAL_PAY_TEXT
/** The deck's slide after the title slide (14.1 item 1). */
export const ABOUT_SLIDE_TITLE = 'About these numbers'
/** Added to the cost definition where an output's cost includes equity (14.1 item 1). */
export const INCL_SBC = 'incl. SBC'

/** The fact labels, in header order. */
export const HEADER_LABELS = [
  'Version',
  'Lock',
  'Comparison',
  'As of',
  'Proration',
  'Rates',
  'Cost',
  'Filters',
  'Rounding',
] as const
export type HeaderLabel = (typeof HEADER_LABELS)[number]

/** One fact of the header: its label and its worded value. */
export interface HeaderFact {
  label: HeaderLabel
  value: string
}

export interface HeaderOptions {
  /** Made with Show pay amounts on (`madeWithPay`), or the unsuppressed load file: "Contains individual pay" first. */
  individualPay?: boolean
  /** The output's cost includes equity: the cost definition adds ", incl. SBC". */
  inclSbc?: boolean
}

/** The proration in words. */
export const PRORATION_LABEL: Readonly<Record<Proration, string>> = {
  daily: 'Daily',
  'half-month': 'Half month',
  'full-month': 'Full month',
}

/**
 * What a Manager output states for the facts that elsewhere carry currency codes and amounts (7.6):
 * amount-free words, whatever the meta holds (M4 review SB-4). Rounding is `roundingLine`'s
 * Manager value (src/app/exportMeta.ts).
 */
export const MANAGER_FACTS: Readonly<Record<'Rates' | 'Cost' | 'Rounding', string>> = {
  Rates: 'Not used: no amounts in Manager mode',
  Cost: 'Heads and FTE only',
  Rounding: 'No amounts',
}

/**
 * Whether an output is made with Show pay amounts on (HR admin; `money` is the output's money flags,
 * whose `pay` is the switch): its first header line is then "Contains individual pay", whatever
 * columns it keeps (lead decision D-PAYFILES). A view that reads no data (`meta` without a data
 * context: the metric dictionary) holds no pay, so it says nothing.
 */
export function madeWithPay(
  money: MoneyArg | MoneyOpts | undefined,
  meta?: Pick<ExportMeta, 'scope' | 'window' | 'asOf'> | null,
): boolean {
  if (money === undefined) return false
  const on = typeof money === 'object' && 'showPay' in money ? money.showPay : readMoney(money).pay
  return on && (!meta || hasDataContext(meta))
}

/**
 * Whether an output keeps a `pay: true` column (HR admin with Show pay amounts on). Every writer now
 * keys "Contains individual pay" on the switch (`madeWithPay`); this narrower test stays for callers
 * that ask about the columns themselves.
 */
export function showsIndividualPay(
  columns: readonly Pick<Column, 'pay' | 'cost' | 'band' | 'only'>[],
  money: MoneyArg,
): boolean {
  return readMoney(money).pay && visibleColumns(columns, money).some((c) => c.pay)
}

/** "sha256-…", "Working, not locked" or "Retired, not locked". */
export function lockLine(plan: Pick<PlanHeader, 'versionState' | 'lockHash'>): string {
  if (plan.versionState === 'locked') return plan.lockHash || 'Locked, no hash recorded'
  return plan.versionState === 'retired' ? RETIRED_NOT_LOCKED : WORKING_NOT_LOCKED
}

/** The cost definition, with ", incl. SBC" where the output's cost includes equity. */
function costFact(definition: string, inclSbc: boolean | undefined): string {
  if (!definition || !inclSbc || definition.includes(INCL_SBC)) return definition
  return `${definition}, ${INCL_SBC}`
}

/**
 * The plan facts in header order (see the module comment); empty for a meta with no `plan` (a view
 * that reads no plan data), and without the facts whose value is ''.
 */
export function headerFacts(meta: ExportMeta, opts: HeaderOptions = {}): HeaderFact[] {
  const p = meta.plan
  if (!p) return []
  const values: Record<HeaderLabel, string> = {
    Version: p.version,
    Lock: lockLine(p),
    Comparison: p.comparison,
    'As of': meta.asOf ? asOfLabel(meta.asOf) : '',
    Proration: PRORATION_LABEL[p.proration] ?? String(p.proration ?? ''),
    Rates: p.rates,
    Cost: costFact(p.costDefinition, opts.inclSbc),
    Filters: p.filters,
    Rounding: p.rounding,
  }
  // A Manager output: amount-free words in place of whatever the meta holds (7.6, SB-4).
  if (textViewerOf(meta)?.mode === 'manager') Object.assign(values, MANAGER_FACTS)
  return HEADER_LABELS.map((label) => ({ label, value: (values[label] ?? '').trim() })).filter(
    (f) => f.value !== '',
  )
}

/** One fact as a line: "Version: FY27 Working". */
export const factLine = (f: HeaderFact): string => `${f.label}: ${f.value}`

/**
 * Every header line, as the CSV preamble, the long CSV and the load file write them: "Contains
 * individual pay" first when asked, then "<Label>: <value>" for each fact, then the mode lines.
 */
export function headerLines(meta: ExportMeta, opts: HeaderOptions = {}): string[] {
  return [
    ...(opts.individualPay ? [INDIVIDUAL_PAY_LINE] : []),
    ...headerFacts(meta, opts).map(factLine),
    ...modeLines(meta),
  ]
}

const factOf = (facts: readonly HeaderFact[], label: HeaderLabel): string =>
  facts.find((f) => f.label === label)?.value ?? ''

/**
 * A sheet's title block line: "FY27 Working · Working, not locked · vs FY27 Budget · Rounded down to
 * $0.1M per team" (version, lock, comparison, rounding); null without a `plan`.
 */
export function compactHeaderLine(meta: ExportMeta): string | null {
  if (!meta.plan) return null
  const facts = headerFacts(meta)
  const parts = (['Version', 'Lock', 'Comparison', 'Rounding'] as const).map((l) => factOf(facts, l))
  const line = parts.filter(Boolean).join(' · ')
  return line || null
}

/** An image footer's plan part: "FY27 Working · As of 30 Sep 2026"; null without a `plan`. */
export function imageHeaderLine(meta: ExportMeta): string | null {
  if (!meta.plan) return null
  const version = meta.plan.version.trim()
  const asOf = meta.asOf ? `As of ${asOfLabel(meta.asOf)}` : ''
  const line = [version, asOf].filter(Boolean).join(' · ')
  return line || null
}
