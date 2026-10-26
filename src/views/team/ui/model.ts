/**
 * My team's model for the context on screen (one per context, cached by `teamModel`), and the mode's
 * Needs attention from the Action center's split (src/views/actions/engine `actionsModel`, over the
 * views that raise items, open in this browser by the Action center's marks, as on the role homes),
 * so the page, the masthead count and the Action center agree. The split is read in a try: until
 * every producing view can hand over its items, the section says so instead of failing the page.
 */
import { useMemo } from 'react'
import { useAnalytics } from '@/data/context'
import { actionsModel, type OpenAction } from '@/views/actions/engine'
import { ITEM_SOURCES } from '@/views/home/engine/sources'
import { type TeamModel, teamModel } from '../engine'
import { useOpenTest } from './marks'

export function useTeam(): TeamModel {
  const ctx = useAnalytics()
  return useMemo(() => teamModel(ctx), [ctx])
}

/** The mode's Needs attention items open in this browser, or null when they cannot be collected. */
export function useTeamNeeds(): readonly OpenAction[] | null {
  const ctx = useAnalytics()
  const open = useOpenTest()
  return useMemo(() => {
    try {
      return actionsModel(ctx, ITEM_SOURCES, open).needs
    } catch {
      return null
    }
  }, [ctx, open])
}
