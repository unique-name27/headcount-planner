# The sample company: Northgate Semiconductor

Headcount Planner opens on a generated sample (docs/PLAN.md 13): Northgate Semiconductor, a
fabless chip company. Every row is synthetic. The generator is deterministic (one frozen seed, one
named random stream per module), runs on every load, is never stored, and takes about a second
(`sample.perf.test.ts` holds it under 1,500 ms, hashing included). Every number below comes from
the plan engines in `src/plan/engine`, and `sample.test.ts` asserts each one; its README test checks
that this file states the asserted amounts, hashes and persona names.

- `base.ts`: the eight datasets, the personas and the day each row was known (`asKnownOn` gives the
  datasets as they stood on a date).
- `generate.ts`: `generateSample()`, the closes, the locked versions, story 9's trade, the FY28
  cycle and the plan state.
- `stories.ts`: the nine stories' numbers. `raw/`: the messy extracts and the managers' request
  files.

## The company

- As-of date **30 Sep 2026**. Fiscal year April to March (FY27 = 1 Apr 2026 to 31 Mar 2027).
- Six units, by employees in Filled seats at 30 Sep: Silicon Engineering 556, Systems & Software
  337, Operations 170, Go-to-Market 184, Corporate 196, Executive Office 7. Total 1,450.
- 22 departments, 13 sites in 8 countries (one legal entity and one currency each), 92 cost centers
  named `<department code>-<site code>` (such as `1130-BLR`).
- 1,650 positions in FY27 Working at 30 Sep: 1,450 Filled, 100 Open, 60 Planned, 15 On hold and 25
  Eliminated. Approved heads 1,610. Actual heads 1,456: the 1,450 in seats and 6 employees not in
  the plan. About 60 contractors and 20 interns hold no Employee seat.
- 20 part-timers (Munich 8, Haifa 5, Toronto 4, San Jose 3) and 20 people on leave, 4 of them
  unpaid.

## Versions, closes and the standard head

| Version | State | Hash |
|---|---|---|
| FY27 Budget | Locked 20 Mar 2026 by the FP&A lead | `sha256-2b6e3357d5cd89126ae1ac561b95b7bcf07eddfd274c48cb7bcd7e92dc96b107` |
| FY27 Q1 Reforecast (plan of record) | Locked 15 Jul 2026, with its forecast | `sha256-889cf703bcbceadeb510260238abd53e0d00ec71fe8ba1c45e51cccbab80483d` |
| FY27 Working | Working, April to September closed | none |
| FY28 Working | Working, grid April 2027 to September 2028 | none |

- Each lock is the lines engine run "as of" its day on the datasets as they stood then, with the
  version's own assumption rows, then hashed with `sha256()`. Both are FY27 Working's (parent).
  The Q1 Reforecast's stored forecast runs as of its last close (30 Jun 2026: actual rates April to
  June, forecast rates from July).
- Plan versions (the FY27 Budget, the Q1 Reforecast and FY27 Working) include a 3% vacancy
  allowance: each month, −3% of the filled part's recurring loaded cost (base, bonus, burden and
  benefits of seats costed at HRIS pay or an offer; never one-time items or seats at band estimate),
  carried as a vacancy line of its own on the seat, with no head and no person. Their totals,
  including every Budget figure and target below, include it. A forecast and a month close carry
  none, so a forecast exit or backfill is set against it in the bridge's attrition step, and the
  bridge starts at the comparison's total with its allowance.
- Six month closes, April to September 2026, each on the month's last day from the HRIS and the ATS
  as they stood that day. Each holds HRIS pay and the one-time items booked in its month (sign-on
  and relocation in the start month, the agency fee in the month the offer was accepted, severance in
  the month after the last day), at the month's actual rate: $902,391 over the six closes, the same
  items FY27 Working books in those months. Each stores its cost-atom index. The 31 Aug and 30 Sep
  indexes differ by one partition change: the Open Physical Design manager seat in Austin raised to
  M2 on 10 Sep 2026 heads a new atom from the September close (63 atoms, then 64). No back-dated
  change reaches a closed month, so there are no adjustments.
- The standard head S is computed from the FY27 Budget ("Compute from Budget"): Σ band estimate ÷
  Σ FTE over its 1,610 approved Employee positions at 31 Mar 2027 (1,602.5 FTE, Filled seats at
  band) = $173,546.01, rounded to **$174,000**. It is stored in every FY27 version. FY28 Working
  uses $178,000 from its own seats at 31 Mar 2028.

## Personas

| Persona | Mode | Who |
|---|---|---|
| HR admin (default mode) | HR admin | Minh Tri Vu, HRIS Lead in Corporate > People |
| Silicon Engineering HRBP | HRBP | Da-eun Oh, Principal HR Business Partner |
| SVP Silicon Engineering (default leader) | Leader | Chun-Hsien Kuo |
| CFO | Leader | Vikram Yadav |
| Design Verification director | Leader | Huu Phuoc Do |
| FP&A lead | Finance | Sachin Acharya, Director, FP&A, reports to the CFO |
| Manager A (default manager) | Manager | Sebastian Wagner, Regional Sales Manager in Munich: 7 Filled reports, an Open seat, the planted Munich P4 and a pending New role |
| Manager B | Manager | Nathan Murphy, Quality Engineering Manager: 3 Filled and 2 Open seats |
| Manager C | Manager | Owen Adams, Supply Chain Manager whose own seat is in a confidential Elimination |

## The nine stories

Readings used throughout: a position's unit, site and cost center are its latest row's (lines
follow the current hierarchy). Actual heads at 30 Sep are Employee assignments active that day;
Budget plan heads at Sep month-end are the locked Budget's September lines with a head. Actual cost
year to date is the April to September closes (HRIS pay and the one-time items booked in those
months). The full-year forecast is FY27 Working's forecast as of 30 Sep over April 2026 to March
2027: the closes, then the projection. Budget cost is its locked lines, the 3% vacancy allowance
included. Variance is the forecast less the Budget. Every amount is the unrounded figure shown to the
cent, so a difference can be a cent away from its two shown amounts subtracted.

### 1. Go-to-Market hired ahead of plan

- Actual heads 184 at 30 Sep against 176 Budget plan heads: **+8**, exactly the 8 Budget openings
  planned for October to March that started by September (none in Munich or Haifa). Seats added
  after the lock and still unfilled (the planted Munich P4) count on neither side.
- Cost year to date: actual $16,426,043.48 (including $214,091 of one-time items) against Budget
  $15,236,845.85.
- Full year: forecast $34,252,218.32 against Budget $32,316,099.11, over by $1,936,119.22. The bridge
  from the Budget total to the forecast total adds up to the same amount.
- Hires year to date (`plan.hires.ytd`): 18 people hired from 1 Apr to 30 Sep 2026 into a
  Go-to-Market seat. Planned hires (`plan.hires.planned`): 4 Budget seats whose first head falls in
  April to September, leaving out seats the Budget saw Filled on 1 Apr 2026. Difference **+14**.

### 2. Silicon Engineering is late in Bengaluru, and its Hsinchu offers beat midpoint

- Actual heads 556 against 566 Budget plan heads: **−10**, exactly the 10 Bengaluru seats still Open
  past their target start (5 in 1130-BLR, 3 in 1140-BLR, 2 in 1160-BLR).
- 6 Hsinchu offers are 25 to 30% above midpoint, with sign-on, relocation and agency fees, so the
  unit is over on cost with fewer heads: forecast $93,885,679.82 against Budget $89,767,347.99,
  over by $4,118,331.83. The six agency fees (NT$4,175,000 in all) are in the July to September
  closes of the months the offers were accepted; the sign-ons and relocation book in the start
  months, October to December, in the forecast.
- Cost year to date: actual $46,094,524.01 against Budget $43,801,597.71.

### 3. Systems & Software backfills of new positions

4 pending Backfill requests (R-1025, R-1028, R-1032, R-1036) each name a seat created within 30 days
of a known exit under the same manager, department and cost center, and that has no exit itself:
`requests.flags.backfillNewPosition` = **4** in Systems & Software and none elsewhere.

### 4. A freeze on Corporate from 1 Aug 2026

FRZ-001 freezes Corporate from 1 Aug 2026 with no backfills. At 30 Sep Corporate's only unstarted
seats are 3 Open seats with reqs in Interviewing (2 in IT 1540, 1 in Facilities 1550) and 1 Open seat
with an accepted offer: `plan.openings.frozen` = **3**, Corporate Open and Planned seats = 4. The
offer, accepted before the freeze, has a sign-on bonus and an agency fee; it is honored and starts
in the forecast on 19 Oct 2026 with probability 1.

### 5. EUR and ILS rise against plan

Munich and Haifa keep their heads flat against the Budget, seat by seat (53 and 45). Plan rates are
EUR 1.08 and ILS 0.27; every other currency is flat at its plan rate in every set, so every other
site's FX effect is $0. The FX effect is Σ actual local × (actual − plan) for April to September +
Σ forecast local × (forecast − plan) for October to March, over the whole site (the planted Munich
P4's forecast cost, from 14 Dec 2026 at probability 0.9, is in Munich's October to March local).
Terms are shown to the cent; each total is the unrounded sum.

Munich (EUR):

| Month | Local | Rate − plan | FX effect |
|---|---|---|---|
| Apr 2026 | €569,560.74 | 1.09 − 1.08 | $5,695.61 |
| May 2026 | €569,560.74 | 1.10 − 1.08 | $11,391.21 |
| Jun 2026 | €563,864.75 | 1.11 − 1.08 | $16,915.94 |
| Jul 2026 | €568,087.65 | 1.12 − 1.08 | $22,723.51 |
| Aug 2026 | €599,852.25 | 1.13 − 1.08 | $29,992.61 |
| Sep 2026 | €576,718.68 | 1.14 − 1.08 | $34,603.12 |
| Oct 2026 to Mar 2027 | €3,519,162.57 | 1.15 − 1.08 | $246,341.38 |
| Total | | | **$367,663.38** |

Haifa (ILS):

| Month | Local | Rate − plan | FX effect |
|---|---|---|---|
| Apr 2026 | ₪2,322,664.61 | 0.272 − 0.27 | $4,645.33 |
| May 2026 | ₪2,353,830.65 | 0.275 − 0.27 | $11,769.15 |
| Jun 2026 | ₪2,321,528.06 | 0.278 − 0.27 | $18,572.22 |
| Jul 2026 | ₪2,367,195.13 | 0.281 − 0.27 | $26,039.15 |
| Aug 2026 | ₪2,367,195.13 | 0.284 − 0.27 | $33,140.73 |
| Sep 2026 | ₪2,367,195.13 | 0.287 − 0.27 | $40,242.32 |
| Oct 2026 to Mar 2027 | ₪14,173,631.10 | 0.29 − 0.27 | $283,472.62 |
| Total | | | **$417,881.52** |

Full-year variance against the Budget: Munich over by $674,960.50, Haifa over by $675,470.23. The
vacancy allowance is in the Budget only (the forecast carries none), so it moves the variance but
not the FX effect, which reads the forecast's lines.

Finance folds each unit's cost centers once per version (docs/PLAN.md 7.4). A cost center's size is
its fewest costed people in any month of the grid (April 2026 to September 2027); cost centers under
5 fold into the unit's Other, and while Other is under 5 the smallest shown cost center joins it
(ties to the first in cost-center order); then, while a currency's share of the Other has 1 to 4
costed people, the smallest shown cost center in that currency joins it. Architecture's Austin team,
a manager and 3 engineers, sits with one San Jose engineer who reports to a San Jose manager, so
1110-AUS has 5 costed people in every month of every FY27 version. Every Silicon Engineering cost
center then has 5 or more and the unit has no Other, so Munich's 1110-MUC (6) never joins one. No
MUC or HFA cost center is in any unit's Other in the FY27 Budget, the Q1 Reforecast or FY27 Working,
so Finance's Germany and Israel rows (the shown MUC and HFA cost centers plus the units' cohort
lines in EUR and ILS) equal these totals. `sample.test.ts` runs the fold on every unit and version,
and checks that with 1110-AUS at 4 the fold would put 1110-MUC in the unit's Other.

### 6. Silicon Engineering's FY28 asks exceed its target

- FY28 Working approved heads at 31 Mar 2028 equal FY27 Working's at 31 Mar 2027: 604. The FY28
  target is 604 + 40 = 644.
- The FY28 cycle (Open for asks, asks due 16 Oct 2026) has 87 ranked asks from 82 of the unit's 86
  managers (holders of a seat another seat reports to): one senior New role each from the 14
  directors, 3 VPs and the SVP, 40 New roles from 35 M1 managers (5 of them ask for two, ranked 1 and
  2), and a Level change from 1 Apr 2027 from each of the other 29 (0 heads). The asks add **58**
  heads: asks 662, gap 644 − 662 = **−18**. The default cut line falls after the 40th ranked head.
- 4 managers have not submitted: Yung-Chieh Tu, Olga Şahin, Huu Phuoc Nguyen and Ryan Cooper.
- No other Silicon Engineering request has a head effect by 31 Mar 2028: the three planted transfers,
  the Level and Location change requests and Manager C's elimination are all outside the unit.

### 7. People not in the plan and cost-center mismatches

`finance.recon.exceptions` = **9**: 6 employees not in the plan and 3 whose worker row names another
cost center than their seat's, all outside Go-to-Market, Silicon Engineering, Munich and Haifa. No
other exception kind occurs.

The 6 count in actual heads (1,456) on a row of their own: Plan > Overview's Heads by unit lists them
as "Not in plan", with no approved or plan heads, so each unit's actual heads are the people in its
seats (Systems & Software 337 and Operations 170, where the HRIS places 3 of the 6 each) and the
rows still add up to 1,456 (M4 review SA-6; no story number moves).

### 8. A cost center with 3 costed people

`1550-HSZ` (Facilities, Hsinchu) holds the same 3 costed people in every FY27 month. Its cost reads
"—" or folds into Other in every mode without the switch. Corporate's other Hsinchu cost centers,
1510-HSZ and 1520-HSZ, have 4 each, so all three fold into Corporate's Other, and Corporate's
Taiwan, legal-entity and TWD rows (sums of its shown Hsinchu cost centers) show no amount:
subtracting them leaves 0 people.

### 9. A pending Systems & Software trade

Pin-Yi Chien, a San Jose Software manager, trades the Planned P5 San Jose seat P-2589 (planned start
2 Nov 2026) for P3 Bengaluru seats on a Bengaluru Software team (P-1715) from 1 Feb 2027. Submitted
14 Sep 2026; approved by the manager's director, Van Thanh Hoang, on 16 Sep and by the Systems &
Software HRBP, Ravi Prasad, on 21 Sep; waiting on the leader, Varun Singh, the Bengaluru director.
It is priced at the plan of record's locked rates (FY27 Q1 Reforecast).

Band estimates (annual, USD at plan rates, no equity):

- P5 San Jose: midpoint $235,000 + bonus 12% $28,200 + burden (6.2% of $176,100 = $10,918.20,
  1.45% of $263,200 = $3,816.40, 0.6% of $7,000 = $42.00) $14,776.60 + benefits $18,000 =
  **$295,976.60**.
- P3 Bengaluru: ₹3,580,000 + bonus 10% ₹358,000 + burden 12% of ₹180,000 = ₹21,600 + benefits
  ₹50,000 = **₹4,009,600** × 0.012 = **$48,115.20**.
- Band ratio $295,976.60 ÷ $48,115.20 = 6.1514.

Weights at S = $174,000: 295,976.60 ÷ 174,000 × 10,000 = 17,010 bp and 48,115.20 ÷ 174,000 ×
10,000 = 2,765 bp. The quote buys floor(17,010 ÷ 2,765) = **6** seats (bp ratio 6.1519) for 16,590
bp, leaving 420 bp (0.04 standard heads) of trade credit with the giving org (P-1629). Heads **+5**.
The get seats' band estimate is 6 × $48,115.20 = **$288,691.20**, over $250,000, so the chain is
manager, HRBP, leader. In FY27 the trade saves 4,275.25 bp (2,765 for the get seats' two months
less 7,040.25 for the give seat's 29/30 of November and four months), shown as 0.43 standard heads.

Before the trade, Systems & Software's FY27 target is 389 heads and $59,984,668.88 (its Budget at
the year end, the vacancy allowance included). The generator eliminated 13 Systems & Software
Budget seats (Planned, starting after 31 Oct 2026, outside Munich and Haifa) before the Q1
Reforecast lock, so its asks at 31 Mar 2027, without the trade, are 381 heads, a gap of **+8**.
The guarded asks cost the chain compares (each cost atom's filled and band parts rounded down to
$100,000, atoms under 5 costed people left out, summed with `sumRounded`, on FY27 Working's lines:
the closed months April to September from the closes and October to March from Working's own lines
with their vacancy allowance) is $57,100,000, a gap of $2,884,668.88. Since change C33 (review
RF-4) the closed months come from the closes, as every Plan, Forecast and Targets figure reads them;
from Working's own recomputed lines the asks cost was $56,200,000 and the gap $3,784,668.88. The
trade's net in-year
effect at band estimate is 6 × $48,115.20 × 2/12 − $295,976.60 × (29/30 + 4)/12 = −$74,386.23, so
the unit stays in plan with no Finance step. Setting the target to the asks makes it manager, HRBP,
leader, Finance (out of plan). Stories 1 to 8 are unchanged by it.

## Small groups the cost guard keeps in Other

Corporate has 1 costed person paid in CAD (a Toronto-based recruiter). As docs/PLAN.md 15.3 says,
Finance can read that person's local cost as Corporate's FX effect less its shown cost centers'. It
is the only unit and currency with 1 to 4 costed people.

## Messy data

The silver and bronze datasets also load as raw extracts with vendor headers, odd spellings and
planted problems (`raw/`); importing each yields exactly the planted rows, and the stories hold on
them. Six managers' request files (kind 'requests', made in Manager mode on 29 Sep 2026) import over
the sample with Requests > Queue > Import requests as "Merged 14 requests from 6 files, 2
conflicts": 11 drafts and 3 comments are new, and two requests that both the manager and the
workspace changed since the last import (15 Sep 2026) are conflicts.
