/**
 * The folder-tab views (docs/PLAN.md 9.1), in tab order: Home, My team, Plan, Requests, Forecast,
 * Targets, What if, Finance. The masthead pages (Data room, Action center, Audit) are not ViewDefs.
 * Each mode shows its own subset (`visibleViews`), and My team is a folder tab in Manager mode only.
 *
 * This module imports every view, so no view, home or the access policy imports it (the import
 * rules, src/ship/imports.test.ts): the Action center is handed the views as `ViewSource`s.
 *
 * Frozen in the M2 freeze (docs/CONTRACTS-M2.md); built (the template app's, with HCP's views).
 */
import type { AnalyticsContext } from '@/data/context'
import type { ViewKey } from '@/data/schema'
import { view as finance } from './finance'
import { view as forecast } from './forecast'
import { view as home } from './home'
import { view as plan } from './plan'
import { view as requests } from './requests'
import { view as targets } from './targets'
import { view as team } from './team'
import { type ViewDef, withAccessTabs } from './types'
import { view as whatif } from './whatif'

export const VIEWS: ViewDef[] = [home, team, plan, requests, forecast, targets, whatif, finance]
export const viewByKey: ReadonlyMap<ViewKey, ViewDef> = new Map(VIEWS.map((v) => [v.key, v]))

type ViewAccess = Pick<AnalyticsContext['access'], 'can' | 'mode'>

/** The views a mode shows (`view:<key>`), each with only its shown tabs (`tab:<view>.<tab>`). */
export function visibleViews(access: ViewAccess): ViewDef[] {
  return VIEWS.filter((v) => access.can(`view:${v.key}`)).map((v) => withAccessTabs(v, access))
}

/** The folder tabs a mode shows: its visible views, with My team in Manager mode only. */
export function folderViews(access: ViewAccess): ViewDef[] {
  return visibleViews(access).filter((v) => v.key !== 'team' || access.mode === 'manager')
}
