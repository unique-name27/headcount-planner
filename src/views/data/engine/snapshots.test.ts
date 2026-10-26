/**
 * The figures a Shareable file carries are the figures the leak crawl reads (docs/PLAN.md 5.5, 16.1):
 * for every mode's persona, `figureSnapshots` gives exactly the crawl's figure snapshots (the same
 * ids, words, kept columns and cells, src/testkit/crawl.ts `Crawl.figures`), so every privacy, leak
 * and attack test that reads the crawl's figures covers what the app's own file writer saves. What if
 * is not in a Shareable file (its levers live in the session only), so the comparison leaves it out;
 * the leak crawl reads What if with a lever of every kind, and the app's files themselves.
 */
import { describe, expect, it, vi } from 'vitest'
import { Crawl } from '@/testkit/crawl'
import { MemoryStorage } from '@/testkit/memoryStorage'
import { personaCtx, sampleCtx } from '@/testkit/sample'
import { figureSnapshots } from './snapshots'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
vi.stubGlobal('localStorage', new MemoryStorage())

/** What both readings hold: the crawl's snapshot shape. */
const comparable = (
  figures: Record<string, { columns: { key: string; label: string; money: boolean; band: boolean }[] }>,
) =>
  Object.fromEntries(
    Object.entries(figures)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([id, f]) => [
        id,
        {
          ...f,
          columns: f.columns.map((c) => ({ key: c.key, label: c.label, money: c.money, band: c.band })),
        },
      ]),
  )

describe('a Shareable file’s figures', () => {
  it('are the leak crawl’s figures, in every mode', () => {
    for (const ctx of [
      personaCtx('manager-a'),
      personaCtx('manager-c'),
      personaCtx('hrbp-se'),
      personaCtx('leader-svp-se'),
      personaCtx('leader-cfo'),
      personaCtx('finance-fpa'),
      sampleCtx('hr-admin'),
      sampleCtx('hr-admin', { showPay: true }),
    ]) {
      // What if aside: the crawl reads it with levers set, and a Shareable file carries none of it.
      const crawl = new Crawl(ctx, {
        drills: false,
        cards: false,
        text: false,
        files: false,
        writes: false,
        views: ['home', 'team', 'plan', 'requests', 'forecast', 'targets', 'finance'],
      })
      crawl.views()
      const ours = figureSnapshots(ctx)
      const theirs = Object.fromEntries(crawl.figures)
      expect(Object.keys(ours).length, ctx.scopeLabel).toBeGreaterThan(3)
      expect(JSON.stringify(comparable(ours)), `${ctx.access.mode} ${ctx.scopeLabel}`).toBe(
        JSON.stringify(comparable(theirs)),
      )
    }
  }, 300_000)
})
