/**
 * Calculation cards (docs/PLAN.md 9.5; the template app has none): a modeled number (an amount, a
 * rate, a weighted or probability-weighted count) opens a card that shows its inputs and the
 * arithmetic, step by step, down to the number on screen. The card lives in the drill stack
 * (`DrillEntry` `{ type: 'calc' }`, ./types.ts), so Back and focus return work as for records.
 *
 * The rules every card keeps (tested in `calc.test.ts` and the leak crawls):
 *  - The last step's result is `value`. Every worked example in PLAN 6 is a `CalcSpec` fixture whose
 *    last step equals the number.
 *  - `rows` ("Show the n records"): a counted card's rows number `value`; a weighted or band card's
 *    rows carry a `weight` (the "Counts as" column, `DrillSpec.weight`) that adds up to `value`. A
 *    cost card's rows are the positions behind it with no amount column (`costPeopleDrill`), so its
 *    sum is checked only in HR admin with the switch, where the rows carry the amounts as weights.
 *  - Card amounts come from the same guard output as the figure (`guardModel`, src/cost/guard.ts);
 *    this module never reads engine totals directly.
 *  - Manager mode: heads, rates and words only. HRBP and Leader: every amount on a cost card is a
 *    rounded part (each atom's filled and band part after `roundCost`, the `sumRounded` step, the
 *    Rounding step, a per head only through `perHeadOfRounded`); no exact sum, HRIS average,
 *    local-currency amount, component or split by driver. Finance: every amount covers 5 or more
 *    costed people and every difference has 5 or more contributors. Band-estimate cards show their
 *    band inputs and steps (they read no pay). Outside HR admin with the switch no input or step
 *    shows a per-position amount built from pay or an offer: it reads "—".
 *
 * Pure. Frozen in the M2 freeze (docs/CONTRACTS-M2.md): `CalcInput`, `CalcStep`, `CalcSpec` and
 * `CalcSource` are PLAN 9.5's, with `resolveCalc`, `calcProblems` (the card's rules) and `costCalc`
 * (a cost card from the guard); the checks and builders below them are additions.
 */
import type { CostRow, GuardedFigure } from '@/cost/guard'
import type { FieldRef } from '@/data/quality/fieldRef'
import type { Format } from '@/lib/format'
import type { DrillSource } from './types'

/** One input of a card: a rate, a band, a count, a total from the guard. */
export interface CalcInput {
  /** "Bonus target", "Plan rate EUR". */
  label: string
  /** null renders "—" (the cost guard, or a per-position amount outside HR admin with the switch). */
  value: number | string | null
  format: Format
  /** Where it came from: "Assumptions · Silicon Engineering · FY27 Working", or a version's hash. */
  source: string
  /** An assumption's fallback level: the org's own value, its unit's or the company's. */
  level?: 'org' | 'unit' | 'company'
}

/** One line of the arithmetic. */
export interface CalcStep {
  /** "Bonus = base × target % × funding %". */
  label: string
  /** The numbers put in: "€110,000 × 10% × 100%". */
  expression: string
  result: number | null
  format: Format
}

/** A calculation card (docs/PLAN.md 9.5). */
export interface CalcSpec {
  /** "September cost, P-1042 (band estimate)". */
  title: string
  /** "FY27 Working · daily proration · plan rates". */
  subtitle?: string
  metricId: string
  value: number | null
  format: Format
  inputs: readonly CalcInput[]
  /** The last step's result is `value` (tested). */
  steps: readonly CalcStep[]
  /**
   * "Show the n records". Counted cards: rows.length = value. Weighted and band cards: Σ counts-as
   * (`DrillSpec.weight`) = value (tested). Cost cards outside HR admin with the switch: no amount
   * column, and the Σ test runs only in HR admin with the switch.
   */
  rows?: DrillSource
  /** The comparison, when the number is a "vs" figure: "vs FY27 Budget". */
  comparison?: { label: string; value: number | null }
  /** "Rounded for display only." */
  note?: string
  uses: readonly FieldRef[]
}

/** A card, or a function that builds it on click (cards are built only when someone opens one). */
export type CalcSource = CalcSpec | (() => CalcSpec | null) | null | undefined

declare module '@/charts/types' {
  interface CalcRegistry {
    source: CalcSource
  }
}

/** The card behind a source, or null. */
export function resolveCalc(src: CalcSource): CalcSpec | null {
  if (!src) return null
  return typeof src === 'function' ? src() : src
}

/** What `costCalc` builds a cost card from: one figure's guard output and the row the card is for. */
export interface CostCalcInput {
  title: string
  subtitle?: string
  metricId: string
  /** The figure's guard output (`guardModel`): the card shows exactly its amounts. */
  figure: GuardedFigure
  /** The row of the figure the card explains; the figure's total when not given. */
  row?: CostRow
  comparison?: { label: string; value: number | null }
  /** The positions behind the amount, with no amount column outside HR admin with the switch. */
  rows?: DrillSource
  note?: string
  uses: readonly FieldRef[]
}

/* ───────────── checks ───────────── */

const MONEY: ReadonlySet<Format> = new Set<Format>(['money', 'moneyFull', 'moneyM'])

/** A money format (the card's amounts are summed to the cent). */
export const isMoneyFormat = (f: Format): boolean => MONEY.has(f)

/**
 * Two results agree: both null, or both numbers within half a cent for money and within a
 * billionth (relative) otherwise. Engines round nothing, so a card's last step and its value come
 * from the same arithmetic and agree to the float.
 */
export function sameResult(a: number | null, b: number | null, format: Format): boolean {
  if (a == null || b == null) return a == null && b == null
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false
  const tol = isMoneyFormat(format) ? 0.005 : 1e-9 * Math.max(1, Math.abs(a), Math.abs(b))
  return Math.abs(a - b) <= tol
}

/** The card's last step, or null when it has none. */
export const lastStep = (spec: Pick<CalcSpec, 'steps'>): CalcStep | null => spec.steps.at(-1) ?? null

/** What the card's arithmetic ends on: its last step's result (null without steps). */
export const calcResult = (spec: Pick<CalcSpec, 'steps'>): number | null => lastStep(spec)?.result ?? null

/** What one row of a card's records counts as: its weight, when the drill is weighted. */
type Weighing = { rows: readonly unknown[]; weight?: (row: never) => number }

/** Σ of a weighted drill's weights, summed in row order. */
export function weightSum(spec: Weighing): number | null {
  if (!spec.weight) return null
  const w = spec.weight as (row: unknown) => number
  let sum = 0
  for (const r of spec.rows) sum += w(r)
  return sum
}

/** The records behind a card, or null (a source that throws reads as none: the card still renders). */
function cardRows(src: DrillSource) {
  if (!src) return null
  try {
    return typeof src === 'function' ? src() : src
  } catch {
    return null
  }
}

/**
 * What breaks the card's rules, one sentence each (empty when it holds): the last step's result is
 * not `value`; a counted card's rows do not number `value`; a weighted or band card's weights do not
 * add up to it. A card whose rows carry no weight and whose format is money is a cost card: its rows
 * are not summed. For tests and the contract checks.
 */
export function calcProblems(spec: CalcSpec): string[] {
  const out: string[] = []
  const last = lastStep(spec)
  if (!last) out.push(`${spec.title}: the card has no steps.`)
  else if (!sameResult(last.result, spec.value, spec.format))
    out.push(
      `${spec.title}: the last step reads ${String(last.result)}, not the card's value ${String(spec.value)}.`,
    )
  for (const s of spec.steps)
    if (s.result != null && !Number.isFinite(s.result))
      out.push(`${spec.title}: step "${s.label}" is not a number.`)
  const rows = cardRows(spec.rows)
  if (rows && spec.value != null) {
    const sum = weightSum(rows as Weighing)
    if (sum != null) {
      if (!sameResult(sum, spec.value, spec.format))
        out.push(`${spec.title}: the records count as ${sum}, not ${spec.value}.`)
    } else if (!isMoneyFormat(spec.format) && rows.rows.length !== spec.value) {
      out.push(`${spec.title}: ${rows.rows.length} records behind a count of ${spec.value}.`)
    }
  }
  return out
}

/* ───────────── the arithmetic as written ───────────── */

/** Money signs and codes a step's expression may carry ("€110,000", "NT$4,175,000", "₹3,580,000"). */
const CURRENCY = /NT\$|US\$|C\$|A\$|S\$|[$€£¥₹₪₩]|\b(?:USD|EUR|GBP|INR|ILS|TWD|JPY|CAD|SGD|KRW|CNY)\b/g

/**
 * The value of a step's expression when it is plain arithmetic: numbers (with thousands commas and
 * money signs, "%" for a fraction), "+", "-" or "−", "×" or "*", "÷" or "/", and parentheses. Null
 * when it holds words or a "—" (a hidden amount), so a card's prose steps are simply not checked.
 * Tests use it to prove a fixture's expression reads to its result.
 *
 *   evaluateExpression('€110,000 × 10% × 100%')   // 11000
 */
export function evaluateExpression(expression: string): number | null {
  const text = expression.replace(CURRENCY, '').replace(/−/g, '-').replace(/[×*]/g, '*').replace(/÷/g, '/')
  if (/[^\d.,%+\-*/()\s]/.test(text)) return null
  const tokens: (number | string)[] = []
  const re = /\s*(?:(\d[\d,]*(?:\.\d+)?|\.\d+)(%?)|([+\-*/()]))/y
  let i = 0
  const src = text.trim()
  while (i < src.length) {
    re.lastIndex = i
    const m = re.exec(src)
    if (!m) return null
    i = re.lastIndex
    if (m[1] !== undefined) {
      const n = Number(m[1].replace(/,/g, ''))
      if (!Number.isFinite(n)) return null
      tokens.push(m[2] ? n / 100 : n)
    } else tokens.push(m[3])
    while (i < src.length && src[i] === ' ') i++
  }
  let p = 0
  const peek = () => tokens[p]
  const expr = (): number | null => {
    let v = term()
    while (v != null && (peek() === '+' || peek() === '-')) {
      const op = tokens[p++]
      const r = term()
      if (r == null) return null
      v = op === '+' ? v + r : v - r
    }
    return v
  }
  const term = (): number | null => {
    let v = factor()
    while (v != null && (peek() === '*' || peek() === '/')) {
      const op = tokens[p++]
      const r = factor()
      if (r == null) return null
      v = op === '*' ? v * r : v / r
    }
    return v
  }
  const factor = (): number | null => {
    const t = tokens[p++]
    if (typeof t === 'number') return t
    if (t === '-') {
      const v = factor()
      return v == null ? null : -v
    }
    if (t === '(') {
      const v = expr()
      if (tokens[p++] !== ')') return null
      return v
    }
    return null
  }
  if (!tokens.length) return null
  const v = expr()
  return p === tokens.length && v != null && Number.isFinite(v) ? v : null
}

/* ───────────── cost cards from the guard ───────────── */

const usd = (v: number | null | undefined): string =>
  v == null ? '—' : `$${Math.round(v).toLocaleString('en-US')}`

const COMPONENT_WORD = {
  base: 'Base',
  bonus: 'Bonus',
  burden: 'Burden',
  benefits: 'Benefits',
  oneTime: 'One-time',
  vacancy: 'Vacancy allowance',
} as const
type ShownComponent = keyof typeof COMPONENT_WORD

/**
 * A cost card under the figure's guard mode (docs/PLAN.md 9.5): 'rounded' lists each atom's rounded
 * filled and band parts, the `sumRounded` step and the Rounding step; 'exact' the shown groups (5 or
 * more each) and Other; 'open' the exact sum; 'none' no amount at all (a card of heads). The last
 * step's result is the row's shown loaded total.
 *
 * Every amount on the card is one the guard already shows: the row's total, its filled and band
 * parts, its components only where the guard shows them (never in rounded modes, where the figure
 * carries no component amounts), and the figure's shown rows. Nothing is computed from members or
 * engine totals here, so a card can never show more than the figure it explains.
 */
export function costCalc(input: CostCalcInput): CalcSpec {
  const { figure } = input
  const row = input.row ?? figure.total
  const isTotal = row === figure.total
  const base = {
    title: input.title,
    ...(input.subtitle ? { subtitle: input.subtitle } : {}),
    metricId: input.metricId,
    format: 'money' as Format,
    ...(input.comparison ? { comparison: input.comparison } : {}),
    ...(input.rows ? { rows: input.rows } : {}),
    uses: input.uses,
  }
  const notes = [input.note, figure.note, row.reason ?? figure.reason].filter((n): n is string => !!n)
  const note = notes.length ? [...new Set(notes)].join(' ') : undefined
  const people: CalcInput = {
    label: 'Costed people',
    value: row.costed,
    format: 'int',
    source: 'Positions costed in the window (Filled seats and accepted offers)',
  }

  // Manager mode: no amount of any kind (7.6): the card says what it counts, in heads.
  if (figure.mode === 'none')
    return {
      ...base,
      format: 'int',
      value: null,
      inputs: [people],
      steps: [
        {
          label: 'Amounts are not shown in this mode',
          expression: 'Heads only',
          result: null,
          format: 'int',
        },
      ],
      ...(note ? { note } : {}),
    }

  // Hidden: under the minimum, or the mode or a filter keeps cost off. The card says why, with no amount.
  if (row.totalUsd == null) {
    const why = row.reason ?? figure.reason ?? 'Hidden'
    return {
      ...base,
      value: null,
      inputs: [people],
      steps: [{ label: why, expression: '—', result: null, format: 'money' }],
      ...(note ? { note } : {}),
    }
  }

  const steps: CalcStep[] = []
  const inputs: CalcInput[] = [people]

  if (figure.mode === 'rounded') {
    // Each atom's filled and band part rounded down on its own, then added with `sumRounded`, at the
    // step in force (`cost.guard.floorUsd`, raise only; $100,000 unless raised).
    const step = figure.step ?? 100_000
    const stepM = `$${+(step / 1_000_000).toFixed(3)}M`
    const parts =
      isTotal && figure.parts ? Object.entries(figure.parts).sort(([a], [b]) => a.localeCompare(b)) : []
    for (const [key, v] of parts) {
      const [atom, part] = key.split('|')
      inputs.push({
        label: `${atom}, ${part === 'band' ? 'Open and Planned at band estimate' : 'filled part'}, rounded down`,
        value: v,
        format: 'money',
        source: `Cost atom at the last month close, rounded down to ${stepM}`,
      })
    }
    const added = row.added ?? 0
    const partsSum = row.totalUsd - added
    steps.push({
      label: `Each of the ${row.parts ?? parts.length} parts rounded down to ${stepM}, then added`,
      expression: parts.length ? parts.map(([, v]) => usd(v)).join(' + ') : `${row.parts ?? 0} rounded parts`,
      result: partsSum,
      format: 'money',
    })
    steps.push({
      label: `Rounding: one step for every two parts of ${stepM} or more`,
      expression: `${Math.round(added / step)} × ${usd(step)}`,
      result: added,
      format: 'money',
    })
    steps.push({
      label: 'Loaded cost, rounded',
      expression: `${usd(partsSum)} + ${usd(added)}`,
      result: row.totalUsd,
      format: 'money',
    })
    if (row.bandUsd != null)
      inputs.push({
        label: 'Open and Planned at band estimate (rounded parts, included above)',
        value: row.bandUsd,
        format: 'money',
        source: 'Band midpoint × FTE with standard loads, plan rates',
      })
    return { ...base, value: row.totalUsd, inputs, steps, ...(note ? { note } : {}) }
  }

  // Exact (Finance, HR admin with the switch off) and open (HR admin with the switch on).
  const a = row.amounts
  const shown = (Object.keys(COMPONENT_WORD) as ShownComponent[]).filter((k) => a[k] != null)
  const filled = a.loaded
  if (!row.componentsHidden && shown.length === Object.keys(COMPONENT_WORD).length && filled != null) {
    for (const k of shown)
      inputs.push({ label: COMPONENT_WORD[k], value: a[k], format: 'money', source: 'Plan lines, USD' })
    steps.push({
      label: 'Filled part = base + bonus + burden + benefits + one-time + vacancy allowance',
      expression: shown.map((k) => usd(a[k])).join(' + '),
      result: filled,
      format: 'money',
    })
  } else if (filled != null) {
    inputs.push({
      label: 'Filled part, loaded',
      value: filled,
      format: 'money',
      source: row.componentsHidden
        ? 'Components hidden (a component has fewer than the minimum)'
        : 'Plan lines, USD',
    })
    steps.push({ label: 'Filled part, loaded', expression: usd(filled), result: filled, format: 'money' })
  }
  if (row.bandUsd != null) {
    inputs.push({
      label: 'Open and Planned at band estimate',
      value: row.bandUsd,
      format: 'money',
      source: 'Band midpoint × FTE with standard loads, plan rates',
    })
    steps.push({
      label: 'Loaded cost = filled part + Open and Planned at band estimate',
      expression: `${usd(filled)} + ${usd(row.bandUsd)}`,
      result: row.totalUsd,
      format: 'money',
    })
  } else if (!steps.length || lastStep({ steps })?.result !== row.totalUsd) {
    steps.push({ label: 'Loaded cost', expression: usd(row.totalUsd), result: row.totalUsd, format: 'money' })
  }
  // The total's own breakdown: the shown groups (5 or more each) and Other, as the figure shows them.
  if (isTotal && figure.rows.length)
    for (const r of figure.rows)
      inputs.push({
        label: r.label,
        value: r.totalUsd,
        format: 'money',
        source: r.isOther ? 'Groups under the minimum, folded' : 'A shown group',
      })
  return { ...base, value: row.totalUsd, inputs, steps, ...(note ? { note } : {}) }
}

/* ───────────── builders for producers ───────────── */

/** One input, with a source. */
export const calcInput = (
  label: string,
  value: CalcInput['value'],
  format: Format,
  source: string,
  level?: CalcInput['level'],
): CalcInput => ({ label, value, format, source, ...(level ? { level } : {}) })

/** One step of the arithmetic. */
export const calcStep = (
  label: string,
  expression: string,
  result: number | null,
  format: Format,
): CalcStep => ({
  label,
  expression,
  result,
  format,
})
