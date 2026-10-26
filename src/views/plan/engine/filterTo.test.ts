/**
 * "Filter to this" and "Leave out" reproduce the number (docs/PLAN.md 9.5, 16.1; the template app's
 * filterTo test): after Filter to a unit from its heads cell, the same figure's cell for that unit
 * holds the same count and nothing else is left in scope; from inside other filters too.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { checkFilterTo, offeredScope, rescopeContext } from '@/drill/testing'
import { resolveDrill } from '@/drill/types'
import { planModel } from '.'
import { sample, sampleCtx } from './fixtures'
import { NOT_IN_PLAN } from './overview'

beforeAll(() => {
  sample()
}, 60_000)

describe('Filter to a unit from Plan > Overview', () => {
  for (const key of ['approved', 'actual'] as const)
    it(`reproduces ${key} heads by unit`, () => {
      const base = sampleCtx('hr-admin')
      const { checks } = checkFilterTo(base, {
        name: `${key} heads by unit`,
        // The units' rows: people not in the plan stay in a unit's scope by their HRIS unit, on
        // the table's own "Not in plan" row (SA-6), which no unit's count holds.
        rows: (c) => planModel(c).overview.headsByUnit.rows.filter((r) => r.key !== NOT_IN_PLAN),
        key: (r) => r.key,
        value: (r) => r[key],
        drill: (r, c) =>
          planModel(c)
            .overview.headsByUnit.columns.find((x) => x.key === key)
            ?.drill?.(r) as never,
      })
      expect(checks.length).toBeGreaterThan(3)
      for (const c of checks) {
        expect(c.after, c.key).toBe(c.before)
        expect(c.total, c.key).toBe(c.before)
      }
    })

  it('keeps the unit’s count when left out of the rest', () => {
    const base = sampleCtx('hr-admin')
    const m = planModel(base)
    const row = m.overview.headsByUnit.rows.find((r) => r.key === 'Go-to-Market')
    const spec = resolveDrill(
      m.overview.headsByUnit.columns.find((c) => c.key === 'approved')?.drill?.(row as never) as never,
    )
    const next = offeredScope(base, spec?.filter ?? {}, 'exclude')
    expect(next).not.toBeNull()
    const out = planModel(rescopeContext(base, next as never)).overview.headsByUnit.rows
    expect(out.find((r) => r.key === 'Go-to-Market')).toBeUndefined()
    const sum = (rows: typeof out) => rows.reduce((a, r) => a + (r.approved ?? 0), 0)
    expect(sum(out)).toBe(sum(m.overview.headsByUnit.rows) - (row?.approved ?? 0))
  })

  it('keeps the readout’s focus on the group it names', () => {
    const base = sampleCtx('finance')
    const f = planModel(base).overview.findings.find((x) => x.id === 'heads-over-Go-to-Market')
    expect(f?.filter).toEqual({ businessUnit: ['Go-to-Market'] })
    const next = offeredScope(base, f?.filter ?? {})
    const m = planModel(rescopeContext(base, next as never))
    const actual = m.overview.kpis.find((k) => k.id === 'actual')
    expect(actual?.delta).toBe(8)
  })
})
