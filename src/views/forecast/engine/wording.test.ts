/** The bridge's contributor line reads counts in plain words (docs/PLAN.md 14.3, R86; M4 review CP-5). */
import { describe, expect, it } from 'vitest'
import { positionsMovedText } from './wording'

describe('the bridge bar contributor line', () => {
  it('reads "1 position moved", never "1 positions moved"', () => {
    expect(positionsMovedText(1)).toBe('1 position moved')
    expect(positionsMovedText(1234)).toBe('1,234 positions moved')
  })
})
