/**
 * Chain fixtures (docs/PLAN.md 10.2, 10.5, 11.4 and 11.7).
 *
 * The org (as of 30 Sep 2026): a CEO; Go-to-Market (SVP E1000, director E1100, senior manager E1120
 * above manager E1110, the usual requester); Silicon Engineering (SVP E2000, director E2100, manager
 * E2110); Operations (VP E3000, a Planned Director seat). HRBPs E9001 (Go-to-Market), E9002 (Silicon
 * Engineering), E9003 (Operations); Finance approver E8001; leader threshold $250,000.
 *
 * - CH1: a Start recruiting request on a Planned P5 San Jose seat, with a Locked FY27 cycle record,
 *   gives [hrbp].
 * - CH2: a Start date request on a Planned Director seat in a unit with no targets gives [hrbp].
 * - CH3: a same-unit position move gives [manager, hrbp].
 * - CH4: a cross-unit internal move gives [manager, from-unit HRBP, to-unit HRBP, from-unit leader,
 *   to-unit leader].
 * - CH5: trade T6 gives [manager, giving HRBP, receiving HRBP, giving-unit leader, receiving-unit
 *   leader, Finance] (trade.ts fixtures hold T6's quote).
 *
 * In the 11.7 chain context every org a trade touches has an FY27 target of 40 heads and $8,000,000,
 * with guarded asks of 30 heads and $5,000,000 before the quote, and FY27 has no cycle record.
 */
import type { Level, StepRoleCode } from '../../types'
import type { ChainFacts, ChainOrg, ChainSeat, PlanCheck } from '../chain'
import { hcRequest } from './common'

const s = (
  positionId: string,
  managerPositionId: string | null,
  businessUnit: string,
  level: Level,
  holderId: string | null,
  leaderSeat = level === 'M2' || level.startsWith('E'),
): [string, ChainSeat] => [
  positionId,
  { positionId, managerPositionId, businessUnit, level, leaderSeat, holderId },
]

const GTM = 'Go-to-Market'
const SE = 'Silicon Engineering'
const OPS = 'Operations'

export const CHAIN_ORG: ChainOrg = {
  seats: new Map<string, ChainSeat>([
    s('P-CEO', null, 'Executive Office', 'E3', 'E0001'),
    s('P-GTM-SVP', 'P-CEO', GTM, 'E2', 'E1000'),
    s('P-GTM-DIR', 'P-GTM-SVP', GTM, 'M2', 'E1100'),
    s('P-GTM-SRM', 'P-GTM-DIR', GTM, 'M1', 'E1120'),
    s('P-GTM-MGR', 'P-GTM-SRM', GTM, 'M1', 'E1110'),
    s('P-GTM-MGR3', 'P-GTM-SRM', GTM, 'M1', 'E1130'),
    s('P-GTM-101', 'P-GTM-MGR', GTM, 'P3', 'E1111'),
    s('P-GTM-102', 'P-GTM-MGR', GTM, 'P5', null),
    s('P-SE-SVP', 'P-CEO', SE, 'E2', 'E2000'),
    s('P-SE-DIR', 'P-SE-SVP', SE, 'M2', 'E2100'),
    s('P-SE-MGR', 'P-SE-DIR', SE, 'M1', 'E2110'),
    s('P-SE-201', 'P-SE-MGR', SE, 'P4', null),
    s('P-OPS-VP', 'P-CEO', OPS, 'E1', 'E3000'),
    s('P-OPS-DIR2', 'P-OPS-VP', OPS, 'M2', null),
  ]),
  seatsOf: new Map<string, readonly string[]>([
    ['E0001', ['P-CEO']],
    ['E1000', ['P-GTM-SVP']],
    ['E1100', ['P-GTM-DIR']],
    ['E1120', ['P-GTM-SRM']],
    ['E1110', ['P-GTM-MGR']],
    ['E1130', ['P-GTM-MGR3']],
    ['E1111', ['P-GTM-101']],
    ['E2000', ['P-SE-SVP']],
    ['E2100', ['P-SE-DIR']],
    ['E2110', ['P-SE-MGR']],
    ['E3000', ['P-OPS-VP']],
  ]),
  units: new Map([
    [GTM, { hrbpId: 'E9001', leaderId: 'E1000' }],
    [SE, { hrbpId: 'E9002', leaderId: 'E2000' }],
    [OPS, { hrbpId: 'E9003', leaderId: 'E3000' }],
    ['Executive Office', { hrbpId: 'E9004', leaderId: 'E0001' }],
  ]),
  financeApproverId: 'E8001',
  leaderThresholdUsd: 250_000,
}

/** The 11.7 chain context's check for one org: target 40 heads and $8,000,000, asks 30 and $5,000,000 before the quote. */
export const check = (org: string, heads: number, cost: number, asksHeads = 30): PlanCheck => ({
  org,
  target: { heads: 40, cost: 8_000_000 },
  asks: { heads: asksHeads, cost: 5_000_000 },
  effect: { heads, cost },
})

/** Facts with nothing out of plan. */
export const facts = (over: Partial<ChainFacts> = {}): ChainFacts => ({
  bandEstimateUsd: null,
  checks: [],
  cycleLocked: false,
  likeForLikeBackfill: false,
  envelopeException: false,
  ...over,
})

export interface ChainCase {
  id: string
  note: string
  req: ReturnType<typeof hcRequest>
  facts: ChainFacts
  /** [role, approverId] for each step, in order. */
  expected: readonly (readonly [StepRoleCode, string])[]
}

export const CH: readonly ChainCase[] = [
  {
    id: 'CH1',
    note: 'Start recruiting on a Planned P5 San Jose seat, with a Locked FY27 cycle record: the unit HRBP only',
    req: hcRequest('R-CH1', {
      type: 'Start recruiting',
      positionId: 'P-GTM-102',
      managerPositionId: 'P-GTM-MGR',
      level: 'P5',
      location: 'San Jose',
      fte: 1,
      startDate: '2026-10-15',
    }),
    facts: facts({ bandEstimateUsd: 287_400, checks: [check(GTM, 0, 0)], cycleLocked: true }),
    expected: [['hrbp', 'E9001']],
  },
  {
    id: 'CH2',
    note: 'Start date on a Planned Director seat in a unit with no targets: the unit HRBP only',
    req: hcRequest('R-CH2', {
      type: 'Start date',
      requesterId: 'E3000',
      positionId: 'P-OPS-DIR2',
      managerPositionId: 'P-OPS-VP',
      businessUnit: OPS,
      department: null,
      level: 'M2',
      location: 'San Jose',
      fte: 1,
      startDate: '2027-02-01',
    }),
    facts: facts({
      bandEstimateUsd: 394_400,
      checks: [{ org: null, target: null, asks: { heads: 0, cost: null }, effect: { heads: 0, cost: 0 } }],
    }),
    expected: [['hrbp', 'E9003']],
  },
  {
    id: 'CH3',
    note: 'a same-unit position move: the requester’s manager and the unit HRBP',
    req: hcRequest('R-CH3', {
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
      },
    }),
    facts: facts({ checks: [check(GTM, 0, 0)] }),
    expected: [
      ['manager', 'E1120'],
      ['hrbp', 'E9001'],
    ],
  },
  {
    id: 'CH4',
    note: 'a cross-unit internal move: manager, both HRBPs, both unit leaders',
    req: hcRequest('R-CH4', {
      type: 'Transfer',
      reasonCode: 'Restructure',
      positionId: 'P-GTM-101',
      managerPositionId: 'P-GTM-MGR',
      transfer: {
        kind: 'internal',
        personId: 'E1111',
        fromPositionId: 'P-GTM-101',
        toManagerPositionId: null,
        toPositionId: 'P-SE-201',
        effectiveDate: '2026-11-01',
        moveBudget: false,
      },
    }),
    facts: facts({ checks: [check(GTM, -1, 0), check(SE, 0, 0)] }),
    expected: [
      ['manager', 'E1120'],
      ['hrbp', 'E9001'],
      ['hrbp', 'E9002'],
      ['leader', 'E1000'],
      ['leader', 'E2000'],
    ],
  },
]

/** CH5 is trade T6's chain (its request and quote live in fixtures/trade.ts). */
export const CH5_EXPECTED: readonly (readonly [StepRoleCode, string])[] = [
  ['manager', 'E1120'],
  ['hrbp', 'E9001'],
  ['hrbp', 'E9002'],
  ['leader', 'E1000'],
  ['leader', 'E2000'],
  ['finance', 'E8001'],
]
