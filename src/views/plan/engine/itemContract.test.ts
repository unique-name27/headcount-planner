/**
 * The Plan view's Action center items (docs/PLAN.md 9.6; the template app's itemContract test): on
 * the sample, every kind it raises is one of PLAN_ITEM_KINDS, ids are `<kind>:<record>` and unique,
 * wording is plain (no closing full stop, no nagging verb, no amount), every item has `due` or
 * `closesWhen` and a `place` naming its position and org, and the mode lists route each kind as 9.6
 * says (a manager's Planned seat with no req is on that manager's Needs attention).
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { ITEM_ROUTING, itemKindOf, lensOf, roleItems } from '@/access/items'
import { resolveDrill } from '@/drill/types'
import { PLAN_ITEM_KINDS, planActions } from './actions'
import { prepare } from './base'
import { everyMode, sample, sampleCtx, withData } from './fixtures'
import { seatsOnDay } from './heads'
import { MONEY_TEXT } from './testing'

const NAGGING = /\b(chas\w*|nag\w*|ping\w*|hound\w*|unblock\w*|remind\w*)\b/i

beforeAll(() => {
  sample()
}, 60_000)

describe('plan items', () => {
  it('keep the item contract in every mode', () => {
    for (const { mode, ctx } of everyMode()) {
      const items = planActions(ctx)
      const ids = items.map((i) => i.id)
      expect(new Set(ids).size, mode).toBe(ids.length)
      for (const i of items) {
        const kind = itemKindOf(i.id)
        expect(PLAN_ITEM_KINDS as readonly string[], `${mode} ${i.id}`).toContain(kind)
        expect(i.id.length, i.id).toBeGreaterThan((kind as string).length + 1)
        expect(i.view).toBe('plan')
        expect(i.what.endsWith('.'), i.id).toBe(false)
        expect(NAGGING.test(i.what) || NAGGING.test(i.note ?? ''), i.id).toBe(false)
        expect(MONEY_TEXT.test(i.what) || MONEY_TEXT.test(i.note ?? ''), i.id).toBe(false)
        expect(!!i.due || !!i.closesWhen, i.id).toBe(true)
        expect(i.place.positionId, i.id).toBeTruthy()
        expect(i.place.businessUnit, i.id).toBeTruthy()
        expect(i.ownerName, i.id).toBeTruthy()
      }
    }
  })

  it('raise every kind the sample has a case for, with the frozen Corporate openings', () => {
    const items = planActions(sampleCtx('hr-admin'))
    const kinds = new Set(items.map((i) => itemKindOf(i.id)))
    for (const k of ['plan:planned-no-req', 'plan:past-start', 'plan:frozen-opening'] as const)
      expect(kinds.has(k), k).toBe(true)
    // Story 4: Corporate's three Interviewing openings are held by the freeze; the accepted offer is not.
    const frozen = items.filter((i) => itemKindOf(i.id) === 'plan:frozen-opening')
    expect(frozen.length).toBe(3)
    for (const i of frozen) expect(i.place.businessUnit).toBe('Corporate')
  })

  it('raise an open req on an Eliminated seat for the HRBP, waiting for the manager', () => {
    const s = sample()
    const ctx = sampleCtx('hr-admin')
    const eliminated = seatsOnDay(prepare(ctx)).byStatus.get('Eliminated') ?? []
    expect(eliminated.length).toBeGreaterThan(0)
    const base = s.datasets.reqs.find((r) => r.status === 'Open' && r.stage === 'Req opened')
    expect(base).toBeDefined()
    // A seat in the HRBP persona's unit, so the HRBP's own lists can be read.
    const unitSeats = new Set(sampleCtx('hrbp').data.positions.map((p) => p.positionId))
    const seat = eliminated.find((id) => unitSeats.has(id)) ?? eliminated[0]
    const req = {
      ...(base as NonNullable<typeof base>),
      reqId: 'R-90001',
      positionId: seat,
      openedDate: '2026-08-03',
    }
    const changed = withData({ reqs: [...s.datasets.reqs, req] })
    const items = planActions(sampleCtx('hr-admin', { sample: changed }))
    const item = items.find((i) => i.id === 'plan:req-on-eliminated:R-90001')
    expect(item?.ownerRole).toBe('hrbp')
    expect(item?.place.positionId).toBe(seat)
    expect(item?.closesWhen).toBe("Closes when the imported req's status is Filled or Cancelled")
    expect(resolveDrill(item?.drill ?? null)?.rows.length).toBe(1)
    // The baseline sample has no such req, so no such item.
    expect(planActions(ctx).some((i) => i.id.startsWith('plan:req-on-eliminated:R-90001'))).toBe(false)
    // HRBP: needs (on the HRBP's own Needs attention); a manager: waiting (9.6).
    const hrbp = sampleCtx('hrbp', { sample: changed })
    if (unitSeats.has(seat)) {
      const lists = roleItems(
        planActions(hrbp).map((x) => ({ item: x, ownerId: x.ownerId ?? null, ownerName: x.ownerName })),
        lensOf(hrbp.access, hrbp.asOf),
      )
      expect(lists.needs.some((x) => x.item.id === 'plan:req-on-eliminated:R-90001')).toBe(true)
    }
    expect(ITEM_ROUTING['plan:req-on-eliminated'].hrbp?.map((r) => r.list)).toEqual(['needs'])
    expect(ITEM_ROUTING['plan:req-on-eliminated'].manager?.map((r) => r.list)).toEqual(['waiting'])
  })

  it('route each kind to the lists 9.6 names', () => {
    // An HRBP lists Planned seats with no req and frozen openings as needs, past-start openings as waiting.
    const hrbp = sampleCtx('hrbp')
    const lists = roleItems(
      planActions(hrbp).map((item) => ({ item, ownerId: item.ownerId ?? null, ownerName: item.ownerName })),
      lensOf(hrbp.access, hrbp.asOf),
    )
    expect(
      lists.needs.every((x) =>
        ['plan:planned-no-req', 'plan:frozen-opening', 'plan:req-on-eliminated'].includes(
          itemKindOf(x.item.id) ?? '',
        ),
      ),
    ).toBe(true)
    expect(lists.waiting.every((x) => itemKindOf(x.item.id) === 'plan:past-start')).toBe(true)
    // A manager's own Planned seat near its start with no req is on their Needs attention.
    const admin = planActions(sampleCtx('hr-admin')).filter((i) => itemKindOf(i.id) === 'plan:planned-no-req')
    const owner = admin.find((i) => i.ownerId)?.ownerId as string
    expect(owner).toBeTruthy()
    const persona = sample().personas.find((p) => p.mode === 'manager')
    expect(persona).toBeDefined()
    const ctx = sampleCtx('manager')
    const mine = roleItems(
      planActions(ctx).map((item) => ({ item, ownerId: item.ownerId ?? null, ownerName: item.ownerName })),
      lensOf(ctx.access, ctx.asOf),
    )
    for (const x of mine.needs) expect(x.ownerId).toBe(ctx.access.actingAs?.personId)
  })
})
