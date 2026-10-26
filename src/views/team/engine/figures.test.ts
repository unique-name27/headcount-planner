/** My team's hero drill labels read counts in plain words (docs/PLAN.md 14.3, R86; M4 review CP-5). */
import { describe, expect, it } from 'vitest'
import { heroDrillLabel } from './figures'

describe('the hero drill label', () => {
  it('reads "Show the 1 seat left to fill", never "1 seats"', () => {
    expect(heroDrillLabel(1, 'left to fill')).toBe('Show the 1 seat left to fill')
    expect(heroDrillLabel(12, 'left to fill')).toBe('Show the 12 seats left to fill')
  })
})
