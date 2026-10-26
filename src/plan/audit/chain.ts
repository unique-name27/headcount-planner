/**
 * The audit hash chain (docs/PLAN.md 5.3 and 10.7, change C27). Append-only entries; each entry's
 * hash is `sha256()` (src/lib/sha256.ts, synchronous) over the canonical JSON (src/plan/canonical.ts)
 * of the entry without `hash`, which includes `prevHash`. `verifyChain` reports the first broken link.
 * Everything is synchronous and pure, so the Audit page and version card models compute "Chain checks
 * out (n entries)" inside `model(ctx)`, and the leak crawler reads them. This module hashes, appends
 * and verifies only; redaction for a viewer is src/access/visibility.ts `auditView` alone.
 *
 * Copy says "Each entry carries a checksum of the one before it, so damage shows." It never claims
 * more: checksums catch damage, not forgery (BANNED_HASH_WORDS, docs/PLAN.md 14.3). Built by engines
 * C in M1.
 */
import { sha256 } from '@/lib/sha256'
import { canonicalJson } from '../canonical'
import type { AuditDraft, AuditEntry } from '../types'

/** The `prevHash` of the first entry. */
export const GENESIS_HASH = 'sha256-genesis'

/** The sentence the Audit page shows beside the chain status (never more than this: damage shows, forgery does not). */
export const CHAIN_NOTE = 'Each entry carries a checksum of the one before it, so damage shows.'

/** 'sha256-<hex>' over the canonical JSON of the entry without `hash` (`prevHash` included). */
export function entryHash(entry: Omit<AuditEntry, 'hash'>): string {
  // A whole entry may be passed in: its own `hash` is never part of what it hashes.
  const { hash: _hash, ...rest } = entry as AuditEntry
  return `sha256-${sha256(canonicalJson(rest))}`
}

/** Where a chain ends: its last entry's `seq` and `hash` (`PlanState.auditHead` keeps the same pair). */
export type ChainHead = Pick<AuditEntry, 'seq' | 'hash'>

/**
 * The next entry: seq = previous seq + 1 (1 for the first), prevHash = the previous hash (GENESIS_HASH
 * first), then its hash. `prev` may be a head alone (a store whose stored head is ahead of its log
 * continues from the head, so a lost tail stays a visible break, IN-10).
 */
export function appendEntry(prev: ChainHead | null, draft: AuditDraft): AuditEntry {
  const body: Omit<AuditEntry, 'hash'> = {
    seq: prev ? prev.seq + 1 : 1,
    at: draft.at,
    by: draft.by,
    byName: draft.byName,
    mode: draft.mode,
    object: draft.object,
    id: draft.id,
    field: draft.field,
    old: draft.old,
    new: draft.new,
    effectiveDate: draft.effectiveDate,
    comment: draft.comment,
    commentAudience: draft.commentAudience,
    prevHash: prev ? prev.hash : GENESIS_HASH,
  }
  return { ...body, hash: entryHash(body) }
}

/** The result of checking a chain. */
export type ChainCheck =
  | { ok: true; count: number }
  /** `brokenAt`: the seq of the first entry whose hash, prevHash or seq does not follow. */
  | { ok: false; count: number; brokenAt: number }

/**
 * Checks every link in order: seq increases by 1 from 1, each prevHash is the previous hash
 * (GENESIS_HASH first) and each hash matches its entry. Test: changing any field of any entry is found.
 * `brokenAt` is the position the broken entry should have (its seq when the seq itself is intact).
 * With `head` (the plan state's `auditHead`), a log that ends before the head, or whose entry at the
 * head's seq is not the head's, breaks there (IN-10: "so damage shows" covers a lost tail too).
 */
export function verifyChain(entries: readonly AuditEntry[], head?: ChainHead | null): ChainCheck {
  let prevHash = GENESIS_HASH
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]
    let intact = e.seq === i + 1 && e.prevHash === prevHash && typeof e.hash === 'string'
    if (intact) {
      try {
        intact = entryHash(e) === e.hash
      } catch {
        // An entry that cannot be written as canonical JSON (NaN, a class instance) is damaged.
        intact = false
      }
    }
    if (!intact) return { ok: false, count: entries.length, brokenAt: i + 1 }
    prevHash = e.hash
  }
  // The head the plan state keeps (`PlanState.auditHead`) must be in the log: a lost tail, or a last
  // entry that is not the one the head names, is a break at the first entry missing or changed.
  if (head) {
    const at = entries[head.seq - 1]
    if (head.seq > entries.length) return { ok: false, count: entries.length, brokenAt: entries.length + 1 }
    if (head.seq >= 1 && at?.hash !== head.hash)
      return { ok: false, count: entries.length, brokenAt: head.seq }
  }
  return { ok: true, count: entries.length }
}

/**
 * Why a Full file's audit log is not taken on Replace (C35): its chain does not verify, named by the
 * first broken link as the Audit page names it.
 */
export function fileChainBrokenText(brokenAt: number): string {
  return `This file's audit log breaks at entry ${brokenAt.toLocaleString('en-US')}. Nothing was imported.`
}

const entries = (n: number): string => `${n.toLocaleString('en-US')} ${n === 1 ? 'entry' : 'entries'}`

/** "Chain checks out (n entries)" or "The chain breaks at entry n." (HR admin only; other modes show "n entries"). */
export function chainStatusText(check: ChainCheck): string {
  return check.ok
    ? `Chain checks out (${entries(check.count)})`
    : `The chain breaks at entry ${check.brokenAt.toLocaleString('en-US')}.`
}

/** "n entries": what every mode but HR admin shows, counted over the rows the viewer can see (10.7). */
export function entryCountText(n: number): string {
  return entries(n)
}
