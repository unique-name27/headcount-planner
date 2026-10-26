/**
 * Action center (docs/PLAN.md 9.4 and 9.6): every open item from every view's `actions(ctx)`,
 * grouped by owner, with Copy note, Mark handled and Snooze (approval items: Snooze only). Reached
 * from the masthead's Actions button (route `#actions`), not a folder tab.
 *
 * The exports are the contract: `ActionCenter` (the page body; the shell renders the filter row above
 * it inside a figure registry), `useActions()` (the mode's Needs attention and Waiting on others over
 * the items open in this browser, for the homes and My team: one split for every reader) and
 * `useOpenActionCount()` (the masthead count). Views must not import this module from their own
 * `index.tsx`: it reads the view registry, which imports every view. They may import
 * `@/views/actions/engine` and `@/views/actions/metrics`.
 */
export { ActionCenter } from './ui/ActionCenter'
export { useActions, useOpenActionCount } from './ui/useActions'
