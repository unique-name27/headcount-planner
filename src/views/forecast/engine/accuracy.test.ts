/**
 * Forecast accuracy in the Forecast view (docs/PLAN.md 6.9, R14 and section 12: `forecast.accuracy.heads`
 * in Forecast, `forecast.accuracy.cost` in Forecast and Finance; M4 review SA-1, lead decision D-SPEC):
 * Forecast > Variance shows both, from the one engine Finance > Versions reads, FY27 Q1 Reforecast
 * against the actual for Jul to Sep 2026. Each card ends on its value; the stored forecast is the
 * company's, so a filter or a scope reads "—" with the reason; the cost figure hides in rounded modes.
 * One engine (fix step, loose ends): src/views/finance/engine/accuracy.ts `forecastAccuracyOf` picks
 * the reforecast and the run, and its arithmetic is src/plan/engine/accuracy.ts `accuracyOf`.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { Kpi } from '@/components/types'
import type { Mode } from '@/data/schema'
import { resolveCalc } from '@/drill/calc'
import { MemoryStorage } from '@/testkit/memoryStorage'
import { leakSample, personaCtx, sampleCtx } from '@/testkit/sample'
import { financeModel } from '@/views/finance/engine'
import { ACCURACY_COMPANY_NOTE, forecastAccuracyOf } from '@/views/finance/engine/accuracy'
import { forecastModel } from './index'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
vi.stubGlobal('localStorage', new MemoryStorage())

beforeAll(() => {
  leakSample()
}, 120_000)

const tile = (kpis: readonly Kpi[], id: string) => kpis.find((k) => k.id === id)

describe('Forecast > Variance: forecast accuracy (review SA-1)', () => {
  it('shows heads and cost for the whole company in Finance and HR admin, each card ending on its value', () => {
    for (const [mode, showPay] of [
      ['finance', false],
      ['hr-admin', false],
      ['hr-admin', true],
    ] as [Mode, boolean][]) {
      const ctx = sampleCtx(mode, { showPay })
      const acc = forecastAccuracyOf(ctx, 'FY27')
      expect(acc?.versionId, mode).toBe('fy27-q1-reforecast')
      expect(
        acc?.months.map((m) => m.month),
        mode,
      ).toEqual(['2026-07', '2026-08', '2026-09'])
      const kpis = forecastModel(ctx).variance.kpis
      const heads = tile(kpis, 'accuracy-heads')
      const cost = tile(kpis, 'accuracy-cost')
      expect(heads?.value, mode).toBeCloseTo(
        1 - Math.abs((acc?.forecastHeads ?? 0) - (acc?.actualHeads ?? 0)) / (acc?.actualHeads ?? 1),
        12,
      )
      expect(cost?.value, mode).toBeCloseTo(acc?.cost as number, 12)
      for (const k of [heads, cost]) {
        expect(k?.note, mode).toBe('FY27 Q1 Reforecast against the actual for Jul to Sep 2026')
        expect(k?.suppressed, mode).toBeUndefined()
        const card = resolveCalc(k?.calc)
        expect(card?.value, mode).toBe(k?.value)
        expect(card?.steps.at(-1)?.result, mode).toBe(k?.value)
      }
      // One engine: the Finance > Versions tile reads the same cost figure.
      if (mode === 'finance')
        expect(financeModel(ctx).versions.kpis.find((k) => k.id === 'finance-forecast-accuracy')?.value).toBe(
          cost?.value,
        )
    }
  })

  it('reads "—" with the reason under a unit filter, and in a scoped mode', () => {
    const filtered = forecastModel(sampleCtx('finance', { filters: { businessUnit: ['Corporate'] } }))
      .variance.kpis
    for (const id of ['accuracy-heads', 'accuracy-cost']) {
      const k = tile(filtered, id)
      expect(k?.value, id).toBeNull()
      expect(k?.suppressedNote, id).toBe(ACCURACY_COMPANY_NOTE)
    }
    // HRBP: the heads figure shows (its unit is a scope, so "—"); the cost figure is Finance's.
    const hrbp = forecastModel(personaCtx('hrbp-se')).variance.kpis
    expect(tile(hrbp, 'accuracy-heads')?.suppressedNote).toBe(ACCURACY_COMPANY_NOTE)
    expect(tile(hrbp, 'accuracy-cost')).toBeUndefined()
  })

  it('shows the heads figure to a Leader acting for the whole company, never the cost one', () => {
    const ctx = personaCtx('leader-cfo')
    expect(ctx.isCompany).toBe(true)
    const kpis = forecastModel(ctx).variance.kpis
    expect(tile(kpis, 'accuracy-heads')?.value).toBeCloseTo(
      forecastAccuracyOf(ctx, 'FY27')?.heads as number,
      12,
    )
    expect(tile(kpis, 'accuracy-cost')).toBeUndefined()
  })
})

describe('one forecast accuracy engine (fix step, loose ends)', () => {
  const SRC = fileURLToPath(new URL('../../../', import.meta.url))
  /** Every non-test source file under src/, as [path from src/, text]. */
  function sources(dir = SRC, out: [string, string][] = []): [string, string][] {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      if (e.isDirectory()) sources(p, out)
      else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name))
        out.push([p.slice(SRC.length).replace(/\\/g, '/'), readFileSync(p, 'utf8')])
    }
    return out
  }

  const read = (p: string) => readFileSync(join(SRC, p), 'utf8')

  it('computes 1 − |forecast − actual| ÷ actual in src/plan/engine, and picks the reforecast in one module', () => {
    const all = sources()
    const defining = (re: RegExp) =>
      all
        .filter(([, t]) => re.test(t))
        .map(([p]) => p)
        .sort()
    expect(defining(/export function accuracyOf\b/)).toEqual(['plan/engine/accuracy.ts'])
    expect(defining(/export function forecastAccuracyOf\b/)).toEqual(['views/finance/engine/accuracy.ts'])
    // Forecast > Variance and Finance > Versions read that module, and no other module does.
    const IMPORT = /import \{[^}]*\bforecastAccuracyOf\b[^}]*\} from '([^']+)'/
    const importing = all
      .filter(([, t]) => IMPORT.test(t))
      .map(([p, t]) => `${p} from ${IMPORT.exec(t)?.[1]}`)
      .sort()
    expect(importing).toEqual([
      'views/finance/engine/versions.ts from ./accuracy',
      'views/forecast/engine/kpis.ts from @/views/finance/engine/accuracy',
    ])
    // The ratio is computed in the plan engine only, and the context reader hands its months there.
    expect(defining(/1 - Math\.abs\(\w+ - \w+\) \/ Math\.abs\(\w+\)/)).toEqual(['plan/engine/accuracy.ts'])
    expect(read('views/finance/engine/accuracy.ts')).toContain("from '@/plan/engine/accuracy'")
  })
})
