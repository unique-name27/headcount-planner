# Census digest: data layer, import, sample (for Headcount Planner)

Area: `src/data/**` of Census (its own repository), read-only.
All paths below are relative to `census/` unless they start with `headcount-planner/`.
Line refs are to the files as read on 2026-10-09.

---

## 1. Inventory (every file read, one line each)

Spec and docs
- `../headcount-planner-prompt.md` (196 lines): HCP build spec (datasets, engines, stories, phases).
- `docs/DATA-TIERS.md` (173): tier model none/bronze/silver/gold, data standard control, Data room panels, "Sample data that sucks" table, Settings and Categories & mapping waves.
- `docs/ROLES-V2.md` L1885-1935: Open question 9 and "Decisions made (7 Oct 2026)": why and how the Budget dataset was added.
- `ARCHITECTURE.md` L160-212: privacy rules (MIN_GROUP, `pay: true`), data model, state and context.
- `package.json`, `vite.config.ts`: scripts (Vite via `node --max-semi-space-size=64`), deps (idb-keyval 6.3.0, zustand 5, xlsx 0.20.3 tarball, exceljs 4), vitest `environment: 'node'`, unit vs perf projects.

Data core
- `src/data/schema.ts` (3092): vocabularies, record interfaces, `Datasets`, `DATASET_KEYS`, `OPTIONAL_DATASETS`, `FieldType`, `FieldDef`, `DatasetDef`, `ViewKey`, `f(...)`, the 16 `DATASETS`, `datasetDef`.
- `src/data/store.ts` (1092): Zustand `useCensus`: datasets + versions + history, settings, filters, route, guards, sample seed, IndexedDB persistence, `LS` helper with `census:` prefix.
- `src/data/tabSync.ts` (63): BroadcastChannel `'census'` + `storage` event listener. No locking.
- `src/data/scope.ts` (567): `Filters`, period presets/windows, include/exclude modes, `OrgIndex`, `scopeDatasets`, per-dataset matchers, `isEmployee`, `isActiveAt`, `resolveAsOf`.
- `src/data/urlScope.ts` (322): scope in the hash (`#view.tab?bu=..&not=..`), `UrlScope`, `readScope`, `checkScope`.
- `src/data/context.tsx` (516): `AnalyticsContext`, `buildContext` (reference layer, mode clamp, scope, quality), `AnalyticsProvider` (useDeferredValue), `useAnalytics`.
- `src/data/settings.ts` (465): `Settings`, sanitize/load/save under `census:settings`, settings file `{kind:'census-settings', version:1, ...}`.
- `src/data/savedViews.ts` (368, head + exports): saved views under `census:views`, limits, examples, settings-file section.
- `src/data/quality/storage.ts` (146): IndexedDB key scheme `census:dataset:<k>`, `census:versions:<k>`, `census:raw:<k>:<versionId>`, `census:reference`; `clearCensusStorage`.

Import (`src/data/import/`)
- `types.ts` (205): ParsedSheet/Workbook, Mapping, ApplyOptions, ImportIssue/IssueCode, ImportResult.
- `index.ts` (87): barrel with the canonical usage example.
- `synonyms.ts` (172): `EXTRA_SYNONYMS` vendor headers per dataset (Workday, Greenhouse, Adaptive/Anaplan...).
- `apply.ts` (573): `applyMapping`: coerce, resolve people, fill defaults, required checks, dedupe by `rowKey` (or `mergeDuplicates.sum`), manager linking, roster check.
- `automap.ts` (589, head + exports): scored header→field matching (`MIN_SCORE 0.5`, high ≥0.85, medium ≥0.65), `autoMap`, `rankHeaders`, `withChoice`.
- `parse.ts` (98): SheetJS read (`readWorkbook`), CSV kept raw, delimiter sniffing, `WorkbookReadError`.
- `sheet.ts` (112): header-row detection, `dedupeHeaders`, `toSheet` (drops protected columns), `sheetFromRows`.
- `detect.ts` (183): `guessDataset` (0.5 required + 0.25 core + 0.25 explained + 0.2 sheet-name bonus), `SHEET_ALIASES: Record<DatasetKey,...>`.
- `normalize.ts` (301, head + `coerceValue`): coercers per FieldType, `MONTH_FIELDS`, relative-day fields, value maps.
- `defaults.ts` (453, most): `REFERENCE_FX_TO_USD`, `DOCUMENTED_DEFAULTS: Record<DatasetKey,string[]>`, `fillDefaults` switch, `fillBudget`, `fillComp`.
- `vocab.ts` (978, levels + enum table): `normalizeLevel`, `ENUM_NORMALIZERS` keyed `dataset.field`, `normalizeEnumValue`.
- `canonical.ts` (272, part): `canonicalText` (sites, currencies, categories), `normalizeCurrency` ("US$" → USD).
- `profiles.ts` (200): mapping profiles in IDB `census:profile:<dataset>:<fp>`, learned synonyms in localStorage `census:synonyms:<dataset>`.
- `protected.ts` (139): `dropReason`, `droppedColumns`, `droppedText` (protected characteristics, proxies, free-text comments).
- `templates.ts` (386, head + builders): ExcelJS template/export (`buildTemplateWorkbook`, `exportDatasetWorkbook`), pay columns blank unless `includePay`.
- Tests skimmed: `apply.test.ts`, `automap.test.ts`, `budget.test.ts` (full), `detect.test.ts`, `e2e.test.ts` (head), `newDatasets.test.ts`, `parse.test.ts`, `profiles.test.ts`, `protected.test.ts`, `templates.test.ts` (head), `normalize.test.ts`.

Lists (`src/data/lists/`)
- `types.ts` (210): ListId union, ListKind org/vocab/fixed, ListDef, ListValue, SavedList, ListsState (`census:lists`), EffectiveList, ListEdit.
- `defs.ts` (334): the 19 `LIST_DEFS` with `refs` (FieldRefs checked), parents, attrs, sheet names.
- `store.ts` (94): `useLists` Zustand store, saves to localStorage, `storage`-event sync.
- `effective.ts` (272, head): status rules (saved / sample / proposed from data / census vocab), `validationVocab`, `templateLists`.
- `seed.ts` (357, parts): `censusValues` (built-in vocab lists), `listFromData` (majority parent), `sampleListValues` (dept/BU codes from cost centers).

Quality (`src/data/quality/`)
- `tier.ts` (83): Tier, DataStandard, ranks, labels.
- `fieldRef.ts` (45): `FieldRef = \`${DatasetKey}.${string}\``, validation helpers.
- `types.ts` (229): DatasetVersion, Certification, ControlTotal, IssueCounts, FieldStats, RuleResult, QualityIndex.
- `rules.ts` (381, parts): `LINKS`, `DATE_SEQUENCES`, `FRESHNESS`, `SNAPSHOT_FRESHNESS`, thresholds, `CONTROL_METRICS`, `QualityRules`.
- `applicability.ts` (322, parts): per-field applicability (`blankOk`), budget entries.
- `seed.ts` (112): `SampleSeedEntry`, `SampleSeed`, `buildSampleState`, `sampleVersion`, `mergeStoredSample`.
- `versions.ts` (173, head): `HISTORY_SIZE 3`, `newVersionId`, `sampleVersionId`.

Sample (`src/data/sample/`)
- `prng.ts` (102): `Rng` (mulberry32), `rngFor(stream)` = seed `20_260_930` XOR FNV-1a(stream).
- `index.ts` (149): `generateSample()` pipeline order, `SAMPLE_AS_OF = '2026-09-30'`, `SAMPLE_COMPANY`, `cachedSample()`.
- `model.ts` (142): internal `Person`, `World`, `Tag`, `activeOn`.
- `calendar.ts` (95): integer Day arithmetic, `AS_OF`, `FOUNDED`, `T12_START`, `T24_START`.
- `departments.ts` (854, parts): 6 BUs, 22 departments (`DeptSpec` with size, sites, mix, cost-center code), `EXEC_SLOTS`, `SITE_CODE`, `costCenter(dept, site)`.
- `org.ts` (447, head): team builder (spans 3-8, planted outliers), directors/managers/ICs.
- `employees.ts` (1190, head + `employeeRows`): hires, leavers, contingent, history, IDs; cost center on every row.
- `comp.ts` (302, head): FX table, `MID_USD` by level, `ZONE` by site, rounding units, target bonus, equity.
- `budget.ts` (243, head): FY27 budget (Apr 2026-Mar 2027), cost center × month, planted SE/GTM stories.
- `hiringPlan.ts` (265, head): FY27 v2 reforecast (July), counts Apr-Sep, position rows Oct-Mar.
- `recruiting.ts` (1070, head), `fte.ts` (83, head), `leave.ts` (270, head).
- `README.md` (470, most): modules, sizes, company shape, ID schemes, measurement rules, planted stories, messy sample table.
- `sample.test.ts` (1518, helpers + all test titles), `sample.perf.test.ts` (10).
- `raw/` (listed + read): `plan.ts`, `extract.ts`, `format.ts`, `gold.ts` (head), `index.ts`, `seed.ts`, `load.ts`, `starter.ts`, `extracts/{budget,hiringPlan,requisitions}.ts` (full); titles of `raw.test.ts`, `load.test.ts`, `stories.test.ts`. Folder also holds `extracts/{candidates,cases,jobChanges,learning,onboardingTasks,rightToWork,succession,surveys,transactions}.ts`.

Other
- `src/lib/budget.ts` L300-382: `annualTargetCashUsd`, `midpointRates`, `currencyRates`.
- `src/data/store.test.ts` (setup), titles of `scope.test.ts`, `scopeExclude.test.ts`, `urlScope.test.ts`, `settings.test.ts`, `savedViews.test.ts`, `context.test.ts`, `linkChecks.test.ts`, `lists/lists.test.ts`, `lists/sample.test.ts`, `quality/{core,versions,compute}.test.ts`.

---

## 2. Contracts (verbatim TypeScript)

### 2.1 schema.ts core

```ts
// schema.ts L16-19
export type ISODate = string
export type ISODateTime = string
export const MIN_GROUP = 5

// L23-41  (NOTE: Census levels are L/M/E, not P)
export const LEVELS = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'M1', 'M2', 'E1', 'E2', 'E3'] as const
export type Level = (typeof LEVELS)[number]
export const LEVEL_LABELS: Record<Level, string> = {
  L1: 'L1 Entry', L2: 'L2 Developing', L3: 'L3 Career', L4: 'L4 Senior', L5: 'L5 Staff',
  L6: 'L6 Principal', M1: 'M1 Manager', M2: 'M2 Director', E1: 'E1 Vice president',
  E2: 'E2 Senior VP', E3: 'E3 Executive',
}
export type LevelTrack = 'Individual contributor' | 'Manager' | 'Executive'
export const levelTrack = (l: Level): LevelTrack =>
  l.startsWith('L') ? 'Individual contributor' : l.startsWith('M') ? 'Manager' : 'Executive'
export const levelIndex = (l: string): number => LEVELS.indexOf(l as Level)

// L43-53
export const REGIONS = ['Americas', 'EMEA', 'APAC'] as const
export type Region = (typeof REGIONS)[number]
export interface Site {
  location: string
  country: string
  jurisdiction: string
  region: Region
  currency: string
}
// SITES L54-98 (13 sites), siteByLocation L99
export const siteByLocation = new Map(SITES.map((s) => [s.location, s]))
export const EMPLOYMENT_TYPES = ['Employee', 'Contractor', 'Intern'] as const
export const REQ_STATUSES = ['Open', 'On hold', 'Filled', 'Cancelled'] as const
export const REQ_TYPES = ['New', 'Backfill'] as const
export const REQ_PRIORITIES = ['Critical', 'High', 'Standard'] as const
```

```ts
// schema.ts L1281-1372  (copy verbatim; this is the shape HCP must mirror)
export type FieldType =
  | 'string' | 'id' | 'date' | 'datetime' | 'number' | 'percent' | 'money' | 'boolean' | 'enum' | 'level'

export interface FieldDef {
  key: string
  label: string
  type: FieldType
  required?: boolean
  /** Unlocks analyses; shown amber when missing. */
  recommended?: boolean
  /** Header aliases (normalized: lowercase, punctuation to spaces). */
  synonyms: string[]
  /** Allowed canonical values for enum fields. */
  values?: readonly string[]
  description: string
  /** Hidden from exports unless pay amounts are switched on. */
  pay?: boolean
  /** Immigration detail: shown per person only while "Show immigration details" is on. */
  immigration?: boolean
}

export interface DatasetDef {
  key: DatasetKey
  label: string
  /** Sheet name used in templates and multi-sheet workbooks. */
  sheet: string
  description: string
  /** Views that read this dataset. */
  usedBy: ViewKey[]
  /** Fields that identify a row, for de-duplication. */
  rowKey: string[]
  /**
   * Rows with the same row key are one line whose `sum` field adds up (a hiring plan lists the
   * same role twice for two hires), instead of duplicates where one row is kept.
   */
  mergeDuplicates?: { sum: string }
  /** At least one of these fields must be filled for a row to import (e.g. employee or application ID). */
  requireOneOf?: string[]
  fields: FieldDef[]
}

const f = (
  key: string,
  label: string,
  type: FieldType,
  synonyms: string[],
  description: string,
  extra: Partial<FieldDef> = {},
): FieldDef => ({ key, label, type, synonyms, description, ...extra })

export const DATASETS: DatasetDef[] = [ /* 16 entries */ ]
export const datasetDef = (key: DatasetKey): DatasetDef => DATASETS.find((d) => d.key === key)!
```

```ts
// schema.ts L1212-1277
export interface Datasets { employees: Employee[]; jobChanges: JobChange[]; requisitions: Requisition[];
  candidates: Candidate[]; cases: HrCase[]; transactions: HrTransaction[]; reviews: Review[];
  succession: SuccessionPlan[]; learning: LearningRecord[]; comp: CompRecord[];
  hiringPlan: HiringPlanLine[]; onboardingTasks: OnboardingTask[]; rightToWork: RightToWork[];
  surveyResponses: SurveyResponse[]; surveyItems: SurveyItem[]; budget: BudgetLine[] }
export type DatasetKey = keyof Datasets
export const DATASET_KEYS: DatasetKey[] = [ /* the 16 keys in order */ ]
/** Datasets added for Onboarding, Compliance, Listening and Finance's budget. The sample may leave them empty. */
export const OPTIONAL_DATASETS: readonly DatasetKey[] = ['hiringPlan','onboardingTasks','rightToWork','surveyResponses','surveyItems','budget']
export function emptyDatasets(): Datasets {
  return Object.fromEntries(DATASET_KEYS.map((k) => [k, []])) as unknown as Datasets
}
export function withAllDatasets(data: Partial<Datasets>): Datasets {
  if (DATASET_KEYS.every((k) => Array.isArray(data[k]))) return data as Datasets
  const out = { ...data } as Record<DatasetKey, unknown[]>
  for (const k of DATASET_KEYS) if (!Array.isArray(out[k])) out[k] = []
  return out as unknown as Datasets
}
```

Relevant Census record types HCP rows descend from (verbatim, trimmed comments):

```ts
export interface CompRecord {            // L1067
  employeeId: string
  currency: string
  /** Annual base in local currency, full-time equivalent. */
  baseSalary: number
  rangeMin: number; rangeMid: number; rangeMax: number
  /** USD per one unit of local currency; null when unknown (amount totals then skip the row). */
  fxToUsd: number | null
  targetBonusPct?: number | null; bonusPayoutPct?: number | null
  /** Annualized equity grant value in USD. */
  annualEquityUsd?: number | null
  marketP50?: number | null; lastIncreaseDate?: ISODate | null; lastIncreasePct?: number | null
  meritPct?: number | null; promotionPct?: number | null
}
export interface Requisition {           // L934
  reqId: string; jobTitle: string; businessUnit: string; department: string; location: string
  level: Level | null; hiringManagerId?: string | null; hiringManager?: string | null
  recruiter?: string | null; openedDate: ISODate; targetStartDate?: ISODate | null
  /** Date the req's (last) offer was accepted; time to fill ends here. */
  filledDate?: ISODate | null; closedDate?: ISODate | null; status: ReqStatus
  reqType: (typeof REQ_TYPES)[number] | null; priority: (typeof REQ_PRIORITIES)[number] | null
  openings: number
}
export interface BudgetLine {            // L1120
  /** First day of the budgeted month (YYYY-MM-01). */
  period: ISODate
  businessUnit: string
  /** Blank for a line that budgets the whole business unit. */
  department?: string | null
  /** Blank for a line that budgets a whole department or business unit. */
  costCenter?: string | null
  budgetHeadcount: number
  budgetCost?: number | null
  /** ISO code of `budgetCost`'s currency; blank reads as USD. */
  currency?: string | null
  planVersion?: string | null
}
export interface HiringPlanLine { period: ISODate; businessUnit: string; department: string; plannedHires: number;
  location?: string | null; level?: Level | null; jobTitle?: string | null; reqType?: ... | null;
  reqId?: string | null; positionId?: string | null; planVersion?: string | null }
```

Census DatasetDef examples to copy literally (pattern for money/pay and month periods):
- `comp`: `rowKey: ['employeeId']`; `baseSalary` `{ required: true, pay: true }`, `rangeMin/Max` `{ recommended: true, pay: true }`, `rangeMid` `{ required: true, pay: true }`, `annualEquityUsd`/`marketP50` `{ pay: true }`; percents (`targetBonusPct`, `meritPct`) are NOT pay.
- `hiringPlan`: `rowKey: ['planVersion','period','businessUnit','department','location','level','jobTitle','reqType','reqId','positionId']`, `mergeDuplicates: { sum: 'plannedHires' }`.
- `budget` (L2976-3090): label `'Headcount and cost budget'`, sheet `'Budget'`, `usedBy: ['home','scorecard','comp']`, `rowKey: ['planVersion','period','businessUnit','department','costCenter']`; required `period`, `businessUnit`, `budgetHeadcount`; `budgetCost` `{ recommended: true, pay: true }`.
- `onboardingTasks`: `requireOneOf: ['employeeId', 'applicationId']`.

### 2.2 store.ts

```ts
export type RouteView = ViewKey | 'data' | 'actions' | 'dev'
export interface Route { view: RouteView; tab: string }
export const HOME_VIEW: RouteView = 'scorecard'
export const PAGE_VIEWS: readonly RouteView[] = ['data', 'actions', 'dev']
export type FilterGuard = (next: Filters) => Filters
export interface RouteGuard {
  check: (route: Route) => { route: Route; notice?: () => void } | null
  /** The mode's home page. */
  home: () => RouteView
}
export type StandardGuard = (asked: DataStandard) => DataStandard
export function setFilterGuard(fn: FilterGuard | null): void
export function setRouteGuard(g: RouteGuard | null): void
export function setStandardGuard(fn: StandardGuard | null): void
export const guardFilters = (f: Filters): Filters => (filterGuard ? filterGuard(f) : f)
export const homeView = (): RouteView => routeGuard?.home() ?? HOME_VIEW

export interface SourceMeta {
  kind: 'sample' | 'upload'
  rowCount: number
  fileName?: string; sheetName?: string; importedAt?: string
  /** Rows that imported with a warning (defaulted or unparsed values). */
  warnings?: number
  /** Header fingerprint of the mapping profile used, so the Data room can offer to edit it. */
  profileFingerprint?: string
}
export interface ReplaceExtra {
  raw?: ParsedSheet | null
  mapping?: Mapping | VersionMapping | null
  options?: ApplyOptions | null
  issues?: readonly ImportIssue[]
  rowsIn?: number
}
export interface CensusState extends Settings {
  ready: boolean
  storageUnavailable: boolean
  data: Datasets
  sources: Record<DatasetKey, SourceMeta>
  versions: Record<DatasetKey, DatasetVersion>
  history: Record<DatasetKey, DatasetVersion[]>   // newest first, at most three
  reference: ReferenceState
  filters: Filters
  route: Route
  /** Pay amounts are shown and exported. In memory only: off on every load, never persisted. */
  showPay: boolean
  showImmigration: boolean
  settingsOpen: SettingsRequest
  metrics: MetricsState
  init: () => Promise<void>
  setFilters: (patch: Partial<Filters>, opts?: { history?: AddressIntent }) => void
  navigate: (view: RouteView, tab?: string, opts?: { scroll?: boolean; history?: AddressIntent }) => void
  setShowPay: (on: boolean) => void
  replaceDataset: <K extends DatasetKey>(key: K, rows: Datasets[K],
    meta: Omit<SourceMeta, 'kind' | 'rowCount'>, extra?: ReplaceExtra) => Promise<void>
  resetDataset: (key: DatasetKey) => Promise<void>
  resetAllToSample: () => Promise<void>
  applySampleSeed: (seed: SampleSeed) => void
  confirmMapping: (key: DatasetKey, by: string) => void
  certify: (key: DatasetKey, input: CertifyInput) => Certification | null
  revokeCertification: (key: DatasetKey) => void
  getRaw: (key: DatasetKey, versionId?: string) => Promise<RawRecord | null>
  clearDevice: () => Promise<void>
  // ...settings, metric dictionary, reference-mapping actions
}
export function contextAsOf(args: { data: Datasets; sources: Record<DatasetKey, SourceMeta>;
  asOfOverride: ISODate | null; today?: ISODate }): ISODate   // SAMPLE_AS_OF while every dataset is sample
export function setSampleSeed(loader: SampleSeedLoader | null): void
export const useCensus = create<CensusState>((set, getState) => { ... })
```

The `LS` helper (store.ts L332-355) prefixes every localStorage key:
```ts
const LS = {
  get<T>(k: string, fallback: T): T { try { const v = localStorage.getItem(`census:${k}`); return v == null ? fallback : (JSON.parse(v) as T) } catch { return fallback } },
  set(k: string, v: unknown) { try { localStorage.setItem(`census:${k}`, JSON.stringify(v)) } catch {} },
  remove(k: string) { try { localStorage.removeItem(`census:${k}`) } catch {} },
}
const perKey = <T>(make: (k: DatasetKey) => T): Record<DatasetKey, T> =>
  Object.fromEntries(DATASET_KEYS.map((k) => [k, make(k)])) as Record<DatasetKey, T>
```

`init()` (L665-753): listen for other tabs (`listenToTabs(SETTINGS_KEY, ...)`), await the seed, `buildSampleState`, then read IDB `DATASET_KEY(k)`, `loadVersions(k)`, `REFERENCE_KEY` inside `withTimeout(..., 1500)`; on timeout run on the sample with `storageUnavailable: true`. `replaceDataset` makes a new version (`newVersionId`), `advance()` pushes the old one to history (3 kept, raw sheets of dropped versions deleted), persists versions then `idbSet(DATASET_KEY(key), { rows, meta, versionId })`. Sample rows are never stored (regenerated deterministically).

### 2.3 storage keys (quality/storage.ts, verbatim)

```ts
import { del as idbDel, get as idbGet, keys as idbKeys, set as idbSet } from 'idb-keyval'   // DEFAULT idb-keyval store
export const DATASET_KEY = (k: DatasetKey) => `census:dataset:${k}`
export const VERSIONS_KEY = (k: DatasetKey) => `census:versions:${k}`
export const RAW_KEY = (k: DatasetKey, versionId: string) => `census:raw:${k}:${versionId}`
export const REFERENCE_KEY = 'census:reference'
export interface StoredVersions { current: DatasetVersion | null; history: DatasetVersion[] }
export function rememberRaw(rec: RawRecord): void        // in-memory, for sample raw sheets
export async function saveRaw(rec: RawRecord): Promise<void>
export async function loadRaw(key: DatasetKey, versionId: string): Promise<RawRecord | null>
export async function deleteRaw(key: DatasetKey, versionId: string): Promise<void>
export async function saveVersions(key: DatasetKey, stored: StoredVersions): Promise<void>
/** Throws when storage is unavailable, so the caller can tell "nothing saved" from "blocked". */
export async function loadVersions(key: DatasetKey): Promise<StoredVersions | null>
export async function clearCensusStorage(): Promise<string[]>  // deletes census:* in IDB, localStorage, sessionStorage
```

Full Census key map: IDB (default idb-keyval DB `keyval-store`, store `keyval`): `census:dataset:<k>`, `census:versions:<k>`, `census:raw:<k>:<vid>`, `census:reference`, `census:profile:<dataset>:<fp>`. localStorage: `census:settings` (+ legacy `census:theme|tools|comp-cycle-settings|asOf`), `census:filters`, `census:views`, `census:lists`, `census:metrics`, `census:mode`, `census:access-draft`, `census:synonyms:<dataset>`, `census:ask-*`. sessionStorage: `census:access-preview`, `census:ask-key`. Nothing named `'kv'` exists in Census.

### 2.4 tabSync.ts (verbatim, whole contract)

```ts
export type TabMessage = { kind: 'reference' } | { kind: 'cleared' }
export interface TabHandlers {
  /** `census:settings` changed (or was removed) in another tab. */
  settings: () => void
  message: (m: TabMessage) => void
}
const CHANNEL = 'census'
export function isTabMessage(v: unknown): v is TabMessage
/** Tell the other open tabs. Never throws. */
export function postToTabs(m: TabMessage): void
/** Start listening once per page; later calls do nothing. */
export function listenToTabs(settingsKey: string, h: TabHandlers): void
```
Mechanism: `storage` event for `census:settings` (null key = cleared); BroadcastChannel message after an IDB write; receivers re-read IndexedDB rather than trusting the message. It does NOT lock writes and never makes a tab read-only (see section 6, conflict C3).

### 2.5 scope.ts

```ts
export type PeriodPreset = 't12m' | 'ytd' | 'lastQuarter' | 't6m' | 't3m' | 'custom'
export interface Window { start: ISODate; end: ISODate; months: number; label: string }
export function periodWindows(preset: PeriodPreset, asOf: ISODate,
  custom?: { start: ISODate | null; end: ISODate | null }): { current: Window; prior: Window }
// NOTE 'ytd' starts `${asOf.slice(0,4)}-01-01` (calendar, not fiscal)
export type FilterDimension = 'leaderId' | 'businessUnit' | 'department' | 'location' | 'level'
export type ListDimension = Exclude<FilterDimension, 'leaderId'>
export const LIST_DIMENSIONS: readonly ListDimension[] = ['businessUnit', 'department', 'location', 'level']
export type FilterMode = 'include' | 'exclude'
export type FilterModes = Partial<Record<FilterDimension, FilterMode>>
export interface Filters {
  period: PeriodPreset; customStart: ISODate | null; customEnd: ISODate | null
  leaderId: string | null
  businessUnit: string[]; department: string[]; location: string[]; level: string[]
  modes: FilterModes
}
export const DEFAULT_FILTERS: Filters
export function normalizeFilters(raw: unknown): Filters        // untrusted input → valid Filters
export function canonicalFilters(f: Filters): Filters
export const sameFilters = (a: Filters, b: Filters): boolean
export interface OrgIndex { byId: Map<string, Employee>; children: Map<string, Employee[]> }
export function buildOrgIndex(employees: readonly Employee[]): OrgIndex
export function subtreeIds(index: OrgIndex, leaderId: string): Set<string>   // cycle-safe
export function employeeMatcher(filters: Filters, index: OrgIndex): (e: Employee | undefined) => boolean
export function scopeDatasets(input: Datasets, filters: Filters, index: OrgIndex): Datasets
export const isEmployee = (e: Employee): boolean => e.employmentType === 'Employee'
/** Active on date d: hired on or before d, and no termination date or one after d. */
export function isActiveAt(e: Employee, d: ISODate): boolean {
  if (!e.hireDate || e.hireDate > d) return false
  return !e.terminationDate || e.terminationDate > d      // ← termination date itself is NOT active
}
export function scopeLabel(filters: Filters, index: OrgIndex): string
export function resolveAsOf(data: Datasets, today: ISODate, override?: ISODate | null): ISODate
```
`scopeDatasets` returns an object literal listing every dataset key (TS forces a line per new dataset). Budget lines use `budgetMatcher`: an include filter on leader/location/level leaves every budget line out (lines can't be placed); exclude keeps them.

### 2.6 urlScope.ts / savedViews.ts / settings.ts

```ts
export interface UrlScope { filters: Filters; standard: DataStandard; lens: boolean }
export const DIM_PARAM: Record<FilterDimension, string> = { leaderId: 'leader', businessUnit: 'bu', department: 'dept', location: 'loc', level: 'level' }
export const SCOPE_KEYS: readonly string[]   // scope, period, from, to, leader, bu, dept, loc, level, not, std, lens
export function splitHash(hash: string): { route: string; query: string | null }
export function scopeParams(scope: UrlScope, opts?: { explicit?: boolean }): URLSearchParams
export function hashWithScope(route: string, scope: UrlScope, opts?: { explicit?: boolean }): string
export function readScope(query: string | null | undefined): ReadScope
export const VIEWS_KEY = 'census:views'; export const VIEWS_VERSION = 1; VIEW_NAME_MAX = 60; VIEWS_MAX = 50
export interface SavedView { id: string; name: string; filters: Filters; standard: DataStandard; lens: boolean; page: ViewPage | null; example?: boolean }
export interface Settings { theme: ThemePref; textSize: TextSize; motion: MotionPref; dataStandard: DataStandard;
  asOfOverride: ISODate | null; compCycle?: CompCycleSettings /* deprecated */; tools: ToolLinks; engagementSurveys: boolean }
export const SETTINGS_KEY = 'census:settings'
export const SETTINGS_FILE_KIND = 'census-settings'; export const SETTINGS_FILE_VERSION = 1
export interface SettingsFile { kind: typeof SETTINGS_FILE_KIND; version: number; exportedAt: string; settings: Settings;
  metrics?: MetricsFileSection; lists?: ListsFileSection; views?: ViewsFileSection; accessDraft?: unknown }
export const settingsFileName = (today: ISODate): string => `census-settings-${today}.json`
export function sanitizeSettings(raw: unknown, today?: ISODate): Settings   // every invalid field → default
export function parseSettingsFile(input: unknown, current: Settings, today?: ISODate, currentCycle?: CompCycleSettings): ImportSettingsResult
// refuses: not JSON; kind mismatch ("The file is not a Census settings file."); version > current ("newer version")
```
The settings file is the template for HCP's `.hcplan.json` workspace file (kind/version/exportedAt + sections, every field sanitized, newer version refused).

### 2.7 context.tsx

```ts
export interface AnalyticsContext {
  asOf: ISODate; window: Window; prior: Window; filters: Filters; scopeLabel: string
  isCompany: boolean
  data: Datasets      // org-scoped, after reference mappings
  all: Datasets       // unscoped, for benchmarks
  org: OrgIndex; sources: Record<DatasetKey, SourceMeta>; isSample: boolean
  showPay: boolean    // `pay: true` columns; mode switch AND session switch
  showCost: boolean   // `cost: true` group-total columns: showPay, or Finance always
  showImmigration: boolean; features: Features
  quality: QualityIndex; standard: DataStandard; reference: ReferenceSummary
  metrics: MetricsApi; jobs: JobArchitecture; offerDeclineReasons: readonly ListValue[]
  universities: readonly ListValue[]
  access: AccessContext; regions?: RegionIndex
}
export function buildContext(args: { data: Datasets; sources: Record<DatasetKey, SourceMeta>; filters: Filters;
  asOfOverride: ISODate | null; showPay: boolean; showImmigration?: boolean; features?: Features; today?: ISODate;
  versions?: Partial<Record<DatasetKey, DatasetVersion | null>>; mappings?: readonly ReferenceMapping[];
  applied?: AppliedReference; standard?: DataStandard; quality?: QualityIndex; metrics?: MetricsApi;
  access?: AccessInput; lists?: ListsState; regions?: RegionIndex | null;
  departmentParents?: ReadonlyMap<string, string | null> | null; regionOwners?: ReadonlyMap<string, string> | null }): AnalyticsContext
export function AnalyticsProvider({ children, access }: { children: ReactNode; access?: AccessInput }): JSX.Element
export function useAnalytics(): AnalyticsContext
export function useAnalyticsIfAny(): AnalyticsContext | null
export function useAnalyticsPending(): boolean
```
Order inside `buildContext`: reference layer → `contextAsOf` → `buildOrgIndex(all.employees)` → `scopeFor(mode, picks)` → `clampFilters(filters, scope, mode)` → `periodWindows` → `applyScope(scopeDatasets(all, filters, org), scope)`. The provider memoizes the reference layer and quality separately so a filter change only rescopes, then `useDeferredValue` keeps the old context while the new one computes.

### 2.8 import/types.ts and pipeline signatures

```ts
export type FileFormat = 'xlsx' | 'xls' | 'csv' | 'tsv' | 'other'
export interface ParsedSheet {
  name: string; headerRow: number; headers: string[]
  rows: Record<string, unknown>[]; rowNumbers: number[]; dropped?: DroppedColumn[]
}
export interface ParsedWorkbook { fileName: string; format: FileFormat; sheets: ParsedSheet[]; emptySheets: string[] }
export type Confidence = 'high' | 'medium' | 'low'
export interface MappedField { header: string | null; confidence: Confidence; score: number; reason: string }
export type Mapping = Record<string, MappedField>
export interface DatasetGuess { key: DatasetKey; confidence: number; matched: number; missingRequired: string[] }
export interface KnownValues { field: string; values: Set<string> }
export type DateOrder = 'MDY' | 'DMY'
export interface ApplyOptions {
  dateOrders?: Record<string, DateOrder>; percentWhole?: Record<string, boolean>
  hourlyToAnnual?: HourlyConversion | null; valueMaps?: Record<string, Record<string, string | null>>
}
export type IssueCode = 'missing-required' | 'column-missing' | 'unreadable' | 'unknown-value' | 'out-of-range'
  | 'duplicate' | 'defaulted' | 'converted' | 'manager-self' | 'manager-unknown' | 'manager-ambiguous'
  | 'manager-cycle' | 'not-in-roster'
export type IssueAction = 'row-skipped' | 'left-blank' | 'defaulted' | 'cleared' | 'converted' | 'kept'
export interface ImportIssue { row: number; id: string | null; field: string; label: string; value: string;
  code: IssueCode; issue: string; action: IssueAction }
export interface ImportResult<K extends DatasetKey = DatasetKey> { dataset: K; rows: Datasets[K];
  issues: ImportIssue[]; stats: ImportStats; used: { dateOrders: Record<string, DateOrder>;
  percentWhole: Record<string, boolean>; hourlyToAnnual: HourlyConversion | null } }

// pipeline (import/index.ts usage)
export function readWorkbook(input: ArrayBuffer | Uint8Array, fileName: string): ParsedWorkbook  // throws WorkbookReadError
export function sheetFromRows(name: string, aoa: unknown[][]): ParsedSheet | null
export function guessDataset(sheet: ParsedSheet, learned?: Partial<Record<DatasetKey, Record<string, string>>>): DatasetGuess[]
export function autoMap(headers: readonly string[], sampleRows: readonly Record<string, unknown>[], def: DatasetDef,
  learned?: Record<string, string>, known?: readonly KnownValues[]): Mapping
export function withChoice(mapping: Mapping, fieldKey: string, header: string | null): Mapping
export interface ApplyArgs { sheet: ParsedSheet; def: DatasetDef; mapping: Mapping; roster?: readonly Employee[];
  candidates?: readonly Candidate[]; options?: ApplyOptions }
export function applyMapping<K extends DatasetKey = DatasetKey>(args: ApplyArgs): ImportResult<K>
export function coerceValue(dataset: DatasetKey, field: FieldDef, v: unknown, col: ColumnSettings): Coerced<unknown>
export interface Coerced<T> { value: T | null; issue?: string; code?: IssueCode }
export function fillDefaults(dataset: DatasetKey, r: RowFill, ctx: SheetContext): void
export type FillMode = 'silent' | 'logged' | 'logged-if-unmapped'
export const REFERENCE_FX_TO_USD: Record<string, number>   // EUR 1.1, ILS 0.27, INR 0.0118, TWD 0.032, ...
export const DOCUMENTED_DEFAULTS: Record<DatasetKey, string[]>
export function droppedColumns(headers: readonly string[]): DroppedColumn[]
export function droppedText(dropped: readonly DroppedColumn[]): string | null
export interface MappingProfile { version: 1; dataset: DatasetKey; fingerprint: string; fields: Record<string, string | null>;
  dateOrders: Record<string, DateOrder>; percentWhole: Record<string, boolean>; hourlyToAnnual: HourlyConversion | null;
  valueMaps: Record<string, Record<string, string | null>>; savedAt: string }
export function headerFingerprint(headers: readonly string[]): string   // FNV-1a, 8 hex, order-independent
export async function buildTemplateWorkbook(opts?: TemplateOptions): Promise<Blob>
export async function exportDatasetWorkbook<K extends DatasetKey>(key: K, rows: readonly Datasets[K][number][],
  opts: { includePay: boolean; lists?: TemplateLists }): Promise<Blob>   // drops `pay: true` fields unless includePay
export const EXTRA_SYNONYMS: Partial<Record<DatasetKey, Record<string, string[]>>>
export function normalizeLevel(raw: unknown): Level | null   // codes first: (level|lvl|grade)?(l|ic|p|t)?[1-6] → L n; m1-2; e1-3; then title words
```

### 2.9 lists

```ts
export type ListId = 'businessUnit' | 'department' | 'jobFamily' | 'jobFunction' | 'level' | 'location' | 'region'
  | 'costCenter' | 'caseCategory' | 'source' | 'terminationReason' | 'leaveReason' | 'learningCategory'
  | 'surveyProgram' | 'university' | 'degreeLevel' | 'fieldOfStudy' | 'offerDeclineReason' | 'chipStage'
export type ListKind = 'org' | 'vocab' | 'fixed'
export interface ListDef { id: ListId; label: string; singular: string; kind: ListKind; refs: readonly FieldRef[];
  parent?: ListId; attrs: readonly ListAttrDef[]; sheet: string; name: string; about: string; reads?: readonly DatasetKey[] }
export interface ListValue { value: string; parent?: string | null; attrs?: Record<string, AttrValue>;
  retired?: boolean; replacedBy?: string | null; builtIn?: boolean; added?: boolean }
export interface ListsState { lists: Partial<Record<ListId, SavedList>>; log: ListChange[] }   // localStorage `census:lists`
// defs.ts: costCenter list = { kind: 'org', refs: ['employees.costCenter','budget.costCenter'], parent: 'department', attrs: [{key:'name'}] }
// location list attrs: country, region (REGIONS), jurisdiction, currency
// level list: kind 'fixed', attrs label + derived track
```

### 2.10 quality

```ts
export type Tier = 'none' | 'bronze' | 'silver' | 'gold'
export type DataStandard = 'gold' | 'silver' | 'bronze'
export const DEFAULT_STANDARD: DataStandard = 'bronze'
export const meetsStandard = (tier: Tier, standard: DataStandard): boolean
export type FieldRef = `${DatasetKey}.${string}`
export interface DatasetVersion { versionId: string; dataset: DatasetKey; source: 'sample' | 'upload';
  fileName: string | null; sheetName: string | null; importedAt: string | null; rowCount: number;
  mapping: VersionMapping; mappingConfirmedAt?: string | null; mappingConfirmedBy?: string | null;
  applyOptions?: ApplyOptions | null; issues: IssueCounts; hasRaw: boolean; certification?: Certification | null }
export interface Certification { by: string; at: string; note?: string; controlTotals?: ControlTotal[]; versionId: string; asOf?: ISODate }
export type ControlMetricId = 'rows' | 'activeHeadcount' | 'activeWorkers' | 'exits12m' | 'totalBaseUsd' | 'openReqs' | 'openCases' | 'ratedPeople'
export interface RawRecord { dataset: DatasetKey; versionId: string; sheet: ParsedSheet; issues: readonly ImportIssue[] }
export interface Link { fields: string[]; target: DatasetKey; targetKey: string }
export const LINKS: Partial<Record<DatasetKey, Link>>        // ONE link per dataset
export const DATE_SEQUENCES: Partial<Record<DatasetKey, string[][]>>
export const FRESHNESS: Partial<Record<DatasetKey, { fields: string[]; what: string; maxDays: number }>>
export const SNAPSHOT_FRESHNESS: Partial<Record<DatasetKey, { what: string; maxDays: number }>>   // comp 45 d
export const MIN_COVERAGE = 0.95; MAX_PROBLEM_SHARE = 0.02; MAX_ISSUE_RATE = 0.02; MAX_UNRESOLVED_SHARE = 0.02; DEFAULT_TOLERANCE = 0.005
export const HISTORY_SIZE = 3
export const sampleVersionId = (key: DatasetKey, seeded = false): string => `sample-${key}${seeded ? '-raw' : ''}`
export interface SampleSeedEntry<K extends DatasetKey = DatasetKey> { rows?: Datasets[K]; raw?: ParsedSheet;
  mapping?: Mapping | VersionMapping; options?: ApplyOptions; issues?: readonly ImportIssue[]; rowsIn?: number;
  fileName?: string; sheetName?: string; importedAt?: string; mappingConfirmed?: { by: string; at: string };
  certification?: { by: string; at: string; note?: string; controlTotals?: Omit<ControlTotal, 'actual'>[] } }
export type SampleSeed = { [K in DatasetKey]?: SampleSeedEntry<K> }
export type SampleSeedLoader = () => SampleSeed | Promise<SampleSeed>
export function buildSampleState(base: Datasets, seed: SampleSeed | null, asOf: ISODate): SampleState
```

### 2.11 sample

```ts
// prng.ts (verbatim core)
const SEED = 20_260_930
function hash(s: string): number {           // FNV-1a
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  return h >>> 0
}
export class Rng {
  private state: number
  constructor(seed: number) { this.state = seed | 0 }
  /** Uniform in [0, 1). mulberry32. */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0
    let t = this.state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
  float(lo, hi); int(lo, hi) /*inclusive*/; chance(p); pick(xs); weighted(items, weights);
  pickPair(pairs); normal(mean = 0, sd = 1) /*Box-Muller*/; lognormal(median, sigma); shuffle(xs) /*in place*/; sample(xs, k)
}
export const rngFor = (stream: string): Rng => new Rng((SEED ^ hash(stream)) | 0)

// index.ts
export const SAMPLE_AS_OF: ISODate = '2026-09-30'
export const SAMPLE_COMPANY = 'Northgate Semiconductor'
export function generateSample(): Datasets
export function cachedSample(): Datasets

// raw/extract.ts, raw/format.ts
export interface RawExtract<K extends DatasetKey = DatasetKey> { dataset: K; fileName: string; sheetName: string; aoa: Cell[][] }
export function pickRows<R>(rows: readonly R[], k: number, rng: Rng, test?: (row: R, index: number) => boolean): Set<number>
export type Cell = string | number | boolean | null
export interface Column<R> { header: string; cell: (row: R, index: number) => Cell }
export function toAoa<R>(rows: readonly R[], columns: readonly Column<R>[]): Cell[][]
export const mmddyyyy, mdy, ddmmyyyy, dMonY, stamp, yn, levelCode /* L4 → IC4 */, siteLabel /* "San Jose, CA", "Bangalore, India" */
// raw/plan.ts
export type StartTier = 'gold' | 'silver' | 'bronze' | 'none'
export const SAMPLE_TIERS: Record<DatasetKey, StartTier>
export const RAW_DATASETS = [ ... ] as const
export const FILES: Record<RawDataset, { fileName: string; sheetName: string }>
export const IMPORTED_AT: Record<RawDataset, string>          // 2026-09-30 mornings
export const CONFIRMED: Partial<Record<DatasetKey, { by: string; at: string }>>
export const CERTIFIED: Partial<Record<DatasetKey, StarterCertification>>
// raw/seed.ts, starter.ts, load.ts
export function importExtract<K extends DatasetKey>(extract: RawExtract<K>, roster: readonly Employee[], candidates?: readonly Candidate[]): ImportedExtract<K>
export function sameRows(a: readonly object[], b: readonly object[]): boolean
export function buildMessySample(base?: Datasets): MessySample
export async function completeMessySample(starter: StarterSample, base?: Datasets): Promise<SampleSeed>
export const PLANTED: { [K in RawDataset]: (base: Datasets) => Datasets[K] }
export function starterSample(base?: Datasets): StarterSample
export function messySampleLoader(): Promise<SampleSeed>
// main.tsx: const messySample = import('./data/sample/raw/load').then((m) => m.messySampleLoader()).catch(() => ({})); setSampleSeed(() => messySample)
```

---

## 3. Patterns and conventions

Wiring
- `schema.ts` is the single source of truth: vocabularies, record interfaces, `DATASETS` field defs. Importer, templates, exports, quality and lists all iterate `DATASETS`/`DATASET_KEYS`; nothing hard-codes columns.
- Exhaustive tables are the compile-time checklist for a new dataset: `Record<DatasetKey, ...>` in `detect.ts SHEET_ALIASES`, `defaults.ts DOCUMENTED_DEFAULTS`, `raw/plan.ts SAMPLE_TIERS`, the object literal returned by `scopeDatasets`, `quality/test-fixtures.ts emptyDatasets`, `import/test-fixtures.ts FIXTURE: Datasets`. `fillDefaults` and `coerceValue` are exhaustive `switch`es (no default case) over `DatasetKey`/`FieldType`.
- Cross-field rules are keyed by `` `${dataset}.${field}` `` strings: `MONTH_FIELDS` (normalize.ts), `ENUM_NORMALIZERS` (vocab.ts), `canonicalText` switch (canonical.ts), `PERSON_FIELDS`/`PERSON_REF_FIELDS` (apply.ts), list `refs` (lists/defs.ts), `APPLICABILITY` (quality/applicability.ts).
- Pure modules never import the store (settings.ts, lists/*, quality/*, scope.ts). Stores are thin Zustand wrappers that persist.
- Every untrusted input goes through a sanitizer that falls back field by field: `normalizeFilters`, `sanitizeSettings`, `sanitizeViews`, `isVersion`, `isReferenceState`, `isProfile`, `isRaw`.
- Every storage access is wrapped in try/catch; IndexedDB reads at start-up race a 1,500 ms timeout and the app runs on the sample with `storageUnavailable: true` if it loses.
- Pay: `FieldDef.pay` hides a column from exports and templates (`exportDatasetWorkbook` filters `!f.pay` unless `includePay`); `showPay` is session-only memory, never persisted ("Earlier versions remembered the pay switch... it is now per session only": `LS.remove('showPay')`). Group totals use chart-column flag `cost: true` with `ctx.showCost` (Finance always, else showPay). Ratios are never pay.
- Sample: deterministic, regenerated on every load, never stored. Every generator module draws from its own named stream (`rngFor('budget')`, `rngFor('raw-requisitions')`); a later module never draws from an earlier stream, so adding data never moves a calibrated story. New datasets are appended last in `generateSample()` (Budget: "last, from its own stream, on the finished roster and pay, so no other number moves").
- Messy sample: clean rows → `PLANTED[k]` (the rows the import will yield) and `EXTRACTS[k]` (foreign headers, odd spellings, planted gaps as an AOA) built from the same `pickRows(rngFor('raw-<k>'))` picks; the app opens on the starter state (cheap), then imports the extracts in idle tasks and `applySampleSeed` adds raw sheets, mappings, logs without changing rows (`sameRows`).
- Versions: a fixed `sample-<k>` / `sample-<k>-raw` ID so confirmations and certifications of the sample survive reloads (`mergeStoredSample`). Uploads get `newVersionId(key)`. History keeps 3.
- Dates are ISO strings compared as strings; arithmetic in `@/lib/dates`; the generator uses integer Days (`calendar.ts`) and converts on emit.
- Copy: sentence case, plain-English one-sentence issues ("Budget cost -5 is below zero, so it was left blank."), no em dashes.

Invariants and the tests that enforce them
- Determinism: `sample.test.ts` "two runs are deep-equal" (`JSON.stringify(generateSample()) === JSON.stringify(data)`); `raw.test.ts` "is deterministic".
- Speed: `sample.perf.test.ts` `bestCostMs(generateSample) < 600`; quality `compute.perf.test.ts`. Perf files run in the vitest `perf` project, one file at a time.
- Round trip: `templates.test.ts` builds a template from `FIXTURE` and from the whole sample, reads it back with SheetJS, re-detects, re-maps and re-imports every dataset with zero issues and identical rows (`complete()` fills absent optional fields with null).
- Detection: `budget.test.ts` asserts a planning-tool sheet is detected as `budget` and the hiring plan extract still as `hiringPlan`; `detect.test.ts` ignores template help sheets.
- Privacy: `protected.test.ts` (protected/proxy/comment headers dropped before the sheet object exists); `sample.test.ts` Compliance "no nationality or citizenship anywhere".
- Messy sample: `raw.test.ts` "imports every row of every extract, with the planted issues and nothing else", "auto-maps every foreign header to the field it holds", "changes only the planted values", "starter state has exactly the rows the import of each raw extract yields", tiers equal `SAMPLE_TIERS`; `stories.test.ts` every view's finding IDs equal on clean vs messy.
- Store: `store.test.ts` mocks `idb-keyval` (`get/set/del/keys`) with a Map and stubs `localStorage`; checks history of 3, raw-sheet deletion, reload restore, clear device (`census:*` only), "says when something could not be cleared".
- Lists: `lists/sample.test.ts` official lists leave every tier unchanged and find nothing off the org lists.

---

## 4. Tests to port (what each asserts, how it adapts)

| Census test | Asserts | HCP adaptation |
|---|---|---|
| `src/data/import/apply.test.ts` | required skips, column-missing stops, documented defaults logged, day-first dates, dedupe keeps most recent, manager linking, comp hourly/percent/FX defaults, roster ID repair | Rewrite fixtures for `workers` (manager linking by `managerId`, leading-zero repair), `comp` (effective-dated rows: dedupe on `employeeId+effectiveDate`), `reqs` (pay fields, unknown status skips), `requests` (steps parsing). Drop cases/candidates/reviews blocks. |
| `import/automap.test.ts` | tricky headers ("Manager name" ≠ name), strongest-first assignment, value-shape doubts, Workday/Greenhouse exports, learned synonyms, `withChoice` | Keep the engine tests verbatim (dataset-agnostic) but swap to HCP defs: "Position #" vs "Position ID", "Supervisory position" → `managerPositionId`, Workday position export, Greenhouse job export (`reqs`), Anaplan/Adaptive targets. |
| `import/budget.test.ts` | detection, planning-tool header map, months as first day, "US$", negatives blanked, documented defaults, `budgetCost` is pay money | Template for `targets.test.ts` and `assumptions.test.ts`: `targetHeads < 0` blanked, `targetCost` money with pay/cost flag, FX rows keyed by currency read "€"/"US$". |
| `import/detect.test.ts` | Greenhouse/Workday sheets recognized; name breaks ties; unrelated sheets low; help sheets ignored | Positions vs workers must not be confused (both have position ID, level, location): add a test that a Workday "Position Management" export → `positions` and an HRIS "Worker roster" → `workers`. |
| `import/e2e.test.ts` | messy HRIS CSV (day-first, "Last, First" managers, title-style levels) imports to exactly the clean roster | Same for `workers`, with level text "IC4"/"Senior"/"Director" → HCP level codes. |
| `import/newDatasets.test.ts` | hiring plan months/defaults/merge, onboarding "Day -3", RTW categories, survey scales | Model for `freezes` (blank end date = open-ended, `allowBackfill` blank = false logged) and `requests` (state/type enum normalizers). |
| `import/parse.test.ts`, `normalize.test.ts`, `profiles.test.ts`, `protected.test.ts` | header detection, CSV text kept raw, dates/numbers/booleans/levels/enums, profiles in IDB, protected drops | Port nearly verbatim; levels block rewritten for the HCP ladder; profiles test mocks the HCP `kv` module instead of `idb-keyval` defaults; protected adds "Health", "Medical" to free-text warnings only if wanted. |
| `import/templates.test.ts` | template round trip of FIXTURE and whole sample; layout; pay columns blank | Port verbatim; it is the strongest guard that every `f(...)` def, coercer and synonym agree. Must include `requests.steps` round trip. |
| `quality/core.test.ts`, `versions.test.ts`, `compute.test.ts` | tier order, FieldRef validation, rules (refs, dates, dups, freshness, control totals), versions/certification, sample seed | Port; LINKS becomes multi-link; freshness per HCP dataset; control metrics `filledPositions`, `activeHeadcount`, `totalBaseUsd`. |
| `scope.test.ts`, `scopeExclude.test.ts`, `urlScope.test.ts`, `linkChecks.test.ts` | windows, subtree, include/exclude recount per dataset, URL round trip | Add fiscal presets (fiscal YTD/QTD/month/full year, Apr start), new dims (costCenter, legalEntity, country, currency, version), position-tree leader scope. Recount test per HCP dataset. |
| `settings.test.ts`, `savedViews.test.ts`, `context.test.ts`, `store.test.ts` | sanitize, file round trip, refuse foreign files, example views, context keys, store persistence | Rename kinds (`hcp-settings`), keys (`hcp:`), examples (Silicon Engineering FY27; Bengaluru). Store test mocks the `kv` wrapper. Add tab-lock tests (see C3). |
| `lists/lists.test.ts`, `lists/sample.test.ts` | status rules, proposed lists, sample lists official and clean | Port with HCP ListIds incl. `legalEntity`, `currency`, `reasonCode`, leader overrides. |
| `sample/sample.test.ts` | determinism, sizes, referential integrity, vocab, timelines, every planted story with tolerances | New HCP file: sizes (1,650 positions: 1,450/100/60/15/25), every positionId unique and never reused, every assignment's position exists, Filled ⇔ active assignment except the planted exceptions, the 8 stories with exact numbers. |
| `sample/sample.perf.test.ts` | generator < 600 ms | Same budget. |
| `sample/raw/raw.test.ts`, `load.test.ts`, `stories.test.ts` | messy sample deterministic, planted issues only, headers auto-map, starter = import, stories survive | Port the structure; story check runs HCP engines' findings on clean vs messy. |

---

## 5. HCP adaptation

### 5.1 Northgate Semiconductor, exact shape (from Census, to reuse)

- Company: fictional Nasdaq-listed fabless chip company, founded 3 Mar 2014 (`FOUNDED`), as-of **30 Sep 2026** (`SAMPLE_AS_OF`). CEO `E10001`.
- Six business units (active employees at 30 Sep 2026; 12 months earlier in brackets) and their 22 departments with dept codes (`DeptSpec.costCenter`):
  - **Silicon Engineering** 556 [488], code 1100: Architecture 46 (1110), Digital Design 128 (1120), Design Verification 150 (1130), Physical Design 112 (1140), Analog & Mixed-Signal 70 (1150), DFT 50 (1160)
  - **Systems & Software** 337 [318], 1200: Firmware 90 (1210), Software 122 (1220), Systems Validation 70 (1230), Hardware Engineering 55 (1240)
  - **Operations** 170 [163], 1300: Test & Product Engineering 92 (1310), Supply Chain 44 (1320), Quality & Reliability 34 (1330)
  - **Go-to-Market** 184 [175], 1400: Sales 86 (1410), Field Applications 64 (1420), Product Marketing 34 (1430)
  - **Corporate** 196 [196], 1500: Finance 50 (1510), People 46 (1520), Legal 20 (1530), IT 50 (1540), Facilities 30 (1550)
  - **Executive Office** 7 [7], 1000: Executive Office 7 (1010)
  - Total 1,450 active employees (+83 active contractors, 25 interns, 497 leavers, 25 pre-hires starting Oct 2026).
- Cost centers: `costCenter(dept, site) = \`${deptSpec(dept).costCenter}-${SITE_CODE[site]}\`` e.g. `1130-BLR`. SITE_CODE: San Jose SJC, Austin AUS, Raleigh RDU, Boulder BLD, Seattle SEA, Toronto YYZ, Vancouver YVR, Munich MUC, Haifa HFA, Bengaluru BLR, Hsinchu HSZ, Shanghai SHA, Ho Chi Minh City SGN. Every employee row (leavers too) carries the cost center of its current dept+site. The **92** are the cost centers with an employee active on at least one month end 31 Mar to 30 Sep 2026 (`budget.ts centersOf`, `inYear`); the department site lists alone give 89, executives seated off-list sites and contingent workers add the rest. HCP should derive the list from its generated positions and assert 92 in `sample.test.ts`.
- Department site weights (from `DEPTS`): Architecture SJ55/Haifa25/Austin10/Munich10; Digital Design SJ33/Austin17/BLR27/Haifa13/Munich10; Design Verification SJ22/BLR45/Austin8/Hsinchu8/HCMC10/Raleigh7; Physical Design Austin30/SJ20/BLR30/Hsinchu10/Shanghai10; AMS SJ37/Boulder37/Munich16/Hsinchu10; DFT BLR45/SJ28/Austin15/Hsinchu12; Firmware BLR33/SJ22/Raleigh18/Toronto17/Haifa10; Software SJ23/Seattle24/Toronto12/Vancouver16/BLR25; Systems Validation SJ33/Hsinchu20/Shanghai20/BLR17/HCMC10; Hardware Eng SJ42/Boulder22/Raleigh22/Hsinchu14; Test & Product Eng Hsinchu25/Shanghai25/SJ22/HCMC16/Austin12; Supply Chain SJ45/Hsinchu25/Shanghai30; Q&R Hsinchu32/SJ40/Shanghai28; Sales SJ28/Shanghai20/Munich14/Hsinchu8/Austin10/Seattle6/BLR12; Field Apps SJ25/Shanghai20/Hsinchu15/Munich15/BLR15/Haifa10; Product Marketing SJ80/Austin20; Finance SJ70/BLR20/Hsinchu10; People SJ55/BLR20/Austin15/Hsinchu10; Legal SJ100; IT SJ40/BLR40/Raleigh20; Facilities SJ40/BLR20/Austin20/Hsinchu20; Executive Office SJ100.
- Sites (13; active employees): San Jose 491, Bengaluru 319, Hsinchu 146, Austin 117, Shanghai 91, Munich 48, Raleigh 47, Boulder 40, Haifa 39, Seattle 38, Ho Chi Minh City 33, Toronto 27, Vancouver 14. Countries (8): United States (us-ca, us-tx, us-nc, us-co, us-wa), Canada, Germany, Israel, India, Taiwan, China, Vietnam. Regions: Americas, EMEA (Munich, Haifa), APAC.
- Currencies (8) and Census FX (`comp.ts FX_TO_USD`, USD per 1 local): USD 1, CAD 0.73, EUR 1.09, ILS 0.27, INR 0.012, TWD 0.031, CNY 0.14, VND 0.000039. Rounding units for bands: USD/CAD/EUR/ILS/CNY 1,000; INR/TWD 10,000; VND 1,000,000.
- Legal entities: **none in Census** (grep finds no `legalEntity`). Proposal for HCP, one per country: Northgate Semiconductor Inc. (US), Northgate Semiconductor Canada Ltd. (CA), Northgate Semiconductor GmbH (DE), Northgate Semiconductor Israel Ltd. (IL), Northgate Semiconductor India Pvt. Ltd. (IN), Northgate Semiconductor Taiwan Co., Ltd. (TW), Northgate Semiconductor (Shanghai) Co., Ltd. (CN), Northgate Semiconductor Vietnam Co., Ltd. (VN). Add to `Site` as `legalEntity`.
- Levels (Census): L1 Entry, L2 Developing, L3 Career, L4 Senior, L5 Staff, L6 Principal, M1 Manager, M2 Director, E1 Vice president, E2 Senior VP, E3 Executive. Active counts: L1 65, L2 191, L3 314, L4 293, L5 219, L6 105, M1 200, M2 43, E1 12, E2 4, E3 4. Hierarchy: CEO (E3) → COO, CRO, CFO (E3) and SVP Silicon Engineering, SVP Systems & Software, Chief People Officer, General Counsel (E2) → 12 VPs (E1) → directors (M2) → managers (M1) → ICs. There is no P-ladder and no M3-M5 (see C1).
- Band midpoints (`comp.ts`): San Jose USD `MID_USD` L1 105k, L2 130k, L3 165k, L4 195k, L5 235k, L6 280k, M1 225k, M2 285k, E1 350k, E2 420k, E3 520k; local mid = round(MID_USD × ZONE[site] ÷ fx, unit). ZONE: San Jose 1, Seattle 0.97, Boulder 0.9, Austin 0.9, Raleigh 0.88, Toronto 0.72, Vancouver 0.72, Munich 0.68, Haifa 0.70, Bengaluru 0.26, Hsinchu 0.42, Shanghai 0.38, HCMC 0.20. Min 80% / max 120% of mid. Target bonus L1 10% … L4 15% … E3 60%. Equity USD by level × BU factor × site factor.
- Fiscal year: April to March, implicit only (`budget.ts BUDGET_MONTHS '2026-04'…'2027-03'`, `BUDGET_BASE_DATE = '2026-03-31'`, `hiringPlan.ts PLAN_YEAR = { from: '2026-04-01', to: '2027-03-31' }`). No fiscal calendar helper; `scope.ts 'ytd'` is calendar (see C5).
- HRBPs per BU: SE Michael Thomas, SS Amanda Sullivan, OPS Ya-Wen Chang, GTM Thu Trang Vo, CORP Sara Karimi, EO Bhavana Joshi. IDs: employees `E10001…` (hire order), reqs `REQ-4001…`, cost centers `<dept>-<site>`.
- Census stories HCP reuses: FY27 budget (approved March) GTM 184 vs 176 (8 over heads, 4.9% over cost); SE 556 vs 566 (10 under, open seats 1130-BLR 5, 1140-BLR 3, 1160-BLR 2) and over on cost; company 1,450 vs 1,452. FY27 v2 hiring plan reforecast approved July (= HCP "Q1 Reforecast locked July"). 114 Open reqs, 15 On hold reqs (= HCP's 15 On hold), 59 accepted offers starting after 30 Sep (44 Oct, 12 Nov, 3 Dec; 25 already pre-hires in HRIS). 20 people on leave now. 20 part-timers (Munich 8, Haifa 5, Toronto 4, San Jose 3) at 0.5/0.6/0.8 FTE.

### 5.2 How mulberry32 seeding works (to copy into `headcount-planner/src/data/sample/prng.ts`)
Copy `prng.ts` byte for byte except the seed constant if you want a fresh company (keep `20_260_930` to make "the same streams" draws reproducible against Census's logic; the spec says "generated fresh", so either is fine, but pick once and freeze it). `rngFor(name)` = `new Rng((SEED ^ fnv1a(name)) | 0)`. Rules: one stream per module (`'org'`, `'positions'`, `'workers'`, `'comp'`, `'reqs'`, `'requests'`, `'targets'`, `'freezes'`, `'assumptions'`, `'story-<n>'`, `'raw-<dataset>'`); never share a stream between modules; append new modules last.

### 5.3 How raw files are made deliberately messy (pattern to copy)
For each raw dataset: (1) `xxxMess(rows)` picks exact row sets with `pickRows(rows, k, rngFor('raw-xxx'), eligible)`; (2) `xxxPlanted(base)` returns the clean rows with only the planted cells changed (what the import must yield); (3) `xxxExtract(base)` writes `toAoa(rows, columns)` with vendor headers ("Job Req ID", "Business Group", "Primary Location"), vendor value spellings (`STATUS: 'Closed - Filled'`, `'1 - Critical'`, `levelCode` IC4, `siteLabel` "Bangalore, India", `mdy` dates, "Apr 2026" months, "US$"), title rows above headers, and the planted problems (blank hiring manager on 3%, unknown "Conversion" req type, old department names "DV", legacy grade "G7"). `raw.test.ts` checks extract import == planted rows, and that only planted cells differ.

### 5.4 Proposed HCP data files (`headcount-planner/src/data/`)

| File | Job | Change vs Census |
|---|---|---|
| `schema.ts` | vocab + 8 record types + 8 `DatasetDef`s | rewrite (sections 5.5) |
| `kv.ts` (new) | `export const kv = createStore('headcount-planner', 'kv')` and `kvGet/kvSet/kvDel/kvKeys/kvDelMany` bound to it; `KEY = { dataset:(k)=>\`hcp:dataset:${k}\`, versions:…, raw:…, reference:'hcp:reference', profile:…, plan:…, audit:… }` | Census calls idb-keyval's default store; HCP uses its own DB, and tests mock this module |
| `store.ts` | `useHcp` (Zustand) | rename `useCensus`→`useHcp`, `CensusState`→`HcpState`, `LS` prefix `hcp:`, `HOME_VIEW` per mode, add `readOnly` from tabSync, `ROUTE_VIEWS` HCP views |
| `tabSync.ts` | channel `'headcount-planner'`, `postToTabs`, `listenToTabs` + writer lock | add lock (C3) |
| `fiscal.ts` (new) | `FY_START_MONTH = 4`, `fiscalYearOf(d) // 'FY27'`, `fyRange('FY27') → {from:'2026-04-01', to:'2027-03-31'}`, `fiscalMonths`, `fiscalQuarterOf`, QTD/YTD windows | new |
| `scope.ts` | Filters + matchers + position org index | add dims `costCenter`, `legalEntity`, `country`, `currency`; `version` and fiscal `period` presets ('month','qtd','ytd','fy','custom'); `buildPositionIndex(positions)` by `managerPositionId`; `isActiveOn(assignment, d)` inclusive of last day |
| `urlScope.ts`, `savedViews.ts`, `viewsStore.ts`, `settings.ts`, `address.ts`, `context.tsx` | as Census | rename keys/kinds (`hcp:settings`, `hcp-settings`, `hcp:views`), `DIM_PARAM` new dims, `AnalyticsContext` + `plan` (versions, plan of record, comparison picker) |
| `import/*` | same 20 files | defs-driven; replace synonyms/aliases/defaults/normalizers/test fixtures; add `requests.steps` coercer; prototype-safe row objects |
| `lists/*` | official lists | ListIds: businessUnit, department, costCenter, location, region, legalEntity, currency, level (with `leader` attr override for `leaderLevel`), jobFamily, reasonCode, workerType |
| `quality/*` | tiers, versions, rules | `LINKS` as `Link[]` per dataset; HCP freshness/date sequences/control metrics |
| `workspace/` (new, M3) | `.hcplan.json` read/write, checksum, diff, merge by requestId | modeled on `settings.ts` file functions |
| `plan/` (new, M3) | `PlanStore` interface + `BrowserStore` over `kv` (`load`, `save`, `lockVersion`, `appendAudit`, `listAudit`) | new |
| `sample/` | `prng.ts`, `calendar.ts`, `names.ts`, `departments.ts`, `org.ts`, `positions.ts`, `workers.ts`, `comp.ts`, `reqs.ts`, `requests.ts`, `targets.ts`, `freezes.ts`, `assumptions.ts`, `versions.ts` (Budget/Q1 RF/Working/FY28 lines), `personas.ts`, `index.ts`, `README.md`, `sample.test.ts`, `sample.perf.test.ts`, `raw/{plan,extract,format,gold,seed,starter,load,index}.ts` + `raw/extracts/{positions,reqs,targets,freezes,requests,assumptions}.ts` | copy prng/calendar/names/departments/org verbatim-ish; everything else new |

Renames: every `census`/`Census` identifier and string in `src/` (C9): `useCensus`, `CensusState`, `clearCensusStorage`, `'census'` channel, `census:` keys, `census-settings` file kind, `census-settings-<date>.json`, `{ census: id }` history mark, `census:context`/`census:quality` timing names, "Census never imports …" copy, `wb.creator = 'Census'`, `'census'` sheet alias in `detect.ts`.

### 5.5 The eight HCP datasets as Census-style `DatasetDef`s

Vocabularies (schema.ts):
```ts
export const APP_NAME = 'Headcount Planner'
export const APP_SLUG = 'headcount-planner'
export const LEVELS = ['P1','P2','P3','P4','P5','P6','M1','M2','E1','E2','E3'] as const   // see C1
export const LEVEL_LABELS: Record<Level, string> = { P1:'P1 Entry', P2:'P2 Developing', P3:'P3 Career', P4:'P4 Senior',
  P5:'P5 Staff', P6:'P6 Principal', M1:'M1 Manager', M2:'M2 Director', E1:'E1 Vice president', E2:'E2 Senior VP', E3:'E3 Executive' }
export const LEADER_MIN_LEVEL: Level = 'M2'   // "Director+"
export const POSITION_STATUSES = ['Filled','Open','Planned','On hold','Eliminated'] as const
export const WORKER_TYPES = ['Employee','Contractor','Intern'] as const              // heads: Employee 1, others 0
export const REQ_STATUSES = ['Open','On hold','Filled','Cancelled'] as const
export const REQ_STAGES = ['Req opened','Interviewing','Offer accepted','Started'] as const
export const REQ_TYPES = ['New','Backfill'] as const
export const REQUEST_TYPES = ['New role','Backfill','Level change','Location change','Transfer','Elimination','Trade'] as const  // 'Trade': user's extra requirement
export const REQUEST_STATES = ['Draft','Submitted','In review','Sent back','Approved','Approved with changes','Rejected','Withdrawn','Expired'] as const
export const REASON_CODES = ['Growth','New capability','Attrition backfill','Restructure','Cost reduction','Promotion','Relocation','Rebalance','Freeze exception','Other'] as const
export const FX_SETS = ['plan','actual','forecast'] as const
export const ASSUMPTION_TABLES = ['band','bonusTarget','bonusFunding','equity','burden','burdenCap','benefits','severance',
  'merit','promotionPool','fx','timeToFill','fillRate','attrition','backfillRate','backfillLag','vacancyFactor','glAccount','tradeRatio'] as const
export interface Site { location: string; country: string; jurisdiction: string; region: Region; currency: string; legalEntity: string; zone: string }
```

1) **positions** (effective-dated; one row per position per change)
```ts
{
  key: 'positions', label: 'Positions', sheet: 'Positions',
  description: 'Every seat in the plan, one row per position and effective date. Filled, Open, Planned, On hold or Eliminated; eliminated seats are kept.',
  usedBy: ['home','plan','requests','forecast','targets','finance'],
  rowKey: ['positionId', 'effectiveDate'],
  fields: [
    f('positionId','Position ID','id',['position id','position','position number','position #','pos id','seat id'],'Stable seat identifier, never reused.',{ required: true }),
    f('effectiveDate','Effective date','date',['effective date','effective','as of date','change date'],'Date this row takes effect; the latest row on or before a date describes the seat.',{ required: true }),
    f('status','Status','enum',['status','position status','seat status'],'Filled, Open, Planned, On hold or Eliminated. Filled is checked against assignments.',{ required: true, values: POSITION_STATUSES }),
    f('title','Title','string',['title','position title','job title','business title'],'Position title.',{ recommended: true }),
    f('jobFamily','Job family','string',['job family','family','job family group'],'Broad group of jobs.'),
    f('level','Level','level',['level','grade','job level','band'],'Level of the seat.',{ required: true }),
    f('businessUnit','Business unit','string',['business unit','bu','business group','division'],'Top-level org.',{ required: true }),
    f('department','Department','string',['department','dept','supervisory organization'],'Department.',{ recommended: true }),
    f('costCenter','Cost center','string',['cost center','cost centre','cc'],'Cost center code, such as 1130-BLR.',{ required: true }),
    f('location','Location','string',['location','site','work location'],'Work site.',{ required: true }),
    f('legalEntity','Legal entity','string',['legal entity','company','employing entity','entity'],'Employing legal entity; blank reads from the location.'),
    f('managerPositionId','Manager position ID','id',['manager position id','reports to position','supervisor position','parent position'],'Position this seat reports to.',{ recommended: true }),
    f('workerType','Worker type','enum',['worker type','employee type','position type'],'Employee, Contractor or Intern seat. Only Employee seats count as heads.',{ values: WORKER_TYPES }),
    f('fte','FTE','number',['fte','scheduled fte','position fte'],'Share of a full-time schedule; blank is 1.'),
    f('startDate','Target start','date',['target start','planned start','start date','need by'],'For Open and Planned seats: when the person should start.'),
    f('reqType','Origin','enum',['req type','new or backfill','origin'],'New or Backfill.',{ values: REQ_TYPES }),
    f('leaderLevel','Leader seat','boolean',['leader','leader level','is leader'],'Blank: a leader seat when the level is Director (M2) or above. Lists can override.'),
  ],
}
```
Pay flags: none. Tier start: gold (Finance + HRIS certified position file) or silver raw (planning tool "Position #" export). Dates in order: none per row; quality rule "positionId never reused after Eliminated" goes in `rules.ts`.

2) **workers** (HRIS; one row per assignment = person in a position)
```ts
{
  key: 'workers', label: 'Workers', sheet: 'Workers',
  description: 'HRIS workers and their assignments: one row per person per position, start to last day.',
  usedBy: ['home','plan','forecast','finance'],
  rowKey: ['employeeId', 'positionId', 'assignmentStart'],
  fields: [
    f('employeeId','Employee ID','id',['employee id','worker id','emp id','person id','employee number'],'Unique worker identifier.',{ required: true }),
    f('name','Name','string',['name','full name','worker','employee name'],'Display name.',{ recommended: true }),
    f('positionId','Position ID','id',['position id','position','position number'],'Seat held; blank means not in the plan.',{ recommended: true }),
    f('assignmentStart','Assignment start','date',['assignment start','position start','start date in position','effective date'],'First day in the position; blank is the hire date.'),
    f('assignmentEnd','Assignment end','date',['assignment end','position end','end date in position'],'Last day in the position (inclusive).'),
    f('hireDate','Hire date','date',['hire date','start date','original hire date'],'First day of employment.',{ required: true }),
    f('terminationDate','Last day','date',['termination date','last day','exit date','end date'],'Last day of employment, inclusive; known future exits count here.'),
    f('workerType','Worker type','enum',['worker type','employment type','employee type'],'Employee, Contractor or Intern.',{ required: true, values: WORKER_TYPES }),
    f('fte','FTE','number',['fte','full time equivalent','work percentage'],'Blank is 1; above 1.5 read as percent.'),
    f('level','Level','level',['level','grade','job level'],'HRIS level.'),
    f('businessUnit','Business unit','string',['business unit','bu','division'],'HRIS business unit.'),
    f('department','Department','string',['department','dept'],'HRIS department.'),
    f('costCenter','Cost center','string',['cost center','cost centre','cc'],'HRIS cost center; a mismatch with the position is a reconciliation exception.',{ recommended: true }),
    f('location','Location','string',['location','site','work location'],'Work site.',{ recommended: true }),
    f('legalEntity','Legal entity','string',['legal entity','company','employing entity'],'Employing entity.'),
    f('managerId','Manager ID','id',['manager id','reports to','supervisor id'],'Direct manager (HRIS).'),
    f('onLeave','On leave','boolean',['on leave','leave status','loa'],'On a leave of absence on the extract date.',{ pay: true, leave: true }),
    f('leavePaid','Leave paid','boolean',['leave paid','paid leave','loa paid'],'Blank or Yes: still costed while on leave.',{ pay: true, leave: true }),
  ],
}
```
Add `leave?: boolean` to `FieldDef` (mirrors `immigration?`). Freshness: events `hireDate`, `terminationDate`, `assignmentStart` 120 d. Date sequences: `[['hireDate','assignmentStart','assignmentEnd'], ['hireDate','terminationDate']]`. LINKS: `positionId → positions.positionId`, `managerId → workers.employeeId`.

3) **comp** (effective-dated; FTE-equivalent base)
```ts
{
  key: 'comp', label: 'Compensation', sheet: 'Compensation',
  description: 'Pay rows by employee and effective date. Base is the full-time rate; cost multiplies it by FTE.',
  usedBy: ['finance','forecast'],
  rowKey: ['employeeId', 'effectiveDate'],
  fields: [
    f('employeeId','Employee ID','id',['employee id','worker id','emp id'],'Paid worker.',{ required: true }),
    f('effectiveDate','Effective date','date',['effective date','pay effective date','last increase date','change date'],'Date this pay took effect. The merit rule reads the latest row.',{ required: true }),
    f('currency','Currency','string',['currency','pay currency','local currency'],'ISO code; blank takes the location currency.'),
    f('baseSalary','Base salary (FTE rate)','money',['base salary','annual base','fte salary','annual rate'],'Full-time-equivalent annual base in local currency.',{ required: true, pay: true }),
    f('targetBonusPct','Target bonus %','percent',['target bonus','bonus target','sti target'],'Overrides the level default when set.'),
  ],
}
```
No `fxToUsd`: FX comes from assumptions (`fx` table) by set and month. Snapshot freshness 45 d like Census. Tier gold, certified by Total rewards with `totalBaseUsd` control total (at plan FX).

4) **reqs** (ATS)
```ts
{
  key: 'reqs', label: 'Requisitions', sheet: 'Requisitions',
  description: 'ATS requisitions linked to positions, with stage, offer and one-time hiring costs.',
  usedBy: ['home','plan','requests','forecast','finance'],
  rowKey: ['reqId'],
  fields: [
    f('reqId','Req ID','id',['req id','requisition id','job req id','job id'],'Requisition identifier.',{ required: true }),
    f('positionId','Position ID','id',['position id','position','position number'],'Seat the req fills.',{ recommended: true }),
    f('status','Status','enum',['status','req status','requisition state'],'Open, On hold, Filled or Cancelled.',{ required: true, values: REQ_STATUSES }),
    f('stage','Stage','enum',['stage','req stage','pipeline stage'],'Req opened, Interviewing, Offer accepted or Started.',{ values: REQ_STAGES }),
    f('reqType','Req type','enum',['req type','reason for hire','new or backfill'],'New or Backfill.',{ values: REQ_TYPES }),
    f('openedDate','Opened date','date',['opened date','date opened','approval date'],'Date approved and opened.',{ required: true }),
    f('targetStartDate','Target start','date',['target start','target start date'],'Wanted first day.'),
    f('offerAcceptedDate','Offer accepted','date',['offer accepted date','filled date','date filled'],'Date only; no candidate detail.'),
    f('startDate','Start date','date',['start date','expected start'],'Agreed first day of an accepted offer.'),
    f('closedDate','Closed date','date',['closed date','date closed','cancelled date'],'Closed or cancelled.'),
    f('hiringManagerId','Hiring manager ID','id',['hiring manager id','hm id'],'Hiring manager.'),
    f('recruiter','Recruiter','string',['recruiter','recruiter name'],'Owning recruiter.'),
    f('offerBase','Offer base','money',['offer base','offered salary','offer amount','base offer'],'Accepted offer base, full-time rate.',{ pay: true }),
    f('offerCurrency','Offer currency','string',['offer currency','currency'],'ISO code of the offer.'),
    f('signOnBonus','Sign-on bonus','money',['sign on','sign-on bonus','signing bonus'],'One-time, books in the start month.',{ pay: true }),
    f('relocation','Relocation','money',['relocation','relo','relocation cost'],'One-time.',{ pay: true }),
    f('agencyFee','Agency fee','money',['agency fee','search fee','recruiting fee'],'One-time.',{ pay: true }),
  ],
}
```
Date sequences: `[['openedDate','offerAcceptedDate','startDate'], ['openedDate','closedDate']]`. Freshness 90 d. Raw messy extract (silver): Census's `requisitionsExtract` style ("Job Req ID", "Closed - Filled", M/D/YYYY, "IC4", "Bangalore, India", "US$"/"NT$").

5) **requests**
```ts
{
  key: 'requests', label: 'Requests', sheet: 'Requests',
  description: 'Headcount requests and their approval steps. Import merges by request ID.',
  usedBy: ['home','requests','targets'],
  rowKey: ['requestId'],
  fields: [
    f('requestId','Request ID','id',['request id','request','ticket'],'Request identifier.',{ required: true }),
    f('type','Type','enum',['type','request type'],'New role, Backfill, Level change, Location change, Transfer, Elimination or Trade.',{ required: true, values: REQUEST_TYPES }),
    f('state','State','enum',['state','status'],'Draft to Approved, Rejected, Withdrawn or Expired.',{ required: true, values: REQUEST_STATES }),
    f('reasonCode','Reason','enum',['reason code','reason'],'Why the request is made.',{ required: true, values: REASON_CODES }),
    f('requesterId','Requester ID','id',['requester id','requested by','requester'],'Employee ID of the requester.',{ required: true }),
    f('submittedById','Submitted by','id',['submitted by','on behalf of'],'When an HRBP submits on behalf.'),
    f('submittedAt','Submitted at','datetime',['submitted at','submitted','date submitted'],'When it was submitted.'),
    f('updatedAt','Updated at','datetime',['updated at','last updated','modified'],'Latest change; wins on merge.'),
    f('positionId','Position ID','id',['position id','position'],'Seat changed, backfilled or eliminated; blank for a new role.'),
    f('businessUnit','Business unit','string',['business unit','bu'],'Org of the request.',{ required: true }),
    f('department','Department','string',['department','dept'],'Department.'),
    f('costCenter','Cost center','string',['cost center','cc'],'Cost center.'),
    f('level','Level','level',['level','grade'],'Requested level.'),
    f('location','Location','string',['location','site'],'Requested site.'),
    f('jobTitle','Title','string',['title','job title'],'Requested title.'),
    f('fte','FTE','number',['fte'],'Blank is 1.'),
    f('startDate','Proposed start','date',['proposed start','start date','target start'],'Proposed start or effective date.'),
    f('priority','Rank','number',['priority','rank'],'Rank among the requester\'s asks in the cycle (1 is first).'),
    f('cycleId','Cycle','string',['cycle','planning cycle','cycle id'],'Planning cycle, e.g. FY28 plan.'),
    f('steps','Steps','steps',['steps','approval steps','approvals'],'Approval chain: role, approver, decision and date per step.'),
    f('confidential','Confidential','boolean',['confidential','restricted'],'Shown only to the chain, the HRBP and HR admin (eliminations).'),
    f('exception','Freeze exception','boolean',['exception','freeze exception'],'Submitted against a freeze; adds an approver.'),
    // Trade (user requirement): heads given up and received, with the ratio frozen at submission
    f('tradeOutLevel','Trade out level','level',['trade out level','give level'],'Level given up.'),
    f('tradeOutLocation','Trade out location','string',['trade out location','give location'],'Site given up.'),
    f('tradeOutHeads','Heads given','number',['heads given','trade out heads'],'Heads given up.'),
    f('tradeInLevel','Trade in level','level',['trade in level','get level'],'Level received.'),
    f('tradeInLocation','Trade in location','string',['trade in location','get location'],'Site received.'),
    f('tradeInHeads','Heads received','number',['heads received','trade in heads'],'Heads received.'),
    f('tradeRatio','Trade ratio','number',['trade ratio','ratio'],'Average-head weight out ÷ weight in, at submission.'),
  ],
}
```
`steps` needs a new FieldType (`'steps'`) and `coerceSteps` in `normalize.ts` (special ref like `MONTH_FIELDS`), written back by the template as compact text (`Manager E10234 Approved 2026-08-03; HRBP E10077 Pending`) so the round-trip test holds. Free text (justification, comments) is not a dataset field: `protected.ts` drops any "comment" header anyway, and audit comments live in PlanStore.

6) **targets**
```ts
{
  key: 'targets', label: 'Targets', sheet: 'Targets',
  description: "Finance's year-end heads and loaded cost per org.",
  usedBy: ['home','targets','finance'],
  rowKey: ['fiscalYear','businessUnit','department','costCenter','leaderPositionId'],
  fields: [
    f('fiscalYear','Fiscal year','string',['fiscal year','fy','plan year'],'e.g. FY28.',{ required: true }),
    f('targetDate','Target date','date',['target date','as of','year end'],'Blank is the fiscal year end (31 Mar).'),
    f('businessUnit','Business unit','string',['business unit','bu','level 1'],'Org of the target.',{ required: true }),
    f('department','Department','string',['department','dept','level 2'],'Blank targets the whole unit.'),
    f('costCenter','Cost center','string',['cost center','cc'],'Blank targets a whole department or unit.'),
    f('leaderPositionId','Leader position ID','id',['leader position','sub org','leader'],'A leader tree instead of an org unit.'),
    f('targetHeads','Target heads','number',['target heads','target headcount','hc target','ending headcount'],'Employee heads at the target date.',{ required: true }),
    f('targetCost','Target cost (USD)','money',['target cost','cost target','personnel cost target'],'Loaded cost for the fiscal year in USD.',{ recommended: true, pay: true, cost: true }),
  ],
}
```
Add `cost?: boolean` to FieldDef for group totals (Finance sees, others need showPay/guard). Freshness: none (plan data). Negative heads/cost blanked like `fillBudget`.

7) **freezes**
```ts
{
  key: 'freezes', label: 'Hiring freezes', sheet: 'Freezes',
  description: 'Hiring freezes by org and date. Accepted offers are honored.',
  usedBy: ['home','requests','plan','forecast','finance'],
  rowKey: ['freezeId'],
  fields: [
    f('freezeId','Freeze ID','id',['freeze id','freeze'],'Identifier.',{ required: true }),
    f('businessUnit','Business unit','string',['business unit','bu'],'Frozen org.',{ required: true }),
    f('department','Department','string',['department','dept'],'Blank freezes the whole unit.'),
    f('costCenter','Cost center','string',['cost center','cc'],'Blank freezes the whole department or unit.'),
    f('leaderPositionId','Leader position ID','id',['leader position','sub org'],'Freeze a leader tree.'),
    f('startDate','From','date',['start date','from','effective date'],'First frozen day.',{ required: true }),
    f('endDate','To','date',['end date','to','until'],'Last frozen day; blank is open-ended.'),
    f('allowBackfill','Backfills allowed','boolean',['allow backfill','backfills allowed','backfill exception'],'Blank is No.'),
    f('reason','Reason','string',['reason','why'],'Short reason shown on New request.'),
  ],
}
```
Date sequence `[['startDate','endDate']]`.

8) **assumptions** (long form)
```ts
{
  key: 'assumptions', label: 'Assumptions', sheet: 'Assumptions',
  description: 'Planning assumptions by table and key, falling back from org to unit to company.',
  usedBy: ['plan','forecast','targets','finance'],
  rowKey: ['version','table','org','key'],
  fields: [
    f('version','Version','string',['version','scenario','plan version'],'Version the value belongs to, e.g. FY27 Budget.',{ required: true }),
    f('table','Table','enum',['table','assumption','assumption table','driver'],'Which assumption: band, fx, attrition ...',{ required: true, values: ASSUMPTION_TABLES }),
    f('org','Org','string',['org','business unit','department','scope'],'Blank is the company; a unit or department overrides it.'),
    f('key','Key','string',['key','dimension','for'],'Pipe-joined dimensions per table, e.g. P4|Munich|FY27 or EUR|plan|2026-09.',{ required: true }),
    f('value','Value','number',['value','amount','rate','percent'],'Number in the table\'s unit (local currency, USD, fraction or days).',{ required: true }),
  ],
}
```
`ASSUMPTION_KEYS: Record<AssumptionTable, readonly string[]>` declares each table's key dimensions and unit, e.g. `band: ['level','zone','fiscalYear']` (local money, pay-like), `fx: ['currency','set','month']` (USD per 1 local), `burden: ['component','country']` + `burdenCap`, `merit: ['part']` with parts date/pct/cutoff (date stored as `YYYYMMDD` number or move `value` to `'string'` + per-table parse), `tradeRatio: ['fromLevel','fromZone','toLevel','toZone']`. Validation of key shape belongs in `fillDefaults('assumptions')` with logged issues. Mark `band` values `pay: true` only if the policy treats midpoints as pay (Census marks `rangeMid` pay because it is per person; bands by level×zone are not per person: decide in PLAN.md).

Optional vs core: `OPTIONAL_DATASETS = ['reqs','requests','targets','freezes']`; core = positions, workers, comp, assumptions.

Sample starting tiers (`SAMPLE_TIERS`): positions gold (Finance and HRIS), workers gold (HRIS; certified headcount 1,450), comp gold (Total rewards; base reconciles), assumptions gold (Finance), reqs silver (raw ATS export), targets silver (raw planning tool), freezes silver, requests bronze (raw "Import requests" file from 6 manager files: "Merged 14 requests from 6 files, 2 conflicts").

Sample counts to plant (spec): ~1,650 positions = 1,450 Filled (Census's 1,450 active employees, one seat each; contractors/interns hold no Employee seats) + 100 Open (Census open reqs 114 Open minus the offers that are already pre-hires, or rescale) + 60 Planned (no req; Census: 9 SE Q4 roles with no req plus Q1 count rows) + 15 On hold (Census's 15 On hold reqs) + 25 Eliminated. Stories map: 1 ← Census budget GTM; 2 ← Census SE Bengaluru seats + 6 Hsinchu `offerBase` > Hsinchu midpoint; 3 ← 4 SS backfill requests whose `positionId` was first effective within 30 days of a worker's `terminationDate`; 4 ← freeze `startDate 2026-08-01` with 3 reqs `stage: 'Interviewing'`; 5 ← fx plan EUR 1.08/ILS 0.27 vs forecast 1.15/0.29; 6 ← FY28 targets; 7 ← 6 workers with blank `positionId` + 3 `costCenter` mismatches; 8 ← a cost center with 3 costed people.

### 5.6 Trade method (user's extra requirement), data-layer part
- "Average head" (AH) for a scope and fiscal year = mean band-estimated loaded annual cost per head over the scope's Working plan positions (band midpoint × FTE + standard bonus/burden/benefits loads, USD at plan FX). It never reads HRIS pay or offers, so the cost guard does not apply to the ratio; it is still an average over the plan's seats, so require 5+ seats or fall back to the unit then company AH (same fallback chain as assumptions).
- Head weight `w(level, zone, FY) = bandLoaded(level, zone, FY) / AH`. A trade of `n` heads out at (L_out, loc_out) buys `m = floor(n × w_out / w_in)` heads in at (L_in, loc_in); show the remainder in average heads (and in USD only where cost may show). `tradeRatio` assumption rows override a pair; trades between regions use each location's zone.
- Stored on the request (`type: 'Trade'`, `tradeOut*`, `tradeIn*`, `tradeRatio` frozen at submission). Approval adds Planned positions for heads in and moves heads-out seats to Eliminated (or On hold until approved). Targets stay in heads and cost; the Targets view can add an "average-head equivalents" column, which a trade leaves unchanged.
- Engine (not data layer) file: `headcount-planner/src/engines/trade.ts` with fixtures; `requests` def above already carries the fields.

---

## 6. Gotchas and spec conflicts

Spec conflicts (with suggested resolution)
- **C1 Levels.** Census has `L1-L6, M1-M2, E1-E3` (no P codes, no M3-M5, Director = M2, VP = E1). The spec's worked example says "a Planned P4" and "Director+". Resolution: HCP `LEVELS = P1..P6, M1, M2, E1, E2, E3`; `normalizeLevel` keeps Census's regex (it already reads `p4`, `ic4`, `l4`, `t4` as the 4th IC level; just emit `P${n}`); `levelTrack` tests `startsWith('P')`; `LEADER_MIN_LEVEL = 'M2'`. Raw extracts write "IC4" (ATS) and "L4" (legacy HRIS) to keep normalization tested.
- **C2 `createStore('headcount-planner','kv')`.** That is idb-keyval's custom-store API (`createStore(dbName, storeName)`); Census never uses it (it calls `get/set/del/keys` on the default `keyval-store`/`keyval` DB with `census:` key prefixes). Resolution: one `kv.ts` module exporting the store and bound helpers (`get(key, kv)` etc.), keep `hcp:` prefixes inside it too (cheap and lets "clear device" be prefix-based), and mock `@/data/kv` in tests (Census's `vi.mock('idb-keyval', ...)` only mocks the default functions, so a straight copy would silently hit real `createStore`). Never open the `headcount-planner` DB with a second store name: idb-keyval creates the object store only on first DB creation. "Clear device" can `indexedDB.deleteDatabase('headcount-planner')` plus remove `hcp:*` from local/session storage.
- **C3 "Writes lock through tabSync; a second tab is read-only."** Census's tabSync has no lock and no read-only mode; it only re-syncs after writes. Resolution: add to `tabSync.ts` `acquireWriter(): Promise<'writer' | 'reader'>` using Web Locks (`navigator.locks.request('hcp:writer', { ifAvailable: true }, cb)` holding a never-settling promise; a reader queues a blocking `request` to take over when the writer tab closes) with a BroadcastChannel `'headcount-planner'` heartbeat fallback when `navigator.locks` is missing; expose `readOnly` in the store; every `PlanStore` write and `replaceDataset` asserts writer. Inject the lock API so vitest (node env) can test both paths. Verify on the downloaded single file (`file://`): Chrome treats file: as a secure context, but check `navigator.locks` and `crypto.subtle` there.
- **C4 Legal entities** don't exist in Census. Add `legalEntity` to `Site` (one per country, list in 5.1), to positions/workers, and a `legalEntity` official list.
- **C5 Fiscal year.** Census only implies April-March in budget/hiring-plan constants; `scope.ts` `ytd` is calendar YTD and `lastQuarter` uses calendar quarters (`quarterStart`). Resolution: new `fiscal.ts` and fiscal period presets; don't reuse `periodWindows` for Finance.
- **C6 Last day inclusive.** Census `isActiveAt` treats `terminationDate` as not active (`terminationDate > d`), although the field is described as "Last day of employment". The spec says "exits through the last day" and the double-count example ("ends 15 Oct"). Resolution: HCP `isActiveOn(a, d) = a.start <= d && (!a.end || a.end >= d)`; write a fixture (a person whose last day is 30 Sep is 1 head at 30 Sep) so nobody copies Census's rule.
- **C7 FX and bands vs the worked example.** Census comp uses EUR 1.09 per row and Munich L4 mid = round(195,000 × 0.68 ÷ fx, 1,000) ≈ €122,000-123,000, target bonus L4 15%. The spec example needs P4 Munich midpoint €110,000, bonus 10%, burden 21% capped at €90,600, plan rate 1.08 (forecast 1.15; ILS 0.27/0.29). Resolution: HCP bands are authored assumption rows; set Munich zone ≈ 0.61 (195,000 × 0.61 ÷ 1.08 = 110,139 → €110,000) or hard-set the FY27 EUR band row, set P4 target bonus 10% (or a EUR/DE override row), and drop `fxToUsd` from comp rows.
- **C8 Spec lists `droppedColumns` and "tiers" as part of the dataset shape.** In Census neither is on `DatasetDef`: `droppedColumns` runs once per sheet in `import/sheet.ts toSheet` (header-based, dataset-agnostic) and tiers live in `quality/` (computed) and `sample/raw/plan.ts SAMPLE_TIERS` (starting tiers). Keep Census's placement.
- **C9 "A test fails if 'census' appears in src/ code."** Copying leaves many hits: `useCensus`, `clearCensusStorage`, `'census'` BroadcastChannel, `{ census: id }` history marks, timing names `census:context`, file kind `census-settings`, `wb.creator = 'Census'`, user copy "Census never imports …", and `detect.ts SHEET_ALIASES.employees` contains `'census'` (an HR word for a roster). Decide case-insensitivity up front; if case-insensitive, also comments. Drop or rename the `'census'` alias (or allow-list that one string with a comment in the test).
- **C10 Leave.** Census derives leave from `transactions` (Leave start/Return from leave with `leaveReason`); there is no `onLeave` flag. HCP's `workers.onLeave/leavePaid` are a snapshot. Spec says make them `pay: true`; better add a `leave?: boolean` FieldDef flag (like `immigration`) so Manager/Finance never see them even with showPay, and HRBP/Leader see counts only at 5+.
- **C11 Comp is a snapshot in Census** (`rowKey: ['employeeId']`, one row per active employee, `lastIncreaseDate`). The merit rule ("unless the latest comp row is on or after that date") needs effective-dated rows: HCP `rowKey ['employeeId','effectiveDate']`; Census's dedupe keeps the row with the latest date only when the whole row key repeats, so multiple dated rows survive.
- **C12 No Budget dataset in HCP.** Census's `budget` (cost center × month) is a dataset; HCP's FY27 Budget is a locked version (plan lines in PlanStore). Reuse Census `budget.ts` logic (straight line from 31 Mar heads to the September target) only to generate the Budget version's lines.
- **C13 Manager band cost vs "no amounts".** The spec says Manager sees no amounts but Manager budget status uses "band cost (midpoint × FTE)". Flag for PLAN.md: show status words and heads; never the band amount in Manager mode.

Census quirks to carry or avoid
- `LINKS` allows one `Link` per dataset (`Partial<Record<DatasetKey, Link>>`); HCP workers need two (positionId, managerId) and requests three. Make it `Link[]`.
- `toSheet` builds row objects with `obj[h] = ...` from file headers; a header `__proto__` with a Date cell would replace the prototype. Use `Object.create(null)` rows (or reject `__proto__`/`constructor`/`prototype` headers) in HCP; same for workspace-file parsing (never `Object.assign` parsed JSON; copy known keys only).
- `protected.ts` drops any header containing the word "comment(s)", "verbatim", "free text": a "Comments" column on a requests import disappears before mapping (good for privacy; tell users in the Data room note).
- `REFERENCE_FX_TO_USD` (EUR 1.1) differs from sample comp FX (EUR 1.09) and from HCP plan FX (1.08); never let the importer's reference rate leak into HCP cost; FX must come from the assumptions table.
- `contextAsOf` returns `SAMPLE_AS_OF` only while every dataset is the sample; one upload switches to "latest date in the data capped at today" (`resolveAsOf` reads employees/candidates/cases/transactions/reqs; HCP must rewrite it for its datasets).
- Store init races IDB with a 1,500 ms timeout; keep it (a second tab or a stuck upgrade otherwise hangs the loading screen).
- `exportSettings` contains `VIEWS_KEY.replace(/^census:/, '')` (prefix-coupled code; rename together with the LS prefix).
- The generated sample is never stored; only uploads are. Keep that (it is why "clear device" is cheap and why `sample-<k>` version IDs are fixed).
- Messy sample loads in two steps (starter state awaited by `init`, real import in `requestIdleCallback` tasks, then `applySampleSeed`); `load.test.ts` proves rows and decisions don't change when the background import lands.
- Perf: generator budget 600 ms (Census ~0.25 s in Node); quality compute has its own perf test; perf tests run serially in the `perf` vitest project.
- Windows/tooling: run Vite as `node --max-semi-space-size=64 node_modules/vite/bin/vite.js` (package.json scripts); xlsx is a CDN tarball dependency (`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`), so `npm ci` needs network to cdn.sheetjs.com; Excel round-trip tests take seconds (`testTimeout: 30_000`).
- Census's `scopeDatasets` leader filter works on the employee manager tree (`buildOrgIndex(all.employees)`); HCP's trees must come from positions (`managerPositionId`) so plan lines follow a moved position and vacant seats belong to a tree.
- Lists' sample detection keys on `sources[k].kind === 'sample'`; an HCP list that reads positions and workers is "the sample's" only while both are the sample.
