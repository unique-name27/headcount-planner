/**
 * Reading workspace files (docs/PLAN.md 5.5). Hand-written validators: copy known keys only, never
 * spread parsed objects, reject `__proto__`, `constructor` and `prototype` keys anywhere. Refuses a
 * Shareable or Requests file over 25 MB and a Full file over 150 MB (C35), a bad checksum, a newer
 * `version` or a foreign `format`; locked versions must match by hash. Built by engines C in M1. Pure.
 *
 * Order of the checks: size, JSON, unsafe keys, format, version, checksum (over the body exactly as
 * written), then the shape of every part, then locked versions against the workspace's.
 *
 * - A Full file is checked whole, every request included: one bad part refuses the file ("Nothing was
 *   imported"), because Replace and Merge take it all or nothing.
 * - In a Shareable or Requests file, every part is checked except the requests themselves, which are
 *   copied by their known keys only: `requestsOf` validates each one field by field and skips a request
 *   missing a required `requests` field (Import requests and Open a shared file read requests through
 *   it).
 * - A Full file's locked versions must each verify over their own lines (`verifyLock`): a file whose
 *   lines were changed and its checksum written again is refused (`lockBrokenText`, M3 recheck).
 * - A Manager-mode file's `modeLine` (D-MODELINE) reads back only as the Manager export line, on a
 *   file whose mode is 'manager', with no amount in it (`hasAmount`, when the reader passes 8.4 rule
 *   5's grammar); anything else there refuses the file (`brokenPartText('modeLine')`), since a
 *   manager reads it and the checksum covers the body only.
 * - Typed-array columns (a locked version's lines, a close's actual lines) come back as typed arrays.
 *   A locked version's lines read in every form a file holds them (C35): amounts as integer cents
 *   (what file.ts writes now), every number exact (files written before), or a list of lines.
 */
import { APP_NAME } from '@/app/brand'
import type { Atom, AtomIndex } from '@/cost/atoms'
import { isFiscalYear, isMonth } from '@/data/fiscal'
import {
  CYCLE_STAGES,
  DATASET_KEYS,
  DATASETS,
  type DatasetKey,
  type Datasets,
  type FieldDef,
  FX_SETS,
  isMode,
  LEVELS,
  POSITION_STATUSES,
  PRORATIONS,
  REASON_CODES,
  REQUEST_STATES,
  REQUEST_TYPES,
  STEP_DECISIONS,
  STEP_ROLES,
} from '@/data/schema'
import { isIdSecret, isIdTag } from '../actions/requestIds'
import {
  ACTUAL_LINE_NUMBERS,
  PLAN_LINE_NUMBERS,
  toActualLineTable,
  toPlanLineTable,
} from '../engine/lineTable'
import { isLocked, verifyLock } from '../engine/versions'
import type {
  ActualLine,
  ActualLineTable,
  Adjustment,
  AnyVersion,
  AuditEntry,
  AuditObject,
  AuditRow,
  ChainReason,
  ChangeSet,
  CloseRef,
  Comment,
  Cycle,
  DatasetOverlay,
  Decision,
  ForecastMonth,
  ForecastTable,
  FxRate,
  HcRequest,
  JsonValue,
  LocalAmounts,
  LockedVersionRef,
  MonthClose,
  PlanLine,
  PlanLineNumber,
  PlanLineTable,
  PlanState,
  PlanStateSlice,
  Step,
  StringColumn,
  TradeFields,
  TransferFields,
  UsdAmounts,
  WorkspaceBody,
  WorkspaceFile,
  WorkspaceKind,
} from '../types'
import {
  CENT_COLUMNS,
  EXACT_COLUMNS,
  FULL_FILE_NOTICE,
  MAX_FULL_FILE_BYTES,
  MAX_WORKSPACE_BYTES,
  managerModeLine,
  WORKSPACE_FORMAT,
  WORKSPACE_VERSION,
  workspaceChecksum,
} from './file'
import { isScopeKey } from './shared'
import { isIsoStamp } from './stamps'

/** The refusal when a locked version's hash differs: "This file's FY27 Budget does not match this workspace's (hash differs). Nothing was imported." */
export const hashMismatchText = (versionName: string): string =>
  `This file's ${versionName} does not match this workspace's (hash differs). Nothing was imported.`

/**
 * A Full file's locked version whose own lock hash no longer verifies over its lines, assumptions
 * and rates (M3 recheck): "This file's FY27 Budget does not match its own lock (hash differs).
 * Nothing was imported." A checksum re-signed over changed lines still catches damage this way; it
 * proves nothing against forgery (the hashes are the file's own).
 */
export const lockBrokenText = (versionName: string): string =>
  `This file's ${versionName} does not match its own lock (hash differs). Nothing was imported.`

/** The refusal for Import requests on a file of another kind. */
export const NO_REQUESTS_TEXT = 'This file has no requests to merge.'

/** A Shareable or Requests file over 25 MB (C35). */
export const TOO_LARGE_TEXT =
  'This file is larger than 25 MB, the most a Shareable or Requests file can be. Nothing was imported.'
/** A Full file over 150 MB (C35). */
export const FULL_TOO_LARGE_TEXT =
  'This file is larger than 150 MB, the most a Full file can be. Nothing was imported.'
export const NOT_JSON_TEXT = 'This file is not valid JSON. Nothing was imported.'
export const FOREIGN_TEXT = 'This is not a Headcount Planner workspace file. Nothing was imported.'
export const NEWER_TEXT = 'This file was made by a newer version of Headcount Planner. Nothing was imported.'
export const DAMAGED_TEXT =
  'This file is damaged: its checksum does not match its contents. Nothing was imported.'
export const unsafeKeyText = (key: string): string =>
  `This file holds a key that is not allowed ("${key}"). Nothing was imported.`
export const brokenPartText = (path: string): string =>
  `This file is damaged: ${path} is not what a workspace file holds. Nothing was imported.`

/** Keys that could reach an object's prototype; refused anywhere in a file. */
export const UNSAFE_KEYS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype'])

export type ReadResult = { ok: true; file: WorkspaceFile } | { ok: false; reason: string }

/* ───────────── field readers (throw Bad with the path) ───────────── */

class Bad extends Error {
  constructor(readonly path: string) {
    super(path)
  }
}

type Obj = Record<string, unknown>

const isObj = (v: unknown): v is Obj => v !== null && typeof v === 'object' && !Array.isArray(v)

function obj(v: unknown, path: string): Obj {
  if (!isObj(v)) throw new Bad(path)
  return v
}

function list<T>(v: unknown, path: string, each: (x: unknown, path: string) => T): T[] {
  if (!Array.isArray(v)) throw new Bad(path)
  return v.map((x, i) => each(x, `${path}[${i}]`))
}

function str(v: unknown, path: string): string {
  if (typeof v !== 'string') throw new Bad(path)
  return v
}

/** A non-empty string. */
function id(v: unknown, path: string): string {
  if (typeof v !== 'string' || v === '') throw new Bad(path)
  return v
}

const nullable =
  <T>(read: (v: unknown, path: string) => T) =>
  (v: unknown, path: string): T | null =>
    v === null || v === undefined ? null : read(v, path)

const strOrNull = nullable(str)

/** An ISO date or date-time (./stamps.ts `isIsoStamp`, M3 review IN-12): a request's times. */
function stamp(v: unknown, path: string): string {
  const s = str(v, path)
  if (!isIsoStamp(s)) throw new Bad(path)
  return s
}

const stampOrNull = nullable(stamp)

function num(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Bad(path)
  return v
}

const numOrNull = nullable(num)

function bool(v: unknown, path: string): boolean {
  if (typeof v !== 'boolean') throw new Bad(path)
  return v
}

const oneOf =
  <T extends string>(values: readonly T[]) =>
  (v: unknown, path: string): T => {
    if (typeof v !== 'string' || !(values as readonly string[]).includes(v)) throw new Bad(path)
    return v as T
  }

function month(v: unknown, path: string) {
  if (!isMonth(v)) throw new Bad(path)
  return v
}

function fiscalYear(v: unknown, path: string) {
  if (!isFiscalYear(v)) throw new Bad(path)
  return v
}

function mode(v: unknown, path: string) {
  if (!isMode(v)) throw new Bad(path)
  return v
}

/** Any JSON value, rebuilt into fresh plain objects and arrays (unsafe keys left out). */
function json(v: unknown, path: string): JsonValue {
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return v
  if (typeof v === 'number') return num(v, path)
  if (Array.isArray(v)) return v.map((x, i) => json(x, `${path}[${i}]`))
  if (isObj(v)) {
    const out: Record<string, JsonValue> = {}
    for (const k of Object.keys(v)) if (!UNSAFE_KEYS.has(k)) out[k] = json(v[k], `${path}.${k}`)
    return out
  }
  throw new Bad(path)
}

/** A JSON value that may be missing (an audit entry's `old` or `new`): missing stays undefined. */
const jsonOrMissing = (v: unknown, path: string): JsonValue | undefined =>
  v === undefined ? undefined : json(v, path)

/* ───────────── shared vocabularies ───────────── */

const VERSION_KINDS = ['budget', 'reforecast', 'working'] as const
const VERSION_STATES = ['working', 'locked', 'retired'] as const
const BASES = ['hris', 'offer', 'band'] as const
const LEAVE_STATES = ['none', 'paid', 'unpaid'] as const
const STEP_ROLE_CODES = ['manager', 'hrbp', 'leader', 'finance'] as const
const DECISIONS: readonly Decision[] = ['Approved', 'Approved with changes', 'Sent back', 'Rejected']
const CHAIN_REASONS: readonly ChainReason[] = [
  'always',
  'cross-unit',
  'band-estimate-over-threshold',
  'director-plus',
  'out-of-plan',
  'different-direct-reports',
  'new-role',
  'freeze-exception',
  'envelope-exception',
]
const AUDIENCES = ['everyone', 'approvers'] as const
const CHANGEABLE = ['level', 'location', 'fte', 'startDate', 'count'] as const
const AUDIT_OBJECTS: readonly AuditObject[] = [
  'position',
  'request',
  'version',
  'assumption',
  'target',
  'freeze',
  'cycle',
  'close',
  'transfer',
  'workspace',
]
const ATOM_KINDS = ['leader', 'department', 'unit'] as const
const ADJUSTMENT_KINDS = ['hire', 'exit', 'other'] as const
const ADJUSTMENT_REASONS = ['Back-dated hire', 'Back-dated exit', 'Other HRIS change'] as const

/* ───────────── dataset rows ───────────── */

function fieldValue(f: FieldDef, v: unknown, path: string): unknown {
  switch (f.type) {
    case 'number':
    case 'percent':
    case 'money':
      return num(v, path)
    case 'boolean':
      return bool(v, path)
    case 'level':
      return oneOf(LEVELS)(v, path)
    case 'enum':
      return f.values ? oneOf(f.values)(v, path) : str(v, path)
    case 'steps':
      return list(v, path, (s, p) => {
        const o = obj(s, p)
        return {
          role: oneOf(STEP_ROLES)(o.role, `${p}.role`),
          approverId: str(o.approverId, `${p}.approverId`),
          decision: oneOf(STEP_DECISIONS)(o.decision, `${p}.decision`),
          at: strOrNull(o.at, `${p}.at`),
        }
      })
    default:
      return str(v, path)
  }
}

/** One dataset row: the dataset's known fields only, each of its type; a required field must be filled. */
function datasetRow<K extends DatasetKey>(key: K, v: unknown, path: string): Datasets[K][number] {
  const o = obj(v, path)
  const def = DATASETS.find((d) => d.key === key)
  if (!def) throw new Bad(path)
  const out: Obj = {}
  for (const f of def.fields) {
    const x = o[f.key]
    if (x === undefined || x === null) {
      if (f.required) throw new Bad(`${path}.${f.key}`)
      if (x === null) out[f.key] = null
      continue
    }
    out[f.key] = fieldValue(f, x, `${path}.${f.key}`)
  }
  return out as unknown as Datasets[K][number]
}

const rowsOf =
  <K extends DatasetKey>(key: K) =>
  (v: unknown, path: string): Datasets[K][number][] =>
    list(v, path, (r, p) => datasetRow(key, r, p))

function datasets(v: unknown, path: string): Partial<Datasets> {
  const o = obj(v, path)
  const out: Partial<Record<DatasetKey, unknown[]>> = {}
  for (const k of Object.keys(o)) {
    if (!(DATASET_KEYS as readonly string[]).includes(k)) throw new Bad(`${path}.${k}`)
    out[k as DatasetKey] = rowsOf(k as DatasetKey)(o[k], `${path}.${k}`)
  }
  return out as Partial<Datasets>
}

/* ───────────── requests ───────────── */

function step(v: unknown, path: string): Step {
  const o = obj(v, path)
  return {
    n: num(o.n, `${path}.n`),
    role: oneOf(STEP_ROLE_CODES)(o.role, `${path}.role`),
    approverId: str(o.approverId, `${path}.approverId`),
    reasons: list(o.reasons, `${path}.reasons`, oneOf(CHAIN_REASONS)),
    enteredAt: stampOrNull(o.enteredAt, `${path}.enteredAt`),
    decision: nullable(oneOf(DECISIONS))(o.decision, `${path}.decision`),
    at: stampOrNull(o.at, `${path}.at`),
    note: strOrNull(o.note, `${path}.note`),
  }
}

function comment(v: unknown, path: string): Comment {
  const o = obj(v, path)
  return {
    id: str(o.id, `${path}.id`),
    at: stamp(o.at, `${path}.at`),
    by: str(o.by, `${path}.by`),
    mode: mode(o.mode, `${path}.mode`),
    text: str(o.text, `${path}.text`),
    audience: oneOf(AUDIENCES)(o.audience, `${path}.audience`),
  }
}

const changeValue = (v: unknown, path: string): string | number | null =>
  v === null || v === undefined ? null : typeof v === 'number' ? num(v, path) : str(v, path)

function changeSet(v: unknown, path: string): ChangeSet {
  const o = obj(v, path)
  // A trade's credit before and after the change (SC-16, UI-6): kept when present.
  const credit = nullable((x, p) => {
    const e = obj(x, p)
    return { old: numOrNull(e.old, `${p}.old`), new: numOrNull(e.new, `${p}.new`) }
  })(o.credit, `${path}.credit`)
  return {
    by: str(o.by, `${path}.by`),
    at: str(o.at, `${path}.at`),
    reason: str(o.reason, `${path}.reason`),
    changes: list(o.changes, `${path}.changes`, (c, p) => {
      const x = obj(c, p)
      return {
        field: oneOf(CHANGEABLE)(x.field, `${p}.field`),
        old: changeValue(x.old, `${p}.old`),
        new: changeValue(x.new, `${p}.new`),
      }
    }),
    ...(credit ? { credit } : {}),
  }
}

function tradeFields(v: unknown, path: string): TradeFields {
  const o = obj(v, path)
  return {
    givePositionIds: list(o.givePositionIds, `${path}.givePositionIds`, id),
    giveOrgPositionId: strOrNull(o.giveOrgPositionId, `${path}.giveOrgPositionId`),
    creditUsedBp: num(o.creditUsedBp ?? 0, `${path}.creditUsedBp`),
    count: num(o.count, `${path}.count`),
    jobFamily: strOrNull(o.jobFamily, `${path}.jobFamily`),
    partTimeRest: bool(o.partTimeRest ?? false, `${path}.partTimeRest`),
    restFte: numOrNull(o.restFte, `${path}.restFte`),
    rateVersion: strOrNull(o.rateVersion, `${path}.rateVersion`),
    rateHash: strOrNull(o.rateHash, `${path}.rateHash`),
    giveBp: numOrNull(o.giveBp, `${path}.giveBp`),
    getBp: numOrNull(o.getBp, `${path}.getBp`),
    creditBp: numOrNull(o.creditBp, `${path}.creditBp`),
    // Finance's "Move target too?" (SP-5): an imported approval replays the same choice (D-MERGE).
    ...(o.moveTarget === undefined || o.moveTarget === null
      ? {}
      : { moveTarget: bool(o.moveTarget, `${path}.moveTarget`) }),
  }
}

function transferFields(v: unknown, path: string): TransferFields {
  const o = obj(v, path)
  return {
    kind: oneOf(['position', 'internal'] as const)(o.kind, `${path}.kind`),
    personId: id(o.personId, `${path}.personId`),
    fromPositionId: id(o.fromPositionId, `${path}.fromPositionId`),
    toManagerPositionId: strOrNull(o.toManagerPositionId, `${path}.toManagerPositionId`),
    toPositionId: strOrNull(o.toPositionId, `${path}.toPositionId`),
    effectiveDate: str(o.effectiveDate, `${path}.effectiveDate`),
    moveBudget: bool(o.moveBudget ?? false, `${path}.moveBudget`),
  }
}

/** The keys of a request, in HcRequest's order. */
const REQUEST_KEYS = [
  'requestId',
  'type',
  'state',
  'reasonCode',
  'requesterId',
  'submittedById',
  'submittedAt',
  'updatedAt',
  'revisedAt',
  'createdAt',
  'positionId',
  'managerPositionId',
  'businessUnit',
  'department',
  'costCenter',
  'level',
  'location',
  'jobTitle',
  'fte',
  'startDate',
  'priority',
  'cycleId',
  'confidential',
  'exception',
  'steps',
  'comments',
  'changes',
  'trade',
  'transfer',
  'outcome',
] as const satisfies readonly (keyof HcRequest)[]

function request(v: unknown, path: string): HcRequest {
  const o = obj(v, path)
  const submittedAt = stampOrNull(o.submittedAt, `${path}.submittedAt`)
  // The wall-clock stamps a merge compares (M3 recheck): ISO date-times when present, else left out.
  const revisedAt = stampOrNull(o.revisedAt, `${path}.revisedAt`)
  const createdAt = stampOrNull(o.createdAt, `${path}.createdAt`)
  const exception = nullable((x, p) => {
    const e = obj(x, p)
    return { freezeId: str(e.freezeId, `${p}.freezeId`), reason: str(e.reason, `${p}.reason`) }
  })(o.exception, `${path}.exception`)
  const outcome = nullable((x, p) => {
    const e = obj(x, p)
    return {
      createdPositionIds: list(e.createdPositionIds, `${p}.createdPositionIds`, str),
      changedPositionIds: list(e.changedPositionIds, `${p}.changedPositionIds`, str),
    }
  })(o.outcome, `${path}.outcome`)
  return {
    requestId: id(o.requestId, `${path}.requestId`),
    type: oneOf(REQUEST_TYPES)(o.type, `${path}.type`),
    state: oneOf(REQUEST_STATES)(o.state, `${path}.state`),
    reasonCode: oneOf(REASON_CODES)(o.reasonCode, `${path}.reasonCode`),
    requesterId: id(o.requesterId, `${path}.requesterId`),
    submittedById: strOrNull(o.submittedById, `${path}.submittedById`),
    submittedAt,
    // Recommended, not required: a request with no update time loses every tie to one that has it.
    updatedAt: stampOrNull(o.updatedAt, `${path}.updatedAt`) ?? submittedAt ?? '',
    ...(revisedAt ? { revisedAt } : {}),
    ...(createdAt ? { createdAt } : {}),
    positionId: strOrNull(o.positionId, `${path}.positionId`),
    managerPositionId: strOrNull(o.managerPositionId, `${path}.managerPositionId`) ?? '',
    businessUnit: id(o.businessUnit, `${path}.businessUnit`),
    department: strOrNull(o.department, `${path}.department`),
    costCenter: strOrNull(o.costCenter, `${path}.costCenter`),
    level: nullable(oneOf(LEVELS))(o.level, `${path}.level`),
    location: strOrNull(o.location, `${path}.location`),
    jobTitle: strOrNull(o.jobTitle, `${path}.jobTitle`),
    fte: numOrNull(o.fte, `${path}.fte`),
    startDate: strOrNull(o.startDate, `${path}.startDate`),
    priority: numOrNull(o.priority, `${path}.priority`),
    cycleId: strOrNull(o.cycleId, `${path}.cycleId`),
    confidential: bool(o.confidential ?? false, `${path}.confidential`),
    exception,
    steps: list(o.steps ?? [], `${path}.steps`, step),
    comments: list(o.comments ?? [], `${path}.comments`, comment),
    changes: nullable(changeSet)(o.changes, `${path}.changes`),
    trade: nullable(tradeFields)(o.trade, `${path}.trade`),
    transfer: nullable(transferFields)(o.transfer, `${path}.transfer`),
    outcome,
  }
}

/**
 * One request from a file, field by field: null when a required `requests` field (requestId, type,
 * state, reasonCode, requesterId, businessUnit) is missing or any field present has the wrong type.
 * Missing optional fields take their blanks (null, false, []); a missing updatedAt reads the
 * submittedAt, else ''.
 */
export function readRequest(v: unknown): HcRequest | null {
  try {
    return request(v, 'request')
  } catch (e) {
    if (e instanceof Bad) return null
    throw e
  }
}

/** A request copied by its known keys only, unchecked (see the module comment). */
function requestKnownKeys(v: unknown, path: string): HcRequest {
  const out: Obj = {}
  if (isObj(v)) for (const k of REQUEST_KEYS) if (v[k] !== undefined) out[k] = json(v[k], `${path}.${k}`)
  return out as unknown as HcRequest
}

/* ───────────── versions, lines and closes ───────────── */

/**
 * A column of `length` finite numbers (integers in `[0, below)` when `below` is given), read in one
 * loop: a locked version holds about a million numbers, so no path is built unless one is wrong.
 */
function numberArray(v: unknown, path: string, length: number, below?: number): number[] {
  if (!Array.isArray(v) || v.length !== length) throw new Bad(path)
  for (let i = 0; i < v.length; i++) {
    const n: unknown = v[i]
    if (typeof n !== 'number' || !Number.isFinite(n)) throw new Bad(`${path}[${i}]`)
    if (below !== undefined && (!Number.isInteger(n) || n < 0 || n >= below)) throw new Bad(`${path}[${i}]`)
  }
  return v as number[]
}

function stringColumn<T extends string>(
  v: unknown,
  path: string,
  length: number,
  value: (x: unknown, path: string) => T,
): StringColumn<T> {
  const o = obj(v, path)
  const dict = list(o.dict, `${path}.dict`, value)
  const codes = numberArray(o.codes, `${path}.codes`, length, dict.length)
  return { dict, codes: Uint32Array.from(codes) }
}

/** Number columns a file saved before they existed may leave out (read as zeros). */
const OPTIONAL_COLUMNS: ReadonlySet<string> = new Set(['localVacancy', 'usdVacancy'])

function numberColumns<K extends string>(
  v: unknown,
  path: string,
  keys: readonly K[],
  length: number,
): Record<K, Float64Array> {
  const o = obj(v, path)
  const out = {} as Record<K, Float64Array>
  for (const k of keys) {
    // A file saved before the vacancy allowance existed (M1 fix-up) has no vacancy columns: zeros.
    if (o[k] === undefined && OPTIONAL_COLUMNS.has(k)) {
      out[k] = new Float64Array(length)
      continue
    }
    out[k] = Float64Array.from(numberArray(o[k], `${path}.${k}`, length))
  }
  return out
}

/** Amount columns written as integer cents (C35), read back as amounts. */
function centColumns(v: unknown, path: string, length: number): Record<string, Float64Array> {
  const o = obj(v, path)
  const out: Record<string, Float64Array> = {}
  for (const k of CENT_COLUMNS) {
    const col = numberArray(o[k], `${path}.${k}`, length)
    const amounts = new Float64Array(length)
    for (let i = 0; i < length; i++) {
      if (!Number.isSafeInteger(col[i])) throw new Bad(`${path}.${k}[${i}]`)
      amounts[i] = col[i] / 100
    }
    out[k] = amounts
  }
  return out
}

function tableLength(v: unknown, path: string): number {
  const n = num(v, path)
  if (!Number.isInteger(n) || n < 0) throw new Bad(path)
  return n
}

/** A line's local amounts and USD amounts, as a row-form line table writes them. */
function planLine(v: unknown, path: string, versionId: string): PlanLine {
  const o = obj(v, path)
  return {
    positionId: id(o.positionId, `${path}.positionId`),
    versionId,
    month: month(o.month, `${path}.month`),
    holderId: strOrNull(o.holderId, `${path}.holderId`) || null,
    status: oneOf(POSITION_STATUSES)(o.status, `${path}.status`),
    heads: num(o.heads, `${path}.heads`),
    fte: num(o.fte, `${path}.fte`),
    active: num(o.active, `${path}.active`),
    currency: str(o.currency, `${path}.currency`),
    rate: num(o.rate, `${path}.rate`),
    local: localAmounts(o.local, `${path}.local`),
    usd: usdAmounts(o.usd, `${path}.usd`),
    basis: oneOf(BASES)(o.basis, `${path}.basis`),
  }
}

/**
 * A locked version's lines, in any form a file holds them (C35): by column with the amounts as
 * integer cents under `cents` (what the app writes now); by column with every number exact under
 * `numbers` (files written before C35); or as a list of lines (the row form).
 */
function planLineTable(v: unknown, path: string, versionId: string): PlanLineTable {
  if (Array.isArray(v))
    return toPlanLineTable(
      versionId,
      v.map((x, i) => planLine(x, `${path}[${i}]`, versionId)),
    )
  const o = obj(v, path)
  const length = tableLength(o.length, `${path}.length`)
  const numbers =
    o.cents === undefined
      ? numberColumns(o.numbers, `${path}.numbers`, PLAN_LINE_NUMBERS, length)
      : ({
          ...numberColumns(o.numbers, `${path}.numbers`, EXACT_COLUMNS, length),
          ...centColumns(o.cents, `${path}.cents`, length),
        } as Record<PlanLineNumber, Float64Array>)
  return {
    length,
    versionId: str(o.versionId, `${path}.versionId`),
    positionId: stringColumn(o.positionId, `${path}.positionId`, length, str),
    holderId: stringColumn(o.holderId, `${path}.holderId`, length, str),
    month: stringColumn(o.month, `${path}.month`, length, month),
    status: stringColumn(o.status, `${path}.status`, length, oneOf(POSITION_STATUSES)),
    currency: stringColumn(o.currency, `${path}.currency`, length, str),
    basis: stringColumn(o.basis, `${path}.basis`, length, oneOf(BASES)),
    numbers,
  }
}

/** A close's actual lines: by column with every number exact (as written), or as a list of lines. */
function actualLineTable(v: unknown, path: string): ActualLineTable {
  if (Array.isArray(v)) return toActualLineTable(v.map((x, i) => actualLine(x, `${path}[${i}]`)))
  const o = obj(v, path)
  const length = tableLength(o.length, `${path}.length`)
  return {
    length,
    employeeId: stringColumn(o.employeeId, `${path}.employeeId`, length, str),
    positionId: stringColumn(o.positionId, `${path}.positionId`, length, str),
    month: stringColumn(o.month, `${path}.month`, length, month),
    currency: stringColumn(o.currency, `${path}.currency`, length, str),
    leave: stringColumn(o.leave, `${path}.leave`, length, oneOf(LEAVE_STATES)),
    numbers: numberColumns(o.numbers, `${path}.numbers`, ACTUAL_LINE_NUMBERS, length),
  }
}

function localAmounts(v: unknown, path: string): LocalAmounts {
  const o = obj(v, path)
  return {
    base: num(o.base, `${path}.base`),
    bonus: num(o.bonus, `${path}.bonus`),
    burden: num(o.burden, `${path}.burden`),
    benefits: num(o.benefits, `${path}.benefits`),
    oneTime: num(o.oneTime, `${path}.oneTime`),
    // Absent in a file saved before the vacancy allowance existed (M1 fix-up): 0.
    vacancy: o.vacancy === undefined ? 0 : num(o.vacancy, `${path}.vacancy`),
  }
}

function usdAmounts(v: unknown, path: string): UsdAmounts {
  const o = obj(v, path)
  return {
    ...localAmounts(o, path),
    equity: num(o.equity, `${path}.equity`),
    loaded: num(o.loaded, `${path}.loaded`),
  }
}

function fxRate(v: unknown, path: string): FxRate {
  const o = obj(v, path)
  return {
    currency: str(o.currency, `${path}.currency`),
    set: oneOf(FX_SETS)(o.set, `${path}.set`),
    month: month(o.month, `${path}.month`),
    usdPerLocal: num(o.usdPerLocal, `${path}.usdPerLocal`),
  }
}

function cohort(v: unknown, path: string) {
  const o = obj(v, path)
  return {
    headsAtStart: num(o.headsAtStart, `${path}.headsAtStart`),
    modeledExits: num(o.modeledExits, `${path}.modeledExits`),
  }
}

function forecastMonth(v: unknown, path: string): ForecastMonth {
  const o = obj(v, path)
  const cohorts = obj(o.cohorts, `${path}.cohorts`)
  const cost = obj(o.cost, `${path}.cost`)
  return {
    month: month(o.month, `${path}.month`),
    closed: bool(o.closed, `${path}.closed`),
    heads: num(o.heads, `${path}.heads`),
    fte: num(o.fte, `${path}.fte`),
    starts: num(o.starts, `${path}.starts`),
    knownExits: num(o.knownExits, `${path}.knownExits`),
    modeledExits: num(o.modeledExits, `${path}.modeledExits`),
    backfills: num(o.backfills, `${path}.backfills`),
    cohorts: {
      hris: cohort(cohorts.hris, `${path}.cohorts.hris`),
      band: cohort(cohorts.band, `${path}.cohorts.band`),
    },
    cost: {
      filled: usdAmounts(cost.filled, `${path}.cost.filled`),
      band: usdAmounts(cost.band, `${path}.cost.band`),
    },
  }
}

function forecastTable(v: unknown, path: string): ForecastTable {
  const o = obj(v, path)
  const yearEnd = obj(o.yearEnd, `${path}.yearEnd`)
  return {
    asOf: str(o.asOf, `${path}.asOf`),
    closedThrough: nullable(month)(o.closedThrough, `${path}.closedThrough`),
    months: list(o.months, `${path}.months`, forecastMonth),
    unfilledAtHorizon: num(o.unfilledAtHorizon, `${path}.unfilledAtHorizon`),
    yearEnd: {
      heads: num(yearEnd.heads, `${path}.yearEnd.heads`),
      cost: usdAmounts(yearEnd.cost, `${path}.yearEnd.cost`),
    },
  }
}

function version(v: unknown, path: string): AnyVersion {
  const o = obj(v, path)
  const grid = obj(o.grid, `${path}.grid`)
  const state = oneOf(VERSION_STATES)(o.state, `${path}.state`)
  const head = {
    versionId: id(o.versionId, `${path}.versionId`),
    name: str(o.name, `${path}.name`),
    fiscalYear: fiscalYear(o.fiscalYear, `${path}.fiscalYear`),
    grid: { from: month(grid.from, `${path}.grid.from`), to: month(grid.to, `${path}.grid.to`) },
    proration: oneOf(PRORATIONS)(o.proration, `${path}.proration`),
    createdAt: str(o.createdAt, `${path}.createdAt`),
    engineVersion: str(o.engineVersion, `${path}.engineVersion`),
    parentId: strOrNull(o.parentId, `${path}.parentId`),
  }
  if (state === 'locked') {
    return {
      ...head,
      kind: oneOf(['budget', 'reforecast'] as const)(o.kind, `${path}.kind`),
      state,
      lockedAt: str(o.lockedAt, `${path}.lockedAt`),
      lockedBy: str(o.lockedBy, `${path}.lockedBy`),
      hash: id(o.hash, `${path}.hash`),
      lines: planLineTable(o.lines, `${path}.lines`, head.versionId),
      assumptions: rowsOf('assumptions')(o.assumptions, `${path}.assumptions`),
      rates: list(o.rates, `${path}.rates`, fxRate),
      forecast: nullable(forecastTable)(o.forecast, `${path}.forecast`),
    }
  }
  if (o.hash !== null && o.hash !== undefined) throw new Bad(`${path}.hash`)
  return {
    ...head,
    kind: oneOf(VERSION_KINDS)(o.kind, `${path}.kind`),
    state,
    lockedAt: strOrNull(o.lockedAt, `${path}.lockedAt`),
    lockedBy: strOrNull(o.lockedBy, `${path}.lockedBy`),
    hash: null,
  }
}

function lockedVersionRef(v: unknown, path: string): LockedVersionRef {
  const o = obj(v, path)
  return {
    versionId: id(o.versionId, `${path}.versionId`),
    name: str(o.name, `${path}.name`),
    kind: oneOf(VERSION_KINDS)(o.kind, `${path}.kind`),
    fiscalYear: fiscalYear(o.fiscalYear, `${path}.fiscalYear`),
    state: oneOf(VERSION_STATES)(o.state, `${path}.state`),
    hash: strOrNull(o.hash, `${path}.hash`),
  }
}

function atom(v: unknown, path: string): Atom {
  const o = obj(v, path)
  return {
    atomId: id(o.atomId, `${path}.atomId`),
    kind: oneOf(ATOM_KINDS)(o.kind, `${path}.kind`),
    leaderPositionId: strOrNull(o.leaderPositionId, `${path}.leaderPositionId`),
    businessUnit: str(o.businessUnit, `${path}.businessUnit`),
    department: strOrNull(o.department, `${path}.department`),
    positionIds: list(o.positionIds, `${path}.positionIds`, str),
  }
}

function atomIndexOf(v: unknown, path: string): AtomIndex {
  const o = obj(v, path)
  const by = obj(o.byPosition, `${path}.byPosition`)
  // As src/cost/atoms.ts builds it: no prototype, so no position ID can reach one.
  const byPosition = Object.create(null) as Record<string, string>
  for (const k of Object.keys(by)) byPosition[k] = str(by[k], `${path}.byPosition.${k}`)
  return {
    closeDate: str(o.closeDate, `${path}.closeDate`),
    atoms: list(o.atoms, `${path}.atoms`, atom),
    byPosition,
  }
}

function monthClose(v: unknown, path: string): MonthClose {
  const o = obj(v, path)
  return {
    month: month(o.month, `${path}.month`),
    closedAt: str(o.closedAt, `${path}.closedAt`),
    by: str(o.by, `${path}.by`),
    lines: actualLineTable(o.lines, `${path}.lines`),
    atoms: atomIndexOf(o.atoms, `${path}.atoms`),
    hash: id(o.hash, `${path}.hash`),
  }
}

function closeRef(v: unknown, path: string): CloseRef {
  const o = obj(v, path)
  return {
    month: month(o.month, `${path}.month`),
    closedAt: str(o.closedAt, `${path}.closedAt`),
    hash: str(o.hash, `${path}.hash`),
  }
}

function actualLine(v: unknown, path: string): ActualLine {
  const o = obj(v, path)
  return {
    employeeId: str(o.employeeId, `${path}.employeeId`),
    positionId: strOrNull(o.positionId, `${path}.positionId`),
    month: month(o.month, `${path}.month`),
    heads: num(o.heads, `${path}.heads`),
    fte: num(o.fte, `${path}.fte`),
    active: num(o.active, `${path}.active`),
    currency: str(o.currency, `${path}.currency`),
    rate: num(o.rate, `${path}.rate`),
    local: localAmounts(o.local, `${path}.local`),
    usd: usdAmounts(o.usd, `${path}.usd`),
    leave: oneOf(LEAVE_STATES)(o.leave, `${path}.leave`),
  }
}

function adjustment(v: unknown, path: string): Adjustment {
  const o = obj(v, path)
  return {
    id: id(o.id, `${path}.id`),
    postedIn: month(o.postedIn, `${path}.postedIn`),
    forMonth: month(o.forMonth, `${path}.forMonth`),
    positionId: strOrNull(o.positionId, `${path}.positionId`),
    kind: oneOf(ADJUSTMENT_KINDS)(o.kind, `${path}.kind`),
    delta: actualLine(o.delta, `${path}.delta`),
    reason: oneOf(ADJUSTMENT_REASONS)(o.reason, `${path}.reason`),
  }
}

function cycle(v: unknown, path: string): Cycle {
  const o = obj(v, path)
  const dates = obj(o.dates, `${path}.dates`)
  return {
    cycleId: id(o.cycleId, `${path}.cycleId`),
    fiscalYear: fiscalYear(o.fiscalYear, `${path}.fiscalYear`),
    stage: oneOf(CYCLE_STAGES)(o.stage, `${path}.stage`),
    openedAt: str(o.openedAt, `${path}.openedAt`),
    openedBy: str(o.openedBy, `${path}.openedBy`),
    dates: {
      asksDue: str(dates.asksDue, `${path}.dates.asksDue`),
      hrbpReviewDue: strOrNull(dates.hrbpReviewDue, `${path}.dates.hrbpReviewDue`),
      leaderReviewDue: strOrNull(dates.leaderReviewDue, `${path}.dates.leaderReviewDue`),
      financeReviewDue: strOrNull(dates.financeReviewDue, `${path}.dates.financeReviewDue`),
    },
    hrbpDone: list(o.hrbpDone, `${path}.hrbpDone`, str),
    leaderDone: list(o.leaderDone, `${path}.leaderDone`, str),
    cutLines: list(o.cutLines, `${path}.cutLines`, (c, p) => {
      const x = obj(c, p)
      return {
        businessUnit: str(x.businessUnit, `${p}.businessUnit`),
        afterHeads: num(x.afterHeads, `${p}.afterHeads`),
      }
    }),
    // Each unit's ranked order (`action:cycle.rank`, M3): absent in files made before it, and left
    // out of the read cycle when absent, so such a file reads back as it was built.
    ...(o.order === undefined || o.order === null
      ? {}
      : {
          order: list(o.order, `${path}.order`, (c, p) => {
            const x = obj(c, p)
            return {
              businessUnit: str(x.businessUnit, `${p}.businessUnit`),
              requestIds: list(x.requestIds, `${p}.requestIds`, id),
            }
          }),
        }),
    lockedAt: strOrNull(o.lockedAt, `${path}.lockedAt`),
    lockedBy: strOrNull(o.lockedBy, `${path}.lockedBy`),
  }
}

/* ───────────── audit ───────────── */

function auditRow(v: unknown, path: string): AuditRow {
  const o = obj(v, path)
  const row: AuditRow = {
    at: str(o.at, `${path}.at`),
    by: str(o.by, `${path}.by`),
    byName: str(o.byName, `${path}.byName`),
    mode: mode(o.mode, `${path}.mode`),
    object: oneOf(AUDIT_OBJECTS)(o.object, `${path}.object`),
    id: str(o.id, `${path}.id`),
    field: str(o.field, `${path}.field`),
    old: jsonOrMissing(o.old, `${path}.old`),
    new: jsonOrMissing(o.new, `${path}.new`),
    effectiveDate: strOrNull(o.effectiveDate, `${path}.effectiveDate`),
    comment: strOrNull(o.comment, `${path}.comment`),
    commentAudience: nullable(oneOf(AUDIENCES))(o.commentAudience, `${path}.commentAudience`),
  }
  return row
}

function auditEntry(v: unknown, path: string): AuditEntry {
  const o = obj(v, path)
  const seq = num(o.seq, `${path}.seq`)
  if (!Number.isInteger(seq) || seq < 1) throw new Bad(`${path}.seq`)
  return {
    seq,
    ...auditRow(o, path),
    prevHash: str(o.prevHash, `${path}.prevHash`),
    hash: str(o.hash, `${path}.hash`),
  }
}

/* ───────────── plan state and slices ───────────── */

function overlay(v: unknown, path: string): DatasetOverlay {
  const o = obj(v, path)
  // Rows Remove override took back (M3 recheck): read like assumption rows, absent when none.
  const removed =
    o.removedAssumptions === undefined || o.removedAssumptions === null
      ? []
      : rowsOf('assumptions')(o.removedAssumptions, `${path}.removedAssumptions`)
  return {
    positions: rowsOf('positions')(o.positions ?? [], `${path}.positions`),
    targets: rowsOf('targets')(o.targets ?? [], `${path}.targets`),
    freezes: rowsOf('freezes')(o.freezes ?? [], `${path}.freezes`),
    assumptions: rowsOf('assumptions')(o.assumptions ?? [], `${path}.assumptions`),
    ...(removed.length ? { removedAssumptions: removed } : {}),
  }
}

/** A whole plan state, every part checked (a Full file, and the store's own state). */
export function planState(v: unknown, path: string): PlanState {
  const o = obj(v, path)
  if (o.v !== 1) throw new Bad(`${path}.v`)
  return {
    v: 1,
    baselineId: strOrNull(o.baselineId, `${path}.baselineId`),
    versions: list(o.versions ?? [], `${path}.versions`, version),
    closes: list(o.closes ?? [], `${path}.closes`, monthClose),
    adjustments: list(o.adjustments ?? [], `${path}.adjustments`, adjustment),
    overlay: overlay(o.overlay ?? {}, `${path}.overlay`),
    requests: list(o.requests ?? [], `${path}.requests`, request),
    cycles: list(o.cycles ?? [], `${path}.cycles`, cycle),
    reviewed: list(o.reviewed ?? [], `${path}.reviewed`, (r, p) => {
      const x = obj(r, p)
      return {
        exceptionId: str(x.exceptionId, `${p}.exceptionId`),
        at: str(x.at, `${p}.at`),
        by: str(x.by, `${p}.by`),
      }
    }),
    mergeBase: list(o.mergeBase ?? [], `${path}.mergeBase`, (r, p) => {
      const x = obj(r, p)
      return { requestId: str(x.requestId, `${p}.requestId`), updatedAt: str(x.updatedAt, `${p}.updatedAt`) }
    }),
    auditHead: nullable((h, p) => {
      const x = obj(h, p)
      return { seq: num(x.seq, `${p}.seq`), hash: str(x.hash, `${p}.hash`) }
    })(o.auditHead, `${path}.auditHead`),
    // The workspace's request ID tag (D-ID): absent in a state made before it, and left out then.
    ...(o.idTag === undefined || o.idTag === null
      ? {}
      : {
          idTag: ((t: unknown, p: string): string => {
            if (!isIdTag(t)) throw new Bad(p)
            return t
          })(o.idTag, `${path}.idTag`),
        }),
    // The workspace's request ID secret (M3 recheck): absent in a state made before it.
    ...(o.idSecret === undefined || o.idSecret === null
      ? {}
      : {
          idSecret: ((t: unknown, p: string): string => {
            if (!isIdSecret(t)) throw new Bad(p)
            return t
          })(o.idSecret, `${path}.idSecret`),
        }),
  }
}

function slice(v: unknown, path: string, kind: WorkspaceKind): PlanStateSlice {
  const o = obj(v, path)
  if (o.kind !== kind) throw new Bad(`${path}.kind`)
  if (kind === 'full') {
    return {
      kind,
      state: planState(o.state, `${path}.state`),
      audit: list(o.audit ?? [], `${path}.audit`, auditEntry),
    }
  }
  const requests = list(o.requests, `${path}.requests`, requestKnownKeys)
  if (kind === 'requests') return { kind, requests }
  const models = obj(o.models ?? {}, `${path}.models`)
  const cleanModels: Record<string, JsonValue> = {}
  for (const k of Object.keys(models)) cleanModels[k] = json(models[k], `${path}.models.${k}`)
  return {
    kind,
    requests,
    cycles: list(o.cycles ?? [], `${path}.cycles`, cycle),
    versions: list(o.versions ?? [], `${path}.versions`, lockedVersionRef),
    closes: list(o.closes ?? [], `${path}.closes`, closeRef),
    audit: list(o.audit ?? [], `${path}.audit`, auditRow),
    models: cleanModels,
  }
}

/* ───────────── reading a file ───────────── */

/**
 * Whether a file's header, the text before its `"body"` key (in the first 64 KB), says it is a Full
 * file. The app writes the header first (file.ts `serializeWorkspace`); a quote inside a JSON string
 * is escaped, so a label cannot spell the key.
 */
function headerSaysFull(text: string): boolean {
  const head = text.slice(0, 65_536)
  const body = head.indexOf('"body"')
  return /"kind"\s*:\s*"full"/.test(body < 0 ? head : head.slice(0, body))
}

/** JSON.parse that notes the first unsafe key anywhere in the text. */
function parseJson(text: string): { ok: true; value: unknown; unsafe: string | null } | { ok: false } {
  let unsafe: string | null = null
  try {
    const value = JSON.parse(text, (key: string, v: unknown) => {
      if (unsafe === null && UNSAFE_KEYS.has(key)) unsafe = key
      return v
    })
    return { ok: true, value, unsafe }
  } catch {
    return { ok: false }
  }
}

/** Every locked version a file names: its refs, a Full file's locked versions and a Shareable file's refs. */
function lockedRefsOf(file: WorkspaceFile): LockedVersionRef[] {
  const refs: LockedVersionRef[] = [...file.body.lockedVersions]
  const plan = file.body.plan
  if (plan.kind === 'full')
    for (const v of plan.state.versions)
      refs.push({
        versionId: v.versionId,
        name: v.name,
        kind: v.kind,
        fiscalYear: v.fiscalYear,
        state: v.state,
        hash: v.hash,
      })
  if (plan.kind === 'shareable') refs.push(...plan.versions)
  return refs.filter((r) => r.state === 'locked' && r.hash)
}

/** The first locked version in the file whose hash differs from the workspace's copy of it; null when all match. */
export function lockedMismatch(
  file: WorkspaceFile,
  workspaceLocked: readonly LockedVersionRef[],
): LockedVersionRef | null {
  const ours = workspaceLocked.filter((r) => r.state === 'locked' && r.hash)
  for (const theirs of lockedRefsOf(file)) {
    const same = ours.find(
      (r) =>
        r.versionId === theirs.versionId ||
        (r.kind === 'budget' && theirs.kind === 'budget' && r.fiscalYear === theirs.fiscalYear),
    )
    if (same && same.hash !== theirs.hash) return theirs
  }
  return null
}

/**
 * Parses and validates a workspace file's text (`sizeBytes` is the file's size on disk). Refusal
 * reasons are one plain sentence each: too large, not JSON, not a workspace file (foreign format), made
 * by a newer version, damaged (checksum), unsafe key, or `hashMismatchText` against `workspaceLocked`
 * (a locked version in both with different hashes).
 */
export function readWorkspace(
  text: string,
  sizeBytes: number,
  workspaceLocked: readonly LockedVersionRef[],
  /** 8.4 rule 5's amount grammar (src/access/visibility.ts `hasAmount`), for the header's mode line. */
  opts: { hasAmount?: (text: string) => boolean } = {},
): ReadResult {
  // Size first (C35): 25 MB for a Shareable or Requests file, 150 MB for a Full file. Over 25 MB
  // only a file whose header says Full is read on, and its kind is checked again once parsed.
  const size = Math.max(sizeBytes, text.length)
  const large = size > MAX_WORKSPACE_BYTES
  if (large) {
    if (!headerSaysFull(text)) return { ok: false, reason: TOO_LARGE_TEXT }
    if (size > MAX_FULL_FILE_BYTES) return { ok: false, reason: FULL_TOO_LARGE_TEXT }
  }
  const parsed = parseJson(text)
  if (!parsed.ok) return { ok: false, reason: NOT_JSON_TEXT }
  if (parsed.unsafe !== null) return { ok: false, reason: unsafeKeyText(parsed.unsafe) }
  const raw = parsed.value
  if (large && (!isObj(raw) || raw.kind !== 'full')) return { ok: false, reason: TOO_LARGE_TEXT }
  if (!isObj(raw) || raw.format !== WORKSPACE_FORMAT || raw.app !== APP_NAME)
    return { ok: false, reason: FOREIGN_TEXT }
  if (typeof raw.version !== 'number' || !Number.isInteger(raw.version) || raw.version < 1)
    return { ok: false, reason: FOREIGN_TEXT }
  if (raw.version > WORKSPACE_VERSION) return { ok: false, reason: NEWER_TEXT }
  if (!isObj(raw.body) || typeof raw.checksum !== 'string')
    return { ok: false, reason: brokenPartText('body') }
  let checksum: string
  try {
    checksum = workspaceChecksum(raw.body as unknown as WorkspaceBody)
  } catch {
    return { ok: false, reason: DAMAGED_TEXT }
  }
  if (checksum !== raw.checksum) return { ok: false, reason: DAMAGED_TEXT }
  let file: WorkspaceFile
  try {
    const kind = oneOf(['shareable', 'full', 'requests'] as const)(raw.kind, 'kind')
    const body = raw.body
    if (kind !== 'full' && body.datasets !== undefined) throw new Bad('body.datasets')
    const madeIn = mode(raw.mode, 'mode')
    let modeLine: string | null = null
    if (raw.modeLine !== undefined) {
      const line = raw.modeLine
      if (madeIn !== 'manager' || !managerModeLine(line) || opts.hasAmount?.(line)) throw new Bad('modeLine')
      modeLine = line
    }
    file = {
      format: WORKSPACE_FORMAT,
      version: WORKSPACE_VERSION,
      kind,
      ...(kind === 'full' ? { notice: FULL_FILE_NOTICE } : {}),
      ...(modeLine !== null ? { modeLine } : {}),
      savedAt: str(raw.savedAt, 'savedAt'),
      app: APP_NAME,
      mode: madeIn,
      scopeLabel: str(raw.scopeLabel, 'scopeLabel'),
      // The scope identity is copied only when it is one this app writes; anything else is left out,
      // so the file opens with no figures (./shared.ts).
      ...(isScopeKey(raw.scopeKey) ? { scopeKey: raw.scopeKey } : {}),
      actingAs: bool(raw.actingAs, 'actingAs'),
      checksum,
      body: {
        ...(kind === 'full' && body.datasets !== undefined
          ? { datasets: datasets(body.datasets, 'body.datasets') }
          : {}),
        plan: slice(body.plan, 'body.plan', kind),
        lockedVersions: list(body.lockedVersions, 'body.lockedVersions', lockedVersionRef),
      },
    }
  } catch (e) {
    if (e instanceof Bad) return { ok: false, reason: brokenPartText(e.path) }
    throw e
  }
  const mismatch = lockedMismatch(file, workspaceLocked)
  if (mismatch) return { ok: false, reason: hashMismatchText(mismatch.name) }
  // Every locked version a Full file holds must verify over its own lines (M3 recheck): a file whose
  // lines changed and whose checksum was written again is refused, never taken by Replace or Merge.
  const plan = file.body.plan
  if (plan.kind === 'full') {
    const broken = plan.state.versions.find((v) => isLocked(v) && !verifyLock(v))
    if (broken) return { ok: false, reason: lockBrokenText(broken.name) }
  }
  return { ok: true, file }
}

/**
 * The requests Import requests reads from a file already read: `body.plan.requests` of a 'requests' or
 * 'shareable' file, each validated field by field, a request missing a required `requests` field
 * skipped; any other kind is refused with NO_REQUESTS_TEXT.
 */
export function requestsOf(
  file: WorkspaceFile,
): { ok: true; kind: WorkspaceKind; requests: HcRequest[]; skipped: number } | { ok: false; reason: string } {
  const plan = file.body.plan
  if (plan.kind !== 'requests' && plan.kind !== 'shareable') return { ok: false, reason: NO_REQUESTS_TEXT }
  const requests: HcRequest[] = []
  let skipped = 0
  for (const raw of plan.requests as readonly unknown[]) {
    const req = readRequest(raw)
    if (req) requests.push(req)
    else skipped++
  }
  return { ok: true, kind: plan.kind, requests, skipped }
}
