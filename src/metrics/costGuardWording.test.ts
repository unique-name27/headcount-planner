/**
 * The minimum-contributors rule's wording (docs/PLAN.md 7.2 rule 5, change C34; M2-REPORT close-out):
 * the dictionary says that the bridge's fold is decided once, over the finest groups, and applies in
 * every scope, as the bridge engine does it.
 */
import { describe, expect, it } from 'vitest'
import { COST_GUARD_METRICS, MIN_CONTRIBUTORS } from './costGuard'

describe('the minimum contributors entry', () => {
  const def = COST_GUARD_METRICS.find((d) => d.id === MIN_CONTRIBUTORS.metricId)

  it('says the bridge fold is decided once and applies in every scope (C34)', () => {
    expect(def?.definition).toMatch(/decided once for each mode, comparison and window/)
    expect(def?.definition).toMatch(/business units in Finance and HR admin/)
    expect(def?.definition).toMatch(/kept cost atoms in HRBP and Leader mode/)
    expect(def?.definition).toMatch(/applies in every scope/)
  })

  it('keeps the copy rules: no em dash in its own words, no "!"', () => {
    const own = (def?.definition ?? '').replace(/"—"/g, '')
    expect(own).not.toMatch(/—|!/)
  })
})
