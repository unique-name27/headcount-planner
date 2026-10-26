# M1 contracts (frozen 13 Oct 2026)

The contracts for milestone M1 (docs/PLAN.md 17, "Freeze"). Builders fill bodies behind them and never
rename or retype an export; a builder who needs a change reports it to the lead. New exports may be
added. Every stub throws `notBuilt('<file>.<function>')` ("... is not built yet"); store methods reject
with `Error('not built')`.

## 1. Frozen files and their exports

### Data contracts phase (already frozen; listed for completeness)

| File | Exports |
|---|---|
| `src/data/schema.ts` | vocabularies, `Mode`/`MODES`/`isMode`, `Site`/`SITES`, the `*Row` record types, `Datasets`, `DATASETS`, `ASSUMPTION_KEYS`, views and pages (see its header) |
| `src/data/fiscal.ts` | fiscal months, years, quarters, `periodWindow` |
| `src/data/scope.ts` | `Filters`, `DEFAULT_FILTERS`, `PositionIndex`, `isActiveOn`; stubs `buildPositionIndex`, `subtreeIds`, `scopeDatasets` |
| `src/data/tabSync.ts` | tab messages (built); stubs `acquireWriter`, `releaseWriter` |
| `src/data/idb.ts`, `src/testkit/memoryIdb.ts` | `idbGet/idbSet/idbDel/idbKeys/idbClear` (built) |
| `src/data/quality/fieldRef.ts`, `tier.ts`, `src/charts/types.ts` | as ported |

### Plan contracts phase (this freeze)

| File | Exports |
|---|---|
| `src/plan/types.ts` | Re-exports the schema vocabularies (Month, FiscalYear, Level, Mode, PositionStatus, Proration, RequestType, RequestState, ReasonCode, ReqType, WorkerType, EndReason, CycleStage, FxSet, ISODate, ISODateTime, AssumptionRow). Types: Position, Assignment, SeatPlace, OrgMatch, SeatOrgFields, CostBasis, LocalAmounts, UsdAmounts, PlanLine, StringColumn, PlanLineNumber, PlanLineTable, RowsOf, FxRate, FxTable, VersionKind, VersionState, Version, WorkingVersion, LockedVersion, AnyVersion, LockedVersionRef, CohortMonth, ForecastMonth, ForecastTable, LeaveState, ActualLine, ActualLineNumber, ActualLineTable, MonthClose, CloseRef, AdjustmentKind, AdjustmentReason, Adjustment, StepRoleCode, Decision, ChainTrigger, ChainReason, Step, CommentAudience, Comment, ChangeableField, ChangeSet, TradeFields, TransferFields, RequestOutcome, HcRequest, CutLineMark, Cycle, AuditObject, AuditEntry, AuditDraft, AuditRow, Actor, DatasetOverlay, PositionChange, PlanEffect, WorkingPlan, ReconReview, PlanState, JsonValue, PlanStateSlice, WorkspaceKind, FullFileNotice, WorkspaceFile, WorkspaceBody |
| `src/plan/notBuilt.ts` | notBuilt |
| `src/plan/canonical.ts` | canonicalJson (built in the freeze; versions, audit and workspace all hash it) |
| `src/plan/store/types.ts` | READ_ONLY_NOTE, AuditFilter, LockAs, LockContent, PlanStoreDeps, PlanStore |
| `src/plan/store/memoryStore.ts` | MemoryStoreOptions, MemoryStore |
| `src/plan/store/browserStore.ts` | BrowserStoreOptions, BrowserStore |
| `src/plan/engine/proration.ts` | activeFraction, inYearFraction |
| `src/plan/engine/heads.ts` | isActiveOn, toAssignments, headsOn, averageFte |
| `src/plan/engine/assumptions.ts` | OrgPath, AssumptionLevel, AssumptionValue, AssumptionLookup, assumptionLookup |
| `src/plan/engine/cost.ts` | BurdenComponent, CostInput, AnnualLocal, annualLocal, MeritRule, PromotionRule, HrisRateInput, HrisRate, hrisRate, OneTimeKind, OneTimeItem, SeveranceInput, severanceOf, LineRates, LineContextInput, LineContext, lineContext, monthLine, positionLines, versionLines |
| `src/plan/engine/band.ts` | SH_BP, SeatType, Loads, BandEstimate, bandEstimate, loadsOf, TradeRates, weightBp (built: PLAN 11.3 gives the body), TradePosition, standardHeadRaw, standardHeadOf, TradeRatesInput, tradeRatesOf |
| `src/plan/engine/fx.ts` | rateOf, fxEffect |
| `src/plan/engine/lineTable.ts` | PLAN_LINE_NUMBERS, ACTUAL_LINE_NUMBERS, toPlanLineTable, planLineRows, toActualLineTable, actualLineRows |
| `src/plan/engine/versions.ts` | ENGINE_VERSION, toPosition, rowOn, SeatHistory, SeatState, seatHistories, seatOn, planHeadsAt, approvedHeadsOn, isLocked (built), workingOf, budgetOf, planOfRecord, LockHashInput, lockHash, verifyLock, LockInput, lockedFrom, ReopenInput, ReopenResult, reopenAsNew |
| `src/plan/engine/close.ts` | ADJUSTMENT_REASON, ActualsInput, actualLines, closeMonth, closedThrough, lastCloseDate, firstOpenMonth, adjustmentsFor |
| `src/plan/engine/forecast.ts` | monthlyRate, openedOn, OpeningForStart, forecastStart, ForecastInput, ExpectedStart, ForecastResult, forecast |
| `src/plan/engine/variance.ts` | TARGET_HAS_NO_MONTHS, emptyComparisonReason (built: PLAN 9.2 copy), MonthFigures, VarianceWindow, Measures, VarianceCell, VarianceInput, VarianceResult, variance |
| `src/plan/engine/bridge.ts` | BRIDGE_STEPS, BridgeStepKey, BRIDGE_STEP_LABEL, BridgeStep, BridgeResult, bridgeFromTotals, SeatDrivers, BridgeSeat, BridgeInput, priceSeat, bridge, BridgeSeatsInput, bridgeSeats |
| `src/plan/engine/targets.ts` | AsksSeat, AsksContext, AsksContextInput, asksContext, effectiveDateOf, headEffect, bandEffect, Asks, asks, AsksCost, asksCost, Gap, gap, gapAfterApproval, targetDateOf, targetFor |
| `src/plan/engine/allocation.ts` | AllocationSeatInput, AllocationSeat, AllocationInput, Allocation, allocation, AllocationSeatsInput, allocationSeats |
| `src/plan/engine/budgetStatus.ts` | StaffedPerson, StaffedDriver, StaffedMonth, staffed, PendingEffect, BudgetStatusWord, BudgetStatus, BudgetStatusInput, budgetStatus |
| `src/plan/engine/trade.ts` | FILLED_NOT_TRADED_TEXT, TradeAsk, TradeBlock, TRADE_BLOCK_ORDER, TradeSeat, TradeLine, TradeQuote, TradeContext, tradeQuote, tradeYearOf, creditBalance, applyTrade |
| `src/plan/engine/chain.ts` | ChainWho, ChainRule, CHAIN_RULES (data), ChainSeat, ChainOrg, PlanCheck, ChainFacts, ChainContext, outOfPlan, triggersOf, chainFor |
| `src/plan/engine/requests.ts` | ACCEPTED_OFFER_TEXT, REMOVE_AMOUNT_TEXT, AMOUNT_COMMENT_NOTE, BELOW_THE_CUT_LINE, RequestAction, TransitionContext, TransitionResult, transition, applyApproval, isPending, isExpired, fromRow, toRow, BackfillFlag, backfillFlag |
| `src/plan/engine/cycle.ts` | RankedAsk, rankAsks, CutLine, defaultCutAfter, cutLine, CycleAction, cycleTransition, lockOutcomes, notSubmitted, copyNote |
| `src/plan/engine/freeze.ts` | InTree, freezeCovers, freezeOn, freezeNotice, FreezeOpening, frozenOpenings, FreezeSavingsInput, FreezeSavings, freezeSavings |
| `src/plan/engine/transfer.ts` | TransferSides, transferSides, applyTransfer, BudgetMoveInput, budgetMove |
| `src/plan/engine/whatif.ts` | FREEZE_LEVER_NOTE, Lever, WhatIfInput, WhatIfResult, whatIf, leverSeats, turnIntoRequests |
| `src/plan/engine/reconcile.ts` | RECON_KINDS, ReconKind, HANDOVER_DAYS, ReconException, reconcile |
| `src/plan/audit/chain.ts` | GENESIS_HASH, entryHash, appendEntry, ChainCheck, verifyChain, chainStatusText |
| `src/plan/workspace/file.ts` | WORKSPACE_FORMAT, WORKSPACE_VERSION, MAX_WORKSPACE_BYTES, FULL_FILE_NOTICE, WORKSPACE_EXTENSION, workspaceChecksum, BuildFileInput, buildWorkspaceFile, serializeWorkspace, workspaceFileName |
| `src/plan/workspace/validate.ts` | hashMismatchText, NO_REQUESTS_TEXT, ReadResult, readWorkspace, requestsOf |
| `src/plan/workspace/diff.ts` | WorkspaceDiff, workspaceDiff |
| `src/plan/workspace/merge.ts` | MergeOptions, MergeConflict, MergeResult, mergeRequests, mergeSummary, mergePlanState |
| `src/cost/atoms.ts` | AtomKind, Atom, AtomIndex, leaderSeats, atomIndex, atomOf, isUnionOfAtoms |
| `src/metrics/types.ts`, `src/metrics/define.ts` | the template app's dictionary types and `defineMetrics`, ported with renames only (`MetricView` = `RouteView`, adding the Audit page) |
| `src/metrics/rules.ts` | RULE_ID, RuleId, PRIVACY_RULE_IDS, COST_GUARD_RULE_IDS, RuleSetting, ANONYMITY, PAY_AMOUNTS, LEAVE_COUNTS, MIN_COSTED, FLOOR_USD, MIN_CONTRIBUTORS, RULE_SETTINGS |
| `src/views/{team,plan,requests,forecast,targets,whatif,finance,audit}/metrics.ts` | `ID` (as const: exactly PLAN 12's ids for that home view, in order), `<View>MetricId`, `PARAM` (team, plan, requests: the settings PLAN 12 names), `metrics` (empty `defineMetrics('<view>', [])`) |

Fixtures (data, also frozen: change one only with the lead) live in `src/plan/engine/fixtures/`:
`common.ts` (builders), `proration.ts`, `heads.ts`, `cost.ts`, `versions.ts`, `band.ts`, `fx.ts`,
`forecast.ts`, `bridge.ts`, `targets.ts`, `budgetStatus.ts`, `chain.ts`, `trade.ts`, `atoms.ts`.
PLAN 10.2 and 11.7 name `chain.fixtures.ts` and `trade.fixtures.ts`; they are `fixtures/chain.ts` and
`fixtures/trade.ts`.

## 2. Who owns what (PLAN 17, M1)

| Builder | Wave | Files |
|---|---|---|
| Data core | 1 | `src/data/` minus `sample/` (fills the scope and writer-lock stubs; store, import, lists, quality, urlScope, context, settings, savedViews) and `src/testkit/` |
| Engines A | 1 | `plan/engine/{proration,heads,assumptions,cost,band,fx,lineTable,versions,close}.ts`, `src/cost/atoms.ts` |
| Engines B | 1 | `plan/engine/{forecast,variance,bridge}.ts` |
| Engines C | 1 | `plan/engine/{targets,allocation,budgetStatus,trade,chain,requests,cycle,freeze,transfer,whatif,reconcile}.ts`, `plan/audit/`, `plan/workspace/`, `plan/store/` (workspace builds file slices only from guarded models, never from a store) |
| Metrics | 1 | `src/metrics/` (catalog, registry, api, params, privacy, cost-guard rule entries, overrides, persist, testing) and the `metrics` array of every `src/views/*/metrics.ts` (the `ID` and `PARAM` maps are frozen) |
| Sample base | 1 | `src/data/sample/{prng,calendar,names,departments,org,positions,workers,comp,reqs,targets,freezes,assumptions,requests,personas}.ts` |
| Sample stories | 2 | `src/data/sample/{versions,closes,cycle,trades,stories}.ts`, `raw/`, `README.md`, `sample.test.ts`, `sample.perf.test.ts` (locks hashed with `sha256()`; each close stores its `atomIndex`) |

The lead owns `plan/types.ts`, `plan/notBuilt.ts`, `plan/canonical.ts`, `plan/store/types.ts` and the
fixtures.

## 3. Which fixtures each engine must pass

| Engine file | Fixture ids | Test file |
|---|---|---|
| `proration.ts` | PR1 to PR13 (incl. R20's literal 0.5); C1 September fractions | `proration.test.ts` |
| `heads.ts` | H1, H2 (and contractors, interns, early assignment ends) | `heads.test.ts` |
| `cost.ts` (+ `assumptions.ts`) | C1, C2, C2b, C3, C4; H3's lines | `cost.test.ts`, `versions.test.ts` |
| `band.ts` (+ `assumptions.ts`) | the 11.7 seat table and part-time seats, F-S, F-S2, BL1 | `band.test.ts` |
| `fx.ts` | X1, X2 | `fx.test.ts`; BX2 in `bridge.test.ts` |
| `versions.ts` | H3, H4; G1's approved heads; T1-applied | `versions.test.ts`, `targets.test.ts`, `trade.test.ts` |
| `cost/atoms.ts` | AT1, AT2 | `src/cost/atoms.test.ts` |
| `forecast.ts` | F1, F2, F3, FS1; H3's `openedOn` | `forecast.test.ts`, `versions.test.ts` |
| `variance.ts` | EV1 | `bridge.test.ts` |
| `bridge.ts` | B1, B1-cents, BX2 (with X2), EV1 | `bridge.test.ts` |
| `targets.ts` | G1, G2, G3, A2; T1-applied head effect | `targets.test.ts`, `trade.test.ts` |
| `cycle.ts` | G1's cut line | `targets.test.ts` |
| `allocation.ts`, `budgetStatus.ts` | A1 (1) to (5) | `budgetStatus.test.ts` |
| `chain.ts` | CH1 to CH5; T1, T1′, T1h, T2, T3, T4, T6 chains | `chain.test.ts`, `trade.test.ts` |
| `trade.ts` | T1, T1′, T1h, T2 to T6, T7a, T7b, CR1, the 11.7 properties | `trade.test.ts` |
| `reconcile.ts` | H3, H4 | `versions.test.ts` |
| `lineTable.ts`, `close.ts`, `requests.ts`, `freeze.ts`, `transfer.ts`, `whatif.ts`, `audit/chain.ts`, `workspace/*`, `store/*` | none in PLAN 6, 10.2 or 11.7; each builder writes the tests PLAN 16.2 lists | their own |

Tests cross builders: `versions.test.ts` also needs `forecast.openedOn` (B) and `reconcile` (C);
`trade.test.ts` and `targets.test.ts` need `versions.seatHistories` and `approvedHeadsOn` (A). The
trade fixtures price seats with their own copy of the 11.3 band formula (`fixtureBandUsd`), so trade
and chain tests never wait on `band.ts`.

## 4. The freeze check

Every failure under `src/plan` and `src/cost` is a `... is not built yet` stub (168 at the freeze);
everything else passes. With this repo's Vitest 5.0.3, `--exclude` does not reach the `unit`, `slow`
and `perf` projects (the CLI exclude is applied to the root config only), so
`npx vitest run --exclude "src/plan/**" --exclude "src/cost/**"` still runs the plan tests. The
equivalent that works without touching `vite.config.ts`:

```
npx vitest run src/app src/charts src/data src/lib src/metrics src/ship src/styles src/testkit src/views src/plan/canonical
```
