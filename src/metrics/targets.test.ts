/**
 * Targets: a target the engine calculates with can change value but not direction and can't be
 * removed; "under" is kept for targets registered that way; a target pointing against the metric's
 * good direction gets a caution.
 */
import { describe, expect, it } from 'vitest'
import { defineMetrics } from './define'
import {
  applyEdit,
  checkTarget,
  comparatorText,
  defaultComparator,
  EMPTY_METRICS,
  targetDirectionWarning,
  targetText,
} from './overrides'
import { catalogOf, validateCatalog } from './registry'

const [onTime, sentBack, plain] = defineMetrics('requests', [
  {
    id: 'requests.queue.onTime',
    name: 'Decided within 5 days',
    definition: 'Share of requests decided within 5 days of submission.',
    unit: 'pct',
    goodDirection: 'up',
    target: { value: 0.9, comparator: '>=' },
    targetRequired: true,
    uses: ['requests.submittedAt'],
  },
  {
    id: 'requests.queue.sentBackShare',
    name: 'HRBP send-back share',
    definition: 'Requests sent back as a share of requests decided.',
    unit: 'pct',
    goodDirection: 'down',
    target: { value: 0.02, comparator: '<' },
    targetRequired: true,
    uses: ['requests.state'],
  },
  {
    id: 'requests.queue.complete',
    name: 'Complete on submit',
    definition: 'Share of requests submitted with every field filled.',
    unit: 'pct',
    goodDirection: 'up',
    uses: ['requests.steps'],
  },
])
const CAT = catalogOf([onTime, sentBack, plain])

describe('required targets', () => {
  it('change value, keep their direction and are never removed', () => {
    expect(checkTarget(onTime, { value: 0.95, comparator: '>=' })).toEqual({
      ok: true,
      value: { value: 0.95, comparator: '>=' },
    })
    const removed = checkTarget(onTime, null)
    expect(removed.ok).toBe(false)
    expect(!removed.ok && removed.error).toContain('needs a target')
    const flipped = checkTarget(onTime, { value: 0.95, comparator: '<=' })
    expect(!flipped.ok && flipped.error).toBe(
      'The target of decided within 5 days is always "at least": the status marks are calculated that way. Change its value instead.',
    )
    const acronym = checkTarget(sentBack, { value: 0.03, comparator: '>=' })
    expect(!acronym.ok && acronym.error).toContain('The target of HRBP send-back share is always "under"')
    const r = applyEdit(EMPTY_METRICS, CAT, { metricId: onTime.id, field: 'target', value: null })
    expect(r.ok).toBe(false)
  })

  it('keep "under" where it is registered, and nowhere else', () => {
    expect(checkTarget(sentBack, { value: 0.03, comparator: '<' }).ok).toBe(true)
    expect(checkTarget(plain, { value: 0.8, comparator: '<' }).ok).toBe(false)
    expect(targetText(sentBack, sentBack.target)).toBe('Under 2.0%')
    expect(comparatorText('<=')).toBe('At most')
    expect(validateCatalog([sentBack])).toEqual([])
    expect(validateCatalog([{ ...onTime, target: undefined }])).toEqual([
      'requests.queue.onTime: a required target needs a default.',
    ])
  })

  it('a removable target can still be removed, and is checked against the unit', () => {
    expect(checkTarget(plain, null)).toEqual({ ok: true, value: null })
    expect(checkTarget(plain, { value: 1.2, comparator: '>=' })).toEqual({
      ok: false,
      error: 'Enter a target from 0% to 100%.',
    })
    expect(checkTarget({ ...plain, unit: 'days' }, { value: -1, comparator: '<=' })).toEqual({
      ok: false,
      error: 'Enter a target of 0 or more.',
    })
  })
})

describe('target direction', () => {
  it('starts a new target in the good direction', () => {
    expect(defaultComparator({ goodDirection: 'down' })).toBe('<=')
    expect(defaultComparator({ goodDirection: 'up' })).toBe('>=')
    expect(defaultComparator({ goodDirection: null })).toBe('>=')
  })

  it('cautions when a target points against the good direction', () => {
    expect(targetDirectionWarning(plain, { value: 0.9, comparator: '<=' })).toContain('Higher is better')
    expect(targetDirectionWarning(plain, { value: 0.9, comparator: '>=' })).toBeNull()
    expect(targetDirectionWarning(sentBack, { value: 0.02, comparator: '<' })).toBeNull()
    expect(targetDirectionWarning(sentBack, { value: 0.02, comparator: '>=' })).toContain('Lower is better')
    expect(targetDirectionWarning({ goodDirection: null }, { value: 1, comparator: '<=' })).toBeNull()
    expect(targetDirectionWarning(plain, null)).toBeNull()
  })
})
