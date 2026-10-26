/**
 * How a state change should reach the address and the browser history (docs/PLAN.md 9.1 and 9.2).
 * No imports from the store, so the store, navigation and the shell can all use it.
 *
 * One writer (the shell's address module) follows the store and writes the hash for the route and
 * the scope together. By default a change of view or tab pushes a history entry and a scope change
 * is coalesced (rapid changes collapse into one entry). A caller that knows better says so just
 * before it changes the state:
 *
 *   hintAddress('replace')              // e.g. correcting the address, never a new entry
 *   batchAddress('push', () => { … })   // several changes, one entry (applying a saved view)
 *
 * Hints are one-shot and synchronous: the writer reads the hint inside the same `set` call.
 */
import { HISTORY_MARK } from '@/app/brand'

/** What a state change does to the history: a new entry, the same entry, or a coalesced burst. */
export type AddressIntent = 'push' | 'replace' | 'coalesce'

let hint: AddressIntent | null = null
let batching = 0
let flush: ((intent: AddressIntent | null) => void) | null = null

/** Say how the next state change should be written. */
export function hintAddress(intent: AddressIntent): void {
  hint = intent
}

/** The hint for this change, once (the writer calls it). */
export function takeAddressHint(): AddressIntent | null {
  const h = hint
  hint = null
  return h
}

/** True while a batch runs: the writer waits for its end. */
export const addressBatching = (): boolean => batching > 0

/** Run several state changes as one address write with this intent. */
export function batchAddress<T>(intent: AddressIntent, run: () => T): T {
  batching++
  try {
    return run()
  } finally {
    batching--
    if (!batching) {
      hint = null
      flush?.(intent)
    }
  }
}

/** The writer registers how to write once a batch ends. */
export function onAddressFlush(fn: ((intent: AddressIntent | null) => void) | null): void {
  flush = fn
}

/* ───────── the quality lens, which lives in its own store ───────── */

interface LensSource {
  get: () => boolean
  set: (on: boolean) => void
}
let lens: LensSource = { get: () => false, set: () => undefined }

/** The shell connects the quality lens (its store lives with the Data room). */
export function connectLens(source: LensSource): void {
  lens = source
}
/** True while the mode keeps the lens off: links and saved views cannot turn it on. */
let lensHeldOff: () => boolean = () => false
/** The modes register this. */
export function setLensGuard(fn: (() => boolean) | null): void {
  lensHeldOff = fn ?? (() => false)
}
export const lensOn = (): boolean => !lensHeldOff() && lens.get()
export const setLensOn = (on: boolean): void => lens.set(on && !lensHeldOff())

/* ───────── history entries ───────── */

/**
 * The mark on every history entry Headcount Planner writes (`history.state[HISTORY_MARK]`): its
 * address is complete, so no scope means the defaults.
 */
export type HistoryMark = Record<typeof HISTORY_MARK, number>

export const isHistoryMark = (v: unknown): v is HistoryMark =>
  !!v && typeof v === 'object' && typeof (v as Record<string, unknown>)[HISTORY_MARK] === 'number'

/** A history state carrying the mark with this entry id. */
export const historyMark = (id: number): HistoryMark => ({ [HISTORY_MARK]: id }) as HistoryMark

/** The id of the history entry on screen, when Headcount Planner wrote it. */
export function currentEntry(): number | null {
  try {
    const s: unknown = typeof history === 'undefined' ? null : history.state
    return isHistoryMark(s) ? s[HISTORY_MARK] : null
  } catch {
    return null
  }
}
