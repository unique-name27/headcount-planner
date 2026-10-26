/**
 * The Action center for every role (the template app's roles.test.ts, adapted), on the sample, in
 * every mode:
 *
 *  1. One count: the masthead's number, the page's Needs attention and the homes' split all come from
 *     `roleView` over the same collection (`actionsModel`), and agree; a mark counts in every mode.
 *  2. Mode and scope: every listed item's view, tab, record kind and item kind are shown in the
 *     mode, and every item is inside the scope or the Acting as person's own.
 *  3. Lists: each role mode's Needs attention holds 1 to 15 lines on the sample, roll-ups folding
 *     rather than dropping; every item has a due date or says what closes it; HR admin shows no lists.
 *  The routing snapshot itself is src/access/roleItems.test.ts (`access-routing.txt`).
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { itemInScope, itemShown, roleItems } from '@/access/items'
import { VIEWS } from '@/views/registry'
import { ID } from '../metrics'
import { actionsModel } from '.'
import { everyMode } from './roleKit'
import { countedOf, lensFor, NEEDS_SHOWN, roleView, showsLists } from './roles'
import { isMine, unfold } from './rollups'
import { actionKpis } from './summary'

let modes: ReturnType<typeof everyMode>
beforeAll(() => {
  modes = everyMode()
}, 300_000)

const ids = (xs: readonly { id: string }[]) => xs.map((x) => x.id)

describe('1. one count', () => {
  it('gives the masthead, the page and the homes the same numbers', () => {
    for (const { mode, ctx, lists } of modes) {
      // The masthead counts Needs attention in a role mode, every open item in HR admin.
      expect(lists.count, mode).toBe(lists.lists ? lists.needs.length : lists.open.length)
      const counted = countedOf(lists)
      expect(counted.length, mode).toBe(lists.count)
      const tile = actionKpis(counted, ctx).find((k) => k.metricId === ID.itemsCritical)
      expect(tile?.value, mode).toBe(lists.critical)
      // The page's model and the homes read the same split.
      const m = actionsModel(ctx, VIEWS)
      expect(m.count, mode).toBe(lists.count)
      expect(ids(m.needs), mode).toEqual(ids(lists.needs))
      expect(ids(m.waiting), mode).toEqual(ids(lists.waiting))
      expect(m.left, mode).toBe(lists.left)
      expect(actionsModel(ctx, VIEWS), mode).toBe(m)
    }
  })

  it('counts an item marked in one mode as marked in every mode', () => {
    const admin = modes.find((m) => m.mode === 'hr-admin')!
    const first = admin.lists.open[0]
    expect(first).toBeDefined()
    const marked = new Set([first.markKey])
    const open = (a: { markKey: string }) => !marked.has(a.markKey)
    expect(roleView(admin.collected, admin.ctx, open).count).toBe(admin.lists.count - 1)
    for (const { mode, ctx, collected } of modes) {
      const before = roleView(collected, ctx, () => true).open.length
      const after = roleView(collected, ctx, open).open.length
      expect(before - after, mode).toBe(collected.items.some((a) => a.markKey === first.markKey) ? 1 : 0)
    }
  })
})

describe('2. mode and scope', () => {
  it("lists only items whose view, tab, records and kind the mode shows, inside the mode's scope or the person's own", () => {
    for (const { mode, ctx, collected } of modes) {
      const lens = lensFor(ctx)
      for (const a of collected.items) {
        expect(itemShown(ctx.access, a.item), `${mode} ${a.id}`).toBe(true)
        expect(itemInScope(ctx.access, a.item) || isMine(lens, a), `${mode} ${a.id}`).toBe(true)
      }
    }
  })
})

describe('3. lists', () => {
  it("holds 1 to 15 lines in each role mode's Needs attention", () => {
    for (const { mode, lists } of modes) {
      if (!lists.lists) continue
      expect(lists.needs.length, `${mode}: ${lists.needs.length}`).toBeGreaterThanOrEqual(1)
      expect(lists.needs.length, `${mode}: ${lists.needs.length}`).toBeLessThanOrEqual(NEEDS_SHOWN)
    }
  })

  it('folds rather than drops: every item of a list is in it, alone or inside one roll-up', () => {
    const rank = { critical: 0, warning: 1, info: 2, good: 3 } as const
    for (const { mode, ctx, collected } of modes) {
      const split = roleItems(collected.items, lensFor(ctx))
      const lists = roleView(collected, ctx, () => true)
      for (const [name, before, after] of [
        ['needs', split.needs, lists.needs],
        ['waiting', split.waiting, lists.waiting],
      ] as const) {
        const sorted = (xs: readonly { id: string }[]) => xs.map((x) => x.id).sort()
        expect(sorted(unfold(after)), `${mode} ${name}`).toEqual(sorted(before))
        for (const a of after.filter((x) => x.members)) {
          expect(a.members?.length, `${mode} ${a.id}`).toBeGreaterThanOrEqual(2)
          // A roll-up is as pressing as its most pressing item.
          const worst = Math.min(...(a.members ?? []).map((m) => rank[m.item.severity]))
          expect(rank[a.item.severity], a.id).toBe(worst)
          expect(a.item.what, a.id).not.toMatch(/\.$/)
        }
      }
    }
  })

  it('gives every listed item a due date or a stated reason for none', () => {
    for (const { mode, lists } of modes)
      for (const a of [...lists.needs, ...lists.waiting, ...lists.open])
        expect(!!a.item.due || !!a.item.closesWhen, `${mode} ${a.id}`).toBe(true)
  })

  it('shows the two lists in the role modes only; HR admin routes nothing and counts every open item', () => {
    for (const { mode, ctx, lists } of modes) {
      expect(showsLists(ctx.access), mode).toBe(mode !== 'hr-admin')
      if (mode === 'hr-admin') {
        expect(lists.needs, mode).toEqual([])
        expect(lists.count, mode).toBe(lists.open.length)
      }
    }
  })
})
