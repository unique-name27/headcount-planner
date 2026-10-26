/**
 * The PlanStore tests use (docs/PLAN.md 5.4): plan state and the audit log in memory, with the same
 * rules as BrowserStore (writes refused while `readOnly`, audit numbered and chained by
 * src/plan/audit/chain.ts, locks computed through `deps.computeLock`). Built by engines C in M1.
 *
 * What both stores share lives here too: the empty state, the audit filter and the lock itself
 * (`lockInto`). Like IndexedDB, the store keeps copies: what `load` returns can be changed freely and
 * nothing written is shared with the caller.
 *
 * The store owns `PlanState.auditHead`: it mirrors the last audit entry, and `save` keeps the store's
 * own head whatever the saved state says, so a state read before an append can never roll it back.
 * `commit` saves a state and appends its entries as one write, all or nothing (M3 review IN-5);
 * `replaceAudit` takes a verified chain in place of the log (C35). Both stores share `entriesAfter`
 * and `checkedLog` for that.
 */
import { dateOf, isoDateTime } from '@/lib/dates'
import { appendEntry, type ChainHead, fileChainBrokenText, verifyChain } from '../audit/chain'
import { lockedFrom } from '../engine/versions'
import type {
  Actor,
  AuditDraft,
  AuditEntry,
  ISODateTime,
  LockedVersion,
  PlanState,
  WorkingVersion,
} from '../types'
import {
  type AuditFilter,
  type CommitOptions,
  type LockAs,
  type PlanStore,
  type PlanStoreDeps,
  READ_ONLY_NOTE,
} from './types'

export interface MemoryStoreOptions {
  /** The state `load()` returns until the first save; an empty state when left out. */
  initial?: PlanState
  /** Audit entries already in the log, in order. */
  audit?: readonly AuditEntry[]
  /** Act as a reader tab: every write rejects with READ_ONLY_NOTE. */
  readOnly?: boolean
  deps?: Partial<PlanStoreDeps>
  /** The workspace's request ID tag `load` gives a state that has none (D-ID); none when left out. */
  idTag?: string
  /** The workspace's request ID secret `load` gives a state that has none (M3 recheck); none when left out. */
  idSecret?: string
}

/* ───────────── shared by both stores ───────────── */

/** Plan state with nothing in it (a fresh browser, or imported data with no plan yet). */
export function emptyPlanState(baselineId: string | null = null): PlanState {
  return {
    v: 1,
    baselineId,
    versions: [],
    closes: [],
    adjustments: [],
    overlay: { positions: [], targets: [], freezes: [], assumptions: [] },
    requests: [],
    cycles: [],
    reviewed: [],
    mergeBase: [],
    auditHead: null,
  }
}

/**
 * The entries `drafts` make after `prev`, numbered, chained and hashed, before anything is stored: a
 * draft that cannot be written as canonical JSON throws here, so a commit writes nothing (IN-5).
 */
export function entriesAfter(prev: ChainHead | null, drafts: readonly AuditDraft[]): AuditEntry[] {
  const out: AuditEntry[] = []
  let last = prev
  for (const d of drafts) {
    const e = appendEntry(last, structuredClone(d))
    out.push(e)
    last = e
  }
  return out
}

/** A log taken in place of the store's (C35): a copy of `entries` when their chain verifies, else the refusal. */
export function checkedLog(entries: readonly AuditEntry[]): AuditEntry[] {
  const check = verifyChain(entries)
  if (!check.ok) throw new Error(fileChainBrokenText(check.brokenAt))
  return entries.map((e) => structuredClone(e))
}

/** The head a log ends on: the last entry's seq and hash, or null for an empty log. */
export const headOf = (log: readonly AuditEntry[]): PlanState['auditHead'] => {
  const last = log.at(-1)
  return last ? { seq: last.seq, hash: last.hash } : null
}

/**
 * The entries a filter keeps, in log order: every field narrows (objects, id, by, and `at` between
 * `from` and `to`, both inclusive; a bound written as a date covers its whole day), then the newest
 * `limit` of them.
 */
export function filterAudit(entries: readonly AuditEntry[], filter: AuditFilter = {}): AuditEntry[] {
  const { objects, id, by, from, to, limit } = filter
  const out = entries.filter(
    (e) =>
      (!objects || objects.includes(e.object)) &&
      (id === undefined || e.id === id) &&
      (by === undefined || e.by === by) &&
      (from === undefined || e.at.slice(0, from.length) >= from) &&
      (to === undefined || e.at.slice(0, to.length) <= to),
  )
  return limit === undefined ? out : out.slice(Math.max(0, out.length - Math.max(0, limit)))
}

/** A version name as an ID: 'FY27 Q2 Reforecast' gives 'fy27-q2-reforecast'; '' when nothing is left. */
export const versionSlug = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

/** 'FY27 Q2 Reforecast' gives 'fy27-q2-reforecast'; '-2', '-3', ... when that is taken. */
export function defaultVersionId(working: WorkingVersion, as: LockAs, taken: ReadonlySet<string>): string {
  const slug = versionSlug(as.name) || `${working.fiscalYear.toLowerCase()}-${as.kind}`
  let id = slug
  for (let n = 2; taken.has(id); n++) id = `${slug}-${n}`
  return id
}

/**
 * The lock both stores make (docs/PLAN.md 6.5, change C28): the year's Working computed as of `at`
 * (`computeLock`) into a NEW locked version (versions.ts `lockedFrom`: parentId = the Working, its
 * hash), added to the versions; Working itself is unchanged. Also the audit draft it writes. `at` is the
 * audit entry's own time (the wall clock); `businessAt` (R47: the as-of date with the clock's time of
 * day; `at` when left out) is the lock's date: what it computes as of, its `lockedAt` and the entry's
 * effective date. Throws
 * (the store rejects with the message) when the Working is unknown or not 'working', when the ID is
 * already used, when a reforecast comes before the year's Budget, or when `lockedFrom` refuses a second
 * Budget.
 */
export function lockInto(
  state: PlanState,
  workingId: string,
  as: LockAs,
  by: Actor,
  at: ISODateTime,
  deps: Pick<PlanStoreDeps, 'computeLock'> & Partial<Pick<PlanStoreDeps, 'newVersionId'>>,
  businessAt: ISODateTime = at,
): { state: PlanState; locked: LockedVersion; audit: AuditDraft } {
  const working = state.versions.find((v) => v.versionId === workingId)
  if (working?.state !== 'working') throw new Error(`There is no Working version ${workingId} to lock.`)
  if (
    as.kind === 'reforecast' &&
    !state.versions.some(
      (v) => v.state === 'locked' && v.kind === 'budget' && v.fiscalYear === working.fiscalYear,
    )
  )
    throw new Error(`Lock the ${working.fiscalYear} Budget before a reforecast.`)
  const taken = new Set(state.versions.map((v) => v.versionId))
  const versionId = deps.newVersionId ? deps.newVersionId(working, as) : defaultVersionId(working, as, taken)
  if (taken.has(versionId)) throw new Error(`The version ID ${versionId} is already used.`)
  const content = deps.computeLock(working, businessAt)
  const locked = lockedFrom(
    {
      working,
      versionId,
      as: { kind: as.kind, name: as.name },
      at: businessAt,
      by,
      lines: content.lines,
      assumptions: content.assumptions,
      rates: content.rates,
      forecast: content.forecast,
    },
    state.versions,
  )
  return {
    state: { ...state, versions: [...state.versions, locked] },
    locked,
    audit: {
      at,
      by: by.personId,
      byName: by.name,
      mode: by.mode,
      object: 'version',
      id: locked.versionId,
      field: 'locked',
      old: null,
      new: { kind: locked.kind, name: locked.name, parentId: workingId, hash: locked.hash },
      effectiveDate: dateOf(businessAt),
      comment: null,
      commentAudience: null,
    },
  }
}

/** Runs writes one after another, so two appends never read the same head. */
export class WriteQueue {
  private tail: Promise<unknown> = Promise.resolve()

  run<T>(write: () => Promise<T> | T): Promise<T> {
    const next = this.tail.then(write, write)
    this.tail = next.catch(() => undefined)
    return next
  }
}

const refuse = (): never => {
  throw new Error('This store was given no way to compute a lock.')
}

/* ───────────── the store ───────────── */

export class MemoryStore implements PlanStore {
  readonly options: MemoryStoreOptions
  private state: PlanState
  private log: AuditEntry[]
  private readonly queue = new WriteQueue()

  constructor(options: MemoryStoreOptions = {}) {
    this.options = options
    this.log = (options.audit ?? []).map((e) => structuredClone(e))
    this.state = { ...structuredClone(options.initial ?? emptyPlanState()), auditHead: headOf(this.log) }
  }

  get readOnly(): boolean {
    return this.options.readOnly === true
  }

  private now(): ISODateTime {
    return this.options.deps?.now?.() ?? isoDateTime(Date.now())
  }

  private write<T>(fn: () => T): Promise<T> {
    if (this.readOnly) return Promise.reject(new Error(READ_ONLY_NOTE))
    return this.queue.run(fn)
  }

  async load(): Promise<PlanState> {
    const s = structuredClone(this.state)
    const tag = s.idTag ?? this.options.idTag
    const secret = s.idSecret ?? this.options.idSecret
    return tag || secret
      ? { ...s, ...(tag ? { idTag: tag } : {}), ...(secret ? { idSecret: secret } : {}) }
      : s
  }

  async save(next: PlanState): Promise<void> {
    await this.commit(next, [])
  }

  /** Builds the whole log and state first, then swaps them in: nothing changes when any part throws (IN-5). */
  private commitNow(
    next: PlanState,
    drafts: readonly AuditDraft[],
    options: CommitOptions = {},
  ): AuditEntry[] {
    if (next.v !== 1) throw new Error('This plan state is not one this version of the app can save.')
    const base = options.replaceAudit ? checkedLog(options.replaceAudit) : this.log
    const added = entriesAfter(base.at(-1) ?? null, drafts)
    const log = [...base, ...added]
    const state: PlanState = { ...structuredClone(next), auditHead: headOf(log) }
    this.log = log
    this.state = state
    return added.map((e) => structuredClone(e))
  }

  async commit(
    next: PlanState,
    audit: readonly AuditDraft[],
    options: CommitOptions = {},
  ): Promise<readonly AuditEntry[]> {
    return this.write(() => this.commitNow(next, audit, options))
  }

  async replaceAudit(entries: readonly AuditEntry[]): Promise<void> {
    await this.write(() => {
      this.commitNow(this.state, [], { replaceAudit: entries })
    })
  }

  async lockVersion(workingId: string, as: LockAs, by: Actor): Promise<LockedVersion> {
    return this.write(() => {
      const deps = this.options.deps
      const done = lockInto(this.state, workingId, as, by, this.now(), {
        computeLock: deps?.computeLock ?? refuse,
        newVersionId: deps?.newVersionId,
      })
      this.commitNow(done.state, [done.audit])
      return structuredClone(done.locked)
    })
  }

  async appendAudit(e: AuditDraft): Promise<AuditEntry> {
    return this.write(() => this.commitNow(this.state, [e])[0])
  }

  async listAudit(filter?: AuditFilter): Promise<readonly AuditEntry[]> {
    return filterAudit(this.log, filter).map((e) => structuredClone(e))
  }
}
