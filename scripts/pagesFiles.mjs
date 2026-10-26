// What `npm run deploy` publishes to GitHub Pages (scripts/deploy-pages.mjs), kept pure so a test
// can check it (src/ship/deployPages.test.ts):
//   headcount-planner.html -> index.html and headcount-planner.html (the one-file build)
//   .nojekyll              (empty: serve files as they are)
// Phase 1 publishes nothing else: no policy file and no relay file.
import { ONE_FILE } from './brand.mjs'

/**
 * The files to publish, as { from, to } (`from` relative to the project root, null for an empty
 * file; `to` relative to the gh-pages root).
 */
export function pagesFiles() {
  return [
    { from: ONE_FILE, to: 'index.html' },
    { from: ONE_FILE, to: ONE_FILE },
    { from: null, to: '.nojekyll' },
  ]
}
