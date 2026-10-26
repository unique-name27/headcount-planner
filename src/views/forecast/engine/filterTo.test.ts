/**
 * "Filter to this" from the forecast's readout reproduces its number (docs/PLAN.md 9.5, 16.1): a
 * unit's year-end heads finding, once the app is filtered to that unit, is the Overview tile's
 * value there, and the unit's seats' "Counts as" add up to it.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { weightSum } from '@/drill/calc'
import { offeredScope, rescopeContext } from '@/drill/testing'
import { resolveDrill } from '@/drill/types'
import { ID } from '../metrics'
import { forecastModel } from '.'
import { sample, sampleCtx } from './fixtures'

beforeAll(() => {
  sample()
}, 60_000)

describe('Filter to a unit from the forecast readout', () => {
  it('reproduces the unit’s year-end heads', () => {
    const base = sampleCtx('finance')
    const findings = forecastModel(base).overview.findings.filter((f) => f.metricId === ID.headsYearEnd)
    expect(findings.length).toBeGreaterThan(1)
    for (const f of findings) {
      const spec = resolveDrill(f.drill)
      const before = weightSum(spec as never) as number
      const next = offeredScope(base, f.filter ?? {})
      expect(next, f.id).not.toBeNull()
      const after = forecastModel(rescopeContext(base, next as never)).overview.kpis.find(
        (k) => k.metricId === ID.headsYearEnd,
      )
      expect(after?.value, f.id).toBeCloseTo(before, 6)
    }
  })
})
