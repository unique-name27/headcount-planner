/**
 * Stand-in producing models for the role homes' tests (test code only): a Plan, Plan > Hiring,
 * Forecast, Targets, Requests and Finance model with the tiles, rows and columns the homes re-link,
 * shaped as the frozen model interfaces (src/views/<key>/engine/index.ts; Plan > Hiring's
 * src/views/plan/engine/hiringTab.ts `PlanHiring`). The homes compose them and compute nothing, so
 * these numbers come back on the homes exactly.
 */
import { vi } from 'vitest'
import type { Kpi } from '@/components/types'
import type { DrillSpec } from '@/drill/types'
import { ID as FINANCE } from '@/views/finance/metrics'
import { ID as FORECAST } from '@/views/forecast/metrics'
import { ID as PLAN } from '@/views/plan/metrics'
import { ID as REQUESTS } from '@/views/requests/metrics'
import { ID as TARGETS } from '@/views/targets/metrics'
import type { FigureData } from '../../types'

export const spec = (title: string, n: number): DrillSpec<'positions'> => ({
  kind: 'positions',
  title,
  rows: Array(n).fill({}),
})

/** A producing tile: its own value, change, comparison, records and tab. */
export function k(metricId: string, value: number | null, extra: Partial<Kpi> = {}): Kpi {
  return {
    id: `tile-${metricId}`,
    metricId,
    label: metricId,
    value,
    format: 'int',
    tab: 'own-tab',
    drill: () => spec(metricId, value ?? 0),
    uses: ['positions.positionId'],
    ...extra,
  }
}

export function fig<R extends object>(
  id: string,
  metric: string,
  rows: readonly R[],
  extra: Partial<FigureData<R>> = {},
): FigureData<R> {
  return { id, metric, title: id, rows, columns: [], empty: null, uses: ['positions.positionId'], ...extra }
}

const VS_PLAN = { delta: -10, deltaLabel: 'vs plan of record (Q1 Reforecast)' }

/** Requests in the queue: two open in Silicon Engineering (at different steps), one decided, one in another unit. */
function queueRows() {
  const r = (
    requestId: string,
    state: string,
    businessUnit: string,
    stepRole: string | null,
    daysInStep: number | null,
  ) => ({
    requestId,
    view: 'full',
    type: 'New role',
    state,
    positionId: null,
    managerPositionId: 'P-NOWHERE',
    businessUnit,
    stepRole,
    daysInStep,
  })
  return [
    r('R-1', 'In review', 'Silicon Engineering', 'leader', 3),
    r('R-2', 'Submitted', 'Silicon Engineering', 'hrbp', 9),
    r('R-3', 'Approved', 'Silicon Engineering', null, null),
    r('R-4', 'In review', 'Go-to-Market', 'hrbp', 12),
    r('R-5', 'Sent back', 'Silicon Engineering', null, null),
  ]
}

/** Stand-in producing models for the role homes, with Silicon Engineering-like numbers. */
export function producerFixtures(leaderTree: readonly string[]) {
  const actualCell = vi.fn(() => () => spec('actual at Sep', 556))
  const plan = {
    overview: {
      kpis: [k(PLAN.headsActual, 556, VS_PLAN), k(PLAN.headsApproved, 600)],
      findings: [],
      headsByMonth: fig(
        'plan-heads-by-month',
        PLAN.headsActual,
        [
          { month: '2026-08', label: 'Aug 2026', actual: 550, plan: 560, comparison: 561 },
          { month: '2026-09', label: 'Sep 2026', actual: 556, plan: 565, comparison: 566 },
          { month: '2026-10', label: 'Oct 2026', actual: null, plan: 570, comparison: 571 },
        ],
        { columns: [{ key: 'actual', label: 'Actual', drill: actualCell }] },
      ),
      openingsByStage: fig('plan-openings-by-stage', PLAN.openingsCount, [
        { stage: 'Planned', label: 'Planned', count: 4 },
      ]),
      headsByUnit: fig('x', PLAN.headsActual, []),
      positionsByStatus: fig('x', PLAN.positionsByStatus, []),
      costByUnit: fig('x', 'plan.cost.loaded', []),
    },
    openings: {
      kpis: [
        k(PLAN.hiresYtd, 18, { delta: 14, deltaLabel: 'vs FY27 Budget' }),
        k(PLAN.openingsPastStart, 10),
      ],
    },
    // M3: Plan > Positions' Working changes, which the Unit plan re-links.
    positions: {
      changes: fig('plan-positions-changes', PLAN.positionsByStatus, [
        {
          positionId: 'P-2369',
          title: 'Director, Physical Design Methodology',
          on: '2026-09-30',
          change: 'Changed by the HRBP: start moved from Jan to Mar',
          reason: 'Hiring plan moved to spring',
        },
      ]),
    },
  }
  const forecast = {
    overview: {
      kpis: [
        k(FORECAST.headsYearEnd, 640.4, { format: 'num1', delta: -3.6, deltaLabel: 'vs FY27 target' }),
        k(FORECAST.costFullYear, 93_800_000, {
          format: 'moneyM',
          delta: 1_400_000,
          deltaLabel: 'vs plan of record (Q1 Reforecast)',
        }),
      ],
      findings: [],
      headsByMonth: fig('forecast-heads-by-month', FORECAST.headsMonthEnd, [
        { month: '2026-10', label: 'Oct 2026', actual: null, forecast: 557.2, comparison: 560 },
      ]),
      startsExits: fig('x', FORECAST.startsExpected, []),
      costVsTarget: k(FORECAST.costFullYear, 93_800_000, {
        id: 'cost-vs-target',
        format: 'moneyM',
        delta: -200_000,
        deltaLabel: 'vs FY27 target',
      }),
    },
    variance: {
      kpis: [],
      rows: fig('forecast-variance', FORECAST.varianceCost, [
        {
          orgKey: 'co',
          org: 'Northgate',
          level: 'company',
          measure: 'cost',
          window: 'fy',
          actual: 250_000_000,
          comparison: 245_000_000,
          variance: 5_000_000,
          reason: null,
        },
        {
          orgKey: 'se',
          org: 'Silicon Engineering',
          level: 'unit',
          measure: 'cost',
          window: 'fy',
          actual: 93_800_000,
          comparison: 89_700_000,
          variance: 4_100_000,
          reason: null,
        },
        {
          orgKey: 'gtm',
          org: 'Go-to-Market',
          level: 'unit',
          measure: 'cost',
          window: 'fy',
          actual: 34_200_000,
          comparison: 32_300_000,
          variance: 1_900_000,
          reason: null,
        },
        {
          orgKey: 'ops',
          org: 'Operations',
          level: 'unit',
          measure: 'cost',
          window: 'fy',
          actual: 20_000_000,
          comparison: 26_000_000,
          variance: -6_000_000,
          reason: null,
        },
        {
          orgKey: 'se',
          org: 'Silicon Engineering',
          level: 'unit',
          measure: 'heads',
          window: 'fy',
          actual: 556,
          comparison: 566,
          variance: -10,
          reason: null,
        },
        {
          orgKey: 'se',
          org: 'Silicon Engineering',
          level: 'unit',
          measure: 'cost',
          window: 'ytd',
          actual: 1,
          comparison: 1,
          variance: 0,
          reason: null,
        },
      ]),
    },
    bridge: {
      kpis: [k(FORECAST.fxEffect, 300_000, { format: 'moneyFull', delta: null })],
      steps: fig('forecast-bridge', FORECAST.bridgeStep, [
        { key: 'start', label: 'FY27 Budget', kind: 'start', value: 245_000_000, contributors: null },
      ]),
      fxEffectYtd: k(FORECAST.fxEffect, 785_544.9, { id: 'fx-ytd', format: 'moneyFull' }),
    },
  }
  const targets = {
    gap: {
      kpis: [
        k(TARGETS.targetHeads, 644),
        k(TARGETS.targetCost, 240_000_000, { format: 'moneyM' }),
        k(TARGETS.gapHeads, -18),
        k(TARGETS.subOrgUnallocated, 2),
      ],
      rows: fig('x', TARGETS.gapHeads, []),
    },
    suborgs: {
      kpis: [],
      rows: fig('targets-suborgs', TARGETS.targetHeads, [
        ...leaderTree.slice(0, 2).map((positionId, i) => ({
          positionId,
          label: `Sub-org ${i}`,
          heads: 50,
          asksHeads: 52,
          targetHeads: 51,
          gapHeads: -1,
          targetCostUsd: null,
          asksCostUsd: null,
          gapCostUsd: null,
          over: true,
          reason: null,
        })),
        {
          positionId: 'P-OUTSIDE',
          label: 'Outside',
          heads: 1,
          asksHeads: 1,
          targetHeads: 1,
          gapHeads: 0,
          targetCostUsd: null,
          asksCostUsd: null,
          gapCostUsd: null,
          over: false,
          reason: null,
        },
      ]),
    },
    tree: { kpis: [], cells: fig('x', TARGETS.treeCostCenter, []) },
  }
  const requests = {
    queue: {
      kpis: [],
      rows: fig('requests-queue', REQUESTS.queueOpen, queueRows()),
      byState: fig('x', REQUESTS.queueOpen, []),
    },
    mine: { kpis: [], rows: fig('x', REQUESTS.queueOpen, []) },
    approvals: {
      kpis: [k(REQUESTS.queueOpen, 4), k(REQUESTS.queueWaiting, 2)],
      rows: fig('x', REQUESTS.queueOpen, []),
    },
    cycle: {
      kpis: [],
      cycle: null,
      asks: fig('x', REQUESTS.cycleAsks, []),
      notSubmitted: fig('x', REQUESTS.cycleNotSubmitted, []),
    },
    new: null,
  }
  const finance = {
    reconcile: {
      kpis: [k(FINANCE.reconExceptions, 9), k(PLAN.reqsNotInPlan, 3)],
      exceptions: fig('x', FINANCE.reconExceptions, []),
    },
    freezes: {
      kpis: [k(PLAN.openingsFrozen, 3), k(FINANCE.freezeSavings, 412_000, { format: 'moneyFull' })],
    },
  }
  // Plan > Hiring's own model (9.7, reading H10): its strip in `HIRING_KPIS` order, heads only.
  const hiring = {
    fiscalYear: 'FY27',
    kpis: [
      k(PLAN.hiringOpen, 12, {
        id: 'hiring-open',
        label: 'Open to hire',
        note: '14 open seats, 2 not in plan',
      }),
      k(PLAN.hiringAcceptedStarts, 3, { id: 'hiring-accepted', label: 'Future starts' }),
      k(PLAN.hiringPace, 1.3, { id: 'hiring-pace', format: 'num1', drill: undefined, calc: () => null }),
    ],
    findings: [],
  }
  return { plan, hiring, forecast, targets, requests, finance, actualCell }
}
