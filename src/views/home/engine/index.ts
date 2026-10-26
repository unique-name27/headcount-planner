/**
 * The role homes' model (docs/PLAN.md 9.3; the template app's `HomeTop`: hero, key figures, Needs
 * attention, then My list and the home's other figures). Homes never compute a number: the hero and
 * every key figure are the producing views' own (re-linked with `tile()`, by metric id, from the tabs
 * `HOME_KEY_FIGURES` names), My list and the other figures are the producing views' rows. Needs
 * attention is the Action center's split for the mode (src/views/actions/engine `actionsModel`,
 * kinds `HOME_NEEDS`), not part of this model. The Home view has no `actions` (9.6).
 *
 *  - Unit plan (HRBP): hero heads vs plan at the last closed month-end; My list the unit's open
 *    requests by step (`requestsModel(ctx).queue`); figures openings by stage
 *    (`planModel(ctx).overview.openingsByStage`) and forecast heads by month
 *    (`forecastModel(ctx).overview.headsByMonth`).
 *  - Rollup vs target (Leader): hero year-end heads vs target; My list the sub-orgs with heads, asks
 *    and gap, and a bullet per sub-org against its target (`targetsModel(ctx).suborgs`).
 *  - Both carry Plan > Hiring's Open to hire among their key figures (9.7, change C36): the tab's
 *    own tile from `planHiringModel(ctx).kpis`, labelled "Open to hire, FY27".
 *  - Plan vs actual (Finance): hero the full-year cost forecast vs the Budget; My list the units by
 *    cost variance and cost by unit vs the Budget (the unit × cost × FY rows of
 *    `forecastModel(ctx).variance`); the bridge (`forecastModel(ctx).bridge.steps`).
 *
 * Every KPI names its comparison. Frozen in the M2 freeze (docs/CONTRACTS-M2.md). `homeTitle` is
 * built (9.3's names); the views-4 builder fills the rest and may add fields, never rename or retype
 * these.
 *
 * Readings taken here:
 *  - The Unit plan hero is the last closed month's row of Plan > Overview's heads by month: its
 *    actual heads against the comparison's plan heads, opening the records its actual cell opens.
 *    Under a target comparison it compares with nothing and gives 9.2's reason ("A target has no
 *    monthly plan. Pick a version to compare."), as Plan > Overview's Actual heads tile does. The
 *    Rollup hero is Forecast > Overview's year-end heads tile against Targets > Gap's target heads
 *    tile; the Plan vs actual hero is Forecast > Overview's full-year cost tile against the
 *    company's full-year cost comparison in Forecast > Variance (Targets > Gap's target cost tile
 *    under a target comparison), titled by the comparison it names ("Full-year cost vs FY27
 *    Budget"). Each takes its producer's drill or card, and its reason when hidden.
 *  - A home keeps its rows to the mode's scope (the records guard, src/access/records.ts), so a
 *    producer's row outside it never reaches a home; the unit's open requests are those Submitted,
 *    In review or Sent back, by step (manager, HRBP, leader, Finance), longest waiting first; the
 *    units by cost variance are the unit rows of cost at FY, largest variance first.
 *  - The headlines: HRBP, actual heads at the last closed month-end and the plan heads beside them,
 *    named by their comparison ("heads, vs FY27 Budget: 176 plan heads");
 *    Leader, Targets' own headline (the gap in heads); Finance, the full-year cost forecast with its
 *    change against the Budget.
 */
import { HOME_LABEL } from '@/access/modes'
import { inScope, positionInScope } from '@/access/records'
import { targetComparisonEmpty } from '@/components/kpiModel'
import type { Kpi } from '@/components/types'
import { type AnalyticsContext, compareDeltaLabel } from '@/data/context'
import { fiscalYearOf, monthEnd } from '@/data/fiscal'
import type { FiscalYear, Mode } from '@/data/schema'
import { type RequestRecord, resolveDrill } from '@/drill/types'
import { formatDate } from '@/lib/dates'
import { DASH, fmt, fmtDelta, plural } from '@/lib/format'
import { financeModel } from '@/views/finance/engine'
import {
  type BridgeStepRow,
  type ForecastMonthRow,
  forecastModel,
  type VarianceRow,
} from '@/views/forecast/engine'
import { ID as FORECAST } from '@/views/forecast/metrics'
import { type HrbpChangeRow, type OpeningsStageRow, planModel } from '@/views/plan/engine'
import { hiringOpenLabel, planHiringModel } from '@/views/plan/engine/hiringTab'
import { ID as PLAN } from '@/views/plan/metrics'
import { requestsModel } from '@/views/requests/engine'
import { type SubOrgRow, targetsHeadline, targetsModel } from '@/views/targets/engine'
import { ID as TARGETS } from '@/views/targets/metrics'
import type { FigureData, Headline, HeroModel } from '../../types'
import { HOME_KEY_FIGURES, type HomeSlug, type KeyFigureSource, SLUG_OF } from './figures'
import { linkLabel, tile } from './kpis'

export type { HomeSlug } from './figures'

/** The top band every role home has. */
export interface HomeTopModel<S extends HomeSlug> {
  slug: S
  /** The page title: "Unit plan", "Rollup vs target", "Plan vs actual". */
  title: string
  hero: HeroModel
  /** The key figures in `HOME_KEY_FIGURES` order, each a producing tab's tile, re-linked. */
  kpis: Kpi[]
}

export interface UnitHomeModel extends HomeTopModel<'unit'> {
  /** My list: the unit's open requests by step. */
  list: FigureData<RequestRecord>
  openings: FigureData<OpeningsStageRow>
  forecast: FigureData<ForecastMonthRow>
  /**
   * The HRBP's Working edits of the unit's seats, newest first (Plan > Positions' changes, re-linked;
   * M3): what the seats' managers read as "Changed by your HRBP".
   */
  changes: FigureData<HrbpChangeRow>
}

export interface RollupHomeModel extends HomeTopModel<'rollup'> {
  /** My list: sub-orgs with heads, asks and gap. */
  list: FigureData<SubOrgRow>
  /** A bullet per sub-org against its target. */
  suborgs: FigureData<SubOrgRow>
}

export interface FinHomeModel extends HomeTopModel<'fin'> {
  /** My list: units by cost variance. */
  list: FigureData<VarianceRow>
  bridge: FigureData<BridgeStepRow>
  /** Cost by unit vs the Budget. */
  costByUnit: FigureData<VarianceRow>
}

export type HomeModel = UnitHomeModel | RollupHomeModel | FinHomeModel

/** The page title of the Home view in a mode: the role home's name, or "Home" where the mode has none. */
export const homeTitle = (mode: Mode): string => (SLUG_OF[mode] ? HOME_LABEL[mode] : 'Home')

/* ───────────── key figures ───────────── */

/**
 * Plan > Hiring's strip as the homes re-link it (9.7 Homes): the tab's own tiles, the headline one
 * under the label 9.7 gives it on a home, "Open to hire, FY27" (the tab's own words for the fiscal
 * year it shows, `hiringOpenLabel`). Plan > Hiring is its own model (reading H10), not a `PlanModel`
 * field, so the homes read `planHiringModel`.
 */
function hiringTiles(ctx: AnalyticsContext): readonly Kpi[] {
  const m = planHiringModel(ctx)
  const label = hiringOpenLabel(m.fiscalYear)
  return m.kpis.map((t) => (t.metricId === PLAN.hiringOpen ? { ...t, label } : t))
}

/** The tiles of the tab a key figure comes from (9.4), or the model field 9.3 names for two of them. */
function sourceTiles(ctx: AnalyticsContext, slug: HomeSlug, k: KeyFigureSource): readonly Kpi[] {
  if (slug === 'rollup' && k.metricId === FORECAST.costFullYear) {
    const t = forecastModel(ctx).overview.costVsTarget
    return t ? [t] : []
  }
  if (slug === 'fin' && k.metricId === FORECAST.fxEffect) {
    const t = forecastModel(ctx).bridge.fxEffectYtd
    return t ? [t] : []
  }
  switch (`${k.view}.${k.tab}`) {
    case 'plan.overview':
      return planModel(ctx).overview.kpis
    case 'plan.openings':
      return planModel(ctx).openings.kpis
    case 'plan.hiring':
      return hiringTiles(ctx)
    case 'forecast.overview':
      return forecastModel(ctx).overview.kpis
    case 'forecast.bridge':
      return forecastModel(ctx).bridge.kpis
    case 'targets.gap':
      return targetsModel(ctx).gap.kpis
    case 'requests.approvals':
      return requestsModel(ctx).approvals.kpis
    case 'finance.reconcile':
      return financeModel(ctx).reconcile.kpis
    case 'finance.freezes':
      return financeModel(ctx).freezes.kpis
    default:
      return []
  }
}

/** The home's key figures in `HOME_KEY_FIGURES` order, each re-linked to its tab. */
export function homeKpis(ctx: AnalyticsContext, slug: HomeSlug): Kpi[] {
  return HOME_KEY_FIGURES[slug].flatMap((k) =>
    tile(sourceTiles(ctx, slug, k), k.metricId, {
      view: k.view,
      tab: k.tab,
      label: linkLabel(k.view, k.tab),
    }),
  )
}

/* ───────────── heroes ───────────── */

/** A hero from a producing tile: its value, format, records or card and reason. */
function heroOf(
  t: Kpi | undefined,
  base: Pick<HeroModel, 'id' | 'metric' | 'title' | 'subtitle' | 'label' | 'uses'>,
  comparison: HeroModel['comparison'],
): HeroModel {
  return {
    ...base,
    value: t && !t.suppressed ? t.value : null,
    format: t?.format ?? 'int',
    parts: [],
    comparison,
    drill: t?.drill,
    calc: t?.calc,
    note: t?.note ?? null,
    reason: t ? (t.suppressed ? (t.suppressedNote ?? null) : null) : 'This figure is not available yet.',
    uses: t?.uses ?? base.uses,
  }
}

/** The fiscal year the home shows: the shown version's, else the as-of date's. */
const shownYear = (ctx: AnalyticsContext): FiscalYear => ctx.version?.fiscalYear ?? fiscalYearOf(ctx.asOf)

/**
 * Why a monthly "vs" figure compares with nothing under a target comparison (9.2): "A target has no
 * monthly plan. Pick a version to compare." when the year has a locked version, else "FY28 has no
 * locked version yet."; null under a version comparison. The KPI strip's own helper, so the hero and
 * the tiles word it the same way.
 */
const noMonthlyComparison = (ctx: AnalyticsContext): string | null =>
  targetComparisonEmpty(ctx.compare, ctx.versions)

/**
 * Unit plan: actual heads at the last closed month-end against the comparison's plan heads at that
 * month-end. A target has no monthly plan, so under a target comparison the hero compares with
 * nothing and says why (9.2), as Plan > Overview's Actual heads tile does.
 */
function unitHero(ctx: AnalyticsContext): HeroModel {
  const plan = planModel(ctx).overview
  const fig = plan.headsByMonth
  let row: (typeof fig.rows)[number] | null = null
  for (const r of fig.rows) if (r.actual != null) row = r
  // The hero reads what Plan > Overview's Actual heads tile reads (HRIS people and the comparison's
  // locked seats), not the whole heads-by-month figure (whose shown version reads live reqs).
  const actual = plan.kpis.find((k) => k.metricId === PLAN.headsActual)
  const base = {
    id: 'home-unit-heads-vs-plan',
    metric: PLAN.headsActual,
    title: 'Heads vs plan',
    uses: actual?.uses ?? fig.uses,
  }
  if (!row)
    return {
      ...base,
      subtitle: 'Actual heads at the last closed month-end against plan heads',
      value: null,
      format: 'int',
      label: 'heads',
      parts: [],
      comparison: null,
      note: null,
      reason: `No month of ${shownYear(ctx)} is closed yet.`,
    }
  const end = monthEnd(row.month)
  const why = noMonthlyComparison(ctx)
  const comparison = { label: compareDeltaLabel(ctx.compare), value: why ? null : row.comparison }
  const at = row
  const cell = fig.columns.find((c) => c.key === 'actual')?.drill
  return {
    ...base,
    subtitle: `Actual heads at ${formatDate(end)}, the last closed month-end, against plan heads`,
    value: row.actual,
    format: 'int',
    label: `heads at ${formatDate(end)}`,
    parts: [],
    comparison,
    drill: cell ? () => resolveDrill(cell(at)) : undefined,
    note: why,
    reason: null,
  }
}

/** Rollup vs target: the year-end heads forecast against target heads. */
function rollupHero(ctx: AnalyticsContext): HeroModel {
  const t = forecastModel(ctx).overview.kpis.find((k) => k.metricId === FORECAST.headsYearEnd)
  const target = targetsModel(ctx).gap.kpis.find((k) => k.metricId === TARGETS.targetHeads)
  return heroOf(
    t,
    {
      id: 'home-rollup-heads-vs-target',
      metric: FORECAST.headsYearEnd,
      title: 'Year-end heads vs target',
      subtitle: 'The year-end heads forecast against your org’s target',
      label: 'heads at year end',
      uses: t?.uses ?? [],
    },
    { label: t?.deltaLabel ?? 'vs target', value: target && !target.suppressed ? target.value : null },
  )
}

/**
 * Plan vs actual: the full-year cost forecast against the comparison (Finance's default is the
 * year's Budget). The comparison's full-year cost is the company row of Forecast > Variance (cost,
 * FY); under a target comparison it is Targets > Gap's target cost tile (9.2: full-year cost tiles
 * compare with target cost), since a target has no monthly plan for the variance table to read.
 */
function finHero(ctx: AnalyticsContext): HeroModel {
  const f = forecastModel(ctx)
  const t = f.overview.kpis.find((k) => k.metricId === FORECAST.costFullYear)
  const vs = t?.deltaLabel ?? compareDeltaLabel(ctx.compare)
  let against: number | null
  if (ctx.compare.kind === 'target') {
    const target = targetsModel(ctx).gap.kpis.find((k) => k.metricId === TARGETS.targetCost)
    against = target && !target.suppressed ? target.value : null
  } else {
    const company = f.variance.rows.rows.find(
      (r) => r.level === 'company' && r.measure === 'cost' && r.window === 'fy',
    )
    against = company?.comparison ?? null
  }
  return heroOf(
    t,
    {
      id: 'home-fin-cost-vs-budget',
      metric: FORECAST.costFullYear,
      title: `Full-year cost ${vs}`,
      subtitle: `The full-year cost forecast against ${vs.replace(/^vs /, '')}`,
      label: 'full-year cost forecast',
      uses: t?.uses ?? [],
    },
    { label: vs, value: against },
  )
}

/* ───────────── lists and figures ───────────── */

const STEP_ORDER: Readonly<Record<string, number>> = { manager: 0, hrbp: 1, leader: 2, finance: 3 }
const OPEN_STATES = new Set(['Submitted', 'In review', 'Sent back'])

/** A producing figure on a home: its id and words, its rows kept to the scope. */
function onHome<R extends object>(
  fig: FigureData<R>,
  id: string,
  rows: readonly R[],
  words: Partial<Pick<FigureData<R>, 'title' | 'subtitle' | 'note' | 'empty'>> = {},
): FigureData<R> {
  const { empty, ...rest } = words
  return {
    ...fig,
    ...rest,
    id,
    rows,
    // The producer's reason first (a target comparison, a hidden amount), else the home's own words.
    empty: fig.empty ?? (rows.length ? null : (empty ?? 'Nothing to show in this scope.')),
  }
}

function unitHome(ctx: AnalyticsContext): UnitHomeModel {
  const queue = requestsModel(ctx).queue.rows
  const open = queue.rows
    .filter((r) => OPEN_STATES.has(r.state) && inScope('requests', r, ctx))
    .sort(
      (a, b) =>
        (STEP_ORDER[a.stepRole ?? ''] ?? 9) - (STEP_ORDER[b.stepRole ?? ''] ?? 9) ||
        (b.daysInStep ?? -1) - (a.daysInStep ?? -1) ||
        (a.requestId < b.requestId ? -1 : 1),
    )
  const planM = planModel(ctx)
  const plan = planM.overview
  const forecast = forecastModel(ctx).overview
  const changes = planM.positions.changes
  return {
    slug: 'unit',
    title: HOME_LABEL.hrbp,
    hero: unitHero(ctx),
    kpis: homeKpis(ctx, 'unit'),
    list: onHome(queue, 'home-list', open, {
      title: 'Open requests by step',
      subtitle: 'The unit’s requests waiting on a decision, by the step they wait on, longest waiting first',
      empty: 'No open requests in the unit.',
    }),
    openings: onHome(plan.openingsByStage, 'home-unit-openings', plan.openingsByStage.rows),
    forecast: onHome(forecast.headsByMonth, 'home-unit-forecast', forecast.headsByMonth.rows),
    changes: onHome(changes, 'home-unit-changes', changes.rows.slice(0, 25), {
      title: 'Changes in Working',
      subtitle: 'Your latest start, level, location, FTE and hold changes to the unit’s seats, newest first',
    }),
  }
}

function rollupHome(ctx: AnalyticsContext): RollupHomeModel {
  const sub = targetsModel(ctx).suborgs.rows
  const rows = sub.rows.filter((r) => positionInScope(r.positionId, ctx.access) || !ctx.access.scope)
  return {
    slug: 'rollup',
    title: HOME_LABEL.leader,
    hero: rollupHero(ctx),
    kpis: homeKpis(ctx, 'rollup'),
    list: onHome(sub, 'home-list', rows, {
      title: 'Sub-orgs against target',
      subtitle: 'Each sub-org’s heads, asks and gap at its target date',
      empty: 'No sub-orgs below your org.',
    }),
    suborgs: onHome(sub, 'home-rollup-suborgs', rows, {
      title: 'Sub-orgs against their targets',
      subtitle: 'Asks against each sub-org’s heads target, on one scale',
    }),
  }
}

function finHome(ctx: AnalyticsContext): FinHomeModel {
  const f = forecastModel(ctx)
  const units = f.variance.rows.rows.filter(
    (r) => r.level === 'unit' && r.measure === 'cost' && r.window === 'fy',
  )
  const byVariance = [...units].sort(
    (a, b) => Math.abs(b.variance ?? 0) - Math.abs(a.variance ?? 0) || a.org.localeCompare(b.org),
  )
  const byOrg = [...units].sort((a, b) => a.org.localeCompare(b.org))
  return {
    slug: 'fin',
    title: HOME_LABEL.finance,
    hero: finHero(ctx),
    kpis: homeKpis(ctx, 'fin'),
    list: onHome(f.variance.rows, 'home-list', byVariance, {
      title: 'Units by cost variance',
      subtitle: `Full-year cost forecast against ${ctx.compare.label}, by business unit, largest variance first`,
      empty: 'No unit has a cost variance to show.',
    }),
    bridge: onHome(f.bridge.steps, 'home-fin-bridge', f.bridge.steps.rows),
    costByUnit: onHome(f.variance.rows, 'home-fin-cost-unit', byOrg, {
      title: 'Cost by unit vs the comparison',
      subtitle: `Full-year cost forecast and ${ctx.compare.label} by business unit`,
    }),
  }
}

const cache = new WeakMap<AnalyticsContext, HomeModel | null>()

/** The mode's role home, or null where the mode has none on the Home view (Manager, HR admin). Cached per context. */
export function homeModel(ctx: AnalyticsContext): HomeModel | null {
  if (cache.has(ctx)) return cache.get(ctx) ?? null
  const slug = SLUG_OF[ctx.access.mode]
  const model =
    slug === 'unit'
      ? unitHome(ctx)
      : slug === 'rollup'
        ? rollupHome(ctx)
        : slug === 'fin'
          ? finHome(ctx)
          : null
  cache.set(ctx, model)
  return model
}

/** The folder tab's number per mode (9.1): heads vs plan (HRBP), the year-end gap (Leader), full-year cost vs Budget (Finance). */
export function homeHeadline(ctx: AnalyticsContext): Headline {
  const slug = SLUG_OF[ctx.access.mode]
  if (slug === 'rollup') return targetsHeadline(ctx)
  if (slug === 'unit') {
    const h = unitHero(ctx)
    return {
      value: fmt(h.value, 'int'),
      // The headline names its comparison, as every "vs" figure does (9.2): "heads, vs FY27 Budget: 176 plan heads".
      label:
        h.comparison?.value != null
          ? `heads, ${h.comparison.label}: ${plural(h.comparison.value, 'plan head')}`
          : 'heads',
      metricId: PLAN.headsActual,
      uses: h.uses,
    }
  }
  if (slug === 'fin') {
    const t = forecastModel(ctx).overview.kpis.find((k) => k.metricId === FORECAST.costFullYear)
    const shown = t && !t.suppressed && t.value != null
    const change =
      shown && t.delta != null ? `${fmtDelta(t.delta, t.format)} ${t.deltaLabel ?? ''}`.trim() : ''
    return {
      value: shown ? fmt(t.value, t.format) : DASH,
      label: change ? `full-year cost, ${change}` : 'full-year cost',
      metricId: FORECAST.costFullYear,
      uses: t?.uses,
    }
  }
  // Manager mode and HR admin have no role home here; their folder tab is hidden.
  return { value: DASH, label: 'Home' }
}
