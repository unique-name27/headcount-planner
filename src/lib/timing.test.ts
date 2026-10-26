/**
 * `timed`: it records only while the flag is on (off by default; Phase 1 has no Developer mode), and
 * it always returns what the wrapped function returns.
 */
import { describe, expect, it } from 'vitest'
import {
  clearTimings,
  recordSince,
  setTimingOn,
  TIMING_PREFIX,
  timed,
  timingClock,
  timingEntries,
  timingGroup,
  timingOn,
} from './timing'

const names = () => timingEntries().map((e) => e.name)

describe('timed', () => {
  it('starts off', () => {
    expect(timingOn()).toBe(false)
    expect(TIMING_PREFIX).toBe('hcp:')
  })

  it('records nothing while the flag is off, and returns what the function returns', () => {
    setTimingOn(false)
    clearTimings()
    expect(timed('hcp:test:off', () => 42)).toBe(42)
    recordSince('hcp:test:off', timingClock())
    expect(names()).not.toContain('hcp:test:off')
  })

  it('records an hcp: measure while the flag is on, even when the function throws', () => {
    setTimingOn(true)
    expect(timed('hcp:test:on', () => 'x')).toBe('x')
    expect(() =>
      timed('hcp:test:throws', () => {
        throw new Error('boom')
      }),
    ).toThrow('boom')
    expect(names()).toEqual(expect.arrayContaining(['hcp:test:on', 'hcp:test:throws']))
    const e = timingEntries().find((x) => x.name === 'hcp:test:on')
    expect(e?.ms).toBeGreaterThanOrEqual(0)
    clearTimings()
    expect(names().filter((n) => n.startsWith('hcp:test:'))).toEqual([])
    setTimingOn(false)
  })

  it('names its groups', () => {
    expect(timingGroup('hcp:headline:plan')).toBe('headline')
    expect(timingGroup('hcp:context')).toBe('context')
  })
})
