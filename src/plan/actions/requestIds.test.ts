/**
 * New request IDs (M3 review D-ID, IN-1 and SC-13; M3 recheck): 'R-<tag>-<n>' under the workspace's
 * tag, n a keyed hash of the workspace's secret, the Acting as person and their own count, so two
 * workspaces never mint the same ID, a person's next ID never depends on someone else's request, and
 * no ID tells who raised it.
 */
import { describe, expect, it } from 'vitest'
import { mintIdSecret, mintIdTag } from '../store/idTag'
import {
  ID_SECRET_PATTERN,
  ID_TAG_PATTERN,
  isIdSecret,
  isIdTag,
  NO_ID_TAG,
  nextIdSecret,
  nextRequestIds,
  parseTaggedId,
  REQUEST_ID_IN_TEXT,
  REQUEST_NUMBER_MIN,
  REQUEST_NUMBERS,
  requestIdInText,
  requestNumber,
  taggedRequestId,
} from './requestIds'

const SECRET = '0123456789abcdef0123456789abcdef'

describe('the workspace tag and secret', () => {
  it('is four Crockford base32 characters, never the reserved one', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 200; i++) {
      const t = mintIdTag()
      expect(t).toMatch(ID_TAG_PATTERN)
      expect(t).not.toBe(NO_ID_TAG)
      seen.add(t)
    }
    expect(seen.size).toBeGreaterThan(190)
    // A source that gives the reserved tag first is asked again.
    let calls = 0
    const tag = mintIdTag((b) => b.fill(calls++ === 0 ? 0 : 33))
    expect(tag).toBe('1111')
    expect(isIdTag('K7QM')).toBe(true)
    expect(isIdTag('K7QL')).toBe(false)
    expect(isIdTag('R-1035')).toBe(false)
  })

  it('mints a secret of 32 hex characters, a new one each time', () => {
    const a = mintIdSecret()
    expect(a).toMatch(ID_SECRET_PATTERN)
    expect(isIdSecret(a)).toBe(true)
    expect(mintIdSecret()).not.toBe(a)
    expect(mintIdSecret((b) => b.fill(171))).toBe('ab'.repeat(16))
    expect(isIdSecret('K7QM')).toBe(false)
    // Replace's new secret: another one, and a secret again.
    const next = nextIdSecret(SECRET, 'file')
    expect(next).toMatch(ID_SECRET_PATTERN)
    expect(next).not.toBe(SECRET)
    expect(nextIdSecret(SECRET, 'another file')).not.toBe(next)
  })
})

describe('nextRequestIds', () => {
  it("numbers a person's IDs by their own count, under the tag, from 1000 to 24999", () => {
    const next = nextRequestIds('K7QM', SECRET, 'E10626', ['R-1035', 'R-1127'])
    expect(next()).toBe(taggedRequestId('K7QM', requestNumber(SECRET, 'E10626', 1)))
    expect(next(2)).toBe(taggedRequestId('K7QM', requestNumber(SECRET, 'E10626', 2)))
    expect(next()).toBe(next(1))
    expect(next(2)).not.toBe(next(1))
    const n = parseTaggedId(next())?.n as number
    expect(n).toBeGreaterThanOrEqual(REQUEST_NUMBER_MIN)
    expect(n).toBeLessThan(REQUEST_NUMBER_MIN + REQUEST_NUMBERS)
    expect(parseTaggedId(next())?.tag).toBe('K7QM')
  })

  it("passes over the person's own IDs in force, and any ID another request holds", () => {
    const mine = nextRequestIds('K7QM', SECRET, 'E10626', [])
    const first = mine()
    const second = mine(2)
    // With the first in force, the next is the second.
    expect(nextRequestIds('K7QM', SECRET, 'E10626', [first])()).toBe(second)
    // Another tag's or another form's IDs never count.
    expect(nextRequestIds('K7QM', SECRET, 'E10626', [first.replace('K7QM', 'ZZZZ'), 'R-9999'])()).toBe(first)
  })

  it("never depends on another person's request (SC-13)", () => {
    const a = 'E10626'
    const b = 'E11050'
    const before = nextRequestIds('K7QM', SECRET, a, [])()
    const bIds = nextRequestIds('K7QM', SECRET, b, [])
    expect(nextRequestIds('K7QM', SECRET, a, [bIds(), bIds(2), bIds(3)])()).toBe(before)
    // The pair the recheck found sharing a lane (a manager and the CEO above them): apart now.
    const m = nextRequestIds('K7QM', SECRET, 'E11730', [])()
    const ceo = nextRequestIds('K7QM', SECRET, 'E10001', [])
    expect(nextRequestIds('K7QM', SECRET, 'E11730', [ceo(), ceo(2), ceo(3), ceo(4)])()).toBe(m)
  })

  it('tells nobody without the secret who raised an ID (M3 recheck)', () => {
    // The same person's first ID under two secrets differs, so no function of the person ID alone
    // gives it; and their IDs under one secret share no lane (n mod 1,000) or other fixed part.
    const people = Array.from({ length: 300 }, (_, i) => `E${10000 + i}`)
    const other = 'fedcba9876543210fedcba9876543210'
    let same = 0
    for (const p of people)
      if (nextRequestIds('K7QM', SECRET, p, [])() === nextRequestIds('K7QM', other, p, [])()) same += 1
    expect(same).toBeLessThan(3)
    const lanes = new Set<number>()
    const ids = nextRequestIds('K7QM', SECRET, 'E10140', [])
    for (let k = 1; k <= 20; k++) lanes.add((parseTaggedId(ids(k))?.n as number) % 1000)
    expect(lanes.size).toBeGreaterThan(15)
    // Spread over the numbers: 300 people's first IDs are nearly all different.
    const firsts = new Set(people.map((p) => nextRequestIds('K7QM', SECRET, p, [])()))
    expect(firsts.size).toBeGreaterThan(290)
  })

  it('reads an ID in a notice in either form', () => {
    expect(requestIdInText('Draft R-K7QM-13716 saved.')).toBe('R-K7QM-13716')
    expect(requestIdInText('Request R-1035 approved.')).toBe('R-1035')
    expect(requestIdInText('Nothing here.')).toBeNull()
    expect(REQUEST_ID_IN_TEXT.test('P-K7QM-13716-1')).toBe(false)
  })
})
