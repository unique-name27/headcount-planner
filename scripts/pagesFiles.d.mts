/** Types for scripts/pagesFiles.mjs (what `npm run deploy` publishes to GitHub Pages). */

export interface PagesFile {
  /** The project file, relative to the root; null for an empty file. */
  from: string | null
  /** Where it goes on gh-pages. */
  to: string
}

export declare function pagesFiles(): PagesFile[]
