/**
 * The assembled catalog against docs/PLAN.md 12: every check passes; every entry has a formula and
 * every data metric a population and a window; ids equal the views' frozen `ID` maps, in order;
 * views, units, owners, settings and the Guard column are the plan's; the rules are locked; and the
 * wording keeps the copy rules (14.3), with no amount in anything Manager mode can read.
 */
import { describe, expect, it } from 'vitest'
import { ID as ACTIONS, PARAM as ACTIONS_PARAM } from '@/views/actions/metrics'
import { ID as AUDIT } from '@/views/audit/metrics'
import { ID as DATA } from '@/views/data/roomMetrics'
import { ID as FINANCE } from '@/views/finance/metrics'
import { ID as FORECAST } from '@/views/forecast/metrics'
import { ID as PLAN, PARAM as PLAN_PARAM } from '@/views/plan/metrics'
import { ID as REQUESTS, PARAM as REQUESTS_PARAM } from '@/views/requests/metrics'
import { ID as TARGETS } from '@/views/targets/metrics'
import { ID as TEAM, PARAM as TEAM_PARAM } from '@/views/team/metrics'
import { ID as WHATIF } from '@/views/whatif/metrics'
import { CATALOG, METRICS, metricsOfView, VIEW_METRICS } from './catalog'
import { COST_GUARD_METRICS } from './costGuard'
import { defineMetrics } from './define'
import {
  COMPONENT_METRICS,
  LEAVE_HIDDEN_IN,
  LEAVE_PREFIX,
  MANAGER_HIDDEN_PREFIXES,
  MANAGER_HIDDEN_RULES,
  METRIC_GUARD,
  managerHides,
  ROUNDED_COST_PERIODS,
  ROUNDED_MODES,
  roundedHides,
  showsMoney,
} from './guardClass'
import { formatParam } from './params'
import { PRIVACY_METRICS } from './privacy'
import { QUALITY_METRICS, QUALITY_RULES } from './quality'
import { paramOf, readsNoData, validateCatalog, withRequired } from './registry'
import { COST_GUARD_RULE_IDS, PRIVACY_RULE_IDS, RULE_ID, RULE_SETTINGS } from './rules'
import { FIXTURE_DEFS } from './test-fixtures'
import type { MetricDef, MetricView } from './types'
import { SHOWN_IN_FINANCE, WINDOW } from './wording'

const ID_MAPS: Record<string, Readonly<Record<string, string>>> = {
  team: TEAM,
  plan: PLAN,
  requests: REQUESTS,
  forecast: FORECAST,
  targets: TARGETS,
  whatif: WHATIF,
  finance: FINANCE,
  audit: AUDIT,
  actions: ACTIONS,
  data: DATA,
}
const PARAM_MAPS = [TEAM_PARAM, PLAN_PARAM, REQUESTS_PARAM, ACTIONS_PARAM]

/** Section 12's table: id → [unit, views (home first)]. */
const TABLE: Record<string, [string, MetricView[]]> = {
  'team.allocation.heads': ['int', ['team']],
  'team.allocation.filled': ['int', ['team']],
  'team.allocation.open': ['int', ['team']],
  'team.allocation.planned': ['int', ['team']],
  'team.allocation.leftToFill': ['int', ['team']],
  'team.allocation.leftToRequest': ['int', ['team']],
  'team.requests.pending': ['int', ['team']],
  'team.budget.status': ['text', ['team']],
  'team.trade.standardHeads': ['num2', ['team']],
  'plan.heads.plan': ['int', ['plan', 'home', 'forecast']],
  'plan.heads.approved': ['int', ['plan', 'home', 'targets']],
  'plan.heads.actual': ['int', ['plan', 'home', 'finance']],
  'plan.heads.notInPlan': ['int', ['plan', 'finance']],
  'plan.fte.average': ['num1', ['plan', 'forecast']],
  'plan.hires.ytd': ['int', ['plan', 'home']],
  'plan.hires.planned': ['int', ['plan', 'home']],
  'plan.exits.ytd': ['int', ['plan']],
  'plan.positions.byStatus': ['int', ['plan', 'team']],
  'plan.openings.count': ['int', ['plan']],
  'plan.openings.age': ['days', ['plan']],
  'plan.openings.pastStart': ['int', ['plan', 'home']],
  'plan.openings.noReq': ['int', ['plan', 'home']],
  'plan.openings.frozen': ['int', ['plan', 'home', 'finance']],
  'plan.offers.accepted': ['int', ['plan']],
  'plan.reqs.notInPlan': ['int', ['plan', 'home', 'finance']],
  'plan.transfers.open': ['int', ['plan']],
  'plan.leave.onLeave': ['int', ['plan']],
  'plan.cost.loaded': ['money', ['plan', 'forecast', 'targets', 'home']],
  'plan.cost.loadedInclSbc': ['money', ['plan', 'forecast']],
  'plan.cost.component': ['money', ['plan', 'finance']],
  'plan.cost.perHead': ['money', ['plan']],
  'plan.cost.openBand': ['money', ['plan', 'forecast']],
  'plan.cost.bandEstimate': ['money', ['plan', 'requests']],
  'plan.trade.weight': ['num2', ['plan', 'requests', 'team']],
  // Plan > Hiring (9.7, C36): units int, num1 (paces, months, exits) and pct1 (attrition, 'pct').
  'plan.hiring.approvedByQuarter': ['int', ['plan']],
  'plan.hiring.currentHeads': ['int', ['plan']],
  'plan.hiring.acceptedStarts': ['int', ['plan']],
  'plan.hiring.open': ['int', ['plan', 'home', 'team']],
  'plan.hiring.openByQuarter': ['int', ['plan']],
  'plan.hiring.newByQuarter': ['int', ['plan']],
  'plan.hiring.expectedExits': ['num1', ['plan']],
  'plan.hiring.toReachPlan': ['num1', ['plan']],
  'plan.hiring.hiresByMonth': ['int', ['plan']],
  'plan.hiring.exitsByMonth': ['int', ['plan']],
  'plan.hiring.pace': ['num1', ['plan']],
  'plan.hiring.exitPace': ['num1', ['plan']],
  'plan.hiring.netPace': ['num1', ['plan']],
  'plan.hiring.attritionRate': ['pct', ['plan']],
  'plan.hiring.neededPace': ['num1', ['plan']],
  'plan.hiring.monthsToClose': ['num1', ['plan']],
  'plan.hiring.movesIn': ['int', ['plan']],
  'plan.hiring.recentHires': ['int', ['plan']],
  // Plan > Recruiting summary (9.8, change C38): heads only, one decimal (the forecast's model).
  'plan.recruiting.projectedStarts': ['num1', ['plan']],
  'plan.recruiting.projectedHeads': ['num1', ['plan']],
  'plan.recruiting.gapToApproved': ['num1', ['plan']],
  'requests.queue.open': ['int', ['requests', 'home']],
  'requests.queue.waiting': ['int', ['requests', 'home']],
  'requests.queue.sentBack': ['int', ['requests']],
  'requests.queue.expired': ['int', ['requests']],
  'requests.tracker.daysInStep': ['days', ['requests', 'team']],
  'requests.chain.leaderThreshold': ['money', ['requests']],
  'requests.cycle.notSubmitted': ['int', ['requests', 'home']],
  'requests.cycle.asks': ['int', ['requests', 'targets']],
  'requests.cycle.aboveCut': ['int', ['requests']],
  'requests.flags.backfillNewPosition': ['int', ['requests', 'finance']],
  'requests.flags.backfillNoExit': ['int', ['requests', 'finance']],
  'requests.flags.freezeExceptions': ['int', ['requests', 'finance']],
  'requests.trade.ratio': ['num2', ['requests', 'whatif']],
  'requests.trade.credit': ['num2', ['requests', 'team', 'targets']],
  'forecast.heads.monthEnd': ['num1', ['forecast']],
  'forecast.heads.yearEnd': ['num1', ['forecast', 'home', 'targets']],
  'forecast.fte.average': ['num1', ['forecast']],
  'forecast.starts.expected': ['num1', ['forecast']],
  'forecast.starts.unfilled': ['num1', ['forecast']],
  'forecast.exits.rate': ['pct2', ['forecast']],
  'forecast.exits.known': ['int', ['forecast']],
  'forecast.exits.modeled': ['num2', ['forecast']],
  'forecast.backfills.modeled': ['num2', ['forecast']],
  'forecast.cost.fullYear': ['money', ['forecast', 'home', 'targets']],
  'forecast.cost.exitRunRate': ['money', ['forecast', 'targets', 'home']],
  'forecast.accuracy.cost': ['pct', ['forecast', 'finance']],
  'forecast.accuracy.heads': ['pct', ['forecast']],
  'forecast.variance.heads': ['num1', ['forecast', 'home']],
  'forecast.variance.fte': ['num1', ['forecast']],
  'forecast.variance.cost': ['money', ['forecast', 'home']],
  'forecast.bridge.step': ['money', ['forecast', 'home']],
  'forecast.fx.effect': ['money', ['forecast', 'home', 'finance']],
  'targets.target.heads': ['int', ['targets', 'home']],
  'targets.target.cost': ['money', ['targets', 'home']],
  'targets.asks.heads': ['int', ['targets', 'home']],
  'targets.asks.cost': ['money', ['targets']],
  'targets.gap.heads': ['int', ['targets', 'home', 'requests']],
  'targets.gap.cost': ['money', ['targets', 'home']],
  'targets.subOrg.unallocated': ['int', ['targets', 'home']],
  'targets.tree.costCenter': ['int', ['targets']],
  'targets.trades.heads': ['int', ['targets']],
  'whatif.delta.heads': ['num1', ['whatif']],
  'whatif.delta.cost': ['money', ['whatif']],
  'whatif.delta.gap': ['num1', ['whatif']],
  'finance.versions.locked': ['int', ['finance']],
  'finance.close.adjustments': ['int', ['finance']],
  'finance.freeze.savings': ['money', ['finance', 'home']],
  'finance.recon.exceptions': ['int', ['finance', 'home']],
  'finance.recon.costCenterMismatch': ['int', ['finance']],
  'finance.trade.standardHead': ['money', ['finance', 'requests']],
  'audit.entries.count': ['int', ['audit']],
  'actions.items.open': ['int', ['actions']],
  'actions.items.overdue': ['int', ['actions']],
  'actions.items.dueSoon': ['int', ['actions']],
  'actions.items.critical': ['int', ['actions']],
  'actions.owners.withOpen': ['int', ['actions']],
  'data.coverage.byMonth': ['int', ['data']],
  'data.quality.metricTiers': ['int', ['data']],
}

/** Section 12's Guard column, for every id whose guard is not "–". */
const GUARD_TABLE: Record<string, string> = {
  'plan.leave.onLeave': 'leave',
  'plan.cost.loaded': 'G',
  'plan.cost.loadedInclSbc': 'G',
  'plan.cost.component': 'G',
  'plan.cost.perHead': 'G',
  'plan.cost.openBand': 'B',
  'plan.cost.bandEstimate': 'B',
  'requests.chain.leaderThreshold': 'B',
  'requests.cycle.asks': 'B',
  'forecast.cost.fullYear': 'G',
  'forecast.cost.exitRunRate': 'G',
  'forecast.accuracy.cost': 'G',
  'forecast.variance.cost': 'G D',
  'forecast.bridge.step': 'G D',
  'forecast.fx.effect': 'G D',
  'targets.target.cost': 'input',
  'targets.asks.cost': 'G B',
  'targets.gap.cost': 'G D',
  'targets.subOrg.unallocated': 'input',
  'targets.tree.costCenter': 'G',
  'whatif.delta.cost': 'B D',
  'finance.close.adjustments': 'G D',
  'finance.freeze.savings': 'B',
  'finance.trade.standardHead': 'B',
}

/** Section 12: what Manager mode hides, by prefix (the plan's list, kept apart from the data). */
const MANAGER_HIDES = [
  'plan.cost.',
  'forecast.cost.',
  'forecast.variance.cost',
  'forecast.bridge.',
  'forecast.fx.',
  'forecast.accuracy.cost',
  'targets.target.cost',
  'targets.asks.cost',
  'targets.gap.cost',
  'whatif.',
  'finance.',
  'requests.chain.',
]

/** Section 12 and 7.3: what HRBP and Leader mode hide through `cost:component`. */
const COMPONENT_HIDES = [
  'plan.cost.component',
  'plan.cost.loadedInclSbc',
  'forecast.cost.exitRunRate',
  'finance.freeze.savings',
]

const byId = (id: string): MetricDef => {
  const d = CATALOG.byId.get(id)
  if (!d) throw new Error(`${id} is not registered`)
  return d
}

/** Every piece of wording an entry shows: its own fields, its settings' words and their values. */
function wordsOf(d: MetricDef): string[] {
  return [
    d.name,
    d.definition,
    d.formula ?? '',
    d.population ?? '',
    d.window ?? '',
    ...d.params.flatMap((p) => [p.label, p.description, formatParam(p, p.default)]),
  ]
}

describe('the catalog', () => {
  it('passes every check: ids, wording, views, lineage, settings and targets', () => {
    expect(validateCatalog(METRICS)).toEqual([])
    expect(validateCatalog(FIXTURE_DEFS)).toEqual([])
    for (const defs of Object.values(VIEW_METRICS)) expect(validateCatalog(defs ?? [])).toEqual([])
  })

  it('gives every entry a formula, and every data metric a population and a window', () => {
    expect(METRICS.filter((d) => !d.formula?.trim()).map((d) => d.id)).toEqual([])
    const data = METRICS.filter((d) => !readsNoData(d))
    // 91 before the hiring freeze, plus Plan > Hiring's 16 (9.7, C36), C37's 2 and Plan > Recruiting
    // summary's 3 (9.8, C38).
    expect(data.length).toBe(112)
    expect(data.filter((d) => !d.population?.trim() || !d.window?.trim()).map((d) => d.id)).toEqual([])
  })

  it('holds exactly the ids of the views’ ID maps, in their order, then the rules', () => {
    for (const [view, ids] of Object.entries(ID_MAPS)) {
      expect(
        VIEW_METRICS[view as MetricView]?.map((d) => d.id),
        view,
      ).toEqual(Object.values(ids))
      expect(
        CATALOG.list.filter((d) => d.views[0] === view && d.id.startsWith(`${view}.`)).map((d) => d.id),
        view,
      ).toEqual(Object.values(ids))
    }
    expect(PRIVACY_METRICS.map((d) => d.id)).toEqual([...PRIVACY_RULE_IDS])
    expect(COST_GUARD_METRICS.map((d) => d.id)).toEqual([...COST_GUARD_RULE_IDS])
    expect(QUALITY_METRICS.map((d) => d.id)).toEqual(Object.values(QUALITY_RULES).map((r) => r.metricId))
    expect(CATALOG.list.map((d) => d.id)).toEqual([
      ...Object.values(ID_MAPS).flatMap((m) => Object.values(m)),
      ...PRIVACY_RULE_IDS,
      ...COST_GUARD_RULE_IDS,
      ...QUALITY_METRICS.map((d) => d.id),
    ])
    expect(CATALOG.list).toHaveLength(METRICS.length)
  })

  it('has section 12’s unit and views for every metric', () => {
    const ids = Object.values(ID_MAPS).flatMap((m) => Object.values(m))
    expect(Object.keys(TABLE)).toEqual(ids)
    for (const [id, [unit, views]] of Object.entries(TABLE)) {
      expect(byId(id).unit, id).toBe(unit)
      expect(byId(id).views, id).toEqual(views)
    }
    expect(metricsOfView('home').map((d) => d.id)).toContain('forecast.cost.fullYear')
    expect(metricsOfView('audit').map((d) => d.id)).toEqual(['audit.entries.count'])
  })

  it('names section 12’s owners', () => {
    const owner = (id: string): string => {
      if (/^(plan\.cost|plan\.trade|forecast|targets|finance|whatif)\./.test(id)) return 'Finance'
      if (/^(team|plan|requests)\./.test(id)) return 'HR business partners'
      return 'People analytics'
    }
    for (const d of METRICS) expect(d.owner, d.id).toBe(owner(d.id))
  })

  it('registers exactly the settings the views’ PARAM maps name, with section 12’s defaults', () => {
    const refs = PARAM_MAPS.flatMap((m) => Object.values(m)).map((r) => `${r.metricId}#${r.key}`)
    const registered = Object.values(VIEW_METRICS).flatMap((defs) =>
      (defs ?? []).flatMap((d) => d.params.map((p) => `${d.id}#${p.key}`)),
    )
    expect(registered.sort()).toEqual([...refs].sort())
    const param = (r: { metricId: string; key: string }) => paramOf(byId(r.metricId), r.key)!
    expect(param(TEAM_PARAM.atRiskShare)).toMatchObject({ type: 'percent', default: 0.02 })
    expect(param(PLAN_PARAM.noReqDays)).toMatchObject({ type: 'days', default: 45 })
    expect(param(REQUESTS_PARAM.waitingDays)).toMatchObject({ type: 'days', default: 5 })
    expect(param(REQUESTS_PARAM.idleDays)).toMatchObject({ type: 'days', default: 60 })
    expect(param(REQUESTS_PARAM.backfillWindowDays)).toMatchObject({ type: 'days', default: 30 })
    expect(param(ACTIONS_PARAM.snoozeDays)).toMatchObject({ type: 'days', default: 7 })
    expect(param(ACTIONS_PARAM.dueSoonDays)).toMatchObject({ type: 'days', default: 7 })
    expect(param(ACTIONS_PARAM.blockedDays)).toMatchObject({ type: 'days', default: 14 })
    // The leader threshold is a locked setting (10.2): routing never moves while a request waits.
    expect(param(REQUESTS_PARAM.leaderThresholdUsd)).toMatchObject({ default: 250_000, locked: true })
    expect(byId(REQUESTS.chainLeaderThreshold).kind).toBe('setting')
  })

  it('keeps the privacy and cost guard rules locked, with the frozen settings', () => {
    for (const s of RULE_SETTINGS) {
      const d = byId(s.metricId)
      expect(d.locked, d.id).toBe(true)
      expect(d.kind, d.id).toBe('rule')
      expect(readsNoData(d), d.id).toBe(true)
      expect(d.params).toHaveLength(1)
      expect(d.params[0], d.id).toMatchObject({ key: s.key, default: s.default, locked: s.locked })
    }
  })

  it('records section 12’s Guard column, and Manager mode’s prefixes cover every whole money metric', () => {
    expect(Object.keys(METRIC_GUARD)).toEqual(Object.keys(GUARD_TABLE))
    for (const [id, guard] of Object.entries(GUARD_TABLE)) {
      expect(CATALOG.byId.has(id), id).toBe(true)
      expect(METRIC_GUARD[id].classes.join(' '), id).toBe(guard)
    }
    // Every amount-valued metric is in the Guard column.
    for (const d of METRICS)
      if (d.unit === 'money' && !d.id.startsWith('cost.guard.')) expect(showsMoney(d.id), d.id).toBe(true)
    // A metric whose every value is money is hidden by one of Manager mode's prefixes.
    for (const [id, g] of Object.entries(METRIC_GUARD))
      if (!g.part && showsMoney(id))
        expect(
          MANAGER_HIDES.some((p) => id.startsWith(p)),
          id,
        ).toBe(true)
  })

  it('makes every cost amount depend on the guard rules that hide it', () => {
    const GUARDED = [RULE_ID.minCosted, RULE_ID.floorUsd]
    for (const [id, g] of Object.entries(METRIC_GUARD)) {
      const deps = byId(id).dependsOn ?? []
      // G: 5 or more costed people (7.2 rule 1), rounded per atom in HRBP and Leader mode (7.3a).
      if (g.classes.includes('G')) for (const r of GUARDED) expect(deps, id).toContain(r)
      // D: 5 or more contributors (rule 5), between two guarded totals built from rounded parts
      // in HRBP and Leader mode (7.3c).
      if (g.classes.includes('D'))
        for (const r of [...GUARDED, RULE_ID.minContributors]) expect(deps, id).toContain(r)
      // An input (a target's cost) is floored for HRBP and Leader (section 12).
      if (g.classes.includes('input')) expect(deps, id).toContain(RULE_ID.floorUsd)
      // Only a displayed difference reads the contributors rule.
      if (!g.classes.includes('D')) expect(deps, id).not.toContain(RULE_ID.minContributors)
    }
    expect(byId(PLAN.leaveOnLeave).dependsOn).toEqual([RULE_ID.leaveCounts])
    // Band figures of one seat or request read no pay: no guard rule changes them.
    for (const id of [
      PLAN.costBandEstimate,
      FINANCE.tradeStandardHead,
      REQUESTS.chainLeaderThreshold,
      FINANCE.freezeSavings,
    ])
      expect(byId(id).dependsOn, id).toBeUndefined()
    // The Open and Planned line is each atom's band part, rounded on its own (7.2 rule 3, 7.3a).
    expect(byId(PLAN.costOpenBand).dependsOn).toEqual(GUARDED)
    // Rules never depend on other entries, and no entry names the anonymity minimum (it is implied).
    for (const d of METRICS) {
      if (d.kind === 'rule') expect(d.dependsOn, d.id).toBeUndefined()
      expect(d.dependsOn ?? [], d.id).not.toContain(RULE_ID.anonymity)
    }
  })

  it('holds section 12’s hiding notes as data', () => {
    expect(MANAGER_HIDDEN_PREFIXES).toEqual(MANAGER_HIDES)
    expect(MANAGER_HIDDEN_RULES).toEqual([RULE_ID.floorUsd])
    expect(LEAVE_PREFIX).toBe('plan.leave.')
    expect(LEAVE_HIDDEN_IN).toEqual(['manager', 'finance'])
    expect(COMPONENT_METRICS).toEqual(COMPONENT_HIDES)
    expect(ROUNDED_MODES).toEqual(['hrbp', 'leader'])
    expect(ROUNDED_COST_PERIODS).toEqual(['fy', 'ytd', 'qtd'])
    // Manager mode hides every G, B and D metric, the leave count and the rounding step.
    for (const [id, g] of Object.entries(METRIC_GUARD))
      if (g.classes.some((c) => c === 'G' || c === 'B' || c === 'D') && !g.part)
        expect(managerHides(id), id).toBe(true)
    expect(managerHides(PLAN.leaveOnLeave)).toBe(true)
    expect(managerHides(RULE_ID.floorUsd)).toBe(true)
    // The prefixes hide What if and Finance whole; My team's own entries all show.
    expect(managerHides(WHATIF.deltaHeads)).toBe(true)
    expect(managerHides(FINANCE.versionsLocked)).toBe(true)
    for (const id of Object.values(TEAM)) expect(managerHides(id), id).toBe(false)
    // What HRBP and Leader mode hide through cost:component is money they would otherwise read,
    // and says where it shows.
    for (const id of COMPONENT_METRICS) {
      expect(roundedHides(id), id).toBe(true)
      expect(showsMoney(id), id).toBe(true)
      expect(byId(id).definition, id).toContain(SHOWN_IN_FINANCE)
    }
    for (const d of METRICS)
      if (!roundedHides(d.id)) expect(d.definition, d.id).not.toContain(SHOWN_IN_FINANCE)
    // Every other money figure keeps to the rounded modes' periods: none takes a month or a
    // custom range from the period picker, or its window says how HRBP and Leader mode limit it.
    for (const id of Object.keys(METRIC_GUARD))
      if (showsMoney(id) && !roundedHides(id))
        expect([WINDOW.period, WINDOW.comparison], id).not.toContain(byId(id).window)
  })

  it('names leave fields only in the leave count', () => {
    for (const d of METRICS) {
      const leaveFields = d.uses.filter((r) => r === 'workers.onLeave' || r === 'workers.leavePaid')
      expect(leaveFields.length > 0, d.id).toBe(d.id === PLAN.leaveOnLeave)
    }
  })
})

describe('the wording', () => {
  const BANNED_MODE_WORDS =
    /\baccess\b|\bpermissions?\b|\brestricted\b|\bsecure\b|locked down|\bauthori[sz]ed\b|role-based access/i
  const NAGGING = /\b(chase|nag|ping|hound|remind|unblock)\w*/i
  const TAMPER = /tamper[\s-]?proof/i
  const EMOJI = /\p{Extended_Pictographic}/u
  /** A currency sign, an ISO currency code or a grouped number (the Manager amount scan, 16.1). */
  const AMOUNT = /[$€£₹₪¥]|\b(USD|EUR|GBP|INR|ILS|TWD|JPY|CNY|SGD|CAD|CHF)\b|\d{1,3}(,\d{3})+/

  it('keeps the copy rules in every entry', () => {
    for (const d of [...METRICS, ...FIXTURE_DEFS])
      for (const w of wordsOf(d)) {
        expect(w, d.id).not.toMatch(BANNED_MODE_WORDS)
        expect(w, d.id).not.toMatch(NAGGING)
        expect(w, d.id).not.toMatch(TAMPER)
        expect(w, d.id).not.toMatch(EMOJI)
        expect(w, d.id).not.toMatch(/!/)
      }
  })

  it('writes names in sentence case', () => {
    // Words that keep their capital: acronyms, statuses, modes and step names.
    const keep = /^(HRBP|Leader|SBC|FX|FTE|HRIS|Open|Planned|Filled|USD|Director)$/
    for (const d of METRICS) {
      const [first, ...rest] = d.name.split(/\s+/)
      expect(first[0], d.id).toBe(first[0].toUpperCase())
      for (const w of rest) if (/^[A-Z]/.test(w)) expect(w, `${d.id}: ${d.name}`).toMatch(keep)
    }
  })

  it('names no amount in anything Manager mode can read', () => {
    // Manager mode hides every whole money metric (section 12) and the rounding step, the one
    // rule with an amount (`MANAGER_HIDDEN_RULES`).
    const readable = METRICS.filter((d) => !managerHides(d.id))
    expect(readable.length).toBeGreaterThan(50)
    for (const d of readable) for (const w of wordsOf(d)) expect(w, d.id).not.toMatch(AMOUNT)
  })

  it('says nothing about leave outside the leave entries', () => {
    const leave = new Set<string>([PLAN.leaveOnLeave, RULE_ID.leaveCounts])
    for (const d of METRICS)
      if (!leave.has(d.id)) for (const w of wordsOf(d)) expect(w, d.id).not.toMatch(/\bleave\b/i)
  })
})

describe('defining and assembling', () => {
  it('puts the defining view first', () => {
    const [d] = defineMetrics('targets', [
      {
        id: 'targets.a.b',
        name: 'A',
        definition: 'B.',
        unit: 'int',
        goodDirection: null,
        uses: [],
        views: ['home', 'targets'],
      },
    ])
    expect(d.views).toEqual(['targets', 'home'])
    expect(d.params).toEqual([])
  })

  it("adds a required setting a view's own entry leaves out, keeping the view's wording", () => {
    const own = defineMetrics('requests', [
      {
        id: REQUESTS.queueWaiting,
        name: 'Waiting',
        definition: 'Ours.',
        unit: 'int',
        goodDirection: null,
        uses: [],
      },
    ])
    const out = withRequired(
      own,
      CATALOG.list.filter((d) => d.id === REQUESTS.queueWaiting),
    )
    expect(out).toHaveLength(1)
    expect(out[0].definition).toBe('Ours.')
    expect(out[0].params.map((p) => p.key)).toEqual([REQUESTS_PARAM.waitingDays.key])
    expect(withRequired([], COST_GUARD_METRICS).map((d) => d.id)).toEqual([...COST_GUARD_RULE_IDS])
  })

  it('reports what is wrong with an entry', () => {
    const [good] = FIXTURE_DEFS
    const problems = validateCatalog([
      good,
      { ...good },
      {
        ...good,
        id: 'targets.x',
        definition: 'Ready now — or soon!',
        uses: ['workers.gender' as never],
        params: [
          { key: 'Bad key', label: '', description: 'x', type: 'days', default: 2.5, min: 10, max: 5 },
        ],
      },
      { ...good, id: 'cost.guard.extra', views: ['nowhere' as MetricView], dependsOn: ['cost.guard.gone'] },
    ])
    expect(problems).toEqual([
      'forecast.exits.attrition: the id is registered twice.',
      'targets.x: the id must start with its home view (forecast).',
      'targets.x: uses workers.gender, which is not in the schema.',
      'targets.x setting Bad key: the key must be camelCase.',
      'targets.x setting Bad key: needs a label.',
      'targets.x setting Bad key: min is above max.',
      'targets.x setting Bad key: the default is not valid (: enter a whole number of days.)',
      'targets.x: definition uses an em dash; write two sentences instead.',
      'targets.x: definition has an exclamation mark.',
      'cost.guard.extra: unknown view nowhere.',
      'cost.guard.extra: depends on cost.guard.gone, which is not registered.',
    ])
  })
})
