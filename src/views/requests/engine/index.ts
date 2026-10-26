/**
 * The Requests view's model (docs/PLAN.md 9.4, 10.1 to 10.3), the lists in M2: the queue in scope by
 * state and step, your requests and their tracker, the requests waiting on the Acting as person, and
 * the planning cycle's stage, dates, ranked asks and the managers who have not submitted. Every list
 * and count follows 8.4: rows are `RequestRecord`s (src/drill/requestRecord.ts: a hidden request is
 * no row, a limited one keeps only position ID, title, level and org) and every count is over the
 * rows the viewer may see (rule 6). One model per analytics context (`requestsModel`, cached in a
 * WeakMap). M3 adds the write path's parts: Requests > New (./new.ts, read lazily), each request's
 * card on Mine and Approvals (./cards.ts: decisions, the band estimate and gap after approval by
 * mode), the file buttons of the Queue and Mine, and the cycle's controls (./cycleControls.ts).
 *
 * Other views read it: the HRBP home's My list is `queue.rows` (the unit's open requests by step);
 * the Leader home re-links Approvals' "Waiting on you 5 or more days" as Approvals waiting.
 *
 * Readings taken here (the views-3 builder's):
 *  - The queue lists the requests in progress in scope (Submitted, In review, Sent back), oldest step
 *    first; "by state and step" counts every state but Draft (a draft is its requester's, in Mine).
 *  - Mine lists every request the Acting as person raised or submitted on someone's behalf, in scope,
 *    drafts included, with the tracker after approval (the seat's latest req: Req opened, Interviewing,
 *    Offer accepted as a date only, Started). The ATS gives a req's stage but not the day it entered
 *    Interviewing, so that date reads "—" and days in step count from the stage's own date.
 *  - Approvals lists the requests whose waiting step is the Acting as person's, in scope. Outside
 *    Manager mode each shows its band estimate and the target org's gap after approval in heads
 *    (6.9: the gap with the request left out of asks, minus its head effect, which for a pending
 *    request equals the current gap), and in M3 its cost under the mode's own cost rules, read from
 *    Targets > Gap's one result per org (./gapAfter.ts); heads only where cost cannot show.
 *  - The cycle is the shown fiscal year's, else the one open for a later year (./cycle.ts).
 *  - Lists and counts keep to the mode's scope and the filters, so the records panel (which keeps
 *    rows to the scope) opens exactly the rows counted.
 *
 * Frozen in the M2 freeze (docs/CONTRACTS-M2.md). The interfaces list what other builders read; the
 * views-3 builder added fields, never renaming or retyping these.
 */

import { holdingsOn } from '@/access/scopes/people'
import type { Kpi } from '@/components/types'
import type { AnalyticsContext } from '@/data/context'
import type { FieldRef } from '@/data/quality/fieldRef'
import type { CycleStage, FiscalYear, ISODate, Level, RequestState, RequestType } from '@/data/schema'
import { LIMITED_WHY_TEXT } from '@/drill/requestRecord'
import type { RequestRecord } from '@/drill/types'
import { type DrillSpec, drillSpec } from '@/drill/types'
import { formatDate } from '@/lib/dates'
import { WHY_KEY } from '@/lib/export/suppressedFlag'
import { fmt, plural } from '@/lib/format'
import { toPosition } from '@/plan/engine/versions'
import type { HcRequest } from '@/plan/types'
import type { FigureData, Headline, TabModel } from '../../types'
import { ID } from '../metrics'
import { isPendingState, type Prep, prepOf, type RequestListRow, rowsOf } from './base'
import { cardsOf, type RequestCard } from './cards'
import { APPROVALS_COLUMNS, ASK_COLUMNS, MINE_COLUMNS, NOT_SUBMITTED_COLUMNS, QUEUE_COLUMNS } from './columns'
import {
  cycleNote,
  cycleShown,
  type ManagerSeat,
  managersInScope,
  notSubmittedIn,
  openForAsks,
  type UnitAsks,
  unitAsks,
} from './cycle'
import { type CycleControls, type CycleOpenOption, cycleControlsOf, cycleOpenOf } from './cycleControls'
import { REQUESTS_FIGURES } from './figures'
import { gapAfterOf } from './gapAfter'
import { type RequestsNew, requestsNewOf } from './new'

export type { RequestListRow } from './base'
export type { CardGap, ChangeField, CommentLine, RequestCan, RequestCard, StepLine } from './cards'
export type { CutOption, CycleControls, CycleOpenOption, UnitControls } from './cycleControls'
export { type GapAfter, headsCount } from './gapAfter'
export * from './new'

/* ───────────── rows ───────────── */

/** Requests in scope by state and step (Requests > Queue). */
export interface RequestStateRow {
  state: RequestState
  /** "HRBP review", "Leader review"; null for states with no step. */
  step: string | null
  count: number
  /** Of them, waiting 5 or more days in the step (`requests.queue.waiting`). */
  waiting: number
  /** "Submitted, HRBP review": the state and step in words, for the chart. */
  label: string
}

/** One ranked ask of the cycle (10.3): heads and in-year band estimate, above or below the cut line. */
export interface RankedAskRow {
  requestId: string
  /** The submitting manager's seat. */
  managerPositionId: string
  manager: string | null
  priority: number | null
  heads: number
  /** In-year band estimate (`band: true`); null where `cost:band` hides it. */
  bandEstimateUsd: number | null
  /** Above the cut line as the mode shows it; false where the mode shows no cut line (Manager mode). */
  aboveCut: boolean
  /** Its place in the unit's ranked list, 1 first. */
  rank: number
  businessUnit: string
  type: RequestType
  jobTitle: string | null
  level: Level | null
  /** Heads of this ask and every ask ranked above it in its unit. */
  cumulativeHeads: number
  /** "Above" or "Below" the line; null where no line is shown or nothing is cut. */
  cut: 'Above' | 'Below' | null
  /** Why a limited ask's band estimate is empty (`WHY_KEY`, review EX-9); only on a limited row. */
  __why?: string
}

/** A manager who has not submitted ranked asks while the cycle is open ("Copy note"). */
export interface NotSubmittedRow {
  managerPositionId: string
  employeeId: string
  manager: string
  businessUnit: string
  title: string | null
  department: string | null
}

/** The cycle's facts for the fiscal year shown, or null when there is none. */
export interface CycleFacts {
  cycleId: string
  fiscalYear: FiscalYear
  stage: CycleStage
  asksDue: ISODate
  hrbpReviewDue: ISODate | null
  leaderReviewDue: ISODate | null
  financeReviewDue: ISODate | null
}

/** One unit's line on the Cycle tab: its target, its asks and where the cut line falls. */
export interface CycleUnitLine {
  businessUnit: string
  targetHeads: number | null
  targetDate: ISODate
  /** Asks at the target date, the cycle's asks included. */
  asksHeads: number
  rankedHeads: number
  /** Target − asks without the cycle's asks; null with no target. */
  room: number | null
  /** After this many ranked heads; null when nothing is cut. */
  cutAfter: number | null
  source: 'set' | 'default' | 'none'
  headsAbove: number
  headsBelow: number
  /** In-year band estimate above and below the line (band figures); null where the mode hides them. */
  bandAbove: number | null
  bandBelow: number | null
  /** "The cut line falls after the 40th ranked head (from the FY28 target)". */
  sentence: string
}

/* ───────────── tabs ───────────── */

/** A workspace file button as the tab shows it: offered by its action's decision, else the reason. */
export interface FileButton {
  shown: boolean
  /** The policy's reason when it is not offered; null when shown. */
  why: string | null
}

export interface RequestsQueue extends TabModel {
  rows: FigureData<RequestRecord>
  byState: FigureData<RequestStateRow>
  /** Added in M3: "Import requests" in the header (`request.import`) and "Export requests" (`export.requests`). */
  importRequests: FileButton
  exportRequests: FileButton
}

export interface RequestsMine extends TabModel {
  rows: FigureData<RequestRecord>
  /** Added in M3: each row's card, in the rows' order (./cards.ts), and "Export requests". */
  cards: readonly RequestCard[]
  exportRequests: FileButton
}

/** One target org's gap after approval (Approvals, not Manager mode): heads, and cost under the mode's rules. */
export interface ApprovalGapRow {
  /** Targets > Gap's org key ('unit:Silicon Engineering'). */
  orgKey: string
  org: string
  gapHeads: number | null
  /** USD under the mode's cost rules (7.3, 7.4), else null with the note. */
  gapCostUsd: number | null
  note: string | null
}

export interface RequestsApprovals extends TabModel {
  /** The requests whose waiting step is the Acting as person's. */
  rows: FigureData<RequestRecord>
  /**
   * Added in M3: the target orgs of the requests waiting on you, each with its gap after approval in
   * heads and, under the mode's cost rules, in cost (a pending request is already in asks, so it is
   * the org's gap as Targets > Gap shows it). Null in Manager mode (7.6).
   */
  gaps: FigureData<ApprovalGapRow> | null
  /** Added in M3: each row's card with the decisions, the band estimate and the gap after approval. */
  cards: readonly RequestCard[]
}

export interface RequestsCycle extends TabModel {
  cycle: CycleFacts | null
  asks: FigureData<RankedAskRow>
  notSubmitted: FigureData<NotSubmittedRow>
  /** Each unit's target, asks and cut line (none in Manager mode, which shows no cut line). */
  units: readonly CycleUnitLine[]
  /** The mode shows the cut line (every mode but Manager). */
  cutShown: boolean
  /** The "Copy note" text for managers who have not submitted, where the mode offers it; else null. */
  copyNote: string | null
  /** Manager mode: whether the manager has sent ranked asks to the open cycle; null elsewhere. */
  mineSent: boolean | null
  /** Added in M3: what the viewer may do on the cycle now (./cycleControls.ts), or null with no cycle. */
  controls: CycleControls | null
  /** Added in M3: the next year's cycle Finance (or HR admin) may open now (./cycleControls.ts), else null. */
  open: CycleOpenOption | null
  /**
   * Added in the M3 review (SC-9): the asks the viewer may approve with changes now, as cards (the
   * unit's HRBP in HRBP review, once the ask's manager approved it); the lock makes them Approved
   * with changes. Empty elsewhere.
   */
  cards: readonly RequestCard[]
}

export interface RequestsModel {
  queue: RequestsQueue
  mine: RequestsMine
  approvals: RequestsApprovals
  cycle: RequestsCycle
  /**
   * Requests > New (./new.ts `RequestsNew`, M3 freeze): the type picker and the seats a form may
   * name; null where `tab:requests.new` is hidden (Finance) and until the requests-ui builder fills
   * it (`requestsNewOf`).
   */
  new: RequestsNew | null
}

/* ───────────── shared pieces ───────────── */

/** The fields the lists read (their records' and steps'). */
const USES: readonly FieldRef[] = [
  'requests.requestId',
  'requests.type',
  'requests.state',
  'requests.positionId',
  'requests.businessUnit',
  'requests.managerPositionId',
  'requests.startDate',
  'requests.requesterId',
  'requests.submittedAt',
  'requests.updatedAt',
  'requests.steps',
]
const CYCLE_USES: readonly FieldRef[] = [...USES, 'requests.cycleId', 'requests.priority']

const stepOrder = (r: RequestListRow) => r.stepN ?? 99

/** Oldest step first, then request ID. */
function byWaiting(a: RequestListRow, b: RequestListRow): number {
  return (
    (b.daysShown ?? -1) - (a.daysShown ?? -1) ||
    stepOrder(a) - stepOrder(b) ||
    a.requestId.localeCompare(b.requestId)
  )
}

function requestsDrill(
  ctx: AnalyticsContext,
  title: string,
  rows: readonly RequestRecord[],
): DrillSpec<'requests'> {
  return drillSpec({
    kind: 'requests',
    title,
    subtitle: `${ctx.scopeLabel} · as of ${formatDate(ctx.asOf)}`,
    rows,
    uses: USES,
  })
}

/** A KPI over request rows: its count opens exactly them. */
function requestKpi(
  ctx: AnalyticsContext,
  id: string,
  metricId: string,
  label: string,
  rows: readonly RequestRecord[],
  title: string,
  tab: string,
  note?: string,
): Kpi {
  return {
    id,
    metricId,
    label,
    value: rows.length,
    format: 'int',
    goodDirection: ctx.metrics.def(metricId)?.goodDirection ?? null,
    ...(note ? { note } : {}),
    definition: ctx.metrics.def(metricId)?.definition,
    tab,
    drill: () => requestsDrill(ctx, title, rows),
    uses: USES,
  }
}

function figure<Row extends object>(
  id: string,
  metric: string,
  title: string,
  rows: readonly Row[],
  columns: FigureData<Row>['columns'],
  empty: string | null,
  opts: { subtitle?: string; note?: string | null; uses?: readonly FieldRef[] } = {},
): FigureData<Row> {
  return {
    id,
    metric,
    title,
    ...(opts.subtitle ? { subtitle: opts.subtitle } : {}),
    rows,
    columns,
    note: opts.note ?? null,
    empty: rows.length ? null : empty,
    uses: opts.uses ?? USES,
  }
}

/** Every visible request in scope, as rows. */
function scopedRows(p: Prep): RequestListRow[] {
  return rowsOf(p, p.inScope)
}

/* ───────────── Queue ───────────── */

function queueOf(p: Prep, managers: () => NotSubmittedRow[]): RequestsQueue {
  const { ctx, set } = p
  const all = scopedRows(p)
  const open = all.filter((r) => isPendingState(r.state)).sort(byWaiting)
  const waiting = open.filter((r) => r.waiting)
  const byKey = new Map<string, RequestStateRow & { list: RequestListRow[] }>()
  for (const r of all) {
    if (r.state === 'Draft') continue
    const step = isPendingState(r.state) ? r.stepLabel : null
    const k = `${r.state}|${step ?? ''}`
    const row = byKey.get(k) ?? { state: r.state, step, count: 0, waiting: 0, label: '', list: [] }
    row.count++
    if (r.waiting) row.waiting++
    row.list.push(r)
    byKey.set(k, row)
  }
  const ORDER: readonly RequestState[] = [
    'Submitted',
    'In review',
    'Sent back',
    'Approved',
    'Approved with changes',
    'Rejected',
    'Withdrawn',
    'Expired',
  ]
  const states = [...byKey.values()].sort(
    (a, b) => ORDER.indexOf(a.state) - ORDER.indexOf(b.state) || (a.step ?? '').localeCompare(b.step ?? ''),
  )
  const lists = new Map(states.map((s) => [s, s.list]))
  const stateRows: RequestStateRow[] = states.map(({ state, step, count, waiting: w }) => ({
    state,
    step,
    count,
    waiting: w,
    label: step ? `${state}, ${step}` : state,
  }))
  const listOf = (r: RequestStateRow) =>
    lists.get(states.find((s) => s.state === r.state && s.step === r.step)!) ?? []
  const notSub = managers()
  const kpis: Kpi[] = [
    requestKpi(
      ctx,
      'queue-open',
      ID.queueOpen,
      'Requests in progress',
      open,
      'Requests in progress',
      'queue',
    ),
    requestKpi(
      ctx,
      'queue-waiting',
      ID.queueWaiting,
      `Waiting ${set.waitingDays} or more days`,
      waiting,
      `Requests waiting ${set.waitingDays} or more days in a step`,
      'queue',
    ),
    notSubmittedKpi(p, notSub, 'queue'),
  ]
  return {
    kpis,
    importRequests: fileButton(ctx, 'request.import'),
    exportRequests: fileButton(ctx, 'export.requests'),
    rows: figure<RequestRecord>(
      REQUESTS_FIGURES.queue,
      ID.queueOpen,
      'Requests in progress',
      open,
      QUEUE_COLUMNS,
      'No request in scope is in progress.',
      { subtitle: `By step, the longest waiting first, as of ${formatDate(ctx.asOf)}` },
    ),
    byState: figure(
      REQUESTS_FIGURES.queueByState,
      ID.queueOpen,
      'Requests by state and step',
      stateRows,
      [
        { key: 'state', label: 'State' },
        { key: 'step', label: 'Step' },
        {
          key: 'count',
          label: 'Requests',
          format: 'int',
          drill: (r: RequestStateRow) => () =>
            requestsDrill(ctx, `${r.state}${r.step ? `, ${r.step}` : ''}`, listOf(r)),
        },
        {
          key: 'waiting',
          label: `Waiting ${set.waitingDays}+ days`,
          format: 'int',
          drill: (r: RequestStateRow) =>
            r.waiting
              ? () =>
                  requestsDrill(
                    ctx,
                    `${r.state}${r.step ? `, ${r.step}` : ''}: waiting ${set.waitingDays} or more days`,
                    listOf(r).filter((x) => x.waiting),
                  )
              : null,
        },
      ],
      'No request in scope yet.',
      { note: 'Drafts are their requester’s and show in Mine.' },
    ),
  }
}

/* ───────────── Not submitted ───────────── */

/** The not-submitted KPI: managers in scope with no ask in the open cycle; it opens their seats. */
function notSubmittedKpi(p: Prep, rows: readonly NotSubmittedRow[], tab: string): Kpi {
  const { ctx } = p
  const open = openForAsks(ctx)[0] ?? null
  const seats = rows
    .map((r) => ctx.positionIndex.byId.get(r.managerPositionId))
    .filter((r): r is NonNullable<typeof r> => !!r)
    .map(toPosition)
  return {
    id: `${tab}-not-submitted`,
    metricId: ID.cycleNotSubmitted,
    label: 'Managers not submitted',
    value: open ? rows.length : null,
    format: 'int',
    goodDirection: 'down',
    note: open
      ? `Asks for ${open.fiscalYear} due ${formatDate(open.dates.asksDue)}`
      : 'No cycle is open for asks.',
    definition: ctx.metrics.def(ID.cycleNotSubmitted)?.definition,
    tab: 'cycle',
    drill: open
      ? () =>
          drillSpec({
            kind: 'positions',
            title: `Managers who have not sent ranked asks for ${open.fiscalYear}`,
            subtitle: `${ctx.scopeLabel} · as of ${formatDate(ctx.asOf)}`,
            rows: seats,
            noun: ['manager’s seat', 'managers’ seats'],
            uses: CYCLE_USES,
          })
      : undefined,
    uses: CYCLE_USES,
  }
}

/* ───────────── Mine ───────────── */

function mineOf(p: Prep): RequestsMine {
  const { ctx, set, me } = p
  const mineReqs = me ? p.inScope.filter((r) => r.requesterId === me || r.submittedById === me) : []
  const rows = rowsOf(p, mineReqs).sort(
    (a, b) =>
      Number(isPendingState(b.state)) - Number(isPendingState(a.state)) ||
      (b.submittedAt ?? '').localeCompare(a.submittedAt ?? '') ||
      a.requestId.localeCompare(b.requestId),
  )
  const byId = new Map(mineReqs.map((r) => [r.requestId, r]))
  // The rows carry each request's effective state (./base.ts), so an expired request is Expired
  // only: never in progress or sent back as well.
  const open = rows.filter((r) => isPendingState(r.state))
  const sentBack = rows.filter((r) => r.state === 'Sent back')
  const expired = rows.filter((r) => r.state === 'Expired')
  const who = ctx.access.actingAs?.name ?? null
  const out: Omit<RequestsMine, 'cards'> = {
    exportRequests: fileButton(ctx, 'export.requests'),
    kpis: [
      requestKpi(ctx, 'mine-open', ID.queueOpen, 'In progress', open, 'Your requests in progress', 'mine'),
      requestKpi(
        ctx,
        'mine-sent-back',
        ID.queueSentBack,
        'Sent back',
        sentBack,
        'Your requests sent back',
        'mine',
      ),
      requestKpi(
        ctx,
        'mine-expired',
        ID.queueExpired,
        'Expired',
        expired,
        'Your requests that expired',
        'mine',
        `After ${set.idleDays} idle days`,
      ),
    ],
    rows: figure<RequestRecord>(
      REQUESTS_FIGURES.mine,
      ID.trackerDaysInStep,
      who ? `Requests raised by ${who}` : 'Your requests',
      rows,
      MINE_COLUMNS,
      me ? 'You have raised no request in this scope.' : 'Pick who you act as to see your requests.',
      { subtitle: 'In progress first, then the tracker after approval' },
    ),
  }
  return lazy(out, 'cards', () =>
    cardsOf(
      p,
      rows.map((r) => byId.get(r.requestId)).filter((r): r is HcRequest => !!r),
    ),
  )
}

/* ───────────── Approvals ───────────── */

function approvalsOf(p: Prep): RequestsApprovals {
  const { ctx, set, me } = p
  // Every request the viewer may see whose waiting step is theirs, whatever the mode's scope: an
  // approver on the chain sees the request (8.4 rule 1), and a step moved up the chain (no
  // self-approval, 10.2) or a requester outside the scope still reaches them.
  const mineToDecide = me
    ? p.visible.filter((r) => {
        const w = p.waitOf(r)
        return !!w && w.step.approverId === me
      })
    : []
  const showGap = ctx.access.mode !== 'manager'
  const cards = new Map(cardsOf(p, mineToDecide, { approvals: true }).map((c) => [c.requestId, c]))
  const rows = rowsOf(p, mineToDecide)
    .map((r): RequestListRow => {
      const g = showGap && r.view === 'full' ? (cards.get(r.requestId)?.gapAfter ?? null) : null
      return g ? { ...r, gapAfterHeads: g.heads, gapOrg: g.org } : r
    })
    .sort(byWaiting)
  const waiting = rows.filter((r) => r.waiting)
  const columns = showGap ? APPROVALS_COLUMNS : APPROVALS_COLUMNS.filter((c) => !c.key.startsWith('gap'))
  return {
    gaps: showGap ? gapsFigure(p, mineToDecide) : null,
    cards: rows.map((r) => cards.get(r.requestId)).filter((c): c is RequestCard => !!c),
    kpis: [
      requestKpi(
        ctx,
        'approvals-open',
        ID.queueOpen,
        'Waiting on you',
        rows,
        'Requests waiting on you',
        'approvals',
      ),
      requestKpi(
        ctx,
        'approvals-waiting',
        ID.queueWaiting,
        `Waiting on you ${set.waitingDays} or more days`,
        waiting,
        `Requests waiting on you ${set.waitingDays} or more days`,
        'approvals',
      ),
    ],
    rows: figure<RequestRecord>(
      REQUESTS_FIGURES.approvals,
      ID.queueOpen,
      'Requests waiting on you',
      rows,
      columns,
      me ? 'No request waits on you.' : 'Pick who you act as to see the requests waiting on you.',
      {
        subtitle: 'The steps assigned to you, the longest waiting first',
        note: showGap
          ? 'Gap after approval: the target org’s target less its asks with this request counted. Cost shows under this mode’s cost rules, else heads only.'
          : 'In heads, without band estimates.',
      },
    ),
  }
}

/** The gap after approval of each target org with a request waiting on you (one row per org). */
function gapsFigure(p: Prep, reqs: readonly HcRequest[]): FigureData<ApprovalGapRow> {
  const { ctx } = p
  const byOrg = new Map<string, ApprovalGapRow>()
  for (const r of reqs) {
    if (p.view(r) !== 'full') continue
    const g = gapAfterOf(ctx, r, { counted: true, visible: p.visible })
    if (!g || byOrg.has(g.orgKey)) continue
    byOrg.set(g.orgKey, { orgKey: g.orgKey, org: g.org, gapHeads: g.heads, gapCostUsd: g.cost, note: g.note })
  }
  const rows = [...byOrg.values()].sort((a, b) => a.org.localeCompare(b.org))
  const money = ctx.guard.mode === 'rounded' ? 'moneyM' : 'moneyFull'
  return figure<ApprovalGapRow>(
    REQUESTS_FIGURES.approvalsGaps,
    'targets.gap.cost',
    'Gap after approval by target org',
    rows,
    [
      { key: 'org', label: 'Target org', width: 26 },
      { key: 'gapHeads', label: 'Gap after approval (heads)', format: 'int' },
      { key: 'gapCostUsd', label: 'Gap after approval (USD)', format: money, cost: true },
      // The guard's reason where the gap's cost is "—": the export's Why column (14.1 item 2).
      { key: 'note', label: 'Note', width: 40, why: true },
    ],
    'No request waits on you.',
    {
      subtitle: 'Target less asks with each waiting request counted, as Targets > Gap shows it',
      note: 'Cost shows under this mode’s cost rules, else heads only with the reason.',
      uses: ['targets.targetHeads', 'targets.targetCost', ...USES],
    },
  )
}

/* ───────────── Cycle ───────────── */

/** "40th", "1st", "22nd", "13th". */
export function ordinal(n: number): string {
  const t = n % 100
  const s = t >= 11 && t <= 13 ? 'th' : n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th'
  return `${fmt(n, 'int')}${s}`
}

/**
 * One unit's line on the Cycle tab in words. While the cycle is open: where the cut line falls and
 * whether it was set or follows the target ("It counts at lock.": the lock applies the line shown,
 * D-CYCLE). After lock: what the lock decided, never a line over asks that are no longer pending.
 */
export function unitSentence(
  u: Pick<
    UnitAsks,
    'businessUnit' | 'cutAfter' | 'source' | 'targetHeads' | 'headsAbove' | 'headsBelow' | 'locked'
  >,
  fy: string,
): string {
  if (u.locked) {
    const l = u.locked
    const below = l.rejected
      ? `${plural(l.rejected, 'ask')} rejected below the cut line (${plural(l.rejectedHeads, 'head')})`
      : 'none below the cut line'
    return `${u.businessUnit}: at lock, ${plural(l.approved, 'ask')} approved (${plural(l.approvedHeads, 'head')}) and ${below}.`
  }
  if (u.cutAfter == null)
    return `${u.businessUnit} has no ${fy} target and no cut line: every ranked ask counts.`
  const where =
    u.cutAfter === 0
      ? 'falls before the first ranked head'
      : `falls after the ${ordinal(u.cutAfter)} ranked head`
  const from =
    u.source === 'set'
      ? ', where it was set'
      : `, from the ${fy} target of ${plural(u.targetHeads ?? 0, 'head')}`
  return `${u.businessUnit}: the cut line ${where}${from}. ${plural(u.headsAbove, 'head')} above, ${plural(u.headsBelow, 'head')} below. It counts at lock.`
}

function cycleOf(p: Prep, notSub: () => NotSubmittedRow[]): RequestsCycle {
  const { ctx, me } = p
  const cycle = cycleShown(ctx)
  const manager = ctx.access.mode === 'manager'
  const bandShown = ctx.access.can('cost:band')
  const facts: CycleFacts | null = cycle
    ? {
        cycleId: cycle.cycleId,
        fiscalYear: cycle.fiscalYear,
        stage: cycle.stage,
        asksDue: cycle.dates.asksDue,
        hrbpReviewDue: cycle.dates.hrbpReviewDue,
        leaderReviewDue: cycle.dates.leaderReviewDue,
        financeReviewDue: cycle.dates.financeReviewDue,
      }
    : null
  // The units in scope: HRBP its unit; Leader, Finance and HR admin the units of the asks in scope.
  const scopedIds = new Set(p.inScope.map((r) => r.requestId))
  const units = cycle
    ? new Set(p.inScope.filter((r) => r.cycleId === cycle.cycleId).map((r) => r.businessUnit))
    : new Set<string>()
  const lines = cycle ? unitAsks(p, cycle, units) : []
  const mgrName = (id: string) => p.nameOf(id)
  const rows: RankedAskRow[] = []
  for (const u of lines)
    for (const a of u.asks) {
      const r = a.request
      if (!scopedIds.has(r.requestId)) continue
      if (manager && r.requesterId !== me) continue
      const rec = p.row(r)
      if (!rec) continue
      const full = rec.view === 'full'
      const cut = manager || u.cutAfter == null ? null : a.above ? 'Above' : 'Below'
      rows.push({
        requestId: r.requestId,
        managerPositionId: r.managerPositionId,
        manager: full ? mgrName(r.requesterId) : null,
        priority: full ? r.priority : null,
        heads: a.heads,
        bandEstimateUsd: bandShown && full ? a.bandUsd : null,
        // A limited ask's band estimate is hidden, not missing: the export says why (EX-9).
        ...(full ? {} : { [WHY_KEY]: LIMITED_WHY_TEXT }),
        aboveCut: !manager && a.above,
        rank: a.rank,
        businessUnit: r.businessUnit,
        type: r.type,
        jobTitle: r.jobTitle,
        level: r.level,
        cumulativeHeads: a.cumulative,
        cut,
      })
    }
  const unitLines: CycleUnitLine[] = manager
    ? []
    : lines.map((u) => ({
        businessUnit: u.businessUnit,
        targetHeads: u.targetHeads,
        targetDate: u.targetDate,
        asksHeads: u.asksHeads,
        rankedHeads: u.rankedHeads,
        room: u.room,
        cutAfter: u.cutAfter,
        source: u.source,
        headsAbove: u.headsAbove,
        headsBelow: u.headsBelow,
        bandAbove: bandShown ? u.bandAbove : null,
        bandBelow: bandShown ? u.bandBelow : null,
        sentence: unitSentence(u, cycle?.fiscalYear ?? ''),
      }))
  const above = rows.filter((r) => r.aboveCut)
  const askRecords = rowsOf(
    p,
    rows.map((r) => p.inScope.find((x) => x.requestId === r.requestId) as HcRequest),
  )
  const aboveRecords = askRecords.filter((r) => above.some((a) => a.requestId === r.requestId))
  const notRows = manager ? [] : notSub()
  const selfSent =
    manager && me && openForAsks(ctx).length
      ? p.visible.some(
          (r) =>
            r.requesterId === me &&
            openForAsks(ctx).some((c) => c.cycleId === r.cycleId) &&
            r.state !== 'Draft',
        )
      : null
  const kpis: Kpi[] = cycle
    ? [
        requestKpi(
          ctx,
          'cycle-asks',
          ID.cycleAsks,
          manager ? 'Your ranked asks' : 'Ranked asks',
          askRecords,
          `Ranked asks for ${cycle.fiscalYear}`,
          'cycle',
          `${plural(
            rows.reduce((n, r) => n + r.heads, 0),
            'head',
          )}`,
        ),
        ...(manager
          ? []
          : [
              requestKpi(
                ctx,
                'cycle-above-cut',
                ID.cycleAboveCut,
                'Above the cut line',
                aboveRecords,
                `Ranked asks above the cut line for ${cycle.fiscalYear}`,
                'cycle',
                `${plural(
                  above.reduce((n, r) => n + r.heads, 0),
                  'head',
                )}`,
              ),
              notSubmittedKpi(p, notRows, 'cycle'),
            ]),
      ]
    : []
  const copy =
    !manager && cycle && cycle.stage === 'Open for asks' && ctx.access.can('action:cycle.copy-note')
  const noCycle = `${ctx.version?.fiscalYear ?? 'This year'} has no planning cycle yet. Finance opens one.`
  const out: Omit<RequestsCycle, 'cards'> = {
    kpis,
    cycle: facts,
    asks: figure(
      REQUESTS_FIGURES.cycleAsks,
      ID.cycleAsks,
      manager ? 'Your ranked asks' : 'Ranked asks against the target',
      rows,
      manager ? ASK_COLUMNS.filter((c) => c.key !== 'cut' && c.key !== 'bandEstimateUsd') : ASK_COLUMNS,
      cycle
        ? manager
          ? 'You have sent no ranked asks to this cycle.'
          : 'No ranked asks in scope yet.'
        : noCycle,
      {
        subtitle: cycle
          ? `${cycle.fiscalYear} cycle, ${cycle.stage}: each unit's asks in rank order${manager ? '' : ', with the cut line'}`
          : undefined,
        note: manager
          ? 'Heads only. Where each ask lands is decided in review and shown when the cycle locks.'
          : cycle?.stage === 'Locked'
            ? 'The lock’s outcome: asks above the cut line were approved, asks below it were rejected.'
            : 'Heads and in-year band estimate at the target date. Until a line is set, the cut line follows the target, and the lock applies the line shown.',
        uses: CYCLE_USES,
      },
    ),
    notSubmitted: figure(
      REQUESTS_FIGURES.cycleNotSubmitted,
      ID.cycleNotSubmitted,
      'Managers who have not submitted',
      notRows,
      NOT_SUBMITTED_COLUMNS,
      manager
        ? 'Your own asks show above.'
        : openForAsks(ctx).length
          ? 'Every manager in scope has sent ranked asks.'
          : 'No cycle is open for asks.',
      {
        ...(openForAsks(ctx)[0]
          ? { subtitle: `Asks due ${formatDate(openForAsks(ctx)[0].dates.asksDue)}` }
          : {}),
        uses: CYCLE_USES,
      },
    ),
    units: unitLines,
    cutShown: !manager,
    copyNote: copy && cycle ? cycleNote(cycle) : null,
    mineSent: selfSent,
    controls: cycleControlsOf(p, cycle, lines),
    open: cycleOpenOf(ctx),
  }
  // The asks the viewer may change in HRBP review (none outside it, so nothing is built then).
  const review = !manager && cycle?.stage === 'HRBP review'
  return lazy(out, 'cards', () =>
    review
      ? cardsOf(
          p,
          rows.map((r) => p.inScope.find((x) => x.requestId === r.requestId) as HcRequest),
          { cycle: true },
        ).filter((c) => c.can.approveWithChanges)
      : [],
  )
}

/* ───────────── the model ───────────── */

/** The managers in scope with no ask sent to the open cycle (the Queue's and the Cycle's lists). */
export function notSubmittedRows(p: Prep, withRoots = false): NotSubmittedRow[] {
  const open = openForAsks(p.ctx)[0]
  if (!open) return []
  const holder = holdingsOn(p.ctx.all.workers, p.ctx.asOf).holderOf
  const managers = managersInScope(p, holder).filter(
    (m) =>
      withRoots ||
      !(p.ctx.access.scope?.kind === 'tree' && p.ctx.access.scope.rootPositionIds.has(m.positionId)),
  )
  return notSubmittedIn(p, open, managers).map((m: ManagerSeat) => ({
    managerPositionId: m.positionId,
    employeeId: m.employeeId,
    manager: m.name,
    businessUnit: m.businessUnit,
    title: m.title,
    department: m.department,
  }))
}

const models = new WeakMap<AnalyticsContext, RequestsModel>()

/**
 * Defines `key` on `obj` as an enumerable property computed on first read (and kept), so the heavy
 * parts of the model (New's seats and quotes, Mine's cards) cost nothing for a reader that never opens
 * them (the homes read the queue and the Approvals KPIs only). A crawl that walks the model reads it.
 */
function lazy<T extends object, K extends string, V>(obj: T, key: K, make: () => V): T & Record<K, V> {
  let value: V
  let made = false
  Object.defineProperty(obj, key, {
    enumerable: true,
    configurable: false,
    get() {
      if (!made) {
        value = make()
        made = true
      }
      return value
    },
  })
  return obj as T & Record<K, V>
}

/** A workspace file button: offered by its action's decision (`action:<id>`), else the policy's reason. */
function fileButton(ctx: AnalyticsContext, id: 'request.import' | 'export.requests'): FileButton {
  const d = ctx.access.decide(`action:${id}`)
  return d.access === 'hidden' ? { shown: false, why: d.how ?? null } : { shown: true, why: null }
}

/** The Requests view's model for a context (cached per context). */
export function requestsModel(ctx: AnalyticsContext): RequestsModel {
  const hit = models.get(ctx)
  if (hit) return hit
  const p = prepOf(ctx)
  let notSub: NotSubmittedRow[] | null = null
  const managers = () => {
    notSub ??= notSubmittedRows(p)
    return notSub
  }
  const model: RequestsModel = {
    queue: queueOf(p, managers),
    mine: mineOf(p),
    approvals: approvalsOf(p),
    cycle: cycleOf(p, managers),
  } as RequestsModel
  lazy(model, 'new', () => requestsNewOf(ctx))
  models.set(ctx, model)
  return model
}

/** The folder tab's number: requests waiting 5 or more days (9.1), over the rows the viewer may see. */
export function requestsHeadline(ctx: AnalyticsContext): Headline {
  const p = prepOf(ctx)
  const n = scopedRows(p).filter((r) => isPendingState(r.state) && r.waiting).length
  return {
    value: fmt(n, 'int'),
    label: `waiting ${p.set.waitingDays}+ days`,
    metricId: ID.queueWaiting,
    uses: USES,
  }
}
