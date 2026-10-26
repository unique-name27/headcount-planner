/**
 * One item per matter (the template app's dedupe.test.ts; docs/PLAN.md 9.6: "requests:waiting
 * replaces that request's requests:approve item, so the request is not listed twice"): items about the
 * same matter fold into one, which keeps the most pressing rating and the earliest due date; the
 * owning view's survives a fold across views. On the sample, no two listed items share a matter and no
 * request is listed twice, in any mode, HR admin's full list included.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { itemRecordOf } from '@/access/items'
import { collectUncached, foldMatters } from './collect'
import { everyMode } from './roleKit'
import { ctxOf, item, source } from './testkit'

describe('items about the same matter', () => {
  const approve = item({
    id: 'requests:approve:R-7',
    view: 'requests',
    tab: 'approvals',
    severity: 'info',
    due: '2026-10-02',
    matter: 'request:R-7',
    snoozeOnly: true,
  })
  const waiting = item({
    id: 'requests:waiting:R-7',
    view: 'requests',
    tab: 'approvals',
    severity: 'warning',
    due: null,
    matter: 'request:R-7',
    snoozeOnly: true,
  })
  const other = item({ id: 'plan:past-start:P-9' })

  it('keeps the most pressing, with the earliest due date when it has none', () => {
    const f = foldMatters([approve, waiting, other])
    expect(f.folded).toBe(1)
    expect(f.items.map((i) => i.id)).toEqual(['requests:waiting:R-7', 'plan:past-start:P-9'])
    expect(f.items[0]).toMatchObject({ severity: 'warning', due: '2026-10-02' })
    expect([...f.also.values()].flat().map((i) => i.id)).toEqual(['requests:approve:R-7'])
  })

  it('lists the survivor once, in either order, and says nothing of another view when there is none', () => {
    for (const items of [
      [approve, waiting],
      [waiting, approve],
    ]) {
      const c = collectUncached(ctxOf(), [source('requests', 'Requests', items)])
      expect(c.items.map((a) => a.id)).toEqual(['requests:waiting:R-7'])
      expect(c.folded).toBe(1)
      expect(c.items[0].alsoFrom).toEqual([])
    }
  })

  it('across views, keeps the owning view’s item and says where else it was raised', () => {
    const elsewhere = item({ id: 'plan:x:R-7', view: 'plan', severity: 'critical', matter: 'request:R-7' })
    const c = collectUncached(ctxOf(), [
      source('plan', 'Plan', [elsewhere]),
      source('requests', 'Requests', [approve]),
    ])
    expect(c.items.map((a) => a.id)).toEqual(['requests:approve:R-7'])
    expect(c.items[0].alsoFrom).toEqual(['Plan · Openings'])
    // The survivor carries the worst rating of the matter (before the one rubric rates it).
    expect(foldMatters([elsewhere, approve]).items).toMatchObject([
      { id: 'requests:approve:R-7', severity: 'critical' },
    ])
  })
})

describe('on the sample, in every mode', () => {
  let modes: ReturnType<typeof everyMode>
  beforeAll(() => {
    modes = everyMode()
  }, 300_000)

  it('no two listed items share a matter, and no request is listed twice', () => {
    for (const { mode, collected } of modes) {
      const matters = collected.items.map((a) => a.item.matter).filter(Boolean)
      expect(new Set(matters).size, mode).toBe(matters.length)
      const approvals = collected.items
        .filter((a) => a.id.startsWith('requests:approve:') || a.id.startsWith('requests:waiting:'))
        .map((a) => itemRecordOf(a.id))
      expect(new Set(approvals).size, mode).toBe(approvals.length)
    }
  })
})
