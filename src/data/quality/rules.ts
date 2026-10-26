/**
 * The facts the tier rules are built from, computed on loaded rows: references that do not
 * resolve, dates out of order, duplicate rows, position IDs used again after a seat was
 * eliminated, reason codes a request type does not offer, how current the data is, and control
 * totals. Pure; each returns row indexes so every number can drill to its rows.
 */
import { addMonths, daysBetween } from '@/lib/dates'
import {
  type AssumptionRow,
  type CompRow,
  type DatasetKey,
  type Datasets,
  type ISODate,
  REASON_CODES_OF,
  type RequestType,
  siteByLocation,
  splitIds,
  type WorkerRow,
} from '../schema'
import { dedupeKey } from './importSummary'
import type { ControlMetricId, ControlTotal } from './types'

type Row = Record<string, unknown>

/* ───────────── references ───────────── */

export interface Link {
  fields: string[]
  target: DatasetKey
  targetKey: string
  /** The fields hold several IDs separated by ";" (a trade's give seats). */
  multi?: boolean
}

/**
 * References to other datasets (docs/PLAN.md 5.2): fields → the dataset and key they must resolve
 * in. A dataset can have several links (workers point at positions and at other workers).
 */
export const LINKS: Partial<Record<DatasetKey, Link[]>> = {
  positions: [{ fields: ['managerPositionId'], target: 'positions', targetKey: 'positionId' }],
  workers: [
    { fields: ['positionId'], target: 'positions', targetKey: 'positionId' },
    { fields: ['managerId'], target: 'workers', targetKey: 'employeeId' },
  ],
  comp: [{ fields: ['employeeId'], target: 'workers', targetKey: 'employeeId' }],
  reqs: [{ fields: ['positionId'], target: 'positions', targetKey: 'positionId' }],
  requests: [
    { fields: ['positionId', 'giveOrgPositionId'], target: 'positions', targetKey: 'positionId' },
    { fields: ['givePositionIds'], target: 'positions', targetKey: 'positionId', multi: true },
  ],
  targets: [{ fields: ['leaderPositionId'], target: 'positions', targetKey: 'positionId' }],
}

/** Most rows may hold an unresolved reference before the check fails (2%). */
export const MAX_UNRESOLVED_SHARE = 0.02

/** Silver needs a field filled for at least this share of the rows it applies to. */
export const MIN_COVERAGE = 0.95
/** Silver allows at most this share of values not recognized or defaulted. */
export const MAX_PROBLEM_SHARE = 0.02
/** Silver allows at most this share of rows with an import error. */
export const MAX_ISSUE_RATE = 0.02

export interface RefCheck {
  link: Link
  /** Rows holding at least one reference. */
  withRef: number
  /** Indexes of rows with a reference that does not resolve. */
  rows: number[]
  /** The target dataset has no rows, so nothing can resolve. */
  targetEmpty: boolean
}

/** Each of the dataset's links checked against the loaded data, in `LINKS` order (empty when it has none). */
export function checkReferences(key: DatasetKey, data: Datasets): RefCheck[] {
  const links = LINKS[key] ?? []
  return links.map((link) => {
    const targetRows = data[link.target] as unknown as readonly Row[]
    const ids = new Set<unknown>()
    for (const t of targetRows) ids.add(t[link.targetKey])
    const rows: number[] = []
    let withRef = 0
    ;(data[key] as unknown as readonly Row[]).forEach((r, i) => {
      let any = false
      let bad = false
      for (const f of link.fields) {
        const v = r[f]
        if (v == null || v === '') continue
        const refs = link.multi ? splitIds(String(v)) : [v]
        for (const ref of refs) {
          any = true
          if (!ids.has(ref)) bad = true
        }
      }
      if (any) withRef++
      if (bad) rows.push(i)
    })
    return { link, withRef, rows, targetEmpty: targetRows.length === 0 }
  })
}

/* ───────────── dates in order ───────────── */

/** Date fields that must not go backwards, in the order they happen (blank ones are skipped). */
export const DATE_SEQUENCES: Partial<Record<DatasetKey, string[][]>> = {
  workers: [
    ['hireDate', 'assignmentStart', 'assignmentEnd'],
    ['hireDate', 'terminationDate'],
  ],
  reqs: [
    ['openedDate', 'offerAcceptedDate', 'startDate'],
    ['openedDate', 'closedDate'],
  ],
  requests: [['submittedAt', 'updatedAt']],
  freezes: [['startDate', 'endDate']],
}

/** Indexes of rows where a later step is dated before an earlier one. */
export function datesOutOfOrder(key: DatasetKey, rows: readonly object[]): number[] {
  const seqs = DATE_SEQUENCES[key]
  if (!seqs) return []
  const out: number[] = []
  ;(rows as readonly Row[]).forEach((r, i) => {
    for (const seq of seqs) {
      let prev = ''
      for (const f of seq) {
        const v = r[f]
        if (typeof v !== 'string' || v.length < 10) continue
        if (prev && v < prev) {
          out.push(i)
          return
        }
        prev = v
      }
    }
  })
  return out
}

/* ───────────── duplicates ───────────── */

/**
 * Indexes of rows whose row key repeats an earlier row's, blanks read as the dataset reads them
 * (`dedupeKey`: a worker's blank assignment start is the hire date), as the importer de-duplicates.
 */
export function duplicateRows(key: DatasetKey, rows: readonly object[]): number[] {
  const seen = new Set<string>()
  const out: number[] = []
  ;(rows as readonly Row[]).forEach((r, i) => {
    const k = dedupeKey(key, r)
    if (seen.has(k)) out.push(i)
    else seen.add(k)
  })
  return out
}

/* ───────────── positions and requests ───────────── */

/**
 * Indexes of position rows that use an ID again after its seat was eliminated: a row of any other
 * status dated after an Eliminated row of the same position. Position IDs are never reused.
 */
export function reusedPositionIds(rows: readonly object[]): number[] {
  const eliminatedFrom = new Map<string, string>()
  for (const r of rows as readonly Row[]) {
    const id = r.positionId
    const at = r.effectiveDate
    if (r.status !== 'Eliminated' || typeof id !== 'string' || typeof at !== 'string') continue
    const cur = eliminatedFrom.get(id)
    if (cur == null || at < cur) eliminatedFrom.set(id, at)
  }
  const out: number[] = []
  ;(rows as readonly Row[]).forEach((r, i) => {
    const from = typeof r.positionId === 'string' ? eliminatedFrom.get(r.positionId) : undefined
    if (
      from != null &&
      r.status !== 'Eliminated' &&
      typeof r.effectiveDate === 'string' &&
      r.effectiveDate > from
    )
      out.push(i)
  })
  return out
}

/**
 * Indexes of requests whose reason code is not one New request offers for their type
 * (`REASON_CODES_OF`). A quality warning, never a refusal: the import keeps them. "Below the cut
 * line" on a rejected cycle ask is the system's own reason and is not flagged.
 */
export function reasonsNotOffered(rows: readonly object[]): number[] {
  const out: number[] = []
  ;(rows as readonly Row[]).forEach((r, i) => {
    const type = r.type as RequestType
    const reason = r.reasonCode
    if (typeof reason !== 'string' || !Object.hasOwn(REASON_CODES_OF, type)) return
    if (reason === 'Below the cut line' && r.state === 'Rejected') return
    if (!(REASON_CODES_OF[type] as readonly string[]).includes(reason)) out.push(i)
  })
  return out
}

/* ───────────── freshness ───────────── */

/** The event dates that say how current a dataset is, and how old the latest may be. */
export const FRESHNESS: Partial<Record<DatasetKey, { fields: string[]; what: string; maxDays: number }>> = {
  workers: {
    fields: ['hireDate', 'terminationDate', 'assignmentStart'],
    what: 'hire, exit or move',
    maxDays: 120,
  },
  reqs: { fields: ['openedDate'], what: 'requisition', maxDays: 90 },
  requests: { fields: ['updatedAt', 'submittedAt'], what: 'request update', maxDays: 90 },
}

/**
 * Datasets whose rows carry no event dates that say how current they are, such as a pay snapshot:
 * judged by the date the extract describes (its load date; for the generated sample, the date the
 * sample describes).
 */
export const SNAPSHOT_FRESHNESS: Partial<Record<DatasetKey, { what: string; maxDays: number }>> = {
  comp: { what: 'pay extract', maxDays: 45 },
}

export interface Freshness {
  /** Latest event date on or before the as-of date; null when there is none. */
  latest: ISODate | null
  /** Days from the latest event to the as-of date. */
  ageDays: number | null
  maxDays: number | null
  what: string | null
  fresh: boolean
}

export function freshness(
  key: DatasetKey,
  rows: readonly object[],
  asOf: ISODate,
  /** The date a snapshot dataset describes (see `SNAPSHOT_FRESHNESS`); null when unknown. */
  snapshot: ISODate | null = null,
  /** The limit in days, from the quality rules; the dataset's default when not given. */
  limitDays?: number,
): Freshness {
  const rule = FRESHNESS[key]
  if (!rule) {
    const snap = SNAPSHOT_FRESHNESS[key]
    if (!snap) return { latest: null, ageDays: null, maxDays: null, what: null, fresh: true }
    const maxDays = validDays(limitDays) ?? snap.maxDays
    if (!snapshot || snapshot.length < 10)
      return { latest: null, ageDays: null, maxDays, what: snap.what, fresh: false }
    const latest = snapshot.slice(0, 10)
    // A snapshot taken after the as-of date is current for it.
    const ageDays = Math.max(0, daysBetween(latest, asOf))
    return { latest, ageDays, maxDays, what: snap.what, fresh: ageDays <= maxDays }
  }
  const maxDays = validDays(limitDays) ?? rule.maxDays
  let latest = ''
  for (const r of rows as readonly Row[])
    for (const f of rule.fields) {
      const v = r[f]
      if (typeof v !== 'string' || v.length < 10) continue
      const d = v.slice(0, 10)
      if (d <= asOf && d > latest) latest = d
    }
  if (!latest) return { latest: null, ageDays: null, maxDays, what: rule.what, fresh: false }
  const ageDays = daysBetween(latest, asOf)
  return { latest, ageDays, maxDays, what: rule.what, fresh: ageDays <= maxDays }
}

const validDays = (d: number | undefined): number | null =>
  typeof d === 'number' && Number.isFinite(d) && d > 0 ? d : null

/* ───────────── control totals ───────────── */

/** Default allowed difference for a control total: 0.5%. */
export const DEFAULT_TOLERANCE = 0.005

export interface ControlMetric {
  id: ControlMetricId
  label: string
  /** Datasets it can reconcile. */
  datasets: DatasetKey[]
  /** A pay amount: shown only when pay amounts are on. */
  pay?: boolean
  compute: (data: Datasets, key: DatasetKey, asOf: ISODate) => number | null
}

/** Employed on `d`: hired on or before it, and no last day or one on or after it (the last day counts). */
const employedOn = (w: WorkerRow, d: ISODate) =>
  typeof w.hireDate === 'string' && w.hireDate <= d && (!w.terminationDate || w.terminationDate >= d)

/** Distinct people employed on `d`, of the worker types `test` accepts. */
function peopleOn(workers: readonly WorkerRow[], d: ISODate, test: (w: WorkerRow) => boolean): number {
  const ids = new Set<string>()
  for (const w of workers) if (test(w) && employedOn(w, d)) ids.add(w.employeeId)
  return ids.size
}

/** Each position's latest row on or before `d` (the seat as it stands that day). */
function seatsOn(data: Datasets, d: ISODate): Map<string, Datasets['positions'][number]> {
  const out = new Map<string, Datasets['positions'][number]>()
  for (const p of data.positions) {
    if (p.effectiveDate > d) continue
    const cur = out.get(p.positionId)
    if (!cur || p.effectiveDate >= cur.effectiveDate) out.set(p.positionId, p)
  }
  return out
}

/** USD per 1 unit of `currency` at plan rates for the as-of month (else its latest plan month before). */
function planRate(assumptions: readonly AssumptionRow[], currency: string, asOf: ISODate): number | null {
  if (currency === 'USD') return 1
  const month = asOf.slice(0, 7)
  let best: { month: string; value: number } | null = null
  for (const a of assumptions) {
    if (a.table !== 'fx' || (a.org != null && a.org !== '')) continue
    const [ccy, set, m] = a.key.split('|')
    if (ccy !== currency || set !== 'plan' || !m || m > month) continue
    if (!best || m > best.month) best = { month: m, value: a.value }
  }
  return best?.value ?? null
}

/**
 * Total full-time base in USD at plan rates for the as-of month: each person's latest pay row on
 * or before the as-of date, in its currency (blank: the person's location's).
 */
function totalBaseUsd(data: Datasets, asOf: ISODate): number {
  const latest = new Map<string, CompRow>()
  for (const c of data.comp) {
    if (c.effectiveDate > asOf) continue
    const cur = latest.get(c.employeeId)
    if (!cur || c.effectiveDate >= cur.effectiveDate) latest.set(c.employeeId, c)
  }
  const locationOf = new Map<string, string>()
  for (const w of data.workers) if (w.location) locationOf.set(w.employeeId, w.location)
  let sum = 0
  for (const [id, c] of latest) {
    const loc = locationOf.get(id)
    const currency = c.currency || (loc ? siteByLocation.get(loc)?.currency : undefined) || 'USD'
    const rate = planRate(data.assumptions, currency, asOf)
    if (rate != null && Number.isFinite(c.baseSalary)) sum += c.baseSalary * rate
  }
  return Math.round(sum)
}

const PENDING = new Set(['Submitted', 'In review', 'Sent back'])

export const CONTROL_METRICS: Record<ControlMetricId, ControlMetric> = {
  rows: {
    id: 'rows',
    label: 'Rows',
    datasets: ['positions', 'workers', 'comp', 'reqs', 'requests', 'targets', 'freezes', 'assumptions'],
    compute: (data, key) => data[key].length,
  },
  activeHeadcount: {
    id: 'activeHeadcount',
    label: 'Headcount (employees on the as-of date, on leave included)',
    datasets: ['workers'],
    compute: (data, _k, asOf) => peopleOn(data.workers, asOf, (w) => w.workerType === 'Employee'),
  },
  activeWorkers: {
    id: 'activeWorkers',
    label: 'Active workers, including contractors and interns',
    datasets: ['workers'],
    compute: (data, _k, asOf) => peopleOn(data.workers, asOf, () => true),
  },
  exits12m: {
    id: 'exits12m',
    label: 'Employee exits in the last 12 months',
    datasets: ['workers'],
    compute: (data, _k, asOf) => {
      const start = addMonths(asOf, -12)
      const ids = new Set<string>()
      for (const w of data.workers)
        if (
          w.workerType === 'Employee' &&
          w.terminationDate &&
          w.terminationDate > start &&
          w.terminationDate <= asOf
        )
          ids.add(w.employeeId)
      return ids.size
    },
  },
  filledPositions: {
    id: 'filledPositions',
    label: 'Filled positions',
    datasets: ['positions'],
    compute: (data, _k, asOf) =>
      [...seatsOn(data, asOf).values()].filter((p) => p.status === 'Filled').length,
  },
  openPositions: {
    id: 'openPositions',
    label: 'Open and Planned positions',
    datasets: ['positions'],
    compute: (data, _k, asOf) =>
      [...seatsOn(data, asOf).values()].filter((p) => p.status === 'Open' || p.status === 'Planned').length,
  },
  totalBaseUsd: {
    id: 'totalBaseUsd',
    label: 'Total full-time base salary in USD at plan rates',
    datasets: ['comp'],
    pay: true,
    compute: (data, _k, asOf) => totalBaseUsd(data, asOf),
  },
  openReqs: {
    id: 'openReqs',
    label: 'Open requisitions',
    datasets: ['reqs'],
    compute: (data) => data.reqs.filter((r) => r.status === 'Open').length,
  },
  pendingRequests: {
    id: 'pendingRequests',
    label: 'Requests waiting on a decision',
    datasets: ['requests'],
    compute: (data) => data.requests.filter((r) => PENDING.has(r.state)).length,
  },
}

/** The control totals a dataset can be reconciled to. */
export const controlMetricsFor = (key: DatasetKey): ControlMetric[] =>
  Object.values(CONTROL_METRICS).filter((m) => m.datasets.includes(key))

export function computeControlTotal(
  metric: ControlMetricId,
  data: Datasets,
  key: DatasetKey,
  asOf: ISODate,
): number | null {
  const m = Object.hasOwn(CONTROL_METRICS, metric) ? CONTROL_METRICS[metric] : undefined
  if (!m?.datasets.includes(key)) return null
  return m.compute(data, key, asOf)
}

/**
 * True when `actual` is within the control total's tolerance of what was expected. A total that
 * states no valid tolerance of its own uses `fallback` (the quality rules' tolerance).
 */
export function reconciles(
  total: Pick<ControlTotal, 'expected' | 'tolerance'>,
  actual: number | null,
  fallback: number = DEFAULT_TOLERANCE,
): boolean {
  if (actual == null || !Number.isFinite(actual)) return false
  const tol = Number.isFinite(total.tolerance) && total.tolerance >= 0 ? total.tolerance : fallback
  if (total.expected === 0) return actual === 0
  return Math.abs(actual - total.expected) <= tol * Math.abs(total.expected) + 1e-9
}

/* ───────────── the rules, as settings ───────────── */

/**
 * The thresholds the tier rules use. The defaults are the constants above; the metric dictionary
 * (Data quality rules, `src/metrics/quality.ts`) can change them, and the analytics context passes
 * the values in force to `computeQuality`.
 */
export interface QualityRules {
  /** Silver needs a field filled for at least this share of the rows it applies to (0.95). */
  minCoverage: number
  /**
   * Silver allows at most this share of values not recognized or defaulted, of rows with an
   * import error, and of rows whose references don't resolve (0.02).
   */
  maxProblemShare: number
  /** Allowed difference for a control total that doesn't state its own, and the default for new ones (0.005). */
  tolerance: number
  /** Most days from the latest event (or the pay extract) to the as-of date, per dataset. */
  freshDays: Partial<Record<DatasetKey, number>>
}

/** Every dataset's freshness limit in days, from `FRESHNESS` and `SNAPSHOT_FRESHNESS`. */
export const DEFAULT_FRESH_DAYS: Partial<Record<DatasetKey, number>> = Object.fromEntries([
  ...Object.entries(FRESHNESS).map(([k, r]) => [k, r!.maxDays]),
  ...Object.entries(SNAPSHOT_FRESHNESS).map(([k, r]) => [k, r!.maxDays]),
])

export const DEFAULT_QUALITY_RULES: QualityRules = {
  minCoverage: MIN_COVERAGE,
  maxProblemShare: MAX_PROBLEM_SHARE,
  tolerance: DEFAULT_TOLERANCE,
  freshDays: DEFAULT_FRESH_DAYS,
}
