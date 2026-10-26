/**
 * The filter row's options on the sample (docs/PLAN.md 9.2): Filled heads on the as-of date, placed
 * by their seats (people not in the plan by their own fields), each option counted within the rest
 * of the row; leader seats sized by the heads in their tree; the small exclusion rule; the
 * Include / Exclude switch each mode's clamp keeps; the custom range's checks.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { MODES } from '@/access/modes'
import { generateSample, type Sample } from '@/data/sample'
import { buildPositionIndex, DEFAULT_FILTERS, FILTER_DIMENSIONS, type PositionIndex } from '@/data/scope'
import {
  customRangeError,
  dimensionOptions,
  type FilledHead,
  filledHeads,
  headMatcher,
  leaderChain,
  leaderOptions,
  offersExclude,
  otherFilters,
  tooFewToLeaveOut,
} from './filterOptions'

let sample: Sample
let index: PositionIndex
let heads: FilledHead[]

beforeAll(() => {
  sample = generateSample()
  index = buildPositionIndex(sample.datasets.positions, sample.asOf)
  heads = filledHeads(sample.datasets, index)
}, 60_000)

describe('the heads the row counts', () => {
  it('are the actual heads at 30 Sep: 1,450 in seats and 6 not in the plan (docs/PLAN.md 13.1)', () => {
    expect(heads).toHaveLength(1456)
    expect(heads.filter((h) => h.positionId)).toHaveLength(1450)
    expect(new Set(heads.map((h) => h.employeeId)).size).toBe(1456)
    // Built once per workers array and index.
    expect(filledHeads(sample.datasets, index)).toBe(heads)
  })

  it('count each unit by its seats, and within the rest of the row', () => {
    const units = dimensionOptions(heads, 'businessUnit')
    const count = (v: string) => units.find((o) => o.value === v)?.count
    expect(count('Silicon Engineering')).toBe(556)
    expect(count('Go-to-Market')).toBe(184)
    // Within Bengaluru only, Silicon Engineering counts its Bengaluru heads and the rest follow.
    const within = headMatcher({ ...DEFAULT_FILTERS, location: ['Bengaluru'] }, sample.datasets, index)
    const inBlr = dimensionOptions(heads, 'businessUnit', [], within)
    const blrTotal = heads.filter(within).length
    expect(inBlr.reduce((n, o) => n + o.count, 0)).toBe(blrTotal)
    // Values with nobody left follow the others.
    const firstEmpty = inBlr.findIndex((o) => o.count === 0)
    if (firstEmpty >= 0) expect(inBlr.slice(firstEmpty).every((o) => o.count === 0)).toBe(true)
  })

  it('keep a selected value the data no longer has, at 0, and order levels by the ladder', () => {
    const units = dimensionOptions(heads, 'businessUnit', ['Atlantis'])
    expect(units.find((o) => o.value === 'Atlantis')?.count).toBe(0)
    const levels = dimensionOptions(heads, 'level').map((o) => o.value)
    expect(levels.indexOf('P1')).toBeLessThan(levels.indexOf('P6'))
    expect(levels.indexOf('P6')).toBeLessThan(levels.indexOf('M1'))
    expect(dimensionOptions(heads, 'level').find((o) => o.value === 'P4')?.label).toMatch(/^P4 /)
  })

  it('leave out the rest of the row only for the dimension asked about', () => {
    const f = { ...DEFAULT_FILTERS, businessUnit: ['Corporate'], level: ['P4'] }
    expect(otherFilters(f, 'businessUnit').businessUnit).toEqual([])
    expect(otherFilters(f, 'businessUnit').level).toEqual(['P4'])
    expect(otherFilters({ ...f, leaderId: 'P-1001' }, 'leaderId').leaderId).toBeNull()
  })
})

describe('leader seats', () => {
  it('are sized by the Filled heads in their tree, largest first, the top seat holding every seated head', () => {
    const names = new Map<string, string>()
    const options = leaderOptions({ index, heads, names })
    expect(options[0].size).toBe(1450)
    for (let i = 1; i < options.length; i++) expect(options[i].size).toBeLessThanOrEqual(options[i - 1].size)
    expect(options.every((o) => o.size >= 3)).toBe(true)
    // Unnamed seats read by their title, else their position ID.
    expect(options[0].name.length).toBeGreaterThan(0)
  })

  it('a chain runs from the top seat down to the seat', () => {
    const leaf = heads.find((h) => h.positionId)?.positionId
    if (!leaf) throw new Error('no seat')
    const chain = leaderChain(index, leaf)
    expect(chain.at(-1)).toBe(leaf)
    expect(index.byId.get(chain[0])?.managerPositionId ?? null).toBeNull()
  })
})

describe('the small exclusion rule and the Include / Exclude switch', () => {
  it('a choice that leaves out 1 to 4 Filled heads cannot be excluded', () => {
    expect(tooFewToLeaveOut(0, 5)).toBe(false)
    expect(tooFewToLeaveOut(1, 5)).toBe(true)
    expect(tooFewToLeaveOut(4, 5)).toBe(true)
    expect(tooFewToLeaveOut(5, 5)).toBe(false)
  })

  it('is offered where the mode’s clamp keeps an exclusion', () => {
    for (const d of FILTER_DIMENSIONS) {
      expect(offersExclude('finance', d, null), `finance ${d}`).toBe(false)
      expect(offersExclude('hr-admin', d, null), `hr-admin ${d}`).toBe(true)
    }
    // Manager filters the leader, level and location only.
    expect(offersExclude('manager', 'businessUnit', null)).toBe(false)
    for (const m of MODES) expect(typeof offersExclude(m, 'level', null)).toBe('boolean')
  })
})

describe('the custom range', () => {
  it('needs two dates in order, ending on or before the reporting date', () => {
    expect(customRangeError('', '2026-09-30')).toBe('Enter both dates.')
    expect(customRangeError('2026-09-30', '2026-04-01')).toBe(
      'The start date must be on or before the end date.',
    )
    expect(customRangeError('2026-04-01', '2026-10-31', '2026-09-30')).toBe(
      'The end date must be on or before the reporting date, 30 Sep 2026.',
    )
    expect(customRangeError('2026-04-01', '2026-09-30', '2026-09-30')).toBeNull()
  })
})
