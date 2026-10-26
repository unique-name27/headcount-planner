/**
 * What an import would change (docs/PLAN.md 5.5): dataset row counts, plan state changes and versions,
 * shown before Replace or Merge. Built by engines C in M1. Pure.
 *
 * - Datasets: one row per dataset the file carries (a Full file carries all eight), with the row
 *   counts now and in the file.
 * - Requests: new (not in the workspace), changed (in both, different) and, for a Full file, not in
 *   the file (Replace removes them; Merge keeps them). Shareable and Requests files only add or change.
 * - Versions and month closes: new ones, and how many are the same by ID or month.
 * - Cycles: new and changed.
 * - The audit log (a Full file, C35): its entries now and in the file, and whether the file's chain
 *   verifies (`verifyChain`). Replace puts a log that verifies in place of this one and adds one
 *   entry; a broken one refuses Replace with its first broken link. Merge keeps this log.
 * The lines are plain sentences with counts and version names, never an amount.
 */
import { DATASET_KEYS, type DatasetKey, type Datasets, datasetDef } from '@/data/schema'
import { type ChainCheck, verifyChain } from '../audit/chain'
import { canonicalJson } from '../canonical'
import type { AuditEntry, Cycle, HcRequest, LockedVersionRef, PlanState, WorkspaceFile } from '../types'

export interface WorkspaceDiff {
  datasets: readonly { key: DatasetKey; current: number; incoming: number }[]
  plan: {
    requests: { added: number; changed: number; removed: number }
    versions: { added: readonly LockedVersionRef[]; same: number }
    closes: { added: number; same: number }
    cycles: { added: number; changed: number }
  }
  /**
   * A Full file's audit log (C35): entries here and in the file, and the file's chain check (Replace
   * takes the file's log only when it verifies). Null for a file of another kind.
   */
  audit: { here: number; inFile: number; check: ChainCheck } | null
  /** One plain sentence per line, for the confirm. */
  lines: readonly string[]
}

/** The diff's line about a Full file's audit log: what Replace and Merge do with it (C35). */
export function auditLine(here: number, check: ChainCheck): string {
  if (!check.ok)
    return `Audit log: the file's chain breaks at entry ${check.brokenAt.toLocaleString('en-US')}, so Replace is refused. Merge keeps this workspace's log.`
  return `Audit log: ${count(here, 'entry', 'entries')} now, ${count(check.count, 'entry', 'entries')} in the file, and the file's chain checks out. Replace puts the file's log in place of this one and adds one entry; Merge keeps this one.`
}

const count = (n: number, one: string, many = `${one}s`): string =>
  `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`

/** Whether two plain values differ (canonical JSON, so key order never counts). */
function differs(a: unknown, b: unknown): boolean {
  try {
    return canonicalJson(a) !== canonicalJson(b)
  } catch {
    return true
  }
}

/** What the incoming file says about plan state, by kind. */
function incomingPlan(file: WorkspaceFile): {
  requests: readonly HcRequest[]
  versions: readonly LockedVersionRef[]
  closes: readonly string[]
  cycles: readonly Cycle[]
  replaces: boolean
} {
  const plan = file.body.plan
  if (plan.kind === 'full') {
    const s = plan.state
    return {
      requests: s.requests,
      versions: s.versions.map((v) => ({
        versionId: v.versionId,
        name: v.name,
        kind: v.kind,
        fiscalYear: v.fiscalYear,
        state: v.state,
        hash: v.hash,
      })),
      closes: s.closes.map((c) => c.month),
      cycles: s.cycles,
      replaces: true,
    }
  }
  if (plan.kind === 'shareable')
    return {
      requests: plan.requests,
      versions: plan.versions,
      closes: plan.closes.map((c) => c.month),
      cycles: plan.cycles,
      replaces: false,
    }
  return { requests: plan.requests, versions: [], closes: [], cycles: [], replaces: false }
}

/** The diff between the workspace and an incoming Full file (Replace or Merge, HR admin). */
export function workspaceDiff(
  current: { datasets: Datasets; plan: PlanState; audit?: readonly AuditEntry[] },
  incoming: WorkspaceFile,
): WorkspaceDiff {
  const lines: string[] = []

  const ds = incoming.body.datasets ?? {}
  const datasets = DATASET_KEYS.filter((k) => Array.isArray(ds[k])).map((key) => ({
    key,
    current: current.datasets[key]?.length ?? 0,
    incoming: ds[key]?.length ?? 0,
  }))
  for (const d of datasets)
    lines.push(
      `${datasetDef(d.key).label}: ${count(d.current, 'row')} now, ${count(d.incoming, 'row')} in the file.`,
    )

  const inc = incomingPlan(incoming)

  const ours = new Map(current.plan.requests.map((r) => [r.requestId, r]))
  const theirs = new Set<string>()
  let added = 0
  let changed = 0
  for (const r of inc.requests) {
    if (theirs.has(r.requestId)) continue
    theirs.add(r.requestId)
    const mine = ours.get(r.requestId)
    if (!mine) added++
    else if (differs(mine, r)) changed++
  }
  const removed = inc.replaces ? current.plan.requests.filter((r) => !theirs.has(r.requestId)).length : 0
  const requestParts = [`${count(added, 'new request')}`, `${count(changed, 'changed request')}`]
  if (inc.replaces) requestParts.push(`${count(removed, 'request')} not in the file`)
  lines.push(`Requests: ${requestParts.join(', ')}.`)

  const versionIds = new Set(current.plan.versions.map((v) => v.versionId))
  const newVersions = inc.versions.filter((v) => !versionIds.has(v.versionId))
  const sameVersions = inc.versions.length - newVersions.length
  lines.push(
    newVersions.length
      ? `Versions: ${count(newVersions.length, 'new version')} (${newVersions.map((v) => v.name).join(', ')}), ${count(sameVersions, 'already here', 'already here')}.`
      : `Versions: no new versions, ${count(sameVersions, 'already here', 'already here')}.`,
  )

  const closeMonths = new Set<string>(current.plan.closes.map((c) => c.month))
  const newCloses = inc.closes.filter((m) => !closeMonths.has(m))
  const sameCloses = inc.closes.length - newCloses.length
  lines.push(
    `Month closes: ${count(newCloses.length, 'new close')}, ${count(sameCloses, 'already here', 'already here')}.`,
  )

  const cycles = new Map(current.plan.cycles.map((c) => [c.cycleId, c]))
  let cyclesAdded = 0
  let cyclesChanged = 0
  for (const c of inc.cycles) {
    const mine = cycles.get(c.cycleId)
    if (!mine) cyclesAdded++
    else if (differs(mine, c)) cyclesChanged++
  }
  if (inc.cycles.length || cyclesAdded || cyclesChanged)
    lines.push(
      `Planning cycles: ${count(cyclesAdded, 'new cycle')}, ${count(cyclesChanged, 'changed cycle')}.`,
    )

  const plan = incoming.body.plan
  let audit: WorkspaceDiff['audit'] = null
  if (plan.kind === 'full') {
    // Up to the head the file's state keeps (IN-10, M3 recheck): a log that ends before it lost its tail.
    const check = verifyChain(
      [...plan.audit].sort((a, b) => a.seq - b.seq),
      plan.state.auditHead,
    )
    audit = { here: current.audit?.length ?? 0, inFile: plan.audit.length, check }
    lines.push(auditLine(audit.here, check))
  }

  return {
    datasets,
    plan: {
      requests: { added, changed, removed },
      versions: { added: newVersions, same: sameVersions },
      closes: { added: newCloses.length, same: sameCloses },
      cycles: { added: cyclesAdded, changed: cyclesChanged },
    },
    audit,
    lines,
  }
}
