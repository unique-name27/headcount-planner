/**
 * The Workspace menu per mode (docs/PLAN.md 5.5 "Who", 8.3): each item by its own action's decision,
 * the limited ones with the policy's sentence, and the Full file listed in HR admin only and usable
 * only with Show pay amounts on.
 */
import { describe, expect, it, vi } from 'vitest'
import { decide } from '@/access/policy'
import { MemoryStorage } from '@/testkit/memoryStorage'
import { personaCtx, sampleCtx } from '@/testkit/sample'
import { workspaceMenuOf } from './menu'
import { FULL_NEEDS_PAY_TEXT } from './workspace'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
vi.stubGlobal('localStorage', new MemoryStorage())

const keys = (ctx: ReturnType<typeof sampleCtx>) => {
  const m = workspaceMenuOf(ctx)
  return [...m.save, ...m.bring].map((i) => i.key)
}

describe('the Workspace menu', () => {
  it('lists what each mode saves and opens', () => {
    expect(keys(personaCtx('manager-a'))).toEqual(['shareable', 'requests', 'open-shared'])
    expect(keys(personaCtx('hrbp-se'))).toEqual([
      'shareable',
      'requests',
      'for-manager',
      'open-shared',
      'import-requests',
    ])
    expect(keys(personaCtx('leader-svp-se'))).toEqual([
      'shareable',
      'requests',
      'for-manager',
      'open-shared',
      'import-requests',
    ])
    expect(keys(personaCtx('finance-fpa'))).toEqual([
      'shareable',
      'requests',
      'open-shared',
      'import-requests',
    ])
    expect(keys(sampleCtx('hr-admin'))).toEqual([
      'shareable',
      'requests',
      'for-manager',
      'full',
      'open-shared',
      'import-requests',
      'import',
    ])
  })

  it('says the control’s limit outside HR admin, and each limited item’s sentence', () => {
    for (const key of ['manager-a', 'hrbp-se', 'leader-svp-se', 'finance-fpa'] as const)
      expect(workspaceMenuOf(personaCtx(key)).note, key).toBe(
        'Lists only the files this mode saves and opens.',
      )
    expect(workspaceMenuOf(sampleCtx('hr-admin')).note).toBeNull()
    const lead = workspaceMenuOf(personaCtx('leader-svp-se'))
    const all = [...lead.save, ...lead.bring]
    expect(all.find((i) => i.key === 'for-manager')?.limited).toBe(
      decide('leader', 'action:export.for-manager').how,
    )
    expect(all.find((i) => i.key === 'import-requests')?.limited).toBe(
      decide('leader', 'action:request.import').how,
    )
    expect(all.find((i) => i.key === 'shareable')?.limited).toBeNull()
  })

  it('marks the imports as writes, and the Full file usable only with Show pay amounts on', () => {
    const off = workspaceMenuOf(sampleCtx('hr-admin'))
    const on = workspaceMenuOf(sampleCtx('hr-admin', { showPay: true }))
    expect(off.save.find((i) => i.key === 'full')?.disabled).toBe(FULL_NEEDS_PAY_TEXT)
    expect(on.save.find((i) => i.key === 'full')?.disabled).toBeNull()
    expect([...on.save, ...on.bring].filter((i) => i.writes).map((i) => i.key)).toEqual([
      'import-requests',
      'import',
    ])
  })
})
