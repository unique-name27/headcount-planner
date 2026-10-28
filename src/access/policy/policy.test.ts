/**
 * The policy engine (docs/PLAN.md 8.3 and 16.1): every surface id sections 8 to 11 name, and every
 * action, has an explicit decision in every mode (never the "Not named" default), with a sentence on
 * each limited or hidden one; the tables are plain data (a JSON round trip); the pay, leave and cost
 * surfaces follow the pay and leave views; the as-of date changes only in HR admin; `request.import`
 * is limited for Leader with its reason; the mode homes show; the route helpers agree with the
 * tables; Plan > Hiring's surfaces (docs/PLAN.md 9.7, change C36) are decided in every mode, its
 * metrics shown in every mode, and every column its drills leave out is one some mode would show; and
 * Plan > Recruiting summary's (9.8, change C38) are decided and shown in every mode, named in each
 * mode's own table right after Hiring.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  ACTION_IDS,
  HIRING_AT,
  HIRING_DRILL_HIDE,
  HIRING_DRILL_KINDS,
  HIRING_SURFACES,
  METRIC_IDS,
  NAMED_SURFACES,
  RECRUITING_AT,
  RECRUITING_FIGURE_IDS,
  RECRUITING_KPI_IDS,
  RECRUITING_SURFACES,
  VIEW_TABS,
} from '../ids'
import { LEAVE_OF, leaveDecisions } from '../leave'
import { HOME_OF, MODE_NAME, MODES, type Mode } from '../modes'
import { costDecisions, PAY_OF, payDecisions } from '../pay'
import { actionsFor } from './actions'
import {
  can,
  decide,
  firstShownTab,
  notNamedOf,
  policyOf,
  ROLE_POLICY,
  routeShown,
  tableHidesMetricId,
} from './index'

const notNamed = (m: Mode) => notNamedOf(ROLE_POLICY[m]).how

describe('a decision for every surface, action and mode', () => {
  it('decides every named surface explicitly in every mode', () => {
    expect(NAMED_SURFACES.length).toBeGreaterThan(300)
    for (const m of MODES)
      for (const s of NAMED_SURFACES) {
        const d = decide(m, s)
        expect(['shown', 'limited', 'hidden'], `${m} ${s}`).toContain(d.access)
        expect(d.how, `${m} ${s}`).not.toBe(notNamed(m))
        if (d.access !== 'shown') expect(d.how, `${m} ${s}`).toBeTruthy()
      }
  })

  it('decides every action id in every mode, one decision each', () => {
    for (const m of MODES) {
      const t = ROLE_POLICY[m]
      expect(Object.keys(t.actions), m).toEqual([...ACTION_IDS])
      expect(t.actions).toEqual(actionsFor(m))
      for (const a of ACTION_IDS) {
        const d = decide(m, `action:${a}`)
        expect(d, `${m} ${a}`).toBe(t.actions[a])
        if (d.access !== 'shown') expect(d.how, `${m} ${a}`).toMatch(/^[A-Z].*\.$/)
      }
    }
  })

  it('hides anything a table does not name, saying so', () => {
    for (const m of MODES) {
      expect(decide(m, 'action:request.fly')).toEqual({
        access: 'hidden',
        how: `Not named by the ${MODE_NAME[m]} mode policy.`,
      })
      expect(decide(m, 'ask:anything').access).toBe('hidden')
    }
  })
})

describe('the tables', () => {
  it('are plain data', () => {
    expect(JSON.parse(JSON.stringify(ROLE_POLICY))).toEqual(ROLE_POLICY)
    for (const m of MODES) {
      expect(ROLE_POLICY[m].mode).toBe(m)
      expect(policyOf(m)).toBe(ROLE_POLICY[m])
    }
  })

  it('name every view and page, and every tab of a view they show, in tab order', () => {
    for (const m of MODES) {
      const t = ROLE_POLICY[m]
      expect(Object.keys(t.views).sort(), m).toEqual(
        [...Object.keys(VIEW_TABS), 'data', 'actions', 'audit'].sort(),
      )
      for (const [view, defs] of Object.entries(VIEW_TABS)) {
        const shown = t.views[view as keyof typeof t.views].access !== 'hidden'
        const tabs = t.tabs[view as keyof typeof t.tabs]
        if (!shown) expect(tabs, `${m} ${view}`).toBeUndefined()
        else
          expect(
            tabs?.map((x) => x.key),
            `${m} ${view}`,
          ).toEqual(defs.map((d) => d.key))
      }
    }
  })

  it('show each mode its home, and only HR admin the Data room', () => {
    for (const m of MODES) {
      expect(routeShown(m, HOME_OF[m]), m).toBe(true)
      expect(can(m, 'page:data'), m).toBe(m === 'hr-admin')
      expect(can(m, 'view:home'), m).toBe(m !== 'hr-admin' && m !== 'manager')
      expect(can(m, 'view:team'), m).toBe(m === 'manager')
    }
  })

  it('follow the pay and leave views on the pay, leave and cost surfaces', () => {
    for (const m of MODES) {
      for (const [s, d] of Object.entries({ ...payDecisions(m), ...leaveDecisions(m), ...costDecisions(m) }))
        expect(decide(m, s), `${m} ${s}`).toEqual(d)
      expect(can(m, 'pay:switch'), m).toBe(PAY_OF[m] === 'switch')
      expect(can(m, 'pay:amounts'), m).toBe(PAY_OF[m] === 'switch')
      expect(can(m, 'pay:rounded'), m).toBe(PAY_OF[m] === 'rounded')
      expect(can(m, 'leave:counts'), m).toBe(LEAVE_OF[m] !== 'none')
      expect(can(m, 'leave:people'), m).toBe(LEAVE_OF[m] === 'switch')
      expect(can(m, 'cost:band'), m).toBe(PAY_OF[m] !== 'none')
    }
  })

  it('let only HR admin move the as-of date', () => {
    for (const m of MODES) {
      const d = decide(m, 'settings:data')
      if (m === 'hr-admin') expect(d.access).toBe('shown')
      else expect(d).toEqual({ access: 'hidden', how: 'The as-of date is set by HR admin.' })
    }
  })

  it('hide the two Leader cells no Leader action can use, with their reasons (M3 review SP-8, SP-18)', () => {
    // Approve with changes is the HRBP step's only; Move budget too? is set on the HRBP's form.
    expect(decide('leader', 'action:request.approve-with-changes')).toEqual({
      access: 'hidden',
      how: "Changes to a request are the HRBP's; leaders adjust the cycle within the envelope.",
    })
    expect(decide('leader', 'action:transfer.move-budget')).toEqual({
      access: 'hidden',
      how: 'Move budget too? is set when the HRBP processes the transfer.',
    })
    expect(decide('hrbp', 'action:request.approve-with-changes').access).toBe('shown')
    expect(decide('hrbp', 'action:transfer.move-budget').access).toBe('shown')
  })

  it('limit Import requests for Leader with its reason, and hide it in Manager mode', () => {
    expect(decide('leader', 'action:request.import')).toEqual({
      access: 'limited',
      how: 'Requests that touch your org or wait on you. Others in the file are left as they are.',
    })
    expect(decide('manager', 'action:request.import')).toEqual({
      access: 'hidden',
      how: 'Import requests is for HRBPs and above.',
    })
    for (const m of ['hrbp', 'finance', 'hr-admin'] as const)
      expect(decide(m, 'action:request.import').access).toBe('shown')
  })

  it('hide every money metric in Manager mode and leave in Manager and Finance', () => {
    const money = [
      'plan.cost.loaded',
      'plan.cost.bandEstimate',
      'forecast.cost.fullYear',
      'forecast.variance.cost',
      'forecast.bridge.step',
      'forecast.fx.effect',
      'forecast.accuracy.cost',
      'targets.target.cost',
      'targets.asks.cost',
      'targets.gap.cost',
      'whatif.delta.cost',
      'finance.trade.standardHead',
      'finance.freeze.savings',
      'requests.chain.leaderThreshold',
      // The rounding step, the one rule whose setting is an amount (MANAGER_HIDDEN_RULES, 7.6).
      'cost.guard.floorUsd',
    ]
    for (const id of money) {
      expect(METRIC_IDS, id).toContain(id)
      expect(decide('manager', `metric:${id}`).access, id).toBe('hidden')
      expect(tableHidesMetricId(ROLE_POLICY.manager, id), id).toBe(true)
    }
    for (const m of ['manager', 'finance'] as const)
      expect(decide(m, 'metric:plan.leave.onLeave').access).toBe('hidden')
    // Standard heads and trade weights show in every mode (11.6); the trade rate and credit too.
    for (const m of MODES)
      for (const id of [
        'plan.trade.weight',
        'team.trade.standardHeads',
        'requests.trade.ratio',
        'requests.trade.credit',
      ])
        expect(decide(m, `metric:${id}`).access, `${m} ${id}`).toBe('shown')
  })

  it("hide the rounded modes' Finance-only metrics (12)", () => {
    for (const m of ['hrbp', 'leader'] as const)
      for (const id of [
        'plan.cost.component',
        'plan.cost.loadedInclSbc',
        'forecast.cost.exitRunRate',
        'finance.freeze.savings',
        'forecast.accuracy.cost',
      ]) {
        expect(decide(m, `metric:${id}`).access, `${m} ${id}`).toBe('hidden')
        expect(decide('finance', `metric:${id}`).access, id).toBe('shown')
      }
    // The allow-list's figures stay (7.3).
    for (const m of ['hrbp', 'leader'] as const)
      for (const id of [
        'plan.cost.loaded',
        'forecast.cost.fullYear',
        'forecast.bridge.step',
        'targets.gap.cost',
      ])
        expect(decide(m, `metric:${id}`).access, `${m} ${id}`).toBe('shown')
  })

  it("hide a metric when none of its views is shown, when the dictionary's views are given", () => {
    const views = (id: string) =>
      id === 'forecast.heads.yearEnd' ? ['forecast', 'home', 'targets'] : ['team']
    expect(decide('manager', 'metric:forecast.heads.yearEnd', undefined, { metricViews: views }).access).toBe(
      'hidden',
    )
    expect(decide('hrbp', 'metric:forecast.heads.yearEnd', undefined, { metricViews: views }).access).toBe(
      'shown',
    )
    expect(decide('hrbp', 'metric:team.allocation.heads', undefined, { metricViews: views }).access).toBe(
      'hidden',
    )
  })

  it('place figures on their tab and hide other modes’ homes', () => {
    expect(decide('manager', 'figure:plan-cost-by-unit').access).toBe('hidden')
    expect(decide('manager', 'figure:plan-positions-grid', { view: 'plan', tab: 'positions' }).access).toBe(
      'limited',
    )
    expect(decide('manager', 'figure:plan-heads-by-month', { view: 'plan', tab: 'overview' }).access).toBe(
      'hidden',
    )
    expect(decide('hrbp', 'figure:home-unit-openings', { view: 'home', tab: 'overview' }).access).toBe(
      'shown',
    )
    expect(decide('leader', 'figure:home-unit-openings', { view: 'home', tab: 'overview' })).toEqual({
      access: 'hidden',
      how: "Another mode's home.",
    })
    expect(decide('hr-admin', 'figure:home-fin-bridge', { view: 'home', tab: 'overview' }).access).toBe(
      'hidden',
    )
    expect(decide('finance', 'figure:forecast-bridge', { view: 'forecast', tab: 'bridge' }).access).toBe(
      'shown',
    )
    expect(decide('manager', 'figure:forecast-bridge').access).toBe('hidden')
  })

  it('keep amount columns to HR admin with the switch, and the band estimate out of Manager mode', () => {
    for (const m of MODES) {
      expect(decide(m, 'column:reqs.offerBase').access, m).toBe(m === 'hr-admin' ? 'limited' : 'hidden')
      expect(decide(m, 'column:positions.bandEstimate').access, m).toBe(m === 'manager' ? 'hidden' : 'shown')
      expect(decide(m, 'column:workers.onLeave').access, m).toBe(m === 'hr-admin' ? 'limited' : 'hidden')
    }
  })

  it('give the first shown tab of a view a mode limits', () => {
    expect(firstShownTab('manager', 'plan')?.key).toBe('positions')
    expect(firstShownTab('manager', 'requests')?.key).toBe('new')
    expect(firstShownTab('finance', 'plan')?.key).toBe('overview')
    expect(firstShownTab('manager', 'forecast')).toBeNull()
    expect(firstShownTab('hrbp', 'data')).toBeNull()
  })
})

describe('Plan > Hiring (9.7, changes C36 and C37)', () => {
  it('decides every hiring surface explicitly in every mode, with a sentence on each limited or hidden one', () => {
    const named = new Set(NAMED_SURFACES)
    // The tab, 6 figures (C37 added the hires of the last 3 months by location and department), My
    // team's tile, 6 tiles, 3 drill kinds and 8 dated columns.
    expect(HIRING_SURFACES.length).toBe(1 + 6 + 1 + 6 + 3 + 8)
    expect(HIRING_SURFACES).toContain('figure:plan-hiring-recent')
    expect(new Set(HIRING_SURFACES).size).toBe(HIRING_SURFACES.length)
    for (const s of HIRING_SURFACES) expect(named.has(s), s).toBe(true)
    for (const m of MODES)
      for (const s of HIRING_SURFACES) {
        const d = decide(m, s, s.startsWith('figure:plan-') || s.startsWith('kpi:') ? HIRING_AT : undefined)
        expect(d.how, `${m} ${s}`).not.toBe(notNamed(m))
        if (d.access !== 'shown') expect(d.how, `${m} ${s}`).toMatch(/^[A-Z].*\.$/)
      }
  })

  it('shows every hiring metric in every mode: heads only, so no table hides one', () => {
    const ids = METRIC_IDS.filter((id) => id.startsWith('plan.hiring.'))
    // C36's 16, and C37's Moves in by quarter end and Hires in the last 3 months.
    expect(ids.length).toBe(18)
    expect(ids).toEqual(expect.arrayContaining(['plan.hiring.movesIn', 'plan.hiring.recentHires']))
    for (const m of MODES)
      for (const id of ids) {
        expect(decide(m, `metric:${id}`).access, `${m} ${id}`).toBe('shown')
        expect(tableHidesMetricId(ROLE_POLICY[m], id), `${m} ${id}`).toBe(false)
      }
  })

  it('leaves out of every hiring drill columns HR admin would read, so the drill’s own hide keeps them out', () => {
    let n = 0
    for (const kind of HIRING_DRILL_KINDS)
      for (const key of HIRING_DRILL_HIDE[kind]) {
        const s = `column:${kind}.${key}`
        // HR admin with Show pay amounts on reads it elsewhere: only the hiring drill's hide keeps it
        // out of the module (reading H13).
        expect(decide('hr-admin', s).access, s).not.toBe('hidden')
        n++
      }
    // 11: the offer amounts, plus the recruiter note and hiring manager (review HP-2, HP-5).
    expect(n).toBe(11)
  })
})

describe('Plan > Recruiting summary (9.8, change C38)', () => {
  const MODE_FILES: Record<Mode, string> = {
    manager: './manager.ts',
    hrbp: './hrbp.ts',
    leader: './leader.ts',
    finance: './finance.ts',
    'hr-admin': './admin.ts',
  }

  it('decides every recruiting surface explicitly in every mode, and shows each one', () => {
    const named = new Set(NAMED_SURFACES)
    // The tab, 4 figures (the seven numbers, heads and hiring by month, by quarter ahead, where hiring
    // happened) and the 7 tiles. Its drills are Plan > Hiring's, already in HIRING_SURFACES.
    expect(RECRUITING_SURFACES.length).toBe(1 + 4 + 7)
    expect(RECRUITING_SURFACES).toEqual([
      'tab:plan.recruiting',
      ...RECRUITING_FIGURE_IDS.map((id) => `figure:${id}`),
      ...RECRUITING_KPI_IDS.map((id) => `kpi:${id}`),
    ])
    expect(new Set(RECRUITING_SURFACES).size).toBe(RECRUITING_SURFACES.length)
    expect(RECRUITING_SURFACES.filter((s) => HIRING_SURFACES.includes(s))).toEqual([])
    for (const s of RECRUITING_SURFACES) expect(named.has(s), s).toBe(true)
    for (const m of MODES)
      for (const s of RECRUITING_SURFACES) {
        const at = s.startsWith('figure:') || s.startsWith('kpi:') ? RECRUITING_AT : undefined
        const d = decide(m, s, at)
        expect(d.how, `${m} ${s}`).not.toBe(notNamed(m))
        // Heads only, like Plan > Hiring: nothing on the tab is limited or hidden in any mode.
        expect(d.access, `${m} ${s}`).toBe('shown')
      }
  })

  it('names the tab in every mode’s own table, shown, right after Hiring, with Manager mode’s sentence', () => {
    expect(VIEW_TABS.plan.map((t) => t.key)).toEqual([
      'overview',
      'positions',
      'openings',
      'hiring',
      'recruiting',
      'transfers',
    ])
    expect(VIEW_TABS.plan.find((t) => t.key === 'recruiting')?.label).toBe('Recruiting summary')
    for (const m of MODES) {
      const tabs = ROLE_POLICY[m].tabs.plan ?? []
      const keys = tabs.map((t) => t.key)
      expect(keys.indexOf('recruiting'), m).toBe(keys.indexOf('hiring') + 1)
      expect(tabs.find((t) => t.key === 'recruiting')?.decision.access, m).toBe('shown')
      expect(routeShown(m, 'plan', 'recruiting'), m).toBe(true)
      expect(can(m, 'tab:plan.recruiting'), m).toBe(true)
      // Named in the mode's own policy file, never left to a default (8.3).
      const src = readFileSync(new URL(MODE_FILES[m], import.meta.url), 'utf8')
      expect(src, m).toMatch(/\brecruiting: /)
    }
    expect(decide('manager', 'tab:plan.recruiting')).toEqual({ access: 'shown', how: 'Your team, in heads.' })
    expect(decide('manager', 'tab:plan.recruiting')).toEqual(decide('manager', 'tab:plan.hiring'))
    expect(firstShownTab('manager', 'plan')?.key).toBe('positions')
  })

  it('shows the tab’s own metrics in every mode: heads only, so no table hides one', () => {
    const ids = METRIC_IDS.filter((id) => id.startsWith('plan.recruiting.'))
    expect(ids).toEqual([
      'plan.recruiting.projectedStarts',
      'plan.recruiting.projectedHeads',
      'plan.recruiting.gapToApproved',
    ])
    for (const m of MODES)
      for (const id of ids) {
        expect(decide(m, `metric:${id}`).access, `${m} ${id}`).toBe('shown')
        expect(tableHidesMetricId(ROLE_POLICY[m], id), `${m} ${id}`).toBe(false)
      }
  })

  it('keeps Plan > Hiring’s drill rules for the records its counts open', () => {
    // The tab opens Plan > Hiring's own drills: Manager mode lists seats and offers, never people.
    for (const m of MODES) {
      expect(decide(m, 'drill:positions').access, m).not.toBe('hidden')
      expect(decide(m, 'drill:reqs').access, m).not.toBe('hidden')
      expect(decide(m, 'drill:workers').access === 'hidden', m).toBe(m === 'manager')
    }
    for (const kind of HIRING_DRILL_KINDS) expect(HIRING_DRILL_HIDE[kind].length, kind).toBeGreaterThan(0)
  })
})
