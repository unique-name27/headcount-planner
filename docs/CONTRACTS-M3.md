# M3 contracts (frozen 23 Oct 2026)

The contracts for milestone M3 (docs/PLAN.md 17, "Freeze"): the write path. Every change a person
makes in the app is one pure action, `(state, ctx, input) => ActionResult`, that checks the policy
first (`decide(mode, 'action:<id>')`), then the person-level rules of 8.4, then its own rules, and
returns the next plan state with its audit drafts (`by` = the Acting as person) and a plain notice,
or a refusal in one sentence. `src/app/write/` runs actions, saves through the PlanStore (and its
write lock) and appends the audit drafts in order, and the analytics context rebuilds, so every model
re-renders from the new plan state.

Builders fill bodies behind these contracts and never rename or retype an export; a builder who
needs a change reports it to the lead. New exports may be added, and model interfaces may gain
fields. Every stub throws `notBuilt('<file>.<function>')` (src/plan/notBuilt.ts); stub parameters
carry a leading `_`. Data (id lists, the action registry and the ids each action checks, audit field
ids, figure ids, the write path's copy) is written in full and is frozen like a signature. Readings
and changes in PLAN 15 (R1 to R46, C1 to C34) override earlier PLAN text wherever they differ.

The freeze adds 89 stubs (section 5). No existing export was renamed; one M2 type was retired
(`ScopedWorkspaceFile`, section 1.8) and three M2 placeholders were retyped as their comments said
M3 would (`RequestsModel.new`, `WhatIfLevers`, `whatifModel`).

## 1. Frozen files and their exports

### 1.1 Plan state types (`src/plan/types.ts`, additions)

| Export | Change |
|---|---|
| `WorkspaceFile.scopeKey?: string` | The scope identity a file was made for (`scopeKeyOf`, 'scope-sha256-<hex>'), beside `scopeLabel`. "Open a shared file" compares it, never the label; a file without one shows no figures (M2 review RM-3, M2-REPORT known gap 2). Replaces M2's `ScopedWorkspaceFile` |
| `CycleOrder` (new), `Cycle.order?: readonly CycleOrder[]` | Each unit's ranked order of asks as the HRBP (or a leader, within the envelope) set it (`action:cycle.rank`); cycle.ts `rankAsks` reads it as `order`. A manager ranks only their own asks, by each request's `priority` |

### 1.2 The actions (`src/plan/actions/`, new)

plan/ never imports `access/` (src/ship/imports.test.ts, types included), so the action context
carries what the access layer decides as plain functions and data.

| File | Exports |
|---|---|
| `types.ts` | `ActionDecision` (the policy's `Decision`, restated), `ActionRequestView`, `PersonRules` (requestView, commentVisible, hasAmount, seatInScope, placeInScope, unitInScope, hrbpUnits, ownSeats, leaderSeats, mayMerge), `ActionSettings` (idleDays, minCosted, minContributors, leaderThresholdUsd), `ActionSeat`, `ActionIds`, `ActionEnv` (requests, seat, working, transitionContext, quote, asks, assumptionEditRefusal, computeLock, closeInput, rankedAsks, seatBandUsd, targets, subOrgsOf, exceptions, ids), `ActionContext` (mode, actor, at, asOf, datasets, settings, readOnly, writeBlock, decide, rules, env), `ActionOk` (`ok: true; next; audit; notice; datasets?`), `ActionRefused` (`ok: false; refused`), `ActionResult`, `PlanActionFn<I>` |
| `ids.ts` | Data: `WRITE_ACTION_IDS` (41 ids that write plan state), `WriteActionId`, `NOT_PLAN_WRITE_IDS` (15 ids that never do: reads, the clipboard, `data.import`, exports), `NotPlanWriteId`. Built: `isWriteActionId`, `actionSurface`. The two lists together are exactly src/access/ids.ts `ACTION_IDS` (tested) |
| `copy.ts` | Data, written in full: the refusals and notices the actions return that are not the policy's `how` or an engine's (`NOT_FOUND_TEXT`, `NOT_SHOWN_TEXT`, `OUTSIDE_SCOPE_TEXT`, `OUTSIDE_UNIT_TEXT`, `SEAT_NOT_EDITABLE_TEXT`, `WORKING_ONLY_TEXT`, `REASON_REQUIRED_TEXT`, `NOT_EDITABLE_REQUEST_TEXT`, `USE_TYPE_ACTION_TEXT`, `OPERATIONAL_ONLY_TEXT`, `PAST_ENVELOPE_TEXT`, `TARGET_RANGE_TEXT`, `FREEZE_DATES_TEXT`, `CLOSE_ORDER_TEXT`, `workingExistsText`, `NO_FILE_TEXT`, and one notice per action: `draftSavedNotice` ... `WORKSPACE_MERGED_NOTICE`), plus re-exports of the PLAN's exact texts the engines hold (`READ_ONLY_NOTE`, `ACCEPTED_OFFER_TEXT`, `REMOVE_AMOUNT_TEXT`, `AMOUNT_COMMENT_NOTE`, `NOT_YOUR_STEP_TEXT`, `BELOW_THE_CUT_LINE`, `FILLED_NOT_TRADED_TEXT`, `FREEZE_LEVER_NOTE`). No notice holds an amount (tested) |
| `gate.ts` | Stubs: `gate(ctx, id)` (reader tab READ_ONLY_NOTE, then `ctx.writeBlock`, then `ctx.decide('action:<id>')`: hidden refuses with its `how`), `decisionOf`, `isLimited`, `freeTextRefusal(ctx, text, required?)` (8.4 rule 5 at entry: REMOVE_AMOUNT_TEXT; REASON_REQUIRED_TEXT) |
| `requests.ts` | Inputs `DraftCommon`, `RequestDraft` (New role, Backfill, Level change, Location change), `CreateRequestInput`, `RequestPatch`, `EditRequestInput`, `EliminationInput`, `RecruitInput`, `ProposeStartInput`, `RequestRef`, `SubmitOnBehalfInput`, `ApproveWithChangesInput`, `ReasonInput`, `CommentInput`, `FreezeExceptionInput`. Stubs: `createRequest`, `editRequest`, `requestElimination`, `requestRecruiting`, `proposeStart`, `submitRequest`, `submitOnBehalf`, `withdrawRequest`, `approveRequest`, `approveWithChanges`, `sendBack`, `rejectRequest`, `commentOnRequest`, `setFreezeException` |
| `seats.ts` | `SeatChanges`, `SeatEditInput`. Stub: `editSeat` (HRBP Working edits with a reason) |
| `transfers.ts` | `TransferInput`. Stub: `processTransfer` (a Transfer Draft; "Move budget too?") |
| `trades.ts` | `TradeInput`. Stub: `createTrade` (quoted with `env.quote`, credit included) |
| `freezes.ts` | `FreezeInput`, `FreezeEditInput`. Stubs: `createFreeze`, `editFreeze` |
| `versions.ts` | `CreateVersionInput`, `LockVersionInput`, `ReopenVersionInput`, `CloseMonthInput`, `FxRateInput`, `SetFxInput`. Stubs: `createVersion`, `lockVersion` (src/plan/store/memoryStore.ts `lockInto` with `env.computeLock`), `reopenVersion`, `closeMonth`, `setFx` |
| `assumptions.ts` | `AssumptionEditInput`. Stubs: `editAssumptions` (7.4's edit rule for Finance through `env.assumptionEditRefusal`), `editOperational` |
| `targets.ts` | `TargetKey`, `SetTargetInput`, `SubOrgTarget`, `SplitTargetInput`, `MoveTargetInput`. Stubs: `setTarget`, `splitTarget`, `moveTarget` |
| `cycle.ts` | `OpenCycleInput`, `CycleRef`, `CycleDatesInput`, `FinishStageInput`, `RankAsksInput`, `CutLineInput`, `ReturnCycleInput`. Stubs: `openCycle`, `setCycleDates`, `finishStage`, `rankCycleAsks`, `moveCutLine`, `lockCycle`, `returnCycle` |
| `recon.ts` | `MarkReviewedInput`. Stub: `markReviewed` |
| `whatif.ts` | `TurnIntoRequestsInput`. Stub: `turnLeversIntoRequests` |
| `workspace.ts` | `RequestFile`, `ImportRequestsInput` (files, conflict `choices`), `WorkspaceImportInput`. Stubs: `importRequests`, `replaceWorkspace`, `mergeWorkspace` |
| `index.ts` | Re-exports every file. Data: `ACTIONS` (41 actions by name), `ActionName`, `ActionInput<N>`, `ACTION_CHECKS` (the ids each action checks, below). Built: `runActionByName(name, state, ctx, input)` (dispatch only) |
| `contracts.test.ts` | The freeze's own checks (section 5) |

The ids each action checks (`ACTION_CHECKS`; the first always, the others where its comment says):

| Action | Ids | Notes |
|---|---|---|
| `createRequest`, `editRequest`, `requestElimination` | `request.draft` | Manager and Leader limited: inside the team or org |
| `requestRecruiting` / `proposeStart` | `request.recruit` / `request.propose-start` | Start recruiting and Start date (R5): one HRBP step; approval writes the HRBP's audited Working edit |
| `submitRequest`, `submitOnBehalf`, `withdrawRequest` | `request.submit`, `request.submit-on-behalf`, `request.withdraw` | resubmit of a Sent back request is `submitRequest` |
| `approveRequest`, `sendBack`, `rejectRequest` | `request.approve`, `request.send-back`, `request.reject` (+ `transfer.approve` on a Transfer) | limited "Only on steps assigned to you." |
| `approveWithChanges` | `request.approve-with-changes` | the HRBP step only; Leader "Within your envelope." |
| `commentOnRequest`, `setFreezeException` | `request.comment`, `freeze.exception` | |
| `editSeat`, `processTransfer`, `createTrade` | `position.edit`; `transfer.process` (+ `transfer.move-budget`); `request.trade` | |
| `createFreeze`, `editFreeze`, `createVersion`, `lockVersion`, `reopenVersion`, `closeMonth`, `setFx` | `freeze.create`, `freeze.edit`, `version.create`, `version.lock`, `version.reopen`, `close.month`, `fx.set` | Finance and HR admin |
| `editAssumptions`, `editOperational` | `assumptions.edit`, `assumptions.edit-operational` | 7.4's edit rule for Finance |
| `setTarget`, `splitTarget`, `moveTarget` | `target.set`; `target.split`, `target.move` (+ `target.exception` past the envelope) | |
| `openCycle` ... `returnCycle` | `cycle.open`, `cycle.dates`, `cycle.advance`, `cycle.rank`, `cycle.cut-line`, `cycle.lock`, `cycle.return` | |
| `markReviewed`, `turnLeversIntoRequests` | `recon.review`, `whatif.turn-into-requests` | |
| `importRequests`, `replaceWorkspace`, `mergeWorkspace` | `request.import`, `workspace.import` | files are read before the action (section 1.6) |

### 1.3 Audit field ids and the overlay

| File | Exports |
|---|---|
| `src/plan/audit/fields.ts` (new) | Data: `POSITION_AUDIT_FIELDS`, `AUDIT_FIELDS` (per `AuditObject`: what `id` is and every `field` the write path writes; patterns `step <n>`, `cutLine <unit>`, `order <unit>`), `AMOUNT_AUDIT_FIELDS` (`targetCost`: read "changed" outside HR admin by `isPayField`; an assumption's `value` is read "changed" where `cost:band` is hidden, review RM-2). A builder that writes a new field adds it here in the same change |
| `src/plan/store/overlay.ts` (new) | Stubs: `withOverlay(datasets, plan)` (Working's overlay rows over the imported datasets; returns `datasets` itself when the overlay is empty), `overlayEmpty(plan)` |

### 1.4 The app write path (`src/app/write/`, new; `src/app/boot.ts`, `src/app/planState.ts`)

| File | Exports |
|---|---|
| `write/context.ts` | `ActionContextOptions` (readOnly, at). Stubs: `actionContextOf(ctx, opts)`, `personRulesOf(ctx)`, `actionEnvOf(ctx)`, `actionSettingsOf(ctx)` |
| `write/routing.ts` | `GuardedAsks` (heads, cost or null), `GuardedAsksInput`. Stubs: `chainContextOf(ctx, req)` (routing on the guarded asks cost, 7.2 rule 8, leaving out what 8.4 rule 3 hides from the requester, rule 8), `guardedAsksOf(ctx, input)`, `hiddenFromRequester(ctx, req)`. Read by the env, Requests > New's chain preview, Approvals' gap after approval and the cycle's envelope check |
| `write/lock.ts` | Stubs: `lockContentOf(ctx, working, at, as?)` (M2-REPORT known gap 1, "computeLock still throws"), `setLockContext(get)`, `computeLockNow(working, at)` |
| `write/run.ts` | `WriteOutcome` (`{ ok: true; notice } \| { ok: false; refused }`), `WriteDeps` (store, ctx, sample, now, replaceDatasets?, reload?). Stubs: `runAction(deps, name, input)`, `saveResult(deps, result)`; never reject |
| `write/usePlanWrite.ts` | `PlanWrite` (readOnly, blocked, can(name), run(name, input)). Stub hook: `usePlanWrite()` |
| `write/harness.ts` | `WriteHarnessInput`, `WriteHarness` (store, ctx(), run, as). Stub: `writeHarness(input)` (a MemoryStore and a clock; scenario tests walk flows through it exactly as the hook runs them) |
| `boot.ts` | The store's deps (`APP_DEPS`, was `READ_ONLY_DEPS`): `computeLock` now calls `write/lock.ts` `computeLockNow` (the same computation the `lockVersion` action reads) |
| `planState.ts` | Stubs: `storedFor(next, sample)` (on the sample, only what differs from its plan, as the overlay against `baselineId`), `reloadPlan(store)` |

### 1.5 Access (`src/access/`)

| File | Exports |
|---|---|
| `contextAs.ts` (new) | Stub: `contextAs(ctx, input: AccessInput)` (the same data in another mode and Acting as; Export for a manager builds its file in it) |
| `surfaces.ts`, `ids.ts`, `policy/kit.ts` | New masthead control `workspace` (`MastheadControl`, `MASTHEAD_CONTROLS`), decided in every mode: HR admin shown, every other mode limited "Lists only the files this mode saves and opens." The menu's items each follow their own `action:` decision. `access-matrix.txt` (+1 line) and `access-how.txt` (+4 lines) were regenerated for it; nothing else in them moved |

### 1.6 What the views call across owners

| File (owner) | Exports |
|---|---|
| `src/cost/edits.ts` (finance-ui, new) | Built: `editRefusedText(min)` ("This change would move cost for fewer than 5 costed people."). `EditMove` (positionId, month, fold part), `EditMovers`. Stubs: `editMovers(moves)`, `editRefusal(moves, min)` |
| `src/views/finance/engine/edits.ts` (finance-ui, new) | Stubs: `assumptionEditCheck(ctx, edits, versionId)` (what `ActionEnv.assumptionEditRefusal` calls: "Set by import." for an HR-admin-only table outside HR admin; 7.4's sentence when 1 to 4 move in all or in one fold part and month), `editNoteOf(ctx, row, versionId)` |
| `src/views/requests/engine/new.ts` (requests-ui, new; re-exported from `engine/index.ts`) | `NewTypeOption`, `NewSeatRow`, `NewFreezeNote`, `RequestsNew` (the tab's model), `NewRequestForm`, `ChainPreviewStep`, `TradeQuoteCard`, `NewRequestAction` (the Save button's action name and input), `NewRequestPreview`. Stubs: `requestsNewOf(ctx)`, `emptyForm(type)`, `newRequestPreview(ctx, form)` |
| `src/views/requests/engine/index.ts`, `figures.ts` (requests-ui) | `RequestsModel.new: RequestsNew \| null` (was `null`; the model still returns null until `requestsNewOf` is filled). Figure ids `requests-new-seats`, `requests-new-chain`, `requests-new-quote` |
| `src/views/whatif/engine/index.ts` (whatif) | `Lever` (re-export), `LeverRow`, `LeverSeatRow`, `LeverTrade`, `WhatIfLevers` (now extends `TabModel` with levers, seats, trades, turnInto), `WhatIfModel`. Stubs: `whatifModel(ctx, levers = [])`, `whatifHeadline(ctx, levers?)` (the session's levers when none are given) |
| `src/views/whatif/engine/session.ts` (whatif, new) | `WhatIfSession`. Stubs: `leversFor(scopeKey)`, `leversNow()`, `setLevers(scopeKey, levers)`, `clearLevers()`, `subscribeLevers(fn)` (memory only, never stored). Figure id `whatif-seats` |
| `src/views/data/engine/workspace.ts` (workspace-ui, new) | `FileOut`, `FileResult`, `ExportManager`, `RequestsPreview`, `SharedFileView`. Stubs: `shareableSlice(ctx)`, `shareableFile(ctx, at)`, `requestsFile(ctx, at)`, `managersForExport(ctx)`, `forManagerFile(ctx, managerPersonId, at)`, `fullFile(ctx, at)`, `readFile(ctx, text, size)`, `importPreview(ctx, text, size)`, `importRequestsPreview(ctx, files)`, `openSharedFile(ctx, text, size)` (built on the pinned `openedFileView`, `sharedFiguresShown`, `scopeKeyOf`) |
| `src/views/data/ui/WorkspaceMenu.tsx` (workspace-ui, new) | `WorkspaceMenu`, `SharedFileDialog`, `ImportDialog`, `ImportRequestsDialog`: render nothing until filled, so the core builder can place the menu in the masthead from day one |
| `src/views/plan/engine/edits.ts` (plan-ui, new) | `SeatEditFacts`, `HrbpChangeNote`, `TransferOptions`. Stubs: `seatEditOf(ctx, positionId)`, `changedByHrbp(ctx, positionId)` ("Changed by your HRBP: start moved from Jan to Mar", read by Plan > Positions and My team), `transferOptions(ctx)` |

### 1.7 Engines

No engine signature changed. `src/plan/engine/` stays as M1 and M2 left it (core owns it, What if's
`whatif.ts` aside); the actions call `transition`, `chainFor`, `cycleTransition`, `lockOutcomes`,
`tradeQuote`, `creditBalance`, `applyTrade`, `applyTransfer`, `budgetMoveEffects`, `reopenAsNew`,
`lockedFrom`, `closeMonth`, `adjustmentsFor`, `turnIntoRequests` and `reconcile` as they are.

### 1.8 Retired and retyped

| Export | What changed |
|---|---|
| `src/plan/workspace/file.ts` `ScopedWorkspaceFile` | Removed (it stood in for `WorkspaceFile.scopeKey`). `buildWorkspaceFile` returns, and `serializeWorkspace` takes, `WorkspaceFile`; validate.ts `ReadResult.file` is a `WorkspaceFile` |
| `RequestsModel.new` | `null` → `RequestsNew \| null` |
| `WhatIfLevers`, `whatifModel`, `whatifHeadline` | `WhatIfLevers` was `TabModel`, now an interface extending it; the model takes the session's levers (`levers = []`), the headline optional levers. The ViewDef's `headline: (ctx) => Headline` still fits |
| `src/app/boot.ts` `READ_ONLY_DEPS` | Renamed `APP_DEPS` (module-private); `computeLock` calls `computeLockNow` instead of throwing `app/boot.computeLock` |

## 2. Who owns what (M3 build)

One builder per file. A builder may add files inside its folders; a file outside them is a
`needsElsewhere` for the lead. The lead owns the docs, `src/views/types.ts`, `src/views/contracts.test.ts`
and `src/metrics/catalog.ts`.

| Builder | Folders | What it builds |
|---|---|---|
| core | `src/plan/actions/**`, `src/plan/store/**`, `src/plan/audit/**`, `src/plan/engine/**` (except `whatif.ts`), `src/plan/types.ts` additions, `src/app/**`, `src/access/**`, `src/data/tabSync.ts` | Every action and the gate; the overlay merge; the write path (context, env, rules, routing, lock, run, the hook, the harness), `storedFor` and `reloadPlan`; `contextAs`; the masthead's Workspace control placing `WorkspaceMenu`; the write lock UI (the hook's `blocked` beside every button, with the masthead's read-only tag). Also, by lead assignment (needsElsewhere): the one call that applies `withOverlay` in `src/data/context.tsx` `buildContext` (section 4) |
| requests-ui | `src/views/requests/**` | Requests > New (every type, the trade flow of 11.5, the chain preview, freeze notice and exception, band estimate and gap after approval by mode), Mine (Export requests), Approvals (approve, approve with changes, send back, reject), Queue (Import requests in the header), Cycle (rank, cut line, finish stage, lock and return, Copy note) |
| plan-ui | `src/views/plan/**`, `src/views/team/**`, `src/views/home/**` | HRBP seat edits on Plan > Positions with "Changed by your HRBP" on the seat and in My team; Plan > Transfers (process, move budget); the homes after writes (Needs attention items closing by state) |
| finance-ui | `src/views/finance/**`, `src/views/targets/**`, `src/cost/**` | Finance > Versions (create, lock, reopen, month close), Assumptions (FX and assumption edits under 7.4's rule, operational edits), Freezes (create, edit), Reconcile (mark reviewed); Targets (set, split, move, the envelope); `src/cost/edits.ts` and the two `it.todo` cases of `assumptionEdits.slow.test.ts` |
| whatif | `src/views/whatif/**`, `src/plan/engine/whatif.ts` | The Levers tab: the lever list and pickers, the result strip (three KPIs plus one trade ratio per trade lever, each with its calc under 7.2 rule 5), session memory, "Turn into requests" |
| workspace-ui | `src/views/audit/**`, `src/views/data/**`, `src/views/actions/**`, `src/plan/workspace/**`, `src/data/sample/**` | The workspace entry points and menu, Open a shared file, Import with the diff then Replace or Merge, Import requests with the merge summary and conflicts; the Audit page and the Action center after writes; `validate.ts` reading `Cycle.order`; the sample's six request files |

`src/testkit/**` is not in any list: the privacy re-crawl of M3's review needs the crawl to read
Requests > New's model, What if's model and the app's own file writers (`shareableFile`, `requestsFile`,
`forManagerFile`). The lead assigns it (section 6).

## 3. The scenarios each owner's tests walk

Every scenario runs through the write path as the app does: `src/app/write/harness.ts` `writeHarness`
over a MemoryStore with the clock pinned, contexts from `src/testkit/sample.ts`, and the models read
after each step. After every scenario `verifyChain` passes over the store's log and every entry's
`by` is the Acting as person of its step. No leak, privacy, attack or perf test is weakened by any of
them.

| Owner | Scenarios (PLAN) |
|---|---|
| core | Each action's allowed path and every refusal, decide first: hidden refuses with the policy's `how` in each mode; a reader tab refuses with READ_ONLY_NOTE before the policy (5.4, `PlanStore` write refused in a reader tab, 16.2); no Acting as pick refuses with "Pick who you act as before making changes." **Draft to started** (a New role drafted by a manager, submitted, approved at each step by each approver acting as themselves, the Planned position in Working, the tracker after approval); **sent back** and resubmitted; **approved with changes** (the manager reads each change with its reason; a reason with an amount refused, 8.4 rule 5); **freeze exception** (adds a Finance step, 10.4); **cross-unit transfer** with "Move budget too?" (both HRBPs and both leaders; the target rows and their 'target' entries); **cycle to lock** (above the cut line approved with Planned seats added, below Rejected "Below the cut line"); **trade with credit** (T1 approved, then T3 spending its 1,104 bp, `creditBalance` 0, 11.7); **elimination of Manager C's seat** (C and the manager below see nothing; C's and the manager below's New role and Trade route the same with and without it, 16.1 (a), 8.4 rule 8); version lock and reopen (hashes unchanged, exactly one Working per year, 16.1); month close with back-dated adjustments; Finance's FX and assumption edits refused through the action under 7.4 (with finance-ui's check); `runAction` saves `storedFor(next, sample)` so a reload keeps the change (5.4) |
| requests-ui | Requests > New in every mode: the types offered and their reasons, an accepted-offer seat naming only an Elimination, the freeze notice and exception, the chain preview equal to the steps stored at submit (16.1 Manager C (a)), Manager mode printing no amount (the leader threshold never), the trade card's sentences (11.5, T1 and T6); Approvals' four decisions with the gap after approval in heads, and in cost only under 7.3 or 7.4's org-row rule; Queue's Import requests on the six sample files: "Merged 14 requests from 6 files, 2 conflicts", the later `updatedAt` winning, conflicts listed (5.5, 16.2); Cycle: rank, move the cut line, finish HRBP and Leader review, lock (the cut line never shown in Manager mode) |
| plan-ui | An HRBP start move on an Open seat through `editSeat`: Plan > Positions' row, "Changed by your HRBP: start moved from Jan to Mar" on the seat and in My team for its manager, and every atom's exact filled part unchanged (7.2 rule 3); an accepted-offer seat and a Filled seat offered no edit; a transfer processed on Plan > Transfers; the homes' Needs attention items closing when their request is decided |
| finance-ui | Lock the FY27 Q2 Reforecast and reopen it (Finance > Versions, one Working, both hashes unchanged); close October with back-dated adjustments (counts only outside HR admin with the switch, 9.4); the two `it.todo` cases of `assumptionEdits.slow.test.ts`: (a) the TWD rate and a company or Corporate Taiwan burden rate refused with 7.4's sentence through `editAssumptions`, and a `createVersion` carrying one, while the EUR plan rate goes through; (c) a cap, date, cutoff or pay percentage refused in Finance with "Set by import.", and a `createVersion` carrying one; R37's refusals on the sample; a freeze created and its openings held; Mark reviewed; a target set, split and moved inside the envelope, and refused past it for a leader |
| whatif | Levers to results: deferring one Planned seat shows its band delta in HRBP, Leader and Finance (a band figure, 7.2 rule 5); a lever whose two sides differ in an HRIS or offer amount is guarded; a freeze lever plus one cancel lever turns into exactly one Elimination draft with FREEZE_LEVER_NOTE (16.2); a trade lever blocks Filled and accepted-offer seats (11.8) and shows its ratio; the levers reset for another Acting as person; `editInvariance.slow.test.ts`'s What if levers still move no filled part |
| workspace-ui | Export Shareable, Export requests, Export for a manager and the Full file in each mode they show in; **an HRBP Shareable opened in Manager mode acting as Manager C** shows no ID, count, comment, audit row, Action item or amount of the elimination (16.1 (b)); a namesake manager sees none of another team's figures (RM-3); Export for a manager for C byte-equal with and without the elimination and clean of amounts (16.1 (c)); Import with the diff, then Replace or Merge, and the hash-mismatch refusal ("This file's FY27 Budget does not match this workspace's (hash differs). Nothing was imported."); the Audit page after writes ("n entries" outside HR admin, "Chain checks out (n entries)" in HR admin, no `seq`, `prevHash` or `hash` outside it) |

## 4. Notes for builders

- **Decide first, then the person, then the rule.** Every action calls `gate(ctx, id)` for each id
  it checks before it reads anything else: a reader tab, then the Acting as block, then the policy.
  A limited id goes on and the action applies its own rule with its own sentence. A request whose
  `rules.requestView` is 'none' is refused with NOT_SHOWN_TEXT and never counted (8.4 rules 3 and 6).
- **Free text a manager can read refuses an amount at entry** (`freeTextRefusal`): the HRBP seat-edit
  reason, the approve-with-changes, send-back and reject reasons, the freeze-exception business
  reason and a freeze's reason. A comment with an amount is forced to Approvers only, and the notice
  says AMOUNT_COMMENT_NOTE. Notices never hold an amount (7.2 rule 6); `contracts.test.ts` scans the
  copy with `hasAmount`.
- **Where writes land.** Requests in `state.requests` (an imported request is copied in and replaces
  its row by `requestId`); position rows, targets, freezes and Working's assumption rows in
  `state.overlay`; cycles, closes, adjustments, reviews and the merge base in their lists. Locked
  versions are never edited; `lockVersion` adds one through `lockInto`.
- **The overlay is applied once.** From M3, `ctx.all` and `ctx.data` hold the overlay: `buildContext`
  lays `withOverlay(data, plan)` over the datasets before the scope clamp (the core builder adds that
  one call). No view applies `plan.overlay` itself: plan-ui removes `src/views/team/engine/facts.ts`'s
  own append of overlay positions and assumptions (which would then count twice); finance-ui's
  replace-by-key in `src/views/targets/engine/base.ts` is then a no-op and may stay. With an empty
  overlay `withOverlay` returns the same datasets object, so M2's memoized models and every leak test
  are unchanged.
- **Saving.** `runAction` saves `storedFor(next, sample)`, then appends the audit drafts in order,
  then replaces datasets (a Full Replace only), then `reloadPlan`. Builders never call the store
  directly; views call `usePlanWrite().run(name, input)` and show `notice` or `refused` themselves.
- **One routing.** The chain a draft would store, the gap after approval, the cycle's envelope check
  and the over-target flags all read `src/app/write/routing.ts`; nothing compares a target with an
  exact HRIS sum (7.2 rule 8, C19).
- **Models are still the contract.** Every number on a form comes from a model (`requestsNewOf`,
  `newRequestPreview`, `whatifModel`, `seatEditOf`, the Finance and Targets models): components render
  it and compute nothing, so the leak crawl reads what people see. A model that previews a write
  (a chain, a quote, a gap after approval) goes through the guard exactly as the lists do.
- **Figure ids.** Requests and What if gained ids (sections 1.6). The Data room's UI must draw exactly
  `DATA_FIGURES` (`DataRoom.test.ts`) and My team's exactly `TEAM_FIGURES` (`rules.test.ts`), so
  workspace-ui and plan-ui add any `data-` or `team-` figure id in the same change as the UI that
  draws it.
- **Audit field ids.** A new `field` goes into `src/plan/audit/fields.ts` in the same change;
  `contracts.test.ts` checks that only the amount fields read as amounts.
- **Scenario harness.** `writeHarness({ initial, contextOf, now })` with `contextOf(plan, audit) =>
  sampleCtx(mode, { sample: withPlan(s, plan), audit, picks })` walks a flow; `as(otherContextOf)`
  reads the same store as another mode or person.
- **Reader tabs.** The data store's `readOnly` and the PlanStore's follow the same Web Lock; the hook
  reports either. Exports and Open a shared file still work in a reader tab; every import and write
  is disabled with READ_ONLY_NOTE beside it.

## 5. The freeze check

Run from the project root on 23 Oct 2026 (Node 24.14.1), after the last change of the freeze:

| Check | Result |
|---|---|
| `npx tsc --noEmit -p .` | Clean, no errors |
| `npx biome check src` | 899 files checked, no findings |
| `npx vitest run --project unit` | 242 files, 2,721 tests passed, 0 failed (51 s). Before the freeze: 241 files, 2,711 tests |

`src/plan/actions/contracts.test.ts` (new, 10 cases) checks: the write and non-write ids are exactly
`ACTION_IDS`, disjoint; every write id is checked by some action and every action checks only write
ids; `ACTIONS` and `ACTION_CHECKS` name the same 41 actions, each taking three arguments; every write
id has an explicit decision in every mode with a reason where it is not shown; `masthead:workspace`
is shown in HR admin and limited elsewhere; the amount audit fields read as amounts and no other
field does (one exception noted, section 6); every text and notice of `copy.ts` has no em dash, no
"!", no amount, starts with a capital and ends with a full stop (the reason code "Below the cut line"
aside). The access snapshot test passes on the regenerated snapshots (section 1.5).

No existing test reaches a stub. The freeze adds 89 `notBuilt` stubs: 45 in `src/plan/actions/`, 2 in
`src/plan/store/overlay.ts`, 14 in `src/app/write/`, 2 in `src/app/planState.ts`, 1 in
`src/access/contextAs.ts`, 2 in `src/cost/edits.ts`, 2 in `src/views/finance/engine/edits.ts`, 3 in
`src/views/requests/engine/new.ts`, 5 in `src/views/whatif/engine/session.ts`, 10 in
`src/views/data/engine/workspace.ts` and 3 in `src/views/plan/engine/edits.ts`; What if's
`whatifModel`, `whatifHeadline` and `View` stay stubs from M2, and app/boot's `computeLock` stub moved
into `computeLockNow`. The slow and perf projects were not run (they read no M3 contract; the lead
runs `npm run verify` at the end of the milestone).

## 6. Open items for the lead

1. **`src/data/context.tsx` has no M3 owner.** The overlay must be applied once in `buildContext`
   (section 4); the freeze assigns that one call to core.
2. **`src/testkit/**` has no M3 owner.** The privacy re-crawl (PLAN 17 M3 review) needs the crawl to
   read Requests > New's and What if's models and the app's own file writers, and to reach the states
   submitting and withdrawing requests can make (7.3 observations).
3. **`isPayField('costCenter')` is true** (its `/cost/` pattern), so an audit entry of a cost-center
   change (a transfer, an approved Location change) reads "changed" outside HR admin. Safe but more
   than 8.4 rule 7 asks; core decides (`contracts.test.ts` lists it as the one exception, a list that
   may only shrink).
4. **Replace keeps this workspace's audit log.** `PlanStore` has no way to replace the log, so a Full
   file's own audit entries are not imported on Replace; the replace itself is one 'workspace' entry.
5. **Assumption overrides cannot be removed in the app**: an overlay row replaces an imported row by
   key, so taking back an org override means setting the value its parent gives.
6. **Idle expiry writes nothing.** Draft and Sent back requests read Expired at read time
   (`isExpired`); no action stores the Expired state (it is no person's action, so it has no id).
7. Carried from M2 and in core's folders: an approved Elimination does not rewrite the seat's later
   dated rows (requests.ts `approvalOf`), and a reporting date after the last close's month throws
   in the forecast (R46 now gives the reading).
8. `src/data/sample/routing.ts` `guardedAsksCost` (workspace-ui) and core's app routing compute the
   same value; core's tests should assert they agree on the sample (story 9's $57,100,000).

Status at integration (section 7.4): items 1, 3, 7 and 8 are closed by core, item 2 by the
integration step; items 4, 5 and 6 stay as known limits.

## 7. Integration (23 Oct 2026)

The integration step took the six builders' work (core, requests-ui, plan-ui, finance-ui, whatif,
workspace-ui), resolved every `needsElsewhere` item and failing test, wired the last surfaces, and made
the leak crawl read the write path. No privacy, leak, attack or perf test was weakened: where a test
changed, it reads more or asserts more.

### 7.1 Contract changes and additions

Additive unless marked. Every export below is in force from M3.

| File | Change |
|---|---|
| `src/plan/actions/types.ts` | `ActionEnv.quote(ask, exceptRequestId?)`: an optional second parameter (core). A re-quote at submit or at an approval step leaves the request itself out of the pending ones |
| `src/plan/actions/copy.ts` | Refusal texts added by core: NOT_IN_MODE_TEXT, expiredText, NO_SEAT_CHANGE_TEXT, LIMITED_REQUEST_TEXT, NOT_IN_SEAT_TEXT, RECEIVING_SEAT_TEXT, CYCLE_NOT_OPEN_TEXT, SET_BY_IMPORT_TEXT, NOT_A_SUB_ORG_TEXT, NO_PARENT_TARGET_TEXT, FROZEN_SUBMIT_TEXT, MOVE_HEADS_TEXT, NOT_FULL_FILE_TEXT, REASON_CODE_TEXT, FTE_RANGE_TEXT, NO_REQUEST_CHANGE_TEXT, ALREADY_REVIEWED_TEXT, NO_VALUE_TEXT, NO_RATE_TEXT, FX_RATE_TEXT |
| `src/plan/actions/shared.ts` (new), `trades.ts` `tradeDraft` | Core's helpers; `tradeDraft` is shared with What if's Turn into requests |
| `src/plan/store/overlay.ts` | `overlayRows(imported, overlay, fields, canon?)`: the optional `canon` reads a key part the same in two spellings. `withOverlay` keys an assumption row's version by name or ID alike (integration, finance-ui item 2) |
| `src/plan/engine/forecast.ts` | `actualThroughOf` (core, R46) |
| `src/plan/engine/whatif.ts` | `readingDateOf`, `leverSeatsOfYear` (whatif) |
| `src/app/write/` | `quote.ts`, `WriteBlocked.tsx`, `scenario.testkit.ts` (test only) (core) |
| `src/access/visibility.ts` | `isPayField('costCenter')` is false (core, section 6 item 3): a cost center is an org field |
| `src/cost/guard.ts` | `ComponentGateInput.paidLineOf`, `LEAVE_COMPONENTS`, `isUnpaidCostedLine` (finance-ui). Wired at integration in src/views/plan/engine/guarded.ts `gateFor` |
| `src/cost/edits.ts`, `src/views/finance/engine/edits.ts` | `editMovesOf`, `ownOrg`, `OPERATIONAL_TABLES`, `LOCKED_READ_ONLY`, `OWN_UNIT_ONLY`, `CANNOT_PRICE_TEXT` (finance-ui) |
| `src/views/finance/engine/writes.ts`, `src/views/targets/engine/writes.ts` | Each Finance tab's `writes` model, `writeAccess`, `orgOptions`, `subOrgsOf`, `targetChanges` and figure id `targets-changes` (finance-ui) |
| `src/views/requests/engine/new.ts` | **Retyped:** `NewRequestPreview.bandEstimateUsd`, `.gapAfter` and `TradeQuoteCard.bandUsd` are optional. Where `cost:band` is hidden (Manager mode) the preview leaves the band estimate, an empty gap after approval and the quote's band estimates out as keys (7.6: no amount-like key in a Manager-mode model); `quoteCard` leaves `bandUsd` out the same way. Also `formAction`, `chainSentence`, `stepWords`, `reasonWords`, `ACTION_OF`, `NEW_FIGURE_METRICS` (requests-ui) |
| `src/views/requests/engine/` | `quoteCard.ts`, `gapAfter.ts` (`ROUNDED_DRAFT_NOTE` added at integration), `cards.ts`, `cycleControls.ts`; `RequestsModel` gains `queue.importRequests`, `queue.exportRequests`, `mine.cards`, `mine.exportRequests`, `approvals.cards`, `approvals.gaps` (figure `requests-approvals-gaps`) and `cycle.controls` (requests-ui); `CycleControls.dates` and `RequestsCycle.open` (`CycleOpenOption`, `cycleOpenOf`) added at integration for `cycle.dates` and `cycle.open` |
| `src/views/plan/engine/edits.ts`, `notes.ts` | `seatEditsOf`, `seatChangesOf`, `seatEditInputOf`, `eliminationInputOf`, `requestIdIn`, `transferInputOf`, `TransferForm`; Plan figure ids `plan-positions-changes`, `plan-transfers-drafts`; `TeamModel.hrbpChanges` (`team-hrbp-changes`); `UnitHomeModel.changes` (`home-unit-changes`) (plan-ui) |
| `src/views/whatif/engine/` | `LeverRow.n`, `.becomes`, `turnInto.refused`, `WhatIfLevers.hidden`, `.can`, `.scope`, `.pickers`; `costDifference`, `scopeKeyOfView`, `pickers.ts` (whatif) |
| `src/views/data/engine/` | `snapshots.ts` (`figureSnapshots`), `menu.ts` (`workspaceMenuOf`), `lockedRefsOf`, `requestForFile`, `figureOf`, `conflictRows`, the refusal texts; **retyped:** `SharedFileView.requests` is `SharedRequestRow[]` (`RequestRecord` without `bandEstimateUsd`, integration); snapshot columns carry `pay` and `format` (workspace-ui) |
| `src/views/audit/engine` | `viewAuditRows`, `requestOfEntry` (workspace-ui) |
| `src/data/sample/raw/sampleFiles.ts` | `sampleRequestFilesOf`, `cachedSampleRequestFiles`, `sampleLockedRefs` (workspace-ui) |
| `src/plan/workspace/file.ts` | A Full file's body is written compact on one line; its header stays one key a line (workspace-ui) |
| `src/app/pages.tsx` | `PAGES.audit.datasets` is `[]`: audit entries are plan state (integration, B4) |
| `src/app/FolderTabs.tsx` | The folder headlines recompute when What if's session levers change (`subscribeLevers`) |
| `src/testkit/crawl.ts` | See 7.3 |

### 7.2 Readings decided at integration

- **Free text at entry.** `createRequest`, `editRequest` and `createTrade` refuse a job title with an
  amount (REMOVE_AMOUNT_TEXT, 8.4 rule 5): managers and every approver read titles (requests-ui item).
- **Seat edit date.** `editSeat` with no `effectiveDate` takes the as-of date, or the seat's first
  row's date when the seat starts later, so an edit never writes a row before the seat exists (plan-ui
  item).
- **Transfers.** `processTransfer` refuses a from seat outside the processing HRBP's unit and scope with
  OUTSIDE_UNIT_TEXT (HR admin: any seat); the receiving side can be anywhere (plan-ui item).
- **Gap after approval of a draft in HRBP and Leader mode** shows heads, with ROUNDED_DRAFT_NOTE ("In
  this mode the cost gap shows on Targets, and this request's band estimate shows beside it."): the
  rounded gap less the draft's exact band effect is no whole rounding step (7.3 (c)). Exact modes keep
  the one figure. A pending request's gap after approval is the gap as it stands, as before.
- **Leader "within the envelope"** for `cycle.rank`, `cycle.cut-line` and `request.approve-with-changes`
  is the leader's org (scope); the cost envelope is checked where 10.2 and 10.5 route it (out of plan in
  `chainFor`, `envelope-exception` on transfers and target moves, Finance past a sub-org's envelope).
  Approve with changes is the HRBP step's only, so a leader never reaches it (requests-ui item).
- **Cycle open and dates** are on Requests > Cycle for Finance and HR admin: "Open the FY28 cycle"
  when no cycle is under way (the year after the as-of date's, or after the latest locked cycle's),
  with suggested due dates 3, 5, 7 and 9 weeks out, and "Change dates" on the stage bar (requests-ui
  item).
- **Openings target start** keeps M2's reading: an open req's target start wins over the seat's own
  start, so an HRBP start move on a seat with an open req does not move its Openings target start
  (plan-ui item 1). **My team's allocation tiles** keep `positions.startDate` in their lineage, honestly
  (R2b reads it), and stay Bronze on the sample (plan-ui item 2).
- **HRBP Import requests** merges every request the files hold, as PLAN 5.5 and R17 limit only Leader
  mode; the summary and conflicts count only what the HRBP may see (workspace-ui item 2).
- **What if's freeze lever** is costed (10.6): its cost change is a band figure in HRBP and Leader mode
  (whatif item 3).
- **Self-approval** moves an HRBP step to the next held seat above the requester (chain.ts as built);
  on the sample an HRBP's own trade goes to E10964 as its 'hrbp' step (core item 5).
- **Core's readings** stand as core recorded them: R46 with no close (the as-of month still reads
  HRIS), the transfer requester (the moving person's manager; the HRBP the submitter), the envelope
  exception, expiry read at action time, cycle finishers, lock content.
- **Edits outside an owner's folders** are accepted: core's src/views/forecast/engine/run.ts (R46) and
  paidTwins.test.ts (its no-close case, nothing weakened); whatif's src/app/shell.test.ts and
  src/app/routes.slow.test.ts (no route may be a stub any more).

### 7.3 The privacy re-crawl

`src/testkit/crawl.ts` now reads the write path:

- **Files are the app's own.** `workspaceText` and the crawl's `files()` read
  src/views/data/engine/workspace.ts `shareableFile` and `requestsFile`, and where the mode offers it
  (HRBP, Leader, HR admin) the managers Export for a manager lists and the file `forManagerFile`
  writes for one of them. `openShared` reads a file through the app's `openSharedFile`. The crawl's
  own M2 slice (`workspaceSlice`) is gone: every leak test reads what a person saves and opens.
  `appFile`, `forManagerText` and `fileCrawl` are new helpers.
- **The write path's models** (option `writes`, on by default): Requests > New's preview of one
  filled-in form per type the mode offers (`newRequestForms`), Plan > Positions' `seatEditsOf` and
  `seatEditOf` for its first seats, Plan > Transfers' `transferOptions`, the masthead's
  `workspaceMenuOf`, and What if with a lever of every kind (`crawlLevers`). Request cards (Mine,
  Approvals), the cycle's controls and the per-org gaps figure were already in the requests model.
- **New slow test** `src/access/leaks.writes.slow.test.ts`: a New role walked through the write path
  (drafted, submitted, an HRBP comment with an amount forced to Approvers only, approved with changes,
  sent back, submitted again; a second draft withdrawn). After each step Manager A's crawl holds no
  amount and not the comment, Export for a manager from the HRBP's context equals Manager A's own
  Shareable and passes the scan, the HRBP's Shareable opened as Manager A shows nothing of the comment,
  and another manager reads nothing of the request; HR admin is the control.
- **Manager C** (`leaks.manager.slow.test.ts`): Export for a manager for C is now also written from
  the HRBP's and HR admin's contexts with the app's writer, byte-equal with and without the
  Elimination, equal to C's own Shareable, and clean of amounts; the HRBP Shareable is opened through
  the app's opener.
- Two model fixes the re-crawl asked for (7.1): the preview's Manager-mode amount keys, and
  `SharedFileView.requests` without `bandEstimateUsd`.

### 7.4 Still open (for the lead and PLAN)

1. **Full file size.** The sample's Full file is about 19 MB compact; each further locked version adds
   about 7 MB, so after one more lock a Full file is over PLAN 5.5's 25 MB import limit and is refused.
   The limit is the PLAN's; raising it for Full files, or a denser line format, is a PLAN change.
2. **Section 6 items 4 to 6 stay as known limits:** Replace keeps this workspace's audit log; an org
   assumption override cannot be removed in the app; idle expiry is read at action time and never
   stored.
3. **Smaller gaps:** a trade draft is not edited from Mine (the requester withdraws and raises a new
   one); Manager mode's status after approval leaves staffed months unchanged (an approved Level or
   Location change on a Filled seat is not modelled there); the position card does not show "Changed by
   your HRBP" (Plan > Positions, its changes figure, My team and the Unit plan home do); the home tiles
   re-linked from Forecast, Targets, Requests and Finance keep their producers' lineage (B4 follow-up,
   src/views/plan/engine/lineageProbe.testkit.ts is reusable); Requests > New's give list could reuse
   What if's `pickersOf`.
4. **PLAN updates to record** (the integration step may not edit PLAN.md): every reading in 7.2 and in
   the builders' notes (core: R46 no-close, transfer requester, envelope exception, expiry, finishers,
   lock content, isPayField; requests-ui: per-org Approvals gaps, cycleShown's fallback to the latest
   locked cycle, the cut line counting at lock once set; finance-ui: plan and forecast months as
   separate series in 7.4's count, shown lines, the Working copy of a locked version, a freeze's
   default start, a Leader's rounded cost entry; whatif: scope, year, target and guard readings, the
   headline's session reading; workspace-ui: the Requests file's scope, Open a shared file without the
   hash check and refusing Full files, the Audit page's count redactions and cycle order filter, the
   compact Full body, What if left out of Shareable files), and the M2 report's "PLAN updates" list.

### 7.5 Verify

`npm run verify` after deleting `node_modules/.vite` (Node 24.14.1), on the final tree: all six steps
PASS (no data files in git, type-check, lint 997 files, tests 314 files and 3,095 passed with no todo:
unit 288 and 2,960, slow 20 and 118, perf 6 and 17; the app build and the one-file build), exit code 0.

## 8. M3 review fixes (24 Oct 2026)

### 8.1 The business date of a write (R47, core-platform)

| Export | Change |
|---|---|
| `src/plan/actions/types.ts` `ActionContext.businessAt: ISODateTime` | New. The write's business date-time: the as-of date with the wall clock's time of day (`businessAtOf(ctx.asOf, at)`), set by src/app/write/context.ts `actionContextOf`. Every business date an action stores reads it (or `ctx.asOf` for a plain date): submitted and updated, step entered and decided, comments, approval and effective dates, `openedDate`, elimination, transfer and trade defaults, cycle stage dates, freeze defaults, close and lock dates. `ctx.at` stays the wall clock and is only the audit entry's own `at` |
| `src/lib/dates.ts` `businessAtOf(asOf, wallClock)`, `onAsOf(stored, asOf)`, `daysToAsOf(stored, asOf)` | New. `onAsOf` reads a stored date after the as-of date (one written before R47 with the wall clock's date) as entered on the as-of date, its time of day kept; `daysToAsOf` is the whole days from a stored business date to the as-of date, never negative (days in step, waiting, overdue, idle) |

### 8.2 The store, the audit log and request IDs (core-platform)

| Export | Change |
|---|---|
| `src/plan/store/types.ts` `PlanStore.commit(next, audit, options?)`, `CommitOptions` | New (IN-5). Saves the state and appends its drafts as ONE write, all or nothing: every entry is numbered, chained and hashed before anything is stored, so a reader tab, an entry that is not canonical JSON (NaN) or a refused storage write leaves the store as it was. BrowserStore writes `hcp:plan` once with the state, its head and a journal of the entries (the commit point), then moves the journal into the chunks; a journal left by a failure is read as part of the log and moved by the next write. `options.replaceAudit` replaces the log first (C35). `src/app/write/run.ts` saves through it only |
| `PlanStore.replaceAudit(entries)` | New (C35), both stores. Replaces the whole log with a chain that verifies, else rejects with `fileChainBrokenText`; the head follows. Used only by Replace from a Full file, through `commit` |
| `src/plan/audit/chain.ts` `verifyChain(entries, head?)`, `ChainHead`, `fileChainBrokenText(n)`; `appendEntry(prev: ChainHead \| null, draft)` | `head` (the plan state's `auditHead`): a log that ends before it, or whose entry at its seq is another, breaks there (IN-10: "The chain breaks at entry n."). The Audit page should pass `ctx.plan?.auditHead`. A store whose stored head is ahead of its log chains on from the head, so a lost tail stays a break and no seq is used twice |
| `src/plan/store/memoryStore.ts` `entriesAfter`, `checkedLog`; `lockInto(..., businessAt?)`; `MemoryStoreOptions.idTag` | Shared by both stores. `lockInto`'s `businessAt` (R47) is what the lock computes as of, its `lockedAt` and the entry's effective date; `at` stays the entry's own time |
| `src/plan/actions/types.ts` `ActionOk.replaceAudit?` | New (C35): the verified log a Replace brings; the write path commits it with the state |
| `src/plan/types.ts` `PlanState.idTag?`, `PlanState.idSecret?` | New (D-ID): the workspace's request ID tag and secret, minted once by the store (src/plan/store/idTag.ts `mintIdTag`, `mintIdSecret`; `BrowserStore.load` gives a state with none the page's own, the first write keeps them; `BrowserStoreOptions.mintTag`, `.mintSecret`, `MemoryStoreOptions.idTag`, `.idSecret`). planState.ts carries both through `planInForce`, `overlaySample` and `storedFor`. Merge keeps this workspace's tag and secret; Replace keeps the tag and takes a new secret (`nextIdSecret`, M3 recheck). The secret is written to Full files only, never to Shareable or Requests files |
| `src/plan/actions/requestIds.ts` (new) | **Retyped in the M3 recheck** (the lane leaked the requester): `nextRequestIds(tag, secret, personId, taken)` gives 'R-<tag>-<n>' with n = `requestNumber(secret, personId, k)` (1,000 + a keyed SHA-256 mod `REQUEST_NUMBERS` 24,000, `REQUEST_NUMBER_MIN` 1,000), the person's first k whose ID is not in force, so a person's next ID never depends on anyone else's request (SC-13) and two workspaces never mint the same one (IN-1); `taggedRequestId(tag, n)`. `idLane` is removed. Also `REQUEST_ID_IN_TEXT`, `requestIdInText(text)` (an ID in a notice, either form; views that read the ID a notice names must use it), `ID_TAG_PATTERN`, `isIdTag`, `ID_SECRET_PATTERN`, `isIdSecret`, `nextIdSecret`, `parseTaggedId`, `NO_ID_TAG`. A context with no tag (no store behind it) numbers 'R-<n>' as before; one with a tag and no secret keys on the tag |
| `src/app/write/harness.ts` `HARNESS_ID_TAG` ('TEST'), `WriteHarnessInput.idTag`, `.idSecret`, `harnessIdSecret(tag)`; `scenario.testkit.ts` `ScenarioOptions.idTag`, `.idSecret` | A harness's workspace numbers 'R-TEST-<n>'; another tag stands for another browser |

### 8.3 Actions and access (core-platform)

| Export | Change |
|---|---|
| `src/plan/actions/assumptions.ts` `removeOverride` (action `removeOverride`, ACTION_CHECKS `['assumptions.edit-operational', 'assumptions.edit']`), `RemoveOverrideInput` (versionId, table, org, key) | New. An org's row taken back so the value is its parent's again: `assumptions.edit` where the mode has it (Finance through 7.4's rule, priced as the org's value set to the parent's; HR admin), else the HRBP's operational id (own unit, operational tables). One entry, field 'override removed' (old the override's value, new the parent's). Refusals NO_OVERRIDE_TEXT, NO_PARENT_VALUE_TEXT, SET_BY_IMPORT_TEXT, OPERATIONAL_ONLY_TEXT, OUTSIDE_UNIT_TEXT; notice OVERRIDE_REMOVED_NOTICE. 42 actions now |
| `src/plan/types.ts` `DatasetOverlay.removedAssumptions?` | Rows (by row key) Remove override took back; `withOverlay` leaves out any imported or overlay row with the key. Setting the key again takes the removal back. Merge and the Full file reader must carry it (workspace-whatif) |
| `src/plan/actions/assumptions.ts` `valueRefusal(rows)` | IN-8: each value against its table's unit (`assumptionRangeText`: "Fill rate: each value is from 0 to 1."); run by `editAssumptions` and `editOperational` before any check |
| `src/plan/actions/versions.ts` `LockVersionInput.standardHeadUsd?`, `STANDARD_HEAD_MOVED_TEXT`, `fxMonthOf`; `editRefusal(ctx, rows, versionId, closes?)` | SP-13: a Budget lock stores the standard head computed from the Budget (src/app/write/lock.ts `budgetStandardHead`) and Working takes it with an entry; the dialog passes the S it showed and a stale one is refused; reforecasts carry the Budget's. B8: `closeNotYetText`. UI-3: an amount in a version name is refused at entry. PV-1: a Finance close refuses an 'actual' rate written in the app that, priced as the month's forecast rate, moves 1 to 4. PV-2: a closed month's rates are read only outside HR admin (CLOSED_MONTH_RATE_TEXT). PV-3: CANNOT_PRICE_TEXT for a Finance `createVersion` set with no `from`, or with an FX row outside `from`'s grid |
| `src/plan/actions/targets.ts` `SubOrgTarget.targetCost?` | **Retyped** optional (UI-2): left out keeps the stored cost target, null removes it. UI-8: UNIT_HEAD_TARGET_TEXT for a split child or a move side that heads its unit |
| `src/plan/actions/workspace.ts` | D-MERGE: Import requests and Merge apply an arriving approval through `importedApprovals` (core-flow), a dry run of it being merge.ts's `effectRefusal`; IN-7 counts; FILE_AMOUNT_TEXT for a job title or version name with an amount; Replace takes the file's log (`replaceAudit`), refusing a broken chain with `fileChainBrokenText`; both keep this workspace's `idTag` |
| `src/app/write/expiry.ts` (new) `expiryOfContext`, `effectiveRequests` | D-EXPIRY for the write path's readers: routing's guarded asks, a quote's seats and credit (`quoteRequests`) and the seats' `pendingRequestId` read through the engine's `withEffectiveStates` / `isPendingNow` |
| `src/app/write/context.ts` | `mayMerge` leaves the Leader's own seats out (PV-7); `rankedAsks` leaves Sent back asks out (D-CYCLE) |
| `src/access/visibility.ts` `payStructureEntry(e)` | SP-14: outside HR admin an assumption entry of the band table or the trade standard head reads "changed". SC-14: `hasAmount` and `managerText` read "Mio", "Mrd", "bln", "Tsd", letters glued to a sign ("CA$ 900") and spelled-out amounts ("two hundred thousand dollars") |
| `src/access/policy/actions.ts`, `src/access/ids.ts` `PLAN_GRID` | SP-8, SP-18: the Leader cells of `request.approve-with-changes` and `transfer.move-budget` are H with their reasons (a PLAN 15 change for the lead to record in 8.3); the access snapshots were regenerated for these two lines |

### 8.4 Engines and actions (core-flow)

Every engine change is additive: the business time is each engine's existing `at`, and the wall clock
is a new optional trailing parameter.

| Export | Change |
|---|---|
| `src/plan/engine/requests.ts` `transition(req, action, actor, at, ctx, auditAt = at)`; `src/plan/engine/cycle.ts` `cycleTransition(cycle, action, actor, at, auditAt = at)` | R47: `at` is the business time; the audit entry's own `at` is `auditAt` (the wall clock), and request and cycle entries carry the business date as `effectiveDate` (so does `auditOf` by default) |
| `src/plan/engine/requests.ts` `ExpiryInput`, `effectiveState(req, x)`, `isPendingNow(req, x)`, `withEffectiveStates(requests, x)` | D-EXPIRY's one helper. `withEffectiveStates` is memoized per list, as-of date, idle days and cycles, and returns the same array when nothing expired. `isExpired` reads a stored date after the as-of date as 0 idle days. The engine's `withdraw` accepts an Expired request |
| `src/plan/engine/requests.ts` new action `{ kind: 'cycle-changes', changes, reason, requoted? }`; `TradeChangeSet`, `tradeCreditChange(req)`; `siteMoveRefusal`, `costCenterAtSite`, `noCostCenterText`; `replayApproval(req, plan, { auditAt, comment })`, `ApprovalReplay`, `approvalDateOf(req)` | SC-9 (an HRBP's changes to a manager-approved cycle ask during HRBP review); SC-16 (the credit before and after); SC-15 (a Location change to a site with no department cost center); D-MERGE (an arriving approval's effects, idempotent by `sourceRequestId`, dated its approval date) |
| `src/plan/engine/cycle.ts` `roomOf(targetHeads, asksHeads, ranked)`, `cutAfterOf(cycle, unit, ranked, room)`, `lockOutcomes(cycle, asksByUnit, rooms = new Map())`, `waitingOnManager(requests, cycleId)`, `lockWaitingText(fy, asks, managers)`, `lockedOutcomes(requests, cycleId)`; `rankAsks` leaves Sent back asks out | D-CYCLE: the lock decides each unit by the stored mark, else the default line over the same room the tab shows; the 'cycle-lock' transition refuses an undecided or Sent back ask |
| `src/plan/engine/freeze.ts` `exceptionFreezeOf`, `freezeExemptions(requests, positions, freezes, inTree, asOf)`, `FreezeOpening.exemptFrom` | SC-4, SC-7: an approved exception's seat is no frozen opening; an imported exception with a blank `freezeId` names the freeze covering it |
| `src/plan/engine/versions.ts` `heldForMove(position, status)`; `src/plan/engine/targets.ts` `AsksSeat.heldForMove` | SC-6: a seat an approved internal move holds while HRIS shows the person on it is no approved head and no ask |
| `src/plan/engine/trade.ts` `TradeSeat.openReq?`, `TradeContext.requestShown?`, `TradeQuote.warnings?`, `TradeQuote.ratesNote?`, `standardHeadsApart`, `TradeFieldsWithTarget`, `movesTarget`, `tradeTargetMove`; `src/plan/engine/transfer.ts` `targetChangeEffects` | SC-11, SC-12, SC-19, PV-9 (with no `requestShown` the quote never names a pending request), SP-5 ("Move target too?"). Corrected in M4 (M3 known gap 6): the app's `tradeQuoteOf` (src/app/write/quote.ts) passes both, each give seat's `openReq` (`openReqsOf`: of the seat's open reqs, the latest opened at Interviewing, else the latest opened) and `requestShown` (the Acting as person's full view, unless the caller passes one), so Requests > New, the request cards and What if's trade lever read the Interviewing warning and the rates note from the quote, and a pending request is named only to a viewer who sees it in full. Until M4 it passed neither and the request card derived both itself |
| `src/plan/engine/close.ts` `closeTooEarlyText(month, asOf)` | B8, the same sentence as copy.ts `closeNotYetText` |
| `src/plan/actions/requests.ts` `ApproveInput.moveTarget?`, `importedApprovals(state, ctx, reqs, commentOf)`, `cycleChangesNotice`, `noLongerFitsText`; `src/plan/actions/trades.ts` `tradeFieldsOf`; `src/plan/actions/cycle.ts` `cycleRooms`; `src/plan/actions/shared.ts` `businessAt`, `businessDate`, `heldForTransfer`, `heldSeatRefusal`, `expiredRefusal` | SP-5, D-MERGE, SC-9, SP-11, the trade draft edit from Mine (7.4.3), D-CYCLE, R47, SC-6, D-EXPIRY |

### 8.5 Requests, drill and position card (requests-ui)

| Export | Change |
|---|---|
| `src/drill/seats.ts` `effectiveRequestsOf(ctx)`, `EffectiveContext` | The lists' effective requests, over the engine's `withEffectiveStates`; src/app/write/expiry.ts `effectiveRequests` now returns this same array (M3 verify) |
| `src/drill/requestRecord.ts` `titleFor(title, viewer)` | PV-6: Manager mode reads job titles through `managerText` |
| `src/views/requests/engine/cycle.ts` `unitLinesOf`, `cycleCutsOf(ctx, cycle)`, `isRankedAsk`, `aboutViewer`, `UnitLine`; `index.ts` `unitSentence`, `RequestsCycle.cards`; `cycleControls.ts` `CycleControls.lockWaiting` | D-CYCLE on the tab, SC-9 from the Cycle tab |
| `src/views/requests/engine/new.ts` **retyped** `RequestsNew.nextRequestId?` (absent in Manager mode, SC-13); `RequestsNew.onBehalfHint` | From the M3 verify, a receiving seat an approved internal move holds offers no type, and its trade note gives the hold (SC-6) |
| `src/views/requests/engine/cards.ts` `RequestCard.editAsk`, `.moveTarget`, `creditChangeOf(req)`, `editPatchOf`, `staffedAfterApproval`; `base.ts` `shownInFull`; `quoteCard.ts` `blockText`, `interviewingOf`, `OTHER_PENDING_TEXT`, `QuoteCardInput.interviewing`, `.requestShown`; `gapAfter.ts` `headsCount` | SC-10, SC-12, SC-5, SP-5, PV-9, UI-9, 7.4.3's trade draft edit and Manager mode's status after approval. `creditChangeOf` reads the stored `ChangeSet.credit` first (M3 verify) |
| `src/drill/position.ts` `PositionCardModel.hrbpChanges`, `PositionCardContext.metrics?` | SP-19: the card shows "Changes in Working" from views/plan/engine/notes.ts `notesOf` |
| `src/views/requests/ui/` `StageBar`, `ConflictChoices`, `RadioChoice` | UI-4, UI-5, UI-7, UI-12 |

### 8.6 Plan, Finance, Targets, Forecast and homes (plan-finance-ui)

| Export | Change |
|---|---|
| `src/views/finance/engine/edits.ts` `paidWorld` | PV-4 (recheck): both sides of 7.4's check are priced with nobody's leave unpaid; the review's paid-twin swap is gone. PV-1 to PV-3: one structural FX rule |
| `src/views/forecast/engine/bridge.ts` `fxEffectOf` | PV-2: in guarded modes the FX tile is the bridge's own folded FX step (C33 (c)) |
| `src/views/plan/engine/openings.ts` `freezeExemptionsOf` | SC-4 on Plan > Openings and Finance > Freezes |
| `src/views/finance/engine/writes.ts` `CloseChoice.notYet`, `closeNotYet(month)`, `LockChoice.standardHeadUsd`, `.standardHeadNote`, `EditableValue.parent` | B8, SP-13, Remove override |
| `src/views/targets/engine/writes.ts` `subOrgSeatsOf(latest, levels, parent)`, `SplitChild`, `splitChildrenOf` | UI-8, UI-2. From the M3 verify, `ActionEnv.subOrgsOf` calls `subOrgSeatsOf`, so the action and the form name the same sub-orgs |
| `src/components/ui.tsx` `Segmented` `disabled` | UI-5 |
| `src/views/home/engine/lineageNotes.ts` | B4 follow-up, with `lineage.slow.test.ts` |

### 8.7 Workspace files, merge, Audit and What if (workspace-whatif)

| Export | Change |
|---|---|
| `src/plan/workspace/file.ts` `MAX_FULL_FILE_BYTES` (150 MiB), `maxBytesOf(kind)`, `CENT_COLUMNS`, `encodeLineTable`, `centLines`, `bodyAsWritten`; `validate.ts` `FULL_TOO_LARGE_TEXT`, **reworded** `TOO_LARGE_TEXT` | C35 |
| `src/plan/workspace/stamps.ts` (new) `isIsoStamp`, `stampMs` | IN-12: stamps validated and compared as times; a stamp with no zone reads as UTC |
| `src/plan/workspace/merge.ts` `ConflictKind`, `MergeConflict.kind`, `.reason`, `MergeOptions.effectRefusal`, `MergeResult.decided`, `.preview`, `DecidedArrival`, `isChoosable`, `mergePreviewText`, `ID_CLASH_TEXT`; `chooseConflict(...).decided` | IN-1, IN-3, IN-4, IN-7, IN-12, D-MERGE, UI-11 |
| `src/plan/workspace/diff.ts` `WorkspaceDiff.audit`, `auditLine` | C35: what Replace and Merge do with the log |
| `src/views/data/engine/workspace.ts` `importPreview(...).replaceRefused`, `.mergeRefused`; `RequestsPreview.after`, `.blocked`; `ConflictRow.choosable`; `SharedFileView.audit` as `SharedAuditRow` | C35, PV-8, UI-7, UI-11, PV-6 |
| `src/views/audit/engine/labels.ts` (new) `FIELD_LABEL`, `fieldLabel`, `chainWithNames`, `valueWithNames`; `AuditListRow.fieldLabel`; `requestOfEntry(ctx, requests, entries = [])`; `viewAuditRows(ctx, entries, requests?, { fromFile }?)` | B7, UI-14, IN-10, PV-5. From the M3 verify, views/plan/engine/notes.ts links its notes through this `requestOfEntry` |
| `src/views/whatif/engine/index.ts` `WhatIfScope.sentence`, `whatIfSentence` | UI-14 |
| `src/data/sample/raw/requestFiles.ts` `MERGE_PREVIEW`; `src/testkit/crawl.ts` `CrawlOptions.imports`, `Crawl.imports`, `importsCrawl` | The six-file story's preview; the crawl reads the Import requests preview |

### 8.8 The M3 recheck's fixes (attacks)

| Export | Change |
|---|---|
| `src/plan/types.ts` `HcRequest.revisedAt?`, `HcRequest.createdAt?`; `src/plan/actions/shared.ts` `withRevisions` (run by `runActionByName` for every action but the three file imports); `src/plan/workspace/merge.ts` `revisionOf(r)` | R47-MERGE-ORDER: merge recency is the wall-clock revision (`revisedAt ?? updatedAt`); `createdAt` tells two copies of one ID apart |
| `src/plan/workspace/merge.ts` `freezeClashes`, `MergeOptions.freezes`, `MergeConflict.view` | FREEZE-ID-COLLISION (new freezes are 'FRZ-<tag>-<nnn>'), effect-conflict-names-limited-fields |
| `src/plan/workspace/validate.ts` `lockBrokenText(versionName)`; `overlay()` reads `removedAssumptions` | FORGED-LOCK-ACCEPTED, MERGE-DROPS-REMOVED-OVERRIDES |
| `src/views/data/engine/workspace.ts` `EFFECT_NOT_HERE_TEXT` | A limited importer's effect conflict |
| `src/plan/actions/copy.ts` `ORG_FX_TEXT`; `versions.ts` `orgFxRow` | close-blocked-by-org-fx-row |
| `src/plan/actions/shared.ts` `seenRefusal` | **Changed:** a request whose `requestView` is 'none' is refused with NOT_FOUND_TEXT, as an unknown ID is (SC-13); NOT_SHOWN_TEXT stays exported and no action returns it. This replaces section 4's first note |
| `src/plan/actions/requests.ts` `commentOnRequest` | Refuses an expired request (`expiredRefusal`) |

### 8.9 The M3 verify step

| Export | Change |
|---|---|
| `src/plan/types.ts` `TradeFields.moveTarget?`, `ChangeSet.credit?` | Additive. The engine's `TradeFieldsWithTarget` and `TradeChangeSet` now equal these; `src/plan/workspace/validate.ts` reads both from files, so an imported approval replays its "Move target too?" and the card reads its credit |
| `src/plan/actions/shared.ts` `approvedMoveTo(requests, positionId)`, `heldSeatText(move, shownInFull)` | The pure parts of `heldForTransfer` and `heldSeatRefusal`, read by Requests > New |
| `src/access/visibility.ts` `managerText(text, viewer: Pick<Viewer, 'mode'>)` | Widened (was `Viewer`) |
| `src/data/context.tsx` `buildContext` | In Manager mode `ctx.versions` reads each name through `managerText` (UI-3's read side): the same array when no name holds an amount |
| `src/app/write/context.ts` `ActionEnv.subOrgsOf` | Calls src/views/targets/engine/writes.ts `subOrgSeatsOf` (UI-8): never another unit's seat |
| `src/app/write/expiry.ts` `effectiveRequests(ctx)` | Returns src/drill/seats.ts `effectiveRequestsOf(ctx)` (one memoized list, D-EXPIRY) |
| `src/views/plan/engine/notes.ts` | Its own request link is gone; it reads the Audit page's `requestOfEntry(ctx, requests, ctx.audit)` |

Status of the open items: section 6 items 4 to 6 and 7.4 items 1 to 3 are closed (C35 and
`replaceAudit`, Remove override, D-EXPIRY, the trade draft edit from Mine, Manager mode's status after
approval, "Changed by your HRBP" on the position card, the home tiles' lineage). The readings of 7.2,
7.4.4, the builders' notes, the review fixes and the recheck are recorded in PLAN 15.1 as R48 to R91,
and C35 in 15.2. docs/M3-REPORT.md is the milestone's report.
