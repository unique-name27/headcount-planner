/**
 * Versions, month closes and FX (docs/PLAN.md 5.4, 6.4 to 6.6, 7.4, 8.3, C28; Finance > Versions and
 * Finance > Assumptions): create a Working for a new fiscal year, lock the year's Working into a
 * Budget or reforecast, reopen a reforecast as the new Working, close a month, set FX rates. Each
 * checks its id first ("Versions, closes, FX and freezes are Finance's."). Pure.
 *
 * - createVersion (`version.create`): one Working per fiscal year (R25: `workingExistsText`); its
 *   assumption rows are `from`'s renamed for the new version, with `assumptions` in place; the rows
 *   that differ from `from`'s pass 7.4's edit rule as edits of `from` (`env.assumptionEditRefusal`),
 *   so a set carrying a cap, date, cutoff or pay percentage is refused in Finance with "Set by
 *   import." and one moving 1 to 4 costed people with "This change would move cost for fewer than 5
 *   costed people." The rows go to `state.overlay.assumptions`; audit object 'version' ('created')
 *   and one 'assumption' entry per row set.
 * - lockVersion (`version.lock`): src/plan/store/memoryStore.ts `lockInto` with `env.computeLock`
 *   (the year's Working as of `ctx.businessAt` into a NEW locked version, `parentId` the Working; Working
 *   stays editable, C28; the year's first lock is the Budget, a reforecast needs it). Its refusals are
 *   lockInto's own sentences. Audit object 'version', field 'locked'.
 * - reopenVersion (`version.reopen`): versions.ts `reopenAsNew` (the year's Working retired, read
 *   only, "<name> (replaced <d MMM yyyy>)"; a new Working from the reforecast's assumptions, plan FX
 *   and proration; Budget never unlocks). The new Working's rows replace the retired one's in
 *   `state.overlay.assumptions`. Its audit drafts are the engine's.
 * - closeMonth (`close.month`): close.ts `closeMonth` over `env.closeInput(month)` (months close in
 *   order from the first open month: CLOSE_ORDER_TEXT), with `adjustmentsFor` posting back-dated
 *   changes in the next open month; the close stores its atom index. Audit object 'close'.
 * - setFx (`fx.set`): rates for one version (table 'fx', key currency|set|month), each set at company
 *   level, under 7.4's edit rule (an FX rate for a currency with 1 to 4 costed people is refused, and
 *   so is one that moves 1 to 4 in one part of Finance's fold); written to `state.overlay.assumptions`,
 *   one audit entry each (object 'assumption', field 'value'). Locked versions are read only.
 *
 * Readings taken here (core, M3):
 *  - A new Working's grid is its fiscal year and six months after it (the sample's versions' shape).
 *  - `from` null starts from the assumption rows the datasets hold for the new version's ID or name.
 *  - Outside HR admin, a row of a table HR admin sets by import is refused with "Set by import."
 *    before 7.4's check runs (the same sentence the check gives), so the rule holds whichever runs.
 *  - The new Working's rates after a reopen are written as its 'fx' assumption rows, so the rate table
 *    every engine reads (`fxRatesFromAssumptions`) is the engine's `rates`.
 *  - With no close yet, the first month to close is the as-of fiscal year's Working grid's first.
 *
 * M3 review fixes (core-platform):
 *  - R47: a version's `createdAt`, a lock's date (what it computes as of, `lockedAt`, the entry's
 *    effective date), a reopen's "(replaced <date>)" and a close's date are the business date
 *    (`ctx.businessAt`); every audit entry's own `at` stays the wall clock.
 *  - B8: a month closes only once the as-of date is on or after its month-end
 *    (`closeNotYetText`: "Oct 2026 closes once the data is as of 31 Oct 2026 or later.").
 *  - UI-3: a version's name is free text a manager reads (tiles, files), so `createVersion` and
 *    `lockVersion` refuse an amount in it at entry (REMOVE_AMOUNT_TEXT, 8.4 rule 5). M4 (M3 known
 *    gap 5): the lock's ID is the name's slug unless the slug reads as an amount
 *    (src/plan/workspace/versionIds.ts `mintVersionId`, the rule a Full file's IDs are rewritten by),
 *    so a Merge of this workspace's own Full file never rewrites an ID it minted.
 *  - PV-1: in Finance, a close refuses when an 'actual' rate written in the app for the month (an
 *    overlay row, not the imported data) differs from the month's forecast rate and, priced as if it
 *    were that forecast rate, moves 1 to 4 costed people (7.4's check, `env.assumptionEditRefusal`).
 *  - PV-2: outside HR admin, rates for a closed month are read only (CLOSED_MONTH_RATE_TEXT): they
 *    move nothing now, but a lock would store a plan rate as its comparison's.
 *  - PV-3: in Finance, `createVersion` refuses a set it cannot price (CANNOT_PRICE_TEXT): any changed
 *    row when it starts from no version, and an FX row for a month outside `from`'s grid.
 *  - SP-13: a Budget lock sets the standard head computed from the Budget (src/app/write/lock.ts
 *    `budgetStandardHead`, Finance confirms it with `standardHeadUsd`); the year's Working takes it
 *    too, with an audit entry, and reforecast locks carry the Budget's.
 *
 * Frozen in the M3 freeze (docs/CONTRACTS-M3.md); the core builder fills the bodies.
 */
import { fiscalYearOf, fyRange, monthEnd, shiftMonth } from '@/data/fiscal'
import {
  type AssumptionRow,
  assumptionKey,
  type FiscalYear,
  FX_SETS,
  type FxSet,
  isHrAdminOnly,
  type Month,
  type Proration,
  splitAssumptionKey,
} from '@/data/schema'
import { formatDate, formatMonth, monthKey } from '@/lib/dates'
import { actualLines, adjustmentsFor, closedThrough, closeMonth as closeOf } from '../engine/close'
import { fxRatesFromAssumptions } from '../engine/fx'
import { ENGINE_VERSION, isLocked, reopenAsNew, workingOf } from '../engine/versions'
import { lockInto } from '../store/memoryStore'
import type { LockAs } from '../store/types'
import type { AnyVersion, AuditDraft, PlanState, WorkingVersion } from '../types'
import { mintVersionId } from '../workspace/versionIds'
import {
  CANNOT_PRICE_TEXT,
  CLOSE_ORDER_TEXT,
  CLOSED_MONTH_RATE_TEXT,
  closeNotYetText,
  FX_RATE_TEXT,
  FX_SAVED_NOTICE,
  monthClosedNotice,
  NO_RATE_TEXT,
  NOT_FOUND_TEXT,
  ORG_FX_TEXT,
  reopenedNotice,
  SET_BY_IMPORT_TEXT,
  versionCreatedNotice,
  versionLockedNotice,
  WORKING_ONLY_TEXT,
  workingExistsText,
} from './copy'
import { freeTextRefusal, gate } from './gate'
import { auditOf, no, ok, putAssumptions } from './shared'
import type { ActionContext, ActionResult } from './types'

export interface CreateVersionInput {
  fiscalYear: FiscalYear
  /** "FY29 Working". */
  name: string
  proration: Proration
  /** The version whose assumptions and rates the new Working starts from; null starts from the imported rows for the year. */
  from: string | null
  /** Rows that differ from `from`'s (each names the new version once created; any `version` given is replaced). */
  assumptions: readonly AssumptionRow[]
}

export interface LockVersionInput {
  /** The year's Working. */
  workingId: string
  /** The year's first lock is { kind: 'budget' }; later ones reforecasts ("Q2 Reforecast"). */
  as: LockAs
  /**
   * A Budget lock's standard head as Finance confirmed it in the dialog (11.2 "Compute from Budget",
   * SP-13): when given it must be the one the lock computes, else the lock is refused
   * (STANDARD_HEAD_MOVED_TEXT). Left out, the computed one is stored. Ignored for a reforecast.
   */
  standardHeadUsd?: number | null
}

/** SP-13: the standard head the dialog showed is not the one the Budget computes now. */
export const STANDARD_HEAD_MOVED_TEXT =
  'The standard head computed from the Budget changed. Check it and lock again.'

/** The trade table's standard head row key (11.2). */
const STANDARD_HEAD_KEY = 'standardHeadUsd'

export interface ReopenVersionInput {
  /** The locked reforecast to reopen from. */
  reforecastId: string
}

export interface CloseMonthInput {
  month: Month
}

/** One FX rate: USD per 1 local, for a currency, set and month (6.4). */
export interface FxRateInput {
  currency: string
  set: FxSet
  month: Month
  usdPerLocal: number
}

export interface SetFxInput {
  /** A Working version. */
  versionId: string
  rates: readonly FxRateInput[]
}

/* ───────────── assumption rows ───────────── */

/** The row's key within a version: table, org (blank the company) and key. */
export const rowKeyOf = (r: Pick<AssumptionRow, 'table' | 'org' | 'key'>): string =>
  `${r.table}|${(r.org ?? '').trim()}|${r.key.trim()}`

/** The audit entry id of an assumption row: '<version>|<table>|<org>|<key>'. */
export const assumptionAuditId = (
  versionId: string,
  r: Pick<AssumptionRow, 'table' | 'org' | 'key'>,
): string => `${versionId}|${rowKeyOf(r)}`

/** A row naming a version: known keys only, never a spread of the input. */
export const rowFor = (r: AssumptionRow, version: string): AssumptionRow => ({
  version,
  table: r.table,
  org: (r.org ?? '').trim() || null,
  key: r.key.trim(),
  value: r.value,
})

/** A version's assumption rows: a locked version's own, else the datasets' rows naming its ID or name. */
export function rowsOfVersion(ctx: ActionContext, v: AnyVersion): readonly AssumptionRow[] {
  if (isLocked(v)) return v.assumptions
  const id = v.versionId.trim()
  const name = v.name.trim()
  return ctx.datasets.assumptions.filter((r) => {
    const x = (r.version ?? '').trim()
    return x === id || x === name
  })
}

/**
 * 7.4's edit rule for rows set in a version (outside HR admin): a table HR admin sets by import is
 * refused with "Set by import.", then the rest through `env.assumptionEditRefusal`.
 */
export function editRefusal(
  ctx: ActionContext,
  rows: readonly AssumptionRow[],
  versionId: string,
  closes: PlanState['closes'] = [],
): string | null {
  if (ctx.mode === 'hr-admin' || !rows.length) return null
  if (rows.some((r) => isHrAdminOnly(r.table))) return SET_BY_IMPORT_TEXT
  if (closedMonthRate(rows, closes)) return CLOSED_MONTH_RATE_TEXT
  return ctx.env.assumptionEditRefusal(rows, versionId)
}

/** The month of an FX row's key ('EUR|plan|2026-09' gives '2026-09'), or null for another table. */
export function fxMonthOf(r: Pick<AssumptionRow, 'table' | 'key'>): Month | null {
  if (r.table !== 'fx') return null
  const m = splitAssumptionKey(r.key)[2] ?? ''
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(m) ? (m as Month) : null
}

/** PV-2: an FX row for a month already closed (outside HR admin such a rate is read only). */
function closedMonthRate(rows: readonly AssumptionRow[], closes: PlanState['closes']): boolean {
  const last = closedThrough(closes)
  if (!last) return false
  return rows.some((r) => {
    const m = fxMonthOf(r)
    return m != null && m <= last
  })
}

/** One 'assumption' audit entry per row set (old: the value before, or null for a new key). */
export function assumptionAudit(
  ctx: ActionContext,
  versionId: string,
  rows: readonly AssumptionRow[],
  before: ReadonlyMap<string, number>,
): AuditDraft[] {
  return rows.map((r) =>
    auditOf(
      ctx,
      'assumption',
      assumptionAuditId(versionId, r),
      'value',
      before.get(rowKeyOf(r)) ?? null,
      r.value,
    ),
  )
}

const valuesOf = (rows: readonly AssumptionRow[]): Map<string, number> =>
  new Map(rows.map((r) => [rowKeyOf(r), r.value]))

/* ───────────── the actions ───────────── */

/** `version.create`: a new Working for a fiscal year with no Working. */
export function createVersion(state: PlanState, ctx: ActionContext, input: CreateVersionInput): ActionResult {
  const g = gate(ctx, 'version.create')
  if (g) return no(g)
  const nameWhy = freeTextRefusal(ctx, input.name)
  if (nameWhy) return no(nameWhy)
  const fy = input.fiscalYear
  if (workingOf(state.versions, fy)) return no(workingExistsText(fy))
  const from = input.from ? state.versions.find((v) => v.versionId === input.from) : null
  if (input.from && !from) return no(NOT_FOUND_TEXT)
  const versionId = ctx.env.ids.version(fy, 'working')
  const name = input.name.trim() || `${fy} Working`
  const baseRows = from
    ? rowsOfVersion(ctx, from)
    : ctx.datasets.assumptions.filter((r) => [versionId, name].includes((r.version ?? '').trim()))
  const before = valuesOf(baseRows)
  const changed = input.assumptions.filter((r) => before.get(rowKeyOf(r)) !== r.value)
  // FX rates are the company's: an org's FX row is read by no engine (review recheck).
  if (changed.some(orgFxRow)) return no(ORG_FX_TEXT)
  if (from) {
    // PV-3: 7.4's check prices a row on `from`'s grid, so a rate for a month outside it would pass
    // unpriced; Finance sets those on the new Working itself, where `setFx` prices them.
    const outside = (r: AssumptionRow): boolean => {
      const m = fxMonthOf(r)
      return m != null && (m < from.grid.from || m > from.grid.to)
    }
    if (ctx.mode !== 'hr-admin' && changed.some((r) => !isHrAdminOnly(r.table) && outside(r)))
      return no(CANNOT_PRICE_TEXT)
    const why = editRefusal(
      ctx,
      changed.map((r) => rowFor(r, from.versionId)),
      from.versionId,
      state.closes,
    )
    if (why) return no(why)
  } else if (ctx.mode !== 'hr-admin' && changed.length) {
    // PV-3: with no version to start from there is nothing 7.4's check can price the set on.
    return no(changed.some((r) => isHrAdminOnly(r.table)) ? SET_BY_IMPORT_TEXT : CANNOT_PRICE_TEXT)
  }

  const range = fyRange(fy)
  const to = shiftMonth(monthKey(range.end) as Month, 6)
  const version: WorkingVersion = {
    versionId,
    name,
    kind: 'working',
    fiscalYear: fy,
    grid: { from: monthKey(range.start) as Month, to },
    proration: input.proration,
    state: 'working',
    createdAt: ctx.businessAt,
    lockedAt: null,
    lockedBy: null,
    engineVersion: ENGINE_VERSION,
    parentId: from?.versionId ?? null,
    hash: null,
  }
  const given = new Map(input.assumptions.map((r) => [rowKeyOf(r), rowFor(r, versionId)]))
  const rows = [
    ...baseRows.filter((r) => !given.has(rowKeyOf(r))).map((r) => rowFor(r, versionId)),
    ...given.values(),
  ]
  const next = putAssumptions({ ...state, versions: [...state.versions, version] }, rows)
  const audit = [
    auditOf(ctx, 'version', versionId, 'created', null, { name, fiscalYear: fy, parentId: version.parentId }),
    ...assumptionAudit(ctx, versionId, [...given.values()], before),
  ]
  return ok(next, audit, versionCreatedNotice(name, fy))
}

/** `version.lock`: the year's Working into a new locked Budget or reforecast. */
export function lockVersion(state: PlanState, ctx: ActionContext, input: LockVersionInput): ActionResult {
  const g = gate(ctx, 'version.lock')
  if (g) return no(g)
  const nameWhy = freeTextRefusal(ctx, input.as?.name ?? '')
  if (nameWhy) return no(nameWhy)
  try {
    const done = lockInto(
      state,
      input.workingId,
      input.as,
      ctx.actor,
      ctx.at,
      {
        computeLock: (w, at) => ctx.env.computeLock(w, at),
        // M3 known gap 5: the name's slug, never one that reads as an amount ('<fy>-<kind>' then).
        newVersionId: (w, as) =>
          mintVersionId(
            { name: as.name, fiscalYear: w.fiscalYear, kind: as.kind },
            new Set(state.versions.map((v) => v.versionId)),
            ctx.rules.hasAmount,
          ),
      },
      ctx.businessAt,
    )
    if (done.locked.kind !== 'budget')
      return ok(done.state, [done.audit], versionLockedNotice(done.locked.name))
    // SP-13: the Budget's standard head is the one it computes; Working takes it with an entry.
    const head = done.locked.assumptions.find(
      (r) => r.table === 'trade' && !(r.org ?? '').trim() && r.key.trim() === STANDARD_HEAD_KEY,
    )
    if (input.standardHeadUsd != null && head && Math.abs(input.standardHeadUsd - head.value) > 0.5)
      return no(STANDARD_HEAD_MOVED_TEXT)
    const working = state.versions.find((v) => v.versionId === input.workingId) as AnyVersion
    const workingRows = rowsOfVersion(ctx, working)
    const before = valuesOf(workingRows)
    const row = head ? rowFor(head, working.versionId) : null
    if (!row || before.get(rowKeyOf(row)) === row.value)
      return ok(done.state, [done.audit], versionLockedNotice(done.locked.name))
    return ok(
      putAssumptions(done.state, [row]),
      [done.audit, ...assumptionAudit(ctx, working.versionId, [row], before)],
      versionLockedNotice(done.locked.name),
    )
  } catch (e) {
    return no(e instanceof Error ? e.message : String(e))
  }
}

/** `version.reopen`: "Reopen as new" from a locked reforecast. */
export function reopenVersion(state: PlanState, ctx: ActionContext, input: ReopenVersionInput): ActionResult {
  const g = gate(ctx, 'version.reopen')
  if (g) return no(g)
  const rf = state.versions.find((v) => v.versionId === input.reforecastId)
  if (!rf) return no(NOT_FOUND_TEXT)
  const working = workingOf(state.versions, rf.fiscalYear)
  const workingRows = working ? rowsOfVersion(ctx, working) : []
  try {
    const r = reopenAsNew({
      versions: state.versions,
      reforecastId: input.reforecastId,
      at: ctx.businessAt,
      by: ctx.actor,
      newVersionId: ctx.env.ids.version(rf.fiscalYear, 'working'),
      workingAssumptions: workingRows,
      workingRates: fxRatesFromAssumptions(workingRows),
    })
    const id = r.created.versionId
    const fx: AssumptionRow[] = r.rates.map((x) => ({
      version: id,
      table: 'fx',
      org: null,
      key: assumptionKey([x.currency, x.set, x.month]),
      value: x.usdPerLocal,
    }))
    const rows = [...r.assumptions.filter((a) => a.table !== 'fx'), ...fx]
    const retiredId = r.retired.versionId
    const kept = state.overlay.assumptions.filter((a) => (a.version ?? '').trim() !== retiredId)
    const next = putAssumptions(
      { ...state, versions: r.versions, overlay: { ...state.overlay, assumptions: kept } },
      rows,
    )
    // R47: the reopen is dated the business date; its entries' own time is the wall clock.
    const audit = r.audit.map((a) => ({ ...a, at: ctx.at }))
    return ok(next, audit, reopenedNotice(r.created.name, r.retired.name))
  } catch (e) {
    return no(e instanceof Error ? e.message : String(e))
  }
}

/**
 * PV-1: in Finance, the 'actual' rates written in the app (plan state's overlay) for the month that
 * differ from its forecast rate, priced through 7.4's check as if they were the month's forecast rate
 * (what the close will book): the refusal, or null. Imported rates are the data's (natural FX
 * movement, 7.4's accepted risk) and HR admin's closes are not checked.
 */
function closeRateRefusal(state: PlanState, ctx: ActionContext, month: Month): string | null {
  if (ctx.mode === 'hr-admin') return null
  const w =
    workingOf(state.versions, fiscalYearOf(`${month}-01`)) ??
    workingOf(state.versions, fiscalYearOf(ctx.asOf))
  if (!w) return null
  const ofW = (r: AssumptionRow) =>
    (r.version ?? '').trim() === w.versionId || (r.version ?? '').trim() === w.name
  // Company rows only: the rate table reads no org's FX row (`fxRatesFromAssumptions`), so neither does the close.
  const written = state.overlay.assumptions.filter((r) => ofW(r) && r.table === 'fx' && !(r.org ?? '').trim())
  const rows = valuesOf(rowsOfVersion(ctx, w))
  const asForecast: AssumptionRow[] = []
  for (const r of written) {
    const [currency, set, m] = splitAssumptionKey(r.key)
    if (set !== 'actual' || m !== month) continue
    const key = assumptionKey([currency, 'forecast', month])
    const forecast = rows.get(rowKeyOf({ table: 'fx', org: null, key }))
    if (forecast == null || forecast === r.value) continue
    asForecast.push({ version: w.versionId, table: 'fx', org: null, key, value: r.value })
  }
  return asForecast.length ? ctx.env.assumptionEditRefusal(asForecast, w.versionId) : null
}

/** `close.month`: the next month closed from HRIS actuals, with back-dated adjustments posted. */
export function closeMonth(state: PlanState, ctx: ActionContext, input: CloseMonthInput): ActionResult {
  const g = gate(ctx, 'close.month')
  if (g) return no(g)
  const last = closedThrough(state.closes)
  const grid = workingOf(state.versions, fiscalYearOf(ctx.asOf))?.grid.from ?? (monthKey(ctx.asOf) as Month)
  const expected = last ? shiftMonth(last, 1) : grid
  if (input.month !== expected) return no(CLOSE_ORDER_TEXT)
  // B8, R47: a month closes once the as-of date is on or after its month-end.
  const end = monthEnd(input.month)
  if (end > ctx.asOf) return no(closeNotYetText(formatMonth(`${input.month}-01`), formatDate(end)))
  const rateWhy = closeRateRefusal(state, ctx, input.month)
  if (rateWhy) return no(rateWhy)
  try {
    const close = closeOf(ctx.env.closeInput(input.month), ctx.businessAt, ctx.actor.personId)
    const adjustments = adjustmentsFor(
      state.closes,
      (m) => actualLines(ctx.env.closeInput(m)),
      input.month,
      state.adjustments,
    )
    const next: PlanState = {
      ...state,
      closes: [...state.closes, close],
      adjustments: [...state.adjustments, ...adjustments],
    }
    const audit = [
      auditOf(ctx, 'close', input.month, 'closed', null, close.hash, {
        effectiveDate: monthEnd(input.month),
      }),
      ...(adjustments.length
        ? [auditOf(ctx, 'close', input.month, 'adjustments', null, adjustments.length)]
        : []),
    ]
    return ok(next, audit, monthClosedNotice(formatMonth(`${input.month}-01`)))
  } catch (e) {
    return no(e instanceof Error ? e.message : String(e))
  }
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/

/** An FX row keyed to an org: the rate table reads company rows only (`fxRatesFromAssumptions`). */
export const orgFxRow = (r: Pick<AssumptionRow, 'table' | 'org'>): boolean =>
  r.table === 'fx' && !!(r.org ?? '').trim()

/** `fx.set`: FX rates for a Working version, under 7.4's edit rule. */
export function setFx(state: PlanState, ctx: ActionContext, input: SetFxInput): ActionResult {
  const g = gate(ctx, 'fx.set')
  if (g) return no(g)
  const v = state.versions.find((x) => x.versionId === input.versionId)
  if (!v) return no(NOT_FOUND_TEXT)
  if (v.state !== 'working') return no(WORKING_ONLY_TEXT)
  if (!input.rates.length) return no(NO_RATE_TEXT)
  for (const r of input.rates)
    if (
      !/^[A-Z]{3}$/.test(r.currency) ||
      !FX_SETS.includes(r.set) ||
      !MONTH.test(r.month) ||
      !(Number.isFinite(r.usdPerLocal) && r.usdPerLocal > 0)
    )
      return no(FX_RATE_TEXT)
  const rows: AssumptionRow[] = input.rates.map((r) => ({
    version: v.versionId,
    table: 'fx',
    org: null,
    key: assumptionKey([r.currency, r.set, r.month]),
    value: r.usdPerLocal,
  }))
  const why = editRefusal(ctx, rows, v.versionId, state.closes)
  if (why) return no(why)
  const before = valuesOf(rowsOfVersion(ctx, v))
  return ok(putAssumptions(state, rows), assumptionAudit(ctx, v.versionId, rows, before), FX_SAVED_NOTICE)
}
