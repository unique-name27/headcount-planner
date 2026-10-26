/**
 * A marks file carries only what its mode lists (the M2 review, RM-4). Marks are kept per browser
 * (`hcp:actions`), whatever the mode: an HRBP's snoozes sit beside a manager's. A file saved in
 * Manager mode holds only the marks of items Manager mode lists for the Acting as manager (no other
 * team's request or seat IDs, no other mode's roll-ups), and loading a file in a mode lays only that
 * mode's items over the browser's marks, leaving every other mark as it was.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Sample } from '@/data/sample'
import { MemoryStorage } from '@/testkit/memoryStorage'
import { ctxAs, leakSample, personaCtx, pinClock, unpinClock } from '@/testkit/sample'
import { VIEWS } from '@/views/registry'
import {
  actionsModel,
  listedMarkKeys,
  type Marks,
  marksFile,
  marksWithin,
  mergeMarksWithin,
  readMarksFile,
} from '.'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
vi.stubGlobal('localStorage', new MemoryStorage())

let s: Sample
const AT = '2026-09-30T12:00:00.000Z'
const UNTIL = '2026-10-07T00:00:00.000Z'
const snoozed = (keys: readonly string[]): Marks =>
  Object.fromEntries(keys.map((k) => [k, { state: 'snoozed' as const, at: AT, until: UNTIL, by: 'Rosa' }]))

beforeAll(() => {
  pinClock()
  s = leakSample()
}, 120_000)
afterAll(() => unpinClock())

describe('a marks file holds only the items its mode lists', () => {
  it("leaves out another mode's marks when saved in Manager mode", () => {
    // The Operations HRBP marks every item HRBP mode lists for the unit, roll-ups included.
    const hrbp = ctxAs('hrbp', 'E10140', { unit: 'Operations', sample: s })
    const hrbpKeys = [...listedMarkKeys(hrbp, VIEWS)]
    expect(hrbpKeys.length).toBeGreaterThan(10)
    const manager = personaCtx('manager-a', { sample: s })
    const listed = listedMarkKeys(manager, VIEWS)
    const own = [...listed].slice(0, 3)
    const marks = snoozed([...hrbpKeys, ...own])
    const file = readMarksFile(
      marksFile({ marks: marksWithin(marks, listed), name: 'Rosa' }, Date.parse(AT)),
      Date.parse(AT),
    )
    if (!file.ok) throw new Error(file.reason)
    const keys = Object.keys(file.marks)
    // Every key is one Manager A's Action center lists; the HRBP-only ones are gone.
    const items = new Set(actionsModel(manager, VIEWS).collected.items.map((a) => a.markKey))
    for (const k of keys) expect(listed.has(k), k).toBe(true)
    for (const k of keys.filter((x) => !x.startsWith('rollup:'))) expect(items.has(k), k).toBe(true)
    const foreign = hrbpKeys.filter((k) => !listed.has(k))
    expect(foreign.length).toBeGreaterThan(5)
    for (const k of foreign) expect(keys, k).not.toContain(k)
    expect(keys.some((k) => k.startsWith('rollup:hrbp'))).toBe(false)
    // The manager's own marks travel.
    for (const k of own) expect(keys).toContain(k)
  })

  it("lays a loaded file over this mode's items only, keeping every other mark as it was", () => {
    const manager = personaCtx('manager-a', { sample: s })
    const listed = listedMarkKeys(manager, VIEWS)
    const ownKey = [...listed][0]
    const mine: Marks = { 'requests:waiting:R-9999': { state: 'handled', at: AT } }
    const theirs: Marks = {
      ...snoozed([ownKey]),
      'requests:waiting:R-1035': { state: 'handled', at: '2026-10-01T00:00:00.000Z' },
      'requests:waiting:R-9999': { state: 'handled', at: '2026-10-02T00:00:00.000Z' },
    }
    const merged = mergeMarksWithin(mine, theirs, listed)
    expect(merged[ownKey]).toEqual(theirs[ownKey])
    expect(merged['requests:waiting:R-1035']).toBeUndefined()
    expect(merged['requests:waiting:R-9999']).toBe(mine['requests:waiting:R-9999'])
  })
})
