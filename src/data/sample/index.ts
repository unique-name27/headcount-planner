/**
 * Northgate Semiconductor, the sample company (docs/PLAN.md 13). The app registers
 * `cachedSample()`: its datasets and its plan state (versions, closes, the FY28 cycle) are
 * regenerated on every load and never stored. The base generator is base.ts; generate.ts adds the
 * versions, closes, cycle and trade; stories.ts computes the nine stories' numbers; raw/ builds the
 * messy extracts and the managers' request files.
 */

export { FY27_BUDGET, FY27_Q1_REFORECAST, FY27_WORKING, FY28_WORKING, SAMPLE_VERSIONS } from './assumptions'
export {
  asKnownOn,
  assumptionsOf,
  BUDGET_LOCK_DATE,
  generateSampleBase,
  type KnownDates,
  type Planted,
  SAMPLE_AS_OF,
  SAMPLE_COMPANY,
  type SampleBase,
  standardHeadFrom,
} from './base'
export { cachedSample, generateSample, type Sample, type SampleStoryIds } from './generate'
export type { Persona, PersonaKey } from './personas'
export {
  computeStories,
  type Stories,
  type StoryInput,
  type StoryModel,
  sampleStories,
  storiesOneToEight,
  storyModel,
  storyNine,
} from './stories'
