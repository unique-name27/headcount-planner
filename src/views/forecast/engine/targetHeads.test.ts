/**
 * Year-end heads against the target in a leader's org (review RC-3): the target's org holds the
 * leader's own seat, so the heads compared with it count that seat too, and the leader reads the
 * same comparison as the unit's HRBP and HR admin; "Cost vs target" keeps the guard's note that
 * people in groups under 5 are left out, on the tile and its delta card (review RC-4).
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { resolveCalc } from '@/drill/calc'
import { resolveDrill } from '@/drill/types'
import { ctxAs, leakSample, personaCtx, personaOf } from '@/testkit/sample'
import { forecastModel } from '.'

beforeAll(() => {
  leakSample()
}, 60_000)

describe('year-end heads vs target in a leader’s org (RC-3)', () => {
  it('the SVP of Silicon Engineering compares like with like: the HRBP’s value and delta', () => {
    const s = leakSample()
    const leader = forecastModel(personaCtx('leader-svp-se'))
    const hrbp = forecastModel(
      ctxAs('hrbp', personaOf(s, 'hrbp-se').employeeId, { unit: 'Silicon Engineering' }),
    )
    const tile = (m: typeof leader) => m.overview.kpis.find((k) => k.id === 'year-end-heads')
    const l = tile(leader)
    const h = tile(hrbp)
    expect(l?.deltaLabel).toBe(h?.deltaLabel)
    // Before the fix the leader read 587.5 against 601 (−13.47) and the HRBP 588.5 (−12.49).
    expect(l?.value as number).toBeCloseTo(h?.value as number, 6)
    expect(l?.delta as number).toBeCloseTo(h?.delta as number, 6)
    expect(l?.note).toContain('your own seat counted in both')
    // The card's steps end on the value and its seats add up to it.
    const card = resolveCalc(l?.calc ?? null)
    expect(card?.steps[card.steps.length - 1].result).toBe(l?.value)
    const rows = resolveDrill(card?.rows)
    const sum = (rows?.rows ?? []).reduce((a, r) => a + (rows?.weight?.(r as never) ?? 0), 0)
    expect(sum).toBeCloseTo(l?.value as number, 6)
  })
})

describe('Cost vs target keeps the guard’s note (RC-4)', () => {
  it('the CFO’s rounded Cost vs target says people are left out, on the tile and its delta card', () => {
    const m = forecastModel(personaCtx('leader-cfo'))
    const strip = m.overview.kpis.find((k) => k.id === 'cost-full-year')
    const tile = m.overview.costVsTarget
    expect(strip?.note).toMatch(/left out/)
    expect(tile?.note).toContain(strip?.note as string)
    expect(tile?.note).toContain('Target cost of FY27')
    const card = resolveCalc(tile?.deltaCalc ?? null)
    expect(card?.note).toContain(strip?.note as string)
    expect(card?.note).toContain('the target counts them')
  })
})
