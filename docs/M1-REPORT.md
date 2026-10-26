# M1 report: schema, import, sample, engines with fixtures

Milestone M1 of docs/PLAN.md 17, verified on 21 Oct 2026. `npm run verify` passes all six steps from a
clean `node_modules/.vite`, twice in a row, with no source change needed. Every fixture PLAN sections 6,
10.2 and 11.7 name passes to the cent, and all nine sample stories hold with their exact numbers, on the
clean sample and on the messy raw extracts.

The review fix-up of the same day is the last section, "Fix-up (21 Oct 2026)". Where it differs from the
sections above (story amounts, test counts, two engine readings), it holds.

## Verify output

Run from the project root with `npm run verify` (scripts/verify.mjs), after deleting `node_modules/.vite`.
Vite runs as `node --max-semi-space-size=64 node_modules/vite/bin/vite.js`, never `npx vite`.

| Step | Result | Time | Notes |
|---|---|---|---|
| No data files in git | PASS | 0.0 s | "No data files outside src/data/sample/." |
| Type-check (`npx tsc --noEmit -p .`) | PASS | 0.9 s | TypeScript 7, no errors |
| Lint (`npx biome check src scripts`) | PASS | 0.7 s | 298 files, no fixes |
| Tests (unit, slow, perf) (`npx vitest run`) | PASS | 16.7 s | 93 files, 1,340 tests, 0 failed, 0 skipped |
| App build | PASS | 0.8 s | `dist/`: JS 225.29 kB (70.84 kB gzip), CSS 25.83 kB, two variable fonts |
| One-file build | PASS | 0.8 s | `dist-single/index.html` 425.97 kB (210.18 kB gzip) |

Exit code 0. Fixes made during verify: none (nothing failed). The second run, again from a clean
`node_modules/.vite`, gave the same six PASS lines (see the last section).

## Test counts

| Project | Files | Tests |
|---|---|---|
| unit (parallel, `*.test.ts`) | 91 | 1,333 |
| slow (serial, `*.slow.test.ts`) | 0 | 0 |
| perf (serial budgets, `*.perf.test.ts`) | 2 | 7 |
| Total | 93 | 1,340 (in 410 `describe` blocks) |

The slow project is empty by design: its files (leak crawls, cost LP, unions, edit invariance) are M2's.

| Folder | Test files | Tests |
|---|---|---|
| `src/app` | 1 | 3 |
| `src/cost` | 1 | 10 |
| `src/data` (schema, fiscal, scope, idb, store, tabSync, urlScope, context, settings, savedViews, import, lists, quality) | 26 | 518 |
| `src/data/sample` (incl. `raw/`) | 6 | 101 |
| `src/lib` | 6 | 35 |
| `src/metrics` | 12 | 102 |
| `src/plan` (canonical) | 1 | 5 |
| `src/plan/engine` | 23 | 406 |
| `src/plan/audit` | 1 | 14 |
| `src/plan/store` | 2 | 32 |
| `src/plan/workspace` | 4 | 54 |
| `src/ship` | 7 | 31 |
| `src/styles` | 2 | 23 |
| `src/testkit` | 1 | 6 |

Perf budgets (best of 3 runs after a warm-up, `bestCostMs`), all passing: `generateSample()` with hashing
under 1,500 ms (about 0.7 s a run here); on the sample, the whole-company plan model under 400 ms, the
forecast under 300 ms and the bridge against the Budget under 300 ms; the same three budgets again on
the synthetic 1,650-position workspace in `engines.perf.test.ts`.

No `notBuilt` stub is left: the 168 stub failures of the freeze (CONTRACTS-M1.md 4) are all gone, and
no test is skipped or marked only (the one conditional skip, in `trackedFiles.test.ts`, runs, since the
folder is a git repository).

## What M1 delivered, by folder

| Folder | What is there |
|---|---|
| root and `scripts/` | Package and lock pruned from the template app (PLAN 3.2), Vite, TypeScript, Biome and Vitest configs (three projects), `index.html`, the launcher, README and ARCHITECTURE. Scripts: `brand.mjs`, `verify.mjs` (the six-step gate), `trackedFiles.mjs` (the data-file rule), `copy-single.mjs`, `deploy-pages.mjs` and `pagesFiles.mjs` (M4 deploy, tested in a sandbox), `devServer.mjs` (the dev server deny list, `*.hcplan.json` included). `git init` done, no commits. |
| `src/app` | The scaffold shell: masthead with the wordmark (`Mark.tsx`), a status page listing the eight datasets and the nine story checks (`status.ts`, `storyChecks`), `brand.ts`, `storageKeys.ts`. |
| `src/charts` | `types.ts` (`Column`, `Definition`, `ExportMeta`) so the metrics port type-checks. |
| `src/cost` | `atoms.ts`: cost atoms (a director's org, a VP's or SVP's own staff, fallbacks to department and unit), the stored index each close keeps, `isUnionOfAtoms`. The rest of the cost guard is M2. |
| `src/data` | `schema.ts` (vocabularies, `Mode`, `MODES`, `isMode`, eight `DatasetDef`s), `fiscal.ts`, `scope.ts` (filters, position index, subtrees), `idb.ts`, `store.ts`, `tabSync.ts` with the writer lock (Web Locks plus a BroadcastChannel fallback), `urlScope.ts` (`ver`, `vs`), `context.tsx` (comparison defaults per mode), `settings.ts`, `savedViews.ts`, `viewsStore.ts`. |
| `src/data/import` | The import pipeline ported from the template app: parse, sniff, detect (positions against workers), automap with synonyms, normalize, apply, profiles, protected fields, templates (round trip of every dataset, approval steps included), steps, manager inference, issues. |
| `src/data/lists`, `src/data/quality` | Official lists (seed, edit, persist, roles, effective lists) and data quality (rules, applicability, tiers, versions, import summary). |
| `src/data/sample` | The deterministic Northgate Semiconductor generator: org, departments, positions, workers, comp, reqs, targets, freezes, assumptions, requests, personas, routing, versions (Budget and Q1 Reforecast locked "as of" their dates and hashed with `sha256()`), six closes each storing its atom index, the FY28 cycle, story 9's trade, the nine stories (`stories.ts`), `raw/` (messy extracts, starter state, the six managers' request files) and `README.md` with the hand calculations. |
| `src/lib` | `sha256.ts` (synchronous, FIPS vectors; no `crypto.subtle` anywhere), `costRounding.ts` (`roundCost`, `sumRounded`), `dates.ts`, `format.ts`, `stats.ts`, `timing.ts`, `testBudget.ts`. |
| `src/metrics` | The dictionary ported from the template app: types, `defineMetrics`, catalog, registry, api, params, privacy and cost guard rule entries (locked, raise only), overrides, persist (`hcp:metrics`), readers, wording, testing. |
| `src/plan` | `types.ts` (frozen), `canonical.ts`, `notBuilt.ts`. `engine/`: proration, heads, assumptions, cost, band, fx, lineTable, versions, close, forecast, variance, bridge, targets, allocation, budgetStatus, trade, chain, requests, cycle, freeze, transfer, whatif, reconcile, with `fixtures/`. `audit/chain.ts` (hash chain, verify). `store/` (`MemoryStore`, `BrowserStore` with the write lock and chunked audit log). `workspace/` (file, validate, diff, merge). |
| `src/ship` | Tests only: noCensus (needle built from two halves), brand, imports (dependency deny list), trackedFiles, deployPages, devServer, storageKeys. |
| `src/styles` | `tokens.css`, `index.css`, tier tokens and type scale with tests. |
| `src/testkit` | `memoryIdb.ts`, `memoryStorage.ts`, `orgFixture.ts`, `tabs.ts`. |
| `src/views/*/metrics.ts` | The eight home views' frozen `ID` maps (85 metric ids: plan 25, forecast 18, requests 14, targets 9, team 9, finance 6, whatif 3, audit 1), `PARAM` maps, and every `MetricDef` filled. |

## Fixtures (PLAN 6, 10.2, 11.7)

Every row passes. Negative controls are asserted to fail where a fixture names one.

| Fixture | What it pins | Test | Result |
|---|---|---|---|
| H1 | 16 Sep hire: 1 head at 30 Sep, 0.5 average FTE in September under every proration | `heads.test.ts` (6) | PASS |
| H2 | Last day 30 Sep: 1 head at 30 Sep, 0 at 1 Oct (last day inclusive) | `heads.test.ts` (4) | PASS |
| H3 | Exit on 15 Oct, no req: Open from 16 Oct (`openedOn`), October `hris` 15 of 31 days, no cost from November, still an approved head, no reconcile exception | `versions.test.ts` (9), `proration.test.ts` PR11 | PASS |
| H4 | Planned seat with an assignment from 1 Sep is Filled with a plan head; as Open, On hold or Eliminated it reports `assignment-on-open` | `versions.test.ts` (5) | PASS |
| C1 | Munich P4: €140,026 a year; September $6,301.17 daily and half-month, $12,602.34 full-month; FY27 €75,847.42 = $81,915.21 | `cost.test.ts` (5); also on the planted seat in `base.test.ts` and `sample.test.ts` | PASS |
| C2 | 0.6 FTE at €100,000: €60,000 base, burden cap stays €90,600 (scaled cap is the control) | `cost.test.ts` (2) | PASS |
| C2b | Open 0.6 FTE seat with an accepted offer: €60,000 base, basis `offer`, costed from the offer's start | `cost.test.ts` (2) | PASS |
| C3 | Merit: a row on 1 Mar 2027 gets FY28 merit from 1 Apr 2027, a row on 1 Apr 2027 none (C3a to C3d) | `cost.test.ts` (5) | PASS |
| C4 | Severance €30,000: last day 31 Dec books in 2027-01, 15 Dec in 2026-12, a pending elimination books nothing | `cost.test.ts` (7) | PASS |
| X1 | €120,000 open months: plan $129,600, forecast $138,000, FX effect $8,400 | `fx.test.ts` (3) | PASS |
| X2 | Against the Budget's stored 1.08, never Working's 1.10: $8,400 (the $6,000 control fails) | `fx.test.ts` (2), `bridge.test.ts` BX2 (2) and X2 end to end (5) | PASS |
| F1 | Double-count trap: rate 0.0105962, October 0.0596, November start 98.9404 and 1.0484, no extra seat (wrong model is the control) | `forecast.test.ts` (5) | PASS |
| F2 | Cohort invariance: moving a Planned start changes the band part only, filled part equal to the cent | `forecast.test.ts` (2) | PASS |
| F3 | `openedOn` 21 Aug, start max(1 Oct, 30 Sep + 20) = 20 Oct 2026 | `forecast.test.ts` (3) | PASS |
| B1 | Bridge $10.0M to $10.6M in eight steps summing to +$0.6M in integer cents (B1 and B1-cents) | `bridge.test.ts` (2) | PASS |
| G1 | Story 6 shape: target B + 40, asks B + 58, gap −18, cut line after the 40th ranked head | `targets.test.ts` (4) | PASS |
| G2 | Target dated 30 Sep 2027 leaves out 1 Jan 2028 starts; blank date counts both | `targets.test.ts` (2) | PASS |
| G3 | T1 pending: asks cost −$52,031.60 in year (annual +$151,123.60 control fails), head effect +7, gap after approval equals the gap | `targets.test.ts` (3), `whatif.test.ts` trade lever | PASS |
| A1 | Budget status (1) On track, (2) a pending request adds 1 head in Mar, (3) within 2%, (4) Over after a Level change, (5) Working pricing control | `budgetStatus.test.ts` (7) | PASS |
| A2 | Pending Backfill on an Open seat adds 0; on a seat On hold by an internal move adds 1 | `targets.test.ts` (3) | PASS |
| CH1 | Start recruiting with a Locked FY27 cycle record: [hrbp] | `chain.test.ts` | PASS |
| CH2 | Start date on a Planned Director seat, no targets: [hrbp] | `chain.test.ts` | PASS |
| CH3 | Same-unit position move: [manager, hrbp] | `chain.test.ts` | PASS |
| CH4 | Cross-unit internal move: manager, both HRBPs, both unit leaders | `chain.test.ts` | PASS |
| CH5 | Trade T6: manager, both HRBPs, both unit leaders, Finance | `chain.test.ts`, `trade.test.ts` | PASS |
| 11.7 seat table | Band estimates and weights at S = $150,000 for the seven seats, plus Munich P4 at 0.9, 0.8, 0.5 and Bengaluru P3 at 0.5 FTE | `band.test.ts` (12) | PASS |
| F-S | Σ $1,498,486.88 ÷ 10 FTE = $149,848.69, rounds to $150,000; HRIS salary cannot move S | `band.test.ts` (2) | PASS |
| F-S2 | With a 0.5 FTE seat: $150,242.69, still $150,000; dividing by heads ($143,000) is the control | `band.test.ts` | PASS |
| T1 | 8 seats, getBp 18,056, credit 1,104 (0.11), ratio 8.4891, +7, chain manager, HRBP, leader | `trade.test.ts` | PASS |
| T1′ | Asks 35 + 7 = 42 > 40: out of plan, leader and Finance steps | `trade.test.ts` | PASS |
| T1h | On hold give seat: +8, asks rise by 8 pending and approved heads by 8 on approval | `trade.test.ts` | PASS |
| T2 | Open Munich P4 for 4 Bengaluru P3: credit 1,054, ratio 4.4670, +3, manager, HRBP | `trade.test.ts` | PASS |
| T3 | 8 Bengaluru P3 + credit 1,104 for 1 San Jose P5: credit 0, −7 | `trade.test.ts` | PASS |
| T4 | P5 for P4 Munich with a 0.8 FTE rest seat (8,339 bp): getBp 18,421, credit 739, +1 | `trade.test.ts` | PASS |
| T5 | Blocked `not-enough` with the exact sentence | `trade.test.ts` | PASS |
| T6 | Cross-unit: credit 5,041 held by the giving GTM manager position, ratio 1.4715, chain incl. Finance | `trade.test.ts` | PASS |
| T7a | Filled, accepted-offer and contractor seats blocked, one block per seat with its positionId | `trade.test.ts` | PASS |
| T7b | `part-time-not-allowed` for both asks: "Bengaluru seats are full time only." | `trade.test.ts` | PASS |
| In-year T1 | inYearBp −3,469.33, "In FY27 this saves 0.35 standard heads", −$52,040.00 at S | `trade.test.ts` | PASS |
| 11.7 properties | giveBp = getBp + creditBp; T1 then T3 restores with credit 0; drift within half a bp a seat ($33.60 of $67.50); asks rise equals approved rise for every trade; T2's stored weights and the Budget hash survive a band edit | `trade.test.ts` (12) | PASS |

Contract fixtures beyond the PLAN text (CONTRACTS-M1.md 3), all passing: PR1 to PR13 proration
(`proration.test.ts`, 34 tests, R20's literal 0.5 included), BL1 loads from assumption rows, FS1 (the
planted Munich P4 starts 14 Dec 2026), EV1 (a target comparison is an empty state, not an error), BX2,
CR1 (trade credit keyed to the giving org and year), AT1 and AT2 (cost atoms), and T1-applied.

## Stories (PLAN 13.4)

Each story is asserted with exact numbers in `src/data/sample/sample.test.ts` and again on the messy
raw extracts in `src/data/sample/raw/stories.test.ts`. The status page's `storyChecks` passes all nine
on the sample.

| # | Story | Exact numbers asserted | Clean | Messy |
|---|---|---|---|---|
| 1 | Go-to-Market hired ahead of plan | Actual 184 − Budget plan heads 176 = **+8**, exactly the 8 planted early starts; YTD actual $16,211,952.48 against Budget $15,702,534.64; full year forecast $34,252,218.32 against Budget $33,251,713.77 (+$1,000,504.55); hires YTD 18 − planned 4 = **+14** | PASS | PASS |
| 2 | Silicon Engineering late in Bengaluru, Hsinchu offers above midpoint | Actual 556 − Budget 566 = **−10**, exactly the 5 + 3 + 2 late seats; forecast $93,885,679.82 against Budget $92,474,837.01 (+$1,410,842.82); no not-in-plan employee in a story org | PASS | PASS |
| 3 | Systems & Software backfills of new positions | `requests.flags.backfillNewPosition` = **4** (R-1025, R-1028, R-1032, R-1036), none in other units | PASS | PASS |
| 4 | Corporate freeze from 1 Aug 2026 | `plan.openings.frozen` = **3**; Corporate Open + Planned = **4**; the accepted offer is not counted and starts in the forecast with probability 1 | PASS | PASS |
| 5 | EUR and ILS rise against plan | Munich 53 and Haifa 45 heads flat seat by seat; FX effect Munich **$367,663.38**, Haifa **$417,881.52** (equal to the README terms to the cent); variance Munich +$455,363.39, Haifa +$447,340.77; every other site's FX effect $0; every MUC and HFA cost center stays a shown Finance row, so the Germany and Israel rows equal the hand calculation | PASS | PASS |
| 6 | Silicon Engineering FY28 asks over target | Target 644, asks 662, gap **−18**; cut line after the 40th ranked head; no other pending SE request with a head effect; 4 managers not submitted | PASS | PASS |
| 7 | Not in plan and cost-center mismatches | `finance.recon.exceptions` = **9** (6 not in plan + 3 mismatches), no other kind | PASS | PASS |
| 8 | `1550-HSZ` with 3 costed people | 3 costed people in every FY27 month and no opening (data shape; the "—" and Other surfaces are M2's cost guard) | PASS | PASS |
| 9 | Pending Systems & Software trade | P5 San Jose $295,976.60, P3 Bengaluru ₹4,009,600 = $48,115.20, band ratio 6.1514; at S = $174,000: 17,010 bp, 6 seats of 2,765 bp (bp ratio 6.1519), credit 420 bp, heads **+5**; get band estimate **$288,691.20** (over $250,000); chain manager, HRBP, leader, waiting on the leader; before the trade target 389 heads and $61,741,086.49, guarded asks 381 heads and $57,800,000 (gap +8 heads, $3,941,086.49), net in-year effect −$74,386.23, so no Finance step; the target-at-asks control adds Finance (out of plan); stories 1 to 8 unchanged without the trade | PASS | PASS |

Also asserted: the planted Munich P4 is not in the Budget, is Planned in the Q1 Reforecast with fixture C1
($6,301.17; €75,847.42 = $81,915.21) and starts 14 Dec 2026 at 0.9; the shape of 13.1 (1,650 positions:
1,450 Filled, 100 Open, 60 Planned, 15 On hold, 25 Eliminated; 1,610 approved heads; 1,456 actual heads;
92 cost centers; units 556, 337, 170, 184, 196, 7); the band pins (P4 Munich €110,000, P3 Bengaluru
₹3,580,000, P5 San Jose $235,000); both locks verify and recompute "as of" their dates; the 31 Aug and
30 Sep closes differ by exactly one partition change (63 atoms, then 64); no adjustments; the six request
files merge as "Merged 14 requests from 6 files, 2 conflicts"; the README states every asserted number.

Ad-hoc checks run during verify (scratch files outside the repo, not committed):

- `reopenAsNew` on the sample's Q1 Reforecast leaves exactly one FY27 Working (the new one, parent the
  reforecast), the old one retired, two audit drafts, and the Budget and Q1 Reforecast hashes unchanged
  and verifying. PASS.
- The README's story 8 statement that 1510-HSZ and 1520-HSZ hold 4 costed people each (so all three
  Corporate Hsinchu cost centers fold into Other) holds in every FY27 month (4, 4 and 3). PASS.

## Decisions builders made

Each is written in the file's header comment as "Readings kept here" or "Readings taken here", and the
sample's are also stated in `src/data/sample/README.md`.

Engines A (proration, heads, assumptions, cost, band, versions, close):

- Proration: a start on the 1st and a last day on the month's last day are not edges, so a seat that
  changes hands at a month boundary counts 1 on each side; R20's half-month 0.5 is literal for real
  edges (3 to 20 Sep, 3 to 29 Sep and 16 to 20 Sep all count 0.5).
- Assumptions: the department's row wins over the unit's over the company's; within one org level an
  exact key wins over a wildcard; a later duplicate row wins. Loads readers (`standardLoads`,
  `seatLoads`, `burdenComponents`, `meritRules`, `promotionRules`) were added to the contract.
- Cost: "as known on the as-of date" for assignments, reqs, offers and approvals, while position and
  comp rows are read whatever their dates; a segment is priced on its last active day in the month; the
  band year follows the latest merit date; a Filled seat with no comp row or an offer with no
  `offerBase` is costed at band; severance only for endReason Eliminated (or blank).
- Versions: an accepted offer is taken over by the first Employee assignment starting on or after its
  acceptance; a seat Open after an exit takes its replacement's start (latest open req, else latest
  approved Backfill); a non-Employee seat is never a plan or approved head unless an Employee holds it.
- Close: actual lines carry HRIS pay only; one-time items are booked by the forecast as one-time-only
  lines in their 6.3 month, so closing a month never drops them; a paid-leave flag change alone posts no
  adjustment.

Engines B (forecast, variance, bridge):

- Cohorts are kept per org at the drivers' finest level (unit and department); modeled exits and
  backfills happen mid-month (half a month's cost); the unit's average HRIS cost per head is per month
  from the seat lines; one forecast opening per seat in the grid.
- The bridge starts at the comparison's loaded total (its vacancy factor is a calculation-card
  allowance, never priced into a total); cohort seats carry the attrition step; one-time items move with
  the pay rate step; a seat on one side only moves in the positions step.

Engines C (targets, allocation, budget status, trade, chain, requests, cycle, freeze, transfer, What if,
reconcile, audit, workspace, store):

- Targets: an Elimination's date is the seat's last day; a trade's give seats leave at approval; no
  pending request changes a closed month (in-year amounts start at the later of their date and the first
  open month); an On hold seat given in a trade saves nothing.
- Chain: the submitter's manager is the nearest held seat above (a vacant one passes up); with one
  person on two steps the kept step carries both steps' reasons; a step with no approver found is left
  out, and a submit with no step is refused. `different-direct-reports` follows lead reading L3.
- Allocation: tree membership by the current row, pricing by the lock-date row; an approved elimination
  leaves the allocation before the last day (year-end shape).
- Transfer: effective on `effectiveDate`, else the approval date; an internal move leaves the receiving
  seat reading Open with no planned start until HRIS shows the new assignment, so the person is costed
  once and reconcile shows `filled-no-assignment` meanwhile.
- Freeze: a freeze's org is every field it sets; overlapping freezes never count a month twice.
- Reconcile: worker type questions stay with data quality; `cost-center-mismatch` needs a filled worker
  cost center; one exception per id.
- What if: levers compose in order; a seat with no planned start has no cost, so deferring it adds cost;
  the freeze lever is never turned into a request.

Sample (base and stories):

- Orgs join at read time (R26): a position's unit, site and cost center are its latest row's; a forecast
  cohort line belongs to its unit and to the one site of its currency (EUR is Munich, ILS is Haifa).
- Hires YTD counts employees hired 1 Apr to 30 Sep into a seat of the org; planned hires are Budget seats
  whose first head falls in April to September, leaving out seats Filled on 1 Apr 2026 and seats that
  receive a transfer (story 1: 18 − 4 = +14).
- The standard head is computed from the Budget's 1,610 approved Employee positions at 31 Mar 2027 with
  Filled seats at band: $173,546.01, rounded to $174,000 (FY28: $178,000).
- Story 9's trade gives P-2589 (planned start 2 Nov 2026) for get seats from 1 Feb 2027; the generator
  eliminated 13 S&S Budget seats to land the +8 heads headroom.
- Stored chains on the sample's base request rows test out of plan in heads only (cost is the chain
  engine's at recompute, so a recompute may add a leader step, never remove one).
- The guarded asks cost used for routing (`sample/routing.ts`) is the sample's own reading of 7.2 rule 8
  until the M2 cost guard: each atom's filled and band parts rounded down to $100,000, atoms under 5
  costed people left out, summed with `sumRounded`.

Verify (this step): no fix was needed, so nothing in `src`, `scripts` or the root config changed. The
two ad-hoc checks above ran from scratch files with a scratch Vitest config, outside the repo.

## Known gaps carried to M2 (and later)

1. The slow project is empty. Every `*.slow.test.ts` in PLAN 16.1 (manager, positions, requests, small,
   rounded and leave leak crawls, `tradeLeaks`, `costUnions`, `costDiff`, `costLp`, `editInvariance`,
   `assumptionEdits`) arrives with the M2 cost guard and access layer.
2. The cost guard (`src/cost` beyond `atoms.ts`) is M2. When it lands, `sample/routing.ts` should read
   the real guarded asks cost, and story 9's $57,800,000 asks cost and $3,941,086.49 gap, plus every
   stored chain on the sample's requests, should be rechecked against it.
3. `reopenAsNew` has no committed test. PLAN 16.1 puts the reopen clause in `versions.test.ts`; the
   ad-hoc check passed. The "Locked totals hold" item is covered in parts (Working band edits in
   `sample.test.ts`, Working FX edits in `bridge.test.ts`, band edits after T2 in `trade.test.ts`, lock
   leaves Working editable in `memoryStore.test.ts`); an edit of Working's loads is not covered. Owner:
   engines A (`versions.test.ts`).
4. `workspace/mergeRequests.test.ts` is not a file of its own: the counts, the later `updatedAt` and the
   conflicts are in `merge.test.ts` and `raw/requestFiles.test.ts`, and the Leader rule that never
   overwrites another org's request is there. The Leader cases that need the access layer (a cross-unit
   transfer the Leader approves merges, a request on the Leader's own seat changes nothing, a CEO pick
   merges everything) wait for M2.
5. The six managers' request files are built with `buildWorkspaceFile` filtered to "raised by the
   manager", not yet through the real `export.requests` path in Manager mode (`requestView` comes with
   M2's access layer).
6. `drill/calc.test.ts` (each fixture as a CalcSpec), `metrics/excel.ts`, `src/lib/export`, the Data room
   and Action center catalog entries, and `recordParamReads` per view are M2's.
7. The shell is the M1 scaffold (masthead and status page); the sample is not loaded in the browser yet
   (`main.tsx`). Its status line still reads "M1: data and engines are being built" (pinned by
   `status.test.ts`); M2's shell replaces it. The browser pass at 375 px in light and dark is M2's.
8. README copy nit: story 2's "over by $1,410,842.82" is the unrounded difference, one cent more than
   the two shown totals subtracted ($1,410,842.81). Story 5 says "each total is the unrounded sum";
   saying it once for the whole README would remove the doubt.
9. Accepted risk 15.3.8 stands as documented: Corporate has 1 costed person paid in CAD, the only unit
   and currency with 1 to 4 costed people.

## Second verify run

Run again from a clean `node_modules/.vite` after the JSON test listing and the ad-hoc checks, to make
sure neither left a cache behind that the gate depended on (93 files, 1,340 tests passed):

```
Headcount Planner verification
  PASS  No data files in git (0.0s)
  PASS  Type-check (0.9s)
  PASS  Lint (0.7s)
  PASS  Tests (unit, slow, perf) (16.0s)
  PASS  App build (0.8s)
  PASS  One-file build (0.8s)
exit 0
```

## Fix-up (21 Oct 2026)

The lead ruled on the M1 review's findings (CALC-1 to CALC-6, BRIDGE-START, ONE-TIME-CLOSED, DL-1,
DL-2, CF-1, CF-2, S5-FOLD) with the decisions below, and docs/PLAN.md gained readings R33 and R34
(15.1) and changes C31 and C32 (15.2) to match. CF-1 (`buildContext` in `src/data/context.tsx`) moved
to M2 (PLAN 17, M2 list): it is not built here.

Two readings in "Decisions builders made" no longer hold. Engines A's "Close: actual lines carry HRIS
pay only" is replaced by D-CLOSE, and engines B's "the bridge starts at the comparison's loaded total
(its vacancy factor ... never priced into a total)" by D-VAC.

### Verify after the fix-up

`npm run verify` from a clean `node_modules/.vite` (deleted first), run twice:

| Step | Result | Time | Notes |
|---|---|---|---|
| No data files in git | PASS | 0.0 s | "No data files outside src/data/sample/." |
| Type-check (`npx tsc --noEmit -p .`) | PASS | 0.9 s | no errors |
| Lint (`npx biome check src scripts`) | PASS | 0.7 s | 299 files, no fixes |
| Tests (unit, slow, perf) (`npx vitest run`) | PASS | 24.3 s | 94 files, 1,385 tests, 0 failed, 0 skipped |
| App build | PASS | 1.0 s | `dist/`: JS 225.29 kB (70.84 kB gzip), CSS 25.83 kB |
| One-file build | PASS | 0.8 s | `dist-single/index.html` 425.97 kB (210.18 kB gzip) |

Exit code 0. Fixes made during verify: none (nothing failed, so nothing under `src/` changed in this
step). The second run, again from a clean `node_modules/.vite`, gave the same six PASS lines (type-check
1.0 s, lint 0.8 s, tests 26.2 s, builds 0.8 s each). The bundles did not move: the M1 shell does not
load the engines yet.

### What changed, by decision

| Decision | Findings | What changed | Tests |
|---|---|---|---|
| D-VAC | CALC-1, BRIDGE-START | Plan versions (Budget, reforecasts, Working) carry a vacancy allowance (C31): each month, −vacancyFactor × the filled part's recurring cost (base + bonus + burden + benefits of the seat's `hris` and `offer` lines; no one-time, no band seats), as one allowance line per seat, month and currency (cost.ts `isAllowanceLine`: every amount 0 but `vacancy`, loaded = vacancy, no head, FTE or person). A seat line's loaded cost is unchanged; a version's Σ loaded includes the allowance. The forecast and the closes carry none. Line amounts gain `vacancy` and the line table `localVacancy` and `usdVacancy` (types.ts, lineTable.ts, workspace validate). The bridge keeps retention 1 on both sides and adds the allowance as its own part of each seat, so the start is the comparison's total with its allowance to the cent and step 3 is the forecast's exits and backfills less the allowance. | cost.test.ts (the vacancy allowance); bridge.test.ts "a comparison with a vacancy factor" (factor 0.02: start = the Budget total to the cent, Σ steps = forecast − Budget); sample.test.ts (3% in every plan version, none in the forecast or closes; the Go-to-Market and Silicon Engineering bridges start at the Budget total and add up to the variance) |
| D-CLOSE | CALC-5, ONE-TIME-CLOSED | Each close snapshots the one-time items booked in its month (C32: sign-on and relocation in the start month, the agency fee in the offer-accepted month, severance in the month containing endDate + 1) at the month's actual rate, as one-time lines of their own (close.ts `oneTimeActuals`, on cost.ts's rules read as known at the month's end; sign-on, relocation and agency fees need `reqs`). The forecast takes actual months' one-time items from the closes (or from `actualLines` for an actual month with no close); its own one-time-only lines are gone. The sample's closes read the ATS as it stood each month end: $902,391 over the six closes in 49 position-months, equal to FY27 Working's items month by month in local currency. | close.test.ts (5: August agency fee, September sign-on, relocation, severance and a EUR fee, severance only without reqs, matches Working, a back-dated change posts as "Other HRIS change"); forecast.test.ts (one-time items in actual months); sample.test.ts (closes equal Working's items; the six Hsinchu agency fees) |
| D-ELIM | CALC-2 | An Eliminated row (endReason Eliminated, Traded, Transferred or blank) ends the seat from endDate + 1 (R34): versions.ts `endsSeatOn` and `clipAtElimination` clip the holder's span at endDate in seat histories, cost.ts and the forecast, so there is no holder, head or cost after it even while HRIS shows the assignment. Severance books once; reconcile reports the leftover as `assignment-on-open`. | cost.test.ts C4e (holder with no terminationDate: paid through 31 Dec, severance once in 2027-01, approved heads 1 then 0 at approval, the pending head effect equals the change, reconcile); forecast.test.ts (same lines as when HRIS records the exit); close.test.ts (severance case) |
| D-NOSTART | CALC-3 | An Open or Planned seat with no planned start is costed nowhere (R33): targets.ts `bandEffect` and asks cost, and trade.ts's give-side `inYearBp`. A Start date then adds band × in-year from the new start, a Backfill band × in-year from its start. | targets.test.ts (a seat Open after an exit with no req: Elimination, Start date, Backfill, Level, Location and Trade give, each pending band effect equal to the change in Working's in-year lines after `applyApproval`, and asks cost moves by the same amount at approval); trade.test.ts (a give seat with no planned start saves nothing in-year) |
| D-START | CALC-4 | Approving a Start date on a seat whose derived status is Open writes an Open row (requests.ts), openedDate kept or derived as the last day + 1; a Planned seat keeps its status. | requests.test.ts (4: Open row, openedDate kept, planned start with a plan head and band cost from that date, Planned kept) |
| D-PREHIRE | CALC-6 | The forecast reads seat lines with every known assignment, so a pre-hire is costed at HRIS pay from its start in the filled part. Seats costed at band with no opening line keep their band line (a holder with no comp row, an accepted offer with no `offerBase`), which cost.ts now books with the holder's employee ID or the req ID. | forecast.test.ts (seats costed outside an opening, 2) |
| D-MIN | none (lead) | The forecast's average-cost fallback reads `ForecastInput.minCosted` (from `cost.guard.minCosted`); `DEFAULT_MIN_COSTED` (5) applies only when a caller passes none. No engine under `src/plan` or `src/cost` reads `MIN_GROUP`. The sample passes `MIN_COSTED`'s default. | forecast.test.ts (the average-cost fallback reads the locked minimum, 2) |
| D-LOCK | DL-1 | BrowserStore and the data store follow the writer lock both ways (`onWriterChange`): after `stepAside` or a lower tab id's beat they turn read only, and back to writer when they take the lock again. | browserStore.test.ts (a writer the lock demotes: save, appendAudit and lockVersion reject with READ_ONLY_NOTE after stepping aside and after a lower id's beat, then write again and the chain verifies); store.test.ts (3: every dataset write, `replaceDataset` included, rejects after stepping aside and after a lower id's beat; a stale start-up's callbacks are ignored) |
| D-MERGE | DL-2 | In `mergeRequests` a copy counts as changed only when its `updatedAt` is later than the merge base; a conflict needs both sides changed (or the same `updatedAt` with different content); otherwise the later `updatedAt` wins and a stale copy is ignored. | merge.test.ts (the re-import case, file A, file B, an edit, A again: "Merged no requests from 1 file, no conflicts"; a stale file copy that keeps coming back) |
| D-CHAIN | CF-2 | Tests only, from PLAN 16.2. | chain.test.ts (25, up from CH1 to CH5 and the rules check: self-approval moves up, 4 cases; one approver on two steps keeps the later step with both reasons; in-plan like-for-like Backfill stops at the HRBP, out of plan brings the leader back; the threshold strictly above $250,000; Director+ by level and by seat; freeze and envelope exceptions add Finance; out of plan with no target, over heads, over cost, no asks cost (heads only), any org touched, a Locked year outside a cycle); targets.test.ts (a Filled baseSalary or offerBase change inside one atom moves no bit, chain or flag, with its control; the start-date and FTE sweep of a draft New role) |
| S5-FOLD | S5-FOLD | Generator: departments.ts `remote: { Austin: 1 }` and positions.ts `seatRemotes` seat one San Jose Architecture engineer with Austin's team, so 1110-AUS holds 5 costed people in every month of every FY27 version, Silicon Engineering has no Other and 1110-MUC never joins one. The 13.1 shape, the heads of every story and S ($173,546.01, rounded to $174,000) do not move. | sample.test.ts (the 7.4 fold ported and run for every unit in the Budget, the Q1 Reforecast and FY27 Working: no MUC or HFA cost center in any Other; Germany and Israel rows, the shown cost centers plus the cohort lines, equal the FX totals; control: with 1110-AUS at 4 the fold puts 1110-MUC in the unit's Other) |

The `sample.test.ts` assertions that moved carry a comment naming the decision and the old value.

### Story numbers that moved

| Story | Figure | M1 | After the fix-up | Decision |
|---|---|---|---|---|
| 1 | Go-to-Market actual year to date | $16,211,952.48 | $16,426,043.48 (incl. $214,091 one-time) | D-CLOSE |
| 1 | Budget year to date | $15,702,534.64 | $15,236,845.85 | D-VAC |
| 1 | Budget full year | $33,251,713.77 | $32,316,099.11 | D-VAC |
| 1 | Variance full year | +$1,000,504.55 | +$1,936,119.22 | D-VAC |
| 2 | Silicon Engineering Budget full year | $92,474,837.01 | $89,767,347.99 | D-VAC |
| 2 | Variance full year | +$1,410,842.82 | +$4,118,331.83 | D-VAC |
| 2 | Year to date (newly asserted) | | actual $46,094,524.01, Budget $43,801,597.71 | D-CLOSE, D-VAC |
| 5 | Munich variance full year | +$455,363.39 | +$674,960.50 | D-VAC |
| 5 | Haifa variance full year | +$447,340.77 | +$675,470.23 | D-VAC |
| 9 | Systems & Software FY27 target cost | $61,741,086.49 | $59,984,668.88 | D-VAC |
| 9 | Guarded asks cost | $57,800,000 | $56,200,000 | D-VAC |
| 9 | Cost gap before the trade | $3,941,086.49 | $3,784,668.88 | D-VAC |
| | Q1 Reforecast stored forecast, year-end loaded | $251,551,461.59 | $251,672,670.67 | D-PREHIRE, D-CLOSE |

Unchanged: every head count and head delta (stories 1, 2, 5, 6), hires +14, the full-year forecasts
($34,252,218.32 and $93,885,679.82), the FX effects (Munich $367,663.38, Haifa $417,881.52), stories
3, 4, 6, 7 and 8, and story 9's heads gap (+8), heads effect (+5), net in-year effect (−$74,386.23) and
chain (manager, HRBP, leader, no Finance). The six Hsinchu agency fees (NT$4,175,000) now sit in the
July to September closes. Both lock hashes changed (the Budget's and the Q1 Reforecast's lines carry
the allowance; the new values are in `src/data/sample/README.md`), and both still verify and recompute
"as of" their dates. The README states every new amount, and it now says once that each amount is the
unrounded figure, which settles known gap 8. Known gap 2's story 9 figures are now $56,200,000 and
$3,784,668.88.

### Test counts after the fix-up

| Project | Files | Tests |
|---|---|---|
| unit (parallel, `*.test.ts`) | 92 | 1,378 |
| slow (serial, `*.slow.test.ts`) | 0 | 0 |
| perf (serial budgets, `*.perf.test.ts`) | 2 | 7 |
| Total | 94 | 1,385 (M1: 93 and 1,340) |

| Folder | Test files | Tests | M1 |
|---|---|---|---|
| `src/app` | 1 | 3 | 3 |
| `src/cost` | 1 | 10 | 10 |
| `src/data` (minus `sample/`) | 27 | 527 | 26 files, 518 |
| `src/data/sample` (incl. `raw/`) | 6 | 105 | 101 |
| `src/lib` | 6 | 35 | 35 |
| `src/metrics` | 12 | 102 | 102 |
| `src/plan` (canonical) | 1 | 5 | 5 |
| `src/plan/engine` | 23 | 438 | 406 |
| `src/plan/audit` | 1 | 14 | 14 |
| `src/plan/store` | 2 | 32 | 32 |
| `src/plan/workspace` | 4 | 54 | 54 |
| `src/ship` | 7 | 31 | 31 |
| `src/styles` | 2 | 23 | 23 |
| `src/testkit` | 1 | 6 | 6 |

The BrowserStore half of D-LOCK, D-MERGE, D-CHAIN and S5-FOLD landed before the verify recorded at the
top of this report, so their tests are already inside its 1,340. The 45 tests added since are the
engine cases of D-VAC, D-CLOSE, D-ELIM, D-NOSTART, D-START, D-PREHIRE and D-MIN (+32), the sample's
D-VAC and D-CLOSE checks (+4), and the data store's D-LOCK cases with one more `src/data` test file (+9).
Every perf budget still passes.
