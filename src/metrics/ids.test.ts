/**
 * The frozen metric ids (docs/PLAN.md 12): each view's `ID` holds exactly the ids whose home view it
 * is, in the plan's order; rule ids use the shared prefixes; no id is registered twice. Also checks
 * `defineMetrics` as ported.
 */
import { describe, expect, it } from 'vitest'
import { ID as AUDIT } from '@/views/audit/metrics'
import { ID as FINANCE } from '@/views/finance/metrics'
import { ID as FORECAST } from '@/views/forecast/metrics'
import { ID as PLAN } from '@/views/plan/metrics'
import { ID as REQUESTS, PARAM as REQUESTS_PARAM } from '@/views/requests/metrics'
import { ID as TARGETS } from '@/views/targets/metrics'
import { ID as TEAM, PARAM as TEAM_PARAM } from '@/views/team/metrics'
import { ID as WHATIF } from '@/views/whatif/metrics'
import { defineMetrics } from './define'
import { COST_GUARD_RULE_IDS, PRIVACY_RULE_IDS, RULE_ID, RULE_SETTINGS } from './rules'

/** Section 12's table, by home view, in order. */
const PLAN_12: Record<string, readonly string[]> = {
  team: [
    'team.allocation.heads',
    'team.allocation.filled',
    'team.allocation.open',
    'team.allocation.planned',
    'team.allocation.leftToFill',
    'team.allocation.leftToRequest',
    'team.requests.pending',
    'team.budget.status',
    'team.trade.standardHeads',
  ],
  plan: [
    'plan.heads.plan',
    'plan.heads.approved',
    'plan.heads.actual',
    'plan.heads.notInPlan',
    'plan.fte.average',
    'plan.hires.ytd',
    'plan.hires.planned',
    'plan.exits.ytd',
    'plan.positions.byStatus',
    'plan.openings.count',
    'plan.openings.age',
    'plan.openings.pastStart',
    'plan.openings.noReq',
    'plan.openings.frozen',
    'plan.offers.accepted',
    'plan.reqs.notInPlan',
    'plan.transfers.open',
    'plan.leave.onLeave',
    'plan.cost.loaded',
    'plan.cost.loadedInclSbc',
    'plan.cost.component',
    'plan.cost.perHead',
    'plan.cost.openBand',
    'plan.cost.bandEstimate',
    'plan.trade.weight',
    // Plan > Hiring (9.7, change C36).
    'plan.hiring.approvedByQuarter',
    'plan.hiring.currentHeads',
    'plan.hiring.acceptedStarts',
    'plan.hiring.open',
    'plan.hiring.openByQuarter',
    'plan.hiring.newByQuarter',
    'plan.hiring.expectedExits',
    'plan.hiring.toReachPlan',
    'plan.hiring.hiresByMonth',
    'plan.hiring.exitsByMonth',
    'plan.hiring.pace',
    'plan.hiring.exitPace',
    'plan.hiring.netPace',
    'plan.hiring.attritionRate',
    'plan.hiring.neededPace',
    'plan.hiring.monthsToClose',
  ],
  requests: [
    'requests.queue.open',
    'requests.queue.waiting',
    'requests.queue.sentBack',
    'requests.queue.expired',
    'requests.tracker.daysInStep',
    'requests.chain.leaderThreshold',
    'requests.cycle.notSubmitted',
    'requests.cycle.asks',
    'requests.cycle.aboveCut',
    'requests.flags.backfillNewPosition',
    'requests.flags.backfillNoExit',
    'requests.flags.freezeExceptions',
    'requests.trade.ratio',
    'requests.trade.credit',
  ],
  forecast: [
    'forecast.heads.monthEnd',
    'forecast.heads.yearEnd',
    'forecast.fte.average',
    'forecast.starts.expected',
    'forecast.starts.unfilled',
    'forecast.exits.rate',
    'forecast.exits.known',
    'forecast.exits.modeled',
    'forecast.backfills.modeled',
    'forecast.cost.fullYear',
    'forecast.cost.exitRunRate',
    'forecast.accuracy.cost',
    'forecast.accuracy.heads',
    'forecast.variance.heads',
    'forecast.variance.fte',
    'forecast.variance.cost',
    'forecast.bridge.step',
    'forecast.fx.effect',
  ],
  targets: [
    'targets.target.heads',
    'targets.target.cost',
    'targets.asks.heads',
    'targets.asks.cost',
    'targets.gap.heads',
    'targets.gap.cost',
    'targets.subOrg.unallocated',
    'targets.tree.costCenter',
    'targets.trades.heads',
  ],
  whatif: ['whatif.delta.heads', 'whatif.delta.cost', 'whatif.delta.gap'],
  finance: [
    'finance.versions.locked',
    'finance.close.adjustments',
    'finance.freeze.savings',
    'finance.recon.exceptions',
    'finance.recon.costCenterMismatch',
    'finance.trade.standardHead',
  ],
  audit: ['audit.entries.count'],
}

const BY_VIEW: Record<string, Readonly<Record<string, string>>> = {
  team: TEAM,
  plan: PLAN,
  requests: REQUESTS,
  forecast: FORECAST,
  targets: TARGETS,
  whatif: WHATIF,
  finance: FINANCE,
  audit: AUDIT,
}

describe('frozen metric ids', () => {
  it('each view registers exactly its section 12 ids, in order, under its own prefix', () => {
    for (const [view, ids] of Object.entries(PLAN_12)) {
      const got = Object.values(BY_VIEW[view])
      expect(got, view).toEqual(ids)
      for (const id of got) {
        expect(id.startsWith(`${view}.`), id).toBe(true)
        expect(id.split('.'), id).toHaveLength(3)
      }
    }
  })

  it('no id is registered twice', () => {
    const all = [...Object.values(BY_VIEW).flatMap((m) => Object.values(m)), ...Object.values(RULE_ID)]
    // 85 view ids and 6 rules, plus Plan > Hiring's 16 (9.7, change C36).
    expect(all).toHaveLength(85 + 16 + 6)
    expect(new Set(all).size).toBe(all.length)
  })

  it('rule ids use the shared prefixes, and every rule has a locked setting', () => {
    expect([...PRIVACY_RULE_IDS].every((id) => id.startsWith('privacy.'))).toBe(true)
    expect([...COST_GUARD_RULE_IDS].every((id) => id.startsWith('cost.guard.'))).toBe(true)
    expect(RULE_SETTINGS.map((s) => s.metricId)).toEqual(Object.values(RULE_ID))
    for (const s of RULE_SETTINGS) expect(s.locked, s.metricId).toBeTruthy()
  })

  it('settings name ids of their own view', () => {
    expect(TEAM_PARAM.atRiskShare.metricId).toBe('team.budget.status')
    expect(REQUESTS_PARAM.leaderThresholdUsd).toEqual({
      metricId: 'requests.chain.leaderThreshold',
      key: 'bandEstimateUsd',
    })
  })
})

describe('defineMetrics', () => {
  it('puts the home view first and fills params', () => {
    const [m] = defineMetrics('plan', [
      {
        id: 'plan.heads.approved',
        name: 'Approved heads',
        definition: 'Seats approved for the fiscal year.',
        unit: 'int',
        goodDirection: null,
        uses: [],
        views: ['home', 'plan', 'targets'],
      },
    ])
    expect(m.views).toEqual(['plan', 'home', 'targets'])
    expect(m.params).toEqual([])
  })
})
