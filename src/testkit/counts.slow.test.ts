/**
 * Plain counts over the crawl (docs/PLAN.md 14.3 plain counts; R86: "1 head", "−1 head"; M4 review
 * CP-5, the verifier's "singular-count crawl scan"): no text any mode reaches, exports included, holds
 * a count of 1 with a plural noun (./counts.ts `pluralSlips`). Read for the sample's personas in full
 * (HR admin with and without Show pay amounts, Finance, the CFO, an SVP, an HRBP and the three sample
 * managers) and for every Acting as pick of Manager, HRBP and Leader mode (lighter: five position
 * cards each, no help, records lists as digests), since a count of 1 turns up in small teams and
 * units. Non-vacuous: every crawl reads singular counts ("1 seat", "1 head"), and What if's trade
 * note reads "get 1 seat" for a trade of one seat.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { listsInForce } from '@/access/lists'
import { actingAsOptions } from '@/access/scopes'
import type { AnalyticsContext } from '@/data/context'
import type { Sample } from '@/data/sample'
import type { Mode } from '@/data/schema'
import { countHits, singularCounts } from './counts'
import { type CrawlOptions, crawl } from './crawl'
import { holding } from './leaks'
import { MemoryStorage } from './memoryStorage'
import { ctxAs, leakSample, personaCtx, pinClock, sampleCtx, sampleSources, unpinClock } from './sample'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
vi.stubGlobal('localStorage', new MemoryStorage())

let s: Sample

beforeAll(() => {
  pinClock()
  s = leakSample()
}, 120_000)

afterAll(() => unpinClock())

const slipsOf = (c: ReturnType<typeof crawl>, n = 8): string[] =>
  countHits(c.seen)
    .slice(0, n)
    .map((h) => `${h.slip} at ${h.where.slice(0, 140)}: ${h.text}`)

describe('no count of 1 reads with a plural noun (14.3, R86; review CP-5)', () => {
  it('holds none for the sample’s personas, every export included', () => {
    const cases: [string, () => AnalyticsContext][] = [
      ['hr-admin', () => sampleCtx('hr-admin')],
      ['hr-admin, pay shown', () => sampleCtx('hr-admin', { showPay: true })],
      ['finance', () => sampleCtx('finance')],
      ['leader-cfo', () => personaCtx('leader-cfo')],
      ['leader-svp-se', () => personaCtx('leader-svp-se')],
      ['hrbp-se', () => personaCtx('hrbp-se')],
      ['manager-a', () => personaCtx('manager-a')],
      ['manager-b', () => personaCtx('manager-b')],
      ['manager-c', () => personaCtx('manager-c')],
    ]
    for (const [key, ctxOf] of cases) {
      const c = crawl(ctxOf(), { recordExports: 'text' })
      expect(c.errors, key).toEqual([])
      expect(slipsOf(c), key).toEqual([])
      // Non-vacuity: the crawl read the mode's surfaces, and counts of 1 among them.
      expect(c.seen.length, key).toBeGreaterThan(3000)
      expect(singularCounts(c.seen), key).toBeGreaterThan(5)
      // What if's trade lever of one seat (src/views/whatif/engine/cards.ts `tradeRateNote`).
      if (c.ctx.access.can('view:whatif'))
        expect(holding(c.seen, 'get 1 seat,').length, key).toBeGreaterThan(0)
    }
  }, 900_000)

  it('holds none for any Acting as pick of Manager, HRBP or Leader mode', () => {
    const opts: CrawlOptions = { recordExports: 'digest', cards: 5, help: false }
    let picks = 0
    let singular = 0
    for (const mode of ['manager', 'hrbp', 'leader'] as const satisfies readonly Mode[]) {
      const ctx = sampleCtx(mode)
      const options = actingAsOptions(mode, {
        positionIndex: ctx.positionIndex,
        asOf: ctx.asOf,
        all: ctx.all,
        lists: listsInForce(null, ctx.all, sampleSources(ctx.all)),
        personas: s.personas,
      })
      expect(options.length, mode).toBeGreaterThan(3)
      for (const o of options) {
        const pick = o.pick as { personId: string; unit?: string }
        const c = crawl(
          ctxAs(mode, pick.personId, { sample: s, ...(pick.unit ? { unit: pick.unit } : {}) }),
          opts,
        )
        expect(slipsOf(c), `${mode} ${pick.personId}`).toEqual([])
        singular += singularCounts(c.seen)
        picks++
      }
    }
    // Non-vacuity: every manager, unit and leader was read, and counts of 1 turned up across them.
    expect(picks).toBeGreaterThan(300)
    expect(singular).toBeGreaterThan(1000)
  }, 1_800_000)
})
