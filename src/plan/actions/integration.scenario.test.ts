/**
 * The write path's rules the M3 integration step added (docs/CONTRACTS-M3.md 7.2), walked through the
 * write path as the app runs them: a job title with an amount refused at entry (8.4 rule 5) on a New
 * role, an edit and a trade; an HRBP seat edit with no date written on the seat's first day when the
 * seat starts after the as-of date (never a row before the seat exists); an HRBP transfer out of
 * another unit refused; and Requests > Cycle's open and dates controls, which follow the policy.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { decide } from '@/access/policy'
import { chainOk, scenario, type Who } from '@/app/write/scenario.testkit'
import type { Sample } from '@/data/sample'
import { REASON_CODES_OF } from '@/data/schema'
import { seatStateOf } from '@/drill/seats'
import { MemoryStorage } from '@/testkit/memoryStorage'
import { leakSample, personaOf } from '@/testkit/sample'
import { requestsModel } from '@/views/requests/engine'
import { cycleOpenOf } from '@/views/requests/engine/cycleControls'
import { OUTSIDE_UNIT_TEXT, REMOVE_AMOUNT_TEXT, seatChangedNotice } from './copy'
import { requestIdInText } from './requestIds'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
vi.stubGlobal('localStorage', new MemoryStorage())

let s: Sample
beforeAll(() => {
  s = leakSample()
}, 120_000)

const idOf = (text: string): string => requestIdInText(text) ?? ''
const SE = 'Silicon Engineering'

describe('a job title with an amount (8.4 rule 5 at entry)', () => {
  it('is refused on a New role, on an edit of a draft and on a trade, and nothing is written', async () => {
    const sc = scenario()
    const a = personaOf(s, 'manager-a')
    const mgr: Who = { mode: 'manager', personId: a.employeeId }
    const role = {
      type: 'New role',
      managerPositionId: a.positionId,
      level: 'P3',
      location: 'San Jose',
      fte: 1,
      startDate: '2027-01-04',
      reasonCode: 'Growth',
    } as const
    const bad = await sc.run(mgr, 'createRequest', { ...role, jobTitle: 'Account Executive at $180,000' })
    expect(bad.outcome).toEqual({ ok: false, refused: REMOVE_AMOUNT_TEXT })
    expect(bad.entries).toEqual([])

    const good = await sc.run(mgr, 'createRequest', { ...role, jobTitle: 'Account Executive' })
    expect(good.outcome.ok).toBe(true)
    const id = idOf(good.outcome.ok ? good.outcome.notice : '')
    const edit = await sc.run(mgr, 'editRequest', {
      requestId: id,
      patch: { jobTitle: 'Account Executive, $180,000 base' },
    })
    expect(edit.outcome).toEqual({ ok: false, refused: REMOVE_AMOUNT_TEXT })
    expect(edit.entries).toEqual([])
    expect((await sc.request(id))?.jobTitle).toBe('Account Executive')

    const trade = await sc.run(mgr, 'createTrade', {
      ask: {
        give: [],
        creditUsedBp: 0,
        giveOrgPositionId: null,
        get: {
          level: 'P2',
          location: 'San Jose',
          fte: 1,
          orgPositionId: a.positionId,
          businessUnit: 'Go-to-Market',
          jobFamily: null,
          start: '2027-01-04',
          count: 'max',
          partTimeRest: false,
        },
      },
      reasonCode: REASON_CODES_OF.Trade[0],
      jobTitle: 'Two analysts for $150,000',
    })
    expect(trade.outcome).toEqual({ ok: false, refused: REMOVE_AMOUNT_TEXT })
    expect(trade.entries).toEqual([])
    expect(chainOk(await sc.log())).toBe(true)
  }, 120_000)
})

describe('an HRBP seat edit with no date (position.edit)', () => {
  it('is dated the seat’s first day when the seat starts after the as-of date', async () => {
    // A Planned seat in the unit whose first row is dated after the as-of date (FY27 has a Working).
    const template = s.datasets.positions.find((r) => r.businessUnit === SE && r.status === 'Planned')
    if (!template) throw new Error('No Planned seat in the unit.')
    const firstDay = '2026-12-01'
    expect(firstDay > s.asOf).toBe(true)
    const planted = {
      ...template,
      positionId: 'P-9990',
      effectiveDate: firstDay,
      status: 'Planned' as const,
      startDate: '2027-02-01',
      openedDate: null,
    }
    const sc = scenario({ datasets: () => ({ positions: [...s.datasets.positions, planted] }) })
    const hr: Who = { mode: 'hrbp', personId: personaOf(s, 'hrbp-se').employeeId, unit: SE }
    const out = await sc.run(hr, 'editSeat', {
      positionId: 'P-9990',
      changes: { fte: 0.5 },
      reason: 'Half time first',
    })
    expect(out.outcome).toEqual({ ok: true, notice: seatChangedNotice('P-9990') })
    expect(out.entries.map((e) => [e.field, e.effectiveDate])).toEqual([['fte', firstDay]])
    const row = (await sc.plan()).overlay.positions.find((r) => r.positionId === 'P-9990')
    expect(row?.effectiveDate).toBe(firstDay)
    // An explicit date is kept as given.
    const dated = await sc.run(hr, 'editSeat', {
      positionId: 'P-9990',
      effectiveDate: '2027-01-04',
      changes: { fte: 1 },
      reason: 'Full time from January',
    })
    expect(dated.entries.map((e) => e.effectiveDate)).toEqual(['2027-01-04'])
    expect(chainOk(await sc.log())).toBe(true)
  }, 120_000)
})

describe('an HRBP transfer (transfer.process)', () => {
  it('refuses a move out of another unit’s seat, with the unit sentence', async () => {
    const sc = scenario()
    const hr: Who = { mode: 'hrbp', personId: personaOf(s, 'hrbp-se').employeeId, unit: SE }
    const admin = await sc.ctx({ mode: 'hr-admin', personId: personaOf(s, 'hr-admin').employeeId })
    const a = personaOf(s, 'manager-a')
    const from = [...admin.positionIndex.byId.values()].find(
      (r) => r.managerPositionId === a.positionId && seatStateOf(admin, r.positionId)?.status === 'Filled',
    )
    const to = [...admin.positionIndex.byId.values()].find((r) => {
      const st = seatStateOf(admin, r.positionId)
      return r.businessUnit === SE && st?.status === 'Open' && !st.acceptedOffer
    })
    expect(from && to).toBeTruthy()
    const person = seatStateOf(admin, from?.positionId as string)?.holderIds[0] as string
    const out = await sc.run(hr, 'processTransfer', {
      kind: 'internal',
      personId: person,
      fromPositionId: from?.positionId as string,
      toPositionId: to?.positionId as string,
      effectiveDate: '2026-11-02',
      moveBudget: false,
      reasonCode: 'Restructure',
    })
    expect(out.outcome).toEqual({ ok: false, refused: OUTSIDE_UNIT_TEXT })
    expect(out.entries).toEqual([])
  }, 120_000)
})

describe('Requests > Cycle: open the next cycle and change its dates (cycle.open, cycle.dates)', () => {
  it('offers dates to Finance and HR admin only, and opening once the cycle under way is locked', async () => {
    const sc = scenario()
    const fin: Who = { mode: 'finance', personId: personaOf(s, 'finance-fpa').employeeId }
    const hr: Who = { mode: 'hrbp', personId: personaOf(s, 'hrbp-se').employeeId, unit: SE }
    const finCtx = await sc.ctx(fin)
    const cycle = requestsModel(finCtx).cycle
    expect(cycle.controls?.dates, 'Finance changes the dates').toEqual(
      finCtx.plan?.cycles.find((c) => c.cycleId === cycle.controls?.cycleId)?.dates,
    )
    // A cycle is under way, so none is offered to open.
    expect(cycle.open).toBeNull()
    const hrCtx = await sc.ctx(hr)
    expect(requestsModel(hrCtx).cycle.controls?.dates ?? null).toBeNull()
    expect(cycleOpenOf(hrCtx)).toBeNull()
    expect(decide('hrbp', 'action:cycle.open').access).toBe('hidden')

    // Changing the dates goes through the write path, signed by Finance.
    const id = cycle.controls?.cycleId as string
    const dates = cycle.controls?.dates
    if (!dates) throw new Error('No cycle dates to change.')
    const moved = await sc.run(fin, 'setCycleDates', {
      cycleId: id,
      dates: { ...dates, asksDue: '2026-11-13' },
    })
    expect(moved.outcome.ok).toBe(true)
    expect(moved.entries.every((e) => e.by === fin.personId)).toBe(true)
    expect((await sc.plan()).cycles.find((c) => c.cycleId === id)?.dates.asksDue).toBe('2026-11-13')

    // With every cycle locked, Finance is offered the next year's, with dates after the as-of date.
    const plan = finCtx.plan
    if (!plan) throw new Error('No plan state.')
    const locked = {
      ...finCtx,
      plan: { ...plan, cycles: plan.cycles.map((c) => ({ ...c, stage: 'Locked' as const })) },
    }
    const offer = cycleOpenOf(locked)
    const latest = [...(finCtx.plan?.cycles ?? [])]
      .map((c) => c.fiscalYear)
      .sort()
      .at(-1) as string
    expect(offer?.fiscalYear).toBe(`FY${Number(latest.slice(2)) + 1}`)
    expect((offer?.dates.asksDue as string) > finCtx.asOf).toBe(true)
    expect(chainOk(await sc.log())).toBe(true)
  }, 120_000)
})
