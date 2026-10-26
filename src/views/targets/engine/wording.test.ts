/**
 * Runtime words on Targets and in Requests' Action items (docs/PLAN.md 14.3 plain counts, R86; M4
 * review CP-11): a gap of 0 reads "On target", the Asks formula counts heads from pending requests
 * in plain words, and an item's wait reads "13 days", never "13 d", since it is pasted into notes.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { listsInForce } from '@/access/lists'
import { actingAsOptions } from '@/access/scopes'
import type { Sample } from '@/data/sample'
import { pluralSlips } from '@/testkit/counts'
import { MemoryStorage } from '@/testkit/memoryStorage'
import { ctxAs, leakSample, personaCtx, sampleCtx, sampleSources } from '@/testkit/sample'
import { requestsActions } from '@/views/requests/engine/actions'
import { gapWords } from './gap'
import { targetsModel } from './index'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
vi.stubGlobal('localStorage', new MemoryStorage())

let s: Sample
beforeAll(() => {
  s = leakSample()
}, 120_000)

describe('Targets and Requests words (review CP-11)', () => {
  it('reads a gap of 0 as "On target"', () => {
    expect(gapWords(0)).toBe('On target')
    expect(gapWords(3)).toBe('3 under')
    expect(gapWords(-18)).toBe('18 over')
    expect(s.plan.baselineId).toBeTruthy()
    const m = targetsModel(sampleCtx('finance'))
    const zero = m.gap.rows.rows.filter((r) => r.gapHeads === 0)
    for (const r of zero) expect(r.gapText, r.org).toBe('On target')
    for (const r of m.gap.rows.rows) expect(r.gapText, r.org).not.toBe('0 under')
  })

  it('writes the Asks formula as heads from pending requests', () => {
    const asks = targetsModel(sampleCtx('finance')).gap.kpis.find((k) => k.id === 'targets-asks')
    expect(asks?.formula).toMatch(/^[\d,]+ Working seats \+ [\d,]+ heads? from pending requests\.$/)
    expect(asks?.formula).not.toContain('head effect of')
  })

  it('writes an item’s wait in days, never "d"', () => {
    const items = requestsActions(personaCtx('finance-fpa'))
    const waited = items.filter((i) => / has waited /.test(i.what))
    expect(waited.length).toBeGreaterThan(0)
    for (const i of waited) expect(i.what).toMatch(/ has waited [\d,]+ days? at the /)
    for (const i of items) expect(i.what).not.toMatch(/\d d\b/)
  })
})

describe('Tree × cost center: counts and the fold clause (reviews EX-6, SA-12)', () => {
  it('writes no 0 for a count it does not compute, and leaves the column out where no row has one', () => {
    for (const key of ['hrbp-se', 'leader-svp-se'] as const) {
      const f = targetsModel(personaCtx(key)).tree.costCenters
      expect(f.rows.length, key).toBeGreaterThan(0)
      for (const r of f.rows) expect(r.costed, `${key} ${r.costCenter}`).toBeNull()
      expect(
        f.columns.map((c) => c.key),
        key,
      ).not.toContain('costed')
    }
    const fin = targetsModel(sampleCtx('finance')).tree.costCenters
    expect(fin.columns.map((c) => c.key)).toContain('costed')
    const aus = fin.rows.find((r) => r.costCenter === '1110-AUS')
    expect(aus?.costed).toBeGreaterThan(0)
  })

  it('says cost centers fold only where they do: never with Show pay amounts on', () => {
    const off = targetsModel(sampleCtx('hr-admin')).tree.costCenters
    const on = targetsModel(sampleCtx('hr-admin', { showPay: true })).tree.costCenters
    expect(off.subtitle).toBe("FY27 Working loaded cost; cost centers under 5 fold into their unit's Other")
    expect(on.subtitle).toBe(
      'FY27 Working loaded cost; with pay amounts shown, every cost center shows on its own',
    )
    // With the switch on nothing folds, as the subtitle says.
    expect(on.rows.some((r) => r.isOther)).toBe(false)
    expect(on.rows.some((r) => r.costCenter === '1520-RDU')).toBe(true)
    expect(off.rows.some((r) => r.isOther)).toBe(true)
  })
})

describe('the Asks formula counts in plain words for every HRBP pick (fix step, loose ends)', () => {
  it('reads "1 head" for one, and subtracts pending requests that remove heads', () => {
    const ctx = sampleCtx('hrbp')
    const options = actingAsOptions('hrbp', {
      positionIndex: ctx.positionIndex,
      asOf: ctx.asOf,
      all: ctx.all,
      lists: listsInForce(null, ctx.all, sampleSources(ctx.all)),
      personas: s.personas,
    })
    expect(options.length).toBeGreaterThan(3)
    const formulas = options.map((o) => {
      const pick = o.pick as { personId: string; unit?: string }
      const m = targetsModel(ctxAs('hrbp', pick.personId, { ...(pick.unit ? { unit: pick.unit } : {}) }))
      return m.gap.kpis.find((k) => k.id === 'targets-asks')?.formula ?? ''
    })
    for (const f of formulas) {
      expect(f).toMatch(/^[\d,]+ Working seats? [+−] [\d,]+ heads? from pending requests\.$/)
      expect(pluralSlips(f), f).toEqual([])
      expect(f).not.toMatch(/[+−] -/)
    }
    // Non-vacuous: one unit's pending requests remove a head ("− 1 head"), as the crawl found.
    expect(formulas.some((f) => / − 1 head from /.test(f))).toBe(true)
  })
})
