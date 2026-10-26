/**
 * The write models of Plan > Positions, Plan > Transfers and My team, per mode (docs/PLAN.md 8.3
 * `position.edit`, `transfer.process`, `transfer.move-budget`, 8.4, 9.4, 10.1, 10.5, C23): what each
 * mode is offered, what Manager, Leader and Finance never get (no edit form, no transfer form, the
 * policy's own reason instead), what the HRBP gets (only its unit's Open seats with no accepted offer,
 * Planned seats and On hold seats; never a Filled seat or an accepted offer), that the seat list
 * equals what the action itself takes (every seat in scope, the action run dry on each), and that no
 * model of them holds an amount.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import type { Mode } from '@/access/modes'
import type { AnalyticsContext } from '@/data/context'
import { seatStateOf } from '@/drill/seats'
import { ACCEPTED_OFFER_TEXT, SEAT_NOT_EDITABLE_TEXT, WORKING_ONLY_TEXT } from '@/plan/actions'
import type { Seen } from '@/testkit/crawl'
import { amountHits } from '@/testkit/leaks'
import {
  requestIdIn,
  seatChangesOf,
  seatEditInputOf,
  seatEditOf,
  seatEditsOf,
  transferInputOf,
  transferOptions,
} from './edits'
import { sample, sampleCtx } from './fixtures'

const MODES: readonly Mode[] = ['manager', 'hrbp', 'leader', 'finance', 'hr-admin']
let ctxs: Record<Mode, AnalyticsContext>

beforeAll(() => {
  sample()
  ctxs = Object.fromEntries(MODES.map((m) => [m, sampleCtx(m)])) as Record<Mode, AnalyticsContext>
}, 120_000)

/** Every value a model holds, as the leak scanner reads a crawl. */
function seenOf(v: unknown, where: string, out: Seen[] = []): Seen[] {
  if (typeof v === 'function' || v === undefined || v === null) return out
  if (typeof v !== 'object') {
    out.push({ where, value: v as Seen['value'], tag: { in: where } })
    return out
  }
  if (Array.isArray(v))
    v.forEach((x, i) => {
      seenOf(x, `${where}[${i}]`, out)
    })
  else for (const [k, x] of Object.entries(v)) seenOf(x, `${where}.${k}`, out)
  return out
}

const how = (ctx: AnalyticsContext, id: string) => ctx.access.decide(`action:${id}`).how

describe('who is offered Working edits (position.edit)', () => {
  it('Manager, Leader and Finance get no edit form and no seat, only the policy’s reason', () => {
    for (const mode of ['manager', 'leader', 'finance'] as const) {
      const ctx = ctxs[mode]
      const e = seatEditsOf(ctx)
      expect(e, mode).toEqual({ offered: false, why: how(ctx, 'position.edit'), seats: [], others: [] })
      expect(e.why, mode).toBe('Seat changes go through requests or the HRBP.')
      // Not even one seat's form: the policy's reason comes first, before any seat rule.
      const any = ctx.data.positions[0]?.positionId as string
      const f = seatEditOf(ctx, any)
      expect(f.editable, mode).toBe(false)
      expect(f.why, mode).toBe(how(ctx, 'position.edit'))
    }
  })

  it('the HRBP gets only its unit’s Open (no accepted offer), Planned and On hold seats', () => {
    const ctx = ctxs.hrbp
    const unit = ctx.access.actingAs?.unit
    expect(unit).toBe('Silicon Engineering')
    const e = seatEditsOf(ctx)
    expect(e.offered).toBe(true)
    expect(e.why).toBeNull()
    expect(e.seats.length).toBeGreaterThan(10)
    for (const s of e.seats) {
      const st = seatStateOf(ctx, s.positionId)
      expect(st?.position.businessUnit, s.positionId).toBe(unit)
      expect(['Open', 'Planned', 'On hold'], s.positionId).toContain(s.status)
      expect(st?.acceptedOffer ?? null, s.positionId).toBeNull()
    }
  })

  it('offers the edit exactly where the action takes it, on every seat in scope (HRBP, HR admin)', () => {
    for (const mode of ['hrbp', 'hr-admin'] as const) {
      const ctx = ctxs[mode]
      const listed = new Set(seatEditsOf(ctx).seats.map((s) => s.positionId))
      const ids = [...new Set(ctx.data.positions.map((r) => r.positionId))]
      // Every opening, and in HR admin a spread of the other seats (the dry run is the action itself).
      const check = mode === 'hrbp' ? ids : ids.filter((id, i) => listed.has(id) || i % 7 === 0)
      let editable = 0
      for (const id of check) {
        const f = seatEditOf(ctx, id)
        expect(f.editable, `${mode} ${id}: ${f.why}`).toBe(listed.has(id))
        if (f.editable) editable++
        else expect(f.why, `${mode} ${id}`).toBeTruthy()
      }
      expect(editable, mode).toBe(listed.size)
    }
  })

  it('refuses an accepted offer with C23’s words and a Filled seat with the seat rule, and offers an Elimination', () => {
    const ctx = ctxs.hrbp
    const ids = [...new Set(ctx.data.positions.map((r) => r.positionId))]
    const accepted = ids.find((id) => seatStateOf(ctx, id)?.acceptedOffer)
    const filled = ids.find((id) => seatStateOf(ctx, id)?.status === 'Filled')
    expect(accepted && filled).toBeTruthy()
    const a = seatEditOf(ctx, accepted as string)
    expect(a).toMatchObject({ editable: false, why: ACCEPTED_OFFER_TEXT, acceptedOffer: true })
    expect(a.eliminate.offered).toBe(true)
    const f = seatEditOf(ctx, filled as string)
    expect(f).toMatchObject({ editable: false, why: SEAT_NOT_EDITABLE_TEXT })
    const e = seatEditsOf(ctx)
    const listed = new Set(e.seats.map((s) => s.positionId))
    expect(listed.has(accepted as string)).toBe(false)
    expect(listed.has(filled as string)).toBe(false)
    // The form still lists them, apart, to say why and to offer their Elimination.
    const others = new Set(e.others.map((s) => s.positionId))
    expect(others.has(accepted as string)).toBe(true)
    expect(others.has(filled as string)).toBe(true)
    for (const o of e.others) {
      expect(listed.has(o.positionId), o.positionId).toBe(false)
      expect(o.status, o.positionId).not.toBe('Eliminated')
      expect(seatStateOf(ctx, o.positionId)?.position.businessUnit, o.positionId).toBe('Silicon Engineering')
    }
  })

  it('offers no edit while a locked version is shown: edits change Working', () => {
    const ctx = sampleCtx('hrbp', { version: 'fy27-budget' })
    expect(ctx.version?.state).toBe('locked')
    const e = seatEditsOf(ctx)
    expect(e).toMatchObject({ offered: true, why: WORKING_ONLY_TEXT, seats: [], others: [] })
    const id = seatEditsOf(ctxs.hrbp).seats[0]?.positionId as string
    expect(seatEditOf(ctx, id).why).toBe(WORKING_ONLY_TEXT)
  })

  it('starts the form from the seat as the plan reads it, and sends only what changed', () => {
    const ctx = ctxs.hrbp
    const id = seatEditsOf(ctx).seats.find((s) => s.status === 'Open')?.positionId as string
    const f = seatEditOf(ctx, id)
    const st = seatStateOf(ctx, id)
    expect(f.current).toEqual({
      startDate: st?.plannedStart ?? st?.position.startDate ?? null,
      level: st?.position.level,
      location: st?.position.location,
      fte: st?.position.fte,
      onHold: false,
    })
    expect(f.effectiveDate).toBe(ctx.asOf)
    expect(seatChangesOf(f.current, { ...f.current })).toEqual({})
    expect(seatEditInputOf(f, { ...f.current, startDate: '2027-03-01', fte: 0.5 }, 'Later start')).toEqual({
      positionId: id,
      effectiveDate: ctx.asOf,
      changes: { startDate: '2027-03-01', fte: 0.5 },
      reason: 'Later start',
    })
  })
})

describe('who is offered the transfer form (transfer.process)', () => {
  it('Manager, Leader and Finance get no people, seats or managers, only the policy’s reason', () => {
    for (const mode of ['manager', 'leader', 'finance'] as const) {
      const ctx = ctxs[mode]
      const t = transferOptions(ctx)
      expect(t, mode).toMatchObject({ offered: false, why: how(ctx, 'transfer.process'), people: [] })
      expect(t.managers, mode).toEqual([])
      expect(t.openSeats, mode).toEqual([])
    }
    // "Move budget too?" follows its own id: hidden for Manager and Finance, and for the leader too
    // since the M3 review (SP-18: it is set on the HRBP's processing form only).
    expect(transferOptions(ctxs.leader).moveBudget).toBe(false)
    expect(transferOptions(ctxs.manager).moveBudget).toBe(false)
    expect(transferOptions(ctxs.finance).moveBudget).toBe(false)
  })

  it('the HRBP moves people of its unit, into any manager position or Open seat with no accepted offer', () => {
    const ctx = ctxs.hrbp
    const t = transferOptions(ctx)
    expect(t).toMatchObject({ offered: true, why: null, moveBudget: true })
    expect(t.people.length).toBeGreaterThan(100)
    for (const p of t.people) {
      const st = seatStateOf(ctx, p.positionId)
      expect(st?.position.businessUnit, p.positionId).toBe('Silicon Engineering')
      expect(st?.status).toBe('Filled')
      expect(st?.holderIds).toContain(p.personId)
    }
    const units = new Set(t.openSeats.map((s) => seatStateOf(ctx, s.positionId)?.position.businessUnit))
    expect(units.size).toBeGreaterThan(1)
    for (const s of t.openSeats) {
      const st = seatStateOf(ctx, s.positionId)
      expect(st?.status, s.positionId).toBe('Open')
      expect(st?.acceptedOffer ?? null, s.positionId).toBeNull()
    }
    const who = t.people[0]
    const into = t.openSeats[0]
    expect(
      transferInputOf(t, {
        kind: 'internal',
        personId: who.personId,
        toId: into.positionId,
        effectiveDate: t.effectiveDate,
        moveBudget: true,
        reasonCode: 'Restructure',
      }),
    ).toEqual({
      kind: 'internal',
      personId: who.personId,
      fromPositionId: who.positionId,
      toPositionId: into.positionId,
      effectiveDate: '2026-10-01',
      moveBudget: true,
      reasonCode: 'Restructure',
    })
  })
})

describe('no amount in any write model', () => {
  it('in every mode: the seat list, seat forms, transfer choices and the Positions and Transfers additions', () => {
    for (const mode of MODES) {
      const ctx = ctxs[mode]
      const ids = seatEditsOf(ctxs['hr-admin'])
        .seats.slice(0, 15)
        .map((s) => s.positionId)
      const models = {
        edits: seatEditsOf(ctx),
        forms: ids.map((id) => seatEditOf(ctx, id)),
        transfer: transferOptions(ctx),
      }
      expect(
        amountHits(seenOf(models, `${mode} edits`)).map((h) => `${h.where}: ${h.what}: ${h.text}`),
        mode,
      ).toEqual([])
    }
  })

  it('reads a request ID back from a draft’s notice', () => {
    expect(requestIdIn('Draft R-1131 saved.')).toBe('R-1131')
    expect(requestIdIn('Transfer R-1131 saved as a draft.')).toBe('R-1131')
    expect(requestIdIn('Seat P-2369 changed in Working.')).toBeNull()
  })
})
