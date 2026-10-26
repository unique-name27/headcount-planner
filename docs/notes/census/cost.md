# Census digest: cost guard and rounding (for Headcount Planner)

Area: the cost guard (minimum, fold into Other, whole units, round-down floors, `sumRounded`),
the LP and differencing attack tests, who sees cost, and how HCP must adapt them.
All paths below are relative to the Census repository unless they start
with `headcount-planner/`. Line refs are to the files as read on 2026-10-09.

Key facts in one paragraph: Census shows cost totals only in Finance (pay view `totals`) and in
the switch modes (HR, CHRO, Compensation, Developer with "Show pay amounts" on). HRBP and every
other scoped mode never see cost (`showCostIn` refuses any scoped mode). In Finance every amount
is rounded DOWN to a whole $100,000 per business unit, then units are added with `sumRounded`,
which adds one step for every two parts of $0.1M or more. Nearest rounding was tried first and
an attack test pinned some pay to $50,000. Rounding each set of units in one step was the next
attempt, and an LP over the 63 unit sets pinned hires to under $50,000. So rounding is done per
unit (the "atom"). Spec rule (c), that differences need 5+ contributors, is NOT modeled in any
Census cost engine. The closest code is Ask's pairwise differencing audit
(`src/ask/engine/audit.ts`).

---

## 1. Inventory (every file read)

| File | Lines | Job |
|---|---|---|
| `src/views/comp/engine/cost.ts` | 1075 | Workforce cost engine. Holds `CostRow`, `CostModel`, the guard (min, fold, whole units, per-unit rounding), drills, KPIs, `computeCost`, `costHeadline`, `topCostCenters` |
| `src/views/comp/engine/costLp.test.ts` | 368 | Linear-program attacker over every set of the 6 units at 13 dates and over every breakdown of one unit at two month ends. Asserts no hire is pinned narrower than $100,000 |
| `src/views/comp/engine/lp.testkit.ts` | 164 | Dense two-phase simplex (`lpMax`, `lpRange`, `boundsFromSums`). Test code only |
| `src/views/comp/engine/costRounding.test.ts` | 730 | Differencing attacker (pairs, triples, swaps, cash=base+bonus) over every amount read back from CSV, clipboard, Excel and slide text. Includes the nearest-rounding control |
| `src/views/comp/engine/costUnions.test.ts` | 260 | Equivalence-class sweep over 64 Finance scopes: every class of people sharing the same shown sets is 5 or more. Has hand-built `foldByUnit` and `wholeUnits` cases |
| `src/views/comp/engine/cost.test.ts` | 413 | Definitions, the 5-minimum, fold-to-5, `expectGuarded` invariant, Finance drills list employees with no amounts, `showCost` per mode, budget stories |
| `src/views/comp/engine/groups.ts` | 108 | Non-cost grouping helpers (`groupRows`, `safeMedian`, `safeShare`). A DIFFERENT fold rule: a lone small group stays as it is |
| `src/views/comp/engine/smoke.perf.test.ts` | 28 | Comp engine must run in under 150 ms (`bestCostMs`) |
| other engine siblings (skimmed headers) | | actions, charts, cycle (`meritSpend`), definitions, drill, drillUses, fields, filterTo, findings, groupFilter, kpis, lineage, market, model (`computeComp`), notes, performance, population (`CompPerson`), ranges, rules, settings, text, test-fixtures (`team`, `emp`, `comp`, `dataset`, `context`) |
| `src/lib/costRounding.ts` | 117 | `COST_STEP`, `roundCost` (down), `sumRounded`, `addedSteps`, `costIn`, `ratioOf`, `perHeadOfRounded`, `costRange`, `isRoundedCost`. The red-team rationale lives in its header |
| `src/lib/costRounding.test.ts` | 171 | Unit tests for the above, the `moneyM` format, and exports writing the rounded amount and nothing finer |
| `src/lib/budget.ts` | 1001 | Actual against budget. Holds `foldGroups` (THE fold-to-5 algorithm), `wholeUnits`-style `smallUnitsIn`, `guardSize`, per-unit rounded `rowOf`, `midpointRates`, `budgetFit` (the "unavailable for this filter" pattern) |
| `src/lib/budget.test.ts` | 625 | Totals rules on fixtures: fold, no subtraction, cost centers fold inside units, hidden scope, budget heads under 5 |
| `src/lib/testBudget.ts` (+ test) | 20/25 | `bestCostMs` timing helper for perf budgets |
| `src/metrics/privacy.ts` (+ test) | 222/36 | Locked privacy rules in the metric dictionary. `ANONYMITY` (min 5, raise only), `minGroupOf` |
| `src/metrics/budget.ts` | 133 | Dictionary entries for headcount, cost and contractor estimate against budget, with band params |
| `src/access/pay.ts` | 67 | `payView`, `showPayIn`, `showCostIn`, `payDecisions` |
| `src/access/modes.ts` (lines 195-330) | | `SCOPE_OF`, `PayView`, `PAY_OF`, `IMMIGRATION_OF` |
| `src/access/numbers.ts` | 40 | `kpisInMode`, `findingsInMode`: hidden metrics drop the same way on screen, in exports and in Ask |
| `src/access/scopes/clamp.ts` (lines 1-130) | | `clampFinance`, `byWholeUnits`, `FILTER_DIMS_OF` (Finance: business unit only) |
| `src/access/overrides/guards.ts` (excerpts) | | The `cost-totals` guard rail, `DATE_SURFACES`, `totalsWithoutSwitch` |
| `src/access/policy/finance.ts` (head) | | Finance policy: views and tabs, item hiding, `BU_ONLY` copy |
| `src/access/copy.ts:255` | | `FINANCE_EXPORT_LINE` |
| `src/lib/export/withheld.ts` (+ test) | 56/50 | `figureExport`, `WITHHELD_COLUMNS`, `exportNote`. A held-back figure exports only the reason and no note |
| `src/lib/export/money.test.ts` | 177 | `pay` and `cost` column flags across CSV, TSV, Excel and Summary. The Finance cost line replaces "Pay amounts" |
| `src/lib/export/columns.ts` (excerpts) | | `MoneyShown`, `moneyShown`, `readMoney`, `moneyDropped`, `plainText` moneyM branch |
| `src/lib/export/xlsx.ts:95-101`, `src/lib/format.ts:22,31,109,139,182` | | `excelValue` and `fmt`/`fmtDelta`/`excelNumFmt` moneyM branches, `DASH = '—'` |
| `src/charts/types.ts:1-60` | | `Column.pay` vs `Column.cost` contract |
| `src/components/types.ts:30-60` | | `Kpi.suppressed`, `suppressedNote`, `delta` |
| `src/ask/engine/audit.ts` | | `ReleaseAudit`: pairwise differencing guard. The only Census model of spec rule (c) |
| `src/lib/stats.ts:101` | | `isMaterialChange` (needs n of 5 or more on both sides for a KPI delta) |
| `src/data/sample/departments.ts` (sizes) | | 22 departments in 6 units (used below to size the HCP LP port) |
| `vite.config.ts:28-56` | | Vitest projects: `unit` and `perf` (perf files run serially afterwards) |
| `docs/ROLES-V2.md` 2.3, 2.8, 3.1, 3.2, 3.3, 5.10, 8.8, 9, "Decisions made" | | The contract and the red-team history |

---

## 2. Contracts (verbatim TS)

### 2.1 `src/lib/costRounding.ts` (port this file VERBATIM apart from its header comment)

```ts
/** The rounding step: $100,000. */
export const COST_STEP = 100_000

/** How a rounded amount under the step reads. */
export const UNDER_COST_STEP = 'under $0.1M'

/** Target cash per employee, from a rounded total, is kept to the nearest $1,000. */
export const PER_HEAD_STEP = 1_000

/**
 * An amount rounded down to a whole $100,000 (toward zero for a negative one); anything under
 * $100,000 is 0, which reads "under $0.1M".
 */
export function roundCost(v: number): number {
  if (!Number.isFinite(v)) return v
  const r = Math.floor(Math.abs(v) / COST_STEP) * COST_STEP
  return v < 0 && r ? -r : r
}

/**
 * The total of amounts each rounded down on their own (`roundCost`, one a business unit): their sum
 * plus one step for every two of them at $100,000 or more, since rounding down takes half a step
 * off each on average (six units' plain sum would read $0.3M low, enough to turn a budget status).
 * It reads the rounded amounts alone, so it says nothing they do not, and it stays on the grid.
 * The exact total is at or above it less the steps added, and under that plus a step an amount.
 *
 *   sumRounded([7_300_000, 4_500_000, 200_000])   // 12,100,000: 12.0M and a step for two of three
 */
export function sumRounded(rounded: readonly number[]): number {
  let total = 0
  let whole = 0
  for (const v of rounded) {
    total += v
    if (v >= COST_STEP) whole++
  }
  return total + addedSteps(whole)
}

/** What `sumRounded` adds over `whole` rounded amounts of $100,000 or more: a step for every two. */
export const addedSteps = (whole: number): number => Math.floor(whole / 2) * COST_STEP

/** `roundCost` that passes null through. */
export const roundCostOrNull = (v: number | null | undefined): number | null =>
  v == null ? null : roundCost(v)

/** `roundCost` when `round`, else the amount as it is. */
export const costIn = (v: number | null | undefined, round: boolean): number | null =>
  v == null ? null : round ? roundCost(v) : v

export function ratioOf(num: number | null, den: number | null, round: boolean): number | null {
  if (num == null || den == null) return null
  const n = round ? roundCost(num) : num
  const d = round ? roundCost(den) : den
  return d === 0 ? null : n / d
}

export function perHeadOfRounded(rounded: number | null, people: number): number | null {
  if (rounded == null || !people || rounded === 0) return null
  return Math.round(rounded / people / PER_HEAD_STEP) * PER_HEAD_STEP
}

/** The exact amounts, from `lo` up to but not including `hi`, that a rounded total stands for. */
export function costRange(rounded: number): readonly [lo: number, hi: number] {
  return [rounded, rounded + COST_STEP]
}

/** True when an amount is on the rounding grid (a whole $100,000). */
export const isRoundedCost = (v: number): boolean => Number.isFinite(v) && v % COST_STEP === 0
```

Notes:
- `roundCost` truncates toward zero for negatives. `roundCost(-260_000) === -200_000`, and
  `roundCost(-40_000)` is `0` (not `-0`; the test checks `Object.is(..., 0)`).
- What an observed `sumRounded` value v over `parts` parts says: exact is in
  `[v - added, v - added + parts * COST_STEP)` with `added = addedSteps(#parts >= COST_STEP)`.
  Both test files and the `CostRow.parts`/`added` fields rely on this reading.

### 2.2 Fold to 5: `foldGroups` (`src/lib/budget.ts:468-486`), the one algorithm

```ts
/**
 * Fold a breakdown under the totals rules: groups under the minimum go to Other; while Other is
 * still under it and the total is shown, the smallest shown group joins.
 */
export function foldGroups<T>(
  groups: readonly T[],
  size: (g: T) => number,
  minGroup: number,
  totalShown: boolean,
): { shown: T[]; folded: T[] } {
  const shown = groups.filter((g) => size(g) >= minGroup)
  const folded = groups.filter((g) => size(g) < minGroup)
  if (!folded.length) return { shown, folded }
  let otherSize = folded.reduce((s, g) => s + size(g), 0)
  while (totalShown && otherSize < minGroup && shown.length) {
    let i = 0
    for (let j = 1; j < shown.length; j++) if (size(shown[j]) < size(shown[i])) i = j
    const [g] = shown.splice(i, 1)
    folded.push(g)
    otherSize += size(g)
  }
  return { shown, folded }
}
```

Pinned by `budget.test.ts`: `foldGroups([9, 6, 2, 1], x => x, 5, true)` gives
`{ shown: [9], folded: [2, 1, 6] }`. With `totalShown = false`, `folded` is `[2, 1]`: with the
total hidden there is nothing to subtract from. Ties: the first smallest in `shown` order joins.

### 2.3 `src/views/comp/engine/cost.ts` (exported contracts)

```ts
/** One group's cost, or the scope's total. USD a year; null when hidden or not computable. */
export interface CostRow extends GroupDim {
  /** Unique in its breakdown: the group's value, `__none` for no value, `__other` for Other. */
  key: string
  /** What the reader sees: "Silicon Engineering", "CC-4100", "Other (12)". */
  group: string
  isOther: boolean
  /** Groups folded into this row (Other only). */
  folded: number
  /** People costed in the group. */
  people: number
  baseUsd: number | null
  /** Target bonus at target: base × target bonus %. */
  bonusUsd: number | null
  targetCashUsd: number | null
  equityUsd: number | null
  perHeadUsd: number | null
  /** Share of the scope's target cash cost; null when either is hidden. */
  share: number | null
  /** Under the anonymity minimum: every amount, the per-employee figure and the share are null. */
  hidden: boolean
  /** People in the group with no target bonus (counted at none). */
  noBonus: number
  department?: string | null
  businessUnit?: string | null
  /** The costed people behind the row (empty when hidden): what a drill lists. */
  members: CompPerson[]
  /**
   * Finance: how many parts were each rounded down and then added (a business unit's share of the
   * row, or one group folded into Other in a unit), and what the adding put on top of each amount
   * (`sumRounded`: a step for every two parts). The exact amount is at or above the shown one less
   * `added`, and under that plus `parts` steps. Absent where amounts are exact.
   */
  parts?: number
  added?: { base: number; bonus: number; cash: number; equity: number }
}

export interface CostModel {
  /** Finance mode: drills list employees, never comp rows, and Filter to is for business units only. */
  totals: boolean
  /** Finance (pay view 'totals'): every amount in the model is rounded down to a whole $100,000 ... */
  rounded: boolean
  /** Cost totals may show here (`ctx.showCost`). */
  shown: boolean
  asOf: ISODate
  scopeLabel: string
  minGroup: number
  total: CostRow
  byUnit: CostRow[]
  /** Every cost center under the guard (top 12 by target cash, then Other). */
  byCostCenter: CostRow[]
  /** In `LEVELS` order; employees with no level last. */
  byLevel: CostRow[]
  bySite: CostRow[]
  merit: { total: SpendSummary; rows: SpendRow[] }
  openReqs: { total: OpenReqRow; rows: OpenReqRow[] }
  contingent: { contractors: Employee[]; interns: Employee[] }
  budget: BudgetModel | null
  counts: { noFx: number; noBonus: number; missingComp: number; smallUnits: number }
  kpis: Kpi[]
  employeeOf: (id: string) => Employee | undefined
}

export interface CostInput {
  ctx: Pick<AnalyticsContext, 'asOf' | 'filters' | 'data' | 'all' | 'metrics' | 'showCost' | 'access'>
  pop: Population
  rules: CompRules
  settings: CycleSettings
  scopeLabel: string
  asOf: ISODate
}

export const OTHER = '__other'
export const NONE = '__none'
export const TOP_CENTERS = 12
export const isCosted = (p: CompPerson): boolean => p.baseUsd != null
export const otherLabel = (k: number): string => `Other (${k})`
export const unitOf = (p: Pick<CompPerson, 'businessUnit'>): string => p.businessUnit || NONE

export function roundedAmounts(
  members: readonly CompPerson[],
  partOf: (p: CompPerson) => string = unitOf,
): Amounts & { parts: number; added: Amounts }

export function guardGroups<T>(
  groups: readonly Group<T>[],
  min: number,
  totalShown: boolean,
  opts: { top?: number; rank?: (g: Group<T>) => number } = {},
): { shown: Group<T>[]; folded: Group<T>[] }

export function wholeUnits<T>(people: readonly T[], unit: (p: T) => string, min: number): { kept: T[]; left: T[] }

export function foldByUnit<T>(
  rows: readonly T[],
  key: (r: T) => string | null | undefined,
  unit: (r: T) => string,
  noneLabel: string,
  min: number,
): { groups: Group<T>[]; other: T[]; otherKeys: Set<string> }

export function roundSpend(m: SpendSummary): SpendSummary
export function roundSpendByUnit(total: SpendSummary, people: readonly CompPerson[], s: CycleSettings, min: number): SpendSummary
export function costPeopleDrill(m: CostDrillScope, title: string, people: readonly CompPerson[], opts?: { note?: string; filter?: DrillSpec['filter'] }): DrillSpec | null
export function costRowFilter(m: Pick<CostModel, 'totals'>, row: Pick<CostRow, 'dim' | 'key' | 'isOther'>)
export const costFormat = (m: Partial<Pick<CostModel, 'rounded'>>): Format => (m.rounded ? 'moneyM' : 'money')
export function costColumnsFor<T>(cols: readonly Column<T>[], m: Partial<Pick<CostModel, 'rounded'>>): Column<T>[]
export function computeCost(input: CostInput): CostModel
export function topCostCenters(m: CostModel, n: number): CostRow[]
export function costHeadline(ctx: AnalyticsContext): Headline
```

The per-unit floor (`cost.ts:220-243`), verbatim:

```ts
export function roundedAmounts(
  members: readonly CompPerson[],
  partOf: (p: CompPerson) => string = unitOf,
): Amounts & { parts: number; added: Amounts } {
  const parts = new Map<string, CompPerson[]>()
  for (const p of members) {
    const k = partOf(p)
    const list = parts.get(k)
    if (list) list.push(p)
    else parts.set(k, [p])
  }
  const each: Record<keyof Amounts, number[]> = { base: [], bonus: [], cash: [], equity: [] }
  for (const list of parts.values()) {
    const a = amountsOf(list)
    for (const f of AMOUNT_KEYS) each[f].push(roundCost(a[f]))
  }
  const out = { base: 0, bonus: 0, cash: 0, equity: 0, parts: parts.size }
  const added = { base: 0, bonus: 0, cash: 0, equity: 0 }
  for (const f of AMOUNT_KEYS) {
    out[f] = sumRounded(each[f])
    added[f] = addedSteps(each[f].filter((v) => v >= COST_STEP).length)
  }
  return { ...out, added }
}
```

Each component (base, bonus, cash, equity) is rounded on its own. Cash is NOT base + bonus after
rounding, so the components need not add up on screen.

`costRow` (`cost.ts:247-281`), the minimum and the rounding switch:

```ts
const people = members.length
const hidden = people < min
const exact = amountsOf(members)
const r = round ? roundedAmounts(members, partOf) : null
const shown = r ?? exact
// every amount: hidden ? null : shown.<f>
perHeadUsd: hidden || !people ? null : r ? perHeadOfRounded(r.cash, people) : exact.cash / people,
members: hidden ? [] : members.slice(),
...(r && !hidden ? { parts: r.parts, added: r.added } : {}),
```

`wholeUnits` (`cost.ts:356-367`): count per unit, then `kept` holds units with `>= min` and
`left` holds the rest. `left` is out of EVERY total, and the "People costed" tile note says
`"3 people in business units under 5 left out"`.

`foldByUnit` (`cost.ts:377-407`): group rows by unit. In each unit, run
`foldGroups(groupBy(members, key, noneLabel), g => g.rows.length, min, true)`. Merge shown groups
by key across units. Every unit's folded rows go to one `other` array, with their keys in
`otherKeys`.

`breakdown` (`cost.ts:410-490`). Finance (`byUnit: true`) uses `foldByUnit`, then
`guardGroups(groups, 0, false, { top })`, so only `top` folds more. Other modes use
`guardGroups(groups, min, totalShown, { top })`. Rows are ranked by ROUNDED cash in Finance
(`roundedAmounts(g.rows).cash`). Other's rounding parts are keyed so that each unit's own Other
and each top-trimmed group in each unit are rounded separately:

```ts
const partKey = new Map<CompPerson, string>()
for (const p of cells?.other ?? []) partKey.set(p, `${unitOf(p)}|${OTHER}`)
for (const g of folded) for (const p of g.rows) partKey.set(p, `${unitOf(p)}|${g.key}`)
// costRow(OTHER, otherLabel(k), members, min, {isOther:true, folded:k}, opts.round, (p) => partKey.get(p) ?? unitOf(p))
```

`k` (the "(k)" in "Other (k)") is the count of DISTINCT group keys folded across all units, not
people.

`computeCost` (`cost.ts:924-1027`): `totals = ctx.access.pay === 'totals'`, `round = totals`.
Finance costs `wholeUnits(pop.people.filter(isCosted), unitOf, min).kept`. Merit spend is over
`wholeUnits` of priced proposals. `budget: computeBudget(ctx, { wholeUnits: totals, round })`.

### 2.4 Budget rows (`src/lib/budget.ts`)

```ts
export interface BudgetOptions {
  version?: string | null
  wholeUnits?: boolean   // Finance: units under min (costed OR budgeted heads) left out; no fold across units
  round?: boolean        // Finance: rounded down per unit, total via sumRounded; variance/%/status from rounded
}
export interface BudgetRow { key; label; businessUnit; department; costCenter; isOther; folded;
  budgetHeadcount: number | null; headcount: number; headcountVariance; headcountVariancePct;
  headcountStatus: BudgetStatus | null; contractors; interns; costed: number;
  budgetCostUsd: number | null; employeeCostUsd: number | null; contractorCostUsd: number | null;
  costUsd: number | null; costVarianceUsd: number | null; costVariancePct: number | null;
  costStatus: BudgetStatus | null; hidden: boolean; employees; contingent; lines }
export const OTHER_KEY = '__other'          // a unit's own Other is `${OTHER_KEY}:${unit}`
export const NO_COST_CENTER = '__none'
export const BUDGET_BAND = { key: 'band', headcount: 0.01, cost: 0.005 } as const
export function budgetStatus(actual, budget, band): BudgetStatus | null   // > band over, < -band under, else on
export function midpointRates(all, asOf, minGroup = MIN_GROUP): (level, location) => number | null
export function budgetFit(filters, lines, scopedUnits): string | null      // why the scope can't be compared
export function smallUnitsIn(lines, employees, compById, month, date, minGroup): Set<string>
```

```ts
/** The people a group's cost is over: its costed employees, and its budgeted heads when it has a budget. */
const guardSize = (a: Acc): number => (a.lines.length ? Math.min(a.costed, a.budgetHeadcount) : a.costed)
```

Per-unit rounding in `rowOf` (`budget.ts:505-520`):

```ts
const r = (v: number) => (round ? roundCost(v) : v)
const over = (f: (x: Acc) => number) =>
  round && parts?.length ? sumRounded(parts.map((x) => roundCost(f(x)))) : r(f(a))
const budgetCostUsd = !hidden && budgetKnown ? r(a.budgetCost) : null          // ONE-STEP rounding
const employeeCostUsd = !hidden && costMeasured ? over((x) => x.employeeCost) : null
const costUsd = employeeCostUsd == null ? null
  : round ? over((x) => x.employeeCost + x.contractorCost) : employeeCostUsd + (contractorCostUsd ?? 0)
const costVarianceUsd = costUsd != null && budgetCostUsd != null ? costUsd - budgetCostUsd : null
```

Cost centers fold INSIDE each shown unit (`foldGroups(centersOf(u.key), guardSize, minGroup, true)`).
The cost centers of units folded by unit make ONE Other with the same people as the units'
Other, so subtracting across the unit and cost-center breakdowns gives nothing.

### 2.5 Who sees cost (`src/access/pay.ts`, `modes.ts`)

```ts
export type PayView = 'switch' | 'totals' | 'none'
export const PAY_OF: Record<Mode, PayView> = {
  hr: 'switch', chro: 'switch', 'hrbp-unit': 'none', 'hrbp-region': 'none', compensation: 'switch',
  'talent-management': 'none', recruiter: 'none', 'hr-ops': 'none', finance: 'totals',
  manager: 'none', developer: 'switch',
}
export const SCOPE_OF: Record<Mode, ScopeKind | null>  // hrbp-unit 'unit', hrbp-region 'region', recruiter 'reqs', manager 'org', others null

export const payView = (mode: Mode): PayView =>
  (mode === 'developer' ? undefined : payOverrides?.get(mode)) ?? PAY_OF[mode]

/** Individual pay amounts may show: a switch mode with "Show pay amounts" on. */
export const showPayIn = (mode: Mode, switchOn: boolean): boolean => payView(mode) === 'switch' && switchOn

/**
 * Cost totals may show: individual amounts may (the switch modes, switch on), or Finance always.
 * A scoped mode never shows totals without the switch (its scope can be narrowed in ways whole
 * business units cannot); the Security center refuses such a line first (the 'cost-totals' rail).
 */
export const showCostIn = (mode: Mode, switchOn: boolean): boolean =>
  showPayIn(mode, switchOn) || (payView(mode) === 'totals' && !SCOPE_OF[mode])

export type PaySurface = 'pay:amounts' | 'pay:totals' | 'pay:switch'
export function payDecisions(mode: Mode): Readonly<Record<PaySurface, Decision>>
//  totals: 'pay:switch' hidden('Finance mode shows cost totals without a switch.'),
//          'pay:amounts' hidden("Finance mode never shows one person's pay."),
//          'pay:totals' limited('Totals over 5 or more people, by whole business units.')
//  none:   all three hidden('This mode shows ratios only.')
```

Wiring: `src/data/context.tsx:329` sets `showCost: showCostIn(mode, args.showPay)`. Engines branch
on `ctx.access.pay === 'totals'` to decide rounding. Columns: `pay: true` means one person's
amount and follows `ctx.showPay`. `cost: true` means a total over a group and follows
`ctx.showCost`. Never set both (`src/charts/types.ts` header).

Who sees cost in Census:
- Finance always, rounded.
- HR, CHRO, Compensation and Developer only with the switch on, exact.
- HRBP (unit and region), Talent management, HR ops, Recruiter and Manager never.

### 2.6 Finance's filter clamp and the guard rail

```ts
// src/access/scopes/clamp.ts
export const FILTER_DIMS_OF = { ..., finance: ['businessUnit'], ... }   // all others: FILTER_DIMENSIONS
function clampFinance(f: Filters): Filters {   // leader, department, location, level cleared;
  ...                                           // businessUnit kept in include mode (excluded -> []); period kept
}
export const byWholeUnits = (mode: Mode | undefined): boolean =>
  mode === 'finance' || (!!mode && payView(mode) === 'totals')

// src/access/overrides/guards.ts
'cost-totals':
  'Cost totals without the pay switch are for Finance mode only, over whole business units at the reporting date HR sets, so no two totals differ by one person’s pay.',
const DATE_SURFACES = new Set(['settings:data', 'settings:device-files'])   // a totals role may not move the as-of date
const totalsWithoutSwitch = (mode: Mode, env: GuardEnv): boolean =>
  env.effective(mode, 'pay:totals') !== 'hidden' &&
  !(env.effective(mode, 'pay:amounts') !== 'hidden' && env.effective(mode, 'pay:switch') !== 'hidden')
// guardRailFor: kind === 'pay' && mode !== 'finance' && totalsWithoutSwitch(...) -> 'cost-totals'
```

### 2.7 Privacy, copy and exports

```ts
// src/data/schema.ts:19
export const MIN_GROUP = 5
// src/metrics/privacy.ts
export const ANONYMITY = { metricId: 'privacy.anonymity', key: 'minGroup' } as const   // param min 5, max 50, locked: 'raiseOnly'
export const PAY_AMOUNTS = { metricId: 'privacy.payAmounts', key: 'optIn' } as const
export const minGroupOf = (m: Pick<MetricsApi, 'num'>): number => m.num(ANONYMITY.metricId, ANONYMITY.key)
// src/access/copy.ts:255
export const FINANCE_EXPORT_LINE =
  'Cost totals cover groups of 5 or more people and are rounded to $0.1M in each business unit. Individual pay is left out.'
// src/views/comp/shared.tsx:41
export const COST_OFF = 'Turn on Show pay amounts to see cost totals.'
// src/components/kpiModel.ts:13 / src/charts/kit/shared.ts:63
export const SUPPRESSED_NOTE = `Hidden to protect anonymity (n < ${MIN_GROUP})`
// src/lib/format.ts:31
export const DASH = '—'
```

`'moneyM'` format (`src/lib/format.ts`):
- `fmt`: `Math.abs(v) < COST_STEP ? UNDER_COST_STEP : signed(v, a => `$${nf1.format(a / 1_000_000)}M`)`
- `fmtDelta`: under the step reads `'under $0.1M'`, else `'+$0.2M'` or `'−$1.3M'` (U+2212 minus).
- `excelNumFmt`: `'"$"#,##0.0,,"M";"−$"#,##0.0,,"M"'`.
- CSV and the clipboard write the raw number (`'12300000'`), or the words when under the step,
  never a 0 (`plainText`, `columns.ts:227-229`). Excel does the same (`xlsx.ts:100`).

`src/lib/export/withheld.ts` (port verbatim):

```ts
export const WITHHELD_COLUMNS: Column[] = [
  { key: 'status', label: 'Status', format: 'text' },
  { key: 'reason', label: 'Why, and how to raise it', format: 'text' },
]
export function withheldRows(status: string, reason: string): Record<string, unknown>[]
export interface WithheldReason { title: string; body: string; raise?: string | null }
export interface FigureExport { columns: readonly Column[]; rows: readonly Record<string, unknown>[]; note: string | undefined; withheld: boolean }
export function figureExport(fig: { columns: readonly Column[]; rows: readonly object[]; note?: string }, held: WithheldReason | null): FigureExport
export const exportNote = (t: { note?: string; withheld?: boolean }): string | undefined =>
  t.withheld ? undefined : t.note || undefined
```

`src/lib/export/columns.ts`:

```ts
export interface MoneyShown { pay: boolean; cost: boolean }
export type MoneyArg = boolean | MoneyShown
export interface MoneyOpts { showPay: boolean; showCost?: boolean }
export function moneyShown(ctx: MoneyOpts): MoneyShown   // { pay: showPay, cost: (showCost ?? showPay) || showPay }
export function readMoney(arg: MoneyArg): MoneyShown
export function moneyDropped(column: Pick<Column, 'pay' | 'cost'>, money: MoneyArg): boolean
// visibleColumns(cols, money), moneyLeftOut(tables, money), moneyOpts(ctx)
```

`src/access/numbers.ts`:

```ts
export function kpisInMode<K extends Pick<Kpi, 'metricId'>>(access, kpis: readonly K[]): K[]
export function findingsInMode(access, findings: readonly Finding[]): Finding[]
```

### 2.8 LP test kit (`src/views/comp/engine/lp.testkit.ts`, port VERBATIM)

```ts
type LpResult = { status: 'optimal'; value: number } | { status: 'infeasible' | 'unbounded' }
/** The maximum of c·x over x ≥ 0, A x ≤ b. */
export function lpMax(A: readonly (readonly number[])[], b: readonly number[], c: readonly number[]): LpResult
/** The minimum and maximum of c·x over x ≥ 0, A x ≤ b. */
export function lpRange(A, b, c): [lo: number, hi: number]   // throws `LP ${status}` unless both optimal
/**
 * Bounds on what each of `n` unknowns (x ≥ 0) can be, given sums of them each known to lie in
 * [lo, hi]: every row of `sets` lists the unknowns a sum covers.
 */
export function boundsFromSums(
  n: number,
  sums: readonly { set: readonly number[]; lo: number; hi: number }[],
  target: readonly number[],
): [lo: number, hi: number]
```

Details: `EPS = 1e-9`. Dantzig's rule for the first 20,000 iterations, then Bland's. 200,000
iterations at most, then it throws `'The simplex did not finish.'`. The tableau is a dense
`Float64Array` of m × (1 + n + m + 1). Each sum contributes 2 rows (≤ hi, ≥ lo). It was sized for
"tens of variables and a few hundred constraints". Callers divide by `COST_STEP` before solving
(`lo / S`) to keep numbers near 1.

### 2.9 Rule (c) closest model: `src/ask/engine/audit.ts`

```ts
export type RowSet = Uint32Array
export const DIFFERENCING = (min: number): string =>
  `Hidden: with an earlier result in this chat it would single out fewer than ${min} people`
export class ReleaseAudit {
  rowSet(rows: readonly object[], person: (row: object) => string | null): RowSet
  /** Would releasing a result over `set` single out 1 to min − 1 people against an earlier result on the topic? */
  conflicts(topic: string, set: RowSet, min: number): boolean   // n = differingPeople(set, prev, min); 0 < n < min
  record(topic: string, set: RowSet): void
  release(topic: string, set: RowSet, min: number): boolean
  private differingPeople(a: RowSet, b: RowSet, cap: number): number   // people in exactly one of the two sets
}
export function unionOf(sets: readonly RowSet[]): RowSet
```

```ts
// src/lib/stats.ts:101: a KPI delta is "material" only with n of 5 or more on both sides
export function isMaterialChange(cur, prev, nCur, nPrev, minN = 5, minRel = 0.15): boolean
```

### 2.10 Timing helper (`src/lib/testBudget.ts`, port VERBATIM)

```ts
export function bestCostMs(fn: () => unknown, runs = 3): number {
  fn()
  let best = Number.POSITIVE_INFINITY
  for (let i = 0; i < runs; i++) {
    const cpu0 = process.threadCpuUsage()
    const t0 = performance.now()
    fn()
    const wall = performance.now() - t0
    const cpu = process.threadCpuUsage(cpu0)
    best = Math.min(best, wall, (cpu.user + cpu.system) / 1000)
  }
  return best
}
```

---

## 3. Patterns and conventions

### 3.1 The cost guard, rule by rule (ROLES-V2 3.2 and `cost.ts` header)

1. **Minimum.** Any total, per-head figure or share over fewer than `minGroupOf(ctx.metrics)` (5)
   costed people is null, including the scope's own total. The UI shows "—" with "Hidden to
   protect anonymity (n < 5)". Counts (heads, people costed) still show.
2. **No subtraction.** In each breakdown, groups under the minimum fold into "Other (k)". While
   Other is under the minimum AND the total is shown, the smallest shown group joins
   (`foldGroups`). Invariant (`expectGuarded`): shown rows plus Other equal the total exactly (or
   within `(rows + 1) × $100k` when rounded), every shown row has 5 or more, and there is at most
   one Other.
3. **Whole units (Finance).** Filters are business unit and period only (`clampFinance`). Folding
   runs INSIDE each unit (`foldByUnit`). Units under 5 are out of every total (`wholeUnits`) with a
   note. The budget has the same rules (`smallUnitsIn`, no fold across units). Two Finance scopes
   then always differ by whole units of 5 or more.
4. **Drills.** In Finance a total opens the `employees` kind with no amount column (ID, name, cost
   center, department, level, location, worker type, hire date). `COST_EMPLOYEE_HIDE` drops
   directReports, orgSize, tenure, termination fields, status and manager. Elsewhere it opens
   `comp` rows, whose amounts follow the switch. "Filter to" in Finance applies to business units
   only.
5. **Exports.** They carry exactly the rows shown (`visibleColumns` with `{pay, cost}`). Finance's
   meta line `FINANCE_EXPORT_LINE` replaces "Pay amounts".
6. **Text.** Action items never put an amount in `what` or `note`. Amounts go to
   `ActionItem.amount`, rendered as a `pay: true` column (or a `cost` column for group items:
   `Sheets.tsx:230,319`). Finance lists no item about one person.
7. **Ask.** Never returns an amount or a cost total in any mode.
8. **Rounding (Finance).** Every amount is rounded down to $100,000 in the ENGINE, before any
   tile, chart, tooltip, table, drill, export, headline, item amount, report or Ask tool reads it.
   Rounding is per business unit, added with `sumRounded`. Shares, per head (nearest $1,000),
   variance, % and status are computed from the rounded amounts, and rows are ranked by them.
   Format is `moneyM`.

### 3.2 Invariants worth copying as-is

- Round in the engine, never in the view. The model carries `rounded: boolean`, and formats
  follow it (`costFormat`, `costColumnsFor`).
- One rounding "atom" partition (business unit). Every displayed amount is `sumRounded` of
  atom-level `roundCost` values, so a row over several atoms says nothing its atoms do not.
  Other's parts are `(atom, OTHER)` and `(atom, groupKey)`.
- Ratios are built from rounded numbers (`ratioOf(..., true)`, `perHeadOfRounded`) so they cannot
  undo the rounding.
- Rank by what is shown (the rounded value), never by exact values.
- The folder headline reuses the tab's computation (`costHeadline` calls `costRow` with the same
  `wholeUnits` set). `costLp.test` asserts the headline equals the tab total.
- `foldGroups` (cost and budget) differs from `groupRows` (`groups.ts`, used for rates): the
  latter leaves a lone small group in place, because its stats go null through `safe*`. Do not mix
  them up for money.
- Debugging names: `__other` and `__none` keys. `Other (k)` counts folded GROUPS, not people.

### 3.3 Which test enforces what

| Test | Enforces |
|---|---|
| `lib/costRounding.test.ts` | Round-down values. `sumRounded` stays on the grid and does not read low: over 2,000 random 6-unit runs, the plain sum averages more than $250k low and `sumRounded` stays within $25k. Ratios come from rounded amounts. moneyM reads. CSV, Excel and the clipboard write the rounded number or the words |
| `engine/cost.test.ts` | Exact definitions on fixtures. Hidden under 5. Fold-to-5 (`['Other (2)', 13]`, then `Silicon Engineering 10 / Other (2) 9`). `guardGroups` top. Finance drill kinds. `showCost` per mode. Open reqs fold by estimated openings. Raised minimum 40 still guarded |
| `engine/costUnions.test.ts` | Over 64 scopes (company plus 63 unit sets): equivalence classes of people by membership in every shown set are each 5 or more, per breakdown family (unit, center, center top 8, level, site, merit, budget unit, budget center). Control: HR with the switch and no fold finds a class under 5. Fixtures: `foldByUnit` 6/2/7, `wholeUnits` drops a unit of 3 with a note |
| `engine/costRounding.test.ts` | Differencing attacker over everything Finance can export: 64 scope sets, 5 period presets, and 13 scopes × 12 month ends. Pairs and triples of nested sets differing by 1-4 people, swaps, chain-and-halve, cash = base + bonus, nonnegativity. Narrowest interval must be at least $100,000. Controls: exact amounts recover more than 100 people to the dollar; nearest rounding gives an interval under $100k |
| `engine/costLp.test.ts` | Joint LP: (1) a set of units shows `sumRounded` of its units (every field, level and site rows, merit, budget, headline); (2) LP over the 63 sets at each date bounds each unit, and hires between consecutive dates are never narrower than $100k; control: one-step rounding pins one under $50k; (3) LP over every breakdown of one unit at two consecutive month ends never narrower than $100k; control: exact amounts pin a Corporate hire to under $1 |
| `lib/budget.test.ts` | Fold, no subtraction, cost centers fold inside units, units folded by unit give one Other, hidden scope, budget heads under 5 fold even with enough people, the sample budget stories |
| `lib/export/money.test.ts` | `pay`/`cost` column visibility per flag combination. Finance cost line on CSV preamble, sheet title block, image footer and Summary ("Pay" fact) |
| `lib/export/withheld.test.ts` | A withheld export holds only status and reason, no note, and nothing the figure computed (`JSON.stringify(out)` lacks '52') |

### 3.4 How `costLp.test.ts` builds its programs (precise)

Setup (`beforeAll`, 300 s timeout):
- `generateSample()`, `units` = the 6 business units sorted.
- `DATES` = 12 dates (`2025-10-31` through `2026-08-31`, then `2026-09-15`) plus `SAMPLE_AS_OF`
  (`2026-09-30`), 13 in all.
- For every date and every non-empty subset of units (63): `buildContext({ data, sources,
  filters: { ...DEFAULT_FILTERS, businessUnit: set }, asOfOverride: d, showPay: false, access:
  { mode: 'finance' } })`, then `computeComp(ctx).cost`. That is 819 engine runs. It asserts
  `m.rounded && m.shown`.
- It records `seen[date|set]` = total fields, level rows, site rows, merit base and spend, budget
  employee cost, and headline.
- For single-unit sets it records `exact[personId]` and `unit[date|u] = { obs: observe(m, data),
  ids }`.

Observation reading (`Obs = { ids, field, lo, hi }`). For a shown value v with `parts` and
`added`: `lo = (v - added) × scale` and `hi = (v - added + parts × S) × scale`, with `S = COST_STEP`.
Observed: the total, byUnit, byCostCenter, `topCostCenters(m, 8)`, byLevel, bySite (fields cash,
base, bonus, equity), merit total and rows (`eligibleBaseUsd` as field `base`), and budget total,
byUnit and byCostCenter `employeeCostUsd` with `scale = 12` (a monthly run rate in annual terms).
In a single-unit scope a non-Other row must have `parts === 1`.

Test 1: `'a set of business units shows the sum of what each of its units shows'`. For each date
and set, `s.total[f] === sumRounded(parts.map(x => x.total[f]))`, and the same holds for level and
site rows, merit and budget. `s.headline === `$${(s.total.cash / 1_000_000).toFixed(1)}M``. It
counts `multi === 57 * DATES.length`.

Test 2: `'every set of business units at every month end, solved together, pins no hire closer
than $50,000 either side'`.
- `unitBounds(reading)`: for each date and field, 63 sums (set → unit indexes, [lo/S, hi/S]),
  then `boundsFromSums(6, sums, [i])` per unit gives [lo, hi] per unit, date and field.
- The reading of a shown set total: `[v - added, v - added + set.length × S]`, with
  `added = addedSteps(#units in set whose own total ≥ S)`. Soundness is asserted against the exact
  sum.
- `hires(bounds)`: for each unit and each consecutive pair of dates (k-1, k), take the people
  added at k who were absent at k-1. Skip if none, more than 4, or anyone left (pure-hire
  windows only). For each field, the hire interval is `[zlo - ahi, zhi - alo]` with
  `width = zhi - alo - (zlo - ahi)`. It asserts the truth is inside.
- It asserts `found.length > 50` (hires the dates single out) and
  `found[0].width >= S - 1e-6`. THIS IS "nobody narrower than $100,000".
- Control: `oneStep` reading `[roundCost(exactSum), +S)` gives `pinned[0].width < S / 2`, and
  more than half of the hires are narrower than S.

Test 3: `'every breakdown of one unit at two month ends, solved together, pins no hire closer than
$50,000 either side'`.
- For each unit and consecutive date pair with 1 to 4 pure hires (asserts more than 20 such
  groups), `attack([...a.obs, ...z.obs], target = added, f)`.
- `attack`: keep observations of field f. Each person's signature is
  `${inTarget}|${indexes of observations holding them}`, and people with the same signature
  become one LP unknown (x ≥ 0). Sums become sets of unknowns with [lo/S, hi/S].
  `boundsFromSums(#unknowns, sums, targetUnknowns)`.
- It asserts `narrowest.width >= S - 1e-6` over all fields (cash, base, bonus, equity).
- Control: Corporate between `DATES[2]` and `DATES[3]` with observations replaced by exact ±0.005
  gives `hi - lo < 1`.

What it does NOT do:
- It does not join fields in one LP (no cash = base + bonus in the LP; `costRounding.test` does
  that algebraically).
- It does not join more than two dates in test 3.
- It does not combine the 63-set LP with breakdown observations.
- It does not model side knowledge (bonus %).
- ROLES-V2 "Still not covered": a single hire between two refreshes is pinned to a $100,000
  range (the step itself), and knowing the bonus % ties base to cash.

### 3.5 Red-team history (why round-DOWN, why per unit)

- **Decision 1 (8 Oct 2026):** "to the nearest $100,000". The build changed it to DOWN. Each
  nearest-rounded amount stands for a step half a step off the grid, so a difference of three
  amounts lands half a step off a difference of two. Laid over each other they pinned some
  people's target cash to $50,000 (for example, a person paid about $26,000 pinned to between $0
  and $50,000). Rounded down, every sum or difference is bounded by points of one $100k grid, so
  no interval is narrower than $100k.
  Test: `costRounding.test.ts` "why down and not to the nearest", using `nearestRange` (0 → [0, S),
  S → [S, 1.5S), r → [r − S/2, r + S/2)).
- **Red team 2 (8 Oct 2026):** an LP takes halves and thirds, not just whole differences. With
  each set's total rounded in ONE step, the 63 totals at one date pinned each unit's total to
  $17,000 to $67,000. Two month ends pinned an amount of every one of the 32 hires of 1 to 4
  people to under $100,000, and 11 of them to under $50,000 (one Corporate hire's target cash to
  $25,000 to $66,667; moving the date a day at a time gave 38 single hires).
  Fix: round per unit and add with `sumRounded`.
- **Side effect:** the plain sum of six rounded-down units read about $0.3M low. The Finance
  home's monthly cost read $19.5M, under budget, against $19.8M, over budget. Hence
  `addedSteps` (+$0.1M per two parts of $0.1M or more).

---

## 4. Tests to port

| Census test | Asserts | HCP adaptation |
|---|---|---|
| `src/lib/costRounding.test.ts` | Section 3.3 | Port nearly verbatim to `headcount-planner/src/lib/costRounding.test.ts`. Keep the `moneyM` format and export cases. Rename "Target cash" labels to "Loaded cost" |
| `src/views/comp/engine/lp.testkit.ts` | Solver | Copy verbatim to `headcount-planner/src/cost/lp.testkit.ts`. The solver is dense: keep the unknown count in the low hundreds by grouping people with identical signatures, as `attack` does |
| `costLp.test.ts` | Section 3.4 | `headcount-planner/src/cost/costLp.test.ts`. The Census "unit" becomes the HCP atom (department for HRBP, see 5.4). Sets are every subset of atoms each persona can select: HRBP units have 6, 4, 3, 3, 5 and 1 departments in the Census-shaped sample, so 63 + 15 + 7 + 7 + 31 + 1 = 124 HRBP sets. Leaders' sets are subsets of their direct sub-org atoms. "Two month-ends" means two consecutive closes (31 Aug and 30 Sep 2026), each a full snapshot with every amount the mode shows at that close: FY totals per version (Budget, Q1 Reforecast, Working), QTD, YTD, target and gap, per head, bridge steps, and any monthly cost series shown. Take the UNION of observations over all rounded modes (HRBP plus Leader), because modes are an open switch. Keep both controls (one-step rounding pins; exact pins to the dollar). Unknowns are per person and per field, where field means one amount type (`fy:<version>`, `ytd`, `month:<YYYY-MM>`, and so on), each solved separately as Census does. Hires are positions that became Filled, plus accepted offers, between the two closes, 1 to 4 per atom, pure (nobody left) |
| `costRounding.test.ts` (attack) | Section 3.3 | `headcount-planner/src/cost/costDiff.test.ts`. Same attacker (pairs, triples, swaps, and component sum: loaded = base + bonus + burden + benefits + one-time) over everything HRBP and Leader export (CSV, clipboard, Excel, deck text), over all reachable atom sets, all versions and the 12 closed and open months. The "period presets add nothing" case is NOT portable: HCP cost varies by period. Replace it with "the period filter only selects among months that are each observed" |
| `costUnions.test.ts` | Equivalence classes of 5 or more | `headcount-planner/src/cost/costUnions.test.ts`. For each rounded mode and each reachable atom set, every class of costed people defined by membership in shown cost sets has 5 or more. Add Finance too: Finance is exact, so classes under 5 are a real leak, and they occur when Finance filters by cost center, country, legal entity or currency (see 6.2) |
| `cost.test.ts` | Guard on fixtures | `headcount-planner/src/cost/guard.test.ts`. Keep `expectGuarded` verbatim. Fixtures: 10+3 gives `Other (2) 13`; 10+3+6 gives `X 10 / Other (2) 9`. Add HCP cases: 3 Filled + 2 Open in one org gives no filled total (costed people 3), and the Open/Planned midpoint line shows separately |
| `budget.test.ts` "the totals rules" | Fold and no subtraction | Merge into `guard.test.ts` (the `foldGroups` case `[9,6,2,1]` verbatim). Add "cost centers fold inside their unit" for Finance |
| `withheld.test.ts` | Withheld exports | Port verbatim |
| `money.test.ts` | Column flags and mode lines | Port with HCP modes. Finance's line changes to an exact-for-5+ wording (6.6). Add a `suppressed` flag column check (spec: "numeric amounts with a `suppressed` flag column") |
| `smoke.perf.test.ts` plus `testBudget.ts` | Engine under 150 ms | Port the pattern. Put the LP and attack tests in a `*.slow.test.ts` or `perf` project. Census runs them in the unit project with 120-300 s `beforeAll` timeouts |
| (new) rule (c) | Not in Census | `headcount-planner/src/cost/differences.test.ts`. Every displayed difference (month over month, version vs version, variance, each bridge step, FX effect, What-if delta, KPI `delta` on a cost tile) has 5 or more contributing costed positions or is null, in every mode including Finance. Fixture: 3 filled + 2 open; one salary change in a team of 3 (Manager surfaces byte-identical) |

---

## 5. HCP adaptation

### 5.1 Proposed files (under `headcount-planner/`)

| HCP file | From Census | Changes |
|---|---|---|
| `src/lib/costRounding.ts` | `src/lib/costRounding.ts` | Verbatim code. Rewrite the header: rounding applies in pay view `rounded` (HRBP, Leader), not Finance. Finance is exact for 5+ per the spec |
| `src/lib/fold.ts` | `foldGroups` (budget.ts), `guardGroups`, `wholeUnits`, `foldByUnit`, `otherLabel`, `OTHER`, `NONE` (cost.ts) | One module. Census splits these across two files and duplicates `otherLabel` and `OTHER` (`__other`) in both. Rename `foldByUnit` to `foldByPart` and `wholeUnits` to `wholeParts` (the atom is generic) |
| `src/cost/guard.ts` | `roundedAmounts`, `costRow`, `breakdown`, `amountsOf` | Components are base, bonus, burden, benefits, oneTime and loaded (sum), plus equity "incl. SBC" kept apart. `CostRow` fields renamed (below). `partOf` = the atom. Add the `filled` vs `band` part split (6.4) |
| `src/cost/differences.ts` | `src/ask/engine/audit.ts` `differingPeople` | New `differenceGuard` (rule (c), 5.3) |
| `src/cost/atoms.ts` | (new) | Builds the atom partition used for rounding in `rounded` modes (5.4) |
| `src/cost/lp.testkit.ts` | verbatim | — |
| `src/cost/*.test.ts` | Section 4 | — |
| `src/access/pay.ts` | `pay.ts` | New `PayView`, `showCostIn`, `payDecisions` (5.2) |
| `src/access/scopes/clamp.ts` | `clampFinance`, `byWholeUnits` | A cost-filter clamp per mode (5.5) |
| `src/access/overrides/guards.ts` (Phase 2, Security center) | `cost-totals` rail | The rail allows `rounded` for HRBP and Leader and refuses `exact` for any scoped mode |
| `src/metrics/privacy.ts` | `ANONYMITY`, `PAY_AMOUNTS`, `PROTECTED_FIELDS`, `minGroupOf` | Drop the survey and immigration rules. Add a locked rule entry for "Cost rounding" ($0.1M down per atom) and one for "Differences" (5+ contributors) |
| `src/lib/export/withheld.ts` | verbatim | — |
| `src/lib/export/columns.ts` | `MoneyShown` etc. | Keep `pay`/`cost`. Add the `suppressed` export column |
| `src/lib/testBudget.ts` | verbatim | — |
| `src/access/copy.ts` | `FINANCE_EXPORT_LINE` | Two lines: Finance (exact) and Rounded (HRBP, Leader) |

### 5.2 Pay views for HCP (proposal)

```ts
export type PayView = 'switch' | 'exact' | 'rounded' | 'none'
export const PAY_OF: Record<Mode, PayView> = {
  'hr-admin': 'switch',  // per-person amounts and exact totals behind the session-only switch
  finance: 'exact',      // totals exact over 5 or more costed people, no switch, never one person's pay
  hrbp: 'rounded',       // only if spec (a)-(d) hold; else 'none' ("heads and ratios")
  leader: 'rounded',     // same
  manager: 'none',       // heads only; budget status computed from band cost, shown in heads
  // developer: 'switch' if a Developer mode is kept
}
export const showPayIn = (mode: Mode, switchOn: boolean) => payView(mode) === 'switch' && switchOn
export const showCostIn = (mode: Mode, switchOn: boolean) =>
  showPayIn(mode, switchOn) || payView(mode) === 'exact' || payView(mode) === 'rounded'
// Census's `&& !SCOPE_OF[mode]` must go for 'rounded'. Its safety moves into the cost clamp
// (5.5) and the atom partition (5.4). Keep it for 'exact': a scoped mode never gets exact totals.
```

Engines branch on `ctx.access.pay === 'rounded'` (Census: `=== 'totals'`) to set
`model.rounded`. HR admin with the switch off sees cost? The spec says HR admin sees per-person
amounts only behind the switch. Planner decision: give HR admin's totals the `exact` behaviour
when the switch is off, or the Census switch behaviour (no cost when off). Census's switch modes
show NO cost totals with the switch off.

### 5.3 Rule (c) design (not in Census): `src/cost/differences.ts`

```ts
/** The costed positions whose contribution differs between two states (month, version, scenario, bridge step). */
export function contributors(a: ReadonlyMap<string, number>, b: ReadonlyMap<string, number>, eps = 0.005): Set<string>
/** A displayed difference: null unless 5 or more costed positions contribute. */
export function guardedDifference(
  delta: number, contributing: ReadonlySet<string>, min: number,
): { value: number | null; suppressed: boolean; contributors: number }
```

- **Contributors** are costed positions (Filled seats, plus accepted offers) whose amount differs
  by more than eps. Open and Planned positions at band midpoint do NOT count toward the 5. Their
  cost is public band data, so the spec's "3 filled + 2 open" case has 3 contributors and is
  hidden.
- Apply it to: variance (actual or forecast minus comparison), every bridge step, the FX effect,
  month-over-month changes, version deltas, KPI `delta` on any cost tile, target gap changes
  after approval, and What-if deltas.
- A bridge step with fewer than 5 contributors folds into an "Other changes" step with the same
  while-under-5 rule as `foldGroups`. The "Rounding" bar closes the waterfall from rounded totals
  only.
- **FX effect gotcha:** the contributors are only the NON-USD costed people. A unit of 30 USD
  people and 2 ILS people has an FX effect equal to 2 people's ILS cost × the known rate delta, so
  their exact local cost is recoverable (rates are visible assumptions). It needs 5 or more
  non-USD contributors.
- For `rounded` modes a displayed difference is also built from ROUNDED parts:
  `sumRounded(b atoms) − sumRounded(a atoms)` or per-atom rounded deltas. Census's grid argument
  then still holds.

### 5.4 The atom partition (the HCP analog of "business unit")

- Census has one rounded mode (Finance) and one atom (the business unit). HCP proposes two
  rounded modes with different natural parts: departments for HRBP and direct sub-orgs for
  leaders. Because modes are an open switch ("change what Headcount Planner shows, not who can
  see the data"), one person can collect both partitions. Two different roundings of overlapping
  sets is exactly what broke Census's one-step rounding.
- **Recommendation:** ONE atom partition shared by every rounded mode. Atom = department (within
  a business unit). A department under 5 costed people is left out of every rounded total, with a
  note (spec (a) "units under 5 left out").
- A leader's cost rows exist only for direct sub-orgs that are whole unions of atoms. A leader
  whose sub-orgs cut through departments (typically Director-level trees inside one department)
  sees heads and ratios only, and the plan reports that per persona.
- If the planner instead wants sub-org atoms, every rounded figure in every mode must still be
  `sumRounded` of THAT ONE partition's atoms. The LP test must run over the union of HRBP and
  Leader observations.
- Inside an atom, breakdowns (level, location, cost center, status, month) fold per atom with
  `foldByPart`. Other's parts are `(atom, OTHER)` and `(atom, groupKey)`, as in `breakdown`.

### 5.5 Cost filter clamp (spec (b))

- Census's `clampFinance` clears every org filter except business unit, globally.
- HRBP and Leader need location and level filters for heads views. So HCP should NOT clamp the
  whole filter state. Each cost figure should instead check its fit, like `budgetFit`:
  `costFit(filters, mode): string | null` returns e.g. "Cost shows for whole departments and
  periods. Clear the location and level filters to see it." The figure renders its `unavailable`
  reason with no amount, and exports `figureExport(..., held)` with that reason.
- Version and period are allowed. Keep the Census `DATE_SURFACES` idea: rounded and exact modes
  must not move the as-of or close date (Finance closes months, which is in the spec; HRBP and
  Leader never).

### 5.6 What changes vs Census, item by item

- `targetCashUsd` becomes `loadedUsd`. Components are `baseUsd`, `bonusUsd`, `burdenUsd`,
  `benefitsUsd`, `oneTimeUsd`, with `equityUsd` kept apart ("incl. SBC" only where labeled).
  `people` becomes `costed` (Filled seats plus accepted offers, spec "Costed people").
  `perHeadUsd` uses `perHeadOfRounded(loaded, costed)` in rounded modes.
- `CostRow.parts`/`added` carry `{ base, bonus, burden, benefits, oneTime, loaded, equity }`.
- Amounts are monthly series and annual totals, not one snapshot. Every rounded figure is rounded
  per atom per period (each month, QTD, YTD and FY are separate roundings of separate sums).
- `wholeUnits` for Finance is NOT ported as-is. The spec says "no cost center dropped" for
  Finance, while Census drops small units from every Finance total (see 6.2).
- `midpointRates` (median `rangeMid × fx` at level and location if 5 or more, else at level if 5
  or more, else null) is the right pattern for any HRIS-derived "average" (5.7). HCP's band
  estimate uses assumptions (bands × FTE + standard loads) and does not need it.
- Storage, prefixes and names: `hcp:`; no "census" anywhere in `src/`.

### 5.7 The user's new requirement: trading heads between levels and regions at an "average-head" ratio

The guard implications, for the planner:
- Define each cell's weight (level × zone, or level × location) as its band estimate (midpoint ×
  FTE + standard loads, the spec's "band estimate") divided by an "average head" cost. The
  average head is the org's mean band estimate over its plan-of-record positions, or a Finance
  assumption. Ratio(A→B) = weight(A) / weight(B). Example: 1 L6 San Jose = 2.4 L3 Bengaluru.
- Keep weights band-based, never HRIS-based. Band data is assumption data, so it needs no
  minimum or rounding and shows in any mode that sees bands. HRBP sees bands read-only. Manager
  sees no amounts, so show the trade in heads only ("1 L6 for 2 L3").
- If an HRIS-based average is ever wanted, it is a per-head figure. It needs 5 or more costed
  people per cell, falls back like `midpointRates` (level × location if 5+, else level if 5+,
  else none), and in rounded modes comes only from `perHeadOfRounded` of rounded atom totals.
  That is too coarse to be useful, so prefer bands.
- Round the traded heads DOWN (e.g. to 0.1 head or to whole heads), and keep the remainder as
  "Unallocated" in the target, mirroring Targets' Unallocated. A trade then never exceeds the
  cost envelope, and a trade past a sub-org envelope still needs the Finance exception.
- A trade's cost effect is a What-if-style delta at band estimate, so no HRIS contributors are
  involved and rule (c) is not triggered. Record trades as requests and audit entries like moves
  of heads and budget.

---

## 6. Gotchas and spec conflicts

### 6.1 Census quirks

1. **Budget lines are rounded in one step.** `budgetCostUsd` in `rowOf` uses `r(a.budgetCost)`,
   and `byMonth` budget cost is `roundCost(budgetCost)`, NOT per unit. This is fine in Census
   because budget lines are per cost center, not per person. In HCP a locked version's lines for
   Filled positions came from HRIS pay, so version totals must use per-atom rounding like
   actuals.
2. **Components are rounded independently.** Rounded cash ≠ rounded base + rounded bonus.
   Expect visible mismatches. Spec "control totals a test matches to the screen" must compare
   rounded-to-rounded, not sum the components.
3. **Two fold algorithms.** `foldGroups` (money) vs `groupRows` in `engine/groups.ts` (rates:
   a lone small group stays). Use `foldGroups` for every amount.
4. **Duplicates.** `otherLabel` and `OTHER`/`OTHER_KEY` are defined in both `cost.ts` and
   `budget.ts`. Centralize them in HCP.
5. **Heavy tests in the unit project.** `costLp.test.ts` `beforeAll` runs 819 full
   `computeComp` calls (300 s timeout). `costRounding.test.ts` runs 64 + 5 + 156 contexts
   (120 s). Vitest's `testTimeout` is 30 s globally (`vite.config.ts:32`). On Windows with a
   parallel run these dominate. In HCP, compute a cheap cost-only engine per scope (not the full
   view model), or put them in a serial `slow` project.
6. **The LP solver is dense and not robust at scale.** It is a two-phase tableau with up to
   200,000 iterations, sized for tens of unknowns and a few hundred constraints. HCP must group
   people with identical observation signatures (as `attack` does) and solve per atom and per
   field. Never solve one global LP over 1,450 people.
7. **Ranking by rounded value** means ties are broken by label. Order can flip between dates.
   That is harmless, but snapshot tests must not assume exact order.
8. **The "Still not covered" caveat is real.** A single hire between two refreshes is always
   pinned to the $100,000 step itself. Knowing a bonus % ties base to cash and narrows further.
   Census says a firm guarantee needs noise or fewer breakdowns. HCP's spec (d) asserts only
   "nobody narrower than $100,000", which matches Census's `width >= S` and is satisfiable.
9. **Windows.** Nothing platform-specific in these files. `process.threadCpuUsage` (testBudget)
   works on Windows. The money formats use U+2212 "−", and the CSV parse regex in
   `costRounding.test.ts` expects it. Suppressed values are `DASH = '—'` (an em dash as a value
   is allowed; the "no em dashes" copy test scans prose such as mode lines).
10. **Running Census tests writes Vitest cache** under `census/node_modules/.vite`. Builders
    must not run them against Census in place.

### 6.2 Spec conflicts and suggested resolutions

1. **HRBP and Leader cost vs Census's `showCostIn`.** Census refuses cost to any scoped mode
   (`payView === 'totals' && !SCOPE_OF[mode]`, plus the `cost-totals` guard rail). HCP must
   replace this with a `rounded` pay view and move the safety into (a) atoms and (b) the cost
   clamp. Resolution: 5.2, 5.4, 5.5. The spec's fallback, if the LP port fails, is `PAY_OF =
   'none'` for HRBP and Leader.
2. **Two partitions (department vs direct sub-org) under an open mode switch.** These are
   overlapping roundings, the Census failure mode. Resolution: one atom partition (departments).
   Leader cost only for sub-orgs that are whole unions of atoms, else heads and ratios. Run the
   LP over the union of HRBP and Leader observations (5.4).
3. **Spec (d) "over two month-ends" understates exposure.** HCP shows monthly series, three
   versions, QTD, YTD and FY at once, so one screen already holds many "dates". Port it as two
   consecutive closes, where each close observes everything shown (all months and versions).
   Census's test 2 used 13 dates; test 3 used two.
4. **Spec (c) says "5+ contributing positions".** The leak test "include 3 filled + 2 open"
   implies counting COSTED positions only: Open and Planned midpoint costs are public band data
   and subtract out. Resolution: contributors = costed positions with a changed amount (5.3).
   Census has no model of rule (c) in any cost engine. Its cost is a snapshot, and cross-date
   protection is only the round-down grid. Port the pattern from Ask's `ReleaseAudit` pairwise
   differencing (`src/ask/engine/audit.ts`), not from `cost.ts`.
5. **"Open and Planned midpoint cost is a separate line, never added to a filled total under
   5".** Even at 5 or more this creates a rounding oracle in rounded modes. The HRBP edits Open
   and Planned seats (start date by day under daily proration, level, FTE), moving a known band
   amount continuously, and watches the rounded total flip to recover the exact filled total of
   the atom. Two closes then give one hire exactly. Resolution: in rounded modes the filled
   (HRIS) part and the band part are ALWAYS separate rounding parts (`partOf = atom|filled`,
   `atom|band`), added only by `sumRounded`. Editing a band seat can then never move the filled
   part's rounded value.
6. **What if (HRBP, Leader).** Arbitrary unsaved levers form an oracle (any subset removal
   evaluated on demand). Resolution: levers act only on Open, Planned, requests and freezes, and
   are always costed at band estimate as a separate rounded part. A lever never removes or
   reprices a Filled seat's HRIS pay. What-if deltas follow rule (c).
7. **Finance "exact for 5+" with filters on cost center, legal entity, country and currency, and
   "no cost center dropped".** Census Finance filters by business unit only and DROPS small units
   from every total (`wholeUnits`), precisely so that two scopes never differ by fewer than 5.
   With exact amounts and cross-cutting filters, Finance can difference two filter states (cost
   center CC-1 with and without country DE) down to 1 to 4 people. Story 8 (a cost center of 3)
   can then be recovered as CC-3 + CC-big minus CC-big. The spec's PLAN.md accepted risk covers
   only "exact series ... difference out one hire".
   Resolution options for the planner:
   - (i) Finance cost filters by unit and cost center only, with small cost centers pinned into a
     fixed "Other (k)" per unit that is selectable only as a whole.
   - (ii) Census's `wholeUnits` for cost centers. This contradicts "no cost center dropped".
   - (iii) Widen the accepted risk in PLAN.md to filter differencing, and make `costUnions`-style
     tests assert only displayed figures.
   Ask the user. Recommend (i): country, legal entity and currency become breakdowns folded per
   unit, not filters, for amounts.
8. **The leak test "No month or version difference equals one person's cost"** contradicts
   Finance's accepted risk, since exact monthly series difference to one hire. Resolution: the
   test asserts that no DISPLAYED difference (variance, bridge, MoM, version delta, FX effect) has
   fewer than 5 costed contributors in any mode, including Finance. Attacker-computed differences
   are covered by the LP and attack tests in rounded modes only. Finance's attacker-computed
   difference is the accepted risk.
9. **Monthly cost at a $0.1M step is coarse for small atoms.** A 20-person department costs
   about $0.3M to $0.5M a month, so monthly cost reads in steps of 20% to 33%. Recommend HRBP and
   Leader see FY, QTD and YTD amounts rounded per atom, with monthly series in heads only. That
   also shrinks the LP observation set. Homes in the spec (cost vs budget, cost vs target,
   year-end gap) are FY-level anyway.
10. **Leave fields.** Unpaid leave (`leavePaid = false`) removes a person's cost from the monthly
    totals. A month difference can then reveal both the cost and the leave status (leave is
    `pay: true`; HRBP and Leader see leave only as counts of 5 or more). Count leave transitions
    as contributors in rule (c), and do not show monthly cost to HRBP and Leader (item 9).
11. **Budget status for managers ("At risk: within 2%").** It is computed from band cost
    (midpoint × FTE), never HRIS pay, and shown in heads. No rounding needed, but keep HRIS out
    of it, or the "one salary change in a team of 3 leaves Manager surfaces byte-identical" test
    fails.
12. **Spec says "$0.1M floors"; Census says "rounded down".** Same thing (`roundCost`). Use
    Census's words in copy: "rounded down to $0.1M in each department". Under $0.1M reads
    "under $0.1M", not "$0.0M". Note that `fmtDelta` prints "under $0.1M" for a difference under
    the step: a rounded difference of 0 is shown as words, not "+$0.0M".
13. **Export "numeric amounts with a suppressed flag column".** Census exports null as an empty
    cell, and a withheld figure as status plus reason rows (`figureExport`). HCP needs a new
    boolean column per amount row (`suppressed: true` with an empty amount). Add it in
    `columns.ts` and test it in `money.test.ts`.
