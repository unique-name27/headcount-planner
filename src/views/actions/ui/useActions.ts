/**
 * The Action center for the current analytics context, with this browser's marks applied (the
 * template app's useCollected.ts): `useActions()` is the one split every reader uses (the page, the
 * homes' Needs attention and My team): every view's items collected once per context
 * (`collectionOf`, cached), then the mode's Needs attention and Waiting on others over the items open
 * in this browser (`actionsModel`). `useOpenActionCount()` is the masthead's number from it.
 *
 * HCP collects on the spot: every view's items come from its cached model, so a cold collection on
 * the sample stays well inside one frame budget (`collect.perf.test.ts`).
 */
import { useMemo } from 'react'
import { useAnalytics } from '@/data/context'
import { VIEWS } from '@/views/registry'
import { type ActionsModel, actionsModel, isOpen, type OpenAction, type ViewSource } from '../engine'
import { useActionMarks, useNow } from './store'

/** Every view; the collection keeps the ones with `actions`, so every caller shares one run. */
export const SOURCES: readonly ViewSource[] = VIEWS

/** The mode's Action center over the items open in this browser. */
export function useActions(): ActionsModel {
  const ctx = useAnalytics()
  const marks = useActionMarks((s) => s.marks)
  const now = useNow()
  return useMemo(
    () => actionsModel(ctx, SOURCES, (a: OpenAction) => isOpen(a, marks, now)),
    [ctx, marks, now],
  )
}

/** The masthead button's number: Needs attention in a role mode, every open item in HR admin. */
export function useOpenActionCount(only?: 'critical'): number {
  const m = useActions()
  return only ? m.critical : m.count
}
