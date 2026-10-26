/** Types for scripts/trackedFiles.mjs (the data-file gate `npm run verify` runs first). */

export declare const DATA_FILE: RegExp
export declare const SAMPLE_DIR: 'src/data/sample/'

/** The paths (relative to the project root, either slash) that must not be in the repo. */
export declare function strayDataFiles(paths: readonly string[]): string[]
