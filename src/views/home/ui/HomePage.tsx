/**
 * The Home view's body (docs/PLAN.md 9.3): the role home of the mode on screen. A scoped mode waiting
 * for its pick shows only the empty state with its picker; while the context catches up with a mode
 * change the page holds one quiet frame rather than flash the previous mode's home; a mode with no
 * role home here (Manager mode opens My team, HR admin the Data room) says where its home is.
 */
import { PICKER_COPY } from '@/access/copy'
import { openPicker, useMode } from '@/access/store'
import { EmptyState, Grid, Pending } from '@/components'
import { Button } from '@/components/ui'
import { useAnalytics, useAnalyticsPending } from '@/data/context'
import { SLUG_OF } from '../engine/figures'
import { FinHome } from './FinHome'
import { useHome, useHomeItems } from './model'
import { RollupHome } from './RollupHome'
import { UnitHome } from './UnitHome'

export function HomePage() {
  const ctx = useAnalytics()
  const { access } = ctx
  const liveMode = useMode((s) => s.mode)
  const catchingUp = useAnalyticsPending()
  const home = useHome()
  const items = useHomeItems()
  if (catchingUp && liveMode !== access.mode)
    return (
      <Grid>
        <Pending title="Home" height={200} message="Switching mode." />
      </Grid>
    )
  const slug = SLUG_OF[access.mode]
  if (!slug)
    return (
      <Grid>
        <EmptyState
          title="Home is each role’s first page"
          body="HRBP, Leader and Finance mode open here, each on its own home: Unit plan, Rollup vs target and Plan vs actual. Switch to one with Mode to see it."
        />
      </Grid>
    )
  if (access.unset && (access.mode === 'hrbp' || access.mode === 'leader')) {
    const copy = PICKER_COPY[access.mode]
    return (
      <Grid>
        <EmptyState
          title={copy.title}
          body={copy.dek}
          action={
            <Button variant="primary" size="sm" onClick={() => openPicker(access.mode)}>
              {copy.title}
            </Button>
          }
        />
      </Grid>
    )
  }
  const model = home.model
  if (!model)
    return (
      <Grid>
        <EmptyState
          title="This home is not ready yet"
          body="Its numbers come from the Plan, Forecast, Targets, Requests and Finance views. Open one of them from the folder tabs."
        />
      </Grid>
    )
  if (model.slug === 'unit') return <UnitHome model={model} items={items} />
  if (model.slug === 'rollup') return <RollupHome model={model} items={items} />
  return <FinHome model={model} items={items} />
}
