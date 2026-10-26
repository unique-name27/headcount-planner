// The app's names for the scripts (copy-single, pagesFiles, deploy-pages, verify). Scripts cannot
// import TypeScript, so these repeat src/app/brand.ts; src/ship/brand.test.ts keeps the two equal.

/** The name people see. */
export const APP_NAME = 'Headcount Planner'

/** The repo, file and IndexedDB name. */
export const APP_SLUG = 'headcount-planner'

/** The one-file build at the project root (git-ignored; `npm run deploy` publishes it). */
export const ONE_FILE = `${APP_SLUG}.html`
