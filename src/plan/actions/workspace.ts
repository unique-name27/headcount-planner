/**
 * Workspace file imports that write plan state (docs/PLAN.md 5.5, 8.3 `request.import`,
 * `workspace.import`, 15.1 R17, C35). The files are read and validated before an action runs
 * (src/views/data/engine/workspace.ts: `readFile`, `importPreview`, `importRequestsPreview`, over
 * src/plan/workspace/validate.ts, diff.ts and merge.ts), so an action takes a file already read and
 * never parses text. Opening a shared file (`workspace.open-shared`) writes nothing and is not here.
 * Pure.
 *
 * - importRequests (`request.import`; Manager hidden "Import requests is for HRBPs and above.";
 *   Leader limited): merges `body.plan.requests` of kind 'requests' or 'shareable' files by
 *   `requestId` (merge.ts `mergeRequests`: the later `updatedAt` wins; a request changed on both sides
 *   since the last merge, or whose copies diverged, is a conflict, decided by `choices`, else the
 *   workspace's copy stays). In Leader mode with a tree scope a request merges only when
 *   `rules.mayMerge` (it touches the tree or the leader is on its chain); others are skipped and the
 *   workspace's copy is never overwritten. Counts and conflicts cover only requests whose
 *   `rules.requestView` is not 'none' (8.4 rule 3). The new merge base goes to `state.mergeBase`.
 *   One 'workspace' entry (field 'requests merged'), then the entries of the approvals it applies.
 * - replaceWorkspace (`workspace.import`, HR admin only): a Full file's plan state in place of this
 *   workspace's, and its datasets (`ActionOk.datasets`); locked versions already matched by hash when
 *   the file was read ("This file's FY27 Budget does not match this workspace's (hash differs).
 *   Nothing was imported."). C35: the file's audit log replaces this workspace's
 *   (`ActionOk.replaceAudit`, `PlanStore.replaceAudit` through the same commit) when its chain
 *   verifies, else the Replace is refused with the first broken link (`fileChainBrokenText`); one
 *   'workspace' entry (field 'replaced') follows the file's entries.
 * - mergeWorkspace (`workspace.import`): merge.ts `mergePlanState` (requests by the rule above,
 *   versions and closes by ID with hashes matched, Working overlay rows by row key, Remove override's
 *   removals from both sides, a freeze under one of this workspace's IDs for another org or start
 *   kept under a new ID). This workspace's log stays (C35). One audit entry (field 'merged', listing
 *   any freeze it gave a new ID), then the entries of the approvals it applies.
 *
 * M3 review fixes (core-platform):
 *  - D-MERGE (IN-2, SP-3): a request a file brings Approved (or Approved with changes) over a copy
 *    that is not, or new here, applies its effects in this workspace through the requests engine
 *    (src/plan/actions/requests.ts `importedApprovals`: idempotent by the request's own rows, as of
 *    its approval date, the file's created seat IDs). An approval that cannot apply here is a
 *    conflict that names why (merge.ts `effectRefusal`, kind 'effect') and nothing of it changes.
 *    Each entry it writes is the importer's (10.7), its comment naming the approver and the file.
 *  - IN-7: a conflict settled to the file's copy counts as merged, in the notice and in the entry;
 *    only the conflicts still open count as conflicts; the entry lists each choice.
 *  - D-ID: Replace and Merge keep this workspace's request ID tag, so its new IDs stay its own. Merge
 *    keeps its ID secret too; Replace takes a new one (M3 recheck), so a restore from an older Full
 *    file never mints again an ID this workspace sent out after the file was saved.
 *  - PV-6, UI-3: a job title or a version name a file brings is free text a manager reads; one that
 *    holds an amount is refused at import as at entry (FILE_AMOUNT_TEXT), nothing imported.
 *
 * M4 (M3 known gap 5): a version ID a Full file brings that carries an amount (an ID is its name's
 * slug) is rewritten before Replace or Merge takes the file, with every reference to it
 * (src/plan/workspace/versionIds.ts `cleanVersionIds`; a Merge maps it to the same version already
 * here). The lock hashes leave IDs out, so every lock still verifies; the file's audit log is kept as
 * it is. The workspace entry lists each rewritten version by name and new ID (`versionIdsRewritten`).
 *
 * Readings taken here (core, M3):
 *  - Requests merge against every request in force (the imported rows with plan state's own over
 *    them), and only those the merge adds or changes are written into plan state.
 *  - With the file's datasets the plan is your own data's (no sample baseline), without them it
 *    stays an overlay against this workspace's baseline.
 *
 * M4 recheck (B9-a): a Full file with no datasets is taken, by Replace or Merge, only where its plan
 * state's baseline id is this workspace's (`fileBaselineRefusal`): the earlier sample's changes, saved
 * from Data room > Workspace, stay in their file rather than lie over the new sample
 * (EARLIER_SAMPLE_FILE_TEXT). The preview says the same before anything runs.
 *
 * Frozen in the M3 freeze (docs/CONTRACTS-M3.md); the core builder fills the bodies.
 */

import { fileChainBrokenText, verifyChain } from '../audit/chain'
import { headOf } from '../store/memoryStore'
import type { HcRequest, PlanState, WorkspaceFile, WorkspaceKind } from '../types'
import {
  chooseConflict,
  type DecidedArrival,
  freezeClashes,
  isChoosable,
  type MergeConflict,
  mergeBaseMap,
  mergePlanState,
  mergeRequests,
  mergeSummary,
} from '../workspace/merge'
import { cleanVersionIds, type VersionIdChange } from '../workspace/versionIds'
import {
  EARLIER_SAMPLE_FILE_TEXT,
  FILE_AMOUNT_TEXT,
  NO_FILE_TEXT,
  NOT_FULL_FILE_TEXT,
  OTHER_DATA_FILE_TEXT,
  WORKSPACE_MERGED_NOTICE,
  WORKSPACE_REPLACED_NOTICE,
} from './copy'
import { gate } from './gate'
import { nextIdSecret } from './requestIds'
import { importedApprovals } from './requests'
import { auditOf, no, ok } from './shared'
import type { ActionContext, ActionResult } from './types'

/** One file's requests as validate.ts `requestsOf` reads them. */
export interface RequestFile {
  /** The file's name, for the summary and the conflict list. */
  name: string
  kind: WorkspaceKind
  requests: readonly HcRequest[]
  /** Rows missing a required `requests` field, skipped at read. */
  skipped: number
}

export interface ImportRequestsInput {
  files: readonly RequestFile[]
  /** A choice per conflicting request ID: keep the workspace's copy or take the file's. Absent: the workspace's. */
  choices?: Readonly<Record<string, 'current' | 'incoming'>>
}

export interface WorkspaceImportInput {
  /** A file read by validate.ts `readWorkspace` (checksum, version, format and hashes checked). */
  file: WorkspaceFile
}

/** Plan state's requests after a merge over every request in force: the ones added or changed. */
function changedRequests(
  state: PlanState,
  inForce: readonly HcRequest[],
  merged: readonly HcRequest[],
): HcRequest[] {
  const before = new Map(inForce.map((r) => [r.requestId, r]))
  const own = new Map(state.requests.map((r) => [r.requestId, r]))
  for (const r of merged) if (before.get(r.requestId) !== r) own.set(r.requestId, r)
  return [...own.values()]
}

/** The requests a merge changes that hold an amount in their job title (PV-6: managers read titles). */
function titleWithAmount(
  ctx: ActionContext,
  inForce: readonly HcRequest[],
  merged: readonly HcRequest[],
): boolean {
  const before = new Map(inForce.map((r) => [r.requestId, r]))
  return merged.some((r) => before.get(r.requestId) !== r && !!r.jobTitle && ctx.rules.hasAmount(r.jobTitle))
}

/** The approver of a request's last decided step and the file it came in (an imported approval's audit comment). */
function approvalNoteOf(ctx: ActionContext, fileOf: (req: HcRequest) => string | null) {
  const names = new Map<string, string>()
  for (const w of ctx.datasets.workers)
    if (w.name && !names.has(w.employeeId)) names.set(w.employeeId, w.name)
  return (req: HcRequest): string => {
    let last: HcRequest['steps'][number] | null = null
    for (const s of req.steps) if (s.decision != null && s.at && (!last || (last.at ?? '') <= s.at)) last = s
    const who = last ? (names.get(last.approverId) ?? last.approverId) : null
    const file = fileOf(req)
    const from = file ? `Approved in the file ${file}` : 'Approved in an imported file'
    return who ? `${from}, by ${who}.` : `${from}.`
  }
}

/**
 * Why a request a file brings Approved cannot take effect here (merge.ts rule 6): a dry run of the
 * approval on this workspace's plan, null when it applies.
 */
const effectRefusalOf =
  (state: PlanState, ctx: ActionContext) =>
  (incoming: HcRequest): string | null =>
    importedApprovals(state, ctx, [incoming]).conflicts[0]?.text ?? null

/** `request.import`: requests from Export requests and Shareable files merged by request ID. */
export function importRequests(
  state: PlanState,
  ctx: ActionContext,
  input: ImportRequestsInput,
): ActionResult {
  const g = gate(ctx, 'request.import')
  if (g) return no(g)
  if (!input.files.length) return no(NO_FILE_TEXT)
  const inForce = ctx.env.requests
  const visible = (r: HcRequest) => ctx.rules.requestView(r) !== 'none'
  const result = mergeRequests(
    inForce,
    input.files.map((f) => f.requests),
    {
      base: mergeBaseMap(state.mergeBase),
      accept: (r) => ctx.rules.mayMerge(r),
      visible,
      effectRefusal: effectRefusalOf(state, ctx),
    },
  )
  let requests = result.requests
  let base = result.base
  const decided: DecidedArrival[] = [...(result.decided ?? [])]
  const choices = input.choices ?? {}
  const chosen: { requestId: string; choice: 'current' | 'incoming' }[] = []
  const shown = (c: MergeConflict) => visible(c.current) && visible(c.incoming)
  for (const c of result.conflicts) {
    const choice = choices[c.requestId]
    if (!choice || !isChoosable(c)) continue
    // Keeping a copy is a change made now: its revision is the wall clock (M3 recheck).
    const out = chooseConflict({ requests, base }, c, choice, ctx.at)
    requests = out.requests
    base = out.base
    if (out.decided) decided.push(out.decided)
    if (shown(c)) chosen.push({ requestId: c.requestId, choice })
  }
  if (titleWithAmount(ctx, inForce, requests)) return no(FILE_AMOUNT_TEXT)

  // D-MERGE: the approvals the files bring take effect here; one that cannot is kept out.
  const fileOf = (req: HcRequest): string | null =>
    input.files.find((f) =>
      f.requests.some((r) => r.requestId === req.requestId && r.updatedAt === req.updatedAt),
    )?.name ?? null
  let next: PlanState = { ...state, requests: changedRequests(state, inForce, requests), mergeBase: base }
  const approvals = importedApprovals(
    next,
    ctx,
    decided.map((d) => d.after),
    approvalNoteOf(ctx, fileOf),
  )
  const blocked = new Set(approvals.conflicts.map((c) => c.requestId))
  if (blocked.size) {
    // An approval that could not apply after all keeps the workspace's copy (nothing of it changes).
    const before = new Map(inForce.map((r) => [r.requestId, r]))
    const kept = requests.flatMap((r) => {
      if (!blocked.has(r.requestId)) return [r]
      const prev = before.get(r.requestId)
      return prev ? [prev] : []
    })
    next = { ...state, requests: changedRequests(state, inForce, kept), mergeBase: base }
    const retry = importedApprovals(
      next,
      ctx,
      decided.filter((d) => !blocked.has(d.requestId)).map((d) => d.after),
      approvalNoteOf(ctx, fileOf),
    )
    next = retry.next
    approvals.audit.splice(0, approvals.audit.length, ...retry.audit)
    approvals.applied.splice(0, approvals.applied.length, ...retry.applied)
  } else next = approvals.next

  // IN-7: a conflict settled to the file's copy is merged; only the ones still open are conflicts.
  const taken = chosen.filter((c) => c.choice === 'incoming').length
  const seenBlocked = requests.filter((r) => blocked.has(r.requestId) && visible(r)).length
  const merged = Math.max(0, result.merged + taken - seenBlocked)
  const open =
    result.conflicts.filter((c) => shown(c) && !(isChoosable(c) && choices[c.requestId])).length + seenBlocked
  const audit = [
    auditOf(ctx, 'workspace', 'requests', 'requests merged', null, {
      merged,
      files: result.files,
      conflicts: open,
      skipped: result.skipped,
      ...(chosen.length ? { chosen } : {}),
      ...(approvals.applied.length ? { applied: approvals.applied } : {}),
    }),
    ...approvals.audit,
  ]
  return ok(next, audit, mergeSummary(merged, result.files, open))
}

/**
 * The entry's note of the version IDs a file brought with an amount (M3 known gap 5): each version's
 * name and its new ID, never the old one.
 */
const versionsRenamed = (renamed: readonly VersionIdChange[]) =>
  renamed.length ? { versionIdsRewritten: renamed.map((r) => ({ name: r.name, versionId: r.to })) } : {}

/**
 * Why a Full file's plan state cannot be taken here (M4 recheck B9-a), null when it can: a file with
 * no datasets carries plan state made over the data it was saved on, so it is taken only where that
 * data is in force, its baseline id this workspace's. A file made on an earlier build of the sample
 * (the "Changes on the earlier sample" file, src/views/data/engine/workspace.ts `earlierSampleFile`)
 * would otherwise lay that sample's state over this one, the mixing the baseline id stops for stored
 * state (lead browser finding B9). A file that carries its datasets brings its own data, so it is
 * never refused here.
 */
export function fileBaselineRefusal(state: Pick<PlanState, 'baselineId'>, f: WorkspaceFile): string | null {
  if (f.kind !== 'full' || f.body.plan.kind !== 'full') return null
  if (f.body.datasets && Object.keys(f.body.datasets).length) return null
  const theirs = f.body.plan.state.baselineId ?? null
  const ours = state.baselineId ?? null
  if (theirs === ours) return null
  return theirs != null && ours != null ? EARLIER_SAMPLE_FILE_TEXT : OTHER_DATA_FILE_TEXT
}

/** A Full file's version names or request titles that hold an amount (UI-3, PV-6). */
function fileHasAmount(ctx: ActionContext, incoming: PlanState): boolean {
  return (
    incoming.versions.some((v) => ctx.rules.hasAmount(v.name ?? '')) ||
    incoming.requests.some((r) => !!r.jobTitle && ctx.rules.hasAmount(r.jobTitle))
  )
}

/** `workspace.import` (Replace): a Full file's datasets, plan state and audit log in place of this workspace's. */
export function replaceWorkspace(
  state: PlanState,
  ctx: ActionContext,
  input: WorkspaceImportInput,
): ActionResult {
  const g = gate(ctx, 'workspace.import')
  if (g) return no(g)
  const f = input.file
  if (!f) return no(NO_FILE_TEXT)
  if (f.kind !== 'full' || f.body.plan.kind !== 'full') return no(NOT_FULL_FILE_TEXT)
  const baseline = fileBaselineRefusal(state, f)
  if (baseline) return no(baseline)
  const incoming = f.body.plan.state
  const log = f.body.plan.audit ?? []
  // C35: the file's log replaces this workspace's only when its chain verifies, up to the head the
  // file's own state keeps (IN-10, M3 recheck: a log that ends before its head lost its tail).
  const check = verifyChain(log, incoming.auditHead)
  if (!check.ok) return no(fileChainBrokenText(check.brokenAt))
  if (fileHasAmount(ctx, incoming)) return no(FILE_AMOUNT_TEXT)
  const given = f.body.datasets && Object.keys(f.body.datasets).length ? f.body.datasets : undefined
  // M3 known gap 5: a version ID that carries an amount is rewritten, with every reference to it.
  const clean = cleanVersionIds(incoming, {
    hasAmount: ctx.rules.hasAmount,
    ...(given ? { datasets: given } : {}),
  })
  const datasets = clean.datasets
  // With the file's datasets in place the data is no longer the sample's, so the plan is no overlay.
  // The workspace keeps its tag and takes a new ID secret (M3 recheck): the IDs it minted since the
  // file was saved are out of force now, and a new secret never mints them again.
  const { idTag: _theirs, idSecret: _theirSecret, ...rest } = clean.state
  const own = state.idSecret ?? state.idTag
  const next: PlanState = {
    ...rest,
    baselineId: datasets ? null : state.baselineId,
    auditHead: headOf(log),
    ...(state.idTag ? { idTag: state.idTag } : {}),
    ...(own ? { idSecret: nextIdSecret(own, `${f.checksum}\u0000${ctx.at}`) } : {}),
  }
  const audit = [
    auditOf(ctx, 'workspace', 'workspace', 'replaced', null, {
      savedAt: f.savedAt,
      kind: f.kind,
      entries: log.length,
      ...versionsRenamed(clean.renamed),
    }),
  ]
  return { ...ok(next, audit, WORKSPACE_REPLACED_NOTICE, datasets), replaceAudit: log }
}

/** `workspace.import` (Merge): a file's plan state merged into this workspace's; this workspace's log stays. */
export function mergeWorkspace(
  state: PlanState,
  ctx: ActionContext,
  input: WorkspaceImportInput,
): ActionResult {
  const g = gate(ctx, 'workspace.import')
  if (g) return no(g)
  const f = input.file
  if (!f) return no(NO_FILE_TEXT)
  if (f.kind !== 'full' || f.body.plan.kind !== 'full') return no(NOT_FULL_FILE_TEXT)
  const baseline = fileBaselineRefusal(state, f)
  if (baseline) return no(baseline)
  if (fileHasAmount(ctx, f.body.plan.state)) return no(FILE_AMOUNT_TEXT)
  const inForce = ctx.env.requests
  // M3 known gap 5: a version ID that carries an amount is rewritten (the same version already here
  // keeps its ID here), with every reference to it.
  const clean = cleanVersionIds(f.body.plan.state, {
    hasAmount: ctx.rules.hasAmount,
    current: state.versions,
  })
  const theirs = clean.state
  try {
    // A freeze the file brings under one of this workspace's IDs for another org or start keeps its
    // own under a new ID (M3 recheck); the entry lists each.
    const renamed = freezeClashes(ctx.datasets.freezes, theirs.overlay.freezes)
    const merged = mergePlanState({ ...state, requests: inForce }, theirs, {
      base: mergeBaseMap(state.mergeBase),
      visible: (r) => ctx.rules.requestView(r) !== 'none',
      effectRefusal: effectRefusalOf(state, ctx),
      freezes: ctx.datasets.freezes,
    })
    // D-MERGE: what arrives approved over a copy that is not applies its effects here.
    const before = new Map(inForce.map((r) => [r.requestId, r]))
    const approved = (r: HcRequest | undefined) =>
      r?.state === 'Approved' || r?.state === 'Approved with changes'
    const { idTag: _theirs, idSecret: _theirSecret, ...rest } = merged
    const base: PlanState = {
      ...rest,
      requests: changedRequests(state, inForce, merged.requests),
      auditHead: state.auditHead,
      ...(state.idTag ? { idTag: state.idTag } : {}),
      ...(state.idSecret ? { idSecret: state.idSecret } : {}),
    }
    // A Full file's overlay may hold an approval's rows already; those are not applied twice.
    const carried = new Set(base.overlay.positions.map((r) => r.sourceRequestId).filter(Boolean))
    const arrivals = merged.requests.filter(
      (r) =>
        approved(r) &&
        !approved(before.get(r.requestId)) &&
        before.get(r.requestId) !== r &&
        !carried.has(r.requestId),
    )
    const name = f.savedAt ? `saved ${f.savedAt.slice(0, 10)}` : null
    const approvals = importedApprovals(
      base,
      ctx,
      arrivals,
      approvalNoteOf(ctx, () => name),
    )
    const audit = [
      auditOf(ctx, 'workspace', 'workspace', 'merged', null, {
        savedAt: f.savedAt,
        kind: f.kind,
        ...(approvals.applied.length ? { applied: approvals.applied } : {}),
        ...(renamed.length ? { freezesRenamed: renamed } : {}),
        ...versionsRenamed(clean.renamed),
      }),
      ...approvals.audit,
    ]
    return ok(approvals.next, audit, WORKSPACE_MERGED_NOTICE)
  } catch (e) {
    return no(e instanceof Error ? e.message : String(e))
  }
}
