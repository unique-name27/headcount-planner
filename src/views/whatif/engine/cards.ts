/**
 * What if's calculation cards (docs/PLAN.md 9.1, 9.5, 10.6): each result KPI opens its card, built
 * on click. The heads and gap cards are in heads; the cost card follows the difference rule (7.2
 * rule 5): while only band estimates differ it is a band figure and lists each lever's part (the
 * results with the levers up to it, less those before it, so the parts add up to the change); once
 * an HRIS or offer amount differs it shows only what the guard lets through, and no lever's part.
 * The trade card works out the trade rate in standard heads (basis points, never an amount).
 *
 * Every number a card shows is one the KPI already shows or a band figure the mode shows; the last
 * step's result is the KPI's value (src/drill/calc.ts `calcProblems`). Pure.
 */
import type { GuardedDifference } from '@/cost/differences'
import type { FieldRef } from '@/data/quality/fieldRef'
import type { FiscalYear, ISODate } from '@/data/schema'
import { type CalcSpec, calcInput, calcStep } from '@/drill/calc'
import { formatDate } from '@/lib/dates'
import { fmt, plural } from '@/lib/format'
import { SH_BP } from '@/plan/engine/band'
import { standardHeads, type TradeQuote } from '@/plan/engine/trade'
import { ID as REQUESTS_ID } from '@/views/requests/metrics'
import { ID } from '../metrics'

/** Where What if's numbers come from, for a card's sources. */
const SOURCE = 'This What if (levers in this browser tab only, never saved)'

/** What every card of one model shares. */
export interface CardFrame {
  fiscalYear: FiscalYear
  /** "Silicon Engineering". */
  scopeLabel: string
  targetDate: ISODate
  uses: (metricId: string) => readonly FieldRef[]
}

/** The heads change: asks at the target date with the levers, less without them. */
export function headsCard(
  f: CardFrame,
  before: number,
  delta: number,
  applied: number,
  pendingCounted: number,
): CalcSpec {
  const after = before + delta
  return {
    title: `Heads change from the levers, ${f.scopeLabel}`,
    subtitle: `${f.fiscalYear} Working · asks at ${formatDate(f.targetDate)}`,
    metricId: ID.deltaHeads,
    value: delta,
    format: 'int',
    inputs: [
      calcInput('Levers that apply', applied, 'int', SOURCE),
      calcInput(
        'Pending requests you can see, each counted by its head effect',
        pendingCounted,
        'int',
        'Requests',
      ),
      calcInput(
        `Asks at ${formatDate(f.targetDate)} without the levers`,
        before,
        'int',
        `${f.fiscalYear} Working`,
      ),
      calcInput(`Asks at ${formatDate(f.targetDate)} with the levers`, after, 'int', SOURCE),
    ],
    steps: [
      calcStep(
        'Heads change = asks with the levers − asks without them',
        `${fmt(after, 'int')} − ${fmt(before, 'int')}`,
        delta,
        'int',
      ),
    ],
    note: 'Working with the levers against Working without them, never against the comparison version.',
    uses: f.uses(ID.deltaHeads),
  }
}

/** The gap change in heads: the target stays, so the gap moves by the heads change, the other way. */
export function gapCard(
  f: CardFrame,
  target: { heads: number; label: string } | null,
  deltaHeads: number,
  deltaGap: number | null,
  noTarget: string,
): CalcSpec {
  const base = {
    title: `Gap change from the levers, ${f.scopeLabel}`,
    subtitle: `${f.fiscalYear} · heads at ${formatDate(f.targetDate)}`,
    metricId: ID.deltaGap,
    format: 'int' as const,
    uses: f.uses(ID.deltaGap),
  }
  if (!target || deltaGap == null)
    return {
      ...base,
      value: null,
      inputs: [calcInput('Heads change', deltaHeads, 'int', SOURCE)],
      steps: [calcStep(noTarget, '—', null, 'int')],
    }
  return {
    ...base,
    value: deltaGap,
    inputs: [
      calcInput(`Target heads (${target.label})`, target.heads, 'int', 'Targets'),
      calcInput('Heads change', deltaHeads, 'int', SOURCE),
    ],
    steps: [
      calcStep(
        'Gap change = 0 − heads change (the target stays as it is)',
        `0 − ${fmt(deltaHeads, 'int')}`,
        deltaGap,
        'int',
      ),
    ],
  }
}

/** One lever's part of the cost change (a band figure). */
export interface LeverPart {
  label: string
  usd: number
}

const usd = (v: number): string => fmt(v, 'moneyFull')

/**
 * The cost change: a band figure lists each lever's part and adds them up; a guarded difference
 * that reads "—" says why, with no amount; a guarded difference that shows (5 or more contributors,
 * or HR admin with pay amounts shown) shows its total only.
 */
export function costCard(f: CardFrame, g: GuardedDifference, parts: () => readonly LeverPart[]): CalcSpec {
  const base = {
    title: `Cost change from the levers, ${f.scopeLabel}`,
    subtitle: `${f.fiscalYear} Working · band estimate, in-year from each change's date · plan rates`,
    metricId: ID.deltaCost,
    format: 'money' as const,
    uses: f.uses(ID.deltaCost),
  }
  if (g.value == null)
    return {
      ...base,
      value: null,
      inputs: [],
      steps: [calcStep(g.reason ?? 'Hidden', '—', null, 'money')],
      ...(g.reason ? { note: g.reason } : {}),
    }
  if (!g.band)
    return {
      ...base,
      value: g.value,
      inputs: [calcInput('Positions whose amount changes', g.contributors, 'int', SOURCE)],
      steps: [calcStep('Cost change', usd(g.value), g.value, 'money')],
    }
  const list = parts()
  const steps = list.map((p, i) => calcStep(`Lever ${i + 1}: ${p.label}`, usd(p.usd), p.usd, 'money'))
  steps.push(
    calcStep(
      list.length ? 'Cost change = the levers’ parts added' : 'No lever changes cost',
      list.length ? list.map((p) => usd(p.usd)).join(' + ') : usd(0),
      g.value,
      'money',
    ),
  )
  return {
    ...base,
    value: g.value,
    inputs: [
      calcInput('Levers that apply', list.length, 'int', SOURCE),
      calcInput(
        'Priced at',
        'Band midpoint × FTE with standard loads, no equity',
        'text',
        `${f.fiscalYear} Working assumptions, plan rates`,
      ),
    ],
    steps,
    note: 'Only band estimates change, so this shows with no count of people. Filled seats keep their HRIS pay.',
  }
}

/** A trade lever's rate: the standard heads given (credit used included) ÷ one wanted seat's. */
export function tradeCard(
  f: CardFrame,
  lever: number,
  label: string,
  quote: TradeQuote,
  wantBp: number | null,
): CalcSpec {
  const base = {
    title: `Trade rate, lever ${lever + 1}`,
    subtitle: label,
    metricId: REQUESTS_ID.tradeRatio,
    format: 'num2' as const,
    uses: f.uses(REQUESTS_ID.tradeRatio),
  }
  const inputs = [
    calcInput('Standard heads given, credit used included', quote.giveBp / SH_BP, 'num2', 'Trade rates'),
    calcInput(
      'Standard heads of one wanted seat',
      wantBp == null ? null : wantBp / SH_BP,
      'num2',
      'Trade rates',
    ),
  ]
  if (!quote.ok || wantBp == null || wantBp <= 0)
    return {
      ...base,
      value: null,
      inputs,
      steps: [calcStep(quote.blocks[0]?.text ?? 'This trade cannot be quoted.', '—', null, 'num2')],
    }
  return {
    ...base,
    value: quote.ratio,
    inputs,
    steps: [
      calcStep(
        'Trade rate = standard heads given ÷ standard heads of one wanted seat',
        `${(quote.giveBp / SH_BP).toFixed(4)} ÷ ${(wantBp / SH_BP).toFixed(4)}`,
        quote.ratio,
        'num2',
      ),
    ],
    note: `Get ${plural(quote.get.length, 'seat')}, ${standardHeads(quote.creditBp)} standard heads left as trade credit.`,
  }
}
