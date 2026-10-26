/**
 * The Forecast view's tiles (docs/PLAN.md 9.4): Overview's six (year-end heads forecast against the
 * target, full-year cost forecast against the comparison, expected starts, modeled exits, unfilled
 * at horizon, exit run rate; HRBP and Leader see five, since the exit run rate is Finance's), the
 * "Cost vs target" tile the Leader home re-links, the variance strip and the bridge's FX effect (for
 * the period, and year to date for the Finance home). Weighted numbers drill to positions whose
 * "Counts as" adds up to the value; modeled ones open a calculation card; cost tiles' cards come from
 * the guard's output. Pure.
 *
 * Readings taken here (finance-guard fix, M2 review):
 *  - A leader's org compares its year-end heads with a target whose org holds the leader's own seat
 *    (the leader-keyed target's org, or the unit the seat heads), so the year-end heads compared
 *    with it count the root seats too, as rounded cost already does (review RC-3): heads vs target,
 *    cost vs target and Targets > Gap then cover one org, the HRBP's and HR admin's.
 *  - "Cost vs target" keeps the guard's note beside the target's (review RC-4): the forecast leaves
 *    out the people in groups under 5 while the target counts them, and its delta card says so.
 */
import { kpisInMode } from '@/access/numbers'
import type { Kpi } from '@/components/types'
import { NO_AMOUNTS_NOTE } from '@/cost/fit'
import { hiddenNote, SHOWS_IN_FINANCE_NOTE } from '@/cost/guard'
import { targetCompareLabel } from '@/data/context'
import type { Month } from '@/data/schema'
import { type CalcSpec, calcInput, calcStep } from '@/drill/calc'
import { subtitleOf } from '@/drill/subtitle'
import type { DrillSpec } from '@/drill/types'
import { fmt, plural } from '@/lib/format'
import {
  ACCURACY_COMPANY_NOTE,
  type AccuracyMonth,
  type ForecastAccuracy,
  forecastAccuracyOf,
  NO_ACCURACY_TEXT,
} from '@/views/finance/engine/accuracy'
import { monthLabel } from '@/views/plan/engine/base'
import { costCard, differenceCard } from '@/views/plan/engine/cost'
import { monthEndLine, positionsSpec } from '@/views/plan/engine/drill'
import { tagKpis } from '@/views/plan/engine/drillUses'
import { openingsOf } from '@/views/plan/engine/openings'
import { ID } from '../metrics'
import type { FPrep } from './base'
import { fxEffectOf } from './bridge'
import { forecastCost } from './cost'
import { forecastFlows, forecastHeads, sumBySeat } from './heads'
import { FIGURE } from './lineage'
import { rootSeatsCounted, scopeTargetOf } from './target'
import { rowKey, varianceTable } from './variance'

const money = (p: FPrep) => (p.env.mode === 'rounded' ? ('moneyM' as const) : ('money' as const))
const shown = (p: FPrep, kpis: Kpi[]): Kpi[] => tagKpis(kpisInMode(p.ctx.access, kpis))

/** Weighted positions: each counts as its value; only seats that count. */
function weighted(
  p: FPrep,
  title: string,
  by: ReadonlyMap<string, number>,
  note: string,
  subtitle?: string,
): DrillSpec<'positions'> {
  const ids = [...by]
    .filter(([, v]) => Math.abs(v) > 1e-12)
    .map(([id]) => id)
    .sort()
  return positionsSpec(p, title, ids, {
    weight: (pos) => by.get(pos.positionId) ?? 0,
    note,
    ...(subtitle ? { subtitle } : {}),
  })
}

/** The last month of the fiscal year. */
const lastOf = (p: FPrep): Month => p.fyMonths[p.fyMonths.length - 1]

/* ───────────── year-end heads ───────────── */

export function yearEndHeads(p: FPrep): {
  value: number | null
  bySeat: ReadonlyMap<string, number>
  /** The leader's own seats' expected heads counted beside the scope's (RC-3), else 0. */
  own: number
} {
  if (!p.run) return { value: null, bySeat: new Map(), own: 0 }
  const h = forecastHeads(p)
  const last = lastOf(p)
  const scope = h.heads.get(last) ?? 0
  const roots = rootSeatsCounted(p)
  if (!roots.size) return { value: scope, bySeat: h.bySeat.get(last) ?? new Map(), own: 0 }
  // The target's org holds the leader's own seat: count its expected heads beside the scope's.
  const bySeat = new Map(h.bySeat.get(last) ?? [])
  let own = 0
  for (const l of p.run.lines)
    if (l.month === last && roots.has(l.positionId) && l.heads !== 0) {
      own += l.heads
      bySeat.set(l.positionId, (bySeat.get(l.positionId) ?? 0) + l.heads)
    }
  return { value: scope + own, bySeat, own }
}

export function yearEndTile(p: FPrep): Kpi {
  const y = yearEndHeads(p)
  const target = scopeTargetOf(p)
  const last = lastOf(p)
  const label = target?.label ?? targetCompareLabel(p.fiscalYear)
  return {
    id: 'year-end-heads',
    metricId: ID.headsYearEnd,
    label: 'Year-end heads forecast',
    value: y.value,
    format: 'num1',
    delta: y.value != null && target ? y.value - target.heads : null,
    deltaLabel: `vs ${label}`,
    goodDirection: null,
    note: target
      ? `Target ${plural(target.heads, 'head')}${rootSeatsCounted(p).size ? ', your own seat counted in both' : ''}`
      : 'No target for this scope',
    formula: `Expected heads at the ${monthLabel(last)} month-end: the scope's seats' heads, probability-weighted.`,
    tab: 'overview',
    definition: p.text(ID.headsYearEnd),
    calc: () => yearEndCard(p),
    ...(target
      ? {
          deltaDrill: (): DrillSpec<'targets'> => ({
            kind: 'targets',
            title: `${label} for this scope`,
            subtitle: subtitleOf(p.fiscalYear, p.ctx.scopeLabel),
            rows: target.drillRows,
          }),
        }
      : {}),
    uses: p.uses(FIGURE.yearEnd),
  }
}

/** The year-end heads card: the heads now, the year's flows, and timing, down to the figure. */
function yearEndCard(p: FPrep): CalcSpec {
  const y = yearEndHeads(p)
  const flows = forecastFlows(p)
  const h = forecastHeads(p)
  const from = p.actualThrough
  const startHeads = from ? (h.heads.get(from) ?? 0) : 0
  let starts = 0
  let known = 0
  let modeled = 0
  let backfills = 0
  for (const m of p.projected) {
    const f = flows.get(m)
    if (!f) continue
    starts += f.starts
    known += f.knownExits
    modeled += f.modeledExits
    backfills += f.modeledBackfills
  }
  const value = y.value
  const sum = startHeads + starts - known - modeled + backfills
  const timing = value == null ? 0 : value - y.own - sum
  const at = from ? monthLabel(from) : 'the last close'
  return {
    title: 'Year-end heads forecast',
    subtitle: subtitleOf(`${monthLabel(lastOf(p))} month-end`, p.ctx.scopeLabel, p.working?.name),
    metricId: ID.headsYearEnd,
    value,
    format: 'num1',
    inputs: [
      calcInput(`Heads at the ${at} month-end`, startHeads, 'num1', 'Closes (actual heads in plan seats)'),
      calcInput(
        'Expected starts',
        starts,
        'num1',
        'Open and Planned seats × fill rate; accepted offers count 1',
      ),
      calcInput('Known exits', known, 'int', 'Last days in HRIS'),
      calcInput('Modeled exits', modeled, 'num2', 'Attrition, monthly rate on each cohort'),
      calcInput('Modeled backfills', backfills, 'num2', 'Modeled exits × backfill rate, after the lag'),
    ],
    steps: [
      calcStep(
        'Heads, starts and exits',
        `${fmt(startHeads, 'num1')} + ${fmt(starts, 'num2')} − ${fmt(known, 'int')} − ${fmt(modeled, 'num2')} + ${fmt(backfills, 'num2')}`,
        sum,
        'num1',
      ),
      calcStep(
        'Timing within months (a start or exit counts from the month after)',
        fmt(timing, 'num2'),
        timing,
        'num2',
      ),
      ...(y.own
        ? [
            calcStep('Your own seat, as the target counts it', fmt(y.own, 'num2'), y.own, 'num2'),
            calcStep(
              'Year-end heads forecast',
              `${fmt(sum, 'num2')} + ${fmt(timing, 'num2')} + ${fmt(y.own, 'num2')}`,
              value,
              'num1',
            ),
          ]
        : [
            calcStep(
              'Year-end heads forecast',
              `${fmt(sum, 'num2')} + ${fmt(timing, 'num2')}`,
              value,
              'num1',
            ),
          ]),
    ],
    rows: () =>
      weighted(
        p,
        'Year-end heads forecast by seat',
        y.bySeat,
        'Each seat counts as its expected heads at the year end.',
        monthEndLine(p.ctx, lastOf(p), p.working?.name),
      ),
    ...(scopeTargetOf(p)
      ? { comparison: { label: scopeTargetOf(p)?.label ?? '', value: scopeTargetOf(p)?.heads ?? null } }
      : {}),
    uses: p.uses(FIGURE.yearEnd),
  }
}

/* ───────────── cost ───────────── */

export function fullYearTile(p: FPrep): Kpi {
  const c = forecastCost(p)
  const fig = c.fullYear?.figure ?? null
  const value = fig?.total.totalUsd ?? null
  const target = scopeTargetOf(p)
  const vsTarget = !p.comparison
  const delta = vsTarget ? c.vsTarget : (c.delta?.value ?? null)
  const deltaLabel = vsTarget ? `vs ${target?.label ?? targetCompareLabel(p.fiscalYear)}` : p.vs
  const reason = fig?.reason ?? fig?.total.reason ?? (fig ? null : 'No forecast for this fiscal year.')
  return {
    id: 'cost-full-year',
    metricId: ID.costFullYear,
    label: 'Full-year cost forecast',
    value,
    format: money(p),
    delta,
    deltaLabel,
    goodDirection: 'down',
    note: fig?.note ?? `${p.fiscalYear}, closed months actual`,
    ...(value == null ? { suppressed: true, ...(reason ? { suppressedNote: reason } : {}) } : {}),
    formula: `Closed months' actual loaded cost + open months' forecast loaded cost, ${p.fiscalYear}.`,
    tab: 'overview',
    definition: p.text(ID.costFullYear),
    ...(fig
      ? {
          calc: () =>
            costCard(p, {
              title: `Full-year cost forecast, ${p.fiscalYear}`,
              metricId: ID.costFullYear,
              figure: fig,
              ...(c.comparison
                ? { comparison: { label: p.vs, value: c.comparison.figure.total.totalUsd } }
                : {}),
              uses: p.uses(FIGURE.cost),
            }),
          deltaCalc: () =>
            vsTarget
              ? targetCard(p, value, target?.cost ?? null, delta, fig?.note ?? null)
              : differenceCard(p, {
                  title: `Full-year cost forecast ${p.vs}`,
                  metricId: ID.costFullYear,
                  a: fig,
                  b: c.comparison?.figure ?? null,
                  aLabel: `${p.fiscalYear} forecast`,
                  bLabel: p.comparison?.name ?? 'Comparison',
                  delta: c.delta,
                  noDelta: c.noDelta,
                  uses: p.uses(FIGURE.cost),
                }),
        }
      : {}),
    uses: p.uses(FIGURE.cost),
  }
}

/**
 * Forecast against the target cost (an input): the shown forecast less the target. `note` is the
 * guard's note on the forecast (in rounded modes "n people in groups under 5 are left out": the
 * forecast leaves them out and the target counts them, RC-4).
 */
function targetCard(
  p: FPrep,
  value: number | null,
  target: number | null,
  delta: number | null,
  note: string | null = null,
): CalcSpec {
  const label = scopeTargetOf(p)?.label ?? targetCompareLabel(p.fiscalYear)
  const leftOut = note ? `${note}; the target counts them.` : null
  return {
    title: `Full-year cost forecast vs ${label}`,
    subtitle: subtitleOf(p.fiscalYear, p.ctx.scopeLabel),
    metricId: ID.costFullYear,
    value: delta,
    format: money(p),
    inputs: [
      calcInput('Full-year cost forecast', value, 'money', 'The cost guard: the shown total'),
      calcInput(
        p.env.mode === 'rounded' ? 'Target cost, rounded down to $0.1M' : 'Target cost',
        target,
        'money',
        'Targets (Finance)',
      ),
    ],
    steps:
      delta != null
        ? [calcStep('Forecast − target', `${usdText(value)} − ${usdText(target)}`, delta, 'money')]
        : [
            calcStep(
              target == null ? 'No target cost for this scope' : 'The forecast is hidden',
              '—',
              null,
              'money',
            ),
          ],
    ...(leftOut ? { note: leftOut } : {}),
    uses: p.uses(FIGURE.cost),
  }
}

const usdText = (v: number | null) => (v == null ? '—' : `$${Math.round(v).toLocaleString('en-US')}`)

/** The forecast's full-year cost against the target cost, which the Leader home re-links (9.3). */
export function costVsTargetTile(p: FPrep): Kpi | null {
  if (p.env.mode === 'none') return null
  const c = forecastCost(p)
  const fig = c.fullYear?.figure ?? null
  const value = fig?.total.totalUsd ?? null
  const target = scopeTargetOf(p)
  const label = target?.label ?? targetCompareLabel(p.fiscalYear)
  return {
    id: 'cost-vs-target',
    metricId: ID.costFullYear,
    label: 'Cost vs target',
    value,
    format: money(p),
    delta: c.vsTarget,
    deltaLabel: `vs ${label}`,
    goodDirection: 'down',
    // The guard's note stays beside the target's (RC-4): the forecast leaves people out, the target does not.
    note: [
      fig?.note,
      target?.cost != null ? `Target cost of ${p.fiscalYear}` : 'No target cost for this scope',
    ]
      .filter(Boolean)
      .join('. '),
    ...(value == null ? { suppressed: true, ...(fig?.reason ? { suppressedNote: fig.reason } : {}) } : {}),
    formula: `The full-year cost forecast against the ${label}'s cost.`,
    link: { view: 'forecast', tab: 'overview', label: 'Forecast, Overview' },
    definition: p.text(ID.costFullYear),
    ...(fig
      ? {
          calc: () =>
            costCard(p, {
              title: `Full-year cost forecast, ${p.fiscalYear}`,
              metricId: ID.costFullYear,
              figure: fig,
              ...(target?.cost != null ? { comparison: { label: `vs ${label}`, value: target.cost } } : {}),
              uses: p.uses(FIGURE.cost),
            }),
          deltaCalc: () => targetCard(p, value, target?.cost ?? null, c.vsTarget, fig?.note ?? null),
        }
      : {}),
    ...(target
      ? {
          deltaDrill: (): DrillSpec<'targets'> => ({
            kind: 'targets',
            title: `${label} for this scope`,
            subtitle: subtitleOf(p.fiscalYear, p.ctx.scopeLabel),
            rows: target.drillRows,
          }),
        }
      : {}),
    uses: p.uses(FIGURE.cost),
  }
}

export function runRateTile(p: FPrep): Kpi {
  const c = forecastCost(p)
  const last = lastOf(p)
  const r = c.runRate
  const t = c.lastMonth?.total ?? null
  return {
    id: 'exit-run-rate',
    metricId: ID.costExitRunRate,
    label: 'Exit run rate',
    value: r.value,
    format: money(p),
    goodDirection: 'down',
    note: `${monthLabel(last)} × 12, no one-time items`,
    ...(r.value == null ? { suppressed: true, ...(r.reason ? { suppressedNote: r.reason } : {}) } : {}),
    formula: `(${monthLabel(last)} loaded cost − its one-time items) × 12.`,
    definition: p.text(ID.costExitRunRate),
    calc: (): CalcSpec => ({
      title: 'Exit run rate',
      subtitle: subtitleOf(monthLabel(last), p.ctx.scopeLabel, p.working?.name),
      metricId: ID.costExitRunRate,
      value: r.value,
      format: money(p),
      inputs:
        r.value != null && t
          ? [
              calcInput(
                `${monthLabel(last)} filled part, loaded`,
                t.amounts.loaded,
                'money',
                'The cost guard',
              ),
              calcInput(`${monthLabel(last)} one-time items`, t.amounts.oneTime, 'money', 'The cost guard'),
              calcInput(
                `${monthLabel(last)} Open and Planned at band estimate`,
                t.bandUsd ?? 0,
                'money',
                'Band estimates',
              ),
            ]
          : [],
      steps:
        r.value != null && t
          ? [
              calcStep(
                'Recurring month = loaded − one-time + band',
                `${usdText(t.amounts.loaded)} − ${usdText(t.amounts.oneTime)} + ${usdText(t.bandUsd ?? 0)}`,
                r.value / 12,
                'money',
              ),
              calcStep(
                'Exit run rate = recurring month × 12',
                `${usdText(r.value / 12)} × 12`,
                r.value,
                'money',
              ),
            ]
          : [calcStep(r.reason ?? 'Hidden', '—', null, 'money')],
      uses: p.uses(FIGURE.cost),
    }),
    uses: p.uses(FIGURE.cost),
  }
}

/* ───────────── starts, exits, unfilled ───────────── */

export function startsTile(p: FPrep): Kpi {
  const flows = forecastFlows(p)
  const by = sumBySeat(flows, p.windowMonths, (f) => f.startSeats)
  let value = 0
  for (const v of by.values()) value += v
  return {
    id: 'starts',
    metricId: ID.startsExpected,
    label: 'Expected starts',
    value: p.run ? value : null,
    format: 'num1',
    goodDirection: null,
    note: `${p.windowName}: hires in closed months, then expected starts`,
    formula: `Σ fill rate over openings starting in the window, accepted offers counting 1, ${p.windowName}.`,
    tab: 'overview',
    definition: p.text(ID.startsExpected),
    drill: () =>
      weighted(
        p,
        'Expected starts',
        by,
        'Each seat counts as its probability of starting in the window (a hire counts 1).',
      ),
    uses: p.uses(FIGURE.starts),
  }
}

export function exitsTile(p: FPrep): Kpi {
  const flows = forecastFlows(p)
  const by = sumBySeat(flows, p.windowMonths, (f) => f.exitSeats)
  let value = 0
  for (const v of by.values()) value += v
  return {
    id: 'modeled-exits',
    metricId: ID.exitsModeled,
    label: 'Modeled exits',
    value: p.run ? value : null,
    format: 'num1',
    goodDirection: null,
    note: `${p.windowName}; named exits are never predicted`,
    formula: `Σ cohort heads at each month's start × the monthly attrition rate, less known exits, ${p.windowName}.`,
    tab: 'overview',
    definition: p.text(ID.exitsModeled),
    drill: () =>
      weighted(
        p,
        'Modeled exits',
        by,
        "Each seat counts as its holder's or opening's modeled exits in the window.",
      ),
    uses: p.uses(FIGURE.exits),
  }
}

/** Each seat's unfilled part at the horizon: 1 − fill rate of its expected start, 1 for an opening a freeze holds throughout. */
export function unfilledBySeat(p: FPrep): Map<string, number> {
  const out = new Map<string, number>()
  if (!p.run) return out
  const ids = p.scope.ids
  for (const [id, starts] of p.run.starts) {
    if (!ids.has(id)) continue
    for (const s of starts) if (s.kind !== 'offer') out.set(id, (out.get(id) ?? 0) + (1 - s.probability))
  }
  for (const o of openingsOf(p).frozen) if (!p.run.starts.has(o.positionId)) out.set(o.positionId, 1)
  return out
}

export function unfilledTile(p: FPrep): Kpi {
  const by = unfilledBySeat(p)
  let value = 0
  for (const v of by.values()) value += v
  const end = p.run ? p.run.months[p.run.months.length - 1] : null
  return {
    id: 'unfilled',
    metricId: ID.startsUnfilled,
    label: 'Unfilled at horizon',
    value: p.run ? value : null,
    format: 'num1',
    goodDirection: 'down',
    note: end ? `By the ${monthLabel(end)} month-end` : 'No forecast',
    formula:
      'Σ (1 − fill rate) over the openings the forecast starts, + 1 for each opening a freeze holds to the end of the grid.',
    tab: 'overview',
    definition: p.text(ID.startsUnfilled),
    drill: () =>
      weighted(
        p,
        'Unfilled at horizon',
        by,
        'Each opening counts as the part the forecast does not expect to fill.',
      ),
    uses: p.uses(FIGURE.starts),
  }
}

/* ───────────── variance strip ───────────── */

export function varianceKpis(p: FPrep): Kpi[] {
  const t = varianceTable(p)
  const cell = (measure: string) =>
    t.rows.find((r) => r.orgKey === 'scope' && r.measure === measure && r.window === 'fy')
  const heads = cell('heads')
  const fte = cell('fte')
  const cost = cell('cost')
  const sides = t.sides.get(rowKey('scope', 'cost', 'fy'))
  const empty = t.empty
  return shown(p, [
    {
      id: 'variance-heads',
      metricId: ID.varianceHeads,
      label: 'Heads variance',
      value: empty ? null : (heads?.variance ?? null),
      format: 'num1',
      goodDirection: null,
      note: empty ?? `Year end ${p.vs}`,
      formula: `Forecast heads at the ${monthLabel(lastOf(p))} month-end − plan heads in ${p.comparison?.name ?? 'the comparison'}.`,
      definition: p.text(ID.varianceHeads),
      calc: () =>
        measureCard(
          p,
          'Heads variance',
          ID.varianceHeads,
          heads?.actual ?? null,
          heads?.comparison ?? null,
          'num1',
        ),
      uses: p.uses(FIGURE.variance),
    },
    {
      id: 'variance-fte',
      metricId: ID.varianceFte,
      label: 'FTE variance',
      value: empty ? null : (fte?.variance ?? null),
      format: 'num1',
      goodDirection: null,
      note: empty ?? `${p.fiscalYear} average ${p.vs}`,
      formula: `Forecast average FTE − ${p.comparison?.name ?? 'the comparison'}'s, ${p.fiscalYear}.`,
      definition: p.text(ID.varianceFte),
      calc: () =>
        measureCard(p, 'FTE variance', ID.varianceFte, fte?.actual ?? null, fte?.comparison ?? null, 'num1'),
      uses: p.uses(FIGURE.variance),
    },
    {
      id: 'variance-cost',
      metricId: ID.varianceCost,
      label: 'Cost variance',
      value: empty ? null : (cost?.variance ?? null),
      format: money(p),
      goodDirection: 'down',
      note: empty ?? `${p.fiscalYear} ${p.vs}`,
      ...(cost?.variance == null
        ? {
            suppressed: true,
            ...((empty ?? cost?.reason) ? { suppressedNote: empty ?? cost?.reason ?? '' } : {}),
          }
        : {}),
      formula: `Full-year actual and forecast loaded cost − ${p.comparison?.name ?? 'the comparison'}'s. Positive is over.`,
      definition: p.text(ID.varianceCost),
      calc: () =>
        sides
          ? differenceCard(p, {
              title: `Cost variance, ${p.fiscalYear}`,
              metricId: ID.varianceCost,
              a: sides.a.figure,
              b: sides.b.figure,
              aLabel: `${p.fiscalYear} forecast`,
              bLabel: p.comparison?.name ?? 'Comparison',
              delta: sides.delta,
              noDelta: empty ?? cost?.reason ?? null,
              uses: p.uses(FIGURE.variance),
            })
          : measureCard(
              p,
              'Cost variance',
              ID.varianceCost,
              null,
              null,
              money(p),
              empty ?? cost?.reason ?? null,
            ),
      uses: p.uses(FIGURE.variance),
    },
    ...accuracyKpis(p),
  ])
}

/** The months an accuracy figure reads, in words, as Finance > Versions says them: "Jul to Sep 2026". */
const accuracyMonths = (acc: ForecastAccuracy): string => {
  const months = acc.months.map((m) => m.month)
  const first = monthLabel(months[0])
  if (months.length === 1) return first
  const last = monthLabel(months[months.length - 1])
  return first.slice(-4) === last.slice(-4) ? `${first.slice(0, 3)} to ${last}` : `${first} to ${last}`
}

/**
 * Forecast accuracy on Forecast > Variance (docs/PLAN.md 6.9, R14 and section 12: heads in the
 * Forecast view, cost in Forecast and Finance; M4 review SA-1, lead decision D-SPEC): the fiscal
 * year's latest reforecast against the months closed since it locked, through the one engine Finance >
 * Versions reads (src/views/finance/engine/accuracy.ts `forecastAccuracyOf`, its arithmetic
 * src/plan/engine/accuracy.ts `accuracyOf`). A reforecast stores the
 * company's forecast, so both tiles read "—" under a filter or a scope (`ACCURACY_COMPANY_NOTE`). The
 * cost tile is guard class G: 5 or more costed people over the months at Finance's exact rule, no
 * minimum with Show pay amounts on, and hidden by policy in rounded and Manager modes (it reads "—"
 * here too). On Variance, beside the other actual-against-plan figures, so Overview keeps its six
 * key figures (9.4: 5 to 7 on an Overview tab).
 */
export function accuracyKpis(p: FPrep): Kpi[] {
  const { ctx } = p
  const acc = forecastAccuracyOf(ctx, p.fiscalYear)
  const months = acc ? accuracyMonths(acc) : ''
  const note = acc ? `${acc.versionName} against the actual for ${months}` : NO_ACCURACY_TEXT
  const subtitle = acc ? `${acc.versionName} against the actual for ${months} · whole company` : note
  const scoped = ctx.isCompany ? null : ACCURACY_COMPANY_NOTE
  const min = p.env.rules.minCosted
  const costReason = !acc
    ? null
    : p.env.mode === 'none'
      ? NO_AMOUNTS_NOTE
      : p.env.mode === 'rounded'
        ? SHOWS_IN_FINANCE_NOTE
        : (scoped ?? (p.env.mode === 'exact' && acc.costed < min ? hiddenNote(min) : null))
  const headsReason = acc ? scoped : null
  const heads = acc && !headsReason ? acc.heads : null
  const cost = acc && !costReason ? acc.cost : null
  const card = (
    title: string,
    metricId: string,
    value: number | null,
    reason: string | null,
    side: {
      format: 'num1' | 'money'
      forecast: (m: AccuracyMonth) => number
      actual: (m: AccuracyMonth) => number
      what: string
    },
    uses: ReturnType<FPrep['uses']>,
  ): CalcSpec => {
    if (!acc || value == null)
      return {
        title,
        subtitle,
        metricId,
        value: null,
        format: 'pct',
        inputs: [],
        steps: [calcStep(title, reason ?? NO_ACCURACY_TEXT, null, 'pct')],
        uses,
      }
    const f = acc.months.reduce((n, m) => n + side.forecast(m), 0)
    const a = acc.months.reduce((n, m) => n + side.actual(m), 0)
    return {
      title,
      subtitle,
      metricId,
      value,
      format: 'pct',
      inputs: acc.months.flatMap((m) => [
        calcInput(
          `${monthLabel(m.month)} forecast`,
          side.forecast(m),
          side.format,
          `${acc.versionName}'s stored forecast, ${side.what}`,
        ),
        calcInput(
          `${monthLabel(m.month)} actual`,
          side.actual(m),
          side.format,
          `The month close, ${side.what}`,
        ),
      ]),
      steps: [
        calcStep(
          `Forecast, ${months}`,
          acc.months.map((m) => fmt(side.forecast(m), side.format)).join(' + '),
          f,
          side.format,
        ),
        calcStep(
          `Actual, ${months}`,
          acc.months.map((m) => fmt(side.actual(m), side.format)).join(' + '),
          a,
          side.format,
        ),
        calcStep(
          'Accuracy = 1 − |forecast − actual| ÷ actual',
          `1 − |${fmt(f, side.format)} − ${fmt(a, side.format)}| ÷ ${fmt(a, side.format)}`,
          value,
          'pct',
        ),
      ],
      uses,
    }
  }
  const headsSide = {
    format: 'num1' as const,
    forecast: (m: AccuracyMonth) => m.forecastHeads,
    actual: (m: AccuracyMonth) => m.actualHeads,
    what: 'heads at the month-end',
  }
  const costSide = {
    format: 'money' as const,
    forecast: (m: AccuracyMonth) => m.forecastUsd,
    actual: (m: AccuracyMonth) => m.actualUsd,
    what: 'loaded cost',
  }
  return [
    {
      id: 'accuracy-heads',
      metricId: ID.accuracyHeads,
      label: 'Forecast accuracy (heads)',
      value: heads,
      format: 'pct',
      goodDirection: 'up',
      note,
      ...(headsReason ? { suppressed: true, suppressedNote: headsReason } : {}),
      formula:
        '1 − |forecast heads − actual heads| ÷ actual heads, over the month-ends closed since the reforecast locked.',
      definition: p.text(ID.accuracyHeads),
      calc: () =>
        card(
          'Forecast accuracy (heads)',
          ID.accuracyHeads,
          heads,
          headsReason,
          headsSide,
          p.uses(FIGURE.yearEnd),
        ),
      uses: p.uses(FIGURE.yearEnd),
    },
    {
      id: 'accuracy-cost',
      metricId: ID.accuracyCost,
      label: 'Forecast accuracy (cost)',
      value: cost,
      format: 'pct',
      goodDirection: 'up',
      note,
      ...(costReason ? { suppressed: true, suppressedNote: costReason } : {}),
      formula:
        '1 − |forecast − actual| ÷ actual, loaded cost over the months closed since the reforecast locked.',
      definition: p.text(ID.accuracyCost),
      calc: () =>
        card(
          'Forecast accuracy (cost)',
          ID.accuracyCost,
          cost,
          costReason,
          costSide,
          p.uses(FIGURE.variance),
        ),
      uses: p.uses(FIGURE.variance),
    },
  ]
}

function measureCard(
  p: FPrep,
  title: string,
  metricId: string,
  a: number | null,
  b: number | null,
  format: Kpi['format'],
  reason: string | null = null,
): CalcSpec {
  const value = a != null && b != null ? a - b : null
  return {
    title,
    subtitle: subtitleOf(p.fiscalYear, p.ctx.scopeLabel, p.comparison?.name),
    metricId,
    value,
    format,
    inputs: [
      calcInput('Actual and forecast', a, format, `${p.working?.name ?? 'Working'} forecast`),
      calcInput(p.comparison?.name ?? 'Comparison', b, format, 'The comparison version'),
    ],
    steps:
      value != null
        ? [
            calcStep(
              'Variance = actual and forecast − comparison',
              `${fmt(a, format)} − ${fmt(b, format)}`,
              value,
              format,
            ),
          ]
        : [calcStep(reason ?? 'No comparison version', '—', null, format)],
    uses: p.uses(FIGURE.variance),
  }
}

/* ───────────── FX effect ───────────── */

export function fxTile(p: FPrep, months: readonly Month[], windowName: string, id = 'fx-effect'): Kpi | null {
  if (p.env.mode === 'none') return null
  const fx = fxEffectOf(p, months)
  return {
    id,
    metricId: ID.fxEffect,
    label: id === 'fx-effect-ytd' ? 'FX effect YTD' : 'FX effect',
    value: fx.value,
    format: money(p),
    goodDirection: 'down',
    note: `${windowName} ${p.vs}`,
    ...(fx.value == null ? { suppressed: true, ...(fx.reason ? { suppressedNote: fx.reason } : {}) } : {}),
    formula: `Σ local cost × (actual or forecast rate − ${p.comparison?.name ?? 'the comparison'}'s plan rate), ${windowName}.`,
    tab: 'bridge',
    definition: p.text(ID.fxEffect),
    calc: (): CalcSpec => ({
      title: `FX effect, ${windowName}`,
      subtitle: subtitleOf(windowName, p.ctx.scopeLabel, p.comparison?.name),
      metricId: ID.fxEffect,
      value: fx.value,
      format: money(p),
      inputs: fx.band
        ? []
        : [calcInput('Non-USD positions whose cost moves', fx.contributors, 'int', 'Costed positions only')],
      steps:
        fx.value != null
          ? [
              calcStep(
                'FX step of the bridge: actual and forecast rates in place of plan rates',
                'Σ local × (rate − plan rate)',
                fx.value,
                'money',
              ),
            ]
          : [calcStep(fx.reason ?? 'Hidden', '—', null, 'money')],
      ...(fx.window.note ? { note: fx.window.note } : {}),
      uses: p.uses(FIGURE.bridge),
    }),
    uses: p.uses(FIGURE.bridge),
  }
}

/* ───────────── strips ───────────── */

export const overviewKpis = (p: FPrep): Kpi[] =>
  shown(p, [yearEndTile(p), fullYearTile(p), startsTile(p), exitsTile(p), unfilledTile(p), runRateTile(p)])

export function bridgeKpis(p: FPrep): Kpi[] {
  const fx = fxTile(p, p.windowMonths, p.windowName)
  return shown(p, fx ? [fx] : [])
}

/**
 * The FX effect at period `ytd`, which the Finance home re-links (9.3); null where the mode hides it.
 * Its months are cost to date (`costYtdMonths`: in rounded modes they end at the last close on or
 * before the as-of date, review RR-2).
 */
export function fxYtdTile(p: FPrep): Kpi | null {
  const fx = fxTile(p, p.costYtdMonths, `${p.fiscalYear} year to date`, 'fx-effect-ytd')
  return fx ? (shown(p, [fx])[0] ?? null) : null
}
