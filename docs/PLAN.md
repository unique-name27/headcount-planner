# Headcount Planner: build plan

Status: **approved 13 Oct 2026 ("go", all defaults in section 18).** Build in milestones M1 to M4 (section 17).
Date: 9 Oct 2026. Source of truth for the build: this file plus `../headcount-planner-prompt.md` (the spec).
Where this plan reads the spec a particular way, section 15 lists the reading. Where it changes the
spec, section 15.2 says so and why.

Contents
1. Scope, principles and what comes from Census
2. Glossary
3. Stack, repo and ship
4. Module map and folder ownership
5. Data model, datasets and plan state
6. Calculations (pure engines) with fixtures
7. Cost guard
8. Modes, scopes, Acting as and visibility (`ROLE_POLICY`)
9. Screens: views, tabs, homes, drills and calculation cards
10. Requests, cycle, freezes, transfers, What if and audit
11. Headcount trades (your added requirement)
12. Metric catalog
13. Sample company and the nine stories
14. Exports, workspace files, help and copy
15. Readings of the spec, changes to it, accepted risks
16. Tests and the quality bar
17. Milestones and how each one runs
18. Open questions (also asked in chat)

---

## 1. Scope, principles and what comes from Census

Headcount Planner (HCP) is a client-only browser app for position-based headcount planning: positions,
versions, a planning cycle, requests, approvals, cost, forecast, variance and trades, with a home for
managers, HRBPs, leaders and Finance, and an HR admin mode that owns the data.

Phase 1 is everything in this plan. Phase 2 (scenarios, delegation, contractors, payroll and GL
reconciliation, a Security center) and Phase 3 (a server with sign-in, HRIS and ATS sync, an Ask panel)
are out of scope, but nothing here blocks them.

Principles (each is enforced by a test named in section 16):

1. **Census is the template, never a dependency.** Same stack, folder shape, contracts and quality bar.
   Code is copied and adapted; nothing imports Census at runtime. The word "census" never appears in
   `src/` (test: `src/ship/noCensus.test.ts`).
2. **One number, one engine, one dictionary entry.** Every figure comes from a pure engine function with
   a `MetricDef` (id, name, views, definition, formula, population, window). Engines round nothing; only
   display rounds. Views are thin: every number on screen comes from a pure `model(ctx)` function, so
   tests (and the leak crawler) read the same numbers people see.
3. **Counted numbers drill to exactly their rows; modeled numbers open a calculation card** whose last
   step equals the number and whose rows add up to it.
4. **The cost guard runs in the engine**, before any tile, chart, table, export, workspace file, comment
   or help text reads a number. The UI never decides privacy on its own.
5. **Every surface, action and mode has a decision** in `ROLE_POLICY` (plain data, repeated in section
   8), with a one-sentence reason on everything hidden or limited.
6. **Synthetic data only in the repo.** `npm run verify` fails if git tracks a `.xlsx`, `.csv` or
   `.hcplan.json` outside `src/data/sample/`.
7. **Honest architecture.** Modes, Acting as and approvals change what the app shows, not who can see
   the data. Hashes catch damage, not forgery. Real access control needs a server with sign-in (Phase 3).

### 1.1 What is copied from Census (by area)

| Area | Census source (all relative to the Census repository) | HCP change |
|---|---|---|
| Stack and scripts | `package.json`, `package-lock.json`, `vite.config.ts`, `tsconfig.json`, `biome.json`, `scripts/*` | Rename, drop unused packages, ports 8822/8823, data-file gate, brand constants (3.3) |
| Shell | `src/app/*` (App, Masthead, FolderTabs, ViewHeader, address, addressWriter, viewTab, keyboard, ErrorBoundary, useShell, Loading, Mark, ExportMenu, FilterBar, settings, datasetFocus) | Drop Ask, Security center, Developer page, `motion`; add Acting as, comparison and version pickers, read-only tag |
| Views contract | `src/views/types.ts`, `registry.ts(+test)`, `src/views/hrbp/` layout | HCP views and tabs (9.1) |
| Metrics | `src/metrics/*` (types, define, registry, catalog, api, params, privacy, overrides, persist, testing) | HCP catalog; `cost.` added to shared prefixes; cost-guard rules as locked entries |
| Data | `src/data/schema.ts` shape, `store.ts`, `tabSync.ts`, `scope.ts`, `urlScope.ts`, `context.tsx`, `settings.ts`, `savedViews.ts`, `import/*`, `lists/*`, `quality/*` | Eight HCP datasets, fiscal periods, position trees, `idb.ts` wrapper, write lock |
| Sample | `src/data/sample/{prng,calendar,names,departments,org}.ts`, `raw/*` pattern | Fresh Northgate positions, versions, requests, nine stories |
| Cost guard | `src/lib/costRounding.ts`, `src/lib/budget.ts` (`foldGroups`), `src/views/comp/engine/cost.ts` (`roundedAmounts`, `wholeUnits`, `foldByUnit`, `breakdown`), `lp.testkit.ts`, `costLp.test.ts`, `costRounding.test.ts`, `costUnions.test.ts` | Pay views `exact` and `rounded`, cost atoms, rule (c) on differences (section 7) |
| Access | `src/access/*` (modes, copy, pay, surfaces, matrix, items, context, hooks, store, connect, numbers, scopes/*, policy/*, `overrides/sha256.ts` with its test) and the leak tests | Five modes, Acting as, tree and unit scopes, `action:` surfaces, person-level rules; `sha256.ts` moves to `src/lib/sha256.ts`, synchronous, for lock, audit chain and file hashes (no `crypto.subtle`) |
| UX | `src/drill/*`, `src/components/*`, `src/charts/*`, `src/lib/export/*`, `src/styles/*`, `src/views/home/ui/*`, `src/views/actions/*` | Position card, calculation card, waterfall chart, weighted drills; `charts` and `lib/export` import each other's types, so both are ported together in M2 with renames only, and M4 adds the export header, Suppressed flag, long CSV, control totals and load file |
| Help and ship | `src/help/*`, `src/dev/security/{copy,deployPages,devServer}.test.ts`, `src/ask/engine/testkit.ts` (leak scanner) | `about-server` article; `help/ui/LearnMore.tsx` is a stub from M2 until M4 fills it |

Census quirks this plan deliberately does **not** copy: `isActiveAt` treating the last day as inactive;
Finance rounding to $0.1M; `showCostIn` refusing every scoped mode; the default idb-keyval database;
`git add -A` in the deploy script; the CSV export that drops cost columns; "under $0.1M" written as text
into numeric cells; committing the 8 MB one-file build; `ARCHITECTURE.md` telling builders to run
`npx vite`.

---

## 2. Glossary

These words are used exactly, in the UI, help, exports and code comments. Help's glossary is generated
from the metric catalog (section 12), so a definition lives in one place.

| Term | Meaning |
|---|---|
| **Loaded cost** | Base + bonus + burden + benefits + one-time, in USD. Targets, budget and variance use it. Equity is added only where labeled "incl. SBC". |
| **Budget** | The locked Budget version of a fiscal year (FY27 Budget; FY28 has none yet). |
| **Plan of record** | The latest locked version of a fiscal year (FY27: Q1 Reforecast). A fiscal year with no locked version has none. |
| **Working** | The one editable version of a fiscal year (FY27 Working, FY28 Plan Working). |
| **Comparison** | The version a "vs" figure compares with, or, for a fiscal year with no locked version (FY28 today), that year's target. Every "vs" figure names it and has a picker. Default: the shown fiscal year's Budget in Finance mode and its plan of record elsewhere; with no locked version, the target in every mode, Finance included (9.2). |
| **Plan heads** | Positions whose plan line is Filled at month-end, in a version. |
| **Approved heads** | Positions Filled, Open or Planned on a date whose start is on or before the end of that date's fiscal year. On hold and Eliminated are not approved heads. |
| **Actual heads** | Active HRIS employees on the last day, on leave included, plus a "Not in plan" row for active employees with no position. |
| **Average FTE** | Σ FTE × active days ÷ days, always daily, whatever the version's proration. |
| **Actual (HRIS estimate)** | Phase 1 actual cost: modeled from HRIS pay at each month close, not payroll. |
| **Costed people** | Every employee in a Filled seat, on leave or not (paid or unpaid), plus accepted offers, counted over each figure's own version and window: a holder in the months where their active fraction is above 0, and an accepted offer from its start date (7.2 rule 1). The cost guard counts them. Leave changes amounts, never who is costed. |
| **Band estimate** | Band midpoint × FTE plus standard loads (bonus at target × funding, capped burden, benefits), annual, USD at the version's plan rates. Reads no person's pay. Used for request estimates, the leader threshold, pending requests in asks cost, Open and Planned seats and trades; never for Manager budget status. In an in-year total (asks cost, a trade's target move) it counts only for the months from the start or effective date to FY end, never as a full year. |
| **Band cost** | Band midpoint × FTE, no loads. Used only for Manager budget status (spec). |
| **Target** | Finance's heads at the target date (blank: FY end) and loaded cost for the fiscal year, per org. Target cost is the fiscal year's total (sum of its months under the version's proration), not a year-end run rate. |
| **Asks** | Heads: Working positions Filled, Open or Planned on the target date with a start on or before it, + the head effect of each pending request that takes effect by then (6.9). Trades count net: seats received − Open or Planned seats given, so an On hold seat given counts 0. A pending elimination of an approved head counts −1 (section 15.2, change C2). With a blank target date this equals Working approved heads at FY end. Cost: the fiscal year's loaded cost of Working lines + each pending request's band-estimate effect (adds +, eliminations −, Level, Location and Transfer changes as the difference), in-year from its start or effective date to FY end, never at HRIS pay or an offer (6.9). |
| **Gap** | Target − asks, in heads and in cost. Negative means asks exceed the target. |
| **Allocation** (Manager) | The tree's Filled, Open and Planned positions in the plan of record at fiscal year end, at their plan-of-record level, location and FTE, plus later approved adds, minus later approved eliminations, in heads and band cost (6.9). An approved trade is absorbed: its get seats are adds and its give seats eliminations. Standard heads show beside it only as a note and never set budget status (11.4). |
| **Left to fill** | Open and Planned seats in the allocation. |
| **Left to request** | Planned seats in the allocation with no req and no pending "Start recruiting" request. |
| **Standard head** | Finance's unit for trading seats: the average band estimate per approved FTE (Σ band estimate ÷ Σ FTE) in the fiscal year's Budget, set once a year. A seat's **weight** is its band estimate ÷ the standard head, so an average full-time seat weighs 1.00. (Section 11.) |
| **Trade** | A request that gives Open, Planned or On hold seats, plus any trade credit, for whole seats of another level, location, FTE or org worth no more standard heads. Filled seats are never traded. |
| **Trade credit** | The standard heads a trade leaves over, held by the giving org until its fiscal year closes. |
| **Cost atom** | The smallest group a rounded cost total is built from (section 7.3). |
| **Contributors** | The costed positions whose amount differs between the two sides of a displayed difference. |

---

## 3. Stack, repo and ship

### 3.1 Identity and ports

| Item | Value |
|---|---|
| Display name | `APP_NAME = 'Headcount Planner'` |
| Slug (repo, files, IndexedDB) | `APP_SLUG = 'headcount-planner'` |
| Folder | `headcount-planner/`, beside the Census repository on the owner's computer (ignore the empty `headcountplanner*.html` files beside it) |
| Storage prefix | `hcp:` (localStorage, sessionStorage, IndexedDB keys, timing names, history mark) |
| IndexedDB | `createStore('headcount-planner', 'kv')`, only through `src/data/idb.ts` |
| BroadcastChannel and lock | channel `headcount-planner`, Web Lock `hcp:writer` |
| Dev server | 8822 `--strictPort` (`.claude/launch.json` name `headcount-planner`) |
| Preview | 8823 `--strictPort` |
| Repo | public `unique-name27/headcount-planner`, GitHub Pages from `gh-pages` |
| Live URL | `https://unique-name27.github.io/headcount-planner/` |
| One-file build | `headcount-planner.html` (git-ignored; deploy publishes it; README says download it for real data) |

Builders running a private UI check use their own port (8830 and up) with
`node --max-semi-space-size=64 node_modules/vite/bin/vite.js --port <n> --strictPort` and an origin like
`<builder>.localhost:<n>` so browser storage never collides. Nobody touches 8822 except the lead, or
Census's 8820/8821.

### 3.2 Packages (exact versions from Census's lock)

Copy Census's `package.json` and `package-lock.json`, set both `name` fields to `headcount-planner`,
remove the packages below, then run `npm install` once so npm prunes the lock while keeping every other
resolved version. After that, `npm ci` only. Never regenerate the lock from scratch.

| Keep | Version |
|---|---|
| dependencies | `@base-ui/react` 1.8.0, `@fontsource-variable/archivo` 5.3.0, `@fontsource-variable/jetbrains-mono` 5.3.0 (used through CSS), `@observablehq/plot` 0.6.17, `d3` 7.9.0, `exceljs` 4.4.0, `idb-keyval` 6.3.0, `pptxgenjs` 4.0.1, `react` 19.3.0, `react-dom` 19.3.0, `xlsx` 0.20.3 (cdn.sheetjs.com tarball), `zustand` 5.0.15 |
| devDependencies | `@babel/core` 8.0.6, `@biomejs/biome` 2.5.15, `@rolldown/plugin-babel` 0.2.4, `@tailwindcss/vite` 4.3.3, `@types/d3` 7.4.3, `@types/node` 24.19.1, `@types/react` 19.3.0, `@types/react-dom` 19.3.0, `@vitejs/plugin-react` 6.1.1, `babel-plugin-react-compiler` 1.0.0, `tailwindcss` 4.3.3, `typescript` 7.0.2, `vite` 8.3.2, `vite-plugin-singlefile` 2.3.3, `vitest` 5.0.3 |
| **Drop** | `@anthropic-ai/sdk`, `d3-sankey`, `@types/d3-sankey`, `motion` (replaced by CSS keyframes in its three call sites: view fade, logo bars, off-screen export stage), `date-fns` (no imports) |

`engines.node`: `^22.18.0 || >=24.11.0` (the `@babel/core` 8 floor). `npm ci` needs `cdn.sheetjs.com`
reachable (SheetJS ships from there).

### 3.3 Scripts and config

`package.json` scripts (every Vite run uses the Node 24 crash workaround; never `npx vite`):

```json
"dev": "node --max-semi-space-size=64 node_modules/vite/bin/vite.js --port 8822 --strictPort",
"build": "node --max-semi-space-size=64 node_modules/vite/bin/vite.js build",
"build:single": "node --max-semi-space-size=64 node_modules/vite/bin/vite.js build --mode single && node scripts/copy-single.mjs",
"preview": "node --max-semi-space-size=64 node_modules/vite/bin/vite.js preview --port 8823 --strictPort",
"typecheck": "tsc --noEmit -p .",
"test": "vitest run",
"lint": "biome check src scripts",
"verify": "node scripts/verify.mjs",
"deploy": "npm run build:single && node scripts/deploy-pages.mjs"
```

| File | Content |
|---|---|
| `vite.config.ts` | Census's file: React + React Compiler preset, Tailwind, singlefile in `--mode single`, `@` alias, `server: { fs: { deny: DEV_SERVER_DENY } }` (kept literally; a test greps it), Vitest `environment: 'node'`, `testTimeout: 30_000`, projects `unit` (`src/**/*.test.ts`, minus perf and slow) , `slow` (`src/**/*.slow.test.ts`, serial: LP, attack and crawl tests) and `perf` (`src/**/*.perf.test.ts`, serial, `groupOrder: 1`). |
| `tsconfig.json` | Census's, `include: ["src", "vite.config.ts"]`, no `baseUrl` (TypeScript 7). |
| `biome.json` | Census's, `files.includes: ["src/**", "scripts/**"]`. |
| `index.html` | Title "Headcount Planner", new description and favicon. |
| `.gitattributes` | `* text=auto eol=lf` (snapshot files must not flip to CRLF on Windows). |
| `.gitignore` | `node_modules`, `dist`, `dist-single`, `dist-artifact`, `*.log`, `.DS_Store`, `.env*`, `*.xlsx`, `*.xlsm`, `*.xls`, `*.csv`, `*.tsv`, `*.hcplan.json` with `!src/data/sample/**` exceptions, and `headcount-planner.html`. |
| `scripts/brand.mjs` + `.d.mts` | `APP_NAME`, `APP_SLUG`, `ONE_FILE`. Every script takes names from here; a test compares it with `src/app/brand.ts`. |
| `scripts/trackedFiles.mjs` + `.d.mts` | Pure `strayDataFiles(paths)`: `/\.(xlsx|xlsm|xls|csv|tsv)$|\.hcplan\.json$/i` outside `src/data/sample/`. |
| `scripts/verify.mjs` | Census's chain plus a first step. Steps, in order, all run even after a failure, then a PASS/FAIL table and exit 1 on any failure: (1) **No data files in git**: `git ls-files -z` and `git ls-files -z --others --exclude-standard` through `strayDataFiles`; fails if the folder is not a git repo. (2) `npx tsc --noEmit -p .` (3) `npx biome check src scripts` (4) `npx vitest run` (unit, slow, perf) (5) app build (6) one-file build, then `node scripts/check-single.mjs` on it. |
| `scripts/oneFile.mjs` + `.d.mts` | The one-file check, pure (`src/ship/oneFile.test.ts` runs it on made-up pages): `oneFileReport(html)` and `oneFileProblems(html)` read the built page as the browser's HTML parser does and list every reason it would not open from `file://` on its own (a tag outside `PAGE_TAGS`, a script or style that is not inline, an attribute, CSS `url()` or `@import`, dynamic `import()`, worker or fetch that names a file or address), and a page over `ONE_FILE_BUDGET` (6,000,000 bytes). |
| `scripts/check-single.mjs` | Runs the one-file check on `dist-single/index.html` (or a file given): exit 1 with each reason, else the page's size against the budget, its inline script and style count and "It opens from file:// with no network request." Verify step 6 runs it. |
| `scripts/copy-single.mjs` | `dist-single/index.html` to `headcount-planner.html`; a page that fails the one-file check is not copied (exit 1, with each reason). |
| `scripts/pagesFiles.mjs` + `.d.mts` | `[{from: ONE_FILE, to: 'index.html'}, {from: ONE_FILE, to: ONE_FILE}, {from: null, to: '.nojekyll'}]`. No policy or relay files in Phase 1. |
| `scripts/deploy-pages.mjs` | Census's flow (temp repo, `git init -q -b gh-pages`, force-push) with temp prefix `headcount-planner-pages-`, message `Publish Headcount Planner (one-file build of main@<sha>)`, and **explicit staging** of the listed files (`git add -- index.html headcount-planner.html .nojekyll`). Refuses with a plain message when there is no commit or no `origin`, when a listed file is missing, or when `headcount-planner.html` fails the one-file check. |
| `scripts/devServer.mjs` + `.d.mts` | Vite's deny list plus `*.hcplan.json`. |
| `Launch Headcount Planner.bat` | Opens `headcount-planner.html` beside it in an Edge or Chrome app window. |
| `src/app/brand.ts` | `APP_NAME`, `APP_SLUG`, `STORAGE_PREFIX = 'hcp:'`, `IDB_DB`, `IDB_STORE = 'kv'`, `TAB_CHANNEL`, `WRITER_LOCK = 'hcp:writer'`, `HISTORY_MARK = 'hcp'`, DOM ids `hcp-main`, `hcp-view`, `hcp-view-body`, export file prefix. |

### 3.4 Git, repo and deploy (each outward step waits for you)

1. M1 starts with `git init -b main` (the verify gate needs a repository).
2. Commits stage paths explicitly (`git add package.json package-lock.json src scripts docs …`), never
   `git add -A` or `git add .`.
3. M4, after your go: `gh repo create unique-name27/headcount-planner --public --source . --remote origin --push`,
   `npm run deploy`, then point Pages at `gh-pages` once with
   `gh api -X POST repos/unique-name27/headcount-planner/pages -f "source[branch]=gh-pages" -f "source[path]=/"`
   (`-X PUT` if Pages already exists), verify the live page, and give you the URL.

### 3.5 README and ARCHITECTURE

- `README.md`: what it is, the live link, "download `headcount-planner.html` for real data", running and
  deploying, **architecture honesty** (no server; modes are not security; checksums catch damage, not
  forgery; real access control needs a server with sign-in), and **same origin**: every app on
  `unique-name27.github.io` shares one origin and can read the others' browser storage, so real data
  belongs in the downloaded file. (Chromium may also treat `file://` pages as one origin; HCP's own
  database name and `hcp:` prefix keep its data apart from a local `census.html`, but not hidden.)
- `ARCHITECTURE.md`: the contract for builders (folder ownership, view pattern, metric conventions,
  guard rules, test conventions, the correct Vite command, ports). Copied from Census's structure and
  corrected.

---

## 4. Module map and folder ownership

Each top-level folder has one owner per milestone, so parallel builders never edit the same file. The
contracts (types and function signatures) for a milestone are frozen in its first phase; builders then
fill bodies behind them.

```
headcount-planner/
  package.json  package-lock.json  vite.config.ts  tsconfig.json  biome.json  index.html
  .gitignore  .gitattributes  .claude/launch.json  Launch Headcount Planner.bat
  README.md  ARCHITECTURE.md  docs/{PLAN.md, VIEWS.md, FILTERS.md, HELP.md, DATA-TIERS.md}
  scripts/   brand, trackedFiles, verify, copy-single, pagesFiles, deploy-pages, devServer (+ .d.mts)
  src/
    main.tsx
    app/        shell, brand.ts, masthead, folder tabs, view header, filter bar, pickers, settings, address
    data/       schema.ts, idb.ts, store.ts, tabSync.ts (+ writer lock), fiscal.ts, scope.ts, urlScope.ts,
                context.tsx, settings.ts, savedViews.ts, import/, lists/, quality/
    data/sample/  prng, calendar, names, departments, org, positions, workers, comp, reqs, requests,
                targets, freezes, assumptions, versions, closes, cycle, trades, personas, stories, raw/,
                README.md, sample.test.ts, sample.perf.test.ts
    plan/       the planning domain, all pure except store/:
      types.ts        Position, Assignment, PlanLine, Version, Request, Step, Cycle, Transfer, Trade, AuditEntry
      engine/         fiscal-aware heads, proration, cost, fx, forecast, variance, bridge, targets,
                      allocation, budgetStatus, trade, band, chain, requests (state machine), cycle,
                      freeze, transfer, whatif, reconcile, close, lineage
      store/          PlanStore interface, BrowserStore, MemoryStore (tests), overlay merge
      workspace/      .hcplan.json read and write, checksum, validate, diff, merge
      audit/          hash chain, append, verify (redaction is access/visibility.ts)
    cost/       guard.ts, atoms.ts, fold.ts, differences.ts, fit.ts, lp.testkit.ts, and the guard tests
    lib/        costRounding.ts (Census verbatim), sha256.ts (Census's synchronous SHA-256, 5.3), dates.ts,
                format.ts (adds fte, moneyLocal), stats.ts, timing.ts, testBudget.ts, export/ (owned with
                charts/, since each imports the other's types)
    metrics/    Census's dictionary machinery; costGuard.ts (locked rules); catalog.ts
    access/     modes, copy, pay, leave, surfaces, matrix, items, context, hooks, store, connect,
                numbers, visibility.ts (person-level rules), scopes/, policy/, ui/
    drill/      Drill, DrillPanel, PositionCard, CalcCard, calc.ts, records, filter, focus, related, ...
    components/ KpiStrip, Readout, Section, ui, ... (Census)
    charts/     Figure, DataTable, plot, theme, kit/ (+ Waterfall, Bullet)
    styles/     tokens.css, index.css (Census tokens and type scale)
    views/      home/ team/ plan/ requests/ forecast/ targets/ whatif/ finance/ actions/ audit/ data/
    help/       articles/, tours.ts, access.ts, ...
    testkit/    memoryIdb.ts (from M1), sample contexts per mode, crawl.ts (leak crawler), leaks.ts
                (Census secret scanner)
    ship/       noCensus, brand, trackedFiles, deployPages, devServer tests
```

Dependency direction (enforced by `src/ship/imports.test.ts`, written as a deny-list):

- `plan/` and `cost/` may import `data/schema`, `data/fiscal`, `data/scope` (types only), `lib/` and each
  other. They never import `access/` at runtime, nor `views/`, `app/`, `drill/`, `components/` or `charts/`.
- `plan/store/` may also import `data/idb` and `data/tabSync` (BrowserStore and the write lock). It is the
  only impure part of `plan/`.
- `cost/` may also `import type` from `access/scopes/types` (`ScopeLock` in `costFit`).
- `Mode`, `MODES` and `isMode` are declared in `src/data/schema.ts` and frozen in M1; `access/modes.ts`
  re-exports them and adds the per-mode tables.
- `plan/audit/` hashes, appends and verifies only. Redaction for a viewer is `access/visibility.ts#auditView`
  alone.
- `views/*` may import anything except another view's `index.tsx` (only its `engine/` or `metrics.ts`) and
  `views/actions/index.tsx`.
- `access/policy/` never imports the view registry.
- App code never imports the `@/lib/export` barrel, `exceljs`, `pptxgenjs` or `xlsx` statically, only
  through `import()`. Single modules such as `@/lib/export/csv` may be imported statically, as in Census
  (lazy test, 14.1).

---

## 5. Data model, datasets and plan state

Plan positions, not people. Two layers:

- **Datasets**: the eight imported tables, in Census's `DatasetDef` shape, versioned with history of 3,
  tiers, mapping, quality and certification (Data room). HR admin imports them.
- **Plan state**: what people do in the app (versions and their locked lines, month closes, Working
  edits, requests, cycles, trades, comments, audit). It lives in the `PlanStore`. A Full workspace file
  carries it whole; every other workspace file carries only the exporter's guarded slice (5.5).

### 5.1 Vocabularies (`src/data/schema.ts`)

```ts
export const MIN_GROUP = 5
export const MODES = ['manager','hrbp','leader','finance','hr-admin'] as const   // frozen in M1
export type Mode = (typeof MODES)[number]
export const isMode = (v: unknown): v is Mode =>
  typeof v === 'string' && (MODES as readonly string[]).includes(v)
// access/modes.ts re-exports Mode, MODES and isMode and adds the per-mode tables (8.1).
export const LEVELS = ['P1','P2','P3','P4','P5','P6','M1','M2','E1','E2','E3'] as const
// P1 Entry, P2 Developing, P3 Career, P4 Senior, P5 Staff, P6 Principal, M1 Manager, M2 Director,
// E1 Vice president, E2 Senior VP, E3 Executive. Census's L1-L6 become P1-P6; normalizeLevel still
// reads IC4, L4, P4, T4 and title words.
export const LEADER_MIN_LEVEL: Level = 'M2'                   // "Director+"
export const POSITION_STATUSES = ['Filled','Open','Planned','On hold','Eliminated'] as const
export const WORKER_TYPES = ['Employee','Contractor','Intern'] as const   // heads: Employee 1, others 0
export const REQ_STATUSES = ['Open','On hold','Filled','Cancelled'] as const
export const REQ_STAGES = ['Req opened','Interviewing','Offer accepted','Started'] as const
export const REQ_TYPES = ['New','Backfill'] as const
export const REQUEST_TYPES = ['New role','Backfill','Level change','Location change','Transfer',
  'Elimination','Trade','Start recruiting','Start date'] as const       // last three: section 15.1 R5, 11
export const REQUEST_STATES = ['Draft','Submitted','In review','Sent back','Approved',
  'Approved with changes','Rejected','Withdrawn','Expired'] as const
export const REASON_CODES = ['Growth','New capability','Attrition backfill','Restructure','Cost reduction',
  'Cost-neutral mix','Level mix','Location strategy','Freeze exception','Below the cut line','Other'] as const
export const REASON_CODES_OF: Record<RequestType, readonly ReasonCode[]>   // what Requests > New offers
// Trade: Cost-neutral mix, Location strategy, Level mix, Other (11.4). Every other type: REASON_CODES minus
// Cost-neutral mix and Below the cut line. Below the cut line is set only by the system at cycle lock (R7)
// and is never offered in a form. Import accepts any REASON_CODES value and flags one outside
// REASON_CODES_OF[type] as a quality warning, not a refusal. schema.test.ts checks that every
// REASON_CODES_OF value is in REASON_CODES.
export const CYCLE_STAGES = ['Open for asks','HRBP review','Leader review','Finance review','Locked'] as const
export const PRORATIONS = ['daily','half-month','full-month'] as const
export const FX_SETS = ['plan','actual','forecast'] as const
export interface Site { location: string; country: string; jurisdiction: string; region: Region;
  currency: string; legalEntity: string; zone: string }   // 13 Northgate sites, one legal entity per country
```

### 5.2 The eight datasets

Same `DatasetDef` shape and `f(key, label, type, synonyms, description, extra)` helper as Census.
`FieldDef` gains `leave?: true` (leave fields, shown only as counts of 5 or more and never in Manager or
Finance) and `cost?: true` (a group total). `pay: true` hides a column unless HR admin has "Show pay
amounts" on. Vendor header synonyms (Workday, Greenhouse, Lever, iCIMS, SuccessFactors, Anaplan, Adaptive,
Pigment) live in `src/data/import/synonyms.ts`; `positions.openedDate` adds 'opened date', 'date opened',
'position opened' and 'availability date'. `droppedColumns` (protected characteristics, proxies,
free-text comment columns) runs in `import/sheet.ts` as in Census; tiers live in `quality/` and in
`sample/raw/plan.ts` `SAMPLE_TIERS`.

| Dataset | rowKey | Fields (required in bold; `pay`, `leave`, `cost` flagged) | Links | Sample tier |
|---|---|---|---|---|
| `positions` (effective-dated) | positionId, effectiveDate | **positionId**, **effectiveDate**, **status** (as imported: Planned, On hold and Eliminated are read from it; Filled and Open derive from assignments, 6.5; reconcile compares the two), title, jobFamily, **level**, **businessUnit**, department, **costCenter**, **location**, legalEntity, managerPositionId, workerType, fte, startDate (target or planned start), openedDate (the date the seat last became Open; blank = derive, 6.7), reqType, leaderLevel (override), endDate (for Eliminated: the seat's last day, inclusive, 6.3), endReason (`Eliminated`, `Traded`, `Transferred`), sourceRequestId | managerPositionId → positions | gold |
| `workers` (one row per assignment) | employeeId, positionId, assignmentStart | **employeeId**, name, positionId (blank = not in plan), assignmentStart, assignmentEnd (inclusive), **hireDate**, terminationDate (last day, inclusive; known future exits), **workerType**, fte, level, businessUnit, department, costCenter, location, legalEntity, managerId, onLeave (`pay`, `leave`), leavePaid (`pay`, `leave`) | positionId → positions; managerId → workers | gold |
| `comp` (effective-dated) | employeeId, effectiveDate | **employeeId**, **effectiveDate**, currency, **baseSalary** (`pay`; FTE-equivalent rate), targetBonusPct (overrides the level default) | employeeId → workers | gold |
| `reqs` | reqId | **reqId**, positionId, **status**, stage, reqType, **openedDate**, targetStartDate, offerAcceptedDate (date only), startDate, closedDate, hiringManagerId, recruiter, offerBase (`pay`; FTE-equivalent annual rate, like baseSalary; the field description and import mapping hint say "full-time rate, not part-time pay"), offerCurrency, signOnBonus (`pay`), relocation (`pay`), agencyFee (`pay`) | positionId → positions | silver (messy ATS export) |
| `requests` | requestId | **requestId**, **type**, **state**, **reasonCode**, **requesterId**, submittedById, submittedAt, updatedAt, positionId, **businessUnit**, department, costCenter, managerPositionId, level, location, jobTitle, fte, startDate, priority, cycleId, steps (new field type `steps`: compact text "Manager E10234 Approved 2026-08-03; HRBP E10077 Pending"), confidential, exception, plus trade fields (11.4, including `giveOrgPositionId`, the giving org) and transfer fields (10.5) | positionId, giveOrgPositionId → positions | bronze (one messy spreadsheet; not the Import requests files, 5.5) |
| `targets` | fiscalYear, businessUnit, department, costCenter, leaderPositionId | **fiscalYear**, targetDate (blank = FY end), **businessUnit**, department, costCenter, leaderPositionId, **targetHeads**, targetCost (`cost`) | leaderPositionId → positions | silver (planning-tool export) |
| `freezes` | freezeId | **freezeId**, **businessUnit**, department, costCenter, leaderPositionId, **startDate**, endDate (blank = open-ended), allowBackfill (blank = No), reason | | silver |
| `assumptions` (long form) | version, table, org, key | **version**, **table**, org (blank = company; a unit or department overrides), **key** (pipe-joined dimensions), **value** | | gold |

Required datasets: positions, workers, comp, assumptions. Optional: reqs, requests, targets, freezes (the
app runs without them and says what is missing). `LINKS` becomes `Link[]` per dataset (Census allows one).
Row objects from files are built with `Object.create(null)` and headers named `__proto__`,
`constructor` or `prototype` are refused.

**Assumption tables** (`ASSUMPTION_KEYS` declares each table's key dimensions and unit; values fall back
from org to unit to company). HR admin sets every table by import and may edit any in the app. Tables
marked "HR admin only" show read only to Finance with "Set by import" (7.4). A Finance edit, and an
assumption set given to `version.create`, is refused under 7.4's edit rule: "This change would move cost for fewer than 5 costed people." Every edit is audited with the
Acting as name.

| table | key | value | note | Edited in the app by |
|---|---|---|---|---|
| `band` | level \| zone \| fiscalYear | midpoint, local currency | zone = location in Phase 1; FY28 = FY27 × (1 + band increase) | Finance |
| `bonusTarget` | level | fraction | comp row's targetBonusPct overrides per person | HR admin only |
| `bonusFunding` | fiscalYear | fraction | | HR admin only |
| `equity` | level | USD a year at 1.0 FTE | used only "incl. SBC" | Finance |
| `burden` | country \| component | rate | | Finance |
| `burdenCap` | country \| component | local amount, not scaled by FTE | blank = uncapped | HR admin only |
| `benefits` | country | local amount a head a year, not scaled by FTE | | Finance |
| `severance` | country | months of local base | one-time, booked by the 6.3 rule (the month containing the eliminated Filled seat's endDate + 1 day) | Finance |
| `merit` | fiscalYear \| date, pct, cutoff | date as `YYYYMMDD` | | HR admin only |
| `promotionPool` | fiscalYear \| date, pct | uplift on Filled base from the date | | HR admin only |
| `fx` | currency \| set \| month | USD per 1 local | sets plan, actual (closed months), forecast (open months) | Finance |
| `timeToFill` | level | days | | Finance; HRBP (its unit, in Working) |
| `fillRate` | (org) | fraction | rest is "Unfilled at horizon" | Finance; HRBP (its unit, in Working) |
| `attrition` | (org) | annual fraction | | Finance |
| `backfillRate`, `backfillLag` | (org) | fraction, months | 0 under a freeze | Finance; HRBP (its unit, in Working) |
| `vacancyFactor` | (org) | fraction of filled cost | plan versions only | Finance |
| `glAccount` | component | account code | for the long CSV and FP&A load file | Finance |
| `trade` | standardHeadUsd, minFte, fteStep, partTime \| location, dimensions, creditLapse | | section 11 | Finance |

### 5.3 Plan state types (`src/plan/types.ts`, frozen in M1)

```ts
export type Month = `${number}-${string}`            // '2026-09'
export type FiscalYear = `FY${number}`               // 'FY27' = 1 Apr 2026 to 31 Mar 2027
export type PositionStatus = (typeof POSITION_STATUSES)[number]

export interface Position {                          // one effective-dated row, resolved "as of" a date
  positionId: string; effectiveDate: ISODate; status: PositionStatus; title: string | null
  jobFamily: string | null; level: Level; businessUnit: string; department: string | null
  costCenter: string; location: string; legalEntity: string; managerPositionId: string | null
  workerType: WorkerType; fte: number; startDate: ISODate | null; openedDate: ISODate | null
  reqType: ReqType | null; leaderLevel: boolean | null; endDate: ISODate | null; endReason: string | null
  sourceRequestId: string | null                     // status is as imported; lines derive Filled and Open (6.5)
}
export interface Assignment {                         // a person in a position, start to last day (inclusive)
  employeeId: string; positionId: string | null; start: ISODate; end: ISODate | null; fte: number
  workerType: WorkerType
}
export interface PlanLine {                           // position × version × month
  positionId: string; versionId: string; month: Month
  status: PositionStatus                             // Filled or Open derived from assignments (6.5)
  heads: number; fte: number; active: number         // active fraction under the version's proration
  currency: string; rate: number                     // USD per 1 local, from the line's rate set
  local: { base: number; bonus: number; burden: number; benefits: number; oneTime: number }
  usd: { base: number; bonus: number; burden: number; benefits: number; oneTime: number; equity: number; loaded: number }
  basis: 'hris' | 'offer' | 'band'                   // what the base came from (guard reads it)
}
export type VersionKind = 'budget' | 'reforecast' | 'working'
export interface Version {
  versionId: string; name: string; kind: VersionKind; fiscalYear: FiscalYear
  grid: { from: Month; to: Month }                   // the fiscal year plus up to 6 months, fixed at creation
  proration: Proration; state: 'working' | 'locked' | 'retired'
  // retired: a former Working replaced by a reopen; read only, never a picker default, no hash
  createdAt: ISODateTime; lockedAt: ISODateTime | null; lockedBy: string | null
  engineVersion: string; parentId: string | null; hash: string | null   // 'sha256-<hex>' when locked
}
export interface LockedVersion extends Version {
  state: 'locked'; lines: PlanLineTable; assumptions: AssumptionRow[]; rates: FxTable
  forecast: ForecastTable | null                     // reforecasts store their forecast
}
export interface MonthClose {                         // HRIS actuals snapshot
  month: Month; closedAt: ISODateTime; by: string; lines: ActualLineTable; hash: string
}
export interface Adjustment { id: string; postedIn: Month; forMonth: Month; positionId: string
  kind: 'hire' | 'exit' | 'other'                    // pay, comp, FTE and leave changes are all 'other'
  delta: ActualLine; reason: string }                // generated from kind ('Back-dated hire', 'Back-dated exit',
                                                     // 'Other HRIS change'); never typed, never names leave (6.6)
```

`PlanLineTable` and `ActualLineTable` are columnar (one `Float64Array` per number column plus string
indexes) so a locked version of about 30,000 lines stays small; `rows()` yields `PlanLine` objects for
drills. The lock hash is SHA-256 from `src/lib/sha256.ts` over canonical JSON: lines sorted by positionId
and month, money in integer cents, then assumptions sorted by key, rates, proration and engine version.
`sha256.ts` is Census's `src/access/overrides/sha256.ts` with its test: synchronous, pure and
dependency-free, with the word "Census" removed from its doc comment (noCensus test). No hash uses
`crypto.subtle`: lock hashes, audit chain hashes and workspace checksums are all computed synchronously,
so `generateSample()` stays synchronous and models can verify them. Locked lines are never recomputed;
editing Working's assumptions cannot move a locked total (test).

Requests, steps, comments, cycles, transfers and trades are in sections 10 and 11. Audit:

```ts
export interface AuditEntry {
  seq: number; at: ISODateTime; by: string; byName: string; mode: Mode
  object: 'position' | 'request' | 'version' | 'assumption' | 'target' | 'freeze' | 'cycle' | 'close' | 'transfer' | 'workspace'
  id: string; field: string; old: unknown; new: unknown; effectiveDate: ISODate | null; comment: string | null
  commentAudience: 'everyone' | 'approvers' | null   // set when `comment` comes from a request comment or a
                                                     // decision note, so auditView can apply commentVisible (8.4)
  prevHash: string; hash: string                     // sha256 over canonical JSON of the entry without hash
}
```

### 5.4 PlanStore, storage and the write lock

```ts
export interface PlanStore {
  load(): Promise<PlanState>
  save(next: PlanState): Promise<void>                          // refuses unless this tab holds the write lock
  lockVersion(workingId: string, as: { kind: 'budget' | 'reforecast'; name: string }, by: Actor): Promise<LockedVersion>
  // computes the year's Working as of now into a NEW locked version (parentId = workingId); Working stays editable
  appendAudit(e: Omit<AuditEntry, 'seq' | 'prevHash' | 'hash'>): Promise<AuditEntry>
  listAudit(filter?: AuditFilter): Promise<readonly AuditEntry[]>
}
export class BrowserStore implements PlanStore { /* over src/data/idb.ts */ }
export class MemoryStore implements PlanStore { /* tests */ }
```

- `src/data/idb.ts` is the only importer of `idb-keyval`. It creates `createStore('headcount-planner',
  'kv')` and exports `idbGet/idbSet/idbDel/idbKeys/idbClear`. Tests mock `@/data/idb` with
  `src/testkit/memoryIdb.ts`.
- Keys: IndexedDB `hcp:dataset:<k>`, `hcp:versions:<k>`, `hcp:raw:<k>:<versionId>`, `hcp:profile:<k>:<fp>`,
  `hcp:plan` (plan state), `hcp:plan-aside:<baseline id>` (one kept copy of the plan state made on
  each earlier sample, B9), `hcp:audit:<chunk>` (500 entries a chunk). localStorage `hcp:settings`,
  `hcp:filters`, `hcp:views`, `hcp:lists`, `hcp:metrics`, `hcp:mode`, `hcp:help`, `hcp:actions`.
  sessionStorage: none. `src/app/storageKeys.ts` lists every key (test scans `src` for `hcp:` literals).
- The sample is regenerated deterministically on every load and never stored. Plan state made on the
  sample is stored as an overlay against the sample's baseline id, so a reload keeps your approvals.
  The baseline id is 'northgate-' plus 12 hex digits of a SHA-256 over the canonical JSON of every
  generated dataset, the raw extracts' planted rows and the seeded plan state (`sampleBaselineId`,
  M4 review B9). When a new build generates a different sample, the stored state is set aside with
  the app's notice, kept at `hcp:plan-aside:<its baseline id>` before the first write on the new
  sample, and offered on Data room > Workspace as "Changes on the earlier sample" (save as a Full
  file, or remove the kept copy); it is never mixed with the new sample (R127).
- **Write lock**: `tabSync.ts` adds `acquireWriter(): Promise<'writer' | 'reader'>` using
  `navigator.locks.request('hcp:writer', { ifAvailable: true }, …)` held for the page's life. A reader tab
  queues a blocking request and becomes the writer when the first tab closes. Without Web Locks it falls
  back to a BroadcastChannel heartbeat. The store exposes `readOnly`; every PlanStore write and
  `replaceDataset` refuses in a reader tab; the masthead shows "Read only: Headcount Planner is open in
  another tab." Readers re-read IndexedDB when the writer posts a change (Census's sync). Tested with an
  injected lock API.
- Start-up races IndexedDB against 1,500 ms as Census does and falls back to the sample with a notice.

### 5.5 Workspace file `.hcplan.json`

```ts
export interface WorkspaceFile {
  format: 'hcplan'; version: 1; kind: 'shareable' | 'full' | 'requests'
  notice?: FullFileNotice                            // Full files only, written first: "Contains individual pay"
  modeLine?: string                                  // manager files only, written first: the Manager line (D-MODELINE)
  savedAt: ISODateTime; app: 'Headcount Planner'; mode: Mode; scopeLabel: string
  scopeKey?: string                                  // the scope identity "Open a shared file" compares (review RM-3)
  actingAs: boolean
  checksum: string                                   // 'sha256-<hex>' via src/lib/sha256.ts over canonical JSON of `body`
  body: { datasets?: Partial<Datasets>; plan: PlanStateSlice; lockedVersions: LockedVersionRef[] }
}
```

- **Shareable** (any mode): holds only what the exporting mode and Acting as person see, already through
  the guard. Its `PlanStateSlice` is that mode's guarded output, never raw plan state: requests filtered
  by `requestView`, comments by `commentVisible`, audit rows by `auditView`; locked versions and month
  closes by reference only (id, name, state, hash); no `pay` or `leave` fields and no `PlanLineTable`,
  `ActualLineTable`, `Adjustment` or comp rows; amounts only as the mode's model values (rounded, folded
  or absent exactly as on screen). The workspace engine builds every file except Full from the guarded
  models it is given, never from `PlanStore`.
- **Full** (HR admin with "Show pay amounts" on): everything. The save dialog and the file's first
  line say "Contains individual pay".
- **Requests** (`export.requests`, "Export requests", every mode, in Requests > Mine and the Queue
  header): `body.plan.requests` with their steps and comments only. It holds only requests whose
  `requestView` is 'full' for the exporter and Acting as person, so a limited row is never written and
  can never merge as a blank request. Comments are filtered by `commentVisible`. Files from Manager mode
  hold no amounts (11.6). Finance's file carries its approval decisions back to the HRBP.
- **Export for a manager** (`export.for-manager`: HRBP, Leader for managers in their org, HR admin): pick
  a manager, and the file is built exactly as a Shareable made in Manager mode acting as that manager
  (header `mode` 'manager'). It holds no amounts, no band estimates, no approvers-only comments and
  nothing about the manager's own seat or above. This is the file for sending decisions back to a
  manager: re-guarding on open does not protect a file that is sent anyway, because its JSON is readable.
- **Import** validates the schema with hand-written validators (copy known keys only; never spread parsed
  objects; reject `__proto__`), refuses a Shareable or Requests file over 25 MB and a Full file over
  150 MB (C35, each with its own sentence), a bad checksum, a newer `version` or a foreign
  `format`, then shows a diff (datasets row counts, plan state changes, versions) before **Replace** or
  **Merge**. Locked versions must match by hash: a file whose Budget hash differs is refused with "This
  file's FY27 Budget does not match this workspace's (hash differs). Nothing was imported."
- **Import requests** accepts kind 'requests' or 'shareable', reads only `body.plan.requests` (with their
  steps and comments), skips a row missing a required `requests` field and ignores every other key; any
  other kind is refused with "This file has no requests to merge." It merges by `requestId` (the later
  revision wins: `revisedAt`, else `updatedAt` for older copies, compared as times, R77; a request
  changed on both sides since the last merge is a conflict listed for a choice): "Merged 14 requests
  from 6 files, 2 conflicts".
  - In Leader mode with a tree scope (not CEO, CFO or CHRO), a request merges only when it touches a
    position in the Leader's tree or the Leader is on its approval chain. Other requests are skipped, and
    the workspace's copy is never overwritten.
  - The summary and the conflict list count and show only requests whose `requestView` for the importer
    is not 'none' (8.4 rule 3), so a skipped request about the importer's own seat changes no number.
  - The sample's message comes from six kind 'requests' files built by `sample/raw` (testkit), separate
    from the bronze `requests` dataset in the Data room. `workspace/mergeRequests.test.ts` asserts the
    counts, that the later revision wins (`revisedAt`, else `updatedAt`, R77) and that rows changed on
    both sides are listed as conflicts.
- **Open a shared file** (`workspace.open-shared`, read only; nothing merges) renders a file only through
  the current mode's guard and the current Acting as person's person-level rules (`requestView`,
  `commentVisible`, `auditView`), never through the mode it was made in. In Manager mode, a file whose
  header `mode` is not 'manager' shows only heads, request states and "Changed by your HRBP" notes that
  pass the acting manager's rules, under the note "This file was made in <mode> mode and holds more than
  Manager mode shows. Ask for one made for your team."
- Checksums catch damage, not forgery. The words "tamper-proof", "tamperproof" and "tamper proof" never
  appear (test).
- Who: export Shareable and Export requests in every mode; Export for a manager in HRBP, Leader (managers
  in their org) and HR admin; export Full and Import (Replace, Merge) in HR admin; Import requests in
  HRBP, Leader (their org, as above), Finance and HR admin; Open a shared file in every mode (question 8,
  so managers can see decisions come back).

---

## 6. Calculations (pure engines) with fixtures

All engines are pure functions in `src/plan/engine/`, take plain data plus an explicit `asOf` (never
`Date.now()`), and return exact numbers. Money is carried in floating point but summed in a fixed order;
tests compare to the cent with `toBeCloseTo(x, 2)` or in integer cents. Each engine output has a
`MetricDef` (section 12). Dates are ISO strings; the fiscal year runs April to March (`src/data/fiscal.ts`:
`fiscalYearOf`, `fyRange`, `monthsOf`, `monthEnd`, `quarterOf`, fiscal `periodWindow`).

### 6.1 Heads and FTE (`heads.ts`)

- `isActiveOn(a, d) = a.start <= d && (a.end == null || a.end >= d)`: the last day counts (Census's
  `isActiveAt` does not; HCP pins the difference with a fixture).
- Employees count 1 head, on leave too. Interns and contractors count 0 heads and are not costed (Phase 2
  adds contractors). On-leave employees are always costed people. Pay lines (base, bonus, burden,
  benefits, equity) are 0 for a month whose close snapshot (or, for open months, the current `workers`
  row) has `onLeave` true and `leavePaid` false. The employee stays in every costed-people count, atom,
  fold and drill: leave changes amounts, never who is costed.
- Average FTE is always daily: Σ over days of Σ active assignment FTE ÷ days in the window.
- **Fixture H1**: a 1.0 FTE hire on 16 Sep 2026 is 1 head at 30 Sep and 0.5 average FTE for September
  (15 of 30 days), under every proration.
- **Fixture H2**: a last day of 30 Sep is 1 head at 30 Sep and 0 at 1 Oct.

### 6.2 Proration (`proration.ts`)

`activeFraction(method, month, start, lastDay)`:

| Method | Rule |
|---|---|
| `daily` | active days ÷ days in the month |
| `half-month` | start on day 1 to 15 counts 1, later 0.5; last day on 1 to 15 counts 0.5, later 1; both in one month 0.5 |
| `full-month` | 1 if active on the month's last day, else 0 |

The half-month "both in one month" rule is kept literally as the spec states it (0.5), with a fixture.
Proration is a property of each version and is stored in its lock.

### 6.3 Cost per position (`cost.ts`, `band.ts`)

Annual amounts in local currency, then monthly USD:

- **Base**: Filled = FTE-equivalent base × FTE (0.6 FTE at €100,000 = €60,000). Open and Planned =
  midpoint × FTE, or `offerBase` × FTE once an offer is accepted (basis `offer`; `offerBase` is an
  FTE-equivalent rate, like `baseSalary`). An accepted offer is costed from `reqs.startDate` (the agreed
  first day), never from the position's `startDate`; its seat cannot be edited or traded (10.1, 11.2).
- **Bonus** = base × target % × funding %.
- **Burden** = Σ over components of rate × min(base + bonus, cap); the cap is not scaled by FTE.
- **Benefits** = the country's amount a head (not scaled by FTE).
- **Equity** = level amount × FTE, USD, shown only "incl. SBC".
- **Merit** runs from the merit date for anyone started by the cutoff, with bonus and burden following,
  unless the latest comp row is on or after the merit date (a 1 Apr 2026 row gets no FY27 merit). Open
  and Planned seats step to the next year's band on the merit date instead. The sample's FY27 merit date
  is 1 Apr 2026 (so FY27's merit is already in HRIS pay) and FY28's is 1 Apr 2027.
- **Promotion pool**: a % uplift on Filled base from its date, by org.
- **One-time** items (sign-on, relocation, agency fee, severance) book whole in their month: sign-on and
  relocation in the start month, agency fee in the offer-accepted month. Severance (the country's months
  × the seat's monthly local base on its last day) books in the month containing endDate + 1 day, the
  first day the seat is Eliminated. An eliminated seat's endDate is its last day (inclusive, R19), and
  its Eliminated row is effective endDate + 1 day. A pending elimination books nothing.
- **Monthly USD** = [(base + bonus + burden + benefits) ÷ 12 × active fraction + one-time] × the line's
  rate + equity ÷ 12 × active fraction. Loaded cost excludes the equity term.

```ts
export function annualLocal(input: CostInput): { base: number; bonus: number; burden: number; benefits: number }
export function monthLine(position: Position, month: Month, ctx: LineContext): PlanLine
export function positionLines(position: Position, version: Version, ctx: LineContext): PlanLine[]
export function bandEstimate(seat: SeatType, org: string, loads: Loads, planRate: number): BandEstimate  // annual, USD
```

**Fixture C1 (the spec's Munich P4)**: Planned P4 in Munich, starts 16 Sep 2026, midpoint €110,000,
target bonus 10% × funding 100%, burden 21% capped at €90,600, plan rate 1.08, no equity or benefits.
Bonus €11,000; burden 0.21 × min(121,000, 90,600) = €19,026; annual €140,026; monthly €11,668.83.
September daily = half-month = €5,834.42 = **$6,301.17**; full-month **$12,602.34**. Extra pins: FY27
daily for this seat (Sep 0.5 + Oct to Mar 6.0 months) = €75,847.42 = $81,915.21 at 1.08.
**Fixture C2**: 0.6 FTE at €100,000 FTE rate = €60,000 base; the burden cap stays €90,600.
**Fixture C2b**: an Open 0.6 FTE seat with an accepted offer at €100,000 (FTE rate) costs €60,000 base,
basis `offer`; the burden cap stays €90,600.
**Fixture C3**: merit: an employee hired before the cutoff with latest comp row 1 Mar 2027 gets FY28
merit from 1 Apr 2027; one with a row dated 1 Apr 2027 gets none.
**Fixture C4 (severance)**: a 1.0 FTE Filled seat in Germany at €120,000 base with severance of 3
months: a last day of 31 Dec 2026 books €30,000 one-time in 2027-01 and nothing in 2026-12; a last day
of 15 Dec 2026 books it in 2026-12. A pending (not approved) elimination books nothing.

### 6.4 FX (`fx.ts`)

Plan rates for plan lines; actual monthly rates for closed months; forecast rates for open months.
Two currencies are never summed in local terms. FX effect = Σ actual local × (actual − plan) + Σ forecast
local × (forecast − plan).

`plan` is the comparison version's plan rate for that currency and month: the locked Budget's or reforecast's stored `rates`. The comparison is always a locked version or the target (9.2), never Working; with a target comparison the FX effect, like Forecast > Bridge, computes nothing and shows 9.2's empty state. The
forecast never reads a plan rate, so editing Working's plan FX changes neither the forecast nor the FX
effect against Budget or Q1 Reforecast (test). `fxEffect(lines: PlanLine[], comparisonRates: FxTable):
number`; the `forecast.fx.effect` tile names its comparison like every other "vs" figure.

**Fixture X1**: €120,000 in open months, plan 1.08, forecast 1.15: plan $129,600, forecast $138,000, FX
effect **$8,400**. The bridge's FX step must equal `fxEffect` on the same lines (test).
**Fixture X2**: Working plan EUR 1.10, Budget plan 1.08, forecast 1.15, €120,000 in open months.
Against Budget, `fxEffect` and the bridge's FX step are both **$8,400**. A build that reads Working's plan rate (1.10) instead of Budget's stored rate, giving $6,000, is the negative control.

### 6.5 Plan lines, plan heads and versions (`versions.ts`)

- **Status derives from assignments** in every computed line (Working live, and at lock). On a day, a
  seat with an active Employee assignment (`isActiveOn`) is Filled. A seat without one takes its
  effective row's status, except that a row saying Filled reads Open from the day after the last
  assignment's last day. The imported `status` is used only for Planned, On hold and Eliminated, which
  no assignment can show, and by `reconcile.ts` (6.10). A seat that turns Open after an exit takes its
  planned start from its replacement (an open req's `targetStartDate` or an approved Backfill's start),
  never from the leaver's; until it has one it is an approved head but not a plan head, and its line has
  no cost.
- Plan heads at a month-end = positions whose plan line status is Filled at that month-end (Filled
  seats, plus Open and Planned seats whose planned start is on or before it).
- Approved heads at a date = Filled + Open + Planned positions on the date whose start is on or before
  the end of the date's fiscal year (so a seat approved now for FY28 is not an FY27 head; a seat with no
  planned start counts).
- Working lines are computed live from positions, assignments, comp, reqs and the version's assumptions.
- Each fiscal year has exactly one version with state 'working'. Locking never freezes Working itself:
  `lockVersion` writes a new locked version (kind 'budget' for the year's first lock, otherwise
  'reforecast', named by Finance, `parentId` = the Working), and Working stays editable. Locked versions
  store lines, assumptions, rates, proration, engine version and a SHA-256, and are never recomputed.
  Budget never unlocks. Reforecasts store their forecast.
- **Reopen as new** (Finance) sets the year's current Working to state 'retired' (read only, named
  "<name> (replaced <date>)", never a picker default) and creates a new Working (`parentId` = the
  reforecast) from the reforecast's assumptions, plan FX rates and proration. Positions, requests and
  closes are shared plan state and do not change. Before reopening, a confirm lists the Working
  assumption and FX rows that differ from the reforecast and will be replaced. The audit records both the
  retire and the create. Test: a lock leaves Working editable and adds a locked version with `parentId`;
  reopening Q1 Reforecast leaves exactly one 'working' FY27 version, the old one retired, and the Budget
  and Q1 Reforecast hashes unchanged.
- Lines follow the current hierarchy: a locked line stores `positionId`, not the org, and the org is
  joined at read time, so a moved position's lines move with it while the hash still verifies (the
  version card says so).

**Fixture H3**: a seat imported as Filled whose holder's last day is 15 Oct 2026, with no req and no
Backfill request, is Filled with 1 head and 1 plan head at 30 Sep 2026 and Open from 16 Oct 2026
(`openedOn` 16 Oct). At 31 Oct 2026 it has 0 actual heads and 0 plan heads, is still 1 approved head and
is no longer a costed person. Its October line is basis `hris` for 15 of 31 days under daily proration;
from November it has no cost. `reconcile` at as-of 30 Sep 2026 reports no exception for it.
**Fixture H4**: a seat imported as Planned with an assignment starting 1 Sep 2026 is Filled with 1 plan
head in Working at 30 Sep 2026 (story 1's shape) and reports no exception; the same seat imported as
Open, On hold or Eliminated reports `assignment-on-open`.

### 6.6 Month close and actuals (`close.ts`)

Closing a month (Finance) snapshots HRIS actuals per assignment: heads, FTE and cost components from HRIS
pay at that moment ("Actual (HRIS estimate)"). Closed months are read from closes, not recomputed.

A back-dated change (a hire, exit, comp row, FTE or leave change effective in a closed month) posts as an
adjustment in the first open month. It is listed in Finance > Versions and counted in the bridge's
timing step. `Adjustment.kind` is 'hire' | 'exit' | 'other'; pay, comp, FTE and leave changes are all
'other'. `reason` is generated from the kind ("Back-dated hire", "Back-dated exit", "Other HRIS
change"), is never typed and never names leave. Outside HR admin with the switch:

- Hire and exit adjustments list by position with no amount (they are heads events).
- "Other HRIS change" shows only as a count per posted month, and only when it is 5 or more, else "—".
  It has no drill to positions (an exception to 9.5's drill rule).
- Adjustment amounts show only as sums by posted month, under rules 1 and 5 of 7.2 (5+ costed people
  and 5+ contributors; leave transitions count).
- HRBP (read only, unit scope) sees the counts only, with no amounts, because rounded modes show no
  monthly cost (7.3).

The sample closes April to September 2026.

### 6.7 Forecast (`forecast.ts`)

Forecast = closed actuals + a month-by-month projection to the end of the grid.

1. **Starts**, each with probability = fill rate (the rest is "Unfilled at horizon"): an Open seat starts
   at max(target start, as-of + max(0, time to fill − days since `openedOn`)); a Planned seat at
   max(planned start, as-of + time to fill); On hold never; accepted offers are certain on
   `reqs.startDate`. An exit leaves the seat Open from the day after the last day (6.5); with no req it
   is flagged "no req" in Openings. `openedOn(seat, asOf)`, also used by `plan.openings.age`, takes the
   first of these that exists: (a) the `openedDate` of the seat's latest req with status Open or On hold;
   (b) the position's own `openedDate`, if it is after any earlier holder's last day; (c) for a seat Open
   because of an exit with no req, the last day + 1; (d) otherwise, the `effectiveDate` of the earliest
   row in the seat's current run of Open rows.
2. **Exits**, by cohort: monthly rate = 1 − (1 − annual)^(1/12). The **HRIS cohort** is the people in
   Filled seats at the as-of date plus accepted offers from their start date (both fixed by HRIS and ATS
   data). Its modeled exits in a month = max(0, HRIS-cohort heads at the start of the month × rate −
   known exits that month). The **band cohort** is probability-weighted starts and modeled backfills. It
   faces attrition from the month after each start: band-cohort heads at the start of the month × rate,
   with no known exits. A named exit is never predicted. Attrition is Finance's (R18).
3. **Backfills**: modeled exits × backfill % (0 under a freeze), after the lag in months, reopening the
   same position (never an Eliminated one).
4. **Cost**: Filled at HRIS pay; accepted offers at offer; HRIS-cohort modeled exits at the unit's average HRIS cost per head (the company's when the unit has under 5 costed people), all in the **filled part**. Never a department's average: Finance reads any shown cost center's exit cost, so a department's average × its costed people − its shown cost centers would give its people in the unit's Other. Probability-weighted starts at midpoint, band-cohort modeled exits at each seat's
   band estimate and backfills at midpoint, all in the **band part**. No input the HRBP or Leader can
   change reaches the filled part. Freezes hold unstarted openings (no start while frozen) but honor
   accepted offers.

```ts
export function forecast(input: ForecastInput): ForecastResult
// ForecastResult: months[{ month, heads, fte, starts, knownExits, modeledExits, backfills, cost: Components }],
// expected starts by position, unfilledAtHorizon, yearEnd { heads, cost }
```

**Fixture F1 (the double-count trap)**: 100 heads, attrition 12% a year, backfill 100%, lag 1 month,
fill rate 1. Dana's P-1042 ends 15 Oct with backfill request R-88 starting 1 Dec. Monthly rate
0.0105962 (1.06%). October modeled = max(0, 100 × 0.0105962 − 1) = **0.0596** (shows 0.06). November
heads at start = 100 − 1 − 0.0596 = 98.9404, modeled = **1.0484** (shows 1.05). P-1042 reopens and fills
through R-88 on 1 Dec; no extra seat is added and Dana never appears in modeled exits. The wrong model
(Dana modeled plus R-88 as a new seat) is the negative control. F1 is all HRIS cohort until R-88 starts
on 1 Dec, so both figures hold under the cohort split.
**Fixture F2 (cohort invariance)**: moving a Planned seat's start from 1 Jan 2027 to 1 Nov 2026 changes
band-cohort exits and the band part only; the filled part is identical to the cent.
**Fixture F3 (`openedOn`)**: a seat moved from Planned to Open by Start recruiting on 21 Aug 2026, 40 days
before as-of 30 Sep 2026, with time to fill 60 days and target start 1 Oct 2026: `openedOn` = 21 Aug,
start = max(1 Oct, 30 Sep + max(0, 60 − 40)) = **20 Oct 2026** (as-of + 20).
**Expected starts by month** (the Forecast view's flows, `views/forecast/engine/heads.ts` `forecastFlows`;
review RS-3, 27 Oct 2026): an expected start the run dates in a closed month (an Open seat past its time to
fill starts on the as-of date, which falls in a closed month on a month-end as-of date) counts in the first
open month, where the run counts its heads from, so the year-end card's "Timing within months" step is
about 0 and the expected starts add up to the heads (R147). An offer start the run dates in a closed month
does not move: with the as-of date before the last close it is the HRIS hire the run read as a pre-hire,
which the closed month already counts, and the run's own starts row counts an offer only from its first
projected month (finish audit AG-1, 28 Oct 2026).

### 6.8 Variance and bridge (`variance.ts`, `bridge.ts`)

- Variance = actual or forecast − comparison version, in heads, average FTE and cost, by month, QTD, YTD
  and full year. Positive cost variance is over budget.
- Bridge from the comparison total to the forecast total by sequential substitution, one driver at a
  time, in this fixed order: (1) timing (dates and fill timing), (2) position changes (added, eliminated,
  traded), (3) attrition against the vacancy factor, (4) mix (level, location, FTE), (5) pay rate (HRIS
  pay and offers against the comparison's basis), (6) assumption rates (bonus, funding, burden,
  benefits, merit), (7) transfers (positions entering or leaving the scope), (8) FX. Each step = total
  after − total before. Steps 1 to 7 are priced at the comparison's plan rates; step 8 swaps them for
  actual rates in closed months and forecast rates in open months, so the FX step =
  `fxEffect(forecast lines, comparison rates)`. Other changes is always a row of a costed bridge and
  takes each step's costed remainder that does not show, so no "Rounding" bar is needed (C34); the
  transfers step reads 0 under R26 (R39).
- Tests on exact output: the end state equals the forecast engine's total; the FX step equals the FX
  formula on the same lines; steps sum to end − start.

**Fixture B1 (spec example)**: plan $10.0M, forecast $10.6M; timing −$0.3M, position changes +$0.5M,
attrition −$0.2M, mix +$0.1M, pay rate +$0.2M, assumption rates $0, transfers $0, FX +$0.3M; steps sum
to +$0.6M (integer cents, no float drift).

### 6.9 Targets, allocation and budget status (`targets.ts`, `allocation.ts`, `budgetStatus.ts`)

- **Asks** (heads) at the target date = Working Filled, Open and Planned positions on the target date
  whose start is on or before it (a seat with no planned start counts) + Σ head effect of each pending
  request (Submitted, In review or Sent back) that takes effect by then. With a blank target date (the FY
  end) the first term is Working approved heads at the FY end, so R1 holds: an FY28 seat is never an FY27
  ask.
- **Head effect** (`headEffect(request, orgPositionId, date)`) is what approving the request would do to
  the org's asks at that date:
  - New role: +1.
  - Trade: seats received − Open or Planned seats given (an On hold seat given counts 0).
  - Elimination: −1 if the seat counts in asks on the date, else 0.
  - Backfill: +1 if the named seat is On hold on the date (for example, held by an internal move), else
    0, because the seat is already counted.
  - Transfer, position move: −1 for the org it leaves and +1 for the org it joins (0 within one org).
    Internal move: −1 for the org whose seat goes On hold; the receiving Open seat is already counted.
  - Start date: +1 if it moves an Open or Planned seat's start from after the date to on or before it,
    −1 for the reverse, else 0.
  - Level change, Location change, Start recruiting: 0.
- **Asks cost** covers the target's fiscal year: the year's loaded cost of Working lines + the in-year
  band effect of each pending request effective in that year (`bandEffect`, in the band part). The band
  effect is the band-estimate change approving would make to the org's seats (seats added +, seats
  removed or put On hold −, a Level or Location change the difference), at band estimate ÷ 12 × the
  version's active fraction for each month from the start or effective date to FY end (a trade's give
  seats from the first open month), at plan rates, no equity. A pending request never reads HRIS pay, an
  offer or severance; those move Working only when the request is approved and applied. An annual band
  estimate is never added to an in-year total.
- **Gap** = target − asks, in heads and cost. Gap after approval = the gap with this request left out of asks − the request's head effect and band effect (10.2), so for a pending request it equals the current gap (11.7); never a recompute of Working. `headEffect` and `bandEffect` feed asks, gap after approval, the out-of-plan test (10.2) and the What if gap. Manager budget status reads `headEffect` and each pending request's band cost (midpoint × FTE) from its start, never `bandEffect`.
- Out of plan (computed once in `chainFor`) and every over-target flag compare the target with the
  guarded asks cost (7.2 rule 8), the same in every mode; Finance's exact Gap table is unchanged. Test:
  perturbing a Filled `baseSalary` or an `offerBase` without changing its atom's rounded value leaves
  every out-of-plan bit and over-target flag unchanged.
- **Sub-org targets** sum to at most the parent; the rest is "Unallocated". A move past a sub-org's cost
  envelope needs a Finance exception. A leader's sub-org targets carry a cost target only for sub-orgs
  that are whole unions of atoms; other sub-orgs get heads targets only.
- **Tree × cost center**: a leader's tree nodes against Finance's cost centers, with heads per node ×
  cost center. Cost shows per unit × cost center (the Plan > Overview folded breakdown), and per node
  only under 7.4 "Org rows below the unit".
- **Manager allocation** (constant for the fiscal year; the KPI shows its heads): the tree's Filled, Open
  and Planned positions at FY end in the plan of record, each priced at its plan-of-record level,
  location and FTE (the row effective on the lock date), + approved adds since the lock at their approved
  values (trade get seats included) − approved eliminations since the lock (trade give seats included).
  On hold and Eliminated seats are not in it. Band cost = Σ midpoint × FTE at the current band year.
  Approved Level, Location and FTE changes and HRBP Working edits do not change the allocation. The
  manager's own seat and anything above it are never in their tree. Standard heads show only as a note
  on Allocation (`team.trade.standardHeads` = Σ weight of the allocation's positions ÷ 10,000) and never
  set Over or At risk.
- **Staffed** at each month-end from the as-of month to FY end: heads = employees in the tree's Filled
  seats (a known exit leaves after its last day) + known starts by then (accepted offers at their start
  date) + not-in-plan employees who report into the tree. Band cost = Σ midpoint × FTE of those people's
  seats at the seats' current Working level, location and FTE (a not-in-plan person at their HRIS level
  and location).
- **Budget status** (Manager) never reads HRIS pay or offers. Pending requests add their head effect and
  their band cost (midpoint × FTE) from their start, for the crossing test only. An approved trade is
  absorbed by the allocation; a pending one counts by its head effect. The first that applies shows:
  1. **Over**: staffed heads or band cost above the allocation at the as-of month-end.
  2. **At risk, crossing**: staffed, or staffed + pending, above the allocation at any month-end to FY
     end ("Start dates push you over in Feb", "A pending request adds 1 head in Mar", "A pending trade
     adds 7 heads from Jan", "Level changes put your band cost over your allocation in Feb").
  3. **At risk, within 2%**: staffed band cost at 98% or more of the allocation's band cost at the as-of
     month-end ("Your band cost is within 2% of your allocation").
  4. **On track**.

  A fully staffed team therefore reads At risk, the literal "within 2%" (15.1 R32). Reasons are in heads
  or plain drivers, never amounts.
- Also: `fin.exitRunRate` (as `forecast.cost.exitRunRate`: recurring monthly USD of the last FY month ×
  12, no one-time), `fin.forecastAccuracy` (as `forecast.accuracy.cost`: 1 − |forecast − actual| ÷
  actual over closed months after a reforecast lock), and freeze savings (`finance.freeze.savings`): the
  sum, over openings held by a freeze, of the opening's band estimate (at plan rates) ÷ 12 × the active
  fraction for each month held (from the later of the freeze start and the
  opening's unfrozen forecast start, to the earlier of the freeze end and the grid end), plus suppressed
  modeled backfills at midpoint. It never reads the comparison line's cost, HRIS pay or an offer: a seat
  Filled when the comparison was locked carries its former holder's pay (basis `hris`). It is a band figure (guard B), never added to a filled total, shown only in Finance and HR admin (HRBP and Leader hide it through `cost:component`, 8.3 and 7.3; the openings held still show), and the same per freeze and per opening in Finance > Freezes. Test: a seat Filled at Budget lock whose holder's last
  day is 15 Jul 2026 reopens and is held by a freeze from 1 Aug 2026; its savings equal its band
  estimate ÷ 12 per month held, and no value equal to its Budget line × months held appears in Finance >
  Freezes, the home or an export.

**Fixture G1 (story 6)**: target = B + 40, asks = B + 58 (FY28 Working approved heads at 31 Mar 2028 equal
FY27 Working approved heads at 31 Mar 2027 = B, plus 58 pending asks): gap **−18**; the cut line falls
after the 40th ranked head.
**Fixture G2 (target date)**: a target dated 30 Sep 2027 (FY28). A Planned seat starting 1 Jan 2028 and a
pending New role starting 1 Jan 2028 are both left out of asks. With the target date blank (31 Mar 2028)
both count.
**Fixture G3 (in-year asks cost, 11.7 rates)**: the T1 trade pending, its give seat Planned from 1 Nov
2026, its 8 get seats from 1 Jan 2027, first open month 2026-10. Asks cost changes by 8 × $33,859.20 ×
3/12 − $287,400 × 5/12 = $67,718.40 − $119,750.00 = **−$52,031.60** (the quote's inYearBp −3,469.33 is
−$52,040.00, the $8.40 apart being bp rounding). Negative control: adding the annual band estimate gives
$270,873.60 − $119,750.00 = +$151,123.60 and must fail.
**Fixture A1 (budget status)**: every seat $80,000 midpoint, FTE 1; allocation 6 heads, $480,000.
(1) 5 Filled + 1 Open seat with an accepted offer starting 1 Feb 2027: staffed $400,000 (83%) at 30 Sep
2026, and 6 heads and $480,000 (equal, not above) from Feb: On track. (2) Add a pending New role starting
1 Mar 2027: "At risk: a pending request adds 1 head in Mar". (3) A fully staffed team (6 Filled):
$480,000 (100%): "At risk: your band cost is within 2% of your allocation". (4) That team after an
approved Level change raising one seat's midpoint by $28,800: staffed $508,800 > $480,000: "Over: level
changes put your band cost over your allocation". (5) Negative control: pricing the allocation at current
Working levels makes (4) read At risk, and must fail.
**Fixture A2 (head effect)**: a pending Backfill on an Open seat leaves asks unchanged; a pending Backfill
on a seat held On hold by an internal move adds 1.

### 6.10 Reconciliation (`reconcile.ts`)

Exception kinds, comparing the imported `status` with assignments on the as-of date: `not-in-plan`
(active employee with no position), `cost-center-mismatch` (worker cost center differs from the
position's), `filled-no-assignment` (imported Filled with no active assignment), `assignment-on-open` (an
active assignment on an imported Open, On hold or Eliminated row), `overlap` (two assignments on one seat
outside an allowed handover of up to 30 days). Mid-month moves split by days under daily proration.
Worker type mismatches are data-quality issues, not reconciliation exceptions.

---

## 7. Cost guard

Census ROLES-V2 3.2 and `cost.ts`, adapted. Everything here runs in `src/cost/` and in the engines'
model builders, before any reader sees a number.

### 7.1 Pay views

```ts
export type PayView = 'switch' | 'exact' | 'rounded' | 'none'
export const PAY_OF: Record<Mode, PayView> = {
  'hr-admin': 'switch',  // switch off: Finance's rules and filter rule (7.5); switch on: per-person amounts, no guard
  finance: 'exact',      // exact totals over 5+ costed people, one cost-center fold per unit, never one person's pay
  hrbp: 'rounded',       // $0.1M round-down per cost atom, sumRounded, 5+, whole-atom filters, fy, ytd and qtd only
  leader: 'rounded',     // same
  manager: 'none',       // heads and band-cost status words only; no amounts anywhere
}
export const showPayIn = (mode, switchOn) => PAY_OF[mode] === 'switch' && switchOn
export const showCostIn = (mode, switchOn) => PAY_OF[mode] !== 'none'
export const roundedIn = (mode, switchOn) => PAY_OF[mode] === 'rounded'
```

If you answer question 3 "heads and ratios only", `hrbp` and `leader` become `none` and section 7.3 is
not built. "Show pay amounts" is session-only memory, never persisted, and turns off on every mode
change (Census rule). Only HR admin has the switch.

### 7.2 The rules (all modes)

1. **Minimum.** Every cost amount (totals, variance, bridge steps, FX effect, gap, per head, averages)
   needs 5 or more costed people, else it reads "—" with "Hidden to protect anonymity (n < 5)". Counts of heads still show. A figure's costed people are counted over its own version and window (month, QTD, YTD or FY): an employee in a Filled seat in the months where their active fraction under the version's proration (6.2) is above 0, on leave or not, and an accepted offer from its start date. A cost center of 4 Filled seats and 1 accepted offer starting 1 Feb 2027 has 4 costed people in every month to January and in YTD at 30 Sep. The minimum is read from `cost.guard.minCosted` (locked, raise-only), never from a
   constant.
   - **Components.** A component amount (base, bonus, burden, benefits, one-time, equity) also needs 5 or
     more contributing positions: positions with a non-zero amount in that component in that cell (month,
     QTD, YTD or FY), on every surface (screen, Cost by component, forecast components, calculation
     cards, long CSV, FP&A load file). Sign-on and relocation count hires, the agency fee counts accepted
     offers, and severance counts eliminated Filled seats (no longer costed people). If any component of
     a cell fails, the cell shows loaded cost only, with no split, because loaded minus the shown
     components would give back the hidden one. In the long CSV such a cell is one row with `component`
     `loaded`, `account` blank and `suppressedReason` "Components hidden (fewer than 5 in a component)".
     Fixtures in `guard.test.ts`: a 20-person cost center with one October hire carrying a sign-on and
     relocation shows loaded only for October, and no cell, Cost by component row or long CSV row equals
     the sign-on plus relocation; for one eliminated Filled seat, no cell, and no cell's loaded minus its
     shown components, equals its severance.
   - **Leave never changes who is costed.** Costed-people counts, the 5+ minimum, folds into Other (k),
     atom membership, the "n people in groups under 5 are left out" note, the 6.7 average-cost fallback,
     cost drill rows and contributor lists never read `onLeave` or `leavePaid`. Unpaid leave changes
     amounts only. Contributor lists show positions only, never why an amount changed.
2. **Fold.** In every breakdown, groups under the minimum fold into "Other (k)"; while Other is under the
   minimum and the total is shown, the smallest shown group joins it (Census `foldGroups`, verbatim,
   ties to the first in order). Invariant (`expectGuarded`): shown rows plus Other equal the total
   (within the rounding steps where rounded), every shown row has 5 or more, at most one Other.
   Finance's coarser rows are built from its one cost-center fold and are never folded on their own
   (7.4).
3. **Band apart.** Open and Planned seats costed at band estimate are a separate line ("Open and Planned
   at band estimate") and are never added into a filled total that has fewer than 5 costed people. In
   rounded modes the filled part and the band part are always separate rounding parts, added only by
   `sumRounded`, so editing a band seat can never move the filled part's rounded value. The filled part
   depends only on HRIS, ATS and Finance-owned inputs: no seat edit, pending request, approved request
   on an Open or Planned seat, trade quote, What if lever or HRBP-editable assumption moves it. Only an
   approved change to a Filled or accepted-offer seat does (15.3). Forecast exits split the same way:
   HRIS-cohort modeled exits are in the filled part, band-cohort modeled exits in the band part (6.7).
   `editInvariance.slow.test.ts` applies, for each sample HRBP and Leader persona, every input that mode
   can change (`position.edit` on start, level, location, FTE and On hold; an approved Start recruiting
   and Start date; each What if lever; Trade; fill rate and backfill % swept from 0.05 to 1.0 in steps
   of 0.05; time to fill and lag over their allowed ranges) and asserts every atom's exact filled part
   is equal to the cent for every month and version. Control: a build that costs band-cohort exits at
   the HRIS average fails.
4. **Per position.** Outside HR admin with the switch, nothing tied to a Filled seat, an accepted offer
   or a request's person shows: no per-position cost, no per-position line, no request estimate built
   from pay. Request estimates and the leader threshold use the band estimate. Pending requests enter
   asks, gap and gap after approval at band estimate only, in the band part (6.9); HRIS and offer amounts
   move only on approval. `baseSalary`, `offerBase`, `signOnBonus`, `relocation`, `agencyFee` and
   per-position cost columns are `pay: true`.
5. **Differences (spec rule (c)).** A displayed difference (variance, every bridge step, FX effect,
   month over month, version against version, What if deltas, gap change after approval, a KPI delta on
   a cost tile) needs 5 or more **contributors**: costed positions whose amount differs between the two
   sides by more than half a cent. Open and Planned seats at band estimate are public structure and do
   not count toward the 5. A difference in which only band-estimate amounts change (no Filled seat's
   HRIS amount, no accepted offer's amount and no leave status differs between the two sides) is a band
   figure (B), not a guarded difference: it shows wherever band estimates show (HRBP, Leader, Finance,
   HR admin; never Manager) with no contributor count. This covers What if cost deltas, a trade's cost
   effect and the gap change after approval (always a band-estimate effect, 6.9). As soon as any HRIS,
   offer or leave-driven amount differs, the whole difference falls under this rule, and band seats
   still do not count toward the 5. For the FX effect only non-USD costed people count. A difference
   with fewer contributors reads "—"; a bridge step with fewer folds into "Other changes" with the same
   while-under-5 rule. Contributors are counted at leave-neutral prices (R44), and the bridge's fold is
   decided once per mode, comparison and window over its finest grains (business units in exact modes,
   kept cost atoms in rounded modes) and applied in every scope, so a leave never changes which rows
   show (C34); in exact modes FX also folds unless every unit has 0 or 5+ non-USD movers in each month.
   This rule applies in every mode except
   HR admin with the switch. `differences.test.ts`: deferring one Planned seat in What if shows its band
   delta in HRBP, Leader and Finance and hides it in Manager; any difference with 3 Filled + 2 Open
   still reads "—".
6. **Text.** No amount ever appears in an Action item's `what` or `note`, a toast, a finding title or
   a comment shown outside its audience. Amounts go in amount columns under the pay rules.
7. **Exports and files** carry exactly what the screen shows, through the same engine output (section 14).
8. **Comparisons.** Out of plan (10.2, 11.4), the cycle's envelope check (10.3), and every over or under
   status, color or Needs attention item in HRBP, Leader and Manager modes (sub-orgs over target, gap
   sign) compare the target against the guarded asks cost: `sumRounded` over the org's atoms, each
   atom's filled part and band part separate (rule 3), atoms under 5 costed people left out. It is never
   an exact HRIS sum. If the org is not a whole union of atoms, or its asks cost would read "—" in
   rounded modes, only heads are compared. Routing is computed once, in `chainFor`, from this
   mode-independent value, never from Finance's exact figures. Finance's own exact gap table is
   unchanged. Tests in `chain.test.ts` and `targets.test.ts`: perturbing a Filled `baseSalary` or an
   `offerBase` so that its atom's `roundCost` is unchanged leaves every out-of-plan bit, chain, envelope
   check and over-target flag unchanged; sweeping a draft New role's start day by day, and its FTE in
   0.1 steps, flips out of plan only where the rounded asks, with the draft's band part, crosses the
   target.

### 7.3 Rounded modes (HRBP and Leader): cost atoms

The spec allows HRBP and Leader cost only if four conditions hold. This is how each one is met:

**(a) $0.1M floors per department or direct sub-org, units under 5 left out, summed with `sumRounded`.**
Two different partitions (departments for the HRBP, sub-orgs for the leader) laid over each other under
an open mode switch are exactly what pinned pay in Census's second red team. So there is **one rounding
partition for every rounded mode**, the cost atom:

- A **leader seat** is a position at Director (M2) or above, or one marked as a leader in Lists.
- A position's **atom** is the subtree of its nearest leader seat at or above it, minus the subtrees of
  any leader seats below that one. In words: a director's org, or a VP's own direct staff.
- Each atom's amount is rounded down to a whole $100,000 (`roundCost`, toward zero) on its own. Every
  rounded row (department, unit, sub-org, company, version, QTD, YTD, FY) is `sumRounded` over its atoms,
  which adds one step for every two parts of $0.1M or more. Atoms under 5 costed people are left out of
  every rounded total, with the note "n people in groups under 5 are left out".
- A row shows a rounded amount only if it is a whole union of atoms. HRBP department rows are unions in
  the sample (the generator keeps each director inside one department). A leader's direct sub-orgs are
  unions when they are headed by leader seats; the leader's direct staff who are not leaders form one row,
  their own atom. A director's direct sub-orgs (managers' teams) cut the director's atom, so a director
  sees cost for the whole tree and heads for its sub-orgs. Any row that is not a union shows heads only.
- The filled part and the band part of an atom are separate parts (rule 3).
- With no leader seats in imported data, the atom falls back to the department, then the business unit.
- **The atom index is fixed at each month close.** `close.ts` stores `atomIndex(positions, closeDate)`
  with the close, keyed by positionId, and every rounded figure (Working, forecast, locked versions, QTD,
  YTD, gap) uses the index stored by the last close. Working edits, requests, approvals and transfers
  never move a position between atoms before the next close. A position created since the close (a New
  role, or a trade's new seat) takes its manager position's atom. A Planned or Open seat raised to M2 or
  above stays in its old atom until the next close. A row that is not a union of the stored atoms shows
  heads only. `atoms.test.ts` checks against the last close's index that a `position.edit` level change
  to M2 on an Open manager seat, an in-unit position move approved in HRBP mode and an approved Level
  change on a Filled seat each leave every atom unchanged, and that a new Planned seat takes its
  manager's atom.

**(b) Cost filters are whole units and the period only.** Filters stay free for heads (leave counts
follow 7.7). A cost figure in a rounded mode checks `costFit(filters, scope, mode, switchOn)`: cost shows
only when (1) every filter other than period, version and comparison selects a union of atoms (unit,
department, leader), and (2) the period is `fy`, `ytd` or `qtd`, where `ytd` and `qtd` end at the last
closed month-end (never a mid-month as-of date). When (1) fails, the figure shows heads and the note
"Cost shows for whole departments and teams, by quarter, year to date and full year. Clear the location
and level filters to see it." Level, location, cost center, legal entity, country and currency filters
hide cost in rounded modes. When (2) fails (`month` or `custom`, including a month bar's "Filter to
this"), every cost figure shows heads and the note "Cost shows for the quarter to date, year to date and
full year in this mode." `fit.test.ts` covers every period preset in every mode. Only HR admin can move
the as-of date (`settings:data`, 8.3).

**(c) A difference is a total.** Rule 5 above, plus: in rounded modes a displayed difference is built
from rounded parts (`sumRounded` of one side's atoms minus the other's), so it says nothing the two
rounded totals do not. A band-only difference (rule 5) is a band figure and shows as one.

**(d) LP-tested.** `src/cost/costLp.slow.test.ts` ports Census's `costLp.test.ts` and its `lp.testkit.ts`
verbatim. That solver is a dense tableau sized for tens of unknowns and a few hundred constraints, so
the test never builds one LP over the company and never makes a set of atoms a constraint row.

**Observations** are one union, because Acting as and the mode switch are open: everything the
rounded-mode crawl (`testkit/crawl.ts`, 16.1) collects for every HRBP pick (all six units) and every
leader pick (every leader-seat holder, CEO, CFO and CHRO included), in both rounded modes, at two
consecutive closes (31 Aug and 30 Sep 2026), across periods `fy`, `ytd` and `qtd`, every version and
comparison, exports (figure CSV, workbook, deck, long CSV rows and control totals), calculation card
inputs and steps, out-of-plan bits and over-target flags, plus every state reachable by submitting and
withdrawing requests on seats in scope with any effective date. The crawl also runs `month` and `custom`
(one-month windows); a control with `costFit`'s period check removed must collect month amounts, which
proves the crawl would see them. The atom index at 30 Sep differs from 31 Aug by one partition change
(an Open manager seat in Silicon Engineering raised to M2 before the 30 Sep close), and fixed amounts
(Budget and Q1 Reforecast lines, closed months) are observed under both indexes.

The test has three parts:

1. **Union identity.** Every rounded figure equals the value computed from its shown atoms' rounded
   filled and band parts (`sumRounded`, then the gap, per-head or difference formula). It runs for every
   pick over a bounded scope list: the pick's default scope; every single department and leader seat it
   can pick; every subset of the Silicon Engineering unit's 6 departments (63 sets); 200 seeded random
   multi-selects of departments and leaders, mixing Include and Exclude. Because `addedSteps` reads only
   the parts' rounded values, the per-atom parts are then the most any reachable scope reveals, and
   other subsets need no enumeration.
2. **Per-atom attack.** One LP per atom (or per group of atoms that people moving between the closes
   connect) and per field: `fy:<version>`, `qtd`, `ytd`, each bridge step, each What if delta, with the
   filled and band parts apart. Each shown part reads as [floor, floor + $100,000) at both closes.
   People are grouped into one unknown per identical observation signature (Census `attack`). A window
   is an atom in which 1 to 4 people's amounts changed between the closes and nobody else's did: a hire
   or accepted offer, a leaver, an unpaid-leave start or end, a severance booking, or a pay change
   effective between the closes. The test asserts that more than 20 windows are found and that no
   changed person is pinned narrower than $100,000 (`width >= S - 1e-6`).
3. **Controls.** Rounding each of the Silicon Engineering unit's 63 department sets in one step and
   solving with department unknowns (Census test 2) pins some hire under $50,000. Replacing one atom's
   readings with exact amounts ± 0.005 pins a hire to under $1.

The test asserts its own atom count (`atomIndex` size: at most one atom per leader seat, about 45 to 63
in the sample) and its LP sizes (at most 200 unknowns and 600 rows per LP), so a later scope or field
cannot push it past the solver. It runs in the serial `slow` project in under 180 s. The LP holds inputs
fixed; `editInvariance.slow.test.ts` (rule 3) covers the inputs rounded modes can sweep.

**Rounded-mode allow-list.** In HRBP and Leader mode an amount shows only as: loaded cost FY by version,
QTD and YTD; variance at QTD, YTD and FY; gap, target and asks cost; per head; bridge steps; FX effect;
What if deltas; and band figures (band estimates of seats and requests, the band estimates on Finance > Assumptions > Trade rates (HRBP, read only), trade effects, the standard head in USD `finance.trade.standardHead` and the leader threshold `requests.chain.leaderThreshold`). Nothing else
shows an amount, and the section 12 policy test fails if a G, B or D figure outside this list is drawn
in either rounded mode, exports included. Not shown, through `cost:monthly` and `cost:component` (8.3):
- monthly cost series (a 20-person atom costs about $0.3M a month, so monthly steps would read 20 to
  33% at a time and multiply the observations);
- cost by component (base, bonus, burden, benefits, one-time), so a known bonus % cannot tie one
  component to another;
- loaded cost incl. SBC (a second rounding of the same sum, offset by public equity amounts);
- Exit run rate (one month × 12, so a $0.1M floor reads that month to about $8,300);
- freeze savings amounts (the openings held still show).

These read "—" with "Shows in Finance mode." Exports follow the same list: the long CSV carries amounts
only on `fy`, `ytd` and `qtd` rows for orgs that are unions of atoms, loaded cost in USD, and other rows
carry heads and FTE only; control totals are Σ heads, Σ FTE and the screen's rounded loaded total, never
a plain sum of rounded rows (14.1).

If the LP test cannot be made to pass for some figure, that figure drops to heads and ratios in rounded
modes, and the milestone report says which. A test that is too slow or too large to solve is a test to
fix, not a figure to drop.

### 7.4 Finance (exact)

C33 (15.2, M2 review) narrows this section: cost filters are whole business units, the component split
shows only on unit and company figures that pass its joint test, bridge steps and FX fold once company
wide, and back-dated adjustments show at company level only. Where the text below allows cost under a
cost-center, legal-entity, country or currency filter, C33 wins; those values stay exact rows of the
unit's fold.

- Exact amounts for groups of 5 or more costed people; small groups fold into "Other (k)"; no cost
  center is dropped (small ones fold into their unit's Other, Census's `foldByUnit`).
- **One fold for Finance.** Cost centers are Finance's one cost partition. Each unit's cost centers are
  folded once per version and as-of date, on the unit's unfiltered costed positions (`financeFold(unit)`: `foldByPart` with the smallest-joins rule). A group's size is its fewest costed people in any month of the version's grid (7.2 rule 1), so every month, QTD, YTD and FY cell of a shown cost center or of the Other covers 5 or more. The fold also keeps each currency's share of the unit's Other at 0 or 5 or more costed people: while a share has 1 to 4, the smallest shown cost center in that currency joins Other (ties to the first in order); a unit with only 1 to 4 costed people in a currency in all keeps them in its Other (accepted risk 8). The result is the unit's shown cost centers (5 or more each) and the unit's one Other (5 or more, or empty). Every Finance figure, filter,
  breakdown and export in that unit reuses this fold; a filter never re-folds it. Every coarser row is
  built from it: site, country, legal entity, currency, unit, and the org and cost-center rows of the
  long CSV and FP&A load file. A cost center (`<department>-<site>`) sits in exactly one site, country,
  legal entity and currency, so a coarse row is the sum of the unit's shown cost centers with that value.
  Members of the unit's Other are left out of it, with the note "n people in cost centers under 5 are
  left out", and count only in the unit's Other and the unit total. So a coarse row minus its shown cost
  centers covers 0 people. Any breakdown that does not nest over cost centers (a level or tree split of
  cost) keeps each shown cell a union of whole shown cost centers, or shows heads only.
- Filters: unit, cost center, legal entity, country, currency, version and period (heads views take
  them all). Under a cost-center, legal-entity, country or currency filter, a **cost** figure is the sum
  of the unit's shown cost centers with that value, and no Other row shows. A cost-center filter may
  pick only a shown cost center, and only one of cost center, legal entity, country and currency is
  picked at a time (`costFit`); otherwise "Cost shows for whole units, or for one cost center, legal
  entity, country or currency at a time." With no unit filter, every unit applies. Heads are unaffected.
  Every Finance cost set is then a union of shown cost centers and unit Others, each 5 or more, so no sum or difference of shown amounts isolates fewer than 5 people. Because each currency's share of an Other is 0 or 5 or more, the same holds for the FX effect and for the move an FX rate edit causes, except under accepted risk 8.
- **Org rows below the unit.** In Finance and in HR admin with the switch off, a cost amount on a
  leader-tree node, a sub-org, or a target row keyed by department, cost center or leader (Targets > Gap, Sub-org targets, Tree × cost center, Requests > Cycle, and the target org's gap and gap after approval on request and trade cards in Requests > New, Mine and Approvals and in Shareable and Requests files) shows only when (1) the row is a union of
  cost-center rows its unit's fold already shows, never part of the unit's Other, and (2) the row minus
  its child rows (counting children shown with cost on any Finance surface) is empty or is also such a
  union. `financeOrgCost(rows, unitBreakdown)` decides this once per version and as-of date, and every
  surface reads that one result. Otherwise the row shows heads, its target cost (an input) and the note
  "Cost shows for whole units, and for orgs made of whole cost centers with 5 or more people." Unit-level
  target rows (the sample's FY27 and FY28 targets, story 6) are unaffected.
- `src/cost/costUnions.slow.test.ts` is adapted from Census, not ported verbatim: Census groups classes
  per breakdown family, which was safe only because its Finance figures were rounded. HCP computes the
  classes jointly over every set Finance can see at one as-of date, for each amount field (version ×
  period × component), across all families together: unit, cost center, site, country, legal entity,
  currency, org rows that show cost under the rule above, Tree × cost center cells, long CSV rows and
  control totals. The sweep covers every unit subset × {no filter; each shown cost center; each country,
  legal-entity and currency value}, and HR admin's filter sets with the switch off (7.5). Any class of 1 to 4 costed people fails, counting in each class the people costed in that field's period (7.2 rule 1), and the members of 1550-HSZ (story 8) must share a class of 5 or more. It also asserts that each unit's Other holds 0 or 5 or more costed people in each currency (apart from units with only 1 to 4 in that currency in all), and that no cost center of 4 Filled seats and 1 accepted offer, or of 5 Filled seats with one last day of 31 Oct, shows an amount of its own.
  Controls: (1) folding site or country rows on their own (`foldGroups` per dimension) must find a class
  under 5, in a hand-built fixture if the sample does not produce one: unit U with Taiwan cost centers
  A = 6 and B = 3 and US cost centers C = 7, D = 6 and E = 2 (Other = B + E = 5, so no shown center
  joins it), where an independently folded Taiwan row (9) minus A gives B's 3 people; (2) with the
  org-row rule off, Silicon Engineering's unit row minus the SVP's sub-orgs yields a class of 1 (the
  SVP's own seat). Question 5 asks you to confirm.
- **Assumption edits are differences too.** Burden caps, the merit date and cutoff, the promotion-pool
  date, `bonusTarget`, `bonusFunding`, the merit % and the promotion-pool % come from the imported
  assumptions dataset (HR admin), lock with each version, and read only in Finance with "Set by import."
  (A cap or cutoff sweep reads single salaries out of exact totals, and stepping a pay percentage moves
  one person at a time across a burden cap.) Finance edits FX, bands, burden rates, benefits, severance
  months, equity, forecast drivers (attrition included), GL accounts and trade rates. Each edit, and each assumption set given to `version.create`, is refused with "This change would move cost for fewer than 5 costed people." when the positions whose Working or forecast amount it changes (contributors, rule 5) number 1 to 4 in all, or 1 to 4 in any one month within one part of Finance's fold: a shown cost center, or one department × country share of a unit's Other. Each part lies inside one department, country and currency, finer than any org, country or currency an assumption is keyed by, so no sum or difference of allowed edits moves 1 to 4 people in a shown figure. That blocks an FX rate for a currency with 1 to 4 costed people, a department override covering 1 to 4, severance months that book for 1 to 4 eliminated seats in one month of one part, and, in the sample, a TWD rate or Taiwan burden rate set at company or Corporate level (1550-HSZ's 3 people sit in Corporate's Other). Every edit is audited with the
  Acting as name. `src/cost/assumptionEdits.slow.test.ts` checks: (a) for every Finance-editable key at every fallback level in the sample, a +δ edit is refused or moves, in every month, 0 or 5 or more contributors in all, in each shown cost center and in each department × country share of each unit's Other; a TWD rate edit and a company or Corporate Taiwan burden-rate edit are refused (1550-HSZ); (b)
  every shown Finance total is affine in each FX, burden-rate, benefits, equity and severance-months
  value (T(v + 2δ) − 2T(v + δ) + T(v) = 0 to the cent at 20 random points across the allowed range); (c)
  in Finance mode, edits to caps, dates, cutoffs and the four pay percentages are refused, and so is a
  `version.create` that carries them; (d) control: the same sweep run as HR admin on `burdenCap` and
  `bonusTarget` finds each US person's base + bonus near $176,100; (e) under an attrition edit for any org, the filled part of every Finance figure moves only by its change in HRIS-cohort modeled exits × its unit's (or the company's) average HRIS cost per head, and a control that prices them at the department's average must let Facilities' average × its costed people − its shown cost centers equal 1550-HSZ's 3 people.
- Finance never sees one person's pay, performance, demographics or leave. Drills from a cost total open
  positions with no amount column (Census `costPeopleDrill`).
- **Accepted risks** (also in 15.3): exact series let Finance difference out one hire's or one exit's
  cost between two month-ends (including a sign-on, relocation, agency fee or severance booked that
  month), or one unpaid leave start. Approving a change to a Filled seat moves Working by that person's
  HRIS cost, which Finance can difference like an exit; anyone who switches Acting as can approve. The FP&A load file with no suppression comes only from HR admin with the switch on. A unit with only 1 to 4 costed people in a currency shows their FX effect as its total minus its shown cost centers (15.3 item 8).

### 7.5 HR admin

Switch off: Finance's exact rules, company-wide, and Finance's `costFit` (Census `byWholeUnits`: any
unscoped mode showing totals without the switch), including the one cost-center fold and the org-row
rule (7.4). Department is one more one-at-a-time dimension: a department is a union of cost centers,
so its cost is the sum of the unit's shown cost centers in it, like a country. A leader, level or
location filter, or more than one of department, cost center, legal entity, country and currency at
once, shows heads and the note "Turn on Show pay amounts to see cost for this filter." Filters stay free
for heads. `fit.test.ts` covers HR admin with the switch off under a department filter plus a level
include, which returns the reason. Switch on: `costFit` returns null; per-person amounts and exact
totals with no minimum, and the "Full" workspace file and unsuppressed load file become available. The
masthead shows "Pay amounts shown · Hide" while on.

### 7.6 Manager

No amount of any kind on any surface, export, workspace file, comment or help text (crawler test with no
currency symbol, ISO code or grouped number allowed). Budget status uses band cost internally and shows
words and heads. Approvals in Manager mode (as a manager's manager) show heads, the allocation after
approval and the status after approval, never the band estimate or the cost gap. Trade weights show as
standard heads (section 11), never amounts.

### 7.7 Leave

HRBP and Leader see one leave figure, `plan.leave.onLeave`, only for the mode's whole scope (the HRBP's
unit; the leader's whole tree) at the as-of date, and only when it is 5 or more. Under any filter other
than version and comparison (leader, level, location, department, cost center, legal entity, country,
currency, include or exclude) and under any period other than the default, it reads "—" with the note
"Leave counts show for your whole unit or org at the as-of date." It has no breakdown, series, delta,
comparison or drill to people (its drill is a calculation card with the count only). Acting as is free,
so a scope's figure also shows only when the classes of people defined by membership in every HRBP and
Leader scope whose figure shows each hold 0 or 5 or more people on leave. `leaveShown(scopes, asOf)` in
`src/access/leave.ts` drops the smallest offending scope until this holds, once per data load, and
`leaveFit(filters, period)` beside it gives the "—" reason.

Manager and Finance never see leave data (no column, filter, count or note). HR admin sees it; per
person only with the switch. Leave fields carry `leave: true` and `pay: true`. Leave never changes who
is costed (rule 1).

### 7.8 Files and functions (`src/cost/`)

| File | Contents |
|---|---|
| `src/lib/costRounding.ts` | Census verbatim: `COST_STEP`, `UNDER_COST_STEP`, `PER_HEAD_STEP`, `roundCost` (down, toward zero), `sumRounded`, `addedSteps`, `costIn`, `ratioOf`, `perHeadOfRounded`, `costRange`, `isRoundedCost`. New header comment (rounding is for HRBP and Leader). |
| `fold.ts` | `foldGroups` (verbatim), `guardGroups`, `wholeParts` (Census `wholeUnits`), `foldByPart` (Census `foldByUnit`), `financeFold(unit)` (Finance's one cost-center fold per unit, 7.4), `financeOrgCost(rows, unitBreakdown)` (org rows below the unit, 7.4), `OTHER`, `NONE`, `otherLabel` (defined once). |
| `atoms.ts` | `atomOf(positionId, index)`, `atomIndex(positions, closeDate)` (stored with each month close; every rounded figure reads the last close's index), `isUnionOfAtoms(set, index)`, `leaderSeats`. |
| `guard.ts` | `CostRow`, `costRow`, `roundedAmounts(members, partOf)`, `breakdown(...)`, `guardModel(...)`, `componentContributors(lines, component)` (rule 1), `expectGuarded` (test helper). Components: base, bonus, burden, benefits, oneTime, loaded, equity (incl. SBC kept apart). |
| `differences.ts` | `contributors(a, b, eps)`, `bandOnly(a, b, basisOf)` (true when every position whose amount differs is costed at band), `guardedDifference(delta, contributing, min)` (returns the value unsuppressed when `bandOnly` is true and the mode shows `cost:band`), `foldSteps(steps, min)`. |
| `fit.ts` | `costFit(filters, scope, mode, switchOn): string \| null` (the reason when cost cannot show; in rounded modes it also reads `filters.period`). |
| `lp.testkit.ts` | Census verbatim (`lpMax`, `lpRange`, `boundsFromSums`). |
| Tests (unit) | `guard.test.ts` (rule 1 fixtures), `fold.test.ts`, `atoms.test.ts` (7.3a), `differences.test.ts` (rule 5), `fit.test.ts` (every period preset in every mode; the 7.4 fixture; HR admin with the switch off, 7.5), `costRounding.test.ts` (Census port). |
| Tests (slow) | `costLp.slow.test.ts` (7.3d, asserting its atom count and LP sizes), `costDiff.slow.test.ts` (Census `costRounding.test.ts` attacker over HRBP and Leader exports, including the long CSV and control totals; fails if any monthly, cost-center or component amount appears), `costUnions.slow.test.ts` (all Finance sets together, including org rows; HR admin with the switch off; rounded modes), `editInvariance.slow.test.ts` (rule 3), `assumptionEdits.slow.test.ts` (7.4). |

---

## 8. Modes, scopes, Acting as and visibility

### 8.1 Modes (`src/access/modes.ts`, every per-mode table)

`Mode`, `MODES` and `isMode` are declared in `src/data/schema.ts` (frozen in M1); `access/modes.ts`
re-exports them and adds the per-mode tables below.

| | `manager` | `hrbp` | `leader` | `finance` | `hr-admin` |
|---|---|---|---|---|---|
| Label | Manager | HRBP | Leader | Finance | HR admin |
| Group in the Mode menu | Leaders and managers | HR | Leaders and managers | Finance | HR |
| Hint | Your team's roles: get them approved and filled, and see what is left. | One business unit's plan and cycle: positions, requests, approvals and transfers. | Your org against its target: approvals, sub-org targets and What if. | The whole company: targets, assumptions, FX, freezes, cycles, close and locks. | Everything, the Data room and imports, with pay amounts behind a switch. |
| Home (`HOME_OF`) | `team` (My team) | `home` (Unit plan) | `home` (Rollup vs target) | `home` (Plan vs actual) | `data` (Data room) |
| Home slug (figure ids `home-<slug>-…`) | (team view) | `unit` | `rollup` | `fin` | none |
| Scope (`SCOPE_OF`) | `tree` | `unit` | `tree` (company for CEO, CFO, CHRO) | none | none |
| Acting as pick | a manager | an HRBP (one unit) | a leader | a Finance person | an HR admin |
| Pick blocks reads | yes | yes | yes | no | no |
| Pay view (`PAY_OF`) | `none` | `rounded` | `rounded` | `exact` | `switch` |
| Leave view (`LEAVE_OF`) | `none` | `counts` (whole unit at the as-of date, 5+; 7.7) | `counts` (whole org at the as-of date, 5+; 7.7) | `none` | `switch` |
| Comparison default (`COMPARE_DEFAULT`, within the shown version's fiscal year) | plan of record | plan of record | plan of record | Budget | plan of record |
| Filter dimensions (`FILTER_DIMS_OF`) | leader, level, location (inside the tree) | all, inside the unit | all, inside the tree | unit, cost center, legal entity, country, currency (include only) | all (switch off: cost follows Finance's `costFit`, with department as one more one-at-a-time dimension; 7.5) |

When the shown version's fiscal year has no such version (FY28 now), every mode, Finance included,
compares with that year's target (9.2).

Mode button text: "Manager: Priya Raman", "HRBP: Silicon Engineering", "Leader: Dana Ito", "Finance mode",
"HR admin mode". The default mode on first load is HR admin (the full mode, as Census's HR). With the
sample, every mode's Acting as starts on its sample persona (13.3) so no first screen is blank; with
uploaded data, a scoped mode opens its picker and shows nobody until a pick is made (Census rule: an
unset pick holds an empty scope, never the company).

### 8.2 Acting as and scopes

```ts
export interface ActingAs { personId: string; name: string; unit?: string }   // unit: HRBP only
export type ModePicks = Readonly<Record<Mode, ActingAs | null>>
// store key hcp:mode = { v: 1, mode, actingAs: ModePicks }; missing or corrupt reads as HR admin with no picks
export interface TreeScope { kind: 'tree'; rootPersonId: string; rootName: string
  rootPositionIds: ReadonlySet<string>          // the acting person's own seats
  positionIds: ReadonlySet<string>              // strictly below the roots, via managerPositionId, as of the as-of date
  personIds: ReadonlySet<string>                // people in those positions, current and former
  subOrgs: readonly { positionId: string; label: string; positionIds: ReadonlySet<string>; atoms: readonly string[] | null }[]
  size: number; label: string }
export interface UnitScope { kind: 'unit'; unit: string; positionIds: ReadonlySet<string>; personIds: ReadonlySet<string>
  otherDepartments: ReadonlySet<string>; leaderPositionIds: ReadonlySet<string>; size: number; label: string }
export type ScopeLock = TreeScope | UnitScope
export function scopeFor(mode: Mode, picks: ModePicks, env: ScopeEnv): { scope: ScopeLock | null; unset: boolean }
```

- Manager candidates: anyone who holds a position that is another position's `managerPositionId` (any
  team size, so Manager C and the team-of-3 manager qualify). A **Manager's tree excludes their own seat**
  and everything above it, so nothing about their own seat (an elimination, a level change) can reach
  them.
- Leader candidates: holders of leader seats (Director+ or marked in Lists). CEO, CFO and CHRO see the
  company (`scope: null`).
- HRBP candidates: the Units list's HRBP column, one row per unit.
- Finance and HR admin: anyone on the Lists role columns (else any active employee). Their pick sets the
  audit `by` and approval identity; writes are refused until a pick exists.
- `clampFilters` (Census, same-object-when-unchanged and idempotent): `tree` pins the leader filter inside
  the tree (include only); `unit` pins the business unit and drops other units' departments and leaders;
  Finance keeps unit, cost center, legal entity, country and currency in include mode and clears the rest;
  HR admin's filters are untouched (with the switch off, cost under them follows 7.5). Version and
  comparison are pickers, not filters, and are never clamped (unknown or cross-year values reset to the
  defaults).
- Acting as is a pick, not sign-in. `NOT_SECURITY_SHORT` says so on the Mode menu, Settings and the
  mode-change toast.

### 8.3 `ROLE_POLICY` and `decide(mode, surface)`

`ROLE_POLICY: Record<Mode, RolePolicy>` is plain data (a test round-trips it through JSON), one table per
mode built with Census's `kit.ts` helpers. `decide(mode, surface, at?, info?)` returns
`{ access: 'shown' | 'limited' | 'hidden', how?: string }`. Anything a table does not name is hidden with
"Not named by the <mode> policy." `RolePolicy` keeps Census's fields and adds `actions` (every `action:`
id). Surface kinds: `view`, `tab`, `page`, `figure`, `metric`, `kpi`, `drill`, `column`, `dataset`,
`help:article`, `help:tour`, `settings`, `masthead`, `filter`, `export`, `pay`, `leave`, `cost`, `action`,
`item`, `ui`. The route guard (`routeDecision`, Census) sends a hidden route to the mode's home with a
toast "<Page> is not shown in <mode> mode. Headcount Planner opened <home> instead." and replaces the
history entry so Back never returns to it.

Below, S = shown, L = limited, H = hidden. Every L and H carries the reason shown (worded per mode in the
data; `matrix.test.ts` snapshots the full text to `src/access/__snapshots__/access-how.txt`).

**Views, tabs and pages**

| Surface | Manager | HRBP | Leader | Finance | HR admin | Reason on L or H |
|---|---|---|---|---|---|---|
| `view:home` | H | S Unit plan | S Rollup vs target | S Plan vs actual | H | Mgr: "Managers open on My team." Adm: "HR admin opens on the Data room. Switch modes to see a role's home." |
| `view:team` | S | H | H | H | H | "My team is the Manager mode home." |
| `view:plan` | L | L | L | L | S | Mgr: "Your team only, with no cost." HRBP: "Your business unit." Lead: "Your org." Fin: "Every unit; Transfers are left out." |
| `tab:plan.overview` | H | S | S | S | S | Mgr: "The plan overview carries cost and other teams. My team shows your heads." |
| `tab:plan.positions` | L | L | L | L | S | Mgr: "Heads, status and standard heads by month, no cost columns." Others: "Band estimates for Open and Planned seats; nothing tied to a filled seat or an offer." Adm: amounts per position behind the switch. |
| `tab:plan.openings` | L | S | S | L | S | Mgr: "Your team; an accepted offer shows as a date only." Fin: "No offer amounts or one-time hiring costs per req." |
| `tab:plan.transfers` | L | S | S | H | S | Mgr: "Your team; names show, amounts do not." Fin: "Transfers move named people. Finance sees their effect in the bridge and in Targets." |
| `tab:plan.hiring` | S | S | S | S | S | Mgr: "Your team, in heads." Heads only: no amount, band estimate or offer amount in any mode (9.7, C36). |
| `tab:plan.recruiting` | S | S | S | S | S | Mgr: "Your team, in heads." Heads only in every mode, its own files included (9.8, C38, R145). |
| `view:requests` | L | L | L | L | S | as the tabs |
| `tab:requests.queue` | H | L | L | L | S | Mgr: "The queue spans other teams. Mine and Approvals hold yours." HRBP/Lead: "Your unit or org." Fin: "Eliminations and filled-seat changes show position ID, title, level and org only." |
| `tab:requests.new` | L | S | L | H | S | Mgr/Lead: "Inside your team or org." Fin: "Finance sets targets and gives final approval. It does not raise requests." |
| `tab:requests.mine` | S | S | S | S | S | |
| `tab:requests.approvals` | L | S | S | S | S | Mgr: "Requests you approve as a manager's manager, in heads." |
| `tab:requests.cycle` | L | L | L | S | S | Mgr: "Your ranked asks and the cycle's dates." HRBP: "Your business unit." Lead: "Your org, within its envelope." |
| `view:forecast` (all tabs) | H | L | L | S | S | Mgr: "The forecast shows cost and modeled exits. My team shows your heads and status." HRBP/Lead: "Cost rounded down to $0.1M per team, at QTD, YTD and full year. Monthly cost shows as heads; exit run rate and cost incl. SBC show in Finance mode." |
| `view:targets` | H | L | L | S | S | Mgr: "Targets are Finance's heads and cost per org. My team shows your allocation." HRBP: "Your unit." Lead: "Your org." |
| `tab:targets.gap` | H | L | L | S | S | as the view |
| `tab:targets.suborgs` | H | L | S | S | S | HRBP: "Read only. Leaders split sub-org targets." |
| `tab:targets.tree` | H | L | L | S | S | as the view |
| `view:whatif` | H | S | S | L | S | Mgr: "What if shows cost and gap." Fin: "Levers and results. Turning them into requests is for HRBPs and leaders." |
| `view:finance` | H | L | H | S | S | Mgr/Lead: "Finance settings are Finance's. Leaders compare versions with the comparison picker." HRBP: "Versions, freezes and bands are read only; Export is Finance's." |
| `tab:finance.versions` | H | L | H | S | S | HRBP: "Read only." |
| `tab:finance.assumptions` | H | L | H | S | S | HRBP: "Bands, FX, loads and attrition are read only. Your unit's time to fill, fill rate and backfill settings can be edited in Working." |
| `tab:finance.assumptions:trade-rates` | H | L | H | S | S | HRBP: "Read only." Lead: "Leaders see weights on requests." |
| `tab:finance.freezes` | H | L | H | S | S | HRBP: "Read only. Openings held show; savings amounts are Finance's." |
| `tab:finance.reconcile` | H | L | H | S | S | HRBP: "Your business unit." |
| `tab:finance.export` | H | H | H | L | S | HRBP: "Load files are Finance's and HR admin's." Fin: "Groups under 5 are suppressed in the load file." |
| `page:actions` | L | L | L | L | S | "Items about your team, unit or org." Fin: "No item is about one person." |
| `page:audit` | H | L | L | L | S | Mgr: "The audit spans other teams. Changes to your requests show on the requests." Others: "Your unit, org or the company; pay and cost changes read 'changed'; the chain check shows in HR admin." |
| `page:data` (all tabs) | H | H | H | H | S | "The Data room is HR admin's." |
| `settings:data` (the as-of override, Census `DATE_SURFACES`) | H | H | H | H | S | "The as-of date is set by HR admin." |

**Money, leave, cost and trade surfaces**

| Surface | Manager | HRBP | Leader | Finance | HR admin |
|---|---|---|---|---|---|
| `pay:switch` ("Show pay amounts") | H "Manager mode shows no amounts." | H "HRBP mode shows totals rounded to $0.1M." | H same | H "Finance mode shows totals, never one person's pay." | S (session only) |
| `pay:amounts` (per person) | H | H | H | H | L (switch on) |
| `pay:exact` (exact totals 5+) | H | H | H | L "Groups of 5 or more costed people." | S |
| `pay:rounded` | H | L "Rounded down to $0.1M per team, at QTD, YTD and full year; groups under 5 left out." | L | H | H |
| `cost:band` (band estimates, trade cards included) | H "Managers see heads and standard heads, never amounts." | S | S | S | S |
| `cost:monthly` | H | H "Monthly cost shows as heads in this mode." | H | S | S |
| `cost:component` (cost by component, cost incl. SBC, exit run rate, freeze savings amounts) | H | H "This mode shows loaded cost at QTD, YTD and full year only." | H same | S | S |
| `leave:counts` | H "Leave is not shown in this mode." | L "One count for your whole unit at the as-of date, when 5 or more." | L "One count for your whole org at the as-of date, when 5 or more." | H | S |
| `leave:people` | H | H | H | H | L (switch on) |
| `ui:trade-weights` (weights, ratio, credit, standard heads; basis points only, never USD) | S | S | S | S | S |
| `metric:finance.trade.standardHead` (standard head in USD) | H | L "Read only." | L "On trade cards in your org, beside the band estimates." | S | S |

Every trade surface is a row in these tables (11.6 points here). Trade cards show USD band estimates
where `cost:band` is shown; which trades a mode sees at all follows 8.4 rules 1 and 2. The What if trade
lever is gated by `view:whatif` and `action:whatif.use`.

**Actions** (`action:<id>`; `policy.test.ts` asserts every id has a decision in every mode)

| Action | Mgr | HRBP | Lead | Fin | Adm | Reason when hidden or limited |
|---|---|---|---|---|---|---|
| `request.draft`, `request.submit`, `request.withdraw` | L | S | L | H | S | L: inside your team or org. Fin: "Finance does not raise requests." |
| `request.submit-on-behalf` | H | S | H | H | S | "Submitting on behalf of a manager is the HRBP's." |
| `request.recruit` (Start recruiting), `request.propose-start` (Start date) | L | S | L | H | S | as draft |
| `request.trade` | L | S | L | H | S | L: inside your team or org. Fin: "Finance approves trades; it does not start them." |
| `request.approve`, `request.reject`, `request.send-back` | L | L | L | L | S | L: "Only on steps assigned to you." Mgr also: "In heads, without band cost." |
| `request.approve-with-changes` | H | S | H | H | S | Mgr: "Changes to level, start or location are the HRBP's." Lead (R52): "Changes to a request are the HRBP's; leaders adjust the cycle within the envelope." Fin: "Finance locks or returns." |
| `request.comment` | S | S | S | S | S | |
| `request.read-approvers-only` | H | L | L | L | S | Mgr: "Approvers-only comments do not reach Manager mode." HRBP/Lead/Fin: "Only on requests where you are the HRBP or on the approval chain." |
| `request.import` (Import requests) | H | S | L | S | S | Mgr: "Import requests is for HRBPs and above." Lead: "Requests that touch your org or wait on you. Others in the file are left as they are." |
| `position.edit` (Open seats with no accepted offer, and Planned seats, in Working: start, level, location, FTE, On hold, with reason) | H | L | H | H | S | HRBP: "Open and Planned seats in your unit, in Working. A seat with an accepted offer cannot be edited; its start date and terms come from the recruiting system." Others: "Seat changes go through requests or the HRBP." |
| `transfer.process` | H | S | H | H | S | "Transfers are processed by HRBPs." |
| `transfer.approve` | L | L | L | L | S | "Only on steps assigned to you." Mgr: "The manager step; names show, amounts do not." HRBP: "Both HRBPs approve." Lead: "Both leaders approve across units." Fin: "Only a move past a sub-org's cost envelope; position ID, title, level and org show, never the name." |
| `transfer.move-budget` | H | S | H | H | S | Mgr: "Moving budget with a transfer is the HRBP's." Lead (R52): "Move budget too? is set when the HRBP processes the transfer." Fin: "Finance sees the target change in Targets." |
| `target.set`, `target.exception` | H | H | H | S | S | "Targets are set by Finance." |
| `target.split`, `target.move` | H | H | L | S | S | Lead: "Inside your envelope; a move past a sub-org's envelope needs Finance." |
| `whatif.use` | H | S | S | S | S | Mgr: "What if shows cost." |
| `whatif.turn-into-requests` | H | S | S | H | S | Fin: "Finance does not raise requests. Copy the scenario for the HRBP." |
| `cycle.open`, `cycle.dates`, `cycle.lock`, `cycle.return` | H | H | H | S | S | "Planning cycles are run by Finance." |
| `cycle.advance` | H | L | L | S | S | HRBP: "Finish HRBP review for your unit." Lead: "Finish Leader review for your org." |
| `cycle.rank` | L | S | L | H | S | Mgr: "Your own asks." Lead: "Within the envelope." |
| `cycle.cut-line` | H | S | L | S | S | Lead: "Within the envelope." |
| `cycle.copy-note` ("Copy note" for managers who have not submitted) | H | S | S | S | S | |
| `version.create`, `version.lock`, `version.reopen`, `close.month`, `fx.set`, `freeze.create`, `freeze.edit` | H | H | H | S | S | "Versions, closes, FX and freezes are Finance's." |
| `assumptions.edit` | H | H | H | L | S | Fin: "Rates and drivers, when the change moves 5 or more costed people. Caps, dates and pay percentages come from import." Others: "Assumptions are Finance's." |
| `assumptions.edit-operational` | H | L | H | S | S | HRBP: "Your unit's time to fill, fill rate and backfill settings, in Working." |
| `freeze.exception` | L | S | L | H | S | "Submitted with a business reason; it adds a Finance step." |
| `recon.review` | H | L | H | S | S | HRBP: "Your unit." |
| `data.import` | H | H | H | H | S | "Imports are HR admin's." |
| `workspace.import` (Replace or Merge) | H | H | H | H | S | as above |
| `workspace.open-shared` (question 8) | S | S | S | S | S | "Opens a Shareable file to read; nothing merges. It shows only what your mode and Acting as person may see, whatever mode made it." |
| `export.shareable` | S | S | S | S | S | |
| `export.requests` ("Export requests": requests whose `requestView` is 'full' for the exporter, comments by `commentVisible`, no amounts in Manager mode) | S | S | S | S | S | |
| `export.for-manager` ("Export for a manager": a Shareable file built as Manager mode acting as the picked manager) | H | S | L | H | S | Mgr: "Managers export their own Shareable file." Lead: "Managers in your org." Fin: "Finance's decisions reach managers through the HRBP." |
| `export.full`, `export.load-file-full` | H | H | H | H | L | Adm: "With Show pay amounts on." |
| `export.load-file` | H | H | H | L | S | Fin: "Groups under 5 suppressed." |
| `export.figure`, `export.view`, `export.deck` | L | L | L | S | S | Mgr: "No amount columns." HRBP/Lead: "Rounded loaded cost only, for whole teams, at QTD, YTD and full year." |
| `export.long-csv` | L | L | L | S | S | Mgr: "Heads and FTE rows only, no amount columns." HRBP/Lead: "Cost rows are whole departments and teams at QTD, YTD and full year, loaded cost in USD; other rows carry heads and FTE." |

The Leader cells of `request.approve-with-changes` and `transfer.move-budget` are H by R52 (approve
with changes is the HRBP step's, and no Leader action processes a transfer).

Finance's FX and assumption edits, and any assumption set given to `version.create`, are refused under 7.4's edit rule (1 to 4 contributors in all, or in one part of Finance's fold). `policy.test.ts` also
asserts that every surface id named in sections 8 to 11 has a decision in every mode and that the as-of
date cannot change outside HR admin.

Drill kinds and columns are decided the same way (`drill:<kind>`, `column:<kind>.<key>`): Manager lists
positions, requests (their own and their approvals), reqs (date-only offer columns) and action items;
amount columns (`planLines.usd*`, `reqs.offerBase`, `reqs.signOnBonus`, `reqs.relocation`,
`reqs.agencyFee`, `positions.costAnnual`) are `pay: true` and hidden outside HR admin with the switch;
`positions.bandEstimate` is hidden in Manager mode; component columns (base, bonus, burden, benefits,
one-time, incl. SBC) follow `cost:component`; `workers.onLeave` and `workers.leavePaid` are hidden
everywhere but HR admin.

### 8.4 Person-level rules (`src/access/visibility.ts`)

Per-mode tables cannot say "never the person in the touched seat", so these rules live in one module
and are applied in every engine that lists or counts requests, comments, audit rows or notifications,
and to every workspace file exported, opened or merged. An opened shared file is shown through the
current mode and Acting as person, never through the mode it was made in. `plan/audit/` hashes, appends
and verifies only; redaction for a viewer is `auditView` alone.

```ts
export type AuditRow = Omit<AuditEntry, 'seq' | 'prevHash' | 'hash'>   // every mode but HR admin gets these
export function requestView(req: HcRequest, viewer: Viewer): 'full' | 'limited' | 'none'
  // Transfer: 'full' for the rule 2a viewers; commentVisible still requires rule 1
export function commentVisible(c: Comment, req: HcRequest, viewer: Viewer): boolean
export function auditView(e: AuditEntry, viewer: Viewer): AuditEntry | AuditRow | null   // redacts or drops
export function hasAmount(text: string): boolean
export function managerText(text: string, viewer: Viewer): string   // Manager mode: each amount becomes "an amount"
```

1. **Who sees a request in full**: the requester, the submitter (on behalf), every approver on its chain,
   the HRBP of each unit it touches, and HR admin.
2. **Limited**: Leader (inside their org) and Finance (company) see requests in queues and counts; for
   Eliminations and changes to a Filled seat they see only position ID, title, level and org, on every
   surface (queue, audit per rule 7, comments per rule 5, files, notifications).

   2a. **Transfers** (type Transfer, 10.5) show the moving person's name, from, to, effective date, state
   and approval steps, never an amount, to: everyone in rule 1; in Manager mode, the holders of manager
   positions above `fromPositionId` and above the receiving seat (`toManagerPositionId`, or the manager
   of `toPositionId`); in Leader mode, leaders whose org contains either side. Finance sees transfers only as rule 2 (position ID, title, level and org, in queues and counts), even on a transfer whose `envelope-exception` step it approves; this overrides rule 1 for Finance. The moving person and anyone
   in the tree below the moving seat follow rule 3. Comments on a transfer reach rule 1 viewers only and
   follow rule 5. For transfers, rule 2a replaces rule 2's limit on changes to a Filled seat.
3. **Never**: the person in the touched seat or anyone in the tree below that seat, in any mode except
   HR admin. They see no row, no count change, no Action item, no notification, no audit entry and no
   change to their allocation from it (Manager C, section 13).
4. **Backfills** show the leaver's position ID, never the leaver's name.
5. **Comments and free text**: a comment's audience is "Everyone on the request" or "Approvers only".
   Approvers-only comments show only to the approvers on that request's chain, the HRBP of each unit it
   touches and HR admin. They never reach Manager mode, the requester (unless also on the chain), a
   Leader or Finance user who is not on the chain, or a limited view. `hasAmount(text)` is true for a
   currency sign or ISO currency code, or a number worth 1,000 or more (grouped or not; "95k" and "1.2M"
   count). When it is true:
   - at entry, a comment's audience is set to Approvers only and the picker is disabled with "This
     comment mentions an amount, so only approvers see it."
   - every other free-text field a manager can read is refused at entry with "Remove the amount:
     managers see this note." These are the HRBP seat-edit reason, the approve-with-changes reason, the
     send-back and reject reasons, the freeze-exception business reason and the audit `comment`.
   - at read time, whatever the stored audience, `commentVisible` returns false in Manager mode for a
     comment with an amount, and `managerText` replaces each amount in a reason or audit comment with
     "an amount". This covers text that arrives through Import requests, workspace Merge or an opened
     shared file.

   Every free-text box shows "Do not include pay, performance or health details."
6. **Aggregates shown on screen** (queue counts, pending, asks, KPIs) are computed over the rows the
   viewer may see, so a count can never isolate a hidden request. Routing follows rule 8, not this rule.
7. **Audit**: scoped to the mode's scope. `auditView` first applies `requestView` to the request an entry
   belongs to, including `position` entries written by that request's approval. View 'none': the entry
   is dropped (rule 3). View 'limited' on an Elimination or a change to a Filled seat: only entries whose
   `field` is `state`, `positionId`, `jobTitle`, `level` or org show; on them `by` and `byName` read
   "Approver" or "Requester", and `effectiveDate` and `comment` are null. An entry's `comment` shows only
   when `commentVisible` would show the comment it came from (`AuditEntry.commentAudience`, 5.3).
   Outside HR admin, `old` and `new` on pay or cost fields read "changed", `comment` passes through
   `managerText` in Manager mode, and `auditView` returns an `AuditRow` with no `seq`, `prevHash` or
   `hash`, since each hash covers entries the viewer may not see. Position cards, the Audit page and
   Shareable files outside HR admin carry only `AuditRow`s. The chain status "Chain checks out (n
   entries)" shows in HR admin only; other modes see "n entries", counted over the rows they can see
   (rule 6).
8. **Routing never reads what rule 3 hides from the requester.** When `chainFor` decides out of plan
   (10.2, 11.4), it computes the org's asks in heads and cost without any request that rule 3 hides from
   that request's requester (requests touching the requester's own seat or a seat above it). Every other
   pending request still counts. The steps are stored on the request and read the same for every viewer
   (chain preview, tracker, Approvals), so a requester's routing is the same with and without a request
   they cannot see (`chain.test.ts`, Manager C).

---

## 9. Screens: views, tabs, homes, drills and calculation cards

### 9.1 Views (`ViewKey`, folder-tab order) and pages

| Key | Label | Tabs (first is default) | Datasets | Folder headline |
|---|---|---|---|---|
| `home` | Home | overview | all | per mode: heads vs plan (HRBP), year-end gap (Leader), full-year cost vs Budget (Finance) |
| `team` | My team | overview | positions, workers, reqs, requests, assumptions | left to fill (heads) |
| `plan` | Plan | overview, positions, openings, hiring, recruiting, transfers | positions, workers, comp, reqs, assumptions, freezes | approved heads |
| `requests` | Requests | queue, new, mine, approvals, cycle | requests, positions, targets, freezes, assumptions | requests waiting 5+ days |
| `forecast` | Forecast | overview, variance, bridge | positions, workers, comp, reqs, assumptions, freezes | year-end heads forecast |
| `targets` | Targets | gap, suborgs (Sub-org targets), tree (Tree × cost center) | targets, positions, requests, assumptions | gap in heads |
| `whatif` | What if | levers | positions, assumptions, targets, freezes, requests | heads change from levers (`whatif.delta.heads`) |
| `finance` | Finance | versions, assumptions, freezes, reconcile, export | all | versions locked |

Pages (masthead, not folder tabs): `data` (Data room: Datasets, Data quality, Metric definitions, Lists,
Workspace), `actions` (Action center), `audit` (Audit). `RouteView = ViewKey | 'data' | 'actions' |
'audit'`. Address: `#plan.positions?period=fy&bu=Silicon+Engineering&ver=fy27-working&vs=fy27-budget`
(Census grammar; `ver` and `vs` are pickers beside the filters, defaults omitted; leader is a position ID,
never a name).

Each view folder follows Census: `views/<key>/{index.tsx, metrics.ts, engine/{index,base,settings,
lineage,kpis,findings,actions,drill,drillUses,wording,fixtures}.ts, ui/{model.ts, <Tab>.tsx}}`.
`engine/index.ts` exposes `<key>Model(ctx)` cached in a `WeakMap<AnalyticsContext, Model>`; `ui/model.ts`
is `useMemo(() => <key>Model(ctx), [ctx])`. Each `overview` tab of plan, forecast and team has 5 to 7
KPIs, then the Readout (span 4) beside the lead figure (span 8), Census's layout. Homes are checked by
their own 9.3 table, and the KPI strips on other tabs (9.4) have no count rule. A test checks the count,
and that every KPI on a tab or home has `metricId`, `uses` and a `drill` or `calc`.

What if is a tool, not an overview. Its one tab, `levers` (label "Levers"), shows the lever list beside a
result strip of exactly three KPIs: `whatif.delta.heads`, `whatif.delta.cost` and `whatif.delta.gap`,
plus one `requests.trade.ratio` for each trade lever. Each has `metricId`, `uses` and a `calc` that
follows the difference rule (7.2 rule 5: the cost change is a band figure while only band-estimate
amounts differ, and guarded once an HRIS or offer amount differs). What if has no Readout.

### 9.2 Filters, period, version and comparison

- Period presets are fiscal: `fy` (default, the as-of date's fiscal year), `ytd`, `qtd`, `month`,
  `custom`. A month bar's "Filter to this" sets `custom` for that month.
- In HRBP and Leader mode, cost shows only under `fy`, `ytd` and `qtd`, with `ytd` and `qtd` ending at
  the last closed month-end. Under `month` or `custom` (a month bar's "Filter to this" included), every
  cost figure shows heads and the note "Cost shows for the quarter to date, year to date and full year in
  this mode." (7.3(b)). The as-of date is set by HR admin only (`settings:data`).
- Filter dimensions: `leaderId` (a position ID; the tree is `managerPositionId`), `businessUnit`,
  `department`, `costCenter`, `location`, `level`, `legalEntity`, `country`, `currency`. Include/Exclude
  per dimension as in Census; an exclusion that removes 1 to 4 Filled heads cannot be picked.
- **Leave** (`plan.leave.onLeave`) shows only for the mode's whole scope at the as-of date. Under any
  filter other than version and comparison, or any period but the default, it reads "—" (7.7).
- **Version picker** (`ver`): which version the view shows (default: the fiscal year's Working).
- **Comparison picker** (`vs`): the version, or the target for a fiscal year with no locked version,
  that every "vs" figure compares with. `ctx.compare: { kind: 'version'; versionId: string; fiscalYear:
  FiscalYear; label: string } | { kind: 'target'; fiscalYear: FiscalYear; label: string }` is resolved
  once in `buildContext`. The mode default (`COMPARE_DEFAULT`) is looked up within the shown version's
  fiscal year: Finance's "Budget" is that year's locked Budget, and everyone else's "plan of record" is
  that year's latest locked version. When the year has no such version (FY28 today), every mode, Finance
  included, gets `{ kind: 'target', fiscalYear, label: 'FY28 target' }`. Every delta's `deltaLabel` comes
  from one helper ("vs FY27 Budget", "vs plan of record (Q1 Reforecast)", "vs FY28 target") and its
  `deltaDrill` opens the comparison's rows.
  - With a target comparison, year-end heads tiles compare with target heads and full-year cost tiles
    with target cost (rounded modes as in 7.3); `deltaDrill` opens Targets > Gap for the scope. Monthly,
    QTD and YTD "vs" figures, Forecast > Variance, Forecast > Bridge and freeze savings compute nothing
    and show an empty state: "A target has no monthly plan. Pick a version to compare." when the year has
    a locked version, "FY28 has no locked version yet." when it has none.
  - The picker lists the target (`vs=target`) and the locked versions of the shown version's fiscal year
    only. Cross-year version comparisons are not offered.

### 9.3 Homes (`HomeTop`: hero, overview, Needs attention; then My list)

Home KPIs are the producing views' own tiles re-linked with Census's `tile()`; homes never compute a
number. Each key figure comes from the KPI strip of the tab it links to (9.4; My team's are the team
view's own). `tile()` returns nothing for a missing id, so a test asserts that every metric id in this
table resolves to exactly one tile per home, and that each home's strip length equals its row count
(Manager 7, HRBP 5, Leader 5 per R16, Finance 6). Every KPI names its comparison.

| Home | Hero | Key figures (metric id) | Needs attention / My list | Other figures |
|---|---|---|---|---|
| **My team** (Manager) | Left to fill (`team.allocation.leftToFill` = Open + Planned seats in the allocation), split Open (`team.allocation.open`) / Planned, requested (Planned − Left to request) / Planned, left to request (`team.allocation.leftToRequest`). The parts add up to the hero value (tested, as in Census's engine.test). Pending requests are not in the allocation, so they stay a key figure, not a part. | Allocation (`team.allocation.heads`), Filled (`team.allocation.filled`), Open (`team.allocation.open`), Planned (`team.allocation.planned`), Pending (`team.requests.pending`), Left to request (`team.allocation.leftToRequest`), Budget status (`team.budget.status`, a word with its reason in heads) | My list: request tracker (type, state, step, owner, days in step, Req opened, Interviewing, Offer accepted date, Started). Needs attention: approvals waiting on you, sent-back requests, Planned seats near start with no req, trade credit about to lapse. | Heads by month to FY end against allocation (`team-heads-vs-allocation`) |
| **Unit plan** (HRBP) | Heads vs plan at the last closed month-end | Heads vs plan (`plan.heads.actual` vs `plan.heads.plan`), Hires YTD vs plan (`plan.hires.ytd` vs `plan.hires.planned`, both to the last closed month-end; `deltaLabel` from the comparison helper), Openings past target start (`plan.openings.pastStart`), Year-end forecast vs target (`forecast.heads.yearEnd` vs `targets.target.heads`), Cost vs comparison (`forecast.cost.fullYear`, rounded) | Needs attention: requests waiting 5+ days, managers not submitted, Planned seats near start with no req, reconciliation exceptions in the unit. My list: the unit's open requests by step. | Openings by stage (`home-unit-openings`), forecast heads by month (`home-unit-forecast`) |
| **Rollup vs target** (Leader) | Year-end heads vs target | Heads vs target (`forecast.heads.yearEnd` vs `targets.target.heads`), Cost vs target (`forecast.cost.fullYear` vs `targets.target.cost`, rounded), Year-end gap (`targets.gap.heads`), Approvals waiting (`requests.queue.waiting` for you), Unallocated (`targets.subOrg.unallocated`) | Needs attention: approvals waiting on you, sub-orgs over target. My list: sub-orgs with heads, asks, gap. | A bullet per sub-org against its target (`home-rollup-suborgs`) |
| **Plan vs actual** (Finance, ROLES-V2 5.10 adapted) | Full-year cost forecast vs Budget | Heads vs Budget (`plan.heads.actual` vs Budget `plan.heads.plan`), Reqs not in plan (`plan.reqs.notInPlan`), Openings under a freeze (`plan.openings.frozen`), FX effect YTD (`forecast.fx.effect`), Freeze savings (`finance.freeze.savings`), Reconciliation exceptions (`finance.recon.exceptions`) | Needs attention: Finance steps waiting, envelope exceptions, cycle stage due. My list: units by cost variance. | The bridge (`home-fin-bridge`), cost by unit vs Budget (`home-fin-cost-unit`) |
| **Data room** (HR admin) | Census's Data room | | | |

### 9.4 Tabs

KPI strips on tabs other than Overview follow Census's per-tab `kpis` lists and have no count rule; they
are where homes re-link their key figures (9.3).

| Tab | KPIs and main figures (5 to 7 KPIs on Overview tabs, 9.1) | Notes |
|---|---|---|
| Plan > Overview | Approved heads, Actual heads (vs comparison plan heads), Openings, Openings past target start, Average FTE YTD, Loaded cost YTD (vs comparison; guarded) | Readout: findings such as "Go-to-Market is 8 heads over the Budget at 30 Sep." Figures: heads by month (actual against plan lines), heads by unit, positions by status, cost by unit (guarded), openings by stage |
| Plan > Positions | Grid: positions × months of the shown version (status and heads per cell), with a Band estimate column (not in Manager mode; `cost:band`, `band: true`) and a Standard heads column (`plan.trade.weight`, every mode, Manager included; `ui:trade-weights`), and per-position cost only for HR admin with the switch | HRBP edits Open and Planned seats in Working (start, level, location, FTE, On hold) with a required reason; the manager sees "Changed by your HRBP: start moved from Jan to Mar" on the seat and in My team |
| Plan > Openings | KPIs: Openings past target start (`plan.openings.pastStart`), Openings under a freeze (`plan.openings.frozen`), Planned seats near start with no req (`plan.openings.noReq`), Hires YTD (`plan.hires.ytd` vs `plan.hires.planned`). Openings by stage (Req opened, Interviewing, Offer accepted, Started) and by age; table with days in stage, target start, past start, frozen, no req | Accepted offers show the date only |
| Plan > Transfers | Transfers in progress and done, with names, from and to, approvals | HRBP processes; no amounts |
| Requests > Queue | KPIs: Requests in progress (`requests.queue.open`), Waiting 5 or more days (`requests.queue.waiting`), Managers not submitted (`requests.cycle.notSubmitted`). Requests in scope by state and step, days waiting; "Import requests" in the header | Rows follow 8.4 |
| Requests > New | Type picker, then a form per type; freeze notice; chain preview; band estimate (not in Manager mode); trade flow (11.5) | Hint "Do not include pay, performance or health details." |
| Requests > Mine | Your requests and the tracker | |
| Requests > Approvals | KPIs: Waiting on you (`requests.queue.open` over the steps assigned to the Acting as person), Waiting on you 5 or more days (`requests.queue.waiting`, same steps; re-linked as the Leader home's Approvals waiting). Requests waiting on you (Acting as): approve, approve with changes, send back, reject; band estimate and gap after approval (not in Manager mode) | |
| Requests > Cycle | Stage strip and dates; HRBP: who has not submitted ("Copy note"), ranked asks against the target with a draggable cut line; Leader: adjust within envelope; Finance: lock or return; Manager: your ranked asks | |
| Forecast > Overview | Year-end heads forecast (vs target), Full-year cost forecast (vs comparison), Expected starts, Modeled exits, Unfilled at horizon, Exit run rate | Heads by month (closed actuals then projection), starts and exits by month. Exit run rate shows to Finance and HR admin only (one month's cost × 12), so HRBP and Leader see five KPIs |
| Forecast > Variance | Org × measure (heads, average FTE, cost) × window (month, QTD, YTD, FY) | Positive cost is over; rounded modes show QTD, YTD and FY cost only |
| Forecast > Bridge | KPIs: FX effect for the period (`forecast.fx.effect`; the Finance home re-links it at period `ytd`). Waterfall: comparison total, the eight steps, Rounding (rounded modes), forecast total | Each step opens a calculation card and its contributors |
| Targets > Gap | Target heads, Asks, Gap (heads), Target cost, Gap (cost), Unallocated; per org table with Heads from trades | In Finance and HR admin with the switch off, cost on org rows below the unit shows only under 7.4 (org rows below the unit) |
| Targets > Sub-org targets | Split a parent target into sub-orgs (Leader), Unallocated, envelope exceptions | Cost on sub-org rows as in Targets > Gap |
| Targets > Tree × cost center | Leader tree nodes × cost centers, heads; cost per unit × cost center (7.4) | Finance and HR admin with the switch off: cost per node only under 7.4 (org rows below the unit). Rounded modes: heads only (cost centers are not unions of atoms, 7.3) |
| What if > Levers | Lever list (defer, cancel, shift starts, change level or location, freeze a sub-org, trade) beside the result strip (9.1): Heads change, Cost change (levers at band estimate; band or guarded under rule 5, as in 9.1), Gap change, and a trade rate per trade lever. No Readout | "Turn into requests" |
| Finance > Versions | Versions with state, lock date, hash, engine version; lock, reopen as new; month close and back-dated adjustments (6.6) | Outside HR admin with the switch: hire and exit adjustments list by position with no amount; "Other HRIS change" shows only as a count per posted month (5 or more, else "—"; no drill); adjustment amounts show only as sums by posted month under 7.2 rules 1 and 5. HRBP (read only): counts only |
| Finance > Assumptions | Every table with its fallback level (org, unit, company); FX sets; Trade rates (11.5). Finance edits FX, bands, burden rates, benefits, severance months, equity, forecast drivers, GL accounts and trade rates in Working within 7.4's edit rule (refused with "This change would move cost for fewer than 5 costed people."). Burden caps, the merit date and cutoff, the promotion-pool date, bonus target and funding, and the merit and promotion-pool percentages read only outside HR admin, with "Set by import." | Locked versions read only |
| Finance > Freezes | KPIs: Openings under a freeze (`plan.openings.frozen`), Freeze savings (`finance.freeze.savings`). Freezes, openings held, exceptions, savings | Savings amounts: Finance and HR admin; HRBP sees openings held |
| Finance > Reconcile | KPIs: Reconciliation exceptions (`finance.recon.exceptions`), Reqs not in plan (`plan.reqs.notInPlan`), Not in plan (`plan.heads.notInPlan`), Cost-center mismatches (`finance.recon.costCenterMismatch`). The exceptions by kind, mark reviewed | |
| Finance > Export | FP&A load file (long CSV), version export | |
| Audit (page) | Entries with filters by object, person, date; chain status "Chain checks out (n entries)" | The chain status shows in HR admin only; other modes see "n entries", counted over the rows they can see, and no row carries `seq`, `prevHash` or `hash` (8.4 rule 7) |
| Action center (page) | Census's Action center with HCP item kinds (9.6) | |

### 9.5 Drills and calculation cards

- **Counted numbers** are `<Drill>`s and open exactly the rows they count (`rows.length === value`).
  "Filter to this" and "Leave out" appear where the rows form a group of a filter dimension (Census
  rules, including the small-exclusion rule). Two counts never open rows: `plan.leave.onLeave` opens a
  calculation card with the count only (7.7), and the back-dated "Other HRIS change" count has no drill
  (6.6).
- **Weighted numbers** (average FTE, probability-weighted starts, half-month heads, asks with
  eliminations subtracted) drill to rows with a "Counts as" column; Σ counts-as equals the figure.
- **Modeled numbers** open a **calculation card** (`src/drill/CalcCard.tsx`, new; Census has none):

```ts
export interface CalcInput { label: string; value: number | string | null; format: Format; source: string; level?: 'org' | 'unit' | 'company' }
export interface CalcStep { label: string; expression: string; result: number | null; format: Format }
export interface CalcSpec {
  title: string; subtitle?: string; metricId: string; value: number | null; format: Format
  inputs: readonly CalcInput[]; steps: readonly CalcStep[]        // the last step's result is `value` (tested)
  rows?: DrillSource   // "Show the n records". Counted cards: rows.length = value. Weighted and band cards:
                       // Σ counts-as or Σ band estimate = value (tested). Cost cards outside HR admin with the
                       // switch: no amount column, and the Σ test runs only in HR admin with the switch.
  comparison?: { label: string; value: number | null }
  note?: string; uses: readonly FieldRef[]
}
```

  The card lives in the drill stack (`DrillEntry` gains `{ type: 'calc' }` and `{ type: 'position' }`),
  so Back and focus return work. Card amounts come from the same guard output as the figure
  (`guardModel`); `src/drill/calc.ts` never reads engine totals directly.
  - **Manager mode**: heads, rates and words only.
  - **HRBP and Leader mode**: every amount on a cost card (band-estimate cards below aside) is a
    rounded part: each atom's filled part and band part after `roundCost`, the `sumRounded` step, the
    Rounding step, and a per-head figure only through `perHeadOfRounded`. No exact sum, HRIS average,
    local-currency amount, cost component or split by driver (Filled, starts, exits, backfills) appears.
    Modeled exits show heads and the attrition rate, never the average cost per head. The FX card shows
    rates and the rounded FX step, never local amounts.
  - **Finance**: every amount on a cost card is a total over 5 or more costed people (folded as in 7.2),
    every difference passes the 5-contributor rule, and a component amount shows only under 7.2's
    component rule.
  - **Band-estimate cards** (HRBP, Leader, Finance): a seat's or request's band estimate, or a band-only
    difference (rule 5), shows its band inputs and steps, which read no pay.
  - **Every mode except HR admin with the switch**: no input or step shows a per-position amount built
    from pay or an offer (it reads "—"), and cost cards list their records with no amount column
    (`costPeopleDrill`), per 7.2 rule 4 and the `pay: true` columns in 8.3.

  Every worked example in section 6 is a `CalcSpec` fixture whose last step equals the number.
- **Position card** (`PositionCard.tsx`, replacing Census's person card): status history, assignment
  (name per mode), reqs, requests (per 8.4), audit (per 8.4: outside HR admin, rows with no `seq`,
  `prevHash` or `hash`), standard heads.
- Readout findings list positions, not people (`FindingPosition { positionId, title, note }`).
- New chart: `Waterfall` (bridge, FX) with `waterfallModel.ts` (steps sum to end; Rounding closes).

### 9.6 Action center items

Items are pure `actions(ctx)` output of the producing views (homes and My team have none). Ids
`<view>:<kind>:<record>`; no amount in `what` or `note`; every item has `due` or `closesWhen` and `place`.

| Kind | Owner | Mode lists |
|---|---|---|
| `requests:approve` | the step's approver | needs: the approver |
| `requests:waiting` (5+ days in a step) | the step's approver | needs: HRBP (any request in the unit), Leader and Finance when they are the step's approver, Manager when `me` is the approver; waiting: Manager when `me` is the requester |
| `requests:sent-back` | requester | needs: requester |
| `requests:not-submitted` (cycle open) | the manager | needs: manager (`me`), HRBP (the unit's managers); waiting: none |
| `requests:backfill-new-position`, `requests:backfill-no-exit` | HRBP | needs: HRBP, Finance |
| `plan:planned-no-req` (Planned seat starting within 45 days, no req) | manager | needs: manager, HRBP |
| `plan:past-start` | manager | waiting: HRBP |
| `plan:frozen-opening` | HRBP | needs: HRBP, Finance |
| `plan:req-on-eliminated` (open req on an Eliminated or Traded seat; closesWhen the imported req's status is Filled or Cancelled) | HRBP | needs: HRBP; waiting: manager |
| `targets:suborg-over` (a sub-org's asks at its target date (6.9) are above its sub-org heads target, or, where it has a cost target, its guarded asks cost is above that target, compared as 7.2 rule 8 defines it (heads only for a sub-org that is not a whole union of atoms or whose cost would read "—"); produced by `targets` `actions(ctx)` from the same value as the Leader's My list gap; closesWhen the sub-org's gap is 0 or more in every leg compared; `what` gives the heads gap or says "over its cost target", never an amount) | the leader of the parent org | needs: Leader; waiting: HRBP |
| `finance:reconcile` | HRBP | needs: HRBP, Finance |
| `finance:envelope-exception`, `finance:cycle-due` | Finance | needs: Finance |
| `requests:trade-credit-lapse` | holder of the request's `giveOrgPositionId` (11.2; if vacant, the nearest manager above) | needs: that manager; waiting: HRBP |

A home's Needs attention lists only the mode's `needs` list (Census `AttentionSection`), so every item
that 9.3 promises for a home routes to `needs` in that mode. A test reads 9.3's Needs attention entries
per mode and checks that each one has a kind routed `needs` in that mode. For the approver,
`requests:waiting` replaces that request's `requests:approve` item (same request, one line), so the
request is not listed twice.

Approval items close by request state; "Mark handled" is off for them (Snooze only), so a browser mark
can never hide a decision that is still needed.

### 9.7 Hiring progress (Plan > Hiring, change C36)

User request, 24 Oct 2026: "make sure it includes a module that tracks headcount progress via hiring, ie,
current approved headcount - current headcount - future starts that already accepted = what they can hire
for total, by quarter. then also show hiring velocity based on the number of hires as well as attrition."

#### Placement

A new Plan tab `hiring` ("Hiring"), after Openings: `plan` tabs become overview, positions, openings,
hiring, transfers. It is heads only (no amounts, no band estimates), so it shows in every mode, each over
its own scope: Manager (their tree, strictly below their seat, R23), HRBP (unit), Leader (org), Finance
(company, filters as Plan), HR admin. Policy `tab:plan.hiring`: S in every mode; Manager's how: "Your
team, in heads." Folder headline unchanged. The tab is also the home of one new KPI on three homes
(below).

#### Definitions (all heads, in scope, as of the as-of date unless a quarter end is named)

Fiscal quarters of the fiscal year shown (FY27: Q1 Apr-Jun, Q2 Jul-Sep, Q3 Oct-Dec, Q4 Jan-Mar). Closed
quarters (ending on or before the last close) are history; the quarter holding the as-of date and later
ones are ahead.

- **Approved heads by quarter end** `A(q)`: Working seats that are approved heads (R1) and whose first
  head day (Filled now, else the accepted offer's start, else the seat's planned or target start) is on
  or before the quarter's end, and that are still approved heads on it. For the last quarter this is
  R1's approved heads less the seats an approved change (an Elimination, a Trade or a move out) ends
  before the fiscal year end, and less the seats whose accepted start falls after it; the O(q) card
  names both counts. Eliminated, On hold and seats held by an approved internal move (SC-6) are out,
  as in R1.
- **Current heads** `H`: actual heads at the as-of date (glossary: active HRIS employees, on leave
  included, "Not in plan" included). Shown with its split: in approved seats, and not in plan.
- **Future starts by quarter end** `S(q)` (C37): people with a signed offer (req stage Offer accepted,
  not Started) on approved seats whose start date is after the as-of date and on or before the quarter's
  end. Only signed offers count: no forecast or modeled start, no Open or Planned seat without a signed
  offer. Date-only facts; no offer amounts anywhere.
- **Moves in by quarter end** `M(q)` (C37): approved internal moves into the scope that have not started
  (approved and not yet in the HRIS, or dated ahead in the HRIS), by their move date. They are not future
  starts; the row shows only when it is not 0.
- **Open to hire by quarter end** `O(q) = A(q) − H − S(q) − M(q)`. This is the user's formula (the moves
  term shows only when it is not 0). Its card also
  shows the seat view: approved seats by the quarter end that are not Filled and carry no accepted offer
  (Open with no accepted offer + Planned), and the reconciling line "n people not in plan count against
  approved heads", so `O(q)` = open seats − not in plan. `O(q)` can be negative (over plan): it reads
  "Over by n" and never as a hiring target.
- **New to hire in the quarter** `O(q) − O(q−1)` for the quarters ahead. The first one counts against
  open to hire on the day before it starts: now, for the quarter that holds the as-of date; for a later
  fiscal year shown, O on the prior year's last day, so its Q1 holds only what comes due in it.
- **Expected exits by quarter end** `E(q)`: the forecast engine's exits from the as-of date to the
  quarter's end, known exits (terminationDate) plus modeled exits (attrition, R10 and 6.7 cohorts),
  rounded to one decimal; "Known" and "Modeled" shown apart. Known exits also count, as the forecast
  does, the holder of a seat an approved Elimination or Trade ends (on its last day) and a move out
  of the scope; and, beyond the position-based forecast, the last days of people not in plan in the
  scope and an approved move out of it the HRIS has not recorded. In Manager mode the modeled exits
  are the tree's own cohort's: the tree's seats are netted over themselves alone, so no last day at
  or above the manager's seat, or of a peer outside the tree, moves them (8.4, R23).
- **To hire to reach plan by quarter end** `O(q) + E(q)`: open to hire plus the backfills the expected
  exits make.

#### Hiring velocity

- **Actual, by month** for the trailing 12 closed months (and by quarter for closed quarters): hires (as
  `plan.hires.ytd` counts them: employees whose hireDate falls in the month into a seat in scope;
  internal moves are not hires), exits (employees whose terminationDate falls in the month, from seats in
  scope), net = hires − exits.
- **Pace**: hires per month and exits per month, averaged over the last 3 closed months and the last 6;
  net pace = hires − exits per month. Attrition, annualised: exits over the last 12 closed months ÷ average
  heads over those months (shown as a percent, heads based, no amounts).
- **Needed pace**: hires per month needed to reach plan by each quarter end ahead =
  (`O(q)` + `E(q)`) ÷ months from the as-of date to that quarter end; compared with the 3-month hire pace
  ("on pace", "behind by n a month").
- **Months to close at this pace**: `O(FY end)` ÷ net pace when net pace is above 0; with a net pace
  of 0 or below, "Not closing at this pace: exits match or outrun hires"; with no 3 closed months yet,
  "The pace needs 3 closed months".

#### Screen (Plan > Hiring)

1. KPI strip (five to seven tiles): Open to hire this fiscal year (`plan.hiring.open`, the headline:
   R1 approved heads − current heads − future starts = O(FY end)), Future starts (`plan.hiring.acceptedStarts`,
   signed offers starting after the as-of date),
   Hires per month, 3-month pace (`plan.hiring.pace`), Exits per month, 3-month pace (`plan.hiring.exitPace`),
   Net hiring pace (`plan.hiring.netPace`), Months to close at this pace (`plan.hiring.monthsToClose`).
   Each opens a calculation card with the formula and the inputs (Census card pattern).
2. **Open to hire by quarter** (figure `plan-hiring-quarters`): a table, one column per quarter of the
   fiscal year (history quarters greyed with their actual heads at the quarter end and their hires and
   exits), rows: Approved heads by quarter end, Current heads (as of), Future starts by quarter end,
   Moves in by quarter end (only when not 0), Open to hire, New to hire in the quarter, Expected exits by quarter end, To hire to reach plan, Hires
   needed per month, plus a small bar chart of open to hire by quarter. Drill: each count opens its
   records (seats, people, offers) under the mode's drill rules (Manager: positions and date-only offer
   columns).
3. **Hiring velocity** (figure `plan-hiring-velocity`): monthly hires and exits for the trailing 12
   closed months as bars (hires up, exits down) with the net line, then the months ahead to FY end in a
   lighter style: future starts (signed offers by their start month, whole people; never a forecast
   start) and expected exits; a pace note under it.
3b. **Hires in the last 3 months, by location and department** (figure `plan-hiring-recent`, C37): the
   hires of the last 3 closed months (as `plan.hires.ytd` counts a hire), one row per department and
   location that had a hire, with a column per month, the total and the hires per month; sub-totals by
   location and by department (the scope's departments are its groups) and a total that equals the 3
   months' hires in the velocity figure. Each count opens the hires it counts under the mode's drill
   rules. Heads only.
4. Readout (findings, Census style, 0 to 3): e.g. "Exits outpace hires over the last 3 months", "At the
   3-month pace, open to hire closes in 7 months, after FY end", "12 openings are past their target start".

Homes: the HRBP Unit plan, Leader Rollup and Manager My team homes gain one tile, Open to hire
(`plan.hiring.open`, "Open to hire, FY27"), linking to Plan > Hiring (Manager's My team: under Left to fill, with the note
that Left to fill counts seats while Open to hire subtracts current heads and future starts). The
Finance home does not change. Keep each home's KPI count rule (5 to 7).

#### Privacy

Heads only, so no cost guard. Rules that still apply: 8.4 (nothing about a Manager's own seat or above;
Manager C's elimination stays out of every Manager count, since it is a request on C's own seat and the
approved Elimination ends a seat outside C's tree), leave (exits are terminations, never leave; on-leave
people stay in current heads and are never split out), offers (dates only; no offer amount, sign-on or
agency fee), and requests hidden by 8.4 rule 3 never change a count a viewer sees where their rows sit
outside the viewer's scope (Manager mode's tree, R23). A mode whose scope holds the touched seat (Finance
acting as C, the CFO leader) reads the approved state as its other tabs do, and seats a hidden request
creates inside the viewer's own tree (a Trade's get seats) are the team's seats (CONTRACTS-HIRING I1,
R146). The leak crawl walks the tab, its cards, drills and exports in every mode with the Manager A, B, C
personas.

#### Metrics (section 12 rows)

plan.hiring.approvedByQuarter, plan.hiring.currentHeads (alias of plan.heads.actual), plan.hiring.acceptedStarts,
plan.hiring.open, plan.hiring.openByQuarter, plan.hiring.newByQuarter,
plan.hiring.expectedExits, plan.hiring.toReachPlan, plan.hiring.hiresByMonth, plan.hiring.exitsByMonth,
plan.hiring.pace, plan.hiring.exitPace, plan.hiring.netPace, plan.hiring.attritionRate,
plan.hiring.neededPace, plan.hiring.monthsToClose; C37 adds plan.hiring.movesIn (the Moves in row) and
plan.hiring.recentHires (figure `plan-hiring-recent`; its hires per month read plan.hiring.pace). Units
int, num1 (paces, months), pct1 (attrition).

#### Fixtures and sample checks

- Fixture HG1 (hand-computed, in hiring.fixtures.ts): a team of 10 approved seats at FY end (8 by Q3 end),
  6 Filled, 1 accepted offer starting in Q3, 1 Open with no offer (target start Q3), 2 Planned starting
  Q4, 1 person not in plan; as-of in Q2. A(Q3) = 8, H = 7, S(Q3) = 1, O(Q3) = 0; A(Q4) = 10, S(Q4) = 1,
  O(Q4) = 2; seat view: 3 open seats − 1 not in plan = 2. Velocity: hires 3, 1, 0 and exits 0, 1, 1 in the
  last 3 closed months: pace 1.33, exit pace 0.67, net 0.67; months to close 3.0. Headline open to hire
  (FY) = 2; O(Q2) = 6 − 7 − 0 = −1 reads "Over by 1" (the person not in plan). C37: the accepted offer is
  a signed offer, so S(q) is unchanged and M(q) = 0 in every quarter (no move in); the months ahead,
  September to March, show future starts 0, 1, 0, 0, 0, 0, 0 (the signed offer in October), never the
  forecast's modeled starts of the Open seat with no offer or the two Planned seats.
- Fixture HG8 (C37, hand-computed): moves in. 6 approved seats at FY end, 2 Filled (one whose holder
  leaves 31 Jan 2027 and a move in takes it on 1 Feb), 1 Open a move in takes on 2 Nov (Q3), 1 Open with a
  signed offer starting 7 Dec (Q3), 1 Planned a move in takes on 1 Feb (Q4), 1 Planned with neither;
  as-of 30 Sep 2026. O(Q3) = 4 − 2 − 1 − 1 = 0; O(Q4) = 6 − 2 − 1 − 3 = 0, the seat view 1 open seat − 1
  move in on a seat that is not open = 0; without the moves O(Q4) = 3; the months ahead's future starts
  are 0, 0, 1, 0, 0, 0 (no move is ever a future start).
- Sample: sample.test.ts pins Plan > Hiring for Silicon Engineering (HRBP), Chun-Hsien Kuo's org (Leader),
  the whole company (Finance) and Sebastian Wagner's team (Manager): every row of the quarter table and
  the paces, computed by independent code from raw rows in the test, and consistent with Openings (open
  seats), My team (left to fill) and the forecast (expected exits). Since C37 also the months ahead's
  future starts (SE and the leader's org 3, 3, 3, 0, 0, 0; the company 8, 8, 6, 0, 0, 0; Manager A none),
  no move in, and the hires of July to September by department and location (SE 2, 8, 3 over 10
  department and location rows; the company 11, 19, 9 over 31; Manager A none), each sub-total by
  department and by location.

#### Help

view-plan gains a Hiring section; the glossary gains Open to hire, Future start (C37; "Accepted start"
before: a person with a signed offer who has not started yet, by start date), Hiring pace, Net hiring
pace and Attrition (heads); the view-plan tour gains a step on the quarter table (the tour stays 4 to 6
steps per mode, so C37's table of recent hires gets no step of its own; the Hiring section names it). Copy: "Open to hire", never "headcount to hire"; plain counts.


### 9.8 Recruiting summary (Plan > Recruiting summary, change C38)

**Status: built 27 Oct 2026.**
Code: `src/views/plan/engine/recruitingTab.ts` and `recruitingModel.ts`, `src/views/plan/ui/Recruiting.tsx` and `RecruitingMonthsChart.tsx`; contracts in docs/CONTRACTS-HIRING.md section 6, readings R133 to R148, which override 9.8 where they differ (as R132 does for 9.7).

User request, 26 Oct 2026: "one simple view i can show the head of recruiting that shows current approved,
future starts, projected starts, projected attrition and hiring velocity".

A Plan tab `recruiting` ("Recruiting summary"), after Hiring, shown in every mode over the mode's scope
(heads only, like 9.7; policy `tab:plan.recruiting` S everywhere, Manager's how "Your team, in heads").
It is one screen with no sub-tabs, built to be shown: big numbers first, one chart, one small table, and
a one-slide export. It reuses 9.7's engine; no number here is computed differently from Plan > Hiring.

1. **Seven numbers** (KPI strip, each with its calculation card), for the fiscal year shown:
   - **Approved heads**: R1 approved heads (as 9.7's A at FY end).
   - **Current heads**: actual heads at the as-of date (9.7's H).
   - **Open to hire**: 9.7's O(FY end).
   - **Future starts**: people with a signed offer starting after the as-of date by FY end (9.7's S, C37).
   - **Projected starts**: the forecast's starts to FY end on approved Open and Planned seats with no signed
     offer (6.7: fill rate, time to fill, backfills), one decimal, labelled "model". Never mixed with
     future starts.
   - **Projected attrition**: 9.7's E(FY end) (known plus modeled exits to FY end, one decimal), with the
     annual attrition rate (heads) under it.
   - **Hiring velocity**: hires per month, 3-month pace, with the 6-month pace and the last 3 months'
     hires under it.
2. **One chart, "Heads and hiring by month"** (figure `plan-recruiting-months`): for the last 12 closed
   months, actual hires (up) and exits (down) as bars and actual heads as a line; for the months ahead to
   FY end, future starts, moves in and projected starts stacked up (projected in a lighter style),
   projected attrition down, and projected heads (current heads + future starts + moves in + projected
   starts − projected attrition, with R134's rare terms) as a dashed line; approved heads as a flat
   reference line (R136, R137, R143).
3. **One small table, "By quarter ahead"** (figure `plan-recruiting-quarters`): per quarter ahead, approved
   heads by the quarter end, future starts, projected starts, projected attrition, projected heads at the
   quarter end and the gap to approved heads (projected heads − approved, "short by n" or "over by n").
4. **Where hiring happened** (figure `plan-recruiting-where`): the top 5 locations and top 5 departments by
   hires over the last 3 closed months (from 9.7's C37 figure), with "and n more" and a link to Plan >
   Hiring for the full table.
5. **Export**: the tab's deck export is one slide (title, scope, as-of, the seven numbers, the chart) after
   the "About these numbers" slide; image and CSV per figure as elsewhere.

Words: "Future starts" (signed offers) and "Projected starts" (the model) are always apart and named that
way; "Projected attrition" for expected exits on this tab. Privacy as 9.7 (heads only; 8.4; Manager mode
uses the tree's own cohort for modeled exits and starts). Help: view-plan gains a Recruiting summary
section; the view-plan tour may point at the tab.

#### Metrics (section 12 rows)

The tab reads Plan > Hiring's ids (plan.hiring.approvedByQuarter, plan.hiring.currentHeads,
plan.hiring.open, plan.hiring.acceptedStarts, plan.hiring.expectedExits, plan.hiring.movesIn,
plan.hiring.pace, plan.hiring.attritionRate, plan.hiring.recentHires) and adds three of its own:
plan.recruiting.projectedStarts, plan.recruiting.projectedHeads and plan.recruiting.gapToApproved, units
num1, registered after plan.hiring.recentHires (`RECRUITING_METRIC_IDS`), so the catalog has 112 data
metrics.

---

## 10. Requests, cycle, freezes, transfers, What if and audit

### 10.1 Request types and the state machine (`src/plan/engine/requests.ts`)

```ts
export interface HcRequest {
  requestId: string; type: RequestType; state: RequestState; reasonCode: ReasonCode
  requesterId: string; submittedById: string | null; submittedAt: ISODateTime | null; updatedAt: ISODateTime
  positionId: string | null; managerPositionId: string; businessUnit: string; department: string | null
  costCenter: string | null; level: Level | null; location: string | null; jobTitle: string | null
  fte: number | null; startDate: ISODate | null; priority: number | null; cycleId: string | null
  confidential: boolean; exception: { freezeId: string; reason: string } | null
  steps: Step[]; comments: Comment[]; changes: ChangeSet | null                 // approved with changes
  trade: TradeFields | null; transfer: TransferFields | null
  outcome: { createdPositionIds: string[]; changedPositionIds: string[] } | null
}
export interface Step { n: number; role: 'manager' | 'hrbp' | 'leader' | 'finance'; approverId: string
  reasons: ChainReason[]; enteredAt: ISODateTime | null; decision: Decision | null; at: ISODateTime | null }
export interface Comment { id: string; at: ISODateTime; by: string; mode: Mode; text: string; audience: 'everyone' | 'approvers' }
export function transition(req: HcRequest, action: RequestAction, actor: Actor, at: ISODateTime, ctx: ChainContext):
  { request: HcRequest; audit: AuditDraft[]; effects: PlanEffect[] } | { refused: string }
```

| Type | Touches | On approval |
|---|---|---|
| New role | a new seat under `managerPositionId` | adds a Planned position (new, never reused `positionId`) |
| Backfill | an existing seat with an exit | confirms the named seat for recruiting: a seat with an exit is Open from the day after its exit (6.5), and an On hold seat (left by an internal move, 10.5) becomes Open. Sets `openedDate` = the later of the approval date and the exiting holder's last day + 1. Flagged `backfill-new-position` if the named ID was created within 30 days before or after a known exit in the same org and has no exit itself; `backfill-no-exit` if the seat has no exit |
| Level change, Location change | an Open seat with no accepted offer, a Planned seat or a Filled seat | adds a dated position row (HRBP edits Open and Planned directly; these requests are for Filled seats and for managers) |
| Transfer | 10.5 | 10.5 |
| Elimination | a seat | end-dates the position (kept as Eliminated): the effective date is the seat's last day (endDate, inclusive) and the Eliminated row starts the next day; a Filled seat books severance (6.3); an open req on the seat raises `plan:req-on-eliminated` |
| Trade | section 11 | section 11 |
| Start recruiting | a Planned seat | the HRBP's audited Working edit adds a position row dated the approval date with status Open and `openedDate` = that date (HRBP-only chain) |
| Start date | an Open seat with no accepted offer, or a Planned seat | the HRBP's audited edit moves the start (HRBP-only chain) |

Seats with an accepted offer (req stage Offer accepted, not Started) are refused for every Working edit,
Start date, Level change, Location change, On hold and Trade, with block `accepted-offer` and the text
"This seat has an accepted offer. Its start date and terms come from the recruiting system." Elimination
is still allowed. Any HRBP Working edit that moves a seat to Open sets `openedDate` = the edit's effective
date.

States: Draft, Submitted, In review (step n), Sent back, Approved, Approved with changes, Rejected,
Withdrawn, Expired. Draft and Sent back expire after 60 idle days (measured against the as-of date);
requests in an open cycle never expire. After approval the tracker continues through Req opened,
Interviewing, Offer accepted (date only) and Started, with owner and days in step (from `reqs`).
Every transition writes audit entries (`by` = Acting as person, `mode`). Send-back, reject and change
reasons that contain an amount are refused at entry, and a comment with an amount is Approvers only
(8.4 rule 5).

### 10.2 The approval chain, as data (`src/plan/engine/chain.ts`)

```ts
export const CHAIN_RULES: readonly ChainRule[] = [
  { role: 'manager', who: 'submitter-manager',     when: 'always', except: ['Start recruiting', 'Start date'] },
  { role: 'hrbp',    who: 'unit-hrbp',             when: 'always' },
  { role: 'hrbp',    who: 'receiving-unit-hrbp',   when: ['cross-unit'], only: ['Transfer', 'Trade'] },
  { role: 'leader',  who: 'nearest-leader',        when: ['band-estimate-over-threshold', 'director-plus', 'out-of-plan'],
                                                   except: ['Start recruiting', 'Start date', 'Transfer'] },
  { role: 'leader',  who: 'nearest-leader',        when: ['different-direct-reports'], only: ['Trade'] },
  { role: 'leader',  who: 'giving-unit-leader',    when: ['cross-unit'], only: ['Transfer', 'Trade'] },
  { role: 'leader',  who: 'receiving-unit-leader', when: ['cross-unit'], only: ['Transfer', 'Trade'] },
  { role: 'finance', who: 'finance-approver',      when: ['new-role', 'freeze-exception', 'envelope-exception'],
                                                   except: ['Start recruiting', 'Start date'] },
  { role: 'finance', who: 'finance-approver',      when: ['cross-unit', 'out-of-plan'], only: ['Trade'] },
]
export function chainFor(req: HcRequest, ctx: ChainContext): Step[]
```

- A rule adds its step when any of its triggers holds; `only` limits a rule to the listed types and
  `except` skips them. For a Trade, `unit-hrbp` is the giving unit's HRBP; for a Transfer it is the
  from-unit's, and "giving" and "receiving" mean from and to. Start recruiting and Start date produce
  exactly one step, the unit HRBP, whatever the seat's level, band estimate or plan status.
- Submitter's manager = the holder of the requester's seat's `managerPositionId`.
- Unit HRBP from the Units list. The leader = the nearest leader seat above the request's org that is not
  the requester. Finance approver = the Finance persona on the Lists role column.
- Leader threshold: band estimate (annual, USD at plan rate, excluding SBC) strictly above $250,000
  (`requests.chain.leaderThreshold`, a locked setting), or a level of Director or above, or out of plan.
- **Out of plan**: the request's target org is the nearest org at or above the request's org that has a
  target, at worst its business unit. The request is out of plan when that org's asks, with this request
  counted, exceed its target at the target date in heads (`headEffect`, 6.9) or in cost as 7.2 rule 8
  defines it (the guarded asks cost, never exact HRIS sums); when no org up to and including the unit
  has a target; or when it is raised outside an open cycle while a cycle record for its fiscal year is in
  state Locked. A version lock, the Budget included, is not a cycle lock. The sample has no FY27 cycle
  record and an open FY28 cycle, so this last clause applies to no sample request.
- Routing is mode-independent: `chainFor` computes out of plan and the envelope check once, from the
  guarded values above, never from Finance's exact figures, and leaves out every request that 8.4 rule 3
  hides from this request's requester (8.4 rule 8). The steps are stored on the request (`steps`), so the
  chain preview, tracker and Approvals show every viewer the same chain.
- In-plan like-for-like backfills (same level, location and FTE, the seat in the plan of record) stop at
  the HRBP.
- No self-approval: a step whose approver is the requester moves up to the next person of that role
  above. One person on two steps keeps the higher step only. "Submit on behalf" records both the
  requester and the submitter.
- Approvers (not in Manager mode) see the band estimate and the gap after approval: the target org's gap
  with this request left out of asks, minus the request's head effect and its in-year band-estimate cost
  (6.9). It is never a recompute of Working lines with the request applied, so severance, HRIS base and
  offers never enter it. Each mode shows the cost gap under its own cost rules: in HRBP and Leader mode only when the target org is a union of atoms (7.3); in Finance, and in HR admin with the switch off, only under 7.4's org-row rule; otherwise the gap shows in heads only, beside the request's band estimate. The cost change is a band figure (7.2 rule 5).

**Chain fixtures** (`chain.fixtures.ts`, exact):
- CH1: a Start recruiting request on a Planned P5 San Jose seat, with a Locked FY27 cycle record, gives
  [hrbp].
- CH2: a Start date request on a Planned Director seat in a unit with no targets gives [hrbp].
- CH3: a same-unit position move gives [manager, hrbp].
- CH4: a cross-unit internal move gives [manager, from-unit HRBP, to-unit HRBP, from-unit leader,
  to-unit leader].
- CH5: trade T6 (11.7) gives [manager, giving HRBP, receiving HRBP, giving-unit leader, receiving-unit
  leader, Finance].

### 10.3 Planning cycle (`cycle.ts`)

Stages: Open for asks, HRBP review, Leader review, Finance review, Locked. Finance opens the cycle and
sets dates; each HRBP finishes HRBP review for their unit, each leader for their org; Finance locks or
returns.

- Managers submit **ranked asks** (requests with `cycleId` and `priority`). Cycle asks take the
  submitter's manager step; the HRBP, leader and Finance stages replace the per-request steps.
- Requests > Cycle shows who has not submitted ("Copy note" copies "Could you send your ranked asks for
  FY28 by 16 Oct?"; the word "remind" is not used in copy, Census's tone rule), and the ranked asks
  against the target with a **draggable cut line** (heads and in-year band estimate above and below,
  6.9).
- The HRBP approves with changes (managers see each change with its reason; a reason with an amount is
  refused, 8.4 rule 5); the leader adjusts within the envelope (cost compared as 7.2 rule 8); Finance
  locks or returns.
- **At lock**, asks above the cut line become Approved (or Approved with changes) and add Planned
  positions to that year's Working; asks below become Rejected with reason "Below the cut line", which
  managers see.

### 10.4 Freezes (`freeze.ts`)

- A freeze (org, from, to, `allowBackfill`) blocks new requests in the org, holds unstarted openings (the
  forecast does not start them while frozen; status is unchanged) and honors accepted offers. Backfills
  need `allowBackfill`.
- New request shows "Hiring is frozen for <org> from 1 Aug 2026. You can still submit an exception with a
  business reason." An exception adds a Finance step after the normal chain. Its business reason is
  refused at entry when it contains an amount (8.4 rule 5).
- Openings under a freeze are listed (Finance home, Action center); freeze savings per 6.9.

### 10.5 Transfers (`transfer.ts`)

```ts
export interface TransferFields { kind: 'position' | 'internal'; personId: string; fromPositionId: string
  toManagerPositionId: string | null; toPositionId: string | null; effectiveDate: ISODate; moveBudget: boolean }
```

- **Position move** (`position`): the seat and its person move under a new manager position (and maybe a
  new org); plan lines follow the moved position.
- **Internal move** (`internal`): the person fills an Open receiving seat; the old seat is held (On hold)
  until it is backfilled or eliminated.
- Chain (from 10.2's rules): the submitter's manager, the HRBP of the from-unit and of the to-unit (one
  step when they are the same person), and when units differ the leader of each unit. The band-estimate
  leader threshold does not apply to transfers, because amounts do not show. A move past a sub-org's
  cost envelope adds Finance (`envelope-exception`, cost compared as 7.2 rule 8).
- The moving person's name shows to the viewers in 8.4 rule 2a; amounts never show. "Move budget too?"
  shifts both orgs' targets by one head and the seat's in-year band estimate for the months that move:
  the whole fiscal year for a position move, because its plan lines follow it (R26), and from the
  effective date to FY end for an internal move. It never uses the seat's HRIS cost. The target changes
  write audit entries Finance sees in Targets.

### 10.6 What if (`whatif.ts`, HRBP, Leader, Finance, HR admin)

Unsaved levers held in session memory: defer a start, cancel an Open or Planned seat, shift starts by n
months, change level or location, freeze a sub-org from a date, trade (11.5). Results show the change the levers make to heads, cost and gap (Working with the levers against Working without them, not against the comparison version) under the guard. Levers act only on Planned seats, Open seats with no
accepted offer (an accepted offer is never offered as a lever target), requests and freezes. They are
always costed at band estimate, in-year per 6.9 (so shifting a start changes cost), as their own
rounding part, and never reprice a Filled seat's HRIS pay. Their cost deltas are band figures (7.2
rule 5, band-only differences), unless a lever's two sides differ in an HRIS or offer amount, in which
case the full rule 5 applies.

"Turn into requests" creates Draft requests for review, one per seat a lever touches: defer a start or
shift starts → Start date; cancel an Open or Planned seat → Elimination; change level → Level change;
change location → Location change; trade → Trade (one per trade lever, 11.5). The freeze lever is never
turned into a request, because freezes are Finance's (`freeze.create`). "Turn into requests" skips it and
says "Freezes are set by Finance. The freeze lever stays in this What if for you to share with Finance."
The lever is still costed in the results.

### 10.7 Audit (`src/plan/audit/`)

Append-only `{seq, at, by, byName, mode, object, id, field, old, new, effectiveDate, comment, prevHash,
hash}`. Each entry's hash is `sha256()` (`src/lib/sha256.ts`, synchronous) over its canonical JSON with
`prevHash`; `verifyChain(entries)` reports the first broken link. `verifyChain` and `verifyLock(version)`
are synchronous and pure, so the Audit page and version card models compute "Chain checks out (n
entries)" and "the hash still verifies" inside `model(ctx)`, and the leak crawler reads them. Copy says
"Each entry carries a checksum of the one before it, so damage shows." Never "tamper-proof". `by` is the
Acting as pick. Redaction per 8.4. Outside HR admin, entries are shown without `seq`, `prevHash` and
`hash`, and the Audit page shows "n entries" counted over the rows the viewer can see; "Chain checks out
(n entries)" shows in HR admin only.

---

## 11. Headcount trades (your added requirement)

> "Add a method to trade headcount between levels, regions, etc. with some ratio based on an 'average'
> headcount."

### 11.1 The idea in one paragraph

Every seat type (level × location × FTE, in an org) has a **weight**: its band estimate divided by a
**standard head**, the average band estimate per approved full-time equivalent (Σ band estimate ÷ Σ FTE)
in the fiscal year's Budget. An average full-time seat weighs 1.00; a P5 in San Jose might weigh 1.92 and
a P3 in Bengaluru 0.23. A **trade** gives up seats and gets seats of another type whose weights add up to
no more than what was given: the ratio is the weights' ratio, so 1 P5 San Jose trades for 8 P3 Bengaluru
with 0.11 standard heads left over as **trade credit**. Band estimate at plan rates (the loaded run rate)
is conserved to within half a basis point a seat, counting trade credit. Heads and band cost (midpoint ×
FTE) are not: T1 moves band cost from $220,000 to $240,000. Weights come only from bands, standard loads
and plan FX, never from anyone's pay, offer or leave, so they can show in every mode, Manager included,
as standard heads with no amounts.

Key point for choosing: in any cost-based design, the ratio between two seat types is the ratio of their
band estimates. What "average" decides is the unit people read and add up (company standard heads, each
org's own average, or seat-months), not the ratio. Question 6 offers the three.

### 11.2 Definitions

- **Standard head** `S` (per fiscal year) = Σ band estimate ÷ Σ FTE over approved employee positions at the
  Budget's year-end, Filled seats counted at band (never HRIS pay), rounded to the nearest $1,000. Set at
  Budget lock with "Compute from Budget" (Finance confirms) and carried unchanged into reforecasts. FY28
  uses FY28 Working's value, flagged "Rates can change until FY28 locks", and pending FY28 trades are
  re-quoted at each approval step with a "Rates changed" note.
- **Weight** = `round(bandEstimateUsd(seat at its FTE) ÷ S × 10,000)` in whole **basis points** of a
  standard head (1 standard head = 10,000 bp), so "give = get + credit" is exact in integers. Weight is not
  linear in FTE (burden caps and benefits per head do not scale), so it is always computed at the seat's
  own FTE.
- **Pricing** uses the plan of record's locked assumptions for the seats' fiscal year (bands, loads, plan
  FX). Forecast FX never re-prices a trade; it shows in the bridge's FX step. Equity is excluded (Trade
  rates can show an "incl. SBC" weight for information).
- **Tradable seats**: Employee seats that are Open (no accepted offer), Planned or On hold, in scope, not
  in another pending request. Filled seats never ("Filled seats are never traded: request an Elimination,
  then a New role"). Accepted offers (req stage Offer accepted, not Started) never, blocked
  `accepted-offer`: "This seat has an accepted offer. Its start date and terms come from the recruiting
  system." The same list feeds the What if trade lever.
- **Giving org** (`giveOrgPositionId`, stored on the request at submit and never re-derived) = the lowest
  manager position whose tree contains every give seat on the submit date. For a trade that gives only
  credit, it is the requester's own position in Manager mode and the org picked in step 1 in other modes.
- **Trade credit** is keyed to the giving org exactly: `creditBalance(requests, orgPositionId, year)` = Σ
  `creditBp` of approved trades with `giveOrgPositionId === orgPositionId` − Σ `creditUsedBp` of approved
  and pending trades with the same `giveOrgPositionId`, for that fiscal year. A trade can use only its own
  giving org's credit, so `credit-over-balance` checks that one balance, and the credit and the debit land
  on the same key. Credit lapses when the fiscal year closes. Derived, never stored; every change is
  audited. My team shows the summed credit of every giving org in the viewer's tree.

### 11.3 Engine (`src/plan/engine/band.ts`, `trade.ts`, pure)

```ts
export const SH_BP = 10_000
export interface SeatType { level: Level; location: string; fte: number }
export interface TradeRates { version: string; lockHash: string | null; year: FiscalYear
  standardHeadUsd: number; minFte: number; fteStep: number
  bandUsd(seat: SeatType, orgPositionId: string): number | null
  partTimeAllowed(location: string, orgPositionId: string): boolean }
export const weightBp = (bandUsd: number, standardHeadUsd: number): number =>
  Math.round((bandUsd / standardHeadUsd) * SH_BP)
export function standardHeadOf(positions: readonly TradePosition[], rates: Pick<TradeRates, 'bandUsd'>): number
export interface TradeAsk { give: readonly string[]; creditUsedBp: number
  giveOrgPositionId: string | null                     // null: derived from the give seats (11.2)
  get: SeatType & { orgPositionId: string; businessUnit: string; jobFamily: string | null
    start: ISODate; count: number | 'max'; partTimeRest: boolean }
  freezeException?: { reason: string } }
export type TradeBlock = 'filled' | 'accepted-offer' | 'eliminated' | 'pending-request' | 'not-in-scope'
  | 'not-employee' | 'no-band' | 'not-enough' | 'credit-over-balance' | 'fte-step'
  | 'part-time-not-allowed' | 'frozen' | 'closed-month'
export interface TradeQuote { ok: boolean; blocks: readonly { code: TradeBlock; positionId?: string; text: string }[]
  give: readonly TradeLine[]; get: readonly TradeLine[]; giveOrgPositionId: string
  giveBp: number; getBp: number; creditBp: number      // giveBp === getBp + creditBp, integers, creditBp >= 0
  maxSeats: number; ratio: number
  headsDelta: number   // seats received − given seats that are approved heads (Open or Planned); a given On hold seat counts 0
  inYearBp: number     // Σ get weight × FY fraction − Σ give weight × FY fraction, where FY fraction = Σ over the FY's
                       // months of activeFraction(version proration) ÷ 12, from the later of the seat's start and the
                       // first open month; negative = a saving; not rounded (information only); the card shows
                       // |inYearBp| ÷ 10,000 to 2 dp as "saves" when negative and "costs" when positive
  getBandUsd: number                                   // a cost field; the leader threshold reads it
  rates: { version: string; lockHash: string | null; standardHeadUsd: number } }
export function tradeQuote(ask: TradeAsk, seats: ReadonlyMap<string, TradeSeat>, rates: TradeRates, ctx: TradeContext): TradeQuote
export function creditBalance(requests: readonly HcRequest[], orgPositionId: string, year: FiscalYear): number
export function applyTrade(plan: WorkingPlan, req: HcRequest, at: ISODate): { positions: PositionChange[]; audit: AuditDraft[] }
```

Blocks are ordered filled, accepted-offer, eliminated, not-employee, no-band, not-in-scope, closed-month,
frozen, pending-request, then the ask's own blocks (part-time-not-allowed, fte-step, credit-over-balance,
not-enough). A give seat shows only its first block, so a Filled seat in a request the viewer cannot see
reads `filled` only. `headsDelta` is the trade's head effect in asks and budget status (6.9 `headEffect`).

Rules: `maxSeats = floor(giveBp ÷ weight of one wanted seat)`; `count` defaults to the maximum; nothing
rounds up; the optional part-time last seat takes the largest FTE step (0.1, minimum 0.5) that fits,
where the location allows part time; start dates must be in the first open month or later. A get seat
with `fte` below 1.0, or the `partTimeRest` seat, is blocked `part-time-not-allowed` where
`partTimeAllowed(location, org)` is false; a get `fte` below `minFte` or not a multiple of `fteStep` is
blocked `fte-step`. Part time is checked only on get seats: a part-time give seat is tradable under 11.2.

### 11.4 Request type "Trade"

Trade is a request type with the usual states. Fields on `requests` (and the import shape):
`givePositionIds` (`;`-separated in files), `giveOrgPositionId` (the giving org, 11.2), `creditUsedBp`,
`level`, `location`, `fte`, `count`, `managerPositionId` (the get seats' org), `jobFamily`, `startDate`,
`partTimeRest`, `rateVersion`, `rateHash`, `giveBp`, `getBp`, `creditBp` (stored at submit and re-stored
at each approval). Reason codes: `REASON_CODES_OF.Trade` (Cost-neutral mix, Location strategy, Level mix,
Other).

**Chain** (same rules as 10.2, plus): HRBP of the giving unit always; HRBP of the receiving unit and both
unit leaders when it crosses units; the leader when the get seats' band estimate tops $250,000, a get
seat is Director or above, it is out of plan, or the give and get orgs sit under different direct reports
of that leader; Finance when it crosses units, is out of plan, or is a freeze exception. An in-plan trade
inside one manager's tree, under the threshold, with no Director+ seat, stops at the HRBP.

**Targets**: a trade leaves Finance's targets as they are. Pending trades count **net** in asks. In heads:
seats received − Open or Planned seats given (`headsDelta`); an On hold seat given counts 0, because it
was never an approved head. In cost: the in-year band delta, by the same rule as 6.9 (get seats at band
estimate from their start dates, give seats' Working lines removed from the first open month, in-year at
plan rates; give seats are never Filled or accepted offers, so both legs are band). A trade that pushes
asks over the target, as 7.2 rule 8 defines it (the guarded asks cost, computed once in `chainFor`, the
same in every mode), is out of plan and goes to the leader and Finance. Out of plan is tested for each
org the trade touches, with that org's net effect, against the nearest org at or above it that has a
target (10.2), and never reads a request that 8.4 rule 3 hides from the trade's requester (8.4 rule 8). A
cross-unit trade offers Finance "Move target too?" (on by default): the giving unit's target loses the
given seats that are approved heads (On hold seats count 0) and their in-year band estimate (6.9), the receiving unit's gains the seats received and theirs. Credit stays with the giving org (11.2).

**On approval** (`applyTrade`): give seats become Eliminated with `endReason: 'Traded'` from the approval
date. The app never edits `reqs`: a give seat's open req stays as imported, counts in
`plan.reqs.notInPlan` and raises the Action item `plan:req-on-eliminated:<reqId>` (owner HRBP, "Close req
<reqId> in the ATS: its seat was traded", closes when the imported req's status is Filled or Cancelled);
the quote warns if that req's stage is Interviewing. Get seats become new Planned positions with
`sourceRequestId`; the credit ledger moves; one audit entry per field.
**Approved with changes**: the HRBP may lower `count` or move `startDate`; the trade is re-quoted and the
manager sees "Changed by your HRBP: 8 seats to 6, credit 0.11 to 0.56 standard heads".

**Manager budget status** keeps the spec's two legs (heads, and band cost = midpoint × FTE, 6.9); trades
add no leg. An approved trade is absorbed by the allocation: its give seats are approved eliminations and
its get seats approved adds. A pending trade counts only in the crossing test, by its head effect and band
cost from its start dates (6.9), with the reason in heads: "A pending trade adds 7 heads from Jan".
Standard heads show only as a note on Allocation (`team.trade.standardHeads` = Σ weight of the
allocation's positions ÷ 10,000) and never set Over or At risk.

### 11.5 Where it shows

| Place | What |
|---|---|
| Requests > New > Trade | 1 Give: tradable seats with their weight; Filled and accepted-offer seats disabled with their reason; "Use trade credit (0.11)". 2 Get: level, location, FTE, org, job family, start, with "You can get 8 (8.49)". 3 Quote card: "Give 1 P5 San Jose (1.92). Get 8 P3 Bengaluru (1.81). Credit 0.11 standard heads. Heads +7. In FY27 this saves 0.35 standard heads (start dates)." Heads count approved heads: an On hold seat given counts 0, and the card adds "The On hold seat you give was not counted in your heads." Then the chain preview ("Goes to: your manager, your HRBP, your leader: over the leader threshold"; Manager mode never prints $250,000) and the free-text hint. |
| Requests > Approvals and Mine | A trade card with weights and the gap after approval; USD band estimates where `cost:band` allows |
| What if | A "Trade" lever with the same pickers; "Turn into requests" makes one Trade request per lever |
| Targets > Gap | A "Heads from trades" column (`targets.trades.heads`); pending trades count net in asks (seats received − Open or Planned seats given; On hold seats given count 0) |
| Finance > Assumptions > Trade rates (`tab:finance.assumptions:trade-rates`) | Level × location rows for the version's year: band estimate (USD, plan FX, annual), weight, "incl. SBC" weight (labeled), part time allowed; the standard head row with "Compute from Budget: $149,849, in use $150,000"; read only for locked versions and for HRBP |
| Plan > Positions | A "Standard heads" column in every mode |
| My team | KPIs stay in heads; the Allocation note reads "24 heads, 27.40 standard heads"; Left to request's note shows the trade credit of every giving org in the tree (11.2); one Action item per giving org: "Trade credit of 0.91 standard heads held by <org> lapses when FY27 closes" |
| Audit | Trade entries; outside HR admin, `standardHeadUsd`, band and `bandUsd` changes read "changed"; bp fields show |
| Help | Article `trading-heads` (Definitions) and a What if tour step on `[data-tour="whatif-trade"]` |

### 11.6 Visibility

Every trade surface has one id and one decision, held where the policy grid holds it, so `ROLE_POLICY`
never carries two decisions or two reasons for one id:

| What | Surface id | Decided in |
|---|---|---|
| Starting a trade | `action:request.trade` | 8.3 Actions (Finance: "Finance approves trades; it does not start them.") |
| Weights, ratio, credit, standard heads (bp only, never USD) | `ui:trade-weights` | 8.3 (shown in every mode) |
| USD band estimates on trade cards | `cost:band` | 8.3 (hidden in Manager mode: "Managers see heads and standard heads, never amounts."); which trades a mode sees at all follows 8.4 rules 1 and 2, so there is no separate trade decision |
| Finance > Assumptions > Trade rates | `tab:finance.assumptions:trade-rates` | 8.3 Views (HRBP read only; hidden for Manager and Leader: "Leaders see weights on requests.") |
| Standard head in USD | `metric:finance.trade.standardHead` | section 12 (guard B): Manager H, HRBP L "Read only.", Leader L "On trade cards in your org, beside the band estimates.", Finance S, HR admin S |
| What if trade lever | `view:whatif`, `action:whatif.use` | 8.3 (no separate id) |

Leaders already see band estimates and standard heads, so the standard head in USD tells them nothing
new; it stays off Finance > Assumptions only because that tab is hidden for Leader.

Exports and Shareable files from Manager mode drop `getBandUsd`, `bandUsd`, `standardHeadUsd`, bands and
loads; bp fields stay. **Accepted risk** (15.3): standard heads reveal relative band estimates by level
and location; a manager who knows one band midpoint can convert the rest. That is pay structure, not
anyone's pay.

### 11.7 Fixtures (`src/plan/engine/trade.fixtures.ts`, exact)

Fixture rates: FY27 (1 Apr 2026 to 31 Mar 2027), `full-month` proration, first open month 2026-10, plan
FX USD 1, EUR 1.08, INR 0.012, ILS 0.27. Trade settings: minFte 0.5, fteStep 0.1; part time allowed in
San Jose, Munich and Haifa, not in Bengaluru (`trade.partTime` true at company, false for Bengaluru).
Chain context for T1 to T6: every org they touch has an FY27 target of 40 heads and $8,000,000, with
guarded asks (7.2 rule 8) of 30 heads and $5,000,000 before the quote; FY27 has no cycle record. T1's get
seats report to the same manager position as its give seat.

| Seat (1.0 FTE) | Midpoint, bonus | Burden, benefits | Band estimate | Weight (S = $150,000) | Part time |
|---|---|---|---|---|---|
| P3 San Jose | $150,000, 10% | 8% capped $180,000; $20,000 | $198,200.00 | 13,213 bp | allowed |
| P4 San Jose | $180,000, 12% | same | $236,000.00 | 15,733 | allowed |
| P5 San Jose | $220,000, 15% | same | $287,400.00 | 19,160 | allowed |
| M2 San Jose (Director) | $300,000, 20% | same | $394,400.00 | 26,293 | allowed |
| P4 Munich (the spec's seat) | €110,000, 10% | 21% capped €90,600; €0 | €140,026 = $151,228.08 | 10,082 | allowed |
| P3 Bengaluru | ₹2,500,000, 10% | 12% capped ₹180,000; ₹50,000 | ₹2,821,600 = $33,859.20 | 2,257 | not allowed |
| P4 Haifa | ₪480,000, 10% | 12.5% capped ₪600,000; ₪0 | ₪594,000 = $160,380.00 | 10,692 | allowed |

- **F-S**: 1 P5 San Jose, 1 P4 San Jose, 6 P4 Munich and 2 P3 Bengaluru at 1.0 FTE: Σ $1,498,486.88 ÷ 10 FTE
  = $149,848.69, rounds to **$150,000**. Changing any Filled seat's HRIS salary leaves S unchanged.
- **F-S2**: the same seats plus 1 P4 Munich at 0.5 FTE ($79,061.40): Σ $1,577,548.28 ÷ 10.5 FTE =
  $150,242.69, still **$150,000**. Dividing by heads instead gives $143,413.48 (rounds to $143,000), so this
  case pins the divisor to Σ FTE.

| id | Give | Want | Seats | getBp | Credit bp | Ratio | Heads | Chain |
|---|---|---|---|---|---|---|---|---|
| T1 | 1 Planned P5 San Jose from 2026-11-01 (19,160) | P3 Bengaluru from 2027-01-01 | 8 | 18,056 | 1,104 (0.11) | 8.4891 | +7 | manager, HRBP, leader (band estimate $270,873.60 over threshold) |
| T1′ | as T1, with asks of 35 heads before the quote | P3 Bengaluru | 8 | 18,056 | 1,104 | 8.4891 | +7 | manager, HRBP, leader (over threshold, out of plan), Finance (out of plan): asks 42 > target 40 |
| T1h | 1 On hold P5 San Jose (19,160) | P3 Bengaluru | 8 | 18,056 | 1,104 | 8.4891 | +8 | manager, HRBP, leader; asks rise by 8 while pending and approved heads rise by 8 on approval |
| T2 | 1 Open P4 Munich (10,082) | P3 Bengaluru | 4 | 9,028 | 1,054 | 4.4670 | +3 | manager, HRBP |
| T3 | 8 P3 Bengaluru (18,056) + credit 1,104 | P5 San Jose | 1 | 19,160 | 0 | 1.0000 | −7 | manager, HRBP, leader |
| T4 | 1 P5 San Jose (19,160) | P4 Munich, with part-time rest | 1 + one 0.8 FTE (8,339) | 18,421 | 739 | | +1 | manager, HRBP, leader |
| T5 | 6 P3 Bengaluru (13,542) | P5 San Jose | 0 | | | 0.7068 | | blocked `not-enough`: "6 P3 Bengaluru seats make 1.35 standard heads; 1 P5 San Jose needs 1.92. Add 3 more P3 Bengaluru seats." |
| T6 | 1 Planned P4 San Jose in Go-to-Market (15,733) | P4 Haifa in Silicon Engineering | 1 | 10,692 | 5,041 (held by the giving GTM manager position) | 1.4715 | 0 | manager, both HRBPs, both unit leaders, Finance (cross-unit) |
| T7a | a Filled seat; an Open seat with an accepted offer; a contractor seat | P3 Bengaluru | | | | | | blocked `filled`, `accepted-offer`, `not-employee` (one block per seat, with its positionId) |
| T7b | 1 Planned P5 San Jose (19,160) | P3 Bengaluru at 0.5 FTE; separately, P3 Bengaluru 1.0 FTE with `partTimeRest` | | | | | | blocked `part-time-not-allowed` (both asks): "Bengaluru seats are full time only." |

- **In-year (T1).** Out 5/12, in 3/12 (1st-of-month starts give the same fractions under every
  proration). inYearBp = 18,056 × 3/12 − 19,160 × 5/12 = −3,469.33, shown as "In FY27 this saves 0.35
  standard heads (start dates)". Finance USD (bp × S ÷ 10,000) = −$52,040.00, against −$52,031.60 from
  exact bands (6.9 fixture G3).

Properties: `giveBp === getBp + creditBp` for every quote; T1 then T3 restores the seats with credit 0;
band USD drift is at most half a basis point per rounded seat: |Σ give bandUsd + (creditUsedBp −
creditBp) × S ÷ 10,000 − Σ get bandUsd| ≤ 0.5 × S ÷ 10,000 × (give seats + get seats), with the bound
computed from the seat count (credit is an integer bp difference and adds no rounding; T1: 1 + 8 = 9
seats, $33.60 of $67.50 allowed, 8 × $4.20 from $33,859.20 against 2,257 bp × $15 = $33,855.00); for
every trade, the rise in asks heads at the target date while it is pending equals the rise in approved
heads at that date after `applyTrade`, so the gap does not move at approval; editing Working's bands after
T2 is approved leaves T2's stored weights and the Budget hash unchanged.

### 11.8 Trade leak tests (`src/access/tradeLeaks.slow.test.ts`, crawl plus HR admin control)

Manager trade surfaces contain no currency symbol, ISO code or grouped number; in a team of 3 Filled + 2
Planned, changing a `baseSalary`, an `offerBase` and a `leavePaid` leaves every Manager surface, quote and
weight byte-identical; S is independent of HRIS pay, offers and leave (and moves when a band midpoint
moves); Manager C's tradable list, credit and quotes, and the chain preview and stored steps of a Trade
that C drafts and submits in their tree, are identical with and without the confidential elimination
(16.1 sets the target so the elimination would flip out of plan); Filled and accepted-offer seats are
blocked for every sample position, in Requests > New and in the What if trade lever; a trade comment with
an amount is Approvers only and never reaches Manager mode, including one imported with audience
Everyone.

---

## 12. Metric catalog

Census's dictionary machinery, unchanged: `MetricDef { id, name, views, definition, formula, population,
window, unit, goodDirection, uses, params, dependsOn?, owner, locked?, kind? }`, registered per view with
`defineMetrics('<view>', [...])` in `views/<key>/metrics.ts` and assembled in `src/metrics/catalog.ts`.
`validateCatalog` holds: ids look like `view.group.name`; the prefix is the home view (`views[0]`) or a
shared prefix (`privacy`, `quality`, `cost`); no em dash between words, no "!". Tests require `formula`,
`population` and `window` on every metric that reads data. Engines read settings only through
`ctx.metrics` (a `recordParamReads` test fails when a registered setting is never read). Forecast drivers
(attrition, fill rate, time to fill, backfill) are **assumptions data**, not metric settings, because they
lock with versions. The spec's shorthand names map to ids as shown ("Alias").

Guard column: **G** cost amount under the full guard; **B** band estimate (reads no pay: shown to HRBP,
Leader, Finance, HR admin; never Manager; never added to a filled total under 5); **D** a difference
under rule 5; **–** not money.

| Id | Alias | Name | Unit | Views | Guard |
|---|---|---|---|---|---|
| `team.allocation.heads` | mgr.allocation | Allocation | int | team | – |
| `team.allocation.filled` | | Filled seats | int | team | – |
| `team.allocation.open` | | Open seats | int | team | – |
| `team.allocation.planned` | | Planned seats | int | team | – |
| `team.allocation.leftToFill` | mgr.leftToFill | Left to fill | int | team | – |
| `team.allocation.leftToRequest` | mgr.leftToRequest | Left to request | int | team | – |
| `team.requests.pending` | mgr.pending | Pending requests | int | team | – |
| `team.budget.status` | mgr.budgetStatus | Budget status: heads and band cost (midpoint × FTE) against the allocation (setting `atRiskShare` 0.02) | text | team | – (band cost inside, never shown) |
| `team.trade.standardHeads` | | Allocation in standard heads: Σ weight of the allocation's positions ÷ 10,000 (a note on Allocation; never sets budget status) | num2 | team | – |
| `plan.heads.plan` | hc.planHeads | Plan heads | int | plan, home, forecast | – |
| `plan.heads.approved` | hc.approvedHeads | Approved heads | int | plan, home, targets | – |
| `plan.heads.actual` | hc.actualHeads | Actual heads | int | plan, home, finance | – |
| `plan.heads.notInPlan` | recon.notInPlan | Not in plan | int | plan, finance | – |
| `plan.fte.average` | fte.avg | Average FTE | num1 | plan, forecast | – |
| `plan.hires.ytd` | hc.hiresYtd | Hires year to date: employees (`workerType` employee) whose `hireDate` falls from the fiscal year's start to the last closed month-end, in scope; internal moves and transfers are not hires | int | plan, home | – |
| `plan.hires.planned` | | Planned hires year to date: positions in the comparison version whose line first counts a head (0 to 1) in the same window (the fiscal year's start to the last closed month-end), in scope, excluding seats Filled at the fiscal year's start and positions that receive a transfer | int | plan, home | – |
| `plan.exits.ytd` | | Exits year to date | int | plan | – |
| `plan.positions.byStatus` | | Positions by status | int | plan, team | – |
| `plan.openings.count` | | Openings | int | plan | – |
| `plan.openings.age` | | Opening age (median days since opened) | days | plan | – |
| `plan.openings.pastStart` | | Openings past target start | int | plan, home | – |
| `plan.openings.noReq` | | Planned seats near start with no req (setting `days` 45) | int | plan, home | – |
| `plan.openings.frozen` | fin.frozenOpenings | Openings under a freeze: Open and Planned seats, not started and with no accepted offer, in an org whose freeze covers the as-of date (backfill seats excluded when the freeze has `allowBackfill`); the seats the forecast holds (6.7) and freeze savings prices (6.9) | int | plan, home, finance | – |
| `plan.offers.accepted` | | Accepted offers not started | int | plan | – |
| `plan.reqs.notInPlan` | | Reqs not in plan | int | plan, home, finance | – |
| `plan.transfers.open` | | Transfers in progress | int | plan | – |
| `plan.leave.onLeave` | | On leave (one count for the whole unit or org at the as-of date, 5 or more; no filter other than version and comparison, and no breakdown, series or delta, 7.7) | int | plan | leave rule |
| `plan.cost.loaded` | cost.loaded | Loaded cost | money | plan, forecast, targets, home | G |
| `plan.cost.loadedInclSbc` | | Loaded cost incl. SBC | money | plan, forecast | G |
| `plan.cost.component` | | Cost by component | money | plan, finance | G |
| `plan.cost.perHead` | | Loaded cost per head | money | plan | G |
| `plan.cost.openBand` | | Open and Planned at band estimate | money | plan, forecast | B |
| `plan.cost.bandEstimate` | req.bandEstimate | Band estimate | money | plan, requests | B |
| `plan.trade.weight` | | Standard heads | num2 | plan, requests, team | – |
| `requests.queue.open` | | Requests in progress | int | requests, home | – |
| `requests.queue.waiting` | req.waiting5d | Waiting 5 or more days (setting `days` 5) | int | requests, home | – |
| `requests.queue.sentBack` | | Sent back | int | requests | – |
| `requests.queue.expired` | | Expired (setting `idleDays` 60) | int | requests | – |
| `requests.tracker.daysInStep` | | Days in step | days | requests, team | – |
| `requests.chain.leaderThreshold` | | Leader threshold (setting `bandEstimateUsd` 250000, kind setting) | money | requests | B |
| `requests.cycle.notSubmitted` | | Managers not submitted | int | requests, home | – |
| `requests.cycle.asks` | | Ranked asks | int | requests, targets | – (band part B) |
| `requests.cycle.aboveCut` | | Asks above the cut line | int | requests | – |
| `requests.flags.backfillNewPosition` | | Backfills on new positions (setting `windowDays` 30) | int | requests, finance | – |
| `requests.flags.backfillNoExit` | | Backfills with no exit | int | requests, finance | – |
| `requests.flags.freezeExceptions` | | Freeze exceptions | int | requests, finance | – |
| `requests.trade.ratio` | | Trade rate | num2 | requests, whatif | – |
| `requests.trade.credit` | | Trade credit | num2 | requests, team, targets | – |
| `forecast.heads.monthEnd` | | Heads at month-end | num1 | forecast | – |
| `forecast.heads.yearEnd` | fcst.heads | Year-end heads forecast | num1 | forecast, home, targets | – |
| `forecast.fte.average` | | Forecast average FTE | num1 | forecast | – |
| `forecast.starts.expected` | | Expected starts | num1 | forecast | – |
| `forecast.starts.unfilled` | | Unfilled at horizon | num1 | forecast | – |
| `forecast.exits.rate` | | Monthly attrition rate | pct2 | forecast | – |
| `forecast.exits.known` | | Known exits | int | forecast | – |
| `forecast.exits.modeled` | | Modeled exits | num2 | forecast | – |
| `forecast.backfills.modeled` | | Modeled backfills | num2 | forecast | – |
| `forecast.cost.fullYear` | fcst.cost | Full-year cost forecast | money | forecast, home, targets | G |
| `forecast.cost.exitRunRate` | fin.exitRunRate | Exit run rate | money | forecast, targets, home | G |
| `forecast.accuracy.cost` | fin.forecastAccuracy | Forecast accuracy (cost) | pct | forecast, finance | G |
| `forecast.accuracy.heads` | | Forecast accuracy (heads) | pct | forecast | – |
| `forecast.variance.heads` | | Heads variance | num1 | forecast, home | – |
| `forecast.variance.fte` | | FTE variance | num1 | forecast | – |
| `forecast.variance.cost` | fin.variance | Cost variance | money | forecast, home | G, D |
| `forecast.bridge.step` | fin.bridge | Bridge step | money | forecast, home | G, D |
| `forecast.fx.effect` | fin.fxEffect | FX effect | money | forecast, home, finance | G, D |
| `targets.target.heads` | | Target heads | int | targets, home | – |
| `targets.target.cost` | | Target cost: the fiscal year's total loaded cost (sum of its months under the version's proration), not a year-end run rate | money | targets, home | input, floored for HRBP and Leader |
| `targets.asks.heads` | tgt.asks | Asks | int | targets, home | – |
| `targets.asks.cost` | | Asks cost (pending requests in-year at band estimate) | money | targets | G (adds B) |
| `targets.gap.heads` | tgt.gap | Gap | int | targets, home, requests | – |
| `targets.gap.cost` | | Cost gap | money | targets, home | G, D |
| `targets.subOrg.unallocated` | | Unallocated | int | targets, home | cost part input |
| `targets.tree.costCenter` | | Tree by cost center | int | targets | cost part G |
| `targets.trades.heads` | | Heads from trades | int | targets | – |
| `whatif.delta.heads` | | Heads change | num1 | whatif | – |
| `whatif.delta.cost` | | Cost change | money | whatif | B, D |
| `whatif.delta.gap` | | Gap change | num1 | whatif | – |
| `finance.versions.locked` | | Locked versions | int | finance | – |
| `finance.close.adjustments` | | Back-dated adjustments | int | finance | hire and exit count –; other count 5+; amount G, D; HRBP counts only |
| `finance.freeze.savings` | fin.freezeSavings | Freeze savings | money | finance, home | B |
| `finance.recon.exceptions` | recon.exceptions | Reconciliation exceptions | int | finance, home | – |
| `finance.recon.costCenterMismatch` | | Cost-center mismatches | int | finance | – |
| `finance.trade.standardHead` | | Standard head | money | finance, requests | B |
| `audit.entries.count` | | Audit entries | int | audit | – |
| `actions.items.open`, `.overdue`, `.dueSoon`, `.critical`, `actions.owners.withOpen` | | Census's Action center metrics | int | actions | – |
| `data.*` | | Census's Data room quality metrics | | data | – |
| `privacy.anonymity` | | Anonymity minimum (5, raise only) | int | rule | rule |
| `privacy.payAmounts` | | Pay amounts are opt-in | | rule | rule |
| `privacy.leaveCounts` | | Leave shows as one count of 5 or more, for the whole scope at the as-of date | | rule | rule |
| `cost.guard.minCosted` | | Minimum costed people (5, raise only) | int | rule | rule |
| `cost.guard.floorUsd` | | Rounding step for HRBP and Leader ($100,000, raise only) | money | rule | rule |
| `cost.guard.minContributors` | | Minimum contributors to a difference (5, raise only) | int | rule | rule |
| `quality.*` | | Census's data quality rules | | rule | rule |

Owners: Finance for `plan.cost.*`, `forecast.*`, `targets.*`, `finance.*`; HR business partners for
`team.*`, `plan.heads.*`, `plan.hires.*`, `plan.openings.*`, `requests.*`; People analytics for rules. A
metric's `views` also gate it per mode (`decide(mode, 'metric:<id>')` shows it when any of its views is
shown), and each mode's policy hides metrics on top of that:

- **Manager** hides every G, B and D metric by prefix (`plan.cost.`, `forecast.cost.`,
  `forecast.variance.cost`, `forecast.bridge.`, `forecast.fx.`, `forecast.accuracy.cost`,
  `targets.target.cost`, `targets.asks.cost`, `targets.gap.cost`, `whatif.`, `finance.`,
  `requests.chain.`).
- **Manager and Finance** hide `plan.leave.`.
- **HRBP and Leader** (rounded modes) show cost only for periods `fy`, `ytd` and `qtd` (7.3b) and no
  monthly cost (`cost:monthly`). Through `cost:component` (8.3) they also hide `plan.cost.component` and
  every component column (base, bonus, burden, benefits, one-time), `plan.cost.loadedInclSbc`,
  `forecast.cost.exitRunRate` and `finance.freeze.savings` (the openings held still show,
  `plan.openings.frozen`).

Hiding a metric changes only what is drawn: figures, the glossary, help search and Settings > Formulas.
Engines still read its settings through `ctx.metrics` in every mode, so `chainFor` and the Manager chain
preview ("over the leader threshold") work without printing the amount.

Tests: one lists every G, B and D metric and asserts it is hidden in Manager mode wherever it is drawn,
the glossary and Settings > Formulas included. A second asserts that the metrics hidden above for rounded
modes are hidden in HRBP and Leader modes wherever they are drawn, exports included; that no component
metric or column appears in either rounded mode; and that every other G, B or D figure drawn in those modes is on 7.3's rounded-mode allow-list.

---

## 13. Sample company and the nine stories

### 13.1 Shape (Census's Northgate Semiconductor, generated fresh)

Deterministic: Census's `prng.ts` (mulberry32, `rngFor(stream)` = seed XOR FNV-1a of the stream name) with
a new frozen seed, one named stream per module, new modules appended last so a calibrated story never
moves. Regenerated on every load, never stored. `generateSample()` is synchronous and runs under 1,500 ms
(perf test). It computes the Budget and Q1 Reforecast lock hashes with `sha256()` (`src/lib/sha256.ts`),
so `bestCostMs(() => generateSample())` times the whole generation, hashing included.

- **Company**: Northgate Semiconductor, fabless chips. As-of **30 Sep 2026**. Fiscal year April to March
  (FY27 = 1 Apr 2026 to 31 Mar 2027).
- **Six units** (employees in Filled seats at 30 Sep): Silicon Engineering 556, Systems & Software (S&S)
  337, Operations 170, Go-to-Market 184, Corporate 196, Executive Office 7. Total **1,450**.
- **22 departments** with Census's codes and site mixes (Architecture 1110 … Executive Office 1010).
- **13 sites, 8 countries, 8 currencies, 8 legal entities** (one per country: Northgate Semiconductor
  Inc., … Canada Ltd., GmbH, Israel Ltd., India Pvt. Ltd., Taiwan Co., Ltd., (Shanghai) Co., Ltd.,
  Vietnam Co., Ltd.).
- **92 cost centers**, `<department code>-<site code>` (e.g. `1130-BLR`), derived from the generated
  positions and asserted.
- **Levels** P1 to P6, M1, M2, E1 to E3. Directors (M2) sit inside one department each, so departments
  are unions of cost atoms.
- **Positions: 1,650** in FY27 Working at 30 Sep: **1,450 Filled, 100 Open, 60 Planned, 15 On hold, 25
  Eliminated**. Approved heads 1,610. Plus 6 employees **not in plan** (story 7), about 60 contractors and
  20 interns in `workers` with no Employee seat (0 heads, not costed). Actual heads at 30 Sep: 1,456.
  Open and Planned seats by unit are asserted in `sample.test.ts`; Corporate's are fixed by story 4.
- Each position's imported `status` matches its assignments at 30 Sep 2026 (6.5), so reconciliation
  finds only story 7's 9 exceptions.
- 20 part-timers (Munich 8, Haifa 5, Toronto 4, San Jose 3; 0.5, 0.6, 0.8 FTE); about 20 on leave, 4 of
  them unpaid.
- Effective-dated history from 1 Apr 2025, so the engine can compute any version "as of" its lock date.
- **Story orgs match the Budget except for their planted rows.** In Go-to-Market, Silicon Engineering and
  the Munich and Haifa sites, actual heads at 30 Sep 2026 match FY27 Budget plan heads at Sep month-end
  position by position, except story 1's 8 early starts (an actual head with no Budget plan head; none in
  Munich or Haifa) and story 2's 10 late Bengaluru seats (a Budget plan head with no actual head). The
  generator keeps this by:
  - (a) backfilling every exit in these orgs with a last day from 20 Mar 2026 (the Budget lock) to 29 Sep
    2026 into the same position, starting on or before 30 Sep 2026, with no internal move in that window
    emptying a seat in these orgs. Exits that stay unbackfilled go only to other units and sites, and
    never leave a Corporate seat Open (story 4);
  - (b) starting by 30 Sep 2026 every Budget opening in these orgs planned to start on or before that
    date, except story 2's 10 seats;
  - (c) filling no position in these orgs that was created after 20 Mar 2026.

### 13.2 Assumptions and versions

- **Bands** (level × zone × FY, local): San Jose midpoints P1 105k, P2 130k, P3 165k, P4 195k, P5 235k,
  P6 280k, M1 225k, M2 285k, E1 350k, E2 420k, E3 520k (USD); local = Math.round(SJ × zone ÷ plan rate ÷
  unit) × unit (half up, the rule in Census's `sample/comp.ts`), where unit is 1,000 for USD, CAD, EUR,
  ILS and CNY, 10,000 for INR and TWD, and 1,000,000 for VND.
  Zones: San Jose 1, Seattle 0.97, Boulder 0.90, Austin 0.90, Raleigh 0.88, Toronto 0.72, Vancouver 0.72,
  **Munich 0.61** (so P4 Munich FY27 = **€110,000**, the spec's example), Haifa 0.70, Bengaluru 0.26,
  Hsinchu 0.42, Shanghai 0.38, Ho Chi Minh City 0.20. FY28 bands = FY27 local × 1.03, rounded the same
  way. Pins (`sample.test.ts`): P4 Munich FY27 = €110,000; P3 Bengaluru FY27 = ₹3,580,000 (3,575,000 is
  an exact .5 tie and rounds up; never use a half-even or `toFixed` helper); P5 San Jose = $235,000.
- **Loads**: target bonus P1 5%, P2 8%, P3 10%, **P4 10%**, P5 12%, P6 15%, M1 12%, M2 18%, E1 25%, E2 35%,
  E3 50%; funding 100%. Burden: **Germany 21% capped €90,600** (spec), US social security 6.2% capped
  $176,100 + Medicare 1.45% + unemployment 0.6% capped $7,000, Canada 7% capped C$75,000, Israel 12.5%
  capped ₪600,000, India 12% capped ₹180,000, Taiwan 10% capped NT$1,800,000, China 30% capped ¥400,000,
  Vietnam 21.5% capped ₫46,800,000. Benefits a head: US $18,000, Canada C$6,000, **Germany €0**, Israel
  ₪0, India ₹50,000, Taiwan NT$60,000, China ¥30,000, Vietnam ₫24,000,000. Equity by level (USD, incl.
  SBC only).
- **Merit**: FY27 1 Apr 2026, 3.5%, cutoff 1 Jan 2026 (already in HRIS comp rows dated 1 Apr 2026);
  FY28 1 Apr 2027, 3.5%, cutoff 1 Jan 2027. Promotion pool 1% from 1 Oct 2026 (in every FY27 version).
- **Forecast drivers**: time to fill P1 to P3 60 days, P4 to P5 75, P6 90, M1 75, M2 105, E 150; fill
  rate 0.90 (Silicon Engineering 0.85); attrition 10% a year (Go-to-Market 14%, Silicon Engineering 8%);
  backfill 90% after 2 months; vacancy factor 3% (plan versions).
- **FX** (USD per 1 local): plan EUR **1.08**, ILS **0.27**, INR 0.012, TWD 0.031, CNY 0.14, VND 0.000039,
  CAD 0.73. Actual Apr to Sep 2026: EUR 1.09, 1.10, 1.11, 1.12, 1.13, 1.14; ILS 0.272, 0.275, 0.278,
  0.281, 0.284, 0.287. Forecast Oct 2026 onward: EUR **1.15**, ILS **0.29**. Every other currency is flat
  at its plan rate in all three sets, so FX moves only Munich and Haifa.
- **Versions**: FY27 Budget (locked 20 Mar 2026, daily proration), FY27 Q1 Reforecast (locked 15 Jul
  2026, daily, stores its forecast; the plan of record), FY27 Working (April to September closed), FY28
  Plan Working (grid Apr 2027 to Sep 2028, an open cycle). Locked lines are computed by the same engine
  "as of" the lock date at generation time, then hashed with `sha256()`. The only cycle record is FY28's
  (Open for asks); FY27 has none, so the locked-cycle clause of out of plan (10.2) applies to no sample
  request.
- **Targets**: FY27 per unit = Budget heads and cost at FY end; FY28 per unit, with Silicon Engineering's
  set for story 6. **S&S headroom** (story 9): before the Q1 Reforecast lock, the generator eliminates S&S
  Budget seats (Planned, planned to start after 31 Oct 2026, none in Munich or Haifa) until S&S's FY27
  asks at 31 Mar 2027, without the trade, are exactly 8 heads under its target, counting story 3's new
  positions and every other S&S seat added since the Budget lock. S&S has no FY27 sub-org target, so the
  unit's gap decides out of plan. The README hand-computes the S&S gap in heads and cost.
- **Standard head**: computed from the FY27 Budget with "Compute from Budget" and stored; the README
  states it.

### 13.3 Personas (one per mode, plus the two leak-test managers)

| Persona | Mode | Who | Why |
|---|---|---|---|
| HR admin | HR admin | the HRIS lead in Corporate > People | default mode |
| Silicon Engineering HRBP | HRBP | the unit's HRBP | stories 2, 6 |
| SVP Silicon Engineering | Leader | an E2 | default leader; sub-orgs are VPs and directors |
| also: the CFO (company scope) and a Design Verification director (cost for the whole tree, heads by sub-org) | Leader | | atom rules |
| FP&A lead | Finance | reports to the CFO | |
| Manager A | Manager | a Sales manager in Go-to-Market with 7 reports, an Open seat (target start after 30 Sep 2026), a Planned seat (the planted Munich P4, 13.4) and a pending New role | default manager |
| Manager B | Manager | a Quality & Reliability manager with **3 Filled + 2 Open** seats | leak tests |
| Manager C | Manager | a Supply Chain manager whose **own seat is in a confidential Elimination** (raised by their manager, In review at the HRBP step, effective 31 Dec 2026) | leak tests |

The README names them once the generator has run.

### 13.4 The nine stories (in `sample/README.md` with hand calculations and in `sample.test.ts` with exact asserts)

| # | Story | Exact numbers the test asserts |
|---|---|---|
| 1 | Go-to-Market hired ahead of plan: Budget planned 8 of its openings to start between October and March; they started by September. | GTM actual heads at 30 Sep − Budget plan heads at Sep month-end = **+8**; GTM loaded cost YTD actual > Budget YTD and full-year forecast > Budget (both asserted with their values); GTM `plan.hires.ytd` − `plan.hires.planned` against the Budget at 30 Sep equals the README's value. Seats added after the Budget lock and still unfilled at 30 Sep (such as the planted Munich P4) count on neither side of the heads delta. |
| 2 | Silicon Engineering's Bengaluru seats are late (5 in 1130-BLR, 3 in 1140-BLR, 2 in 1160-BLR still Open past target start) but 6 Hsinchu offers beat midpoint (25 to 30% above, with sign-on, relocation and agency fees). | SE actual heads at 30 Sep − Budget plan heads = **−10**; SE full-year cost forecast − Budget > 0 (value asserted). |
| 3 | 4 Systems & Software Backfill requests point at positions created within 30 days of a known exit in the same org. | `requests.flags.backfillNewPosition` in S&S = **4**, and no other unit has one. |
| 4 | A freeze on Corporate from 1 Aug 2026 (no backfills). At 30 Sep Corporate's only unstarted seats are 3 Open seats with reqs in Interviewing (2 in IT 1540, 1 in Facilities 1550) and 1 Open seat with an accepted offer, which is honored. That offer has a non-zero sign-on bonus and agency fee, so the positions leak test has a single-offer case. The generator puts no other Open, Planned or On hold seat in Corporate, and no Corporate exit from 1 Aug 2026 leaves a seat Open. The other 96 Open seats and all 60 Planned seats are in the other five units. | `plan.openings.frozen` = **3**. Corporate Open + Planned seats at 30 Sep = **4** (asserted, so a generator change cannot move the count unseen). The accepted offer is not counted and starts in the forecast. |
| 5 | EUR and ILS rise against plan: Munich and Haifa are over on cost with heads flat. | Munich and Haifa actual heads at 30 Sep = Budget plan heads; seats added after the Budget lock and still unfilled at 30 Sep (such as the planted Munich P4) count on neither side. Their full-year cost variance against Budget is > 0, and their FX effect equals the README's hand calculation to the cent (Σ actual local × (actual − plan) for Apr to Sep + Σ forecast local × (1.15 − 1.08) for EUR or (0.29 − 0.27) for ILS for Oct to Mar). Every other site's FX effect is 0. The hand calculation covers the whole site. Every MUC and HFA cost center stays a shown Finance row (5 or more costed people, never joined into its unit's Other), so Finance's Germany and Israel rows equal it (asserted). |
| 6 | Silicon Engineering's FY28 target is FY27 Working approved heads at 31 Mar 2027 + 40; its asks add 58. | Gap = **−18**; the cut line on the Cycle tab falls after the 40th ranked head. Silicon Engineering has no other pending request with a non-zero head effect by 31 Mar 2028: the three planted transfers, the level and location change requests and Manager C's elimination are all outside it. |
| 7 | 6 people not in the plan and 3 cost-center mismatches, all outside Go-to-Market, Silicon Engineering, Munich and Haifa. | `finance.recon.exceptions` = **9** (6 + 3), with no other exception kind in the sample. |
| 8 | Cost center `1550-HSZ` (Facilities, Hsinchu) has 3 costed people. | Every cost figure for it reads "—" or folds into Other in every mode without the switch; HR admin with the switch sees it. No difference of two Finance figures shown at the same as-of date (rows, filtered totals, control totals, long CSV rows) covers 1 to 4 costed people: Corporate's Taiwan country, legal-entity and TWD currency rows are sums of Corporate's shown Hsinchu cost centers, so subtracting those leaves 0 people. `costUnions.slow.test.ts` checks this on the sample and puts 1550-HSZ's 3 people in a class of 5 or more. |
| 9 | A pending Systems & Software trade: 1 Planned P5 San Jose for P3 Bengaluru seats, waiting on the leader. | 6 seats (band estimates: P5 San Jose $295,976.60, P3 Bengaluru ₹4,009,600 = $48,115.20, band ratio 6.1514; the quote's bp ratio is about 6.15, and its exact value depends on the sample's S, stated in the README), heads +5, credit as computed in the README, chain manager, HRBP, leader (get band estimate exactly $288,691.20, over $250,000). Before the trade, S&S's FY27 gap at 31 Mar 2027 is at least +5 heads and at least the trade's net in-year cost at band estimate (both values asserted, on the rounded asks cost the chain uses), so after it S&S is still in plan and there is no Finance step. Negative control: setting S&S's target to its asks makes the chain manager, HRBP, leader, Finance (out of plan). Stories 1 to 8 are unchanged by it. |

For stories 1, 2 and 5, `sample.test.ts` also lists the per-position difference between actual heads at
30 Sep and Budget plan heads at Sep month-end in each org. It asserts that the nonzero entries are exactly
the planted rows (8 early starts in Go-to-Market; 5 + 3 + 2 late seats in Silicon Engineering's Bengaluru
cost centers; none in Munich or Haifa) and that no not-in-plan employee falls in these orgs.

Also planted: the Munich P4 Planned seat in Go-to-Market (Sales; Manager A's Planned seat), approved 10 Jun
2026 after the Budget lock, with planned start 16 Sep 2026 and no req or hire at 30 Sep. It is not in the
FY27 Budget. It is Planned in the FY27 Q1 Reforecast and FY27 Working, and its Q1 Reforecast September line
reproduces Fixture C1 ($6,301.17; FY27 €75,847.42 = $81,915.21), asserted in `sample.test.ts`. It adds no
actual head at 30 Sep and no Budget plan head, so stories 1 (+8) and 5 (Munich actual = Budget plan heads)
are unaffected. Its forecast start is max(16 Sep 2026, 30 Sep 2026 + 75 days) = 14 Dec 2026 at
probability 0.9; it appears in the bridge's position-changes step, and its forecast local cost is in
Munich's FX hand calculation in the README. Also: 3 transfers (a position move, an internal move, a
cross-unit move awaiting the second HRBP); level and location change requests; 2 freeze exception requests
in Corporate (New roles, so they add no seat unless approved); Manager C's elimination; the FY28 cycle in
"Open for asks" (asks due 16 Oct 2026) with 4 Silicon Engineering managers not yet submitted.

### 13.5 Messy raw files (Census's `raw/` pattern)

Raw extracts are built in TypeScript (never committed as files) with vendor headers, odd spellings and
planted problems; importing each yields exactly the planted rows (test). Starting tiers: positions gold
(Finance and HRIS certified), workers gold (certified headcount 1,456), comp gold (Total rewards), assumptions
gold, reqs silver (ATS export: "Job Req ID", "Closed - Filled", M/D/YYYY, "IC4", "Bangalore, India",
"NT$"), targets silver (planning-tool export), freezes silver, requests bronze (one messy spreadsheet in the
Data room). The stories must hold on clean and messy data alike.

Separately, `sample/raw` (testkit) builds 6 kind 'requests' workspace files from 6 sample managers through
the real `export.requests` path in Manager mode; two requests are changed on both sides. Requests > Queue >
Import requests over them shows "Merged 14 requests from 6 files, 2 conflicts". `workspace/mergeRequests.test.ts`
asserts the counts, that the later revision wins (`revisedAt`, else `updatedAt`, compared as times, R77),
and that rows changed on both sides are listed as conflicts.

---

## 14. Exports, workspace files, help and copy

### 14.1 Exports (`src/lib/export/`, Census's modules plus four)

Outputs: figure CSV, Excel and copy; whole-view workbook; 16:9 deck (pptxgenjs); the long CSV; the FP&A
load file (Finance > Export); workspace files (5.5: Shareable, Full, Requests and Export for a manager).
ExcelJS, pptxgenjs and SheetJS stay behind `import()` (the lazy test is extended to fail on any static
value import of `exceljs`, `pptxgenjs`, `xlsx` or the export barrel). App code may import single modules
such as `@/lib/export/csv` or `@/lib/export/columns` statically, as in Census; those modules load the
libraries themselves through `import()`.

Census's modules (types, columns, clipboard, csv, image, names, withheld, xlsx, modeMeta, definitions,
download, view, index) are ported in M2 with renames only, by the UX port builder, which owns `charts/`
and `lib/export/` together because each imports the other's types. M4 adds the four new modules
(`exportHeader`, `suppressedFlag`, `longCsv`, `controlTotals`), the deck slide and the load file.

1. **Header on every output** (`PlanHeader` added to Census's `ExportMeta`, one `headerLines(meta)` source):
   version and state, lock hash (`sha256-…` or "Working, not locked"), comparison, as-of, proration, rate
   set ("Plan rates (EUR 1.08, ILS 0.27)" or "Actual for closed months, forecast for open"), cost
   definition ("Loaded cost: base + bonus + burden + benefits + one-time, USD", plus "incl. SBC" where it
   applies), mode line ("Made in HRBP mode for Silicon Engineering."), filters, rounding ("Exact for
   groups of 5 or more", "Rounded down to $0.1M per team", or "None: HR admin with pay amounts shown").
   Where: workbook Summary (all lines), each sheet's title block (a compact line), CSV preamble (all
   lines), a deck slide "About these numbers" after the title slide, and image footers (version and as-of).
2. **Numeric amounts with a `Suppressed` flag column**: any table with an amount column gets `Suppressed`
   (Yes or blank) and `Why` columns (`withSuppressedFlag`). A suppressed amount cell is empty, never 0 and
   never words; "under $0.1M" is a reason, not a cell value. Amounts are numbers, never text, so negative
   variances are not formula-guarded.
3. **Long CSV** (`longCsv.ts`): one row per period × org × cost center × account × component × currency,
   with `amountLocal`, `rate`, `amountUsd`, `heads`, `fte`, `suppressed`, `suppressedReason`, and the header
   facts repeated as columns (`version`, `lockHash`, `asOf`, `proration`, `rateSet`) so the file stands
   alone. One currency per row; local amounts are never summed across currencies. The rows come from the
   same guarded model as the screen, per mode:
   - **Finance and HR admin (switch off)**: `org` is the business unit. Each cost center belongs to one
     unit, so every row's group is a whole cost center. Cost centers under the minimum fold into their
     unit's Other (k) by the unit's one Finance fold (`financeFold`, 7.4, sized on every month of the grid), the same fold for every period,
     account, component and currency, never by per-row suppression alone. The Other row is not split by
     currency: it carries `currency` USD with `amountLocal` and `rate` blank. Under a country,
     legal-entity or currency filter the file holds only the shown cost centers with that value, no Other
     row, and the note "n people in cost centers under 5 are left out". A component amount needs 5 or
     more contributing positions in its cell (7.2 rule 1); a cell where any component fails is one row
     with `component` `loaded`, `account` blank and `suppressedReason` "Components hidden (fewer than 5
     in a component)".
   - **HR admin with the switch on**: no folds and no suppression.
   - **HRBP and Leader (rounded)**: rows that carry an amount have `period` QTD, YTD or FY only (QTD and
     YTD end at the last closed month-end). Their `org` is a union of atoms that the screen shows as a
     cost row (7.3a). `costCenter` and `account` are blank, `component` is `loaded`, `currency` is USD,
     `amountLocal` and `rate` are blank, and `amountUsd` is the screen's `sumRounded` value. Atoms under
     5 are left out, with the screen's note. All other rows (month × org × cost center, and orgs that are
     not unions of atoms) carry `heads` and `fte` only: the amount cells are empty, `suppressed` is Yes
     and `suppressedReason` reads "Cost shows for whole departments and teams at QTD, YTD and full year
     in this mode."
   - **Manager**: heads and FTE rows only, with no amount columns.

   `longCsv.test.ts`: in HRBP and Leader mode, no row with a non-empty amount has a month period, a
   component other than `loaded`, a cost center, a currency other than USD, a non-empty `amountLocal`,
   or an org that `isUnionOfAtoms` rejects. In Finance mode, a 20-person cost center with one October
   hire carrying a sign-on and relocation has one October `loaded` row, and no row equals the sign-on
   plus relocation.
4. **Control totals** (`controlTotals.ts`): Σ heads, Σ FTE, Σ USD per component and the count of
   suppressed cells, computed from the exported rows. In HRBP and Leader exports, control totals are
   Σ heads, Σ FTE and the screen's rounded loaded total (`sumRounded` over atoms, never a plain sum of
   rounded rows); there are no per-component totals. In Manager exports they are Σ heads and Σ FTE only.
   A test matches them to the screen model for every home, Plan Overview, Forecast Variance and Bridge,
   in every mode. Totals use the same folded groups as the screen, and a test asserts no control total
   or screen total minus the shown rows equals a hidden group of 1 to 4 or a hidden component amount.
5. **Money flags**: `pay: true` (one person's amount, HR admin with the switch), `cost: true` (a guarded
   group total), and new `band: true` (band estimates, hidden in Manager mode). `visibleColumns` drops
   them per mode in tables, CSV, clipboard, Excel and slides. Census's CSV bug (cost columns dropped
   because `showCost` was not passed) is fixed and tested.
6. **FP&A load file**: the long CSV at Finance's rules (exact for 5+, the unit's one fold, a component
   split only where every component has 5 or more contributing positions, suppressed flags). The
   unsuppressed load file only from HR admin with the switch on; its first header line says "Contains
   individual pay".
7. File names: `headcount-planner-<view>-<name>-<as-of>`; deck kicker "HEADCOUNT PLANNER · PLANNING";
   workbook creator and deck author "Headcount Planner".
8. **Free text in outputs**: comments in any export or file pass `commentVisible`. In Manager mode, and
   in an Export for a manager file, every change reason, send-back or reject reason, exception reason and
   audit comment also passes `managerText` (8.4 rule 5), so an amount typed into text, or arriving through
   Import requests, Merge or an opened file, never reaches a Manager output.

### 14.2 Help (`src/help/`, Census's data model and tests)

- Articles and tours are TypeScript data; conditions are written against surfaces, not mode names, so
  a mode never reads about something it hides (Census's `NAMES` test, rebuilt for HCP's pages, tabs and
  switches).
- `src/help/ui/LearnMore.tsx` exists from M2 as a stub with Census's exports (`LearnMoreLink` renders
  nothing), because the ported charts import it; M4 fills it with the help store, articles and tours.
- Start here: `what-headcount-planner-is`, `moving-around` (filters, version and comparison pickers),
  `reading-a-number` (heads, FTE, loaded cost, "—", "Other (k)", calculation cards), `clicking-down`,
  `exporting`, `modes` (modes and Acting as; ends with `NOT_SECURITY_LONG`).
- Each view: `view-home` (one section per home), `view-team`, `view-plan`, `view-requests`,
  `view-forecast`, `view-targets`, `view-whatif`, `view-finance`, `view-data`, `view-actions`,
  `view-audit`.
- Your data: `data-loading` (names all eight datasets), `data-mapping`, `data-tiers`, `data-certify`,
  `data-quality`, `data-wrong`, `data-workspace-file` (Shareable, Full, Requests and Export for a
  manager; an opened shared file is shown through your current mode, never the mode it was made in; its
  JSON is readable, so send each person a file made for them; checksums catch damage),
  `data-versions` (Budget, plan of record, Working, locks, closes).
- Definitions: `definitions-how`, `glossary` (generated from the catalog), `cost-definition` (loaded
  cost, band estimate, proration, FX), `trading-heads`.
- Privacy and trust: `privacy-browser` (including the shared origin), **`about-server`** ("Why there is
  no sign-in": the app runs in this browser; modes, Acting as and approvals change what it shows, not who
  can see the data; real access control needs a server with sign-in, planned for Phase 3; checksums do
  not prove who made a file), `privacy-pay`, `privacy-small-groups` (5+, Other (k), "—", $0.1M per team,
  differences, component splits that need 5+ in each component, Finance's country, legal-entity and
  currency rows as sums of shown cost centers), `privacy-leave`, `privacy-sample`.
- Help and support: `shortcuts`, `report-problem` (names the mode and unit, never a person, position or
  request ID), `troubleshooting` (including "Read only: open in another tab"), `faq`, `whats-new`.
- Tours: `getting-started`, `home-start` (per-mode wording on each home's hero), one `view-<key>` tour of
  4 to 6 steps per view (at least 3 left in every mode, using per-mode wording rather than skipped
  steps), `requests-start` (Manager: draft, submit, track), `own-data` (HR admin). The `view-whatif`
  tour walks the Levers tab (the lever list, then the result strip of heads, cost and gap), not an
  Overview.
- `about-server` is shown in every mode and is the only article exempt from the banned-words scan; the
  exemption list is pinned to exactly `['about-server']`, and a test asserts the article does use a banned
  word (so the exemption is not stale) and that no tour is exempt.

### 14.3 Copy rules (tests scan source and models)

- Sentence case; no em dash between words ("—" only as the missing-value placeholder); en dashes allowed
  in ranges; no "!"; no emoji; no nagging verbs (chase, nag, ping, hound, remind, unblock); plain counts.
- `NOT_SECURITY_SHORT`: "Modes, Acting as and approvals change what Headcount Planner shows, not who can
  see the data." `NOT_SECURITY_LONG`: "Modes and Acting as shape Headcount Planner for how you use it.
  They are not security: anyone using it can switch modes or pick who they act as, and every mode reads
  the same data in this browser. Share Headcount Planner and its files only with people who may see all
  of it."
- `BANNED_MODE_WORDS`: access, permission, restricted, secure, locked down, authorized, role-based access
  (scanned in every policy reason, mode line, export line, pick prompt and help sentence about modes,
  except `about-server`). Domain words avoid them too: "approved heads" (never "authorized headcount"),
  "equity (SBC)" (never "restricted stock"), "Hiring is frozen" (never "restricted").
- `BANNED_HASH_WORDS`: tamper-proof, tamperproof, tamper proof (everywhere, including README).
- Finance's export line: "Cost amounts cover groups of 5 or more costed people. Individual pay is left
  out." HRBP and Leader: "Cost amounts are rounded down to $0.1M per team, and groups under 5 are left
  out." Manager: "Made in Manager mode for <name>'s team. No amounts are included." An Export for a
  manager file carries the Manager line for the chosen manager.

---

## 15. Readings of the spec, changes to it, accepted risks

### 15.1 Readings (where the spec allowed more than one meaning)

| # | Topic | Reading taken |
|---|---|---|
| R1 | Approved heads at a date | Filled + Open + Planned on the date with a start on or before the end of that date's fiscal year (an FY28 seat approved now is not an FY27 head). |
| R2 | Manager allocation, left to fill, left to request | Spec formula in heads and band cost. Plan-of-record seats are priced at their plan-of-record level, location and FTE, and approved adds (trade get seats included) at their approved values; On hold and Eliminated seats are out; approved Level, Location and FTE changes and HRBP Working edits do not change it (6.9). Left to fill = Open + Planned in the allocation; left to request = Planned seats with no req and no pending Start recruiting request. |
| R3 | "Over: either above allocation" | Heads or band cost, staffed against the allocation (R32); "within 2%" applies to band cost only, so a fully staffed team reads At risk; heads use the crossing test. Standard heads are a note on Allocation and never set Over or At risk. |
| R2b | Where the allocation reads approved changes | From the position rows the approvals wrote, never from request rows: an add is a seat whose first row carries `sourceRequestId` and that has no line in the plan of record (priced at that first row, skipped if it starts after FY end); an elimination is an approval's Eliminated or Traded row (blank reason reads Eliminated; Transferred does not) that ends an allocation seat by FY end. An add approved on the lock day is in the plan of record; a seat reopened after a pre-lock elimination is an add. Values are byte-identical to the request-based reading on the sample (M2 close-out, B3). |
| R4 | Out of plan (adds the leader step; Finance too for new roles and trades) | Approving would push asks over the target, in heads or in the guarded asks cost (C19), of the nearest org at or above the request's org that has a target, up to and including its unit; with no such target the request is out of plan. A request raised outside an open cycle is also out of plan while a cycle record for its fiscal year is Locked (a version lock, Budget included, is not a cycle lock; no sample request meets this). |
| R5 | "Asks to start recruiting" and "proposes starts" | Two light request types, Start recruiting and Start date, each with one step, the unit HRBP (whatever the seat's level, band estimate or plan status), ending in the HRBP's audited Working edit. |
| R6 | Expired | Only Draft and Sent back expire after 60 idle days; cycle asks never expire while their cycle is open. |
| R7 | Cycle stages and per-request steps | Cycle asks take the submitter's manager step; the HRBP, Leader and Finance stages replace the per-request steps. Below the cut line at lock = Rejected, reason "Below the cut line". |
| R8 | Who runs the cycle | Finance opens, dates, locks or returns it; HRBPs finish HRBP review per unit; leaders finish Leader review per org. |
| R9 | Backfill flags | `backfill-new-position` (named seat created within 30 days of a known exit in the same org, with no exit itself) and `backfill-no-exit` (an existing seat with no exit). Story 3 counts the first only. |
| R10 | Freeze "holds" openings | A derived hold, not a status change; frozen openings stay approved heads and stay in the gap, but the forecast does not start them while the freeze lasts. |
| R11 | What if and Audit placement | What if is a folder-tab view with one tab, Levers (C29); Audit is a masthead page (Census has no Audit view; HCP builds it). |
| R12 | Modes | Five modes; no Developer mode in Phase 1 (its Security center is Phase 2). Dev-only helpers sit behind `import.meta.env.DEV`. |
| R13 | HR admin home | The Data room page; Home (role homes) is hidden in HR admin with a reason. |
| R14 | Metric ids `fin.exitRunRate`, `fin.forecastAccuracy` | `forecast.cost.exitRunRate`, `forecast.accuracy.cost` (Census's catalog rule: the prefix is the home view). Aliases kept in section 12. |
| R15 | Levels "P4", "Director+" | Census's L1 to L6 become P1 to P6; Director+ = M2 and above, or marked in Lists. |
| R16 | Leader home KPI count | Five: the spec's four plus Unallocated. |
| R17 | Import requests "HRBP and above" | HRBP, Leader (only requests that touch their org or wait on them; CEO, CFO and CHRO merge all), Finance, HR admin. Files come from "Export requests" (every mode) or are Shareable files; only `body.plan.requests` is read. |
| R18 | HRBP and assumptions | Bands, FX, loads and attrition read only; the unit's time to fill, fill rate, backfill % and lag editable in Working, audited. Attrition is Finance's (C22). |
| R19 | Last day | Inclusive: a person is a head on their last day (Census's `isActiveAt` is not; fixture H2 pins it). |
| R20 | Half-month "both in one month 0.5" | Literal, with a fixture. |
| R21 | "Bonus 10%" in the Munich example | Target 10% × funding 100%; the fixture stores both. |
| R22 | Merit date | FY27 1 Apr 2026 (consistent with "a 1 Apr 2026 row gets no FY27 merit"); the Munich example is untouched by merit. |
| R23 | Manager's tree | Strictly below the manager's own seat. Nothing about their own seat reaches them (Manager C). |
| R24 | Approvers see band cost | Not in Manager mode: a manager approving as a manager's manager sees heads, allocation and status after approval. |
| R25 | Versions per year | One Working per fiscal year (lock copies it; reopen retires and replaces it, C28); plan of record per fiscal year. A year with no locked version (FY28 today) compares with its target in every mode, Finance included; variance, bridge, freeze savings and monthly "vs" figures need a version and show an empty state until it locks (9.2). |
| R26 | Plan lines follow a moved position | Locked lines store `positionId`; the org is joined at read time; the hash still verifies. |
| R27 | Story 7 | Exactly two exception kinds planted (6 not in plan, 3 cost-center mismatches); stories 3 and 4 are request and freeze items, not reconciliation exceptions. |
| R28 | Rounded modes' cost detail | Loaded cost only, for periods `fy`, `ytd` and `qtd` (C21); components, incl. SBC, the exit run rate and monthly cost are Finance's and HR admin's. |
| R29 | Hires YTD vs plan | Actual (`plan.hires.ytd`) = employees whose `hireDate` falls from the fiscal year's start to the last closed month-end; internal moves and transfers are not hires. Plan (`plan.hires.planned`) = comparison-version seats whose first head starts in the same window, excluding seats Filled at the fiscal year's start and seats that receive a transfer. |
| R30 | "or `offerBase` once accepted" | `offerBase` replaces midpoint in midpoint × FTE. It is an FTE-equivalent rate like `baseSalary`, so the bridge's pay-rate step compares rates and FTE stays in mix (fixture C2b). |
| R31 | "Status derives from assignments" | In every computed line, a seat with an active Employee assignment is Filled, and a seat whose row says Filled is Open from the day after the last assignment's last day. The imported status counts only for Planned, On hold and Eliminated, and in reconciliation (fixtures H3, H4). |
| R32 | Manager budget status | Staffed (people in the tree's Filled seats, known starts by each month-end and not-in-plan reports, at their seats' current Working level, location and FTE) against the allocation (R2); pending requests add their head effect and band cost from their start, for the crossing test only. The first that applies shows: Over (staffed heads or band cost above the allocation at the as-of month-end), At risk by crossing (staffed, or staffed + pending, above it at any month-end to FY end), At risk within 2% (staffed band cost at least 98% of the allocation's), On track. "Within 2%" is read literally, so a fully staffed team reads At risk (fixture A1). |
| R33 | Seats with no planned start | An Open or Planned seat with no planned start is an approved head but is not costed anywhere: not in Working lines, asks cost, a request's band effect or a trade quote's in-year effect, so a pending request's band effect always equals the change approval makes to Working (M1 fix-up). |
| R34 | An approved Elimination of a Filled seat | The Eliminated row ends the seat from endDate + 1 (no holder, head or cost) even before HRIS records the exit; the leftover HRIS assignment shows as `assignment-on-open` in reconciliation, and severance books once (M1 fix-up). |
| R35 | Finance's edit check (7.4(b)) | The straight-line check runs over each editable value's full allowed range, not only small steps, because a bend over a tiny step is far under a cent (`assumptionAffine.slow.test.ts`). |
| R36 | Start recruiting on the as-of date | Moves no amount: the seat's band cost starts from its planned start, and recruiting only changes its status and opened date (6.3, 6.7). |
| R37 | Finance edit refusals in practice | Under 7.4's rule, any department × country share of a unit's Other with 1 to 4 people blocks edits that move it. In the sample, Corporate's Other holds People × Canada (1) and People × United States (2), so US and Canada burden and benefits rates, equity by level, the vacancy factor, company and Corporate attrition and the CAD, INR and TWD forecast rates are refused in Finance mode; HR admin sets them by import. The refusal message names the reason. |
| R38 | Story 9's guarded asks cost | $57,100,000 with a gap of $2,884,668.88, after the vacancy allowance (C31) and with closed months read from the closes everywhere (C33 (e), M2 review RF-4). It read $56,200,000 before RF-4 and $57,800,000 before C31. The trade stays in plan and no stored chain changes. |
| R39 | Bridge transfers step (6.8 step 7) | Under R26 both sides join the org at read time, so no position enters or leaves a scope between the comparison and the forecast and step 7 reads 0 in every scope. The step stays as a row at 0 with the note "Moved seats carry their plan with them, so a move between orgs shows in the other steps, not here." |
| R40 | Amounts in text (8.4 rule 5, C24) | An amount is any number of 1,000 or more in any common spelling: grouped by commas, dots, spaces (incl. no-break and thin spaces) or apostrophes, Indian grouping, decimals and decimal commas, a k, m, mn, lakh, lac, crore, cr, grand, thousand or million suffix, an ISO code or symbol before or after (glued or spaced), and a sign. Manager mode shows every match as "an amount". |
| R41 | Leaving a scope (8.2) | A mode change releases the filter values the previous mode's scope pinned, and the tree and unit clamps drop any list filter that would exclude the whole new scope, so no mode opens on "0 of 7 people". This replaces the "filters still show" toast. |
| R42 | Optional fields and the quality tier | An optional field that is blank in every row, or a field that applies to no row, takes its dataset's tier; it never makes a figure "No data" (M2 browser finding B1). Each figure's lineage lists only the fields it reads (B3). |
| R43 | Short to-date windows in rounded modes | A rounded QTD or YTD that covers fewer than two closed months reads "—" with the reason, and QTD and YTD end at the last close on or before the as-of date (empty with no close), for heads-and-cost tiles and the forecast alike (M2 review RR-2, RR-3). |
| R44 | Contributors and leave | Contributor counts and lists come from leave-neutral prices (each unpaid month priced as paid at the line's own rate, from the forecast run's own inputs so people hired after the reporting date have a paid twin; cap sides fall back to every HRIS assignment); values, totals and band classification keep real prices (M2 review RR-1, C26, close-out A1 and V-1). |
| R46 | A reporting date inside an unclosed month | Only closed months are actual. When HR admin sets the reporting date after the last close's month, the months from the first unclosed month on are forecast at forecast rates, and to-date windows still end at the last close (R43). |
| R47 | The app's "today" for writes | The as-of date. Every write's business dates (submitted, updated for idle expiry, each step's entered and decided dates, comments, approval and effective dates such as `openedDate`, elimination and transfer defaults, trade, cycle, freeze, close and lock dates) are the as-of date, keeping the wall clock's time of day for order within a day; the audit entry's own `at` stays the wall clock and its Effective column shows the business date. Days in step, waiting, overdue and idle days run from those dates to the as-of date and never go negative; a stored date after the as-of date reads as the as-of date. A month closes only once the as-of date is on or after its month-end. (M3 browser findings B6, B8.) |
| R45 | How much a rounded bridge shows | With C34's one fold over kept atoms, the steps whose drivers come from a line's pay (timing, mix, pay rate, assumption rates) fold whenever any atom has 0 or 1 to 4 movers, and attrition joins Other changes until every atom's Other has 5 or more. On the sample, HRBP and Leader bridges show the band parts, FX where 5 or more moved, Transfers at 0 and Other changes. Finance keeps the step detail at unit and company level. Accepted as the price of C34; a finer rounded bridge needs a design that hides a leave inside a step without reading it. |
| R48 | Job titles at entry and in Manager mode | `createRequest`, `editRequest` and `createTrade` refuse a job title with an amount (REMOVE_AMOUNT_TEXT, 8.4 rule 5), since managers and every approver read titles; Manager mode reads every title through `managerText` (records, cards, tracker, Action center, files), and Import requests refuses a file whose merged request has an amount in its title (M3 review PV-6). |
| R49 | A seat edit's date | `editSeat` with no effective date takes the as-of date, or the seat's first row's date when the seat starts later, so an edit never writes a row before the seat exists. |
| R50 | Who processes a transfer | The from seat must be in the processing HRBP's unit and scope (OUTSIDE_UNIT_TEXT; HR admin any seat), the receiving side can be anywhere; the requester is the moving person's manager and the processing HRBP is the submitter (CH3, CH4). |
| R51 | Gap after approval | HRBP and Leader mode show a draft's gap after approval in heads with "In this mode the cost gap shows on Targets, and this request's band estimate shows beside it." (a rounded gap less an exact band effect is no whole step, 7.3 (c)); exact modes keep the figure; the cost is published once per target org (Approvals' gaps figure), never per request; a pending request's gap after approval is the gap as it stands; an org outside the mode's targets reads "<org> is outside the targets this mode shows, so its cost gap is not shown here." (review SC-21). |
| R52 | A Leader's envelope on the cycle | Ranking is limited to the leader's org; a cut line is refused when it puts more heads above it than the room the unit target, or a sub-org target the leader holds, leaves ("Within the envelope. This line puts 58 heads above it, and the target leaves room for 40.", heads only, review SP-7); approve with changes and "Move budget too?" are hidden in Leader mode (approve with changes is the HRBP step's, 10.2, and no Leader action processes a transfer; review SP-8, SP-18), which overrides 8.3's grid. |
| R53 | Opening a cycle and its dates | On Requests > Cycle for Finance and HR admin: "Open the FY28 cycle" when no cycle is under way (the year after the as-of date's, or after the latest locked cycle's), with suggested due dates 3, 5, 7 and 9 weeks out, and "Change dates" on the stage bar; with no cycle under way the tab shows the latest locked later cycle. |
| R54 | The cut line at lock (D-CYCLE) | The lock decides each unit by the line the tab shows: the stored mark, else `defaultCutAfter` over the same ranked list and room (target minus asks plus ranked heads), counted over every request in force, so every viewer but a rule-3 one reads the line the lock applies ("It counts at lock."); ranked asks are Submitted and In review, and a Sent back ask is its requester's, out of the ranking and not decided by the lock; `lockCycle` is refused while an ask waits on its manager step ("Lock the FY28 cycle once these asks have their manager's decision: n asks with m managers."); after lock the tab shows the outcome. Story 6 with no line set locks 66 asks (40 heads) approved and 21 asks (18 heads) rejected "Below the cut line" (review SC-1, SC-2, SP-1, SP-2, UI-1, UI-10, SC-20). |
| R55 | HRBP changes to a cycle ask | During HRBP review, on an ask whose manager step is approved, the unit's HRBP or HR admin may approve it with changes (the change set and its reason are audited), and the lock gives it "Approved with changes" (review SC-9, SP-6). |
| R56 | Openings target start and allocation lineage | An open req's target start wins over the seat's own start (M2's reading), so an HRBP start move on a seat with an open req does not move its Openings target start; My team's allocation tiles keep `positions.startDate` in their lineage because R2b reads it. |
| R57 | Who Import requests merges for | An HRBP merges every request the files hold (5.5 and R17 limit only Leader mode), and the summary and conflicts count only what the HRBP may see; a Leader's merge leaves out requests about the Leader's own seats (review PV-7). |
| R58 | What if's scope, year and guard | The Acting as person's scope, never narrowed by filters (the HRBP's unit, the leader's org, the company); the shown version's fiscal year and that year's Working; heads at the scope's target date, and with no target the gap change reads empty with a sentence; a freeze lever's cost change is a band figure in HRBP and Leader mode (10.6), and a non-band difference never shows in rounded modes; the headline reads the session levers of the view's own scope key. |
| R59 | What if levers and requests (10.6) | Levers act on seats and freezes; pending requests count on both sides of the result, and the trade lever stands for a Trade request (review SP-16); a receiving seat held by an approved internal move is not offered (SC-6). |
| R60 | Self-approval | An HRBP step whose approver is the requester moves to the next held seat above the requester; on the sample an HRBP's own trade goes to E10964 as its 'hrbp' step. |
| R61 | Actual months with no close (R46) | With no close the as-of month still reads HRIS; with a close, actual runs through the last close's month (`actualThroughOf`). |
| R62 | Envelope exception on a transfer | Only a Transfer without "Move budget too?" into a leader-keyed (sub-org) target that it pushes past adds the envelope exception; Move budget moves the targets at the final approval. |
| R63 | Freezes and request types | A freeze blocks a New role, and a Backfill unless the freeze allows backfills, at submit on the request's start date (else the as-of date), with the freeze's notice; a trade uses the quote's 'frozen' block; other types are not hiring and pass, and the freeze holds any opening they create (R10, review SP-9); a new freeze starts on the as-of date unless given a start. |
| R64 | Freeze exceptions in force | An approved freeze exception's seat is no frozen opening, adds nothing to freeze savings and gets a forecast start; an imported exception with no freeze ID names the freeze covering the request, its Finance step carries the reasons it surely has (a new role, a freeze exception), and one with no business reason says so (review SC-4, SC-7). |
| R65 | Cycle finishers and lock content | The units that must finish HRBP review are those with ranked asks, and the leader orgs are those units' top leader seats; the stage moves on in the same action. A lock stores Working's lines through `workingLines` (closes for closed months), plus the forecast when the year already has a Budget. |
| R66 | Cost centers in audit rows | `isPayField('costCenter')` is false: a cost center is an org field, so its changes show outside HR admin. |
| R67 | Finance's edit check (7.4) in practice | Plan and forecast months are separate series ('forecast 2026-10'); shown lines are priced (closed months from the closes); a locked `from` is priced on a Working copy of it, and a `version.create` set on the new version's own grid; movers are counted in a paid world (everyone on unpaid leave read as on paid leave), so the vacancy allowance and the forecast's cohort lines never read leave (R44, C26, review PV-4). |
| R68 | FX edits under 7.4 | One structural rule: a changed FX row for a currency and month is refused when the costed people paid in that currency that month number 1 to 4 in all or in one fold part, each row and each line source checked on its own, against the value the row replaces (the forecast rate for an actual rate in an open month, else the stored rate, else the nearest month's); outside HR admin a closed month's rates are read only; an FX row keyed to an org is refused in every mode, since no engine reads one; a Finance close refuses an actual rate written in the app that, priced as the month's forecast rate, moves 1 to 4 (review PV-1, PV-2, PV-3). |
| R69 | Splitting a target | Target costs show rounded down in Leader mode; a cost box the viewer did not touch keeps the stored cost target, a typed value is saved as typed and an emptied box removes it (review UI-2); sub-orgs stay inside the parent's business unit, so a unit's head is never a split child, and the form and the action read one list (`subOrgSeatsOf`, UI-8); sub-org labels follow the parents' rule (UI-13). |
| R70 | The Requests file and Open a shared file | Export requests holds every request whose view is 'full', whatever the scope; Open a shared file does not check locked versions against this workspace (nothing is imported) and refuses Full files; Shareable files leave What if out (its levers are session memory). |
| R71 | The Audit page outside HR admin | Import requests and workspace counts, and a close's adjustment count, read "changed"; a cycle order lists only visible requests; step chains and person fields read names (redacted as 8.4 asks) and field ids read as labels, in files too (browser B7); HR admin's check reads the stored head, so a lost tail shows ("The chain breaks at entry n.", review IN-10); an opened file drops, outside HR admin, a position entry that links to no request when a request entry or an import shares its `at` (PV-5). |
| R72 | Approvals by approver | Approvals and the "requests:approve" items list every visible request whose waiting step is the Acting as person's, whatever the mode's scope (review SC-8); Manager mode's card shows heads, the allocation after approval and the status after approval, which reprices staffed months for an approved Level or Location change on a Filled seat. |
| R73 | Expired (D-EXPIRY) | Derived at read time and never stored, through one helper (`effectiveState`) that every card, row, tracker, KPI (each request counted once), Action item, ask, gap, routing, credit and tradable-seat check reads; an expired request is not pending, so its seat and credit are free; its requester may withdraw it, and every other write refuses it, comments included (review SC-3, SP-4, M3 recheck). |
| R74 | Request IDs (D-ID) | New requests are 'R-<tag>-<n>': a 4-character base32 tag minted once per workspace, and n = 1,000 + (a SHA-256 keyed by the workspace's secret, the person and their count k) mod 24,000, taking the person's first k whose ID is not in force; the secret lives in plan state and Full files, never in Shareable or Requests files; Replace takes a new secret and Merge keeps this workspace's; sample and imported IDs keep their form, and a context with no store numbers 'R-<n>'; two copies of one ID with another requester, type or creation stamp are an ID clash, listed and never merged; a hidden request and an unknown ID get the same refusal ("This record is no longer in the plan. Reload and try again."), and Manager-mode models carry no next ID (review IN-1, SC-13). |
| R75 | Freeze IDs | New freezes are 'FRZ-<tag>-<nnn>'; on Merge a file's freeze that carries one of this workspace's IDs for another org or start keeps both, the file's under '<id>-<n>' with its exceptions, and the 'merged' entry lists the rename. |
| R76 | Imported approvals (D-MERGE) | A request that arrives Approved or Approved with changes applies its effects here through the same engine, idempotently by outcome IDs (`sourceRequestId`), dated its approval date, signed by the importer with a comment naming the approver and the file, and with the request's own 'state' entry at the same `at` (PV-5); a decision that cannot apply here is a conflict that names why (a limited importer reads "This request cannot be applied in this workspace.") and changes nothing; "Move budget too?" and "Move target too?" replay as stored (review IN-2, SP-3). |
| R77 | Merge order (5.5) | Recency is the wall-clock revision (`revisedAt`, stamped by every action; older copies fall back to `updatedAt`), not R47's business `updatedAt`; stamps are validated ISO date-times compared as times, a stamp with no zone read as UTC; the base never moves to this workspace's own copy; copies that diverged are a conflict, two file copies in one import included; a decided copy is never taken back by a later pending one; a conflict settled to the file's copy counts as merged; the preview speaks before anything merges ("Merges 14 requests from 6 files; 2 conflicts to choose") (review IN-3, IN-4, IN-7, IN-12, UI-7, UI-11, M3 recheck). |
| R78 | Full files (C35) | Integer cents apply to locked versions' line tables only (month closes stay exact, since their hash reads every digit), so a Replace can differ from the source by sub-cent rounding per line while every hash holds; over 25 MB a file is read only when its header says Full; Replace refuses a file whose audit chain, or its own audit head, does not verify (fileChainBrokenText), a locked version that fails its own lock ("This file's FY27 Budget does not match its own lock (hash differs). Nothing was imported."), and a job title or version name with an amount. |
| R79 | Remove override | An org's assumption row taken back so its value is its parent's again, under `assumptions.edit` (Finance through 7.4's rule) or, for an HRBP, the operational id for the HRBP's own unit, with one 'override removed' entry; setting the value again takes the removal back; Merge carries both sides' removals by row key (an incoming row takes a removal back) and Full files carry them. |
| R80 | The standard head at a Budget lock (11.2) | A Budget lock stores round(sum of band / sum of FTE, $1,000) over the lines it stores, the dialog passes the value it showed and a stale one is refused; Working takes it with an entry and reforecasts carry the Budget's; outside HR admin band and standard-head audit values read "changed" (review SP-13, SP-14). |
| R81 | Amounts in text, extended (R40) | Also "Mio", "Mrd", "bln" and "Tsd"; one or two letters glued to a sign (CA$, US$, A$); spelled-out amounts (number words with a size word, or "a" or "an" with a size word and a currency word); a number of 1,000 or more before "/" and a period word (yr, year, annum, pa, month, mo, wk, day, hr); and a range ("N-M", "N to M", "N and M") with an end of 1,000 or more (a plain year is not) or a size word, read as one amount; over-redacting plain ranges such as "1000-1200" is accepted; version names refuse an amount at entry and Manager mode reads them through `managerText` (review SC-14, UI-3). |
| R82 | Trades approved with changes | Approve with changes re-quotes every trade at its changed count and start (a start in a closed month is refused), audits each trade field it moves and stores the credit before and after, which the card reads ("Changed by your HRBP: 3 seats to 2, credit 0.04 to 0.32 standard heads"); a quote on Working rates says "Rates can change until FY28 locks."; a re-quote that moves the weights adds "Rates changed: ..." to the step note; a Working-priced trade that no longer fits is refused ("FY28 rates changed and this trade no longer fits. Send it back to the requester."); the card names a give seat's Interviewing req, and a block names a pending request only to a viewer who sees it in full (review SC-10 to SC-12, SC-16, SP-10 to SP-12, SP-17, UI-6, PV-9). |
| R83 | "Move target too?" (11.4) | Finance's last step of a cross-unit trade offers it, on by default; it moves the giving and receiving units' own unit-level targets with 'target' entries, and the choice is stored on the trade (review SP-5). |
| R84 | Accepted offers and held seats at approval | Approving a Start date, Level change, Location change, Start recruiting or Trade on a seat whose offer is accepted is refused (an Elimination is allowed; review SC-5); a seat an approved internal move holds while HRIS shows the person on it is no approved head and no ask, and the move's receiving seat is offered to no request, trade, transfer, seat edit or What if lever until HRIS shows the move (SC-6). |
| R85 | Cost centers of moved and new seats | A Location change or an HRBP seat edit to a site where the seat's department has no cost center is refused ("Sales has no cost center in Haifa yet, so this seat cannot move there. HR admin adds the cost center first.", review SC-15); a new seat (a New role, a trade's get seats) takes its department's cost center at its site where one exists, else its manager's, and is priced at band estimate until HRIS gives the hire their own cost center. |
| R86 | Small request readings | A resubmit with an unchanged chain writes no 'steps' entry (SC-17); an Elimination with no last day ends the seat on the approval date (SC-18); a credit refusal shows four decimals where two would read equal (SC-19); counts read "1 head" and "−1 head" (UI-9). |
| R87 | Step order across wall-clock days (R47) | Within one business day steps keep the wall clock's time of day; when two browsers act on one request on different wall-clock days with the same as-of date, a step can read decided at an earlier time of day than it was entered; dates, day counts and merge order (R77) never read the time of day, so this is accepted. |
| R88 | Writes and values | A write commits the state and its audit drafts as one store write, all or nothing, so a failed write leaves the store as it was (review IN-5); each value is checked against its table's unit before any other check, and a value that is not finite is refused (IN-8). |
| R89 | Home tiles re-linked from other views | Each key figure lists only the fields its model reads, probed with `lineageProbe.testkit.ts` (`src/views/home/engine/lineage.slow.test.ts`), and every field that moves nothing is explained in `lineageNotes.ts` (B4 follow-up). |
| R90 | Write-path conventions | Gate order: reader tab, the Acting as block, the policy, then 8.4; a unit's leader is the person the Units list's Owner names, and the Finance approver the first Finance role in the Roles list; new seat IDs are 'P-<request number>-<n>'; Requests > New's preview dry-runs the Save button's own action and the submit transition, so the preview and the write never differ. |
| R91 | "Changed by your HRBP" | Notes come from HRBP-mode seat-edit entries (start, level, location, FTE, status), grouped per edit; Manager mode reads "Changed by your HRBP: ...", other modes "Changed by the HRBP: ..."; a note follows its request through the Audit page's own link (`requestOfEntry`), and the position card shows the notes as "Changes in Working" (review SP-19). |
| R92 | Long CSV cells (CONTRACTS-M4 8.3) | The rows of a period partition the scope's positions. Finance, and HR admin with the switch off: unit by shown cost center plus the unit's one "Other (k)" row; by C33 (b) a cost-center cell is never a whole unit, so each is one row of loaded cost with "Components show for whole units and the company.", and 14.1 items 3 and 6's component split never applies to a row (the split is in the control totals, R114). HR admin with the switch on: unit by cost center by currency by component, equity on its own USD row. HRBP and Leader: departments (unit or company scope) or a leader's direct sub-orgs, month rows heads and FTE only, the scope's rounded total a control total and never a row. Manager: team by cost center, heads and FTE. |
| R93 | Cost filters in the long CSV (C33 (a) over 14.1 item 3) | Under a cost-center, legal-entity, country or currency filter the long CSV keeps its cells and heads, and every amount is empty with the guard's filter note. |
| R94 | The load file and org filters | The FP&A load file is written with no org filter (unit, department, cost center, leader, level, location, legal entity, country or currency): `loadFileOf` returns null and Finance > Export reads `FILTERED_TEXT` (story 8's leak test: no amount under a 1550-HSZ filter). Period, version and comparison stay free. |
| R95 | A long CSV row's currency and rate | Come from which lines exist, never from their amounts (C26), so a leave never changes them; a cell in more than one currency, every Other row and every rounded row is USD with no local amount. |
| R96 | The forecast's long CSV | Reads the Working forecast (`source: 'forecast'`), as Variance and the bridge do; its header states the rows' own version and rate set. |
| R97 | Suppressed flag (14.1 item 2) | Yes only when an amount cell is empty and the row has a reason (`WHY_KEY`, else the reason column, else the table's `suppressedWhy`); an empty band estimate on a Filled seat is written empty and not flagged. |
| R98 | Written numbers | Heads and FTE to 4 places, rates to 6, amounts to the cent, never exactly 3 decimals (the Manager amount scan reads "43.871" as a grouped number); the header writes a rate under 0.1 with 4 significant digits, so VND never reads "0". |
| R99 | Help in each mode | Help links, the welcome line and the tour layer render nothing outside the analytics provider; Report a problem shows dataset row counts only where `page:data` shows (HR admin) and counts no requests, comments or audit entries; a view tour keeps every step in every mode that shows it, a step about a hidden tab reworded onto a tab the mode shows; Manager and Finance never read "leave", "leaves" or "leaving" in articles, tours, release notes or the glossary, and Manager's help describes the drill panel's "Leave out" control instead of naming it (HL-12); text with an amount sits under `AMOUNTS`, `ROUNDED` or `EXACT`; release notes hold no amount and no `HELP_NAMES` phrase. |
| R100 | Version IDs with an amount (M3 known gap 5) | An ID carrying an amount is rewritten, not refused: the name's slug, else `<fy>-<kind>`, then -2, -3 (`cleanVersionIds` on Replace and Merge, `mintVersionId` at lock); on Merge the same version already here keeps its ID; the file's audit log is kept as it is. |
| R101 | A trade quote's pending-request block (M3 known gap 6, PV-9) | The app's quote passes each give seat's open req and the viewer's full view of requests, so its pending-request block names the request to a viewer who sees it in full and reads "another pending request" to everyone else (an intended change); What if's trade lever shows the quote's Interviewing warning in its "Trade note" column. |
| R102 | The one-file build's check | A static read of the built page as the HTML parser reads it (scripts/oneFile.mjs): only inline scripts and styles and the page's own few tags, nothing that names a file or address to load, within `ONE_FILE_BUDGET` = 6,000,000 bytes; verify step 6, `copy-single.mjs` and `deploy-pages.mjs` refuse a page that fails it. |
| R103 | `cost.guard.floorUsd` in Manager mode (policy change, CONTRACTS-M4 8.4) | Hidden (src/metrics/guardClass.ts `MANAGER_HIDDEN_RULES`, 7.6), the one rule whose setting is an amount, so Manager's glossary and Settings > Formulas leave it out. |
| R104 | Moving budget with a transfer in Manager mode (policy change, CONTRACTS-M4 8.4) | Manager's reason for `transfer.move-budget` is "Moving budget with a transfer is the HRBP's." (R52, PLAN 8.3). |
| R105 | Individual pay in outputs (D-PAYFILES; review EX-1, EX-2, attack D-PAYFILES-a) | A Shareable file is always written as HR admin sees it with Show pay amounts off (Finance's rules, 7.5), whatever the switch says: built from the same screen's context with the switch off (filters, pickers, as-of date and Acting as pick kept, not through `contextAs`), byte-equal to the switch-off file, no `pay` column, and the save says so (`SHAREABLE_PAY_OFF_TEXT`). Individual pay leaves the app only in a Full file or an output made with the switch on, and every output made with the switch on (figure and records CSV, Excel sheets, clipboard, whole-view workbook, deck, long CSV, both load files, image footers) starts with "Contains individual pay", keyed on the switch, not on a pay column. The load file at Finance's rules made with the switch on keeps the switch-off content (rows, folds, suppression, facts) and starts with the pay line and HR admin's switch-on mode line. |
| R106 | Every output names its mode (D-MODELINE; review CP-1, EX-8, CP-2, CP-10) | HR admin's outputs say "Made in HR admin mode." and, with the switch on, "Made in HR admin mode with pay amounts shown." (no cost line: the Rounding fact names the rules); a Leader with no scope (CEO, CFO, CHRO) reads "Made in Leader mode for the whole company."; the as-of date is stated once. Every file whose mode is manager (a manager's own Shareable and Requests files, every Export for a manager) carries the Manager line for the acting manager as the optional header `modeLine`, written first and outside the checksum, read back only as that line on a manager file with no amount, else refused as a broken part; a name the reader would refuse makes the writer fall back to "Made in Manager mode.". |
| R107 | Forecast accuracy (D-SPEC; review SA-1, R14) | Scores the fiscal year's latest locked reforecast with a stored forecast against the Working forecast's months closed since its `closedThrough`: each side summed over those months (cost both guard parts, heads at month-ends), then 1 − \|F − A\| ÷ A once. Whole company only (a reforecast stores the company's forecast); under a filter or scope it reads "—" with `ACCURACY_COMPANY_NOTE`. Forecast accuracy (heads) shows on Forecast > Variance in HRBP, Leader, Finance and HR admin; Forecast accuracy (cost) is guard class G, on Forecast > Variance and Finance > Versions in Finance (5 or more costed people) and HR admin. Forecast > Overview keeps its six key figures (9.4). One engine: `forecastAccuracyOf` (src/views/finance/engine/accuracy.ts) over the pure `accuracyOf` (src/plan/engine/accuracy.ts). On the sample: FY27 Q1 Reforecast against Jul to Sep 2026, cost 98.40%, heads 99.58%. |
| R108 | Back-dated adjustments (D-SPEC; review SA-2, 6.6) | Each adjustment posts as a line of its own in its `postedIn` month (the month whose close found it): heads 0, FTE 0, basis hris, the employee as holder, its `positionId` kept, so it folds with its seat's cost center and atom and a Working lock stores it. Plan's totals, Targets (asks, the gap, routing, the tree), the forecast (`withAdjustments`) and the bridge's timing step (at plan rates, the rate difference in FX) all carry it; C33 (d) still lists and counts adjustments at company level only. An adjustment for an employee not in the plan, or posted in a month not closed, is left out. Every sample version is daily and the sample plants no adjustment, so no story number moved. |
| R109 | The bridge's mix step (D-SPEC; review SA-3, attack SA-3-a, 6.8) | A seat at band estimate on both sides whose level, location or FTE changed is priced at the comparison's rates re-keyed to its new level and location, so the whole change lands in Mix; a seat moved across currencies is one seat, its move in Mix and its rate swap in FX. A Filled seat's level change stays in Pay rate, since HRIS pay drives it, and a seat with no mix keeps the two-part split (positions step). |
| R110 | HR admin with pay amounts shown folds nothing (D-SPEC; review SA-4, SA-12, attack SA-4-a, 7.5) | Every bridge step is its own row and there is no Other changes; each open-mode step card says `OPEN_STEP_CARD_NOTE`, and a step made only of band estimates shows a blank count, as the guarded modes do. Tree × cost center's subtitle drops its fold clause with the switch on. |
| R111 | Forecast average FTE (D-SPEC; review SA-5) | Daily, whatever the version's proration: Working and forecast lines carry a daily active fraction (`PlanLine.activeDaily`) when the version is not daily. A locked version's stored line table has no such column (adding one would change every lock hash), so a locked comparison reads its own stored fraction (R20 aside). Every sample version is daily. |
| R112 | The "Not in plan" row (D-SPEC; review SA-6, glossary) | The last row of Plan > Overview's Heads by unit: actual heads only, drilling to the people with no seat, who leave their HRIS unit's row; approved, plan and comparison are blank and its bar's note says why (`NOT_IN_PLAN_BAR_NOTE`). No other figure breaks actual heads down by unit, so Home and My team are unchanged. On the sample the 6 people not in the plan sit outside the story units, so no story number moved. |
| R113 | GL accounts (D-SPEC; review SA-7, 5.2) | Each long CSV and load file cell's account is read through the version's assumptions at the cell's org: its department, then its unit, then the company; the unit's Other, and a cell whose seats name two departments, read the unit's. |
| R114 | Finance's control totals by component (D-SPEC; review SB-1, CP-3, attack SB-1-a) | Lines of the preamble, never rows (the rows keep one grain): per period, USD per component (the filled part's six components, the band part apart, then loaded) for each whole unit and the company wherever C33 (b) passes, built only from the guard's own figures in exact modes, never for a cost center; Finance > Export shows them as "Control totals by component". HR admin's switch-on file totals its split from its own rows, for its scope and each unit. Components are written in whole cents adding to the loaded total (each to the nearest cent, then moved a cent at a time by largest remainder); the unrounded figures stay the guard's. On the sample Operations and the Executive Office split in some periods and the company never. |
| R115 | Rounding on rounded bridges (review SA-8, C34) | No Rounding bar: Other changes is the remainder, so it absorbs the rounding of the shown steps along with the folded steps, and the gap the spec's Rounding bar would show is always 0. |
| R116 | Band zones (review SA-9, 5.2) | Zone = location (site) in Phase 1, so bands are keyed level × site × fiscal year ('P1\|San Jose\|FY27'). |
| R117 | Rounded cost filters (review SA-10, 7.3) | An HRBP or Leader cost figure may read under a filter that selects a union of atoms (unit, a department that is a union of atoms, a leader), since it equals a row rule (a) already shows; other filters (level, location) read "—". The LP crawl observes those filtered figures; the verifier found no leak. |
| R118 | Year-end heads forecast's comparison (review SA-11, R25) | Always compares with the target, the question it answers (Cost vs target is its cost twin); the tile names it ("vs FY27 target"), while Full-year cost forecast follows the comparison picker. |
| R119 | The README's live link (review SB-6) | The README gives the GitHub Pages link before the first deploy; it goes live at ship (3.4), and the README changes only if the deploy is put off. |
| R120 | The M4 browser check (review SB-5) | The lead's pass on 24 Oct 2026 (port 8822, desktop and 375 px dark) is M4's browser check: B6, B7 and B8 rechecked, the Import requests dialog, the Help sheet and the tours, and at 375 px dark the Data room, Workspace, Requests Cycle, Finance Export, Audit, Action center and Help sheet; it found B9. The homes at 375 px and the light theme at 375 px were not walked again (docs/M4-REPORT.md known gaps). |
| R121 | Interviewing dates (review SB-8) | The ATS export gives no Interviewing date, so reqs carry none: the tracker's Interviewing date and days in step stay blank at that stage, and Step reads the stage. |
| R122 | My team's top band (review SB-9) | My team draws its hero, key figures and Needs attention in HomeTop's layout from its own page, because a view imports another view only through engine/ or metrics.ts (src/ship/imports.test.ts); like R13, the home's job is met by its own page. |
| R123 | Empty amount cells on slides (review EX-4) | On a slide a suppressed or missing amount is an empty cell, as in CSV and Excel (14.1 item 2), and so are the Suppressed and Why cells of a row that is not suppressed; other empty cells keep the "—" placeholder (14.3). |
| R124 | Manager export header facts (review SB-4) | Manager headers state all nine facts, with Rates, Cost and Rounding as amount-free words (`MANAGER_FACTS`: "Not used: no amounts in Manager mode", "Heads and FTE only", "No amounts"), whatever the meta holds; the Manager amount and ISO-code scans stay. |
| R125 | The glossary and Settings > Formulas per mode (review HL-8, attack HL-8-a) | One wording table (`METRIC_WORDING`, src/metrics/modeWording.ts) gives a definition in the mode's words where the mode hides what it names, part by part while the part is the catalog's own; `ctx.metrics` reads it, so tile definitions, cards, the glossary and Settings > Formulas agree. A rule entry shows with its article, the cost guard's rules only where amounts show, and an entry (or an edited definition) still naming a hidden thing is left out; Manager's glossary leaves out the cost guard's rules and Asks above the cut line, and the leave rule is left out in Manager and Finance rather than reworded. An entry lives on the first of its views the mode shows, else its `where` is empty. |
| R126 | Release notes per mode (review HL-10) | An item may carry a condition (`only`), so a mode reads only the items about what it shows; every mode reads at least one item of every note. |
| R127 | The sample's baseline id (browser B9, attack B9-a, B9-b) | 'northgate-' plus 12 hex digits of a SHA-256 over the canonical JSON of every dataset, the raw extracts' planted rows and the seeded plan state (locked versions and closes by their hashes). A stored state whose baseline id differs is set aside with `SAMPLE_CHANGED_NOTICE`, kept at `hcp:plan-aside:<its baseline id>` (one copy per earlier sample) before the first write on the new sample, which starts its own log; Data room > Workspace offers "Changes on the earlier sample" as a Full file with no datasets (HR admin, switch on) or removes the kept copy. Replace and Merge take a Full file with no datasets only on the baseline it was made on, else "This file was made on an earlier sample, so its changes stay in the file. Nothing was imported." |
| R128 | Limited request rows in exports (review EX-9) | A limited request record (queue, Approvals, records lists, the cycle's limited ranked asks) carries `LIMITED_WHY_TEXT` "Shows only position ID, title, level and org for this request." as its Why, so its empty band estimate is flagged Suppressed. |
| R129 | Tree × cost center's Costed people (review EX-6) | Left out where no row has a count (rounded and Manager modes), rather than written as 0. |
| R130 | Free text from the datasets in Manager mode (review EX-3, attack EX-3-a, EX-3-b) | Position titles, job families and req recruiters read through `managerText` where the context is built, so every model, card, export, Shareable and Export for a manager gets the guarded text; the lists in force still read the rows as imported. Open a shared file reads a kept figure's texts (title, subtitle, note, text cells) through `managerText` for the viewer. |
| R131 | Plain counts (review CP-5, CP-11) | A count takes the singular at 1 ("1 head", "1 seat"); a status sum names counts only ("7 Filled + 1 Open + 1 Planned."); a negative pending effect subtracts ("200 Working seats − 1 head from pending requests."); a gap of 0 reads "On target". `countTemplates` (src/testkit/counts.ts) scans the source for a count written before a plural noun with no singular branch. |
| R132 | Hiring progress readings (9.7, C36) | The readings taken while building and reviewing Plan > Hiring (H, T, W, K and I rows, and V1 to V19) are recorded in docs/CONTRACTS-HIRING.md sections 5 and 5.2 and override 9.7 where they differ. Among them: a later year's first quarter counts new to hire against open to hire on the day before it starts; Manager mode nets its tree's modeled exits over the tree alone (review HP-1); each stint of a rehire is its own hire and exit; a quarter that is over but not closed reads "(ended)"; the paces need 3 closed months. |
| R133 | Projected starts (9.8, C38) | The Working forecast's starts on Open and Planned seats with no signed offer, each at its fill rate, plus its modeled backfills, over the months E reads (month-ends after the as-of date). An opening the run dates in a closed month, or in a month that ended on or before the as-of date (a month-end as-of date before its close, review RN-1), counts in the first month ahead; a seat an approved internal move takes has none (`hiringData.ts` `projectedStartsOf`, `withoutTaken`). |
| R134 | Projected heads (9.8, C38; reviews RN-2 to RN-4) | Current heads − people whose last day is the as-of date + future starts + signed offers past their start date that the HRIS has not recorded + pre-hires the HRIS holds on a seat with no signed offer + moves in + projected starts − projected attrition. The three rare terms show only when not 0, each its own card input and month column, never a future start; Plan > Hiring's S, M, O and E are unchanged. A pre-hire's seat still counts in open to hire, as a lagging offer's does under H24, so A = H + O + S + M holds with that seat in O (finish audit AF-3). Projected heads equal the run's heads at every month end from an as-of date on or after the last close; with the as-of date before it (31 Aug 2026, September closed) each month ahead is the run's flows month by month, while the run's own heads sit below its flows from October (4 heads for Silicon Engineering by December, an open item of the forecast's, CONTRACTS-HIRING section 8; finish audit AF-2). |
| R135 | No Working forecast (9.8) | Projected starts, projected heads and the gap have no value ("—"); projected attrition is Plan > Hiring's E, known exits only, and its note and formula say so (review RU-6). |
| R136 | Months on the recruiting chart (9.8 item 2) | The last 12 closed months, then the months ended since the last close ("Ended, not closed", read from the HRIS as V8 reads a quarter over but not closed, review RN-1), then the months ahead from the first month-end after the as-of date. The month holding a mid-month as-of date carries its actual hires and exits to date (review RU-5). Each month ahead is the projection's difference, so the months add up to the quarter table and the tiles. |
| R137 | Approved heads on the recruiting chart | A at the fiscal year end on every month, a dotted line keyed "Approved heads by 31 Mar 2027"; a closed month's tooltip leaves it out (review RU-3). |
| R138 | By quarter ahead (9.8 item 3) | The quarters Plan > Hiring reads as ahead that end after the as-of date; a gap that rounds to 0.0 reads "On approved heads" (review RU-15); the note names current heads and the one-decimal rounding (review RN-8); a later year's rows read "Q1 FY28, Apr to Jun" (review RU-10). |
| R139 | A year that is over (9.8, H23) | No quarter or month ahead; projected starts and projected attrition read 0 with a card that says so, approved heads "—" with one too; the chart's subtitle names the closed months only, and the quarter table drops its span and note (review RU-7). |
| R140 | The recruiting tiles (9.8 item 1) | Every tile opens a calculation card, approved heads and current heads included (review RS-1). The approved heads, projected starts and projected attrition cards are titled by the fiscal year end's day ("Projected starts by 31 Mar 2027", review RN-5; future starts' card is "Future starts" and open to hire's "Open to hire, FY27", finish audit AD-8); a later year's flow tiles read "to FY28 end" (review RU-10); the attrition note is Plan > Hiring's "Attrition (heads) 6.6% over 12 closed months" (review RN-6); the velocity note is "6-month pace 4.5; 13 hires in 3 months" (review RU-9); a phone shows all seven tiles. |
| R141 | One name for expected exits on the recruiting tab | "Projected attrition" on the tile, the quarter and month columns, the legend, the cards and the help, never "projected exits" (reviews RU-12, RS-5). |
| R142 | Where hiring happened (9.8 item 4) | Plan > Hiring's C37 sub-totals ranked by hires, a tie in that table's order ("No location" last); places beyond the top 5 count as "and n more", naming a tie at the cut: "and 4 more locations, 1 tied with the fifth at 3 hires" (review RN-7). |
| R143 | The recruiting chart's marks | Moves in are their own segment, key and keyboard stop (review RS-2); projected starts a light fill with a full-strength dashed outline, 3:1 on the sheet and the slide (review RU-1); both axes titled (review RU-2); the bars' domain at least one head each way (review RU-8); month labels thinned as the Columns kit, shared with Plan > Hiring's velocity chart (review RU-11); approved heads dotted, projected heads dashed, keyed apart (review RU-14). The rare terms of R134 are drawn in the month they ride on, each with its own tint, key and keyboard stop only when not 0 (signed offers past their start date and pre-hires up after the future starts, last days on the as-of date down after the exits), so every month ahead's bars net to the dashed line's step; a last day on a mid-month as-of date is one of that month's exits to date, not a last days segment too (finish audit AF-1). |
| R144 | The recruiting deck (9.8 item 5) | One "Recruiting summary" slide after About these numbers, standing in for the strip, the quarter table and where hiring happened, its numbers as the strip shows them under the data standard's gates; a whole-view deck gives the tab that one slide and no divider of the same title, and the toast counts slides (review RU-17); the fallback table fits the slide (review RU-16). The workbook keeps every figure. |
| R145 | Heads-only tabs' own files (review RP-1) | Plan > Hiring's and Plan > Recruiting summary's own deck and workbook carry no long CSV control totals (`HEADS_ONLY_TABS`, `src/app/tabExport.ts`); their header facts and, with Show pay amounts on, the "Contains individual pay" line stay (R105). The whole-view files keep the control totals. |
| R146 | 8.4 rule 3 inside the scope (reviews RP-2, RP-3) | As CONTRACTS-HIRING I1: a hidden request's rows outside the scope move no count; inside the scope (Finance acting as C, the CFO leader) the tab reads the approved state as the other tabs do, and a hidden Trade's get seats in the viewer's own tree are the team's seats, as Plan > Overview and Positions read them. |
| R147 | The Forecast view's expected starts by month (review RS-3) | An expected start the run dates in a closed month counts in the first open month, where the run counts its heads from (6.7); Forecast > Overview's expected starts and October starts include those openings (8.5 for Silicon Engineering, 13.9 for the company on the sample). An offer start dated in a closed month is not moved: with the as-of date before the last close it is that month's HRIS hire, counted once, and each open month's starts are the run's own starts row (finish audit AG-1). |
| R148 | Recruiting summary's help and lineage (9.8 Help) | The view-plan tour gains no step (it is at 6); the glossary gains Projected starts, Projected heads and Gap to approved heads, and "projected attrition" finds Expected exits by quarter end; projected starts' lineage reads `positions.level` (time to fill by level); the access matrix gained 15 rows and no existing line changed. |

### 15.2 Changes to the spec (each with the reason)

| # | Change | Why |
|---|---|---|
| C1 | HR admin with the switch off sees exact totals under Finance's rules and filter rule (7.5); per-person amounts, and cost under leader, level or location filters, need the switch. | The spec says HR admin sees everything and only per-person amounts are behind the switch. (Census's switch modes show no cost with the switch off.) A department total and the same department with a level include would otherwise differ by one person. |
| C2 | Asks count each pending request by its head effect (6.9), so a pending elimination effective by the target date subtracts, not an approved one. | An approved elimination end-dates the position, so it is already out of Working approved heads; subtracting it again double counts. |
| C3 | HRBP and Leader cost share **one** rounding partition, the cost atom (7.3), instead of departments for one and sub-orgs for the other. | Two overlapping roundings under an open mode switch is exactly what pinned pay in Census's red team. Departments and sub-orgs still show as rows when they are unions of atoms. |
| C4 | No monthly cost series in rounded modes. | Monthly $0.1M steps on 20-person teams would read 20 to 33% jumps and multiply the observations the LP test must cover. |
| C5 | Finance cost under a cost center, legal entity, country or currency filter is the sum of the unit's shown cost centers with that value (one fold per unit, reused under every filter; one such dimension at a time). | Exact totals for two overlapping filters subtract to 1 to 4 people at one date, which is wider than the accepted "difference out one hire" risk. A country row minus its shown cost centers would also give a folded one (story 8's 3 people). Question 5. |
| C6 | Contributors to a difference count costed positions only (band-estimate seats do not count); FX effect counts non-USD people only; rule (c) also applies to Finance's **displayed** differences; a difference made only of band-estimate amounts is a band figure and shows without a contributor count. | "3 filled + 2 open" must stay hidden; FX effect of 2 ILS people in a unit of 30 would expose their cost. What if deltas move only band seats, so they would otherwise always read "—". |
| C7 | `motion` is dropped by replacing it with CSS in its three call sites; `date-fns` is dropped too. | The spec lists `motion` as unused, but Census's shell uses it. `date-fns` has no imports. |
| C8 | `headcount-planner.html` is git-ignored; deploy publishes it. | Census's committed 8 MB file bloats history; the spec wants the download from the site. |
| C9 | The deploy script stages its three files by name. | "Never `git add -A`". |
| C10 | The Cycle tab's "Remind" button is labeled "Copy note". | Census's tone rule bans "remind" in copy; the button still copies a message. |
| C11 | The vendor sheet alias "census" is dropped from sheet detection. | The spec's test fails on the word anywhere in `src/`. |
| C12 | Request types add Trade, Start recruiting and Start date. | Your trade requirement, and R5. |
| C13 | Fixture F1 states the backfill lag (1 month) and R-88's start (1 Dec). | The example holds only with them. |
| C14 | Finance assumption edits: burden caps, merit date and cutoff, promotion-pool date, `bonusTarget`, `bonusFunding`, merit % and promotion-pool % come from the imported assumptions dataset (HR admin) and are read only for Finance. Any other Finance edit, and any assumption set given to a new version, is refused when it moves 1 to 4 costed positions in all, or in one month of one shown cost center or one department × country share of a unit's Other (7.4). | Cap, cutoff and percentage sweeps read single salaries out of exact totals, which goes further than the spec's accepted one-hire risk. A currency- or country-wide edit would also read a folded cost center (story 8's 3 people) out of its unit's Other. Question 5. |
| C15 | Finance has one cost fold, the cost-center breakdown per unit. Site, country, legal-entity, currency and unit rows, and the long CSV and load-file rows, are sums of shown cost centers; folded cost centers stay in the unit's one Other everywhere, and a breakdown that does not nest over cost centers shows heads. | Census folded each breakdown on its own, which was safe only because its Finance figures were rounded. Exact, the Taiwan row for Corporate minus Corporate's shown Hsinchu cost centers gives 1550-HSZ's 3 people. |
| C16 | Finance cost on org rows below the unit (leader-tree nodes, sub-orgs, target rows keyed below the unit, Tree × cost center cells) shows only for unions of shown cost centers whose remainder is also such a union; other rows show heads. | A unit minus its SVP's sub-orgs is the SVP's own seat exactly, and tree nodes next to cost centers isolate cells of 1 to 4. |
| C17 | A component amount needs 5 or more contributing positions in its cell (sign-on and relocation: hires; agency fee: accepted offers; severance: eliminated Filled seats). If any component of a cell fails, the cell shows loaded cost only; in the long CSV it is one row with component `loaded`. | One-time items book whole in one month, so a large cost center's one-time cell is often one hire's sign-on or one person's severance, and loaded minus the shown components would give back a hidden one. |
| C18 | Pending requests enter asks cost, the gap and gap after approval at band estimate, in-year (from the start or effective date to FY end, at plan rates), never at HRIS pay or an offer. Gap after approval = the gap with this request left out of asks − the request's head effect and band-estimate effect (6.9, 10.2), so a pending request's gap does not move at approval. | At Working cost, submitting and withdrawing an Elimination reads one person's pay. An annual band estimate added to in-year totals gives T1 +$151,123.60 instead of −$52,031.60 (fixture G3). |
| C19 | Out of plan, the cycle's envelope check and over-target flags compare the target with the guarded asks cost (rounded per atom, atoms under 5 left out), computed once in `chainFor` and the same in every mode. An org whose rounded cost would read "—" compares heads only. | Exact HRIS sums compared with a target the user can move by start day and FTE make routing an oracle for one hire's pay, shown even in Manager mode's chain preview. |
| C20 | The cost-atom index is fixed at each month close (stored with the close, keyed by `positionId`). Working edits, requests, approvals and transfers never move a position between atoms before the next close; a new position takes its manager's atom. | Re-partitioning at will rounds the same fixed amounts again at one date, the pattern that pinned pay in Census's red team. |
| C21 | Rounded modes show cost only for periods `fy`, `ytd` and `qtd` (`ytd` and `qtd` end at the last closed month-end), with no exit run rate, loaded incl. SBC or components. Their long CSV carries amounts only at QTD, YTD and FY for orgs that are unions of atoms (loaded, USD), and their control totals are Σ heads, Σ FTE and the screen's rounded loaded total. Only HR admin can move the as-of date. | The spec lets the period through freely, but month and custom windows, a one-month run rate × 12 and incl. SBC beside loaded give observations the LP test cannot bound. |
| C22 | Attrition is Finance's; HRBPs edit only time to fill, fill rate, backfill % and lag. Forecast exits split into an HRIS cohort (Filled seats and accepted offers, at the unit's HRIS average, filled part) and a band cohort (probability-weighted starts and backfills, at band estimate, band part). | Attrition and every band-side input scaled exits costed at an HRIS average, so sweeping them read an atom's exact HRIS total in rounded modes. |
| C23 | Seats with an accepted offer cannot be edited in Working, given a Start date, Level change or Location change, put On hold, used as a What if lever or traded (block `accepted-offer`); Elimination is still allowed. | An accepted offer is a costed person: moving its start, FTE or hold moves exact and rounded totals by a known share of one offer. |
| C24 | Text with an amount is always Approvers only (the audience picker is disabled). Other free text a manager reads (seat-edit, change, send-back, reject and freeze-exception reasons, audit comments) refuses an amount at entry, and at read time Manager mode drops amount comments and shows "an amount" in reasons. | The spec says "defaults to", but managers see no amounts, and imported files bypass any default. |
| C25 | HRBP and Leader see one leave count, for the mode's whole scope at the as-of date and only at 5 or more, with no filter, breakdown, series, delta or drill to people. It shows only when every class of people across the shown scopes has 0 or 5 or more on leave. | Two counts of 5+ under free filters can differ by one person (Munich against Munich with P1 to P5 included). |
| C26 | Costed people include employees on unpaid leave: leave sets their amounts to 0 for those months and never changes who is costed, so guard counts, folds, atoms, drills and contributor lists never read leave. | Otherwise a group's cost turning "Hidden" or a cost drill missing a row tells Finance, which sees no leave data, who is on unpaid leave. |
| C27 | Every hash (lock, audit chain, workspace checksum) uses `src/lib/sha256.ts`, Census's synchronous SHA-256, never `crypto.subtle`. | The sample generator, the perf budget and pure view models must compute and verify hashes synchronously; `crypto.subtle` is async and missing on plain-http pages. |
| C28 | Locking writes a new locked version and leaves the year's Working editable. Reopening a reforecast retires the year's Working (read only, "<name> (replaced <date>)") and creates a new Working from the reforecast. | "Reopening makes a new version" would otherwise leave two editable versions of one year, while asks and the version picker need exactly one. |
| C29 | What if's one tab is `levers` ("Levers"), a tool and not an Overview: a lever list beside exactly three result KPIs (heads, cost and gap change) plus one trade ratio per trade lever, and no Readout. | The spec asks What if for heads, cost and gap; the 5-to-7 KPI rule for Overview tabs would need invented metrics. |
| C30 | "Export for a manager" (HRBP, Leader in their org, HR admin) builds a file exactly as a Shareable made in Manager mode acting as that manager. "Open a shared file" renders through the current mode's guard and Acting as person's rules, never the mode the file was made in. | An HRBP's Shareable holds rounded amounts and requests a manager must not see, and a file sent anyway is readable JSON. |
| C31 | Plan versions (Budget, reforecasts and Working) carry a vacancy allowance: each month, minus the org's vacancy factor (3% in the sample) times the filled part's loaded cost, as its own line component included in the version's totals. The forecast and month closes carry none. The bridge starts at the comparison's total including the allowance, and step 3 is the forecast's exit and backfill effect minus that allowance. | The spec names a vacancy factor and an "attrition against the vacancy factor" bridge step but not where the factor lives; without one home for it the bridge start, the variance and the plan totals disagreed (M1 review). |
| C32 | Each month close also snapshots the one-time items booked in that month (sign-on, relocation, agency fee, severance, per 6.3) at the month's actual rate. | Closes held HRIS pay only, so one-time costs already incurred vanished from the forecast's closed months and the variance compared unlike bases (M1 review). |
| C33 | Exact cost (Finance, and HR admin with the switch off) is published only at grains the joint-classes test can guarantee. (a) Cost filters are whole business units (plus version and period); under a cost-center, legal-entity, country or currency filter head counts still narrow but cost reads "—" with "Cost shows for whole business units. Cost centers, countries, legal entities and currencies are rows of each unit's breakdown." These stay exact rows of the unit's one fold (C15). This replaces C5's filter rule and question 5's "one at a time" filter. (b) The component split shows only on unit and company figures, when within every unit it covers every component has 0 or 5+ contributors and each capped burden component's below-cap and at-or-above-cap sides have 0 or 5+ people (a person whose cap binds in some months counts on both sides), checked per month and over the window, in `costRow`; otherwise loaded only. (c) Bridge steps and the FX effect are per unit and company with one company-wide fold of steps; the FX tile comes from the same folded result and shows only when the bridge shows FX as its own step. (d) Back-dated adjustments and the "other HRIS change" count show at company level only. (e) Closed months come from the closes everywhere, through one helper (`src/plan/lineSource.ts`) shared by Plan, Forecast, Targets and sample routing. | The M2 red team found that two cost-center selections give one sign-on, that a capped burden's split reads salaries, that adjustments and steps differenced across scopes isolate one person, and that Targets and Plan priced closed months from different lines (M2 review RF-1 to RF-5, RC-1). |
| C34 | The bridge's shape (which rows show, which steps fold, whether Other changes shows) never reads leave in any mode: folds read only leave-neutral contributor facts (R44) and are decided the same way in every scope, so flipping anyone's leave between paid and unpaid leaves every bridge's rows identical. | With leave-neutral contributors, a step whose only costed move was a leave still folded into Other changes and pulled in a shown step, so in HRBP and Leader mode a row appeared or vanished when one person's leave turned unpaid, against C26 (M2 report, known gap 3). |
| C35 | Full files encode each locked version's line table by column (one array per field, the amount columns as integer cents, heads, FTE, active share and rates exact); the earlier all-exact and row forms still read. The import limit is 25 MB for Shareable and Requests files ("This file is larger than 25 MB, the most a Shareable or Requests file can be. Nothing was imported.") and 150 MB for Full files ("This file is larger than 150 MB, the most a Full file can be. Nothing was imported."). Replace from a Full file whose audit chain verifies, its own audit head included, replaces this workspace's audit log with the file's (`PlanStore.replaceAudit`, Browser and Memory stores, in the same commit as the state), then appends one "workspace replaced" entry; a file whose chain breaks is refused with its first broken link ("This file's audit log breaks at entry n. Nothing was imported."). Merge keeps this workspace's log. | The sample's Full file is about 19 MB and each lock adds about 7 MB, so 5.5's 25 MB limit refused a Full file after one more lock; and a Replace that kept the old log left the restored workspace's history out of step with its plan state (M3 integration). On the sample the Full file is now 14.2 MB, and 24.4 MB after two more locks. |
| C36 | Plan gains a Hiring tab (9.7): open to hire by quarter = approved heads by the quarter end − current heads − accepted starts by the quarter end, with expected exits, hires needed per month, and hiring velocity from actual hires and exits (paces, attrition, months to close); an Open to hire tile on the HRBP, Leader and Manager homes. | Added at the user's request on 24 Oct 2026, before ship: a module that tracks headcount progress via hiring by quarter, and hiring velocity from hires and attrition. |
| C37 | In Plan > Hiring, "accepted starts" and the velocity figure's "expected starts" become **Future starts**: people with a signed offer, by start date, and nothing else (no forecast or modeled start). Approved internal moves into the scope that have not started become their own row, Moves in, so the formula stays exact. Hiring velocity adds the hires of the last 3 closed months by location and department. The Forecast view's modeled starts are unchanged. | The user, 26 Oct 2026: "for expected starts, only call it future starts, and only include people that have signed offers. make sure to add hiring velocity by including the number of hires into that location and group over the last 3 months." |
| C38 | Plan gains a Recruiting summary tab (9.8): one screen with approved heads, current heads, open to hire, future starts (signed offers), projected starts (the forecast model, kept apart), projected attrition and hiring velocity, one chart by month, one table by quarter ahead, where hiring happened, and a one-slide export. Built 27 Oct 2026 (R133 to R148), its finish audit fixed 28 Oct 2026; with it the Forecast view's openings dated in a closed month count in the first open month (R147). | The user, 26 Oct 2026: "one simple view i can show the head of recruiting that shows current approved future starts projected starts projected attrition and hiring velocity". |

### 15.3 Accepted risks (repeated in README where they concern users)

1. **Finance exact series** let Finance difference out one hire's or one exit's cost between two
   month-ends (including a sign-on, relocation, agency fee or severance booked that month), or one unpaid
   leave start. (Spec's accepted risk, extended to exits and leave.) Displayed differences still need 5+
   contributors; the unsuppressed load file needs HR admin with the switch.
2. **Rounded modes**: a single hire, leaver, unpaid-leave change or severance between two closes is
   bounded only to the $100,000 step itself (Census's "still not covered"); the LP test proves nothing
   narrower. Each month close can change the atom partition (real moves, or edits made before the
   close), and each change rounds fixed amounts again under the new partition; the LP test covers one
   such change between two closes, not a series of them.
3. **Standard heads** reveal relative band estimates by level and location; a manager who knows one
   seat's band estimate can convert the rest. Pay structure, not anyone's pay.
4. **Band estimates** of single Open or Planned seats show to HRBP, Leader and Finance. They are
   structure, not a person's pay, even when a hire later lands at midpoint.
5. **Modes are not security**: anyone can switch modes or Acting as, and the browser's own tools read all
   data on the computer. **Shared origin**: every app on `unique-name27.github.io` can read the others'
   storage. **Checksums** catch damage, not forgery.
6. **Approved changes to a Filled seat** (an Elimination with its severance, a Level or Location change)
   move Working by that person's HRIS-based cost, which Finance can difference at one date, like an exit.
   Anyone who switches modes or Acting as can approve such a change. An approved Elimination cannot be
   undone, so it gives one observation per seat.
7. **Routing shows in Manager mode**: a manager sees whether a request goes to the leader. Out of plan
   uses the guarded rounded cost (C19), so this reveals at most whether an org's rounded cost is over its
   target, never anyone's pay.
8. **Small currency groups**: a unit with only 1 to 4 costed people in a currency keeps them in its Other
   (7.4). Finance can read their local cost as the unit's FX effect minus its shown cost centers' FX
   effects. Every other currency share of a unit's Other is 0 or 5 or more, and FX rate edits that move
   such a group are refused (7.4). `sample.test.ts` lists each such group and the README names it.
9. **Request number clashes** (R74): a new request's number is a keyed hash, so about one draw in
   24,000 per tagged ID already in force lands on a taken number; the person then gets their next
   number, so that one ID depends on another request. Nothing is shown or counted from it.
10. **Forecast drivers in Manager mode** (review RP-4): modeled figures in heads let a manager read the
   forecast's drivers back, though `dataset:assumptions` is hidden for Manager: the fill rate and time to
   fill, and with modeled exits the backfill rate and lag, from projected starts and their modeled
   backfills (Plan > Recruiting summary, C38; with one Open seat a month's projected starts are its fill
   rate), and attrition from modeled exits (Plan > Hiring, C36). These are planning assumptions, not
   anyone's pay; hiding a seat's weight would not prevent it.

---

## 16. Tests and the quality bar

Vitest in `node`; tests are `*.test.ts` (a `.test.tsx` never runs); React markup, where needed, through
`renderToStaticMarkup`. Projects: `unit` (parallel), `slow` (serial: LP, attack, unions, edit sweeps,
crawls and the whole-sample Excel round trip; the LP test under 180 s), `perf` (serial budgets with
`bestCostMs`, after the other two). `unit` and `slow` run at the same time, so a test whose work is
known to be long sets its own timeout. Every sample-based test
shares one generated sample per file in `beforeAll`.

### 16.1 The spec's quality bar, item by item

| Spec requirement | Test(s) |
|---|---|
| Exact fixtures for every worked example | `plan/engine/{heads,proration,cost,fx,forecast,versions,bridge,targets,budgetStatus,chain,trade}.test.ts` (fixtures H1 to H4; C1, C2, C2b, C3, C4; X1, X2; F1 to F3; B1; G1 to G3, A1, A2; CH1 to CH5; trade F-S, F-S2, T1, T1′, T1h, T2 to T6, T7a, T7b; every negative control a fixture names must fail); `drill/calc.test.ts` (each as a CalcSpec whose last step equals the value) |
| A smoke test finds all 8 stories (plus story 9) | `data/sample/sample.test.ts` (exact numbers, 13.4; for stories 1, 2 and 5 the per-position differences between actual heads at 30 Sep and Budget plan heads are exactly the planted rows, and no not-in-plan employee falls in those orgs) and `data/sample/raw/stories.test.ts` (same on messy data); story 6 walked to lock through the write path with no cut line set: 66 asks approved (40 heads) and 21 rejected "Below the cut line" (18 heads) (`views/requests/engine/cycle.review.test.ts`, `plan/actions/coreFlow.scenario.test.ts`, R54) |
| Counted figures equal the rows their drill opens | per view `engine/drill.test.ts`; `drill/filterTo.test.ts` (Census `expectFilterTo` and `expectLeaveOut` with scope variants); weighted rows Σ counts-as = figure |
| Leak tests per mode over every surface, export, workspace file and comment | `testkit/crawl.ts` collects every string and number a mode can reach (view models, KPIs, findings, drill tables, position and calculation cards, Action center, homes, help, glossary, Settings > Formulas, exports as written bytes, Shareable, Requests and Export for a manager workspace JSON, comments, audit rows), with an HR admin control that must differ; no `seq`, `prevHash` or `hash` field appears in a non-HR-admin crawl. From M3 the crawl reads the app's own file writers and opener, the write path's models (Requests > New's preview of one form per type, seat edits, transfers, the Workspace menu, What if with a lever of every kind) and the Import requests preview (`importsCrawl`); `access/leaks.writes.slow.test.ts` crawls a New role walked through the write path step by step; tests below |
| Manager: no amounts | `access/leaks.manager.slow.test.ts`: no currency sign, ISO code, grouped number or amount-like column key in any Manager crawl, glossary definitions and Settings > Formulas setting values included. The fixture adds an Everyone comment, a seat-edit reason, a send-back reason, a freeze-exception reason and an audit comment, each containing "€140,000", and an imported request whose Everyone comment contains "$95k" and whose job title contains "€140,000" (PV-6): the Manager crawl holds none of them, the HR admin control all of them. `access/amountSpellings.slow.test.ts` plants R40's and R81's spellings through the write path (Everyone comments forced to Approvers only, a seat-edit reason refused, Manager A's crawl clean); `data/versionNames.test.ts`: a version name with an amount reads "an amount" in Manager mode's versions, Plan model and files (UI-3) |
| Manager: one salary change in a team of 3 leaves surfaces byte-identical | same file: Manager B crawls before and after changing one `baseSalary`, one `offerBase` and one `leavePaid` are `JSON.stringify`-equal (clock pinned) |
| Manager C sees nothing of the elimination | same file: one generated sample, and a copy with the confidential Elimination and its comments, notifications and audit entries removed from plan state after generation (not regenerated, so no other id or `seq` shifts). Manager C crawls of the two are `JSON.stringify`-equal (clock pinned): no id, count, item, audit row, notification or allocation change; HR admin crawls of the pair differ (control). Also with and without the elimination: (a) in a test-local copy with Operations' FY27 target set to its asks without the elimination, Manager C and a manager below C draft and submit (MemoryStore) a New role and a Trade in their tree, and the chain preview, stored steps and tracker match (both show the leader step); (b) an HRBP Shareable made with the elimination, opened in Manager mode acting as C, shows no id, count, comment, audit row, Action item or amount of it; (c) Export for a manager for C gives byte-equal files that pass the Manager amount scan, written from C's, the HRBP's and HR admin's contexts; (d) `plan/actions/managerC.scenario.test.ts`: approving, withdrawing, commenting on, sending back or submitting R-1035 as C gives the refusal an unknown ID gives (SC-13), and `plan/actions/requestIds.test.ts` and `app/write/requestIds.scenario.test.ts`: C's next request ID is the same with and without the Elimination, and no other person's request moves it (R74) |
| Outside HR admin, nothing derived from a Filled salary or accepted offer per position | `access/leaks.positions.slow.test.ts`: one at a time, perturb each Filled seat's `baseSalary` in Manager B's team and in story 8's `1550-HSZ`; the `offerBase`, `signOnBonus`, `relocation` and `agencyFee` of each of story 2's 6 Hsinchu offers, story 4's honored Corporate offer and one accepted offer in an HRBP atom; one eliminated Filled seat's `baseSalary` (so its severance); and a back-dated comp row in a closed month. Each time, the HRBP, Leader and Finance crawls (clock pinned; Finance > Versions, its drills, every export, Shareable file and load file included) equal their baselines except amounts the guard lets move: totals over 5 or more costed people (whole-atom rounded totals in HRBP and Leader) and differences with 5 or more contributors. A one-time or severance change moves only loaded totals, never a component cell. Status words, flags and chain steps never move. The crawl tags each figure with its id, its costed people counted over the figure's own window (7.2 rule 1) and its contributor count and names any surface that fails; the HR admin control with the switch on must differ. The HRBP, Leader and Finance Shareable JSON holds no per-position money key (`usd`, `local`, `loaded`, `base`, `delta`) and no row keyed by a Filled `positionId` with an amount. `policy.test.ts` and `requests.test.ts` refuse `position.edit`, Start date, Level change, Location change, On hold, Trade and every What if lever on an accepted-offer seat with `accepted-offer` in every mode but HR admin; `cost/assumptionEdits.slow.test.ts` covers Finance's assumption edits (7.4): R37's list and the read-only tables through the write path, and (f) vacancy edits by department in FY27 and FY28 Working with three people unpaid keep the same verdict and movers; `views/finance/engine/editsFx.test.ts` covers the structural FX rule (PV-1 to PV-3) and a leave flip that never changes a verdict (PV-4, R67, R68) |
| Pending requests never price a person | `access/leaks.requests.slow.test.ts`: in every mode except HR admin with the switch, crawl with and without a pending Elimination, Level change and Location change on one Filled seat, and a pending Elimination on one accepted-offer seat, then repeat with that seat's `baseSalary` (or `offerBase`) perturbed: the set of changed values and every delta between the two crawls are the same for both salaries. In HRBP and Leader mode, sweeping the Elimination's effective date over every day of the fiscal year moves only the atom's band part, never its filled part |
| No cost, rate or average over fewer than 5 | `cost/guard.test.ts` (`expectGuarded` on fixtures; in a 20-person cost center, one October hire with sign-on and relocation leaves October at loaded cost only, and no cell, component row or long CSV row equals that sign-on plus relocation; no cell, and no cell's loaded − Σ shown components, equals one eliminated seat's severance), `access/leaks.small.slow.test.ts` (story 8 cost center reads "—" or Other everywhere without the switch), `cost/costUnions.slow.test.ts` (every class of costed people over all Finance sets shown at one as-of date, taken together, has 5 or more: unit, cost center, site, country, legal entity, currency, org rows, Tree × cost center cells, long CSV rows and control totals; story 8 through the Taiwan row for Corporate minus Corporate's shown Hsinchu cost centers) |
| HR admin without the switch: no two cost figures under different filters differ by 1 to 4 costed people | `cost/costUnions.slow.test.ts` over HR admin's filter sets with the switch off; `cost/fit.test.ts` (department plus a level include returns the reason) |
| No month or version difference equals one person's cost (3 filled + 2 open) | `cost/differences.test.ts` (fixture: 3 Filled + 2 Open shows no difference in any mode; deferring one Planned seat in What if shows its exact band delta in HRBP, Leader and Finance and hides it in Manager), `cost/costDiff.slow.test.ts` (rounded modes: HRBP and Leader exports, long CSV and control totals included; fails on any monthly, cost-center or component amount), `cost/costLp.slow.test.ts` (next row) |
| HRBP and Leader cost pins nobody narrower than $100,000 (spec cost guard (d)) | `cost/costLp.slow.test.ts` (7.3(d): union identity over a bounded scope list, one LP per atom and field with at most 200 unknowns and 600 rows, and controls; it observes everything the rounded-mode crawl collects for every HRBP and leader pick at 31 Aug and 30 Sep 2026 under both closes' atom indexes, and asserts its own atom count and LP sizes), `cost/editInvariance.slow.test.ts` (no seat edit, request, trade, What if lever or HRBP-editable assumption moves any atom's exact filled part, to the cent, in any month or version; costing band-cohort exits at the HRIS average must fail), `access/leaks.rounded.slow.test.ts` (in every HRBP and Leader crawl, calculation cards included, every amount not tagged as a band estimate or a per-head step passes `isRoundedCost`, and no card input is a local-currency amount or an HRIS-derived average) |
| Leave: none in Manager or Finance; no differencing in HRBP and Leader | `access/leaks.leave.slow.test.ts`: no leave field, count or note in any Manager or Finance crawl. Flipping one `leavePaid` from true to false inside a 5-head cost center, a 5-person atom and a Finance 5+ row, and adding a back-dated unpaid leave in a closed month, leaves every Finance, HRBP and Leader crawl (row lists, guard states, "Hidden" notes, Other (k) labels, left-out counts, drill row ids, contributor lists, Finance > Versions) `JSON.stringify`-equal apart from totals already shown at 5 or more; row lists compare strictly (`MoveRules.strictRows`, C34), and a sweep flips every leave together and each alone across every scope Acting as reaches (Finance and HR admin units, all-but-one-unit sets, every HRBP and Leader pick) at fy, ytd, qtd and month, also at a reporting date before the last close. Under a sweep of includes and excludes on each filter dimension at 31 Aug and 30 Sep 2026, no HRBP or Leader persona shows a leave number under a filter or a non-default period, and every class of people defined by all shown leave sets has 0 or 5 or more on leave; control: counts under filters, as in Census, find a class of 1 (Munich's P6) |
| Limited requests stay limited on every surface | `access/visibility.test.ts`: Finance and an off-chain Leader crawl an Elimination of a Filled seat and a request carrying an approvers-only comment with an amount; audit rows, comments, the queue, the Shareable file and notifications hold no requester name, reason code, effective date, comment text or amount for them, while the approver persona's crawl does (control). `views/data/engine/openShared.test.ts`: a Shareable opened on another workspace after an imported approval (Import requests and a Full-file Merge) shows Finance and an off-chain Leader only limited rows and Manager C nothing (PV-5); `views/data/engine/importRequests.test.ts`: Import requests' preview shows a limited importer no approvers-only comment, site, requester or step of a limited request, and its effect conflict reads "This request cannot be applied in this workspace." (PV-8, R76); `views/plan/engine/notes.test.ts`: the seat note of an imported confidential Elimination names no approver for Finance or the CFO |
| Locked totals hold when assumptions change | `plan/engine/versions.test.ts`: edit Working's bands, loads and FX; Budget and Q1 Reforecast totals and hashes unchanged, and the FX effect and the bridge's FX step against Budget unchanged (X2). Locking leaves the year's Working editable and adds a locked budget or reforecast with `parentId`; reopening Q1 Reforecast leaves exactly one FY27 version in state 'working', the old one retired, both hashes unchanged. Full files (C35, R78): `plan/workspace/file.test.ts` and `validate.test.ts` (amounts as integer cents, the earlier exact and row forms read back with every lock hash verifying; a locked version that fails its own lock is refused), `views/data/engine/workspace.test.ts` (the sample's Full file after two more locks reads and verifies; a Shareable or Requests file over 25 MB and a Full file over 150 MB are refused with their texts; Replace takes the file's log, Merge keeps this workspace's, a broken chain is refused) and `plan/actions/recheck.scenario.test.ts` (a lost tail and a forged lock are refused) |
| `npm run verify` and the data-file gate | `ship/trackedFiles.test.ts` (pure `strayDataFiles`), verify runs it first; the one-file build opens from `file://` with no network request and stays under `ONE_FILE_BUDGET` (6,000,000 bytes): `scripts/check-single.mjs` runs right after verify's one-file build, `copy-single.mjs` and the deploy refuse a page that fails it, and `ship/oneFile.test.ts` tries the check on made-up pages, each break alone |
| Each home in light, dark and at 375 px, no horizontal scroll | Browser pass in M2 and M4 with the Claude browser pane: `resize_window` 375 × 812, light and dark, `document.documentElement.scrollWidth === clientWidth` on every home, screenshots in the report |
| `policy.test.ts` asserts a decision for every surface, action and mode | `access/policy/policy.test.ts` (every surface id named anywhere in sections 8 to 11 has an explicit decision in every mode) + `access/matrix.test.ts` (snapshots `access-matrix.txt`, `access-how.txt`; every L and H has a reason; banned words) |
| "census" never in `src/` | `ship/noCensus.test.ts` (needle built as `'cen' + 'sus'`; scans `src`, `scripts`, `vite.config.ts`, `index.html`, `package.json`) |

### 16.2 Tests by folder (Census ports marked ★)

- `ship/`: noCensus, brand (scripts agree with `src/app/brand.ts`), imports (dependency rules as a deny-list, section 4), trackedFiles, deployPages ★ (staged by name; a sandboxed run refuses without a commit, an `origin`, the build, or a build that fails the one-file check, then pushes exactly the three files), devServer ★, storageKeys ★, oneFile (the single-mode config, an `index.html` with no external URL, the one-file check of 3.3 on made-up pages, and verify, copy-single and the deploy running it), docs (README.md: the live link, the download, architecture honesty, the shared origin, every 15.3 risk that concerns users by its title, and the nine stories' numbers against the generated sample; ARCHITECTURE.md: every source folder, script and ship test named, the one Vite command, the ports; neither holds a `BANNED_HASH_WORDS` spelling).
- `data/`: schema and import ★ (apply, automap, detect incl. positions vs workers, parse, normalize, profiles, protected, templates (layout, dropdowns, pay columns and dataset exports in `templates.test.ts`; the round trip of every dataset incl. `steps`, for the fixture, the test org and the whole sample, in `templates.slow.test.ts`, moved there in M4 with its asserts unchanged, M3 known gap 9); every `REASON_CODES_OF` value is in `REASON_CODES`), lists ★, quality ★, scope (fiscal presets, position trees), urlScope ★ (`ver`, `vs`; `vs=target` round-trips, an unknown or cross-year `vs` resets to the default), context (`buildContext` with the FY28 Working gives a target comparison in all five modes, Finance included), settings ★, savedViews ★, store ★ (mocks `@/data/idb`), tabSync (writer lock with an injected Web Locks stub and the BroadcastChannel fallback), sample, sample.perf (synchronous `generateSample()`, hashing included), raw ★ (planted rows; the six kind 'requests' manager files).
- `plan/`: every engine with fixtures (16.1); requests state machine (every allowed and refused transition, `accepted-offer` refusals included); chain (self-approval, double role, on behalf, like-for-like backfill, threshold, Director+, out of plan, freeze exception, CH1 to CH5; routing never reads a request hidden from its requester; with `targets.test.ts`: a Filled `baseSalary` or `offerBase` change that leaves its atom's rounded value unchanged leaves every out-of-plan bit, chain, envelope check and over-target flag unchanged, and sweeping a draft New role's start date by day and FTE by 0.1 flips out of plan only where the shown rounded asks cross the target); cycle (cut line, lock outcomes); freeze; transfer; whatif (a freeze lever plus one cancel lever turns into exactly one Elimination Draft; no request type outside `REQUEST_TYPES`); reconcile; close and adjustments; variance and bridge (an empty state, not an error, when the comparison is a target); audit chain (verify detects a changed entry); workspace (25 MB for Shareable and Requests files and 150 MB for Full files, Full files by column with integer cents (C35), checksum, `__proto__`, newer version, hash mismatch, a locked version that fails its own lock, a broken audit chain, diff, merge conflicts); `workspace/mergeRequests.test.ts` (the six sample request files preview as "Merges 14 requests from 6 files; 2 conflicts to choose" and merge as "Merged 14 requests from 6 files, 2 conflicts": the later revision wins (`revisedAt`, else `updatedAt`, compared as times, R77), a stale copy changes nothing and rows changed on both sides are listed as conflicts; in Leader mode, another org's request with a later revision leaves the store's copy unchanged, a cross-org transfer the Leader approves merges, a request on the Leader's own seat changes no count or conflict, and a CEO pick merges everything); PlanStore (write refused in a reader tab); perf budgets (plan model under 400 ms, forecast under 300 ms, bridge under 300 ms on the sample).
- `cost/`: section 7.8.
- `metrics/` ★: catalog (formula, population, window on every data metric), api, params, privacy and cost rules locked, persist (`hcp:metrics`), recordParamReads per view.
- `access/` ★: store (`hcp:mode` v1), clamp (500-combination idempotence sweep), context (every row in scope), entry (every way into the filters stays inside), route (every mode × route × tab; the as-of date changes only in HR admin, `settings:data`), policy (`request.import` limited for Leader, with its reason), matrix, roleItems (every Needs attention entry in 9.3 routes to `needs` in its mode), visibility (8.4 rules; on the sample's within-unit position move, the org's Leader off the chain and the moving person's manager see the name, Finance sees the limited view, the moving person and their reports see nothing and no count changes, and the Leader sees no comment), leave (`leaveShown`, `leaveFit`), leaks (16.1), tradeLeaks.
- `drill/` ★: records, filterTo, modes, summary, subtitle, tier, related, calc.
- `components/`, `charts/`, `styles/` ★: kpiModel, kpiLayout, readoutModel, filterLabels, DataTable, waterfallModel, typeScale, tierTokens.
- `views/*`: per view metrics (ids equal `ID`, settings read), lineage, kpis (5 to 7 on each `overview` tab of plan, forecast and team; What if's Levers strip has exactly the three `whatif.delta.*` KPIs plus one `requests.trade.ratio` per trade lever; other tab strips (9.4) have no count rule; every KPI has metricId, uses, drill or calc), drill, itemContract, homes figures (every `<Figure>`, `<Hero>`, `<ListFigure>` has `metric={`; every key figure in 9.3 resolves through `tile()` to exactly one tile; hero split parts add up to the hero), scope (homes never show out-of-scope rows), finCostMetrics-style tests (G, B, D metrics hidden in Manager mode; in HRBP and Leader mode every G, B and D metric outside the 7.3(d) allow-list is hidden wherever it is drawn, exports included), team rules (no cost imports in My team).
- `lib/`: sha256 ★ (FIPS vectors from Census; synchronous).
- `lib/export/` ★: csv (with the `showCost` fix), xlsx, names, columns, withheld, money (per mode), lazy (extended), view; new exportHeader, suppressedFlag, longCsv (in HRBP and Leader mode, amount rows only at QTD, YTD and FY for unions of atoms, loaded, USD), controlTotals.
- `help/` ★: content (ids, links, targets, 4 to 6 steps, sentence case, no em dash), access (decisions, hidden names, banned words, ≥ 3 steps per mode), engine, search, store, aboutServer.

---

## 17. Milestones and how each one runs

Each milestone is one Workflow with the same shape, ends with `npm run verify` and a report (what passed,
what failed, what changed, what is left), and then waits for your "next". Nothing is pushed or published
before M4's deploy step, and that waits for your go.

**Shape of every milestone workflow**

1. **Freeze** (one agent, then the lead reviews): write or extend the contracts for the milestone (types,
   function signatures with stub bodies, metric ids, surface and action ids, figure ids) so the tree
   type-checks. Contracts are frozen for the rest of the milestone; a builder that needs a change reports
   it instead of making it.
2. **Build** (parallel, one builder per folder, disjoint files): fill the bodies and their tests. Builders
   run `npx tsc`, `npx biome check` and `npx vitest run <their folder>` only, never a shared dev server;
   a builder who needs the UI runs its own port (8830+) on its own `<name>.localhost` origin.
3. **Review** (independent agents who did not build): recompute every story number from raw rows with
   their own code, check privacy per mode by trying to extract a salary, check the spec section by
   section, and check Census-pattern fidelity. Each finding is verified adversarially before it counts.
4. **Fix** (fixers per verified finding cluster), then **Verify**: `npm run verify` from a clean
   `node_modules/.vite`, plus the milestone's browser checks.

### M1: schema, import, sample, engines with fixtures

| Phase | Agents (folder) | Output |
|---|---|---|
| Freeze | scaffold + contracts | `git init`; package and lock pruned from Census; configs, scripts, brand, verify with the data-file gate; a minimal shell (masthead and a status page listing datasets and the nine story checks) so builds pass; `data/schema.ts` (vocabularies, `Mode`, `MODES` and `isMode`, eight DatasetDefs); `data/idb.ts` signatures (`idbGet`, `idbSet`, `idbDel`, `idbKeys`, `idbClear`), `tabSync.ts` `acquireWriter(): Promise<'writer' \| 'reader'>`, the `PlanStore` interface and `src/testkit/memoryIdb.ts`; `lib/sha256.ts` copied from Census `src/access/overrides/sha256.ts` with its test (synchronous; no `crypto.subtle` anywhere); `charts/types.ts` (`Column`, `Definition`, `ExportMeta`) so the metrics port type-checks; `plan/types.ts`, engine signatures, metric ids |
| Build wave 1 | data core (`src/data/` minus sample; owns `src/testkit/` in M1, the M2 testkit builder owns it after that); engines A (heads, proration, cost, band, fx, versions, close, and `cost/atoms.ts`, whose index `close.ts` stores with each close); engines B (forecast, variance, bridge); engines C (targets, allocation, budget status, trade, chain, requests, cycle, freeze, transfer, whatif, reconcile, audit, workspace, PlanStore; workspace builds file slices only from guarded models, never from `PlanStore`, 5.5); metrics (`src/metrics/` and every engine's `MetricDef`; `metrics/excel.ts` is ported in M2 with `lib/export`); sample base (positions, workers, comp, reqs, targets, freezes, assumptions, requests, personas) | every fixture in sections 6, 10.2 and 11.7 passing: H1 to H4; C1, C2, C2b, C3, C4; X1, X2; F1 to F3; B1; G1 to G3, A1, A2; CH1 to CH5; trade F-S, F-S2, T1, T1′, T1h, T2 to T6, T7a, T7b |
| Build wave 2 | sample versions and stories (Budget and Q1 Reforecast computed and hashed with `sha256()`, so `generateSample()` stays synchronous; closes, each storing its atom index, with the 31 Aug and 30 Sep indexes differing by one partition change (7.3); cycle; the nine stories; raw extracts and the six manager files of kind `'requests'` built by `sample/raw` for Import requests; README) | `sample.test.ts` with every story exact |
| Review | story recount (independent code from raw rows); fixtures and calculations against the spec; data privacy (pay and leave flags, prototype safety, no data files); Census fidelity | verified findings |
| Fix, Verify | fixers; `npm run verify` | M1 report |

### M2: modes, visibility, cost guard, leak tests, homes, read-only views

| Phase | Agents (folder) | Output |
|---|---|---|
| Freeze | access and UX contracts | per-mode tables (`Mode` itself is frozen in M1 in `data/schema.ts`), scopes, `RolePolicy` with `actions`, every surface and action id, figure ids, `CalcSpec`, drill kinds, and the stub modules listed below |
| Build | access (`src/access/`); cost guard (the rest of `src/cost/`, with LP, attack and unions tests); UX port (`drill`, `components`, `charts` incl. Waterfall, `styles`, and `src/lib/export/`: Census's types, columns, clipboard, csv, image, names, withheld, xlsx, modeMeta, definitions, download, view and index, with renames only, plus `metrics/excel.ts`; charts and `lib/export` import each other's types, so one builder owns both); shell (`src/app/`: masthead, Mode and Acting as, version and comparison pickers, filter bar, settings, routing, read-only tag); views read-only (`plan`, `forecast`, `targets`, `finance` read only, `requests` lists, `team`, the three homes, `actions`, `audit`, `data`); testkit and leak tests | every view model under the guard; the policy grid of section 8 (which includes the trade rows) as data; `policy.test.ts` asserts that every surface id named anywhere in sections 8 to 11 has an explicit decision in every mode |
| Review | privacy red team per mode (Manager, HRBP, Leader, Finance) trying to recover a salary, an offer, a leave or Manager C's elimination from every surface and export; story recount through the view models; UI and copy review; browser pass of every home in light, dark and 375 px | verified findings, screenshots |
| Fix, Verify | | M2 report |

M2 freeze stubs, with Census's exported names and signatures, so the ported UX layer type-checks before
builders start:

- `src/help/ui/LearnMore.tsx` (`LearnMoreLink` renders nothing; M4 help fills it).
- `src/views/data/metrics/ui/EditDefinition.tsx` (`DefinitionChangedMark`, `EditDefinitionLink`) and
  `src/views/data/quality-overview/LensLine.tsx` (`QualityLensLine`); the views builder fills them.
- `src/app/datasetFocus.ts` (`openDatasetQuality`); the shell builder fills it.
- `src/views/types.ts` (`ViewTab`).
- The access functions the UX layer calls: `access/lock` `clampFilters`, `access/records` `rowsInScope`
  and the position-in-scope check, `access/numbers` `kpisInMode` and `findingsInMode`, `access/policy`
  `routeShown`.
- `drill/PositionCard` replaces `PersonCard`, so `@/views/org/link` is not ported.
- `src/data/context.tsx` (`AnalyticsContext`, `buildContext`, `AnalyticsProvider`, `useAnalytics`), moved
  here from M1 (review CF-1): the freeze writes its types; the access builder fills `buildContext`
  (scope, clamp, comparison resolution per 9.2) with `context.test.ts`.

### M3: versions, requests, approvals, cycle, freezes, transfers, What if, audit, workspace file

| Phase | Agents (folder) | Output |
|---|---|---|
| Freeze | write-path contracts | actions wired to `decide`, PlanStore writes, audit drafts |
| Build | requests UI (New incl. Trade, Mine, Approvals, Queue, Cycle with the cut line); Working edits (HRBP seat edits with reasons and "Changed by your HRBP"); Finance tabs (versions lock and reopen, month close, assumptions editing under 7.4's edit rule with `cost/assumptionEdits.slow.test.ts`, freezes, reconcile); transfers; What if; audit page; workspace export and import UI (Export Shareable, Export requests, Export for a manager, Open a shared file through the current mode's guard), Import requests; write lock UI | end-to-end flows through the models |
| Review | scenario walkthroughs per persona (draft to started, sent back, approved with changes, freeze exception, cross-unit transfer, cycle to lock, trade with credit, elimination of Manager C's seat); privacy re-crawl including comments, audit, Shareable, Requests and Export for a manager files, and an HRBP Shareable opened in Manager mode acting as Manager C; audit chain and hash checks | verified findings |
| Fix, Verify | | M3 report |

### M4: help, tours, `about-server`, exports, one-file build, browser check, deploy

| Phase | Agents (folder) | Output |
|---|---|---|
| Build | help (articles, tours, glossary, `about-server`); exports (adds `exportHeader`, `suppressedFlag`, `longCsv`, `controlTotals`, the deck's "About these numbers" slide and the load file on top of the M2 port); README and ARCHITECTURE; one-file build (size, opens from `file://`) | |
| Review | copy and banned words; export leak crawl per mode; final spec coverage audit (every spec sentence mapped to code or a reading in section 15); browser pass of every home and the main flows in light, dark and 375 px | verified findings, screenshots |
| Fix, Verify | | M4 report |
| Ship (after your go) | lead | `gh repo create`, first commit staged by path, `npm run deploy`, Pages pointed at `gh-pages`, live check, the URL |

---

## 18. Open questions (answered 13 Oct 2026: "go", every default in bold below)

1. **Name, repo, port**: **"Headcount Planner", `unique-name27/headcount-planner`, 8822** (preview 8823).
2. **Sample company**: **Northgate Semiconductor's shape**, or a new one.
3. **HRBP and Leader cost**: **$0.1M round-down per cost atom (one shared partition, fixed at each month
   close: a director's org or a VP's direct staff), loaded cost at QTD, YTD and FY, LP-tested across two
   closes**, or heads and ratios only.
4. **Proration**: **daily**, half-month or full-month.
5. **Finance precision**: **exact for 5+, from one cost-center fold per unit; under a cost center, legal entity, country or currency
   filter (one at a time, a cost center only if shown), cost is the sum of the unit's shown cost centers with
   that value, folded ones staying in the unit's Other (C5, C15); burden caps, merit and promotion dates, and
   the bonus, merit and promotion percentages set by import, and any other Finance assumption edit refused
   when it moves cost for 1 to 4 costed people in all or in one part of Finance's fold (C14); unsuppressed
   load file from HR admin**; or exact
   under any filter with the wider differencing risk accepted; or Finance edits every assumption in the
   app, with the sweep risk accepted; or Census's $0.1M floor per unit.
6. **What "average" means for trades**: **one company standard head per fiscal year (Design A)**; or each
   org's own average head (B); or time-weighted seat-months (C).
7. **Trade rules**: **whole seats only with the rest kept as trade credit by the giving team until the
   fiscal year closes (optional part-time last seat); managers can start trades in their own tree and see
   standard heads, never amounts; targets stay put and a trade that pushes asks over target goes to the
   leader and Finance; plant story 9**. Alternatives: HRBP and leaders only; trades move targets.
8. **Getting decisions back to managers**: **every mode can export its requests (Export requests) and
   open a Shareable file to read, shown through the current mode's guard and Acting as person (nothing
   merges); HRBP, Leader (for managers in their org) and HR admin send decisions back with Export for a
   manager, a file built as a Shareable made in Manager mode acting as that manager; HR admin keeps Import
   with Replace or Merge; HRBP and above keep Import requests**; or HR admin only, as the spec reads.
