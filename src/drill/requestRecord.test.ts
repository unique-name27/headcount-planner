/**
 * Requests as records (docs/PLAN.md 8.4): `requestView` decides each row (the access layer's; a
 * stand-in here that keeps its contract), and the record keeps to it: no row for 'none' (rule 3),
 * only the position ID, title, level and org for 'limited' (rule 2), the waiting step and its days
 * for 'full', a transfer's moving person and sides (rule 2a), trade weights in basis points and
 * never USD, a band estimate only where the caller gives one, and no comment text ever.
 */
import { describe, expect, it, vi } from 'vitest'
import type { RequestView, Viewer } from '@/access/visibility'
import { hcRequest } from '@/plan/engine/fixtures/common'
import type { HcRequest } from '@/plan/types'
import { requestRecord, requestRecords, waitingStep } from './requestRecord'

const VIEW: Record<string, RequestView> = { 'R-NONE': 'none', 'R-LIM': 'limited' }
vi.mock('@/access/visibility', async (orig) => ({
  ...(await orig<typeof import('@/access/visibility')>()),
  requestView: (req: HcRequest) => VIEW[req.requestId] ?? 'full',
}))

const viewer = { mode: 'hrbp', personId: 'E10077' } as unknown as Viewer
const names: Record<string, string> = { E1110: 'Priya Raman', E10077: 'Avery Lin', E2000: 'Sam Moss' }
const input = { viewer, asOf: '2026-09-30', nameOf: (id: string) => names[id] ?? null }

const steps: HcRequest['steps'] = [
  {
    n: 1,
    role: 'manager',
    approverId: 'E2000',
    reasons: ['always'],
    enteredAt: '2026-09-01T09:00',
    decision: 'Approved',
    at: '2026-09-02T09:00',
    note: null,
  },
  {
    n: 2,
    role: 'hrbp',
    approverId: 'E10077',
    reasons: ['always'],
    enteredAt: '2026-09-02T09:00',
    decision: null,
    at: null,
    note: null,
  },
]

describe('requestRecord', () => {
  it('is no record at all for a request rule 3 hides', () => {
    expect(requestRecord(hcRequest('R-NONE'), input)).toBeNull()
    expect(requestRecords([hcRequest('R-NONE'), hcRequest('R-1')], input).map((r) => r.requestId)).toEqual([
      'R-1',
    ])
  })

  it('keeps a limited request to its position ID, title, level and org', () => {
    const r = requestRecord(
      hcRequest('R-LIM', {
        type: 'Elimination',
        positionId: 'P-1042',
        jobTitle: 'Design engineer',
        level: 'P4',
        location: 'Munich',
        startDate: '2026-12-31',
        steps,
        comments: [
          {
            id: 'C1',
            at: '2026-09-02T10:00',
            by: 'E2000',
            mode: 'manager',
            text: 'Budget €140,000',
            audience: 'approvers',
          },
        ],
      }),
      { ...input, bandOf: () => 180_000 },
    )
    expect(r).toMatchObject({
      view: 'limited',
      type: 'Elimination',
      positionId: 'P-1042',
      jobTitle: 'Design engineer',
      level: 'P4',
      businessUnit: 'Go-to-Market',
      requesterName: null,
      reasonCode: null,
      location: null,
      startDate: null,
      approverName: null,
      bandEstimateUsd: null,
    })
    expect(JSON.stringify(r)).not.toMatch(/140,000|Budget|Priya|Avery|Sam/)
  })

  it('gives a full record its waiting step, approver and days in step', () => {
    const req = hcRequest('R-1', { steps, level: 'P3', location: 'San Jose', startDate: '2027-01-04' })
    expect(waitingStep(req)?.n).toBe(2)
    const r = requestRecord(req, { ...input, bandOf: () => 150_000 })
    expect(r).toMatchObject({
      view: 'full',
      requesterName: 'Priya Raman',
      stepN: 2,
      stepRole: 'hrbp',
      approverName: 'Avery Lin',
      daysInStep: 28,
      bandEstimateUsd: 150_000,
      startDate: '2027-01-04',
    })
    // No comment text ever reaches a record.
    expect(Object.keys(r ?? {})).not.toContain('comments')
  })

  it('shows a transfer’s moving person and sides, and a trade’s weights in basis points', () => {
    const transfer = requestRecord(
      hcRequest('R-T', {
        type: 'Transfer',
        transfer: {
          kind: 'internal',
          personId: 'E2000',
          fromPositionId: 'P-1',
          toManagerPositionId: null,
          toPositionId: 'P-2',
          effectiveDate: '2026-11-01',
          moveBudget: false,
        },
      }),
      input,
    )
    expect(transfer).toMatchObject({
      transferPersonName: 'Sam Moss',
      fromPositionId: 'P-1',
      toPositionId: 'P-2',
      effectiveDate: '2026-11-01',
    })
    const trade = requestRecord(
      hcRequest('R-TR', {
        type: 'Trade',
        trade: {
          givePositionIds: ['P-2589'],
          giveOrgPositionId: 'P-SS-MGR',
          creditUsedBp: 0,
          count: 6,
          jobFamily: null,
          partTimeRest: false,
          restFte: null,
          rateVersion: null,
          rateHash: null,
          giveBp: 17_010,
          getBp: 16_590,
          creditBp: 420,
        },
      }),
      input,
    )
    expect(trade).toMatchObject({
      giveBp: 17_010,
      getBp: 16_590,
      creditBp: 420,
      count: 6,
      bandEstimateUsd: null,
    })
  })
})
