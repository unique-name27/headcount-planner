/**
 * The Requests view's Action center items (docs/PLAN.md 9.6): approvals waiting on a step's approver
 * (`requests:waiting` replaces the request's `requests:approve` item for the approver once the step
 * has waited 5 or more days, so a request is one line), sent-back requests (owner the requester),
 * managers who have not submitted while the cycle is open, the two backfill flags, and trade credit
 * about to lapse (owner the holder of the trade's `giveOrgPositionId`, or the nearest manager above
 * when it is vacant). Approval items set `snoozeOnly` (they close by request state). Built over the
 * requests the viewer may see (8.4 rules 3 and 6), from the cached `requestsModel`; no amount in
 * `what` or `note` ("Trade credit of 0.91 standard heads held by <org> lapses when FY27 closes").
 *
 * Readings taken here (the views-3 builder's):
 *  - The items are about the requests in the mode's scope and the filters (the rows the lists
 *    show), so an item and its records agree; the Action center keeps them to the scope again.
 *  - An approval item is due when its step reaches the waiting setting's days; `requests:waiting`
 *    and `requests:approve` share the request's matter, so the Action center lists one of them
 *    (the waiting item, the more pressing) in every mode, HR admin's full list included.
 *  - A sent-back request is due on the day it would expire (the idle-days setting), unless it is a
 *    cycle ask while its cycle is open (cycle asks never expire then).
 *  - A backfill flag is raised on a pending Backfill (`backfillFlag`: the named seat was created
 *    within the window of a known exit in the same department of the same unit and has no exit, or
 *    it has no exit), owned by the unit's HRBP from the Units list. A known exit is the last day of
 *    an Employee assignment; a contractor's or an intern's end is not one.
 *  - Managers not submitted: one item per manager in scope with no ask sent to a cycle Open for
 *    asks, due on the asks date, its note the Cycle tab's Copy note.
 *  - Trade credit: one item per giving org whose credit for the as-of fiscal year is above 0.
 *  - A limited request (8.4 rule 2: an Elimination or a change to a Filled seat, seen by a Leader or
 *    Finance off its chain) raises no item, unless the viewer is its waiting step's approver: that
 *    item names the viewer only, never the requester.
 *  - A request waiting on the Acting as person raises its approval item whatever the mode's scope
 *    (an approver on the chain sees the request, 8.4 rule 1), as Approvals lists it.
 *  - Dates are business dates (R47): a step waits from the day it was entered, a sent-back request
 *    idles from its last change, and a stored date after the as-of date reads as the as-of date.
 *  - Each request is read in its effective state (./base.ts): an expired one raises no item.
 *  - Labels name the request by ID, type and title; Manager mode reads the title through
 *    `managerText` (src/drill/requestRecord.ts `titleFor`).
 *
 * Frozen in the M2 freeze (docs/CONTRACTS-M2.md); the views-3 builder filled `requestsActions`.
 */

import { teamOf } from '@/access/copy'
import type { ItemKind } from '@/access/ids'
import { contextLists } from '@/access/lists'
import { holdingsOn, upward } from '@/access/scopes/people'
import type { AnalyticsContext } from '@/data/context'
import { fiscalYearOf, fyRange } from '@/data/fiscal'
import { unitHrbps } from '@/data/lists/roles'
import type { FieldRef } from '@/data/quality/fieldRef'
import type { ISODate } from '@/data/schema'
import { titleFor } from '@/drill/requestRecord'
import { drillSpec } from '@/drill/types'
import { addDays, dateOf, formatDate, onAsOf } from '@/lib/dates'
import { plural } from '@/lib/format'
import { toAssignments } from '@/plan/engine/heads'
import { backfillFlag } from '@/plan/engine/requests'
import { creditBalance, standardHeads, tradeYearOf } from '@/plan/engine/trade'
import type { HcRequest } from '@/plan/types'
import type { ActionItem, ActionOwnerRole } from '../../types'
import { isPendingState, type Prep, prepOf, ROLE_WORD } from './base'
import { cycleNote, openForAsks } from './cycle'
import { notSubmittedRows } from './index'

/** The item kinds this view raises (every one in src/access/ids.ts `ITEM_KINDS`). */
export const REQUESTS_ITEM_KINDS = [
  'requests:approve',
  'requests:waiting',
  'requests:sent-back',
  'requests:not-submitted',
  'requests:backfill-new-position',
  'requests:backfill-no-exit',
  'requests:trade-credit-lapse',
] as const satisfies readonly ItemKind[]

const USES: readonly FieldRef[] = [
  'requests.requestId',
  'requests.type',
  'requests.state',
  'requests.positionId',
  'requests.businessUnit',
  'requests.managerPositionId',
  'requests.requesterId',
  'requests.updatedAt',
  'requests.steps',
]
const CYCLE_USES: readonly FieldRef[] = [
  ...USES,
  'requests.cycleId',
  'requests.priority',
  'positions.managerPositionId',
  'workers.positionId',
]
const BACKFILL_USES: readonly FieldRef[] = [
  ...USES,
  'positions.effectiveDate',
  'positions.department',
  'workers.positionId',
  'workers.assignmentEnd',
  'workers.terminationDate',
]
const TRADE_USES: readonly FieldRef[] = [
  'requests.requestId',
  'requests.type',
  'requests.state',
  'requests.startDate',
  'requests.giveOrgPositionId',
  'requests.creditUsedBp',
  'requests.creditBp',
]

/** "Request R-1025: Backfill, Verification engineer": IDs, type and title only (8.4's limited fields). */
function requestLabel(p: Prep, r: HcRequest): string {
  const title = titleFor(r.jobTitle, p.viewer)
  return `Request ${r.requestId}: ${r.type}${title ? `, ${title}` : ''}`
}

/** The request's own records, as the viewer may see it. */
function requestDrill(p: Prep, r: HcRequest) {
  return () => {
    const row = p.row(r)
    return row ? drillSpec({ kind: 'requests', title: requestLabel(p, r), rows: [row] }) : null
  }
}

/** Where a request sits: the seat it names, else the org it sits under (an org item names its head seat). */
function placeOf(r: HcRequest): ActionItem['place'] {
  return {
    positionId: r.positionId ?? r.managerPositionId ?? null,
    businessUnit: r.businessUnit,
    department: r.department,
    costCenter: r.costCenter,
    location: r.location,
  }
}

const roleOf = (role: string): ActionOwnerRole =>
  role === 'manager' || role === 'hrbp' || role === 'leader' || role === 'finance' ? role : 'hrbp'

/** The approval items: one per request waiting on a step (`approve`, or `waiting` once it has waited long enough). */
function approvalItems(p: Prep, reqs: readonly HcRequest[]): ActionItem[] {
  const out: ActionItem[] = []
  const { set } = p
  for (const r of reqs) {
    const w = p.waitOf(r)
    if (!w) continue
    // A limited request (8.4 rule 2) names nobody: only its own approver gets an item, owned by them.
    const limited = p.view(r) === 'limited'
    if (limited && w.step.approverId !== p.me) continue
    const entered = dateOf(onAsOf(w.step.enteredAt ?? p.ctx.asOf, p.ctx.asOf))
    const due = addDays(entered, set.waitingDays)
    const owner = p.nameOf(w.step.approverId) ?? ROLE_WORD[w.step.role]
    const long = w.days >= set.waitingDays
    const kind = long ? 'waiting' : 'approve'
    out.push({
      id: `requests:${kind}:${r.requestId}`,
      ownerRole: roleOf(w.step.role),
      ownerId: w.step.approverId,
      ownerName: owner,
      requesterId: limited ? null : r.requesterId,
      approverId: w.step.approverId,
      due,
      severity: long ? 'warning' : 'info',
      what: long
        ? `${r.type} request has waited ${plural(w.days, 'day')} at the ${ROLE_WORD[w.step.role]} step`
        : `${r.type} request waits on the ${ROLE_WORD[w.step.role]} step`,
      subject: { kind: 'requests', id: r.requestId, label: requestLabel(p, r) },
      view: 'requests',
      tab: 'approvals',
      drill: requestDrill(p, r),
      note: long
        ? 'Could you let me know when you expect to decide on it?'
        : 'Could you approve it, send it back or reject it this week?',
      uses: USES,
      kind: long ? 'Request waiting on a step' : 'Request to decide',
      matter: `request:${r.requestId}`,
      fingerprint: `${w.step.n}`,
      closesWhen: 'Closes when the step is decided',
      place: placeOf(r),
      snoozeOnly: true,
    })
  }
  return out
}

/** Sent-back requests: owned by the requester, due on the day they would expire. */
function sentBackItems(p: Prep, reqs: readonly HcRequest[]): ActionItem[] {
  const { ctx, set } = p
  const out: ActionItem[] = []
  for (const r of reqs) {
    if (r.state !== 'Sent back') continue
    const inOpenCycle =
      !!r.cycleId && (ctx.plan?.cycles ?? []).some((c) => c.cycleId === r.cycleId && c.stage !== 'Locked')
    const stored = r.updatedAt || r.submittedAt
    const since = stored ? dateOf(onAsOf(stored, ctx.asOf)) : ''
    const due: ISODate | null = !inOpenCycle && since ? addDays(since, set.idleDays) : null
    const back = [...r.steps].reverse().find((s) => s.decision === 'Sent back')
    out.push({
      id: `requests:sent-back:${r.requestId}`,
      ownerRole: 'manager',
      ownerId: r.requesterId,
      ownerName: p.nameOf(r.requesterId) ?? 'Managers',
      requesterId: r.requesterId,
      approverId: null,
      due,
      severity: 'info',
      what: `${r.type} request was sent back${back ? ` at the ${ROLE_WORD[back.role]} step` : ''}`,
      subject: { kind: 'requests', id: r.requestId, label: requestLabel(p, r) },
      view: 'requests',
      tab: 'mine',
      drill: requestDrill(p, r),
      note: 'Could you update the request and submit it again?',
      uses: USES,
      kind: 'Request sent back',
      closesWhen: 'Closes when the request is submitted again or withdrawn',
      place: placeOf(r),
      forOwner: { what: `Your ${r.type.toLowerCase()} request was sent back` },
    })
  }
  return out
}

/** Managers in scope with no ranked ask sent to the cycle open for asks. */
function notSubmittedItems(p: Prep): ActionItem[] {
  const cycle = openForAsks(p.ctx)[0]
  if (!cycle) return []
  const note = cycleNote(cycle)
  return notSubmittedRows(p, true).map(
    (m): ActionItem => ({
      id: `requests:not-submitted:${cycle.cycleId}:${m.employeeId}`,
      ownerRole: 'manager',
      ownerId: m.employeeId,
      ownerName: m.manager,
      due: cycle.dates.asksDue,
      severity: 'info',
      what: `No ranked asks sent for ${cycle.fiscalYear} yet`,
      subject: { kind: 'none', label: teamOf(m.manager) },
      view: 'requests',
      tab: 'cycle',
      note,
      uses: CYCLE_USES,
      kind: 'Ranked asks not sent',
      closesWhen: 'Closes when the manager sends a ranked ask',
      place: {
        positionId: m.managerPositionId,
        businessUnit: m.businessUnit,
        department: m.department,
      },
      batch: { key: `cycle:${cycle.cycleId}`, label: `the ${cycle.fiscalYear} cycle` },
      forOwner: {
        what: `Your ranked asks for ${cycle.fiscalYear} are not in yet, due ${formatDate(cycle.dates.asksDue)}`,
        subject: 'Your team',
      },
    }),
  )
}

/** The pending Backfills' flags (15.1 R9), owned by the unit's HRBP. */
function backfillItems(p: Prep, reqs: readonly HcRequest[]): ActionItem[] {
  const { ctx, set } = p
  const backfills = reqs.filter((r) => r.type === 'Backfill' && isPendingState(r.state) && r.positionId)
  if (!backfills.length) return []
  const lists = contextLists(ctx)
  const hrbps = lists ? unitHrbps(lists) : new Map<string, string>()
  const flagCtx = backfillContext(ctx, set.backfillWindowDays)
  const out: ActionItem[] = []
  for (const r of backfills) {
    const flag = backfillFlag(r, flagCtx)
    if (!flag) continue
    const hrbp = hrbps.get(r.businessUnit) ?? null
    out.push({
      id: `requests:${flag}:${r.requestId}`,
      ownerRole: 'hrbp',
      ownerId: hrbp,
      ownerName: (hrbp && p.nameOf(hrbp)) || 'HR business partners',
      requesterId: r.requesterId,
      due: null,
      severity: 'warning',
      what:
        flag === 'backfill-new-position'
          ? `Backfill names a seat created within ${plural(set.backfillWindowDays, 'day')} of an exit in the same department`
          : 'Backfill names a seat with no exit',
      subject: { kind: 'requests', id: r.requestId, label: requestLabel(p, r) },
      view: 'requests',
      tab: 'queue',
      drill: requestDrill(p, r),
      note: 'Could you confirm which seat this backfill is for before it is approved?',
      uses: BACKFILL_USES,
      kind: flag === 'backfill-new-position' ? 'Backfill on a new position' : 'Backfill with no exit',
      closesWhen: 'Closes when the request is approved, rejected or withdrawn',
      place: placeOf(r),
    })
  }
  return out
}

/** What `backfillFlag` reads, from the loaded data (memoized per data). */
const flagMemo = new WeakMap<object, Map<number, Parameters<typeof backfillFlag>[1]>>()
function backfillContext(ctx: AnalyticsContext, windowDays: number): Parameters<typeof backfillFlag>[1] {
  let byWindow = flagMemo.get(ctx.all)
  if (!byWindow) {
    byWindow = new Map()
    flagMemo.set(ctx.all, byWindow)
  }
  const hit = byWindow.get(windowDays)
  if (hit) return hit
  // A seat's known exits: the last days of its Employee assignments (heads.ts `toAssignments`);
  // a contractor's or an intern's end is not an exit (they count 0 heads).
  const exits = new Map<string, ISODate[]>()
  for (const a of toAssignments(ctx.all.workers)) {
    if (!a.positionId || !a.end || a.workerType !== 'Employee') continue
    const list = exits.get(a.positionId)
    if (list) list.push(a.end)
    else exits.set(a.positionId, [a.end])
  }
  // The org a seat sits in: its latest row's department within its unit (one name may sit in two units).
  const firstRow = new Map<string, ISODate>()
  const latest = new Map<string, { effectiveDate: string; org: string }>()
  for (const r of ctx.all.positions) {
    const seen = firstRow.get(r.positionId)
    if (!seen || r.effectiveDate < seen) firstRow.set(r.positionId, r.effectiveDate)
    const cur = latest.get(r.positionId)
    if (!cur || r.effectiveDate >= cur.effectiveDate)
      latest.set(r.positionId, {
        effectiveDate: r.effectiveDate,
        org: `${r.businessUnit}|${r.department ?? ''}`,
      })
  }
  const byOrg = new Map<string, ISODate[]>()
  for (const [id, list] of exits) {
    const org = latest.get(id)?.org ?? ''
    const d = byOrg.get(org)
    if (d) d.push(...list)
    else byOrg.set(org, [...list])
  }
  const out: Parameters<typeof backfillFlag>[1] = {
    createdOn: (id) => firstRow.get(id) ?? null,
    exitsOf: (id) => exits.get(id) ?? [],
    orgExits: (id) => byOrg.get(latest.get(id)?.org ?? '') ?? [],
    windowDays,
  }
  byWindow.set(windowDays, out)
  return out
}

/** Trade credit held by a giving org for the as-of fiscal year: it lapses when the year closes (11.2). */
function creditItems(p: Prep, reqs: readonly HcRequest[]): ActionItem[] {
  const { ctx } = p
  const year = fiscalYearOf(ctx.asOf)
  const orgs = new Set<string>()
  for (const r of reqs)
    if (r.type === 'Trade' && r.trade?.giveOrgPositionId && tradeYearOf(r) === year)
      orgs.add(r.trade.giveOrgPositionId)
  if (!orgs.size) return []
  const holder = holdingsOn(ctx.all.workers, ctx.asOf).holderOf
  const out: ActionItem[] = []
  for (const org of [...orgs].sort()) {
    const bp = creditBalance(p.visible, org, year)
    if (bp <= 0) continue
    // The holder of the giving org's seat; if vacant, the nearest held seat above (11.2).
    const seat = upward(org, ctx.positionIndex).find((id) => holder.has(id)) ?? null
    const owner = seat ? (holder.get(seat) ?? null) : null
    const ownerName = (owner && p.nameOf(owner)) || 'Managers'
    const orgName = holder.get(org)
      ? teamOf(p.nameOf(holder.get(org) as string) ?? org)
      : `The org under ${org}`
    const end = fyRange(year).end
    out.push({
      id: `requests:trade-credit-lapse:${org}:${year}`,
      ownerRole: 'manager',
      ownerId: owner,
      ownerName,
      due: end,
      severity: 'info',
      what: `Trade credit of ${standardHeads(bp)} standard heads held by ${orgName} lapses when ${year} closes`,
      subject: { kind: 'none', label: orgName },
      view: 'requests',
      tab: 'mine',
      note: `Could you decide whether to use the credit in a trade before ${formatDate(end)}?`,
      uses: TRADE_USES,
      kind: 'Trade credit about to lapse',
      fingerprint: `${bp}`,
      closesWhen: 'Closes when the credit is used or the fiscal year closes',
      place: {
        positionId: org,
        businessUnit: ctx.positionIndex.byId.get(org)?.businessUnit ?? null,
        department: null,
      },
    })
  }
  return out
}

const cache = new WeakMap<AnalyticsContext, ActionItem[]>()

/** The Requests view's open items for the Action center. */
export function requestsActions(ctx: AnalyticsContext): ActionItem[] {
  const hit = cache.get(ctx)
  if (hit) return hit
  const p = prepOf(ctx)
  // Every item is about a request the viewer may see, in scope (8.4 rules 3 and 6); a limited one
  // raises only its own approver's item, since its people, reasons and flags are not shown (rule 2).
  const seen = p.inScope.filter((r) => p.view(r) !== 'none')
  const full = seen.filter((r) => p.view(r) === 'full')
  // The requests waiting on the Acting as person, whatever the scope (as Approvals lists them).
  const ids = new Set(seen.map((r) => r.requestId))
  const mine = p.me
    ? p.visible.filter((r) => !ids.has(r.requestId) && p.waitOf(r)?.step.approverId === p.me)
    : []
  const out = [
    ...approvalItems(p, [...seen, ...mine]),
    ...sentBackItems(p, full),
    ...notSubmittedItems(p),
    ...backfillItems(p, full),
    ...creditItems(p, full),
  ]
  cache.set(ctx, out)
  return out
}
