/**
 * The position card after the M3 review (docs/PLAN.md 9.4, 9.5, 8.4; review SP-19, CONTRACTS-M3
 * 7.4.3): the seat's "Changed by your HRBP" notes as Plan > Positions and My team show them, with
 * their reasons, through the viewer's rules; and the requests that touch the seat in their effective
 * state (an idle Sent back request reads Expired, D-EXPIRY).
 */
import { describe, expect, it } from 'vitest'
import { actionEnvOf } from '@/app/write/context'
import { deciderOf, scenario, type Who } from '@/app/write/scenario.testkit'
import type { HcRequest } from '@/plan/types'
import { personaOf, sampleCtx } from '@/testkit/sample'
import { changedByHrbp } from '@/views/plan/engine/edits'
import { positionCardModel } from './position'
import { requestsOf } from './seats'

describe('Changed by your HRBP on the position card (SP-19)', () => {
  it('the manager reads the HRBP’s start move with its reason, as Plan > Positions does', async () => {
    const sc = scenario()
    const a = personaOf(sc.sample, 'manager-a')
    const hr: Who = { mode: 'hrbp', personId: 'E11076', unit: 'Go-to-Market' }
    const hctx = await sc.ctx(hr)
    const env = actionEnvOf(hctx)
    const seat = [
      ...new Set(
        hctx.all.positions.filter((r) => r.managerPositionId === a.positionId).map((r) => r.positionId),
      ),
    ]
      .map((id) => env.seat(id))
      .find((x) => x && (x.status === 'Open' || x.status === 'Planned') && !x.acceptedOffer && x.startDate)
    expect(seat).toBeTruthy()
    const id = seat?.positionId as string
    const before = positionCardModel(await sc.ctx({ mode: 'manager', personId: a.employeeId }), id)
    expect(before.hrbpChanges).toEqual([])
    const out = await sc.run(hr, 'editSeat', {
      positionId: id,
      changes: { startDate: '2027-03-01' },
      reason: 'Hiring plan moved.',
    })
    expect(out.outcome.ok, out.outcome.ok ? '' : out.outcome.refused).toBe(true)
    const mctx = await sc.ctx({ mode: 'manager', personId: a.employeeId })
    const notes = changedByHrbp(mctx, id)
    expect(notes.length).toBe(1)
    const card = positionCardModel(mctx, id)
    expect(card.hrbpChanges).toEqual([{ text: notes[0]?.text, reason: 'Hiring plan moved.' }])
    expect(card.hrbpChanges[0]?.text).toMatch(/^Changed by your HRBP: start moved from /)
    // Outside Manager mode the note names the HRBP, not "your".
    expect(positionCardModel(await sc.ctx(hr), id).hrbpChanges[0]?.text).toMatch(/^Changed by the HRBP: /)
  }, 300_000)
})

describe('the requests on the card read their effective state (D-EXPIRY)', () => {
  it('a request sent back and idle past the idle days reads Expired on its seat’s card', async () => {
    const sc = scenario()
    const admin = sampleCtx('hr-admin', { sample: sc.sample })
    const req = requestsOf(admin).find(
      (r) =>
        !!r.positionId &&
        r.type !== 'Transfer' &&
        (r.state === 'Submitted' || r.state === 'In review') &&
        !r.cycleId &&
        r.steps.some((x) => x.enteredAt && !x.decision),
    ) as HcRequest
    expect(req).toBeTruthy()
    const back = await sc.run(deciderOf(sc.sample, req), 'sendBack', {
      requestId: req.requestId,
      reason: 'Say which product line this covers',
    })
    expect(back.outcome.ok, back.outcome.ok ? '' : back.outcome.refused).toBe(true)
    const adm: Who = { mode: 'hr-admin', personId: personaOf(sc.sample, 'hr-admin').employeeId }
    const now = positionCardModel(await sc.ctx(adm), req.positionId as string)
    expect(now.requests.find((r) => r.requestId === req.requestId)?.state).toBe('Sent back')
    const later = positionCardModel(await sc.ctx({ ...adm, asOf: '2026-12-15' }), req.positionId as string)
    expect(later.requests.find((r) => r.requestId === req.requestId)?.state).toBe('Expired')
  }, 300_000)
})
