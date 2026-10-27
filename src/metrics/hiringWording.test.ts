/**
 * Plan > Hiring's 18 metrics in each mode's own words (docs/PLAN.md 9.7 "Metrics" and "Privacy", 12,
 * 14.2; the hiring freeze, homes-help; C37 added Moves in by quarter end and Hires in the last 3
 * months): the module is heads only, so no hiring metric needs a
 * per-mode wording. Every mode shows all 18 and reads them exactly as the catalog writes them
 * (`metricsInMode` gives the catalog's own definition and formula), none carries a Guard class or a
 * money unit, none is hidden in Manager mode or by the rounded modes, and no word of theirs names a
 * pay field, an amount kind or leave (no "leave" in anything Manager or Finance mode reads).
 */
import { describe, expect, it } from 'vitest'
import { accessFor } from '@/access/context'
import { MODES } from '@/access/modes'
import { HIRING_METRIC_IDS } from '@/views/plan/metrics'
import { defaultMetrics } from './api'
import { CATALOG } from './catalog'
import { LEAVE_PREFIX, METRIC_GUARD, managerHides, roundedHides, showsMoney } from './guardClass'
import { METRIC_WORDING, metricsInMode, wordingIn } from './modeWording'

const metrics = defaultMetrics()
const ACCESS = Object.fromEntries(MODES.map((m) => [m, accessFor(m, null, metrics)]))

/** Words of pay, amounts and leave a heads-only metric never uses. */
const AMOUNT_WORDS =
  /\b(cost|costs|costed|salary|salaries|pay|band estimate|offer amount|sign-on|relocation|agency fee|bonus|usd|fx|leave)\b|[$€£¥₹₪]/i

describe('the hiring metrics in every mode', () => {
  it('are 18, every one in the catalog with a heads unit', () => {
    expect(HIRING_METRIC_IDS).toHaveLength(18)
    for (const id of HIRING_METRIC_IDS) {
      const d = CATALOG.byId.get(id)
      expect(d, id).toBeDefined()
      expect(['int', 'num1', 'pct'], id).toContain(d?.unit)
    }
  })

  it('need no per-mode wording: each mode reads the catalog’s own definition and formula', () => {
    for (const id of HIRING_METRIC_IDS) expect(METRIC_WORDING[id], id).toBeUndefined()
    for (const m of MODES) {
      const can = (s: string) => ACCESS[m].can(s)
      const worded = metricsInMode(metrics, can)
      for (const id of HIRING_METRIC_IDS) {
        expect(wordingIn(can, id), `${m} ${id}`).toBeNull()
        const d = worded.def(id)
        expect(d?.definition, `${m} ${id}`).toBe(CATALOG.byId.get(id)?.definition)
        expect(d?.formula, `${m} ${id}`).toBe(CATALOG.byId.get(id)?.formula)
      }
    }
  })

  it('show in every mode, with no Guard class and nothing the guard or Manager mode hides', () => {
    for (const id of HIRING_METRIC_IDS) {
      expect(METRIC_GUARD[id], id).toBeUndefined()
      expect(showsMoney(id), id).toBe(false)
      expect(managerHides(id), id).toBe(false)
      expect(roundedHides(id), id).toBe(false)
      expect(id.startsWith(LEAVE_PREFIX), id).toBe(false)
      for (const m of MODES) expect(ACCESS[m].can(`metric:${id}`), `${m} ${id}`).toBe(true)
    }
  })

  it('name no pay field, amount kind or leave in any word a mode reads', () => {
    for (const id of HIRING_METRIC_IDS) {
      const d = CATALOG.byId.get(id)
      const text = [d?.name, d?.definition, d?.formula, d?.population, d?.window].join('\n')
      expect(text.match(AMOUNT_WORDS)?.[0] ?? null, id).toBeNull()
      expect(text.toLowerCase(), id).not.toContain('headcount to hire')
    }
    // Not vacuous: the scan finds the words it bans.
    expect('Loaded cost of the open seats'.match(AMOUNT_WORDS)?.[0]).toBe('cost')
    expect('People on leave stay in current heads'.match(AMOUNT_WORDS)?.[0]).toBe('leave')
    expect('Open to hire, $1.2M'.match(AMOUNT_WORDS)?.[0]).toBe('$')
  })
})
