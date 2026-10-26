/**
 * Forecast > Bridge under lead decision D-FIN (c) (PLAN change C33): bridge steps and the FX effect
 * show per unit and company only; a step that folds into Other changes in any unit folds for the
 * company too, so no company step less its units' shown steps isolates a part of 1 to 4
 * contributors; Other changes never takes in a step another surface publishes, and the FX effect tile
 * reads the same folded result as the bridge row (review RC-1: Other changes less the FX tile gave
 * one position's cost change). Contributor lists never read leave (review RR-1: one person's leave
 * turning unpaid added their seat to three steps' lists in HRBP and Leader mode).
 */
import { beforeAll, describe, expect, it } from 'vitest'
import type { AnalyticsContext } from '@/data/context'
import { resolveDrill } from '@/drill/types'
import { ctxAs, leakSample, personaCtx, personaOf, withWorker } from '@/testkit/sample'
import { type BridgeStepRow, forecastModel } from '.'
import { prepare } from './base'
import { bridgeWindow, foldedOf, fxEffectOf, globalFold } from './bridge'
import { sampleCtx } from './fixtures'

const cents = (v: number) => Math.round(v * 100)

beforeAll(() => {
  leakSample()
}, 60_000)

const rowsOf = (ctx: AnalyticsContext): readonly BridgeStepRow[] => forecastModel(ctx).bridge.steps.rows

describe('the FX tile and the bridge read one folded result (RC-1)', () => {
  it('Finance, company, against the Budget: the FX tile shows only beside its own FX step, at its value', () => {
    for (const ctx of [sampleCtx('finance'), sampleCtx('hr-admin')]) {
      const m = forecastModel(ctx)
      const fxRow = m.bridge.steps.rows.find((r) => r.key === 'fx')
      const tile = m.bridge.kpis.find((k) => k.id === 'fx-effect')
      expect(tile, ctx.mode).toBeDefined()
      if (tile?.value != null) {
        // Before C33 the company's FX was folded into Other changes while its tile showed.
        expect(fxRow?.value, ctx.mode).not.toBeNull()
        // The tile is the FX formula on the forecast lines, the row the step in whole cents: one cent apart at most.
        expect(
          Math.abs(cents(fxRow?.value as number) - cents(tile.value as number)),
          ctx.mode,
        ).toBeLessThanOrEqual(1)
      } else expect(fxRow?.contributors ?? null, ctx.mode).toBeNull()
    }
  })

  it('Other changes never takes in the published FX step while another step can go', () => {
    for (const filters of [{}, { businessUnit: ['Operations'] }, { businessUnit: ['Silicon Engineering'] }]) {
      const p = prepare(sampleCtx('finance', { filters }))
      for (const months of [p.fyMonths, p.ytdMonths]) {
        const folded = foldedOf(p, bridgeWindow(p, months), months)
        const inOther = (folded.other?.steps ?? []).map((f) => f.step.key)
        const tile = fxEffectOf(p, months)
        if (tile.value != null) expect(inOther, JSON.stringify(filters)).not.toContain('fx')
        // Other changes holds 0 or 5 or more contributors.
        const n = folded.other?.contributors ?? 0
        expect(n === 0 || n >= 5, `${JSON.stringify(filters)} ${months.length}: ${n}`).toBe(true)
      }
    }
  })
})

describe('one fold of steps for every scope (D-FIN (c))', () => {
  it('each shown company step, and Other changes, is the sum of the units’ own, to the cent', () => {
    const units = [...new Set(leakSample().datasets.positions.map((r) => r.businessUnit))].sort()
    const company = rowsOf(sampleCtx('finance'))
    const byUnit = units.map((u) => rowsOf(sampleCtx('finance', { filters: { businessUnit: [u] } })))
    const steps = company.filter((r) => (r.kind === 'step' || r.kind === 'other') && r.value != null)
    expect(steps.length).toBeGreaterThan(3)
    for (const r of steps) {
      let sum = 0
      for (const rows of byUnit) sum += rows.find((x) => x.key === r.key)?.value ?? 0
      // Before C33 the company's Assumption rates less the other units' gave Operations' folded part.
      // Each unit's band part is in whole cents: a cent a unit at most.
      expect(Math.abs(cents(sum) - cents(r.value as number)), r.key).toBeLessThanOrEqual(units.length)
    }
  })

  it('a step that folds in any unit folds for the company, and every unit folds the same steps', () => {
    const p = prepare(sampleCtx('finance'))
    const folded = globalFold(p, p.fyMonths)
    expect(folded.size).toBeGreaterThan(0)
    const units = [...new Set(leakSample().datasets.positions.map((r) => r.businessUnit))].sort()
    for (const u of [null, ...units]) {
      const q = prepare(sampleCtx('finance', { filters: u ? { businessUnit: [u] } : {} }))
      expect([...globalFold(q, q.fyMonths)], u ?? 'company').toEqual([...folded])
      for (const r of rowsOf(q.ctx))
        if (r.kind === 'step' && folded.has(r.key as never))
          expect(r.contributors, `${u} ${r.key}`).toBeNull()
    }
  })

  it('shows no bridge step and no FX effect under a cost-center, country, legal-entity or currency filter', () => {
    for (const filters of [
      { costCenter: ['1110-SJC'] },
      { costCenter: ['1010-SJC', '1230-SGN'] },
      { country: ['Germany'] },
      { currency: ['EUR'] },
    ]) {
      const m = forecastModel(sampleCtx('finance', { filters }))
      expect(m.bridge.steps.rows, JSON.stringify(filters)).toEqual([])
      expect(m.bridge.kpis.find((k) => k.id === 'fx-effect')?.value ?? null).toBeNull()
    }
  })
})

describe('contributor lists never read leave (RR-1)', () => {
  /** Each step's contributor count and the positions its drill lists. */
  function lists(ctx: AnalyticsContext): Record<string, { n: number | null; ids: string[] }> {
    const out: Record<string, { n: number | null; ids: string[] }> = {}
    for (const r of rowsOf(ctx)) {
      let ids: string[] = []
      if (r.drill) {
        const spec = resolveDrill(r.drill) as { rows?: readonly { positionId: string }[] } | null
        ids = (spec?.rows ?? []).map((x) => x.positionId).sort()
      }
      out[r.key] = { n: r.contributors, ids }
    }
    return out
  }

  it('a leave turning unpaid leaves every step’s count and positions as they were, in HRBP, Leader and Finance', () => {
    const s = leakSample()
    const latest = new Map<string, string>()
    const at = new Map<string, string>()
    for (const r of s.datasets.positions)
      if (!at.has(r.positionId) || r.effectiveDate >= (at.get(r.positionId) as string)) {
        at.set(r.positionId, r.effectiveDate)
        latest.set(r.positionId, r.businessUnit)
      }
    const onPaid = s.datasets.workers
      .filter(
        (w) =>
          w.workerType === 'Employee' &&
          w.onLeave === true &&
          w.leavePaid !== false &&
          !w.terminationDate &&
          !w.assignmentEnd &&
          latest.get(w.positionId ?? '') === 'Silicon Engineering',
      )
      .sort((a, b) => (a.employeeId < b.employeeId ? -1 : 1))
      .slice(0, 3)
    expect(onPaid.length).toBeGreaterThan(0)
    const hrbp = personaOf(s, 'hrbp-se').employeeId
    const svp = personaOf(s, 'leader-svp-se').employeeId
    const makers: [string, (x: typeof s) => AnalyticsContext][] = [
      ['hrbp', (x) => ctxAs('hrbp', hrbp, { sample: x, unit: 'Silicon Engineering' })],
      ['leader', (x) => ctxAs('leader', svp, { sample: x })],
      ['finance', (x) => personaCtx('finance-fpa', { sample: x })],
    ]
    const before = new Map(makers.map(([k, mk]) => [k, lists(mk(s))]))
    let compared = 0
    for (const w of onPaid) {
      const x = withWorker(s, w.employeeId, { leavePaid: false })
      for (const [k, mk] of makers) {
        const after = lists(mk(x))
        const base = before.get(k) as ReturnType<typeof lists>
        for (const key of new Set([...Object.keys(base), ...Object.keys(after)])) {
          expect(after[key], `${w.employeeId} ${k} ${key}`).toEqual(base[key])
          compared++
        }
      }
    }
    expect(compared).toBeGreaterThan(10)
  })
})
