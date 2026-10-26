/**
 * The rows each raw extract imports as (docs/PLAN.md 13.5): the clean sample with each extract's
 * planted problems applied. The app shows these rows for the four raw datasets (./starter.ts
 * `starterSample`), so the sample's baseline id reads them too (../generate.ts `sampleBaselineId`,
 * M4 recheck B9-b): a build that changes only a planted extract gives another id. Light: the
 * extracts' planted functions and nothing that imports the generator. Pure.
 */
import type { Datasets } from '../../schema'
import { freezesPlanted } from './extracts/freezes'
import { reqsPlanted } from './extracts/reqs'
import { requestsPlanted } from './extracts/requests'
import { targetsPlanted } from './extracts/targets'
import type { RawDataset } from './plan'

/** The rows each raw extract imports as, from the clean datasets. */
export type Planted = { [K in RawDataset]: (base: Datasets) => Datasets[K] }

/** The rows each raw extract imports as. */
export const PLANTED: Planted = {
  reqs: reqsPlanted,
  targets: targetsPlanted,
  freezes: freezesPlanted,
  requests: requestsPlanted,
}
