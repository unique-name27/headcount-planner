# Census digest: stack, build and ship (for Headcount Planner)

Source repo: the Census repository (read only; `git status` clean before and after).
Target: a `headcount-planner` folder beside it (not created).
Paths below are relative to the Census root unless they start with `headcount-planner/`.
Machine facts: Node v24.14.1, npm 11.11.0, gh 2.90.0, git `core.autocrlf=false`, Windows 11.
`npx tsc --noEmit -p .` runs in about 3.5 s and `npx biome check src` in about 2 s on Census; both pass.

---

## 1. Inventory (every file read, one line each)

| File | Job |
|---|---|
| `headcount-planner-prompt.md` (196 lines) | HCP build spec (read in full). |
| `ARCHITECTURE.md` (422 lines, CRLF) | Build contract: views table, stack, commands, design language, privacy, data model, state, modes, Developer page, metric conventions, ownership, Figure/kit/export/components APIs, view pattern, Node crash note (lines 417-422). |
| `package.json` | name `census`, scripts (dev/build/build:single/preview/typecheck/test/lint/verify/build:artifact/deploy), 16 deps, 17 devDeps. |
| `package-lock.json` | lockfileVersion 3, 392 entries, root name `census`. Exact versions in section 2.1. |
| `vite.config.ts` (60 lines) | Plugins (react, babel + React Compiler preset, tailwind, singlefile in `--mode single`), `@` alias, `server.fs.deny`, build outDir per mode, Vitest config with `unit` and `perf` projects. |
| `tsconfig.json` | ES2023, bundler resolution, strict, noEmit, `paths: @/* -> ./src/*`, includes `src`, `ask-relay/*`, `vite.config.ts`. |
| `biome.json` | Biome 2 formatter (2 spaces, width 110, single quotes, no semicolons) and linter overrides; files `src/**`, `ask-relay/**`. |
| `index.html` | Root page: title "Census", description, inline SVG favicon, `#root`, `/src/main.tsx`. |
| `gallery.html` | Dev-only chart kit gallery (`/src/charts/__gallery__/main.tsx`), not a build input. |
| `.gitignore` | node_modules, dist, *.log, .DS_Store, dist-single, dist-artifact. No data-file rules. |
| `Launch Census.bat` | Opens `census.html` beside it in Edge/Chrome `--app` window, else default browser. |
| `.claude/launch.json` (committed) | Claude preview config: name `census`, `npm run dev`, port 8820. |
| `README.md` (119 lines) | User doc: online link, double-click census.html, dev/deploy commands, views, privacy, built-with. |
| `scripts/devServer.mjs` + `.d.mts` | `DEV_SERVER_DENY` list for `server.fs.deny` (Vite 8 list + Wrangler secrets). |
| `scripts/verify.mjs` | Quality gate: 5 shell steps run in sequence (all run even after a failure), PASS/FAIL table, exit code. |
| `scripts/copy-single.mjs` | Copies `dist-single/index.html` to `census.html` at the root. |
| `scripts/build-artifact.mjs` | Turns `dist-single/index.html` into a claude.ai artifact body `dist-artifact/census.html` (16 MB cap). |
| `scripts/deploy-pages.mjs` | Publishes the one-file build to `gh-pages` by force-pushing a fresh one-commit repo built in a temp dir. |
| `scripts/pagesFiles.mjs` + `.d.mts` | Pure list of files to publish, plus policy/relay file checks (Security center, Ask relay). |
| `src/main.tsx` | Applies saved theme before paint, starts the messy-sample loader, renders `<App/>` in StrictMode. |
| `src/app/App.tsx` (311 lines) | Shell: `App` (providers, loading gate), `Shell` (band, main, footer, route switch), `ViewPage`, `ActionsPage`, `DevRoute`, `Footer`. |
| `src/app/ErrorBoundary.tsx` | `ViewErrorBoundary` (class component, reset by key, "Try again"/"Reset filters", Developer-only details). |
| `src/app/useShell.ts` | `applyTheme`, `applyTextSize`, `applyMotion`, `useDisplaySettings`, `useHashRouting`. |
| `src/app/Loading.tsx` | `LoadingShell`: real band with blank tabs + `Pending` sheets at final size. |
| `src/app/Mark.tsx` | Logo mark (three bars); `working` animates bars with `motion/react`. |
| `src/app/Masthead.tsx` (top 400 lines) | Wordmark, company line, Sample tag, pay/immigration session tags, as-of, Mode, Tools, Actions (count), Data room, Developer, Settings, Ask, Help, phone More menu. |
| `src/app/address.ts` | The one writer of `location.hash` (route + scope), `loadAddress`, `followAddress`, `connectAddress`, `useAddress`. |
| `src/app/addressWriter.ts` | `AddressWriter` class: push/replace/coalesce history policy (600 ms quiet), history mark `{ census: id }`. |
| `src/app/viewTab.ts` | `viewTabOf(shown, registered, requested)`: which tab to show, whether to rewrite the address. |
| `src/app/keyboard.ts` | `rovingIndex`, `scrollDelta`, `revealInStrip`, `stripEdges` for tab strips. |
| `src/app/ModeSwitch.tsx` | Include/Exclude switch inside a filter menu (not the role mode). |
| `src/app/devlog.ts` | In-memory ring buffer (100) of render/tool errors for the Developer page. |
| `src/app/settings/SettingsSheet.tsx` | Base UI Dialog side sheet with section nav; sections filtered by `access.can('settings:<x>')`. |
| `src/app/FolderTabs.tsx` (header + exports) | Folder tabs with live gated headlines; `VIEW_PANEL_ID = 'census-view'`. |
| `src/app/ViewHeader.tsx` (header) | View title, scope line, quality switch, Export, sub-tabs; `VIEW_BODY_ID = 'census-view-body'`. |
| `src/app/ExportMenu.tsx`, `wholeView.tsx`, `exportMeta.ts`, `headlineGate.ts`, `tools.ts` (headers/exports) | Export menu, off-screen whole-view render (uses `MotionConfig`), export stamping, headline gating, related tools. |
| `src/app/*.test.ts` (it-lists) | display, addressWriter, addressSync, addressHistory, viewTab, keyboard, exportMeta, headlineGate, showPay, tools, wholeViewModel, crossView. |
| `src/app/settings/askShared.test.ts` (head) | Example of rendering React to markup in the node test env (`renderToStaticMarkup`). |
| `src/views/types.ts` | `ViewTab`, `ViewDef`, `withFeatureTabs`, `withAccessTabs`, `Headline`, `ActionItem`. |
| `src/views/registry.ts` | `VIEWS` order, `viewByKey`, `visibleViews`, `folderViews`. |
| `src/views/hrbp/index.tsx` (head) | Example view module: `Body` switch on tab, empty states, `export const view: ViewDef`. |
| `src/data/store.ts` (selected ranges) | `RouteView`, `Route`, `ROUTE_VIEWS`, `HOME_VIEW`, `PAGE_VIEWS`, guards, `LS` (census: prefix), `parseHash`, `InitialScope`, `withTimeout(…,1500)`, `navigate`. |
| `src/data/settings.ts` (selected) | `Settings`, `SettingsSection`, `SETTINGS_SECTIONS`, `SETTINGS_KEY='census:settings'`, settings file kind `census-settings`. |
| `src/data/urlScope.ts` (1-150) | Hash scope grammar `#view.tab?period=…&bu=…`. |
| `src/data/address.ts` | `AddressIntent`, hints, batching, `HistoryMark { census: number }`. |
| `src/data/tabSync.ts` (head) | BroadcastChannel `'census'` + `storage` event; sync only, no write lock. |
| `src/data/quality/storage.ts` (head + clear) | IndexedDB keys `census:dataset:<k>`, `census:versions:<k>`, `census:raw:<k>:<v>`, default idb-keyval store; `clearCensusStorage`. |
| `src/data/import/detect.ts` (lines 25-40) | `SHEET_ALIASES.employees` contains the literal `'census'`. |
| `src/components/navigation.ts`, `currentView.tsx` | `goTo`, `routeHash`, `linkToView`, `CurrentView` contract. |
| `src/dev/storageKeys.ts` + `.test.ts` | `STORAGE_KEYS` registry and a source scan that fails on an undescribed `census:` literal. |
| `src/dev/security/devServer.test.ts`, `deployPages.test.ts`, `boot.ts` (head) | Tests of the scripts; `import.meta.glob('/public/access-policy.json', {query:'?raw'})` embedding. |
| `src/lib/testBudget.ts`, `src/views/hrbp/engine/smoke.perf.test.ts` | Perf budget helper `bestCostMs` and an example perf test. |
| `src/lib/export/names.ts` (lines 40-60) | `fileStem` hard-codes the `census-` export file prefix. |
| `src/styles/index.css` (1-40, 225-260) | Font faces from fontsource (archivo + jetbrains-mono via CSS url), reduced-motion rules. |
| `node_modules/vite-plugin-singlefile/dist/esm/index.js` | Confirms Vite 8 path sets `codeSplitting = false` (all dynamic imports inlined). |
| `node_modules/@vitejs/plugin-react/dist/index.js` | `reactCompilerPreset` filter: client environment only, code regex. |
| `node_modules/idb-keyval/dist/index.{js,d.ts}` | `createStore(dbName, storeName)` is lazy; full export list. |
| `git ls-files` | 1,638 tracked files; 464 `*.test.ts`; 20 `*.perf.test.ts`; `census.html` (8,281,315 bytes) is committed. |

---

## 2. Contracts (verbatim)

### 2.1 Exact resolved versions (package-lock.json)

Direct `dependencies` (range in package.json -> locked version):

| Package | Range | Locked | Used in Census? | HCP |
|---|---|---|---|---|
| `@anthropic-ai/sdk` | ^0.131.0 | 0.131.0 | yes, Ask only (`src/ask/**`, `src/dev/askConsole.ts`, `src/dev/inventory.ts`) | DROP (spec) |
| `@base-ui/react` | ^1.8.0 | 1.8.0 | yes: combobox, dialog, menu, popover, switch, toast, toggle, toggle-group, tooltip | keep |
| `@fontsource-variable/archivo` | ^5.3.0 | 5.3.0 | yes: `src/styles/index.css` url + `src/lib/export/image.ts` `?url` import | keep |
| `@fontsource-variable/jetbrains-mono` | ^5.3.0 | 5.3.0 | yes, ONLY via CSS `url(...)` in `src/styles/index.css:19` (a JS import grep shows 0) | keep (IDs are `font-mono`) |
| `@observablehq/plot` | ^0.6.17 | 0.6.17 | yes, 27 files | keep |
| `d3` | ^7.9.0 | 7.9.0 | yes, 7 files (color, interpolateLab, piecewise, scaleUtc, bin, nice, ticks) | keep |
| `d3-sankey` | ^0.12.3 | 0.12.3 | NO imports anywhere | DROP |
| `date-fns` | ^4.4.0 | 4.4.0 | NO imports anywhere (dates live in `src/lib/dates.ts`) | DROP |
| `exceljs` | ^4.4.0 | 4.4.0 | yes (dynamic `import('exceljs')`: templates, lists workbook, export xlsx, metrics excel) | keep |
| `idb-keyval` | ^6.3.0 | 6.3.0 | yes (store, quality/storage, import/profiles, data-room state, dev/live) | keep |
| `motion` | ^14.0.0 | 14.0.0 | yes, 3 files: `src/app/App.tsx`, `src/app/Mark.tsx`, `src/app/wholeView.tsx` | DROP (spec) and replace with CSS, see 5.4 |
| `pptxgenjs` | ^4.0.1 | 4.0.1 | yes (deck export `src/lib/export/view.ts:749`, org slides) | keep (spec wants deck export) |
| `react` | ^19.3.0 | 19.3.0 | yes | keep |
| `react-dom` | ^19.3.0 | 19.3.0 | yes | keep |
| `xlsx` | `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` | 0.20.3 | yes, `src/data/import/parse.ts:8` only | keep (tarball URL, not npm registry) |
| `zustand` | ^5.0.15 | 5.0.15 | yes, 22 files (`create`, `zustand/vanilla` `createStore`) | keep |

`devDependencies`:

| Package | Range | Locked | Engines | HCP |
|---|---|---|---|---|
| `@babel/core` | ^8.0.6 | 8.0.6 | node `^22.18.0 \|\| >=24.11.0` | keep |
| `@biomejs/biome` | ^2.5.15 | 2.5.15 | | keep |
| `@rolldown/plugin-babel` | ^0.2.4 | 0.2.4 | node `>=22.12.0 \|\| ^24.0.0` | keep |
| `@tailwindcss/vite` | ^4.3.3 | 4.3.3 | | keep |
| `@types/d3` | ^7.4.3 | 7.4.3 | | keep |
| `@types/d3-sankey` | ^0.12.5 | 0.12.5 | | DROP |
| `@types/node` | ^24.19.1 | 24.19.1 | | keep |
| `@types/react` | ^19.3.0 | 19.3.0 | | keep |
| `@types/react-dom` | ^19.3.0 | 19.3.0 | | keep |
| `@vitejs/plugin-react` | ^6.1.1 | 6.1.1 | node `^20.19.0 \|\| >=22.12.0` | keep |
| `babel-plugin-react-compiler` | ^1.0.0 | 1.0.0 | | keep |
| `tailwindcss` | ^4.3.3 | 4.3.3 | | keep |
| `typescript` | ^7.0.2 | 7.0.2 (native tsc) | | keep |
| `vite` | ^8.3.2 | 8.3.2 | node `^20.19.0 \|\| >=22.12.0` | keep |
| `vite-plugin-singlefile` | ^2.3.3 | 2.3.3 | | keep |
| `vitest` | ^5.0.3 | 5.0.3 | node `^22.12.0 \|\| ^24.0.0 \|\| >=26.0.0` | keep |

Transitive used directly by a test: `picomatch` 4.0.7 (via `createRequire(import.meta.url)('picomatch')` in `src/dev/security/devServer.test.ts:15`). Also in the lock and pruned by dropping motion: `framer-motion` 14.0.0, `motion-dom` 14.0.0, `motion-utils` 14.0.0.

Effective minimum Node for the toolchain: `^22.18.0 || >=24.11.0` (from `@babel/core` 8).

### 2.2 `package.json` scripts (verbatim)

```json
"scripts": {
  "dev": "node --max-semi-space-size=64 node_modules/vite/bin/vite.js --port 8820 --strictPort",
  "build": "node --max-semi-space-size=64 node_modules/vite/bin/vite.js build",
  "build:single": "node --max-semi-space-size=64 node_modules/vite/bin/vite.js build --mode single && node scripts/copy-single.mjs",
  "preview": "node --max-semi-space-size=64 node_modules/vite/bin/vite.js preview --port 8821",
  "typecheck": "tsc --noEmit -p .",
  "test": "vitest run",
  "lint": "biome check src",
  "verify": "node scripts/verify.mjs",
  "build:artifact": "node --max-semi-space-size=64 node_modules/vite/bin/vite.js build --mode single && node scripts/build-artifact.mjs",
  "deploy": "npm run build:single && node scripts/deploy-pages.mjs"
}
```
Other top-level fields: `"name": "census"`, `"private": true`, `"version": "0.1.0"`, `"type": "module"`. No `engines`.

### 2.3 `vite.config.ts` (verbatim)

```ts
import { fileURLToPath, URL } from 'node:url'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { DEV_SERVER_DENY } from './scripts/devServer.mjs'

// `npm run build:single` emits one self-contained census.html (double-click to open, no server).
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    tailwindcss(),
    ...(mode === 'single' ? [viteSingleFile({ removeViteModuleLoader: true })] : []),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // Never serve a secret: Vite's own list plus the Ask relay's ask-relay/.dev.vars (scripts/devServer.mjs).
  server: { fs: { deny: DEV_SERVER_DENY } },
  build: {
    outDir: mode === 'single' ? 'dist-single' : 'dist',
    chunkSizeWarningLimit: 4000,
    assetsInlineLimit: mode === 'single' ? 100_000_000 : 4096,
  },
  test: {
    environment: 'node',
    // Excel round trips (ExcelJS write + SheetJS read of the whole sample) take a few seconds and
    // slow further when the full suite runs in parallel; the default 5 s timeout made them flaky.
    testTimeout: 30_000,
    // Time budgets ("runs in under 150 ms") live in *.perf.test.ts. They run one file at a time
    // once the unit tests are done, so they never compete with the parallel run for the CPU.
    // `npx vitest run` runs both; `npx vitest run --project perf` runs only the budgets.
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          // The Ask relay (ask-relay/, docs/ASK-RELAY.md) is tested here too, with fakes.
          include: ['src/**/*.test.ts', 'ask-relay/test/**/*.test.ts'],
          exclude: ['src/**/*.perf.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'perf',
          include: ['src/**/*.perf.test.ts'],
          fileParallelism: false,
          sequence: { groupOrder: 1 },
        },
      },
    ],
  },
}))
```

Notes on this config:
- `test` type-checks because `vitest/dist/config.d.ts` augments `vite`'s config (`declare module 'vite'`), loaded since test files import `vitest`. No triple-slash reference needed.
- Only `*.test.ts` is included: a `*.test.tsx` file would silently never run.
- In single mode, vite-plugin-singlefile's `config` hook (useRecommendedBuildConfig) overrides several of these: `assetsInlineLimit = () => true`, `chunkSizeWarningLimit = 100000000`, `cssCodeSplit = false`, `base = './'`, `assetsDir = ''`, and on Vite 8 `rollupOptions.output.codeSplitting = false` (every dynamic `import()` is inlined into the one file).
- `reactCompilerPreset` (plugin-react 6.1.1) runs only when `env.config.consumer === "client"` and the code matches `/forwardRef|memo|\b(?:[A-Z]|use[A-Z0-9])/`, so Vitest (node, server consumer) never runs the React Compiler; nearly every client file matches the regex, so Babel runs on nearly the whole app at build time.

### 2.4 `tsconfig.json` (verbatim)

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "resolveJsonModule": true,
    "allowImportingTsExtensions": true,
    "types": ["vite/client", "node"],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src", "ask-relay/src", "ask-relay/test", "vite.config.ts"]
}
```
No `baseUrl` (TypeScript 7 dropped it; keep it out). `scripts/*.mjs` are type-checked only through their sibling `.d.mts` when imported (by `vite.config.ts` and tests).

### 2.5 `biome.json` (verbatim)

```json
{
  "$schema": "./node_modules/@biomejs/biome/configuration_schema.json",
  "formatter": { "enabled": true, "indentStyle": "space", "indentWidth": 2, "lineWidth": 110 },
  "javascript": { "formatter": { "quoteStyle": "single", "semicolons": "asNeeded" } },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "a11y": { "noSvgWithoutTitle": "off", "useKeyWithClickEvents": "off" },
      "style": { "noNonNullAssertion": "off" },
      "suspicious": { "noArrayIndexKey": "off" },
      "complexity": { "noImportantStyles": "off" }
    }
  },
  "files": { "includes": ["src/**", "ask-relay/src/**", "ask-relay/test/**"] },
  "css": { "parser": { "tailwindDirectives": true } }
}
```

### 2.6 `index.html` (verbatim)

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>Census</title>
    <meta name="description" content="People analytics for recruiting, HR business partners, employee services, talent and compensation." />
    <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='6' fill='%2312151a'/%3E%3Cpath d='M8 22V10h4v12zm6 0V14h4v8zm6 0v-5h4v5z' fill='%23fbfbfc'/%3E%3C/svg%3E" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

### 2.7 Scripts (verbatim where HCP copies them)

`scripts/devServer.mjs`:
```js
export const DEV_SERVER_DENY = [
  // Vite 8's own list.
  '.env',
  '.env.*',
  '*.{crt,pem,key,p12,pfx,cer,der}',
  '.npmrc',
  '.yarnrc.yml',
  '**/.git/**',
  // Wrangler's local secrets, in any folder.
  '.dev.vars',
  '.dev.vars.*',
  '**/.wrangler/**',
]
```
`scripts/devServer.d.mts`:
```ts
/** Types for scripts/devServer.mjs (what the dev server refuses to serve). */

export declare const DEV_SERVER_DENY: string[]
```

`scripts/verify.mjs` (verbatim):
```js
#!/usr/bin/env node
// Census quality gate: type-check, lint, unit tests, app build and the one-file build.
//   npm run verify
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const steps = [
  ['Type-check', 'npx tsc --noEmit -p .'],
  ['Lint', 'npx biome check src'],
  ['Unit tests', 'npx vitest run'],
  ['App build', 'npm run build'],
  ['One-file build', 'node --max-semi-space-size=64 node_modules/vite/bin/vite.js build --mode single'],
]

const results = steps.map(([name, cmd]) => {
  const t = Date.now()
  process.stdout.write(`\n▶ ${name}\n`)
  const r = spawnSync(cmd, { cwd: root, shell: true, stdio: 'inherit' })
  return { name, ok: r.status === 0, secs: ((Date.now() - t) / 1000).toFixed(1) }
})

console.log('\nCensus verification')
for (const r of results) console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name} (${r.secs}s)`)
process.exit(results.every((r) => r.ok) ? 0 : 1)
```
Chain semantics: steps run in order with `shell: true` (cmd.exe on Windows), every step runs even when an earlier one fails (no short-circuit), the summary prints PASS/FAIL with seconds, exit 1 if any failed. "Unit tests" (`npx vitest run`) actually runs both projects (unit, then perf). The one-file step does NOT run `copy-single.mjs`, so verify never rewrites the root `census.html`.

`scripts/copy-single.mjs` (verbatim):
```js
// Copies the one-file build to the project root as census.html (next to "Launch Census.bat").
import { copyFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = path.join(root, 'dist-single', 'index.html')
if (!existsSync(src)) {
  console.error('dist-single/index.html not found')
  process.exit(1)
}
copyFileSync(src, path.join(root, 'census.html'))
console.log('Wrote census.html')
```

`scripts/deploy-pages.mjs` (verbatim, 54 lines):
```js
import { execSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { POLICY_SOURCE, pagesFiles, policyProblem, RELAY_SOURCE, relayProblem } from './pagesFiles.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const run = (cmd, cwd = root) => execSync(cmd, { cwd, stdio: 'inherit' })
const out = (cmd, cwd = root) => execSync(cmd, { cwd }).toString().trim()

const files = pagesFiles((p) => existsSync(path.join(root, p)))
if (files.some((f) => f.from === POLICY_SOURCE)) {
  const problem = policyProblem(
    readFileSync(path.join(root, POLICY_SOURCE), 'utf8'),
    readFileSync(path.join(root, 'census.html'), 'utf8'),
  )
  if (problem) {
    console.error(`Not published. ${problem}`)
    process.exit(1)
  }
}
if (files.some((f) => f.from === RELAY_SOURCE)) { /* same shape with relayProblem */ }

const remote = out('git remote get-url origin')
const sha = out('git rev-parse --short HEAD')
const dir = mkdtempSync(path.join(tmpdir(), 'census-pages-'))
try {
  for (const f of files)
    if (f.from) copyFileSync(path.join(root, f.from), path.join(dir, f.to))
    else writeFileSync(path.join(dir, f.to), '')
  run('git init -q -b gh-pages', dir)
  run('git add -A', dir)
  run(`git commit -q -m "Publish Census (one-file build of main@${sha})"`, dir)
  run(`git push -q -f ${remote} gh-pages`, dir)
  console.log(`Published ${files.map((f) => f.to).join(', ')}. GitHub Pages updates in about a minute.`)
} finally {
  rmSync(dir, { recursive: true, force: true })
}
```

`scripts/pagesFiles.d.mts` (verbatim):
```ts
/** Types for scripts/pagesFiles.mjs (what `npm run deploy` publishes to GitHub Pages). */

export declare const POLICY_SOURCE: 'public/access-policy.json'
export declare const POLICY_TARGET: 'access-policy.json'
export declare const RELAY_SOURCE: 'public/ask-relay.json'
export declare const RELAY_TARGET: 'ask-relay.json'
export declare const POLICY_FORMAT: 'census-access-policy'
export declare const POLICY_VERSION: number

/** The checksum Census computes over a policy file as it holds it. */
export declare function policyChecksum(file: Record<string, unknown>): string

export interface PagesFile {
  /** The project file, relative to the root; null for an empty file. */
  from: string | null
  /** Where it goes on gh-pages. */
  to: string
}

export declare function pagesFiles(exists: (path: string) => boolean): PagesFile[]

export declare function policyProblem(policyText: string, html: string): string | null

/** Why the relay file must not be published with this census.html, or null when it may. */
export declare function relayProblem(relayText: string, html: string): string | null
```
`pagesFiles` body (verbatim, `scripts/pagesFiles.mjs:58-67`):
```js
export function pagesFiles(exists) {
  const files = [
    { from: 'census.html', to: 'index.html' },
    { from: 'census.html', to: 'census.html' },
    { from: null, to: '.nojekyll' },
  ]
  if (exists(POLICY_SOURCE)) files.push({ from: POLICY_SOURCE, to: POLICY_TARGET })
  if (exists(RELAY_SOURCE)) files.push({ from: RELAY_SOURCE, to: RELAY_TARGET })
  return files
}
```
The rest of `pagesFiles.mjs` (`policyChecksum`, `relayProblem`, `policyProblem`, lines 14-133) belongs to the Security center and Ask relay; HCP Phase 1 has neither.

`scripts/build-artifact.mjs` (key lines): reads `dist-single/index.html`, keeps `<title>` (fallback `'<title>Census</title>'`), a hard-coded `<meta name="description" …>`, all `<style>` blocks, `<div id="root"></div>`, all `<script>` blocks; writes `dist-artifact/census.html`; fails over `16 * 1024 * 1024` bytes.

### 2.8 Launchers

`Launch Census.bat` (verbatim):
```bat
@echo off
rem Opens Census in an app-style window (Edge or Chrome). No install, server or internet needed.
rem Keep this file next to census.html.
setlocal
set "HTML=%~dp0census.html"
set "URL=%HTML:\=/%"
if not exist "%HTML%" (
  echo Could not find census.html next to this launcher.
  echo Build it with: npm run build:single
  pause
  exit /b 1
)
start msedge --app="file:///%URL%" 2>nul && goto :eof
start chrome --app="file:///%URL%" 2>nul && goto :eof
start "" "%HTML%"
```
`.claude/launch.json` (verbatim):
```json
{ "version": "0.0.1", "configurations": [ { "name": "census", "runtimeExecutable": "npm", "runtimeArgs": ["run", "dev"], "port": 8820 } ] }
```

### 2.9 Entry and shell contracts

`src/main.tsx` (verbatim):
```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { applyTheme } from './app/useShell'
import { setSampleSeed, useCensus } from './data/store'
import './styles/index.css'

// Pin a saved light/dark choice before the first paint so the page never flashes the other theme.
applyTheme(useCensus.getState().theme)

// The sample arrives the way real data does: raw extracts with confirmations and certifications
// (src/data/sample/raw). The store awaits the starter state on init; the import of the raw
// extracts follows in the background. If it fails to load, the plain sample shows.
const messySample = import('./data/sample/raw/load').then((m) => m.messySampleLoader()).catch(() => ({}))
setSampleSeed(() => messySample)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

Routing (`src/data/store.ts:115-174`, verbatim):
```ts
/** A folder tab, or one of the pages reached from the masthead: the Data room, Actions and Developer. */
export type RouteView = ViewKey | 'data' | 'actions' | 'dev'
export interface Route {
  view: RouteView
  tab: string
}
export const ROUTE_VIEWS: RouteView[] = [ 'home', 'team', 'scorecard', 'recruiting', 'onboarding', 'hrbp', 'org', 'services', 'talent', 'comp', 'compliance', 'listening', 'ai', 'data', 'actions', 'dev' ]
/** The page Census opens on when the address names none and no mode says otherwise (`homeView`). */
export const HOME_VIEW: RouteView = 'scorecard'
/** Pages reached from the masthead rather than a folder tab. */
export const PAGE_VIEWS: readonly RouteView[] = ['data', 'actions', 'dev']

/** The filters to keep instead of `next` (the Manager mode lock); the same object when they are fine. */
export type FilterGuard = (next: Filters) => Filters
/** Where a route goes in the current mode, and what to say when it moved. */
export interface RouteGuard {
  check: (route: Route) => { route: Route; notice?: () => void } | null
  /** The mode's home page. */
  home: () => RouteView
}
/** The data standard to show when a link or saved view names one (Manager mode keeps the saved one). */
export type StandardGuard = (asked: DataStandard) => DataStandard
export function setFilterGuard(fn: FilterGuard | null): void
export function setRouteGuard(g: RouteGuard | null): void
export function setStandardGuard(fn: StandardGuard | null): void
export const guardFilters = (f: Filters): Filters => (filterGuard ? filterGuard(f) : f)
export const homeView = (): RouteView => routeGuard?.home() ?? HOME_VIEW
```
`parseHash` (verbatim):
```ts
export function parseHash(hash: string): Route | null {
  const route = splitHash(hash).route
  const dot = route.indexOf('.')
  const view = dot < 0 ? route : route.slice(0, dot)
  if (!ROUTE_VIEWS.includes(view as RouteView)) return null
  return { view: view as RouteView, tab: dot < 0 ? '' : route.slice(dot + 1) }
}
```
`navigate` (store, verbatim):
```ts
navigate(view, tab = '', opts = {}) {
  const checked = routeGuard?.check({ view, tab }) ?? null
  const route = checked?.route ?? { view, tab }
  const moved = route.view !== view || route.tab !== tab
  hintAddress(opts.history ?? 'replace')
  set({ route })
  if (opts.scroll !== false && typeof window !== 'undefined') window.scrollTo({ top: 0 })
  if (moved) checked?.notice?.()
},
```
Navigation helpers (`src/components/navigation.ts`, verbatim signatures):
```ts
export function currentScope(): UrlScope
export const routePath = (view: RouteView, tab = ''): string => `${view}${tab ? `.${tab}` : ''}`
export const routeHash = (view: RouteView, tab = ''): string => `#${routePath(view, tab)}`
export function linkToView(scope: UrlScope = currentScope(), route: { view: RouteView; tab: string } = useCensus.getState().route): string
export function goTo(view: RouteView, tab = ''): void {
  const { route, navigate } = useCensus.getState()
  navigate(view, tab, { scroll: route.view !== view, history: 'push' })
}
```
Address grammar (`src/data/urlScope.ts` header): `#hrbp.attrition?period=t6m&bu=Silicon+Engineering&dept=Design+Verification&level=L4`; keys `period`, `from`, `to`, `leader` (an employee ID, never a name), `bu`, `dept`, `loc`, `level`, `not`, `std`, `lens=1`, `scope=all`. Defaults are omitted.
```ts
export interface UrlScope { filters: Filters; standard: DataStandard; lens: boolean }
export function splitHash(hash: string): { route: string; query: string | null }
export function hashWithScope(route: string, scope: UrlScope, opts: { explicit?: boolean } = {}): string
export function readScope(query: string | null | undefined): ReadScope
```
History (`src/data/address.ts`, `src/app/addressWriter.ts`, verbatim):
```ts
export type AddressIntent = 'push' | 'replace' | 'coalesce'
export function hintAddress(intent: AddressIntent): void
export function batchAddress<T>(intent: AddressIntent, run: () => T): T
export interface HistoryMark { census: number }
export const isHistoryMark = (v: unknown): v is HistoryMark =>
  !!v && typeof v === 'object' && typeof (v as { census?: unknown }).census === 'number'

export interface HistoryApi {
  hash: () => string
  state: () => unknown
  push: (hash: string, mark: HistoryMark) => void
  replace: (hash: string, mark: HistoryMark) => void
}
export interface Timers { set: (fn: () => void, ms: number) => unknown; clear: (id: unknown) => void }
export const QUIET_MS = 600
export class AddressWriter {
  constructor(api: HistoryApi, timers: Timers, quietMs = QUIET_MS, now: () => number = () => Date.now())
  write(hash: string, intent: AddressIntent): void
  endBurst(): void
  hold(): () => void
  get inBurst(): boolean
}
```
`src/app/address.ts` exports: `addressWriter`, `holdHistory()`, `addressFor(route, scope?)`, `loadAddress(ctx)`, `followStores(write)`, `connectAddress(getCtx)`, `useAddress(ctx)`. `pushState` and `replaceState` are wrapped in try/catch because some browsers refuse history entries on `file://` (falls back to `location.hash = hash`).

View contract (`src/views/types.ts`, verbatim):
```ts
export interface ViewTab {
  key: string
  label: string
  feature?: keyof Features
  parts?: true
}
export function withFeatureTabs(view: ViewDef, features: Features): ViewDef
export function withAccessTabs(view: ViewDef, access: Pick<AnalyticsContext['access'], 'can'>): ViewDef
// filters tabs by access.can(`tab:${view.key}.${t.key}`)
export interface Headline {
  value: string
  label: string
  metricId?: string
  spark?: (number | null)[]
  uses?: readonly FieldRef[]
}
export interface ViewSummary { kpis: Kpi[]; findings: Finding[] }
export interface ViewDef {
  key: ViewKey
  label: string
  title?: (ctx: AnalyticsContext) => string
  figureless?: (ctx: AnalyticsContext) => boolean
  /** Sub-tabs; the first one is the default. */
  tabs: ViewTab[]
  View: ComponentType<{ tab: string }>
  headline: (ctx: AnalyticsContext) => Headline
  datasets: DatasetKey[]
  HeaderActions?: ComponentType
  summary?: (ctx: AnalyticsContext) => ViewSummary
  actions?: (ctx: AnalyticsContext) => ActionItem[]
}
```
Registry (`src/views/registry.ts`):
```ts
export const VIEWS: ViewDef[] = [home, team, scorecard, recruiting, onboarding, hrbp, org, services, talent, comp, compliance, listening, ai]
export const viewByKey = new Map(VIEWS.map((v) => [v.key, v]))
export function visibleViews(access: ViewAccess): ViewDef[]   // access.can(`view:${v.key}`), then withAccessTabs
export function folderViews(access: ViewAccess): ViewDef[]    // visibleViews minus other modes' homes
```
`viewTabOf` (`src/app/viewTab.ts`, verbatim types):
```ts
export interface ViewTabChoice { tab: string; viewTab: string; rewrite: boolean }
export function viewTabOf(shown: readonly ViewTab[], registered: readonly ViewTab[], requested: string): ViewTabChoice
```
`CurrentView` (`src/components/currentView.tsx`, verbatim):
```ts
export interface CurrentView {
  key: RouteView
  label: string
  tabs: ViewTab[]
  /** The resolved sub-tab key on screen. */
  tab: string
  datasets?: readonly DatasetKey[]
}
```
Error boundary (`src/app/ErrorBoundary.tsx`, verbatim types):
```ts
interface Props {
  /** Changing this (e.g. the route) clears a caught error. */
  resetKey: string
  /** Offered as a way out when the error depends on the current filters. */
  onResetFilters?: () => void
  children: ReactNode
}
interface State { error: Error | null; key: string; stack?: string | null }
export class ViewErrorBoundary extends Component<Props, State>
// getDerivedStateFromProps: props.resetKey !== state.key -> { error: null, key, stack: null }
// componentDidCatch: console.error + logDevError({ where: 'view render', view, tab, message })
// UI copy: "This tab could not be drawn" / "Something in the data or the current filters stopped it. The other tabs still work. Your data has not changed." / buttons "Try again", "Reset filters"
```
Display helpers (`src/app/useShell.ts`, verbatim signatures):
```ts
export function applyTheme(theme: ThemePref, root: HTMLElement = document.documentElement): void   // 'system' removes data-theme
export function textZoom(size: TextSize): string
export function applyTextSize(size: TextSize, root = document.documentElement, app = document.getElementById('root')): void
export function applyMotion(motion: MotionPref, root = document.documentElement): void              // data-motion="reduce"
export function useDisplaySettings(): void   // useLayoutEffect for theme, textSize, motion
export function useHashRouting(): void       // useAddress(useAnalytics())
```
Settings (`src/data/settings.ts`, verbatim):
```ts
export type ThemePref = 'system' | 'light' | 'dark'
export type TextSize = 'sm' | 'md' | 'lg' | 'xl'
export type MotionPref = 'system' | 'reduce'
export const TEXT_SIZE_SCALE: Record<TextSize, number> = { sm: 0.9286, md: 1, lg: 1.1429, xl: 1.2857 }
export type SettingsSection = 'mode' | 'display' | 'data' | 'formulas' | 'lists' | 'privacy' | 'ask' | 'compensation' | 'tools' | 'device'
export const SETTINGS_KEY = 'census:settings'
export const SETTINGS_FILE_KIND = 'census-settings'
export const settingsFileName = (today: ISODate): string => `census-settings-${today}.json`
```
Settings sheet: `SettingsSheet` renders sections in fixed order, each only when `access.can(`settings:${section}`)`; opened by `openSettings(section?, focus?)` with a `nonce`; `settingsTrigger` ref returns focus.

Perf helper (`src/lib/testBudget.ts`, verbatim signature):
```ts
export function bestCostMs(fn: () => unknown, runs = 3): number   // warm-up, best of min(wall, thread CPU)
```

---

## 3. Patterns and conventions

### 3.1 Build and run
- Every Vite invocation in npm scripts is `node --max-semi-space-size=64 node_modules/vite/bin/vite.js …` (ARCHITECTURE.md 417-422): on Node 24.14 the React Compiler Babel step can crash Node with `0xC0000409` at random while compiling the whole app; a 64 MB young-generation semi-space stops it. Never `npx vite`.
- Vitest and tsc are run with plain `npx` (the React Compiler does not run under Vitest, see 2.3).
- `base: './'` makes one build work at the Pages subpath (`/census/`), on `file://`, and inside the artifact host.
- Two builds: `dist/` (code-split, dynamic `import('exceljs')`, `import('pptxgenjs')`, lazy `DevPage`) and `dist-single/index.html` (everything inlined, 8.28 MB; biggest pieces: app registry 2.3 MB, index 1.1 MB, exceljs 0.93 MB, charts 0.47 MB, store 0.44 MB, pptxgenjs 0.37 MB, SheetJS parse 0.36 MB, Anthropic SDK 0.22 MB, woff2 90 KB).
- Fonts are bundled from fontsource (no font request leaves the browser); `?url` import inlines in single mode.
- `public/` does not exist in Census. Census embeds optional `public/*.json` into the one-file build with `import.meta.glob('/public/access-policy.json', { query: '?raw', import: 'default', eager: true })` (`src/dev/security/boot.ts`), because vite-plugin-singlefile does not inline public files.
- Ports: dev 8820 with `--strictPort`; preview 8821 WITHOUT `--strictPort`. `.claude/launch.json` points the desktop preview at 8820.

### 3.2 Shell wiring (`src/app/App.tsx`)
- Module side effects at import time: `startAccessPolicy()` and `void startAskRelay()`.
- `App`: `useDisplaySettings()`; `useEffect(() => connectAccessUi(), [])` (mode guards before the data loads); `useEffect(init)` with a toast "Showing sample data" when `storageUnavailable`. Render tree: `MotionConfig` > `TooltipProvider` > (`ready && policyReady` ? `AnalyticsProvider key={policyKey}` > `Shell`, `AskGate`, `DrillPanel`, `SettingsSheet`, `ScopePicker`, `DevLayer` : `LoadingShell`) + `Toaster`.
- `Shell`: `useHashRouting()`; picks `page = PAGE_VIEWS.includes(route.view) ? route.view : null` else `viewByKey.get(route.view) ?? VIEWS[0]`; skip link to `#census-main` (focus moved in JS so no history entry); `<header className="band">` with `Masthead` and `FolderTabs`; `<main id="census-main" tabIndex={-1}>` with max width 1440 and `px-(--gutter)`; `Footer` ("Everything stays in this browser…", sample company line).
- How a view is mounted (`ViewPage`): `withAccessTabs(withFeatureTabs(view))` -> `viewTabOf` (rewrites the address with `navigate(view.key, tab, { scroll: false })` when `rewrite`) -> `FilterBar` (only when `view.datasets.length > 0`) -> `FigureRegistryProvider key={view.key}` -> `CurrentViewProvider` -> `ViewHeader` -> `#census-view-body` (role tabpanel when sub-tabs) -> `ViewErrorBoundary resetKey={`${view.key}.${tab}.${JSON.stringify(filters)}`} onResetFilters` -> `motion.div` keyed by view.tab (opacity 0 -> 1, y 4 -> 0, 0.12 s) -> `<view.View tab={viewTab} />`.
- Masthead pages (`data`, `actions`, `dev`) get their own error boundary and figure registry; `dev` is `lazy(() => import('@/dev/DevPage'))`.
- Masthead buttons are shown by `access.can('masthead:actions' | 'masthead:data' | 'masthead:dev' | 'masthead:tools')`; phones (< 768 px) fold Ask, Help, Data room, Developer and tools into "More". The wordmark is the one allowed `text-[18px]`.
- Theme: `applyTheme` before first paint in `main.tsx`, then `useLayoutEffect` keeps `data-theme` in step; tokens switch light/dark (tokens.css), `'system'` follows the OS.
- Pay switch: `showPay` is in memory only, off on every load; the masthead shows a "Pay amounts shown · Hide" tag while on (HCP: "Show pay amounts", HR admin only).
- Storage start-up: IndexedDB reads are raced against 1,500 ms (`withTimeout`), after which the app runs on the sample and says so.

### 3.3 Naming and prefix inventory (every place the app or scripts say "census")
Scripts and config (all must change for HCP):

| File:line | Text |
|---|---|
| `package.json:2` | `"name": "census"` (and `package-lock.json` `name` and `packages[""].name`) |
| `vite.config.ts:9` | comment "emits one self-contained census.html" |
| `index.html:6` | `<title>Census</title>` (+ description, favicon) |
| `gallery.html:6-7` | "Census chart kit", description |
| `Launch Census.bat` (file name, lines 2, 3, 5, 8) | `census.html` |
| `.claude/launch.json:5` | `"name": "census"`, port 8820 |
| `scripts/build-artifact.mjs:4,14,24,32` | `dist-artifact/census.html`, `<title>Census</title>` fallback, description |
| `scripts/copy-single.mjs:1,12,13` | `census.html` |
| `scripts/deploy-pages.mjs:2,4,5,22,32,42,49` | `census.html`, temp prefix `census-pages-`, commit message "Publish Census (…)" |
| `scripts/pagesFiles.mjs:3,8,22,39,60,61,70,73,74,103,108-110,131` (26 matching lines) | `census.html` publish entries, `POLICY_FORMAT = 'census-access-policy'`, messages |
| `scripts/pagesFiles.d.mts:7,10,24` | same |
| `scripts/verify.mjs:2,24` | "Census quality gate", "Census verification" |
| `README.md` throughout | name, URL `https://unique-name27.github.io/census/`, `census.html`, port 8820 |
| `ARCHITECTURE.md` throughout | name, port 8820, `census:` key docs |

Inside `src/` (394 files, 1,760 lines match /census/i). Identifiers and literals HCP must rename (none may survive the spec's "no census in src" test):
- Store hook `useCensus` (406 uses), `CensusState`, `clearCensusStorage`, `isNotCensus`.
- localStorage prefix in `LS` helper (`src/data/store.ts:335,343,350`) and keys `census:settings`, `census:filters`, `census:views`, `census:metrics`, `census:lists`, `census:mode`, `census:theme`, `census:showPay`, `census:dev`, `census:reference`, `census:quality-lens`, `census:org:`, `census:profile:`, `census:help`, …; IndexedDB keys `census:dataset:<k>`, `census:versions:<k>`, `census:raw:<k>:<v>`, `census:reference` (default idb-keyval store `keyval-store`/`keyval`).
- User Timing names `census:context`, `census:headline:<view>`, `census:drill:<kind>`, `census:export:<view>` (`src/lib/timing.ts`).
- BroadcastChannel name `'census'` (`src/data/tabSync.ts:20`).
- History mark `{ census: number }` (`src/data/address.ts:81-86`, `src/app/addressWriter.ts:54,61,67,71,73`).
- DOM ids and classes: `census-main`, `census-view`, `census-view-body`, `census-hover`, `census-plot`, `census-ramp`, `data-census-offscreen`, `census-welcome-title-…`.
- File names: export stem `['census', view, part, stamp]` (`src/lib/export/names.ts:58`), `census-settings-<date>.json`, `census-official-lists-<date>.xlsx`, settings file kind `census-settings`, policy format `census-access-policy`.
- Domain values that are not the brand but still spell it: official-list `basis: 'sample' | 'data' | 'census' | 'file'` (`src/data/lists/types.ts:110,121`, `edit.ts:179`, `effective.ts:70,106`, `persist.ts:62`, `settings/lists/listModel.ts:216,226`) and the vendor sheet alias `'census'` for employees (`src/data/import/detect.ts:33`).
- Help article id `'what-census-is'` (access policy kit/manager/stub, `src/help/articles/start.ts:37`).
- Ask header `x-census-passcode`, `census-relay-placeholder` (dropped with Ask).

### 3.4 Invariants enforced by tests (stack/shell area)
- `src/dev/security/devServer.test.ts`: `DEV_SERVER_DENY` matched with picomatch the way Vite matches `fsDenyGlob` (pattern without "/" gets `**/`), denies `.env*`, certs, `.npmrc`, `.git/config`, Wrangler secrets; still serves `index.html`, `src/main.tsx`; keeps Vite's own six patterns; asserts `vite.config.ts` contains the exact strings `import { DEV_SERVER_DENY } from './scripts/devServer.mjs'` and `server: { fs: { deny: DEV_SERVER_DENY } }`.
- `src/dev/security/deployPages.test.ts`: `pagesFiles(() => false)` equals `[{census.html->index.html}, {census.html->census.html}, {null->.nojekyll}]`; optional files appended in order; the deploy script text contains `from './pagesFiles.mjs'`, `for (const f of files)` and `policyProblem(`; messages contain no em dash.
- `src/dev/storageKeys.test.ts`: scans every non-test `.ts/.tsx` under `src` for `['"\`](census:[A-Za-z0-9:_./-]*)(\$\{|['"\`])` and fails on a key not in `STORAGE_KEYS` (or a known non-storage name such as a timing measure); every listed key starts with `census:`, has `holds` and `where`, and no em dash.
- `src/app/display.test.ts`: theme, text size zoom (`--text-zoom` on root, `zoom` on `#root`), reduced motion attribute.
- `src/app/addressWriter.test.ts`: one entry per view/tab change, coalesced scope bursts (600 ms), `hold()` keeps one entry while a menu is open, marks every entry, replace never pushes, Back then change drops forward entries.
- `src/app/addressSync.test.ts`, `addressHistory.test.ts`: other tabs' storage events never write this tab's history; data standard and lens stay per tab; saved startup view behavior.
- `src/app/viewTab.test.ts`: for every mode x view x shown tab, `#view.tab:x`, `/x`, `:`, `:overview` resolve to the same tab and rewrite.
- `src/app/keyboard.test.ts`: roving tab index wrap, Home/End, scroll deltas, strip edges.
- `src/app/showPay.test.ts`: pay switch starts off on every load even if an old `census:showPay` was stored; init removes it.
- `src/app/headlineGate.test.ts`, `exportMeta.test.ts`, `wholeViewModel.test.ts`: folder-tab headline gating, export stamps (scope/window/as-of/mode/sample), whole-view export bookkeeping.
- Tests mock IndexedDB with `vi.mock('idb-keyval', () => ({ get, set, del, keys }))` (about 30 files) and stub `localStorage` with a `MemoryStorage` class via `vi.stubGlobal`.
- Test environment is `node`; React markup is tested with `renderToStaticMarkup(createElement(Component))` (`src/app/settings/askShared.test.ts`).

### 3.5 Vitest projects
- `unit`: `src/**/*.test.ts` (+ `ask-relay/test/**`), excludes `*.perf.test.ts`, parallel files.
- `perf`: `src/**/*.perf.test.ts`, `fileParallelism: false`, `sequence.groupOrder: 1` (runs after unit). 20 perf files, each one budget like `expect(bestCostMs(() => computeHrbp(contexts[i++]))).toBeLessThan(300)` with fresh contexts so caches do not hide cost.
- Shared: `environment: 'node'`, `testTimeout: 30_000` (Excel round trips).
- `npx vitest run` runs both; `npx vitest run --project perf` runs budgets only.

### 3.6 Git and ship
- `census.html` (8.3 MB) is committed on `main` and rebuilt by many "Rebuild census.html" commits; `dist*` are ignored.
- Deploy: `npm run deploy` = `build:single` (writes root `census.html`) + `deploy-pages.mjs`, which force-pushes a single-commit `gh-pages` branch built in a temp dir containing `index.html`, `census.html`, `.nojekyll` (+ optional JSON). Remote is read from `git remote get-url origin`; commit message carries `main@<short sha>`.
- Origin `https://github.com/unique-name27/census.git`; branches `main`, `gh-pages`. Live at `https://unique-name27.github.io/census/`.
- Line endings: LF everywhere except three CRLF docs (ARCHITECTURE.md, docs/ROLES.md, docs/SECURITY-CENTER.md); `core.autocrlf=false`.
- No `.xlsx`, `.csv` or data `.json` is tracked; the sample's "messy raw files" are TypeScript generators in `src/data/sample/raw/extracts/*.ts` run in memory.

---

## 4. Tests to port (stack, shell, ship)

| Census test | Asserts | HCP adaptation |
|---|---|---|
| `src/dev/security/devServer.test.ts` | deny list matches Vite semantics; vite.config wiring strings | Port as `headcount-planner/src/dev/security/devServer.test.ts`. Drop the ask-relay paths from both lists (or keep the `.dev.vars` patterns; they are harmless). The deny list is for secrets only, so data files are not added to it (the git gate and `.gitignore` cover them). Keep the two exact-string assertions on `vite.config.ts`. |
| `src/dev/security/deployPages.test.ts` | file list, script uses pagesFiles | Port without policy/relay cases: `pagesFiles()` equals `[{from:'headcount-planner.html',to:'index.html'},{from:'headcount-planner.html',to:'headcount-planner.html'},{from:null,to:'.nojekyll'}]`; script contains `from './pagesFiles.mjs'` and `for (const f of files)`; commit message names "Headcount Planner"; messages have no em dash. |
| NEW `src/dev/security/trackedFiles.test.ts` | | Unit-test `strayDataFiles()` from `scripts/trackedFiles.mjs` (see 5.3): `.xlsx/.XLSX/.csv/.hcplan.json` outside `src/data/sample/` are stray; inside are allowed; `.json` that is not `.hcplan.json` is fine; also assert `scripts/verify.mjs` text calls it and that `.gitignore` lists each pattern. |
| NEW `src/app/brand.test.ts` (the spec's "no census in src" test) | | Scan every file under `src/` (ts, tsx, css, md) for `/census/i`, excluding this test file itself (or build the needle as `'cen' + 'sus'`), with an explicit allowlist (see 6, item 6). Also assert scripts use `APP_SLUG` (read `scripts/brand.mjs`, compare to `src/app/brand.ts`). |
| `src/dev/storageKeys.test.ts` | every storage literal is described | Port with `hcp:` prefix; move registry to `src/app/storageKeys.ts` if there is no Developer page in Phase 1. Regex becomes `/['"\`](hcp:[A-Za-z0-9:_./-]*)(\$\{|['"\`])/g`. |
| `src/app/display.test.ts` | theme/text size/motion helpers | Copy unchanged. |
| `src/app/addressWriter.test.ts` | history policy | Copy; history mark key `census` -> `hcp`. |
| `src/app/addressSync.test.ts`, `addressHistory.test.ts` | cross-tab and saved-view history behavior | Port when filters/saved views are ported; rename keys `census:*` -> `hcp:*`; mock `@/data/idb` (see 6, item 4). |
| `src/app/viewTab.test.ts` | tab resolution for every mode x view x tab | Copy; iterate HCP `MODES` and `VIEWS`. |
| `src/app/keyboard.test.ts` | tab strip keyboard helpers | Copy unchanged. |
| `src/app/showPay.test.ts` | pay switch is session only | Copy; key `hcp:showPay` as the legacy key to purge (or drop the legacy half: HCP has no earlier version). |
| `src/app/headlineGate.test.ts`, `exportMeta.test.ts`, `wholeViewModel.test.ts` | headline gating, export stamps, whole-view export | Port with the views/exports areas; exportMeta must add HCP header fields (version, lock hash, as-of, proration, rates, cost definition, mode, filters, rounding). |
| `src/app/tools.test.ts` | Related tools links | Drop unless HCP keeps a Tools menu (it could link to Census). |
| `src/app/crossView.test.ts` | Census cross-view metrics | Drop (Census-specific). |
| `*.perf.test.ts` pattern + `src/lib/testBudget.ts` | engine time budgets | Copy `testBudget.ts` verbatim; add perf files for forecast, bridge, cost guard LP, sample generation. |
| `src/app/settings/askShared.test.ts` (pattern only) | markup test in node env | Reuse the `renderToStaticMarkup` pattern for HCP leak tests on rendered surfaces. |

---

## 5. HCP adaptation (stack, build, ship)

### 5.1 Proposed files (paths under `headcount-planner/`)

| Path | From Census | Change |
|---|---|---|
| `package.json` | copy | name `headcount-planner`; drop `@anthropic-ai/sdk`, `d3-sankey`, `date-fns`, `motion`, `@types/d3-sankey`; ports 8822/8823; add `--strictPort` to preview; optional `"engines": { "node": "^22.18.0 \|\| >=24.11.0" }` (the `@babel/core` 8 floor). |
| `package-lock.json` | copy then prune | Copy Census's lock, set both `name` fields to `headcount-planner`, edit package.json, then run `npm install` once: npm keeps every remaining locked version and prunes the dropped ones (and `framer-motion`, `motion-dom`, `motion-utils`, `@anthropic-ai/sdk` transitive deps). Then `npm ci` thereafter. Do not regenerate the lock from scratch (transitive versions would float past Census's). |
| `vite.config.ts` | copy | comment names `headcount-planner.html`; unit include `['src/**/*.test.ts']` only; keep perf project; keep `server: { fs: { deny: DEV_SERVER_DENY } }` exactly. |
| `tsconfig.json` | copy | `include: ["src", "vite.config.ts"]`. |
| `biome.json` | copy | `files.includes: ["src/**", "scripts/**"]` (lint the scripts too, optional). |
| `index.html` | copy | title `Headcount Planner`, new description, new favicon. |
| `.gitignore` | extend | see 5.3. |
| `.claude/launch.json` | copy | `"name": "headcount-planner"`, `"port": 8822`. |
| `Launch Headcount Planner.bat` | copy | `headcount-planner.html` in all four places. |
| `README.md`, `ARCHITECTURE.md`, `docs/PLAN.md` | rewrite | ports, URL `https://unique-name27.github.io/headcount-planner/`, shared-origin warning, `about-server`, Node note with the correct Vite command (see 6, item 2). |
| `scripts/brand.mjs` + `brand.d.mts` | new | `export const APP_NAME = 'Headcount Planner'`, `export const APP_SLUG = 'headcount-planner'`, `export const ONE_FILE = \`${APP_SLUG}.html\``. Used by copy-single, deploy-pages, pagesFiles, build-artifact, verify. |
| `scripts/devServer.mjs` + `.d.mts` | copy | identical list (Wrangler lines may stay or go; adjust the test to match). |
| `scripts/verify.mjs` | copy + extend | add the tracked-data step first; name lines from `APP_NAME`. |
| `scripts/trackedFiles.mjs` + `.d.mts` | new | pure `strayDataFiles(paths)`. |
| `scripts/copy-single.mjs` | copy | writes `ONE_FILE`. |
| `scripts/pagesFiles.mjs` + `.d.mts` | copy, cut | only the three base entries from `ONE_FILE`; drop policy and relay (Phase 2/3). |
| `scripts/deploy-pages.mjs` | copy, cut | no policy/relay checks; temp prefix `${APP_SLUG}-pages-`; commit `Publish ${APP_NAME} (one-file build of main@${sha})`; stage explicit paths instead of `git add -A` (see 6, item 9). |
| `scripts/build-artifact.mjs` | copy (optional) | output `dist-artifact/${ONE_FILE}`, HCP description. |
| `src/main.tsx` | copy | `useHcp` (or chosen store name), HCP sample loader. |
| `src/app/brand.ts` | new | `APP_NAME`, `APP_SLUG`, `STORAGE_PREFIX = 'hcp:'`, `IDB_DB = 'headcount-planner'`, `IDB_STORE = 'kv'`, `TAB_CHANNEL = 'headcount-planner'`, `HISTORY_MARK = 'hcp'`, `DOM = { main: 'hcp-main', view: 'hcp-view', body: 'hcp-view-body' }`, `fileStem` prefix. |
| `src/data/idb.ts` | new | the only importer of `idb-keyval`: `const store = createStore(IDB_DB, IDB_STORE)`; `idbGet/idbSet/idbDel/idbKeys/idbClear` bound to it. |
| `src/test/memoryIdb.ts` | new | in-memory implementation of `src/data/idb.ts` for `vi.mock('@/data/idb', () => import('@/test/memoryIdb'))`. |
| `src/app/App.tsx` | copy, cut | drop Ask (`AskGate`, `AskScreenBridge`, `startAskRelay`, `useDock`), Security center (`startAccessPolicy`, `PreviewBar`, `usePolicy`), `DevLayer`/`DevRoute` unless a Developer page is kept, `motion`/`MotionConfig`; keep `ViewPage`, `ActionsPage`, Data room page, `ViewErrorBoundary`, `FigureRegistryProvider`, `CurrentViewProvider`, `DrillPanel`, `SettingsSheet`, `ScopePicker` (Acting as), `Toaster`, `LoadingShell`. Footer: "Everything stays in this browser." + sample line. |
| `src/app/{ErrorBoundary,useShell,Loading,Mark,Masthead,FolderTabs,ViewHeader,ExportMenu,FilterBar,address,addressWriter,viewTab,keyboard,devlog,exportMeta,headlineGate,wholeView,wholeViewModel}.ts(x)` | copy | brand constants instead of literals; Masthead: wordmark "Headcount Planner", Mode/Acting as, Actions, Data room (HR admin), Settings, Help; no Ask, Tools optional; show a "Read only: open in another tab" tag when the write lock is not held. |
| `src/app/settings/*` | copy subset | sections for HCP: mode, display, data, formulas, lists, privacy, device (no ask, compensation, tools in Phase 1). |
| `src/lib/testBudget.ts` | copy verbatim | |

### 5.2 Proposed `package.json`

```json
{
  "name": "headcount-planner",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "node --max-semi-space-size=64 node_modules/vite/bin/vite.js --port 8822 --strictPort",
    "build": "node --max-semi-space-size=64 node_modules/vite/bin/vite.js build",
    "build:single": "node --max-semi-space-size=64 node_modules/vite/bin/vite.js build --mode single && node scripts/copy-single.mjs",
    "preview": "node --max-semi-space-size=64 node_modules/vite/bin/vite.js preview --port 8823 --strictPort",
    "typecheck": "tsc --noEmit -p .",
    "test": "vitest run",
    "lint": "biome check src scripts",
    "verify": "node scripts/verify.mjs",
    "build:artifact": "node --max-semi-space-size=64 node_modules/vite/bin/vite.js build --mode single && node scripts/build-artifact.mjs",
    "deploy": "npm run build:single && node scripts/deploy-pages.mjs"
  },
  "dependencies": {
    "@base-ui/react": "^1.8.0",
    "@fontsource-variable/archivo": "^5.3.0",
    "@fontsource-variable/jetbrains-mono": "^5.3.0",
    "@observablehq/plot": "^0.6.17",
    "d3": "^7.9.0",
    "exceljs": "^4.4.0",
    "idb-keyval": "^6.3.0",
    "pptxgenjs": "^4.0.1",
    "react": "^19.3.0",
    "react-dom": "^19.3.0",
    "xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz",
    "zustand": "^5.0.15"
  },
  "devDependencies": {
    "@babel/core": "^8.0.6",
    "@biomejs/biome": "^2.5.15",
    "@rolldown/plugin-babel": "^0.2.4",
    "@tailwindcss/vite": "^4.3.3",
    "@types/d3": "^7.4.3",
    "@types/node": "^24.19.1",
    "@types/react": "^19.3.0",
    "@types/react-dom": "^19.3.0",
    "@vitejs/plugin-react": "^6.1.1",
    "babel-plugin-react-compiler": "^1.0.0",
    "tailwindcss": "^4.3.3",
    "typescript": "^7.0.2",
    "vite": "^8.3.2",
    "vite-plugin-singlefile": "^2.3.3",
    "vitest": "^5.0.3"
  }
}
```
Every caret floor equals Census's locked version; with Census's lock copied and pruned (5.1) the installed tree is identical to Census's. If the planner prefers pins, drop the carets (same result).

### 5.3 Tracked-data gate, `.gitignore` and verify

`scripts/trackedFiles.mjs` (proposed):
```js
// Data files never belong in the repo: real or exported workbooks, CSVs and workspace files.
// The synthetic sample lives in TypeScript under src/data/sample/ (the one allowed place).
/** Extensions that hold people data. */
export const DATA_FILE = /\.(xlsx|xlsm|xls|csv|tsv)$|\.hcplan\.json$/i
/** The one folder allowed to hold such files (fixtures of the synthetic sample). */
export const SAMPLE_DIR = 'src/data/sample/'
/** The paths (git's forward-slash form) that must not be in the repo. */
export function strayDataFiles(paths) {
  return paths.filter((p) => DATA_FILE.test(p) && !p.replace(/\\/g, '/').startsWith(SAMPLE_DIR))
}
```
`scripts/trackedFiles.d.mts`:
```ts
export declare const DATA_FILE: RegExp
export declare const SAMPLE_DIR: 'src/data/sample/'
export declare function strayDataFiles(paths: readonly string[]): string[]
```
`scripts/verify.mjs` (proposed; same chain as Census plus step 0):
```js
#!/usr/bin/env node
// Headcount Planner quality gate: no data files in git, type-check, lint, unit and perf tests,
// app build and the one-file build.
//   npm run verify
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { APP_NAME } from './brand.mjs'
import { strayDataFiles } from './trackedFiles.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const VITE = 'node --max-semi-space-size=64 node_modules/vite/bin/vite.js'

/** git ls-files (tracked and staged), plus untracked files .gitignore does not cover. */
function dataFilesInGit() {
  const list = (args) => {
    const r = spawnSync('git', ['ls-files', '-z', ...args], { cwd: root, encoding: 'utf8' })
    if (r.status !== 0) throw new Error(r.stderr || 'git ls-files failed (is this a git repository?)')
    return r.stdout.split('\0').filter(Boolean)
  }
  const tracked = strayDataFiles(list([]))
  const unignored = strayDataFiles(list(['--others', '--exclude-standard']))
  for (const p of tracked) console.error(`  tracked data file: ${p}`)
  for (const p of unignored) console.error(`  data file not covered by .gitignore: ${p}`)
  return tracked.length === 0 && unignored.length === 0
}

const steps = [
  ['No data files in git', dataFilesInGit],
  ['Type-check', 'npx tsc --noEmit -p .'],
  ['Lint', 'npx biome check src scripts'],
  ['Unit and perf tests', 'npx vitest run'],
  ['App build', `${VITE} build`],
  ['One-file build', `${VITE} build --mode single`],
]

const results = steps.map(([name, step]) => {
  const t = Date.now()
  process.stdout.write(`\n▶ ${name}\n`)
  let ok
  if (typeof step === 'function') {
    try {
      ok = step()
    } catch (err) {
      console.error(`  ${err instanceof Error ? err.message : String(err)}`)
      ok = false
    }
  } else ok = spawnSync(step, { cwd: root, shell: true, stdio: 'inherit' }).status === 0
  return { name, ok, secs: ((Date.now() - t) / 1000).toFixed(1) }
})

console.log(`\n${APP_NAME} verification`)
for (const r of results) console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name} (${r.secs}s)`)
process.exit(results.every((r) => r.ok) ? 0 : 1)
```
`.gitignore` (proposed):
```
node_modules
dist
dist-single
dist-artifact
*.log
.DS_Store
.env
.env.*
# People data never goes in the repo (the synthetic sample is TypeScript in src/data/sample)
*.xlsx
*.xlsm
*.xls
*.csv
*.tsv
*.hcplan.json
!src/data/sample/**/*.xlsx
!src/data/sample/**/*.csv
!src/data/sample/**/*.hcplan.json
# The one-file build: published to gh-pages by npm run deploy (see 6, item 8)
headcount-planner.html
```
Note: git for Windows sets `core.ignorecase=true` at `git init`, so these patterns match any case there, but on a case-sensitive checkout (Linux CI) `REPORT.XLSX` would slip past `.gitignore`. The verify step's regex is case-insensitive, so it is the real backstop.

### 5.4 Dropping `motion` (three call sites)
- `src/app/App.tsx` view fade: replace `<motion.div key initial animate transition>` with `<div key={`${view.key}.${tab}`} className="view-enter">` and in `src/styles/index.css`:
  `@keyframes view-enter { from { opacity: 0; transform: translateY(4px) } }` and `.view-enter { animation: view-enter 120ms ease-out both }`. The existing reduced-motion rules (`@media (prefers-reduced-motion: reduce)` and `:root[data-motion="reduce"] *`, index.css 240-255) already shorten it to 0.001 ms, so no `MotionConfig` is needed.
- `src/app/Mark.tsx` working bars: plain `<rect className="mark-bar" style={{ animationDelay: `${i * 150}ms` }}>` with `@keyframes mark-bar { 50% { transform: scaleY(0.4) } }`, `.mark-bar { transform-box: fill-box; transform-origin: bottom; animation: mark-bar 900ms ease-in-out infinite }`.
- `src/app/wholeView.tsx` `<MotionConfig reducedMotion="always">` around the off-screen stage: replace with an attribute on the stage element (`data-hcp-offscreen`) and a CSS rule `[data-hcp-offscreen] *, [data-hcp-offscreen] *::before, [data-hcp-offscreen] *::after { animation: none !important; transition: none !important }` so captured charts are never mid-fade.

### 5.5 Repo creation and deploy flow (each push/publish needs the user's go)
1. `git init -b main` in `headcount-planner/` at the very start (the verify gate needs a repo).
2. Stage by path only (`git add package.json package-lock.json vite.config.ts … src scripts docs`), never `git add -A` / `git add .`.
3. `gh repo create unique-name27/headcount-planner --public --source . --remote origin --push`.
4. `npm run deploy` (builds `headcount-planner.html`, force-pushes `gh-pages` with `index.html`, `headcount-planner.html`, `.nojekyll`).
5. Point Pages at gh-pages once: `gh api -X POST repos/unique-name27/headcount-planner/pages -f "source[branch]=gh-pages" -f "source[path]=/"` (use `-X PUT …/pages` if Pages already exists). URL: `https://unique-name27.github.io/headcount-planner/`.

---

## 6. Gotchas and spec conflicts

1. **Node 24 crash.** Node 24.14 can die with `0xC0000409` during the React Compiler Babel pass; every Vite call must be `node --max-semi-space-size=64 node_modules/vite/bin/vite.js` (dev, build, single, preview, artifact, and verify's own build steps). Vitest is unaffected (the compiler preset applies to the client environment only), and so are tsc and Biome.
2. **ARCHITECTURE.md contradicts itself.** Lines 39-41 tell builders "`npx vite build` must succeed" and "use `npx vite --port <unique port>`", which is exactly what the crash note (417-422) forbids. HCP's ARCHITECTURE.md must say: build with `npm run build`; for a private UI check run `node --max-semi-space-size=64 node_modules/vite/bin/vite.js --port <unique port> --strictPort`; never touch 8822 (the lead's) or 8820/8821 (Census).
3. **`motion` is not dead code.** The spec lists it as droppable, but Census's shell uses it (App view fade, Mark loading bars, whole-view export). Dropping it needs the CSS replacements in 5.4. `date-fns` is genuinely unused (no import anywhere) and should go too. `@fontsource-variable/jetbrains-mono` shows 0 JS imports but IS used through `src/styles/index.css:19`; keep it.
4. **`createStore('headcount-planner', 'kv')` breaks Census's test mocks.** About 30 Census tests mock `idb-keyval` with only `get/set/del/keys`; a module that calls `createStore` at import time then fails with Vitest's "No createStore export is defined on the mock". Resolution: one wrapper `src/data/idb.ts` is the only importer of `idb-keyval`; tests mock `@/data/idb` with a shared in-memory module. `createStore` is lazy (no `indexedDB.open` until first use), so it is safe in node. Clearing the device becomes `clear(store)` or `indexedDB.deleteDatabase('headcount-planner')` instead of Census's prefix scan of the shared default store.
5. **Shared origin.** Census uses the default idb-keyval database (`keyval-store`) and `census:` localStorage keys. Every app at `unique-name27.github.io` (Census, HCP, the pipeline dashboard…) shares one origin, so each can read the others' storage; Census already says so in Settings (`askShared.test.ts`: "Every site published at unique-name27.github.io can read what Census keeps in this browser"). HCP's own DB name and `hcp:` prefix avoid collisions, not exposure; hence the spec's README line. Also check before promising isolation for the downloaded file: Chromium may treat all `file://` pages as one origin for storage, so the local `headcount-planner.html` could share storage with a local `census.html`.
6. **"A test fails if 'census' appears in src/ code" vs. what gets ported.** Census uses the word as data, not only as the brand: official-list `basis: 'census'` (`src/data/lists/*`, `src/app/settings/lists/listModel.ts`), the vendor sheet alias `'census'` for the roster (`src/data/import/detect.ts:33`; "census file" is a real HRIS export name), the help id `what-census-is`, CSS classes `census-plot`/`census-hover`, and the test file itself. Resolution: rename the list basis to `'app'`, the help id to `what-hcp-is`, classes to `hcp-*`; build the test needle as `'cen' + 'sus'`; and decide on the vendor alias. Recommended: allowlist exactly one place, the `workers` sheet-alias array in `src/data/import/synonyms.ts`, documented in the test (the alternative is to drop the alias and lose auto-detection of a sheet named "Census").
7. **Write lock.** The spec says "Writes lock through tabSync; a second tab is read-only". Census's `tabSync.ts` only syncs (BroadcastChannel `'census'` + `storage` events, receivers re-read IndexedDB); there is no lock or read-only mode. HCP needs a new mechanism, e.g. `navigator.locks.request('hcp:writer', { ifAvailable: true }, …)` held for the page's life, with a BroadcastChannel heartbeat fallback where Web Locks are missing, plus a masthead "Read only" tag and store actions that refuse writes. Test it with stubs as `addressSync.test.ts` does.
8. **The 8 MB one-file build is committed in Census.** `census.html` (8,281,315 bytes) is on `main` and rebuilt in many commits, which bloats the repo. Because `npm run deploy` publishes the file to gh-pages anyway (and the README tells people to download it from the site), HCP should `.gitignore` `headcount-planner.html` and build it locally for the launcher. This is a deliberate difference from Census; say so in PLAN.md. If the user wants it committed, the verify gate is unaffected (it is `.html`).
9. **"Never `git add -A`" vs. the deploy script.** `deploy-pages.mjs` runs `git add -A` inside a throwaway temp repo holding only the publish files, which is harmless. A literal grep or review would still flag it, so HCP should stage the listed files explicitly: `run(\`git add -- ${files.map((f) => JSON.stringify(f.to)).join(' ')}\`, dir)`. Keep `for (const f of files)` so the ported test still finds it.
10. **Preview port is not strict in Census.** `preview --port 8821` has no `--strictPort`, so a busy port silently moves on. HCP: `preview --port 8823 --strictPort`.
11. **`git ls-files` only sees tracked/staged files.** The spec's check passes for an untracked `budget.xlsx` that `.gitignore` misses until someone stages it. The proposed step also checks `--others --exclude-standard`, and fails (rather than skips) when the folder is not yet a git repository, so `git init` must be the first act of M1.
12. **Vitest includes only `*.test.ts`.** A `*.test.tsx` file never runs. Keep tests `.ts` and render with `createElement` + `renderToStaticMarkup` (node environment, no jsdom).
13. **Single-file inlining.** vite-plugin-singlefile on Vite 8 sets `codeSplitting = false`, so `import('exceljs')`, `import('pptxgenjs')` and lazy pages all land in the one file (Census 8.28 MB; the Anthropic SDK was about 0.22 MB of it). Any future `public/` file is NOT inlined; embed it with `import.meta.glob(…, { query: '?raw', eager: true })` as Census's `boot.ts` does. `build-artifact.mjs` fails above 16 MB.
14. **TypeScript 7.** Native `tsc` 7.0.2: no `baseUrl` (paths are relative to the tsconfig), `moduleResolution: "bundler"`. The `.mjs` scripts are typed by hand-written `.d.mts` siblings; keep them in step (tests import the `.mjs`).
15. **SheetJS comes from cdn.sheetjs.com,** not the npm registry. `npm install`/`npm ci` need that host reachable; the lock pins the tarball integrity.
16. **Windows.** `verify.mjs` runs commands through `cmd.exe` (`shell: true`); keep forward-slash relative paths and `&&` chaining in npm scripts. `deploy-pages.mjs` needs git 2.28+ (`git init -b`) and cached GitHub credentials (gh/credential manager); the temp folder lives under `%TEMP%`. Census's three CRLF docs suggest adding a `.gitattributes` (`* text=auto eol=lf`) to HCP from the start.
17. **Perf budgets on a busy machine.** Use `bestCostMs` (best of runs, min of wall and thread CPU) and fresh contexts per run; perf files run serially after unit tests (`groupOrder: 1`).
18. **The user's added trade requirement** ("trade headcount between levels, regions, etc. with some ratio based on an 'average' headcount"). It touches the stack only through engines and tests, but it conflicts with the cost guard: a ratio built from average actual cost per head (HRIS pay) over a level or region with fewer than 5 costed people would leak pay, and outside HR admin nothing derived from a Filled salary may show. Suggested resolution: compute the exchange ratio from band estimates (midpoint x FTE plus standard loads, location zone, plan FX), which are not personal data, e.g. 1 P5 Munich = band(P5, Munich) / band(P3, Bengaluru) P3 Bengaluru heads. Also offer a heads-only 1:1 mode. Expose it as a What if lever and a Request type ("Trade"), with fixtures for the ratio arithmetic, and put it in PLAN.md's open questions.
