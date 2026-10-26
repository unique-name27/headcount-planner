/**
 * Differences (docs/PLAN.md 7.2 rule 5, change C6, 16.1 "No month or version difference equals one
 * person's cost"): contributors count costed positions only, a band-only difference is a band figure,
 * and bridge steps fold into "Other changes". Fixtures: 3 Filled + 2 Open shows no difference in any
 * mode; deferring one Planned seat in What if shows its exact band delta in HRBP, Leader and Finance
 * and hides it in Manager.
 */
import { describe, expect, it } from 'vitest'
import { guardModeIn, showCostIn } from '@/access/pay'
import { MODES } from '@/data/schema'
import {
  bandOnly,
  basisOfSides,
  contributors,
  DIFF_EPS,
  differenceNote,
  filledByPosition,
  foldSteps,
  guardedDifference,
  loadedByPosition,
  OTHER_CHANGES,
  type StepFacts,
} from './differences'
import { NO_AMOUNTS_NOTE } from './fit'
import { OTHER } from './fold'
import { type CostMember, guardModel, sumAmounts } from './guard'
import { FY27, filled, membersOf, open, RULES, team } from './guard.testkit'

const map = (entries: Record<string, number>) => new Map(Object.entries(entries))

/** A difference between two sides' members, as a model builder makes it, in a mode. */
function difference(
  a: readonly CostMember[],
  b: readonly CostMember[],
  mode: (typeof MODES)[number],
  switchOn = false,
) {
  const guard = guardModeIn(mode, switchOn)
  const delta = sumAmounts(b).loaded - sumAmounts(a).loaded
  return guardedDifference(
    delta,
    contributors(filledByPosition(a), filledByPosition(b)),
    RULES.minContributors,
    {
      bandOnly: bandOnly(loadedByPosition(a), loadedByPosition(b), basisOfSides(a, b)),
      bandShown: showCostIn(mode, switchOn),
      mode: guard,
    },
  )
}

describe('contributors', () => {
  it('counts positions more than half a cent apart, a position on one side only against 0', () => {
    const got = contributors(map({ a: 100, b: 50, c: 10, d: 7 }), map({ a: 100.004, b: 50.006, c: 10, e: 3 }))
    expect([...got].sort()).toEqual(['b', 'd', 'e'])
    expect(DIFF_EPS).toBe(0.005)
    expect(contributors(map({ a: 1 }), map({ a: 2 }), 5).size).toBe(0)
  })

  it('leave transitions count: an unpaid leave month moves the holder’s amount', () => {
    const a = membersOf(team('P', 5, FY27), FY27)
    const onLeave = [
      ...team('P', 4, FY27),
      ...filled('P5', FY27.slice(0, 6)),
      ...filled('P5', FY27.slice(6), {}),
    ]
    const b = membersOf(onLeave, FY27)
    expect([...contributors(filledByPosition(a), filledByPosition(b))]).toEqual(['P5'])
    expect(bandOnly(loadedByPosition(a), loadedByPosition(b), basisOfSides(a, b))).toBe(false)
  })

  it('the FX effect counts non-USD costed people only', () => {
    const lines = [...team('U', 6, FY27), ...filled('E1', FY27, { base: 9_000 }, { currency: 'EUR' })]
    const ms = membersOf(lines, FY27)
    const moved = ms.map((m) =>
      m.currency === 'EUR' ? { ...m, amounts: { ...m.amounts, loaded: 120_000 } } : m,
    )
    const nonUsd = (m: CostMember) => m.currency !== 'USD'
    const c = contributors(filledByPosition(ms, 'loaded', nonUsd), filledByPosition(moved, 'loaded', nonUsd))
    expect([...c]).toEqual(['E1'])
    expect(guardedDifference(12_000, c, RULES.minContributors)).toMatchObject({
      value: null,
      contributors: 1,
    })
  })
})

describe('bandOnly', () => {
  const basis = (bands: readonly string[]) => (id: string) => (bands.includes(id) ? 'band' : 'hris')

  it('is true when only band-costed positions differ, false when anything else does', () => {
    expect(bandOnly(map({ o1: 9_000, f1: 10 }), map({ o1: 12_000, f1: 10 }), basis(['o1']))).toBe(true)
    expect(bandOnly(map({ o1: 9_000, f1: 10 }), map({ o1: 12_000, f1: 11 }), basis(['o1']))).toBe(false)
    // A seat band on one side and filled on the other is not band only.
    expect(
      bandOnly(map({ s: 9_000 }), map({ s: 10_000 }), (_id, side) => (side === 'a' ? 'band' : 'hris')),
    ).toBe(false)
    // A new Planned seat: band where it exists, absent on the other side.
    expect(bandOnly(map({}), map({ p: 27_000 }), (_id, side) => (side === 'b' ? 'band' : null))).toBe(true)
  })

  it('is false when nothing differs (a difference with no change is no band figure)', () => {
    expect(bandOnly(map({ a: 1 }), map({ a: 1 }), () => 'band')).toBe(false)
  })
})

describe('guardedDifference', () => {
  const five = new Set(['a', 'b', 'c', 'd', 'e'])

  it('shows with the minimum or more contributors, reads "—" under it, the minimum read as given', () => {
    expect(guardedDifference(-12.5, five, 5)).toEqual({
      value: -12.5,
      contributors: 5,
      band: false,
      reason: null,
    })
    expect(guardedDifference(9, 4, 5)).toEqual({
      value: null,
      contributors: 4,
      band: false,
      reason: differenceNote(5),
    })
    expect(guardedDifference(9, five, 10)).toMatchObject({ value: null, reason: differenceNote(10) })
    expect(differenceNote(5)).toBe('Hidden to protect anonymity (fewer than 5 positions changed)')
  })

  it('a band figure shows where band estimates show, with no contributor count', () => {
    expect(guardedDifference(27_000, 0, 5, { bandOnly: true, bandShown: true })).toEqual({
      value: 27_000,
      contributors: 0,
      band: true,
      reason: null,
    })
    expect(guardedDifference(27_000, 0, 5, { bandOnly: true })).toMatchObject({
      value: null,
      reason: NO_AMOUNTS_NOTE,
    })
  })

  it('Manager mode shows none; HR admin with the switch shows every one', () => {
    expect(
      guardedDifference(27_000, 0, 5, { bandOnly: true, bandShown: true, mode: 'none' }).value,
    ).toBeNull()
    expect(guardedDifference(3, 1, 5, { mode: 'open' })).toMatchObject({
      value: 3,
      contributors: 1,
      reason: null,
    })
  })
})

describe('the PLAN’s fixtures in every mode', () => {
  it('3 Filled + 2 Open shows no difference in any mode (but HR admin with the switch)', () => {
    const before = [...team('F', 3, FY27, 10_000), ...open('O1', FY27), ...open('O2', FY27)]
    const after = [
      ...team('F', 3, FY27, 11_000),
      ...open('O1', FY27, { base: 10_000 }),
      ...open('O2', FY27, { base: 10_000 }),
    ]
    const a = membersOf(before, FY27)
    const b = membersOf(after, FY27)
    expect(contributors(filledByPosition(a), filledByPosition(b)).size).toBe(3)
    for (const mode of MODES) {
      const d = difference(a, b, mode)
      expect(d.value, mode).toBeNull()
      expect(d.band, mode).toBe(false)
    }
    expect(difference(a, b, 'hr-admin', true).value).toBe(3 * 12_000 + 2 * 12_000)
    // Five changed Filled seats are enough.
    const five = membersOf(team('F', 5, FY27, 10_000), FY27)
    const raised = membersOf(team('F', 5, FY27, 10_100), FY27)
    expect(difference(five, raised, 'finance').value).toBeCloseTo(5 * 1_200, 6)
  })

  it('deferring one Planned seat in What if shows its exact band delta in HRBP, Leader and Finance, not in Manager', () => {
    const base = team('F', 10, FY27)
    const planned = open('P1', FY27.slice(6), { base: 9_000 }, { status: 'Planned' })
    const deferred = open('P1', FY27.slice(9), { base: 9_000 }, { status: 'Planned' })
    const a = membersOf([...base, ...planned], FY27)
    const b = membersOf([...base, ...deferred], FY27)
    const shown = { hrbp: true, leader: true, finance: true, 'hr-admin': true, manager: false } as const
    for (const mode of MODES) {
      const d = difference(a, b, mode)
      expect(d.band, mode).toBe(true)
      expect(d.value, mode).toBe(shown[mode] ? -27_000 : null)
      expect(d.contributors, mode).toBe(0)
    }
  })

  it('in rounded modes the difference of two guarded totals is built from rounded parts', () => {
    const atom = (ms: CostMember[]) => ms.map((m) => ({ ...m, atomId: 'A' }))
    const a = atom(membersOf(team('F', 6, FY27, 20_000), FY27))
    const b = atom(membersOf(team('F', 6, FY27, 21_000), FY27))
    const fig = (ms: CostMember[]) =>
      guardModel({ members: ms, mode: 'rounded', rules: RULES, atoms: null, fit: null, bandShown: true })
    const delta = (fig(b).total.totalUsd as number) - (fig(a).total.totalUsd as number)
    // 6 × 20,000 × 12 = 1,440,000 → 1.4M; 6 × 21,000 × 12 = 1,512,000 → 1.5M.
    expect(delta).toBe(100_000)
    const c = contributors(filledByPosition(a), filledByPosition(b))
    expect(guardedDifference(delta, c, RULES.minContributors, { mode: 'rounded' }).value).toBe(100_000)
  })
})

describe('foldSteps: bridge steps under rule 5', () => {
  const step = (key: string, ids: readonly string[], delta = 1, band = false): StepFacts => ({
    key,
    delta,
    contributors: new Set(ids),
    ...(band ? { band } : {}),
  })
  const people = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i}`)

  it('folds steps under the minimum into Other changes, pulling the fewest shown step while it is under', () => {
    const steps = [
      step('heads', people('h', 9), 10),
      step('mix', people('m', 6), 20),
      step('fx', people('x', 2), 30),
      step('pay', people('p', 1), 40),
    ]
    const f = foldSteps(steps, 5)
    expect(f.shown.map((s) => s.key)).toEqual(['heads'])
    expect(f.other).toMatchObject({ key: OTHER, label: OTHER_CHANGES, delta: 90, contributors: 9 })
    // Folded steps keep the bridge's order.
    expect(f.other?.steps.map((s) => s.key)).toEqual(['mix', 'fx', 'pay'])
  })

  it('counts distinct contributors across folded steps, and takes the first of equal fewest', () => {
    const shared = ['a', 'b', 'c']
    const f = foldSteps(
      [step('one', shared), step('two', shared), step('big', people('g', 7)), step('big2', people('k', 7))],
      5,
    )
    expect(f.other?.contributors).toBe(10)
    expect(f.shown.map((s) => s.key)).toEqual(['big2'])
  })

  it('shows every step with the minimum or more, and never folds a band figure', () => {
    expect(foldSteps([step('a', people('a', 5)), step('b', people('b', 6))], 5).other).toBeNull()
    const f = foldSteps([step('band', [], 500, true), step('a', people('a', 6)), step('x', ['x1', 'x2'])], 5)
    expect(f.shown.map((s) => s.key)).toEqual(['band'])
    expect(f.other?.steps.map((s) => s.key)).toEqual(['a', 'x'])
  })

  it('a step with nobody behind it joins Other changes without pulling a shown step in', () => {
    const f = foldSteps([step('a', people('a', 6)), step('none', [], 0)], 5)
    expect(f.shown.map((s) => s.key)).toEqual(['a'])
    expect(f.other).toMatchObject({ delta: 0, contributors: 0 })
  })

  it('reads the minimum it is given', () => {
    expect(foldSteps([step('a', people('a', 6))], 10).other?.contributors).toBe(6)
  })

  it('never pulls in a step another surface publishes while another can go (C33, RC-1)', () => {
    // One position's change folds; the FX step (6) is the fewest shown, but its tile shows on its own.
    const steps = [step('positions', ['p1']), step('fx', people('x', 6)), step('rates', people('r', 9))]
    const fx = new Set(['fx'])
    const f = foldSteps(steps, 5, { published: fx })
    // Before C33 Other changes took FX in, and Other less the FX tile gave the one position's change.
    expect(f.other?.steps.map((s) => s.key)).toEqual(['positions', 'rates'])
    expect(f.shown.map((s) => s.key)).toEqual(['fx'])
    // With no other step left, a published one still joins (its tile then hides, src/views/forecast).
    const only = foldSteps([step('positions', ['p1']), step('fx', people('x', 6))], 5, { published: fx })
    expect(only.other?.steps.map((s) => s.key)).toEqual(['positions', 'fx'])
    // Without the option the fewest joins, as before.
    expect(foldSteps(steps, 5).other?.steps.map((s) => s.key)).toEqual(['positions', 'fx'])
  })

  it('a costed move with nobody counted (a cohort’s modeled exits) pulls a shown step in, never a move of nobody', () => {
    // An HRIS cohort's modeled exits move a step and are no position, so the step counts nobody.
    const cohort: StepFacts = { key: 'timing', delta: -200_000, contributors: new Set(), moves: true }
    const f = foldSteps([cohort, step('attrition', people('a', 17), 100_000)], 5)
    expect(f.other).toMatchObject({ contributors: 17, delta: -100_000 })
    expect(f.shown).toEqual([])
    // A step that moved nothing still joins alone, pulling nothing.
    const none: StepFacts = { key: 'mix', delta: 0, contributors: new Set() }
    expect(foldSteps([none, step('attrition', people('a', 17))], 5).shown.map((s) => s.key)).toEqual([
      'attrition',
    ])
  })
})
