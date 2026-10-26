/**
 * The role homes on the Home view (docs/PLAN.md 9.3), as data: each home's figure ids in page order
 * (hero, key figures, Needs attention's two figures, My list, then the home's other figures), where
 * each key figure comes from, and which Action center kinds its Needs attention promises. Ids are
 * `home-<slug>-<thing>` for a home's own figures (the slug per mode is src/access/modes.ts
 * `HOME_SLUG`) and the three every home draws (`SHARED_HOME_FIGURES`). Manager mode's home is My
 * team (src/views/team/engine/figures.ts); HR admin's is the Data room.
 *
 * Frozen in the M2 freeze (docs/CONTRACTS-M2.md); plain data. The views-4 builder may add figure ids
 * with a home's prefix, never rename these. src/access/ids.ts `HOME_FIGURES` names the "Other
 * figures" of 9.3 and the shared three; a test keeps them inside these lists.
 */
import type { ItemKind } from '@/access/ids'
import { SHARED_HOME_FIGURES } from '@/access/modes'
import type { Mode, ViewKey } from '@/data/schema'
import { ID as FINANCE } from '@/views/finance/metrics'
import { ID as FORECAST } from '@/views/forecast/metrics'
import { ID as PLAN } from '@/views/plan/metrics'
import { ID as REQUESTS } from '@/views/requests/metrics'
import { ID as TARGETS } from '@/views/targets/metrics'

/** The three role homes on the Home view: Unit plan (HRBP), Rollup vs target (Leader), Plan vs actual (Finance). */
export type HomeSlug = 'unit' | 'rollup' | 'fin'

/** The home each mode opens on the Home view, or null (Manager opens My team, HR admin the Data room). */
export const SLUG_OF: Readonly<Record<Mode, HomeSlug | null>> = {
  manager: null,
  hrbp: 'unit',
  leader: 'rollup',
  finance: 'fin',
  'hr-admin': null,
}

/** The figures every role home draws: Needs attention (its chart and its list) and My list. */
export const SHARED: readonly string[] = SHARED_HOME_FIGURES

/** Each home's figures in page order. */
export const HOME_FIGURES: Readonly<Record<HomeSlug, readonly string[]>> = {
  unit: [
    'home-unit-heads-vs-plan',
    'home-unit-kpis',
    ...SHARED,
    'home-unit-openings',
    'home-unit-forecast',
    // M3: the HRBP's Working edits in the unit (Plan > Positions' changes, re-linked).
    'home-unit-changes',
  ],
  rollup: ['home-rollup-heads-vs-target', 'home-rollup-kpis', ...SHARED, 'home-rollup-suborgs'],
  fin: ['home-fin-cost-vs-budget', 'home-fin-kpis', ...SHARED, 'home-fin-bridge', 'home-fin-cost-unit'],
}

/** Every id in the lists, once. */
export const ALL_HOME_FIGURES: readonly string[] = [...new Set(Object.values(HOME_FIGURES).flat())]

/**
 * Where a key figure comes from: the KPI strip of the tab it links to (9.3, 9.4). The home re-links
 * the producing tab's tile with that metric id (a strip has at most one tile per metric id). Two
 * tiles are not their tab's own strip tiles, because the home asks for a different comparison or
 * period: the Leader's "Cost vs target" is `forecastModel(ctx).overview.costVsTarget` (the strip's
 * tile compares with the comparison), and Finance's "FX effect YTD" is
 * `forecastModel(ctx).bridge.fxEffectYtd` (the strip's tile is for the period shown).
 */
export interface KeyFigureSource {
  metricId: string
  view: ViewKey
  tab: string
}

/**
 * The slot Plan > Hiring's Open to hire tile takes on the HRBP and Leader homes (docs/PLAN.md 9.7,
 * change C36; the hiring freeze): the tab's own tile, re-linked by metric id like every key figure,
 * labelled "Open to hire, FY27" (src/views/plan/engine/hiringTab.ts `hiringOpenLabel`). It sits in
 * `HOME_KEY_FIGURES` at `HIRING_TILE_AT` (Unit plan after Openings past target start, Rollup vs
 * target after Year-end gap), read from Plan > Hiring's strip (`planHiringModel(ctx).kpis`), so the
 * counts are HRBP 6 and Leader 6 (9.3's 5 to 7 rule holds, and no tile made way for it). Plan vs
 * actual (Finance) does not change.
 */
export const HIRING_KEY_FIGURE: KeyFigureSource = { metricId: PLAN.hiringOpen, view: 'plan', tab: 'hiring' }

/** Where the tile sits in each strip: its index in `HOME_KEY_FIGURES[slug]`. */
export const HIRING_TILE_AT: Readonly<Record<'unit' | 'rollup', number>> = { unit: 3, rollup: 3 }

/** Each home's key figure count with the tile in (9.3 plus 9.7): Finance keeps 6. */
export const HOME_KEY_COUNT_WITH_HIRING: Readonly<Record<HomeSlug, number>> = { unit: 6, rollup: 6, fin: 6 }

/**
 * Each home's key figures in strip order (9.3: HRBP 5, Leader 5 per R16, Finance 6; 9.7 adds Open to
 * hire to the HRBP and Leader homes, which makes HRBP 6 and Leader 6).
 */
export const HOME_KEY_FIGURES: Readonly<Record<HomeSlug, readonly KeyFigureSource[]>> = {
  unit: [
    { metricId: PLAN.headsActual, view: 'plan', tab: 'overview' },
    { metricId: PLAN.hiresYtd, view: 'plan', tab: 'openings' },
    { metricId: PLAN.openingsPastStart, view: 'plan', tab: 'openings' },
    HIRING_KEY_FIGURE,
    { metricId: FORECAST.headsYearEnd, view: 'forecast', tab: 'overview' },
    { metricId: FORECAST.costFullYear, view: 'forecast', tab: 'overview' },
  ],
  rollup: [
    { metricId: FORECAST.headsYearEnd, view: 'forecast', tab: 'overview' },
    { metricId: FORECAST.costFullYear, view: 'forecast', tab: 'overview' },
    { metricId: TARGETS.gapHeads, view: 'targets', tab: 'gap' },
    HIRING_KEY_FIGURE,
    { metricId: REQUESTS.queueWaiting, view: 'requests', tab: 'approvals' },
    { metricId: TARGETS.subOrgUnallocated, view: 'targets', tab: 'gap' },
  ],
  fin: [
    { metricId: PLAN.headsActual, view: 'plan', tab: 'overview' },
    { metricId: PLAN.reqsNotInPlan, view: 'finance', tab: 'reconcile' },
    { metricId: PLAN.openingsFrozen, view: 'finance', tab: 'freezes' },
    { metricId: FORECAST.fxEffect, view: 'forecast', tab: 'bridge' },
    { metricId: FINANCE.freezeSavings, view: 'finance', tab: 'freezes' },
    { metricId: FINANCE.reconExceptions, view: 'finance', tab: 'reconcile' },
  ],
}

/**
 * The item kinds each home's Needs attention promises (9.3). Each routes to `needs` in the home's
 * mode (src/access/items.ts `ITEM_ROUTING`; `roleItems.test.ts`).
 *  - Unit plan: requests waiting 5+ days, managers not submitted, Planned seats near start with no
 *    req, reconciliation exceptions in the unit.
 *  - Rollup vs target: approvals waiting on you, sub-orgs over target.
 *  - Plan vs actual: Finance steps waiting, envelope exceptions, cycle stage due.
 */
export const HOME_NEEDS: Readonly<Record<HomeSlug, readonly ItemKind[]>> = {
  unit: ['requests:waiting', 'requests:not-submitted', 'plan:planned-no-req', 'finance:reconcile'],
  rollup: ['requests:approve', 'requests:waiting', 'targets:suborg-over'],
  fin: ['requests:approve', 'requests:waiting', 'finance:envelope-exception', 'finance:cycle-due'],
}
