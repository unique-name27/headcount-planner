/**
 * Merging (docs/PLAN.md 5.5, 15.1 R17): Import requests by `requestId` (the later revision wins; a
 * request changed on both sides since the last merge is a conflict listed for a choice), and HR
 * admin's workspace Merge. Built by engines C in M1. Pure.
 *
 * - In Leader mode with a tree scope (not CEO, CFO or CHRO), a request merges only when it touches a
 *   position in the Leader's tree or the Leader is on its approval chain (`accept`); others are
 *   skipped and the workspace's copy is never overwritten.
 * - The summary and the conflict list count and show only requests whose `requestView` for the
 *   importer is not 'none' (`visible`), so a skipped request about the importer's own seat changes no
 *   number.
 * - Message: "Merged 14 requests from 6 files, 2 conflicts" (the sample's six manager files) once
 *   merged; before, the preview says "Merges 14 requests from 6 files; 2 conflicts to choose"
 *   (`mergePreviewText`, M3 review UI-11).
 *
 * Times (M3 review IN-12): stamps are compared as times, not as text (`stampMs`): a stamp with an
 * offset reads at its instant, and one with no zone (the sample's "2026-09-23T14:05") reads as UTC,
 * so a result never depends on the machine's time zone. validate.ts refuses a stamp that is no ISO
 * date-time.
 *
 * Which stamp (M3 recheck): a copy's revision (`revisionOf`) is its `revisedAt`, the wall-clock time
 * of its last change, else its `updatedAt`. `updatedAt` is a business time (R47: the as-of date with
 * the wall clock's time of day), so on one as-of date a later change made on a later wall-clock day
 * can carry an earlier `updatedAt`; the rules below compare revisions, and the merge base records
 * them.
 *
 * The rules, request by request:
 *  1. Of the copies in the files that `accept` takes, the one with the latest revision is the
 *     incoming copy (a later file wins a tie). A request whose workspace copy `accept` refuses is
 *     skipped too, so the workspace's copy of a request outside the importer's org never changes.
 *     Two file copies that diverged (each holds work the other lacks, as in 5b) are a conflict
 *     between the workspace's copy, else the other file copy, and the latest one (M3 recheck), so
 *     one Import requests of both files reads as importing them one at a time does.
 *  2. An ID clash (M3 review IN-1): copies of one ID that are two requests (another requester or
 *     type, or another `createdAt`: minted at another time, M3 recheck) are listed as a conflict of
 *     kind 'clash', with no choice: neither is merged and neither is dropped.
 *  3. Not in the workspace: added.
 *  4. The same content as the workspace's copy: nothing changes.
 *  5. A conflict, kept as the workspace's copy and listed for a choice (`chooseConflict`):
 *      a. both copies changed since the last merge (their revisions are both later than the merge
 *         base), or both carry the same revision with different content;
 *      b. the copies diverged (M3 review IN-3, IN-4): each holds a comment or a step decision the
 *         other lacks, with or without a merge base, so neither side's work is lost;
 *      c. the workspace's copy is decided (Approved, Approved with changes, Rejected or Withdrawn)
 *         and a later file copy is not: a file never takes a decision back.
 *     With no merge base for the request and no divergence, the workspace's copy counts as
 *     unchanged. A file copy at or before the merge base has not changed since that merge, so an old
 *     file imported again after a newer one is never a conflict.
 *  6. A decision that cannot take effect here (lead decision D-MERGE): a copy that arrives Approved
 *     or Approved with changes over one that is not is asked of `effectRefusal`; a sentence makes it
 *     a conflict of kind 'effect' that names why, with no choice, and nothing changes.
 *  7. Otherwise the later revision wins (so a stale file copy is ignored). When the workspace's
 *     copy wins, the merge base stays where it was (M3 review IN-3): it records what the files last
 *     brought, never this workspace's own later change.
 * Merged counts requests added or replaced; a request counts once however many files carry it. The
 * new merge base records every request merged or found the same, except conflicts, whose base stays
 * until chosen. `decided` lists every request the merge moves into Approved or Approved with changes,
 * for the write path to apply its effects in this workspace (D-MERGE).
 */
import {
  APPROVED_REQUEST_STATES,
  DATASETS,
  type DatasetKey,
  type FreezeRow,
  type ISODateTime,
} from '@/data/schema'
import { canonicalJson } from '../canonical'
import type { AnyVersion, AssumptionRow, DatasetOverlay, HcRequest, PlanState } from '../types'
import { stampMs } from './stamps'
import { hashMismatchText } from './validate'

export interface MergeOptions {
  /** Each request's revision (`revisionOf`) at the last merge (`PlanState.mergeBase`). */
  base: ReadonlyMap<string, ISODateTime>
  /** Whether a request may merge for the importer (Leader tree rule); default all. */
  accept?(req: HcRequest): boolean
  /** Whether the importer may see a request at all (`requestView` not 'none'); default all. */
  visible?(req: HcRequest): boolean
  /**
   * Why a copy that arrives Approved or Approved with changes cannot take effect in this workspace
   * (rule 6, D-MERGE), as one sentence; null when it can. `current` is the workspace's copy, or null
   * for a request new to it. Default: every decision can take effect.
   */
  effectRefusal?(incoming: HcRequest, current: HcRequest | null): string | null
  /**
   * HR admin's Merge (`mergePlanState`): this workspace's freezes in force (its datasets' and its
   * overlay's), to tell another workspace's freeze that carries one of their IDs (`freezeClashes`).
   * Default: the overlay's.
   */
  freezes?: readonly FreezeRow[]
}

/**
 * Why a request is listed: 'changed' on both sides (a choice: keep the workspace's copy or take the
 * file's); an ID 'clash' (two requests carry the ID: never merged, never dropped, no choice); an
 * 'effect' that cannot apply here (the file's decision: nothing changes, no choice).
 */
export type ConflictKind = 'changed' | 'clash' | 'effect'

export interface MergeConflict {
  requestId: string
  current: HcRequest
  incoming: HcRequest
  /** Absent reads 'changed'. */
  kind?: ConflictKind
  /** The sentence for a 'clash' or an 'effect' (no amount, no name). */
  reason?: string
  /**
   * How the importer sees the request, when a preview cut the copies to that view (M3 recheck:
   * src/views/data/engine/workspace.ts `conflictAsSeen`); absent on the merge's own conflicts.
   */
  view?: 'full' | 'limited'
}

/** A request the merge moves into Approved or Approved with changes (D-MERGE). */
export interface DecidedArrival {
  requestId: string
  /** The workspace's copy before the merge; null for a request new to the workspace. */
  before: HcRequest | null
  after: HcRequest
}

export interface MergeResult {
  /** Every request after the merge (conflicts keep the workspace's copy until chosen). */
  requests: HcRequest[]
  /** Visible requests merged (added or replaced by a later updatedAt). */
  merged: number
  files: number
  conflicts: readonly MergeConflict[]
  skipped: number
  /** The new merge base. */
  base: { requestId: string; updatedAt: ISODateTime }[]
  /** The requests the merge moves into a decision with effects, for the write path to apply. */
  decided: readonly DecidedArrival[]
  /** After the merge: "Merged 14 requests from 6 files, 2 conflicts" (conflicts to choose). */
  summary: string
  /** Before the merge: "Merges 14 requests from 6 files; 2 conflicts to choose" (`mergePreviewText`). */
  preview: string
}

/** Whether two requests differ in any field (canonical JSON, so key order never counts). */
function differs(a: HcRequest, b: HcRequest): boolean {
  return canonicalJson(a) !== canonicalJson(b)
}

/** A stamp as a time (./stamps.ts): what the rules compare. */
export { stampMs }

/** a is later than b, as times. */
const later = (a: string | null | undefined, b: string | null | undefined): boolean => stampMs(a) > stampMs(b)

/**
 * The stamp the rules compare (M3 recheck): the copy's wall-clock revision, else its business update
 * time (a copy made before `revisedAt`, the sample's and the dataset's).
 */
export const revisionOf = (r: Pick<HcRequest, 'revisedAt' | 'updatedAt'>): ISODateTime =>
  r.revisedAt ?? r.updatedAt

/** Decided for good: a later file copy that is not never takes it back (rule 5c). */
const DECIDED: ReadonlySet<HcRequest['state']> = new Set([
  'Approved',
  'Approved with changes',
  'Rejected',
  'Withdrawn',
])

const isApproval = (r: HcRequest | null | undefined): boolean =>
  !!r && (APPROVED_REQUEST_STATES as readonly string[]).includes(r.state)

/** Whether `a` holds a comment or a step decision `b` lacks (rule 5b). */
function holdsMore(a: HcRequest, b: HcRequest): boolean {
  const ids = new Set(b.comments.map((c) => c.id))
  if (a.comments.some((c) => !ids.has(c.id))) return true
  return a.steps.some((s) => s.decision != null && b.steps.find((x) => x.n === s.n)?.decision !== s.decision)
}

/** Two copies that each hold work the other lacks (rule 5b). */
const diverged = (a: HcRequest, b: HcRequest): boolean => holdsMore(a, b) && holdsMore(b, a)

/**
 * Two copies of one ID that are two requests (rule 2): another requester or another type, or minted
 * at another time (both carry a `createdAt` and they differ: M3 recheck, a restored workspace).
 */
const clashes = (a: HcRequest, b: HcRequest): boolean =>
  a.requesterId !== b.requesterId ||
  a.type !== b.type ||
  (!!a.createdAt && !!b.createdAt && a.createdAt !== b.createdAt)

/** The sentence an ID clash is listed with. */
export const ID_CLASH_TEXT =
  'Two different requests carry this ID, so neither is merged and neither is dropped. Ask whoever sent the file to raise it again.'

const byRequestId = (a: { requestId: string }, b: { requestId: string }): number =>
  a.requestId < b.requestId ? -1 : a.requestId > b.requestId ? 1 : 0

const baseList = (base: ReadonlyMap<string, ISODateTime>): { requestId: string; updatedAt: ISODateTime }[] =>
  [...base].map(([requestId, updatedAt]) => ({ requestId, updatedAt })).sort(byRequestId)

/** A merge base as the map `mergeRequests` reads (`PlanState.mergeBase` to `MergeOptions.base`). */
export function mergeBaseMap(
  base: readonly { requestId: string; updatedAt: ISODateTime }[],
): ReadonlyMap<string, ISODateTime> {
  return new Map(base.map((b) => [b.requestId, b.updatedAt]))
}

/** Whether a conflict waits for a choice ('changed'), or can only be listed ('clash', 'effect'). */
export const isChoosable = (c: MergeConflict): boolean => (c.kind ?? 'changed') === 'changed'

/**
 * Merges the requests of several files into the workspace's (see the module comment).
 *
 * Fixture: workspace/mergeRequests.test.ts in wave 2 (the six sample files: "Merged 14 requests from 6
 * files, 2 conflicts").
 */
export function mergeRequests(
  current: readonly HcRequest[],
  files: readonly (readonly HcRequest[])[],
  options: MergeOptions,
): MergeResult {
  const accept = options.accept ?? (() => true)
  const visible = options.visible ?? (() => true)
  const effectRefusal = options.effectRefusal ?? (() => null)
  const shown = (...copies: HcRequest[]) => copies.every((r) => visible(r))

  // 1. The incoming copy of each request: the latest revision among the accepted copies of the
  // request the first file names; 2. a copy of the ID that is another request is kept apart.
  const incoming = new Map<string, HcRequest>()
  const copiesOf = new Map<string, HcRequest[]>()
  const clashOf = new Map<string, HcRequest>()
  const order: string[] = []
  const refused = new Map<string, HcRequest>()
  for (const file of files) {
    for (const req of file) {
      if (!accept(req)) {
        refused.set(req.requestId, req)
        continue
      }
      const prev = incoming.get(req.requestId)
      if (!prev) order.push(req.requestId)
      else if (clashes(prev, req)) {
        if (!clashOf.has(req.requestId)) clashOf.set(req.requestId, req)
        continue
      }
      const copies = copiesOf.get(req.requestId)
      if (copies) copies.push(req)
      else copiesOf.set(req.requestId, [req])
      if (!prev || !later(revisionOf(prev), revisionOf(req))) incoming.set(req.requestId, req)
    }
  }

  const requests = [...current]
  const at = new Map(requests.map((r, i) => [r.requestId, i]))
  const base = new Map(options.base)
  const merged = new Set<string>()
  const skipped = new Set<string>()
  const conflicts: MergeConflict[] = []
  const decided: DecidedArrival[] = []
  const list = (c: MergeConflict) => {
    if (shown(c.current, c.incoming)) conflicts.push(c)
  }

  for (const [id, req] of refused) if (!incoming.has(id) && shown(req)) skipped.add(id)

  for (const id of order) {
    const first = incoming.get(id) as HcRequest
    const i = at.get(id)
    const mine = i === undefined ? null : requests[i]
    if (mine && !accept(mine)) {
      // The workspace's copy is outside what the importer may merge: never overwritten.
      if (shown(mine, first)) skipped.add(id)
      continue
    }
    // 2. Two requests behind one ID, between the files or a file's and the workspace's: the one
    // that is another request is listed; a file's copy of the workspace's own request goes on.
    const other = clashOf.get(id) ?? null
    let theirs: HcRequest | null = first
    let clash: HcRequest | null = other
    if (mine && clashes(mine, first)) {
      clash = first
      theirs = other && !clashes(mine, other) ? other : null
    }
    if (clash)
      list({ requestId: id, current: mine ?? first, incoming: clash, kind: 'clash', reason: ID_CLASH_TEXT })
    if (!theirs || (!mine && clash)) continue
    // 1. Two file copies that diverged (M3 recheck): the latest one is never taken over the other's
    // work by its stamp; the request is a conflict, as importing the files one at a time makes it.
    const apart =
      theirs === first ? (copiesOf.get(id) ?? []).find((c) => c !== theirs && diverged(c, theirs)) : undefined
    if (apart) {
      list({ requestId: id, current: mine ?? apart, incoming: theirs, kind: 'changed' })
      continue
    }
    if (!mine) {
      // 6. A decision new to the workspace must be one that can take effect here.
      const why = isApproval(theirs) ? effectRefusal(theirs, null) : null
      if (why) {
        list({ requestId: id, current: theirs, incoming: theirs, kind: 'effect', reason: why })
        continue
      }
      // 3. New to the workspace.
      at.set(id, requests.length)
      requests.push(theirs)
      base.set(id, revisionOf(theirs))
      if (shown(theirs)) merged.add(id)
      if (isApproval(theirs)) decided.push({ requestId: id, before: null, after: theirs })
      continue
    }
    if (!differs(mine, theirs)) {
      // 4. Nothing to do.
      base.set(id, revisionOf(mine))
      continue
    }
    const last = options.base.get(id)
    const theirsAt = revisionOf(theirs)
    const mineAt = revisionOf(mine)
    const theirsChanged = last !== undefined && later(theirsAt, last)
    const mineChanged = last !== undefined && later(mineAt, last)
    const sameTime = stampMs(mineAt) === stampMs(theirsAt)
    const takesBack = DECIDED.has(mine.state) && !DECIDED.has(theirs.state) && later(theirsAt, mineAt)
    if ((theirsChanged && mineChanged) || sameTime || diverged(mine, theirs) || takesBack) {
      // 5. A conflict: the workspace keeps its copy, and the base stays until the choice.
      list({ requestId: id, current: mine, incoming: theirs, kind: 'changed' })
      continue
    }
    // 7. The later revision wins; when the workspace's copy wins, the base stays (IN-3).
    if (!later(theirsAt, mineAt)) continue
    // 6. The file's decision must be one that can take effect here.
    const arrives = isApproval(theirs) && !isApproval(mine)
    const why = arrives ? effectRefusal(theirs, mine) : null
    if (why) {
      list({ requestId: id, current: mine, incoming: theirs, kind: 'effect', reason: why })
      continue
    }
    requests[i as number] = theirs
    base.set(id, theirsAt)
    if (shown(mine, theirs)) merged.add(id)
    if (arrives) decided.push({ requestId: id, before: mine, after: theirs })
  }

  const choose = conflicts.filter(isChoosable).length
  return {
    requests,
    merged: merged.size,
    files: files.length,
    conflicts,
    skipped: skipped.size,
    base: baseList(base),
    decided,
    summary: mergeSummary(merged.size, files.length, choose),
    preview: mergePreviewText(merged.size, files.length, choose, conflicts.length - choose),
  }
}

/**
 * Settles one conflict. 'incoming' takes the file's copy as it is; 'current' keeps the workspace's
 * copy and stamps its revision with `at` (the write's wall clock, M3 recheck), because keeping it is
 * a change made now: a later import of the same file then finds the workspace's copy the later one.
 * Its `updatedAt` (the business time idle expiry reads) stays, so keeping a copy never makes an
 * expired request pending again. The merge base moves to the kept copy. A 'clash' or an 'effect' has
 * no choice: the state comes back unchanged. `decided` names the request when taking the file's copy
 * moves it into Approved or Approved with changes, for the write path to apply its effects (D-MERGE).
 */
export function chooseConflict(
  state: { requests: readonly HcRequest[]; base: readonly { requestId: string; updatedAt: ISODateTime }[] },
  conflict: MergeConflict,
  choice: 'current' | 'incoming',
  at: ISODateTime,
): {
  requests: HcRequest[]
  base: { requestId: string; updatedAt: ISODateTime }[]
  decided: DecidedArrival | null
} {
  if (!isChoosable(conflict)) return { requests: [...state.requests], base: [...state.base], decided: null }
  const kept = choice === 'incoming' ? conflict.incoming : { ...conflict.current, revisedAt: at }
  const requests = state.requests.map((r) => (r.requestId === conflict.requestId ? kept : r))
  if (!requests.some((r) => r.requestId === conflict.requestId)) requests.push(kept)
  const base = mergeBaseMap(state.base) as Map<string, ISODateTime>
  base.set(conflict.requestId, revisionOf(kept))
  const decided =
    choice === 'incoming' && isApproval(conflict.incoming) && !isApproval(conflict.current)
      ? { requestId: conflict.requestId, before: conflict.current, after: conflict.incoming }
      : null
  return { requests, base: baseList(base), decided }
}

const plain = (n: number, one: string, many = `${one}s`): string =>
  n === 0 ? `no ${many}` : `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`

/** "Merged 14 requests from 6 files, 2 conflicts" (plain counts: "1 file", "1 conflict", "no conflicts"). */
export function mergeSummary(merged: number, files: number, conflicts: number): string {
  return `Merged ${plain(merged, 'request')} from ${plain(files, 'file')}, ${plain(conflicts, 'conflict')}`
}

/**
 * What a merge would do, before it runs (M3 review UI-11): "Merges 14 requests from 6 files; 2
 * conflicts to choose", with "; 1 request cannot merge" for clashes and decisions that cannot take
 * effect here, and "; no conflicts" when there is neither.
 */
export function mergePreviewText(merged: number, files: number, choose: number, blocked = 0): string {
  const parts: string[] = []
  if (choose) parts.push(`${plain(choose, 'conflict')} to choose`)
  if (blocked) parts.push(`${plain(blocked, 'request')} cannot merge`)
  return `Merges ${plain(merged, 'request')} from ${plain(files, 'file')}; ${parts.length ? parts.join('; ') : 'no conflicts'}`
}

/* ───────────── HR admin's Merge ───────────── */

const OVERLAY_KEYS = [
  'positions',
  'targets',
  'freezes',
  'assumptions',
] as const satisfies readonly (keyof DatasetOverlay & DatasetKey)[]

/** A row's dataset row key, as one string. */
function rowKeyOf<T extends object>(key: DatasetKey): (row: T) => string {
  const fields = DATASETS.find((d) => d.key === key)?.rowKey ?? []
  return (row: T) => fields.map((f) => String((row as Record<string, unknown>)[f] ?? '')).join('\u0000')
}

/** Rows by the dataset's row key, the incoming row winning: current order first, new rows after. */
function mergeRows<T extends object>(key: DatasetKey, current: readonly T[], incoming: readonly T[]): T[] {
  const keyOf = rowKeyOf<T>(key)
  const out = [...current]
  const at = new Map(out.map((r, i) => [keyOf(r), i]))
  for (const row of incoming) {
    const k = keyOf(row)
    const i = at.get(k)
    if (i === undefined) {
      at.set(k, out.length)
      out.push(row)
    } else out[i] = row
  }
  return out
}

/** Items of `incoming` whose key is not in `current`, appended to it. */
function addNew<T>(current: readonly T[], incoming: readonly T[], key: (x: T) => string): T[] {
  const seen = new Set(current.map(key))
  const out = [...current]
  for (const x of incoming) {
    if (seen.has(key(x))) continue
    seen.add(key(x))
    out.push(x)
  }
  return out
}

/** Versions added when new; a locked version in both must match by hash; one Working a year stays the workspace's. */
function mergeVersions(current: readonly AnyVersion[], incoming: readonly AnyVersion[]): AnyVersion[] {
  const out = [...current]
  for (const v of incoming) {
    const same =
      out.find((x) => x.versionId === v.versionId) ??
      (v.state === 'locked' && v.kind === 'budget'
        ? out.find((x) => x.state === 'locked' && x.kind === 'budget' && x.fiscalYear === v.fiscalYear)
        : undefined)
    if (same) {
      if (same.state === 'locked' && v.state === 'locked' && same.hash !== v.hash)
        throw new Error(hashMismatchText(v.name))
      continue
    }
    if (v.state === 'working' && out.some((x) => x.state === 'working' && x.fiscalYear === v.fiscalYear))
      continue
    out.push(v)
  }
  return out
}

/** The org and start a freeze covers: two freezes that differ here are two freezes. */
const freezeKey = (f: FreezeRow): string =>
  [f.businessUnit, f.department ?? '', f.costCenter ?? '', f.leaderPositionId ?? '', f.startDate].join('|')

/**
 * Another workspace's freezes that carry one of this workspace's freeze IDs but cover another org or
 * start another day (M3 recheck): two browsers that numbered freezes alike before freeze IDs took the
 * workspace's tag, or a restore. Each gets the first free ID '<id>-<n>' (n from 2), so a Merge keeps
 * both freezes and never puts one in place of the other. The same org and start is the same freeze
 * (an edit of it), merged by its ID as before.
 */
export function freezeClashes(
  mine: readonly FreezeRow[],
  theirs: readonly FreezeRow[],
): { from: string; to: string }[] {
  const own = new Map(mine.map((f) => [f.freezeId, f]))
  const taken = new Set([...mine, ...theirs].map((f) => f.freezeId))
  const out: { from: string; to: string }[] = []
  for (const f of theirs) {
    const m = own.get(f.freezeId)
    if (!m || freezeKey(m) === freezeKey(f) || out.some((x) => x.from === f.freezeId)) continue
    let n = 2
    while (taken.has(`${f.freezeId}-${n}`)) n++
    const to = `${f.freezeId}-${n}`
    taken.add(to)
    out.push({ from: f.freezeId, to })
  }
  return out
}

/** Plan state with freezes taken to new IDs: the freeze rows and the freeze exceptions naming them. */
function withFreezeIds(s: PlanState, renamed: readonly { from: string; to: string }[]): PlanState {
  if (!renamed.length) return s
  const to = new Map(renamed.map((r) => [r.from, r.to]))
  return {
    ...s,
    overlay: {
      ...s.overlay,
      freezes: s.overlay.freezes.map((f) =>
        to.has(f.freezeId) ? { ...f, freezeId: to.get(f.freezeId) as string } : f,
      ),
    },
    requests: s.requests.map((r) =>
      r.exception && to.has(r.exception.freezeId)
        ? { ...r, exception: { ...r.exception, freezeId: to.get(r.exception.freezeId) as string } }
        : r,
    ),
  }
}

/**
 * HR admin's Merge of a Full file's plan state into the workspace: requests by `mergeRequests`;
 * versions, closes and cycles added when new (locked versions must already match by hash); overlay
 * rows by row key, the incoming row winning.
 *
 * Also: adjustments and reviewed exceptions are added when new; the merge base is the requests merge's;
 * the baseline and the audit head stay the workspace's (the audit log is never spliced: a chain
 * cannot take another chain's entries). Throws `hashMismatchText` when a locked version differs.
 * M3 recheck: Remove override's removals are carried from both sides (the incoming side winning by
 * row key, as rows do), and a freeze the file brings under one of this workspace's freeze IDs that
 * covers another org or start keeps its own under a new ID (`freezeClashes`).
 */
export function mergePlanState(current: PlanState, theirs: PlanState, options: MergeOptions): PlanState {
  // Another freeze under one of this workspace's freeze IDs keeps its own, under a new ID (M3 recheck).
  const incoming = withFreezeIds(
    theirs,
    freezeClashes(options.freezes ?? current.overlay.freezes, theirs.overlay.freezes),
  )
  const versions = mergeVersions(current.versions, incoming.versions)
  const requests = mergeRequests(current.requests, [incoming.requests], options)
  const overlay = {} as Record<(typeof OVERLAY_KEYS)[number], unknown[]>
  for (const k of OVERLAY_KEYS)
    overlay[k] = mergeRows<object>(
      k,
      current.overlay[k] as readonly object[],
      incoming.overlay[k] as readonly object[],
    )
  // Remove override's removals (M3 recheck): both sides' by row key, the incoming side winning as
  // rows do. An incoming row for a key takes a removal back (as setting it does), and an incoming
  // removal takes this workspace's row for the key out.
  const keyOf = rowKeyOf<AssumptionRow>('assumptions')
  const setThere = new Set(incoming.overlay.assumptions.map(keyOf))
  const removedThere = new Set((incoming.overlay.removedAssumptions ?? []).map(keyOf))
  const removed = addNew(
    (current.overlay.removedAssumptions ?? []).filter((r) => !setThere.has(keyOf(r))),
    incoming.overlay.removedAssumptions ?? [],
    keyOf,
  )
  overlay.assumptions = (overlay.assumptions as AssumptionRow[]).filter(
    (r) => !removedThere.has(keyOf(r)) || setThere.has(keyOf(r)),
  )
  return {
    v: 1,
    baselineId: current.baselineId,
    versions,
    closes: addNew(current.closes, incoming.closes, (c) => c.month),
    adjustments: addNew(current.adjustments, incoming.adjustments, (a) => a.id),
    overlay: {
      ...(overlay as unknown as DatasetOverlay),
      ...(removed.length ? { removedAssumptions: removed } : {}),
    },
    requests: requests.requests,
    cycles: addNew(current.cycles, incoming.cycles, (c) => c.cycleId),
    reviewed: addNew(current.reviewed, incoming.reviewed, (r) => r.exceptionId),
    mergeBase: requests.base,
    auditHead: current.auditHead,
  }
}
