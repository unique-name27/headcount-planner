/**
 * Forecast (docs/PLAN.md 9.1 and 9.4): Overview, Variance and Bridge. It raises no Action center
 * items (9.6).
 *
 * Frozen in the M2 freeze (docs/CONTRACTS-M2.md): the key, label, tabs and datasets are data; the
 * views-1 builder filled `View` with the tab components (`ui/`).
 */
import { Button, EmptyState, goTo } from '@/components'
import { useRouteShown } from '@/components/RouteLink'
import { useAnalytics } from '@/data/context'
import type { ViewDef } from '../types'
import { forecastHeadline } from './engine'
import { Bridge } from './ui/Bridge'
import { useForecast } from './ui/model'
import { Overview } from './ui/Overview'
import { Variance } from './ui/Variance'

function Body({ tab }: { tab: string }) {
  const m = useForecast()
  switch (tab) {
    case 'variance':
      return <Variance m={m} />
    case 'bridge':
      return <Bridge m={m} />
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
        title="Load Positions to see the forecast"
        body="The forecast starts from the positions and who holds them, then projects starts, exits and backfills month by month with the version's drivers."
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
            : 'Widen the filters above to see the forecast.'
        }
      />
    )
  }
  return <Body tab={tab} />
}

export const view: ViewDef = {
  key: 'forecast',
  label: 'Forecast',
  tabs: [
    { key: 'overview', label: 'Overview' },
    { key: 'variance', label: 'Variance' },
    { key: 'bridge', label: 'Bridge' },
  ],
  View,
  headline: forecastHeadline,
  datasets: ['positions', 'workers', 'comp', 'reqs', 'assumptions', 'freezes'],
}
