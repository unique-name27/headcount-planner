/**
 * The Audit page's model (docs/PLAN.md 9.4, 10.7, 8.4 rule 7): the entries the viewer may see, each
 * through `auditView` (src/access/visibility.ts), scoped to the mode's scope, newest first, with
 * filters by object, person and date. Outside HR admin a row has no `seq`, `prevHash` or `hash`, pay
 * and cost fields read "changed", and the count is "n entries" over the rows the viewer can see
 * (rule 6); "Chain checks out (n entries)" (`verifyChain`, synchronous) shows in HR admin only. Copy
 * says "Each entry carries a checksum of the one before it, so damage shows." One model per analytics
 * context (`auditModel`, cached in a WeakMap).
 *
 * Readings taken here (the views-3 builder's):
 *  - An entry belongs to a request (8.4 rule 7) when it is the request's own (`request` and
 *    `transfer` entries by ID), or a `position` entry its approval wrote: the position the request
 *    created (`sourceRequestId`), or one it touches, written at the same moment as the request's
 *    last change.
 *  - The scope: a position entry keeps to the scope's positions (`auditView`); a request or transfer
 *    entry to the requests in scope; a target entry to the targets of the unit or the tree (its
 *    `targetKey` ID names the unit and the leader seat); a freeze entry to the freezes in scope. Version,
 *    assumption, cycle, close and workspace entries are the company's, shown in every mode that shows
 *    the page (their pay and cost values read "changed" outside HR admin).
 *  - HR admin's chain check reads the whole loaded log in `seq` order; its rows keep their chain
 *    fields and the table shows the sequence number.
 *  - Where the mode hides the Audit page (Manager: `page:audit`), the model keeps only what the
 *    position card and the request records show (8.3: "Changes to your requests show on the
 *    requests"): position entries about the tree's seats and request or transfer entries whose
 *    request is in the tree and visible to the acting manager. Assumption, version, cycle (a cut line
 *    included), close, workspace, target and freeze entries are the company's or another org's, and
 *    never reach Manager mode. Every old or new value there that reads as an amount (a currency sign
 *    or code, or a number of 1,000 or more) reads "changed", whatever the field is called (7.6).
 *
 * M3 (workspace-ui) readings, for the entries the write path adds:
 *  - Audit entries are plan state, not a dataset, so the page's figure and KPI read no dataset field
 *    and take no data tier (M2 browser finding B4: the tile read the requests dataset's bronze).
 *  - Outside HR admin, a count an entry carries that was taken over rows the viewer may not see
 *    reads "changed" (8.4 rule 6): an Import requests or workspace entry's counts (merged, files,
 *    conflicts, skipped: counted for the importer), and a month close's number of back-dated
 *    adjustments (it holds the Other HRIS change count, which shows only at 5 or more, 9.4).
 *  - A cycle's ranked order lists only the requests the viewer may see (rule 3: a request hidden
 *    from the viewer is no ID on any surface).
 *  - A reconciliation review about a person with no position (object 'workspace', ID the employee)
 *    keeps to the scope by that person.
 *  - `viewAuditRows` is the page's rule as one function, so "Open a shared file" shows a file's audit
 *    rows exactly as this page would show them in the current mode.
 *
 * M3 review readings (workspace-ui):
 *  - A position entry an approval wrote belongs to its request through the request's own entries in
 *    the same log: every entry one action writes carries the same `at` (the action's wall clock), so
 *    a position entry whose `at` is a request or transfer entry's is that request's (the one that
 *    touches the seat, or the only one), however the request changed later (PV-5). The seat's
 *    `sourceRequestId` still links the seat a request created. In an opened file, outside HR admin, a
 *    position entry whose request entry names a request the file does not carry is left out: the
 *    opener cannot tell how much of it they may read. So is one an import wrote (it shares its `at`
 *    with the import's 'workspace' entry) that links to no request: an approval a file brought,
 *    whose request entry the log does not hold (M3 recheck; the import writes one now).
 *  - The Field column reads each field in words (./labels.ts `fieldLabel`), and the values that name
 *    people read their names: a chain of steps reads "HRBP Zhiwei Zhou, Leader Veronica Ortiz" (B7,
 *    UI-14). The rows carry these values, so every export and file of the page carries them too.
 *  - HR admin's chain check also compares the log with the plan state's chain head
 *    (`PlanState.auditHead`), so a lost tail reads "The chain breaks at entry n." (IN-10).
 *
 * Frozen in the M2 freeze (docs/CONTRACTS-M2.md); the views-3 builder filled the bodies and added
 * fields, never renaming or retyping these.
 */

import { MODE_LABEL } from '@/access/modes'
import { inScope } from '@/access/records'
import { auditView, CHANGED, hasAmount, requestView, type Viewer, viewerOf } from '@/access/visibility'
import type { Column } from '@/charts/types'
import type { Kpi } from '@/components/types'
import type { AnalyticsContext } from '@/data/context'
import type { FieldRef } from '@/data/quality/fieldRef'
import type { ISODate } from '@/data/schema'
import { requestsOf, workerNames } from '@/drill/seats'
import { drillSpec } from '@/drill/types'
import { formatDate } from '@/lib/dates'
import { fmt } from '@/lib/format'
import { CHAIN_NOTE, chainStatusText, entryCountText, verifyChain } from '@/plan/audit/chain'
import type { AuditEntry, AuditObject, AuditRow, HcRequest } from '@/plan/types'
import type { FigureData, TabModel } from '../../types'
import { ID } from '../metrics'
import { AUDIT_FIGURES } from './figures'
import { fieldLabel, valueWithNames, words } from './labels'

/** What the rows say about the record and its values, for the table and every export. */
export interface AuditListRow extends AuditRow {
  /** The old and new values as text ("changed" where `auditView` put it). */
  oldText: string | null
  newText: string | null
  /** HR admin only: the entry's place in the chain; null elsewhere (rows carry no chain fields there). */
  sequence: number | null
  /** "HRBP", "Finance": the mode the change was made in. */
  modeLabel: string
  /** "Position", "Request". */
  objectLabel: string
  /** The field in words ("Manager seat", "Step 2"; ./labels.ts `fieldLabel`). */
  fieldLabel: string
}

export interface AuditModel extends TabModel {
  /** `auditView` output (HR admin's entries keep their chain fields; every other mode's are `AuditRow`s). */
  entries: FigureData<AuditRow>
  /** HR admin: "Chain checks out (n entries)" or the first broken link (`chainStatusText`); elsewhere "n entries". */
  chainStatus: string
  /** HR admin: whether the chain checks out; null in every other mode. */
  chainOk: boolean | null
  /** HR admin: "Each entry carries a checksum of the one before it, so damage shows."; null elsewhere. */
  chainNote: string | null
  /** What the page's filters can pick: the record types, the people and the dates in the rows. */
  options: AuditFilterOptions
}

/** The page's own filters (on top of the scope): record type, the record itself, person and dates. */
export interface AuditFilters {
  objects: readonly AuditObject[]
  /** People by the name the rows show ("Approver" and "Requester" included where rule 7 put them). */
  people: readonly string[]
  from: ISODate | null
  to: ISODate | null
  /** Text the record's ID contains, any case ("P-2052", "r-10"); empty or absent keeps every record. */
  record?: string
}

export const NO_AUDIT_FILTERS: AuditFilters = { objects: [], people: [], from: null, to: null, record: '' }

export interface AuditFilterOptions {
  objects: readonly { value: AuditObject; label: string; count: number }[]
  people: readonly { value: string; label: string; count: number }[]
  /** The first and last dates in the rows, or null with none. */
  first: ISODate | null
  last: ISODate | null
}

/** The record types in words. */
export const OBJECT_LABEL: Readonly<Record<AuditObject, string>> = {
  position: 'Position',
  request: 'Request',
  version: 'Version',
  assumption: 'Assumption',
  target: 'Target',
  freeze: 'Freeze',
  cycle: 'Planning cycle',
  close: 'Month close',
  transfer: 'Transfer',
  workspace: 'Workspace file',
}

/**
 * The dataset fields the page's figure and KPI read: none. Audit entries are plan state (the
 * PlanStore's log), not a dataset, so they take no data tier (M2 browser finding B4).
 */
const USES: readonly FieldRef[] = []

/**
 * An audit value as text, in plain words (UI-14): a list reads its items ("R-1035, R-1040"), a record
 * its parts ("merged 14, files 6"), true and false read Yes and No.
 */
export function valueText(v: unknown): string | null {
  if (v == null || v === '') return null
  if (typeof v === 'string') return v
  if (typeof v === 'number') return String(v)
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  if (Array.isArray(v)) return v.map((x) => valueText(x) ?? '—').join(', ') || null
  if (typeof v === 'object') {
    const parts = Object.entries(v as Record<string, unknown>)
      .filter(([, x]) => x != null && x !== '')
      .map(([k, x]) => `${words(k).toLowerCase()} ${valueText(x)}`)
    return parts.join(', ') || null
  }
  return String(v)
}

/** The record filter as it is matched: trimmed, lower case; '' keeps every record. */
const recordNeedle = (f: AuditFilters): string => (f.record ?? '').trim().toLowerCase()

/** The rows that pass the page's filters, in the order given. Pure. */
export function filterAuditRows<R extends Pick<AuditRow, 'object' | 'id' | 'byName' | 'at'>>(
  rows: readonly R[],
  f: AuditFilters,
): R[] {
  const needle = recordNeedle(f)
  return rows.filter((r) => {
    if (f.objects.length && !f.objects.includes(r.object)) return false
    if (needle && !r.id.toLowerCase().includes(needle)) return false
    if (f.people.length && !f.people.includes(r.byName)) return false
    const day = r.at.slice(0, 10)
    if (f.from && day < f.from) return false
    if (f.to && day > f.to) return false
    return true
  })
}

export const isFilteringAudit = (f: AuditFilters): boolean =>
  f.objects.length > 0 || f.people.length > 0 || !!f.from || !!f.to || recordNeedle(f) !== ''

/** The filter options over the rows. */
function optionsOf(rows: readonly AuditRow[]): AuditFilterOptions {
  const objects = new Map<AuditObject, number>()
  const people = new Map<string, number>()
  let first: ISODate | null = null
  let last: ISODate | null = null
  for (const r of rows) {
    objects.set(r.object, (objects.get(r.object) ?? 0) + 1)
    people.set(r.byName, (people.get(r.byName) ?? 0) + 1)
    const d = r.at.slice(0, 10)
    if (!first || d < first) first = d
    if (!last || d > last) last = d
  }
  return {
    objects: (Object.keys(OBJECT_LABEL) as AuditObject[])
      .filter((o) => objects.has(o))
      .map((o) => ({ value: o, label: OBJECT_LABEL[o], count: objects.get(o) ?? 0 })),
    people: [...people]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([value, count]) => ({ value, label: value, count })),
    first,
    last,
  }
}

/** The seats a request touches: its own, a trade's give and get seats, a transfer's two seats. */
function seatsOf(r: HcRequest): string[] {
  const out: string[] = []
  for (const id of [
    r.positionId,
    ...(r.trade?.givePositionIds ?? []),
    r.transfer?.fromPositionId,
    r.transfer?.toPositionId,
    ...(r.outcome?.createdPositionIds ?? []),
    ...(r.outcome?.changedPositionIds ?? []),
  ])
    if (id) out.push(id)
  return out
}

/**
 * The request and transfer IDs each `at` of a log names: an action's entries share its `at`, so a
 * position entry with the same `at` was written by that action (PV-5).
 */
export function requestIdsByAt(
  entries: readonly Pick<AuditRow, 'object' | 'id' | 'at'>[],
): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const x of entries) {
    if ((x.object !== 'request' && x.object !== 'transfer') || !x.at) continue
    const list = out.get(x.at)
    if (!list) out.set(x.at, [x.id])
    else if (!list.includes(x.id)) list.push(x.id)
  }
  return out
}

/**
 * Which request an entry belongs to (8.4 rule 7), among `requests` (the context's, or a file's), with
 * `entries` the log it is in (see the module comment): its own request or transfer; for a position
 * entry, the request whose seat it created, else the request whose own entry in the log shares its
 * `at` (the one that touches the seat, or the only one), else one touching the seat changed at the
 * same minute.
 */
export function requestOfEntry(
  ctx: AnalyticsContext,
  requests: readonly HcRequest[],
  entries: readonly Pick<AuditRow, 'object' | 'id' | 'at'>[] = [],
) {
  const byId = new Map(requests.map((r) => [r.requestId, r]))
  const touching = new Map<string, HcRequest[]>()
  for (const r of requests)
    for (const id of seatsOf(r)) {
      const list = touching.get(id)
      if (list) list.push(r)
      else touching.set(id, [r])
    }
  const source = new Map<string, string>()
  for (const p of ctx.all.positions) if (p.sourceRequestId) source.set(p.positionId, p.sourceRequestId)
  const byAt = requestIdsByAt(entries)
  return (e: Pick<AuditEntry, 'object' | 'id' | 'at'>): HcRequest | null => {
    if (e.object === 'request' || e.object === 'transfer') return byId.get(e.id) ?? null
    if (e.object !== 'position') return null
    const made = source.get(e.id)
    if (made && byId.has(made)) return byId.get(made) ?? null
    const ids = byAt.get(e.at)
    if (ids) {
      const linked = ids.map((id) => byId.get(id)).filter((r): r is HcRequest => !!r)
      const hit = linked.find((r) => seatsOf(r).includes(e.id)) ?? (ids.length === 1 ? linked[0] : undefined)
      if (hit) return hit
    }
    const at = e.at.slice(0, 16)
    return (touching.get(e.id) ?? []).find((r) => r.updatedAt.slice(0, 16) === at) ?? null
  }
}

/**
 * Manager mode (the Audit page hidden): only the entries the position card and the request records
 * show, about the tree's own positions and requests (see the module comment). Position entries
 * outside the tree were already dropped by `auditView`; a position entry an approval wrote follows
 * its request.
 */
function cardEntry(ctx: AnalyticsContext, e: AuditRow, req: HcRequest | null): boolean {
  if (e.object === 'request' || e.object === 'transfer') return !!req && inScope('requests', req, ctx)
  if (e.object !== 'position') return false
  if (req) return inScope('requests', req, ctx)
  const s = ctx.access.scope
  return !!s && s.positionIds.has(e.id)
}

/** An old or new value as Manager mode may read it: "changed" when it reads as an amount (7.6). */
function managerValue(v: AuditRow['old']): AuditRow['old'] {
  if (v == null || v === CHANGED) return v
  if (typeof v === 'boolean') return v
  return hasAmount(valueText(v) ?? '') ? CHANGED : v
}

/** A company-level entry, or one about an org row, kept to the mode's scope. */
function entryInScope(ctx: AnalyticsContext, e: AuditRow, req: HcRequest | null): boolean {
  const s = ctx.access.scope
  if (!s) return true
  if (req) return inScope('requests', req, ctx)
  if (e.object === 'target') {
    const [, unit, , , leader] = e.id.split('|')
    if (s.kind === 'unit') return unit === s.unit
    return !!leader && (s.positionIds.has(leader) || s.rootPositionIds.has(leader))
  }
  if (e.object === 'freeze') {
    const f = ctx.all.freezes.find((x) => x.freezeId === e.id)
    return !!f && inScope('freezes', f, ctx)
  }
  // A reconciliation review of a person with no position (Finance > Reconcile, M3) is about them.
  if (e.object === 'workspace' && e.field === 'reviewed') return inScope('workers', { employeeId: e.id }, ctx)
  // Positions keep to the scope in `auditView`; versions, assumptions, cycles, closes and files are the company's.
  return true
}

/** A value holding a count: a number, or an object with a number in it ("merged: 14"). */
const holdsCount = (v: unknown): boolean =>
  typeof v === 'number' ||
  (typeof v === 'object' &&
    v !== null &&
    !Array.isArray(v) &&
    Object.values(v).some((x) => typeof x === 'number'))

/** A count taken over rows the viewer may not see reads "changed" (see the module comment). */
const countRedacted = (v: AuditRow['old']): AuditRow['old'] => (v != null && holdsCount(v) ? CHANGED : v)

/**
 * Outside HR admin: counts taken for someone else, and request IDs the viewer may not see, out of an
 * entry's values (see the module comment). HR admin reads every entry as it is.
 */
function valuesForViewer(e: AuditRow, viewer: Viewer, requestById: ReadonlyMap<string, HcRequest>): AuditRow {
  if (e.object === 'workspace' || (e.object === 'close' && e.field === 'adjustments'))
    return { ...e, old: countRedacted(e.old), new: countRedacted(e.new) }
  if (e.object === 'cycle' && e.field.startsWith('order ')) {
    const seen = (v: AuditRow['old']): AuditRow['old'] =>
      Array.isArray(v)
        ? v.filter((id) => {
            const r = typeof id === 'string' ? requestById.get(id) : undefined
            return !!r && requestView(r, viewer) !== 'none'
          })
        : v
    return { ...e, old: seen(e.old), new: seen(e.new) }
  }
  return e
}

/**
 * The page's rule for a log (8.4 rule 7 and the readings above), in `seq` order: each entry through
 * `auditView` with the request it belongs to, kept to the mode's scope, and, where the page is hidden
 * (Manager mode), only what the position card and the request records show. `requests` are the
 * requests the entries may belong to: the context's for this page, a file's for "Open a shared
 * file". A pick to be made shows nobody's rows. Pure.
 */
export function viewAuditRows(
  ctx: AnalyticsContext,
  entries: readonly AuditEntry[],
  requests: readonly HcRequest[] = requestsOf(ctx),
  options: { fromFile?: boolean } = {},
): AuditListRow[] {
  if (ctx.access.unset) return []
  const admin = ctx.access.mode === 'hr-admin'
  const viewer = viewerOf(ctx)
  const requestOf = requestOfEntry(ctx, requests, entries)
  const requestById = new Map(requests.map((r) => [r.requestId, r]))
  const byAt = options.fromFile && !admin ? requestIdsByAt(entries) : null
  // The moments an import wrote (Import requests, Merge): their position entries are an approval's
  // that came in a file (M3 recheck, PV-5), however the log they are in names the request.
  const imported = byAt
    ? new Set(
        entries
          .filter((x) => x.object === 'workspace' && (x.field === 'requests merged' || x.field === 'merged'))
          .map((x) => x.at),
      )
    : null
  const names = workerNames(ctx)
  const nameOf = (id: string) => names.get(id) ?? null
  const cardOnly = !admin && !ctx.access.can('page:audit')
  const rows: AuditListRow[] = []
  for (const e of [...entries].sort((a, b) => a.seq - b.seq)) {
    const req = requestOf(e)
    // An opened file's position entry written with a request the file does not carry, or by an import
    // with no request to read it through: left out (PV-5, M3 recheck).
    if (byAt && e.object === 'position' && !req && (byAt.has(e.at) || imported?.has(e.at))) continue
    const view = auditView(e, viewer, requestOf)
    if (!view) continue
    if (!admin && !entryInScope(ctx, view, req)) continue
    if (cardOnly && !cardEntry(ctx, view, req)) continue
    const named = {
      ...view,
      old: valueWithNames(view.field, view.old, nameOf) as AuditRow['old'],
      new: valueWithNames(view.field, view.new, nameOf) as AuditRow['new'],
    }
    let shown = cardOnly ? { ...named, old: managerValue(named.old), new: managerValue(named.new) } : named
    if (!admin) shown = valuesForViewer(shown, viewer, requestById)
    rows.push({
      ...shown,
      oldText: valueText(shown.old),
      newText: valueText(shown.new),
      sequence: admin ? e.seq : null,
      modeLabel: MODE_LABEL[shown.mode] ?? shown.mode,
      objectLabel: OBJECT_LABEL[shown.object] ?? shown.object,
      fieldLabel: fieldLabel(shown.field),
    })
  }
  return rows
}

const models = new WeakMap<AnalyticsContext, AuditModel>()

/** The entries KPI over the rows given: its count opens exactly them (8.4 rule 6). */
function entriesKpi(ctx: AnalyticsContext, rows: readonly AuditRow[], note: string, title: string): Kpi {
  return {
    id: 'audit-entries',
    metricId: ID.entriesCount,
    label: 'Audit entries',
    value: rows.length,
    format: 'int',
    note,
    definition: ctx.metrics.def(ID.entriesCount)?.definition,
    drill: () =>
      drillSpec({
        kind: 'audit',
        title,
        subtitle: `${ctx.scopeLabel} · as of ${formatDate(ctx.asOf)}`,
        rows,
        uses: USES,
      }),
    uses: USES,
  }
}

const COLUMNS: Column<AuditRow>[] = [
  { key: 'at', label: 'When', format: 'date' },
  { key: 'byName', label: 'By', width: 22 },
  { key: 'modeLabel', label: 'Mode' },
  { key: 'objectLabel', label: 'Record type' },
  { key: 'id', label: 'Record' },
  { key: 'fieldLabel', label: 'Field' },
  { key: 'oldText', label: 'From', width: 22, freeText: true },
  { key: 'newText', label: 'To', width: 22, freeText: true },
  { key: 'effectiveDate', label: 'Effective', format: 'date' },
  { key: 'comment', label: 'Comment', width: 40, freeText: true },
]

/** The Audit page's model for a context (cached per context). */
export function auditModel(ctx: AnalyticsContext): AuditModel {
  const hit = models.get(ctx)
  if (hit) return hit
  const admin = ctx.access.mode === 'hr-admin'
  const ordered = [...ctx.audit].sort((a, b) => a.seq - b.seq)
  // A pick to be made shows nobody's rows (the scope holds nobody), HR admin's log included.
  const rows = viewAuditRows(ctx, ordered)
  rows.sort((a, b) => b.at.localeCompare(a.at) || (b.sequence ?? 0) - (a.sequence ?? 0))
  // HR admin's check reads the log against the plan state's chain head too: a lost tail shows (IN-10).
  const check = admin ? verifyChain(ordered, ctx.plan?.auditHead ?? null) : null
  const count = rows.length
  const kpis: Kpi[] = [
    entriesKpi(ctx, rows, check ? chainStatusText(check) : entryCountText(count), 'Audit entries'),
  ]
  const model: AuditModel = {
    kpis,
    entries: {
      id: AUDIT_FIGURES.entries,
      metric: ID.entriesCount,
      title: 'Audit entries',
      subtitle: 'Every change, newest first, with who made it, in which mode and when',
      rows,
      columns: admin ? [{ key: 'sequence', label: 'Entry', format: 'int' }, ...COLUMNS] : COLUMNS,
      note: admin
        ? null
        : 'Pay and cost values read "changed". Entries about requests you cannot see are left out.',
      empty: rows.length
        ? null
        : ctx.access.unset
          ? 'Pick who you act as to see the audit entries.'
          : 'No change has been recorded yet. Approvals, edits, locks and imports write entries here.',
      uses: USES,
    },
    chainStatus: check ? chainStatusText(check) : entryCountText(count),
    chainOk: check ? check.ok : null,
    chainNote: admin ? CHAIN_NOTE : null,
    options: optionsOf(rows),
  }
  models.set(ctx, model)
  return model
}

/** The page as its filters leave it: the entries figure and its KPI over the rows the filters keep. */
export interface AuditShown {
  /** The entries KPI over the rows kept; it drills to exactly them. */
  kpis: Kpi[]
  /** The entries figure over the rows kept. */
  entries: FigureData<AuditRow>
  /** A filter is set. */
  filtering: boolean
}

const shown = new WeakMap<AnalyticsContext, Map<string, AuditShown>>()

/**
 * The Audit page under its own filters (record type, record, person, dates), on top of the scope:
 * the count follows the filters and opens exactly the rows kept, and with no filter it is the
 * model's own figure and KPI. The chain status stays the model's (HR admin's check reads the whole
 * log). Pure; cached per context and filters.
 */
export function auditShown(ctx: AnalyticsContext, filters: AuditFilters = NO_AUDIT_FILTERS): AuditShown {
  const m = auditModel(ctx)
  if (!isFilteringAudit(filters)) return { kpis: m.kpis, entries: m.entries, filtering: false }
  const key = JSON.stringify([
    [...filters.objects].sort(),
    [...filters.people].sort(),
    filters.from,
    filters.to,
    recordNeedle(filters),
  ])
  let byFilters = shown.get(ctx)
  if (!byFilters) {
    byFilters = new Map()
    shown.set(ctx, byFilters)
  }
  const hit = byFilters.get(key)
  if (hit) return hit
  const total = m.entries.rows.length
  const rows = filterAuditRows(m.entries.rows, filters)
  const out: AuditShown = {
    kpis: [entriesKpi(ctx, rows, `Of ${entryCountText(total)}`, 'Audit entries, filtered')],
    entries: {
      ...m.entries,
      subtitle: `${fmt(rows.length, 'int')} of ${entryCountText(total)} shown, newest first`,
      rows,
      empty:
        m.entries.empty ??
        (rows.length ? null : 'No entry matches these filters. Clear a filter to see more.'),
    },
    filtering: true,
  }
  byFilters.set(key, out)
  return out
}
