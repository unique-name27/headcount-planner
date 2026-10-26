/**
 * The Forecast view's figures (docs/PLAN.md 9.4): heads by month (closed actuals, then the
 * projection, against the comparison's plan heads), starts and exits by month, the variance table
 * and the bridge's waterfall. Weighted cells open positions whose "Counts as" adds up to them;
 * amounts come from the guard (./variance.ts, ./bridge.ts). Pure.
 */
import type { Column } from '@/charts/types'
import { monthEnd } from '@/data/fiscal'
import type { Month } from '@/data/schema'
import { subtitleOf } from '@/drill/subtitle'
import type { DrillSpec } from '@/drill/types'
import { monthLabel } from '@/views/plan/engine/base'
import { versionLinesOf } from '@/views/plan/engine/core'
import { monthEndLine, positionsSpec, workersSpec } from '@/views/plan/engine/drill'
import { planHeadsByMonth } from '@/views/plan/engine/heads'
import { workerRowsOf } from '@/views/plan/engine/overview'
import type { FigureData } from '../../types'
import { ID } from '../metrics'
import type { BridgeStepRow, ForecastMonthRow, StartsExitsRow, VarianceRow } from '.'
import type { FPrep } from './base'
import { bridgeRows } from './bridge'
import { FORECAST_FIGURES } from './figures'
import { forecastFlows, forecastHeads } from './heads'
import { FIGURE } from './lineage'
import { type VarianceTableRow, varianceCellCard, varianceTable } from './variance'

const weighted = (
  p: FPrep,
  title: string,
  by: ReadonlyMap<string, number>,
  subtitle: string,
  note: string,
) => {
  const ids = [...by]
    .filter(([, v]) => Math.abs(v) > 1e-12)
    .map(([id]) => id)
    .sort()
  return positionsSpec(p, title, ids, {
    weight: (pos) => by.get(pos.positionId) ?? 0,
    subtitle,
    note,
    on: p.on,
  })
}

export function headsByMonthFigure(p: FPrep): FigureData<ForecastMonthRow> {
  const run = p.run
  const months: readonly Month[] = run?.months ?? p.grid
  const h = forecastHeads(p)
  const cmp = p.comparison ? planHeadsByMonth(versionLinesOf(p.ctx, p.comparison), months, p.scope.ids) : null
  const closed = (m: Month) => !!run && m <= run.actualThrough
  const rows: ForecastMonthRow[] = months.map((month) => ({
    month,
    label: monthLabel(month),
    actual: run && closed(month) ? (h.heads.get(month) ?? 0) : null,
    forecast: run && !closed(month) ? (h.heads.get(month) ?? 0) : null,
    comparison: cmp ? (cmp.get(month)?.length ?? 0) : null,
  }))
  const seatsAt = (m: Month) => h.bySeat.get(m) ?? new Map<string, number>()
  const columns: Column<ForecastMonthRow>[] = [
    { key: 'label', label: 'Month', sortValue: (r) => r.month },
    {
      key: 'actual',
      label: 'Actual heads',
      format: 'int',
      drill: (r) =>
        r.actual != null
          ? () =>
              positionsSpec(p, `Heads at the ${r.label} month-end`, [...seatsAt(r.month).keys()].sort(), {
                on: monthEnd(r.month),
                subtitle: subtitleOf(`${r.label} close`, p.ctx.scopeLabel),
              })
          : null,
    },
    {
      key: 'forecast',
      label: 'Forecast heads',
      format: 'num1',
      drill: (r) =>
        r.forecast != null
          ? () =>
              weighted(
                p,
                `Forecast heads at the ${r.label} month-end`,
                seatsAt(r.month),
                monthEndLine(p.ctx, r.month, p.working?.name),
                'Each seat counts as its expected heads at the month-end.',
              )
          : null,
    },
    {
      key: 'comparison',
      label: p.comparison ? `Plan heads (${p.comparison.name})` : 'Comparison',
      format: 'int',
      drill: (r) =>
        cmp && p.comparison
          ? () =>
              positionsSpec(p, `Plan heads in ${p.comparison?.name}`, cmp.get(r.month) ?? [], {
                on: monthEnd(r.month),
                subtitle: monthEndLine(p.ctx, r.month, p.comparison?.name),
              })
          : null,
    },
  ]
  return {
    id: FORECAST_FIGURES.headsByMonth,
    metric: ID.headsMonthEnd,
    title: 'Heads by month',
    subtitle: `Closed months actual, then the forecast of ${p.working?.name ?? 'Working'} at ${p.onLabel}${p.comparison ? `, against plan heads in ${p.comparison.name}` : ''}. Seats in the plan only.`,
    rows,
    columns,
    note: p.comparison
      ? null
      : `${p.vs.replace(/^vs /, 'The comparison is the ')}, which has no monthly plan.`,
    empty: run ? null : 'No forecast for this fiscal year.',
    uses: p.uses(FIGURE.headsByMonth),
  }
}

export function startsExitsFigure(p: FPrep): FigureData<StartsExitsRow> {
  const flows = forecastFlows(p)
  const months = p.run?.months ?? []
  const rows: StartsExitsRow[] = months.map((month) => {
    const f = flows.get(month)
    return {
      month,
      label: monthLabel(month),
      starts: f?.starts ?? 0,
      knownExits: f?.knownExits ?? 0,
      modeledExits: f?.modeledExits ?? 0,
      modeledBackfills: f?.modeledBackfills ?? 0,
    }
  })
  const by =
    (pick: 'startSeats' | 'exitSeats' | 'backfillSeats', title: string, note: string) =>
    (r: StartsExitsRow) => {
      const f = flows.get(r.month)
      if (!f?.[pick].size) return null
      return () => weighted(p, `${title}, ${r.label}`, f[pick], subtitleOf(r.label, p.ctx.scopeLabel), note)
    }
  const columns: Column<StartsExitsRow>[] = [
    { key: 'label', label: 'Month', sortValue: (r) => r.month },
    {
      key: 'starts',
      label: 'Starts',
      format: 'num1',
      drill: by('startSeats', 'Starts', 'A hire counts 1; an expected start counts as its probability.'),
    },
    {
      key: 'knownExits',
      label: 'Known exits',
      format: 'int',
      drill: (r) => {
        const f = flows.get(r.month)
        if (!f?.leavers.length) return null
        return (): DrillSpec<'workers'> =>
          workersSpec(p, `Known exits, ${r.label}`, workerRowsOf(p, f.leavers, monthEnd(r.month)), {
            subtitle: subtitleOf(r.label, p.ctx.scopeLabel),
          })
      },
    },
    {
      key: 'modeledExits',
      label: 'Modeled exits',
      format: 'num2',
      drill: by('exitSeats', 'Modeled exits', 'Each seat counts as its modeled exits in the month.'),
    },
    {
      key: 'modeledBackfills',
      label: 'Modeled backfills',
      format: 'num2',
      drill: by(
        'backfillSeats',
        'Modeled backfills',
        'Each seat counts as its modeled backfills in the month.',
      ),
    },
  ]
  return {
    id: FORECAST_FIGURES.startsExits,
    metric: ID.startsExpected,
    title: 'Starts and exits by month',
    subtitle:
      'Closed months: hires and leavers. Open months: expected starts, known exits, and modeled exits and backfills. Heads only.',
    rows,
    columns,
    note: null,
    empty: p.run ? null : 'No forecast for this fiscal year.',
    uses: p.uses(FIGURE.startsExits),
  }
}

export function varianceFigure(p: FPrep): FigureData<VarianceRow> {
  const t = varianceTable(p)
  const money = p.env.mode === 'rounded' ? 'moneyM' : 'money'
  const fmtOf = (r: VarianceRow) => (r.measure === 'cost' ? money : 'num1')
  const columns: Column<VarianceRow>[] = [
    { key: 'org', label: 'Org' },
    { key: 'level', label: 'Level' },
    { key: 'measure', label: 'Measure' },
    { key: 'windowLabel', label: 'Window' },
    { key: 'actual', label: 'Actual and forecast', format: fmtOf, cost: true },
    { key: 'comparison', label: p.comparison ? p.comparison.name : 'Comparison', format: fmtOf, cost: true },
    {
      key: 'variance',
      label: 'Variance',
      format: fmtOf,
      cost: true,
      // Every cell is modeled: it opens its card (the same guarded sides as the cell).
      calc: (r) => () => varianceCellCard(p, r as VarianceTableRow),
    },
    { key: 'reason', label: 'Why "—"', format: 'text' },
  ]
  return {
    id: FORECAST_FIGURES.variance,
    metric: ID.varianceCost,
    title: 'Variance',
    subtitle: `Actual for closed months and forecast for open ones, ${p.vs}, by org, measure and window. Positive cost is over.`,
    rows: t.rows,
    columns,
    note:
      p.env.mode === 'rounded'
        ? 'Cost shows for whole departments and teams at QTD, YTD and full year, rounded down to $0.1M per team.'
        : null,
    empty: t.empty,
    uses: p.uses(FIGURE.variance),
  }
}

export function bridgeFigure(p: FPrep): FigureData<BridgeStepRow> {
  const b = bridgeRows(p)
  const columns: Column<BridgeStepRow>[] = [
    { key: 'label', label: 'Step' },
    {
      key: 'value',
      label: 'Amount (USD)',
      format: p.env.mode === 'rounded' ? 'moneyM' : 'money',
      cost: true,
      calc: (r) => r.calc ?? null,
    },
    { key: 'contributors', label: 'Positions that moved', format: 'int', drill: (r) => r.drill ?? null },
  ]
  return {
    id: FORECAST_FIGURES.bridge,
    metric: ID.bridgeStep,
    title: 'Bridge',
    subtitle: `From ${p.comparison?.name ?? 'the comparison'} to the ${p.fiscalYear} forecast, one driver at a time.`,
    rows: b.rows,
    columns,
    note:
      [
        b.note,
        // Every costed part that does not show is in Other changes (C34), so the steps close on the
        // rounded end and no Rounding bar is left.
        p.env.mode === 'rounded' ? 'Totals are rounded down to $0.1M per team.' : null,
      ]
        .filter(Boolean)
        .join(' ') || null,
    empty: b.empty,
    uses: p.uses(FIGURE.bridge),
  }
}
