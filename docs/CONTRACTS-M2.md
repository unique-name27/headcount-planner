# M2 contracts (frozen 21 Oct 2026)

The contracts for milestone M2 (docs/PLAN.md 17, "Freeze"): modes, visibility, the cost guard, the
analytics context, the UX layer, the shell's and the views' contracts. Builders fill bodies behind
them and never rename or retype an export; a builder who needs a change reports it to the lead. New
exports may be added. Every stub throws `notBuilt('<file>.<function>')` ("... is not built yet",
`src/plan/notBuilt.ts`); stub parameters carry a leading `_` (the builder drops it when filling the
body). Data (per-mode tables, id lists, the plan's grid, the item routing, figure ids, key figures)
is written in full and is frozen like a signature.

The freeze ran in two parts. **Part 1**: `src/access/`, `src/data/context.tsx` and `src/cost/`
(section 1). **Part 2**: the UX contracts (`src/drill`, `src/components`, `src/charts` additions),
the view contract (`src/views/types.ts`, the registry), every view's and page's model, tabs, figure
ids and Action center kinds, and the stub modules PLAN 17 lists (section 2). Section 3 says who
builds what, section 4 what builders must know, section 5 how the freeze was checked.

## 1. Frozen files and their exports (part 1)

"Built" marks what the freeze filled because PLAN gives the body, an existing test needs it, or it is
plain wiring; everything else in the file is a stub.

### `src/access/`

| File | Exports |
|---|---|
| `modes.ts` | Re-exports `Mode`, `MODES`, `isMode` (data/schema), `PAY_OF`/`PayView` (./pay), `LEAVE_OF`/`LeaveView` (./leave), `ScopeKind`. Data (8.1): `DEFAULT_MODE`, `MODE_LABEL`, `MODE_NAME`, `MODE_SHORT`, `MODE_HINT`, `ModeGroupKey`, `ModeGroup`, `MODE_GROUPS`, `HOME_OF`, `HOME_LABEL`, `HOME_SLUG`, `SHARED_HOME_FIGURES`, `SCOPE_OF`, `ActingAs`, `ModePicks`, `NO_PICKS`, `PICK_LABEL`, `PICK_BLOCKS_READS`, `CompareDefault`, `COMPARE_DEFAULT`, `FILTER_DIMS_OF`. Built: `homeViewOf`, `homeOf`, `hasPick`. Stubs: `isOtherHomeFigure`, `modeButtonLabel` |
| `pay.ts` | `PayView`, `PAY_OF` (data), `PaySurface`. Built (PLAN 7.1 bodies): `payView`, `showPayIn`, `showCostIn`, `roundedIn`, `guardModeIn` (the pay table read as a `GuardMode` for src/cost/). Stub: `payDecisions` |
| `leave.ts` | `LeaveView`, `LEAVE_OF` (data), `LEAVE_FIT_NOTE`, `LeaveScope`, `LeaveEnv`, `LeaveSurface`. Stubs: `leaveShown(scopes, asOf, env)`, `leaveFit(filters, period)`, `leaveDecisions` |
| `copy.ts` | Built (PLAN text): `NOT_SECURITY_SHORT`, `NOT_SECURITY_LONG`, `BANNED_MODE_WORDS`, `BANNED_HASH_WORDS`, `BANNED_WORDS_EXEMPT` (exactly `['about-server']`), `modeName`, `hiddenPageTitle`, `hiddenTabTitle`, `openedInstead`, `openedTabInstead`, `CHANGE_MODE`, `outsideScope`, `recordsOutside`, `kindNotShown`, `PAY_SHOWN_TAG`, `HIDE_PAY`, `FREE_TEXT_HINT`, `FINANCE_EXPORT_LINE`, `ROUNDED_EXPORT_LINE`, `managerExportLine`, `modeExportLine` (the 14.3 export lines). Stub: `reportModeLine(mode, unit, picked)` |
| `surfaces.ts` | Built (template verbatim, HCP kinds): `SurfaceId`, `surface`, `kindOf`, `restOf`, `S` (view, tab, figure, metric, kpi, page, data, settings, article, tour, help, filter, header, export, drill, column, focus, dataset, masthead, shortcut, item, pay, leave, cost, action, ui). Types: `MastheadControl`, `FilterControl`, `ExportKind`, `PayPart`, `LeavePart`, `CostSurfacePart`, `FocusPart`, `ShortcutKey`, `UiPart` |
| `ids.ts` | Data, the surface and action ids of 8.3, 9.1, 9.3, 9.6, 11.6 and 12: `TabDef`, `VIEW_TABS`, `TAB_PARTS`, `DATA_TABS`, `VIEW_SURFACES`, `TAB_SURFACES`, `PAGE_SURFACES`, `DATA_TAB_SURFACES`, `FIGURE_PREFIXES`, `FIGURE_PREFIX_SURFACES`, `HOME_FIGURES`, `HOME_FIGURE_SURFACES`, `METRIC_IDS`, `METRIC_SURFACES`, `PAY_PARTS`, `COST_SURFACE_PARTS`, `LEAVE_PARTS`, `MONEY_SURFACES`, `LEAVE_SURFACES`, `EXPORT_KINDS`, `EXPORT_SURFACES`, `SETTINGS_SURFACES`, `MASTHEAD_CONTROLS`, `MASTHEAD_SURFACES`, `FILTER_CONTROLS`, `FILTER_SURFACES`, `HEADER_SURFACES`, `FOCUS_PARTS`, `FOCUS_SURFACES`, `SHORTCUT_KEYS`, `SHORTCUT_SURFACES`, `UI_PARTS`, `UI_SURFACES`, `DATASET_SURFACE_KEYS`, `DATASET_SURFACES`, `DRILL_KINDS`, `DrillKind`, `DRILL_SURFACES`, `PAY_COLUMNS`, `BAND_COLUMNS`, `COMPONENT_COLUMNS`, `LEAVE_COLUMNS`, `COLUMN_SURFACES`, `ITEM_KINDS`, `ItemKind`, `ITEM_SURFACES`, `ACTION_IDS` (56), `ActionId`, `isActionId`, `ACTION_SURFACES`, `NAMED_SURFACES` (what `policy.test.ts` decides in every mode), `GridLetters`, `PLAN_GRID` (8.3's S/L/H letters in `MODES` order) |
| `policy/types.ts` | `Access`, `Decision`, `At`, `DecideInfo`, `SHOWN`, `limited`, `hidden`, `RoleTab`, `PolicyPlace` (`ViewKey \| PageKey`), `HiddenPart`, `RolePolicy` (the template's fields plus `actions: Record<ActionId, Decision>`) |
| `policy/index.ts` | Re-exports ./types. `ROLE_POLICY` (a hide-everything placeholder per mode until the five tables land), `policyOf`, `policyVersion` (0: no overrides in Phase 1), `PLACE_LABEL`, `placeLabel`, `RouteDecision`. Built: `can` (over `decide`). Stubs: `decide`, `firstShownTab`, `routeShown`, `routeDecision` |
| `scopes/types.ts` | Types only (src/cost/ may `import type` it): `ScopeKind`, `SubOrg`, `TreeScope`, `UnitScope`, `ScopeLock`, `HeldScope` (PLAN 8.2) |
| `scopes/index.ts` | Re-exports ./clamp, ./records, ./types. `NOBODY`, `ScopeEnv`, `ScopeResult`, `ActingAsOption`. Stubs: `scopeFor(mode, picks, env)`, `actingAsOptions(mode, env)` |
| `scopes/clamp.ts` | Re-exports `FILTER_DIMS_OF`. Stubs: `clampFilters(filters, scope, mode)`, `clamps`, `clampReason` |
| `scopes/records.ts` | `ScopeHolder`, `ScopeCtx`. Built: `scopeOfAccess`. Stubs: `inScope`, `rowsInScope(spec, ctx)` (any `{ kind, rows }`), `positionInScope`, `personInScope` |
| `records.ts`, `lock.ts` | The paths the UX layer imports (PLAN 17): re-exports of ./scopes/records and ./scopes/clamp |
| `numbers.ts` | `FindingPositionFacts`. Stubs: `kpisInMode(access, kpis)`, `findingsInMode(access, findings)` (structural: any `{ metricId? }`, any `{ metricId?, positions?, positionsTotal? }`) |
| `visibility.ts` | `CHANGED`, `AN_AMOUNT`, `Viewer`, `RequestView`, re-exports `AuditRow`. Stubs: `viewerOf(ctx, lists?)`, `requestView(req, viewer)`, `commentVisible(c, req, viewer)`, `auditView(e, viewer, requestOf?)`, `hasAmount(text)`, `managerText(text, viewer)` (PLAN 8.4) |
| `context.ts` | `AccessContext` (mode, scope, unset, actingAs, pay, leave, switchOn, decide, can), `AccessInput`. Built: `accessFor(mode, scope?, metrics?, unset?, { actingAs, switchOn }?)` (the template's memo wiring; its `decide`/`can` call the stubbed policy), `ADMIN_ACCESS`. Stub: `accessClamp(picks, lists)` (the `ScopeClamp` the provider passes to `buildContext`) |
| `hooks.ts` | Built: `useAccess`, `useScope`, `useActingAs`. Stubs (they need src/components/currentView): `useAt`, `useDecision`, `useCan` |
| `store.ts` | `MODE_KEY` (`hcp:mode`), `StoredMode` (`{ v: 1, mode, actingAs }`), `DEFAULT_STORED_MODE`, `ModeState`, `useMode` (zustand; the initial read is built and falls back to the default), `setMode`, `openPicker`, `openModeMenu`. Stubs: `parseStoredMode`, `samplePicks(personas)`, every `ModeState` action (`setMenuOpen`, `setMode`, `choose`, `openPicker`, `cancelPick`, `fillPicks`, `reload`) |
| `connect.ts` | `AccessNotice`, `ConnectDeps`. Stubs: `connectAccess(deps)`, `liveAccess`, `liveScope`, `waitingForPick` |
| `matrix.ts` | `InventoryView`, `AccessInventory`, `MATRIX_MODES` (Adm, HRBP, Lead, Fin, Mgr), `MODE_COLUMN`, `MatrixRow`. Stubs: `accessMatrix`, `matrixText`, `howText`, `matrixCounts` |
| `items.ts` | Re-exports `ITEM_KINDS`, `ItemKind`. `ItemFacts`, `ItemWho`, `ItemRoute`, `ITEM_ROUTING` (data: 9.6's "Mode lists", kind by mode), `RoleLens`, `RoutedItem`, `RoleLists`. Stubs: `itemKindOf`, `itemShown`, `itemsShown`, `itemInScope`, `lensOf`, `roleItems` |

### `src/data/context.tsx` (M2 owns it; CF-1 of the M1 review)

| Export | Contract |
|---|---|
| `AnalyticsContext` | M1's fields plus `showCost`, `access: AccessContext`, `guard: GuardSettings`, `plan: PlanState \| null`, `audit: readonly AuditEntry[]`. `showPay` now reads `showPayIn` (same values) |
| `GuardSettings` | `{ mode: GuardMode; rules: CostGuardSettings; atoms: AtomIndex }`: the guard's mode (`guardModeIn`), the locked rules in force (`costGuardOf(ctx.metrics)`), and the last close's atom index (else the index at the last month-end on or before the as-of date) |
| `Compare`, `CompareDefault`, `COMPARE_DEFAULT` | Unchanged; `COMPARE_DEFAULT` and its type are now declared in `access/modes.ts` and re-exported here (the same object) |
| `Clamp`, `ClampInput`, `ScopeClamp`, `NO_CLAMP` | `Clamp` gains optional `scope` and `unset`, which become `ctx.access.scope` and `ctx.access.unset` |
| `buildContext(args)` | Built (comparison resolution per 9.2, as M1 left it). New optional args `actingAs: ModePicks`, `plan: PlanState \| null`, `audit`; `versions` is now optional (the plan state's when not given). The access builder wires the default clamp (`accessClamp`) |
| `AnalyticsProvider` | New optional props `actingAs`, `plan`, `audit` (the shell passes them from the stores) |
| `useAnalytics`, `useAnalyticsIfAny`, `useAnalyticsPending`, `versionCompareLabel`, `targetCompareLabel`, `compareDeltaLabel`, `pickCatalog`, `resolveCompare`, `qualityFor` | Unchanged |

### `src/cost/` (PLAN 7.8)

| File | Exports |
|---|---|
| `guard.ts` | `GuardMode` ('none', 'exact', 'rounded', 'open'), `COST_COMPONENTS` (base, bonus, burden, benefits, oneTime, vacancy, equity), `CostComponent`, `CostField`, `COST_FIELDS`, `Amounts`, `ShownAmounts`, `CostPart` ('filled' \| 'band'), `CostSeat`, `CostMember`, `CostMembersInput`, `RoundedAmounts`, `CostRow`, `CostRowOptions`, `BreakdownOptions`, `GuardInput`, `GuardedFigure`, `BAND_LINE_LABEL`, `SHOWS_IN_FINANCE_NOTE`. Built: `partOfBasis`, `hiddenNote(min)`, `leftOutNote(n, min)`, `centersLeftOutNote(n, min)`, `componentsHiddenNote(min)`. Stubs: `costMembers(input)`, `atomPart(m)`, `roundedAmounts(members, partOf, rules)`, `costRow(key, label, members, opts)`, `breakdown(members, opts)`, `guardModel(input)`, `componentContributors(lines, component)`, `expectGuarded(rows, total, opts)` (throws an Error; imports no test library) |
| `fold.ts` | `OTHER`, `NONE`, `Group`, `FoldCenter`, `FinanceFold`, `OrgCostRow`, `ORG_COST_NOTE`. Built: `otherLabel`. Stubs: `foldGroups` (port verbatim), `guardGroups`, `wholeParts`, `foldByPart`, `financeFold(unit, centers, min)`, `financeOrgCost(rows, unitBreakdown)` |
| `differences.ts` | `DIFF_EPS` (0.005), `OTHER_CHANGES`, `GuardedDifference`, `StepFacts`, `FoldedSteps`. Built: `differenceNote(min)`. Stubs: `contributors(a, b, eps?)`, `bandOnly(a, b, basisOf, eps?)`, `guardedDifference(delta, contributing, min, opts?)`, `foldSteps(steps, min)` |
| `fit.ts` | `ROUNDED_FILTER_NOTE`, `ROUNDED_PERIOD_NOTE`, `FINANCE_FILTER_NOTE`, `SWITCH_FILTER_NOTE`, `NO_AMOUNTS_NOTE`, `CostFitOptions`. Stub: `costFit(filters, scope, mode, switchOn, opts?)` |
| `lp.testkit.ts` | The template app's file, copied verbatim (test code): `lpMax`, `lpRange`, `boundsFromSums` |
| `atoms.ts` | Unchanged from M1 (frozen then) |

## 2. Frozen files and their exports (part 2)

### The view contract (`src/views/`)

| File | Exports |
|---|---|
| `types.ts` | `ViewTab` (`key`, `label`, `parts?`; no feature switches), `Headline`, `ViewSummary`, `ActionOwnerRole` (manager, hrbp, leader, finance), `ACTION_OWNER_ROLES`, `ACTION_OWNER_LABEL`, `ActionSubject`, `ActionPlace`, `ActionItem`, `ViewDef`. What models are made of: `FigureData<Row>` (id, metric, title, subtitle?, rows, columns, note?, empty, uses), `TabModel` (`kpis`), `OverviewModel` (`kpis`, `findings`), `HeroPart`, `HeroModel`. Built: `withAccessTabs` (the template's) |
| `registry.ts` | Built: `VIEWS` (9.1 order: home, team, plan, requests, forecast, targets, whatif, finance), `viewByKey`, `visibleViews(access)`, `folderViews(access)` (My team in Manager mode only) |
| `registry.test.ts` | The skeleton: 9.1 order and labels, tabs equal to `VIEW_TABS`, only `finance.assumptions` has parts, `DATASETS[].usedBy` equal to the views' `datasets`, `visibleViews` and `folderViews` over a fake access |
| `contracts.test.ts` | The freeze's own checks (section 5) |

### Every view and page

Each view's `index.tsx` exports `view: ViewDef` whose key, label, tabs and datasets are data (9.1);
its `View` is a stub. `engine/index.ts` exports the model's types, `<key>Model(ctx)` and
`<key>Headline(ctx)` (stubs; the builder caches the model in a `WeakMap<AnalyticsContext, Model>`).
`engine/figures.ts` holds the figure ids (data). Views that raise Action center items have
`engine/actions.ts`: the kinds they raise (data, `satisfies readonly ItemKind[]`) and a stub
`<key>Actions(ctx): ActionItem[]`, wired as the ViewDef's `actions`.

| View | Tabs | Model (`engine/index.ts`) | Figure ids | Items |
|---|---|---|---|---|
| `home` | overview | `HomeSlug`, `HomeTopModel`, `UnitHomeModel`, `RollupHomeModel`, `FinHomeModel`, `HomeModel`; `homeModel(ctx): HomeModel \| null`, `homeHeadline`. Built: `homeTitle(mode)`; the ViewDef's `title` and `figureless` | `engine/figures.ts`: `SLUG_OF`, `SHARED`, `HOME_FIGURES` per slug (unit: `home-unit-heads-vs-plan`, `home-unit-kpis`, the shared three, `home-unit-openings`, `home-unit-forecast`; rollup: `home-rollup-heads-vs-target`, `home-rollup-kpis`, shared, `home-rollup-suborgs`; fin: `home-fin-cost-vs-budget`, `home-fin-kpis`, shared, `home-fin-bridge`, `home-fin-cost-unit`), `ALL_HOME_FIGURES`, `KeyFigureSource`, `HOME_KEY_FIGURES` (9.3's key figures with the tab each comes from), `HOME_NEEDS` (9.3's Needs attention kinds) | none (9.6) |
| `team` | overview | `AllocationMonthRow`, `TeamTradeCredit`, `TeamModel` (hero, the 7 kpis, tracker of `RequestRecord`s, heads vs allocation, standard heads, trade credit); `teamModel`, `teamHeadline` | `TEAM_FIGURES` (`team-left-to-fill`, `team-kpis`, `team-attention`, `team-tracker`, `team-heads-vs-allocation`), `TEAM_KEY_METRICS`, `TEAM_NEEDS` | none (9.6) |
| `plan` | overview, positions, openings, transfers | Rows `HeadsByMonthRow`, `HeadsByGroupRow`, `StatusCountRow`, `OpeningsStageRow`, `OpeningsAgeRow`, `OpeningRow`, `PositionGridRow` (one `<month>` cell per grid month), `TransferRow`; tabs `PlanOverview` (cost by unit is guarded `CostRow`s), `PlanPositions`, `PlanOpenings`, `PlanTransfers`; `PlanModel`; `planModel`, `planHeadline` | `PLAN_FIGURES` (15) | `PLAN_ITEM_KINDS` (planned-no-req, past-start, frozen-opening, req-on-eliminated), `planActions` |
| `requests` | queue, new, mine, approvals, cycle | `RequestStateRow`, `RankedAskRow`, `NotSubmittedRow`, `CycleFacts`; tabs `RequestsQueue`, `RequestsMine`, `RequestsApprovals`, `RequestsCycle`; `RequestsModel` (`new: null` in M2: the write path is M3); `requestsModel`, `requestsHeadline` | `REQUESTS_FIGURES` (10) | `REQUESTS_ITEM_KINDS` (approve, waiting, sent-back, not-submitted, both backfill flags, trade-credit-lapse), `requestsActions` |
| `forecast` | overview, variance, bridge | `ForecastMonthRow`, `StartsExitsRow`, `VarianceOrgLevel`, `VarianceMeasure`, `VarianceWindow`, `VarianceRow`, `BridgeStepRow` (a `WaterfallStep` with contributors, calc and drill); tabs `ForecastOverview` (with `costVsTarget`), `ForecastVariance`, `ForecastBridge` (with `fxEffectYtd`); `ForecastModel`; `forecastModel`, `forecastHeadline` | `FORECAST_FIGURES` (8) | none (9.6) |
| `targets` | gap, suborgs, tree | `TargetOrgLevel`, `TargetGapRow`, `SubOrgRow` (with `over`, the value the item and the Leader home share), `TreeCellRow`; tabs `TargetsGap`, `TargetsSubOrgs`, `TargetsTree`; `TargetsModel`; `targetsModel`, `targetsHeadline` | `TARGETS_FIGURES` (6) | `TARGETS_ITEM_KINDS` (suborg-over), `targetsActions` |
| `whatif` | levers | Placeholder for M3: `WhatIfLevers` (= `TabModel`), `WhatIfModel`; `whatifModel`, `whatifHeadline` | `WHATIF_FIGURES` (`whatif-results`, `whatif-levers`) | none |
| `finance` | versions, assumptions (`parts: true`), freezes, reconcile, export | `VersionRow`, `AdjustmentListRow`, `AdjustmentMonthRow`, `AssumptionValueRow`, `TradeRateRow`, `StandardHeadFacts`, `FreezeListRow`, `FrozenOpeningRow`, `ReconRow`; tabs `FinanceVersions`, `FinanceAssumptions`, `FinanceFreezes`, `FinanceReconcile`, `FinanceExport` (= `TabModel`, the load file is M4); `FinanceModel`; `financeModel`, `financeHeadline` | `FINANCE_FIGURES` (13) | `FINANCE_ITEM_KINDS` (reconcile, envelope-exception, cycle-due), `financeActions` |
| `actions` (page) | none | `ViewSource` (a `ViewDef` fits), `OpenAction` (extends `RoutedItem` with `item: ActionItem`), `ActionsModel` (items, kpis, needs, waiting, left); `collectActions(ctx, views)`, `actionsModel(ctx, views, isOpen?)` | `ACTIONS_FIGURES` (4) | `metrics.ts`: `ID` (PLAN 12's five), `ActionsMetricId`, `metrics` (empty) |
| `audit` (page) | none | `AuditModel` (kpis, entries of `AuditRow`s, `chainStatus`, `chainOk`); `auditModel` | `AUDIT_FIGURES` (2) | `metrics.ts` from M1 |
| `data` (page) | `DATA_ROOM_TABS` (= `DATA_TABS`) | `DatasetManifestRow`, `MetricDefinitionRow`, `DataRoomDatasets`, `DataRoomMetrics`, `DataRoomModel`; `dataModel` | `DATA_FIGURES` (8) | `roomMetrics.ts`: `ID` (`data.coverage.byMonth`, `data.quality.metricTiers`), `DataMetricId`, `metrics` (empty) |

### The UX layer

| File | Exports |
|---|---|
| `src/drill/types.ts` | `DrillKind` (re-exported from `@/access/ids`), the viewer-shaped records `RequestRecord` (flat; 'limited' rows carry only IDs, type, state, title, level and org), `ActionItemRow`, `ActionOwnerRow`; `DrillRecordMap` (the 16 kinds: positions `Position`, planLines `PlanLine`, assignments `Assignment`, workers `WorkerRow`, reqs `ReqRow`, requests `RequestRecord`, targets `TargetRow`, freezes `FreezeRow`, assumptions `AssumptionRow`, versions `Version`, adjustments `Adjustment`, audit `AuditRow`, exceptions `ReconException`, costGroups `CostRow`, actionItems, actionOwners); `DRILL_RECORD_KINDS` (a compile-time proof that the keys are `DRILL_KINDS`); `DRILL_DATASET`; `DrillExtra`, `DrillSpec` (the template's plus `weight`, the "Counts as" column), `DrillAction`, `DrillFilter`, `DrillSource`, `DrillEntry` (`records`, `position`, `calc`). Built: `drillDataset`, `drillSpec`, `resolveDrill`. Registers `DrillRegistry` in `@/charts/types` |
| `src/drill/calc.ts` | PLAN 9.5's `CalcInput`, `CalcStep`, `CalcSpec`, `CalcSource`, and `CostCalcInput`. Built: `resolveCalc`. Stubs: `calcProblems(spec)` (the card's rules, for tests), `costCalc(input)` (a cost card from a `GuardedFigure`, by guard mode). Registers `CalcRegistry` |
| `src/drill/requestRecord.ts` | `RequestRecordInput`. Stub: `requestRecord(req, input): RequestRecord \| null` (8.4 rules 1 to 4 and 2a; null for rule 3) |
| `src/components/types.ts` | `ViewLink`, `Kpi` (the template's plus `calc` and `deltaCalc`), `Severity`, `FindingPosition`, `Finding` (`positions` and `positionsTotal` in place of people, plus `calc`) |
| `src/charts/types.ts` (additions) | `CalcRegistry`, `CellCalc`, `Column.calc`, `WaterfallStep` (start, step, other, rounding, end). `Column.band` was already there from M1 |

### The stub modules (PLAN 17)

| File | Exports |
|---|---|
| `src/help/ui/LearnMore.tsx` | `LearnMoreLink` (the template's props), renders nothing until M4's help |
| `src/views/data/metrics/ui/EditDefinition.tsx` | `EditDefinitionLink`, `DefinitionChangedMark` (the template's props), render nothing until the views-4 builder fills them |
| `src/views/data/quality-overview/LensLine.tsx` | `LensVariant`, `QualityLensLineProps`, `QualityLensLine`, renders nothing until the views-4 builder fills it |
| `src/app/datasetFocus.ts` | `DatasetPanel`, `DatasetFocus`. Built: `useDatasetFocus` (zustand), `clearDatasetFocus`. Stub: `openDatasetQuality(key, panel?)` (the shell builder fills it: it closes the drill panel and Settings and writes `#data.<dataset>-<panel>`) |

The access functions the UX layer calls (`access/lock` `clampFilters`, `access/records`
`rowsInScope` and `positionInScope`, `access/numbers` `kpisInMode` and `findingsInMode`,
`access/policy` `routeShown`) were frozen in part 1. `drill/PositionCard` replaces the template's
`PersonCard`, so `@/views/org/link` is not ported.

## 3. Who owns what (PLAN 17, M2 build)

One builder per file. A builder may add files inside its folders; a file outside them is a
`needsElsewhere` for the lead. Where two lines name one file, the narrower one wins (the leak tests
under `src/access/` are wave C's, not the access builder's).

| Wave | Builder | Files |
|---|---|---|
| A | Access and context | `src/access/**` (adds `policy/{table,kit,manager,hrbp,leader,finance,admin}.ts`, `scopes/{tree,unit,pickers,label}.ts`, `ui/`, `__snapshots__/` and the access tests, but not the wave C files below), `src/data/context.tsx` and `src/data/context.test.ts` (the default clamp, the provider's store wiring) |
| A | Cost guard | `src/cost/**` except `atoms.ts` (and `lp.testkit.ts`, verbatim), with PLAN 7.8's unit tests |
| A | UX port | `src/drill/**`, `src/components/**`, `src/charts/**`, `src/styles/**`, `src/lib/export/**`, `src/metrics/excel.ts` (the template's types, columns, clipboard, csv, image, names, withheld, xlsx, modeMeta, definitions, download, view and index with renames only; PositionCard, CalcCard, Waterfall and `waterfallModel.ts`) |
| A | Shell | `src/app/**` (datasetFocus included), `src/main.tsx`, `index.html` |
| B | Views 1 | `src/views/plan/**`, `src/views/forecast/**` |
| B | Views 2 | `src/views/targets/**`, `src/views/finance/**` |
| B | Views 3 | `src/views/requests/**`, `src/views/audit/**`, `src/views/actions/**` |
| B | Views 4 | `src/views/home/**`, `src/views/team/**`, `src/views/data/**` (EditDefinition and LensLine included), `src/views/registry.ts` and `src/views/registry.test.ts` |
| C | Leaks | `src/testkit/**` additions (sample contexts per mode, `crawl.ts`, `leaks.ts`), `src/access/*leaks*.slow.test.ts`, `src/access/tradeLeaks.slow.test.ts`, `src/access/visibility.test.ts` |
| C | Guard attacks | `src/cost/*.slow.test.ts` (`costLp`, `costDiff`, `costUnions`, `editInvariance`; `assumptionEdits` is M3's), `src/data/sample/routing.ts` (swap to the guard function) |

Not built in M2: `src/views/whatif/**` (M3) and `src/help/**` (M4); their stubs stay. The lead owns
`src/views/types.ts`, `src/views/contracts.test.ts`, `src/metrics/catalog.ts` (wiring the Action
center's and the Data room's entries) and the docs.

Wave B starts once wave A's contracts behave: the views need the UX components, the policy and the
cost guard bodies. Wave C needs the views' models (the crawl calls every `<key>Model(ctx)` per mode).

## 4. Notes for builders

### From part 1

- **Every number through the guard.** Model builders read `ctx.guard` (mode, rules, atoms) and build
  amounts with `costMembers` then `guardModel` (or `costRow` / `breakdown`), differences with
  `contributors` then `guardedDifference`, and fold bridge steps with `foldSteps`. The minimum, the
  contributor minimum and the rounding step come from `ctx.guard.rules` (the locked `cost.guard.*`
  entries), never `MIN_GROUP` or `COST_STEP`; `roundedAmounts` takes the step for that reason.
- **cost/ never imports access/ at runtime.** It has its own `GuardMode`; `access/pay.ts`
  `guardModeIn` maps the pay table onto it, and `buildContext` stores the result in `ctx.guard.mode`.
  `costFit` takes `Mode` and the switch and is the one place in cost/ that reads modes.
- **Placeholder policy.** Until the five tables land, `ROLE_POLICY` hides everything and `decide` is a
  stub, so `ctx.access.decide` throws `policy.decide is not built yet`. `RolePolicy.actions` is a
  `Record<ActionId, Decision>`, so a table missing an action does not type-check.
- **The plan's grid.** `PLAN_GRID` repeats 8.3's letters (Manager, HRBP, Leader, Finance, HR admin).
  The matrix test should check every table against it; a disagreement is a finding for the lead, not a
  letter to change.
- **Scope in the context.** The provider passes `accessClamp(picks, lists)` as `clamp`; the clamp
  returns the scope and `unset` with the filters, so `ctx.access.scope` and the clamped filters always
  come from one `scopeFor` call.
- **The atom index.** `ctx.guard.atoms` is the last close's index (plan state's `closes`); with no
  close it is `atomIndex(positions, monthEndOnOrBefore(asOf))`, memoized per positions array.
- **Store.** `useMode` reads `hcp:mode` once at creation through `parseStoredMode`, inside a
  try/catch, so importing the store never throws while the parser is a stub.

### From part 2

- **Models are the contract.** Every number on screen comes from `<key>Model(ctx)` (pure, cached per
  context); components render it and compute nothing, so the leak crawler reads what people see by
  calling each model per mode. The model interfaces list what other builders read: the owning
  builder may add fields (and row types may gain fields), never rename or retype the listed ones.
- **`FigureData` carries what the mode may see.** The guard has run before a row exists: a hidden
  amount is null with the reason beside it, and every money column carries exactly one flag (`pay`,
  `cost`, `band`). Exports, the table view and the crawler read the same rows and columns; ids come
  from the view's `engine/figures.ts`, and the UI writes them as literals (`<Figure id="plan-...">`,
  `metric={...}` written out, no spread props) for the source-scan tests.
- **Figure ids.** Every id starts with its view's or page's prefix (`plan-`, `home-unit-`, ...), which
  is how the policy decides it (`FIGURE_PREFIXES`). Builders may add ids with their prefix, never
  rename the frozen ones; KPI strips and readouts have ids too (`plan-overview-kpis`, `plan-readout`).
- **Homes re-link by metric id.** A tab's KPI strip has at most one tile per `metricId`, and
  `HOME_KEY_FIGURES` names the tab each home key figure comes from. Two tiles are model fields, not
  strip tiles, because the home asks for another comparison or period:
  `forecastModel(ctx).overview.costVsTarget` (the Leader's "Cost vs target") and
  `forecastModel(ctx).bridge.fxEffectYtd` (Finance's "FX effect YTD"). Producers must supply both.
- **Requests are records.** Every list of requests (queue, mine, approvals, My team's tracker, the
  HRBP home's list, the position card) is `RequestRecord`s built by `drill/requestRecord.ts`, so 8.4
  holds per row before any table sees it; every count is over the rows the viewer may see (rule 6).
  Audit rows come from `auditView`, cost groups from the guard.
- **Drill kinds.** `DrillRecordMap`'s keys are `DRILL_KINDS` (`DRILL_RECORD_KINDS` fails to compile
  otherwise). `DrillSource` and `resolveDrill` live in `drill/types.ts` so engines import no React;
  the UX port's `Drill.tsx` re-exports them. A weighted figure's drill sets `weight` (the "Counts as"
  column) and its weights add up to the figure.
- **Calculation cards.** `CalcSpec` is PLAN 9.5's exactly. `calcProblems` checks the last step and the
  rows: with `weight`, the weights add up to `value`; without one, a non-money card's rows number
  `value` and a money card is a cost card (no sum outside HR admin with the switch). Cost cards come
  from the figure's `GuardedFigure` through `costCalc`, never from engine totals.
- **Items.** `ActionItem` has every `ItemFacts` field (`OpenAction extends RoutedItem` checks it);
  `place` is required and names the position and org; `requesterId` and `approverId` carry what
  `ITEM_ROUTING`'s 'requester' and 'approver' read; approval items set `snoozeOnly`; an item carries no
  amount (there is no amount field). Each view's kinds are `<KEY>_ITEM_KINDS`, and together they are
  exactly `ITEM_KINDS`.
- **Tabs.** Each ViewDef's tabs equal `VIEW_TABS` (registry test) and the Data room's `DATA_TABS`
  (contracts test); only Finance > Assumptions has parts (`#finance.assumptions:trade-rates`).
- **Stubs that render.** `View` and every `headline` throw until wave B, so the shell renders a folder
  tab's headline and a view's body inside an error boundary (or try) from day one. LearnMore,
  EditDefinition and LensLine render nothing (not throw), so the ported KpiStrip, Figure and Readout
  render in tests before their owners fill them.
- **The pages' metric ids.** `views/actions/metrics.ts` and `views/data/roomMetrics.ts` freeze PLAN
  12's ids with empty `metrics`; the access builder adds them to `METRIC_IDS` and the lead wires them
  into `src/metrics/catalog.ts` (named `roomMetrics.ts` because `views/data/metrics/` is a folder).

## 5. The freeze check

Part 1: `npx tsc --noEmit -p .` is clean; `npx biome check src/access src/cost src/data/context.tsx`
reports nothing; `npx vitest run` passes every file (the M1 suite unchanged, plus
`src/access/contracts.test.ts` and four new cases in `src/data/context.test.ts`). No existing test
reaches a stub. Part 1 leaves 74 `notBuilt` stubs: 55 in `src/access/` and 19 in `src/cost/`.

Part 2: `npx tsc --noEmit -p .` is clean; `npx biome check src/charts/types.ts src/drill
src/components src/views src/help src/app/datasetFocus.ts` reports nothing; `npx vitest run` passes
97 files and 1,427 tests, two of them new: `src/views/registry.test.ts` (8 cases) and
`src/views/contracts.test.ts` (17 cases: figure ids carry their prefixes and are unique and hold the
policy's home figures; the homes' slugs, key figure counts (7, 5, 5, 6) and sources, Needs attention
kinds routed to `needs` and titles; the views' item kinds are exactly `ITEM_KINDS`; an `ActionItem`
is an `ItemFacts`; the drill kinds and datasets; the Data room's tabs and the pages' metric ids; the
stub components render nothing). Part 2 leaves 36 `notBuilt` stubs (2 in `src/drill/calc.ts`, 1 in
`requestRecord.ts`, 1 in `src/app/datasetFocus.ts`, 32 under `src/views/`) and four components that
render nothing; with part 1, 110.

## 6. Exports added during the build, the review fixes and the close-out (23 Oct 2026)

The freeze above is unchanged in name and type. Builders and fixers added the exports below (and
the few optional fields and arguments named here); nothing frozen was renamed or retyped. Removals
are marked. The review fixes follow lead decision D-FIN, PLAN change C33 (docs/M2-REPORT.md). The
M2 close-out (C34, R39, allocation lineage) retypes one M1-frozen input, `AllocationSeatsInput`
(docs/CONTRACTS-M1.md), as its table says; nothing else frozen changed.

### Added in the build

| Where | Exports |
|---|---|
| `src/views/plan/engine/` | `computePlan`; the modules `core`, `guarded`, `pricing`, `openings`, `heads`, `hires`, `transfers`; grid rows gain `approvedHead`, `bandEstimateUsd`, `costAnnualUsd`, `standardHeads`; cost-by-unit rows gain `positions`; openings rows gain `pastStartText`, `frozenText`, `noReqText` |
| `src/views/forecast/engine/` | `computeForecast`; `VarianceTableRow` (`windowKey`, `windowLabel`) |
| `src/access/` | Optional inputs `ClampInput.atoms`, `ScopeEnv.atoms`, `ScopeEnv.personas`; `leaveFit`'s optional scope; `writeBlock`, `costDecisions`, `setContextLists`, `contextLists`; `leaveScopes.ts` (`leaveCountOf`) |
| `src/testkit/` (test code) | `crawl.ts` (`Crawl`, `crawl`, `crawlAll`, `Seen`, `Tag`, `CrawlOptions`, `FigureSnapshot`, `figureMeta`, `requestTexts`, `workspaceSlice`, `workspaceText`, `openShared`); `leaks.ts` (`secretsOf`, `leaks`, `expectClean`, `amountsIn`, `amountHits`, `chainHits`, `payHits`, `holding`, `cellsOf`, `keysOf`, `isAmountKey`, `ISO_CODES`, `PAY_FLOOR`); `moves.ts` (`changesOf`, `moveProblem`, `badMoves`, `moveRulesFor`, `MoveRules`, `bySurface`, `costedIndex`, `costedBehind`, `daysOf`); `routing.ts` (`routingCase`, `drafts`, `submitSteps`, `quote`, `askFor`, `tradable`); `sample.ts` (`leakSample`, which returns `cachedSample()`, `pinClock`, `ctxAs`, `personaCtx`, the `with*` copies, `managerTextFixture`, `MANAGER_TEXTS`, `seatViewers`, `seatViewerContexts`) |

### Added or changed in the review fixes

| Where | Exports |
|---|---|
| `src/cost/guard.ts` | `componentGate`, `ComponentGate`, `ComponentGateInput`, `UnitComponents`, `CapSide`, `COMPONENTS_UNITS_NOTE`; optional `CostRowOptions.components`, `GuardInput.components`, `CostMember.costedByCurrency` (RF-1, RF-2, RF-5) |
| `src/cost/fold.ts` | `FoldCenter.costedByCurrency` (optional), `centerCurrencyMonths`, `currenciesOf` (RF-5) |
| `src/cost/differences.ts` | `FoldStepsOptions` (`published`), optional `StepFacts.moves` (RC-1, RF-5) |
| `src/cost/fit.ts` | `ROUNDED_SHORT_WINDOW_NOTE`, `CostFitOptions.windowMonths` (RR-3). `FINANCE_FILTER_NOTE` keeps its name and now reads C33's text; `CostFitOptions.shownCostCenters` is no longer read |
| `src/plan/lineSource.ts` (new) | `CloseLine`, `closeLines`, `closedMonths`, `withClosedMonths` (RF-4: one line source for closed months) |
| `src/plan/workspace/shared.ts` (new) | `SCOPE_KEY_PREFIX`, `isScopeKey`, `ScopeIdentity`, `scopeKeyOf`, `SharedHeader`, `SharedViewer`, `sharedFiguresShown`, `sharedFileNote`, `managerForeignNote`, `FIGURES_NOT_HERE_NOTE` (RM-3) |
| `src/plan/workspace/file.ts` | `ScopedWorkspaceFile` (`WorkspaceFile` plus an optional `scopeKey`), `BuildFileInput.scopeKey`; `buildWorkspaceFile` returns the subtype, `serializeWorkspace` and `readWorkspace` write and read the header's `scopeKey` (RM-3; `WorkspaceFile` itself stays frozen until M3) |
| `src/views/lineSource.ts` (new) | `isUnpaidLine`, `paidLineOf`, `capSidesOf` (RF-1 cap sides, leave read as paid) |
| `src/views/plan/engine/core.ts` | `lastCloseOnOrBefore` (RR-2). `closeLinesOf` and `shownLines` now return `src/plan/lineSource.ts`'s output itself; `CloseLine` is re-exported from there |
| `src/views/plan/engine/base.ts` | `Prep.costClose`, `Prep.costYtdMonths` (RR-2). The period window is the shown version's fiscal year's (`periodWindow`'s `fiscalYear`, UI-3) |
| `src/views/plan/engine/guarded.ts` | `gateFor`, `originOf`, `rememberOrigin`, `MemberOrigin` (RF-1, RF-2) |
| `src/views/plan/engine/kpis.ts` | `noMonthsReason` (UI-2); Actual heads, Hires YTD and Loaded cost YTD set `deltaEmpty`; Loaded cost YTD has a card with no closed month (RC-7) |
| `src/views/plan/engine/drill.ts` | `positionsSpec` takes an optional `uses` (B3) |
| `src/views/plan/engine/fitReason.ts` | Removed (`planFitOf`): under C33 every cost-center pick gives the C33 note, on Plan as on Forecast (RC-5) |
| `src/views/forecast/engine/bridge.ts` | `globalFold`, `foldedOf`, `PUBLISHED_STEPS`, `StepValue.moves` (RC-1, RF-5, RR-1) |
| `src/views/forecast/engine/variance.ts` | Optional `WindowDef.costMonths` (RR-2: rounded-mode QTD and YTD cost end at the cost close) |
| `src/views/finance/engine/versions.ts` | `COMPANY_ONLY_NOTE` (RF-3) |
| `src/views/targets/engine/working.ts` | `workingOwnLines` (RF-4) |
| `src/views/team/` | `TeamModel.facts` removed (RM-5; tests call `teamFacts(ctx)`); `metrics.ts` `ALLOCATION_REQUEST_FIELDS` (B3; removed again in the close-out, below) |
| `src/views/data/engine/sharedFile.ts` (new) | `scopeIdentityOf`, `viewScopeKey`, `openedFileView` (RM-3, for M3's opener) |
| `src/views/actions/engine/` | `marksWithin`, `mergeMarksWithin` (`marks.ts`), `listedMarkKeys` (`index.ts`) (RM-4) |
| `src/access/scopes/` | `ScopeValues`, optional `TreeScope.values` and `UnitScope.values` (`types.ts`); `values.ts` (new, `scopeValues`) (B2) |
| `src/access/connect.ts` | `releasePinned` (B2). Removed: `scopeStillShows`, `wholeLabel` (nothing imported them) |
| `src/access/visibility.ts` | `hasAmount` and `managerText` read the wider amount grammar (RM-1); `auditView` reads every assumption value as "changed" where `cost:band` is hidden (RM-2) |
| `src/components/` | `Kpi.deltaEmpty` (`types.ts`); `targetComparisonEmpty`, `ComparisonContext`, `EmptyDelta`, `emptyDelta`, `emptyDeltas` (`kpiModel.ts`) (UI-2); `heldBack`'s third and `raiseText`'s second argument, `dataRoom` (`tier/tierModel.ts`, UI-6) |
| `src/data/fiscal.ts` | `PeriodOptions.fiscalYear` (UI-3) |
| `src/app/` | `actingAsRows.ts` (new, `actingAsRows`); `ActingAsPicker.tsx` exports `PickerBody` (UI-4) |
| `src/testkit/` (test code) | `leaks.ts`: the scanner's amount grammar now matches the guard's spellings (written apart from it); `sample.ts`: `BAND_EDIT`, `ManagerTextFixture.bandEntry` and `cutField`; `moves.ts`: optional `MoveRules.strictContributors`; `crawl.ts`: files carry `scopeKey`, `openShared` reads `openedFileView`, `SKIP` no longer holds `facts` |

### Added or changed in the M2 close-out (C34, R39, allocation lineage)

| Where | Exports |
|---|---|
| `src/views/forecast/engine/bridge.ts` | `LEAVE_MOVABLE` (the steps whose drivers come from a line's pay: timing, mix, pay rate, assumption rates) and `TRANSFERS_NOTE` (R39) (C34). `StepValue.band`, `bandAny` and `moves` keep their names and types and are now read from the leave-neutral seats, as `contributors` already was (RR-1); `globalFold` keeps its signature and is one fold per mode, comparison and window over grains (units in exact modes, kept cost atoms in rounded modes) with the FX month rule in exact modes; `foldedOf` applies that fold in every scope, keeps Other changes as a row and leaves no Rounding bar; `bridgeRows` keeps a Transfers row at 0. The internal `stepMovers`, `liveUnits` and `asPaid` are removed, and the file no longer imports `paidLineOf` |
| `src/views/forecast/engine/paidTwins.ts` (new) | `paidTwinsOf` (each unpaid seat line of a forecast run with its paid twin, priced from the run's own inputs; attack A1) |
| `src/views/forecast/engine/run.ts` | `runInputOf` (the `ForecastInput` a run was computed from; attack A1) |
| `src/cost/differences.ts` | No export changed; `StepFacts.moves` is documented as leave-neutral |
| `src/plan/engine/allocation.ts` | `AllocationSeatsInput.approvedSinceLock` removed and `AllocationSeatsInput.lockedPositions` added (a retype of the M1-frozen input: `allocationSeats` reads approved adds and eliminations from the position rows the approvals wrote, never a request); `approvalEndsBy`, `byRequestId` (M2-REPORT known gap 6, B3) |
| `src/views/team/engine/facts.ts` | `linedPositions` (the positions a line table has a line for, memoized per table) |
| `src/views/team/metrics.ts` | `ALLOCATION_REQUEST_FIELDS` removed; `ALLOCATION_CHANGE_FIELDS` added (`positions.sourceRequestId`, `positions.endReason`, `positions.endDate`) |
| `src/views/lineSource.ts` | No export changed. `paidLineOf` is now read only through `capSidesOf` (the bridge reads `paidTwinsOf`); when the Working context at the as-of date has no twin, it reads the same context costing every HRIS assignment (`futureAssignments`), so a person hired after a reporting date before the last close has one (verify step; every twin found before is unchanged) |
| `src/testkit/` (test code) | `moves.ts`: optional `MoveRules.strictRows` (no row, tile or value appears or goes away after a leave change), and the leave rules no longer let a row show or fold away. `src/views/team/engine/allocation.testkit.ts` (new): `sampleManagers`, `allocationDigest`, `ALLOCATION_BEFORE` (the 243 pinned allocation digests) |
