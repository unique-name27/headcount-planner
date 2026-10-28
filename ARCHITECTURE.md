# Headcount Planner: architecture and build contract

This is the contract for everyone who builds Headcount Planner (HCP). The full plan, with every
definition, fixture and decision, is [docs/PLAN.md](docs/PLAN.md); where this file and the plan
differ, the plan wins and this file is fixed. Section numbers below ("PLAN 7.3") point into it, and
PLAN 15 (readings R1 onward, changes C1 onward) overrides earlier plan text. Each milestone's frozen
exports are in `docs/CONTRACTS-M1.md` to `CONTRACTS-M4.md`.

HCP is a client-only browser app for position-based headcount planning: positions, versions, a
planning cycle, requests, approvals, loaded cost, forecast, variance and headcount trades, with a home
for managers, HRBPs, leaders and Finance, and an HR admin mode that owns the data. It is built from
Census, the owner's people analytics app, by copying and adapting its code; Census's own
ARCHITECTURE.md is the model for this file. Census lives in its own repository beside this one on
the owner's computer, and is read-only for HCP builders.

## Principles (PLAN 1, each enforced by a test)

1. **Census is the template, never a dependency.** Copy and adapt; nothing imports it at runtime and
   its name never appears in `src`, `scripts` or the build and config files
   (`src/ship/noCensus.test.ts`; docs may name it).
2. **One number, one engine, one dictionary entry.** Every figure comes from a pure engine function
   with a `MetricDef`. Engines round nothing; only display rounds. Views are thin: every number on
   screen comes from a pure `model(ctx)`, so tests and the leak crawler read what people see.
3. **Counted numbers drill to exactly their rows; modeled numbers open a calculation card** whose
   last step equals the number and whose rows add up to it.
4. **The cost guard runs in the engine** (PLAN 7), before any tile, chart, table, export, workspace
   file, comment or help text reads a number. The UI never decides privacy on its own.
5. **Every surface, action and mode has a decision** in `ROLE_POLICY` (PLAN 8.3), with a one-sentence
   reason on everything hidden or limited.
6. **Synthetic data only in the repo.** `npm run verify` fails if git tracks, or would pick up, a
   `.xlsx`, `.xlsm`, `.xls`, `.csv`, `.tsv` or `.hcplan.json` outside `src/data/sample/`.
7. **Honest architecture.** Modes, Acting as and approvals change what the app shows, not who can see
   the data. Hashes catch damage, not forgery. Real access control needs a server with sign-in.

## Stack and commands

Vite 8 (Rolldown) · React 19.3 with the React Compiler · TypeScript 7 (native `tsc`, no `baseUrl`) ·
Tailwind CSS 4.3 · Observable Plot 0.6 and d3 7 · Zustand 5 · Base UI 1.8 · SheetJS 0.20 (read) ·
ExcelJS 4 (write) · pptxgenjs 4 · idb-keyval 6 · Vitest 5 · Biome 2. No `motion` (CSS keyframes
replace it), no `date-fns`, no Anthropic SDK, no `d3-sankey`. Versions are Census's locked ones
(PLAN 3.2). Install with `npm ci` only; never regenerate the lock, and do not add dependencies.

Run from the project root:

- `npx tsc --noEmit -p .` type-checks (fast; run it often).
- `npx biome check src/<your folder>` lints; fix what it reports in your own files.
- `npx vitest run src/<your folder>` runs your tests (all three projects for those files).
- `npm run build` builds the app; `npm run build:single` builds and checks `headcount-planner.html`.
- `npm run verify` is the whole gate (the lead runs it at the end of each milestone).

**Never `npx vite`.** On Node 24.14 the React Compiler step can crash Node (`0xC0000409`) at random.
Every Vite run starts Node with a larger semi-space; the npm scripts already do. For a private UI
check run:

```
node --max-semi-space-size=64 node_modules/vite/bin/vite.js --port <8830 or above> --strictPort
```

and open it on your own origin, such as `http://<your-name>.localhost:<port>/`, so browser storage
never collides with anyone else's. Stop it when done.

| Port | Who |
|---|---|
| 8820, 8821 | Census (never touch) |
| 8822 | HCP dev server, the lead's only (`.claude/launch.json`, `npm run dev`) |
| 8823 | HCP preview (`npm run preview`) |
| 8830 and up | Builders' private UI checks, `--strictPort` |

Path alias: `@/` is `src/`. The React Compiler is on: do not add `useMemo` or `useCallback` for
render speed; do use `useMemo(() => <key>Model(ctx), [ctx])` around models.

## Layers

Data flows one way, and every reader of a number sits after the guard:

```
imported datasets (data/) + plan state (plan/store)          the sample is generated, never stored
  -> pure engines (plan/engine, cost/, metrics/)             exact numbers, no rounding, no mode
  -> the analytics context (data/context.tsx buildContext)   mode, Acting as scope, clamped filters,
                                                             version and comparison, Working's overlay
  -> view models (views/<key>/engine, <key>Model(ctx))       the cost guard and the person-level
                                                             rules applied, per mode
  -> the screen (views/<key>/ui, app/, drill/, components/, charts/)    render only
  -> exports, workspace files, help (lib/export, views/data/engine/workspace.ts, help/)
                                                             written from the same models
writes: a pure action (plan/actions) -> app/write runAction -> PlanStore.commit -> context rebuilds
```

- `access/` decides per mode: `ROLE_POLICY` and `decide(mode, surface)` (`access/policy/`), the
  Acting as scopes (`access/scopes/`), the person-level rules (`access/visibility.ts`: `requestView`,
  `commentVisible`, `auditView`, `hasAmount`, `managerText`) and `contextAs` (the same data in
  another mode and Acting as; Export for a manager and the leak tests build on it).
- `plan/` and `cost/` never import `access/` at runtime: what the access layer decides reaches the
  engines and actions as plain data and functions (`ActionContext.decide`, `PersonRules`).
- A model is cached per context (`WeakMap<AnalyticsContext, Model>`), so a write that rebuilds the
  context re-renders every model from the new plan state.

## Folder ownership (PLAN 4)

```
src/
  main.tsx      entry (mounts into #root)
  app/          shell: brand.ts, storageKeys.ts, masthead, folder tabs, view header, filter bar,
                pickers (Mode, Acting as, version, comparison), settings, address, ExportMenu and the
                whole-view export, boot.ts and planState.ts (the store and the sample's overlay)
  app/write/    the write path's app side: action context, routing on the guarded asks, lock
                content, runAction, usePlanWrite, WriteBlocked, the scenario harness
  data/         schema.ts, idb.ts, store.ts, tabSync.ts (+ writer lock), fiscal.ts, scope.ts,
                urlScope.ts, context.tsx, settings.ts, savedViews.ts, import/, lists/, quality/
  data/sample/  the deterministic Northgate generator, raw/ extracts, README.md, sample tests
  plan/         the planning domain: types.ts, engine/ (pure), actions/ (the write path, pure),
                store/ (PlanStore, the only impure part), workspace/ (.hcplan.json), audit/ (hash chain)
  cost/         the cost guard: guard, atoms, fold, differences, fit, edits, LP testkit and guard tests
  lib/          pure helpers: dates, format, stats, timing, testBudget, costRounding (template
                code), sha256 (synchronous), export/ (owned with charts/)
  metrics/      the metric dictionary machinery, costGuard rules (locked), catalog.ts
  access/       modes, copy, pay, leave, surfaces, ids, matrix, policy/, scopes/, visibility.ts,
                contextAs.ts, the leak tests and their snapshots
  drill/  components/  charts/  styles/   the UX layer (Census's, plus PositionCard, CalcCard,
                Waterfall, Bullet)
  views/        home/ team/ plan/ requests/ forecast/ targets/ whatif/ finance/ actions/ audit/ data/
  help/         articles/, tours, glossary (from the catalog), search, the help store and ui/
  testkit/      memoryIdb.ts, memoryStorage.ts, sample contexts per mode, the leak crawler, the leak
                scanner, move rules, counts.ts (the plain-count scan)
  ship/         repository rules: noCensus, brand, imports, trackedFiles, deployPages, devServer,
                storageKeys, oneFile, docs
scripts/        brand, trackedFiles, verify, copy-single, oneFile, check-single, pagesFiles,
                deploy-pages, devServer (+ .d.mts types for the ones tests import)
```

Each milestone freezes its contracts (types and signatures with stub bodies) first; then one
builder owns each folder (or, where folders meet, each file), so no two builders edit the same
file. A builder who needs a frozen contract changed reports it instead of changing it. Stay inside
the files your phase owns.

**Dependency rules** (a deny-list in `src/ship/imports.test.ts`; it covers folders as they appear):

- `plan/` and `cost/` import only `data/schema`, `data/fiscal`, `data/scope` (types only), `lib/`,
  each other and `app/brand` (plain constants). Never `access/` at runtime, nor `views/`, `app/`,
  `drill/`, `components/` or `charts/`. `plan/store/` may also import `data/idb` and `data/tabSync`;
  `cost/` may `import type` from `access/scopes/types`.
- `Mode`, `MODES` and `isMode` live in `data/schema.ts`; `access/modes.ts` re-exports them.
- A view imports another view only through its `engine/` or `metrics.ts`, never its `index.tsx`
  or `ui/`; `access/policy/` never imports the view registry.
- `exceljs`, `pptxgenjs` and `xlsx` load only through `import()` (type imports are fine), and app
  code never imports the `@/lib/export` barrel statically (single modules such as
  `@/lib/export/csv` are fine).
- `src/data/idb.ts` is the only importer of `idb-keyval`; tests mock `@/data/idb` with
  `src/testkit/memoryIdb.ts`.
- `plan/audit/` hashes, appends and verifies only; redaction for a viewer is
  `access/visibility.ts#auditView` alone.

## Names, storage and the write lock

`src/app/brand.ts` holds every name: `APP_NAME`, `APP_SLUG`, `ONE_FILE`, `STORAGE_PREFIX = 'hcp:'`,
`IDB_DB` and `IDB_STORE` (`createStore('headcount-planner', 'kv')`), `TAB_CHANNEL`, `WRITER_LOCK =
'hcp:writer'`, `HISTORY_MARK = 'hcp'`, `DOM_IDS` (`hcp-main`, `hcp-view`, `hcp-view-body`) and
`FILE_PREFIX`. `scripts/brand.mjs` repeats the three names the scripts need; a test keeps them equal.
CSS classes use the `hcp-` prefix (`hcp-plot`, `data-hcp-offscreen`).

Storage keys are written as literals (`'hcp:mode'`, `` `hcp:dataset:${key}` ``) and each is listed in
`src/app/storageKeys.ts` with where it lives and what it holds; `src/ship/storageKeys.test.ts` scans
the source and fails on an unlisted one. PLAN 5.4 lists them, and the M4 review added
`hcp:plan-aside:<baseline id>` (B9): IndexedDB `hcp:dataset:<k>`, `hcp:versions:<k>`,
`hcp:raw:<k>:<versionId>`, `hcp:profile:<k>:<fp>`, `hcp:plan`, `hcp:plan-aside:<baseline id>`,
`hcp:audit:<chunk>`; localStorage `hcp:settings`, `hcp:filters`, `hcp:views`, `hcp:lists`,
`hcp:metrics`, `hcp:mode`, `hcp:help`, `hcp:actions`; nothing in sessionStorage. "Show pay amounts"
is memory only, and What if's levers are session memory.

The sample is regenerated on every load and never stored; plan state made on it is an overlay at
`hcp:plan` against the sample's baseline id: `northgate-` and 12 hex digits of a SHA-256 over the
canonical JSON of every dataset, the rows the app shows for the four raw datasets (each extract's
planted rows, `PLANTED` in `src/data/sample/raw/planted.ts`, by their hashes; M4 recheck B9-b) and
the seeded plan state, locked versions and closes by their hashes (`sampleBaselineId`,
`src/data/sample/generate.ts`). A stored state whose baseline id differs (one
made on an earlier build of the sample) is never laid over this sample: `src/app/planState.ts` sets
it aside (`setAsideOf`) with `SAMPLE_CHANGED_NOTICE`, the first write on the new sample keeps it with
its audit log at `hcp:plan-aside:<its baseline id>` (`keepAside`, one copy per earlier sample) and
starts the new sample's log afresh, and Data room > Workspace saves it as a Full file
(`earlierSampleFile`, with no datasets) or removes the copy (`clearAside`). Replace and Merge take a
Full file with no datasets only where its plan state's baseline id is the workspace's
(`fileBaselineRefusal`, `src/plan/actions/workspace.ts`; M4 recheck B9-a): the earlier sample's
file says "This file was made on an earlier sample, so its changes stay in the file." in the
import preview and in the action alike (`EARLIER_SAMPLE_FILE_TEXT`).

One tab writes: `tabSync.ts` holds the Web Lock `hcp:writer` for the page's life (a BroadcastChannel
heartbeat where Web Locks are missing). Every `PlanStore` write and dataset replace refuses in a
reader tab, and the masthead says "Read only: Headcount Planner is open in another tab." Exports and
the load file still work in a reader tab. Every hash (version locks, the audit chain, workspace
checksums) uses `src/lib/sha256.ts`, which is synchronous; nothing uses `crypto.subtle`.

## Data and plan state (PLAN 5 and 6)

Plan positions, not people. Eight imported datasets in Census's `DatasetDef` shape (positions,
workers, comp, reqs, requests, targets, freezes, assumptions), and plan state in the `PlanStore`
(versions and their locked lines, month closes, Working's overlay, requests, cycles, trades,
freezes, targets, comments and the audit log).
Dates are ISO strings; the fiscal year runs April to March (`src/data/fiscal.ts`). A person's last
day is inclusive.

Engines in `src/plan/engine/` are pure: plain data plus an explicit `asOf` (never `Date.now()`), exact
numbers, money summed in a fixed order, tests to the cent (`toBeCloseTo(x, 2)` or integer cents).
Every worked example in the plan is a fixture with exact asserts (PLAN 16.1). Locked lines are never
recomputed; a lock's hash covers its lines, assumptions, rates, proration and the engine version.

- **One line source** (`src/plan/lineSource.ts`, C33): Working's months through the last close are
  the closes' lines, its later months its own. A back-dated HRIS change posts as an adjustment in
  the first open month (PLAN 6.6, M4 review SA-2): `adjustmentLines` makes each one a line of its
  own in its `postedIn` month (basis `hris`, heads 0, FTE 0, the seat's `positionId`, so it folds with
  its cost center and atom). Plan, Targets, routing, the forecast (`withAdjustments`) and the bridge's
  timing step read them; C33 (d) still lists and counts adjustments at company level only.
- **Actual heads** are the active HRIS employees. People with no position count on the "Not in
  plan" row of Plan > Overview's Heads by unit (`NOT_IN_PLAN`), never in a unit's row or a
  position's cost.
- **Average FTE is daily**: under a non-daily proration, Working and forecast lines carry a daily
  active fraction (`PlanLine.activeDaily`) that the forecast's FTE reads; a locked comparison reads
  its own stored lines (R20).
- **The bridge** (PLAN 6.8, `plan/engine/bridge.ts`): Mix moves for a level or location change as
  well as FTE (`mixOf`: a seat at band estimate on both sides carries the comparison's rates re-keyed
  to its new level and location); a Filled seat's level change stays in Pay rate. A band seat moved
  to a site in another currency stays one seat (M4 recheck SA-3-a): its forecast side carries
  `planRates`, the comparison's plan rates for its new currency, so the move is Mix, never Timing or
  Position changes, and only the swap to actual and forecast rates is FX. HR admin with the switch
  on folds no step (`views/forecast/engine/bridge.ts` `foldedOf`), its cards say so
  (`OPEN_STEP_CARD_NOTE`), and a step made only of band estimates shows no count, as in the guarded
  modes.

## The cost guard (PLAN 7, read it whole before touching any amount)

Pay views per mode (`PAY_OF`): HR admin `switch` (switch off: Finance's rules; on: per-person
amounts and exact totals with no minimum, nothing folded, PLAN 7.5), Finance `exact` (5 or more costed people, one cost-center fold per unit), HRBP and Leader
`rounded` ($0.1M round-down per cost atom, `sumRounded`, periods `fy`, `ytd` and `qtd` only), Manager
`none` (no amounts anywhere: heads, standard heads and status words). The rules in PLAN 7.2 hold in
every mode:

1. **The minimum**: every cost amount needs 5 or more costed people (read from the locked
   `cost.guard.minCosted`, never a constant), else "—" with its reason; a component split needs 5 or
   more contributing positions in every component of the cell, else the cell shows loaded cost only.
2. **Folds**: groups under the minimum fold into "Other (k)" (Census's `foldGroups`, verbatim);
   Finance's coarser rows are sums of its one cost-center fold.
3. **Band apart**: Open and Planned seats at band estimate are a separate part, so no seat edit,
   pending request, trade quote or What if lever moves a filled part.
4. **Nothing per position** tied to a Filled seat, an accepted offer or a request's person.
5. **Differences** need 5 or more contributors (costed positions whose amount differs), counted at
   leave-neutral prices; a difference in band estimates only is a band figure.
6. **No amount in text**: Action items, toasts, findings and notices; comments by audience.
7. **Exports and files carry exactly what the screen shows**, through the same model output.
8. **Comparisons** (out of plan, the cycle's envelope, over-target flags) read the guarded rounded
   asks cost, never an exact HRIS sum.

`src/cost/` and the engines' model builders apply them; `src/lib/costRounding.ts` is the rounding.
The person-level rules of PLAN 8.4 (`access/visibility.ts`) sit beside the guard: who sees a request
in full, limited or not at all (the person in a touched seat and their tree never see it), comment
audiences, audit redaction, and amounts in free text read as "an amount" in Manager mode (position
titles, job families and req recruiters too, read through `managerText` where `data/context.tsx`
builds them, and every text of an opened file's figures, `openSharedFile`). Every
engine that lists or counts requests, comments, audit rows or notifications applies them, and so
does every workspace file exported, opened or merged.

**Never weaken a privacy, leak, attack or perf test.** When one fails, fix the model or the guard.

## The write path (PLAN 10, docs/CONTRACTS-M3.md)

Every change a person makes is one pure action in `src/plan/actions/`,
`(state, ctx, input) => ActionResult` (42 actions, by name in `ACTIONS`, with the policy ids each
one checks in `ACTION_CHECKS`):

1. **The gate** (`gate.ts`): a reader tab refuses first ("Read only"), then an Acting as block, then
   `ctx.decide('action:<id>')` (hidden refuses with the policy's own reason), then the person-level
   rules, then the action's own rules. Free text with an amount is refused at entry wherever a
   manager can read it (`freeTextRefusal`); a comment with one goes to Approvers only.
2. **The result**: the next plan state, the audit drafts (`by` is the Acting as person) and a plain
   notice with no amount, or one refusal sentence. Nothing is written on a refusal.
3. **The context** (`src/app/write/context.ts` `actionContextOf`): the business date is the as-of
   date with the wall clock's time of day (R47), while the audit entry's own `at` stays the wall
   clock; routing reads the org's guarded asks without what rule 3 hides from the requester
   (`write/routing.ts`); trades are quoted at the pricing version's rates (`write/quote.ts`).
4. **Saving** (`write/run.ts` `runAction`): `PlanStore.commit(next, audit)` saves the state and
   appends its entries as one write, all or nothing (BrowserStore keeps a journal in `hcp:plan`).
   The audit log is a SHA-256 hash chain (`plan/audit/chain.ts`); `verifyChain(entries, head)` finds
   a changed entry or a lost tail. Then the context rebuilds and every model re-renders.
5. **In the UI**, `usePlanWrite()` runs actions and `WriteBlocked` says why a control is off. Tests
   walk the same path with `write/harness.ts` (a MemoryStore and a ticking clock, each step acted by
   its own person) and check the chain afterwards.

Request IDs are `R-<tag>-<n>`, unique across browsers under a per-workspace tag and secret (R74).
Expiry is derived at read time through one helper, never stored (R73). An approval that arrives in an
imported file applies its effects here through the same engine, or is a conflict that says why (R76).

## Workspace files (PLAN 5.5, C35, R70 to R78)

`.hcplan.json` files: `{ format: 'hcplan', version: 1, kind, notice?, modeLine?, savedAt, app, mode,
scopeLabel, scopeKey?, actingAs, checksum, body }`, the checksum a SHA-256 over canonical JSON of the
body. `notice` is the Full file's "Contains individual pay"; `modeLine` is the Manager line of every
file whose mode is `manager`; both are written first, outside the checksum.

| Kind | Who makes it | What it holds |
|---|---|---|
| Shareable | every mode | only what the exporting mode and Acting as person see, already guarded: requests by `requestView`, comments by `commentVisible`, audit rows by `auditView`, locked versions by reference only, no pay, leave or line tables. HR admin's is always written as with "Show pay amounts" off (Finance's rules, PLAN 7.5), whatever the switch says, and the save dialog says so |
| Requests (Export requests) | every mode | requests whose view is 'full' for the exporter, with steps and visible comments; no amounts from Manager mode |
| Export for a manager | HRBP, Leader (their org), HR admin | a Shareable built in Manager mode acting as that manager (`contextAs`), with that manager's `managerExportLine` as its `modeLine` |
| Full | HR admin with "Show pay amounts" on | everything, first line "Contains individual pay"; locked line tables by column, amounts as integer cents (C35); the ID secret |

- `src/plan/workspace/`: `file.ts` builds and writes files; `validate.ts` reads them with
  hand-written validators (known keys only, `__proto__`, `constructor` and `prototype` refused),
  refuses a bad checksum, a newer version, a foreign format, a locked version whose hash differs or
  that fails its own lock, a broken audit chain, and a file over 25 MB (150 MB for a Full file);
  `diff.ts` previews an import; `merge.ts` merges by request ID in revision order (`revisedAt`, else
  `updatedAt`, compared as times, R77), lists clashes and diverged copies as conflicts, and never
  takes a decided copy back; `shared.ts` keys a file to the scope it was made for.
- `src/views/data/engine/workspace.ts` writes every file but Full from the guarded models, never from
  the store, and opens a shared file through the current mode and Acting as person, never the mode
  it was made in. Replace (from a Full file whose chain verifies) takes the file's audit log; Merge
  keeps this workspace's.
- **Individual pay leaves only in a Full file** (D-PAYFILES). With the switch on, HR admin's
  Shareable is built from the same screen's context with the switch off (`shareableBaseOf`: the
  filters, pickers, as-of date and Acting as pick kept, unlike `contextAs`), so it is byte-equal to
  the switch-off file, and the save says so (`SHAREABLE_PAY_OFF_TEXT`); `file.ts` refuses a models
  column flagged `pay` in any other file.
- **The mode line** (D-MODELINE, CP-2): `fileModeLine` writes `managerExportLine` for the acting
  manager on a manager's own Shareable and Requests files and on every Export for a manager, and
  "Made in Manager mode." for a name the reader would refuse. `buildWorkspaceFile` refuses a
  `modeLine` on any other mode, and `validate.ts` reads it back only as that line
  (`managerModeLine`), on a manager file, with no amount.

## Views (PLAN 9)

Folder tabs in this order: `home` Home, `team` My team, `plan` Plan, `requests` Requests, `forecast`
Forecast, `targets` Targets, `whatif` What if, `finance` Finance. Masthead pages: `data` (Data room),
`actions` (Action center), `audit` (Audit). The address uses Census's grammar, with `ver` and `vs`
pickers: `#plan.positions?period=fy&bu=Silicon+Engineering&ver=fy27-working&vs=fy27-budget`.

Each view folder follows Census:

```
views/<key>/index.tsx, metrics.ts,
           engine/{index,base,settings,lineage,kpis,findings,actions,drill,drillUses,wording,fixtures}.ts,
           ui/{model.ts, <Tab>.tsx}
```

`engine/index.ts` exposes `<key>Model(ctx)` cached in a `WeakMap<AnalyticsContext, Model>`;
`ui/model.ts` is `useMemo(() => <key>Model(ctx), [ctx])`. Components render the model and compute
nothing. Each `overview` tab of plan, forecast and team has 5 to 7 KPIs, then the Readout (span 4)
beside the lead figure (span 8). What if has one tab, `levers`, with exactly three result KPIs plus
one trade ratio per trade lever, and no Readout. Every KPI on a tab or home has `metricId`, `uses`
and a `drill` or `calc`; every `<Figure>`, `<Hero>` and `<ListFigure>` has `metric=`.

Plan > Hiring (PLAN 9.7, changes C36 and C37; docs/CONTRACTS-HIRING.md) is heads only in every mode and has
a model of its own, not a `PlanModel` field, since it reads the forecast and the plan model's budget
must not carry a forecast run: `views/plan/engine/hiringTab.ts` `planHiringModel(ctx)` (cached per
context) builds it from the pure engine `plan/engine/hiring.ts` `hiringOf` over the context's input
(`hiringData.ts` `hiringPrepOf`: dates, IDs and head counts only, `HIRING_INPUT_KEYS`), with its
cards, findings and records in `hiringModel.ts` and `hiringDrills.ts` (every drill hides
`HIRING_DRILL_HIDE`, from its rows as well as its columns). `views/tabModels.ts` `TAB_MODELS` is the
one map of tabs with a model of their own; the Shareable file and the leak crawl read it. Expected
exits come from the Working forecast: the Forecast view's own run, without the plan rows of
requests 8.4 rule 3 hides from the viewer, and in Manager mode a run with the tree's seats in a
cohort of their own (`ForecastInput.ownCohort`, `forecastRunOf`'s `ownCohort` option, one run per
seat set and only the last 4 kept, since each is a full run), so no last day at or above the manager's seat, or of a peer outside the tree, moves the
tree's modeled exits. Known exits read each assignment clipped at an approved Elimination's last
day, in the tab and in the Forecast view's flows alike (`forecast/engine/heads.ts` `exitDaysOf`).
The HRBP and Leader homes and My team re-link the tab's Open to hire tile by metric id. Since C37
the engine's input holds signed offers (`offers`, S(q)'s future starts) and moves into the scope
(`moves`, M(q)) apart, and the forecast months it reads carry modeled exits only, so no forecast
start can reach the tab; the hires of the last 3 closed months by department and location
(`plan-hiring-recent`) are built in `hiringModel.ts` from the same hires as the velocity chart.

Plan > Recruiting summary (PLAN 9.8, change C38; docs/CONTRACTS-HIRING.md section 6) is a second model
on Plan > Hiring's reading: `views/plan/engine/recruitingTab.ts` `planRecruitingModel(ctx)` (cached per
context, under `plan.recruiting` in `TAB_MODELS`) builds it in `recruitingModel.ts` from `hiringBuiltOf`
(shared by both tabs) and Plan > Hiring's own cards, with projected starts from the same forecast run
(`hiringData.ts` `projectedStartsOf`) and three rare terms of projected heads (a last day on the as-of
date, a signed offer past its start date, a pre-hire, `HiringPrep.preHires`) that never reach Plan >
Hiring's engine; the chart is `ui/RecruitingMonthsChart.tsx`, its month labels `ui/monthTicks.ts`
(shared with Plan > Hiring's velocity chart). Its deck is one summary slide (`RegisteredFigure.deckSummary`,
`lib/export/view.ts` `deckEntries`), and a tab's own files are written by `app/tabExport.ts`
`tabExportOptions` (the Export menu and the leak crawl alike), which leaves the long CSV's control totals
off the heads-only tabs (`HEADS_ONLY_TABS`).

Forecast accuracy (`forecast.accuracy.heads` and `forecast.accuracy.cost`, R14, M4 review SA-1) has
one engine, `views/finance/engine/accuracy.ts` `forecastAccuracyOf`: the fiscal year's latest locked
reforecast against the months closed since its `closedThrough`, 1 − |forecast − actual| ÷ actual
over those months (the pure arithmetic is `plan/engine/accuracy.ts` `accuracyOf`). It is the
company's, since a reforecast stores the company's forecast, so under a filter or a scope it reads
"—" with `ACCURACY_COMPANY_NOTE`. Forecast > Variance shows heads in every mode with that tab and
cost (guard class G) in Finance and HR admin; Finance > Versions shows the cost.

## Metric conventions (PLAN 12)

Census's dictionary machinery, unchanged: `MetricDef { id, name, views, definition, formula,
population, window, unit, goodDirection, uses, params, dependsOn?, owner, locked?, kind? }`,
registered per view with `defineMetrics('<view>', [...])` in `views/<key>/metrics.ts` and assembled in
`src/metrics/catalog.ts`. Ids look like `view.group.name`; the prefix is the home view (`views[0]`) or
a shared prefix (`privacy`, `quality`, `cost`). Every metric that reads data has `formula`,
`population` and `window`. Engines read settings only through `ctx.metrics`, which reads each
definition in the mode's own words (`metricsInMode`, `src/metrics/modeWording.ts`; M4 recheck
HL-8-a): tiles, figures, cards, Settings > Formulas and the glossary share one wording source,
`METRIC_WORDING`, and Settings > Formulas lists a metric as the glossary does (`formulaRowShown`).
Forecast drivers
(attrition, fill rate, time to fill, backfill) are assumptions data, not metric settings, because they
lock with versions. The glossary in Help is generated from the catalog, so a definition lives once.

## Exports and help (PLAN 14)

- `src/lib/export/` writes figure CSV, Excel and copy, the whole-view workbook, the 16:9 deck, the
  long CSV and the FP&A load file. One header source (`exportHeader.ts` `headerFacts`) feeds the
  workbook Summary, each sheet's title block, the CSV preamble, the deck's "About these numbers"
  slide and image footers. Manager's header states all nine facts, rates, cost definition and
  rounding as amount-free words (`MANAGER_FACTS`). Amount columns are numbers, never words; a
  withheld cell is empty with `Suppressed` and `Why` beside it, in every format, slides included.
  `pay`, `cost` and `band` columns drop per mode in every format. Free-text columns pass
  `commentVisible` and, in Manager outputs, `managerText`.
- **Every output names its mode** (`modeMeta.ts`): "Made in HRBP mode for Silicon Engineering.",
  "Made in Leader mode for the whole company." (acting as the CEO, CFO or CHRO), "Made in Finance
  mode.", Manager's `managerExportLine`, and HR admin's `hrAdminExportLine`: "Made in HR admin
  mode.", or "Made in HR admin mode with pay amounts shown." with the switch on.
- **Individual pay is labeled.** Every output made with "Show pay amounts" on (`madeWithPay`, keyed on
  the switch, not on a pay column) starts with `INDIVIDUAL_PAY_LINE`, "Contains individual pay":
  figure CSV, Excel, the clipboard, the whole-view workbook and deck, the long CSV, both load files
  and image footers. The load file at Finance's rules keeps the rows and facts it is written with the
  switch off, and, made with the switch on, starts with that line and HR admin's switch-on mode line,
  as Finance > Export's own figures of its rows do (M4 recheck D-PAYFILES-a). Only the Shareable is
  written as with the switch off and says nothing of it. `src/access/headers.slow.test.ts` crawls
  every written output per mode for both lines.
- The long CSV and the load file are built from the same guarded model as the screen
  (`views/finance/engine/longCsv.ts`, `loadFile.ts`, one text writer `longFileText`); control totals
  are computed from the exported rows, and in rounded modes from the screen's `sumRounded` total. In
  Finance (and HR admin with the switch off) the rows are loaded cost per cost center, and the
  control totals add USD by component for each unit and the company in the periods where the screen
  shows that split (C33 (b), `componentTotalLines`, built only from the guard's own figures):
  preamble lines, never rows, so each row keeps one grain, written in whole cents that add to the
  loaded total (`componentCents` over `centsAddingTo`, largest remainder, which the open file's split
  lines use too; M4 recheck SB-1-a). Finance > Export shows them
  as "Control totals by component". HR admin's switch-on file splits every row by component, and
  its control totals add the split for the file's scope and each unit from those rows
  (`src/lib/export/controlTotals.ts`, `ControlTotal.components`). A cell's GL account resolves
  through the version's assumptions at the cell's org: the department, then the unit, then the
  company (`accountsOf`).
- `src/help/`: articles and tours are TypeScript data whose conditions name surfaces, never modes
  (`articles/when.ts`), so a mode never reads about something it hides; `HELP_GRID` decides each
  article and tour in every mode. The glossary is the catalog's, read per mode
  (`glossaryEntryInMode`): an entry is worded for the mode (`GLOSSARY_WORDING`), placed on a page the
  mode shows, or left out when it still names something hidden. Release-note items carry conditions
  too (`releaseNotesIn`). `about-server` ("Why there is no sign-in") shows in every mode and is the
  only article exempt from the banned-words scan.

## Design

Census's design language, unchanged: tokens in `src/styles/tokens.css` (light, then dark under the
OS preference guarded by `:root:not([data-theme="light"])`, then `:root[data-theme="dark"]`), mapped
to Tailwind utilities in `src/styles/index.css`. Never raw palette colors or literal hex in
components. One type scale (`text-label` 11, `text-meta` 12, `text-small` 13, `text-body` 14,
`text-title` 16, `text-section` 20, `text-page-title` 28, `text-display` 40, `text-hero` 48); the
wordmark's `text-[18px]` is the one arbitrary size (`typeScale.test.ts`). Radii `rounded-sheet`,
`-control`, `-chip`, `-mark` only. Sheets have no shadow and no border; the masthead band is graphite in
both themes. Archivo and JetBrains Mono are bundled from fontsource; no font request leaves the
browser.

Motion is CSS only (PLAN 3.2): `.view-enter` fades a view or tab in, `.mark-seat` pulses the mark while
data loads, and `[data-hcp-offscreen]` turns animation off on the export stage. The reduced-motion
rules (OS setting and `data-motion="reduce"`) cover all three. Every home must work in light, dark and
at 375 px with no horizontal scroll.

## Copy (PLAN 14.3)

Plain English, sentence case for every label, title and button; no "!", no emoji, no em dash between
words ("—" is only the missing-value placeholder); en dashes in ranges; no nagging verbs (chase, nag,
ping, hound, remind, unblock). Mode copy never uses access, permission, restricted, secure, locked
down, authorized or role-based access (except in the `about-server` article); say "approved heads",
"equity (SBC)", "Hiring is frozen". Help never says "leave", "leaves" or "leaving" to Manager or
Finance mode (articles, tours and release notes). Never describe a hash or checksum as proof against tampering, in
any spelling (`BANNED_HASH_WORDS`, scanned everywhere including the README); say it catches damage,
not forgery.

## Tests (PLAN 16)

- Vitest in the `node` environment. Tests are `*.test.ts`: a `.test.tsx` never runs. Render React
  with `createElement` and `renderToStaticMarkup`. `testTimeout` is 30 s; a test whose work is
  known to be long sets its own timeout rather than raising the default.
- Three projects (`vite.config.ts`): `unit` (parallel), `slow` (`*.slow.test.ts`, one file at a time:
  LP, attack, unions, edit sweeps, crawls and the whole-sample Excel round trip) and `perf`
  (`*.perf.test.ts`, one file at a time after the others, `bestCostMs` from `src/lib/testBudget.ts`
  with fresh contexts). `unit` and `slow` run at the same time; `npx vitest run --project perf` runs
  only the budgets.
- Every sample-based test shares one generated sample per file in `beforeAll`.
- Tests mock IndexedDB through `vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))`, never
  `idb-keyval` directly, and stub `localStorage` with a memory class through `vi.stubGlobal`.
- **Fixtures**: every worked example in PLAN 6, 10.2 and 11.7 is an engine test with exact asserts,
  and `drill/calc.test.ts` turns each into a calculation card whose last step is the value.
- **Stories**: `src/data/sample/sample.test.ts` asserts the nine stories exactly, and
  `raw/stories.test.ts` the same on the messy extracts.
- **Leaks**: `src/testkit/crawl.ts` collects every string and number a mode can reach (models,
  KPIs, drills, cards, homes, help, exports as written bytes, workspace files, comments, audit rows),
  with an HR admin control that must differ; the `src/access/leaks.*.slow.test.ts` files perturb one
  salary, offer, leave or request at a time and compare crawls. `src/cost/` holds the LP, unions,
  differences and edit-invariance tests.
- **Policy**: `access/policy/policy.test.ts` asserts a decision for every surface, action and mode;
  `access/matrix.test.ts` snapshots the grid and every reason to `access-matrix.txt` and
  `access-how.txt`.
- **Write path**: scenario tests (`*.scenario.test.ts`) walk each flow through the harness, one person
  a step, and check the audit chain.
- **Repository rules** live in `src/ship/`: the name scan, brand agreement, the import deny-list, the
  data-file gate, the deploy file list and a sandboxed run of the deploy script, the dev server's deny
  list, storage keys, the one-file check (`oneFile.test.ts`) and the docs (`docs.test.ts`: this file
  names every source folder and the README's story numbers match the sample).

## The one-file build and ship (PLAN 3.3, 3.4)

- `npm run build:single` builds `dist-single/index.html` in `--mode single` (vite-plugin-singlefile,
  `base: './'`, every asset inlined as a `data:` URL, no code splitting) and copies it to
  `headcount-planner.html`. The page must open from `file://` with no network request and weigh at
  most 6,000,000 bytes (`ONE_FILE_BUDGET` in `scripts/oneFile.mjs`). `scripts/check-single.mjs`
  reads the built page as the browser's HTML parser does and fails on an external script or
  stylesheet, a `url()` or `@import` that is not a `data:` URL, a dynamic `import()`, a worker, a
  written address, a stray tag (a script that ended early) or a page over budget. Verify's one-file
  step runs it; `copy-single.mjs` and `deploy-pages.mjs` refuse a page that fails it.
- The repository started with `git init -b main`. Commit only when the lead says so, staging paths
  by name (`git add package.json package-lock.json src scripts docs …`), never `git add -A` or
  `git add .`. Nothing is pushed or published before M4's deploy step and the owner's go.
- `headcount-planner.html` is git-ignored; `npm run deploy` builds and checks it, then force-pushes
  `index.html`, `headcount-planner.html` and `.nojekyll` to `gh-pages`, staged by name in a
  throwaway repository. It refuses without a commit, an `origin` remote or a build that passes the
  check.
- `.gitattributes` keeps LF everywhere (snapshot files must not flip to CRLF on Windows); `.bat`
  files keep CRLF for `cmd.exe`.
- The dev server refuses Vite's secret files and `*.hcplan.json` (`scripts/devServer.mjs`);
  `vite.config.ts` must keep `server: { fs: { deny: DEV_SERVER_DENY } }` exactly (a test greps it).

## Census quirks not copied (PLAN 1.1)

`isActiveAt` treating the last day as inactive; Finance rounding to $0.1M; `showCostIn` refusing every
scoped mode; the default idb-keyval database; `git add -A` in the deploy script; the CSV export that
drops cost columns; "under $0.1M" written as text into numeric export cells; committing the 8 MB
one-file build; telling builders to run `npx vite`.
