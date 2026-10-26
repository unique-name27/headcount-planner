/**
 * Mark handled and Snooze (the template app's marks v2), kept in this browser (`hcp:actions`,
 * docs/PLAN.md 5.4). Marks are personal: one browser, one person, with an optional name typed once
 * ("Kept as Priya in this browser"), and an optional marks file so a team can pass a handled list
 * along. Not security, and never in the settings file.
 *
 *  - **Keys.** A mark is kept by item id ('<view>:<kind>:<record id>', `markKeyOf`). HCP's ids carry
 *    request, position and req IDs only, never a person's name or an amount.
 *  - **Fingerprints.** A roll-up sets `fingerprint` (a count and its members); the mark keeps the
 *    fingerprint it was made on, and a handled or snoozed roll-up whose fingerprint changed is open
 *    again ("changed since it was handled").
 *  - **Approval items** close by request state: they are `snoozeOnly` (docs/PLAN.md 9.6), so the page
 *    offers Snooze only and `withHandled` leaves them as they are; a handled mark on one (from an
 *    older file) is read as open, so a browser mark never hides a decision that is still needed.
 *  - **Version 1** values (no fingerprints) are read and rewritten as v2.
 *
 * Pure apart from the storage passed in; every read and write is wrapped, so a blocked or full
 * store only means marks last for this visit.
 */
import { APP_NAME } from '@/app/brand'
import { addDays } from '@/lib/dates'

export const STORAGE_KEY = 'hcp:actions'
const VERSION = 2
/** Marks older than this are dropped when read back, so the store never grows without end. */
const KEEP_DAYS = 365
const MAX_MARKS = 5000
/** The longest "by" name kept. */
const MAX_NAME = 60

interface MarkBase {
  at: string
  /** The item's fingerprint when it was marked: another fingerprint means the item changed. */
  fingerprint?: string
  /** The name typed in this browser, if any. */
  by?: string
}

export type Mark = (MarkBase & { state: 'handled' }) | (MarkBase & { state: 'snoozed'; until: string })

export type Marks = Readonly<Record<string, Mark>>

export type ItemStatus =
  | {
      state: 'open'
      /** The item was handled or snoozed (on this date) and has changed since, so it is open again. */
      changedSince?: string
    }
  | { state: 'handled'; at: string; by?: string }
  | { state: 'snoozed'; at: string; until: string; by?: string }

/** What a mark is about: the key it is kept under, the item's fingerprint, and whether it is Snooze only. */
export interface MarkTarget {
  markKey: string
  item: { fingerprint?: string; snoozeOnly?: true }
}

/* ───────── keys ───────── */

/** FNV-1a, 32 bits, in base 36: short, stable, and enough to tell a few thousand items apart. */
export function hashKey(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(36)
}

/** The key a mark is kept under: the item id. */
export function markKeyOf(id: string): string {
  return id
}

const keyOf = (t: MarkTarget | string): string => (typeof t === 'string' ? markKeyOf(t) : t.markKey)
const printOf = (t: MarkTarget | string): string | undefined =>
  typeof t === 'string' ? undefined : t.item.fingerprint
/** An approval item: Snooze only, never handled (docs/PLAN.md 9.6). */
const snoozeOnly = (t: MarkTarget | string): boolean => typeof t !== 'string' && !!t.item.snoozeOnly

/* ───────── status ───────── */

/**
 * What an item is now: handled, snoozed until a time still ahead, or open. A roll-up whose
 * fingerprint changed since it was marked is open again, and an approval item is never handled.
 * A plain id (no fingerprint) is judged by its mark alone.
 */
export function statusOf(target: MarkTarget | string, marks: Marks, now: number): ItemStatus {
  const m = marks[keyOf(target)]
  if (!m) return { state: 'open' }
  const print = printOf(target)
  if (print && m.fingerprint && m.fingerprint !== print) return { state: 'open', changedSince: m.at }
  if (m.state === 'handled') {
    // An approval item closes by request state only: a handled mark never hides it.
    if (snoozeOnly(target)) return { state: 'open' }
    return { state: 'handled', at: m.at, ...(m.by ? { by: m.by } : {}) }
  }
  return Date.parse(m.until) > now
    ? { state: 'snoozed', at: m.at, until: m.until, ...(m.by ? { by: m.by } : {}) }
    : { state: 'open' }
}

export const isOpen = (target: MarkTarget | string, marks: Marks, now: number): boolean =>
  statusOf(target, marks, now).state === 'open'

/** When a snooze set now ends. */
export function snoozeUntil(now: number, days: number): string {
  return new Date(now + days * 86_400_000).toISOString()
}

const cleanName = (by: string | null | undefined): string | undefined => {
  const t = by?.trim().slice(0, MAX_NAME)
  return t ? t : undefined
}

function stamp(t: MarkTarget | string, at: string, by: string | undefined): MarkBase {
  const fingerprint = printOf(t)
  return { at, ...(fingerprint ? { fingerprint } : {}), ...(by ? { by } : {}) }
}

/** Mark handled; approval items (Snooze only) are left as they are. */
export function withHandled(
  marks: Marks,
  targets: readonly (MarkTarget | string)[],
  now: number,
  by?: string | null,
): Marks {
  const at = new Date(now).toISOString()
  const name = cleanName(by)
  const out: Record<string, Mark> = { ...marks }
  for (const t of targets) if (!snoozeOnly(t)) out[keyOf(t)] = { state: 'handled', ...stamp(t, at, name) }
  return out
}

export function withSnoozed(
  marks: Marks,
  targets: readonly (MarkTarget | string)[],
  now: number,
  days: number,
  by?: string | null,
): Marks {
  const at = new Date(now).toISOString()
  const until = snoozeUntil(now, days)
  const name = cleanName(by)
  const out: Record<string, Mark> = { ...marks }
  for (const t of targets) out[keyOf(t)] = { state: 'snoozed', until, ...stamp(t, at, name) }
  return out
}

/** Open again: forget the marks. */
export function withReopened(marks: Marks, targets: readonly (MarkTarget | string)[]): Marks {
  const out: Record<string, Mark> = { ...marks }
  for (const t of targets) delete out[keyOf(t)]
  return out
}

/** The marks of these items as they are now (absent ones as null), for Undo. */
export function snapshotOf(
  marks: Marks,
  targets: readonly (MarkTarget | string)[],
): Record<string, Mark | null> {
  return Object.fromEntries(targets.map((t) => [keyOf(t), marks[keyOf(t)] ?? null]))
}

/** Put marks back as a snapshot had them. */
export function withSnapshot(marks: Marks, snap: Readonly<Record<string, Mark | null>>): Marks {
  const out: Record<string, Mark> = { ...marks }
  for (const [id, m] of Object.entries(snap)) {
    if (m) out[id] = m
    else delete out[id]
  }
  return out
}

/* ───────── storage ───────── */

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export function browserStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

const isIso = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v))

function validMark(v: unknown): Mark | null {
  const m = v as {
    state?: unknown
    at?: unknown
    until?: unknown
    fingerprint?: unknown
    by?: unknown
  } | null
  if (!m || typeof m !== 'object' || !isIso(m.at)) return null
  const extra = {
    ...(typeof m.fingerprint === 'string' && m.fingerprint
      ? { fingerprint: m.fingerprint.slice(0, 200) }
      : {}),
    ...(typeof m.by === 'string' && cleanName(m.by) ? { by: cleanName(m.by) } : {}),
  }
  if (m.state === 'handled') return { state: 'handled', at: m.at, ...extra }
  if (m.state === 'snoozed' && isIso(m.until)) return { state: 'snoozed', at: m.at, until: m.until, ...extra }
  return null
}

/** What `hcp:actions` holds: the marks and the name typed in this browser. */
export interface MarksState {
  marks: Marks
  /** "Kept as Priya": the name marks carry, or null. */
  name: string | null
}

/**
 * Marks from a saved value (version 1 or 2): broken entries are dropped, as are marks older than
 * a year and ended snoozes, newest kept when there are too many. Keys are copied as strings only
 * (never a parsed object spread), so a key named `__proto__` is just a key.
 */
export function parseState(raw: string | null, now: number): MarksState {
  const empty: MarksState = { marks: {}, name: null }
  if (!raw) return empty
  try {
    const v = JSON.parse(raw) as { version?: unknown; marks?: unknown; name?: unknown }
    if (!v || (v.version !== 1 && v.version !== VERSION) || typeof v.marks !== 'object' || v.marks === null)
      return empty
    const oldest = addDays(new Date(now).toISOString().slice(0, 10), -KEEP_DAYS)
    const kept: [string, Mark][] = []
    for (const [id, m] of Object.entries(v.marks as Record<string, unknown>)) {
      const mark = validMark(m)
      if (!mark || mark.at.slice(0, 10) < oldest) continue
      if (mark.state === 'snoozed' && Date.parse(mark.until) <= now) continue
      kept.push([markKeyOf(id), mark])
    }
    kept.sort((a, b) => b[1].at.localeCompare(a[1].at))
    const marks: Record<string, Mark> = Object.create(null)
    for (const [k, m] of kept.slice(0, MAX_MARKS)) marks[k] = m
    return {
      marks: { ...marks },
      name: typeof v.name === 'string' ? (cleanName(v.name) ?? null) : null,
    }
  } catch {
    return empty
  }
}

/** The marks alone from a saved value (version 1 or 2). */
export const parseMarks = (raw: string | null, now: number): Marks => parseState(raw, now).marks

export function serializeState(s: MarksState): string {
  return JSON.stringify({ version: VERSION, ...(s.name ? { name: s.name } : {}), marks: s.marks })
}

export const serializeMarks = (marks: Marks, name: string | null = null): string =>
  serializeState({ marks, name })

export function loadState(storage: StorageLike | null, now: number): MarksState {
  try {
    return parseState(storage?.getItem(STORAGE_KEY) ?? null, now)
  } catch {
    return { marks: {}, name: null }
  }
}

export const loadMarks = (storage: StorageLike | null, now: number): Marks => loadState(storage, now).marks

/** Save the marks (and the name); false when the browser refused (they then last for this visit). */
export function saveMarks(marks: Marks, storage: StorageLike | null, name: string | null = null): boolean {
  try {
    if (!storage) return false
    if (Object.keys(marks).length === 0 && !name) storage.removeItem(STORAGE_KEY)
    else storage.setItem(STORAGE_KEY, serializeState({ marks, name }))
    return true
  } catch {
    return false
  }
}

/* ───────── the marks file (the handled and snoozed list) ───────── */

const FILE_KIND = 'headcount-planner-marks'

/** Why a file could not be read as a marks file. */
const NOT_A_MARKS_FILE = `The file is not a ${APP_NAME} marks file.`

/** The marks file: what this browser has marked, for a teammate to load. */
export function marksFile(s: MarksState, now: number): string {
  return JSON.stringify(
    {
      kind: FILE_KIND,
      version: VERSION,
      savedAt: new Date(now).toISOString(),
      ...(s.name ? { by: s.name } : {}),
      marks: s.marks,
    },
    null,
    2,
  )
}

export type MarksFileResult = { ok: true; marks: Marks; count: number } | { ok: false; reason: string }

/** Marks from a marks file, or why it could not be read. */
export function readMarksFile(text: string, now: number): MarksFileResult {
  let v: { kind?: unknown; version?: unknown; marks?: unknown }
  try {
    v = JSON.parse(text)
  } catch {
    return { ok: false, reason: NOT_A_MARKS_FILE }
  }
  if (!v || v.kind !== FILE_KIND) return { ok: false, reason: NOT_A_MARKS_FILE }
  const marks = parseMarks(JSON.stringify({ version: v.version, marks: v.marks }), now)
  return { ok: true, marks, count: Object.keys(marks).length }
}

/** Marks from a file laid over this browser's: per item, the later mark wins. */
export function mergeMarks(mine: Marks, theirs: Marks): Marks {
  const out: Record<string, Mark> = { ...mine }
  for (const [k, m] of Object.entries(theirs)) {
    const have = out[k]
    if (!have || m.at > have.at) out[k] = m
  }
  return out
}

/**
 * The marks of the items a mode lists (`listedMarkKeys`), for a marks file saved in that mode: one
 * browser keeps every mode's marks, and a file passed to a teammate carries only what the mode it is
 * saved in shows (the M2 review, RM-4).
 */
export function marksWithin(marks: Marks, keys: ReadonlySet<string>): Marks {
  const out: Record<string, Mark> = {}
  for (const [k, m] of Object.entries(marks)) if (keys.has(k)) out[k] = m
  return out
}

/** A loaded file laid over this browser's marks for the items the mode lists only; every other mark stays. */
export const mergeMarksWithin = (mine: Marks, theirs: Marks, keys: ReadonlySet<string>): Marks =>
  mergeMarks(mine, marksWithin(theirs, keys))
