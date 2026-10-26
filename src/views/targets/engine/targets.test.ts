/**
 * The Targets view's model on the generated sample (docs/PLAN.md 6.9, 7.2 rule 8, 7.3, 7.4, 9.4,
 * 9.6): story 6 (Silicon Engineering's FY28 gap of −18) and story 9 (the pending trade's +5 heads in
 * Systems & Software) through the model in every mode that shows Targets; the KPI strips of 9.4 with
 * their drills and calculation cards; cost under each mode's rules (no amount in Manager mode, whole
 * $0.1M steps for whole unions of atoms in HRBP and Leader mode, Finance's org-row rule below the
 * unit, everything in HR admin with the switch on); the over flag and its Action center item from
 * the same rows in every mode; Unallocated.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { METRIC_IDS } from '@/access/ids'
import { itemInScope, itemShown, lensOf, roleItems } from '@/access/items'
import { hasAmount } from '@/access/visibility'
import type { Kpi } from '@/components/types'
import { WHOLE_TEAMS_NOTE } from '@/cost/fit'
import { ORG_COST_NOTE } from '@/cost/fold'
import { FY28_WORKING } from '@/data/sample'
import type { Datasets, Mode, TargetRow } from '@/data/schema'
import { type CalcSpec, calcProblems, resolveCalc, weightSum } from '@/drill/calc'
import { type DrillSpec, resolveDrill } from '@/drill/types'
import { isRoundedCostTo } from '@/lib/costRounding'
import { asks, bandEffect } from '@/plan/engine/targets'
import { MemoryStorage } from '@/testkit/memoryStorage'
import { ID } from '../metrics'
import { targetsActions } from './actions'
import { prepare } from './base'
import { orgAsksCost } from './cost'
import { personaPick, sample, sampleCtx } from './fixtures'
import { targetsHeadline, targetsModel } from './index'
import { fieldOrg } from './working'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
vi.stubGlobal('localStorage', new MemoryStorage())

const SE = 'Silicon Engineering'
const SS = 'Systems & Software'
const SHOWN_MODES: readonly Mode[] = ['hrbp', 'leader', 'finance', 'hr-admin']
/** A currency sign or code: an amount in words. */
const MONEY = /NT\$|[$€£¥₹₪]|\b(?:USD|EUR|GBP|INR|ILS|TWD|CNY|CAD|VND)\b/

beforeAll(() => {
  sample()
})

/** Check one KPI's contract: metric, lineage, and a drill or card that adds up to its value. */
function checkKpi(k: Kpi, label: string) {
  expect(METRIC_IDS, `${label} ${k.id}`).toContain(k.metricId)
  expect(k.uses?.length, `${label} ${k.id} uses`).toBeGreaterThan(0)
  expect(!!k.drill || !!k.calc, `${label} ${k.id} opens something`).toBe(true)
  const spec = resolveDrill(k.drill)
  if (spec && k.value != null) {
    const w = weightSum(spec as never)
    if (w != null) expect(w, `${label} ${k.id} counts as`).toBeCloseTo(k.value, 2)
    else expect(spec.rows.length, `${label} ${k.id} rows`).toBe(k.value)
  }
  const card = resolveCalc(k.calc)
  if (card) expect(calcProblems(card), `${label} ${k.id} card`).toEqual([])
}

describe('story 6: Silicon Engineering asks 18 heads more than its FY28 target', () => {
  it('reads target 644, asks 662 and a gap of −18 in every mode that shows Targets', () => {
    for (const mode of SHOWN_MODES) {
      const m = targetsModel(sampleCtx(mode, { version: FY28_WORKING }))
      const se = m.gap.rows.rows.find((r) => r.org === SE && r.level === 'unit')
      expect(se, mode).toBeDefined()
      expect([se?.targetHeads, se?.asksHeads, se?.gapHeads], mode).toEqual([644, 662, -18])
      expect(se?.targetDate, mode).toBe('2028-03-31')
      // The 58 pending cycle asks are the pending part; Working's seats are FY27 Working's year end.
      expect(se?.pendingHeads, mode).toBe(58)
    }
  })

  it('is the HRBP strip and folder tab gap, since the HRBP sees the one unit', () => {
    const ctx = sampleCtx('hrbp', { version: FY28_WORKING })
    const kpis = targetsModel(ctx).gap.kpis
    expect(kpis.find((k) => k.metricId === ID.gapHeads)?.value).toBe(-18)
    expect(kpis.find((k) => k.metricId === ID.targetHeads)?.value).toBe(644)
    expect(kpis.find((k) => k.metricId === ID.asksHeads)?.value).toBe(662)
    expect(targetsHeadline(ctx).value).toBe('−18')
    expect(targetsHeadline(ctx).label).toBe('FY28 gap in heads')
  })

  it('drills the asks apart: the seats as positions, the requests weighted by their head effect', () => {
    const ctx = sampleCtx('finance', { version: FY28_WORKING })
    const fig = targetsModel(ctx).gap.rows
    const se = fig.rows.find((r) => r.org === SE) as (typeof fig.rows)[number]
    const col = (key: string) => fig.columns.find((c) => c.key === key)
    const seats = resolveDrill(col('workingHeads')?.drill?.(se) as never) as DrillSpec
    expect(seats.kind).toBe('positions')
    expect(seats.rows).toHaveLength(se.workingHeads)
    const pending = resolveDrill(col('pendingHeads')?.drill?.(se) as never) as DrillSpec
    expect(pending.kind).toBe('requests')
    expect(weightSum(pending as never)).toBe(se.pendingHeads)
    const card = resolveCalc(col('asksHeads')?.calc?.(se) as never) as CalcSpec
    expect(card.value).toBe(662)
    expect(calcProblems(card)).toEqual([])
  })
})

describe('asks cost (6.9, 7.2 rule 3)', () => {
  it("splits each pending request's band effect by atom without losing any of it", () => {
    for (const version of [null, FY28_WORKING]) {
      const ctx = sampleCtx('finance', { version })
      const p = prepare(ctx)
      for (const unit of [SE, SS]) {
        const org = fieldOrg(ctx.all.positions, 'unit', unit, null)
        const cost = orgAsksCost(p, org, false)
        const parts = cost.members.filter((m) => m.positionId.startsWith('request:'))
        expect(parts.every((m) => m.part === 'band' && m.people.length === 0)).toBe(true)
        const split = parts.reduce((a, m) => a + m.amounts.loaded, 0)
        const whole = p.pending.reduce((a, r) => a + bandEffect(r, org.match, p.fiscalYear, p.actx), 0)
        expect(split, `${unit} ${version}`).toBeCloseTo(whole, 2)
      }
    }
  })

  it("counts asks exactly as the engine's `asks` does (one number, one engine)", () => {
    for (const version of [null, FY28_WORKING])
      for (const mode of ['finance', 'leader'] as const) {
        const ctx = sampleCtx(mode, { version })
        const p = prepare(ctx)
        for (const r of targetsModel(ctx).gap.rows.rows) {
          const t = p.targets.find((x) => x.businessUnit === r.org) as TargetRow
          const org = fieldOrg(ctx.all.positions, 'unit', t.businessUnit, null)
          expect(r.asksHeads, `${mode} ${r.org}`).toBe(asks(org.match, r.targetDate, p.pending, p.actx).heads)
        }
      }
  })

  it('compares targets with the rounded asks cost in every mode (7.2 rule 8)', () => {
    const values = (['hrbp', 'leader', 'finance', 'hr-admin'] as const).map((mode) => {
      const ctx = sampleCtx(mode)
      return orgAsksCost(prepare(ctx), fieldOrg(ctx.all.positions, 'unit', SE, null), false).guardedUsd
    })
    expect(new Set(values).size).toBe(1)
    expect(values[0] != null && isRoundedCostTo(values[0], 100_000)).toBe(true)
  })
})

describe('Targets > Gap on FY27 (the default version)', () => {
  it('lists the six unit targets in Finance, and the trade counts net in Systems & Software (story 9)', () => {
    const ctx = sampleCtx('finance')
    const m = targetsModel(ctx)
    const rows = m.gap.rows.rows
    const fy27 = ctx.all.targets.filter((t) => t.fiscalYear === 'FY27')
    expect(rows.map((r) => r.org).sort()).toEqual(fy27.map((t) => t.businessUnit).sort())
    for (const r of rows) {
      const t = fy27.find((x) => x.businessUnit === r.org) as TargetRow
      expect(r.targetHeads).toBe(t.targetHeads)
      expect(r.targetCostUsd).toBe(t.targetCost)
      expect(r.gapHeads).toBe(r.targetHeads - r.asksHeads)
      expect(r.asksHeads).toBe(r.workingHeads + r.pendingHeads)
    }
    const ss = rows.find((r) => r.org === SS)
    // Story 9: 6 seats received − 1 Planned seat given; S&S is still under its target with the trade.
    expect(ss?.tradesHeads).toBe(5)
    expect(ss?.gapHeads).toBe(3)
    const others = rows.filter((r) => r.org !== SS)
    expect(others.every((r) => r.tradesHeads === 0)).toBe(true)
    // The strip adds the unit rows.
    const k = (id: string) => m.gap.kpis.find((x) => x.metricId === id)?.value
    expect(k(ID.targetHeads)).toBe(rows.reduce((n, r) => n + r.targetHeads, 0))
    expect(k(ID.asksHeads)).toBe(rows.reduce((n, r) => n + r.asksHeads, 0))
    expect(k(ID.gapHeads)).toBe(rows.reduce((n, r) => n + r.gapHeads, 0))
  })

  it("has 9.4's six KPIs, each with its metric, lineage and a drill or card that adds up", () => {
    for (const mode of [...SHOWN_MODES, 'manager'] as const) {
      const m = targetsModel(sampleCtx(mode))
      expect(
        m.gap.kpis.map((k) => k.metricId),
        mode,
      ).toEqual([ID.targetHeads, ID.asksHeads, ID.gapHeads, ID.targetCost, ID.gapCost, ID.subOrgUnallocated])
      for (const tab of [m.gap, m.suborgs, m.tree]) for (const k of tab.kpis) checkKpi(k, mode)
    }
  })

  it('keeps the HRBP to its unit and the SVP to the target that decides for their org', () => {
    for (const mode of ['hrbp', 'leader'] as const) {
      const rows = targetsModel(sampleCtx(mode)).gap.rows.rows
      expect(
        rows.map((r) => r.org),
        mode,
      ).toEqual([SE])
    }
  })

  it("never shows a leader a wider org's target as theirs: a director with none has an empty Gap", () => {
    const { pick } = personaPick('leader-dv-director')
    const ctx = sampleCtx('leader', { pick })
    const m = targetsModel(ctx)
    // The DV director's org is part of Silicon Engineering, and holds no target of its own.
    expect(m.gap.rows.rows).toEqual([])
    expect(m.gap.rows.empty).toBe(
      'No FY27 target is set for this org. Requests in it are checked against the nearest target above it.',
    )
    for (const k of m.gap.kpis) expect(k.value, k.id).toBeNull()
    expect(targetsHeadline(ctx).value).toBe('—')
    // Nothing to split: the director's sub-orgs show with no parent target and no Unallocated.
    expect(m.suborgs.unallocated.rows.map((r) => r.targetHeads)).toEqual([null])
    expect(m.suborgs.rows.rows.length).toBeGreaterThan(0)
  })

  it('shows a leader-keyed target inside the tree to its leader and to the SVP above, counted once', () => {
    const dv = personaPick('leader-dv-director').pick
    const dvCtx = sampleCtx('leader', { pick: dv })
    const root = [...(dvCtx.access.scope?.kind === 'tree' ? dvCtx.access.scope.rootPositionIds : [])][0]
    expect(root).toBeTruthy()
    const data = withTargets([
      { fiscalYear: 'FY27', businessUnit: SE, leaderPositionId: root, targetHeads: 50 },
    ])
    const own = targetsModel(sampleCtx('leader', { pick: dv, data }))
    expect(own.gap.rows.rows.map((r) => [r.level, r.targetHeads])).toEqual([['leader', 50]])
    expect(own.gap.kpis.find((k) => k.metricId === ID.targetHeads)?.value).toBe(50)
    // The director's org is now the parent of their sub-orgs, with all 50 unallocated.
    expect(own.suborgs.unallocated.rows.map((r) => r.unallocatedHeads)).toEqual([50])
    const svp = targetsModel(sampleCtx('leader', { data }))
    const se = data.targets.find(
      (t) => t.fiscalYear === 'FY27' && t.businessUnit === SE && !t.leaderPositionId,
    )
    expect(svp.gap.rows.rows.map((r) => r.level).sort()).toEqual(['leader', 'unit'])
    // The unit's row holds the director's, so the strip counts the unit's target only.
    expect(svp.gap.kpis.find((k) => k.metricId === ID.targetHeads)?.value).toBe(se?.targetHeads)
  })
})

describe('cost on Targets by mode (7.2 to 7.5)', () => {
  it('shows no amount in Manager mode', () => {
    const m = targetsModel(sampleCtx('manager'))
    for (const r of m.gap.rows.rows)
      expect([r.targetCostUsd, r.asksCostUsd, r.gapCostUsd]).toEqual([null, null, null])
    for (const r of m.suborgs.rows.rows)
      expect([r.targetCostUsd, r.asksCostUsd, r.gapCostUsd]).toEqual([null, null, null])
    for (const r of m.tree.cells.rows) expect(r.costUsd).toBeNull()
    for (const k of m.gap.kpis.filter((x) => x.format !== 'int')) expect(k.value).toBeNull()
  })

  it('shows HRBP and Leader whole $0.1M steps for whole unions of atoms, and heads only elsewhere', () => {
    for (const mode of ['hrbp', 'leader'] as const) {
      const ctx = sampleCtx(mode)
      const step = ctx.guard.rules.floorUsd
      const m = targetsModel(ctx)
      const se = m.gap.rows.rows[0]
      for (const v of [se.targetCostUsd, se.asksCostUsd, se.gapCostUsd])
        expect(v != null && isRoundedCostTo(v, step), `${mode} ${v}`).toBe(true)
      for (const r of m.suborgs.rows.rows)
        if (r.asksCostUsd != null) expect(isRoundedCostTo(r.asksCostUsd, step), mode).toBe(true)
        else expect(r.reason, mode).toBe(WHOLE_TEAMS_NOTE)
      // Cost centers are not unions of atoms: the tree shows heads only.
      for (const r of m.tree.cells.rows) expect(r.costUsd, mode).toBeNull()
      for (const r of m.tree.costCenters.rows) expect(r.costUsd, mode).toBeNull()
    }
  })

  it("shows a director's sub-orgs (managers' teams) in heads only, since they cut the director's atom", () => {
    const { pick } = personaPick('leader-dv-director')
    const m = targetsModel(sampleCtx('leader', { pick }))
    expect(m.suborgs.rows.rows.length).toBeGreaterThan(0)
    for (const r of m.suborgs.rows.rows) {
      expect(r.asksCostUsd).toBeNull()
      expect(r.reason).toBe(WHOLE_TEAMS_NOTE)
    }
  })

  it('shows hidden rounded-mode cost under a level filter, with the filter note', () => {
    const m = targetsModel(sampleCtx('hrbp', { filters: { level: ['P4'] } }))
    const se = m.gap.rows.rows[0]
    expect(se.asksCostUsd).toBeNull()
    expect(se.reason).toMatch(/level filters/)
    // Heads are the whole org's, whatever the filter.
    expect(se.asksHeads).toBe(targetsModel(sampleCtx('hrbp')).gap.rows.rows[0].asksHeads)
    expect(m.gap.rows.note).toMatch(/whole org/)
  })

  it('keeps 1550-HSZ (story 8, 3 costed people) out of every Finance amount of its own', () => {
    const m = targetsModel(sampleCtx('finance'))
    const cells = m.tree.cells.rows.filter((r) => r.costCenter === '1550-HSZ')
    expect(cells.length).toBeGreaterThan(0)
    for (const c of cells) expect(c.costUsd).toBeNull()
    expect(m.tree.costCenters.rows.some((r) => r.costCenter === '1550-HSZ')).toBe(false)
    const other = m.tree.costCenters.rows.find((r) => r.unit === 'Corporate' && r.isOther)
    expect(other?.costUsd).not.toBeNull()
    // HR admin with the switch on sees the cell.
    const open = targetsModel(sampleCtx('hr-admin', { showPay: true }))
    expect(
      open.tree.cells.rows.filter((r) => r.costCenter === '1550-HSZ').every((r) => r.costUsd != null),
    ).toBe(true)
  })
})

/** The sample with extra FY27 target rows. */
function withTargets(extra: TargetRow[]): Datasets {
  const s = sample()
  return { ...s.datasets, targets: [...s.datasets.targets, ...extra] }
}

describe("Finance's org-row rule below the unit (7.4)", () => {
  it('shows cost on a department target made of whole shown cost centers, and not on a folded cost center', () => {
    const data = withTargets([
      {
        fiscalYear: 'FY27',
        businessUnit: SE,
        department: 'Design Verification',
        targetHeads: 200,
        targetCost: 30_000_000,
      },
      {
        fiscalYear: 'FY27',
        businessUnit: 'Corporate',
        costCenter: '1550-HSZ',
        targetHeads: 3,
        targetCost: 300_000,
      },
    ])
    const m = targetsModel(sampleCtx('finance', { data }))
    const dv = m.gap.rows.rows.find((r) => r.level === 'department')
    expect(dv?.org).toBe('Design Verification (Silicon Engineering)')
    expect(dv?.asksCostUsd).not.toBeNull()
    expect(dv?.reason).toBeNull()
    const hsz = m.gap.rows.rows.find((r) => r.level === 'costCenter')
    expect(hsz?.asksCostUsd).toBeNull()
    expect(hsz?.reason).toBe(ORG_COST_NOTE)
    // The target cost is an input: it still shows.
    expect(hsz?.targetCostUsd).toBe(300_000)
    // The KPIs add only the unit rows, which hold the department and cost-center rows.
    expect(m.gap.kpis.find((k) => k.metricId === ID.targetHeads)?.value).toBe(
      data.targets
        .filter((t) => t.fiscalYear === 'FY27' && !t.department && !t.costCenter)
        .reduce((n, t) => n + t.targetHeads, 0),
    )
  })
})

describe('sub-org targets, Unallocated and the over item (6.9, 7.2 rule 8, 9.6)', () => {
  const svp = () => personaPick('leader-svp-se').pick

  /** The SVP's sub-orgs, then the same with a target set for the first one, below its asks. */
  function planted() {
    const base = targetsModel(sampleCtx('leader'))
    const first = base.suborgs.rows.rows[0]
    const data = withTargets([
      {
        fiscalYear: 'FY27',
        businessUnit: SE,
        leaderPositionId: first.positionId,
        targetHeads: first.asksHeads - 3,
      },
    ])
    return { first, data }
  }

  it('lists the SVP sub-orgs with no target and everything unallocated', () => {
    const m = targetsModel(sampleCtx('leader'))
    expect(m.suborgs.rows.rows.length).toBeGreaterThan(0)
    expect(m.suborgs.rows.rows.every((r) => r.targetHeads == null && !r.over)).toBe(true)
    const se = sample().datasets.targets.find(
      (t) => t.fiscalYear === 'FY27' && t.businessUnit === SE,
    ) as TargetRow
    expect(m.gap.kpis.find((k) => k.metricId === ID.subOrgUnallocated)?.value).toBe(se.targetHeads)
    expect(targetsActions(sampleCtx('leader'))).toEqual([])
  })

  it('flags a sub-org 3 heads over its target, the same in every mode, and routes it to the Leader', () => {
    const { first, data } = planted()
    const leader = sampleCtx('leader', { data, pick: svp() })
    const row = targetsModel(leader).suborgs.rows.rows.find((r) => r.positionId === first.positionId)
    expect(row?.targetHeads).toBe(first.asksHeads - 3)
    expect([row?.gapHeads, row?.over]).toEqual([-3, true])
    const se = data.targets.find(
      (t) => t.fiscalYear === 'FY27' && t.businessUnit === SE && !t.leaderPositionId,
    ) as TargetRow
    expect(targetsModel(leader).gap.kpis.find((k) => k.metricId === ID.subOrgUnallocated)?.value).toBe(
      se.targetHeads - (first.asksHeads - 3),
    )
    // Finance and HR admin with a leader filter on the SVP's seat read the same flag.
    const seat = [...(leader.access.scope?.kind === 'tree' ? leader.access.scope.rootPositionIds : [])][0]
    for (const mode of ['finance', 'hr-admin', 'hrbp'] as const) {
      const other = targetsModel(sampleCtx(mode, { data, filters: { leaderId: seat } }))
      const same = other.suborgs.rows.rows.find((r) => r.positionId === first.positionId)
      expect([same?.gapHeads, same?.over], mode).toEqual([-3, true])
    }
    const items = targetsActions(leader)
    expect(items).toHaveLength(1)
    const item = items[0]
    expect(item.id).toBe(`targets:suborg-over:${first.positionId}`)
    expect(item.ownerId).toBe(svp().personId)
    expect(item.what).toMatch(/asks 3 heads more than its target$/)
    expect(hasAmount(item.what) || hasAmount(item.note ?? '')).toBe(false)
    expect(item.place.positionId).toBe(first.positionId)
    expect(item.closesWhen).toBeTruthy()
    const lists = roleItems(
      [{ item, ownerId: item.ownerId ?? null, ownerName: item.ownerName }],
      lensOf(leader.access, leader.asOf),
    )
    expect(lists.needs).toHaveLength(1)
    // The Leader's policy lists the item, and it is about the Leader's org.
    expect(itemShown(leader.access, item)).toBe(true)
    expect(itemInScope(leader.access, item)).toBe(true)
    const drill = resolveDrill(item.drill) as DrillSpec
    expect(drill.rows).toHaveLength(row?.heads ?? -1)
  })
})

describe('the targets:suborg-over item contract (9.6)', () => {
  it('holds in every mode, with no amount, a due date and a place, and lists none where Targets is hidden', () => {
    const NAGGING = /\b(chas\w*|nag\w*|ping\w*|hound\w*|unblock\w*|remind\w*)\b/i
    const base = targetsModel(sampleCtx('leader')).suborgs.rows.rows
    // Two sub-orgs over: one in heads, and one made of whole cost atoms (its asks cost shows) only
    // against a cost target of $1, far under its rounded asks cost.
    const a = base[0]
    const b = base.find((r) => r !== a && r.asksCostUsd != null) as (typeof base)[number]
    expect(b).toBeDefined()
    const data = withTargets([
      { fiscalYear: 'FY27', businessUnit: SE, leaderPositionId: a.positionId, targetHeads: a.asksHeads - 2 },
      {
        fiscalYear: 'FY27',
        businessUnit: SE,
        leaderPositionId: b.positionId,
        targetHeads: b.asksHeads + 10,
        targetCost: 1,
      },
    ])
    let seen = 0
    for (const mode of [...SHOWN_MODES, 'manager'] as const) {
      const items = targetsActions(sampleCtx(mode, { data }))
      if (mode === 'manager') {
        expect(items).toEqual([])
        continue
      }
      const ids = items.map((i) => i.id)
      expect(new Set(ids).size, mode).toBe(ids.length)
      for (const i of items) {
        seen++
        expect(i.id.startsWith('targets:suborg-over:'), i.id).toBe(true)
        expect(i.view).toBe('targets')
        expect(i.what.endsWith('.'), i.id).toBe(false)
        expect(NAGGING.test(i.what) || NAGGING.test(i.note ?? ''), i.id).toBe(false)
        expect(hasAmount(i.what) || hasAmount(i.note ?? '') || MONEY.test(i.what), i.id).toBe(false)
        expect(i.due, i.id).toBe('2027-03-31')
        expect(i.place.positionId, i.id).toBeTruthy()
        expect(i.place.businessUnit, i.id).toBe(SE)
      }
    }
    expect(seen).toBeGreaterThan(0)
    // 9.6: the Leader's Needs attention, the unit HRBP's Waiting on others.
    const hrbp = sampleCtx('hrbp', { data })
    const routed = roleItems(
      targetsActions(hrbp).map((item) => ({
        item,
        ownerId: item.ownerId ?? null,
        ownerName: item.ownerName,
      })),
      lensOf(hrbp.access, hrbp.asOf),
    )
    expect(routed.needs).toEqual([])
    expect(routed.waiting.map((x) => x.item.id).sort()).toEqual(
      [`targets:suborg-over:${a.positionId}`, `targets:suborg-over:${b.positionId}`].sort(),
    )
    // The heads leg reads in heads; a sub-org over only its cost target says so, with no amount.
    const leader = targetsActions(sampleCtx('leader', { data }))
    const byId = new Map(leader.map((i) => [i.id, i]))
    expect(byId.get(`targets:suborg-over:${a.positionId}`)?.what).toMatch(
      /asks 2 heads more than its target$/,
    )
    const bRow = targetsModel(sampleCtx('leader', { data })).suborgs.rows.rows.find(
      (r) => r.positionId === b.positionId,
    )
    expect([bRow?.gapHeads, bRow?.overCost, bRow?.over]).toEqual([10, true, true])
    // The target cost is an input, floored for the Leader ($1 floors to 0).
    expect(bRow?.targetCostUsd).toBe(0)
    expect(byId.get(`targets:suborg-over:${b.positionId}`)?.what).toMatch(/is over its cost target$/)
    expect(byId.get(`targets:suborg-over:${b.positionId}`)?.note).toMatch(/against its cost target/)
  })
})

describe('Tree × cost center', () => {
  it('partitions the scope: the cells add up to the KPI, which drills to exactly its seats', () => {
    for (const mode of SHOWN_MODES) {
      const m = targetsModel(sampleCtx(mode))
      const k = m.tree.kpis[0]
      expect(
        m.tree.cells.rows.reduce((n, r) => n + r.heads, 0),
        mode,
      ).toBe(k.value)
      const fig = m.tree.cells
      const col = fig.columns.find((c) => c.key === 'heads')
      for (const r of fig.rows.slice(0, 5)) {
        const d = resolveDrill(col?.drill?.(r) as never) as DrillSpec
        expect(d.rows, mode).toHaveLength(r.heads)
      }
    }
  })
})

describe('with no plan state (no versions, no closes)', () => {
  it('still counts heads and shows no cost, in Targets and Finance alike', () => {
    for (const mode of ['finance', 'hrbp'] as const) {
      const ctx = sampleCtx(mode, { plan: null })
      const m = targetsModel(ctx)
      expect(m.gap.rows.rows.length, mode).toBeGreaterThan(0)
      for (const r of m.gap.rows.rows) expect(r.asksCostUsd, mode).toBeNull()
      expect(targetsHeadline(ctx).value, mode).not.toBe('')
      expect(m.suborgs.rows.rows.length, mode).toBeGreaterThan(0)
      expect(m.tree.kpis[0].value, mode).toBeGreaterThan(0)
    }
  })
})

describe('copy', () => {
  it('writes no amount into a note, a title or a reason, and no em dash between words', () => {
    for (const mode of [...SHOWN_MODES, 'manager'] as const) {
      const m = targetsModel(sampleCtx(mode))
      const texts = [
        ...[m.gap, m.suborgs, m.tree].flatMap((t) =>
          t.kpis.flatMap((k) => [k.label, k.note ?? '', k.suppressedNote ?? '']),
        ),
        ...[
          m.gap.rows,
          m.suborgs.rows,
          m.suborgs.unallocated,
          m.suborgs.exceptions,
          m.tree.cells,
          m.tree.costCenters,
        ].flatMap((f) => [f.title, f.subtitle ?? '', f.note ?? '', f.empty ?? '']),
      ]
      for (const t of texts) {
        // Manager mode allows no grouped number at all; elsewhere a head count may pass 1,000.
        expect(mode === 'manager' ? hasAmount(t) : MONEY.test(t), `${mode}: ${t}`).toBe(false)
        expect(t, mode).not.toMatch(/[A-Za-z0-9)]\s*—\s*[A-Za-z0-9(]/)
        expect(t, mode).not.toMatch(/!/)
      }
    }
  })
})
