# Census digest: views, registry, metrics, homes, Action center, My team

Area: `src/views/types.ts`, `registry.ts(+test)`, `src/views/hrbp/`, `src/views/home/`, `src/views/actions/`, `src/views/team/`, `src/metrics/`.
All paths below are relative to the Census repository unless they start with `headcount-planner/`.
Read only; nothing in Census was modified.

## 0. Ten facts a planner must know first

1. There is no `TabDef`. The tab type is `ViewTab` (`src/views/types.ts:9`). A view is a `ViewDef` with a React `View({tab})`, a pure `headline(ctx)`, `datasets`, and optional pure `summary(ctx)` / `actions(ctx)`.
2. A view never receives ctx as a prop. Every React part calls `useAnalytics()` (`src/data/context.tsx`), which returns one immutable `AnalyticsContext` (data, all, scope, filters, window, metrics, access/mode, quality). Pure engine functions take `ctx` as their first argument and are memoized in a `WeakMap<AnalyticsContext, Model>`.
3. `ViewDef` has no `metrics` field. A view registers metrics in its own `src/views/<key>/metrics.ts` through `defineMetrics('<key>', [...])`, and `src/metrics/catalog.ts` imports each view's file by hand.
4. `MetricDef` requires `id, name, views, definition, unit, goodDirection, uses, params`. `formula`, `population` and `window` are optional in the type, but tests force them: `catalog.test.ts` requires a `formula` on every metric, and `app/settings/formulaIndex.test.ts` requires `population` and `window` on every metric except rules and settings.
5. A metric id must start with its home view (`views[0]`). The only exceptions are the shared prefixes `privacy.` and `quality.` (`validateCatalog`, `src/metrics/registry.ts:135`). So the spec's `fin.exitRunRate` breaks this rule (see section 6).
6. KPIs (`Kpi`) and figures (`<Figure>`) point at the dictionary through `metricId` / `metric={...}` and declare lineage through `uses: FieldRef[]` (`'dataset.field'`). Definitions come from the dictionary (`p.text(id)`, `p.defs(...ids)`), never inline. Source-scanning tests enforce this per file.
7. Calculation settings are `ParamDef`s on a metric. Engines read them only through `ctx.metrics.num/flag/choice(id,key)`, wrapped in a lazy `settingsOf(m)`. A test records every read and fails when a registered setting is never read.
8. A metric's `views` list also gates who sees it: `decide(mode, 'metric:<id>', …, {metricViews})` shows the metric when any of its views is shown in that mode (`src/views/home/engine/finCostMetrics.test.ts`). `KpiStrip` drops tiles whose metric the mode hides.
9. The Action center is a page (`#actions`), not a ViewDef. It collects every view's `actions(ctx)`, folds and orders them, and splits them per mode into "Needs attention" and "Waiting on others" through a routing table in `src/access/policy/routing.ts`. Homes and My team reuse that split (`roleView`), so every count agrees. Mark handled and Snooze are kept in localStorage `census:actions`.
10. Homes are one `home` ViewDef whose body switches on `SLUG_OF[ctx.access.mode]`. Each role home is `<HomeTop hero overview attention/>`, then a `My list` Section, then a figures Section. Manager mode's home is a separate view, `team` (My team).

---

## 1. Inventory (files read)

| File | Job |
|---|---|
| `src/views/types.ts` (232) | `ViewTab`, `ViewDef`, `Headline`, `ViewSummary`, `ActionItem`, `ActionOwnerRole`, `ACTION_OWNER_ROLES/LABEL`, `withFeatureTabs`, `withAccessTabs` |
| `src/views/registry.ts` (56) | `VIEWS` (folder-tab order), `viewByKey`, `visibleViews(access)`, `folderViews(access)` |
| `src/views/registry.test.ts` (58) | `DATASETS[].usedBy` equals the views that declare each dataset, in folder-tab order; `VIEWS` order equals `VIEW_KEYS`; labels equal `VIEW_LABEL`; at least one tab per view, with unique tab keys |
| `src/data/context.tsx` (516) | `AnalyticsContext`, `buildContext(args)`, `AnalyticsProvider` (useDeferredValue), `useAnalytics()`, `useAnalyticsPending()` |
| `src/data/schema.ts:1318-1363` | `DatasetDef.usedBy`, `ViewKey` union, `VIEW_LABEL`, `VIEW_KEYS` |
| `src/data/quality/fieldRef.ts` | `FieldRef = \`${DatasetKey}.${string}\``, `KnownFieldRef`, `isFieldRef`, `invalidRefs` |
| `src/components/types.ts` | `Kpi`, `Finding`, `ViewLink`, `Severity` |
| `src/components/KpiStrip.tsx:374` | `KpiStrip({kpis,id,title,span,judge})`; hides tiles by mode (`kpisInMode`) and registers its table for export |
| `src/charts/Figure.tsx:87` | `FigureProps` (`id, title, data, columns, definitions, note, span, empty, uses, metric, gate, tableOnly, …`) |
| `src/app/headlineGate.ts(+test)` | folder-tab headline gated by tier; test: every view with datasets has `headline().uses` |
| `src/app/settings/formulaIndex.test.ts` | every metric has a formula; every non-rule metric has `population` and `window` |
| `src/metrics/types.ts` (313) | `MetricDef`, `ParamDef`, `ParamType`, `MetricView`, `MetricsApi`, overrides and change-log types |
| `src/metrics/define.ts` (32) | `defineMetrics(view, defs)`, `MetricInput` |
| `src/metrics/registry.ts` (190) | `catalogOf`, `withRequired`, `METRIC_VIEW_LABEL`, `readsNoData`, `validateCatalog` (ids, wording, views, lineage, params, targets) |
| `src/metrics/catalog.ts` (71) | assembles `METRICS`, `CATALOG`, `VIEW_METRICS`, `metricsOfView` |
| `src/metrics/api.ts` (322) | `metricsApi(state, catalog)` (cached per state), `defaultMetrics()`, `mergeDef`, `definitionOf`, `targetStatus`, `kpiTarget` |
| `src/metrics/params.ts` (469) | `validateParam`, `sameParam`, `formatParam`, `parseParamInput`, `paramDecimals` |
| `src/metrics/privacy.ts` (222) | `PRIVACY_METRICS` (locked rules), `ANONYMITY`, `minGroupOf(m)`, `surveyMinimumsOf` |
| `src/metrics/budget.ts` (133) | `BUDGET_METRIC_DEFS` (headcount and cost against budget, contractor estimate), `BUDGET_BAND_PARAMS` |
| `src/metrics/overrides.ts` (537) | pure reducers: `applyEdit(s)`, `checkEdit`, `undoChange`, `resetMetric/All`, `sanitizeMetricsState`, `EMPTY_METRICS`, `MAX_LOG=500` |
| `src/metrics/persist.ts` (81) | `METRICS_KEY='census:metrics'`, `loadMetrics`, `saveMetrics`, comp-cycle migration |
| `src/metrics/index.ts` | barrel (views must NOT import it) |
| `src/metrics/testing.ts` | `metricsWith`, `metricsWithEdits`, `recordParamReads`, `paramsOfView`, `paramRef` |
| `src/metrics/test-fixtures.ts` | `FIXTURE_DEFS` small catalog |
| `src/metrics/quality.ts`, `compCycle.ts`, `moved.ts`, `imports.ts`, `excel.ts` (skimmed) | data quality rules as metrics; comp cycle settings; renamed-settings migration; settings-file section; Excel dictionary |
| metrics tests: `catalog, api, params, privacy, overrides, persist, precision, targets, dateParams, moved, imports, excel` | see section 4 |
| `src/views/hrbp/index.tsx` | People stats ViewDef: 6 tabs (one `parts`), empty states, headline, `summary`, `actions` |
| `src/views/hrbp/metrics.ts` (1247) | `ID` map, `SET` setting refs, `INHERITS` (dependsOn), wording constants, `defineMetrics('hrbp', …)` |
| `src/views/hrbp/engine/index.ts` | `HrbpModel`, `computeHrbp`, `hrbpModel` (WeakMap cache), `hrbpHeadline` |
| `src/views/hrbp/engine/base.ts` | `Prep` (ctx, settings, `text`, `defs`, `uses`, `meets`, `has`), `prepare(ctx)`, `priorLabel`, `isMaterialGap`, `count()` |
| `src/views/hrbp/engine/settings.ts` | `HrbpSettings`, lazy `settingsOf(m)` (WeakMap cache) |
| `src/views/hrbp/engine/kpis.ts` | the 7 Overview tiles: headcount, hires, attrition, voluntary, regretted, first-year, promotion-rate |
| `src/views/hrbp/engine/lineage.ts` | `Lineage {need, optional}`, `need/optional/all/ifPresent/resolveLineage/allRefs`, `FIGURE` map, `HRBP_DATASETS` |
| `src/views/hrbp/engine/drillUses.ts` | `tagKpis`, `tagFindings`: drills inherit the number's `uses` |
| `src/views/hrbp/engine/wording.ts` | `definitionText`, `definitionsOf`, "Changed setting: …" notes |
| `src/views/hrbp/engine/actions.ts` | `hrbpSummary`, `hrbpActions` (stay conversations, span outliers) |
| `src/views/hrbp/engine/fixtures.ts` | `emp/many/leaver`, `ctxOf(partial, filters, asOf, metrics)`, `sampleCtx(filters, metrics)` |
| `src/views/hrbp/ui/*` | `Overview.tsx` layout (KpiStrip, then Readout span 4 beside lead figures span 8), `model.ts` (`useHrbp`), `defs.ts`, `HeaderActions.tsx` |
| `src/views/hrbp/analyses/*` (skimmed) | Special analyses plug-in pattern (`AnalysisDef`, model per analysis, `analysisModel(ctx,key)` cached) |
| hrbp tests: `metrics, itemContract, lineage, smoke, kpis, drill, defaultWording, base, filterTo, smoke.perf` | see section 4 |
| `src/views/home/index.tsx` | Home ViewDef: `title`, `figureless`, per-mode headline, all datasets, no summary or actions |
| `src/views/home/ui/HomeTop.tsx` (68) | `HomeTop({hero, overview, attention})`; phone order differs |
| `src/views/home/ui/HomePage.tsx` | mode to home switch, unset-pick empty state, small-scope note |
| `src/views/home/ui/Frames.tsx` | `Hero`, `ListFigure` (`home-list`, 50 rows), `ListSwitch` |
| `src/views/home/ui/Attention.tsx` | `AttentionSection`, `WaitFigure` (`home-attention-wait`), `AttentionList` (`home-attention`) |
| `src/views/home/ui/HrbpHome.tsx`, `FinHome.tsx` | worked role homes (KeyFigures, vs budget hero, My list, risks) |
| `src/views/home/ui/useHomeItems.ts`, `useIdleModel.ts` | Action center split for the home; idle-time model per ctx and key |
| `src/views/home/engine/{figures,kpis,attention,compare,title,split,previews}.ts` | `HOME_FIGURES`, `SLUG_OF`, `tile()`, `pendingTile()`, `waitRows`, `attentionRows`, `HOME_SHOWN=8`, `comparisonOpens`, `homeTitle` |
| home tests: `engine.test, figures.test, scope.test, figureless.test, finCostMetrics.test` | see section 4 |
| `src/views/actions/index.tsx`, `metrics.ts` | exports `ActionCenter`, `useRoleItems`, `useOpenActionCount`; metrics `M`, `P`, `DEFAULTS`, `ITEM_USES` |
| `src/views/actions/engine/*` | `collect` (gather, scope widen, dedupe by matter, severity, tier tag, order, idle schedule), `roles` (`roleView`), `rollups`, `severity`, `due`, `kind`, `marks`, `note`, `rows`, `summary` (`actionKpis`), `settings`, `roleKit` (`modeCtx`) |
| `src/views/actions/ui/{ActionCenter,store,useCollected}` | page, marks store (localStorage + storage event), hooks |
| actions tests (17 files) | see section 4 |
| `src/access/policy/routing.ts`, `src/access/items.ts` (skimmed) | `ROUTING: Record<Mode, ModeRouting>` rules per mode; `itemShown`, `itemInScope`, `RoleLens`, `roleItems` |
| `src/views/team/*` | My team ViewDef, `TeamPage`, `teamKpis`, `teamLists`, `waitingKpi`, `TEAM_FIGURES`, `rules.test.ts` |
| `src/views/scorecard/views.ts` | `OTHER_VIEWS`: views imported one by one to avoid a registry cycle |
| `docs/VIEWS.md:14-86`, `docs/METRICS.md` (outline) | view contract prose |

---

## 2. Contracts (verbatim TS)

### 2.1 `src/views/types.ts` (comments abridged, fields verbatim)

```ts
import type { ComponentType } from 'react'
import type { Finding, Kpi, Severity } from '@/components/types'
import type { AnalyticsContext, Features } from '@/data/context'
import type { FieldRef } from '@/data/quality/fieldRef'
import type { DatasetKey, ISODate, ViewKey } from '@/data/schema'
import type { DrillSource } from '@/drill/Drill'
import type { DrillKind } from '@/drill/types'

export interface ViewTab {
  key: string
  label: string
  /** Shown only while this Settings switch is on. */
  feature?: keyof Features
  /** The tab has parts named in the address after a colon ("analyses:quality"). */
  parts?: true
}

export function withFeatureTabs(view: ViewDef, features: Features): ViewDef {
  if (!view.tabs.some((t) => t.feature)) return view
  return { ...view, tabs: view.tabs.filter((t) => !t.feature || features[t.feature]) }
}

export function withAccessTabs(view: ViewDef, access: Pick<AnalyticsContext['access'], 'can'>): ViewDef {
  const tabs = view.tabs.filter((t) => access.can(`tab:${view.key}.${t.key}`))
  return tabs.length === view.tabs.length ? view : { ...view, tabs }
}

/** The live number printed on a view's folder tab. Must be cheap to compute. */
export interface Headline {
  value: string
  label: string
  metricId?: string
  spark?: (number | null)[]
  uses?: readonly FieldRef[]
}

export interface ViewSummary {
  kpis: Kpi[]
  findings: Finding[]
}

export type ActionOwnerRole =
  | 'manager' | 'hrbp' | 'recruiter' | 'coordinator' | 'hr-ops' | 'payroll' | 'it'
  | 'facilities' | 'trade-compliance' | 'immigration' | 'talent' | 'total-rewards'
  | 'finance' | 'benefits'

export const ACTION_OWNER_ROLES: readonly ActionOwnerRole[] = [ /* same order as the union */ ]
export const ACTION_OWNER_LABEL: Record<ActionOwnerRole, string> = {
  manager: 'Managers', hrbp: 'HR business partners', recruiter: 'Recruiters',
  coordinator: 'Recruiting coordinators', 'hr-ops': 'People operations', payroll: 'Payroll',
  it: 'IT', facilities: 'Facilities', 'trade-compliance': 'Trade compliance',
  immigration: 'Global mobility', talent: 'Talent management', 'total-rewards': 'Total rewards',
  finance: 'Finance', benefits: 'Benefits',
}

export interface ActionSubject {
  kind: DrillKind | 'none'
  id?: string
  label: string
}

export interface ActionItem {
  /** Stable across recomputes: '<view>:<kind>:<record id>'. */
  id: string
  ownerRole: ActionOwnerRole
  ownerId?: string | null
  ownerName: string
  due?: ISODate | null
  severity: Severity
  /** Plain words, no imperatives, no closing full stop. */
  what: string
  subject: ActionSubject
  view: ViewKey
  tab?: string
  drill?: DrillSource
  note?: string
  uses?: readonly FieldRef[]
  /** Category-level label ("Interview decision"). */
  kind?: string
  /** Same matter across views ("license:E12069"): one survives. Built from IDs, never labels. */
  matter?: string
  /** Changes when content changes: a handled mark with another fingerprint reopens. Roll-ups set it. */
  fingerprint?: string
  size?: number
  /** Money only in an `Amount (USD)` pay column, never in `what` or `note`. `rounded`: Finance $100k floor. */
  amount?: { usd: number; label: string; rounded?: boolean }
  exposure?: boolean
  closesWhen?: string
  place?: { businessUnit?: string | null; region?: string | null; location?: string | null }
  batch?: { key: string; label: string }
  forOwner?: { what: string; subject?: string; due?: ISODate | null }
}

export interface ViewDef {
  key: ViewKey
  label: string
  /** Page h1 when not the label (Home names the role's home). */
  title?: (ctx: AnalyticsContext) => string
  /** Draws no figures in this context (header drops quality switch and figure exports). */
  figureless?: (ctx: AnalyticsContext) => boolean
  /** Sub-tabs; the first one is the default. */
  tabs: ViewTab[]
  View: ComponentType<{ tab: string }>
  headline: (ctx: AnalyticsContext) => Headline
  /** Datasets the view reads, for badges and empty states. */
  datasets: DatasetKey[]
  HeaderActions?: ComponentType
  /** Key numbers and readout for the People scorecard (pure, cheap). */
  summary?: (ctx: AnalyticsContext) => ViewSummary
  /** Open items for the Action center (pure). */
  actions?: (ctx: AnalyticsContext) => ActionItem[]
}
```

### 2.2 `src/views/registry.ts` (verbatim body)

```ts
export const VIEWS: ViewDef[] = [home, team, scorecard, recruiting, onboarding, hrbp, org, services, talent, comp, compliance, listening, ai]
export const viewByKey = new Map(VIEWS.map((v) => [v.key, v]))
type ViewAccess = Pick<AnalyticsContext['access'], 'can' | 'mode'>
export function visibleViews(access: ViewAccess): ViewDef[] {
  return VIEWS.filter((v) => access.can(`view:${v.key}`)).map((v) => withAccessTabs(v, access))
}
export function folderViews(access: ViewAccess): ViewDef[] {
  return visibleViews(access).filter(
    (v) => (v.key !== 'team' || access.mode === 'manager') && (v.key !== 'home' || access.mode !== 'developer'),
  )
}
```

`src/data/schema.ts:1331`: `export type ViewKey = 'home' | 'team' | 'scorecard' | …` and `export const VIEW_LABEL: Record<ViewKey, string> = { home: 'Home', team: 'My team', … }` and `export const VIEW_KEYS = Object.keys(VIEW_LABEL) as ViewKey[]`. `DatasetDef.usedBy: ViewKey[]` (line 1318) is hand-maintained and checked by the registry test.

### 2.3 `src/components/types.ts` (verbatim fields)

```ts
export interface ViewLink { view: RouteView; tab?: string; label: string }

/** A headline number. Missing data is `null` (renders "—"), never 0. */
export interface Kpi {
  id: string
  metricId?: string                 // dictionary entry; popover reads the definition from it
  label: string
  value: number | null
  format: Format
  delta?: number | null             // change vs the comparison, same unit as value
  deltaLabel?: string               // "vs prior 12 months", "vs company", "vs $1.2M budget"
  goodDirection?: 'up' | 'down' | null
  deltaMaterial?: boolean           // color the delta only when material
  spark?: (number | null)[]         // up to ~12 points, oldest first
  note?: string
  suppressed?: boolean              // "Hidden to protect anonymity"
  suppressedNote?: string
  tab?: string                      // tab of this view to open
  link?: ViewLink                   // tab of another view, in place of `tab`
  definition?: string               // from the dictionary (p.text(metricId))
  formula?: string                  // "166 voluntary exits over an average headcount of 1,383, annualized."
  drill?: DrillSource               // records behind the value
  deltaDrill?: DrillSource          // records behind the comparison
  noteDrill?: DrillSource
  uses?: readonly FieldRef[]
}
export type Severity = 'critical' | 'warning' | 'info' | 'good'
export interface FindingPerson { id: string; name: string; note?: string }
export interface Finding {
  id: string; metricId?: string; severity: Severity; title: string; detail?: string; action?: string
  people?: FindingPerson[]; peopleTotal?: number; filter?: Partial<Filters>; filterLabel?: string
  tab?: string; drill?: DrillSource; uses?: readonly FieldRef[]
}
```

`Format` (`src/lib/format.ts:8`): `'int' | 'compact' | 'num1' | 'num2' | 'pct' | 'pct0' | 'pct2' | 'pts' | 'pts2' | 'deltaDays' | 'deltaPct' | 'money' | 'moneyFull' | 'moneyM' | 'days' | 'hours' | 'years' | 'ratio' | 'times' | 'date' | 'text'` (`moneyM`: millions, one decimal, under $100,000 reads "under $0.1M").

`DrillSource` (`src/drill/Drill.tsx:17`): `DrillSpec | (() => DrillSpec | null) | null | undefined`. Helpers: `resolveDrill`, `drill(src)`, `drillSpec<K>(spec)`, `drillWhen(has, build)` (`views/hrbp/ui/drill.ts:27`).

### 2.4 How a view gets ctx: `AnalyticsContext` (`src/data/context.tsx:82`, verbatim fields)

```ts
export interface AnalyticsContext {
  asOf: ISODate
  window: Window
  prior: Window
  filters: Filters
  scopeLabel: string
  isCompany: boolean                 // no org filter and no scope
  data: Datasets                     // org-scoped, after reference mappings and the mode's scope
  all: Datasets                      // unscoped (company benchmarks); never narrowed by mode
  org: OrgIndex
  sources: Record<DatasetKey, SourceMeta>
  isSample: boolean
  showPay: boolean                   // per-person pay amounts allowed (switch on, mode allows)
  showCost: boolean                  // group cost totals allowed (showPay, or Finance always)
  showImmigration: boolean
  features: Features
  quality: QualityIndex
  standard: DataStandard
  reference: ReferenceSummary
  metrics: MetricsApi                // the dictionary with overrides; engines read settings here
  jobs: JobArchitecture
  offerDeclineReasons: readonly ListValue[]
  universities: readonly ListValue[]
  access: AccessContext              // { mode, scope, lock, unset, pay, decide, can }
  regions?: RegionIndex
}
```

`buildContext(args)` (`context.tsx:227`) is the pure constructor used by tests and the provider. It takes `{ data, sources, filters, asOfOverride, showPay, showImmigration?, features?, today?, versions?, mappings?, applied?, standard?, quality?, metrics?, access?: AccessInput, lists?, regions?, departmentParents?, regionOwners? }`. Without `metrics` it uses `defaultMetrics()`; without `access` it uses HR. Sequence: apply reference mappings, then `scopeFor(mode, picks)`, then `clampFilters(filters, scope, mode)`, then `periodWindows`, then `data = applyScope(scopeDatasets(all, filters, org), scope)`, then `access = accessFor(mode, scope, metrics, unset)`.

`AnalyticsProvider` builds the value with `useMemo` and passes it through `useDeferredValue`. `useAnalyticsPending()` is true while the newer ctx computes, and `Figure`/`KpiStrip` fade to 60%. `AnalyticsProvider access={...}` gives an off-screen tree its own mode (figure scans, exports).

`AccessContext` (`src/access/context.ts:14`): `{ mode: Mode; scope: ScopeLock | null; lock: OrgScope | null /*deprecated*/; unset: boolean; pay: PayView; decide(surface, at?, info?): Decision; can(surface, at?, info?): boolean }`. Surface strings used in my area: `view:<key>`, `tab:<view>.<tab>`, `metric:<id>`, `figure:<id>`, `item:<id>`, `drill:<kind>`, `page:actions`, `ui:attention-lists`, `ui:kpi-delta-company`, `export:monthly-report`.

### 2.5 `src/metrics/types.ts` (verbatim, comments abridged)

```ts
export type MetricView = ViewKey | 'data' | 'actions'
export type RatingKey = 1 | 2 | 3 | 4 | 5
export type RatingMap = Record<RatingKey, number>
export type NumberRange = readonly [number, number]
export type ParamType = 'number' | 'percent' | 'days' | 'months' | 'boolean' | 'choice' | 'ratingMap' | 'range' | 'date'
export type ParamValue = number | boolean | string | RatingMap | NumberRange
export interface ParamChoice { value: string; label: string }

export interface ParamDef {
  key: string                // camelCase, unique within the metric
  label: string              // sentence case
  description: string
  type: ParamType
  default: ParamValue
  min?: number
  max?: number
  step?: number
  choices?: readonly ParamChoice[]
  locked?: 'raiseOnly' | true
  format?: Format
}

export type TargetComparator = '>=' | '<=' | '<'
export interface MetricTarget { value: number; comparator: TargetComparator }
export interface SettingRef { readonly metricId: string; readonly key: string }
export interface UsesWhen {
  setting: { readonly metricId?: string; readonly key: string }
  value: ParamValue
  uses: readonly FieldRef[]
}

export interface MetricDef {
  /** `<view>.<group>.<name>`, e.g. 'hrbp.attrition.voluntary'. Stable: overrides are kept by id. */
  id: string
  /** What HR people call it: "Voluntary attrition". */
  name: string
  /** Where it appears; the first is its home view. */
  views: readonly MetricView[]
  definition: string
  formula?: string           // "voluntary exits ÷ average headcount × (12 ÷ window months)"
  population?: string        // "Employees only; contractors and interns excluded."
  window?: string            // "The period picker (default last 12 months)"
  unit: Format
  goodDirection: 'up' | 'down' | null
  target?: MetricTarget
  targetRequired?: boolean
  targetUsed?: boolean
  uses: readonly FieldRef[]
  usesWhen?: readonly UsesWhen[]
  readoutUses?: readonly FieldRef[]
  dependsOn?: readonly string[]
  owner?: string
  params: readonly ParamDef[]
  locked?: boolean
  requires?: readonly FieldRef[]   // subset of uses
  kind?: 'rule' | 'setting'
}

export type TextField = 'definition' | 'formula' | 'population' | 'owner'
export const TEXT_FIELDS: readonly TextField[] = ['definition', 'formula', 'population', 'owner']
export type MetricField = TextField | 'target' | `params.${string}`
export interface MetricOverride { text: Partial<Record<TextField, string>>; target?: MetricTarget | null; params: Record<string, ParamValue> }
export type MetricOverrides = Readonly<Record<string, MetricOverride>>
export type LoggedValue = string | ParamValue | MetricTarget | null
export type ChangeKind = 'edit' | 'undo' | 'reset' | 'import' | 'migration'
export interface MetricChange { id: string; metricId: string; field: MetricField; from: LoggedValue; to: LoggedValue; at: string; by?: string; kind: ChangeKind }
export interface MetricsState { overrides: MetricOverrides; log: readonly MetricChange[] }
export interface MetricEdit { metricId: string; field: MetricField; value: unknown }
export type EditResult = { ok: true; state: MetricsState; change: MetricChange | null } | { ok: false; error: string }
export interface ChangeBehind { metricId: string; fields: readonly MetricField[]; role: 'self' | 'source' | 'rule' }

export interface MetricsApi {
  readonly list: readonly MetricDef[]
  def(id: string): MetricDef | undefined
  defaultDef(id: string): MetricDef | undefined
  paramDef(id: string, key: string): ParamDef | undefined
  param<T extends ParamValue = ParamValue>(id: string, key: string): T   // throws on unknown id/key
  num(id: string, key: string): number
  flag(id: string, key: string): boolean
  choice(id: string, key: string): string
  ratings(id: string, key: string): RatingMap
  range(id: string, key: string): NumberRange
  target(id: string): MetricTarget | null
  isChanged(id: string): boolean
  changedFields(id: string): readonly MetricField[]
  sourcesOf(id: string): readonly string[]
  changesBehind(id: string): readonly ChangeBehind[]
  usesOf(id: string): readonly FieldRef[]
  readonly changedCount: number
  readonly changes: readonly MetricChange[]
  readonly state: MetricsState
}
```

Note: the `window` text field cannot be overridden (`TEXT_FIELDS` omits it). `mergeDef` only merges definition, formula, population, owner and target.

### 2.6 `src/metrics/define.ts` (verbatim)

```ts
export type MetricInput = Omit<MetricDef, 'views' | 'params'> & {
  views?: readonly MetricView[]
  params?: readonly ParamDef[]
}
export function defineMetrics(view: MetricView, defs: readonly MetricInput[]): MetricDef[] {
  return defs.map((d) => ({
    ...d,
    views: [view, ...(d.views ?? []).filter((v) => v !== view)],
    params: d.params ?? [],
  }))
}
```

### 2.7 `src/metrics/registry.ts`: catalog and checks

```ts
export interface MetricCatalog { readonly list: readonly MetricDef[]; readonly byId: ReadonlyMap<string, MetricDef> }
export function catalogOf(defs: readonly MetricDef[]): MetricCatalog          // first id wins
export const paramOf = (def: MetricDef, key: string): ParamDef | undefined
export const paramField = (key: string): MetricField => `params.${key}`
export function withRequired(defs: readonly MetricDef[], required: readonly MetricDef[]): MetricDef[]
export const METRIC_VIEW_LABEL: Record<MetricView, string> = { ...VIEW_LABEL, data: 'Data room', actions: 'Action center' }
const SHARED_PREFIXES = ['privacy', 'quality']
export function readsNoData(def): boolean   // kind rule|setting, or shared prefix, or locked && uses.length===0
const ID_PATTERN = /^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9-]+)+$/
const KEY_PATTERN = /^[a-z][a-zA-Z0-9]*$/
export function validateCatalog(defs: readonly MetricDef[]): string[]
```

`validateCatalog` reports, one sentence each:
- duplicate id;
- id not matching `ID_PATTERN`;
- id prefix not equal to `views[0]` (unless the prefix is `privacy` or `quality`);
- missing name, missing definition, or empty `views`;
- a view not in `METRIC_VIEW_LABEL`;
- a `uses` or `readoutUses` entry that is not a schema `FieldRef`;
- a `requires` entry not listed in `uses`;
- a setting: duplicate key, key not camelCase, missing label or description, `min > max`, a choice without choices, `raiseOnly` on a non-number, a default that fails validation or is off its step;
- an invalid target, or `targetRequired` without a target;
- a `usesWhen` that names an unknown setting or a value the setting can't take;
- a `dependsOn` on itself or on an unregistered metric;
- copy problems in definition, formula, population and window: an em dash between alphanumerics, or any "!".

### 2.8 `src/metrics/catalog.ts`

```ts
export const VIEW_METRICS: Readonly<Partial<Record<MetricView, readonly MetricDef[]>>> = { scorecard, recruiting, …, data: dataRoom, actions }
export const METRICS: readonly MetricDef[] = withRequired([...each view's metrics in folder-tab order, ...dataRoom, ...actions, ...PRIVACY_METRICS, ...QUALITY_METRICS], [...COMP_CYCLE_METRICS, ...BUDGET_METRIC_DEFS])
export const CATALOG: MetricCatalog = catalogOf(METRICS)
export const metricsOfView = (view: MetricView, catalog: MetricCatalog = CATALOG): MetricDef[] => catalog.list.filter((d) => d.views.includes(view))
```

### 2.9 `src/metrics/api.ts` helpers used by UI and engines

```ts
export function metricsApi(state: MetricsState, catalog: MetricCatalog = CATALOG): MetricsApi   // WeakMap<state, WeakMap<catalog, api>>
export const defaultMetrics = (catalog: MetricCatalog = CATALOG): MetricsApi => metricsApi(EMPTY_METRICS, catalog)
export type MetricDefinition = Definition & { readonly metricId: string }
export function definitionOf(m: Pick<MetricsApi, 'def'>, id: string): MetricDefinition | null   // {term: name, text: definition, formula?, metricId}
export function definitionsStamp(m: Pick<MetricsApi, 'changedCount'>): string | null
export function targetStatus(value, target): 'met' | 'missed' | null
export function kpiTarget(m, metricId, value, format): { target: MetricTarget; status: 'met' | 'missed' } | null   // same unit family only
```

`sourcesOf(id)` follows `dependsOn` transitively and appends `privacy.anonymity` for any metric that reads data. `changesBehind` lists the metric's own changed fields, then its sources' changed settings (and targets when `targetRequired`/`targetUsed`), then changed quality rules.

### 2.10 Privacy rules (`src/metrics/privacy.ts`)

```ts
export const ANONYMITY = { metricId: 'privacy.anonymity', key: 'minGroup' } as const   // number, default MIN_GROUP=5, min 5, max 50, locked 'raiseOnly'
export const PAY_AMOUNTS = { metricId: 'privacy.payAmounts', key: 'optIn' } as const    // boolean true, locked true
export const PROTECTED_FIELDS = { metricId: 'privacy.protectedFields', key: 'excluded' } as const
export const minGroupOf = (m: Pick<MetricsApi, 'num'>): number => m.num(ANONYMITY.metricId, ANONYMITY.key)
```

Each rule entry has `locked: true, kind: 'rule', uses: [], owner: 'People analytics'` plus a formula. Engines must read the minimum through `minGroupOf(ctx.metrics)`, never the `MIN_GROUP` constant. The hrbp settings test checks that it is read.

### 2.11 Overrides, persistence, test helpers

```ts
// overrides.ts
export const EMPTY_METRICS: MetricsState = { overrides: {}, log: [] }
export const MAX_LOG = 500
export const MAX_TEXT: Record<TextField, number> = { definition: 2000, formula: 500, population: 1000, owner: 120 }
export function applyEdit(state, catalog, edit: MetricEdit, opts?: ChangeOpts): EditResult
export function applyEdits(state, catalog, edits, opts?): BatchResult   // { state, applied, rejected }
export function checkEdit(def, field, value): { ok: true; value: LoggedValue } | { ok: false; error: string }
export function sanitizeMetricsState(raw: unknown, catalog): MetricsState
// persist.ts
export const METRICS_KEY = 'census:metrics'   // localStorage, { version: 1, overrides, log }
export function loadMetrics(catalog, storage?): MetricsState
export function saveMetrics(state, storage?): void   // never throws
// testing.ts
export function metricsWith(params: Record<metricId, Record<key, value>>, catalog?): MetricsApi   // throws on a refused edit
export function metricsWithEdits(edits, catalog?): MetricsApi
export const paramRef = (metricId: string, key: string): string => `${metricId}#${key}`
export function recordParamReads(api: MetricsApi): { metrics: MetricsApi; reads: Set<string> }
export function paramsOfView(view: MetricView, catalog?): string[]   // every param of metrics whose views[0] === view
```

### 2.12 Lineage (`src/views/hrbp/engine/lineage.ts`, verbatim)

```ts
type Ref = KnownFieldRef
export const HRBP_DATASETS: readonly DatasetKey[] = ['employees', 'jobChanges', 'reviews']
export interface Lineage { readonly need: readonly Ref[]; readonly optional: readonly (readonly Ref[])[] }
export const need = (...refs: Ref[]): Lineage => ({ need: refs, optional: [] })
export const optional = (...refs: Ref[]): Lineage => ({ need: [], optional: [refs] })
export function all(...parts: Lineage[]): Lineage
export const ifPresent = (l: Lineage): Lineage => ({ need: [], optional: [...(l.need.length ? [l.need] : []), ...l.optional] })
export const NONE: Lineage = { need: [], optional: [] }
export function resolveLineage(l: Lineage, present: (ref: FieldRef) => boolean): FieldRef[]
export const allRefs = (l: Lineage): Ref[] => [...new Set([...l.need, ...l.optional.flat()])]
export const FIGURE = { scorecard: (dim, withPromotions, rule) => all(…), headcountTrend: PAST_HEADCOUNT, hiresExits: all(HIRES, EXITS), … } as const
```

`Prep.uses(...parts)` resolves a lineage plus the fields the active org filters read (`scopeLineage(ctx.filters)`). An optional group counts only when each of its fields holds data. A metric's `uses` in `metrics.ts` is `allRefs(lineage)`, so the dictionary and the tiles share one lineage constant.

### 2.13 `Figure` props that matter here (`src/charts/Figure.tsx:87`)

```ts
export interface FigureProps<T extends object> {
  id: string                      // stable kebab-case, unique, prefixed with the view key
  title: string; subtitle?: string
  data: readonly T[]; columns: readonly Column<T>[]   // Column: { key, label, format?, drill?: (row) => DrillSource }
  definitions?: readonly Definition[]                 // from the dictionary: p.defs(...ids)
  note?: string; span?: FigureSpan; actions?: ReactNode
  empty?: string | null | false; emptyAction?: ReactNode; emptyHeight?: number
  variant?: 'default' | 'compact'; detail?: FigureDetail
  tableOnly?: boolean; image?: boolean; tableToggle?: boolean; table?: FigureTableOptions<T>
  uses?: readonly FieldRef[]      // tier = lowest of these
  metric?: string                 // dictionary entry
  gate?: boolean                  // default true; Data room passes false
  exportMeta?: Partial<ExportMeta>
  className?: string; children?: ReactNode
}
```

`KpiStrip({ kpis, id = 'key-figures', title = 'Key figures', span = 12, judge?: TileJudge, className })`. It drops tiles whose `metric:` surface is hidden, shows each tile's target status (`kpiTarget`) and registers its table for export.

### 2.14 Home contracts

```ts
// ui/HomeTop.tsx
export function HomeTop({ hero, overview, attention }: {
  hero: ReactNode        // the one hero figure (span 4)
  overview: ReactNode    // key figures and lead charts
  attention: ReactNode   // the Needs attention section
})
// desktop: Band(hero + overview) then attention; narrow (useNarrow): Band(hero), attention, Band(overview, mt-10)

// ui/Frames.tsx
export function Hero<T>({ id, metric, uses?, title, subtitle?, value: string, valueDrill?, valueLabel?, label: string,
  line?, parts: readonly SplitPart[], unit: string, onSegment?, ariaLabel, data, columns, definitions?, note?, empty?, emptyAction?, className? })   // span 4 Figure, text-hero number + SplitBar
export function ListSwitch<K extends string>({ value, onChange, options: readonly { value: K; label: string }[] })   // null under 2 options
export const LIST_ROWS = 50
export function ListFigure<T>({ metric, uses?, title, subtitle?, rows, columns, definitions?, note?, actions?, empty?, emptyAction?, onRowClick?, rowTone?, className? })   // id="home-list", span 12, tableOnly

// engine/split.ts
export interface SplitPart { key: string; label: string; count: number; paint: SplitPaint }
export type SplitPaint = 'good' | 'warning' | 'serious' | 'critical' | 'seq-250' | 'seq-400' | 'seq-500' | 'seq-600' | 'series' | 'deemph' | 'empty'

// engine/kpis.ts
export function tile(list: readonly Kpi[], id: string, to?: { view: RouteView; tab?: string; label: string }): Kpi[]   // picks a producing view's KPI by id, swaps tab for link
export const pendingTile = (id: string, metricId: string, label: string, note: string): Kpi   // value null, quiet note

// engine/figures.ts
export type HomeSlug = 'chro' | 'hrbp' | 'comp' | 'talent' | 'ops' | 'rec' | 'fin'
export const SHARED: readonly string[] = ['home-attention-wait', 'home-attention', 'home-list']
export const HOME_FIGURES: Readonly<Record<HomeSlug, readonly string[]>>   // e.g. fin: ['home-fin-vs-plan','home-fin-kpis','home-fin-plan','home-fin-cost-unit', ...SHARED, 'home-fin-reqs-plan','home-fin-worker-mix','home-fin-cost-center']
export const SLUG_OF: Readonly<Record<Mode, HomeSlug | null>>              // hr, manager, developer: null
export const ALL_HOME_FIGURES: readonly string[]

// engine/attention.ts
export const HOME_SHOWN = 8; export const ESCALATIONS_ON_HOME = 10; export const WAIT_TOP = 6; export const OTHER = 'Other'
export function waitRows(items: readonly OpenAction[], ctx, by: 'kind' | 'practice', top = WAIT_TOP): WaitRows
export function attentionRows(items: readonly OpenAction[], asOf: ISODate): AttentionRow[]
export function severityByRecord(items, keyOf: (a) => string | null): Map<string, Severity>   // My list row tone = Action center severity

// engine/compare.ts
export const comparisonOpens = (access: Pick<AccessContext, 'scope'>): boolean => !access.scope   // "vs company" opens records only unscoped

// ui/Attention.tsx
export function AttentionSection({ items: HomeItems | null, escalations = false, shown: number, title = 'Needs attention', dek?, children? })
// ui/useHomeItems.ts
export interface HomeItems extends RoleView { collected: Collected; stale: boolean; ctx: AnalyticsContext }
export function useHomeItems(): HomeItems | null   // scheduleCollect(ctx, OTHER_VIEWS) then roleView(…, isOpen(marks, now))
// ui/useIdleModel.ts
export function useIdleModel<T>(key: string, compute: (ctx) => T): { model: T | null; updating: boolean; error: string | null }
export function homeModelNow<T>(ctx, key, compute): T   // tests, off-screen renders
```

Home ViewDef (`src/views/home/index.tsx:69`): `{ key: 'home', label: 'Home', title: homeTitle, figureless: (ctx) => !SLUG_OF[ctx.access.mode], tabs: [{ key: 'overview', label: 'Overview' }], View, headline /* switch on access.mode, default employees */, datasets: [...DATASET_KEYS], HeaderActions: HomeActions }`. It has no `summary` and no `actions`.

### 2.15 Action center engine contracts

```ts
// actions/metrics.ts
export const M = { open: 'actions.items.open', overdue: 'actions.items.overdue', dueSoon: 'actions.items.dueSoon', critical: 'actions.items.critical', owners: 'actions.owners.withOpen' } as const
export const P = { snoozeDays: { metricId: M.open, key: 'snoozeDays' }, dueSoonDays: { metricId: M.dueSoon, key: 'days' },
  blockedDays: { metricId: M.critical, key: 'blockedDays' }, escalationDays: { metricId: M.critical, key: 'escalationDays' } } as const
export const DEFAULTS = { snoozeDays: 7, dueSoonDays: 7, blockedDays: 14, escalationDays: 14 } as const
export const ITEM_USES: readonly FieldRef[]   // union of every item's uses; a test checks coverage on the sample

// engine/settings.ts
export interface ActionSettings { snoozeDays: number; dueSoonDays: number; blockedDays: number; escalationDays: number }
export function settingsOf(m: Pick<MetricsApi, 'num'>): ActionSettings

// engine/collect.ts
export interface ViewSource { key: ViewKey; label: string; tabs: readonly { key: string; label: string }[]; datasets: readonly DatasetKey[]; actions?: (ctx) => ActionItem[] }
export type TeamRelation = 'leader' | 'org' | 'other'
export interface BelowStandard { tier: Tier; subject: string; dataset: DatasetKey | null }
export interface OpenAction {
  item: ActionItem; id: string; markKey: string; role: ActionOwnerRole; roleLabel: string
  ownerKey: string            // 'id:E10142' or 'team:<role>:<name>'
  ownerId: string | null; ownerName: string; isTeam: boolean
  viewLabel: string; tabLabel: string | null; from: string      // "Recruiting · Pipeline"
  personId: string | null; team: TeamRelation | null; below: BelowStandard | null
  alsoFrom: readonly string[]; members?: readonly OpenAction[]  // roll-up
}
export interface Collected {
  items: OpenAction[]                                            // ordered by compareActions
  below: { count: number; reasons: HiddenReason[] }
  folded: number; smallScope: boolean; errors: CollectError[]
  leader: { id: string; name: string } | null; sources: number
}
export function runView(ctx, v: ViewSource): ViewRun                         // cached per (ctx, view); throws are captured
export function withoutScope(ctx): AnalyticsContext | null                   // the "wide run": items owned in scope but about records outside
export function compareActions(a: OpenAction, b: OpenAction): number         // exposure, severity, earliest due, size, owner, id
export function foldMatters(items: readonly ActionItem[]): { items; also; folded }
export function collectActions(ctx, views: readonly ViewSource[]): Collected  // cached per ctx and set of views with actions
export function scheduleCollect(ctx, views, opts?: { idle?: Idle; channel?: string }): Promise<Collected>   // idle, one view per slice, rejects CollectSuperseded
export function usesOf(items: readonly OpenAction[]): FieldRef[]

// engine/severity.ts: one rubric
export const BLOCKS_PERSON: readonly string[]   // kinds where a person waits
export function severityOf(item, asOf: ISODate, blockedDays: number): Severity
//  exposure → critical; person-blocking: >blockedDays overdue → critical, overdue → warning, else info;
//  other items: overdue info/good → warning; else the view's own severity.

// engine/due.ts
export type DueBucket = 'overdue' | 'soon' | 'later' | 'none'
export function dueBucket(due, asOf, soonDays): DueBucket
export function dueText(due, asOf): string   // "4 d overdue", "Due today", "Due in 3 d", "No due date"

// engine/kind.ts
export const KIND_LABEL: Readonly<Record<string, string>>   // '<view>:<kind>' → "Interview decision"; prefix keys end with '-'
export function kindOf(item: Pick<ActionItem, 'id' | 'kind'>, viewLabel: string): string

// engine/roles.ts
export const NEEDS_SHOWN = 15
export interface RoleView { lists: boolean; open: OpenAction[]; needs: OpenAction[]; waiting: OpenAction[]; parked: OpenAction[]; left: number; count: number; critical: number }
export function roleView(collected: Collected, ctx, isOpen: (a: OpenAction) => boolean): RoleView
export const nothingWaiting = (ctx): string   // "Nothing is waiting on Total rewards across the company."

// engine/summary.ts
export function actionKpis(open: readonly OpenAction[], ctx): Kpi[]   // open, overdue, critical, due-soon, owners; each drills to itemsDrill
// engine/rows.ts
export function itemsDrill(ctx, title: string, items: readonly OpenAction[], opts?): DrillSpec<'actionItems'>
// engine/marks.ts
export const STORAGE_KEY = 'census:actions'   // marks v2 in localStorage: { [markKey]: { state: 'handled'|'snoozed', at, until?, fingerprint?, by? } }
export function isOpen(target: MarkTarget | string, marks: Marks, now: number): boolean
// engine/note.ts
export const NAGGING = /\b(chas\w*|push\w*|nag\w*|ping\w*|hound\w*|unblock\w*|remind\w*)\b/i
export const DEFAULT_ASK = 'Could you let me know where this stands?'
// engine/roleKit.ts (tests only)
export function modeCtx(mode: Mode): AnalyticsContext; export function everyMode(): { mode; ctx; collected; lists: RoleView }[]
```

Routing (`src/access/policy/routing.ts:42`): `interface RouteRule { kinds?; owners?; me?; escalation?; severities?; site?; person?; list: 'needs' | 'waiting' }`, `interface ModeRouting { practice: string; rules: readonly RouteRule[]; owned?; unlisted? }`, `export const ROUTING: Readonly<Record<Mode, ModeRouting>>`. Kind constants look like `export const PLAN = ['onboarding:not-in-plan', 'onboarding:plan-behind', 'onboarding:plan-no-req'] as const`.

### 2.16 My team contracts (`src/views/team`)

```ts
export const TEAM_DATASETS = ['employees','jobChanges','reviews','succession','learning','requisitions','candidates','onboardingTasks'] as const
export const view: ViewDef = { key: 'team', label: 'My team', tabs: [{ key: 'overview', label: 'Overview' }], View, headline: /* hrbpHeadline */, datasets: [...TEAM_DATASETS] }   // no summary, no actions
export function teamSources(ctx): TeamSources            // { hrbp, recruiting, onboarding, talent } producing models, each cached by its own view
export function relink(k: Kpi | undefined, view: RouteView, labelOf: LabelOf): Kpi[]
export const TEAM_TILES = ['headcount','voluntary','regretted','open-reqs','starts-30','talent-training-on-time'] as const
export function orgUnderMinimum(ctx, s): boolean         // lock.size (Manager) or headcount < minGroupOf
export function teamKpis(s, labelOf, ctx?, small = false): Kpi[]
export function teamFindings(ctx, practices, limit = 6): SourcedFinding[]
export const WAITING_SHOWN = 10
export function teamLists(ctx, collected, isOpen): { needs: OpenAction[]; waiting: OpenAction[] }
export function waitingKpi(ctx, needs): Kpi | null       // actionKpis(...).open retitled "Needs attention", link to Action center
export const TEAM_FIGURES: readonly string[] = ['team-kpis','team-waiting','team-readout','team-headcount-trend', …, 'team-critical-roles']
export const ITEM_SOURCES: readonly ViewSource[] = [recruiting, onboarding, hrbp, org, talent]   // ui/views.ts, imported one by one (no registry)
```

---

## 3. Patterns and conventions

### 3.1 View folder layout (People stats as the model)

```
src/views/<key>/
  index.tsx        ViewDef: View({tab}) switches on tab; empty states first; headline; datasets; HeaderActions; summary; actions
  metrics.ts       plain data: ID map, SET setting refs, INHERITS, defineMetrics('<key>', …). No React, no @/data/context,
                   no @/metrics barrel/catalog/api/testing (the catalog imports this file)
  engine/
    index.ts       Model interface, compute<Key>(ctx), <key>Model(ctx) cached in WeakMap<AnalyticsContext, Model>, <key>Headline(ctx)
    base.ts        prepare(ctx) → Prep { ctx, set, text, defs, uses, meets, has, window, prior, … }
    settings.ts    <Key>Settings + settingsOf(m) with lazy getters, cached per MetricsApi
    lineage.ts     typed KnownFieldRef lineage blocks + FIGURE map + <KEY>_DATASETS
    kpis.ts        Kpi[] for the Overview (5 to 7)
    findings.ts    Finding[] readout, ranked
    actions.ts     <key>Summary(ctx), <key>Actions(ctx): ActionItem[]
    drill.ts       DrillSpec builders
    drillUses.ts   tagKpis/tagFindings
    wording.ts     definitionText/definitionsOf (adds "Changed setting:" notes)
    fixtures.ts    emp(), ctxOf(), sampleCtx()  (tests only)
    *.test.ts, *.perf.test.ts beside each
  ui/
    model.ts       use<Key>() = useMemo(() => <key>Model(ctx), [ctx])
    Overview.tsx   <Grid><KpiStrip kpis/> <Readout findings span=12 in lg:col-span-4/> <figures in lg:col-span-8/></Grid>
    <Tab>.tsx      one per tab
    HeaderActions.tsx
```

### 3.2 How ctx flows

- The shell renders `view.View({tab})` inside `<AnalyticsProvider>`. Every component calls `useAnalytics()`, and engines take `ctx`.
- Off-screen renders (exports, figure scans) wrap the tree in `<AnalyticsProvider access={{ mode, picks }}>`, so code must ask `ctx.access`, never the mode store.
- Scoped data: `ctx.data` is already narrowed to the mode's scope and filters. `ctx.all` is the whole company. `ctx.isCompany` is false under any scope or org filter.
- Comparisons: under an org filter or scope, rates compare "vs company" (`ctx.all`); otherwise "vs prior N months" (`priorLabel(period, months)`: `'vs same period last year'` for ytd, `'vs prior quarter'`, `'vs prior period'`, `` `vs prior ${n} months` ``). Headcount uses `'vs 12 months earlier'`. Finance's cost tile uses `` `vs ${money(budget)} budget` ``. In a scoped mode a "vs company" comparison opens no records (`comparisonOpens(access)`, surface `ui:kpi-delta-company`).

### 3.3 KPI construction (copy exactly, from `views/hrbp/engine/kpis.ts:160-300`)

Each tile sets these fields:
- `id`: kebab-case.
- `metricId`: `ID.x`.
- `label`, `value` (null when unknown or suppressed, never 0), `format`.
- `delta` and `deltaLabel` (names the comparison), `goodDirection`, `deltaMaterial: p.material(delta, ref)`.
- `spark`: 8 quarter-ends.
- `note`: a count such as "57 voluntary exits", or why the value is missing.
- `formula`: the live arithmetic sentence.
- `suppressed`: `avgHeadcount > 0 && avgHeadcount < minGroup`.
- `tab`: the explaining tab.
- `definition: p.text(metricId)`.
- `uses: p.uses(lineage)`.
- `drill`: the numerator's records. `deltaDrill`: the comparison's records. `noteDrill`.

Drills are thunks, so nothing is built until a click. The tiles then pass through `tagKpis` so every drill carries the tile's `uses`.

### 3.4 Figure construction

`<Figure id="<view>-<thing>" metric={ID.x} uses={p.uses(FIGURE.x)} definitions={p.defs(ID.x, …, ANONYMITY_ID)} title subtitle data columns note empty>…chart…</Figure>`.
- Every column that shows a count has a `drill`.
- Charts have `onSelect` and drill the same records.
- Small groups fold into Other, and the note says so ("Orgs under 5 employees are folded into Other").

### 3.5 Metric registration

- Ids follow `<view>.<group>.<name>` (`hrbp.attrition.voluntary`). They are kept in one `ID` object with `as const`, plus `export type HrbpMetricId = (typeof ID)[keyof typeof ID]`.
- Settings are referenced through `SET = { countContractors: ref(ID.headcount, 'countContractors'), … }`. Engines read only `SET.*`. A setting lives on exactly one metric. Other views read it there (hrbp reads Org chart's span thresholds via `ORG_PARAM`) and declare `dependsOn` (`INHERITS`).
- Shared wording constants (`PERIOD`, `AS_OF`, `EMPLOYEES`, `RATES`) fill `population`/`window` so the formula index reads alike.
- `owner` is the same on every entry of a view ('People analytics', 'Finance'); a test checks it.
- `metrics.ts` exports `metrics: MetricDef[]`. The catalog imports it as `import { metrics as <key> } from '@/views/<key>/metrics'`.

### 3.6 Settings read pattern

```ts
const cache = new WeakMap<MetricsApi, HrbpSettings>()
export function settingsOf(m: MetricsApi): HrbpSettings {
  const hit = cache.get(m); if (hit) return hit
  const num = (r: SettingRef) => () => m.num(r.metricId, r.key)
  const s = lazy({ minGroup: () => minGroupOf(m), countContractors: flag(SET.countContractors), … })
  cache.set(m, s); return s
}
export const defaultSettings = () => settingsOf(defaultMetrics())
```

The getters are lazy so that `recordParamReads` sees exactly which settings a computation read.

### 3.7 Caching and performance

- One model per ctx: `WeakMap<AnalyticsContext, Model>` (hrbp, analyses, Action center runs and collections, home idle models).
- Homes compute in idle time with `useIdleModel(key, compute)` and show `<Pending frames=…>` at final size.
- The Action center collects one view per idle slice (`scheduleCollect`, 200 ms waits) and cancels older contexts on the same channel.
- Timing names are `census:<thing>` (`census:context`, `census:quality`, `census:actions:<view>`, `census:home:<key>`, `census:analysis:<key>`, `census:headline:<view>`).
- Time budgets live only in `*.perf.test.ts`, which run in the separate `perf` Vitest project (`vite.config.ts:36-55`, `fileParallelism: false`).

### 3.8 Import-cycle rules (enforced by structure; tests break if violated)

- `registry.ts` imports every view. Home, scorecard and team therefore never import the registry. They import views one by one (`scorecard/views.ts OTHER_VIEWS`, `team/ui/views.ts ITEM_SOURCES`) and a test keeps those lists equal to the registry.
- Views must not import `@/views/actions` (its `index.tsx`), which reads the registry. They may import `@/views/actions/engine` and `@/views/actions/metrics`.
- A view's `metrics.ts` is plain data. The catalog imports every one of them, and `api.ts` imports the catalog.
- The Action center cache key is the comma-joined keys of views that have `actions`. `useHomeItems` (OTHER_VIEWS) and `useCollected` (VIEWS) share a run only because Home and Scorecard have no `actions`. Keep homes action-free.

### 3.9 Action item rules (tests: wording, privacy, itemContract, roles, recount)

- `id = '<view>:<kind>:<record id>'`, stable. `kind` is set or resolvable through `KIND_LABEL`.
- `what` has no trailing period, does not match `NAGGING`, and has no em dash. A date in another year keeps its year.
- No money in `what` or `note` (regex `/[$€£¥₹]\s?\d|\b\d[\d,.]*\s?(USD|EUR|GBP|INR|JPY|CNY|TWD|KRW|SGD)\b/`). Amounts go only in `amount`, shown under the pay rules.
- Every item has `due` or `closesWhen`, and `place` (for the HRBP lenses).
- Roll-ups set `fingerprint`. Items about a group use `subject.kind: 'none'`.
- Legal breaches set `exposure: true`. Duplicates across views share `matter`.
- Text read by a manager uses `forOwner` ("6 exits from your team"); a manager is never told HR-only judgments.

### 3.10 Home pattern (role home anatomy, `ui/HrbpHome.tsx:466`, `ui/FinHome.tsx:750`)

```tsx
<HomeTop
  hero={<Hero id="home-<slug>-<thing>" metric=… value="96%" label="of budget: …" parts={splitParts} … />}   // span 4
  overview={<>
    <KpiStrip id="home-<slug>-kpis" title="Key figures" kpis={[...tile(viewKpis, 'id', {view, tab, label}), …]} span={8} judge?={…} />
    …lead charts / Readout "What to raise" (span 4, compact, limit 6)…
  </>}
  attention={<AttentionSection items={useHomeItems()} shown={HOME_SHOWN} dek="Your open items in this scope: …" />}
/>
<Section title="My list" dek="…"><ListFigure metric=… rows=… actions={<ListSwitch …/>} onRowClick=… /></Section>
<Section title="…risks…" dek="…">…Figures (span 6)…</Section>
```

- Home KPIs are the producing views' own tile objects (`tile()`). Homes never recompute a number.
- `deltaLabel` names the comparison. `pendingTile` holds a tile's place while open items are collected.
- Needs attention is a span-4 "Where your items wait" stacked bar (kinds by due bucket, top 6 plus Other) beside a span-8 list of the most urgent items (`HOME_SHOWN = 8`, then "Show all"). Links read "Waiting on others (n)" and "Open the Action center". Rows are read-only.
- My list is one table (`home-list`, 50 rows on screen, all rows exported). Rows open records or filter the app. A `ListSwitch` picks between 2 or 3 lists. Row tone comes from `severityByRecord`.
- `HomePage` waits for a scoped mode's pick (unset shows a picker empty state) and prints a small-scope note under the anonymity minimum.

### 3.11 Wording rules (scanned by tests)

- Sentence case.
- No em dash between words (`/[A-Za-z0-9)]\s*—\s*[A-Za-z0-9(]/`). "—" is allowed only as the missing-value placeholder.
- No exclamation marks.
- No nagging verbs in notes or `what`.
- Plain counts: `count(n, 'exit', 'exits')`.

---

## 4. Tests to port (what each asserts, then the HCP adaptation)

| Census test | Asserts | HCP port |
|---|---|---|
| `src/views/registry.test.ts` | `DATASETS[].usedBy` equals the views that declare each dataset (set equality), with each view once and in folder-tab order; every view reads known datasets and every dataset has a reader; `VIEWS` order equals a literal list and `VIEW_KEYS`; `label === VIEW_LABEL[key]`; at least one tab per view with unique tab keys | Same file. Replace the literal order with HCP's (`home, team, plan, requests, forecast, targets, whatif, finance`) and the eight HCP datasets |
| `src/metrics/catalog.test.ts` | `validateCatalog(METRICS)` and `validateCatalog(FIXTURE_DEFS)` are `[]`; every metric has a formula; exact problem list for a bad entry; privacy and quality rules present; `withRequired` keeps the view's wording; `defineMetrics` puts the home view first | Port as is. Drop the comp-cycle asserts. Add "every metric has population and window unless a rule" (Census has it in `app/settings/formulaIndex.test.ts`; move it here if HCP has no formula index page) |
| `src/metrics/api.test.ts` | defaults; same object for the same state; wording/target merge; typed getters throw; `recordParamReads`; `definitionOf`/`targetStatus`/`kpiTarget` unit family; `sourcesOf` follows dependsOn and adds anonymity; `changesBehind`; `usesWhen` lineage | Port verbatim against `FIXTURE_DEFS` (rename fixture ids to HCP ones) |
| `params.test.ts`, `precision.test.ts`, `targets.test.ts`, `dateParams.test.ts` | validation, raise-only and locked settings, parsing and wording with units, whole-number settings, step rounding, round-trip text, required targets keep direction | Port verbatim (pure). `precision` iterates the whole CATALOG |
| `overrides.test.ts`, `persist.test.ts`, `imports.test.ts` | reducers keep only differences, log from/to, undo/reset, `MAX_LOG`, sanitize; persistence round trip; settings-file section snapshot | Port. Key becomes `hcp:metrics`. Drop the comp-cycle migration tests |
| `privacy.test.ts` | survey and immigration rules registered and locked | Replace with HCP rules: anonymity 5 (raise-only), pay amounts opt-in, plus new cost-guard rules (see 5.4) |
| `excel.test.ts`, `moved.test.ts` | dictionary workbook round trip; moved settings | Excel: port only if the dictionary workbook ships in Phase 1 (filename `headcount-planner-metric-dictionary-<date>`). Moved: drop (no legacy) |
| `views/hrbp/engine/metrics.test.ts` | the view's entries pass `validateCatalog` and are the catalog's objects (`toBe`); `views[0]` is the view; owner fixed; registered ids equal `ID` values exactly; registered settings equal `SET` (`paramsOfView`); `INHERITS` equals `dependsOn`; no em dash or "!" in definition/formula/population/window/descriptions; every KPI and finding under 5 scopes has a `metricId` in `ID` and `definition === ctx.metrics.def(id).definition`; headline links to the metric; UI scan: per file, count(`metric={`) = count(`definitions={`) = count(`<Figure`), no inline `definitions={[{`, every `ID.x` exists; every ID is shown somewhere or has params; `recordParamReads`: every registered setting is read while computing model, headline, actions; defaults equal shared definitions; changing each setting changes the numbers | One per HCP view: `plan/engine/metrics.test.ts`, `requests/…`, `forecast/…`, `targets/…`, `finance/…`. This is the main enforcement of "every engine has a MetricDef" |
| `views/hrbp/engine/lineage.test.ts` | lineage names only schema fields; an optional group counts only when present; org filters add their fields; UI scan: count(`uses={p.uses(FIGURE.`) = count(`<Figure`) per file; every FIGURE entry is used; every KPI and finding declares the scope's filter fields | Port per view |
| `views/hrbp/engine/itemContract.test.ts` | across the views with `actions` on the sample: items from every covered view, unique ids, no trailing period, no money in what/note, other-year dates keep their year, place on every item, fingerprint on roll-ups, `subject.kind none` on group items, `due` or `closesWhen`, exposure flags, region names | Port with HCP's item kinds (requests waiting, openings past start, planned with no req, reconcile exceptions, frozen-req exceptions, managers not submitted) |
| `views/hrbp/engine/kpis.test.ts`, `drill.test.ts`, `smoke.test.ts` | tile comparisons (prior vs company); suppression under 5; notes and plurals; every KPI drill opens exactly the counted records; findings drill to non-empty lists; planted stories reproduce exact numbers | Port as each view's kpis/drill/sample tests: "Counted figures equal the rows their drill opens" (spec quality bar); story numbers go in `sample.test.ts` |
| `views/hrbp/engine/smoke.perf.test.ts` | engine under 300 ms on the sample | Port, one per heavy engine (forecast, variance, bridge, cost), in `*.perf.test.ts` |
| `views/hrbp/ui/filterTo.test.ts` | "Filter to this" reproduces the number under the new scope | Port for Plan/Forecast breakdowns |
| `app/headlineGate.test.ts` | every view with datasets has `headline().uses`; gating by tier | Port |
| `views/home/engine/figures.test.ts` | `HOME_FIGURES` equals the ids drawn in `ui/` (regex `id="(home-[a-z0-9-]+)"`); ids prefixed `home-<slug>-` or shared; each home's figures shown only in its mode (`decide(mode, 'figure:<id>', {view:'home', tab:'overview'})`); a `METRICS` map per figure whose metrics exist and are visible in the mode; source scan: every `<Figure`, `<Hero`, `<ListFigure` has `metric={` in its first 600 chars (at least 40); no em dash or "!" | Port with HCP slugs `unit` (HRBP), `rollup` (Leader), `fin` (Finance) |
| `views/home/engine/engine.test.ts` | `waitRows` groups and folds; title per mode; per-home list and split assertions; Needs attention at most 15 items on the sample for some modes | Port the attention and title parts; write new per-home asserts (each KPI names its comparison: `deltaLabel` starts with "vs ") |
| `views/home/engine/scope.test.ts` | homes never show out-of-scope rows; drills stay in scope; "vs company" opens nothing in a scope | Port: HRBP home inside the unit, Leader inside the tree |
| `views/home/figureless.test.ts` | `figureless` only where `SLUG_OF` is null | Port |
| `views/home/engine/finCostMetrics.test.ts` | cost metrics list `['comp','home']`; shown only in cost modes; stay visible on the home when a view is hidden | Port as "cost metrics on Finance's home are visible in Finance and HR admin only" |
| `views/actions/engine/*.test.ts` | `collect` (errors isolated, order, cache, owner matching, tier tagging, "My team", small scope hides ER items); `order` (severity rubric); `roles` (one count everywhere; mode and scope listing; 1 to 15 needs; folds rather than drops; due or reason); `rollups`; `marks` (v1/v2 storage, fingerprints reopen, hashed keys, storage keys list); `note` (greeting, cap 25, never nags); `privacy` (no amounts in text in every mode); `wording`; `recount` (each item kind recounted from raw rows); `sample`; `dedupe`; `drillFilter`; `charts`; `collect.perf` (cold collection within 400 ms) | Port the generic engine tests nearly verbatim: `pure, order, collect, roles, rollups, marks, note, privacy, wording, charts, dedupe, collect.perf`. Rewrite `recount` and `sample` for HCP's item kinds. Drop the ER-case and license-specific cases |
| `views/team/rules.test.ts` | per file: every `<Figure` has `metric={` and `uses={` before its first `>` (at least 15); no em dash or "!"; banned imports and identifiers (`@/views/comp`, `showPay`, `exitReasons`, …) | Port: HCP's banned list for My team is any cost/pay import (`cost`, `baseSalary`, `offerBase`, `showPay`, `@/views/finance`), plus `leave`, `performance` |
| `views/team/engine/numbers.test.ts`, `sample.test.ts` | team tiles are the producing views' tiles; small org hides rates | Port with allocation, filled, open, planned, pending, left to request and budget status tiles |

Test kit to copy: `views/hrbp/engine/fixtures.ts` (`ctxOf(partial, filters, asOf, metrics)`, `sampleCtx(filters, metrics)`), `views/actions/engine/roleKit.ts` (`modeCtx(mode)`, `everyMode()`), `metrics/testing.ts`, `metrics/test-fixtures.ts`.

---

## 5. HCP adaptation

### 5.1 View keys, labels, pages

`ViewKey` (folder-tab order; drives `VIEW_LABEL`, `VIEW_KEYS`, `registry.test.ts`):

| key | label | tabs (first is default) | datasets (proposal) | headline |
|---|---|---|---|---|
| `home` | Home | overview | all | per mode: Unit plan heads vs plan (HRBP), year-end gap (Leader), FY cost forecast vs Budget (Finance) |
| `team` | My team | overview | positions, workers, reqs, requests, targets | allocation left to fill (heads) |
| `plan` | Plan | overview, positions, openings, transfers | positions, workers, comp, reqs, assumptions | approved heads |
| `requests` | Requests | queue, new, mine, approvals, cycle | requests, positions, targets, freezes | requests waiting |
| `forecast` | Forecast | overview, variance, bridge | all but requests | year-end heads forecast |
| `targets` | Targets | gap, suborgs, tree, trade (new, see 5.6) | targets, positions, requests, assumptions | gap (heads) |
| `whatif` | What if | overview | positions, assumptions, targets, freezes | none (`value: ''`) or levers in use |
| `finance` | Finance | versions, assumptions, freezes, reconcile, export | all | versions locked |

Pages (not ViewDefs; extend Census `PageKey = 'data' | 'actions' | 'dev'`): `data` (Data room, HR admin home), `actions` (Action center), `audit` (Audit log), `dev`. So `MetricView = ViewKey | 'data' | 'actions' | 'audit'`, with `METRIC_VIEW_LABEL` gaining `audit: 'Audit'`.

### 5.2 Files under `headcount-planner/src/` (my area)

```
views/types.ts                     copy; ActionOwnerRole → 'manager'|'hrbp'|'leader'|'finance'|'hr-admin'|'recruiter'; ACTION_OWNER_LABEL; add place.costCenter?, place.legalEntity?; drop summary? (no Scorecard) or keep optional for Phase 3 Ask
views/registry.ts                  copy; VIEWS = [home, team, plan, requests, forecast, targets, whatif, finance]; folderViews: 'team' only in manager mode
views/registry.test.ts             copy, new literal order
views/home/{index.tsx, engine/{figures,kpis,attention,compare,title,split}.ts, ui/{HomeTop,HomePage,Frames,SplitBar,Attention,useHomeItems,useIdleModel,UnitHome,RollupHome,FinHome}.tsx}
views/team/{index.tsx, engine/{index,numbers,list,waiting,sources,figures,budgetStatus}.ts, ui/{TeamPage,Waiting,MyList,Tracker}.tsx, rules.test.ts}
views/plan/{index.tsx, metrics.ts, engine/{index,base,settings,lineage,kpis,findings,actions,drill,drillUses,wording,fixtures,heads,cost}.ts, ui/{model,Overview,Positions,Openings,Transfers}.tsx}
views/requests/{index.tsx, metrics.ts, engine/{…,chain,cycle,actions}.ts, ui/{Queue,New,Mine,Approvals,Cycle}.tsx}
views/forecast/{index.tsx, metrics.ts, engine/{…,forecast,variance,bridge,fx}.ts, ui/{Overview,Variance,Bridge}.tsx}
views/targets/{index.tsx, metrics.ts, engine/{…,gap,suborgs,tree,trade}.ts, ui/{Gap,SubOrgs,Tree,Trade}.tsx}
views/whatif/{index.tsx, metrics.ts, engine/{levers,apply}.ts, ui/WhatIf.tsx}
views/finance/{index.tsx, metrics.ts, engine/{versions,reconcile,exportRows,actions}.ts, ui/{Versions,Assumptions,Freezes,Reconcile,Export}.tsx}
views/actions/{index.tsx, metrics.ts, engine/*, ui/*}   copy engine nearly whole; rewrite KIND_LABEL, BLOCKS_PERSON, MATTER_VIEW, TEAM_NAMES, ITEM_USES
views/data/roomMetrics.ts          data.* metrics (Data room)
views/audit/metrics.ts             audit.* metrics if any (count of entries, hash chain status)
metrics/{types,define,registry,catalog,api,params,privacy,overrides,persist,index,testing,test-fixtures,quality}.ts   copy; drop compCycle.ts, moved.ts, budget.ts (replace with costGuard.ts)
metrics/costGuard.ts               COST_GUARD rules as locked dictionary entries (5.4)
```

### 5.3 Metric id plan (prefix = home view; every engine gets one)

- `plan.heads.plan`, `plan.heads.approved`, `plan.heads.actual`, `plan.heads.notInPlan`, `plan.fte.average`, `plan.cost.loaded`, `plan.cost.openPlanned` (separate midpoint line), `plan.openings.age`, `plan.openings.pastStart`, `plan.positions.status`.
- `requests.queue.waiting` (setting `waitingDays` = 5), `requests.cycle.notSubmitted`, `requests.chain.leaderThreshold` (setting `bandEstimateUsd` = 250000, kind 'setting'), `requests.idle.expiry` (setting `days` = 60).
- `forecast.heads.yearEnd`, `forecast.cost.yearEnd`, `forecast.exits.modeled` (settings: attrition, backfill %, lag fall back to assumptions; keep them as assumptions data, not params), `forecast.fill.probability`, `forecast.variance.heads|fte|cost`, `forecast.bridge.steps`, `forecast.fx.effect`.
- `targets.gap.heads`, `targets.gap.cost`, `targets.asks.total`, `targets.allocation.manager`, `targets.freeze.savings`, `targets.trade.ratio`, `targets.trade.standardHead`, `targets.trade.weightedHeads`.
- `finance.forecast.exitRunRate`, `finance.forecast.accuracy` (the spec's `fin.*`, renamed), `finance.reconcile.exceptions`, `finance.versions.locked`.
- `team.budget.status` (settings `atRiskShare` = 0.02), `team.allocation.leftToFill`, `team.allocation.leftToRequest`.
- `actions.items.*` and `actions.owners.withOpen` (copy as is).
- Rules: `privacy.anonymity`, `privacy.payAmounts`, `privacy.leaveCounts` (minGroup 5 for leave counts), `cost.guard.minCosted` (5, raise-only), `cost.guard.floorUsd` (100000, raise-only, for HRBP/Leader), `cost.guard.minContributors` (5, for differences), `quality.rules.*`. Add `'cost'` to `SHARED_PREFIXES` in `registry.ts`.

### 5.4 Cost guard as dictionary rules

Copy the `PRIVACY_METRICS` shape: `locked: true, kind: 'rule', uses: [], owner: 'Finance'` with `locked: 'raiseOnly'` number params. Expose `costGuardOf(m): { minCosted; floorUsd; minContributors }`, the way `minGroupOf` works. Engines read only that. The `recordParamReads` test proves the guard is read.

### 5.5 Homes

`SLUG_OF: Record<Mode, HomeSlug | null>` = `{ manager: null /* team view */, hrbp: 'unit', leader: 'rollup', finance: 'fin', 'hr-admin': null /* Data room page */, developer: null }`. `HomeSlug = 'unit' | 'rollup' | 'fin'`.

`HOME_FIGURES`:
- `unit`: `home-unit-heads-vs-plan` (Hero), `home-unit-kpis`, `home-unit-forecast`, `...SHARED`, `home-unit-openings`, `home-unit-requests`.
- `rollup`: `home-rollup-vs-target` (Hero), `home-rollup-kpis`, `home-rollup-suborgs` (bullet per sub-org), `...SHARED`, `home-rollup-gap-trend`.
- `fin`: `home-fin-cost-vs-budget` (Hero), `home-fin-kpis`, `home-fin-bridge`, `...SHARED`, `home-fin-reqs-not-in-plan`, `home-fin-fx`, `home-fin-reconcile`.

Key figures per spec, each a producing view's tile through `tile()`:
- **HRBP**: heads vs plan, hires YTD vs plan, openings past target start, year-end forecast vs target, cost vs budget.
- **Leader**: heads and cost vs target, year-end gap, approvals waiting.
- **Finance**: heads vs budget, reqs not in plan, openings under a freeze, FX effect YTD, freeze savings, reconciliation exceptions.

Needs attention lists the mode's `roleView(...).needs`. These kinds must exist as `actions(ctx)` on the producing views:
- `requests:waiting:<requestId>`: waiting 5 or more days in step; owner is the step approver.
- `requests:not-submitted:<managerId>`: cycle open, manager not submitted; owner is the manager; HRBP sees it in Waiting on others.
- `plan:planned-no-req:<positionId>`: Planned seat near its start with no req.
- `plan:past-start:<positionId>`: opening past target start.
- `finance:reconcile:<id>`, `finance:frozen-req:<reqId>` (exposure false), `requests:approve:<requestId>`.

HCP needs a `ROUTING: Record<Mode, ModeRouting>` (access agent's area) with these kinds.

My team (Manager) tiles: allocation, filled, open, planned, pending, left to request, budget status (heads only, `team.budget.status`), then a Needs attention tile (`waitingKpi`), then a request tracker table in place of Census's `MyListSection`.

### 5.6 "vs" comparison picker (spec: each vs figure names its comparison and has a picker)

Census has no picker: `deltaLabel` is fixed by scope rules. Proposal:
1. Add `compare: 'budget' | 'por' | <versionId>` to `Filters` (URL-synced, `docs/FILTERS.md`), with a default per mode from a table in `access/modes.ts`: `COMPARE_DEFAULT: Record<Mode, 'budget' | 'por'>` (Finance `budget`, everyone else `por`). `clampFilters` resets an unknown version.
2. Resolve once in `buildContext`, adding `compare: { versionId, label }` to `AnalyticsContext` (for example `{ label: 'Budget' }` or `{ label: 'plan of record (Q1 Reforecast)' }`).
3. Every vs tile: `deltaLabel: \`vs ${ctx.compare.label}\``, with `deltaDrill` opening the comparison version's plan lines. Every vs figure subtitle names it.
4. Test: every home and Overview KPI with a `delta` has a `deltaLabel` matching `/^vs /`, and its comparison equals `ctx.compare`.
5. The picker UI goes in the view header (`HeaderActions`) or the filter bar, owned by the UX/filters agent.

### 5.7 New requirement: trade headcount between levels, regions, etc. by an "average head" ratio

Interpretation (to confirm with the user, see 6.Q1): a **standard head** is the average loaded band-estimate cost per FTE of a reference population, by default the company's plan of record for the fiscal year. Every slot (level × location zone, optionally job family) has a **weight** w = band estimate(slot) ÷ standard head. A position counts **w × FTE × average active fraction over the window** "average heads", so one unit covers level, region and timing. A trade conserves the sum of these: giving up n heads at A yields n × wA ÷ wB heads at B, rounded down to a step, with the remainder kept as "unallocated average heads".

- Engine `headcount-planner/src/views/targets/engine/trade.ts` (pure):
  ```ts
  export interface Slot { level: string; zone: string; jobFamily?: string | null }
  export interface WeightTable { standardHeadUsd: number; basis: 'band' | 'planAverage'; weightOf(slot: Slot): number | null; rows: WeightRow[] }
  export function headWeights(ctx: AnalyticsContext, versionId: string): WeightTable   // cached per (ctx, version)
  export interface TradeQuote { give: { slot: Slot; heads: number }; get: { slot: Slot; heads: number }; ratio: number; remainder: number; averageHeads: number; months?: { start: ISODate } }
  export function tradeQuote(w: WeightTable, from: Slot, to: Slot, heads: number, opts?: { step?: number; startFrom?: ISODate; startTo?: ISODate }): TradeQuote
  export function weightedHeads(positions, w, window): number                         // "average heads" for gaps and targets
  ```
- Metrics (in `views/targets/metrics.ts`):
  - `targets.trade.ratio`: name "Trade ratio", unit `times`. Params: `basis` (choice: `band` default, `planAverage`), `reference` (choice: `company` default, `org`), `step` (number 1, min 0.1, max 1, step 0.1). Formula: "band estimate of the slot given ÷ band estimate of the slot received".
  - `targets.trade.standardHead`: unit `money`, `views: ['targets','finance']`, shown only where cost shows.
  - `targets.trade.weightedHeads`: unit `num1`, formula "Σ weight × FTE × average active fraction".
  - All three need population and window text.
- Privacy:
  - With `basis: 'band'` the weights read only the bands table (no person data), so the ratio and weighted heads may show in every mode, Manager included (no amounts).
  - `planAverage` uses HRIS pay of Filled seats. It is allowed only for Finance and for HR admin with the switch, per slot with 5 or more costed people, and otherwise falls back to band.
  - `standardHeadUsd` is an amount: hidden for Manager. For HRBP and Leader it is under the $0.1M floor rule, so effectively shown as the ratio only.
- Surfaces:
  - Targets > Trade tab: a quote calculator and a trade log.
  - Sub-org targets: "Move heads" uses the ratio so a cost envelope holds.
  - What if: a "Trade heads" lever.
  - Requests: "Turn into requests" makes an Elimination or Level/Location change plus New role, linked by `tradeId` with `reasonCode: 'trade'`. The chain is unchanged; trades that cross sub-orgs follow Transfer approvals.
- Tests: exact fixtures (one P4 Munich ↔ P3 Bengaluru quote from the worked band numbers; a timing trade such as one April start = two October starts at 0.5 average FTE each); a trade conserves average heads within the step; band basis output is byte-identical when one salary changes (leak test); `planAverage` falls back under 5.

### 5.8 Renames, census to hcp

| Census | HCP |
|---|---|
| `METRICS_KEY = 'census:metrics'` | `'hcp:metrics'` |
| `STORAGE_KEY = 'census:actions'`, `FILE_KIND = 'census-marks'` | `'hcp:actions'`, `'hcp-marks'` |
| timing `census:context`, `census:quality`, `census:actions:<v>`, `census:home:<k>`, `census:analysis:<k>`, `census:headline:<v>` | `hcp:*` |
| `dictionaryFileName` `census-metric-dictionary-<date>` | `headcount-planner-metric-dictionary-<date>` |
| `useCensus` store hook | `usePlanner` (or `useHcp`) |
| copy "Census holds no gender…" in `privacy.protectedFields` | "Headcount Planner holds no …" (APP_NAME) |
| owner 'People analytics' | 'Finance' or 'HR business partners' per view |
| `ACTION_OWNER_ROLES` HR practices | HCP roles (5.2) |
| `HomeSlug`, `SLUG_OF`, `HOME_FIGURES` | 5.5 |
| `TEAM_DATASETS`, `TEAM_TILES`, `TEAM_FIGURES` | HCP datasets and tiles |
| `BUDGET_METRIC_DEFS`, `COMP_CYCLE_METRICS`, `withRequired` extras | drop; `withRequired(defs, [])` or remove |
| `SHARED_PREFIXES = ['privacy','quality']` | `['privacy','quality','cost']` |

Spec rule: a test fails if "census" appears in `src/` code. Census comments cite `docs/ROLES-V2.md` and other Census docs: rewrite those to HCP docs (`docs/PLAN.md`) or the scan will flag them if it scans comments.

---

## 6. Gotchas and spec conflicts

### 6.1 Census quirks

1. **The source-scan tests depend on literal prop text.** Per file, the count of `metric={`, `definitions={` and `uses={p.uses(FIGURE.` must equal the count of `<Figure`. My team requires `metric={` and `uses={` before the first `>`; homes check `metric={` in the first 600 chars. Builders must not spread props (`<Figure {...common}>`) or put `>` inside an arrow before those props. Figure ids must be string literals (`id="home-…"`) for the home id scan.
2. **`recordParamReads` is strict.** Every registered param must be read during the sample runs the test performs (model, headline, actions, every analysis). A setting read only on a rare branch (a freeze in force, a closed month) fails unless the test drives that branch. Keep forecast assumptions (attrition, fill rate, time to fill) as `assumptions` data, not metric params, or the test needs fixtures that reach every branch.
3. **`metrics.param()` throws** for an unregistered id or key. That is a crash at render, by design. Register before reading.
4. **`metricsApi` caches by state object identity.** Never mutate a `MetricsState`; reducers always return new objects.
5. **Metric `views` gate visibility.** If `targets.trade.standardHead` lists `['targets']` and Manager can't see Targets, it is hidden even on My team. List every view a metric appears in, and add a finCostMetrics-style test.
6. **Collection cost doubles in scoped modes.** `withoutScope` adds a "wide run" of every view's `actions` over the unscoped ctx. With about 120k plan lines (1,650 positions × 18 to 24 months × 4 versions), `actions(ctx)` must read cached models, never recompute engines. Census budgets: the hrbp engine in under 300 ms and a cold collection in under 400 ms. Windows runs slower; the perf project runs serially (`vite.config.ts` `projects`).
7. **Homes and My team must stay free of `actions`.** The shared collection cache key (`keyOfViews`) only includes views with actions. A home with actions doubles the work and splits the cache.
8. **Import cycles.** Home and My team import views one by one (`OTHER_VIEWS`, `ITEM_SOURCES`) and need a test that keeps those lists equal to the registry. A view must not import `@/views/actions` (its index), only `@/views/actions/engine` and `/metrics`.
9. **`window` text can't be edited** (not in `TEXT_FIELDS`), while formula and population can. The formula-index test requires population and window only for numbers from data (`section !== 'rules'`). Rules and settings are exempt through `kind`, a shared prefix, or `locked && uses.length === 0`.
10. **Null, never 0.** A missing value is `null` ("—"). `suppressed: true` is set when the group is under `minGroupOf(ctx.metrics)`. Never compare against the `MIN_GROUP` constant directly.
11. **Census `ActionItem.amount.rounded`** means Finance's $100k floor (`moneyM`). The HCP spec says Finance is exact for 5+ and HRBP/Leader floored. Invert: exact `money`/`moneyFull` for Finance, `moneyM` floors for HRBP and Leader.
12. **Severity rubric.** `severityOf` upgrades any overdue info item to warning and makes `exposure` critical. HCP has no legal-exposure kinds. Keep `exposure` false, or use it only for over-cap freeze breaches if the user agrees.
13. **Marks are per browser** (localStorage). With real approvals in a PlanStore, "Mark handled" must not hide a request that still needs a decision. Request items should close by request state, with Mark handled disabled for approval kinds (Snooze only).
14. **`HomePage` holds a frame while the mode catches up** (`useAnalyticsPending` with `liveMode !== access.mode`). Keep this, or homes flash the previous mode's numbers.
15. **The headline gate needs `uses`.** Every view with datasets must return `headline().uses`. Views with no datasets are never gated (Census: only `ai`). What if may read datasets, so give it `uses`.
16. **The hrbp `metrics.ts` is 1,247 lines** in one file. For parallel builders, keep one `metrics.ts` per view, but split ids and settings (`ids.ts`) from entries if a view grows past about 600 lines. The catalog imports only `metrics`.

### 6.2 Spec vs Census conflicts, with suggested resolutions

- **C1. `fin.exitRunRate`, `fin.forecastAccuracy`.** `validateCatalog` requires the id prefix to equal `views[0]`, and there is no `fin` view. Use `finance.forecast.exitRunRate` and `finance.forecast.accuracy` (home view `finance`), or home them on `forecast` (`forecast.accuracy.mape`). `home-fin-*` figure ids are fine (figure ids are not metric ids).
- **C2. "Each vs figure has a picker."** Census has no comparison picker. Add `Filters.compare` with a per-mode default and `ctx.compare` (5.6). This touches the filters/store agent's area.
- **C3. "Remind copies a message" (Requests > Cycle)** conflicts with Census's tone rule: `NAGGING` bans `remind\w*` in notes and item `what`, and the note test enforces it. Label the button "Copy note" (or keep "Remind" as the button label only) and generate text through `composeNote`, which must pass `NAGGING`: "Could you send your ranked asks by 15 Oct?"
- **C4. "Census's Data room, Actions and Audit" as views.** In Census, Data room and Action center are pages (`PageKey`), not `ViewDef`s, and Audit does not exist. Make `audit` a page and extend `MetricView` with `'audit'`. HR admin's home is the `data` page (`SLUG_OF` null, default route `#data`).
- **C5. Manager home "My team"** matches Census (`team` view, folder tab only in manager mode, `folderViews`). Census My team composes four producing models. HCP's composes plan, requests and targets models and must not import any cost engine (port `rules.test.ts` with a cost and pay ban list).
- **C6. Action owner roles.** `ActionOwnerRole` is an HR-practice union with no `leader` or `hr-admin`. Replace the union, `ACTION_OWNER_LABEL` and the collect `TEAM_NAMES`. The routing table (`access/policy/routing.ts`) needs HCP item kinds per mode.
- **C7. "Pure engines, each with a Census MetricDef (including name and views)."** `name` and `views` are already required. Also required by tests: `formula` (catalog test), plus `population` and `window` (formula index). Make the HCP catalog test assert all three, so they are not lost if no formula-index page is built.
- **C8. "Overview tabs with 5 to 7 KPIs then the Readout."** Census enforces no count (hrbp has 7; analyses state 4 to 6 in a comment). Add a test: each view's Overview model has 5 to 7 `kpis`, each with `metricId`, `uses` and `drill`.
- **C9. Cost amounts on HRBP and Leader homes.** Census hides cost from HRBP (`showCostIn`). The spec allows it only under the $0.1M floor with an LP test. Home tiles must pick format by mode (`moneyM` floors) and fall back to heads and ratios. Put the rule in `costGuardOf` and the cost engine, never in the UI.
- **C10. Census `summary` and the Scorecard.** HCP has no Scorecard. Keep `summary?` optional in `ViewDef` (Phase 3 Ask can read it) but build none in Phase 1. Census HRBP and CHRO homes depend on the Scorecard model (`useScorecard`, `Standing`, `Measures`); HCP homes must not.
- **C11. Approvals vs read-only Action center.** Census items are derived facts plus browser marks. HCP approvals are writes through `PlanStore` (with a tabSync lock). The Action center can list approval items and link to Requests > Approvals, but must not approve from the list in Phase 1 (keeps the read-only invariant and the one-count tests).
- **C12. `place` lacks cost center and legal entity.** Finance lenses filter by cost center and legal entity. Add `place.costCenter` and `place.legalEntity`, and port `itemContract`'s "place on every item".

### 6.3 Questions for the user (to ask with docs/PLAN.md)

- **Q1 (new requirement).** Does "ratio based on an average headcount" mean (a) cost-weighted heads, with the ratio = band estimate of A ÷ band estimate of B against a company-average "standard head", (b) time-weighted average FTE (an April start = two October starts), or (c) both in one "average heads" unit (proposed default)? Which dimensions can be traded: level and location zone by default, job family optional? Should trades create requests automatically or stay What if levers until "Turn into requests"?
- **Q2.** Comparison picker placement: a global filter (URL-synced, affects every vs tile) or a per-figure picker? Recommended: global filter, with per-mode defaults.
