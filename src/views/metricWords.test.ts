/**
 * Manager and Finance never read the word "leave" (docs/CONTRACTS-M4.md 8.3, review HL-12): no metric
 * either mode shows says "leave", "leaves" or "leaving" in its name, definition, formula, population
 * or window, so the glossary, Settings > Formulas and every info popover stay free of it. The help
 * group's scan covers the articles and tours; this one covers the dictionary entries the views own
 * (the trade credit's "a trade leaves over", the budget status's "a known exit leaves"). The shared
 * rule entries (`privacy.`, `quality.`, `cost.`) are src/metrics' own and are left to its tests.
 */
import { describe, expect, it } from 'vitest'
import { decide } from '@/access/policy'
import { CATALOG } from '@/metrics/catalog'
import { VIEWS } from './registry'

const LEAVE = /\bleav(?:e|es|ing)\b/i
const VIEW_KEYS = new Set<string>(VIEWS.map((v) => v.key))
const ownedByAView = (id: string) => VIEW_KEYS.has(id.split('.')[0])

describe('metric wording in Manager and Finance mode (review HL-12)', () => {
  it('has no "leave" in any metric either mode shows', () => {
    const hits: string[] = []
    let shown = 0
    for (const mode of ['manager', 'finance'] as const)
      for (const m of CATALOG.list) {
        if (!ownedByAView(m.id) || decide(mode, `metric:${m.id}`).access === 'hidden') continue
        shown++
        for (const field of ['name', 'definition', 'formula', 'population', 'window'] as const) {
          const text = m[field]
          if (typeof text === 'string' && LEAVE.test(text)) hits.push(`${mode} ${m.id} ${field}: ${text}`)
        }
      }
    expect(shown).toBeGreaterThan(50)
    expect(hits).toEqual([])
  })
})
