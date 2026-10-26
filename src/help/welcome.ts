/**
 * The welcome line each mode's home carries on a first visit (the template app's help/welcome.ts,
 * with HCP's homes): which page has one in which mode, its words and the tour it starts. Pure, so a
 * test checks every mode; `ui/WelcomeCard.tsx` draws it and the shell places it on the home.
 *
 *  - HR admin, on the Data room (`admin`): "New to Headcount Planner?" and "Take the 2-minute tour"
 *    (`getting-started`).
 *  - Manager, on My team (`team`): "New to My team?" and "Take the 1-minute tour" (`home-start`).
 *  - HRBP, Leader and Finance, on Home (`home`): "New to HRBP mode?" and "Take the 1-minute tour"
 *    (`home-start`).
 *
 * Each mode has exactly one line, on the page `HOME_OF` opens it on, and it starts the mode's own
 * first tour (`homeTourOf`).
 */
import { HOME_OF, MODE_NAME, type Mode } from '@/access/modes'
import { APP_NAME } from '@/app/brand'
import { homeTourOf } from './access'
import type { WelcomeLine } from './store'

export const GETTING_STARTED = 'getting-started'
export const HOME_START = 'home-start'
export const REQUESTS_START = 'requests-start'
export const OWN_DATA = 'own-data'

/** Where a welcome line sits: the Data room (HR admin), My team (Manager) or Home (the role modes). */
export type WelcomeVariant = 'admin' | 'team' | 'home'

/** A welcome line's words and tour. */
export interface WelcomeCopy {
  line: WelcomeLine
  title: string
  take: string
  tour: string
}

/** The variant of the page a mode opens on, or null when its home carries no welcome line. */
export function welcomeVariantOf(mode: Mode): WelcomeVariant | null {
  const home = HOME_OF[mode]
  if (home === 'data') return 'admin'
  if (home === 'team') return 'team'
  if (home === 'home') return 'home'
  return null
}

/**
 * The line a page shows, read against the live mode (the Mode button's): a page drawn in another
 * mode than the live one (an off-screen whole-view export) shows none. `pageMode` is the mode the
 * page is drawn in (undefined outside the analytics provider: the live mode).
 */
export function welcomeFor(
  variant: WelcomeVariant,
  pageMode: Mode | undefined,
  liveMode: Mode,
): WelcomeCopy | null {
  if (pageMode && pageMode !== liveMode) return null
  return welcomeCopy(variant, liveMode)
}

/** The line's words and tour for a mode, or null where that page has no welcome line in the mode. */
export function welcomeCopy(variant: WelcomeVariant, mode: Mode | undefined): WelcomeCopy | null {
  if (!mode || welcomeVariantOf(mode) !== variant) return null
  const tour = homeTourOf(mode)
  if (variant === 'admin')
    return { line: mode, title: `New to ${APP_NAME}?`, take: 'Take the 2-minute tour', tour }
  if (variant === 'team')
    return { line: mode, title: 'New to My team?', take: 'Take the 1-minute tour', tour }
  return { line: mode, title: `New to ${MODE_NAME[mode]} mode?`, take: 'Take the 1-minute tour', tour }
}
