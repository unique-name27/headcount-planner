# M2 report: modes, visibility, cost guard, leak tests, homes, read-only views

Milestone M2 of docs/PLAN.md 17, verified on 23 Oct 2026. M2 was built in three waves (access, cost
guard, UX port and shell; the read-only views; the leak and attack tests), reviewed by five lenses
plus the lead's browser pass, and fixed in three folder groups under one lead decision, D-FIN
(PLAN change C33). This verify step closed the fixers' open items, regenerated the one stale
snapshot, and ran `npm run verify` from a clean `node_modules/.vite`.

All 30 review and browser findings are fixed; one low finding (RC-5) is resolved by C33 rather
than as written, and is flagged for the lead below.

## Verify output

Run from the project root with `npm run verify` (scripts/verify.mjs) after deleting
`node_modules/.vite`, on Node 24.14.1. Vite runs as `node --max-semi-space-size=64
node_modules/vite/bin/vite.js`, never `npx vite`. This is the final run, after every change of this
step; an earlier full run on the same tree, before two comment-only edits, also passed all six steps
(the tests in 692 s).

| Step | Result | Time | Notes |
|---|---|---|---|
| No data files in git | PASS | 0.0 s | "No data files outside src/data/sample/." |
| Type-check (`npx tsc --noEmit -p .`) | PASS | 1.3 s | No errors |
| Lint (`npx biome check src scripts`) | PASS | 1.0 s | 870 files, no fixes |
| Tests (unit, slow, perf) (`npx vitest run`) | PASS | 719.0 s | 260 files; 2,801 passed, 2 todo, 0 failed |
| App build | PASS | 6.1 s | `dist/`: main chunk 2,134.28 kB (694.44 kB gzip), CSS 66.07 kB; ExcelJS, SheetJS and pptxgenjs in their own lazy chunks |
| One-file build | PASS | 6.2 s | `dist-single/index.html` 4,361.91 kB (1,499.88 kB gzip) |

Exit code 0. The summary as printed:

```
Headcount Planner verification
  PASS  No data files in git (0.0s)
  PASS  Type-check (1.3s)
  PASS  Lint (1.0s)
  PASS  Tests (unit, slow, perf) (719.0s)
  PASS  App build (6.1s)
  PASS  One-file build (6.2s)
```

What this step changed to get there: the Finance filter lines of `src/access/__snapshots__/access-how.txt`
were regenerated (the C33 note, five lines), and the open items below were closed with a test
each. No privacy, leak or attack test was weakened; the leave, Manager, positions and rounded leak
tests are stricter than before.

## Test counts

| Project | Files | Tests |
|---|---|---|
| unit (parallel, `*.test.ts`) | 237 | 2,681 |
| slow (serial, `*.slow.test.ts`) | 17 | 105 (103 passed, 2 `it.todo` for M3) |
| perf (serial budgets, `*.perf.test.ts`) | 6 | 17 |
| Total | 260 | 2,803 |

Before the review fixes M2 stood at 2,566 unit, 90 slow and 17 perf tests. The three fixers brought
the unit project to 2,670; this step added 11 unit tests (the scanner's grammar in
`src/testkit/leaks.test.ts`, the Plan line source, Plan's tiles and window, the forecast's cost
window, the audit view) and 8 slow cases (3 Manager, 3 positions, 2 rounded), and rewrote story 8's
reason case.

| Folder | Unit files | Unit tests | Slow files | Slow tests | Perf files | Perf tests |
|---|---|---|---|---|---|---|
| `src/access` | 12 | 165 | 8 | 59 | | |
| `src/app` | 20 | 108 | 1 | 5 | | |
| `src/charts` | 15 | 137 | | | | |
| `src/components` | 5 | 65 | | | | |
| `src/cost` | 5 | 115 | 7 | 40 | | |
| `src/data` (schema, fiscal, scope, store, context and the rest) | 10 | 168 | | | | |
| `src/data/import` | 12 | 283 | | | | |
| `src/data/lists` | 2 | 32 | | | | |
| `src/data/quality` | 4 | 59 | | | | |
| `src/data/sample` (incl. `raw/`) | 5 | 103 | | | 1 | 3 |
| `src/drill` | 9 | 140 | | | | |
| `src/lib` (incl. `export/`) | 15 | 123 | | | | |
| `src/metrics` | 13 | 108 | | | | |
| `src/plan` (canonical) | 1 | 7 | | | | |
| `src/plan/audit` | 1 | 14 | | | | |
| `src/plan/engine` | 23 | 437 | | | 1 | 4 |
| `src/plan/store` | 2 | 32 | | | | |
| `src/plan/workspace` | 5 | 65 | | | | |
| `src/ship` | 7 | 31 | | | | |
| `src/styles` | 2 | 23 | | | | |
| `src/testkit` | 2 | 8 | | | | |
| `src/views` (registry, contracts, line source) | 3 | 31 | | | | |
| `src/views/actions` | 14 | 94 | | | 1 | 2 |
| `src/views/audit` | 1 | 14 | | | | |
| `src/views/data` | 4 | 21 | | | | |
| `src/views/finance` | 5 | 32 | | | | |
| `src/views/forecast` | 14 | 65 | 1 | 1 | 2 | 5 |
| `src/views/home` | 4 | 44 | | | | |
| `src/views/plan` | 10 | 68 | | | 1 | 3 |
| `src/views/requests` | 3 | 23 | | | | |
| `src/views/targets` | 6 | 36 | | | | |
| `src/views/team` | 3 | 30 | | | | |

No test is skipped or marked only; the one conditional skip, in `trackedFiles.test.ts`, runs,
since the folder is a git repository.

## What M2 delivered, by folder

| Folder | What is there |
|---|---|
| `src/access` | The five modes and every per-mode table of PLAN 8.1 (`modes.ts`), pay and leave views (`pay.ts`, `leave.ts`, `leaveScopes.ts`: the one leave count and `leaveShown` over every HRBP and Leader scope), every surface and action id with PLAN 8.3's grid (`surfaces.ts`, `ids.ts`), `ROLE_POLICY` as plain data (`policy/`: `table`, `kit`, one file per mode, `actions`, `rounded`, `routing`; `decide`, `can`, `routeShown`, `routeDecision`), scopes and Acting as (`scopes/`: `scopeFor`, tree, unit, pickers, labels, people, atoms, records, the idempotent clamp, scope values, the unset scope), the mode store (`hcp:mode`), `connect.ts` (mode and pick changes, `releasePinned`), the matrix snapshots (`access-matrix.txt`, `access-how.txt`), Action center routing (`items.ts`), `numbers.ts`, person-level rules (`visibility.ts`: `requestView`, `commentVisible`, `auditView`, `hasAmount`, `managerText`), the context's access (`context.ts`, `hooks.ts`), and the leak tests. |
| `src/cost` | The cost guard of PLAN 7: `guard.ts` (`costMembers`, `costRow`, `roundedAmounts`, `breakdown`, `guardModel`, `componentContributors`, `componentGate`, `expectGuarded`), `fold.ts` (`foldGroups`, `financeFold`, `financeOrgCost`, currency shares), `differences.ts` (`contributors`, `bandOnly`, `guardedDifference`, `foldSteps`), `fit.ts` (`costFit`, C33's whole-unit filters, the short-window rule), the LP test kit, and the attack tests (LP, scopes, differencing, unions, edit invariance, assumption edits and affinity). |
| `src/data` | `context.tsx`'s `buildContext` with scope, clamp, comparison and guard settings (and the window of the shown version's year); quality tiers that never call an optional blank field "No data" (`quality/compute.ts`); `fiscal.ts`'s `periodWindow` by fiscal year; the sample's routing on the real guarded asks cost and story 9 re-derived under C33. |
| `src/drill`, `src/components`, `src/charts`, `src/styles`, `src/lib/export`, `src/metrics/excel.ts` | The template app's UX layer ported with renames: drills, the drill panel, `PositionCard`, `CalcCard` with `calcProblems` and `costCalc`, `requestRecord` (8.4 per row), records and "Filter to this"; `KpiStrip` (with `deltaEmpty`), `Readout`, `kpiModel`; `Figure`, `FigureGate`, `DataTable`, the chart kit with `Waterfall` and `waterfallModel`, `Bullet`; tier tokens; CSV, workbook, clipboard, columns, names, withheld, mode headers, definitions and view exports. |
| `src/app` | The shell: masthead, Mode menu, Acting as picker (`actingAsRows`), version and comparison pickers, filter bar, period control, view header, folder tabs, Settings, the address and route guard, the read-only tag, the export menu, error boundaries and the status page. |
| `src/views` | Read-only views: Plan (Overview, Positions, Openings, Transfers), Forecast (Overview, Variance, Bridge), Targets (Gap, Sub-org targets, Tree by cost center), Finance (Versions, Assumptions, Freezes, Reconcile; Export is M4's), Requests lists (Queue, Mine, Approvals, Cycle; New is M3's), My team, the three homes (Unit plan, Rollup vs target, Plan vs actual), the Action center, Audit and the Data room; `lineSource.ts` (cap sides, leave read as paid). What if stays a stub for M3. |
| `src/plan` | M1's engines, plus `lineSource.ts` (one line rule for closed months, C33) and `workspace/shared.ts` (the scope identity "Open a shared file" compares, RM-3); `workspace/file.ts` writes and reads the header's `scopeKey`. |
| `src/testkit` | The leak crawler (`crawl.ts`: every model, tile, finding, drill, card, page, help text, export as written bytes, the Shareable and Requests files, comments and audit rows), the leak scanner (`leaks.ts`), the 16.1 move rule (`moves.ts`), routing helpers (`routing.ts`) and the sample contexts and copies (`sample.ts`). |
| `src/metrics` | The Action center's and the Data room's metrics wired into the catalog; `guardClass.ts`. |
| `src/help` | Still the M2 freeze stub (`LearnMoreLink` renders nothing); help is M4's. |

## Leak, attack and perf tests

Every leak test crawls through `src/testkit/crawl.ts` (views, tiles, findings, drill tables,
position and calculation cards, the Action center, Audit, the Data room, help, the glossary,
Settings > Formulas, every export as written bytes, the Shareable and Requests files, comments and
audit rows) and has an HR admin control, with pay amounts shown where it matters, that must differ.
The clock is pinned.

| Test (slow project unless marked) | What it asserts |
|---|---|
| `access/leaks.manager.slow.test.ts` | No currency sign, ISO code, grouped number or amount-like key in any Manager crawl (the three personas and every manager a pick can name), files and workbooks included; the fixture's texts with an amount never reach Manager mode while reasons arrive with "an amount"; no `seq`, `prevHash` or `hash` outside HR admin; Manager B's surfaces byte-identical after a salary, offer and leave change; Manager C, the manager below and Finance acting as C identical with and without C's Elimination (routing, an HRBP Shareable opened as C and Export for a manager included). New: no Manager crawl or file holds a band midpoint edit or the cycle's cut line (RM-2); a namesake manager opening another team's Shareable sees none of its figures, seats or requests (RM-3). |
| `access/amountSpellings.slow.test.ts` (new) | Five amount spellings (dot grouping, lakh, a trailing €, Indian grouping, space grouping) on Manager A's sent-back request never reach Manager A's crawl or files, nor any piece of their numbers; HR admin reads all five (RM-1). |
| `access/leaks.positions.slow.test.ts` | One Filled salary, one offer field, one severance or one back-dated comp row at a time: HRBP, Leader and Finance crawls move only totals over 5 or more costed people (whole steps in rounded modes) and differences with 5 or more contributors, no component cell after a one-time change; no Shareable file holds a per-position money key. New (C33): no Finance amount, or difference of two, equals a back-dated raise's closed months (RF-4); a salary change moves nothing under a multi-center or country-by-units filter (RF-2, RF-5); one back-dated Other HRIS change moves nothing (RF-3). |
| `access/leaks.requests.slow.test.ts` | A pending Elimination, Level change or Location change on a Filled seat, and a pending Elimination on an accepted offer, change the same values by the same deltas whatever the person is paid; sweeping the Elimination's date over every day moves only band parts. |
| `access/leaks.leave.slow.test.ts` | No leave field, count or note in Manager or Finance; a `leavePaid` flip in a 5-head cost center, a 5-person atom and a Finance row, and a back-dated unpaid leave, move only totals shown at 5 or more, with contributor counts and lists compared strictly (new, RR-1); leave counts show only for whole scopes at the as-of date, and every class across shown leave sets is 0 or 5 or more (control: free filters find a class of 1). |
| `access/leaks.rounded.slow.test.ts` | Every HRBP and Leader crawl (every pick, the CEO, CFO and CHRO included) holds only whole rounding steps, band estimates and per-head figures, and no card input is local currency or an average; no amount under month or custom. New (RR-2): no to-date amount with no month closed at a mid-month as-of date; with the as-of date before the last close, inflating the later closes moves no to-date amount. Control: Finance's exact amounts fail the scan. |
| `access/leaks.small.slow.test.ts` | Story 8's 1550-HSZ (3 costed people) reads "—" or folds into Other everywhere without the switch, under no filter and a filter on it; every amount the crawl tags with 1 to 4 costed people or contributors reads "—". |
| `access/tradeLeaks.slow.test.ts` | Manager trade surfaces show weights, never amounts; a salary, offer or leave change moves no quote or weight; the standard head reads no pay; Manager C's tradable seats and quotes are the same with and without the Elimination; Filled and accepted-offer seats are never tradable; a trade comment with an amount stays approvers-only. |
| `cost/costUnions.slow.test.ts` | Finance's exact sets at one as-of date, taken together for every field (version, period, component), single out nobody: every class of costed people is 0 or 5 or more over units, cost centers, sites, countries, legal entities, currencies, org rows, Tree by cost center and totals; 1550-HSZ's people share a class of 5 or more; each unit's Other holds 0 or 5 or more per currency per month. Since C33 it also crawls multi-center and country-by-unit-set selections as attacks that must show no cost, harvests components as (position, month) elements with cap sides, bridge steps, Other changes and FX as (step, position) elements, and back-dated adjustments. Controls: independently folded country rows, and the org-row rule off, find classes under 5. |
| `cost/costLp.slow.test.ts` | Union identity on every rounded figure; one LP per atom group and field across the 31 Aug and 30 Sep closes pins no changed position narrower than a step. Controls: rounding each set of Silicon Engineering's departments in one step pins some change under half a step, and one window's readings made exact pin a hire to under $1. It asserts its atom index and LP sizes. |
| `cost/costLpScopes.slow.test.ts` | The bounded scope list (every department and leader seat, Silicon Engineering's 63 department sets, 200 seeded multi-selects): union identity, and no scope reads an atom part the default scopes do not. |
| `cost/costDiff.slow.test.ts` | HRBP and Leader exports are whole steps with no monthly, cost-center or component amount; no difference of two or three amounts, or swap, pins a position or a group of 2 to 4 closer than half a step; controls on exact and nearest-step amounts do pin. |
| `cost/editInvariance.slow.test.ts` | No seat edit, approved Start recruiting, Start date or Trade, pending request, What if lever or operational driver sweep moves an atom's exact filled part, to the cent; control: band-cohort exits at the HRIS average do move it. |
| `cost/assumptionEdits.slow.test.ts` | The edits 7.4 must refuse are found (the TWD rate, Taiwan burden rates); caps, dates, cutoffs and pay percentages read "Set by import." in Finance; control sweeps as HR admin find US base and bonus near the cap; attrition moves only the HRIS cohort at one average per unit. Two refusal cases are `it.todo` for M3. |
| `cost/assumptionAffine.slow.test.ts` | Every shown Finance total is affine in each Finance-editable rate across its range, to the cent. |
| `app/routes.slow.test.ts` | Every route the mode shows renders through the shell, and hidden routes go home. |
| `views/forecast/engine/memo.slow.test.ts` | The Forecast model's caches change no number: contexts asked in sequence equal a fresh module's. |
| `testkit/leaks.test.ts` (unit, new) | The scanner finds the review's spellings and keeps counts, rates, dates and IDs clean. |
| `data/sample/sample.perf.test.ts` (perf) | `generateSample()` with hashing under 1,500 ms; the company plan model under 400 ms, the forecast under 300 ms, the bridge against the Budget under 300 ms. |
| `plan/engine/engines.perf.test.ts` (perf) | The same three engine budgets on a synthetic 1,650-position workspace. |
| `views/plan/engine/smoke.perf.test.ts` (perf) | The Plan model for a fresh context under 600 ms in Finance, HRBP and HR admin mode. |
| `views/forecast/engine/smoke.perf.test.ts` (perf) | The Forecast model for a fresh context under 1,500 ms in Finance, HRBP and HR admin mode. |
| `views/forecast/engine/finance.perf.test.ts` (perf) | The Forecast model for Finance under 300 ms, company and a unit filtered to for the first time. |
| `views/actions/engine/collect.perf.test.ts` (perf) | One view's Action center items cold under 400 ms; every view cold under 1,000 ms in every mode. |

## Lead decision D-FIN (PLAN change C33)

**The decision.** Exact Finance cost (and HR admin with the switch off) is published only at grains
the joint-classes test can guarantee:

- (a) Cost filters for Finance and HR admin with the switch off are whole business units, plus
  version and period. A cost-center, legal-entity, country or currency filter still narrows head
  counts, but a cost figure under it reads "—" with "Cost shows for whole business units. Cost
  centers, countries, legal entities and currencies are rows of each unit's breakdown." They stay
  exact rows of the unit's one fold (`financeFold`).
- (b) The component split (base, bonus, burden, benefits, one-time, equity) shows only on unit and
  company figures, and only when, within every unit the figure covers, every component has 0 or 5 or
  more contributors and each capped burden component's below-cap and at-or-above-cap groups each
  have 0 or 5 or more people (a person whose cap binds only in some months counts on both sides),
  per month and over the window. Otherwise loaded cost only. It is applied in `costRow`, so cards,
  Cost by component, forecast components and (in M4) the long CSV and load file follow.
- (c) Bridge steps and the FX effect are per unit and company only: a step that folds into Other
  changes in any unit folds at company level too; the FX tile comes from the same folded result
  (shown only when the bridge shows FX as its own step); Other changes never pairs with a step
  another surface publishes. Contributor sets are leave-neutral (RR-1) and FX contributors are
  counted per line currency.
- (d) Back-dated adjustment amounts and the Other HRIS change count show at company level only,
  never under a filter or scope (RF-3).
- (e) Closed months come from the closes everywhere, through one shared line-source helper for Plan,
  Forecast, Targets and the sample's routing (RF-4); asks cost, the Finance gap and story 9's
  guarded asks cost were re-derived ($57,100,000 and a gap of $2,884,668.88, was $56,200,000 and
  $3,784,668.88; the trade still stays in plan and every stored chain is unchanged).

**Why.** PLAN 7.4 let Finance filter one cost center, legal entity, country or currency at a time
and showed the component split per cell, on the reasoning that every such set is a union of shown
cost centers and unit Others of 5 or more. The Finance red team showed that was not enough at one
as-of date: two cost-center selections differed by one hire's sign-on (RF-2); a country over a set
of units recovered a bridge step or an FX effect of 1 to 4 people (RF-5, RC-1); burden caps turned
the split into a salary oracle (RF-1); back-dated adjustments ignored the fold (RF-3); and Targets
and Plan priced closed months from different lines (RF-4). The joint-classes test
(`costUnions.slow.test.ts`) can prove whole units safe; it cannot bound every union and difference
of finer selections. So Finance keeps every exact row of the fold and loses only finer filters and
splits the test cannot guarantee. On the sample no unit passes (b)'s gate at YTD or FY (one-time and
cap groups of 1 to 4 in some months), so Finance and HR admin with the switch off see loaded cost
only on those cards and on the exit run rate, and story 5 is no longer readable through a Finance
country filter.

## Review and browser findings, with their fixes

The review ran five lenses: the story recount through the view models (RC), and red teams for
Manager (RM), the rounded modes (RR), Finance (RF) and UI policy (UI). Each high and medium finding
was verified adversarially before it counted (`kept.json`: 16, none refuted, the verifier's better
fix used where it gave one); the 11 low findings and the lead's 3 browser findings (B) were taken as
written. The fix groups are finance guard (FG), shell, access and data (SA), views (VW), and this
verify step (V).

What the lenses checked and found clean, in brief: the recount matched the views from raw rows in
73 contexts (every tile has a drill or a card, 2,540 counted cells open their rows, every story's
number holds); Manager crawls stay byte-identical under pay, offer and leave changes, and Manager C
sees nothing of the Elimination of their seat under every version, comparison and period; every
rounded-mode amount is a whole $0.1M step, a band estimate or the standard head, and every pick
reads whole atoms; `ROLE_POLICY` matches PLAN 8.3 cell by cell, every route renders or redirects,
and the copy, tokens and figure props pass their rules.

### Verified high and medium findings

| ID | Severity | Finding | Fix | Tests |
|---|---|---|---|---|
| RM-1 | high | Rule 5's amount guard missed common spellings ("140.000", "140 000", "140'000", lakh, crore, grand, "INR140000") and redacted others only in part ("12,an amount", a trailing "€" left), so amounts in comments, reasons and audit comments reached Manager mode. | SA: a new amount grammar in `src/access/visibility.ts`: one thousands separator per run (comma, dot, space, no-break, narrow and thin spaces, apostrophes), Indian grouping, decimal commas, size words (k, M, mn, million, thousand, grand, lakh, lac, crore, cr, bn), a sign, ISO code or "Rs" before or after, glued or one space away, ranges and negatives. A dot run is thousands only under the verifier's rule, so "1.043 standard heads" stays a decimal. `managerText` replaces the whole span and any lone sign or code. V: the leak scanner (`src/testkit/leaks.ts`) learned the same spellings, written apart from the guard. | `visibility.test.ts` (30 spellings, 17 negatives, `hasAmount(managerText(t))` always false); new `amountSpellings.slow.test.ts`; new `src/testkit/leaks.test.ts` |
| RM-2 | medium | Manager-mode audit rows kept company assumption values (a band midpoint), other units' drivers and the cycle's cut line, and the Shareable slice shipped them. | VW: where `page:audit` is hidden, `auditModel` keeps only position entries about the tree's seats and request or transfer entries whose request is in scope and visible; every amount-like old or new value reads "changed". V: `auditView` reads every assumption value as "changed" wherever `cost:band` is hidden, whatever the field is called (a band midpoint's field is `value`, like a rate's); the Manager fixture gains a band `value` entry and a real `cycleTransition` cut entry. | `audit.test.ts`; `visibility.test.ts` (new case); `leaks.manager.slow.test.ts` (no Manager crawl or file holds either entry; HR admin control) |
| RR-1 | high | Forecast > Bridge contributor lists named the one person whose leave became unpaid (Timing 12 to 13, Pay rate 21 to 22, Assumption rates 20 to 21). | FG: contributor counts, lists and drills come from leave-neutral stage prices (`stepMovers`, `neutralSeatsOf`, `paidSeatLines`: each unpaid month priced as paid at the line's own rate); step values, totals and the band classification keep the real prices. V: the leave leak test compares contributor counts and lists strictly (`MoveRules.strictContributors`). | `bridgeFold.test.ts`; `leaks.leave.slow.test.ts` (fails with leave-dependent lists, checked by sabotage) |
| RR-2 | medium | With no month close, HRBP and Leader year and quarter to date ran to the as-of date's open month ($50.7M YTD; $7.3M QTD of one open month). | VW: rounded modes end cost to date at the last close on or before the as-of date (`lastCloseOnOrBefore`, `Prep.costClose`, `Prep.costYtdMonths`); with none, ytd and qtd cover no month and say why. V: the forecast follows: Forecast > Variance's QTD and YTD cost cells (`WindowDef.costMonths`) and the FX effect YTD read the same months. | `src/views/plan/engine/costWindow.test.ts`; new `src/views/forecast/engine/costWindow.test.ts`; two new `leaks.rounded.slow.test.ts` cases (no close at a mid-month as-of date; an as-of date before the last close with the later closes inflated), both failing without the forecast fix |
| RF-1 | high | Burden caps made the component split an exact salary oracle at one date (23 people above and 1 below the US social security cap gave that person's base and bonus). | FG, D-FIN (b): `componentGate` inside `costRow`. The split shows only on rows that are whole units, and only when every component has 0 or 5 or more contributing positions and each capped burden component's below-cap and at-or-above-cap groups each have 0 or 5 or more people, per month and over the window; a person whose cap binds in some months counts on both sides. | `guard.test.ts` (23 above and 1 below, the crossing person, company against unit); `src/views/lineSource.test.ts`; `costUnions.slow.test.ts` (cap-side classes) |
| RF-2 | high | The component rule was checked per displayed cell, so two cost-center selections gave one hire's sign-on (12,100.00). | FG, D-FIN (a) and (b): cost filters are whole business units; the split shows only on whole units under the gate. V: one salary change moves no amount under a multi-center or a country-by-units filter. | `fit.test.ts`; `costUnions.slow.test.ts` (multi-center selections crawled as attacks that must show no cost); `leaks.positions.slow.test.ts` (new case) |
| RF-3 | high | Back-dated adjustment sums ignored the fold and `costFit`: a unit selection or a level exclusion isolated 1 or 2 people. | FG, D-FIN (d): amounts and the Other HRIS change count come from all adjustments and show at company level only; under a filter or scope both read "—" with the filter's reason, else `COMPANY_ONLY_NOTE`. V: one person's back-dated Other HRIS change moves nothing in Finance, with no filter or under their unit. | `finance.test.ts` (the 5 + 2 fixture, HR admin level exclusion, switch on); `costUnions.slow.test.ts` (adjustment classes); `leaks.positions.slow.test.ts` (new case, HR admin control) |
| RF-4 | high | Targets priced closed months from Working's own lines while Plan read the closes, so a cost center's back-dated raise read at one date. | FG, D-FIN (e): one line rule, `src/plan/lineSource.ts` (`closeLines`, `withClosedMonths`), for Targets and the sample's routing; story 9 re-derived. V: Plan's `shownLines` and `closeLinesOf` now return that helper's own output; a one-date check finds no shown Finance amount, or difference of two, equal to a back-dated raise's closed months. | `src/views/targets/engine/lineSource.test.ts`; new `src/views/plan/engine/lineSource.test.ts`; `leaks.positions.slow.test.ts` (new case; fails with the pre-C33 Targets rule, checked by sabotage) |
| RF-5 | medium | Rule 5 was checked per displayed difference, so cost-center selections recovered bridge steps and FX effects of 1 to 4 contributors. | FG, D-FIN (a) and (c): `globalFold` decides one fold of steps over the company's units per window (a key with 1 to 4 contributors in any unit, or a costed move with nobody counted, folds everywhere); the FX tile comes from the same folded result; each currency's share of a unit's Other is counted by each person's own line currency (`costedByCurrency`). | `bridgeFold.test.ts`, `differences.test.ts`, `fold.test.ts`, `guard.test.ts`; `costUnions.slow.test.ts` (steps, Other changes and FX as (step, position) classes for the company, each unit and each all-units-but-one set) |
| RC-1 | high | Finance's FX effect tile minus Other changes gave one position's cost change (P-2401, 47,086.19). | FG: Other changes never takes in a step another surface publishes (`PUBLISHED_STEPS`, `foldSteps`'s `published`) while another can go; the FX tile shows only when the bridge shows FX as its own step. | `differences.test.ts`, `bridgeFold.test.ts` |
| RC-2 | medium | Heads-vs-plan Readout findings drilled to one side of a net gap, so the rows did not match the number. | VW: the drill lists both sides as positions with a "Counts as" weight; people with no seat (not in the plan, or a second holder) are a count in the detail and the drill note, never names. | `drill.test.ts` (every heads finding: the title's number is the counts-as total plus or minus the people not listed) |
| RC-3 | medium | The rollup-vs-target hero compared a forecast without the leader's own seat with a target that counts it (587.5 against 601). | FG: when a leader's org is compared with its target, the year-end heads include the leader's own seats (`rootSeatsCounted`); note and card say so, and the SVP's delta matches the HRBP's. | `targetHeads.test.ts` |
| RC-4 | medium | Rounded Cost vs target on the Leader home dropped the "people left out" note, and the sign flipped for the CFO. | FG: the tile and its delta card keep the guard's left-out note. | `targetHeads.test.ts` |
| UI-1 | high | Optional fields blank in every row took tier "No data", so every Forecast figure, Plan Overview's loaded cost and most home heroes read "—" on the sample in every mode. | SA: an optional field blank in every row, or a field that applies to no row, takes its dataset's tier; new explanations. | `compute.test.ts`; new `sampleTiers.test.ts` (in all five modes every KPI, hero and figure of Plan, Forecast, Targets, the homes and My team has a tier other than "none") |
| UI-2 | medium | Under a target comparison, monthly and YTD "vs" tiles dropped the comparison silently; PLAN 9.2's empty-state text never showed. | SA: `Kpi.deltaEmpty`; the strip shows "—", the comparison and the reason, and exports carry them. V: Plan's Actual heads, Hires YTD and Loaded cost YTD set `deltaEmpty`, the home-made "The FY28 target has no monthly plan" note is gone, and the home reuses `targetComparisonEmpty`. | `kpiModel.test.ts`, `shellComparison.test.ts`; `src/views/plan/engine/kpis.test.ts` (new case) |
| UI-3 | medium | Picking FY28 Working left the header and export window on FY27 while every figure used FY28. | SA: `PeriodOptions.fiscalYear`; `buildContext` builds the window for the shown version's year (a year not started has empty year and quarter to date, "FY28 has not started yet"). V: Plan's own window takes the same year, so its `windowEmpty` and `windowName` match the header. | `fiscal.test.ts`, `context.test.ts`, `shellComparison.test.ts`; `kpis.test.ts` (new case) |

### Low findings

| ID | Finding | Fix | Tests |
|---|---|---|---|
| RC-5 | Story 8's cost center (1550-HSZ, folded into Corporate's Other) gave the filter note, not the anonymity reason. | VW added a Plan-side reason (`planFitOf`). V: superseded by C33. Under D-FIN (a) every cost-center pick hides cost, a shown center's as well as a folded one's, so the honest reason is C33's note; `planFitOf` is removed and Plan and Forecast give the same note. Flagged for the lead (see the decisions). | `smoke.test.ts` story 8 (1550-HSZ and 1110-SJC, Finance and HR admin, Plan and Forecast) |
| RC-6 | The Unit plan folder headline did not name its comparison. | VW: "heads, vs plan of record (Q1 Reforecast): 566 plan heads". | `home.test.ts` |
| RC-7 | FY28 Loaded cost YTD had no card, and its formula read "Loaded cost from No closed month in this year yet". | V: with no figure the tile gets a card whose one step is the reason, and the formula is the period's empty state ("FY28 has no closed month yet."). | `kpis.test.ts` (new case) |
| RC-8 | The freeze savings card could not be recomputed from what it showed. | FG: one input per held opening (with dates), one stopped-backfills input per freeze, steps openings held + stopped backfills = savings, rows the openings held. | `finance.test.ts` |
| RM-3 | `openShared` showed a file's figures to anyone whose scope label matched, so a namesake manager saw another team. | VW: a scope identity (`scopeKeyOf`: the mode, the Acting as person, the unit and the sorted seats, hashed) in the file header; figures show only for the same mode and key, never by label; `sharedFile.ts` for M3's opener. V: the crawl writes the key and opens files through `openedFileView`. | `shared.test.ts`, `sharedFile.test.ts`; `leaks.manager.slow.test.ts` (new namesake case: Manager B renamed as Manager A sees none of A's figures, seats or requests, while A's own control does) |
| RM-4 | A marks file saved in Manager mode carried every mode's marks. | SA: `listedMarkKeys`, `marksWithin`, `mergeMarksWithin`: a file holds only the mode's listed items and roll-ups, and a load changes only those keys. | `marksScope.test.ts` |
| RM-5 | My team's model carried the plan of record and band costs in Manager mode, and the crawl skipped that field. | VW: `TeamModel.facts` removed. V: the crawl no longer skips `facts`. | `team.test.ts` (whole-model walk); every Manager crawl |
| RR-3 | At a quarter's first close (and after April's) a rounded QTD or YTD was one month's cost per atom. | FG: `ROUNDED_SHORT_WINDOW_NOTE` for a `qtd` or `ytd` window of fewer than two closed months (`costFit`'s `windowMonths`, `guardFigure`, the bridge). | `fit.test.ts`, `shortWindow.test.ts` |
| UI-4 | The Acting as dialog never listed the sample persona first. | SA: `actingAsRows` passes the sample's personas. | `actingAsRows.test.ts`, `shellComparison.test.ts` |
| UI-5 | Requests > New's placeholder told Manager mode about the Queue and "every request on file". | VW: the sentence names only tabs the mode shows. | `render.test.ts` |
| UI-6 | Held-back figures told HRBP, Leader, Finance and Manager to act "in the Data room", a page they hide. | SA: outside HR admin the steps read "ask your HR admin to ...". | `tierModel.test.ts` |

### Browser findings

| ID | Severity | Finding | Fix | Tests |
|---|---|---|---|---|
| B1 | high | Every forecast figure read "No data: Hiring freezes department is missing" in HRBP, Leader and Finance. | SA, with UI-1. | `sampleTiers.test.ts` |
| B2 | high | A filter pinned by one mode's scope followed into the next mode and emptied it (HRBP's unit in Manager mode: "0 of 7 people"). | SA: on a mode or pick change `releasePinned` drops what the previous scope pinned; the tree and unit clamps drop any list filter no position of the scope passes; the "filters still show" toast is gone. | `entry.test.ts` (HRBP, then each other mode, matches a fresh entry), `clamp.test.ts` |
| B3 | medium | Head-count tiles carried the requests dataset's bronze tier. | VW: Actual heads and the heads findings read workers and positions; Hires YTD the same (the planned-hires drill has its own lineage); allocation tiles list only the request fields the allocation reads (since the M2 close-out, none). V: `forecast.heads.yearEnd` keeps its request fields, because the forecast lines read approved Backfill requests. | plan `lineage.test.ts`, home `sample.test.ts`, `team.test.ts` |

## Decisions builders made

The builders' readings, from the M2 build notes and the three fixers' reports, in brief. Most are
also written in their files' headers.

**Freeze (access and cost, UX and views).** `GuardMode` ('none', 'exact', 'rounded', 'open') lives in
`src/cost/guard.ts` because cost/ never imports access/; `guardModeIn` maps the pay table onto it.
Vacancy is a cost component (C31). `ctx.guard.atoms` is the last close's index, else the index at
the last month-end on or before the as-of date. `differenceNote` reads "Hidden to protect
anonymity (fewer than 5 positions changed)". `auditView` takes an optional `requestOf`; `costFit`,
`roundedAmounts` and `leaveShown` take extra parameters (the step comes from `cost.guard.floorUsd`).
`expectGuarded` throws instead of importing vitest. Requests are viewer-shaped `RequestRecord`s;
homes re-link tiles by metric id, with two model-field tiles (`costVsTarget`, `fxEffectYtd`);
`ActionItem.place` is required and carries no amount; the "Counts as" column is `DrillSpec.weight`;
`calcProblems` infers the card type; stubs render nothing.

**Cost guard.** Costed people are the holders of 'hris' and 'offer' lines with an active fraction
above 0; band lines bring nobody. A member's currency is its last line's. Rounded modes leave out
atoms under 5 from every row and show loaded cost only. Per head is the filled part over its costed
people. `financeFold` sorts centers by code, sizes Other by its fewest month, and a unit whose Other
would hold 1 to 4 is left out of every total. A no-change difference reads "—"; `guardedDifference`
without `bandShown` never shows a band figure. A step with no contributors joins Other changes
without pulling a shown step in (since C33, unless it has a costed move).

**Access.** A company-wide leader seat is the tree's top or a seat titled chief executive, financial
or people officer. Leader seats are M2 and above or levels the Levels list marks; Eliminated seats
never are. "Changes to a Filled seat" means every Level and Location change plus Eliminations. In
Manager mode an approvers-only comment never shows. Identifiers, dates and a plain four-digit year
are not amounts. A tree scope narrows the root seats out of the datasets; a unit scope keeps another
unit's requests that touch its positions. HR admin routes no Action center item.

**Shell and UX.** Pages are imported through their public modules; the Actions count is the Action
center's own hook; stub errors read "<label> is not part of this build yet."; the route sweep is a
slow test; H4 and F2 became calculation cards; the rounded card's labels assume the $0.1M step.

**Views.** Working shows closed months from the closes and later months from its own lines. Approved
heads are read on the as-of date inside the version's year, else at its year end. Cohort lines are
spread over seats by share. The bridge reads current membership on both sides (R26), so its
transfers step reads 0 (flagged for the lead against PLAN 6.8 step 7). A rounded tree scope's cost
includes the root seats' atom when the leader filter is the scope's own pin. Run rate is built only
where monthly amounts and components show. Finding thresholds: a gap of 3 or more heads by unit.
Finance > Versions lists a posted month only with a hire, an exit, or 5 or more other changes. A
leader's target row shows only when its org lies inside the leader's org; a sub-org parent's target
is its own org's. Under a target comparison the Unit plan hero compares with nothing and says why,
and the Plan vs actual hero compares with target cost. Homes read this browser's marks. The Audit
page filters by record type and ID; Action center items are collected on the spot.

**Leak tests.** The crawl reads only what the mode shows; the Shareable and Requests files are built
in the testkit from the same guarded outputs and written with the real `buildWorkspaceFile` (the
app's writer is M3's). An ISO code counts only beside a number or as a whole cell; a grouped number
followed by a count word is a count. The 16.1 move rule lets a value move only as an amount over 5
or more costed people or a difference with 5 or more contributors (whole steps in rounded modes; no
component cell after a one-time change). Manager B's planted team is 3 Filled and 2 Open seats; the
Manager C pair removes the Elimination after generation; the back-dated unpaid leave is an Other
HRIS change adjustment.

**Fixers.**

- Finance guard (FG): C33 changed the value of the frozen `FINANCE_FILTER_NOTE` rather than adding a
  constant. HR admin with the switch off keeps `SWITCH_FILTER_NOTE` for leader, department, level and
  location filters. RR-3 applies to `ytd` as well as `qtd`, and to every rounded cost figure under
  such a period, as month and custom already do; the one-month check in `guardFigure` and the bridge
  is skipped under month and custom, where the period note applies. The split shows only on rows
  that are whole units of the gate; exact figures with no gate, or with members of mixed origins,
  show loaded cost only. A line on unpaid leave with no paid twin counts on both sides of each cap.
  A folded step with a costed move but no counted contributor (a leave alone) makes Other changes
  pull in a shown step, in both fold paths. The FX tile keeps the FX formula's value (within a cent
  of the step). `costDiff.slow.test.ts`'s non-vacuity bounds were recalibrated to groups of 2 to 4,
  because no figure reads Working's recomputed closed months since C33; its privacy assertions are
  unchanged. RC-3 counts the root seat in the heads rather than taking it out of the target.
- Shell, access and data (SA): when in doubt, redact ("12.345 standard heads" and "100 200 300" read
  as amounts; a lone code reads "an amount"). Leaving a scope releases only what it pinned; the
  emptying check is per dimension. The "no column means none" exception was not kept for optional
  fields (an uploaded freezes file without department would otherwise blank the forecast again). The
  empty window of a year not started reads "<FY> has not started yet". Frozen-contract additions
  only, no renames.
- Views (VW): heads findings keep the net gap in the title and never name people with no seat. Cost
  to date passes only a close on or before the as-of date to `periodWindow`; heads to date keep
  their window. RM-2 is one rule in `auditModel` (gate on `page:audit`). `ScopedWorkspaceFile` stands
  in for the frozen `WorkspaceFile` until M3. `TeamModel.facts` was dropped, not replaced.

**This verify step (V).**

- RC-5 is superseded by C33: under (a) every cost-center pick hides cost, so a folded center's honest
  reason is the C33 note, as a shown center's is. `planFitOf` was removed so Plan and Forecast agree
  (the views fixer had proposed the opposite for the Forecast). If the lead prefers the anonymity
  reason for folded centers, it belongs in `fitOf` so every view gives it.
- The leave leak test compares the contributor count and list of every row shown in both crawls
  strictly (RR-1's step 4). A row may still show or fold away with 5 or more contributors when a
  leave alone moves a step with nobody counted (RR-1's step 3: such a move never shows as a row of
  its own); see the known gaps.
- Rounded-mode QTD and YTD cost on the forecast read the Plan view's cost months; heads and average
  FTE keep the window's own months, so the RR-2 fix moves no heads figure.
- Plan's period window is the shown version's fiscal year's, as the header's, so FY28 Working's year
  and quarter to date read "FY28 has not started yet" there too.
- The five RM-1 probe texts were not copied into `MANAGER_TEXTS`: `amountSpellings.slow.test.ts`
  already plants them on the same Manager A request and checks every Manager surface and file. What
  every Manager crawl needed was the scanner's grammar, now in `src/testkit/leaks.ts`.
- `auditView` reads the policy's `cost:band` decision to redact assumption values, so the rule
  follows the policy table, not a mode name.
- The positions leak test gained C33's contexts (the RF-4 one-date check, multi-center and
  country-by-units filters, a back-dated Other HRIS change). The cap-split context stays in
  `costUnions.slow.test.ts`'s cap-side classes: a cap-crossing raise moves loaded totals of 5 or
  more, which the move rule allows; the cap attack is a solve at one date, which the classes cover.
- `forecast.heads.yearEnd` keeps its request fields (B3): the forecast's lines read approved Backfill
  requests, so the requests tier is honest there.

## Known gaps carried to M3 (and later)

1. **M3 write paths.** "Open a shared file" (the contract and the testkit reading are pinned:
   `openedFileView`, `sharedFiguresShown`, `scopeKeyOf`), Export Shareable writing `scopeKey`,
   `RequestsModel.new`, What if's model, version lock and reopen (`computeLock` still throws),
   cycle actions, and the Finance assumption-edit refusals (two `it.todo` cases in
   `assumptionEdits.slow.test.ts`).
2. **`WorkspaceFile.scopeKey`.** The frozen type in `src/plan/types.ts` should gain `scopeKey?: string`
   at the M3 freeze; `ScopedWorkspaceFile` stands in until then.
3. **A leave alone can change the bridge's fold.** Contributor counts and lists never move with leave,
   and no leave amount shows on its own, but a step whose only costed move is a leave folds into
   Other changes (and Other changes then pulls in the smallest shown step, or a band step folds), so
   in HRBP and Leader mode a row can show or fold away when one person's leave turns unpaid (seen for
   two leaders on the sample: Other changes appears and Attrition joins it). PLAN 16.1's leave row
   asks for equal row lists; making the fold leave-neutral would put the leave's amount on a row of
   its own (or, in exact modes, open a cross-scope difference), so the lead should decide between the
   structural signal and a new design (for example an always-present Other changes row). Closed by
   C34 in the M2 close-out (below).
4. **C33's consequences for Finance.** No cost under cost-center, legal-entity, country or currency
   filters; the component split rarely shows on the sample; story 5 is not readable through a
   country filter. Plan's and Targets' Finance folds still have two builders (a test asserts they
   agree).
5. **Bridge transfers step.** It reads 0 because both sides use current membership (R26); PLAN 6.8
   step 7 expects transfers there. Closed by R39 in the M2 close-out (below).
6. **Allocation tiles' tier.** My team's allocation tiles still list the approved-request fields the
   allocation reads, so they keep the requests tier until `allocationSeats` reads approved adds and
   eliminations from positions. Closed in the M2 close-out (below).
7. **M4 exports.** The long CSV, control totals and the FP&A load file are M4's; `costDiff`,
   `costUnions` and the component gate already cover the guarded rows they will read.
8. **Browser re-check.** The lead's browser pass found B1 to B3 before the fixes; the homes in light,
   dark and at 375 px have not been re-checked since (this step runs no dev server).
9. **Worker crashes.** Under Node 24.14.1 on Windows a Vitest fork worker sometimes exits with code
   3221225477 (an access violation) in a slow file (seen for `assumptionAffine` and `leaks.leave`
   during this step, and by builders under load). The file passes on its own; nothing in the code
   points at it. Starting the workers with `--max-semi-space-size=64`, as the Vite runs do, is worth
   a try in `vite.config.ts`. The lead made that change for the M2 close-out; no crash recurred in
   its two verify runs (below).
10. **PLAN.md is the lead's.** It does not yet record C33, the readings above, R38's new numbers,
    RR-3, the amount spellings of 8.4 rule 5, scope release on a mode change (8.2), or the tier of
    optional blank fields (listed under "PLAN updates" below).

## PLAN updates for the lead

- 15.2: add C33 (D-FIN (a) to (e) above), with 7.4's filters as whole units, 7.2 rule 1's split under
  (b), the bridge and FX per unit and company with one fold of steps, 9.4's Finance > Versions at
  company level, and 6.9's closed months from the closes; R38 now $57,100,000 with a gap of
  $2,884,668.88; story 5 no longer read through a Finance country filter.
- 15.1: RR-3 (a rounded QTD or YTD of fewer than two closed months reads "—", and every rounded cost
  figure under such a period shows heads); 8.4 rule 5's spellings (which count, and a lone sign or
  code reading "an amount"); 8.2 (leaving a scope releases its pins, and the clamp drops list filters
  that would empty a scope, replacing the "filters still show" toast); data quality (an optional field
  blank everywhere, or a field that applies to no row, takes its dataset's tier); RC-5 under C33;
  RR-1 (contributors leave-neutral, a leave-only move folds); the freeze and build readings above.
- 16.1: the leave row as tested (strict counts and lists; rows may show or fold with 5 or more
  contributors), and the new leak cases (amount spellings, namesake manager, company audit entries,
  to-date windows, C33 contexts).

## M2 close-out (C34, R39, allocation lineage)

Closed on 23 Oct 2026 under three lead decisions taken after the verify above: C34 (the bridge's
shape never reads leave, known gap 3), R39 (the bridge's Transfers step stays a row at 0, known gap
5), and the allocation's lineage (known gap 6, browser finding B3). Two builders did the work, a red
team attacked C34, a fixer closed what it found, and this verify step closed one more leave path of
the same kind, ran `npm run verify` and updated docs/CONTRACTS-M2.md section 6. PLAN.md already
records C34 and R39 (15.1, 15.2); its other updates are listed at the end for the lead.

### What changed

**C34: the bridge's shape never reads leave** (`src/views/forecast/engine/bridge.ts`).

- Everything that decides which rows show and which steps fold reads leave-neutral seats (a position
  with an unpaid month is priced as paid): contributors, whether a step is a band figure, whether
  band seats moved, whether a costed seat moved, the band subtotals and the band positions. Step
  values, start and end keep the real prices, and the steps still add up to the end less the start.
- One fold per mode, comparison and window (`globalFold`), applied in every scope. It is decided over
  the finest sets a mode's scopes can be differenced down to: business units in exact modes (Finance,
  HR admin with the switch off), kept cost atoms in rounded modes (HRBP, Leader). A step's costed part
  folds everywhere when some grain has 1 to 4 positions that moved in it; when the step is one a
  leave alone can move (`LEAVE_MOVABLE`: timing, mix, pay rate, assumption rates) and some grain with
  costed people has none that moved; or, for FX in exact modes, when some unit has 1 to 4 non-USD
  positions that moved in some month (the FX tile reads any month or custom window, and two windows
  less each other are a window). Other changes then takes in whole steps, chosen company-wide, until
  every grain's Other changes holds 5 or more.
- Other changes is always a row of a costed bridge, and a band step's costed rest goes into it, so no
  Rounding bar is left. A scope whose Other changes would hold fewer than 5 positions shows no steps,
  with the anonymity note (no case on the sample).
- Step cards read the bridge as shown (where each step starts on the waterfall), not the engine's
  running totals: in Finance, Attrition's total before less Timing's total after gave Position
  changes' real amount, whose costed part is P-2401's single change ($47,086.19, the RC-1 number).
- Rounded figure note: "Totals are rounded down to $0.1M per team." The bridge step's population text
  in `src/views/forecast/metrics.ts` follows the new fold.

**R39: Transfers stays a row at 0.** Under R26 both sides join the org at read time, so the step reads
0 in every scope. It stays a row with 0 positions and the card note `TRANSFERS_NOTE` ("Moved seats
carry their plan with them, so a move between orgs shows in the other steps, not here."), also in HR
admin with the switch on. Any costed rest of the step (none under R26) goes into Other changes.

**Allocation lineage** (`src/plan/engine/allocation.ts`, `src/views/team/`). `allocationSeats` reads
approved adds and eliminations from the position rows the approvals wrote, never a request.
`AllocationSeatsInput.approvedSinceLock` is replaced by `lockedPositions` (every position the plan
of record has a line for). An add since the lock is a seat whose first row names a request and that
the plan of record has no line for, priced at that first row (left out when it starts after FY end),
in natural request-ID order (`byRequestId`). An elimination since the lock is an approval's
Eliminated row (Eliminated or Traded, a blank reason read as Eliminated, Transferred not) that ends
an allocation seat by FY end (`approvalEndsBy`). My team's allocation figures (Allocation, Filled,
Open, Planned, the Left to fill hero, their drills and standard heads) list no request field:
`ALLOCATION_CHANGE_FIELDS` is `positions.sourceRequestId`, `positions.endReason` and
`positions.endDate`. Left to request and Budget status gain the requests fields they read to filter
pending requests by viewer (`requesterId`, `submittedById`, `steps`), and the hero's Requested part
drills with Left to request's lineage. Edge cases with a new reading (none on the sample): an
approved elimination whose last day is FY end or later no longer removes the seat from this year's
allocation; an add approved on the lock day after the lock time counts; a plan-of-record seat that a
later row reopened after an elimination the lock saw reads as eliminated.

**Attack fixes.**

- A1 (high): the bridge's leave-neutral seats were priced by `src/views/lineSource.ts`
  `paidLineOf` with the Working context at the reporting date, which does not hold people hired
  after it, while the forecast prices them from HRIS. New `src/views/forecast/engine/paidTwins.ts`
  (`paidTwinsOf(run)`, memoized per run) prices each twin from the run's own inputs
  (`runInputOf(run)`, `src/views/forecast/engine/run.ts`): projected months by cost.ts
  `positionLines` on the forecast's line context with leave read as paid, actual months by close.ts
  `actualLines` with leave paid. Every unpaid projected line has a twin equal to the paid run's line.
- A2 (low): Finance's clamp clears a business-unit exclude, so the leave sweep's "Finance with each
  unit left out" scopes were the company bridge again. They now include every other unit, HR admin's
  exclude scopes are added, and a case checks each scope keeps its filter.

**This verify step: the component split read the leave of people hired after the reporting date.**
The A1 fixer flagged that `capSidesOf` (the component gate's cap sides, C33 (b)) still read
`paidLineOf`. A probe confirmed a leak on the unmodified sample: with the reporting date at 30 June,
putting E11679 or E11713 (hired after it) on unpaid leave instead of paid put them on both sides of
every cap, so Operations' forecast component split passed the gate in every month from October (and
over October to December and October to March) only while their leave was paid. On screen,
Finance and HR admin with the switch off, filtered to Operations, read the Forecast's exit run rate
with the leave paid and "—" ("Components hidden (fewer than 5 in a component)") with it unpaid, so
one person's leave was readable from it. The fix is in `src/views/lineSource.ts`: when the Working
context at the as-of date has no twin, `paidLineOf` reads the same context costing every HRIS
assignment (`futureAssignments`, as the forecast does). Every twin found before is kept. This was
checked over every unpaid line of every version and of the forecast, with everyone on leave, at the
default date, 31 August and 30 June, in Finance and HR admin: the forecast lines that had none (108
at 31 August, 480 at 30 June) now have one, none on both sides, and no other line changed.

**Test workers.** `vite.config.ts` starts the test workers with
`execArgv: ['--max-semi-space-size=64']` (the lead's change for known gap 9).

### Tests added

Each fix's test was checked to fail on the code before it (the builders and the fixer swapped the
old file back in; this step disabled its fallback), except `paidTwins.test.ts`, which guards a new
function (the old reading's equivalent missed 108 lines at 31 August and 480 at 30 June).

| Test | Project | What it asserts |
|---|---|---|
| `src/views/forecast/engine/bridgeShape.test.ts` (new, 13 cases) | unit | Every leave flipped to unpaid, and to paid, leaves every bridge's shape equal (Finance, HR admin, each unit, every HRBP, four leaders); single flips in E10247's and E10743's orgs; rule 5 with Other changes always a row and no Rounding bar; no step whole in one scope while folded in another; one fold per mode and comparison; cards read the bridge as shown; the FX month rule; the Transfers row at 0 for the sample's internal move and position move and a constructed Go-to-Market to Operations move (control: the lock-date-row option puts it in the transfers step). Attack A1: hires since 31 August and 30 June on leave either way, every viewer, full year and three windows after the close; Finance's and HR admin's FX tile reads 98 (Silicon Engineering 58) with E11729 either way; the constructed unit with exactly 5 FX movers per month keeps its fold. |
| `src/views/forecast/engine/paidTwins.test.ts` (new, 3) | unit | With everyone on leave, every projected unpaid line has a twin equal to the paid run's line, field by field, at the default date, 31 August and 30 June; actual-month twins; paid lines left alone. |
| `src/views/lineSource.test.ts` (2 new) | unit | At 31 August and 30 June, each hire's unpaid forecast line reads one side of each cap, its paid line's, and every unit's gate is equal paid or unpaid by month, over the year and over October to December and October to March; each of the 40 people hired since 30 June alone leaves every gate equal (non-vacuous: Operations passes). Without the fix: "P-1064, 2026-10, E11729: expected [ …(2) ]" and "E11679". |
| `src/views/team/engine/allocation.test.ts` (new, 3) with `allocation.testkit.ts` | unit | All 243 sample managers' allocations byte-identical to SHA-256 digests pinned on the old code; the same with every approved request removed from the requests (the old code failed for 33 managers). |
| `src/testkit/moves.test.ts` (new, 2) | unit | `MoveRules.strictRows`: a row may show or fold away after a pay change, never after a leave change. |
| `src/plan/engine/budgetStatus.test.ts` (new block), `src/views/team/engine/team.test.ts` (lineage cases rewritten), `src/views/forecast/engine/bridge.test.ts` (rule 5 allows the 0-position Transfers row) | unit | The positions reading of adds and eliminations; allocation figures list no request field. |
| `src/access/leaks.leave.slow.test.ts` (5 new) | slow | Crawls compare row lists strictly (`strictRows`); every scope Acting as reaches (Finance and HR admin by unit, Finance with every other unit included, HR admin with each unit excluded, every HRBP and Leader pick) at fy, ytd, qtd and month with every leave flipped at once either way and each of the 20 leaves alone; at 31 August, the hires since together and alone at fy, ytd, qtd, month and two windows after the close (FX tile 98, non-vacuous); each unit scope keeps its filter (A2). On the old code: E10247 in the strict crawl, E10053, E10743, E11016 and E10247 in the sweep, "=98 -> =97" and "E11729 finance 2026-10-01..2026-12-31" at 31 August. |
| `src/cost/costUnions.slow.test.ts` (extended) | slow | The FX tiles of every window (fy, ytd, qtd, each month) harvested as (position, month) elements, one field per comparison. |

### Attack results (C34)

The red team (probes kept outside the project) found one break and one gap; both are fixed, and its
probes rerun on the fix show no difference.

| ID | Severity | Finding | Result |
|---|---|---|---|
| A1 | high | No paid twin for people hired after a reporting date before the last close (9 at 31 August, 40 at 30 June), so the bridge's neutral seats fell back to the unpaid line. On the unmodified sample at 31 August, Finance's FX tile card read 98 non-USD positions with E11729's leave paid and 97 unpaid (Silicon Engineering 58 and 57, HR admin with the switch off the same), window contributor sets moved in 131 contexts (202 at 30 June), and a constructed unit with exactly 5 FX movers per month gained FX in its fold in 20 exact scopes. | Fixed (`paidTwinsOf`). Probes: 98 either way, no context or scope differs, the fold unchanged. |
| A2 | low | The sweep's Finance "all but one unit" scopes were the company bridge again (Finance clears an exclude). | Fixed (include scopes, HR admin exclude scopes, a filter-kept case). |
| V-1 | high | Found in this step from the fixer's note: the component gate's cap sides read the leave of people hired after a reporting date before the last close. One person (E11679 or E11713 at 30 June) turned Operations' forecast split on or off, and with it Finance's exit run rate for Operations ("—" only while the leave was unpaid). | Fixed (`paidLineOf`'s fallback). Probes rerun: no unit's gate differs for any of the 49 hires alone, and the run rate shows either way. |

What held (the attack ran before the A1 fix): new unpaid leaves for 77 people not on leave (the orgs
of E10247, E10743, E10363 and E10286, Executive Office, 1550-HSZ, Systems & Software FX movers),
singly and in 26 pairs, 9,785 bridge comparisons across 95 scopes; everyone on unpaid leave, 760
comparisons; both comparisons, custom windows, qtd and ytd, and department, level, location,
cost-center, currency, country and two-unit filters, 7,220 comparisons and 381 filtered bridges;
sub-leader include and exclude filters for every leader and HRBP, 216 bridges; band figures to the
cent under every flip, 2,185 comparisons; rule 5 on every row of every scope under all three
comparison settings (Other changes always a row with 5 or more, no Rounding bar, the FX tile equal
to the FX row, company less the other units equal to each unit's row); no exact figure, card input
or difference or sum of two (2,457 figures) equal to a folded part of 1 to 4 (P-2401's $47,086.19;
Corporate's two-person timing, pay rate and assumption rates against the Q1 Reforecast); no figure
or pair isolating any of the 20 leaves; a back-dated unpaid leave adds no one; allocation digests
equal the pre-change capture.

### Story numbers

No story number moved. Step values are unchanged; at the default reporting date every paid twin and
every cap side is the same as before; all 243 managers' allocations are byte-identical, so
`sample.test.ts` and `src/data/sample/README.md` were not edited and pass. What readers see changes
in the bridge's rows only. Exact modes against the Budget show the same rows as before plus
Transfers at 0 (fold: positions, mix, assumption rates; Other changes 1,372 positions). Rounded
modes, and HR admin against the Q1 Reforecast, fold timing, mix, pay rate, assumption rates and
attrition, so rows are the band parts, FX where 5 or more moved, Transfers at 0 and Other changes
(Silicon Engineering's HRBP: Timing band -$1.0M, Position changes band +$0.3M, Attrition band +$0.7M,
Transfers $0, FX +$0.4M with 58 positions, Other changes +$1.8M with 558). Rounded contributors are
counted in kept atoms only, so small rounded scopes count slightly fewer (Executive Office's HRBP
Other changes: 5).

### Worker crashes

None in this step. Both verify runs, with the workers started at `--max-semi-space-size=64`, ran
every file to the end, the slow crawls included (`leaks.leave`, `leaks.manager`, `leaks.requests`,
`assumptionAffine`, `costUnions`), with no fork worker exiting 3221225477. Earlier in the close-out
a builder saw it once, running `leaks.manager.slow.test.ts` and `leaks.requests.slow.test.ts` in one
call; both files passed in both runs here. Two clean runs do not prove the option fixes it, so gap 9
stays a watch item.

### Verify output

Run from the project root with `npm run verify` after deleting `node_modules/.vite`, on Node
24.14.1. Run 1 was on the tree as the builders and the fixer left it: all six steps passed (tests
264 files, 2,834 passed, 2 todo, 928.0 s). Run 2, the final one, after this step's fix and tests,
again from a deleted `node_modules/.vite`:

| Step | Result | Time | Notes |
|---|---|---|---|
| No data files in git | PASS | 0.0 s | "No data files outside src/data/sample/." |
| Type-check (`npx tsc --noEmit -p .`) | PASS | 1.6 s | No errors |
| Lint (`npx biome check src scripts`) | PASS | 1.1 s | 876 files, no fixes |
| Tests (unit, slow, perf) (`npx vitest run`) | PASS | 945.0 s | 264 files; 2,836 passed, 2 todo, 0 failed (vitest: 943.8 s) |
| App build | PASS | 6.6 s | `dist/`: main chunk 2,138.44 kB (695.93 kB gzip), CSS 66.07 kB |
| One-file build | PASS | 6.7 s | `dist-single/index.html` 4,366.09 kB (1,501.42 kB gzip) |

Exit code 0. The summary as printed:

```
Headcount Planner verification
  PASS  No data files in git (0.0s)
  PASS  Type-check (1.6s)
  PASS  Lint (1.1s)
  PASS  Tests (unit, slow, perf) (945.0s)
  PASS  App build (6.6s)
  PASS  One-file build (6.7s)
```

| Project | Files | Tests |
|---|---|---|
| unit | 241 | 2,711 |
| slow | 17 | 110 (108 passed, 2 `it.todo` for M3) |
| perf | 6 | 17 |
| Total | 264 | 2,838 |

Against the verify above: 4 new unit files and 30 more unit tests, 5 more slow cases. No privacy,
leak, attack or perf test was weakened; the leave leak test, the move rule and the cap-side tests
are stricter than before.

### Known gaps after the close-out

Gaps 3, 5 and 6 above are closed. Gap 9: no crash in this step's two runs with the new worker
option (a watch item). Still open, for the lead:

1. **A reporting date after the last close's month.** Settings > Data allows a date up to today. With
   it after the last close's month (for example 15 October 2026 on the sample), forecast.ts takes
   that open month as an actual month (`actualThrough` is the as-of month) and close.ts
   `actualLines` throws "No actual rate for INR in 2026-10.", so the forecast run cannot be built.
   Not changed here (M1's engine; it needs a reading of which rates an open as-of month uses).
2. **The component gate's contributor counts read leave (D-FIN (b)).** `componentGate` counts a
   component's contributors from the line's amounts, so an unpaid month is no base or bonus. No case
   was found on the sample (no gate moved for any of the 49 people hired since 30 June or 31 August
   put on leave alone, nor for the 40 together with the cap check off), but the rule reads leave by
   construction; a leave-neutral count would mirror the bridge's.
3. **An approved Elimination does not rewrite the seat's later dated rows** (requests.ts
   `approvalOf`, unlike `applyTrade`), so a later row can bring the seat back in Working.
4. **Rounded bridges show little detail on the sample** (band parts, FX, Transfers at 0, Other
   changes). That follows from C34 with orgs and atoms of 1 to 4 timing, pay-rate or assumption-rate
   movers; a fold decided over Acting as scopes only would show more but leave differences between
   filters open. A lead call if more detail is wanted.
5. **PLAN updates.** 6.8: "A Rounding bar closes rounded waterfalls" no longer happens on the bridge.
   7.2 rule 5: the bridge's fold is one fold per mode, comparison and window over grains, with the
   FX month rule in exact modes. 6.9 and 15.1 R2: approved adds and eliminations are read from the
   position rows the approvals wrote, with the three edge-case readings above. 16.1: the leave row
   compares row lists strictly; the leave sweep covers a reporting date before the last close and
   Finance multi-unit include scopes. C34's record: the neutral seats are priced from the run's own
   inputs (A1), and the cap sides fall back to every HRIS assignment (V-1).
