# M4 contracts (frozen 24 Oct 2026)

The contracts for milestone M4 (docs/PLAN.md 17, "Freeze"): help, tours and `about-server` (PLAN
14.2), the four new export modules, the deck's "About these numbers" slide and the FP&A load file
(PLAN 14.1), the one-file build, the docs and the three M3 known gaps M4 takes (docs/M3-REPORT.md,
"Known gaps carried to M4", items 5, 6 and 9). Readings and changes in PLAN 15 (R1 to R91, C1 to
C35) override earlier PLAN text wherever they differ.

Builders fill bodies behind these contracts and never rename or retype an export; a builder who
needs a change reports it to the lead (`needsElsewhere`). New exports may be added, and interfaces
may gain fields. Every stub throws `notBuilt('<file>.<function>')` (src/plan/notBuilt.ts); stub
parameters carry a leading `_`; stub components render nothing. Data (id lists, the help decisions,
the shared conditions, the long CSV columns and reasons, the header labels, the copy constants) is
written in full and is frozen like a signature.

The freeze adds 56 `notBuilt` stubs and 7 components that render nothing, beside M2's `LearnMoreLink`
(section 6). No existing export was renamed; one M3 type was retyped as its comment said M4 would
(`FinanceExport`, 1.5), and three existing interfaces gained optional fields (1.4).

## 1. Frozen files and their exports

### 1.1 Help ids and decisions (`src/access/`)

| File | Exports |
|---|---|
| `ids.ts` | Data: `HELP_ARTICLE_IDS` (40 ids, Help sheet order), `HelpArticleId`, `HELP_TOUR_IDS` (12 ids), `HelpTourId`, `HELP_SURFACES` (`help:article:<id>`, `help:tour:<id>`), now part of `NAMED_SURFACES` (so `policy.test.ts` asserts an explicit decision for each in every mode), and `HELP_GRID` (one letter per mode in `MODES` order, section 1.2) |
| `policy/help.ts` (new, built) | `HelpSpec` (mode, views, tabs), `articlesFor(spec)`, `toursFor(spec)`: the decisions every table now carries in `articles` and `tours` (`manager.ts`, `hrbp.ts`, `leader.ts`, `finance.ts`, `admin.ts`; `admin.ts` names its tab table `adminTabs`). Written against the table's own views and tabs and the mode's pay and leave views, so a view's article and tour move with the view |
| `__snapshots__/access-matrix.txt`, `access-how.txt` | Regenerated: +52 rows (every help surface) and +87 sentences; no existing line changed |

### 1.2 The help decisions (Manager, HRBP, Leader, Finance, HR admin)

| Ids | Letters | Reason on L or H |
|---|---|---|
| `what-headcount-planner-is`, `moving-around`, `reading-a-number`, `clicking-down`, `exporting`, `modes`, `view-actions`, `data-workspace-file`, `data-versions`, `trading-heads`, `privacy-browser`, `about-server`, `privacy-small-groups`, `privacy-sample`, `shortcuts`, `report-problem`, `troubleshooting`, `faq`, `whats-new` | SSSSS | |
| `view-<key>` for the eight views | the view's letter, L read as S: `view-home` HSSSH, `view-team` SHHHH, `view-plan` SSSSS, `view-requests` SSSSS, `view-forecast` HSSSS, `view-targets` HSSSS, `view-whatif` HSSSS, `view-finance` HSHSS | "Its view is not shown in <mode> mode." (`view-team`: "My team is the Manager mode home.") |
| `view-data` | HHHHS | "The Data room is HR admin's." |
| `view-audit` | HSSSS | "The Audit page is not shown in Manager mode." |
| `data-loading`, `data-mapping`, `data-tiers`, `data-certify`, `data-quality`, `data-wrong` | HHHHS | "Your data articles are about the Data room, which this mode hides." |
| `definitions-how` / `glossary` | LLLLS | "Its Data room links read as text." / "Metrics shown in this mode only." |
| `cost-definition`, `privacy-pay` | HSSSS | "Manager mode shows no amounts, so the cost definition is left out." / "... the pay rules article is left out." |
| `privacy-leave` | HSSHS | "<mode> mode shows no leave, so the leave article is left out." (16.1: no leave in Manager or Finance) |
| tour `getting-started` | HHHHS | "\"Getting started with your home\" takes its place." |
| tour `home-start` | SSSSH | "HR admin opens on the Data room; \"Getting started\" walks through it." |
| tour `requests-start` | SSSHS (follows Requests > New) | Finance: Requests > New's own reason |
| tour `own-data` | HHHHS | "Its steps are in the Data room, which this mode hides." |
| tour `view-<key>` | the view's letter: `view-home` HSSSH, `view-team` SHHHH, `view-plan` LLLLS, `view-requests` LLLLS, `view-forecast` HLLSS, `view-targets` HLLSS, `view-whatif` HSSLS, `view-finance` HLHSS | L: "Its steps follow what this mode shows of the page." H: as the article |

`homeTourOf(mode)` (src/help/access.ts) is `getting-started` in HR admin (its home is the Data
room) and `home-start` in every other mode; each is shown in its mode (tested).

### 1.3 Help (`src/help/`, new)

| File | State | Exports |
|---|---|---|
| `types.ts` | data | `HelpGroup`, `HELP_GROUPS`, `Condition`, `Block`, `Without`, `HelpArticle`, `Placement`, `StepWording`, `TourStep`, `Tour`. The template app's shapes; HCP adds `StepWording.view` and `.tab` (a wording may move its step to the mode's own home: My team in Manager mode, Home in the role modes) |
| `markup.ts` | built (port) | `LinkKind`, `LINK_KINDS`, `HelpLink`, `Inline`, `parseInline`, `plainText`, `blockTexts`, `linksIn`, `articleLinks`, `articleText` |
| `access.ts` | built (port) | `HelpAccess`, `articleShown`, `tourShown`, `homeTourOf`, `holds`, `stepShown`, `stepWording` (applies a wording's `view` and `tab`), `tourInMode`, `blocksInMode`, `articleInMode`, `linkShown`, `articlesInMode`, `toursInMode` (new), `glossaryInMode` (the rule entries `privacy.*` and `cost.guard.*` go with their articles) |
| `learnMore.ts` | data, built | `LEARN_MORE_ARTICLES`, `articleForMetric`: by prefix (team, plan, requests, forecast, targets, whatif, finance, actions, audit, data, quality, privacy, cost) and by id (the rules, the six trade-weight metrics to `trading-heads`, the Data room's two charts). Covers every catalog metric (tested) |
| `names.ts` | data, built | `HelpName`, `HELP_NAMES` (60 phrases: views, every tab by its path, pages, switches, the actions a mode may lack, the amount kinds and leave), `NOT_A_PAGE`, `namedOnPurpose`, `namesHidden(access, where, text)`: the template app's NAMES test rebuilt for HCP |
| `check.ts` | partly built | Built: `PROPER_NAMES`, `NAGGING`, `sentenceCaseProblem(title)`, `copyProblems(text, { exempt? })`. Stubs: `articleProblems(article, world)`, `tourProblems(tour, world, source)` |
| `copy.ts` | data | `ARTICLE_NOT_SHOWN`, `TOUR_NOT_SHOWN`, `HELP_SHEET_TITLE`, `ABOUT_THIS_VIEW`, `LEARN_MORE` |
| `glossary.ts` | stub | `GlossaryEntry`, `PAGE_LABEL` (data), `RULE_PREFIXES`, `isRuleMetric` (built); stub `buildGlossary(defs)` |
| `links.ts` | stub | `LinkWorld`; `parseRouteTarget` (built); stubs `checkLink`, `linkHref`, `followLink` |
| `search.ts` | stub | `ArticleHit`, `TermHit`, `SearchResults`, `RESULT_LIMIT`, `SearchField`, `ArticleDoc`, `TermDoc`, `SearchIndex`; stubs `words`, `buildIndex`, `search` |
| `store.ts` | stub | `HELP_STORAGE_KEY` ('hcp:help', already in src/app/storageKeys.ts), `HelpPrefs` (`completed`, `welcomeDismissed: Mode[]`), `WelcomeLine` (= `Mode`: one line per mode, each on its own home), `DEFAULT_PREFS`, `TourRun`, `TourEnd`, `HelpState`, `useHelp` (state built, its 9 actions throw), `openHelp`, `closeHelp`, `startTour`; stubs `parsePrefs`, `withDismissed`, `welcomeDismissed`, `withTourDone`, `withCompleted` |
| `welcome.ts` | stub | `GETTING_STARTED`, `HOME_START`, `REQUESTS_START`, `OWN_DATA`, `WelcomeVariant` ('admin' on the Data room, 'team' on My team, 'home' on Home), `WelcomeCopy`; stubs `welcomeFor(variant, pageMode, liveMode)`, `welcomeCopy(variant, mode)`. Words: "New to Headcount Planner?" / "Take the 2-minute tour" (HR admin), "New to My team?" (Manager), "New to HRBP mode?" (role homes), "Take the 1-minute tour" |
| `whatsNew.ts` | data | `APP_VERSION` ('0.1.0', kept equal to package.json), `ReleaseNote`, `RELEASE_NOTES` (empty: help-trust writes it) |
| `diagnostics.ts` | stub | `DiagnosticDataset`, `DiagnosticInput` (mode line, page, address, period, `planVersion`, `comparison`, leader set, filter counts, `positionsInScope`, standard, as-of, datasets, definitions changed, switches, `readOnly`, display, storage, version, browser, window, at); stubs `safeAddress`, `diagnosticText` |
| `diagnosticInput.ts` | stub | `DiagnosticState`, `DiagnosticEnv`; stubs `pageLabels`, `modeLine`, `diagnosticInput` |
| `tour/place.ts` | stub | `Box`, `Size`, `PlacedSide`, `Placed`, `PlaceOptions`; stubs `placePopover`, `moved`, `tourKey` |
| `articles/index.ts` | built | `ARTICLES`, `articleById`, `articlesIn`, `articleForRoute` |
| `articles/when.ts` | data | The shared conditions, written against surfaces: `MANAGER`, `HRBP`, `LEADER`, `FINANCE`, `HR_ADMIN`, `ROLE_HOME`, `NO_DATA_ROOM`, `AMOUNTS`, `NO_AMOUNTS`, `ROUNDED`, `EXACT`, `PAY_SWITCH`, `LEAVE_COUNTS`, `NO_LEAVE`, `SCOPED`, `RAISES_REQUESTS`, `QUEUE`, `IMPORTS_REQUESTS`, `FOR_MANAGER`, `WORKSPACE_IMPORT`, `WHAT_IF`, `FORECAST`, `FINANCE_VIEW`, `LOAD_FILE`, `AUDIT`, `SEAT_EDITS`, `RUNS_CYCLE` (each picks the modes its comment names, tested) |
| `articles/start.ts`, `views.ts`, `data.ts`, `definitions.ts`, `privacy.ts`, `support.ts` | stubs (data) | `START_ARTICLES`, `VIEW_ARTICLES`, `DATA_ARTICLES`, `DEFINITION_ARTICLES`, `PRIVACY_ARTICLES`, `SUPPORT_ARTICLES`: every id with its group, a working title, `summary: ''`, `body: []` and its structural fields (routes: each view, `data`, `data.quality`, `data.workspace`, `data.metrics`, `actions`, `audit`; tours: each view's, `own-data` on `view-data`, `getting-started` on `what-headcount-planner-is`; generated: `glossary`, `whats-new`) |
| `tours.ts` | stubs (data) | `tourTarget`, `figureTarget`, `TOURS` (every id, a working title, its route: each view's, `own-data` on `data`; no steps), `tourById`, `tourForRoute`, `targetName` (built) |
| `ui/LearnMore.tsx` | stub (M2) | `LearnMoreLink({ metricId, className? })`, props unchanged (charts/Figure.tsx and components/KpiStrip.tsx place it) |
| `ui/AboutViewLink.tsx`, `HelpButton.tsx`, `HelpSheet.tsx`, `ArticleView.tsx`, `TourLayer.tsx`, `WelcomeCard.tsx` | stubs | `AboutViewLink({ view, tab?, label?, className? })`, `HelpButton()`, `HelpSheet()`, `LINK_CLASS` (data), `RichText({ text })`, `ArticleView({ article, titleRef })`, `TourLayer()`, `WelcomeCard({ className?, variant })` |
| `ui/IconHelp.tsx`, `ui/refs.ts` | built | `IconHelp`, `helpTrigger` |
| `ui/useDiagnostic.ts` | stub | `useDiagnostic()` (the function it returns throws) |
| `contracts.test.ts` | the freeze's check | section 6 |

### 1.4 Exports (`src/lib/export/`, `src/charts/types.ts`)

| File | State | Exports |
|---|---|---|
| `exportHeader.ts` (new) | stub | Data: `WORKING_NOT_LOCKED` ("Working, not locked"), `RETIRED_NOT_LOCKED`, `INDIVIDUAL_PAY_LINE` ("Contains individual pay"), `ABOUT_SLIDE_TITLE` ("About these numbers"), `INCL_SBC`, `HEADER_LABELS` (Version, Lock, Comparison, As of, Proration, Rates, Cost, Filters, Rounding: the header order), `HeaderLabel`, `HeaderFact`, `HeaderOptions` (`individualPay`, `inclSbc`). Stubs: `lockLine(plan)`, `headerFacts(meta, opts)` (the one source), `headerLines(meta, opts)` ("Contains individual pay" first when asked, then "<Label>: <value>", then `modeLines(meta)`), `compactHeaderLine(meta)` (a sheet's title block: version, lock, comparison, rounding), `imageHeaderLine(meta)` (version and as-of) |
| `suppressedFlag.ts` (new) | stub | Data: `WHY_KEY` ('__why', the reason a model may set on a row), `SUPPRESSED_KEY`, `SUPPRESSED_WHY_KEY`, `SUPPRESSED_YES`, `SUPPRESSED_COLUMNS` ("Suppressed", "Why"). Stubs: `isAmountColumn(c)` (a money flag or a money format), `hasAmountColumn(columns, money)`, `amountCell(v)` (a finite number or null: never 0 for missing, never words), `withSuppressedFlag(table, money)` |
| `longCsv.ts` (new) | stub | Data: `LONG_WINDOWS` (QTD, YTD, FY), `LongWindow`, `LongComponent` ('loaded' or a `CostComponent`), `LOADED_COMPONENTS`, `LongFacts`, `LongHeadsRow` (Manager rows: no amount key, no rate set), `LongRow`, `AnyLongRow`, `isAmountRow`, `ROUNDED_HEADS_REASON`, `LONG_CSV_COLUMNS` (18 columns in PLAN's order, amount columns `cost: true`), `LONG_HEADS_COLUMNS` (9), `LongCsvTextOptions`, `LongRules`. Stubs: `longColumns(mode)`, `longFactsOf(meta)`, `longCsvText(rows, meta, opts)`, `downloadLongCsv(rows, meta, opts)`, `longRowProblems(rows, rules)` (14.1 item 3's rules as a check) |
| `controlTotals.ts` (new) | stub | `ControlTotal` (period, heads, fte, `usdByComponent`, `loadedUsd`, `suppressedCells`), `ControlTotalsInput` (rows, mode, `roundedLoaded`), `CONTROL_TOTAL_COLUMNS` (data). Stubs: `controlTotals(input)`, `controlTotalLines(totals, mode)` |
| `freeText.ts` (new) | stub | `TextViewer`; stubs `guardedText(text, viewer)`, `guardFreeText(table, viewer)` (14.1 item 8) |
| `view.ts` | stub added | `deckOutline(figures, meta)`: the deck's slide titles in order (title, "About these numbers", dividers, figures), which `exportViewDeck` must write exactly |
| `index.ts` | barrel | Re-exports every new module (the barrel stays behind `import()`, lazy.test.ts) |
| `types.ts` | field added | `ExportTable.suppressedWhy?` |
| `src/charts/types.ts` | fields added | `Column.freeText?` (free text read through `managerText` in Manager outputs), `RegisteredFigure.suppressedWhy?` |

Already in force from M2 and kept: `PlanHeader` on `ExportMeta.plan` and `planHeaderOf` (src/app/
exportMeta.ts), the `band: true` flag through `visibleColumns`, `moneyShown` and the CSV `showCost`
fix (14.1 item 5), `fileStem` (`headcount-planner-<view>-<name>-<as-of>`), `DECK_KICKER`, the
workbook `creator` and deck `author` `APP_NAME` (item 7). M4 tests them; it does not retype them.

### 1.5 Finance > Export and the long CSV model (`src/views/finance/engine/`)

| File | State | Exports |
|---|---|---|
| `longCsv.ts` (new) | stub | `LongCsvOptions` (`versionId?`), `LongCsvModel` (mode, rows, totals, note, empty); stub `longCsvOf(ctx, opts)`: the long CSV from the guarded model in the context's mode (the whole-view Export menu writes it wherever `action:export.long-csv` shows) |
| `loadFile.ts` (new) | stub | `LoadFileOptions` (`versionId?`, `full?`), `LoadFile` (rows, totals, individualPay, fileName, note); stubs `loadFileOf(ctx, opts)` (null where the action is hidden), `loadFileText(ctx, file)` |
| `index.ts` | retyped | `FinanceExport` was `TabModel`; now `extends TabModel` with `versions: ExportVersionOption[]`, `loadFile: LoadFileChoice \| null`, `fullLoadFile: LoadFileChoice \| null`, `totals: FigureData<ControlTotalRow> \| null`; new `ExportVersionOption`, `LoadFileChoice`, `ControlTotalRow`. `financeModel` returns the empty model until finance-export fills it |
| `figures.ts` | ids added | `exportTotals` 'finance-export-totals', `exportPreview` 'finance-export-preview' |

### 1.6 What did not change

No surface, action, metric or figure id was renamed or removed. `export.long-csv`, `export.load-file`,
`export.load-file-full`, `tab:finance.export`, `masthead:help`, `header:about` and the `help:*`
parts (`help:learn-more`, `help:search`, `help:shortcuts`, `help:report`, `help:whats-new`,
`help:links`) were already decided in M2. src/app/Help.tsx (the placeholder button and dialog) and
src/app/copy.ts's `HELP_TITLE`, `HELP_PLACEHOLDER` and `SHORTCUTS` stay until help-engine replaces
them (section 4).

## 2. Who owns what (M4 build)

One builder per file. A builder may add files inside its folders; a file outside them is a
`needsElsewhere` for the lead. The lead owns the docs (but for ship-docs' two PLAN sections),
`src/views/types.ts`, `src/views/contracts.test.ts`, `src/metrics/catalog.ts`, and the frozen files
no builder is named for: `src/help/articles/index.ts`, `src/help/articles/when.ts`,
`src/access/policy/help.ts` (decisions) and `HELP_*` in `src/access/ids.ts`.

The task named seven builders; where two folder lists met, the freeze split them by file (lead
decision F-1, section 7):

| Builder | Folders and files | Carve-outs |
|---|---|---|
| help-engine | `src/help/**` except `src/help/articles/**` and `src/help/tours.ts`; `src/app/**` for wiring the Help button, sheet, tour layer, welcome card, About this view and LearnMoreLink | Not `src/app/ExportMenu.tsx`, `exportMeta.ts`, `wholeView.tsx`, `wholeViewModel.ts` (exports), not `src/app/write/**` (m3-gaps). `src/help/whatsNew.ts`'s `RELEASE_NOTES` content is help-trust's |
| help-views | `src/help/articles/start.ts`, `src/help/articles/views.ts`, `src/help/tours.ts`; may add `src/help/articles/views.test.ts`, `src/help/tours.test.ts` | |
| help-trust | `src/help/articles/data.ts`, `definitions.ts`, `privacy.ts` (incl. `about-server`), `support.ts`; `RELEASE_NOTES` in `src/help/whatsNew.ts`; may add `src/help/articles/trust.test.ts` | |
| exports | `src/lib/export/**`, `src/charts/**`, `src/metrics/excel.ts`, `src/components/**` (export menus); `src/app/ExportMenu.tsx`, `src/app/exportMeta.ts`, `src/app/wholeView.tsx`, `src/app/wholeViewModel.ts` | |
| finance-export | `src/views/finance/**` (Export tab, `longCsv.ts`, `loadFile.ts`), `src/cost/**` (long CSV and control-total guard tests), `src/access/**` and `src/testkit/**` (export leak crawl) | `src/access/policy/help.ts` and `HELP_*` in `src/access/ids.ts` are frozen (the lead's) |
| ship-docs | `README.md`, `ARCHITECTURE.md`, `scripts/**`, `src/ship/**`, `vite.config.ts`, `package.json` scripts, `docs/PLAN.md` sections 8.3 and 16 only | |
| m3-gaps | `src/plan/**`, `src/views/whatif/**`, `src/views/requests/**`, `src/data/**`; `src/app/write/**` (gap 6's `tradeQuoteOf`) | |

## 3. What each builder satisfies and tests (PLAN 14 items)

| Builder | PLAN items | Tests it writes (each fails on the stub or the bug it guards) |
|---|---|---|
| help-engine | 14.2 bullets 1, 2 and 7 (the data model; LearnMore filled with the store, articles and tours; `about-server` pinned and exempt alone); 14.3 (the scans); 16.2 `help/` | `src/help/content.test.ts` (every article and tour through `articleProblems` and `tourProblems`: ids, links resolve, routes and tabs real, targets in the source, 4 to 6 steps per view tour, sentence case, no em dash, no "!", no nagging verb; "Learn more" covers every metric; `data-loading` names all eight datasets by label; the glossary one entry per metric, sorted; `APP_VERSION` = package.json; release notes newest first); `access.test.ts` (every article and tour decided in every mode as `HELP_GRID`; at least 3 steps of each shown tour in every mode, each kept step's page, figure and condition shown, no wording left; links to hidden targets read as text and HR admin keeps every link; `namesHidden` empty over every shown article and step in every mode, non-vacuous; the `modes` article ends with `NOT_SECURITY_LONG` and its mode text has no banned word; `about-server` uses a banned word, no tour is exempt; the home tour and welcome line fit each mode; Report a problem names the mode and unit, never a person, position or request ID); `engine.test.ts` (markup, `placePopover` at 1440 and 375 px, prefs, `safeAddress`, `diagnosticText`); `search.test.ts`; `store.test.ts` (each mode's welcome line on its own; a tour puts the page and filters back; nothing in history) |
| help-views | 14.2 bullets 3, 4 and 6: Start here (`modes` ends with `NOT_SECURITY_LONG`; `moving-around` filters, version and comparison pickers; `reading-a-number` heads, FTE, loaded cost, "—", "Other (k)", calculation cards; `clicking-down`; `exporting` with the header lines, the Suppressed flag, the long CSV, workspace files); each view (`view-home` one section per home, each under its mode's condition); the tours (`getting-started`, `home-start` with per-mode wording on each home's hero, Manager's on My team through `StepWording.view`, `requests-start` draft, submit, track with Manager's wording first, `own-data` ending on certification, one `view-<key>` tour of 4 to 6 steps per view with at least 3 kept in every mode by per-mode wording rather than skipped steps, `view-whatif` on the Levers tab: the lever list, then the result strip of heads, cost and gap) | Per-file tests with `copyProblems`, `sentenceCaseProblem`, `namesHidden` and `tourInMode` over its own articles and tours in every mode |
| help-trust | 14.2 bullets 5 and 6: Your data (`data-loading` names all eight datasets; `data-workspace-file`: Shareable, Full, Requests and Export for a manager, an opened file shown through the current mode, the JSON readable so each person gets a file made for them, checksums catch damage; `data-versions`), Definitions (`glossary` generated, `cost-definition`: loaded cost, band estimate, proration, FX; `trading-heads`), Privacy and trust (`privacy-browser` with the shared origin; `about-server`: "Why there is no sign-in", the app runs in this browser, modes, Acting as and approvals change what it shows, not who can see the data, real access control needs a server with sign-in planned for Phase 3, checksums do not prove who made a file; `privacy-pay`; `privacy-small-groups`: 5+, Other (k), "—", $0.1M per team, differences, component splits that need 5+ in each component, Finance's country, legal-entity and currency rows as sums of shown cost centers; `privacy-leave`; `privacy-sample`), Help and support (`report-problem` names the mode and unit, never a person, position or request ID; `troubleshooting` with "Read only: open in another tab"); `RELEASE_NOTES`; 14.3 `BANNED_HASH_WORDS` | Per-file tests as help-views'; `about-server` holds a banned word and every other article none |
| exports | 14.1 items 1, 2, 5, 7 and 8 and the writer side of 3 and 4 | `exportHeader.test.ts` (facts in `HEADER_LABELS` order per mode; Manager's header holds no rate, currency code or rounding amount; "Contains individual pay" first only when asked; the workbook Summary, each sheet's title block, the CSV preamble, the deck's second slide and image footers carry it); `suppressedFlag.test.ts` (an empty amount cell is empty, never 0 or words, with Yes and the reason; no flag columns where no amount column shows; negative amounts unguarded); `longCsv.test.ts` (columns per mode, file text, `longRowProblems` catching each break of item 3 on synthetic rows); `controlTotals.test.ts` (per mode; rounded totals from `roundedLoaded`, never a sum of rows); `money.test.ts` extended (pay, cost and band flags dropped per mode in tables, CSV, clipboard, Excel, slides and the long CSV); `names.test.ts` and `view.test.ts` (file names, kicker, `creator`, `author`, `deckOutline` with "About these numbers" second); `freeText.test.ts`; `lazy.test.ts` still passes |
| finance-export | 14.1 items 3, 4 and 6 (the model), 16.1's export rows | `views/finance/engine/longCsv.test.ts` (item 3: in HRBP and Leader mode no amount row has a month period, a component other than loaded, a cost center, a currency other than USD, a non-empty `amountLocal`, or an org `isUnionOfAtoms` rejects; in Finance mode a 20-person cost center with one October hire carrying a sign-on and relocation has one October loaded row and no row equals the sign-on plus relocation; Manager rows carry no amount key); control totals matched to the screen model for every home, Plan Overview, Forecast Variance and Bridge in every mode; `loadFile.test.ts` (Finance's rules; the full file only from HR admin with the switch on, its first line "Contains individual pay"); `src/cost/` (`costUnions.slow` over long CSV rows and control totals; `costDiff.slow` failing on any monthly, cost-center or component amount in rounded exports; `costLp.slow` observing long CSV rows and control totals; `guard.test.ts`'s long CSV case; no control total or screen total minus the shown rows equals a hidden group of 1 to 4 or a hidden component amount); `src/access/` and `src/testkit/` (the crawl reads every export as written bytes, the long CSV, the load file and help through `articlesInMode`, `toursInMode` and `glossaryInMode`; `leaks.positions.slow` with the load file; the Manager crawl holds no amount in any export or help text; no leave word in Manager or Finance exports) |
| ship-docs | 3.3, 3.4, 3.5, 14.3's `BANNED_HASH_WORDS` in README, 17 M4 row (one-file build: size, opens from `file://`), M3 known gap 10 (8.3's grid and 16.2's text); M3 known gap 9 too, as built (section 8.1) | `src/ship/` (brand, deployPages, devServer, storageKeys, trackedFiles, noCensus still pass; the one-file build's config: singlefile in `--mode single`, no external URL in index.html, relative base, size budget read from a constant); README states the live link, the download, architecture honesty, same origin and the accepted risks of 15.3 that concern users |
| m3-gaps | M3 known gaps 5, 6 and 9 (gap 9 was built by ship-docs, section 8.1) | Gap 5: a version ID minted from a name that arrived with a Full file is not rewritten (src/plan/workspace, src/plan/actions/versions.ts): a test that a Full file's version ID holding an amount is refused or re-minted, with every lock hash still verifying. Gap 6: What if's trade lever shows the engine's Interviewing warning (src/app/write/quote.ts `tradeQuoteOf` passing `openReq`, or What if deriving it as the request card does, `interviewingOf`), never naming a request the viewer cannot see in full (PV-9). Gap 9: `src/data/import/templates.test.ts`'s Excel round trip passes under a full parallel unit run (its own timeout or a shared workbook), asserting exactly what it asserts today |

## 4. Notes for builders

- **Conditions are surfaces.** Help text never names a mode in a condition: use `articles/when.ts`
  (or a surface). A sentence that names a page, tab, control or amount kind a mode hides goes under
  a condition; `namesHidden` finds the ones that do not. Add a phrase to `HELP_NAMES` rather than
  drop one; record every `NOT_A_PAGE` addition.
- **Help shown in Manager mode holds no amount.** The Manager crawl reads help and the glossary
  (`leaks.manager.slow`): no currency sign, ISO code beside a number, grouped number ("1,000") or
  suffixed amount ("$0.1M", "95k"). Write such sentences under `AMOUNTS`, `ROUNDED` or `EXACT`.
  Leave words in help are not scanned, but `privacy-leave` is hidden in Manager and Finance mode.
- **Tour targets** are `[data-tour="..."]` names that exist today: `masthead-mode`, `masthead-help`,
  `masthead-settings`, `masthead-data`, `masthead-audit`, `masthead-actions`, `masthead-workspace`,
  `masthead-more`, `folder-tabs`, `view-tabs`, `view-export`, `view-controls`, `filter-row`,
  `filter-period`, `filter-leader`, `filter-views`, `version-picker`, `compare-picker`,
  `data-standard`, `kpi-strip`, `kpi-value`, `kpi-tier`, `kpi-info`, `readout`, `home-hero`,
  `home-attention`, `whatif-trade`, `figure-actions`, `actions-header`, `actions-list-switch`,
  `actions-list-controls`, `actions-owner-sheet`, `actions-copy-note`, and `figure-<id>` for any
  Figure id. A target that does not exist is a `needsElsewhere` (the view's owner adds it), or the
  step points at a Figure.
- **Ids are frozen, titles are not.** The freeze's titles are working titles; writers may retitle
  (sentence case). Summaries start empty.
- **The header** (`headerFacts`) is the one source of 14.1 item 1. In Manager mode src/app/
  exportMeta.ts `planHeaderOf` gives `rates`, `costDefinition` and `rounding` as '' (exports builder)
  so the header holds no currency code; the forecast's exports read "Actual for closed months,
  forecast for open" as their rates.
- **Rows of one period partition its positions**; a cell's heads and FTE sit on its first row, so
  Σ heads is the scope's (src/lib/export/longCsv.ts). Manager rows are `LongHeadsRow`s: no amount key
  anywhere in a Manager model (7.6), as M3's previews.
- **Free text** in outputs: `Column.freeText` columns pass `guardFreeText` in every exporter; the
  models already cut comments to `commentVisible` and read reasons through `managerText` in Manager
  mode (M3). The leak crawl is the guarantee.
- **The crawl reads help** through `articlesInMode`, `toursInMode` and `glossaryInMode` (built, or
  built by help-engine), never the placeholder; src/app/copy.ts keeps `HELP_TITLE`,
  `HELP_PLACEHOLDER` and `SHORTCUTS` until the crawl no longer imports them (integration).
- **src/views/contracts.test.ts** asserts `LearnMoreLink` renders ''; once help-engine fills it the
  lead updates that test (help-engine reports it).
- **Exports in a reader tab** still work (CONTRACTS-M3 4); a load file is never blocked by the write
  lock.

## 5. Readings frozen with the contracts

- **Help decisions** (section 1.2): a view's article shows wherever the view is not hidden; its tour
  follows the view's letter (L: "Its steps follow what this mode shows of the page."); the Data
  room's articles and tours are HR admin's; `cost-definition` and `privacy-pay` leave Manager mode
  out; `privacy-leave` leaves Manager and Finance out (16.1); `requests-start` follows Requests > New.
- **First tours**: HR admin takes `getting-started` (its home is the Data room); every other mode
  `home-start`, Manager's on My team. One welcome line per mode, each on its own home, dismissed on
  its own (`WelcomeLine` = `Mode`).
- **Report a problem** carries no workspace counts (a count of requests or entries could move with a
  request Manager C cannot see, 8.4 rule 3) and counts positions over what the mode shows.
- **The long CSV's periods**: every month of the version's grid, then QTD, YTD and FY of the as-of
  date's fiscal year, QTD and YTD ending at the last close. Heads at the window's last month-end and
  FTE averaged over its months (Forecast > Variance's measures).
- **The load file** is the whole company's, for a version picked on Finance > Export (the "version
  export" of 9.4), never cut by the screen's filters; HR admin with the switch on is offered both
  files, the one at Finance's rules written with the switch off (`contextAs`).
- **File names**: `headcount-planner-<view>-long-<as-of>.csv`; the load file
  `headcount-planner-finance-load-file-<version>-<as-of>.csv`, the full one `…-load-file-full-…`.

## 6. The freeze check

Run from the project root on 24 Oct 2026 (Node 24.14.1), after the last change of the freeze:

| Check | Result |
|---|---|
| `npx tsc --noEmit -p .` | Clean, no errors |
| `npx biome check src scripts` | 1,069 files checked, no findings |
| `npx vitest run --project unit` | 311 files, 3,180 tests passed, 0 failed (76 s). Before the freeze: 310 files, 3,166 tests (the new `src/help/contracts.test.ts` adds 14) |

`src/help/contracts.test.ts` (new, 14 cases) checks: `ARTICLES` and `TOURS` hold exactly
`HELP_ARTICLE_IDS` and `HELP_TOUR_IDS` in order, groups in `HELP_GROUPS` order; every view's article
and tour are reached from its page, and the Data room's tabs reach theirs; every help surface is
decided in every mode as `HELP_GRID` says, each limited or hidden one with a plain sentence free of
banned words; `about-server` shows in every mode and is the only exemption; each view's article
follows the view and each mode's first tour shows in it; every shared condition picks the modes its
comment names; the ported `blocksInMode`, `stepWording` (with the new `view`), markup, `linkShown`,
`tourInMode` and `namesHidden` behave as the template app's (non-vacuous); `sentenceCaseProblem` and
`copyProblems` read the rules, and every working title passes them; "Learn more" covers every
catalog metric with a registered article. The access snapshot tests pass on the regenerated
snapshots (1.1); `policy.test.ts` now covers the 52 help surfaces.

No existing test reaches a stub. The freeze adds 56 `notBuilt` stubs: 34 in `src/help/` (check 2,
diagnosticInput 3, diagnostics 2, glossary 1, links 3, search 3, store 14 (5 functions and the 9
actions of `useHelp`), tour/place 3, ui/useDiagnostic 1, welcome 2), 19 in `src/lib/export/`
(controlTotals 2, exportHeader 5, freeText 2, longCsv 5, suppressedFlag 4, view 1) and 3 in
`src/views/finance/engine/` (longCsv 1, loadFile 2), and 7 components that render nothing
(`AboutViewLink`, `HelpButton`, `HelpSheet`, `RichText`, `ArticleView`, `TourLayer`, `WelcomeCard`)
beside M2's `LearnMoreLink`. The slow and perf projects were not run (they read no M4 contract; the
lead runs `npm run verify` at the end of the milestone). Copies of every file the freeze changed, as
they were before it, are in the session scratchpad (`m4/freeze-backup/`).

## 7. Open items for the lead

1. **F-1, folder overlaps.** The task gave help-engine `src/app/**` and exports the export menus,
   which live in `src/app/` (ExportMenu, exportMeta, wholeView, wholeViewModel); and gap 6's
   `tradeQuoteOf` is `src/app/write/quote.ts`. The freeze split them by file (section 2). Confirm.
2. **Seven builders, not six.** The task's list names seven (help-engine, help-views, help-trust,
   exports, finance-export, ship-docs, m3-gaps); section 2 covers all seven.
3. **Free-text column flags.** The record columns that hold reasons and comments live in
   `src/drill/` and the views (no M4 owner but `src/views/requests/**`, m3-gaps). Flagging them
   `freeText: true` is integration work; the models' `managerText` reads (M3) and the leak crawl
   are the guarantee meanwhile.
4. **`src/views/contracts.test.ts`** expects `LearnMoreLink` to render nothing (the lead's file).
5. **Tour targets** a writer needs that do not exist yet are `needsElsewhere` items for views no M4
   builder owns (home, team, plan, forecast, targets, finance tabs but Export, data, actions, audit).
6. **The long CSV in the whole-view Export menu** is the exports builder's menu calling
   finance-export's `longCsvOf` (through `import()`); both must land for the menu item to work.

## 8. Build and integration (24 Oct 2026)

Seven builders filled the bodies behind sections 1 to 6, then one integration step resolved every
`needsElsewhere` item, wired what was left and ran the gate. No frozen export was renamed or retyped;
every change below is an addition (new exports, optional fields) or a body.

### 8.1 What each builder delivered

| Builder | Delivered |
|---|---|
| help-engine | Every stub in `src/help` but the content: `store.ts` (`hcp:help`), `welcome.ts` (+ `welcomeVariantOf`), `glossary.ts` (+ `RULE_WHERE`), `links.ts`, `search.ts`, `check.ts` (`articleProblems`, `tourProblems`, + `targetInSource`, `EVERYWHERE_TARGETS`), `diagnostics.ts`, `diagnosticInput.ts`, `tour/place.ts`, and the UI (`HelpButton`, `HelpSheet`, `ArticleView` with `RichText`, `TourLayer`, `WelcomeCard`, `AboutViewLink`, `LearnMoreLink`, `useDiagnostic`). New pure modules `sheet.ts`, `tour/open.ts`, `access.ts` `learnMoreIn`, test kit `world.testkit.ts`. Wiring: the masthead's Help button, the welcome line on each mode's home, "About this view" in the view header and "About this page" on the Data room. `src/app/Help.tsx` is gone. Tests: `engine`, `search`, `store`, `access`, `content` and `tourTargets.slow` |
| help-views | `start.ts` (6 articles), `views.ts` (11), `tours.ts` (all 12 tours with steps); `views.test.ts`, `tours.test.ts` |
| help-trust | `data.ts`, `definitions.ts`, `privacy.ts` (with `about-server`), `support.ts`, `RELEASE_NOTES` (4 notes); `trust.test.ts` |
| exports | 14.1 items 1, 2, 4, 5, 7, 8, the writer side of 3 and the deck's "About these numbers": every stub in `src/lib/export`, `writtenTable` in every writer, the header in every output, the long CSV menu item (`src/app/ExportMenu.tsx`) and Manager's header without rates, cost definition or rounding (`src/app/exportMeta.ts`). Tests: `exportHeader`, `suppressedFlag`, `freeText`, `longCsv`, `controlTotals`, `controlTotals.screens`, `deck` (+ `deck.testkit.ts`); `money` and `metrics/excel` extended |
| finance-export | 14.1 items 3, 4 and 6: `longCsvOf` and `longRowsOf`, `loadFileOf` and `loadFileText`, the Finance > Export tab (`engine/export.ts`, `ui/Export.tsx`), the crawl's export and help reads (`src/testkit/crawl.ts`), the cost slow tests and the access leak tests over every written export. Tests: `longCsv.test.ts` (19), `loadFile.test.ts` (12), `guard.test.ts` (+2); `costUnions`, `costDiff`, `costLp` and the `leaks.*` crawls extended |
| ship-docs | README.md and ARCHITECTURE.md rewritten; `scripts/oneFile.mjs` and `check-single.mjs` (verify step 6; `copy-single.mjs` and `deploy-pages.mjs` refuse a failing page); PLAN 8.3 (R52's Leader cells) and 16; M3 known gap 9 (the round trips moved to `src/data/import/templates.slow.test.ts`, every assert as it was). Tests: `src/ship/oneFile.test.ts`, `docs.test.ts`, `deployPages.test.ts` (+2) |
| m3-gaps | Gap 5: `src/plan/workspace/versionIds.ts` (`idAsWords`, `idHasAmount`, `mintVersionId`, `cleanVersionIds`), run by Replace and Merge, `lockVersion` minting with the same rule, the entry's `versionIdsRewritten`. Gap 6: `tradeQuoteOf` passes `openReq` (`openReqsOf`) and `requestShown`; one Interviewing sentence (the card's, in `interviewingText`); `quoteNotes`; What if's `LeverRow.tradeNote` and its "Trade note" column. Tests: `versionIds.test.ts`, `versionIds.scenario.test.ts`, `src/app/write/quote.test.ts`, `whatif.test.ts` (+2) |

### 8.2 Contract additions (no renames)

- **Exports**: `ExportMeta.mode`; `Column.flagEmpty`, `Column.why`; `ViewExportOptions.controlTotals`;
  `CsvOptions.viewer`, `TsvOptions.viewer`; `planHeaderOf(ctx, view?)`, `planHeaderFor`,
  `FORECAST_RATES`, `rateText`, `buildExportMeta({ mode })`; helpers `writtenTable`, `isAmountCell`,
  `isMoneyFormat`, `reasonColumn`, `textViewerOf`, `showsIndividualPay`, `factLine`,
  `PRORATION_LABEL`, `longPreamble`, `longNumber`, `controlTotalRows`, `addsToLoaded`, `slideTable`,
  `aboutSlide`, `controlTotalFacts`, `sheetHeaderLines`, `sheetStamp`; Figure's `suppressedWhy` prop.
- **Finance**: `LongCsvOptions.source` ('version' or 'forecast'); `LongCsvModel.versionId`, `plan`,
  `periods`, `costed`, `costedByPeriod`; `longRowsOf`, `longPeriodsOf`, `longMetaOf`;
  `LoadFile.versionId`, `mode`, `meta`, `costed`, `costedByPeriod`; `FILTERED_TEXT`;
  `FinanceExport.preview`; `ControlTotalRow.costed`.
- **Test kit**: the crawl's `exports` option and `deckSlides`.
- **Help**: `sheet.ts`, `tour/open.ts`, `learnMoreIn`, `welcomeVariantOf`, `RULE_WHERE`,
  `targetInSource`, `EVERYWHERE_TARGETS`, `DiagnosticInput.rowsShown`, the UI sentences in
  `copy.ts`. `check.ts`: `PROPER_NAMES` gained the Data room's tabs and a dataset's panels
  (Datasets, Lists, Workspace, Raw, Mapping, Quality, Certify), `sentenceCaseProblem` accepts the
  pronoun "I", and `articleProblems` also checks headings, a non-empty summary and body (generated
  articles excepted) and link labels that read as ids. Confirmed at integration.
- **Plan**: `versionIds.ts`, `versionSlug` (src/plan/store/memoryStore.ts), the workspace entry's
  `versionIdsRewritten`; `openReqsOf` (src/app/write/quote.ts); `quoteNotes`; `LeverRow.tradeNote`.
- **Components**: `Section` and the requests form's `Field` take a `data-tour` prop (integration,
  8.4).

### 8.3 Readings taken in the build (for PLAN 15)

- **Long CSV cells** (finance-export): the rows of a period partition the scope's positions. In
  Finance, and HR admin with the switch off: unit by shown cost center, plus the unit's one
  "Other (k)" row (in `costCenter`). By C33 (b) a cost-center cell is never a whole unit, so each is
  one row of loaded cost with "Components show for whole units and the company."; the split by
  component is in the control totals. So 14.1 items 3 and 6's "component split where every
  component has 5 or more" never applies to a cost-center row. HR admin with the switch on: unit by
  cost center by currency by component, equity on its own USD row. HRBP and Leader: departments
  (unit or company scope) or a leader's direct sub-orgs; month rows are org by cost center, heads
  and FTE only; the scope's own rounded total is a control total, never a row. Manager: team by
  cost center, heads and FTE.
- **C33 (a) over 14.1 item 3's filter text**: under a cost-center, legal-entity, country or currency
  filter the long CSV keeps its cells and heads, every amount empty with the guard's filter note.
- **The load file is written with no org filter** (unit, department, cost center, leader, level,
  location, legal entity, country or currency): `loadFileOf` returns null and Finance > Export reads
  `FILTERED_TEXT` (story 8's leak test: no amount under a 1550-HSZ filter). Period, version and
  comparison stay free.
- **A row's currency and rate** come from which lines exist, never from their amounts (C26), so a
  leave never changes them; a cell in more than one currency, every Other row and every rounded row
  is USD with no local amount.
- **The forecast's long CSV** reads the Working forecast (`source: 'forecast'`), as Variance and the
  bridge do; its header states the rows' own version and rate set.
- **Suppressed flag** (exports): Yes only when an amount cell is empty and the row has a reason
  (`WHY_KEY`, else the reason column, else the table's `suppressedWhy`); an empty band estimate on a
  Filled seat is written empty and not flagged.
- **Written numbers**: heads and FTE to 4 places, rates to 6, amounts to the cent, never exactly 3
  decimals (the Manager amount scan reads "43.871" as a grouped number). The header writes a rate
  under 0.1 with 4 significant digits, so VND never reads "0".
- **Help** (help-engine, help-views, help-trust): the links, the welcome line and the tour layer
  render nothing outside the analytics provider; Report a problem shows dataset row counts only
  where `page:data` shows (HR admin) and counts no requests, comments or audit entries; view tours
  keep every step in every mode that shows them, a step about a hidden tab reworded onto a tab the
  mode shows; Manager and Finance never read the word "leave"; text with an amount sits under
  `AMOUNTS`, `ROUNDED` or `EXACT`; release notes hold no amount and no `HELP_NAMES` phrase.
- **Version IDs** (m3-gaps): an ID carrying an amount is rewritten, not refused: the name's slug,
  else `<fy>-<kind>`, then -2, -3; on Merge the same version already here keeps its ID; the file's
  audit log is kept as it is. Intended change (PV-9): a trade quote's pending-request block names
  the request to a viewer who sees it in full, and reads "another pending request" to everyone else.
- **One-file build** (ship-docs): a static read of the built page as the HTML parser reads it, within
  `ONE_FILE_BUDGET` = 6,000,000 bytes.

### 8.4 Integration changes

- `src/app/copy.ts`: `HELP_TITLE`, `HELP_PLACEHOLDER` and `SHORTCUTS` removed with their
  `copy.test.ts` lines (the crawl reads help through `articlesInMode`, `toursInMode` and
  `glossaryInMode`; nothing else used them). `src/app/pages.tsx` `PageComing` and its null-body
  branch in `App.tsx` removed: every page has its body. The view error boundary's "<view> is not
  part of this build yet." stays as the deliberate boundary case (`shell.test.ts`).
- `src/views/contracts.test.ts`: the shared links and marks render nothing outside an analytics
  context (no longer called stubs); what "Learn more" shows in each mode is
  `src/help/access.test.ts`'s.
- "Learn more" and its divider show only where the mode shows the article (`learnMoreIn`) in
  `src/charts/Figure.tsx`, and the KPI popover's links row only where one of its links shows
  (`src/components/KpiStrip.tsx`).
- "About this page" on the Action center and Audit headers; `tourTargets.slow` now checks the three
  masthead pages too.
- New tour targets, and the steps that were centered cards retargeted: `dataset-detail` (the
  dataset panel: `own-data` steps 3, 4, 5 and 7), `whatif-add-lever` and `whatif-turn-into`
  (`view-whatif` steps 2 and 4; where the mode cannot turn levers into requests, step 4 points at
  the lever list), `requests-type` (`requests-start` step 1).
- Manager mode hides `metric:cost.guard.floorUsd` (src/metrics/guardClass.ts `MANAGER_HIDDEN_RULES`,
  7.6: the one rule whose setting is an amount), so Manager's glossary and Settings > Formulas
  leave it out; pinned in `policy.test.ts`. Manager's reason for `transfer.move-budget` is "Moving
  budget with a transfer is the HRBP's." (R52, PLAN 8.3). Both access snapshots regenerated; only
  those two lines changed.
- Free text flagged `freeText: true` (14.1 item 8): the drill records' version names, freeze
  reasons, adjustment reasons and audit From, To and Comment; Plan's change reasons and "Latest
  change in Working"; the Audit page's and the shared file's From, To and Comment. The approvals
  gap note is the export's Why column (`why: true`). The drill panel's clipboard reads free text
  through the mode (`viewer: textViewerOf(meta)`), as its CSV and Excel files do.
- The long CSV menu item writes the header from the rows' own plan facts (`model.plan`), so on the
  forecast the version and rate set match every row.
- `src/views/data/engine/workspace.ts` `importPreview` runs `cleanVersionIds` (with this
  workspace's versions) before the diff, so the preview's new-version count is what Merge does;
  tested in `versionIds.scenario.test.ts`, which fails without it.
- `src/app/exportMeta.test.ts`: Manager's header states no rates, cost definition or rounding; small
  rates keep their digits.
- `exporting` and `privacy-small-groups` say how Finance's long CSV and load file are cut (8.3),
  and that the load file is written with no org filter.
- `src/help/plan.test.ts` (new): every article and tour id PLAN 14.2 names is registered in its
  group and order, and nothing else is; each shows in the modes 14.2 gives it; every article and
  tour a mode shows is listed on the Help sheet's home on every page the mode shows, and a view's
  own article and tour on its page.

### 8.5 Section 7's open items

1. F-1 (the file-level split of `src/app`) is confirmed. No two builders changed one file but for a
   formatting-only pass over `src/app/write/quote.ts` (help-engine's `biome --write`, no logic).
2. Seven builders: confirmed; all seven delivered (8.1). The help letters of `HELP_GRID` are
   confirmed as frozen.
3. Free-text flags: done (8.4).
4. `src/views/contracts.test.ts`: updated (8.4).
5. Tour targets: added (8.4); no step is a centered card for want of a target.
6. The long CSV menu item: both halves landed, and the menu writes the file.

### 8.6 Left for the lead

Docs this step may not edit, and follow-ups no builder could close:

1. **PLAN 3.3**: the scripts table should list `scripts/oneFile.mjs` and `scripts/check-single.mjs`,
   and say that `copy-single.mjs` and `deploy-pages.mjs` refuse a page that fails the one-file check
   and that verify step 6 runs it.
2. **PLAN 5.5 and 13.5** still read "refuses files over 25 MB" and "the later updatedAt wins"; C35
   (25 MB, 150 MB for a Full file) and R77 (revisedAt, else updatedAt, compared as times) override
   them.
3. **PLAN 15**: record the readings of 8.3 and the two policy changes of 8.4
   (`cost.guard.floorUsd` hidden in Manager mode; Manager's `transfer.move-budget` sentence).
4. **CONTRACTS-M3 8.4**: "The app's tradeQuoteOf passes neither openReq nor requestShown" is no
   longer true (gap 6). **M3-REPORT** known gaps 5, 6 and 9 are closed, and 10 by ship-docs' PLAN
   8.3 and 16 edits.
5. **A stored workspace** that took a Full file with an amount in a version ID before gap 5's fix
   keeps that ID: there is no load-time migration in `src/app/planState.ts` (nothing is deployed
   yet, so no such workspace exists outside a developer's browser).
6. **The browser pass** (M3 known gap 2: B6, B8, the Import dialogs, 375 px in light and dark), now
   with Help, the tours and the welcome lines, is still to do; the rules of these steps forbid a dev
   server, so every check here is a render or model test.
7. **Ship**: commit before `npm run deploy` (its message names `main@<sha>` from HEAD even from a
   dirty tree); the repository has no commit yet.
8. **The Node 24 worker crash** (M2 known gap 9: fork workers exiting with an access violation in
   crawl-heavy slow files) recurs now and then; a rerun passes.

### 8.7 The integration check

Run from the project root on 24 Oct 2026 (Node 24.14.1) with `npm run verify` after deleting
`node_modules/.vite`, on the final tree; it passed on its first run:

```
Headcount Planner verification
  PASS  No data files in git (0.1s)
  PASS  Type-check (2.0s)
  PASS  Lint (1.4s)
  PASS  Tests (unit, slow, perf) (2512.3s)
  PASS  App build (18.3s)
  PASS  One-file build (14.6s)
```

| Project | Files | Tests |
|---|---|---|
| unit | 334 | 3,474 |
| slow | 23 | 143 |
| perf | 6 | 17 |
| All (`npx vitest run`) | 363 | 3,634 passed, 0 failed, no skip or todo |

M3 closed at 337 files and 3,306 tests. Lint checked 1,102 files with no findings. The app build's
main chunk is 2,395.67 kB (774.35 kB gzip); ExcelJS, SheetJS, pptxgenjs and the long CSV model sit in
their own lazy chunks (Rolldown notes that `longCsv.ts` is also imported statically by the Finance
Export model, so its dynamic import in the Export menu shares that chunk). `npm run build:single`
then wrote `dist-single/index.html` and `headcount-planner.html`: 5,095,956 bytes (1,728.07 kB gzip)
of the 6,000,000 byte budget, one inline script and one inline style, opening from `file://` with no
network request (`scripts/check-single.mjs`).

Before the gate, a run of the slow project on its own lost `leaks.leave.slow.test.ts` to the Node 24
worker crash (exit 3221225477, 8.6 item 8); the file passed alone (15 tests, 207 s) and in the
verify run.
