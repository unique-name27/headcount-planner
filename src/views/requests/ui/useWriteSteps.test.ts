/**
 * Requests > New's save-then-submit reads the ID the save's notice names (D-ID, M3 recheck): a new
 * request's ID is tagged ('R-K7QM-13716'), so a reader that knew only 'R-1128' found none and the
 * submit step never ran.
 */
import { describe, expect, it } from 'vitest'
import { requestIdIn } from './useWriteSteps'

describe('requestIdIn', () => {
  it('reads the ID a notice names in either form', () => {
    expect(requestIdIn('Draft R-K7QM-13716 saved.')).toBe('R-K7QM-13716')
    expect(requestIdIn('Trade R-TEST-20684 saved as a draft.')).toBe('R-TEST-20684')
    expect(requestIdIn('Draft R-1128 saved.')).toBe('R-1128')
    expect(requestIdIn('Nothing here.')).toBeNull()
  })
})
