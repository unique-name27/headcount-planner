/**
 * Person-level rules (docs/PLAN.md 8.4 and 16.2) on the sample's requests: Manager C sees nothing of
 * the confidential Elimination of their own seat, nor does anyone below it (rule 3), while its
 * requester, approvers and HRBP see it in full (rule 1), and an off-chain Leader and Finance see the
 * limited view (rule 2); on the within-unit position move, the moving person's manager and the org's
 * Leader off the chain see it in full (rule 2a) but no comment, Finance sees the limited view, and the
 * moving person sees nothing; approvers-only comments reach only the chain and the unit's HRBP, and
 * never Manager mode; audit rows lose `seq`, `prevHash` and `hash`, are limited or dropped with their
 * request, and read "changed" on pay fields; `hasAmount` and `managerText` (rule 5). The leak crawl
 * over these requests is wave C's (src/access/*leaks*.slow.test.ts).
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { AnalyticsContext } from '@/data/context'
import { buildContext } from '@/data/context'
import type { EffectiveLists } from '@/data/lists/types'
import { cachedSample, SAMPLE_AS_OF, type Sample } from '@/data/sample'
import { DATASET_KEYS, type DatasetKey, type PositionRow } from '@/data/schema'
import { DEFAULT_FILTERS, type PositionIndex } from '@/data/scope'
import type { SourceMeta } from '@/data/store'
import { fromRow } from '@/plan/engine/requests'
import type { AuditEntry, Comment, HcRequest } from '@/plan/types'
import { type Crawl, crawl, type Seen } from '@/testkit/crawl'
import { holding } from '@/testkit/leaks'
import { MemoryStorage } from '@/testkit/memoryStorage'
import { auditDraft, auditLog, ctxAs, personaOf, withPlanRequests } from '@/testkit/sample'
import { listsInForce } from './lists'
import { type Mode, NO_PICKS } from './modes'
import { holdingsOn, upward } from './scopes/people'
import { isLeaderSeat, leaderLevelSet } from './scopes/pickers'
import {
  AN_AMOUNT,
  auditView,
  CHANGED,
  commentVisible,
  hasAmount,
  managerText,
  requestView,
  type Viewer,
  viewerOf,
} from './visibility'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
vi.stubGlobal('localStorage', new MemoryStorage())

let sample: Sample
let sources: Record<DatasetKey, SourceMeta>
let lists: EffectiveLists
let index: PositionIndex
let holder: (seat: string) => string
let elimination: HcRequest
let move: HcRequest

/** The viewer acting as a person in a mode (HRBP: for the unit given). */
function viewer(mode: Mode, personId: string, unit?: string): Viewer {
  const ctx = buildContext({
    data: sample.datasets,
    sources,
    filters: DEFAULT_FILTERS,
    asOfOverride: null,
    today: SAMPLE_AS_OF,
    mode,
    actingAs: { ...NO_PICKS, [mode]: { personId, name: personId, ...(unit ? { unit } : {}) } },
    versions: sample.plan.versions,
  })
  index = ctx.positionIndex
  return viewerOf(ctx, lists)
}

const request = (id: string): HcRequest => fromRow(sample.datasets.requests.find((r) => r.requestId === id)!)
const persona = (key: string) => sample.personas.find((p) => p.key === key)!

/** The holder of the nearest leader seat strictly above a seat who is not on the request's chain nor its requester. */
function offChainLeader(seat: string, r: HcRequest): string {
  const levels = leaderLevelSet(lists)
  const held = holdingsOn(sample.datasets.workers, SAMPLE_AS_OF)
  for (const id of upward(seat, index).slice(1)) {
    if (!isLeaderSeat(index.byId.get(id) as PositionRow, levels)) continue
    const h = held.holderOf.get(id)
    if (h && h !== r.requesterId && !r.steps.some((s) => s.approverId === h)) return h
  }
  throw new Error(`No off-chain leader above ${seat}`)
}

beforeAll(() => {
  sample = cachedSample()
  sources = Object.fromEntries(
    DATASET_KEYS.map((k) => [k, { kind: 'sample', rowCount: sample.datasets[k].length }]),
  ) as Record<DatasetKey, SourceMeta>
  lists = listsInForce(null, sample.datasets, sources)
  const held = holdingsOn(sample.datasets.workers, SAMPLE_AS_OF)
  holder = (seat) => {
    const h = held.holderOf.get(seat)
    if (!h) throw new Error(`Nobody holds ${seat}`)
    return h
  }
  elimination = request(sample.planted.managerCElimination)
  move = request(sample.planted.positionMove)
  viewer('hr-admin', persona('hr-admin').employeeId)
}, 60_000)

const step = (r: HcRequest, role: string) => r.steps.find((s) => s.role === role)!.approverId

describe('Manager C and the confidential Elimination of their seat (rules 1 to 3)', () => {
  it('is the planted request: an Elimination of Manager C’s own seat', () => {
    expect(elimination.type).toBe('Elimination')
    expect(elimination.positionId).toBe(persona('manager-c').positionId)
    expect(elimination.confidential).toBe(true)
  })

  it('hides it from Manager C and from everyone below their seat, in every mode but HR admin', () => {
    const c = persona('manager-c').employeeId
    for (const mode of ['manager', 'leader', 'finance', 'hrbp'] as const)
      expect(requestView(elimination, viewer(mode, c, 'Operations')), mode).toBe('none')
    const below = [...index.byId.values()].filter((r) => r.managerPositionId === elimination.positionId)
    expect(below.length).toBeGreaterThan(0)
    for (const r of below) {
      const h = holdingsOn(sample.datasets.workers, SAMPLE_AS_OF).holderOf.get(r.positionId)
      if (h) expect(requestView(elimination, viewer('manager', h)), r.positionId).toBe('none')
    }
    expect(requestView(elimination, viewer('hr-admin', c))).toBe('full')
  })

  it('shows it in full to its requester, its approvers and the unit HRBP', () => {
    expect(requestView(elimination, viewer('manager', elimination.requesterId))).toBe('full')
    expect(requestView(elimination, viewer('hrbp', step(elimination, 'hrbp'), 'Operations'))).toBe('full')
    expect(requestView(elimination, viewer('leader', step(elimination, 'leader')))).toBe('full')
  })

  it('shows Finance and an off-chain Leader inside the org only the limited view', () => {
    expect(requestView(elimination, viewer('finance', persona('finance-fpa').employeeId))).toBe('limited')
    const offChain = offChainLeader(elimination.positionId as string, elimination)
    expect(requestView(elimination, viewer('leader', offChain))).toBe('limited')
    // A leader whose org does not hold it sees nothing.
    expect(requestView(elimination, viewer('leader', persona('leader-dv-director').employeeId))).toBe('none')
    // An unrelated manager sees nothing.
    expect(requestView(elimination, viewer('manager', persona('manager-a').employeeId))).toBe('none')
  })
})

describe('the viewer', () => {
  it('reads the HRBP column of the lists the context was built with when none are given', () => {
    const hrbp = step(elimination, 'hrbp')
    const ctx = buildContext({
      data: sample.datasets,
      sources,
      filters: DEFAULT_FILTERS,
      asOfOverride: null,
      today: SAMPLE_AS_OF,
      mode: 'finance',
      actingAs: { ...NO_PICKS, finance: { personId: hrbp, name: hrbp } },
      versions: sample.plan.versions,
    })
    const v = viewerOf(ctx)
    expect([...v.hrbpUnits]).toEqual(['Operations'])
    expect(viewerOf(ctx)).toBe(v)
    expect(v.seatIds.size).toBe(1)
    for (const s of v.seatIds) expect(v.atOrAbove.has(s)).toBe(true)
    // As the unit's HRBP, rule 1 shows the Elimination in full even in Finance mode.
    expect(requestView(elimination, v)).toBe('full')
    // With nobody picked, nobody is placed.
    const none = viewerOf({ ...ctx, access: { ...ctx.access, actingAs: null } })
    expect(none).toMatchObject({ personId: null })
    expect(none.seatIds.size).toBe(0)
  })
})

describe('the within-unit position move (rule 2a)', () => {
  it('shows the move in full to the moving person’s manager and to the org’s Leader off the chain', () => {
    const t = move.transfer!
    expect(move.type).toBe('Transfer')
    expect(t.kind).toBe('position')
    const manager = holder(index.byId.get(t.fromPositionId)?.managerPositionId as string)
    const leader = offChainLeader(t.fromPositionId, move)
    const asLeader = viewer('leader', leader)
    expect(requestView(move, viewer('manager', manager))).toBe('full')
    expect(requestView(move, asLeader)).toBe('full')
    // The Leader off the chain sees no comment on it.
    const c: Comment = {
      id: 'c1',
      at: '2026-08-01T09:00:00Z',
      by: move.requesterId,
      mode: 'manager',
      text: 'Agreed with the team',
      audience: 'everyone',
    }
    expect(commentVisible(c, move, asLeader)).toBe(false)
    expect(commentVisible(c, move, viewer('hrbp', step(move, 'hrbp'), move.businessUnit))).toBe(true)
  })

  it('shows Finance the limited view even on a step it approves, and the moving person nothing', () => {
    expect(requestView(move, viewer('finance', persona('finance-fpa').employeeId))).toBe('limited')
    const onStep: HcRequest = {
      ...move,
      steps: [
        ...move.steps,
        { ...move.steps[0], n: 9, role: 'finance', approverId: persona('finance-fpa').employeeId },
      ],
    }
    expect(requestView(onStep, viewer('finance', persona('finance-fpa').employeeId))).toBe('limited')
    const mover = move.transfer!.personId
    expect(requestView(move, viewer('manager', mover))).toBe('none')
    expect(requestView(move, viewer('leader', mover))).toBe('none')
  })
})

describe('approvers-only comments (rule 5)', () => {
  const secret: Comment = {
    id: 'c2',
    at: '2026-09-01T09:00:00Z',
    by: 'E1',
    mode: 'hrbp',
    text: 'Severance is about €140,000',
    audience: 'approvers',
  }
  const open: Comment = { ...secret, id: 'c3', text: 'Timing is fine', audience: 'everyone' }
  const amount: Comment = { ...secret, id: 'c4', text: 'Offer came in at $95k', audience: 'everyone' }

  it('reach the chain and the unit HRBP only, never the requester off the chain or Manager mode', () => {
    expect(commentVisible(secret, elimination, viewer('leader', step(elimination, 'leader')))).toBe(true)
    expect(commentVisible(secret, elimination, viewer('hrbp', step(elimination, 'hrbp'), 'Operations'))).toBe(
      true,
    )
    expect(commentVisible(secret, elimination, viewer('manager', elimination.requesterId))).toBe(false)
    expect(commentVisible(secret, elimination, viewer('finance', persona('finance-fpa').employeeId))).toBe(
      false,
    )
    // Manager mode never, even on the chain.
    const asApprover: HcRequest = {
      ...elimination,
      steps: [{ ...elimination.steps[0], role: 'manager', approverId: persona('manager-a').employeeId }],
    }
    expect(commentVisible(secret, asApprover, viewer('manager', persona('manager-a').employeeId))).toBe(false)
    expect(commentVisible(secret, elimination, viewer('hr-admin', persona('hr-admin').employeeId))).toBe(true)
  })

  it('leave an Everyone comment to the full viewers, but not one with an amount in Manager mode', () => {
    expect(commentVisible(open, elimination, viewer('manager', elimination.requesterId))).toBe(true)
    expect(commentVisible(amount, elimination, viewer('manager', elimination.requesterId))).toBe(false)
    expect(commentVisible(amount, elimination, viewer('leader', step(elimination, 'leader')))).toBe(true)
    // A limited view shows no comment at all.
    expect(commentVisible(open, elimination, viewer('finance', persona('finance-fpa').employeeId))).toBe(
      false,
    )
  })
})

describe('audit rows (rule 7)', () => {
  const entry = (patch: Partial<AuditEntry> = {}): AuditEntry => ({
    seq: 7,
    at: '2026-09-10T10:00:00Z',
    by: elimination.requesterId,
    byName: 'The requester',
    mode: 'manager',
    object: 'request',
    id: elimination.requestId,
    field: 'state',
    old: 'Submitted',
    new: 'In review',
    effectiveDate: '2026-12-31',
    comment: 'Seat cut with the reorg',
    commentAudience: 'everyone',
    prevHash: 'sha256:a',
    hash: 'sha256:b',
    ...patch,
  })
  const requestOf = (e: AuditEntry) => (e.id === elimination.requestId ? elimination : null)

  it('gives HR admin the entry, hash and all', () => {
    const e = entry()
    expect(auditView(e, viewer('hr-admin', persona('hr-admin').employeeId), requestOf)).toBe(e)
  })

  it('drops an entry of a request hidden from the viewer, and one whose request is unknown', () => {
    expect(auditView(entry(), viewer('manager', persona('manager-c').employeeId), requestOf)).toBeNull()
    expect(auditView(entry(), viewer('hrbp', step(elimination, 'hrbp'), 'Operations'))).toBeNull()
  })

  it('limits an Elimination to its state, seat, title, level and org, with no name, date or comment', () => {
    const fin = viewer('finance', persona('finance-fpa').employeeId)
    const row = auditView(entry(), fin, requestOf)
    expect(row).toEqual({
      at: '2026-09-10T10:00:00Z',
      by: 'Requester',
      byName: 'Requester',
      mode: 'manager',
      object: 'request',
      id: elimination.requestId,
      field: 'state',
      old: 'Submitted',
      new: 'In review',
      effectiveDate: null,
      comment: null,
      commentAudience: null,
    })
    expect(
      auditView(entry({ by: 'E99', field: 'level', old: 'P4', new: 'P5' }), fin, requestOf),
    ).toMatchObject({
      by: 'Approver',
      byName: 'Approver',
    })
    expect(auditView(entry({ field: 'reasonCode' }), fin, requestOf)).toBeNull()
    expect(auditView(entry({ field: 'startDate' }), fin, requestOf)).toBeNull()
  })

  it('keeps no seq, prevHash or hash outside HR admin, and reads pay fields as changed', () => {
    const hrbp = viewer('hrbp', step(elimination, 'hrbp'), 'Operations')
    const row = auditView(entry(), hrbp, requestOf)!
    expect(Object.keys(row)).not.toContain('seq')
    expect(Object.keys(row)).not.toContain('prevHash')
    expect(Object.keys(row)).not.toContain('hash')
    expect(row).toMatchObject({ comment: 'Seat cut with the reorg', effectiveDate: '2026-12-31' })
    for (const field of [
      'bandEstimateUsd',
      'baseSalary',
      'offerBase',
      'standardHeadUsd',
      'usdLoaded',
      'severance',
    ])
      expect(auditView(entry({ field, old: 100, new: 120 }), hrbp, requestOf), field).toMatchObject({
        old: CHANGED,
        new: CHANGED,
      })
    // Basis-point fields show.
    expect(auditView(entry({ field: 'creditBp', old: null, new: 1104 }), hrbp, requestOf)).toMatchObject({
      new: 1104,
    })
  })

  it('reads every assumption value as changed where band estimates are hidden, whatever the field (RM-2)', () => {
    // A band midpoint's field is named 'value', like a rate's: no field name tells them apart.
    const band = auditDraft({
      object: 'assumption',
      id: 'fy27-working|band|P3|A|FY27',
      field: 'value',
      old: 95_000,
      new: 98_000,
    })
    const [e] = auditLog([band])
    const manager = viewer('manager', persona('manager-a').employeeId)
    expect(auditView(e, manager)).toMatchObject({ old: CHANGED, new: CHANGED })
    // M3 review SP-14 (11.5's Audit row): a band midpoint reads "changed" in every mode but HR admin.
    const hrbp = viewer('hrbp', step(elimination, 'hrbp'), 'Operations')
    expect(auditView(e, hrbp)).toMatchObject({ old: CHANGED, new: CHANGED })
    // Control: a rate's edit shows where band estimates show; HR admin reads every value.
    const [rate] = auditLog([{ ...band, id: 'fy27-working|attrition|Operations|*', old: 0.1, new: 0.12 }])
    expect(auditView(rate, hrbp)).toMatchObject({ old: 0.1, new: 0.12 })
    expect(auditView(e, viewer('hr-admin', persona('hr-admin').employeeId))).toMatchObject({
      old: 95_000,
      new: 98_000,
    })
  })

  it('reads band and standard head changes as changed outside HR admin, bp fields still showing (SP-14)', () => {
    const [band, head, minFte, bp] = auditLog([
      auditDraft({
        object: 'assumption',
        id: 'fy27-working|band||P3|San Jose|FY27',
        field: 'value',
        old: 165_000,
        new: 166_000,
      }),
      auditDraft({
        object: 'assumption',
        id: 'fy27-working|trade||standardHeadUsd',
        field: 'value',
        old: 174_000,
        new: 175_000,
      }),
      auditDraft({
        object: 'assumption',
        id: 'fy27-working|trade||minFte',
        field: 'value',
        old: 0.5,
        new: 0.25,
      }),
      auditDraft({ object: 'request', id: elimination.requestId, field: 'creditBp', old: null, new: 1104 }),
    ])
    for (const v of [
      viewer('hrbp', step(elimination, 'hrbp'), 'Operations'),
      viewer('finance', persona('finance-fpa').employeeId),
      viewer('leader', persona('leader-svp-se').employeeId),
    ]) {
      expect(auditView(band, v), v.mode).toMatchObject({ old: CHANGED, new: CHANGED })
      expect(auditView(head, v), v.mode).toMatchObject({ old: CHANGED, new: CHANGED })
      expect(auditView(minFte, v), v.mode).toMatchObject({ old: 0.5, new: 0.25 })
    }
    const fin = viewer('finance', persona('finance-fpa').employeeId)
    expect(auditView(bp, fin, () => elimination)).toBeNull()
    const admin = viewer('hr-admin', persona('hr-admin').employeeId)
    expect(auditView(head, admin)).toMatchObject({ old: 174_000, new: 175_000 })
  })

  it('hides a comment its audience does not reach, and words amounts as "an amount" in Manager mode', () => {
    const req = viewer('manager', elimination.requesterId)
    expect(auditView(entry({ commentAudience: 'approvers' }), req, requestOf)).toMatchObject({
      comment: null,
    })
    expect(auditView(entry({ comment: 'Saves €140,000 a year' }), req, requestOf)).toMatchObject({
      comment: null,
    })
    // A reason (no audience) passes through managerText.
    expect(
      auditView(entry({ comment: 'Saves €140,000 a year', commentAudience: null }), req, requestOf),
    ).toMatchObject({
      comment: `Saves ${AN_AMOUNT} a year`,
    })
  })

  it('keeps a position entry to the scope when it belongs to no request', () => {
    const hrbp = viewer('hrbp', step(elimination, 'hrbp'), 'Operations')
    const inUnit = [...index.byId.values()].find((r) => r.businessUnit === 'Operations')!.positionId
    const outside = [...index.byId.values()].find((r) => r.businessUnit === 'Corporate')!.positionId
    const pos = (id: string) =>
      entry({ object: 'position', id, field: 'level', comment: null, commentAudience: null })
    expect(auditView(pos(inUnit), hrbp)).not.toBeNull()
    expect(auditView(pos(outside), hrbp)).toBeNull()
  })
})

describe('amounts in text (rule 5)', () => {
  it('finds a currency sign, an ISO code or a number worth 1,000 or more', () => {
    for (const t of [
      '€140,000',
      'The offer is $95k',
      '95k',
      '1.2M on top',
      '140000',
      '1,000 more',
      'Paid in EUR',
      'USD 5 a day',
      '2,000 euros',
      '¥30,000',
      '₹2,500,000',
      '₪600,000',
      '3 bn',
    ])
      expect(hasAmount(t), t).toBe(true)
    for (const t of [
      '',
      '999',
      'Start moved from Jan to Mar',
      'Effective 31 Dec 2026',
      'See P-2589 and R-1025',
      'E10077 approves',
      'Cost center 1550-HSZ',
      '2026-12-31',
      '12 heads and 0.5 FTE',
      'Do not include pay, performance or health details.',
    ])
      expect(hasAmount(t), t).toBe(false)
  })

  it('replaces each amount with "an amount" in Manager mode only', () => {
    const mgr = viewer('manager', persona('manager-a').employeeId)
    const hr = viewer('hrbp', persona('hrbp-se').employeeId, 'Silicon Engineering')
    expect(managerText('Offer at €140,000, about 95k over plan', mgr)).toBe(
      'Offer at an amount, about an amount over plan',
    )
    expect(managerText('Budget 1.2M USD from 1 Jan 2027', mgr)).toBe('Budget an amount from 1 Jan 2027')
    expect(managerText('Moved start to 1 Mar 2027 for P-2589', mgr)).toBe(
      'Moved start to 1 Mar 2027 for P-2589',
    )
    expect(managerText('Offer at €140,000', hr)).toBe('Offer at €140,000')
    for (const t of ['€140,000', '$95k', '1.2M', '140000'])
      expect(hasAmount(managerText(t, mgr)), t).toBe(false)
  })

  /** Amounts as people write them in other countries, files and habits (the M2 review, RM-1). */
  const SPELLINGS = [
    'Budget holds 140.000 for this role',
    'Budget holds 140 000 for this role',
    'Budget holds 140 000 for this role',
    'Budget holds 140 000 for this role',
    "Budget holds 140'000 for this role",
    'Budget holds 140’000 for this role',
    'Offer of 14 lakh',
    'Offer of 14 lakhs agreed',
    'Offer of 14 lac',
    'Offer of 1.4 crore',
    'Offer of 2 cr',
    'Severance near 140.000,00',
    'Severance near 1.400.000',
    '140 grand',
    'INR140000',
    '140000INR',
    'the offer would be 140.000 €',
    'the offer would be 140.000€',
    '€ 1.500 more',
    'Offer 12,40,000 per year',
    '₹14,00,000',
    '1,00,00,000 in all',
    'Cut by -140,000',
    'Range 140,000-150,000',
    '140,000/yr',
    '95K over',
    '1.2 m on top',
    'Paid in EUR',
    'Level P4 140 000 base',
    'From FY27 140 000 a year',
  ]

  it('finds an amount in any common spelling: grouping, decimals, size words and codes on either side', () => {
    for (const t of SPELLINGS) expect(hasAmount(t), t).toBe(true)
  })

  /** M3 review SC-14: more size words, signs with letters glued on, and spelled-out amounts. */
  const MORE_SPELLINGS = [
    'Budget 1,2 Mio EUR',
    'Budget 1,2 Mio. EUR',
    'Pool of 5 Mrd',
    'About 3 bln in all',
    'Offer near 140 Tsd',
    'Offer CA$ 900 more',
    'Offer US$ 95,000',
    'Paid A$140,000',
    'HK$ 1.2M package',
    'two hundred thousand dollars',
    'Offer of fifty grand',
    'Two Hundred and Fifty Thousand',
    'a million dollars on top',
    'twenty-five thousand euros',
  ]

  it('finds the M3 review spellings too (SC-14)', () => {
    for (const t of MORE_SPELLINGS) expect(hasAmount(t), t).toBe(true)
    for (const t of [
      'Two heads and one FTE',
      'A thousand thanks to the team',
      'One more seat in Q3',
      'Hundreds of applicants',
      'Grand opening of the Munich site',
    ])
      expect(hasAmount(t), t).toBe(false)
  })

  it('replaces the whole of each M3 review spelling in Manager mode (SC-14)', () => {
    const mgr = viewer('manager', persona('manager-a').employeeId)
    expect(managerText('1,2 Mio EUR', mgr)).toBe(AN_AMOUNT)
    expect(managerText('CA$ 900', mgr)).toBe(AN_AMOUNT)
    expect(managerText('Offer US$ 95,000 now', mgr)).toBe(`Offer ${AN_AMOUNT} now`)
    expect(managerText('Offer of two hundred thousand dollars', mgr)).toBe(`Offer of ${AN_AMOUNT}`)
    for (const t of MORE_SPELLINGS) {
      const out = managerText(t, mgr)
      expect(hasAmount(out), `${t} -> ${out}`).toBe(false)
      expect(out, t).toContain(AN_AMOUNT)
    }
  })

  /** M3 recheck: ranges and amounts per period. */
  const RANGES = [
    '95-110k',
    'The agency range is 95-110k',
    '95000-110000',
    'budget 95000-110000',
    '95000 - 110000',
    '95000–110000',
    '95000/yr',
    'Budget is 95000/yr for this seat',
    '95000/year',
    '8000/month',
    'Rs 95000/-',
    '€95-110k',
    '$95-110k',
    '95k-110k',
    '95,000-110,000',
    '1.2-1.5M',
    '1.2-1.5 million',
    '120000/annum',
    'between 95 and 110 thousand',
    '95 to 110k',
  ]

  it('finds ranges and amounts per period, and replaces the whole range in Manager mode (M3 recheck)', () => {
    const mgr = viewer('manager', persona('manager-a').employeeId)
    for (const t of RANGES) {
      expect(hasAmount(t), t).toBe(true)
      const out = managerText(t, mgr)
      expect(hasAmount(out), `${t} -> ${out}`).toBe(false)
      expect(out, t).toContain(AN_AMOUNT)
      // No end of a range is left behind ("an amount-110k" read the second half as it was).
      expect(out.replace(/an amount/g, ''), t).not.toMatch(/[0-9]{2}/)
    }
    expect(managerText('The agency range is 95-110k', mgr)).toBe(`The agency range is ${AN_AMOUNT}`)
    expect(managerText('€95-110k', mgr)).toBe(AN_AMOUNT)
    expect(managerText('95k-110k', mgr)).toBe(AN_AMOUNT)
    expect(managerText('Budget is 95000/yr for this seat', mgr)).toBe(
      `Budget is ${AN_AMOUNT}/yr for this seat`,
    )
    // Not amounts: dates, years, codes, IDs and small ranges.
    for (const t of [
      '2026-12-31',
      '31-12-2026',
      'FY 2026-27',
      'in 2026-2027',
      'FY2026/27',
      'R-K7QM-13716',
      'P-K7QM-13716-1',
      'P-1030-1059',
      '1550-HSZ',
      'seats 10-12',
      'from 3 to 5',
      'P3 to P5',
      'between 2 and 4 heads',
      '09:00-17:00',
      '3/month',
    ])
      expect(hasAmount(t), t).toBe(false)
  })

  it('leaves weights, decimals, dates, codes and small numbers alone', () => {
    for (const t of [
      '1.043 standard heads',
      'swap for 1.043 standard heads',
      '0.753',
      '2.044',
      '1.701 and 1.225',
      'Moved 1.000 FTE to the new seat',
      'Version 2.100 notes',
      'Due 31.12.2026',
      'Due 01.10.2026',
      'Starts in Q3 2027',
      'P1 to P5 heads',
      'Over 3 months',
      'Earns 10 credits',
      'Level M2 and above',
      'FY27 and FY28',
      'R-1025, R-1030 and P-2589',
      '1550-HSZ/1560-HSZ',
    ])
      expect(hasAmount(t), t).toBe(false)
  })

  it('replaces the whole amount in Manager mode, signs and codes on either side included', () => {
    const mgr = viewer('manager', persona('manager-a').employeeId)
    expect(managerText('Budget holds 140.000 for this role', mgr)).toBe(
      'Budget holds an amount for this role',
    )
    expect(managerText('Send back: the offer would be 140.000 €', mgr)).toBe(
      'Send back: the offer would be an amount',
    )
    expect(managerText('Business need: offer 12,40,000 a year', mgr)).toBe(
      'Business need: offer an amount a year',
    )
    expect(managerText('Approved after the 140 000 review', mgr)).toBe('Approved after the an amount review')
    expect(managerText('Offer of 14 lakh agreed', mgr)).toBe('Offer of an amount agreed')
    expect(managerText('₹14,00,000', mgr)).toBe(AN_AMOUNT)
    expect(managerText('INR140000', mgr)).toBe(AN_AMOUNT)
    expect(managerText('Range 140,000-150,000', mgr)).toBe('Range an amount-an amount')
    expect(managerText('Paid in EUR', mgr)).toBe('Paid in an amount')
    expect(managerText('swap for 1.043 standard heads', mgr)).toBe('swap for 1.043 standard heads')
    // Whatever the spelling, nothing that reads as an amount is left.
    for (const t of SPELLINGS) {
      const out = managerText(t, mgr)
      expect(hasAmount(out), `${t} -> ${out}`).toBe(false)
      expect(out, t).toContain(AN_AMOUNT)
    }
  })
})

/* ───────────── the crawl (docs/PLAN.md 16.1, wave C) ───────────── */

describe('limited requests stay limited on every surface (16.1)', () => {
  const RESTRUCTURE_NOTE = 'Severance near €140,000 for the seat'
  const LEVEL_NOTE = 'Raise to $210,000 base with the new level'

  /** The Elimination of Manager C's Filled seat and a pending Level change, each with an approvers-only amount comment and audit entries. */
  function fixture() {
    const levelId = sample.planted.levelChange
    const level = request(levelId)
    const hrbpOf = (r: HcRequest) => step(r, 'hrbp')
    const commented = (r: HcRequest, text: string): HcRequest => ({
      ...r,
      comments: [
        {
          id: `${r.requestId}-a`,
          at: `${SAMPLE_AS_OF}T08:00:00.000Z`,
          by: hrbpOf(r),
          mode: 'hrbp',
          text,
          audience: 'approvers',
        },
      ],
    })
    const reqs = [commented(elimination, RESTRUCTURE_NOTE), commented(level, LEVEL_NOTE)]
    const audit = auditLog(
      reqs.map((r) =>
        auditDraft({
          object: 'request',
          id: r.requestId,
          field: 'state',
          old: 'Submitted',
          new: 'In review',
          by: r.requesterId,
          byName: holderName(r.requesterId),
          mode: 'manager',
          effectiveDate: r.startDate,
          comment: r.comments[0].text,
          commentAudience: 'approvers',
        }),
      ),
    )
    return { s: withPlanRequests(sample, reqs), audit, reqs }
  }

  const holderName = (id: string) => sample.datasets.workers.find((w) => w.employeeId === id)?.name ?? id

  /** What a crawl shows about one request: every value read where it, or its ID, is named. */
  function about(c: Crawl, id: string): Seen[] {
    return c.seen.filter(
      (x) => x.where.includes(id) || (typeof x.value === 'string' && x.value.includes(id) && !x.tag.derived),
    )
  }

  /** The request's own entries in the Shareable file and the audit rows the crawl read. */
  function fileRequest(c: Crawl, id: string): Record<string, unknown> | null {
    const text = c.seen.find((x) => x.where === 'file shareable')?.value
    if (typeof text !== 'string') return null
    const plan = (JSON.parse(text) as { body: { plan: { requests?: Record<string, unknown>[] } } }).body.plan
    return plan.requests?.find((r) => r.requestId === id) ?? null
  }

  /** Crawls the requests, the Action center, the Audit page, the texts and the files. */
  const read = (ctx: AnalyticsContext): Crawl =>
    crawl(ctx, { views: ['requests'], cards: false, help: false, recordExports: 'text' })

  it('shows Finance and an off-chain Leader no requester, reason, date, comment or amount', () => {
    const f = fixture()
    const fin = personaOf(sample, 'finance-fpa').employeeId
    const leader = offChainLeader(elimination.positionId as string, elimination)
    for (const [mode, who] of [
      ['finance', fin],
      ['leader', leader],
    ] as const) {
      const c = read(ctxAs(mode, who, { sample: f.s, audit: f.audit }))
      expect(c.errors, mode).toEqual([])
      for (const r of f.reqs) {
        if (mode === 'leader' && r.requestId !== elimination.requestId) continue
        const seen = about(c, r.requestId)
        // Non-vacuity: the limited request is listed (queue, counts) with its seat.
        expect(seen.length, `${mode} ${r.requestId}`).toBeGreaterThan(0)
        const text = seen.map((x) => `${x.where} = ${String(x.value)}`).join('\n')
        expect(text, `${mode} ${r.requestId}`).not.toContain(holderName(r.requesterId))
        expect(text, `${mode} ${r.requestId}`).not.toContain(r.reasonCode)
        expect(text, `${mode} ${r.requestId}`).not.toContain(r.startDate as string)
        expect(text, `${mode} ${r.requestId}`).not.toContain(r.comments[0].text)
        for (const t of [RESTRUCTURE_NOTE, LEVEL_NOTE]) expect(holding(c.seen, t), mode).toEqual([])
        for (const amount of ['140,000', '210,000']) expect(holding(c.seen, amount), mode).toEqual([])
        const filed = fileRequest(c, r.requestId)
        if (filed) {
          expect(filed.requesterId, `${mode} file`).toBe('')
          expect(filed.startDate, `${mode} file`).toBeNull()
          expect(filed.comments, `${mode} file`).toEqual([])
        }
      }
      // No notification names them: no Action center item is about either request.
      expect(
        c.seen.filter(
          (x) => x.where.startsWith('page actions/item') && f.reqs.some((r) => x.where.includes(r.requestId)),
        ),
      ).toEqual([])
    }
  }, 120_000)

  it('control: the approver reads the requester, the reason, the date, the comment and the amount', () => {
    const f = fixture()
    const r = f.reqs[0]
    const c = read(ctxAs('hrbp', step(r, 'hrbp'), { sample: f.s, audit: f.audit, unit: r.businessUnit }))
    const text = about(c, r.requestId)
      .map((x) => String(x.value))
      .join('\n')
    expect(text).toContain(holderName(r.requesterId))
    expect(text).toContain(r.reasonCode)
    expect(text).toContain(r.startDate as string)
    expect(holding(c.seen, RESTRUCTURE_NOTE).length).toBeGreaterThan(0)
    expect(holding(c.seen, '140,000').length).toBeGreaterThan(0)
    expect(fileRequest(c, r.requestId)?.requesterId).toBe(r.requesterId)
  }, 120_000)
})
