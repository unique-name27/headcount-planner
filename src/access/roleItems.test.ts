/**
 * Action center items per mode (docs/PLAN.md 9.6 and 16.2; the template app's roleItems.test): the
 * routing snapshot (`access-routing.txt`, kind by mode); every Needs attention entry 9.3 promises for
 * a home routes to `needs` in that mode; `roleItems` splits by who the Acting as person is (any,
 * approver, requester, owner), replaces an approver's `requests:approve` with the same request's
 * `requests:waiting`, and counts the rest; HR admin routes nothing; what a mode lists follows its
 * view, tab, subject kind and item prefix; and the scope test keeps items to the team, org or unit.
 */
import { describe, expect, it } from 'vitest'
import type { ViewKey } from '@/data/schema'
import { HOME_NEEDS } from '@/views/home/engine/figures'
import { TEAM_NEEDS } from '@/views/team/engine/figures'
import { accessFor } from './context'
import { ITEM_KINDS, type ItemKind } from './ids'
import {
  ITEM_ROUTING,
  type ItemFacts,
  itemInScope,
  itemKindOf,
  itemShown,
  itemsShown,
  lensOf,
  type RoleLens,
  type RoutedItem,
  roleItems,
} from './items'
import { MATRIX_MODES, MODE_COLUMN } from './matrix'
import { MODES, type Mode } from './modes'
import { routingText } from './policy/routing'
import type { TreeScope, UnitScope } from './scopes/types'

const ME = { id: 'E1', name: 'Dana Ito' }
const lens = (mode: Mode, me: RoleLens['me'] = ME): RoleLens => ({ mode, me, asOf: '2026-09-30' })

/** An item of a kind about a record, owned by someone. */
function item(
  kind: ItemKind,
  record: string,
  who: Partial<Pick<RoutedItem, 'ownerId' | 'ownerName' | 'requesterId' | 'approverId'>> = {},
  place: ItemFacts['place'] = { positionId: 'P-2', businessUnit: 'Silicon Engineering', department: null },
): RoutedItem {
  const view = kind.slice(0, kind.indexOf(':')) as ViewKey
  return {
    item: { id: `${kind}:${record}`, view, subject: { kind: 'none' }, place },
    ownerId: 'ownerId' in who ? (who.ownerId ?? null) : 'E9',
    ownerName: who.ownerName ?? 'Someone Else',
    requesterId: who.requesterId ?? null,
    approverId: who.approverId ?? null,
  }
}

describe('the routing table', () => {
  it('matches access-routing.txt', async () => {
    const text = routingText(ITEM_ROUTING, MATRIX_MODES, MODE_COLUMN)
    expect(text.split('\n')[0]).toMatch(/^Kind\s+Adm\s+HRBP\s+Lead\s+Fin\s+Mgr$/)
    await expect(text).toMatchFileSnapshot('./__snapshots__/access-routing.txt')
  })

  it('routes every Needs attention entry of 9.3 to needs in its mode', () => {
    const modeOfSlug: Record<keyof typeof HOME_NEEDS, Mode> = {
      unit: 'hrbp',
      rollup: 'leader',
      fin: 'finance',
    }
    const promised: [Mode, readonly ItemKind[]][] = [
      ['manager', TEAM_NEEDS],
      ...(Object.entries(HOME_NEEDS) as [keyof typeof HOME_NEEDS, readonly ItemKind[]][]).map(
        ([slug, kinds]) => [modeOfSlug[slug], kinds] as [Mode, readonly ItemKind[]],
      ),
    ]
    expect(promised.map(([m]) => m).sort()).toEqual(['finance', 'hrbp', 'leader', 'manager'])
    for (const [mode, kinds] of promised) {
      expect(kinds.length, mode).toBeGreaterThan(0)
      for (const k of kinds)
        expect(
          (ITEM_ROUTING[k][mode] ?? []).some((r) => r.list === 'needs'),
          `${mode} ${k}`,
        ).toBe(true)
    }
  })

  it('routes nothing in HR admin, whose home is the Data room', () => {
    for (const k of ITEM_KINDS) expect(ITEM_ROUTING[k]['hr-admin'], k).toBeUndefined()
  })
})

describe('roleItems', () => {
  it('reads who: any, approver, requester and owner', () => {
    const items = [
      item('requests:approve', 'R-1', { approverId: ME.id }),
      item('requests:approve', 'R-2', { approverId: 'E5' }),
      item('requests:sent-back', 'R-3', { requesterId: ME.id }),
      item('requests:sent-back', 'R-4', { requesterId: 'E5' }),
      item('plan:planned-no-req', 'P-7', { ownerId: ME.id }),
      item('plan:planned-no-req', 'P-8', { ownerId: null, ownerName: 'dana ito ' }),
      item('plan:planned-no-req', 'P-9'),
      item('plan:req-on-eliminated', 'P-10'),
      item('finance:cycle-due', 'FY28'),
    ]
    const r = roleItems(items, lens('manager'))
    const ids = (xs: RoutedItem[]) => xs.map((x) => x.item.id)
    expect(ids(r.needs)).toEqual([
      'requests:approve:R-1',
      'requests:sent-back:R-3',
      'plan:planned-no-req:P-7',
      'plan:planned-no-req:P-8',
    ])
    expect(ids(r.waiting)).toEqual(['plan:req-on-eliminated:P-10'])
    expect(r.listed).toEqual(items)
    expect(r.left).toBe(items.length - r.needs.length - r.waiting.length)
    // HRBP: any request in the unit waits on someone; the HRBP's own needs are the unit's.
    const h = roleItems(items, lens('hrbp'))
    expect(ids(h.needs)).toEqual([
      'requests:approve:R-1',
      'requests:sent-back:R-3',
      'plan:planned-no-req:P-7',
      'plan:planned-no-req:P-8',
      'plan:planned-no-req:P-9',
      'plan:req-on-eliminated:P-10',
    ])
  })

  it("replaces the approver's approve item with the same request's waiting item", () => {
    const items = [
      item('requests:approve', 'R-1', { approverId: ME.id }),
      item('requests:waiting', 'R-1', { approverId: ME.id }),
      item('requests:approve', 'R-2', { approverId: ME.id }),
    ]
    for (const mode of ['manager', 'leader', 'finance'] as const) {
      const r = roleItems(items, lens(mode))
      expect(
        r.needs.map((x) => x.item.id),
        mode,
      ).toEqual(['requests:waiting:R-1', 'requests:approve:R-2'])
      expect(r.listed.length, mode).toBe(2)
    }
    // A manager who raised a request waits on it.
    const mine = roleItems(
      [item('requests:waiting', 'R-9', { requesterId: ME.id, approverId: 'E5' })],
      lens('manager'),
    )
    expect(mine.waiting.map((x) => x.item.id)).toEqual(['requests:waiting:R-9'])
  })

  it('lists everything in neither list in HR admin, and nothing as mine without a pick', () => {
    const items = ITEM_KINDS.map((k) =>
      item(k, 'x', { approverId: ME.id, requesterId: ME.id, ownerId: ME.id }),
    )
    const admin = roleItems(items, lens('hr-admin'))
    expect(admin).toEqual({ listed: items, needs: [], waiting: [], left: items.length })
    const nobody = roleItems(items, lens('leader', null))
    expect(nobody.needs.map((x) => itemKindOf(x.item.id))).toEqual([])
    expect(
      lensOf(
        accessFor('leader', null, null, false, { actingAs: { personId: 'E1', name: 'Dana Ito' } }),
        '2026-09-30',
      ),
    ).toEqual(lens('leader'))
    expect(lensOf(accessFor('finance'), '2026-09-30').me).toBeNull()
  })

  it('reads the kind of every id', () => {
    for (const k of ITEM_KINDS) expect(itemKindOf(`${k}:R-1:extra`)).toBe(k)
    expect(itemKindOf('requests:other:R-1')).toBeNull()
    expect(itemKindOf('requests:approve')).toBe('requests:approve')
  })
})

describe('what a mode lists, and the scope', () => {
  it('follows the view, the tab, the subject kind and the item prefix', () => {
    const facts = (
      id: string,
      view: ViewKey,
      tab?: string,
      kind: ItemFacts['subject']['kind'] = 'none',
    ): ItemFacts => ({
      id,
      view,
      ...(tab ? { tab } : {}),
      subject: { kind },
      place: null,
    })
    const manager = accessFor('manager')
    expect(itemShown(manager, facts('requests:approve:R-1', 'requests', 'approvals', 'requests'))).toBe(true)
    expect(itemShown(manager, facts('targets:suborg-over:P-1', 'targets'))).toBe(false)
    expect(itemShown(manager, facts('requests:waiting:R-1', 'requests', 'queue'))).toBe(false)
    expect(itemShown(manager, facts('plan:frozen-opening:P-1', 'plan'))).toBe(false)
    expect(itemShown(manager, facts('plan:planned-no-req:P-1', 'plan', undefined, 'workers'))).toBe(false)
    const finance = accessFor('finance')
    expect(itemShown(finance, facts('requests:sent-back:R-1', 'requests'))).toBe(false)
    expect(itemShown(finance, facts('finance:reconcile:x', 'finance', 'reconcile', 'exceptions'))).toBe(true)
    const all = [facts('requests:approve:R-1', 'requests'), facts('finance:cycle-due:FY28', 'finance')]
    expect(itemsShown(accessFor('hr-admin'), all)).toBe(all)
    expect(itemsShown(manager, all)).toEqual([all[0]])
  })

  it('keeps items to the team, the org or the unit', () => {
    const tree: TreeScope = {
      kind: 'tree',
      rootPersonId: 'E1',
      rootName: 'Dana Ito',
      rootPositionIds: new Set(['P-1']),
      positionIds: new Set(['P-2', 'P-3']),
      personIds: new Set(),
      subOrgs: [],
      size: 2,
      label: "Dana Ito's team",
    }
    const unit: UnitScope = {
      kind: 'unit',
      unit: 'Operations',
      positionIds: new Set(['P-9']),
      personIds: new Set(),
      otherDepartments: new Set(),
      leaderPositionIds: new Set(),
      size: 1,
      label: 'Operations',
    }
    const at = (positionId: string | null, businessUnit: string | null = null): ItemFacts => ({
      id: 'plan:past-start:x',
      view: 'plan',
      subject: { kind: 'none' },
      place: { positionId, businessUnit, department: null },
    })
    expect(itemInScope({ scope: tree }, at('P-2'))).toBe(true)
    expect(itemInScope({ scope: tree }, at('P-1'))).toBe(true)
    expect(itemInScope({ scope: tree }, at('P-7'))).toBe(false)
    expect(itemInScope({ scope: tree }, at(null, 'Operations'))).toBe(false)
    expect(itemInScope({ scope: unit }, at('P-9'))).toBe(true)
    expect(itemInScope({ scope: unit }, at(null, 'Operations'))).toBe(true)
    expect(itemInScope({ scope: unit }, at('P-2', 'Corporate'))).toBe(false)
    expect(itemInScope({ scope: null }, at('P-7'))).toBe(true)
    for (const m of MODES) expect(typeof itemInScope(accessFor(m), at('P-7')), m).toBe('boolean')
  })
})
