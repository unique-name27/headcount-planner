/**
 * The scope in the address (docs/PLAN.md 9.1 and 9.2). Pure.
 *
 * The route stays as it was (`#view.tab`, with a view's own suffix where it has one); the scope
 * follows a `?` at the end of the hash, written with URLSearchParams:
 *
 *   #plan.positions?bu=Silicon+Engineering&ver=fy27-working&vs=fy27-budget
 *
 * Keys: `period` (fy, ytd, qtd, month or custom), `from` and `to` (custom only), `leader` (a position
 * ID, never a name), `bu`, `dept`, `cc`, `loc`, `level`, `le`, `country`, `ccy` (repeated for several
 * values), `not` (the dimensions in exclude mode), `ver` (the version shown) and `vs` (the comparison:
 * a version ID or `target`), `std` (the data standard, when not the default) and `lens=1` (the data
 * quality lens). Defaults are left out, so the whole company over the fiscal year in the default
 * version is just `#plan.positions`; a link that must reset a recipient's filters says `scope=all`.
 * The version and comparison are pickers beside the filters, never filters: they are never clamped,
 * and an unknown or cross-year value resets to the default (`checkPicks`). The hash never reaches a
 * server.
 */
import { formatDate, isCalendarDate } from '@/lib/dates'
import { type DataStandard, DEFAULT_STANDARD, isDataStandard } from './quality/tier'
import type { Datasets, FiscalYear, ISODate } from './schema'
import {
  canonicalFilters,
  DEFAULT_FILTERS,
  dropIdleModes,
  FILTER_DIMENSIONS,
  type FilterDimension,
  type FilterModes,
  type Filters,
  isExcluded,
  isPeriodPreset,
  LIST_DIMENSIONS,
  type ListDimension,
  type OrgValues,
  positionValues,
  requestValues,
  sameFilters,
  workerValues,
} from './scope'

/** The comparison picker's value for a fiscal year's target (`vs=target`). */
export const TARGET_COMPARE = 'target'

/** Everything the address carries besides the route. */
export interface UrlScope {
  filters: Filters
  standard: DataStandard
  /** The data quality lens (the view header's "Show data quality"). */
  lens: boolean
  /** The version shown (`ver`); null is the default, the fiscal year's Working. */
  version: string | null
  /**
   * What every "vs" figure compares with (`vs`): a locked version's ID of the shown version's fiscal
   * year, or TARGET_COMPARE; null is the mode's default (docs/PLAN.md 9.2).
   */
  compare: string | null
}

export const DEFAULT_SCOPE: UrlScope = {
  filters: DEFAULT_FILTERS,
  standard: DEFAULT_STANDARD,
  lens: false,
  version: null,
  compare: null,
}

/** The parameter name of each filter dimension. */
export const DIM_PARAM: Record<FilterDimension, string> = {
  leaderId: 'leader',
  businessUnit: 'bu',
  department: 'dept',
  costCenter: 'cc',
  location: 'loc',
  level: 'level',
  legalEntity: 'le',
  country: 'country',
  currency: 'ccy',
}
const PARAM_DIM = new Map<string, FilterDimension>(
  FILTER_DIMENSIONS.map((d) => [DIM_PARAM[d], d] as [string, FilterDimension]),
)

/** Every key the scope uses; a query with any of them is a scope. */
export const SCOPE_KEYS: readonly string[] = [
  'scope',
  'period',
  'from',
  'to',
  ...FILTER_DIMENSIONS.map((d) => DIM_PARAM[d]),
  'not',
  'ver',
  'vs',
  'std',
  'lens',
]

/** A version ID the address may carry: letters, digits, `.`, `_` and `-`, up to 64. */
export const isPickId = (v: unknown): v is string => typeof v === 'string' && /^[\w.-]{1,64}$/.test(v)

/** The route part and the query part of a hash: "#plan.positions?bu=X" gives "plan.positions" and "bu=X". */
export function splitHash(hash: string): { route: string; query: string | null } {
  const h = hash.replace(/^#/, '')
  const at = h.indexOf('?')
  return at < 0 ? { route: h, query: null } : { route: h.slice(0, at), query: h.slice(at + 1) }
}

/**
 * The scope as query parameters, in a fixed order with defaults left out. `explicit` writes
 * `scope=all` when everything is at its default, so a copied link resets the recipient's filters.
 */
export function scopeParams(scope: UrlScope, opts: { explicit?: boolean } = {}): URLSearchParams {
  // Idle modes and stray custom dates drop out; values keep the order they were picked in.
  const f = canonicalFilters(scope.filters)
  const p = new URLSearchParams()
  if (f.period !== DEFAULT_FILTERS.period) p.append('period', f.period)
  if (f.period === 'custom') {
    if (f.customStart) p.append('from', f.customStart)
    if (f.customEnd) p.append('to', f.customEnd)
  }
  if (f.leaderId) p.append('leader', f.leaderId)
  for (const d of LIST_DIMENSIONS) for (const v of new Set(scope.filters[d])) p.append(DIM_PARAM[d], v)
  for (const d of FILTER_DIMENSIONS) if (isExcluded(f, d)) p.append('not', DIM_PARAM[d])
  if (scope.version) p.append('ver', scope.version)
  if (scope.compare) p.append('vs', scope.compare)
  if (scope.standard !== DEFAULT_STANDARD) p.append('std', scope.standard)
  if (scope.lens) p.append('lens', '1')
  if (opts.explicit && ![...p.keys()].length) p.append('scope', 'all')
  return p
}

/** The query string for a scope ('' at the defaults unless `explicit`). */
export const scopeQuery = (scope: UrlScope, opts: { explicit?: boolean } = {}): string =>
  scopeParams(scope, opts).toString()

/** "#view.tab" plus "?scope" when there is one. `route` is the hash route without "#" or "?". */
export function hashWithScope(route: string, scope: UrlScope, opts: { explicit?: boolean } = {}): string {
  const q = scopeQuery(scope, opts)
  return `#${route}${q ? `?${q}` : ''}`
}

/** A value a link named that this browser's data doesn't have. */
export interface LeftOut {
  dim: FilterDimension
  value: string
}

export interface ReadScope {
  /** The query names a scope (any scope key); false means "keep your own filters". */
  present: boolean
  scope: UrlScope
  /** Parts that could not be read (a period, date, version or standard that isn't one); left at the default. */
  unreadable: string[]
}

/**
 * The scope a query names. Missing keys take their defaults (a link applies exactly its scope);
 * values that can't be read are left at the default and listed in `unreadable`. With no scope key
 * at all, `present` is false and `scope` is the defaults. Whether `ver` and `vs` name versions this
 * workspace has is `checkPicks`'s job.
 */
export function readScope(query: string | null | undefined): ReadScope {
  const p = new URLSearchParams(query ?? '')
  const present = SCOPE_KEYS.some((k) => p.has(k))
  const unreadable: string[] = []
  const filters: Filters = { ...DEFAULT_FILTERS, modes: {} }
  const period = p.get('period')
  if (period != null) {
    if (isPeriodPreset(period)) filters.period = period
    else unreadable.push(`period "${period}"`)
  }
  if (filters.period === 'custom') {
    const from = p.get('from')
    const to = p.get('to')
    // Real calendar dates only: "2026-02-30" is not one.
    if (isCalendarDate(from) && isCalendarDate(to) && from <= to) {
      filters.customStart = from
      filters.customEnd = to
    } else {
      unreadable.push('custom dates')
      filters.period = DEFAULT_FILTERS.period
    }
  }
  const leader = p.get('leader')
  if (leader) filters.leaderId = leader
  for (const d of LIST_DIMENSIONS) filters[d] = [...new Set(p.getAll(DIM_PARAM[d]).filter((v) => v !== ''))]
  const modes: FilterModes = {}
  for (const n of p.getAll('not')) {
    const d = PARAM_DIM.get(n)
    if (d) modes[d] = 'exclude'
  }
  filters.modes = modes
  // A mode without values filters nothing, and the address never writes one.
  const read = dropIdleModes(filters)
  const pick = (key: 'ver' | 'vs', what: string): string | null => {
    const v = p.get(key)
    if (v == null || v === '') return null
    if (isPickId(v)) return v
    unreadable.push(`${what} "${v}"`)
    return null
  }
  const version = pick('ver', 'version')
  const compare = pick('vs', 'comparison')
  const std = p.get('std')
  let standard: DataStandard = DEFAULT_STANDARD
  if (std != null) {
    if (isDataStandard(std)) standard = std
    else unreadable.push(`data standard "${std}"`)
  }
  return {
    present,
    scope: { filters: read, standard, lens: p.get('lens') === '1', version, compare },
    unreadable,
  }
}

/* ───────────── values the data does not have ───────────── */

/** What the loaded data has, to check a link's values against. */
export interface ScopeVocabulary {
  /** The position is in the data (a leader is a position ID). */
  hasLeader: (positionId: string) => boolean
  /** The value occurs in the data for this dimension. */
  hasValue: (dim: ListDimension, value: string) => boolean
  /** The reporting date: a custom period may not end after it (there is no data past it). */
  asOf?: ISODate
}

const vocabularies = new WeakMap<object, ScopeVocabulary>()

/**
 * What the loaded data has: positions as leaders, and each dimension's values on positions, workers,
 * requests, targets and freezes (legal entity, country and currency read from each location). Built
 * once per dataset object.
 */
export function vocabularyOf(args: {
  all: Pick<Datasets, 'positions' | 'workers' | 'requests' | 'targets' | 'freezes'>
  asOf?: ISODate
}): ScopeVocabulary {
  const cached = vocabularies.get(args.all)
  if (cached) return withAsOf(cached, args.asOf)
  let sets: Map<ListDimension, Set<string>> | null = null
  let seats: Set<string> | null = null
  const build = (): Map<ListDimension, Set<string>> => {
    const out = new Map<ListDimension, Set<string>>(LIST_DIMENSIONS.map((d) => [d, new Set<string>()]))
    const add = (v: OrgValues) => {
      for (const d of LIST_DIMENSIONS) {
        const x = v[d]
        if (x) out.get(d)?.add(x)
      }
    }
    for (const r of args.all.positions) add(positionValues(r))
    for (const w of args.all.workers) add(workerValues(w))
    for (const r of args.all.requests) add(requestValues(r))
    for (const r of [...args.all.targets, ...args.all.freezes]) {
      if (r.businessUnit) out.get('businessUnit')?.add(r.businessUnit)
      if (r.department) out.get('department')?.add(r.department)
      if (r.costCenter) out.get('costCenter')?.add(r.costCenter)
    }
    return out
  }
  const v: ScopeVocabulary = {
    hasLeader: (id) => {
      seats ??= new Set(args.all.positions.map((r) => r.positionId))
      return seats.has(id)
    },
    hasValue: (dim, x) => {
      sets ??= build()
      return !!sets.get(dim)?.has(x)
    },
  }
  vocabularies.set(args.all, v)
  return withAsOf(v, args.asOf)
}

const withAsOf = (v: ScopeVocabulary, asOf: ISODate | undefined): ScopeVocabulary =>
  asOf ? { ...v, asOf } : v

/** Why a scope's custom period can't be used as it is: dates that are not dates, or past the reporting date. */
export type PeriodProblem =
  | { kind: 'dates' }
  /** It ended after the reporting date: it now ends on it. */
  | { kind: 'clamped'; asOf: ISODate }
  /** It started after the reporting date: the default period applies. */
  | { kind: 'after'; asOf: ISODate }

/**
 * The scope without the values the data doesn't have (and which ones those were), and with a custom
 * period the period control would accept: real dates, the start on or before the end, and not past
 * the reporting date. A period that ends after it is cut to end on it; one that starts after it, or
 * has no readable dates, gives way to the default. A mode left without values is dropped. The
 * version and comparison are checked by `checkPicks`.
 */
export function checkScope(
  scope: UrlScope,
  vocab: ScopeVocabulary,
): { scope: UrlScope; leftOut: LeftOut[]; period: PeriodProblem | null } {
  const leftOut: LeftOut[] = []
  let period: PeriodProblem | null = null
  const f: Filters = { ...scope.filters }
  if (f.period === 'custom') {
    const { customStart: start, customEnd: end } = f
    const asOf = vocab.asOf
    if (!isCalendarDate(start) || !isCalendarDate(end) || start > end) period = { kind: 'dates' }
    else if (asOf && start > asOf) period = { kind: 'after', asOf }
    else if (asOf && end > asOf) {
      period = { kind: 'clamped', asOf }
      f.customEnd = asOf
    }
    if (period && period.kind !== 'clamped') {
      f.period = DEFAULT_FILTERS.period
      f.customStart = null
      f.customEnd = null
    }
  }
  if (f.leaderId && !vocab.hasLeader(f.leaderId)) {
    leftOut.push({ dim: 'leaderId', value: f.leaderId })
    f.leaderId = null
  }
  for (const d of LIST_DIMENSIONS) {
    const keep: string[] = []
    for (const v of f[d]) {
      if (vocab.hasValue(d, v)) keep.push(v)
      else leftOut.push({ dim: d, value: v })
    }
    f[d] = keep
  }
  const out = dropIdleModes(f)
  const changed = leftOut.length > 0 || period != null || out !== f
  return { scope: changed ? { ...scope, filters: out } : scope, leftOut, period }
}

/**
 * The toast line for a custom period that was changed: "The link's custom period ends after the
 * reporting date, 30 Sep 2026, so it ends there instead." `source` names where the scope came from.
 */
export function periodMessage(problem: PeriodProblem, source = "The link's"): string {
  if (problem.kind === 'dates')
    return `${source} custom dates could not be read, so the default period was used.`
  const date = formatDate(problem.asOf)
  return problem.kind === 'clamped'
    ? `${source} custom period ends after the reporting date, ${date}, so it ends there instead.`
    : `${source} custom period starts after the reporting date, ${date}, so the default period was used.`
}

const DIM_WORD: Record<FilterDimension, [string, string]> = {
  leaderId: ['leader', 'leaders'],
  businessUnit: ['business unit', 'business units'],
  department: ['department', 'departments'],
  costCenter: ['cost center', 'cost centers'],
  location: ['location', 'locations'],
  level: ['level', 'levels'],
  legalEntity: ['legal entity', 'legal entities'],
  country: ['country', 'countries'],
  currency: ['currency', 'currencies'],
}

const andList = (xs: readonly string[]) =>
  xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`

/**
 * "The link's department Photonics is not in your data, so it was left out." Leaders are named by
 * their position ID (the link carries no names). `source` names where the scope came from.
 */
export function leftOutMessage(leftOut: readonly LeftOut[], source = "The link's"): string {
  if (!leftOut.length) return ''
  const groups: string[] = []
  for (const d of FILTER_DIMENSIONS) {
    const vs = leftOut
      .filter((x) => x.dim === d)
      .map((x) => (d === 'leaderId' ? `with position ID ${x.value}` : x.value))
    if (!vs.length) continue
    groups.push(`${DIM_WORD[d][vs.length === 1 ? 0 : 1]} ${andList(vs)}`)
  }
  const one = leftOut.length === 1
  return `${source} ${andList(groups)} ${one ? 'is' : 'are'} not in your data, so ${one ? 'it was' : 'they were'} left out.`
}

/* ───────────── the version and comparison pickers ───────────── */

/** A version the pickers can offer (from the plan state). */
export interface VersionChoice {
  versionId: string
  fiscalYear: FiscalYear
  state: 'working' | 'locked' | 'retired'
}

/** What the pickers can offer: every version, and the fiscal year a page without `ver` shows. */
export interface PickCatalog {
  versions: readonly VersionChoice[]
  /** The fiscal year whose Working a page without `ver` shows (the as-of date's). */
  fiscalYear: FiscalYear
}

/** The version a scope shows: its `ver`, else the catalog's fiscal year's Working; null when there is none. */
export function shownVersion(scope: Pick<UrlScope, 'version'>, catalog: PickCatalog): VersionChoice | null {
  const byId = scope.version ? catalog.versions.find((v) => v.versionId === scope.version) : undefined
  return (
    byId ?? catalog.versions.find((v) => v.fiscalYear === catalog.fiscalYear && v.state === 'working') ?? null
  )
}

/**
 * What the comparison picker lists for the shown version: the target (`vs=target`) and the locked
 * versions of the same fiscal year only; cross-year comparisons are not offered (docs/PLAN.md 9.2).
 */
export function comparisonChoices(shown: VersionChoice | null, catalog: PickCatalog): string[] {
  const fy = shown?.fiscalYear ?? catalog.fiscalYear
  return [
    TARGET_COMPARE,
    ...catalog.versions.filter((v) => v.fiscalYear === fy && v.state === 'locked').map((v) => v.versionId),
  ]
}

export type PickProblem = 'version' | 'compare'

/**
 * The scope with pickers this workspace can show. An unknown `ver` resets to the default (and
 * naming the default Working is the same as leaving it out); a `vs` that is neither the target nor
 * a locked version of the shown version's fiscal year (unknown, Working or cross-year) resets to the
 * mode's default. Never clamped by a mode. The same object when nothing changed.
 */
export function checkPicks(scope: UrlScope, catalog: PickCatalog): { scope: UrlScope; reset: PickProblem[] } {
  const reset: PickProblem[] = []
  let version = scope.version
  if (version != null && !catalog.versions.some((v) => v.versionId === version)) {
    reset.push('version')
    version = null
  }
  const fallback = shownVersion({ version: null }, catalog)
  if (version != null && fallback?.versionId === version) version = null
  let compare = scope.compare
  if (compare != null && !comparisonChoices(shownVersion({ version }, catalog), catalog).includes(compare)) {
    reset.push('compare')
    compare = null
  }
  if (version === scope.version && compare === scope.compare) return { scope, reset }
  return { scope: { ...scope, version, compare }, reset }
}

/** "The link's version and comparison are not in this workspace, so the defaults were used." */
export function picksMessage(reset: readonly PickProblem[], source = "The link's"): string {
  if (!reset.length) return ''
  if (reset.length === 2)
    return `${source} version and comparison are not in this workspace, so the defaults were used.`
  return reset[0] === 'version'
    ? `${source} version is not in this workspace, so the default version was used.`
    : `${source} comparison is not offered for this version, so the default comparison was used.`
}

/** The same scope: the same records over the same window (value order aside), version, comparison, standard and lens. */
export const sameScope = (a: UrlScope, b: UrlScope): boolean =>
  a.standard === b.standard &&
  a.lens === b.lens &&
  (a.version ?? null) === (b.version ?? null) &&
  (a.compare ?? null) === (b.compare ?? null) &&
  sameFilters(a.filters, b.filters)
