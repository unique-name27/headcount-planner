/**
 * The role home's model for the context on screen (`homeModel`, cached per context), and the mode's
 * Needs attention and Waiting on others from the Action center's split (src/views/actions/engine
 * `actionsModel`, over the views that raise items, open in this browser by the Action center's marks,
 * ./marks.ts), so the home, the masthead count and the Action center agree. Both are read in a try:
 * until every producing view hands over its numbers or its items, the page says so in place instead
 * of failing.
 */
import { useMemo } from 'react'
import { useAnalytics } from '@/data/context'
import { actionsModel, type OpenAction } from '@/views/actions/engine'
import { type HomeModel, homeModel } from '../engine'
import { ITEM_SOURCES } from '../engine/sources'
import { useOpenTest } from './marks'

export interface HomeState {
  model: HomeModel | null
  /** The model could not be computed (a producing view is not ready): what to say instead. */
  failed: boolean
}

export function useHome(): HomeState {
  const ctx = useAnalytics()
  return useMemo(() => {
    try {
      return { model: homeModel(ctx), failed: false }
    } catch {
      return { model: null, failed: true }
    }
  }, [ctx])
}

export interface HomeItems {
  needs: readonly OpenAction[]
  waiting: readonly OpenAction[]
}

/** The mode's two lists over the items open in this browser, or null when the items cannot be collected. */
export function useHomeItems(): HomeItems | null {
  const ctx = useAnalytics()
  const open = useOpenTest()
  return useMemo(() => {
    try {
      const m = actionsModel(ctx, ITEM_SOURCES, open)
      return { needs: m.needs, waiting: m.waiting }
    } catch {
      return null
    }
  }, [ctx, open])
}
