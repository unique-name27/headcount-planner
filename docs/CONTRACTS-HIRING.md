# Hiring contracts (frozen 25 Oct 2026)

The contracts for Plan > Hiring, the hiring progress module the owner asked for on 24 Oct 2026
(docs/PLAN.md 9.7 and change C36): open to hire by quarter (approved heads by the quarter end − current
heads − accepted starts by the quarter end), with expected exits, hires needed per month, and hiring
velocity from actual hires and exits (paces, attrition, months to close), plus an Open to hire tile on
the HRBP, Leader and Manager homes. The task called the metric list "9.8"; PLAN numbers it 9.7
("Metrics"), and that list is what is frozen here. Readings and changes in PLAN 15 (R1 to R131, C1 to
C36) override earlier PLAN text wherever they differ; section 5 adds the readings this freeze took.

Builders fill bodies behind these contracts and never rename or retype an export; a builder who needs a
change reports it to the lead (`needsElsewhere`). New exports may be added, and interfaces may gain
optional fields. Every stub throws `notBuilt('<file>.<function>')` (src/plan/notBuilt.ts); stub
parameters carry a leading `_`; the stub component renders nothing. Data (ids, labels, row keys, the
policy decisions, the metric definitions, the help section, glossary terms and tour step, the copy
constants) is written in full and is frozen like a signature.

The freeze adds 21 `notBuilt` stubs (19 in the engine, 2 in the tab model) and one component that
renders nothing (`Hiring`). No existing export was renamed or retyped; four interfaces or lists gained
entries (section 1.7). All 21 stubs and the component are built, and the integration step (section 8)
resolved what the builders left for the lead; `src/views/hiring.contracts.test.ts` now also checks
that no `notBuilt` stub is left in any of the module's files.

**The module is heads only.** No amount, band estimate, offer amount or leave fact may reach it, in any
mode, HR admin with "Show pay amounts" on included: not the engine's input, the tab model, a tile, a
figure, a calculation card, a drill table, a finding, an export or a help sentence.

## 1. Frozen files and their exports

### 1.1 The engine (`src/plan/engine/hiring.ts`, new, pure)

| Export | Kind | What it is |
|---|---|---|
| `HiringSeat` | type | One approved seat in scope from Working: `positionId`, `filled`, `acceptedStart` (date only), `plannedStart` (planned, else the open req's target start), `lastApprovedDay` (the day before an approved Elimination, Trade or move out takes effect; null to FY end). R1's filter (On hold, Eliminated, SC-6 held seats out) is applied before the engine sees it |
| `HiringPerson` | type | An employee active at the as-of date in scope: `personId`, `positionId` (null: not in plan) |
| `HiringOffer` | type | An accepted offer not started: `reqId`, `positionId`, `startDate` |
| `HiringEvent` | type | A hire (on = hire date, the seat hired into) or an exit (on = last day, the seat held on it): `personId`, `positionId`, `on`. Exits after the as-of date are the known exits ahead |
| `HiringHeadsAt` | type | Heads in scope at a closed month-end: `month`, `heads` |
| `HiringForecastMonth` | type | An open forecast month to FY end, heads only: `month`, `starts`, `modeledExits` |
| `HiringInput` | type | `asOf`, `fiscalYear`, `lastClose`, `seats`, `people`, `offers`, `hires`, `exits`, `headsAt`, `forecast` |
| `HIRING_INPUT_KEYS`, `HIRING_INPUT_KEYS_EXACT` | data | Every key of every input type; the type checker holds each list equal to its type's keys, so a field added to an input must be listed, and the contracts test scans every listed key for money, rate, band, pay and leave words |
| `PACE_MONTHS` ([3, 6]), `TRAILING_MONTHS` (12) | data | 9.7's pace windows and the trailing window |
| `QuarterNo`, `HiringQuarterFrame` | types | A quarter (`label` "Q1", `start`, `end`, `kind` 'history' or 'ahead') |
| `HiringHeads` | type | H: `total`, `inApprovedSeats`, `notInPlan`, `elsewhere` (people in a seat that is not an approved head), `personIds`, `notInPlanIds` |
| `ExpectedExits` | type | E(q): `known`, `knownIds`, `modeled` (exact), `total` |
| `PaceStatus` | type | 'on-pace', 'behind', 'nothing-to-hire' |
| `HiringQuarter` | type | One column. History: `actualHeads`, `hires`, `hireIds`, `exits`, `exitIds`. Ahead: `approved` A(q) and `approvedIds`, `accepted` S(q) and `acceptedIds` (req IDs), `open` O(q), `openSeats` and `openSeatIds` (the seat view), `newToHire`, `expectedExits`, `toReachPlan`, `monthsLeft`, `neededPace`, `paceStatus`, `behindBy`. The other kind's fields are null (id lists empty) |
| `HiringTable` | type | `fiscalYear`, `asOf`, `heads`, `openNow`, `quarters` (Q1 to Q4), `openFyEnd` O(FY end), `acceptedToCome` S(FY end) |
| `HiringMonth` | type | A velocity month: `month`, `kind` ('actual' or 'forecast'), `hires`, `exits`, `net`, `hireIds`, `exitIds` |
| `HiringPaces` | type | `hires3`, `hires6`, `exits3`, `exits6`, `net3`, `net6`, `exits12`, `averageHeads12`, `attrition` (a fraction); null where the window lacks closed months |
| `HiringVelocity`, `MonthsToClose`, `HiringResult` | types | The velocity months and paces; `{ closing: true; months }` or `{ closing: false; months: null }`; everything together |
| `hiringQuarters(fy, asOf, lastClose)` | stub | The four frames |
| `firstHeadDay(seat, asOf)` | stub | As-of when Filled, else the accepted start, else the planned or target start, else the as-of date |
| `approvedBy(seats, asOf, end)` | stub | A(q)'s seats: first head day ≤ end, and still an approved head on `end` |
| `currentHeads(people, seats)` | stub | H with its split |
| `acceptedBy(offers, asOf, end)` | stub | S(q)'s req IDs: asOf < start ≤ end |
| `openSeatsBy(seats, offers, asOf, end)` | stub | The seat view: in A(q), not Filled, no accepted start in S(q) |
| `expectedExits(exits, forecast, asOf, end)` | stub | Known in (asOf, end], plus modeled for the months whose month-end is in (asOf, end] |
| `monthsLeft(asOf, end)` | stub | Month-ends after asOf, up to and including end |
| `neededPace(toReachPlan, months)` | stub | ÷ months, null at 0 months |
| `paceStatus(toReachPlan, needed, pace3)` | stub | `{ status, behindBy }` |
| `hiringTable(input, pace3)` | stub | The table |
| `closedMonths(lastClose, n)`, `hiringMonths(input)` | stubs | The trailing closed months; the velocity months (12 closed, then the forecast months to FY end) |
| `perMonth(counts, n)`, `attritionRate(exits, headsAt)`, `hiringPaces(months, headsAt)`, `hiringVelocity(input)` | stubs | The paces and attrition |
| `monthsToClose(openFyEnd, netPace)` | stub | ÷ the net pace while above 0; 0 when nothing is open; else not closing |
| `hiringOf(input)` | stub | Everything Plan > Hiring shows |
| `PACE_EPSILON` (1e-9) | data (engine addition) | Float leftovers of summed modeled exits: to reach plan at or under it is nothing to hire, and a 3-month pace within it of the needed pace is on pace. Nothing is rounded |
| `HiringSeatView`, `HiringQuarter.seatView` (optional) | type and field (engine addition) | The seat view of a quarter ahead, reconciled exactly (null in history): `open = openSeats − notInPlan − elsewhere − inEndedSeats − otherStarts + rest`, with the IDs behind each term. On clean data only open seats and not in plan are non-zero; the O(q) card shows every term |

The engine imports only `@/data/schema` (types) and `../notBuilt`; its builder may add `@/data/fiscal`,
`@/lib/dates` and `./heads` (the contracts test allows exactly these), never a module that carries
amounts (`../types` lines, cost, band, FX, the forecast).

### 1.2 The tab (`src/views/plan/**`)

| File | State | Exports |
|---|---|---|
| `engine/hiringTab.ts` (new) | data and 2 stubs | `HIRING_KPIS` (6 tiles in strip order: `hiring-open` plan.hiring.open "Open to hire", `hiring-accepted` plan.hiring.acceptedStarts "Accepted starts to come", `hiring-pace` "Hires per month, 3-month pace", `hiring-exit-pace` "Exits per month, 3-month pace", `hiring-net-pace` "Net hiring pace", `hiring-months-to-close` "Months to close at this pace"); `hiringOpenLabel(fy)` ("Open to hire, FY27", the headline tile's label, so the homes' re-linked tile reads the same); `QUARTER_KEYS`, `QuarterKey`, `HiringRowKey`, `HIRING_ROWS` (10 rows: the 8 rows of 9.7 for quarters ahead, then "Hires in the quarter" and "Exits in the quarter" for closed ones; Current heads fills both, the closed quarters' cell being actual heads at the quarter end), `HISTORY_NOTE`, `overByText(n)` ("Over by 1"), `ON_PACE_TEXT`, `behindByText(shown)` ("Behind by 0.7 a month"), `NOT_CLOSING_TEXT` ("Not closing at this pace: exits match or outrun hires."), `OPEN_TO_HIRE_NOTE` (My team's note); row types `HiringQuarterRow` (q1 to q4 and per-cell `notes`), `HiringOpenRow`, `HiringVelocityRow`; `PlanHiring` (`fiscalYear`, `kpis`, `findings` 0 to 3, `quarters`, `openByQuarter`, `velocity`, `paceNote`). Stubs: `hiringInputOf(ctx)`, `planHiringModel(ctx)` |
| `engine/figures.ts` | ids added | `PLAN_FIGURES.hiringKpis` 'plan-hiring-kpis', `hiringQuarters` 'plan-hiring-quarters', `hiringOpen` 'plan-hiring-open' (the small bar chart), `hiringVelocity` 'plan-hiring-velocity', `hiringReadout` 'plan-hiring-readout' |
| `ui/Hiring.tsx` (new) | renders nothing | `Hiring()`: no props; reads its own model when built |
| `ui/model.ts` | built | `usePlanHiring()`: `useMemo(() => planHiringModel(ctx), [ctx])` (the stub component does not call it) |
| `index.tsx` | tab added | `tabs`: overview, positions, openings, **hiring** ("Hiring"), transfers; `Body` renders `<Hiring />` for 'hiring' |
| `metrics.ts` | 16 ids and entries added | `ID.hiring*` and `HIRING_METRIC_IDS` (section 1.3) |

Plan > Hiring is **its own model, not a `PlanModel` field** (reading H10): it reads the forecast's
exits, and the plan model's 400 ms budget must not carry a forecast run.

Files the tab builder and the integration added (none renames or retypes a frozen export):

| File | Exports |
|---|---|
| `engine/hiringData.ts` | `hiringPrepOf(ctx)` (per context: the engine input cut to `HIRING_INPUT_KEYS`, and the records behind it), `HiringPrep`, `HiringPersonRow`, `approvedFor(seat, fyEnd)` (R1 for the year shown); from the integration `ruleThreeRows(ctx, scopeIds)`, `hiringForecast(ctx, scopeIds, version?)`, `hiringForecastFlows(ctx, scopeIds, fyEnd)` and `HiringForecastFlows` (readings I1 and I2) |
| `engine/hiringDrills.ts` | `seatsDrill`, `peopleDrill`, `offersDrill`, `listsPeople`, `peopleOf`: every spec hides `HIRING_DRILL_HIDE[kind]` in every mode; Manager mode opens the seats people hold |
| `engine/hiringModel.ts` | `computeHiring(ctx)`: the tiles, the quarter table, the bars, the velocity, the readout and the pace note |
| `engine/hiringTab.ts` | Built `hiringInputOf` and `planHiringModel` (a `WeakMap` per context); from the integration `behindByGap(gap)` and `UNDER_A_TENTH` (reading I4) |
| `engine/lineage.ts`, `engine/lineageNotes.ts` | `FIGURE.hiring*` groups; `HIRING_LINEAGE_NOTES`, apart from `LINEAGE_NOTES` |
| `ui/Hiring.tsx`, `ui/HiringQuarterGrid.tsx`, `ui/HiringVelocityChart.tsx`, `ui/shared.tsx` | The tab, the quarter grid (closed quarters greyed, a Drill or Calc button per cell), the velocity chart (PlotChart: hires up, exits down, net line, forecast months lighter); `openCellOrCard`, `cellOpens` |
| `src/views/tabModels.ts` (integration) | `TAB_MODELS` (`'plan.hiring'` to `planHiringModel`) and `tabModelOf(view, tab)`: the one map of tabs with a model of their own, read by the Shareable file's figures (`src/views/data/engine/snapshots.ts`) and re-exported by the crawl (`src/testkit/crawl.ts`) |
| `src/access/visibility.ts` (integration) | `hiddenByRuleThree(req, viewer)`: rule 3 alone, every mode but HR admin (reading I1) |

### 1.3 Metrics (`src/views/plan/metrics.ts`, the catalog)

The 16 ids of 9.7, after `plan.trade.weight`, each with a full definition, formula, population and
window, owner HR business partners, no settings, no `dependsOn`, no Guard class (no entry in
`METRIC_GUARD`), and a lineage with no pay, offer amount or leave field.

| Id | Name (glossary term) | Unit | Views |
|---|---|---|---|
| `plan.hiring.approvedByQuarter` | Approved heads by quarter end | int | plan |
| `plan.hiring.currentHeads` | Current heads (the count `plan.heads.actual` makes, at the as-of date) | int | plan |
| `plan.hiring.acceptedStarts` | Accepted starts | int | plan |
| `plan.hiring.open` | Open to hire | int | plan, home, team |
| `plan.hiring.openByQuarter` | Open to hire by quarter end | int | plan |
| `plan.hiring.newByQuarter` | New to hire in the quarter | int | plan |
| `plan.hiring.expectedExits` | Expected exits by quarter end | num1 | plan |
| `plan.hiring.toReachPlan` | To hire to reach plan | num1 | plan |
| `plan.hiring.hiresByMonth` | Hires by month | int | plan |
| `plan.hiring.exitsByMonth` | Exits by month | int | plan |
| `plan.hiring.pace` | Hiring pace | num1 | plan |
| `plan.hiring.exitPace` | Exit pace | num1 | plan |
| `plan.hiring.netPace` | Net hiring pace | num1 | plan |
| `plan.hiring.attritionRate` | Attrition (heads) | pct (one decimal: 9.7's "pct1") | plan |
| `plan.hiring.neededPace` | Hires needed per month | num1 | plan |
| `plan.hiring.monthsToClose` | Months to close at this pace | num1 | plan |

`src/metrics/catalog.test.ts` (section 12's table and the data-metric count, 91 → 107) and
`src/metrics/ids.test.ts` (the plan's id list and the id count, 91 → 107) were updated to the new ids;
no other check changed. Every hiring metric shows in every mode (no table hides it).

### 1.4 The policy (`src/access/**`)

| File | Change |
|---|---|
| `ids.ts` | `VIEW_TABS.plan` gains `{ key: 'hiring', label: 'Hiring' }` after Openings; `PLAN_GRID['tab:plan.hiring'] = 'SSSSS'`; new data `HIRING_AT`, `HIRING_FIGURE_IDS` (the five figure ids), `HIRING_KPI_IDS` (the six tile ids), `TEAM_HIRING_FIGURE` ('team-open-to-hire'), `HIRING_DRILL_KINDS` (positions, workers, reqs), `HiringDrillKind`, `HIRING_COLUMNS` (the dated columns its drills read: `positions.plannedStart`, `positions.endDate`, `reqs.stage`, `reqs.targetStartDate`, `reqs.offerAcceptedDate`, `reqs.startDate`, `workers.hireDate`, `workers.terminationDate`), `HIRING_DRILL_HIDE` (positions: bandEstimate, costAnnual; reqs: offerBase, offerCurrency, signOnBonus, relocation, agencyFee, and since the review recruiter and hiringManager, V12; workers: onLeave, leavePaid), `HIRING_SURFACES` (all of the above as surfaces), now part of `NAMED_SURFACES` |
| `policy/manager.ts` | `tabs.plan.hiring = { access: 'shown', how: HIRING_HOW }`; `HIRING_HOW` = "Your team, in heads." (exported) |
| `policy/hrbp.ts`, `leader.ts`, `finance.ts`, `admin.ts` | `hiring: SHOWN` named explicitly (admin's `tabTable(views, { plan: { hiring: SHOWN } })`) |
| `__snapshots__/access-matrix.txt`, `access-how.txt` | Regenerated: +37 grid rows (the tab, 16 metrics, 5 figures, My team's tile, 6 tiles, 8 columns; the three drill kinds were already listed) and +6 sentences (My team's tile hidden outside Manager mode; `workers.hireDate` and `workers.terminationDate` hidden in Manager mode with their kind). No existing line changed |

The decisions: the tab, its figures (on their tab) and its tiles are S in every mode; the metrics show
wherever their views do (every mode); Manager mode lists positions and reqs but never workers, so a
count of people there opens the seats they hold, and every listed kind keeps to the mode's scope
(Manager: "Rows outside your team are left out.", the tree strictly below the seat, R23); My team's
Open to hire tile shows in Manager mode only (its view). `HIRING_DRILL_HIDE` goes on every hiring
drill's `hide` in every mode, so HR admin with the switch on sees no offer amount, band estimate,
annual cost or leave column from this module either.

### 1.5 Homes and My team (`src/views/home/**`, `src/views/team/**`)

| File | Exports |
|---|---|
| `home/engine/figures.ts` | `HIRING_KEY_FIGURE` (`plan.hiring.open` from plan.hiring), `HIRING_TILE_AT` (unit 3: after Openings past target start; rollup 3: after Year-end gap), `HOME_KEY_COUNT_WITH_HIRING` (unit 6, rollup 6, fin 6). `HOME_KEY_FIGURES` is unchanged at the freeze: the builder inserts the slot |
| `team/engine/figures.ts` | `TEAM_HIRING` (`figure` 'team-open-to-hire', `metricId` plan.hiring.open, `view` plan, `tab` hiring). `TEAM_FIGURES` and `TEAM_KEY_METRICS` unchanged (the tile sits beside the hero, not in the 7) |
| `team/engine/index.ts` | `TeamModel.openToHire?: Kpi \| null` (optional; the builder fills it) |

Built by homes-help: `HOME_KEY_FIGURES` holds `HIRING_KEY_FIGURE` at `HIRING_TILE_AT` (Unit plan and
Rollup vs target 6 each, Plan vs actual 6, nothing replaced); `sourceTiles` reads
`planHiringModel(ctx).kpis` for the tab and labels the tile `hiringOpenLabel(fiscalYear)`; the Finance
home never reads Plan > Hiring. `TEAM_FIGURES.openToHire` is `'team-open-to-hire'`, and
`TeamModel.openToHire` is the tab's own tile, re-linked to Plan > Hiring, beside the hero in a one-tile
strip, with its note followed by `OPEN_TO_HIRE_NOTE` (null with no tree or an unset pick). Both homes'
`lineageNotes.ts` have a `'hiring-open'` entry.

### 1.6 Help (`src/help/**`)

| File | State | Exports |
|---|---|---|
| `hiring.ts` (new) | data | `HIRING_SECTION_TITLE` ('Hiring'), `HIRING_SECTION` (the heading, one paragraph, one list of four items, My team's note under `MANAGER`, the role homes' tile line under `ROUNDED`), `HIRING_KEYWORDS`, `HIRING_GLOSSARY` (Open to hire, Accepted starts, Hiring pace, Net hiring pace, Attrition (heads), each with its metric id), `HIRING_TOUR_AT` (4), `HIRING_TOUR_STEP` (Plan > Hiring, target `[data-tour="figure-plan-hiring-quarters"]`, "Open to hire by quarter") |
| `articles/views.ts` | data | `view-plan`: summary and both `without` summaries name hiring progress; keywords gain `HIRING_KEYWORDS`; `HIRING_SECTION` sits between Openings and Transfers |
| `names.ts` | data | `HELP_NAMES` gains `Plan > Hiring` (`tab:plan.hiring`) |

The tour step is not in the `view-plan` tour yet: inserted while the tab draws nothing, the browser
tour check would point at a missing figure. The homes-help builder inserts it at `HIRING_TOUR_AT` once
the quarter table renders (the tour goes from 5 to 6 steps). Built: the step sits at index 4 (6 steps
in every mode), the view-home and view-team tours and articles name Open to hire, and What's new has a
"Hiring progress" note (2026-10-25).

### 1.7 What changed in existing exports, and what did not

- Gained entries: `VIEW_TABS.plan` (one tab), `PLAN_FIGURES` (five ids), plan's `ID` (16 ids) and its
  `metrics` (16 entries), `NAMED_SURFACES` (`HIRING_SURFACES`), `HELP_NAMES` (one phrase), the
  `view-plan` article (section, summaries, keywords), `TeamModel` (one optional field).
- No surface, action, metric, figure, tab, article or tour id was renamed or removed. The folder
  headline (approved heads) and every other home's key figures are unchanged. `src/app/**` needed no
  change: the shell draws tabs from the registry, the route guard reads the policy, and the
  whole-view export reads each tab's registered figures.

## 2. Who owns what

One owner per file. An owner may add files inside its folders; a file outside them is a
`needsElsewhere` for the lead. The lead owns the docs, `src/views/types.ts`,
`src/views/contracts.test.ts` and `src/views/hiring.contracts.test.ts` (this freeze's check).

| Owner | Folders and files |
|---|---|
| engine | `src/plan/engine/hiring*.ts`: the bodies of `hiring.ts`, `hiring.fixtures.ts` (HG1), `hiring.test.ts` |
| tab | `src/views/plan/**`: `engine/hiringTab.ts` (`hiringInputOf`, `planHiringModel`, tiles, figures, drills, cards, findings, the pace note), `engine/lineage.ts` and `lineageNotes.ts` entries for the hiring figures, `ui/Hiring.tsx`, the tab's tests |
| homes-help | `src/views/home/**`, `src/views/team/**`, `src/help/**`, `src/metrics/**`: the homes' slot, My team's tile, the tour step, the glossary and help checks, any per-mode metric wording |
| checks | `src/data/sample/sample.test.ts` (additions), `src/access/**`, `src/testkit/**`: the sample's pinned numbers, the leak crawl and leak tests over the tab, the policy test additions |

## 3. What each owner satisfies and tests

Every rule gets a test, and each test fails on the stub or on the bug it guards.

| Owner | Satisfies | Tests it writes |
|---|---|---|
| engine | 9.7 Definitions, Hiring velocity, fixture HG1; 6.1 (the last day counts) | `hiring.test.ts` on `hiring.fixtures.ts`: HG1 exactly (A(Q3) = 8, H = 7, S(Q3) = 1, O(Q3) = 0; A(Q4) = 10, S(Q4) = 1, O(Q4) = 2; seat view Q4 = 3 open seats − 1 not in plan = 2; O(Q2) = 6 − 7 − 0 = −1; hires 3, 1, 0 and exits 0, 1, 1 in the last 3 closed months: pace 4/3, exit pace 2/3, net 2/3; months to close 3.0; headline 2). One case per function with a negative control: `firstHeadDay`'s order and the no-date rule; `lastApprovedDay` takes a seat out of later quarters; an accepted start on the as-of day is not in S(q) and one after FY end is not either; a quarter ending on the last close's month-end is history (as-of 30 Sep 2026 with September closed: Q1 and Q2 history); `monthsLeft` at a month-end and mid-month; needed pace null at 0 months; the three pace states; `perMonth` null under n months; attrition null under 12 closed months or 0 average heads; months to close closing, not closing and 0; new to hire's first quarter against `openNow`; `elsewhere` counted in neither part; the identity O(q) = open seats − not in plan when `elsewhere` is 0, every Filled seat has one holder, no Filled seat leaves A(q) before the quarter end (`lastApprovedDay`) and every accepted start in S(q) is on an unfilled seat in A(q) (a sweep over generated seats; otherwise `seatView` names each further term: `inEndedSeats`, `otherStarts`, `rest`); E(q) exact, unrounded; the input is not mutated (frozen input), and the same input gives the same output |
| tab | 9.7 Screen and Privacy; 9.5 (drills, cards); 9.1 (cached model, thin UI) | Per mode on the sample: 6 tiles in `HIRING_KPIS` order, each with `metricId`, `uses` and a `drill` or `calc`; every counted cell's drill has `rows.length === value`, every modeled card's last step equals the value; every drill's `hide` contains `HIRING_DRILL_HIDE[kind]` (HR admin with the switch on included); Manager's people counts open positions; no amount in the model (`JSON.stringify` holds no currency sign, ISO code, grouped number or key named usd, local, band, offer, salary or leave); "Over by n" on a negative cell and never a target; 0 to 3 findings naming positions; the model cached per context; consistency with Openings (open seats), Plan > Overview (actual heads = current heads) and the forecast (expected exits); the tab renders in every mode (`renderToStaticMarkup`) with its titles; the ui file names `metric=`, `uses=` and `definitions={definitionsOf(` on every figure; lineage entries and the lineage probe; a perf budget for `planHiringModel` beside `smoke.perf.test.ts` |
| homes-help | 9.7 Homes and Help; 9.3; 14.2 | Unit plan and Rollup vs target strips of 6 with the tile at `HIRING_TILE_AT`, labelled "Open to hire, FY27", linking to Plan > Hiring; Plan vs actual unchanged; My team's tile beside the hero with `OPEN_TO_HIRE_NOTE`, `TEAM_FIGURES` gaining 'team-open-to-hire' and the team rules test drawing it; the home lineage notes for the tile; the tour step inserted (6 steps, at least 3 in every mode, `tourTargets.slow`); the glossary terms in every mode's glossary; `view-plan` passing `articleProblems` and `namesHidden` in every mode |
| checks | 9.7 Fixtures (sample), Privacy; 16.1 leak rows | `sample.test.ts` pins Plan > Hiring for Silicon Engineering (HRBP), Chun-Hsien Kuo's org (Leader), the whole company (Finance) and Sebastian Wagner's team (Manager): every row of the quarter table and the paces, by independent code from raw rows in the test, consistent with Openings, My team's left to fill and the forecast's exits. The crawl reads `planHiringModel` under tab `plan.hiring` with its cards, drills and exports in every mode; Manager A, B and C (C's crawl byte-equal with and without the confidential Elimination; B's byte-equal across one salary, one offer and one leave change); the HRBP, Leader, Finance and HR admin hiring parts byte-equal across every amount perturbation of `leaks.positions` and every leave flip of `leaks.leave` (heads only: nothing moves); a request hidden by 8.4 rule 3 moves no hiring count; `policy.test.ts` covers `HIRING_SURFACES` |

## 4. Rules every owner keeps

- Windows; `npx tsc --noEmit -p .`, `npx biome check <paths>` and `npx vitest run <paths>` only, with
  `HCP_TEST_WORKERS=4`; never `npx vite` or a dev server; `npm run verify` only when the task says so.
  A worker that exits with 3221225477 or 3221226505 is rerun alone before its file is judged.
- Never `git add`, commit or push; never write "census" in `src/`.
- Copy: sentence case, no em dash between words, no "!", no emoji, no nagging verbs, plain counts
  ("1 head"), "Open to hire" (never "headcount to hire"), no "leave" in anything Manager or Finance
  mode reads.
- Never weaken a privacy, leak, attack or perf test; when one fails, fix the model.
- Notes go to the session scratchpad's `hiring/<label>.md`.

## 5. Readings frozen with the contracts

| # | Topic | Reading taken |
|---|---|---|
| H1 | History or ahead | A quarter is history when it ends on or before the last close's month-end, else ahead. At the sample's as-of date (30 Sep 2026, September closed) Q1 and Q2 are history and Q3 and Q4 ahead; the "quarter holding the as-of date" is ahead only while its last month is open |
| H2 | First head day | Filled: now. Else the accepted offer's start, else the planned start, else the open req's target start. A seat with none of these is open to hire now. A seat counts in A(q) only while it is still an approved head at the quarter end (`lastApprovedDay`), so an approved Elimination effective in Q3 leaves Q4, and A(Q4) is then R1's approved heads less that seat (the O(q) card names the count, V6) |
| H3 | Which seats | Working's seats for the shown version's fiscal year, whatever version the picker shows: the module tracks hiring against the live plan; the picker's fiscal year picks the quarters |
| H4 | Open now | New to hire's first quarter ahead counts against open to hire on the day before it starts: approved heads whose first head day is on or before the as-of date, less current heads (no accepted start is due yet), for the quarter holding the as-of date; for a later year shown, O on the prior year's last day (V4, `HiringTable.openBefore`) |
| H5 | Expected exits | Known: last days in the HRIS after the as-of date and on or before the quarter end (drillable people). Modeled: the forecast's modeled exits for the open months whose month-end falls in that span. Exact in the engine; one decimal on screen. When the as-of date is a month-end, known + modeled equal the forecast's own over the same months (a sample check) |
| H6 | Months left | Month-ends after the as-of date, up to and including the quarter end; at 0 the needed pace is null ("—") |
| H7 | Pace status | To reach plan of 0 or less: nothing to hire. Else on pace when the 3-month hiring pace is at least the needed pace, else behind by the difference (one decimal) |
| H8 | Paces and attrition | A pace needs its 3 or 6 closed months, attrition 12 closed months with heads at each month-end; average heads is the mean of those 12 month-end heads. With fewer, "—" |
| H9 | Months to close | Nothing open to hire (O(FY end) ≤ 0): 0. Net pace 0 or below: "Not closing at this pace: exits match or outrun hires." Missing (no 3 closed months): "The pace needs 3 closed months" (V9). The `MonthsToClose` type is unchanged: the model tells the two apart by the net pace |
| H10 | Its own model | `planHiringModel(ctx)`, cached per context, not a `PlanModel` field (the plan model's 400 ms budget; it reads the forecast) |
| H11 | Manager's home | The Open to hire tile sits under the hero Left to fill (`TEAM_HIRING`, `TeamModel.openToHire`), not in the 7 key figures, so 9.3's 5 to 7 rule holds; HRBP and Leader go from 5 to 6, Finance stays 6. Help says "under Left to fill" everywhere (V18) |
| H12 | Manager's people records | Manager mode lists no workers (`drill:workers` H), so H, hires and exits there open the seats the people hold (positions), and accepted starts open reqs with dates only |
| H13 | Heads only in HR admin too | Every hiring drill hides `HIRING_DRILL_HIDE`, also with "Show pay amounts" on. A position card opened from a row follows its own rules (it is not part of this module) |
| H14 | Velocity scope | A hire counts for the seat the person was hired into, an exit for the seat held on the last day, against the scope's positions at the as-of date; internal moves and transfers are neither |
| H15 | Velocity's forecast months | After the trailing 12 closed months, the open months to FY end show the forecast's expected starts as hires and known plus modeled exits as exits, drawn lighter |
| H16 | Glossary term | 9.7's "Accepted start" is the catalog entry "Accepted starts" (the glossary is the catalog's names) |
| H17 | Units | 9.7's "pct1" is the `pct` format (one decimal); expected exits, to reach plan, needed pace, the paces and months to close are `num1` |
| H18 | Current heads | `plan.hiring.currentHeads` is its own catalog entry with the count `plan.heads.actual` makes at the as-of date (9.7's "alias"), so the quarter table's row has a definition of its own |
| H19 | History, extended (engine) | A quarter is also history when it ends before the as-of date while one of its months is still open (before the first close, or an as-of date ahead of the closes). Read literally, H1 would make it ahead with every Filled seat out of A(q) (a Filled seat's first head day is the as-of date), so O(q) would read "Over by" almost everyone. Its actual heads are `headsAt` at its end, or null when that month is missing. Wherever H1 decides, the result is H1's |
| H20 | Closed months (engine) | A closed month is any month on or before the last close; the 12 trailing velocity months are the 12 calendar months up to it. Attrition needs `headsAt` at each of those 12 month-ends; with one missing, the average and attrition are null |
| H21 | One head each (engine) | A person counts once however many people records name them, split to an approved seat first, then not in plan, then elsewhere. An accepted offer counts once per req ID |
| H22 | Starts after FY end (engine) | An accepted start after the FY end keeps its seat out of every A(q) and its req out of every S(q), so it moves no O(q); A(Q4) is then R1's approved heads less those seats |
| H23 | A past year (engine) | O(FY end) and S(FY end) are 0 when Q4 is history (a past fiscal year shown) |
| H24 | Velocity's forecast months (engine) | The forecast months after the last close, up to the shown year's FY end, one per month; their exits are the HRIS last days in the month plus the modeled exits; `hireIds` are empty. `neededPace` is not clamped: below 0 when to reach plan is, and the status then reads nothing to hire. An accepted start on the as-of day is never in S(q); if the HRIS lags and the seat is not Filled, the seat counts as open to hire, and the seat view agrees |

### 5.1 Readings the builders and the integration took

| # | Owner | Topic | Reading taken |
|---|---|---|---|
| T1 | tab | Seats | The scope's positions on the as-of date that are approved heads for the shown fiscal year (R1 tested against that year's last day). For FY27 exactly `seatsOnDay(p).approved`. The planned start is `SeatDetail.plannedStart`, the start the approved-head test reads, so A(Q4) equals R1's approved heads on the sample (tested equal to Plan > Positions), less any seat an approved change ends before the FY end (V6) |
| T2 | tab | Last approved day | The day before the first later row (to the FY end) from which the seat stops being an approved head; an Eliminated row ends its seat the day after its `endDate` (R34) |
| T3 | tab | Hires and exits | A hire is the worker row whose assignment starts on its hire date, into a seat in scope. An exit is the worker row in a seat in scope whose assignment holds `terminationDate`, so a move is neither (H14). Each is keyed by the person and its day, so a rehire's stints are each a hire and an exit (V3). Known exits ahead are exits after the as-of date, with the further ends V2, V5 and V11 add |
| T4 | tab | Heads at a closed month-end | The month's close where the plan has one (`closeHeadsIn`), otherwise the HRIS employees active on the month-end: the 6 trailing months before the sample's first close, so attrition has its 12 month-ends (company 9.4%) |
| T5 | tab | Forecast months | The Working forecast's projected months up to the shown FY end, with the starts and modeled exits of `forecastFlows` (src/views/forecast/engine/heads.ts). The last close is the plan's last close on or before the as-of date (V10, superseding "the plan's"); a closed month after the as-of date reads as a month ahead with its actual flows. Extended by I2 |
| T6 | tab | Tiles | All six tiles open calculation cards, as 9.7 screen 1 asks; a counted card lists its records too |
| T7 | tab | Pace cards | A pace card lists its 3 months' hires or exits, each counting 1/3; a forecast month's starts list seats weighted by start probability; expected-exit cards list seats weighted by known exit plus modeled exits |
| T8 | tab | Manager's records | A count of people opens the seats they hold (weighted when two share a seat); a count that includes someone not in plan opens a card instead (H12) |
| T9 | tab | Readout | At most 3 findings, by severity, then in this order: exits outpace hires (net3 below 0); open to hire not closing at the 3-month pace, or closing after the FY end; the first quarter ahead behind by 0.5 a month or more; openings past target start (Plan > Openings' list); over plan at FY end. In Manager mode no hire or exit date shows beside a seat |
| T10 | tab | Card numbers | Card expressions write numbers ungrouped ("1610 − 1456 − 22"); prose puts a count word after a grouped number, so a company-wide count never reads as an amount (`amountsIn` passes in every mode) |
| T11 | tab | Lineage | Open to hire's lineage leaves out `reqs.reqId` (it is Accepted starts' and the quarter table's), which keeps My team's lineage probe for `hiring-open` passing |
| T12 | tab | Column labels | "Q1, Apr to Jun (closed)" and "Q3, Oct to Dec"; a quarter that is over with a month not closed reads "(ended)" (V8); the table's text column is `notesText` ("Q3: Behind by 7.9 a month.") |
| W1 | homes-help | Tiles | No tile was replaced on any home: HRBP 5 to 6, Leader 5 to 6, Finance 6 (never calls `planHiringModel`), My team 7 with Open to hire under the hero (H11) |
| W2 | homes-help | Label | The homes and My team label the tile `hiringOpenLabel(fiscalYear)` themselves; value, card, uses and note are always the tab's own, nothing recomputed |
| W3 | homes-help | My team's note | The tab's own note ("Over by 1", "2 open seats", or "14 open seats less 2 people not in plan"), then ". " and `OPEN_TO_HIRE_NOTE`; `OPEN_TO_HIRE_NOTE` alone when the tab has none |
| W4 | homes-help | No tree | My team skips the tile, and does not call `planHiringModel`, when the scope is null or the pick is unset (an unset pick holds an empty tree) |
| W5 | homes-help | Layout | A one-tile KpiStrip after `team-kpis` in page order: under the hero at lg, beside it at md, straight after it on a phone. It names its own tour target (`data-tour="team-open-to-hire"`, V17), so the key figures are the page's one `kpi-strip` in both layouts |
| W6 | homes-help | What's new | The home-tile items avoid the phrase "My team", because the trust test reads every item in every mode, gated ones included |
| W7 | homes-help | Lineage notes | The tile's notes reuse the plan's shared notes (START, END, KIND, ELIMINATED_END, PLANNED_START_IN_YEAR, REQ_AS_OF) |
| K1 | checks | Crawl | The crawl reads a tab with a model of its own through `TAB_MODELS`, wrapped in `safe()`, so a stub or a throw shows as a crawl error, never a skipped tab; `CrawlOptions.tabs` narrows a tabbed view to some tabs |
| K2 | checks | Heads-only scan | Outside Manager mode the scan flags money, band, per-head and component tags, amount keys, currency signs and codes, the data's pay values, record kinds other than positions, workers and reqs, the `HIRING_DRILL_HIDE` labels, and leave keys, metrics and the word "leave". It skips the export header every file of the mode carries and positions' own titles; counts of 1,000 or more are counts. Manager mode also runs `amountHits` |
| K3 | checks | Own seat | "Nothing about a manager's own seat" means no row, cell, finding or card for it and nothing of any seat above or its holders; the own seat's ID and the manager's name may read in "Reports to" on the team's own seats, as every drill already shows |
| K4 | checks | Pending requests | A pending request moves no hiring count in any mode (the tab reads approved Working seats only), checked with every pending request removed |
| K5 | checks | Velocity's heads | The closed months are the 12 ending at the last close, even before the first close record; the independent recompute reads HRIS heads there and checks them equal to the closes for April to September |
| K6 | checks | Modeled exits | Not recomputed: read from `forecastFlows`, pinned to 4 decimals, and known + modeled checked against the forecast over the same months (H5) |
| K7 | checks | Perturbations | `positionPerturbations` and `leaveChanges` moved word for word to src/testkit/perturbations.ts, so the hiring leak test reads the lists the positions and leave leak tests read; no assertion changed |
| I1 | integration | Rule 3 and the forecast | A request 8.4 rule 3 hides from the viewer (one on the viewer's own seat or a seat above, such as Manager C's Elimination) never moves a count, its effects included (9.7 Privacy). Its plan rows sit outside the scope, so no seat, head or offer reads them, but the forecast's HRIS cohort nets each org's known exits against its modeled exits: the holder of a seat an approved Elimination ends (clipped at its last day, R34) is a known exit in the cohort the tree belongs to, and lowered the tree's modeled exits that month. Plan > Hiring therefore reads the Working forecast without the plan rows of requests rule 3 hides from the viewer, on seats outside the scope (`ruleThreeRows`, `hiringForecast`), in every mode but HR admin. With no such row (HR admin always, and every persona's own scope on the sample) it is the Forecast view's own run, the same object. Inside the scope nothing is left out, so a mode whose scope holds the touched seat reads the approved state as its other tabs do |
| I2 | integration | A later year's open months | For a later fiscal year shown (FY28 Working, whose grid starts in April 2027), the open months before the shown forecast's grid come from the as-of year's Working forecast, so E(q) runs from the as-of date (H5) and the velocity has no gap after the last close (H24): FY28 shows 18 forecast months, October 2026 to March 2028. Each month is read from one forecast only |
| I3 | integration | Forecast months' starts | A forecast month's hires are the forecast's expected starts (probability weighted, accepted offers 1), not its modeled backfills (H15 and 9.7 screen 3, "forecast starts and expected exits"): the backfills the expected exits make are what to hire to reach plan already adds (O(q) + E(q)), so the forecast months' net is not the forecast's change in heads |
| I4 | integration | Behind by less than a tenth | A quarter behind its needed pace by under 0.05 a month reads "Behind by less than 0.1 a month" (`behindByGap`), never "Behind by 0.0 a month" |
| I5 | integration | Shareable files | A Shareable file carries Plan > Hiring's figures from `planHiringModel`, read through src/views/tabModels.ts, the map the crawl reads, so a file holds what the crawl and the screen hold; a tab model that throws leaves only that tab out |
| I6 | integration | Plain counts in cards | A card's expression writes its count word after the ungrouped number with the plural rule: "1 offer", "2 offers" |

### 5.2 Readings the review fixes took (25 Oct 2026)

The review of the built module (findings HN-1 to HN-11, HU-1 to HU-14, HP-1 to HP-5; docs/M4-REPORT.md
"Hiring progress") was fixed with these readings. Each has a test that failed before its fix
(src/views/plan/engine/hiringReview.test.ts unless named).

| # | Finding | Reading taken |
|---|---|---|
| V1 | HN-1, HU-11, HU-13 | The seat view's note and step name only the terms that are not 0, each in its own words ("138 open seats less 6 people not in plan and 1 person in a seat that ends by the quarter end"; "2 open seats"; "No open seat"), so the numbers always work out to open to hire. "The rest" shows only when it is not 0, as what it is ("1 second holder or offer on one seat", "1 Filled seat with no current head on it") |
| V2 | HN-2 | The holder of a seat an approved Elimination or Trade ends is a known exit on the seat's last day, read from the assignments clipped at it (R34), in the tab and in the Forecast view's flows alike (`exitDaysOf`), so the forecast and E(q) agree (H5) and approving the Elimination moves to reach plan by the change in modeled exits alone. A later HRIS last day of the same stint is that one exit |
| V3 | HN-3 | Hires and exits are keyed by person and day (`eventKey`), and the drills read rows by event (`eventRows`): Q1 + Q2 hires are Plan > Openings' Hires YTD with a rehire, and E(q) is the forecast's known + modeled |
| V4 | HN-4, HU-9 | New to hire's first quarter ahead counts against O on the day before it starts (open now for the quarter holding the as-of date): FY28 reads 0 in every quarter on the sample, and FY27's and FY28's new to hire add up to O(FY28 end) − open now. A finding in a year that does not hold the as-of date names the year ("Q1 FY28 end") |
| V5 | HN-5 | An approved internal move the HRIS has not recorded puts the mover on the receiving seat from its effective date: in effect, the mover is a current head there (the seat counts as Filled) and not on the held seat; ahead, a move out of the scope is a known exit (the day before) and a move into it a start in S(q) that is not an offer (`HiringMoveIn`, ID `move:<person>|<day>`), the seat taken from that day as an accepted start takes it. A move the HRIS dates ahead reads the same: the move out is the forecast's known exit, the move in a start. A move inside the scope moves nothing, and a request rule 3 hides is never read. Each unit then reads the same before and after the HRIS records the move |
| V6 | HN-6 | A(Q4) is R1's approved heads less seats an approved change ends before the FY end (H2) and seats whose accepted start is after it (H22); the O(q) card names each count ("Seats an approved change ends by 31 Mar 2027 (not counted)") |
| V7 | HN-7 | To reach plan below 0 reads "Over by 0.8" beside the value; hires needed per month shows 0 with "Nothing to hire" where there is nothing to hire (the engine's value stays below 0, H24) |
| V8 | HN-8, HU-3 | `HiringQuarterFrame.closed` (an addition): a history quarter is "(closed)" only when a close covers its end, else "(ended)", its heads read from the HRIS at its end, and the table's note says so. When the year's last quarter is history, the open and accepted tiles read "FY27 is over" with no arithmetic, and their cards end at 0 |
| V9 | HN-9, HU-1, HU-2 | With no 3 closed months, Months to close and the pace tiles say "The pace needs 3 closed months" (the tiles' note "The 3-month pace needs 3 closed months", their formula with no "0 ÷ 3"); "Not closing at this pace" stays for a net pace of 0 or below |
| V10 | HN-10 | The module's last close is the plan's last close on or before the as-of date (`lastCloseOnOrBefore`); a later close's months read as months ahead with their actual flows, so nothing counts in a history column and a column ahead at once, and the paces read the months before the as-of date |
| V11 | HN-11 | A person not in plan with a last day after the as-of date is a known exit with no modeled part (E(q) is the forecast's known + modeled + these last days); the exits card names them, and lists no seat for them |
| V12 | HP-2, HP-4, HP-5 | `HIRING_DRILL_HIDE.reqs` gains recruiter and hiringManager: an accepted offer lists IDs, status, stage and dates only, in every mode. The drill table drops a spec's hidden keys from its rows as well as its columns (src/drill/records.ts), so no hidden amount stays in a row |
| V13 | HP-1 | In Manager mode the forecast nets the tree's modeled exits over the tree alone: `ForecastInput.ownCohort` (an addition) gives the tree's seats an org of their own per unit and department, with the same drivers, and `forecastRunOf`'s `ownCohort` option makes one run per seat set, kept apart from the shared runs and only the last 4 at a time (each is a full run of tens of MB; keeping one per Manager scope and copy of the data ran a Manager leak crawl out of memory). Manager mode's E(q) and Sebastian Wagner's sample check read that run; other modes keep the Forecast view's. Leak case: Managers A, B, C and the manager below C byte-equal across a last day on the own row, every holder above and a same-department peer (src/access/leaks.hiring.slow.test.ts) |
| V14 | HU-4 | The velocity chart's keyboard stops are every month's hires bar, then every month's exits bar, each with its part and box (`velocityKeyPoints`), so Enter opens an exits bar's records or card (src/views/plan/ui/hiringUi.test.ts) |
| V15 | HU-5, HU-6 | A quarter grid button is named "<measure>, <quarter>: <value>. Show the records" (or "Show how it is worked out"); a closed quarter's heads cell "Heads at the quarter end, <quarter>: <value>". The open to hire bars are named "Open to hire at each quarter end" (no unit, so "1 heads" never reads) |
| V16 | HU-8 | `Kpi.calcWhenEmpty` (an addition): a hiring tile with no value still opens its card, named "<label>: show why there is no value"; other tiles keep the null gate |
| V17 | HU-7 | `KpiStrip`'s `tour` prop (default "kpi-strip"); My team's Open to hire strip names "team-open-to-hire" (src/views/team/ui/TeamPage.test.ts) |
| V18 | HU-10, HU-12, HU-14 | Hires needed reads "Backfills only" where nothing is open to hire and the gap is under half a hire a month; Current heads' records and the O(q) card give the split ("1,450 heads in approved seats and 6 people not in plan."); help places My team's tile "under Left to fill" (src/help/hiring.test.ts) |
| V19 | (found by the verify run) | A blank req ID is a req, never a move in (`isMoveIn` reads only strings): the home lineage probe blanks `reqs.reqId` in every row, and the tab must still build (hiringReview "data with blank req IDs") |

## 6. The freeze check

Run from the project root on 25 Oct 2026 (Node 24.14.1), after the last change of the freeze:

| Check | Result |
|---|---|
| `npx tsc --noEmit -p .` | Clean, no errors |
| `npx biome check src scripts` | 1,140 files checked, no findings |
| `npx vitest run src/views/hiring.contracts.test.ts` | 1 file, 25 tests passed |
| `npx vitest run --project unit` (`HCP_TEST_WORKERS=4`) | 359 files, 3,662 tests passed, 0 failed (223 s), no worker crash. The new freeze check is one of those files; the access snapshots, `catalog.test.ts` and `ids.test.ts` were updated to the new ids |

`src/views/hiring.contracts.test.ts` (new, 25 cases) checks: every engine input key, held equal to its
type by the type checker, names no money, rate, band, pay or leave (with a negative control), and the
engine's source names no pay, offer or leave field and imports only the allowed modules; the tab sits
after Openings in the registry and `VIEW_TABS`, shown in every mode (SSSSS, Manager's "Your team, in
heads."); every hiring surface has an explicit decision in every mode, figures and tiles shown on
their tab, positions and reqs listed everywhere and workers everywhere but Manager mode, the dated
columns following their kind, My team's tile Manager-only; `HIRING_DRILL_HIDE` covers every amount,
band and leave column of its kind; the 16 metric ids in the plan's order with their units, views,
owner, wording, no guard class, no pay or leave lineage and no amount, shown in every mode; the tile,
row and copy data; the homes' slot and My team's companion tile (valid frozen and built: the homes are
checked at 5 or at 6 with the tile in its slot, and Manager stays at 7); the Hiring section between
Openings and Transfers, `Plan > Hiring` in the names scan, the glossary terms as catalog names, the tour
step on the quarter table with the tour at 5 or at 6 with the step in place; and the copy rules and
sentence case on every string the freeze adds. The access snapshots were regenerated (1.4); no
existing test reaches a stub. The slow and perf projects were not run (they read no hiring contract;
the crawl does not yet read the tab, whose `PlanModel` part is undefined and skipped). Copies of every
existing file the freeze changed, as they were before it, are in the session scratchpad
(`hiring/freeze-backup/`).

## 7. Open items for the lead

Each item as the freeze listed it, with where it stands after the integration (section 8).

1. **`src/views/contracts.test.ts`** asserts "7, 5, 5 and 6 key figures". When homes-help inserts
   `HIRING_KEY_FIGURE`, that line must read 7, 6, 6 and 6 (the lead's file); `HOME_KEY_COUNT_WITH_HIRING`
   holds the new counts. **Done**: the test reads 7, 6, 6 and 6, checks each home against
   `HOME_KEY_COUNT_WITH_HIRING`, the tile at `HIRING_TILE_AT`, and that neither Plan vs actual nor My
   team's 7 hold it.
2. **PLAN 9.3** says "Manager 7, HRBP 5, Leader 5 per R16, Finance 6" and lists the key figures; with
   C36 HRBP and Leader have 6 (Open to hire after Openings past target start, and after Year-end gap),
   and My team's tile sits beside the hero (H11). **PLAN 15** gains readings H1 to H18. **Open**: the
   integration may edit this file and `src/` only, so docs/PLAN.md still needs 9.3's counts sentence
   ("Manager 7, HRBP 6, Leader 6, Finance 6"), the two key figure lists, My team's tile with
   `OPEN_TO_HIRE_NOTE`, and PLAN 15's readings H1 to H24, T1 to T12, W1 to W7, K1 to K7 and I1 to I6
   (section 5 here).
3. **ARCHITECTURE.md** lists the Plan view's tabs nowhere by name, so it needs no change; its Views
   section could name Plan > Hiring's own model (H10). **Open, optional** (outside this step's files):
   the Views section could name Plan > Hiring's own model, `src/views/tabModels.ts` (read by the
   Shareable file and the crawl), the crawl's `tabs` option and src/testkit/perturbations.ts. No
   folder was added, so the docs test's folder list holds.
4. **The crawl** (checks) must read `planHiringModel` under `plan.hiring` once the tab model is built:
   until then the crawl walks `planModel(ctx).hiring`, which is undefined. **Done** by checks
   (`TAB_MODELS`, K1); the integration moved the map into the app (`src/views/tabModels.ts`) so the
   Shareable file reads it too (I5).
5. **`src/views/plan/engine/smoke.perf.test.ts`** is the tab owner's; a hiring budget there is a new
   perf test, never a loosened one. **Done**: `src/views/plan/engine/hiring.perf.test.ts` (a fresh
   context under 300 ms); no budget was loosened.
6. **A browser pass** of the velocity chart (a Plot `barY` and `line` on a band x scale) and of the
   quarter grid at 375 px and in dark mode. **Open**: no dev server may run in this workflow, so
   neither was seen in a browser; `ui/render.test.ts` renders the tab in every mode, and the
   one-file build passes.

## 8. Builds and integration (25 Oct 2026)

The four builders (engine, tab, homes-help, checks) filled every stub and wrote their tests; their
readings are H19 to H24 (section 5) and T, W and K (section 5.1). The integration then resolved what
each left for the lead, in `src/` and this file only:

| Left by | Item | Resolution |
|---|---|---|
| freeze, tab, homes-help | `src/views/contracts.test.ts` read "7, 5, 5 and 6" | Reads 7, 6, 6 and 6 against `HOME_KEY_COUNT_WITH_HIRING`, with the tile at `HIRING_TILE_AT` and in neither Plan vs actual nor My team's 7 |
| homes-help | `kpis.test.ts` looked the hiring tile up in `PlanModel`'s strips | Already reading `planHiringModel(ctx).kpis` (the tab owner's final version); passes |
| homes-help, checks | Manager C's tab moved when the Elimination of C's own seat was approved (8.4 rule 3) | Fixed in the model, no test weakened: the forecast Plan > Hiring reads leaves out the plan rows of requests rule 3 hides from the viewer, on seats outside the scope (reading I1; `hiddenByRuleThree`, `ruleThreeRows`, `hiringForecast`). `src/plan/actions/managerC.scenario.test.ts` and the approved-Elimination case of `src/access/leaks.hiring.slow.test.ts` pass |
| checks | The Accepted starts card read "1 offers" | "1 offer", "2 offers" (I6); `src/testkit/counts.slow.test.ts` passes |
| checks | A gap rounding to 0.0 read "Behind by 0.0 a month" | `behindByGap`: "Behind by less than 0.1 a month" (I4) |
| engine, checks | `noCensus` on `hiringModel.ts` | Already fixed by the tab owner; passes |
| checks | Shareable files carried no Plan > Hiring figure | `src/views/tabModels.ts`, read by `snapshots.ts` and re-exported by the crawl (I5); `snapshots.test.ts` and the Shareable case of the hiring leak test pass |
| engine | Forecast months for a later year shown | The as-of year's Working forecast fills the open months before the shown forecast's grid (I2) |
| engine | Whether a forecast month's starts include modeled backfills | They do not (I3) |
| engine | The O(q) card's seat view | Already reads `quarter.seatView` (the tab owner); every term shows |
| engine, tab, homes-help, checks | Readings and additions to these contracts | Sections 1.1, 1.2, 1.5, 1.6, 3, 5 and 5.1 |
| freeze | `notBuilt` stubs | None is left; `hiring.contracts.test.ts` now scans the module's files for a stub, with a negative control |

Tests the integration added: `src/views/plan/engine/hiringTab.test.ts` (Manager C's tab byte-equal
with the Elimination approved, the one row left out, a control showing the Forecast view's own run
moves, HR admin, Manager A and Finance reading the Forecast view's own preparation, HR admin's Q4
approved heads losing C's seat; `behindByGap` with a control and no "Behind by 0.0" in any case;
"1 offer"; FY28's 18 forecast months and E(Q1) = known + FY27's October to March modeled + FY28's
April to June modeled, with the control that FY28's own forecast has no month before April 2027),
`src/views/hiring.contracts.test.ts` (no stub left; one map of tabs with a model of their own, read by
the Shareable file and the crawl) and `src/views/contracts.test.ts` (the counts and the slot).

Checks, from the project root with `HCP_TEST_WORKERS=4`, no dev server and nothing on port 8822, after
deleting `node_modules/.vite`:

| Check | Result |
|---|---|
| `npx vitest run --project unit` | 364 files, 3,881 tests passed (252 s) |
| `npm run verify` | PASS No data files in git (0.1 s); PASS Type-check (1.9 s); PASS Lint (1.4 s, 1,157 files); PASS Tests (unit, slow, perf) (2,529.5 s: 398 files, 4,074 tests, no worker crash, no rerun); PASS App build (11.0 s); PASS One-file build (10.2 s: 5,207,770 bytes of a 6,000,000 byte budget, opens from file:// with no network request) |

What is still open is in section 7: docs/PLAN.md 9.3 and 15, the optional ARCHITECTURE.md lines, and a
browser pass of the velocity chart and the quarter grid.
