/**
 * The current view's scope identity for "Open a shared file" (docs/PLAN.md 5.5, C30; review RM-3),
 * on the sample: Manager A's Shareable shows its figures to Manager A alone. Manager B, given A's
 * display name (a namesake), gets none; so does another mode, a pick still to be made, and a file
 * with no identity. Manager mode opening an HRBP's file gets 5.5's note.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { AnalyticsContext } from '@/data/context'
import { MemoryStorage } from '@/testkit/memoryStorage'
import { leakSample, personaCtx, picksWith, sampleCtx } from '@/testkit/sample'
import { openedFileView, scopeIdentityOf, viewScopeKey } from './sharedFile'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
vi.stubGlobal('localStorage', new MemoryStorage())

let a: AnalyticsContext
let b: AnalyticsContext
let hrbp: AnalyticsContext

beforeAll(() => {
  a = personaCtx('manager-a')
  b = personaCtx('manager-b')
  hrbp = personaCtx('hrbp-se')
}, 120_000)

describe('the view’s scope identity', () => {
  it('names the mode, the Acting as person and the scope’s seats', () => {
    const id = scopeIdentityOf(a)
    expect(id.mode).toBe('manager')
    expect(id.personId).toBe(a.access.actingAs?.personId)
    expect([...(id.positionIds ?? [])].length).toBeGreaterThan(0)
    expect(scopeIdentityOf(hrbp).unit).toBe('Silicon Engineering')
  })

  it('differs between two managers, and between modes', () => {
    expect(viewScopeKey(a)).not.toBeNull()
    expect(viewScopeKey(a)).not.toBe(viewScopeKey(b))
    expect(viewScopeKey(a)).not.toBe(viewScopeKey(hrbp))
    expect(viewScopeKey(a)).toBe(viewScopeKey(personaCtx('manager-a')))
  })
})

describe('an opened Shareable', () => {
  it('shows its figures to the view that made it only, never to a namesake', () => {
    const header = {
      kind: 'shareable' as const,
      mode: 'manager' as const,
      scopeLabel: a.scopeLabel,
      scopeKey: viewScopeKey(a),
    }
    expect(openedFileView(header, a)).toEqual({ figuresShown: true, note: null })
    const asB = openedFileView(header, b)
    expect(asB.figuresShown).toBe(false)
    expect(asB.note).toMatch(/^This file’s figures show only in the mode and for the person it was made for/)
    // The same label with no identity shows nothing either.
    expect(
      openedFileView({ kind: 'shareable', mode: 'manager', scopeLabel: a.scopeLabel }, a).figuresShown,
    ).toBe(false)
  })

  it('gives Manager mode 5.5’s note for an HRBP’s file', () => {
    const header = {
      kind: 'shareable' as const,
      mode: 'hrbp' as const,
      scopeLabel: hrbp.scopeLabel,
      scopeKey: viewScopeKey(hrbp),
    }
    expect(openedFileView(header, a)).toEqual({
      figuresShown: false,
      note: 'This file was made in HRBP mode and holds more than Manager mode shows. Ask for one made for your team.',
    })
  })

  it('shows nothing while the pick is to be made', () => {
    const unset = sampleCtx('manager', { picks: picksWith(leakSample(), 'manager', null) })
    expect(unset.access.unset).toBe(true)
    expect(viewScopeKey(unset)).toBeNull()
  })
})
