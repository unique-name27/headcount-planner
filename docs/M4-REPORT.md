# M4 report: help, exports, the one-file build and the ship

Milestone M4 of docs/PLAN.md 17 (help, tours, `about-server`, exports, the one-file build, the
browser check and the deploy), verified on 25 Oct 2026. M4 was frozen as contracts on 24 Oct
(docs/CONTRACTS-M4.md sections 1 to 6), built by seven builders (help-engine, help-views,
help-trust, exports, finance-export, ship-docs, m3-gaps), integrated (CONTRACTS-M4 8), reviewed by
five lenses (copy, exports, help, and the spec read in two halves, spec-a and spec-b) plus the
lead's browser pass, and fixed in five folder groups (help, exports, guard-crawl, app-data-plan,
docs-ship) under three lead decisions (D-PAYFILES, D-MODELINE, D-SPEC). A loose-ends fixer closed
the cross-group items, a recheck then attacked the fixed tree and found 10 more defects, and an
attack fixer fixed each in the model. This verify step closed the last open items, recorded the
readings in PLAN 15 (R92 to R131), brought PLAN 3.3, 5.4, 5.5 and 13.5 in line, removed every local
machine path from the docs, and ran `npm run verify` from a clean `node_modules/.vite`.

All 49 kept review findings, the browser finding B9 and the 10 attack findings are closed: each code
fix has a test that fails on the code before it, and each reading the lead chose instead of code is
a PLAN 15.1 row. Five lens findings were judged not real by their verifiers (CP-8, HL-7, SB-2, SB-3,
SB-7); PLAN already settles each.

The repository is not yet published: there is no commit, no remote and no Pages site. The ship
checklist at the end lists the outward steps, each waiting for the owner's go (PLAN 3.4).

## Verify output

Run from the project root with `npm run verify` (scripts/verify.mjs) after deleting
`node_modules/.vite`, on Node 24.14.1, with `HCP_TEST_WORKERS=6` (vite.config.ts caps Vitest's
workers with it on this computer, which crashes under a full load), with no dev server or other Node
process running and port 8822 free. Vite runs as `node --max-semi-space-size=64
node_modules/vite/bin/vite.js`, never `npx vite`. The full logs were kept in the review's scratch
folder (`m4-review/verify1.txt` and `verify2.txt`), outside the repository.

**First run** (14:22): five steps passed and the tests failed on one real assertion, not a crash:
`src/views/home/engine/lineage.slow.test.ts` "blanking it moves the tile on some home, or a note says
why it is read all the same" listed `year-end-heads: reqs.reqId` (388 of 389 files and 3,805 of 3,806
tests passed). The same failure was already in app-data-plan's last slow log; no fixer had picked it
up. A probe showed the year-end heads tile on the HRBP and Leader homes identical with every req ID
blank and with the reqs in reverse order: the forecast reads a req's ID only to name and order the
accepted offers it starts, find an offer's currency, and break a tie between two open reqs of one
seat opened the same day, which gives the same opened date. The tile's lineage rightly lists the
field, so the fix is the lineage note the test asks for (`OFFER_IDS` in
`src/views/home/engine/lineageNotes.ts`, kind 'absent'); the test fails without it and passes with
it, and every note still holds.

**Second run** (15:11), on the final source tree (only docs changed after it), exit code 0:

| Step | Result | Time | Notes |
|---|---|---|---|
| No data files in git | PASS | 0.1 s | "No data files outside src/data/sample/." |
| Type-check (`npx tsc --noEmit -p .`) | PASS | 2.3 s | No errors |
| Lint (`npx biome check src scripts`) | PASS | 1.6 s | 1,135 files, no fixes |
| Tests (unit, slow, perf) (`npx vitest run`) | PASS | 2,327.2 s | 389 files, 3,806 passed, 0 failed |
| App build | PASS | 9.5 s | `dist/`: main chunk 2,425.97 kB (783.30 kB gzip), CSS 69.41 kB; ExcelJS (929.56 kB), SheetJS (492.27 kB), pptxgenjs (368.50 kB) and the long CSV model (164.70 kB) in their own lazy chunks |
| One-file build | PASS | 9.6 s | `dist-single/index.html` 5,140,194 bytes (1,744.21 kB gzip), one inline script and one inline style, opens from `file://` with no network request |

The summary as printed:

```
Headcount Planner verification
  PASS  No data files in git (0.1s)
  PASS  Type-check (2.3s)
  PASS  Lint (1.6s)
  PASS  Tests (unit, slow, perf) (2327.2s)
  PASS  App build (9.5s)
  PASS  One-file build (9.6s)
```

No Node worker crashed in either run. Rolldown notes, as at the M4 integration, that
`src/views/finance/engine/longCsv.ts` is also imported statically (by `src/app/longExport.ts` and
the Finance Export model), so its dynamic import in the Export menu shares that chunk.

## Test counts

From a third run of all three projects with the JSON reporter on the final tree (`npx vitest run
--reporter=json`, `HCP_TEST_WORKERS=6`), which passed again: 389 files, 3,806 tests passed, 0
failed, no skip and no todo.

| Project | Files | Tests | Notes |
|---|---|---|---|
| unit | 358 | 3,637 | The M4 integration ended at 334 and 3,474; the review fixers, loose ends and the attack fixer added 24 files and 163 tests |
| slow | 25 | 152 | Integration 23 and 143; new `access/headers.slow.test.ts` (every output's first lines in every mode) and `testkit/counts.slow.test.ts` (plain counts over the personas and every Acting as pick) |
| perf | 6 | 17 | Unchanged; every budget holds, the sample's generation with its baseline hash included |
| Total | 389 | 3,806 | M3 closed at 337 files and 3,306 tests |

By folder:

| Folder | Unit files | Unit tests | Slow files | Slow tests | Perf files | Perf tests |
|---|---|---|---|---|---|---|
| `src/access` | 13 | 172 | 10 | 77 |  |  |
| `src/app` | 23 | 126 | 1 | 5 |  |  |
| `src/app/write` | 5 | 23 |  |  |  |  |
| `src/charts` | 15 | 137 |  |  |  |  |
| `src/components` | 6 | 67 |  |  |  |  |
| `src/cost` | 7 | 129 | 8 | 46 |  |  |
| `src/data` | 12 | 175 |  |  |  |  |
| `src/data/import` | 12 | 279 | 1 | 4 |  |  |
| `src/data/lists` | 2 | 32 |  |  |  |  |
| `src/data/quality` | 4 | 59 |  |  |  |  |
| `src/data/sample` | 5 | 104 |  |  | 1 | 3 |
| `src/drill` | 10 | 143 |  |  |  |  |
| `src/help` | 11 | 190 | 1 | 11 |  |  |
| `src/lib` | 22 | 228 |  |  |  |  |
| `src/metrics` | 14 | 111 |  |  |  |  |
| `src/plan` | 1 | 7 |  |  |  |  |
| `src/plan/actions` | 16 | 98 |  |  |  |  |
| `src/plan/audit` | 1 | 14 |  |  |  |  |
| `src/plan/engine` | 27 | 497 |  |  | 1 | 4 |
| `src/plan/store` | 3 | 45 |  |  |  |  |
| `src/plan/workspace` | 7 | 114 |  |  |  |  |
| `src/ship` | 9 | 60 |  |  |  |  |
| `src/styles` | 2 | 23 |  |  |  |  |
| `src/testkit` | 5 | 20 | 1 | 2 |  |  |
| `src/views` | 4 | 34 |  |  |  |  |
| `src/views/actions` | 16 | 98 |  |  | 1 | 2 |
| `src/views/audit` | 4 | 25 |  |  |  |  |
| `src/views/data` | 10 | 60 |  |  |  |  |
| `src/views/finance` | 14 | 108 |  |  |  |  |
| `src/views/forecast` | 23 | 104 | 1 | 1 | 2 | 5 |
| `src/views/home` | 4 | 44 | 1 | 3 |  |  |
| `src/views/plan` | 15 | 96 | 1 | 3 | 1 | 3 |
| `src/views/requests` | 13 | 91 |  |  |  |  |
| `src/views/targets` | 9 | 55 |  |  |  |  |
| `src/views/team` | 10 | 41 |  |  |  |  |
| `src/views/whatif` | 4 | 28 |  |  |  |  |

This step added no test file: it extended `src/help/access.test.ts`'s leave scan to the glossary
(the same test, stricter) and added the lineage note that `views/home/engine/lineage.slow.test.ts`
asked for.

## What M4 delivered, by folder

| Folder | What is there |
|---|---|
| `src/help` (content new in M4) | 40 articles in six groups (Start here 6, Each view 11, Your data 8, Definitions 4, Privacy and trust 6, Help and support 5) and 12 tours, as TypeScript data with conditions on surfaces, never mode names; the glossary generated from the metric catalog and worded per mode; search; the help store (`hcp:help`); the welcome line on each home; the Help sheet ("This page", Guided tours, the groups); the tour layer; Report a problem's summary; What's new with per-mode items (`releaseNotesIn`); "About this view" and "About this page" links; `about-server` ("Why there is no sign-in"), the one article exempt from the banned-words scan |
| `src/lib/export`, `src/charts`, `src/components` | The header on every output (`headerLines`: version and lock, comparison, as-of, proration, rates, cost definition, mode line, filters, rounding), HR admin's mode line, Manager's amount-free facts, the Suppressed flag and Why columns, free text through the mode, the long CSV writer and control totals (with the component split lines and whole-cent rounding, `centsAddingTo`), the 16:9 deck with "About these numbers", "Contains individual pay" first on every output made with the switch on (keyed on the switch, image footers included), "Learn more" only where the mode shows the article, `data-tour` props on `Section` and `Field` |
| `src/views/finance` | Finance > Export (long CSV and load file previews, the FP&A load file, "Control totals by component"), the long CSV and load file models with GL accounts read by org, Forecast accuracy (cost) on Finance > Versions (`forecastAccuracyOf`), the closes subtitle |
| `src/views/forecast`, `src/views/plan`, `src/views/targets`, `src/views/team`, `src/views/requests`, `src/views/whatif`, `src/views/actions` | Both forecast accuracy tiles on Forecast > Variance; the bridge's mix step for level, location, FTE and currency changes; nothing folding with the switch on; back-dated adjustments in the timing step; daily average FTE; Plan > Overview's "Not in plan" row; plain counts; limited request rows with their Why; Tree × cost center's Costed people; What if's "Trade note" column and the trade tour anchor; the Action center list's file name with its as-of date |
| `src/views/data` | Shareable files written from the switch-off context, the Manager line on every manager file, Open a shared file reading kept texts through the mode, "Changes on the earlier sample" (B9), the import preview after `cleanVersionIds` |
| `src/plan` | `WorkspaceFile.modeLine` (written, validated, refused when wrong), `versionIds.ts`, back-dated adjustments as lines (`adjustmentLines`), the bridge's `mixOf`, `PlanLine.activeDaily`, the accuracy arithmetic (`accuracyOf`), Replace and Merge refusing a Full file with no datasets made on an earlier sample |
| `src/app` | The Export menu's long CSV through the one writer, component lines on the workbook Summary and About slide, Manager's header facts, filter lines by scope label, the Help button and sheet wiring, the sample-changed notice and the kept copies of earlier samples (`planState.ts`) |
| `src/data`, `src/metrics`, `src/drill` | Titles, job families and recruiters through `managerText` in Manager mode at the context; the sample's baseline id over every dataset, the raw extracts' planted rows and the seeded plan; one per-mode wording table (`METRIC_WORDING`) read through `ctx.metrics`; `cost.guard.floorUsd` hidden in Manager mode; plain-count fixes in the drill panel |
| `src/access`, `src/cost`, `src/testkit` | `headers.slow.test.ts` (every output's first lines in every mode), the leak crawls over every written export, Manager free-text fixtures (titles, job families, recruiters), the component-total identity check in `costUnions.slow`, the crawl's export and help reads, `counts.ts` (the plain-count scan) |
| `src/ship`, `scripts` | `scripts/oneFile.mjs` and `check-single.mjs` (verify step 6; `copy-single.mjs` and `deploy-pages.mjs` refuse a page that fails), `oneFile.test.ts`, `docs.test.ts` (every README and ARCHITECTURE claim of the review pinned to the source), `deployPages.test.ts` |
| `README.md`, `ARCHITECTURE.md`, `docs/` | Both rewritten for M4 and the review; PLAN 15.1 R92 to R131; PLAN 3.3, 5.4, 5.5 and 13.5 brought in line; CONTRACTS-M3 8.4 corrected; M3 known gaps 5, 6, 9 and 10 closed; this report |

## Help

40 articles in six groups and 12 tours (76 steps in all), a glossary of 102 entries generated from
the metric catalog, and 4 release notes (25 items). What each mode reads, on the sample personas
(`articlesInMode`, `toursInMode`, `glossaryInMode`, `releaseNotesIn`; a tour's steps as that mode
reads them):

| Mode | Articles (Start here, Each view, Your data, Definitions, Privacy and trust, Help and support) | Tours (steps) | Glossary entries | Release note items |
|---|---|---|---|---|
| Manager | 24 (6, 4, 2, 3, 4, 5) | 5: `home-start` 6, `requests-start` 6, `view-team` 6, `view-plan` 5, `view-requests` 5 | 46 | 19 |
| HRBP | 32 (6, 9, 2, 4, 6, 5) | 9: `home-start` 6, `requests-start` 6, `view-home` 5, `view-plan` 5, `view-requests` 5, `view-forecast` 5, `view-targets` 5, `view-whatif` 6, `view-finance` 5 | 82 | 20 |
| Leader | 31 (6, 8, 2, 4, 6, 5) | 8: as HRBP, without `view-finance` | 79 | 20 |
| Finance | 31 (6, 9, 2, 4, 5, 5) | 8: `home-start` 6, `view-home` 5, `view-plan` 5, `view-requests` 5, `view-forecast` 5, `view-targets` 5, `view-whatif` 6, `view-finance` 5 | 85 | 20 |
| HR admin | 38 (6, 9, 8, 4, 6, 5) | 9: `getting-started` 15, `requests-start` 6, `own-data` 7, `view-plan` 5, `view-requests` 5, `view-forecast` 5, `view-targets` 5, `view-whatif` 6, `view-finance` 5 | 102 | 20 |

`about-server` shows in every mode. A mode never reads about a surface it hides: Manager reads no
article on Forecast, Targets, What if or Finance, and its glossary leaves out the cost guard's rules,
Asks above the cut line and the leave rule (R125).

Help is guarded the way figures are: `src/help/access.test.ts` (every mode reads no hidden name in
any article, tour, glossary entry or release note; Manager and Finance never read "leave", now with
the glossary too), `content.test.ts`, `views.test.ts` and `trust.test.ts` (each review fix pinned to
the code it describes), `plan.test.ts` (PLAN 14.2's ids, groups and modes), `tours.test.ts`,
`definitionsInMode.test.ts` (tile definitions and Settings > Formulas in each mode's words) and
`tourTargets.slow.test.ts` (every tour step's target is drawn on its page in every mode).

## Exports

Every output, the header it carries and the tests that guard it:

| Output | Where | Guard tests |
|---|---|---|
| Figure CSV | Every figure's menu | `lib/export/csv.test.ts`, `exportHeader.test.ts`, `suppressedFlag.test.ts`, `freeText.test.ts`; the leak crawls (`access/leaks.*.slow.test.ts`) write every figure's CSV in every mode; `access/headers.slow.test.ts` |
| Figure Excel | Every figure's menu | `lib/export/xlsx.test.ts`, `metrics/excel.test.ts`, `exportHeader.test.ts`, `headers.slow.test.ts` |
| Copy (TSV) | Every figure and the drill panel | `lib/export/money.test.ts` (the pay line, the mode), `exportHeader.test.ts`, the drill panel's clipboard through the mode (`freeText.test.ts`) |
| Image footer | Every chart | `exportHeader.test.ts` (`imageFooter`, the pay line with the switch on) |
| Whole-view workbook | The view header's Export menu | `lib/export/view.test.ts`, `money.test.ts` (Summary rows), `controlTotals.screens.test.ts`, `app/longExport.test.ts` (component lines), `headers.slow.test.ts` |
| 16:9 deck | The Export menu | `lib/export/deck.test.ts` (with `deck.testkit.ts`: the About slide, slide tables, control totals by component), `suppressedFlag.test.ts`, `headers.slow.test.ts` |
| Long CSV (every period) | The Export menu and Finance > Export | `lib/export/longCsv.test.ts`, `views/finance/engine/longCsv.test.ts`, `lib/export/controlTotals.test.ts`, `app/longExport.test.ts`, `cost/costUnions.slow.test.ts`, `cost/costDiff.slow.test.ts`, `access/leaks.rounded.slow.test.ts`, `leaks.small.slow.test.ts` |
| FP&A load file | Finance > Export (Finance; HR admin at Finance's rules or unsuppressed) | `views/finance/engine/loadFile.test.ts` (rows, the component totals adding up in cents, each file's own header, the switch-on lines on both files, no file under an org filter), `costUnions.slow.test.ts` (every component total is a split the guard showed), `headers.slow.test.ts` |
| Records CSV and TSV | Drill panels and position cards | `drill` tests, `access/leaks.manager.slow.test.ts` (the reqs records of a card) |
| Action center list | Action center > Export list | `views/actions/engine/exportList.test.ts` |
| Shareable, Requests, Export for a manager, Full (`.hcplan.json`) | Data room > Workspace, Requests | `views/data/engine/workspace.test.ts` (D-PAYFILES, D-MODELINE, B9 blocks), `plan/workspace/file.test.ts`, `validate.test.ts`, `views/data/engine/openShared.test.ts`, `openSharedText.test.ts`, `access/leaks.positions.slow.test.ts`, `leaks.manager.slow.test.ts`, `leaks.writes.slow.test.ts`, `headers.slow.test.ts` |

ExcelJS, SheetJS and pptxgenjs stay behind `import()` (`lib/export/lazy.test.ts`). With Show pay
amounts on, every one of these outputs starts with "Contains individual pay" and names HR admin's
mode with pay amounts shown; a Shareable file never does, because it is always written with the
switch off (R105).

## The one-file build

`npm run build:single`, run after verify on the same tree, wrote `dist-single/index.html` and copied
it to `headcount-planner.html` (byte-identical, git-ignored; `npm run deploy` publishes it):

| | |
|---|---|
| Size | 5,140,194 bytes (1,744.21 kB gzip as Vite reports it) |
| Budget | `ONE_FILE_BUDGET` = 6,000,000 bytes (scripts/oneFile.mjs): 85.7% used, 859,806 bytes left |
| Growth | M3 ended at 4,820,666 bytes and the M4 integration at 5,095,956; the review's fixes added 44,238 |
| The one-file check | `node scripts/check-single.mjs` on both files: "dist-single/index.html: 5,140,194 bytes of a 6,000,000 byte budget, 1 inline script and 1 inline style. It opens from file:// with no network request." |

The check reads the built page as the browser's HTML parser does (R102): the page's markup holds
only its own few tags, every script and style is inline, and nothing (a tag attribute, CSS `url()`
or `@import`, a dynamic `import()`, a worker or a fetch of a written URL) names a file or address to
load. Verify step 6 runs it, `copy-single.mjs` does not copy a page that fails it, and
`deploy-pages.mjs` refuses to publish one; `src/ship/oneFile.test.ts` checks the rule on made-up
pages, each failing case included.

## Review findings, with their fixes and tests

Severity is the verifier's. "Test" names the test that fails on the code before the fix; a finding
the lead settled as a reading has its PLAN 15.1 row instead.

### Copy lens

| ID | Sev | Finding | Fix | Test |
|---|---|---|---|---|
| CP-1 | medium | HR admin outputs carried no mode line | `modeMeta`: "Made in HR admin mode." and "Made in HR admin mode with pay amounts shown." (`hrAdminExportLine`) on the CSV preamble, sheet blocks, workbook Summary, deck and image footers; help and README quote it (D-MODELINE, R106) | `lib/export/exportHeader.test.ts` "every output names its mode, HR admin too", `money.test.ts` "stamps every mode", `help/articles/views.test.ts`, `ship/docs.test.ts` |
| CP-2 | medium | An Export for a manager file carried no Manager line | `WorkspaceFile.modeLine`, written first on a manager's own Shareable and Requests files and every Export for a manager, validated on read; a name the reader would refuse falls back to "Made in Manager mode." | `plan/workspace/file.test.ts` "writes a Manager-mode file its mode line first", `views/data/engine/workspace.test.ts` D-MODELINE (5 cases) |
| CP-3 | medium | Help told Finance its files held a component split they never held | D-SPEC: the component control totals exist (SB-1), and the help says where they show | `help/articles/views.test.ts`, `trust.test.ts` "puts Finance's component split…", `views/finance/engine/loadFile.test.ts` |
| CP-4 | medium | "Reading a number" defined Actual heads and Band estimate wrongly | Help text: active HRIS employees, the "Not in plan" row where Plan > Overview shows; band midpoint × FTE plus standard bonus, capped burden and benefits | `views.test.ts` "defines actual heads…", "gives the band estimate its loads…"; `trust.test.ts` faq |
| CP-5 | low | "get 1 seats" and other plural slips | `plural()` in What if's trade note and card, the drill panel, the hero's label, Plan's band card, the bridge, control totals ("1 head"), and five more slips found by a new scan | `drill/summary.test.ts`, `views/team/engine/figures.test.ts`, `views/forecast/engine/wording.test.ts`, `views/plan/engine/counts.test.ts`, `views/whatif/engine/whatif.test.ts`, `lib/export/controlTotals.test.ts`, `testkit/counts.test.ts` "finds none in src", `testkit/counts.slow.test.ts` |
| CP-6 | low | Developer text as the Trade rates hint | `data/schema.ts` note for the person setting the table | `data/schema.test.ts`, `views/finance/engine/writes.test.ts` (no doc path, PLAN reference or key in any hint) |
| CP-7 | low | Help said a trade gets seats "of equal weight" | "worth no more standard heads; what is left over stays as trade credit" | `views.test.ts`, `tours.test.ts` "never says … equal weight" |
| CP-9 | low | One metric with two names, a wrong date, HRIS actuals wording | What if's Heads change read at the scope's target date; "Gap (cost)" kept (PLAN 9.4); Finance > Versions closes subtitle | `views/whatif/engine/whatif.test.ts` "Heads change is read at the target date", `views/finance/engine/finance.test.ts` |
| CP-10 | low | Header polish | "Made in Leader mode for the whole company." for CEO, CFO and CHRO; the Summary row "Cost amounts"; the as-of date stated once; filters name a tree scope by its label | `exportHeader.test.ts` "names the whole company…", "states the as-of date once…", `app/exportMeta.test.ts`, `data/scope.test.ts` |
| CP-11 | low | "0 under", "7 head effect", "13 d" | "On target", "+ 7 heads from pending requests", "has waited 13 days" | `views/targets/engine/wording.test.ts` |

### Exports lens

| ID | Sev | Finding | Fix | Test |
|---|---|---|---|---|
| EX-2 | high | A Shareable saved with Show pay amounts on held every Filled seat's pay-based cost | D-PAYFILES: `shareableBaseOf` writes it from the same screen with the switch off, byte-equal to the switch-off file; the save says `SHAREABLE_PAY_OFF_TEXT`; a `pay` column is refused outside Full | `workspace.test.ts` D-PAYFILES, `file.test.ts` pay column, `headers.slow.test.ts` byte-equal check |
| EX-1 | medium | The Export menu's long CSV with the switch on wrote individual pay without the pay line | "Contains individual pay" keyed on the switch on every output; the menu writes through `longFileText` (`menuLongCsv`) | `exportHeader.test.ts` "Contains individual pay first on every output…" (4), `csv.test.ts`, `xlsx.test.ts`, `money.test.ts`, `app/longExport.test.ts`, `headers.slow.test.ts` |
| EX-3 | medium | Position titles reached Manager outputs without `managerText` | Titles and job families read through `managerText` where the context is built, title columns flagged free text | `data/managerTitles.test.ts`, `access/leaks.manager.slow.test.ts` (planted title and job family) |
| EX-4 | low | Slides printed "—" in Suppressed, Why and empty amount cells | `slideTable` writes those cells empty (R123) | `suppressedFlag.test.ts` (2), `deck.test.ts` |
| EX-5 | low | A reason on every unsuppressed Finance row, and a contract sentence the file did not match | Reading kept (R92: a loaded-only cell keeps its reason); the `LongRow` comment and help corrected; the contract sentence now holds with SB-1 | `loadFile.test.ts` component totals |
| EX-6 | low | Tree × cost center wrote Costed people 0 in rounded modes | `costed` null where not computed; the column left out where no row has a count (R129) | `views/targets/engine/wording.test.ts` |
| EX-7 | low | The Action center list's file name had no as-of date | `headcount-planner-action-center-<list>-<as-of>` | `views/actions/engine/exportList.test.ts` |
| EX-8 | low | HR admin outputs carried no mode line | As CP-1; the crawl then found the load file's memo kept another mode's header, fixed (the header is written per context) | `loadFile.test.ts` "each file's header is its own context's" |
| EX-9 | low | A limited request's hidden band estimate was written with no flag or Why | `WHY_KEY` = `LIMITED_WHY_TEXT` on every limited record (R128) | `views/requests/engine/limitedWhy.test.ts` |

### Help lens

| ID | Sev | Finding | Fix | Test |
|---|---|---|---|---|
| HL-1 | medium | view-requests gave the approval chain wrong | The chain as `CHAIN_RULES` builds it; the threshold "by default" only where amounts show | `views.test.ts` "gives the approval chain as CHAIN_RULES builds it" |
| HL-2 | medium | Actual heads defined as Filled seats | As CP-4; SA-6 makes the "Not in plan" row real | `views.test.ts`, `views/plan/engine/notInPlan.test.ts` |
| HL-3 | medium | A Leader acting as the CEO, CFO or CHRO was told Import requests merges only its org | `scoped: true` sentences, and a `scoped: false` one that says they merge every request | `views.test.ts`, `trust.test.ts` |
| HL-4 | medium | Severance in the month after the last day | "in the month of the day after an eliminated seat's last day"; the schema's Severance hint too (attack HL-4-a) | `trust.test.ts` "books severance where the engine does", `views/finance/engine/writes.test.ts` "the Severance hint books where the engine does" |
| HL-5 | medium | data-mapping said no sample dataset arrives as a file | Names the four generated datasets and the four raw extracts | `trust.test.ts` (reads `RAW_DATASETS` and `CONFIRMED`) |
| HL-6 | low | Report a problem promised row counts in every mode | Row counts only under HR admin | `trust.test.ts`, `help/access.test.ts` (against `diagnosticText`) |
| HL-8 | medium | Manager's glossary named band estimates, What if, the bridge, FX and the forecast | Per-mode wording (`METRIC_WORDING`), rule entries with their articles, entries naming a hidden thing left out; the attack's HL-8-a carried it to tile definitions and Settings > Formulas (R125) | `help/access.test.ts` "the glossary in each mode" (3), `help/definitionsInMode.test.ts` (4) |
| HL-9 | medium | No What if tour step on the trade lever | A "Trade seats" step; `LeverForm` draws `data-tour="whatif-trade"` whatever the lever kind | `tours.test.ts`, `views/whatif/ui/leverForm.test.ts`, `tourTargets.slow.test.ts` |
| HL-10 | low | What's new told Manager about What if and Finance about raising requests | Items carry conditions (`only`), read through `releaseNotesIn` (R126) | `trust.test.ts` "keeps release notes to what each mode shows" |
| HL-11 | low | Manager's long CSV described with amount columns | Its own column list under `NO_AMOUNTS` | `views.test.ts` "lists only the long CSV columns Manager mode writes" |
| HL-12 | low | Finance and Manager help said "leave" | Reworded, the trade credit definition included ("Standard heads left over from a trade"); this step extended the scan to the glossary | `help/access.test.ts` "Manager and Finance never read the word "leave"" (fails on the old credit definition) |
| HL-13 | low | Only Open seats start in the forecast, said help | Planned seats start too | `views.test.ts` "starts Planned seats in the forecast too…" |

### Spec lens (spec-a)

| ID | Sev | Finding | Fix | Test |
|---|---|---|---|---|
| SA-1 | high | Forecast accuracy defined but never computed or shown | D-SPEC: `forecastAccuracyOf` over `accuracyOf`; heads on Forecast > Variance, cost there and on Finance > Versions, whole company only (R107) | `views/finance/engine/accuracy.test.ts`, `views/forecast/engine/accuracy.test.ts`, `plan/engine/accuracy.test.ts` |
| SA-2 | high | Back-dated adjustments never posted | D-SPEC: each a line in its posted month, read by Plan, Targets, the forecast and the timing step (R108) | `views/forecast/engine/adjustments.test.ts`, `views/plan/engine/lineSource.test.ts` |
| SA-3 | medium | Mix never moved for a level or location change | D-SPEC: `mixOf` re-keys the comparison's rates; the attack's SA-3-a added currency moves as one seat (R109) | `views/forecast/engine/bridgeMix.test.ts` (with the 4 currency cases) |
| SA-4 | medium | HR admin with the switch on still folded bridge steps | D-SPEC: nothing folds; the attack's SA-4-a added the step card note and blank counts for band-only steps (R110) | `views/forecast/engine/bridgeOpen.test.ts`, `bridgeShape.test.ts` |
| SA-5 | medium | Forecast average FTE followed the proration | D-SPEC: `PlanLine.activeDaily` (R111) | `views/forecast/engine/dailyFte.test.ts` |
| SA-6 | medium | No "Not in plan" row | D-SPEC: the last row of Heads by unit, with its bar note (R112) | `views/plan/engine/notInPlan.test.ts`, `data/sample/sample.test.ts` story 7 |
| SA-7 | medium | GL accounts ignored org and unit overrides | D-SPEC: `accountsOf` reads department, unit, company (R113) | `views/finance/engine/longCsv.test.ts` "GL accounts fall back from the department to the unit to the company" |
| SA-8 | low | No Rounding bar on rounded waterfalls | Reading R115 | none (a reading) |
| SA-9 | low | Bands keyed by location, not zone | Reading R116 | none (a reading) |
| SA-10 | low | HRBP cost under a department filter | Reading R117 (the verifier found no leak) | none (a reading) |
| SA-11 | low | Year-end heads forecast ignores the picker | Reading R118 | none (a reading) |
| SA-12 | low | Tree × cost center's fold clause with the switch on | `costCenterSubtitle` drops it in open mode | `views/targets/engine/wording.test.ts` |

### Spec lens (spec-b)

| ID | Sev | Finding | Fix | Test |
|---|---|---|---|---|
| SB-1 | medium | Finance control totals had no per-component USD | D-SPEC: component control totals for each whole unit and the company where C33 (b) passes, in whole cents (attack SB-1-a) (R114) | `views/finance/engine/loadFile.test.ts` "control totals by component…" and "each component control total adds up as written", `lib/export/controlTotals.test.ts` (4 + "a split line adds up as written"), `cost/costUnions.slow.test.ts` |
| SB-4 | low | Manager headers left rates, cost and rounding out | `MANAGER_FACTS`, all nine facts in amount-free words (R124) | `exportHeader.test.ts` "states the plan facts each mode may read", "holds no rate, currency code or rounding amount…", `app/exportMeta.test.ts` |
| SB-5 | medium | M4's browser check not run | Reading R120: the lead's pass of 24 Oct is M4's browser check; what it did not walk is a known gap below | none (a reading) |
| SB-6 | low | README gives the live link before the deploy | Reading R119; the link goes live at ship | none (a reading) |
| SB-8 | low | The tracker's Interviewing stage has no date | Reading R121 (the ATS gives none) | none (a reading) |
| SB-9 | low | My team does not use HomeTop | Reading R122 | none (a reading) |

### Judged not real

CP-8 (no rule asks for `NOT_SECURITY_SHORT` word for word everywhere), HL-7 (PLAN 2 and 14.2 generate
the glossary from the catalog by design), SB-2 (C15 and C33 (b) allow Finance's loaded-only rows;
R92 now records it), SB-3 (PLAN 9.3 and 9.4 map "approvals waiting" to the 5-day queue), SB-7 (the
spec's own glossary sets the plan of record as the default comparison outside Finance).

### Browser finding (lead's pass, 24 Oct)

| ID | Sev | Finding | Fix | Test |
|---|---|---|---|---|
| B9 | medium | Plan state stored against an earlier build of the sample kept a merge base from it (R-1007 listed as a conflict) | `sampleBaselineId` over every dataset and the seeded plan; a differing stored state is set aside with `SAMPLE_CHANGED_NOTICE`, kept per earlier sample at `hcp:plan-aside:<baseline id>`, offered on Data room > Workspace as "Changes on the earlier sample" (R127) | `app/sampleBaseline.test.ts` (two and three generator versions), `workspace.test.ts` B9, `sample.test.ts` baseline id |

The lead's pass also rechecked B6, B7 and B8 from M3, the Help sheet, the My team tour, Data room >
Workspace and the Import requests dialog, and 375 px dark on the Data room, Workspace, Requests
Cycle, Finance Export, Audit, Action center and Help sheet; all held.

## Lead decisions, and why

- **D-PAYFILES** (EX-1, EX-2): a Shareable file is always written as HR admin sees it with Show pay
  amounts off, and the save says so; individual pay leaves the app only in a Full file or an output
  made with the switch on, and each such output starts with "Contains individual pay". A Shareable
  is the file people send on; a switch that silently changed what it holds was the high finding.
- **D-MODELINE** (CP-1, EX-8, CP-2): every output names its mode, HR admin's too, and every manager
  file carries the Manager line for the acting manager, validated on import, so a reader always knows
  which rules made a file.
- **D-SPEC** (SA-1 to SA-7, SB-1, CP-3): implement what the spec says rather than re-word the help
  away from it; story numbers re-derived (none moved: every sample version is daily, the sample
  plants no adjustment, and the people not in the plan sit outside the story units).
- **Readings, not code**: SA-8, SA-9, SA-10, SA-11, SB-5, SB-6, SB-8 and SB-9, recorded as R115 to
  R122.

## Attack results (the recheck)

The recheck attacked the fixed tree with 21 probes (forecast accuracy, back-dated adjustment
variants, mix variants, daily FTE variants, the Not in plan row, the mode line and its validation,
pay in files, the component totals, open-mode folds, Manager free text in reqs and titles, help text
and formulas per mode, severance, the trade quote, the B9 file and planted rows, and a rescan of 220
long CSVs). It found 10 defects; each was fixed in the model or the guard, with a test seen failing
first (the attack fixer's notes):

| Finding | Sev | Fix | Test |
|---|---|---|---|
| B9-a | medium | Replace and Merge take a Full file with no datasets only on the baseline it was made on (`fileBaselineRefusal`, `EARLIER_SAMPLE_FILE_TEXT`), and the preview says so first | `app/sampleBaseline.test.ts` (refusal and its control) |
| B9-b | medium | The baseline id also hashes the raw extracts' planted rows (`PLANTED` in `src/data/sample/raw/planted.ts`); the id changes once with this build | `sampleBaseline.test.ts` "reads the raw extracts' planted rows…" |
| SA-3-a | medium | A band seat moved across currencies is one bridge seat, priced at each side's rates; its move is Mix, its rate swap FX | `bridgeMix.test.ts` (4 new cases) |
| HL-8-a | medium | One per-mode wording source for tiles, cards, the glossary and Settings > Formulas (`src/metrics/modeWording.ts`) | `help/definitionsInMode.test.ts` (4) |
| HL-4-a | medium | The Severance hint books where the engine does | `views/finance/engine/writes.test.ts` |
| EX-3-a | medium | Req recruiters read through `managerText` in Manager mode; the Recruiter column is free text | `access/leaks.manager.slow.test.ts` (planted recruiter, records CSV and TSV) |
| EX-3-b | low | Open a shared file reads a kept figure's texts through `managerText` | `views/data/engine/openSharedText.test.ts` |
| SA-4-a | low | The open-mode step card says nothing folds; band-only steps show a blank count | `bridgeOpen.test.ts` (2) |
| SB-1-a | low | Component totals in whole cents adding to the loaded total (`centsAddingTo`), in Finance's lines and HR admin's split | `loadFile.test.ts`, `controlTotals.test.ts` |
| D-PAYFILES-a | low | The load file at Finance's rules made with the switch on starts with the pay line and HR admin's switch-on mode line, its content unchanged | `loadFile.test.ts`, `help/articles/trust.test.ts`, `headers.slow.test.ts` (now stricter) |

Every other probe held: accuracy's card ends on its value, adjustments move the long CSV, forecast
and load file by exactly their posted sum, FTE changes under a non-daily proration move only FTE,
the Not in plan row adds up in every scope, a mode line with an amount or a currency sign is refused
on read and on open, Manager headers hold no amount, and none of the 220 long CSVs broke a rule.

## Spec coverage

The two spec lenses read the original spec (the owner's 196-line brief that docs/PLAN.md answers,
kept outside the repository) sentence by sentence against the code, with probes. spec-a confirmed 16 areas as met (packages, Vite and ports, storage names, copy,
comparison defaults, the policy grid, Leader scopes, Finance filters, the eight datasets, the metric
catalog, variance, proration, the grid, the worked examples, Manager status reasons, exit run rate,
freeze savings and trades) and raised SA-1 to SA-12; spec-b confirmed the request, cycle, freeze,
transfer, What if, audit, workspace, export header, sample and ship sentences and raised SB-1 to
SB-9. After the fixes every spec sentence the lenses read is either implemented or mapped to a PLAN
15 entry:

- Implemented under D-SPEC: forecast accuracy (SA-1), back-dated adjustments (SA-2), the bridge's mix
  (SA-3), no folds with the switch on (SA-4, SA-12), daily average FTE (SA-5), the "Not in plan" row
  (SA-6), GL accounts by org (SA-7), Finance's component control totals (SB-1, CP-3), Manager's header
  facts (SB-4).
- Mapped to a reading: SA-8 (R115), SA-9 (R116), SA-10 (R117), SA-11 (R118), SB-5 (R120), SB-6
  (R119), SB-8 (R121), SB-9 (R122).
- Already settled by PLAN text (judged not real): SB-2 (C15, C33 (b), now R92), SB-3 (9.3, 9.4), SB-7
  (the spec's glossary default, R25).

## This verify step

Every fixer, the loose-ends fixer and the attack fixer left nothing failing. The open
`needsElsewhere` items were closed as follows:

| Item | Resolution |
|---|---|
| Verify's first run: `lineage.slow.test.ts` listed `year-end-heads: reqs.reqId` (a real failure, already in app-data-plan's run 3 slow log) | The lineage note `OFFER_IDS` (see Verify output); the test fails without it |
| help: the leave scan should read the glossary too (HL-12) | `src/help/access.test.ts` now scans `glossaryInMode` with the articles, tours and release notes; with the old trade credit definition put back it fails on four Manager and Finance contexts |
| help: the crawl should read release notes per mode (HL-10) | Already done (`src/testkit/crawl.ts` reads `releaseNotesIn`) |
| help: the LeverForm anchor (HL-9), the trade credit definition (HL-12) | Already done by app-data-plan |
| help: CONTRACTS-M4 1.3's new help exports | Listed below under "Contract additions in the review" |
| exports: EX-9, CP-10, SB-1 wiring parts 1 and 2 | Already done by app-data-plan (`limitedWhy`, `filtersText`, `controlTotals({ scopeLabel })`, `menuControlTotals`) |
| exports: SB-1 part 3 (Finance > Export's totals table could show the open file's split) | Left: optional; the switch-on file carries the split in its preamble, and Finance > Export's "Control totals by component" shows Finance's own |
| guard-crawl: Export menu long CSV, heads accuracy, help copy, workbook component lines | Already done (app-data-plan run 3, loose-ends) |
| app-data-plan: Manager fixtures for titles and job families, the count scan | Already done (loose-ends items 4 and 5) |
| loose-ends and docs-ship: ARCHITECTURE's accuracy bullet, the test kit's `counts.ts`, the Census path | The accuracy paragraph already names `accuracyOf`; the folder map now names `counts.ts`; the Census folder is described, not given as a path |
| every fixer: PLAN 5.4 (`hcp:plan-aside:`, the baseline id), 5.5 (`notice`, `modeLine`, `scopeKey`), 15.1 readings | Done: 5.4, 5.5 and 13.5 edited; R92 to R131 appended |
| CONTRACTS-M4 8.6 items 1 to 4 | PLAN 3.3's scripts table (oneFile.mjs, check-single.mjs, the refusals); PLAN 5.5 and 13.5 read C35's limits and R77's order; R92 to R104 hold 8.3's readings and 8.4's two policy changes; CONTRACTS-M3 8.4 corrected; M3 known gaps 5, 6, 9 and 10 marked closed |
| The public repository | Every local machine path removed from docs/, README.md and ARCHITECTURE.md (the Census and project folders described in words, the M3 log as "the review's scratch folder"); a grep of the whole project outside node_modules, the build output included, finds none |

Docs updated: docs/PLAN.md (3.3, 5.4, 5.5, 13.5, 15.1 R92 to R131, 1.1's and 3.1's folder cells),
docs/CONTRACTS-M3.md (8.4), docs/M3-REPORT.md (known gaps, the log path), docs/notes/census/*.md (the
folder paths), ARCHITECTURE.md (the Census folder, the test kit), and this report.

### Contract additions in the review

The review fixes added exports to the M4 contracts, none renamed or retyped:

- **Help**: `glossaryEntryInMode`, `GLOSSARY_WORDING` (now a re-export of `METRIC_WORDING`),
  `isCostRule`, `GlossaryEntry.views` and `.edited`, `releaseNotesIn`, `releaseItemShown`,
  `releaseItemWhen`, `ruleEntryShown`, `formulaRowShown`.
- **Metrics**: `src/metrics/modeWording.ts` (`METRIC_WORDING`, `defInMode`, `metricsInMode`).
- **Exports**: `hrAdminExportLine`, `WHOLE_COMPANY_SCOPE`, `MANAGER_FACTS`, `madeWithPay`,
  `imageFooter`'s `individualPay`, `TsvOptions.individualPay`, `ControlTotal.components`
  (`ComponentSplit`), `componentSplitLine`, `SPLIT_WORDS`, `centsAddingTo`,
  `ViewControlTotals.componentLines`.
- **Finance**: `ComponentTotal`, `componentTotalLines`, `componentCents`, `longFileText`,
  `LongCsvModel.componentTotals`, `LoadFile.componentTotals`, `forecastAccuracyOf`,
  `ACCURACY_COMPANY_NOTE`, `CLOSES_SUBTITLE`.
- **Plan and workspace**: `WorkspaceFile.modeLine`, `managerModeLine`, `PlanLine.activeDaily`,
  `adjustmentLines`, `accuracyOf`, `accuracyRatio`, `fileBaselineRefusal`, `EARLIER_SAMPLE_FILE_TEXT`,
  `OTHER_DATA_FILE_TEXT`.
- **App, data and views**: `sampleBaselineId`, `setAsideOf`, `earlierSampleOf`, `keepAside`,
  `readAside`, `readAsides`, `clearAside`, `SAMPLE_CHANGED_NOTICE`, `menuLongCsv`,
  `menuControlTotals`, `shareableBaseOf`, `SHAREABLE_PAY_OFF_TEXT`, `SHAREABLE_PAY_OFF_HINT`,
  `fileModeLine`, `earlierSampleFile`, `EARLIER_SAMPLE_LABEL`, `NOT_IN_PLAN`,
  `NOT_IN_PLAN_BAR_NOTE`, `OPEN_STEP_CARD_NOTE`, `LIMITED_WHY_TEXT`.
- **Test kit**: `src/testkit/counts.ts` (`pluralSlips`, `countHits`, `singularCounts`,
  `countTemplates`), `MANAGER_TEXTS` (position title, job family, recruiter),
  `MANAGER_POSITION_TEXTS`, `MANAGER_REQ_TEXTS`, `ManagerTextFixture.titled` and `.recruited`.

## Known gaps

1. **Not deployed.** No commit, no remote, no Pages site yet; the README's live link goes live at
   ship (R119). The ship checklist below waits for the owner's go.
2. **Browser pass after the fixes.** The rules of these steps forbid a dev server, so the review
   fixes, the attack fixes and this step's were checked through render and model tests,
   `routes.slow` (every route in all five modes), `tourTargets.slow` and the crawls. Not walked in a
   browser since the lead's pass of 24 Oct: the sample-changed notice and "Changes on the earlier
   sample", the accuracy tiles, the "Not in plan" row, "Control totals by component", and the homes
   (Unit plan, Rollup vs target, Plan vs actual, My team) at 375 px in light and dark. The live check
   after deploy should walk them.
3. **The baseline id changes once with this build** (B9-b): a browser holding plan state made on the
   sample under an earlier build sees the sample-changed notice once and keeps that state as a copy.
4. **Version IDs stored before M3 gap 5's fix** keep their ID: there is no load-time migration
   (CONTRACTS-M4 8.6 item 5; nothing has been deployed, so no such workspace exists outside a
   developer's browser).
5. **Interviewing dates** stay blank (R121): the ATS export gives none.
6. **The open file's component split** is in the switch-on file and its preamble, not on Finance >
   Export's preview (an optional wiring the exports fixer offered).
7. **The crawl's glossary loop** still lists the rule entries and Asks above the cut line for Manager
   mode; no Manager surface draws them, so they are not a surface (attack fixer's note).
8. **Node 24 worker crashes** under heavy load on this computer (fork workers exiting with
   0xC0000005 or 0xC000001D, M2 known gap 9). `HCP_TEST_WORKERS` caps Vitest's workers
   (vite.config.ts); a file lost to a crash passes alone. A crash is never an assertion failure.
9. Carried from M3: step order across wall-clock days (R87), over-redaction of plain ranges (R81),
   the lock hash's coverage (M3 gap 4), new seats at a site with no department cost center (R85).

For the README: items 1 and 3 concern users, and the README already covers both (the live link,
and the earlier-sample paragraph under "The sample company"); item 5 shows only as an empty
Interviewing date in My team's tracker; the rest are internal or for developers, so the README is
unchanged in this step.

## Accepted risks (for the README)

PLAN 15.3's nine items stand; the README repeats the eight that concern users, by title, and
`src/ship/docs.test.ts` checks it: Finance exact series, rounded modes, standard heads, band
estimates, modes are not security (with the shared origin and checksums), approved changes to a
Filled seat, routing in Manager mode, small currency groups. The ninth, request number clashes, is
internal and shows nothing. M4 adds no new risk: individual pay leaves the app only in a Full file
or an output made with Show pay amounts on, each of which says so on its first line, and what a
person does with such a file once saved is outside the app, like any download.

## Ship checklist (each outward step waits for the owner's go)

1. **Commit, staged by path** (never `git add -A` or `git add .`): `git add .gitattributes .gitignore
   biome.json index.html package.json package-lock.json tsconfig.json vite.config.ts "Launch
   Headcount Planner.bat" README.md ARCHITECTURE.md docs scripts src`, check `git status` (no
   workbook, CSV, `.hcplan.json` or `headcount-planner.html` staged; `npm run verify` step 1 checks
   it), then `git commit` on `main`.
2. **Create the repository**: `gh repo create unique-name27/headcount-planner --public --source .
   --remote origin --push`.
3. **Deploy**: `npm run deploy` (the one-file build, its check, then `scripts/deploy-pages.mjs`
   force-pushes `gh-pages` with `index.html`, `headcount-planner.html` and `.nojekyll`, staged by
   name, message "Publish Headcount Planner (one-file build of main@<sha>)"; it refuses with no
   commit, no `origin` or a page that fails the one-file check).
4. **Pages**: `gh api -X POST repos/unique-name27/headcount-planner/pages -f "source[branch]=gh-pages"
   -f "source[path]=/"` (`-X PUT` if Pages already exists).
5. **Live check**: https://unique-name27.github.io/headcount-planner/ loads the sample in every mode,
   Help and the tours open, the download link serves `headcount-planner.html`, and the downloaded
   file opens from `file://` with no network request; walk known gap 2 there, then give the owner the
   URL and add it to this report.

**Shipped 25 Oct 2026.** First commit `b693435` on `main` (1,192 files staged by path from a reviewed
list; the editor's `.claude/` folder left out), `gh repo create unique-name27/headcount-planner
--public --source . --remote origin --push`, `npm run deploy` (gh-pages), Pages serving `gh-pages /`
(already enabled by the push, so the POST answered 409). Live: https://unique-name27.github.io/headcount-planner/.
The live page is byte-identical to the verified `headcount-planner.html` (5,219,848 bytes); it loads the
sample in all five modes with no error and no "No data" tile, and Plan > Hiring reads 39 open to hire
for Silicon Engineering in HRBP mode, as on the local build.

## Hiring progress

Added after M4 at the owner's request of 24 Oct 2026: "a module that tracks headcount progress via
hiring, ie, current approved headcount - current headcount - future starts that already accepted =
what they can hire for total, by quarter. then also show hiring velocity based on the number of
hires as well as attrition." Its design is PLAN 9.7 and change C36. It was frozen as contracts on
25 Oct (docs/CONTRACTS-HIRING.md), built by four builders (engine, tab, homes-help, checks),
integrated, reviewed by three lenses (numbers, privacy, UI) whose 30 findings were verified, and
fixed in one step, whose readings are CONTRACTS-HIRING 5.2 (V1 to V19).

### What was built

- **Plan > Hiring** (`plan.hiring`, after Openings), shown in every mode over the mode's own scope
  (Manager: the tree strictly below the seat; HRBP: the unit; Leader: the org; Finance and HR admin:
  the company under the filters). Heads only in every mode, HR admin with "Show pay amounts" on
  included: no amount, band estimate, offer amount or leave fact reaches the engine's input, a tile,
  a figure, a card, a records list, a finding, an export or a help sentence.
- **Six tiles** (`HIRING_KPIS`): Open to hire this fiscal year (the headline, O(FY end)), Accepted
  starts to come, Hires per month and Exits per month (3-month paces), Net hiring pace, and Months to
  close at this pace. Each opens its calculation card, a tile with no value included.
- **Open to hire by quarter** (`plan-hiring-quarters`): one column per quarter of the fiscal year
  shown. Closed (or ended) quarters show actual heads at the quarter end and the quarter's hires and
  exits; quarters ahead show approved heads by the quarter end A(q), current heads H, accepted starts
  by the quarter end S(q), open to hire O(q) = A(q) − H − S(q), new to hire in the quarter, expected
  exits by the quarter end E(q), to hire to reach plan O(q) + E(q) and hires needed per month. Each
  count opens its records (seats, people where the mode lists them, accepted offers with IDs, stage
  and dates only) and each formula its card. Below 0 a target reads "Over by", never as a target.
  A small bar chart shows open to hire at each quarter end (`plan-hiring-open`).
- **Hiring velocity** (`plan-hiring-velocity`): hires up and exits down for the trailing 12 closed
  months with the net line, then the forecast's months to the year end in a lighter style; the pace
  note gives the 3- and 6-month paces and attrition in heads.
- **Readout**: 0 to 3 findings (exits outpacing hires, open to hire not closing or closing after the
  year end, the first quarter ahead behind its needed pace, openings past their target start, over
  plan at the year end).
- **Homes**: the Open to hire tile on the HRBP Unit plan and the Leader Rollup vs target (6 tiles
  each), and under Left to fill on My team (Manager keeps its 7 key figures); Finance's home is
  unchanged.
- **Engine and model**: `src/plan/engine/hiring.ts` is pure and reads dates, IDs and head counts
  only (`HIRING_INPUT_KEYS`); the tab's model is its own (`planHiringModel`, cached per context),
  read by the crawl and the Shareable file through `src/views/tabModels.ts`. 16 metrics
  (`plan.hiring.*`), a Hiring section in the view-plan article, five glossary terms, a tour step on
  the quarter table and a What's new note.

### Tests

- `src/plan/engine/hiring.test.ts` on `hiring.fixtures.ts`: the plan's hand-computed fixture HG1
  exactly, HG2 to HG7, one case per function with a negative control, and the seat view identity
  over generated seats. `src/plan/engine/forecast.test.ts` gained the own cohort fixture (HP-1).
- `src/views/plan/engine/hiringTab.test.ts`: every mode on the sample (the tiles, records holding
  their numbers and no hidden key in any row, cards ending at their values, heads only, Managers A, B
  and C, rule 3, agreement with Plan > Overview, Plan > Openings and the forecast, exports).
  `hiringReview.test.ts` (new, 29 cases): the review's findings, each on the state it named, and
  data with every req ID blank. `src/views/forecast/engine/run.test.ts`: the own-cohort runs.
  `hiring.perf.test.ts`: a fresh context under 300 ms in Finance, HRBP, Manager and HR admin mode.
- `src/views/plan/ui/render.test.ts` and `hiringUi.test.ts`: the tab in every mode, the velocity
  chart's keyboard stops and the quarter grid's button names; `src/views/team/ui/TeamPage.test.ts`:
  each tour target once in both layouts; `src/help/hiring.test.ts`; `src/views/hiring.contracts.test.ts`.
- `src/data/sample/sample.test.ts`: the four scopes below, every row recomputed from the raw rows by
  code of its own (the modeled exits are the forecast's, Manager mode's from the tree's own cohort).
- `src/access/leaks.hiring.slow.test.ts`: the tab read in full in every mode with its cards,
  records and exports; heads only across every amount and leave perturbation; nothing of a
  Manager's own seat or above; rule 3; the recruiter note, the hiring manager above Manager B, and a
  last day at or above each Manager or of a peer outside the tree (HP-1, HP-2, HP-5).

### Review findings, with their fixes and tests

Each fix has a test that fails on the code before it. The verifiers' probes recorded the old
readings quoted here (HR admin 131 with a note working out to 132, SE 38, GTM 30, FY28 Q1 113 and
so on), which the new tests contradict.

| Finding | Fix | Test |
|---|---|---|
| HN-1 (low) Open to hire's note ignored the seat view's other terms | The tile, the O(q) card and My team build their note from the terms that are not 0, each in its words (V1) | hiringReview "names each extra term": the Elimination, a held move (HR admin, SE, GTM) and a backfill offer on a Filled seat; each note works out to its value |
| HN-2 (medium) An approved Elimination of a Filled seat read to reach plan 1 head low | The holder is a known exit on the seat's last day, read from assignments clipped at it, in the tab and in the forecast's flows (`exitDaysOf`, V2) | hiringReview: Q4 to reach plan 211.54, moving by the modeled exits alone; the same E(q) as the HRIS recording the last day; the forecast's known exits agree |
| HN-3 (medium) A rehire's second hire and last day were dropped | Hires and exits keyed by person and day; drills read rows by event (V3) | hiringReview: Q1 + Q2 hires = Hires YTD (28), August = the forecast's starts; E(q) = forecast known + modeled with a 15 Dec last day |
| HN-4 (medium), HU-9 (medium) FY28 Q1's new to hire held FY27's second half | The first quarter ahead counts against O on the day before it starts (`HiringTable.openBefore`, V4); findings name the year | hiring.test HG7 and HG3; hiringReview: FY28 0, 0, 0, 0 for HR admin, SE and Manager A, and FY27 + FY28 = O(FY28 end) − open now; "Q1 FY28 end" |
| HN-5 (medium) A move across scopes was off by one on each side until the HRIS recorded it | An unrecorded approved move puts the mover on the receiving seat from its date; a move out ahead is a known exit, a move in a start in S(q) that is not an offer (V5) | hiringReview: held move SE 39, GTM 29, company 131, equal to the HRIS-recorded state; HRIS move ahead SE E(q) = forecast's, GTM 29; plan-only move ahead equal to the recorded one |
| HN-6 (low) A(Q4) no longer R1's approved heads after an approved Elimination | Docs and the hiring.ts header say so; the O(q) card names the seats an approved change ends (V6) | hiringReview: Overview 1,610, A(Q4) 1,609, card line "Seats an approved change ends by 31 Mar 2027 (not counted)" = 1 |
| HN-7 (low) Negative targets showed as plain numbers | To reach plan below 0 reads "Over by 0.8"; hires needed shows 0 with "Nothing to hire" (V7) | hiringReview: Manager C over plan, and no negative target cell without its note in five contexts |
| HN-8 (low), HU-3 (low) A past year's tile arithmetic and "(closed)" on quarters with no close | "FY27 is over" tiles with cards ending at 0; `closed` frames, "(ended)" labels, HRIS heads at an ended quarter's end (V8) | hiring.test closed flag; hiringReview at 15 Apr 2027, 15 Jan 2027 and with no close |
| HN-9 (low), HU-1 (medium), HU-2 (low) No pace yet read as exits outrunning hires, and "0 ÷ 3" | "The pace needs 3 closed months" on the tile, card step and note; pace tiles' formula and note (V9) | hiringReview "never claims exits outrun hires" with no close, control Manager A; pace tiles and net card inputs |
| HN-10 (low) An as-of date before the last close counted September twice | The module's last close is the last close on or before the as-of date; a later close's months read ahead with their flows (V10) | hiringReview at 31 Aug 2026: last close August, Q2 ahead, no event in history and ahead at once, paces June to August, H5 |
| HN-11 (low) A person not in plan's last day was in no E(q) | Their last day is a known exit with no modeled part (V11) | hiringReview: Operations, known + 1 and to reach plan + 1; the exits card names them |
| HP-1 (high) A last day at or above a Manager's seat, or of a peer, moved the Manager's tab | `ForecastInput.ownCohort`: Manager mode nets the tree's modeled exits over the tree alone, one run per seat set, the last 4 kept (V13) | forecast.test own cohort fixture; run.test (one run per set, the last 4 kept); hiringReview Manager A; leak case for Managers A, B, C and below C over own row, every holder above and a peer, HR admin moving |
| HP-2 (medium) A recruiter note with an amount showed in four modes | `HIRING_DRILL_HIDE.reqs` gains recruiter and hiringManager (V12) | hiringReview with the note on every accepted offer; leak case over every mode's records, CSV, clipboard and workbook, with HR admin's position card as the control |
| HP-4 (low) Hidden offer amounts stayed in display rows | The drill table drops a spec's hidden keys from its rows (src/drill/records.ts) | hiringTab "hide every amount" checks the rows in every case; hiringReview with a control |
| HP-5 (low) A hiring manager above Manager B could be named | Covered by HP-2's hide | leak case: each holder of a seat above B as the hiring manager, name scan empty |
| HU-4 (low) The chart's keyboard opened hires only | Two stops a month, hires then exits, each with its part and box (V14) | hiringUi: stops and Enter on exits opening the exits records or card |
| HU-5 (medium) Grid buttons hid their number and repeated names | "<measure>, <quarter>: <value>. Show the records" and "Heads at the quarter end, …" (V15) | hiringUi: every name holds its text and is unique (HRBP, Manager) |
| HU-6 (low) The bar chart read as "Chart." | `ariaLabel` "Open to hire at each quarter end" (no unit, so no "1 heads") | render.test: no "Chart." label in any mode |
| HU-7 (medium) The tours' Key figures step landed on Open to hire on a phone | `KpiStrip`'s `tour` prop; My team's strip names "team-open-to-hire" (V17) | TeamPage.test: one target each in both layouts |
| HU-8 (low) A "—" tile opened no card | `Kpi.calcWhenEmpty` on the paces and months to close (V16) | hiringReview every tile; render.test "show why there is no value" |
| HU-10 (low) "Behind by 0.1 a month" with nothing open | "Backfills only" under half a hire a month where nothing is open (V18) | hiringReview: Manager C, control SE |
| HU-11, HU-13 (low) Zero clauses and an undefined balancing term | Covered by HN-1's notes and steps (V1) | hiringReview: base notes ("39 open seats", "No open seat"), step "138 − 6", a second holder named |
| HU-12 (low) Current heads' split was not shown | The O(q) card's "People in approved seats" and the records' note (V18) | hiringReview: Finance 1,450 and the note |
| HU-14 (low) Help said "beside" and "under" | "under Left to fill" everywhere | help/hiring.test over every Manager text |

### The sample's numbers (30 Sep 2026, September closed, FY27 Working)

Pinned in sample.test.ts by independent code; Q1 and Q2 are closed, Q3 and Q4 ahead.

| Scope | Current heads | Q1 / Q2 heads, hires, exits | A(Q3), S(Q3), O(Q3), new | A(Q4), S(Q4), O(Q4), new | E(Q3), E(Q4) | To reach plan Q3, Q4 | Needed a month Q3, Q4 | Paces (hires, exits, net), attrition | Months to close |
|---|---|---|---|---|---|---|---|---|---|
| Silicon Engineering (HRBP) | 556 | 551, 14, 9 / 556, 13, 8 | 590, 9, 25, 15 | 604, 9, 39, 14 | 11.68, 23.75 | 36.68, 62.75 | 12.2, 10.5 | 4.3, 2.7, 1.7; 6.6% | 23.4 |
| Chun-Hsien Kuo's org (Leader) | 555 | 550, 14, 9 / 555, 13, 8 | 589, 9, 25, 15 | 603, 9, 39, 14 | 11.66, 23.71 | 36.66, 62.71 | 12.2, 10.5 | 4.3, 2.7, 1.7; 6.6% | 23.4 |
| Whole company (Finance) | 1,456 (1,450 in approved seats, 6 not in plan) | 1,443, 39, 35 / 1,456, 39, 31 | 1,567, 22, 89, 70 | 1,610, 22, 132, 43 | 40.62, 79.93 (8 known) | 129.62, 211.93 | 43.2, 35.3 | 13.0, 10.3, 2.7; 9.4% | 49.5 |
| Sebastian Wagner's team (Manager A) | 7 | 7, 0, 0 / 7, 0, 0 | 9, 0, 2, 1 | 9, 0, 2, 0 | 0.27, 0.59 | 2.27, 2.59 | 0.8, 0.4 | 0.0, 0.0, 0.0; 0.0% | Not closing at this pace |

The fixes leave every pinned number of the sample as it was: the sample has no approved Elimination
of a seat still held, no unrecorded or future-dated move, no rehire, no person not in plan with a
last day, and Manager A's department has no known exit in the months ahead, so the tree's own cohort
models the same exits as the pooled one.

### Verify output

Run from the project root with `npm run verify` (scripts/verify.mjs) after deleting
`node_modules/.vite`, on Node 24.14.1, with `HCP_TEST_WORKERS=4`, no dev server running and port
8822 free.

**First run** (20:47): five steps passed and the tests failed in two files, both from the fixes,
neither a flaky crash:
- `src/views/home/engine/lineage.slow.test.ts` "every note holds" read the year-end heads tile's
  `reqs.reqId` note as stale. The probe blanks each field in every row and rebuilds the homes; with
  every req ID blank, the new move-in check (`isMoveIn`) threw on a null ID, so the HRBP and Leader
  homes (which re-link the Open to hire tile) failed to build and every tile read as moved. Fixed:
  a blank req ID is a req (V19), with a unit case in hiringReview.test.ts; the test then passed alone.
- `src/access/leaks.manager.slow.test.ts` ran its worker out of memory (exit code 134, "JavaScript
  heap out of memory", also when run alone): every Manager scope on every copy of the sample kept a
  full own-cohort forecast run (about 50 MB each) for as long as the copy lived. Fixed: the
  own-cohort runs are a cache of the last 4 (`src/views/forecast/engine/run.ts`, tested in
  run.test.ts); the file then passed alone (20 tests, 255 s).

**Second run** (21:56), on the final source tree (only docs changed after it), exit code 0:

| Step | Result | Time | Notes |
|---|---|---|---|
| No data files in git | PASS | 0.1 s | "No data files outside src/data/sample/." |
| Type-check (`npx tsc --noEmit -p .`) | PASS | 2.1 s | No errors |
| Lint (`npx biome check src scripts`) | PASS | 1.4 s | 1,159 files, no fixes |
| Tests (unit, slow, perf) (`npx vitest run`) | PASS | 2,975.6 s | 400 files, 4,124 tests passed, 0 failed, no worker crash |
| App build | PASS | 14.0 s | `dist/`: main chunk 2,495.00 kB (804.66 kB gzip) |
| One-file build | PASS | 8.9 s | `dist-single/index.html` 5,219,848 bytes of a 6,000,000 byte budget, one inline script and one inline style, opens from `file://` with no network request |

```
Headcount Planner verification
  PASS  No data files in git (0.1s)
  PASS  Type-check (2.1s)
  PASS  Lint (1.4s)
  PASS  Tests (unit, slow, perf) (2975.6s)
  PASS  App build (14.0s)
  PASS  One-file build (8.9s)
```

`npm run build:single` then wrote `headcount-planner.html` again from the same tree.

## Recruiting summary, change C38 (27 Oct 2026)

Added after the hiring module at the owner's request of 26 Oct 2026: "one simple view i can show the
head of recruiting that shows current approved future starts projected starts projected attrition
and hiring velocity". Its design is PLAN 9.8 and change C38, its contracts CONTRACTS-HIRING section 6.
It was built on 27 Oct by four builders (model, UI, help, checks), integrated (`npm run verify` passed:
409 files, 4,585 tests), reviewed by four lenses (spec, UI, numbers, privacy) whose 35 findings were all
verified real (none refuted), and fixed in one step, whose readings are PLAN R133 to R148 and
CONTRACTS-HIRING 6.3 (RC1 to RC10). The PC crashed during that step's final verify, so a finish audit
(fixes, regressions, docs) read the fixed tree on 28 Oct; its 16 findings were verified real and fixed
here.

### What was built

- **Plan > Recruiting summary** (`plan.recruiting`, after Hiring), one screen with no sub-tabs, shown in
  every mode over the mode's own scope (Manager: the tree strictly below the seat; HRBP: the unit;
  Leader: the org; Finance and HR admin: the company under the filters). Policy `tab:plan.recruiting`
  is S in every mode, Manager's how "Your team, in heads."; every surface it adds (the tab, its four
  figures and seven tiles) has an explicit decision in every mode, and the access matrix gained 15 rows
  with no existing line changed. Heads only in every mode, HR admin with "Show pay amounts" on
  included: no amount, band estimate, offer amount or leave fact in a tile, card, records list, chart,
  table, export or help sentence; 8.4 holds (nothing about a Manager's own seat or above, and a request
  rule 3 hides moves no count where its rows sit outside the scope).
- **Seven numbers** (`RECRUITING_KPIS`), each opening its calculation card: Approved heads (Plan >
  Hiring's A at the fiscal year end), Current heads (H), Open to hire (O(FY end)), Future starts (signed
  offers, S), Projected starts (the Working forecast's starts on Open and Planned seats with no signed
  offer at their fill rate, plus modeled backfills, one decimal, labelled a model), Projected attrition
  (E: known and modeled exits, with Plan > Hiring's attrition note) and Hiring velocity (the 3-month
  hire pace, with the 6-month pace and the last 3 months' hires). Future starts and projected starts are
  always apart; a signed offer is never a projected start, and projected starts never count toward open
  to hire. A phone shows all seven tiles.
- **Heads and hiring by month** (`plan-recruiting-months`): the last 12 closed months and any month ended
  since the last close show hires up and exits down with heads as a line; each month ahead to the year
  end shows future starts, moves in (their own segment), the rare terms of projected heads when not 0,
  and projected starts in a light fill with a full-strength dashed outline, projected attrition down,
  and projected heads as a dashed line; approved heads by the year end are a dotted line, dated in the
  key. Both axes are titled, the month labels thin to fit, and every month ahead's bars net to the
  dashed line's step. Each bar opens its own records or card; the keyboard steps through the months,
  starts and exits alike.
- **By quarter ahead** (`plan-recruiting-quarters`): per quarter ahead, approved heads by its end, future
  starts, moves in when any, projected starts, projected attrition, projected heads at its end and the
  gap to approved heads ("Short by 12.0", "Over by 1.0", "On approved heads" at 0.0).
- **Where hiring happened** (`plan-recruiting-where`): the top 5 locations and top 5 departments by hires
  over the last 3 closed months, from Plan > Hiring's C37 table, with "and n more" naming a tie at the
  cut, and a link to Plan > Hiring.
- **One-slide deck**: the tab's deck is one "Recruiting summary" slide after "About these numbers" (the
  seven numbers as the strip shows them, under the data standard's gates, and the chart), standing in
  for the strip, the quarter table and where hiring happened; a whole-view deck gives the tab that one
  slide with no divider of the same title, and the toast counts slides. The workbook keeps every
  figure. The tab's own files, like Plan > Hiring's, carry no long CSV control totals (`HEADS_ONLY_TABS`).
- **Model**: `src/views/plan/engine/recruitingTab.ts` and `recruitingModel.ts`, its own model cached per
  context (`planRecruitingModel`), reading Plan > Hiring's engine (`hiringBuiltOf`; `hiringData.ts`
  `projectedStartsOf` and `HiringPrep.preHires`). Projected heads = current heads − last days on the
  as-of date + future starts + signed offers past their start date + pre-hires + moves in + projected
  starts − projected attrition, the three rare terms only when not 0 (R134). Three metrics,
  `plan.recruiting.projectedStarts`, `plan.recruiting.projectedHeads` and `plan.recruiting.gapToApproved`
  (num1), after `plan.hiring.recentHires`: 112 data metrics.
- **Help**: a Recruiting summary section in the view-plan article between Hiring and Transfers, three
  glossary terms (Projected starts, Projected heads, Gap to approved heads), "projected attrition"
  finding Expected exits by quarter end, Plan > Recruiting summary in the names scan, and a What's new
  note in every mode; the view-plan tour stays at its 6 steps.

### The Forecast view change

`forecastFlows` (src/views/forecast/engine/heads.ts, R147, RC10) now counts an opening the run dates in
a closed month (an Open seat past its time to fill starts on the as-of date, a closed month-end on the
sample's 30 Sep 2026) in the first open month, where the run counts its heads from. Before, those
openings were missing from Forecast > Overview's expected starts and October's starts and the year-end
heads card booked them as "Timing within months" (8.5 heads for Silicon Engineering, 13.9 for the
company); now the timing step is about 0. The finish audit found that the change also moved an offer
start dated in a closed month, which with the as-of date before the last close is that month's HRIS
hire, so the hire counted twice (AG-1); such a start is now left where it is, so each open month's
starts are the run's own starts row. Plan > Hiring reads only modeled exits from these flows, so none
of its numbers moved.

### Tests

New test files (counts as run on 28 Oct 2026):

- `src/views/plan/engine/recruitingTab.test.ts` (279): every number equal to Plan > Hiring's, projected
  starts and heads recomputed from the raw input, the months adding up, records and cards, heads only
  and the copy, for Managers A, B and C, HRBP, Leader, Finance and HR admin.
- `src/views/plan/engine/recruitingReview.test.ts` (9): the build review's readings.
- `src/views/plan/engine/recruitingFixes.test.ts` (41): the fix review's findings, each against the
  forecast run as control, and the finish audit's 31 Aug and 15 Aug months against the run's flows.
- `src/views/plan/engine/recruitingRuleThree.test.ts` (2): 8.4 rule 3 inside the scope (RP-2, RP-3).
- `src/views/plan/engine/recruitingLineage.slow.test.ts` (4): every field the tab lists is read.
- `src/views/plan/ui/recruitingChart.test.ts` (21): contrast, axes, keys, the domain, month labels, a
  move in, and the drawn segments netting to the line's step (AF-1).
- `src/views/plan/ui/recruitingUi.test.ts` (20): the tab's markup, keyboard stops and button names.
- `src/views/recruiting.contracts.test.ts` (25): registry, policy, catalog, help, copy, and the docs'
  C38 lines.
- `src/help/recruiting.test.ts` (27): the help section, glossary, Learn more, tour and What's new.
- `src/lib/export/deckSummary.test.ts` (11): the summary slide, the outline and the fitted table.
- `src/app/tabExport.test.ts` (15): heads-only tabs' own files and the menu's toast counts.
- `src/views/forecast/engine/overdueStarts.test.ts` (7): the Forecast view's openings dated in a closed
  month, and an as-of date before the last close (AG-1).
- `src/access/leaks.recruiting.slow.test.ts` (20): the tab read in full in every mode, its own deck and
  workbook as the menu writes them, 8.4, rule 3 and byte-equal perturbations.

13 new files, 481 tests.

Changed test files: `access/policy/policy.test.ts` (C38's surfaces in every mode), the access snapshot,
`metrics/catalog.test.ts` (112 data metrics), `metrics/ids.test.ts` (the three ids after
plan.hiring.recentHires), `metrics/hiringWording.test.ts`, `views/plan/engine/metrics.test.ts` (19
figures), `views/plan/engine/hiring.perf.test.ts` (the recruiting model under 300 ms in every mode),
`views/plan/ui/render.test.ts`, `views/hiring.contracts.test.ts`, `help/hiring.test.ts`,
`charts/core/legend.test.ts`, `app/wholeViewModel.test.ts`, `testkit/crawl.test.ts`,
`data/sample/sample.test.ts` (the four scopes below by independent code) and
`access/leaks.hiring.slow.test.ts` (Plan > Hiring's own files, AF-5).

### Review findings, with their fixes and tests

Each fix has a test that fails on the code before it, or, for a docs fix, a docs check.

| Finding | Fix | Test |
|---|---|---|
| RS-1 (medium) Approved heads and Current heads opened a records list, not a card | Both open a calculation card of the tab's own that lists Plan > Hiring's records; the tiles have no drill, so the card opens | recruitingFixes "approved heads and current heads open calculation cards", 5 modes |
| RS-2 (medium), RU-13 (low) A move in was drawn as a future start | Moves in are their own segment, key and keyboard stop, opening the move | recruitingChart "a move in on the chart" (GTM HRBP with an approved move; control with none) |
| RS-3 (medium) The Forecast view's flows changed with no doc | Recorded as PLAN 6.7, R147, the C38 row and RC10 | overdueStarts.test.ts (all 4 original cases failed before) |
| RS-4 (low) PLAN still said C38 was not built | 9.8 status, the 9.1 table, the `tab:plan.recruiting` policy row, R133 to R148, the C38 row, CONTRACTS-HIRING section 6; the metrics line followed in AF-6 | recruiting.contracts.test.ts docs checks |
| RS-5 (low), RU-12 (low) Two names for expected exits | "Projected attrition" everywhere on the tab (R141) | recruitingFixes "one name for expected exits", 4 modes; help/recruiting.test.ts |
| RS-6 (low) No time budget | The recruiting model under 300 ms in every mode | hiring.perf.test.ts |
| RU-1 (medium) Projected starts bars at 1.38:1 | A light fill with a full-strength dashed outline, 3:1 on the sheet and the white slide, in the legend and tooltip too | recruitingChart RU-1, light and both dark blocks |
| RU-2 (medium) Neither axis was labelled | "Hires and exits a month" and "Heads" (`AXIS_TITLES`) | recruitingChart RU-2 |
| RU-3 (medium), RU-14 (low) The approved line was undated and looked like the projection | A dotted line keyed "Approved heads by 31 Mar 2027", left out of a closed month's tooltip; a `dotted` legend shape | recruitingChart RU-3, RU-14; legend.test.ts |
| RU-4 (medium), RN-6 (low) The attrition note read as the projection's rate | Plan > Hiring's words, "Attrition (heads) 6.6% over 12 closed months" | recruitingFixes RN-6, 5 modes, equal to Plan > Hiring's note |
| RU-5 (medium) A mid-month as-of month left out its actual hires and exits | That month carries its hires and exits to date in the closed colours | recruitingFixes RU-5 (HR admin 15 Oct; control 30 Sep); since AF-1 the drawn bars too |
| RU-6 (low) With no Working forecast the projected heads key and modeled exits words stayed | A key only for a mark drawn; "Known exits from ... to ..." | recruitingFixes RU-6; recruitingChart |
| RU-7 (low) A year that is over promised marks and printed backwards ranges | The closed months' subtitle, no quarter span or note; 0 to come with a card, approved heads "—" with one | recruitingFixes RU-7 at 15 Apr 2027 |
| RU-8 (low) Small scopes got wrong axis labels | The bars' domain is at least one head each way | recruitingChart RU-8 (Manager C) |
| RU-9 (low) The velocity note was too long | "6-month pace 4.5; 13 hires in 3 months", the 3-month pace in the formula | recruitingFixes RU-9, 5 modes, at most 45 characters |
| RU-10 (low), RN-5 (low) FY28's tiles and quarters gave no window | "to FY28 end" on the flow tiles and "Q1 FY28, Apr to Jun" rows when the year shown does not hold the as-of date; the year end cards titled by the day | recruitingFixes RN-5, RU-10 (control FY27) |
| RU-11 (low) Phone month labels lost their years | `monthTickLabels`, shared with Plan > Hiring's velocity chart | recruitingChart RU-11 |
| RU-15 (low) A gap near 0 read "—" and the note named a hidden column | "On approved heads" at 0.0; moves in named only when a quarter holds one | recruitingFixes RN-8, RU-15 |
| RU-16 (low) The fallback table ran off the slide | `fitRows` sizes it to the box | deckSummary.test.ts |
| RU-17 (low) A "4 figures" toast for one slide and a doubled title | The toast counts slides (`deckEntries`); no divider of the same title | wholeViewModel.test.ts, deckSummary.test.ts; the menu's own count pinned in AF-4 |
| RN-1 (high) A month-end as-of date before its close dropped every overdue opening | `projectedStartsOf` counts them in the first month ahead; the as-of month shows as ended | recruitingFixes RN-1 against the run: SE 47.21 at 31 Oct and 47.14 at 30 Nov, the company 163.83 |
| RN-2 (medium) A signed offer past its start date was in no term | Its own term from the first month ahead, never a future start | recruitingFixes RN-2 (SE 15 Oct, REQ-4202 and REQ-4216) equal to the run's heads |
| RN-3 (medium) A last day on the as-of date was never an exit | "Last days on the as-of date" | recruitingFixes RN-3 (control: a last day on 1 Oct) |
| RN-4 (medium) A pre-hire with no req at Offer accepted was in no term | `HiringPrep.preHires`, a term from its hire date; Plan > Hiring's S, M, O and E unchanged | recruitingFixes RN-4 (a 16 Nov pre-hire; 31 Aug) |
| RN-7 (low) A tie at the top-5 cut was hidden | Named on the more line, "and 4 more locations, 1 tied with the fifth at 3 hires" | recruitingFixes RN-7 (control) |
| RN-8 (low) Rounded parts did not add up | The note names current heads and the one-decimal rounding | recruitingFixes RN-8 |
| RP-1 (high) The tab's own deck and workbook showed cost amounts | `HEADS_ONLY_TABS` and `tabExportOptions`, used by the menu and the crawl: no control totals on either heads-only tab's own files | tabExport.test.ts; leaks.recruiting.slow (failed with the check off); Plan > Hiring's own files since AF-5 |
| RP-2 (low) A request rule 3 hides moved counts inside the scope | Docs: CONTRACTS-HIRING I1 carried into 9.7, 9.8 and hiringData.ts (R146) | recruitingRuleThree.test.ts |
| RP-3 (low) A hidden Trade's get seats added to a manager's tab | Reading R146: they are the team's seats, as Plan > Overview reads them | recruitingRuleThree.test.ts |
| RP-4 (low) Manager mode reads the forecast drivers back | Accepted risk, PLAN 15.3 item 10 and README risk 9 | ship/docs.test.ts (README repeats 15.3) |

### The finish audit (28 Oct 2026)

Three audits (fixes, regressions, docs) and their verifiers read the fixed tree; all 16 findings were
real and none was refuted. Each fix below has a test that fails before it.

| Finding | Fix | Test |
|---|---|---|
| AF-1 (medium) The drawn bars did not net to the dashed line when a rare term was not 0 (HR admin at 15 Oct 3 short in October) | The rare terms are segments of their month, each with its own tint, key and keyboard stop when not 0; a last day on a mid-month as-of date is counted once, as an exit to date | recruitingChart AF-1: the net of `segmentsOf` equals the line's step for HR admin 15 Oct, SE 15 Oct, SE with a 30 Sep last day, SE with a 15 Oct last day at 15 Oct, SE 31 Aug and Finance 31 Oct (control SE 30 Sep); all 8 cases failed before |
| AF-2 (low) At an as-of date before the last close only September was pinned | Pinned: each month ahead is the run's flows, September's heads the run's; R134, RC2 and CONTRACTS-HIRING section 8 item 8 record that projected heads equal the run's heads only from an as-of date on or after the last close (the run's own heads sit below its flows there) | recruitingFixes AF-2 (SE 31 Aug and 15 Aug, Finance 31 Aug; failed before AG-1's fix) |
| AF-3 (low) A pre-hire's seat still counts in open to hire, unrecorded | Recorded in R134, RC2 and as a lead item (section 8 item 7): A = H + O + S + M holds with that seat in O | recruiting.contracts.test.ts docs checks |
| AF-4 (low) The deck toast count was not pinned in the menu | `tabExportDone` beside `wholeViewDone`; the menu's `deckEntries` counts in `runTab` and `runView` source-checked | wholeViewModel.test.ts ("1 figure from Plan, Recruiting summary."), tabExport.test.ts |
| AF-5 (low) Plan > Hiring's own files were not scanned as the menu writes them | `menuFiles`, `FILE_AMOUNT` and `overviewFilesCrawl` moved to src/testkit/recruiting.ts; the same scan on Plan > Hiring in every mode, HR admin with pay on included, Plan > Overview as the control | leaks.hiring.slow.test.ts (failed with the heads-only check off); both slow leak tests run alone |
| AF-6 (low), AD-2 (low) PLAN 9.8 named no metrics | A "Metrics (section 12 rows)" paragraph: the Plan > Hiring ids it reads and its three num1 ids (112 data metrics) | recruiting.contracts.test.ts |
| AF-7 (low), AD-1 (low) PLAN 9.8 items 2 and 3 said "projected exits" | "Projected attrition"; item 2 names moves in and points at R134; the Code line says R133 to R148 override 9.8 | recruiting.contracts.test.ts |
| AG-1 (medium) Before the last close the Forecast view counted the closed month's HRIS hires again in the first open month (HR admin 31 Aug: Expected starts 235.75 against 226.75) | `forecastFlows` keeps a closed-month offer start in place, as the run's `startsByIndex` does | overdueStarts.test.ts: HR admin at 31 Aug and 15 Sep (each open month's starts are the run's starts row, 9 and 4 seats not counted again), HRBP at 31 Aug; all 3 failed before |
| AD-3 (low) "Every number but projected starts is Plan > Hiring's" | Reworded in the help, README, CONTRACTS-HIRING 6 and 6.2, recruitingTab.ts and recruitingModel.ts: projected starts, projected heads and the gap are the tab's own, and two tiles open the tab's own cards | help/recruiting.test.ts, recruiting.contracts.test.ts |
| AD-4 (low) The glossary's Projected heads left out R134's terms | The definition names them (the formula string stays, as pinned) | hiringWording.test.ts |
| AD-5 (low) 15.3 item 10 and README risk 9 credited Plan > Hiring with the backfill rate | The backfill rate and lag come from projected starts and their modeled backfills on Plan > Recruiting summary | recruiting.contracts.test.ts |
| AD-6 (low) CONTRACTS-HIRING 6.1's export lists were wrong | Every export C38 added is named by a file that exports it, at the right path; `knownExitRows` is module-private again | recruiting.contracts.test.ts (constants and types checked against the row's files) |
| AD-7 (low) 6.4 did not list overdueStarts.test.ts and the count pins | Listed, with the policy test and the finish audit's tests | recruiting.contracts.test.ts (every listed test file exists) |
| AD-8 (low) R140 and RC5 said every year end card is titled by the day | Narrowed to approved heads, projected starts and projected attrition | recruiting.contracts.test.ts |

### The sample's numbers (30 Sep 2026, September closed, FY27 Working)

Read from the model by a probe test (deleted after). Q3 and Q4 are the quarters ahead; no scope has a
move in, a last day on the as-of date, a signed offer past its start date or a pre-hire.

| Scope | Approved, current, open to hire, future starts | Projected starts, projected attrition | Hiring velocity (6-month pace; hires in 3 months), attrition | Q3: approved, future, projected, attrition, projected heads, gap | Q4: approved, future, projected, attrition, projected heads, gap |
|---|---|---|---|---|---|
| Silicon Engineering (HRBP) | 604, 556, 39, 9 | 47.26, 23.75 | 4.3 (4.5; 13); 6.6% | 590, 9, 24.71, 11.68, 578.04, Short by 12.0 | 604, 9, 47.26, 23.75, 588.51, Short by 15.5 |
| Chun-Hsien Kuo's org (Leader) | 603, 555, 39, 9 | 47.24, 23.71 | 4.3 (4.5; 13); 6.6% | 589, 9, 24.71, 11.66, 577.05, Short by 11.9 | 603, 9, 47.24, 23.71, 587.53, Short by 15.5 |
| Whole company (Finance) | 1,610, 1,456, 132, 22 | 161.71, 79.93 | 13.0 (13.0; 39); 9.4% | 1,567, 22, 92.34, 40.62, 1,529.71, Short by 37.3 | 1,610, 22, 161.71, 79.93, 1,559.77, Short by 50.2 |
| Sebastian Wagner's team (Manager A) | 9, 7, 2, 0 | 2.14, 0.59 | 0.0 (0.0; 0); 0.0% | 9, 0, 1.88, 0.27, 8.61, Short by 0.4 | 9, 0, 2.14, 0.59, 8.55, Short by 0.5 |

The months ahead's future starts are Plan > Hiring's (SE and the leader's org 3, 3, 3, 0, 0, 0; the
company 8, 8, 6, 0, 0, 0; Manager A none). Where hiring happened: SE's top locations Munich, San Jose,
Bengaluru, Ho Chi Minh City and Hsinchu, its departments led by Design Verification, "and 1 more
department"; the company's led by San Jose and Sales, "and 4 more locations", "and 11 more
departments"; Manager A has no hire in the last 3 closed months.

### Verify output

This step's checks (28 Oct 2026, `HCP_TEST_WORKERS=2`, no full suite): `npx tsc --noEmit -p .` clean;
`npx biome check src` clean (1,167 files); the touched and recruiting test files passed (19 unit files,
527 tests, and `leaks.recruiting.slow.test.ts` alone, 20 tests in 387 s). `leaks.hiring.slow.test.ts`
passed its new AF-5 describe alone (2 tests), but every full run of the file ended in a worker crash
(exit code 3221225477, then Node itself segfaulting), as did other files rerun after it, so it and
`recruitingLineage.slow.test.ts` wait for the final run.

Verify (28 Oct 2026, final run): the PC crashed twice under `npm run verify` (a CPU fault: bugchecks
0x7F and 0x1AA, and once a fresh `Map` read as having no `get`), so the steps ran apart. Type-check and
lint clean (1,180 files). Tests: all 413 files and 4,691 tests passed (unit, slow and perf), run in
resumable batches of 16 unit files on 2 workers and one slow or perf file at a time;
`leaks.hiring.slow.test.ts` (23 tests), `leaks.recruiting.slow.test.ts` (20) and
`recruitingLineage.slow.test.ts` (4) passed in full. `src/cost/costDiff.slow.test.ts` failed once with
`all.get is not a function` on a `Map` its own function had just built, in code C38 does not touch, then
passed alone (5 of 5) and on the batch rerun. App build passed; one-file build passed
(`dist-single/index.html` 5,288,048 bytes of the 6,000,000 byte budget, opens from file:// with no
network request). Browser check in all five modes and at phone width: the numbers above, no amount
on the tab, no console error, all seven tiles on a phone, no sideways scroll.
