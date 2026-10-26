/**
 * The Forecast model's caches change no number: contexts asked one after another in one module (the
 * loaded data's members, guarded sides, bridge seats and stage prices shared between them, ./members.ts
 * and ./bridge.ts) give, byte for byte, the model a fresh module computes for each context alone.
 * The order mixes modes that share the guard's mode (Finance and HR admin), comparisons, a filter and
 * a scoped mode, so a key that missed one of the figure's inputs would hand one context another's.
 */
import { describe, expect, it, vi } from 'vitest'
import type { CtxOptions } from './fixtures'

type Ask = { mode: 'finance' | 'hr-admin' | 'hrbp' | 'leader'; opts?: CtxOptions }

const ASKS: Ask[] = [
  { mode: 'finance' },
  { mode: 'hr-admin' },
  { mode: 'finance', opts: { filters: { businessUnit: ['Operations'] } } },
  { mode: 'hrbp' },
  { mode: 'finance', opts: { compare: 'fy27-q1-reforecast' } },
  { mode: 'leader' },
  { mode: 'finance' },
]

/** The model as data (calculation cards and drills are functions and drop out). */
const text = (m: unknown): string => JSON.stringify(m)

async function freshModule() {
  vi.resetModules()
  const engine = await import('.')
  const fixtures = await import('./fixtures')
  return { forecastModel: engine.forecastModel, sampleCtx: fixtures.sampleCtx }
}

describe('the Forecast model’s caches', () => {
  it('give each context, asked after others, the model a fresh module gives it alone', async () => {
    const shared = await freshModule()
    const inTurn = ASKS.map((a) => text(shared.forecastModel(shared.sampleCtx(a.mode, a.opts))))
    for (const [i, a] of ASKS.entries()) {
      const alone = await freshModule()
      expect(inTurn[i], `${a.mode} ${JSON.stringify(a.opts ?? {})}`).toBe(
        text(alone.forecastModel(alone.sampleCtx(a.mode, a.opts))),
      )
    }
  }, 180_000)
})
