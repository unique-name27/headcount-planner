/**
 * The M1 status lists (src/app/status.ts): the eight datasets and the nine sample stories, which
 * src/data/schema.test.ts and src/data/sample/sample.test.ts read, in the copy rules' terms
 * (sentence case, no "!", no em dash). The M2 shell replaced the status page itself; its first
 * frame and its pieces are checked in src/app/shell.test.ts.
 */
import { describe, expect, it } from 'vitest'
import { PLANNED_DATASETS, PLANNED_STORIES, STATUS_LINE } from './status'

describe('the status lists', () => {
  it('lists the eight datasets and the nine stories', () => {
    expect(PLANNED_DATASETS.map((d) => d.key)).toEqual([
      'positions',
      'workers',
      'comp',
      'reqs',
      'requests',
      'targets',
      'freezes',
      'assumptions',
    ])
    expect(PLANNED_DATASETS.filter((d) => d.required).map((d) => d.key)).toEqual([
      'positions',
      'workers',
      'comp',
      'assumptions',
    ])
    expect(PLANNED_STORIES).toHaveLength(9)
    expect(STATUS_LINE).toBe('M1: data and engines are being built')
  })

  it('follows the copy rules', () => {
    const all = [STATUS_LINE, ...PLANNED_STORIES, ...PLANNED_DATASETS.flatMap((d) => [d.label, d.holds])]
    for (const s of all) {
      expect(s.includes('!'), s).toBe(false)
      expect(s.includes('—'), s).toBe(false)
    }
    for (const s of [
      STATUS_LINE,
      ...PLANNED_STORIES,
      ...PLANNED_DATASETS.flatMap((d) => [d.label, d.holds]),
    ]) {
      // Sentence case: no word but the first starts with a capital unless it is a name or code.
      const words = s.split(/\s+/).slice(1)
      const capitals = words.filter((w) => /^[A-Z][a-z]/.test(w))
      const NAMES = [
        'Go-to-Market',
        'Silicon',
        'Engineering’s',
        'Engineering',
        'Bengaluru',
        'Hsinchu',
        'Systems',
        'Software',
        'Corporate',
        'Munich',
        'Haifa',
        'FTE',
      ]
      expect(
        capitals.filter((w) => !NAMES.includes(w.replace(/[,:]$/, ''))),
        s,
      ).toEqual([])
    }
  })
})
