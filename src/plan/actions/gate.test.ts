/**
 * The checks every action runs first (docs/PLAN.md 5.4, 8.2, 8.3, 8.4 rule 5; M3): a reader tab
 * refuses with READ_ONLY_NOTE before anything else, then a mode with no Acting as pick refuses with
 * "Pick who you act as before making changes.", then the policy: an action whose first id is hidden
 * in a mode refuses with the policy's own reason, in every mode, whatever the input. Free text a
 * manager can read refuses an amount at entry (REMOVE_AMOUNT_TEXT) and a blank required reason
 * (REASON_REQUIRED_TEXT).
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { PICK_BEFORE_CHANGES } from '@/access/copy'
import { MODES, NO_PICKS } from '@/access/modes'
import { decide } from '@/access/policy'
import { actionContextOf } from '@/app/write/context'
import type { AnalyticsContext } from '@/data/context'
import type { Sample } from '@/data/sample'
import type { Mode } from '@/data/schema'
import { leakSample, sampleCtx } from '@/testkit/sample'
import { READ_ONLY_NOTE, REASON_REQUIRED_TEXT, REMOVE_AMOUNT_TEXT } from './copy'
import { freeTextRefusal, gate, isLimited } from './gate'
import { ACTION_CHECKS, ACTIONS, type ActionName, runActionByName } from './index'
import type { ActionContext } from './types'

let s: Sample
const ctxs = new Map<Mode, AnalyticsContext>()
beforeAll(() => {
  s = leakSample()
  for (const m of MODES) ctxs.set(m, sampleCtx(m))
}, 120_000)

const AT = '2026-09-30T10:00:00.000Z'
const actionCtx = (mode: Mode, over: Partial<ActionContext> = {}): ActionContext => ({
  ...actionContextOf(ctxs.get(mode) as AnalyticsContext, { readOnly: false, at: AT }),
  ...over,
})
const names = Object.keys(ACTIONS) as ActionName[]

describe('the gate, before any input is read', () => {
  it('refuses every action in a reader tab with READ_ONLY_NOTE, in every mode', () => {
    for (const mode of MODES) {
      const ctx = actionCtx(mode, { readOnly: true })
      for (const name of names)
        expect(runActionByName(name, s.plan, ctx, {} as never), `${mode} ${name}`).toEqual({
          ok: false,
          refused: READ_ONLY_NOTE,
        })
    }
  })

  it('refuses every action with no Acting as pick, after the reader-tab check', () => {
    for (const mode of MODES) {
      const ctx = actionContextOf(sampleCtx(mode, { picks: NO_PICKS }), { readOnly: false, at: AT })
      expect(ctx.writeBlock).toBe(PICK_BEFORE_CHANGES)
      for (const name of names)
        expect(runActionByName(name, s.plan, ctx, {} as never), `${mode} ${name}`).toEqual({
          ok: false,
          refused: PICK_BEFORE_CHANGES,
        })
      expect(runActionByName('createRequest', s.plan, { ...ctx, readOnly: true }, {} as never)).toEqual({
        ok: false,
        refused: READ_ONLY_NOTE,
      })
    }
  })

  it('refuses an action whose first id the mode hides with the policy’s reason, in every mode', () => {
    let hidden = 0
    for (const mode of MODES) {
      const ctx = actionCtx(mode)
      for (const name of names) {
        const id = ACTION_CHECKS[name][0]
        const d = decide(mode, `action:${id}`)
        if (d.access !== 'hidden') continue
        hidden++
        expect(gate(ctx, id), `${mode} ${id}`).toBe(d.how)
        expect(runActionByName(name, s.plan, ctx, {} as never), `${mode} ${name}`).toEqual({
          ok: false,
          refused: d.how,
        })
      }
    }
    expect(hidden).toBeGreaterThan(60)
  })

  it('lets a shown or limited id through to the action’s own rules', () => {
    for (const mode of MODES) {
      const ctx = actionCtx(mode)
      for (const name of names) {
        const id = ACTION_CHECKS[name][0]
        const d = decide(mode, `action:${id}`)
        if (d.access === 'hidden') continue
        expect(gate(ctx, id), `${mode} ${id}`).toBeNull()
        expect(isLimited(ctx, id), `${mode} ${id}`).toBe(d.access === 'limited')
      }
    }
  })

  it('checks the second id of an action where it names one (a transfer that moves budget)', () => {
    const ctx = actionCtx('finance')
    // Finance: transfer.process is hidden first; transfer.move-budget's own reason is the policy's.
    expect(gate(ctx, 'transfer.move-budget')).toBe(decide('finance', 'action:transfer.move-budget').how)
  })
})

describe('free text a manager reads (8.4 rule 5)', () => {
  it('refuses an amount in any spelling, and a blank required reason', () => {
    const ctx = actionCtx('hrbp')
    for (const t of ['€140,000', '140.000 EUR', '95k', '1.2M', 'INR 14 lakh', '$95,000', '140 000 €'])
      expect(freeTextRefusal(ctx, `Start moved to save ${t}`), t).toBe(REMOVE_AMOUNT_TEXT)
    for (const t of ['Start after the hiring plan', 'P4 in 2027', 'Seat P-2589 moves to Q4'])
      expect(freeTextRefusal(ctx, t, true), t).toBeNull()
    expect(freeTextRefusal(ctx, '   ', true)).toBe(REASON_REQUIRED_TEXT)
    expect(freeTextRefusal(ctx, '', false)).toBeNull()
  })
})
