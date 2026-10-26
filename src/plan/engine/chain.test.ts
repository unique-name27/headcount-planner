/**
 * The approval chain (docs/PLAN.md 10.2): CHAIN_RULES as data, fixtures CH1 to CH5, and each routing
 * rule PLAN 16.2 lists: self-approval, double role, like-for-like backfill, the threshold, Director+,
 * freeze and envelope exceptions, and out of plan. The trade chains of 11.7 (T1 to T6) are in
 * trade.test.ts; "on behalf" is in requests.test.ts.
 */
import { describe, expect, it } from 'vitest'
import type { HcRequest, Step } from '../types'
import { CHAIN_RULES, type ChainFacts, type ChainOrg, type ChainSeat, chainFor, outOfPlan } from './chain'
import { CH, CH5_EXPECTED, CHAIN_ORG, check, facts } from './fixtures/chain'
import { hcRequest } from './fixtures/common'
import { T6, T6_REQUEST } from './fixtures/trade'

describe('CHAIN_RULES (verbatim from docs/PLAN.md 10.2)', () => {
  it('lists the nine rules in order', () => {
    expect(CHAIN_RULES.map((r) => `${r.role}:${r.who}`)).toEqual([
      'manager:submitter-manager',
      'hrbp:unit-hrbp',
      'hrbp:receiving-unit-hrbp',
      'leader:nearest-leader',
      'leader:nearest-leader',
      'leader:giving-unit-leader',
      'leader:receiving-unit-leader',
      'finance:finance-approver',
      'finance:finance-approver',
    ])
  })

  it('keeps Start recruiting and Start date to the unit HRBP', () => {
    for (const r of CHAIN_RULES) {
      if (r.who === 'unit-hrbp') continue
      const skips = r.except?.includes('Start recruiting') && r.except.includes('Start date')
      const limited =
        r.only !== undefined && !r.only.includes('Start recruiting') && !r.only.includes('Start date')
      expect(skips || limited, `${r.role}:${r.who}`).toBe(true)
    }
  })
})

describe('chainFor', () => {
  for (const c of CH) {
    it(`${c.id}: ${c.note}`, () => {
      const steps = chainFor(c.req, { org: CHAIN_ORG, facts: c.facts })
      expect(steps.map((s) => [s.role, s.approverId])).toEqual(c.expected.map((e) => [...e]))
      expect(steps.map((s) => s.n)).toEqual(c.expected.map((_, i) => i + 1))
      for (const s of steps) {
        expect(s.decision).toBeNull()
        expect(s.at).toBeNull()
      }
    })
  }

  it('CH5: trade T6 goes to the manager, both HRBPs, both unit leaders and Finance (cross-unit)', () => {
    const facts = T6.chain?.facts
    if (!facts) throw new Error('T6 has no chain facts')
    const steps = chainFor(T6_REQUEST, { org: CHAIN_ORG, facts })
    expect(steps.map((s) => [s.role, s.approverId])).toEqual(CH5_EXPECTED.map((e) => [...e]))
    const finance = steps.find((s) => s.role === 'finance')
    expect(finance?.reasons).toContain('cross-unit')
  })
})

/* ───────────── routing rules, one by one (PLAN 16.2) ───────────── */

/** CHAIN_ORG with extra seats (and their holders) and any seat replaced. */
function orgWith(extra: readonly ChainSeat[], over: Partial<ChainOrg> = {}): ChainOrg {
  const seats = new Map(CHAIN_ORG.seats)
  const seatsOf = new Map(CHAIN_ORG.seatsOf)
  for (const s of extra) {
    seats.set(s.positionId, s)
    if (s.holderId) seatsOf.set(s.holderId, [s.positionId])
  }
  return { ...CHAIN_ORG, seats, seatsOf, ...over }
}

const seat = (
  positionId: string,
  managerPositionId: string | null,
  businessUnit: string,
  level: ChainSeat['level'],
  holderId: string | null,
  leaderSeat = false,
): ChainSeat => ({ positionId, managerPositionId, businessUnit, level, leaderSeat, holderId })

const GTM = 'Go-to-Market'
const OPS = 'Operations'

/** [role, approverId] of each step. */
const route = (req: HcRequest, f: ChainFacts, org: ChainOrg = CHAIN_ORG) =>
  chainFor(req, { org, facts: f }).map((s) => [s.role, s.approverId])

const reasonsOf = (req: HcRequest, f: ChainFacts, role: Step['role'], org: ChainOrg = CHAIN_ORG) =>
  chainFor(req, { org, facts: f }).find((s) => s.role === role)?.reasons

/** A Level change on P-GTM-101 (E1110's report), in plan unless the facts say otherwise. */
const levelChange = (over: Partial<HcRequest> = {}) =>
  hcRequest('R-LC', { type: 'Level change', positionId: 'P-GTM-101', level: 'P4', ...over })

/** A Backfill of P-GTM-101 (not like-for-like unless the facts say so). */
const backfill = (over: Partial<HcRequest> = {}) =>
  hcRequest('R-BF', {
    type: 'Backfill',
    reasonCode: 'Attrition backfill',
    positionId: 'P-GTM-101',
    level: 'P3',
    location: 'San Jose',
    fte: 1,
    ...over,
  })

const inPlan = (heads = 0, cost = 0) => [check(GTM, heads, cost)]

describe('no self-approval: a step whose approver is the requester moves up', () => {
  it('the unit HRBP as requester: the HRBP step goes to the next held seat above them', () => {
    // E9001 (Go-to-Market's HRBP) sits under an HR lead seat held by E9100.
    const org = orgWith([
      seat('P-HR-LEAD', 'P-CEO', 'Executive Office', 'M1', 'E9100'),
      seat('P-HR-9001', 'P-HR-LEAD', 'Executive Office', 'P5', 'E9001'),
    ])
    const req = hcRequest('R-SR', {
      type: 'Start recruiting',
      requesterId: 'E9001',
      positionId: 'P-GTM-102',
      level: 'P5',
      location: 'San Jose',
    })
    expect(route(req, facts({ checks: inPlan() }), org)).toEqual([['hrbp', 'E9100']])
    // With no seat above them in the org there is nobody to give it to: the step is left out.
    expect(route(req, facts({ checks: inPlan() }))).toEqual([])
  })

  it('the Finance approver as requester: no finance step when there is nobody above them', () => {
    // E8001 holds no seat here: no manager step and no finance step.
    const req = hcRequest('R-FIN', { requesterId: 'E8001', level: 'P3', location: 'San Jose', fte: 1 })
    expect(route(req, facts({ checks: inPlan(1) }))).toEqual([['hrbp', 'E9001']])
  })

  it('the Finance approver as requester with a seat: the finance step moves up and merges with the manager step', () => {
    const org = orgWith([
      seat('P-CFO', 'P-CEO', 'Executive Office', 'E2', 'E8100', true),
      seat('P-FIN', 'P-CFO', 'Executive Office', 'M1', 'E8001'),
    ])
    const req = hcRequest('R-FIN', { requesterId: 'E8001', level: 'P3', location: 'San Jose', fte: 1 })
    const steps = chainFor(req, { org, facts: facts({ checks: inPlan(1) }) })
    expect(steps.map((s) => [s.role, s.approverId])).toEqual([
      ['hrbp', 'E9001'],
      ['finance', 'E8100'],
    ])
    expect(steps[1].reasons).toEqual(['new-role', 'always'])
  })

  it('a unit leader as requester: the leader step goes to the next leader seat above, skipping a seat that is not one', () => {
    // Operations' VP E3000 reports through a chief of staff seat (M1, held by E0500, not a leader).
    const org = orgWith([
      seat('P-OPS-COS', 'P-CEO', 'Executive Office', 'M1', 'E0500'),
      seat('P-OPS-VP', 'P-OPS-COS', OPS, 'E1', 'E3000', true),
    ])
    const req = hcRequest('R-MOVE', {
      type: 'Transfer',
      reasonCode: 'Restructure',
      requesterId: 'E3000',
      positionId: 'P-OPS-DIR2',
      managerPositionId: 'P-OPS-VP',
      businessUnit: OPS,
      department: null,
      transfer: {
        kind: 'internal',
        personId: 'E3001',
        fromPositionId: 'P-OPS-DIR2',
        toManagerPositionId: null,
        toPositionId: 'P-GTM-102',
        effectiveDate: '2026-11-01',
        moveBudget: false,
      },
    })
    const f = facts({ checks: [check(OPS, -1, 0), check(GTM, 0, 0)] })
    expect(route(req, f, org)).toEqual([
      ['manager', 'E0500'],
      ['hrbp', 'E9003'],
      ['hrbp', 'E9001'],
      ['leader', 'E0001'],
      ['leader', 'E1000'],
    ])
  })
})

describe('one person on two steps keeps the later step only, with the reasons of both', () => {
  it('E1120 on a Backfill over the threshold: the manager is also the nearest leader', () => {
    const req = backfill({
      requesterId: 'E1120',
      managerPositionId: 'P-GTM-SRM',
      positionId: 'P-GTM-MGR3',
      level: 'M1',
    })
    const steps = chainFor(req, {
      org: CHAIN_ORG,
      facts: facts({ bandEstimateUsd: 300_000, checks: inPlan() }),
    })
    expect(steps.map((s) => [s.n, s.role, s.approverId])).toEqual([
      [1, 'hrbp', 'E9001'],
      [2, 'leader', 'E1100'],
    ])
    expect(steps[1].reasons).toContain('always')
    expect(steps[1].reasons).toContain('band-estimate-over-threshold')
  })
})

describe('in-plan like-for-like backfills stop at the HRBP', () => {
  it('over the threshold and in plan: manager and HRBP, no leader', () => {
    const f = facts({ bandEstimateUsd: 300_000, likeForLikeBackfill: true, checks: inPlan() })
    expect(route(backfill(), f)).toEqual([
      ['manager', 'E1120'],
      ['hrbp', 'E9001'],
    ])
    // Not like-for-like: the threshold adds the leader.
    expect(route(backfill(), { ...f, likeForLikeBackfill: false })).toEqual([
      ['manager', 'E1120'],
      ['hrbp', 'E9001'],
      ['leader', 'E1100'],
    ])
  })

  it('out of plan (asks 40, effect +1): the leader step comes back', () => {
    const f = facts({ bandEstimateUsd: 300_000, likeForLikeBackfill: true, checks: [check(GTM, 1, 0, 40)] })
    expect(route(backfill(), f)).toEqual([
      ['manager', 'E1120'],
      ['hrbp', 'E9001'],
      ['leader', 'E1100'],
    ])
    expect(reasonsOf(backfill(), f, 'leader')).toEqual(['band-estimate-over-threshold', 'out-of-plan'])
  })
})

describe('the leader threshold, Director+ and the Finance triggers', () => {
  it('band estimate strictly above $250,000', () => {
    expect(route(levelChange(), facts({ bandEstimateUsd: 250_000, checks: inPlan() }))).toEqual([
      ['manager', 'E1120'],
      ['hrbp', 'E9001'],
    ])
    expect(
      reasonsOf(levelChange(), facts({ bandEstimateUsd: 250_000.01, checks: inPlan() }), 'leader'),
    ).toEqual(['band-estimate-over-threshold'])
  })

  it('Director+ by level: a New role at M2 adds the leader', () => {
    const req = hcRequest('R-M2', { level: 'M2', location: 'San Jose', fte: 1 })
    expect(route(req, facts({ checks: inPlan(1) }))).toEqual([
      ['manager', 'E1120'],
      ['hrbp', 'E9001'],
      ['leader', 'E1100'],
      ['finance', 'E8001'],
    ])
    expect(reasonsOf(req, facts({ checks: inPlan(1) }), 'leader')).toEqual(['director-plus'])
    // The same ask at P3 takes no leader step.
    expect(route({ ...req, level: 'P3' }, facts({ checks: inPlan(1) }))).toEqual([
      ['manager', 'E1120'],
      ['hrbp', 'E9001'],
      ['finance', 'E8001'],
    ])
  })

  it('Director+ by seat: a leader seat at P3 adds the leader', () => {
    const org = orgWith([seat('P-GTM-LP3', 'P-GTM-MGR', GTM, 'P3', 'E1112', true)])
    const req = levelChange({ positionId: 'P-GTM-LP3', level: 'P3', fte: 0.8 })
    expect(route(req, facts({ checks: inPlan() }), org)).toEqual([
      ['manager', 'E1120'],
      ['hrbp', 'E9001'],
      ['leader', 'E1100'],
    ])
    expect(reasonsOf(req, facts({ checks: inPlan() }), 'leader', org)).toEqual(['director-plus'])
    expect(route(req, facts({ checks: inPlan() }))).toEqual([
      ['manager', 'E1120'],
      ['hrbp', 'E9001'],
    ])
  })

  it('a freeze exception adds Finance, after the normal chain', () => {
    const exception = { freezeId: 'FZ-1', reason: 'A customer launch needs this seat.' }
    expect(route(backfill({ exception }), facts({ checks: inPlan() }))).toEqual([
      ['manager', 'E1120'],
      ['hrbp', 'E9001'],
      ['finance', 'E8001'],
    ])
    expect(reasonsOf(backfill({ exception }), facts({ checks: inPlan() }), 'finance')).toEqual([
      'freeze-exception',
    ])
    expect(route(backfill(), facts({ checks: inPlan() }))).toEqual([
      ['manager', 'E1120'],
      ['hrbp', 'E9001'],
    ])
    // A New role carries both Finance reasons on one step.
    const req = hcRequest('R-NR', { level: 'P3', location: 'San Jose', fte: 1, exception })
    expect(reasonsOf(req, facts({ checks: inPlan(1) }), 'finance')).toEqual(['new-role', 'freeze-exception'])
  })

  it('an envelope exception adds Finance', () => {
    const move = CH.find((c) => c.id === 'CH3')!
    expect(route(move.req, { ...move.facts, envelopeException: true })).toEqual([
      ['manager', 'E1120'],
      ['hrbp', 'E9001'],
      ['finance', 'E8001'],
    ])
    expect(reasonsOf(move.req, { ...move.facts, envelopeException: true }, 'finance')).toEqual([
      'envelope-exception',
    ])
  })
})

describe('out of plan', () => {
  const ctx = (f: ChainFacts) => ({ org: CHAIN_ORG, facts: f })
  const req = levelChange()

  it('no org up to the unit has a target', () => {
    const f = facts({
      checks: [{ org: null, target: null, asks: { heads: 0, cost: null }, effect: { heads: 0, cost: 0 } }],
    })
    expect(outOfPlan(req, ctx(f))).toBe(true)
    expect(reasonsOf(req, f, 'leader')).toEqual(['out-of-plan'])
  })

  it('heads: asks 39 + 1 at a target of 40 stays in plan; asks 40 + 1 is out', () => {
    expect(outOfPlan(req, ctx(facts({ checks: [check(GTM, 1, 0, 39)] })))).toBe(false)
    expect(route(req, facts({ checks: [check(GTM, 1, 0, 39)] }))).toEqual([
      ['manager', 'E1120'],
      ['hrbp', 'E9001'],
    ])
    expect(outOfPlan(req, ctx(facts({ checks: [check(GTM, 1, 0, 40)] })))).toBe(true)
    expect(reasonsOf(req, facts({ checks: [check(GTM, 1, 0, 40)] }), 'leader')).toEqual(['out-of-plan'])
  })

  it('cost: asks $5,000,000 + $3,000,001 is over a target of $8,000,000; + $3,000,000 is not', () => {
    expect(outOfPlan(req, ctx(facts({ checks: [check(GTM, 0, 3_000_001)] })))).toBe(true)
    expect(outOfPlan(req, ctx(facts({ checks: [check(GTM, 0, 3_000_000)] })))).toBe(false)
    expect(reasonsOf(req, facts({ checks: [check(GTM, 0, 3_000_001)] }), 'leader')).toEqual(['out-of-plan'])
  })

  it('cost null on the asks (not a union of atoms, or "—") compares heads only', () => {
    const headsOnly = { ...check(GTM, 0, 3_000_001), asks: { heads: 30, cost: null } }
    expect(outOfPlan(req, ctx(facts({ checks: [headsOnly] })))).toBe(false)
    expect(
      outOfPlan(
        req,
        ctx(
          facts({
            checks: [
              { ...headsOnly, asks: { heads: 40, cost: null }, effect: { heads: 1, cost: 3_000_001 } },
            ],
          }),
        ),
      ),
    ).toBe(true)
  })

  it('any org a request touches can put it out of plan', () => {
    expect(outOfPlan(req, ctx(facts({ checks: [check(GTM, 0, 0), check(OPS, 1, 0, 40)] })))).toBe(true)
    expect(outOfPlan(req, ctx(facts({ checks: [] })))).toBe(false)
  })

  it('raised outside an open cycle while its fiscal year is Locked', () => {
    const f = facts({ checks: inPlan(), cycleLocked: true })
    expect(outOfPlan(backfill(), ctx(f))).toBe(true)
    expect(route(backfill(), f)).toEqual([
      ['manager', 'E1120'],
      ['hrbp', 'E9001'],
      ['leader', 'E1100'],
    ])
    expect(reasonsOf(backfill(), f, 'leader')).toEqual(['out-of-plan'])
    expect(route(backfill(), { ...f, cycleLocked: false })).toEqual([
      ['manager', 'E1120'],
      ['hrbp', 'E9001'],
    ])
  })
})
