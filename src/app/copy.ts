/**
 * The shell's own sentences (docs/PLAN.md 14.3): the Acting as picker's search, pinned filters, the
 * footer and the loading line. Sentence case, no "!", no em dash between words,
 * and none of `BANNED_MODE_WORDS` (src/app/copy.test.ts scans every string here). The modes' own
 * sentences (the picker's title, dek, foot and buttons, the "no pick" labels, the whole-scope
 * choices) live in src/access/copy.ts and are used from there.
 */

import { MODE_LABEL } from '@/access/modes'
import { APP_NAME } from '@/app/brand'
import type { Mode } from '@/data/schema'

/** The Acting as picker's search field (its label and placeholder) and its list's name. */
export const PICK_SEARCH: Readonly<Record<Mode, { search: string; list: string }>> = {
  manager: { search: 'Search managers', list: 'Managers' },
  hrbp: { search: 'Search HRBPs and units', list: 'HR business partners' },
  leader: { search: 'Search leaders', list: 'Leaders' },
  finance: { search: 'Search people', list: 'Finance people' },
  'hr-admin': { search: 'Search people', list: 'HR admins' },
}

/** The Mode menu's and Settings' line under the chosen mode: "Acting as Priya Raman". */
export const actingAsLine = (name: string): string => `Acting as ${name}`

/** The row tag for the sample's persona of a mode (docs/PLAN.md 13.3). */
export const PERSONA_TAG = 'Sample persona'
/** The row tag for a leader who sees the whole company. */
export const COMPANY_TAG = 'Whole company'

/** The tip on a filter a scoped mode keeps fixed. */
export const pinnedTip = (mode: Mode, scope: string): string =>
  `${MODE_LABEL[mode]} mode keeps ${APP_NAME} on ${scope}. Pick someone else from the Mode menu to change it.`

/** The footer's lines. */
export const FOOTER_LOCAL = 'Everything stays in this browser. Uploaded files are stored on this device only.'
export const footerSample = (company: string): string =>
  `${company} is a fictional company. Its people and numbers are generated.`

/** The first frame's status line. */
export const LOADING_LINE = 'Preparing the data. Nothing leaves this browser.'

/** A page another builder has not handed the shell yet. */
export const pageComing = (page: string): string => `${page} is not part of this build yet.`
