# M3 report: the write path

Milestone M3 of docs/PLAN.md 17 (versions, requests, approvals, cycle, freezes, transfers, What if,
audit, workspace file), verified on 24 Oct 2026. M3 was frozen as contracts on 23 Oct
(docs/CONTRACTS-M3.md sections 1 to 6), built by six builders (core, requests-ui, plan-ui,
finance-ui, whatif, workspace-ui), integrated (CONTRACTS-M3 7), reviewed by five lenses (spec,
scenarios, integrity, privacy, UI) plus the lead's browser pass, and fixed in five folder groups
(core-flow, core-platform, requests-ui, plan-finance-ui, workspace-whatif) under nine lead decisions
(CONTRACTS-M3 8). A recheck then attacked the fixed tree (privacy and flows, 17 attacks); every
attack was fixed in the model. This verify step closed the open items the fixers and the attack
fixer left, recorded the readings in PLAN 15, and ran `npm run verify` from a clean
`node_modules/.vite`.

All 70 kept review findings and the 3 browser findings are fixed, each with a test that fails on the
code before its fix. Five low lens findings were judged not real by their verifiers; three of them
are recorded as readings (R59, R63, R91) and two need no change (IN-9, IN-11).

## Verify output

Run from the project root with `npm run verify` (scripts/verify.mjs) after deleting
`node_modules/.vite`, on Node 24.14.1, on the final source tree (only docs changed after it). Vite
runs as `node --max-semi-space-size=64 node_modules/vite/bin/vite.js`, never `npx vite`. The full
log was kept in the review's scratch folder (`m3-review/final-verify1.txt`), outside the repository.

| Step | Result | Time | Notes |
|---|---|---|---|
| No data files in git | PASS | 0.1 s | "No data files outside src/data/sample/." |
| Type-check (`npx tsc --noEmit -p .`) | PASS | 2.2 s | No errors |
| Lint (`npx biome check src scripts`) | PASS | 1.5 s | 1,026 files, no fixes |
| Tests (unit, slow, perf) (`npx vitest run`) | PASS | 2,083.4 s | 337 files, 3,306 passed, 0 failed, no todo or skip |
| App build | PASS | 17.1 s | `dist/`: main chunk 2,589.77 kB (837.09 kB gzip), CSS 67.90 kB; ExcelJS, SheetJS and pptxgenjs in their own lazy chunks |
| One-file build | PASS | 13.1 s | `dist-single/index.html` 4,820.66 kB (1,643.41 kB gzip) |

Exit code 0. The summary as printed:

```
Headcount Planner verification
  PASS  No data files in git (0.1s)
  PASS  Type-check (2.2s)
  PASS  Lint (1.5s)
  PASS  Tests (unit, slow, perf) (2083.4s)
  PASS  App build (17.1s)
  PASS  One-file build (13.1s)
```

Verify passed on its first run. While its slow project ran, one source file
(`src/views/requests/engine/cards.ts`) was swapped for its earlier copy for about ten seconds to
check that a new test fails before its fix, then restored byte for byte. The three projects were
run again afterwards with the JSON reporter on the same tree for the counts below, and all passed
again (unit 3,166, slow 123, perf 17).

## Test counts

| Project | Files | Tests | Notes |
|---|---|---|---|
| unit | 310 | 3,166 | M2 ended at 237 and 2,681; integration at 288 and 2,960; the review fixers and the recheck brought it to 309 and 3,158; this step added 8 |
| slow | 21 | 123 | M2 ended at 17 and 105 (2 `it.todo`); integration at 20 and 118; the fixers added `views/home/engine/lineage.slow.test.ts` and cases |
| perf | 6 | 17 | Unchanged; every budget holds |
| Total | 337 | 3,306 | No todo, no skip |

By folder (files and tests that ran, from the JSON reporter on the final tree):

| Folder | Unit files | Unit tests | Slow files | Slow tests | Perf files | Perf tests |
|---|---|---|---|---|---|---|
| `src/access` | 13 | 172 | 9 | 66 |  |  |
| `src/app` | 25 | 132 | 1 | 5 |  |  |
| `src/charts` | 15 | 137 |  |  |  |  |
| `src/components` | 6 | 67 |  |  |  |  |
| `src/cost` | 7 | 127 | 8 | 45 |  |  |
| `src/data` | 11 | 171 |  |  |  |  |
| `src/data/import` | 12 | 283 |  |  |  |  |
| `src/data/lists` | 2 | 32 |  |  |  |  |
| `src/data/quality` | 4 | 59 |  |  |  |  |
| `src/data/sample` | 5 | 103 |  |  | 1 | 3 |
| `src/drill` | 10 | 142 |  |  |  |  |
| `src/lib` | 15 | 125 |  |  |  |  |
| `src/metrics` | 14 | 110 |  |  |  |  |
| `src/plan` | 1 | 7 |  |  |  |  |
| `src/plan/actions` | 15 | 95 |  |  |  |  |
| `src/plan/audit` | 1 | 14 |  |  |  |  |
| `src/plan/engine` | 26 | 494 |  |  | 1 | 4 |
| `src/plan/store` | 3 | 45 |  |  |  |  |
| `src/plan/workspace` | 6 | 106 |  |  |  |  |
| `src/ship` | 7 | 31 |  |  |  |  |
| `src/styles` | 2 | 23 |  |  |  |  |
| `src/testkit` | 3 | 10 |  |  |  |  |
| `src/views` | 3 | 33 |  |  |  |  |
| `src/views/actions` | 15 | 96 |  |  | 1 | 2 |
| `src/views/audit` | 4 | 25 |  |  |  |  |
| `src/views/data` | 9 | 51 |  |  |  |  |
| `src/views/finance` | 11 | 60 |  |  |  |  |
| `src/views/forecast` | 17 | 82 | 1 | 1 | 2 | 5 |
| `src/views/home` | 4 | 44 | 1 | 3 |  |  |
| `src/views/plan` | 13 | 91 | 1 | 3 | 1 | 3 |
| `src/views/requests` | 12 | 88 |  |  |  |  |
| `src/views/targets` | 8 | 49 |  |  |  |  |
| `src/views/team` | 8 | 39 |  |  |  |  |
| `src/views/whatif` | 3 | 23 |  |  |  |  |

This step added 8 unit tests: `plan/workspace/validate.test.ts` (1), `views/requests/engine/cards.review.test.ts` (1), `views/requests/engine/review.test.ts` (1), `app/write/expiry.scenario.test.ts` (1), `views/plan/engine/notes.test.ts` (1) and the new `data/versionNames.test.ts` (3). The one conditional skip, in `src/ship/trackedFiles.test.ts`, runs, since the folder is a git repository.

## What M3 delivered, by folder

| Folder | What is there |
|---|---|
| `src/plan/actions` (new) | The write path's pure actions, `(state, ctx, input) => ActionResult`: 42 actions (requests, seats, transfers, trades, freezes, versions, assumptions with Remove override, targets, the cycle, reconcile, What if's Turn into requests, workspace imports), the gate (reader tab, Acting as block, policy, then 8.4), `ACTION_CHECKS`, the copy (every refusal and notice, no amount), request IDs under the workspace tag and secret (`requestIds.ts`), and shared helpers (business dates, expiry, held seats, revisions) |
| `src/plan/store` | The overlay (`withOverlay`, removed assumptions included), `PlanStore.commit` (state and audit drafts as one write, with a journal in BrowserStore), `replaceAudit`, the ID tag and secret (`idTag.ts`), `lockInto` with the business date |
| `src/plan/audit` | Every field the write path writes (`fields.ts`), `verifyChain(entries, head?)`, `fileChainBrokenText` |
| `src/plan/engine` | Engine additions behind the actions: business time and audit time in `transition` and `cycleTransition`, the one expiry helper, the cycle's one cut line and lock rules, HRBP changes to cycle asks, imported approvals (`replayApproval`), freeze exemptions, held seats, trade quote notes and warnings, "Move target too?", the site refusal, R46's `actualThroughOf`, an approved Elimination rewriting later rows |
| `src/plan/workspace` | Full files by column with integer cents (C35), limits by kind, the readers of every earlier form, lock and chain checks on read, merge rules (revision order, clashes, diverged copies, decided copies, effects, freeze clashes, removed overrides), stamps validated and compared as times, the diff's audit line |
| `src/app/write` (new), `src/app/boot.ts`, `src/app/planState.ts` | The action context (business date, person rules, env), routing on the guarded asks cost, the trade quote over the context, lock content and the Budget's standard head, `runAction` saving through `commit`, the `usePlanWrite` hook and `WriteBlocked`, the write harness and scenario kit, expiry for the write path's readers, `storedFor` and `reloadPlan` |
| `src/access` | `contextAs`, the masthead Workspace control, `isPayField('costCenter')` false, amounts in text extended (R81), `payStructureEntry`, the Leader cells of SP-8 and SP-18 |
| `src/data` | `buildContext` lays the overlay once and, in Manager mode, reads version names through `managerText`; the sample's six request files (`sampleFiles.ts`, `MERGE_PREVIEW`); `lib/dates.ts` business dates (`businessAtOf`, `onAsOf`, `daysToAsOf`) |
| `src/drill` | Effective requests for every list (`effectiveRequestsOf`), titles through `managerText` in Manager mode (`titleFor`), the position card's "Changes in Working" |
| `src/views/requests` | Requests > New (every type, the trade flow, the chain preview from the real action, the quote card, band and gap after approval by mode), Mine and Approvals cards (approve, approve with changes, send back, reject, comments, edit including a trade draft), Queue's Import and Export requests, Cycle (rank, cut line, finish, lock and return, open and dates, HRBP changes, the outcome after lock) |
| `src/views/plan`, `src/views/team`, `src/views/home` | HRBP seat edits on Plan > Positions with "Changed by your HRBP" notes (grid, figure, My team, the Unit plan home), Plan > Transfers (process, Move budget, drafts), freeze exemptions on Openings, the homes after writes, home tile lineage (`lineage.slow.test.ts`, `lineageNotes.ts`) |
| `src/views/finance`, `src/views/targets`, `src/cost`, `src/views/forecast` | Finance > Versions (create, lock with the standard head, reopen, close with the B8 rule), Assumptions (7.4's structural FX rule and paid-world check, operational edits, Remove override), Freezes (create, edit, exceptions counted), Reconcile (Mark reviewed); Targets (set, split, move, the envelope, Target changes); the leave-neutral component gate; the FX tile from the bridge's folded step |
| `src/views/whatif` | The Levers tab: session levers, three result KPIs plus one trade ratio per trade lever, pickers, Turn into requests, the scope sentence |
| `src/views/data`, `src/views/audit`, `src/views/actions` | Every workspace entry point (Shareable, Export requests, Export for a manager, Full file, read, import preview with the diff, Replace and Merge, Import requests with conflicts, Open a shared file), the Workspace menu and dialogs, the Audit page with names, labels and the head check, Action center items after writes |
| `src/components` | `Segmented` `disabled` |
| `src/testkit` | The crawl reads the app's own file writers and opener, the write path's models, What if with every lever kind and the Import requests preview |

## The write-path scenarios and the tests that walk them

Every scenario runs through `src/app/write/harness.ts` over a MemoryStore with a ticking clock, each
step acted by its own person, and checks the audit chain afterwards (`chainOk`: it verifies, every
entry is signed by its step's person and every field is in `src/plan/audit/fields.ts`).

| Scenario (PLAN) | Tests |
|---|---|
| Draft to started: a New role drafted by a manager, submitted, approved at each step, the Planned seat in Working, the tracker after approval (10.1, 10.2) | `plan/actions/requests.scenario.test.ts`, `views/requests/engine/new.test.ts`, `approvals.test.ts`, `views/team/engine/writes.test.ts` |
| Sent back and resubmitted; approved with changes (the manager reads each change and its reason; an amount refused) | `plan/actions/requests.scenario.test.ts`, `access/leaks.writes.slow.test.ts` |
| Freeze exception (a Finance step), freezes holding openings, R-1029's exception seat starting in the forecast (10.4, R64) | `plan/actions/requests.scenario.test.ts`, `actions.scenario.test.ts`, `coreFlow.scenario.test.ts`, `views/finance/engine/freezeException.scenario.test.ts`, `views/finance/engine/scenario.test.ts` |
| Cross-unit transfer with "Move budget too?", both HRBPs and both leaders (10.5, CH4); an internal move holding its seats (SC-6) | `plan/actions/transfer.scenario.test.ts`, `coreFlow.scenario.test.ts`, `views/plan/engine/edits.scenario.test.ts`, `views/requests/engine/review.test.ts` |
| Cycle to lock: rank, cut line, finish HRBP and Leader review, the lock with no line set (story 6), HRBP changes to an ask, managers deciding first (10.3, R54, R55) | `plan/actions/cycle.scenario.test.ts`, `coreFlow.scenario.test.ts`, `views/requests/engine/cycle.write.test.ts`, `cycle.review.test.ts` |
| Trade with credit: T1 approved, T3 spending its 1,104 bp, `creditBalance` 0; approve with changes re-quoting; "Move target too?"; rates that changed (11.7, R82, R83) | `plan/actions/trade.scenario.test.ts`, `coreFlow.scenario.test.ts`, `views/requests/engine/cards.review.test.ts` |
| Elimination of Manager C's seat: C and the manager below see nothing, routing the same with and without it (16.1 (a) to (d)) | `plan/actions/managerC.scenario.test.ts`, `access/leaks.manager.slow.test.ts`, `views/data/engine/openShared.test.ts` |
| Version lock and reopen; month close with back-dated adjustments; the B8 close rule; the Budget's standard head; Finance's FX and assumption edits under 7.4 (6.5, 6.6, R67, R68, R80) | `plan/actions/versions.scenario.test.ts`, `views/finance/engine/scenario.test.ts`, `cost/assumptionEdits.slow.test.ts`, `views/forecast/engine/fxTile.scenario.test.ts` |
| Remove override, operational edits, assumption values (R79, R88) | `plan/actions/assumptions.scenario.test.ts`, `views/finance/engine/scenario.test.ts` |
| An HRBP start move on an Open seat: "Changed by your HRBP: start moved from Jan to Mar" for the seat's manager, every atom's filled part unchanged (7.2 rule 3) | `views/plan/engine/edits.scenario.test.ts`, `cost/editInvariance.slow.test.ts` |
| Targets set, split and moved inside the envelope and refused past it (R69) | `views/targets/engine/scenario.test.ts`, `plan/actions/actions.scenario.test.ts` |
| What if levers to results, Turn into requests (10.6) | `views/whatif/engine/whatif.test.ts`, `plan/actions/actions.scenario.test.ts` |
| Import requests on the six sample files: "Merges 14 requests from 6 files; 2 conflicts to choose", then "Merged 14 requests from 6 files, 2 conflicts" (5.5, R77) | `plan/workspace/mergeRequests.test.ts`, `views/requests/engine/queue.import.test.ts`, `plan/actions/actions.scenario.test.ts` |
| Two browsers: request IDs that never collide, an approval applied where it is imported, merge order across wall-clock days, a restore, diverged copies in one import, freeze IDs (R74 to R77) | `app/write/requestIds.scenario.test.ts`, `plan/actions/workspace.scenario.test.ts`, `coreFlow.scenario.test.ts`, `recheck.scenario.test.ts` |
| Replace and Merge from a Full file: the diff, the hash-mismatch refusal, the file's log taken by Replace, a broken chain, a lost tail and a forged lock refused (C35, R78) | `views/data/engine/workspace.test.ts`, `plan/actions/workspace.scenario.test.ts`, `recheck.scenario.test.ts` |
| R47: submit, approve, send back and resubmit with the wall clock weeks after the as-of date (browser B6) | `plan/actions/coreFlow.scenario.test.ts`, `views/requests/engine/review.test.ts`, `plan/actions/versions.scenario.test.ts` |
| Expiry: a Sent back request 60 days idle frees its seat and credit, stays expired when someone comments, and can be withdrawn (R73) | `app/write/expiry.scenario.test.ts`, `views/team/engine/expiry.scenario.test.ts`, `views/requests/engine/review.test.ts` |
| A reader tab, a write lock, an Acting as block, a store that fails mid-write (5.4, R88) | `plan/actions/gate.test.ts`, `app/write/run.test.ts`, `plan/store/browserStore.test.ts` |
| The Audit page after writes, the Action center items following each decision | `views/audit/engine/writes.test.ts`, `review.test.ts`, `views/actions/engine/writes.test.ts` |

## Leak, attack and perf tests added

- `src/access/leaks.writes.slow.test.ts` (new): a New role walked through the write path (drafted,
  submitted, an HRBP comment with an amount forced to Approvers only, approved with changes, sent
  back, submitted again; a second draft withdrawn). After each step Manager A's crawl holds no amount
  and not the comment; Export for a manager equals Manager A's own Shareable; another manager reads
  nothing; HR admin is the control.
- `src/access/leaks.manager.slow.test.ts`: the fixture's imported request carries a job title with an
  amount (PV-6); Export for a manager for C is written from C's, the HRBP's and HR admin's contexts,
  byte-equal with and without the Elimination.
- `src/access/amountSpellings.slow.test.ts`: the new spellings (R81) through the write path.
- `src/cost/assumptionEdits.slow.test.ts`: M2's two `it.todo` cases filled, and case (f), vacancy
  edits by department with three people unpaid.
- `src/views/home/engine/lineage.slow.test.ts` (new): every key figure of the HRBP, Leader and Finance
  homes lists only the fields its model reads.
- `src/cost/gateLeave.slow.test.ts` (new at M3 build): the component gate counts at leave-neutral
  prices.
- `src/app/routes.slow.test.ts`: no route may be a stub any more.
- Unit attack and leak cases: `views/finance/engine/editsFx.test.ts` (PV-1 to PV-4),
  `views/data/engine/openShared.test.ts` (PV-5, 16.1 (b)), `importRequests.test.ts` (PV-8, effect
  conflicts), `access/visibility.test.ts` (spellings and ranges), `plan/actions/requestIds.test.ts`
  (no lane, no dependency on another person's requests), `views/plan/engine/notes.test.ts` (an
  imported approval's seat note), `data/versionNames.test.ts` (this step).
- Perf: no new budget; the six perf files (17 tests) hold every M2 budget with the write path in
  place (plan model, forecast, bridge, the sample's generation, the Action center's collection).

## Review findings, with their fixes and tests

Severity is the verifier's. "Test" names the test that fails on the code before the fix.

### Scenarios lens

| ID | Severity | Finding | Fix | Test |
|---|---|---|---|---|
| SC-1 | high | The lock ignored the cut line the tab showed: with no stored line every ask was approved | D-CYCLE: the lock decides each unit by the stored mark, else the default line over the same room (R54) | `plan/engine/coreFlow.test.ts`, `plan/actions/coreFlow.scenario.test.ts`, `views/requests/engine/cycle.review.test.ts` |
| SC-2 | high | The lock approved asks whose manager never decided, and Sent back asks | `lockCycle` refused while asks wait (`lockWaitingText`); Sent back asks out of the ranking and not decided | same, `plan/actions/cycle.scenario.test.ts` |
| SC-3 | high | Expiry was only checked when someone acted | D-EXPIRY: one helper read everywhere (R73) | `coreFlow.test.ts`, `views/requests/engine/review.test.ts`, `app/write/expiry.scenario.test.ts`, `views/team/engine/expiry.scenario.test.ts` |
| SC-4 | high | An approved freeze exception's seat stayed held | `freezeExemptions`, `FreezeOpening.exemptFrom` on Freezes, Openings and the forecast (R64) | `coreFlow.test.ts`, `views/finance/engine/freezeException.scenario.test.ts`, `coreFlow.scenario.test.ts` |
| SC-5 | high | Approving a Start date, Level or Location change edited a seat after its offer was accepted | refused with ACCEPTED_OFFER_TEXT; the card offers no approve (R84) | `coreFlow.test.ts`, `views/requests/engine/cards.review.test.ts` |
| SC-6 | high | An approved internal move moved the gap and its receiving seat could be given away again | `heldForMove`, `heldSeatRefusal`; the seat offered to nothing (R84) | `coreFlow.test.ts`, `coreFlow.scenario.test.ts`, `views/whatif/engine/whatif.test.ts`, `views/requests/engine/review.test.ts` (this step) |
| SC-7 | medium | Imported freeze exceptions had no freeze ID or reason | `exceptionFreezeOf`, the Finance step's reasons, "No business reason was given." | `coreFlow.test.ts`, `freezeException.scenario.test.ts`, `review.test.ts` |
| SC-8 | high | An approver outside the mode's scope never saw what waited on them | Approvals by waiting approver, whatever the scope (R72) | `views/requests/engine/review.test.ts` |
| SC-9 | medium | The HRBP could not approve a cycle ask with changes | engine 'cycle-changes', the Cycle tab's cards (R55) | `coreFlow.test.ts`, `coreFlow.scenario.test.ts`, `cycle.review.test.ts` |
| SC-10 | medium | A trade approved with a lower count left out the credit change | the change set stores the credit before and after; the card reads it (R82) | `cards.review.test.ts` |
| SC-11 | medium | No "Rates can change" flag, no "Rates changed" note | quote note and step note; a no-longer-fitting trade refused | `coreFlow.test.ts`, `coreFlow.scenario.test.ts`, `cards.review.test.ts` |
| SC-12 | medium | No warning for a give seat's Interviewing req | the card names the req | `coreFlow.test.ts`, `cards.review.test.ts` |
| SC-13 | medium | Manager C's next ID moved with a hidden request | keyed request numbers (R74); one refusal for hidden and unknown; no next ID in Manager mode | `requestIds.test.ts`, `app/write/requestIds.scenario.test.ts`, `managerC.scenario.test.ts`, `review.test.ts` |
| SC-14 | low | Spelled-out amounts were missed | new spellings and whole-span replacement (R81) | `access/visibility.test.ts` |
| SC-15 | medium | A Location change kept the old site's cost center | refused where the department has no cost center (R85) | `coreFlow.test.ts` |
| SC-16 | low | Approve with changes audited only the count | every trade field it moves, and the credit | `coreFlow.test.ts` |
| SC-17 | low | A resubmit wrote an empty 'steps' entry | none when the chain is unchanged | `coreFlow.test.ts` |
| SC-18 | low | An Elimination with no last day ended the day before approval | ends on the approval date | `coreFlow.test.ts` |
| SC-19 | low | The credit refusal showed two equal numbers | four decimals where two read equal | `coreFlow.test.ts` |
| SC-20 | low | A locked cycle read "after the 0th ranked head" | the outcome after lock (`lockedOutcomes`) | `cycle.review.test.ts` |
| SC-21 | low | "Cost shows on Targets when FY27 is the version shown" with FY27 shown | "<org> is outside the targets this mode shows ..." (R51) | `review.test.ts` |

### Privacy lens

| ID | Severity | Finding | Fix | Test |
|---|---|---|---|---|
| PV-1 | high | An app-written actual FX rate passed 7.4's check and the close booked it | the structural FX rule; the close refuses such a rate (R68) | `views/finance/engine/editsFx.test.ts`, `plan/actions/versions.scenario.test.ts` |
| PV-2 | high | A plan rate for a closed month passed the check | closed months' rates read only outside HR admin; the FX tile is the bridge's folded step | `editsFx.test.ts`, `versions.scenario.test.ts`, `views/forecast/engine/fxTile.scenario.test.ts` |
| PV-3 | high | `version.create` priced its set on `from`'s grid only | priced on the new version's own grid; CANNOT_PRICE_TEXT | `editsFx.test.ts`, `versions.scenario.test.ts` |
| PV-4 | high | The edit check counted movers at real prices, so a refusal told of unpaid leave | the paid world on both sides (R67; recheck widened it to the vacancy allowance and cohort lines) | `editsFx.test.ts`, `cost/assumptionEdits.slow.test.ts` (f) |
| PV-5 | high | An opened Shareable showed a limited Elimination's seat entries in full | link by the shared `at`; opened files drop unlinked entries (R71); the import writes the request's entry (R76) | `views/data/engine/openShared.test.ts`, `views/audit/engine/review.test.ts` |
| PV-6 | high | An amount in an imported job title reached Manager surfaces and files | `titleFor`, `managerText` in files, Import requests refuses such a title (R48) | `review.test.ts`, `plan/actions/workspace.scenario.test.ts`, `views/team/engine/titleAmount.test.ts`, `leaks.manager.slow.test.ts` |
| PV-7 | medium | A Leader's import overwrote a hidden request about the Leader's own seat | `mayMerge` leaves the Leader's own seats out | `workspace.scenario.test.ts`, `plan/workspace/mergeRequests.test.ts` |
| PV-8 | medium | The conflict list counted comments the importer may not read | copies cut to the importer's view; visible comments only | `views/data/engine/importRequests.test.ts` |
| PV-9 | low | A trade block named a pending request the viewer cannot see | named only to a full viewer | `coreFlow.test.ts`, `review.test.ts` |

### Integrity lens

| ID | Severity | Finding | Fix | Test |
|---|---|---|---|---|
| IN-1 | high | Request IDs collided across browsers | D-ID (R74); ID clashes listed, never merged | `requestIds.test.ts`, `requestIds.scenario.test.ts`, `plan/workspace/merge.test.ts` |
| IN-2 | high | An imported approval arrived without its effect | D-MERGE: `replayApproval`, `importedApprovals` (R76) | `coreFlow.test.ts`, `coreFlow.scenario.test.ts`, `workspace.scenario.test.ts` |
| IN-3 | high | A stale file moved the merge base and reverted an approval | the base never moves to this workspace's copy; decided copies stay | `merge.test.ts` |
| IN-4 | medium | With no base, a change here was overwritten by the copy that came back | diverged copies are a conflict | `merge.test.ts` |
| IN-5 | medium | A write was saved before its audit entries | `PlanStore.commit`, one write (R88) | `app/write/run.test.ts`, `plan/store/browserStore.test.ts` |
| IN-6 | medium | The Full file went over 25 MB after one more lock | C35 | `views/data/engine/workspace.test.ts`, `plan/workspace/file.test.ts`, `validate.test.ts` |
| IN-7 | low | A conflict settled to the file's copy counted as neither | counted as merged | `workspace.scenario.test.ts` |
| IN-8 | low | Non-finite and out-of-range values were accepted | `valueRefusal` (R88) | `plan/actions/assumptions.scenario.test.ts` |
| IN-10 | low | A lost tail of the log did not show | `verifyChain(entries, head)`, the head never lowered | `browserStore.test.ts`, `views/audit/engine/review.test.ts` |
| IN-12 | low | `updatedAt` was compared as text | `isIsoStamp`, `stampMs` (R77) | `merge.test.ts`, `validate.test.ts` |

### Spec lens

| ID | Severity | Finding | Fix | Test |
|---|---|---|---|---|
| SP-1 | high | The lock approved asks the manager never approved or sent back | as SC-2 | as SC-2 |
| SP-2 | medium | Story 6's default line was ignored at lock | as SC-1 | as SC-1 |
| SP-3 | high | An imported approval brought no Planned seat | as IN-2 | as IN-2 |
| SP-4 | high | An expired Sent back request still counted as pending | as SC-3 | as SC-3 |
| SP-5 | medium | Cross-unit trades never offered "Move target too?" | R83 | `coreFlow.test.ts`, `coreFlow.scenario.test.ts`, `cards.review.test.ts` |
| SP-6 | medium | "Approved with changes" at lock never happened | as SC-9 | as SC-9 |
| SP-7 | medium | A Leader could move a cut line past the envelope | heads checked against the room (R52) | `coreFlow.scenario.test.ts` |
| SP-8 | low | The policy let a Leader approve with changes, the engine refused | Leader cell H with its reason (R52) | `access/policy/policy.test.ts`, `access/matrix.test.ts` |
| SP-10 | medium | A trade approved with changes was not re-quoted | re-quoted at its changed count and start | `coreFlow.scenario.test.ts` |
| SP-11 | medium | No "Rates changed" note; higher rates blocked the approval | as SC-11 | as SC-11 |
| SP-12 | medium | No Interviewing warning | as SC-12 | as SC-12 |
| SP-13 | medium | A Budget lock copied Working's standard head | computed from the Budget (R80) | `versions.scenario.test.ts`, `views/finance/engine/scenario.test.ts` |
| SP-14 | medium | The Audit page showed exact band and standard head changes | "changed" outside HR admin (R80) | `access/visibility.test.ts` |
| SP-15 | medium | The Full file was too large after one more lock | as IN-6 | as IN-6 |
| SP-17 | low | A trade's note left out the credit change | as SC-10 | as SC-10 |
| SP-18 | low | The Leader's `transfer.move-budget` was shown but unused | Leader cell H (R52) | `policy.test.ts`, `views/plan/engine/edits.test.ts` |

### UI lens

| ID | Severity | Finding | Fix | Test |
|---|---|---|---|---|
| UI-1 | high | Story 6: the tab showed a line the lock ignored | as SC-1 | as SC-1 |
| UI-2 | medium | A Leader's split rewrote every sub-org's cost target | untouched boxes keep the stored cost (R69) | `views/targets/engine/writes.test.ts`, `scenario.test.ts`, `plan/actions/actions.scenario.test.ts` |
| UI-3 | high | An amount in a version name reached Manager mode, files and a toast | refused at entry, FREE_TEXT_HINT, Full files with one refused; Manager mode reads names through `managerText` (this step) | `versions.scenario.test.ts`, `views/finance/ui/copy.test.ts`, `data/versionNames.test.ts` |
| UI-4 | medium | The cut line lost focus after one arrow key | the handle refocuses | `views/requests/ui/render.test.ts` |
| UI-5 | medium | The comment audience picker was not disabled | a disabled radio fieldset; `Segmented` `disabled` | `render.test.ts`, `components/segmented.test.ts` |
| UI-6 | medium | The manager's sentence left out the credit change | as SC-10 | as SC-10 |
| UI-7 | medium | Import requests showed a choice it did not send | "Decide later" by default, "Cannot merge" rows apart | `render.test.ts` |
| UI-8 | high | A split used Executive Office's target for the CEO's whole tree | sub-orgs inside the parent's unit; the action reads the form's list (this step) (R69) | `views/targets/engine/writes.test.ts`, `actions.scenario.test.ts` |
| UI-9 | low | "1 heads" | `headsCount` | `views/requests/ui/render.test.ts` |
| UI-10 | low | "after the 0th ranked head" after lock | as SC-20 | as SC-20 |
| UI-11 | low | The preview said "Merged" before anything merged | `mergePreviewText` (R77) | `merge.test.ts`, `mergeRequests.test.ts` |
| UI-12 | low | An unlabelled select; repeated split labels | labelled field; fieldsets with legends | `views/targets/ui/render.test.ts`, `views/requests/ui/render.test.ts` |
| UI-13 | low | Sub-org labels used the seat's department | the parents' rule | `views/targets/engine/writes.test.ts` |
| UI-14 | low | Copy slips | scope sentence, per-mode hint, empty Mine, field labels | `views/whatif/engine/whatif.test.ts`, `views/audit/engine/review.test.ts`, `views/requests/ui/render.test.ts` |

### Lens findings judged not real

| ID | Verifier's reading | Where recorded |
|---|---|---|
| SP-9 | A freeze does not block Start recruiting by design (10.2, CH1); the freeze holds the opening (R10) | R63 |
| SP-16 | Levers act on seats; pending requests count on both sides | R59 |
| SP-19 | The note was on the seat's grid row; the card was polish | Built anyway (position card "Changes in Working"), R91 |
| IN-9 | The lock hash covers what PLAN 5.3 lists | Known gap 4 below |
| IN-11 | Every reader goes through `requestsOf`, which drops unknown nested keys | No change |

### Browser findings (lead's pass, 24 Oct)

| ID | Severity | Finding | Fix | Test |
|---|---|---|---|---|
| B6 | high | A request submitted while the wall clock was after the as-of date never reached its approver | R47: business dates from the as-of date; measures never negative | `plan/engine/coreFlow.test.ts`, `plan/actions/coreFlow.scenario.test.ts`, `views/requests/engine/review.test.ts`, `plan/actions/versions.scenario.test.ts` |
| B7 | low | Audit 'steps' values showed employee IDs | names through the viewer's rules, in files too (R71) | `views/audit/engine/review.test.ts` |
| B8 | medium | Finance could close a month that ends after the as-of date | refused, and the button disabled, with "Oct 2026 closes once the data is as of 31 Oct 2026 or later." | `versions.scenario.test.ts`, `views/finance/engine/writes.test.ts`, `views/finance/ui/render.test.ts` |

## Lead decisions, and why

| Decision | What | Why |
|---|---|---|
| R47 | The app's business "today" is the as-of date; audit `at` stays the wall clock; measures never go negative; a stored later date reads as the as-of date; a month closes once the as-of date reaches its month-end | The data describes the as-of date; wall-clock dates made today's requests wait on nobody (B6) and allowed closing a month the extract does not hold (B8) |
| C35 | Full files by column with integer cents, 25 MB and 150 MB limits | The app's own Full file was refused after one more lock (IN-6, SP-15) |
| Replace takes the audit log | `PlanStore.replaceAudit`, only from a Full file whose chain verifies, then one 'workspace replaced' entry; Merge keeps this workspace's log | A Replace that kept the old log left the restored history out of step with its plan state (section 6 item 4) |
| Remove override | An audited action restoring the parent's value, under 7.4's edit rule | An org override could not be taken back (section 6 item 5) |
| D-EXPIRY | Expired derived at read time through one helper; an expired request is not pending and may be withdrawn | Expired is nobody's action, so storing it would need an author; one helper keeps every list, count and check agreeing (SC-3, SP-4) |
| D-CYCLE | The lock decides by the line the tab shows; managers decide first; Sent back asks are their requesters' | What a person sees on the tab must be what the lock does (SC-1, SC-2, SP-1, SP-2, UI-1) |
| D-ID | Request IDs unique across browsers under a per-workspace tag | Two browsers minted the same ID and a merge dropped one request (IN-1); a counter moved with hidden requests (SC-13) |
| D-MERGE | An imported approval applies its effects here through the same engine, idempotently, or is a conflict naming why; merge bases per the verifiers | A merged approval with no seat broke asks and the gap (IN-2, SP-3); bases and text comparison lost work (IN-3, IN-4, IN-12) |
| Smaller gaps | Trade draft edit from Mine, Manager mode's status after approval, "Changed by your HRBP" on the position card, home tile lineage | CONTRACTS-M3 7.4.3's open polish, closed in M3 |

## Attack results (the recheck)

The recheck attacked the fixed tree with privacy and flow probes; it found 17 attacks (5 high, 5
medium, 7 low). Every one is fixed in the model with a permanent test that fails on the tree before
the fix (35 unit cases in 15 files and both new slow cases). The probes, re-run from copies on the
fixed tree, show the fixed behaviour; `a-lane` and `j-lanes` import the removed `idLane` and no longer
load, and their properties are in the new tests.

| Attack | Severity | Fix | Test |
|---|---|---|---|
| PV-4-remains-vacancy | high | The whole edit check in a paid world (`paidWorld`) | `editsFx.test.ts`, `assumptionEdits.slow.test.ts` (f) |
| PV-5-via-D-MERGE | high | `importedApprovals` writes the request's 'state' entry at the seat entries' `at`; opened files drop an import's unlinked seat entries | `openShared.test.ts` (Import requests and a Full-file Merge) |
| R47-MERGE-ORDER | high | `HcRequest.revisedAt` (wall clock) is merge recency | `recheck.scenario.test.ts`, `merge.test.ts` |
| EXPIRED-REVIVED-BY-COMMENT | high | `commentOnRequest` refuses an expired request; the card offers no comment | `expiry.scenario.test.ts` |
| MERGE-DROPS-REMOVED-OVERRIDES | high | validate.ts reads `removedAssumptions`; `mergePlanState` carries both sides' | `validate.test.ts`, `merge.test.ts`, `recheck.scenario.test.ts` |
| D-ID-lane-identifies-requester | medium | Keyed request numbers (`requestNumber`), no lane | `requestIds.test.ts`, `requestIds.scenario.test.ts` |
| SC-14-ranges-and-per-period | medium | `rangeSpans` and per-period amounts | `visibility.test.ts`, `amountSpellings.slow.test.ts` |
| effect-conflict-names-limited-fields | medium | Copies cut to the importer's view; EFFECT_NOT_HERE_TEXT | `importRequests.test.ts` |
| MERGE-BATCH-DIVERGED | medium | Two diverged file copies in one import are a conflict | `merge.test.ts`, `recheck.scenario.test.ts` |
| FREEZE-ID-COLLISION | medium | 'FRZ-<tag>-<nnn>'; `freezeClashes` keeps both | `merge.test.ts`, `recheck.scenario.test.ts`, `actions.scenario.test.ts` |
| SC-13-refusal-text, HIDDEN-VS-UNKNOWN-TEXT | low | NOT_FOUND_TEXT for a hidden request | `managerC.scenario.test.ts` |
| close-blocked-by-org-fx-row | low | Company FX rows only; an org-keyed FX row refused (ORG_FX_TEXT) | `versions.scenario.test.ts` |
| REPLACE-LAUNDERS-LOST-TAIL | low | `verifyChain(log, incoming.auditHead)` in Replace and the preview | `recheck.scenario.test.ts` |
| RESTORE-REUSES-REQUEST-IDS | low | Replace takes a new ID secret; `createdAt` tells copies apart | `recheck.scenario.test.ts`, `merge.test.ts` |
| LANE-COLLISION | low | No lanes (keyed numbers) | `requestIds.test.ts` |
| FORGED-LOCK-ACCEPTED | low | `readWorkspace` verifies each locked version's own lock | `validate.test.ts`, `recheck.scenario.test.ts` |

The attack fixer also fixed `src/views/requests/ui/useWriteSteps.ts`, which read only 'R-<n>' from a
notice, so Requests > New's save-then-submit stopped on every tagged ID
(`views/requests/ui/useWriteSteps.test.ts`).

## This verify step

Every fixer and the attack fixer left nothing failing. The open `needsElsewhere` items were closed
as follows (each code change with a test that fails before it, checked by restoring the file's
earlier copy):

| Item | Resolution | Test |
|---|---|---|
| core-flow: files must keep `trade.moveTarget` and `changes.credit` | `src/plan/types.ts` gains `TradeFields.moveTarget?` and `ChangeSet.credit?`; `src/plan/workspace/validate.ts` reads both. Before, an imported cross-unit approval replayed "Move target too?" as on, whatever Finance chose | `plan/workspace/validate.test.ts` "keeps a trade's "Move target too?" choice ..." |
| requests-ui: the card should read the stored credit pair | `creditChangeOf` reads `ChangeSet.credit` first (a start change whose re-quote moved the credit included), else derives it as before | `views/requests/engine/cards.review.test.ts` "creditChangeOf reads the pair the change stored ..." |
| core-flow: Requests > New's give list must leave out held seats (SC-6) | A receiving seat an approved internal move holds offers no type and its trade note gives the hold, in the actions' words (`approvedMoveTo`, `heldSeatText`) | `views/requests/engine/review.test.ts` "a receiving seat an approved internal move holds" |
| plan-finance-ui: `env.subOrgsOf` should call `subOrgSeatsOf` (UI-8) | `src/app/write/context.ts` reads the form's function; the unit-head test now expects NOT_A_SUB_ORG_TEXT for another unit's head (stricter: the env never names it) | `views/targets/engine/writes.test.ts` (equality, was a subset), `plan/actions/actions.scenario.test.ts` |
| plan-finance-ui: Manager mode must read version names through `managerText` (UI-3 read side) | `src/data/context.tsx` `versionsIn`; `managerText` takes `Pick<Viewer, 'mode'>` | `data/versionNames.test.ts` (new) |
| requests-ui, plan-finance-ui: one expiry list | `src/app/write/expiry.ts` `effectiveRequests` returns `effectiveRequestsOf` | `app/write/expiry.scenario.test.ts` "one effective list" |
| plan-finance-ui: notes.ts should reuse the Audit page's `requestOfEntry` | Done. No observable difference was found: approval rows carry `sourceRequestId`, which both links read first, so the new test passes on both copies; it stays as a regression test for an imported confidential Elimination | `views/plan/engine/notes.test.ts` "a note follows its request: an imported approval" |
| core-platform: SC-15 for new seats | Recorded as R85 (the department's cost center at the site where one exists, else the manager's; band estimate until HRIS assigns one) | none (a reading) |
| core-flow: `tradeQuoteOf` should pass `requestShown` and `openReq` | Left: the card derives the Interviewing warning and the rates note and names a pending request only to a full viewer; the engine's default never names one (CONTRACTS-M3 8.4) | covered by `cards.review.test.ts`, `review.test.ts` |
| requests-ui: `lockCycle`'s rooms read the as-of year's asks, the tab the cycle year's | Left: both count heads over the same positions and requests in force; they agree on story 6's lock | `coreFlow.scenario.test.ts`, `cycle.review.test.ts` |
| core-flow: `closeMonth` should use the engine's `closeTooEarlyText` | Done by core-platform with copy.ts `closeNotYetText`, the same sentence (both tested) | `versions.scenario.test.ts`, `coreFlow.test.ts` |
| attack fixer: R47's step order across wall-clock days | Recorded as R87 (accepted) | none (a reading) |
| attack fixer: PLAN 15 readings and the 15.3 risk | R48 to R91 in 15.1, C35 in 15.2, item 9 in 15.3 | |
| every fixer: CONTRACTS-M3 exports | Sections 8.2 (retyped request IDs), 8.4 to 8.9 | |

Docs updated: docs/PLAN.md (15.1 R48 to R91; 15.2 C35 completed and moved after C34; 15.3 item 9;
16.1's rows for the new tests), docs/CONTRACTS-M3.md (8.2 corrected for the recheck's request IDs;
8.4 to 8.9 new), and this report.

## Known gaps carried to M4

1. **Help, tours, the load file and the deploy** are M4's (PLAN 17): `src/help` holds no article yet,
   Finance > Export's load file is a placeholder, and the one-file build is not yet published.
2. **No browser pass after the fixes.** The rules of these steps forbid a dev server, so the review
   fixes, the recheck's fixes and this step's were checked through render tests, `routes.slow` (every
   route in all five modes) and the shell tests. M4's browser pass should walk B6 and B8 again, the
   Import dialogs, and 375 px in light and dark.
3. **Step order across wall-clock days** (R87): accepted; dates, day counts and merge order are right.
4. **The lock hash** covers lines, assumptions, rates, proration and the engine version (PLAN 5.3),
   not a reforecast's stored forecast or the version's name, so FORGED-LOCK's check covers only what
   the hash covers (IN-9, judged not real; hashing more is a PLAN change).
5. **Version IDs are slugs of their names.** Entry refuses an amount in a name, and Manager mode reads
   names through `managerText`, but a version ID made from a name that came with a Full file is not
   rewritten. **Closed in M4**: `src/plan/workspace/versionIds.ts` (`cleanVersionIds`, run by Replace
   and Merge, and `mintVersionId`, which `lockVersion` uses) rewrites an ID that carries an amount
   (CONTRACTS-M4 8.1 m3-gaps, PLAN 15.1 R100); tests `versionIds.test.ts` and
   `versionIds.scenario.test.ts`.
6. **The engine's quote warnings are not wired** in the app's `tradeQuoteOf` (CONTRACTS-M3 8.4): the
   request card derives the same sentences, but What if's trade lever does not show the Interviewing
   warning. **Closed in M4**: `tradeQuoteOf` passes `openReq` (`openReqsOf`) and `requestShown`, and
   What if's lever list has a "Trade note" column (`LeverRow.tradeNote`); tests
   `src/app/write/quote.test.ts` and `whatif.test.ts`. CONTRACTS-M3 8.4 is corrected.
7. **New seats at a site with no department cost center** keep the manager's cost center (R85).
8. **Over-redaction** of plain ranges such as "1000-1200" (R81), accepted.
9. **One flaky unit test under load**: the Excel round trip in `src/data/import/templates.test.ts`
   timed out once (30 s) in a full parallel unit run in this step and passes alone; it is an M1 test
   that reads and writes the whole sample through ExcelJS and SheetJS. **Closed in M4**: the round
   trips moved to `src/data/import/templates.slow.test.ts` (the slow project, one file at a time),
   every assert as it was.
10. **PLAN 8.3's grid and 16.2** still show the earlier text where R52 (the Leader cells) and C35 or
    R77 (25 MB, "later updatedAt wins") override it; PLAN 15 overrides earlier text by its own rule.
    **Closed in M4**: PLAN 8.3's Leader cells and 16 were brought in line during the M4 build
    (CONTRACTS-M4 8.1 ship-docs), and PLAN 5.5 and 13.5 in the M4 verify step.
