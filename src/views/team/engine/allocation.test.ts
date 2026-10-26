/**
 * My team's allocation reads the approved adds and eliminations since the plan of record locked from
 * the position rows the approvals wrote, not from the requests dataset (docs/M2-REPORT.md known gap 6,
 * browser finding B3; docs/PLAN.md 6.9, 15.1 R2 and R42). On the sample, every manager's allocation is
 * byte-identical to the one the requests reading gave (pinned in `allocation.testkit.ts` before the
 * change), and stays so with every approved request left out of the requests dataset: the seats
 * those approvals created or ended are still in the positions.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { APPROVED_REQUEST_STATES } from '@/data/schema'
import { MemoryStorage } from '@/testkit/memoryStorage'
import { ctxAs, leakSample, withDatasets, withPlan } from '@/testkit/sample'
import { ALLOCATION_BEFORE, allocationDigest, sampleManagers } from './allocation.testkit'
import { teamFacts } from './facts'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
vi.stubGlobal('localStorage', new MemoryStorage())

let managers: string[] = []
beforeAll(() => {
  managers = sampleManagers(leakSample())
}, 120_000)

/** Each manager's digest line (`allocationDigest`), in Manager mode acting as them. */
function digests(sample = leakSample()): Map<string, string> {
  return new Map(
    managers.map((id) => [id, allocationDigest(teamFacts(ctxAs('manager', id, { sample })))] as const),
  )
}

/** The managers whose line differs from the pinned one, with both lines. */
function changed(got: ReadonlyMap<string, string>): string[] {
  const out: string[] = []
  for (const [id, before] of ALLOCATION_BEFORE) {
    const after = got.get(id)
    if (after !== before) out.push(`${id}: before ${before}, after ${after ?? 'none'}`)
  }
  return out
}

describe('every sample manager’s allocation (known gap 6)', () => {
  it('is pinned for every manager, and the pin covers approved adds since the lock', () => {
    expect(managers.length).toBeGreaterThan(200)
    expect([...ALLOCATION_BEFORE.keys()]).toEqual(managers)
    // Non-vacuity: 11 New roles approved since the Q1 Reforecast locked reach the CEO's tree.
    const adds = [...ALLOCATION_BEFORE.values()].filter((line) => Number(line.split(' ')[3]) > 0)
    expect(adds.length).toBeGreaterThan(20)
    expect(ALLOCATION_BEFORE.get(managers[0])?.split(' ')[3]).toBe('11')
  })

  it('is byte-identical to the requests reading it replaces', () => {
    expect(changed(digests())).toEqual([])
  })

  it('reads no request: it is the same with every approved request left out of the requests', () => {
    const s = leakSample()
    const pending = (r: { state: (typeof APPROVED_REQUEST_STATES)[number] | string }) =>
      !(APPROVED_REQUEST_STATES as readonly string[]).includes(r.state)
    const without = withPlan(withDatasets(s, { requests: s.datasets.requests.filter(pending) }), {
      requests: s.plan.requests.filter(pending),
    })
    // Non-vacuity: the sample has approved New roles since the lock, and their seats stay in positions.
    expect(s.datasets.requests.length - without.datasets.requests.length).toBeGreaterThan(10)
    expect(changed(digests(without))).toEqual([])
  })
})
