/**
 * Home (docs/PLAN.md 9.3): the role home of the mode on screen, Unit plan (HRBP), Rollup vs target
 * (Leader) or Plan vs actual (Finance). Manager mode's home is My team and HR admin's the Data room;
 * the policy hides this view in both. It has no `actions` (it composes other views' numbers, so the
 * Action center must not count them twice).
 *
 * Frozen in the M2 freeze (docs/CONTRACTS-M2.md): the key, label, tabs, datasets, `title` and
 * `figureless` are data and plain wiring; the views-4 builder filled `View` (`ui/HomePage.tsx`).
 */
import { DATASET_KEYS } from '@/data/schema'
import type { ViewDef } from '../types'
import { homeHeadline, homeTitle } from './engine'
import { SLUG_OF } from './engine/figures'
import { HomePage } from './ui/HomePage'

function View(_props: { tab: string }) {
  return <HomePage />
}

export const view: ViewDef = {
  key: 'home',
  label: 'Home',
  title: (ctx) => homeTitle(ctx.access.mode),
  // A mode with no role home draws no figures here.
  figureless: (ctx) => !SLUG_OF[ctx.access.mode],
  tabs: [{ key: 'overview', label: 'Overview' }],
  View,
  headline: homeHeadline,
  datasets: [...DATASET_KEYS],
}
