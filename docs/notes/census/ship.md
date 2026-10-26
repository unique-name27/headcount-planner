# Census digest: Help, export, security copy, deploy ("ship" area)

Source app: the Census repository (read only). Target: `headcount-planner/` (HCP).
All paths below are relative to the Census root unless they start with `headcount-planner/`.
Line refs are to the files as read on 2026-10-09.

---

## 1. Inventory (every file read, one line each)

### Help (`src/help/`)
| File | Lines | Job |
|---|---|---|
| `src/help/types.ts` | 149 | Data shapes: `HelpGroup`, `HELP_GROUPS`, `Condition`, `Block`, `Without`, `HelpArticle`, `Placement`, `StepWording`, `TourStep`, `Tour`. Documents the `[label](kind:target)` link markup. |
| `src/help/articles/index.ts` | 35 | `ARTICLES` (concat of 6 group files in sheet order), `articleById`, `articlesIn`, `articleForRoute(view, tab)` (tab-specific article first). |
| `src/help/articles/when.ts` | 78 | Named `Condition`s shared by articles and tours (`HR`, `ROLE_HOME`, `MANAGER`, `DEVELOPER`, `FINANCE`, `PAY_SWITCH`, `PAY_TOTALS`, `NO_PAY`, `DATA_ROOM`, `NO_DATA_ROOM`, `SCOPED`, ...). Each is phrased as surfaces a mode shows, not as a mode name. |
| `src/help/articles/start.ts` | 905 | Start here: `what-census-is`, `moving-around`, `reading-a-number`, `clicking-down`, `exporting`, `ask-census`, `modes` (read `exporting` 500-591 and `modes` 777-905 in full). |
| `src/help/articles/privacy.ts` | 319 | Privacy and trust: `privacy-browser` (read 1-60), `privacy-pay`, `privacy-small-groups`, `privacy-er`, `privacy-surveys`, `privacy-immigration`, `privacy-sample`. |
| `src/help/articles/support.ts` | 384 | Help and support: `shortcuts`, `report-problem`, `troubleshooting`, `faq`, `whats-new` (generated), `developer-tools`, `security-center` (read 225-384 in full; the banned-words-exempt article). |
| `src/help/articles/{views,data,definitions}.ts` | 1507/401/124 | Per-view articles `view-<key>`, Data room articles, `definitions-how` + generated `glossary` (ids listed only). |
| `src/help/tours.ts` | 1518 | Tours as data. `tourTarget`, `figureTarget`, `at(view, tab)`, `role(slug)` condition helper (l.1080), `HERO_STEP`, `GETTING_STARTED`, `HOME_START` (l.1231), `HOME`, `TOURS` (l.1484), `tourById`, `tourForRoute`, `targetName`. |
| `src/help/tour/place.ts` | 115 | Pure popover placement (`Box`, `Size`, `PlacedSide`, `Placed`, `PlaceOptions`, `placePopover`): preferred side, first fitting side, corner, docked on narrow screens. |
| `src/help/access.ts` | 186 | Help per mode: `articleShown`, `tourShown`, `homeTourOf`, `holds(access, condition)`, `stepShown`, `stepWording`, `tourInMode`, `blocksInMode`, `articleInMode`, `linkShown`, `articlesInMode`, `glossaryInMode`. |
| `src/help/access.test.ts` | 720 | Help in every mode: decisions for every article/tour, ROLES-V2 4.8 table, >=3 steps kept per tour, links to hidden targets read as text, **no shown article or tour step names a page/tab/control the mode hides** (`NAMES` table), banned words in new copy, home tour/welcome per mode, Report a problem names the mode never a person. |
| `src/help/content.test.ts` | 405 | Content checked like code: unique ids, every HELP.md article exists, one article + one 4-6 step tour per view, every link resolves, every tour target exists as `data-tour="..."` in .tsx, sentence case (`PROPER` list), no em dash / "!" / nagging verbs, link labels not raw ids, glossary sorted, `APP_VERSION === package.json version`. |
| `src/help/markup.ts` | 67 | `LinkKind`, `HelpLink`, `parseInline`, `plainText`, `blockTexts`, `linksIn`, `articleLinks`, `articleText`. |
| `src/help/links.ts` | 89 | `LinkWorld`, `parseRouteTarget`, `checkLink` (pure, used by tests), `linkHref`, `followLink`. Imports `isDevRouteTab` from `@/dev/tabs`. |
| `src/help/search.ts` | 165 | Pure prefix-word search: `words`, `buildIndex(articles, glossary)`, `search(index, text, opts)`, `RESULT_LIMIT = 8`, weights title 10 / keywords 6 / summary 4 / body 1, phrase-in-title bonus. |
| `src/help/glossary.ts` | 58 | `GlossaryEntry`, `PAGE_LABEL: Record<MetricView,string>`, `buildGlossary(defs)` (one per metric id, sorted by term; `privacy.*` ids -> "Privacy rule"). |
| `src/help/learnMore.ts` | 45 | `articleForMetric(metricId)` via `BY_PREFIX` (first id segment -> `view-<key>`) and `BY_ID` overrides; `LEARN_MORE_ARTICLES`. |
| `src/help/whatsNew.ts` | 84 | `APP_VERSION = '0.1.0'`, `ReleaseNote`, `RELEASE_NOTES` newest first. |
| `src/help/welcome.ts` | 51 | `welcomeFor(variant, pageMode, liveMode)`, `welcomeCopy(variant, mode)`: "New to Census?" / "New to My team?" / "New to <Mode> mode?" and the tour each starts. |
| `src/help/store.ts` | 227 | zustand `useHelp` (sheet open/article/query/notice, running tour, prefs), `HELP_STORAGE_KEY = 'census:help'`, `parsePrefs`, `withDismissed`, `welcomeDismissed`, `withTourDone`, `withCompleted`, `openHelp/closeHelp/startTour`. Tour restores route + filters with `history: 'replace'`. |
| `src/help/diagnostics.ts` | 98 | "Report a problem" text: `DiagnosticInput`, `safeAddress(hash)` (strips record ids and `?scope`), `diagnosticText` ("Census problem report", never names/ids/file names/values). |
| `src/help/diagnosticInput.ts` | 136 | Builds `DiagnosticInput` from `AnalyticsContext` + `CensusState` pick (`DiagnosticState`, `DiagnosticEnv`, `pageLabels`, `modeLine`). |
| `src/help/ui/*.tsx` (skim) | ~1400 | `HelpButton` (mounts sheet + tour layer, `?` key), `HelpSheet` (search, Take the tour, What's on this page, Keyboard shortcuts, Report a problem, What's new, tours, articles by group), `ArticleView`, `TourLayer` (ring + popover, `SEEK_MS = 2500` then centered card, arrows/Esc, focus trap, navigates with `history: 'replace'`), `WelcomeCard`, `AboutViewLink`, `LearnMore`, `IconHelp`, `refs.ts` (`helpTrigger`), `useDiagnostic`. |
| `docs/HELP.md` | 62 | The help spec: one Help button, About this view, Learn more, first-visit welcome, tour list, article table by group, quality bar. |

### Export (`src/lib/export/`)
| File | Lines | Job |
|---|---|---|
| `index.ts` | 75 | The barrel (must only ever be `import()`ed by app code). |
| `types.ts` | 30 | `ExportTable`, `ExportOptions`. |
| `view.ts` | 829 | Whole-view workbook (Summary + sheet per figure + chart image) and 16:9 deck (title slide, divider per tab, slide per figure, withheld body, table fallback 14 rows). `payFact`, `slideFootnote`, `entrySheetName`, `exportMeta`, `captureFigureImages`. |
| `xlsx.ts` | 301 | ExcelJS: `loadExcel()` (memoized dynamic import), `XL` colors, `sanitizeSheetName`, `uniqueSheetNames`, `excelValue`, `columnWidth`, `addTableSheet` (title block, header, frozen panes, autofilter, footer), `newWorkbook`, `buildWorkbook`, `saveWorkbook`, `downloadXlsx`. |
| `csv.ts` | 84 | RFC 4180 CSV with BOM, `guardFormula`, `csvField`, `toCsv`, `csvPreamble`, `downloadCsv`. |
| `columns.ts` | 237 | `MoneyShown`/`MoneyArg`/`MoneyOpts`, `moneyShown`, `moneyOpts`, `readMoney`, `moneyDropped`, `moneyLeftOut`, `visibleColumns`, formats, `EXPORT_DIGITS`, `exportNumber`, `plainText`. |
| `definitions.ts` | 45 | "Definitions changed from defaults: n" stamp via a registered source (`setDefinitionsSource`). |
| `withheld.ts` | 56 | Data-standard withholding: `WITHHELD_COLUMNS`, `withheldRows`, `WithheldReason`, `FigureExport`, `figureExport`, `exportNote`. |
| `modeMeta.ts` | 34 | `modeMeta(access)` -> `{ modeLine?, costLine? }`; `EVERY_RECRUITER_SCOPE`. |
| `names.ts` | 157 | `asOfIso`, `asOfLabel`, `slug`, `fileStem` (`census-<view>-<name>-<as-of>`), `withoutDataContext`, `hasDataContext`, `metaLine`, `modeLines`, `stampLine`, `viewLine`, `imageFooter`, `standardLine`, `dataLine`. |
| `download.ts` | 25 | `downloadBlob` (object URL + anchor, revoke after 30 s, works over file://), `MIME`. |
| `image.ts` | 355 (skim) | SVG clone with computed styles inlined, Archivo embedded, title/legend/footer composed, 2x PNG; `withLightTheme`. |
| `clipboard.ts` | 58 (exports only) | `toTsv`, `writeClipboard`, `copyTable`. |
| `lazy.test.ts` | 35 | The only lazy-loading guard (see 3.6). |
| `view.test.ts` | 315 | Workbook sheet naming, Summary layout, tabs/sections, data standard + tiers, slide footnote. |
| `money.test.ts` | 177 | Pay vs cost columns per output, mode lines on every output, `payFact`, banned words in mode lines. |
| `withheld.test.ts` | 50 | Withheld exports carry only the reason, never the number or the note. |
| `xlsx.test.ts`, `csv.test.ts`, `names.test.ts`, `columns.test.ts`, `definitions.test.ts` | (case lists read) | Sheet-name rules, cell values, round-trip, CSV quoting/BOM/guard, file stems, precision. |
| Related app files read | | `src/charts/types.ts` (`Column` l.39, `RegisteredFigure` l.87, `ExportSection` l.115, `ExportMeta` l.163), `src/app/exportMeta.ts` (`buildExportMeta`, `accessInputOf`), `src/charts/useExportMeta.ts`, `src/app/ExportMenu.tsx` 1-130, `src/components/kpiModel.ts` (`kpiColumns`, `kpiRows`, `SUPPRESSED_NOTE`), `src/lib/costRounding.ts` (`COST_STEP = 100_000`, `UNDER_COST_STEP = 'under $0.1M'`), `src/views/scorecard/ui/monthlyReport.ts`, `src/views/org/ui/exportSlides.ts` (the other pptx users), `src/access/copy.ts` 1-60 and 250-272, `src/access/matrix.test.ts` 735-750, `src/access/policy/kit.ts` 144-240 (help decisions), `src/access/surfaces.ts` 95-130, `src/ask/engine/testkit.ts` (`sampleCtx`, `secretsOf`, `leaks`, `expectClean`). |

### Security copy and deploy (`src/dev/security/`, `scripts/`)
| File | Lines | Job |
|---|---|---|
| `src/dev/security/copy.ts` | 27 | `SECURITY_CENTER`, `SECURITY_BANNER`, **`BANNED_WORDS_EXEMPT`**, preview strings. |
| `src/dev/security/copy.test.ts` | 128 | Banner = doc quote; exemption list pinned to exactly `security-center` + `developer-tools`; every other article/tour sentence that mentions mode/role is free of banned words; policy-file text plain; guard rails one sentence; no em dash/"!" in the center's source. |
| `src/dev/security/helpArticle.test.ts` | 106 | The exempt article exists, routes from its page, Developer-only, cannot be shown by override, names every section and guard rail verbatim. |
| `src/dev/security/redTeam.test.ts` | 154 | Override-hidden = hidden everywhere (tabs, address, figures, Ask enum, exports, help article/tour). Phase 2 for HCP. |
| `src/dev/security/deployPages.test.ts` | 135 | `pagesFiles` list (index.html + census.html + .nojekyll [+ policy] [+ relay]); policy/relay refusal; deploy script uses the list. |
| `src/dev/security/devServer.test.ts` | 67 | `DEV_SERVER_DENY` matched like Vite's picomatch; vite.config uses it. |
| `src/dev/security/address.test.ts` | 55 | `#dev.security:role:<role>` addresses survive reload. Phase 2. |
| `src/dev/security/model.ts`, `inventory.ts`, `boot.ts` | 237/340/68 | Security center editor model, surface inventory + catalog, policy boot (embedded via `import.meta.glob('/public/access-policy.json', { query: '?raw', eager: true })`). Phase 2. |
| `scripts/deploy-pages.mjs` | 54 | `npm run deploy` second half: checks optional files, builds a temp git repo, force-pushes `gh-pages`. |
| `scripts/pagesFiles.mjs` (+ `.d.mts`) | 133 (+25) | Pure publish list + `policyChecksum`, `policyProblem`, `relayProblem`. |
| `scripts/copy-single.mjs` | 13 | `dist-single/index.html` -> `census.html` at repo root. |
| `scripts/verify.mjs` | 26 | tsc, biome, vitest, build, single build; PASS/FAIL table. |
| `scripts/devServer.mjs` (+ `.d.mts`) | 17 | `DEV_SERVER_DENY`. |
| `scripts/build-artifact.mjs` | 39 | Artifact page body from the single build, 16 MB cap. |
| `package.json`, `vite.config.ts`, `tsconfig.json`, `biome.json`, `index.html`, `.gitignore`, `.claude/launch.json`, `Launch Census.bat`, `README.md` (grep), `ARCHITECTURE.md` 349-355, 405-422 | | Stack and build wiring. |
| `docs/SECURITY-CENTER.md` | 123 (skim) | Security center spec (Phase 2 for HCP). |

---

## 2. Contracts (verbatim TypeScript)

### 2.1 Help data shapes — `src/help/types.ts` (copy as is; only `RouteView` source changes)
```ts
import type { RouteView } from '@/data/store'

/** The groups of the Help sheet, in order (docs/HELP.md, Help articles). */
export type HelpGroup = 'start' | 'views' | 'data' | 'definitions' | 'privacy' | 'support'

export const HELP_GROUPS: readonly { key: HelpGroup; label: string }[] = [
  { key: 'start', label: 'Start here' },
  { key: 'views', label: 'Each view' },
  { key: 'data', label: 'Your data' },
  { key: 'definitions', label: 'Definitions' },
  { key: 'privacy', label: 'Privacy and trust' },
  { key: 'support', label: 'Help and support' },
]

export interface Condition {
  surface?: string | readonly string[]
  unless?: string | readonly string[]
  /** Every one hidden in the mode (text for a mode that hides two things at once). */
  hidden?: string | readonly string[]
  /** Whether the mode holds a scope (true) or none (false) ... Read from `access.scope`. */
  scoped?: boolean
}

export type Block = (
  | { p: string }
  | { h: string }
  | { ul: readonly string[] }
  | { ol: readonly string[] }
  | { note: string }
) &
  Condition

export interface Without {
  /** The surface the usual summary mentions ("tab:org.sandbox"). */
  surface?: string
  when?: Condition
  summary: string
}

export interface HelpArticle {
  /** Stable kebab-case id: "view-recruiting", "data-tiers". */
  id: string
  group: HelpGroup
  /** Sentence case, no end punctuation. */
  title: string
  /** One plain sentence shown under the title in lists and search results. */
  summary: string
  body: readonly Block[]
  /** Extra words people may search for that the text does not use. */
  keywords?: readonly string[]
  /** Search words about something a mode can hide: they count only where `surface` is shown. */
  keywordsWhere?: readonly { surface: string; words: readonly string[] }[]
  /** The summary where a mode hides what the usual one names. */
  without?: readonly Without[]
  /** The page the article is about: "About this view" there opens it. */
  route?: { view: RouteView; tab?: string }
  /** Metric dictionary entries the article explains, listed under "Definitions". */
  metrics?: readonly string[]
  /** The tour that walks through what the article describes. */
  tour?: string
  /** Content generated at runtime after the body: the metric glossary or the release notes. */
  generated?: 'glossary' | 'whats-new'
}

export type Placement = 'top' | 'bottom' | 'left' | 'right' | 'auto'

export interface StepWording extends Condition {
  title?: string
  body: string
  target?: string
  placement?: Placement
}

export interface TourStep {
  /** A CSS selector, always `[data-tour="..."]`. Without one the step is a centered card. */
  target?: string
  title: string
  body: string
  placement?: Placement
  /** The view or page the step needs; the tour opens it first. */
  view?: RouteView
  /** The tab within that view ('' is its first tab). */
  tab?: string
  /** The control the step is about, as an access surface ... the tour skips the step in a mode that hides it. */
  surface?: string | readonly string[]
  /** The step shows only where the surfaces named here are not all shown. */
  unless?: string | readonly string[]
  /** Wording for particular modes: the first one whose condition the mode meets replaces title, body, target. */
  wording?: readonly StepWording[]
}

export interface Tour {
  id: string
  title: string
  summary: string
  without?: readonly Without[]
  /** Rough length shown in the list: "2 minutes". */
  length: string
  /** The view or page the tour belongs to; "Tour this page" picks it. */
  route?: RouteView
  steps: readonly TourStep[]
}
```
Link markup inside any text: `[label](kind:target)`, kinds `route` (`route:hrbp.attrition`), `metric`, `article`, `tour`, `settings`.

### 2.2 Help markup and links — `src/help/markup.ts`, `src/help/links.ts`
```ts
export type LinkKind = 'route' | 'metric' | 'article' | 'tour' | 'settings'
export const LINK_KINDS: readonly LinkKind[] = ['route', 'metric', 'article', 'tour', 'settings']
export interface HelpLink { kind: LinkKind; target: string; label: string }
export type Inline = { text: string } | { link: HelpLink }
const LINK = /\[([^\]]+)\]\(([a-z]+):([^)\s]*)\)/g
export function parseInline(text: string): Inline[]
export function plainText(text: string): string
export function blockTexts(b: Block): readonly string[]
export function linksIn(text: string): HelpLink[]
export function articleLinks(a: HelpArticle): HelpLink[]
export function articleText(a: HelpArticle): string

export interface LinkWorld {
  viewTabs: ReadonlyMap<string, readonly string[]>
  isDataTab: (tab: string) => boolean
  hasMetric: (id: string) => boolean
  hasArticle: (id: string) => boolean
  hasTour: (id: string) => boolean
}
export function parseRouteTarget(target: string): { view: string; tab: string }
/** Null when the link resolves; otherwise why it does not. */
export function checkLink(link: HelpLink, world: LinkWorld): string | null
export function linkHref(link: HelpLink): string | undefined
export function followLink(link: HelpLink): void
```
`checkLink` special-cases `data` (Data room tabs), `actions` (only tab `open`), `dev` (`isDevRouteTab`).

### 2.3 Help per mode — `src/help/access.ts`
```ts
type Access = Pick<AccessContext, 'mode' | 'can'> & { scope?: AccessContext['scope'] }
export const articleShown = (access: Access, id: string): boolean => access.can(`help:article:${id}`)
export const tourShown = (access: Access, id: string): boolean => access.can(`help:tour:${id}`)
export function homeTourOf(mode: Mode): string {
  if (mode === 'manager') return 'manager-start'
  return HOME_OF[mode] === 'home' ? 'home-start' : 'getting-started'
}
export function holds(access: Access, c: Condition): boolean {
  if (c.scoped !== undefined && c.scoped !== scopeHeld(access)) return false
  const unless = listOf(c.unless)
  return (
    listOf(c.surface).every((s) => access.can(s)) &&
    !(unless.length && unless.every((s) => access.can(s))) &&
    listOf(c.hidden).every((s) => !access.can(s))
  )
}
export function stepShown(access: Access, step: TourStep): boolean   // route shown, holds(), and figure:<id> shown at that view/tab
export function stepWording(access: Access, step: TourStep): TourStep // first holding wording replaces title/body/target; `wording` dropped
export function tourInMode(access: Access, tour: Tour | null): Tour | null // null when hidden or no step left
export function blocksInMode(access: Access, body: readonly Block[]): Block[] // a failing heading drops its section; adjacent ul/ol merge
export function articleInMode(access: Access, a: HelpArticle): HelpArticle
export function linkShown(access: Access, link: HelpLink): boolean // hidden target -> rendered as plain text
export const articlesInMode = (access: Access, articles: readonly HelpArticle[]): HelpArticle[]
export const glossaryInMode = (access: Access, entries: readonly GlossaryEntry[]): GlossaryEntry[]
```

### 2.4 Help lookups, tours, search, glossary, prefs
```ts
// src/help/articles/index.ts
export const ARTICLES: readonly HelpArticle[] = [...START_ARTICLES, ...VIEW_ARTICLES, ...DATA_ARTICLES, ...DEFINITION_ARTICLES, ...PRIVACY_ARTICLES, ...SUPPORT_ARTICLES]
export const articleById = (id: string | null | undefined): HelpArticle | null
export const articlesIn = (group: HelpGroup): HelpArticle[]
export function articleForRoute(view: RouteView, tab = ''): HelpArticle | null {
  const t = tab.split(/[-:/]/)[0]
  const onPage = ARTICLES.filter((a) => a.route?.view === view)
  return onPage.find((a) => t && a.route?.tab === t) ?? onPage.find((a) => !a.route?.tab) ?? onPage[0] ?? null
}
// src/help/tours.ts
export const tourTarget = (name: string): string => `[data-tour="${name}"]`
export const figureTarget = (id: string): string => tourTarget(`figure-${id}`)
const at = (view: RouteView, tab = '') => ({ view, tab })
const role = (slug: string): Condition => ({ surface: `figure:${HOME_HERO[slug]}`, unless: 'page:dev' }) // l.1080
export const TOURS: readonly Tour[]
export const tourById = (id: string | null | undefined): Tour | null
export const tourForRoute = (view: RouteView): Tour | null => TOURS.find((t) => t.route === view) ?? null
export function targetName(step: TourStep): string | null // `[data-tour="kpi-strip"]` -> "kpi-strip"
// src/help/search.ts
export function words(text: string): string[]
export interface ArticleHit { article: HelpArticle; score: number; snippet: string }
export interface TermHit { entry: GlossaryEntry; score: number }
export interface SearchResults { articles: ArticleHit[]; terms: TermHit[]; totals: { articles: number; terms: number } }
export const RESULT_LIMIT = 8
export function buildIndex(articles: readonly HelpArticle[], glossary: readonly GlossaryEntry[]): SearchIndex
export function search(index: SearchIndex, text: string, opts: { articles?: number; terms?: number } = {}): SearchResults
// src/help/glossary.ts
export interface GlossaryEntry { id: string; term: string; definition: string; formula?: string; where: string; view: MetricView }
export const PAGE_LABEL: Readonly<Record<MetricView, string>>
export function buildGlossary(defs: readonly MetricDef[]): GlossaryEntry[]
// src/help/learnMore.ts
export const LEARN_MORE_ARTICLES: readonly string[]
export function articleForMetric(metricId: string | null | undefined): string | null
// src/help/whatsNew.ts
export const APP_VERSION = '0.1.0'
export interface ReleaseNote { date: string; title: string; items: readonly string[] }
export const RELEASE_NOTES: readonly ReleaseNote[]
// src/help/welcome.ts
export type WelcomeVariant = 'hr' | 'manager' | 'home'
export function welcomeFor(variant: WelcomeVariant, pageMode: Mode | undefined, liveMode: Mode): ReturnType<typeof welcomeCopy>
export function welcomeCopy(variant: WelcomeVariant, mode: Mode | undefined): { line: WelcomeLine; title: string; take: string; tour: string } | null
// src/help/store.ts
export const HELP_STORAGE_KEY = 'census:help'
export interface HelpPrefs { welcomeDismissed: boolean; completed: readonly string[]; managerWelcomeDismissed?: true; homeWelcomeDismissed?: readonly string[] }
export type WelcomeLine = 'hr' | 'manager' | { home: string }
export interface TourRun { id: string; index: number; from: Route; filters: Filters; opener: HTMLElement | null; mode?: string }
export type TourEnd = 'done' | 'skip'
export function parsePrefs(raw: string | null): HelpPrefs
export function withDismissed(p: HelpPrefs, which: WelcomeLine): HelpPrefs
export function welcomeDismissed(p: HelpPrefs, which: WelcomeLine): boolean
export function withTourDone(p: HelpPrefs, id: string, mode?: string): HelpPrefs
export function withCompleted(p: HelpPrefs, id: string): HelpPrefs
export const openHelp / closeHelp / startTour
// src/help/diagnostics.ts
export interface DiagnosticDataset { label: string; source: 'sample' | 'upload'; rows: number; tier: string }
export interface DiagnosticInput { modeLine?: string; viewLabel: string; tabLabel: string | null; address: string; period: { preset: PeriodPreset; label: string }; leaderSet: boolean; orgFilters: { label: string; count: number }[]; peopleInScope: number | null; standard: string; asOf: string; asOfSource: 'sample' | 'data' | 'set by you'; datasets: readonly DiagnosticDataset[]; definitionsChanged: number; mappingChanges: number; switches: { label: string; on: boolean }[]; display: string; storage: string; version: string; browser: string; windowSize: string; at: string }
export function safeAddress(hash: string): string
export function diagnosticText(d: DiagnosticInput): string // first line 'Census problem report'
```

### 2.5 Help decisions in the policy — `src/access/policy/kit.ts` l.144-240
Every article id and tour id must have a decision in every mode (tested). Census builds them with:
```ts
export interface HelpSpec {
  views: Readonly<Record<PolicyPlace, Decision>>
  tabs: Partial<Record<PolicyPlace, readonly RoleTab[]>>
  dataOwner: boolean
  privacy: { pay: boolean; er: boolean; surveys: boolean; immigration: boolean }
  tours?: Readonly<Record<string, Decision>>
}
export function articlesFor(s: HelpSpec): Record<string, Decision> // START_HERE, SUPPORT, PLAIN_PRIVACY always SHOWN; view-<key> follows its view; data articles follow dataOwner; 'security-center' hidden(DEV_ONLY)
export function toursFor(s: HelpSpec): Record<string, Decision>
```
Surfaces: `S.article(id) = 'help:article:<id>'`, `S.tour(id) = 'help:tour:<id>'`, `S.help(part)` for `search|report|shortcuts|whats-new|links|learn-more`.

### 2.6 Export contracts
```ts
// src/charts/types.ts l.39
export interface Column<T = any> {
  key: Extract<keyof T, string> | string
  label: string
  format?: Format | RowFormat<T>
  /** One person's pay amount: hidden from the table and exports unless pay amounts are switched on (`ctx.showPay`). */
  pay?: boolean
  /** A cost total over a group of people (5 or more, under the cost guard): hidden unless cost totals may show (`ctx.showCost`). */
  cost?: boolean
  align?: 'left' | 'right'
  width?: number
  /** 'sheets': tables on screen, Excel, CSV and copy, not slides. 'slides': slide tables only. */
  only?: 'sheets' | 'slides'
  drill?: { bivarianceHack(row: T): DrillSource }['bivarianceHack']
  href?: { bivarianceHack(row: T): string | null }['bivarianceHack']
  sortValue?: { bivarianceHack(row: T): unknown }['bivarianceHack']
}

// src/charts/types.ts l.87
export interface RegisteredFigure {
  id: string
  title: string
  subtitle?: string
  note?: string
  columns: Column[]
  rows: Record<string, unknown>[]
  getSvg: () => SVGSVGElement | null
  order: number
  tier?: Tier | null
  /** The data standard hides the figure: `rows` hold the reason instead of its data, and there is no image. */
  withheld?: boolean
  metric?: string
  section?: ExportSection
}
export interface ExportSection { key: string; label: string; short: string; window?: string }

// src/charts/types.ts l.163  -- THE EXPORT HEADER CONTRACT
export interface ExportMeta {
  /** The view's label, e.g. "People stats". */
  view: string
  /** The view's key ('hrbp'); file names drop it where a figure id repeats it. */
  viewKey?: string
  tab?: string
  scope: string
  window: string
  asOf: string
  isSample: boolean
  company: string
  /** The data standard in force; every sheet, slide and CSV preamble states it. */
  standard?: DataStandard
  /** "Made in Manager mode for Priya Raman's org." Workbook cover and every sheet, deck title slide, CSV preambles and image footers state it. */
  modeLine?: string
  /** Finance mode's pay line, in place of "Pay amounts": stated with the mode line. */
  costLine?: string
}

// src/lib/export/types.ts
export interface ExportTable {
  name: string            // sheet name (sanitized) and file-name seed
  title?: string
  subtitle?: string
  note?: string           // footnote under the title block
  columns: readonly Column[]
  rows: readonly Record<string, unknown>[]
  tier?: Tier | null
  /** The rows are the reason the data standard holds the figure back, not its data. */
  withheld?: boolean
}
export interface ExportOptions {
  showPay: boolean
  /** Cost total columns (`cost: true`) are dropped unless this is on. Follows `showPay` when not given. */
  showCost?: boolean
  fileName?: string
}

// src/lib/export/modeMeta.ts
export const EVERY_RECRUITER_SCOPE = "every recruiter's reqs"
export function modeMeta(access: Pick<AccessContext, 'mode' | 'scope' | 'unset'>): Pick<ExportMeta, 'modeLine' | 'costLine'> {
  const line = modeExportLine(access.mode, scopeOfLine(access))
  return {
    ...(line ? { modeLine: line } : {}),
    ...(access.mode === 'finance' ? { costLine: FINANCE_EXPORT_LINE } : {}),
  }
}
// src/access/copy.ts l.250
export function modeExportLine(mode: Mode, scope?: string | null): string | null {
  if (mode === 'hr' || mode === 'developer') return null
  return scope ? `Made in ${modeName(mode)} for ${scope}.` : `Made in ${modeName(mode)}.`
}
export const FINANCE_EXPORT_LINE =
  'Cost totals cover groups of 5 or more people and are rounded to $0.1M in each business unit. Individual pay is left out.'

// src/app/exportMeta.ts
export function buildExportMeta(args: {
  viewLabel: string; tabLabel?: string; scopeLabel: string; window: Window; asOf: string
  isSample: boolean; sampleCompany: string; standard?: DataStandard
  readsData?: boolean; modeLine?: string; costLine?: string
}): ExportMeta   // company = isSample ? sampleCompany : 'Company data'; readsData false -> withoutDataContext
export function accessInputOf(access: Pick<AccessContext, 'mode' | 'scope'>): AccessInput // off-screen renders in the same mode+scope
// src/charts/useExportMeta.ts
export function useExportMeta(): ExportMeta // { view, viewKey, tab, scope: ctx.scopeLabel, window, asOf, isSample, company, standard, ...modeMeta(ctx.access) }

// src/lib/export/columns.ts
export interface MoneyShown { pay: boolean; cost: boolean }
export type MoneyArg = boolean | MoneyShown
export interface MoneyOpts { showPay: boolean; showCost?: boolean }
export function moneyShown(ctx: MoneyOpts): MoneyShown {
  return { pay: ctx.showPay, cost: (ctx.showCost ?? ctx.showPay) || ctx.showPay }
}
export function moneyOpts(ctx: MoneyOpts): Required<MoneyOpts>
export function readMoney(arg: MoneyArg): MoneyShown
export function moneyDropped(column: Pick<Column, 'pay' | 'cost'>, money: MoneyArg): boolean
export function moneyLeftOut(tables: readonly { columns: readonly Pick<Column, 'pay' | 'cost'>[] }[], money: MoneyArg): boolean
export function visibleColumns<C extends Pick<Column, 'pay' | 'cost' | 'only'>>(columns: readonly C[], money: MoneyArg, output?: 'sheets' | 'slides'): C[]
export const EXPORT_DIGITS: Readonly<Partial<Record<Format, number>>> // int 0, num1 1, num2 3, pct* 4, money 2, moneyFull 2, moneyM 0, default 6
export function exportNumber(v: number, format: Format | undefined): number
export function plainText(v: unknown, spec: Format | FormatSpec | undefined, row?: object): string // null -> '' (never 0); moneyM under COST_STEP -> 'under $0.1M'

// src/lib/export/withheld.ts
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

// src/lib/export/names.ts
export function asOfIso(asOf: string): string | null
export function asOfLabel(asOf: string): string
export function slug(s: string): string
export function fileStem(meta: Pick<ExportMeta, 'view' | 'viewKey' | 'asOf'>, name = ''): string // ['census', view, part, stamp].join('-')
export function withoutDataContext(meta: ExportMeta): ExportMeta
export const hasDataContext = (meta: Pick<ExportMeta, 'scope' | 'window' | 'asOf'>): boolean
export function metaLine(meta): string        // "Whole company · <window> · As of 30 Sep 2026"
export function modeLines(meta): string[]     // [modeLine, costLine].filter(Boolean)
export function stampLine(meta): string       // 'Company confidential' [+ ' · Sample data']
export function viewLine(meta): string        // "Recruiting · Pipeline"
export function imageFooter(meta, tier?): string // ... 'Census' ... 'Sample data'
export function standardLine(standard: DataStandard): string
export function dataLine(standard?: DataStandard, tier?: Tier | null, withheld?: boolean): string | null

// src/lib/export/csv.ts
export function guardFormula(s: string): string // /^[=+\-@\t\r]/ -> "'" prefix (text cells only)
export function csvField(s: string): string
export interface CsvOptions { preamble?: readonly string[]; bom?: boolean }
export function toCsv(table: Pick<ExportTable, 'columns' | 'rows'>, opts: MoneyOpts & CsvOptions): string
export function csvPreamble(table: ExportTable, meta: ExportMeta): string[] // title, subtitle, metaLine, dataLine, definitions, modeLines, stamp
export function downloadCsv(table: ExportTable, meta: ExportMeta, opts: ExportOptions & { preamble?: boolean }): void

// src/lib/export/xlsx.ts
export function loadExcel(): Promise<ExcelModule>
export const XL = { ink: 'FF12151A', ink2: 'FF475060', muted: 'FF616A78', rule: 'FFDDE1E7', ruleStrong: 'FFC3C9D2', link: 'FF1C5CAB' } as const
export function sanitizeSheetName(name: string): string
export function uniqueSheetNames(names: readonly string[]): string[]
export function excelValue(v: unknown, format: Format | undefined): CellValue
export interface SheetLayout { ws: Worksheet; headerRow: number; lastRow: number; columnCount: number }
export function addTableSheet(wb: Workbook, sheetName: string, table: ExportTable, meta: ExportMeta, opts: MoneyOpts): SheetLayout
export async function newWorkbook(meta: ExportMeta, title: string): Promise<Workbook>
export async function buildWorkbook(tables: readonly ExportTable[], meta: ExportMeta, opts: MoneyOpts): Promise<Workbook>
export async function saveWorkbook(wb: Workbook, fileName: string): Promise<void>
export async function downloadXlsx(tables: readonly ExportTable[], meta: ExportMeta, opts: ExportOptions): Promise<void>

// src/lib/export/view.ts
export interface ViewExportOptions { showPay: boolean; showCost?: boolean; fileName?: string; captured?: ReadonlyMap<string, RasterImage> }
export interface FigureGroup { key: string; label: string; figures: readonly RegisteredFigure[] }
export type ViewFigures = readonly RegisteredFigure[] | readonly FigureGroup[]
export interface ViewEntry { figure: RegisteredFigure; group: FigureGroup | null }
export function isFigureGroups(figures: ViewFigures): figures is readonly FigureGroup[]
export function viewEntries(figures: ViewFigures): ViewEntry[]
export function entrySheetName(e: ViewEntry, n?: number): string
export function exportMeta(meta: ExportMeta, entries: readonly ViewEntry[]): ExportMeta
export async function captureFigureImages(figures: readonly RegisteredFigure[]): Promise<Map<string, RasterImage>>
export function payFact(meta: Pick<ExportMeta, 'costLine'>, money: MoneyShown, anyPay: boolean, anyCost: boolean): [string, string][]
export async function buildViewWorkbook(figures: ViewFigures, given: ExportMeta, opts: ViewExportOptions & { images?: boolean }): Promise<Workbook>
export async function exportViewWorkbook(figures: ViewFigures, meta: ExportMeta, opts: ViewExportOptions & { images?: boolean }): Promise<void>
export function slideFootnote(f: Pick<RegisteredFigure, 'tier' | 'withheld' | 'note'>, standard?: DataStandard): string
export async function exportViewDeck(figures: ViewFigures, given: ExportMeta, opts: ViewExportOptions): Promise<void>

// src/lib/export/download.ts
export function downloadBlob(blob: Blob, fileName: string): void
export const MIME = { csv: 'text/csv;charset=utf-8', xlsx: '...spreadsheetml.sheet', pptx: '...presentationml.presentation', svg: 'image/svg+xml;charset=utf-8', png: 'image/png' } as const

// src/lib/export/definitions.ts
export function setDefinitionsSource(read: () => number): void
export function definitionsChanged(): number
export function definitionsLine(n?: number): string | null
export function definitionsLineFor(meta: Pick<ExportMeta, 'scope' | 'window' | 'asOf'>, n?: number): string | null

// src/lib/costRounding.ts
export const COST_STEP = 100_000
export const UNDER_COST_STEP = 'under $0.1M'
export function roundCost(v: number): number
export function sumRounded(rounded: readonly number[]): number
```

### 2.7 Security copy contracts
```ts
// src/access/copy.ts l.10-24
export const NOT_SECURITY_SHORT = 'Modes change what Census shows, not who can see the data.'
export const NOT_SECURITY_LONG =
  'Modes shape Census for how you use it. They are not security: anyone using Census can switch modes, and every mode reads the same data in this browser. Share Census and its files only with people who may see all of it.'
/** Words no copy may use about modes (docs/ROLES.md, 1.6). */
export const BANNED_MODE_WORDS: readonly string[] = [
  'access',
  'permission',
  'restricted',
  'secure',
  'locked down',
  'authorized',
  'role-based access',
]
export const ARTICLE_NOT_SHOWN = 'That article is not shown in this mode.'
export const TOUR_NOT_SHOWN = 'That tour is not shown in this mode.'
export function reportModeLine(mode: Mode, pick: boolean | string | null = false): string

// src/dev/security/copy.ts
export const SECURITY_CENTER = 'Security center'
export const SECURITY_BANNER = "Census runs in the browser with no sign-in. These rules decide what each role sees and can do in Census. Anyone can still switch roles, and data already on a computer can be read with the browser's own tools. Keep sensitive data off computers that should not have it."
/** Where the banned mode words may appear: this page's files and its help article. */
export const BANNED_WORDS_EXEMPT = {
  /** Source folders, relative to src/. */
  folders: ['dev/security/', 'access/overrides/'],
  /** Help article ids. */
  articles: ['security-center'],
} as const
```

### 2.8 Deploy contracts — `scripts/pagesFiles.d.mts`
```ts
export declare const POLICY_SOURCE: 'public/access-policy.json'
export declare const POLICY_TARGET: 'access-policy.json'
export declare const RELAY_SOURCE: 'public/ask-relay.json'
export declare const RELAY_TARGET: 'ask-relay.json'
export declare const POLICY_FORMAT: 'census-access-policy'
export declare const POLICY_VERSION: number
export declare function policyChecksum(file: Record<string, unknown>): string
export interface PagesFile {
  /** The project file, relative to the root; null for an empty file. */
  from: string | null
  /** Where it goes on gh-pages. */
  to: string
}
export declare function pagesFiles(exists: (path: string) => boolean): PagesFile[]
export declare function policyProblem(policyText: string, html: string): string | null
export declare function relayProblem(relayText: string, html: string): string | null
```
`pagesFiles` body (verbatim):
```js
export function pagesFiles(exists) {
  const files = [
    { from: 'census.html', to: 'index.html' },
    { from: 'census.html', to: 'census.html' },
    { from: null, to: '.nojekyll' },
  ]
  if (exists(POLICY_SOURCE)) files.push({ from: POLICY_SOURCE, to: POLICY_TARGET })
  if (exists(RELAY_SOURCE)) files.push({ from: RELAY_SOURCE, to: RELAY_TARGET })
  return files
}
```
`scripts/devServer.d.mts`: `export declare const DEV_SERVER_DENY: string[]`.

### 2.9 Leak scanner worth porting — `src/ask/engine/testkit.ts` l.99-238
```ts
export interface Secrets { names: Set<string>; ids: Set<string>; pay: Set<number>; texts?: readonly string[] }
export function secretsOf(d: Datasets, extra: { names?: readonly string[]; texts?: readonly string[] } = {}): Secrets
export function leaks(text: string, s: Secrets = sampleSecrets()): string[] // names (5-grams, folded, "Last First"), ids, emails, currency-prefixed numbers, any number >= 25,000 that equals a pay value
export function expectClean(text: string, what: string): void
export function sampleCtx(o: { filters?; showPay?; ...; access?: AccessInput } = {}): AnalyticsContext
```
HCP has no Ask in Phase 1, so these must move to a neutral home (proposal: `headcount-planner/src/testkit/{sample.ts,leaks.ts}`).

---

## 3. Patterns and conventions

### 3.1 Help content as data, checked like code
- Articles and tours are TS arrays so they ship inside the one-file build and are searchable offline. No markdown at runtime.
- Article id conventions the tests rely on: one `view-<ViewKey>` per registry view plus `view-actions`; `articleForRoute(view)` must return it (`content.test.ts` l.196-207). Tours: one `view-<key>` per view with 4-6 steps (`content.test.ts` l.265-278).
- Tour targets are only ever `[data-tour="<name>"]`; `figure-<id>` targets resolve to `<Figure id>`, because `Figure` renders ``data-tour={`figure-${id}`}`` (asserted literally in `content.test.ts` l.282). Every other name must appear as the literal string `data-tour="<name>"` in some `.tsx` under `src` (excluding `zz-tmp`, `__gallery__`).
- A step with a `target` but no `view` is allowed only for "everywhere" chrome (`folder-tabs`, `masthead-help`, `masthead-tools`, `masthead-data`, `masthead-settings`, `masthead-actions`, `masthead-ask`; `content.test.ts` l.303-311).
- Mode-dependent text is never written per mode name. It is written against **surfaces** with `Condition` (`surface` = all shown, `unless` = not all shown, `hidden` = all hidden, `scoped`), and shared conditions live in `articles/when.ts`. So a policy override moves text with the page.
- A conditional `h` block drops its whole section; per-item `ul` blocks merge back into one list in a mode (`blocksInMode`). Search uses the mode's version (`articleInMode`), so hidden words are unsearchable (`keywordsWhere`).
- Links to hidden targets render as plain text (`linkShown`).
- Wording rules (tests): sentence-case titles with a `PROPER` allow-list (`content.test.ts` l.68-96); no em dash except the quoted placeholder `"—"` (l.109); no `!`; no nagging verbs `chase|chasing|nag|nagging|ping|hound|unblock`; link labels are words, never ids.
- The glossary is generated from the metric catalog (`generated: 'glossary'`), so it never drifts. Release notes are data with ISO dates, newest first; `APP_VERSION` equals `package.json` version.
- Help state is light (`store.ts` imports no content) so shared components can import it. A tour remembers the route and filters it started from and restores them with `history: 'replace'` (Help never adds history entries).
- `localStorage` access is always try/catch (`loadPrefs`/`savePrefs`) and parsing is defensive (`parsePrefs` dedupes, drops non-strings). Cross-tab sync via the `storage` event.

### 3.2 How an article is excluded from the banned-words scan (the HCP `about-server` need)
Census has two kinds of banned-words checks over help, and they exclude differently:
1. `src/dev/security/copy.test.ts` l.47-74 scans **every** article and tour: it splits title, summary and body into sentences, and flags a sentence that mentions `mode|modes|role|roles` **and** matches `new RegExp('\\b' + w, 'i')` for a banned word (after stripping `access-policy.json`). Exclusion = the article id is in `BANNED_WORDS_EXEMPT.articles` (plus `developer-tools` added in the test). The same test **pins** the exemption list: `expect([...exempt].sort()).toEqual(['developer-tools', 'security-center'])` and `expect(BANNED_WORDS_EXEMPT.folders).toEqual(['dev/security/', 'access/overrides/'])`. Tours are never exempt.
2. `src/help/access.test.ts` l.300-334 scans only named ids (`modes`, `view-home`, `privacy-pay`, tours `home-start`, `view-home`) with a plain lowercase `includes(w)` (substring!). Anything not listed is naturally skipped.
3. `src/access/matrix.test.ts` l.736-749 scans `NOT_SECURITY_SHORT`, `NOT_SECURITY_LONG`, every policy `how` reason and hidden-part labels (substring `includes`).
4. `src/lib/export/money.test.ts` l.108-112 scans every mode's export lines; `src/dev/roles.test.ts` l.103 scans pick prompts.
The exempt article is also tested on its own (`helpArticle.test.ts`): it exists, has the expected title and route, is the one listed in the exemption, and contains the specific phrases it must contain.

### 3.3 Export wiring
- Every figure registers `{ id, title, subtitle, note, columns, rows, getSvg, tier, withheld, section }` with the view's figure registry. "Export" (`src/app/ExportMenu.tsx`) builds `ExportMeta` with `buildExportMeta(...)` + `modeMeta(ctx.access)`, takes `moneyOpts(ctx)` (`showPay` from the session switch, `showCost` from the mode), and `await import('@/lib/export')` before calling `exportViewWorkbook` / `exportViewDeck`.
- A whole-view export renders the other tabs off screen in the **same mode and scope** (`accessInputOf`) and captures chart images while mounted (`captureFigureImages`, light theme, 2x PNG).
- Columns carry their own privacy: `pay: true` (one person's amount; only with the session switch) and `cost: true` (group total; only where `showCost`). `visibleColumns` is the single filter used by the table on screen, CSV, TSV/clipboard, Excel and slide tables. The toast and Summary say "Pay amounts were left out" / "Pay amounts: Left out" (`moneyLeftOut`, `payFact`).
- Context stamped on every output (one source per line so all outputs agree):
  - workbook Summary facts (`view.ts` l.244-269): Tabs, Scope, Window, As of, Data (sample or uploaded), Data standard, `Pay amounts`/`Pay` (Finance cost line), Mode, Definitions, Exported; foot = stamp line.
  - each sheet's title block (`xlsx.ts` l.173-192): title, subtitle, `viewLine · metaLine`, data line, definitions line, mode lines, stamp (bold), note (italic, dropped when withheld); then a blank row; header row = `block.length + 2`; frozen panes, autofilter, print titles, footer `&L stamp &R Page &P of &N`.
  - CSV preamble (`csvPreamble`): title, subtitle, metaLine, dataLine, definitions, mode lines, stamp; then an empty line; then the header. `preamble: false` writes the bare table.
  - deck title slide (`titleSlide`, `view.ts` l.457): "CENSUS · PEOPLE ANALYTICS" kicker, view (40pt), tab (22pt), context lines `[scope, window, As of, standard line, definitions, ...modeLines]` in a 2.3in box with `fit: 'shrink'` ("Up to seven lines"), company, "Sample data" chip, "Company confidential".
  - chart image footer (`imageFooter`): scope · As of · standard · tier · definitions changed · mode line (no full stop) · 'Census' · Sample data.
- Numbers: stored rounded to `EXPORT_DIGITS[format]`, never raw floats; missing values are empty cells, never 0; booleans "Yes"/"No"; dates real Excel dates; formula-looking text guarded with `'` in CSV.
- File names: `fileStem` = `census-<view slug>-<name slug minus repeated view prefix>-<ISO as-of>`.

### 3.4 How withheld and suppressed values are flagged in Census
- **Withheld** (data standard tier, whole figure): `figureExport(fig, held)` swaps the figure's columns for `WITHHELD_COLUMNS` and its rows for one `{status, reason}` row, drops the note, sets `withheld: true`. Workbook Summary: Tier "Bronze, not shown", Rows `null`, Note `''`. Sheet data line: "Tier: Bronze, not shown under this standard". Deck: `withheldBody` prints status and reason in a grey box instead of the chart; footnote drops the note. Test: `JSON.stringify(out)` must not contain the hidden number (`withheld.test.ts` l.96).
- **Suppressed** (anonymity, n < 5): there is **no flag column**. KPI tiles carry `suppressed?: boolean` and `suppressedNote?: string` (`src/components/types.ts` l.45-50); `kpiRows` writes `value: null`, `change: null`, and `note: k.suppressedNote ?? SUPPRESSED_NOTE` where `SUPPRESSED_NOTE = 'Hidden to protect anonymity (n < 5)'` (`kpiModel.ts` l.13). Figure rows hold `null` in the cell, which exports as an empty cell. Money columns a mode may not see are dropped as whole columns. Finance's rounded cost under `COST_STEP` is written as the text `'under $0.1M'` into the numeric cell (`excelValue` l.100, `plainText` l.229).

### 3.5 Deck export (pptxgenjs)
- Users: `exportViewDeck` (`view.ts` l.738-829), `downloadOrgSlides` (`src/views/org/ui/exportSlides.ts`, native shapes), monthly report (`src/views/scorecard/ui/monthlyReport.ts`, built on `renderWholeView` + `lib.exportViewDeck`).
- Layout constants: `W = 13.333`, `H = 7.5`, margin `M = 0.6`, font `'Archivo'`, colors `C = { ink: '12151A', ink2: '475060', muted: '616A78', rule: 'DDE1E7', sheet2: 'F3F4F6', sheet3: 'E7E9ED' }`, `TABLE_ROWS = 14`.
- Order: title slide, then per tab a divider slide (tab label + up to 10 figure titles + "and n more"), then one slide per figure: header (22pt title, 13pt subtitle), body = withheld box | chart PNG scaled to fit (max 2x) | native table (first 14 rows, "And n more rows in the Excel export.") | "No rows for this figure in the current scope."; footer rule, left = `slideFootnote` (standard · tier · note), right = `viewLine · scope · As of · slide number`; speaker notes = subtitle + note.
- `pptx.layout = 'LAYOUT_WIDE'`, `theme = { headFontFace: FONT, bodyFontFace: 'Arial' }`, `author = 'Census'`, `title = viewLine(meta) || 'Census'`, `subject = metaLine(meta)`. Written with `pptx.write({ outputType: 'blob' })`, re-wrapped with `MIME.pptx`.

### 3.6 Lazy loading of ExcelJS and pptxgenjs
- `xlsx.ts` imports ExcelJS types only (`import type { CellValue, Workbook, Worksheet } from 'exceljs'`) and loads the library through a memoized `import('exceljs')`, unwrapping the CommonJS default: `excel ??= import('exceljs').then((m) => (m as unknown as { default?: ExcelModule }).default ?? m)`.
- `view.ts` imports `type PptxGenJS from 'pptxgenjs'` and calls `import('pptxgenjs')` inside `exportViewDeck` (in a `Promise.all` with image capture).
- App code imports single export modules statically when needed up front (`Figure.tsx` imports `@/lib/export/csv`, `/xlsx`, `/image`, `/names`, `/withheld`, `/clipboard`, `/columns`) and the barrel only with `await import('@/lib/export')`.
- **Enforcement is one test**: `src/lib/export/lazy.test.ts` walks every non-test `.ts/.tsx` outside `lib/export/` and fails on `^(?:import|export)\s+(type\s+)?[^'";]*?from\s+'@\/lib\/export'` without `type`. Nothing tests that `exceljs`/`pptxgenjs`/`xlsx` are never statically value-imported; the build output shows them as separate chunks (`dist/assets/exceljs.min-*.js` 930 KB, `pptxgen.es-*.js` 369 KB).
- In the one-file build (`vite-plugin-singlefile`) everything is inlined into the HTML (Census `census.html` is 8.3 MB), so laziness only changes when code evaluates, not what downloads.

### 3.7 Deploy flow (exact)
1. `npm run deploy` = `npm run build:single && node scripts/deploy-pages.mjs`.
2. `build:single` = `node --max-semi-space-size=64 node_modules/vite/bin/vite.js build --mode single && node scripts/copy-single.mjs`. Mode `single` adds `viteSingleFile({ removeViteModuleLoader: true })`, `outDir: 'dist-single'`, `assetsInlineLimit: 100_000_000`, `base: './'`. `copy-single.mjs` copies `dist-single/index.html` to `<root>/census.html`.
3. `deploy-pages.mjs`: `files = pagesFiles((p) => existsSync(path.join(root, p)))`; if the policy or relay file is in the list, run `policyProblem` / `relayProblem` against `census.html` text and `process.exit(1)` with "Not published. <problem>". Then `remote = git remote get-url origin`, `sha = git rev-parse --short HEAD`, `dir = mkdtempSync(path.join(tmpdir(), 'census-pages-'))`; copy each `{from,to}` (empty file for `from: null`), `git init -q -b gh-pages`, `git add -A`, `git commit -q -m "Publish Census (one-file build of main@${sha})"`, `git push -q -f ${remote} gh-pages`, log "Published ...", always `rmSync(dir, { recursive: true, force: true })`.
4. Result: `gh-pages` is a single orphan commit (history replaced every deploy) holding `index.html`, `census.html`, `.nojekyll` and optionally `access-policy.json`, `ask-relay.json`. Pages serves https://unique-name27.github.io/census/.
5. Census commits `census.html` itself (`git ls-files` lists it; 8.3 MB) so a clone can double-click it or use `Launch Census.bat` (`msedge --app=file:///...` then chrome, then default).
6. `deployPages.test.ts` keeps the list pure and in sync with the script (it greps the script for `from './pagesFiles.mjs'`, `for (const f of files)` and `policyProblem(`).

### 3.8 Every "census" string in the build, deploy and launch files
| File:line | Text | HCP replacement |
|---|---|---|
| `scripts/deploy-pages.mjs:2` | `builds census.html, then pushes it as index.html` | `headcount-planner.html` |
| `scripts/deploy-pages.mjs:4` | `and census.html must carry it` | drop (no policy in Phase 1) |
| `scripts/deploy-pages.mjs:5` | `Ask Census` | drop (no Ask) |
| `scripts/deploy-pages.mjs:22,32` | `path.join(root, 'census.html')` | `` `${APP_SLUG}.html` `` (drop both blocks in Phase 1) |
| `scripts/deploy-pages.mjs:42` | `'census-pages-'` | `'headcount-planner-pages-'` |
| `scripts/deploy-pages.mjs:49` | `"Publish Census (one-file build of main@${sha})"` | `"Publish Headcount Planner (one-file build of main@${sha})"` |
| `scripts/pagesFiles.mjs:3,8,10` | comments `census.html`, `Ask Census`, `Census would ignore` | rename |
| `scripts/pagesFiles.mjs:22` | `POLICY_FORMAT = 'census-access-policy'` | `'hcp-access-policy'` (Phase 2) |
| `scripts/pagesFiles.mjs:39` | `The checksum Census computes` | rename |
| `scripts/pagesFiles.mjs:60-61` | `{ from: 'census.html', to: 'index.html' }`, `{ from: 'census.html', to: 'census.html' }` | `headcount-planner.html` |
| `scripts/pagesFiles.mjs:70,73,74,83,86,95,100,102,103` | relay messages "Census would ignore", "census.html was built without" | drop with relay (Phase 3) |
| `scripts/pagesFiles.mjs:108-131` | policy messages "Census", "census.html", "Census access policy file" | Phase 2 rename |
| `scripts/pagesFiles.d.mts:7,10,24` | `'census-access-policy'`, comments | rename / drop |
| `scripts/copy-single.mjs:1,12,13` | `census.html`, `"Launch Census.bat"`, `'Wrote census.html'` | `headcount-planner.html`, `Launch Headcount Planner.bat` |
| `scripts/verify.mjs:2,24` | `// Census quality gate`, `'\nCensus verification'` | `Headcount Planner` |
| `scripts/build-artifact.mjs:4,14,32` | `dist-artifact/census.html`, `'<title>Census</title>'` | rename or drop the script |
| `vite.config.ts:9` | comment `census.html` | rename |
| `package.json:2` | `"name": "census"` | `"headcount-planner"` |
| `index.html:6` | `<title>Census</title>` (+ description) | `Headcount Planner` |
| `Launch Census.bat:2,3,5,8` | file name and `census.html` | `Launch Headcount Planner.bat`, `headcount-planner.html` |
| `.claude/launch.json` | `"name": "census"`, port 8820 | `"headcount-planner"`, 8822 |
| `README.md:8,10,13` | `unique-name27.github.io/census/`, `census.html` | `/headcount-planner/`, `headcount-planner.html` |
| git remote | `https://github.com/unique-name27/census.git` | `unique-name27/headcount-planner` |

"census" inside `src/` of the ship area (all must go, since HCP has a test that fails on it): `HELP_STORAGE_KEY = 'census:help'`; article ids `what-census-is`, `ask-census`; `useCensus`/`CensusState` imports in `help/store.ts`, `help/diagnosticInput.ts`, `help/ui/useDiagnostic.ts`; `'Census problem report'`; `'New to Census?'`; `fileStem` prefix `'census'`; `'CENSUS  ·  PEOPLE ANALYTICS'`, `pptx.author = 'Census'`, `viewLine(meta) || 'Census'`, `'Census people analytics'`, `wb.creator = 'Census'`, `'Census export'`, `imageFooter` `'Census'`; `NOT_SECURITY_*`; `SECURITY_BANNER`, `IGNORED_TITLE`; policy messages. Census src overall has ~1,240 "Census" and ~70 lowercase hits across 390 files.

### 3.9 Tests that enforce the ship-area invariants
| Invariant | Test |
|---|---|
| Every article/tour link, route, tab, metric, tour target resolves | `help/content.test.ts` |
| One article and one 4-6 step tour per view | `help/content.test.ts` l.196, 265 |
| Sentence case, no em dash, no "!", no nagging verbs | `help/content.test.ts` l.355-387 |
| Every article/tour has a decision in every mode; views' articles follow the view | `help/access.test.ts` l.171 |
| A mode's tours keep >=3 steps, each on shown page/figure/condition | `help/access.test.ts` l.204 |
| **No shown article or tour step names a page, tab or control the mode hides** | `help/access.test.ts` l.278 (`NAMES`, `NOT_A_PAGE`, `NAMED_ON_PURPOSE`) |
| Banned mode words in help, with the exemption pinned | `dev/security/copy.test.ts` l.47-74; `help/access.test.ts` l.300 |
| Banned words + no em dash in mode copy and policy reasons | `access/matrix.test.ts` l.736 |
| Mode lines on every export, Finance cost line, no banned words | `lib/export/money.test.ts` |
| Withheld exports leak nothing | `lib/export/withheld.test.ts`, `view.test.ts` l.246-314 |
| Barrel is lazy | `lib/export/lazy.test.ts` |
| Report a problem names the mode, never a person | `help/access.test.ts` l.625-680; `help/engine.test.ts` l.118-208 |
| Publish list and refusal rules | `dev/security/deployPages.test.ts` |
| Dev server never serves secrets | `dev/security/devServer.test.ts` |
| `APP_VERSION` = package.json | `help/content.test.ts` l.399 |

---

## 4. Tests to port

| Census test | What it asserts | HCP adaptation |
|---|---|---|
| `src/help/content.test.ts` | ids unique; HELP.md articles exist; `view-<key>` article/tour per view (4-6 steps); links resolve (exact link kinds present: `['article','route','settings','tour']`); targets exist in `.tsx`; steps on a page name it; Getting started covers listed targets; sentence case; no em dash/"!"/nagging; labels not ids; glossary sorted; version equal; datasets article names every dataset label | Port whole. Replace `PROPER` with HCP names (`Headcount Planner`, `Northgate Semiconductor`, `Budget`, `Working`, `Q1 Reforecast`, `FY27`, `FY28` (keep "plan of record" lowercase), `Data room`, `What if`, `Acting as`, `Show pay amounts`, `HRBP`, `HR admin`, `HRIS`, `Finance`, `Excel`, `PowerPoint`, `Help`, `Settings`). Expected article list from HCP `docs/HELP.md`. "Getting started" target list per HCP chrome. `data-loading` must name all 8 dataset labels. Drop `Ask`-specific targets (`masthead-ask`). If HCP articles use `metric:` links, update the exact-kinds assertion. |
| `src/help/access.test.ts` | decisions per mode; ROLES-V2 4.8 S/H table; tours keep >=3 steps; hidden links read as text; `NAMES` hidden-name check; new-copy banned words; Home article per role; pay article per mode; home tour per mode; welcome per mode; Report a problem mode line | Port with HCP modes (Manager, HRBP, Leader, Finance, HR admin [, Developer if kept]). Rebuild `COLUMNS` and `TABLE_48` from HCP `ROLE_POLICY`. Rebuild `NAMES` from HCP surfaces (examples: `Data room`->`page:data`, `Show pay amounts`->`pay:switch`, `What if`->`view:whatif` or `tab:...`, `Targets`->`view:targets`, `Forecast`->`view:forecast`, `Finance`(view)->`view:finance`, `Export` tab->`tab:finance.export`, `Versions`/`Assumptions`/`Freezes`/`Reconcile` tabs, `Transfers`->`tab:plan.transfers`, `New request`->`tab:requests.new`, `Cycle`->`tab:requests.cycle`, `Audit`->`view:audit`, `Import requests`->`ui:import-requests`, `Full workspace file`->`export:workspace-full`). `NOT_A_PAGE` must strip mode names that share a page's word ("Finance mode", "Leader mode"). Report-a-problem: names the unit, never a manager, leader or the Acting as person. |
| `src/help/engine.test.ts` | markup parsing, `placePopover`, prefs parsing, diagnostic text has no name/ID/file name/filter value, `safeAddress` | Port as is; diagnostic adds version name and proration; scrub position IDs and request IDs from the address too. |
| `src/help/search.test.ts` | prefix matching, weights, limits, snippets | Port; replace example queries with HCP words ("variance", "backfill", "loaded cost", "trade"). |
| `src/help/store.test.ts` | clean search on open; home tour ends that mode's welcome line only | Port with `hcp:help`. |
| `src/dev/security/copy.test.ts` | exemption pinned; every non-exempt article/tour sentence about modes/roles free of banned words | Port to `headcount-planner/src/access/copyWords.test.ts` (no Security center in Phase 1): exempt list pinned to exactly `['about-server']`; also assert the `about-server` article does use at least one banned word (so the exemption is needed and not stale) and that no tour is exempt. |
| `src/dev/security/helpArticle.test.ts` | the exempt article exists, routes, is decided as intended, names required phrases | Port as `aboutServer.test.ts`: exists in group `privacy`, shown in every mode, title fixed, contains "sign-in", "server", the README section name, `NOT_SECURITY_SHORT` wording or a link to the modes article; no em dash, no "!", never "tamper-proof". |
| `src/access/matrix.test.ts` l.736 (copy plain) | `NOT_SECURITY_*` and every `how` reason: no em dash, no banned words, sentence starts with capital | Port into HCP matrix/policy test. |
| `src/lib/export/lazy.test.ts` | no static value import of the barrel | Port and extend: also fail on a static value import of `'exceljs'`, `'pptxgenjs'` or `'xlsx'` anywhere in `src` (type imports allowed). |
| `src/lib/export/view.test.ts` | sheet names per tab/section, Summary layout, empty-data meta, tiers/withheld | Port; add: Summary carries the HCP plan header facts; first sheet row indexes shift (header lines are more), so look up rows by content (`eachRow`) rather than fixed row numbers like `getRow(7)`. |
| `src/lib/export/money.test.ts` | pay/cost columns per output, mode lines, `payFact`, banned words | Port as the export cost-guard test: per mode, columns kept; Manager exports carry no amount columns at all; HRBP/Leader only `cost` columns that are $0.1M-floored; Finance exact 5+; HR admin + switch keeps `pay`. Fix and test the CSV `showCost` bug (see 6). |
| `src/lib/export/withheld.test.ts` | reason only | Port as is (data-standard tiers stay). |
| `src/lib/export/{xlsx,csv,names,columns,definitions}.test.ts` | sheet rules, cell values, round trip, CSV quoting/BOM/formula guard, `fileStem`, precision, definitions stamp | Port; `fileStem` expected prefix `headcount-planner-`. |
| `src/dev/security/deployPages.test.ts` | publish list; policy/relay refusal; script uses the list | Port to `headcount-planner/src/ship/deployPages.test.ts`: `pagesFiles(() => false)` equals `[{from:'headcount-planner.html',to:'index.html'},{from:'headcount-planner.html',to:'headcount-planner.html'},{from:null,to:'.nojekyll'}]`; script imports the list and loops it; script text contains no "census". Policy/relay cases come back in Phase 2/3. |
| `src/dev/security/devServer.test.ts` | dev server deny list | Port; drop relay paths, add HCP data files if served from root (`*.hcplan.json`). |
| `src/dev/security/{redTeam,address,model,policy,rails,preview}.test.ts` | Security center | Phase 2. |
| `src/ask/engine/testkit.ts` `leaks`/`expectClean` | privacy scan of any text | Port to `src/testkit/leaks.ts`; use it in export leak tests (serialize CSV text, every workbook cell, deck XML text) per mode. |

New HCP tests in the ship area (no Census equivalent):
- `noCensus.test.ts`: no `/census/i` in `src/**/*.{ts,tsx,css,json}`, `scripts/*.mjs`, `vite.config.ts`, `index.html`, `package.json` (Markdown under `docs/` may mention Census).
- `exportHeader.test.ts`: every output (Summary, sheet title block or header sheet, CSV preamble or header columns, deck title/assumption slide, image footer) carries version, lock hash, as-of, proration, rate set, cost definition, mode line, filters, rounding.
- `suppressedFlag.test.ts`: any table with an amount column gets a `Suppressed` column; a suppressed cell is empty (never 0) with flag `Yes` and a reason; numeric amount cells are numbers, never text.
- `longCsv.test.ts`: column order, one currency per row, never a USD sum across currencies, negative numbers stay numbers (not formula-guarded text).
- `controlTotals.test.ts`: export control totals equal the on-screen totals from the same engine output, for every home and Forecast/Variance, per mode.
- `trackedFiles.test.ts`: the pure `trackedDataProblems(gitLsFiles)` used by `verify.mjs` flags `.xlsx`, `.csv`, `.hcplan.json` outside `src/data/sample/`.

---

## 5. HCP adaptation (files under `headcount-planner/`)

### 5.1 App identity (single source)
`src/app/name.ts`:
```ts
export const APP_NAME = 'Headcount Planner'
export const APP_SLUG = 'headcount-planner'
export const STORAGE_PREFIX = 'hcp:'
```
Everything below reads these (file stems, deck kicker, workbook creator, problem report title, welcome line). `scripts/*.mjs` cannot import TS, so they hard-code `'headcount-planner'` and a test compares it to `APP_SLUG`.

### 5.2 Help (`src/help/`)
| File | Change vs Census |
|---|---|
| `types.ts`, `markup.ts`, `search.ts`, `tour/place.ts`, `ui/*` | Copy. UI imports the HCP store hook instead of `useCensus`. Drop `masthead-ask`. |
| `links.ts` | `checkLink` special cases: `data` (Data room tabs), `actions`, `audit`; drop `dev` until Phase 2. |
| `access.ts` | Copy; `homeTourOf(mode)`: every HCP mode has its own home (My team, Unit plan, Rollup vs target, Plan vs actual, Data room), so `home-start` with per-mode `wording` everywhere, `getting-started` as the general tour. |
| `store.ts` | `HELP_STORAGE_KEY = 'hcp:help'`; `WelcomeLine = { home: Mode }` (drop `'hr'`/`'manager'` variants unless HCP keeps them). |
| `welcome.ts` | "New to Headcount Planner?" and "New to <Mode> mode?"; Acting as does not change the line. |
| `glossary.ts` | `PAGE_LABEL` over HCP `MetricView` (`home`, `plan`, `requests`, `forecast`, `targets`, `finance`, `whatif`, `data`, `actions`, `audit`); `privacy.*` stays "Privacy rule". |
| `learnMore.ts` | `BY_PREFIX` from HCP metric id prefixes (`plan`, `req`, `fc`, `var`, `tgt`, `fin`, `cost`, `heads`, `trade`, `quality`); `BY_ID` for `privacy.*` and the cost guard. |
| `whatsNew.ts` | `APP_VERSION = '0.1.0'`, one note for the first release. |
| `diagnostics.ts`, `diagnosticInput.ts` | Title `Headcount Planner problem report`; add lines Version (name only), Proration, Comparison, Acting as set (name left out); never position ids, request ids, names or amounts; `safeAddress` also cuts `P-1234`, `R-88`, `REQ-...`. |
| `articles/when.ts` | HCP conditions: `MANAGER`, `HRBP`, `LEADER`, `FINANCE`, `HR_ADMIN`, `PAY_SWITCH` (`pay:switch`), `COST_FLOORED` (`cost:floored`), `COST_EXACT` (`cost:exact`), `NO_COST`, `DATA_ROOM`, `NO_DATA_ROOM`, `CAN_APPROVE`, `WHAT_IF`. |
| `articles/start.ts` | `what-headcount-planner-is`, `moving-around` (filters, version picker, comparison picker), `reading-a-number` (heads, FTE, loaded cost, "—", "Other (k)", calculation card), `clicking-down` (Drill, Filter to this), `exporting`, `modes` (modes + Acting as, ends with `{ note: NOT_SECURITY_LONG }`). |
| `articles/views.ts` | `view-home` (one section per home), `view-plan`, `view-requests`, `view-forecast`, `view-targets`, `view-finance`, `view-whatif` (if a view), `view-data`, `view-actions`, `view-audit`. |
| `articles/data.ts` | `data-loading` (names all 8 dataset labels), `data-mapping`, `data-tiers`, `data-certify`, `data-quality-tab`, `data-wrong`, `data-workspace-file` (`.hcplan.json`, Shareable vs Full, checksums catch damage), `data-versions` (Budget, plan of record, Working, locks). |
| `articles/definitions.ts` | `definitions-how`, `glossary` (generated), `cost-definition` (loaded cost, band estimate, proration, FX), `trading-heads` (see 5.6). |
| `articles/privacy.ts` | `privacy-browser`, **`about-server`** (exempt), `privacy-pay`, `privacy-small-groups` (5+, Other (k), "—", $0.1M floors), `privacy-leave` (counts for 5+), `privacy-sample`. |
| `articles/support.ts` | `shortcuts`, `report-problem`, `troubleshooting` (incl. same-origin note), `faq`, `whats-new`. |
| `tours.ts` | `getting-started`, `home-start` (per-mode wording via each home's hero figure), one `view-<key>` 4-6 step tour per view, `own-data` (HR admin), `requests-start` (Manager: draft, submit, track). |
| Policy | Add every article and tour id to HCP `ROLE_POLICY` help decisions; `about-server` SHOWN in every mode. |
| Tests | `content.test.ts`, `access.test.ts`, `engine.test.ts`, `search.test.ts`, `store.test.ts`, `aboutServer.test.ts`. |
| `docs/HELP.md` | HCP article table and tour list (the content test reads its expectations from the same list). |

`about-server` article sketch (exempt from the banned-words scan only; every other wording rule applies):
```ts
{
  id: 'about-server',
  group: 'privacy',
  title: 'Why there is no sign-in',
  summary: 'Headcount Planner runs in this browser. Real access control needs a server with sign-in.',
  keywords: ['server', 'sign-in', 'login', 'security', 'access control', 'permissions', 'phase 3'],
  body: [
    { p: 'Headcount Planner runs entirely in this browser, with no server and no sign-in. Modes, Acting as and approvals change what it shows, not who can see the data.' },
    { p: 'Anyone with the page and the data can switch modes, and data already on a computer can be read with the browser\'s own tools. Real access control, where each person signs in and sees only what they are permitted to, needs a server with sign-in. That is planned for a later phase.' },
    { h: 'Until then' },
    { ul: ['Share workspace files only with people who may see all of them.', 'Use a Shareable workspace file for others: it holds only what your mode shows.', 'Checksums catch damaged files. They do not prove who made a file.'] },
  ],
}
```
Note the NAMES check in `access.test.ts` still applies to this article: do not name a page or switch a mode hides (for example "Data room", "Show pay amounts") unless wrapped in a condition block.

### 5.3 Security copy (`src/access/copy.ts`, Phase 1)
```ts
export const NOT_SECURITY_SHORT =
  'Modes, Acting as and approvals change what Headcount Planner shows, not who can see the data.'
export const NOT_SECURITY_LONG =
  'Modes and Acting as shape Headcount Planner for how you use it. They are not security: anyone using it can switch modes or pick who they act as, and every mode reads the same data in this browser. Share Headcount Planner and its files only with people who may see all of it.'
export const BANNED_MODE_WORDS: readonly string[] = ['access', 'permission', 'restricted', 'secure', 'locked down', 'authorized', 'role-based access']
/** Copy about hashes and checksums (spec: never say "tamper-proof"). */
export const BANNED_HASH_WORDS: readonly string[] = ['tamper-proof', 'tamperproof', 'tamper proof', 'forgery', 'guarantee']
/** Where the banned mode words may appear (Phase 2 adds the Security center's folders and article). */
export const BANNED_WORDS_EXEMPT = { folders: [], articles: ['about-server'] } as const
export function modeExportLine(mode: Mode, scope?: string | null, actingAs?: boolean): string | null
export const FINANCE_EXPORT_LINE =
  'Cost amounts cover groups of 5 or more costed people. Individual pay is left out.'
export const FLOORED_EXPORT_LINE =
  'Cost amounts are rounded to $0.1M per department or sub-org, and groups under 5 are left out.'
```
Decide whether HR admin (with the switch off) gets a mode line: Census skips `hr` and `developer` because they see everything; HCP HR admin also sees everything, so `modeExportLine('hr-admin') = null` unless the pay switch is on, in which case add "Contains individual pay."

### 5.4 Export (`src/lib/export/`)
Copy `index.ts`, `types.ts`, `columns.ts`, `csv.ts`, `xlsx.ts`, `view.ts`, `names.ts`, `modeMeta.ts`, `withheld.ts`, `download.ts`, `image.ts`, `clipboard.ts`, `definitions.ts` and their tests, with these changes:

1. **Header contract.** Extend `ExportMeta` (keep every Census field) with a required plan header:
```ts
export interface PlanHeader {
  version: string            // "FY27 Working"
  versionState: 'locked' | 'working'
  lockHash: string | null    // "sha256-…" for locked versions; null for Working
  comparison: string         // "vs FY27 Budget" (the picker's choice)
  asOf: string               // ISO
  proration: 'daily' | 'half-month' | 'full-month'
  rates: string              // "Plan rates (EUR 1.08, ILS 0.27)"; or "Actual for closed months, forecast for open"
  costDefinition: string     // "Loaded cost: base + bonus + burden + benefits + one-time, USD" (+ " incl. SBC")
  filters: string            // "Unit: Silicon Engineering; Cost center: 3 values; Period: FY27"
  rounding: string           // "Exact for groups of 5+" | "Rounded to $0.1M per department" | "None (HR admin, pay amounts on)"
}
export interface ExportMeta { /* Census fields */ plan?: PlanHeader }
export function headerLines(meta: ExportMeta): [label: string, value: string][] // one source for every output
```
   Render: workbook Summary facts (all lines), each sheet title block (compact one-liner `version · lock sha256:abcd1234 · As of … · proration · rates` + mode lines), CSV preamble (all lines), deck: title slide keeps the Census context lines and an extra "About these numbers" slide holds `headerLines` as a native two-column table (the title slide box only fits about seven lines), image footer (version and as-of only).
2. **Suppressed flag.** Add to `Column`: `guard?: 'cost' | 'pay'` is already expressed by `cost`/`pay`; add a row-level convention `__suppressed?: Record<string, string>` (column key -> reason) set by the cost guard. New `src/lib/export/suppressed.ts`:
```ts
export const SUPPRESSED_COLUMNS: Column[] = [
  { key: 'suppressed', label: 'Suppressed', format: 'text' },
  { key: 'suppressedReason', label: 'Why', format: 'text' },
]
export function withSuppressedFlag(table: ExportTable): ExportTable // appends the two columns when any amount column exists; cells blanked, never 0
```
   Every exporter calls it after `visibleColumns`. Amount cells stay numeric: never write `'under $0.1M'` text into an amount column; write `null` plus flag `Yes` and reason `Under $0.1M` (or keep Census's text only on slides).
3. **Long CSV.** New `src/lib/export/longCsv.ts`: `LONG_CSV_COLUMNS = ['period','org','costCenter','account','component','currency','amountLocal','rate','amountUsd','heads','fte','suppressed','suppressedReason','version','lockHash','asOf','proration','rateSet']` (header repeated as columns so the file stays machine-readable with `preamble: false`). One currency per row; USD only in `amountUsd`.
4. **Control totals.** New `src/lib/export/controlTotals.ts`: a "Control totals" sheet and CSV footer block (Σ heads, Σ FTE, Σ USD per component, count of suppressed cells) computed from the exported rows; test compares with the screen model.
5. **Names.** `fileStem` prefix `APP_SLUG` (`headcount-planner-plan-positions-2026-09-30`); `imageFooter`, `newWorkbook` creator, deck kicker `` `${APP_NAME.toUpperCase()}  ·  PLANNING` ``, `pptx.author = APP_NAME`.
6. **Money flags.** HCP has three amount kinds; map them onto Census's two flags plus the guard: per-person (`pay: true`: `baseSalary`, `offerBase`, grid cost on a Filled seat or accepted offer), group totals (`cost: true`), band estimates (new `band: true`, hidden in Manager mode, shown to HRBP/Leader/Finance approvers). `MoneyShown` becomes `{ pay: boolean; cost: boolean; band: boolean }` and `visibleColumns` drops `band` columns where `!band`.
7. **Lazy.** Keep `loadExcel()` and `import('pptxgenjs')`; extend `lazy.test.ts` as in section 4. SheetJS (`xlsx`) is the importer's parser and must also stay behind `import()`.
8. **FP&A load file** (Finance > Export): built on the long CSV. Finance gets suppressed flags for groups under 5; the unsuppressed load file is offered only in HR admin with "Show pay amounts" on, and its header says "Contains individual pay".
9. **Workspace file** (`.hcplan.json`) download goes through `downloadBlob` with `MIME.json = 'application/json'`; "Shareable" is built from the mode's visible data, "Full" only in HR admin with the switch.

### 5.5 Ship scripts and repo files
| HCP file | From Census | Change |
|---|---|---|
| `package.json` | same scripts | `"name": "headcount-planner"`; dev `--port 8822 --strictPort`; preview `--port 8823`; drop `@anthropic-ai/sdk`, `d3-sankey`, `@types/d3-sankey`, `motion`; drop `build:artifact` unless wanted. |
| `scripts/copy-single.mjs` | copy | writes `headcount-planner.html`. |
| `scripts/pagesFiles.mjs` (+ `.d.mts`) | simplified | `APP_HTML = 'headcount-planner.html'`; list = index.html, headcount-planner.html, .nojekyll. Policy and relay parts return in Phase 2/3. |
| `scripts/deploy-pages.mjs` | copy | renamed strings (section 3.8); stage by path in the temp repo (`git add -- index.html headcount-planner.html .nojekyll`) to honor "never `git add -A`"; refuse to run with no commit (`git rev-parse` fails) or no `origin` with a plain message. |
| `scripts/verify.mjs` | copy | add step "Tracked data files": `git ls-files` -> `trackedDataProblems` from `scripts/trackedFiles.mjs` (pure, tested); a folder that is not yet a git repo passes with a note. |
| `scripts/trackedFiles.mjs` (+ `.d.mts`) | new | `export function trackedDataProblems(files: string[]): string[]` (flags `/\.(xlsx|csv)$/i` and `/\.hcplan\.json$/i` outside `src/data/sample/`). |
| `scripts/devServer.mjs` (+ `.d.mts`) | copy | Vite's list; add `*.hcplan.json`; drop wrangler entries. |
| `vite.config.ts` | copy | comment rename; `server: { fs: { deny: DEV_SERVER_DENY } }` kept literally (test greps it); test projects without `ask-relay/`. |
| `.gitignore` | extend | `node_modules`, `dist`, `dist-single`, `dist-artifact`, `*.log`, `.DS_Store`, plus `*.xlsx`, `*.csv`, `*.hcplan.json` with `!src/data/sample/**` exceptions. |
| `index.html` | copy | title and description. |
| `Launch Headcount Planner.bat` | copy | file names. |
| `.claude/launch.json` | copy | name `headcount-planner`, port 8822. |
| `README.md` | new | Online URL, double-click file, deploy, **Architecture honesty** (no server; modes are not security; real access control needs a server with sign-in), **same origin**: every app under `unique-name27.github.io` shares one origin (localStorage, IndexedDB), so use the downloaded `headcount-planner.html` for real data. |
| `src/ship/*.test.ts` | new location | `deployPages.test.ts`, `devServer.test.ts`, `trackedFiles.test.ts`, `noCensus.test.ts`. |

First-time publish steps (M4): commit on `main` (stage by path), `gh repo create unique-name27/headcount-planner --public --source . --remote origin --push`, `npm run deploy`, then point Pages at the branch once: `gh api -X POST repos/unique-name27/headcount-planner/pages -f "source[branch]=gh-pages" -f "source[path]=/"` (use `-X PUT` if Pages already exists). URL: `https://unique-name27.github.io/headcount-planner/`.

### 5.6 The added requirement: trading headcount between levels, regions, etc.
What the ship area needs for "trade headcount between levels, regions, etc. with some ratio based on an 'average' headcount":
- **Copy and help.** Call it a "trade" with a "trade ratio" (not "exchange rate", which collides with FX). Article `trading-heads` (group `definitions`, linked from What if and Targets): ratio = average loaded cost per head of what you give up ÷ average loaded cost per head of what you get, e.g. "1 P5 in Munich trades for 1.6 P3 in Bengaluru". Say which average: band estimate (midpoint × FTE + standard loads at plan rates) in every mode, never HRIS pay; Finance may switch to the actual average only for groups of 5+ costed people. Trades are What if levers until "Turn into requests". Tour step on `[data-tour="whatif-trade"]` in the What if tour, with `surface: 'ui:trade'` so modes without it skip it.
- **Privacy.** A ratio is a rate under the spec's guard ("No cost, rate or average over fewer than 5"). A ratio of two actual averages over small groups reveals relative pay, so the default basis must be band midpoints; a leak test pins that a trade between a 3-person and a 40-person group shows "—" for an actual-pay basis.
- **Export.** The trade's calculation card exports as a table (from, to, heads given, ratio, heads received, basis, rates, cost change with suppressed flag) and its header names the basis ("Trade ratio basis: band estimate, FY27 bands, plan rates").
- **Banned words.** Avoid "authorized headcount" (common HR phrase, banned) in trade copy.

---

## 6. Gotchas and spec conflicts

### 6.1 Census quirks and bugs to know before copying
1. **CSV drops Finance cost columns.** `downloadCsv` (`csv.ts` l.82) calls `toCsv(table, { showPay: opts.showPay, preamble })` and never passes `showCost`, so `moneyShown` reads cost as false and Finance's figure CSV loses every `cost: true` column while Excel keeps it. `Figure.tsx` l.326 does pass `...money`. Fix in HCP: `toCsv(table, { showPay: opts.showPay, showCost: opts.showCost, preamble })`, plus a test. The monthly report (`monthlyReport.ts` l.229 `const opts = { showPay: ctx.showPay, captured, fileName: ... }`) and `FormulasSection.tsx` l.339 have the same omission.
2. **"under $0.1M" text in numeric cells** (`excelValue` l.100, `plainText` l.229) breaks "numeric amounts" for HCP; use null + flag.
3. **Fixed row indexes in tests.** `view.test.ts` reads `sheet.getRow(7)`, `getCell(3, 1)`, `getCell(4, 1)` because the title block has 4 lines. HCP's header adds lines, so rewrite those assertions to search by content.
4. **Formula guard on negative text.** `guardFormula` prefixes `'` to any text starting with `-` or `+`; numbers are only safe when the cell value is a JS number. Variance and gap must stay numbers in rows (format them only on screen).
5. **Lazy test is narrow.** It only checks the barrel; a static `import ExcelJS from 'exceljs'` elsewhere would pass. Extend it.
6. **Single-file build inlines everything.** `census.html` is 8.3 MB; lazy chunks exist only in `dist/`. Do not rely on laziness for the published page size.
7. **`verify.mjs` does not refresh `census.html`.** Its one-file step runs `vite build --mode single` without `copy-single.mjs`, so `npm run deploy` (which runs `build:single`) is the only thing that updates the HTML published. Keep that, or deploy will publish a stale file only if someone skips `build:single`.
8. **Node crash on Windows.** Vite through Node 24 with the React Compiler can crash with 0xC0000409; every script runs `node --max-semi-space-size=64 node_modules/vite/bin/vite.js`. Never `npx vite`. `verify.mjs` still uses `npx tsc`, `npx biome`, `npx vitest` (fine).
9. **Excel test timeouts.** `vite.config.ts` sets `testTimeout: 30_000` because ExcelJS round trips are slow in parallel; perf budgets live in `*.perf.test.ts` in a separate serial project.
10. **Deploy needs a commit and an origin.** `git rev-parse --short HEAD` and `git remote get-url origin` throw on a fresh repo; `git init -b` needs git 2.28+. The temp dir is under `os.tmpdir()`; cleanup is in `finally`.
11. **`git add -A` in the deploy script.** It runs inside the temp gh-pages dir, not the repo, but it reads as a breach of the spec's "never `git add -A`" rule; stage the listed files by name.
12. **`census.html` is committed** (8.3 MB in git). Decide for HCP: commit `headcount-planner.html` (clone-and-double-click works) or ignore it (smaller repo); the deploy reads the working tree either way.
13. **Help test helpers live under `ask/`.** `access.test.ts`, `money.test.ts`, `redTeam.test.ts` import `sampleCtx` from `@/ask/engine/testkit`. HCP has no Ask in Phase 1, so the testkit must move (proposal `src/testkit/`).
14. **`links.ts` imports `@/dev/tabs`.** HCP Phase 1 may have no Developer page; remove that branch or keep a minimal dev route.
15. **Banned-word matching differs by test.** `dev/security/copy.test.ts` uses `\b<word>` (prefix: "accessible", "accessed", "permissions" all match) only on sentences that mention mode/role; `help/access.test.ts`, `matrix.test.ts`, `money.test.ts` use substring `includes` (also matches "inaccessible", "unrestricted"). The `shortcuts` article keyword "accessibility" passes only because keywords are not scanned. Write HCP copy without these stems at all.
16. **Hidden-name check is phrase based.** A mode name that shares a page name ("Finance mode" vs the Finance view, "Leader" vs Leader home) must be added to `NOT_A_PAGE`, or the test reports false positives.
17. **`content.test.ts` asserts the exact set of link kinds used** (`['article','route','settings','tour']`). Adding `metric:` links (useful in HCP's calculation articles) requires updating that assertion.
18. **Tours need 4 to 6 steps per view, and at least 3 left in every mode.** With HCP's tight Manager mode, view tours must use per-mode `wording` rather than steps Manager would skip, or the >=3 rule fails.
19. **`ExportMeta.company`** is `'Company data'` for uploads and the sample name otherwise; `isSample` adds "Sample data" stamps on every output. HCP spec says synthetic data only in the repo: keep the stamp logic.

### 6.2 Spec vs Census conflicts, with a suggested resolution
1. **"A test fails if 'census' appears in src/ code" vs copying.** Census help and export code is full of it (ids `what-census-is`, `ask-census`, `census:help`, `useCensus`, `CensusState`, `fileStem` prefix, deck kicker, problem report title). Resolution: rename at copy time through `APP_NAME`/`APP_SLUG`; the test scans `.ts/.tsx/.css/.json` under `src` plus `scripts/`, `vite.config.ts`, `index.html`, `package.json`, case-insensitive; Markdown in `docs/` and `src/data/sample/README.md` may say "Census" ("Reuse Census's Northgate Semiconductor shape").
2. **Export header has fields Census never had** (version, lock hash, proration, rates, cost definition, filters, rounding). Census's `ExportMeta` has `scope`, `window`, `asOf`, `standard`, `modeLine`, `costLine` only, and the deck title slide holds about seven context lines. Resolution: `PlanHeader` + `headerLines()` (5.4.1), a separate deck slide for the header, a compact line per sheet, full facts on the Summary and in the CSV preamble, and header columns repeated in the long CSV.
3. **"Numeric amounts with a `suppressed` flag column" vs Census.** Census has no per-row flag; suppressed cells are blank with a note only on KPI rows, and Finance's under-step cost is text. Resolution: `withSuppressedFlag` (5.4.2), amounts stay numbers or null, never words, never 0.
4. **Control totals vs differencing.** Totals next to suppressed rows let a reader subtract one group back out, which the cost guard forbids. Resolution: control totals use the same folded groups as the screen ("Other (k)" absorbs groups under 5, then the smallest joins until Other has 5), never a total over rows where exactly one is suppressed; the control-totals test also asserts that total minus the shown rows never equals a suppressed group of 1 to 4 costed people.
5. **Manager "sees no amounts" vs "Approvers see band cost".** Managers approve as a manager's manager, and approvers see band cost, so the two clash in Manager mode exports and the approval screen. Resolution (needs the user's call): in Manager mode show the band estimate only as heads and status ("within allocation", "over by 1 head"), and keep Manager exports free of every amount column; the leak test stays "Manager: no amounts".
6. **NOT_SECURITY_SHORT text.** The spec's line is clean of banned words, but HCP's domain vocabulary is not: "authorized headcount" and "restricted stock" are standard HR terms and both are banned. Resolution: "approved heads", "equity (SBC)".
7. **`about-server` must be shown in every mode but is the only exempt article.** Census's exempt article is Developer-only, and the hidden-name test still runs on it. Resolution: SHOWN in all modes, the exemption list pinned to exactly `['about-server']`, and its text names no page or switch any mode hides (or wraps such text in a condition block).
8. **"Hashes catch damage, not forgery, so never say tamper-proof."** Census has no such check (its own policy copy already says "edited by hand or damaged"). Resolution: `BANNED_HASH_WORDS` and a test over every string containing "hash", "checksum" or "lock" in help, export headers, workspace file dialogs and README.
9. **"Stage by path, never git add -A" vs the deploy script.** See 6.1.11; change the temp-repo staging to explicit names.
10. **Security center is Phase 2, but Census keeps `BANNED_WORDS_EXEMPT` and `deployPages.test.ts` under `src/dev/security/`.** Resolution: Phase 1 puts the exemption in `src/access/copy.ts` and the ship tests in `src/ship/`; Phase 2 adds the center's folders and article to the same constant (and the pinned list in the test).
11. **Same-origin warning.** The spec puts it in the README; Census has nothing similar. Also note that `file://` pages opened in Chrome share one storage origin with each other too, so the `hcp:` prefix and the `headcount-planner` IndexedDB name are what keep HCP's data apart from `census.html` opened from disk. Say both in the README and in `privacy-browser`.
12. **verify must fail on tracked .xlsx/.csv/.hcplan.json, but a fresh folder is not a git repo.** Resolution: the step passes with a note when `git ls-files` reports "not a git repository", and fails on any listed file outside `src/data/sample/`.
