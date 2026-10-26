/**
 * Workspace files as the views use them (docs/PLAN.md 5.5, 8.3, 8.4, 14.1, C30; M3 freeze, M2-REPORT
 * known gaps 1 and 2): the entry points the masthead's Workspace menu (`masthead:workspace`), the Data
 * room's Workspace tab, Requests > Mine and the Queue header call. Every function checks its action's
 * decision (`ctx.access.can('action:export.shareable')`, ...) and returns a refusal with the policy's
 * reason when it is hidden. Pure: the caller downloads the text (src/lib/export/download.ts) or hands
 * a file already read to the write path (src/plan/actions/workspace.ts).
 *
 * - shareableFile (`export.shareable`, every mode): only what the mode and Acting as person see,
 *   built from the guarded models, never from the PlanStore: requests through `requestView`,
 *   comments through `commentVisible`, audit rows through `auditView`, versions and closes by
 *   reference, model values by figure id exactly as on screen; no pay or leave field and no line
 *   table (src/plan/workspace/file.ts `buildWorkspaceFile` refuses one). The header carries the
 *   view's scope identity (`scopeKey`, ./sharedFile.ts `viewScopeKey`). In HR admin with Show pay
 *   amounts on, the file is written as HR admin sees it with the switch off (`shareableBaseOf`:
 *   Finance's rules, 7.5), byte for byte, and its save says so (SHAREABLE_PAY_OFF_TEXT): individual
 *   pay leaves the app only in a Full file (D-PAYFILES, review EX-2).
 * - Every file made in Manager mode (a manager's own Shareable and Requests files, and Export for a
 *   manager) carries the Manager export line for the acting manager as its first header line
 *   (`modeLine`, D-MODELINE, review CP-2), and its save says it.
 * - requestsFile (`export.requests`, every mode): requests whose `requestView` is 'full', with their
 *   steps and comments by `commentVisible`; Manager-mode files hold no amounts (11.6).
 * - forManagerFile (`export.for-manager`: HRBP, Leader for managers in its org, HR admin): a Shareable
 *   built exactly as Manager mode acting as the picked manager (src/access/contextAs.ts `contextAs`),
 *   header mode 'manager'; no amounts, band estimates, approvers-only comments or anything about the
 *   manager's own seat or above.
 * - fullFile (`export.full`, HR admin with Show pay amounts on): everything; its first line and the
 *   save dialog say FULL_FILE_NOTICE ("Contains individual pay").
 * - earlierSampleFile (`export.full`, HR admin with Show pay amounts on): the plan state and audit
 *   log set aside when the sample changed (src/app/planState.ts `SetAside`, lead browser finding B9),
 *   as a Full file with no datasets (the earlier sample is not generated any more).
 * - readFile, importPreview (`workspace.import`): validate.ts `readWorkspace` against this
 *   workspace's locked versions (25 MB for a Shareable or Requests file and 150 MB for a Full file
 *   (C35), checksum, `__proto__`, newer version, foreign format, hash mismatch), then diff.ts
 *   `workspaceDiff` before Replace or Merge, with the file's audit log checked: Replace takes it only
 *   when its chain verifies (C35).
 * - importRequestsPreview (`request.import`): each file through `readWorkspace` and `requestsOf`
 *   (NO_REQUESTS_TEXT for another kind), then merge.ts `mergeRequests` over the workspace's requests
 *   with the Leader tree rule and the 8.4 rule 3 count rule, for the summary before anything is
 *   written ("Merges 14 requests from 6 files; 2 conflicts to choose", never "Merged" before the
 *   merge, UI-11) and the conflict list, each copy with only the comments the importer may read.
 * - openSharedFile (`workspace.open-shared`, every mode, read only, nothing merges): the file shown
 *   through the current mode's guard and the current Acting as person's rules (`requestView`,
 *   `commentVisible`, `auditView`, and `managerText` on its request titles and every text of its
 *   figures, M4 recheck EX-3-b), never the mode it was made in; its figures only when
 *   `openedFileView` says so (src/plan/workspace/shared.ts `sharedFiguresShown`, `scopeKeyOf`), else
 *   with its note (in Manager mode, for a file made in another mode: "This file was made in <mode>
 *   mode and holds more than Manager mode shows. Ask for one made for your team.").
 *
 * Readings taken here (workspace-ui, M3):
 *  - The Shareable slice is the one the leak crawl builds (src/testkit/crawl.ts `workspaceSlice`):
 *    the requests in scope, a limited one cut to its seat (position ID, title, level and org); the
 *    Audit page's own rows (src/views/audit/engine `auditModel`); the open cycle as the Cycle tab shows
 *    it (no cut line where the tab hides it, the ranked order cut to the requests the viewer may
 *    see); and every figure the mode shows (./snapshots.ts).
 *  - A Requests file holds every request whose view is 'full' for the exporter, whatever the scope
 *    (an approver from another org reads it in full), as PLAN 5.5 words it.
 *  - Import requests merges against every request in force (the imported rows with plan state's own
 *    over them, src/drill/seats.ts `requestsOf`), with the person-level rules the write path uses
 *    (src/app/write/context.ts `personRulesOf`), so the preview says exactly what the action does.
 *  - Opening a shared file checks the file (size, checksum, format, version, known keys) but not its
 *    locked versions against this workspace's: nothing is imported, so a file from a workspace with
 *    another Budget still opens to read. A Full file does not open: it holds individual pay.
 *  - The Full file's datasets are the context's (`ctx.all`, with Working's overlay laid over the
 *    imported rows): the overlay is keyed by row, so laying the file's own overlay again on Replace
 *    changes no row.
 *
 * Frozen in the M3 freeze (docs/CONTRACTS-M3.md); the workspace-ui builder filled the bodies.
 */
import { accessClamp } from '@/access/context'
import { contextAs } from '@/access/contextAs'
import { modeExportLine } from '@/access/copy'
import { contextLists, setContextLists } from '@/access/lists'
import { MODE_LABEL, NO_PICKS } from '@/access/modes'
import { inScope } from '@/access/records'
import { holdingsOn } from '@/access/scopes/people'
import {
  commentVisible,
  hasAmount,
  managerText,
  requestView,
  type Viewer,
  viewerOf,
} from '@/access/visibility'
import { actionContextOf, personRulesOf } from '@/app/write/context'
import { type AnalyticsContext, buildContext } from '@/data/context'
import type { ISODateTime, Mode } from '@/data/schema'
import { requestRecord } from '@/drill/requestRecord'
import { requestsOf as requestsInForce, workerNames } from '@/drill/seats'
import type { RequestRecord } from '@/drill/types'
import { moneyOpts, moneyShown } from '@/lib/export/columns'
import { modeMeta } from '@/lib/export/modeMeta'
import { FILE_AMOUNT_TEXT } from '@/plan/actions/copy'
import { importedApprovals } from '@/plan/actions/requests'
import type { ActionContext } from '@/plan/actions/types'
import { fileBaselineRefusal, type RequestFile } from '@/plan/actions/workspace'
import { fileChainBrokenText } from '@/plan/audit/chain'
import { effectiveState } from '@/plan/engine/requests'
import { emptyPlanState } from '@/plan/store/memoryStore'
import type {
  AuditEntry,
  AuditRow,
  CloseRef,
  Comment,
  Cycle,
  HcRequest,
  JsonValue,
  LockedVersionRef,
  PlanState,
  PlanStateSlice,
  WorkspaceFile,
  WorkspaceKind,
} from '@/plan/types'
import { type WorkspaceDiff, workspaceDiff } from '@/plan/workspace/diff'
import {
  buildWorkspaceFile,
  FULL_FILE_NOTICE,
  managerModeLine,
  serializeWorkspace,
  workspaceFileName,
} from '@/plan/workspace/file'
import {
  isChoosable,
  type MergeConflict,
  type MergeOptions,
  mergeBaseMap,
  mergeRequests,
} from '@/plan/workspace/merge'
import { FIGURES_NOT_HERE_NOTE } from '@/plan/workspace/shared'
import { readWorkspace, requestsOf } from '@/plan/workspace/validate'
import { cleanVersionIds } from '@/plan/workspace/versionIds'
import { auditModel, viewAuditRows } from '@/views/audit/engine'
import { requestsModel } from '@/views/requests/engine'
import { PARAM as REQUESTS_PARAM } from '@/views/requests/metrics'
import { openedFileView, viewScopeKey } from './sharedFile'
import { type FigureSnapshot, figureSnapshots } from './snapshots'

/** A file ready to save: the file, its text (`serializeWorkspace`) and its name (`workspaceFileName`). */
export interface FileOut {
  file: WorkspaceFile
  text: string
  name: string
  /**
   * What the save says about the file: a Full file's notice ("Contains individual pay"), a
   * Manager-mode file's mode line ("Made in Manager mode for ... No amounts are included."), a
   * Shareable saved with Show pay amounts on SHAREABLE_PAY_OFF_TEXT; null for the others.
   */
  notice: string | null
}

export type FileResult = { ok: true; out: FileOut } | { ok: false; refused: string }

/**
 * The saved file's note, as every save button shows it under its toast: the file's name, then what
 * the save says about it (`FileOut.notice`: the Manager line, "Contains individual pay", or that a
 * Shareable holds no individual pay), so Requests > Export requests says what Data room > Workspace
 * says (D-MODELINE, D-PAYFILES).
 */
export const savedNote = (out: Pick<FileOut, 'name' | 'notice'>): string =>
  out.notice ? `${out.name}. ${out.notice}` : out.name

/** A manager "Export for a manager" may name: in the HRBP's unit, the Leader's org, or anyone for HR admin. */
export interface ExportManager {
  personId: string
  name: string
  /** The manager's own seat (a position others report to). */
  positionId: string
  /** "Sebastian Wagner's team (P-1021)". */
  label: string
}

/** What Import requests would do, before anything is written. */
export interface RequestsPreview {
  /** The files read, ready for src/plan/actions/workspace.ts `importRequests`. */
  files: readonly RequestFile[]
  /** Files refused, each with its sentence (NO_REQUESTS_TEXT, DAMAGED_TEXT, ...). */
  refused: readonly { name: string; reason: string }[]
  /**
   * What the merge would do, before it runs (merge.ts `mergePreviewText`, M3 review UI-11): "Merges
   * 14 requests from 6 files; 2 conflicts to choose". Never "Merged" before anything merged.
   */
  summary: string
  /** The notice the merge gives with no conflict chosen (merge.ts `mergeSummary`): "Merged 14 requests from 6 files, 2 conflicts". */
  after: string
  /**
   * The sentence the merge would be refused with, else null: the policy's, or FILE_AMOUNT_TEXT when a
   * request the files bring has a job title with an amount (the action refuses the whole merge).
   */
  blocked: string | null
  merged: number
  skipped: number
  /**
   * The requests listed (only those the importer may see): changed on both sides since the last
   * merge, for a choice; an ID clash, or a decision that cannot take effect here, with its reason and
   * no choice. Each copy carries only the comments the importer may read (8.4 rule 5, M3 review PV-8).
   */
  conflicts: readonly MergeConflict[]
}

/**
 * A request of an opened file as the dialog lists it: the viewer's record of it without the band
 * estimate key (the opener prices nothing, and no Manager-mode model carries an amount-like key, 7.6).
 */
export type SharedRequestRow = Omit<RequestRecord, 'bandEstimateUsd'>

/** An audit row of an opened file as the dialog lists it: the Audit page's words for it (B7, UI-14). */
export type SharedAuditRow = AuditRow & {
  objectLabel: string
  fieldLabel: string
  oldText: string | null
  newText: string | null
}

/** An opened shared file, through the current mode and Acting as person. */
export interface SharedFileView {
  kind: WorkspaceKind
  /** The mode it was made in (display only: it never decides what shows). */
  madeIn: Mode
  scopeLabel: string
  savedAt: ISODateTime
  /** Its figure snapshots show (same mode and scope identity), else `note` says why not. */
  figuresShown: boolean
  note: string | null
  /** Its requests as the current viewer's records (a hidden request is no row; limited ones keep IDs, type, state, title, level and org). */
  requests: readonly SharedRequestRow[]
  /** The comments the current viewer may read, by request. */
  comments: readonly { requestId: string; comment: Comment }[]
  /**
   * Its audit rows through `auditView` (never `seq`, `prevHash` or `hash` outside HR admin), with the
   * Audit page's words: the record type and field as labels, the values as text with people named.
   */
  audit: readonly SharedAuditRow[]
  /** Its model values by figure id, only when `figuresShown`; else null. */
  figures: Readonly<Record<string, JsonValue>> | null
}

/* ───────────── copy ───────────── */

/** Export for a manager, for someone the mode does not export for (Leader: outside the org). */
export const MANAGER_NOT_LISTED_TEXT =
  'This mode does not save a file for that manager. Pick one from the list.'
/** A Full file asked for with the pay switch off (the policy's "With Show pay amounts on."). */
export const FULL_NEEDS_PAY_TEXT = 'Turn on Show pay amounts to save a Full file.'
/**
 * A Shareable saved in HR admin with Show pay amounts on (D-PAYFILES): written as the switch off
 * shows it, so individual pay leaves the app only in a Full file.
 */
export const SHAREABLE_PAY_OFF_TEXT =
  'A Shareable file is written as HR admin sees it with Show pay amounts off, under Finance’s rules, so it holds no individual pay. A Full file holds individual pay.'
/** The scope label of the earlier sample's Full file (B9). */
export const EARLIER_SAMPLE_LABEL = 'Changes on the earlier sample'
/** Import (Replace or Merge) of a file that is not a Full file. */
export const IMPORT_FULL_ONLY_TEXT =
  'Replace and Merge take a Full file, made in HR admin with Show pay amounts on. To merge the requests in a Shareable or Requests file, use Import requests.'
/** Open a shared file with a Full file, outside HR admin and in it. */
export const FULL_NOT_OPENED_TEXT = 'This file holds individual pay, so it does not open in this mode.'
export const FULL_NOT_OPENED_ADMIN_TEXT =
  'This is a Full file, so it does not open to read. Import shows what it would change before anything is replaced.'
/** Import requests with no file picked. */
export const NO_REQUEST_FILES_TEXT = 'Pick one or more files to merge their requests.'

/**
 * A decision a file brings that cannot take effect here, as a viewer who sees the request limited
 * reads it (M3 recheck): the merge's own sentence can name the new site or a seat they may not see.
 */
export const EFFECT_NOT_HERE_TEXT = 'This request cannot be applied in this workspace.'

/** A read refusal worded for opening a file: nothing is imported when a file is opened. */
const forOpening = (reason: string): string =>
  reason.replace(/Nothing was imported\.$/, 'Nothing was opened.')

/* ───────────── shared helpers ───────────── */

/** The policy's refusal for an action id, or null when the mode may use it (shown or limited). */
function hiddenHow(ctx: AnalyticsContext, id: string): string | null {
  const d = ctx.access.decide(`action:${id}`)
  if (d.access !== 'hidden') return null
  const label = MODE_LABEL[ctx.mode]
  return d.how ?? `Not shown in ${label} mode.`
}

/** This workspace's locked versions by reference (what a file's hashes are checked against). */
export function lockedRefsOf(ctx: AnalyticsContext): LockedVersionRef[] {
  return ctx.versions
    .filter((v) => v.state === 'locked')
    .map((v) => ({
      versionId: v.versionId,
      name: v.name,
      kind: v.kind,
      fiscalYear: v.fiscalYear,
      state: v.state,
      hash: 'hash' in v ? (v.hash ?? null) : null,
    }))
}

/**
 * A request as a viewer's file carries it: in full with what they may read (comments by
 * `commentVisible`, the title, step notes and reasons through `managerText`), cut to its seat when
 * limited, or not at all (rule 3).
 */
export function requestForFile(r: HcRequest, viewer: Viewer): HcRequest | null {
  const view = requestView(r, viewer)
  if (view === 'none') return null
  const text = (s: string) => managerText(s, viewer)
  // A title is free text a manager reads: an amount in it (one that came by Import requests, Merge
  // or the requests dataset) reads "an amount" in Manager mode, as reasons and notes do (PV-6).
  const jobTitle = r.jobTitle ? text(r.jobTitle) : r.jobTitle
  if (view === 'limited')
    return {
      ...r,
      jobTitle,
      reasonCode: 'Other',
      requesterId: '',
      submittedById: null,
      submittedAt: null,
      updatedAt: '',
      revisedAt: undefined,
      createdAt: undefined,
      location: null,
      fte: null,
      startDate: null,
      priority: null,
      cycleId: null,
      confidential: false,
      exception: null,
      steps: [],
      comments: [],
      changes: null,
      trade: null,
      transfer: null,
      outcome: null,
    }
  return {
    ...r,
    jobTitle,
    steps: r.steps.map((s) => (s.note ? { ...s, note: text(s.note) } : s)),
    comments: r.comments.filter((c) => commentVisible(c, r, viewer)),
    changes: r.changes ? { ...r.changes, reason: text(r.changes.reason) } : null,
    exception: r.exception ? { ...r.exception, reason: text(r.exception.reason) } : null,
  }
}

/** The keys an audit row keeps in a file (no chain field, nothing the page adds). */
const AUDIT_ROW_KEYS = [
  'at',
  'by',
  'byName',
  'mode',
  'object',
  'id',
  'field',
  'old',
  'new',
  'effectiveDate',
  'comment',
  'commentAudience',
] as const

const asAuditRow = (r: AuditRow): AuditRow =>
  Object.fromEntries(AUDIT_ROW_KEYS.map((k) => [k, r[k] ?? null])) as unknown as AuditRow

/** The open cycle as the Cycle tab shows it, or none where the tab is hidden. */
function cyclesShown(ctx: AnalyticsContext, viewer: Viewer): Cycle[] {
  if (!ctx.access.can('tab:requests.cycle')) return []
  let facts: { cycleId: string } | null = null
  let cutShown = false
  try {
    const m = requestsModel(ctx).cycle
    facts = m.cycle
    cutShown = m.cutShown
  } catch {
    return []
  }
  const own = facts ? ctx.plan?.cycles.find((x) => x.cycleId === facts.cycleId) : null
  if (!own) return []
  const byId = new Map(requestsInForce(ctx).map((r) => [r.requestId, r]))
  const seen = (id: string) => {
    const r = byId.get(id)
    return !!r && requestView(r, viewer) !== 'none' && inScope('requests', r, ctx)
  }
  const order = (own.order ?? [])
    .map((o) => ({ businessUnit: o.businessUnit, requestIds: o.requestIds.filter(seen) }))
    .filter((o) => o.requestIds.length)
  const { order: _order, ...rest } = own
  return [
    {
      ...rest,
      openedBy: '',
      hrbpDone: [],
      leaderDone: [],
      cutLines: cutShown ? own.cutLines : [],
      ...(order.length ? { order } : {}),
    },
  ]
}

/* ───────────── exports ───────────── */

const payOff = new WeakMap<AnalyticsContext, AnalyticsContext>()

/**
 * The context a Shareable is written from (D-PAYFILES, PLAN 7.5): the context itself, or in HR admin
 * with Show pay amounts on, the same data, filters, pickers, as-of date and Acting as pick with the
 * switch off (Finance's rules), so the file holds no individual pay. The same object for the same
 * context.
 */
export function shareableBaseOf(ctx: AnalyticsContext): AnalyticsContext {
  if (!ctx.showPay) return ctx
  const hit = payOff.get(ctx)
  if (hit) return hit
  const picks = { ...NO_PICKS, [ctx.access.mode]: ctx.access.actingAs }
  const lists = contextLists(ctx)
  const out = buildContext({
    // `all` holds Working's overlay already; laying it again changes no row (rows are keyed).
    data: ctx.all,
    sources: ctx.sources,
    filters: ctx.filters,
    asOfOverride: ctx.asOf,
    today: ctx.asOf,
    mode: ctx.access.mode,
    actingAs: picks,
    plan: ctx.plan,
    versions: ctx.versions,
    audit: ctx.audit,
    picks: { version: ctx.picks.version, compare: ctx.picks.compare },
    clamp: accessClamp(picks, lists),
    showPay: false,
    standard: ctx.standard,
    quality: ctx.quality,
    metrics: ctx.metrics,
  })
  if (lists) setContextLists(out, lists)
  payOff.set(ctx, out)
  return out
}

/**
 * The mode line a file made in Manager mode carries first (D-MODELINE): the Manager export line for
 * the acting manager, or "Made in Manager mode." when that line is not one the reader takes back
 * (a name with a digit, or over 120 characters: `managerModeLine`), so such a name never stops a
 * save; none for the other modes.
 */
export function fileModeLine(ctx: Pick<AnalyticsContext, 'access'>): string | undefined {
  if (ctx.access.mode !== 'manager') return undefined
  const line = modeMeta(ctx.access).modeLine
  return line && managerModeLine(line) ? line : modeExportLine('manager')
}

/** The Shareable slice of a context: the mode's guarded output (the crawl reads the same). */
export function shareableSlice(ctx: AnalyticsContext): Extract<PlanStateSlice, { kind: 'shareable' }> {
  const viewer = viewerOf(ctx)
  const requests = requestsInForce(ctx)
    .filter((r) => inScope('requests', r, ctx))
    .map((r) => requestForFile(r, viewer))
    .filter((r): r is HcRequest => !!r)
  const audit = auditModel(ctx).entries.rows.map(asAuditRow)
  const closes: CloseRef[] = (ctx.plan?.closes ?? []).map((x) => ({
    month: x.month,
    closedAt: x.closedAt,
    hash: x.hash,
  }))
  const models: Record<string, JsonValue> = {}
  for (const [id, f] of Object.entries(figureSnapshots(ctx))) models[id] = f as unknown as JsonValue
  return {
    kind: 'shareable',
    requests,
    cycles: cyclesShown(ctx, viewer),
    versions: lockedRefsOf(ctx),
    closes,
    audit,
    models,
  }
}

/** A built file as the caller saves it. */
function out(ctx: AnalyticsContext, build: () => WorkspaceFile, said: string | null = null): FileResult {
  try {
    const file = build()
    return {
      ok: true,
      out: {
        file,
        text: serializeWorkspace(file),
        name: workspaceFileName(file, ctx.asOf),
        notice: file.kind === 'full' ? FULL_FILE_NOTICE : (file.modeLine ?? said),
      },
    }
  } catch (e) {
    return { ok: false, refused: e instanceof Error ? e.message : String(e) }
  }
}

/** `export.shareable`: a Shareable file of what this view shows. */
export function shareableFile(ctx: AnalyticsContext, at: ISODateTime): FileResult {
  const how = hiddenHow(ctx, 'export.shareable')
  if (how) return { ok: false, refused: how }
  // With Show pay amounts on, the file is HR admin's with the switch off (D-PAYFILES).
  const base = shareableBaseOf(ctx)
  const modeLine = fileModeLine(base)
  return out(
    base,
    () =>
      buildWorkspaceFile({
        kind: 'shareable',
        savedAt: at,
        mode: base.access.mode,
        scopeLabel: base.scopeLabel,
        scopeKey: viewScopeKey(base),
        actingAs: !!base.access.actingAs,
        plan: shareableSlice(base),
        lockedVersions: lockedRefsOf(base),
        ...(modeLine ? { modeLine } : {}),
      }),
    base === ctx ? null : SHAREABLE_PAY_OFF_TEXT,
  )
}

/** `export.requests`: the requests this view sees in full, with their steps and visible comments. */
export function requestsFile(ctx: AnalyticsContext, at: ISODateTime): FileResult {
  const how = hiddenHow(ctx, 'export.requests')
  if (how) return { ok: false, refused: how }
  const viewer = viewerOf(ctx)
  const requests = ctx.access.unset
    ? []
    : requestsInForce(ctx)
        .filter((r) => requestView(r, viewer) === 'full')
        .map((r) => requestForFile(r, viewer) as HcRequest)
  const modeLine = fileModeLine(ctx)
  return out(ctx, () =>
    buildWorkspaceFile({
      kind: 'requests',
      savedAt: at,
      mode: ctx.access.mode,
      scopeLabel: ctx.scopeLabel,
      scopeKey: viewScopeKey(ctx),
      actingAs: !!ctx.access.actingAs,
      plan: { kind: 'requests', requests },
      lockedVersions: lockedRefsOf(ctx),
      ...(modeLine ? { modeLine } : {}),
    }),
  )
}

const managersMemo = new WeakMap<AnalyticsContext, readonly ExportManager[]>()

/** The managers `forManagerFile` may name in this context. */
export function managersForExport(ctx: AnalyticsContext): readonly ExportManager[] {
  if (hiddenHow(ctx, 'export.for-manager') || ctx.access.unset) return []
  const hit = managersMemo.get(ctx)
  if (hit) return hit
  const held = holdingsOn(ctx.all.workers, ctx.asOf)
  const index = ctx.positionIndex
  const scope = ctx.access.scope
  const viewer = viewerOf(ctx)
  const mode = ctx.access.mode
  const listed = (seat: string): boolean => {
    if (mode === 'hr-admin' || !scope) return true
    if (scope.kind === 'unit')
      return scope.positionIds.has(seat) || viewer.hrbpUnits.has(index.byId.get(seat)?.businessUnit ?? '')
    // A leader exports for the managers inside the org, never for their own seat.
    return scope.positionIds.has(seat) && !scope.rootPositionIds.has(seat)
  }
  const out: ExportManager[] = []
  for (const [personId, seats] of held.seatsOf) {
    const seat = seats.find((s) => index.byId.has(s) && (index.children.get(s)?.length ?? 0) > 0 && listed(s))
    if (!seat) continue
    const name = held.nameOf.get(personId) ?? personId
    out.push({ personId, name, positionId: seat, label: `${name}'s team (${seat})` })
  }
  out.sort((a, b) => a.name.localeCompare(b.name) || a.personId.localeCompare(b.personId))
  managersMemo.set(ctx, out)
  return out
}

/** `export.for-manager`: a Shareable made as Manager mode acting as the manager. */
export function forManagerFile(ctx: AnalyticsContext, managerPersonId: string, at: ISODateTime): FileResult {
  const how = hiddenHow(ctx, 'export.for-manager')
  if (how) return { ok: false, refused: how }
  const m = managersForExport(ctx).find((x) => x.personId === managerPersonId)
  if (!m) return { ok: false, refused: MANAGER_NOT_LISTED_TEXT }
  const asManager = contextAs(ctx, {
    mode: 'manager',
    picks: { ...NO_PICKS, manager: { personId: m.personId, name: m.name } },
  })
  return shareableFile(asManager, at)
}

/** `export.full`: the whole workspace (HR admin with Show pay amounts on). */
export function fullFile(ctx: AnalyticsContext, at: ISODateTime): FileResult {
  const how = hiddenHow(ctx, 'export.full')
  if (how) return { ok: false, refused: how }
  if (!ctx.showPay) return { ok: false, refused: FULL_NEEDS_PAY_TEXT }
  const state = ctx.plan ?? emptyPlanState(null)
  return out(ctx, () =>
    buildWorkspaceFile({
      kind: 'full',
      savedAt: at,
      mode: ctx.access.mode,
      scopeLabel: ctx.scopeLabel,
      actingAs: !!ctx.access.actingAs,
      plan: { kind: 'full', state, audit: [...ctx.audit].sort((a, b) => a.seq - b.seq) },
      lockedVersions: lockedRefsOf(ctx),
      datasets: ctx.all,
    }),
  )
}

/**
 * The plan state and audit log set aside when the sample changed (B9), as a Full file: the same
 * decision and switch as `fullFile` (it holds the earlier sample's closes, which carry individual
 * pay), no datasets (the earlier sample is not generated any more), its locked versions by
 * reference from the state itself. Its first line says "Contains individual pay".
 */
export function earlierSampleFile(
  ctx: AnalyticsContext,
  aside: { state: PlanState; audit: readonly AuditEntry[] },
  at: ISODateTime,
): FileResult {
  const how = hiddenHow(ctx, 'export.full')
  if (how) return { ok: false, refused: how }
  if (!ctx.showPay) return { ok: false, refused: FULL_NEEDS_PAY_TEXT }
  return out(ctx, () =>
    buildWorkspaceFile({
      kind: 'full',
      savedAt: at,
      mode: ctx.access.mode,
      scopeLabel: EARLIER_SAMPLE_LABEL,
      actingAs: false,
      plan: { kind: 'full', state: aside.state, audit: [...aside.audit].sort((a, b) => a.seq - b.seq) },
      lockedVersions: aside.state.versions
        .filter((v) => v.state === 'locked')
        .map((v) => ({
          versionId: v.versionId,
          name: v.name,
          kind: v.kind,
          fiscalYear: v.fiscalYear,
          state: v.state,
          hash: 'hash' in v ? (v.hash ?? null) : null,
        })),
    }),
  )
}

/* ───────────── reading files ───────────── */

/** A file's text read and validated against this workspace's locked versions. */
export function readFile(
  ctx: AnalyticsContext,
  text: string,
  sizeBytes: number,
): { ok: true; file: WorkspaceFile } | { ok: false; reason: string } {
  return readWorkspace(text, sizeBytes, lockedRefsOf(ctx), { hasAmount })
}

/**
 * `workspace.import`: the file read and its diff, for the Replace or Merge confirm. The diff says what
 * happens to the audit log (C35): Replace takes the file's log when its chain verifies, then adds one
 * entry; `replaceRefused` is the sentence Replace is refused with when it does not (the first broken
 * link, plan/audit/chain.ts `fileChainBrokenText`). Merge keeps this workspace's log either way.
 */
export function importPreview(
  ctx: AnalyticsContext,
  text: string,
  sizeBytes: number,
):
  | {
      ok: true
      file: WorkspaceFile
      diff: WorkspaceDiff
      /**
       * The sentence Replace would be refused with: a file made on an earlier sample with no datasets
       * (M4 recheck B9-a), a broken audit chain, or an amount in a title or version name.
       */
      replaceRefused: string | null
      /** The sentence Merge would be refused with: a file made on an earlier sample, or an amount in a title or version name. */
      mergeRefused: string | null
    }
  | { ok: false; reason: string } {
  const how = hiddenHow(ctx, 'workspace.import')
  if (how) return { ok: false, reason: how }
  const read = readFile(ctx, text, sizeBytes)
  if (!read.ok) return read
  if (read.file.kind !== 'full') return { ok: false, reason: IMPORT_FULL_ONLY_TEXT }
  const rules = personRulesOf(ctx)
  const plan = read.file.body.plan
  // A version ID that carries an amount is rewritten as Merge rewrites it (the same version already
  // here keeps its ID), so the preview counts the versions Merge would add (M3 known gap 5).
  const cleaned =
    plan.kind === 'full'
      ? cleanVersionIds(plan.state, { hasAmount: rules.hasAmount, current: ctx.plan?.versions ?? [] }).state
      : null
  const diffed =
    cleaned && plan.kind === 'full' && cleaned !== plan.state
      ? { ...read.file, body: { ...read.file.body, plan: { ...plan, state: cleaned } } }
      : read.file
  const diff = workspaceDiff(
    { datasets: ctx.all, plan: ctx.plan ?? emptyPlanState(null), audit: ctx.audit },
    diffed,
  )
  const check = diff.audit?.check
  // A job title or version name with an amount refuses Replace and Merge alike, as the actions do
  // (managers read both, UI-3 and PV-6).
  const amount =
    plan.kind === 'full' &&
    (plan.state.versions.some((v) => rules.hasAmount(v.name ?? '')) ||
      plan.state.requests.some((r) => !!r.jobTitle && rules.hasAmount(r.jobTitle)))
  // A file with no datasets made on an earlier sample is refused by both, first (M4 recheck B9-a).
  const baseline = fileBaselineRefusal(ctx.plan ?? emptyPlanState(null), read.file)
  const mergeRefused = baseline ?? (amount ? FILE_AMOUNT_TEXT : null)
  const replaceRefused = baseline ?? (check && !check.ok ? fileChainBrokenText(check.brokenAt) : mergeRefused)
  return { ok: true, file: read.file, diff, replaceRefused, mergeRefused }
}

/**
 * A conflict as the importer may see it (8.4 rules 2, 3 and 5; PV-8, M3 recheck): each copy cut the
 * way the importer's own file would carry it (`requestForFile`: comments they may read, a limited
 * request cut to its seat), with the view it was cut to; null when either copy is hidden from them.
 * The sentence of a conflict with no choice names nothing a limited view leaves out: it is the
 * merge's own only where the importer sees the request in full.
 */
function conflictAsSeen(c: MergeConflict, viewer: Viewer): MergeConflict | null {
  const views = [requestView(c.current, viewer), requestView(c.incoming, viewer)]
  if (views.includes('none')) return null
  const current = requestForFile(c.current, viewer)
  const incoming = c.incoming === c.current ? current : requestForFile(c.incoming, viewer)
  if (!current || !incoming) return null
  const view = views.every((v) => v === 'full') ? 'full' : 'limited'
  const reason =
    c.reason && view !== 'full' && (c.kind ?? 'changed') === 'effect' ? EFFECT_NOT_HERE_TEXT : c.reason
  return { ...c, current, incoming, view, ...(reason ? { reason } : {}) }
}

/**
 * Why a decision a file brings cannot take effect here (D-MERGE): the write path's own dry run of the
 * approval on this workspace's plan (src/plan/actions/requests.ts `importedApprovals`, as
 * src/plan/actions/workspace.ts `importRequests` asks it), so the preview lists what the merge will.
 */
function effectRefusalOf(ctx: AnalyticsContext): MergeOptions['effectRefusal'] {
  const state = ctx.plan ?? emptyPlanState(null)
  let actx: ActionContext
  try {
    actx = actionContextOf(ctx, { readOnly: false, at: `${ctx.asOf}T12:00:00.000Z` })
  } catch {
    return undefined
  }
  return (incoming) => {
    try {
      return importedApprovals(state, actx, [incoming]).conflicts[0]?.text ?? null
    } catch {
      return null
    }
  }
}

/** `request.import`: what merging these files would do. */
export function importRequestsPreview(
  ctx: AnalyticsContext,
  files: readonly { name: string; text: string; sizeBytes: number }[],
): RequestsPreview {
  const how = hiddenHow(ctx, 'request.import')
  const read: RequestFile[] = []
  const refused: { name: string; reason: string }[] = []
  for (const f of files) {
    if (how) {
      refused.push({ name: f.name, reason: how })
      continue
    }
    const file = readFile(ctx, f.text, f.sizeBytes)
    if (!file.ok) {
      refused.push({ name: f.name, reason: file.reason })
      continue
    }
    const r = requestsOf(file.file)
    if (!r.ok) {
      refused.push({ name: f.name, reason: r.reason })
      continue
    }
    read.push({ name: f.name, kind: r.kind, requests: r.requests, skipped: r.skipped })
  }
  const rules = personRulesOf(ctx)
  const effectRefusal = read.length ? effectRefusalOf(ctx) : undefined
  const result = mergeRequests(
    requestsInForce(ctx),
    read.map((f) => f.requests),
    {
      base: mergeBaseMap(ctx.plan?.mergeBase ?? []),
      accept: (r) => rules.mayMerge(r),
      visible: (r) => rules.requestView(r) !== 'none',
      ...(effectRefusal ? { effectRefusal } : {}),
    },
  )
  const viewer = viewerOf(ctx)
  // A title with an amount among the requests the merge would bring in refuses the merge whole, as
  // the action does (PV-6: managers read titles, and Import requests is no way round the entry check).
  const before = new Map(requestsInForce(ctx).map((r) => [r.requestId, r]))
  const titled = result.requests.some(
    (r) => before.get(r.requestId) !== r && !!r.jobTitle && rules.hasAmount(r.jobTitle),
  )
  const summary = !files.length
    ? NO_REQUEST_FILES_TEXT
    : how
      ? how
      : titled
        ? FILE_AMOUNT_TEXT
        : result.preview
  return {
    files: read,
    refused,
    summary,
    after: !files.length || how || titled ? summary : result.summary,
    blocked: how ?? (titled ? FILE_AMOUNT_TEXT : null),
    merged: result.merged,
    skipped: result.skipped,
    conflicts: result.conflicts.flatMap((c) => conflictAsSeen(c, viewer) ?? []),
  }
}

/** `workspace.open-shared`: a file shown through this view (read only; nothing merges). */
export function openSharedFile(
  ctx: AnalyticsContext,
  text: string,
  sizeBytes: number,
): { ok: true; view: SharedFileView } | { ok: false; reason: string } {
  const how = hiddenHow(ctx, 'workspace.open-shared')
  if (how) return { ok: false, reason: how }
  // Nothing is imported, so the file's locked versions are not checked against this workspace's.
  const read = readWorkspace(text, sizeBytes, [], { hasAmount })
  if (!read.ok) return { ok: false, reason: forOpening(read.reason) }
  const file = read.file
  if (file.kind === 'full')
    return {
      ok: false,
      reason: ctx.access.mode === 'hr-admin' ? FULL_NOT_OPENED_ADMIN_TEXT : FULL_NOT_OPENED_TEXT,
    }
  const viewer = viewerOf(ctx)
  const plan = file.body.plan
  const inFile = requestsOf(file)
  const fileRequests = inFile.ok ? inFile.requests : []
  const shownRequests = ctx.access.unset
    ? []
    : fileRequests.filter((r) => inScope('requests', r, ctx) && requestView(r, viewer) !== 'none')
  const names = workerNames(ctx)
  const records: SharedRequestRow[] = []
  const comments: { requestId: string; comment: Comment }[] = []
  const idleDays = ctx.metrics.num(REQUESTS_PARAM.idleDays.metricId, REQUESTS_PARAM.idleDays.key)
  const cycles = ctx.plan?.cycles ?? []
  for (const r of shownRequests) {
    // Read as this workspace reads its own on its as-of date (D-EXPIRY), the title through
    // `managerText` (PV-6): a file is never a way round either.
    const state = effectiveState(r, { asOf: ctx.asOf, idleDays, cycles })
    const jobTitle = r.jobTitle ? managerText(r.jobTitle, viewer) : r.jobTitle
    const shown = state === r.state && jobTitle === r.jobTitle ? r : { ...r, state, jobTitle }
    const rec = requestRecord(shown, { viewer, asOf: ctx.asOf, nameOf: (id) => names.get(id) ?? null })
    if (!rec) continue
    const { bandEstimateUsd: _priced, ...row } = rec
    records.push(row)
    if (rec.view !== 'full') continue
    for (const c of r.comments)
      if (commentVisible(c, r, viewer)) comments.push({ requestId: r.requestId, comment: c })
  }
  // The file's audit rows, through the Audit page's own rule in this mode (rule 7 and the scope),
  // each with the request it belongs to among the file's requests.
  const rows: AuditEntry[] =
    plan.kind === 'shareable'
      ? plan.audit.map((row, i) => ({ ...asAuditRow(row), seq: i + 1, prevHash: '', hash: '' }))
      : []
  const audit: SharedAuditRow[] = viewAuditRows(ctx, rows, fileRequests, { fromFile: true }).map((r) => ({
    ...asAuditRow(r),
    objectLabel: r.objectLabel,
    fieldLabel: r.fieldLabel,
    oldText: r.oldText,
    newText: r.newText,
  }))
  const seen = openedFileView(file, ctx)
  let figures: Record<string, JsonValue> | null = null
  if (seen.figuresShown && plan.kind === 'shareable') {
    figures = {}
    const money = moneyShown(moneyOpts(ctx))
    for (const [id, v] of Object.entries(plan.models)) {
      const f = figureOf(v)
      if (!f || !ctx.access.can(`figure:${id}`)) continue
      // The columns this view keeps now (Show pay amounts may be off since the file was made).
      const columns = f.columns.filter((c) =>
        c.pay ? money.pay : c.band ? money.band : c.money ? money.cost : true,
      )
      // Every text the file's figure carries reads through `managerText` in Manager mode, as its
      // request titles do (M4 recheck EX-3-b, PV-6): a file written before the EX-3 fix, or edited,
      // never shows a title, label or note with an amount. Other modes read it as written.
      const text = (v: string | null): string | null => (v ? managerText(v, viewer) : v)
      const kept: FigureSnapshot = {
        ...f,
        title: text(f.title) ?? '',
        subtitle: text(f.subtitle),
        note: text(f.note),
        columns,
        rows: f.rows.map((r) =>
          Object.fromEntries(
            columns.map((c) => {
              const v = r[c.key] ?? null
              return [c.key, typeof v === 'string' ? text(v) : v]
            }),
          ),
        ),
      }
      figures[id] = kept as unknown as JsonValue
    }
  }
  return {
    ok: true,
    view: {
      kind: file.kind,
      madeIn: file.mode,
      scopeLabel: file.scopeLabel,
      savedAt: file.savedAt,
      figuresShown: seen.figuresShown,
      // A Requests file carries no figures, so it needs no word about them (Manager mode's note aside).
      note: file.kind === 'requests' && seen.note === FIGURES_NOT_HERE_NOTE ? null : seen.note,
      requests: records,
      comments,
      audit,
      figures,
    },
  }
}

/** A figure an opened file carries, as the dialog draws it (null when the value is not a figure snapshot). */
export function figureOf(v: JsonValue | undefined): FigureSnapshot | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const f = v as Record<string, unknown>
  return typeof f.id === 'string' &&
    typeof f.title === 'string' &&
    Array.isArray(f.columns) &&
    Array.isArray(f.rows)
    ? (f as unknown as FigureSnapshot)
    : null
}

/** A conflict as Import requests lists it: what the importer may read of it, never more. */
export interface ConflictRow {
  requestId: string
  type: HcRequest['type']
  title: string | null
  /** When each copy last changed; null where the importer's view of the request is limited. */
  here: ISODateTime | null
  inFile: ISODateTime | null
  /** "The file's copy has 1 more comment", "Both copies changed": words only, no field values. */
  what: string
  /**
   * Whether it waits for a choice (keep this workspace's copy or take the file's): a request changed
   * on both sides. An ID clash, or a decision that cannot take effect here, is listed with no choice.
   */
  choosable: boolean
}

/**
 * The conflicts of a preview as the importer may read them (a limited request: ID, type and title
 * only). Comments count only where the importer may read them (8.4 rule 5, M3 review PV-8), so an
 * approvers-only comment is never told by a count.
 */
export function conflictRows(ctx: AnalyticsContext, conflicts: readonly MergeConflict[]): ConflictRow[] {
  const viewer = viewerOf(ctx)
  return conflicts.map((c) => {
    // A preview's conflict carries the view its copies were cut to (`conflictAsSeen`); a merge's own
    // is read here.
    const full = c.view
      ? c.view === 'full'
      : requestView(c.current, viewer) === 'full' && requestView(c.incoming, viewer) === 'full'
    const seen = (r: HcRequest) => r.comments.filter((x) => commentVisible(x, r, viewer)).length
    const more = seen(c.incoming) - seen(c.current)
    const choosable = isChoosable(c)
    // A decision that cannot take effect here names why only to a viewer who sees the request in
    // full: the sentence can name a site, a department or a seat a limited view leaves out (M3 recheck).
    const what = !choosable
      ? (c.kind ?? 'changed') === 'effect' && !full
        ? EFFECT_NOT_HERE_TEXT
        : (c.reason ?? 'This request cannot merge.')
      : !full
        ? 'Both copies changed since the last import.'
        : more > 0
          ? `The file's copy has ${more} more ${more === 1 ? 'comment' : 'comments'}; this workspace's has moved on since the last import.`
          : c.incoming.state !== c.current.state
            ? `This workspace's copy is ${c.current.state}; the file's is ${c.incoming.state}.`
            : 'Both copies changed since the last import.'
    return {
      requestId: c.requestId,
      type: c.current.type,
      title: c.current.jobTitle ? managerText(c.current.jobTitle, viewer) : c.current.jobTitle,
      here: full ? c.current.updatedAt : null,
      inFile: full ? c.incoming.updatedAt : null,
      what,
      choosable,
    }
  })
}
