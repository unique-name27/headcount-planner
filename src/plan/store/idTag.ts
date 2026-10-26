/**
 * Minting a workspace's request ID tag and secret (M3 review D-ID, M3 recheck): the tag is four
 * Crockford base32 characters, the secret 32 hex characters (16 bytes), both from the platform's
 * random source, made once per workspace by the store when its plan state has none and kept with the
 * plan state from the first write on (src/plan/actions/requestIds.ts reads them). The only impure
 * part of request IDs; the store is plan/'s only impure folder.
 */
import { ID_TAG_ALPHABET, NO_ID_TAG } from '../actions/requestIds'

/** A fresh tag; never NO_ID_TAG. `random` gives bytes (tests pass their own). */
export function mintIdTag(random: (bytes: Uint8Array) => Uint8Array = defaultRandom): string {
  for (;;) {
    const bytes = random(new Uint8Array(4))
    let tag = ''
    for (const b of bytes) tag += ID_TAG_ALPHABET[b % ID_TAG_ALPHABET.length]
    if (tag !== NO_ID_TAG) return tag
  }
}

/** A fresh ID secret: 16 random bytes as lowercase hex. `random` gives bytes (tests pass their own). */
export function mintIdSecret(random: (bytes: Uint8Array) => Uint8Array = defaultRandom): string {
  let out = ''
  for (const b of random(new Uint8Array(16))) out += b.toString(16).padStart(2, '0')
  return out
}

function defaultRandom(bytes: Uint8Array): Uint8Array {
  const c = (globalThis as { crypto?: { getRandomValues?: (b: Uint8Array) => Uint8Array } }).crypto
  if (c?.getRandomValues) return c.getRandomValues(bytes)
  for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  return bytes
}
