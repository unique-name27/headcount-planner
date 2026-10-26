/**
 * The 16.1 move rule's row lists (src/testkit/moves.ts): a pay or offer change may make a
 * difference's row show or fold away with 5 or more contributors, but a leave change compares row
 * lists strictly (`strictRows`, lead decision C34: the bridge's shape never reads leave), so a row
 * that comes or goes is a problem whatever its contributors. A ratio of amounts (forecast accuracy,
 * tagged `ratio` by the crawl) moves as the amounts it is made of, in exact modes only (fix step,
 * guard-crawl: with back-dated adjustments posted into closed months, review SA-2, it moves with
 * them); any other value that is not an amount still never moves.
 */
import { describe, expect, it } from 'vitest'
import type { Seen } from './crawl'
import { badMoves, changesOf, type MoveRules } from './moves'

const rules: MoveRules = { min: 5, rounded: false, step: 100_000, oneTime: false, sizer: () => 40 }

const at = (where: string, value: number, tag: Seen['tag'] = { in: 'forecast-bridge' }): Seen => ({
  where,
  value,
  tag,
})

/** A bridge with Timing, and the same bridge where Attrition also shows (12 positions moved). */
const before: Seen[] = [
  at('views/forecast/figure forecast-bridge/r key=timing.value', 1_000, {
    in: 'forecast-bridge',
    money: true,
  }),
  at('views/forecast/figure forecast-bridge/r key=timing.contributors', 9),
]
const after: Seen[] = [
  ...before,
  at('views/forecast/figure forecast-bridge/r key=attrition.value', 2_000, {
    in: 'forecast-bridge',
    money: true,
  }),
  at('views/forecast/figure forecast-bridge/r key=attrition.contributors', 12),
]

describe('row lists under the move rule', () => {
  it('lets a row with 5 or more contributors show or fold away after a pay change', () => {
    expect(badMoves(changesOf(before, after), rules, { before, after })).toEqual([])
    expect(badMoves(changesOf(after, before), rules, { before: after, after: before })).toEqual([])
  })

  it('compares row lists strictly after a leave change (C34)', () => {
    const strict = { ...rules, strictContributors: true, strictRows: true }
    const came = badMoves(changesOf(before, after), strict, { before, after })
    expect(came.length).toBe(2)
    for (const line of came) expect(line).toMatch(/^appeared or went away \(rows compare strictly\)/)
    expect(badMoves(changesOf(after, before), strict, { before: after, after: before }).length).toBe(2)
    // Equal row lists still pass, and an amount over 5 or more may still move.
    const moved = after.map((x) => (x.where.endsWith('timing.value') ? { ...x, value: 1_500 } : x))
    expect(badMoves(changesOf(after, moved), strict, { before: after, after: moved })).toEqual([])
  })
})

describe('a ratio of amounts under the move rule (forecast accuracy)', () => {
  const where = 'view finance/tab versions.kpis/tile finance-forecast-accuracy.value'
  const tile = (value: number, ratio: boolean): Seen =>
    at(where, value, { in: 'tile forecast.accuracy.cost', format: 'pct', ...(ratio ? { ratio: true } : {}) })

  it('moves as an amount over 5 or more costed people, in exact modes only', () => {
    const moved = changesOf([tile(0.984, true)], [tile(0.9841, true)])
    expect(badMoves(moved, rules)).toEqual([])
    expect(badMoves(moved, { ...rules, sizer: () => 3 })).toEqual([
      `costed people 3 (counted from the rows): ${where}: 0.984 -> 0.9841`,
    ])
    expect(badMoves(moved, { ...rules, rounded: true })).toEqual([
      `a ratio of amounts moved in a rounded mode: ${where}: 0.984 -> 0.9841`,
    ])
    // Its own tag, else counted from the rows.
    const tagged = changesOf(
      [at(where, 0.984, { in: 'card', format: 'pct', ratio: true, costed: 2 })],
      [at(where, 0.9841, { in: 'card', format: 'pct', ratio: true, costed: 2 })],
    )
    expect(badMoves(tagged, rules)).toEqual([`costed people 2: ${where}: 0.984 -> 0.9841`])
  })

  it('still lets no other percentage move', () => {
    expect(badMoves(changesOf([tile(0.984, false)], [tile(0.9841, false)]), rules)).toEqual([
      `a value that is not an amount moved: ${where}: 0.984 -> 0.9841`,
    ])
  })
})
