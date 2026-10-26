/**
 * The Plan view's cost (docs/PLAN.md 9.4: Loaded cost YTD against the comparison; cost by unit),
 * every amount through the cost guard (./guarded.ts): Manager mode shows none, HRBP and Leader
 * rounded per cost atom, Finance and HR admin with the switch off exact over 5 or more costed people
 * from the unit's one cost-center fold. A modeled amount opens its calculation card, built from the
 * same guard output (src/drill/calc.ts `costCalc`), never from engine totals.
 */
import type { GuardedDifference } from '@/cost/differences'
import type { CostMember, GuardedFigure } from '@/cost/guard'
import type { FieldRef } from '@/data/quality/fieldRef'
import type { Month } from '@/data/schema'
import { type CalcSpec, calcInput, calcStep, costCalc } from '@/drill/calc'
import { plural } from '@/lib/format'
import { emptyComparisonReason, TARGET_HAS_NO_MONTHS } from '@/plan/engine/variance'
import type { AnyVersion, Position } from '@/plan/types'
import { ID } from '../metrics'
import type { Prep } from './base'
import { shownLines, versionLinesOf } from './core'
import { positionsSpec } from './drill'
import { type DiffSide, guardDelta, guardFigure, membersOf, pooledMembers } from './guarded'
import { FIGURE } from './lineage'

/** A guarded total of a version's lines over a window, with its members (one side of a difference). */
export function sideOf(
  p: Prep,
  v: AnyVersion,
  months: readonly Month[],
  opts: { own?: boolean; label?: string } = {},
): DiffSide {
  const lines = opts.own ? versionLinesOf(p.ctx, v) : shownLines(p.ctx, v)
  const members: CostMember[] = membersOf(p.ctx, lines, months)
  return {
    members,
    figure: guardFigure(p.ctx, {
      members,
      version: v,
      ...(opts.label ? { label: opts.label } : {}),
    }),
  }
}

/** The Plan view's cost figures. */
export interface PlanCost {
  /** Year to date in the shown version (a Working version's closed months are actuals). */
  ytd: DiffSide | null
  /** The comparison's year to date; null for a target comparison. */
  ytdComparison: DiffSide | null
  /** ytd − comparison under rule 5; null with no comparison version. */
  ytdDelta: GuardedDifference | null
  /** Why there is no delta (a target comparison), else null. */
  noDelta: string | null
  /** The period picker's window by unit. */
  byUnit: GuardedFigure | null
}

const memo = new WeakMap<Prep, PlanCost>()

export function planCost(p: Prep): PlanCost {
  const hit = memo.get(p)
  if (hit) return hit
  const v = p.version
  // Cost to date ends at the cost close in rounded modes (7.3b), never the as-of date's open month.
  const ytd = v ? sideOf(p, v, p.costYtdMonths) : null
  const ytdComparison = v && p.comparison ? sideOf(p, p.comparison, p.costYtdMonths) : null
  const yearHasLocked = p.ctx.versions.some((x) => x.state === 'locked' && x.fiscalYear === p.fiscalYear)
  const out: PlanCost = {
    ytd,
    ytdComparison,
    ytdDelta: ytd && ytdComparison ? guardDelta(p.ctx, ytd, ytdComparison) : null,
    noDelta: p.comparison ? null : emptyComparisonReason(p.fiscalYear, yearHasLocked),
    byUnit: v
      ? guardFigure(p.ctx, {
          members: membersOf(p.ctx, shownLines(p.ctx, v), p.windowMonths),
          version: v,
          by: { key: (m) => m.seat.businessUnit, noneLabel: 'No unit', totalShown: true },
        })
      : null,
  }
  memo.set(p, out)
  return out
}

/** A cost card for a guarded figure's total or row (no amount column on its records). */
export function costCard(
  p: Prep,
  input: {
    title: string
    metricId: string
    figure: GuardedFigure
    row?: GuardedFigure['total']
    comparison?: { label: string; value: number | null }
    uses: readonly FieldRef[]
    note?: string
  },
): CalcSpec {
  const row = input.row ?? input.figure.total
  return costCalc({
    title: input.title,
    subtitle: `${p.windowName} · ${p.ctx.scopeLabel}`,
    metricId: input.metricId,
    figure: input.figure,
    row,
    ...(input.comparison ? { comparison: input.comparison } : {}),
    rows: () =>
      row.positionIds.length
        ? positionsSpec(p, `${input.title}: the positions behind it`, row.positionIds, {
            note: 'Positions only: no amount is listed per position.',
          })
        : null,
    uses: input.uses,
    ...(input.note ? { note: input.note } : {}),
  })
}

/**
 * The card of a band figure ("Open and Planned at band estimate", 7.2 rule 3, 9.5 band-estimate
 * cards): the figure's band part alone, which reads no pay, offer or leave. The filled part never
 * shows on it, so nothing on the card moves with a Filled seat's pay or leave. Rounded modes: each
 * team's band part rounded down on its own, then `sumRounded` (the guard's own parts, over the teams
 * of 5 or more costed people); exact modes: the band estimates of the seats the guard keeps, each
 * seat's amount over the window its "Counts as", adding up to the figure.
 */
export function bandCard(
  p: Prep,
  input: {
    title: string
    metricId: string
    figure: GuardedFigure
    /** The figure's members (the guard's pool is read from them). */
    members: readonly CostMember[]
    version: AnyVersion | null
    uses: readonly FieldRef[]
  },
): CalcSpec {
  const fig = input.figure
  const value = fig.total.bandUsd
  const subtitle = `${p.windowName} · ${p.ctx.scopeLabel}`
  const base = { title: input.title, subtitle, metricId: input.metricId, uses: input.uses }
  if (value == null) {
    const why = fig.reason ?? fig.total.reason ?? 'Hidden'
    return {
      ...base,
      value: null,
      format: 'money',
      inputs: [],
      steps: [calcStep(why, '—', null, 'money')],
      note: why,
    }
  }
  const rounded = fig.mode === 'rounded'
  // The band seats the guard keeps: rounded, the atoms it rounds (5 or more costed people); exact,
  // its pool (a unit whose Other is under the minimum is left out).
  let band: CostMember[]
  if (rounded) {
    const kept = new Set(Object.keys(fig.parts ?? {}).map((k) => k.split('|')[0]))
    band = input.members.filter((m) => m.part === 'band' && m.atomId != null && kept.has(m.atomId))
  } else band = pooledMembers(p.ctx, input.members, input.version).filter((m) => m.part === 'band')
  const bySeat = new Map<string, number>()
  for (const m of band) bySeat.set(m.positionId, (bySeat.get(m.positionId) ?? 0) + m.amounts.loaded)
  const ids = [...bySeat.keys()].sort()
  const rows = () =>
    ids.length
      ? positionsSpec(p, `${input.title}: the seats behind it`, ids, {
          note: rounded
            ? 'Open and Planned seats at band estimate, in teams of 5 or more costed people.'
            : 'Each seat counts as its band estimate over the window.',
          ...(rounded ? {} : { weight: (pos: Position) => bySeat.get(pos.positionId) ?? 0 }),
        })
      : null
  const seats = calcInput('Open and Planned seats', ids.length, 'int', 'Seats costed at band estimate')
  if (rounded) {
    const step = p.env.rules.floorUsd
    const parts = Object.entries(fig.parts ?? {})
      .filter(([k]) => k.endsWith('|band'))
      .sort(([a], [b]) => a.localeCompare(b))
    const sum = parts.reduce((a, [, v]) => a + v, 0)
    const added = value - sum
    return {
      ...base,
      value,
      format: 'moneyM',
      inputs: [
        seats,
        ...parts.map(([k, v]) =>
          calcInput(
            `${k.split('|')[0]}, Open and Planned at band estimate, rounded down`,
            v,
            'money',
            'Band midpoint × FTE with standard loads, plan rates, per team',
          ),
        ),
      ],
      steps: [
        calcStep(
          `${parts.length === 1 ? 'The one band part' : `Each of the ${parts.length} band parts`} rounded down to ${usd(step)}, then added`,
          parts.length ? parts.map(([, v]) => usd(v)).join(' + ') : 'No team of 5 or more costed people',
          sum,
          'money',
        ),
        calcStep(
          `Rounding: one step for every two parts of ${usd(step)} or more`,
          `${Math.round(added / step)} × ${usd(step)}`,
          added,
          'money',
        ),
        calcStep('Open and Planned at band estimate, rounded', `${usd(sum)} + ${usd(added)}`, value, 'money'),
      ],
      rows,
      note: 'Band estimates read no one’s pay. The filled part is a separate line.',
    }
  }
  return {
    ...base,
    value,
    format: 'money',
    inputs: [seats],
    steps: [
      calcStep(
        'Σ band estimate ÷ 12 × active fraction over the seats',
        plural(ids.length, 'seat'),
        value,
        'money',
      ),
    ],
    rows,
    note: 'Band estimates read no one’s pay. The filled part is a separate line.',
  }
}

/**
 * The card of a displayed difference (7.2 rule 5): the two guarded totals, the contributors and the
 * difference, or the reason it reads "—".
 */
export function differenceCard(
  p: Prep,
  input: {
    title: string
    metricId: string
    a: GuardedFigure
    b: GuardedFigure | null
    aLabel: string
    bLabel: string
    delta: GuardedDifference | null
    noDelta?: string | null
    uses: readonly FieldRef[]
  },
): CalcSpec {
  const av = input.a.total.totalUsd
  const bv = input.b?.total.totalUsd ?? null
  const d = input.delta
  const why = d?.reason ?? input.noDelta ?? (input.b ? null : TARGET_HAS_NO_MONTHS)
  // The contributor count shows with the difference only: a count of 1 to 4 behind a "—" would say
  // how many costed positions changed (7.2 rule 5).
  const inputs = [
    calcInput(input.aLabel, av, 'money', 'The cost guard: the shown total'),
    calcInput(input.bLabel, bv, 'money', 'The cost guard: the comparison total'),
    ...(d && !d.band
      ? [
          calcInput(
            'Positions whose cost differs',
            d.value != null ? d.contributors : null,
            'int',
            'Costed positions only',
          ),
        ]
      : []),
  ]
  const steps =
    d?.value != null
      ? [
          calcStep(
            d.band ? 'Difference (band estimates only)' : 'Difference = shown − comparison',
            `${usd(av)} − ${usd(bv)}`,
            d.value,
            'money',
          ),
        ]
      : [calcStep(why ?? 'Hidden', '—', null, 'money')]
  return {
    title: input.title,
    subtitle: `${p.windowName} · ${p.ctx.scopeLabel}`,
    metricId: input.metricId,
    value: d?.value ?? null,
    format: 'money',
    inputs,
    steps,
    ...(input.b ? { comparison: { label: input.bLabel, value: bv } } : {}),
    ...(why ? { note: why } : {}),
    uses: input.uses,
  }
}

const usd = (v: number | null): string => (v == null ? '—' : `$${Math.round(v).toLocaleString('en-US')}`)

/** The cost tile's lineage. */
export const COST_USES = FIGURE.cost
export const COST_METRIC = ID.costLoaded
