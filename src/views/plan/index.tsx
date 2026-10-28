/**
 * Plan (docs/PLAN.md 9.1 and 9.4): Overview, Positions, Openings, Hiring (9.7, change C36),
 * Recruiting summary (9.8, change C38) and Transfers for the scope and the version shown, against the comparison. From M3 an HRBP (and HR admin) changes Open and Planned
 * seats in Working on Positions (`SeatEdit`) and processes transfers on Transfers (`TransferForm`),
 * each through the write hook.
 *
 * Frozen in the M2 freeze (docs/CONTRACTS-M2.md): the key, label, tabs and datasets are data; the
 * views-1 builder filled `View` with the tab components (`ui/`). The view prices seats, so it also
 * gives the position card its standard heads (src/drill/position.ts `setPositionFacts`).
 */
import { Button, EmptyState, goTo } from '@/components'
import { useRouteShown } from '@/components/RouteLink'
import type { AnalyticsContext } from '@/data/context'
import { useAnalytics } from '@/data/context'
import { setPositionFacts } from '@/drill/position'
import type { ViewDef } from '../types'
import { planHeadline } from './engine'
import { planActions } from './engine/actions'
import { positionOf } from './engine/core'
import { pricingOf } from './engine/pricing'
import { Hiring } from './ui/Hiring'
import { usePlan } from './ui/model'
import { Openings } from './ui/Openings'
import { Overview } from './ui/Overview'
import { Positions } from './ui/Positions'
import { Recruiting } from './ui/Recruiting'
import { Transfers } from './ui/Transfers'

// The position card's standard heads: the seat's weight at the trade rates of the shown version's year.
setPositionFacts((cardCtx, positionId) => {
  const ctx = cardCtx as Partial<AnalyticsContext>
  if (!ctx.version || !ctx.versions || !ctx.all || !ctx.positionIndex) return null
  const full = ctx as AnalyticsContext
  const pos = positionOf(full, positionId)
  return pos
    ? { standardHeads: pricingOf(full, full.version as NonNullable<AnalyticsContext['version']>).weight(pos) }
    : null
})

function Body({ tab }: { tab: string }) {
  const m = usePlan()
  switch (tab) {
    case 'positions':
      return <Positions m={m} />
    case 'openings':
      return <Openings m={m} />
    case 'hiring':
      // Its own model (src/views/plan/engine/hiringTab.ts), read inside the tab.
      return <Hiring />
    case 'recruiting':
      // Its own model too (src/views/plan/engine/recruitingTab.ts, 9.8).
      return <Recruiting />
    case 'transfers':
      return <Transfers m={m} />
    default:
      return <Overview m={m} />
  }
}

function View({ tab }: { tab: string }) {
  const ctx = useAnalytics()
  const dataRoom = useRouteShown('data')
  if (!ctx.all.positions.length) {
    return (
      <EmptyState
        title="Load Positions to see the plan"
        body="The plan reads positions with their status, org and start dates. Workers, comp and reqs add who holds each seat, its cost and its hiring."
        action={
          dataRoom && (
            <Button variant="primary" size="sm" onClick={() => goTo('data')}>
              Open the Data room
            </Button>
          )
        }
      />
    )
  }
  if (!ctx.data.positions.length) {
    return (
      <EmptyState
        title={ctx.access.unset ? 'Pick who you are acting as' : 'No positions match these filters'}
        body={
          ctx.access.unset
            ? 'This mode shows the scope of the person you act as. Pick them in the masthead.'
            : 'Widen the filters above to see the plan. The leader, unit, department, location and level filters all narrow the positions.'
        }
      />
    )
  }
  return <Body tab={tab} />
}

export const view: ViewDef = {
  key: 'plan',
  label: 'Plan',
  tabs: [
    { key: 'overview', label: 'Overview' },
    { key: 'positions', label: 'Positions' },
    { key: 'openings', label: 'Openings' },
    { key: 'hiring', label: 'Hiring' },
    { key: 'recruiting', label: 'Recruiting summary' },
    { key: 'transfers', label: 'Transfers' },
  ],
  View,
  headline: planHeadline,
  datasets: ['positions', 'workers', 'comp', 'reqs', 'assumptions', 'freezes'],
  actions: planActions,
}
