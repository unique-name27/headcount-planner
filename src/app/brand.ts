/**
 * The app's names, in one place (docs/PLAN.md 3.1 and 3.3). Code reads these instead of writing the
 * name, the slug or a DOM id again. Storage keys are the exception: write them as literals
 * ('hcp:mode', `hcp:dataset:${key}`) so the source scan in src/ship/storageKeys.test.ts finds them,
 * and list each in src/app/storageKeys.ts. scripts/brand.mjs repeats APP_NAME, APP_SLUG and
 * ONE_FILE for the scripts; src/ship/brand.test.ts keeps the two equal.
 */

/** The name people see: the wordmark, the page title, help, export headers and file headers. */
export const APP_NAME = 'Headcount Planner'

/** The repo, file and IndexedDB name. */
export const APP_SLUG = 'headcount-planner'

/** The one-file build (git-ignored; `npm run deploy` publishes it, the README says download it). */
export const ONE_FILE = `${APP_SLUG}.html`

/** Every localStorage and IndexedDB key, and every User Timing name, starts with this. */
export const STORAGE_PREFIX = 'hcp:'

/** The app's own IndexedDB database and object store, opened only by src/data/idb.ts. */
export const IDB_DB = APP_SLUG
export const IDB_STORE = 'kv'

/** The BroadcastChannel the tabs of this app talk on (src/data/tabSync.ts). */
export const TAB_CHANNEL = APP_SLUG

/** The Web Lock held for its life by the one tab that may write (src/data/tabSync.ts). */
export const WRITER_LOCK = 'hcp:writer'

/** The key that marks the app's own history entries (`history.state[HISTORY_MARK]`). */
export const HISTORY_MARK = 'hcp'

/** DOM ids the shell renders and the skip link, tours and tests point at. */
export const DOM_IDS = {
  main: 'hcp-main',
  view: 'hcp-view',
  viewBody: 'hcp-view-body',
} as const

/** The first part of every exported file name: headcount-planner-plan-overview-2026-09-30.xlsx. */
export const FILE_PREFIX = APP_SLUG

/** The live site (GitHub Pages). */
export const LIVE_URL = 'https://unique-name27.github.io/headcount-planner/'
