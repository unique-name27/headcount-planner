/**
 * What if's session memory (docs/PLAN.md 10.6 "Unsaved levers held in session memory"): levers are
 * kept for one view's scope key, another key reads none, subscribers hear every change, and nothing
 * is ever written to browser storage.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Lever } from '@/plan/engine/whatif'
import { MemoryStorage } from '@/testkit/memoryStorage'
import {
  clearLevers,
  leversFor,
  leversNow,
  NO_LEVERS,
  sessionNow,
  setLevers,
  subscribeLevers,
  type WhatIfSession,
} from './session'

const local = new MemoryStorage()
const session = new MemoryStorage()
vi.stubGlobal('localStorage', local)
vi.stubGlobal('sessionStorage', session)

const A = 'scope-sha256-a'
const B = 'scope-sha256-b'
const cancel: Lever = { kind: 'cancel', positionId: 'P-1' }
const defer: Lever = { kind: 'defer', positionId: 'P-2', to: '2027-02-01' }

afterEach(() => clearLevers())

describe('the session', () => {
  it('holds the levers for one view and none for another', () => {
    expect(leversFor(A)).toBe(NO_LEVERS)
    setLevers(A, [cancel, defer])
    expect(leversFor(A)).toEqual([cancel, defer])
    expect(leversNow()).toEqual([cancel, defer])
    expect(leversFor(B)).toEqual([])
    expect(leversFor(null)).toEqual([])
    // Another view's levers replace them: switching back starts empty.
    setLevers(B, [defer])
    expect(leversFor(A)).toEqual([])
    expect(leversFor(B)).toEqual([defer])
  })

  it('never reads levers for a view with no scope key (no Acting as pick)', () => {
    setLevers(null, [cancel])
    expect(leversFor(null)).toEqual([])
    expect(leversNow()).toEqual([cancel])
  })

  it('hands subscribers a new session and levers array on every change, and lets them go', () => {
    const seen: WhatIfSession[] = []
    const stop = subscribeLevers((s) => seen.push(s))
    setLevers(A, [cancel])
    const first = leversFor(A)
    setLevers(A, [cancel])
    expect(leversFor(A)).not.toBe(first)
    clearLevers()
    stop()
    setLevers(A, [defer])
    expect(seen.map((s) => [s.scopeKey, s.levers.length])).toEqual([
      [A, 1],
      [A, 1],
      [null, 0],
    ])
    expect(sessionNow().levers).toEqual([defer])
    // An empty set is the one shared empty array, so a model cached by it is built once.
    setLevers(A, [])
    expect(leversFor(A)).toBe(NO_LEVERS)
  })

  it('writes nothing to browser storage', () => {
    setLevers(A, [cancel, defer])
    clearLevers()
    expect(local.length).toBe(0)
    expect(session.length).toBe(0)
  })
})
