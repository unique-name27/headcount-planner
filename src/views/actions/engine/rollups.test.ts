/**
 * Roll-ups for a role's lists (the template app's rollups.test.ts, with HCP's folds): each mode folds
 * the items other people hold into one line per owner group and kind, never drops one, keeps the
 * person's own steps and critical items alone, and a roll-up's marks hold to it. Fixtures here; the
 * sample's per-mode counts are in roles.test.ts.
 */
import { describe, expect, it } from 'vitest'
import { lensOf } from '@/access/items'
import type { Mode } from '@/access/modes'
import type { ActionItem } from '@/views/types'
import type { OpenAction } from './collect'
import { withHandled } from './marks'
import { composeNote } from './note'
import { foldRoleLists, isRollup, listWords, ownersOf, rollupOf, unfold } from './rollups'
import { AS_OF, ctxOf, open } from './testkit'

const ctx = ctxOf()
const lens = (mode: Mode, me: { id: string | null; name: string } | null = null) => ({
  ...lensOf({ mode, actingAs: null }, AS_OF),
  me,
})
const fold = (
  mode: Mode,
  needs: OpenAction[],
  waiting: OpenAction[] = [],
  me = null as Parameters<typeof lens>[1],
) => foldRoleLists({ needs, waiting }, lens(mode, me), ctx)

const of = (id: string, patch: Partial<ActionItem> = {}, extra: Partial<OpenAction> = {}) =>
  open({ id, ...patch }, extra)

/** A request waiting on a manager's step. */
const waiting = (n: number, approver: string, patch: Partial<ActionItem> = {}) =>
  of(
    `requests:waiting:R-${n}`,
    {
      view: 'requests',
      tab: 'approvals',
      ownerId: approver,
      ownerName: `Manager ${approver}`,
      approverId: approver,
      requesterId: `E-REQ${n}`,
      due: `2026-09-${String(10 + n).padStart(2, '0')}`,
      severity: 'warning',
      what: `New role request has waited ${20 - n} days at the Manager step`,
      subject: { kind: 'requests', id: `R-${n}`, label: `Request R-${n}: New role` },
      snoozeOnly: true,
      ...patch,
    },
    { ownerKey: `id:${approver}`, ownerId: approver, ownerName: `Manager ${approver}`, approverId: approver },
  )

describe('one roll-up', () => {
  it('is as pressing as its worst item, due on the earliest, carries exposure, and opens its items', () => {
    const a = of('plan:past-start:A', { severity: 'warning', due: '2026-09-20' })
    const b = of('plan:past-start:B', { severity: 'critical', due: '2026-09-25', exposure: true })
    const r = rollupOf(
      [a, b],
      { key: 'k', what: 'Two openings', subject: 'Openings', kind: 'X', title: 'T' },
      ctx,
    )
    expect(r.id).toBe('rollup:k')
    expect(isRollup(r)).toBe(true)
    expect(r.item.severity).toBe('critical')
    expect(r.item.due).toBe('2026-09-20')
    expect(r.item.exposure).toBe(true)
    expect(r.item.size).toBe(2)
    expect(r.item.snoozeOnly).toBeUndefined()
    expect(r.members).toEqual([a, b])
    const spec = typeof r.item.drill === 'function' ? r.item.drill() : r.item.drill
    expect(spec?.kind).toBe('actionItems')
    expect(spec?.rows.map((x) => (x as { id: string }).id)).toEqual([a.id, b.id])
  })

  it('is Snooze only when every item it holds is an approval', () => {
    const r = rollupOf(
      [waiting(1, 'E2'), waiting(2, 'E3')],
      { key: 'k', what: 'w', subject: 's', kind: 'k', title: 't' },
      ctx,
    )
    expect(r.item.snoozeOnly).toBe(true)
  })

  it('opens again once marked handled when an item joins or leaves it', () => {
    const a = of('plan:past-start:A')
    const b = of('plan:past-start:B')
    const c = of('plan:past-start:C')
    const spec = {
      key: 'k',
      what: 'Openings',
      subject: 'Openings',
      kind: 'Opening past target start',
      title: 'T',
    }
    const two = rollupOf([a, b], spec, ctx)
    const marks = withHandled({}, [two], Date.parse(`${AS_OF}T12:00:00Z`))
    const isOpenNow = (r: OpenAction) => {
      const m = marks[r.markKey]
      return !m || (!!r.item.fingerprint && m.fingerprint !== r.item.fingerprint)
    }
    expect(isOpenNow(rollupOf([a, b], spec, ctx))).toBe(false)
    expect(isOpenNow(rollupOf([a, b, c], spec, ctx))).toBe(true)
    expect(isOpenNow(rollupOf([a], spec, ctx))).toBe(true)
  })

  it('says its owners in a list, or by group past three', () => {
    expect(listWords(['A', 'B', 'C'])).toBe('A, B and C')
    expect(listWords(['A'])).toBe('A')
    const four = [1, 2, 3, 4].map((n) => waiting(n, `E${n}`))
    expect(ownersOf(four)).toBe('4 managers')
    expect(ownersOf(four.slice(0, 2))).toBe('Manager E1 and Manager E2')
  })
})

describe('HRBP', () => {
  const me = { id: 'E9', name: 'Rita Rao' }

  it("folds the unit's waiting requests held by others per owner group, keeping the HRBP's own steps and critical ones alone", () => {
    const others = [waiting(1, 'E2'), waiting(2, 'E3'), waiting(3, 'E2')]
    const mine = waiting(4, 'E9', { ownerName: 'Rita Rao' })
    const late = waiting(5, 'E4', { severity: 'critical' })
    const { needs } = fold('hrbp', [late, ...others, mine], [], me)
    const line = needs.find(isRollup)
    expect(line?.members?.map((a) => a.id)).toEqual(others.map((a) => a.id))
    expect(line?.item.what).toBe('3 requests waiting on a step with 2 managers; the oldest is 19 d overdue')
    expect(line?.ownerName).toBe('Managers')
    expect(line?.ownerKey).toBe('group:manager')
    expect(line?.item.snoozeOnly).toBe(true)
    expect(needs.filter((a) => !isRollup(a)).map((a) => a.id)).toEqual([late.id, mine.id])
    expect(unfold(needs)).toHaveLength(5)
  })

  it('rolls Waiting on others up by owner group and kind', () => {
    const opening = (n: number) =>
      of(`plan:past-start:P-${n}`, { ownerId: `M${n}`, ownerName: `Manager ${n}` }, { ownerKey: `id:M${n}` })
    const { waiting: w } = fold('hrbp', [], [opening(1), opening(2), opening(3)], me)
    expect(w).toHaveLength(1)
    expect(w[0].item.what).toBe(
      '3 openings past target start, each with its own manager; the first is due 30 Sep',
    )
    expect(w[0].item.subject.label).toBe('Managers: openings past target start')
  })
})

describe('Finance', () => {
  it('folds company-wide items held by others from three, its own steps one by one', () => {
    const exc = (n: number) =>
      of(
        `finance:reconcile:X${n}`,
        { view: 'finance', ownerRole: 'hrbp', ownerId: `H${n % 2}`, ownerName: `HRBP ${n % 2}`, due: null },
        { role: 'hrbp', ownerKey: `id:H${n % 2}` },
      )
    const mine = waiting(9, 'F1', { ownerRole: 'finance' })
    const two = fold('finance', [exc(1), exc(2)], [], { id: 'F1', name: 'Fin' })
    expect(two.needs.some(isRollup)).toBe(false)
    const three = fold('finance', [exc(1), exc(2), exc(3), mine], [], { id: 'F1', name: 'Fin' })
    expect(three.needs.map((a) => (isRollup(a) ? 'rollup' : a.id))).toEqual(['rollup', mine.id])
  })
})

describe('Manager and Leader', () => {
  it('fold nothing: their lists are their own items', () => {
    const items = [waiting(1, 'E2'), waiting(2, 'E2'), waiting(3, 'E2')]
    expect(fold('manager', items, [], { id: 'E2', name: 'Sam Lee' }).needs).toEqual(items)
    expect(fold('leader', items, [], { id: 'E2', name: 'Sam Lee' }).needs).toEqual(items)
  })
})

describe('Copy note from a roll-up', () => {
  it("lists each member under the owner's own name and never names the reader past the greeting", () => {
    const note = composeNote(
      { name: 'Manager E2', isTeam: false },
      [waiting(1, 'E2'), waiting(3, 'E2')],
      AS_OF,
    )
    expect(note.startsWith('Hi Manager,')).toBe(true)
    expect(note).toContain('1. Request R-1: New role')
    expect(note).toContain('2. Request R-3: New role')
  })
})
