/**
 * Running an action (docs/PLAN.md 5.4, 8.3, 10.7; M3 freeze): the one place plan state is written.
 * `runAction` refuses in a reader tab before anything else (READ_ONLY_NOTE, the masthead's "Read
 * only: Headcount Planner is open in another tab."), builds the action context from the analytics
 * context (./context.ts `actionContextOf`), runs the action by name over the plan in force
 * (`ctx.plan`), and on success:
 *  1. saves `next` and appends each audit draft in order as ONE store write (`PlanStore.commit`, M3
 *     review IN-5): on the sample only what differs from the sample's own plan (src/app/planState.ts
 *     `storedFor`, the overlay against `baselineId`); the store numbers and chains the entries; `by`
 *     is the Acting as person the action wrote. A Full Replace's verified log (`replaceAudit`, C35)
 *     goes into the same write, before the drafts. The state keeps the request ID tag its IDs were
 *     made under (D-ID);
 *  2. replaces the datasets a Full Replace brings (`replaceDatasets`, the data store's own write);
 *  3. re-reads the store into `usePlan` (`reload`), so the provider rebuilds the analytics context
 *     and every model re-renders from the new plan state.
 * On the sample, a stored state made on an earlier build of the sample (`aside`, lead browser finding
 * B9) is kept with its audit log at `hcp:plan-aside:<baseline id>` (src/app/planState.ts
 * `keepAside`) before the commit, and the commit starts this sample's audit log afresh
 * (`replaceAudit: []`), so nothing of the earlier sample is mixed into the new one and nothing of
 * it is lost.
 * A store write that rejects (a reader tab, an entry that cannot be stored) comes back as a refusal
 * with the store's message, and nothing of it is stored. Nothing here decides privacy or policy: the
 * action does.
 *
 * Readings taken here (core, M3): a Full Replace that brings datasets is stored as plan state of its
 * own (no sample overlay), since its datasets are no longer the sample's; an action that throws (an
 * engine's refusal written as an error) comes back as a refusal with its message.
 *
 * Frozen in the M3 freeze (docs/CONTRACTS-M3.md); the core builder fills the bodies.
 */
import type { AnalyticsContext } from '@/data/context'
import type { Datasets, ISODateTime } from '@/data/schema'
import { type ActionInput, type ActionName, type ActionResult, runActionByName } from '@/plan/actions'
import { emptyPlanState } from '@/plan/store/memoryStore'
import { type PlanStore, READ_ONLY_NOTE } from '@/plan/store/types'
import type { PlanState } from '@/plan/types'
import { keepAside, type SetAside, storedFor } from '../planState'
import { actionContextOf } from './context'

/** What the caller (a view, a test) learns: the notice to show, or the refusal. */
export type WriteOutcome = { ok: true; notice: string } | { ok: false; refused: string }

export interface WriteDeps {
  store: PlanStore
  /** The analytics context the action reads (the provider's, in the mode and Acting as shown). */
  ctx: AnalyticsContext
  /** The sample's plan when every dataset is the sample (the overlay's baseline), else null. */
  sample: PlanState | null
  /** The write path's clock; tests pin it. */
  now(): ISODateTime
  /** The data store's dataset replace, for a Full workspace Replace; refuses in a reader tab. */
  replaceDatasets?(datasets: Partial<Datasets>): Promise<void>
  /** Re-reads the store into `usePlan` after a write (src/app/planState.ts `reloadPlan`). */
  reload?(): Promise<void>
  /**
   * The stored state set aside on the sample (src/app/planState.ts `setAsideOf`: stored against an
   * earlier build of the sample), or null; kept at `hcp:plan-aside` before this write replaces it.
   */
  aside?(): SetAside | null
  /** Where a set-aside state is kept; `keepAside` (IndexedDB) when not given. */
  keepAside?(aside: SetAside, at: ISODateTime): Promise<void>
}

const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e))

/** Runs one action and saves what it returns (see the module comment). Never rejects. */
export async function runAction<N extends ActionName>(
  deps: WriteDeps,
  name: N,
  input: ActionInput<N>,
): Promise<WriteOutcome> {
  try {
    if (deps.store.readOnly) return { ok: false, refused: READ_ONLY_NOTE }
    const ctx = actionContextOf(deps.ctx, { readOnly: deps.store.readOnly, at: deps.now() })
    const state = deps.ctx.plan ?? emptyPlanState(deps.sample?.baselineId ?? null)
    const result = runActionByName(name, state, ctx, input)
    // The state keeps the tag and secret the action's new IDs were made under (src/app/write/context.ts `idsOf`).
    const keep = result.ok
      ? {
          ...(state.idTag && !result.next.idTag ? { idTag: state.idTag } : {}),
          ...(state.idSecret && !result.next.idSecret ? { idSecret: state.idSecret } : {}),
        }
      : {}
    const tagged =
      result.ok && Object.keys(keep).length ? { ...result, next: { ...result.next, ...keep } } : result
    return await saveResult(deps, tagged)
  } catch (e) {
    return { ok: false, refused: messageOf(e) }
  }
}

/** Steps 1 to 3 for a result already computed (a refusal passes through untouched). Never rejects. */
export async function saveResult(deps: WriteDeps, result: ActionResult): Promise<WriteOutcome> {
  if (!result.ok) return { ok: false, refused: result.refused }
  if (deps.store.readOnly) return { ok: false, refused: READ_ONLY_NOTE }
  try {
    const sample = result.datasets && Object.keys(result.datasets).length ? null : deps.sample
    // A state made on an earlier sample is kept aside first, and this sample's log starts afresh (B9).
    const aside = sample ? (deps.aside?.() ?? null) : null
    if (aside) await (deps.keepAside ?? keepAside)(aside, deps.now())
    await deps.store.commit(
      storedFor(result.next, sample),
      result.audit,
      result.replaceAudit ? { replaceAudit: result.replaceAudit } : aside ? { replaceAudit: [] } : {},
    )
    if (result.datasets && deps.replaceDatasets) await deps.replaceDatasets(result.datasets)
    await deps.reload?.()
    return { ok: true, notice: result.notice }
  } catch (e) {
    return { ok: false, refused: messageOf(e) }
  }
}
