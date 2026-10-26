/**
 * The request state machine (docs/PLAN.md 10.1, 10.3, 8.4 rule 5, 15.1 R5 to R7, change C23): every
 * allowed and refused transition, the accepted-offer refusals, what approval does to Working, the
 * cycle-ask path, expiry, the requests row round trip and the Backfill flags; and a Start date on a
 * seat Open after an exit (lead decision D-START).
 */

import { describe, expect, it } from 'vitest'
import type { PositionRow, RequestRow } from '@/data/schema'
import type { Actor, HcRequest, PlanEffect, PositionChange, WorkingPlan } from '../types'
import type { ChainFacts } from './chain'
import { lineContext, positionLines } from './cost'
import { CHAIN_ORG, facts } from './fixtures/chain'
import { assignment, fy27Working, hcRequest, positionRow } from './fixtures/common'
import { T1_REQUEST } from './fixtures/trade'
import { H3 } from './fixtures/versions'
import { toAssignments } from './heads'
import {
  ACCEPTED_OFFER_TEXT,
  applyApproval,
  BELOW_THE_CUT_LINE,
  backfillFlag,
  fromRow,
  isExpired,
  isPending,
  NOT_YOUR_STEP_TEXT,
  REMOVE_AMOUNT_TEXT,
  type RequestAction,
  type TransitionContext,
  type TransitionResult,
  toRow,
  transition,
} from './requests'
import { seatHistories, seatOn } from './versions'

/** The access layer's amount test, as Requests passes it in (8.4 rule 5): a currency or 1,000 or more. */
const hasAmount = (t: string): boolean =>
  /[$€£¥₹₪]|\b(USD|EUR|GBP|INR|ILS)\b|\d{1,3}(,\d{3})+|\d{4,}|\d+(\.\d+)?\s*[kKmM]\b/.test(t)

const AT = '2026-10-05T10:00'

const ROWS: PositionRow[] = [
  positionRow('P-GTM-MGR', { effectiveDate: '2025-04-01', level: 'M1' }),
  positionRow('P-GTM-101', { managerPositionId: 'P-GTM-MGR' }),
  positionRow('P-GTM-102', {
    status: 'Planned',
    level: 'P5',
    managerPositionId: 'P-GTM-MGR',
    startDate: '2026-12-01',
  }),
  positionRow('P-H', { effectiveDate: '2025-04-01', managerPositionId: 'P-GTM-MGR' }),
  positionRow('P-H', { effectiveDate: '2026-08-01', status: 'On hold', managerPositionId: 'P-GTM-MGR' }),
  positionRow('P-X', { managerPositionId: 'P-GTM-MGR' }),
]

const WORKING: WorkingPlan = {
  versionId: 'fy27-working',
  positions: ROWS,
  assignments: [
    assignment('E1110', 'P-GTM-MGR', '2025-04-01'),
    assignment('E1111', 'P-GTM-101', '2024-01-01'),
    assignment('E-H', 'P-H', '2024-01-01', '2026-07-31'),
    assignment('E-X', 'P-X', '2024-01-01', '2026-11-15'),
  ],
  newPositionId: (requestId, n) => `${requestId}-${n}`,
  placeOf: (_manager, location) => ({
    businessUnit: 'Go-to-Market',
    department: 'Sales',
    costCenter: location === 'Munich' ? '4110-MUC' : '4110-SJC',
    legalEntity: location === 'Munich' ? 'Northgate Semiconductor GmbH' : 'Northgate Semiconductor Inc.',
  }),
  actor: { personId: 'E9001', name: 'Go-to-Market HRBP', mode: 'hrbp' },
}

const ctx = (over: Partial<TransitionContext> = {}, f: Partial<ChainFacts> = {}): TransitionContext => ({
  chain: { org: CHAIN_ORG, facts: facts({ bandEstimateUsd: 198_200, ...f }) },
  asOf: '2026-10-05',
  seat: null,
  cycleOpen: false,
  idleDays: 60,
  working: WORKING,
  hasAmount,
  newCommentId: (requestId, n) => `${requestId}-c${n}`,
  ...over,
})

const MANAGER: Actor = { personId: 'E1110', name: 'Sales manager', mode: 'manager' }
const SR_MANAGER: Actor = { personId: 'E1120', name: 'Senior manager', mode: 'manager' }
const HRBP: Actor = { personId: 'E9001', name: 'Go-to-Market HRBP', mode: 'hrbp' }
const FINANCE: Actor = { personId: 'E8001', name: 'Finance approver', mode: 'finance' }

const draft = (over: Partial<HcRequest> = {}): HcRequest =>
  hcRequest('R-1', {
    state: 'Draft',
    submittedAt: null,
    updatedAt: '2026-10-01T09:00',
    level: 'P3',
    location: 'San Jose',
    fte: 1,
    startDate: '2027-01-04',
    ...over,
  })

function ok(r: TransitionResult): Extract<TransitionResult, { request: HcRequest }> {
  if ('refused' in r) throw new Error(`refused: ${r.refused}`)
  return r
}
const refused = (r: TransitionResult): string | null => ('refused' in r ? r.refused : null)

/** Runs actions in order, each by its actor; returns the last result. */
function run(req: HcRequest, steps: readonly [RequestAction, Actor][], c = ctx()): HcRequest {
  let r = req
  for (const [action, actor] of steps) r = ok(transition(r, action, actor, AT, c)).request
  return r
}

const created = (effects: readonly PlanEffect[]): PositionChange[] =>
  effects.flatMap((e) => (e.kind === 'position' ? [e.change] : []))

describe('submit', () => {
  it('computes the chain, enters step 1 and reads Submitted', () => {
    const res = ok(transition(draft(), { kind: 'submit', onBehalfOf: null }, MANAGER, AT, ctx()))
    expect(res.request.state).toBe('Submitted')
    expect(res.request.submittedAt).toBe(AT)
    expect(res.request.steps.map((s) => [s.role, s.approverId])).toEqual([
      ['manager', 'E1120'],
      ['hrbp', 'E9001'],
      ['finance', 'E8001'],
    ])
    expect(res.request.steps.map((s) => s.enteredAt)).toEqual([AT, null, null])
    expect(res.effects).toEqual([])
    const state = res.audit.find((a) => a.field === 'state')
    expect(state).toMatchObject({
      by: 'E1110',
      mode: 'manager',
      object: 'request',
      old: 'Draft',
      new: 'Submitted',
    })
  })

  it('on behalf records both people and routes by the requester', () => {
    const res = ok(transition(draft(), { kind: 'submit', onBehalfOf: 'E1110' }, HRBP, AT, ctx()))
    expect(res.request.requesterId).toBe('E1110')
    expect(res.request.submittedById).toBe('E9001')
    expect(res.request.steps[0]).toMatchObject({ role: 'manager', approverId: 'E1120' })
    expect(res.audit.some((a) => a.field === 'submittedById' && a.new === 'E9001')).toBe(true)
  })

  it('refuses someone else, a request that is not a draft, and missing fields', () => {
    expect(refused(transition(draft(), { kind: 'submit', onBehalfOf: null }, HRBP, AT, ctx()))).toBe(
      'Only the requester can submit this request.',
    )
    expect(
      refused(
        transition(draft({ state: 'Submitted' }), { kind: 'submit', onBehalfOf: null }, MANAGER, AT, ctx()),
      ),
    ).toBe('Only a draft can be submitted.')
    expect(
      refused(transition(draft({ level: null }), { kind: 'submit', onBehalfOf: null }, MANAGER, AT, ctx())),
    ).toMatch(/^Pick a level/)
    expect(
      refused(
        transition(draft({ type: 'Elimination' }), { kind: 'submit', onBehalfOf: null }, MANAGER, AT, ctx()),
      ),
    ).toBe('Pick the seat this request is for.')
    const trade = {
      ...T1_REQUEST,
      state: 'Draft' as const,
      trade: { ...T1_REQUEST.trade!, giveOrgPositionId: null },
    }
    expect(refused(transition(trade, { kind: 'submit', onBehalfOf: null }, MANAGER, AT, ctx()))).toMatch(
      /quote/,
    )
  })

  it('refuses a freeze-exception reason with an amount', () => {
    const r = draft({ exception: { freezeId: 'FRZ-1', reason: 'Costs only $95k' } })
    expect(refused(transition(r, { kind: 'submit', onBehalfOf: null }, MANAGER, AT, ctx()))).toBe(
      REMOVE_AMOUNT_TEXT,
    )
  })

  it('checks the seat a request names', () => {
    const sr = draft({ type: 'Start recruiting', positionId: 'P-GTM-101' })
    expect(
      refused(
        transition(
          sr,
          { kind: 'submit', onBehalfOf: null },
          MANAGER,
          AT,
          ctx({ seat: { status: 'Filled', acceptedOffer: false } }),
        ),
      ),
    ).toBe('Start recruiting is for Planned seats.')
    const el = draft({ type: 'Elimination', positionId: 'P-X' })
    expect(
      refused(
        transition(
          el,
          { kind: 'submit', onBehalfOf: null },
          MANAGER,
          AT,
          ctx({ seat: { status: 'Eliminated', acceptedOffer: false } }),
        ),
      ),
    ).toBe('This seat is already eliminated.')
  })
})

describe('accepted offers (10.1, change C23)', () => {
  const offer = ctx({ seat: { status: 'Open', acceptedOffer: true } })
  for (const type of ['Start date', 'Level change', 'Location change', 'Start recruiting'] as const) {
    it(`refuses ${type}`, () => {
      const r = draft({ type, positionId: 'P-GTM-102', level: 'P4', location: 'Munich' })
      expect(refused(transition(r, { kind: 'submit', onBehalfOf: null }, MANAGER, AT, offer))).toBe(
        ACCEPTED_OFFER_TEXT,
      )
    })
  }

  it('still allows an Elimination', () => {
    const r = draft({ type: 'Elimination', positionId: 'P-GTM-102', startDate: '2026-12-31' })
    expect(ok(transition(r, { kind: 'submit', onBehalfOf: null }, MANAGER, AT, offer)).request.state).toBe(
      'Submitted',
    )
  })
})

describe('decisions', () => {
  const submitted = () =>
    ok(transition(draft(), { kind: 'submit', onBehalfOf: null }, MANAGER, AT, ctx())).request

  it('only the step’s approver decides it', () => {
    const r = submitted()
    expect(refused(transition(r, { kind: 'approve' }, HRBP, AT, ctx()))).toBe(NOT_YOUR_STEP_TEXT)
    expect(refused(transition(r, { kind: 'reject', reason: 'No room' }, MANAGER, AT, ctx()))).toBe(
      NOT_YOUR_STEP_TEXT,
    )
  })

  it('walks the chain and applies the request at the last step', () => {
    let r = submitted()
    r = ok(transition(r, { kind: 'approve' }, SR_MANAGER, AT, ctx())).request
    expect(r.state).toBe('In review')
    expect(r.steps.map((s) => s.decision)).toEqual(['Approved', null, null])
    expect(r.steps[1].enteredAt).toBe(AT)
    r = ok(transition(r, { kind: 'approve' }, HRBP, AT, ctx())).request
    expect(r.state).toBe('In review')
    const last = ok(transition(r, { kind: 'approve' }, FINANCE, AT, ctx()))
    expect(last.request.state).toBe('Approved')
    const rows = created(last.effects)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      kind: 'created',
      row: {
        positionId: 'R-1-1',
        status: 'Planned',
        level: 'P3',
        startDate: '2027-01-04',
        sourceRequestId: 'R-1',
      },
    })
    expect(last.request.outcome).toEqual({ createdPositionIds: ['R-1-1'], changedPositionIds: [] })
    expect(last.audit.some((a) => a.object === 'position' && a.id === 'R-1-1' && a.field === 'status')).toBe(
      true,
    )
    expect(refused(transition(last.request, { kind: 'approve' }, FINANCE, AT, ctx()))).toBe(
      'This request is not waiting on a decision.',
    )
  })

  it('send back needs a reason without an amount, then resubmit starts the chain again', () => {
    const r = submitted()
    expect(refused(transition(r, { kind: 'send-back', reason: ' ' }, SR_MANAGER, AT, ctx()))).toMatch(
      /^Say what/,
    )
    expect(
      refused(transition(r, { kind: 'send-back', reason: 'Over €140,000' }, SR_MANAGER, AT, ctx())),
    ).toBe(REMOVE_AMOUNT_TEXT)
    const back = ok(
      transition(r, { kind: 'send-back', reason: 'Start in March instead' }, SR_MANAGER, AT, ctx()),
    )
    expect(back.request.state).toBe('Sent back')
    expect(back.request.steps[0]).toMatchObject({ decision: 'Sent back', note: 'Start in March instead' })
    expect(back.audit.find((a) => a.comment)).toMatchObject({
      comment: 'Start in March instead',
      commentAudience: 'everyone',
    })
    expect(refused(transition(back.request, { kind: 'submit', onBehalfOf: null }, MANAGER, AT, ctx()))).toBe(
      'Only a draft can be submitted.',
    )
    const again = ok(transition(back.request, { kind: 'resubmit' }, MANAGER, AT, ctx())).request
    expect(again.state).toBe('Submitted')
    expect(again.steps.map((s) => s.decision)).toEqual([null, null, null])
  })

  it('reject needs a reason without an amount and ends the request', () => {
    const r = submitted()
    expect(
      refused(transition(r, { kind: 'reject', reason: 'Too dear at 120k' }, SR_MANAGER, AT, ctx())),
    ).toBe(REMOVE_AMOUNT_TEXT)
    const no = ok(transition(r, { kind: 'reject', reason: 'Not this year' }, SR_MANAGER, AT, ctx())).request
    expect(no.state).toBe('Rejected')
    expect(isPending(no)).toBe(false)
    expect(refused(transition(no, { kind: 'withdraw' }, MANAGER, AT, ctx()))).toBe(
      'Only an open request can be withdrawn.',
    )
  })

  it('approve with changes is the HRBP step’s, records each change and ends Approved with changes', () => {
    let r = run(submitted(), [[{ kind: 'approve' }, SR_MANAGER]])
    const change = {
      kind: 'approve-with-changes',
      reason: 'Level mix',
      changes: [{ field: 'level', old: null, new: 'P2' }],
    } as const
    expect(refused(transition(submitted(), change, SR_MANAGER, AT, ctx()))).toBe(
      'Only the HRBP step can approve with changes.',
    )
    expect(refused(transition(r, { ...change, reason: 'Saves $20,000' }, HRBP, AT, ctx()))).toBe(
      REMOVE_AMOUNT_TEXT,
    )
    expect(refused(transition(r, { ...change, changes: [] }, HRBP, AT, ctx()))).toBe(
      'Pick at least one change.',
    )
    const res = ok(transition(r, change, HRBP, AT, ctx()))
    r = res.request
    expect(r.level).toBe('P2')
    expect(r.changes?.changes).toEqual([{ field: 'level', old: 'P3', new: 'P2' }])
    expect(res.audit.find((a) => a.field === 'level')).toMatchObject({
      old: 'P3',
      new: 'P2',
      comment: 'Level mix',
    })
    const last = ok(transition(r, { kind: 'approve' }, FINANCE, AT, ctx()))
    expect(last.request.state).toBe('Approved with changes')
    expect(created(last.effects)[0].row.level).toBe('P2')
  })

  it('a trade’s count can only go down, and lowering it frees exact credit (8 seats to 6: 0.11 to 0.56)', () => {
    const trade: HcRequest = {
      ...T1_REQUEST,
      state: 'In review',
      steps: [
        {
          n: 1,
          role: 'manager',
          approverId: 'E1120',
          reasons: ['always'],
          enteredAt: AT,
          decision: 'Approved',
          at: AT,
          note: null,
        },
        {
          n: 2,
          role: 'hrbp',
          approverId: 'E9001',
          reasons: ['always'],
          enteredAt: AT,
          decision: null,
          at: null,
          note: null,
        },
        {
          n: 3,
          role: 'leader',
          approverId: 'E1100',
          reasons: ['band-estimate-over-threshold'],
          enteredAt: null,
          decision: null,
          at: null,
          note: null,
        },
      ],
    }
    const lower = (count: number) =>
      transition(
        trade,
        {
          kind: 'approve-with-changes',
          reason: 'Fewer seats this year',
          changes: [{ field: 'count', old: null, new: count }],
        },
        HRBP,
        AT,
        ctx(),
      )
    expect(refused(lower(9))).toBe("A trade's count can only go down.")
    expect(refused(lower(0))).toMatch(/whole number/)
    const res = ok(lower(6))
    expect(res.request.trade).toMatchObject({ count: 6, giveBp: 19_160, getBp: 13_542, creditBp: 5_618 })
    expect(res.request.changes?.changes).toEqual([{ field: 'count', old: 8, new: 6 }])
    expect(res.request.state).toBe('In review')
    const level = transition(
      trade,
      {
        kind: 'approve-with-changes',
        reason: 'Level mix',
        changes: [{ field: 'level', old: null, new: 'P2' }],
      },
      HRBP,
      AT,
      ctx(),
    )
    expect(refused(level)).toBe('A trade can change only its count and start date.')
  })
})

describe('withdraw, comment, expire', () => {
  it('the requester withdraws an open request; nobody else does', () => {
    const r = ok(transition(draft(), { kind: 'submit', onBehalfOf: null }, MANAGER, AT, ctx())).request
    expect(refused(transition(r, { kind: 'withdraw' }, HRBP, AT, ctx()))).toBe(
      'Only the requester can withdraw this request.',
    )
    expect(ok(transition(r, { kind: 'withdraw' }, MANAGER, AT, ctx())).request.state).toBe('Withdrawn')
    expect(ok(transition(draft(), { kind: 'withdraw' }, MANAGER, AT, ctx())).request.state).toBe('Withdrawn')
  })

  it('a comment with an amount is Approvers only; an empty one is refused', () => {
    const plain = ok(
      transition(
        draft(),
        { kind: 'comment', text: 'Needed for the EMEA launch', audience: 'everyone' },
        HRBP,
        AT,
        ctx(),
      ),
    )
    expect(plain.request.comments[0]).toMatchObject({
      id: 'R-1-c1',
      by: 'E9001',
      mode: 'hrbp',
      audience: 'everyone',
    })
    const money = ok(
      transition(
        plain.request,
        { kind: 'comment', text: 'Offer at €140,000', audience: 'everyone' },
        HRBP,
        AT,
        ctx(),
      ),
    )
    expect(money.request.comments[1]).toMatchObject({ id: 'R-1-c2', audience: 'approvers' })
    expect(money.audit[0]).toMatchObject({
      field: 'comment',
      comment: 'Offer at €140,000',
      commentAudience: 'approvers',
    })
    expect(
      refused(transition(draft(), { kind: 'comment', text: '  ', audience: 'everyone' }, HRBP, AT, ctx())),
    ).toBe('Write a comment first.')
  })

  it('Draft and Sent back expire after 60 idle days, never in an open cycle', () => {
    const idle = draft({ updatedAt: '2026-08-06T09:00' })
    expect(isExpired(idle, '2026-10-05', 60, false)).toBe(true)
    expect(isExpired(draft({ updatedAt: '2026-08-07T09:00' }), '2026-10-05', 60, false)).toBe(false)
    expect(isExpired({ ...idle, state: 'Sent back' }, '2026-10-05', 60, false)).toBe(true)
    expect(isExpired({ ...idle, state: 'Submitted' }, '2026-10-05', 60, false)).toBe(false)
    expect(isExpired(idle, '2026-10-05', 60, true)).toBe(false)
    expect(ok(transition(idle, { kind: 'expire' }, HRBP, AT, ctx())).request.state).toBe('Expired')
    expect(refused(transition(draft(), { kind: 'expire' }, HRBP, AT, ctx()))).toMatch(/idle for 60 days/)
  })

  it('isPending is Submitted, In review and Sent back only', () => {
    const states = [
      'Draft',
      'Submitted',
      'In review',
      'Sent back',
      'Approved',
      'Approved with changes',
      'Rejected',
      'Withdrawn',
      'Expired',
    ] as const
    expect(states.filter((state) => isPending({ state }))).toEqual(['Submitted', 'In review', 'Sent back'])
  })
})

describe('cycle asks (15.1 R7)', () => {
  const open = ctx({ cycleOpen: true })
  const ask = draft({ cycleId: 'cyc-fy28', priority: 1 })

  it('take only the submitter’s manager step, then wait In review for the lock', () => {
    const r = ok(transition(ask, { kind: 'submit', onBehalfOf: null }, MANAGER, AT, open)).request
    expect(r.steps.map((s) => s.role)).toEqual(['manager'])
    const waiting = ok(transition(r, { kind: 'approve' }, SR_MANAGER, AT, open))
    expect(waiting.request.state).toBe('In review')
    expect(waiting.effects).toEqual([])
    expect(refused(transition(waiting.request, { kind: 'approve' }, HRBP, AT, open))).toBe(
      'This ask waits for the cycle to lock.',
    )
  })

  it('at lock, above the cut line is approved and applied; below is rejected "Below the cut line"', () => {
    const r = run(
      ask,
      [
        [{ kind: 'submit', onBehalfOf: null }, MANAGER],
        [{ kind: 'approve' }, SR_MANAGER],
      ],
      open,
    )
    const above = ok(transition(r, { kind: 'cycle-lock', aboveCut: true }, FINANCE, AT, open))
    expect(above.request.state).toBe('Approved')
    expect(created(above.effects)).toHaveLength(1)
    const below = ok(transition(r, { kind: 'cycle-lock', aboveCut: false }, FINANCE, AT, open))
    expect(below.request.state).toBe('Rejected')
    expect(below.request.reasonCode).toBe(BELOW_THE_CUT_LINE)
    expect(below.effects).toEqual([])
    expect(refused(transition(draft(), { kind: 'cycle-lock', aboveCut: true }, FINANCE, AT, open))).toMatch(
      /cycle asks/,
    )
  })
})

describe('applyApproval (10.1)', () => {
  const rowOf = (req: HcRequest, at = '2026-10-05') => {
    const effects = applyApproval(req, WORKING, at)
    expect(effects).toHaveLength(1)
    const e = effects[0]
    if (e.kind !== 'position') throw new Error('not a position effect')
    return e.change
  }

  it('Elimination: endDate is the last day, the Eliminated row starts the next day', () => {
    const c = rowOf(draft({ type: 'Elimination', positionId: 'P-GTM-101', startDate: '2026-12-31' }))
    expect(c.kind).toBe('eliminated')
    expect(c.row).toMatchObject({
      positionId: 'P-GTM-101',
      effectiveDate: '2027-01-01',
      status: 'Eliminated',
      endDate: '2026-12-31',
      endReason: 'Eliminated',
      sourceRequestId: 'R-1',
    })
  })

  it('Start recruiting: an Open row dated the approval date with openedDate that date', () => {
    const c = rowOf(draft({ type: 'Start recruiting', positionId: 'P-GTM-102' }))
    expect(c).toMatchObject({
      kind: 'opened',
      row: { effectiveDate: '2026-10-05', status: 'Open', openedDate: '2026-10-05', startDate: '2026-12-01' },
    })
  })

  it('Start date moves the start', () => {
    const c = rowOf(draft({ type: 'Start date', positionId: 'P-GTM-102', startDate: '2027-02-01' }))
    expect(c.row).toMatchObject({ status: 'Planned', startDate: '2027-02-01', effectiveDate: '2026-10-05' })
  })

  it('Backfill: an On hold seat becomes Open; openedDate is the later of approval and the last day + 1', () => {
    const held = rowOf(draft({ type: 'Backfill', positionId: 'P-H', startDate: '2026-12-01' }))
    expect(held).toMatchObject({
      kind: 'opened',
      row: { status: 'Open', openedDate: '2026-10-05', reqType: 'Backfill', startDate: '2026-12-01' },
    })
    const leaving = rowOf(draft({ type: 'Backfill', positionId: 'P-X', startDate: '2027-01-04' }))
    expect(leaving.row.openedDate).toBe('2026-11-16')
  })

  it('Level and Location changes add a dated row', () => {
    const level = rowOf(
      draft({ type: 'Level change', positionId: 'P-GTM-101', level: 'P4', startDate: '2026-11-01' }),
    )
    expect(level).toMatchObject({
      kind: 'changed',
      row: { level: 'P4', location: 'San Jose', effectiveDate: '2026-11-01' },
    })
    const moved = rowOf(
      draft({
        type: 'Location change',
        positionId: 'P-GTM-101',
        location: 'Munich',
        startDate: '2026-11-01',
      }),
    )
    expect(moved.row).toMatchObject({
      location: 'Munich',
      costCenter: '4110-MUC',
      legalEntity: 'Northgate Semiconductor GmbH',
      level: 'P3',
    })
  })

  it('a pending elimination books nothing until approved (no effect without approval)', () => {
    const r = draft({
      type: 'Elimination',
      positionId: 'P-GTM-101',
      startDate: '2026-12-31',
      state: 'Submitted',
    })
    expect(isPending(r)).toBe(true)
    // Nothing reads a pending request's effect on Working: applyApproval is only called on approval.
    expect(transition(r, { kind: 'approve' }, HRBP, AT, ctx())).toEqual({
      refused: 'This request has no step waiting on a decision.',
    })
  })
})

describe('requests rows', () => {
  const row: RequestRow = {
    requestId: 'R-77',
    type: 'Trade',
    state: 'In review',
    reasonCode: 'Location strategy',
    requesterId: 'E1110',
    submittedById: null,
    submittedAt: '2026-09-01T09:00',
    updatedAt: '2026-09-03T09:00',
    positionId: null,
    businessUnit: 'Go-to-Market',
    department: 'Sales',
    costCenter: null,
    managerPositionId: 'P-GTM-MGR',
    level: 'P4',
    location: 'Munich',
    jobTitle: null,
    fte: 1,
    startDate: '2027-01-01',
    priority: null,
    cycleId: null,
    steps: [
      { role: 'Manager', approverId: 'E1120', decision: 'Approved', at: '2026-09-02' },
      { role: 'HRBP', approverId: 'E9001', decision: 'Pending', at: null },
    ],
    confidential: false,
    exception: false,
    givePositionIds: 'P-T4',
    giveOrgPositionId: 'P-GTM-MGR',
    creditUsedBp: 0,
    count: 1,
    jobFamily: 'Sales',
    partTimeRest: true,
    rateVersion: 'fy27-q1-reforecast',
    rateHash: 'sha256-x',
    giveBp: 19_160,
    getBp: 18_421,
    creditBp: 739,
    transferKind: null,
    personId: null,
    fromPositionId: null,
    toManagerPositionId: null,
    toPositionId: null,
    effectiveDate: null,
    moveBudget: null,
  }

  it('reads a row: steps parsed, the waiting step entered, trade fields grouped, blanks null', () => {
    const r = fromRow({ ...row, restFte: 0.8 } as RequestRow)
    expect(r.steps.map((s) => [s.n, s.role, s.approverId, s.decision])).toEqual([
      [1, 'manager', 'E1120', 'Approved'],
      [2, 'hrbp', 'E9001', null],
    ])
    expect(r.steps[1].enteredAt).toBe('2026-09-02')
    expect(r.trade).toMatchObject({
      givePositionIds: ['P-T4'],
      count: 1,
      partTimeRest: true,
      restFte: 0.8,
      creditBp: 739,
    })
    expect(r.transfer).toBeNull()
    expect(r.exception).toBeNull()
    expect(fromRow(row).trade?.restFte).toBeNull()
  })

  it('round-trips through toRow', () => {
    const withRest = { ...row, restFte: 0.8 } as RequestRow
    expect(toRow(fromRow(withRest))).toEqual(withRest)
    const transfer: RequestRow = {
      ...row,
      requestId: 'R-78',
      type: 'Transfer',
      reasonCode: 'Restructure',
      givePositionIds: null,
      giveOrgPositionId: null,
      creditUsedBp: null,
      count: null,
      jobFamily: null,
      partTimeRest: null,
      rateVersion: null,
      rateHash: null,
      giveBp: null,
      getBp: null,
      creditBp: null,
      transferKind: 'Internal move',
      personId: 'E1111',
      fromPositionId: 'P-GTM-101',
      toPositionId: 'P-SE-201',
      effectiveDate: '2026-11-01',
      moveBudget: true,
    }
    const back = toRow(fromRow(transfer)) as RequestRow & { restFte?: unknown }
    const { restFte, ...rest } = back
    expect(restFte).toBeNull()
    expect(rest).toEqual(transfer)
    expect(fromRow(transfer).transfer).toMatchObject({
      kind: 'internal',
      toPositionId: 'P-SE-201',
      moveBudget: true,
    })
  })
})

describe('backfillFlag (15.1 R9)', () => {
  const flag = (exits: string[], created: string | null, orgExits: string[]) =>
    backfillFlag(draft({ type: 'Backfill', positionId: 'P-1' }), {
      createdOn: () => created,
      exitsOf: () => exits,
      orgExits: () => orgExits,
      windowDays: 30,
    })

  it('a seat with an exit has no flag', () => {
    expect(flag(['2026-10-15'], '2025-04-01', [])).toBeNull()
  })

  it('a seat made within 30 days of an exit in the org, with none itself, is backfill-new-position', () => {
    expect(flag([], '2026-11-10', ['2026-10-15'])).toBe('backfill-new-position')
    expect(flag([], '2026-09-20', ['2026-10-15'])).toBe('backfill-new-position')
  })

  it('otherwise a seat with no exit is backfill-no-exit', () => {
    expect(flag([], '2026-12-01', ['2026-10-15'])).toBe('backfill-no-exit')
    expect(flag([], null, [])).toBe('backfill-no-exit')
  })

  it('other types have no flag', () => {
    expect(
      backfillFlag(draft(), { createdOn: () => null, exitsOf: () => [], orgExits: () => [], windowDays: 30 }),
    ).toBeNull()
  })
})

describe('Start date on a seat Open after an exit (lead decision D-START)', () => {
  // H3's seat: imported Filled, the holder's last day 15 Oct 2026, no req and no Backfill.
  const plan: WorkingPlan = { ...WORKING, positions: [...H3.rows], assignments: toAssignments(H3.workers) }
  const startDate = (over: Partial<HcRequest> = {}) =>
    draft({ type: 'Start date', positionId: 'P-H3', startDate: '2027-01-04', state: 'Approved', ...over })
  const writtenRow = (positions: readonly PositionRow[], at: string) => {
    const effects = applyApproval(startDate(), { ...plan, positions }, at)
    expect(effects).toHaveLength(1)
    const e = effects[0]
    if (e.kind !== 'position') throw new Error('not a position effect')
    return e.change.row
  }

  it('writes an Open row, openedDate derived as the last day + 1', () => {
    expect(writtenRow(H3.rows, '2026-11-02')).toMatchObject({
      positionId: 'P-H3',
      effectiveDate: '2026-11-02',
      status: 'Open',
      openedDate: '2026-10-16',
      startDate: '2027-01-04',
      sourceRequestId: 'R-1',
    })
  })

  it('keeps an openedDate the row already has after the exit', () => {
    const rows = [{ ...H3.rows[0], openedDate: '2026-10-20' }]
    expect(writtenRow(rows, '2026-11-02')).toMatchObject({ status: 'Open', openedDate: '2026-10-20' })
  })

  it('gives the seat a planned start, a plan head and band cost from that date', () => {
    const row = writtenRow(H3.rows, '2026-11-02')
    const seat = seatHistories({
      positions: [...H3.rows, row],
      assignments: toAssignments(H3.workers),
      reqs: [],
      requests: [],
    }).get('P-H3')!
    expect(seatOn(seat, '2026-12-31')).toMatchObject({
      status: 'Open',
      plannedStart: '2027-01-04',
      planHead: false,
    })
    expect(seatOn(seat, '2027-01-31')).toMatchObject({ plannedStart: '2027-01-04', planHead: true })
    const lines = positionLines(
      H3.position,
      fy27Working('daily'),
      lineContext({ ...H3.context(), positions: [...H3.rows, row] }),
    )
    for (const l of lines.filter((x) => x.month === '2026-11' || x.month === '2026-12'))
      expect(l.usd.loaded, l.month).toBe(0)
    const jan = lines.filter((l) => l.month === '2027-01')
    expect(jan.map((l) => [l.basis, l.status, l.heads])).toEqual([['band', 'Filled', 1]])
    expect(jan[0].active).toBeCloseTo(28 / 31, 12)
    expect(jan[0].usd.loaded).toBeGreaterThan(0)
  })

  it('a Planned seat keeps its status (the row only moves the start)', () => {
    const c = applyApproval(
      draft({ type: 'Start date', positionId: 'P-GTM-102', startDate: '2027-02-01', state: 'Approved' }),
      WORKING,
      '2026-10-05',
    )[0]
    if (c.kind !== 'position') throw new Error('not a position effect')
    expect(c.change.row).toMatchObject({ status: 'Planned', startDate: '2027-02-01' })
  })
})
