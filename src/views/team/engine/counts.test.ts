/**
 * My team's key figures count in plain words (docs/PLAN.md 14.3, R86; M4 review CP-5, found by the
 * crawl's count scan, src/testkit/counts.ts): Allocation's formula names each seat status with its
 * count, as the `Kpi.formula` contract writes it ("1,450 Filled + 100 Open + 60 Planned."), so
 * Manager A's one Open and one Planned seat never read "1 Planned seats".
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { pluralSlips } from '@/testkit/counts'
import { MemoryStorage } from '@/testkit/memoryStorage'
import { leakSample, personaCtx } from '@/testkit/sample'
import { teamModel } from './index'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
vi.stubGlobal('localStorage', new MemoryStorage())

beforeAll(() => {
  leakSample()
}, 120_000)

describe('Allocation’s formula (fix step, loose ends)', () => {
  it('reads "7 Filled + 1 Open + 1 Planned." for Manager A', () => {
    const k = teamModel(personaCtx('manager-a')).kpis.find((x) => x.id === 'team-allocation')
    expect(k?.formula).toBe('7 Filled + 1 Open + 1 Planned.')
    expect(pluralSlips(k?.formula ?? '')).toEqual([])
  })
})
