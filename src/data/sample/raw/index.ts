/**
 * The messy sample (docs/PLAN.md 13.5): raw extracts with vendor headers, odd spellings and planted
 * problems for the silver and bronze datasets, run through the real import pipeline, starter
 * certifications for the gold ones, and the six managers' request files for Import requests. The app
 * loads it through `./load`; this barrel is for tests and tools.
 */
export type { RawExtract } from './extract'
export {
  CERTIFIED,
  CONFIRMED,
  FILES,
  RAW_DATASETS,
  type RawDataset,
  SAMPLE_TIERS,
  type StartTier,
} from './plan'
export {
  EXPORTED_AT,
  type ExportRule,
  MERGE_DATE,
  MERGE_SUMMARY,
  type RequestFiles,
  type RequestFilesInput,
  sampleMergeBase,
  sampleRequestFiles,
} from './requestFiles'
export {
  cachedSampleRequestFiles,
  type NamedFile,
  sampleLockedRefs,
  sampleRequestFilesOf,
} from './sampleFiles'
export {
  buildMessySample,
  completeMessySample,
  type ImportedExtract,
  importExtract,
  type MessySample,
  rawExtract,
  sameRows,
} from './seed'
export { PLANTED, type StarterSample, starterSample } from './starter'
