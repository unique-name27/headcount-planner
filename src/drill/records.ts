/**
 * Turns raw drill rows into display tables (docs/PLAN.md 9.5): standard, readable columns per
 * record kind (src/drill/types.ts `DrillRecordMap`), names resolved from the roster, and a hidden
 * position key so a row can open that position's card (`POSITION_KEY`, in place of the template
 * app's person key: HCP plans positions, not people). Counts that lead to more records drill on
 * their own: a position's direct sub-positions and every position below it (./related.ts).
 *
 * Money columns carry exactly one flag (src/charts/types.ts): per-position amounts built from pay or
 * an offer are `pay: true` (plan line amounts, offer amounts, a position's annual cost: HR admin
 * with the switch only), band estimates are `band: true` (never Manager mode), group totals are
 * `cost: true`. Leave fields are `pay: true` too (docs/PLAN.md 5.2: per person only in HR admin
 * with the switch). Every standard column the mode hides (`column:<kind>.<key>`, 8.3) is left out,
 * and so is a view's extra column with that key.
 *
 * Records 8.4 shapes per viewer arrive shaped: a request is a `RequestRecord` (./requestRecord.ts),
 * an audit row an `AuditRow` from `auditView`, a cost group a guarded `CostRow`. Pure (no React);
 * tested in records.test.ts.
 */
import { MODE_LABEL } from '@/access/modes'
import { positionInScope } from '@/access/records'
import type { Column } from '@/charts/types'
import { BAND_LINE_LABEL, type CostRow } from '@/cost/guard'
import type { AnalyticsContext } from '@/data/context'
import { LEVEL_LABELS, type Level } from '@/data/schema'
import { daysBetween, formatMonth } from '@/lib/dates'
import type { Format } from '@/lib/format'
import { timed } from '@/lib/timing'
import { SH_BP } from '@/plan/engine/band'
import { ADJUSTMENT_REASON } from '@/plan/engine/close'
import type { ReconKind } from '@/plan/engine/reconcile'
import type { CostBasis, PlanLine } from '@/plan/types'
import { positionsBelow, positionsBelowSpec, subPositions, subPositionsSpec } from './related'
import { holderNamesOf, seatStateOf, workerNames } from './seats'
import type { DrillKind, DrillRecordMap, DrillSource, DrillSpec } from './types'

/** Hidden keys on every display row. */
export const POSITION_KEY = '__position'
export const ROW_KEY = '__key'
/** Hidden key: the records behind a cell, by column key (a position's sub-positions, the tree below it). */
export const DRILLS_KEY = '__drills'

/** What the records table reads from the analytics context. */
export type DrillContext = Pick<AnalyticsContext, 'positionIndex' | 'asOf' | 'all' | 'showPay'> &
  Partial<Pick<AnalyticsContext, 'showCost' | 'access' | 'plan' | 'versions'>>

export interface DrillTable {
  columns: Column[]
  rows: Record<string, unknown>[]
}

type Row = Record<string, unknown>
type CellDrills = Record<string, DrillSource>

const cellDrills = (r: Row): CellDrills | undefined => r[DRILLS_KEY] as CellDrills | undefined

const C = (key: string, label: string, extra: Partial<Column> = {}): Column => ({ key, label, ...extra })

const levelText = (l: string | null | undefined) => (l ? (LEVEL_LABELS[l as Level] ?? l) : null)
const yesNo = (v: boolean | null | undefined) => (v == null ? null : v ? 'Yes' : 'No')
const personName = (ctx: DrillContext, id: string | null | undefined): string | null =>
  id ? (workerNames(ctx).get(id) ?? id) : null
/** A position as a reader names it: the person in the seat, else its ID. */
const seatLabel = (ctx: DrillContext, id: string | null | undefined): string | null =>
  id ? (holderNamesOf(ctx).get(id) ?? id) : null
const dateOnly = (v: string | null | undefined) => (v ? v.slice(0, 10) : null)
const monthText = (m: string | null | undefined) => (m ? formatMonth(`${m}-01`) : null)
/** Basis points of a standard head as standard heads (`ui:trade-weights`: never USD). */
const heads = (bp: number | null | undefined) => (bp == null ? null : bp / SH_BP)

/* ───────── positions ───────── */

const POSITION_COLUMNS: Column[] = [
  C('positionId', 'Position ID'),
  C('title', 'Title', { freeText: true }),
  C('status', 'Status'),
  C('holder', 'Holder'),
  C('level', 'Level'),
  C('businessUnit', 'Business unit'),
  C('department', 'Department'),
  C('costCenter', 'Cost center'),
  C('location', 'Location'),
  C('workerType', 'Worker type'),
  C('fte', 'FTE', { format: 'num2' }),
  C('plannedStart', 'Planned start', { format: 'date' }),
  C('openedDate', 'Opened', { format: 'date' }),
  C('endDate', 'Last day', { format: 'date' }),
  C('reportsTo', 'Reports to'),
  C('subPositions', 'Reporting positions', { format: 'int' }),
  C('positionsBelow', 'Positions below', { format: 'int' }),
  // Filled by a view's extra values (the standard row has none, so they show only when a view sets them).
  C('standardHeads', 'Standard heads', { format: 'num2' }),
  C('bandEstimate', 'Band estimate (USD)', { format: 'moneyFull', band: true }),
  C('costAnnual', 'Annual cost (USD)', { format: 'moneyFull', pay: true }),
]
/** Tree counts shown only when a listed position has positions under it (they are 0 for everyone else). */
const TREE_COLUMNS = new Set(['subPositions', 'positionsBelow'])

function positionRow(ctx: DrillContext, p: DrillRecordMap['positions']): Row {
  const seat = seatStateOf(ctx, p.positionId)
  const status = seat?.status ?? p.status
  const holder = status === 'Filled' ? (holderNamesOf(ctx).get(p.positionId) ?? null) : null
  const subs = subPositions(ctx, p.positionId).length
  const below = subs ? positionsBelow(ctx, p.positionId).length : 0
  const plannedStart =
    status === 'Open' || status === 'Planned' ? (seat?.plannedStart ?? p.startDate ?? null) : null
  return {
    positionId: p.positionId,
    title: p.title,
    status,
    holder,
    level: levelText(p.level),
    businessUnit: p.businessUnit,
    department: p.department,
    costCenter: p.costCenter,
    location: p.location,
    workerType: p.workerType === 'Employee' ? null : p.workerType,
    fte: p.fte,
    plannedStart,
    openedDate: status === 'Open' ? p.openedDate : null,
    endDate: p.endDate,
    reportsTo: p.managerPositionId
      ? `${p.managerPositionId}${holderNamesOf(ctx).get(p.managerPositionId) ? ` (${holderNamesOf(ctx).get(p.managerPositionId)})` : ''}`
      : null,
    subPositions: subs || null,
    positionsBelow: below || null,
    standardHeads: null,
    bandEstimate: null,
    costAnnual: null,
    ...(subs
      ? {
          [DRILLS_KEY]: {
            subPositions: () => subPositionsSpec(ctx, p.positionId),
            positionsBelow: () => positionsBelowSpec(ctx, p.positionId),
          } satisfies CellDrills,
        }
      : {}),
    [POSITION_KEY]: p.positionId,
    [ROW_KEY]: `${p.positionId}|${p.effectiveDate}`,
  }
}

/* ───────── plan lines ───────── */

const BASIS_WORD: Record<CostBasis, string> = {
  hris: 'HRIS pay',
  offer: 'Accepted offer',
  band: 'Band estimate',
}

const AMOUNT_PARTS = ['Base', 'Bonus', 'Burden', 'Benefits', 'OneTime', 'Vacancy'] as const
const PART_LABEL: Record<(typeof AMOUNT_PARTS)[number] | 'Equity' | 'Loaded', string> = {
  Base: 'base',
  Bonus: 'bonus',
  Burden: 'burden',
  Benefits: 'benefits',
  OneTime: 'one-time',
  Vacancy: 'vacancy allowance',
  Equity: 'equity (SBC)',
  Loaded: 'loaded cost',
}

/** Every per-line amount is one position's amount built from pay or an offer: `pay: true` (8.3). */
const PLAN_LINE_COLUMNS: Column[] = [
  C('positionId', 'Position ID'),
  C('version', 'Version', { freeText: true }),
  C('month', 'Month', { sortValue: (r: Row) => r.monthKey }),
  C('status', 'Status'),
  C('heads', 'Heads', { format: 'int' }),
  C('fte', 'FTE', { format: 'num2' }),
  C('active', 'Active share', { format: 'pct' }),
  C('basis', 'Costed at'),
  C('currency', 'Currency'),
  C('rate', 'USD per 1'),
  ...(['Loaded', ...AMOUNT_PARTS, 'Equity'] as const).map((p) =>
    C(`usd${p}`, `${PART_LABEL[p].charAt(0).toUpperCase()}${PART_LABEL[p].slice(1)} (USD)`, {
      format: 'moneyFull',
      pay: true,
    }),
  ),
  ...AMOUNT_PARTS.map((p) =>
    C(`local${p}`, `${PART_LABEL[p].charAt(0).toUpperCase()}${PART_LABEL[p].slice(1)} (local)`, {
      format: 'num2',
      pay: true,
    }),
  ),
]

function planLineRow(ctx: DrillContext, l: PlanLine, i: number): Row {
  const version = ctx.versions?.find((v) => v.versionId === l.versionId)?.name ?? l.versionId
  return {
    positionId: l.positionId,
    version,
    month: monthText(l.month),
    monthKey: l.month,
    status: l.status,
    heads: l.heads,
    fte: l.fte,
    active: l.active,
    basis: BASIS_WORD[l.basis],
    currency: l.currency,
    rate: Number.isFinite(l.rate) ? String(Number(l.rate.toPrecision(4))) : null,
    usdLoaded: l.usd.loaded,
    usdBase: l.usd.base,
    usdBonus: l.usd.bonus,
    usdBurden: l.usd.burden,
    usdBenefits: l.usd.benefits,
    usdOneTime: l.usd.oneTime,
    usdVacancy: l.usd.vacancy,
    usdEquity: l.usd.equity,
    localBase: l.local.base,
    localBonus: l.local.bonus,
    localBurden: l.local.burden,
    localBenefits: l.local.benefits,
    localOneTime: l.local.oneTime,
    localVacancy: l.local.vacancy,
    [POSITION_KEY]: l.positionId,
    [ROW_KEY]: `${l.versionId}|${l.positionId}|${l.month}|${i}`,
  }
}

/* ───────── assignments and workers ───────── */

const ASSIGNMENT_COLUMNS: Column[] = [
  C('employeeId', 'Employee ID'),
  C('name', 'Name'),
  C('positionId', 'Position ID'),
  C('start', 'Start', { format: 'date' }),
  C('end', 'Last day', { format: 'date' }),
  C('fte', 'FTE', { format: 'num2' }),
  C('workerType', 'Worker type'),
]

const assignmentRow = (ctx: DrillContext, a: DrillRecordMap['assignments'], i: number): Row => ({
  employeeId: a.employeeId,
  name: personName(ctx, a.employeeId),
  positionId: a.positionId,
  start: a.start,
  end: a.end,
  fte: a.fte,
  workerType: a.workerType,
  [POSITION_KEY]: a.positionId,
  [ROW_KEY]: `${a.employeeId}|${a.positionId ?? ''}|${a.start}|${i}`,
})

const WORKER_COLUMNS: Column[] = [
  C('employeeId', 'Employee ID'),
  C('name', 'Name'),
  C('positionId', 'Position ID'),
  C('assignmentStart', 'In the seat from', { format: 'date' }),
  C('assignmentEnd', 'In the seat to', { format: 'date' }),
  C('hireDate', 'Hire date', { format: 'date' }),
  C('terminationDate', 'Last day', { format: 'date' }),
  C('workerType', 'Worker type'),
  C('fte', 'FTE', { format: 'num2' }),
  C('level', 'Level'),
  C('businessUnit', 'Business unit'),
  C('department', 'Department'),
  C('costCenter', 'Cost center'),
  C('location', 'Location'),
  C('legalEntity', 'Legal entity'),
  C('manager', 'Manager'),
  // Leave is one person's pay and leave detail (docs/PLAN.md 5.2, 7.7): HR admin with the switch only.
  C('onLeave', 'On leave', { pay: true }),
  C('leavePaid', 'Paid leave', { pay: true }),
]

const workerRow = (ctx: DrillContext, w: DrillRecordMap['workers'], i: number): Row => ({
  employeeId: w.employeeId,
  name: w.name ?? null,
  positionId: w.positionId ?? null,
  assignmentStart: w.assignmentStart ?? null,
  assignmentEnd: w.assignmentEnd ?? null,
  hireDate: w.hireDate,
  terminationDate: w.terminationDate ?? null,
  workerType: w.workerType,
  fte: w.fte ?? null,
  level: levelText(w.level),
  businessUnit: w.businessUnit ?? null,
  department: w.department ?? null,
  costCenter: w.costCenter ?? null,
  location: w.location ?? null,
  legalEntity: w.legalEntity ?? null,
  manager: personName(ctx, w.managerId),
  onLeave: ctx.showPay ? yesNo(w.onLeave) : null,
  leavePaid: ctx.showPay && w.onLeave ? yesNo(w.leavePaid ?? true) : null,
  [POSITION_KEY]: w.positionId ?? null,
  [ROW_KEY]: `${w.employeeId}|${w.positionId ?? ''}|${w.assignmentStart ?? ''}|${i}`,
})

/* ───────── reqs ───────── */

const REQ_COLUMNS: Column[] = [
  C('reqId', 'Req ID'),
  C('positionId', 'Position ID'),
  C('status', 'Status'),
  C('stage', 'Stage'),
  C('reqType', 'Req type'),
  C('openedDate', 'Opened', { format: 'date' }),
  C('daysOpen', 'Days open', { format: 'int' }),
  C('targetStartDate', 'Target start', { format: 'date' }),
  // An accepted offer shows as a date only outside HR admin with the switch (8.3).
  C('offerAcceptedDate', 'Offer accepted', { format: 'date' }),
  C('startDate', 'Start date', { format: 'date' }),
  C('closedDate', 'Closed', { format: 'date' }),
  C('hiringManager', 'Hiring manager'),
  // Free text from the ATS (M4 recheck EX-3-a): Manager outputs pass it through `managerText`.
  C('recruiter', 'Recruiter', { freeText: true }),
  C('offerBase', 'Offer base (full-time rate)', { format: 'num2', pay: true }),
  C('offerCurrency', 'Offer currency', { pay: true }),
  C('signOnBonus', 'Sign-on bonus', { format: 'num2', pay: true }),
  C('relocation', 'Relocation', { format: 'num2', pay: true }),
  C('agencyFee', 'Agency fee', { format: 'num2', pay: true }),
]

const reqRow = (ctx: DrillContext, r: DrillRecordMap['reqs'], i: number): Row => {
  const open = r.status === 'Open' || r.status === 'On hold'
  return {
    reqId: r.reqId,
    positionId: r.positionId ?? null,
    status: r.status,
    stage: r.stage ?? null,
    reqType: r.reqType ?? null,
    openedDate: r.openedDate,
    daysOpen: open && r.openedDate <= ctx.asOf ? daysBetween(r.openedDate, ctx.asOf) : null,
    targetStartDate: r.targetStartDate ?? null,
    offerAcceptedDate: r.offerAcceptedDate ?? null,
    startDate: r.startDate ?? null,
    closedDate: r.closedDate ?? null,
    hiringManager: personName(ctx, r.hiringManagerId),
    recruiter: r.recruiter ?? null,
    offerBase: ctx.showPay ? (r.offerBase ?? null) : null,
    offerCurrency: ctx.showPay && r.offerBase != null ? (r.offerCurrency ?? null) : null,
    signOnBonus: ctx.showPay ? (r.signOnBonus ?? null) : null,
    relocation: ctx.showPay ? (r.relocation ?? null) : null,
    agencyFee: ctx.showPay ? (r.agencyFee ?? null) : null,
    [POSITION_KEY]: r.positionId ?? null,
    [ROW_KEY]: `${r.reqId}|${i}`,
  }
}

/* ───────── requests (already shaped for the viewer) ───────── */

const STEP_WORD: Record<string, string> = {
  manager: 'Manager',
  hrbp: 'HRBP',
  leader: 'Leader',
  finance: 'Finance',
}

const REQUEST_COLUMNS: Column[] = [
  C('requestId', 'Request ID'),
  C('type', 'Type'),
  C('state', 'State'),
  C('positionId', 'Position ID'),
  C('jobTitle', 'Title', { freeText: true }),
  C('level', 'Level'),
  C('businessUnit', 'Business unit'),
  C('department', 'Department'),
  C('requester', 'Requester'),
  C('reason', 'Reason'),
  C('location', 'Location'),
  C('fte', 'FTE', { format: 'num2' }),
  C('startDate', 'Start or effective date', { format: 'date' }),
  C('submittedAt', 'Submitted', { format: 'date' }),
  C('step', 'Step'),
  C('approver', 'Waiting on'),
  C('daysInStep', 'Days in step', { format: 'int' }),
  C('moving', 'Moving'),
  C('fromPositionId', 'From position'),
  C('toPositionId', 'To position'),
  C('effectiveDate', 'Effective', { format: 'date' }),
  C('gives', 'Gives (standard heads)', { format: 'num2' }),
  C('gets', 'Gets (standard heads)', { format: 'num2' }),
  C('credit', 'Trade credit (standard heads)', { format: 'num2' }),
  C('count', 'Seats received', { format: 'int' }),
  C('bandEstimate', 'Band estimate (USD)', { format: 'moneyFull', band: true }),
  C('reqOpened', 'Req opened', { format: 'date' }),
  C('interviewing', 'Interviewing', { format: 'date' }),
  C('offerAccepted', 'Offer accepted', { format: 'date' }),
  C('started', 'Started', { format: 'date' }),
]

const requestRow = (_ctx: DrillContext, r: DrillRecordMap['requests'], i: number): Row => ({
  requestId: r.requestId,
  type: r.type,
  state: r.state,
  positionId: r.positionId,
  jobTitle: r.jobTitle,
  level: levelText(r.level),
  businessUnit: r.businessUnit,
  department: r.department,
  requester: r.requesterName,
  reason: r.reasonCode,
  location: r.location,
  fte: r.fte,
  startDate: r.startDate,
  submittedAt: dateOnly(r.submittedAt),
  step: r.stepN == null ? null : `${r.stepN}. ${r.stepRole ? STEP_WORD[r.stepRole] : ''}`.trim(),
  approver: r.approverName,
  daysInStep: r.daysInStep,
  moving: r.transferPersonName,
  fromPositionId: r.fromPositionId,
  toPositionId: r.toPositionId ?? r.toManagerPositionId,
  effectiveDate: r.effectiveDate,
  gives: heads(r.giveBp),
  gets: heads(r.getBp),
  credit: heads(r.creditBp),
  count: r.count,
  bandEstimate: r.bandEstimateUsd,
  reqOpened: r.reqOpened,
  interviewing: r.interviewing,
  offerAccepted: r.offerAccepted,
  started: r.started,
  [POSITION_KEY]: r.positionId,
  [ROW_KEY]: `${r.requestId}|${i}`,
})

/* ───────── targets, freezes, assumptions ───────── */

const TARGET_COLUMNS: Column[] = [
  C('fiscalYear', 'Fiscal year'),
  C('targetDate', 'Target date', { format: 'date' }),
  C('businessUnit', 'Business unit'),
  C('department', 'Department'),
  C('costCenter', 'Cost center'),
  C('leader', 'Leader'),
  C('targetHeads', 'Target heads', { format: 'int' }),
  // Target cost is Finance's input, a group figure (floored for HRBP and Leader by the model).
  C('targetCost', 'Target cost (USD)', { format: 'money', cost: true }),
]

const targetRow = (ctx: DrillContext, t: DrillRecordMap['targets'], i: number): Row => ({
  fiscalYear: t.fiscalYear,
  targetDate: t.targetDate ?? null,
  businessUnit: t.businessUnit,
  department: t.department ?? null,
  costCenter: t.costCenter ?? null,
  leader: seatLabel(ctx, t.leaderPositionId),
  targetHeads: t.targetHeads,
  targetCost: t.targetCost ?? null,
  [POSITION_KEY]: t.leaderPositionId ?? null,
  [ROW_KEY]: `${t.fiscalYear}|${t.businessUnit}|${t.department ?? ''}|${t.costCenter ?? ''}|${t.leaderPositionId ?? ''}|${i}`,
})

const FREEZE_COLUMNS: Column[] = [
  C('freezeId', 'Freeze ID'),
  C('businessUnit', 'Business unit'),
  C('department', 'Department'),
  C('costCenter', 'Cost center'),
  C('leader', 'Leader'),
  C('startDate', 'From', { format: 'date' }),
  C('endDate', 'To', { format: 'date' }),
  C('allowBackfill', 'Backfills allowed'),
  C('reason', 'Reason', { freeText: true }),
]

const freezeRow = (ctx: DrillContext, f: DrillRecordMap['freezes'], i: number): Row => ({
  freezeId: f.freezeId,
  businessUnit: f.businessUnit,
  department: f.department ?? null,
  costCenter: f.costCenter ?? null,
  leader: seatLabel(ctx, f.leaderPositionId),
  startDate: f.startDate,
  endDate: f.endDate ?? null,
  allowBackfill: f.allowBackfill ? 'Yes' : 'No',
  reason: f.reason ?? null,
  [POSITION_KEY]: f.leaderPositionId ?? null,
  [ROW_KEY]: `${f.freezeId}|${i}`,
})

const ASSUMPTION_COLUMNS: Column[] = [
  C('version', 'Version', { freeText: true }),
  C('table', 'Table'),
  C('org', 'Org'),
  C('key', 'Key'),
  C('value', 'Value', { format: (r: Row) => (r.valueFormat as Format | undefined) ?? 'num2' }),
]

/** A value in its own precision: whole numbers whole, rates to six places at most. */
const valueFormatOf = (v: number): Format =>
  Number.isInteger(v) ? 'int' : Math.abs(v) >= 1 ? 'num2' : 'text'

const assumptionRow = (_ctx: DrillContext, a: DrillRecordMap['assumptions'], i: number): Row => {
  const format = valueFormatOf(a.value)
  return {
    version: a.version,
    table: a.table,
    org: a.org || 'Company',
    key: a.key,
    value: format === 'text' ? String(Number(a.value.toPrecision(6))) : a.value,
    valueFormat: format,
    [POSITION_KEY]: null,
    [ROW_KEY]: `${a.version}|${a.table}|${a.org ?? ''}|${a.key}|${i}`,
  }
}

/* ───────── versions, adjustments, audit, exceptions ───────── */

const VERSION_KIND_WORD = { budget: 'Budget', reforecast: 'Reforecast', working: 'Working' } as const
const VERSION_STATE_WORD = { working: 'Working', locked: 'Locked', retired: 'Retired' } as const

const VERSION_COLUMNS: Column[] = [
  C('name', 'Version', { freeText: true }),
  C('kind', 'Kind'),
  C('fiscalYear', 'Fiscal year'),
  C('state', 'State'),
  C('proration', 'Proration'),
  C('createdAt', 'Created', { format: 'date' }),
  C('lockedAt', 'Locked', { format: 'date' }),
  C('lockedBy', 'Locked by'),
  C('engineVersion', 'Engine version'),
  C('hash', 'Lock hash'),
]

const versionRow = (ctx: DrillContext, v: DrillRecordMap['versions'], i: number): Row => ({
  name: v.name,
  kind: VERSION_KIND_WORD[v.kind],
  fiscalYear: v.fiscalYear,
  state: VERSION_STATE_WORD[v.state],
  proration: v.proration,
  createdAt: dateOnly(v.createdAt),
  lockedAt: dateOnly(v.lockedAt),
  lockedBy: personName(ctx, v.lockedBy),
  engineVersion: v.engineVersion,
  hash: v.hash,
  [POSITION_KEY]: null,
  [ROW_KEY]: `${v.versionId}|${i}`,
})

const ADJUSTMENT_KIND_WORD = { hire: 'Hire', exit: 'Exit', other: 'Other' } as const

/** Back-dated adjustments by position, with no amount (docs/PLAN.md 6.6: amounts only as sums by posted month). */
const ADJUSTMENT_COLUMNS: Column[] = [
  C('postedIn', 'Posted in', { sortValue: (r: Row) => r.postedKey }),
  C('forMonth', 'For month', { sortValue: (r: Row) => r.forKey }),
  C('positionId', 'Position ID'),
  C('kind', 'Kind'),
  C('reason', 'Reason', { freeText: true }),
]

const adjustmentRow = (_ctx: DrillContext, a: DrillRecordMap['adjustments'], i: number): Row => ({
  postedIn: monthText(a.postedIn),
  postedKey: a.postedIn,
  forMonth: monthText(a.forMonth),
  forKey: a.forMonth,
  positionId: a.positionId,
  kind: ADJUSTMENT_KIND_WORD[a.kind],
  // Generated from the kind, never typed and never naming leave (6.6).
  reason: ADJUSTMENT_REASON[a.kind],
  [POSITION_KEY]: a.positionId,
  [ROW_KEY]: `${a.id}|${i}`,
})

const AUDIT_COLUMNS: Column[] = [
  C('at', 'When', { format: 'date' }),
  C('byName', 'By'),
  C('mode', 'Mode'),
  C('object', 'Record type'),
  C('id', 'Record'),
  C('field', 'Field'),
  C('old', 'From', { freeText: true }),
  C('new', 'To', { freeText: true }),
  C('effectiveDate', 'Effective', { format: 'date' }),
  C('comment', 'Comment', { freeText: true }),
]

/** An audit value as text: `auditView` has already put "changed" in place of pay and cost values. */
function auditValue(v: unknown): string | null {
  if (v == null || v === '') return null
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

const auditRow = (_ctx: DrillContext, e: DrillRecordMap['audit'], i: number): Row => ({
  at: dateOnly(e.at),
  byName: e.byName,
  mode: MODE_LABEL[e.mode] ?? e.mode,
  object: e.object,
  id: e.id,
  field: e.field,
  old: auditValue(e.old),
  new: auditValue(e.new),
  effectiveDate: e.effectiveDate,
  comment: e.comment,
  [POSITION_KEY]: e.object === 'position' ? e.id : null,
  [ROW_KEY]: `${e.at}|${e.object}|${e.id}|${e.field}|${i}`,
})

const RECON_WORD: Record<ReconKind, string> = {
  'not-in-plan': 'Not in plan',
  'cost-center-mismatch': 'Cost-center mismatch',
  'filled-no-assignment': 'Filled with no assignment',
  'assignment-on-open': 'Assignment on a seat not Filled',
  overlap: 'Overlapping assignments',
}

const EXCEPTION_COLUMNS: Column[] = [
  C('kind', 'Exception'),
  C('positionId', 'Position ID'),
  C('employeeId', 'Employee ID'),
  C('detail', 'Detail'),
]

const exceptionRow = (_ctx: DrillContext, x: DrillRecordMap['exceptions'], i: number): Row => ({
  kind: RECON_WORD[x.kind] ?? x.kind,
  positionId: x.positionId,
  employeeId: x.employeeId,
  detail: x.detail,
  [POSITION_KEY]: x.positionId,
  [ROW_KEY]: `${x.id}|${i}`,
})

/* ───────── cost groups (guarded totals, never one person) ───────── */

const COST_GROUP_COLUMNS: Column[] = [
  C('label', 'Group'),
  C('costed', 'Costed people', { format: 'int' }),
  C('totalUsd', 'Loaded cost (USD)', { format: 'money', cost: true }),
  C('bandUsd', `${BAND_LINE_LABEL} (USD)`, { format: 'money', band: true }),
  C('perHeadUsd', 'Per head (USD)', { format: 'money', cost: true }),
  // Components follow `cost:component` (8.3: hidden in HRBP and Leader mode).
  C('base', 'Base (USD)', { format: 'money', cost: true }),
  C('bonus', 'Bonus (USD)', { format: 'money', cost: true }),
  C('burden', 'Burden (USD)', { format: 'money', cost: true }),
  C('benefits', 'Benefits (USD)', { format: 'money', cost: true }),
  C('oneTime', 'One-time (USD)', { format: 'money', cost: true }),
  C('loadedInclSbc', 'Loaded incl. SBC (USD)', { format: 'money', cost: true }),
  C('reason', 'Note'),
]

const costGroupRow = (_ctx: DrillContext, g: CostRow, i: number): Row => {
  const a = g.amounts
  return {
    label: g.label,
    costed: g.costed,
    totalUsd: g.totalUsd,
    bandUsd: g.bandUsd,
    perHeadUsd: g.perHeadUsd,
    base: a.base,
    bonus: a.bonus,
    burden: a.burden,
    benefits: a.benefits,
    oneTime: a.oneTime,
    loadedInclSbc: a.loaded != null && a.equity != null ? a.loaded + a.equity : null,
    reason: g.reason,
    [POSITION_KEY]: null,
    [ROW_KEY]: `${g.key}|${i}`,
  }
}

/* ───────── the Action center ───────── */

/**
 * Action center items: what is open, who it waits on, when it is due and the view it comes from.
 * The About cell opens the item's own records; a row opens the position the item is about.
 */
const ACTION_COLUMNS: Column[] = [
  C('severityLabel', 'Severity'),
  C('what', 'What is open'),
  C('subject', 'About'),
  C('owner', 'Waiting on'),
  C('ownerGroup', 'Owner group'),
  C('due', 'Due date', { format: 'date' }),
  C('dueText', 'Due'),
  C('from', 'From'),
  C('status', 'Status'),
]
const actionRow = (_ctx: DrillContext, r: DrillRecordMap['actionItems'], i: number): Row => ({
  severityLabel: r.severityLabel,
  what: r.what,
  subject: r.subject,
  owner: r.owner,
  ownerGroup: r.ownerGroup,
  due: r.due,
  dueText: r.dueText,
  from: r.from,
  status: r.status,
  ...(r.subjectDrill ? { [DRILLS_KEY]: { subject: r.subjectDrill } satisfies CellDrills } : {}),
  [POSITION_KEY]: r.positionId,
  // By position in the list: an item's id can carry a request ID, which never needs to reach a page.
  [ROW_KEY]: `item-${i}`,
})

/** Action center owners: one row per person, with the count of items that wait on them. */
const ACTION_OWNER_COLUMNS: Column[] = [
  C('owner', 'Waiting on'),
  C('ownerGroup', 'Owner group'),
  C('items', 'Open items', { format: 'int' }),
  C('overdue', 'Overdue', { format: 'int' }),
  C('critical', 'Critical', { format: 'int' }),
]
const actionOwnerRow = (_ctx: DrillContext, r: DrillRecordMap['actionOwners'], i: number): Row => ({
  owner: r.owner,
  ownerGroup: r.ownerGroup,
  items: r.items,
  overdue: r.overdue,
  critical: r.critical,
  ...(r.itemsDrill ? { [DRILLS_KEY]: { items: r.itemsDrill } satisfies CellDrills } : {}),
  [POSITION_KEY]: null,
  [ROW_KEY]: `owner-${i}`,
})

/* ───────── dispatch ───────── */

type RowFn<K extends DrillKind> = (ctx: DrillContext, r: DrillRecordMap[K], i: number) => Row

const KINDS: { [K in DrillKind]: { columns: Column[]; row: RowFn<K>; noun: [string, string] } } = {
  positions: { columns: POSITION_COLUMNS, row: positionRow, noun: ['position', 'positions'] },
  planLines: { columns: PLAN_LINE_COLUMNS, row: planLineRow, noun: ['plan line', 'plan lines'] },
  assignments: { columns: ASSIGNMENT_COLUMNS, row: assignmentRow, noun: ['assignment', 'assignments'] },
  workers: { columns: WORKER_COLUMNS, row: workerRow, noun: ['person', 'people'] },
  reqs: { columns: REQ_COLUMNS, row: reqRow, noun: ['req', 'reqs'] },
  requests: { columns: REQUEST_COLUMNS, row: requestRow, noun: ['request', 'requests'] },
  targets: { columns: TARGET_COLUMNS, row: targetRow, noun: ['target', 'targets'] },
  freezes: { columns: FREEZE_COLUMNS, row: freezeRow, noun: ['freeze', 'freezes'] },
  assumptions: { columns: ASSUMPTION_COLUMNS, row: assumptionRow, noun: ['assumption', 'assumptions'] },
  versions: { columns: VERSION_COLUMNS, row: versionRow, noun: ['version', 'versions'] },
  adjustments: { columns: ADJUSTMENT_COLUMNS, row: adjustmentRow, noun: ['adjustment', 'adjustments'] },
  audit: { columns: AUDIT_COLUMNS, row: auditRow, noun: ['audit entry', 'audit entries'] },
  exceptions: { columns: EXCEPTION_COLUMNS, row: exceptionRow, noun: ['exception', 'exceptions'] },
  costGroups: { columns: COST_GROUP_COLUMNS, row: costGroupRow, noun: ['group', 'groups'] },
  actionItems: { columns: ACTION_COLUMNS, row: actionRow, noun: ['item', 'items'] },
  actionOwners: { columns: ACTION_OWNER_COLUMNS, row: actionOwnerRow, noun: ['owner', 'owners'] },
}

/** Every drill kind, in the order the records panel knows them (the access matrix lists them). */
export const RECORD_KINDS = Object.keys(KINDS) as DrillKind[]

/** A kind's standard column label ("Offer base (full-time rate)"), or null (the matrix names `column:` surfaces with it). */
export const standardColumnLabel = (kind: string, key: string): string | null =>
  (KINDS as Record<string, { columns: Column[] }>)[kind]?.columns.find((c) => c.key === key)?.label ?? null

/** A kind's standard columns (the matrix and the policy tests read them). */
export const standardColumns = (kind: DrillKind): readonly Column[] => KINDS[kind].columns

export function drillNoun(kind: DrillKind, n: number): string {
  const [one, many] = KINDS[kind].noun
  return `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`
}

/**
 * Standard columns the mode leaves out of a kind (docs/PLAN.md 8.3): every column whose
 * `column:<kind>.<key>` surface the mode hides (the policy's `hiddenColumns`: pay columns outside HR
 * admin with the switch, the band estimate in Manager mode, components in HRBP and Leader mode,
 * leave outside HR admin). Only a listed kind's columns are asked: where the kind itself is hidden
 * its records never list. The money flags are applied again by every table and export
 * (`visibleColumns`), so a pay column never shows without the switch whatever the policy says.
 */
export function modeHiddenColumns(kind: DrillKind, access: DrillContext['access']): ReadonlySet<string> {
  if (!access?.can(`drill:${kind}`)) return NO_KEYS
  const out = new Set<string>()
  for (const c of KINDS[kind].columns) if (!access.can(`column:${kind}.${c.key}`)) out.add(c.key)
  return out.size ? out : NO_KEYS
}
const NO_KEYS: ReadonlySet<string> = new Set()

/** Display table for a drill: standard columns for the kind, minus hidden ones, plus extras. */
export const buildDrillTable = (spec: DrillSpec, ctx: DrillContext): DrillTable =>
  timed(`hcp:drill:${spec.kind}`, () => drillTableOf(spec, ctx))

/** The "Counts as" column of a weighted drill (docs/PLAN.md 9.5). */
export const WEIGHT_KEY = 'countsAs'
const WEIGHT_COLUMN: Column = { key: WEIGHT_KEY, label: 'Counts as', format: 'num2', align: 'right' }

function drillTableOf(spec: DrillSpec, ctx: DrillContext): DrillTable {
  const kind = KINDS[spec.kind] as { columns: Column[]; row: RowFn<DrillKind> }
  const modeHidden = modeHiddenColumns(spec.kind, ctx.access)
  const hide = new Set([...(spec.hide ?? []), ...modeHidden])
  // A view's extra column with a standard column's key takes its place, unless the mode hides that key.
  const extraCols = (spec.extra?.columns ?? []).filter((c) => !modeHidden.has(c.key))
  const extraKeys = new Set(extraCols.map((c) => c.key))
  const weight = spec.weight as ((r: unknown) => number) | undefined
  const columns = [
    ...kind.columns.filter((c) => !hide.has(c.key) && !extraKeys.has(c.key)),
    ...extraCols,
    ...(weight && !extraKeys.has(WEIGHT_KEY) ? [WEIGHT_COLUMN] : []),
  ]
  const values = spec.extra?.values as ((r: unknown) => Record<string, unknown>) | undefined
  // Money the mode may not see never reaches a row (tables, exports and the leak crawler read the
  // rows, not only the columns): per-position amounts without the switch, group totals and band
  // estimates where cost does not show.
  // A column the view hides (`spec.hide`) never reaches a row either, unless an extra column of the
  // view takes its key (Plan > Hiring's offer amounts and free text, review HP-4).
  const dropped = new Set(modeHidden)
  for (const k of spec.hide ?? []) if (!extraKeys.has(k)) dropped.add(k)
  for (const c of [...kind.columns, ...extraCols]) {
    if (c.pay && !ctx.showPay) dropped.add(c.key)
    if ((c.cost || c.band) && ctx.showCost === false && !ctx.showPay) dropped.add(c.key)
  }
  const rows = spec.rows.map((r, i) => {
    const record = r as DrillRecordMap[DrillKind]
    const base = kind.row(ctx, record, i)
    const row = values ? { ...base, ...values(r) } : base
    for (const k of dropped) delete row[k]
    if (weight) row[WEIGHT_KEY] = weight(r)
    return row
  })
  // Drop standard columns that are empty in every row (e.g. exit fields on an open list), and the
  // tree counts when no listed position has positions under it.
  const used = columns.filter((c) => {
    if (extraCols.includes(c) || c === WEIGHT_COLUMN) return true
    if (TREE_COLUMNS.has(c.key) && spec.kind === 'positions')
      return rows.some((r) => typeof r[c.key] === 'number' && (r[c.key] as number) > 0)
    return rows.some((r) => r[c.key] != null && r[c.key] !== '')
  })
  // A cell with records behind it opens them; a column's own drill (from the view) wins.
  const linked = (used.length ? used : columns).map((c) =>
    c.drill || !rows.some((r) => cellDrills(r)?.[c.key])
      ? c
      : { ...c, drill: (r: Row) => cellDrills(r)?.[c.key] ?? null },
  )
  return { columns: linked, rows }
}

/**
 * The position a display row opens, when the data has it and it is inside the mode's scope; null
 * when the row opens nothing. In Manager mode only seats strictly below the manager's own open
 * (docs/PLAN.md 8.2, `positionInScope`).
 */
export function rowPosition(
  ctx: Pick<DrillContext, 'positionIndex' | 'all' | 'access'>,
  row: Row,
): string | null {
  const id = row[POSITION_KEY]
  if (typeof id !== 'string' || !id) return null
  if (!ctx.positionIndex.byId.has(id) && !ctx.all.positions.some((p) => p.positionId === id)) return null
  // Without a scope every position opens (`positionInScope` says so too).
  return !ctx.access?.scope || positionInScope(id, ctx.access) ? id : null
}

const ROW_OPENS: Record<DrillKind, string> = {
  positions: 'Select a row to open the position.',
  planLines: 'Select a row to open the position.',
  assignments: 'Select a row to open the position.',
  workers: 'Select a row to open the position the person holds.',
  reqs: 'Select a row to open the position.',
  requests: 'Select a row to open the position it touches.',
  targets: "Select a row to open the leader's position.",
  freezes: "Select a row to open the leader's position.",
  assumptions: '',
  versions: '',
  adjustments: 'Select a row to open the position.',
  audit: 'Select a position row to open the position.',
  exceptions: 'Select a row to open the position.',
  costGroups: '',
  actionItems: 'Select a row to open the position it is about, when it names one.',
  actionOwners: '',
}

/** What selecting a row does, and whether counts in the table open their own records. */
export function drillTableHint(
  kind: DrillKind,
  opts: { rowsOpen: boolean; cellsOpen: boolean },
): string | null {
  const parts = [
    opts.rowsOpen ? ROW_OPENS[kind] || null : null,
    opts.cellsOpen ? 'Underlined counts open their own records.' : null,
  ].filter(Boolean)
  return parts.length ? parts.join(' ') : null
}

/**
 * What the access matrix lists about a drill kind: its standard columns, its noun and what
 * selecting a row opens.
 */
export function drillKindFacts(kind: DrillKind): {
  columns: readonly Column[]
  noun: readonly [string, string]
  rowOpens: string
} {
  return { columns: KINDS[kind].columns, noun: KINDS[kind].noun, rowOpens: ROW_OPENS[kind] }
}

/** The plan-line amount columns, for the export and leak tests (every one `pay: true`). */
export const PLAN_LINE_AMOUNT_KEYS: readonly string[] = PLAN_LINE_COLUMNS.filter((c) => c.pay).map(
  (c) => c.key,
)
