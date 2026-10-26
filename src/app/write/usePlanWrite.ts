/**
 * The write path as a hook (docs/PLAN.md 5.4, 8.3; M3 freeze): what every view's button calls. It
 * reads the analytics context the view renders (`useAnalytics`), the page's PlanStore
 * (src/app/boot.ts `appPlanStore`), the write lock (the store's `readOnly`, followed with the data
 * store's `readOnly` so the masthead and the buttons change together) and the sample baseline, and
 * runs actions through ./run.ts `runAction`. After a write the provider rebuilds the context, so the
 * view's model re-renders without asking.
 *
 * - `blocked`: READ_ONLY_NOTE in a reader tab, else the Acting as block ("Pick who you act as before
 *   making changes."), else null. A view shows it beside a disabled button.
 * - `can(name)`: not blocked and the action's first id (ACTION_CHECKS) not hidden in the mode: the
 *   button shows. A limited id shows the button; the action's own rule refuses with a reason.
 * - `run(name, input)`: the outcome; the view shows `notice` or `refused` in a toast (the hook shows
 *   nothing itself, so a dialog can keep a refusal beside its field).
 *
 * Frozen in the M3 freeze (docs/CONTRACTS-M3.md); the core builder fills the body.
 */
import { useCallback, useMemo } from 'react'
import { writeBlock } from '@/access/context'
import { useAnalytics } from '@/data/context'
import { DATASET_KEYS, type DatasetKey, type Datasets } from '@/data/schema'
import { onSample, useStore } from '@/data/store'
import { ACTION_CHECKS, type ActionInput, type ActionName, actionSurface } from '@/plan/actions'
import { READ_ONLY_NOTE } from '@/plan/store/types'
import { appPlanStore, samplePlan } from '../boot'
import { reloadPlan, setAsideOf, usePlan } from '../planState'
import { runAction, type WriteOutcome } from './run'

export interface PlanWrite {
  readOnly: boolean
  blocked: string | null
  can(name: ActionName): boolean
  run<N extends ActionName>(name: N, input: ActionInput<N>): Promise<WriteOutcome>
}

/** A Full workspace Replace's datasets, through the data store's own write (it refuses in a reader tab). */
async function replaceDatasets(datasets: Partial<Datasets>): Promise<void> {
  const replace = useStore.getState().replaceDataset
  for (const key of DATASET_KEYS as DatasetKey[]) {
    const rows = datasets[key]
    if (rows) await replace(key, rows as Datasets[typeof key], { fileName: 'Workspace file' })
  }
}

/** The write path for the view's context (see the module comment). */
export function usePlanWrite(): PlanWrite {
  const ctx = useAnalytics()
  const dataReadOnly = useStore((s) => s.readOnly)
  const sampleOn = useStore((s) => onSample(s.sources))
  const store = appPlanStore()
  const readOnly = dataReadOnly || store.readOnly
  const blocked = readOnly ? READ_ONLY_NOTE : writeBlock(ctx.access)
  const can = useCallback(
    (name: ActionName) => !blocked && ctx.access.can(actionSurface(ACTION_CHECKS[name][0])),
    [blocked, ctx],
  )
  const run = useCallback(
    <N extends ActionName>(name: N, input: ActionInput<N>): Promise<WriteOutcome> =>
      runAction(
        {
          store,
          ctx,
          sample: sampleOn ? samplePlan() : null,
          now: () => new Date().toISOString(),
          replaceDatasets,
          reload: () => reloadPlan(store),
          aside: () => {
            const p = usePlan.getState()
            return setAsideOf(p.stored, p.audit, sampleOn ? samplePlan() : null)
          },
        },
        name,
        input,
      ),
    [ctx, sampleOn, store],
  )
  return useMemo(() => ({ readOnly, blocked, can, run }), [readOnly, blocked, can, run])
}
