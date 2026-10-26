/**
 * The PlanStore the app uses (docs/PLAN.md 5.4): plan state at `hcp:plan` and the audit log in
 * chunks of 500 at `hcp:audit:<chunk>`, through src/data/idb.ts only. It takes the write lock with
 * `acquireWriter()` (src/data/tabSync.ts); in a reader tab every write rejects with READ_ONLY_NOTE,
 * and after a write the writer posts `{ kind: 'plan' }` so readers re-read IndexedDB. Built by
 * engines C in M1, tested with `vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))` and an
 * injected lock.
 *
 * - The lock is taken once, on the first call (or `start()`); `readOnly` is false until the role is
 *   known, and every write waits for it. A reader tab becomes the writer when the writer tab closes
 *   (`acquireWriter`'s `onPromote`, or `promote()`), and its writes then go through.
 * - The role follows the lock both ways: `start()` subscribes to its changes (`onWriterChange`, or
 *   the injected `onRoleChange`), so a heartbeat writer that steps aside (the page went into the
 *   back-forward cache) or loses a tie to a lower tab id becomes a reader and refuses every write
 *   again. Each write checks the role again when its turn in the queue comes, and every change of
 *   role drops the cached chain head, so the next append reads it fresh from the last chunk.
 * - `load` always reads IndexedDB, so a reader sees the writer's latest state. A state with no
 *   request ID tag (and secret, M3 recheck) reads with the one this store minted for the page (D-ID);
 *   the first write keeps it.
 * - Audit entry n (from 1) lives in chunk floor((n − 1) ÷ 500). The head of the chain is read from the
 *   last chunk, never from a state the caller saves, so a state saved from an older read cannot fork
 *   the chain; `PlanState.auditHead` mirrors it.
 * - One write, all or nothing (M3 review IN-5): `commit` numbers, chains and hashes every entry first,
 *   then writes `hcp:plan` once with the new state, its head and a journal of the entries (one
 *   IndexedDB put: the commit point), then moves the journal into the chunks and clears it. A refused
 *   or failed commit point leaves nothing changed; a journal left by a failure after it is read as
 *   part of the log at once and moved into the chunks by the next write. Replace's log (C35) goes the
 *   same way, the journal then holding the whole new log.
 * - The stored head is checked against the log (IN-10): when `hcp:plan`'s head is ahead of the last
 *   chunk (a lost tail), the next entry chains on from the head, so the lost entries stay a break
 *   `verifyChain` reports and no seq is used twice; the head is never written back to a lower seq.
 * - Writes run one after another (`WriteQueue`).
 */
import { idbDel, idbGet, idbKeys, idbSet } from '@/data/idb'
import { acquireWriter, onWriterChange, postToTabs, type WriterRole } from '@/data/tabSync'
import type { ChainHead } from '../audit/chain'
import type { Actor, AuditDraft, AuditEntry, LockedVersion, PlanState } from '../types'
import { mintIdSecret, mintIdTag } from './idTag'
import {
  checkedLog,
  emptyPlanState,
  entriesAfter,
  filterAudit,
  headOf,
  lockInto,
  WriteQueue,
} from './memoryStore'
import {
  type AuditFilter,
  type CommitOptions,
  type LockAs,
  type PlanStore,
  type PlanStoreDeps,
  READ_ONLY_NOTE,
} from './types'

export interface BrowserStoreOptions {
  deps: PlanStoreDeps
  /** The write lock; defaults to `acquireWriter()`. Tests inject a role. */
  writer?: () => Promise<WriterRole>
  /** Called when a reader tab becomes the writer (the writer tab closed). */
  onPromote?: () => void
  /**
   * With an injected `writer`: subscribes to its later changes of role (a promotion, or a writer
   * stepping aside) and returns the unsubscribe function. Without `writer`, the store subscribes to
   * the page's lock (`onWriterChange`) itself.
   */
  onRoleChange?: (listener: (role: WriterRole) => void) => () => void
  /** Mints the workspace's request ID tag when the stored state has none (tests pass their own). */
  mintTag?: () => string
  /** Mints the workspace's request ID secret when the stored state has none (tests pass their own). */
  mintSecret?: () => string
}

/** Where plan state lives in IndexedDB (src/app/storageKeys.ts). */
export const PLAN_KEY = 'hcp:plan'
/** Audit entries a chunk holds. */
export const AUDIT_CHUNK = 500
/** The IndexedDB key of an audit chunk. */
export const auditKey = (chunk: number): string => `hcp:audit:${chunk}`
/** The chunk an entry's seq falls in. */
export const chunkOf = (seq: number): number => Math.floor((seq - 1) / AUDIT_CHUNK)

const NEWER_STATE_TEXT = 'The plan saved in this browser comes from a newer version of Headcount Planner.'

/**
 * Entries committed with a state but not yet in the chunks: appended after the chunks' last entry,
 * or (`replace`) the whole log in place of the chunks.
 */
export interface AuditJournal {
  replace: boolean
  entries: readonly AuditEntry[]
}

/** What `hcp:plan` holds: the plan state, and the journal of a commit not yet moved into the chunks. */
type StoredBlob = PlanState & { journal?: AuditJournal }

/** The chunk numbers stored, in order. */
async function chunkNumbers(): Promise<number[]> {
  const prefix = 'hcp:audit:'
  return (await idbKeys())
    .filter((k) => k.startsWith(prefix) && /^\d+$/.test(k.slice(prefix.length)))
    .map((k) => Number(k.slice(prefix.length)))
    .sort((a, b) => a - b)
}

/** Stored plan state with every list present (a state saved before a field existed reads it empty). */
function normalized(raw: unknown): PlanState {
  if (raw === undefined || raw === null) return emptyPlanState()
  const s = raw as Partial<PlanState>
  if (typeof s !== 'object' || s.v !== 1) throw new Error(NEWER_STATE_TEXT)
  const empty = emptyPlanState()
  return {
    v: 1,
    baselineId: s.baselineId ?? null,
    versions: s.versions ?? empty.versions,
    closes: s.closes ?? empty.closes,
    adjustments: s.adjustments ?? empty.adjustments,
    overlay: { ...empty.overlay, ...(s.overlay ?? {}) },
    requests: s.requests ?? empty.requests,
    cycles: s.cycles ?? empty.cycles,
    reviewed: s.reviewed ?? empty.reviewed,
    mergeBase: s.mergeBase ?? empty.mergeBase,
    auditHead: s.auditHead ?? null,
    ...(typeof s.idTag === 'string' && s.idTag ? { idTag: s.idTag } : {}),
    ...(typeof s.idSecret === 'string' && s.idSecret ? { idSecret: s.idSecret } : {}),
  }
}

/** The journal a stored blob carries, if any. */
function journalOf(raw: unknown): AuditJournal | null {
  const j = (raw as StoredBlob | undefined)?.journal
  return j && Array.isArray(j.entries) ? { replace: j.replace === true, entries: j.entries } : null
}

/** A log read from the chunks with a journal laid over it. */
function withJournal(chunks: readonly AuditEntry[], journal: AuditJournal | null): AuditEntry[] {
  if (!journal) return [...chunks]
  if (journal.replace) return [...journal.entries]
  const last = chunks.at(-1)?.seq ?? 0
  return [...chunks, ...journal.entries.filter((e) => e.seq > last)]
}

/** The later of two heads by seq; on the same seq the stored one (IN-10: a changed last entry stays a break). */
function laterHead(log: ChainHead | null, stored: ChainHead | null): ChainHead | null {
  if (!stored) return log
  if (!log) return stored
  if (stored.seq > log.seq) return stored
  if (stored.seq === log.seq && stored.hash !== log.hash) return stored
  return log
}

export class BrowserStore implements PlanStore {
  readonly options: BrowserStoreOptions
  private role: WriterRole | null = null
  private started: Promise<WriterRole> | null = null
  private readonly queue = new WriteQueue()
  /** The last entry of the chunks, once read (only this tab appends while it is the writer). */
  private last: AuditEntry | null | undefined = undefined
  /** The request ID tag minted for a state that has none, once (D-ID). */
  private minted: string | null = null
  /** The request ID secret minted for a state that has none, once (M3 recheck). */
  private mintedSecret: string | null = null

  constructor(options: BrowserStoreOptions) {
    this.options = options
  }

  get readOnly(): boolean {
    return this.role === 'reader'
  }

  /**
   * Takes the write lock once and resolves this tab's role, then follows every later change of role.
   * Every method calls it; the app may call it early.
   */
  start(): Promise<WriterRole> {
    if (!this.started) {
      const { writer, onRoleChange } = this.options
      const follow = (role: WriterRole) => (role === 'writer' ? this.promote() : this.demote())
      if (writer) onRoleChange?.(follow)
      else onWriterChange(follow)
      this.started = (writer ? writer() : acquireWriter({ onPromote: () => this.promote() })).then((role) => {
        if (this.role === null) this.role = role
        return this.role
      })
    }
    return this.started
  }

  /** This tab became the writer (the writer tab closed): writes go through from now on. */
  promote(): void {
    if (this.role === 'writer') return
    this.role = 'writer'
    this.last = undefined
    this.options.onPromote?.()
  }

  /**
   * This tab is a reader again (a heartbeat writer stepped aside, or another tab kept the lock):
   * every write refuses until it is promoted, and the chain head is read fresh after that.
   */
  demote(): void {
    if (this.role === 'reader') return
    this.role = 'reader'
    this.last = undefined
  }

  private tag(): string {
    this.minted ??= (this.options.mintTag ?? mintIdTag)()
    return this.minted
  }

  private secret(): string {
    this.mintedSecret ??= (this.options.mintSecret ?? mintIdSecret)()
    return this.mintedSecret
  }

  private async write<T>(fn: () => Promise<T>): Promise<T> {
    await this.start()
    if (this.role !== 'writer') throw new Error(READ_ONLY_NOTE)
    const out = await this.queue.run(async () => {
      // The role can change while a write waits for its turn.
      if (this.role !== 'writer') throw new Error(READ_ONLY_NOTE)
      await this.settle()
      return fn()
    })
    postToTabs({ kind: 'plan' })
    return out
  }

  private async blob(): Promise<{ state: PlanState; journal: AuditJournal | null }> {
    const raw = await idbGet<StoredBlob>(PLAN_KEY)
    return { state: normalized(raw), journal: journalOf(raw) }
  }

  private async stored(): Promise<PlanState> {
    return (await this.blob()).state
  }

  /** The chunks' last entry: read from the last chunk the first time, then kept. */
  private async lastInChunks(): Promise<AuditEntry | null> {
    if (this.last !== undefined) return this.last
    const chunks = await chunkNumbers()
    const lastChunk = chunks.at(-1)
    const entries = lastChunk === undefined ? [] : ((await idbGet<AuditEntry[]>(auditKey(lastChunk))) ?? [])
    this.last = entries.at(-1) ?? null
    return this.last
  }

  /** Every chunk's entries, in order. */
  private async chunkLog(): Promise<AuditEntry[]> {
    const entries: AuditEntry[] = []
    for (const n of await chunkNumbers()) entries.push(...((await idbGet<AuditEntry[]>(auditKey(n))) ?? []))
    return entries
  }

  /**
   * Moves a journal left in `hcp:plan` into the chunks and clears it (inside a write's turn). A
   * replace rewrites every chunk; an append adds the entries past the chunks' last seq.
   */
  private async settle(): Promise<void> {
    const raw = await idbGet<StoredBlob>(PLAN_KEY)
    const journal = journalOf(raw)
    if (!journal) return
    if (journal.replace) {
      for (const n of await chunkNumbers()) await idbDel(auditKey(n))
      const byChunk = new Map<number, AuditEntry[]>()
      for (const e of journal.entries) {
        const list = byChunk.get(chunkOf(e.seq)) ?? []
        list.push(e)
        byChunk.set(chunkOf(e.seq), list)
      }
      for (const [n, list] of byChunk) await idbSet(auditKey(n), list)
      this.last = journal.entries.at(-1) ?? null
    } else {
      const lastSeq = (await this.lastInChunks())?.seq ?? 0
      const fresh = journal.entries.filter((e) => e.seq > lastSeq)
      const byChunk = new Map<number, AuditEntry[]>()
      for (const e of fresh) {
        const list = byChunk.get(chunkOf(e.seq)) ?? []
        list.push(e)
        byChunk.set(chunkOf(e.seq), list)
      }
      for (const [n, list] of byChunk) {
        const chunk = (await idbGet<AuditEntry[]>(auditKey(n))) ?? []
        await idbSet(auditKey(n), [...chunk, ...list])
      }
      if (fresh.length) this.last = fresh.at(-1) ?? null
    }
    const { journal: _j, ...state } = raw as StoredBlob
    await idbSet(PLAN_KEY, state)
  }

  /** Where the next entry chains on: the chunks' last entry, or the stored head when it is ahead (IN-10). */
  private async head(stored: PlanState): Promise<ChainHead | null> {
    const last = await this.lastInChunks()
    return laterHead(last ? { seq: last.seq, hash: last.hash } : null, stored.auditHead)
  }

  /**
   * One commit inside a write's turn (see the module comment): builds every entry, then writes
   * `hcp:plan` once with the state, its head and the journal, then settles the journal.
   */
  private async commitNow(
    next: PlanState,
    drafts: readonly AuditDraft[],
    options: CommitOptions = {},
  ): Promise<AuditEntry[]> {
    if (next.v !== 1) throw new Error('This plan state is not one this version of the app can save.')
    const stored = await this.stored()
    const replace = options.replaceAudit ? checkedLog(options.replaceAudit) : null
    const prev = replace ? headOf(replace) : await this.head(stored)
    const added = entriesAfter(prev, drafts)
    const head = added.length ? headOf(added) : prev
    const tag = next.idTag ?? stored.idTag ?? this.tag()
    const secret = next.idSecret ?? stored.idSecret ?? this.secret()
    const blob: StoredBlob = {
      ...next,
      auditHead: head ? { seq: head.seq, hash: head.hash } : null,
      idTag: tag,
      idSecret: secret,
      ...(replace || added.length
        ? { journal: { replace: !!replace, entries: [...(replace ?? []), ...added] } }
        : {}),
    }
    // The commit point: one put. Nothing before it is stored.
    await idbSet(PLAN_KEY, blob)
    this.minted = tag
    this.mintedSecret = secret
    try {
      await this.settle()
    } catch {
      // The journal stays in hcp:plan: the log reads it at once, and the next write moves it.
      this.last = undefined
    }
    return added
  }

  async load(): Promise<PlanState> {
    await this.start()
    const s = await this.stored()
    return s.idTag && s.idSecret
      ? s
      : { ...s, idTag: s.idTag ?? this.tag(), idSecret: s.idSecret ?? this.secret() }
  }

  async save(next: PlanState): Promise<void> {
    await this.write(async () => {
      await this.commitNow(next, [])
    })
  }

  async commit(
    next: PlanState,
    audit: readonly AuditDraft[],
    options: CommitOptions = {},
  ): Promise<readonly AuditEntry[]> {
    return this.write(() => this.commitNow(next, audit, options))
  }

  async replaceAudit(entries: readonly AuditEntry[]): Promise<void> {
    await this.write(async () => {
      await this.commitNow(await this.stored(), [], { replaceAudit: entries })
    })
  }

  async lockVersion(workingId: string, as: LockAs, by: Actor): Promise<LockedVersion> {
    return this.write(async () => {
      const at = this.options.deps.now()
      const done = lockInto(await this.stored(), workingId, as, by, at, this.options.deps)
      await this.commitNow(done.state, [done.audit])
      return done.locked
    })
  }

  async appendAudit(e: AuditDraft): Promise<AuditEntry> {
    return this.write(async () => (await this.commitNow(await this.stored(), [e]))[0])
  }

  async listAudit(filter?: AuditFilter): Promise<readonly AuditEntry[]> {
    await this.start()
    const { journal } = await this.blob()
    const chunks = journal?.replace ? [] : await this.chunkLog()
    return filterAudit(withJournal(chunks, journal), filter)
  }
}
