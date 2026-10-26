/**
 * The Data room (`#data`; docs/PLAN.md 9.1): HR admin's home, a masthead page, not a folder-tab view.
 * The shell mounts `Page` (src/app/pages.tsx) inside its error boundary, figure registry and
 * current-view context; the page draws its own header and tabs. Every tab follows `page:data`.
 */
import { DataRoom } from './ui/DataRoom'

export { DataRoom }

/** The page's body, as src/app/pages.tsx mounts it. */
export const Page = DataRoom
