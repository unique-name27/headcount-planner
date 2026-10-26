/**
 * The M3 freeze's own checks (docs/CONTRACTS-M3.md section 5): the write path's action ids against the
 * policy's, every action named and checked, the audit field ids against the redaction rule, and the
 * write path's words against the copy rules. No action body runs here (they are stubs until the core
 * builder fills them).
 */
import { describe, expect, it } from 'vitest'
import { ACTION_IDS } from '@/access/ids'
import { MODES } from '@/access/modes'
import { decide } from '@/access/policy'
import { hasAmount, isPayField } from '@/access/visibility'
import { AMOUNT_AUDIT_FIELDS, AUDIT_FIELDS } from '../audit/fields'
import * as copy from './copy'
import { ACTION_CHECKS, ACTIONS, NOT_PLAN_WRITE_IDS, WRITE_ACTION_IDS } from './index'

describe('the write path’s action ids', () => {
  it('together with the ids that never write, are exactly the policy’s action ids', () => {
    const writes = new Set<string>(WRITE_ACTION_IDS)
    const reads = new Set<string>(NOT_PLAN_WRITE_IDS)
    for (const id of writes) expect(reads.has(id), id).toBe(false)
    expect([...writes, ...reads].sort()).toEqual([...ACTION_IDS].sort())
  })

  it('every write id is checked by some action, and every action checks only write ids', () => {
    const checked = new Set(Object.values(ACTION_CHECKS).flat())
    for (const id of WRITE_ACTION_IDS) expect(checked.has(id), id).toBe(true)
    for (const ids of Object.values(ACTION_CHECKS)) {
      expect(ids.length).toBeGreaterThan(0)
      for (const id of ids) expect((WRITE_ACTION_IDS as readonly string[]).includes(id), id).toBe(true)
    }
  })

  it('names the same actions in ACTIONS and ACTION_CHECKS, each taking (state, ctx, input)', () => {
    expect(Object.keys(ACTIONS).sort()).toEqual(Object.keys(ACTION_CHECKS).sort())
    for (const [name, fn] of Object.entries(ACTIONS)) {
      expect(typeof fn, name).toBe('function')
      expect(fn.length, name).toBe(3)
    }
  })

  it('every write id has an explicit decision in every mode, with a reason when it is not shown', () => {
    for (const mode of MODES)
      for (const id of WRITE_ACTION_IDS) {
        const d = decide(mode, `action:${id}`)
        expect(d.how ?? '', `${mode} ${id}`).not.toMatch(/^Not named by/)
        if (d.access !== 'shown') expect(d.how, `${mode} ${id}`).toBeTruthy()
      }
  })

  it('the masthead’s Workspace control has a decision in every mode, shown in HR admin', () => {
    for (const mode of MODES) {
      const d = decide(mode, 'masthead:workspace')
      expect(d.how ?? '', mode).not.toMatch(/^Not named by/)
      expect(d.access, mode).toBe(mode === 'hr-admin' ? 'shown' : 'limited')
    }
  })
})

describe('the audit field ids', () => {
  const plain = (f: string) => !f.includes('<')

  it('reads every amount field "changed" outside HR admin', () => {
    for (const f of AMOUNT_AUDIT_FIELDS) expect(isPayField(f), f).toBe(true)
  })

  it('carries no other field that the redaction rule takes for an amount', () => {
    // The freeze listed `costCenter` here (isPayField's /cost/ pattern read it as an amount); the
    // core builder made it an org field, which rule 7 keeps on every view. This list must only shrink.
    const overRedacted = new Set<string>()
    for (const [object, { fields }] of Object.entries(AUDIT_FIELDS))
      for (const f of fields.filter(plain))
        if (!AMOUNT_AUDIT_FIELDS.includes(f))
          expect(isPayField(f), `${object}.${f}`).toBe(overRedacted.has(f))
  })
})

describe('the write path’s words', () => {
  const texts: string[] = []
  for (const [key, v] of Object.entries(copy)) {
    if (typeof v === 'string') texts.push(v)
    else if (typeof v === 'function') {
      const args = Array.from({ length: v.length }, (_, i) =>
        key.startsWith('cycleLocked') ? i + 2 : 'R-0412',
      )
      texts.push(String((v as (...a: unknown[]) => unknown)(...args)))
    }
  }

  it('has every text and notice', () => {
    expect(texts.length).toBeGreaterThan(50)
  })

  it('writes no em dash, no "!" and no amount', () => {
    for (const t of texts) {
      expect(t, t).not.toMatch(/—|!/)
      expect(hasAmount(t), t).toBe(false)
    }
  })

  it('starts every sentence with a capital letter and ends it with a full stop', () => {
    for (const t of texts) {
      expect(t, t).toMatch(/^[A-Z]/)
      // "Below the cut line" is a reason code, not a sentence.
      if (t !== copy.BELOW_THE_CUT_LINE) expect(t, t).toMatch(/[.]$/)
    }
  })
})
