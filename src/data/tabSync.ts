/**
 * Keeps the open Headcount Planner tabs in this browser in step, and lets only one of them write
 * (docs/PLAN.md 5.4).
 *
 * - Settings: the browser's `storage` event fires in every other tab when `hcp:settings` changes;
 *   the listener re-reads it.
 * - Datasets, plan state and "clear everything": a BroadcastChannel message on the app's channel
 *   (TAB_CHANNEL) after the write has finished. Receivers re-read IndexedDB rather than trust the
 *   message, so two tabs end on the same stored state.
 * - The write lock: one tab holds the Web Lock WRITER_LOCK for its whole life and is the writer;
 *   every other tab is a reader ("Read only: Headcount Planner is open in another tab."), refuses
 *   every PlanStore write and `replaceDataset`, and becomes the writer when the writer tab closes.
 *
 * Messaging does nothing where there is no window (tests, workers). Nothing leaves the browser.
 */
import { TAB_CHANNEL, WRITER_LOCK } from '@/app/brand'
import { DATASET_KEYS, type DatasetKey } from './schema'

/* ───────────── messages ───────────── */

/**
 * What changed in another tab, posted after the write finished:
 * - `datasets`: these datasets were replaced, reset or certified (IndexedDB `hcp:dataset:<k>` and
 *   `hcp:versions:<k>`);
 * - `plan`: plan state or the audit log was saved (`hcp:plan`, `hcp:audit:<chunk>`);
 * - `cleared`: everything Headcount Planner keeps in this browser was cleared.
 */
export type TabMessage =
  | { kind: 'datasets'; keys: readonly DatasetKey[] }
  | { kind: 'plan' }
  | { kind: 'cleared' }

export interface TabHandlers {
  /** `hcp:settings` changed (or was removed) in another tab. */
  settings: () => void
  message: (m: TabMessage) => void
}

/** A well-formed TabMessage: anything else on the channel (another version of the app, the lock's own traffic) is ignored. */
export function isTabMessage(v: unknown): v is TabMessage {
  if (typeof v !== 'object' || v === null) return false
  const m = v as { kind?: unknown; keys?: unknown }
  if (m.kind === 'plan' || m.kind === 'cleared') return true
  return (
    m.kind === 'datasets' &&
    Array.isArray(m.keys) &&
    m.keys.every((k) => (DATASET_KEYS as readonly unknown[]).includes(k))
  )
}

let channel: BroadcastChannel | null = null
let started = false

function openChannel(): BroadcastChannel | null {
  if (channel) return channel
  try {
    channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(TAB_CHANNEL)
  } catch {
    channel = null
  }
  return channel
}

/** Tell the other open tabs. Never throws. */
export function postToTabs(m: TabMessage): void {
  if (typeof window === 'undefined') return
  try {
    openChannel()?.postMessage(m)
  } catch {
    /* another tab will see the change on its next load */
  }
}

/** Start listening once per page; later calls do nothing. Never throws. */
export function listenToTabs(settingsKey: string, h: TabHandlers): void {
  if (started || typeof window === 'undefined') return
  started = true
  window.addEventListener('storage', (e) => {
    // A null key means another tab cleared all of localStorage.
    if (e.key === settingsKey || e.key === null) h.settings()
  })
  // addEventListener, not onmessage, so the write lock's fallback can share the channel.
  openChannel()?.addEventListener('message', (e: MessageEvent) => {
    if (isTabMessage(e.data)) h.message(e.data)
  })
}

/**
 * One more listener for other tabs' messages, besides the page's `listenToTabs` handler: the plan
 * store re-reads `hcp:plan` on `{ kind: 'plan' }` this way. Returns the unsubscribe function. Does
 * nothing where there is no window. Never throws.
 */
export function addTabListener(fn: (m: TabMessage) => void): () => void {
  if (typeof window === 'undefined') return () => undefined
  const ch = openChannel()
  if (!ch) return () => undefined
  const listener = (e: MessageEvent) => {
    if (isTabMessage(e.data)) fn(e.data)
  }
  try {
    ch.addEventListener('message', listener)
  } catch {
    return () => undefined
  }
  return () => ch.removeEventListener('message', listener)
}

/* ───────────── the write lock ───────────── */

/** Whether this tab may write. */
export type WriterRole = 'writer' | 'reader'

/**
 * The part of the Web Locks API the write lock uses. `navigator.locks` fits it; tests inject a stub.
 * The writer requests WRITER_LOCK with `{ ifAvailable: true }` and holds it by returning a promise
 * that never settles while the page lives; a reader queues a plain (blocking) request, which the
 * browser grants when the writer tab closes.
 */
export interface LockApi {
  request(
    name: string,
    options: { ifAvailable?: boolean },
    callback: (lock: object | null) => unknown,
  ): Promise<unknown>
}

/**
 * The part of BroadcastChannel the fallback uses where there are no Web Locks: the writer posts a
 * heartbeat on TAB_CHANNEL, and a reader takes over when the heartbeats stop. Tests inject linked
 * fakes. Its messages are never TabMessages, so `listenToTabs` ignores them.
 */
export interface ChannelLike {
  postMessage(message: unknown): void
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void
  removeEventListener(type: 'message', listener: (event: { data: unknown }) => void): void
}

/** The fallback's clock and timers, injectable for tests. */
export interface TimerApi {
  now(): number
  setTimeout(fn: () => void, ms: number): unknown
  clearTimeout(handle: unknown): void
}

/**
 * What the write lock runs on. The defaults read `navigator.locks` (null where missing), a
 * BroadcastChannel on TAB_CHANNEL (null where missing) and the real clock and timers.
 */
export interface WriterLockDeps {
  /** Web Locks, or null to use the heartbeat fallback. */
  locks: LockApi | null
  /** The fallback's channel; with neither locks nor a channel, the tab is the writer (nothing to coordinate with). */
  channel: ChannelLike | null
  timers: TimerApi
}

/**
 * The real dependencies: `navigator.locks`, the app's BroadcastChannel and the real timers. Locks
 * are null where the browser has none, and the channel is null where there is no window (Node, in
 * tests: inject a fake instead). Assigning them here also checks at compile time that the browser's
 * own APIs fit `LockApi` and `ChannelLike`.
 */
export function defaultWriterDeps(): WriterLockDeps {
  const locks: LockApi | null = (typeof navigator === 'undefined' ? null : navigator.locks) ?? null
  const ch: ChannelLike | null = typeof window === 'undefined' ? null : openChannel()
  return {
    locks,
    channel: ch,
    timers: {
      now: () => Date.now(),
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: (handle) => clearTimeout(handle as Parameters<typeof clearTimeout>[0]),
    },
  }
}

export interface AcquireOptions {
  /** Called once when this tab started as a reader and has now become the writer (the writer tab closed). */
  onPromote?: () => void
  /** Injected for tests; anything left out takes its default. */
  deps?: Partial<WriterLockDeps>
}

/** How often the writer says it is still there, where there are no Web Locks. */
export const HEARTBEAT_MS = 1_000
/** A reader starts a takeover after this long without hearing the writer (several missed heartbeats). */
export const TAKEOVER_MS = 4_000
/** How long a tab that wants to write waits for an answer (a writer, or an earlier claim) before it writes. */
export const ELECTION_MS = 300

/**
 * The heartbeat fallback's messages on TAB_CHANNEL: a tab that wants to write `claim`s, the writer
 * answers every claim with a `beat` and sends one every HEARTBEAT_MS, and says `bye` when it goes.
 * They carry no `kind`, so `isTabMessage` (and `listenToTabs`) ignore them.
 */
export interface LockSignal {
  writerLock: 'claim' | 'beat' | 'bye'
  /** The sending tab's id; ties between two claims go to the lower id. */
  tab: string
}

export function isLockSignal(v: unknown): v is LockSignal {
  if (typeof v !== 'object' || v === null) return false
  const m = v as { writerLock?: unknown; tab?: unknown }
  return (
    (m.writerLock === 'claim' || m.writerLock === 'beat' || m.writerLock === 'bye') &&
    typeof m.tab === 'string'
  )
}

/**
 * How a tab settled its role: the Web Lock, the heartbeat on the channel, or `alone` where there is
 * neither (nothing to coordinate with, so the tab writes).
 */
export type LockPath = 'web-locks' | 'heartbeat' | 'alone'

let tabSeq = 0
/** An id for this tab: random where the browser offers it, else the clock and a counter. */
function newTabId(now: number): string {
  tabSeq++
  try {
    const c = globalThis.crypto
    if (c?.getRandomValues) {
      const a = c.getRandomValues(new Uint32Array(2))
      return `${a[0].toString(36)}${a[1].toString(36)}-${tabSeq.toString(36)}`
    }
  } catch {
    /* no crypto: the clock will do */
  }
  return `${Math.floor(now).toString(36)}-${tabSeq.toString(36)}`
}

/**
 * The write lock of one tab (the page uses one through `acquireWriter`; tests make several, one per
 * fake tab). With Web Locks, the writer holds WRITER_LOCK until `release()` or the page closes, and
 * a reader queues a blocking request that the browser grants when the writer goes. Without them, a
 * heartbeat on the channel elects the writer: a tab claims, waits ELECTION_MS, and writes unless a
 * writer answered or a lower id claimed too; a reader takes over after TAKEOVER_MS of silence (it
 * claims first, so a writer whose timers the browser slowed still keeps the lock by answering) or
 * as soon as the writer says `bye`.
 */
export class WriterLock {
  readonly tabId: string
  /** null until the first acquisition settles, then this tab's role. */
  role: WriterRole | null = null
  /** How the role was settled; null until it is. */
  path: LockPath | null = null
  private readonly deps: WriterLockDeps
  private pending: Promise<WriterRole> | null = null
  private resolveFirst: ((r: WriterRole) => void) | null = null
  private readonly promoteFns = new Set<() => void>()
  private readonly changeFns = new Set<(r: WriterRole) => void>()
  private released = false
  /** Ends the hold on the Web Lock (the callback's promise settles, so the browser releases it). */
  private unhold: (() => void) | null = null
  /** Cancels a reader's queued request. */
  private abortQueue: (() => void) | null = null
  /* heartbeat fallback */
  private mode: 'electing' | 'writer' | 'reader' | 'off' = 'off'
  private outvoted = false
  private timer: unknown = null
  private channel: ChannelLike | null = null

  constructor(deps: WriterLockDeps, options: { tabId?: string } = {}) {
    this.deps = deps
    this.tabId = options.tabId ?? newTabId(deps.timers.now())
  }

  /**
   * This tab's role: the first call starts the acquisition and later calls share it (a role already
   * settled resolves at once, a promotion included). `onPromote` runs once this tab, a reader, becomes
   * the writer. Never rejects.
   */
  acquire(onPromote?: () => void): Promise<WriterRole> {
    if (onPromote) this.promoteFns.add(onPromote)
    if (this.role !== null && !this.released) return Promise.resolve(this.role)
    if (!this.pending) {
      this.pending = new Promise<WriterRole>((resolve) => {
        this.resolveFirst = resolve
      })
      if (this.released) this.settle('reader', 'alone')
      else this.begin()
    }
    return this.pending
  }

  /** Run `fn` with every later change of role (a promotion, or a heartbeat writer stepping aside). */
  onChange(fn: (r: WriterRole) => void): () => void {
    this.changeFns.add(fn)
    return () => this.changeFns.delete(fn)
  }

  /**
   * Give the lock up: end the hold, cancel a queued takeover, stop the heartbeat (saying `bye`, so a
   * reader takes over at once). An acquisition still pending resolves 'reader'. Safe to call twice.
   */
  release(): void {
    if (this.released) return
    this.released = true
    this.unhold?.()
    this.unhold = null
    this.abortQueue?.()
    this.abortQueue = null
    this.stopHeartbeat()
    if (this.resolveFirst) this.settle('reader', this.path ?? 'alone')
  }

  /**
   * The page is going into the back-forward cache: a heartbeat writer says `bye` and waits as a
   * reader, since its timers stop and it could not answer claims. Web Locks need nothing (the
   * browser keeps a page that holds a lock out of that cache).
   */
  stepAside(): void {
    if (this.released || this.path !== 'heartbeat' || this.mode !== 'writer') return
    this.post('bye')
    this.mode = 'reader'
    this.settle('reader', 'heartbeat')
    this.watch()
  }

  /* ───────── settling ───────── */

  /** The first settle resolves the acquisition; later ones are changes of role. */
  private settle(role: WriterRole, path: LockPath): void {
    if (this.resolveFirst) {
      this.role = role
      this.path = path
      const resolve = this.resolveFirst
      this.resolveFirst = null
      resolve(role)
      return
    }
    if (this.role === role || this.released) return
    const was = this.role
    this.role = role
    const run = (fn: () => void) => {
      try {
        fn()
      } catch {
        /* one listener's failure never stops the others */
      }
    }
    if (was === 'reader' && role === 'writer') for (const fn of this.promoteFns) run(fn)
    for (const fn of this.changeFns) run(() => fn(role))
  }

  private begin(): void {
    const { locks } = this.deps
    if (locks && this.tryLocks(locks)) return
    this.withoutLocks()
  }

  private withoutLocks(): void {
    if (this.released) return
    if (this.deps.channel) this.startHeartbeat(this.deps.channel)
    else this.settle('writer', 'alone')
  }

  /* ───────── Web Locks ───────── */

  /** False when the request cannot even be made (the caller falls back at once). */
  private tryLocks(locks: LockApi): boolean {
    let req: Promise<unknown>
    try {
      req = locks.request(WRITER_LOCK, { ifAvailable: true }, (lock) => {
        if (this.released) return undefined
        if (lock) {
          this.settle('writer', 'web-locks')
          return this.hold()
        }
        this.settle('reader', 'web-locks')
        this.queue(locks)
        return undefined
      })
    } catch {
      return false
    }
    // Refused before it was answered (a page the browser gives no locks): use the fallback.
    req.then(undefined, () => {
      if (this.resolveFirst) this.withoutLocks()
    })
    return true
  }

  /** A promise that settles on `release()`: returning it from the callback holds the lock until then. */
  private hold(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.unhold = resolve
    })
  }

  /** A reader's blocking request: granted when the writer tab closes (or releases). */
  private queue(locks: LockApi): void {
    const ctrl = typeof AbortController === 'undefined' ? null : new AbortController()
    this.abortQueue = () => ctrl?.abort()
    // The browser's own request takes a signal; LockApi names only what every caller passes.
    const options: { ifAvailable?: boolean; signal?: AbortSignal } = ctrl ? { signal: ctrl.signal } : {}
    let req: Promise<unknown>
    try {
      req = locks.request(WRITER_LOCK, options, (lock) => {
        if (this.released || !lock) return undefined
        this.abortQueue = null
        this.settle('writer', 'web-locks')
        return this.hold()
      })
    } catch {
      return // stays a reader
    }
    // Aborted by release(), or refused: this tab stays a reader.
    req.then(undefined, () => undefined)
  }

  /* ───────── heartbeat fallback ───────── */

  private readonly onSignal = (e: { data: unknown }): void => {
    const m = e.data
    if (this.released || !isLockSignal(m) || m.tab === this.tabId) return
    switch (this.mode) {
      case 'writer':
        if (m.writerLock === 'claim') this.post('beat')
        else if (m.writerLock === 'beat' && m.tab < this.tabId) {
          // Two writers (messages that arrived too late for an election): the lower id keeps it.
          this.mode = 'reader'
          this.settle('reader', 'heartbeat')
          this.watch()
        }
        return
      case 'electing':
        if (m.writerLock === 'beat' || (m.writerLock === 'claim' && m.tab < this.tabId)) this.outvoted = true
        return
      case 'reader':
        if (m.writerLock === 'beat') this.watch()
        else if (m.writerLock === 'bye') this.elect()
        return
      case 'off':
        return
    }
  }

  private startHeartbeat(ch: ChannelLike): void {
    this.channel = ch
    ch.addEventListener('message', this.onSignal)
    this.elect()
  }

  private elect(): void {
    this.mode = 'electing'
    this.outvoted = false
    this.post('claim')
    this.setTimer(ELECTION_MS, () => this.closeElection())
  }

  private closeElection(): void {
    if (this.mode !== 'electing' || this.released) return
    if (this.outvoted) {
      this.mode = 'reader'
      this.settle('reader', 'heartbeat')
      this.watch()
      return
    }
    this.mode = 'writer'
    this.settle('writer', 'heartbeat')
    this.post('beat')
    this.beatLater()
  }

  /** A reader's takeover, unless a heartbeat comes first. */
  private watch(): void {
    this.setTimer(TAKEOVER_MS, () => this.elect())
  }

  private beatLater(): void {
    this.setTimer(HEARTBEAT_MS, () => {
      if (this.mode !== 'writer') return
      this.post('beat')
      this.beatLater()
    })
  }

  private setTimer(ms: number, fn: () => void): void {
    const t = this.deps.timers
    if (this.timer != null) t.clearTimeout(this.timer)
    this.timer = t.setTimeout(() => {
      this.timer = null
      if (!this.released) fn()
    }, ms)
  }

  private post(kind: LockSignal['writerLock']): void {
    try {
      this.channel?.postMessage({ writerLock: kind, tab: this.tabId } satisfies LockSignal)
    } catch {
      /* the channel closed: the other tabs time out instead */
    }
  }

  private stopHeartbeat(): void {
    if (this.timer != null) this.deps.timers.clearTimeout(this.timer)
    this.timer = null
    if (this.mode === 'writer') this.post('bye')
    this.mode = 'off'
    this.channel?.removeEventListener('message', this.onSignal)
    this.channel = null
  }
}

/* ───────────── the page's lock ───────────── */

let page: WriterLock | null = null
const pageListeners = new Set<(r: WriterRole) => void>()
let pageEvents = false

/** Listen once for the page going into, and out of, the back-forward cache. */
function watchPageLife(): void {
  if (pageEvents || typeof window === 'undefined') return
  pageEvents = true
  try {
    window.addEventListener('pagehide', (e) => {
      if ((e as PageTransitionEvent).persisted) page?.stepAside()
      else page?.release()
    })
  } catch {
    /* no page events */
  }
}

/**
 * Takes the write lock if no other tab holds it: 'writer' when this tab got it, else 'reader' (and
 * `onPromote` runs if it gets it later). Holds the lock for the page's life, or until
 * `releaseWriter()`. Never rejects: storage that cannot be coordinated resolves 'writer'.
 *
 * One lock per page: the first call starts it (with `deps` filled from `defaultWriterDeps()`), and
 * later calls share it, adding their `onPromote` (their `deps` are ignored until `releaseWriter()`).
 * A role already settled resolves at once, so a call after a promotion resolves 'writer'.
 */
export function acquireWriter(options: AcquireOptions = {}): Promise<WriterRole> {
  if (!page) {
    const lock = new WriterLock({ ...defaultWriterDeps(), ...options.deps })
    lock.onChange((r) => {
      for (const fn of pageListeners) fn(r)
    })
    page = lock
    watchPageLife()
  }
  return page.acquire(options.onPromote)
}

/** Gives the write lock up (or stops the heartbeat) and cancels a queued takeover. Safe to call at any time. */
export function releaseWriter(): void {
  page?.release()
  page = null
}

/** This page's role: null before `acquireWriter()` settles (or after `releaseWriter()`). */
export function writerRole(): WriterRole | null {
  return page?.role ?? null
}

/**
 * Run `fn` whenever this page's role changes after it first settled: 'writer' when a reader is
 * promoted, 'reader' when a heartbeat writer steps aside. Returns the unsubscribe function.
 */
export function onWriterChange(fn: (r: WriterRole) => void): () => void {
  pageListeners.add(fn)
  return () => pageListeners.delete(fn)
}
