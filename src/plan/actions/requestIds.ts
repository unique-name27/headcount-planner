/**
 * New request IDs (M3 review D-ID, findings IN-1 and SC-13; M3 recheck): 'R-<tag>-<n>', where <tag>
 * is the workspace's four-character Crockford base32 tag (`PlanState.idTag`, minted once per
 * workspace by src/plan/store/idTag.ts), so two browsers never mint the same ID and Import requests
 * never merges two different requests as one. The sample's and imported requests keep their own form
 * ('R-1035').
 *
 * <n> is a number from 1000 to 24999 taken from a keyed hash of the workspace's secret
 * (`PlanState.idSecret`, minted with the tag and never written to a Shareable or Requests file), the
 * Acting as person and k, that person's own count (1 for their first ID, the next k for each ID they
 * already hold). So:
 *  - the next ID a person gets never depends on a request someone else made in the same workspace,
 *    a hidden one included (8.4 rule 3, SC-13: Manager C's next ID is the same with and without the
 *    confidential Elimination of C's seat);
 *  - nobody who sees an ID can tell who raised it, or that two IDs share a requester, without the
 *    secret (the M3 recheck found the lane FNV-1a(person ID) % 1000 named the requester of a request
 *    a limited view shows without one, and put two people of 1,000 in one lane);
 *  - an ID in force is never minted again: a number that clashes with one (one in 24,000 a draw for
 *    each ID in force under the tag) is passed over for the person's next k, the only case where
 *    another request moves a person's next ID. Replace gives the workspace a new secret
 *    (`nextIdSecret`), so a restore from an older Full file never mints again the IDs it sent out since.
 * The numbers stay under 25,000, like the sample's and the earlier lanes' (R-1035, R-K7QM-1371): no
 * pay check reads a number that small as anyone's pay, and they read as an ID's digits, not an amount.
 * Pure.
 */
import { sha256 } from '@/lib/sha256'

/** Crockford's base32 alphabet: digits and capitals without I, L, O and U. */
export const ID_TAG_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/** A workspace tag: four characters of `ID_TAG_ALPHABET`. */
export const ID_TAG_PATTERN = /^[0-9A-HJKMNP-TV-Z]{4}$/

/** A tag the mint never gives (src/plan/store/idTag.ts), kept out so no workspace has it. */
export const NO_ID_TAG = '0000'

/** A workspace's ID secret: 32 lowercase hex characters (src/plan/store/idTag.ts `mintIdSecret`). */
export const ID_SECRET_PATTERN = /^[0-9a-f]{32}$/

/**
 * A request ID in text, either form: a tagged one ('R-K7QM-13716') or the sample's and imported
 * ones ('R-1035'). Views and tests that read the ID a notice names use it ("Draft R-K7QM-13716
 * saved.").
 */
export const REQUEST_ID_IN_TEXT = /\bR-(?:[0-9A-HJKMNP-TV-Z]{4}-)?\d+\b/

/** The request ID a notice names, or null. */
export const requestIdInText = (text: string): string | null => REQUEST_ID_IN_TEXT.exec(text)?.[0] ?? null

/** Whether a value is a workspace tag. */
export const isIdTag = (v: unknown): v is string => typeof v === 'string' && ID_TAG_PATTERN.test(v)

/** Whether a value is a workspace ID secret. */
export const isIdSecret = (v: unknown): v is string => typeof v === 'string' && ID_SECRET_PATTERN.test(v)

/** The lowest number a tagged ID takes, and how many there are (1000 to 24999). */
export const REQUEST_NUMBER_MIN = 1_000
export const REQUEST_NUMBERS = 24_000

/** The person's k-th number under a secret: the keyed hash's first 48 bits, onto 1000 to 24999. */
export function requestNumber(secret: string, personId: string, k: number): number {
  const h = sha256(`hcp-request-id\u0000${secret}\u0000${personId}\u0000${k}`)
  return REQUEST_NUMBER_MIN + (Number.parseInt(h.slice(0, 12), 16) % REQUEST_NUMBERS)
}

/** 'R-<tag>-<n>'. */
export const taggedRequestId = (tag: string, n: number): string => `R-${tag}-${n}`

/** The tag and number of a tagged ID ('R-K7QM-13716'), or null for any other form. */
export function parseTaggedId(id: string): { tag: string; n: number } | null {
  const m = /^R-([0-9A-HJKMNP-TV-Z]{4})-(\d+)$/.exec(id)
  return m ? { tag: m[1], n: Number(m[2]) } : null
}

/**
 * The person's next IDs under a tag and secret, given every request ID in force: k runs from 1, and
 * an ID already in force (the person's own earlier ones, or a clash) is passed over. `request(n)` is
 * the n-th new ID of one action (What if's Turn into requests makes several).
 */
export function nextRequestIds(
  tag: string,
  secret: string,
  personId: string,
  taken: Iterable<string>,
): (n?: number) => string {
  const used = new Set<string>(taken)
  const ids: string[] = []
  let k = 0
  return (n = 1) => {
    while (ids.length < n) {
      k += 1
      const id = taggedRequestId(tag, requestNumber(secret, personId, k))
      if (!used.has(id) && !ids.includes(id)) ids.push(id)
    }
    return ids[n - 1]
  }
}

/**
 * The secret a workspace takes when Replace brings another plan state (M3 recheck): a new one, from
 * this workspace's own and the file, so the IDs minted after a restore are not the ones minted before
 * it. Pure; 32 hex characters like a minted one.
 */
export const nextIdSecret = (secret: string, salt: string): string =>
  sha256(`hcp-id-secret\u0000${secret}\u0000${salt}`).slice(0, 32)
