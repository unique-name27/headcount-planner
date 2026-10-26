/**
 * Fakes for testing the write lock (src/data/tabSync.ts) across several tabs in one test: a shared
 * Web Locks manager, a BroadcastChannel bus and a manual clock. Each "tab" gets its own view of
 * them, so a test opens two or three tabs, closes one, and checks who writes.
 *
 *   const tabs = fakeTabs()
 *   const a = tabs.open('a')            // { locks, channel, timers, close() }
 *   const lock = new WriterLock({ locks: a.locks, channel: null, timers: a.timers })
 *
 * Nothing here touches the real browser APIs or timers. Messages and lock grants are delivered as
 * microtasks, as the browser does, so tests `await tabs.settle()` (or `tabs.advance(ms)`, which
 * settles too) before they look.
 */
import type { ChannelLike, LockApi, TimerApi } from '@/data/tabSync'

/* ───────────── clock ───────────── */

interface Timer {
  id: number
  at: number
  fn: () => void
  owner: string
}

/** A manual clock shared by every tab: timers run only when the test advances it. */
export class FakeClock {
  now = 0
  private seq = 0
  private timers: Timer[] = []

  /** The timer API for one tab; `owner` lets a closed tab's timers be dropped. */
  api(owner: string): TimerApi {
    return {
      now: () => this.now,
      setTimeout: (fn, ms) => {
        const t: Timer = { id: ++this.seq, at: this.now + Math.max(0, ms), fn, owner }
        this.timers.push(t)
        return t.id
      },
      clearTimeout: (handle) => {
        this.timers = this.timers.filter((t) => t.id !== handle)
      },
    }
  }

  /** Drop every timer a tab set (the tab closed). */
  dropOwner(owner: string): void {
    this.timers = this.timers.filter((t) => t.owner !== owner)
  }

  /** Timers still waiting, for assertions. */
  pending(owner?: string): number {
    return this.timers.filter((t) => owner == null || t.owner === owner).length
  }

  /** Run the earliest timer due at or before `until`; false when none is. */
  runNext(until: number): boolean {
    let next: Timer | null = null
    for (const t of this.timers)
      if (t.at <= until && (!next || t.at < next.at || (t.at === next.at && t.id < next.id))) next = t
    if (!next) return false
    this.timers = this.timers.filter((t) => t !== next)
    this.now = Math.max(this.now, next.at)
    next.fn()
    return true
  }
}

/* ───────────── Web Locks ───────────── */

interface Waiting {
  tab: string
  callback: (lock: object | null) => unknown
  resolve: (v: unknown) => void
  reject: (e: unknown) => void
}

/**
 * One lock manager for every tab, with the browser's rules for one lock name at a time: a request
 * is granted when nobody holds the lock, `ifAvailable` gets `null` instead of waiting, a grant is
 * held until the callback's promise settles, and the waiting queue is first come, first served.
 * Closing a tab releases what it holds and drops what it waits for. A request whose `signal` is
 * aborted while it waits rejects with an AbortError.
 */
export class FakeLockManager {
  private held = new Map<string, { tab: string; release: () => void }>()
  private queues = new Map<string, Waiting[]>()
  private closed = new Set<string>()
  /** Every request made, for assertions: tab, name and whether it asked `ifAvailable`. */
  readonly requests: { tab: string; name: string; ifAvailable: boolean }[] = []

  /** The tab that holds `name`, or null. */
  holder(name: string): string | null {
    return this.held.get(name)?.tab ?? null
  }

  /** Tabs waiting for `name`, in order. */
  waiting(name: string): string[] {
    return (this.queues.get(name) ?? []).map((w) => w.tab)
  }

  /** The LockApi a tab sees. */
  api(tab: string): LockApi {
    return {
      request: (name, options, callback) => {
        const opts = options as { ifAvailable?: boolean; signal?: AbortSignal }
        this.requests.push({ tab, name, ifAvailable: !!opts.ifAvailable })
        return new Promise((resolve, reject) => {
          if (this.closed.has(tab)) {
            reject(new Error('The tab is closed.'))
            return
          }
          const w: Waiting = { tab, callback, resolve, reject }
          if (!this.held.has(name) && !(this.queues.get(name) ?? []).length) {
            this.grant(name, w)
            return
          }
          if (opts.ifAvailable) {
            queueMicrotask(() => {
              try {
                resolve(callback(null))
              } catch (e) {
                reject(e)
              }
            })
            return
          }
          if (opts.signal?.aborted) {
            reject(new DOMException('The request was aborted.', 'AbortError'))
            return
          }
          const q = this.queues.get(name) ?? []
          q.push(w)
          this.queues.set(name, q)
          opts.signal?.addEventListener('abort', () => {
            const cur = this.queues.get(name) ?? []
            if (!cur.includes(w)) return
            this.queues.set(
              name,
              cur.filter((x) => x !== w),
            )
            reject(new DOMException('The request was aborted.', 'AbortError'))
          })
        })
      },
    }
  }

  private grant(name: string, w: Waiting): void {
    let released = false
    const release = () => {
      if (released) return
      released = true
      if (this.held.get(name)?.release === release) this.held.delete(name)
      this.next(name)
    }
    this.held.set(name, { tab: w.tab, release })
    queueMicrotask(() => {
      let out: unknown
      try {
        out = w.callback({ name })
      } catch (e) {
        release()
        w.reject(e)
        return
      }
      Promise.resolve(out).then(
        (v) => {
          release()
          w.resolve(v)
        },
        (e) => {
          release()
          w.reject(e)
        },
      )
    })
  }

  private next(name: string): void {
    const q = this.queues.get(name) ?? []
    const w = q.shift()
    this.queues.set(name, q)
    if (w) this.grant(name, w)
  }

  /** The tab closed: its locks go to the next in line, and its waiting requests are dropped. */
  close(tab: string): void {
    this.closed.add(tab)
    for (const [name, q] of this.queues)
      this.queues.set(
        name,
        q.filter((w) => w.tab !== tab),
      )
    for (const h of [...this.held.values()]) if (h.tab === tab) h.release()
  }
}

/* ───────────── BroadcastChannel ───────────── */

type Listener = (event: { data: unknown }) => void

/**
 * Every tab's channel on one bus. A message reaches every other open tab (never the sender), as a
 * microtask after the post, structured-cloned like the browser does.
 */
export class FakeChannelBus {
  private channels = new Map<string, Set<Listener>>()
  /** Every message posted, oldest first, for assertions. */
  readonly log: { from: string; data: unknown }[] = []

  channel(tab: string): ChannelLike {
    const listeners = new Set<Listener>()
    this.channels.set(tab, listeners)
    return {
      postMessage: (message) => {
        if (!this.channels.has(tab)) return
        const data = structuredClone(message)
        this.log.push({ from: tab, data })
        for (const [other, ls] of this.channels) {
          if (other === tab) continue
          for (const l of [...ls])
            queueMicrotask(() => {
              if (this.channels.get(other)?.has(l)) l({ data: structuredClone(data) })
            })
        }
      },
      addEventListener: (_type, l) => {
        listeners.add(l)
      },
      removeEventListener: (_type, l) => {
        listeners.delete(l)
      },
    }
  }

  close(tab: string): void {
    this.channels.delete(tab)
  }
}

/* ───────────── tabs ───────────── */

export interface FakeTab {
  id: string
  locks: LockApi
  channel: ChannelLike
  timers: TimerApi
  /** Close the tab: locks released, channel and timers gone (nothing runs a "bye"). */
  close: () => void
}

export interface FakeTabs {
  clock: FakeClock
  locks: FakeLockManager
  bus: FakeChannelBus
  open: (id: string) => FakeTab
  /** Let every queued message and lock grant run. */
  settle: () => Promise<void>
  /** Move the clock on by `ms`, running each timer due (and settling after each). */
  advance: (ms: number) => Promise<void>
}

/** Let queued microtasks (and the microtasks they queue) run. */
export async function flushMicrotasks(rounds = 20): Promise<void> {
  for (let i = 0; i < rounds; i++) await Promise.resolve()
}

/** A fresh set of linked fakes: one clock, one lock manager, one channel bus. */
export function fakeTabs(): FakeTabs {
  const clock = new FakeClock()
  const locks = new FakeLockManager()
  const bus = new FakeChannelBus()
  const settle = () => flushMicrotasks()
  return {
    clock,
    locks,
    bus,
    settle,
    open: (id) => ({
      id,
      locks: locks.api(id),
      channel: bus.channel(id),
      timers: clock.api(id),
      close: () => {
        locks.close(id)
        bus.close(id)
        clock.dropOwner(id)
      },
    }),
    async advance(ms) {
      const until = clock.now + ms
      await settle()
      while (clock.runNext(until)) await settle()
      clock.now = until
      await settle()
    },
  }
}
