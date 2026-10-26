/**
 * What the app registers before it renders (the template app's main.tsx wiring, docs/PLAN.md 5.4
 * and 13): the generated sample as the data store's sample source (its datasets and its own as-of
 * date, 30 Sep 2026), the messy sample loader (the raw extracts through the real import pipeline,
 * src/data/sample/raw/load.ts, so the tiers are right from the first paint), and the PlanStore the
 * plan state is read from. The sample's datasets and plan state are regenerated on every load and
 * never stored (`cachedSample()` builds them once per page).
 */
import { SAMPLE_AS_OF } from '@/data/sample/base'
import { cachedSample } from '@/data/sample/generate'
import { type SampleSeed, setSampleSeed, setSampleSource } from '@/data/store'
import { BrowserStore } from '@/plan/store/browserStore'
import { defaultVersionId } from '@/plan/store/memoryStore'
import type { PlanStore, PlanStoreDeps } from '@/plan/store/types'
import type { PlanState } from '@/plan/types'
import { computeLockNow } from './write/lock'

/** The sample's plan state (versions, closes, the FY28 cycle), the baseline every overlay lays over. */
export const samplePlan = (): PlanState => cachedSample().plan

/**
 * Register the sample with the data store: its datasets, built on demand, and the messy seed. The
 * seed's load starts here, so its import runs while the shell mounts; a seed that fails to load
 * leaves the plain sample.
 */
export function registerSample(): void {
  setSampleSource({ data: () => cachedSample().datasets, asOf: SAMPLE_AS_OF })
  const seed: Promise<SampleSeed> = import('@/data/sample/raw/load')
    .then((m) => m.messySampleLoader())
    .catch(() => ({}))
  setSampleSeed(() => seed)
}

/**
 * The PlanStore's needs besides storage (M3 freeze): the clock, the lock's content computed by the
 * write path from the current analytics context (src/app/write/lock.ts `computeLockNow`, the same
 * computation the `lockVersion` action reads as `env.computeLock`), and a version ID never used.
 */
const APP_DEPS: PlanStoreDeps = {
  now: () => new Date().toISOString(),
  computeLock: (working, at) => computeLockNow(working, at),
  newVersionId: (working, as) => defaultVersionId(working, as, new Set()),
}

let planStore: BrowserStore | null = null

/** The page's one PlanStore over IndexedDB, with the write lock (created on first use). */
export function appPlanStore(): PlanStore {
  planStore ??= new BrowserStore({ deps: APP_DEPS })
  return planStore
}
