# Headcount Planner

Position-based headcount planning in one browser file: positions, versions, a planning cycle,
requests and approvals, loaded cost, forecast, variance and headcount trades. Managers, HRBPs,
leaders and Finance each get a home; HR admin owns the data. It ships with a synthetic sample company
(Northgate Semiconductor, as of 30 Sep 2026) and imports Excel or CSV files for real data.

- **Live, on the sample only:** https://unique-name27.github.io/headcount-planner/
- **For real data, download `headcount-planner.html`**
  (https://unique-name27.github.io/headcount-planner/headcount-planner.html) and open it from your
  computer: double-click it, or keep `Launch Headcount Planner.bat` beside it for an app-style window
  in Edge or Chrome. It needs no install, no server and no internet connection. "Same origin" below
  says why real data belongs in the downloaded file.

Everything stays in the browser: there is no server, and files you import never leave the computer.

## What it does

- **Five modes**, each with its own home. Acting as picks the person a mode works for.

  | Mode | Home | What it shows |
  |---|---|---|
  | Manager | My team | Your team's roles: get them approved and filled, and see what is left. Heads and standard heads, never an amount |
  | HRBP | Unit plan | One business unit's plan and cycle: positions, requests, approvals and transfers. Cost rounded down to $0.1M per team |
  | Leader | Rollup vs target | Your org against its target: approvals, sub-org targets and What if. Cost rounded down to $0.1M per team |
  | Finance | Plan vs actual | The whole company: targets, assumptions, FX, freezes, cycles, close and locks. Exact cost for groups of 5 or more costed people |
  | HR admin | Data room | Everything, the Data room and imports, with pay amounts behind a switch ("Show pay amounts", for the session only) |

- **Positions, not people.** Each seat is Filled, Open, Planned, On hold or Eliminated, effective
  dated, with its level, location, FTE and cost center. Approved heads, plan heads, actual heads and
  average FTE come from one engine each. Actual heads are the active HRIS employees, and people who
  hold no seat count on a "Not in plan" row of Plan > Overview; the forecast's average FTE counts
  days, whatever a version's proration. Every counted number opens exactly the rows it counts, and
  every modeled number opens a calculation card whose last step is the number.
- **Versions**: the year's Budget and reforecasts lock with a hash, Working stays editable, and
  months close from the HRIS and the ATS as they stood that day. A back-dated HRIS change to a closed
  month posts as an adjustment in the first open month, so Plan's totals, the forecast and the
  bridge's timing step all carry it. Plan, Forecast, Targets, What if and Finance compare any version
  with the Budget, the plan of record or a target. Forecast accuracy scores the year's latest
  reforecast against the months closed since it locked, for the whole company: in heads on
  Forecast > Variance, and in cost there and on Finance > Versions in Finance and HR admin mode.
- **Requests and approvals**: New role, Backfill, Level change, Location change, Transfer,
  Elimination, Trade, Start recruiting and Start date, each routed through an approval chain that
  reads the org's guarded asks against its target, with a Finance step for freeze exceptions and
  anything out of plan. The planning cycle ranks asks, draws a cut line and locks.
- **Headcount trades**: Open, Planned or On hold seats traded for seats of another level, location,
  FTE or org worth no more standard heads, the rest kept as trade credit until the fiscal year
  closes.
- **Hiring progress** (Plan > Hiring, in every mode over its own scope, heads only): how much is
  left to hire by each quarter end of the fiscal year shown, and how fast hires and exits move. Its
  Open to hire tile also sits on the Unit plan and Rollup vs target homes, and under Left to fill on
  My team. Closed quarters show their actual heads, hires and exits; the quarters ahead show:
  - Approved heads by quarter end `A(q)`: approved seats whose first head day (now when Filled, else
    the signed offer's or move's start, else the planned or target start) is on or before the
    quarter end, and that are still approved heads then.
  - Current heads `H`: active HRIS employees on the as-of date, people on leave and people not in
    plan included.
  - Future starts by quarter end `S(q)`: people with a signed offer (dates only) who have not started
    yet, starting after the as-of date and by the quarter end. Only signed offers count: never a
    forecast or modeled start, and never an Open or Planned seat without one.
  - Moves in by quarter end `M(q)`: approved internal moves into the scope that have not started, a
    row of their own that shows only when it is not 0.
  - Open to hire `O(q) = A(q) − H − S(q) − M(q)`; below 0 it reads "Over by n" and is never a target.
  - New to hire in the quarter `O(q) − O(q−1)`; the first quarter ahead counts against open to hire
    on the day before it starts (open to hire now, for the quarter that holds the as-of date).
  - Expected exits by quarter end `E(q)`: known last days (the HRIS, seats an approved Elimination
    or Trade ends, moves out of the scope, people not in plan) plus the forecast's modeled exits, a
    Manager's netted over the team alone.
  - To hire to reach plan `O(q) + E(q)`, and hires needed per month = to reach plan ÷ the
    month-ends left, against the 3-month hiring pace.
  - Hiring velocity: hires and exits in each of the last 12 closed months, then each month ahead to
    the fiscal year end with its future starts (signed offers by start month, whole people) and
    expected exits; hires and exits per month over the last 3 and 6 closed months; net pace = hires −
    exits a month; attrition (heads) = exits over 12 closed months ÷ their average month-end heads;
    months to close = this fiscal year's open to hire ÷ the net pace, while the net pace is above 0.
  - Hires in the last 3 months, by location and department: the hires of the last 3 closed months,
    a row per department and location that had a hire, a column per month, the total and the hires
    per month, sub-totals by department and by location, and a total that equals those months'
    hires in the velocity chart. Every count opens the hires it counts.
- **Exports**: every figure as CSV, Excel or a copy; a whole view as a workbook or a 16:9 deck; a long
  CSV; and Finance's FP&A load file. Each carries a header (version and lock, comparison, as-of date,
  proration, rates, cost definition, the mode it was made in, filters and rounding) and, beside any
  amount column, a Suppressed flag with its reason. An export holds exactly what the screen shows.
  Finance's control totals add USD by component for each unit and the company wherever the screen
  shows that split; HR admin's long CSV with "Show pay amounts" on splits every row by component and
  totals the split for the file and for each unit.
  Every output names its mode ("Made in HR admin mode.", "Made in HRBP mode for Silicon
  Engineering.", "Made in Manager mode for Sebastian Wagner's team. No amounts are included."). With
  "Show pay amounts" on, HR admin's line reads "Made in HR admin mode with pay amounts shown.", and
  every export HR admin makes with "Show pay amounts" on starts with the line "Contains individual
  pay": figure CSV, Excel, a copy, the workbook, the deck, the long CSV, both load files and an
  image's footer. The load file at Finance's rules is written as with the switch off, so its rows are
  Finance's, and still starts with that line when it is made with the switch on.
- **Workspace files** (`.hcplan.json`): a Shareable file in any mode, Export requests, Export for a
  manager (a file made as that manager's own Manager mode would make it), and HR admin's Full file
  for a backup or a move, which starts with "Contains individual pay". HR admin's Shareable file is
  always written as with "Show pay amounts" off, at Finance's rules, whatever the switch says (the
  save says so), so individual pay leaves the app only in a Full file or an output made with the
  switch on. A file made in Manager mode, or for a manager, names that manager's team in its header:
  its first line is the Manager line above for that manager, checked when the file is opened. Open a
  shared file shows it through your current mode, never the mode it was made in.
- **Help**: Start here articles, one article and one tour per view, the glossary (generated from the
  metric catalog and worded for each mode), privacy and trust articles, and "Why there is no
  sign-in".

## The sample company

Northgate Semiconductor, a fabless chip company, is generated fresh on every load from one frozen
seed (about a second) and never stored. Every row is synthetic. The full write-up, with every hand
calculation and both lock hashes, is [src/data/sample/README.md](src/data/sample/README.md);
`src/data/sample/sample.test.ts` asserts every number in it, and `src/ship/docs.test.ts` checks the
personas and the nine stories' numbers below against the generated sample.

Changes you make on the sample are kept in this browser against its baseline id, a hash of the whole
generated sample and of the rows its raw extracts import as. When a new version of Headcount Planner
changes the sample, those changes are set aside, never laid over the new sample, and the app says
"Headcount Planner's sample changed with this version. Your changes on the earlier sample are kept
in a file you can save; the app now shows the new sample." Data room > Workspace shows them under
"Changes on the earlier sample", where HR admin saves them as a Full file (with "Show pay amounts"
on) and can then remove the kept copy. Each earlier sample keeps its own copy until it is removed.
Replace and Merge take that file only on the sample it was made on; on the new sample both say "This
file was made on an earlier sample, so its changes stay in the file. Nothing was imported."

- As of **30 Sep 2026**; the fiscal year runs April to March (FY27 = 1 Apr 2026 to 31 Mar 2027).
- Six units: Silicon Engineering 556, Systems & Software 337, Operations 170, Go-to-Market 184,
  Corporate 196 and Executive Office 7 employees in Filled seats, **1,450** in all. 22 departments,
  13 sites in 8 countries, 92 cost centers.
- 1,650 positions in FY27 Working: 1,450 Filled, 100 Open, 60 Planned, 15 On hold and 25 Eliminated.
  Approved heads 1,610; actual heads 1,456 (6 employees are not in the plan).
- Versions: FY27 Budget (locked 20 Mar 2026), FY27 Q1 Reforecast (locked 15 Jul 2026, the plan of
  record), FY27 Working (April to September closed) and FY28 Working, with the FY28 cycle open for
  asks. The standard head is **$174,000** (the FY27 Budget's average band estimate per approved FTE).

| Persona | Mode |
|---|---|
| Minh Tri Vu, HRIS Lead (the default mode) | HR admin |
| Da-eun Oh, Silicon Engineering HRBP | HRBP |
| Chun-Hsien Kuo, SVP Silicon Engineering (the default leader) | Leader |
| Vikram Yadav, CFO | Leader |
| Huu Phuoc Do, Design Verification director | Leader |
| Sachin Acharya, FP&A lead | Finance |
| Sebastian Wagner, Regional Sales Manager in Munich (Manager A, the default manager) | Manager |
| Nathan Murphy, Quality Engineering Manager (Manager B: 3 Filled and 2 Open seats) | Manager |
| Owen Adams, Supply Chain Manager (Manager C, whose own seat is in a confidential Elimination) | Manager |

### The nine stories

Each story is planted in the generator and found by the app; the numbers are the sample's as they
stand today.

1. **Go-to-Market hired ahead of plan.** Actual heads 184 against 176 Budget plan heads at September
   month-end: **+8**, the 8 Budget openings planned for October to March that started by September.
   Cost year to date $16,426,043.48 against the Budget's $15,236,845.85; full year, forecast
   $34,252,218.32 against $32,316,099.11, over by $1,936,119.22.
2. **Silicon Engineering is late in Bengaluru, and its Hsinchu offers beat midpoint.** Actual heads
   556 against 566 Budget plan heads: **−10**, the 10 Bengaluru seats still Open past their target
   start. Six Hsinchu offers 25 to 30% above midpoint keep the unit over on cost with fewer heads:
   forecast $93,885,679.82 against $89,767,347.99, over by $4,118,331.83.
3. **Systems & Software backfills of new positions.** **4** pending Backfill requests (R-1025,
   R-1028, R-1032, R-1036) name a seat created within 30 days of a known exit in the same org, and no
   other unit has one.
4. **A freeze on Corporate from 1 Aug 2026**, with no backfills, holds **3** openings (reqs in
   Interviewing). Corporate has 4 Open and Planned seats: the fourth has an offer accepted before the
   freeze, which is honored and starts in the forecast on 19 Oct 2026.
5. **EUR and ILS rise against plan.** Munich and Haifa keep their heads flat against the Budget, seat
   by seat (53 and 45), yet are over on cost: an FX effect of $367,663.38 in Munich and $417,881.52
   in Haifa against plan rates of EUR 1.08 and ILS 0.27, and $0 at every other site. Full-year
   variance against the Budget: Munich $674,960.50, Haifa $675,470.23.
6. **Silicon Engineering's FY28 asks exceed its target.** Target 644 heads (FY27 Working's 604 at 31
   Mar 2027, plus 40); 87 ranked asks add 58, so asks 662 and a gap of **−18**. The cut line falls
   after the 40th ranked head; locking the cycle with no line set approves 66 asks (40 heads) and
   rejects 21 asks (18 heads) "Below the cut line". 4 managers have not submitted.
7. **People not in the plan and cost-center mismatches.** **9** reconciliation exceptions: 6
   employees not in the plan and 3 whose worker row names another cost center than their seat's.
   The 6 count in actual heads on the "Not in plan" row of Plan > Overview's Heads by unit, not in
   their HRIS units.
8. **A cost center with 3 costed people.** `1550-HSZ` (Facilities, Hsinchu) reads "—" or folds into
   Other in every mode without the switch; only HR admin with "Show pay amounts" on sees it. No
   difference of two Finance figures isolates its people.
9. **A pending Systems & Software trade**, waiting on the leader: one Planned P5 San Jose seat (band
   estimate $295,976.60) for P3 Bengaluru seats (₹4,009,600 = $48,115.20 each; band ratio 6.1514).
   At 17,010 bp against 2,765 bp it buys **6** seats, heads **+5**, leaving 420 bp of trade credit.
   The get seats' band estimate, $288,691.20, is over $250,000, so the chain is manager, HRBP and
   leader. Systems & Software's FY27 gap before the trade is +8 heads (target 389, asks 381), so it
   stays in plan with no Finance step.

## Modes are not security

Modes, Acting as and approvals change what Headcount Planner shows, not who can see the data.

- **No server.** Headcount Planner runs entirely in this browser and keeps its data in this
  browser's storage (IndexedDB and localStorage). There is no sign-in.
- Anyone using it can switch modes or pick who they act as, and the browser's own tools can read
  everything stored on the computer. Share Headcount Planner and its files only with people who may
  see all of it.
- A workspace file's JSON is readable whatever mode made it, so send each person a file made for
  them (Export for a manager, or their own mode's Shareable file).
- **Checksums catch damage, not forgery.** Version lock hashes, the audit chain and workspace file
  checksums show that data was damaged or edited by hand; anyone can recompute them, so they do not
  prove who made a file.
- **Real access control needs a server with sign-in**, planned for Phase 3 with HRIS and ATS sync.

## Same origin

Every app published at `unique-name27.github.io` shares one browser origin, so each of them can read
what the others keep in that browser's storage. Use the online site with the sample only; for real
data, download `headcount-planner.html` and open it from your computer. Chromium may treat every page
opened from disk as one origin too: Headcount Planner's own database name (`headcount-planner`) and
`hcp:` key prefix keep its data apart from other local apps, but not hidden from them.

## Accepted risks

The cost guard keeps amounts to groups of 5 or more costed people in Finance, rounds HRBP and Leader
cost down to $0.1M per team and shows Manager mode no amount at all. These limits remain, by design
(docs/PLAN.md 15.3; its last item, request number clashes, is internal and shows nothing):

1. **Finance exact series.** Comparing two month-ends, Finance can work out one hire's or one
   exit's cost (with a sign-on, relocation, agency fee or severance booked that month), or one unpaid
   leave start. Every displayed difference still needs 5 or more contributors, and the load file without
   suppression needs HR admin with "Show pay amounts" on.
2. **Rounded modes.** In HRBP and Leader mode a single hire, leaver, unpaid-leave change or severance
   between two closes is bounded only to the $100,000 rounding step itself.
3. **Standard heads** reveal relative band estimates by level and location: a manager who knows one
   seat's band estimate can work out the others. That is pay structure, not anyone's pay.
4. **Band estimates of single Open or Planned seats** show in HRBP, Leader and Finance mode. They are
   structure, not a person's pay, even when a hire later lands at midpoint.
5. **Modes are not security**, the **shared origin** lets every app on the same site read the
   others' storage, and **checksums** catch damage, not forgery (the two sections above).
6. **Approved changes to a Filled seat** (an Elimination with its severance, a Level or Location
   change) move Working by that person's HRIS-based cost, which Finance can difference at one date,
   as with an exit. Anyone who switches modes or Acting as can approve such a change, and an approved
   Elimination cannot be undone.
7. **Routing shows in Manager mode.** A manager sees whether a request goes to the leader. Out of plan
   reads the guarded rounded cost, so this tells at most whether an org's rounded cost is over its
   target, never anyone's pay.
8. **Small currency groups.** A unit with 1 to 4 costed people in a currency keeps them in its Other,
   and Finance can read their local cost as the unit's FX effect less its shown cost centers'. In the
   sample this is Corporate's one person paid in CAD, the only such group.

## Run, test and build

Node `^22.18.0 || >=24.11.0`. Install with `npm ci` (it needs `cdn.sheetjs.com` reachable: SheetJS
ships from there).

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on port 8822 (`--strictPort`) |
| `npm run build` | App build in `dist/` |
| `npm run build:single` | One-file build in `dist-single/`, checked and copied to `headcount-planner.html` (git-ignored) |
| `npm run preview` | Serves `dist/` on port 8823 (`--strictPort`) |
| `npm test` | Vitest: the `unit`, `slow` and `perf` projects |
| `npm run typecheck`, `npm run lint` | `tsc --noEmit -p .`, `biome check src scripts` |
| `npm run verify` | The quality gate: no data files in git, type-check, lint, all tests, both builds and the one-file check |

Every Vite run goes through these scripts, which start Node with `--max-semi-space-size=64` (Node 24
can crash during the React Compiler step without it). Do not run `npx vite`.

**The one-file build** must open from `file://` with no network request: every script, style and
font is inline (fonts as `data:` URLs), and nothing in the page names a file or an address to load.
`scripts/check-single.mjs` reads the built page as the browser's parser does and fails on any
external script, stylesheet, `url()`, `@import`, dynamic `import()`, worker or written address, and
on a page over its budget of 6,000,000 bytes (`ONE_FILE_BUDGET` in `scripts/oneFile.mjs`; the M3
build was 4,820,666). `npm run verify` runs it after the one-file build, and `build:single` and
`deploy` refuse a page that fails it.

Only synthetic data belongs in the repository: `npm run verify` fails when git tracks, or would pick
up, a `.xlsx`, `.xlsm`, `.xls`, `.csv`, `.tsv` or `.hcplan.json` file outside `src/data/sample/`.

## Deploy

`npm run deploy` builds and checks the one-file build, then force-pushes a single commit to the
`gh-pages` branch of `origin` holding `index.html`, `headcount-planner.html` and `.nojekyll`, staged
by name in a throwaway repository (never `git add -A`). It refuses, with a plain message, to run
without a commit, an `origin` remote or the build, or with a build that fails the one-file check.
Nothing is pushed or published without the owner's go. The first publish (docs/PLAN.md 3.4) creates
the public repository `unique-name27/headcount-planner`, runs `npm run deploy` and points GitHub
Pages at `gh-pages`; the site is then live at https://unique-name27.github.io/headcount-planner/.

## Docs

- [docs/PLAN.md](docs/PLAN.md): the build plan, with every definition, fixture and decision; its
  section 15 lists the readings and changes that override earlier text.
- [ARCHITECTURE.md](ARCHITECTURE.md): the contract for builders: layers, folders, the cost guard,
  the write path, workspace files and tests.
- [src/data/sample/README.md](src/data/sample/README.md): the sample company and its hand
  calculations.
- `docs/CONTRACTS-M1.md` to `CONTRACTS-M4.md` and `docs/M1-REPORT.md` onward: each milestone's
  frozen contracts and report.

## Where it comes from

Headcount Planner reuses the stack, folder shape, contracts and quality bar of Census, the owner's
people analytics app, by copying and adapting its code. Nothing imports Census at runtime, and the
name appears only in the docs (a test enforces it).
