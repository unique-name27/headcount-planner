# Census digest: modes, scopes, policy, leak tests (for Headcount Planner)

Area: `src/access/**` of the Census repository plus `docs/ROLES-V2.md` (2.8, 3.2,
5.10 read in full; parts 0, 1, 2, 4.13, 8 read for the model). All paths below are relative to the
Census root unless they start with `headcount-planner/`. Read only; nothing in Census was changed.

---

## 1. Inventory (every file read, one line each)

| File | Lines | Job |
|---|---|---|
| `src/access/modes.ts` | 327 | `Mode` (11 ids) and every per-mode table: groups, labels, hints, homes, scope kind, pick kind, pay view, immigration switch, `modeButtonLabel`. Pure data. |
| `src/access/copy.ts` | 272 | Every sentence the modes add: `NOT_SECURITY_SHORT/LONG`, `BANNED_MODE_WORDS`, toasts, redirect titles, pin tooltips, `PICKER_COPY` per pick kind, export lines, `reportModeLine`. |
| `src/access/pay.ts` | 67 | `payView`, `showPayIn`, `showCostIn`, `showImmigrationIn`, `payDecisions(mode)` (the `pay:*` surfaces). |
| `src/access/surfaces.ts` | 145 | `SurfaceId` brand, `kindOf`/`restOf`, the `S` builder for every surface kind. |
| `src/access/matrix.ts` | 280 | `AccessInventory`, `accessMatrix(inv)` (every surface x every mode), `matrixText`, `howText`, `MODE_COLUMN`, `matrixCounts`. |
| `src/access/items.ts` | 246 | Action center per mode: `itemShown`, `itemsShown`, `itemInScope`, `lensOf`, `roleItems` (needs / waiting / left). |
| `src/access/context.ts` | 105 | `AccessContext` (`ctx.access`) and memoized `accessFor(mode, scope, metrics, unset)`. |
| `src/access/hooks.ts` | 42 | `useAccess`, `useScope`, `useLock`, `useAt`, `useDecision`, `useCan` (read `ctx`, never the store). |
| `src/access/store.ts` | 215 | `useMode` zustand store, `MODE_KEY = 'census:mode'`, `{v:2,...}` parse/migrate, picks, picker state, storage event follow. |
| `src/access/lock.ts`, `records.ts` | 16, 6 | Back-compat re-exports from `scopes/` (old names `managerLock`, `inLock`). |
| `src/access/numbers.ts` | 40 | `kpisInMode`, `findingsInMode`: drop hidden metrics, keep finding people inside the scope. |
| `src/access/connect.ts` | 494 | Wires modes into the app store: filter guard (clamp), route guard, standard guard, lens guard, `checkScope`, mode-switch side effects and toasts. |
| `src/access/index.ts` | 282 | Barrel plus the long "how to declare access" doc comment. |
| `src/access/scopes/types.ts` | 93 | `ScopeKind`, `OrgScope`, `UnitScope`, `RegionScope`, `ReqsScope`, `ScopeLock`, `HeldScope`. |
| `src/access/scopes/clamp.ts` | 167 | `FILTER_DIMS_OF`, `clampFilters` (the one clamp), `byWholeUnits`, `clamps`, `clampReason` (toast). |
| `src/access/scopes/apply.ts` | 49 | `applyScope(data, scope)`: only `reqs` narrows datasets after the filters (memoized). |
| `src/access/scopes/org.ts` | 103 | `orgScope`, `emptyLock`, `MIN_REPORTS = 3`, `isPickableManager`, `heldLock`, `leaderInLock`. |
| `src/access/scopes/unit.ts` | 123 | `unitScope`, `emptyUnitScope`, `NOBODY = 'none'`, department-to-unit resolution. |
| `src/access/scopes/region.ts` | 86 | `regionScope`, `regionOwnerOf`, `emptyRegionScope`, `pinnedSites`. |
| `src/access/scopes/reqs.ts` | 96 | `reqsScope`, `emptyReqsScope`, `recruiterKey`, `DEFAULT_DEDUP_DAYS`. |
| `src/access/scopes/regions.ts` | 97 (skimmed) | `regionIndex`: one location-to-region index for every reader. |
| `src/access/scopes/pickers.ts` | 162 | Pick dialog rows: `unitOptions`, `regionOptions`, `recruiterOptions` (pure, largest first). |
| `src/access/scopes/label.ts` | 61 | `scopeName`, `scopeLabelOf` ("APAC: Bengaluru, L4"). |
| `src/access/scopes/records.ts` | 272 | Records guard: `inScope`, `rowsInScope`, `personInScope`, `scopeOfAccess`. |
| `src/access/scopes/index.ts` | 84 | `ScopeEnv`, `ScopeResult`, `scopeFor(mode, picks, env)`. |
| `src/access/policy/types.ts` | 95 | `Access`, `Decision`, `At`, `DecideInfo`, `SHOWN/limited/hidden`, `RoleTab`, `PolicyPlace`, `HiddenPart`, `RolePolicy`. |
| `src/access/policy/table.ts` | 191 | `decideTable(policy, surface, at, info)`: the allowlist engine; `PAGE_KEYS`, `baseTab`. |
| `src/access/policy/kit.ts` | 579 | Shared building blocks: `VIEW_TABS`, `tabTable`, `frameSurfaces`, `articlesFor`, `toursFor`, `analysesSurfaces`, shared sentences. |
| `src/access/policy/index.ts` | 302 | `ROLE_POLICY`, `decide`/`decideUnder`/`can`, overrides plumbing, the route guard `routeShown`/`routeDecision`/`firstShownTab`. |
| `src/access/policy/manager.ts` | 495 | `MANAGER_POLICY` (hand-written allowlist, hide lists, hidden columns). |
| `src/access/policy/finance.ts` | 218 | `FINANCE_POLICY` (metric allowlist, BU-only filters, no person items). |
| `src/access/policy/hrbp.ts` | 159 | `hrbpPolicy(mode)` one builder, two ids (unit/region). |
| `src/access/policy/hr.ts`, `chro.ts`, `developer.ts`, `stub.ts` | 38/21/62/50 | Denylist deciders for HR and CHRO; `DEVELOPER_ONLY`; `stubPolicy` (hide-everything placeholder). |
| `src/access/policy/routing.ts` | 415 (head read) | Action center item routing per mode (`ROUTING`), plain data. Note: this is NOT the route guard. |
| `src/access/policy/policy.test.ts` | 165 | Engine invariants: HR vs CHRO, role tables show home and hide dev, pay follows pay view, overrides, plain data. |
| `src/access/overrides/*` | ~1700 (index, types, guards skimmed) | Phase-2 Security center: override lines laid over tables, `GUARD_RAILS`, policy file. |
| `src/access/managerLeaks.test.ts` | 325 | Targeted Manager leaks (risk scores, decline reasons, <5 rates, unset pick, help text). |
| `src/access/managerExits.test.ts` | 649 | The crawl technique over every shown surface; source scan of `<Figure>` tags. |
| `src/access/managerScope.test.ts` | 272 | Every filter path stays in the org (context, clamp, store guard). |
| `src/access/matrix.test.ts` | 751 | Three file snapshots plus invariants plus contract GRID plus banned-words copy check. |
| `src/access/route.test.ts` | 399 | `routeDecision` for every mode x route, then a stub browser for history/notice behavior. |
| `src/access/roleItems.test.ts` | 399 (outline + tail) | Item routing per mode, routing snapshot, per-mode sample checks. |
| `src/access/store.test.ts` | 276 (head + outline) | `census:mode` v2 parse, migrate, round trip, throwing storage. |
| `src/access/scopes/clamp.test.ts`, `context.test.ts`, `entry.test.ts` | 263/276/360 (outline + key parts) | Clamp per kind with >500-combo idempotence sweep; every row in scope; every entry path. |
| `src/access/ui/pickModel.ts`, `ModeMenu.tsx`, `ScopePicker.tsx` | heads | Picker rows and grouped Mode menu (UI only). |
| `src/dev/security/copy.test.ts`, `copy.ts` | 128 / head | Banned-words scan over help and tours with the exempt list. |
| `src/help/access.test.ts` (290-330), `src/dev/roles.test.ts` (85-115) | parts | Other banned-words checks. |
| `src/data/store.ts` (140-176, 755-800) | parts | `FilterGuard`, `RouteGuard`, `setRouteGuard`, `navigate` calling the guard. |
| `src/data/context.tsx` (260-345) | part | `buildContext`: `scopeFor` then `clampFilters` then `scopeDatasets` then `applyScope`; `showPay/showCost`. |
| `docs/ROLES-V2.md` | 2036 | Parts 0, 1, 2 (incl. 2.8), 3 (incl. 3.2), 4.13, 5.1, 5.10, 8, decisions. |
| `docs/ROLES.md` 150-170 | part | 1.6: the "not security" wording rule. |
| `headcount-planner-prompt.md` | 196 | The HCP spec. |

---

## 2. Contracts (verbatim TS)

### 2.1 `src/access/modes.ts` (every per-mode table)

```ts
import type { Route, RouteView } from '@/data/store'
import type { ScopeKind } from './scopes/types'

export type Mode =
  | 'hr' | 'chro' | 'hrbp-unit' | 'hrbp-region' | 'compensation' | 'talent-management'
  | 'recruiter' | 'hr-ops' | 'finance' | 'manager' | 'developer'

/** In the order the Mode menu and Settings list them (the groups' order). */
export const MODES: readonly Mode[] = ['hr','chro','hrbp-unit','hrbp-region','compensation',
  'talent-management','recruiter','hr-ops','finance','manager','developer']
const MODE_SET: ReadonlySet<string> = new Set(MODES)
export const isMode = (v: unknown): v is Mode => typeof v === 'string' && MODE_SET.has(v)

export type ModeGroupKey = 'hr-team' | 'partners' | 'practices' | 'outside' | 'building'
export interface ModeGroup { key: ModeGroupKey; /** The muted heading in the Mode menu */ label: string; modes: readonly Mode[] }
export const MODE_GROUPS: readonly ModeGroup[] = [
  { key: 'hr-team', label: 'HR team', modes: ['hr', 'chro'] },
  { key: 'partners', label: 'HR business partners', modes: ['hrbp-unit', 'hrbp-region'] },
  { key: 'practices', label: 'HR practices', modes: ['compensation', 'talent-management', 'recruiter', 'hr-ops'] },
  { key: 'outside', label: 'Outside HR', modes: ['finance', 'manager'] },
  { key: 'building', label: 'Building Census', modes: ['developer'] },
]
export const MODE_LABEL: Record<Mode, string> = { hr: 'HR', chro: 'CHRO', 'hrbp-unit': 'HRBP for a business unit',
  'hrbp-region': 'HRBP for a region', compensation: 'Compensation', 'talent-management': 'Talent management',
  recruiter: 'Recruiter', 'hr-ops': 'HR ops', finance: 'Finance', manager: 'Manager', developer: 'Developer' }
/** The name inside a sentence, before "mode". Both HRBP modes read "HRBP". */
export const MODE_NAME: Record<Mode, string> = { ...MODE_LABEL, 'hrbp-unit': 'HRBP', 'hrbp-region': 'HRBP' }
/** The Mode button's short name under 640px. */
export const MODE_SHORT: Record<Mode, string> = { hr: 'HR', chro: 'CHRO', 'hrbp-unit': 'HRBP', 'hrbp-region': 'HRBP',
  compensation: 'Comp', 'talent-management': 'Talent', recruiter: 'Recruiter', 'hr-ops': 'HR ops',
  finance: 'Finance', manager: 'Manager', developer: 'Developer' }
export const MODE_HINT: Record<Mode, string> = {
  hr: 'Every view, the Data room and Settings, for the HR team.',
  chro: 'Every HR view, opening on the scorecard, top risks and the monthly report.',
  'hrbp-unit': 'One business unit at every location: scorecard, people, hiring and talent.',
  'hrbp-region': 'Every employee in one region, across business units.',
  compensation: 'Pay position, merit cycle, market and workforce cost.',
  'talent-management': 'Performance, succession, retention risk and learning.',
  recruiter: "One recruiter's reqs: candidates, offers and upcoming starts.",
  'hr-ops': 'Cases, transactions, leave, day-one tasks and compliance work.',
  finance: 'Headcount, hiring against plan, open reqs and cost totals.',
  manager: "One manager's org: people stats, org chart, hiring, starts and talent.",
  developer: 'Everything in HR mode, plus the Developer page and debug overlays.',
}
/** The page each mode opens on (1.1). */
export const HOME_OF: Record<Mode, RouteView> = { hr: 'scorecard', chro: 'home', 'hrbp-unit': 'home',
  'hrbp-region': 'home', compensation: 'home', 'talent-management': 'home', recruiter: 'home',
  'hr-ops': 'home', finance: 'home', manager: 'team', developer: 'dev' }

export interface RoleOverrides { home: ReadonlyMap<Mode, RouteView>; offered: ReadonlyMap<Mode, boolean> }
let roleOverrides: RoleOverrides | null = null
export function setRoleOverrides(next: RoleOverrides | null): void { roleOverrides = next }
export const homeViewOf = (mode: Mode): RouteView =>
  (mode === 'developer' ? undefined : roleOverrides?.home.get(mode)) ?? HOME_OF[mode]
export const homeOf = (mode: Mode): Route => ({ view: homeViewOf(mode), tab: '' })
export const modeOffered = (mode: Mode): boolean =>
  mode === 'developer' || roleOverrides?.offered.get(mode) !== false

/** The slug of each role home's figure ids (`home-<slug>-<thing>`); null for modes whose home is not Home. */
export const HOME_SLUG: Record<Mode, string | null> = { hr: null, chro: 'chro', 'hrbp-unit': 'hrbp',
  'hrbp-region': 'hrbp', compensation: 'comp', 'talent-management': 'talent', recruiter: 'rec',
  'hr-ops': 'ops', finance: 'fin', manager: null, developer: null }
export const SHARED_HOME_FIGURES: readonly string[] = ['home-attention-wait', 'home-attention', 'home-list']
export function isOtherHomeFigure(mode: Mode, figureId: string): boolean {
  if (!figureId.startsWith('home-') || SHARED_HOME_FIGURES.includes(figureId)) return false
  const slug = HOME_SLUG[mode]
  return !slug || !figureId.startsWith(`home-${slug}-`)
}
/** The page names a redirect toast uses: "Census opened Home instead." */
export const HOME_LABEL: Record<Mode, string> = { hr: 'the Scorecard', chro: 'Home', 'hrbp-unit': 'Home',
  'hrbp-region': 'Home', compensation: 'Home', 'talent-management': 'Home', recruiter: 'Home',
  'hr-ops': 'Home', finance: 'Home', manager: 'My team', developer: 'the Developer page' }

/** The scope kind each mode holds (2.1); null for the modes that see the whole company. */
export const SCOPE_OF: Record<Mode, ScopeKind | null> = { hr: null, chro: null, 'hrbp-unit': 'unit',
  'hrbp-region': 'region', compensation: null, 'talent-management': null, recruiter: 'reqs',
  'hr-ops': null, finance: null, manager: 'org', developer: null }

export type PickKind = 'manager' | 'unit' | 'region' | 'recruiter'
export const PICK_KINDS: readonly PickKind[] = ['manager', 'unit', 'region', 'recruiter']
export const PICK_OF: Record<Mode, PickKind | null> = { hr: null, chro: null, 'hrbp-unit': 'unit',
  'hrbp-region': 'region', compensation: null, 'talent-management': null, recruiter: 'recruiter',
  'hr-ops': null, finance: null, manager: 'manager', developer: null }
export const MODE_OF_PICK: Record<PickKind, Mode> = { manager: 'manager', unit: 'hrbp-unit',
  region: 'hrbp-region', recruiter: 'recruiter' }

/** Every pick this browser remembers (1.4). Each is kept when the mode changes. */
export interface ModePicks {
  managerId: string | null
  unit: string | null
  region: string | null
  /** `{ name: '*', id: null }` is "Every recruiter" (no reqs scope). */
  recruiter: { name: string; id: string | null } | null
}
export const NO_PICKS: ModePicks = Object.freeze({ managerId: null, unit: null, region: null, recruiter: null })
export const EVERY_RECRUITER = '*'
export function hasPick(mode: Mode, picks: Partial<ModePicks>): boolean {
  switch (PICK_OF[mode]) {
    case 'manager': return !!picks.managerId
    case 'unit': return !!picks.unit
    case 'region': return !!picks.region
    case 'recruiter': return !!picks.recruiter?.name
    default: return true
  }
}

/** `switch`: amounts and totals while "Show pay amounts" is on; `totals`: cost totals over 5+, never one person; `none`: ratios only. */
export type PayView = 'switch' | 'totals' | 'none'
export const PAY_OF: Record<Mode, PayView> = { hr: 'switch', chro: 'switch', 'hrbp-unit': 'none',
  'hrbp-region': 'none', compensation: 'switch', 'talent-management': 'none', recruiter: 'none',
  'hr-ops': 'none', finance: 'totals', manager: 'none', developer: 'switch' }
export const IMMIGRATION_OF: Record<Mode, boolean> = { hr: true, chro: true, 'hrbp-unit': false,
  'hrbp-region': false, compensation: false, 'talent-management': false, recruiter: false,
  'hr-ops': true, finance: false, manager: false, developer: true }

/** "HR mode", "HRBP: Silicon Engineering", "Recruiter: every recruiter", "Manager: Priya Raman". */
export function modeButtonLabel(mode: Mode, pick?: string | null): string {
  if (!PICK_OF[mode] || !pick) return `${MODE_NAME[mode]} mode`
  if (mode === 'recruiter' && pick === EVERY_RECRUITER) return 'Recruiter: every recruiter'
  return `${MODE_NAME[mode]}: ${pick}`
}
```

### 2.2 Scope types (`src/access/scopes/types.ts`) and `scopeFor` (`scopes/index.ts:28-84`)

```ts
export type ScopeKind = 'org' | 'unit' | 'region' | 'reqs'
interface ScopeBase {
  kind: ScopeKind
  /** For copy: "Priya Raman's org", "Silicon Engineering", "APAC", "Maya Chen's reqs". */
  label: string
  /** Active employees in the scope (org, unit, region), or candidates on the reqs (reqs). */
  size: number
}
export interface OrgScope extends ScopeBase { kind: 'org'; managerId: string; managerName: string
  /** Employee IDs in the manager's org (`subtreeIds`), the manager included, current and former. */
  orgIds: ReadonlySet<string> }
export interface UnitScope extends ScopeBase { kind: 'unit'; unit: string; memberIds: ReadonlySet<string>
  /** People whose org holds an active employee of the unit: the leader filter keeps only these. */
  leaderIds: ReadonlySet<string>
  /** Departments whose official parent (else majority unit in the data) is another unit. */
  otherDepartments: ReadonlySet<string> }
export interface RegionScope extends ScopeBase { kind: 'region'; region: string; sites: readonly string[];
  memberIds: ReadonlySet<string>; owner?: RegionOwner | null }
export interface ReqsScope extends ScopeBase { kind: 'reqs'; recruiter: string; recruiterId: string | null;
  reqIds: ReadonlySet<string>; appIds: ReadonlySet<string>; startIds: ReadonlySet<string>;
  openReqs: number; activeCandidates: number; asOf: ISODate }
export type ScopeLock = OrgScope | UnitScope | RegionScope | ReqsScope
export interface HeldScope<S extends ScopeLock = ScopeLock> { scope: S; unset: boolean }

export interface ScopeEnv { org: OrgIndex; asOf: ISODate; all: Datasets; regions?: RegionIndex | null;
  departmentParents?: ReadonlyMap<string, string | null> | null; regionOwners?: ReadonlyMap<string, string> | null;
  dedupDays?: number }
export interface ScopeResult { scope: ScopeLock | null; unset: boolean }
export function scopeFor(mode: Mode, picks: Partial<ModePicks>, env: ScopeEnv): ScopeResult
// org: heldLock(org, asOf, managerId); unit: unitScope(...) if size>0 else emptyUnitScope(unit) unset;
// region: regionScope(...) if sites.length else emptyRegionScope; reqs: reqsScope or NONE for EVERY_RECRUITER.
```

Invariant: a missing or gone pick gives an EMPTY scope of its kind (`unit: NOBODY = 'none'`, a value no record has) and `unset: true`, never the whole company. `heldLock` treats a manager leading fewer than `MIN_REPORTS = 3` active employees as unset (`scopes/org.ts:111-141`).

### 2.3 `clampFilters` (verbatim, `src/access/scopes/clamp.ts:17-128`)

```ts
import { FILTER_DIMENSIONS, type FilterDimension, type Filters, isExcluded, withMode } from '@/data/scope'

export const FILTER_DIMS_OF: Readonly<Record<Mode, readonly FilterDimension[]>> = {
  hr: FILTER_DIMENSIONS, chro: FILTER_DIMENSIONS, 'hrbp-unit': FILTER_DIMENSIONS, 'hrbp-region': FILTER_DIMENSIONS,
  compensation: FILTER_DIMENSIONS, 'talent-management': FILTER_DIMENSIONS, recruiter: FILTER_DIMENSIONS,
  'hr-ops': FILTER_DIMENSIONS, finance: ['businessUnit'], manager: FILTER_DIMENSIONS, developer: FILTER_DIMENSIONS,
}
const sameList = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((v, i) => v === b[i])

function clampOrg(f: Filters, s: OrgScope): Filters {
  if (leaderInLock(f, s)) return f
  return { ...f, leaderId: s.managerId, modes: withMode(f.modes, 'leaderId', 'include') }
}
function clampUnit(f: Filters, s: UnitScope): Filters {
  let out = f
  if (!(sameList(f.businessUnit, [s.unit]) && !isExcluded(f, 'businessUnit')))
    out = { ...out, businessUnit: [s.unit], modes: withMode(out.modes, 'businessUnit', 'include') }
  if (f.department.some((d) => s.otherDepartments.has(d))) {
    const department = f.department.filter((d) => !s.otherDepartments.has(d))
    out = { ...out, department, modes: department.length ? out.modes : withMode(out.modes, 'department', 'include') }
  }
  if (f.leaderId && !s.leaderIds.has(f.leaderId))
    out = { ...out, leaderId: null, modes: withMode(out.modes, 'leaderId', 'include') }
  return out
}
function clampRegion(f: Filters, s: RegionScope): Filters {
  const sites = pinnedSites(s)
  const excluded = isExcluded(f, 'location')
  let location: string[]
  if (excluded) {
    const out = new Set(f.location)
    const left = sites.filter((l) => !out.has(l))
    location = left.length ? left : [...sites]
  } else {
    const at = new Set(sites)
    const named = f.location.filter((l) => at.has(l))
    location = named.length ? named : [...sites]
  }
  if (!excluded && sameList(location, f.location)) return f
  return { ...f, location, modes: withMode(f.modes, 'location', 'include') }
}
function clampFinance(f: Filters): Filters {
  const buOut = isExcluded(f, 'businessUnit')
  const untouched = !f.leaderId && !f.department.length && !f.location.length && !f.level.length &&
    !Object.keys(f.modes ?? {}).length
  if (untouched) return f
  return { ...f, leaderId: null, department: [], location: [], level: [],
    businessUnit: buOut ? [] : f.businessUnit, modes: {} }
}
/** Finance's restriction applies: Finance, or any unscoped mode showing cost totals without the switch. */
export const byWholeUnits = (mode: Mode | undefined): boolean =>
  mode === 'finance' || (!!mode && payView(mode) === 'totals')

export function clampFilters(filters: Filters, scope: ScopeLock | null | undefined, mode?: Mode): Filters {
  if (scope)
    switch (scope.kind) {
      case 'org': return clampOrg(filters, scope)
      case 'unit': return clampUnit(filters, scope)
      case 'region': return clampRegion(filters, scope)
      case 'reqs': return filters
    }
  if (byWholeUnits(mode)) return clampFinance(filters)
  return filters
}
export const clamps = (scope: ScopeLock | null | undefined, mode?: Mode): boolean =>
  (!!scope && scope.kind !== 'reqs') || (!scope && byWholeUnits(mode))
export function clampReason(mode: Mode, scope: ScopeLock | null | undefined, asked: Filters, kept: Filters,
  from: 'link' | 'view' = 'link'): string | null
// e.g. "HRBP mode shows Silicon Engineering, so the link's other business units were left out."
//      "Finance mode filters by business unit and period, so the link's other filters were left out."
```

Invariants (enforced by `scopes/clamp.test.ts`): pure; idempotent (`clamp(clamp(x)) === clamp(x)` by reference); returns the SAME object when nothing changes (React and the store rely on this to avoid loops); never touches `period/customStart/customEnd`; `leaderInLock` rejects exclude mode.

Where it runs: the store's filter guard (`connect.ts:427-431`), every `setFilters`/`resetFilters` (`data/store.ts:755-766`), entering a mode (`switched`), `checkScope` on data change, and once more in `buildContext` (`data/context.tsx:299`). `buildContext` order: `scopeFor` → `clampFilters` → `scopeDatasets(all, filters, org)` → `applyScope(…, scope)`; `ctx.all` is never narrowed (company benchmarks).

### 2.4 The route guard

The route guard is `routeDecision` in `src/access/policy/index.ts:208-302` (NOT `policy/routing.ts`, which is Action center item routing). Verbatim:

```ts
export interface RouteDecision {
  route: Route
  redirected: boolean
  /** For a redirect: the toast's title and description. */
  reason?: { title: string; description: string }
}
const placeSurface = (view: string): string => (PAGE_KEYS.has(view) ? `page:${view}` : `view:${view}`)
const placeShown = (mode: Mode, view: string): boolean => can(mode, placeSurface(view))
const namedTabs = (mode: Mode, view: string): readonly RoleTab[] | null =>
  (policyOf(mode)?.tabs as Record<string, readonly RoleTab[]> | undefined)?.[view] ?? null
const hiddenPartOf = (mode: Mode, view: string, t: string): HiddenPart | undefined =>
  policyOf(mode)?.hiddenParts[`${view}.${t}`]

export function firstShownTab(mode: Mode, view: string): RoleTab | null {
  if (!placeShown(mode, view)) return null
  const tabs = namedTabs(mode, view)
  return tabs?.find((t) => can(mode, `tab:${view}.${t.key}`)) ?? null
}
export function routeShown(mode: Mode, view: string, t = ''): boolean {
  if (mode === 'developer') return true
  if (!placeShown(mode, view)) return false
  if (!t) return true
  if (hiddenPartOf(mode, view, t)) return false
  const named = namedTabs(mode, view)?.find((x) => x.key === baseTab(t))
  if (!named) return true
  return can(mode, `tab:${view}.${named.key}`)
}
export function routeDecision(mode: Mode, route: Route): RouteDecision {
  const same: RouteDecision = { route, redirected: false }
  if (mode === 'developer') return same
  if (!placeShown(mode, route.view)) {
    if (route.view === homeViewOf(mode)) return same
    return { route: homeOf(mode), redirected: true,
      reason: { title: hiddenPageTitle(placeLabel(route.view), mode), description: openedInstead(mode) } }
  }
  const tabs = namedTabs(mode, route.view)
  if (!tabs || !route.tab) return same
  const named = tabs.find((x) => x.key === baseTab(route.tab))
  const part = hiddenPartOf(mode, route.view, route.tab)
  if (part && named && can(mode, `tab:${route.view}.${named.key}`))
    return { route: { view: route.view as RouteView, tab: part.instead }, redirected: true,
      reason: { title: hiddenTabTitle(placeLabel(route.view), part.label, mode),
                description: openedTabInstead(part.insteadLabel) } }
  if (!named || can(mode, `tab:${route.view}.${named.key}`)) return same
  const first = firstShownTab(mode, route.view)
  return { route: { view: route.view as RouteView, tab: first?.key ?? '' }, redirected: true,
    reason: { title: hiddenTabTitle(placeLabel(route.view), named.label, mode),
              description: openedTabInstead(first?.label ?? placeLabel(route.view)) } }
}
```

Wiring (`src/data/store.ts:146-174, 766-777`):

```ts
export type FilterGuard = (next: Filters) => Filters
export interface RouteGuard {
  check: (route: Route) => { route: Route; notice?: () => void } | null
  /** The mode's home page. */
  home: () => RouteView
}
export function setFilterGuard(fn: FilterGuard | null): void
export function setRouteGuard(g: RouteGuard | null): void
// navigate(view, tab, opts): const checked = routeGuard?.check({ view, tab }) ?? null; route = checked?.route ?? {view,tab};
//   hintAddress(opts.history ?? 'replace'); set({ route }); if (moved) checked?.notice?.()
```

`connect.ts:432-447` registers `check(route)`: if the scoped mode is waiting for its pick and the route is not the home, return `{ route: homeOf(mode) }` silently; else `routeDecision`; on redirect return `{ route, notice: () => notify({ title, description, action: { label: 'Change mode', onClick: openModeMenu } }) }`. Because the guard sits inside `navigate`, the address writer only ever sees the redirected route: history entry replaced, Back never returns to the hidden route (asserted by `route.test.ts` with a stub `history`).

Copy used: `hiddenPageTitle(page, mode)` = `${page} is not shown in ${modeName(mode)}`; `hiddenTabTitle(view, tab, mode)` = `${view}, ${tab} is not shown in ${modeName(mode)}`; `openedInstead(mode)` = `Census opened ${homeLabelOf(mode)} instead.`; `openedTabInstead(tab)` = `Census opened ${tab} instead.`; `PLACE_LABEL` = `{ data: 'The Data room', actions: 'The Action center', dev: 'The Developer page' }`.

### 2.5 `decide(mode, surface)` and the policy data

`src/access/policy/types.ts` (verbatim):

```ts
export type Access = 'shown' | 'limited' | 'hidden'
export interface Decision {
  access: Access
  /** For limited and hidden: one plain sentence, shown in Developer > Access and the snapshot. */
  how?: string
}
export interface At { view: string; tab?: string }
export interface DecideInfo {
  /** The views a metric is listed on (`MetricDef.views`); without it only the hide lists apply. */
  metricViews?: (id: string) => readonly string[] | undefined
  /** For `kpi:<id>`: the tile's metric id. */
  metric?: string
}
export const SHOWN: Decision = Object.freeze({ access: 'shown' })
export const limited = (how: string): Decision => ({ access: 'limited', how })
export const hidden = (how: string): Decision => ({ access: 'hidden', how })
export interface RoleTab { key: string; label: string; decision: Decision }
export type PolicyPlace = ViewKey | 'home' | 'actions' | 'data' | 'dev'
export interface HiddenPart { label: string; /** "analyses:stages" */ instead: string; insteadLabel: string }
export interface RolePolicy {
  mode: Mode
  /** Every view and page; a missing one is hidden (the matrix test fails while one is missing). */
  views: Readonly<Record<PolicyPlace, Decision>>
  /** Every tab of every view this mode shows, in tab order. A tab missing here is hidden. */
  tabs: Readonly<Partial<Record<PolicyPlace, readonly RoleTab[]>>>
  /** Parts of shown tabs hidden by address (`'hrbp.analyses:quality'`); their decisions are `surfaces` entries. */
  hiddenParts: Readonly<Record<string, HiddenPart>>
  metrics: { /** When set, only metrics under these prefixes show (Recruiter, Finance). */
    allow?: readonly string[]; hidePrefixes: readonly string[]; hide: readonly string[] }
  hiddenFigures: readonly string[]
  /** Figure id prefixes hidden wherever they are drawn. */
  hiddenFigurePrefixes: readonly string[]
  /** Drill kinds whose records the mode lists. */
  drillKinds: readonly DrillKind[]
  /** Standard columns of a listed drill kind left out everywhere (`'employees.regrettable'`); how is `surfaces['column:<kind>.<key>']`. */
  hiddenColumns?: readonly string[]
  /** The decision for a listed drill kind (scoped modes: limited, rows outside the scope left out). */
  drillListed: Decision
  datasets: readonly DatasetKey[]
  /** Action center items left out by id prefix; each prefix's how is `surfaces['item:<prefix>']`. */
  hiddenItemPrefixes: readonly string[]
  articles: Readonly<Record<string, Decision>>
  tours: Readonly<Record<string, Decision>>
  /** Every other named surface (masthead, header, settings, tools, help, ask, filter, export, person, focus,
   *  shortcut, ui, org, pay, page, item, tab parts). An exact surface here wins. */
  surfaces: Readonly<Record<string, Decision>>
}
```

`src/access/policy/index.ts` (verbatim core):

```ts
export type TableMode = Exclude<Mode, 'developer' | 'hr' | 'chro'>
export const isTableMode = (mode: Mode): mode is TableMode => mode !== 'developer' && mode !== 'hr' && mode !== 'chro'
export const ROLE_POLICY: Readonly<Record<TableMode, RolePolicy>> = {
  'hrbp-unit': HRBP_UNIT_POLICY, 'hrbp-region': HRBP_REGION_POLICY, compensation: COMPENSATION_POLICY,
  'talent-management': TALENT_POLICY, recruiter: RECRUITER_POLICY, 'hr-ops': HR_OPS_POLICY,
  finance: FINANCE_POLICY, manager: MANAGER_POLICY,
}
export const policyOf = (mode: Mode): RolePolicy | null => isTableMode(mode) ? tableUnder(overrides, mode) : null

export function decideUnder(ov: PolicyOverrides | null, mode: Mode, surface: SurfaceId | string, at?: At, info?: DecideInfo): Decision {
  if (mode === 'developer') return SHOWN
  const own = ov?.get(mode)
  if (own?.size) { const o = overrideDecision(own, surface, at, info, /* view hidden? */ …); if (o) return o }
  if (mode === 'hr') return decideHr(surface, at)
  if (mode === 'chro') return decideChro(surface, at)
  return decideTable(tableUnder(ov, mode), surface, at, info)
}
export function decide(mode: Mode, surface: SurfaceId | string, at?: At, info?: DecideInfo): Decision {
  return decideUnder(overrides, mode, surface, at, info)
}
export const can = (mode: Mode, surface: SurfaceId | string, at?: At, info?: DecideInfo): boolean =>
  decide(mode, surface, at, info).access !== 'hidden'
export const policyVersion = (): number => version   // bumped by setPolicyOverrides
```

`decideTable` order (`policy/table.ts:133-191`): exact `surfaces[s]` wins; then by `kindOf(s)`:
`view`/`page` from `views` (missing = `hidden("Not named by the X mode policy.")`); `tab` from `tabs` (hidden view = `hidden("Its view is not shown in X mode.")`; an empty tab = first tab's decision; a colon part reads `surfaces['tab:v.t:part']`); `figure` hidden by `hiddenFigures`, `hiddenFigurePrefixes`, a hidden view's key prefix (`comp-…`), another role's home (`isOtherHomeFigure`), else takes its tab's decision via `at`; `metric` hidden when outside `allow`, on `hide`/`hidePrefixes`, or when none of its `metricViews` is shown; `kpi` uses `info.metric`; `data`/`data-panel` follow `views.data`; `drill` = `drillListed` if listed else hidden; `column` follows its drill kind, hidden if in `hiddenColumns`; `dataset` from `datasets`; `help` from `articles`/`tours`; `overlay` hidden; `item` shown unless a `hiddenItemPrefixes` match; `header` follows its view when the view is named; anything else `notNamed` (hidden). Tables are compiled once per object via `WeakMap`.

Example of a table with reasons (verbatim excerpt, `policy/finance.ts:23-50, 116-169`):

```ts
const NAME = 'Finance mode'
const BU_ONLY = `${NAME} filters by business unit and period only, so every cost total covers whole business units.`
const notHere = (what: string) => hidden(`${what} is not part of ${NAME}.`)
const views: Record<PolicyPlace, Decision> = {
  home: SHOWN,
  team: hidden(TEAM_HOW),
  scorecard: hidden('The scorecard judges the whole people function; Finance mode shows headcount, the plan and cost.'),
  recruiting: limited('Requisitions only, without recruiter load, hiring manager satisfaction or candidate records.'),
  …
  comp: limited("Workforce cost only: cost totals over 5 or more people, never one person's pay."),
  actions: limited('Items from the shown views; none is about one person.'),
  data: hidden(DATA_ROOM_HOW),
  dev: hidden(DEV_ONLY),
}
const tabs = tabTable(views, { comp: { overview: payPosition, ranges: payPosition, … } })
export const FINANCE_POLICY: RolePolicy = {
  mode: 'finance', views, tabs, hiddenParts: { 'hrbp.analyses:quality': { label: 'Quality of hire', instead: 'analyses:stages', insteadLabel: 'Engineering by stage' }, … },
  metrics: { allow: ['hrbp.headcount.', …, 'comp.cost.', 'actions.', 'privacy.'], hidePrefixes: [], hide: ['hrbp.attrition.exitReasons'] },
  hiddenFigures: [...], hiddenFigurePrefixes: ['hrbp-quality-', 'hrbp-declines-'],
  drillKinds: ['employees', 'requisitions', 'hiringPlan', 'budget', 'actionItems', 'actionOwners'],
  drillListed: SHOWN, datasets: ['employees', 'requisitions', 'hiringPlan', 'comp', 'budget'],
  hiddenItemPrefixes: [...PERSON_ITEMS, ...PAY_ITEMS],
  articles: articlesFor(help), tours: toursFor(help),
  surfaces: { ...frameSurfaces({ mode: 'finance', views }),
    'dataset:comp': hidden('Read only for cost totals over 5 or more people, so Ask and the inventory never list it.'),
    'filter:leader': hidden(BU_ONLY), 'filter:exclude': hidden(BU_ONLY), 'filter:lens': hidden('The quality lens is off in this mode.'),
    'export:records': limited('The rows the panel lists, without amounts.'), … },
}
```

`kit.ts` helpers: `tabTable(views, named)` builds every tab of every shown view in registry order, shown unless named; it THROWS on a named tab the view lacks (typo fails at load). `frameSurfaces(spec)` returns ~110 masthead/header/settings/tools/help/ask/filter/export/person/focus/shortcut/pay decisions, each with its sentence, parameterized by `scope?: { words, askOff, button, change }` and `dataOwner?`. `articlesFor`/`toursFor` decide help per view visibility.

### 2.6 Pay (`src/access/pay.ts`, verbatim)

```ts
export const payView = (mode: Mode): PayView =>
  (mode === 'developer' ? undefined : payOverrides?.get(mode)) ?? PAY_OF[mode]
export const showPayIn = (mode: Mode, switchOn: boolean): boolean => payView(mode) === 'switch' && switchOn
/** A scoped mode never shows totals without the switch (its scope can be narrowed in ways whole business units cannot). */
export const showCostIn = (mode: Mode, switchOn: boolean): boolean =>
  showPayIn(mode, switchOn) || (payView(mode) === 'totals' && !SCOPE_OF[mode])
export const showImmigrationIn = (mode: Mode, switchOn: boolean): boolean => IMMIGRATION_OF[mode] && switchOn
export type PaySurface = 'pay:amounts' | 'pay:totals' | 'pay:switch'
export function payDecisions(mode: Mode): Readonly<Record<PaySurface, Decision>> {
  switch (PAY_OF[mode]) {
    case 'switch': return { 'pay:switch': SHOWN, 'pay:amounts': SHOWN, 'pay:totals': SHOWN }
    case 'totals': return {
      'pay:switch': hidden('Finance mode shows cost totals without a switch.'),
      'pay:amounts': hidden("Finance mode never shows one person's pay."),
      'pay:totals': limited('Totals over 5 or more people, by whole business units.') }
    default: return {
      'pay:switch': hidden('This mode shows ratios only.'),
      'pay:amounts': hidden('This mode shows ratios only.'),
      'pay:totals': hidden('This mode shows ratios only.') }
  }
}
```

Context: `ctx.showPay = showPayIn(mode, args.showPay)`, `ctx.showCost = showCostIn(mode, args.showPay)`. Columns carry `pay?: true` (one person's amount) or `cost?: true` (a group total); `visibleColumns` drops them in tables, CSV, Excel, slides. The switch state lives in memory in the app store (`setShowPay`, never persisted: session-only) and every mode change sets it false (`connect.ts:330`).

### 2.7 `ctx.access` (`src/access/context.ts`, verbatim)

```ts
export interface AccessContext {
  mode: Mode
  scope: ScopeLock | null
  /** @deprecated Manager's org scope */
  lock: OrgScope | null
  /** A scoped mode without a usable pick: the scope holds nobody, so every view is empty until one is picked. */
  unset: boolean
  pay: PayView
  decide: (surface: SurfaceId | string, at?: At, info?: DecideInfo) => Decision
  can: (surface: SurfaceId | string, at?: At, info?: DecideInfo) => boolean
}
export interface AccessInput { mode: Mode; picks?: Partial<ModePicks>; /** @deprecated */ managerId?: string | null }
export function accessFor(mode: Mode, scope: ScopeLock | null = null, metrics: MetricLookup = null, unset = false): AccessContext
// memo key: `${mode}|${scopeKey(scope)}|${unset}|${policyVersion()}` per metrics dictionary (WeakMap)
export const HR_ACCESS: AccessContext = accessFor('hr')
```

Hooks read `useAnalytics().access`, never the mode store, so an off-screen render (export, scan) with its own `access` prop gets its own answers. `numbers.ts`: `kpisInMode(access, kpis)` drops tiles whose `metricId` is hidden; `findingsInMode` also filters `people` with `personInScope`.

### 2.8 Surfaces (`src/access/surfaces.ts:11-145`)

```ts
export type SurfaceId = string & { readonly __surface: true }
export const surface = (id: string): SurfaceId => id as SurfaceId
export const kindOf = (s: string): string => { const i = s.indexOf(':'); return i < 0 ? s : s.slice(0, i) }
export const restOf = (s: string): string => { const i = s.indexOf(':'); return i < 0 ? '' : s.slice(i + 1) }
export const S = {
  view: (key) => surface(`view:${key}`), tab: (view, tab) => surface(`tab:${view}.${tab}`),
  figure: (id) => surface(`figure:${id}`), metric: (id) => surface(`metric:${id}`), kpi: (id) => surface(`kpi:${id}`),
  page: (page: 'data' | 'actions' | 'dev') => surface(`page:${page}`), data: (tab) => surface(`data:${tab}`),
  dataPanel: (p) => surface(`data-panel:${p}`), settings: (s) => surface(`settings:${s}`), tool: (id) => surface(`tools:${id}`),
  article: (id) => surface(`help:article:${id}`), tour: (id) => surface(`help:tour:${id}`), help: (part) => surface(`help:${part}`),
  ask: (tool?) => surface(tool ? `ask:${tool}` : 'ask'), filter: (c) => surface(`filter:${c}`), header: (w) => surface(`header:${w}`),
  export: (k) => surface(`export:${k}`), drill: (k) => surface(`drill:${k}`), column: (k, key) => surface(`column:${k}.${key}`),
  focus: (w) => surface(`focus:${w}`), dataset: (k) => surface(`dataset:${k}`), person: (p) => surface(`person:${p}`),
  masthead: (c) => surface(`masthead:${c}`), shortcut: (k) => surface(`shortcut:${k}`), overlay: (k) => surface(`overlay:${k}`),
  org: (p) => surface(`org:${p}`), item: (prefix) => surface(`item:${prefix}`), pay: (p) => surface(`pay:${p}`), ui: (p) => surface(`ui:${p}`),
} as const
```

### 2.9 Mode store (`src/access/store.ts`)

```ts
export const MODE_KEY = 'census:mode'
export interface StoredMode extends ModePicks { v: 2; mode: Mode }
const HR: StoredMode = Object.freeze({ v: 2, mode: 'hr', ...NO_PICKS }) as StoredMode
/** The stored value as version 2, or HR for anything missing, corrupt or unknown. */
export function parseStoredMode(raw: string | null | undefined): StoredMode {
  if (!raw) return HR
  try {
    const v = JSON.parse(raw) as Record<string, unknown> | null
    if (!v || typeof v !== 'object' || (v.v !== 1 && v.v !== 2) || !isMode(v.mode)) return HR
    if (v.v === 1 && v.mode !== 'hr' && v.mode !== 'manager' && v.mode !== 'developer') return HR
    const managerId = typeof v.managerId === 'string' && v.managerId ? v.managerId : null
    if (v.v === 1) return { v: 2, mode: v.mode, managerId, unit: null, region: null, recruiter: null }
    return { v: 2, mode: v.mode, managerId, unit: text(v.unit), region: text(v.region), recruiter: recruiterOf(v.recruiter) }
  } catch { return HR }
}
export type ModePick =
  | { kind: 'manager'; id: string } | { kind: 'unit'; unit: string }
  | { kind: 'region'; region: string } | { kind: 'recruiter'; name: string; id: string | null }
export interface ModeState {
  mode: Mode; picks: ModePicks; picking: PickKind | null; pickNote: string | null; menuOpen: boolean
  setMenuOpen(open: boolean): void
  /** A mode that needs a pick it does not have opens its picker and keeps the current mode. */
  setMode(mode: Mode): void
  /** Make (or change) a pick and enter its mode. */
  choose(pick: ModePick): void
  openPicker(kind: PickKind, note?: string | null): void; cancelPick(): void; reload(): void
  chooseManager(employeeId: string): void; managerId: string | null
}
export const useMode = create<ModeState>(…)   // reads storage ONCE at module creation; writes `{ v: 2, mode, ...picks }` on change
window.addEventListener('storage', (e) => { if (e.key === MODE_KEY || e.key === null) useMode.getState().reload() })
```

Every storage access is in try/catch; the stored mode is not in the address and not in the settings file; `e.key === null` (another tab cleared storage) falls back to the default.

### 2.10 Items (Action center per mode, `src/access/items.ts`)

```ts
export function itemShown(access: Pick<AccessContext, 'can'>, item: ActionItem): boolean  // view, tab, subject kind, drill kind, `item:<id>` prefix
export function itemsShown<T extends ActionItem>(access: Pick<AccessContext, 'can' | 'mode'>, items: readonly T[]): T[]
export function itemInScope(access: Pick<AccessContext, 'scope' | 'lock'>, item: ActionItem): boolean
export interface RoleLens { mode: Mode; me: { id: string | null; name: string } | null; asOf: ISODate; escalationDays: number }
export interface RoleLists<T> { listed: T[]; needs: T[]; waiting: T[]; left: number }
export function roleItems<T extends RoutedItem>(items: readonly T[], lens: RoleLens): RoleLists<T>
// policy/routing.ts: export interface RouteRule { kinds?; owners?; me?; escalation?; severities?; site?; person?; list: 'needs' | 'waiting' }
// export const ROUTING: Readonly<Record<Mode, ModeRouting>>  (plain data; first matching rule wins)
```

---

## 3. Patterns and conventions

1. **One pure answer.** Every UI/engine decision goes through `decide(mode, surface, at?, info?)` via `ctx.access.decide/can` or `useCan`. Components never read the mode store for gating. Figures self-gate: `<Figure id metric>` asks `S.figure(id)` at `{view, tab}` and `S.metric(metric)` and renders/registers/exports nothing when hidden.
2. **Allowlists for role modes.** A table names every view and page; anything unnamed is hidden with an automatic sentence ("Not named by the Finance mode policy."). A new view or tab fails the matrix test until every table decides it. Denylist only for the full modes (HR, CHRO) and Developer.
3. **Every limited or hidden decision carries one plain sentence (`how`)**, worded for the mode, sentence case, ends with a full stop, no em dash, no banned word. Tests enforce all four.
4. **Policy tables are plain data** (`JSON.parse(JSON.stringify(t))` equals `t`, `policy.test.ts:162`), built with `kit.ts` helpers but containing no functions, so overrides can be laid on top and the tables can be listed in docs.
5. **The policy never imports the view registry.** Tab lists are duplicated in `kit.ts VIEW_TABS`; `matrix.test.ts` keeps them equal to `VIEWS` (with a `PLANNED_TABS` escape hatch).
6. **Figure ids are `<view>-<thing>`**; role-home figures are `home-<slug>-<thing>`; a hidden view hides every figure with its key prefix, wherever drawn (Ask charts included).
7. **Scopes are expressed as filter values** where possible (org → leader, unit → businessUnit, region → location), so every dataset follows them through the one `scopeDatasets`; only `reqs` narrows after (`applyScope`). Emptying unread datasets is a "second line of defense".
8. **Empty scope, never company.** Unset picks pin a value no record has (`NOBODY = 'none'`); `ctx.access.unset` drives the home's empty state and the picker.
9. **Mode change side effects** (`connect.ts switched`): not a history entry; pay and immigration switches off; Finance/Manager lose the lens and get the saved data standard; the clamp runs with history `replace`; the route guard moves a hidden route home; the records panel closes; a toast `{Mode button text}` with `NOT_SECURITY_SHORT`, or "The filters still show {scope}." with a "Whole company" action when leaving a scope, or `FINANCE_FILTERS_NOTE` entering Finance.
10. **Copy lives in `copy.ts`**, functions for sentences with values ("`Outside ${scope}.`"), and is tested for em dashes and banned words.
11. **Small groups (ROLES-V2 2.8):** rates, averages and shares over fewer than 5 people are hidden; breakdowns fold small groups into "Other (k)"; Exclude never leaves out 1 to 4 people; a scope under 5 shows counts and lists with every rate "—" and the home note `smallScopeNote`.
12. **Cost guard (ROLES-V2 3.2):** min 5 costed people per amount; no subtraction (fold the smallest group into Other until Other ≥ 5); Finance whole business units only (clamp) with rule 2 run inside each unit; drills open people without amounts; exports carry only shown rows plus the Finance line; text never holds an amount (amounts go in `ActionItem.amount`, a `pay: true` column); Ask never returns amounts; Finance rounds down to $0.1M per business unit then `sumRounded` adds $0.1M per two parts ≥ $0.1M. `costLp.test.ts` is the LP attacker.
13. **Tests that enforce what:**
    - `matrix.test.ts`: snapshots (`access-matrix.txt`, `access-how.txt`, `access-hidden-kinds.txt`), Developer all shown, HR = Developer minus dev/home/role lists, CHRO = HR plus its home, every table names every view/page/tab, hidden ids exist in source, hidden metric ids exist in catalog, drill kinds come from the mode's datasets, pay surfaces follow `PAY_OF`, the contract GRID per role, tours keep ≥ 3 steps, copy plain.
    - `route.test.ts`: `routeDecision` = the spec's expected function for every mode x every route/tab; redirect never lands on a hidden route; never redirects a home; history replace and Back.
    - `policy.test.ts`: engine invariants and plain data.
    - `scopes/*.test.ts` + `managerScope.test.ts`: clamp idempotence and every entry path stays inside.
    - `managerLeaks.test.ts`, `managerExits.test.ts`: leak crawls with HR controls.
    - `store.test.ts`: storage format and migration.
    - `roleItems.test.ts`: routing snapshot and per-mode item rules.

### 3.1 `NOT_SECURITY_SHORT` and the banned-words tests

```ts
export const NOT_SECURITY_SHORT = 'Modes change what Census shows, not who can see the data.'
export const NOT_SECURITY_LONG =
  'Modes shape Census for how you use it. They are not security: anyone using Census can switch modes, and every mode reads the same data in this browser. Share Census and its files only with people who may see all of it.'
/** Words no copy may use about modes (docs/ROLES.md, 1.6). */
export const BANNED_MODE_WORDS: readonly string[] = [
  'access', 'permission', 'restricted', 'secure', 'locked down', 'authorized', 'role-based access',
]
```

Used verbatim: Mode menu foot (`ui/ModeMenu.tsx:169`), Settings > Mode intro (`ModeSection.tsx:25`), the mode-entry toast description (`connect.ts:378,383`), the `modes` help article (`help/articles/start.ts:899`).

The tests (five places, two matching styles):

| Test | What it scans | Match | Skips |
|---|---|---|---|
| `src/access/matrix.test.ts:736-750` | `NOT_SECURITY_SHORT`, `NOT_SECURITY_LONG`, every decision `how` in every mode, every table tab `how`, every `hiddenParts` label | `text.toLowerCase().includes(w)` (substring), plus no `—`, plus `/^["'0-9A-Z]/` | none |
| `src/dev/security/copy.test.ts:31-108` | every help article (title, summary, body blocks split into sentences) and every tour (title, summary, steps) sentence that mentions `\b(mode|modes|role|roles)\b`; every override `how` | `new RegExp('\\b' + w, 'i')` after removing `access-policy.json` | articles `security-center` and `developer-tools` (`BANNED_WORDS_EXEMPT.articles` plus the extra id); folders `dev/security/` and `access/overrides/` (`BANNED_WORDS_EXEMPT.folders`, `src/dev/security/copy.ts:14-19`) |
| `src/help/access.test.ts:299-316` | articles `modes`, `view-home`, `privacy-pay`; tours `home-start`, `view-home` | substring, lowercase, plus no `—` | none |
| `src/dev/roles.test.ts:96-105` | `pickPrompt(mode)` text | substring | none |
| `src/lib/export/money.test.ts:111` | export meta lines per mode | substring | none |

Note: "security" is NOT banned (only "secure"), so "They are not security" passes; "access" is banned as a substring in copy, so "accessible" would fail the matrix check.

### 3.2 "Acting as" in Census

Census has no "Acting as". Its nearest equivalents: (a) the per-mode pick (`PICK_OF`, `ModePicks`, `ScopePicker`), worded "Pick yourself." for Manager and Recruiter, remembered in `census:mode`; (b) Developer-only "Scan as role" (`src/dev/scan.ts`, with `previewLeaderId`) and the Security center's "Preview as" (`overrides/state.ts`), which lay out a page under another mode's `access` prop. `reportModeLine` never names the picked manager or recruiter ("manager set, name left out"). HCP must design Acting as (section 5.3).

---

## 4. Tests to port

| Census test | What it asserts | HCP adaptation |
|---|---|---|
| `src/access/store.test.ts` | v2 round trip of every mode and pick; v1 migrates; corrupt/unknown/missing is HR; throwing storage still works; picks kept across mode changes; picker opens when a mode lacks its pick; not in the settings file; Clear everything removes it; another tab followed via `reload`. Technique: `vi.resetModules()` + `vi.stubGlobal('localStorage', new MemoryStorage())` + dynamic `import('./store')` (the store reads storage at creation). | `headcount-planner/src/access/store.test.ts` over `hcp:mode` `{ v: 1, ... }` (start at version 1; no migration). Add: Acting as kept per mode; writes refused while Acting as is unset; default is HR admin. |
| `src/access/scopes/clamp.test.ts` | Per kind rules; >500-combination sweep (every dim, inside/outside values, include/exclude, leaders on both sides) proving idempotence, same object, period untouched; `clampReason` wording. | `scopes/clamp.test.ts` for `tree` (Manager, Leader), `unit` (HRBP), Finance restriction (unit, cost center, legal entity, country, currency kept; leader, department, location, level cleared), HR admin untouched. Keep the generator sweep. |
| `src/access/scopes/context.test.ts` | Every row of every dataset in `ctx.data` is in scope; `ctx.all` untouched; missing/gone pick holds nobody; records guard per kind; `showPay/showCost` per mode. | Same over positions, assignments, plan lines, requests, reqs, targets: every row in the tree/unit. Add `showRounded` for HRBP/Leader and leave visibility per mode. |
| `src/access/scopes/entry.test.ts`, `managerScope.test.ts` | Every way into the filters (enter mode, setFilters, reset, opening address, address with exclude, saved view at company scope, Filter to, Leave out, Ask resolveFilters, Back, Forward) stays inside; mode change turns switches off; leaving toast. Uses a `vi.hoisted` stub browser (MemoryStorage, fake history/location/window) set before imports. | Port both into one `scopes/entry.test.ts` per mode (no Ask in Phase 1). |
| `src/access/route.test.ts` | `routeDecision(mode, r)` equals an independently written `expected(mode, r)` for every mode x every route and tab, plus deep addresses; redirect reason title matches `/is not shown in/`; never redirect a home; then over the stub browser: redirect replaces the entry, Back never returns, scoped mode with no pick shows only home and opens the picker; `HOME_OF` equality. | Same over HCP `ROUTE_VIEWS` (home, plan, requests, forecast, targets, finance, whatif, actions, data, audit) and every tab, for five modes. Stub host `http://hcp.test/`. |
| `src/access/policy/policy.test.ts` | HR vs CHRO; role tables show home, Mode button, Settings > Mode, hide dev and other homes; pay surfaces follow pay view; overrides (Phase 2); tables are plain data. | `policy/policy.test.ts`: "a decision for every surface, action and mode" (spec): for every inventory surface and every `action:` id, `decide(mode, s)` returns a `Decision` with `how` when not shown; table JSON round trip; pay and leave surfaces follow `PAY_OF`/`LEAVE_OF`. Drop overrides until Phase 2. |
| `src/access/matrix.test.ts` | Three file snapshots; invariants listed in 3.13; the contract `GRID` (surface then one letter per mode) checked against `decideTable`; banned words. | Port wholesale: `access-matrix.txt` columns `Adm HRBP Lead Fin Mgr`; `access-how.txt`; `access-hidden-kinds.txt`; the GRID becomes the spec's Visibility section (and `docs/PLAN.md` repeats it). Add an `action:` block to the grid. |
| `src/access/managerExits.test.ts` | The crawl: a `Crawl` class collects every string from every shown surface (view headlines, summary KPIs and findings and their drill tables via `buildDrillTable`, tab models, home, Action center lists and copied notes, person cards, Ask tools/descriptions/suggestions, help articles/glossary/tours, metric dictionary), records a hit when a banned pattern or a real reason value appears, asserts `read > 2000` (not vacuous) and `hits == []` for three org sizes, then runs HR on the same org and asserts hits exist (control). Also scans `.tsx` source tags (`<Figure|Section|Stat|LinkedSurvey`) on shown views for banned words unless hidden by id or gated by a named check (`GATED`). Windows: `relative(...).replaceAll(BACKSLASH, '/')`. Timeouts 120 000 ms. | Basis for HCP's per-mode leak tests (section 5.6): same crawler, plus exports, workspace file and comments. |
| `src/access/managerLeaks.test.ts` | Targeted: no risk score keys/labels in columns, export rows or drills (`RISK_KEY` regex on column keys); manager's own records stay with HR; no decline reasons; org under 5 shows no rate; unset manager means `ctx.data.employees == []` and scope label "No manager picked"; help/search/glossary/report-a-problem say only what the mode shows. Each with an HR control. | `access/leaks.manager.test.ts`: no amount-like column keys (`/salary|offer|cost|amount|usd|rate/i`) in Manager drills and exports; Manager C sees nothing of the elimination; unset Acting as holds nobody. |
| `src/access/roleItems.test.ts` | Routing per mode; routing snapshot `access-routing.txt` (kind x mode letters); Finance lists no person item; needs + waiting + left = collected. | Port for HCP Actions item kinds (requests waiting 5+ days, managers not submitted, Planned seats near start with no req, reconciliation exceptions, frozen-req exceptions, `backfill-new-position`). |
| `src/dev/security/copy.test.ts` (banned words part) | Help and tours free of banned words where they speak of modes; exempt list. | `help/copy.test.ts` with `BANNED_WORDS_EXEMPT = { articles: ['about-server'] }` (spec), no folders in Phase 1. |

---

## 5. HCP adaptation

### 5.1 Files (paths under `headcount-planner/`)

```
src/access/
  modes.ts          Mode (5), MODES, MODE_GROUPS, MODE_LABEL/NAME/SHORT/HINT, HOME_OF, HOME_LABEL, HOME_SLUG,
                    SCOPE_OF, PICK_OF, ActingAs, ModePicks, PAY_OF, LEAVE_OF, modeButtonLabel
  copy.ts           NOT_SECURITY_SHORT/LONG, BANNED_MODE_WORDS (+ BANNED_HASH_WORDS), toasts, PICKER_COPY, export lines
  surfaces.ts       S (+ S.action, S.leave; minus ask, overlay, org)
  pay.ts            payView, showPayIn, showCostIn, showRoundedIn, payDecisions, leaveDecisions
  context.ts        AccessContext (+ actingAs), accessFor
  hooks.ts          useAccess, useScope, useActingAs, useDecision, useCan
  store.ts          useMode at `hcp:mode` v1
  connect.ts        filter, route and standard guards; checkScope; switched()
  numbers.ts        kpisInMode, findingsInMode
  items.ts          itemShown, itemsShown, itemInScope, lensOf, roleItems
  matrix.ts         AccessInventory (+ actions), accessMatrix, matrixText, howText, MODE_COLUMN
  visibility.ts     NEW: requestVisibleTo(request, actor, mode), auditVisibleTo, commentVisibleTo (person-level rules)
  scopes/  types.ts (TreeScope, UnitScope), tree.ts, unit.ts, clamp.ts, apply.ts, records.ts, label.ts, pickers.ts, index.ts (scopeFor)
  policy/  types.ts, table.ts, kit.ts, index.ts (decide, ROLE_POLICY, routeDecision), manager.ts, hrbp.ts, leader.ts,
           finance.ts, admin.ts, routing.ts (Actions item routing)
  ui/      ModeButton.tsx, ModeMenu.tsx, ActingAsPicker.tsx (generalized ScopePicker), ModeSection.tsx, pickModel.ts
  __snapshots__/ access-matrix.txt, access-how.txt, access-hidden-kinds.txt, access-routing.txt
  *.test.ts         store, matrix, route, policy, roleItems, leaks.manager, leaks.modes, scopes/*
```

Renames: `census:mode` → `hcp:mode`; "Census opened X instead." → `${APP_NAME} opened X instead.` (import `APP_NAME` so no "census" literal reaches `src/`); `MODE_GROUPS` loses "Building Census"; `useCensus` → `usePlanner`; `POLICY_FORMAT 'census-access-policy'` → `'hcp-access-policy'` when Phase 2 lands; test stub host `census.test` → `hcp.test`.

### 5.2 Proposed HCP Mode table

```ts
export type Mode = 'hr-admin' | 'hrbp' | 'leader' | 'finance' | 'manager'
export const MODES: readonly Mode[] = ['hr-admin', 'hrbp', 'leader', 'finance', 'manager']
export const MODE_GROUPS: readonly ModeGroup[] = [
  { key: 'hr', label: 'HR', modes: ['hr-admin', 'hrbp'] },
  { key: 'business', label: 'Leaders and managers', modes: ['leader', 'manager'] },
  { key: 'finance', label: 'Finance', modes: ['finance'] },
]
export const MODE_LABEL: Record<Mode, string> = { 'hr-admin': 'HR admin', hrbp: 'HRBP', leader: 'Leader', finance: 'Finance', manager: 'Manager' }
export const MODE_NAME = MODE_LABEL
export const MODE_SHORT: Record<Mode, string> = { 'hr-admin': 'Admin', hrbp: 'HRBP', leader: 'Leader', finance: 'Finance', manager: 'Manager' }
export const MODE_HINT: Record<Mode, string> = {
  'hr-admin': 'Everything, the Data room and imports, with pay amounts behind a switch.',
  hrbp: "One business unit's plan and cycle: positions, requests, approvals and transfers.",
  leader: 'Your org against its target: approvals, sub-org targets and What if.',
  finance: 'The whole company: targets, assumptions, FX, freezes, cycles, close and locks.',
  manager: "Your team's roles: get them approved and filled, and see what is left.",
}
// RouteView = ViewKey | 'actions' | 'data' | 'audit';  ViewKey = 'home'|'plan'|'requests'|'forecast'|'targets'|'finance'|'whatif'
export const HOME_OF: Record<Mode, RouteView> = { 'hr-admin': 'data', hrbp: 'home', leader: 'home', finance: 'home', manager: 'home' }
export const HOME_LABEL: Record<Mode, string> = { 'hr-admin': 'the Data room', hrbp: 'Unit plan', leader: 'Rollup vs target', finance: 'Plan vs actual', manager: 'My team' }
export const HOME_SLUG: Record<Mode, string | null> = { 'hr-admin': null, hrbp: 'hrbp', leader: 'lead', finance: 'fin', manager: 'mgr' }
// SHARED_HOME_FIGURES = ['home-attention-wait', 'home-attention', 'home-list']; isOtherHomeFigure unchanged

export type ScopeKind = 'tree' | 'unit'
export const SCOPE_OF: Record<Mode, ScopeKind | null> = { 'hr-admin': null, hrbp: 'unit', leader: 'tree', finance: null, manager: 'tree' }
// Leader whose leaderLevel is company (CEO, CFO, CHRO): scopeFor returns { scope: null, unset: false }, like "Every recruiter".

/** Who the person using the app is acting as: drives scope (Manager, Leader), unit (HRBP), audit `by`, approvals, request visibility. */
export interface ActingAs { personId: string; name: string; /** HRBP only: the unit they support. */ unit?: string }
export type PickKind = Mode                       // one Acting as list per mode
export const PICK_OF: Record<Mode, PickKind> = { 'hr-admin': 'hr-admin', hrbp: 'hrbp', leader: 'leader', finance: 'finance', manager: 'manager' }
export type ModePicks = Readonly<Record<Mode, ActingAs | null>>
export const NO_PICKS: ModePicks = Object.freeze({ 'hr-admin': null, hrbp: null, leader: null, finance: null, manager: null })
/** Scoped modes block every view until picked (Census rule); unscoped modes read without a pick but refuse writes. */
export const PICK_BLOCKS_READS: Record<Mode, boolean> = { 'hr-admin': false, hrbp: true, leader: true, finance: false, manager: true }

export type PayView = 'switch' | 'exact' | 'rounded' | 'none'
export const PAY_OF: Record<Mode, PayView> = { 'hr-admin': 'switch', finance: 'exact', hrbp: 'rounded', leader: 'rounded', manager: 'none' }
// If the user answers question 3 "heads and ratios only": hrbp and leader become 'none'.
export type LeaveView = 'switch' | 'counts' | 'none'
export const LEAVE_OF: Record<Mode, LeaveView> = { 'hr-admin': 'switch', hrbp: 'counts', leader: 'counts', finance: 'none', manager: 'none' }

export function modeButtonLabel(mode: Mode, pick?: ActingAs | null): string
// "HR admin: Ana Ruiz", "HRBP: Silicon Engineering", "Leader: Dana Ito", "Finance: Ola Berg", "Manager: Priya Raman";
// waiting for a pick: "HRBP mode". The menu shows "Acting as {name}" under the checked choice with "Change…".
```

Acting as candidates (pure `pickers.ts`): Manager = anyone who holds a position that is `managerPositionId` of at least one position (spec "their tree, any size": `MIN_REPORTS = 1`, so Manager C qualifies); HRBP = the Units list's HRBP column (`unit → personId`), one row per unit ("Silicon Engineering · Ana Ruiz"); Leader = `leaderLevel` Director+ or named in Lists, CEO/CFO/CHRO flagged "whole company"; Finance and HR admin = people on a Lists role column (else anyone active), with the sample persona first. The sample README names one persona per mode plus Manager C and the "team of 3" manager the leak test uses.

Store: `hcp:mode` = `{ "v": 1, "mode": "hrbp", "actingAs": { "hr-admin": {...}|null, "hrbp": { "personId": "E…", "name": "…", "unit": "Silicon Engineering" }, … } }`. Parser: missing/corrupt/unknown → `{ v: 1, mode: 'hr-admin', actingAs: NO_PICKS }`; drop a malformed pick; keep every pick across mode changes; follow other tabs via `storage` event (`e.key === MODE_KEY || e.key === null`).

Acting as is a pick, not sign-in: `NOT_SECURITY_SHORT` already says so ("Modes, Acting as and approvals change what Headcount Planner shows, not who can see the data."). `reportModeLine` names the mode and unit, never the person.

### 5.3 Scopes and clamp for HCP

```ts
export interface TreeScope extends ScopeBase {
  kind: 'tree'
  rootPersonId: string; rootName: string
  /** The acting person's own positions (the roots). */
  rootPositionIds: ReadonlySet<string>
  /** Every position under the roots via managerPositionId, roots included, effective at as-of. */
  positionIds: ReadonlySet<string>
  /** People assigned to those positions (current and former), for the person card guard. */
  personIds: ReadonlySet<string>
  /** Direct sub-orgs (each direct report position's subtree), for Leader targets and $0.1M floors. */
  subOrgs: readonly { positionId: string; label: string; positionIds: ReadonlySet<string> }[]
}
export interface UnitScope extends ScopeBase { kind: 'unit'; unit: string; positionIds: ReadonlySet<string>;
  personIds: ReadonlySet<string>; otherDepartments: ReadonlySet<string>; leaderIds: ReadonlySet<string> }
export type ScopeLock = TreeScope | UnitScope
```

- `clampTree` = Census `clampOrg` over the position tree (leader filter must be the root or inside, include only).
- `clampUnit` = Census `clampUnit` verbatim (business unit pinned, other units' departments and leaders dropped).
- `clampFinance` keeps `businessUnit, costCenter, legalEntity, country, currency` (include only), `version`, `period`; clears `leaderId, department, location, level` and every exclude. `FILTER_DIMS_OF.finance = ['businessUnit','costCenter','legalEntity','country','currency']`.
- HRBP and Leader keep every filter, but cost figures show only when the filters other than period are whole departments (HRBP) or whole direct sub-orgs (Leader): `costFiltersWhole(filters, scope, mode)`; otherwise "—" with the note "Cost shows for whole departments and the period. Clear the other filters to see it." (spec 3.2 (b)). Do NOT reuse Census `byWholeUnits` for them: it would strip their filters.
- `applyScope` has no work in HCP (both kinds are filter-expressible); keep the function as a no-op hook only if a later kind needs it.

### 5.4 Proposed `ROLE_POLICY` layout

Make all five modes tables (one engine, every mode is plain data repeated in `docs/PLAN.md`):

```ts
export const ROLE_POLICY: Readonly<Record<Mode, RolePolicy>> = {
  'hr-admin': ADMIN_POLICY, hrbp: HRBP_POLICY, leader: LEADER_POLICY, finance: FINANCE_POLICY, manager: MANAGER_POLICY,
}
export function decide(mode: Mode, surface: SurfaceId | string, at?: At, info?: DecideInfo): Decision {
  return decideTable(ROLE_POLICY[mode], surface, at, info)
}
// RolePolicy gains: actions: Readonly<Record<ActionId, Decision>>  (or `action:<id>` keys in `surfaces`; then decideTable's
// default `notNamed` makes an unnamed action hidden, which is the safe default). Drop: hiddenParts (no colon sub-tabs yet),
// ask surfaces, overlays.
```

`ADMIN_POLICY` is `fullTable('hr-admin')` from `kit.ts`: every view, tab, page, surface and action SHOWN except `view:home` (`hidden('HR admin opens on the Data room. Home is the first page of the other modes.')`) and the role-home figures; `pay:*` from `payDecisions('hr-admin')`. Alternative (Census-faithful): keep HR admin as a denylist `decideAdmin` like `decideHr`; then the matrix invariant "HR admin differs from all-shown only on the home surfaces" replaces Census's HR-vs-Developer invariant.

Views and tabs (letters S shown, L limited, H hidden), from the spec's Visibility section, with a sentence on each L/H:

| Surface | Adm | HRBP | Lead | Fin | Mgr | Note on the L/H sentence |
|---|---|---|---|---|---|---|
| view:home | H | S | S | S | S | Adm: opens on the Data room |
| view:plan | S | L | L | L | L | scope; Fin: Filled-seat cost columns hidden |
| tab:plan.overview | S | S | S | S | H | Mgr: "Plan overview is for HRBPs, leaders and Finance." |
| tab:plan.positions | S | L | L | L | L | Mgr: "No cost columns."; others: per-position cost only for Open and Planned band estimates |
| tab:plan.openings | S | L | L | S | L | in the tree or unit |
| tab:plan.transfers | S | L | L | H | L | Fin: "Transfers are processed by HRBPs." Mgr: names show, amounts don't |
| view:requests | S | L | L | L | L | |
| tab:requests.queue | S | L | L | S | H | Mgr: "The queue is for approvers past the manager step." |
| tab:requests.new | S | S | S | H | S | Fin: "Finance does not raise requests." |
| tab:requests.mine | S | S | S | S | S | |
| tab:requests.approvals | S | L | L | L | L | Mgr: "Requests you approve as a manager's manager." |
| tab:requests.cycle | S | L | L | S | L | Mgr: your ranked asks |
| view:forecast | S | L | L | S | H | HRBP/Lead: cost under the guard |
| view:targets | S | L | L | S | H | |
| view:whatif | S | S | S | S | H | Mgr: "What if is for HRBPs, leaders and Finance." (see 6) |
| view:finance | S | L | H | S | H | HRBP: versions, freezes, bands read only; Lead: "Finance settings are Finance's." |
| tab:finance.export | S | H | H | S | H | HRBP: "Finance > Export is Finance's and HR admin's." |
| page:actions | S | L | L | L | L | items from shown views, inside the scope |
| page:data | S | H | H | H | H | "The Data room is HR admin's." |
| page:audit | S | L | L | L | H | "Scoped; pay and cost changes read 'changed'." |
| pay:switch / amounts | S/S | H/H | H/H | H/H | H/H | |
| pay:totals (exact) | S | H | H | L | H | Fin: "Totals over 5 or more costed people." |
| pay:rounded | S | L | L | S | H | "Rounded down to $0.1M per department or sub-org." |
| leave:counts / people | S/S | L/H | L/H | H/H | H/H | "Leave shows as counts for groups of 5 or more." |

Actions (`action:<id>`; every mode decides every id):

| Action | Adm | HRBP | Lead | Fin | Mgr |
|---|---|---|---|---|---|
| request.draft, request.submit, request.withdraw | S | S | S | H | S |
| request.submit-on-behalf | S | S | H | H | H |
| request.approve, request.reject, request.send-back | S | L | L | L | L (as manager's manager) |
| request.approve-with-changes | S | S | H | H | H |
| request.recruit, request.propose-start | S | S | S | H | S |
| request.import | S | S | S? | S | H |
| position.edit-open-planned (start, level, location, FTE, On hold, with reason) | S | L (Working only) | H | H | H |
| transfer.process | S | S | H | H | H |
| transfer.approve | S | L | L | H | H |
| target.set, target.exception | S | H | H | S | H |
| target.split, target.move | S | H | L | S | H |
| whatif.use, whatif.turn-into-requests | S | S | S | S | H |
| cycle.open, cycle.lock, cycle.return, version.create, version.lock, version.reopen, close.month, fx.set, freeze.create, assumptions.edit | S | H | H | S | H |
| cycle.remind, cycle.cut-line | S | S | S | S | H |
| export.shareable | S | S | S | S | S |
| export.full, export.load-file (switch on) | L | H | H | H | H |
| data.import, workspace.import | S | H | H | H | H |

### 5.5 Copy

```ts
export const NOT_SECURITY_SHORT =
  'Modes, Acting as and approvals change what Headcount Planner shows, not who can see the data.'
export const NOT_SECURITY_LONG =
  'Modes and Acting as shape Headcount Planner for how you use it. They are not security: anyone using it can switch modes or pick someone else, and every mode reads the same data in this browser. Share the app and its files only with people who may see all of it.'
export const BANNED_MODE_WORDS = ['access', 'permission', 'restricted', 'secure', 'locked down', 'authorized', 'role-based access']
/** Hashes catch damage, not forgery (spec). */
export const BANNED_HASH_WORDS = ['tamper-proof', 'tamperproof', 'tamper proof']
export const BANNED_WORDS_EXEMPT = { articles: ['about-server'] } as const
```

Run both lists in `matrix.test.ts` (every `how`), the help scan (articles and tours, skipping `about-server`) and the export-line test. Avoid "authorized" in approval copy ("Approved by Priya Raman as Manager", never "authorized by").

### 5.6 HCP leak tests (per mode), built on the Census crawl

1. **Crawler** `src/access/testkit/crawl.ts` (test-only): port `Crawl` from `managerExits.test.ts:86-150` but collect every string AND number with a `where` key, in model order: each shown view's headline and summary KPIs/findings, every drill table (`buildDrillTable` rows and columns), every tab model, the home, Actions lists and copied notes, position/person cards, help articles/glossary/tours, metric dictionary, every export (figure CSV/Excel cell values, whole-view export facts, deck text, the long CSV and control totals), the Shareable workspace file JSON, every comment and audit row the mode sees. Non-vacuity: `read > N` per mode, and an HR-admin-with-switch control that differs.
2. **Byte-identical perturbation (new; Census has none):** build ctx A from the sample, ctx B identical except one Filled worker's `baseSalary` in a team of 3 (and, separately, one accepted `offerBase`); `expect(crawl(B)).toEqual(crawl(A))` for Manager (team-of-3 persona), and for HRBP/Leader/Finance where the group is under 5. Control: HR admin with the switch differs. Pin clocks (`savedAt`, `as-of`) and exclude only hashes whose input the mode cannot see, with a written reason.
3. **Manager C:** crawl Manager C with and without the confidential Elimination request: identical (no request id, count, item, audit row, notification, allocation change).
4. **No difference equals one person's cost:** for HRBP/Leader (and Manager band status), every pair of shown amounts across adjacent month-ends, versions and bridge steps; fixture of 3 filled + 2 open. Finance is excluded by the accepted risk in `docs/PLAN.md` (see 6).
5. **Under 5:** no cost, rate or average over fewer than 5 in any mode outside HR admin with the switch; head counts may show.
6. **No leave data** in Manager or Finance crawls (`/leave/i` labels, `onLeave`, `leavePaid` keys).
7. Source scan like `managerExits.test.ts:536-583`: every `<Figure>` on a view a mode shows whose props name pay or cost is hidden by id or gated by `ctx.showCost`/`showRounded`.

---

## 6. Gotchas and spec conflicts

### 6.1 Census quirks to copy carefully

- `policy/routing.ts` is the Action center's item routing, not the route guard. The route guard is `routeDecision` in `policy/index.ts` plus `setRouteGuard` in `connect.ts`.
- The store reads `localStorage` once at module creation; tests must stub storage BEFORE importing (`vi.hoisted` or `vi.resetModules()` + dynamic import). Every test that loads the app store mocks `idb-keyval`.
- `clampFilters` must return the same object when nothing changes, or the store guard and `checkScope` loop. The idempotence sweep (>500 combos) is what catches it.
- `tabTable` throws at module load on a typo'd tab key; a policy file error then breaks every import of `@/access`. Keep `VIEW_TABS` in sync with the registry (matrix test does it).
- `decideTable` treats any unknown surface kind as hidden ("Not named by the X mode policy."), so new kinds (`action:`, `leave:`) must be named in every table or they silently hide. Good default, but put them in the matrix inventory so reviewers see them.
- `header:<view>` is hidden unless the view is named in `views`, even when the view is shown by default elsewhere.
- `accessFor` memo key includes `policyVersion()`; HCP Phase 1 has no overrides, so a constant is fine, but keep the slot for Phase 2.
- Snapshots use `toMatchFileSnapshot`; update with `npx vitest run src/access -u`. Census has no `.gitattributes` and `core.autocrlf` is false here; add `src/access/__snapshots__/*.txt text eol=lf` so a CRLF checkout cannot fail them on Windows.
- Source-scanning tests must normalize Windows paths (`relative(...).replaceAll('\\', '/')`) and resolve folders with `fileURLToPath(new URL('../views', import.meta.url))`.
- Crawls are slow (120 000 to 300 000 ms timeouts in Census); keep per-mode crawls in separate `it`s and cache contexts in `beforeAll`.
- Banned words are matched two ways (substring in `matrix.test.ts`, word-start regex in the help scan); "access" as a substring fails "accessible". "Locked" (a version state) is fine; "locked down" is banned.
- Census `MIN_REPORTS = 3` makes a manager of 1 or 2 unpickable ("treats someone who leads fewer than 3 as no manager picked"); HCP wants "their tree, any size", so set it to 1 and rely on the under-5 rules.
- Census scope sets hold employee IDs (`orgIds`); HCP plans positions, so scopes must hold position IDs (tree via `managerPositionId`) plus the people assigned to them.

### 6.2 HCP spec vs Census (with suggested resolutions)

1. **Who sees cost is inverted.** Census: Finance 'totals' rounded down to $0.1M per business unit (`costRounding.ts`, ROLES-V2 3.2 rule 8); scoped modes never see cost (`showCostIn` explicitly excludes `SCOPE_OF[mode]`; guard rail 'cost-totals'). HCP: Finance exact for 5+, HRBP and Leader rounded $0.1M per department/sub-org. Resolution: new `PayView` values `'exact'` and `'rounded'`; `showCostIn(mode)` = switch-on or `exact`; `showRoundedIn(mode)` = `rounded` and `costFiltersWhole`; do not port `byWholeUnits` (it would apply Finance's clamp to any unscoped totals mode).
2. **Finance filters.** Census Finance keeps business unit and period only; HCP Finance keeps unit, cost center, legal entity, country, currency, version, period. Port `clampFinance` with the wider keep-list; exact totals over narrow filter sets are the accepted risk in `docs/PLAN.md`.
3. **"No month or version difference equals one person's cost" vs Finance exact.** The quality bar's rule cannot hold for Finance exact series (PLAN.md accepts that Finance can difference out one hire). Resolution: apply the rule to HRBP, Leader and Manager; Finance gets only the 5+ minimum and fold rules; or choose question 5's option B (Census's $0.1M floor per unit) and then include Finance.
4. **Approvers see band cost vs Manager sees no amounts.** A manager approving as manager's manager is an approver. Resolution: in Manager mode approvals show heads, the band status word and the gap in heads; band cost appears from HRBP up. Flag in the questions.
5. **Leave and cost.** On-leave employees are costed unless `leavePaid` is false, so an exact Finance month-over-month change can reveal unpaid leave while Finance must see "no leave data". Resolution: model unpaid leave cost change in Finance totals only through the 5+ group rule, or keep leave out of Finance's costing (cost on-leave employees as paid in Finance-facing series) and note it in PLAN.md.
6. **Census has no Audit view and no "Acting as".** The spec says "Census's Data room, Actions and Audit"; Census has the Data room and the Action center, and audit only for reference mappings. Build Audit and Acting as fresh (section 5.2) on Census's pick pattern.
7. **Census modes are read only; HCP has writes.** Census `decide` covers what shows. HCP needs `action:` surfaces and person-level rules (request visibility: requester, chain, HRBP, HR admin, never the touched seat or below; eliminations show only position ID, title, level, org). Put the person rules in `access/visibility.ts`, tested by the Manager C crawl, not in `ROLE_POLICY` (which is per mode, not per person).
8. **"What if" is listed as a Leader place but not as a view in Screens.** Resolution: a `whatif` view (folder tab "What if") shown in HRBP, Leader, Finance, HR admin; or a header action on Plan/Forecast/Targets (`S.header('whatif')`). Ask the user; default to the view.
9. **"Import requests: HRBP and above"** is ambiguous about Leader. Default: HRBP, Leader, Finance, HR admin, with Leader's line saying "Merges requests into your org only."
10. **Developer mode.** HCP lists five modes and puts the Security center in Phase 2. Drop Developer, the dev page, `DEVELOPER_ONLY`, overlays and `overrides/` in Phase 1; the matrix baseline invariant becomes "HR admin differs from all-shown only on the home surfaces".
11. **Byte-identical vs hashes and timestamps.** Export headers carry "lock hash"; workspace files carry `savedAt` and a checksum; audit entries hash the previous one. A Manager-visible hash over data Manager cannot see breaks the byte-identical test. Resolution: perturb only HRIS rows after locks (locked versions store lines and hash, never recomputed), pin the clock, compute the Shareable file checksum over its own contents, and never show the audit chain head outside HR admin.
12. **Banned words vs spec vocabulary.** The spec itself says "real access control needs a server" (allowed only in the `about-server` article) and "Approvers only" comments (fine). Avoid "authorized" in approval copy and "restricted" for freezes ("Hiring is frozen…", as the spec words it).
13. **HR admin home is the Data room**, which is a page (`page:data`), not a view. `HOME_OF['hr-admin'] = 'data'` works with `homeOf` (`{ view: 'data', tab: '' }`) and `routeDecision`'s "never redirect your own home" rule, as Census's `developer: 'dev'` does.
