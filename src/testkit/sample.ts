/**
 * The sample company in every mode, for the leak tests (docs/PLAN.md 16.1): one generated sample per
 * test file, contexts per mode built with the real policy, scopes and lists (the template app's
 * `sampleCtx`, moved here from its Ask test kit), the personas as Acting as picks, a pinned clock,
 * and copies of the sample changed after generation (a perturbed salary, offer or leave flag, a
 * request taken out, comments and reasons added). A copy shares every dataset and plan field it does
 * not change, so the engines' memos keep working and only what changed is recomputed.
 *
 * Copies are never regenerated: removing a request or perturbing a salary changes that row and
 * nothing else (no other id or `seq` shifts). Test code only; nothing in the app imports it.
 */
import { vi } from 'vitest'
import { listsInForce } from '@/access/lists'
import type { ActingAs, Mode, ModePicks } from '@/access/modes'
import { holdingsOn } from '@/access/scopes/people'
import { isLeaderSeat, leaderLevelSet } from '@/access/scopes/pickers'
import { samplePicks } from '@/access/store'
import { type AnalyticsContext, buildContext } from '@/data/context'
import { unitHrbps } from '@/data/lists/roles'
import { cachedSample, type Persona, type PersonaKey, SAMPLE_AS_OF, type Sample } from '@/data/sample'
import {
  type CompRow,
  DATASET_KEYS,
  type DatasetKey,
  type Datasets,
  type ISODate,
  type PositionRow,
  type ReqRow,
  type WorkerRow,
} from '@/data/schema'
import { DEFAULT_FILTERS, type Filters } from '@/data/scope'
import type { SourceMeta } from '@/data/store'
import type { MetricsApi } from '@/metrics/types'
import { appendEntry } from '@/plan/audit/chain'
import { cycleTransition } from '@/plan/engine/cycle'
import { fromRow } from '@/plan/engine/requests'
import type { AuditDraft, AuditEntry, Comment, HcRequest, PlanState, Step } from '@/plan/types'

/* ───────────── the sample, once per file ───────────── */

/**
 * The generated sample, once per test file (every leak test shares it in `beforeAll`): the app's own
 * `cachedSample()`, so a file that also reads it generates it once. Never changed in place: copies
 * are made with `withDatasets`, `withPlan` and the helpers below.
 */
export function leakSample(): Sample {
  return cachedSample()
}

/** The time every crawl runs at: the sample's as-of date, at noon UTC. */
export const PINNED_AT = `${SAMPLE_AS_OF}T12:00:00.000Z`

/**
 * Pins `Date` (not the timers) to `PINNED_AT`, so a workbook's created date, a file's save time or
 * anything else that reads the clock is the same in two crawls. Call in `beforeAll`; `unpinClock`
 * in `afterAll`.
 */
export function pinClock(at: string = PINNED_AT): void {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(at) })
}

export function unpinClock(): void {
  vi.useRealTimers()
}

/* ───────────── personas and picks ───────────── */

export const personaOf = (s: Sample, key: PersonaKey): Persona => {
  const p = s.personas.find((x) => x.key === key)
  if (!p) throw new Error(`The sample has no persona ${key}.`)
  return p
}

/** Every mode's default pick (the sample personas, docs/PLAN.md 13.3). */
export const defaultPicks = (s: Sample): ModePicks => samplePicks(s.personas)

/** The default picks with one mode acting as someone else. */
export function picksWith(s: Sample, mode: Mode, pick: ActingAs | null): ModePicks {
  return { ...defaultPicks(s), [mode]: pick }
}

/** A persona as a pick (an HRBP persona supports the unit its label names). */
export function pickOf(
  p: Pick<Persona, 'employeeId' | 'name' | 'label' | 'businessUnit'>,
  unit?: string,
): ActingAs {
  const named = /^(.+) HRBP$/.exec(p.label)?.[1]
  const u = unit ?? named
  return { personId: p.employeeId, name: p.name, ...(u ? { unit: u } : {}) }
}

/* ───────────── contexts ───────────── */

export interface SampleCtxOptions {
  /** A changed copy of the sample (`withDatasets`, `withPlan`); the generated one when not given. */
  sample?: Sample
  /** Every mode's pick; the personas when not given. */
  picks?: ModePicks
  filters?: Partial<Filters>
  /** "Show pay amounts" (HR admin only has it). */
  showPay?: boolean
  audit?: readonly AuditEntry[]
  metrics?: MetricsApi
  /** The version and comparison pickers (`ver`, `vs`). */
  version?: string | null
  compare?: string | null
  /** HR admin's as-of override (`settings:data`). */
  asOfOverride?: ISODate | null
}

const sourcesMemo = new WeakMap<Datasets, Record<DatasetKey, SourceMeta>>()

/** Every dataset marked as the sample (memoized per datasets object, so contexts share it). */
export function sampleSources(data: Datasets): Record<DatasetKey, SourceMeta> {
  let hit = sourcesMemo.get(data)
  if (!hit) {
    hit = Object.fromEntries(
      DATASET_KEYS.map((k) => [k, { kind: 'sample', rowCount: data[k].length }]),
    ) as Record<DatasetKey, SourceMeta>
    sourcesMemo.set(data, hit)
  }
  return hit
}

/** The sample (or a copy) in a mode, with the real policy, scopes and lists. Fresh every call. */
export function sampleCtx(mode: Mode, opts: SampleCtxOptions = {}): AnalyticsContext {
  const s = opts.sample ?? leakSample()
  return buildContext({
    data: s.datasets,
    sources: sampleSources(s.datasets),
    filters: { ...DEFAULT_FILTERS, ...opts.filters },
    asOfOverride: opts.asOfOverride ?? null,
    today: SAMPLE_AS_OF,
    mode,
    actingAs: opts.picks ?? defaultPicks(s),
    plan: s.plan,
    showPay: !!opts.showPay,
    picks: { version: opts.version ?? null, compare: opts.compare ?? null },
    ...(opts.audit ? { audit: opts.audit } : {}),
    ...(opts.metrics ? { metrics: opts.metrics } : {}),
  })
}

/** A person as a pick, named as the workers dataset names them (an HRBP pick with its unit). */
export function personPick(s: Sample, personId: string, unit?: string): ActingAs {
  const name = s.datasets.workers.find((w) => w.employeeId === personId)?.name ?? personId
  return { personId, name, ...(unit ? { unit } : {}) }
}

/** A mode acting as a person (the other modes keep their personas). */
export function ctxAs(
  mode: Mode,
  personId: string,
  opts: Omit<SampleCtxOptions, 'picks'> & { unit?: string } = {},
): AnalyticsContext {
  const s = opts.sample ?? leakSample()
  return sampleCtx(mode, { ...opts, picks: picksWith(s, mode, personPick(s, personId, opts.unit)) })
}

/** A persona's own mode, acting as the persona. */
export function personaCtx(key: PersonaKey, opts: Omit<SampleCtxOptions, 'picks'> = {}): AnalyticsContext {
  const s = opts.sample ?? leakSample()
  const p = personaOf(s, key)
  return sampleCtx(p.mode, { ...opts, picks: picksWith(s, p.mode, pickOf(p)) })
}

/* ───────────── copies of the sample ───────────── */

/** The sample with some datasets replaced (the rest, and the plan state, shared). */
export function withDatasets(s: Sample, patch: Partial<Datasets>): Sample {
  return { ...s, datasets: { ...s.datasets, ...patch } }
}

/** The sample with its plan state changed (the datasets shared). */
export function withPlan(s: Sample, patch: Partial<PlanState>): Sample {
  return { ...s, plan: { ...s.plan, ...patch } }
}

/** One comp row's pay changed (by index in `comp`). */
export function withCompRow(s: Sample, index: number, patch: Partial<CompRow>): Sample {
  const comp = s.datasets.comp.slice()
  comp[index] = { ...comp[index], ...patch }
  return withDatasets(s, { comp })
}

/** The latest comp row of a person on or before a date (its index), or -1. */
export function compIndexOf(s: Sample, employeeId: string, on: ISODate = SAMPLE_AS_OF): number {
  let best = -1
  s.datasets.comp.forEach((c, i) => {
    if (c.employeeId !== employeeId || c.effectiveDate > on) return
    if (best < 0 || c.effectiveDate >= s.datasets.comp[best].effectiveDate) best = i
  })
  return best
}

/** A person's pay moved by `delta` in local currency on their latest row (the row stays dated as it was). */
export function withSalaryDelta(s: Sample, employeeId: string, delta: number): Sample {
  const i = compIndexOf(s, employeeId)
  if (i < 0) throw new Error(`${employeeId} has no comp row.`)
  return withCompRow(s, i, { baseSalary: s.datasets.comp[i].baseSalary + delta })
}

/** A back-dated comp row for a person (a new row, effective in a closed month). */
export function withBackDatedComp(
  s: Sample,
  employeeId: string,
  effectiveDate: ISODate,
  delta: number,
): Sample {
  const i = compIndexOf(s, employeeId, effectiveDate)
  if (i < 0) throw new Error(`${employeeId} has no comp row before ${effectiveDate}.`)
  const base = s.datasets.comp[i]
  return withDatasets(s, {
    comp: [...s.datasets.comp, { ...base, effectiveDate, baseSalary: base.baseSalary + delta }],
  })
}

/** One req changed (an offer's base, sign-on, relocation or agency fee). */
export function withReq(s: Sample, reqId: string, patch: Partial<ReqRow>): Sample {
  const i = s.datasets.reqs.findIndex((r) => r.reqId === reqId)
  if (i < 0) throw new Error(`The sample has no req ${reqId}.`)
  const reqs = s.datasets.reqs.slice()
  reqs[i] = { ...reqs[i], ...patch }
  return withDatasets(s, { reqs })
}

/** Every worker row of a person changed (a leave flag). */
export function withWorker(s: Sample, employeeId: string, patch: Partial<WorkerRow>): Sample {
  let hit = false
  const workers = s.datasets.workers.map((w) => {
    if (w.employeeId !== employeeId) return w
    hit = true
    return { ...w, ...patch }
  })
  if (!hit) throw new Error(`The sample has no worker ${employeeId}.`)
  return withDatasets(s, { workers })
}

/**
 * The sample with one request removed from plan state after generation (docs/PLAN.md 16.1, Manager
 * C): its row, its plan-state copy with its comments, its merge-base entry, and the audit entries
 * that belong to it. Nothing is regenerated, so no other id or `seq` shifts.
 */
export function withoutRequest(
  s: Sample,
  requestId: string,
  audit: readonly AuditEntry[] = [],
): { sample: Sample; audit: AuditEntry[] } {
  const sample: Sample = {
    ...s,
    datasets: { ...s.datasets, requests: s.datasets.requests.filter((r) => r.requestId !== requestId) },
    plan: {
      ...s.plan,
      requests: s.plan.requests.filter((r) => r.requestId !== requestId),
      mergeBase: s.plan.mergeBase.filter((m) => m.requestId !== requestId),
    },
  }
  return { sample, audit: audit.filter((e) => !belongsTo(e, requestId)) }
}

/** An audit entry written for a request: its own request and transfer entries (comments included). */
const belongsTo = (e: AuditEntry, requestId: string): boolean =>
  (e.object === 'request' || e.object === 'transfer') && e.id === requestId

/** A request of the sample as plan state holds it (the plan-state copy, else the imported row). */
export function requestOf(s: Sample, requestId: string): HcRequest {
  const own = s.plan.requests.find((r) => r.requestId === requestId)
  if (own) return own
  const row = s.datasets.requests.find((r) => r.requestId === requestId)
  if (!row) throw new Error(`The sample has no request ${requestId}.`)
  return fromRow(row)
}

/** The sample with requests put in plan state (each replaces the imported row with its ID). */
export function withPlanRequests(s: Sample, requests: readonly HcRequest[]): Sample {
  const ids = new Set(requests.map((r) => r.requestId))
  return withPlan(s, { requests: [...s.plan.requests.filter((r) => !ids.has(r.requestId)), ...requests] })
}

/* ───────────── an audit log ───────────── */

/** Drafts chained and hashed in order (src/plan/audit/chain.ts), as the store would append them. */
export function auditLog(drafts: readonly AuditDraft[]): AuditEntry[] {
  const out: AuditEntry[] = []
  for (const d of drafts) out.push(appendEntry(out.at(-1) ?? null, d))
  return out
}

/** One audit draft with the fields a test does not care about filled in. */
export function auditDraft(
  patch: Partial<AuditDraft> & Pick<AuditDraft, 'object' | 'id' | 'field'>,
): AuditDraft {
  return {
    at: `${SAMPLE_AS_OF}T09:00:00.000Z`,
    by: 'E00000',
    byName: 'Sample admin',
    mode: 'hr-admin',
    old: null,
    new: null,
    effectiveDate: null,
    comment: null,
    commentAudience: null,
    ...patch,
  }
}

/* ───────────── text fixtures (docs/PLAN.md 16.1, Manager mode) ───────────── */

/** A comment as plan state stores it. */
export function comment(patch: Partial<Comment> & Pick<Comment, 'id' | 'text'>): Comment {
  return { at: `${SAMPLE_AS_OF}T08:00:00.000Z`, by: 'E00000', mode: 'hrbp', audience: 'everyone', ...patch }
}

/** A step with the fields a test does not care about filled in. */
export function step(patch: Partial<Step> & Pick<Step, 'n' | 'role' | 'approverId'>): Step {
  return { reasons: ['always'], enteredAt: null, decision: null, at: null, note: null, ...patch }
}

/**
 * The texts 16.1's Manager fixture plants, each with an amount: an Everyone comment, a seat-edit
 * reason, a send-back reason, a freeze-exception reason and an audit comment holding "€140,000",
 * an imported request's Everyone comment holding "$95k", and that request's job title holding
 * "€140,000" (M3 review PV-6: a title that came by Import requests, which checks no entry); and a
 * position title and job family in the positions dataset, each holding "€140,000" (M4 review EX-3:
 * the position import checks no title, so the context reads them through `managerText`).
 */
export const MANAGER_TEXTS = {
  everyone: 'Budget holds €140,000 for this role',
  seatEdit: 'Start moved to save €140,000',
  sendBack: 'Send back: the offer would be €140,000',
  exception: 'Business need above €140,000 a year',
  audit: 'Approved after the €140,000 review',
  imported: 'Offer came in at $95k',
  title: 'Field Sales Engineer (budget €140,000)',
  positionTitle: 'Design Engineer (budget €140,000)',
  jobFamily: 'Engineering (€140,000 pool)',
  recruiter: 'Agency (fee €140,000)',
} as const

/** The planted position title and job family as Manager mode reads them (`managerText`). */
export const MANAGER_POSITION_TEXTS = {
  positionTitle: 'Design Engineer (budget an amount)',
  jobFamily: 'Engineering (an amount pool)',
} as const

/** The planted req recruiter as Manager mode reads it (`managerText`; M4 recheck EX-3-a). */
export const MANAGER_REQ_TEXTS = {
  recruiter: 'Agency (fee an amount)',
} as const

/** A plain comment with no amount, so a test can show the texts were read at all. */
export const PLAIN_COMMENT = 'Timing works for the team'

export interface ManagerTextFixture {
  sample: Sample
  audit: AuditEntry[]
  /** The request sent back with the texts on it, and the one "imported" with an Everyone comment. */
  sentBack: string
  imported: string
  /** The seat whose edit reason the audit log holds. */
  seat: string
  /**
   * The seat whose positions dataset rows carry `MANAGER_TEXTS.positionTitle` and
   * `MANAGER_TEXTS.jobFamily` (review EX-3): `seat`, a Planned seat in Manager A's tree.
   */
  titled: string
  /**
   * The reqs whose recruiter is `MANAGER_TEXTS.recruiter` (M4 recheck EX-3-a): every req of a seat
   * Manager A manages directly, `titled`'s among them where it has one.
   */
  recruited: readonly string[]
  /**
   * Company entries Manager mode must never read (review RM-2): a band midpoint edit whose field is
   * named 'value' (`BAND_EDIT`), and the cycle's cut line set through `cycleTransition`.
   */
  bandEntry: string
  cutField: string
}

/** The band midpoint edit in the Manager fixture's audit log (review RM-2): 95,000 to 98,000. */
export const BAND_EDIT = { id: 'fy27-working|band|P3|A|FY27', old: 95_000, new: 98_000 } as const

/**
 * 16.1's Manager fixture on Manager A's requests: their pending New role is sent back by the HRBP
 * with a send-back reason, carries an Everyone comment, a plain comment and a freeze-exception
 * reason; their approved New role carries the "imported" Everyone comment and a job title with an
 * amount (as Import requests would merge them, with no entry check); the audit log holds the HRBP's seat edit on a Planned seat in the
 * tree with its reason, and the send-back with an Everyone audit comment; and that seat has a title
 * and job family with an amount in every positions dataset row (review EX-3, as a positions import
 * would bring them), and every req on a seat Manager A manages directly a recruiter with an amount
 * (M4 recheck EX-3-a). Every text but the plain one holds an amount.
 */
export function managerTextFixture(s: Sample): ManagerTextFixture {
  const a = personaOf(s, 'manager-a')
  const own = requestsOfPerson(s, a.employeeId)
  const pending = own.find((r) => r.state === 'Submitted' || r.state === 'In review')
  const approved = own.find((r) => r.state === 'Approved')
  if (!pending || !approved) throw new Error('Manager A needs a pending and an approved request.')
  const hrbp = pending.steps.find((x) => x.role === 'hrbp')?.approverId ?? 'E00000'
  const at = `${SAMPLE_AS_OF}T09:30:00.000Z`
  const sentBack: HcRequest = {
    ...pending,
    state: 'Sent back',
    updatedAt: at,
    exception: { freezeId: s.datasets.freezes[0]?.freezeId ?? 'FRZ-001', reason: MANAGER_TEXTS.exception },
    steps: pending.steps.map((x, i) =>
      i === 0 ? { ...x, decision: 'Sent back', at, note: MANAGER_TEXTS.sendBack } : x,
    ),
    comments: [
      comment({ id: 'fx-c1', by: hrbp, text: MANAGER_TEXTS.everyone }),
      comment({ id: 'fx-c2', by: hrbp, text: PLAIN_COMMENT }),
    ],
  }
  const imported: HcRequest = {
    ...approved,
    jobTitle: MANAGER_TEXTS.title,
    comments: [comment({ id: 'fx-c3', by: hrbp, text: MANAGER_TEXTS.imported })],
  }
  const seat =
    s.datasets.positions.find((p) => p.managerPositionId === a.positionId && p.status === 'Planned')
      ?.positionId ?? s.datasets.positions.find((p) => p.managerPositionId === a.positionId)?.positionId
  if (!seat) throw new Error('Manager A has no seat in their tree.')
  // A real cut line, as Requests > Cycle writes it (review RM-2): the HRBP cuts their unit after 40 heads.
  const cycle = s.plan.cycles[0] ?? null
  const cut = cycleTransition(
    cycle,
    { kind: 'cut', businessUnit: pending.businessUnit, afterHeads: 40 },
    { personId: hrbp, name: 'The HRBP', mode: 'hrbp' },
    at,
  )
  if ('refused' in cut) throw new Error(`The fixture's cut line was refused: ${cut.refused}`)
  const audit = auditLog([
    auditDraft({
      object: 'position',
      id: seat,
      field: 'startDate',
      old: '2026-09-16',
      new: '2026-11-02',
      by: hrbp,
      byName: 'The HRBP',
      mode: 'hrbp',
      comment: MANAGER_TEXTS.seatEdit,
    }),
    auditDraft({
      object: 'request',
      id: sentBack.requestId,
      field: 'state',
      old: pending.state,
      new: 'Sent back',
      by: hrbp,
      byName: 'The HRBP',
      mode: 'hrbp',
      comment: MANAGER_TEXTS.audit,
      commentAudience: 'everyone',
    }),
    auditDraft({
      object: 'request',
      id: sentBack.requestId,
      field: 'note',
      old: null,
      new: null,
      by: hrbp,
      byName: 'The HRBP',
      mode: 'hrbp',
      comment: MANAGER_TEXTS.sendBack,
    }),
    auditDraft({
      object: 'assumption',
      id: BAND_EDIT.id,
      field: 'value',
      old: BAND_EDIT.old,
      new: BAND_EDIT.new,
      by: hrbp,
      byName: 'The HRBP',
      mode: 'finance',
    }),
    ...cut.audit,
  ])
  // Review EX-3: the seat's title and job family with an amount, in every row the dataset holds for it.
  // M4 recheck EX-3-a: the recruiter of every req on a seat Manager A manages directly, as an ATS
  // import would bring it.
  const direct = new Set(
    s.datasets.positions.filter((p) => p.managerPositionId === a.positionId).map((p) => p.positionId),
  )
  const recruited = s.datasets.reqs
    .filter((r) => r.positionId && direct.has(r.positionId))
    .map((r) => r.reqId)
  if (!recruited.length) throw new Error('Manager A has no req in their tree.')
  const titled = withDatasets(s, {
    positions: s.datasets.positions.map((p) =>
      p.positionId === seat
        ? { ...p, title: MANAGER_TEXTS.positionTitle, jobFamily: MANAGER_TEXTS.jobFamily }
        : p,
    ),
    reqs: s.datasets.reqs.map((r) =>
      recruited.includes(r.reqId) ? { ...r, recruiter: MANAGER_TEXTS.recruiter } : r,
    ),
  })
  return {
    sample: withPlanRequests(titled, [sentBack, imported]),
    audit,
    sentBack: sentBack.requestId,
    imported: imported.requestId,
    seat,
    titled: seat,
    recruited,
    bandEntry: BAND_EDIT.id,
    cutField: cut.audit[0]?.field ?? '',
  }
}

/** A person's own requests (as requester), imported rows and plan state alike. */
export function requestsOfPerson(s: Sample, personId: string): HcRequest[] {
  const ids = new Set([
    ...s.datasets.requests.filter((r) => r.requesterId === personId).map((r) => r.requestId),
    ...s.plan.requests.filter((r) => r.requesterId === personId).map((r) => r.requestId),
  ])
  return [...ids].sort().map((id) => requestOf(s, id))
}

/* ───────────── who sees a seat ───────────── */

/** The HRBP of a seat's unit (the Units list) and the holder of the nearest leader seat above it. */
export function seatViewers(s: Sample, positionId: string): { unit: string; hrbp: string; leader: string } {
  const latest = new Map<string, PositionRow>()
  for (const r of s.datasets.positions) {
    const cur = latest.get(r.positionId)
    if (!cur || r.effectiveDate >= cur.effectiveDate) latest.set(r.positionId, r)
  }
  const row = latest.get(positionId)
  if (!row) throw new Error(`The sample has no position ${positionId}.`)
  const lists = listsInForce(null, s.datasets, sampleSources(s.datasets))
  const hrbp = unitHrbps(lists).get(row.businessUnit)
  if (!hrbp) throw new Error(`${row.businessUnit} has no HRBP in the Units list.`)
  const levels = leaderLevelSet(lists)
  const held = holdingsOn(s.datasets.workers, SAMPLE_AS_OF)
  const seen = new Set<string>()
  for (
    let id = row.managerPositionId ?? null;
    id && !seen.has(id);
    id = latest.get(id)?.managerPositionId ?? null
  ) {
    seen.add(id)
    const up = latest.get(id)
    const h = held.holderOf.get(id)
    if (up && h && isLeaderSeat(up, levels)) return { unit: row.businessUnit, hrbp, leader: h }
  }
  throw new Error(`No leader seat above ${positionId}.`)
}

/** The modes that may see a seat: Finance (the FP&A lead), the unit's HRBP, the nearest leader above it. */
export function seatViewerContexts(
  s: Sample,
  positionId: string,
): { key: string; ctx: (x: Sample) => AnalyticsContext }[] {
  const v = seatViewers(s, positionId)
  const fpa = personaOf(s, 'finance-fpa').employeeId
  return [
    { key: `finance ${fpa}`, ctx: (x) => ctxAs('finance', fpa, { sample: x }) },
    { key: `hrbp ${v.hrbp} ${v.unit}`, ctx: (x) => ctxAs('hrbp', v.hrbp, { sample: x, unit: v.unit }) },
    { key: `leader ${v.leader}`, ctx: (x) => ctxAs('leader', v.leader, { sample: x }) },
  ]
}
