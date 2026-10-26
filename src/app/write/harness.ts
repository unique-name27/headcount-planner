/**
 * The write path without React (docs/PLAN.md 16, M3 "end-to-end flows through the models"; M3
 * freeze): a MemoryStore, a clock and a way to build the analytics context over a plan state, so a
 * scenario test walks a flow as the app runs it (draft, submit, approve in each Acting as, lock ...)
 * and reads every model in between. Each `run` goes through ./run.ts `runAction` exactly as
 * `usePlanWrite` does, so what the store holds after a run is what the app would save. Test and
 * model code only: the app never imports it.
 *
 * Readings taken here (core, M3): with `sample` given the store starts with, and keeps,
 * `storedFor(plan, sample)` (the overlay against the sample's baseline), and every context reads
 * `planInForce(stored, sample)`, as the app's provider does; the store's own `lockVersion` computes
 * its lock over the last context built. The store gives the workspace the request ID tag `idTag`
 * (HARNESS_ID_TAG when not given, D-ID), so a scenario's new request IDs are 'R-TEST-<n>' and
 * stable from run to run; two harnesses given different tags stand for two browsers.
 *
 * Frozen in the M3 freeze (docs/CONTRACTS-M3.md); the core builder fills the body.
 */
import type { AnalyticsContext } from '@/data/context'
import type { ISODateTime } from '@/data/schema'
import { sha256 } from '@/lib/sha256'
import type { ActionInput, ActionName } from '@/plan/actions'
import { MemoryStore } from '@/plan/store/memoryStore'
import type { AuditEntry, PlanState } from '@/plan/types'
import { planInForce, storedFor } from '../planState'
import { lockContentOf } from './lock'
import { runAction, type WriteOutcome } from './run'

/** The request ID tag a harness's workspace numbers under when the test gives none (D-ID). */
export const HARNESS_ID_TAG = 'TEST'

/**
 * The request ID secret a harness's workspace keys its numbers with when the test gives none (M3
 * recheck): fixed for a tag, so a scenario's IDs are stable from run to run, and another tag (another
 * browser) has another secret.
 */
export const harnessIdSecret = (tag: string): string => sha256(`harness id secret\u0000${tag}`).slice(0, 32)

export interface WriteHarnessInput {
  /** The plan state the store starts with (the sample's, a copy). */
  initial: PlanState
  audit?: readonly AuditEntry[]
  /**
   * The analytics context over a plan state and audit log, in the mode and Acting as the harness is
   * for (tests: src/testkit/sample.ts `sampleCtx` or `ctxAs` with the plan swapped in).
   */
  contextOf(plan: PlanState, audit: readonly AuditEntry[]): AnalyticsContext
  /** The clock; pinned in tests. */
  now(): ISODateTime
  /** The sample's plan, when the store holds an overlay against it; null otherwise. */
  sample?: PlanState | null
  /** Act as a reader tab. */
  readOnly?: boolean
  /** The workspace's request ID tag (HARNESS_ID_TAG when not given). */
  idTag?: string
  /** The workspace's request ID secret (`harnessIdSecret(idTag)` when not given). */
  idSecret?: string
}

export interface WriteHarness {
  store: MemoryStore
  /** The context over the store's current state and log. */
  ctx(): Promise<AnalyticsContext>
  run<N extends ActionName>(name: N, input: ActionInput<N>): Promise<WriteOutcome>
  /** The same store, read through another mode or Acting as person (`contextOf` for that view). */
  as(contextOf: WriteHarnessInput['contextOf']): WriteHarness
}

/** A harness over a fresh MemoryStore (see the module comment). */
export function writeHarness(input: WriteHarnessInput): WriteHarness {
  const sample = input.sample ?? null
  let last: AnalyticsContext | null = null
  const store = new MemoryStore({
    initial: storedFor(input.initial, sample),
    ...(input.audit ? { audit: input.audit } : {}),
    ...(input.readOnly ? { readOnly: true } : {}),
    idTag: input.idTag ?? HARNESS_ID_TAG,
    idSecret: input.idSecret ?? harnessIdSecret(input.idTag ?? HARNESS_ID_TAG),
    deps: {
      now: input.now,
      computeLock: (working, at) => {
        if (!last) throw new Error('Build a context before locking a version.')
        return lockContentOf(last, working, at)
      },
    },
  })
  const over = (contextOf: WriteHarnessInput['contextOf']): WriteHarness => {
    const ctx = async (): Promise<AnalyticsContext> => {
      const stored = await store.load()
      const audit = await store.listAudit()
      const plan = sample ? planInForce(stored, sample) : stored
      last = contextOf(plan, audit)
      return last
    }
    return {
      store,
      ctx,
      async run(name, actionInput) {
        const c = await ctx()
        return runAction({ store, ctx: c, sample, now: input.now }, name, actionInput)
      },
      as: (other) => over(other),
    }
  }
  return over(input.contextOf)
}
