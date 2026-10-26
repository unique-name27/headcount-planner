/**
 * The planning cycle (docs/PLAN.md 10.3, 15.1 R6 to R8, change C10): ranking, the cut line, stage
 * moves and refusals, lock outcomes, who has not submitted and the "Copy note" text. G1's cut line is
 * in targets.test.ts.
 */
import { describe, expect, it } from 'vitest'
import type { Actor, Cycle, HcRequest } from '../types'
import {
  type CycleAction,
  copyNote,
  cutLine,
  cycleTransition,
  defaultCutAfter,
  lockOutcomes,
  notSubmitted,
  type RankedAsk,
  rankAsks,
  stageDone,
} from './cycle'
import { hcRequest } from './fixtures/common'

const AT = '2026-10-01T09:00'
const FINANCE: Actor = { personId: 'E8001', name: 'Finance approver', mode: 'finance' }
const HRBP: Actor = { personId: 'E9002', name: 'SE HRBP', mode: 'hrbp' }
const LEADER: Actor = { personId: 'E2000', name: 'SE leader', mode: 'leader' }
const MANAGER: Actor = { personId: 'E2110', name: 'SE manager', mode: 'manager' }

const ask = (id: string, over: Partial<HcRequest> = {}): HcRequest =>
  hcRequest(id, { cycleId: 'cyc-fy28', businessUnit: 'Silicon Engineering', ...over })

describe('rankAsks', () => {
  const requests = [
    ask('R-3', { requesterId: 'E-B', priority: 1, submittedAt: '2026-10-03T09:00' }),
    ask('R-1', { requesterId: 'E-A', priority: 1, submittedAt: '2026-10-02T09:00' }),
    ask('R-2', { requesterId: 'E-A', priority: 2, submittedAt: '2026-10-01T09:00' }),
    ask('R-4', { requesterId: 'E-B', priority: 2, submittedAt: '2026-10-01T09:00' }),
    ask('R-5', { requesterId: 'E-A', priority: 2, submittedAt: '2026-10-01T09:00', state: 'Draft' }),
    ask('R-6', { requesterId: 'E-A', priority: 3, cycleId: 'cyc-other' }),
    ask('R-0', { requesterId: 'E-C', priority: 2, submittedAt: '2026-10-01T09:00' }),
  ]

  it('orders by priority, then submittedAt, then requestId; only pending asks of the cycle', () => {
    const ranked = rankAsks(
      requests,
      'cyc-fy28',
      () => 1,
      () => 0,
    )
    expect(ranked.map((r) => r.requestId)).toEqual(['R-1', 'R-3', 'R-0', 'R-2', 'R-4'])
    expect(ranked[0]).toEqual({ requestId: 'R-1', requesterId: 'E-A', priority: 1, heads: 1, bandUsd: 0 })
  })

  it('follows the HRBP’s order first; asks it does not list follow in the default order', () => {
    const ranked = rankAsks(
      requests,
      'cyc-fy28',
      () => 1,
      () => 0,
      ['R-4', 'R-2'],
    )
    expect(ranked.map((r) => r.requestId)).toEqual(['R-4', 'R-2', 'R-1', 'R-3', 'R-0'])
  })
})

describe('cut line', () => {
  const ranked: RankedAsk[] = [
    { requestId: 'A', requesterId: 'x', priority: 1, heads: 2, bandUsd: 100 },
    { requestId: 'B', requesterId: 'x', priority: 2, heads: 1, bandUsd: 50 },
    { requestId: 'C', requesterId: 'y', priority: 1, heads: 3, bandUsd: 150 },
    { requestId: 'D', requesterId: 'y', priority: 2, heads: 1, bandUsd: 40 },
  ]

  it('the default falls after the longest run that fits the room', () => {
    expect(defaultCutAfter(ranked, 4)).toBe(3)
    expect(defaultCutAfter(ranked, 6)).toBe(6)
    expect(defaultCutAfter(ranked, 100)).toBe(7)
    expect(defaultCutAfter(ranked, 0)).toBe(0)
    expect(defaultCutAfter(ranked, -5)).toBe(0)
  })

  it('splits heads and in-year band estimate above and below', () => {
    expect(cutLine(ranked, 3)).toEqual({
      afterHeads: 3,
      above: ['A', 'B'],
      below: ['C', 'D'],
      headsAbove: 3,
      headsBelow: 4,
      bandAbove: 150,
      bandBelow: 190,
    })
  })
})

describe('cycleTransition', () => {
  const dates: Cycle['dates'] = {
    asksDue: '2026-10-16',
    hrbpReviewDue: '2026-10-30',
    leaderReviewDue: '2026-11-13',
    financeReviewDue: '2026-11-27',
  }
  const step = (c: Cycle | null, action: CycleAction, actor: Actor): Cycle => {
    const r = cycleTransition(c, action, actor, AT)
    if ('refused' in r) throw new Error(r.refused)
    return r.cycle
  }
  const refusal = (c: Cycle | null, action: CycleAction, actor: Actor): string | null => {
    const r = cycleTransition(c, action, actor, AT)
    return 'refused' in r ? r.refused : null
  }
  const open = () => step(null, { kind: 'open', cycleId: 'cyc-fy28', fiscalYear: 'FY28', dates }, FINANCE)

  it('Finance opens it and sets dates; nobody else does', () => {
    expect(refusal(null, { kind: 'open', cycleId: 'c', fiscalYear: 'FY28', dates }, HRBP)).toBe(
      'Finance opens the planning cycle.',
    )
    const c = open()
    expect(c).toMatchObject({
      stage: 'Open for asks',
      openedBy: 'E8001',
      hrbpDone: [],
      leaderDone: [],
      cutLines: [],
    })
    const r = cycleTransition(
      null,
      { kind: 'open', cycleId: 'cyc-fy28', fiscalYear: 'FY28', dates },
      FINANCE,
      AT,
    )
    if ('refused' in r) throw new Error(r.refused)
    expect(r.audit.map((a) => [a.object, a.field, a.by])).toEqual([
      ['cycle', 'stage', 'E8001'],
      ['cycle', 'dates', 'E8001'],
    ])
    expect(refusal(c, { kind: 'open', cycleId: 'x', fiscalYear: 'FY28', dates }, FINANCE)).toMatch(
      /already open/,
    )
    expect(refusal(c, { kind: 'dates', dates }, HRBP)).toBe('Finance sets the cycle dates.')
    expect(refusal(c, { kind: 'advance' }, MANAGER)).toBe('Finance moves the cycle to its next stage.')
  })

  it('HRBPs finish their units, leaders their orgs, Finance moves the stages and locks', () => {
    let c = step(open(), { kind: 'advance' }, FINANCE)
    expect(c.stage).toBe('HRBP review')
    expect(refusal(c, { kind: 'advance', leaderPositionId: 'P-SE-SVP' }, LEADER)).toBe(
      'Leader review is not under way.',
    )
    expect(refusal(c, { kind: 'advance', businessUnit: 'Silicon Engineering' }, LEADER)).toMatch(/Each HRBP/)
    c = step(c, { kind: 'advance', businessUnit: 'Silicon Engineering' }, HRBP)
    expect(c.hrbpDone).toEqual(['Silicon Engineering'])
    expect(refusal(c, { kind: 'advance', businessUnit: 'Silicon Engineering' }, HRBP)).toMatch(
      /already finished/,
    )
    expect(stageDone(c, ['Silicon Engineering', 'Go-to-Market'], [])).toBe(false)
    c = step(c, { kind: 'advance', businessUnit: 'Go-to-Market' }, { ...HRBP, personId: 'E9001' })
    expect(stageDone(c, ['Silicon Engineering', 'Go-to-Market'], [])).toBe(true)
    c = step(c, { kind: 'advance' }, FINANCE)
    expect(c.stage).toBe('Leader review')
    c = step(c, { kind: 'advance', leaderPositionId: 'P-SE-SVP' }, LEADER)
    expect(stageDone(c, [], ['P-SE-SVP'])).toBe(true)
    expect(refusal(c, { kind: 'lock' }, FINANCE)).toBe('Finance locks the cycle from Finance review.')
    c = step(c, { kind: 'advance' }, FINANCE)
    expect(c.stage).toBe('Finance review')
    expect(refusal(c, { kind: 'advance' }, FINANCE)).toBe('Lock the cycle or return it.')
    expect(refusal(c, { kind: 'lock' }, HRBP)).toBe('Finance locks the planning cycle.')
    c = step(c, { kind: 'lock' }, FINANCE)
    expect(c).toMatchObject({ stage: 'Locked', lockedAt: AT, lockedBy: 'E8001' })
    expect(refusal(c, { kind: 'cut', businessUnit: 'Silicon Engineering', afterHeads: 3 }, HRBP)).toBe(
      'The FY28 cycle is locked.',
    )
  })

  it('a return goes back only, and clears what was finished from that stage on', () => {
    let c = step(open(), { kind: 'advance' }, FINANCE)
    c = step(c, { kind: 'advance', businessUnit: 'Silicon Engineering' }, HRBP)
    c = step(c, { kind: 'advance' }, FINANCE)
    expect(refusal(c, { kind: 'return', to: 'Finance review' }, FINANCE)).toBe(
      'A cycle returns only to an earlier stage.',
    )
    expect(refusal(c, { kind: 'return', to: 'HRBP review' }, LEADER)).toMatch(/^Finance returns/)
    const back = step(c, { kind: 'return', to: 'HRBP review' }, FINANCE)
    expect(back).toMatchObject({ stage: 'HRBP review', hrbpDone: [], leaderDone: [] })
  })

  it('HRBPs, leaders and Finance set a unit’s cut line; managers do not', () => {
    let c = open()
    expect(refusal(c, { kind: 'cut', businessUnit: 'Silicon Engineering', afterHeads: 40 }, MANAGER)).toMatch(
      /set the cut line/,
    )
    expect(refusal(c, { kind: 'cut', businessUnit: 'Silicon Engineering', afterHeads: 1.5 }, HRBP)).toMatch(
      /whole number/,
    )
    c = step(c, { kind: 'cut', businessUnit: 'Silicon Engineering', afterHeads: 40 }, HRBP)
    c = step(c, { kind: 'cut', businessUnit: 'Silicon Engineering', afterHeads: 38 }, LEADER)
    expect(c.cutLines).toEqual([{ businessUnit: 'Silicon Engineering', afterHeads: 38 }])
  })
})

describe('lockOutcomes', () => {
  const ranked = (prefix: string, n: number): RankedAsk[] =>
    Array.from({ length: n }, (_, i) => ({
      requestId: `${prefix}-${i + 1}`,
      requesterId: 'x',
      priority: i + 1,
      heads: 1,
      bandUsd: 0,
    }))
  const cycle = {
    cycleId: 'cyc-fy28',
    fiscalYear: 'FY28',
    stage: 'Locked',
    openedAt: AT,
    openedBy: 'E8001',
    dates: { asksDue: '2026-10-16', hrbpReviewDue: null, leaderReviewDue: null, financeReviewDue: null },
    hrbpDone: [],
    leaderDone: [],
    cutLines: [{ businessUnit: 'Silicon Engineering', afterHeads: 40 }],
    lockedAt: AT,
    lockedBy: 'E8001',
  } satisfies Cycle

  it('approves above each unit’s line and rejects below; a unit with no line has nothing cut', () => {
    const out = lockOutcomes(
      cycle,
      new Map([
        ['Silicon Engineering', ranked('SE', 58)],
        ['Go-to-Market', ranked('GTM', 3)],
      ]),
    )
    expect(out.approved).toHaveLength(43)
    expect(out.approved.slice(0, 40)).toEqual(ranked('SE', 40).map((a) => a.requestId))
    expect(out.approved.slice(40)).toEqual(['GTM-1', 'GTM-2', 'GTM-3'])
    expect(out.rejected).toEqual(
      ranked('SE', 58)
        .slice(40)
        .map((a) => a.requestId),
    )
  })
})

describe('who has not submitted, and the note', () => {
  it('a draft, withdrawn or other cycle’s ask does not count as submitted', () => {
    const requests = [
      ask('R-1', { requesterId: 'E-A' }),
      ask('R-2', { requesterId: 'E-B', state: 'Draft' }),
      ask('R-3', { requesterId: 'E-C', state: 'Withdrawn' }),
      ask('R-4', { requesterId: 'E-D', cycleId: 'cyc-other' }),
      ask('R-5', { requesterId: 'E-E', state: 'Approved' }),
    ]
    expect(notSubmitted(['E-A', 'E-B', 'E-C', 'E-D', 'E-E', 'E-B'], requests, 'cyc-fy28')).toEqual([
      'E-B',
      'E-C',
      'E-D',
    ])
  })

  it('"Copy note" asks plainly (no nagging verbs)', () => {
    const note = copyNote('FY28', '2026-10-16')
    expect(note).toBe('Could you send your ranked asks for FY28 by 16 Oct?')
    expect(note).not.toMatch(/remind|chase|nag|ping|hound|unblock|!/i)
  })
})
