/**
 * The M3 review's core-flow fixes in the engines (docs/PLAN.md 10.1 to 10.5, 11.2 to 11.4, 15.1 R6,
 * R7, R47; lead decisions D-EXPIRY, D-CYCLE and D-MERGE): the business date and the audit's own time,
 * the one effective-state helper, the cycle's one cut line and its lock rules, a cycle ask's HRBP
 * changes, the accepted-offer check at approval, the trade change audit and credit, an approval a
 * file brings, freeze exceptions let through, a seat held by an approved internal move, the trade
 * quote's notes and block texts, the month close date and the Location change's cost center. Each case
 * failed before its fix.
 */
import { describe, expect, it } from 'vitest'
import type { FreezeRow, PositionRow } from '@/data/schema'
import type { Actor, Cycle, HcRequest, WorkingPlan } from '../types'
import { closeTooEarlyText } from './close'
import {
  cutAfterOf,
  cutLine,
  lockedOutcomes,
  lockOutcomes,
  lockWaitingText,
  type RankedAsk,
  rankAsks,
  roomOf,
  waitingOnManager,
} from './cycle'
import { TRADE_RATES_11_7 } from './fixtures/band'
import { CHAIN_ORG, facts } from './fixtures/chain'
import { assignment, hcRequest, positionRow } from './fixtures/common'
import { G1 } from './fixtures/targets'
import { T1, T1_REQUEST, T1_WORKING, TRADE_SEATS, tradeContext } from './fixtures/trade'
import {
  exceptionFreezeOf,
  type FreezeOpening,
  freezeExemptions,
  freezeSavings,
  frozenOpenings,
} from './freeze'
import {
  ACCEPTED_OFFER_TEXT,
  approvalDateOf,
  BELOW_THE_CUT_LINE,
  CYCLE_CHANGES_TEXT,
  type ExpiryInput,
  effectiveState,
  fromRow,
  isPendingNow,
  noCostCenterText,
  replayApproval,
  SENT_BACK_ASK_TEXT,
  siteMoveRefusal,
  type TransitionContext,
  type TransitionResult,
  toRow,
  tradeCreditChange,
  transition,
  WAITS_ON_MANAGER_TEXT,
  withEffectiveStates,
} from './requests'
import { asks, asksContext, headEffect } from './targets'
import {
  creditBalance,
  interviewingText,
  ratesChangeText,
  standardHeadsApart,
  tradeQuote,
  tradeTargetMove,
} from './trade'
import { heldForMove, seatHistories, seatOn } from './versions'

const hasAmount = (t: string): boolean => /[$€£¥₹₪]|\d{1,3}(,\d{3})+|\d{4,}/.test(t)

const HRBP: Actor = { personId: 'E9001', name: 'Go-to-Market HRBP', mode: 'hrbp' }
const MANAGER: Actor = { personId: 'E1120', name: 'Sales manager', mode: 'manager' }
const FINANCE: Actor = { personId: 'E8001', name: 'Finance approver', mode: 'finance' }

/** The business time (R47: the as-of date with the wall clock's time) and the wall clock weeks later. */
const BUSINESS = '2026-09-30T14:05:00.000Z'
const WALL = '2026-10-24T14:05:00.000Z'

const ROWS: PositionRow[] = [
  positionRow('P-GTM-MGR', { effectiveDate: '2025-04-01', level: 'M1' }),
  positionRow('P-GTM-101', { managerPositionId: 'P-GTM-MGR' }),
  positionRow('P-OPEN', { status: 'Open', managerPositionId: 'P-GTM-MGR', startDate: '2026-11-16' }),
  positionRow('P-MUC', { managerPositionId: 'P-GTM-MGR', location: 'Munich', costCenter: '4110-MUC' }),
]

const WORKING: WorkingPlan = {
  versionId: 'fy27-working',
  positions: ROWS,
  assignments: [
    assignment('E1110', 'P-GTM-MGR', '2025-04-01'),
    assignment('E1111', 'P-GTM-101', '2024-01-01'),
    assignment('E1112', 'P-MUC', '2024-01-01'),
  ],
  newPositionId: (requestId, n) => `P-${requestId}-${n}`,
  // The department has cost centers in San Jose and Munich only; anywhere else the manager's.
  placeOf: (_manager, location) => ({
    businessUnit: 'Go-to-Market',
    department: 'Sales',
    costCenter: location === 'Munich' ? '4110-MUC' : '4110-SJC',
    legalEntity: 'Northgate Semiconductor Inc.',
  }),
  actor: HRBP,
}

const tctx = (over: Partial<TransitionContext> = {}): TransitionContext => ({
  chain: { org: CHAIN_ORG, facts: facts({ bandEstimateUsd: 198_200 }) },
  asOf: '2026-09-30',
  seat: null,
  cycleOpen: false,
  idleDays: 60,
  working: WORKING,
  hasAmount,
  newCommentId: (id, n) => `${id}-c${n}`,
  ...over,
})

const ok = (r: TransitionResult) => {
  if ('refused' in r) throw new Error(r.refused)
  return r
}
const refusal = (r: TransitionResult): string => ('refused' in r ? r.refused : '')

/** A step waiting on `approverId` (role `role`), entered on the business date. */
const waitingOn = (role: 'manager' | 'hrbp' | 'leader' | 'finance', approverId: string) => ({
  n: 1,
  role,
  approverId,
  reasons: ['always' as const],
  enteredAt: '2026-09-29T09:00:00.000Z',
  decision: null,
  at: null,
  note: null,
})

describe('R47: business dates, and the audit’s own time', () => {
  it('stores the business time on the request and its step, the wall clock only on the audit entries', () => {
    const draft = hcRequest('R-B6', {
      state: 'Draft',
      requesterId: MANAGER.personId,
      level: 'P3',
      location: 'San Jose',
      fte: 1,
      startDate: '2027-01-04',
      updatedAt: BUSINESS,
    })
    const out = ok(transition(draft, { kind: 'submit', onBehalfOf: null }, MANAGER, BUSINESS, tctx(), WALL))
    expect(out.request.submittedAt).toBe(BUSINESS)
    expect(out.request.updatedAt).toBe(BUSINESS)
    // The first step is entered on the as-of date, so it waits on its approver (browser B6).
    expect(out.request.steps[0].enteredAt).toBe(BUSINESS)
    for (const e of out.audit) {
      expect(e.at).toBe(WALL)
      expect(e.effectiveDate).toBe('2026-09-30')
    }
  })

  it('a Start recruiting approved today opens the seat as of the as-of date', () => {
    const req = hcRequest('R-REC', {
      type: 'Start recruiting',
      state: 'Submitted',
      positionId: 'P-OPEN',
      steps: [waitingOn('hrbp', HRBP.personId)],
    })
    const out = ok(transition(req, { kind: 'approve' }, HRBP, BUSINESS, tctx(), WALL))
    const row = out.effects.find((e) => e.kind === 'position')
    expect(row?.kind === 'position' ? row.change.row : null).toMatchObject({
      status: 'Open',
      openedDate: '2026-09-30',
      effectiveDate: '2026-09-30',
    })
    expect(out.request.steps[0].at).toBe(BUSINESS)
  })

  it('a stored date after the as-of date reads as 0 idle days, never negative', () => {
    const later = hcRequest('R-LATE', { state: 'Draft', updatedAt: '2026-12-31T09:00:00.000Z' })
    expect(effectiveState(later, { asOf: '2026-09-30', idleDays: 0, cycles: [] })).toBe('Expired')
    expect(effectiveState(later, { asOf: '2026-09-30', idleDays: 1, cycles: [] })).toBe('Draft')
  })

  it('a month closes only once the as-of date is on or after its month-end (browser B8)', () => {
    expect(closeTooEarlyText('2026-10', '2026-09-30')).toBe(
      'Oct 2026 closes once the data is as of 31 Oct 2026 or later.',
    )
    expect(closeTooEarlyText('2026-09', '2026-09-30')).toBeNull()
    expect(closeTooEarlyText('2026-10', '2026-11-02')).toBeNull()
  })
})

describe('D-EXPIRY: one effective state', () => {
  const x: ExpiryInput = {
    asOf: '2026-11-29',
    idleDays: 60,
    cycles: [{ cycleId: 'cyc-open', stage: 'HRBP review' }],
  }
  const sentBack = hcRequest('R-SB', { state: 'Sent back', updatedAt: '2026-09-30T09:00:00.000Z' })

  it('reads an idle Sent back request as Expired, not pending; an ask in an open cycle never expires', () => {
    expect(effectiveState(sentBack, x)).toBe('Expired')
    expect(isPendingNow(sentBack, x)).toBe(false)
    expect(effectiveState({ ...sentBack, updatedAt: '2026-10-01T09:00:00.000Z' }, x)).toBe('Sent back')
    expect(effectiveState({ ...sentBack, cycleId: 'cyc-open' }, x)).toBe('Sent back')
    expect(effectiveState({ ...sentBack, state: 'Submitted' }, x)).toBe('Submitted')
  })

  it('frees an expired trade’s credit and takes its head out of asks', () => {
    // T1 approved holds 1,104 bp; a second trade Sent back reserves 420 of it.
    const t1 = { ...T1_REQUEST, requestId: 'R-T1A', state: 'Approved' as const }
    const reserve = {
      ...T1_REQUEST,
      requestId: 'R-RES',
      state: 'Sent back' as const,
      updatedAt: '2026-09-30T09:00:00.000Z',
      trade: {
        ...(T1_REQUEST.trade as NonNullable<HcRequest['trade']>),
        creditUsedBp: 420,
        givePositionIds: [],
      },
    }
    const stored = [t1, reserve]
    expect(creditBalance(stored, 'P-GTM-MGR', 'FY27')).toBe(684)
    const live = withEffectiveStates(stored, x)
    expect(live.find((r) => r.requestId === 'R-RES')?.state).toBe('Expired')
    expect(creditBalance(live, 'P-GTM-MGR', 'FY27')).toBe(1_104)
    // The stored copies are untouched (nothing stores Expired), and a list with nothing expired is the same list.
    expect(reserve.state).toBe('Sent back')
    expect(withEffectiveStates([t1], x)).toEqual([t1])
    const none = [t1]
    expect(withEffectiveStates(none, x)).toBe(none)
  })

  it('an expired pending ask leaves asks', () => {
    const ctx = asksContext(G1.context)
    const ask = {
      ...G1.requests[0],
      state: 'Sent back' as const,
      cycleId: null,
      updatedAt: '2026-09-30T09:00',
    }
    const stored = [ask]
    const before = asks(G1.org, G1.targetDate, stored, ctx).heads
    const after = asks(G1.org, G1.targetDate, withEffectiveStates(stored, x), ctx).heads
    expect(before - after).toBe(headEffect(ask, G1.org, G1.targetDate, ctx))
    expect(before - after).toBe(1)
  })

  it('the requester may withdraw an expired request', () => {
    const expired = { ...sentBack, requesterId: MANAGER.personId, state: 'Expired' as const }
    const out = ok(transition(expired, { kind: 'withdraw' }, MANAGER, BUSINESS, tctx()))
    expect(out.request.state).toBe('Withdrawn')
  })
})

describe('D-CYCLE: one cut line, and the lock decides only manager-approved asks', () => {
  const ranked: RankedAsk[] = Array.from({ length: 58 }, (_, i) => ({
    requestId: `R-G1-${String(i + 1).padStart(2, '0')}`,
    requesterId: 'E-A',
    priority: i + 1,
    heads: 1,
    bandUsd: 0,
  }))
  const cycle: Cycle = {
    cycleId: 'cyc-fy28',
    fiscalYear: 'FY28',
    stage: 'Finance review',
    openedAt: BUSINESS,
    openedBy: FINANCE.personId,
    dates: { asksDue: '2026-10-16', hrbpReviewDue: null, leaderReviewDue: null, financeReviewDue: null },
    hrbpDone: [],
    leaderDone: [],
    cutLines: [],
    lockedAt: null,
    lockedBy: null,
  }

  it('the room and the default line are G1’s: after the 40th ranked head', () => {
    expect(roomOf(G1.target.targetHeads, G1.asks.heads, ranked)).toBe(G1.room)
    expect(roomOf(null, 70, ranked)).toBeNull()
    expect(cutAfterOf(cycle, 'Silicon Engineering', ranked, 40)).toEqual({
      afterHeads: 40,
      source: 'default',
    })
    expect(cutAfterOf(cycle, 'Silicon Engineering', ranked, null)).toEqual({
      afterHeads: null,
      source: 'none',
    })
    const marked = { ...cycle, cutLines: [{ businessUnit: 'Silicon Engineering', afterHeads: 30 }] }
    expect(cutAfterOf(marked, 'Silicon Engineering', ranked, 40)).toEqual({ afterHeads: 30, source: 'set' })
  })

  it('the lock applies the default line when none is stored (story 6: 40 above, 18 below)', () => {
    const out = lockOutcomes(
      cycle,
      new Map([['Silicon Engineering', ranked]]),
      new Map([['Silicon Engineering', 40]]),
    )
    expect(out.approved).toEqual(cutLine(ranked, 40).above)
    expect(out.approved).toHaveLength(40)
    expect(out.rejected).toHaveLength(18)
    // A unit with no target and no mark still has nothing cut.
    expect(lockOutcomes(cycle, new Map([['Go-to-Market', ranked.slice(0, 3)]])).approved).toHaveLength(3)
  })

  it('a Sent back ask is out of the ranking; a Submitted one (waiting on its manager) stays in', () => {
    const asks = [
      hcRequest('R-1', { cycleId: 'cyc-fy28', state: 'In review', priority: 1 }),
      hcRequest('R-2', { cycleId: 'cyc-fy28', state: 'Submitted', priority: 2 }),
      hcRequest('R-3', { cycleId: 'cyc-fy28', state: 'Sent back', priority: 3 }),
    ]
    expect(
      rankAsks(
        asks,
        'cyc-fy28',
        () => 1,
        () => 0,
      ).map((a) => a.requestId),
    ).toEqual(['R-1', 'R-2'])
  })

  it('names the asks and managers the lock waits on', () => {
    const asks = [
      hcRequest('R-1', { cycleId: 'cyc-fy28', state: 'Submitted', steps: [waitingOn('manager', 'E-M1')] }),
      hcRequest('R-2', { cycleId: 'cyc-fy28', state: 'Submitted', steps: [waitingOn('manager', 'E-M1')] }),
      hcRequest('R-3', { cycleId: 'cyc-fy28', state: 'Submitted', steps: [waitingOn('manager', 'E-M2')] }),
      hcRequest('R-4', {
        cycleId: 'cyc-fy28',
        state: 'In review',
        steps: [{ ...waitingOn('manager', 'E-M3'), decision: 'Approved', at: BUSINESS }],
      }),
      hcRequest('R-5', { cycleId: 'cyc-other', state: 'Submitted', steps: [waitingOn('manager', 'E-M4')] }),
    ]
    const w = waitingOnManager(asks, 'cyc-fy28')
    expect(w).toEqual({ requestIds: ['R-1', 'R-2', 'R-3'], managerIds: ['E-M1', 'E-M2'] })
    expect(lockWaitingText('FY28', 3, 2)).toBe(
      "Lock the FY28 cycle once these asks have their manager's decision: 3 asks with 2 managers.",
    )
    expect(lockWaitingText('FY28', 1, 1)).toBe(
      "Lock the FY28 cycle once these asks have their manager's decision: 1 ask with 1 manager.",
    )
  })

  it('the cycle-lock transition never decides an ask its manager has not approved, nor a Sent back one', () => {
    const open = tctx({ cycleOpen: true })
    const waiting = hcRequest('R-W', {
      cycleId: 'cyc-fy28',
      state: 'Submitted',
      level: 'P3',
      location: 'San Jose',
      steps: [waitingOn('manager', 'E-M1')],
    })
    expect(
      refusal(transition(waiting, { kind: 'cycle-lock', aboveCut: true }, FINANCE, BUSINESS, open)),
    ).toBe(WAITS_ON_MANAGER_TEXT)
    const sent = {
      ...waiting,
      state: 'Sent back' as const,
      steps: [{ ...waiting.steps[0], decision: 'Sent back' as const }],
    }
    expect(refusal(transition(sent, { kind: 'cycle-lock', aboveCut: true }, FINANCE, BUSINESS, open))).toBe(
      SENT_BACK_ASK_TEXT,
    )
    const decided = {
      ...waiting,
      state: 'In review' as const,
      steps: [{ ...waiting.steps[0], decision: 'Approved' as const, at: BUSINESS }],
    }
    expect(
      ok(transition(decided, { kind: 'cycle-lock', aboveCut: false }, FINANCE, BUSINESS, open)).request,
    ).toMatchObject({
      state: 'Rejected',
      reasonCode: BELOW_THE_CUT_LINE,
    })
  })

  it('the unit HRBP’s changes to a manager-approved ask are stored with the reason; the lock approves it with them', () => {
    const open = tctx({ cycleOpen: true })
    const ask = hcRequest('R-C', {
      cycleId: 'cyc-fy28',
      state: 'In review',
      level: 'P3',
      location: 'San Jose',
      fte: 1,
      startDate: '2027-06-01',
      steps: [{ ...waitingOn('manager', 'E-M1'), decision: 'Approved', at: BUSINESS }],
    })
    const changes = [{ field: 'startDate' as const, old: null, new: '2027-07-01' }]
    const changed = ok(
      transition(
        ask,
        { kind: 'cycle-changes', changes, reason: 'Start after the tape-out.' },
        HRBP,
        BUSINESS,
        open,
        WALL,
      ),
    )
    expect(changed.request).toMatchObject({ state: 'In review', startDate: '2027-07-01' })
    expect(changed.request.changes?.reason).toBe('Start after the tape-out.')
    expect(changed.request.steps).toEqual(ask.steps)
    expect(changed.audit.map((e) => [e.field, e.old, e.new, e.comment])).toEqual([
      ['startDate', '2027-06-01', '2027-07-01', 'Start after the tape-out.'],
    ])
    const locked = ok(
      transition(changed.request, { kind: 'cycle-lock', aboveCut: true }, FINANCE, BUSINESS, open),
    )
    expect(locked.request.state).toBe('Approved with changes')
    // Not before the manager approved it, and never with an amount in the reason.
    const early = { ...ask, state: 'Submitted' as const, steps: [waitingOn('manager', 'E-M1')] }
    expect(
      refusal(transition(early, { kind: 'cycle-changes', changes, reason: 'Later.' }, HRBP, BUSINESS, open)),
    ).toBe(CYCLE_CHANGES_TEXT)
    expect(
      refusal(
        transition(ask, { kind: 'cycle-changes', changes, reason: 'Saves $40,000.' }, HRBP, BUSINESS, open),
      ),
    ).toMatch(/Remove the amount/)
  })

  it('after lock, the outcome per unit (review SC-20, UI-10)', () => {
    const out = lockedOutcomes(
      [
        hcRequest('R-1', { cycleId: 'cyc-fy28', state: 'Approved', businessUnit: 'Silicon Engineering' }),
        hcRequest('R-2', {
          cycleId: 'cyc-fy28',
          state: 'Approved with changes',
          businessUnit: 'Silicon Engineering',
        }),
        hcRequest('R-3', {
          cycleId: 'cyc-fy28',
          state: 'Rejected',
          reasonCode: BELOW_THE_CUT_LINE,
          businessUnit: 'Silicon Engineering',
        }),
        hcRequest('R-4', {
          cycleId: 'cyc-fy28',
          state: 'Rejected',
          reasonCode: 'Other',
          businessUnit: 'Silicon Engineering',
        }),
      ],
      'cyc-fy28',
    )
    expect(out.get('Silicon Engineering')).toEqual({ approved: ['R-1', 'R-2'], below: ['R-3'] })
  })
})

describe('decisions re-read the seat and the request', () => {
  it('refuses approving a Start date, Level change or Location change once the seat has an accepted offer (SC-5)', () => {
    for (const type of ['Start date', 'Level change', 'Location change'] as const) {
      const req = hcRequest(`R-${type}`, {
        type,
        positionId: 'P-OPEN',
        startDate: '2027-03-01',
        level: 'P5',
        location: 'Munich',
        steps: [waitingOn('hrbp', HRBP.personId)],
      })
      const seat = { status: 'Open' as const, acceptedOffer: true }
      expect(refusal(transition(req, { kind: 'approve' }, HRBP, BUSINESS, tctx({ seat }))), type).toBe(
        ACCEPTED_OFFER_TEXT,
      )
      const changes = [{ field: 'startDate' as const, old: null, new: '2027-04-01' }]
      expect(
        refusal(
          transition(
            req,
            { kind: 'approve-with-changes', changes, reason: 'Later.' },
            HRBP,
            BUSINESS,
            tctx({ seat }),
          ),
        ),
        type,
      ).toBe(ACCEPTED_OFFER_TEXT)
    }
    // An Elimination is still allowed.
    const elim = hcRequest('R-E', {
      type: 'Elimination',
      positionId: 'P-OPEN',
      startDate: '2026-12-31',
      steps: [waitingOn('hrbp', HRBP.personId)],
    })
    expect(
      'refused' in
        transition(
          elim,
          { kind: 'approve' },
          HRBP,
          BUSINESS,
          tctx({ seat: { status: 'Open', acceptedOffer: true } }),
        ),
    ).toBe(false)
  })

  it('an Elimination with no last day ends the seat on the approval date (SC-18)', () => {
    const elim = hcRequest('R-E', {
      type: 'Elimination',
      positionId: 'P-GTM-101',
      startDate: null,
      steps: [waitingOn('hrbp', HRBP.personId)],
    })
    const out = ok(transition(elim, { kind: 'approve' }, HRBP, BUSINESS, tctx()))
    const row = out.effects.find((e) => e.kind === 'position')
    expect(row?.kind === 'position' ? row.change.row : null).toMatchObject({
      status: 'Eliminated',
      endDate: '2026-09-30',
      effectiveDate: '2026-10-01',
    })
  })

  it('a resubmit whose chain is the one it had writes no steps entry (SC-17)', () => {
    const first = ok(
      transition(
        hcRequest('R-RS', {
          state: 'Draft',
          requesterId: MANAGER.personId,
          level: 'P3',
          location: 'San Jose',
        }),
        { kind: 'submit', onBehalfOf: null },
        MANAGER,
        BUSINESS,
        tctx(),
      ),
    )
    expect(first.audit.some((e) => e.field === 'steps')).toBe(true)
    const back = { ...first.request, state: 'Sent back' as const }
    const again = ok(transition(back, { kind: 'resubmit' }, MANAGER, BUSINESS, tctx()))
    expect(again.audit.some((e) => e.field === 'steps')).toBe(false)
    expect(again.request.state).toBe('Submitted')
  })

  it('a trade approved with a lower count audits its weights and credit, and keeps the credit before and after (SC-16, UI-6)', () => {
    const req = { ...T1_REQUEST, steps: [waitingOn('hrbp', HRBP.personId)] }
    const changes = [{ field: 'count' as const, old: null, new: 6 }]
    const out = ok(
      transition(
        req,
        { kind: 'approve-with-changes', changes, reason: 'Six fit the plan.' },
        HRBP,
        BUSINESS,
        tctx(),
      ),
    )
    const fields = out.audit.filter((e) => e.object === 'request').map((e) => [e.field, e.old, e.new])
    expect(fields).toContainEqual(['count', 8, 6])
    expect(fields).toContainEqual(['getBp', 18_056, 13_542])
    expect(fields).toContainEqual(['creditBp', 1_104, 5_618])
    expect(tradeCreditChange(out.request)).toEqual({ old: 1_104, new: 5_618 })
    // A re-quote the caller passes is what the trade stores.
    const requoted = {
      ...(req.trade as NonNullable<HcRequest['trade']>),
      count: 6,
      getBp: 13_500,
      creditBp: 5_660,
    }
    const q = ok(
      transition(
        req,
        { kind: 'approve-with-changes', changes, reason: 'Six fit.', requoted },
        HRBP,
        BUSINESS,
        tctx(),
      ),
    )
    expect(q.request.trade).toMatchObject({ count: 6, getBp: 13_500, creditBp: 5_660 })
  })

  it('refuses a Location change to a site where the department has no cost center (SC-15)', () => {
    const req = hcRequest('R-LOC', {
      type: 'Location change',
      positionId: 'P-GTM-101',
      location: 'Haifa',
      steps: [waitingOn('hrbp', HRBP.personId)],
    })
    const text = noCostCenterText('Sales', 'Haifa')
    expect(text).toBe(
      'Sales has no cost center in Haifa yet, so this seat cannot move there. HR admin adds the cost center first.',
    )
    expect(refusal(transition(req, { kind: 'approve' }, HRBP, BUSINESS, tctx()))).toBe(text)
    // Munich has a Sales cost center: the move goes through and takes it.
    const out = ok(transition({ ...req, location: 'Munich' }, { kind: 'approve' }, HRBP, BUSINESS, tctx()))
    const row = out.effects.find((e) => e.kind === 'position')
    expect(row?.kind === 'position' ? row.change.row.costCenter : null).toBe('4110-MUC')
    expect(siteMoveRefusal(WORKING, ROWS[1], 'San Jose', 'P-GTM-MGR')).toBeNull()
  })
})

describe('D-MERGE: an approval a file brings', () => {
  const approved = hcRequest('R-FILE', {
    state: 'Approved',
    level: 'P3',
    location: 'San Jose',
    fte: 1,
    startDate: '2027-01-04',
    updatedAt: '2026-09-29T15:00:00.000Z',
    steps: [
      { ...waitingOn('finance', FINANCE.personId), decision: 'Approved', at: '2026-09-29T15:00:00.000Z' },
    ],
    outcome: { createdPositionIds: ['P-FROM-FILE-1'], changedPositionIds: [] },
  })
  const opts = { auditAt: WALL, comment: 'Approved by E8001 in the imported file.' }

  it('applies the approval here, dated its approval date, with the file’s seat ID, signed by the importer', () => {
    expect(approvalDateOf(approved)).toBe('2026-09-29')
    const out = replayApproval(approved, WORKING, opts)
    if (out.kind !== 'apply') throw new Error(out.kind)
    expect(out.on).toBe('2026-09-29')
    expect(out.outcome.createdPositionIds).toEqual(['P-FROM-FILE-1'])
    const row = out.effects[0]
    expect(row.kind === 'position' ? row.change.row : null).toMatchObject({
      positionId: 'P-FROM-FILE-1',
      status: 'Planned',
      effectiveDate: '2026-09-29',
      sourceRequestId: 'R-FILE',
    })
    for (const e of out.audit) expect(e).toMatchObject({ by: HRBP.personId, at: WALL, comment: opts.comment })
  })

  it('is idempotent, applies nothing for a request not approved, and lists what cannot apply as a conflict', () => {
    const out = replayApproval(approved, WORKING, opts)
    const applied =
      out.kind === 'apply' ? out.effects.flatMap((e) => (e.kind === 'position' ? [e.change.row] : [])) : []
    const again = replayApproval(approved, { ...WORKING, positions: [...ROWS, ...applied] }, opts)
    expect(again).toEqual({ kind: 'none', why: 'applied' })
    expect(replayApproval({ ...approved, state: 'In review' }, WORKING, opts)).toEqual({
      kind: 'none',
      why: 'not-approved',
    })
    const elsewhere = { ...approved, managerPositionId: 'P-NOT-HERE' }
    expect(replayApproval(elsewhere, WORKING, opts)).toEqual({
      kind: 'conflict',
      text: 'R-FILE cannot be applied here: seat P-NOT-HERE is not in this workspace.',
    })
    const clash = { ...approved, outcome: { createdPositionIds: ['P-GTM-101'], changedPositionIds: [] } }
    expect(replayApproval(clash, WORKING, opts)).toEqual({
      kind: 'conflict',
      text: 'R-FILE cannot be applied here: seat P-GTM-101 is already another seat in this workspace.',
    })
  })
})

describe('freeze exceptions let their seats through (SC-4, SC-7)', () => {
  const freeze: FreezeRow = {
    freezeId: 'FRZ-001',
    businessUnit: 'Go-to-Market',
    department: null,
    costCenter: null,
    leaderPositionId: null,
    startDate: '2026-08-01',
    endDate: null,
    allowBackfill: false,
    reason: null,
  }
  const inTree = () => false
  const imported = hcRequest('R-EXC', {
    state: 'Approved',
    level: 'P3',
    location: 'San Jose',
    startDate: '2026-12-07',
    exception: { freezeId: '', reason: '' },
  })

  it('an imported exception’s Finance step names the freeze exception (and a New role’s own reason)', () => {
    const row = {
      ...toRow(hcRequest('R-IMP', { level: 'P3', location: 'San Jose', startDate: '2026-12-07' })),
      exception: true,
      steps: [
        { role: 'HRBP' as const, approverId: 'E9001', decision: 'Approved' as const, at: '2026-09-20' },
        { role: 'Finance' as const, approverId: 'E8001', decision: 'Pending' as const, at: null },
      ],
    }
    const r = fromRow(row)
    expect(r.steps.map((x) => [x.role, x.reasons])).toEqual([
      ['hrbp', []],
      ['finance', ['new-role', 'freeze-exception']],
    ])
    expect(fromRow({ ...row, exception: false }).steps[1].reasons).toEqual([])
  })

  it('an imported exception names the freeze covering the request; a stored one names its own', () => {
    expect(exceptionFreezeOf(imported, [freeze], inTree, '2026-09-30')).toBe('FRZ-001')
    expect(
      exceptionFreezeOf(
        { ...imported, exception: { freezeId: 'FRZ-9', reason: 'x' } },
        [freeze],
        inTree,
        '2026-09-30',
      ),
    ).toBe('FRZ-9')
    expect(exceptionFreezeOf({ ...imported, exception: null }, [freeze], inTree, '2026-09-30')).toBeNull()
  })

  it('a seat an approved exception created is no frozen opening and saves nothing', () => {
    const seatRow = positionRow('P-EXC-1', {
      status: 'Planned',
      startDate: '2026-12-07',
      sourceRequestId: 'R-EXC',
    })
    const exempt = freezeExemptions([imported], [seatRow], [freeze], inTree, '2026-09-30')
    expect(exempt.get('P-EXC-1')).toEqual(['FRZ-001'])
    const opening = (exemptFrom?: readonly string[]): FreezeOpening => ({
      positionId: 'P-EXC-1',
      status: 'Planned',
      place: {
        positionId: 'P-EXC-1',
        managerPositionId: null,
        businessUnit: 'Go-to-Market',
        department: 'Sales',
        costCenter: '4110-SJC',
      },
      seat: { level: 'P3', location: 'San Jose', fte: 1 },
      unfrozenStart: '2026-12-07',
      acceptedOffer: false,
      backfill: false,
      ...(exemptFrom ? { exemptFrom } : {}),
    })
    expect(frozenOpenings([opening()], [freeze], '2026-09-30', inTree)).toHaveLength(1)
    expect(frozenOpenings([opening(exempt.get('P-EXC-1'))], [freeze], '2026-09-30', inTree)).toEqual([])
    const savings = (o: FreezeOpening) =>
      freezeSavings({
        openings: [o],
        freezes: [freeze],
        gridEnd: '2027-03-31',
        proration: 'full-month',
        inTree,
        bandUsd: () => 120_000,
        suppressedBackfills: [],
      }).total
    expect(savings(opening())).toBeGreaterThan(0)
    expect(savings(opening(exempt.get('P-EXC-1')))).toBe(0)
  })
})

describe('a seat held by an approved internal move (SC-6)', () => {
  it('is no approved head and no ask while HRIS still shows the person on it, so the gap does not move at approval', () => {
    const positions = [
      positionRow('P-MGR', { effectiveDate: '2025-04-01', level: 'M1' }),
      positionRow('P-FROM', { effectiveDate: '2025-04-01', managerPositionId: 'P-MGR' }),
      positionRow('P-TO', { status: 'Open', managerPositionId: 'P-MGR', startDate: null }),
    ]
    const people = [assignment('E-M', 'P-MGR', '2025-04-01'), assignment('E-MOVER', 'P-FROM', '2024-01-01')]
    const move = hcRequest('R-MOVE', {
      type: 'Transfer',
      state: 'In review',
      positionId: 'P-FROM',
      transfer: {
        kind: 'internal',
        personId: 'E-MOVER',
        fromPositionId: 'P-FROM',
        toManagerPositionId: null,
        toPositionId: 'P-TO',
        effectiveDate: '2026-11-02',
        moveBudget: false,
      },
    })
    const ctxOf = (rows: PositionRow[]) =>
      asksContext({
        positions: rows,
        assignments: people,
        reqs: [],
        requests: [],
        proration: 'full-month',
        firstOpenMonth: '2026-10',
        bandUsd: () => 100_000,
      })
    const all = () => true
    const pending = asks(all, '2027-03-31', [move], ctxOf(positions)).heads
    // Approved: the from seat's On hold row and the receiving seat's Filled row, HRIS not updated yet.
    const after = [
      ...positions,
      positionRow('P-FROM', {
        effectiveDate: '2026-11-02',
        status: 'On hold',
        managerPositionId: 'P-MGR',
        sourceRequestId: 'R-MOVE',
      }),
      positionRow('P-TO', {
        effectiveDate: '2026-11-02',
        status: 'Filled',
        managerPositionId: 'P-MGR',
        sourceRequestId: 'R-MOVE',
      }),
    ]
    expect(asks(all, '2027-03-31', [], ctxOf(after)).heads).toBe(pending)
    const h = seatHistories({ positions: after, assignments: people, reqs: [], requests: [] }).get('P-FROM')
    const s = h ? seatOn(h, '2026-12-01') : null
    expect(s?.status).toBe('Filled')
    expect(s?.approvedHead).toBe(false)
    expect(s ? heldForMove(s.position, s.status) : null).toBe(true)
  })
})

describe('the trade quote’s notes and texts', () => {
  it('names a pending request only when the viewer sees it in full (PV-9)', () => {
    const seats = new Map(TRADE_SEATS)
    const p = TRADE_SEATS.get('P-T1')
    if (!p) throw new Error('fixture')
    seats.set('P-T1', { ...p, pendingRequestId: 'R-HIDDEN' })
    const text = (shown: boolean | null) =>
      tradeQuote(T1.ask, seats, TRADE_RATES_11_7, {
        ...tradeContext(),
        ...(shown == null ? {} : { requestShown: () => shown }),
      }).blocks[0]?.text
    expect(text(null)).toBe('This seat is already in another pending request.')
    expect(text(false)).toBe('This seat is already in another pending request.')
    expect(text(true)).toBe('This seat is already in pending request R-HIDDEN.')
  })

  it('warns when a give seat’s req is at Interviewing (SC-12), and flags Working rates (SC-11)', () => {
    const seats = new Map(TRADE_SEATS)
    const p = TRADE_SEATS.get('P-T1')
    if (!p) throw new Error('fixture')
    seats.set('P-T1', { ...p, openReq: { reqId: 'REQ-4185', stage: 'Interviewing' } })
    const q = tradeQuote(T1.ask, seats, TRADE_RATES_11_7, tradeContext())
    expect(q.ok).toBe(true)
    expect(q.warnings).toEqual([
      {
        code: 'req-interviewing',
        positionId: 'P-T1',
        reqId: 'REQ-4185',
        text: interviewingText('REQ-4185', 'P-T1'),
      },
    ])
    // The request card's sentence (M3 known gap 6: the card and What if read the engine's).
    expect(interviewingText('REQ-4185', 'P-T1')).toBe(
      'REQ-4185 on P-T1 is interviewing. Trading the seat leaves the req open as imported.',
    )
    const locked = TRADE_RATES_11_7.lockHash != null
    expect(q.ratesNote).toBe(locked ? null : ratesChangeText(TRADE_RATES_11_7.year))
    const working = tradeQuote(T1.ask, TRADE_SEATS, { ...TRADE_RATES_11_7, lockHash: null }, tradeContext())
    expect(working.ratesNote).toBe(`Rates can change until ${TRADE_RATES_11_7.year} locks.`)
  })

  it('a credit refusal shows two numbers that read apart (SC-19)', () => {
    const ask = { ...T1.ask, creditUsedBp: 421 }
    const q = tradeQuote(ask, TRADE_SEATS, TRADE_RATES_11_7, tradeContext(420))
    expect(q.blocks.find((b) => b.code === 'credit-over-balance')?.text).toBe(
      'The giving org holds 0.0420 standard heads of trade credit; this trade uses 0.0421.',
    )
    expect(standardHeadsApart(1_104, 5_618)).toEqual(['0.11', '0.56'])
  })

  it('"Move target too?" moves the given approved heads and their in-year band out, the seats received in (SP-5)', () => {
    const q = tradeQuote(T1.ask, TRADE_SEATS, TRADE_RATES_11_7, tradeContext())
    const target = (unit: string, heads: number) => ({
      fiscalYear: 'FY27' as const,
      targetDate: null,
      businessUnit: unit,
      department: null,
      costCenter: null,
      leaderPositionId: null,
      targetHeads: heads,
      targetCost: 8_000_000,
    })
    const moved = tradeTargetMove({
      fromTarget: target('Go-to-Market', 40),
      toTarget: target('Silicon Engineering', 40),
      quote: q,
      fiscalYear: 'FY27',
      proration: 'full-month',
      firstOpenMonth: '2026-10',
    })
    expect(moved.from.targetHeads).toBe(39)
    expect(moved.to.targetHeads).toBe(48)
    // In-year band (G3): the give seat from 1 Nov (5/12), the 8 get seats from 1 Jan (3/12).
    expect(moved.from.targetCost).toBeCloseTo(8_000_000 - 287_400 * (5 / 12), 2)
    expect(moved.to.targetCost).toBeCloseTo(8_000_000 + 8 * 33_859.2 * (3 / 12), 2)
  })
})

describe('T1 applied on the business date', () => {
  it('gives the trade’s seats the approval date (the as-of date), not the wall clock', () => {
    const req = { ...T1_REQUEST, steps: [waitingOn('hrbp', HRBP.personId)] }
    const out = ok(transition(req, { kind: 'approve' }, HRBP, BUSINESS, tctx({ working: T1_WORKING }), WALL))
    const rows = out.effects.flatMap((e) => (e.kind === 'position' ? [e.change.row] : []))
    expect(rows.length).toBeGreaterThan(1)
    for (const r of rows) if (r.status === 'Planned') expect(r.effectiveDate).toBe('2026-09-30')
    for (const e of out.audit) expect(e.at).toBe(WALL)
  })
})
