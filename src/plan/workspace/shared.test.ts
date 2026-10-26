/**
 * The contract of "Open a shared file" that M2 pins for M3's opener (docs/PLAN.md 5.5, 8.4, C30;
 * review RM-3): a file's figure snapshots show only to the view that made it, matched by scope
 * identity (the mode, the Acting as person, the unit and the scope's seats), never by the scope's
 * display name, so a namesake manager never sees another team's figures; a file with no identity
 * shows none; Manager mode opening another mode's file gets 5.5's note; and the identity survives a
 * write and a read of the file while the checksum still covers the body only.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { AnalyticsContext } from '@/data/context'
import type { Mode } from '@/data/schema'
import { MemoryStorage } from '@/testkit/memoryStorage'
import { personaCtx } from '@/testkit/sample'
import type { PlanStateSlice } from '../types'
import { buildWorkspaceFile, serializeWorkspace } from './file'
import {
  FIGURES_NOT_HERE_NOTE,
  isScopeKey,
  managerForeignNote,
  type ScopeIdentity,
  scopeKeyOf,
  sharedFiguresShown,
  sharedFileNote,
} from './shared'
import { readWorkspace } from './validate'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
vi.stubGlobal('localStorage', new MemoryStorage())

const LABEL: Record<Mode, string> = {
  manager: 'Manager',
  hrbp: 'HRBP',
  leader: 'Leader',
  finance: 'Finance',
  'hr-admin': 'HR admin',
}

const a: ScopeIdentity = {
  mode: 'manager',
  personId: 'E10626',
  rootPositionIds: ['P-2052'],
  positionIds: ['P-2058', 'P-2059', 'P-2601', 'P-2637'],
}

describe('scopeKeyOf', () => {
  it('is one key for one view, whatever the order of its seats', () => {
    const k = scopeKeyOf(a)
    expect(isScopeKey(k)).toBe(true)
    expect(scopeKeyOf({ ...a, positionIds: [...(a.positionIds as string[])].reverse() })).toBe(k)
  })

  it('differs for another person, another team, another unit or another mode', () => {
    const k = scopeKeyOf(a)
    expect(scopeKeyOf({ ...a, personId: 'E10999' })).not.toBe(k)
    expect(scopeKeyOf({ ...a, positionIds: ['P-3001', 'P-3002'] })).not.toBe(k)
    expect(scopeKeyOf({ ...a, mode: 'leader' })).not.toBe(k)
    const hrbp: ScopeIdentity = { mode: 'hrbp', personId: 'E10513', unit: 'Silicon Engineering' }
    expect(scopeKeyOf({ ...hrbp, unit: 'Go-to-Market' })).not.toBe(scopeKeyOf(hrbp))
  })

  it('is null while the pick is to be made', () => {
    expect(scopeKeyOf({ ...a, personId: null })).toBeNull()
  })
})

describe('sharedFiguresShown', () => {
  const key = scopeKeyOf(a)
  it('shows a Shareable’s figures to the exact view that made it', () => {
    expect(
      sharedFiguresShown(
        { kind: 'shareable', mode: 'manager', scopeKey: key },
        { mode: 'manager', scopeKey: key },
      ),
    ).toBe(true)
  })

  it('never decides by the display name: same label, no identity or another identity shows nothing', () => {
    const label = "Sebastian Wagner's team"
    const namesake = scopeKeyOf({ ...a, personId: 'E19999', positionIds: ['P-9001'] })
    expect(
      sharedFiguresShown(
        { kind: 'shareable', mode: 'manager', scopeLabel: label },
        { mode: 'manager', scopeKey: key },
      ),
    ).toBe(false)
    expect(
      sharedFiguresShown(
        { kind: 'shareable', mode: 'manager', scopeLabel: label, scopeKey: key },
        { mode: 'manager', scopeKey: namesake },
      ),
    ).toBe(false)
    expect(
      sharedFiguresShown(
        { kind: 'shareable', mode: 'manager', scopeKey: 'Sebastian' },
        { mode: 'manager', scopeKey: 'Sebastian' },
      ),
    ).toBe(false)
  })

  it('shows nothing from another mode, a Requests file, or to a viewer with no pick', () => {
    expect(
      sharedFiguresShown(
        { kind: 'shareable', mode: 'hrbp', scopeKey: key },
        { mode: 'manager', scopeKey: key },
      ),
    ).toBe(false)
    expect(
      sharedFiguresShown(
        { kind: 'requests', mode: 'manager', scopeKey: key },
        { mode: 'manager', scopeKey: key },
      ),
    ).toBe(false)
    expect(
      sharedFiguresShown(
        { kind: 'shareable', mode: 'manager', scopeKey: key },
        { mode: 'manager', scopeKey: null },
      ),
    ).toBe(false)
  })
})

describe('sharedFileNote', () => {
  const key = scopeKeyOf(a)
  it('gives Manager mode 5.5’s note for a file made in another mode', () => {
    expect(
      sharedFileNote(
        { kind: 'shareable', mode: 'hrbp', scopeKey: key },
        { mode: 'manager', scopeKey: key },
        (m) => LABEL[m],
      ),
    ).toBe(
      'This file was made in HRBP mode and holds more than Manager mode shows. Ask for one made for your team.',
    )
    expect(managerForeignNote('Leader')).toMatch(/^This file was made in Leader mode/)
  })

  it('says why figures stay hidden, and nothing when they show', () => {
    expect(
      sharedFileNote(
        { kind: 'shareable', mode: 'manager' },
        { mode: 'manager', scopeKey: key },
        (m) => LABEL[m],
      ),
    ).toBe(FIGURES_NOT_HERE_NOTE)
    expect(
      sharedFileNote(
        { kind: 'shareable', mode: 'manager', scopeKey: key },
        { mode: 'manager', scopeKey: key },
        (m) => LABEL[m],
      ),
    ).toBeNull()
  })
})

describe('a namesake manager on the sample (RM-3)', () => {
  let ctxA: AnalyticsContext
  let ctxB: AnalyticsContext
  beforeAll(() => {
    ctxA = personaCtx('manager-a')
    ctxB = personaCtx('manager-b')
  }, 120_000)

  const identityOf = (ctx: AnalyticsContext): ScopeIdentity => {
    const s = ctx.access.scope
    return {
      mode: ctx.access.mode,
      personId: ctx.access.actingAs?.personId ?? null,
      rootPositionIds: s?.kind === 'tree' ? s.rootPositionIds : null,
      positionIds: s?.positionIds ?? null,
    }
  }

  it('gives Manager B no figures from Manager A’s file, even under A’s own team name', () => {
    const fileKey = scopeKeyOf(identityOf(ctxA))
    const header = {
      kind: 'shareable' as const,
      mode: 'manager' as const,
      scopeLabel: ctxA.scopeLabel,
      scopeKey: fileKey,
    }
    // B goes by A's name: the label matches, the identity does not.
    expect(sharedFiguresShown(header, { mode: 'manager', scopeKey: scopeKeyOf(identityOf(ctxB)) })).toBe(
      false,
    )
    expect(sharedFiguresShown(header, { mode: 'manager', scopeKey: scopeKeyOf(identityOf(ctxA)) })).toBe(true)
  })
})

describe('the identity in the file', () => {
  const plan: PlanStateSlice = {
    kind: 'shareable',
    requests: [],
    cycles: [],
    versions: [],
    closes: [],
    audit: [],
    models: { 'team.allocation.heads': 9 },
  }
  const base = {
    kind: 'shareable' as const,
    savedAt: '2026-09-30T12:00:00.000Z',
    mode: 'manager' as const,
    scopeLabel: "Sebastian Wagner's team",
    actingAs: false,
    plan,
    lockedVersions: [],
  }

  it('is written beside the label, read back, and outside the checksum', () => {
    const key = scopeKeyOf(a) as string
    const file = buildWorkspaceFile({ ...base, scopeKey: key })
    expect(file.scopeKey).toBe(key)
    expect(file.checksum).toBe(buildWorkspaceFile(base).checksum)
    const text = serializeWorkspace(file)
    expect(text.indexOf('"scopeKey"')).toBeGreaterThan(text.indexOf('"scopeLabel"'))
    const read = readWorkspace(text, text.length, [])
    expect(read.ok && read.file.scopeKey).toBe(key)
  })

  it('is left out when missing or not one the app writes, so the file opens with no figures', () => {
    const plain = serializeWorkspace(buildWorkspaceFile(base))
    expect(plain).not.toContain('scopeKey')
    const read = readWorkspace(plain, plain.length, [])
    expect(read.ok && read.file.scopeKey).toBeUndefined()
    const forged = plain.replace('"actingAs"', '"scopeKey": "Sebastian Wagner",\n  "actingAs"')
    const readForged = readWorkspace(forged, forged.length, [])
    expect(readForged.ok && readForged.file.scopeKey).toBeUndefined()
    expect(() => buildWorkspaceFile({ ...base, scopeKey: 'Sebastian Wagner' })).toThrow(/scopeKeyOf/)
  })
})
