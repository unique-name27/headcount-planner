/**
 * Version IDs that carry an amount (docs/PLAN.md 8.4 rule 5, 15.1 R81; M3 known gap 5). A version's
 * ID is the slug of the name it was locked under (src/plan/store/memoryStore.ts `defaultVersionId`),
 * and IDs reach every mode: the version pickers, file names, a Shareable file's version refs and
 * export headers. Entry refuses an amount in a name, so the app never mints such an ID
 * (`mintVersionId` is what the lock uses), but a Full file can bring one: made before the entry
 * check, or written by hand ("fy27-q1-reforecast-cut-to-57-1m"). Replace and Merge rewrite every such
 * ID before they take the file (src/plan/actions/workspace.ts, `cleanVersionIds`). Pure;
 * `hasAmount` is passed in, because plan/ never imports access/ at runtime.
 *
 * - An ID carries an amount when `hasAmount` finds one in it as written or read as words, its
 *   separators as spaces: "fy27-budget-250000" reads "fy27 budget 250000", "plan-57-1m" reads
 *   "plan 57 1m" (a dash before digits reads as a code or a date part as written, "P-2589").
 * - The new ID: on a Merge, the same version already here keeps its ID here (a locked Budget of the
 *   same fiscal year and lock hash, a locked reforecast of the same fiscal year, name and lock hash,
 *   or this workspace's Working of the year, which a Merge keeps as the workspace's), when that ID is
 *   clean and not taken by another. Otherwise the slug of the version's name, or '<fy>-<kind>' when
 *   that too carries an amount, with '-2', '-3', ... when taken.
 * - Every reference follows: the versions' IDs and parents, a locked version's lines and assumption
 *   rows, the overlay's assumption rows and Remove override's removals, a trade's rate version, and
 *   the file's datasets (assumption rows naming a version by ID, requests' rate version). Rows that
 *   name a version by its name are left as they are (a name with an amount is refused first,
 *   FILE_AMOUNT_TEXT).
 * - The lock hash leaves version IDs out (src/plan/engine/versions.ts `lockHash`: versions are
 *   identities, not content), so every lock still verifies after the rewrite.
 * - The audit log is the file's as it is: its chain hashes every entry, so an entry naming the old ID
 *   keeps it. Manager mode never reads the log (`page:audit` is hidden there).
 */
import type { AssumptionRow, Datasets, FiscalYear } from '@/data/schema'
import { versionSlug } from '../store/memoryStore'
import type { AnyVersion, PlanState, VersionKind } from '../types'

/** 8.4 rule 5's amount grammar (src/access/visibility.ts `hasAmount`). */
export type HasAmount = (text: string) => boolean

/** An ID read as words: its separators as spaces ("fy27-q1-57-1m" reads "fy27 q1 57 1m"). */
export const idAsWords = (id: string): string => id.replace(/[-_~/+|:]+/g, ' ').trim()

/** Whether a version ID carries an amount, as written or read as words (see the module comment). */
export const idHasAmount = (id: string, hasAmount: HasAmount): boolean =>
  hasAmount(id) || hasAmount(idAsWords(id))

/** What a new ID is minted from: the version's name, fiscal year and kind. */
export interface VersionIdBasis {
  name: string
  fiscalYear: FiscalYear
  kind: VersionKind
}

/**
 * A clean ID for a version: its name's slug, or '<fy>-<kind>' when the slug is empty or carries an
 * amount, then '-2', '-3', ... while taken.
 */
export function mintVersionId(v: VersionIdBasis, taken: ReadonlySet<string>, hasAmount: HasAmount): string {
  const slug = versionSlug(v.name)
  const root = slug && !idHasAmount(slug, hasAmount) ? slug : `${v.fiscalYear.toLowerCase()}-${v.kind}`
  let id = root
  for (let n = 2; taken.has(id); n++) id = `${root}-${n}`
  return id
}

/** One ID a rewrite changed, with the version's name (never the old ID, which carries an amount). */
export interface VersionIdChange {
  from: string
  to: string
  name: string
}

export interface CleanVersionIds {
  state: PlanState
  /** The file's datasets with their references rewritten; absent when none were given. */
  datasets?: Partial<Datasets>
  /** The IDs changed, in the file's version order; empty when none carried an amount. */
  renamed: readonly VersionIdChange[]
}

/** Whether `here` is the same version as `theirs` (see the module comment). */
function sameVersion(here: AnyVersion, theirs: AnyVersion): boolean {
  if (here.fiscalYear !== theirs.fiscalYear || here.state !== theirs.state) return false
  if (theirs.state === 'working') return true
  if (theirs.state !== 'locked' || here.kind !== theirs.kind || here.hash !== theirs.hash) return false
  return theirs.kind === 'budget' || here.name === theirs.name
}

/** A row naming a version by an old ID, renamed; the same row otherwise. */
const renamedRow = <R extends AssumptionRow>(r: R, to: ReadonlyMap<string, string>): R => {
  const id = to.get((r.version ?? '').trim())
  return id ? { ...r, version: id } : r
}

/** A version with its ID, parent, lines and rows renamed; the same object when none names an old ID. */
function renamedVersion(v: AnyVersion, to: ReadonlyMap<string, string>): AnyVersion {
  const versionId = to.get(v.versionId) ?? v.versionId
  const parentId = v.parentId == null ? null : (to.get(v.parentId) ?? v.parentId)
  const rows = v.state === 'locked' && v.assumptions.some((r) => to.has((r.version ?? '').trim()))
  if (versionId === v.versionId && parentId === v.parentId && !rows) return v
  if (v.state !== 'locked') return { ...v, versionId, parentId }
  return {
    ...v,
    versionId,
    parentId,
    lines: v.lines.versionId === versionId ? v.lines : { ...v.lines, versionId },
    assumptions: v.assumptions.map((r) => renamedRow(r, to)),
  }
}

/** The new ID for a trade's rate version when it is an old ID, else null. */
const renamedRate = (id: string | null | undefined, to: ReadonlyMap<string, string>): string | null =>
  id ? (to.get(id.trim()) ?? null) : null

/**
 * A Full file's plan state (and datasets) with every version ID that carries an amount rewritten
 * (see the module comment). `current` is the workspace's versions on a Merge (none on a Replace,
 * which takes the file whole). With no such ID, the same objects come back and `renamed` is empty.
 */
export function cleanVersionIds(
  incoming: PlanState,
  opts: {
    hasAmount: HasAmount
    current?: readonly AnyVersion[]
    datasets?: Partial<Datasets>
  },
): CleanVersionIds {
  const { hasAmount } = opts
  const dirty = (id: string) => idHasAmount(id, hasAmount)
  const out: CleanVersionIds = {
    state: incoming,
    ...(opts.datasets ? { datasets: opts.datasets } : {}),
    renamed: [],
  }
  if (!incoming.versions.some((v) => dirty(v.versionId))) return out

  const current = (opts.current ?? []).filter((v) => !dirty(v.versionId))
  const kept = incoming.versions.filter((v) => !dirty(v.versionId)).map((v) => v.versionId)
  const taken = new Set<string>([...kept, ...current.map((v) => v.versionId)])
  // An ID of this workspace stands for one version of the file at most, and never for a version
  // the file brings under that same ID.
  const used = new Set<string>(kept)
  const to = new Map<string, string>()
  const renamed: VersionIdChange[] = []
  for (const v of incoming.versions) {
    if (!dirty(v.versionId) || to.has(v.versionId)) continue
    const same = current.find((x) => !used.has(x.versionId) && sameVersion(x, v))
    const id = same ? same.versionId : mintVersionId(v, taken, hasAmount)
    taken.add(id)
    used.add(id)
    to.set(v.versionId, id)
    renamed.push({ from: v.versionId, to: id, name: v.name })
  }

  const state: PlanState = {
    ...incoming,
    versions: incoming.versions.map((v) => renamedVersion(v, to)),
    overlay: {
      ...incoming.overlay,
      assumptions: incoming.overlay.assumptions.map((r) => renamedRow(r, to)),
      ...(incoming.overlay.removedAssumptions
        ? { removedAssumptions: incoming.overlay.removedAssumptions.map((r) => renamedRow(r, to)) }
        : {}),
    },
    requests: incoming.requests.map((r) => {
      const next = renamedRate(r.trade?.rateVersion, to)
      return r.trade && next ? { ...r, trade: { ...r.trade, rateVersion: next } } : r
    }),
  }
  const d = opts.datasets
  const datasets: Partial<Datasets> | undefined = d
    ? {
        ...d,
        ...(d.assumptions ? { assumptions: d.assumptions.map((r) => renamedRow(r, to)) } : {}),
        ...(d.requests
          ? {
              requests: d.requests.map((r) => {
                const next = renamedRate(r.rateVersion, to)
                return next ? { ...r, rateVersion: next } : r
              }),
            }
          : {}),
      }
    : undefined
  return { state, ...(datasets ? { datasets } : {}), renamed }
}
