// Data files never belong in the repo: real or exported workbooks, CSVs and workspace files. The
// synthetic sample lives in TypeScript under src/data/sample/, the one folder allowed to hold such
// a file. `npm run verify` runs this first, over what git tracks and over the untracked files
// .gitignore does not cover (scripts/verify.mjs). Pure, so src/ship/trackedFiles.test.ts checks it.

/** File names that hold people data, in any letter case. */
export const DATA_FILE = /\.(xlsx|xlsm|xls|csv|tsv)$|\.hcplan\.json$/i

/** The one folder allowed to hold such files (fixtures of the synthetic sample). */
export const SAMPLE_DIR = 'src/data/sample/'

/** The paths (relative to the project root, either slash) that must not be in the repo. */
export function strayDataFiles(paths) {
  return paths.filter((p) => DATA_FILE.test(p) && !p.replace(/\\/g, '/').startsWith(SAMPLE_DIR))
}
