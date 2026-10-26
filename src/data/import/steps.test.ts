/**
 * Approval steps as files write them (`requests.steps`, docs/PLAN.md 5.2): one compact text, read
 * into steps and written back exactly, in the common spellings of roles and decisions.
 */
import { describe, expect, it } from 'vitest'
import type { StepRow } from '../schema'
import { coerceSteps } from './normalize'
import { formatSteps, readSteps, STEPS_EXAMPLE } from './steps'

describe('approval steps', () => {
  it('reads the example one step per part', () => {
    expect(readSteps(STEPS_EXAMPLE)).toEqual([
      { role: 'Manager', approverId: 'E10234', decision: 'Approved', at: '2026-08-03' },
      { role: 'HRBP', approverId: 'E10077', decision: 'Pending', at: null },
    ])
  })

  it('reads roles, decisions and dates in their common spellings and separators', () => {
    expect(
      readSteps(
        'Line manager: E1 (Approved, 3 Aug 2026)\nHR business partner E2 approved with edits 08/04/2026 | FP&A E3 returned 2026-08-05; VP E4 awaiting',
      ),
    ).toEqual([
      { role: 'Manager', approverId: 'E1', decision: 'Approved', at: '2026-08-03' },
      { role: 'HRBP', approverId: 'E2', decision: 'Approved with changes', at: '2026-08-04' },
      { role: 'Finance', approverId: 'E3', decision: 'Sent back', at: '2026-08-05' },
      { role: 'Leader', approverId: 'E4', decision: 'Pending', at: null },
    ])
  })

  it('reads a step with no approver yet', () => {
    expect(readSteps('HRBP Pending')).toEqual([
      { role: 'HRBP', approverId: '', decision: 'Pending', at: null },
    ])
    expect(formatSteps([{ role: 'HRBP', approverId: '', decision: 'Pending', at: null }])).toBe(
      'HRBP Pending',
    )
  })

  it('round-trips every role and decision exactly', () => {
    const steps: StepRow[] = [
      { role: 'Manager', approverId: 'E10234', decision: 'Approved', at: '2026-08-03' },
      { role: 'HRBP', approverId: 'E10077', decision: 'Approved with changes', at: '2026-08-04' },
      { role: 'Leader', approverId: 'E10002', decision: 'Sent back', at: '2026-08-05' },
      { role: 'Finance', approverId: 'E10003', decision: 'Rejected', at: '2026-08-06' },
      { role: 'Finance', approverId: 'E10003', decision: 'Pending', at: null },
    ]
    expect(readSteps(formatSteps(steps))).toEqual(steps)
    // Steps already in memory are copied, not shared.
    const copy = readSteps(steps)
    expect(copy).toEqual(steps)
    expect(copy?.[0]).not.toBe(steps[0])
  })

  it('refuses text that is not steps, and a step whose date does not read', () => {
    expect(readSteps('Waiting on Dana')).toBe(null)
    expect(readSteps('Manager E1 Approved someday')).toBe(null)
    expect(readSteps('Manager E1 Maybe')).toBe(null)
    expect(readSteps('Approved by everyone')).toBe(null)
    expect(readSteps([{ role: 'CEO', approverId: 'E1', decision: 'Approved', at: null }])).toBe(null)
    expect(readSteps(42)).toBe(null)
    expect(readSteps('')).toEqual([])
  })

  it('never takes a role or decision from a name every object inherits', () => {
    expect(readSteps('constructor E1 Approved')).toBe(null)
    expect(readSteps('toString E1 Approved')).toBe(null)
    expect(readSteps('__proto__ E1 Approved')).toBe(null)
    expect(readSteps('Manager E1 constructor')).toBe(null)
  })

  it('coerces a cell into steps, blank into nothing', () => {
    expect(coerceSteps(STEPS_EXAMPLE).value).toHaveLength(2)
    expect(coerceSteps(null)).toEqual({ value: null })
    expect(coerceSteps(' ; ')).toEqual({ value: null })
    expect(coerceSteps('n/a')).toEqual({ value: null })
    expect(coerceSteps('Waiting on Dana')).toEqual({
      value: null,
      issue: `"Waiting on Dana" is not a list of approval steps such as "${STEPS_EXAMPLE}".`,
      code: 'unreadable',
    })
  })
})
