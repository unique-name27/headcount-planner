/**
 * Marks v2 (the template app's marks.test.ts, adapted): a handled roll-up reopens when its
 * fingerprint changes; v1 values are read; broken entries are dropped; a throwing storage is
 * survived; an approval item (Snooze only) is never handled, so a browser mark never hides a decision
 * still needed (docs/PLAN.md 9.6); the "by" name and the marks file; and `hcp:actions` stays
 * described in the storage keys list.
 */
import { describe, expect, it } from 'vitest'
import { STORAGE_KEYS } from '@/app/storageKeys'
import {
  isOpen,
  loadState,
  type MarkTarget,
  markKeyOf,
  marksFile,
  mergeMarks,
  parseMarks,
  parseState,
  readMarksFile,
  STORAGE_KEY,
  type StorageLike,
  saveMarks,
  serializeState,
  statusOf,
  withHandled,
  withReopened,
  withSnoozed,
} from './marks'

const NOW = Date.parse('2026-10-07T12:00:00Z')
const target = (id: string, fingerprint?: string, snoozeOnly = false): MarkTarget => ({
  markKey: markKeyOf(id),
  item: { ...(fingerprint ? { fingerprint } : {}), ...(snoozeOnly ? { snoozeOnly: true as const } : {}) },
})

describe('a handled roll-up reopens when its fingerprint changes', () => {
  it('stays handled while the content is the same, and opens again once it changes', () => {
    const before = target('rollup:hrbp:needs:manager:plan:past-start', '3:72cae76a')
    const marks = withHandled({}, [before], NOW)
    expect(statusOf(before, marks, NOW).state).toBe('handled')
    const after = target('rollup:hrbp:needs:manager:plan:past-start', '4:9b1c0d22')
    expect(statusOf(after, marks, NOW)).toEqual({ state: 'open', changedSince: marks[before.markKey].at })
    expect(isOpen(after, marks, NOW)).toBe(true)
    // A snoozed roll-up that changes comes back before the snooze ends.
    const snoozed = withSnoozed({}, [before], NOW, 7)
    expect(statusOf(before, snoozed, NOW).state).toBe('snoozed')
    expect(statusOf(after, snoozed, NOW).state).toBe('open')
  })

  it('judges an item without a fingerprint (or a mark without one) by its mark alone', () => {
    const plain = target('plan:past-start:P-1')
    const marks = withHandled({}, [plain], NOW)
    expect(statusOf(plain, marks, NOW).state).toBe('handled')
    const v1 = parseMarks(
      JSON.stringify({
        version: 1,
        marks: { 'plan:past-start:P-2': { state: 'handled', at: '2026-10-01T00:00:00Z' } },
      }),
      NOW,
    )
    expect(statusOf(target('plan:past-start:P-2', '5:abc'), v1, NOW).state).toBe('handled')
    expect(statusOf('plan:past-start:P-2', withReopened(v1, ['plan:past-start:P-2']), NOW).state).toBe('open')
  })
})

describe('approval items close by request state', () => {
  it('are never marked handled, and a handled mark on one reads as open; Snooze still holds', () => {
    const approval = target('requests:waiting:R-1029', '3', true)
    expect(withHandled({}, [approval], NOW)).toEqual({})
    // A handled mark made elsewhere (an older file, another build) never hides the decision.
    const stray = withHandled({}, ['requests:waiting:R-1029'], NOW)
    expect(statusOf(approval, stray, NOW)).toEqual({ state: 'open' })
    const snoozed = withSnoozed({}, [approval], NOW, 7)
    expect(statusOf(approval, snoozed, NOW).state).toBe('snoozed')
    expect(statusOf(approval, snoozed, NOW + 8 * 86_400_000).state).toBe('open')
  })
})

describe('marks v2 storage', () => {
  it('reads version 1 and version 2, drops broken entries, old marks and ended snoozes', () => {
    const v1 = JSON.stringify({
      version: 1,
      marks: {
        ok: { state: 'handled', at: '2026-10-01T00:00:00Z' },
        snoozed: { state: 'snoozed', at: '2026-10-06T00:00:00Z', until: '2026-10-13T00:00:00Z' },
        ended: { state: 'snoozed', at: '2026-09-01T00:00:00Z', until: '2026-09-08T00:00:00Z' },
        old: { state: 'handled', at: '2024-01-01T00:00:00Z' },
        broken: { state: 'done', at: 'yesterday' },
        nothing: null,
      },
    })
    expect(Object.keys(parseMarks(v1, NOW)).sort()).toEqual(['ok', 'snoozed'])
    const v2 = serializeState({
      name: 'Priya',
      marks: withHandled({}, [target('finance:reconcile:all', '78:1ko92ah')], NOW, 'Priya'),
    })
    const back = parseState(v2, NOW)
    expect(back.name).toBe('Priya')
    expect(back.marks['finance:reconcile:all']).toMatchObject({
      state: 'handled',
      fingerprint: '78:1ko92ah',
      by: 'Priya',
    })
    for (const raw of [null, '', '{bad json', JSON.stringify({ version: 99, marks: {} }), JSON.stringify([])])
      expect(parseState(raw, NOW), String(raw)).toEqual({ marks: {}, name: null })
  })

  it('keeps a key named __proto__ as a plain key', () => {
    const raw = `{"version":2,"marks":{"__proto__":{"state":"handled","at":"2026-10-01T00:00:00Z"}}}`
    const m = parseMarks(raw, NOW)
    expect(Object.keys(m)).toEqual(['__proto__'])
    expect(({} as Record<string, unknown>).state).toBeUndefined()
  })

  it('survives a storage that throws, and one that is missing', () => {
    const broken: StorageLike = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('full')
      },
      removeItem: () => {
        throw new Error('blocked')
      },
    }
    const m = withHandled({}, ['a'], NOW)
    expect(saveMarks(m, broken)).toBe(false)
    expect(loadState(broken, NOW)).toEqual({ marks: {}, name: null })
    expect(saveMarks(m, null)).toBe(false)
    expect(loadState(null, NOW)).toEqual({ marks: {}, name: null })
  })

  it('saves the name with the marks and removes the key when both are empty', () => {
    const data = new Map<string, string>()
    const store: StorageLike = {
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => void data.set(k, v),
      removeItem: (k) => void data.delete(k),
    }
    expect(saveMarks({}, store, 'Sam')).toBe(true)
    expect(loadState(store, NOW)).toEqual({ marks: {}, name: 'Sam' })
    expect(saveMarks({}, store, null)).toBe(true)
    expect(data.has(STORAGE_KEY)).toBe(false)
  })

  it('keeps marks by item id, and hcp:actions described in the storage keys list', () => {
    expect(markKeyOf('requests:sent-back:R-1023')).toBe('requests:sent-back:R-1023')
    expect(STORAGE_KEY).toBe('hcp:actions')
    const entry = STORAGE_KEYS.find((k) => k.key === STORAGE_KEY)
    expect(entry?.where).toContain('localStorage')
    expect(entry?.holds).toMatch(/handled or snoozed/)
  })
})

describe('the marks file', () => {
  it('writes the marks and the name, and reads back only a marks file of this app', () => {
    const marks = withHandled({}, [target('plan:past-start:P-1', '5:a')], NOW, 'Priya')
    const text = marksFile({ marks, name: 'Priya' }, NOW)
    expect(readMarksFile(text, NOW)).toEqual({ ok: true, marks, count: 1 })
    expect(readMarksFile('{}', NOW).ok).toBe(false)
    expect(readMarksFile('not json', NOW).ok).toBe(false)
    expect(readMarksFile(JSON.stringify({ kind: 'some-other-marks', marks }), NOW).ok).toBe(false)
    const refused = readMarksFile('{}', NOW)
    expect(!refused.ok && refused.reason).toBe('The file is not a Headcount Planner marks file.')
  })

  it('merges a file over this browser by the later mark', () => {
    const mine = withHandled({}, ['a', 'b'], NOW)
    const later = withSnoozed({}, ['b', 'c'], NOW + 60_000, 7)
    const earlier = withSnoozed({}, ['a'], NOW - 60_000, 7)
    const merged = mergeMarks(mine, { ...later, ...earlier })
    expect(merged.a.state).toBe('handled')
    expect(merged.b.state).toBe('snoozed')
    expect(merged.c.state).toBe('snoozed')
  })
})
