# Census digest: UX (Drill, Readout, KPIs, charts, filters, tokens)

Census root: the Census repository (all paths below are relative to it).
HCP root (not created): a `headcount-planner` folder beside it.
Read only. Nothing in Census was modified.

Stack facts that matter for this area: React 19.3, Tailwind 4.3 (`@theme` in CSS, no config
file), `@observablehq/plot` ^0.6.17, `@base-ui/react` ^1.8 (Dialog, Popover, Menu), zustand ^5,
Vitest 5 with `environment: 'node'` (no jsdom, no Testing Library, no Playwright). Every UI test is
either pure (engine/model functions) or reads source files with regexes. Layout checks at 375 px are
manual browser checks.

---

## 1. Inventory (every file read, one line each)

### src/drill
- `types.ts` (217): `DrillSpec`, `DrillRecordMap` (one kind per dataset + 4 grouped kinds), `DrillFilter`, `DrillAction`, `DrillExtra`, `drillDataset`, `drillSpec()`.
- `index.ts` (40): barrel; `import { Drill, drill, drillSpec } from '@/drill'`.
- `Drill.tsx` (74): `<Drill spec>` button wrapper with dotted underline, `drill(src)`, `resolveDrill`, `DrillNesting` context (numbers inside the panel push instead of replace).
- `store.ts` (34): zustand stack `DrillEntry[]` (`records` | `person`), `open/push/openPerson/back/close`.
- `DrillPanel.tsx` (486): the right-hand sheet (Base UI Dialog, `w-[min(820px,100vw)]`), header tier, Filter to / Leave out buttons, Export menu, Summary (by department and level), DataTable, focus return logic.
- `PersonCard.tsx` (398): person sheet; mode-shaped (`personCardPlan`); counts on it are `<Drill>`s; "Focus on their org".
- `person.ts` (367): `personSummary`, `personCardPlan` (`'full' | 'finance' | 'prehire' | 'outside'`), `jobLine`.
- `records.ts` (1028): turns raw rows into display tables per kind (`KINDS` table: columns, row fn, noun), `PERSON_KEY/ROW_KEY/DRILLS_KEY`, `modeHiddenColumns`, `buildDrillTable`, `rowPerson`, `drillTableHint`.
- `related.ts` (203): one definition per "count that opens more records" (directs, org, open cases, overdue courses, req applications) so the count and the list always agree.
- `filter.ts` (355): pure "Filter to this": `groupFilter`, `periodFilter`, `mergeFilter`, `narrowFilters`, `groupScopes`, labels.
- `focus.ts` (72): applies a scope as one history entry with an Undo toast (`focusScope`).
- `guard.ts` (60): panel copy for rows outside scope / hidden kind / pay note.
- `kinds.ts` (82): `drillTarget(access, src)`: a number whose kind the mode does not list renders as plain text.
- `tier.ts` (39): which data-quality tier the panel shows.
- `subtitle.ts` (32): `subtitleOf`, `windowLine`, `asOfLine` (" · " joined).
- `summary.ts` (58): Summary groups for lists of 10+ people.
- `testing.ts` (334): test helpers `expectFilterTo`, `expectLeaveOut`, `rescopeContext`, `scopeVariants`.
- Tests read: `filterTo.test.ts` (417), `records.test.ts` (277), `modes.test.ts` (314, skimmed), plus names of `newKinds/summary/subtitle/tier/related/jobLine` tests.

### src/components
- `KpiStrip.tsx` (454): the KPI row (subgrid tiles, tier, info popover with definition + `formula`, target line, drills on value/delta/note, phone fold at 4).
- `kpiModel.ts` (245): pure tile text/tone, `tileTarget`, export rows (`kpiColumns`, `kpiRows`), `SUPPRESSED_NOTE`.
- `kpiLayout.test.ts` (52): regex checks on KpiStrip classes (375 px alignment and label wrapping).
- `Readout.tsx` (405): findings list (severity, tier, detail, Next step, people, links: Show the records / Focus on / Open tab), first 4 (phones 2), below-standard findings hidden and counted.
- `readoutModel.ts` (101): `sortFindings`, `SEVERITY_WORD`, export columns/rows, `labelInSentence`.
- `types.ts` (122): `Kpi`, `ViewLink`, `Finding`, `FindingPerson`, `Severity`.
- `Section.tsx` (61): `Section` (h2 `text-section`, dek, 12-col Grid) and `Grid`.
- `useNarrow.ts` (69): `useNarrow()` (< 768 px of the *area*), `CHART_HEIGHT`, `useChartHeight`.
- Listed, not read in full: `Dialog.tsx`, `EmptyState.tsx`, `MultiSelect.tsx`, `Pending.tsx`, `RouteLink.tsx`, `currentView.tsx`, `filterLabels.ts(+test)`, `icons.tsx`, `index.ts` (barrel, read), `kpiModel.test.ts`, `mainArea.ts`, `navigation.ts`, `readoutModel.test.ts`, `styles.ts`, `tier/{TierBadge.tsx,tierModel.ts,tierModel.test.ts,useTierGate.ts}`, `toast.tsx`, `ui.tsx` (Button, Menu, Popover, Tag, StatusPill, IconButton, Segmented, `cx`), `useTableFigure.ts`.

### src/charts
- `Figure.tsx` (639): the sheet every chart/table sits on (title, subtitle, tier, table toggle, Definitions popover, export menu CSV/Excel/copy/PNG/SVG/detail, gate, empty state, note, quality lens line). Registers with the view for "Export view".
- `types.ts` (188): `Column` (with `pay`/`cost` money flags, `drill`, `href`, `only`), `Definition`, `RegisteredFigure`, `FigureFacts`, `ExportMeta`.
- `plot.tsx` (455, head read): `PlotChart` (Observable Plot in React, tooltip, keyboard, click to drill), `housePlot`, axis/grid helpers, `tickFormat`.
- `theme.ts` (144): `useChartTheme()` resolves CSS tokens to literal colors, re-renders on OS scheme change or `data-theme` mutation.
- `kit/shared.ts`: `ChartBaseProps` (`onSelect`, `selectable`, `lockedNote`, `ariaLabel`).
- `kit/groupDrill.ts`: `byGroup`, `withFilter`, `selectGroup` (per-mark drills that carry the group filter).
- `kit/BulletList.tsx` (head): one row per measure vs target (useful for Leader "bullet per sub-org").
- `index.ts`: barrel (also re-exports `groupFilter`, `periodFilter` from drill).
- Listed: `DataTable.tsx(+test)` (props read), `FigureGate.tsx`, `Legend.tsx`, `Sparkline.tsx`, `cells.ts(+test)`, `figureView.ts`, `registry.tsx`, `useExportMeta.ts`, `__gallery__/*` (dev chart gallery), `core/{attrs,color,keyboard,legend,marks,measure,notes,tooltip}.ts`, `kit/{BarList,BulletList,Columns,DotStrip,HBars,Heatmap,Histogram,Lines,Meter,Pyramid,RangeBars,Scatter,StatusSplit,TrendGrid}.tsx` + models/tests. There is NO waterfall chart: People stats' "Headcount bridge" is a `tableOnly` Figure.

### src/views/home
- `ui/HomeTop.tsx` (68): role home top band: `hero`, `overview`, `attention`; phone order hero, attention, key figures.
- `ui/Frames.tsx` (Hero read): `Hero` = span 4 Figure, `text-hero` number + SplitBar.
- `ui/FinHome.tsx` (usage read): `<HomeTop hero={...} overview={<KpiStrip span={8}/>...} attention={<AttentionSection/>}/>`.
- `engine/kpis.ts`: `tile(list, id, to)` re-links a view's KPI onto a home; `pendingTile`.
- `engine/figures.test.ts` (tail read): source scan: every `<Figure`, `<Hero`, `<ListFigure` has `metric={`; no em dash in a sentence; no `!` in strings.

### src/styles
- `tokens.css` (248): every color/radius token, light `:root`, dark under `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) }`, and again `:root[data-theme="dark"]`.
- `index.css` (376): Tailwind `@theme inline` token mapping, the type scale `@theme`, area-aware breakpoints (`@custom-variant sm..xl` on `@container shell`), base styles, `.band`, `.cut-head`, `.eyebrow`, `.scroll-x`, `.census-plot`.
- `typeScale.test.ts` (82): fails on any `text-[Npx]` / `rounded-[Npx]` outside the wordmark, and on `text-page` as a size.
- `tierTokens.test.ts` (105): WCAG contrast of tier glyphs (3:1) and muted ink (4.5:1) in all three blocks; dark blocks in step.

### src/data, src/app, src/access (only what this area touches)
- `data/urlScope.ts` (322): scope in the hash, `scopeParams`, `readScope`, `checkScope`, `vocabularyOf`, messages.
- `data/savedViews.ts` (368): saved views model, `census:views` localStorage, 50 max, 2 sample examples.
- `data/scope.ts` (parts): `Filters`, `FilterDimension`, `PeriodPreset`, `DEFAULT_FILTERS`, `withMode`, `isExcluded`.
- `data/exclusion.ts` (parts): `activeEmployees`, `peopleIn`, `smallExcludedValues` (the 1..min-1 exclusion rule).
- `app/filterOptions.ts` (parts): `tooFewToLeaveOut`, `dimensionOptions` (disabled options), `offersExclude`, `filterRowParts`.
- `app/useShell.ts`: `applyTheme` sets/removes `data-theme` on `<html>`.
- `access/scopes/clamp.ts` (parts): `clampFilters`, `byWholeUnits` (Finance: whole business units, include only).
- `access/numbers.ts`: `kpisInMode`, `findingsInMode`.
- `access/scopes/records.ts` (parts): `rowsInScope`, `personInScope`.
- `views/hrbp/ui/Overview.tsx` (parts): canonical Overview layout (KpiStrip, Readout span 4 beside lead figure span 8).
- `views/comp/engine/cost.ts` `costPeopleDrill`: how a cost total drills to people without amounts.
- `views/services/engine/drills.ts` `canDrill/drillWhen`: small groups open nothing.
- `metrics/types.ts` `MetricDef` (formula, population, uses).
- `help/content.test.ts` (parts), `views/actions/engine/wording.test.ts` (parts), `views/hrbp/engine/findings.test.ts` (parts): copy scans.
- `dev/contract.test.ts` (head): Developer page contract check (metric, uses, drill on every figure/KPI/finding).

### docs
- `docs/FILTERS.md` (167, full): URL format, saved views, exclude, "Filter to this" invariant.
- `docs/DESIGN-REFRESH.md` (855, skimmed 2.3 to 2.14, 5.2): spacing, sheets, KPI tile anatomy, charts, tables, readout, phones, screenshot checks.
- `docs/VIEWS.md` (1239, intro + Recruiting + Scorecard read): view contract (`summary`, `actions`), KPI and readout specs per view.
- `docs/CHARTS.md` (753, skimmed): per-chart spec template (Tab, Question, Form, Data, Drill, Roles, Privacy, Effort).
- `ARCHITECTURE.md` (parts): copy rules, type table, token rules.

---

## 2. Contracts (verbatim TypeScript)

### 2.1 Drill spec (`src/drill/types.ts:151-217`)

```ts
export interface DrillExtra<R> {
  /** Extra columns shown after the standard ones (e.g. "Days waiting", "Compa-ratio"). */
  columns: Column[]
  /** Values for the extra columns, keyed by column key. (Bivariant so a typed spec fits DrillSpec.) */
  values: { bivarianceHack(row: R): Record<string, unknown> }['bivarianceHack']
}

export interface DrillSpec<K extends DrillKind = DrillKind> {
  kind: K
  /** What the number is, in plain words: "Voluntary leavers in Bengaluru". */
  title: string
  /** Window and scope: "1 Oct 2025 – 30 Sep 2026 · Whole company". */
  subtitle?: string
  rows: readonly DrillRecordMap[K][]
  extra?: DrillExtra<DrillRecordMap[K]>
  /** Standard column keys to leave out (e.g. termination fields for an active headcount list). */
  hide?: string[]
  /** One-line explanation of how the rows were selected. */
  note?: string
  noun?: readonly [string, string]
  uses?: readonly FieldRef[]
  filter?: DrillFilter
  filterLabel?: string
  action?: DrillAction
}

/** A button in the records panel that takes the reader from the records to the counted thing. */
export interface DrillAction {
  label: string
  run: () => void
}

export type DrillFilter = Partial<Filters>

/** Build a typed spec without repeating the kind's record type. */
export function drillSpec<K extends DrillKind>(spec: DrillSpec<K>): DrillSpec<K> {
  return spec
}
```

`DrillRecordMap` (types.ts:116-137) maps kind to record type: `employees, jobChanges, requisitions,
candidates, cases, transactions, reviews, succession, learning, comp, hiringPlan, onboardingTasks,
rightToWork, surveyResponses, surveyItems, budget` (one per dataset) plus grouped kinds
`surveyGroups: SurveyGroupRow, leaveGroups: LeaveGroupRow, actionItems: ActionItemRow,
actionOwners: ActionOwnerRow`. `export type DrillKind = keyof DrillRecordMap`. `drillDataset(kind)`
maps a grouped kind to the dataset whose tier it shows.

`LeaveGroupRow` (types.ts:42-57) is the template for a privacy-grouped kind (counts per group, never
a named person): `{ groupBy, group, reason, people: number|null, leaves: number|null, measure,
value, format, suppressed: boolean }`.

### 2.2 Drill component and store (`Drill.tsx`, `store.ts`, `kinds.ts`)

```ts
export type DrillSource = DrillSpec | (() => DrillSpec | null) | null | undefined
export function resolveDrill(src: DrillSource): DrillSpec | null
/** Open a drill from an event handler (charts' onSelect, table cells). No-op without records. */
export function drill(src: DrillSource): void
export function DrillNesting({ children }: { children: ReactNode })
export const DRILL_CLASS =
  'cursor-pointer rounded-mark underline decoration-dotted decoration-rule-strong decoration-1 underline-offset-[3px] hover:decoration-ink hover:decoration-solid focus-visible:decoration-solid'
export function Drill({ spec, children, className, label }: {
  spec: DrillSource
  children: ReactNode
  className?: string
  /** Accessible name, e.g. "Show the 57 leavers". Defaults to "Show the records behind this number". */
  label?: string
})

// store.ts
export type DrillEntry = { type: 'records'; spec: DrillSpec } | { type: 'person'; employeeId: string }
interface DrillState {
  stack: DrillEntry[]
  open: (spec: DrillSpec) => void      // replaces the stack
  push: (spec: DrillSpec) => void      // on top; Back returns
  openPerson: (employeeId: string) => void
  back: () => void
  close: () => void
}
export const openDrill = (spec: DrillSpec) => useDrillStore.getState().open(spec)
export const pushDrill = (spec: DrillSpec) => useDrillStore.getState().push(spec)
export const openPerson = (employeeId: string) => useDrillStore.getState().openPerson(employeeId)

// kinds.ts
const KIND_KEYS: Record<DrillKind, true> = { employees: true, /* ...every kind... */ }
export const ALL_DRILL_KINDS = Object.keys(KIND_KEYS) as DrillKind[]
export interface KindAccess { can: (surface: string) => boolean }
export function listsEveryKind(access: KindAccess): boolean          // memoized per access
export const kindListed = (access: KindAccess, kind: DrillKind): boolean => access.can(`drill:${kind}`)
export function drillTarget(access: KindAccess | null | undefined, src: DrillSource): DrillSource
```

`drillTarget` rule (kinds.ts:176-190): no access or every kind listed: keep the lazy source; else
resolve it and return the spec only if `drill:<kind>` is allowed; a source that throws stays a
button (fails on click, never during render).

### 2.3 Records table (`records.ts`)

```ts
export const PERSON_KEY = '__person'
export const ROW_KEY = '__key'
/** Hidden key: the records behind a cell, by column key (a manager's org, a req's applications). */
export const DRILLS_KEY = '__drills'

export type DrillContext = Pick<AnalyticsContext, 'org' | 'asOf' | 'all' | 'showPay'> & {
  showImmigration?: boolean
  access?: AnalyticsContext['access']
}
export interface DrillTable { columns: Column[]; rows: Record<string, unknown>[] }

const KINDS: { [K in DrillKind]: { columns: Column[]; row: RowFn<K>; noun: [string, string] } }
export const DRILL_KINDS = Object.keys(KINDS) as DrillKind[]
export function drillNoun(kind: DrillKind, n: number): string            // "1,204 cases"
export function modeHiddenColumns(kind: DrillKind, access: DrillContext['access']): ReadonlySet<string>
export const buildDrillTable = (spec: DrillSpec, ctx: DrillContext): DrillTable =>
  timed(`census:drill:${spec.kind}`, () => drillTableOf(spec, ctx))
export function rowPerson(ctx: Pick<DrillContext, 'org'> & Pick<DrillContext, 'access'>, row: Row): string | null
export function drillTableHint(kind: DrillKind, opts: { rowsOpen: boolean; cellsOpen: boolean }): string | null
```

`drillTableOf` rules (records.ts:927-973): hidden columns = `spec.hide` + standard columns replaced
by an `EXTRA_LINKS` column + `modeHiddenColumns`; an extra column with a standard key replaces it;
standard columns empty in every row are dropped; a cell with `row[DRILLS_KEY][col]` becomes a drill.
Money columns carry `pay: true` (one person's amount) e.g. `budgetCost` (records.ts:647).
`modeHiddenColumns` asks `column:<kind>.<key>` per column; Finance employee lists keep only
`FINANCE_EMPLOYEE_COLUMNS = employeeId, name, costCenter, department, level, location,
employmentType, hireDate`.

### 2.4 Filter to this (`filter.ts`)

```ts
const NOT_A_GROUP = /^(other( \(\d+\))?|not recorded|no level|—|-|\(blank\))$/i
export function groupFilter(dimension: FilterDimension, value: string | readonly string[] | null | undefined): DrillFilter | undefined
export const periodFilter = (start: string, end: string): DrillFilter => ({ period: 'custom', customStart: start, customEnd: end })
export function filterDimensions(patch: DrillFilter): FilterDimension[]
export const isFilterable = (patch: DrillFilter | null | undefined): patch is DrillFilter
export const canLeaveOut = (patch: DrillFilter | null | undefined): boolean =>
  !!patch && filterDimensions(patch).length === 1 && !setsPeriod(patch)
export function mergeFilter(current: Filters, patch: DrillFilter, mode?: FilterMode): Filters
export type GroupAction = 'filterTo' | 'leaveOut'
export function narrowFilters(current: Filters, patch: DrillFilter, action: GroupAction, org: OrgIndex): Filters | null
export type ScopeContext = Pick<AnalyticsContext, 'filters' | 'all' | 'data' | 'org' | 'asOf' | 'metrics'> &
  Partial<Pick<AnalyticsContext, 'access'>>
export interface GroupScopes { filterTo: Filters | null; leaveOut: Filters | null }
export function groupScopes(ctx: ScopeContext, patch: DrillFilter): GroupScopes
export function filterInData(patch: DrillFilter, vocab: ScopeVocabulary): boolean
export function groupName(patch: DrillFilter, nameOf: NameOf, label?: string | null): string
export function filterActionLabels(patch: DrillFilter, nameOf: NameOf, label?: string | null): { filterTo: string; leaveOut: string | null }
export function namedScopeLabel(next: Filters, patch: DrillFilter, org: OrgIndex, label?: string | null): string

// focus.ts
export interface FocusOptions {
  mode?: FilterMode          // "include" Filter to, "exclude" Leave out
  org: OrgIndex
  next?: Filters             // the scope the records panel worked out
  label?: string | null      // "Asia Pacific"
}
export function focusScope(patch: DrillFilter, opts: FocusOptions): boolean
```

`groupScopes` (filter.ts:246-300) order of checks: (1) `narrowFilters`; (2) drop if same filters;
(3) Filter to dropped if it keeps every employee and (leader-only or every dataset keeps every row);
(4) drop if it adds a small exclusion (`smallExcludedValues` with `minGroupOf(ctx.metrics)`, only
new ones count); (5) Leave out dropped if it leaves no one or removes 1..min-1 active employees;
(6) in a scoped mode or Finance: dropped unless `clampFilters(next, scope, mode) === next`; Leave out
a leader never in an org scope; (7) mode decisions `focus:filter-to`, `focus:leave-out`,
`focus:leave-out-leader`.

### 2.5 The invariant as test helpers (`testing.ts`)

```ts
export function rescopeContext(base: AnalyticsContext, filters: Filters): AnalyticsContext
export function offeredScope(base: AnalyticsContext, filter: DrillFilter, mode: FilterMode = 'include'): Filters | null
export function applyDrillFilter(base: AnalyticsContext, filter: DrillFilter, mode: FilterMode = 'include'): AnalyticsContext
export interface FilterCase<R> {
  name: string
  rows: (ctx: AnalyticsContext) => readonly R[]
  key: (row: R) => string
  value: (row: R) => number | null | undefined
  drill: (row: R, ctx: AnalyticsContext) => DrillSource
  kind?: 'count' | 'rate' | 'share'
  count?: (row: R) => number | null | undefined
}
export interface CheckOptions { sample?: number; variants?: boolean }
export function checkFilterTo<R>(base: AnalyticsContext, c: FilterCase<R>, opts: { sample?: number } = {}): { checks: FilterCheck[]; skipped: number }
export interface ScopeVariant { name: string; filters: Filters }
export function scopeVariants(base: AnalyticsContext, dim: FilterDimension | null): ScopeVariant[]
export function expectFilterTo<R>(base: AnalyticsContext, c: FilterCase<R>, opts: CheckOptions = {}): void
export function expectLeaveOut<R>(base: AnalyticsContext, c: FilterCase<R>, opts: CheckOptions = {}): void
```

### 2.6 Smaller drill modules

```ts
// tier.ts
export interface DrillTier { tier: Tier; explain: string; dataset: DatasetKey; ofDataset: boolean }
export function drillTier(quality: Pick<QualityIndex, 'datasetTier' | 'explain' | 'limitingOf' | 'explainOf'>, spec: Pick<DrillSpec, 'kind' | 'uses'>): DrillTier
// subtitle.ts
export type SubtitlePart = string | null | undefined | false
export function subtitleOf(...parts: SubtitlePart[]): string                  // joined by " · "
export function windowLine(w: { start: string; end: string }, scope?: SubtitlePart, ...more: SubtitlePart[]): string
export function asOfLine(asOf: string, scope?: SubtitlePart, ...more: SubtitlePart[]): string  // "As of 30 Sep 2026 · …"
// summary.ts
export interface SummaryGroup { label: string; count: number; rows: number[] }
export interface SummaryCut { groups: SummaryGroup[]; people: number; unnamed: number }
export const SUMMARY_MIN_ROWS = 10
export const showsSummary = (cut: Pick<SummaryCut, 'people' | 'unnamed'>): boolean
export function summaryCut(people: readonly (Employee | null | undefined)[], field: 'department' | 'level'): SummaryCut
// guard.ts
export function recordsOutsideLine(access: Pick<AccessContext, 'scope'>, leftOut: number): string | null
export const kindHiddenLine = (access: Pick<AccessContext, 'mode'>): string    // "These records are not shown in Finance mode."
export function payAmountsNote(access: Access): string
// charts/kit/groupDrill.ts
export type GroupOf<T> = Key<T> | ((d: T) => string | readonly string[] | null | undefined)
export function withFilter<S extends DrillSpec>(spec: S, filter: DrillFilter | undefined, label?: string | null): S
export function byGroup<T>(dimension: FilterDimension, group: GroupOf<T>, build: (d: T) => DrillSource, label?: (d: T) => string | null | undefined): (d: T) => DrillSource
export function selectGroup<T>(dimension: FilterDimension, group: GroupOf<T>, build: (d: T) => DrillSource): (d: T) => void
```

### 2.7 KPI and finding shapes (`src/components/types.ts`)

```ts
export interface ViewLink {
  view: RouteView
  tab?: string
  /** Where it goes, for the accessible name: "Onboarding, Hiring plan". */
  label: string
}

/** A headline number. Missing data is `null` (renders "—"), never 0. */
export interface Kpi {
  id: string
  metricId?: string
  label: string
  value: number | null
  format: Format
  /** Change vs the comparison (prior period or company), in the same unit as value. */
  delta?: number | null
  /** What the delta compares against, e.g. "vs prior 12 months" or "vs company". */
  deltaLabel?: string
  goodDirection?: 'up' | 'down' | null
  deltaMaterial?: boolean
  spark?: (number | null)[]
  note?: string
  suppressed?: boolean
  suppressedNote?: string
  tab?: string
  link?: ViewLink
  definition?: string
  /**
   * How the shown number is worked out right now, as a sentence ("166 voluntary exits over an
   * average headcount of 1,383, annualized."). The info popover shows it under the definition, so
   * the tile's own note stays one short line.
   */
  formula?: string
  drill?: DrillSource
  deltaDrill?: DrillSource
  noteDrill?: DrillSource
  uses?: readonly FieldRef[]
}

export type Severity = 'critical' | 'warning' | 'info' | 'good'
export interface FindingPerson { id: string; name: string; note?: string }
export interface Finding {
  id: string
  metricId?: string
  severity: Severity
  title: string          // one sentence with the number in it
  detail?: string        // one or two sentences
  action?: string        // neutral next step
  people?: FindingPerson[]
  peopleTotal?: number
  filter?: Partial<Filters>     // "Focus on"
  filterLabel?: string
  tab?: string
  drill?: DrillSource
  uses?: readonly FieldRef[]
}
```

### 2.8 KpiStrip (`KpiStrip.tsx:101-106, 374-391`) and kpiModel

```ts
export type TileJudgement = { target: MetricTarget; status: 'met' | 'watch' | 'missed' }
export type TileJudge = (
  metricId: string | null | undefined,
  value: number | null | undefined,
  format: Kpi['format'],
) => TileJudgement | null

export function KpiStrip({ kpis: listed, id = 'key-figures', title = 'Key figures', span = 12, judge, className }: {
  kpis: Kpi[]
  /** Registry id; give a second strip on the same tab its own id. */
  id?: string
  title?: string
  /** Grid columns at desktop width (default 12), so a home page can set a hero figure beside it. */
  span?: Span
  /** How tiles are judged against their targets, when not plain Met or Missed (`TileJudge`). */
  judge?: TileJudge
  className?: string
})
const PHONE_TILES = 4   // phones: 2 tiles a row, first 4 then "Show all n"

// kpiModel.ts
export const SUPPRESSED_NOTE = `Hidden to protect anonymity (n < ${MIN_GROUP})`
export type DeltaTone = 'good' | 'bad' | 'neutral'
export function deltaDirection(delta: number | null | undefined): 'up' | 'down' | 'flat' | null
export function deltaTone(k: Pick<Kpi, 'delta' | 'goodDirection' | 'deltaMaterial' | 'suppressed'>): DeltaTone
export function kpiValueText(k: Pick<Kpi, 'value' | 'format' | 'suppressed'>): string
export function kpiDeltaText(k: Pick<Kpi, 'delta' | 'format' | 'suppressed'>): string | null
export interface TileTarget { view: RouteView; tab: string; label: string }
export function tileTarget(k: Pick<Kpi, 'tab' | 'link'>, view: (Pick<CurrentView, 'key' | 'tabs'> & { tab?: string }) | null, shown: (view: string, tab: string) => boolean = () => true): TileTarget | null
export function unitOf(format: Format): string
export function kpiColumns(kpis: readonly Kpi[], opts: { tiered?: boolean; gates?: readonly (TierGate | null)[]; targets?: readonly (string | null)[] } = {}): Column[]
export function kpiRows(kpis: readonly Kpi[], gates?: readonly (TierGate | null)[], targets?: readonly (string | null)[]): Record<string, unknown>[]
```

Tile anatomy (5-row CSS subgrid, `ROW = { label: 'row-start-1', value: 'row-start-2', change:
'row-start-3', target: 'row-start-4', note: 'row-start-5' }`): label (`text-meta` ink-2,
`break-normal min-w-min`) + tier medal + info popover (definition, `formula`, Edit definition, Learn
more); value `text-page-title` 28px `cut-head` with 72x24 sparkline; change (arrow, signed change,
`deltaLabel` muted, `deltaDrill`); target ("Met · target at most 45 d"); note (drillable via
`noteDrill`) or lock icon + suppressed note. The value is a `<Drill>` only when `drill &&
!suppressed && value != null`. Strip: `grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))]
max-sm:grid-cols-2`, tiles separated by `shadow-[-1px_0_0_var(--rule),0_-1px_0_var(--rule)]`.
Registers a "Key figures" table via `useTableFigure` so view exports include it. Tiles whose
`metric:<id>` the mode hides are dropped (`kpisInMode`).

### 2.9 Readout (`Readout.tsx:113-119, 247-284`) and readoutModel

```ts
export interface FindingSource { label: string; openLabel?: string; open?: () => void }
const FIRST = 4
const PHONE_FIRST = 2
export function Readout({ findings: listed, span = 4, title = 'Readout', exportTitle, id = 'readout',
  emptyText = 'Nothing unusual in this period.', className, sourceOf, limit = FIRST, variant = 'full' }: {
  findings: Finding[]
  span?: Span
  title?: string
  exportTitle?: string
  id?: string
  emptyText?: string
  className?: string
  sourceOf?: (f: Finding) => FindingSource | null
  limit?: number
  /** "compact" (role home pages): meta line, headline, next step and the first link only. */
  variant?: 'full' | 'compact'
})

// readoutModel.ts
export const SEVERITY_RANK: Record<Severity, number> = { critical: 0, warning: 1, info: 2, good: 3 }
export const SEVERITY_WORD: Record<Severity, string> = { critical: 'Critical', warning: 'Watch', info: 'Note', good: 'Good' }
export function sortFindings(findings: readonly Finding[]): Finding[]   // stable within severity
export const READOUT_COLUMNS: Column[]   // severity, finding, detail, nextStep, people (counted, never named)
export function readoutRows(findings: readonly Finding[], gateOf?: (f: Finding) => TierGate | null): Record<string, unknown>[]
export function labelInSentence(label: string): string
```

Finding links (Readout.tsx:159-186): "Show the records" (only if `drillTarget` allows), "Focus on
{label}" (only if `focus:finding` and the mode's clamp leaves the merge unchanged), "Open {tab}" (tab
not on screen and `routeShown`). Below-standard findings: "n findings are below the data standard.
Show them".

### 2.10 Figure (`src/charts/Figure.tsx:74-149`)

```ts
export interface FigureDetail {
  label: string
  columns: readonly Column[]
  rows: () => readonly object[]
}
export type FigureTableOptions<T extends object> = Pick<DataTableProps<T>,
  'maxRows' | 'onRowClick' | 'rowTone' | 'search' | 'defaultSort' | 'maxHeight'>

export interface FigureProps<T extends object> {
  /** Stable kebab-case id, unique in the app, prefixed with the view key. */
  id: string
  title: string
  subtitle?: string
  /** The rows behind the chart: shown in the table view and written by every export. */
  data: readonly T[]
  columns: readonly Column<T>[]
  definitions?: readonly Definition[]
  /** Muted footnote, e.g. "62 reqs filled · as of 30 Sep 2026". */
  note?: string
  span?: FigureSpan           // default 12
  actions?: ReactNode
  empty?: string | null | false
  emptyAction?: ReactNode
  emptyHeight?: number        // default 220
  variant?: 'default' | 'compact'
  detail?: FigureDetail
  tableOnly?: boolean
  image?: boolean             // default true; false for HTML bodies
  tableToggle?: boolean       // default true
  table?: FigureTableOptions<T>
  uses?: readonly FieldRef[]
  /** The metric dictionary entry the figure shows ('hrbp.attrition.voluntary'). */
  metric?: string
  gate?: boolean              // default true; false for figures about the data itself
  exportMeta?: Partial<ExportMeta>
  className?: string
  children?: ReactNode
}
```

What the spec calls "required title/caption/uses/metricId/a11y" maps to: `title` (required in TS),
`subtitle` + `note` (the caption lines), `uses` and `metric` (optional in TS, enforced by tests and
the Developer contract scan), a11y: `<figure aria-labelledby={titleId}>`, title is an `h3` in
`figcaption`, chart body `role="group" aria-label="{title}, chart"`, the kit chart's own `ariaLabel`
prop, keyboard via `PlotChart` (`keyPoints`). Mode gate: renders nothing when
`!access.can('figure:<id>')` or `!access.can('metric:<metric>')`.

### 2.11 Columns, definitions, export meta (`src/charts/types.ts`)

```ts
export type RowFormat<T = Record<string, unknown>> = (row: T) => Format
export interface Column<T = any> {
  key: Extract<keyof T, string> | string
  label: string
  format?: Format | RowFormat<T>
  /** One person's pay amount: hidden unless pay amounts are switched on (`ctx.showPay`). */
  pay?: boolean
  /** A cost total over a group of people (5 or more, under the cost guard): hidden unless `ctx.showCost`. */
  cost?: boolean
  align?: 'left' | 'right'
  width?: number
  only?: 'sheets' | 'slides'
  drill?: { bivarianceHack(row: T): DrillSource }['bivarianceHack']
  href?: { bivarianceHack(row: T): string | null }['bivarianceHack']
  sortValue?: { bivarianceHack(row: T): unknown }['bivarianceHack']
}
export interface Definition { term: string; text: string; formula?: string }
export interface FigureItemFacts { id: string; metricId?: string; uses: boolean; drill: boolean }
export interface FigureFacts { id: string; title: string; metric?: string; uses?: readonly string[]; gated: boolean;
  rows: number; tier?: Tier | null; withheld?: boolean; image: boolean; kind: 'figure' | 'table';
  items?: { kind: 'kpi' | 'finding'; list: readonly FigureItemFacts[] }; order: number }
export interface ExportMeta { view: string; viewKey?: string; tab?: string; scope: string; window: string;
  asOf: string; isSample: boolean; company: string; standard?: DataStandard; modeLine?: string; costLine?: string }

// kit/shared.ts
export interface ChartBaseProps<T> {
  onSelect?: (d: T) => void
  selectable?: (d: T) => boolean
  lockedNote?: (d: T) => string | null | undefined    // "Fewer than 5 people"
  ariaLabel?: string
}
export const HIDDEN_NOTE = 'Hidden to protect anonymity (n < 5)'
```

### 2.12 Home frames

```ts
// views/home/ui/HomeTop.tsx:34
export function HomeTop({ hero, overview, attention }: {
  /** The one hero figure (span 4). */
  hero: ReactNode
  /** The key figures and the lead charts. */
  overview: ReactNode
  /** The Needs attention section. */
  attention: ReactNode
})
// views/home/ui/Frames.tsx:19 (Hero): required id, metric, title, value: string, label, parts: readonly SplitPart[],
// unit, ariaLabel, data, columns; optional uses, subtitle, valueDrill, valueLabel, line, onSegment,
// definitions, note, empty, emptyAction, className. Renders <Figure span={4} emptyHeight={150}> with
// `cut-head text-hero` number (a <Drill> when valueDrill and value !== '—') and a SplitBar.
// views/home/engine/kpis.ts
export function tile(list: readonly Kpi[], id: string, to?: { view: RouteView; tab?: string; label: string }): Kpi[]
export const pendingTile = (id: string, metricId: string, label: string, note: string): Kpi
```

Usage (FinHome.tsx:824-840):
```tsx
<HomeTop
  hero={budget ? <VsBudget m={m} /> : <VsPlan o={o} />}
  overview={<><KpiStrip id="home-fin-kpis" title="Key figures" kpis={kpis} span={8} /><BudgetByMonth m={m} /><CostByUnit m={m} /></>}
  attention={<AttentionSection items={items} shown={HOME_SHOWN} dek="..." />}
/>
```

### 2.13 Layout primitives (`src/lib/spans.ts`, `Section.tsx`, `useNarrow.ts`)

```ts
export type Span = 3 | 4 | 5 | 6 | 7 | 8 | 9 | 12
export function spanClass(span: Span = 12): string     // 'min-w-0 col-span-full md:col-span-6 lg:col-span-4' etc.
export const GRID_CLASS = 'grid grid-cols-1 gap-4 md:grid-cols-12 max-md:*:col-span-full'
export function Grid({ children, className }: { children: ReactNode; className?: string })
export function Section({ title, dek, actions, id, align, children, className }: {
  title: string; dek?: ReactNode; actions?: ReactNode; id?: string; align?: 'start'; children: ReactNode; className?: string })
export function useNarrow(): boolean            // area width < 768
export function useMinWidth(px: number): boolean
export const CHART_HEIGHT = { lead: [280, 220], standard: [220, 180], small: [96, 96] } as const
export function useChartHeight(role: keyof typeof CHART_HEIGHT = 'standard'): number
```

### 2.14 Formats (`src/lib/format.ts:8-34`)

```ts
export type Format = 'int' | 'compact' | 'num1' | 'num2' | 'pct' | 'pct0' | 'pct2' | 'pts' | 'pts2'
  | 'deltaDays' | 'deltaPct' | 'money' | 'moneyFull' | 'moneyM' | 'days' | 'hours' | 'years'
  | 'ratio' | 'times' | 'date' | 'text'
export const DASH = '—'      // the only allowed em dash: the missing-value placeholder
export const MINUS = '−'     // U+2212 for negatives
```
`moneyM`: "USD in millions, one decimal: $12.3M, $0.4M; under $100,000 reads "under $0.1M"
(Finance's rounded cost, src/lib/costRounding.ts)". There is no `fte` format and no local-currency
money format (all money is USD).

### 2.15 Filters, URL scope, saved views

```ts
// data/scope.ts
export type PeriodPreset = 't12m' | 'ytd' | 'lastQuarter' | 't6m' | 't3m' | 'custom'
export type FilterDimension = 'leaderId' | 'businessUnit' | 'department' | 'location' | 'level'
export type ListDimension = Exclude<FilterDimension, 'leaderId'>
export const LIST_DIMENSIONS: readonly ListDimension[] = ['businessUnit', 'department', 'location', 'level']
export const FILTER_DIMENSIONS: readonly FilterDimension[] = ['leaderId', ...LIST_DIMENSIONS]
export type FilterMode = 'include' | 'exclude'
export type FilterModes = Partial<Record<FilterDimension, FilterMode>>   // only exclusions stored
export interface Filters {
  period: PeriodPreset
  customStart: ISODate | null
  customEnd: ISODate | null
  leaderId: string | null
  businessUnit: string[]
  department: string[]
  location: string[]
  level: string[]
  modes: FilterModes
}
export const DEFAULT_FILTERS: Filters = { period: 't12m', customStart: null, customEnd: null, leaderId: null,
  businessUnit: [], department: [], location: [], level: [], modes: {} }

// data/urlScope.ts
export interface UrlScope { filters: Filters; standard: DataStandard; lens: boolean }
export const DIM_PARAM: Record<FilterDimension, string> = { leaderId: 'leader', businessUnit: 'bu', department: 'dept', location: 'loc', level: 'level' }
export const SCOPE_KEYS: readonly string[] = ['scope', 'period', 'from', 'to', ...FILTER_DIMENSIONS.map((d) => DIM_PARAM[d]), 'not', 'std', 'lens']
export function splitHash(hash: string): { route: string; query: string | null }
export function scopeParams(scope: UrlScope, opts: { explicit?: boolean } = {}): URLSearchParams
export function hashWithScope(route: string, scope: UrlScope, opts: { explicit?: boolean } = {}): string
export interface ReadScope { present: boolean; scope: UrlScope; unreadable: string[] }
export function readScope(query: string | null | undefined): ReadScope
export interface ScopeVocabulary { hasLeader: (id: string) => boolean; hasValue: (dim: ListDimension, value: string) => boolean; asOf?: ISODate }
export function vocabularyOf(ctx: { all: Pick<Datasets, 'employees' | 'requisitions' | 'hiringPlan'>; org: { byId: ReadonlyMap<string, unknown> }; asOf?: ISODate }): ScopeVocabulary
export type PeriodProblem = { kind: 'dates' } | { kind: 'clamped'; asOf: ISODate } | { kind: 'after'; asOf: ISODate }
export function checkScope(scope: UrlScope, vocab: ScopeVocabulary): { scope: UrlScope; leftOut: LeftOut[]; period: PeriodProblem | null }
export function leftOutMessage(leftOut: readonly LeftOut[], source = "The link's"): string
export const sameScope = (a: UrlScope, b: UrlScope): boolean

// data/savedViews.ts
export const VIEWS_KEY = 'census:views'; export const VIEWS_VERSION = 1
export const VIEW_NAME_MAX = 60; export const VIEWS_MAX = 50
export interface ViewPage { view: string; tab: string }
export interface SavedView { id: string; name: string; filters: Filters; standard: DataStandard; lens: boolean; page: ViewPage | null; example?: boolean }
export interface SavedViewsState { views: SavedView[]; startupId: string | null }
export function matchView(views: readonly SavedView[], scope: UrlScope, appliedId: string | null): { view: SavedView | null; edited: boolean }
export function addView(s: SavedViewsState, v: { name: string; scope: UrlScope; page: ViewPage | null }, id = newViewId()): SavedViewsState
export function sanitizeViews(raw: unknown, isRoute: IsRouteView): SavedViewsState   // untrusted input
export function loadViews(isRoute: IsRouteView, storage = storageOrNull()): SavedViewsState
export function saveViews(s: SavedViewsState, storage = storageOrNull()): void
// also updateView, renameView, moveView, removeView, restoreView, setStartup, viewsFileSection, importViewsSection

// data/exclusion.ts
export function activeEmployees(employees: readonly Employee[], asOf: ISODate): readonly Employee[]
export function peopleIn(people: readonly Employee[], filters: Filters, org: OrgIndex): number
export function smallExcludedValues(people: readonly Employee[], filters: Filters, org: OrgIndex, min: number): { dim: FilterDimension; value: string }[]
// app/filterOptions.ts
export const tooFewToLeaveOut = (count: number, min: number): boolean => count > 0 && count < min
export function offersExclude(mode: Mode, key: DimensionKey): boolean    // false where the clamp drops exclusions (Finance)
// access/scopes/clamp.ts:110
export function clampFilters(filters: Filters, scope: ScopeLock | null | undefined, mode?: Mode): Filters  // same object when unchanged
export const byWholeUnits = (mode: Mode | undefined): boolean => mode === 'finance' || (!!mode && payView(mode) === 'totals')
// metrics/privacy.ts:203
export const minGroupOf = (m: Pick<MetricsApi, 'num'>): number   // the anonymity minimum, 5
```

### 2.16 Theme

```ts
// app/useShell.ts
/** 'system' follows the OS (no attribute); 'light' and 'dark' pin the tokens. */
export function applyTheme(theme: ThemePref, root: HTMLElement = document.documentElement): void {
  if (theme === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', theme)
}
// charts/theme.ts
export interface ChartTheme { series: string[]; deemph: string; seq: {100..700}; div: string[];
  status: { good; warning; serious; critical }; tier: { gold; silver; bronze }; goodText; badText;
  ink; ink2; muted; grid; axis; rule; sheet; sheet2; sheet3; page; font: string; dark: boolean }
export function readChartTheme(): ChartTheme      // getComputedStyle(document.documentElement)
export function useChartTheme(): ChartTheme       // re-renders on prefers-color-scheme change or data-theme mutation
export function seriesColor(t: ChartTheme, i: number): string   // never cycles; >= 8 is deemph
```

---

## 3. Patterns and conventions

### 3.1 The drill contract: "a counted figure equals the rows its drill opens"
- Every number that counts something is wrapped: KPI value (`Kpi.drill`), change (`deltaDrill`),
  note (`noteDrill`), table cell (`Column.drill`), chart mark (`onSelect={(d) => drill(src(d))}`),
  finding (`Finding.drill`), hero (`valueDrill`), counts inside the panel (`DRILLS_KEY`).
- The source is lazy (`() => spec`) so rows are gathered on click only.
- One definition per count: engines expose a `xxxSpec(prep, row)` beside the number, and the
  number's row carries `records` (e.g. `BridgeRow.records`) so the drill is `row.records`.
  `related.ts` exists so that "the person card's count" and "the list it opens" share one function.
- Enforcement is per-view tests, not a global harness. Patterns:
  - `expect(resolveDrill(cell(row))?.rows).toHaveLength(row.n)` (comp/charts.test.ts:408,
    compliance/charts.test.ts:150, hrbp/engine/drill.test.ts:152 `rowsOf(bridgeSpec(p, r))` equals
    `Math.abs(r.people)`, actions/charts.test.ts:100).
  - `services/engine/drills.test.ts` header: "the records a number opens are exactly the records it
    counts (consistency), hidden numbers and small groups open nothing".
  - `records.test.ts` "links a view's own direct reports column when it counts the same people":
    an extra column only links when `value === shared count` (`whenCount`), else it opens nothing
    rather than the wrong people.
  - Runtime: the Developer page contract scan (`dev/contract.ts`) lists every KPI/finding without
    `drill`, `uses` or `metricId` as a gap (`FigureItemFacts`).
- Small groups: `drillWhen(cond, thunk)` returns undefined (plain text) when the group is under
  the minimum; the chart's `selectable` + `lockedNote` say "Fewer than 5 people".
- Rows outside the mode's scope are filtered by `rowsInScope(spec, ctx)` in the panel and counted
  in one muted line ("12 records outside APAC are not listed.").
- A kind the mode does not list (`drill:<kind>` hidden) renders the number as plain text.
- Cost totals never drill to amounts: `costPeopleDrill` lists the people (employees kind, cost
  center, no money) with note "Cost totals cover groups of 5 or more people. Individual pay is
  left out."

### 3.2 "Filter to this" (docs/FILTERS.md part 4)
- Producers set `DrillSpec.filter` only when the number counts a group of a filterable dimension:
  `byGroup('location', 'label', build)` for charts/tables, `groupFilter(dim, value)` in engines,
  `{ ...groupFilter(...), ...periodFilter(start, end) }` for a month bar. "Other (k)", "Not
  recorded", blanks: no filter. Groups keyed differently from the filters (department at exit):
  no filter. Several values with a name: `filterLabel` ("Asia Pacific").
- The panel shows "Filter to X" and "Leave out X" (`FilterActions`, DrillPanel.tsx:188-226) only
  when `isFilterable && filterInData(filter, vocabularyOf(ctx))` and `groupScopes` offers it.
- Action = `focusScope(filter, { mode, org, next, label })`: closes the panel, `guardFilters`
  (mode clamp), one history push, toast "Showing X" / "Left out X" with "Every view now shows
  {scope}{, period}." and Undo (history.back if still current, else re-set).
- Focus after close returns to the opener, else the same figure's `figcaption h3` (found by
  `figure[data-tour="figure-<id>"]`), else `#census-main`.
- Invariant (tested): after Filter to X from N, the same figure shows N for X and total N (count);
  same value (rate); 100% and same count (share). After Leave out X, total drops by exactly N.
  Checked from the default scope and `variants: true` (dimension included, excluded, one value,
  a leader's org, everyone but a leader's org).
- Finance: only business-unit groups are offered and never Leave out (clamp). HRBP unit scope:
  only groups inside the unit.

### 3.3 Include/Exclude rules (FILTERS.md part 3)
- One mode per dimension; AND across dimensions; only exclusions stored in `modes`.
- An exclusion that removes 1..min-1 active employees (min = `minGroupOf(ctx.metrics)`, 5) cannot
  be picked (`tooFewToLeaveOut`, option `disabled`) and the menu says why; Ask refuses such
  scopes; "Leave out" is not offered; "Filter to" is not offered if it would add one
  (`smallExcludedValues`, checked value by value). A value already picked stays removable.
- Exclusion with no values is idle and dropped (`dropIdleModes`), never written to the URL.
- A record with a blank value for an excluded dimension stays in.
- Finance: exclude switch hidden (`offersExclude` false): clamp turns exclusions into no filter.

### 3.4 URL format (FILTERS.md part 1, `urlScope.ts`)
- `#view.tab?period=t6m&bu=Silicon+Engineering&dept=A&dept=B&level=L4&not=bu&std=...&lens=1`.
- Defaults are omitted; `scope=all` means "reset to defaults" (copied links use `explicit`).
- Leader is an ID, never a name. Names never go in the URL. The hash never reaches a server.
- A URL without scope keys restores last filters from the browser and writes them with
  `replaceState`. Unknown values are dropped with a toast (`leftOutMessage`); a custom period past
  the as-of date is clamped (`periodMessage`).
- Each filter change pushes one history entry (coalesced ~600 ms or on menu close); opening a
  drill, Settings, Help never touches history.

### 3.5 Overview tab layout ("5 to 7 KPIs then the Readout")
- Canonical (views/hrbp/ui/Overview.tsx:173-187): `<Grid><KpiStrip kpis/>` full width, then the
  Readout in `col-span-full lg:col-span-4 max-md:order-1` beside a `lg:col-span-8` column holding
  the lead figure (280/220 px) and the rest. Phones: KPI strip (first 4), lead figure, readout
  (first 2), then sections (DESIGN-REFRESH 2.13).
- KPI counts come from VIEWS.md per view (Recruiting lists 7). NO test in Census asserts 5 to 7.
- Readout copy: title one sentence with the number; detail up to two sentences; one neutral
  action; severity sorted; max 6 per view (VIEWS.md Recruiting), first 4 shown.

### 3.6 Role home layout
- `HomeTop`: hero (span 4 `Hero`), overview (KpiStrip `span={8}` + lead charts), attention
  (Needs attention). On phones: hero, attention, then key figures (first item within two screens).
- Home KPIs are the producing views' own tiles re-linked with `tile(list, id, { view, tab, label })`.
- `views/home/engine/figures.test.ts`: every `<Figure`, `<Hero`, `<ListFigure` in home source has
  `metric={`; source has no `word — word` and no `'...!'`.

### 3.7 Tokens, type scale, dark mode
- Tokens only: no Tailwind palette colors, no literal hex in components (ARCHITECTURE.md). Token
  names: surfaces `--page --sheet --sheet-2 --sheet-3`; band `--band --band-ink --band-ink-2
  --band-muted --band-rule --band-chip --tab-idle --tab-idle-hover --overlay`; ink `--ink --ink-2
  --muted --on-ink`; lines `--rule --rule-strong --grid --axis`; interaction `--focus --link
  --hover-wash --press-wash`; series `--s1..--s8 --deemph`; sequential `--seq-100,200,250,300,400,
  450,500,600,700`; diverging `--div-neg-3..--div-neg-1 --div-mid --div-pos-1..3`; status `--good
  --warning --serious --critical --good-text --bad-text --good-wash --warning-wash --serious-wash
  --critical-wash`; tiers `--tier-gold/silver/bronze(+-wash)`; geometry `--radius-sheet 6px
  --radius-control 4px --radius-chip 3px --radius-mark 2px --gutter clamp(16px, 2.4vw, 32px)`;
  `--shadow-pop` (floating layers only; sheets never get a shadow). Fonts `--font-sans` (Archivo
  Variable, width axis 62-125%), `--font-mono` (JetBrains Mono), `--stretch-head: 84%`,
  `--stretch-tab: 88%`. Tailwind utilities via `@theme inline` (`bg-sheet`, `text-ink-2`,
  `border-rule`, `bg-hover`, `rounded-sheet`...).
- Type scale (index.css:81-113), the only sizes: `text-label` 11/1.35, `text-meta` 12/1.4,
  `text-small` 13/1.45, `text-body` 14/1.45, `text-title` 16/1.3 (every sheet title, 600,
  `cut-head`), `text-section` 20/1.2, `text-page-title` 28/1.1 (h1 and KPI values), `text-display`
  40/1.05, `text-hero` 48/1.0 (one hero per role home). `typeScale.test.ts` enforces it.
- Dark mode: three blocks in tokens.css (light `:root`; `@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {...} }`; `:root[data-theme="dark"] {...}`). Settings theme
  `system | light | dark` -> `applyTheme` sets `data-theme` on `<html>` in a layout effect. Charts
  read literal colors (`useChartTheme`) and re-render via a MutationObserver on `data-theme`. PNG
  export temporarily pins `data-theme="light"` (lib/export/image.ts:346-353).
- The `.band` class (masthead) re-points ink/sheet/rule tokens to light-on-graphite; `.on-desk`
  points them back.
- Breakpoints are area-aware: `sm/md/lg/xl/max-*` are redefined with `@container shell` so a page
  beside the docked Ask panel reflows. HCP has no Ask panel (Phase 3), so stock Tailwind
  breakpoints would do, but copying the variants is harmless.

### 3.8 375 px and no horizontal scroll
- Rule: `document.documentElement.scrollWidth === clientWidth` on every page at 375 x 812, light
  and dark, plus "first chart at or above 1,200 px", "KPI values aligned (1 px)", "nothing truncated
  in tiles" (DESIGN-REFRESH 5.2). These were checked in the browser by hand/DOM measurement; there
  is no DOM test.
- Guard-rail classes: `min-w-0` on grid children (`spanClass`), `max-md:*:col-span-full`, side
  sheet `w-[min(820px,100vw)]`, tables scroll inside their sheet (`.scroll-x` + pinned first
  column), header actions `max-w-full min-w-0 flex-wrap`, KPI strip `max-sm:grid-cols-2`.
- `kpiLayout.test.ts` pins the tile classes by regex (`content-start`, `max-sm:flex-col`,
  `break-normal`, `min-w-min`, no `min-w-0` on labels).
- Gutter 16 px on phones: `--gutter: clamp(16px, 2.4vw, 32px)`; sheet insets `px-4` (16) below
  1024, `px-5` (20) from 1024.

### 3.9 Copy rules and their tests
- Sentence case everywhere; no em dash in a sentence (`—` only as the missing-value placeholder);
  no `!`; no emoji; no nagging verbs; no click instructions in subtitles/notes; units always
  visible; windows always stated; IDs mono 12 px.
- Tests that scan copy (no single global scan):
  - `help/content.test.ts:99-109,356-380`: `sentenceCaseProblem(title)` with a `PROPER` allowlist;
    `hasEmDash = (s) => s.replace(/"—"/g, '').includes('—')`; no `!`; no
    `chase|chasing|nag|nagging|ping|hound|unblock`.
  - `views/home/engine/figures.test.ts:199-205`: source regex `/[A-Za-z0-9)]\s*—\s*[A-Za-z0-9(]/`
    and `/'[^'\n]*!'/`.
  - `views/actions/engine/wording.test.ts:51`: `/\s—\s|\w—\w/` on every item in every mode.
  - `views/hrbp/engine/findings.test.ts:380-391`: `/—|!/` on findings and talking points.
  - `metrics/catalog.test.ts`, `dev/security/copy.test.ts` and others also check em dashes.
- En dash is allowed for ranges ("1 Oct 2025 – 30 Sep 2026", `formatRange`); tests must not flag it.

### 3.10 Naming
- Figure ids: kebab-case, prefixed by view key (`hrbp-headcount-trend`), stable (tours, focus
  fallback and exports key on them via `data-tour="figure-<id>"`).
- Metric ids `<view>.<group>.<name>`. Drill titles plain ("Voluntary leavers in Bengaluru");
  subtitles "window or as-of · scope · qualifier".
- KPI strip ids: `key-figures` default; second strips `hrbp-movement-kpis`.

---

## 4. Tests to port

| Census test | Asserts | HCP adaptation |
|---|---|---|
| `src/drill/filterTo.test.ts` | Focus-on merge; action labels ("Filter to Allison Carter's org", "Filter to Q1 2026"); `namedScopeLabel`; no filter for "Other (4)"; narrowing with include/exclude/leader rules on a 4-node org; `byGroup` lazy and merges period; invariant on example producers with variants; no Leave out for groups < min; no Filter to that adds a small exclusion; values not in data | Same structure; org fixture is positions (`positionId`, `managerPositionId`); producers: Plan > Positions heads by unit/level/location, Openings by stage by unit, Forecast heads by month (with `periodFilter`). Add dimensions `costCenter`, `legalEntity`, `country` if adopted (see 6). |
| `src/drill/testing.ts` (helper) | `expectFilterTo`, `expectLeaveOut`, `scopeVariants` | Port verbatim against `PlanContext`; `valuesBySize` counts Filled heads (or costed people in cost figures). Add `expectDrillSums(figure, drill)` for weighted rows (see 5.3). |
| `src/drill/records.test.ts` | names resolved, person keys, empty columns dropped, extra column replaces standard, every kind renders, `pay: true` columns marked, ER cases never named, `drillNoun` | Every HCP kind renders; `baseSalary`, `offerBase`, per-position cost columns are `pay: true`; confidential elimination rows never name the person; backfill rows show the leaver's position ID not name; `drillNoun('positions', 1) === '1 position'`. |
| `src/drill/modes.test.ts` | hidden-kind numbers plain; records outside scope line; person card per mode; Finance lists have no pay; Filter to keeps to mode | Per HCP mode: Manager sees no amount columns and no Elimination of Manager C; Finance position lists have no person name/pay; HRBP unit scope; Leader tree. `ALL_DRILL_KINDS` equals `DRILL_KINDS`. |
| `src/drill/summary.test.ts`, `subtitle.test.ts`, `tier.test.ts`, `related.test.ts` | Summary cut at 10 rows; " · " subtitles with en dash; tier from `uses`; related counts equal lists | Summary by unit and level of positions; related = position's direct sub-positions, tree, its reqs, its requests. |
| `src/components/kpiModel.test.ts` | tone rules, dash for null/suppressed, export rows in units, trend columns, `tileTarget` | Port; add `fte` format unit and the comparison label ("vs FY27 Budget"). |
| `src/components/kpiLayout.test.ts` | class regexes for 375 alignment | Port verbatim (rename file paths). |
| `src/components/readoutModel.test.ts` | severity sort, people counted not named, tiers | Port verbatim. |
| `src/components/filterLabels.test.ts` | chips, "Not Sales", "Not in X's org", custom period words | Port; leader chip "Not in Priya Raman's org" uses position holder name or position title. |
| `src/styles/typeScale.test.ts` | no off-scale `text-[Npx]`/`rounded-[Npx]`; `text-page` never a size | Port; allowlist the HCP wordmark string. |
| `src/styles/tierTokens.test.ts` | contrast, dark blocks in step | Port verbatim (tokens unchanged). |
| `src/charts/DataTable.test.ts`, `cells.test.ts`, `core/*.test.ts`, `kit/*.test.ts` | table sort/format, safe hrefs, keyboard order, legend, notes placement, bullet model | Port the kit actually used; add `waterfallModel.test.ts` (steps sum to end; Rounding bar closes rounded steps). |
| `src/data/urlScope.test.ts`, `savedViews.test.ts` (exist) | URL round trip, unknown values, storage | Port with HCP keys (`ver`, `vs`, `cc`...) and `hcp:views`. |
| `src/views/home/engine/figures.test.ts` (source scan part) | `metric={` on every Figure/Hero/ListFigure; no em dash; no `!` | Port, widen to all of `src/views/**/ui/*.tsx`. |
| `src/help/content.test.ts` (wording part) | sentence case, em dash, `!`, nagging verbs | Port into a global HCP `src/copy.test.ts` (see 5.5). |
| `dev/contract.test.ts` | Developer contract model | Optional for HCP Phase 1 (no Developer page in the spec). |

Timeouts: Census's sample-based tests use `beforeAll(..., 60_000)` and per-test `60_000` /
`120_000` because `generateSample()` plus `buildContext` is slow; keep those on Windows.

---

## 5. HCP adaptation

### 5.1 Files (paths under `headcount-planner/`)

```
src/drill/types.ts          DrillRecordMap for HCP kinds; DrillSpec unchanged + `weight?` (5.3)
src/drill/Drill.tsx         as Census; add <Calc spec> sibling (or Drill accepting CalcSource)
src/drill/store.ts          DrillEntry adds { type: 'position'; positionId } and { type: 'calc'; spec: CalcSpec }
src/drill/DrillPanel.tsx    renders records | position | calc; `#hcp-main` fallback id
src/drill/PositionCard.tsx  replaces PersonCard: position facts, status history, assignment (name per mode), reqs, requests, audit
src/drill/CalcCard.tsx      NEW calculation card (5.3)
src/drill/calc.ts           NEW CalcSpec, evaluateCalc, calcFromSteps; pure
src/drill/calc.test.ts      NEW worked-example fixtures through the card model
src/drill/records.ts        KINDS for HCP; POSITION_KEY in place of PERSON_KEY; timed('hcp:drill:…')
src/drill/related.ts        position tree (subPositions, treePositions), reqsOf, requestsOf
src/drill/{filter,focus,guard,kinds,subtitle,summary,tier,testing,index}.ts  ported
src/drill/*.test.ts         filterTo, records, modes, summary, subtitle, tier, related, calc
src/components/{KpiStrip,Readout,Section,ui,icons,toast,Dialog,EmptyState,Pending,MultiSelect,RouteLink,currentView,navigation,useNarrow,mainArea,useTableFigure,styles}.tsx|ts
src/components/{kpiModel,readoutModel,filterLabels,types}.ts (+ tests), tier/*
src/charts/{Figure,FigureGate,DataTable,Sparkline,Legend,plot,theme,types,registry,figureView,useExportMeta,cells,index}.ts(x)
src/charts/core/*            ported as is
src/charts/kit/{BarList,BulletList,Columns,HBars,Heatmap,Lines,Meter,StatusSplit,groupDrill,shared,prepare,scale,series,hit,bulletModel}
src/charts/kit/Waterfall.tsx + waterfallModel.ts(+test)   NEW (bridge, FX effect); none exists in Census
src/styles/{tokens.css,index.css,typeScale.test.ts,tierTokens.test.ts}   `.hcp-plot` in place of `.census-plot`
src/data/{urlScope,savedViews,scope,exclusion}.ts (+ tests)
src/views/home/ui/{HomeTop,Frames,SplitBar,Attention}.tsx + {MyTeam,UnitPlan,RollupVsTarget,PlanVsActual}Home.tsx
src/copy.test.ts             NEW global copy scan (5.5)
src/brand.test.ts            spec: fails if "census" appears in src/ (5.6)
```

Drop from Census: `PersonCard`, `person.ts` (Census person summary), survey/leave/rightToWork/
onboarding kinds, `Pyramid`, `DotStrip`, `Scatter`, `RangeBars`, `TrendGrid`, `Histogram` (unless
Openings by age uses it), `__gallery__` (or keep as dev-only, not in the build).

### 5.2 HCP drill kinds (proposal)

```ts
export interface DrillRecordMap {
  positions: Position          // heads, approved heads, openings; opens PositionCard
  planLines: PlanLine          // position x version x month; amounts are pay:true per position
  assignments: Assignment      // HR admin / HRBP; names per mode
  workers: Worker              // "Not in plan" and reconciliation; leave fields pay:true
  reqs: Req                    // openings by stage and age; offerBase pay:true
  requests: HcRequest          // queue, mine, approvals, cycle asks
  targets: TargetRow
  freezes: Freeze
  assumptions: AssumptionRow
  audit: AuditEntry            // old/new read "changed" for pay/cost fields outside HR admin
  exceptions: ReconException   // 9 reconciliation exceptions
  costGroups: CostGroupRow     // grouped kind like LeaveGroupRow: unit/dept/sub-org totals, n, suppressed
  actionItems: ActionItemRow
  actionOwners: ActionOwnerRow
}
```
Each kind needs a `drill:<kind>` surface in `ROLE_POLICY` so `policy.test.ts` decides it for every
mode, and `column:<kind>.<key>` for columns a mode hides. Manager never gets `planLines` amounts,
`assignments` of others' trees, `audit` amounts; Finance never gets a position's person name with
an amount.

### 5.3 Calculation card (Census has none: design the nearest equivalent)

Census's nearest pieces: `Kpi.formula` (a sentence in the info popover), `Definition.formula`
(datasheet line), `MetricDef.formula/population`, and the drill panel. None shows inputs and
arithmetic for one number. Proposal, reusing the drill stack so Back and focus return work:

```ts
// src/drill/calc.ts
export interface CalcInput {
  label: string                 // "Bonus target", "Plan rate EUR"
  value: number | string | null // null renders "—" (cost guard)
  format: Format
  /** Where it came from: "Assumptions · Silicon Engineering · FY27 Working", or a version hash. */
  source: string
  /** Fallback level for assumptions: org, unit or company. */
  level?: 'org' | 'unit' | 'company'
}
export interface CalcStep {
  label: string                 // "Bonus = base × target % × funding %"
  expression: string            // "€110,000 × 10% × 100%"
  result: number | null
  format: Format
}
export interface CalcSpec {
  title: string                 // "September cost, P-1042 (band estimate)"
  subtitle?: string             // "FY27 Working · daily proration · plan rates"
  metricId: string
  value: number | null
  format: Format
  inputs: readonly CalcInput[]
  steps: readonly CalcStep[]    // the last step's result is `value` (tested)
  /** The rows the number adds up, with their contribution (Σ contribution = value, tested). */
  rows?: DrillSource            // "Show the 12 positions" pushes this records drill
  /** The comparison, when the number is a "vs" figure. */
  comparison?: { label: string; value: number | null }   // "vs FY27 Budget"
  note?: string                 // "Rounded for display only."
  uses: readonly FieldRef[]
}
export type CalcSource = CalcSpec | (() => CalcSpec | null) | null | undefined
```

- `Kpi` gains `calc?: CalcSource`; the tile's value is a `<Drill>` when `drill` is set, else a
  `<Calc>` when `calc` is set; a counted number keeps `drill` and may also offer "How it is
  calculated" from the info popover. Table cells gain `Column.calc`. Chart marks call
  `openCalc(src)`.
- `DrillEntry` adds `{ type: 'calc'; spec: CalcSpec }`; DrillPanel renders `CalcCard`: header
  "Calculation", title, inputs table (label, value, source), steps (mono `text-meta` expression,
  result right-aligned `tnum`), then a "Show the n records" button that `pushDrill`s `rows`.
- Cost guard inside the card: inputs and steps that would show a per-position amount (Filled seat,
  accepted offer, request person) render "—" outside HR admin with the switch, exactly like
  `pay: true` columns; group cards (n >= 5) show totals and the band-estimate inputs; Manager
  cards show heads only (no amount inputs).
- Generalized invariant for modeled numbers: a drill row may carry a weight
  (`DrillSpec.weight?: (row) => number`, shown as an extra "Counts as" column: 0.5 for a
  half-month start, 0.85 for a probability-weighted start, −1 for an elimination in Asks). Test:
  `Σ weight(row) === figure` (exact, before display rounding); counts keep `rows.length === figure`.
- Tests: every spec worked example as a CalcSpec fixture (Munich P4: €11,668.83 a month,
  €5,834.42 = $6,301.17 for September daily/half-month, $12,602.34 full-month; FX €120,000 at
  1.08 vs 1.15 = $8,400; the Dana double-count trap: Oct modeled 0.06, Nov 1.05) with
  `evaluate(steps).at(-1).result === value`.

### 5.4 Trade headcount between levels, regions, etc. (the user's added requirement)

UX proposal (engine belongs to What if; this is what the screen and drill need):
- A What if lever "Trade heads": from group A to group B, each a value of one filterable dimension
  (level, location/region, unit, cost center, job family). Ratio = average loaded cost per head of
  A ÷ that of B, where the average is over A's (B's) Open + Planned + Filled positions, using the
  band estimate (midpoint × FTE + standard loads, plan rates, USD). Giving up `n` heads in A buys
  `n × ratio` heads in B, shown to one decimal and rounded down to whole heads with the leftover
  cost stated ("Trade 4 P4 Munich heads for 5 P2 Bengaluru heads, ratio 1.34, $41,000 left").
- Each average is a modeled number: it opens a CalcCard (inputs: midpoint by level and zone,
  bonus %, burden caps, rate; steps; rows = the positions averaged). The "n positions" behind each
  average is a counted drill.
- Guard: averages need 5+ positions each side (else "—" and the lever is disabled with the reason
  "Fewer than 5 positions in Munich P4"). Using band estimates keeps HRIS pay out of it, so HRBP
  and Leader can see the ratio; Finance may switch to "HRIS average" with 5+ costed people.
  Manager (if offered at all) sees the ratio only, never amounts.
- Result shows heads and cost and gap against target under the guard; "Turn into requests"
  creates eliminations or level changes in A and new roles in B (or a Transfer when it is one
  person), with "Move budget too?" when it crosses sub-org targets; past a sub-org cost envelope
  it needs a Finance exception.
- Ambiguity to ask the user: "average headcount" may instead mean average FTE or average heads
  over a period (a heads-for-heads ratio). Default proposal: average loaded cost per head.

### 5.5 Copy checks (one global test)
`src/copy.test.ts`: walk `src/**/*.{ts,tsx}` (not tests), extract string literals and JSX text;
fail on `/[A-Za-z0-9)]\s*—\s*[A-Za-z0-9(]/` (allows `DASH` and `"—"`), `!` in user strings, the
nagging verbs, and Title Case in `label:`/`title:` literals (Census's `sentenceCaseProblem` with an
HCP `PROPER` list: Headcount Planner, Finance, HRBP, HR admin, FY27, Q1, P4, Northgate, Munich,
Haifa, Bengaluru, Hsinchu, Go-to-Market, Silicon Engineering, Systems & Software, Data room,
Acting as...). Keep en dashes legal.

### 5.6 Renames census -> hcp in this area
- `useCensus` -> `usePlanner` (focus.ts, navigation.ts); `#census-main` -> `#hcp-main`
  (DrillPanel.tsx:178); `timed('census:drill:…')` -> `timed('hcp:drill:…')` (records.ts:925);
  `.census-plot` -> `.hcp-plot` (plot.tsx:44, Figure.tsx:600, index.css:350-369);
  `HOVER_CLASS = 'census-hover'` -> `'hcp-hover'` (charts/core/attrs.ts:4); `VIEWS_KEY =
  'census:views'` -> `'hcp:views'`; saved-view copy "Open Census with this view" -> "Open Headcount
  Planner with this view"; `VIEWS_FULL` "the most Census keeps"; Gallery eyebrow.
- Comments mentioning Census also trip a naive `grep -i census src/` test: write the brand test to
  scan code and comments alike and keep comments clean, or scope it explicitly.

### 5.7 Filters and URL for HCP (proposal)
```ts
export type PeriodPreset = 'fy' | 'ytd' | 'qtd' | 'month' | 'custom'     // fiscal Apr-Mar
export type FilterDimension = 'leaderId' | 'businessUnit' | 'costCenter' | 'location' | 'level' | 'legalEntity' | 'country'
// leaderId holds a positionId (the tree is managerPositionId), never a name
```
URL keys: `period from to leader bu cc loc level le country not std lens` plus view-level `ver`
(version shown) and `vs` (comparison version, default Budget for Finance, plan of record
elsewhere). Version and comparison are not org filters (they never narrow people), so they live
beside `std`/`lens` in `UrlScope`, not in `Filters`. Currency is not a filter (never sum two
currencies): a reporting toggle "USD | local" that is only enabled when the scope has one currency.

---

## 6. Gotchas and spec conflicts

### 6.1 Census quirks
1. No DOM tests: Vitest runs `environment: 'node'`. The 375 px/no-sideways-scroll, dark/light and
   KPI alignment checks were browser checks; only class regexes are unit-tested. The HCP spec's
   "each home checked in light, dark and at 375 px" must be a scripted browser pass (Claude Browser
   `resize_window` 375x812 + `colorScheme`, then `document.documentElement.scrollWidth ===
   clientWidth`), recorded in the milestone report.
2. Shared components import view modules: `Figure`, `KpiStrip`, `Readout` import
   `@/views/data/metrics/ui/EditDefinition`, `@/views/data/quality-overview/LensLine`,
   `@/help/ui/LearnMore`, `@/app/datasetFocus`, `@/lib/export/*`, `@/metrics/api`,
   `@/metrics/overrides`. Porting the UX layer drags the metric dictionary, quality lens, help and
   export modules with it: stub or port them in the same milestone (M2) or tsc fails.
3. `KpiStrip`/`Figure` read `useAnalytics()` (`quality`, `metrics`, `access`, `standard`) and
   `useAnalyticsPending()`; HCP's context must provide the same fields or the components need a
   thin adapter.
4. `groupScopes` and `testing.ts` read `ctx.all.employees`, `activeEmployees`, `ctx.data` per
   dataset (`DATASET_KEYS.every(...)`): rewrite on positions/assignments. `vocabularyOf` reads
   `employees, requisitions, hiringPlan`.
5. `savedViews.ts` writes raw `localStorage` (`census:views`). Census also uses idb-keyval's
   DEFAULT store (no `createStore`), which on the shared `unique-name27.github.io` origin would
   collide with Census; HCP must use `createStore('headcount-planner', 'kv')` and `hcp:` keys for
   both IndexedDB and localStorage.
6. Drill-panel focus return has timer retries (`setTimeout(check, 250)`, 6 tries) because Base UI
   restores focus after Filter to removes the opener; keep `data-tour="figure-<id>"` on figures.
7. `Figure` keeps the chart mounted (hidden) under the table view so PNG/SVG export still works;
   `chartSvg` finds `svg.census-plot, svg[data-chart]`: rename the class in both places.
8. PNG export flips the whole page to light (`data-theme="light"`) during capture.
9. Sample-based tests are slow (60 to 120 s timeouts); on Windows run Vite/Vitest with the spec's
   `node --max-semi-space-size=64` incantation and keep `beforeAll` sample builds shared.
10. No waterfall chart and no FTE/local-currency formats exist; the Bridge, FX effect and
    "Rounding" bar need a new kit chart and model.
11. Help test allows `"—"` in quotes only; findings tests forbid `—` entirely; home figures test
    forbids `word — word`. Pick one rule for HCP (5.5).
12. `drillTarget` resolves lazy sources at render in modes that do not list every kind, so a
    builder that throws renders as a button and fails on click; HCP modes list few kinds
    (Manager), so drill builders must be cheap and total.
13. KPI `value` must be `null`, never 0, for missing; `kpiValueText` prints `DASH`. The cost guard's
    "—" for under-5 groups is the same `DASH` with `suppressed: true` and `SUPPRESSED_NOTE`.

### 6.2 Spec vs Census conflicts, with suggested resolutions
1. "Every counted number is a `<Drill>` with Filter to this": Census offers Filter to only for
   groups of a filterable dimension, and hides it when the filters can't say it, it changes
   nothing, or it breaks the anonymity rule. Resolution: every counted number drills; "Filter to"
   appears only where `DrillSpec.filter` is set (groups of unit/cost center/level/location/leader/
   month), as in Census.
2. "Counted figures equal the rows their drill opens" vs HCP's fractional numbers (average FTE,
   probability-weighted forecast starts, half-month proration, Asks with eliminations subtracted).
   Resolution: counts keep `rows.length === value`; weighted figures use a `weight` column with
   `Σ weight === value`; modeled numbers open a CalcCard whose `rows` drill satisfies the same sum.
3. "Modeled numbers open a calculation card": Census has no such card (only `Kpi.formula` sentences
   and `Definition.formula`). Resolution: new `CalcSpec`/`CalcCard` in the drill stack (5.3).
4. Finance filters (unit, cost center, legal entity, country, currency, version, period) vs
   Census Finance = whole business units, include only (`clampFinance`, `offersExclude` false,
   Filter to only for business units, never Leave out). Resolution: HCP clamp per mode:
   Finance = unit, cost center, legal entity, country + period, include only, Leave out never
   offered (fewer differencing paths even under the accepted risk); HRBP/Leader with cost =
   whole units and period only (spec 3.2 (b)); version and comparison are pickers, not filters;
   currency is a display toggle, not a filter.
5. Exclude/Leave-out small-group rule counts "active employees" in Census. HCP plans positions:
   count Filled heads for head figures and costed people (Filled + accepted offers) wherever cost
   shows, min 5 (`minGroupOf`). Planned/Open seats do not protect anyone and should not count.
6. Period presets: Census default `t12m` (rolling) does not fit a fiscal plan (FY27 Apr-Mar,
   as-of 30 Sep 2026, months closed Apr-Sep). Resolution: fiscal presets with default "FY27"; a
   month bar sets `period=custom` for that month as Census does.
7. "Overview tabs with 5 to 7 KPIs then the Readout": Census follows it by convention (VIEWS.md),
   with no test. Resolution: add an HCP test over each view's overview model (`kpis.length` in
   5..7, readout present) and keep Census's layout (Readout span 4 beside the lead figure; phones
   KPIs, lead figure, readout). Homes are not Overview tabs: they use HomeTop and may have 3 to 7
   tiles plus the hero.
8. "Each KPI names its comparison" with a picker (default Budget for Finance, plan of record
   elsewhere): Census's `deltaLabel` is free text ("vs prior 12 months"). Resolution: derive
   `deltaLabel` from the comparison picker ("vs FY27 Budget", "vs Q1 Reforecast") in one helper;
   `deltaDrill` opens the comparison version's rows.
9. Spec's "Figure ... metricId": Census's prop is `metric`, optional. Resolution: in HCP make
   `metric` and `uses` required in `FigureProps` unless `gate={false}`, and keep the home source
   test.
10. Drill rows that name a person: Census rows open a person card (`PERSON_KEY`). HCP rows are
    positions; names show per mode (Manager: own tree only; Finance: never with an amount;
    eliminations and Filled-seat changes show others only position ID, title, level, org;
    backfills show the leaver's position ID, never the name). Use `POSITION_KEY` and a
    PositionCard; Manager C's own confidential Elimination must not be in any drill, summary, count
    or audit row Manager C can open.
11. Readout "people" lists name people (`FindingPerson`). In HCP findings should list positions
    (`FindingPosition { positionId, title, note }`) to avoid tying a name to a cost or an
    elimination.
12. Trade headcount (new requirement) touches the cost guard: an average over fewer than 5 is
    banned ("No cost, rate or average over fewer than 5"). Use band-estimate averages over 5+
    positions per side; disable the lever otherwise (5.4).
13. The "census" ban test vs ported comments and class names: rename `census-plot`,
    `census-hover`, `census-main`, `census:views`, `useCensus`, `timed('census:…')`, Gallery
    copy, and every doc comment that says "Census" (many files open with "Census ..." or "in
    Census").
