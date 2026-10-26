/**
 * The stories hold on messy data too (docs/PLAN.md 13.5, 16.1): the messy sample's rows (the starter
 * state, which equals the import of every raw extract) give the same nine stories, the same closes
 * and the same Budget and Q1 Reforecast hashes as the clean sample, recomputed from the messy rows.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { generateSample, type Sample } from '../generate'
import { computeStories, type Stories, storyModel } from '../stories'
import { starterSample } from '.'

let clean: Sample
let cleanStories: Stories
let messyStories: Stories
let messyModel: ReturnType<typeof storyModel>

beforeAll(() => {
  clean = generateSample()
  cleanStories = computeStories(storyModel({ ...clean, closes: clean.plan.closes, locks: clean.locks }))
  // Recomputed from the messy rows: the closes, the locks and the forecast.
  messyModel = storyModel({ ...clean, datasets: starterSample(clean.datasets).data })
  messyStories = computeStories(messyModel)
}, 120_000)

describe('planted stories on the messy sample', () => {
  it('locks the same Budget and Q1 Reforecast and closes the same months', () => {
    expect(messyModel.locks.budget.hash).toBe(clean.locks.budget.hash)
    expect(messyModel.locks.q1.hash).toBe(clean.locks.q1.hash)
    expect(messyModel.closes.map((c) => c.hash)).toEqual(clean.plan.closes.map((c) => c.hash))
  })

  for (const key of ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'] as const)
    it(`finds story ${key.slice(1)} with the same numbers`, () => {
      expect(JSON.stringify(messyStories[key])).toBe(JSON.stringify(cleanStories[key]))
    })

  it('finds story 9 with the same quote, check and chain', () => {
    expect(messyStories.s9.quote).toEqual(cleanStories.s9.quote)
    expect(messyStories.s9.routing.check).toEqual(cleanStories.s9.routing.check)
    expect(messyStories.s9.routing.steps).toEqual(cleanStories.s9.routing.steps)
    expect(messyStories.s9.control).toEqual(cleanStories.s9.control)
    expect(messyStories.s9.storedSteps).toEqual(cleanStories.s9.storedSteps)
  })
})
