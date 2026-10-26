/**
 * The PlanStore contract (docs/PLAN.md 5.4). `plan/store/` is the only impure part of `plan/`: it
 * reads and writes IndexedDB through src/data/idb.ts and holds the write lock through
 * src/data/tabSync.ts. Engines never read a store; workspace files are built from guarded models,
 * never from a store (5.5).
 *
 * - Keys (src/app/storageKeys.ts): plan state at `hcp:plan`, the audit log at `hcp:audit:<chunk>`,
 *   500 entries a chunk.
 * - Write lock: every write (`save`, `commit`, `replaceAudit`, `lockVersion`, `appendAudit`) rejects in
 *   a reader tab with READ_ONLY_NOTE; `readOnly` says so before trying.
 * - One write, all or nothing (M3 review IN-5): `commit` saves plan state and appends its audit
 *   entries as one write. Every entry is numbered, chained and hashed before anything is stored, so a
 *   reader tab, an entry that cannot be written as canonical JSON or a refused storage write leaves
 *   the store as it was. The write path saves through `commit` only.
 * - The chain head (IN-10): a store whose stored `auditHead` is ahead of its log (a lost tail)
 *   continues the chain from the head, never from the log's last entry, so the gap stays a visible
 *   break and no seq is used twice; the head is never written back to a lower seq.
 * - The sample is regenerated on every load and never stored; plan state made on it is stored as an
 *   overlay against the sample's baseline id (`PlanState.baselineId`).
 */
import { APP_NAME } from '@/app/brand'
import type { ISODateTime } from '@/data/schema'
import type {
  Actor,
  AssumptionRow,
  AuditDraft,
  AuditEntry,
  AuditObject,
  ForecastTable,
  FxTable,
  LockedVersion,
  PlanLine,
  PlanState,
  WorkingVersion,
} from '../types'

/** The masthead's note in a reader tab, and the message every refused write rejects with. */
export const READ_ONLY_NOTE = `Read only: ${APP_NAME} is open in another tab.`

/** Which audit entries `listAudit` returns; every field narrows, none means all. */
export interface AuditFilter {
  objects?: readonly AuditObject[]
  /** The object's id (a positionId, requestId, versionId, ...). */
  id?: string
  /** The Acting as person who made the change. */
  by?: string
  /** Inclusive bounds on `at`. */
  from?: ISODateTime
  to?: ISODateTime
  /** The newest n entries that match. */
  limit?: number
}

/** How a lock names the new version: the year's first lock is the Budget, later ones reforecasts. */
export interface LockAs {
  kind: 'budget' | 'reforecast'
  name: string
}

/** What a lock stores besides the version's header (src/plan/engine/versions.ts builds the rest and the hash). */
export interface LockContent {
  lines: readonly PlanLine[]
  assumptions: readonly AssumptionRow[]
  rates: FxTable
  /** Reforecasts store their forecast; a Budget stores null. */
  forecast: ForecastTable | null
}

/**
 * What a store needs besides storage. Only stores read a clock; engines take dates as inputs.
 * `computeLock` runs the engines over the current datasets and plan state (the app's data context
 * supplies it), so the store never imports a view or the data context.
 */
export interface PlanStoreDeps {
  /** The current time as an ISO date-time; tests pin it. */
  now(): ISODateTime
  /** The year's Working computed as of `at`, as a lock stores it. */
  computeLock(working: WorkingVersion, at: ISODateTime): LockContent
  /** A version ID never used before ('fy27-q2-reforecast'). */
  newVersionId(working: WorkingVersion, as: LockAs): string
}

/** What `commit` takes besides the state and its drafts. */
export interface CommitOptions {
  /**
   * Replace the whole log with these entries first (a Full file's chain, C35: Replace from a Full
   * file); the drafts then follow them. The entries must verify (`verifyChain`), else the commit
   * rejects with `fileChainBrokenText` and nothing changes.
   */
  replaceAudit?: readonly AuditEntry[]
}

export interface PlanStore {
  /** True in a reader tab: another tab holds the write lock, and every write rejects with READ_ONLY_NOTE. */
  readonly readOnly: boolean
  load(): Promise<PlanState>
  /** Rejects unless this tab holds the write lock. */
  save(next: PlanState): Promise<void>
  /**
   * Saves `next` and appends `audit` in order as ONE write (see the module comment): all or nothing.
   * Resolves to the entries appended. Rejects in a reader tab with READ_ONLY_NOTE, and with the
   * entry's own error when a draft cannot be written as canonical JSON.
   */
  commit(
    next: PlanState,
    audit: readonly AuditDraft[],
    options?: CommitOptions,
  ): Promise<readonly AuditEntry[]>
  /**
   * Replaces the whole audit log with `entries` (C35: used only by Replace from a Full file, through
   * `commit`'s `replaceAudit`): they must verify, else it rejects with the first broken link
   * (`fileChainBrokenText`) and nothing changes. `PlanState.auditHead` follows the new log.
   */
  replaceAudit(entries: readonly AuditEntry[]): Promise<void>
  /**
   * Computes the year's Working as of now into a NEW locked version (`parentId` = workingId, kind
   * 'budget' for the year's first lock, else 'reforecast'), stores it with its hash and leaves
   * Working editable (docs/PLAN.md 6.5, change C28). Writes the audit entry.
   */
  lockVersion(workingId: string, as: LockAs, by: Actor): Promise<LockedVersion>
  /** Numbers, chains and stores one entry (src/plan/audit/chain.ts `appendEntry`). */
  appendAudit(e: AuditDraft): Promise<AuditEntry>
  listAudit(filter?: AuditFilter): Promise<readonly AuditEntry[]>
}
