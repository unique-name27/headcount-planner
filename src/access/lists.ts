/**
 * The official lists the modes read (docs/PLAN.md 8.2 and 10.2): which levels are leader seats, each
 * unit's HR business partner and the Roles list's people. On the sample the lists are the sample
 * company's own, built from the generated sample with its people named, as the M1 data builder's
 * lists tests read them: each unit's HRBP from the generator's world (`world.hrbp`, the people its
 * approval routing reads) and the HR admin and Finance personas on the Roles list. So the scopes,
 * the Acting as picker, the viewer's HRBP units and the quality index's vocabularies all read one
 * set of lists. Memoized; never builds the sample unless a dataset is the sample's.
 */

import { EMPTY_LISTS } from '@/data/lists/edit'
import { effectiveLists, type SampleSource, type SourceKinds } from '@/data/lists/effective'
import type { EffectiveLists, ListsState } from '@/data/lists/types'
import { cachedSample, type Sample } from '@/data/sample'
import type { Datasets } from '@/data/schema'

const sources = new WeakMap<Sample, SampleSource>()

/** The sample company as the lists read it: its clean datasets and the people its lists name. */
export function sampleListSourceOf(sample: Sample): SampleSource {
  let hit = sources.get(sample)
  if (!hit) {
    const w = sample.world
    const personaId = (key: string) => sample.personas.find((p) => p.key === key)?.employeeId
    const hrAdmin = personaId('hr-admin')
    const finance = personaId('finance-fpa')
    hit = {
      data: sample.datasets,
      people: {
        hrbp: Object.fromEntries([...w.hrbp].map(([unit, person]) => [unit, w.people[person].id])),
        roles: {
          'HR admin': hrAdmin ? [hrAdmin] : [],
          Finance: finance ? [finance] : [],
        },
      },
    }
    sources.set(sample, hit)
  }
  return hit
}

/** Some dataset is the sample's (only then do the sample company's lists apply). */
export const anySample = (kinds: SourceKinds): boolean =>
  Object.values(kinds).some((s) => s?.kind === 'sample')

/** The sample company's list source while some dataset is the sample, else null. */
export function sampleListSource(kinds: SourceKinds): SampleSource | null {
  return anySample(kinds) ? sampleListSourceOf(cachedSample()) : null
}

const byContext = new WeakMap<object, EffectiveLists>()

/** `buildContext` records the lists it held the scope with, so readers of the context use the same. */
export function setContextLists(ctx: object, lists: EffectiveLists): void {
  byContext.set(ctx, lists)
}

/** The lists a context was built with (src/data/context.tsx), or null for a context built elsewhere. */
export const contextLists = (ctx: object): EffectiveLists | null => byContext.get(ctx) ?? null

/** The lists in force over this data: the saved ones (none: `EMPTY_LISTS`) as `effectiveLists` reads them. */
export function listsInForce(
  saved: ListsState | null | undefined,
  all: Datasets,
  kinds: SourceKinds,
): EffectiveLists {
  return effectiveLists(saved ?? EMPTY_LISTS, all, kinds, sampleListSource(kinds))
}
