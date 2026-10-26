/**
 * Expired is read at read time through the one effective state (docs/PLAN.md 10.1, R6; lead decision
 * D-EXPIRY; review SC-3, SP-4): a Sent back request idle for 60 days reads Expired in My team's
 * tracker and is no pending request there, and Targets' asks and gap leave it out, exactly as if it
 * had been withdrawn. The day before, it is still Sent back and still counts.
 */
import { describe, expect, it, vi } from 'vitest'
import { deciderOf, type Scenario, scenario, type Who } from '@/app/write/scenario.testkit'
import { MemoryStorage } from '@/testkit/memoryStorage'
import { personaOf } from '@/testkit/sample'
import { targetsModel } from '@/views/targets/engine'
import { teamModel } from './index'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
vi.stubGlobal('localStorage', new MemoryStorage())

const LATE = '2026-11-29'
const DAY_BEFORE = '2026-11-28'

async function sentBack(withdraw: boolean): Promise<{ sc: Scenario; id: string; B: Who }> {
  const sc = scenario()
  const s = sc.sample
  const b = personaOf(s, 'manager-b')
  const B: Who = { mode: 'manager', personId: b.employeeId }
  const before = new Set((await sc.plan()).requests.map((r) => r.requestId))
  const made = await sc.run(B, 'createRequest', {
    type: 'New role',
    managerPositionId: b.positionId,
    level: 'P2',
    location: 'San Jose',
    fte: 1,
    startDate: '2027-02-01',
    reasonCode: 'Growth',
  } as never)
  expect(made.outcome.ok).toBe(true)
  const id = (await sc.plan()).requests.find((r) => !before.has(r.requestId))?.requestId as string
  await sc.run(B, 'submitRequest', { requestId: id })
  await sc.run(deciderOf(s, (await sc.request(id)) as never), 'approveRequest', { requestId: id })
  const back = await sc.run(deciderOf(s, (await sc.request(id)) as never), 'sendBack', {
    requestId: id,
    reason: 'Say which product line this covers',
  })
  expect(back.outcome.ok).toBe(true)
  if (withdraw) expect((await sc.run(B, 'withdrawRequest', { requestId: id })).outcome.ok).toBe(true)
  return { sc, id, B }
}

async function readAt(x: { sc: Scenario; id: string; B: Who }, asOf: string) {
  const admin: Who = { mode: 'hr-admin', personId: personaOf(x.sc.sample, 'hr-admin').employeeId, asOf }
  const ops = targetsModel(await x.sc.ctx(admin)).gap.rows.rows.find((r) => r.orgKey === 'unit:Operations')
  const team = teamModel(await x.sc.ctx({ ...x.B, asOf }))
  return {
    asks: ops?.asksHeads ?? null,
    gap: ops?.gapHeads ?? null,
    pending: team.kpis.find((k) => k.metricId === 'team.requests.pending')?.value ?? null,
    tracker: team.tracker.rows.filter((r) => r.requestId === x.id).map((r) => r.state),
  }
}

describe('a Sent back request idle for 60 days (D-EXPIRY)', () => {
  it('reads Expired in the tracker and leaves pending, asks and the gap as a withdrawn one', async () => {
    const live = await sentBack(false)
    const control = await sentBack(true)
    const dayBefore = await readAt(live, DAY_BEFORE)
    expect(dayBefore.tracker).toEqual(['Sent back'])
    const late = await readAt(live, LATE)
    const withdrawn = await readAt(control, LATE)
    expect(late.tracker).toEqual(['Expired'])
    expect(late.pending).toBe(withdrawn.pending)
    expect(late.asks).toBe(withdrawn.asks)
    expect(late.gap).toBe(withdrawn.gap)
    // The day before it still counts: one more pending request and one more ask than withdrawn.
    const controlBefore = await readAt(control, DAY_BEFORE)
    expect(dayBefore.pending).toBe((controlBefore.pending as number) + 1)
    expect(dayBefore.asks).toBe((controlBefore.asks as number) + 1)
  }, 480_000)
})
