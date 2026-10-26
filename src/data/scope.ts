/**
 * Global filters and dataset scoping (docs/PLAN.md 9.2). Pure.
 *
 * One filter row scopes every view. The org filters select positions, and every other dataset
 * follows its positions:
 *  - positions by their own org fields as of the as-of date, the leader filter by the position tree
 *    (`managerPositionId`), so vacant seats belong to a tree and plan lines follow a moved position;
 *  - workers by the position they hold (a not-in-plan worker by their own HRIS org fields), comp by
 *    its worker, reqs by their position;
 *  - requests, targets and freezes by their own org fields; assumptions are never scoped.
 *
 * Each filter dimension includes or excludes its values (`Filters.modes`); a record with a blank
 * value for an excluded dimension stays in. Version and comparison are pickers beside the filters,
 * not filters, so they are not here.
 *
 * Frozen in M1: the types and constants are final; the data core built `buildPositionIndex`,
 * `subtreeIds` and `scopeDatasets` behind them and added the filter helpers (the template app's).
 * `plan/` and `cost/` import this module for types only (docs/PLAN.md 4).
 */
import { isCalendarDate } from '@/lib/dates'
import { isPeriodPreset, type PeriodPreset } from './fiscal'
import {
  type Datasets,
  type ISODate,
  type PositionRow,
  type RequestRow,
  siteByLocation,
  splitIds,
  type WorkerRow,
  withAllDatasets,
} from './schema'

export {
  isPeriodPreset,
  PERIOD_LABELS,
  PERIOD_PRESETS,
  type PeriodPreset,
  type PeriodWindow,
  periodWindow,
  type Window,
} from './fiscal'

/* ───────────── filters ───────────── */

/**
 * The filter dimensions, in filter-bar order. `leaderId` is a position ID (never a name); its tree
 * follows `managerPositionId`. Finance filters unit, cost center, legal entity, country and currency
 * (docs/PLAN.md 8.1 `FILTER_DIMS_OF`).
 */
export type FilterDimension =
  | 'leaderId'
  | 'businessUnit'
  | 'department'
  | 'costCenter'
  | 'location'
  | 'level'
  | 'legalEntity'
  | 'country'
  | 'currency'
/** The filter dimensions that hold a list of values. */
export type ListDimension = Exclude<FilterDimension, 'leaderId'>
export const LIST_DIMENSIONS: readonly ListDimension[] = [
  'businessUnit',
  'department',
  'costCenter',
  'location',
  'level',
  'legalEntity',
  'country',
  'currency',
]
export const FILTER_DIMENSIONS: readonly FilterDimension[] = ['leaderId', ...LIST_DIMENSIONS]

/**
 * Include keeps the chosen values (the default); exclude keeps everything except them (for the
 * leader, everything except that position's whole tree). An exclusion that removes 1 to 4 Filled
 * heads cannot be picked (docs/PLAN.md 9.2).
 */
export type FilterMode = 'include' | 'exclude'
/** The mode of each filter dimension. Only exclusions are stored; a dimension left out includes. */
export type FilterModes = Partial<Record<FilterDimension, FilterMode>>

export interface Filters {
  /** A fiscal period preset; `fy` by default (src/data/fiscal.ts `periodWindow`). */
  period: PeriodPreset
  /** The `custom` period's first and last day ("Filter to this" on a month bar sets them). */
  customStart: ISODate | null
  customEnd: ISODate | null
  /** A leader's position ID; selects that position and every position below it (or leaves them out). */
  leaderId: string | null
  businessUnit: string[]
  department: string[]
  costCenter: string[]
  location: string[]
  level: string[]
  legalEntity: string[]
  country: string[]
  currency: string[]
  modes: FilterModes
}

export const DEFAULT_FILTERS: Filters = {
  period: 'fy',
  customStart: null,
  customEnd: null,
  leaderId: null,
  businessUnit: [],
  department: [],
  costCenter: [],
  location: [],
  level: [],
  legalEntity: [],
  country: [],
  currency: [],
  modes: {},
}

/** The mode of one filter dimension (include when not set, also for filters saved before modes). */
export const modeOf = (f: Pick<Filters, 'modes'> | Partial<Filters>, dim: FilterDimension): FilterMode =>
  f.modes?.[dim] === 'exclude' ? 'exclude' : 'include'

export const isExcluded = (f: Pick<Filters, 'modes'> | Partial<Filters>, dim: FilterDimension): boolean =>
  modeOf(f, dim) === 'exclude'

/** The modes with one dimension set; only exclusions are kept. */
export function withMode(
  modes: FilterModes | undefined,
  dim: FilterDimension,
  mode: FilterMode,
): FilterModes {
  const out: FilterModes = {}
  for (const d of FILTER_DIMENSIONS) {
    const m = d === dim ? mode : modes?.[d]
    if (m === 'exclude') out[d] = 'exclude'
  }
  return out
}

/** Whether a dimension has a value set (a mode alone filters nothing). */
export const dimensionSet = (f: Filters, dim: FilterDimension): boolean =>
  dim === 'leaderId' ? !!f.leaderId : f[dim].length > 0

/** The leader position the scope focuses on: the leader filter in include mode, else null. */
export const focusLeader = (f: Filters): string | null =>
  f.leaderId && !isExcluded(f, 'leaderId') ? f.leaderId : null

/** Some org dimension has a value (the period alone is not an org filter). */
export const hasOrgFilter = (f: Filters): boolean => FILTER_DIMENSIONS.some((d) => dimensionSet(f, d))

/** Some dimension with a value includes: a record the scope cannot place is then left out. */
const anyInclude = (f: Filters): boolean =>
  FILTER_DIMENSIONS.some((d) => dimensionSet(f, d) && !isExcluded(f, d))

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && x !== ''))] : []

/**
 * Filters from untrusted input (browser storage, a saved view, a settings file): every field
 * checked, anything invalid at its default. Filters saved before modes existed load as include.
 */
export function normalizeFilters(raw: unknown): Filters {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const period: PeriodPreset = isPeriodPreset(r.period) ? r.period : DEFAULT_FILTERS.period
  const modesRaw = (r.modes && typeof r.modes === 'object' ? r.modes : {}) as Record<string, unknown>
  const modes: FilterModes = {}
  for (const d of FILTER_DIMENSIONS) if (modesRaw[d] === 'exclude') modes[d] = 'exclude'
  // Real calendar dates only ("2026-02-30" is not one), the start on or before the end.
  const dates =
    period === 'custom' &&
    isCalendarDate(r.customStart) &&
    isCalendarDate(r.customEnd) &&
    r.customStart <= r.customEnd
  const out: Filters = {
    period,
    customStart: dates ? (r.customStart as ISODate) : null,
    customEnd: dates ? (r.customEnd as ISODate) : null,
    leaderId: typeof r.leaderId === 'string' && r.leaderId ? r.leaderId : null,
    businessUnit: [],
    department: [],
    costCenter: [],
    location: [],
    level: [],
    legalEntity: [],
    country: [],
    currency: [],
    modes,
  }
  for (const d of LIST_DIMENSIONS) out[d] = strings(r[d])
  return out
}

/**
 * The filters without a mode on a dimension that has no values (an exclude switch left on after its
 * last value went). The same object when there is none.
 */
export function dropIdleModes(f: Filters): Filters {
  const idle = FILTER_DIMENSIONS.filter((d) => isExcluded(f, d) && !dimensionSet(f, d))
  if (!idle.length) return f
  const modes: FilterModes = {}
  for (const d of FILTER_DIMENSIONS) if (isExcluded(f, d) && !idle.includes(d)) modes[d] = 'exclude'
  return { ...f, modes }
}

/**
 * The scope with nothing that filters nothing: a mode on a dimension without values is dropped,
 * list values sorted, custom dates only on a custom period. Two filters that pick the same records
 * over the same window are equal after this.
 */
export function canonicalFilters(f: Filters): Filters {
  const modes: FilterModes = {}
  for (const d of FILTER_DIMENSIONS) if (dimensionSet(f, d) && isExcluded(f, d)) modes[d] = 'exclude'
  const custom = f.period === 'custom'
  const out: Filters = {
    ...DEFAULT_FILTERS,
    period: f.period,
    customStart: custom ? f.customStart : null,
    customEnd: custom ? f.customEnd : null,
    leaderId: f.leaderId || null,
    modes,
  }
  for (const d of LIST_DIMENSIONS) out[d] = [...f[d]].sort()
  return out
}

/** The same scope (period, custom dates, leader, values and modes), ignoring order and idle modes. */
export const sameFilters = (a: Filters, b: Filters): boolean =>
  JSON.stringify(canonicalFilters(a)) === JSON.stringify(canonicalFilters(b))

/* ───────────── position trees ───────────── */

/** The position tree as of a date. */
export interface PositionIndex {
  asOf: ISODate
  /** Each position's row in effect on `asOf`: the latest row with `effectiveDate` on or before it. */
  byId: ReadonlyMap<string, PositionRow>
  /** Direct reports by `managerPositionId`, from the rows in `byId`. */
  children: ReadonlyMap<string, readonly PositionRow[]>
}

/**
 * Resolves every position to its row in effect on `asOf` and links each to its manager position.
 * Rows that take effect after `asOf` are ignored; a position whose first row is after `asOf` is not
 * in the index. Of two rows with the same effective date, the later one in the data wins. Children
 * keep the order of the data; a seat that names itself, or a manager not in the index, has no parent.
 */
export function buildPositionIndex(positions: readonly PositionRow[], asOf: ISODate): PositionIndex {
  const byId = new Map<string, PositionRow>()
  for (const r of positions) {
    if (!r || typeof r.positionId !== 'string' || !r.positionId) continue
    if (typeof r.effectiveDate !== 'string' || !(r.effectiveDate <= asOf)) continue
    const cur = byId.get(r.positionId)
    if (!cur || r.effectiveDate >= cur.effectiveDate) byId.set(r.positionId, r)
  }
  const children = new Map<string, PositionRow[]>()
  for (const r of byId.values()) {
    const m = r.managerPositionId
    if (!m || m === r.positionId || !byId.has(m)) continue
    const arr = children.get(m)
    if (arr) arr.push(r)
    else children.set(m, [r])
  }
  return { asOf, byId, children }
}

/**
 * The position and every position below it through `managerPositionId`, as of the index's date.
 * Cycle-safe: a manager loop in the data ends the walk instead of hanging it. Empty when the
 * position is not in the index.
 */
export function subtreeIds(index: PositionIndex, positionId: string): Set<string> {
  const out = new Set<string>()
  if (!index.byId.has(positionId)) return out
  const stack = [positionId]
  while (stack.length) {
    const id = stack.pop()!
    if (out.has(id)) continue
    out.add(id)
    for (const c of index.children.get(id) ?? []) if (!out.has(c.positionId)) stack.push(c.positionId)
  }
  return out
}

/**
 * Where each position sits for scoping: its row in the index, else (a seat whose first row takes
 * effect after the as-of date) its first row. Positions in the data only.
 */
export function placementRows(
  positions: readonly PositionRow[],
  index: PositionIndex,
): ReadonlyMap<string, PositionRow> {
  const out = new Map<string, PositionRow>(index.byId)
  for (const r of positions) {
    if (!r || typeof r.positionId !== 'string' || !r.positionId || index.byId.has(r.positionId)) continue
    const cur = out.get(r.positionId)
    if (!cur || r.effectiveDate < cur.effectiveDate) out.set(r.positionId, r)
  }
  return out
}

/**
 * The seat each person holds on the as-of date (the latest assignment active then), else their
 * latest assignment. A person's assignment starts on `assignmentStart` (blank: the hire date) and
 * ends on `assignmentEnd` (blank: the termination date), both days included.
 */
export function seatsOf(workers: readonly WorkerRow[], asOf: ISODate): ReadonlyMap<string, string> {
  const best = new Map<string, { positionId: string; start: ISODate; active: boolean }>()
  for (const w of workers) {
    if (!w?.positionId || !w.employeeId) continue
    const start = w.assignmentStart || w.hireDate || ''
    const end = w.assignmentEnd || w.terminationDate || null
    const active = !!start && isActiveOn({ start, end }, asOf)
    const cur = best.get(w.employeeId)
    if (!cur || (active && !cur.active) || (active === cur.active && start >= cur.start))
      best.set(w.employeeId, { positionId: w.positionId, start, active })
  }
  return new Map([...best].map(([id, b]) => [id, b.positionId]))
}

/** The name of the person in each seat on the as-of date (the latest one to start, if two overlap). */
export function holderNames(workers: readonly WorkerRow[], asOf: ISODate): ReadonlyMap<string, string> {
  const out = new Map<string, { name: string; start: ISODate }>()
  for (const w of workers) {
    if (!w?.positionId || !w.name || w.workerType !== 'Employee') continue
    const start = w.assignmentStart || w.hireDate || ''
    if (!start || !isActiveOn({ start, end: w.assignmentEnd || w.terminationDate || null }, asOf)) continue
    const cur = out.get(w.positionId)
    if (!cur || start >= cur.start) out.set(w.positionId, { name: w.name, start })
  }
  return new Map([...out].map(([id, x]) => [id, x.name]))
}

/* ───────────── values of each dimension ───────────── */

/** A record's value for each list dimension; null where it has none. */
export type OrgValues = Record<ListDimension, string | null>

const blank = (v: string | null | undefined): string | null => (v == null || v === '' ? null : v)

/** Legal entity (blank reads the location's), country and currency from a record's location. */
function siteValues(
  location: string | null | undefined,
  legalEntity: string | null | undefined,
): Pick<OrgValues, 'legalEntity' | 'country' | 'currency'> {
  const site = location ? siteByLocation.get(location) : undefined
  return {
    legalEntity: blank(legalEntity) ?? site?.legalEntity ?? null,
    country: site?.country ?? null,
    currency: site?.currency ?? null,
  }
}

/** A position row's values: its own org fields, and its location's legal entity, country and currency. */
export function positionValues(r: PositionRow): OrgValues {
  return {
    businessUnit: blank(r.businessUnit),
    department: blank(r.department),
    costCenter: blank(r.costCenter),
    location: blank(r.location),
    level: blank(r.level),
    ...siteValues(r.location, r.legalEntity),
  }
}

/** A worker row's own HRIS values (used for people who hold no position). */
export function workerValues(w: WorkerRow): OrgValues {
  return {
    businessUnit: blank(w.businessUnit),
    department: blank(w.department),
    costCenter: blank(w.costCenter),
    location: blank(w.location),
    level: blank(w.level),
    ...siteValues(w.location, w.legalEntity),
  }
}

/**
 * A request's values: its own org fields, each blank one read from the seat it touches
 * (`positionId`) when the data has it. A Level change carries the new level.
 */
export function requestValues(r: RequestRow, seat?: PositionRow | null): OrgValues {
  const own: OrgValues = {
    businessUnit: blank(r.businessUnit),
    department: blank(r.department),
    costCenter: blank(r.costCenter),
    location: blank(r.location),
    level: blank(r.level),
    legalEntity: null,
    country: null,
    currency: null,
  }
  const s = seat ? positionValues(seat) : null
  const out = { ...own }
  for (const d of LIST_DIMENSIONS) out[d] = own[d] ?? s?.[d] ?? null
  const site = siteValues(out.location, own.location ? null : s?.legalEntity)
  return { ...out, ...site }
}

/** The positions a request touches: its seat, the seat a new one reports to, the seats a trade gives, a transfer's seats. */
export function requestPositions(r: RequestRow): string[] {
  const ids = [
    r.positionId,
    r.managerPositionId,
    r.giveOrgPositionId,
    ...splitIds(r.givePositionIds),
    r.fromPositionId,
    r.toManagerPositionId,
    r.toPositionId,
  ]
  return [...new Set(ids.filter((x): x is string => typeof x === 'string' && x !== ''))]
}

/* ───────────── scoping ───────────── */

/**
 * A test for one list dimension, or null when it has no values. Include: the value is one of them.
 * Exclude: it is not (a blank value stays in).
 */
function listTest(filters: Filters, dim: ListDimension): ((v: string | null | undefined) => boolean) | null {
  const set = new Set(filters[dim])
  if (!set.size) return null
  return isExcluded(filters, dim)
    ? (v) => !(v != null && v !== '' && set.has(v))
    : (v) => v != null && set.has(v)
}

/** The filters' tests over one dataset snapshot, shared by every dataset's matcher. */
export interface ScopeTests {
  /** The scope cannot place a record (no position, no person): it stays only when every set filter excludes. */
  unknownOk: boolean
  /** Whether a position (in the index, or starting later) is in the leader's tree; false without a leader filter. */
  inTree: (positionId: string) => boolean
  /** The leader filter on "is in the tree": include keeps the tree, exclude keeps the rest, none keeps all. */
  leaderOk: (inTree: boolean) => boolean
  /** Every list dimension with values passes. */
  valuesOk: (v: OrgValues) => boolean
  /** A position in scope; undefined for a position the data does not have. */
  positionOk: (positionId: string) => boolean | undefined
  /** Where each position sits (see `placementRows`). */
  place: ReadonlyMap<string, PositionRow>
}

/** The tests the filters make over these positions and this index. */
export function scopeTests(
  positions: readonly PositionRow[],
  filters: Filters,
  index: PositionIndex,
): ScopeTests {
  const sub = filters.leaderId ? subtreeIds(index, filters.leaderId) : null
  const leaderOut = isExcluded(filters, 'leaderId')
  const place = placementRows(positions, index)
  const inTree = (positionId: string): boolean => {
    if (!sub) return false
    const seen = new Set<string>()
    let cur: string | null | undefined = positionId
    // A seat not yet in effect follows its first row's manager up to a seat in the index.
    while (cur && !seen.has(cur)) {
      if (sub.has(cur)) return true
      if (index.byId.has(cur)) return false
      seen.add(cur)
      cur = place.get(cur)?.managerPositionId
    }
    return false
  }
  const leaderOk = (t: boolean): boolean => !sub || (leaderOut ? !t : t)
  const lists: [ListDimension, (v: string | null | undefined) => boolean][] = []
  for (const d of LIST_DIMENSIONS) {
    const t = listTest(filters, d)
    if (t) lists.push([d, t])
  }
  const valuesOk = (v: OrgValues): boolean => lists.every(([d, t]) => t(v[d]))
  const memo = new Map<string, boolean>()
  const positionOk = (id: string): boolean | undefined => {
    const hit = memo.get(id)
    if (hit !== undefined) return hit
    const row = place.get(id)
    if (!row) return undefined
    const ok = leaderOk(inTree(id)) && valuesOk(positionValues(row))
    memo.set(id, ok)
    return ok
  }
  return { unknownOk: !anyInclude(filters), inTree, leaderOk, valuesOk, positionOk, place }
}

/** The rows that pass, or the same array when every row does (so unchanged datasets keep their identity). */
function keep<T>(rows: T[], ok: (r: T) => boolean): T[] {
  const out = rows.filter(ok)
  return out.length === rows.length ? rows : out
}

/**
 * The datasets cut to the filters' org dimensions (not the period: windows are each engine's own,
 * src/data/fiscal.ts). Positions match on their row in the index; every other dataset follows the
 * module comment above. Returns a full `Datasets` (every key present), new arrays only for the
 * datasets a filter changes.
 *
 * In detail:
 *  - positions: every row of a position whose placement row passes (`placementRows`: a seat that
 *    starts after the as-of date is placed by its first row, and is in a leader's tree when its
 *    manager is);
 *  - workers: each assignment by the position it holds; a person with no position (not in plan), or
 *    one the positions do not have, by their own HRIS fields, and in a leader's tree when their
 *    manager's seat is (`seatsOf`);
 *  - comp: the rows of people with an assignment in scope;
 *  - reqs: by their position;
 *  - requests: in a leader's tree when any position they touch is (`requestPositions`), and by their
 *    own fields, a blank one read from the seat they touch (`requestValues`);
 *  - targets and freezes: by unit, department and cost center, and in a leader's tree by
 *    `leaderPositionId`. They carry no location, level, legal entity, country or currency, so an
 *    include filter on those leaves them out and an exclude filter keeps them;
 *  - assumptions: never scoped.
 * A record the scope cannot place (a req with no position, comp of nobody in the data) stays only
 * when every filter with values excludes.
 */
export function scopeDatasets(input: Datasets, filters: Filters, index: PositionIndex): Datasets {
  const all = withAllDatasets(input)
  if (!hasOrgFilter(filters)) return all
  const t = scopeTests(all.positions, filters, index)
  const managerSeat = filters.leaderId ? seatsOf(all.workers, index.asOf) : null

  const positions = keep(all.positions, (r) => t.positionOk(r.positionId) ?? t.unknownOk)

  const workers = keep(all.workers, (w) => {
    const held = w.positionId ? t.positionOk(w.positionId) : undefined
    if (held !== undefined) return held
    if (managerSeat) {
      const seat = w.managerId ? managerSeat.get(w.managerId) : undefined
      if (!t.leaderOk(!!seat && t.inTree(seat))) return false
    }
    return t.valuesOk(workerValues(w))
  })

  const inScope = new Set(workers.map((w) => w.employeeId))
  const known = new Set(all.workers.map((w) => w.employeeId))
  const comp = keep(all.comp, (c) => inScope.has(c.employeeId) || (t.unknownOk && !known.has(c.employeeId)))

  const reqs = keep(all.reqs, (r) => (r.positionId ? t.positionOk(r.positionId) : undefined) ?? t.unknownOk)

  const requests = keep(all.requests, (r) => {
    if (filters.leaderId && !t.leaderOk(requestPositions(r).some((id) => t.inTree(id)))) return false
    const seat = r.positionId ? t.place.get(r.positionId) : undefined
    return t.valuesOk(requestValues(r, seat))
  })

  const orgRowOk = (r: {
    businessUnit: string
    department?: string | null
    costCenter?: string | null
    leaderPositionId?: string | null
  }): boolean => {
    if (filters.leaderId && !t.leaderOk(!!r.leaderPositionId && t.inTree(r.leaderPositionId))) return false
    return t.valuesOk({
      businessUnit: blank(r.businessUnit),
      department: blank(r.department),
      costCenter: blank(r.costCenter),
      location: null,
      level: null,
      legalEntity: null,
      country: null,
      currency: null,
    })
  }

  return {
    positions,
    workers,
    comp,
    reqs,
    requests,
    targets: keep(all.targets, orgRowOk),
    freezes: keep(all.freezes, orgRowOk),
    // Rates and drivers, the same for every org.
    assumptions: all.assumptions,
  }
}

/* ───────────── labels and the as-of date ───────────── */

/** "A, B" for up to two values, else "A +2". */
const listText = (xs: readonly string[]) => (xs.length <= 2 ? xs.join(', ') : `${xs[0]} +${xs.length - 1}`)

/** "A", "A and B", "A, B and C". */
const andList = (xs: readonly string[]) =>
  xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`

/**
 * Plain-English label for the scope: "Silicon Engineering · Bengaluru" for inclusions, "Whole
 * company except Sales" when everything is an exclusion, and "Silicon Engineering · not Bengaluru ·
 * not in Dana Ito's org" for a mix. The leader is named by its own label where the caller has one
 * (`leaderLabel`: a scope's "Sebastian Wagner's team"), else by the person in the seat (`nameOf`,
 * such as `holderNames`), else by the position ID ("The org under P-1001").
 */
export function scopeLabel(
  filters: Filters,
  nameOf?: (positionId: string) => string | null | undefined,
  leaderLabel?: (positionId: string) => string | null | undefined,
): string {
  const inc: string[] = []
  const exc: { text: string; leader: boolean }[] = []
  if (filters.leaderId) {
    const own = leaderLabel?.(filters.leaderId)
    const name = own ? null : nameOf?.(filters.leaderId)
    const text = own ?? (name ? `${name}'s org` : `the org under ${filters.leaderId}`)
    if (isExcluded(filters, 'leaderId')) exc.push({ text, leader: true })
    else inc.push(own || name ? text : `The org under ${filters.leaderId}`)
  }
  for (const dim of LIST_DIMENSIONS) {
    const xs = filters[dim]
    if (!xs.length) continue
    if (isExcluded(filters, dim)) exc.push({ text: listText(xs), leader: false })
    else inc.push(listText(xs))
  }
  if (!inc.length && !exc.length) return 'Whole company'
  if (!inc.length) return `Whole company except ${andList(exc.map((x) => x.text))}`
  return [...inc, ...exc.map((x) => (x.leader ? `not in ${x.text}` : `not ${x.text}`))].join(' · ')
}

/**
 * A scope label inside a sentence: "the whole company except Sales" instead of "Whole company except
 * Sales". Other labels are names and stay as they are.
 */
export const scopeInSentence = (label: string): string =>
  label.startsWith('Whole company') ? `the whole company${label.slice('Whole company'.length)}` : label

/**
 * The as-of date: the override when set, else the latest date found in the data on or before today
 * (hires, exits, assignments, position rows, pay rows, reqs and requests). Future-dated rows (planned
 * starts) do not move it. Sample data passes its own fixed date instead.
 */
export function resolveAsOf(data: Partial<Datasets>, today: ISODate, override?: ISODate | null): ISODate {
  if (override) return override
  let latest = ''
  const see = (d: string | null | undefined) => {
    if (typeof d === 'string' && d.length >= 10) {
      const x = d.slice(0, 10)
      if (x <= today && x > latest) latest = x
    }
  }
  const all = withAllDatasets(data)
  for (const w of all.workers) {
    see(w.hireDate)
    see(w.terminationDate)
    see(w.assignmentStart)
    see(w.assignmentEnd)
  }
  for (const p of all.positions) see(p.effectiveDate)
  for (const c of all.comp) see(c.effectiveDate)
  for (const r of all.reqs) {
    see(r.openedDate)
    see(r.offerAcceptedDate)
    see(r.closedDate)
  }
  for (const r of all.requests) {
    see(r.submittedAt)
    see(r.updatedAt)
  }
  return latest || today
}

/**
 * Active on day `d`: started on or before it, and no last day or a last day on or after it. The last
 * day counts (docs/PLAN.md 6.1, 15.1 R19: a last day of 30 Sep is 1 head at 30 Sep and 0 at 1 Oct).
 */
export function isActiveOn(a: { start: ISODate; end?: ISODate | null }, d: ISODate): boolean {
  return a.start <= d && (a.end == null || a.end >= d)
}
