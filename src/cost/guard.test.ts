/**
 * The cost guard (docs/PLAN.md 7.2 to 7.5, 16.1 "No cost, rate or average over fewer than 5"): the
 * template app's cost.test and budget.test totals rules on hand-built members, PLAN's rule 1
 * fixtures (4 Filled + 1 accepted offer; a 20-person cost center with one October hire; severance
 * never isolated), the component split under lead decision D-FIN (b) (change C33: whole units only,
 * every component and each capped burden component's two sides 0 or 5 or more, by month and over the
 * window; reviews RF-1 and RF-2), Finance's one fold, the rounded modes' atoms, and every mode's
 * treatment of an amount. `expectGuarded` holds on every breakdown.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { monthRange, monthsOf } from '@/data/fiscal'
import { FY27_WORKING } from '@/data/sample/assumptions'
import { generateSample } from '@/data/sample/generate'
import { latestRows } from '@/data/sample/orgs'
import { planLinesOf } from '@/data/sample/versions'
import { type Month, siteByLocation } from '@/data/schema'
import {
  addedStepsTo,
  COST_STEP,
  costRangeTo,
  isRoundedCost,
  isRoundedCostTo,
  roundCost,
  roundCostTo,
  sumRounded,
  sumRoundedTo,
} from '@/lib/costRounding'
import type { CostGuardSettings } from '@/metrics/costGuard'
import type { PlanLine } from '@/plan/types'
import type { AtomIndex } from './atoms'
import { NO_AMOUNTS_NOTE, WHOLE_CENTERS_NOTE, WHOLE_TEAMS_NOTE } from './fit'
import { NONE, OTHER } from './fold'
import {
  atomPart,
  breakdown,
  COMPONENTS_UNITS_NOTE,
  COST_COMPONENTS,
  type CostMember,
  type CostRow,
  type CostRowOptions,
  type CostSeat,
  centersLeftOutNote,
  componentContributors,
  componentsHiddenNote,
  costMembers,
  costMembersOf,
  costRow,
  expectGuarded,
  financeFolds,
  foldCentersOf,
  type GuardMode,
  guardModel,
  hiddenNote,
  leftOutNote,
  partOfBasis,
  roundedAmounts,
} from './guard'
import {
  FY27,
  filled,
  gateOf,
  line,
  membersOf,
  offer,
  open,
  RULES,
  seat,
  team,
  US_SS_CAP,
  usCapSides,
  YTD,
} from './guard.testkit'

const opts = (mode: GuardMode, over: Partial<CostRowOptions> = {}): CostRowOptions => ({
  mode,
  rules: RULES,
  bandShown: mode !== 'none',
  ...over,
})
const rules = (over: Partial<CostGuardSettings>): CostGuardSettings => ({ ...RULES, ...over })

/** People in one place: a team of `n` Filled seats in a cost center, with its seats. */
interface Place {
  unit: string
  cc: string
  n: number
  department?: string
  country?: string
  currency?: string
  level?: CostSeat['level']
  base?: number
}
function org(places: readonly Place[], months: readonly Month[] = FY27) {
  const lines: PlanLine[] = []
  const seats: Record<string, CostSeat> = {}
  for (const p of places) {
    const prefix = `${p.unit}:${p.cc}:${p.level ?? 'P3'}:`
    for (let i = 1; i <= p.n; i++) {
      const id = `${prefix}${i}`
      seats[id] = seat({
        businessUnit: p.unit,
        costCenter: p.cc,
        department: p.department ?? 'Design',
        country: p.country ?? 'United States',
        level: p.level ?? 'P3',
      })
      lines.push(...filled(id, months, { base: p.base ?? 10_000 }, { currency: p.currency ?? 'USD' }))
    }
  }
  return { lines, seats, members: membersOf(lines, months, seats) }
}

const shownRows = (rows: readonly CostRow[]) => rows.map((r) => [r.label, r.costed])

describe('members: costed people over the window (7.2 rule 1)', () => {
  it('one member per position and part, in position order, with the people they bring', () => {
    const lines = [
      ...filled('P2', YTD, { base: 10_000, bonus: 1_000 }),
      ...open('P1', YTD, { base: 9_000 }),
      // A holder's last day in July, then the seat at band from August.
      ...filled('P3', YTD.slice(0, 4), { base: 8_000 }),
      ...open('P3', YTD.slice(4), { base: 7_000 }),
    ]
    const ms = membersOf(lines, YTD)
    expect(ms.map((m) => [m.positionId, m.part])).toEqual([
      ['P1', 'band'],
      ['P2', 'filled'],
      ['P3', 'filled'],
      ['P3', 'band'],
    ])
    const p2 = ms[1]
    expect(p2.people).toEqual(['E-P2'])
    expect(p2.costedByMonth).toEqual([1, 1, 1, 1, 1, 1])
    expect(p2.amounts.base).toBe(60_000)
    expect(p2.amounts.loaded).toBe(66_000)
    expect(ms[0].people).toEqual([])
    expect(ms[0].costedByMonth).toEqual([0, 0, 0, 0, 0, 0])
    expect(ms[2].costedByMonth).toEqual([1, 1, 1, 1, 0, 0])
    expect(partOfBasis('offer')).toBe('filled')
    expect(partOfBasis('band')).toBe('band')
  })

  it('a cost center of 4 Filled seats and 1 accepted offer starting 1 Feb 2027 has 4 costed people to January and in YTD', () => {
    const lines = [...team('F', 4, FY27), ...offer('O1', FY27.slice(10))]
    const fy = membersOf(lines, FY27)
    const byMonth = FY27.map((_, i) => fy.reduce((a, m) => a + m.costedByMonth[i], 0))
    expect(byMonth).toEqual([4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 5, 5])
    expect(costRow('cc', 'cc', membersOf(lines, YTD), opts('exact')).costed).toBe(4)
    expect(costRow('cc', 'cc', membersOf(lines, YTD), opts('exact')).hidden).toBe(true)
    // Over the whole year the offer is a fifth costed person: Finance's fold sizes by the fewest month.
    expect(costRow('cc', 'cc', fy, opts('exact')).costed).toBe(5)
  })

  it('brings nobody for allowance, severance and one-time-only lines; leave never changes who is costed', () => {
    const lines = [
      ...filled('P1', YTD),
      line('P1', '2026-04', { vacancy: -300 }, { holderId: null, heads: 0, active: 0 }),
      line('P2', '2026-09', { oneTime: 30_000 }, { active: 0, heads: 0, status: 'Eliminated' }),
      line('P3', '2026-08', { oneTime: 4_000 }, { basis: 'offer', holderId: 'R-9', active: 0, heads: 0 }),
      // Unpaid leave: every amount 0, still a costed person.
      ...filled('P4', YTD, {}),
    ]
    const ms = membersOf(lines, YTD)
    expect(ms.map((m) => [m.positionId, m.people])).toEqual([
      ['P1', ['E-P1']],
      ['P2', []],
      ['P3', []],
      ['P4', ['E-P4']],
    ])
    expect(ms[0].amounts.vacancy).toBe(-300)
    expect(ms[0].amounts.loaded).toBe(60_000 - 300)
  })

  it('places members in the last close’s atoms (a new seat takes its manager’s) and counts lines with no seat', () => {
    const index: AtomIndex = {
      closeDate: '2026-09-30',
      atoms: [
        {
          atomId: 'D1',
          kind: 'leader',
          leaderPositionId: 'D1',
          businessUnit: 'Operations',
          department: 'Supply chain',
          positionIds: ['D1', 'P1'],
        },
      ],
      byPosition: Object.assign(Object.create(null), { D1: 'D1', P1: 'D1' }),
    }
    const lines = [...filled('P1', YTD), ...open('NEW', YTD), ...filled('GONE', YTD)]
    const r = costMembersOf({
      lines,
      months: YTD,
      seatOf: (id) => (id === 'GONE' ? null : seat({ managerPositionId: id === 'NEW' ? 'P1' : null })),
      atoms: index,
    })
    expect(r.members.map((m) => [m.positionId, m.atomId])).toEqual([
      ['NEW', 'D1'],
      ['P1', 'D1'],
    ])
    expect(r.leftOut).toEqual({ positions: 1, lines: 6 })
    expect(atomPart(r.members[0])).toBe('D1|band')
  })

  it('reads only the window’s months', () => {
    const ms = membersOf(team('P', 5, FY27), ['2026-10'])
    expect(ms.every((m) => m.costedByMonth.length === 1 && m.amounts.base === 10_000)).toBe(true)
  })
})

describe('the minimum and the band line (rules 1 and 3)', () => {
  it('hides every amount over fewer than 5 costed people; heads still show', () => {
    const r = costRow('cc', 'CC-1', membersOf(team('P', 4, FY27), FY27), opts('exact'))
    expect(r).toMatchObject({ costed: 4, hidden: true, totalUsd: null, perHeadUsd: null, positionIds: [] })
    expect(Object.values(r.amounts).every((v) => v === null)).toBe(true)
    expect(r.reason).toBe(hiddenNote(5))
  })

  it('3 Filled + 2 Open: no filled total (3 costed people), the band line shows apart', () => {
    const lines = [...team('F', 3, FY27), ...open('O1', FY27), ...open('O2', FY27)]
    for (const mode of ['exact', 'rounded'] as const) {
      const ms = membersOf(lines, FY27).map((m) => ({ ...m, atomId: 'A' }))
      const r = costRow('cc', 'CC-1', ms, opts(mode))
      // Rounded modes leave the 3-person atom out, so it counts nobody and says so.
      expect(r.costed, mode).toBe(mode === 'exact' ? 3 : 0)
      if (mode === 'rounded') expect(r.leftOut).toBe(3)
      expect(r.amounts.loaded, mode).toBeNull()
      expect(r.totalUsd, mode).toBeNull()
      // The atom has 3 costed people: rounded modes leave it out, so nothing shows at all.
      expect(r.bandUsd, mode).toBe(mode === 'exact' ? 2 * 9_000 * 12 : 0)
    }
  })

  it('shows exact amounts over 5 or more, per head from the filled part only', () => {
    const lines = [...team('F', 5, FY27, 10_000), ...open('O1', FY27, { base: 9_000 })]
    const r = costRow(
      'cc',
      'CC-1',
      membersOf(lines, FY27),
      opts('exact', { components: gateOf(lines, FY27) }),
    )
    expect(r.amounts.loaded).toBe(600_000)
    expect(r.amounts.base).toBe(600_000)
    expect(r.bandUsd).toBe(108_000)
    expect(r.totalUsd).toBe(708_000)
    expect(r.perHeadUsd).toBe(120_000)
    expect(r.positionIds).toEqual(['F1', 'F2', 'F3', 'F4', 'F5'])
    // Band estimates hidden: neither the band line nor the total carries them.
    const noBand = costRow('cc', 'CC-1', membersOf(lines, FY27), opts('exact', { bandShown: false }))
    expect(noBand.bandUsd).toBeNull()
    expect(noBand.totalUsd).toBe(600_000)
  })

  it('reads the minimum from the rules: raised to 40, a group of 39 hides', () => {
    const ms = membersOf(team('P', 39, YTD), YTD)
    expect(costRow('x', 'x', ms, opts('exact')).hidden).toBe(false)
    expect(costRow('x', 'x', ms, opts('exact', { rules: rules({ minCosted: 40 }) }))).toMatchObject({
      hidden: true,
      reason: hiddenNote(40),
    })
  })

  it('Manager mode: no amount at all; HR admin with the switch: no minimum', () => {
    const ms = membersOf(team('P', 3, YTD), YTD)
    const none = costRow('x', 'x', ms, opts('none'))
    expect(none).toMatchObject({ costed: 3, bandUsd: null, totalUsd: null, reason: NO_AMOUNTS_NOTE })
    expect(Object.values(none.amounts).every((v) => v === null)).toBe(true)
    const openRow = costRow('x', 'x', ms, opts('open'))
    expect(openRow).toMatchObject({ hidden: false, totalUsd: 180_000, perHeadUsd: 60_000 })
  })
})

describe('components (7.2 rule 1)', () => {
  // A 20-person cost center; one hire starts in October with a sign-on and a relocation.
  const monthly = { base: 10_000, bonus: 1_000, burden: 2_000, benefits: 800, equity: 500 }
  const signOnPlusRelocation = 10_000 + 5_000
  const lines = [
    ...Array.from({ length: 20 }, (_, i) => filled(`P${i + 1}`, FY27, monthly)).flat(),
    ...FY27.slice(6).map((m) =>
      line('H1', m, { ...monthly, oneTime: m === '2026-10' ? signOnPlusRelocation : 0 }),
    ),
  ]
  // The cost center is its unit whole (every position of the default seat), so its split may show.
  const cell = (months: readonly Month[]) =>
    costRow('cc', 'CC-1', membersOf(lines, months), opts('exact', { components: gateOf(lines, months) }))

  it('a 20-person cost center with one October hire shows loaded only for October', () => {
    const oct = cell(['2026-10'])
    expect(oct.componentsHidden).toBe(true)
    expect(oct.amounts.loaded).not.toBeNull()
    for (const c of COST_COMPONENTS) expect(oct.amounts[c], c).toBeNull()
    expect(oct.reason).toBe(componentsHiddenNote(5))
    // Every other month has no one-time item: its components show.
    for (const m of FY27.filter((x) => x !== '2026-10')) expect(cell([m]).componentsHidden, m).toBe(false)
  })

  it('no cell, component row or cell’s loaded less its shown components equals the sign-on plus relocation', () => {
    const windows: Month[][] = [...FY27.map((m) => [m]), [...YTD], FY27.slice(6, 9), [...FY27]]
    for (const w of windows) {
      const r = cell(w)
      const shown = COST_COMPONENTS.filter((c) => c !== 'equity').map((c) => r.amounts[c])
      for (const v of [...Object.values(r.amounts), r.totalUsd])
        expect(v, w.join()).not.toBe(signOnPlusRelocation)
      if (shown.every((v) => v != null)) {
        const rest = (r.amounts.loaded as number) - shown.reduce<number>((a, v) => a + (v as number), 0)
        expect(Math.abs(rest - signOnPlusRelocation), w.join()).toBeGreaterThan(1)
      }
    }
    expect(cell([...FY27]).componentsHidden).toBe(true)
  })

  it('severance is never isolated: one eliminated Filled seat in a 20-person cost center', () => {
    const severance = 30_000
    const sev = [
      ...Array.from({ length: 20 }, (_, i) => filled(`P${i + 1}`, FY27, monthly)).flat(),
      ...filled('X1', FY27.slice(0, 9), monthly),
      // Last day 31 Dec: severance books in January on a line of its own, nobody costed.
      line('X1', '2027-01', { oneTime: severance }, { active: 0, heads: 0, status: 'Eliminated' }),
    ]
    const at = (w: readonly Month[]) =>
      costRow('cc', 'CC-1', membersOf(sev, w), opts('exact', { components: gateOf(sev, w) }))
    expect(at(['2027-01']).costed).toBe(20)
    expect(at(['2027-01']).componentsHidden).toBe(true)
    for (const w of [...FY27.map((m) => [m]), [...FY27], FY27.slice(9)]) {
      const r = at(w)
      for (const v of Object.values(r.amounts)) expect(v, w.join()).not.toBe(severance)
      const shown = COST_COMPONENTS.filter((c) => c !== 'equity').map((c) => r.amounts[c])
      if (shown.every((v) => v != null) && r.amounts.loaded != null) {
        const rest = r.amounts.loaded - shown.reduce<number>((a, v) => a + (v as number), 0)
        expect(Math.abs(rest - severance), w.join()).toBeGreaterThan(1)
      }
    }
    expect(
      componentContributors(
        sev.filter((l) => l.month === '2027-01'),
        'oneTime',
      ),
    ).toEqual(new Set(['X1']))
  })

  it('component contributors: positions with an amount in the component, band seats left out', () => {
    const ls = [
      line('H1', '2026-10', { base: 1, oneTime: 15_000 }),
      line('H2', '2026-10', { base: 1, oneTime: 0.004 }),
      line('B1', '2026-10', { base: 9_000, oneTime: 2_000 }, { basis: 'band' }),
    ]
    expect(componentContributors(ls, 'oneTime')).toEqual(new Set(['H1']))
    expect(componentContributors(ls, 'base')).toEqual(new Set(['H1', 'H2']))
  })

  it('cost-center rows never show the split; the unit total shows it when its classes pass (C33)', () => {
    const a = org([{ unit: 'U', cc: 'A', n: 20 }])
    const b = org([{ unit: 'U', cc: 'B', n: 20 }])
    const hires = (cc: string, k: number) =>
      Array.from({ length: k }, (_, i) => line(`${cc}-H${i}`, '2026-10', { base: 10_000, oneTime: 7_000 }))
    const build = (inA: number, inB: number) => {
      const lines = [...a.lines, ...b.lines, ...hires('A', inA), ...hires('B', inB)]
      const seats: Record<string, CostSeat> = { ...a.seats, ...b.seats }
      for (const l of lines)
        if (!seats[l.positionId])
          seats[l.positionId] = seat({ businessUnit: 'U', costCenter: l.positionId[0] })
      const ms = membersOf(lines, ['2026-10'], seats)
      return guardModel({
        members: ms,
        mode: 'exact',
        rules: RULES,
        atoms: null,
        folds: financeFolds(ms, 5),
        fit: null,
        bandShown: true,
        components: gateOf(lines, ['2026-10'], seats),
        by: { key: (m) => m.seat.costCenter, noneLabel: 'No cost center', totalShown: true },
      })
    }
    // 6 one-time contributors in the unit: its total shows the split; no cost-center row does.
    const fig = build(1, 5)
    const row = (k: string) => fig.rows.find((r) => r.key === k) as CostRow
    for (const k of ['A', 'B']) {
      expect(row(k).componentsHidden, k).toBe(true)
      expect(row(k).reason, k).toBe(COMPONENTS_UNITS_NOTE)
      expect(row(k).amounts.oneTime, k).toBeNull()
      expect(row(k).amounts.loaded, k).not.toBeNull()
    }
    expect(fig.total.componentsHidden).toBe(false)
    expect(fig.total.amounts.oneTime).toBe(42_000)
    expectGuarded(fig.rows, fig.total, { min: 5 })
    // 4 in the unit: the unit's one-time class is under 5, so nothing shows the split.
    const small = build(1, 3)
    expect(small.total.componentsHidden).toBe(true)
    expect(small.total.reason).toBe(componentsHiddenNote(5))
    expect(small.total.amounts.oneTime).toBeNull()
    // Without a gate an exact figure shows loaded cost only.
    const ms = membersOf(a.lines, ['2026-10'], a.seats)
    expect(costRow('u', 'U', ms, opts('exact')).componentsHidden).toBe(true)
    expect(costRow('u', 'U', ms, opts('open')).componentsHidden).toBe(false)
  })
})

describe('the long CSV’s cells (14.1 item 3, C17, C33 (b))', () => {
  // The long CSV's Finance cells: per unit, each cost center the fold shows and the unit's Other,
  // broken down by cost center under the unit's one fold and the window's component gate, for
  // every month, the quarter and year to date and the full year (src/views/finance/engine/
  // longCsv.ts). Unit U: a 20-person cost center A with one October hire carrying a sign-on and a
  // relocation, a 6-person B, and C and D of 3 each (the unit's Other).
  const monthly = { base: 10_000, bonus: 1_000, burden: 2_000, benefits: 800, equity: 500 }
  const signOnPlusRelocation = 10_000 + 5_123
  const team = (cc: string, n: number) =>
    Array.from({ length: n }, (_, i) => filled(`${cc}-${i + 1}`, FY27, monthly)).flat()
  const lines = [
    ...team('A', 20),
    ...team('B', 6),
    ...team('C', 3),
    ...team('D', 3),
    ...FY27.slice(6).map((m) =>
      line('A-H1', m, { ...monthly, oneTime: m === '2026-10' ? signOnPlusRelocation : 0 }),
    ),
  ]
  const seats: Record<string, CostSeat> = {}
  for (const l of lines) seats[l.positionId] ??= seat({ businessUnit: 'U', costCenter: l.positionId[0] })
  const folds = financeFolds(membersOf(lines, FY27, seats), 5)
  const cells = (months: readonly Month[]) =>
    guardModel({
      members: membersOf(lines, months, seats),
      mode: 'exact',
      rules: RULES,
      atoms: null,
      folds,
      fit: null,
      bandShown: true,
      components: gateOf(lines, months, seats),
      by: { key: (m) => m.seat.costCenter, noneLabel: 'No cost center', totalShown: true },
    })
  const windows: Month[][] = [...FY27.map((m) => [m]), FY27.slice(3, 6), [...YTD], [...FY27]]

  it('shows A and B on their own and C and D as the unit’s one Other, loaded cost only, in every period', () => {
    expect(folds.get('U')?.shown).toEqual(['A', 'B'])
    expect(folds.get('U')?.other).toEqual(['C', 'D'])
    for (const w of windows) {
      const fig = cells(w)
      expect(
        fig.rows.map((r) => r.label),
        w.join(),
      ).toEqual(['A', 'B', 'Other (2)'])
      for (const r of fig.rows) {
        expect(r.amounts.loaded, `${w.join()} ${r.label}`).not.toBeNull()
        expect(r.componentsHidden, `${w.join()} ${r.label}`).toBe(true)
        expect(r.reason).toBe(COMPONENTS_UNITS_NOTE)
      }
      expectGuarded(fig.rows, fig.total, { min: 5 })
    }
  })

  it('October’s A cell is one loaded amount, and no cell, total or difference equals the sign-on plus relocation', () => {
    const oct = cells(['2026-10'])
    const a = oct.rows.find((r) => r.key === 'A') as CostRow
    for (const c of COST_COMPONENTS) expect(a.amounts[c], c).toBeNull()
    // The unit total's split is hidden in October too: one one-time contributor (7.2 rule 1).
    expect(oct.total.componentsHidden).toBe(true)
    expect(oct.total.reason).toBe(componentsHiddenNote(5))
    for (const w of windows) {
      const fig = cells(w)
      const values = [...fig.rows, fig.total].flatMap((r) => [r.totalUsd, ...Object.values(r.amounts)])
      for (const v of values)
        if (v != null) expect(Math.abs(v - signOnPlusRelocation), w.join()).toBeGreaterThan(1)
      // A cell less the rows beside it, or the total less every row, is never the one-time amount.
      const total = fig.total.totalUsd as number
      const rows = fig.rows.map((r) => r.totalUsd as number)
      expect(Math.abs(total - rows.reduce((x, y) => x + y, 0))).toBeLessThan(0.005)
      for (const r of rows) expect(Math.abs(total - r - signOnPlusRelocation), w.join()).toBeGreaterThan(1)
    }
    // The control: September, with no one-time item, shows the unit total's split.
    expect(cells(['2026-09']).total.componentsHidden).toBe(false)
  })
})

describe('the component split under D-FIN (b), C33', () => {
  /** A unit of Filled seats `<cc>-<i>` in cost centers, each with its own monthly base. */
  function unitOf(unit: string, centers: Record<string, readonly number[]>, months: readonly Month[] = FY27) {
    const lines: PlanLine[] = []
    const seats: Record<string, CostSeat> = {}
    for (const [cc, bases] of Object.entries(centers))
      bases.forEach((base, i) => {
        const id = `${unit}:${cc}-${i + 1}`
        seats[id] = seat({ businessUnit: unit, costCenter: cc })
        lines.push(...filled(id, months, { base, bonus: base * 0.15, burden: 0.062 * base }))
      })
    return { lines, seats }
  }
  const total = (
    lines: readonly PlanLine[],
    months: readonly Month[],
    seats: Readonly<Record<string, CostSeat>>,
    capSides?: (l: PlanLine) => ReturnType<typeof usCapSides> | null,
    keep: (m: CostMember) => boolean = () => true,
  ) =>
    costRow(
      't',
      'Total',
      membersOf(lines, months, seats).filter(keep),
      opts('exact', { components: gateOf(lines, months, seats, capSides) }),
    )
  /** A monthly base whose annual base + bonus is above the US social security cap, and one below. */
  const ABOVE = 20_000
  const below = (annual: number) => annual / 12 / 1.15

  it('RF-1: 23 people above the social security cap and 1 below show loaded cost only', () => {
    // As 1110-SJC: Σ min(base + bonus, cap) less 23 × cap would give the one person's base + bonus.
    const { lines, seats } = unitOf('U', { '1110-SJC': [...Array(23).fill(ABOVE), below(123_368)] })
    const r = total(lines, YTD, seats, usCapSides)
    expect(r.costed).toBe(24)
    expect(r.componentsHidden).toBe(true)
    expect(r.reason).toBe(componentsHiddenNote(5))
    expect(r.amounts.burden).toBeNull()
    expect(r.amounts.loaded).not.toBeNull()
    // Every component has 24 contributors: without the cap check the split would show.
    expect(total(lines, YTD, seats).componentsHidden).toBe(false)
    // 5 below the cap and 19 above: both sides hold 5 or more, so the split shows.
    const five = unitOf('U', { '1110-SJC': [...Array(19).fill(ABOVE), ...Array(5).fill(below(120_000))] })
    expect(total(five.lines, YTD, five.seats, usCapSides).componentsHidden).toBe(false)
    expect(US_SS_CAP).toBeGreaterThan(123_368)
  })

  it('a person whose cap binds in only some months counts on both sides, month by month', () => {
    // 20 above, 4 below, and one raised over the cap from October.
    const { lines, seats } = unitOf('U', { A: [...Array(20).fill(ABOVE), ...Array(4).fill(below(100_000))] })
    const crossing = FY27.map((m, i) =>
      line(
        'U:A-X',
        m,
        i < 6 ? { base: below(150_000), bonus: below(150_000) * 0.15 } : { base: ABOVE, bonus: 3_000 },
      ),
    )
    const all = [...lines, ...crossing]
    const s2 = { ...seats, 'U:A-X': seat({ businessUnit: 'U', costCenter: 'A' }) }
    // April to September: 5 below (4 + the crossing person) every month, 20 above: the split shows.
    expect(total(all, YTD, s2, usCapSides).componentsHidden).toBe(false)
    // The full year: 4 below from October, so the year's split hides though the year has 5 below.
    const fy = total(all, FY27, s2, usCapSides)
    expect(fy.componentsHidden).toBe(true)
    expect(fy.reason).toBe(componentsHiddenNote(5))
    // October alone: 4 below.
    expect(total(all, ['2026-10'], s2, usCapSides).componentsHidden).toBe(true)
  })

  it('a cap side that cannot be told hides the split for its unit', () => {
    const { lines, seats } = unitOf('U', { A: Array(10).fill(ABOVE) })
    expect(total(lines, YTD, seats, () => null).componentsHidden).toBe(true)
    expect(total(lines, YTD, seats, () => []).componentsHidden).toBe(false)
  })

  it('RF-2: two selections differing by a center with one sign-on never both show the split', () => {
    // Center S has 5 hires with a sign-on in October; center X one.
    const months = FY27.slice(6, 7)
    const { lines, seats } = unitOf('U', { S: Array(20).fill(ABOVE), X: Array(20).fill(ABOVE) }, months)
    const signOn = (cc: string, k: number) =>
      Array.from({ length: k }, (_, i) => line(`U:${cc}-H${i}`, '2026-10', { base: ABOVE, oneTime: 12_100 }))
    const all = [...lines, ...signOn('S', 5), ...signOn('X', 1)]
    const s2: Record<string, CostSeat> = { ...seats }
    for (const l of all)
      if (!s2[l.positionId]) s2[l.positionId] = seat({ businessUnit: 'U', costCenter: l.positionId[2] })
    const sel = (ccs: readonly string[]) =>
      total(all, months, s2, undefined, (m) => ccs.includes(m.seat.costCenter))
    // Before C33 each selection showed its split (5 and 6 one-time contributors): their difference
    // was X's one sign-on. A share of a unit never shows it now.
    expect(sel(['S']).componentsHidden).toBe(true)
    expect(sel(['S', 'X']).componentsHidden).toBe(false)
    expect(sel(['S']).reason).toBe(COMPONENTS_UNITS_NOTE)
    expect(sel(['S', 'X']).amounts.oneTime).toBe(6 * 12_100)
  })

  it('RF-2: a to-date window shows its split only when every month of it passes', () => {
    // 5 one-time contributors in May, 1 in June: YTD (6) less May (5) would give June's one item.
    const { lines, seats } = unitOf('U', { A: Array(20).fill(ABOVE) })
    const oneTime = (m: Month, k: number, tag: string) =>
      Array.from({ length: k }, (_, i) => line(`U:A-${tag}${i}`, m, { base: ABOVE, oneTime: 5_000 }))
    const all = [...lines, ...oneTime('2026-05', 5, 'M'), ...oneTime('2026-06', 1, 'J')]
    const s2: Record<string, CostSeat> = { ...seats }
    for (const l of all)
      if (!s2[l.positionId]) s2[l.positionId] = seat({ businessUnit: 'U', costCenter: 'A' })
    expect(total(all, ['2026-05'], s2).componentsHidden).toBe(false)
    expect(total(all, ['2026-06'], s2).componentsHidden).toBe(true)
    expect(total(all, YTD, s2).componentsHidden).toBe(true)
    expect(total(all, FY27, s2).componentsHidden).toBe(true)
    expect(total(all, ['2026-04', '2026-05'], s2).componentsHidden).toBe(false)
  })

  it('a company figure shows the split only when every unit it covers passes', () => {
    const a = unitOf('A', { A1: Array(10).fill(ABOVE) })
    const b = unitOf('B', { B1: [...Array(9).fill(ABOVE), below(100_000)] })
    const lines = [...a.lines, ...b.lines]
    const seats = { ...a.seats, ...b.seats }
    expect(total(lines, YTD, seats, usCapSides).componentsHidden).toBe(true)
    expect(total(lines, YTD, seats, usCapSides, (m) => m.seat.businessUnit === 'A').componentsHidden).toBe(
      false,
    )
    expect(total(lines, YTD, seats, usCapSides, (m) => m.seat.businessUnit === 'B').componentsHidden).toBe(
      true,
    )
  })
})

describe('the totals rules (the template app’s fold, exact with no folds)', () => {
  const byUnit = (members: readonly CostMember[]) => {
    const total = costRow('t', 'Total', members, opts('exact'))
    const rows = breakdown(members, {
      ...opts('exact'),
      key: (m) => m.seat.businessUnit,
      noneLabel: 'No unit',
      totalShown: !total.hidden,
    })
    return { total, rows }
  }

  it('folds a small group into Other, and the smallest shown group with it until Other reaches 5', () => {
    const a = org([
      { unit: 'Silicon Engineering', cc: 'S', n: 10 },
      { unit: 'Operations', cc: 'O', n: 3 },
    ])
    const one = byUnit(a.members)
    expect(shownRows(one.rows)).toEqual([['Other (2)', 13]])
    expectGuarded(one.rows, one.total, { min: 5 })
    const b = org([
      { unit: 'Silicon Engineering', cc: 'S', n: 10 },
      { unit: 'Operations', cc: 'O', n: 3 },
      { unit: 'Go-to-Market', cc: 'G', n: 6 },
    ])
    // Other takes Go-to-Market (6, the smallest shown) so it holds 9, never just the 3.
    const two = byUnit(b.members)
    expect(shownRows(two.rows)).toEqual([
      ['Silicon Engineering', 10],
      ['Other (2)', 9],
    ])
    expectGuarded(two.rows, two.total, { min: 5 })
    expect(two.rows.find((r) => r.key === OTHER)?.folded).toBe(2)
  })

  it('hides every cost when the scope itself is under the minimum', () => {
    const { members } = org([
      { unit: 'Operations', cc: 'A', n: 2 },
      { unit: 'Operations', cc: 'B', n: 2 },
    ])
    const { total, rows } = byUnit(members)
    expect(total.hidden).toBe(true)
    expect(total.costed).toBe(4)
    expectGuarded(rows, total, { min: 5 })
  })

  it('names the largest groups up to the top, the rest in Other', () => {
    const { members } = org([
      { unit: 'A', cc: 'a', n: 5 },
      { unit: 'B', cc: 'b', n: 9 },
      { unit: 'C', cc: 'c', n: 7 },
      { unit: 'D', cc: 'd', n: 6 },
    ])
    const rows = breakdown(members, {
      ...opts('exact'),
      key: (m) => m.seat.businessUnit,
      noneLabel: 'No unit',
      totalShown: true,
      top: 2,
    })
    expect(shownRows(rows)).toEqual([
      ['B', 9],
      ['C', 7],
      ['Other (2)', 11],
    ])
  })

  it('keeps groups with no value apart, last under a fixed order', () => {
    const { members } = org([
      { unit: 'A', cc: 'a', n: 5 },
      { unit: 'B', cc: 'b', n: 6 },
    ])
    const rows = breakdown(members, {
      ...opts('exact'),
      key: (m) => (m.seat.businessUnit === 'A' ? null : m.seat.businessUnit),
      noneLabel: 'No unit',
      order: ['B'],
      totalShown: true,
    })
    expect(rows.map((r) => [r.key, r.label])).toEqual([
      ['B', 'B'],
      [NONE, 'No unit'],
    ])
  })

  it('every breakdown is guarded, in many scopes and with a raised minimum', () => {
    const { members } = org([
      { unit: 'A', cc: 'a1', n: 12, level: 'P3' },
      { unit: 'A', cc: 'a2', n: 4, level: 'P4' },
      { unit: 'B', cc: 'b1', n: 7, level: 'P3' },
      { unit: 'B', cc: 'b2', n: 1, level: 'P5' },
      { unit: 'C', cc: 'c1', n: 3, level: 'P4' },
      { unit: 'D', cc: 'd1', n: 41, level: 'P2' },
    ])
    const scopes: [string, readonly CostMember[]][] = [
      ['company', members],
      ['A', members.filter((m) => m.seat.businessUnit === 'A')],
      ['B and C', members.filter((m) => 'BC'.includes(m.seat.businessUnit))],
      ['P3', members.filter((m) => m.seat.level === 'P3')],
    ]
    for (const min of [5, 40])
      for (const [label, ms] of scopes) {
        const o = opts('exact', { rules: rules({ minCosted: min }) })
        const total = costRow('t', 'Total', ms, o)
        for (const key of [
          (m: CostMember) => m.seat.businessUnit,
          (m: CostMember) => m.seat.costCenter,
          (m: CostMember) => m.seat.level,
        ]) {
          const rows = breakdown(ms, { ...o, key, noneLabel: 'None', totalShown: !total.hidden })
          expectGuarded(rows, total, { min, label: `${label} min ${min}` })
          for (const r of rows) if (r.key === OTHER) expect(r.folded).toBeGreaterThan(0)
        }
      }
  })
})

describe('Finance: one cost-center fold per unit (7.4)', () => {
  /** A Finance figure; the folds are the units' one fold (over the grid and every member by default). */
  const finance = (
    members: readonly CostMember[],
    key: (m: CostMember) => string | null,
    partial = false,
    folds = financeFolds(members, 5),
  ) =>
    guardModel({
      members,
      mode: 'exact',
      rules: RULES,
      atoms: null,
      folds,
      fit: null,
      bandShown: true,
      partial,
      by: { key, noneLabel: 'None', totalShown: true },
    })

  it('folds cost centers under 5 into the unit’s Other, the smallest shown joining while it is under 5', () => {
    const { members } = org([
      { unit: 'Chips', cc: 'CC-1', n: 12 },
      { unit: 'Chips', cc: 'CC-2', n: 7 },
      { unit: 'Chips', cc: 'CC-3', n: 3 },
      { unit: 'Chips', cc: 'CC-4', n: 1 },
      { unit: 'Chips', cc: 'CC-5', n: 1 },
    ])
    const fig = finance(members, (m) => m.seat.costCenter)
    expect(shownRows(fig.rows)).toEqual([
      ['CC-1', 12],
      ['CC-2', 7],
      ['Other (3)', 5],
    ])
    // Never lets a hidden group be the total minus the shown ones.
    expectGuarded(fig.rows, fig.total, { min: 5 })
    expect(fig.total.costed).toBe(24)
    expect(fig.note).toBeNull()
  })

  it('leaves a unit whose Other would read under 5 out of every total, and says so', () => {
    const { members } = org([
      { unit: 'Chips', cc: 'CC-1', n: 12 },
      { unit: 'Chips', cc: 'CC-2', n: 7 },
      { unit: 'Ops', cc: 'CC-7', n: 4 },
      { unit: 'Sales', cc: 'CC-8', n: 6 },
    ])
    const fig = finance(members, (m) => m.seat.businessUnit)
    expect(shownRows(fig.rows)).toEqual([
      ['Chips', 19],
      ['Sales', 6],
    ])
    expect(fig.total.costed).toBe(25)
    expect(fig.note).toBe(centersLeftOutNote(4, 5))
    const centers = finance(members, (m) => m.seat.costCenter)
    expect(shownRows(centers.rows)).toEqual([
      ['CC-1', 12],
      ['CC-2', 7],
      ['CC-8', 6],
    ])
    expectGuarded(centers.rows, centers.total, { min: 5 })
  })

  it('no cost center of 4 Filled seats and 1 accepted offer, or of 5 with one last day 31 Oct, shows an amount', () => {
    const base = org([
      { unit: 'U', cc: 'A', n: 10 },
      { unit: 'U', cc: 'C', n: 6 },
      { unit: 'U', cc: 'E', n: 8 },
    ])
    const lines = [
      ...base.lines,
      ...team('B', 4, FY27),
      ...offer('B5', FY27.slice(10)),
      ...team('D', 4, FY27),
      ...filled('D5', FY27.slice(0, 7)),
    ]
    const seats: Record<string, CostSeat> = { ...base.seats }
    for (const id of ['B1', 'B2', 'B3', 'B4', 'B5']) seats[id] = seat({ businessUnit: 'U', costCenter: 'B' })
    for (const id of ['D1', 'D2', 'D3', 'D4', 'D5']) seats[id] = seat({ businessUnit: 'U', costCenter: 'D' })
    const fy = membersOf(lines, FY27, seats)
    const centers = foldCentersOf(fy).get('U') ?? []
    expect(centers.find((c) => c.costCenter === 'B')?.costedByMonth).toEqual([
      4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 5, 5,
    ])
    expect(centers.find((c) => c.costCenter === 'D')?.costedByMonth).toEqual([
      5, 5, 5, 5, 5, 5, 5, 4, 4, 4, 4, 4,
    ])
    const folds = financeFolds(fy, 5)
    expect(folds.get('U')?.other).toEqual(['B', 'D'])
    // The one fold over the grid serves every window: in YTD, D has 5 in every month and still folds.
    for (const w of [FY27, YTD, ['2027-02' as Month], ['2026-05' as Month]]) {
      const fig = finance(membersOf(lines, w, seats), (m) => m.seat.costCenter, false, folds)
      expect(
        fig.rows.filter((r) => r.key === 'B' || r.key === 'D'),
        w.join(),
      ).toEqual([])
      expectGuarded(fig.rows, fig.total, { min: 5, label: w.join() })
    }
  })

  it('sizes each currency’s share of the Other by the lines’ own currencies (RF-5)', () => {
    // A San Jose center (C) with one of its 3 people paid in EUR, and a Munich center (M) of 6.
    const lines: PlanLine[] = []
    const seats: Record<string, CostSeat> = {}
    const add = (id: string, cc: string, currency: string, country = 'United States') => {
      seats[id] = seat({ businessUnit: 'U', costCenter: cc, country })
      lines.push(...filled(id, FY27, { base: 10_000 }, { currency }))
    }
    for (let i = 1; i <= 10; i++) add(`A${i}`, 'A', 'USD')
    add('C1', 'C', 'USD')
    add('C2', 'C', 'USD')
    add('C3', 'C', 'EUR')
    for (let i = 1; i <= 3; i++) add(`D${i}`, 'D', 'USD')
    for (let i = 1; i <= 6; i++) add(`M${i}`, 'M', 'EUR', 'Germany')
    const members = membersOf(lines, FY27, seats)
    const c = foldCentersOf(members)
      .get('U')
      ?.find((x) => x.costCenter === 'C')
    expect(c?.currency).toBe('USD')
    expect(c?.costedByCurrency?.EUR).toEqual(new Array(12).fill(1))
    // Before the fix C counted as USD only, so its EUR person sat alone in Other's EUR share.
    expect(financeFolds(members, 5).get('U')).toMatchObject({ shown: ['A'], other: ['C', 'D', 'M'] })
  })

  it('coarse rows are sums of shown cost centers; the unit’s Other stays one Other', () => {
    // The PLAN's control fixture: Taiwan A 6, B 3; US C 7, D 6, E 2.
    const { members } = org([
      { unit: 'U', cc: 'A', n: 6, country: 'Taiwan', currency: 'TWD' },
      { unit: 'U', cc: 'B', n: 3, country: 'Taiwan', currency: 'TWD' },
      { unit: 'U', cc: 'C', n: 7 },
      { unit: 'U', cc: 'D', n: 6 },
      { unit: 'U', cc: 'E', n: 2 },
    ])
    const folds = financeFolds(members, 5)
    // Other = B + E = 5, but its TWD share (3) and USD share (2) are under 5: A and D join.
    expect(folds.get('U')).toMatchObject({ shown: ['C'], other: ['A', 'B', 'D', 'E'], otherSize: 17 })
    const byCountry = finance(members, (m) => m.seat.country)
    expect(shownRows(byCountry.rows)).toEqual([
      ['United States', 7],
      ['Other (2)', 17],
    ])
    expectGuarded(byCountry.rows, byCountry.total, { min: 5 })
    // A unit row is the unit total, its Other included.
    const byUnit = finance(members, (m) => m.seat.businessUnit)
    expect(shownRows(byUnit.rows)).toEqual([['U', 24]])
    // Under a country filter: the shown cost centers with that value, no Other, and the note.
    const us = finance(
      members.filter((m) => m.seat.country === 'United States'),
      (m) => m.seat.costCenter,
      true,
      folds,
    )
    expect(us.total.costed).toBe(7)
    expect(shownRows(us.rows)).toEqual([['C', 7]])
    expect(us.note).toBe(centersLeftOutNote(8, 5))
    const tw = finance(
      members.filter((m) => m.seat.country === 'Taiwan'),
      (m) => m.seat.costCenter,
      true,
      folds,
    )
    expect(tw.total.hidden).toBe(true)
    expect(tw.rows).toEqual([])
  })

  it('a breakdown that cuts cost centers shows heads, never a part of a cost center', () => {
    const { members } = org([
      { unit: 'U', cc: 'CC-1', n: 6, level: 'P3' },
      { unit: 'U', cc: 'CC-1', n: 6, level: 'P4' },
      { unit: 'U', cc: 'CC-2', n: 7, level: 'P3' },
      { unit: 'U', cc: 'CC-3', n: 3, level: 'P5' },
      { unit: 'U', cc: 'CC-4', n: 2, level: 'P3' },
    ])
    const fig = finance(members, (m) => m.seat.level)
    const p3 = fig.rows.find((r) => r.key === 'P3') as CostRow
    expect(p3).toMatchObject({ hidden: true, reason: WHOLE_CENTERS_NOTE, totalUsd: null })
    expect(fig.rows.find((r) => r.key === OTHER)?.costed).toBe(5)
    expectGuarded(fig.rows, fig.total, { min: 5 })
    // By department (every cost center in one department): the department row is the unit.
    const dept = finance(members, (m) => m.seat.department)
    expect(shownRows(dept.rows)).toEqual([['Design', 24]])
  })
})

describe('rounded modes: cost atoms (7.3)', () => {
  // Atom A (8 people, $20,000 a month each), atom B (6 at $15,000 and an Open seat at $9,000), atom C (3).
  const byPosition: Record<string, string> = Object.create(null)
  const index: AtomIndex = { closeDate: '2026-09-30', atoms: [], byPosition }
  const lines: PlanLine[] = []
  const seats: Record<string, CostSeat> = {}
  const add = (atom: string, id: string, team: string, ls: PlanLine[], department: string) => {
    byPosition[id] = atom
    seats[id] = seat({ department, costCenter: team })
    lines.push(...ls)
  }
  for (let i = 1; i <= 8; i++)
    add('A', `A${i}`, i <= 4 ? 'T1' : 'T2', filled(`A${i}`, FY27, { base: 20_000 }), 'X')
  for (let i = 1; i <= 6; i++) add('B', `B${i}`, 'T3', filled(`B${i}`, FY27, { base: 15_000 }), 'Y')
  add('B', 'B-OPEN', 'T3', open('B-OPEN', FY27, { base: 9_000 }), 'Y')
  for (let i = 1; i <= 3; i++) add('C', `C${i}`, 'T4', filled(`C${i}`, FY27, { base: 30_000 }), 'X')
  const rounded = (ls: readonly PlanLine[], r: CostGuardSettings = RULES, key?: (m: CostMember) => string) =>
    guardModel({
      members: membersOf(ls, FY27, seats, index),
      mode: 'rounded',
      rules: r,
      atoms: index,
      fit: null,
      bandShown: true,
      ...(key ? { by: { key, noneLabel: 'None', totalShown: true } } : {}),
    })

  it('rounds each atom’s filled and band parts down on their own and adds them with sumRounded', () => {
    const fig = rounded(lines)
    // A 1,920,000 → 1.9M; B 1,080,000 → 1.0M; B's band 108,000 → 0.1M; C (3 people) left out.
    expect(fig.parts).toEqual({ 'A|filled': 1_900_000, 'B|filled': 1_000_000, 'B|band': 100_000 })
    expect(fig.total.amounts.loaded).toBe(sumRounded([1_900_000, 1_000_000]))
    expect(fig.total.bandUsd).toBe(100_000)
    expect(fig.total.totalUsd).toBe(sumRounded([1_900_000, 1_000_000, 100_000]))
    expect(fig.total).toMatchObject({ costed: 14, parts: 3, added: 100_000, componentsHidden: true })
    for (const c of COST_COMPONENTS) expect(fig.total.amounts[c]).toBeNull()
    expect(fig.total.perHeadUsd).toBe(Math.round(3_000_000 / 14 / 1_000) * 1_000)
    expect(fig.note).toBe(leftOutNote(3, 5))
    expect(roundCost(1_920_000)).toBe(1_900_000)
  })

  it('reads the step from the rules: raised to $200,000, every amount is a whole $200,000', () => {
    const fig = rounded(lines, rules({ floorUsd: 200_000 }))
    expect(fig.parts).toEqual({ 'A|filled': 1_800_000, 'B|filled': 1_000_000, 'B|band': 0 })
    expect(fig.total.amounts.loaded).toBe(3_000_000)
    expect(fig.total.totalUsd).toBe(3_000_000)
    for (const v of [fig.total.amounts.loaded, fig.total.totalUsd, fig.total.bandUsd])
      expect((v as number) % 200_000).toBe(0)
    const r = roundedAmounts(membersOf(lines, FY27, seats, index), atomPart, rules({ floorUsd: 200_000 }))
    expect(r.parts).toBe(4)
    expect(r.amounts.loaded % 200_000).toBe(0)
  })

  it('rounds to the step in force (`...To`), while `roundCost` keeps $100,000 even as a map callback', () => {
    expect(roundCostTo(1_920_000, 200_000)).toBe(1_800_000)
    expect(roundCostTo(-450_000, 200_000)).toBe(-400_000)
    expect(Object.is(roundCostTo(-150_000, 200_000), 0)).toBe(true)
    expect(sumRoundedTo([1_800_000, 1_000_000, 0], 200_000)).toBe(3_000_000)
    expect(addedStepsTo(5, 200_000)).toBe(400_000)
    expect(costRangeTo(400_000, 200_000)).toEqual([400_000, 600_000])
    expect(isRoundedCostTo(600_000, 200_000)).toBe(true)
    expect(isRoundedCostTo(500_000, 200_000)).toBe(false)
    expect([1_920_000, 150_000].map(roundCost)).toEqual([1_900_000, 100_000])
  })

  it('editing a band seat never moves the filled part’s rounded value (rule 3)', () => {
    const before = rounded(lines)
    const edited = rounded([
      ...lines.filter((l) => l.positionId !== 'B-OPEN'),
      ...open('B-OPEN', FY27, { base: 39_999 }),
    ])
    expect(edited.total.amounts.loaded).toBe(before.total.amounts.loaded)
    expect(edited.parts?.['B|filled']).toBe(before.parts?.['B|filled'])
    expect(edited.total.bandUsd).not.toBe(before.total.bandUsd)
  })

  it('rows that are whole unions of atoms show rounded cost; rows that cut an atom show heads', () => {
    const byDept = rounded(lines, RULES, (m) => m.seat.department ?? '')
    expect(shownRows(byDept.rows)).toEqual([
      ['X', 8],
      ['Y', 6],
    ])
    expectGuarded(byDept.rows, byDept.total, { min: 5, rounded: true, step: COST_STEP })
    const byTeam = rounded(lines, RULES, (m) => m.seat.costCenter)
    const t1 = byTeam.rows.find((r) => r.key === 'T1') as CostRow
    expect(t1).toMatchObject({ costed: 4, hidden: true, reason: WHOLE_TEAMS_NOTE, totalUsd: null })
    expect(byTeam.rows.find((r) => r.key === 'T3')?.amounts.loaded).toBe(1_000_000)
    expectGuarded(byTeam.rows, byTeam.total, { min: 5, rounded: true, step: COST_STEP })
    for (const r of [...byTeam.rows, byTeam.total])
      for (const v of [r.amounts.loaded, r.totalUsd, r.bandUsd])
        if (v != null) expect(isRoundedCost(v)).toBe(true)
  })

  it('a row never adds a small atom’s part, even when costRow is called on it alone', () => {
    const ms = membersOf(lines, FY27, seats, index).filter((m) => m.atomId === 'A' || m.atomId === 'C')
    const r = costRow('x', 'X', ms, opts('rounded'))
    expect(r).toMatchObject({ costed: 8, leftOut: 3, totalUsd: 1_900_000 })
    const none = costRow(
      'c',
      'C',
      ms.filter((m) => m.atomId === 'C'),
      opts('rounded'),
    )
    expect(none.hidden).toBe(true)
    expect(none.bandUsd).toBe(0)
  })

  it('members in no atom are left out of rounded totals', () => {
    const ms = membersOf(lines, FY27, seats, index).map((m) =>
      m.atomId === 'A' ? { ...m, atomId: null } : m,
    )
    const fig = guardModel({
      members: ms,
      mode: 'rounded',
      rules: RULES,
      atoms: index,
      fit: null,
      bandShown: true,
    })
    expect(fig.total.amounts.loaded).toBe(1_000_000)
    expect(fig.note).toBe(leftOutNote(11, 5))
  })
})

describe('every mode', () => {
  const { members } = org([
    { unit: 'A', cc: 'a1', n: 6 },
    { unit: 'A', cc: 'a2', n: 3 },
    { unit: 'B', cc: 'b1', n: 2 },
  ])
  const by = { key: (m: CostMember) => m.seat.costCenter, noneLabel: 'None', totalShown: true }

  it('Manager mode: no amount on the total, any row or band line', () => {
    const fig = guardModel({
      members,
      mode: 'none',
      rules: RULES,
      atoms: null,
      fit: null,
      bandShown: false,
      by,
    })
    expect(fig.reason).toBe(NO_AMOUNTS_NOTE)
    for (const r of [fig.total, ...fig.rows]) {
      expect(
        [...Object.values(r.amounts), r.bandUsd, r.totalUsd, r.perHeadUsd].every((v) => v === null),
      ).toBe(true)
      expect(r.positionIds).toEqual([])
    }
    expect(fig.total.costed).toBe(11)
  })

  it('a fit reason: heads only, every amount "—" with the reason', () => {
    const fit = 'Cost shows for the quarter to date, year to date and full year in this mode.'
    for (const mode of ['exact', 'rounded', 'open'] as const) {
      const fig = guardModel({ members, mode, rules: RULES, atoms: null, fit, bandShown: true, by })
      expect(fig.reason, mode).toBe(fit)
      for (const r of [fig.total, ...fig.rows]) {
        expect(r.totalUsd, mode).toBeNull()
        expect(r.bandUsd, mode).toBeNull()
        expect(r.reason, mode).toBe(fit)
      }
    }
  })

  it('HR admin with the switch: exact amounts with no minimum, no fold', () => {
    const fig = guardModel({
      members,
      mode: 'open',
      rules: RULES,
      atoms: null,
      fit: null,
      bandShown: true,
      by,
    })
    expect(shownRows(fig.rows)).toEqual([
      ['a1', 6],
      ['a2', 3],
      ['b1', 2],
    ])
    expect(fig.rows.every((r) => r.amounts.loaded != null)).toBe(true)
    expectGuarded(fig.rows, fig.total, { min: 0 })
  })

  it('Finance and HR admin with the switch off: no amount over fewer than 5', () => {
    const fig = guardModel({
      members,
      mode: 'exact',
      rules: RULES,
      atoms: null,
      folds: financeFolds(members, 5),
      fit: null,
      bandShown: true,
      by,
    })
    expect(fig.total.costed).toBe(9)
    expect(fig.note).toBe(centersLeftOutNote(2, 5))
    // Unit A's two cost centers make one Other of 9; unit B (2 people) is left out.
    expect(shownRows(fig.rows)).toEqual([['Other (2)', 9]])
    expectGuarded(fig.rows, fig.total, { min: 5 })
  })
})

describe('expectGuarded', () => {
  const row = (over: Partial<CostRow>): CostRow => ({
    key: 'k',
    label: 'K',
    isOther: false,
    folded: 0,
    costed: 5,
    amounts: { base: 1, bonus: 0, burden: 0, benefits: 0, oneTime: 0, vacancy: 0, equity: 0, loaded: 1 },
    bandUsd: 0,
    totalUsd: 1,
    perHeadUsd: 0.2,
    hidden: false,
    componentsHidden: false,
    reason: null,
    positionIds: [],
    ...over,
  })

  it('passes a guarded breakdown and names every break', () => {
    const total = row({
      key: 't',
      costed: 10,
      amounts: { ...row({}).amounts, base: 2, loaded: 2 },
      totalUsd: 2,
    })
    expect(() => expectGuarded([row({ key: 'a' }), row({ key: 'b' })], total, { min: 5 })).not.toThrow()
    expect(() =>
      expectGuarded([row({ key: 'a', costed: 3 }), row({ key: 'b', costed: 7 })], total, { min: 5 }),
    ).toThrow(/over 3 costed people/)
    expect(() =>
      expectGuarded([row({ key: 'a', isOther: true }), row({ key: 'b', isOther: true })], total, { min: 5 }),
    ).toThrow(/2 Other rows/)
    expect(() => expectGuarded([row({ key: 'a' })], total, { min: 5 })).toThrow(/cover 5 costed people/)
    expect(() =>
      expectGuarded(
        [row({ key: 'a', costed: 10 })],
        { ...total, amounts: { ...total.amounts, loaded: 9 } },
        {
          min: 5,
        },
      ),
    ).toThrow(/loaded: rows add to 1/)
    expect(() => expectGuarded([row({ key: 'a', costed: 10 })], total, { min: 5, rounded: true })).toThrow(
      /not a whole step/,
    )
  })
})

describe('on the sample company (FY27 Working at the 30 Sep 2026 close)', () => {
  const GRID = monthRange('2026-04', '2027-09')
  let lines: PlanLine[]
  let seatOf: (id: string) => CostSeat | null
  let index: AtomIndex
  let gridMembers: CostMember[]
  let fy: CostMember[]
  let ytd: CostMember[]
  beforeAll(() => {
    const sample = generateSample()
    const data = sample.datasets
    const latest = latestRows(data.positions)
    seatOf = (id) => {
      const r = latest.get(id)
      if (!r) return null
      const site = siteByLocation.get(r.location)
      return {
        businessUnit: r.businessUnit,
        department: r.department ?? null,
        costCenter: r.costCenter,
        location: r.location,
        legalEntity: site?.legalEntity ?? '',
        country: site?.country ?? '',
        level: r.level,
        managerPositionId: r.managerPositionId ?? null,
      }
    }
    lines = planLinesOf(data, FY27_WORKING, sample.asOf)
    index = sample.plan.closes[sample.plan.closes.length - 1].atoms
    const of = (months: readonly Month[]) => costMembers({ lines, months, seatOf, atoms: index })
    gridMembers = of(GRID)
    fy = of(monthsOf('FY27'))
    ytd = of(monthsOf('FY27').slice(0, 6))
  }, 60_000)

  it('Finance’s fold: no MUC or HFA cost center folds, Silicon Engineering has no Other, 1550-HSZ (story 8) folds', () => {
    const folds = financeFolds(gridMembers, 5)
    expect(folds.size).toBe(6)
    for (const [unit, fold] of folds) {
      expect(
        fold.other.filter((c) => /-(MUC|HFA)$/.test(c)),
        unit,
      ).toEqual([])
      expect(fold.other.length === 0 || fold.otherSize >= 5, unit).toBe(true)
      const centers = foldCentersOf(gridMembers).get(unit) ?? []
      for (const cc of fold.shown) {
        const c = centers.find((x) => x.costCenter === cc) as { costedByMonth: readonly number[] }
        expect(Math.min(...c.costedByMonth), `${unit} ${cc}`).toBeGreaterThanOrEqual(5)
      }
    }
    expect(folds.get('Silicon Engineering')?.other).toEqual([])
    expect(folds.get('Corporate')?.other).toContain('1550-HSZ')
  })

  it('every Finance breakdown is guarded at FY and YTD, and 1550-HSZ never shows an amount of its own', () => {
    const folds = financeFolds(gridMembers, 5)
    const keys: [string, (m: CostMember) => string | null][] = [
      ['unit', (m) => m.seat.businessUnit],
      ['cost center', (m) => m.seat.costCenter],
      ['country', (m) => m.seat.country],
      ['currency', (m) => m.currency],
      ['department', (m) => m.seat.department],
      ['level', (m) => m.seat.level],
    ]
    for (const [w, members] of [
      ['FY', fy],
      ['YTD', ytd],
    ] as const)
      for (const [name, key] of keys) {
        const fig = guardModel({
          members,
          mode: 'exact',
          rules: RULES,
          atoms: null,
          folds,
          fit: null,
          bandShown: true,
          by: { key, noneLabel: 'None', totalShown: true },
        })
        expectGuarded(fig.rows, fig.total, { min: 5, label: `${w} ${name}` })
        expect(fig.rows.some((r) => r.key === '1550-HSZ')).toBe(false)
        expect(fig.rows.filter((r) => r.isOther).length).toBeLessThanOrEqual(1)
      }
  })

  it('every rounded figure is the sum of its shown atoms’ rounded parts, for each unit and its departments', () => {
    expect(index.atoms.length).toBe(64)
    for (const unit of new Set(fy.map((m) => m.seat.businessUnit))) {
      const members = fy.filter((m) => m.seat.businessUnit === unit)
      const fig = guardModel({
        members,
        mode: 'rounded',
        rules: RULES,
        atoms: index,
        fit: null,
        bandShown: true,
        by: { key: (m) => m.seat.department, noneLabel: 'No department', totalShown: true },
      })
      const parts = Object.values(fig.parts ?? {})
      if (!fig.total.hidden) expect(fig.total.totalUsd, unit).toBe(sumRounded(parts))
      expectGuarded(fig.rows, fig.total, { min: 5, rounded: true, step: COST_STEP, label: unit })
      for (const r of [fig.total, ...fig.rows])
        for (const v of [r.amounts.loaded, r.totalUsd, r.bandUsd])
          if (v != null) expect(isRoundedCost(v), `${unit} ${r.label}`).toBe(true)
    }
  })
})
