/**
 * Position titles in Manager mode (docs/PLAN.md 7.6, R48; M4 review EX-3): an amount that arrives in
 * the positions dataset's title or job family reads "an amount" everywhere a Manager-mode context
 * reaches, the models, the manager's own Shareable and an Export for a manager file made from HR
 * admin included, because the context reads every position's free text through `managerText`. HR
 * admin, the control, still reads the title as imported.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { Sample } from '@/data/sample'
import { MemoryStorage } from '@/testkit/memoryStorage'
import { leakSample, PINNED_AT, personaCtx, personaOf, sampleCtx, withDatasets } from '@/testkit/sample'
import { forManagerFile, shareableFile } from '@/views/data/engine/workspace'
import { planModel } from '@/views/plan/engine'
import { requestsModel } from '@/views/requests/engine'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
vi.stubGlobal('localStorage', new MemoryStorage())

const MARK = '€140,000'
const FAMILY_MARK = '$2.5m'

let planted: Sample
let seat: string
let managerId: string

beforeAll(() => {
  const s = leakSample()
  const a = personaOf(s, 'manager-a')
  managerId = a.employeeId
  seat = s.datasets.positions.find((p) => p.managerPositionId === a.positionId)?.positionId as string
  planted = withDatasets(s, {
    positions: s.datasets.positions.map((p) =>
      p.positionId === seat
        ? { ...p, title: `Design Engineer (budget ${MARK})`, jobFamily: `Engineering ${FAMILY_MARK} pool` }
        : p,
    ),
  })
}, 120_000)

const holds = (v: unknown, mark: string) => JSON.stringify(v).includes(mark)

describe('position titles in Manager mode (review EX-3)', () => {
  it('read "an amount" in every model, the context and the manager’s own Shareable', () => {
    const ctx = personaCtx('manager-a', { sample: planted })
    const row = ctx.all.positions.find((p) => p.positionId === seat)
    expect(row?.title).toBe('Design Engineer (budget an amount)')
    expect(row?.jobFamily).toBe('Engineering an amount pool')
    expect(ctx.positionIndex.byId.get(seat)?.title).toBe('Design Engineer (budget an amount)')
    for (const mark of [MARK, FAMILY_MARK]) {
      expect(holds(planModel(ctx).positions, mark), mark).toBe(false)
      expect(holds(requestsModel(ctx).new, mark), mark).toBe(false)
      const own = shareableFile(ctx, PINNED_AT)
      if (!own.ok) throw new Error(own.refused)
      expect(own.out.text.includes(mark), mark).toBe(false)
    }
  }, 300_000)

  it('flag every position title column as free text, so each export reads it through the mode too', () => {
    const ctx = personaCtx('manager-a', { sample: planted })
    const flagged = (cols: readonly { key: string; freeText?: boolean }[], key: string) =>
      cols.find((c) => c.key === key)?.freeText
    expect(flagged(planModel(ctx).positions.grid.columns, 'title')).toBe(true)
    expect(flagged(requestsModel(ctx).new?.seats?.columns ?? [], 'title')).toBe(true)
    expect(flagged(requestsModel(ctx).queue.rows.columns, 'jobTitle')).toBe(true)
  }, 300_000)

  it('read "an amount" in an Export for a manager file made from HR admin; HR admin reads the title as imported', () => {
    const admin = sampleCtx('hr-admin', { sample: planted })
    expect(admin.all.positions.find((p) => p.positionId === seat)?.title).toBe(
      `Design Engineer (budget ${MARK})`,
    )
    const r = forManagerFile(admin, managerId, PINNED_AT)
    if (!r.ok) throw new Error(r.refused)
    expect(r.out.text.includes(MARK)).toBe(false)
    expect(r.out.text.includes(FAMILY_MARK)).toBe(false)
    expect(r.out.text).toContain('Design Engineer (budget an amount)')
  }, 300_000)
})
