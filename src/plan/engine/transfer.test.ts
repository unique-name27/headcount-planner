/**
 * Transfers (docs/PLAN.md 10.5): the sides of a move, what approving one does to Working, and "Move
 * budget too?". The chains of a same-unit position move (CH3) and a cross-unit internal move (CH4) are
 * in chain.test.ts; here their sides.
 */
import { describe, expect, it } from 'vitest'
import type { PositionRow, TargetRow } from '@/data/schema'
import type { HcRequest, TransferFields, WorkingPlan } from '../types'
import { assignment, hcRequest, positionRow } from './fixtures/common'
import { transition } from './requests'
import { asksContext, headEffect } from './targets'
import { applyTransfer, budgetMove, budgetMoveEffects, budgetShare, transferSides } from './transfer'
import { approvedHeadsOn, type SeatHistory, seatHistories, seatOn } from './versions'

const GTM = 'Go-to-Market'
const SE = 'Silicon Engineering'

const POSITIONS: readonly PositionRow[] = [
  positionRow('P-GTM-MGR', { effectiveDate: '2025-04-01', level: 'M1' }),
  positionRow('P-GTM-MGR3', { effectiveDate: '2025-04-01', level: 'M1' }),
  positionRow('P-GTM-101', { effectiveDate: '2025-04-01', managerPositionId: 'P-GTM-MGR' }),
  // A planned level change on the moving seat, after the move.
  positionRow('P-GTM-101', {
    effectiveDate: '2027-01-01',
    level: 'P4',
    managerPositionId: 'P-GTM-MGR',
    sourceRequestId: 'R-LVL',
  }),
  positionRow('P-SE-MGR', {
    effectiveDate: '2025-04-01',
    level: 'M1',
    businessUnit: SE,
    department: 'Design Verification',
    costCenter: '1130-SJC',
  }),
  positionRow('P-SE-201', {
    effectiveDate: '2026-06-01',
    status: 'Open',
    level: 'P4',
    businessUnit: SE,
    department: 'Design Verification',
    costCenter: '1130-SJC',
    managerPositionId: 'P-SE-MGR',
    startDate: '2026-11-01',
    openedDate: '2026-06-01',
  }),
]

const PLAN: WorkingPlan = {
  versionId: 'fy27-working',
  positions: POSITIONS,
  assignments: [
    assignment('E1110', 'P-GTM-MGR', '2024-01-01'),
    assignment('E1130', 'P-GTM-MGR3', '2024-01-01'),
    assignment('E1111', 'P-GTM-101', '2024-01-01'),
    assignment('E2110', 'P-SE-MGR', '2024-01-01'),
  ],
  newPositionId: (requestId, n) => `${requestId}-${n}`,
  placeOf: (manager, location) =>
    manager.startsWith('P-SE')
      ? {
          businessUnit: SE,
          department: 'Design Verification',
          costCenter: location === 'San Jose' ? '1130-SJC' : '1130-XXX',
          legalEntity: 'Northgate Semiconductor Inc.',
        }
      : manager.startsWith('P-GTM')
        ? {
            businessUnit: GTM,
            department: 'Sales',
            costCenter: '4110-SJC',
            legalEntity: 'Northgate Semiconductor Inc.',
          }
        : null,
  actor: { personId: 'E9001', name: 'Go-to-Market HRBP', mode: 'hrbp' },
}

const transfer = (over: Partial<TransferFields>, req: Partial<HcRequest> = {}): HcRequest =>
  hcRequest('R-TR', {
    type: 'Transfer',
    reasonCode: 'Restructure',
    positionId: 'P-GTM-101',
    managerPositionId: 'P-GTM-MGR',
    transfer: {
      kind: 'position',
      personId: 'E1111',
      fromPositionId: 'P-GTM-101',
      toManagerPositionId: 'P-GTM-MGR3',
      toPositionId: null,
      effectiveDate: '2026-11-01',
      moveBudget: false,
      ...over,
    },
    ...req,
  })

/** CH3's same-unit position move and CH4's cross-unit internal move. */
const CH3 = transfer({})
const CH4 = transfer({ kind: 'internal', toManagerPositionId: null, toPositionId: 'P-SE-201' })
const CROSS_MOVE = transfer({ toManagerPositionId: 'P-SE-MGR' })

describe('transferSides', () => {
  it('CH3: a same-unit position move stays in Go-to-Market', () => {
    expect(transferSides(CH3, PLAN)).toEqual({
      fromPositionId: 'P-GTM-101',
      fromManagerPositionId: 'P-GTM-MGR',
      toManagerPositionId: 'P-GTM-MGR3',
      fromUnit: GTM,
      toUnit: GTM,
      crossUnit: false,
    })
  })

  it('CH4: a cross-unit internal move goes to the receiving seat’s manager and unit', () => {
    expect(transferSides(CH4, PLAN)).toEqual({
      fromPositionId: 'P-GTM-101',
      fromManagerPositionId: 'P-GTM-MGR',
      toManagerPositionId: 'P-SE-MGR',
      fromUnit: GTM,
      toUnit: SE,
      crossUnit: true,
    })
  })

  it('reads the from side before the move, so it is the same after the move is applied', () => {
    const applied = applyTransfer(CROSS_MOVE, PLAN, '2026-10-20')
    const after: WorkingPlan = { ...PLAN, positions: [...POSITIONS, ...applied.positions.map((c) => c.row)] }
    expect(transferSides(CROSS_MOVE, after)).toEqual(transferSides(CROSS_MOVE, PLAN))
    expect(transferSides(CROSS_MOVE, PLAN)?.crossUnit).toBe(true)
  })

  it('is null for unknown seats and for requests that are not transfers', () => {
    expect(transferSides(transfer({ fromPositionId: 'P-NONE' }), PLAN)).toBeNull()
    expect(transferSides(transfer({ kind: 'internal', toPositionId: 'P-NONE' }), PLAN)).toBeNull()
    expect(transferSides(transfer({ toManagerPositionId: 'X-UNKNOWN' }), PLAN)).toBeNull()
    expect(transferSides(hcRequest('R-NEW'), PLAN)).toBeNull()
  })
})

describe('applyTransfer: a position move', () => {
  const applied = applyTransfer(CROSS_MOVE, PLAN, '2026-10-20')

  it('adds a row dated the effective date under the new manager, with the new org’s fields', () => {
    const first = applied.positions[0]
    expect(first.kind).toBe('changed')
    expect(first.row).toMatchObject({
      positionId: 'P-GTM-101',
      effectiveDate: '2026-11-01',
      managerPositionId: 'P-SE-MGR',
      businessUnit: SE,
      department: 'Design Verification',
      costCenter: '1130-SJC',
      legalEntity: 'Northgate Semiconductor Inc.',
      level: 'P3',
      status: 'Filled',
      sourceRequestId: 'R-TR',
    })
  })

  it('moves the seat’s later dated rows too, keeping their own changes', () => {
    const later = applied.positions.filter((c) => c.row.effectiveDate === '2027-01-01')
    expect(later).toHaveLength(1)
    expect(later[0].row).toMatchObject({ level: 'P4', managerPositionId: 'P-SE-MGR', businessUnit: SE })
  })

  it('writes one audit entry per changed field, by the Acting as person', () => {
    const fields = applied.audit.filter((a) => a.effectiveDate === '2026-11-01').map((a) => a.field)
    expect(fields.sort()).toEqual(['businessUnit', 'costCenter', 'department', 'managerPositionId'])
    for (const a of applied.audit) {
      expect(a.object).toBe('position')
      expect(a.by).toBe('E9001')
      expect(a.mode).toBe('hrbp')
    }
  })

  it('takes effect on the approval date when the request has no effective date', () => {
    const r = applyTransfer(transfer({ effectiveDate: '' }), PLAN, '2026-10-20')
    expect(r.positions[0].row.effectiveDate).toBe('2026-10-20')
  })

  it('in the same unit moves only the manager', () => {
    const r = applyTransfer(CH3, PLAN, '2026-10-20')
    const fields = r.audit.filter((a) => a.effectiveDate === '2026-11-01').map((a) => a.field)
    expect(fields).toEqual(['managerPositionId'])
  })
})

describe('applyTransfer: an internal move', () => {
  const applied = applyTransfer(CH4, PLAN, '2026-10-20')

  it('puts the from seat On hold from the effective date, later rows included', () => {
    const held = applied.positions.filter((c) => c.row.positionId === 'P-GTM-101')
    expect(held.map((c) => [c.kind, c.row.effectiveDate, c.row.status])).toEqual([
      ['held', '2026-11-01', 'On hold'],
      ['held', '2027-01-01', 'On hold'],
    ])
    for (const c of held) expect(c.row.sourceRequestId).toBe('R-TR')
  })

  it('records the receiving seat as filled by the transfer', () => {
    const to = applied.positions.find((c) => c.row.positionId === 'P-SE-201')
    expect(to?.kind).toBe('changed')
    expect(to?.row).toMatchObject({ effectiveDate: '2026-11-01', status: 'Filled', sourceRequestId: 'R-TR' })
  })

  it('once HRIS moves the person, the from seat is On hold and the receiving seat Filled; approved heads move by the head effect', () => {
    const rows = [...POSITIONS, ...applied.positions.map((c) => c.row)]
    const moved = [
      ...PLAN.assignments.filter((a) => a.employeeId !== 'E1111'),
      assignment('E1111', 'P-GTM-101', '2024-01-01', '2026-10-31'),
      assignment('E1111', 'P-SE-201', '2026-11-01'),
    ]
    const seats = seatHistories({ positions: rows, assignments: moved, reqs: [], requests: [] })
    expect(seatOn(seats.get('P-GTM-101')!, '2026-11-01')?.status).toBe('On hold')
    expect(seatOn(seats.get('P-SE-201')!, '2026-11-01')?.status).toBe('Filled')

    const inGtm = (s: { businessUnit: string }) => s.businessUnit === GTM
    const ctx = asksContext({
      positions: POSITIONS,
      assignments: PLAN.assignments,
      reqs: [],
      requests: [],
      proration: 'daily',
      firstOpenMonth: '2026-10',
      bandUsd: () => 100_000,
    })
    const effect = headEffect(CH4, inGtm, '2027-03-31', ctx)
    expect(effect).toBe(-1)
    const before = seatHistories({
      positions: POSITIONS,
      assignments: PLAN.assignments,
      reqs: [],
      requests: [],
    })
    const gtm = (m: Map<string, SeatHistory>) => [...m.values()].filter((h) => h.rows[0].businessUnit === GTM)
    expect(approvedHeadsOn(gtm(seats), '2027-03-31') - approvedHeadsOn(gtm(before), '2027-03-31')).toBe(
      effect,
    )
  })

  it('until HRIS moves the person, the receiving seat is an approved head with no planned start', () => {
    const rows = [...POSITIONS, ...applied.positions.map((c) => c.row)]
    const seats = seatHistories({ positions: rows, assignments: PLAN.assignments, reqs: [], requests: [] })
    const to = seatOn(seats.get('P-SE-201')!, '2026-11-15')
    expect(to?.status).toBe('Open')
    expect(to?.approvedHead).toBe(true)
    expect(to?.planHead).toBe(false)
    expect(seatOn(seats.get('P-GTM-101')!, '2026-11-15')?.status).toBe('Filled')
  })
})

describe('approving a transfer through the request machine', () => {
  it('applies it on the last step and stamps its audit with the transition’s time', () => {
    const req: HcRequest = {
      ...CH3,
      state: 'In review',
      steps: [
        {
          n: 1,
          role: 'hrbp',
          approverId: 'E9001',
          reasons: ['always'],
          enteredAt: '2026-10-01T09:00',
          decision: null,
          at: null,
          note: null,
        },
      ],
    }
    const r = transition(req, { kind: 'approve' }, PLAN.actor, '2026-10-20T10:30', {
      chain: {
        org: {
          seats: new Map(),
          seatsOf: new Map(),
          units: new Map(),
          financeApproverId: null,
          leaderThresholdUsd: 250_000,
        },
        facts: {
          bandEstimateUsd: null,
          checks: [],
          cycleLocked: false,
          likeForLikeBackfill: false,
          envelopeException: false,
        },
      },
      asOf: '2026-10-20',
      seat: { status: 'Filled', acceptedOffer: false },
      cycleOpen: false,
      idleDays: 60,
      working: PLAN,
      hasAmount: () => false,
      newCommentId: (id, n) => `${id}-c${n}`,
    })
    if ('refused' in r) throw new Error(r.refused)
    expect(r.request.state).toBe('Approved')
    expect(r.request.outcome?.changedPositionIds).toEqual(['P-GTM-101'])
    const positionAudit = r.audit.filter((a) => a.object === 'position')
    expect(positionAudit.length).toBeGreaterThan(0)
    for (const a of positionAudit) expect(a.at).toBe('2026-10-20T10:30')
  })
})

describe('budgetMove: "Move budget too?"', () => {
  const from: TargetRow = { fiscalYear: 'FY27', businessUnit: GTM, targetHeads: 40, targetCost: 8_000_000 }
  const to: TargetRow = { fiscalYear: 'FY27', businessUnit: SE, targetHeads: 30, targetCost: 6_000_000 }
  const input = (req: HcRequest) => ({
    req,
    fromTarget: from,
    toTarget: to,
    seatBandUsd: 198_200,
    fiscalYear: 'FY27' as const,
    proration: 'daily' as const,
  })

  it('a position move shifts one head and the seat’s band estimate for the whole year', () => {
    const r = budgetMove(input(transfer({ toManagerPositionId: 'P-SE-MGR', moveBudget: true })))
    expect(r.from.targetHeads).toBe(39)
    expect(r.to.targetHeads).toBe(31)
    expect(r.from.targetCost).toBeCloseTo(8_000_000 - 198_200, 2)
    expect(r.to.targetCost).toBeCloseTo(6_000_000 + 198_200, 2)
  })

  it('an internal move effective 1 Jan 2027 shifts 3/12 of it: $49,550.00', () => {
    const req = transfer({
      kind: 'internal',
      toPositionId: 'P-SE-201',
      effectiveDate: '2027-01-01',
      moveBudget: true,
    })
    expect(budgetShare(req, 'FY27', 'daily')).toBeCloseTo(3 / 12, 12)
    const r = budgetMove(input(req))
    expect(r.from.targetCost).toBeCloseTo(8_000_000 - 49_550, 2)
    expect(r.to.targetCost).toBeCloseTo(6_000_000 + 49_550, 2)
    expect(r.from.targetHeads + r.to.targetHeads).toBe(70)
  })

  it('an internal move effective 16 Nov 2026 shifts the daily in-year share', () => {
    const req = transfer({
      kind: 'internal',
      toPositionId: 'P-SE-201',
      effectiveDate: '2026-11-16',
      moveBudget: true,
    })
    const share = (15 / 30 + 4) / 12
    expect(budgetShare(req, 'FY27', 'daily')).toBeCloseTo(share, 12)
    expect(budgetMove(input(req)).to.targetCost).toBeCloseTo(6_000_000 + 198_200 * share, 2)
  })

  it('a target with no cost keeps none, and nothing moves unless asked or between one target', () => {
    const req = transfer({ moveBudget: true })
    const r = budgetMove({ ...input(req), fromTarget: { ...from, targetCost: null } })
    expect(r.from.targetCost).toBeNull()
    expect(r.to.targetCost).toBeCloseTo(6_000_000 + 198_200, 2)
    expect(budgetMove(input(transfer({ moveBudget: false })))).toEqual({
      from: { ...from, targetDate: null, department: null, costCenter: null, leaderPositionId: null },
      to: { ...to, targetDate: null, department: null, costCenter: null, leaderPositionId: null },
    })
    const same = budgetMove({ ...input(req), toTarget: { ...from } })
    expect(same.from.targetHeads).toBe(40)
    expect(same.to.targetHeads).toBe(40)
  })

  it('never reads HRIS pay: only the band estimate given moves cost', () => {
    const req = transfer({ moveBudget: true })
    const a = budgetMove({ ...input(req), seatBandUsd: 100_000 })
    const b = budgetMove({ ...input(req), seatBandUsd: 200_000 })
    expect((a.from.targetCost ?? 0) - (b.from.targetCost ?? 0)).toBeCloseTo(100_000, 2)
  })

  it('as effects and audit entries Finance sees in Targets', () => {
    const req = transfer({ toManagerPositionId: 'P-SE-MGR', moveBudget: true })
    const r = budgetMoveEffects(input(req), PLAN.actor, '2026-10-20T10:30')
    expect(r.effects.map((e) => e.kind)).toEqual(['target', 'target'])
    expect(r.audit.map((a) => [a.object, a.id, a.field])).toEqual([
      ['target', 'FY27|Go-to-Market|||', 'targetHeads'],
      ['target', 'FY27|Go-to-Market|||', 'targetCost'],
      ['target', 'FY27|Silicon Engineering|||', 'targetHeads'],
      ['target', 'FY27|Silicon Engineering|||', 'targetCost'],
    ])
    expect(budgetMoveEffects(input(transfer({ moveBudget: false })), PLAN.actor, '2026-10-20T10:30')).toEqual(
      {
        effects: [],
        audit: [],
      },
    )
  })
})
