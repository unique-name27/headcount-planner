/**
 * What the Finance tabs offer to change (docs/PLAN.md 6.5, 6.6, 7.4, 8.3, 9.4, 10.4, C28; M3): the
 * write side of Finance > Versions (create a Working, lock the year's Working into a Budget or a
 * reforecast, reopen a reforecast as the new Working, close the next month), Assumptions (Finance's
 * and HR admin's edits under 7.4's rule, FX sets, an HRBP's operational settings for its unit),
 * Freezes (create, edit) and Reconcile (Mark reviewed). Each part says whether the mode offers the
 * change (`WriteAccess`, from the policy's decision on the action's first id) and holds only what its
 * form needs: every choice is a model value, so the views render it and compute nothing, and the
 * leak crawl reads what the forms show. Nothing here writes; the views run the named action through
 * src/app/write/usePlanWrite.ts, and the action checks the policy, the person and its own rule again.
 *
 * Readings taken here (finance-ui builder, M3):
 *  - A mode the policy hides an action in gets no choices for it (an empty list, a null), only the
 *    policy's reason, so a hidden form never carries values the mode does not show (HRBP sees the
 *    Versions tab read only: no lock, reopen or close choices, no reopen list of assumption values).
 *  - Lock: one choice per fiscal year with a Working version; the year's first lock is its Budget,
 *    later ones reforecasts, suggested as "<FY> Q<n> Reforecast" with n one more than the year's
 *    reforecasts (Finance names it).
 *  - Reopen: one choice per locked reforecast whose year has a Working; the confirm lists Working's
 *    assumption rows and plan FX rates that differ from the reforecast and will be replaced (the
 *    engine's own `reopenAsNew` list, 6.5).
 *  - Close: the next month to close is the month after the last close, else the first month of the
 *    as-of year's Working (as the action reads it). Its actual rates come from Working's FX rows; a
 *    currency with an actual rate the month before and none for the month is missing, and the form
 *    offers the month before's rates as a start, which Finance confirms through `fx.set`.
 *  - Create: the fiscal years after the as-of year's, up to two ahead, that have no Working; a new
 *    Working starts from any Working or locked version (the latest year's Working by default).
 *  - Assumption edits: only in a Working version. HR admin edits every table; Finance every table
 *    but the ones set by import; an HRBP its own unit's time to fill, fill rate and backfill settings.
 *    FX rows go through `fx.set`, operational rows in HRBP mode through `assumptions.edit-operational`,
 *    the rest through `assumptions.edit`. A new value may be set for the company or for any unit or
 *    department (an org override), keyed like the table's existing rows.
 *  - Freezes: an org is a unit, a department of a unit, a cost center or a leader seat (with its
 *    holder's name); a new freeze starts on the as-of date by default, so it holds openings from
 *    the day it is set.
 *  - Mark reviewed: the open exceptions in view; an HRBP's are its own unit's (the action's rule).
 */
import { contextLists } from '@/access/lists'
import { isLeaderSeat, leaderLevelSet } from '@/access/scopes/pickers'
import { viewerOf } from '@/access/visibility'
import { budgetStandardHead } from '@/app/write/lock'
import type { AnalyticsContext } from '@/data/context'
import { fiscalYearOf, monthEnd, monthKey, monthRange, shiftFiscalYear, shiftMonth } from '@/data/fiscal'
import {
  ASSUMPTION_KEYS,
  type AssumptionRow,
  type AssumptionTable,
  type FiscalYear,
  FX_SETS,
  type FxSet,
  type ISODate,
  isHrAdminOnly,
  type Month,
  type Proration,
  splitAssumptionKey,
} from '@/data/schema'
import { holderNamesOf } from '@/drill/seats'
import { formatDate, formatMonth } from '@/lib/dates'
import { ACTION_CHECKS, type ActionName, actionSurface, type FxRateInput } from '@/plan/actions'
import { closeNotYetText } from '@/plan/actions/copy'
import { assumptionLookup } from '@/plan/engine/assumptions'
import { closedThrough } from '@/plan/engine/close'
import { fxRatesFromAssumptions, rateOf } from '@/plan/engine/fx'
import { isLocked, reopenAsNew, workingOf } from '@/plan/engine/versions'
import type { AnyVersion, LockedVersion, WorkingVersion } from '@/plan/types'
import { versionLinesOf } from '@/views/plan/engine/core'
import { latestRows, versionAssumptions } from '@/views/targets/engine/working'
import type { FinancePrep } from './base'
import { editNoteOf, OPERATIONAL_TABLES, ownOrg } from './edits'

/* ───────────── access ───────────── */

/** Whether the mode offers a change, and the policy's words where it limits or hides it. */
export interface WriteAccess {
  /** The action the form's button runs (src/plan/actions `ACTIONS`). */
  action: ActionName
  /** The form shows: the action's first id is not hidden in the mode (a limited one shows; its rule refuses with a reason). */
  shown: boolean
  /** The policy's reason where the id is limited or hidden, else null. */
  note: string | null
}

/** A mode's access to an action (its first checked id), with no Acting as pick reading as hidden. */
export function writeAccess(ctx: AnalyticsContext, action: ActionName): WriteAccess {
  const d = ctx.access.decide(actionSurface(ACTION_CHECKS[action][0]))
  return {
    action,
    shown: d.access !== 'hidden' && !ctx.access.unset,
    note: d.access === 'shown' ? null : (d.how ?? null),
  }
}

/* ───────────── Finance > Versions ───────────── */

/** One fiscal year's Working, as a lock would store it. */
export interface LockChoice {
  workingId: string
  workingName: string
  fiscalYear: FiscalYear
  /** The year's first lock is its Budget; later ones reforecasts. */
  kind: 'budget' | 'reforecast'
  /** "FY27 Q2 Reforecast" or "FY28 Budget": Finance names it. */
  suggestedName: string
  /** The year's locked versions so far, by name. */
  locked: readonly string[]
  /**
   * A Budget lock's standard head as "Compute from Budget" gives it (11.2, review SP-13): Σ band ÷ Σ
   * FTE over the approved Employee positions at the year's end, to the nearest $1,000, the value the
   * lock stores (src/app/write/lock.ts `budgetStandardHead`). Finance confirms it in the dialog and
   * the lock refuses if it moved since. Null for a reforecast (it carries the Budget's) or where the
   * trade rates are not shown.
   */
  standardHeadUsd: number | null
  /** The dialog's words beside it (no amount in the sentence; the value shows in its own cell), or null. */
  standardHeadNote: string | null
}

/** One row a reopen replaces: Working's value against the reforecast's. */
export interface ReopenRow {
  /** "Band midpoints", or "FX rates (plan)". */
  table: string
  org: string | null
  key: string
  /** Working's value; null when the reforecast adds a row Working has not. */
  working: number | null
  /** The reforecast's value; null when Working's row goes. */
  reforecast: number | null
}

/** One locked reforecast that can be reopened as the new Working. */
export interface ReopenChoice {
  reforecastId: string
  name: string
  fiscalYear: FiscalYear
  /** The Working it retires. */
  workingName: string
  /** Working's assumption rows and plan FX rates that differ from the reforecast and will be replaced. */
  replaced: readonly ReopenRow[]
}

/** The next month to close, and the actual rates it needs. */
export interface CloseChoice {
  month: Month
  /** "Oct 2026". */
  label: string
  /** The Working version whose FX rows hold the month's actual rates. */
  workingId: string
  workingName: string
  /** Currencies with an actual rate the month before and none for this month: set them first. */
  missingRates: readonly string[]
  /** The month before's actual rates for those currencies, offered as a start through `fx.set`. */
  carry: readonly FxRateInput[]
  /** "Sep 2026": the month the carried rates are from. */
  carryFrom: string | null
  /**
   * Why the month cannot close yet (R47, browser B8): its month-end is after the as-of date, so the
   * data holds no HRIS actuals for all of it. "Oct 2026 closes once the data is as of 31 Oct 2026 or
   * later." The button shows disabled with this text; the action refuses with the same words.
   */
  notYet: string | null
}

/** R47: a month closes only once the as-of date is on or after its month-end (browser B8); the action's words. */
export const closeNotYet = (month: Month): string =>
  closeNotYetText(formatMonth(`${month}-01`), formatDate(monthEnd(month)))

/** A new Working version for a fiscal year that has none. */
export interface CreateChoice {
  years: readonly FiscalYear[]
  /** Versions a new Working may start from (Working and locked), latest year first. */
  from: readonly { versionId: string; name: string }[]
  defaultFrom: string | null
  proration: Proration
}

export interface VersionWrites {
  create: CreateChoice & { access: WriteAccess }
  lock: { access: WriteAccess; choices: readonly LockChoice[] }
  reopen: { access: WriteAccess; choices: readonly ReopenChoice[] }
  close: { access: WriteAccess; choice: CloseChoice | null }
}

const reforecastsOf = (versions: readonly AnyVersion[], fy: FiscalYear): LockedVersion[] =>
  versions.filter((v): v is LockedVersion => isLocked(v) && v.fiscalYear === fy && v.kind === 'reforecast')

/** "Compute from Budget" over the lines a Budget lock of this Working would store, or null. */
function budgetHeadOf(ctx: AnalyticsContext, w: WorkingVersion): number | null {
  try {
    return budgetStandardHead(ctx, w, versionLinesOf(ctx, w), `${ctx.asOf}T00:00:00.000Z`)
  } catch {
    return null
  }
}

function lockChoices(ctx: AnalyticsContext): LockChoice[] {
  const out: LockChoice[] = []
  const headShown = ctx.access.can('metric:finance.trade.standardHead')
  for (const w of ctx.versions) {
    if (w.state !== 'working') continue
    const fy = w.fiscalYear
    const locked = ctx.versions.filter((v) => v.fiscalYear === fy && v.state === 'locked')
    const budget = locked.some((v) => v.kind === 'budget')
    const head = budget || !headShown ? null : budgetHeadOf(ctx, w)
    out.push({
      workingId: w.versionId,
      workingName: w.name,
      fiscalYear: fy,
      kind: budget ? 'reforecast' : 'budget',
      suggestedName: budget
        ? `${fy} Q${reforecastsOf(ctx.versions, fy).length + 1} Reforecast`
        : `${fy} Budget`,
      locked: locked.map((v) => v.name),
      standardHeadUsd: head,
      standardHeadNote:
        head == null
          ? null
          : 'Computed from this Budget. Locking sets it in the Budget and in Working; reforecasts carry it unchanged.',
    })
  }
  return out.sort((a, b) => (a.fiscalYear < b.fiscalYear ? -1 : 1))
}

function reopenChoices(ctx: AnalyticsContext): ReopenChoice[] {
  const out: ReopenChoice[] = []
  for (const rf of ctx.versions) {
    if (!isLocked(rf) || rf.kind !== 'reforecast') continue
    const working = workingOf(ctx.versions, rf.fiscalYear)
    if (!working) continue
    const rows = versionAssumptions(ctx.all, working)
    const r = reopenAsNew({
      versions: ctx.versions,
      reforecastId: rf.versionId,
      at: `${ctx.asOf}T00:00:00.000Z`,
      by: { personId: '', name: '', mode: ctx.mode },
      newVersionId: `${rf.versionId}~reopen`,
      workingAssumptions: rows,
      workingRates: fxRatesFromAssumptions(rows),
    })
    const rfValue = new Map(rf.assumptions.map((a) => [`${a.table}|${a.org ?? ''}|${a.key}`, a.value]))
    const rfRate = new Map(
      rf.rates.filter((x) => x.set === 'plan').map((x) => [`${x.currency}|${x.month}`, x.usdPerLocal]),
    )
    const replaced: ReopenRow[] = [
      ...r.replaced.assumptions
        .filter((a) => a.table !== 'fx')
        .map((a) => ({
          table: ASSUMPTION_KEYS[a.table].label,
          org: (a.org ?? '').trim() || null,
          key: a.key,
          working: a.value,
          reforecast: rfValue.get(`${a.table}|${a.org ?? ''}|${a.key}`) ?? null,
        })),
      ...r.replaced.rates.map((x) => ({
        table: 'FX rates (plan)',
        org: null,
        key: `${x.currency}|plan|${x.month}`,
        working: x.usdPerLocal,
        reforecast: rfRate.get(`${x.currency}|${x.month}`) ?? null,
      })),
    ]
    out.push({
      reforecastId: rf.versionId,
      name: rf.name,
      fiscalYear: rf.fiscalYear,
      workingName: working.name,
      replaced,
    })
  }
  return out.sort((a, b) => (a.fiscalYear < b.fiscalYear ? -1 : a.name < b.name ? -1 : 1))
}

/** The month the close action expects next (see the module comment). */
export function nextCloseMonth(ctx: AnalyticsContext): Month | null {
  const last = closedThrough(ctx.plan?.closes ?? [])
  if (last) return shiftMonth(last, 1)
  return workingOf(ctx.versions, fiscalYearOf(ctx.asOf))?.grid.from ?? (monthKey(ctx.asOf) as Month)
}

function closeChoice(ctx: AnalyticsContext): CloseChoice | null {
  const month = nextCloseMonth(ctx)
  if (!month) return null
  const w =
    workingOf(ctx.versions, fiscalYearOf(`${month}-01`)) ?? workingOf(ctx.versions, fiscalYearOf(ctx.asOf))
  if (!w) return null
  const table = fxRatesFromAssumptions(versionAssumptions(ctx.all, w))
  const before = shiftMonth(month, -1)
  const currencies = [...new Set(table.filter((r) => r.set === 'actual').map((r) => r.currency))].sort()
  const missing = currencies.filter((c) => rateOf(table, c, 'actual', month) == null)
  const carry: FxRateInput[] = []
  for (const c of missing) {
    const r = rateOf(table, c, 'actual', before)
    if (r != null) carry.push({ currency: c, set: 'actual', month, usdPerLocal: r })
  }
  return {
    month,
    label: formatMonth(`${month}-01`),
    workingId: w.versionId,
    workingName: w.name,
    missingRates: missing,
    carry,
    carryFrom: carry.length ? formatMonth(`${before}-01`) : null,
    notYet: monthEnd(month) > ctx.asOf ? closeNotYet(month) : null,
  }
}

function createChoice(ctx: AnalyticsContext): CreateChoice {
  const asOfYear = fiscalYearOf(ctx.asOf)
  const years: FiscalYear[] = []
  for (let n = 1; n <= 2; n++) {
    const fy = shiftFiscalYear(asOfYear, n)
    if (!workingOf(ctx.versions, fy)) years.push(fy)
  }
  const from = ctx.versions
    .filter((v) => v.state !== 'retired')
    .sort(
      (a, b) =>
        (a.fiscalYear < b.fiscalYear ? 1 : a.fiscalYear > b.fiscalYear ? -1 : 0) ||
        (a.state === 'working' ? -1 : b.state === 'working' ? 1 : 0) ||
        (a.name < b.name ? -1 : 1),
    )
    .map((v) => ({ versionId: v.versionId, name: v.name }))
  const latestWorking = [...ctx.versions]
    .filter((v) => v.state === 'working')
    .sort((a, b) => (a.fiscalYear < b.fiscalYear ? 1 : -1))[0]
  return {
    years,
    from,
    defaultFrom: latestWorking?.versionId ?? from[0]?.versionId ?? null,
    proration: latestWorking?.proration ?? 'daily',
  }
}

/** Finance > Versions' write side. */
export function versionWrites(p: FinancePrep): VersionWrites {
  const { ctx } = p
  const create = writeAccess(ctx, 'createVersion')
  const lock = writeAccess(ctx, 'lockVersion')
  const reopen = writeAccess(ctx, 'reopenVersion')
  const close = writeAccess(ctx, 'closeMonth')
  const made = create.shown
    ? createChoice(ctx)
    : { years: [], from: [], defaultFrom: null, proration: 'daily' as const }
  return {
    create: { ...made, access: create },
    lock: { access: lock, choices: lock.shown ? lockChoices(ctx) : [] },
    reopen: { access: reopen, choices: reopen.shown ? reopenChoices(ctx) : [] },
    close: { access: close, choice: close.shown ? closeChoice(ctx) : null },
  }
}

/* ───────────── Finance > Assumptions ───────────── */

/** One value a form may set: an existing row of the version, or an org override of its key. */
export interface EditableValue {
  org: string | null
  key: string
  value: number
  /** Why this value cannot be changed here (src/views/finance/engine/edits.ts `editNoteOf`), else null. */
  note: string | null
  /**
   * An org's row that overrides its parent's (the unit's, then the company's): the value "Remove
   * override" gives back and where it comes from, run through `removeOverride` (CONTRACTS-M3 7.4
   * item 2, lead decision). Null for the company's own rows and for an org row with no parent value.
   */
  parent: { value: number; from: string; note: string } | null
}

/** One table a viewer may change in the Working version shown. */
export interface EditableTable {
  table: AssumptionTable
  label: string
  /** What the table's note says (its unit and how it is read). */
  hint: string
  /** The action that saves it: `editOperational` for an HRBP, else `editAssumptions` (FX has its own form, `setFx`). */
  action: 'editAssumptions' | 'editOperational'
  /** Every value of the table in the version, with its note. */
  values: readonly EditableValue[]
  /** The orgs a new override may be set for (units and departments); none for FX and tables keyed by the company. */
  orgs: readonly string[]
  /** The table's keys (for a new override). */
  keys: readonly string[]
}

/** The FX form: rates for a currency, set and months of the Working version. */
export interface FxForm {
  currencies: readonly string[]
  sets: readonly FxSet[]
  months: readonly Month[]
}

export interface AssumptionWrites {
  /** The Working version edits go to (the version shown when it is a Working one), else null. */
  versionId: string | null
  versionName: string | null
  /** Why nothing on the tab can be changed (a locked version is shown, or the mode changes none), else null. */
  note: string | null
  /** 7.4's rule in words where it applies to the viewer's edits (Finance), with the minimum in force; else null. */
  rule: string | null
  edit: WriteAccess
  operational: WriteAccess
  fx: WriteAccess
  tables: readonly EditableTable[]
  /** Null where `fx.set` is not offered. */
  fxForm: FxForm | null
}

/** The units and departments (unit order, then department order) an override may name. */
function orgsOf(ctx: AnalyticsContext, own: ((org: string) => boolean) | null): string[] {
  const units = new Set<string>()
  const depts = new Set<string>()
  for (const r of latestRows(ctx.all.positions).values()) {
    units.add(r.businessUnit)
    if (r.department) depts.add(r.department)
  }
  const all = [...[...units].sort(), ...[...depts].sort().filter((d) => !units.has(d))]
  return own ? all.filter(own) : all
}

/**
 * The value an org's row overrides: the same key read for the org with the org's own row left out
 * (its unit's row for a department, else the company's), as `removeOverride` reads it; null for a
 * company row or when no parent sets the key.
 */
function parentOf(
  ctx: AnalyticsContext,
  v: AnyVersion,
  rows: readonly AssumptionRow[],
  row: AssumptionRow,
): EditableValue['parent'] {
  const org = (row.org ?? '').trim()
  if (!org) return null
  const isUnit = ctx.all.positions.some((p) => p.businessUnit === org)
  const unit = isUnit ? org : (ctx.all.positions.find((p) => p.department === org)?.businessUnit ?? '')
  const path = isUnit ? { businessUnit: org, department: null } : { businessUnit: unit, department: org }
  const key = row.key.trim()
  const rest = rows.filter(
    (r) => !(r.table === row.table && (r.org ?? '').trim() === org && r.key.trim() === key),
  )
  const got = assumptionLookup(rest, v).get(row.table, splitAssumptionKey(key), path)
  if (!got) return null
  const from = (got.row.org ?? '').trim()
  const whose = from ? `${from}’s` : 'the company’s'
  return {
    value: got.value,
    from: from || 'Company',
    note: `${org} overrides ${whose} value. Remove override to use ${whose} value again; the change is audited.`,
  }
}

/** Finance > Assumptions' write side. */
export function assumptionWrites(p: FinancePrep): AssumptionWrites {
  const { ctx } = p
  const v = p.version
  const edit = writeAccess(ctx, 'editAssumptions')
  const operational = writeAccess(ctx, 'editOperational')
  const fx = writeAccess(ctx, 'setFx')
  const empty = (note: string | null): AssumptionWrites => ({
    versionId: null,
    versionName: null,
    note,
    rule: null,
    edit,
    operational,
    fx,
    tables: [],
    fxForm: null,
  })
  if (p.mode === 'none' || !ctx.access.can('tab:finance.assumptions')) return empty(edit.note)
  if (!edit.shown && !operational.shown && !fx.shown) return empty(edit.note ?? operational.note)
  if (v?.state !== 'working')
    return empty('Changes are made in Working. Pick the Working version to change a value.')
  const rows = versionAssumptions(ctx.all, v)
  const hrbp = operational.shown && !edit.shown
  const tables: EditableTable[] = []
  for (const table of Object.keys(ASSUMPTION_KEYS) as AssumptionTable[]) {
    const def = ASSUMPTION_KEYS[table]
    if (table === 'fx') continue
    const isOperational = OPERATIONAL_TABLES.has(table)
    if (hrbp ? !isOperational : !edit.shown) continue
    if (ctx.mode !== 'hr-admin' && isHrAdminOnly(table)) continue
    const own = hrbp ? (org: string) => ownOrg(ctx, org) : null
    const list = rows.filter((r) => r.table === table)
    const values: EditableValue[] = list
      .filter((r) => !own || own(r.org ?? ''))
      .map((r: AssumptionRow) => ({
        org: (r.org ?? '').trim() || null,
        key: r.key,
        value: r.value,
        note: editNoteOf(ctx, r, v.versionId),
        parent: parentOf(ctx, v, rows, r),
      }))
    const keys = [...new Set(list.map((r) => r.key))].sort()
    tables.push({
      table,
      label: def.label,
      hint: def.note,
      action: hrbp ? 'editOperational' : 'editAssumptions',
      values,
      orgs: orgsOf(ctx, own),
      keys: keys.length ? keys : ['*'],
    })
  }
  const fxRows = rows.filter((r) => r.table === 'fx')
  const fxForm: FxForm | null = fx.shown
    ? {
        currencies: [...new Set(fxRows.map((r) => r.key.split('|')[0]))]
          .filter((c) => c && c !== 'USD')
          .sort(),
        sets: FX_SETS,
        months: monthRange(v.grid.from, v.grid.to),
      }
    : null
  return {
    versionId: v.versionId,
    versionName: v.name,
    note: hrbp ? operational.note : null,
    rule:
      ctx.mode === 'hr-admin' || hrbp
        ? null
        : `A change that moves cost for fewer than ${ctx.guard.rules.minCosted} costed people is refused.`,
    edit,
    operational,
    fx,
    tables,
    fxForm,
  }
}

/* ───────────── Finance > Freezes ───────────── */

/** An org a freeze may hold. */
export interface FreezeOrgOption {
  kind: 'unit' | 'department' | 'costCenter' | 'leader'
  /** The unit, department, cost center or leader position. */
  value: string
  businessUnit: string
  /** "Silicon Engineering", "Design Verification (Silicon Engineering)", "1550-HSZ", "VP Design (Dana Ito)". */
  label: string
}

export interface FreezeWrites {
  create: { access: WriteAccess; orgs: readonly FreezeOrgOption[]; defaultStart: ISODate }
  edit: { access: WriteAccess; freezeIds: readonly string[] }
}

/** Every org a freeze or a target may name: units, departments of a unit, cost centers and leader seats. */
export function orgOptions(ctx: AnalyticsContext): FreezeOrgOption[] {
  const latest = latestRows(ctx.all.positions)
  const names = holderNamesOf(ctx)
  const levels = leaderLevelSet(contextLists(ctx))
  const units = new Map<string, FreezeOrgOption>()
  const depts = new Map<string, FreezeOrgOption>()
  const centers = new Map<string, FreezeOrgOption>()
  const leaders: FreezeOrgOption[] = []
  for (const [id, r] of latest) {
    if (r.status === 'Eliminated') continue
    const u = r.businessUnit
    units.set(u, { kind: 'unit', value: u, businessUnit: u, label: u })
    if (r.department)
      depts.set(`${u}|${r.department}`, {
        kind: 'department',
        value: r.department,
        businessUnit: u,
        label: `${r.department} (${u})`,
      })
    centers.set(`${u}|${r.costCenter}`, {
      kind: 'costCenter',
      value: r.costCenter,
      businessUnit: u,
      label: `${r.costCenter} (${u})`,
    })
    if (isLeaderSeat(r, levels))
      leaders.push({
        kind: 'leader',
        value: id,
        businessUnit: u,
        label: `${r.title ?? id} (${names.get(id) ?? 'vacant'})`,
      })
  }
  const byLabel = (a: FreezeOrgOption, b: FreezeOrgOption) =>
    a.label < b.label ? -1 : a.label > b.label ? 1 : 0
  return [
    ...[...units.values()].sort(byLabel),
    ...[...depts.values()].sort(byLabel),
    ...[...centers.values()].sort(byLabel),
    ...leaders.sort(byLabel),
  ]
}

/** Finance > Freezes' write side. */
export function freezeWrites(p: FinancePrep): FreezeWrites {
  const { ctx } = p
  const create = writeAccess(ctx, 'createFreeze')
  const edit = writeAccess(ctx, 'editFreeze')
  return {
    create: { access: create, orgs: create.shown ? orgOptions(ctx) : [], defaultStart: ctx.asOf },
    edit: {
      access: edit,
      freezeIds: edit.shown ? [...ctx.data.freezes.map((f) => f.freezeId)].sort() : [],
    },
  }
}

/* ───────────── Finance > Reconcile ───────────── */

export interface ReconWrites {
  access: WriteAccess
  /** The open exceptions in view the viewer may mark reviewed (an HRBP: its own unit's). */
  reviewable: readonly string[]
}

/** Whether the viewer may mark an exception reviewed (an HRBP: an exception in its unit). */
export function mayReview(
  p: FinancePrep,
  access: WriteAccess,
  e: { positionId: string | null; employeeId: string | null },
): boolean {
  if (!access.shown) return false
  if (p.ctx.access.decide(actionSurface('recon.review')).access !== 'limited') return true
  const units = viewerOf(p.ctx).hrbpUnits
  const latest = latestRows(p.ctx.all.positions)
  const unit = e.positionId
    ? latest.get(e.positionId)?.businessUnit
    : p.ctx.all.workers.find((w) => w.employeeId === e.employeeId)?.businessUnit
  return !!unit && units.has(unit)
}
