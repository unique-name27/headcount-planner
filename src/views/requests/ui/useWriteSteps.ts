/**
 * Several writes in a row, each on the context the one before it left (docs/PLAN.md 5.4; M3): "Submit"
 * on Requests > New saves the draft, adds the freeze exception when the org is frozen, then submits
 * it, and each of those is one action through the app's write hook (`usePlanWrite().run`). The hook's
 * `run` reads the analytics context of the render it came from, and a write rebuilds that context
 * (src/app/write/run.ts reloads the plan), so the next step waits until the hook comes back with a new
 * context before it runs; it never runs on the context the last write made stale.
 *
 * The steps run in order and stop at the first refusal; the last notice (or the refusal) is shown in
 * a toast and handed to `onDone`. Nothing here writes on its own: every step is a `run` call.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { WriteOutcome } from '@/app/write/run'
import { type PlanWrite, usePlanWrite } from '@/app/write/usePlanWrite'
import { toast } from '@/components/toast'
import { requestIdInText } from '@/plan/actions/requestIds'

/** One step: the write to run on the current context, given the outcome before it; null skips it. */
export type WriteStep = (write: PlanWrite, last: WriteOutcome | null) => Promise<WriteOutcome> | null

interface Queue {
  steps: readonly WriteStep[]
  last: WriteOutcome | null
  /** The hook the last step ran on: the next waits for a newer one. */
  ranOn: PlanWrite | null
}

/**
 * The request ID a notice names ("Draft R-1128 saved.", "Draft R-K7QM-13716 saved."), or null: either
 * form, as src/plan/actions/requestIds.ts `requestIdInText` reads it (a new ID is tagged, D-ID).
 */
export const requestIdIn = (notice: string): string | null => requestIdInText(notice)

export function useWriteSteps(onDone?: (out: WriteOutcome) => void) {
  const write = usePlanWrite()
  const [queue, setQueue] = useState<Queue | null>(null)
  const busy = useRef(false)
  const done = useRef(onDone)
  done.current = onDone

  const finish = useCallback((out: WriteOutcome) => {
    setQueue(null)
    toast(out.ok ? out.notice : out.refused, { tone: out.ok ? 'good' : 'critical' })
    done.current?.(out)
  }, [])

  useEffect(() => {
    if (!queue || busy.current) return
    // The step after a write runs on the context that write made.
    if (queue.ranOn && queue.ranOn === write) {
      const t = window.setTimeout(() => setQueue((q) => (q ? { ...q, ranOn: null } : q)), 1500)
      return () => window.clearTimeout(t)
    }
    const [first, ...rest] = queue.steps
    if (!first) {
      if (queue.last) finish(queue.last)
      else setQueue(null)
      return
    }
    const p = first(write, queue.last)
    if (!p) {
      setQueue({ steps: rest, last: queue.last, ranOn: queue.ranOn })
      return
    }
    busy.current = true
    void p.then((out) => {
      busy.current = false
      if (!out.ok || !rest.length) finish(out)
      else setQueue({ steps: rest, last: out, ranOn: write })
    })
  }, [queue, write, finish])

  const run = useCallback((steps: readonly WriteStep[]) => {
    if (busy.current) return
    setQueue({ steps, last: null, ranOn: null })
  }, [])

  return { write, run, busy: queue != null }
}
